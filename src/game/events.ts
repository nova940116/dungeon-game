import type { Enemy } from '../entities/Enemy';

export type EnemyAttackKind = 'bite' | 'spit' | 'throw' | 'slam' | 'cast' | 'charge' | 'impact' | 'roar';

/** Every cross-system event in the game. UI and feedback (sound, shake, numbers) subscribe to these. */
export interface GameEvents {
  'weapon:fired': { x: number; z: number };
  'projectile:blocked': { x: number; z: number };
  'enemy:spawned': { enemy: Enemy };
  'enemy:attack': { enemy: Enemy; kind: EnemyAttackKind };
  'enemy:damaged': { enemy: Enemy; amount: number; critical: boolean };
  'enemy:killed': { enemy: Enemy };
  'player:damaged': { amount: number };
  'player:healed': { amount: number; silent: boolean };
  'player:died': null;
  'pickup:collected': { x: number; z: number };
  /** A boss crossed an HP threshold. `phase` is 1 for the first transition; `last` marks the final one. */
  'boss:phase': { enemy: Enemy; phase: number; last: boolean };
  'hazard:exploded': { x: number; z: number; radius: number };
  'camera:shake': { intensity: number };
  'xp:changed': { xp: number; needed: number; level: number };
  'level:up': { level: number };
  'room:entered': { roomNo: number; isBoss: boolean };
  'room:cleared': { roomNo: number; isBoss: boolean };
}
