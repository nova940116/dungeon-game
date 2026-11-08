import * as THREE from 'three';
import type { AnimatedModel } from '../assets/AnimatedModel';
import { assets } from '../assets/AssetLibrary';
import { createArrowMesh } from '../assets/models/ProjectileModels';
import { clamp } from '../utils/math';

/**
 * Procedural bow-and-arrow pose layered on top of the character's skinned animation.
 * The source rig has no archery clips, so while aiming we:
 *  - twist the upper body sideways (bow shoulder toward the target),
 *  - place both hands with two-bone IK (bow arm extended, string hand drawing back to the face),
 *  - bend the bowstring to the drawing hand and show a nocked arrow.
 * On release the string snaps straight and the hand follows through, then re-draws.
 *
 * Coordinates below are in the character's local space: +Z forward, +Y up, +X = character's left.
 */
const TUNING = {
  /** Upper-body yaw while aiming (radians), split between abdomen and chest. */
  torsoTwist: 1.05,
  /** Fraction of the twist the head turns back so it keeps looking at the target. */
  headCounter: 0.85,
  bowReach: 0.9,
  /** How far the bow hand sits from the body centerline (0 = shoulder line, 1 = centerline). */
  bowInset: 0.45,
  bowDrop: 0.05,
  /** Full-draw anchor relative to the string shoulder. */
  anchor: new THREE.Vector3(-0.02, 0.12, 0.1),
  followThrough: 0.16,
  /** Bow tilt toward horizontal so its shape reads from the high camera. */
  bowCant: 0.75,
  stringRadius: 0.008,
  poseRate: 12,
  drawRate: 16,
  /** Seconds after release before the hand is back on the string. */
  renockTime: 0.12,
} as const;

interface ArmChain {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  wrist: THREE.Object3D;
  length: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const v4 = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const m1 = new THREE.Matrix4();

const stringMaterial = new THREE.MeshBasicMaterial({ color: 0xd9ccb0 });
const stringGeometry = new THREE.CylinderGeometry(1, 1, 1, 5, 1).translate(0, 0.5, 0);

export class ArcheryRig {
  /** Holder whose origin is the bow grip; bow long axis = +Y, string side = -Z. */
  readonly bow = new THREE.Group();
  private readonly nockedArrow: THREE.Group;
  private readonly strings: [THREE.Mesh, THREE.Mesh];
  private readonly tipTop = new THREE.Vector3();
  private readonly tipBottom = new THREE.Vector3();
  /** Distance from the grip back to the resting string. */
  private stringDepth = 0.2;

  private readonly bowArm: ArmChain | null;
  private readonly drawArm: ArmChain | null;
  private readonly torso: THREE.Object3D[];
  private readonly neck: THREE.Object3D | undefined;
  /** Bones we override; restored before the mixer runs so un-animated channels don't accumulate. */
  private readonly touched: { bone: THREE.Object3D; rest: THREE.Quaternion }[] = [];

  private pose = 0;
  private draw = 0;
  private sinceRelease = 1;

  constructor(private readonly model: AnimatedModel) {
    this.bowArm = this.chain('L');
    this.drawArm = this.chain('R');
    this.torso = ['Abdomen', 'Chest'].map((n) => model.findObject(n)).filter((b): b is THREE.Object3D => !!b);
    this.neck = model.findObject('Neck');
    for (const bone of [...this.torso, this.neck, this.bowArm?.upper, this.bowArm?.lower, this.drawArm?.upper, this.drawArm?.lower]) {
      if (bone) this.touched.push({ bone, rest: bone.quaternion.clone() });
    }

    this.buildBow();
    this.nockedArrow = this.buildNockedArrow();
    this.strings = [new THREE.Mesh(stringGeometry, stringMaterial), new THREE.Mesh(stringGeometry, stringMaterial)];
    model.root.add(this.bow, this.nockedArrow, ...this.strings);
  }

  /** Call when an arrow leaves the bow. */
  release(): void {
    this.sinceRelease = 0;
    this.draw = 0.15;
  }

  reset(): void {
    this.pose = 0;
    this.draw = 0;
    this.sinceRelease = 1;
  }

  /** Undo last frame's overrides. Call before the animation mixer updates. */
  restore(): void {
    for (const t of this.touched) t.bone.quaternion.copy(t.rest);
  }

  /**
   * Applies the pose after the mixer has updated and the root transform is final.
   * @param aiming   standing still with a target
   * @param drawGoal 0..1 how far the string should be pulled right now (from attack cooldown)
   */
  update(dt: number, aiming: boolean, drawGoal: number): void {
    const root = this.model.root;
    this.sinceRelease += dt;
    this.pose += ((aiming ? 1 : 0) - this.pose) * Math.min(1, dt * TUNING.poseRate);
    const renocked = this.sinceRelease > TUNING.renockTime;
    const goal = renocked ? drawGoal : 0;
    this.draw += (goal - this.draw) * Math.min(1, dt * TUNING.drawRate);

    for (const t of this.touched) t.rest.copy(t.bone.quaternion); // the mixer's pose this frame
    root.updateMatrixWorld(true);

    const w = this.pose;
    if (w > 0.001) this.applyBodyPose(w);
    this.placeBow(w);
    this.placeString(w, renocked);
  }

  // ---------------------------------------------------------------- pose

  private applyBodyPose(w: number): void {
    const root = this.model.root;
    // Upper body faces sideways: bow (left) shoulder toward the target, head turned back to it.
    const twist = -TUNING.torsoTwist * w;
    for (const bone of this.torso) rotateAroundWorldAxis(bone, worldUp(root), twist / this.torso.length);
    if (this.neck) rotateAroundWorldAxis(this.neck, worldUp(root), -twist * TUNING.headCounter);
    root.updateMatrixWorld(true);

    const fwd = v1.set(0, 0, 1);
    if (this.bowArm) {
      const shoulder = localPos(root, this.bowArm.upper, v2);
      const hand = v3.copy(shoulder);
      hand.x *= 1 - TUNING.bowInset;
      hand.y -= TUNING.bowDrop;
      hand.addScaledVector(fwd, this.bowArm.length * TUNING.bowReach);
      hand.z -= this.followThrough() * 0.04; // tiny recoil on release
      solveArm(root, this.bowArm, hand, v4.set(0.6, -0.8, -0.2), w);
    }
    if (this.drawArm && this.bowArm) {
      const grip = localPos(root, this.bowArm.wrist, v2);
      const anchor = localPos(root, this.drawArm.upper, v3).add(TUNING.anchor);
      // Draw starts with the hand on the resting string.
      const rest = v4.copy(anchor).sub(grip).setLength(this.stringDepth + 0.02).add(grip);
      const hand = rest.lerp(anchor, this.draw);
      // Follow-through: the string hand flicks back past the anchor right after release.
      hand.addScaledVector(v2.copy(anchor).sub(grip).normalize(), TUNING.followThrough * this.followThrough());
      solveArm(root, this.drawArm, hand, v3.set(-0.7, 0.35, -1), w);
    }
  }

  private followThrough(): number {
    return Math.exp(-this.sinceRelease * 9) * (1 - Math.min(1, this.sinceRelease / 0.4));
  }

  private placeBow(w: number): void {
    const root = this.model.root;
    if (!this.bowArm) return;
    localPos(root, this.bowArm.wrist, this.bow.position);
    // Aiming: bow upright-ish across the shot line (string toward the archer), canted for the camera.
    // Relaxed: hanging along the body, pointing down-forward.
    const aim = q1.setFromEuler(new THREE.Euler(0, 0, -TUNING.bowCant, 'YXZ'));
    const relaxed = q2.setFromEuler(new THREE.Euler(0.9, 0.2, 0.2, 'YXZ'));
    this.bow.quaternion.copy(relaxed).slerp(aim, w);
  }

  private placeString(w: number, renocked: boolean): void {
    const root = this.model.root;
    this.bow.updateMatrix();
    const top = v1.copy(this.tipTop).applyMatrix4(this.bow.matrix);
    const bottom = v2.copy(this.tipBottom).applyMatrix4(this.bow.matrix);
    const mid = v3.copy(top).add(bottom).multiplyScalar(0.5);

    const holding = w > 0.5 && renocked && this.drawArm !== null;
    const nock = v4.copy(mid);
    if (holding && this.drawArm) {
      localPos(root, this.drawArm.wrist, nock);
      // Never let the string pass in front of the bow.
      const toBack = m1.extractRotation(this.bow.matrix);
      const back = new THREE.Vector3(0, 0, -1).applyMatrix4(toBack);
      if (nock.clone().sub(mid).dot(back) < 0) nock.copy(mid);
    }
    stretch(this.strings[0], top, nock);
    stretch(this.strings[1], bottom, nock);

    this.nockedArrow.visible = holding;
    if (holding) {
      this.nockedArrow.position.copy(nock);
      this.nockedArrow.quaternion.setFromUnitVectors(FORWARD, v1.copy(this.bow.position).sub(nock).normalize());
    }
  }

  // ---------------------------------------------------------------- setup

  private chain(side: 'L' | 'R'): ArmChain | null {
    const upper = this.model.findObject(`UpperArm.${side}`);
    const lower = this.model.findObject(`LowerArm.${side}`);
    const wrist = this.model.findObject(`Wrist.${side}`);
    if (!upper || !lower || !wrist) return null;
    this.model.root.updateMatrixWorld(true);
    const a = upper.getWorldPosition(new THREE.Vector3());
    const b = lower.getWorldPosition(new THREE.Vector3());
    const c = wrist.getWorldPosition(new THREE.Vector3());
    return { upper, lower, wrist, length: a.distanceTo(b) + b.distanceTo(c) };
  }

  /** Wraps the bow model so the holder origin is the grip and the string lies on -Z. */
  private buildBow(): void {
    const model = assets.instantiate('bow').root;
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    // The built-in string is a straight mesh; we hide it and draw our own so it can bend.
    let stringBox: THREE.Box3 | null = null;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        const name = (Array.isArray(o.material) ? o.material[0] : o.material).name;
        if (name === 'White') {
          stringBox = new THREE.Box3().setFromObject(o);
          o.visible = false;
        }
      }
    });
    const sb: THREE.Box3 = stringBox ?? new THREE.Box3(new THREE.Vector3(box.max.x, box.min.y, center.z), new THREE.Vector3(box.max.x, box.max.y, center.z));
    const stringCenter = sb.getCenter(new THREE.Vector3());

    // Horizontal axis from the string to the bow's belly.
    const across = stringCenter.clone().sub(center).setY(0);
    const acrossAxis: 'x' | 'z' = size.x >= size.z ? 'x' : 'z';
    const sign = Math.sign(across[acrossAxis]) || 1;
    const gripDepth = (acrossAxis === 'x' ? size.x : size.z) / 2;

    const inner = new THREE.Group();
    inner.add(model);
    // Rotate so "belly → string" becomes -Z.
    if (acrossAxis === 'x') inner.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
    else inner.rotation.y = sign > 0 ? Math.PI : 0;
    // Move the grip (belly side, mid height) to the holder origin.
    model.position.set(-center.x, -center.y, -center.z);
    const grip = new THREE.Vector3(0, 0, gripDepth);
    inner.position.copy(grip).negate().multiplyScalar(0.8);
    inner.updateMatrix();
    this.bow.add(inner);

    const local = (p: THREE.Vector3) => p.clone().sub(center).applyMatrix4(inner.matrix);
    this.tipTop.copy(local(new THREE.Vector3(stringCenter.x, sb.max.y, stringCenter.z)));
    this.tipBottom.copy(local(new THREE.Vector3(stringCenter.x, sb.min.y, stringCenter.z)));
    this.stringDepth = Math.abs(this.tipTop.z);
  }

  private buildNockedArrow(): THREE.Group {
    const arrow = createArrowMesh();
    for (const c of [...arrow.children]) if (c instanceof THREE.Sprite) arrow.remove(c);
    const box = new THREE.Box3().setFromObject(arrow);
    // Tail at the holder origin, tip along +Z.
    arrow.position.z = -box.min.z;
    const holder = new THREE.Group();
    holder.add(arrow);
    holder.visible = false;
    return holder;
  }
}

// ---------------------------------------------------------------- helpers

function worldUp(root: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3().copy(UP).applyQuaternion(root.getWorldQuaternion(q2));
}

/** Position of `bone` expressed in `root`'s local space. */
function localPos(root: THREE.Object3D, bone: THREE.Object3D, out: THREE.Vector3): THREE.Vector3 {
  bone.getWorldPosition(out);
  return root.worldToLocal(out);
}

function rotateAroundWorldAxis(bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  applyWorldRotation(bone, new THREE.Quaternion().setFromAxisAngle(axis, angle));
}

/** Pre-multiplies a world-space rotation onto a bone, keeping its parent untouched. */
function applyWorldRotation(bone: THREE.Object3D, delta: THREE.Quaternion): void {
  const parent = bone.parent;
  const boneWorld = bone.getWorldQuaternion(new THREE.Quaternion());
  const parentWorld = parent ? parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.invert().multiply(delta).multiply(boneWorld));
  bone.updateMatrixWorld(true);
}

function aimBone(bone: THREE.Object3D, child: THREE.Object3D, target: THREE.Vector3, weight: number): void {
  const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
  const to = target.clone().sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(from, to);
  applyWorldRotation(bone, new THREE.Quaternion().slerp(delta, weight));
}

/**
 * Analytic two-bone IK. `targetLocal` and `poleLocal` (elbow bend direction) are in root space.
 */
function solveArm(root: THREE.Object3D, arm: ArmChain, targetLocal: THREE.Vector3, poleLocal: THREE.Vector3, weight: number): void {
  const s = arm.upper.getWorldPosition(new THREE.Vector3());
  const e = arm.lower.getWorldPosition(new THREE.Vector3());
  const h = arm.wrist.getWorldPosition(new THREE.Vector3());
  const a = s.distanceTo(e);
  const b = e.distanceTo(h);

  const target = root.localToWorld(targetLocal.clone());
  const pole = poleLocal.clone().applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())).normalize();
  const toTarget = target.clone().sub(s);
  const dist = clamp(toTarget.length(), Math.abs(a - b) + 1e-3, (a + b) * 0.999);
  const dir = toTarget.normalize();
  target.copy(s).addScaledVector(dir, dist);

  const bend = pole.addScaledVector(dir, -pole.dot(dir));
  if (bend.lengthSq() < 1e-6) bend.set(0, -1, 0);
  bend.normalize();
  const cosA = clamp((a * a + dist * dist - b * b) / (2 * a * dist), -1, 1);
  const elbow = s.clone().addScaledVector(dir, a * cosA).addScaledVector(bend, a * Math.sqrt(1 - cosA * cosA));

  aimBone(arm.upper, arm.lower, elbow, weight);
  aimBone(arm.lower, arm.wrist, target, weight);
}

/** Scales/rotates a unit +Y cylinder so it spans a → b. */
function stretch(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3): void {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(d.length(), 1e-4);
  mesh.position.copy(a);
  mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
  mesh.scale.set(TUNING.stringRadius, len, TUNING.stringRadius);
}
