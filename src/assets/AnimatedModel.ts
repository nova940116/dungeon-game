import * as THREE from 'three';
import { assets } from './AssetLibrary';
import { MODELS, type ClipName, type ModelKey } from './AssetManifest';

interface OneShotOptions {
  fade?: number;
  timeScale?: number;
  /** Hold the last frame instead of returning to the loop (death). */
  hold?: boolean;
}

/**
 * Skinned model + animation state:
 * - a looping "base" clip that AI/gameplay sets every frame (idle / move / run…)
 * - one-shot clips (attack, hit, death) that play over it and then hand back.
 */
export class AnimatedModel {
  readonly root: THREE.Group;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private readonly materials: THREE.MeshStandardMaterial[];
  private readonly baseEmissive: number[];
  private current: THREE.AnimationAction | null = null;
  private loopName: ClipName = 'idle';
  private oneShot: THREE.AnimationAction | null = null;
  private holdOneShot = false;
  private flashColor: number | null = null;

  constructor(readonly key: ModelKey) {
    const instance = assets.instantiate(key);
    this.root = instance.root;
    this.materials = instance.materials;
    this.baseEmissive = this.materials.map((m) => m.emissive.getHex());
    this.mixer = new THREE.AnimationMixer(this.root);

    const map = (MODELS[key] as { clips?: Partial<Record<ClipName, string>> }).clips ?? {};
    for (const [logical, fileName] of Object.entries(map) as [ClipName, string][]) {
      const clip = instance.clips.find((c) => c.name === fileName || c.name.endsWith(`|${fileName}`));
      if (clip) this.actions.set(logical, this.mixer.clipAction(clip));
    }
    this.mixer.addEventListener('finished', this.onFinished);
    this.setLoop('idle', 0);
  }

  has(name: ClipName): boolean {
    return this.actions.has(name);
  }

  get isPlayingOneShot(): boolean {
    return this.oneShot !== null;
  }

  /** Sets the looping base animation. Cheap to call every frame. */
  setLoop(name: ClipName, fade = 0.18, timeScale = 1): void {
    const resolved = this.actions.has(name) ? name : this.actions.has('move') && name === 'run' ? 'move' : 'idle';
    this.loopName = resolved;
    const action = this.actions.get(resolved);
    if (!action) return;
    action.timeScale = timeScale;
    if (this.oneShot || this.current === action) return;
    this.crossFadeTo(action, fade, true);
  }

  playOnce(name: ClipName, { fade = 0.08, timeScale = 1, hold = false }: OneShotOptions = {}): boolean {
    const action = this.actions.get(name);
    if (!action) return false;
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    this.holdOneShot = hold;
    this.oneShot = action;
    this.crossFadeTo(action, fade, false);
    return true;
  }

  /** Clears one-shots / held poses (e.g. respawn after a death pose). */
  reset(): void {
    this.mixer.stopAllAction();
    this.oneShot = null;
    this.holdOneShot = false;
    this.current = null;
    this.setLoop('idle', 0);
  }

  /** Tints emissive (hit flash). `null` restores the original look. */
  setFlash(color: number | null): void {
    if (color === this.flashColor) return;
    this.flashColor = color;
    this.materials.forEach((m, i) => m.emissive.setHex(color ?? this.baseEmissive[i]));
  }

  /** Finds a node by its name in the source file (GLTFLoader strips characters like "." from names). */
  findObject(name: string): THREE.Object3D | undefined {
    return this.root.getObjectByName(name) ?? this.root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }

  dispose(): void {
    this.mixer.removeEventListener('finished', this.onFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    for (const m of this.materials) m.dispose();
    this.root.removeFromParent();
  }

  private crossFadeTo(next: THREE.AnimationAction, fade: number, loop: boolean): void {
    if (loop) {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.enabled = true;
    next.setEffectiveWeight(1);
    if (loop) next.reset();
    next.play();
    if (this.current && this.current !== next) this.current.crossFadeTo(next, fade, false);
    this.current = next;
  }

  private onFinished = (e: { action: THREE.AnimationAction }): void => {
    if (e.action !== this.oneShot) return;
    if (this.holdOneShot) return;
    this.oneShot = null;
    const loop = this.actions.get(this.loopName);
    if (loop) this.crossFadeTo(loop, 0.15, true);
  };
}
