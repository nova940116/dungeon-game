import type * as THREE from 'three';
import { BALANCE } from '../config';
import type { EventBus } from '../engine/EventBus';
import type { EnemyType } from '../data/enemies';
import type { Difficulty, Enemy } from '../entities/Enemy';
import { createEnemy } from '../entities/enemies';
import type { Player } from '../entities/Player';
import { Arrow } from '../entities/projectiles/Arrow';
import { EnemyBullet } from '../entities/projectiles/EnemyBullet';
import { XpOrb } from '../entities/XpOrb';
import type { EffectsSystem } from '../systems/EffectsSystem';
import type { Room } from '../world/Room';
import { rand, removeWhere } from '../utils/math';
import type { GameEvents } from './events';

const DEATH_COLORS: Partial<Record<EnemyType, number>> = {
  slime: 0x7dff6a,
  bat: 0xc58bff,
  shooter: 0x5ab8ff,
  golem: 0xffb070,
  boss: 0xff4a2a,
};

/**
 * Container for everything alive in the current room, plus spawn / damage helpers.
 * Systems read and mutate the world; they never talk to each other directly.
 */
export class World {
  readonly enemies: Enemy[] = [];
  readonly arrows: Arrow[] = [];
  readonly bullets: EnemyBullet[] = [];
  readonly orbs: XpOrb[] = [];
  roomNo = 1;

  private currentRoom: Room | null = null;

  constructor(
    readonly scene: THREE.Scene,
    readonly player: Player,
    readonly events: EventBus<GameEvents>,
    readonly effects: EffectsSystem,
  ) {
    scene.add(player.root, player.bar.root);
  }

  get room(): Room {
    if (!this.currentRoom) throw new Error('World has no room loaded');
    return this.currentRoom;
  }

  get difficulty(): Difficulty {
    const n = this.roomNo - 1;
    return { hpMul: 1 + n * BALANCE.enemyHpPerRoom, dmgMul: 1 + n * BALANCE.enemyDmgPerRoom };
  }

  get hasLivingEnemies(): boolean {
    return this.enemies.some((e) => !e.dead);
  }

  setRoom(room: Room): void {
    this.currentRoom?.dispose();
    this.currentRoom = room;
    this.scene.add(room.group);
  }

  spawnEnemy(type: EnemyType, x: number, z: number): Enemy {
    const enemy = createEnemy(type, x, z, this.difficulty);
    this.scene.add(...enemy.sceneObjects);
    this.enemies.push(enemy);
    this.effects.spawn(x, z, type === 'boss' ? 0xff4a2a : 0xb46bff);
    this.events.emit('enemy:spawned', { enemy });
    return enemy;
  }

  spawnArrow(x: number, z: number, angle: number): void {
    const arrow = new Arrow(x, z, angle, this.player.stats);
    this.scene.add(arrow.mesh);
    this.arrows.push(arrow);
  }

  spawnBullet(x: number, z: number, angle: number, speed: number, heavy = false): void {
    const damage = BALANCE.enemyBulletDamage * this.difficulty.dmgMul * (heavy ? 1.3 : 1);
    const bullet = new EnemyBullet(x, z, angle, speed, damage, heavy);
    this.scene.add(bullet.mesh);
    this.bullets.push(bullet);
  }

  dropXp(x: number, z: number, total: number): void {
    const count = Math.max(1, Math.round(total / 4));
    for (let i = 0; i < count; i++) {
      const orb = new XpOrb(x + rand(-0.5, 0.5), z + rand(-0.5, 0.5), total / count);
      this.scene.add(orb.mesh);
      this.orbs.push(orb);
    }
  }

  damagePlayer(amount: number): void {
    const dealt = this.player.takeDamage(amount);
    if (dealt <= 0) return;
    this.events.emit('player:damaged', { amount: dealt });
    if (!this.player.alive) this.events.emit('player:died', null);
  }

  healPlayer(amount: number, silent = false): void {
    const healed = this.player.heal(amount);
    if (healed > 0) this.events.emit('player:healed', { amount: healed, silent });
  }

  killEnemy(enemy: Enemy): void {
    if (enemy.dead) return;
    enemy.die();
    this.effects.death(enemy.x, enemy.centerY, enemy.z, DEATH_COLORS[enemy.type] ?? 0xffe08a, enemy.isBoss);
    this.dropXp(enemy.x, enemy.z, enemy.def.xp);
    const lifesteal = this.player.stats.lifestealOnKill;
    if (lifesteal > 0) this.healPlayer(this.player.maxHp * lifesteal, true);
    this.events.emit('enemy:killed', { enemy });
  }

  /** Removes and disposes everything that is finished. Dead enemies stay until their death animation ends. */
  collectGarbage(): void {
    removeWhere(this.enemies, (e) => e.removable, (e) => e.dispose());
    removeWhere(this.arrows, (a) => a.dead, (a) => a.mesh.removeFromParent());
    removeWhere(this.bullets, (b) => b.dead, (b) => b.mesh.removeFromParent());
    removeWhere(this.orbs, (o) => o.dead, (o) => o.mesh.removeFromParent());
  }

  /** Clears all room-scoped entities immediately (between rooms / on restart). */
  clearDynamic(): void {
    removeWhere(this.enemies, () => true, (e) => e.dispose());
    for (const list of [this.arrows, this.bullets, this.orbs]) for (const item of list) item.dead = true;
    this.collectGarbage();
  }
}
