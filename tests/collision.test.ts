import { describe, expect, it } from 'vitest';
import { aabbFromCenter, clampCircleInside, hasLineOfSight, resolveCircleVsBoxes } from '../src/world/Collision';

describe('Collision', () => {
  const rock = aabbFromCenter(0, 0, 2, 2); // x/z in [-1, 1]

  it('pushes a circle out of a box edge', () => {
    const p = { x: 1.2, z: 0 };
    expect(resolveCircleVsBoxes(p, 0.5, [rock])).toBe(true);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBe(0);
  });

  it('pushes a circle whose center is inside the box out through the nearest face', () => {
    const p = { x: 0, z: 0.9 };
    resolveCircleVsBoxes(p, 0.4, [rock]);
    expect(p.z).toBeCloseTo(1.4);
  });

  it('leaves circles that do not overlap untouched', () => {
    const p = { x: 3, z: 3 };
    expect(resolveCircleVsBoxes(p, 0.5, [rock])).toBe(false);
    expect(p).toEqual({ x: 3, z: 3 });
  });

  it('clamps inside room bounds', () => {
    const p = { x: 10, z: -10 };
    expect(clampCircleInside(p, 0.5, { x0: -7, x1: 7, z0: -13, z1: 13 })).toBe(true);
    expect(p).toEqual({ x: 6.5, z: -10 });
  });

  it('detects line of sight blocked by a box', () => {
    expect(hasLineOfSight(-5, 0, 5, 0, [rock])).toBe(false);
    expect(hasLineOfSight(-5, 3, 5, 3, [rock])).toBe(true);
  });
});
