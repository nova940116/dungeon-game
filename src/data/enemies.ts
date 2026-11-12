import { BALANCE } from '../config';

export type EnemyType =
  | 'slime' | 'bat' | 'shooter' | 'golem'
  | 'midboss' | 'spiderQueen' | 'boss' | 'necromancer'
  // summons
  | 'spiderling' | 'skeleton' | 'wraith' | 'deathKnight';

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
  /** Summoned undead claw their way out of the ground instead of fading in. */
  rise?: boolean;
  /** Colour of the summoning circle when it appears. */
  spawnColor?: number;
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
  spiderQueen: def({
    hp: 700, radius: 1.6, contactDamage: 22, xp: 60, barHeight: 3.9, boss: true,
    bossInfo: {
      title: '중간 보스', name: '서리 거미 여왕', stage: false, color: 0x6fd8ff,
      phaseAt: [0.5],
      phaseToasts: ['서리 거미 여왕이 격노했다!'],
    },
  }),
  necromancer: def({
    hp: 900, radius: 1.25, contactDamage: 20, xp: 140, barHeight: 4.9, boss: true,
    bossInfo: {
      title: '스테이지 보스', name: '망자의 군주', stage: true, color: 0x5dff7a,
      phaseAt: [0.66, 0.33],
      phaseToasts: ['망자의 군주가 죽음의 기사를 깨운다!', '망자의 군주가 모든 망자를 일으킨다!'],
    },
  }),
  // Summons: little XP so endless summoning can't be farmed.
  spiderling: def({ hp: 26, radius: 0.4, contactDamage: 9, xp: 1, barHeight: 0.95, spawnColor: 0x6fd8ff }),
  skeleton: def({ hp: 70, radius: 0.45, contactDamage: 14, xp: 2, barHeight: 2.3, rise: true, spawnColor: 0x5dff7a }),
  wraith: def({ hp: 55, radius: 0.45, contactDamage: 10, xp: 2, barHeight: 2.4, hoverY: 0.45, flying: true, spawnColor: 0x5dff7a }),
  deathKnight: def({ hp: 520, radius: 0.85, contactDamage: 24, xp: 10, barHeight: 3.9, rise: true, spawnColor: 0x5dff7a }),
  boss: def({
    hp: 950, radius: 1.7, contactDamage: 30, xp: 110, barHeight: 6, boss: true,
    bossInfo: {
      title: '스테이지 보스', name: '심연의 마왕', stage: true, color: 0xff3a1a,
      phaseAt: [0.66, 0.33],
      phaseToasts: ['마왕이 진정한 힘을 드러낸다!', '마왕이 광폭화했다!'],
    },
  }),
};

/** Boss rooms in order (5, 10, 15, 20), then the cycle repeats (25 = golem again, …). */
const BOSS_CYCLE: readonly EnemyType[] = ['midboss', 'boss', 'spiderQueen', 'necromancer'];

/** Which boss guards a room (null for regular rooms). Stage bosses fall on every `stageBossEvery`-th room. */
export function bossTypeForRoom(roomNo: number): EnemyType | null {
  if (roomNo <= 0 || roomNo % BALANCE.bossEvery !== 0) return null;
  return BOSS_CYCLE[(roomNo / BALANCE.bossEvery - 1) % BOSS_CYCLE.length];
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

/** 0 for rooms 1–10, 1 for rooms 11–20, … (a stage ends with its stage boss). */
export const stageOf = (roomNo: number): number => Math.floor((Math.max(1, roomNo) - 1) / BALANCE.stageBossEvery);

/**
 * Enemy HP / damage multipliers for a room: a steady climb every room, compounded by a bigger
 * jump each new stage, so later stages hit harder and take longer to kill.
 */
export function difficultyForRoom(roomNo: number): { hpMul: number; dmgMul: number } {
  const n = Math.max(0, roomNo - 1);
  const stage = stageOf(roomNo);
  return {
    hpMul: (1 + n * BALANCE.enemyHpPerRoom) * BALANCE.enemyHpPerStage ** stage,
    dmgMul: (1 + n * BALANCE.enemyDmgPerRoom) * BALANCE.enemyDmgPerStage ** stage,
  };
}
