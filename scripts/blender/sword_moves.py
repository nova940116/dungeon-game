"""
Hand-authored greatsword clips on the Quaternius "CharacterArmature" rig (the hero rig the warrior is built on):

  Idle         wide stance, the greatsword resting on the right shoulder, point high behind; slow heavy breathing
  Run          charging run: deep forward lean, real flight phase, knee drive and heel kick, hips and shoulders
               counter-rotating, the free arm pumping, the sword dragged one-handed behind, point near the ground
  Slash        two-handed horizontal sweep, right → left: coil far back over the right shoulder, hips lead,
               big step in with the left foot, blade flat and level through the target, momentum carries it
               around behind on the left, then it comes back up to the shoulder
  Slash_Back   the reverse sweep, left → right, stepping in with the right foot
  Slash_Heavy  crouch, leap with the blade raised behind the back, then smash it down into the ground in a deep
               landing crouch, hold the impact, lift it back to the shoulder
  Slash_Spin   the "회오리 베기" finisher: coil low to the right, then a full 360° (and a bit) spin on the balls
               of the feet with the greatsword held out flat at arm's length, the body leaning into it, then
               it drags to a stop and goes back up to the shoulder

Poses are written as targets, not joint angles:
  spine   {bone: (rx, ry, rz)} in character axes, relative to the parent (bosskit convention:
          rx > 0 bows forward, ry > 0 rolls toward the character's left, rz > 0 yaws to its left)
  body    (dx, dy, dz) offset of the Body bone (bob, weight shift, jump)
  feet    {'L'|'R': (x, y, z, pitch)} ankle position and toe pitch (pitch > 0 = toe down, heel up)
  hands   {'R': dict(at=(x, y, z), blade=(dx, dy, dz), flat=(nx, ny, nz), elbow=(dx, dy, dz)),
           'L': dict(at=…, elbow=…, grip=distance down the handle, on_grip=0…1)}  on_grip blends the left
          hand from its free position onto the handle (two-handed grip)
Legs and arms are solved with two-bone IK; between key poses the targets are splined and solved every frame,
so the blade follows the authored path exactly and the feet stay planted.

World space (Blender): +Z up, the character faces -Y, its left is +X (its sword hand is on -X).
The one-shot clips ease in from and out to the first frame of Idle.
"""
import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

FPS = 30
SPINE = ['Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head']
FINGER_PREFIXES = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')

# Where the blade crosses the target, as a share of each clip (read by the game: src/entities/Player.ts).
HIT = {'Slash': 12 / 28, 'Slash_Back': 12 / 28, 'Slash_Heavy': 15 / 34, 'Slash_Spin': 12 / 36}


def rot(rx=0.0, ry=0.0, rz=0.0):
    return Euler([math.radians(a) for a in (rx, ry, rz)], 'XYZ').to_matrix()


def frame(axis, ref):
    """Orthonormal basis with `axis` as X and `ref` (made perpendicular) as Y."""
    x = Vector(axis).normalized()
    y = Vector(ref) - x * Vector(ref).dot(x)
    if y.length < 1e-6:
        y = Vector((0, 0, 1)) if abs(x.z) < 0.9 else Vector((0, 1, 0))
        y = y - x * y.dot(x)
    y.normalize()
    z = x.cross(y)
    return Matrix((x, y, z)).transposed()


def angle_of(m):
    return m.to_quaternion().angle


class Rig:
    def __init__(self, arm):
        self.arm = arm
        mw = arm.matrix_world.to_3x3()
        self.mw_inv = mw.inverted()
        rot_w = mw.normalized()
        self.rest = {b.name: (rot_w @ b.matrix_local.to_3x3()).normalized() for b in arm.data.bones}
        self.local = {b.name: b.matrix_local.to_3x3() for b in arm.data.bones}
        self.head = {b.name: arm.matrix_world @ b.head_local for b in arm.data.bones}
        self.parent = {b.name: b.parent.name if b.parent else None for b in arm.data.bones}
        h = self.head
        self.leg = {s: (h[f'LowerLeg.{s}'] - h[f'UpperLeg.{s}'], h[f'Foot.{s}'] - h[f'LowerLeg.{s}']) for s in 'LR'}
        self.arm_seg = {s: (h[f'LowerArm.{s}'] - h[f'UpperArm.{s}'], h[f'Wrist.{s}'] - h[f'LowerArm.{s}']) for s in 'LR'}
        self.blade0, self.flat0 = self._blade_rest()
        self.fingers = {}
        self.last_grip = None   # previous key's blade orientation: keeps the grip from flipping between keys

    def _blade_rest(self):
        sword = bpy.data.objects.get('Greatsword') or bpy.data.objects.get('Longsword')
        wrist = self.head['Wrist.R']
        palm = (wrist + self.head['Middle2.R']) / 2
        self.grip_off = palm - wrist
        if not sword:
            return Vector((0.21, 0.08, 0.97)).normalized(), Vector((0, 1, 0))
        pts = [sword.matrix_world @ v.co for v in sword.data.vertices]
        tip = max(pts, key=lambda p: (p - wrist).length)
        blade = (tip - wrist).normalized()
        # The blade is wide across one axis and thin across the other: the flat faces the thin axis.
        upper = [p for p in pts if (p - wrist).dot(blade) > (tip - wrist).length * 0.6]
        c = sum(upper, Vector()) / len(upper)
        spread = [(p - c) - blade * (p - c).dot(blade) for p in upper]
        wide = max(spread, key=lambda v: v.length).normalized()
        # Where the right fist closes on the grip: the palm centre, moved onto the blade's axis.
        grip = tip + blade * (palm - tip).dot(blade)
        self.grip_off = grip - wrist
        return blade, blade.cross(wide).normalized()

    def capture_fingers(self, action, frame_no=0):
        """Finger curl (grip on the sword, loose fist) is taken from an existing clip."""
        arm = self.arm
        arm.animation_data_create()
        arm.animation_data.action = action
        bpy.context.scene.frame_set(frame_no)
        for pb in arm.pose.bones:
            if pb.name.startswith(FINGER_PREFIXES) and pb.name.endswith('.R'):
                q = pb.rotation_quaternion.copy()
                self.fingers[pb.name] = q
                # The left hand closes the same way (two-handed grip / fist): mirrored across the body.
                self.fingers[pb.name[:-2] + '.L'] = Quaternion((q.w, q.x, -q.y, -q.z))
        self.idle = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones}
        arm.animation_data.action = None

    def set_idle(self, pose):
        """The pose the one-shot clips ease in from and out to (first frame of the authored Idle)."""
        self.last_grip = None
        self.idle = {n: (q, l) for n, (q, l) in self.solve(pose).items()}
        for pb in self.arm.pose.bones:
            self.idle.setdefault(pb.name, (Quaternion(), Vector()))

    # ------------------------------------------------------------ solving

    def _world_pos(self, totals, pos, name):
        p = self.parent[name]
        return pos[p] + totals[p] @ (self.head[name] - self.head[p])

    def solve(self, pose):
        """Returns {bone: (local quaternion, local location)} for one key pose."""
        spine = pose.get('spine', {})
        totals = {'Root': Matrix.Identity(3)}
        pos = {'Root': self.head['Root']}
        out = {}
        rel = {}

        def chain(name, q):
            p = self.parent[name]
            totals[name] = totals[p] @ q
            rel[name] = q
            pos[name] = self._world_pos(totals, pos, name)

        chain('Body', rot(*spine.get('Body', (0, 0, 0))))
        pos['Body'] = pos['Body'] + Vector(pose.get('body', (0, 0, 0)))
        for name in SPINE[1:]:
            chain(name, rot(*spine.get(name, (0, 0, 0))))
        for s in 'LR':
            chain(f'Shoulder.{s}', rot(*spine.get(f'Shoulder.{s}', (0, 0, 0))))

        yaw = math.radians(spine.get('Body', (0, 0, 0))[2] + spine.get('Hips', (0, 0, 0))[2] * 0.5)

        # legs
        for s in 'LR':
            x, y, z, pitch = pose['feet'][s]
            ankle = Vector((x, y, z))
            hip = self._world_pos(totals, pos, f'UpperLeg.{s}')
            thigh0, shin0 = self.leg[s]
            fwd = rot(0, 0, math.degrees(yaw)) @ Vector((0.12 if s == 'L' else -0.12, -1, 0))
            knee, ankle = self._two_bone(hip, ankle, thigh0.length, shin0.length, fwd)
            t_thigh = frame(knee - hip, fwd) @ frame(thigh0, Vector((0, -1, 0))).inverted()
            shin_carried = t_thigh @ shin0
            t_shin = (shin_carried.rotation_difference(ankle - knee).to_matrix()) @ t_thigh
            rel[f'UpperLeg.{s}'] = totals['Body'].inverted() @ t_thigh
            rel[f'LowerLeg.{s}'] = t_thigh.inverted() @ t_shin
            totals[f'UpperLeg.{s}'], totals[f'LowerLeg.{s}'] = t_thigh, t_shin
            rel[f'Foot.{s}'] = rot(0, 0, math.degrees(yaw)) @ rot(pitch, 0, 0)
            out[f'Foot.{s}'] = ('loc', ankle - self.head[f'Foot.{s}'])

        # arms: the sword hand first, then the left hand (free, or on the grip below the right hand)
        grip_r = blade_dir = None
        for s in 'RL':
            spec = pose['hands'][s]
            shoulder = self._world_pos(totals, pos, f'UpperArm.{s}')
            up0, fore0 = self.arm_seg[s]
            elbow_pole = Vector(spec.get('elbow', (0, 1, -0.3)))
            target = Vector(spec['at'])
            if s == 'L' and spec.get('on_grip', 0) > 0:
                # Blend from the free position onto the handle, `grip` below the right hand.
                fist = grip_r - blade_dir * spec['grip']
                target = target.lerp(fist - (fist - shoulder).normalized() * 0.075, min(1.0, spec['on_grip']))
            elbow, wrist = self._two_bone(shoulder, target, up0.length, fore0.length, elbow_pole)
            t_up = frame(elbow - shoulder, elbow_pole) @ frame(up0, Vector((0, 1, 0))).inverted()
            fore_carried = t_up @ fore0
            t_fore = fore_carried.rotation_difference(wrist - elbow).to_matrix() @ t_up
            parent_total = totals[f'Shoulder.{s}']
            if s == 'R':
                t_fore, t_wrist = self._grip(t_fore, wrist - elbow, Vector(spec['blade']), Vector(spec.get('flat', (0, 0, 1))))
                blade_dir = (t_wrist @ self.blade0).normalized()
                grip_r = wrist + t_wrist @ self.grip_off
            else:
                t_wrist = t_fore @ rot(*spec.get('wrist', (0, 0, 0)))
            rel[f'UpperArm.{s}'] = parent_total.inverted() @ t_up
            rel[f'LowerArm.{s}'] = t_up.inverted() @ t_fore
            rel[f'Wrist.{s}'] = t_fore.inverted() @ t_wrist

        # Pose-space values: rotation in each bone's own rest frame, offsets converted to armature units.
        final = {}
        for name, q in rel.items():
            r = self.rest[name]
            final[name] = [(r.inverted() @ q @ r).to_quaternion(), Vector()]
        offsets = {'Body': Vector(pose.get('body', (0, 0, 0)))}
        for s in 'LR':
            offsets[f'Foot.{s}'] = out[f'Foot.{s}'][1]
        for name, d in offsets.items():
            final[name][1] = self.local[name].inverted() @ (self.mw_inv @ d)
        for name, q in self.fingers.items():
            final[name] = [q, Vector()]
        return final

    @staticmethod
    def _two_bone(root, target, l1, l2, pole):
        d_vec = target - root
        d = max(min(d_vec.length, (l1 + l2) * 0.999), abs(l1 - l2) + 1e-3)
        u = d_vec.normalized()
        target = root + u * d
        w = pole - u * pole.dot(u)
        w = w.normalized() if w.length > 1e-6 else frame(u, Vector((0, 0, 1))).col[1]
        cos_a = max(-1.0, min(1.0, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)))
        sin_a = math.sqrt(1 - cos_a * cos_a)
        joint = root + u * (l1 * cos_a) + w * (l1 * sin_a)
        return joint, target

    def _grip(self, t_fore, fore_dir, blade, flat):
        """Wrist rotation that points the blade along `blade` with its flat facing ±`flat`, letting the
        forearm roll a little so the wrist doesn't twist (the sign of the flat is free: two-edged sword)."""
        axis = fore_dir.normalized()
        best = None
        for sign in (1, -1):
            target = frame(blade, flat * sign) @ frame(self.blade0, self.flat0).inverted()
            for roll in range(-90, 91, 10):
                t_f = Matrix.Rotation(math.radians(roll), 3, axis) @ t_fore
                cost = angle_of(t_f.inverted() @ target) + abs(math.radians(roll)) * 0.35
                if self.last_grip is not None:
                    cost += angle_of(self.last_grip.inverted() @ target) * 0.6
                if best is None or cost < best[0]:
                    best = (cost, t_f, target)
        self.last_grip = best[2]
        return best[1], best[2]

    # ------------------------------------------------------------ clips

    def clip(self, name, keys, loop=False, idle_ends=False):
        """keys: [(frame, pose)]. `idle_ends` eases the clip in from and out to Idle's first frame."""
        arm = self.arm
        old = bpy.data.actions.get(name)
        if old:
            bpy.data.actions.remove(old)
        action = bpy.data.actions.new(name)
        action.use_fake_user = True
        arm.animation_data_create()
        arm.animation_data.action = action
        self.last_grip = None
        if not loop:
            keys = densify(keys)
        solved = [(f, self.solve(p)) for f, p in keys]
        if idle_ends:
            # Ease in from / out to Idle's first frame over a few frames, so the swing blends seamlessly.
            f_start, f_end = solved[0][0], solved[-1][0]
            blended = []
            for f, pose in solved:
                w = max(0.0, min(1.0, (f - f_start) / 3, (f_end - f) / 4))
                blended.append((f, {n: [self.idle[n][0].slerp(pose[n][0], w) if n in pose else self.idle[n][0].copy(),
                                        self.idle[n][1].lerp(pose[n][1], w) if n in pose else self.idle[n][1].copy()]
                                    for n in self.idle}))
            solved = blended
        prev = {}
        for f, pose in solved:
            for pb in arm.pose.bones:
                q, loc = pose.get(pb.name, [Quaternion(), Vector()])
                q = q.copy()
                if pb.name in prev and prev[pb.name].dot(q) < 0:
                    q.negate()
                prev[pb.name] = q
                pb.rotation_mode = 'QUATERNION'
                pb.rotation_quaternion = q
                pb.location = loc
                pb.keyframe_insert('rotation_quaternion', frame=f)
                pb.keyframe_insert('location', frame=f)
        for fc in _fcurves(action):
            for kp in fc.keyframe_points:
                kp.interpolation = 'LINEAR' if not loop else 'BEZIER'
                kp.handle_left_type = kp.handle_right_type = 'AUTO'
            fc.update()
        action.frame_range = (keys[0][0], keys[-1][0])
        arm.animation_data.action = None
        print(f'clip {name}: {(keys[-1][0] - keys[0][0]) / FPS:.2f}s{" (loop)" if loop else ""}')
        return action


def _spline(a, b, c, d, t):
    """Catmull-Rom through b (t=0) and c (t=1), applied to numbers, tuples and dicts alike."""
    if isinstance(b, dict):
        return {k: _spline(a[k], b[k], c[k], d[k], t) for k in b}
    if isinstance(b, (tuple, list)):
        return tuple(_spline(*v, t) for v in zip(a, b, c, d))
    t2, t3 = t * t, t * t * t
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3)


def densify(keys):
    """One pose per frame, splined through the key poses: the IK is solved every frame, so the blade and
    the feet follow the authored path exactly instead of whatever joint-angle interpolation would do."""
    out = []
    poses = [p for _, p in keys]
    for i in range(len(keys) - 1):
        (f0, p0), (f1, p1) = keys[i], keys[i + 1]
        pa = poses[max(i - 1, 0)]
        pd = poses[min(i + 2, len(poses) - 1)]
        for f in range(f0, f1):
            out.append((f, _spline(pa, p0, p1, pd, (f - f0) / (f1 - f0))))
    out.append(keys[-1])
    return out


def _fcurves(action):
    try:
        from bpy_extras import anim_utils
        return anim_utils.action_get_channelbag_for_slot(action, action.slots[0]).fcurves
    except Exception:
        return action.fcurves


# ---------------------------------------------------------------- choreography

def lerp(a, b, t):
    return tuple(x + (y - x) * t for x, y in zip(a, b))


def smooth(t):
    return t * t * (3 - 2 * t)


def body(yaw=0.0, lean=0.0, drop=0.0, roll=0.0, head=None, rise=0.0, shift=(0.0, 0.0)):
    """Spine + pelvis: `yaw` twists toward the character's left (hips lead, shoulders follow), `lean` bows
    forward, `drop` sinks the hips (bent knees), `roll` tilts sideways; the head stays on target."""
    return {
        'body': (shift[0], shift[1] - lean * 0.003, rise - drop),
        'spine': {
            'Body': (lean * 0.45, roll * 0.2, yaw * 0.45),
            'Hips': (0, 0, 0),
            'Abdomen': (lean * 0.2, roll * 0.25, yaw * 0.18),
            'Torso': (lean * 0.2, roll * 0.25, yaw * 0.2),
            'Chest': (lean * 0.15, roll * 0.3, yaw * 0.17),
            'Neck': (-lean * 0.35, -roll * 0.3, -yaw * 0.4),
            'Head': ((head if head is not None else -lean * 0.3), -roll * 0.2, -yaw * 0.4),
        },
    }


def feet(l, r):
    """l / r: (x, y, z, pitch) ankle targets."""
    return {'L': l, 'R': r}


def two_hands(at, blade, flat=(0, 0, 1), elbow=(-0.4, 0.4, -0.8), left_elbow=(0.5, 0.3, -0.8), slide=0.2):
    """Both hands on the grip: the right below the guard, the left `slide` further down the handle."""
    return {'R': dict(at=at, blade=blade, flat=flat, elbow=elbow),
            'L': dict(at=(0.3, -0.1, 1.0), grip=slide, on_grip=1.0, elbow=left_elbow, wrist=(0, 0, 0))}


def free_left(at, elbow, wrist=(0, 0, 0)):
    return dict(at=at, grip=0.2, on_grip=0.0, elbow=elbow, wrist=wrist)


def pose(b, f, hands):
    out = dict(b)
    out['feet'] = f
    out['hands'] = hands
    return out


# Fighting stance: wide, left foot forward, right foot back, knees soft.
STANCE = feet((0.17, -0.14, 0.023, 0), (-0.17, 0.16, 0.023, 0))


def idle_pose(t):
    """Greatsword resting on the right shoulder, point high behind; the free hand loose at the hip."""
    br = math.sin(2 * math.pi * t)
    return pose(
        body(yaw=-14, lean=4 + 1.5 * br, drop=0.07 + 0.012 * br, head=-2),
        STANCE,
        {'R': dict(at=(-0.22, -0.3, 1.46 - 0.012 * br), blade=(-0.08, 0.86, 0.5), flat=(0, 0, 1), elbow=(-0.8, 0.2, -0.6)),
         'L': free_left((0.3, -0.06, 0.98 - 0.01 * br), (0.7, 0.5, -0.2), (0, 0, -20))},
    )


# Run: one foot's path over a cycle (phase 0 = heel strike in front): (phase, y, z, pitch)
FOOT_PATH = [
    (0.00, -0.34, 0.040, -8),
    (0.20, 0.06, 0.030, 0),
    (0.38, 0.42, 0.070, 32),   # toe-off
    (0.52, 0.52, 0.330, 65),   # heel kicks up behind
    (0.68, 0.18, 0.450, 40),   # thigh drives through
    (0.82, -0.32, 0.320, 5),   # knee high in front, shin reaching
    (0.93, -0.42, 0.120, -12),
    (1.00, -0.34, 0.040, -8),
]


def foot_at(phase):
    phase %= 1.0
    for (p0, *a), (p1, *b) in zip(FOOT_PATH, FOOT_PATH[1:]):
        if p0 <= phase <= p1:
            return lerp(a, b, smooth((phase - p0) / (p1 - p0)))
    return FOOT_PATH[0][1:]


def run_pose(t):
    """Charging run, sword dragged one-handed behind, point just above the ground. Left strike at t=0."""
    s = math.sin(2 * math.pi * t)
    c = math.cos(2 * math.pi * t)
    bob = -0.055 * math.cos(4 * math.pi * (t - 0.12)) - 0.04
    fl, fr = foot_at(t), foot_at(t + 0.5)
    return {
        'body': (0.0, 0.03, bob),
        'spine': {
            'Body': (22, 0, 0),
            'Hips': (0, 3 * c, -10 * c),
            'Abdomen': (3, 0, 4 * c),
            'Torso': (3, 0, 6 * c),
            'Chest': (2 + 2 * abs(s), -2 * c, 8 * c),
            'Neck': (-14, 0, -4 * c),
            'Head': (-12 + 3 * math.cos(4 * math.pi * t), 0, -4 * c),
        },
        'feet': feet((0.14, fl[0], fl[1], fl[2]), (-0.14, fr[0], fr[1], fr[2])),
        'hands': {
            'L': free_left((0.27, -0.12 - 0.32 * -c, 1.06 + 0.12 * max(0.0, -c) + 0.03 * s),
                           (0.3, 0.9 if c > 0 else 0.5, -0.6), (0, 0, -15)),
            # Sword hand low at the right hip, arm straight back; the blade trails, swaying with the stride.
            'R': dict(at=(-0.34, 0.06 + 0.06 * c, 0.98 + 0.02 * s),
                      blade=(-0.28 + 0.05 * c, 0.86, -0.4 - 0.03 * s), flat=(-1, 0, 0.25), elbow=(-0.5, 0.6, -0.4)),
        },
    }


def _turn(v, angle):
    c, s = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, *v[2:])


def spin_pose(p, angle):
    """The pose turned `angle` degrees to the character's left about its vertical axis (feet, hands, blade,
    elbows and the Body bone): used for spins, where the hero pivots on his feet."""
    out = {k: v for k, v in p.items()}
    spine = dict(p['spine'])
    rx, ry, rz = spine['Body']
    spine['Body'] = (rx, ry, rz + angle)
    out['spine'] = spine
    out['feet'] = {k: _turn(v, angle) for k, v in p['feet'].items()}
    hands = {}
    for side, spec in p['hands'].items():
        h = dict(spec)
        for key in ('at', 'blade', 'flat', 'elbow'):
            if key in h:
                h[key] = _turn(h[key], angle)
        hands[side] = h
    out['hands'] = hands
    return out


def author(arm):
    rig = Rig(arm)
    rig.capture_fingers(bpy.data.actions['Idle'], 0)

    # ---- Idle (loop): shoulder rest, slow heavy breathing
    rig.clip('Idle', [(f, idle_pose(f / 48)) for f in range(0, 49, 2)], loop=True)
    rig.set_idle(idle_pose(0))

    # ---- Run (loop): 20 frames, left strike 0, right strike 10
    rig.clip('Run', [(f, run_pose(f / 20)) for f in range(0, 21)], loop=True)

    lunge_l = feet((0.2, -0.46, 0.023, 0), (-0.18, 0.3, 0.05, 22))     # big step in with the left foot
    lunge_r = feet((0.18, 0.28, 0.05, 22), (-0.2, -0.44, 0.023, 0))    # … with the right foot
    load_r = feet((0.17, -0.06, 0.06, 20), (-0.2, 0.22, 0.023, 0))     # weight back on the right, left heel up
    load_l = feet((0.2, 0.0, 0.023, 0), (-0.16, 0.26, 0.07, 24))

    # ---- Slash: huge two-handed horizontal sweep, right → left. Contact at frame 12.
    keys = [
        (0, idle_pose(0)),
        (6, pose(body(yaw=-62, lean=-6, drop=0.1, roll=-10), load_r,
                 two_hands((-0.34, 0.16, 1.4), (-0.5, 0.82, 0.28), elbow=(-0.5, 0.5, -0.7), left_elbow=(0.3, -0.4, -0.8)))),
        (9, pose(body(yaw=-34, lean=6, drop=0.13, roll=-4), load_r,
                 two_hands((-0.44, -0.12, 1.3), (-1, 0.1, 0.06), left_elbow=(0.2, -0.5, -0.8)))),
        (12, pose(body(yaw=14, lean=16, drop=0.2, roll=4), lunge_l,
                  two_hands((-0.06, -0.5, 1.2), (0.06, -1, -0.02), left_elbow=(0.6, 0.2, -0.8)))),
        (15, pose(body(yaw=58, lean=16, drop=0.2, roll=8), lunge_l,
                  two_hands((0.3, -0.32, 1.14), (1, -0.08, -0.1), left_elbow=(0.6, 0.6, -0.5)))),
        (19, pose(body(yaw=78, lean=12, drop=0.18, roll=10), lunge_l,
                  two_hands((0.34, -0.02, 1.12), (0.55, 0.8, -0.22), elbow=(-0.2, -0.3, -0.9), left_elbow=(0.6, 0.6, -0.5)))),
        (23, pose(body(yaw=30, lean=8, drop=0.12), STANCE,
                  two_hands((0.0, -0.36, 1.42), (0.15, -0.3, 0.94), flat=(1, 0, 0), left_elbow=(0.7, 0.2, -0.6)))),
        (28, idle_pose(0)),
    ]
    rig.clip('Slash', keys, idle_ends=True)

    # ---- Slash_Back: reverse sweep, left → right, stepping in with the right foot. Contact at frame 12.
    keys = [
        (0, idle_pose(0)),
        (6, pose(body(yaw=55, lean=-4, drop=0.1, roll=8), load_l,
                 two_hands((0.2, -0.04, 1.5), (0.62, 0.62, 0.45), elbow=(-0.6, -0.2, -0.7), left_elbow=(0.6, 0.6, -0.4)))),
        (9, pose(body(yaw=30, lean=6, drop=0.13, roll=4), load_l,
                 two_hands((0.32, -0.3, 1.36), (1, -0.18, 0.08), elbow=(-0.7, 0.2, -0.6), left_elbow=(0.6, 0.6, -0.5)))),
        (12, pose(body(yaw=-14, lean=16, drop=0.2, roll=-4), lunge_r,
                  two_hands((-0.12, -0.5, 1.24), (-0.06, -1, -0.04), elbow=(-0.7, 0.2, -0.6), left_elbow=(0.6, -0.1, -0.8)))),
        (15, pose(body(yaw=-58, lean=16, drop=0.2, roll=-8), lunge_r,
                  two_hands((-0.44, -0.28, 1.18), (-1, 0.05, -0.12), elbow=(-0.5, 0.6, -0.6), left_elbow=(0.2, -0.6, -0.7)))),
        (19, pose(body(yaw=-74, lean=12, drop=0.18, roll=-10), lunge_r,
                  two_hands((-0.42, 0.02, 1.16), (-0.55, 0.8, -0.2), elbow=(-0.4, 0.8, -0.4), left_elbow=(0.2, -0.6, -0.7)))),
        (23, pose(body(yaw=-36, lean=8, drop=0.12), STANCE,
                  two_hands((-0.3, -0.2, 1.4), (-0.25, 0.3, 0.92), flat=(0, 0, 1), elbow=(-0.8, 0.2, -0.5), left_elbow=(0.4, -0.5, -0.7)))),
        (28, idle_pose(0)),
    ]
    rig.clip('Slash_Back', keys, idle_ends=True)

    # ---- Slash_Heavy: crouch, leap with the blade raised behind the back, smash it into the ground. Contact at 15.
    air = feet((0.15, -0.2, 0.34, 25), (-0.15, 0.2, 0.42, 40))
    crouch = feet((0.18, -0.2, 0.023, 0), (-0.18, 0.18, 0.023, 0))
    land = feet((0.2, -0.5, 0.023, 0), (-0.2, 0.34, 0.05, 25))
    keys = [
        (0, idle_pose(0)),
        (5, pose(body(yaw=-24, lean=24, drop=0.26), crouch,
                 two_hands((-0.3, 0.06, 1.05), (-0.35, 0.65, -0.65), flat=(-1, 0, 0), elbow=(-0.6, 0.5, -0.5), left_elbow=(0.5, -0.4, -0.6)))),
        (9, pose(body(yaw=-6, lean=-16, rise=0.32, head=-4), air,
                 two_hands((-0.06, 0.06, 2.12), (0.0, 0.62, -0.78), flat=(1, 0, 0), elbow=(-0.8, 0.0, 0.5), left_elbow=(0.8, 0.0, 0.5)))),
        (12, pose(body(yaw=0, lean=-8, rise=0.36), air,
                  two_hands((-0.04, -0.14, 2.16), (0.0, 0.05, 1), flat=(1, 0, 0), elbow=(-0.8, 0.0, 0.4), left_elbow=(0.8, 0.0, 0.4)))),
        (15, pose(body(yaw=0, lean=34, drop=0.3, head=-22), land,
                  two_hands((-0.04, -0.56, 0.96), (0.0, -0.8, -0.6), flat=(1, 0, 0), elbow=(-0.7, 0.3, -0.5), left_elbow=(0.7, 0.3, -0.5)))),
        (20, pose(body(yaw=0, lean=32, drop=0.32, head=-18), land,
                  two_hands((-0.04, -0.54, 0.94), (0.0, -0.78, -0.62), flat=(1, 0, 0), elbow=(-0.7, 0.3, -0.5), left_elbow=(0.7, 0.3, -0.5)))),
        (26, pose(body(yaw=-10, lean=12, drop=0.14), STANCE,
                  two_hands((-0.18, -0.32, 1.32), (-0.15, -0.3, 0.94), flat=(1, 0, 0), elbow=(-0.8, 0.2, -0.5), left_elbow=(0.6, -0.2, -0.7)))),
        (34, idle_pose(0)),
    ]
    rig.clip('Slash_Heavy', keys, idle_ends=True)

    # ---- Slash_Spin: a full turn with the blade held out. The whole pose is turned about the body's axis
    # (hands, blade, feet, hips), so the hero pivots on his feet instead of twisting his legs.
    def spun(p, angle):
        return spin_pose(p, angle)

    held = lambda lean, drop, roll=0.0: pose(body(lean=lean, drop=drop, roll=roll), feet((0.2, -0.06, 0.023, 10), (-0.2, 0.08, 0.023, 10)),
                                            two_hands((-0.3, -0.42, 1.18), (-0.92, -0.36, -0.05), elbow=(-0.5, 0.3, -0.8), left_elbow=(0.4, 0.3, -0.8)))
    coil = pose(body(yaw=-30, lean=18, drop=0.2, roll=-6), feet((0.2, -0.1, 0.023, 0), (-0.2, 0.14, 0.023, 0)),
                two_hands((-0.38, 0.12, 1.08), (-0.55, 0.8, -0.15), elbow=(-0.5, 0.6, -0.6), left_elbow=(0.3, -0.4, -0.8)))
    keys = [
        (0, idle_pose(0)),
        (6, spun(coil, -35)),
        (9, spun(held(14, 0.18, -4), 10)),
        (12, spun(held(16, 0.2, -8), 120)),
        (15, spun(held(16, 0.2, -10), 235)),
        (18, spun(held(14, 0.18, -8), 340)),
        (22, spun(held(10, 0.16, -4), 400)),
        (27, spun(pose(body(lean=8, drop=0.12), STANCE, two_hands((0.0, -0.36, 1.42), (0.15, -0.3, 0.94), flat=(1, 0, 0), left_elbow=(0.7, 0.2, -0.6))), 380)),
        (36, spun(idle_pose(0), 360)),
    ]
    rig.clip('Slash_Spin', keys, idle_ends=True)
    return rig
