import * as THREE from 'three';

/**
 * Helpers for building models and cleaning them up.
 * Resources registered with `shared()` are reused across instances and never disposed.
 */
const sharedResources = new WeakSet<object>();

export function shared<T extends object>(resource: T): T {
  sharedResources.add(resource);
  return resource;
}

export function mesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  castShadow = true,
): THREE.Mesh {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = castShadow;
  return m;
}

const TEXTURE_SLOTS = ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'alphaMap'] as const;

function disposeMaterial(material: THREE.Material): void {
  if (sharedResources.has(material)) return;
  const slots = material as unknown as Partial<Record<(typeof TEXTURE_SLOTS)[number], THREE.Texture | null>>;
  for (const slot of TEXTURE_SLOTS) {
    const tex = slots[slot];
    if (tex && !sharedResources.has(tex)) tex.dispose();
  }
  material.dispose();
}

/** Frees GPU resources owned by this subtree (skipping shared ones) and detaches it. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Sprite) {
      const geometry = obj.geometry as THREE.BufferGeometry;
      if (!sharedResources.has(geometry)) geometry.dispose();
      const materials: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      materials.forEach(disposeMaterial);
    }
    if (obj instanceof THREE.Light) obj.dispose();
  });
  root.removeFromParent();
}
