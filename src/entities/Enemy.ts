import type * as THREE from 'three';
import { BALANCE } from '../config';
import { AnimatedModel } from '../assets/AnimatedModel';
import type { ModelKey } from '../assets/AssetManifest';
import { disposeObject } from '../assets/ModelKit';
import { HealthBar } from '../assets/models/HealthBar';
import { ENEMY_DEFS, type EnemyDef, type EnemyType } from '../data/enemies';
import type { World } from '../game/World';
import { clampCircleInside } from '../world/Collision';
import { angleTo, clamp, dampAngle, distance, rand } from '../utils/math';

export interface Difficulty {
  hpMul: number;
  dmgMul: number;
}

const SINK_TIME = 0.5;

/**
 * Base class for all enemies. Subclasses only implement `think` (their AI);
 * spawning, contact damage, hit reactions, death animation and visuals live here.
 */
export abstract class Enemy {
  readonly def: EnemyDef;
  readonly radius: number;
  readonly maxHp: number;
  readonly contactDamage: number;
  readonly bar: HealthBar;
  readonly model: AnimatedModel;

  x: number;
  z: number;
  vx = 0;
  vz = 0;
  face = 0;
  hp: number;
  /** Logically dead (no collisions / targeting). Still visible while the death animation plays. */
  dead = false;

  protected t = rand(0, 2);
  protected timer = rand(0.8, 2);
  private spawnTimer: number = BALANCE.enemySpawnTime;
  private flashTimer = 0;
  private deathTimer = 0;

  constructor(
    readonly type: EnemyType,
    modelKey: ModelKey,
    x: number,
    z: number,
    difficulty: Difficulty,
  ) {
    this.def = ENEMY_DEFS[type];
    this.radius = this.def.radius;
    this.x = x;
    this.z = z;
    this.hp = this.maxHp = this.def.hp * difficulty.hpMul;
    this.contactDamage = this.def.contactDamage * difficulty.dmgMul;
    this.bar = new HealthBar(Math.max(0.9, this.radius * 1.6), this.def.boss ? 0xff3b3b : 0xf87171);
    this.model = new AnimatedModel(modelKey);
    this.root.position.set(x, this.def.hoverY, z);
    this.root.scale.setScalar(0.01);
    this.face = rand(-0.5, 0.5);
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  get isBoss(): boolean {
    return this.def.boss;
  }

  /** Height used for hit effects / damage numbers. */
  get centerY(): number {
    return this.def.hoverY + this.def.barHeight * 0.55;
  }

  /** Death animation finished: safe to remove. */
  get removable(): boolean {
    return this.dead && this.deathTimer <= 0;
  }

  /** Everything this enemy needs in the scene graph. */
  get sceneObjects(): THREE.Object3D[] {
    return [this.root, this.bar.root];
  }

  /** Gameplay tick (AI + contact damage). Not called once dead. */
  update(dt: number, world: World): void {
    this.t += dt;
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      this.root.scale.setScalar(clamp(1 - this.spawnTimer / BALANCE.enemySpawnTime, 0.01, 1));
      return;
    }
    this.think(dt, world);
    const p = world.player;
    if (p.alive && distance(this.x, this.z, p.x, p.z) < this.radius + p.radius - 0.05) world.damagePlayer(this.contactDamage);
  }

  /** Visual tick: animation, transform, flash, health bar, death sink. */
  syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    this.model.update(dt);
    if (this.dead) {
      this.deathTimer -= dt;
      if (this.deathTimer < SINK_TIME) this.root.position.y -= dt * 1.5;
      this.model.setFlash(null);
      return;
    }
    this.root.position.x = this.x;
    this.root.position.z = this.z;
    this.root.rotation.y = dampAngle(this.root.rotation.y, this.face, 10, dt);
    this.flashTimer -= dt;
    this.model.setFlash(this.flashTimer > 0 ? 0x999999 : null);
    this.bar.setRatio(this.hp / this.maxHp);
    this.bar.place(this.x, this.def.hoverY + this.def.barHeight, this.z, cameraRotation);
  }

  /** Returns true if this hit killed the enemy. */
  applyDamage(amount: number): boolean {
    this.hp -= amount;
    this.flashTimer = 0.1;
    if (this.hp > 0 && !this.isBoss && !this.model.isPlayingOneShot) this.model.playOnce('hit', { timeScale: 1.8 });
    return this.hp <= 0;
  }

  die(): void {
    this.dead = true;
    this.bar.root.visible = false;
    this.deathTimer = this.isBoss ? 2.4 : 1.3;
    this.model.playOnce('death', { hold: true, fade: 0.05 });
  }

  dispose(): void {
    this.model.dispose();
    disposeObject(this.root);
    this.bar.dispose();
  }

  protected abstract think(dt: number, world: World): void;

  /** Integrates velocity and resolves collisions. Returns true if blocked. */
  protected move(dt: number, world: World): boolean {
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    const room = world.room;
    // Flying enemies pass over rocks but stay inside the arena.
    return this.def.flying ? clampCircleInside(this, this.radius, room.bounds) : room.constrain(this, this.radius);
  }

  protected steer(angle: number, speed: number): void {
    this.vx = Math.sin(angle) * speed;
    this.vz = Math.cos(angle) * speed;
  }

  protected angleToPlayer(world: World): number {
    return angleTo(this.x, this.z, world.player.x, world.player.z);
  }

  protected distanceToPlayer(world: World): number {
    return distance(this.x, this.z, world.player.x, world.player.z);
  }
}
