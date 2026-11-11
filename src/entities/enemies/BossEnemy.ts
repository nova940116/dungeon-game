import type * as THREE from 'three';
import type { ModelKey } from '../../assets/AssetManifest';
import type { BossInfo, EnemyType } from '../../data/enemies';
import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';
import { BossAura } from './BossAura';

/**
 * Shared boss behavior: aura, roar on arrival, HP-threshold phases and ember particles.
 * Subclasses implement the attack patterns (`think`) and react to `onPhase`.
 */
export abstract class BossEnemy extends Enemy {
  readonly info: BossInfo;
  /** Number of phase thresholds crossed so far (0 = opening phase). */
  protected phaseNo = 0;
  protected readonly aura: BossAura;
  private emberTimer = 0;
  private stepTimer = 0;

  constructor(type: EnemyType, modelKey: ModelKey, x: number, z: number, difficulty: Difficulty) {
    super(type, modelKey, x, z, difficulty);
    const info = this.def.bossInfo;
    if (!info) throw new Error(`Enemy type "${type}" has no bossInfo`);
    this.info = info;
    this.aura = new BossAura(info.color, this.radius, this.def.barHeight * 0.45);
    this.aura.power = 0.6;
    this.face = 0;
  }

  /** Speed multiplier for attack patterns: every phase is faster than the last. */
  protected get rage(): number {
    return 1 + this.phaseNo * (this.info.phaseAt.length > 1 ? 0.16 : 0.3);
  }

  override get sceneObjects(): THREE.Object3D[] {
    return [...super.sceneObjects, this.aura.group];
  }

  override update(dt: number, world: World): void {
    super.update(dt, world);
    this.emitAura(dt, world);
    if (!this.spawning) this.checkPhase(world);
  }

  override syncVisual(dt: number, cameraRotation: THREE.Quaternion): void {
    super.syncVisual(dt, cameraRotation);
    this.aura.update(dt, this.x, this.z);
  }

  override die(): void {
    super.die();
    this.aura.power = 0;
  }

  override dispose(): void {
    super.dispose();
    this.aura.dispose();
  }

  protected override onSpawned(world: World): void {
    this.aura.power = 1;
    this.roar(world, 0.5);
  }

  /** Shockwave + shake + roar sound. Used on arrival and on phase changes. */
  protected roar(world: World, shake: number): void {
    this.model.playOnce('roar', { timeScale: 1.15 });
    world.effects.roar(this.x, this.z, this.radius * 5, this.info.color);
    world.events.emit('enemy:attack', { enemy: this, kind: 'roar' });
    world.events.emit('camera:shake', { intensity: shake });
  }

  /** Heavy footfalls while walking: dust + a small camera thump. */
  protected stomp(dt: number, world: World, interval: number, shake = 0.07): void {
    this.stepTimer -= dt;
    if (this.stepTimer > 0) return;
    this.stepTimer = interval;
    for (let i = 0; i < 3; i++) world.effects.dust(this.x + rand(-0.6, 0.6) * this.radius, this.z + rand(-0.6, 0.6) * this.radius);
    world.events.emit('camera:shake', { intensity: shake });
    world.events.emit('enemy:attack', { enemy: this, kind: 'stomp' });
  }

  protected abstract onPhase(world: World, phase: number): void;

  private checkPhase(world: World): void {
    const next = this.info.phaseAt[this.phaseNo];
    if (next === undefined || this.hp <= 0 || this.hp > this.maxHp * next) return;
    this.phaseNo++;
    this.aura.power = 1 + this.phaseNo * 0.45;
    this.roar(world, 0.55);
    world.events.emit('boss:phase', { enemy: this, phase: this.phaseNo, last: this.phaseNo >= this.info.phaseAt.length });
    this.onPhase(world, this.phaseNo);
  }

  private emitAura(dt: number, world: World): void {
    this.emberTimer -= dt;
    if (this.emberTimer > 0) return;
    const heat = this.spawning ? 2.2 : 1 + this.phaseNo * 0.6;
    this.emberTimer = 0.07 / heat;
    const a = rand(0, Math.PI * 2);
    const r = this.radius * rand(0.3, 1.25);
    world.effects.ember(this.x + Math.cos(a) * r, rand(0.1, this.def.barHeight * 0.5), this.z + Math.sin(a) * r, this.info.color);
    if (Math.random() < 0.3) world.effects.gloom(this.x + Math.cos(a) * r * 0.8, rand(0.2, 1.2), this.z + Math.sin(a) * r * 0.8);
  }
}
