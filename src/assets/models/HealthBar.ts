import * as THREE from 'three';
import { disposeObject } from '../ModelKit';
import { GEOMETRY } from '../sharedResources';
import { clamp } from '../../utils/math';

const SHIELD_COLOR = 0x2fb8ff;

/** Camera-facing world-space health bar drawn on top of everything. */
export class HealthBar {
  readonly root = new THREE.Group();
  private readonly fill: THREE.Mesh;
  private readonly shieldFill: THREE.Mesh;

  constructor(
    private readonly width: number,
    color: number,
  ) {
    const background = new THREE.Mesh(
      GEOMETRY.barBackground,
      new THREE.MeshBasicMaterial({ color: 0x111111, depthTest: false, transparent: true, opacity: 0.75 }),
    );
    background.scale.x = width + 0.08;
    background.renderOrder = 20;

    this.fill = new THREE.Mesh(GEOMETRY.barFill, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
    this.fill.position.set(-width / 2, 0, 0.001);
    this.fill.renderOrder = 21;

    // Shield: a separate segment right after the HP fill, in its own colour.
    this.shieldFill = new THREE.Mesh(GEOMETRY.barFill, new THREE.MeshBasicMaterial({ color: SHIELD_COLOR, depthTest: false, transparent: true }));
    this.shieldFill.renderOrder = 22;
    this.shieldFill.visible = false;

    this.root.add(background, this.fill, this.shieldFill);
    this.setRatio(1);
  }

  /** `ratio`: HP share of the bar; `shield`: share taken by the shield segment after it. */
  setRatio(ratio: number, shield = 0): void {
    const hp = clamp(ratio, 0, 1);
    this.fill.scale.x = Math.max(0.0001, this.width * hp);
    this.shieldFill.visible = shield > 0;
    this.shieldFill.position.set(-this.width / 2 + this.width * hp, 0, 0.002);
    this.shieldFill.scale.x = Math.max(0.0001, this.width * clamp(shield, 0, 1 - hp));
  }

  place(x: number, y: number, z: number, cameraRotation: THREE.Quaternion): void {
    this.root.position.set(x, y, z);
    this.root.quaternion.copy(cameraRotation);
  }

  dispose(): void {
    disposeObject(this.root);
  }
}
