import { BALANCE, STORAGE_KEYS } from '../config';
import { assets } from '../assets/AssetLibrary';
import { AudioManager } from '../audio/AudioManager';
import { CameraRig } from '../engine/CameraRig';
import { Engine } from '../engine/Engine';
import { EventBus } from '../engine/EventBus';
import { Input } from '../engine/Input';
import { Player } from '../entities/Player';
import { AudioSystem } from '../systems/AudioSystem';
import { CombatSystem } from '../systems/CombatSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { EnemySystem } from '../systems/EnemySystem';
import { PickupSystem } from '../systems/PickupSystem';
import { ProgressionSystem, type SkillOffer } from '../systems/ProgressionSystem';
import { WeaponSystem } from '../systems/WeaponSystem';
import { DamageNumbers } from '../ui/DamageNumbers';
import { Hud } from '../ui/Hud';
import { Screens } from '../ui/Screens';
import { storage } from '../utils/storage';
import { Room } from '../world/Room';
import { generateWave } from '../world/RoomGenerator';
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
  private readonly audioSystem: AudioSystem;

  private readonly progression = new ProgressionSystem(this.events);
  private readonly weapons = new WeaponSystem();
  private readonly enemySystem = new EnemySystem();
  private readonly combat = new CombatSystem();
  private readonly pickups = new PickupSystem();

  private readonly hud = new Hud();
  private readonly screens = new Screens();
  private readonly damageNumbers = new DamageNumbers();

  // Created after assets are loaded.
  private player!: Player;
  private world!: World;

  private state: GameState = 'loading';
  private footstepTimer = 0;

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    this.input = new Input(this.engine.canvas);
    this.cameraRig = new CameraRig(this.engine.camera, this.engine.fog);
    this.effects = new EffectsSystem(this.engine.scene);
    this.audioSystem = new AudioSystem(this.audio, this.events);
    this.screens.setSoundHook((kind) => this.audio.play(kind === 'select' ? 'ui_select' : 'ui_click'));
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
    if (this.state === 'playing') this.tickGameplay(dt, elapsed);

    const cameraRotation = this.engine.camera.quaternion;
    this.player.update(dt, cameraRotation);
    this.enemySystem.syncVisuals(dt, this.world, cameraRotation);
    if (this.state !== 'playing') this.world.collectGarbage();
    this.effects.update(dt);
    this.world.room.update(dt, elapsed);
    this.cameraRig.update(dt, this.player.z);
    this.damageNumbers.update(dt, this.engine.camera);
    this.hud.update(dt);
    this.audioSystem.update(dt);
  }

  private tickGameplay(dt: number, elapsed: number): void {
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
    this.pickups.update(dt, elapsed, world, this.progression);
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
    this.engine.setAtmosphere(room.theme.sky);
    this.engine.applyLighting(room.theme.light);
    player.placeAt(room.entrance);
    this.weapons.reset();
    this.cameraRig.snapTo(player.z);
    this.hud.setRoom(roomNo);

    if (!spawnWave) return;
    this.events.emit('room:entered', { roomNo, isBoss: room.isBoss });
    for (const spawn of generateWave(roomNo, room.isBoss, room.obstacles)) world.spawnEnemy(spawn.type, spawn.x, spawn.z);
    const firstOfChapter = roomNo % BALANCE.bossEvery === 1;
    this.hud.toast(room.isBoss ? '⚠ 보스 방 ⚠' : firstOfChapter ? room.theme.name : `방 ${roomNo}`);
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
    if (room.isBoss) this.world.healPlayer(this.player.maxHp * BALANCE.bossClearHealRatio);
  }

  private openSkillPick(): void {
    this.state = 'skillPick';
    this.input.reset();
    this.screens.showSkillPick(this.progression.rollOffers(this.player), (offer) => this.chooseSkill(offer));
  }

  private chooseSkill(offer: SkillOffer): void {
    this.progression.choose(offer.skill, this.player);
    this.screens.hide();
    this.refreshHealth();
    this.refreshBuild();
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

    events.on('enemy:damaged', ({ enemy, amount, critical }) =>
      this.damageNumbers.spawn(enemy.x, enemy.centerY + 0.4, enemy.z, critical ? `${amount}!` : `${amount}`, critical ? 'crit' : 'normal'),
    );
    events.on('enemy:killed', ({ enemy }) => enemy.isBoss && this.cameraRig.shake(0.6));
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
    events.on('boss:enraged', () => this.hud.toast('보스가 분노했다!'));
    events.on('camera:shake', ({ intensity }) => this.cameraRig.shake(intensity));
    events.on('xp:changed', ({ xp, needed, level }) => this.hud.setXp(xp / needed, level));
    events.on('level:up', ({ level }) => {
      this.hud.toast(`레벨 업! Lv ${level}`);
      this.effects.levelUp(player.x, player.z);
    });
  }

  private refreshHealth(): void {
    this.hud.setHealth(this.player.hp, this.player.maxHp);
  }

  private refreshBuild(): void {
    const s = this.player.stats;
    const arrowsPerVolley = s.frontArrows + s.diagonalPairs * 2 + (s.sideArrows ? 2 : 0) + (s.backArrow ? 1 : 0);
    this.hud.setBuild(
      { damage: s.damage, attacksPerSecond: s.volleys / s.attackInterval, critChance: s.critChance, arrowsPerVolley },
      this.progression.owned().map(({ skill, stacks }) => ({ ...skill, stacks })),
    );
  }

  private get bestRoom(): number {
    return storage.getNumber(STORAGE_KEYS.bestRoom);
  }
}
