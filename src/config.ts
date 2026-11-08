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
  bossEvery: 5,
  enemyHpPerRoom: 0.2,
  enemyDmgPerRoom: 0.07,
  enemyBulletDamage: 10,
  enemySpawnTime: 0.8,
  arrowSpeed: 17,
  arrowLife: 1.6,
  playerBaseHp: 100,
  playerInvulnerableTime: 0.7,
  bossClearHealRatio: 0.3,
  xpBase: 18,
  xpPerLevel: 14,
  orbMagnetRadius: 2.6,
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
} as const;
