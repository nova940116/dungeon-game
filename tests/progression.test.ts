import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/engine/EventBus';
import { createDefaultStats } from '../src/entities/PlayerStats';
import type { Player } from '../src/entities/Player';
import type { GameEvents } from '../src/game/events';
import { SKILLS } from '../src/data/skills';
import { ProgressionSystem } from '../src/systems/ProgressionSystem';

/** Minimal stand-in for Player (no Three.js needed). */
function fakePlayer(): Player {
  const fake: Pick<Player, 'hp' | 'maxHp' | 'stats' | 'heal' | 'increaseMaxHp'> = {
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
  };
  return fake as Player;
}

describe('ProgressionSystem', () => {
  it('starts a run with one free skill pick', () => {
    const p = new ProgressionSystem(new EventBus<GameEvents>());
    p.reset();
    expect(p.level).toBe(1);
    expect(p.pendingLevelUps).toBe(1);
  });

  it('levels up (possibly several times) and emits events', () => {
    const events = new EventBus<GameEvents>();
    const onLevel = vi.fn();
    events.on('level:up', onLevel);
    const p = new ProgressionSystem(events);
    p.reset();
    p.pendingLevelUps = 0;
    p.addXp(p.xpToNext + 1000);
    expect(p.level).toBeGreaterThan(2);
    expect(onLevel).toHaveBeenCalledTimes(p.level - 1);
    expect(p.pendingLevelUps).toBe(p.level - 1);
  });

  it('never offers a skill past its max stacks', () => {
    const p = new ProgressionSystem(new EventBus<GameEvents>());
    const player = fakePlayer();
    p.reset();
    const side = SKILLS.find((s) => s.id === 'side')!;
    p.choose(side, player);
    expect(player.stats.sideArrows).toBe(true);
    for (let i = 0; i < 200; i++) {
      expect(p.rollOffers(player).some((o) => o.skill.id === 'side')).toBe(false);
    }
  });

  it('only offers healing when hurt', () => {
    const p = new ProgressionSystem(new EventBus<GameEvents>());
    const player = fakePlayer();
    p.reset();
    for (let i = 0; i < 200; i++) expect(p.rollOffers(player).some((o) => o.skill.id === 'heal')).toBe(false);
  });
});
