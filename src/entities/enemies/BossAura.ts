import * as THREE from 'three';
import { disposeObject, mesh } from '../../assets/ModelKit';
import { vfxTexture } from '../../assets/vfxTextures';

const PLANE = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

/**
 * Ground presence of a boss: a dark pool, a slowly turning rune circle and a colored light
 * that follow it around. Purely visual.
 */
export class BossAura {
  readonly group = new THREE.Group();
  /** 0 hides the aura, 1 is the resting look; phases push it higher. */
  power = 0;
  private readonly rune: THREE.Mesh;
  private readonly runeMaterial: THREE.MeshBasicMaterial;
  private readonly pool: THREE.Mesh;
  private readonly poolMaterial: THREE.MeshBasicMaterial;
  private readonly light: THREE.PointLight;
  private readonly color = new THREE.Color();
  private shown = 0;
  private t = 0;

  constructor(
    color: number,
    private readonly radius: number,
    private readonly lightHeight: number,
  ) {
    this.color.setHex(color);
    this.poolMaterial = new THREE.MeshBasicMaterial({ map: vfxTexture('glow'), color: 0x000000, transparent: true, depthWrite: false, opacity: 0 });
    this.pool = mesh(PLANE.clone(), this.poolMaterial, 0, 0.03, 0, false);
    this.pool.scale.setScalar(radius * 3.4);
    this.pool.renderOrder = 1;

    this.runeMaterial = new THREE.MeshBasicMaterial({ map: vfxTexture('rune'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.rune = mesh(PLANE.clone(), this.runeMaterial, 0, 0.05, 0, false);
    this.rune.renderOrder = 2;

    this.light = new THREE.PointLight(color, 0, radius * 9, 1.4);
    this.light.position.y = lightHeight;
    this.group.add(this.pool, this.rune, this.light);
  }

  setColor(color: number): void {
    this.color.setHex(color);
    this.light.color.setHex(color);
  }

  update(dt: number, x: number, z: number): void {
    this.t += dt;
    this.shown += (this.power - this.shown) * Math.min(1, dt * 3);
    const s = this.shown;
    const pulse = 0.85 + Math.sin(this.t * 3.2) * 0.15;
    this.group.position.set(x, 0, z);
    this.group.visible = s > 0.01;
    this.rune.rotation.y = this.t * 0.45;
    this.rune.scale.setScalar(this.radius * 2.9 * (0.9 + Math.min(s, 1.6) * 0.14));
    this.runeMaterial.color.copy(this.color).multiplyScalar(1.6 * pulse * Math.min(s, 1.8));
    this.runeMaterial.opacity = Math.min(1, s);
    this.poolMaterial.opacity = Math.min(0.7, s * 0.55);
    this.light.intensity = 26 * s * pulse;
    this.light.position.y = this.lightHeight;
  }

  dispose(): void {
    disposeObject(this.group);
  }
}
