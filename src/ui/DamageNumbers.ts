import * as THREE from 'three';
import { rand, removeWhere } from '../utils/math';
import { requireElement } from './dom';

export type NumberStyle = 'normal' | 'crit' | 'hurt' | 'heal';

interface FloatingNumber {
  el: HTMLDivElement;
  pos: THREE.Vector3;
  life: number;
}

const LIFETIME = 0.8;
const RISE_SPEED = 1.6;

/** Damage / heal numbers: world positions projected to screen-space DOM labels. */
export class DamageNumbers {
  private readonly layer = requireElement('damage-layer');
  private readonly items: FloatingNumber[] = [];
  private readonly projected = new THREE.Vector3();

  spawn(x: number, y: number, z: number, text: string, style: NumberStyle = 'normal'): void {
    const el = document.createElement('div');
    el.className = `damage-number damage-number--${style}`;
    el.textContent = text;
    this.layer.appendChild(el);
    this.items.push({ el, pos: new THREE.Vector3(x + rand(-0.3, 0.3), y, z), life: LIFETIME });
  }

  update(dt: number, camera: THREE.Camera): void {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    for (const item of this.items) {
      item.life -= dt;
      item.pos.y += dt * RISE_SPEED;
      this.projected.copy(item.pos).project(camera);
      item.el.style.transform = `translate(${((this.projected.x + 1) / 2) * w}px, ${((1 - this.projected.y) / 2) * hgt}px) translate(-50%, -50%)`;
      item.el.style.opacity = String(Math.min(1, item.life * 3));
    }
    removeWhere(this.items, (i) => i.life <= 0, (i) => i.el.remove());
  }

  clear(): void {
    for (const i of this.items) i.el.remove();
    this.items.length = 0;
  }
}
