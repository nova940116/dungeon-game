/**
 * Runtime sound table. Files are produced by `npm run assets`
 * (see "sounds" in scripts/asset-sources.json) as public/assets/audio/<key>_<n>.mp3.
 */
export interface SoundSpec {
  /** Number of files (<key>_1.mp3 … <key>_N.mp3); a random one is picked each time. */
  variants: number;
  volume: number;
  /** Random playback-rate range — small pitch jitter keeps repeated sounds from feeling robotic. */
  rate?: [number, number];
  /** Minimum seconds between two plays of this sound. */
  cooldown?: number;
  /** Max simultaneous voices of this sound. */
  maxVoices?: number;
}

export const SOUNDS = {
  bow_shoot: { variants: 3, volume: 0.32, rate: [0.95, 1.15], cooldown: 0.05, maxVoices: 3 },
  arrow_hit: { variants: 2, volume: 0.42, rate: [0.9, 1.15], cooldown: 0.035, maxVoices: 4 },
  arrow_crit: { variants: 2, volume: 0.45, rate: [0.95, 1.1], cooldown: 0.06, maxVoices: 2 },
  arrow_block: { variants: 3, volume: 0.22, rate: [0.9, 1.2], cooldown: 0.09, maxVoices: 2 },

  enemy_spawn: { variants: 1, volume: 0.35, rate: [0.9, 1.1], cooldown: 0.25 },
  slime_bite: { variants: 2, volume: 0.4, rate: [0.9, 1.2], cooldown: 0.2 },
  slime_die: { variants: 3, volume: 0.65, rate: [0.9, 1.15], cooldown: 0.05 },
  bat_attack: { variants: 2, volume: 0.35, rate: [1.1, 1.4], cooldown: 0.25 },
  bat_die: { variants: 2, volume: 0.55, rate: [1.3, 1.6], cooldown: 0.05 },
  shooter_spit: { variants: 3, volume: 0.45, rate: [0.95, 1.2], cooldown: 0.12, maxVoices: 3 },
  shooter_die: { variants: 2, volume: 0.55, rate: [0.9, 1.1], cooldown: 0.05 },
  golem_throw: { variants: 2, volume: 0.55, rate: [0.85, 1.0], cooldown: 0.3 },
  golem_die: { variants: 2, volume: 0.75, rate: [0.8, 0.95], cooldown: 0.1 },

  boss_roar: { variants: 2, volume: 0.9, rate: [0.8, 0.9], cooldown: 1 },
  boss_slam: { variants: 2, volume: 0.75, rate: [0.8, 0.95], cooldown: 0.2 },
  boss_cast: { variants: 1, volume: 0.55, rate: [1.0, 1.15], cooldown: 0.3 },
  boss_charge: { variants: 1, volume: 0.7, rate: [0.85, 0.95], cooldown: 0.5 },
  boss_impact: { variants: 1, volume: 0.85, rate: [0.8, 0.9], cooldown: 0.3 },
  boss_die: { variants: 1, volume: 1, rate: [0.75, 0.8] },

  player_hurt: { variants: 2, volume: 0.6, rate: [1.0, 1.15], cooldown: 0.25 },
  player_die: { variants: 1, volume: 0.75, rate: [0.95, 1.0] },
  gem: { variants: 3, volume: 0.3, cooldown: 0.045, maxVoices: 4 },
  level_up: { variants: 1, volume: 0.7 },
  heal: { variants: 1, volume: 0.55 },
  room_clear: { variants: 1, volume: 0.55 },
  portal: { variants: 1, volume: 0.55, rate: [0.9, 0.95] },
  ui_click: { variants: 1, volume: 0.5 },
  ui_select: { variants: 1, volume: 0.6 },
  game_over: { variants: 1, volume: 0.65, rate: [0.9, 0.9] },
} satisfies Record<string, SoundSpec>;

export type SoundKey = keyof typeof SOUNDS;

export const soundUrl = (key: SoundKey, variant: number): string => `${import.meta.env.BASE_URL}assets/audio/${key}_${variant}.mp3`;
