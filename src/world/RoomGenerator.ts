import { ROOM } from '../config';
import { ENEMY_DEFS, enemyCountForRoom, enemyPoolForRoom, type EnemyType } from '../data/enemies';
import { pickOne, rand, randInt } from '../utils/math';
import { aabbFromCenter, aabbOverlaps, resolveCircleVsBoxes, type AABB } from './Collision';

const { halfWidth: HW, halfHeight: HH } = ROOM;

/** Areas kept free of rocks: the entrance and the path in front of the exit. */
const SAFE_ZONES: AABB[] = [
  { x0: -3, x1: 3, z0: HH - 8, z1: HH },
  { x0: -3, x1: 3, z0: -HH, z1: -HH + 3.5 },
];

export interface SpawnSpec {
  type: EnemyType;
  x: number;
  z: number;
}

export function generateObstacles(isBoss: boolean): AABB[] {
  if (isBoss) {
    return [[-4.5, -7], [4.5, -7], [-4.5, 5], [4.5, 5]].map(([x, z]) => aabbFromCenter(x, z, 1.2, 1.2));
  }
  const boxes: AABB[] = [];
  const target = randInt(2, 5);
  for (let tries = 0; boxes.length < target && tries < 80; tries++) {
    const w = pickOne([1, 1, 2, 3]);
    const d = pickOne([1, 1, 2]);
    // Snap to the 1×1 floor tiles.
    const x = Math.round(rand(-HW + 2, HW - 2)) + (w % 2 ? 0 : 0.5);
    const z = Math.round(rand(-HH + 3, HH - 5)) + (d % 2 ? 0 : 0.5);
    const box = aabbFromCenter(x, z, w, d);
    if (box.x0 < -HW + 1 || box.x1 > HW - 1) continue;
    if (SAFE_ZONES.some((zone) => aabbOverlaps(box, zone))) continue;
    if (boxes.some((other) => aabbOverlaps(box, other, 1.4))) continue;
    boxes.push(box);
  }
  return boxes;
}

export function generateWave(roomNo: number, isBoss: boolean, obstacles: readonly AABB[]): SpawnSpec[] {
  if (isBoss) return [{ type: 'boss', x: 0, z: -6 }];

  const pool = enemyPoolForRoom(roomNo);
  const counts = new Map<EnemyType, number>();
  const wave: SpawnSpec[] = [];
  for (let i = 0; i < enemyCountForRoom(roomNo); i++) {
    let type = pickOne(pool);
    const cap = ENEMY_DEFS[type].maxPerRoom;
    if (cap !== undefined && (counts.get(type) ?? 0) >= cap) type = 'shooter';
    counts.set(type, (counts.get(type) ?? 0) + 1);
    wave.push({ type, ...findFreeSpot(ENEMY_DEFS[type].radius + 0.3, obstacles) });
  }
  return wave;
}

/** Random point in the upper part of the room that doesn't overlap a rock. */
function findFreeSpot(radius: number, obstacles: readonly AABB[]): { x: number; z: number } {
  for (let i = 0; i < 60; i++) {
    const candidate = { x: rand(-HW + 1.5, HW - 1.5), z: rand(-HH + 2, 3) };
    const probe = { ...candidate };
    if (!resolveCircleVsBoxes(probe, radius, obstacles)) return candidate;
  }
  return { x: 0, z: -4 };
}
