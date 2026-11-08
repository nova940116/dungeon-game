import { BALANCE } from '../../config';
import { createArrowMesh } from '../../assets/models/ProjectileModels';
import type { Enemy } from '../Enemy';
import type { PlayerStats } from '../PlayerStats';

const FLIGHT_HEIGHT = 0.85;

export class Arrow {
  readonly mesh = createArrowMesh();
  /** Enemies already hit (so a piercing arrow doesn't hit the same one twice). */
  readonly hitEnemies = new Set<Enemy>();
  vx: number;
  vz: number;
  life: number = BALANCE.arrowLife;
  pierceLeft: number;
  bouncesLeft: number;
  dead = false;

  constructor(
    public x: number,
    public z: number,
    angle: number,
    stats: PlayerStats,
  ) {
    this.vx = Math.sin(angle) * BALANCE.arrowSpeed;
    this.vz = Math.cos(angle) * BALANCE.arrowSpeed;
    this.pierceLeft = stats.pierce;
    this.bouncesLeft = stats.wallBounces;
    this.sync();
  }

  reflect(axis: 'x' | 'z'): void {
    if (axis === 'x') this.vx *= -1;
    else this.vz *= -1;
    this.bouncesLeft--;
    this.hitEnemies.clear();
  }

  sync(): void {
    this.mesh.position.set(this.x, FLIGHT_HEIGHT, this.z);
    this.mesh.rotation.y = Math.atan2(this.vx, this.vz);
  }
}
