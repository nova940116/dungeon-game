import * as THREE from 'three';
import { vfxTexture } from '../assets/vfxTextures';
import { rand } from '../utils/math';

export type AmbientKind = 'fireflies' | 'dust' | 'snow' | 'embers';

interface Preset {
  count: number;
  color: number;
  intensity: number;
  size: number;
  additive: boolean;
  opacity: number;
}

const PRESETS: Record<AmbientKind, Preset> = {
  fireflies: { count: 70, color: 0xd9ff7a, intensity: 2.4, size: 0.22, additive: true, opacity: 0.9 },
  dust: { count: 110, color: 0xf3dcb0, intensity: 1, size: 0.16, additive: false, opacity: 0.45 },
  snow: { count: 260, color: 0xffffff, intensity: 1.2, size: 0.17, additive: false, opacity: 0.85 },
  embers: { count: 140, color: 0xff7a2a, intensity: 3, size: 0.18, additive: true, opacity: 0.95 },
};

const AREA = { x: 13, zMin: -20, zMax: 16, yMax: 7 };

/** Theme atmosphere: drifting particles that fill the play area. */
export class AmbientParticles {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly seeds: Float32Array;
  private readonly preset: Preset;

  constructor(private readonly kind: AmbientKind) {
    this.preset = PRESETS[kind];
    const n = this.preset.count;
    this.positions = new Float32Array(n * 3);
    this.seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.positions.set([rand(-AREA.x, AREA.x), rand(0, AREA.yMax), rand(AREA.zMin, AREA.zMax)], i * 3);
      this.seeds[i] = Math.random() * 100;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    const material = new THREE.PointsMaterial({
      map: vfxTexture('glow'),
      size: this.preset.size,
      sizeAttenuation: true,
      transparent: true,
      opacity: this.preset.opacity,
      depthWrite: false,
      blending: this.preset.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    material.color.setHex(this.preset.color).multiplyScalar(this.preset.intensity);
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  update(dt: number, elapsed: number): void {
    const p = this.positions;
    for (let i = 0; i < this.seeds.length; i++) {
      const s = this.seeds[i];
      const k = i * 3;
      switch (this.kind) {
        case 'fireflies':
          p[k] += Math.sin(elapsed * 0.7 + s) * dt * 0.6;
          p[k + 1] = 0.6 + (Math.sin(elapsed * 0.9 + s * 2) * 0.5 + 0.5) * 2.2;
          p[k + 2] += Math.cos(elapsed * 0.6 + s) * dt * 0.6;
          break;
        case 'dust':
          p[k] += dt * (1.2 + Math.sin(s) * 0.4);
          p[k + 1] += Math.sin(elapsed + s) * dt * 0.2;
          break;
        case 'snow':
          p[k] += Math.sin(elapsed * 0.8 + s) * dt * 0.5;
          p[k + 1] -= dt * (0.8 + (s % 1) * 0.6);
          break;
        case 'embers':
          p[k] += Math.sin(elapsed * 1.3 + s) * dt * 0.5;
          p[k + 1] += dt * (0.7 + (s % 1) * 0.9);
          break;
      }
      // Wrap around the play area.
      if (p[k] > AREA.x) p[k] = -AREA.x;
      if (p[k] < -AREA.x) p[k] = AREA.x;
      if (p[k + 1] < 0) p[k + 1] = AREA.yMax;
      if (p[k + 1] > AREA.yMax) p[k + 1] = 0;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
