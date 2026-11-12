/**
 * Balance model (`npm run balance`): runs the real progression (augment pool, rolls, XP curve, room waves,
 * scaling) with a greedy augment picker, 30 seeds per class, and estimates per room:
 *   lvl / hpMax / ehp   level, max HP and effective HP (armour, dodge, shields, sustain)
 *   dps                 damage per second vs the room (crowd) or the boss (single target)
 *   clear               seconds to kill everything at that dps (lower bound: no walking or dodging)
 *   hitsToDie           how many of the room's typical hits the hero can take
 * Combat is an analytic estimate, not a simulation: use it to compare curves and classes, not as exact times.
 * Env: CLS=archer|swordsman (required to print the table), ROOMS (default 40), MELEE (sword multiplier, default 1.4).
 */
import { BALANCE } from '../../src/config';
import { AUGMENTS, TIERS } from '../../src/data/augments';
import { CLASSES, type PlayerClass } from '../../src/data/classes';
import { ENEMY_DEFS, bossTypeForRoom, difficultyForRoom, xpRewardMul, enemyCountForRoom, enemyPoolForRoom, type EnemyType } from '../../src/data/enemies';
import { EventBus } from '../../src/engine/EventBus';
import { createDefaultStats, type PlayerStats } from '../../src/entities/PlayerStats';
import { ProgressionSystem, isMelee } from '../../src/systems/ProgressionSystem';

const MELEE = Number(process.env.MELEE ?? 1.4), FINISHER = 1.6, ROOMS = Number(process.env.ROOMS ?? 40);

function fakePlayer(cls: PlayerClass) {
  const c = CLASSES[cls];
  const p: any = { cls, hp: c.maxHp, maxHp: c.maxHp, stats: createDefaultStats(), shield: 0 };
  c.stats(p.stats);
  p.heal = (a: number) => { const b = p.hp; p.hp = Math.min(p.maxHp, p.hp + a); return p.hp - b; };
  p.increaseMaxHp = (a: number) => { p.maxHp += a; p.hp += a; };
  p.scaleMaxHp = (f: number) => { const r = p.hp / p.maxHp; p.maxHp = Math.round(p.maxHp * f); p.hp = Math.round(p.maxHp * r); };
  return p;
}

/** Damage per second against one target, and how many targets a typical attack reaches in a crowd. */
export function offense(p: any, crowd: number) {
  const s: PlayerStats = p.stats;
  const crit = 1 + Math.min(1, s.critChance) * (s.critMultiplier - 1);
  const ramp = 1 + s.stillRamp * 0.6;
  const rate = (s.volleys / s.attackInterval) * ramp;
  const vuln = (1 + s.markOnHit * 0.8) * (1 + s.chilledVuln * Math.min(1, s.slowOnHit * 2 + s.freezeChance * 2)) * (1 + s.frozenVuln * Math.min(0.5, s.freezeChance * 1.5));
  const dots = 1 + s.burnDamage * 3 * 0.5 + (s.poisonPerHit > 0 ? Math.min(s.poisonMaxStacks, s.poisonPerHit * 4) * s.poisonDps : 0) + s.chainChance * s.chainDamage * 0.5;
  let hit: number, targets: number;
  if (isMelee(p)) {
    hit = s.damage * MELEE * s.meleeDamageMul * (2 + FINISHER * 1.2) / 3;
    const reach = 3 * s.meleeRangeMul;
    targets = Math.min(crowd, 1 + (reach / 3) * (s.meleeArcMul) * 1.0 * Math.min(2.5, crowd / 4) + (s.spinFinisher ? 0.4 : 0));
  } else {
    hit = s.damage;
    const arrows = s.frontArrows + s.diagonalPairs * 2 + (s.sideArrows ? 2 : 0) + (s.backArrow ? 1 : 0);
    const singleExtra = Math.min(s.frontArrows - 1, 2) * 0.7 + s.diagonalPairs * 0.15;     // extra arrows that still hit the main target
    hit *= 1 + singleExtra;
    targets = Math.min(crowd, 1 + (arrows - 1) * 0.12 * Math.min(1, crowd / 6) + s.pierce * 0.5 + s.ricochet * 0.7 + s.splitShards * 0.4 * 0.5 + (s.wallBounces > 0 ? 0.2 : 0));
  }
  const aoe = s.explodeRadius > 0 ? s.explodeDamage * Math.min(crowd, 2.5) : 0;
  const single = hit * crit * rate * vuln * dots;
  const extra = (s.orbitBlades * s.orbitDamage * s.damage * 0.8 + (s.novaDamage > 0 ? (s.novaDamage * s.damage) / s.novaInterval : 0) * Math.min(crowd, 3)
    + s.stormStrikes * s.stormDamage * s.damage / 3 + s.spiritArrows * 0.6 * s.damage / 1.2) * crit;
  const killBonus = 1 + (s.killBurst + s.killArrows * 0.12 + s.executeThreshold * 1.5 + (s.burnExplode ? 0.3 : 0)) * 0.25;
  return { single: single + extra, crowdDps: (single * (targets + aoe) + extra) * killBonus };
}

function room(roomNo: number) {
  const d = difficultyForRoom(roomNo);
  const boss = bossTypeForRoom(roomNo);
  if (boss) { const e = ENEMY_DEFS[boss]; return { boss, hp: e.hp * d.hpMul, xp: e.xp, dmg: e.contactDamage * d.dmgMul, count: 1, bullet: BALANCE.enemyBulletDamage * d.dmgMul, d }; }
  const pool = enemyPoolForRoom(roomNo); const n = enemyCountForRoom(roomNo);
  const avg = (k: 'hp' | 'xp' | 'contactDamage') => pool.reduce((a, t) => a + ENEMY_DEFS[t as EnemyType][k], 0) / pool.length;
  return { boss: null, hp: avg('hp') * d.hpMul * n, xp: avg('xp') * n, dmg: avg('contactDamage') * d.dmgMul, count: n, bullet: BALANCE.enemyBulletDamage * d.dmgMul, d };
}

/** Greedy picker: offence for crowds, but takes defence when survivability lags. */
function pickScore(p: any, offer: any) {
  const clone = structuredClone({ ...p, heal: undefined, increaseMaxHp: undefined, scaleMaxHp: undefined });
  const q = fakePlayer(p.cls); Object.assign(q, clone); q.stats = structuredClone(p.stats);
  const before = offense(q, 6).crowdDps, ehp0 = ehp(q);
  try { offer.augment.apply(q, { addRerolls() {} }); } catch { return 0; }
  return offense(q, 6).crowdDps / before + 0.8 * (ehp(q) / ehp0) + (offer.augment.tier === 'prism' ? 0.05 : 0);
}
const ehp = (p: any) => { const s = p.stats; return (p.maxHp / (1 - Math.min(0.6, s.armor)) / (1 - Math.min(0.5, s.dodge))) + s.shieldPerRoom * p.maxHp + s.regen * p.maxHp * 20 + s.lifestealOnKill * p.maxHp * 6 + s.roomClearHeal * p.maxHp + s.revives * p.maxHp * 0.5; };

export function run(cls: PlayerClass, seed = 1) {
  let r = seed; const rng = () => ((r = (r * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const prog = new ProgressionSystem(new EventBus()); prog.random = rng; prog.reset();
  const p = fakePlayer(cls);
  const rows: any[] = [];
  const drain = () => { while (prog.pendingLevelUps > 0) { const offers = prog.rollOffers(p); if (!offers.length) { prog.skipPick(); continue; } const best = offers.map((o) => [pickScore(p, o), o] as const).sort((a, b) => b[0] - a[0])[0][1]; prog.choose(best.augment, p); } };
  drain();
  for (let n = 1; n <= ROOMS; n++) {
    const rm = room(n);
    const o = offense(p, rm.boss ? 1 : Math.min(rm.count, 6));
    const dps = rm.boss ? o.single * p.stats.bossDamageMul : o.crowdDps;
    const clear = rm.hp / dps;
    rows.push({ room: n, lvl: prog.level, hpMax: Math.round(p.maxHp), ehp: Math.round(ehp(p)), dps: Math.round(dps), enemyHp: Math.round(rm.hp), clear: +clear.toFixed(1), hitsToDie: +(ehp(p) / Math.max(rm.dmg, rm.bullet)).toFixed(1), enemyDmg: Math.round(rm.dmg), boss: rm.boss ?? '' });
    const lv0 = prog.level;
    prog.addXp(rm.xp * xpRewardMul(n) * p.stats.xpMul);
    for (let l = lv0; l < prog.level; l++) p.increaseMaxHp(Math.round(CLASSES[p.cls as PlayerClass].maxHp * BALANCE.hpPerLevel));
    if (rm.boss) prog.grantReward(n % BALANCE.stageBossEvery === 0 ? 'prism' : 'gold');
    drain();
  }
  return rows;
}
if (process.env.CLS) { const cls = (process.env.CLS ?? 'archer') as PlayerClass;
  const runs = Array.from({ length: 30 }, (_, i) => run(cls, i + 1));
  const avg = runs[0].map((row: any, i: number) => {
  const out: any = { room: row.room, boss: row.boss };
  for (const k of ['lvl', 'hpMax', 'ehp', 'dps', 'enemyHp', 'clear', 'hitsToDie', 'enemyDmg']) out[k] = +(runs.reduce((a, r) => a + r[i][k], 0) / runs.length).toFixed(1);
  return out;
});
  console.log(`== ${cls}`);
console.table(avg.filter((r: any) => r.room % 2 === 1 || r.boss)); }
