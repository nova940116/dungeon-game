import * as THREE from 'three';
import { assets } from '../AssetLibrary';
import type { ModelKey, SurfaceKey } from '../AssetManifest';
import { mesh } from '../ModelKit';
import { vfxTexture } from '../vfxTextures';
import { pickOne, rand } from '../../utils/math';

/** Static prop instance with optional uniform scale jitter and random yaw. */
export function createProp(key: ModelKey, opts: { scale?: number; yaw?: number; tint?: number; glow?: number } = {}): THREE.Group {
  const { root } = assets.instantiate(key);
  root.scale.setScalar(opts.scale ?? 1);
  root.rotation.y = opts.yaw ?? rand(0, Math.PI * 2);
  if (opts.tint !== undefined || opts.glow !== undefined) {
    // Tinted copies are owned by this prop and disposed with the room.
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = (o.material as THREE.MeshStandardMaterial).clone();
      if (opts.tint !== undefined) m.color.multiply(new THREE.Color(opts.tint));
      if (opts.glow !== undefined) {
        m.emissive.setHex(opts.glow);
        m.emissiveIntensity = 0.55;
      }
      o.material = m;
    });
  }
  return root;
}

/** PBR textured plane on the floor. */
export function createSurface(key: SurfaceKey, width: number, depth: number, tileSize: number, tint: number): THREE.Mesh {
  const { map, normalMap } = assets.surface(key);
  const repeat = new THREE.Vector2(width / tileSize, depth / tileSize);
  // Texture objects are shared; clone the lightweight wrappers to own the repeat.
  const ownMap = map.clone();
  const ownNormal = normalMap.clone();
  ownMap.repeat.copy(repeat);
  ownNormal.repeat.copy(repeat);
  const material = new THREE.MeshStandardMaterial({ map: ownMap, normalMap: ownNormal, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, color: tint });
  const plane = mesh(new THREE.PlaneGeometry(width, depth), material, 0, 0, 0, false);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  return plane;
}

/** A straight run of wall segments from (x0,z0) to (x1,z1), stretched to fit exactly. */
export function createWallRun(x0: number, z0: number, x1: number, z1: number, tint: number): THREE.Group {
  const group = new THREE.Group();
  const size = assets.sizeOf('wall');
  const alongX = size.x >= size.z;
  const segment = alongX ? size.x : size.z;
  const length = Math.hypot(x1 - x0, z1 - z0);
  const count = Math.max(1, Math.round(length / segment));
  const stretch = length / (count * segment);
  const yaw = Math.atan2(x1 - x0, z1 - z0) + (alongX ? -Math.PI / 2 : 0);
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const piece = createProp('wall', { yaw, tint });
    piece.position.set(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t);
    // Stretch along the run direction only (local X or Z of the model).
    const inner = piece.children[0];
    if (alongX) inner.scale.x *= stretch;
    else inner.scale.z *= stretch;
    piece.traverse((o) => {
      if (o instanceof THREE.Mesh) o.receiveShadow = true;
    });
    group.add(piece);
  }
  return group;
}

/** Fills an obstacle box with a cluster of rocks. */
export function createRockCluster(x0: number, z0: number, x1: number, z1: number, rocks: ModelKey[], crystalColor?: number): THREE.Group {
  const group = new THREE.Group();
  for (let x = x0 + 0.5; x < x1; x += 1) {
    for (let z = z0 + 0.5; z < z1; z += 1) {
      const key = pickOne(rocks);
      const isCrystal = key === 'crystal';
      const prop = createProp(key, { scale: rand(0.9, 1.15), glow: isCrystal ? crystalColor : undefined });
      prop.position.set(x + rand(-0.08, 0.08), 0, z + rand(-0.08, 0.08));
      group.add(prop);
    }
  }
  return group;
}

export interface Torch {
  group: THREE.Group;
  light: THREE.PointLight;
  flame: THREE.Sprite;
}

export function createTorch(x: number, z: number): Torch {
  const group = new THREE.Group();
  const model = createProp('torch', { yaw: 0 });
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.name === 'Fire') {
      const hot = m.clone();
      hot.emissive.setHex(0xff7a1a);
      hot.emissiveIntensity = 3;
      o.material = hot;
    }
  });
  const height = assets.sizeOf('torch').y;
  const flameMaterial = new THREE.SpriteMaterial({ map: vfxTexture('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  flameMaterial.color.setHex(0xff9a3a).multiplyScalar(2.2);
  const flame = new THREE.Sprite(flameMaterial);
  flame.position.set(0, height * 0.95, 0);
  flame.scale.setScalar(1.1);
  const light = new THREE.PointLight(0xff8a3a, 6, 7, 1.6);
  light.position.set(0, height + 0.2, 0);
  group.add(model, flame, light);
  group.position.set(x, 0, z);
  return { group, light, flame };
}

/** Swirling exit portal (hidden until the room is cleared). */
export function createPortal(z: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ map: vfxTexture('portal'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  material.color.setHex(0x55ffd0).multiplyScalar(1.8);
  const portal = mesh(new THREE.PlaneGeometry(2.8, 2.8), material, 0, 0.05, z, false);
  portal.rotation.x = -Math.PI / 2;
  return portal;
}

/** Glowing energy bars that block the exit until the room is cleared. */
export function createDoorGate(z: number, halfWidth: number): THREE.Group {
  const material = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3020, emissiveIntensity: 2.4, transparent: true, opacity: 0.9 });
  const g = new THREE.Group();
  const bars = 5;
  for (let i = 0; i < bars; i++) {
    const x = -halfWidth + 0.3 + (i * (halfWidth * 2 - 0.6)) / (bars - 1);
    g.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8), material, x, 0.9, z, false));
  }
  return g;
}
