import type { World } from '../../game/World';
import { Enemy, type Difficulty } from '../Enemy';

/** Flies over rocks in a wobbly path toward the player. */
export class Bat extends Enemy {
  private attackCooldown = 0;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('bat', 'bat', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.face = this.angleToPlayer(world) + Math.sin(this.t * 2.2) * 0.9;
    this.steer(this.face, 3.2);
    this.move(dt, world);
    this.root.position.y = this.def.hoverY + Math.sin(this.t * 6) * 0.12;
    this.model.setLoop('move', 0.1, 1.3);

    this.attackCooldown -= dt;
    if (this.attackCooldown <= 0 && this.distanceToPlayer(world) < 1.6) {
      this.model.playOnce('attack', { timeScale: 1.6 });
      world.events.emit('enemy:attack', { enemy: this, kind: 'bite' });
      this.attackCooldown = 1;
    }
  }
}
