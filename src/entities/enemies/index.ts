import type { EnemyType } from '../../data/enemies';
import type { Difficulty, Enemy } from '../Enemy';
import { Bat } from './Bat';
import { Bee } from './Bee';
import { Boss } from './Boss';
import { DeathKnight } from './DeathKnight';
import { Golem } from './Golem';
import { MidBoss } from './MidBoss';
import { Necromancer } from './Necromancer';
import { Plant } from './Plant';
import { Shooter } from './Shooter';
import { Skeleton } from './Skeleton';
import { Slime } from './Slime';
import { SpiderQueen } from './SpiderQueen';
import { Spiderling } from './Spiderling';
import { Troll } from './Troll';
import { Wraith } from './Wraith';

type EnemyCtor = new (x: number, z: number, difficulty: Difficulty) => Enemy;

const REGISTRY: Record<EnemyType, EnemyCtor> = {
  slime: Slime,
  bat: Bat,
  shooter: Shooter,
  golem: Golem,
  troll: Troll,
  bee: Bee,
  plant: Plant,
  midboss: MidBoss,
  spiderQueen: SpiderQueen,
  necromancer: Necromancer,
  spiderling: Spiderling,
  skeleton: Skeleton,
  wraith: Wraith,
  deathKnight: DeathKnight,
  boss: Boss,
};

export function createEnemy(type: EnemyType, x: number, z: number, difficulty: Difficulty): Enemy {
  return new REGISTRY[type](x, z, difficulty);
}
