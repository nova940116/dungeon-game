import * as THREE from 'three';
import { shared } from './ModelKit';

const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

/** Geometries reused by every projectile / pickup / UI bar instance. */
export const GEOMETRY = {
  bullet: shared(new THREE.SphereGeometry(0.2, 14, 10)),
  orb: shared(new THREE.OctahedronGeometry(0.16)),
  barBackground: shared(new THREE.PlaneGeometry(1, 0.16)),
  barFill: shared(new THREE.PlaneGeometry(1, 0.12).translate(0.5, 0, 0)),
};

/** Colors above 1.0 are intentional: they push past the bloom threshold. */
export const MATERIAL = {
  bullet: shared(new THREE.MeshBasicMaterial({ color: hdr(0xff4fae, 2.2) })),
  bulletHeavy: shared(new THREE.MeshBasicMaterial({ color: hdr(0xff8a2a, 2.2) })),
  orb: shared(new THREE.MeshStandardMaterial({ color: 0x7dffb0, emissive: 0x2fe08a, emissiveIntensity: 1.8, roughness: 0.2 })),
  telegraph: shared(
    new THREE.MeshBasicMaterial({ color: hdr(0xff2020, 1.4), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  ),
};

export const BULLET_COLORS = { normal: 0xff4fae, heavy: 0xff8a2a } as const;
