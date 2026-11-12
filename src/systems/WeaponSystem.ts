import type { Enemy } from '../entities/Enemy';
import type { PlayerStats } from '../entities/PlayerStats';
import type { World } from '../game/World';
import { hasLineOfSight } from '../world/Collision';
import { angleTo, distance } from '../utils/math';
import { strike } from './HitEffects';
import { isMelee } from './ProgressionSystem';

const VOLLEY_GAP = 0.13;
const DIAGONAL_STEP = 0.42;
const FRONT_SPACING = 0.3;
/** Delay before the first shot after stopping — long enough to see the bow being drawn. */
const MOVE_FIRE_DELAY = 0.24;

/** Seconds of standing still for the full `stillRamp` attack speed bonus. */
const STILL_RAMP_TIME = 3;

// ---- melee (swordsman, or the archer after "검을 뽑아라")
const MELEE_RANGE = 3.0;
/** Starts a swing when an enemy is this much beyond the blade's reach (it closes in during the swing). */
const ENGAGE_MARGIN = 0.9;
/** Half-angle of the frontal sweep. */
const MELEE_ARC = (78 * Math.PI) / 180;
/** Seconds from the start of a swing to the blade crossing in front, per combo step (the finisher winds up longer). */
const SLASH_HIT = [0.2, 0.2, 0.28] as const;
/** The combo restarts after this long without a swing. */
const COMBO_RESET = 1.6;
const MELEE_DAMAGE = 1.4;
/** Third hit of the combo. */
const FINISHER = 1.6;
const SLASH_COLOR = { swordsman: 0xc9d2e0, archer: 0xffc04a } as const;
/** How far in front the greatsword lands on the finisher (share of the reach): shockwave + dust there. */
const SMASH_AT = 0.55;

/** Blade reach (world units) with every augment applied. */
export const meleeReach = (s: PlayerStats): number => MELEE_RANGE * s.meleeRangeMul * (0.75 + 0.25 * s.arrowScale);

interface Queued {
  delay: number;
  run: () => void;
}

interface PatternOptions {
  damageMul?: number;
}

/**
 * The core genre rule: the player fires automatically, but only while standing still
 * (unless an augment allows firing on the move). Targets the nearest enemy in line of sight.
 */
export class WeaponSystem {
  private queue: Queued[] = [];
  private stillTime = 0;
  private combo = 0;
  private sinceSwing = 99;

  reset(): void {
    this.queue = [];
    this.stillTime = 0;
    this.combo = 0;
    this.sinceSwing = 99;
  }

  update(dt: number, world: World, moving: boolean): void {
    const player = world.player;
    const s = player.stats;
    this.stillTime = moving ? 0 : this.stillTime + dt;
    if (isMelee(player)) {
      this.updateSword(dt, world, moving);
      this.runQueue(dt);
      return;
    }
    const runAndGun = moving && s.fireWhileMoving > 0;
    if (moving && !runAndGun) {
      player.aiming = false;
      player.attackCooldown = Math.max(player.attackCooldown, MOVE_FIRE_DELAY);
      this.queue = [];
      return;
    }

    const target = this.findTarget(world);
    player.aiming = target !== null && !moving;
    if (target) {
      const angle = angleTo(player.x, player.z, target.x, target.z);
      if (!moving) player.aimAt(angle);
      player.attackCooldown -= dt * (moving ? s.fireWhileMoving : 1);
      if (player.attackCooldown <= 0) {
        this.fireVolley(world, angle, moving);
        for (let i = 1; i < s.volleys; i++) this.queue.push({ delay: i * VOLLEY_GAP, run: () => this.fireVolley(world, angle, moving) });
        player.attackCooldown = s.attackInterval / this.ramp(s.stillRamp);
      }
    }
    this.runQueue(dt);
  }

  private ramp(stillRamp: number): number {
    return 1 + stillRamp * Math.min(1, this.stillTime / STILL_RAMP_TIME);
  }

  private runQueue(dt: number): void {
    const due: Queued[] = [];
    for (const q of this.queue) {
      q.delay -= dt;
      if (q.delay <= 0) due.push(q);
    }
    this.queue = this.queue.filter((q) => q.delay > 0);
    for (const q of due) q.run();
  }

  // ------------------------------------------------------------ melee

  private reach(world: World): number {
    return meleeReach(world.player.stats);
  }

  /** Stops → auto-swings at the nearest enemy within reach: a wide sweep in front. */
  private updateSword(dt: number, world: World, moving: boolean): void {
    const player = world.player;
    const s = player.stats;
    this.sinceSwing += dt;
    if (moving) {
      player.aiming = false;
      player.attackCooldown = Math.max(player.attackCooldown, MOVE_FIRE_DELAY * 0.6);
      this.queue = [];
      return;
    }
    const target = this.findTarget(world, this.reach(world) + ENGAGE_MARGIN);
    player.aiming = target !== null;
    if (!target) return;
    const angle = angleTo(player.x, player.z, target.x, target.z);
    player.aimAt(angle);
    player.attackCooldown -= dt;
    if (player.attackCooldown > 0) return;
    this.swing(world, angle);
    for (let i = 1; i < s.volleys; i++) this.queue.push({ delay: i * 0.26, run: () => this.swing(world, angle) });
    player.attackCooldown = s.attackInterval / this.ramp(s.stillRamp);
  }

  private swing(world: World, angle: number): void {
    const { player } = world;
    if (this.sinceSwing > COMBO_RESET) this.combo = 0;
    const step = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.sinceSwing = 0;
    const hitDelay = SLASH_HIT[step];
    player.playSlash(step, hitDelay);
    world.events.emit('weapon:fired', { x: player.x, z: player.z, weapon: 'sword' });
    this.queue.push({ delay: hitDelay, run: () => this.slashHit(world, angle, step) });
  }

  private slashHit(world: World, angle: number, step: number): void {
    const { player } = world;
    const s = player.stats;
    if (!player.alive) return;
    const finisher = step === 2;
    const spin = finisher && s.spinFinisher;
    const reach = this.reach(world) * (finisher ? 1.2 : 1);
    const halfArc = spin ? Math.PI : Math.min(Math.PI, MELEE_ARC * s.meleeArcMul * (finisher ? 1.2 : 1));
    const power = finisher ? FINISHER : 1;
    world.effects.slashArc(player.x, player.z, angle, reach, SLASH_COLOR[player.cls], halfArc * 2, step % 2 === 1);
    if (finisher) {
      world.events.emit('camera:shake', { intensity: spin ? 0.24 : 0.18 });
      if (player.cls === 'swordsman' && !spin) {
        // The greatsword hits the ground: shockwave and dust where it lands.
        const x = player.x + Math.sin(angle) * reach * SMASH_AT;
        const z = player.z + Math.cos(angle) * reach * SMASH_AT;
        world.effects.shockwave(x, z, reach * 0.45, 0xc8b8a0);
        for (let i = 0; i < 4; i++) world.effects.dust(x + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8, 0x8a7a64);
      }
    }

    const source = { vx: Math.sin(angle), vz: Math.cos(angle), angle, minor: true };
    for (const e of [...world.enemies]) {
      if (e.dead || !e.touchable) continue;
      if (distance(player.x, player.z, e.x, e.z) - e.radius > reach) continue;
      let diff = angleTo(player.x, player.z, e.x, e.z) - angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > halfArc) continue;
      strike(world, e, MELEE_DAMAGE * s.meleeDamageMul * power, source, 'slash');
    }
  }

  private findTarget(world: World, range = Infinity): Enemy | null {
    const { player, room } = world;
    let nearest: Enemy | null = null;
    let nearestVisible: Enemy | null = null;
    let best = Infinity;
    let bestVisible = Infinity;
    for (const e of world.enemies) {
      if (e.dead) continue;
      const d = distance(player.x, player.z, e.x, e.z);
      if (d > range) continue;
      if (d < best) {
        best = d;
        nearest = e;
      }
      if (d < bestVisible && hasLineOfSight(player.x, player.z, e.x, e.z, room.obstacles)) {
        bestVisible = d;
        nearestVisible = e;
      }
    }
    return nearestVisible ?? nearest;
  }

  private fireVolley(world: World, angle: number, moving = false): void {
    const { player } = world;
    this.spawnPattern(world, angle);
    if (!moving) player.releaseArrow(); // no bow animation while running
    world.effects.muzzle(player.x + Math.sin(angle) * 0.4, 1.0, player.z + Math.cos(angle) * 0.4);
    world.events.emit('weapon:fired', { x: player.x, z: player.z, weapon: 'bow' });
  }

  /** The projectile pattern augments build up: front / diagonal / side / back (arrows or sword waves). */
  private spawnPattern(world: World, angle: number, opts: PatternOptions = {}): void {
    const { player } = world;
    const s = player.stats;
    const ox = player.x + Math.sin(angle) * 0.4;
    const oz = player.z + Math.cos(angle) * 0.4;
    const perpX = Math.cos(angle);
    const perpZ = -Math.sin(angle);
    const shot = { damageMul: opts.damageMul ?? 1 };
    const spacing = FRONT_SPACING;

    for (let i = 0; i < s.frontArrows; i++) {
      const offset = (i - (s.frontArrows - 1) / 2) * spacing;
      world.spawnArrow(ox + perpX * offset, oz + perpZ * offset, angle, shot);
    }
    for (let d = 1; d <= s.diagonalPairs; d++) {
      world.spawnArrow(ox, oz, angle + DIAGONAL_STEP * d, shot);
      world.spawnArrow(ox, oz, angle - DIAGONAL_STEP * d, shot);
    }
    if (s.sideArrows) {
      world.spawnArrow(player.x, player.z, angle + Math.PI / 2, shot);
      world.spawnArrow(player.x, player.z, angle - Math.PI / 2, shot);
    }
    if (s.backArrow) world.spawnArrow(player.x, player.z, angle + Math.PI, shot);
  }
}
