import { clamp, shieldedRatios } from '../utils/math';
import { h, requireElement } from './dom';

const FADE_MS = 280;
/** Skills with at most this many stacks show pips (●●○); others show a ×N count. */
const MAX_PIPS = 5;
/** Above this many owned augments the HUD list collapses to icons. */
const COMPACT_AFTER = 6;

export interface SkillBadge {
  icon: string;
  name: string;
  description: string;
  stacks: number;
  maxStacks: number;
  /** Rarity ('silver' | 'gold' | 'prism'): colours the badge. */
  tier?: string;
}

export interface SetBadge {
  icon: string;
  name: string;
  bonus: string;
  have: number;
  need: number;
  active: boolean;
}

export interface BossBanner {
  title: string;
  name: string;
  stage: boolean;
  /** Signature colour: tints the HP bar and intro banner. */
  color?: number;
  /** HP ratios marked on the bar (phase thresholds). */
  phaseAt: readonly number[];
}

export interface StatSummary {
  damage: number;
  attacksPerSecond: number;
  critChance: number;
  arrowsPerVolley: number;
  /** Melee fighters show their blade reach instead of arrows per volley. */
  reach?: number;
}

/** Top bar (room, HP, level, XP), toast messages, hurt vignette and screen fades. */
export class Hud {
  private readonly room = requireElement('hud-room');
  private readonly hpFill = requireElement('hud-hp-fill');
  private readonly hpText = requireElement('hud-hp-text');
  private readonly shieldFill = requireElement('hud-shield-fill');
  private readonly level = requireElement('hud-level');
  private readonly xpFill = requireElement('hud-xp-fill');
  private readonly toastEl = requireElement('toast');
  private readonly vignette = requireElement('hurt-vignette');
  private readonly fadeEl = requireElement('fade');
  private readonly soundButton = requireElement<HTMLButtonElement>('hud-sound');
  private readonly pauseButton = requireElement<HTMLButtonElement>('hud-pause');
  private readonly stats = requireElement('hud-stats');
  private readonly skills = requireElement('hud-skills');
  private readonly bossBar = requireElement('boss-bar');
  private readonly bossTitle = requireElement('boss-bar-title');
  private readonly bossName = requireElement('boss-bar-name');
  private readonly bossFill = requireElement('boss-bar-fill');
  private readonly bossGhost = requireElement('boss-bar-ghost');
  private readonly bossMarks = requireElement('boss-bar-marks');
  private readonly bossIntro = requireElement('boss-intro');
  private readonly dread = requireElement('dread-vignette');
  private toastTime = 0;
  private healthKey = '';
  private introTime = 0;

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

  /** Cheap to call every frame: only touches the DOM when something changed. */
  setHealth(hp: number, max: number, shield = 0): void {
    const key = `${Math.ceil(hp)}|${Math.round(max)}|${Math.ceil(shield)}`;
    if (key === this.healthKey) return;
    this.healthKey = key;
    const { hp: hpRatio, shield: shieldRatio } = shieldedRatios(hp, max, shield);
    this.hpFill.style.width = `${hpRatio * 100}%`;
    this.shieldFill.style.left = `${hpRatio * 100}%`;
    this.shieldFill.style.width = `${shieldRatio * 100}%`;
    this.hpText.textContent = `${Math.ceil(hp)} / ${Math.round(max)}${shield > 0 ? `  +${Math.ceil(shield)}` : ''}`;
  }

  setXp(ratio: number, level: number): void {
    this.xpFill.style.width = `${clamp(ratio, 0, 1) * 100}%`;
    this.level.textContent = `Lv ${level}`;
  }

  /** Current build: key attack stats + every owned skill with its stack level. */
  setBuild(stats: StatSummary, skills: SkillBadge[], sets: SetBadge[] = []): void {
    this.stats.replaceChildren(
      stat('⚔️', String(Math.round(stats.damage)), '공격력'),
      stat('⚡', `${stats.attacksPerSecond.toFixed(1)}/s`, '초당 공격'),
      stat('🎯', `${Math.round(stats.critChance * 100)}%`, '치명타 확률'),
      stats.reach !== undefined ? stat('📏', stats.reach.toFixed(1), '공격 사거리') : stat('➶', `×${stats.arrowsPerVolley}`, '한 번에 쏘는 화살'),
      ...sets.map((s) =>
        h(
          'span',
          { className: `stat stat--set${s.active ? ' is-active' : ''}`, attrs: { title: `${s.name} 시너지 (${s.have}/${s.need}) — ${s.bonus}` } },
          h('span', { className: 'stat__icon' }, s.icon),
          s.active ? '✓' : `${s.have}/${s.need}`,
        ),
      ),
    );
    // Many augments: switch from named rows to a compact icon grid (names stay in the tooltip).
    this.skills.classList.toggle('build__skills--compact', skills.length > COMPACT_AFTER);
    this.skills.replaceChildren(
      ...skills.map((s) => {
        const level =
          s.maxStacks <= MAX_PIPS
            ? h('span', { className: 'skill__pips' }, ...Array.from({ length: s.maxStacks }, (_, i) => h('i', { className: i < s.stacks ? 'is-on' : '' })))
            : h('span', { className: 'skill__count' }, `×${s.stacks}`);
        return h(
          'li',
          { className: `skill skill--${s.tier ?? 'silver'}${s.stacks >= s.maxStacks ? ' skill--max' : ''}`, attrs: { title: `${s.name} — ${s.description}` } },
          h('span', { className: 'skill__icon' }, s.icon),
          h('span', { className: 'skill__name' }, s.name),
          level,
          s.stacks > 1 && h('span', { className: 'skill__badge' }, s.stacks),
        );
      }),
    );
  }

  toast(message: string, seconds = 1.6): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('is-visible');
    this.toastTime = seconds;
  }

  /** Boss fight UI: intro banner, the big HP bar with phase marks and (for stage bosses) a dread vignette. */
  showBoss(boss: BossBanner): void {
    this.bossTitle.textContent = boss.title;
    this.bossName.textContent = boss.name;
    this.bossMarks.replaceChildren(...boss.phaseAt.map((ratio) => h('i', { attrs: { style: `left:${ratio * 100}%` } })));
    this.bossBar.classList.toggle('boss-bar--stage', boss.stage);
    for (const el of [this.bossBar, this.bossIntro]) {
      if (boss.color === undefined) {
        el.style.removeProperty('--boss');
        el.style.removeProperty('--boss-deep');
      } else {
        el.style.setProperty('--boss', hex(boss.color));
        el.style.setProperty('--boss-deep', hex(boss.color, 0.45));
      }
    }
    this.bossBar.classList.add('is-visible');
    this.setBossHealth(1);

    this.bossIntro.replaceChildren(h('span', { className: 'boss-intro__title' }, `⚠ ${boss.title} ⚠`), h('strong', { className: 'boss-intro__name' }, boss.name));
    this.bossIntro.classList.toggle('boss-intro--stage', boss.stage);
    this.bossIntro.classList.add('is-visible');
    this.introTime = boss.stage ? 2.6 : 2.1;
    this.dread.classList.toggle('is-visible', boss.stage);
  }

  setBossHealth(ratio: number): void {
    const width = `${clamp(ratio, 0, 1) * 100}%`;
    this.bossFill.style.width = width;
    this.bossGhost.style.width = width; // trails behind via a slower CSS transition
  }

  hideBoss(): void {
    this.bossBar.classList.remove('is-visible');
    this.bossIntro.classList.remove('is-visible');
    this.dread.classList.remove('is-visible');
    this.introTime = 0;
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
    if (this.introTime > 0) {
      this.introTime -= dt;
      if (this.introTime <= 0) this.bossIntro.classList.remove('is-visible');
    }
    if (this.toastTime <= 0) return;
    this.toastTime -= dt;
    if (this.toastTime <= 0) this.toastEl.classList.remove('is-visible');
  }
}

const stat = (icon: string, value: string, label: string) =>
  h('span', { className: 'stat', attrs: { title: label, 'aria-label': `${label} ${value}` } }, h('span', { className: 'stat__icon' }, icon), value);

/** CSS colour from a hex number, optionally darkened (0…1 brightness). */
const hex = (color: number, k = 1) => {
  const c = (shift: number) => Math.round(((color >> shift) & 255) * k);
  return `rgb(${c(16)}, ${c(8)}, ${c(0)})`;
};
