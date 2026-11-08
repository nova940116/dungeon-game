import * as THREE from 'three';
import { ROOM } from '../config';
import { disposeObject } from '../assets/ModelKit';
import {
  createDoorGate,
  createPortal,
  createProp,
  createRockCluster,
  createSurface,
  createTorch,
  createWallRun,
  type Torch,
} from '../assets/models/EnvironmentModels';
import { isBossRoom, themeForRoom, type Theme } from '../data/themes';
import { clamp, pickOne, rand, type Vec2 } from '../utils/math';
import { AmbientParticles } from './AmbientParticles';
import { clampCircleInside, findBoxAt, resolveCircleVsBoxes, type AABB } from './Collision';
import { generateObstacles } from './RoomGenerator';

const { halfWidth: HW, halfHeight: HH, doorHalfWidth: DOOR } = ROOM;
const CORRIDOR_DEPTH = 4;

/** One arena: floor, walls, rocks, exit door, decoration. Gameplay collision is 2D on the floor plane. */
export class Room {
  readonly group = new THREE.Group();
  readonly theme: Theme;
  readonly isBoss: boolean;
  readonly obstacles: AABB[];
  readonly bounds: AABB = { x0: -HW, x1: HW, z0: -HH, z1: HH };
  doorOpen = false;
  cleared = false;

  private readonly gate: THREE.Group;
  private readonly portal: THREE.Mesh;
  private readonly torches: Torch[] = [];
  private readonly ambient: AmbientParticles;

  constructor(readonly roomNo: number) {
    this.theme = themeForRoom(roomNo);
    this.isBoss = isBossRoom(roomNo);
    this.obstacles = generateObstacles(this.isBoss);

    const t = this.theme;
    const ground = createSurface(`${t.id}_ground`, 140, 140, 5, t.groundTint);
    ground.position.y = -0.02;
    const floor = createSurface(`${t.id}_floor`, HW * 2, HH * 2 + CORRIDOR_DEPTH, 4, t.floorTint);
    floor.position.z = -CORRIDOR_DEPTH / 2;
    this.group.add(ground, floor);

    this.buildWalls();
    this.gate = createDoorGate(-HH - 0.4, DOOR);
    this.portal = createPortal(-HH - 2.2);
    this.group.add(this.gate, this.portal);
    this.buildTorches();
    this.buildObstacles();
    this.buildDecorations();

    this.ambient = new AmbientParticles(t.ambient);
    this.group.add(this.ambient.points);
  }

  get entrance(): Vec2 {
    return { x: 0, z: HH - 2 };
  }

  openDoor(): void {
    this.doorOpen = true;
    this.gate.visible = false;
    (this.portal.material as THREE.MeshBasicMaterial).opacity = 1;
  }

  update(dt: number, elapsed: number): void {
    this.ambient.update(dt, elapsed);
    for (const [i, torch] of this.torches.entries()) {
      const flicker = Math.sin(elapsed * 13 + i * 7) * 0.5 + Math.sin(elapsed * 23 + i) * 0.3;
      torch.light.intensity = 6 + flicker * 1.6;
      torch.flame.scale.setScalar(1.05 + flicker * 0.08);
    }
    if (this.doorOpen) {
      this.portal.rotation.z = -elapsed * 1.5;
      this.portal.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.05);
    }
  }

  /** Arena bounds + rocks. Returns true if the circle was pushed. */
  constrain(p: Vec2, radius: number): boolean {
    const hitRock = resolveCircleVsBoxes(p, radius, this.obstacles);
    return clampCircleInside(p, radius, this.bounds) || hitRock;
  }

  /** Like `constrain`, but lets the player walk into the corridor once the door is open. */
  constrainPlayer(p: Vec2, radius: number): void {
    resolveCircleVsBoxes(p, radius, this.obstacles);
    const inDoorway = this.doorOpen && Math.abs(p.x) < DOOR - radius;
    p.x = clamp(p.x, -HW + radius, HW - radius);
    p.z = clamp(p.z, inDoorway ? -HH - CORRIDOR_DEPTH + 1 : -HH + radius, HH - radius);
  }

  hasExited(p: Vec2): boolean {
    return this.doorOpen && p.z < -HH - ROOM.exitDepth;
  }

  isOutside(x: number, z: number): boolean {
    return x < -HW || x > HW || z < -HH || z > HH;
  }

  obstacleAt(x: number, z: number): AABB | undefined {
    return findBoxAt(x, z, this.obstacles);
  }

  dispose(): void {
    disposeObject(this.group);
  }

  private buildWalls(): void {
    const tint = this.theme.wallTint;
    const o = 0.45; // walls sit just outside the playable area
    this.group.add(
      createWallRun(-HW - o, HH + o, -HW - o, -HH - o, tint),
      createWallRun(HW + o, HH + o, HW + o, -HH - o, tint),
      createWallRun(-HW - o, HH + o, HW + o, HH + o, tint),
      createWallRun(-HW - o, -HH - o, -DOOR - 0.2, -HH - o, tint),
      createWallRun(DOOR + 0.2, -HH - o, HW + o, -HH - o, tint),
      createWallRun(-DOOR - 0.5, -HH - 1, -DOOR - 0.5, -HH - CORRIDOR_DEPTH, tint),
      createWallRun(DOOR + 0.5, -HH - 1, DOOR + 0.5, -HH - CORRIDOR_DEPTH, tint),
    );
  }

  private buildTorches(): void {
    const spots: [number, number][] = [
      [-DOOR - 0.6, -HH - 0.2],
      [DOOR + 0.6, -HH - 0.2],
      [-HW - 0.2, 0],
      [HW + 0.2, 0],
    ];
    for (const [x, z] of spots) {
      const torch = createTorch(x, z);
      this.torches.push(torch);
      this.group.add(torch.group);
    }
  }

  private buildObstacles(): void {
    for (const b of this.obstacles) {
      this.group.add(createRockCluster(b.x0, b.z0, b.x1, b.z1, this.theme.rocks, this.theme.crystalColor));
    }
  }

  private buildDecorations(): void {
    const t = this.theme;
    const glowFor = (key: string) => (key === 'crystal' ? t.crystalColor : undefined);

    // Outside the arena: trees and shrubs.
    for (let i = 0; i < 70; i++) {
      let x: number;
      let z: number;
      do {
        x = rand(-HW - 16, HW + 16);
        z = rand(-HH - 14, HH + 10);
      } while (Math.abs(x) < HW + 1.6 && z > -HH - CORRIDOR_DEPTH - 1);
      const key = i % 3 === 0 ? pickOne(t.shrubs) : pickOne(t.trees);
      const prop = createProp(key, { scale: rand(0.8, 1.3), glow: glowFor(key) });
      prop.position.set(x, 0, z);
      this.group.add(prop);
    }

    // Inside, hugging the walls (purely visual, no collision).
    const smallShrubs = t.shrubs.filter((k) => k !== 'boulder' && k !== 'crystal' && k !== 'ribcage');
    for (let i = 0; i < 16; i++) {
      const side = i % 4;
      const along = rand(-1, 1);
      const x = side < 2 ? (side === 0 ? -HW + 0.35 : HW - 0.35) : along * (HW - 0.5);
      const z = side < 2 ? along * (HH - 1) : side === 2 ? HH - 0.35 : -HH + 0.35;
      if (Math.abs(x) < DOOR + 0.5 && z < 0) continue;
      const prop = createProp(pickOne(smallShrubs.length ? smallShrubs : t.shrubs), { scale: rand(0.5, 0.8) });
      prop.position.set(x, 0, z);
      prop.traverse((o) => {
        if (o instanceof THREE.Mesh) o.castShadow = false;
      });
      this.group.add(prop);
    }
  }
}
