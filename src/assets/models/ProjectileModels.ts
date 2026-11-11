import * as THREE from 'three';
import { assets } from '../AssetLibrary';
import { mesh, shared } from '../ModelKit';
import { MATERIAL } from '../sharedResources';
import { vfxTexture } from '../vfxTextures';

const haloMaterials = new Map<number, THREE.SpriteMaterial>();

/** Shared additive halo sprite material per color. */
function halo(color: number, intensity: number): THREE.SpriteMaterial {
  const key = color * 10 + intensity;
  let m = haloMaterials.get(key);
  if (!m) {
    m = shared(new THREE.SpriteMaterial({ map: vfxTexture('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.color.setHex(color).multiplyScalar(intensity);
    haloMaterials.set(key, m);
  }
  return m;
}

/** Arrow pointing along +Z (GLB model). `glow` tints the tip halo (spirit arrows are cyan). */
export function createArrowMesh(glow = 0xffd890): THREE.Group {
  const { root } = assets.instantiate('arrow');
  // The source arrow is modeled along its longest axis; orient it to +Z.
  const size = assets.sizeOf('arrow');
  const pivot = root.children[0];
  if (size.x >= size.z && size.x >= size.y) pivot.rotation.y = -Math.PI / 2;
  else if (size.y >= size.z) pivot.rotation.x = Math.PI / 2;
  root.traverse((o) => {
    o.castShadow = false;
  });
  const tip = new THREE.Sprite(halo(glow, 1.4));
  tip.scale.setScalar(0.45);
  tip.position.z = 0.35;
  root.add(tip);
  return root;
}

/**
 * Crescent arc lying flat, convex side toward +Z, spanning `arc` radians: the shape of a sword
 * slash. `RingGeometry` lives in XY; after rotating it flat, angle θ maps to (cos θ, 0, -sin θ),
 * so +Z (forward) is θ = -π/2.
 */
export function crescentGeometry(inner: number, outer: number, arc: number): THREE.BufferGeometry {
  return new THREE.RingGeometry(inner, outer, 28, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
}

/** Red ground strip showing where a charge attack will go. Extends along +Z from its origin. */
export function createTelegraphMesh(width: number, length: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, length).translate(0, length / 2, 0).rotateX(Math.PI / 2);
  const m = mesh(geo, MATERIAL.telegraph, 0, 0.05, 0, false);
  m.visible = false;
  return m;
}
