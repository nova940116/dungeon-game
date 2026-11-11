#!/usr/bin/env node
/**
 * Builds the boss models and their summons entirely from code (no source assets) into
 * public/assets/models/characters/ — see scripts/blender/build_bosses.py for the list.
 *
 *   npm run assets:bosses                    # Blender (headless) → GLB
 *   npm run assets:bosses -- --preview       # also render pose sheets into .asset-cache/boss-preview/
 *   npm run assets:bosses -- --only spider,spiderling   # any of: golem demon spider spiderling necro skeleton wraith knight
 *
 * Blender is found at $BLENDER, or /Applications/Blender.app on macOS, or `blender` on PATH.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'assets', 'models', 'characters');

const blender =
  process.env.BLENDER ??
  ['/Applications/Blender.app/Contents/MacOS/Blender', '/Applications/Blender.app/Contents/MacOS/blender'].find(existsSync) ??
  'blender';

const cli = process.argv.slice(2);
const args = ['-b', '--factory-startup', '-P', join(ROOT, 'scripts', 'blender', 'build_bosses.py'), '--', OUT_DIR];
const only = cli.indexOf('--only');
if (only >= 0) args.push('--only', cli[only + 1]);
if (cli.includes('--preview')) args.push('--preview', join(ROOT, '.asset-cache', 'boss-preview'));

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Blender: ${blender}`);
let log = '';
try {
  log = execFileSync(blender, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
} catch (err) {
  // Blender sometimes crashes on exit in background mode after a successful export.
  log = `${err.stdout ?? ''}`;
  if (!/exported /.test(log)) {
    console.error(log, err.stderr ?? '');
    throw err;
  }
}
for (const line of log.split('\n')) if (/^(\w+: \d+ verts|\w+: height|clip |exported|preview)/.test(line)) console.log(`  ${line.replace(ROOT + '/', '')}`);
if (/Traceback|Error:/.test(log)) {
  console.error(log.split('\n').filter((l) => /Traceback|Error|File "/.test(l)).join('\n'));
  process.exit(1);
}
