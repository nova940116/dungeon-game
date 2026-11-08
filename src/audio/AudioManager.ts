import { STORAGE_KEYS } from '../config';
import { clamp, rand } from '../utils/math';
import { storage } from '../utils/storage';
import { SOUNDS, soundUrl, type SoundKey, type SoundSpec } from './SoundManifest';

export interface PlayOptions {
  /** Multiplies the manifest volume. */
  volume?: number;
  /** Overrides the random playback rate. */
  rate?: number;
  /** Stereo position, -1 (left) … 1 (right). */
  pan?: number;
}

/**
 * Web Audio sound-effect player.
 * - Browsers block audio until a user gesture, so the context is resumed on the first input.
 * - Per-sound cooldown + voice limit stop 20 arrows from stacking into noise.
 * - A compressor on the master bus keeps overlapping sounds from clipping.
 */
export class AudioManager {
  private readonly ctx: AudioContext | null;
  private readonly master: GainNode | null = null;
  private readonly buffers = new Map<SoundKey, AudioBuffer[]>();
  private readonly lastPlayed = new Map<SoundKey, number>();
  private readonly voices = new Map<SoundKey, number>();
  private readonly lastVariant = new Map<SoundKey, number>();
  private muted = storage.getNumber(STORAGE_KEYS.muted) === 1;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    this.ctx = Ctx ? new Ctx() : null;
    if (!this.ctx) return;

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.ratio.value = 4;
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(compressor).connect(this.ctx.destination);

    const unlock = () => void this.ctx?.resume();
    for (const type of ['pointerdown', 'keydown', 'touchend'] as const) window.addEventListener(type, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.ctx?.suspend();
      else void this.ctx?.resume();
    });
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /** Loads and decodes every sound. Missing files are skipped (game stays playable). */
  async load(onProgress: (ratio: number) => void): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return onProgress(1);
    const jobs = (Object.entries(SOUNDS) as [SoundKey, SoundSpec][]).flatMap(([key, spec]) =>
      Array.from({ length: spec.variants }, (_, i) => ({ key, url: soundUrl(key, i + 1) })),
    );
    let done = 0;
    await Promise.all(
      jobs.map(async ({ key, url }) => {
        try {
          const data = await (await fetch(url)).arrayBuffer();
          const buffer = await ctx.decodeAudioData(data);
          const list = this.buffers.get(key) ?? [];
          list.push(buffer);
          this.buffers.set(key, list);
        } catch (err) {
          console.warn(`Sound failed to load: ${url}`, err);
        } finally {
          onProgress(++done / jobs.length);
        }
      }),
    );
  }

  play(key: SoundKey, opts: PlayOptions = {}): void {
    const ctx = this.ctx;
    const list = this.buffers.get(key);
    if (!ctx || !this.master || this.muted || ctx.state !== 'running' || !list?.length) return;

    const spec: SoundSpec = SOUNDS[key];
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < (spec.cooldown ?? 0.02)) return;
    if ((this.voices.get(key) ?? 0) >= (spec.maxVoices ?? 6)) return;
    this.lastPlayed.set(key, now);

    const source = ctx.createBufferSource();
    source.buffer = list[this.pickVariant(key, list.length)];
    source.playbackRate.value = opts.rate ?? (spec.rate ? rand(spec.rate[0], spec.rate[1]) : 1);

    const gain = ctx.createGain();
    gain.gain.value = spec.volume * (opts.volume ?? 1);
    const panner = ctx.createStereoPanner();
    panner.pan.value = clamp(opts.pan ?? 0, -1, 1);
    source.connect(gain).connect(panner).connect(this.master);

    this.voices.set(key, (this.voices.get(key) ?? 0) + 1);
    source.onended = () => {
      this.voices.set(key, Math.max(0, (this.voices.get(key) ?? 1) - 1));
      source.disconnect();
      gain.disconnect();
      panner.disconnect();
    };
    source.start();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    storage.setNumber(STORAGE_KEYS.muted, this.muted ? 1 : 0);
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  /** Avoid playing the same variant twice in a row. */
  private pickVariant(key: SoundKey, count: number): number {
    if (count === 1) return 0;
    const last = this.lastVariant.get(key) ?? -1;
    let i = Math.floor(Math.random() * count);
    if (i === last) i = (i + 1) % count;
    this.lastVariant.set(key, i);
    return i;
  }
}
