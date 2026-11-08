import { BALANCE } from '../config';
import type { EventBus } from '../engine/EventBus';
import { SKILLS, type SkillDef, type SkillId } from '../data/skills';
import type { Player } from '../entities/Player';
import type { GameEvents } from '../game/events';

export interface SkillOffer {
  skill: SkillDef;
  /** How many times the player already has this skill. */
  stacks: number;
}

/** XP, levels, and the roguelite skill draft. */
export class ProgressionSystem {
  level = 1;
  xp = 0;
  pendingLevelUps = 0;
  private readonly stacks = new Map<SkillId, number>();

  constructor(private readonly events: EventBus<GameEvents>) {}

  get xpToNext(): number {
    return BALANCE.xpBase + this.level * BALANCE.xpPerLevel;
  }

  /** Starts a new run. The player gets one free skill pick at the start. */
  reset(): void {
    this.level = 1;
    this.xp = 0;
    this.pendingLevelUps = 1;
    this.stacks.clear();
    this.emitXp();
  }

  addXp(amount: number): void {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      this.pendingLevelUps++;
      this.events.emit('level:up', { level: this.level });
    }
    this.emitXp();
  }

  rollOffers(player: Player, count = 3): SkillOffer[] {
    const pool = SKILLS.filter((s) => this.stacksOf(s.id) < s.maxStacks && (s.isAvailable?.(player) ?? true));
    const offers: SkillOffer[] = [];
    while (offers.length < count && pool.length > 0) {
      const [skill] = pool.splice(Math.floor(Math.random() * pool.length), 1);
      offers.push({ skill, stacks: this.stacksOf(skill.id) });
    }
    return offers;
  }

  choose(skill: SkillDef, player: Player): void {
    this.stacks.set(skill.id, this.stacksOf(skill.id) + 1);
    skill.apply(player);
    this.pendingLevelUps = Math.max(0, this.pendingLevelUps - 1);
  }

  /** Persistent skills the player owns, in table order (for the HUD). */
  owned(): SkillOffer[] {
    return SKILLS.filter((s) => !s.instant && this.stacksOf(s.id) > 0).map((skill) => ({ skill, stacks: this.stacksOf(skill.id) }));
  }

  private stacksOf(id: SkillId): number {
    return this.stacks.get(id) ?? 0;
  }

  private emitXp(): void {
    this.events.emit('xp:changed', { xp: this.xp, needed: this.xpToNext, level: this.level });
  }
}
