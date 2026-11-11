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

/** Status effects applied by augments. Timers count down in seconds; StatusSystem ticks the damage. */
export interface EnemyStatus {
  burnDps: number;
  burnTime: number;
  poisonStacks: number;
  poisonTime: number;
  slow: number;
  slowTime: number;
  freezeTime: number;
  mark: number;
  markTime: number;
}

const newStatus = (): EnemyStatus => ({ burnDps: 0, burnTime: 0, poisonStacks: 0, poisonTime: 0, slow: 0, slowTime: 0, freezeTime: 0, mark: 0, markTime: 0 });

/** Tints for status effects (emissive), strongest first. */
const STATUS_TINT = { frozen: 0x2a6fb0, burn: 0x7a2a00, poison: 0x2a5a10, chilled: 0x163a66 } as const;

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
  readonly status: EnemyStatus = newStatus();
  /** Can't touch or be touched by the player (e.g. mid-leap). */
  protected intangible = false;

  protected t = rand(0, 2);
  protected timer = rand(0.8, 2);
  private readonly spawnTime: number;
  private spawnTimer: number;
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
    this.spawnTimer = this.spawnTime = this.def.boss ? BALANCE.bossSpawnTime : BALANCE.enemySpawnTime;
    this.radius = this.def.radius;
    this.x = x;
    this.z = z;
    this.hp = this.maxHp = this.def.hp * difficulty.hpMul;
    this.contactDamage = this.def.contactDamage * difficulty.dmgMul;
    this.bar = new HealthBar(Math.max(0.9, this.radius * 1.6), this.def.boss ? 0xff3b3b : 0xf87171);
    this.bar.root.visible = !this.def.boss; // bosses use the big HUD bar instead
    this.model = new AnimatedModel(modelKey);
    this.root.position.set(x, this.def.hoverY - (this.def.rise ? this.def.barHeight : 0), z);
    this.root.scale.setScalar(this.def.rise ? 1 : 0.01);
    this.face = rand(-0.5, 0.5);
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  get isBoss(): boolean {
    return this.def.boss;
  }

  /** Multiplies all damage taken (bosses shield themselves with this). */
  get damageTakenMul(): number {
    return 1;
  }

  get frozen(): boolean {
    return this.status.freezeTime > 0;
  }

  get chilled(): boolean {
    return this.status.slowTime > 0 || this.frozen;
  }

  /** How fast this enemy acts: slows and freezes scale its AI clock (bosses never fully freeze). */
  timeScale(globalSlow: number): number {
    let k = 1 - globalSlow;
    if (this.frozen) k *= this.isBoss ? 0.45 : 0;
    else if (this.status.slowTime > 0) k *= 1 - this.status.slow * (this.isBoss ? 0.5 : 1);
    return k;
  }

  /** Still materializing: can be hit but doesn't act yet. */
  get spawning(): boolean {
    return this.spawnTimer > 0;
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
      const k = clamp(1 - this.spawnTimer / this.spawnTime, 0.01, 1);
      const ease = 1 - (1 - k) * (1 - k);
      if (this.def.rise) {
        // Claw up out of the ground.
        this.root.scale.setScalar(1);
        this.root.position.y = this.def.hoverY - this.def.barHeight * (1 - ease);
        if (Math.random() < 0.5) world.effects.dust(this.x + rand(-0.4, 0.4), this.z + rand(-0.4, 0.4), 0x5a5048);
      } else {
        this.root.scale.setScalar(ease);
      }
      if (this.spawnTimer <= 0) {
        this.root.position.y = this.def.hoverY;
        this.onSpawned(world);
      }
      return;
    }
    const scaled = dt * this.timeScale(world.player.stats.enemySlow);
    if (scaled > 0) this.think(scaled, world);
    this.model.timeScale = scaled / Math.max(dt, 1e-6);
    const p = world.player;
    if (p.alive && !this.frozen && !this.intangible && distance(this.x, this.z, p.x, p.z) < this.radius + p.radius - 0.05) world.damagePlayer(this.contactDamage, this);
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
    this.model.setFlash(this.flashTimer > 0 ? 0x999999 : this.statusTint());
    this.bar.setRatio(this.hp / this.maxHp);
    this.bar.place(this.x, this.def.hoverY + this.def.barHeight, this.z, cameraRotation);
  }

  private statusTint(): number | null {
    const s = this.status;
    if (s.freezeTime > 0) return STATUS_TINT.frozen;
    if (s.burnTime > 0 && Math.sin(this.t * 14) > 0) return STATUS_TINT.burn;
    if (s.poisonTime > 0 && Math.sin(this.t * 9) > 0.3) return STATUS_TINT.poison;
    if (s.slowTime > 0) return STATUS_TINT.chilled;
    return null;
  }

  /** Returns true if this hit killed the enemy. `flash` = white hit flash (bow hits only, or it never stops). */
  applyDamage(amount: number, flash = true): boolean {
    this.hp -= amount;
    if (flash) this.flashTimer = 0.1;
    if (this.hp > 0 && !this.isBoss && !this.model.isPlayingOneShot) this.model.playOnce('hit', { timeScale: 1.8 });
    return this.hp <= 0;
  }

  die(): void {
    this.dead = true;
    this.model.timeScale = 1;
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

  /** Called once, when the spawn animation ends and the enemy starts acting. */
  protected onSpawned(_world: World): void {}

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
