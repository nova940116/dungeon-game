import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const HOP_DURATION = 0.55;
const HOP_SPEED = 3.8;

/** Hops toward the player in short bursts and chomps when close. */
export class Slime extends Enemy {
  private hopTime = 0;
  private biteCooldown = 0;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('slime', 'slime', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    this.biteCooldown -= dt;
    if (this.timer <= 0) {
      this.face = this.angleToPlayer(world) + rand(-0.3, 0.3);
      this.steer(this.face, HOP_SPEED);
      this.hopTime = HOP_DURATION;
      this.timer = rand(1.0, 1.5);
    }
    if (this.hopTime > 0) {
      this.hopTime -= dt;
      this.move(dt, world);
    }
    this.model.setLoop(this.hopTime > 0 ? 'move' : 'idle', 0.12, 1.4);

    if (this.biteCooldown <= 0 && this.distanceToPlayer(world) < this.radius + 1.1) {
      this.face = this.angleToPlayer(world);
      this.model.playOnce('attack', { timeScale: 1.5 });
      world.events.emit('enemy:attack', { enemy: this, kind: 'bite' });
      this.biteCooldown = 1.2;
    }
  }
}
