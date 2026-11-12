/** Global tuning values. Gameplay numbers live here so designers can tweak without touching logic. */

export const ROOM = {
  halfWidth: 7,
  halfHeight: 13,
  doorHalfWidth: 1.5,
  /** How far past the door the player must walk to leave the room. */
  exitDepth: 1.4,
} as const;

export const CAMERA = {
  fov: 45,
  tiltDeg: 58,
  minDistance: 20,
  sideMargin: 1.6,
  followLead: 1.5,
  followSpeed: 5,
} as const;

export const BALANCE = {
  /** A boss room closes every chapter: a mid-boss, except on stage-boss rooms. */
  bossEvery: 5,
  /** Every Nth room is a stage boss (must be a multiple of `bossEvery`). */
  stageBossEvery: 10,
  /** Enemy scaling: linear per room, then compounded per stage (every `stageBossEvery` rooms). */
  enemyHpPerRoom: 0.2,
  enemyDmgPerRoom: 0.05,
  enemyHpPerStage: 1.35,
  enemyDmgPerStage: 1.12,
  /** Wave size: first room of a stage, plus this many per room after it (room 9 of a stage = 4 + 8 = 12). */
  enemiesFirstRoom: 4,
  enemiesPerRoom: 1,
  enemyBulletDamage: 10,
  enemySpawnTime: 0.8,
  /** Bosses take longer to materialize (intro banner + roar). */
  bossSpawnTime: 2.2,
  /** Telegraphed ground explosions (boss meteors / quakes). */
  hazardDamage: 16,
  arrowSpeed: 17,
  arrowLife: 1.6,
  playerBaseHp: 100,
  playerInvulnerableTime: 0.7,
  bossClearHealRatio: 0.3,
  /** XP to next level = xpBase + level × xpPerLevel + level² × xpGrowth. */
  xpBase: 18,
  xpPerLevel: 14,
  xpGrowth: 2,
  /** Enemy XP grows with the room (tougher rooms pay more), so levels keep coming as the XP bar grows. */
  xpPerRoom: 0.06,
  /** Max HP gained per level, as a share of the class's base HP (healed by the same amount). */
  hpPerLevel: 0.04,
} as const;

export const ENGINE = {
  maxDeltaTime: 0.05,
  maxPixelRatio: 2,
  shadowMapSize: 2048,
  bloom: { enabled: true, strength: 0.65, radius: 0.45, threshold: 1.0 },
} as const;

export const STORAGE_KEYS = {
  bestRoom: 'arrowDungeon.bestRoom',
  muted: 'arrowDungeon.muted',
  playerClass: 'arrowDungeon.class',
} as const;
