import type { AudioManager } from '../audio/AudioManager';
import type { SoundKey } from '../audio/SoundManifest';
import { ROOM } from '../config';
import type { EnemyType } from '../data/enemies';
import type { EventBus } from '../engine/EventBus';
import type { GameEvents } from '../game/events';
import { clamp } from '../utils/math';

const DEATH_SOUNDS: Record<EnemyType, SoundKey> = {
  slime: 'slime_die',
  bat: 'bat_die',
  shooter: 'shooter_die',
  golem: 'golem_die',
  midboss: 'boss_die',
  boss: 'boss_die',
};

const GEM_STREAK_WINDOW = 0.6;

/**
 * Maps gameplay events to sound effects. Gameplay code never calls audio directly —
 * it only emits events, so sounds can be retuned or replaced here in one place.
 */
export class AudioSystem {
  private gemStreak = 0;
  private gemTimer = 0;

  constructor(
    private readonly audio: AudioManager,
    events: EventBus<GameEvents>,
  ) {
    events.on('weapon:fired', ({ x }) => this.at('bow_shoot', x));
    events.on('enemy:damaged', ({ enemy, critical }) => {
      this.at('arrow_hit', enemy.x);
      if (critical) this.at('arrow_crit', enemy.x);
    });
    events.on('projectile:blocked', ({ x }) => this.at('arrow_block', x, 0.8));
    events.on('enemy:spawned', ({ enemy }) => this.at(enemy.isBoss ? 'boss_roar' : 'enemy_spawn', enemy.x));
    events.on('enemy:attack', ({ enemy, kind }) => {
      const key: Record<typeof kind, SoundKey> = {
        bite: enemy.type === 'bat' ? 'bat_attack' : 'slime_bite',
        spit: 'shooter_spit',
        throw: 'golem_throw',
        slam: 'boss_slam',
        cast: 'boss_cast',
        charge: 'boss_charge',
        impact: 'boss_impact',
        roar: 'boss_roar',
      };
      this.at(key[kind], enemy.x);
    });
    events.on('enemy:killed', ({ enemy }) => this.at(DEATH_SOUNDS[enemy.type], enemy.x));
    events.on('boss:phase', () => this.audio.play('boss_roar', { rate: 0.75 }));
    events.on('hazard:exploded', ({ x }) => this.at('boss_impact', x, 0.55));

    events.on('player:damaged', () => this.audio.play('player_hurt'));
    events.on('player:died', () => {
      this.audio.play('player_die');
      window.setTimeout(() => this.audio.play('game_over'), 900);
    });
    events.on('player:healed', ({ silent }) => !silent && this.audio.play('heal'));
    events.on('pickup:collected', ({ x }) => {
      // Rising pitch while collecting a burst of gems.
      this.gemStreak = this.gemTimer > 0 ? this.gemStreak + 1 : 0;
      this.gemTimer = GEM_STREAK_WINDOW;
      this.audio.play('gem', { rate: Math.min(1.7, 1 + this.gemStreak * 0.05), pan: this.pan(x) });
    });
    events.on('level:up', () => this.audio.play('level_up'));
    events.on('room:cleared', () => this.audio.play('room_clear'));
    events.on('room:entered', ({ roomNo }) => roomNo > 1 && this.audio.play('portal'));
  }

  update(dt: number): void {
    this.gemTimer = Math.max(0, this.gemTimer - dt);
  }

  private at(key: SoundKey, x: number, volume = 1): void {
    this.audio.play(key, { pan: this.pan(x), volume });
  }

  /** Subtle stereo placement by horizontal position in the arena. */
  private pan(x: number): number {
    return clamp(x / ROOM.halfWidth, -1, 1) * 0.6;
  }
}
