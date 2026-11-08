import { clamp, type Vec2 } from '../utils/math';

/** Axis-aligned box on the floor plane. */
export interface AABB {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export const aabbFromCenter = (x: number, z: number, width: number, depth: number): AABB => ({
  x0: x - width / 2,
  x1: x + width / 2,
  z0: z - depth / 2,
  z1: z + depth / 2,
});

export const aabbOverlaps = (a: AABB, b: AABB, margin = 0): boolean =>
  a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.z0 < b.z1 + margin && a.z1 > b.z0 - margin;

export const pointInAABB = (x: number, z: number, b: AABB): boolean => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1;

export const findBoxAt = (x: number, z: number, boxes: readonly AABB[]): AABB | undefined =>
  boxes.find((b) => pointInAABB(x, z, b));

/** Pushes a circle out of every box it overlaps. Returns true if any push happened. */
export function resolveCircleVsBoxes(p: Vec2, radius: number, boxes: readonly AABB[]): boolean {
  let pushed = false;
  for (const b of boxes) {
    const nx = clamp(p.x, b.x0, b.x1);
    const nz = clamp(p.z, b.z0, b.z1);
    const dx = p.x - nx;
    const dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    pushed = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      p.x += (dx / d) * (radius - d);
      p.z += (dz / d) * (radius - d);
    } else {
      // Center is inside the box: exit through the nearest face.
      const left = p.x - b.x0;
      const right = b.x1 - p.x;
      const top = p.z - b.z0;
      const bottom = b.z1 - p.z;
      const min = Math.min(left, right, top, bottom);
      if (min === left) p.x = b.x0 - radius;
      else if (min === right) p.x = b.x1 + radius;
      else if (min === top) p.z = b.z0 - radius;
      else p.z = b.z1 + radius;
    }
  }
  return pushed;
}

/** Keeps a circle inside a box. Returns true if it was clamped. */
export function clampCircleInside(p: Vec2, radius: number, bounds: AABB): boolean {
  const x = clamp(p.x, bounds.x0 + radius, bounds.x1 - radius);
  const z = clamp(p.z, bounds.z0 + radius, bounds.z1 - radius);
  const clamped = x !== p.x || z !== p.z;
  p.x = x;
  p.z = z;
  return clamped;
}

/** Sampled segment test: is the straight line from a to b free of boxes? */
export function hasLineOfSight(ax: number, az: number, bx: number, bz: number, boxes: readonly AABB[], step = 0.3): boolean {
  const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / step);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (findBoxAt(ax + (bx - ax) * t, az + (bz - az) * t, boxes)) return false;
  }
  return true;
}
