import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const WINDUP = 0.45;
const SPREAD_FROM_ROOM = 8;

/** Mushroom that stays put, winds up, and spits aimed shots. */
export class Shooter extends Enemy {
  private wound = false;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('shooter', 'mushnub', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.timer -= dt;
    this.face = this.angleToPlayer(world);
    this.model.setLoop('idle');

    if (!this.wound && this.timer < WINDUP) {
      this.wound = true;
      this.model.playOnce('attack', { timeScale: 1.3 });
    }
    if (this.timer <= 0) {
      world.spawnBullet(this.x, this.z, this.face, 6.5, 'acid');
      world.events.emit('enemy:attack', { enemy: this, kind: 'spit' });
      if (world.roomNo >= SPREAD_FROM_ROOM) {
        world.spawnBullet(this.x, this.z, this.face + 0.25, 6.5, 'acid');
        world.spawnBullet(this.x, this.z, this.face - 0.25, 6.5, 'acid');
      }
      this.timer = rand(2.0, 2.6);
      this.wound = false;
    }
  }
}
