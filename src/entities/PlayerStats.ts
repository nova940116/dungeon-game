/** Everything augments can modify about the player. Systems read these numbers; augments only change them. */
export interface PlayerStats {
  // ---- bow
  damage: number;
  /** Seconds between volleys. */
  attackInterval: number;
  frontArrows: number;
  diagonalPairs: number;
  sideArrows: boolean;
  backArrow: boolean;
  /** Number of back-to-back volleys per attack. */
  volleys: number;
  pierce: number;
  wallBounces: number;
  critChance: number;
  critMultiplier: number;
  arrowSpeedMul: number;
  arrowLifeMul: number;
  /** Visual size and hit radius of arrows. */
  arrowScale: number;
  /** Max turn rate (rad/s) toward the nearest enemy. 0 = straight arrows. */
  homing: number;
  /** After a hit, the arrow redirects to another nearby enemy this many times. */
  ricochet: number;
  /** Shards spawned on hit (each deals 40% damage; shards never split). */
  splitShards: number;
  /** On-hit explosion: radius (0 = none) and damage as a fraction of the hit. */
  explodeRadius: number;
  explodeDamage: number;
  /** Instant knockback distance on hit (regular enemies). */
  knockback: number;
  /** Fire rate while moving, as a fraction of the normal rate (0 = only while standing still). */
  fireWhileMoving: number;
  /** Max attack speed bonus gained by standing still for 3 s. */
  stillRamp: number;

  // ---- swordsman
  /** Reach and damage of the close-range sword sweep. */
  meleeRangeMul: number;
  meleeDamageMul: number;
  /** Width of the sweep (multiplies its half-angle). */
  meleeArcMul: number;
  /** The third hit of the combo becomes a full spin. */
  spinFinisher: boolean;
  /** Archer "검을 뽑아라": swings the bow in melee instead of shooting. */
  meleeMode: boolean;

  // ---- damage modifiers
  bossDamageMul: number;
  /** Bonus damage against enemies at full HP. */
  ambush: number;
  /** Max bonus damage against far-away enemies. */
  sniper: number;
  /** Bonus damage per 1% of the player's missing HP. */
  berserk: number;
  /** Regular enemies at or below this HP fraction die instantly. */
  executeThreshold: number;

  // ---- elements / statuses
  /** Burn: damage per second as a fraction of the hit, for 3 s. */
  burnDamage: number;
  /** Burning enemies explode on death. */
  burnExplode: boolean;
  poisonPerHit: number;
  poisonMaxStacks: number;
  /** Damage per second per poison stack, as a fraction of `damage`. */
  poisonDps: number;
  /** Poisoned enemies spread their poison on death. */
  poisonSpread: boolean;
  /** Slow strength (0…0.6) applied on hit for 1.5 s. */
  slowOnHit: number;
  freezeChance: number;
  /** Bonus damage against slowed / frozen enemies. */
  chilledVuln: number;
  frozenVuln: number;
  chainChance: number;
  chainJumps: number;
  /** Chain lightning damage as a fraction of the hit. */
  chainDamage: number;
  /** Hit enemies take this much extra damage for 3 s. */
  markOnHit: number;
  /** Critical hits cause a small explosion. */
  critExplode: boolean;

  // ---- autonomous weapons
  orbitBlades: number;
  /** Blade damage as a fraction of `damage`. */
  orbitDamage: number;
  /** Shockwave around the player: damage fraction (0 = none), interval, radius. */
  novaDamage: number;
  novaInterval: number;
  novaRadius: number;
  /** Lightning strikes on random enemies every 3 s. */
  stormStrikes: number;
  stormDamage: number;
  /** Spirit archers that shoot on their own. */
  spiritArrows: number;
  /** On kill: explosion damage fraction (0 = none). */
  killBurst: number;
  /** On kill: arrows fired in all directions. */
  killArrows: number;

  // ---- survival
  lifestealOnKill: number;
  /** Fraction of damage dealt returned as HP. */
  lifestealOnHit: number;
  /** Damage reduction (capped at 60%). */
  armor: number;
  /** Chance to ignore a hit (capped at 50%). */
  dodge: number;
  /** HP per second, as a share of max HP. */
  regen: number;
  /** Shield granted on entering each room, as a share of max HP. */
  shieldPerRoom: number;
  /** Contact attackers take this × `damage`. */
  thorns: number;
  revives: number;
  /** Fraction of max HP restored when a room is cleared. */
  roomClearHeal: number;

  // ---- utility
  moveSpeed: number;
  xpMul: number;
  /** Global slow on every enemy and their bullets. */
  enemySlow: number;
}

export const createDefaultStats = (): PlayerStats => ({
  damage: 25,
  attackInterval: 0.62,
  frontArrows: 1,
  diagonalPairs: 0,
  sideArrows: false,
  backArrow: false,
  volleys: 1,
  pierce: 0,
  wallBounces: 0,
  critChance: 0.05,
  critMultiplier: 2,
  arrowSpeedMul: 1,
  arrowLifeMul: 1,
  arrowScale: 1,
  homing: 0,
  ricochet: 0,
  splitShards: 0,
  explodeRadius: 0,
  explodeDamage: 0,
  knockback: 0,
  fireWhileMoving: 0,
  stillRamp: 0,
  meleeRangeMul: 1,
  meleeDamageMul: 1,
  meleeArcMul: 1,
  spinFinisher: false,
  meleeMode: false,

  bossDamageMul: 1,
  ambush: 0,
  sniper: 0,
  berserk: 0,
  executeThreshold: 0,

  burnDamage: 0,
  burnExplode: false,
  poisonPerHit: 0,
  poisonMaxStacks: 10,
  poisonDps: 0.06,
  poisonSpread: false,
  slowOnHit: 0,
  freezeChance: 0,
  chilledVuln: 0,
  frozenVuln: 0,
  chainChance: 0,
  chainJumps: 3,
  chainDamage: 0.6,
  markOnHit: 0,
  critExplode: false,

  orbitBlades: 0,
  orbitDamage: 0.5,
  novaDamage: 0,
  novaInterval: 4,
  novaRadius: 3.6,
  stormStrikes: 0,
  stormDamage: 1.2,
  spiritArrows: 0,
  killBurst: 0,
  killArrows: 0,

  lifestealOnKill: 0,
  lifestealOnHit: 0,
  armor: 0,
  dodge: 0,
  regen: 0,
  shieldPerRoom: 0,
  thorns: 0,
  revives: 0,
  roomClearHeal: 0,

  moveSpeed: 6,
  xpMul: 1,
  enemySlow: 0,
});
