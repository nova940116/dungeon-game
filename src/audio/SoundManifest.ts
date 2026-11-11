/**
 * Runtime sound table. Files are cut from CC0 recordings by `npm run assets:sounds`
 * (see "sounds" in scripts/asset-sources.json) as public/assets/audio/<key>_<n>.mp3.
 * Only the bow, hits and boss skills make sound.
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
  bow_shoot: { variants: 1, volume: 0.45, cooldown: 0.05, maxVoices: 3 }, // one fixed sound, no pitch jitter
  sword_swing: { variants: 2, volume: 0.45, rate: [0.95, 1.07], cooldown: 0.08, maxVoices: 3 },
  arrow_hit: { variants: 1, volume: 0.32, rate: [0.96, 1.04], cooldown: 0.035, maxVoices: 4 },
  arrow_crit: { variants: 1, volume: 0.42, rate: [0.97, 1.03], cooldown: 0.06, maxVoices: 2 },
  sword_hit: { variants: 2, volume: 0.5, rate: [0.94, 1.06], cooldown: 0.03, maxVoices: 4 },
  sword_crit: { variants: 1, volume: 0.6, rate: [0.97, 1.03], cooldown: 0.06, maxVoices: 2 },

  boss_slam: { variants: 2, volume: 1, cooldown: 0.2, maxVoices: 2 },
  boss_impact: { variants: 1, volume: 1, cooldown: 0.3 },
  boss_cast: { variants: 2, volume: 0.9, rate: [0.92, 1.02], cooldown: 0.5 },
  boss_swing: { variants: 2, volume: 0.85, rate: [0.95, 1.05], cooldown: 0.25 },
  hazard_blast: { variants: 2, volume: 0.6, rate: [0.9, 1.05], cooldown: 0.07, maxVoices: 3 },
} satisfies Record<string, SoundSpec>;

export type SoundKey = keyof typeof SOUNDS;

export const soundUrl = (key: SoundKey, variant: number): string => `${import.meta.env.BASE_URL}assets/audio/${key}_${variant}.mp3`;
