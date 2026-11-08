import * as THREE from 'three';
import { CAMERA, ROOM } from '../config';
import { clamp, rand } from '../utils/math';

/**
 * Fixed-angle top-down camera that follows the player along Z.
 * Distance adapts to the aspect ratio so the full room width is always visible.
 */
export class CameraRig {
  private focusZ = 0;
  private shakeTime = 0;
  private readonly tilt = THREE.MathUtils.degToRad(CAMERA.tiltDeg);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly fog: THREE.Fog,
  ) {}

  snapTo(z: number): void {
    this.focusZ = this.clampFocus(z);
  }

  shake(intensity: number): void {
    this.shakeTime = Math.max(this.shakeTime, intensity);
  }

  update(dt: number, targetZ: number): void {
    const halfFov = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const fitWidth = (ROOM.halfWidth + CAMERA.sideMargin) / (Math.tan(halfFov) * this.camera.aspect);
    const dist = Math.max(CAMERA.minDistance, fitWidth);

    this.focusZ += (this.clampFocus(targetZ) - this.focusZ) * Math.min(1, dt * CAMERA.followSpeed);

    const s = this.shakeTime > 0 ? this.shakeTime * 0.6 : 0;
    const sx = rand(-s, s);
    const sz = rand(-s, s);
    this.shakeTime = Math.max(0, this.shakeTime - dt);

    this.camera.position.set(sx, Math.sin(this.tilt) * dist, this.focusZ + Math.cos(this.tilt) * dist + sz);
    this.camera.lookAt(sx, 0, this.focusZ - 1 + sz);
    this.fog.near = dist + 8;
    this.fog.far = dist + 45;
  }

  private clampFocus(z: number): number {
    return clamp(z - CAMERA.followLead, -ROOM.halfHeight + 5, ROOM.halfHeight - 6);
  }
}
