import { BALANCE } from '../config';
import type { World } from '../game/World';
import type { ProgressionSystem } from './ProgressionSystem';

/** XP orb magnet + collection. */
export class PickupSystem {
  update(dt: number, elapsed: number, world: World, progression: ProgressionSystem): void {
    const magnetAll = world.room.cleared;
    for (const orb of world.orbs) {
      if (orb.dead) continue;
      if (orb.update(dt, elapsed, world.player, BALANCE.orbMagnetRadius, magnetAll)) {
        orb.dead = true;
        world.effects.collect(orb.x, 0.6, orb.z);
        world.events.emit('pickup:collected', { x: orb.x, z: orb.z });
        progression.addXp(orb.value);
      }
    }
  }
}
