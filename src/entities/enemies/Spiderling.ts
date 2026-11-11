import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

/** The Spider Queen's brood: fast, fragile, skitters in and lunges. */
export class Spiderling extends Enemy {
  private lunge = 0;
  private cooldown = rand(0.6, 1.4);

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('spiderling', 'spiderling', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.cooldown -= dt;
    if (this.lunge > 0) {
      this.lunge -= dt;
      this.move(dt, world);
      this.model.setLoop('move', 0.05, 2.8);
      return;
    }
    this.face = this.angleToPlayer(world) + Math.sin(this.t * 5) * 0.6;
    this.steer(this.face, 3.4);
    this.move(dt, world);
    this.model.setLoop('move', 0.1, 2.2);
    if (this.cooldown <= 0 && this.distanceToPlayer(world) < 4.5) {
      this.face = this.angleToPlayer(world);
      this.steer(this.face, 9);
      this.lunge = 0.22;
      this.cooldown = rand(1.1, 1.6);
      this.model.playOnce('attack', { timeScale: 2 });
    }
  }
}
