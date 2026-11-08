/** Everything skills can modify about the player's attack and movement. */
export interface PlayerStats {
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
  /** Fraction of max HP restored per kill. */
  lifestealOnKill: number;
  moveSpeed: number;
}

export const createDefaultStats = (): PlayerStats => ({
  damage: 22,
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
  lifestealOnKill: 0,
  moveSpeed: 6,
});
