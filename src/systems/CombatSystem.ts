import type { Enemy } from '../entities/Enemy';
import type { Arrow } from '../entities/projectiles/Arrow';
import type { World } from '../game/World';
import { distance, rand } from '../utils/math';

const ARROW_HIT_PADDING = 0.18;
const ARROW_TRAIL_COLOR = 0xffc870;

/** Moves projectiles and resolves arrow→enemy and bullet→player hits. */
export class CombatSystem {
  private frame = 0;

  update(dt: number, world: World): void {
    this.frame++;
    for (const arrow of world.arrows) this.updateArrow(arrow, dt, world);
    this.updateBullets(dt, world);
  }

  private updateArrow(arrow: Arrow, dt: number, world: World): void {
    const { room } = world;
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
      for (const enemy of world.enemies) {
        if (enemy.dead || arrow.hitEnemies.has(enemy)) continue;
        if (distance(enemy.x, enemy.z, arrow.x, arrow.z) >= enemy.radius + ARROW_HIT_PADDING) continue;
        this.hitEnemy(enemy, world);
        if (arrow.pierceLeft > 0) {
          arrow.pierceLeft--;
          arrow.hitEnemies.add(enemy);
        } else {
          arrow.dead = true;
          break;
        }
      }
    }

    if (arrow.life <= 0) arrow.dead = true;
    if (!arrow.dead) world.effects.trail(arrow.x, 0.85, arrow.z, ARROW_TRAIL_COLOR, 0.32);
    arrow.sync();
  }

  private hitEnemy(enemy: Enemy, world: World): void {
    const stats = world.player.stats;
    const critical = Math.random() < stats.critChance;
    const amount = Math.round(stats.damage * (critical ? stats.critMultiplier : 1) * rand(0.92, 1.08));
    const killed = enemy.applyDamage(amount);
    world.events.emit('enemy:damaged', { enemy, amount, critical });
    world.effects.hit(enemy.x, enemy.centerY, enemy.z, critical);
    if (killed) world.killEnemy(enemy);
  }

  private destroyArrow(arrow: Arrow, world: World): void {
    arrow.dead = true;
    world.effects.impact(arrow.x, 0.85, arrow.z);
    world.events.emit('projectile:blocked', { x: arrow.x, z: arrow.z });
  }

  private updateBullets(dt: number, world: World): void {
    const { room, player } = world;
    for (const b of world.bullets) {
      b.x += b.vx * dt;
      b.z += b.vz * dt;
      b.life -= dt;
      if (room.isOutside(b.x, b.z) || room.obstacleAt(b.x, b.z) || b.life <= 0) {
        b.dead = true;
      } else if (player.alive && distance(b.x, b.z, player.x, player.z) < b.radius + player.radius - 0.05) {
        world.damagePlayer(b.damage);
        b.dead = true;
      }
      b.sync();
      if (b.dead) world.effects.pop(b.x, 0.8, b.z, b.color);
      else if (this.frame % 2 === 0) world.effects.trail(b.x, 0.8, b.z, b.color, b.radius * 2.2);
    }
  }
}
