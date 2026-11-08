import type { Player } from '../entities/Player';

export type SkillId =
  | 'frontArrow'
  | 'multishot'
  | 'diagonal'
  | 'side'
  | 'back'
  | 'pierce'
  | 'bounce'
  | 'attackSpeed'
  | 'attack'
  | 'crit'
  | 'maxHp'
  | 'heal'
  | 'lifesteal'
  | 'moveSpeed';

export interface SkillDef {
  id: SkillId;
  icon: string;
  name: string;
  description: string;
  maxStacks: number;
  /** One-off effect (e.g. healing): not shown in the HUD's owned-skill list. */
  instant?: boolean;
  /** Optional gate, e.g. only offer healing when hurt. */
  isAvailable?: (player: Player) => boolean;
  apply: (player: Player) => void;
}

export const SKILLS: readonly SkillDef[] = [
  { id: 'frontArrow', icon: '⬆️', name: '정면 화살 +1', description: '정면으로 나가는 화살이 1발 늘어납니다.', maxStacks: 3, apply: (p) => void p.stats.frontArrows++ },
  {
    id: 'multishot', icon: '🔁', name: '연속 사격', description: '한 번 더 연달아 발사합니다. (공격력 -10%)', maxStacks: 2,
    apply: (p) => { p.stats.volleys++; p.stats.damage *= 0.9; },
  },
  { id: 'diagonal', icon: '↗️', name: '대각 화살', description: '양쪽 대각선으로 화살 2발 추가.', maxStacks: 2, apply: (p) => void p.stats.diagonalPairs++ },
  { id: 'side', icon: '↔️', name: '측면 화살', description: '좌우 양옆으로 화살을 쏩니다.', maxStacks: 1, apply: (p) => void (p.stats.sideArrows = true) },
  { id: 'back', icon: '⬇️', name: '후방 화살', description: '뒤쪽으로도 화살을 쏩니다.', maxStacks: 1, apply: (p) => void (p.stats.backArrow = true) },
  { id: 'pierce', icon: '🗡️', name: '관통', description: '화살이 적을 1번 더 꿰뚫습니다.', maxStacks: 2, apply: (p) => void p.stats.pierce++ },
  { id: 'bounce', icon: '🪃', name: '벽 반사', description: '화살이 벽과 바위에 2번 튕깁니다.', maxStacks: 1, apply: (p) => void (p.stats.wallBounces += 2) },
  { id: 'attackSpeed', icon: '⚡', name: '공격 속도 +25%', description: '더 빠르게 활을 당깁니다.', maxStacks: 5, apply: (p) => void (p.stats.attackInterval /= 1.25) },
  { id: 'attack', icon: '💪', name: '공격력 +30%', description: '모든 화살의 피해가 증가합니다.', maxStacks: 99, apply: (p) => void (p.stats.damage *= 1.3) },
  { id: 'crit', icon: '🎯', name: '치명타 +12%', description: '치명타는 2배 피해를 줍니다.', maxStacks: 4, apply: (p) => void (p.stats.critChance += 0.12) },
  { id: 'maxHp', icon: '❤️', name: '최대 체력 +25%', description: '최대 체력이 늘고 그만큼 회복합니다.', maxStacks: 99, apply: (p) => p.increaseMaxHp(p.maxHp * 0.25) },
  {
    id: 'heal', icon: '🧪', name: '회복', description: '체력을 50% 회복합니다.', maxStacks: 99, instant: true,
    isAvailable: (p) => p.hp < p.maxHp * 0.85,
    apply: (p) => void p.heal(p.maxHp * 0.5),
  },
  { id: 'lifesteal', icon: '🩸', name: '흡혈', description: '적 처치 시 최대 체력의 3% 회복.', maxStacks: 3, apply: (p) => void (p.stats.lifestealOnKill += 0.03) },
  { id: 'moveSpeed', icon: '👟', name: '이동 속도 +15%', description: '더 빠르게 움직입니다.', maxStacks: 2, apply: (p) => void (p.stats.moveSpeed *= 1.15) },
];
