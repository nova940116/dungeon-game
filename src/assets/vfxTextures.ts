import * as THREE from 'three';
import { shared } from './ModelKit';

/** Procedurally drawn particle sprites (white, tinted at runtime). Created lazily, shared forever. */
export type VfxTextureKey = 'glow' | 'star' | 'ring' | 'smoke' | 'portal';

const cache = new Map<VfxTextureKey, THREE.Texture>();

function draw(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return shared(tex);
}

const painters: Record<VfxTextureKey, () => THREE.Texture> = {
  glow: () =>
    draw(64, (c, s) => {
      const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }),
  star: () =>
    draw(64, (c, s) => {
      const m = s / 2;
      const g = c.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.15, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? m : m * 0.18;
        c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
      }
      c.closePath();
      c.fill();
    }),
  ring: () =>
    draw(128, (c, s) => {
      const m = s / 2;
      const g = c.createRadialGradient(m, m, m * 0.6, m, m, m);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
    }),
  smoke: () =>
    draw(64, (c, s) => {
      for (let i = 0; i < 7; i++) {
        const x = s / 2 + (Math.random() - 0.5) * s * 0.35;
        const y = s / 2 + (Math.random() - 0.5) * s * 0.35;
        const r = s * (0.22 + Math.random() * 0.14);
        const g = c.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g;
        c.fillRect(0, 0, s, s);
      }
    }),
  portal: () =>
    draw(256, (c, s) => {
      const m = s / 2;
      const g = c.createRadialGradient(m, m, 0, m, m, m);
      g.addColorStop(0, 'rgba(255,255,255,0.65)');
      g.addColorStop(0.55, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.85, 'rgba(255,255,255,0.95)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, s, s);
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 5;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.arc(m, m, m * 0.62, a, a + 0.55);
        c.stroke();
      }
    }),
};

export function vfxTexture(key: VfxTextureKey): THREE.Texture {
  let t = cache.get(key);
  if (!t) {
    t = painters[key]();
    cache.set(key, t);
  }
  return t;
}
