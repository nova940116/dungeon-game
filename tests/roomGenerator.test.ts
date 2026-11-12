import { describe, expect, it } from 'vitest';
import { ROOM } from '../src/config';
import { enemyCountForRoom, enemyPoolForRoom } from '../src/data/enemies';
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

  it('cycles four bosses: golem (5), demon (10), spider queen (15), necromancer (20), then repeats', () => {
    const boss = (room: number) => generateWave(room, true, [])[0].type;
    expect(generateWave(5, true, [])).toEqual([{ type: 'midboss', x: 0, z: -6 }]);
    expect([5, 10, 15, 20, 25, 30, 35, 40].map(boss)).toEqual(['midboss', 'boss', 'spiderQueen', 'necromancer', 'midboss', 'boss', 'spiderQueen', 'necromancer']);
  });

  it('never spawns enemies inside rocks and respects per-room caps', () => {
    for (let run = 0; run < 100; run++) {
      const rocks = generateObstacles(false);
      const wave = generateWave(12, false, rocks);
      expect(wave.filter((s) => s.type === 'golem').length).toBeLessThanOrEqual(2);
      for (const s of wave) expect(resolveCircleVsBoxes({ ...s }, 0.5, rocks)).toBe(false);
    }
  });

  it('rooms 11–19 are made of trolls, bees and carnivorous plants only', () => {
    for (let room = 11; room <= 19; room++) {
      if (room === 15) continue; // mid-boss
      expect(new Set(enemyPoolForRoom(room))).toEqual(new Set(['troll', 'bee', 'plant']));
      for (let run = 0; run < 30; run++) {
        const wave = generateWave(room, false, generateObstacles(false));
        for (const s of wave) expect(['troll', 'bee', 'plant']).toContain(s.type);
        expect(wave.filter((s) => s.type === 'troll').length).toBeLessThanOrEqual(3);
      }
    }
    for (const room of [1, 9, 21, 29]) expect(enemyPoolForRoom(room)).not.toContain('troll');
  });

  it('every stage starts with a moderate wave and grows to a swarm by its ninth room', () => {
    for (const start of [1, 11, 21, 31]) {
      const counts = Array.from({ length: 9 }, (_, i) => enemyCountForRoom(start + i));
      expect(counts[0]).toBe(4);
      expect(counts[8]).toBe(12);
      for (let i = 1; i < 9; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
      expect(generateWave(start + 8, false, [])).toHaveLength(12);
    }
  });
});
