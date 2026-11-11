import * as THREE from 'three';
import { createTelegraphMesh } from '../../assets/models/ProjectileModels';
import { disposeObject } from '../../assets/ModelKit';
import { vfxTexture } from '../../assets/vfxTextures';
import type { World } from '../../game/World';
import { clamp, rand } from '../../utils/math';
import type { Difficulty } from '../Enemy';
import { BossEnemy } from './BossEnemy';

type Attack = 'radial' | 'fan' | 'charge' | 'meteor' | 'spiral';
type Phase = { kind: 'walk' } | { kind: Attack; step: number };

/** Attack rotation per phase: each phase adds patterns and opens with its new one. */
const ROTATIONS: readonly (readonly Attack[])[] = [
  ['radial', 'fan', 'charge'],
  ['meteor', 'radial', 'spiral', 'charge', 'fan'],
  ['meteor', 'spiral', 'charge', 'radial', 'fan'],
];
const CHARGE_WINDUP = 0.85;
const CHARGE_SPEED = 16;
const METEOR_RADIUS = 1.5;
const FIRE = 0xff5a14;

/**
 * Stage boss (rooms 10, 20, …): the Abyss Lord, a towering winged demon with a molten greatsword
 * (model built by `npm run assets:bosses`).
 * Phase 1: slam bullet rings → trident fans → telegraphed charge.
 * Phase 2 (66% HP): adds meteor rain and a bullet spiral, summons bats.
 * Phase 3 (33% HP): everything faster and denser, double charge, more minions.
 */
export class Boss extends BossEnemy {
  private phase: Phase = { kind: 'walk' };
  private attackIndex = 0;
  private chargesLeft = 0;
  private spiralAngle = 0;
  private readonly telegraph: THREE.Mesh;

  // Emissive parts (molten core, sword, eyes) pulse with the boss's heat.
  private readonly glowMaterials: THREE.MeshStandardMaterial[];
  private readonly glowBase: number[];
  private readonly flames: THREE.Sprite[] = [];
  private heat = 0.4;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('boss', 'demonLord', x, z, difficulty);
    this.timer = 1.2;
    this.telegraph = createTelegraphMesh(this.radius * 2, 18);
    this.glowMaterials = this.model.materialsNamed('Glow', 'Eye');
    this.glowBase = this.glowMaterials.map((m) => m.emissiveIntensity);
    const head = this.model.attach('Head');
    if (head) this.addFlame(head, 0, 1.55, 0.1, 1.5); // fire burning between the horns
  }

  override get sceneObjects(): THREE.Object3D[] {
    return [...super.sceneObjects, this.telegraph];
  }

  override die(): void {
    super.die();
    this.telegraph.visible = false;
  }

  override dispose(): void {
    super.dispose();
    disposeObject(this.telegraph);
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    const target = this.dead ? 0 : this.spawning ? 0.5 : 1 + this.phaseNo * 0.6;
    this.heat += (target - this.heat) * Math.min(1, dt * 3);
    const pulse = 0.8 + Math.sin(this.t * 3.4) * 0.2;
    this.glowMaterials.forEach((m, i) => (m.emissiveIntensity = this.glowBase[i] * (0.35 + this.heat * 0.65) * pulse));
    this.flames.forEach((flame, i) => {
      const flicker = 1 + Math.sin(this.t * 17 + i * 2.1) * 0.12 + Math.sin(this.t * 29 + i) * 0.08;
      flame.scale.setScalar((flame.userData.size as number) * flicker * Math.min(1.5, 0.4 + this.heat * 0.6));
      flame.material.opacity = clamp(this.heat, 0, 1);
    });
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    const rage = this.rage;

    switch (this.phase.kind) {
      case 'walk': {
        this.face = this.angleToPlayer(world);
        this.steer(this.face, 1.5 * rage);
        this.move(dt, world);
        this.model.setLoop('move', 0.2, 0.9 * rage);
        this.stomp(dt, world, 0.59 / rage);
        if (this.timer <= 0) {
          const rotation = ROTATIONS[Math.min(this.phaseNo, ROTATIONS.length - 1)];
          const kind = rotation[this.attackIndex++ % rotation.length];
          this.phase = { kind, step: 0 };
          this.timer = 0;
          this.chargesLeft = kind === 'charge' && this.phaseNo >= 2 ? 2 : 1;
        }
        break;
      }

      case 'radial': {
        if (this.timer > 0) break;
        this.model.playOnce('jump', { timeScale: 1.3 }); // one stomp per ring
        this.model.setLoop('idle');
        const n = 20 + this.phaseNo * 2;
        for (let i = 0; i < n; i++) {
          world.spawnBullet(this.x, this.z, (i / n) * Math.PI * 2 + this.phase.step * 0.17, 5 * rage, 'fireball', true);
        }
        world.effects.shockwave(this.x, this.z, 3, FIRE);
        world.events.emit('enemy:attack', { enemy: this, kind: 'slam' });
        world.events.emit('camera:shake', { intensity: 0.2 });
        this.timer = 0.45;
        if (++this.phase.step >= 3 + Math.min(this.phaseNo, 1)) this.endAttack();
        break;
      }

      case 'fan': {
        if (this.timer > 0) break;
        this.face = this.angleToPlayer(world);
        this.model.setLoop('idle');
        this.model.playOnce('attack', { timeScale: 2 * rage });
        if (this.phase.step === 0) world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
        const half = this.phaseNo > 0 ? 4 : 3;
        for (let i = -half; i <= half; i++) world.spawnBullet(this.x, this.z, this.face + i * 0.16, 7 * rage, 'fireball');
        this.timer = 0.4;
        if (++this.phase.step >= 4) this.endAttack();
        break;
      }

      case 'meteor': {
        this.model.setLoop('idle');
        if (this.timer > 0) break;
        if (this.phase.step === 0) {
          this.model.playOnce('roar', { timeScale: 0.9 });
          world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
        }
        this.dropMeteor(world, this.phase.step % 2 === 0);
        this.timer = 0.24 / rage;
        if (++this.phase.step >= 6 + this.phaseNo * 2) this.endAttack();
        break;
      }

      case 'spiral': {
        this.model.setLoop('idle');
        if (this.timer > 0) break;
        if (this.phase.step % 9 === 0) {
          this.model.playOnce('punch', { timeScale: 1.05 });
          world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
        }
        const arms = this.phaseNo >= 2 ? 3 : 2;
        this.spiralAngle += 0.29;
        for (let i = 0; i < arms; i++) world.spawnBullet(this.x, this.z, this.spiralAngle + (i / arms) * Math.PI * 2, 5.2, 'shadow');
        this.timer = 0.085;
        if (++this.phase.step >= 26 + this.phaseNo * 5) this.endAttack();
        break;
      }

      case 'charge':
        this.updateCharge(dt, world);
        break;
    }
  }

  protected onPhase(world: World, phase: number): void {
    // Interrupt whatever it was doing and open the new phase with its new pattern.
    this.telegraph.visible = false;
    this.phase = { kind: 'walk' };
    this.timer = 1.3;
    this.attackIndex = 0;
    for (let i = 0; i < 24; i++) world.spawnBullet(this.x, this.z, (i / 24) * Math.PI * 2, 3.6, 'shadow', true);
    for (const x of [-4.5, 4.5]) world.spawnEnemy('bat', x, this.z);
    if (phase >= 2) for (const x of [-3, 3]) world.spawnEnemy('slime', x, clamp(this.z + 3, world.room.bounds.z0 + 2, world.room.bounds.z1 - 2));
  }

  /** Marks a spot that erupts a moment later: on the player, or somewhere around them. */
  private dropMeteor(world: World, aimed: boolean): void {
    const { player, room } = world;
    const spread = aimed ? 0.5 : 4.5;
    const x = clamp(player.x + rand(-spread, spread), room.bounds.x0 + 1, room.bounds.x1 - 1);
    const z = clamp(player.z + rand(-spread, spread), room.bounds.z0 + 1, room.bounds.z1 - 1);
    world.spawnHazard(x, z, METEOR_RADIUS, 1.05, FIRE);
  }

  private updateCharge(dt: number, world: World): void {
    if (this.phase.kind !== 'charge') return;
    if (this.phase.step === 0) {
      // Wind-up: show where we're going to charge.
      this.face = this.angleToPlayer(world);
      this.telegraph.position.set(this.x, 0.05, this.z);
      this.telegraph.rotation.y = this.face;
      this.telegraph.visible = true;
      this.model.setLoop('idle');
      this.phase.step = 1;
      this.timer = CHARGE_WINDUP / this.rage;
    } else if (this.phase.step === 1 && this.timer <= 0) {
      this.telegraph.visible = false;
      this.steer(this.face, CHARGE_SPEED);
      this.model.setLoop('run', 0.1, 1.8);
      world.events.emit('enemy:attack', { enemy: this, kind: 'charge' });
      this.phase.step = 2;
      this.timer = 1;
    } else if (this.phase.step === 2) {
      if (Math.floor(this.t * 30) % 2 === 0) {
        world.effects.dust(this.x, this.z);
        world.effects.ember(this.x + rand(-1, 1), rand(0.3, 2.5), this.z + rand(-1, 1), FIRE);
      }
      const blocked = this.move(dt, world);
      if (blocked || this.timer <= 0) {
        world.events.emit('camera:shake', { intensity: 0.4 });
        world.effects.shockwave(this.x, this.z, 3.4, FIRE);
        world.events.emit('enemy:attack', { enemy: this, kind: 'impact' });
        this.model.playOnce('punch', { timeScale: 1.2 });
        for (let i = 0; i < 12; i++) world.spawnBullet(this.x, this.z, (i / 12) * Math.PI * 2, 4.5, 'fireball', true);
        if (--this.chargesLeft > 0) {
          this.phase.step = 0;
          this.vx = this.vz = 0;
        } else this.endAttack();
      }
    }
  }

  private endAttack(): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.6 / this.rage;
  }

  // ------------------------------------------------------------ look

  private addFlame(parent: THREE.Object3D, x: number, y: number, z: number, size: number): void {
    const material = new THREE.SpriteMaterial({ map: vfxTexture('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    material.color.setHex(FIRE).multiplyScalar(2.2);
    const flame = new THREE.Sprite(material);
    flame.position.set(x, y, z);
    flame.userData.size = size;
    flame.scale.setScalar(size);
    parent.add(flame);
    this.flames.push(flame);
  }
}
