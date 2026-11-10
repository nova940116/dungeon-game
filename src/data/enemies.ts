import { BALANCE } from '../config';

export type EnemyType = 'slime' | 'bat' | 'shooter' | 'golem' | 'midboss' | 'boss';

/** Presentation + phase data for boss-class enemies. */
export interface BossInfo {
  /** Small label above the name (HUD bar / intro banner). */
  title: string;
  name: string;
  /** Stage bosses get the full dread treatment (dark arena, vignette, bigger intro). */
  stage: boolean;
  /** Signature color: aura, rune circle, light, spawn / death effects. */
  color: number;
  /** HP ratios at which the boss enters its next phase, descending. */
  phaseAt: readonly number[];
  /** Toast shown when the matching phase starts. */
  phaseToasts: readonly string[];
}

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
  bossInfo?: BossInfo;
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
  midboss: def({
    hp: 620, radius: 1.25, contactDamage: 22, xp: 45, barHeight: 4.6, boss: true,
    bossInfo: {
      title: '중간 보스', name: '고대 골렘', stage: false, color: 0xa855ff,
      phaseAt: [0.5],
      phaseToasts: ['고대 골렘이 격노했다!'],
    },
  }),
  boss: def({
    hp: 950, radius: 1.7, contactDamage: 30, xp: 110, barHeight: 6, boss: true,
    bossInfo: {
      title: '스테이지 보스', name: '심연의 마왕', stage: true, color: 0xff3a1a,
      phaseAt: [0.66, 0.33],
      phaseToasts: ['마왕이 진정한 힘을 드러낸다!', '마왕이 광폭화했다!'],
    },
  }),
};

/** Which boss guards a room: a stage boss every `stageBossEvery` rooms, a mid-boss on the other boss rooms. */
export function bossTypeForRoom(roomNo: number): EnemyType | null {
  if (roomNo <= 0 || roomNo % BALANCE.bossEvery !== 0) return null;
  return roomNo % BALANCE.stageBossEvery === 0 ? 'boss' : 'midboss';
}

/** Which enemies can appear, by room number (first matching entry wins). */
const SPAWN_TABLE: { untilRoom: number; pool: EnemyType[] }[] = [
  { untilRoom: 2, pool: ['slime', 'slime', 'bat'] },
  { untilRoom: 6, pool: ['slime', 'bat', 'shooter', 'shooter'] },
  { untilRoom: Infinity, pool: ['slime', 'bat', 'shooter', 'golem'] },
];

export const enemyPoolForRoom = (roomNo: number): EnemyType[] =>
  (SPAWN_TABLE.find((row) => roomNo <= row.untilRoom) ?? SPAWN_TABLE[SPAWN_TABLE.length - 1]).pool;

export const enemyCountForRoom = (roomNo: number): number => Math.min(3 + Math.floor(roomNo / 2), 9);
