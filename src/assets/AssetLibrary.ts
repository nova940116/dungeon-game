import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ENVIRONMENT_HDR, MODELS, SURFACES, surfaceUrls, type ModelKey, type ModelSpec, type SurfaceKey } from './AssetManifest';
import { shared } from './ModelKit';

interface PreparedModel {
  spec: ModelSpec;
  source: THREE.Object3D;
  clips: THREE.AnimationClip[];
  scale: number;
  offset: THREE.Vector3;
  size: THREE.Vector3;
}

export interface ModelInstance {
  /** Wrapper positioned at the model's feet, facing +Z. Move/rotate this. */
  root: THREE.Group;
  clips: THREE.AnimationClip[];
  /** Per-instance materials (only for animated models). */
  materials: THREE.MeshStandardMaterial[];
}

export interface SurfaceMaps {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

/**
 * Loads all assets once up front, normalizes model scale/pivot, and hands out
 * cheap clones. Source geometry/materials/textures are marked shared so
 * `disposeObject` never frees them.
 */
class AssetLibrary {
  private readonly models = new Map<ModelKey, PreparedModel>();
  private readonly surfaces = new Map<SurfaceKey, SurfaceMaps>();
  private envMap: THREE.Texture | null = null;

  async loadAll(renderer: THREE.WebGLRenderer, onProgress: (ratio: number) => void): Promise<void> {
    const manager = new THREE.LoadingManager();
    manager.onProgress = (_url, loaded, total) => onProgress(total ? loaded / total : 0);
    const gltfLoader = new GLTFLoader(manager);
    const textureLoader = new THREE.TextureLoader(manager);
    const hdrLoader = new HDRLoader(manager);

    const modelJobs = (Object.keys(MODELS) as ModelKey[]).map(async (key) => {
      const spec: ModelSpec = MODELS[key];
      const gltf = await gltfLoader.loadAsync(spec.url);
      this.models.set(key, this.prepare(spec, gltf.scene, gltf.animations));
    });

    const surfaceJobs = SURFACES.map(async (key) => {
      const urls = surfaceUrls(key);
      const [map, normalMap] = await Promise.all([textureLoader.loadAsync(urls.map), textureLoader.loadAsync(urls.normalMap)]);
      map.colorSpace = THREE.SRGBColorSpace;
      for (const t of [map, normalMap]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        shared(t);
      }
      this.surfaces.set(key, { map, normalMap });
    });

    const envJob = hdrLoader.loadAsync(ENVIRONMENT_HDR).then((hdr) => {
      const pmrem = new THREE.PMREMGenerator(renderer);
      this.envMap = shared(pmrem.fromEquirectangular(hdr).texture);
      hdr.dispose();
      pmrem.dispose();
    });

    await Promise.all([...modelJobs, ...surfaceJobs, envJob]);
    onProgress(1);
  }

  get environment(): THREE.Texture | null {
    return this.envMap;
  }

  /** Normalized size (world units) of a model, e.g. to tile walls. */
  sizeOf(key: ModelKey): THREE.Vector3 {
    return this.get(key).size.clone();
  }

  surface(key: SurfaceKey): SurfaceMaps {
    const s = this.surfaces.get(key);
    if (!s) throw new Error(`Surface not loaded: ${key}`);
    return s;
  }

  instantiate(key: ModelKey): ModelInstance {
    const p = this.get(key);
    const inner = p.spec.animated ? SkeletonUtils.clone(p.source) : p.source.clone();
    inner.scale.multiplyScalar(p.scale);
    inner.position.copy(p.offset);

    const materials: THREE.MeshStandardMaterial[] = [];
    if (p.spec.animated) {
      // Own materials so hit flashes don't affect other instances.
      const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
      inner.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const src = o.material as THREE.MeshStandardMaterial;
        let m = cloned.get(src);
        if (!m) {
          m = src.clone();
          cloned.set(src, m);
          materials.push(m);
        }
        o.material = m;
      });
    }

    const root = new THREE.Group();
    const pivot = new THREE.Group();
    pivot.rotation.y = p.spec.rotationY ?? 0;
    pivot.add(inner);
    root.add(pivot);
    return { root, clips: p.clips, materials };
  }

  private get(key: ModelKey): PreparedModel {
    const p = this.models.get(key);
    if (!p) throw new Error(`Model not loaded: ${key}`);
    return p;
  }

  private prepare(spec: ModelSpec, source: THREE.Object3D, clips: THREE.AnimationClip[]): PreparedModel {
    source.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.castShadow = true;
      o.receiveShadow = !spec.animated;
      // Skinned bounds are computed in bind pose; animation can move verts outside them.
      if (o instanceof THREE.SkinnedMesh) o.frustumCulled = false;
      shared(o.geometry);
      const mats: THREE.Material[] = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        shared(m);
        const std = m as THREE.MeshStandardMaterial;
        for (const t of [std.map, std.normalMap, std.emissiveMap, std.roughnessMap, std.metalnessMap]) if (t) shared(t);
      }
    });

    source.updateMatrixWorld(true);
    source.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh) o.skeleton.update();
    });
    const box = new THREE.Box3().setFromObject(source, true);
    const raw = box.getSize(new THREE.Vector3());
    const measure = spec.fit === 'height' ? raw.y : Math.max(raw.x, raw.y, raw.z);
    const scale = measure > 0 ? spec.size / measure : 1;
    const center = box.getCenter(new THREE.Vector3());
    const offset = new THREE.Vector3(-center.x * scale, -box.min.y * scale, -center.z * scale);
    return { spec, source, clips, scale, offset, size: raw.multiplyScalar(scale) };
  }
}

export const assets = new AssetLibrary();
