import type { Enemy } from '../entities/Enemy';
import type { Arrow } from '../entities/projectiles/Arrow';
import type { World } from '../game/World';
import { rand } from '../utils/math';

const BURN_TIME = 3;
const POISON_TIME = 4;
const SLOW_TIME = 1.5;
const FREEZE_TIME = 1.2;
const MARK_TIME = 3;
const CHAIN_RANGE = 5;

const COLORS = { fire: 0xff7a2a, frost: 0x8fd8ff, storm: 0xbfe4ff, venom: 0x86ff4a, blast: 0xffa040 } as const;

/** Augment effects of an arrow hit: statuses, explosions, chain lightning, shards, knockback. */
export function applyOnHit(world: World, enemy: Enemy, damage: number, arrow: Arrow, critical: boolean): void {
  const s = world.player.stats;
  const st = enemy.status;

  if (!enemy.dead) {
    if (s.burnDamage > 0) {
      st.burnDps = Math.max(st.burnDps, damage * s.burnDamage);
      st.burnTime = BURN_TIME;
    }
    if (s.poisonPerHit > 0) {
      st.poisonStacks = Math.min(s.poisonMaxStacks, st.poisonStacks + s.poisonPerHit);
      st.poisonTime = POISON_TIME;
    }
    if (s.slowOnHit > 0) {
      st.slow = Math.max(st.slow, s.slowOnHit);
      st.slowTime = SLOW_TIME;
    }
    if (s.freezeChance > 0 && Math.random() < s.freezeChance) {
      st.freezeTime = FREEZE_TIME;
      world.effects.frostBurst(enemy.x, enemy.centerY, enemy.z);
    }
    if (s.markOnHit > 0) {
      st.mark = Math.max(st.mark, s.markOnHit);
      st.markTime = MARK_TIME;
    }
    if (s.knockback > 0 && !enemy.isBoss) {
      const len = Math.hypot(arrow.vx, arrow.vz) || 1;
      enemy.x += (arrow.vx / len) * s.knockback;
      enemy.z += (arrow.vz / len) * s.knockback;
      world.room.constrain(enemy, enemy.radius);
    }
  }

  if (s.explodeRadius > 0) {
    world.effects.eruption(enemy.x, enemy.z, s.explodeRadius, COLORS.blast);
    world.damageArea(enemy.x, enemy.z, s.explodeRadius, damage * s.explodeDamage, 'aoe', enemy);
  }
  if (critical && s.critExplode) {
    world.effects.eruption(enemy.x, enemy.z, 1.6, 0xffe08a);
    world.damageArea(enemy.x, enemy.z, 1.6, damage * 0.5, 'aoe', enemy);
  }
  if (s.chainChance > 0 && Math.random() < s.chainChance) chainLightning(world, enemy, s.chainJumps, damage * s.chainDamage);
  if (!arrow.minor && s.splitShards > 0) {
    const n = s.splitShards;
    for (let i = 0; i < n; i++) {
      const spread = n === 1 ? 0 : (i / (n - 1) - 0.5) * 1.6;
      world.spawnArrow(enemy.x, enemy.z, arrow.angle + spread + rand(-0.1, 0.1), { damageMul: 0.4, minor: true, ignore: enemy });
    }
  }
}

/** Lightning that jumps from enemy to enemy, never hitting the same one twice. */
export function chainLightning(world: World, from: Enemy, jumps: number, damage: number): void {
  const hit = new Set<Enemy>([from]);
  let current = from;
  for (let i = 0; i < jumps; i++) {
    const next = world.nearestEnemy(current.x, current.z, CHAIN_RANGE, (e) => hit.has(e));
    if (!next) break;
    hit.add(next);
    world.effects.bolt(current.x, current.centerY, current.z, next.x, next.centerY, next.z, COLORS.storm);
    world.damageEnemy(next, damage, 'chain');
    current = next;
  }
}

/** Status ticks (burn / poison) and timers, plus their particles. */
export class StatusSystem {
  private tick = 0;
  private puff = 0;

  update(dt: number, world: World): void {
    const s = world.player.stats;
    this.tick -= dt;
    this.puff -= dt;
    const doTick = this.tick <= 0;
    const doPuff = this.puff <= 0;
    if (doTick) this.tick = 0.5;
    if (doPuff) this.puff = 0.12;

    for (const e of [...world.enemies]) {
      if (e.dead) continue;
      const st = e.status;
      st.burnTime = Math.max(0, st.burnTime - dt);
      st.poisonTime = Math.max(0, st.poisonTime - dt);
      st.slowTime = Math.max(0, st.slowTime - dt);
      st.freezeTime = Math.max(0, st.freezeTime - dt);
      st.markTime = Math.max(0, st.markTime - dt);
      if (st.burnTime <= 0) st.burnDps = 0;
      if (st.poisonTime <= 0) st.poisonStacks = 0;
      if (st.slowTime <= 0) st.slow = 0;
      if (st.markTime <= 0) st.mark = 0;

      if (doPuff) {
        const y = e.centerY * rand(0.4, 1.1);
        if (st.burnTime > 0) world.effects.ember(e.x + rand(-0.4, 0.4), y, e.z + rand(-0.4, 0.4), COLORS.fire);
        if (st.poisonTime > 0) world.effects.ember(e.x + rand(-0.4, 0.4), y, e.z + rand(-0.4, 0.4), COLORS.venom);
        if (e.chilled) world.effects.ember(e.x + rand(-0.4, 0.4), y, e.z + rand(-0.4, 0.4), COLORS.frost);
      }
      if (!doTick) continue;
      const dot = st.burnDps * 0.5 + st.poisonStacks * s.poisonDps * s.damage * 0.5;
      if (dot > 0) world.damageEnemy(e, dot, 'dot');
    }
  }
}

