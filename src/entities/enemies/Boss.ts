import type * as THREE from 'three';
import { createTelegraphMesh } from '../../assets/models/ProjectileModels';
import { disposeObject } from '../../assets/ModelKit';
import type { World } from '../../game/World';
import { Enemy, type Difficulty } from '../Enemy';

type Attack = 'radial' | 'fan' | 'charge';
type Phase = { kind: 'walk' } | { kind: Attack; step: number };

const ATTACK_ORDER: readonly Attack[] = ['radial', 'fan', 'charge'];
const CHARGE_WINDUP = 0.85;
const CHARGE_SPEED = 15;

/**
 * Demon lord. Walks toward the player, then cycles through:
 * jump-slam bullet rings → trident fan bursts → telegraphed charge.
 * Below 50% HP it enrages (faster patterns) and summons slimes once.
 */
export class Boss extends Enemy {
  private phase: Phase = { kind: 'walk' };
  private attackIndex = 0;
  private enraged = false;
  private readonly telegraph: THREE.Mesh;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('boss', 'demon', x, z, difficulty);
    this.timer = 1.5;
    this.telegraph = createTelegraphMesh(this.radius * 2, 16);
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

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    if (!this.enraged && this.hp < this.maxHp * 0.5) this.enrage(world);
    const rage = this.enraged ? 1.3 : 1;

    switch (this.phase.kind) {
      case 'walk':
        this.face = this.angleToPlayer(world);
        this.steer(this.face, 1.3);
        this.move(dt, world);
        this.model.setLoop('move', 0.2, rage);
        if (this.timer <= 0) {
          this.phase = { kind: ATTACK_ORDER[this.attackIndex++ % ATTACK_ORDER.length], step: 0 };
          this.timer = 0;
        }
        break;
      case 'radial':
        if (this.timer > 0) break;
        if (this.phase.step === 0) this.model.playOnce('jump', { timeScale: 1.6 * rage });
        this.model.setLoop('idle');
        for (let i = 0, n = 18; i < n; i++) {
          world.spawnBullet(this.x, this.z, (i / n) * Math.PI * 2 + this.phase.step * 0.17, 5 * rage, true);
        }
        world.effects.shockwave(this.x, this.z, 2.5, 0xff6a3a);
        world.events.emit('enemy:attack', { enemy: this, kind: 'slam' });
        world.events.emit('camera:shake', { intensity: 0.15 });
        this.timer = 0.45;
        if (++this.phase.step >= 3) this.endAttack(rage);
        break;
      case 'fan': {
        if (this.timer > 0) break;
        this.face = this.angleToPlayer(world);
        this.model.setLoop('idle');
        this.model.playOnce('attack', { timeScale: 2 * rage });
        if (this.phase.step === 0) world.events.emit('enemy:attack', { enemy: this, kind: 'cast' });
        for (let i = -3; i <= 3; i++) world.spawnBullet(this.x, this.z, this.face + i * 0.16, 7 * rage);
        this.timer = 0.4;
        if (++this.phase.step >= 4) this.endAttack(rage);
        break;
      }
      case 'charge':
        this.updateCharge(dt, world, rage);
        break;
    }
  }

  private updateCharge(dt: number, world: World, rage: number): void {
    if (this.phase.kind !== 'charge') return;
    if (this.phase.step === 0) {
      // Wind-up: show where we're going to charge.
      this.face = this.angleToPlayer(world);
      this.telegraph.position.set(this.x, 0.05, this.z);
      this.telegraph.rotation.y = this.face;
      this.telegraph.visible = true;
      this.model.setLoop('idle');
      this.phase.step = 1;
      this.timer = CHARGE_WINDUP;
    } else if (this.phase.step === 1 && this.timer <= 0) {
      this.telegraph.visible = false;
      this.steer(this.face, CHARGE_SPEED);
      this.model.setLoop('run', 0.1, 1.8);
      world.events.emit('enemy:attack', { enemy: this, kind: 'charge' });
      this.phase.step = 2;
      this.timer = 1;
    } else if (this.phase.step === 2) {
      if (Math.floor(this.t * 30) % 2 === 0) world.effects.dust(this.x, this.z);
      const blocked = this.move(dt, world);
      if (blocked || this.timer <= 0) {
        world.events.emit('camera:shake', { intensity: 0.35 });
        world.effects.shockwave(this.x, this.z, 3, 0xffb070);
        world.events.emit('enemy:attack', { enemy: this, kind: 'impact' });
        this.model.playOnce('punch', { timeScale: 1.5 });
        for (let i = 0; i < 10; i++) world.spawnBullet(this.x, this.z, (i / 10) * Math.PI * 2, 4.5, true);
        this.endAttack(rage);
      }
    }
  }

  private endAttack(rage: number): void {
    this.phase = { kind: 'walk' };
    this.timer = 1.7 / rage;
  }

  private enrage(world: World): void {
    this.enraged = true;
    world.events.emit('boss:enraged', null);
    for (const x of [-4, 4]) world.spawnEnemy('slime', x, this.z);
  }
}
