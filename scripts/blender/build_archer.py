"""
Builds the archer player model: the CC0 Quaternius adventurer + a bow rig + hand-authored
archery animation, exported as one GLB.

    Blender -b --factory-startup -P scripts/blender/build_archer.py -- <character.glb> <bow.glb> <arrow.glb> <out.glb>
        [--head <glb>]       graft this character's head and build the muscular hero (see hero.py)
        [--preview <dir>]    render pose previews

What it adds
  Bones   Bow (child of Wrist.L, the grip) → BowTop / BowBottom (bending limbs), Nock (string pull point)
          Arrow (child of Nock, nocked arrow; scaled to 0 when not on the string)
  Meshes  bow (skinned to grip + limbs), bowstring (skinned to limb tips + Nock), arrow (skinned to Arrow)
  Clips   Bow_Idle    relaxed stance, bow low, breathing (loop)
          Bow_Draw    raise + draw from string to anchor under the jaw (one-shot)
          Bow_Hold    full draw, breathing / tiny tremor (loop)
          Bow_Release string snaps, follow-through, hand returns to the string with a new arrow (one-shot)
          + the source Run / HitRecieve / Death clips, patched so the bow hand grips and no arrow shows.

The source rig has tiny disconnected bones, so Blender's IK solver can't be used. Poses are
solved here with analytic two-bone IK in world space and baked to keys every frame.
World space (Blender): +Z up, character faces -Y, character's left is +X.
"""
import bpy
import math
import os
import sys
from mathutils import Matrix, Quaternion, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC_CHAR, SRC_BOW, SRC_ARROW, OUT = argv[:4]


def flag(name):
    return argv[argv.index(name) + 1] if name in argv else None


HEAD_SRC = flag('--head')
RENDER_DIR = flag('--preview')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero  # noqa: E402

FPS = 30
UP = Vector((0, 0, 1))
FWD = Vector((0, -1, 0))  # toward the target
LEFT = Vector((1, 0, 0))

T = dict(
    bow_length=0.92,          # world units (character is ~1.88 tall)
    cant=math.radians(14),    # bow tilt (top toward the archer's right)
    hip_yaw=math.radians(-48),
    spine_yaw=[math.radians(a) for a in (-8, -10, -14)],  # Abdomen, Torso, Chest
    neck_yaw=math.radians(34),
    head_yaw=math.radians(30),
    head_tilt=math.radians(-7),  # cheek toward the string
    stance=0.2,               # half distance between feet
    crouch=0.025,
    limb_bend=math.radians(13),
    reach=0.47,
    draw_back=0.11,           # release follow-through distance
)

# ---------------------------------------------------------------- scene / import

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = FPS


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


char_objs = import_glb(SRC_CHAR)
arm = next(o for o in char_objs if o.type == 'ARMATURE')
for o in list(char_objs):
    if o.name in ('Sword', 'Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
if arm.animation_data:
    arm.animation_data.action = None

if HEAD_SRC:
    hero.graft_head(arm, HEAD_SRC, import_glb)
    hero.reshape(arm)
    hero.restyle(arm)

MW = arm.matrix_world.copy()  # includes the importer's Y-up → Z-up rotation and a ×100 scale
MW_INV = MW.inverted()
MWQ = MW.to_quaternion()
MWQ_INV = MWQ.inverted()
pbones = arm.pose.bones
bones = arm.data.bones


def W(v):
    return MW @ v


def A(v):
    return MW_INV @ v


def update():
    bpy.context.view_layer.update()


def reset_pose():
    for pb in pbones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = (1, 1, 1)
    update()


reset_pose()
REST = {b.name: (W(b.head_local), MWQ @ b.matrix_local.to_quaternion()) for b in bones}
# Bow-arm reach scales with the character's actual arm length (tuned on a 0.452 arm).
ARM_LEN = (REST['LowerArm.L'][0] - REST['UpperArm.L'][0]).length + (REST['Wrist.L'][0] - REST['LowerArm.L'][0]).length
T['reach'] *= ARM_LEN / 0.452
print(f'arm length {ARM_LEN:.3f}, reach {T["reach"]:.3f}')


def head(name):
    return W(pbones[name].head)


def rot(name):
    """World rotation of a pose bone."""
    return MWQ @ pbones[name].matrix.to_quaternion()


def set_world(name, pos, q, scale=None):
    pbones[name].matrix = Matrix.LocRotScale(A(pos), MWQ_INV @ q, scale)
    update()


def rotate_world(name, q, pivot=None):
    """Pre-multiplies a world rotation onto a bone (around its head unless `pivot` given)."""
    h = head(name)
    p = h if pivot is None else pivot
    set_world(name, p + q @ (h - p), q @ rot(name))


def aim(name, current_end, target):
    h = head(name)
    a = (current_end - h).normalized()
    b = (target - h).normalized()
    rotate_world(name, a.rotation_difference(b))


def frame_from(f, t, n):
    """Rotation matrix whose columns are the given (orthonormal) world axes."""
    return Matrix((f, t, n)).transposed()


# ---------------------------------------------------------------- hand frames

def rest_hand_frame(side):
    sign = 1 if side == 'L' else -1
    w = REST[f'Wrist.{side}'][0]
    f = (REST[f'Middle1.{side}'][0] - w).normalized()
    t = REST[f'Thumb2.{side}'][0] - w
    t = (t - f * t.dot(f)).normalized()
    n = f.cross(t) * sign
    assert n.z < -0.5, f'expected palm down in rest pose, got {n}'
    return f, t, n, sign


HAND = {s: rest_hand_frame(s) for s in 'LR'}


def hand_rotation(side, f, t):
    """World rotation for Wrist.<side> so fingers point along f and the thumb side along t."""
    f0, t0, n0, sign = HAND[side]
    f = f.normalized()
    t = (t - f * t.dot(f)).normalized()
    n = f.cross(t) * sign
    delta = frame_from(f, t, n) @ frame_from(f0, t0, n0).transposed()
    return delta.to_quaternion() @ REST[f'Wrist.{side}'][1]


FINGERS = ['Index', 'Middle', 'Ring', 'Pinky']


def curl_fingers(side, amounts, thumb=0.0):
    """amounts: per-joint curl in radians for [joint1, joint2, joint3] of each finger."""
    q = rot(f'Wrist.{side}') @ REST[f'Wrist.{side}'][1].inverted()
    f0, t0, n0, _ = HAND[side]
    f, n = q @ f0, q @ n0
    axis = f.cross(n).normalized()
    for finger in FINGERS:
        for j, amount in enumerate(amounts, start=1):
            name = f'{finger}{j}.{side}'
            if name in pbones and amount:
                rotate_world(name, Quaternion(axis, amount))
    if thumb:
        t = q @ t0
        thumb_axis = t.cross(n).normalized()  # rotates the thumb toward the palm
        for j in (1, 2):
            rotate_world(f'Thumb{j}.{side}', Quaternion(thumb_axis, thumb * (0.6 if j == 1 else 1)))


# ---------------------------------------------------------------- IK

def two_bone(upper, lower, end_point_fn, target, pole):
    s, e = head(upper), head(lower)
    a = (e - s).length
    b = (end_point_fn() - e).length
    d = target - s
    dist = min(max(d.length, abs(a - b) + 1e-4), (a + b) * 0.999)
    dirv = d.normalized()
    bend = pole - dirv * pole.dot(dirv)
    bend = bend.normalized() if bend.length > 1e-6 else Vector((0, 0, -1))
    cos_a = max(-1, min(1, (a * a + dist * dist - b * b) / (2 * a * dist)))
    elbow = s + dirv * (a * cos_a) + bend * (a * math.sqrt(1 - cos_a * cos_a))
    aim(upper, head(lower), elbow)
    aim(lower, end_point_fn(), s + dirv * dist)


def arm_ik(side, wrist_target, pole):
    two_bone(f'UpperArm.{side}', f'LowerArm.{side}', lambda: head(f'Wrist.{side}'), wrist_target, pole)


FOOT_IN_LOWER = {}
for s in 'LR':
    lower = bones[f'LowerLeg.{s}']
    FOOT_IN_LOWER[s] = lower.matrix_local.inverted() @ bones[f'Foot.{s}'].head_local


def ankle(side):
    return W(pbones[f'LowerLeg.{side}'].matrix @ FOOT_IN_LOWER[side])


def leg_ik(side, foot_pos, yaw, pole):
    two_bone(f'UpperLeg.{side}', f'LowerLeg.{side}', lambda: ankle(side), foot_pos, pole)
    set_world(f'Foot.{side}', foot_pos, Quaternion(UP, yaw) @ REST[f'Foot.{side}'][1])


# ---------------------------------------------------------------- bow / string / arrow

def join_meshes(objs, name):
    meshes = [o for o in objs if o.type == 'MESH']
    for o in meshes:
        o.parent = None
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    for o in objs:
        if o.name in bpy.data.objects and o != obj and o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)
    return obj


def bbox(obj, verts=None):
    vs = [obj.matrix_world @ v.co for v in (verts or obj.data.vertices)]
    lo = Vector((min(v.x for v in vs), min(v.y for v in vs), min(v.z for v in vs)))
    hi = Vector((max(v.x for v in vs), max(v.y for v in vs), max(v.z for v in vs)))
    return lo, hi


bow_objs = import_glb(SRC_BOW)
bow = join_meshes(bow_objs, 'BowMesh')


def mat_indices(obj, prefix):
    # Imported material names get ".001" suffixes when the character already uses the name.
    return [i for i, m in enumerate(obj.data.materials) if m and m.name.split('.')[0] == prefix]


def verts_with(obj, mats):
    ids = set()
    for p in obj.data.polygons:
        if p.material_index in mats:
            ids.update(p.vertices)
    return [obj.data.vertices[i] for i in ids]


white = mat_indices(bow, 'White')        # the built-in straight string
grip_mats = mat_indices(bow, 'LightWood')  # leather/light wood grip wrap
assert white and grip_mats, [m.name for m in bow.data.materials]
s_lo, s_hi = bbox(bow, verts_with(bow, white))
g_lo, g_hi = bbox(bow, verts_with(bow, grip_mats))
b_lo, b_hi = bbox(bow)
size = b_hi - b_lo
long_axis = max(range(3), key=lambda i: size[i])
string_mid = (s_lo + s_hi) / 2
grip_mid = (g_lo + g_hi) / 2
across = string_mid - grip_mid
across[long_axis] = 0

# Delete the string faces; we build a bendable one.
import bmesh
bm = bmesh.new()
bm.from_mesh(bow.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in white], context='FACES')
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
bm.to_mesh(bow.data)
bm.free()

# Bow space: grip at origin, +Y = long axis (up), +Z = belly (toward the target), string on -Z.
Ly = Vector((0, 0, 0)); Ly[long_axis] = 1
Lz = -across.normalized()
Lx = Ly.cross(Lz).normalized()
src_frame = Matrix((Lx, Ly, Lz)).transposed()
scale = T['bow_length'] / size[long_axis]
bow.data.transform(Matrix.Diagonal((scale, scale, scale)).to_4x4() @ src_frame.transposed().to_4x4() @ Matrix.Translation(-grip_mid))
bow.matrix_world = Matrix.Identity(4)
string_depth = across.length * scale
tip_y = (s_hi - s_lo)[long_axis] * scale / 2
TIP_TOP = Vector((0, tip_y, -string_depth))
TIP_BOTTOM = Vector((0, -tip_y, -string_depth))
STRING_REST = Vector((0, 0, -string_depth))
print(f'bow: string depth {string_depth:.3f}, tip {tip_y:.3f}')

arrow_objs = import_glb(SRC_ARROW)
arrow = join_meshes(arrow_objs, 'ArrowMesh')
a_lo, a_hi = bbox(arrow)
a_size = a_hi - a_lo
a_axis = max(range(3), key=lambda i: a_size[i])
# Which end is the tip? The steel head material sits at the tip.
steel_vs = verts_with(arrow, mat_indices(arrow, 'Steel'))
tip_sign = 1
if steel_vs:
    st_lo, st_hi = bbox(arrow, steel_vs)
    tip_sign = 1 if (st_lo + st_hi)[a_axis] / 2 > (a_lo + a_hi)[a_axis] / 2 else -1
ARROW_LEN = 0.78
a_scale = ARROW_LEN / a_size[a_axis]
ay = Vector((0, 0, 0)); ay[a_axis] = tip_sign
ax = Vector((0, 0, 0)); ax[(a_axis + 1) % 3] = 1
az = ax.cross(ay)
arrow_frame = Matrix((ax, ay, az)).transposed()
tail = (a_lo + a_hi) / 2
tail[a_axis] = a_lo[a_axis] if tip_sign > 0 else a_hi[a_axis]
arrow.data.transform(Matrix.Diagonal((a_scale,) * 3).to_4x4() @ arrow_frame.transposed().to_4x4() @ Matrix.Translation(-tail))
arrow.matrix_world = Matrix.Identity(4)
# Arrow space: tail (nock end) at origin, tip along +Y.

if HEAD_SRC:
    hero.add_quiver(arm, arrow, head)

# ---------------------------------------------------------------- aim geometry

def bow_axes(cant=T['cant'], fwd=FWD):
    """Bow frame at aim: Y = up (canted), Z = toward the target (belly; the string is on -Z), X = Y × Z."""
    up = Quaternion(fwd, -cant) @ UP
    z = fwd
    x = up.cross(z).normalized()
    up = z.cross(x).normalized()
    return x, up, z


def bow_hand_frame(bx, by, bz):
    """Bow hand: fingers forward and slightly inward around the grip, thumb up, palm inward."""
    fwd = bz
    right = -bx
    f = (fwd + right * 0.35).normalized()
    return f, by


def grip_from_wrist(side_frame_q):
    """Where the bow grip sits relative to the left wrist, in world space for a given wrist rotation."""
    f0, t0, n0, _ = HAND['L']
    q = side_frame_q @ REST['Wrist.L'][1].inverted()
    return q @ f0 * 0.062 + q @ n0 * 0.022


# The Bow bone is a child of Wrist.L, so its rest transform is the grip relation measured at aim.
bx, by, bz = bow_axes()
hf, ht = bow_hand_frame(bx, by, bz)
q_hand_aim = hand_rotation('L', hf, ht)
wrist_rest_pos, wrist_rest_q = REST['Wrist.L']
bow_rot_aim = frame_from(bx, by, bz).to_quaternion()
# Relative (wrist → bow) rotation & offset, then applied to the wrist's rest pose.
rel_q = q_hand_aim.inverted() @ bow_rot_aim
rel_p = q_hand_aim.inverted() @ grip_from_wrist(q_hand_aim)
bow_rest_q = wrist_rest_q @ rel_q
bow_rest_p = wrist_rest_pos + wrist_rest_q @ rel_p


def add_bone(eb_name, parent, world_pos, world_q, length=0.0004):
    eb = arm.data.edit_bones.new(eb_name)
    eb.head = (0, 0, 0)
    eb.tail = (0, length, 0)
    eb.matrix = Matrix.LocRotScale(A(world_pos), MWQ_INV @ world_q, None)
    eb.parent = arm.data.edit_bones[parent]
    eb.use_connect = False
    eb.use_deform = True
    return eb


def bow_point(p):
    return bow_rest_p + bow_rest_q @ p


bpy.ops.object.select_all(action='DESELECT')
bpy.context.view_layer.objects.active = arm
arm.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
add_bone('Bow', 'Wrist.L', bow_rest_p, bow_rest_q)
limb_root = 0.1 * T['bow_length']
add_bone('BowTop', 'Bow', bow_point(Vector((0, limb_root, 0))), bow_rest_q)
add_bone('BowBottom', 'Bow', bow_point(Vector((0, -limb_root, 0))), bow_rest_q)
add_bone('Nock', 'Bow', bow_point(STRING_REST), bow_rest_q)
# Arrow: Y along the shot (toward the belly, -Z of bow space).
arrow_rest_q = bow_rest_q @ Quaternion(Vector((1, 0, 0)), math.radians(90))
add_bone('Arrow', 'Nock', bow_point(STRING_REST), arrow_rest_q)
bpy.ops.object.mode_set(mode='OBJECT')
reset_pose()
for name in ('Bow', 'BowTop', 'BowBottom', 'Nock', 'Arrow'):
    pbones[name].rotation_mode = 'QUATERNION'
REST.update({b.name: (W(b.head_local), MWQ @ b.matrix_local.to_quaternion()) for b in bones if b.name in ('Bow', 'BowTop', 'BowBottom', 'Nock', 'Arrow')})


def skin(obj, groups_fn, local_to_world):
    obj.data.transform(local_to_world)
    obj.matrix_world = Matrix.Identity(4)
    names = set()
    weights = []
    for v in obj.data.vertices:
        g = groups_fn(v)
        weights.append(g)
        names.update(g)
    for n in names:
        obj.vertex_groups.new(name=n)
    for v, g in zip(obj.data.vertices, weights):
        for n, w in g.items():
            if w > 0:
                obj.vertex_groups[n].add([v.index], w, 'REPLACE')
    # Unparented + Armature modifier: exported as a root-level skinned mesh (like the source meshes).
    obj.parent = None
    mod = obj.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm


def smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


bow_world = Matrix.LocRotScale(bow_rest_p, bow_rest_q, None)


def bow_weights(v):
    y = v.co.y / (T['bow_length'] / 2)
    top = smooth(0.12, 0.42, y)
    bottom = smooth(0.12, 0.42, -y)
    return {'Bow': 1 - top - bottom, 'BowTop': top, 'BowBottom': bottom}


skin(bow, bow_weights, bow_world)

# Bowstring: two thin hexagonal tubes top tip → nock → bottom tip.
mesh = bpy.data.meshes.new('BowString')
verts, faces, groups = [], [], []
SEG = 6
R = 0.0055
pts = [(TIP_TOP, 'BowTop'), (STRING_REST, 'Nock'), (TIP_BOTTOM, 'BowBottom')]
for p, g in pts:
    for i in range(SEG):
        a = 2 * math.pi * i / SEG
        verts.append(p + Vector((math.cos(a) * R, 0, math.sin(a) * R)))
        groups.append(g)
for ring in range(2):
    for i in range(SEG):
        a0, a1 = ring * SEG + i, ring * SEG + (i + 1) % SEG
        faces.append((a0, a1, a1 + SEG, a0 + SEG))
mesh.from_pydata([tuple(v) for v in verts], [], faces)
string_obj = bpy.data.objects.new('BowString', mesh)
scene.collection.objects.link(string_obj)
mat = bpy.data.materials.new('Bowstring')
mat.diffuse_color = (0.86, 0.80, 0.66, 1)
bsdf = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
if bsdf:
    bsdf.inputs['Base Color'].default_value = (0.86, 0.80, 0.66, 1)
    bsdf.inputs['Roughness'].default_value = 0.6
string_obj.data.materials.append(mat)
skin(string_obj, lambda v: {groups[v.index]: 1.0}, bow_world)

skin(arrow, lambda v: {'Arrow': 1.0}, Matrix.LocRotScale(bow_point(STRING_REST), arrow_rest_q, None))

# ---------------------------------------------------------------- pose solver

def ease(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def ease_out(t):
    t = max(0.0, min(1.0, t))
    return 1 - (1 - t) ** 3


def lerp(a, b, t):
    return a + (b - a) * t


def pose(p):
    """
    p: twist 0..1, raise 0..1 (bow low → aimed), nocked 0..1 (draw hand on string),
       draw 0..1, release 0..1 (follow-through), open 0..1 (draw fingers open),
       arrow 0..1, breath -1..1, sway -1..1
    """
    reset_pose()
    tw = p['twist']
    # Pelvis: turn sideways, settle into the stance.
    body = 'Body'
    rotate_world(body, Quaternion(UP, T['hip_yaw'] * tw))
    set_world(body, head(body) + Vector((0, 0, -T['crouch'] * tw + 0.004 * p['breath'])), rot(body))
    # Spine twist + breathing (chest lifts / shoulders open).
    for name, yaw in zip(('Abdomen', 'Torso', 'Chest'), T['spine_yaw']):
        rotate_world(name, Quaternion(UP, yaw * tw))
    chest_right = (rot('Chest') @ REST['Chest'][1].inverted()) @ LEFT
    rotate_world('Chest', Quaternion(chest_right, math.radians(-1.2) * p['breath'] - math.radians(3) * p['draw'] * tw))
    rotate_world('Abdomen', Quaternion(UP, math.radians(1.5) * p['sway']))

    # Head looks down the shot line.
    rotate_world('Neck', Quaternion(UP, T['neck_yaw'] * tw))
    rotate_world('Head', Quaternion(UP, T['head_yaw'] * tw))
    head_fwd = (rot('Head') @ REST['Head'][1].inverted()) @ FWD
    rotate_world('Head', Quaternion(head_fwd, T['head_tilt'] * p['raise'] * tw))

    # Legs: feet planted across the shot line.
    hip_yaw = T['hip_yaw'] * tw
    side = Quaternion(UP, hip_yaw) @ LEFT
    toe = Quaternion(UP, hip_yaw) @ FWD
    width = lerp(0.11, T['stance'], tw)
    for s, sign in (('L', 1), ('R', -1)):
        rest_foot = REST[f'Foot.{s}'][0]
        foot = Vector((0, -0.02, rest_foot.z)) + side * width * sign
        out = Quaternion(UP, math.radians(12) * sign)
        leg_ik(s, foot, hip_yaw + math.radians(-14 if s == 'L' else 10) * tw, toe + side * sign * 0.35 + Vector((0, 0, 0)))

    # Bow hand.
    bx, by, bz = bow_axes()
    shoulder_l = head('UpperArm.L')
    aim_grip = shoulder_l + FWD * T['reach'] + UP * -0.015 + (-bx) * 0.02
    aim_q = hand_rotation('L', *bow_hand_frame(bx, by, bz))
    # Low/ready: bow tipped forward and down in front of the hips.
    hip = head('Hips')
    low_grip = hip + FWD * 0.2 + side * 0.12 + UP * 0.04
    pitch = Quaternion(Quaternion(UP, hip_yaw) @ -LEFT, math.radians(-62))
    low_q = pitch @ hand_rotation('L', *bow_hand_frame(*[Quaternion(UP, hip_yaw * 0.6) @ v for v in (bx, by, bz)]))
    r = p['raise']
    follow = p['release']
    grip = aim_grip.lerp(low_grip, 1 - r) + FWD * 0.03 * follow + UP * -0.03 * follow
    hand_q = low_q.slerp(aim_q, r)
    hand_q = Quaternion(FWD, math.radians(-10) * follow) @ hand_q  # bow rolls after the shot
    wrist_l = grip - grip_from_wrist(hand_q)
    arm_ik('L', wrist_l, Vector((0.8, 0.25, -0.6)))
    set_world('Wrist.L', head('Wrist.L'), hand_q)
    curl_fingers('L', [math.radians(70), math.radians(80), math.radians(55)], thumb=math.radians(25))

    # Bow limbs bend with the draw.
    bend = T['limb_bend'] * p['draw'] * p['nocked']
    # Limbs flex toward the archer (-Z in bow space).
    pbones['BowTop'].rotation_quaternion = Quaternion(Vector((1, 0, 0)), -bend)
    pbones['BowBottom'].rotation_quaternion = Quaternion(Vector((1, 0, 0)), bend)
    update()

    # Draw hand / string.
    bow_q = rot('Bow')
    bow_m = Matrix.LocRotScale(head('Bow'), bow_q, None)
    def bow_to_world(v):
        return bow_m @ v
    string_rest = bow_to_world(STRING_REST)
    bow_grip = bow_to_world(Vector((0, 0, 0)))
    head_q = rot('Head') @ REST['Head'][1].inverted()
    hfwd, hright = head_q @ FWD, head_q @ -LEFT
    anchor = head('Head') + hfwd * 0.115 + UP * -0.045 + hright * 0.03
    nock = string_rest.lerp(anchor, ease(p['draw']))
    line = (bow_grip - nock).normalized()

    # Hand on the string (fingers hook it), or hanging relaxed by the hip.
    on_string_f = line
    hook = nock - line * 0.055 + UP * -0.012
    snap = -line * T['draw_back'] * follow + hright * 0.05 * follow + UP * 0.02 * follow
    relaxed = head('UpperArm.R') + UP * -0.43 + (Quaternion(UP, hip_yaw) @ FWD) * 0.06 + (Quaternion(UP, hip_yaw) @ -LEFT) * 0.04
    n = p['nocked']
    wrist_r = relaxed.lerp(hook + snap, n)
    hand_q_r = hand_rotation('R', -UP, Quaternion(UP, hip_yaw) @ FWD).slerp(hand_rotation('R', on_string_f, UP), n)
    arm_ik('R', wrist_r, Vector((0, 0, 0)) + -line * 1.0 + hright * 0.6 + UP * 0.25)
    set_world('Wrist.R', head('Wrist.R'), hand_q_r)
    hook_amt = (1 - p['open']) * n
    curl_fingers('R', [math.radians(a) * hook_amt + math.radians(b) * (1 - hook_amt) for a, b in ((20, 12), (75, 18), (60, 12))],
                 thumb=math.radians(35) * hook_amt)

    # String nock follows the fingers while held; snaps back on release.
    held = n * (1 - min(1, follow * 4)) if follow > 0 else n
    nock_world = string_rest.lerp(nock, held if p['draw'] > 0 else 0)
    set_world('Nock', nock_world, bow_q)
    # Arrow rides the nock and points at the grip.
    a_dir = (bow_grip - nock_world).normalized()
    arrow_q = Vector((0, 1, 0)).rotation_difference(bow_q.inverted() @ a_dir)
    vis = p['arrow']
    set_world('Arrow', nock_world, bow_q @ arrow_q, Vector((max(vis, 1e-4),) * 3))


# ---------------------------------------------------------------- clips


def snapshot():
    return {pb.name: (pb.location.copy(), pb.rotation_quaternion.copy(), pb.scale.copy()) for pb in pbones}


def write_action(name, frames):
    """Keys a list of pose snapshots. Poses are solved with no action assigned so
    animation evaluation can't overwrite them mid-solve."""
    action = bpy.data.actions.new(name)
    arm.animation_data_create()
    arm.animation_data.action = action
    prev = {}
    for i, snap in enumerate(frames):
        for bname, (loc, q, scl) in snap.items():
            if bname in prev and prev[bname].dot(q) < 0:
                q = -q  # keep quaternion hemisphere continuous for clean interpolation
            prev[bname] = q
            pb = pbones[bname]
            pb.location, pb.rotation_quaternion, pb.scale = loc, q, scl
            pb.keyframe_insert('location', frame=i)
            pb.keyframe_insert('rotation_quaternion', frame=i)
            pb.keyframe_insert('scale', frame=i)
    action.use_fake_user = True
    arm.animation_data.action = None
    return action


def make_clip(name, frames, fn, loop=False):
    snaps = []
    for i in range(frames + 1):
        pose(fn(0.0 if loop and i == frames else i / frames))
        snaps.append(snapshot())
    print(f'clip {name}: {frames / FPS:.2f}s')
    return write_action(name, snaps)


def P(**kw):
    base = dict(twist=1, raise_=1, nocked=1, draw=0, release=0, open=0, arrow=1, breath=0, sway=0)
    base.update(kw)
    base['raise'] = base.pop('raise_')
    return base


READY = dict(twist=0.85, raise_=0.82, nocked=1, draw=0, arrow=1)  # end of release == start of draw

make_clip('Bow_Idle', 60, lambda t: P(twist=0.25, raise_=0, nocked=0, arrow=0, breath=math.sin(t * 2 * math.pi), sway=math.sin(t * 2 * math.pi + 1)), loop=True)
make_clip('Bow_Draw', 15, lambda t: P(twist=lerp(0.85, 1, ease(t)), raise_=lerp(0.82, 1, ease_out(t * 1.4)), draw=ease(t), breath=lerp(0, 0.6, t)))
make_clip('Bow_Hold', 36, lambda t: P(draw=1, breath=0.6 * math.cos(t * 2 * math.pi), sway=0.4 * math.sin(t * 4 * math.pi)), loop=True)


def release(t):
    f = t * 14  # frames
    snap = ease_out(f / 2.5)                    # 0 → 1 in ~2.5 frames
    back = 1 - ease((f - 4) / 9)                # follow-through relaxes from frame 4
    follow = snap * back
    recover = ease((f - 4) / 10)
    p = P(draw=1 - recover, release=follow, open=1 - ease((f - 8) / 5),
          twist=lerp(1, READY['twist'], recover), raise_=lerp(1, READY['raise_'], recover),
          arrow=0 if f < 9 else ease((f - 9) / 2), breath=0.6 * (1 - recover))
    if f < 1:
        p['release'] = 0
        p['arrow'] = 1
    return p


make_clip('Bow_Release', 14, release)

# ---------------------------------------------------------------- patch the source clips

KEEP = {'CharacterArmature|Run': 'Run', 'CharacterArmature|HitRecieve': 'HitRecieve', 'CharacterArmature|Death': 'Death'}
for act in list(bpy.data.actions):
    if act.name in KEEP:
        act.name = KEEP[act.name]
        act.use_fake_user = True
    elif not act.name.startswith('Bow_'):
        bpy.data.actions.remove(act)


def fist_local(side, amounts):
    """Constant local finger rotations for a fist, valid for any wrist pose."""
    f0, t0, n0, _ = HAND[side]
    axis_world = f0.cross(n0).normalized()
    out = {}
    for finger in FINGERS:
        for j, amount in enumerate(amounts, start=1):
            name = f'{finger}{j}.{side}'
            if name in REST:
                local_axis = REST[name][1].inverted() @ axis_world
                out[name] = Quaternion(local_axis, amount)
    return out


def fcurves_of(action):
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(action, action.slots[0])
        return cb.fcurves
    except Exception:
        return action.fcurves


FIST = fist_local('L', [math.radians(70), math.radians(80), math.radians(55)])
for name in KEEP.values():
    act = bpy.data.actions[name]
    arm.animation_data.action = act
    start, end = (int(v) for v in act.frame_range)
    # Drop the clip's own finger curves, then key a constant fist.
    curves = fcurves_of(act)
    for fc in list(curves):
        if any(f'"{b}"' in fc.data_path for b in FIST):
            curves.remove(fc)
    for frame in (start, end):
        reset_pose()
        bpy.context.scene.frame_set(frame)
        for bone_name, q in FIST.items():
            pbones[bone_name].rotation_quaternion = q
            pbones[bone_name].keyframe_insert('rotation_quaternion', frame=frame)
        pbones['Arrow'].scale = (1e-4, 1e-4, 1e-4)
        pbones['Arrow'].keyframe_insert('scale', frame=frame)
        for b in ('Bow', 'BowTop', 'BowBottom', 'Nock'):
            pbones[b].rotation_quaternion = (1, 0, 0, 0)
            pbones[b].location = (0, 0, 0)
            pbones[b].keyframe_insert('rotation_quaternion', frame=frame)
            pbones[b].keyframe_insert('location', frame=frame)
    arm.animation_data.action = None

# ---------------------------------------------------------------- previews

if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.render.resolution_x = 360
    scene.render.resolution_y = 420
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = bpy.data.objects.new('cam', cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    views = {
        'front': (Vector((0, -3.4, 1.2)), Vector((0, 0, 1.15))),
        'side': (Vector((3.4, -0.3, 1.25)), Vector((0, -0.25, 1.15))),
        'top': (Vector((0, 1.6, 4.0)), Vector((0, -0.2, 0.9))),
        'back': (Vector((-1.8, 2.8, 1.6)), Vector((0, -0.2, 1.2))),
        'close': (Vector((1.5, -1.3, 1.7)), Vector((0, -0.2, 1.4))),
        'game': (Vector((0, 6.0, 9.5)), Vector((0, 0, 0.8))),
        'bigfront': (Vector((0.3, -2.2, 1.5)), Vector((0, 0, 1.3))),
        'bigback': (Vector((-0.3, 2.2, 1.5)), Vector((0, 0, 1.3))),
        'bowhand': (Vector((0.45, -0.95, 1.55)), Vector((0.0, -0.5, 1.42))),
        'drawhand': (Vector((0.55, -0.55, 1.7)), Vector((-0.04, -0.12, 1.52))),
    }
    shots = [(a, f) for a, fs in (('Bow_Idle', [0]), ('Bow_Draw', [0, 8, 15]), ('Bow_Hold', [0]), ('Bow_Release', [1, 3, 8, 14]), ('Run', [4])) for f in fs]
    only = os.environ.get('SHOTS')
    for act_name, frame in shots:
        if only and act_name not in only.split(','):
            continue
        arm.animation_data.action = bpy.data.actions[act_name]
        scene.frame_set(frame)
        for view, (loc, target) in views.items():
            if os.environ.get('VIEWS') and view not in os.environ['VIEWS'].split(','):
                continue
            cam.location = loc
            cam.rotation_euler = (target - loc).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(RENDER_DIR, f'{act_name}_{frame:02d}_{view}.png')
            bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None

# ---------------------------------------------------------------- export

reset_pose()
# Source meshes are children of the ×100 armature object; unparent them (keeping their world
# transform) so every skinned mesh exports at the scene root with correct static bounds.
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type == 'EMPTY' and o.name.endswith('_end'):
        bpy.data.objects.remove(o, do_unlink=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
# Editable copy for opening in Blender (Action Editor → Bow_* clips).
arm.animation_data.action = bpy.data.actions['Bow_Hold']
bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(OUT)[0].replace('.raw', '') + '.blend', compress=True)
arm.animation_data.action = None
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format='GLB',
    export_animations=True,
    export_animation_mode='ACTIONS',
    export_force_sampling=True,
    export_frame_step=1,
    export_def_bones=False,
    export_anim_single_armature=True,
    export_yup=True,
    export_apply=False,
)
print('exported', OUT)
