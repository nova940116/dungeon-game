import * as THREE from 'three';
import { mesh, shared } from '../assets/ModelKit';
import { vfxTexture } from '../assets/vfxTextures';

const DISC = shared(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2));
const RING = shared(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
/** The ring texture peaks at ~88% of its half-size. */
const RING_FIT = 1 / 0.88;

interface HazardLook {
  base: THREE.Material;
  fill: THREE.Material;
  ring: THREE.Material;
}

const looks = new Map<number, HazardLook>();

function lookFor(color: number): HazardLook {
  let look = looks.get(color);
  if (!look) {
    const flat = (opacity: number, k: number) =>
      shared(new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), transparent: true, opacity, depthWrite: false }));
    const ring = shared(
      new THREE.MeshBasicMaterial({ map: vfxTexture('ring'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    ring.color.setHex(color).multiplyScalar(2.4);
    look = { base: flat(0.16, 1), fill: flat(0.4, 1.5), ring };
    looks.set(color, look);
  }
  return look;
}

/**
 * Telegraphed ground explosion: a warning circle that fills up over `delay` seconds,
 * then detonates and hurts the player if they are still inside.
 */
export class Hazard {
  readonly mesh = new THREE.Group();
  dead = false;
  private t = 0;
  private readonly fill: THREE.Mesh;
  private readonly ring: THREE.Mesh;

  constructor(
    readonly x: number,
    readonly z: number,
    readonly radius: number,
    private readonly delay: number,
    readonly damage: number,
    readonly color: number,
  ) {
    const look = lookFor(color);
    const base = mesh(DISC, look.base, 0, 0, 0, false);
    base.scale.setScalar(radius);
    this.fill = mesh(DISC, look.fill, 0, 0.01, 0, false);
    this.ring = mesh(RING, look.ring, 0, 0.02, 0, false);
    this.ring.scale.setScalar(radius * RING_FIT);
    for (const m of [base, this.fill, this.ring]) m.renderOrder = 3;
    this.mesh.add(base, this.fill, this.ring);
    this.mesh.position.set(x, 0.07, z);
    this.update(0);
  }

  /** Returns true on the frame it detonates. */
  update(dt: number): boolean {
    if (this.dead) return false;
    this.t += dt;
    const k = Math.min(1, this.t / this.delay);
    this.fill.scale.setScalar(Math.max(0.001, this.radius * k));
    // Blink faster and faster in the last moments.
    const remaining = this.delay - this.t;
    this.ring.visible = remaining > 0.35 || Math.floor(this.t * 18) % 2 === 0;
    if (this.t < this.delay) return false;
    this.dead = true;
    return true;
  }
}
