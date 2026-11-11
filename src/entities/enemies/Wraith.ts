import type { World } from '../../game/World';
import { angleTo, distance, rand } from '../../utils/math';
import { Enemy, type Difficulty } from '../Enemy';

const ORBIT_RADIUS = 6;

/** Floating wraith: circles the player at range and hurls soul bolts. Flies over rocks. */
export class Wraith extends Enemy {
  private orbit = rand(0, Math.PI * 2);
  private readonly orbitDir = Math.random() < 0.5 ? 1 : -1;
  private cooldown = rand(1.2, 2);

  constructor(x: number, z: number, difficulty: Difficulty) {
    super('wraith', 'wraith', x, z, difficulty);
    // Ghostly: the robe is see-through.
    this.model.restyle((m) => {
      if (m.name.startsWith('Robe')) {
        m.transparent = true;
        m.opacity = 0.72;
      }
    });
  }

  protected think(dt: number, world: World): void {
    const p = world.player;
    this.orbit += dt * 0.45 * this.orbitDir;
    const tx = p.x + Math.sin(this.orbit) * ORBIT_RADIUS;
    const tz = p.z + Math.cos(this.orbit) * ORBIT_RADIUS;
    const far = distance(this.x, this.z, tx, tz) > 0.5;
    if (far) {
      this.steer(angleTo(this.x, this.z, tx, tz), 2.8);
      this.move(dt, world);
    }
    this.face = this.angleToPlayer(world);
    this.root.position.y = this.def.hoverY + Math.sin(this.t * 2.2) * 0.15;
    this.model.setLoop(far ? 'move' : 'idle', 0.25);

    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.model.playOnce('attack', { timeScale: 1.5 });
      world.spawnBullet(this.x, this.z, this.face, 6, 'soul');
      this.cooldown = rand(2.2, 2.8);
    }
  }
}
