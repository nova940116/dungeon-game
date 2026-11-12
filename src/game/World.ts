import type * as THREE from 'three';
import { BALANCE } from '../config';
import type { EventBus } from '../engine/EventBus';
import { ENEMY_DEFS, difficultyForRoom, type EnemyType } from '../data/enemies';
import type { Difficulty, Enemy } from '../entities/Enemy';
import { createEnemy } from '../entities/enemies';
import { Hazard } from '../entities/Hazard';
import type { Player } from '../entities/Player';
import { Arrow, type ArrowOptions } from '../entities/projectiles/Arrow';
import type { ProjectileKind } from '../assets/models/EnemyProjectiles';
import { EnemyBullet } from '../entities/projectiles/EnemyBullet';
import type { EffectsSystem } from '../systems/EffectsSystem';
import type { Room } from '../world/Room';
import { distance, rand, removeWhere } from '../utils/math';
import type { DamageKind, GameEvents } from './events';

const DEATH_COLORS: Partial<Record<EnemyType, number>> = {
  slime: 0x7dff6a,
  bat: 0xc58bff,
  shooter: 0x5ab8ff,
  golem: 0xffb070,
  troll: 0x8fbf5a,
  bee: 0xffc83a,
  plant: 0xff4a6a,
};
const MINION_SPAWN_COLOR = 0xb46bff;

/**
 * Container for everything alive in the current room, plus spawn / damage helpers.
 * Systems read and mutate the world; they never talk to each other directly.
 */
export class World {
  readonly enemies: Enemy[] = [];
  readonly arrows: Arrow[] = [];
  readonly bullets: EnemyBullet[] = [];
  readonly hazards: Hazard[] = [];
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
    return difficultyForRoom(this.roomNo);
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
    const d = ENEMY_DEFS[type];
    this.effects.spawn(x, z, d.bossInfo?.color ?? d.spawnColor ?? MINION_SPAWN_COLOR);
    this.events.emit('enemy:spawned', { enemy });
    return enemy;
  }

  spawnArrow(x: number, z: number, angle: number, opts: ArrowOptions = {}): Arrow {
    const arrow = new Arrow(x, z, angle, this.player.stats, opts);
    this.scene.add(arrow.mesh);
    this.arrows.push(arrow);
    return arrow;
  }

  /** `kind` decides the look (acid spit, rock, crystal shard, fireball, shadow bolt); `heavy` hits harder and is bigger. */
  spawnBullet(x: number, z: number, angle: number, speed: number, kind: ProjectileKind, heavy = false): void {
    const damage = BALANCE.enemyBulletDamage * this.difficulty.dmgMul * (heavy ? 1.3 : 1);
    const bullet = new EnemyBullet(x, z, angle, speed, damage, kind, heavy);
    this.scene.add(bullet.mesh);
    this.bullets.push(bullet);
  }

  /** Telegraphed ground explosion: warns for `delay` seconds, then damages the player if inside. */
  spawnHazard(x: number, z: number, radius: number, delay: number, color: number): void {
    const hazard = new Hazard(x, z, radius, delay, BALANCE.hazardDamage * this.difficulty.dmgMul, color);
    this.scene.add(hazard.mesh);
    this.hazards.push(hazard);
  }

  /** Every hit on the player: dodge → armor → shield → HP (→ revive), plus thorns on the attacker. */
  damagePlayer(amount: number, source?: Enemy): void {
    const { player } = this;
    const s = player.stats;
    if (!player.alive || player.isInvulnerable) return;
    if (Math.random() < Math.min(0.5, s.dodge)) {
      player.grantInvulnerability(0.35);
      this.events.emit('player:dodged', null);
      return;
    }
    const reduced = amount * (1 - Math.min(0.6, s.armor));
    if (source && s.thorns > 0 && !source.dead) this.damageEnemy(source, s.damage * s.thorns, 'thorns');
    const { dealt, revived } = player.takeDamage(reduced);
    if (dealt > 0) this.events.emit('player:damaged', { amount: dealt });
    if (revived) {
      this.effects.levelUp(player.x, player.z);
      this.events.emit('player:revived', null);
    } else if (!player.alive) {
      this.events.emit('player:died', null);
    }
  }

  /**
   * Every hit on an enemy goes through here: damage modifiers, numbers, lifesteal, execute, death.
   * Returns true if the enemy died.
   */
  damageEnemy(enemy: Enemy, base: number, kind: DamageKind, critical = false): boolean {
    if (enemy.dead) return false;
    const s = this.player.stats;
    let amount = base;
    if (enemy.isBoss) amount *= s.bossDamageMul;
    amount *= enemy.damageTakenMul;
    if (enemy.status.markTime > 0) amount *= 1 + enemy.status.mark;
    if (enemy.chilled) amount *= 1 + s.chilledVuln;
    if (enemy.frozen) amount *= 1 + s.frozenVuln;
    if (s.berserk > 0) amount *= 1 + s.berserk * 100 * (1 - this.player.hp / this.player.maxHp);
    amount = Math.max(1, Math.round(amount));

    let killed = enemy.applyDamage(amount, kind === 'arrow' || kind === 'slash');
    this.events.emit('enemy:damaged', { enemy, amount, critical, kind });
    if (s.lifestealOnHit > 0 && kind !== 'dot') this.healPlayer(amount * s.lifestealOnHit, true);
    if (!killed && !enemy.isBoss && s.executeThreshold > 0 && enemy.hp <= enemy.maxHp * s.executeThreshold) {
      this.events.emit('enemy:damaged', { enemy, amount: Math.ceil(enemy.hp), critical: true, kind: 'execute' });
      enemy.hp = 0;
      killed = true;
    }
    if (killed) this.killEnemy(enemy);
    return killed;
  }

  /** Damages every living enemy within `radius` of a point (except `exclude`). */
  damageArea(x: number, z: number, radius: number, amount: number, kind: DamageKind, exclude?: Enemy): void {
    for (const e of [...this.enemies]) {
      if (e === exclude || e.dead || distance(e.x, e.z, x, z) > radius + e.radius) continue;
      this.damageEnemy(e, amount, kind);
    }
  }

  /** A random walkable point `minR`…`maxR` away from (x, z): inside the arena and off the rocks. */
  freeSpotNear(x: number, z: number, minR: number, maxR: number, margin = 1): { x: number; z: number } {
    const { bounds } = this.room;
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(minR, maxR);
      const px = x + Math.sin(a) * r;
      const pz = z + Math.cos(a) * r;
      if (px < bounds.x0 + margin || px > bounds.x1 - margin || pz < bounds.z0 + margin || pz > bounds.z1 - margin) continue;
      if (this.room.obstacleAt(px, pz)) continue;
      return { x: px, z: pz };
    }
    return { x: Math.max(bounds.x0 + margin, Math.min(bounds.x1 - margin, x)), z: Math.max(bounds.z0 + margin, Math.min(bounds.z1 - margin, z)) };
  }

  /** Living (non-boss) enemies of the given types. */
  countAlive(...types: EnemyType[]): number {
    return this.enemies.filter((e) => !e.dead && types.includes(e.type)).length;
  }

  /** Nearest living enemy to a point, optionally within a range and skipping some. */
  nearestEnemy(x: number, z: number, range = Infinity, skip?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e.dead || e.spawning || skip?.(e)) continue;
      const d = distance(e.x, e.z, x, z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  healPlayer(amount: number, silent = false): void {
    const healed = this.player.heal(amount);
    if (healed > 0) this.events.emit('player:healed', { amount: healed, silent });
  }

  killEnemy(enemy: Enemy): void {
    if (enemy.dead) return;
    enemy.die();
    const color = enemy.def.bossInfo?.color ?? DEATH_COLORS[enemy.type] ?? 0xffe08a;
    this.effects.death(enemy.x, enemy.centerY, enemy.z, color, enemy.isBoss);
    const s = this.player.stats;
    if (s.lifestealOnKill > 0) this.healPlayer(this.player.maxHp * s.lifestealOnKill, true);
    this.events.emit('enemy:killed', { enemy });
    this.onKillEffects(enemy);
    if (enemy.isBoss) this.endBossFight(enemy, color);
  }

  /** Augment effects that trigger when an enemy dies (they can chain into further kills). */
  private onKillEffects(enemy: Enemy): void {
    const s = this.player.stats;
    const { x, z, status } = enemy;
    if (s.killBurst > 0) {
      this.effects.eruption(x, z, 2.4, 0xffa040);
      this.damageArea(x, z, 2.4, s.damage * s.killBurst, 'aoe', enemy);
    }
    if (s.burnExplode && status.burnTime > 0) {
      this.effects.eruption(x, z, 2.2, 0xff5a14);
      this.damageArea(x, z, 2.2, s.damage * 0.8 + status.burnDps * 2, 'aoe', enemy);
    }
    if (s.poisonSpread && status.poisonTime > 0 && status.poisonStacks > 0) {
      this.effects.shockwave(x, z, 2.8, 0x7cff4a);
      for (const e of this.enemies) {
        if (e.dead || e === enemy || distance(e.x, e.z, x, z) > 3) continue;
        e.status.poisonStacks = Math.min(s.poisonMaxStacks, e.status.poisonStacks + Math.ceil(status.poisonStacks / 2));
        e.status.poisonTime = 4;
      }
    }
    for (let i = 0; i < s.killArrows; i++) {
      this.spawnArrow(x, z, (i / s.killArrows) * Math.PI * 2 + rand(0, 0.5), { damageMul: 0.5, minor: true, ignore: enemy });
    }
  }

  /** A boss's death ends the fight: its attacks fizzle out and its minions fall with it. */
  private endBossFight(boss: Enemy, color: number): void {
    this.effects.roar(boss.x, boss.z, boss.radius * 6, color);
    for (const b of this.bullets) {
      b.dead = true;
      this.effects.pop(b.x, 0.8, b.z, b.color);
    }
    for (const h of this.hazards) h.dead = true;
    for (const other of [...this.enemies]) if (!other.isBoss) this.killEnemy(other);
  }

  /** Removes and disposes everything that is finished. Dead enemies stay until their death animation ends. */
  collectGarbage(): void {
    removeWhere(this.enemies, (e) => e.removable, (e) => e.dispose());
    removeWhere(this.arrows, (a) => a.dead, (a) => a.mesh.removeFromParent());
    removeWhere(this.bullets, (b) => b.dead, (b) => b.mesh.removeFromParent());
    removeWhere(this.hazards, (h) => h.dead, (h) => h.mesh.removeFromParent());
  }

  /** Clears all room-scoped entities immediately (between rooms / on restart). */
  clearDynamic(): void {
    removeWhere(this.enemies, () => true, (e) => e.dispose());
    for (const list of [this.arrows, this.bullets, this.hazards]) for (const item of list) item.dead = true;
    this.collectGarbage();
  }
}
