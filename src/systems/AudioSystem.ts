import type { AudioManager } from '../audio/AudioManager';
import type { SoundKey } from '../audio/SoundManifest';
import { ROOM } from '../config';
import type { EventBus } from '../engine/EventBus';
import type { Enemy } from '../entities/Enemy';
import type { EnemyAttackKind, GameEvents } from '../game/events';
import { clamp } from '../utils/math';

/**
 * Boss skills that make a sound. Besides these, only the player's weapon (bow / sword) and its hits
 * make sound. Everything else (regular monsters, roars, footsteps, UI,
 * level-ups…) is intentionally silent: the soundscape is only the bow, hits and boss skills.
 */
const BOSS_SKILL_SOUNDS: Partial<Record<EnemyAttackKind, SoundKey>> = {
  slam: 'boss_slam',
  cast: 'boss_cast',
  charge: 'boss_swing',
  throw: 'boss_swing',
  impact: 'boss_impact',
};

/**
 * Maps gameplay events to sound effects. Gameplay code never calls audio directly —
 * it only emits events, so sounds can be retuned or replaced here in one place.
 */
export class AudioSystem {
  constructor(
    private readonly audio: AudioManager,
    events: EventBus<GameEvents>,
  ) {
    events.on('weapon:fired', ({ x, weapon }) => this.at(weapon === 'sword' ? 'sword_swing' : 'bow_shoot', x));
    events.on('enemy:damaged', ({ enemy, critical, kind }) => {
      // Only the bow's arrows and the sword's cuts make a hit sound; augment damage (DoTs, blades, chains…) stays quiet.
      if (kind === 'arrow') this.at(critical ? 'arrow_crit' : 'arrow_hit', enemy.x);
      else if (kind === 'slash') this.at(critical ? 'sword_crit' : 'sword_hit', enemy.x);
    });
    events.on('enemy:attack', ({ enemy, kind }) => {
      const key = enemy.isBoss ? BOSS_SKILL_SOUNDS[kind] : undefined;
      if (key) this.at(key, enemy.x, 1, this.bossRate(enemy, key));
    });
    events.on('hazard:exploded', ({ x }) => this.at('hazard_blast', x));
  }

  private at(key: SoundKey, x: number, volume = 1, rate?: number): void {
    this.audio.play(key, { pan: this.pan(x), volume, rate });
  }

  /** The stage boss sounds a little deeper than the mid-boss; undefined keeps the manifest's random rate. */
  private bossRate(enemy: Enemy, key: SoundKey): number | undefined {
    if (key === 'boss_swing') return undefined;
    return enemy.def.bossInfo?.stage ? 0.92 : 1.04;
  }

  /** Subtle stereo placement by horizontal position in the arena. */
  private pan(x: number): number {
    return clamp(x / ROOM.halfWidth, -1, 1) * 0.6;
  }
}
