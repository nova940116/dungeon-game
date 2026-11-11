import type * as THREE from 'three';
import { disposeObject } from '../../assets/ModelKit';
import { createTelegraphMesh } from '../../assets/models/ProjectileModels';
import type { World } from '../../game/World';
import { Enemy, type Difficulty } from '../Enemy';

type Action = { kind: 'walk' } | { kind: 'slam' | 'charge'; step: number };

const SLAM_WINDUP = 0.9;
const SLAM_RADIUS = 2.3;
/** The Attack clip's blade lands on frame 12 (0.4 s). */
const CLIP_HIT = 0.4;
const CHARGE_WINDUP = 0.7;
const CHARGE_SPEED = 10;
const UNDEAD = 0x5dff7a;

/**
 * The Necromancer's elite summon: a huge armoured revenant. Slow, tanky, and dangerous —
 * a telegraphed greatsword slam up close, a telegraphed charge from afar.
 */
export class DeathKnight extends Enemy {
  private action: Action = { kind: 'walk' };
  private cooldown = 2;
  private readonly telegraph: THREE.Mesh;
  private readonly glow: THREE.MeshStandardMaterial[];

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('deathKnight', 'deathKnight', x, z, difficulty);
    this.telegraph = createTelegraphMesh(this.radius * 2, 9);
    this.glow = this.model.materialsNamed('Glow', 'Eye');
  }

  override get sceneObjects(): THREE.Object3D[] {
    return [...super.sceneObjects, this.telegraph];
  }

  override die(): void {
    super.die();
    this.telegraph.visible = false;
  }

  override dispose(): void {
    super.dispose();
    disposeObject(this.telegraph);
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    const k = this.dead ? 0 : 0.8 + Math.sin(this.t * 3) * 0.3;
    for (const m of this.glow) m.emissiveIntensity = 2.5 * k;
  }

  protected think(dt: number, world: World): void {
    this.cooldown -= dt;
    const a = this.action;
    switch (a.kind) {
      case 'walk':
        this.face = this.angleToPlayer(world);
        this.steer(this.face, 1.7);
        this.move(dt, world);
        this.model.setLoop('move', 0.2, 0.75);
        if (this.cooldown <= 0) {
          this.action = { kind: this.distanceToPlayer(world) < 4.5 ? 'slam' : 'charge', step: 0 };
          this.timer = 0;
        }
        break;

      case 'slam':
        this.model.setLoop('idle');
        this.timer -= dt;
        if (a.step === 0) {
          this.face = this.angleToPlayer(world);
          const x = this.x + Math.sin(this.face) * 1.8;
          const z = this.z + Math.cos(this.face) * 1.8;
          world.spawnHazard(x, z, SLAM_RADIUS, SLAM_WINDUP, UNDEAD);
          this.model.playOnce('attack', { timeScale: CLIP_HIT / SLAM_WINDUP });
          this.timer = SLAM_WINDUP;
          a.step = 1;
        } else if (this.timer <= 0) {
          world.events.emit('camera:shake', { intensity: 0.25 });
          this.finish(3.2);
        }
        break;

      case 'charge':
        this.timer -= dt;
        if (a.step === 0) {
          this.face = this.angleToPlayer(world);
          this.telegraph.position.set(this.x, 0.05, this.z);
          this.telegraph.rotation.y = this.face;
          this.telegraph.visible = true;
          this.model.setLoop('idle');
          this.model.playOnce('punch', { timeScale: 0.8 });
          this.timer = CHARGE_WINDUP;
          a.step = 1;
        } else if (a.step === 1 && this.timer <= 0) {
          this.telegraph.visible = false;
          this.steer(this.face, CHARGE_SPEED);
          this.model.setLoop('move', 0.1, 2.2);
          this.timer = 0.6;
          a.step = 2;
        } else if (a.step === 2) {
          if (Math.floor(this.t * 30) % 2 === 0) world.effects.dust(this.x, this.z);
          if (this.move(dt, world) || this.timer <= 0) {
            world.effects.shockwave(this.x, this.z, 1.8, UNDEAD);
            world.events.emit('camera:shake', { intensity: 0.2 });
            this.finish(3.5);
          }
        }
        break;
    }
  }

  private finish(cooldown: number): void {
    this.telegraph.visible = false;
    this.action = { kind: 'walk' };
    this.cooldown = cooldown;
  }
}
