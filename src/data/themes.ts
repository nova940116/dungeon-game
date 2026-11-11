import { BALANCE } from '../config';
import { bossTypeForRoom, ENEMY_DEFS } from './enemies';
import type { ModelKey, ThemeId } from '../assets/AssetManifest';
import type { AmbientKind } from '../world/AmbientParticles';

export interface ThemeLighting {
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  envIntensity: number;
  exposure: number;
}

export interface Theme {
  id: ThemeId;
  name: string;
  /** Background + fog color. */
  sky: number;
  floorTint: number;
  groundTint: number;
  /** Large props around the arena. */
  trees: ModelKey[];
  /** Small props around the arena and along the inner walls. */
  shrubs: ModelKey[];
  /** Models that make up in-arena obstacles. */
  rocks: ModelKey[];
  /** Emissive tint for crystals (if the theme uses them). */
  crystalColor?: number;
  wallTint: number;
  light: ThemeLighting;
  ambient: AmbientKind;
}

/** One theme per chapter (every `BALANCE.bossEvery` rooms). */
export const THEMES: readonly Theme[] = [
  {
    id: 'forest', name: '초록 숲', sky: 0x1f3a2a, floorTint: 0xb9b2a2, groundTint: 0x9fb48a, wallTint: 0xffffff,
    trees: ['treePine', 'treePine', 'treeRound'],
    shrubs: ['bush', 'bushFlowers', 'grass', 'flowers', 'mushroom'],
    rocks: ['rockA', 'rockB'],
    light: { hemiSky: 0xdff0ff, hemiGround: 0x3d4a2e, hemiIntensity: 0.8, sunColor: 0xfff0d6, sunIntensity: 2.4, envIntensity: 0.35, exposure: 0.95 },
    ambient: 'fireflies',
  },
  {
    id: 'desert', name: '모래 사막', sky: 0x7a5a3a, floorTint: 0xd9c4a4, groundTint: 0xd8b88c, wallTint: 0xffe2b8,
    trees: ['treePalm', 'cactus', 'cactus', 'treeDead'],
    shrubs: ['skull', 'ribcage', 'grass', 'boulder'],
    rocks: ['boulder', 'rockA'],
    light: { hemiSky: 0xfff1d8, hemiGround: 0x7a5a32, hemiIntensity: 0.9, sunColor: 0xffd9a0, sunIntensity: 2.8, envIntensity: 0.35, exposure: 1.0 },
    ambient: 'dust',
  },
  {
    id: 'ice', name: '얼음 동굴', sky: 0x1c2c44, floorTint: 0xb8cfe6, groundTint: 0xdde8f2, wallTint: 0xcfe4ff,
    trees: ['treePineSnow', 'treePineSnow', 'treeDeadSnow'],
    shrubs: ['bushSnow', 'crystal', 'rockA'],
    rocks: ['rockB', 'rockA', 'crystal'],
    crystalColor: 0x48c8ff,
    light: { hemiSky: 0xd8ecff, hemiGround: 0x4a5c78, hemiIntensity: 0.9, sunColor: 0xe6f2ff, sunIntensity: 2.2, envIntensity: 0.45, exposure: 1.0 },
    ambient: 'snow',
  },
  {
    id: 'lava', name: '용암 지대', sky: 0x1a0c0a, floorTint: 0xffb59a, groundTint: 0x9a6a5a, wallTint: 0x8a6a66,
    trees: ['treeDead', 'treeDead', 'crystal'],
    shrubs: ['skull', 'ribcage', 'rocksDark', 'crystal'],
    rocks: ['rocksDark', 'rockB'],
    crystalColor: 0xff3a1a,
    light: { hemiSky: 0xffb08a, hemiGround: 0x2a0a06, hemiIntensity: 1.0, sunColor: 0xff9a6a, sunIntensity: 2.4, envIntensity: 0.3, exposure: 1.05 },
    ambient: 'embers',
  },
];

export const chapterOf = (roomNo: number): number => Math.floor((roomNo - 1) / BALANCE.bossEvery);

export const themeForRoom = (roomNo: number): Theme => THEMES[chapterOf(roomNo) % THEMES.length];

export const isBossRoom = (roomNo: number): boolean => roomNo % BALANCE.bossEvery === 0;

export const isStageBossRoom = (roomNo: number): boolean => roomNo % BALANCE.stageBossEvery === 0;

const mixHex = (a: number, b: number, t: number): number => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return ch(16) | ch(8) | ch(0);
};

/**
 * Sky + lighting for a room. Boss arenas are dimmed so the boss's own glow dominates; stage-boss
 * arenas are also washed in the boss's colour (hellfire red for the demon, grave green for the
 * necromancer).
 */
export function moodForRoom(roomNo: number): { sky: number; light: ThemeLighting } {
  const { sky, light } = themeForRoom(roomNo);
  const type = bossTypeForRoom(roomNo);
  const tint = (type && ENEMY_DEFS[type].bossInfo?.color) || 0xff3a1a;
  if (isStageBossRoom(roomNo)) {
    return {
      sky: mixHex(sky, mixHex(tint, 0x000000, 0.92), 0.85),
      light: {
        ...light,
        hemiSky: mixHex(light.hemiSky, tint, 0.55),
        hemiGround: mixHex(light.hemiGround, mixHex(tint, 0x000000, 0.9), 0.7),
        hemiIntensity: light.hemiIntensity * 0.55,
        sunColor: mixHex(light.sunColor, tint, 0.6),
        sunIntensity: light.sunIntensity * 0.62,
        envIntensity: light.envIntensity * 0.35,
        exposure: light.exposure * 0.9,
      },
    };
  }
  if (isBossRoom(roomNo)) {
    return {
      sky: mixHex(sky, 0x0c0a18, 0.5),
      light: { ...light, hemiIntensity: light.hemiIntensity * 0.7, sunIntensity: light.sunIntensity * 0.75, envIntensity: light.envIntensity * 0.6 },
    };
  }
  return { sky, light };
}
