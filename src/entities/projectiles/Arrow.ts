import type * as THREE from 'three';
import { BALANCE } from '../../config';
import { createArrowMesh } from '../../assets/models/ProjectileModels';
import type { Enemy } from '../Enemy';
import type { PlayerStats } from '../PlayerStats';

const FLIGHT_HEIGHT = 0.85;

export interface ArrowOptions {
  /** Damage multiplier relative to the bow's damage. */
  damageMul?: number;
  /** Secondary projectiles (split shards, spirit / kill arrows) never split again. */
  minor?: boolean;
  /** Tip halo + trail colour (default: warm gold). */
  glow?: number;
  /** Enemies this arrow must ignore (e.g. the one a shard split from). */
  ignore?: Enemy;
}

export class Arrow {
  readonly mesh: THREE.Group;
  readonly trailColor: number;
  /** Enemies already hit (so a piercing arrow doesn't hit the same one twice). */
  readonly hitEnemies = new Set<Enemy>();
  readonly damageMul: number;
  readonly minor: boolean;
  readonly scale: number;
  readonly homing: number;
  readonly speed: number;
  vx: number;
  vz: number;
  life: number;
  pierceLeft: number;
  bouncesLeft: number;
  ricochetLeft: number;
  dead = false;

  constructor(
    public x: number,
    public z: number,
    angle: number,
    stats: PlayerStats,
    opts: ArrowOptions = {},
  ) {
    this.trailColor = opts.glow ?? 0xffc870;
    this.mesh = createArrowMesh(opts.glow);
    this.damageMul = opts.damageMul ?? 1;
    this.minor = opts.minor ?? false;
    this.scale = stats.arrowScale * (this.minor ? 0.75 : 1);
    this.homing = stats.homing;
    this.speed = BALANCE.arrowSpeed * stats.arrowSpeedMul;
    this.life = BALANCE.arrowLife * stats.arrowLifeMul;
    this.vx = Math.sin(angle) * this.speed;
    this.vz = Math.cos(angle) * this.speed;
    this.pierceLeft = stats.pierce;
    this.bouncesLeft = stats.wallBounces;
    this.ricochetLeft = this.minor ? 0 : stats.ricochet;
    if (opts.ignore) this.hitEnemies.add(opts.ignore);
    this.mesh.scale.setScalar(this.scale);
    this.sync();
  }

  get angle(): number {
    return Math.atan2(this.vx, this.vz);
  }

  /** Points the arrow along a new heading, keeping its speed. */
  steerTo(angle: number): void {
    this.vx = Math.sin(angle) * this.speed;
    this.vz = Math.cos(angle) * this.speed;
  }

  reflect(axis: 'x' | 'z'): void {
    if (axis === 'x') this.vx *= -1;
    else this.vz *= -1;
    this.bouncesLeft--;
    this.hitEnemies.clear();
  }

  sync(): void {
    this.mesh.position.set(this.x, FLIGHT_HEIGHT, this.z);
    this.mesh.rotation.y = this.angle;
  }
}
