import * as THREE from 'three';
import { BALANCE } from '../config';
import { AnimatedModel } from '../assets/AnimatedModel';
import { HealthBar } from '../assets/models/HealthBar';
import type { Room } from '../world/Room';
import { clamp, dampAngle, type Vec2 } from '../utils/math';
import { ArcheryRig } from './ArcheryRig';
import { createDefaultStats, type PlayerStats } from './PlayerStats';

const MOVE_THRESHOLD = 0.15;
/** The source rig ships with a sword we don't use. */
const HIDDEN_PARTS = ['Sword'];
/** Fraction of the attack interval spent pulling the string; the rest is held at full draw. */
const DRAW_PORTION = 0.75;

export class Player {
  readonly radius = 0.42;
  readonly model: AnimatedModel;
  readonly bar = new HealthBar(1.1, 0x4ade80);

  x = 0;
  z = 0;
  face = Math.PI;
  hp: number = BALANCE.playerBaseHp;
  maxHp: number = BALANCE.playerBaseHp;
  stats: PlayerStats = createDefaultStats();
  attackCooldown = 0;
  /** Set by the weapon system each frame when a target is in range. */
  aiming = false;

  private readonly archery: ArcheryRig;
  private invulnerable = 0;
  private hurtFlash = 0;
  private moving = false;

  constructor() {
    this.model = new AnimatedModel('player');
    for (const name of HIDDEN_PARTS) {
      const part = this.model.findObject(name);
      if (part) part.visible = false;
    }
    this.archery = new ArcheryRig(this.model);
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  get isMoving(): boolean {
    return this.moving;
  }

  /** World-space point where arrows leave the bow. */
  get muzzle(): Vec2 {
    return { x: this.x + Math.sin(this.face) * 0.5, z: this.z + Math.cos(this.face) * 0.5 };
  }

  reset(): void {
    this.stats = createDefaultStats();
    this.hp = this.maxHp = BALANCE.playerBaseHp;
    this.invulnerable = 0;
    this.attackCooldown = 0.3;
    this.moving = false;
    this.aiming = false;
    this.root.visible = true;
    this.bar.root.visible = true;
    this.model.reset();
    this.archery.reset();
  }

  placeAt(p: Vec2): void {
    this.x = p.x;
    this.z = p.z;
    this.face = Math.PI;
    this.root.rotation.y = Math.PI;
  }

  /** Applies input movement and collision. Returns whether the player is moving. */
  move(dt: number, dir: Vec2, room: Room): boolean {
    const len = Math.hypot(dir.x, dir.z);
    this.moving = len > MOVE_THRESHOLD;
    if (this.moving) {
      this.x += dir.x * this.stats.moveSpeed * dt;
      this.z += dir.z * this.stats.moveSpeed * dt;
      this.face = Math.atan2(dir.x, dir.z);
    }
    room.constrainPlayer(this, this.radius);
    return this.moving;
  }

  aimAt(angle: number): void {
    this.face = angle;
  }

  /** Returns damage actually taken (0 while invulnerable). */
  takeDamage(amount: number): number {
    if (this.invulnerable > 0 || !this.alive) return 0;
    const dealt = Math.round(amount);
    this.hp = Math.max(0, this.hp - dealt);
    this.invulnerable = BALANCE.playerInvulnerableTime;
    this.hurtFlash = 0.15;
    if (!this.alive) {
      this.bar.root.visible = false;
      this.model.playOnce('death', { hold: true, fade: 0.1 });
    } else if (!this.moving) {
      this.model.playOnce('hit', { timeScale: 1.6 });
    }
    return dealt;
  }

  /** Returns HP actually restored. */
  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  increaseMaxHp(amount: number): void {
    this.maxHp += amount;
    this.hp += amount;
  }

  /** An arrow left the bow: snap the string and follow through. */
  releaseArrow(): void {
    this.archery.release();
  }

  /** Visual sync: animation state, turning, invulnerability blink, HP bar. */
  update(dt: number, cameraRotation: THREE.Quaternion): void {
    this.archery.restore();
    if (this.alive) {
      this.model.setLoop(this.moving ? 'run' : 'idle', 0.15, this.moving ? this.stats.moveSpeed / 6 : 1);
      this.root.rotation.y = dampAngle(this.root.rotation.y, this.face, 18, dt);
    }
    this.model.update(dt);
    this.root.position.set(this.x, 0, this.z);
    const drawProgress = 1 - this.attackCooldown / this.stats.attackInterval;
    this.archery.update(dt, this.alive && this.aiming && !this.moving, clamp(drawProgress / DRAW_PORTION, 0, 1));
    if (!this.alive) return;

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.model.setFlash(this.hurtFlash > 0 ? 0xaa1111 : null);
    this.root.visible = this.invulnerable > 0 && this.hurtFlash <= 0 ? Math.floor(this.invulnerable * 16) % 2 === 0 : true;

    this.bar.setRatio(this.hp / this.maxHp);
    this.bar.place(this.x, 2.55, this.z, cameraRotation);
  }
}
