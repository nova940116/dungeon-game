import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SOUNDS, type SoundKey } from '../src/audio/SoundManifest';

describe('SoundManifest', () => {
  it('has a built file for every sound variant', () => {
    const missing: string[] = [];
    for (const [key, spec] of Object.entries(SOUNDS) as [SoundKey, { variants: number }][]) {
      for (let i = 1; i <= spec.variants; i++) {
        const file = join('public', 'assets', 'audio', `${key}_${i}.mp3`);
        if (!existsSync(file)) missing.push(file);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps volumes in a sane range', () => {
    for (const spec of Object.values(SOUNDS)) {
      expect(spec.volume).toBeGreaterThan(0);
      expect(spec.volume).toBeLessThanOrEqual(1);
    }
  });
});
