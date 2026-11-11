import type * as THREE from 'three';
import type { World } from '../../game/World';
import type { Difficulty } from '../Enemy';
import { BossEnemy } from './BossEnemy';

type Attack = 'leap' | 'web' | 'brood';
type Phase = { kind: 'walk' } | { kind: Attack; step: number };

const ORDER: readonly Attack[] = ['leap', 'web', 'brood', 'web'];
const CROUCH = 0.3;
const AIR = 0.6;
const LEAP_RADIUS = 2.4;
const LEAP_HEIGHT = 3.2;
const MAX_SPIDERLINGS = 8;
const ICE = 0x6fd8ff;
/** The Jump clip lands on its frame 24 (0.8 s). */
const JUMP_LAND = 0.8;

/**
 * Mid-boss (room 15, 35, …): the Frost Spider Queen. Unlike the slow golem she is all mobility:
 * telegraphed leaps onto the player that burst into icicles, sticky web volleys that slow,
 * and broods of spiderlings. At 50% HP she enrages: double leaps, wider webs, bigger broods.
 */
export class SpiderQueen extends BossEnemy {
  private phase: Phase = { kind: 'walk' };
  private attackIndex = 0;
  private leapsLeft = 0;
  private readonly from = { x: 0, z: 0 };
  private readonly to = { x: 0, z: 0 };
  private readonly iceMaterials: THREE.MeshStandardMaterial[];
  private readonly iceBase: number[];

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('spiderQueen', 'spiderQueen', x, z, difficulty);
    this.timer = 1.2;
    this.iceMaterials = this.model.materialsNamed('Ice', 'Eye');
    this.iceBase = this.iceMaterials.map((m) => m.emissiveIntensity);
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    const rage = this.rage;
    const enraged = this.phaseNo > 0;

    switch (this.phase.kind) {
      case 'walk':
        this.face = this.angleToPlayer(world) + Math.sin(this.t * 1.7) * 0.35; // skittering approach
        this.steer(this.face, 2.5 * rage);
        this.move(dt, world);
        this.model.setLoop('move', 0.15, 1.3 * rage);
        if (this.timer <= 0) {
          this.phase = { kind: ORDER[this.attackIndex++ % ORDER.length], step: 0 };
          this.leapsLeft = enraged ? 2 : 1;
          this.timer = 0;
        }
        break;

      case 'leap':
        this.updateLeap(world);
        break;

      case 'web': {
        this.model.setLoop('idle');
        this.face = this.angleToPlayer(world);
        if (this.timer > 0) break;
        this.model.playOnce('attack', { timeScale: 1.4 * rage });
        const n = enraged ? 7 : 5;
        for (let i = 0; i < n; i++) world.spawnBullet(this.x, this.z, this.face + (i - (n - 1) / 2) * 0.2, 6.5 * rage, 'web');
        world.events.emit('enemy:attack', { enemy: this, kind: 'throw' });
        this.timer = 0.55;
        if (++this.phase.step >= (enraged ? 3 : 2)) this.endAttack();
        break;
      }

      case 'brood':
        this.model.setLoop('idle');
        if (this.phase.step === 0) {
          this.model.playOnce('roar', { timeScale: 1.2 });
          world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
          this.timer = 0.7;
          this.phase.step = 1;
        } else if (this.timer <= 0) {
          this.spawnBrood(world, enraged ? 4 : 3);
          this.endAttack();
        }
        break;
    }
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    // Kept well below the authored glow: on the pale ice floor full glow washes her out.
    const k = this.dead ? 0.15 : 0.45 + this.phaseNo * 0.35 + Math.sin(this.t * 3) * 0.1;
    this.iceMaterials.forEach((m, i) => (m.emissiveIntensity = this.iceBase[i] * k));
  }

  protected onPhase(world: World): void {
    this.land(world, false);
    this.phase = { kind: 'walk' };
    this.timer = 1;
    this.spawnBrood(world, 4);
  }

  /** Crouch (target marked on the ground) → arc through the air (can't be touched) → crash down. */
  private updateLeap(world: World): void {
    if (this.phase.kind !== 'leap') return;
    if (this.phase.step === 0) {
      const p = world.player;
      Object.assign(this.from, { x: this.x, z: this.z });
      Object.assign(this.to, world.freeSpotNear(p.x, p.z, 0, 0.4, 1.5));
      this.face = this.angleToPlayer(world);
      world.spawnHazard(this.to.x, this.to.z, LEAP_RADIUS, CROUCH + AIR, ICE);
      this.model.playOnce('jump', { timeScale: JUMP_LAND / (CROUCH + AIR) });
      world.events.emit('enemy:attack', { enemy: this, kind: 'charge' });
      this.timer = CROUCH;
      this.phase.step = 1;
    } else if (this.phase.step === 1) {
      if (this.timer > 0) return;
      this.intangible = true;
      this.timer = AIR;
      this.phase.step = 2;
    } else {
      const k = Math.min(1, 1 - this.timer / AIR);
      this.x = this.from.x + (this.to.x - this.from.x) * k;
      this.z = this.from.z + (this.to.z - this.from.z) * k;
      this.root.position.y = Math.sin(Math.PI * k) * LEAP_HEIGHT;
      if (this.timer > 0) return;
      this.land(world, true);
      if (--this.leapsLeft > 0) {
        this.phase = { kind: 'leap', step: 0 };
        this.timer = 0.25;
      } else {
        this.endAttack();
      }
    }
  }

  private land(world: World, burst: boolean): void {
    if (!this.intangible && this.root.position.y === 0) return;
    this.x = this.to.x;
    this.z = this.to.z;
    this.root.position.y = 0;
    this.intangible = false;
    if (!burst) return;
    world.effects.shockwave(this.x, this.z, LEAP_RADIUS, ICE);
    world.effects.frostBurst(this.x, 0.6, this.z);
    world.events.emit('camera:shake', { intensity: 0.45 });
    world.events.emit('enemy:attack', { enemy: this, kind: 'impact' });
    const n = this.phaseNo > 0 ? 14 : 10;
    for (let i = 0; i < n; i++) world.spawnBullet(this.x, this.z, (i / n) * Math.PI * 2, 5, 'icicle', true);
  }

  private spawnBrood(world: World, count: number): void {
    const room = MAX_SPIDERLINGS - world.countAlive('spiderling');
    for (let i = 0; i < Math.min(count, room); i++) {
      const spot = world.freeSpotNear(this.x, this.z, 1.6, 3.2);
      world.spawnEnemy('spiderling', spot.x, spot.z);
    }
  }

  private endAttack(): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.4 / this.rage;
  }
}
