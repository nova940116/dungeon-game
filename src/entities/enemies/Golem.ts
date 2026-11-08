import type { World } from '../../game/World';
import { Enemy, type Difficulty } from '../Enemy';

/** Slow stone giant that hurls a 5-way spread of heavy shots. */
export class Golem extends Enemy {
  constructor(x: number, z: number, difficulty: Difficulty) {
    super('golem', 'giant', x, z, difficulty);
    this.timer = 2;
  }

  protected think(dt: number, world: World): void {
    this.face = this.angleToPlayer(world);
    this.timer -= dt;
    const winding = this.timer < 0.5;
    if (!winding) {
      this.steer(this.face, 1.1);
      this.move(dt, world);
    }
    this.model.setLoop(winding ? 'idle' : 'move', 0.2, 0.8);

    if (winding && !this.model.isPlayingOneShot) this.model.playOnce('attack', { timeScale: 1.4 });
    if (this.timer <= 0) {
      for (let i = -2; i <= 2; i++) world.spawnBullet(this.x, this.z, this.face + i * 0.22, 5, true);
      world.events.emit('enemy:attack', { enemy: this, kind: 'throw' });
      this.timer = 3;
    }
  }
}
