import * as THREE from 'three';
import { assets } from '../AssetLibrary';
import { mesh, shared } from '../ModelKit';
import { vfxTexture } from '../vfxTextures';

/** What an enemy throws. Each kind has its own unmistakable look (all models face +Z). */
export type ProjectileKind = 'acid' | 'rock' | 'crystal' | 'fireball' | 'shadow' | 'web' | 'icicle' | 'soul';

export interface ProjectileStyle {
  /** Collision radius before the heavy multiplier. */
  radius: number;
  /** Colour for trails, pops and impacts. */
  color: number;
  /** 'glow' = additive streak, 'smoke' = dusty puffs (rocks). */
  trail: 'glow' | 'smoke';
  /** Spin (rad/s) around the flight axis — rocks tumble, shards drill. */
  spin: number;
}

export const PROJECTILE_STYLES: Record<ProjectileKind, ProjectileStyle> = {
  acid: { radius: 0.22, color: 0x6dff3a, trail: 'glow', spin: 0 },
  rock: { radius: 0.36, color: 0x9a8f80, trail: 'smoke', spin: 9 },
  crystal: { radius: 0.28, color: 0xb36bff, trail: 'glow', spin: 12 },
  fireball: { radius: 0.3, color: 0xff6a1a, trail: 'glow', spin: 0 },
  shadow: { radius: 0.22, color: 0x9a5bff, trail: 'glow', spin: 6 },
  /** Sticky web ball: slows the player on hit (see CombatSystem). */
  web: { radius: 0.3, color: 0xe8f4ff, trail: 'glow', spin: 5 },
  icicle: { radius: 0.24, color: 0x8fe0ff, trail: 'glow', spin: 10 },
  /** Necromancer / wraith soul bolt: green ghost-flame. */
  soul: { radius: 0.24, color: 0x5dff7a, trail: 'glow', spin: 0 },
};

const hdr = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);
const additive = (color: THREE.Color, opacity = 1) =>
  shared(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));

const glowMaterials = new Map<number, THREE.SpriteMaterial>();
function glow(color: number, size: number, intensity = 1.4): THREE.Sprite {
  let m = glowMaterials.get(color);
  if (!m) {
    m = shared(new THREE.SpriteMaterial({ map: vfxTexture('glow'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.color.setHex(color).multiplyScalar(intensity);
    glowMaterials.set(color, m);
  }
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

/** A cone whose tip points backwards (-Z), base at `z0`: flame / drip tails. */
const tail = (radius: number, length: number) => shared(new THREE.ConeGeometry(radius, length, 12, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -length / 2));

const G = {
  sphere: shared(new THREE.SphereGeometry(1, 16, 12)),
  dropTail: tail(0.17, 0.38),
  flameTail: tail(0.27, 1.4),
  flameCore: tail(0.15, 0.8),
  bolt: shared(new THREE.OctahedronGeometry(1)),
  strand: shared(new THREE.TorusGeometry(0.24, 0.018, 4, 18)),
  spoke: shared(new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4)),
};

const M = {
  acid: shared(new THREE.MeshStandardMaterial({ color: 0x3fd61e, emissive: 0x1f9a0a, emissiveIntensity: 1.3, roughness: 0.15, metalness: 0.1 })),
  acidDark: shared(new THREE.MeshStandardMaterial({ color: 0x1d5a10, emissive: 0x0f3a05, roughness: 0.3 })),
  fireCore: shared(new THREE.MeshBasicMaterial({ color: hdr(0xffc04a, 1.5) })),
  fireShell: additive(hdr(0xff5a0a, 1.0), 0.85),
  fireTail: additive(hdr(0xff3a00, 0.9), 0.6),
  fireTailHot: additive(hdr(0xff9a20, 1.1), 0.7),
  shadowCore: shared(new THREE.MeshBasicMaterial({ color: 0x0c0414 })),
  shadowShell: additive(hdr(0x8a3bff, 1.9), 0.55),
  web: shared(new THREE.MeshStandardMaterial({ color: 0xf4f8ff, emissive: 0x8fa8c8, emissiveIntensity: 0.6, roughness: 0.6, transparent: true, opacity: 0.85 })),
  webCore: shared(new THREE.MeshStandardMaterial({ color: 0xdfe8f5, roughness: 0.8, transparent: true, opacity: 0.55 })),
  ice: shared(new THREE.MeshStandardMaterial({ color: 0xbfefff, emissive: 0x3fb8ff, emissiveIntensity: 1.1, roughness: 0.1, metalness: 0.1 })),
  soulCore: shared(new THREE.MeshBasicMaterial({ color: hdr(0xd8ffe0, 1.6) })),
  soulShell: additive(hdr(0x3dff6a, 1.1), 0.75),
  soulTail: additive(hdr(0x1fcf4a, 0.9), 0.55),
  crystal: shared(new THREE.MeshStandardMaterial({ color: 0xb07cff, emissive: 0x8a3bff, emissiveIntensity: 1.2, roughness: 0.15, metalness: 0.1 })),
};

/** Builds the mesh for one enemy projectile. The child named "spin" is rotated by the bullet each frame. */
export function createEnemyProjectile(kind: ProjectileKind): THREE.Group {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  root.add(spin);

  switch (kind) {
    case 'acid': {
      // Teardrop of venom with two drips trailing behind it.
      const head = mesh(G.sphere, M.acid, 0, 0, 0, false);
      head.scale.setScalar(0.17);
      const drop = mesh(G.dropTail, M.acid, 0, 0, 0, false);
      const drip1 = mesh(G.sphere, M.acidDark, 0.04, -0.03, -0.5, false);
      drip1.scale.setScalar(0.07);
      const drip2 = mesh(G.sphere, M.acid, -0.03, 0.02, -0.68, false);
      drip2.scale.setScalar(0.045);
      spin.add(head, drop, drip1, drip2, glow(0x6dff3a, 0.85, 1.1));
      spin.scale.setScalar(1.35);
      break;
    }
    case 'rock': {
      // A real boulder (environment model), tumbling end over end.
      const { root: rock } = assets.instantiate('boulder');
      const size = assets.sizeOf('boulder');
      rock.scale.setScalar(0.8 / Math.max(size.x, size.y, size.z));
      rock.position.y = -0.3; // centre the boulder on the tumble axis
      rock.traverse((o) => (o.castShadow = false));
      spin.add(rock);
      break;
    }
    case 'crystal': {
      // Glowing crystal shard flying point-first, drilling around its axis.
      const { root: shard } = assets.instantiate('crystal');
      shard.rotation.x = Math.PI / 2; // model stands up (+Y): lay it along +Z
      shard.scale.setScalar(0.75);
      shard.position.z = -0.5;
      shard.traverse((o) => {
        o.castShadow = false;
        if (o instanceof THREE.Mesh) o.material = M.crystal;
      });
      spin.add(shard, glow(0xb36bff, 0.9, 1.3));
      break;
    }
    case 'fireball': {
      // White-hot core, orange shell, flame tail streaming behind.
      const core = mesh(G.sphere, M.fireCore, 0, 0, 0, false);
      core.scale.setScalar(0.16);
      const shell = mesh(G.sphere, M.fireShell, 0, 0, 0, false);
      shell.scale.setScalar(0.27);
      const flame = mesh(G.flameTail, M.fireTail, 0, 0, 0.08, false);
      const hot = mesh(G.flameCore, M.fireTailHot, 0, 0, 0.05, false);
      spin.add(core, shell, flame, hot, glow(0xff5a0a, 1.2, 0.8));
      break;
    }
    case 'web': {
      // A wad of silk: a cloudy core wrapped in crossing strands with spokes sticking out.
      const core = mesh(G.sphere, M.webCore, 0, 0, 0, false);
      core.scale.setScalar(0.2);
      spin.add(core);
      for (const [rx, ry] of [[0, 0], [Math.PI / 2, 0], [Math.PI / 2, Math.PI / 2], [Math.PI / 4, Math.PI / 4]]) {
        const ring = mesh(G.strand, M.web, 0, 0, 0, false);
        ring.rotation.set(rx, ry, 0);
        spin.add(ring);
      }
      for (const [rx, rz] of [[0, 0], [Math.PI / 2, 0], [0, Math.PI / 2], [Math.PI / 3, Math.PI / 4]]) {
        const spoke = mesh(G.spoke, M.web, 0, 0, 0, false);
        spoke.rotation.set(rx, 0, rz);
        spin.add(spoke);
      }
      spin.add(glow(0xcfe4ff, 0.7, 0.5));
      break;
    }
    case 'icicle': {
      const { root: shard } = assets.instantiate('crystal');
      shard.rotation.x = Math.PI / 2;
      shard.scale.setScalar(0.6);
      shard.position.z = -0.4;
      shard.traverse((o) => {
        o.castShadow = false;
        if (o instanceof THREE.Mesh) o.material = M.ice;
      });
      spin.add(shard, glow(0x8fe0ff, 0.8, 1.0));
      break;
    }
    case 'soul': {
      // Green ghost-flame: pale core, green shell, wispy tail.
      const core = mesh(G.sphere, M.soulCore, 0, 0, 0, false);
      core.scale.setScalar(0.11);
      const shell = mesh(G.sphere, M.soulShell, 0, 0, 0, false);
      shell.scale.set(0.2, 0.2, 0.26);
      const wisp = mesh(G.flameTail, M.soulTail, 0, 0, 0.05, false);
      wisp.scale.set(0.7, 0.7, 0.8);
      spin.add(core, shell, wisp, glow(0x3dff6a, 1.0, 0.9));
      break;
    }
    case 'shadow': {
      // Black diamond wrapped in violet energy.
      const core = mesh(G.bolt, M.shadowCore, 0, 0, 0, false);
      core.scale.set(0.12, 0.12, 0.3);
      const shell = mesh(G.bolt, M.shadowShell, 0, 0, 0, false);
      shell.scale.set(0.2, 0.2, 0.42);
      spin.add(core, shell, glow(0x8a3bff, 0.95, 1.5));
      break;
    }
  }
  return root;
}
