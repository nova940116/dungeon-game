import type { EnemyType } from '../../data/enemies';
import type { Difficulty, Enemy } from '../Enemy';
import { Bat } from './Bat';
import { Boss } from './Boss';
import { Golem } from './Golem';
import { Shooter } from './Shooter';
import { Slime } from './Slime';

type EnemyCtor = new (x: number, z: number, difficulty: Difficulty) => Enemy;

const REGISTRY: Record<EnemyType, EnemyCtor> = {
  slime: Slime,
  bat: Bat,
  shooter: Shooter,
  golem: Golem,
  boss: Boss,
};

export function createEnemy(type: EnemyType, x: number, z: number, difficulty: Difficulty): Enemy {
  return new REGISTRY[type](x, z, difficulty);
}
