import type { ModelKey } from '../assets/AssetManifest';
import type { PlayerStats } from '../entities/PlayerStats';

export type PlayerClass = 'archer' | 'swordsman';

export interface ClassDef {
  id: PlayerClass;
  name: string;
  icon: string;
  tagline: string;
  description: string;
  /** Short stat comparison for the select screen: [label, 1…5]. */
  ratings: readonly [string, number][];
  model: ModelKey;
  maxHp: number;
  /** Class tweaks on top of the default stats. */
  stats: (s: PlayerStats) => void;
}

export const CLASSES: Record<PlayerClass, ClassDef> = {
  archer: {
    id: 'archer',
    name: '궁수',
    icon: '🏹',
    tagline: '멀리서 끝없이 쏟아붓는 화살',
    description: '멈춰 서면 가장 가까운 적에게 자동으로 활을 쏩니다. 사거리가 무한하고 화살 증강으로 탄막을 만듭니다.',
    ratings: [['체력', 2], ['사거리', 5], ['근접', 1]],
    model: 'player',
    maxHp: 100,
    stats: () => {},
  },
  swordsman: {
    id: 'swordsman',
    name: '검사',
    icon: '⚔️',
    tagline: '몸보다 큰 대검으로 모든 것을 쓸어버린다',
    description: '멈춰 서면 가까운 적을 거대한 대검으로 자동으로 벱니다. 양손으로 크게 휘둘러 앞쪽을 쓸어버리고, 3연격의 마지막엔 뛰어올라 대검을 땅에 내리찍습니다. 체력과 방어력이 높고, 사거리 증강으로 칼끝이 닿는 거리를 늘립니다.',
    ratings: [['체력', 4], ['사거리', 2], ['근접', 5]],
    model: 'swordsman',
    maxHp: 140,
    stats: (s) => {
      s.damage = 24;
      s.attackInterval = 0.75;
      s.armor = 0.1;
      s.moveSpeed = 6.2;
    },
  },
};
