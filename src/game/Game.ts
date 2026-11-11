import { BALANCE, STORAGE_KEYS } from '../config';
import { assets } from '../assets/AssetLibrary';
import { AudioManager } from '../audio/AudioManager';
import { CameraRig } from '../engine/CameraRig';
import { Engine } from '../engine/Engine';
import { EventBus } from '../engine/EventBus';
import { Input } from '../engine/Input';
import { SETS, TIERS } from '../data/augments';
import { moodForRoom } from '../data/themes';
import type { BossEnemy } from '../entities/enemies/BossEnemy';
import { Player } from '../entities/Player';
import { AudioSystem } from '../systems/AudioSystem';
import { AugmentSystem } from '../systems/AugmentSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { HazardSystem } from '../systems/HazardSystem';
import { StatusSystem } from '../systems/HitEffects';
import { ProgressionSystem, type AugmentOffer } from '../systems/ProgressionSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { DamageNumbers } from '../ui/DamageNumbers';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { storage } from '../utils/storage';
import { Room } from '../world/Room';
import { generateWave } from '../world/RoomGenerator';
import type { Enemy } from '../entities/Enemy';
import type { GameEvents } from './events';
import { World } from './World';

export type GameState = 'loading' | 'menu' | 'skillPick' | 'playing' | 'paused' | 'transition' | 'gameOver';

const FOOTSTEP_INTERVAL = 0.22;

/**
 * Composition root and state machine. Wires engine, systems and UI together
 * and decides which systems run in each state.
 */
export class Game {
  private readonly engine: Engine;
  private readonly input: Input;
  private readonly cameraRig: CameraRig;
  private readonly events = new EventBus<GameEvents>();
  private readonly effects: EffectsSystem;
  private readonly audio = new AudioManager();

  private readonly progression = new ProgressionSystem(this.events);
  private readonly weapons = new WeaponSystem();
  private readonly enemySystem = new EnemySystem();
  private readonly combat = new CombatSystem();
  private readonly hazards = new HazardSystem();
  private readonly statuses = new StatusSystem();
  private readonly augments: AugmentSystem;

  private readonly hud = new Hud();
  private readonly screens = new Screens();
  private readonly damageNumbers = new DamageNumbers();

  // Created after assets are loaded.
  private player!: Player;
  private world!: World;

  private state: GameState = 'loading';
  private footstepTimer = 0;
  /** The boss currently being fought (drives the HUD boss bar). */
  private boss: Enemy | null = null;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.canvas);
    this.cameraRig = new CameraRig(this.engine.camera, this.engine.fog);
    this.effects = new EffectsSystem(this.engine.scene);
    this.augments = new AugmentSystem(this.engine.scene);
    new AudioSystem(this.audio, this.events); // subscribes to game events; no per-frame work
    this.hud.bindSoundToggle(this.audio.isMuted, () => this.audio.toggleMute());
    this.hud.bindPause(() => this.pause());
    this.bindPauseTriggers();
  }

  get currentState(): GameState {
    return this.state;
  }

  async start(): Promise<void> {
    this.screens.showLoading();
    try {
      // Models/textures dominate download size, so they weigh most in the progress bar.
      let assetProgress = 0;
      let audioProgress = 0;
      const report = () => this.screens.setLoadingProgress(assetProgress * 0.85 + audioProgress * 0.15);
      await Promise.all([
        assets.loadAll(this.engine.renderer, (p) => ((assetProgress = p), report())),
        this.audio.load((p) => ((audioProgress = p), report())),
      ]);
    } catch (err) {
      this.screens.showError('에셋을 불러오지 못했어요. 새로고침 해주세요.');
      throw err;
    }
    this.engine.setEnvironment(assets.environment);
    this.player = new Player();
    this.world = new World(this.engine.scene, this.player, this.events, this.effects);
    this.bindEvents();

    this.loadRoom(1, false); // backdrop behind the title screen
    this.showMenu();
    this.engine.start((dt, elapsed) => this.update(dt, elapsed));
  }

  // ---------------------------------------------------------------- loop

  private update(dt: number, elapsed: number): void {
    this.hud.setPauseAvailable(this.state === 'playing');
    if (this.state === 'paused') return; // world frozen; the engine keeps rendering the last pose
    if (this.state === 'playing') this.tickGameplay(dt);

    const cameraRotation = this.engine.camera.quaternion;
    this.player.update(dt, cameraRotation);
    this.enemySystem.syncVisuals(dt, this.world, cameraRotation);
    this.augments.updateVisuals(dt, this.world);
    if (this.state !== 'playing') this.world.collectGarbage();
    this.effects.update(dt);
    this.world.room.update(dt, elapsed);
    this.cameraRig.update(dt, this.player.z);
    this.damageNumbers.update(dt, this.engine.camera);
    if (this.boss) this.hud.setBossHealth(this.boss.hp / this.boss.maxHp);
    this.refreshHealth(); // shields and regen change HP outside of events
    this.hud.update(dt);
  }

  private tickGameplay(dt: number): void {
    const { world, player } = this;
    const moving = player.move(dt, this.input.moveVector, world.room);
    if (world.room.hasExited(player)) {
      void this.advanceRoom();
      return;
    }
    this.spawnFootsteps(dt, moving);

    this.weapons.update(dt, world, moving);
    this.enemySystem.update(dt, world);
    this.combat.update(dt, world);
    this.hazards.update(dt, world);
    this.statuses.update(dt, world);
    this.augments.update(dt, world);
    world.collectGarbage();

    if (this.state !== 'playing') return; // player died this frame
    if (!world.room.cleared && !world.hasLivingEnemies) this.onRoomCleared();
    if (this.progression.pendingLevelUps > 0) this.openSkillPick();
  }

  private spawnFootsteps(dt: number, moving: boolean): void {
    if (!moving) return;
    this.footstepTimer -= dt;
    if (this.footstepTimer > 0) return;
    this.footstepTimer = FOOTSTEP_INTERVAL;
    this.effects.dust(this.player.x, this.player.z);
  }

  // ---------------------------------------------------------------- flow

  private showMenu(): void {
    this.state = 'menu';
    this.screens.showMenu({ best: this.bestRoom, onStart: () => this.startRun() });
  }

  // ---------------------------------------------------------------- pause

  /** Esc / P toggle; leaving the tab or window pauses automatically. */
  private bindPauseTriggers(): void {
    window.addEventListener('keydown', (e) => {
      if (e.repeat || (e.code !== 'Escape' && e.code !== 'KeyP')) return;
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
    document.addEventListener('visibilitychange', () => document.hidden && this.pause());
    window.addEventListener('blur', () => this.pause());
  }

  pause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.reset();
    this.screens.showPause({
      roomNo: this.world.roomNo,
      level: this.progression.level,
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onQuit: () => this.quitToMenu(),
    });
  }

  resume(): void {
    if (this.state !== 'paused') return;
    this.screens.hide();
    this.input.reset();
    this.state = 'playing';
  }

  private quitToMenu(): void {
    this.screens.hide();
    this.damageNumbers.clear();
    this.effects.clear();
    this.player.reset();
    this.progression.reset();
    this.augments.reset();
    this.refreshBuild();
    this.refreshHealth();
    this.loadRoom(1, false);
    this.showMenu();
  }

  private startRun(): void {
    this.screens.hide();
    this.damageNumbers.clear();
    this.effects.clear();
    this.player.reset();
    this.progression.reset();
    this.augments.reset();
    this.refreshBuild();
    this.loadRoom(1, true);
    this.refreshHealth();
    this.state = 'playing';
  }

  private loadRoom(roomNo: number, spawnWave: boolean): void {
    const { world, player } = this;
    world.clearDynamic();
    world.roomNo = roomNo;
    const room = new Room(roomNo);
    world.setRoom(room);
    const mood = moodForRoom(roomNo);
    this.engine.setAtmosphere(mood.sky);
    this.engine.applyLighting(mood.light);
    this.endBossFight();
    player.placeAt(room.entrance);
    this.weapons.reset();
    this.cameraRig.snapTo(player.z);
    this.hud.setRoom(roomNo);

    if (!spawnWave) return;
    player.shield = Math.max(player.shield, player.stats.shieldPerRoom);
    this.refreshHealth();
    this.events.emit('room:entered', { roomNo, isBoss: room.isBoss });
    for (const spawn of generateWave(roomNo, room.isBoss, room.obstacles)) world.spawnEnemy(spawn.type, spawn.x, spawn.z);
    const firstOfChapter = roomNo % BALANCE.bossEvery === 1;
    if (!room.isBoss) this.hud.toast(firstOfChapter ? room.theme.name : `방 ${roomNo}`); // bosses announce themselves
  }

  private async advanceRoom(): Promise<void> {
    this.state = 'transition';
    this.input.reset();
    await this.hud.fade('black');
    this.effects.clear();
    this.loadRoom(this.world.roomNo + 1, true);
    await this.hud.fade('clear');
    this.state = 'playing';
  }

  private onRoomCleared(): void {
    const room = this.world.room;
    room.cleared = true;
    room.openDoor();
    this.events.emit('room:cleared', { roomNo: room.roomNo, isBoss: room.isBoss });
    this.hud.toast('방 클리어! ↑ 위로 이동');
    const heal = (room.isBoss ? BALANCE.bossClearHealRatio : 0) + this.player.stats.roomClearHeal;
    if (heal > 0) this.world.healPlayer(this.player.maxHp * heal);
    if (room.isBoss) {
      // Boss reward: an extra draft of rarer augments (+1 reroll).
      const stage = room.roomNo % BALANCE.stageBossEvery === 0;
      this.progression.grantReward(stage ? 'prism' : 'gold');
      this.hud.toast(stage ? '💎 전설 증강 보상!' : '✨ 희귀 증강 보상!', 2);
    }
  }

  private beginBossFight(boss: Enemy): void {
    const info = boss.def.bossInfo;
    if (!info) return;
    this.boss = boss;
    this.hud.showBoss(info);
    this.cameraRig.shake(info.stage ? 0.5 : 0.3);
  }

  private endBossFight(): void {
    this.boss = null;
    this.hud.hideBoss();
  }

  private openSkillPick(): void {
    this.state = 'skillPick';
    this.input.reset();
    const p = this.progression;
    const reward = p.nextPick?.reward ? p.nextPick.minTier : null;
    this.screens.showAugmentPick({
      title: reward ? (reward === 'prism' ? '💎 보스 보상 — 전설' : '✨ 보스 보상 — 희귀') : '레벨 업! ✨',
      offers: p.rollOffers(this.player),
      rerolls: p.rerolls,
      setInfo: (tag) => ({ have: p.tagCount(tag), need: SETS[tag].need }),
      onReroll: (offers, index) => {
        const next = p.reroll(this.player, offers, index);
        return next && { offers: next, rerolls: p.rerolls };
      },
      onPick: (offer) => this.chooseAugment(offer),
    });
  }

  private chooseAugment(offer: AugmentOffer): void {
    const granted = this.progression.choose(offer.augment, this.player);
    this.player.shield = Math.max(this.player.shield, this.player.stats.shieldPerRoom);
    this.screens.hide();
    this.refreshHealth();
    this.refreshBuild();
    if (granted.length) this.hud.toast(`🎲 ${granted.join(' · ')}`, 2.4);
    else if (offer.augment.tier !== 'silver') this.hud.toast(`${TIERS[offer.augment.tier].label}: ${offer.augment.name}`, 1.4);
    this.state = 'playing';
  }

  private gameOver(): void {
    if (this.state === 'gameOver') return;
    this.state = 'gameOver';
    const best = Math.max(this.bestRoom, this.world.roomNo);
    storage.setNumber(STORAGE_KEYS.bestRoom, best);
    window.setTimeout(() => {
      this.screens.showGameOver({
        roomNo: this.world.roomNo,
        level: this.progression.level,
        best,
        onRestart: () => this.startRun(),
      });
    }, 1400);
  }

  // ---------------------------------------------------------------- events → feedback

  private bindEvents(): void {
    const { events, player } = this;

    events.on('enemy:damaged', ({ enemy, amount, critical, kind }) => {
      const y = enemy.centerY + 0.4;
      if (kind === 'execute') return this.damageNumbers.spawn(enemy.x, y + 0.4, enemy.z, '처형!', 'crit');
      if (kind === 'arrow') return this.damageNumbers.spawn(enemy.x, y, enemy.z, critical ? `${amount}!` : `${amount}`, critical ? 'crit' : 'normal');
      this.damageNumbers.spawn(enemy.x, y - 0.3, enemy.z, `${amount}`, kind === 'dot' ? 'dot' : 'minor');
    });
    events.on('player:dodged', () => this.damageNumbers.spawn(player.x, 2, player.z, '회피', 'dodge'));
    events.on('player:revived', () => {
      this.hud.toast('🕊️ 불사조의 힘으로 부활!', 2.2);
      this.cameraRig.shake(0.4);
      this.refreshHealth();
    });
    events.on('augment:set', ({ tag }) => {
      const set = SETS[tag];
      this.hud.toast(`${set.icon} ${set.name} 시너지 발동! ${set.bonus}`, 2.8);
      this.refreshBuild();
    });
    events.on('enemy:spawned', ({ enemy }) => enemy.isBoss && this.beginBossFight(enemy));
    events.on('enemy:killed', ({ enemy }) => {
      // XP goes straight to the player on kill (no gems to pick up).
      this.progression.addXp(enemy.def.xp * player.stats.xpMul);
      this.effects.collect(player.x, 1.3, player.z);
      if (!enemy.isBoss) return;
      this.cameraRig.shake(0.7);
      if (enemy === this.boss) this.endBossFight();
    });
    events.on('player:damaged', ({ amount }) => {
      this.damageNumbers.spawn(player.x, 1.9, player.z, `-${amount}`, 'hurt');
      this.hud.flashHurt();
      this.cameraRig.shake(0.25);
      this.refreshHealth();
    });
    events.on('player:healed', ({ amount, silent }) => {
      if (!silent) {
        this.damageNumbers.spawn(player.x, 1.9, player.z, `+${Math.round(amount)}`, 'heal');
        this.effects.heal(player.x, player.z);
      }
      this.refreshHealth();
    });
    events.on('player:died', () => this.gameOver());
    events.on('boss:phase', ({ enemy, phase }) => {
      const info = (enemy as BossEnemy).info;
      this.hud.toast(info.phaseToasts[phase - 1] ?? `${info.name}이(가) 분노했다!`, 2.2);
      this.hud.flashHurt();
    });
    events.on('boss:shield', ({ on }) =>
      this.hud.toast(on ? '💀 소환수들이 망자의 군주를 지킨다! (받는 피해 -75%)' : '🦴 뼈 보호막이 깨졌다!', on ? 2.4 : 1.6),
    );
    events.on('hazard:exploded', () => this.cameraRig.shake(0.12));
    events.on('camera:shake', ({ intensity }) => this.cameraRig.shake(intensity));
    events.on('xp:changed', ({ xp, needed, level }) => this.hud.setXp(xp / needed, level));
    events.on('level:up', ({ level }) => {
      this.hud.toast(`레벨 업! Lv ${level}`);
      this.effects.levelUp(player.x, player.z);
    });
  }

  private refreshHealth(): void {
    this.hud.setHealth(this.player.hp, this.player.maxHp, this.player.shield);
  }

  private refreshBuild(): void {
    const s = this.player.stats;
    const arrowsPerVolley = s.frontArrows + s.diagonalPairs * 2 + (s.sideArrows ? 2 : 0) + (s.backArrow ? 1 : 0);
    this.hud.setBuild(
      { damage: s.damage, attacksPerSecond: s.volleys / s.attackInterval, critChance: s.critChance, arrowsPerVolley },
      this.progression.owned().map(({ augment, stacks }) => ({ ...augment, stacks })),
      this.progression.sets().map((p) => ({ ...p, icon: SETS[p.tag].icon, name: SETS[p.tag].name, bonus: SETS[p.tag].bonus })),
    );
  }

  private get bestRoom(): number {
    return storage.getNumber(STORAGE_KEYS.bestRoom);
  }
}
