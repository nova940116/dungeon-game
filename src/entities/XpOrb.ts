import { createOrbMesh } from '../assets/models/ProjectileModels';
import type { Vec2 } from '../utils/math';

const COLLECT_RADIUS = 0.5;

/** XP gem dropped by enemies. Drifts to the player when close, or always once the room is cleared. */
export class XpOrb {
  readonly mesh = createOrbMesh();
  dead = false;
  private delay = 0.4;

  constructor(
    public x: number,
    public z: number,
    readonly value: number,
  ) {
    this.mesh.position.set(x, 0.4, z);
  }

  /** Returns true when collected this frame. */
  update(dt: number, elapsed: number, target: Vec2, magnetRadius: number, magnetAll: boolean): boolean {
    this.delay -= dt;
    const dx = target.x - this.x;
    const dz = target.z - this.z;
    const d = Math.hypot(dx, dz);
    if (this.delay <= 0 && d > 1e-4 && (magnetAll || d < magnetRadius)) {
      const speed = magnetAll ? 14 : 9;
      this.x += (dx / d) * speed * dt;
      this.z += (dz / d) * speed * dt;
    }
    this.mesh.children[0].rotation.y += dt * 4;
    this.mesh.position.set(this.x, 0.4 + Math.sin(elapsed * 5 + this.x) * 0.08, this.z);
    return d < COLLECT_RADIUS;
  }
}
