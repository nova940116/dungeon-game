import type { Player } from '../entities/Player';
import type { PlayerClass } from './classes';
import type { PlayerStats } from '../entities/PlayerStats';

/**
 * Level-up augments. Three tiers (rarer = stronger / more build-defining), tags that form
 * synergy sets, and a few "wild" picks (trade-offs). Each augment can be taken only once per run.
 * Augments only change numbers in PlayerStats (or the player directly); the systems that read
 * those numbers do the rest.
 */

export type Tier = 'silver' | 'gold' | 'prism';
export type TagId = 'fire' | 'frost' | 'storm' | 'venom' | 'hunter' | 'guard' | 'swift' | 'barrage' | 'blade';

export const TIERS: Record<Tier, { label: string; rank: number }> = {
  silver: { label: '일반', rank: 0 },
  gold: { label: '희귀', rank: 1 },
  prism: { label: '전설', rank: 2 },
};

/** What an augment can ask the run for, beyond changing the player. */
export interface AugmentContext {
  addRerolls(count: number): void;
}

export interface AugmentDef {
  id: string;
  tier: Tier;
  icon: string;
  name: string;
  description: string;
  tags: readonly TagId[];
  /** One-off effect (healing, rerolls): not listed among owned augments. */
  instant?: boolean;
  /** Only offered to this class (default: both). */
  only?: PlayerClass;
  /** Needs projectiles: never offered to melee fighters (swordsman, or an archer after "검을 뽑아라"). */
  ranged?: boolean;
  /** Needs a melee sweep: only offered to melee fighters. */
  melee?: boolean;
  isAvailable?: (player: Player) => boolean;
  apply: (player: Player, ctx: AugmentContext) => void;
}

export interface SetDef {
  icon: string;
  name: string;
  /** Distinct augments with this tag needed for the bonus. */
  need: number;
  bonus: string;
  apply: (s: PlayerStats) => void;
}

/** Synergy sets: collect `need` different augments of a tag to unlock its bonus (once per run). */
export const SETS: Record<TagId, SetDef> = {
  fire: { icon: '🔥', name: '화염', need: 3, bonus: '화상 피해 +50%, 화상 입은 적이 죽으면 폭발', apply: (s) => ((s.burnDamage *= 1.5), (s.burnExplode = true)) },
  frost: { icon: '❄️', name: '냉기', need: 3, bonus: '둔화된 적에게 피해 +30%, 빙결 확률 +8%', apply: (s) => ((s.chilledVuln += 0.3), (s.freezeChance += 0.08)) },
  storm: { icon: '⚡', name: '번개', need: 3, bonus: '연쇄 번개 확률 +10%, 튕김 +2', apply: (s) => ((s.chainChance += 0.1), (s.chainJumps += 2)) },
  venom: { icon: '🧪', name: '맹독', need: 3, bonus: '독 최대 중첩 +5, 독 걸린 적이 죽으면 주변에 전염', apply: (s) => ((s.poisonMaxStacks += 5), (s.poisonSpread = true)) },
  hunter: { icon: '🎯', name: '사냥꾼', need: 3, bonus: '치명타 피해 +50%', apply: (s) => void (s.critMultiplier += 0.5) },
  guard: { icon: '🛡️', name: '수호', need: 3, bonus: '방마다 보호막 +30, 받는 피해 -5%', apply: (s) => ((s.shieldPerRoom += 30), (s.armor += 0.05)) },
  swift: { icon: '💨', name: '질풍', need: 3, bonus: '이동 속도·공격 속도 +10%', apply: (s) => ((s.moveSpeed *= 1.1), (s.attackInterval /= 1.1)) },
  barrage: { icon: '🏹', name: '화살비', need: 3, bonus: '관통 +1', apply: (s) => void (s.pierce += 1) },
  blade: { icon: '🗡️', name: '칼날', need: 2, bonus: '회전 칼날 +1, 칼날 피해 +25%', apply: (s) => ((s.orbitBlades += 1), (s.orbitDamage += 0.25)) },
};

type Def = Omit<AugmentDef, 'tier' | 'tags'> & { tags?: TagId[] };
const silver = (d: Def): AugmentDef => ({ ...d, tier: 'silver', tags: d.tags ?? [] });
const gold = (d: Def): AugmentDef => ({ ...d, tier: 'gold', tags: d.tags ?? [] });
const prism = (d: Def): AugmentDef => ({ ...d, tier: 'prism', tags: d.tags ?? [] });
const stat = (fn: (s: PlayerStats) => void) => (p: Player) => fn(p.stats);
const hurt = (p: Player) => p.hp < p.maxHp * 0.85;

export const AUGMENTS: readonly AugmentDef[] = [
  // ------------------------------------------------------------ 일반 (silver)
  silver({ id: 'sharpTip', icon: '🗡️', name: '날 선 화살촉', description: '공격력 +20%', tags: ['hunter'], apply: stat((s) => void (s.damage *= 1.2)) }),
  silver({ id: 'quickDraw', icon: '⚡', name: '빠른 시위', description: '공격 속도 +15%', tags: ['swift'], apply: stat((s) => void (s.attackInterval /= 1.15)) }),
  silver({ ranged: true, id: 'extraArrow', icon: '⬆️', name: '덧화살', description: '정면으로 나가는 화살 +1', tags: ['barrage'], apply: stat((s) => void s.frontArrows++) }),
  silver({ ranged: true, id: 'diagonal', icon: '↗️', name: '부채꼴 사격', description: '양쪽 대각선으로 화살 2발 추가', tags: ['barrage'], apply: stat((s) => void s.diagonalPairs++) }),
  silver({ ranged: true, id: 'sideShot', icon: '↔️', name: '양날 사격', description: '좌우 양옆으로도 화살 발사', tags: ['barrage'], apply: stat((s) => void (s.sideArrows = true)) }),
  silver({ ranged: true, id: 'backShot', icon: '⬇️', name: '등 뒤 사격', description: '뒤쪽으로도 화살 발사', tags: ['barrage'], apply: stat((s) => void (s.backArrow = true)) }),
  silver({ ranged: true, id: 'pierce', icon: '📌', name: '꿰뚫는 화살', description: '화살이 적을 1번 더 관통', tags: ['hunter'], apply: stat((s) => void s.pierce++) }),
  silver({ ranged: true, id: 'bounce', icon: '🪃', name: '튕김 화살', description: '화살이 벽과 바위에 2번 튕김', apply: stat((s) => void (s.wallBounces += 2)) }),
  silver({ id: 'keenEye', icon: '👁️', name: '매의 눈', description: '치명타 확률 +10%', tags: ['hunter'], apply: stat((s) => void (s.critChance += 0.1)) }),
  silver({ id: 'heavyHand', icon: '💥', name: '급소 강타', description: '치명타 피해 +40%', tags: ['hunter'], apply: stat((s) => void (s.critMultiplier += 0.4)) }),
  silver({ id: 'vitality', icon: '❤️', name: '강인함', description: '최대 체력 +20% (그만큼 회복)', tags: ['guard'], apply: (p) => p.increaseMaxHp(p.maxHp * 0.2) }),
  silver({ id: 'firstAid', icon: '🧪', name: '응급 처치', description: '체력 50% 회복', instant: true, isAvailable: hurt, apply: (p) => void p.heal(p.maxHp * 0.5) }),
  silver({ id: 'bloodRite', icon: '🩸', name: '피의 의식', description: '적 처치 시 최대 체력의 2% 회복', tags: ['guard'], apply: stat((s) => void (s.lifestealOnKill += 0.02)) }),
  silver({ id: 'fleetFoot', icon: '👟', name: '가벼운 발', description: '이동 속도 +12%', tags: ['swift'], apply: stat((s) => void (s.moveSpeed *= 1.12)) }),
  silver({ ranged: true, id: 'fletching', icon: '🪶', name: '정교한 깃', description: '화살 속도 +25%, 사거리 +25%', apply: stat((s) => ((s.arrowSpeedMul *= 1.25), (s.arrowLifeMul *= 1.25))) }),
  silver({ id: 'emberTip', icon: '🔥', name: '불씨 화살촉', description: '적중 시 화상 (3초간 피해의 45%)', tags: ['fire'], apply: stat((s) => void (s.burnDamage += 0.15)) }),
  silver({ id: 'frostTip', icon: '🧊', name: '서리 화살촉', description: '적중한 적 1.5초간 25% 둔화', tags: ['frost'], apply: stat((s) => void (s.slowOnHit = Math.min(0.6, s.slowOnHit + 0.25))) }),
  silver({ id: 'venomTip', icon: '🐍', name: '독 화살촉', description: '적중할 때마다 독 1중첩 (중첩마다 지속 피해)', tags: ['venom'], apply: stat((s) => void (s.poisonPerHit += 1)) }),
  silver({ id: 'sparkTip', icon: '✨', name: '전기 화살촉', description: '15% 확률로 주변 적에게 연쇄 번개', tags: ['storm'], apply: stat((s) => void (s.chainChance += 0.15)) }),
  silver({ id: 'thickHide', icon: '🦏', name: '두꺼운 가죽', description: '받는 피해 -8%', tags: ['guard'], apply: stat((s) => void (s.armor += 0.08)) }),
  silver({ id: 'nimble', icon: '🍃', name: '날렵함', description: '6% 확률로 공격 회피', tags: ['swift'], apply: stat((s) => void (s.dodge += 0.06)) }),
  silver({ id: 'scholar', icon: '📖', name: '배움의 기쁨', description: '경험치 +20%', apply: stat((s) => void (s.xpMul += 0.2)) }),
  silver({ id: 'regen', icon: '🌿', name: '재생', description: '초당 체력 1 회복', tags: ['guard'], apply: stat((s) => void (s.regen += 1)) }),
  silver({ id: 'giantSlayer', icon: '🗿', name: '거인 사냥꾼', description: '보스에게 주는 피해 +25%', tags: ['hunter'], apply: stat((s) => void (s.bossDamageMul += 0.25)) }),
  silver({ id: 'heavyShot', icon: '🔨', name: '묵직한 화살', description: '적을 밀쳐냄, 공격력 +8%', apply: stat((s) => ((s.knockback += 0.5), (s.damage *= 1.08))) }),
  silver({ id: 'ambush', icon: '🌑', name: '기습', description: '체력이 가득 찬 적에게 피해 +40%', tags: ['hunter'], apply: stat((s) => void (s.ambush += 0.4)) }),
  silver({ only: 'archer', ranged: true, id: 'sniper', icon: '🔭', name: '저격수', description: '멀리 있는 적일수록 피해 증가 (최대 +40%)', tags: ['hunter'], apply: stat((s) => void (s.sniper += 0.4)) }),
  silver({ id: 'patience', icon: '🧘', name: '인내', description: '방을 정리하면 체력 15% 회복', tags: ['guard'], apply: stat((s) => void (s.roomClearHeal += 0.15)) }),
  silver({ melee: true, id: 'longReach', icon: '📏', name: '긴 칼날', description: '공격 사거리 +20%', tags: ['blade'], apply: stat((s) => void (s.meleeRangeMul += 0.2)) }),
  silver({ id: 'luckyCharm', icon: '🍀', name: '행운의 부적', description: '다시 뽑기 +3', instant: true, apply: (_p, ctx) => ctx.addRerolls(3) }),

  // ------------------------------------------------------------ 희귀 (gold)
  gold({ id: 'multishot', icon: '🔁', name: '연속 사격', description: '한 번 더 연달아 발사 (공격력 -10%)', tags: ['barrage'], apply: stat((s) => ((s.volleys += 1), (s.damage *= 0.9))) }),
  gold({ ranged: true, id: 'ricochet', icon: '🎱', name: '도탄', description: '적중한 화살이 근처 다른 적에게 튕김 +1', tags: ['barrage'], apply: stat((s) => void (s.ricochet += 1)) }),
  gold({ ranged: true, id: 'split', icon: '🎆', name: '분열 화살', description: '적중 시 화살이 파편 3발로 갈라짐 (40% 피해)', tags: ['barrage'], apply: stat((s) => void (s.splitShards += 3)) }),
  gold({ ranged: true, id: 'homing', icon: '🧭', name: '추적 화살', description: '화살이 가까운 적을 따라감', tags: ['hunter'], apply: stat((s) => void (s.homing += 5)) }),
  gold({
    id: 'explosive', icon: '💣', name: '폭발 화살', description: '적중 지점에 폭발 (피해의 40%)', tags: ['fire'],
    apply: stat((s) => ((s.explodeRadius = Math.max(s.explodeRadius, 1.8) + 0.3), (s.explodeDamage += 0.4))),
  }),
  gold({ id: 'wildfire', icon: '🌋', name: '들불', description: '화상 피해 +30%p, 화상 입은 적이 받는 피해 +10%', tags: ['fire'], apply: stat((s) => ((s.burnDamage += 0.3), (s.markOnHit += 0.1))) }),
  gold({ id: 'glacier', icon: '🏔️', name: '빙하', description: '12% 확률로 적을 1.2초 빙결', tags: ['frost'], apply: stat((s) => void (s.freezeChance += 0.12)) }),
  gold({ id: 'frostbite', icon: '🥶', name: '동상', description: '둔화·빙결된 적에게 피해 +25%, 적중 시 20% 둔화', tags: ['frost'], apply: stat((s) => ((s.chilledVuln += 0.25), (s.slowOnHit = Math.min(0.6, s.slowOnHit + 0.2)))) }),
  gold({ id: 'stormCaller', icon: '🌩️', name: '폭풍 소환', description: '3초마다 무작위 적 2명에게 낙뢰 (공격력 120%)', tags: ['storm'], apply: stat((s) => void (s.stormStrikes += 2)) }),
  gold({ id: 'conductor', icon: '🔋', name: '전도체', description: '연쇄 번개 확률 +15%, 튕김 +1, 번개 피해 +20%p', tags: ['storm'], apply: stat((s) => ((s.chainChance += 0.15), (s.chainJumps += 1), (s.chainDamage += 0.2))) }),
  gold({ id: 'plague', icon: '☠️', name: '역병', description: '독 피해 +50%, 최대 중첩 +5, 적중 시 독 +1', tags: ['venom'], apply: stat((s) => ((s.poisonDps *= 1.5), (s.poisonMaxStacks += 5), (s.poisonPerHit += 1))) }),
  gold({ id: 'orbit', icon: '🌀', name: '회전 칼날', description: '칼날 2개가 주위를 돌며 적을 벰 (공격력 50%)', tags: ['blade'], apply: stat((s) => void (s.orbitBlades += 2)) }),
  gold({
    id: 'nova', icon: '💫', name: '충격파', description: '4초마다 주변 적에게 충격파 (공격력 90%) — 2번째부터 더 자주', tags: ['storm'],
    apply: stat((s) => ((s.novaDamage += 0.9), (s.novaInterval = s.novaDamage > 1 ? 3.2 : 4))),
  }),
  gold({ id: 'vampire', icon: '🧛', name: '흡혈귀', description: '입힌 피해의 3%만큼 회복', tags: ['guard'], apply: stat((s) => void (s.lifestealOnHit += 0.03)) }),
  gold({ id: 'shieldGen', icon: '🔰', name: '수호의 장막', description: '방에 들어갈 때마다 체력 25 보호막', tags: ['guard'], apply: stat((s) => void (s.shieldPerRoom += 25)) }),
  gold({ id: 'thorns', icon: '🌵', name: '가시 갑옷', description: '부딪친 적에게 공격력 150% 반사, 받는 피해 -5%', tags: ['guard'], apply: stat((s) => ((s.thorns += 1.5), (s.armor += 0.05))) }),
  gold({ id: 'hunterMark', icon: '🎯', name: '사냥감 표식', description: '적중한 적이 3초간 받는 피해 +15%', tags: ['hunter'], apply: stat((s) => void (s.markOnHit += 0.15)) }),
  gold({ id: 'executioner', icon: '🪓', name: '처형인', description: '체력 12% 이하의 일반 적 즉시 처치', tags: ['hunter'], apply: stat((s) => void (s.executeThreshold += 0.12)) }),
  gold({ id: 'focus', icon: '🎐', name: '집중', description: '멈춰 서 있을수록 공격 속도 증가 (3초에 최대 +45%)', tags: ['swift'], apply: stat((s) => void (s.stillRamp += 0.45)) }),
  gold({ id: 'corpseBlast', icon: '⚰️', name: '시체 폭발', description: '적이 죽으면 주변에 폭발 (공격력 100%)', tags: ['fire'], apply: stat((s) => void (s.killBurst += 1)) }),
  gold({ id: 'spirit', icon: '👻', name: '정령 궁수', description: '정령이 1.2초마다 화살을 쏨 (공격력 60%)', tags: ['barrage'], apply: stat((s) => void (s.spiritArrows += 1)) }),
  gold({ id: 'bigArrow', icon: '🦣', name: '거대 화살', description: '화살 크기 +40%, 공격력 +15%', apply: stat((s) => ((s.arrowScale += 0.4), (s.damage *= 1.15))) }),
  gold({ ranged: true, id: 'deathVolley', icon: '🌠', name: '마지막 화살', description: '적이 죽으면 사방으로 화살 6발', tags: ['barrage'], apply: stat((s) => void (s.killArrows += 6)) }),
  gold({
    melee: true, id: 'greatReach', icon: '🗡️', name: '대검술', description: '공격 사거리 +40%, 베기 각도 +15%', tags: ['blade'],
    apply: stat((s) => ((s.meleeRangeMul += 0.4), (s.meleeArcMul += 0.15))),
  }),
  gold({ melee: true, id: 'whirlwind', icon: '🌪️', name: '회오리 베기', description: '3연격의 마지막 일격이 360° 회전 베기가 되고 피해 +30%', tags: ['blade'], apply: stat((s) => ((s.spinFinisher = true), (s.meleeDamageMul += 0.3))) }),
  gold({
    id: 'secondWind', icon: '🌬️', name: '재기', description: '체력 전부 회복, 최대 체력 +10%', instant: true, isAvailable: hurt,
    apply: (p) => (p.increaseMaxHp(p.maxHp * 0.1), void p.heal(p.maxHp)),
  }),

  // ------------------------------------------------------------ 전설 (prism)
  prism({ only: 'archer', ranged: true, id: 'runAndGun', icon: '🏃', name: '질주 사격', description: '이동 중에도 60% 속도로 자동 사격', tags: ['swift'], apply: stat((s) => void (s.fireWhileMoving = 0.6)) }),
  prism({
    id: 'glassCannon', icon: '🔮', name: '유리 대포', description: '공격력 +70%, 최대 체력 -35%',
    apply: (p) => ((p.stats.damage *= 1.7), p.scaleMaxHp(0.65)),
  }),
  prism({ id: 'berserker', icon: '😡', name: '광전사', description: '잃은 체력 1%마다 공격력 +1.2%', tags: ['hunter'], apply: stat((s) => void (s.berserk += 0.012)) }),
  prism({ id: 'phoenix', icon: '🕊️', name: '불사조', description: '쓰러지면 한 번 체력 50%로 부활', tags: ['guard'], apply: stat((s) => void (s.revives += 1)) }),
  prism({
    ranged: true, id: 'arrowStorm', icon: '🌧️', name: '화살 폭우', description: '정면 화살 +2, 대각 화살 +1쌍 (공격력 -15%)', tags: ['barrage'],
    apply: stat((s) => ((s.frontArrows += 2), (s.diagonalPairs += 1), (s.damage *= 0.85))),
  }),
  prism({
    id: 'inferno', icon: '☄️', name: '지옥불', description: '화상 피해 +60%p, 화상 입은 적이 죽으면 폭발', tags: ['fire'],
    apply: stat((s) => ((s.burnDamage += 0.6), (s.burnExplode = true))),
  }),
  prism({
    id: 'absoluteZero', icon: '❄️', name: '절대영도', description: '빙결 확률 +20%, 빙결된 적에게 피해 +60%', tags: ['frost'],
    apply: stat((s) => ((s.freezeChance += 0.2), (s.frozenVuln += 0.6))),
  }),
  prism({
    id: 'thunderGod', icon: '🌪️', name: '뇌신', description: '연쇄 번개 확률 +40%, 튕김 +2, 번개 피해 +40%p', tags: ['storm'],
    apply: stat((s) => ((s.chainChance += 0.4), (s.chainJumps += 2), (s.chainDamage += 0.4))),
  }),
  prism({
    id: 'pandemic', icon: '🦠', name: '대유행', description: '적중 시 독 +2, 독 걸린 적이 죽으면 주변에 전염', tags: ['venom'],
    apply: stat((s) => ((s.poisonPerHit += 2), (s.poisonSpread = true))),
  }),
  prism({ id: 'bladeDance', icon: '⚔️', name: '칼춤', description: '회전 칼날 +3, 칼날 피해 +50%p', tags: ['blade'], apply: stat((s) => ((s.orbitBlades += 3), (s.orbitDamage += 0.5))) }),
  prism({ id: 'timeWarp', icon: '⏳', name: '시간 왜곡', description: '모든 적과 적의 탄환이 25% 느려짐', apply: stat((s) => void (s.enemySlow = 0.25)) }),
  prism({
    id: 'overcharge', icon: '⚜️', name: '과충전', description: '치명타 확률 +25%, 치명타가 작은 폭발을 일으킴', tags: ['hunter'],
    apply: stat((s) => ((s.critChance += 0.25), (s.critExplode = true))),
  }),
  prism({
    id: 'echo', icon: '🔊', name: '메아리', description: '한 번 더 연달아 발사 (피해 감소 없음), 공격 속도 +10%', tags: ['barrage'],
    apply: stat((s) => ((s.volleys += 1), (s.attackInterval /= 1.1))),
  }),
  prism({
    melee: true, id: 'bladeMaster', icon: '🩸', name: '검성', description: '베기 피해 +60%, 공격 사거리 +30%, 공격 속도 +15%', tags: ['blade'],
    apply: stat((s) => ((s.meleeDamageMul += 0.6), (s.meleeRangeMul += 0.3), (s.attackInterval /= 1.15))),
  }),
  prism({
    melee: true, id: 'oneCut', icon: '🌙', name: '일섬', description: '공격 사거리 +90%, 베기 피해 +25%', tags: ['blade'],
    apply: stat((s) => ((s.meleeRangeMul += 0.9), (s.meleeDamageMul += 0.25))),
  }),
  prism({
    only: 'archer', id: 'drawSword', icon: '🏏', name: '검을 뽑아라',
    description: '화살을 버리고 활을 휘둘러 싸운다. 공격력 ×2.4, 최대 체력 +60%, 받는 피해 -15%, 공격·이동 속도 +20%/+10%',
    isAvailable: (p) => !p.stats.meleeMode,
    apply: (p) => {
      const s = p.stats;
      s.meleeMode = true;
      s.damage *= 2.4;
      s.armor += 0.15;
      s.attackInterval /= 1.2;
      s.moveSpeed *= 1.1;
      p.increaseMaxHp(p.maxHp * 0.6);
    },
  }),
];

export const augmentById = (id: string): AugmentDef | undefined => AUGMENTS.find((a) => a.id === id);

/** Swordsman wording for augments written around arrows (same effect on the sword). */
const SWORD_TEXT: Record<string, [string, string]> = {
  sharpTip: ['벼린 칼날', '공격력 +20%'],
  quickDraw: ['빠른 손놀림', '공격 속도 +15%'],
  emberTip: ['불꽃 칼날', '적중 시 화상 (3초간 피해의 45%)'],
  frostTip: ['서리 칼날', '적중한 적 1.5초간 25% 둔화'],
  venomTip: ['독 칼날', '적중할 때마다 독 1중첩 (중첩마다 지속 피해)'],
  sparkTip: ['전기 칼날', '15% 확률로 주변 적에게 연쇄 번개'],
  heavyShot: ['묵직한 일격', '적을 밀쳐냄, 공격력 +8%'],
  multishot: ['연속 베기', '한 번 더 연달아 벰 (공격력 -10%)'],
  explosive: ['폭발 칼날', '적중 지점에 폭발 (피해의 40%)'],
  bigArrow: ['거대한 검', '공격 사거리 +10%, 공격력 +15%'],
  echo: ['잔상', '한 번 더 연달아 벰 (피해 감소 없음), 공격 속도 +10%'],
};

/** Name and description of an augment as shown to a class. */
export function augmentText(a: AugmentDef, cls: PlayerClass): { name: string; description: string } {
  const t = cls === 'swordsman' ? SWORD_TEXT[a.id] : undefined;
  return t ? { name: t[0], description: t[1] } : { name: a.name, description: a.description };
}

/** Synergy set name as shown to a class ("화살비" reads "검무" for the swordsman). */
export function setName(tag: TagId, cls: PlayerClass): string {
  return cls === 'swordsman' && tag === 'barrage' ? '검무' : SETS[tag].name;
}
