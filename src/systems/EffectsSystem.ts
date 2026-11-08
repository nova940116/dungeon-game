import * as THREE from 'three';
import { vfxTexture, type VfxTextureKey } from '../assets/vfxTextures';
import { rand } from '../utils/math';

interface EmitOptions {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: [number, number];
  color: number;
  /** >1 pushes the color into HDR so bloom picks it up. */
  intensity?: number;
  alpha?: number;
  texture?: VfxTextureKey;
  additive?: boolean;
  gravity?: number;
  drag?: number;
  spin?: number;
}

interface Particle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  alpha: number;
  gravity: number;
  drag: number;
  spin: number;
}

interface Decal {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  alpha: number;
}

const MAX_PARTICLES = 700;
const DECAL_GEOMETRY = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Pooled sprite particles + ground decals. Gameplay code calls the semantic
 * helpers (hit, death, spawn…); tuning lives here in one place.
 */
export class EffectsSystem {
  private readonly free: Particle[] = [];
  private readonly live: Particle[] = [];
  private readonly freeDecals: Decal[] = [];
  private readonly liveDecals: Decal[] = [];
  private created = 0;

  constructor(private readonly scene: THREE.Scene) {}

  // ------------------------------------------------------------ recipes

  /** Arrow hits an enemy. */
  hit(x: number, y: number, z: number, critical = false): void {
    const color = critical ? 0xffd23f : 0xfff1c9;
    this.emit({ x, y, z, life: 0.14, size: [critical ? 1.9 : 1.1, critical ? 2.6 : 1.6], color, intensity: 2.2, texture: 'glow' });
    for (let i = 0; i < (critical ? 12 : 6); i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(4, critical ? 10 : 7);
      this.emit({ x, y, z, vx: Math.cos(a) * s, vy: rand(1, 4), vz: Math.sin(a) * s, life: rand(0.18, 0.32), size: [0.35, 0.05], color, intensity: 2.5, texture: 'star', drag: 6, gravity: 8 });
    }
  }

  /** Arrow / bullet stops on a wall or rock. */
  impact(x: number, y: number, z: number, color = 0xd8d2c4): void {
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit({ x, y, z, vx: Math.cos(a) * 3, vy: rand(1, 3), vz: Math.sin(a) * 3, life: 0.25, size: [0.22, 0.04], color, intensity: 1.8, texture: 'star', gravity: 10 });
    }
    this.emit({ x, y, z, vy: 0.6, life: 0.45, size: [0.4, 0.9], color: 0xbab3a6, alpha: 0.5, texture: 'smoke', additive: false });
  }

  /** Enemy bullet popping. */
  pop(x: number, y: number, z: number, color: number): void {
    this.emit({ x, y, z, life: 0.16, size: [0.7, 1.1], color, intensity: 2, texture: 'glow' });
    for (let i = 0; i < 4; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit({ x, y, z, vx: Math.cos(a) * 2.5, vy: rand(0.5, 2), vz: Math.sin(a) * 2.5, life: 0.25, size: [0.25, 0.04], color, intensity: 2, texture: 'glow' });
    }
  }

  death(x: number, y: number, z: number, color: number, big = false): void {
    const k = big ? 3 : 1;
    for (let i = 0; i < 9 * k; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(0.6, 2.2) * k;
      this.emit({ x: x + Math.cos(a) * 0.3, y: y * rand(0.4, 1), z: z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: rand(0.6, 2), vz: Math.sin(a) * s, life: rand(0.6, 1.0), size: [0.7 * k, 1.8 * k], color: 0xe9e4f0, alpha: 0.55, texture: 'smoke', additive: false, drag: 2.5, spin: rand(-2, 2) });
    }
    for (let i = 0; i < 14 * k; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(3, 7) * Math.sqrt(k);
      this.emit({ x, y, z, vx: Math.cos(a) * s, vy: rand(2, 6), vz: Math.sin(a) * s, life: rand(0.35, 0.7), size: [0.3, 0.05], color, intensity: 2.5, texture: 'star', gravity: 9, drag: 2 });
    }
    this.decal(x, z, 0.4 * k, 2.6 * k, 0.45, color, 0.9);
  }

  /** Summoning circle where an enemy appears. */
  spawn(x: number, z: number, color = 0xb46bff): void {
    this.decal(x, z, 2.2, 0.6, 0.8, color, 1);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.2, 0.9);
      this.emit({ x: x + Math.cos(a) * r, y: 0.1, z: z + Math.sin(a) * r, vy: rand(1.5, 3.5), life: rand(0.5, 0.9), size: [0.3, 0.05], color, intensity: 2.2, texture: 'glow' });
    }
  }

  /** Bow release flash. */
  muzzle(x: number, y: number, z: number): void {
    this.emit({ x, y, z, life: 0.1, size: [0.8, 1.2], color: 0xffe6a8, intensity: 2, texture: 'glow' });
  }

  /** One trail puff behind a moving projectile. */
  trail(x: number, y: number, z: number, color: number, size = 0.4): void {
    this.emit({ x, y, z, life: 0.2, size: [size, 0.04], color, intensity: 1.8, texture: 'glow' });
  }

  /** Footstep dust. */
  dust(x: number, z: number, color = 0xcfc4ad): void {
    this.emit({ x: x + rand(-0.15, 0.15), y: 0.1, z: z + rand(-0.15, 0.15), vy: rand(0.3, 0.8), vx: rand(-0.3, 0.3), vz: rand(-0.3, 0.3), life: 0.5, size: [0.3, 0.8], color, alpha: 0.45, texture: 'smoke', additive: false });
  }

  shockwave(x: number, z: number, radius: number, color: number): void {
    this.decal(x, z, 0.5, radius * 2, 0.5, color, 1);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      this.emit({ x, y: 0.2, z, vx: Math.cos(a) * radius * 2, vz: Math.sin(a) * radius * 2, vy: 0.5, life: 0.45, size: [0.9, 1.6], color: 0xc8b8a0, alpha: 0.5, texture: 'smoke', additive: false, drag: 3 });
    }
  }

  levelUp(x: number, z: number): void {
    this.decal(x, z, 0.5, 3.2, 0.7, 0xffd23f, 1);
    for (let i = 0; i < 24; i++) {
      const a = rand(0, Math.PI * 2);
      const r = rand(0.2, 0.8);
      this.emit({ x: x + Math.cos(a) * r, y: rand(0.1, 0.8), z: z + Math.sin(a) * r, vy: rand(2, 5), life: rand(0.6, 1.1), size: [0.4, 0.05], color: 0xffd23f, intensity: 2.5, texture: 'star', drag: 1, spin: rand(-4, 4) });
    }
  }

  heal(x: number, z: number): void {
    for (let i = 0; i < 14; i++) {
      const a = rand(0, Math.PI * 2);
      this.emit({ x: x + Math.cos(a) * 0.5, y: rand(0.2, 1.2), z: z + Math.sin(a) * 0.5, vy: rand(1, 2.2), life: rand(0.5, 0.9), size: [0.35, 0.05], color: 0x5dff9a, intensity: 2.2, texture: 'glow' });
    }
  }

  collect(x: number, y: number, z: number): void {
    this.emit({ x, y, z, life: 0.18, size: [0.5, 1.0], color: 0x7dffb0, intensity: 2.2, texture: 'glow' });
  }

  // ------------------------------------------------------------ core

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.release(i);
        continue;
      }
      const damp = Math.max(0, 1 - p.drag * dt);
      p.vx *= damp;
      p.vz *= damp;
      p.vy = p.vy * damp - p.gravity * dt;
      const pos = p.sprite.position;
      pos.set(pos.x + p.vx * dt, Math.max(0.03, pos.y + p.vy * dt), pos.z + p.vz * dt);
      const t = 1 - p.life / p.maxLife;
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * t);
      p.material.opacity = p.alpha * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85);
      p.material.rotation += p.spin * dt;
    }

    for (let i = this.liveDecals.length - 1; i >= 0; i--) {
      const d = this.liveDecals[i];
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        this.freeDecals.push(d);
        this.liveDecals.splice(i, 1);
        continue;
      }
      const t = 1 - d.life / d.maxLife;
      const s = d.size0 + (d.size1 - d.size0) * (1 - (1 - t) * (1 - t));
      d.mesh.scale.set(s, 1, s);
      d.material.opacity = d.alpha * (1 - t);
    }
  }

  clear(): void {
    while (this.live.length) this.release(this.live.length - 1);
    for (const d of this.liveDecals) {
      d.mesh.visible = false;
      this.freeDecals.push(d);
    }
    this.liveDecals.length = 0;
  }

  private emit(o: EmitOptions): void {
    const p = this.acquire();
    if (!p) return;
    const m = p.material;
    m.map = vfxTexture(o.texture ?? 'glow');
    m.color.setHex(o.color).multiplyScalar(o.intensity ?? 1);
    m.blending = o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.rotation = rand(0, Math.PI * 2);
    p.sprite.position.set(o.x, o.y, o.z);
    p.sprite.scale.setScalar(o.size[0]);
    p.sprite.visible = true;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.vz = o.vz ?? 0;
    p.life = p.maxLife = o.life;
    p.size0 = o.size[0];
    p.size1 = o.size[1];
    p.alpha = o.alpha ?? 1;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.spin = o.spin ?? 0;
    m.opacity = 0;
    this.live.push(p);
  }

  private acquire(): Particle | null {
    const recycled = this.free.pop();
    if (recycled) return recycled;
    if (this.created >= MAX_PARTICLES) return null;
    this.created++;
    const material = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, map: vfxTexture('glow') });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 5;
    this.scene.add(sprite);
    return { sprite, material, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size0: 1, size1: 1, alpha: 1, gravity: 0, drag: 0, spin: 0 };
  }

  private release(index: number): void {
    const p = this.live[index];
    p.sprite.visible = false;
    this.live[index] = this.live[this.live.length - 1];
    this.live.pop();
    this.free.push(p);
  }

  private decal(x: number, z: number, from: number, to: number, life: number, color: number, alpha: number): void {
    let d = this.freeDecals.pop();
    if (!d) {
      const material = new THREE.MeshBasicMaterial({ map: vfxTexture('ring'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const mesh = new THREE.Mesh(DECAL_GEOMETRY, material);
      mesh.renderOrder = 4;
      this.scene.add(mesh);
      d = { mesh, material, life: 0, maxLife: 1, size0: 1, size1: 1, alpha: 1 };
    }
    d.material.color.setHex(color).multiplyScalar(2);
    d.mesh.position.set(x, 0.06, z);
    d.mesh.visible = true;
    d.life = d.maxLife = life;
    d.size0 = from;
    d.size1 = to;
    d.alpha = alpha;
    this.liveDecals.push(d);
  }
}
