import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const WINDUP = 0.4;
const SHOT_SPEED = 6;
const FAN = 0.3;

/** Rooted carnivorous flower: never moves, rears back and spits a fan of acid seeds at the player. */
export class Plant extends Enemy {
  private wound = false;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('plant', 'plant', x, z, difficulty);
    this.timer = rand(1.2, 2.2);
  }

  protected think(dt: number, world: World): void {
    this.vx = this.vz = 0;
    this.timer -= dt;
    this.face = this.angleToPlayer(world);
    this.model.setLoop('idle');

    if (!this.wound && this.timer < WINDUP) {
      this.wound = true;
      this.model.playOnce('attack', { timeScale: 1.2 });
    }
    if (this.timer <= 0) {
      for (const offset of [-FAN, 0, FAN]) world.spawnBullet(this.x, this.z, this.face + offset, SHOT_SPEED, 'acid');
      world.events.emit('enemy:attack', { enemy: this, kind: 'spit' });
      this.timer = rand(2.4, 3.0);
      this.wound = false;
    }
  }
}
