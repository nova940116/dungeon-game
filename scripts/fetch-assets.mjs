#!/usr/bin/env node
/**
 * Asset pipeline: download CC0 assets listed in scripts/asset-sources.json,
 * verify their licence, optimize them, and write them to public/assets/.
 *
 *   npm run assets           # fetch + optimize (uses .asset-cache/)
 *   npm run assets -- --force  # ignore the cache
 *
 * Models: poly.pizza  → gltf-transform optimize (512px WebP textures, pruned, deduped)
 * Textures: Poly Haven → 512px WebP (diffuse + normal)
 * HDRI:     Poly Haven → 1k .hdr
 * Sounds:   OpenGameArt CC0 packs → trimmed, peak-normalized mono MP3 (ffmpeg)
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.asset-cache');
const OUT = join(ROOT, 'public', 'assets');
const FORCE = process.argv.includes('--force');
const UA = { 'User-Agent': 'arrow-dungeon-asset-pipeline' };
const sources = JSON.parse(readFileSync(join(ROOT, 'scripts', 'asset-sources.json'), 'utf8'));
const credits = [];

const ensureDir = (file) => mkdirSync(dirname(file), { recursive: true });

async function download(url, file) {
  if (!FORCE && existsSync(file)) return readFileSync(file);
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  ensureDir(file);
  writeFileSync(file, buf);
  return buf;
}

async function json(url) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

/** poly.pizza model page embeds its metadata as JSON. */
async function polyPizzaMeta(id) {
  const html = await (await fetch(`https://poly.pizza/m/${id}`, { headers: UA })).text();
  const match = html.match(/window\.__SERVER_APP_STATE__ =\s*(\{.*?\})\s*<\/script>/s);
  if (!match) throw new Error(`Could not read metadata for ${id}`);
  return JSON.parse(match[1]).initialData.model;
}

async function buildModel({ out, polypizza }) {
  const meta = await polyPizzaMeta(polypizza);
  if (meta.Licence !== 'CC0 1.0') throw new Error(`${polypizza} is ${meta.Licence}, not CC0`);
  const raw = join(CACHE, 'models', `${polypizza}.glb`);
  await download(`https://static.poly.pizza/${meta.ResourceID}.glb`, raw);
  const dest = join(OUT, 'models', out);
  ensureDir(dest);
  execFileSync(
    'npx',
    ['gltf-transform', 'optimize', raw, dest,
      '--compress', 'false', '--texture-compress', 'webp', '--texture-size', '512',
      '--simplify', 'false', '--palette', 'false', '--flatten', 'false', '--join', 'false', '--instance', 'false'],
    { cwd: ROOT, stdio: 'pipe' },
  );
  credits.push({ file: `models/${out}`, title: meta.Title, author: meta.Creator.Username, url: `https://poly.pizza/m/${polypizza}`, licence: 'CC0 1.0' });
  console.log(`  model    ${out}  ← ${meta.Title} (${meta.Creator.Username})`);
}

async function buildTexture({ out, polyhaven }) {
  const [files, info] = await Promise.all([json(`https://api.polyhaven.com/files/${polyhaven}`), json(`https://api.polyhaven.com/info/${polyhaven}`)]);
  for (const [key, suffix] of [['Diffuse', 'diff'], ['nor_gl', 'nor']]) {
    const raw = join(CACHE, 'textures', `${polyhaven}_${suffix}.jpg`);
    const buf = await download(files[key]['1k'].jpg.url, raw);
    const dest = join(OUT, `${out}_${suffix}.webp`);
    ensureDir(dest);
    await sharp(buf).resize(512, 512).webp({ quality: suffix === 'diff' ? 82 : 90 }).toFile(dest);
  }
  credits.push({ file: `${out}_*.webp`, title: info.name, author: Object.keys(info.authors ?? {}).join(', '), url: `https://polyhaven.com/a/${polyhaven}`, licence: 'CC0 1.0' });
  console.log(`  texture  ${out}  ← ${info.name}`);
}

async function buildHdri({ out, polyhaven }) {
  const [files, info] = await Promise.all([json(`https://api.polyhaven.com/files/${polyhaven}`), json(`https://api.polyhaven.com/info/${polyhaven}`)]);
  const dest = join(OUT, out);
  const buf = await download(files.hdri['1k'].hdr.url, join(CACHE, 'hdri', `${polyhaven}.hdr`));
  ensureDir(dest);
  writeFileSync(dest, buf);
  credits.push({ file: out, title: info.name, author: Object.keys(info.authors ?? {}).join(', '), url: `https://polyhaven.com/a/${polyhaven}`, licence: 'CC0 1.0' });
  console.log(`  hdri     ${out}  ← ${info.name}`);
}

/** OpenGameArt pack: verify CC0 on the page, read the author, cache + list the zip. */
const packCache = new Map();
async function soundPack(id) {
  if (packCache.has(id)) return packCache.get(id);
  const { page, zip } = sources.soundPacks[id];
  const html = await (await fetch(page, { headers: UA })).text();
  if (!html.includes('creativecommons.org/publicdomain/zero/1.0')) throw new Error(`${page} is not CC0`);
  const author = html.match(/Author:&nbsp;<\/div>.*?<a href="\/users\/[^"]+">([^<]+)<\/a>/s)?.[1] ?? 'unknown';
  const title = html.match(/<title>([^|<]+)/)?.[1]?.trim() ?? id;
  const zipPath = join(CACHE, 'sounds', `${id}.zip`);
  await download(zip, zipPath);
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter((e) => e && !e.includes('__MACOSX'));
  const pack = { id, page, author, title, zipPath, entries };
  packCache.set(id, pack);
  return pack;
}

/** Extract → trim leading silence → peak-normalize to -1 dBFS → mono 44.1 kHz MP3. */
async function buildSound(key, variants) {
  for (const [i, [packId, file]] of variants.entries()) {
    const pack = await soundPack(packId);
    const entry = pack.entries.find((e) => e === file || e.endsWith(`/${file}`));
    if (!entry) throw new Error(`${file} not found in pack ${packId}`);
    const raw = join(CACHE, 'sounds', packId, file.replaceAll('/', '_'));
    ensureDir(raw);
    writeFileSync(raw, execFileSync('unzip', ['-p', pack.zipPath, entry], { maxBuffer: 64 * 1024 * 1024 }));

    const trim = 'silenceremove=start_periods=1:start_threshold=-50dB';
    const probe = spawnSync(ffmpegPath, ['-hide_banner', '-i', raw, '-af', `${trim},volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    const maxDb = Number(probe.stderr.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? 0);
    const dest = join(OUT, 'audio', `${key}_${i + 1}.mp3`);
    ensureDir(dest);
    execFileSync(ffmpegPath, ['-y', '-hide_banner', '-loglevel', 'error', '-i', raw, '-af', `${trim},volume=${(-1 - maxDb).toFixed(2)}dB`, '-ac', '1', '-ar', '44100', '-b:a', '96k', dest]);
    credits.push({ file: `audio/${key}_${i + 1}.mp3`, title: `${pack.title} — ${file}`, author: pack.author, url: pack.page, licence: 'CC0 1.0' });
  }
  console.log(`  sound    ${key} (${variants.length})`);
}

console.log('Building assets → public/assets');
for (const m of sources.models) await buildModel(m);
for (const t of sources.textures) await buildTexture(t);
for (const h of sources.hdris) await buildHdri(h);
for (const [key, variants] of Object.entries(sources.sounds)) await buildSound(key, variants);

const table = credits.map((c) => `| \`${c.file}\` | [${c.title}](${c.url}) | ${c.author} | ${c.licence} |`).join('\n');
writeFileSync(
  join(ROOT, 'CREDITS.md'),
  `# Asset Credits\n\nAll third-party assets are released under **CC0 1.0** (public domain). Attribution is not required, but we credit the authors anyway.\nGenerated by \`npm run assets\` from \`scripts/asset-sources.json\`.\n\n| File (public/assets/) | Source | Author | Licence |\n|---|---|---|---|\n${table}\n`,
);
console.log(`Done. ${credits.length} assets. Credits written to CREDITS.md`);
