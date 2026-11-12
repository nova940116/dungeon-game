/**
 * Every runtime asset the game loads. Files are produced by `npm run assets`
 * (see scripts/asset-sources.json) into public/assets/.
 */

export type ClipName = 'idle' | 'move' | 'run' | 'attack' | 'hit' | 'death' | 'jump' | 'punch' | 'roar' | 'draw' | 'hold' | 'release' | 'heavy' | 'spin';

export interface ModelSpec {
  url: string;
  /** Scale so the model's height (or largest dimension) equals `size` world units. */
  fit: 'height' | 'max';
  size: number;
  /** 'origin' keeps the file's origin (characters); default centers the bounds on x/z. */
  pivot?: 'origin' | 'center';
  /** Extra yaw so the model faces +Z like the rest of the game. */
  rotationY?: number;
  /** Skinned + animated: instances get their own materials (for hit flash). */
  animated?: boolean;
  /** Meshes (by name) left out when measuring the size — e.g. a sword that points up in the rest pose. */
  fitExclude?: string[];
  /** Turn off self-illumination (emissive parts) so nothing on the model glows. */
  noGlow?: boolean;
  /** Logical clip name → clip name in the file (matched by suffix, e.g. "Armature|Slime_Idle"). */
  clips?: Partial<Record<ClipName, string>>;
}

const base = import.meta.env.BASE_URL;
const model = (path: string) => `${base}assets/models/${path}`;

export const MODELS = {
  // Built by `npm run assets:archer` (Blender): adventurer + bow/string/arrow rig + archery clips.
  player: {
    url: model('characters/player_archer.glb'), fit: 'height', size: 2.0, animated: true, pivot: 'origin', noGlow: true,
    clips: { idle: 'Bow_Idle', run: 'Run', draw: 'Bow_Draw', hold: 'Bow_Hold', release: 'Bow_Release', attack: 'Bow_Swing', hit: 'HitRecieve', death: 'Death' },
  },
  // Built by `npm run assets:swordsman` (Blender): dark greatsword warrior — blackened plate, great helm, a colossal
  // two-handed greatsword (scripts/blender/greatsword.py). Idle, Run and the three-hit combo (two-handed sweep,
  // reverse sweep, leaping ground smash; a full spin with "회오리 베기") are hand-authored in scripts/blender/sword_moves.py.
  swordsman: {
    // Same body scale as the archer: measured without the sword (it points straight up in the rest pose),
    // and a bit taller overall because the helm crest rises above the archer's hair.
    url: model('characters/player_swordsman.glb'), fit: 'height', size: 2.05, animated: true, pivot: 'origin', fitExclude: ['Greatsword'], noGlow: true,
    clips: { idle: 'Idle', run: 'Run', attack: 'Slash', punch: 'Slash_Back', heavy: 'Slash_Heavy', spin: 'Slash_Spin', hit: 'HitRecieve', death: 'Death' },
  },
  slime: {
    url: model('characters/enemy_slime.glb'), fit: 'max', size: 1.4, animated: true,
    clips: { idle: 'Slime_Idle', move: 'Slime_Walk', attack: 'Slime_Attack', death: 'Slime_Death' },
  },
  bat: {
    url: model('characters/enemy_bat.glb'), fit: 'max', size: 1.6, animated: true,
    clips: { idle: 'Bat_Flying', move: 'Bat_Flying', attack: 'Bat_Attack', hit: 'Bat_Hit', death: 'Bat_Death' },
  },
  mushnub: {
    url: model('characters/enemy_mushnub.glb'), fit: 'height', size: 1.5, animated: true,
    clips: { idle: 'Idle', move: 'Walk', attack: 'Bite_Front', hit: 'HitRecieve', death: 'Death' },
  },
  giant: {
    url: model('characters/enemy_giant.glb'), fit: 'height', size: 2.5, animated: true,
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', hit: 'HitRecieve', death: 'Death' },
  },
  // Regular enemies of rooms 11–19, built from scratch by `npm run assets:bosses` (scripts/blender/stage2.py).
  troll: {
    url: model('characters/enemy_troll.glb'), fit: 'height', size: 2.7, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', punch: 'Punch', hit: 'Hit', death: 'Death' },
  },
  bee: {
    url: model('characters/enemy_bee.glb'), fit: 'height', size: 1.3, animated: true, pivot: 'origin',
    clips: { idle: 'Flying', move: 'Flying', attack: 'Attack', hit: 'Hit', death: 'Death' },
  },
  plant: {
    url: model('characters/enemy_plant.glb'), fit: 'height', size: 2.5, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Idle', attack: 'Attack', hit: 'Hit', death: 'Death' },
  },
  // Bosses are modelled, rigged and animated from scratch by `npm run assets:bosses` (scripts/blender/boss_*.py).
  golemBoss: {
    url: model('characters/boss_golem.glb'), fit: 'height', size: 4.7, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', punch: 'Punch', roar: 'Roar', death: 'Death' },
  },
  spiderQueen: {
    url: model('characters/boss_spider_queen.glb'), fit: 'height', size: 3.4, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', jump: 'Jump', roar: 'Roar', death: 'Death' },
  },
  necromancer: {
    url: model('characters/boss_necromancer.glb'), fit: 'height', size: 4.6, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', punch: 'Punch', roar: 'Roar', death: 'Death' },
  },
  // Summons (also built by `npm run assets:bosses`).
  spiderling: {
    url: model('characters/enemy_spiderling.glb'), fit: 'height', size: 0.62, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', death: 'Death' },
  },
  skeleton: {
    url: model('characters/enemy_skeleton.glb'), fit: 'height', size: 2.0, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', death: 'Death' },
  },
  wraith: {
    url: model('characters/enemy_wraith.glb'), fit: 'height', size: 2.1, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', death: 'Death' },
  },
  deathKnight: {
    url: model('characters/enemy_death_knight.glb'), fit: 'height', size: 3.6, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', attack: 'Attack', punch: 'Punch', death: 'Death' },
  },
  demonLord: {
    url: model('characters/boss_demon_lord.glb'), fit: 'height', size: 6.7, animated: true, pivot: 'origin',
    clips: { idle: 'Idle', move: 'Walk', run: 'Run', attack: 'Weapon', punch: 'Punch', jump: 'Jump', roar: 'Roar', death: 'Death' },
  },

  arrow: { url: model('props/projectile_arrow.glb'), fit: 'max', size: 0.9 },

  wall: { url: model('environment/wall_stone.glb'), fit: 'max', size: 2 },
  rockA: { url: model('environment/rock_a.glb'), fit: 'max', size: 1.35 },
  rockB: { url: model('environment/rock_b.glb'), fit: 'max', size: 1.4 },
  rocksDark: { url: model('environment/rocks_dark.glb'), fit: 'max', size: 1.4 },
  boulder: { url: model('environment/boulder.glb'), fit: 'max', size: 1.5 },
  torch: { url: model('environment/torch.glb'), fit: 'height', size: 1.7 },
  crystal: { url: model('environment/crystal.glb'), fit: 'height', size: 1.5 },
  mushroom: { url: model('environment/mushroom.glb'), fit: 'height', size: 0.6 },

  treePine: { url: model('environment/tree_pine.glb'), fit: 'height', size: 4.6 },
  treeRound: { url: model('environment/tree_round.glb'), fit: 'height', size: 3.6 },
  treePineSnow: { url: model('environment/tree_pine_snow.glb'), fit: 'height', size: 4.2 },
  treeDead: { url: model('environment/tree_dead.glb'), fit: 'height', size: 3.6 },
  treeDeadSnow: { url: model('environment/tree_dead_snow.glb'), fit: 'height', size: 3.2 },
  treePalm: { url: model('environment/tree_palm.glb'), fit: 'height', size: 4.2 },
  cactus: { url: model('environment/cactus.glb'), fit: 'height', size: 1.9 },

  bush: { url: model('environment/bush.glb'), fit: 'max', size: 1.3 },
  bushFlowers: { url: model('environment/bush_flowers.glb'), fit: 'max', size: 1.3 },
  bushSnow: { url: model('environment/bush_snow.glb'), fit: 'max', size: 1.3 },
  grass: { url: model('environment/grass.glb'), fit: 'max', size: 0.7 },
  flowers: { url: model('environment/flowers.glb'), fit: 'max', size: 0.7 },
  skull: { url: model('environment/skull.glb'), fit: 'max', size: 0.5 },
  ribcage: { url: model('environment/ribcage.glb'), fit: 'max', size: 1.4 },
} satisfies Record<string, ModelSpec>;

export type ModelKey = keyof typeof MODELS;

export type ThemeId = 'forest' | 'desert' | 'ice' | 'lava';
export type SurfaceKey = `${ThemeId}_${'floor' | 'ground'}`;

export const SURFACES: readonly SurfaceKey[] = [
  'forest_floor', 'forest_ground', 'desert_floor', 'desert_ground',
  'ice_floor', 'ice_ground', 'lava_floor', 'lava_ground',
];

export const surfaceUrls = (key: SurfaceKey) => ({
  map: `${base}assets/textures/${key}_diff.webp`,
  normalMap: `${base}assets/textures/${key}_nor.webp`,
});

export const ENVIRONMENT_HDR = `${base}assets/env/sky.hdr`;
