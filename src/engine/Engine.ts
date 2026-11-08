import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CAMERA, ENGINE } from '../config';
import type { ThemeLighting } from '../data/themes';

export type UpdateFn = (dt: number, elapsed: number) => void;

/**
 * Owns the renderer, post-processing, scene, camera, lights and the frame loop.
 * Knows nothing about gameplay: the game plugs in through `start(update)`.
 */
export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly fog = new THREE.Fog(0x000000, 30, 70);

  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private readonly timer = new THREE.Timer();
  private update: UpdateFn = () => {};

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ENGINE.maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 200);
    this.scene.fog = this.fog;
    this.setupLights();

    // Render → bloom (HDR, only values above the threshold glow) → tone map + sRGB.
    this.composer = new EffectComposer(this.renderer);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), ENGINE.bloom.strength, ENGINE.bloom.radius, ENGINE.bloom.threshold);
    this.bloom.enabled = ENGINE.bloom.enabled;
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', this.onResize);
  }

  get canvas(): HTMLCanvasElement {
    return this.renderer.domElement;
  }

  setAtmosphere(color: number): void {
    this.scene.background = new THREE.Color(color);
    this.fog.color.setHex(color);
  }

  setEnvironment(envMap: THREE.Texture | null): void {
    this.scene.environment = envMap;
  }

  applyLighting(l: ThemeLighting): void {
    this.hemi.color.setHex(l.hemiSky);
    this.hemi.groundColor.setHex(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    this.sun.color.setHex(l.sunColor);
    this.sun.intensity = l.sunIntensity;
    this.scene.environmentIntensity = l.envIntensity;
    this.renderer.toneMappingExposure = l.exposure;
  }

  /** Renders one frame immediately (used by the loading screen / tests). */
  renderOnce(): void {
    this.composer.render();
  }

  start(update: UpdateFn): void {
    this.update = update;
    this.timer.connect(document);
    this.renderer.setAnimationLoop(this.tick);
  }

  private tick = (time: number): void => {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), ENGINE.maxDeltaTime);
    this.update(dt, this.timer.getElapsed());
    this.composer.render(dt);
  };

  private setupLights(): void {
    const sun = this.sun;
    sun.position.set(8, 22, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(ENGINE.shadowMapSize, ENGINE.shadowMapSize);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 60 });
    this.scene.add(this.hemi, sun, sun.target);
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  };
}
