import { describe, expect, it, vi } from 'vitest';
import { AUGMENTS, SETS, TIERS, augmentById } from '../src/data/augments';
import { EventBus } from '../src/engine/EventBus';
import { createDefaultStats } from '../src/entities/PlayerStats';
import type { Player } from '../src/entities/Player';
import type { GameEvents } from '../src/game/events';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';

/** Minimal stand-in for Player (no Three.js needed). */
function fakePlayer(): Player {
  const fake: Pick<Player, 'hp' | 'maxHp' | 'stats' | 'heal' | 'increaseMaxHp' | 'scaleMaxHp'> = {
    hp: 100,
    maxHp: 100,
    stats: createDefaultStats(),
    heal(amount) {
      const before = fake.hp;
      fake.hp = Math.min(fake.maxHp, fake.hp + amount);
      return fake.hp - before;
    },
    increaseMaxHp(amount) {
      fake.maxHp += amount;
      fake.hp += amount;
    },
    scaleMaxHp(factor) {
      const ratio = fake.hp / fake.maxHp;
      fake.maxHp = Math.round(fake.maxHp * factor);
      fake.hp = Math.round(fake.maxHp * ratio);
    },
  };
  return fake as Player;
}

const setup = () => {
  const events = new EventBus<GameEvents>();
  const p = new ProgressionSystem(events);
  p.reset();
  return { p, events, player: fakePlayer() };
};
const get = (id: string) => augmentById(id)!;

describe('augment table', () => {
  it('has many unique augments in every tier, and each one applies cleanly', () => {
    expect(AUGMENTS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(AUGMENTS.map((a) => a.id)).size).toBe(AUGMENTS.length);
    for (const tier of Object.keys(TIERS)) expect(AUGMENTS.filter((a) => a.tier === tier).length).toBeGreaterThanOrEqual(10);
    for (const a of AUGMENTS) {
      const { p, player } = setup();
      player.hp = 40;
      expect(() => p.choose(a, player)).not.toThrow();
    }
  });

  it('every tag belongs to a defined synergy set reachable by enough augments', () => {
    for (const [tag, set] of Object.entries(SETS)) {
      expect(AUGMENTS.filter((a) => !a.instant && a.tags.includes(tag as never)).length).toBeGreaterThanOrEqual(set.need);
    }
  });
});

describe('ProgressionSystem', () => {
  it('starts a run with one free pick and two rerolls', () => {
    const { p } = setup();
    expect(p.level).toBe(1);
    expect(p.pendingLevelUps).toBe(1);
    expect(p.rerolls).toBe(2);
  });

  it('levels up (possibly several times) and emits events', () => {
    const { p, events, player } = setup();
    const onLevel = vi.fn();
    events.on('level:up', onLevel);
    p.choose(p.rollOffers(player)[0].augment, player);
    p.addXp(p.xpToNext + 1000);
    expect(p.level).toBeGreaterThan(2);
    expect(onLevel).toHaveBeenCalledTimes(p.level - 1);
    expect(p.pendingLevelUps).toBe(p.level - 1);
  });

  it('offers three different augments and never one past its max stacks', () => {
    const { p, player } = setup();
    p.choose(get('sideShot'), player);
    expect(player.stats.sideArrows).toBe(true);
    for (let i = 0; i < 300; i++) {
      const offers = p.rollOffers(player);
      expect(offers).toHaveLength(3);
      expect(new Set(offers.map((o) => o.augment.id)).size).toBe(3);
      expect(offers.some((o) => o.augment.id === 'sideShot')).toBe(false);
    }
  });

  it('only offers healing when hurt', () => {
    const { p, player } = setup();
    for (let i = 0; i < 300; i++) {
      expect(p.rollOffers(player).some((o) => o.augment.id === 'firstAid' || o.augment.id === 'secondWind')).toBe(false);
    }
  });

  it('rare augments get likelier with level', () => {
    const { p } = setup();
    const early = p.tierOdds();
    p.level = 15;
    const late = p.tierOdds();
    expect(late.gold).toBeGreaterThan(early.gold);
    expect(late.gold + late.silver).toBeCloseTo(1);
  });

  it('legendary augments only appear in the stage-boss reward', () => {
    const { p, player } = setup();
    p.level = 40;
    const noPrism = () => p.rollOffers(player).every((o) => o.augment.tier !== 'prism');
    for (let i = 0; i < 300; i++) expect(noPrism()).toBe(true); // normal level-ups
    p.grantReward('gold'); // mid-boss
    for (let i = 0; i < 300; i++) expect(noPrism()).toBe(true);
    const offers = p.rollOffers(player);
    for (let i = 0; i < 50; i++) expect(p.reroll(player, offers, 0)?.[0].augment.tier ?? 'gold').not.toBe('prism');
  });

  it('boss rewards come first, respect their minimum tier and add a reroll', () => {
    const { p, player } = setup();
    p.grantReward('prism');
    expect(p.rerolls).toBe(3);
    expect(p.nextPick).toEqual({ minTier: 'prism', reward: true });
    for (let i = 0; i < 100; i++) expect(p.rollOffers(player).every((o) => o.augment.tier === 'prism')).toBe(true);
    p.choose(p.rollOffers(player)[0].augment, player);
    p.grantReward('gold');
    for (let i = 0; i < 100; i++) expect(p.rollOffers(player).every((o) => TIERS[o.augment.tier].rank >= 1)).toBe(true);
  });

  it('rerolls replace exactly one card and stop when none are left', () => {
    const { p, player } = setup();
    const offers = p.rollOffers(player);
    const next = p.reroll(player, offers, 1)!;
    expect(next[0]).toBe(offers[0]);
    expect(next[2]).toBe(offers[2]);
    expect(offers.map((o) => o.augment.id)).not.toContain(next[1].augment.id);
    expect(p.rerolls).toBe(1);
    p.reroll(player, next, 0);
    expect(p.reroll(player, next, 0)).toBeNull();
  });

  it('unlocks a synergy set once, when enough different augments share a tag', () => {
    const { p, player, events } = setup();
    const onSet = vi.fn();
    events.on('augment:set', onSet);
    p.choose(get('emberTip'), player);
    p.choose(get('emberTip'), player); // stacks don't count twice
    expect(p.tagCount('fire')).toBe(1);
    p.choose(get('explosive'), player);
    expect(player.stats.burnExplode).toBe(false);
    p.choose(get('corpseBlast'), player);
    expect(player.stats.burnExplode).toBe(true);
    expect(onSet).toHaveBeenCalledWith({ tag: 'fire' });
    p.choose(get('inferno'), player);
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(p.sets().find((s) => s.tag === 'fire')).toMatchObject({ have: 4, active: true });
  });

  it('dice grant distinct random augments of their tier', () => {
    for (let run = 0; run < 200; run++) {
      const { p, player } = setup();
      const granted = p.choose(get('goldDice'), player);
      expect(granted).toHaveLength(2);
      expect(new Set(granted).size).toBe(2);
      const owned = p.owned().map((o) => o.augment);
      expect(owned.filter((a) => a.tier === 'gold')).toHaveLength(2);
      expect(owned.some((a) => a.id === 'goldDice')).toBe(false);
    }
  });

  it('trade-offs change both sides', () => {
    const { p, player } = setup();
    const damage = player.stats.damage;
    p.choose(get('glassCannon'), player);
    expect(player.stats.damage).toBeCloseTo(damage * 1.7);
    expect(player.maxHp).toBe(65);
  });
});
