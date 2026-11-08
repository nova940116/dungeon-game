import { clamp } from '../utils/math';
import { h, requireElement } from './dom';

const FADE_MS = 280;
/** Skills with at most this many stacks show pips (●●○); others show a ×N count. */
const MAX_PIPS = 5;

export interface SkillBadge {
  icon: string;
  name: string;
  description: string;
  stacks: number;
  maxStacks: number;
}

export interface StatSummary {
  damage: number;
  attacksPerSecond: number;
  critChance: number;
  arrowsPerVolley: number;
}

/** Top bar (room, HP, level, XP), toast messages, hurt vignette and screen fades. */
export class Hud {
  private readonly room = requireElement('hud-room');
  private readonly hpFill = requireElement('hud-hp-fill');
  private readonly hpText = requireElement('hud-hp-text');
  private readonly level = requireElement('hud-level');
  private readonly xpFill = requireElement('hud-xp-fill');
  private readonly toastEl = requireElement('toast');
  private readonly vignette = requireElement('hurt-vignette');
  private readonly fadeEl = requireElement('fade');
  private readonly soundButton = requireElement<HTMLButtonElement>('hud-sound');
  private readonly pauseButton = requireElement<HTMLButtonElement>('hud-pause');
  private readonly stats = requireElement('hud-stats');
  private readonly skills = requireElement('hud-skills');
  private toastTime = 0;

  /** Mute button + "M" shortcut. `toggle` returns the new muted state. */
  bindSoundToggle(muted: boolean, toggle: () => boolean): void {
    const render = (m: boolean) => {
      this.soundButton.textContent = m ? '🔇' : '🔊';
      this.soundButton.setAttribute('aria-pressed', String(m));
    };
    const onToggle = () => render(toggle());
    render(muted);
    this.soundButton.addEventListener('click', () => {
      onToggle();
      this.soundButton.blur(); // keep Space/Enter for the game
    });
    window.addEventListener('keydown', (e) => e.code === 'KeyM' && onToggle());
  }

  bindPause(onPause: () => void): void {
    this.pauseButton.addEventListener('click', () => {
      onPause();
      this.pauseButton.blur();
    });
  }

  /** The pause button only makes sense during active play. */
  setPauseAvailable(available: boolean): void {
    this.pauseButton.disabled = !available;
  }

  setRoom(roomNo: number): void {
    this.room.textContent = `방 ${roomNo}`;
  }

  setHealth(hp: number, max: number): void {
    this.hpFill.style.width = `${clamp(hp / max, 0, 1) * 100}%`;
    this.hpText.textContent = `${Math.ceil(hp)} / ${Math.round(max)}`;
  }

  setXp(ratio: number, level: number): void {
    this.xpFill.style.width = `${clamp(ratio, 0, 1) * 100}%`;
    this.level.textContent = `Lv ${level}`;
  }

  /** Current build: key attack stats + every owned skill with its stack level. */
  setBuild(stats: StatSummary, skills: SkillBadge[]): void {
    this.stats.replaceChildren(
      stat('⚔️', String(Math.round(stats.damage)), '공격력'),
      stat('⚡', `${stats.attacksPerSecond.toFixed(1)}/s`, '초당 공격'),
      stat('🎯', `${Math.round(stats.critChance * 100)}%`, '치명타 확률'),
      stat('➶', `×${stats.arrowsPerVolley}`, '한 번에 쏘는 화살'),
    );
    this.skills.replaceChildren(
      ...skills.map((s) => {
        const level =
          s.maxStacks <= MAX_PIPS
            ? h('span', { className: 'skill__pips' }, ...Array.from({ length: s.maxStacks }, (_, i) => h('i', { className: i < s.stacks ? 'is-on' : '' })))
            : h('span', { className: 'skill__count' }, `×${s.stacks}`);
        return h(
          'li',
          { className: `skill${s.stacks >= s.maxStacks ? ' skill--max' : ''}`, attrs: { title: `${s.name} — ${s.description}` } },
          h('span', { className: 'skill__icon' }, s.icon),
          h('span', { className: 'skill__name' }, s.name),
          level,
        );
      }),
    );
  }

  toast(message: string, seconds = 1.6): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    this.toastTime = seconds;
  }

  flashHurt(): void {
    this.vignette.classList.add('is-visible');
    window.setTimeout(() => this.vignette.classList.remove('is-visible'), 150);
  }

  fade(to: 'black' | 'clear'): Promise<void> {
    this.fadeEl.classList.toggle('is-visible', to === 'black');
    return new Promise((resolve) => window.setTimeout(resolve, FADE_MS));
  }

  update(dt: number): void {
    if (this.toastTime <= 0) return;
    this.toastTime -= dt;
    if (this.toastTime <= 0) this.toastEl.classList.remove('is-visible');
  }
}

const stat = (icon: string, value: string, label: string) =>
  h('span', { className: 'stat', attrs: { title: label, 'aria-label': `${label} ${value}` } }, h('span', { className: 'stat__icon' }, icon), value);
