#!/usr/bin/env node
/**
 * Builds public/assets/models/characters/player_archer.glb: a muscular armoured archer
 * (scripts/blender/hero.py) + bow rig + archery clips (scripts/blender/build_archer.py).
 *
 *   npm run assets           # first: downloads the CC0 source models into .asset-cache/
 *   npm run assets:archer    # then: Blender (headless) → gltf-transform optimize
 *
 * Blender is found at $BLENDER, or /Applications/Blender.app on macOS, or `blender` on PATH.
 * Pass --preview to also render pose previews into .asset-cache/archer-preview/.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.asset-cache');
// see asset-sources.json: body = King (plate armour), head = male Adventurer (beard)
const SOURCES = { body: 'I1gTjmuK2m', bow: 'QnpqjLSKFU', arrow: 'Rt48KEPDGt' };
const HEAD = '5EGWBMpuXq';
const RAW = join(CACHE, 'derived', 'player_archer.raw.glb');
const OUT = join(ROOT, 'public', 'assets', 'models', 'characters', 'player_archer.glb');

const blender =
  process.env.BLENDER ??
  ['/Applications/Blender.app/Contents/MacOS/Blender', '/Applications/Blender.app/Contents/MacOS/blender'].find(existsSync) ??
  'blender';

const inputs = Object.values(SOURCES).map((id) => join(CACHE, 'models', `${id}.glb`));
const head = join(CACHE, 'models', `${HEAD}.glb`);
const missing = [...inputs, head].filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`Missing source models (run "npm run assets" first):\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

mkdirSync(dirname(RAW), { recursive: true });
const args = ['-b', '--factory-startup', '-P', join(ROOT, 'scripts', 'blender', 'build_archer.py'), '--', ...inputs, RAW, '--head', head];
if (process.argv.includes('--preview')) args.push('--preview', join(CACHE, 'archer-preview'));

console.log(`Blender: ${blender}`);
try {
  const log = execFileSync(blender, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  for (const line of log.split('\n')) if (/^(hero:|arm length|bow:|clip |exported)/.test(line)) console.log(`  ${line}`);
} catch (err) {
  // Blender sometimes crashes on exit in background mode after a successful export.
  if (!existsSync(RAW)) {
    console.error(err.stdout ?? '', err.stderr ?? '');
    throw err;
  }
}

execFileSync(
  'npx',
  ['gltf-transform', 'optimize', RAW, OUT,
    '--compress', 'false', '--texture-compress', 'webp', '--texture-size', '512',
    '--simplify', 'false', '--palette', 'false', '--flatten', 'false', '--join', 'false', '--instance', 'false'],
  { cwd: ROOT, stdio: 'pipe' },
);
console.log(`  wrote ${OUT.replace(ROOT + '/', '')}`);
