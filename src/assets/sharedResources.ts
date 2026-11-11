import * as THREE from 'three';
import { shared } from './ModelKit';

const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

/** Geometries reused by every UI bar instance. */
export const GEOMETRY = {
  barBackground: shared(new THREE.PlaneGeometry(1, 0.16)),
  barFill: shared(new THREE.PlaneGeometry(1, 0.12).translate(0.5, 0, 0)),
};

/** Colors above 1.0 are intentional: they push past the bloom threshold. */
export const MATERIAL = {
  telegraph: shared(
    new THREE.MeshBasicMaterial({ color: hdr(0xff2020, 1.4), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
  ),
};

