import { BALANCE } from '../config';
import type { EventBus } from '../engine/EventBus';
import { AUGMENTS, SETS, TIERS, type AugmentContext, type AugmentDef, type TagId, type Tier } from '../data/augments';
import type { Player } from '../entities/Player';
import type { GameEvents } from '../game/events';

export interface AugmentOffer {
  augment: AugmentDef;
  /** How many times the player already has this augment. */
  stacks: number;
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
const OFFER_COUNT = 3;

/** XP, levels and the augment draft (tiers, rerolls, synergy sets). */
export class ProgressionSystem {
  level = 1;
  xp = 0;
  rerolls = STARTING_REROLLS;
  private readonly pending: PendingPick[] = [];
  private readonly stacks = new Map<string, number>();
  private readonly activeSets = new Set<TagId>();
  /** Randomness source (tests replace it). */
  random: () => number = Math.random;

  constructor(private readonly events: EventBus<GameEvents>) {}

  get xpToNext(): number {
    return BALANCE.xpBase + this.level * BALANCE.xpPerLevel;
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
    this.stacks.clear();
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

  choose(augment: AugmentDef, player: Player): string[] {
    this.pending.shift();
    return this.take(augment, player);
  }

  /** Persistent augments the player owns (for the HUD), rarest first. */
  owned(): AugmentOffer[] {
    return AUGMENTS.filter((a) => !a.instant && this.stacksOf(a.id) > 0)
      .map((augment) => ({ augment, stacks: this.stacksOf(augment.id) }))
      .sort((a, b) => TIERS[b.augment.tier].rank - TIERS[a.augment.tier].rank);
  }

  /** Progress toward every synergy set the player has started. */
  sets(): SetProgress[] {
    return (Object.keys(SETS) as TagId[])
      .map((tag) => ({ tag, have: this.tagCount(tag), need: SETS[tag].need, active: this.activeSets.has(tag) }))
      .filter((s) => s.have > 0);
  }

  tagCount(tag: TagId): number {
    return AUGMENTS.filter((a) => !a.instant && a.tags.includes(tag) && this.stacksOf(a.id) > 0).length;
  }

  stacksOf(id: string): number {
    return this.stacks.get(id) ?? 0;
  }

  // ------------------------------------------------------------ internals

  /** Applies an augment. Returns the names of any augments it granted on top (dice). */
  private take(augment: AugmentDef, player: Player): string[] {
    this.stacks.set(augment.id, this.stacksOf(augment.id) + 1);
    const granted: string[] = [];
    const ctx: AugmentContext = {
      grantRandom: (tier, count) => {
        const names: string[] = [];
        const picked = new Set<string>();
        for (let i = 0; i < count; i++) {
          // Distinct augments: "2 random augments" never means one augment twice.
          const pool = this.pool(player, tier, true).filter((a) => !a.instant && !picked.has(a.id));
          if (!pool.length) break;
          const pick = pool[Math.floor(this.random() * pool.length)];
          picked.add(pick.id);
          this.take(pick, player);
          names.push(pick.name);
        }
        granted.push(...names);
        return names;
      },
      addRerolls: (n) => void (this.rerolls += n),
    };
    augment.apply(player, ctx);
    this.checkSets(player);
    return granted;
  }

  private checkSets(player: Player): void {
    for (const tag of Object.keys(SETS) as TagId[]) {
      if (this.activeSets.has(tag) || this.tagCount(tag) < SETS[tag].need) continue;
      this.activeSets.add(tag);
      SETS[tag].apply(player.stats);
      this.events.emit('augment:set', { tag });
    }
  }

  private pool(player: Player, tier: Tier, exact = false): AugmentDef[] {
    return AUGMENTS.filter(
      (a) =>
        (exact ? a.tier === tier : TIERS[a.tier].rank >= TIERS[tier].rank) &&
        this.stacksOf(a.id) < a.maxStacks &&
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
      const pool = this.pool(player, t, true).filter((a) => !exclude.includes(a.id));
      if (pool.length) {
        const augment = this.weightedPick(pool);
        return { augment, stacks: this.stacksOf(augment.id) };
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
