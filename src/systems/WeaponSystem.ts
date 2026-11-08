import type { Enemy } from '../entities/Enemy';
import type { World } from '../game/World';
import { hasLineOfSight } from '../world/Collision';
import { angleTo, distance } from '../utils/math';

const VOLLEY_GAP = 0.13;
const DIAGONAL_STEP = 0.42;
const FRONT_SPACING = 0.3;
const MOVE_FIRE_DELAY = 0.12;

interface QueuedVolley {
  delay: number;
  angle: number;
}

/**
 * The core genre rule: the player fires automatically, but only while standing still.
 * Targets the nearest enemy in line of sight (falls back to nearest overall).
 */
export class WeaponSystem {
  private queue: QueuedVolley[] = [];

  reset(): void {
    this.queue = [];
  }

  update(dt: number, world: World, moving: boolean): void {
    const player = world.player;
    if (moving) {
      player.aiming = false;
      player.attackCooldown = Math.max(player.attackCooldown, MOVE_FIRE_DELAY);
      this.queue = [];
      return;
    }

    const target = this.findTarget(world);
    player.aiming = target !== null;
    if (target) {
      const angle = angleTo(player.x, player.z, target.x, target.z);
      player.aimAt(angle);
      player.attackCooldown -= dt;
      if (player.attackCooldown <= 0) {
        this.fireVolley(world, angle);
        for (let i = 1; i < player.stats.volleys; i++) this.queue.push({ delay: i * VOLLEY_GAP, angle });
        player.attackCooldown = player.stats.attackInterval;
      }
    }

    for (const q of this.queue) {
      q.delay -= dt;
      if (q.delay <= 0) this.fireVolley(world, q.angle);
    }
    this.queue = this.queue.filter((q) => q.delay > 0);
  }

  private findTarget(world: World): Enemy | null {
    const { player, room } = world;
    let nearest: Enemy | null = null;
    let nearestVisible: Enemy | null = null;
    let best = Infinity;
    let bestVisible = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = distance(player.x, player.z, e.x, e.z);
      if (d < best) {
        best = d;
        nearest = e;
      }
      if (d < bestVisible && hasLineOfSight(player.x, player.z, e.x, e.z, room.obstacles)) {
        bestVisible = d;
        nearestVisible = e;
      }
    }
    return nearestVisible ?? nearest;
  }

  private fireVolley(world: World, angle: number): void {
    const { player } = world;
    const s = player.stats;
    const ox = player.x + Math.sin(angle) * 0.4;
    const oz = player.z + Math.cos(angle) * 0.4;
    const perpX = Math.cos(angle);
    const perpZ = -Math.sin(angle);

    for (let i = 0; i < s.frontArrows; i++) {
      const offset = (i - (s.frontArrows - 1) / 2) * FRONT_SPACING;
      world.spawnArrow(ox + perpX * offset, oz + perpZ * offset, angle);
    }
    for (let d = 1; d <= s.diagonalPairs; d++) {
      world.spawnArrow(ox, oz, angle + DIAGONAL_STEP * d);
      world.spawnArrow(ox, oz, angle - DIAGONAL_STEP * d);
    }
    if (s.sideArrows) {
      world.spawnArrow(player.x, player.z, angle + Math.PI / 2);
      world.spawnArrow(player.x, player.z, angle - Math.PI / 2);
    }
    if (s.backArrow) world.spawnArrow(player.x, player.z, angle + Math.PI);
    player.releaseArrow();
    world.effects.muzzle(ox, 1.0, oz);
    world.events.emit('weapon:fired', { x: player.x, z: player.z });
  }
}
