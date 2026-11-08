import type * as THREE from 'three';
import { createBulletMesh } from '../../assets/models/ProjectileModels';
import { BULLET_COLORS } from '../../assets/sharedResources';

export class EnemyBullet {
  readonly mesh: THREE.Group;
  readonly radius: number;
  readonly color: number;
  readonly vx: number;
  readonly vz: number;
  life = 5;
  dead = false;

  constructor(
    public x: number,
    public z: number,
    angle: number,
    speed: number,
    readonly damage: number,
    heavy: boolean,
  ) {
    this.color = heavy ? BULLET_COLORS.heavy : BULLET_COLORS.normal;
    this.mesh = createBulletMesh(heavy, this.color);
    this.radius = heavy ? 0.3 : 0.2;
    this.vx = Math.sin(angle) * speed;
    this.vz = Math.cos(angle) * speed;
    this.sync();
  }

  sync(): void {
    this.mesh.position.set(this.x, 0.8, this.z);
  }
}
