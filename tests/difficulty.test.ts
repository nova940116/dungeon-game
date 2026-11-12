import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config';
import { difficultyForRoom, stageOf } from '../src/data/enemies';

describe('enemy difficulty', () => {
  it('starts at 1× and climbs every room', () => {
    expect(difficultyForRoom(1)).toEqual({ hpMul: 1, dmgMul: 1 });
    for (let room = 2; room <= 60; room++) {
      const prev = difficultyForRoom(room - 1);
      const cur = difficultyForRoom(room);
      expect(cur.hpMul).toBeGreaterThan(prev.hpMul);
      expect(cur.dmgMul).toBeGreaterThan(prev.dmgMul);
    }
  });

  it('jumps when a new stage starts', () => {
    const every = BALANCE.stageBossEvery;
    expect(stageOf(every)).toBe(0);
    expect(stageOf(every + 1)).toBe(1);
    const before = difficultyForRoom(every);
    const after = difficultyForRoom(every + 1);
    const steadyStep = difficultyForRoom(every).hpMul / difficultyForRoom(every - 1).hpMul;
    expect(after.hpMul / before.hpMul).toBeGreaterThan(steadyStep);
    expect(after.dmgMul / before.dmgMul).toBeGreaterThan(1.1);
  });
});
