import type { TagId } from '../data/augments';
import type { Enemy } from '../entities/Enemy';

export type DamageKind = 'arrow' | 'shard' | 'dot' | 'aoe' | 'chain' | 'blade' | 'storm' | 'thorns' | 'execute';

export type EnemyAttackKind = 'bite' | 'spit' | 'throw' | 'slam' | 'cast' | 'charge' | 'impact' | 'roar' | 'stomp';

/** Every cross-system event in the game. UI and feedback (sound, shake, numbers) subscribe to these. */
export interface GameEvents {
  'weapon:fired': { x: number; z: number };
  'projectile:blocked': { x: number; z: number };
  'enemy:spawned': { enemy: Enemy };
  'enemy:attack': { enemy: Enemy; kind: EnemyAttackKind };
  /** `kind`: what dealt it — the bow ('arrow'), or an augment effect. */
  'enemy:damaged': { enemy: Enemy; amount: number; critical: boolean; kind: DamageKind };
  'enemy:killed': { enemy: Enemy };
  'player:damaged': { amount: number };
  'player:healed': { amount: number; silent: boolean };
  'player:died': null;
  'player:dodged': null;
  'player:revived': null;
  'augment:set': { tag: TagId };
  /** A boss crossed an HP threshold. `phase` is 1 for the first transition; `last` marks the final one. */
  'boss:phase': { enemy: Enemy; phase: number; last: boolean };
  /** A boss's damage shield went up / came down (Necromancer bone shield). */
  'boss:shield': { enemy: Enemy; on: boolean };
  'hazard:exploded': { x: number; z: number; radius: number };
  'camera:shake': { intensity: number };
  'xp:changed': { xp: number; needed: number; level: number };
  'level:up': { level: number };
  'room:entered': { roomNo: number; isBoss: boolean };
  'room:cleared': { roomNo: number; isBoss: boolean };
}
