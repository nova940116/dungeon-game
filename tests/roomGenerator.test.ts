import { describe, expect, it } from 'vitest';
import { ROOM } from '../src/config';
import { resolveCircleVsBoxes } from '../src/world/Collision';
import { generateObstacles, generateWave } from '../src/world/RoomGenerator';

describe('RoomGenerator', () => {
  it('keeps rocks inside the arena and away from the entrance / exit path', () => {
    for (let run = 0; run < 200; run++) {
      for (const b of generateObstacles(false)) {
        expect(b.x0).toBeGreaterThanOrEqual(-ROOM.halfWidth + 1);
        expect(b.x1).toBeLessThanOrEqual(ROOM.halfWidth - 1);
        const nearCenterLine = b.x0 < 3 && b.x1 > -3;
        if (nearCenterLine) {
          expect(b.z1 <= ROOM.halfHeight - 8 || b.z0 >= ROOM.halfHeight).toBe(true);
          expect(b.z0 >= -ROOM.halfHeight + 3.5).toBe(true);
        }
      }
    }
  });

  it('spawns a single boss in boss rooms', () => {
    expect(generateWave(5, true, [])).toEqual([{ type: 'boss', x: 0, z: -6 }]);
  });

  it('never spawns enemies inside rocks and respects per-room caps', () => {
    for (let run = 0; run < 100; run++) {
      const rocks = generateObstacles(false);
      const wave = generateWave(12, false, rocks);
      expect(wave.filter((s) => s.type === 'golem').length).toBeLessThanOrEqual(2);
      for (const s of wave) expect(resolveCircleVsBoxes({ ...s }, 0.5, rocks)).toBe(false);
    }
  });
});
