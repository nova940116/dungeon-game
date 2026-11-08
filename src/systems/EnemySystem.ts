import type * as THREE from 'three';
import type { World } from '../game/World';

/** Runs enemy AI, keeps enemies from overlapping, and syncs their visuals. */
export class EnemySystem {
  update(dt: number, world: World): void {
    // Index loop: the boss can spawn minions mid-iteration.
    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (!e.dead) e.update(dt, world);
    }
    this.separate(world);
  }

  /** Runs every frame in every state (animations, death sinking, bars). */
  syncVisuals(dt: number, world: World, cameraRotation: THREE.Quaternion): void {
    for (const e of world.enemies) e.syncVisual(dt, cameraRotation);
  }

  /** Soft push so enemies of the same layer (ground / air) don't stack. Bosses don't get pushed. */
  private separate(world: World): void {
    const list = world.enemies;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.dead || b.dead || a.def.flying !== b.def.flying) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const minDist = a.radius + b.radius;
        if (d < 0.001 || d >= minDist) continue;
        const push = (minDist - d) / 2;
        const nx = dx / d;
        const nz = dz / d;
        const wa = a.isBoss ? 0 : b.isBoss ? 2 : 1;
        const wb = b.isBoss ? 0 : a.isBoss ? 2 : 1;
        a.x -= nx * push * wa;
        a.z -= nz * push * wa;
        b.x += nx * push * wb;
        b.z += nz * push * wb;
      }
    }
  }
}
