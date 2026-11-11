import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

/** The Attack clip's blade lands on frame 12 (0.4 s). */
const CLIP_HIT = 0.4;
const SWING_HIT = 0.32;
const SWING_TIME = 0.7;
const REACH = 1.15;

/** Risen skeleton warrior: marches at the player and hacks with a rusty sword. */
export class Skeleton extends Enemy {
  private swing = -1;
  private struck = false;
  private cooldown = rand(0.3, 0.8);

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('skeleton', 'skeleton', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.cooldown -= dt;
    this.face = this.angleToPlayer(world);
    if (this.swing >= 0) {
      this.swing += dt;
      this.model.setLoop('idle');
      if (!this.struck && this.swing >= SWING_HIT) {
        this.struck = true;
        const p = world.player;
        if (this.distanceToPlayer(world) < this.radius + p.radius + REACH) world.damagePlayer(this.contactDamage * 1.2, this);
      }
      if (this.swing >= SWING_TIME) this.swing = -1;
      return;
    }
    if (this.cooldown <= 0 && this.distanceToPlayer(world) < this.radius + REACH + 0.6) {
      this.swing = 0;
      this.struck = false;
      this.cooldown = 1.4;
      this.model.playOnce('attack', { timeScale: CLIP_HIT / SWING_HIT });
      return;
    }
    this.steer(this.face, 2.5);
    this.move(dt, world);
    this.model.setLoop('move', 0.15, 1.15);
  }
}
