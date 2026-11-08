import * as THREE from 'three';
import { assets } from '../AssetLibrary';
import { mesh, shared } from '../ModelKit';
import { GEOMETRY, MATERIAL } from '../sharedResources';
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

/** Arrow pointing along +Z (GLB model). */
export function createArrowMesh(): THREE.Group {
  const { root } = assets.instantiate('arrow');
  // The source arrow is modeled along its longest axis; orient it to +Z.
  const size = assets.sizeOf('arrow');
  const pivot = root.children[0];
  if (size.x >= size.z && size.x >= size.y) pivot.rotation.y = -Math.PI / 2;
  else if (size.y >= size.z) pivot.rotation.x = Math.PI / 2;
  root.traverse((o) => {
    o.castShadow = false;
  });
  const glow = new THREE.Sprite(halo(0xffd890, 1.4));
  glow.scale.setScalar(0.45);
  glow.position.z = 0.35;
  root.add(glow);
  return root;
}

export function createBulletMesh(heavy: boolean, color: number): THREE.Group {
  const g = new THREE.Group();
  const core = mesh(GEOMETRY.bullet, heavy ? MATERIAL.bulletHeavy : MATERIAL.bullet, 0, 0, 0, false);
  const glow = new THREE.Sprite(halo(color, 1.6));
  glow.scale.setScalar(1.1);
  g.add(core, glow);
  if (heavy) g.scale.setScalar(1.5);
  return g;
}

export function createOrbMesh(): THREE.Group {
  const g = new THREE.Group();
  const glow = new THREE.Sprite(halo(0x5dffa0, 1.3));
  glow.scale.setScalar(0.7);
  g.add(mesh(GEOMETRY.orb, MATERIAL.orb, 0, 0, 0, false), glow);
  return g;
}

/** Red ground strip showing where a charge attack will go. Extends along +Z from its origin. */
export function createTelegraphMesh(width: number, length: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(width, length).translate(0, length / 2, 0).rotateX(Math.PI / 2);
  const m = mesh(geo, MATERIAL.telegraph, 0, 0.05, 0, false);
  m.visible = false;
  return m;
}
