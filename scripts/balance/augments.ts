/** Per-augment value table (`npm run balance -- augments`): damage (1 target / crowd) and effective-HP multipliers from a fresh hero. */
import { AUGMENTS } from '../../src/data/augments';
import { CLASSES } from '../../src/data/classes';
import { createDefaultStats } from '../../src/entities/PlayerStats';
import { isMelee } from '../../src/systems/ProgressionSystem';
import { offense } from './model';
const ehp = (p: any) => { const s = p.stats; return (p.maxHp / (1 - Math.min(0.6, s.armor)) / (1 - Math.min(0.5, s.dodge))) + s.shieldPerRoom * p.maxHp + s.regen * p.maxHp * 20 + s.lifestealOnKill * p.maxHp * 6 + s.roomClearHeal * p.maxHp + s.revives * p.maxHp * 0.5 + s.lifestealOnHit * 300; };
function mk(cls: any) { const c = CLASSES[cls]; const p: any = { cls, hp: c.maxHp, maxHp: c.maxHp, stats: createDefaultStats() }; c.stats(p.stats);
  p.heal = (a: number) => 0; p.increaseMaxHp = (a: number) => { p.maxHp += a; }; p.scaleMaxHp = (f: number) => { p.maxHp *= f; }; return p; }
for (const cls of ['archer', 'swordsman']) {
  const rows: any[] = [];
  for (const a of AUGMENTS) {
    const base = mk(cls); if (a.instant) continue;
    if (a.only && a.only !== cls) continue;
    if (a.ranged && isMelee(base)) continue; if (a.melee && !isMelee(base)) continue;
    const q = mk(cls); a.apply(q, { addRerolls() {} } as any);
    rows.push({ id: a.id, tier: a.tier, dps1: +(offense(q, 1).single / offense(base, 1).single).toFixed(2), dps6: +(offense(q, 6).crowdDps / offense(base, 6).crowdDps).toFixed(2), ehp: +(ehp(q) / ehp(base)).toFixed(2) });
  }
  rows.sort((x, y) => (x.tier > y.tier ? 1 : -1) || (y.dps6 - x.dps6));
  console.log('== ' + cls); console.table(rows);
}
