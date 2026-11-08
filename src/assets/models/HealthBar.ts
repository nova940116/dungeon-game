import * as THREE from 'three';
import { disposeObject } from '../ModelKit';
import { GEOMETRY } from '../sharedResources';
import { clamp } from '../../utils/math';

/** Camera-facing world-space health bar drawn on top of everything. */
export class HealthBar {
  readonly root = new THREE.Group();
  private readonly fill: THREE.Mesh;

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

    this.root.add(background, this.fill);
    this.setRatio(1);
  }

  setRatio(ratio: number): void {
    this.fill.scale.x = Math.max(0.0001, this.width * clamp(ratio, 0, 1));
  }

  place(x: number, y: number, z: number, cameraRotation: THREE.Quaternion): void {
    this.root.position.set(x, y, z);
    this.root.quaternion.copy(cameraRotation);
  }

  dispose(): void {
    disposeObject(this.root);
  }
}
