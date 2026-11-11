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
 * Sounds:   OpenGameArt CC0 recordings → trimmed / layered / peak-normalized mono MP3 (ffmpeg)
 *
 *   npm run assets -- --sounds   # (= npm run assets:sounds) rebuild only the sounds
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';
import sharp from 'sharp';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = join(ROOT, '.asset-cache');
const OUT = join(ROOT, 'public', 'assets');
const FORCE = process.argv.includes('--force');
const SOUNDS_ONLY = process.argv.includes('--sounds');
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

async function buildModel({ out, blender, polypizza }) {
  const meta = await polyPizzaMeta(polypizza);
  if (meta.Licence !== 'CC0 1.0') throw new Error(`${polypizza} is ${meta.Licence}, not CC0`);
  const raw = join(CACHE, 'models', `${polypizza}.glb`);
  await download(`https://static.poly.pizza/${meta.ResourceID}.glb`, raw);
  if (blender) {
    // Source for the Blender-built player (npm run assets:archer); not shipped on its own.
    credits.push({ file: `models/characters/player_archer.glb (${blender})`, title: meta.Title, author: meta.Creator.Username, url: `https://poly.pizza/m/${polypizza}`, licence: 'CC0 1.0' });
    console.log(`  source   ${blender}  ← ${meta.Title} (${meta.Creator.Username})`);
    return;
  }
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

/** OpenGameArt sound pack: verify CC0 on the page, read title/author, download + unpack its files. */
const packCache = new Map();
async function soundPack(id) {
  if (packCache.has(id)) return packCache.get(id);
  const { page, files } = sources.soundPacks[id];
  const html = await (await fetch(page, { headers: UA })).text();
  if (!html.includes('creativecommons.org/publicdomain/zero/1.0')) throw new Error(`${page} is not CC0`);
  const author = html.match(/Author:&nbsp;<\/div>.*?<a href="\/users\/[^"]+">([^<]+)<\/a>/s)?.[1] ?? 'unknown';
  const title = html.match(/<title>([^|<]+)/)?.[1]?.trim() ?? id;
  const dir = join(CACHE, 'sounds', id);
  for (const url of files) {
    const name = decodeURIComponent(url.split('/').pop());
    const file = join(CACHE, 'sounds', `${id}__${name}`);
    await download(url, file);
    // tar (bsdtar / libarchive) unpacks both .zip and .7z
    if (/\.(zip|7z)$/.test(name)) {
      mkdirSync(dir, { recursive: true });
      execFileSync('tar', ['-xf', file, '-C', dir]);
    } else {
      ensureDir(join(dir, name));
      writeFileSync(join(dir, name), readFileSync(file));
    }
  }
  const all = [];
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name)) : all.push(join(d, e.name))));
  walk(dir);
  const pack = { id, page, author, title, files: all.filter((f) => !f.includes('__MACOSX')) };
  packCache.set(id, pack);
  return pack;
}

/**
 * One sound variant = one or more layers cut from recordings:
 *   { pack, file, start?, dur?, gain? (dB), delay? (s), fadeIn? (s), filter? (ffmpeg chain) }
 * Each layer is trimmed and faded, layers are mixed, then the result is peak-normalized to -1 dBFS.
 */
async function buildSound(key, variants) {
  for (const [i, layers] of variants.entries()) {
    const inputs = [];
    const chains = [];
    const used = [];
    for (const [n, layer] of layers.entries()) {
      const pack = await soundPack(layer.pack);
      const path = pack.files.find((f) => f.endsWith(`/${layer.file}`));
      if (!path) throw new Error(`${layer.file} not found in pack ${layer.pack}`);
      used.push({ pack, file: layer.file });
      inputs.push('-i', path);
      const trim = `atrim=start=${layer.start ?? 0}${layer.dur ? `:duration=${layer.dur}` : ''}`;
      const fadeOut = Math.min(0.06, (layer.dur ?? 1) * 0.25);
      const delay = Math.round((layer.delay ?? 0) * 1000);
      chains.push(
        `[${n}:a]aformat=sample_rates=44100:channel_layouts=mono,${trim},asetpts=PTS-STARTPTS,afade=t=in:d=${layer.fadeIn ?? 0.002},` +
          `areverse,afade=t=in:d=${fadeOut},areverse,${layer.filter ? `${layer.filter},` : ''}volume=${layer.gain ?? 0}dB,adelay=${delay}:all=1[l${n}]`,
      );
    }
    const mix = `${chains.join(';')};${layers.map((_, n) => `[l${n}]`).join('')}amix=inputs=${layers.length}:normalize=0:duration=longest[m]`;
    const dest = join(OUT, 'audio', `${key}_${i + 1}.mp3`);
    ensureDir(dest);
    const probe = spawnSync(ffmpegPath, ['-hide_banner', ...inputs, '-filter_complex', `${mix};[m]volumedetect`, '-f', 'null', '-'], { encoding: 'utf8' });
    const maxDb = Number(probe.stderr.match(/max_volume: (-?[\d.]+) dB/)?.[1] ?? 0);
    execFileSync(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error', ...inputs,
      '-filter_complex', `${mix};[m]volume=${(-1 - maxDb).toFixed(2)}dB[o]`, '-map', '[o]', '-ac', '1', '-ar', '44100', '-b:a', '128k', dest,
    ]);
    for (const { pack, file } of used) {
      credits.push({ file: `audio/${key}_${i + 1}.mp3`, title: `${pack.title} — ${file}`, author: pack.author, url: pack.page, licence: 'CC0 1.0' });
    }
  }
  console.log(`  sound    ${key} (${variants.length})`);
}

console.log('Building assets → public/assets');
if (SOUNDS_ONLY) {
  // Keep the existing non-audio credit rows.
  const old = existsSync(join(ROOT, 'CREDITS.md')) ? readFileSync(join(ROOT, 'CREDITS.md'), 'utf8') : '';
  for (const m of old.matchAll(/^\| `([^`]+)` \| \[(.+?)\]\((\S+?)\) \| (.*?) \| (.*?) \|$/gm)) {
    if (!m[1].startsWith('audio/')) credits.push({ file: m[1], title: m[2], url: m[3], author: m[4], licence: m[5] });
  }
} else {
  for (const m of sources.models) await buildModel(m);
  for (const t of sources.textures) await buildTexture(t);
  for (const h of sources.hdris) await buildHdri(h);
}
const audioDir = join(OUT, 'audio');
const wanted = new Set(Object.entries(sources.sounds).flatMap(([key, v]) => v.map((_, i) => `${key}_${i + 1}.mp3`)));
for (const [key, variants] of Object.entries(sources.sounds)) await buildSound(key, variants);
for (const file of existsSync(audioDir) ? readdirSync(audioDir) : []) {
  if (file.endsWith('.mp3') && !wanted.has(file)) {
    rmSync(join(audioDir, file));
    console.log(`  removed  audio/${file}`);
  }
}

const table = credits.map((c) => `| \`${c.file}\` | [${c.title}](${c.url}) | ${c.author} | ${c.licence} |`).join('\n');
writeFileSync(
  join(ROOT, 'CREDITS.md'),
  `# Asset Credits\n\nAll third-party assets are released under **CC0 1.0** (public domain). Attribution is not required, but we credit the authors anyway.\nGenerated by \`npm run assets\` from \`scripts/asset-sources.json\`.\n\nThe boss and summon models (\`models/characters/boss_*.glb\`, \`enemy_spiderling.glb\`, \`enemy_skeleton.glb\`, \`enemy_wraith.glb\`, \`enemy_death_knight.glb\`) are original work, generated from code by \`npm run assets:bosses\`.\n\n| File (public/assets/) | Source | Author | Licence |\n|---|---|---|---|\n${table}\n`,
);
console.log(`Done. ${credits.length} assets. Credits written to CREDITS.md`);
