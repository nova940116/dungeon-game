import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const ORBIT_RADIUS = 4;
const CRUISE_SPEED = 4.2;
const AIM_TIME = 0.4;
const DIVE_TIME = 0.4;
const DIVE_SPEED = 11;

/** Fast flyer: circles the player at a distance, freezes for a moment to aim, then dives in stinger first. */
export class Bee extends Enemy {
  private aim = 0;
  private dive = 0;
  private cooldown = rand(1.2, 2.4);
  private readonly spin = Math.random() < 0.5 ? 1 : -1;

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('bee', 'bee', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.root.position.y = this.def.hoverY + Math.sin(this.t * 7) * 0.08;
    this.model.setLoop('move', 0.05, 1);
    this.cooldown -= dt;

    if (this.dive > 0) {
      this.dive -= dt;
      this.move(dt, world);
      return;
    }
    if (this.aim > 0) {
      this.aim -= dt;
      this.face = this.angleToPlayer(world);
      if (this.aim <= 0) {
        this.dive = DIVE_TIME;
        this.steer(this.face, DIVE_SPEED);
        world.events.emit('enemy:attack', { enemy: this, kind: 'charge' });
      }
      return;
    }

    // Circle the player: head for a point on a ring around them that keeps sliding sideways.
    const toPlayer = this.angleToPlayer(world);
    const d = this.distanceToPlayer(world);
    const sideways = toPlayer + (Math.PI / 2) * this.spin;
    const inward = (d - ORBIT_RADIUS) / ORBIT_RADIUS;
    this.face = toPlayer;
    const heading = Math.atan2(Math.sin(sideways) + Math.sin(toPlayer) * inward * 2, Math.cos(sideways) + Math.cos(toPlayer) * inward * 2);
    this.steer(heading + Math.sin(this.t * 3) * 0.3, CRUISE_SPEED);
    this.move(dt, world);

    if (this.cooldown <= 0 && d < ORBIT_RADIUS + 3) {
      this.aim = AIM_TIME;
      this.cooldown = rand(2.2, 3.2);
      this.model.playOnce('attack', { timeScale: 0.9 });
    }
  }
}
