import * as THREE from 'three';
import { disposeObject } from '../../assets/ModelKit';
import type { EnemyType } from '../../data/enemies';
import type { World } from '../../game/World';
import { distance, rand } from '../../utils/math';
import type { Difficulty } from '../Enemy';
import { BossEnemy } from './BossEnemy';

type Attack = 'bolts' | 'summon' | 'bones';
type Phase = { kind: 'walk' } | { kind: Attack; step: number };

/** Attack rotation per phase: summoning is always the opener. */
const ROTATIONS: readonly (readonly Attack[])[] = [
  ['summon', 'bolts', 'bones', 'bolts'],
  ['summon', 'bones', 'bolts', 'summon', 'bolts'],
  ['summon', 'bolts', 'bones', 'summon', 'bones'],
];
const MINIONS: readonly EnemyType[] = ['skeleton', 'wraith', 'deathKnight'];
const MAX_MINIONS = 9;
/** While this many summons live, the Necromancer hides behind a bone shield. */
const SHIELD_MINIONS = 3;
const SHIELD_DAMAGE = 0.25;
const KEEP_MIN = 5;
const KEEP_MAX = 9;
const SUMMON_RAISE = 0.53; // Punch clip: the dead rise on frame 16
const UNDEAD = 0x5dff7a;

/**
 * Stage boss (room 20, 40, …): the Necromancer, Lord of the Dead. Keeps its distance and blinks
 * away when cornered, rains soul bolts and bone eruptions — but its real weapon is the host it
 * raises: skeletons, wraiths and, as it weakens, Death Knights. While three or more summons stand,
 * a bone shield cuts the damage it takes by 75% — clear the minions to break it.
 */
export class Necromancer extends BossEnemy {
  private phase: Phase = { kind: 'walk' };
  private attackIndex = 0;
  private blinkCooldown = 3;
  private shielded = false;
  private strafe = Math.random() < 0.5 ? 1 : -1;
  private readonly shield: THREE.Mesh;
  private readonly shieldMaterial: THREE.MeshBasicMaterial;
  private readonly glow: THREE.MeshStandardMaterial[];
  private readonly glowBase: number[];

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('necromancer', 'necromancer', x, z, difficulty);
    this.timer = 1.2;
    this.shieldMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(UNDEAD).multiplyScalar(1.4), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true,
    });
    this.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 1), this.shieldMaterial);
    this.shield.visible = false;
    this.glow = this.model.materialsNamed('Glow', 'Eye');
    this.glowBase = this.glow.map((m) => m.emissiveIntensity);
  }

  override get damageTakenMul(): number {
    return this.shielded ? SHIELD_DAMAGE : 1;
  }

  override get sceneObjects(): THREE.Object3D[] {
    return [...super.sceneObjects, this.shield];
  }

  override die(): void {
    super.die();
    this.shielded = false;
  }

  override dispose(): void {
    super.dispose();
    disposeObject(this.shield);
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    const target = this.shielded && !this.dead ? 0.35 + Math.sin(this.t * 5) * 0.08 : 0;
    this.shieldMaterial.opacity += (target - this.shieldMaterial.opacity) * Math.min(1, dt * 6);
    this.shield.visible = this.shieldMaterial.opacity > 0.01;
    this.shield.position.set(this.x, 2.2, this.z);
    this.shield.rotation.y += dt * 0.6;
    this.shield.rotation.x = Math.sin(this.t * 0.7) * 0.3;
    const k = this.dead ? 0.2 : 0.8 + this.phaseNo * 0.35 + Math.sin(this.t * 2.6) * 0.25;
    this.glow.forEach((m, i) => (m.emissiveIntensity = this.glowBase[i] * k));
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    this.blinkCooldown -= dt;
    this.updateShield(world);
    const rage = this.rage;

    switch (this.phase.kind) {
      case 'walk': {
        const d = this.distanceToPlayer(world);
        const toward = this.angleToPlayer(world);
        this.face = toward;
        if (d < KEEP_MIN && this.blinkCooldown <= 0) this.blink(world);
        else {
          // Back off when close, close in when far, otherwise circle.
          const heading = d < KEEP_MIN ? toward + Math.PI : d > KEEP_MAX ? toward : toward + (Math.PI / 2) * this.strafe;
          const blocked = (() => {
            this.steer(heading, d < KEEP_MIN ? 2.2 : 1.4);
            return this.move(dt, world);
          })();
          if (blocked) this.strafe *= -1;
          this.model.setLoop('move', 0.25, 0.9);
        }
        if (this.timer <= 0) {
          const rotation = ROTATIONS[Math.min(this.phaseNo, ROTATIONS.length - 1)];
          this.phase = { kind: rotation[this.attackIndex++ % rotation.length], step: 0 };
          this.timer = 0;
        }
        break;
      }

      case 'bolts': {
        this.model.setLoop('idle');
        this.face = this.angleToPlayer(world);
        if (this.timer > 0) break;
        this.model.playOnce('attack', { timeScale: 1.5 * rage });
        if (this.phase.step === 0) world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
        const n = this.phaseNo > 0 ? 7 : 5;
        for (let i = 0; i < n; i++) world.spawnBullet(this.x, this.z, this.face + (i - (n - 1) / 2) * 0.17, 6.5 * rage, 'soul');
        this.timer = 0.6 / rage;
        if (++this.phase.step >= 3) this.endAttack();
        break;
      }

      case 'summon':
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          this.model.playOnce('punch', { timeScale: 0.95 });
          world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
          world.effects.roar(this.x, this.z, 5, UNDEAD);
          this.timer = SUMMON_RAISE;
          this.phase.step = 1;
        } else if (this.timer <= 0) {
          this.summonWave(world);
          world.events.emit('camera:shake', { intensity: 0.2 });
          this.endAttack();
        }
        break;

      case 'bones':
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          this.model.playOnce('attack', { timeScale: 0.9 });
          world.events.emit('enemy:attack', { enemy: this, kind: 'slam' });
          const p = world.player;
          world.spawnHazard(p.x, p.z, 1.6, 1.0, UNDEAD);
          const rings = this.phaseNo >= 2 ? [2.6, 4.6] : [2.8];
          for (const [ri, r] of rings.entries()) {
            const n = 6 + ri * 3;
            for (let i = 0; i < n; i++) {
              const a = (i / n) * Math.PI * 2 + ri * 0.4;
              world.spawnHazard(p.x + Math.sin(a) * r, p.z + Math.cos(a) * r, 1.3, 1.0 + ri * 0.35, UNDEAD);
            }
          }
          this.timer = 1.1;
          this.phase.step = 1;
        } else if (this.timer <= 0) {
          this.endAttack();
        }
        break;
    }
  }

  protected onPhase(world: World, phase: number): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.4;
    this.attackIndex = 0;
    const spot = world.freeSpotNear(this.x, this.z, 2, 4);
    world.spawnEnemy('deathKnight', spot.x, spot.z);
    this.raise(world, 'skeleton', phase >= 2 ? 4 : 2, world.player.x, world.player.z, 3.5, 5);
    if (phase >= 2) this.raise(world, 'wraith', 2, this.x, this.z, 2, 5);
  }

  /** Normal summon: skeletons around the player, wraiths later on. Capped so the arena never floods. */
  private summonWave(world: World): void {
    const p = world.player;
    this.raise(world, 'skeleton', this.phaseNo >= 2 ? 3 : this.phaseNo >= 1 ? 2 : 3, p.x, p.z, 3, 5.5);
    if (this.phaseNo >= 1) this.raise(world, 'wraith', 2, this.x, this.z, 1.5, 4);
  }

  private raise(world: World, type: EnemyType, count: number, x: number, z: number, minR: number, maxR: number): void {
    const room = Math.max(0, MAX_MINIONS - world.countAlive(...MINIONS));
    for (let i = 0; i < Math.min(count, room); i++) {
      const spot = world.freeSpotNear(x, z, minR, maxR);
      world.spawnEnemy(type, spot.x, spot.z);
    }
  }

  private updateShield(world: World): void {
    const on = world.countAlive(...MINIONS) >= SHIELD_MINIONS;
    if (on === this.shielded) return;
    this.shielded = on;
    world.events.emit('boss:shield', { enemy: this, on });
  }

  /** Vanish in green smoke and reappear on the far side of the arena. */
  private blink(world: World): void {
    const p = world.player;
    let best = { x: this.x, z: this.z };
    let bestD = -1;
    for (let i = 0; i < 10; i++) {
      const c = world.freeSpotNear(this.x, this.z, 4, 14, 2);
      const d = distance(c.x, c.z, p.x, p.z);
      if (d > bestD) {
        bestD = d;
        best = c;
      }
    }
    this.puff(world);
    this.x = best.x;
    this.z = best.z;
    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.puff(world);
    this.blinkCooldown = rand(4, 5) / this.rage;
  }

  private puff(world: World): void {
    world.effects.shockwave(this.x, this.z, 2, UNDEAD);
    for (let i = 0; i < 10; i++) world.effects.gloom(this.x + rand(-0.8, 0.8), rand(0.3, 2.5), this.z + rand(-0.8, 0.8));
    for (let i = 0; i < 8; i++) world.effects.ember(this.x + rand(-0.8, 0.8), rand(0.3, 2.8), this.z + rand(-0.8, 0.8), UNDEAD);
  }

  private endAttack(): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.6 / this.rage;
  }
}
