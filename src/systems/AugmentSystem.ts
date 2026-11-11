import * as THREE from 'three';
import { AnimatedModel } from '../assets/AnimatedModel';
import { disposeObject, mesh, shared } from '../assets/ModelKit';
import { vfxTexture } from '../assets/vfxTextures';
import type { Enemy } from '../entities/Enemy';
import type { World } from '../game/World';
import { angleTo, dampAngle, distance, rand } from '../utils/math';

const BLADE_RADIUS = 1.9;
const BLADE_SPEED = 3.4;
const BLADE_HIT_COOLDOWN = 0.35;
const STORM_INTERVAL = 3;
const SPIRIT_INTERVAL = 1.2;
const SPIRIT_RANGE = 11;
const SPIRIT_SCALE = 0.78;
const SPIRIT_COLOR = 0x7fe3ff;

// Orbiting dagger: blade along +Z, crossguard, grip and pommel.
const DAGGER = {
  blade: shared(new THREE.OctahedronGeometry(1).scale(0.1, 0.025, 0.42).translate(0, 0, 0.34)),
  guard: shared(new THREE.BoxGeometry(0.32, 0.05, 0.06)),
  grip: shared(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8).rotateX(Math.PI / 2).translate(0, 0, -0.13)),
  pommel: shared(new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0, -0.25)),
};
const DAGGER_MAT = {
  blade: shared(new THREE.MeshStandardMaterial({ color: 0xe8f6ff, emissive: 0x59c8ff, emissiveIntensity: 1.6, metalness: 0.9, roughness: 0.2 })),
  gold: shared(new THREE.MeshStandardMaterial({ color: 0xd9a63a, metalness: 0.9, roughness: 0.3, emissive: 0x3a2400 })),
  grip: shared(new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.8 })),
};

function glowSprite(color: number, intensity: number, size: number): THREE.Sprite {
  const m = new THREE.SpriteMaterial({ map: vfxTexture('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  m.color.setHex(color).multiplyScalar(intensity);
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

function createDagger(): THREE.Group {
  const g = new THREE.Group();
  g.add(
    mesh(DAGGER.blade, DAGGER_MAT.blade, 0, 0, 0, false),
    mesh(DAGGER.guard, DAGGER_MAT.gold, 0, 0, 0, false),
    mesh(DAGGER.grip, DAGGER_MAT.grip, 0, 0, 0, false),
    mesh(DAGGER.pommel, DAGGER_MAT.gold, 0, 0, 0, false),
  );
  const tip = glowSprite(0x9fd8ff, 1.3, 0.55);
  tip.position.z = 0.55;
  g.add(tip);
  g.scale.setScalar(1.35);
  return g;
}

/** A ghostly, translucent miniature of the player archer — bow and all. */
interface Spirit {
  model: AnimatedModel;
  aura: THREE.Sprite;
  face: number;
  cooldown: number;
}

function createSpirit(): Spirit {
  const model = new AnimatedModel('player');
  model.restyle((m) => {
    m.transparent = true;
    m.opacity = 0.82;
    m.color.setHex(0x9fe8ff);
    m.emissive.setHex(0x1f7fe0);
    m.emissiveIntensity = 0.75;
  });
  model.root.traverse((o) => (o.castShadow = false));
  model.root.scale.setScalar(SPIRIT_SCALE);
  const aura = glowSprite(SPIRIT_COLOR, 0.55, 1.1);
  aura.position.y = 0.4; // soft glow under the feet (model space), so the figure itself stays readable
  model.root.add(aura);
  return { model, aura, face: 0, cooldown: rand(0.2, SPIRIT_INTERVAL) };
}

/**
 * Augment effects that act on their own every frame: orbiting daggers, shockwaves,
 * lightning storms, spirit archers and regeneration.
 */
export class AugmentSystem {
  private readonly root = new THREE.Group();
  private readonly blades: { mesh: THREE.Group; hits: Map<Enemy, number> }[] = [];
  private readonly spirits: Spirit[] = [];
  private bladeAngle = 0;
  private novaTimer = 2;
  private stormTimer = 1.5;
  private regenCarry = 0;
  private t = 0;

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
  }

  /** Clears visuals and timers (new run). */
  reset(): void {
    for (const b of this.blades) disposeObject(b.mesh);
    for (const s of this.spirits) s.model.dispose();
    this.blades.length = 0;
    this.spirits.length = 0;
    this.novaTimer = 2;
    this.stormTimer = 1.5;
    this.regenCarry = 0;
  }

  /** Runs every frame: visuals follow the player even outside combat. */
  updateVisuals(dt: number, world: World): void {
    const { player } = world;
    const s = player.stats;
    this.t += dt;
    this.syncCount(s.orbitBlades, s.spiritArrows);
    this.root.visible = player.alive;

    // Daggers circle the player point-first.
    this.bladeAngle += BLADE_SPEED * dt;
    this.blades.forEach((b, i) => {
      const a = this.bladeAngle + (i / this.blades.length) * Math.PI * 2;
      b.mesh.position.set(player.x + Math.sin(a) * BLADE_RADIUS, 0.9, player.z + Math.cos(a) * BLADE_RADIUS);
      b.mesh.rotation.set(0, Math.atan2(Math.cos(a), -Math.sin(a)), 0);
    });

    // Spirits hover over the player's shoulders.
    this.spirits.forEach((sp, i) => {
      const slot = this.spirits.length === 1 ? -1 : (i / (this.spirits.length - 1)) * 2 - 1; // -1 … 1
      const side = player.face + Math.PI / 2;
      const x = player.x + Math.sin(side) * slot * 1.2 - Math.sin(player.face) * 0.6;
      const z = player.z + Math.cos(side) * slot * 1.2 - Math.cos(player.face) * 0.6;
      const root = sp.model.root;
      root.position.set(x, 0.7 + Math.sin(this.t * 2.4 + i * 1.7) * 0.12, z);
      root.rotation.y = dampAngle(root.rotation.y, sp.face, 12, dt);
      sp.aura.material.opacity = 0.6 + Math.sin(this.t * 4 + i) * 0.2;
      sp.model.update(dt);
    });
  }

  /** Gameplay tick (only while playing). */
  update(dt: number, world: World): void {
    const { player } = world;
    const s = player.stats;
    if (!player.alive) return;

    if (s.regen > 0 && player.hp < player.maxHp) {
      this.regenCarry += s.regen * dt;
      if (this.regenCarry >= 1) {
        world.healPlayer(Math.floor(this.regenCarry), true);
        this.regenCarry -= Math.floor(this.regenCarry);
      }
    }

    // Orbiting daggers.
    for (const b of this.blades) {
      for (const [e, cd] of b.hits) {
        if (e.dead) b.hits.delete(e);
        else b.hits.set(e, cd - dt);
      }
      for (const e of world.enemies) {
        if (e.dead || (b.hits.get(e) ?? 0) > 0) continue;
        if (distance(e.x, e.z, b.mesh.position.x, b.mesh.position.z) > e.radius + 0.45) continue;
        b.hits.set(e, BLADE_HIT_COOLDOWN);
        world.effects.hit(b.mesh.position.x, 0.9, b.mesh.position.z, false);
        world.damageEnemy(e, s.damage * s.orbitDamage, 'blade');
      }
    }

    const hasTargets = world.enemies.some((e) => !e.dead && !e.spawning);

    // Shockwave.
    if (s.novaDamage > 0) {
      this.novaTimer -= dt;
      if (this.novaTimer <= 0 && hasTargets) {
        this.novaTimer = s.novaInterval;
        world.effects.shockwave(player.x, player.z, s.novaRadius, 0x9fd8ff);
        world.effects.roar(player.x, player.z, s.novaRadius * 0.9, 0x9fd8ff);
        world.damageArea(player.x, player.z, s.novaRadius, s.damage * s.novaDamage, 'aoe');
      }
    }

    // Lightning storm.
    if (s.stormStrikes > 0) {
      this.stormTimer -= dt;
      if (this.stormTimer <= 0 && hasTargets) {
        this.stormTimer = STORM_INTERVAL;
        const targets = world.enemies.filter((e) => !e.dead && !e.spawning).sort(() => Math.random() - 0.5).slice(0, s.stormStrikes);
        for (const e of targets) {
          world.effects.bolt(e.x + rand(-0.5, 0.5), 9, e.z - 2, e.x, 0.2, e.z, 0xcfe8ff);
          world.effects.eruption(e.x, e.z, 1.2, 0xbfe4ff);
          world.damageEnemy(e, s.damage * s.stormDamage, 'storm');
        }
        if (targets.length) world.events.emit('camera:shake', { intensity: 0.12 });
      }
    }

    // Spirit archers: aim at the nearest enemy, draw, loose a cyan arrow.
    for (const sp of this.spirits) {
      const { x, z } = sp.model.root.position;
      const target = world.nearestEnemy(x, z, SPIRIT_RANGE);
      sp.model.setLoop(target ? 'hold' : 'idle');
      sp.face = target ? angleTo(x, z, target.x, target.z) : player.face;
      sp.cooldown -= dt;
      if (!target || sp.cooldown > 0) continue;
      sp.cooldown = SPIRIT_INTERVAL;
      sp.model.playOnce('release', { fade: 0.03, timeScale: 1.6 });
      world.spawnArrow(x + Math.sin(sp.face) * 0.3, z + Math.cos(sp.face) * 0.3, sp.face, { damageMul: 0.6, minor: true, glow: SPIRIT_COLOR });
      world.effects.muzzle(x, 1.3, z);
    }
  }

  private syncCount(blades: number, spirits: number): void {
    while (this.blades.length < blades) {
      const daggerMesh = createDagger();
      this.root.add(daggerMesh);
      this.blades.push({ mesh: daggerMesh, hits: new Map() });
    }
    while (this.spirits.length < spirits) {
      const spirit = createSpirit();
      this.root.add(spirit.model.root);
      this.spirits.push(spirit);
    }
  }
}
