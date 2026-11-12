import { describe, expect, it } from 'vitest';
import { BALANCE } from '../src/config';
import { difficultyForRoom, stageOf, xpRewardMul } from '../src/data/enemies';

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

  it('keeps enemy damage within reach of a levelled hero (HP grows with levels)', () => {
    // A hero gains hpPerLevel × base HP each level and reaches roughly level 18 by room 40 (balance model).
    const heroHpMul = 1 + 17 * BALANCE.hpPerLevel;
    expect(difficultyForRoom(40).dmgMul / heroHpMul).toBeLessThan(3);
    expect(difficultyForRoom(40).hpMul).toBeGreaterThan(difficultyForRoom(40).dmgMul * 3);
  });

  it('pays more XP in later rooms', () => {
    expect(xpRewardMul(1)).toBe(1);
    expect(xpRewardMul(21)).toBeCloseTo(1 + 20 * BALANCE.xpPerRoom);
  });
});
