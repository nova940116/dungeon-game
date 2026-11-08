export type EnemyType = 'slime' | 'bat' | 'shooter' | 'golem' | 'boss';

export interface EnemyDef {
  hp: number;
  radius: number;
  contactDamage: number;
  xp: number;
  /** Height of the health bar above the floor. */
  barHeight: number;
  /** Visual hover height (flying enemies). */
  hoverY: number;
  /** Flying enemies ignore obstacles. */
  flying: boolean;
  boss: boolean;
  /** Max number of this type per room (undefined = no limit). */
  maxPerRoom?: number;
}

const def = (d: Partial<EnemyDef> & Pick<EnemyDef, 'hp' | 'radius' | 'contactDamage' | 'xp' | 'barHeight'>): EnemyDef => ({
  hoverY: 0,
  flying: false,
  boss: false,
  ...d,
});

export const ENEMY_DEFS: Record<EnemyType, EnemyDef> = {
  slime: def({ hp: 40, radius: 0.55, contactDamage: 12, xp: 6, barHeight: 1.9 }),
  bat: def({ hp: 26, radius: 0.45, contactDamage: 10, xp: 5, barHeight: 1.45, hoverY: 0.9, flying: true }),
  shooter: def({ hp: 46, radius: 0.55, contactDamage: 12, xp: 8, barHeight: 1.9 }),
  golem: def({ hp: 130, radius: 0.85, contactDamage: 18, xp: 15, barHeight: 2.9, maxPerRoom: 2 }),
  boss: def({ hp: 750, radius: 1.3, contactDamage: 25, xp: 70, barHeight: 4.1, boss: true }),
};

/** Which enemies can appear, by room number (first matching entry wins). */
const SPAWN_TABLE: { untilRoom: number; pool: EnemyType[] }[] = [
  { untilRoom: 2, pool: ['slime', 'slime', 'bat'] },
  { untilRoom: 6, pool: ['slime', 'bat', 'shooter', 'shooter'] },
  { untilRoom: Infinity, pool: ['slime', 'bat', 'shooter', 'golem'] },
];

export const enemyPoolForRoom = (roomNo: number): EnemyType[] =>
  (SPAWN_TABLE.find((row) => roomNo <= row.untilRoom) ?? SPAWN_TABLE[SPAWN_TABLE.length - 1]).pool;

export const enemyCountForRoom = (roomNo: number): number => Math.min(3 + Math.floor(roomNo / 2), 9);
