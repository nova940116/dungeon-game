import type { World } from '../../game/World';
import { rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const WALK_SPEED = 1.7;
const SWING_RANGE = 3;
const WINDUP = 0.5;
const LUNGE_TIME = 0.22;
const LUNGE_SPEED = 10;
const RECOVER = 0.55;

type Phase = 'chase' | 'windup' | 'lunge' | 'recover';

/** Hulking brute: lumbers toward the player, rears back with its club, then lunges in for a heavy swing. */
export class Troll extends Enemy {
  private phase: Phase = 'chase';
  private phaseTime = 0;
  private cooldown = rand(0.5, 1.2);

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('troll', 'troll', x, z, difficulty);
  }

  protected think(dt: number, world: World): void {
    this.phaseTime -= dt;
    this.cooldown -= dt;
    switch (this.phase) {
      case 'chase':
        this.face = this.angleToPlayer(world);
        this.steer(this.face, WALK_SPEED);
        this.move(dt, world);
        this.model.setLoop('move', 0.2, 0.9);
        if (this.cooldown <= 0 && this.distanceToPlayer(world) < SWING_RANGE) {
          this.phase = 'windup';
          this.phaseTime = WINDUP;
          this.model.playOnce('attack', { timeScale: 0.95 });
        }
        break;
      case 'windup':
        // Tracks the player while winding up, then commits to the direction.
        this.face = this.angleToPlayer(world);
        this.model.setLoop('idle');
        if (this.phaseTime <= 0) {
          this.phase = 'lunge';
          this.phaseTime = LUNGE_TIME;
          this.steer(this.face, LUNGE_SPEED);
          world.events.emit('enemy:attack', { enemy: this, kind: 'slam' });
        }
        break;
      case 'lunge':
        this.move(dt, world);
        if (this.phaseTime <= 0) {
          this.phase = 'recover';
          this.phaseTime = RECOVER;
          world.effects.dust(this.x + Math.sin(this.face) * 1.2, this.z + Math.cos(this.face) * 1.2, 0x8a7a5a);
        }
        break;
      case 'recover':
        this.model.setLoop('idle');
        if (this.phaseTime <= 0) {
          this.phase = 'chase';
          this.cooldown = rand(1.2, 1.8);
        }
        break;
    }
  }
}
