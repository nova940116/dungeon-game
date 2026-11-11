import type { Enemy } from '../entities/Enemy';
import type { Arrow } from '../entities/projectiles/Arrow';
import type { World } from '../game/World';
import { angleTo, distance } from '../utils/math';
import { strike } from './HitEffects';

const ARROW_HIT_PADDING = 0.18;
const ARROW_TRAIL_COLOR = 0xffc870;
const HOMING_RANGE = 9;
const RICOCHET_RANGE = 6.5;

/** Moves projectiles and resolves arrow→enemy and bullet→player hits. */
export class CombatSystem {
  private frame = 0;

  update(dt: number, world: World): void {
    this.frame++;
    // Index loop: hits can spawn new arrows (shards) mid-iteration.
    for (let i = 0; i < world.arrows.length; i++) this.updateArrow(world.arrows[i], dt, world);
    this.updateBullets(dt, world);
  }

  private updateArrow(arrow: Arrow, dt: number, world: World): void {
    if (arrow.dead) return;
    const { room } = world;
    if (arrow.homing > 0) this.steerHoming(arrow, dt, world);
    const prevX = arrow.x;
    const prevZ = arrow.z;
    arrow.x += arrow.vx * dt;
    arrow.z += arrow.vz * dt;
    arrow.life -= dt;

    if (room.isOutside(arrow.x, arrow.z)) {
      if (arrow.bouncesLeft > 0) {
        const hitSideWall = arrow.x < room.bounds.x0 || arrow.x > room.bounds.x1;
        arrow.x = prevX;
        arrow.z = prevZ;
        arrow.reflect(hitSideWall ? 'x' : 'z');
        world.effects.impact(arrow.x, 0.85, arrow.z, ARROW_TRAIL_COLOR);
        world.events.emit('projectile:blocked', { x: arrow.x, z: arrow.z });
      } else {
        this.destroyArrow(arrow, world);
      }
    }

    const rock = !arrow.dead && room.obstacleAt(arrow.x, arrow.z);
    if (rock) {
      if (arrow.bouncesLeft > 0) {
        const cameFromSide = prevX <= rock.x0 || prevX >= rock.x1;
        arrow.x = prevX;
        arrow.z = prevZ;
        arrow.reflect(cameFromSide ? 'x' : 'z');
        world.effects.impact(arrow.x, 0.85, arrow.z, ARROW_TRAIL_COLOR);
        world.events.emit('projectile:blocked', { x: arrow.x, z: arrow.z });
      } else {
        this.destroyArrow(arrow, world);
      }
    }

    if (!arrow.dead) {
      const pad = ARROW_HIT_PADDING * arrow.scale + 0.12 * (arrow.scale - 1);
      for (const enemy of world.enemies) {
        if (enemy.dead || arrow.hitEnemies.has(enemy)) continue;
        if (distance(enemy.x, enemy.z, arrow.x, arrow.z) >= enemy.radius + pad) continue;
        this.hitEnemy(arrow, enemy, world);
        arrow.hitEnemies.add(enemy);
        if (arrow.ricochetLeft > 0 && this.ricochet(arrow, enemy, world)) break;
        if (arrow.pierceLeft > 0) {
          arrow.pierceLeft--;
        } else {
          arrow.dead = true;
          break;
        }
      }
    }

    if (arrow.life <= 0) arrow.dead = true;
    if (!arrow.dead && (!arrow.minor || this.frame % 2 === 0)) world.effects.trail(arrow.x, 0.85, arrow.z, arrow.trailColor, 0.32 * arrow.scale);
    arrow.sync();
  }

  private hitEnemy(arrow: Arrow, enemy: Enemy, world: World): void {
    strike(world, enemy, arrow.damageMul, arrow, arrow.minor ? 'shard' : 'arrow');
  }

  /** Bends the arrow toward the nearest enemy it hasn't hit yet. */
  private steerHoming(arrow: Arrow, dt: number, world: World): void {
    const target = world.nearestEnemy(arrow.x, arrow.z, HOMING_RANGE, (e) => arrow.hitEnemies.has(e));
    if (!target) return;
    const want = angleTo(arrow.x, arrow.z, target.x, target.z);
    let diff = want - arrow.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    const max = arrow.homing * dt;
    arrow.steerTo(arrow.angle + Math.max(-max, Math.min(max, diff)));
  }

  /** Sends the arrow on to another nearby enemy. Returns false if there is none. */
  private ricochet(arrow: Arrow, from: Enemy, world: World): boolean {
    const next = world.nearestEnemy(from.x, from.z, RICOCHET_RANGE, (e) => arrow.hitEnemies.has(e));
    if (!next) return false;
    arrow.ricochetLeft--;
    arrow.steerTo(angleTo(arrow.x, arrow.z, next.x, next.z));
    arrow.life = Math.max(arrow.life, 0.6);
    world.effects.impact(arrow.x, 0.85, arrow.z, 0xfff1c9);
    return true;
  }

  private destroyArrow(arrow: Arrow, world: World): void {
    arrow.dead = true;
    world.effects.impact(arrow.x, 0.85, arrow.z);
    world.events.emit('projectile:blocked', { x: arrow.x, z: arrow.z });
  }

  private updateBullets(dt: number, world: World): void {
    const { room, player } = world;
    const slow = 1 - player.stats.enemySlow;
    for (const b of world.bullets) {
      b.x += b.vx * dt * slow;
      b.z += b.vz * dt * slow;
      b.life -= dt * slow;
      if (room.isOutside(b.x, b.z) || room.obstacleAt(b.x, b.z) || b.life <= 0) {
        b.dead = true;
      } else if (player.alive && distance(b.x, b.z, player.x, player.z) < b.radius + player.radius - 0.05) {
        world.damagePlayer(b.damage);
        if (b.kind === 'web') player.applySlow(0.45, 2.2);
        b.dead = true;
      }
      b.sync(dt * slow);
      if (b.dead) {
        if (b.style.trail === 'smoke') world.effects.impact(b.x, 0.8, b.z, b.color);
        else world.effects.pop(b.x, 0.8, b.z, b.color);
      } else if (this.frame % 2 === 0) {
        if (b.style.trail === 'smoke') world.effects.puff(b.x, 0.8, b.z, b.color);
        else world.effects.trail(b.x, 0.8, b.z, b.color, b.radius * (b.kind === 'fireball' ? 2.8 : 1.8));
      }
    }
  }
}
