import { BALANCE } from '../config';
import type { EventBus } from '../engine/EventBus';
import { AUGMENTS, SETS, TIERS, type AugmentContext, type AugmentDef, type TagId, type Tier } from '../data/augments';
import type { Player } from '../entities/Player';
import type { GameEvents } from '../game/events';

export interface AugmentOffer {
  augment: AugmentDef;
}

/** A pending draft: a normal level-up, or a boss reward with a minimum tier. */
interface PendingPick {
  minTier: Tier;
  reward: boolean;
}

export interface SetProgress {
  tag: TagId;
  have: number;
  need: number;
  active: boolean;
}

const STARTING_REROLLS = 2;

/** XP needed to go from `level` to `level + 1`: linear base plus a quadratic term, so each level takes longer. */
export const xpForLevel = (level: number): number =>
  Math.round(BALANCE.xpBase + level * BALANCE.xpPerLevel + level * level * BALANCE.xpGrowth);

/** Fights in melee: the swordsman, or an archer who took "검을 뽑아라". */
export const isMelee = (player: Player): boolean => player.cls === 'swordsman' || player.stats.meleeMode;
const OFFER_COUNT = 3;

/** XP, levels and the augment draft (tiers, rerolls, synergy sets). Every augment can be taken once per run. */
export class ProgressionSystem {
  level = 1;
  xp = 0;
  rerolls = STARTING_REROLLS;
  private readonly pending: PendingPick[] = [];
  private readonly taken = new Set<string>();
  private readonly activeSets = new Set<TagId>();
  /** Randomness source (tests replace it). */
  random: () => number = Math.random;

  constructor(private readonly events: EventBus<GameEvents>) {}

  /** XP needed for the next level: grows faster the higher the level. */
  get xpToNext(): number {
    return xpForLevel(this.level);
  }

  get pendingLevelUps(): number {
    return this.pending.length;
  }

  /** The draft that opens next: is it a boss reward? */
  get nextPick(): PendingPick | undefined {
    return this.pending[0];
  }

  /** Starts a new run. The player gets one free pick at the start. */
  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.rerolls = STARTING_REROLLS;
    this.pending.length = 0;
    this.pending.push({ minTier: 'silver', reward: false });
    this.taken.clear();
    this.activeSets.clear();
    this.emitXp();
  }

  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.pending.push({ minTier: 'silver', reward: false });
      this.events.emit('level:up', { level: this.level });
    }
    this.emitXp();
  }

  /** Boss reward: an extra draft whose cards are at least `minTier`, plus a reroll. */
  grantReward(minTier: Tier): void {
    this.pending.unshift({ minTier, reward: true });
    this.rerolls++;
  }

  /**
   * Chance of each tier for a normal draft at the current level. Legendary (prism) augments are
   * never drawn here: they are only offered as the stage-boss reward.
   */
  tierOdds(): Record<Exclude<Tier, 'prism'>, number> {
    const gold = Math.min(0.5, 0.16 + this.level * 0.025);
    return { gold, silver: 1 - gold };
  }

  rollOffers(player: Player, count = OFFER_COUNT): AugmentOffer[] {
    const minTier = this.nextPick?.minTier ?? 'silver';
    const offers: AugmentOffer[] = [];
    for (let i = 0; i < count; i++) {
      const offer = this.rollOne(player, minTier, offers.map((o) => o.augment.id));
      if (offer) offers.push(offer);
    }
    return offers;
  }

  /** Replaces one card (costs a reroll). Returns null when out of rerolls. */
  reroll(player: Player, offers: AugmentOffer[], index: number): AugmentOffer[] | null {
    if (this.rerolls <= 0) return null;
    const minTier = this.nextPick?.minTier ?? 'silver';
    const exclude = offers.map((o) => o.augment.id);
    const replacement = this.rollOne(player, minTier, exclude);
    if (!replacement) return null;
    this.rerolls--;
    return offers.map((o, i) => (i === index ? replacement : o));
  }

  choose(augment: AugmentDef, player: Player): void {
    this.pending.shift();
    this.take(augment, player);
  }

  /** Drops the next draft when there is nothing left to offer (every augment already taken). */
  skipPick(): void {
    this.pending.shift();
  }

  /** Persistent augments the player owns (for the HUD), rarest first. */
  owned(): AugmentOffer[] {
    return AUGMENTS.filter((a) => !a.instant && this.has(a.id))
      .map((augment) => ({ augment }))
      .sort((a, b) => TIERS[b.augment.tier].rank - TIERS[a.augment.tier].rank);
  }

  /** Progress toward every synergy set the player has started. */
  sets(): SetProgress[] {
    return (Object.keys(SETS) as TagId[])
      .map((tag) => ({ tag, have: this.tagCount(tag), need: SETS[tag].need, active: this.activeSets.has(tag) }))
      .filter((s) => s.have > 0);
  }

  tagCount(tag: TagId): number {
    return AUGMENTS.filter((a) => !a.instant && a.tags.includes(tag) && this.has(a.id)).length;
  }

  /** Whether the augment was already taken this run (it is then never offered again). */
  has(id: string): boolean {
    return this.taken.has(id);
  }

  // ------------------------------------------------------------ internals

  private take(augment: AugmentDef, player: Player): void {
    this.taken.add(augment.id);
    const ctx: AugmentContext = {
      addRerolls: (n) => void (this.rerolls += n),
    };
    augment.apply(player, ctx);
    this.checkSets(player);
  }

  private checkSets(player: Player): void {
    for (const tag of Object.keys(SETS) as TagId[]) {
      if (this.activeSets.has(tag) || this.tagCount(tag) < SETS[tag].need) continue;
      this.activeSets.add(tag);
      SETS[tag].apply(player.stats);
      this.events.emit('augment:set', { tag });
    }
  }

  private pool(player: Player, tier: Tier): AugmentDef[] {
    return AUGMENTS.filter(
      (a) =>
        a.tier === tier &&
        !this.has(a.id) &&
        (!a.only || a.only === player.cls) &&
        (a.ranged ? !isMelee(player) : true) &&
        (a.melee ? isMelee(player) : true) &&
        (a.isAvailable?.(player) ?? true),
    );
  }

  private rollTier(minTier: Tier): Tier {
    if (minTier !== 'silver') return minTier;
    return this.random() < this.tierOdds().gold ? 'gold' : 'silver';
  }

  private rollOne(player: Player, minTier: Tier, exclude: string[]): AugmentOffer | null {
    // Rolled tier first; if it is exhausted, fall back to lower tiers. Legendary only in a legendary draft.
    const fallback: Tier[] = minTier === 'prism' ? ['prism', 'gold', 'silver'] : ['gold', 'silver'];
    for (const t of new Set<Tier>([this.rollTier(minTier), ...fallback])) {
      const pool = this.pool(player, t).filter((a) => !exclude.includes(a.id));
      if (pool.length) {
        const augment = this.weightedPick(pool);
        return { augment };
      }
    }
    return null;
  }

  /** Augments that would complete or advance a set the player started are a bit likelier. */
  private weightedPick(pool: AugmentDef[]): AugmentDef {
    const weights = pool.map((a) => 1 + a.tags.reduce((w, t) => w + (this.tagCount(t) > 0 && !this.activeSets.has(t) ? 0.6 : 0), 0));
    let r = this.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  private emitXp(): void {
    this.events.emit('xp:changed', { xp: this.xp, needed: this.xpToNext, level: this.level });
  }
}
