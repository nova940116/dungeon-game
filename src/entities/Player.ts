import * as THREE from 'three';
import { BALANCE } from '../config';
import { AnimatedModel } from '../assets/AnimatedModel';
import type { ClipName } from '../assets/AssetManifest';
import { HealthBar } from '../assets/models/HealthBar';
import type { Room } from '../world/Room';
import { clamp, dampAngle, shieldedRatios, type Vec2 } from '../utils/math';
import { CLASSES, type PlayerClass } from '../data/classes';
import { createDefaultStats, type PlayerStats } from './PlayerStats';

const MOVE_THRESHOLD = 0.15;
/** Share of the attack interval the release (follow-through + re-nock) may take at most. */
const RELEASE_SHARE = 0.4;
/** Draw never plays slower than its authored speed, nor faster than this. */
const MAX_ANIM_SPEED = 6;
const MIN_DRAW_TIME = 0.12;

/**
 * Combo clips: how far into each clip the blade crosses the target (swordsman: scripts/blender/sword_moves.py HIT;
 * the archer's bow swing after "검을 뽑아라" uses 'attack' only).
 */
const SLASH_HIT = { attack: 12 / 28, punch: 12 / 28, heavy: 15 / 34, spin: 12 / 36 } as const;
const COMBO_CLIPS = ['attack', 'punch', 'heavy'] as const;
/** One-shot clips a flinch must not interrupt. */
const ATTACK_CLIPS = new Set<ClipName>(['attack', 'punch', 'heavy', 'spin', 'draw', 'release']);
/** The archer's bow swing (melee mode): where the bow crosses the target. */
const BOW_SWING_HIT = 0.4;

export class Player {
  readonly radius = 0.42;
  model: AnimatedModel;
  cls: PlayerClass;
  readonly bar = new HealthBar(1.1, 0x4ade80);

  x = 0;
  z = 0;
  face = Math.PI;
  hp: number = BALANCE.playerBaseHp;
  maxHp: number = BALANCE.playerBaseHp;
  stats: PlayerStats = createDefaultStats();
  attackCooldown = 0;
  /** Absorbs damage before HP (augments refill it per room). */
  shield = 0;
  /** Movement slow from webs: strength (0…1) and seconds left. */
  private slow = 0;
  private slowTime = 0;
  /** Set by the weapon system each frame when a target is in range. */
  aiming = false;

  /** True once the string is drawn for the coming shot (cleared on release). */
  private drawn = false;
  private invulnerable = 0;
  private hurtFlash = 0;
  private moving = false;

  constructor(cls: PlayerClass = 'archer') {
    // Archer: bow, string and arrow are part of the model (scripts/blender/build_archer.py).
    // Swordsman: cape and greatsword are part of the model (scripts/blender/build_swordsman.py).
    this.cls = cls;
    this.model = new AnimatedModel(CLASSES[cls].model);
  }

  /** Swaps class (model + base stats). The caller re-adds `root` to the scene. Returns the old root. */
  setClass(cls: PlayerClass): THREE.Group | null {
    if (cls === this.cls) return null;
    const old = this.model.root;
    const { x, z, face } = this;
    this.model.dispose();
    this.cls = cls;
    this.model = new AnimatedModel(CLASSES[cls].model);
    this.root.position.set(x, 0, z);
    this.root.rotation.y = face;
    this.reset();
    return old;
  }

  /**
   * Swordsman combo: forehand, backhand, then the overhead finisher (a full spin with "회오리 베기"),
   * timed so the blade crosses the target `hitDelay` seconds from now.
   */
  playSlash(step: number, hitDelay: number, spin = false): void {
    // The archer (after "검을 뽑아라") only has the one bow swing.
    const combo = COMBO_CLIPS[step % COMBO_CLIPS.length];
    const wanted = this.cls === 'archer' ? 'attack' : combo === 'heavy' && spin ? 'spin' : combo;
    const clip = this.model.has(wanted) ? wanted : 'attack';
    const hitAt = this.model.duration(clip) * (this.cls === 'archer' ? BOW_SWING_HIT : SLASH_HIT[clip]);
    this.model.playOnce(clip, { fade: 0.04, timeScale: clamp(hitAt / hitDelay, 1, MAX_ANIM_SPEED) });
  }

  get root(): THREE.Group {
    return this.model.root;
  }

  get alive(): boolean {
    return this.hp > 0;
  }

  /** Webbed: moves slower for a while (strongest slow wins, timer refreshes). */
  applySlow(strength: number, seconds: number): void {
    this.slow = this.slowTime > 0 ? Math.max(this.slow, strength) : strength;
    this.slowTime = Math.max(this.slowTime, seconds);
  }

  get isSlowed(): boolean {
    return this.slowTime > 0;
  }

  get isInvulnerable(): boolean {
    return this.invulnerable > 0;
  }

  grantInvulnerability(seconds: number): void {
    this.invulnerable = Math.max(this.invulnerable, seconds);
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
    CLASSES[this.cls].stats(this.stats);
    this.hp = this.maxHp = CLASSES[this.cls].maxHp;
    this.invulnerable = 0;
    this.shield = 0;
    this.slow = 0;
    this.slowTime = 0;
    this.attackCooldown = 0.3;
    this.moving = false;
    this.aiming = false;
    this.root.visible = true;
    this.bar.root.visible = true;
    this.model.reset();
    this.drawn = false;
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
    this.slowTime = Math.max(0, this.slowTime - dt);
    if (this.moving) {
      const speed = this.stats.moveSpeed * (this.slowTime > 0 ? 1 - this.slow : 1);
      this.x += dir.x * speed * dt;
      this.z += dir.z * speed * dt;
      this.face = Math.atan2(dir.x, dir.z);
    }
    room.constrainPlayer(this, this.radius);
    return this.moving;
  }

  aimAt(angle: number): void {
    this.face = angle;
  }

  /**
   * Shield first, then HP. A lethal hit consumes a revive (if any) instead of killing.
   * Returns damage actually taken from HP (0 while invulnerable).
   */
  takeDamage(amount: number): { dealt: number; revived: boolean } {
    if (this.invulnerable > 0 || !this.alive) return { dealt: 0, revived: false };
    let rest = Math.round(amount);
    const absorbed = Math.min(this.shield, rest);
    this.shield -= absorbed;
    rest -= absorbed;
    const dealt = rest;
    this.hp = Math.max(0, this.hp - dealt);
    this.invulnerable = BALANCE.playerInvulnerableTime;
    this.hurtFlash = 0.15;
    if (!this.alive && this.stats.revives > 0) {
      this.stats.revives--;
      this.hp = Math.round(this.maxHp * 0.5);
      this.invulnerable = 2.5;
      return { dealt, revived: true };
    }
    if (!this.alive) {
      this.bar.root.visible = false;
      this.model.playOnce('death', { hold: true, fade: 0.1 });
    } else if (!this.moving && !ATTACK_CLIPS.has(this.model.oneShotName ?? 'idle')) {
      // A flinch never cuts a swing or a shot short: the attack keeps its weight (and its timing).
      this.model.playOnce('hit', { timeScale: 1.6 });
    }
    return { dealt, revived: false };
  }

  /** Returns HP actually restored. */
  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  /** Multiplies max HP (trade-off augments); current HP keeps its ratio. */
  scaleMaxHp(factor: number): void {
    const ratio = this.hp / this.maxHp;
    this.maxHp = Math.max(1, Math.round(this.maxHp * factor));
    this.hp = Math.max(1, Math.round(this.maxHp * ratio));
  }

  increaseMaxHp(amount: number): void {
    this.maxHp += amount;
    this.hp += amount;
  }

  /** An arrow left the bow: string snaps, follow-through, then the hand goes back to the string. */
  releaseArrow(): void {
    const length = this.model.duration('release');
    const budget = this.stats.attackInterval * RELEASE_SHARE;
    this.model.playOnce('release', { fade: 0.03, timeScale: clamp(length / Math.min(length, budget), 1, MAX_ANIM_SPEED) });
    this.drawn = false;
  }

  /**
   * Archery state: aim → draw (timed to land on the next shot) → hold at full draw → release.
   * Moving or losing the target cancels the draw.
   */
  private updateArchery(): void {
    const shooting = this.alive && this.aiming && !this.moving;
    const current = this.model.oneShotName;
    if (!shooting) {
      if (current === 'draw' || current === 'release') this.model.stopOneShot(0.15);
      this.drawn = false;
      return;
    }
    if (this.drawn || current !== null) return; // drawing / releasing / flinching
    const length = this.model.duration('draw');
    const time = clamp(this.attackCooldown * 0.95, MIN_DRAW_TIME, length);
    this.model.playOnce('draw', { fade: 0.06, timeScale: Math.min(length / time, MAX_ANIM_SPEED) });
    this.drawn = true;
  }

  /** Visual sync: animation state, turning, invulnerability blink, HP bar. */
  update(dt: number, cameraRotation: THREE.Quaternion): void {
    if (this.alive) {
      const shooting = this.aiming && !this.moving;
      const archer = this.cls === 'archer' && !this.stats.meleeMode;
      const ready = archer && shooting ? 'hold' : 'idle';
      this.model.setLoop(this.moving ? 'run' : ready, 0.15, this.moving ? this.stats.moveSpeed / 6 : 1);
      if (archer) this.updateArchery();
      this.root.rotation.y = dampAngle(this.root.rotation.y, this.face, 18, dt);
    }
    this.model.update(dt);
    this.root.position.set(this.x, 0, this.z);
    if (!this.alive) return;

    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    this.model.setFlash(this.hurtFlash > 0 ? 0xaa1111 : this.slowTime > 0 ? 0x5a6a80 : null);
    this.root.visible = this.invulnerable > 0 && this.hurtFlash <= 0 ? Math.floor(this.invulnerable * 16) % 2 === 0 : true;

    const bar = shieldedRatios(this.hp, this.maxHp, this.shield);
    this.bar.setRatio(bar.hp, bar.shield);
    this.bar.place(this.x, 2.55, this.z, cameraRotation);
  }
}
