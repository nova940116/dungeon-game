import { SETS, TIERS, type TagId } from '../data/augments';
import type { AugmentOffer } from '../systems/ProgressionSystem';
import { h, requireElement } from './dom';

type KeyHandler = (e: KeyboardEvent) => void;
export type UiSound = 'click' | 'select';

const isConfirmKey = (e: KeyboardEvent) => e.code === 'Enter' || e.code === 'Space';

/** Full-screen modal panels: title menu, level-up skill draft, game over. */
export class Screens {
  private keyHandler: KeyHandler | null = null;
  private soundHook: (kind: UiSound) => void = () => {};

  constructor(private readonly root: HTMLElement = requireElement('screen')) {
    window.addEventListener('keydown', (e) => this.keyHandler?.(e));
  }

  setSoundHook(hook: (kind: UiSound) => void): void {
    this.soundHook = hook;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('is-hidden');
  }

  showLoading(): void {
    const panel = h(
      'div',
      { className: 'panel' },
      h('h1', { className: 'panel__logo' }, '화살 던전'),
      h('div', { className: 'loading' }, h('i', { className: 'loading__fill', attrs: { id: 'loading-fill' } })),
      h('p', { attrs: { id: 'loading-text' } }, '에셋 불러오는 중… 0%'),
    );
    this.open(panel, () => {});
  }

  setLoadingProgress(ratio: number): void {
    const pct = Math.round(ratio * 100);
    const fill = document.getElementById('loading-fill');
    const text = document.getElementById('loading-text');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `에셋 불러오는 중… ${pct}%`;
  }

  showError(message: string): void {
    this.open(h('div', { className: 'panel' }, h('h2', { className: 'panel__title' }, '앗!'), h('p', {}, message)), () => {});
  }

  showMenu(opts: { best: number; onStart: () => void }): void {
    const start = this.withSound('click', opts.onStart);
    const panel = h(
      'div',
      { className: 'panel' },
      h('h1', { className: 'panel__logo' }, '화살 던전'),
      h('p', {}, '멈춰 서면 가장 가까운 적에게 ', h('b', {}, '자동으로 활을 쏩니다.'), h('br'), '움직이는 동안에는 공격하지 않아요 — 피하고, 멈추고, 쏘세요!'),
      h('p', {}, '이동: ', kbd('WASD'), ' / ', kbd('방향키'), ' · 모바일은 화면을 드래그'),
      h('p', {}, '방을 정리하면 위쪽 문이 열립니다. 레벨 업마다 증강을 고르고, 보스를 잡으면 희귀·전설 증강 보상!'),
      opts.best > 0 && h('p', {}, `최고 기록: 방 ${opts.best}`),
      h('button', { className: 'btn', onClick: start }, '시작하기'),
    );
    this.open(panel, (e) => isConfirmKey(e) && start());
  }

  /** Level-up / boss-reward draft: three augment cards, each can be rerolled while rerolls last. */
  showAugmentPick(opts: {
    title: string;
    offers: AugmentOffer[];
    rerolls: number;
    setInfo: (tag: TagId) => { have: number; need: number };
    onReroll: (offers: AugmentOffer[], index: number) => { offers: AugmentOffer[]; rerolls: number } | null;
    onPick: (offer: AugmentOffer) => void;
  }): void {
    let { offers, rerolls } = opts;
    let picked = false;
    const pick = (offer: AugmentOffer) => {
      if (picked) return;
      picked = true;
      this.soundHook('select');
      opts.onPick(offer);
    };
    const reroll = (index: number) => {
      const next = opts.onReroll(offers, index);
      if (!next) return;
      this.soundHook('click');
      ({ offers, rerolls } = next);
      render(index);
    };

    const card = (offer: AugmentOffer, index: number, fresh: boolean) => {
      const a = offer.augment;
      const tags = a.tags.map((tag) => {
        const set = SETS[tag];
        const { have, need } = opts.setInfo(tag);
        const owned = offer.stacks > 0;
        const after = owned ? have : have + 1;
        const completes = !owned && have < need && after >= need;
        return h(
          'span',
          { className: `tag${completes ? ' tag--complete' : ''}`, attrs: { title: `${set.name} ${need}개: ${set.bonus}` } },
          `${set.icon} ${set.name} ${Math.min(after, need)}/${need}`,
          completes && ' 시너지!',
        );
      });
      return h(
        'div',
        { className: 'card-slot' },
        h(
          'button',
          { className: `card card--${a.tier}${fresh ? ' is-fresh' : ''}`, onClick: () => pick(offer), attrs: { 'aria-label': `${index + 1}번: ${TIERS[a.tier].label} ${a.name}. ${a.description}` } },
          h('span', { className: 'card__tier' }, TIERS[a.tier].label),
          h('div', { className: 'card__icon' }, a.icon),
          h('b', { className: 'card__name' }, a.name),
          h('small', { className: 'card__desc' }, a.description),
          tags.length > 0 && h('div', { className: 'card__tags' }, ...tags),
          offer.stacks > 0 && h('em', { className: 'card__stacks' }, `보유 ${offer.stacks}${a.maxStacks < 99 ? ` / ${a.maxStacks}` : ''}`),
        ),
        h('button', { className: 'reroll', onClick: () => reroll(index), attrs: rerolls > 0 ? {} : { disabled: '' } }, `↻ 다시 뽑기`),
      );
    };

    const render = (freshIndex = -1) => {
      const panel = h(
        'div',
        { className: 'panel panel--draft' },
        h('h2', { className: 'panel__title' }, opts.title),
        h('p', {}, '증강을 하나 고르세요 ', kbd('1'), ' ', kbd('2'), ' ', kbd('3'), h('span', { className: 'rerolls' }, ` · 다시 뽑기 ${rerolls}회`)),
        h('div', { className: 'cards' }, ...offers.map((o, i) => card(o, i, i === freshIndex))),
      );
      this.open(panel, (e) => {
        const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code);
        if (index >= 0 && offers[index]) pick(offers[index]);
      });
    };
    render();
  }

  showGameOver(opts: { roomNo: number; level: number; best: number; onRestart: () => void }): void {
    const restart = this.withSound('click', opts.onRestart);
    const panel = h(
      'div',
      { className: 'panel' },
      h('h2', { className: 'panel__title' }, '쓰러졌다…'),
      h('p', {}, '도달한 방: ', h('b', {}, opts.roomNo), ` · 레벨 ${opts.level}`, h('br'), `최고 기록: 방 ${opts.best}`),
      h('button', { className: 'btn', onClick: restart }, '다시 하기'),
    );
    this.open(panel, (e) => isConfirmKey(e) && restart());
  }

  showPause(opts: { roomNo: number; level: number; onResume: () => void; onRestart: () => void; onQuit: () => void }): void {
    const resume = this.withSound('click', opts.onResume);
    // Restart / quit throw away the run, so they ask for a second press.
    const confirmButton = (label: string, confirmLabel: string, action: () => void) => {
      let armed = false;
      const button = h('button', {
        className: 'btn btn--ghost',
        onClick: () => {
          this.soundHook('click');
          if (armed) return action();
          armed = true;
          button.textContent = confirmLabel;
          button.classList.add('is-armed');
        },
      }, label);
      return button;
    };
    const panel = h(
      'div',
      { className: 'panel' },
      h('h2', { className: 'panel__title' }, '일시정지'),
      h('p', {}, '방 ', h('b', {}, opts.roomNo), ` · 레벨 ${opts.level}`),
      h(
        'div',
        { className: 'panel__actions' },
        h('button', { className: 'btn', onClick: resume }, '계속하기'),
        confirmButton('처음부터 다시', '한 번 더 누르면 다시 시작', opts.onRestart),
        confirmButton('메인 메뉴', '한 번 더 누르면 메뉴로', opts.onQuit),
      ),
      h('p', { className: 'panel__hint' }, kbd('Esc'), ' / ', kbd('P'), ' 계속하기 · ', kbd('M'), ' 소리'),
    );
    this.open(panel, (e) => isConfirmKey(e) && resume());
  }

  hide(): void {
    this.root.classList.add('is-hidden');
    this.root.replaceChildren();
    this.keyHandler = null;
  }

  private withSound(kind: UiSound, action: () => void): () => void {
    return () => {
      this.soundHook(kind);
      action();
    };
  }

  private open(panel: HTMLElement, keyHandler: KeyHandler): void {
    this.root.replaceChildren(panel);
    this.root.classList.remove('is-hidden');
    this.keyHandler = keyHandler;
  }
}

const kbd = (label: string) => h('kbd', { className: 'kbd' }, label);
