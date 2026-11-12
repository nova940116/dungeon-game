"""
Hand-authored swordsman clips on the Quaternius "CharacterArmature" rig (the hero rig the knight is built on):

  Run          sword run: forward lean, real flight phase, knee drive and heel kick, hips and shoulders
               counter-rotating, the free arm pumping, the sword carried low and trailing behind
  Slash        forehand (right → left): wind-up over the right shoulder, hips lead, step in with the left foot,
               blade flat and level through the target, follow-through low on the left
  Slash_Back   backhand (left → right): load up on the left, uncoil, step with the right foot
  Slash_Heavy  overhead finisher: rise onto the toes with the blade raised behind the head, drive down into
               a deep lunge, the blade chops through and ends low in front

Poses are written as targets, not joint angles:
  spine   {bone: (rx, ry, rz)} in character axes, relative to the parent (bosskit convention:
          rx > 0 bows forward, ry > 0 rolls toward the character's left, rz > 0 yaws to its left)
  body    (dx, dy, dz) offset of the Body bone (bob, weight shift)
  feet    {'L'|'R': (x, y, z, pitch)} ankle position and toe pitch (pitch > 0 = toe down, heel up)
  hands   {'R': dict(at=(x, y, z), blade=(dx, dy, dz), flat=(nx, ny, nz), elbow=(dx, dy, dz)),
           'L': dict(at=…, elbow=…)}  wrist position, blade direction, blade flat normal, elbow pole
Legs and arms are solved with two-bone IK, so feet stay planted and the blade follows the authored path.

World space (Blender): +Z up, the character faces -Y, its left is +X (its sword hand is on -X).
The slashes start and end on the first frame of Idle so they blend in and out seamlessly.
"""
import math

import bpy
from mathutils import Euler, Matrix, Quaternion, Vector

FPS = 30
SPINE = ['Body', 'Hips', 'Abdomen', 'Torso', 'Chest', 'Neck', 'Head']
FINGER_PREFIXES = ('Index', 'Middle', 'Ring', 'Pinky', 'Thumb')

# Where the blade crosses the target, as a share of each clip (read by the game: src/entities/Player.ts).
HIT = {'Slash': 10 / 22, 'Slash_Back': 10 / 22, 'Slash_Heavy': 12 / 28}


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
        sword = bpy.data.objects.get('Longsword')
        wrist = self.head['Wrist.R']
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
        return blade, blade.cross(wide).normalized()

    def capture_fingers(self, action, frame_no=0):
        """Finger curl (grip on the sword, loose fist) is taken from an existing clip."""
        arm = self.arm
        arm.animation_data_create()
        arm.animation_data.action = action
        bpy.context.scene.frame_set(frame_no)
        for pb in arm.pose.bones:
            if pb.name.startswith(FINGER_PREFIXES):
                self.fingers[pb.name] = pb.rotation_quaternion.copy()
        self.idle = {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy()) for pb in arm.pose.bones}
        arm.animation_data.action = None

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

        # arms
        for s in 'LR':
            spec = pose['hands'][s]
            shoulder = self._world_pos(totals, pos, f'UpperArm.{s}')
            up0, fore0 = self.arm_seg[s]
            elbow_pole = Vector(spec.get('elbow', (0, 1, -0.3)))
            elbow, wrist = self._two_bone(shoulder, Vector(spec['at']), up0.length, fore0.length, elbow_pole)
            t_up = frame(elbow - shoulder, elbow_pole) @ frame(up0, Vector((0, 1, 0))).inverted()
            fore_carried = t_up @ fore0
            t_fore = fore_carried.rotation_difference(wrist - elbow).to_matrix() @ t_up
            parent_total = totals[f'Shoulder.{s}']
            if s == 'R':
                t_fore, t_wrist = self._grip(t_fore, wrist - elbow, Vector(spec['blade']), Vector(spec.get('flat', (0, 0, 1))))
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


# Run: one foot's path over a cycle (phase 0 = heel strike in front). (phase, y, z, pitch)
FOOT_PATH = [
    (0.00, -0.30, 0.040, -8),
    (0.20, 0.05, 0.030, 0),
    (0.38, 0.38, 0.060, 30),   # toe-off
    (0.52, 0.48, 0.300, 62),   # heel kicks up behind
    (0.68, 0.18, 0.420, 40),   # thigh drives through
    (0.82, -0.28, 0.300, 5),   # knee high in front, shin reaching
    (0.93, -0.38, 0.120, -12),
    (1.00, -0.30, 0.040, -8),
]


def foot_at(phase):
    phase %= 1.0
    for (p0, *a), (p1, *b) in zip(FOOT_PATH, FOOT_PATH[1:]):
        if p0 <= phase <= p1:
            return lerp(a, b, smooth((phase - p0) / (p1 - p0)))
    return FOOT_PATH[0][1:]


def run_pose(t):
    """t in [0, 1): left heel strike at 0, right at 0.5."""
    s = math.sin(2 * math.pi * t)          # +1 a quarter after the left strike
    c = math.cos(2 * math.pi * t)          # +1 at the left strike
    bob = -0.05 * math.cos(4 * math.pi * (t - 0.12)) - 0.025   # lowest at mid-stance, highest in flight
    lift_l, lift_r = foot_at(t), foot_at(t + 0.5)
    pose = {
        'body': (0.0, 0.0, bob),
        'spine': {
            'Body': (14, 0, 0),
            'Hips': (0, 3 * c, -9 * c),               # left hip swings forward with the left leg
            'Abdomen': (2, 0, 4 * c),
            'Torso': (2, 0, 6 * c),
            'Chest': (2 + 2 * abs(s), -2 * c, 8 * c),  # shoulders counter the hips
            'Neck': (-8, 0, -4 * c),
            'Head': (-8 + 3 * math.cos(4 * math.pi * t), 0, -4 * c),
        },
        'feet': {
            'L': (0.13, lift_l[0], lift_l[1], lift_l[2]),
            'R': (-0.13, lift_r[0], lift_r[1], lift_r[2]),
        },
        'hands': {
            # Free arm pumps against the left leg: back when the left foot strikes.
            'L': dict(at=(0.27, -0.07 - 0.3 * -c, 1.08 + 0.1 * max(0.0, -c) + 0.03 * s),
                      elbow=(0.3, 0.9 if c > 0 else 0.5, -0.6), wrist=(0, 0, -15)),
            # Sword carried low at the side, trailing back and down, swinging a little with the stride.
            'R': dict(at=(-0.3, -0.05 + 0.13 * c, 0.98 + 0.03 * s),
                      blade=(-0.32, 0.72 + 0.1 * c, -0.45), flat=(-0.9, 0.0, 0.3), elbow=(-0.4, 0.8, -0.4)),
        },
    }
    return pose


def stance(front='L', depth=0.0, spread=1.0):
    """Feet for a fighting stance; `depth` lunges the front foot forward and the back foot back."""
    f = 0.13 * spread
    if front == 'L':
        return {'L': (f, -0.12 - depth, 0.023, 0), 'R': (-f, 0.16 + depth * 0.5, 0.023, 0)}
    return {'L': (f, 0.16 + depth * 0.5, 0.023, 0), 'R': (-f, -0.12 - depth, 0.023, 0)}


def slash_pose(yaw, lean, drop, feet, sword, left, chest_roll=0.0, head=None):
    hips_yaw = yaw * 0.55
    return {
        'body': (0.0, -lean * 0.004, -drop),
        'spine': {
            'Body': (lean * 0.4, 0, hips_yaw),
            'Hips': (0, 0, 0),
            'Abdomen': (lean * 0.2, chest_roll * 0.3, yaw * 0.15),
            'Torso': (lean * 0.2, chest_roll * 0.3, yaw * 0.15),
            'Chest': (lean * 0.2, chest_roll * 0.4, yaw * 0.15),
            'Neck': (-lean * 0.3, 0, -yaw * 0.35),
            'Head': (head if head is not None else -lean * 0.3, 0, -yaw * 0.35),
        },
        'feet': feet,
        'hands': {'R': sword, 'L': left},
    }


def sword(at, blade, flat=(0, 0, 1), elbow=(-0.3, 0.6, -0.8)):
    return dict(at=at, blade=blade, flat=flat, elbow=elbow)


def guard_left(at=(0.26, -0.18, 1.05), elbow=(0.6, 0.6, -0.6)):
    return dict(at=at, elbow=elbow, wrist=(0, 0, -10))


def author(arm):
    rig = Rig(arm)
    rig.capture_fingers(bpy.data.actions['Idle'], 0)

    # ---- Run: 20 frames (left strike 0, right strike 10)
    keys = [(f, run_pose(f / 20)) for f in range(0, 21)]
    rig.clip('Run', keys, loop=True)

    # ---- Forehand: right → left. Contact at frame 10 (blade level, straight ahead).
    neutral_feet = stance('L', 0.0)
    load_feet = {'L': (0.13, -0.04, 0.05, 18), 'R': (-0.14, 0.18, 0.023, 0)}      # left heel lifting as weight goes back
    step_feet = stance('L', 0.22, 1.15)
    keys = [
        (0, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
        (4, slash_pose(-38, -4, 0.04, load_feet,
                       sword((-0.34, 0.12, 1.42), (-0.35, 0.75, 0.55), flat=(0.4, 0.3, -0.9), elbow=(-0.5, 0.4, -0.7)),
                       guard_left((0.3, -0.32, 1.22), (0.6, 0.2, -0.7)), chest_roll=-6)),
        (6, slash_pose(-32, 0, 0.06, load_feet,
                       sword((-0.38, 0.02, 1.4), (-0.8, 0.45, 0.35), flat=(0.2, 0.2, -1), elbow=(-0.5, 0.4, -0.7)),
                       guard_left((0.3, -0.3, 1.2), (0.6, 0.2, -0.7)), chest_roll=-4)),
        (8, slash_pose(-12, 8, 0.1, step_feet,
                       sword((-0.36, -0.32, 1.32), (-0.85, -0.5, 0.05), flat=(0, 0, 1)),
                       guard_left((0.32, -0.12, 1.15), (0.6, 0.4, -0.6)))),
        (10, slash_pose(16, 14, 0.13, step_feet,
                        sword((-0.06, -0.46, 1.26), (0.15, -1, -0.04), flat=(0, 0, 1), elbow=(-0.5, 0.2, -0.8)),
                        guard_left((0.34, 0.02, 1.1), (0.5, 0.6, -0.5)), chest_roll=4)),
        (12, slash_pose(40, 16, 0.14, step_feet,
                        sword((0.22, -0.38, 1.18), (0.9, -0.25, -0.2), flat=(0, 0.2, 1), elbow=(-0.2, 0.3, -0.9)),
                        guard_left((0.36, 0.12, 1.06), (0.4, 0.8, -0.4)), chest_roll=6)),
        (15, slash_pose(48, 14, 0.13, step_feet,
                        sword((0.26, -0.26, 1.08), (0.75, 0.45, -0.45), flat=(0.3, -0.3, 1), elbow=(-0.1, 0.4, -0.9)),
                        guard_left((0.36, 0.14, 1.04), (0.4, 0.8, -0.4)), chest_roll=5)),
        # Recover: bring the blade back up and around in front (not down through the floor).
        (18, slash_pose(22, 8, 0.08, stance('L', 0.1, 1.05),
                        sword((-0.08, -0.36, 1.12), (-0.25, -0.95, 0.15), flat=(0, 0, 1), elbow=(-0.5, 0.3, -0.8)),
                        guard_left((0.32, 0.0, 1.06), (0.5, 0.6, -0.5)))),
        (22, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
    ]
    rig.clip('Slash', keys, idle_ends=True)

    # ---- Backhand: left → right. Contact at frame 10.
    load_feet = {'L': (0.14, -0.14, 0.023, 0), 'R': (-0.13, 0.12, 0.06, 20)}
    step_feet = stance('R', 0.2, 1.15)
    keys = [
        (0, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
        (4, slash_pose(40, -2, 0.04, load_feet,
                       sword((0.12, -0.12, 1.36), (0.55, 0.65, 0.5), flat=(-0.5, 0.2, -0.85), elbow=(-0.6, 0.3, -0.7)),
                       guard_left((0.34, 0.06, 1.08), (0.5, 0.6, -0.5)), chest_roll=5)),
        (6, slash_pose(34, 2, 0.06, load_feet,
                       sword((0.1, -0.22, 1.36), (0.85, 0.35, 0.3), flat=(-0.2, 0.1, -1), elbow=(-0.6, 0.3, -0.7)),
                       guard_left((0.34, 0.06, 1.08), (0.5, 0.6, -0.5)), chest_roll=4)),
        (8, slash_pose(14, 8, 0.1, step_feet,
                       sword((-0.02, -0.42, 1.3), (0.7, -0.7, 0.05), flat=(0, 0, 1), elbow=(-0.7, 0.2, -0.6)),
                       guard_left((0.3, -0.06, 1.12), (0.6, 0.4, -0.6)))),
        (10, slash_pose(-16, 12, 0.13, step_feet,
                        sword((-0.24, -0.46, 1.27), (-0.15, -1, -0.04), flat=(0, 0, 1), elbow=(-0.8, 0.1, -0.5)),
                        guard_left((0.3, -0.24, 1.18), (0.6, 0.2, -0.7)), chest_roll=-4)),
        (12, slash_pose(-40, 14, 0.14, step_feet,
                        sword((-0.42, -0.3, 1.22), (-0.95, 0.15, -0.12), flat=(0, -0.2, 1), elbow=(-0.6, 0.6, -0.5)),
                        guard_left((0.28, -0.32, 1.2), (0.6, 0.1, -0.7)), chest_roll=-6)),
        (15, slash_pose(-46, 12, 0.13, step_feet,
                        sword((-0.42, -0.18, 1.14), (-0.75, 0.55, -0.3), flat=(-0.3, -0.3, 1), elbow=(-0.5, 0.7, -0.5)),
                        guard_left((0.28, -0.3, 1.18), (0.6, 0.1, -0.7)), chest_roll=-5)),
        (22, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
    ]
    rig.clip('Slash_Back', keys, idle_ends=True)

    # ---- Heavy overhead finisher. Contact at frame 12, deep lunge.
    rise_feet = {'L': (0.13, -0.2, 0.09, 25), 'R': (-0.13, 0.12, 0.05, 15)}
    lunge_feet = stance('L', 0.36, 1.25)
    keys = [
        (0, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
        (5, slash_pose(-14, -14, -0.06, rise_feet,
                       sword((-0.16, 0.02, 1.84), (-0.1, 0.75, 0.66), flat=(1, 0, 0), elbow=(-0.8, 0.0, 0.4)),
                       guard_left((0.24, -0.26, 1.5), (0.7, 0.0, -0.5)), head=-6)),
        (8, slash_pose(-10, -16, -0.07, rise_feet,
                       sword((-0.12, -0.04, 1.86), (-0.05, 0.35, 0.94), flat=(1, 0, 0), elbow=(-0.8, 0.0, 0.4)),
                       guard_left((0.24, -0.26, 1.52), (0.7, 0.0, -0.5)), head=-8)),
        (10, slash_pose(-4, 12, 0.08, lunge_feet,
                        sword((-0.1, -0.42, 1.62), (0.02, -0.8, 0.6), flat=(1, 0, 0), elbow=(-0.8, 0.3, -0.3)),
                        guard_left((0.28, -0.12, 1.3), (0.7, 0.3, -0.5)))),
        (12, slash_pose(0, 30, 0.22, lunge_feet,
                        sword((-0.06, -0.5, 1.1), (0.04, -0.75, -0.66), flat=(1, 0, 0), elbow=(-0.7, 0.4, -0.5)),
                        guard_left((0.32, 0.06, 1.0), (0.5, 0.7, -0.4)), head=-18)),
        (15, slash_pose(0, 34, 0.25, lunge_feet,
                        sword((-0.08, -0.42, 0.92), (0.05, -0.45, -0.9), flat=(1, 0, 0), elbow=(-0.6, 0.5, -0.5)),
                        guard_left((0.32, 0.1, 0.98), (0.5, 0.7, -0.4)), head=-20)),
        (19, slash_pose(0, 30, 0.23, lunge_feet,
                        sword((-0.1, -0.4, 0.94), (0.0, -0.5, -0.86), flat=(1, 0, 0), elbow=(-0.6, 0.5, -0.5)),
                        guard_left((0.32, 0.08, 1.0), (0.5, 0.7, -0.4)), head=-16)),
        (28, slash_pose(0, 0, 0, neutral_feet, sword((-0.3, -0.16, 1.04), (-0.95, -0.2, 0.25)), guard_left())),
    ]
    rig.clip('Slash_Heavy', keys, idle_ends=True)
    return rig
