/** A point on the floor plane. The game is 2.5D: all gameplay happens on x/z. */
export interface Vec2 {
  x: number;
  z: number;
}

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);

export const randInt = (min: number, maxInclusive: number): number => Math.floor(rand(min, maxInclusive + 1));

export const pickOne = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

export const distance = (ax: number, az: number, bx: number, bz: number): number => Math.hypot(bx - ax, bz - az);

/** Yaw angle (around Y) that points from a to b. Models face +Z, so this is atan2(dx, dz). */
export const angleTo = (ax: number, az: number, bx: number, bz: number): number => Math.atan2(bx - ax, bz - az);

export const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Smoothly rotates `current` toward `target` taking the shortest path. */
export const dampAngle = (current: number, target: number, rate: number, dt: number): number =>
  current + wrapAngle(target - current) * Math.min(1, dt * rate);

/** Removes items matching `predicate` in place, calling `onRemove` for each. */
export function removeWhere<T>(items: T[], predicate: (item: T) => boolean, onRemove?: (item: T) => void): void {
  let write = 0;
  for (let read = 0; read < items.length; read++) {
    const item = items[read];
    if (predicate(item)) onRemove?.(item);
    else items[write++] = item;
  }
  items.length = write;
}

/**
 * Splits a health bar between HP and shield. The bar spans max HP, or HP + shield when that is
 * larger, so the shield segment always fits right after the HP segment.
 */
export function shieldedRatios(hp: number, max: number, shield: number): { hp: number; shield: number } {
  const total = Math.max(max, hp + shield, 1);
  return { hp: clamp(hp / total, 0, 1), shield: clamp(shield / total, 0, 1) };
}
