import type { World } from '../game/World';
import { distance } from '../utils/math';

/** Ticks telegraphed ground explosions and applies their damage when they go off. */
export class HazardSystem {
  update(dt: number, world: World): void {
    const { player } = world;
    for (const h of world.hazards) {
      if (!h.update(dt)) continue;
      world.effects.eruption(h.x, h.z, h.radius, h.color);
      world.events.emit('hazard:exploded', { x: h.x, z: h.z, radius: h.radius });
      if (player.alive && distance(h.x, h.z, player.x, player.z) < h.radius + player.radius * 0.4) world.damagePlayer(h.damage);
    }
  }
}
