#!/usr/bin/env node
/**
 *   npm run balance                 # room-by-room curves for both classes
 *   npm run balance -- augments     # per-augment value table
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '.asset-cache', 'balance');
mkdirSync(OUT, { recursive: true });
const which = process.argv.includes('augments') ? 'augments' : 'model';
const out = join(OUT, `${which}.cjs`);
execFileSync('npx', ['rolldown', join(ROOT, 'scripts', 'balance', `${which}.ts`), '--platform', 'node', '--format', 'cjs', '-o', out], { cwd: ROOT, stdio: 'pipe' });
if (which === 'augments') execFileSync('node', [out], { stdio: 'inherit' });
else for (const cls of ['archer', 'swordsman']) execFileSync('node', [out], { stdio: 'inherit', env: { ...process.env, CLS: cls } });
