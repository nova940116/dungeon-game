import type * as THREE from 'three';
import { createEnemyProjectile, PROJECTILE_STYLES, type ProjectileKind, type ProjectileStyle } from '../../assets/models/EnemyProjectiles';

const FLIGHT_HEIGHT = 0.8;

export class EnemyBullet {
  readonly mesh: THREE.Group;
  readonly style: ProjectileStyle;
  readonly radius: number;
  readonly vx: number;
  readonly vz: number;
  life = 5;
  dead = false;
  private readonly spinner: THREE.Object3D | undefined;

  constructor(
    public x: number,
    public z: number,
    angle: number,
    speed: number,
    readonly damage: number,
    readonly kind: ProjectileKind,
    heavy: boolean,
  ) {
    this.style = PROJECTILE_STYLES[kind];
    this.radius = this.style.radius * (heavy ? 1.15 : 1);
    this.mesh = createEnemyProjectile(kind);
    if (heavy) this.mesh.scale.setScalar(1.2);
    this.mesh.rotation.y = angle; // models face +Z
    this.spinner = this.mesh.getObjectByName('spin');
    this.vx = Math.sin(angle) * speed;
    this.vz = Math.cos(angle) * speed;
    this.sync(0);
  }

  get color(): number {
    return this.style.color;
  }

  sync(dt: number): void {
    this.mesh.position.set(this.x, FLIGHT_HEIGHT, this.z);
    if (this.spinner && this.style.spin) {
      // Rocks tumble end over end; shards and bolts drill around their flight axis.
      if (this.kind === 'rock' || this.kind === 'web') this.spinner.rotation.x += this.style.spin * dt;
      else this.spinner.rotation.z += this.style.spin * dt;
    }
  }
}
