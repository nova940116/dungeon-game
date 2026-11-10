import type * as THREE from 'three';
import type { World } from '../../game/World';
import type { Difficulty } from '../Enemy';
import { BossEnemy } from './BossEnemy';

type Attack = 'volley' | 'slam' | 'quake';
type Phase = { kind: 'walk' } | { kind: Attack; step: number };

const ATTACK_ORDER: readonly Attack[] = ['volley', 'slam', 'quake'];
const SLAM_RADIUS = 3.4;

/** Seconds into the model's clips at which the blow lands (see scripts/blender/boss_golem.py). */
const SLAM_IMPACT = 0.8;
const HURL_RELEASE = 0.4;

/**
 * Mid-boss (rooms 5, 15, …): the Ancient Golem, a hunched stone colossus with a crystal heart
 * (model built by `npm run assets:bosses`).
 * Cycles boulder volleys → a telegraphed ground slam → a quake line toward the player.
 * At 50% HP it enrages: faster, wider patterns and two slimes.
 */
export class MidBoss extends BossEnemy {
  private phase: Phase = { kind: 'walk' };
  private attackIndex = 0;
  private readonly crystalMaterials: THREE.MeshStandardMaterial[];
  private readonly crystalBase: number[];
  private glow = 1;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('midboss', 'golemBoss', x, z, difficulty);
    this.timer = 1.2;
    this.crystalMaterials = this.model.materialsNamed('Crystal', 'Eye');
    this.crystalBase = this.crystalMaterials.map((m) => m.emissiveIntensity);
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    const rage = this.rage;
    const enraged = this.phaseNo > 0;

    switch (this.phase.kind) {
      case 'walk':
        this.face = this.angleToPlayer(world);
        this.steer(this.face, 1.5 * rage);
        this.move(dt, world);
        this.model.setLoop('move', 0.2, rage);
        this.stomp(dt, world, 0.667 / rage, 0.06);
        if (this.timer <= 0) this.phase = { kind: ATTACK_ORDER[this.attackIndex++ % ATTACK_ORDER.length], step: 0 };
        break;

      case 'volley': {
        this.face = this.angleToPlayer(world);
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          this.hurl(0.5 / rage);
          this.phase.step = 1;
        } else if (this.timer <= 0) {
          for (let i = -3; i <= 3; i++) world.spawnBullet(this.x, this.z, this.face + i * 0.2, 5.5 * rage, true);
          world.events.emit('enemy:attack', { enemy: this, kind: 'throw' });
          if (++this.phase.step > (enraged ? 3 : 2)) this.endAttack();
          else this.hurl(0.55 / rage);
        }
        break;
      }

      case 'slam':
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          const windup = 1 / rage;
          world.spawnHazard(this.x, this.z, SLAM_RADIUS, windup, this.info.color);
          this.model.playOnce('attack', { timeScale: SLAM_IMPACT / windup });
          this.timer = windup;
          this.phase.step = 1;
        } else if (this.timer <= 0) {
          const n = enraged ? 20 : 14;
          for (let i = 0; i < n; i++) world.spawnBullet(this.x, this.z, (i / n) * Math.PI * 2 + this.face, 4.5 * rage, true);
          world.effects.shockwave(this.x, this.z, SLAM_RADIUS, this.info.color);
          world.events.emit('enemy:attack', { enemy: this, kind: 'slam' });
          world.events.emit('camera:shake', { intensity: 0.3 });
          this.endAttack();
        }
        break;

      case 'quake':
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          this.face = this.angleToPlayer(world);
          this.model.playOnce('attack', { timeScale: 1.05 });
          for (const offset of enraged ? [-0.42, 0, 0.42] : [0]) this.crackLine(world, this.face + offset);
          world.events.emit('enemy:attack', { enemy: this, kind: 'charge' });
          this.timer = 1.3;
          this.phase.step = 1;
        } else if (this.timer <= 0) this.endAttack();
        break;
    }
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    const target = this.dead ? 0 : 1 + this.phaseNo * 0.9 + Math.sin(this.t * 4) * 0.25;
    this.glow += (target - this.glow) * Math.min(1, dt * 4);
    this.crystalMaterials.forEach((m, i) => (m.emissiveIntensity = this.crystalBase[i] * this.glow));
  }

  protected onPhase(world: World): void {
    this.phase = { kind: 'walk' };
    this.timer = 1;
    for (const x of [-4, 4]) world.spawnEnemy('slime', x, this.z);
  }

  /** A row of delayed eruptions marching away from the golem. */
  private crackLine(world: World, angle: number): void {
    for (let i = 0; i < 6; i++) {
      const d = this.radius + 1.2 + i * 2.2;
      const x = this.x + Math.sin(angle) * d;
      const z = this.z + Math.cos(angle) * d;
      if (world.room.isOutside(x, z)) break;
      world.spawnHazard(x, z, 1.35, 0.75 + i * 0.17, this.info.color);
    }
  }

  /** Winds up the one-arm throw so the boulders leave the hand `delay` seconds from now. */
  private hurl(delay: number): void {
    this.model.playOnce('punch', { timeScale: HURL_RELEASE / delay });
    this.timer = delay;
  }

  private endAttack(): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.6 / this.rage;
  }
}
