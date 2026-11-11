"""
Builds the swordsman player model — a holy knight, deliberately unlike the archer:

  body    the hero rig (hero.py: Quaternius King body) with heavier proportions (bigger pauldrons,
          broader chest), fully armoured arms, polished silver plate, royal blue cloth, gold trim
  head    a closed great helm with a glowing visor slit, gold crest band, swept wings and a blue plume
  cape    royal blue with a gold hem
  sword   a hand-modelled longsword: bevelled diamond-section blade with a glowing blue fuller,
          ricasso, curved gold quillons with finials, sapphire guard gem, gold-wired grip,
          faceted pommel with a sapphire

    Blender -b --factory-startup -P scripts/blender/build_swordsman.py -- <character.glb> <head.glb> <out.glb> [--preview <dir>]

Clips   Idle (Idle_Sword), Run, Slash (forehand), Slash_Back (the same swing reversed = backhand),
        HitRecieve, Death — the blade crosses in front ~40% into Slash (~60% into Slash_Back).
World space (Blender): +Z up, the character faces -Y, its left is +X.
"""
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index('--') + 1:]
SRC_CHAR, SRC_HEAD, OUT = argv[:3]
RENDER_DIR = argv[argv.index('--preview') + 1] if '--preview' in argv else None
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import hero  # noqa: E402

# Polished silver plate, royal blue cloth, gold trims (the archer is dark steel + crimson).
PALETTE = {
    'Metal': ((0.55, 0.57, 0.62), 0.95, 0.2),
    'Metal_Dark': ((0.2, 0.21, 0.25), 0.9, 0.28),
    'Blue': ((0.012, 0.035, 0.2), 0.0, 0.65),
    'Beige': ((0.62, 0.42, 0.1), 0.95, 0.28),
    'DarkBrown': ((0.05, 0.035, 0.025), 0.0, 0.75),
}
# Heavier than the archer: bigger pauldrons, broader chest, thicker arms.
hero.PROPORTIONS.update({
    'Chest': ('world', (1.38, 1.22, 1.06)),
    'Shoulder.L': ('uniform', 1.65),
    'Shoulder.R': ('uniform', 1.65),
    'UpperArm.L': ('radial', (1.5, 1.05)),
    'UpperArm.R': ('radial', (1.5, 1.05)),
    'LowerArm.L': ('radial', (1.4, 1.03)),
    'LowerArm.R': ('radial', (1.4, 1.03)),
})

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30


def import_glb(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]


objs = import_glb(SRC_CHAR)
arm = next(o for o in objs if o.type == 'ARMATURE')
for o in list(objs):
    if o.name in ('Sword', 'Icosphere'):
        bpy.data.objects.remove(o, do_unlink=True)
if arm.animation_data:
    arm.animation_data.action = None
hero.graft_head(arm, SRC_HEAD, import_glb)
hero.reshape(arm)
# Like hero.restyle, but the arms stay armoured (no bare biceps) and with this knight's palette.
for mat in bpy.data.materials:
    spec = PALETTE.get(mat.name.split('.')[0])
    if spec:
        hero._set_color(mat, *spec)
for o in bpy.data.objects:
    if o.type == 'MESH':
        for p in o.data.polygons:
            p.use_smooth = False

MW = arm.matrix_world
for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)
bpy.context.view_layer.update()


def head(name):
    return MW @ arm.data.bones[name].head_local


def material(name, rgb, metal=0.0, rough=0.6, emit=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = strength
    mat.diffuse_color = (*(emit or rgb), 1)
    return mat


def skinned(name, bm, mats, groups):
    """bmesh → mesh object skinned to the armature. groups: bone name → list of (vertex index, weight)."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for m in mats:
        mesh.materials.append(m)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = False
    for bone, items in groups.items():
        g = obj.vertex_groups.new(name=bone)
        for i, w in items:
            g.add([i], w, 'REPLACE')
    obj.modifiers.new('Armature', 'ARMATURE').object = arm
    return obj


def add_box(bm, size, center, mat_index, taper=1.0, frame=Matrix()):
    """Box in sword space (+Z along the blade); `taper` narrows the +Z end in X."""
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res['verts']:
        if v.co.z > 0:
            v.co.x *= taper
        v.co.x *= size[0]
        v.co.y *= size[1]
        v.co.z *= size[2]
        v.co += Vector(center)
        v.co = frame @ v.co
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mat_index


# ---------------------------------------------------------------- longsword

def tube(bm, a, b, r0, r1, segs, mat_index, frame):
    """Tapered prism from a to b (sword space), transformed into place."""
    a, b = Vector(a), Vector(b)
    axis = b - a
    res = bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r0, radius2=max(r1, 1e-4), depth=axis.length,
                                matrix=frame @ Matrix.Translation((a + b) / 2) @ axis.to_track_quat('Z', 'Y').to_matrix().to_4x4())
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mat_index


def gem(bm, center, radius, mat_index, frame, scale=(1, 1, 1)):
    res = bmesh.ops.create_icosphere(bm, subdivisions=1, radius=radius, matrix=frame @ Matrix.Translation(center) @ Matrix.Diagonal((*scale, 1)))
    for f in {f for v in res['verts'] for f in v.link_faces}:
        f.material_index = mat_index


def blade(bm, frame, base, length):
    """Bevelled blade: a 10-sided section (flat fuller face, bevelled cutting edges) tapering to a point."""
    STEEL, EDGE, FULLER = 0, 1, 2
    sections = [  # z, half width, half thickness
        (base, 0.058, 0.017), (base + 0.1, 0.055, 0.016), (base + length * 0.45, 0.049, 0.013),
        (base + length * 0.8, 0.04, 0.01), (base + length * 0.93, 0.026, 0.007),
    ]
    fuller_end = base + length * 0.62

    def ring(z, w, t):
        pts = [(w, 0), (w * 0.7, t), (w * 0.16, t), (-w * 0.16, t), (-w * 0.7, t),
               (-w, 0), (-w * 0.7, -t), (-w * 0.16, -t), (w * 0.16, -t), (w * 0.7, -t)]
        return [bm.verts.new(frame @ Vector((x, y, z))) for x, y in pts]

    rings = [ring(*sec) for sec in sections]
    tip = bm.verts.new(frame @ Vector((0, 0, base + length)))
    edge_faces = {9, 0, 4, 5}   # facets touching the cutting edges
    fuller_faces = {2, 7}       # centre strip on both faces
    for r in range(len(rings) - 1):
        lo, hi = rings[r], rings[r + 1]
        for k in range(10):
            f = bm.faces.new((lo[k], lo[(k + 1) % 10], hi[(k + 1) % 10], hi[k]))
            f.material_index = EDGE if k in edge_faces else FULLER if (k in fuller_faces and sections[r + 1][0] <= fuller_end) else STEEL
    for k in range(10):
        f = bm.faces.new((rings[-1][k], rings[-1][(k + 1) % 10], tip))
        f.material_index = EDGE if k in edge_faces else STEEL
    bm.faces.new(list(reversed(rings[0]))).material_index = STEEL


def build_sword():
    side = 'R'
    wrist, middle = head(f'Wrist.{side}'), head(f'Middle1.{side}')
    index, pinky = head(f'Index1.{side}'), head(f'Pinky1.{side}')
    # Blade axis: across the knuckles, out of the thumb side of the fist. Edge faces the fingers.
    up = (index - pinky).normalized()
    fwd = middle - wrist
    fwd = (fwd - up * fwd.dot(up)).normalized()
    side_axis = up.cross(fwd).normalized()
    grip = wrist.lerp(middle, 0.75)
    frame = Matrix((
        (fwd.x, side_axis.x, up.x, grip.x),
        (fwd.y, side_axis.y, up.y, grip.y),
        (fwd.z, side_axis.z, up.z, grip.z),
        (0, 0, 0, 1),
    ))
    mats = [
        material('Sword_Steel', (0.6, 0.62, 0.68), metal=1.0, rough=0.18),
        material('Sword_Edge', (0.92, 0.94, 1.0), metal=1.0, rough=0.08),
        material('Sword_Fuller', (0.05, 0.15, 0.5), emit=(0.25, 0.55, 1.0), strength=3.5),
        material('Sword_Gold', (0.62, 0.42, 0.1), metal=0.95, rough=0.25),
        material('Sword_Grip', (0.035, 0.02, 0.06), rough=0.8),
        material('Sword_Sapphire', (0.05, 0.1, 0.5), emit=(0.2, 0.45, 1.0), strength=5.0),
    ]
    STEEL, GOLD, GRIP, GEM = 0, 3, 4, 5
    bm = bmesh.new()
    guard = 0.045
    blade(bm, frame, guard + 0.075, 1.0)
    # ricasso (unsharpened base of the blade)
    tube(bm, (0, 0, guard + 0.02), (0, 0, guard + 0.08), 0.045, 0.043, 4, STEEL, frame @ Matrix.Rotation(math.pi / 4, 4, 'Z') @ Matrix.Diagonal((1.25, 0.45, 1, 1)))
    # crossguard: centre block + curved quillons (sweeping toward the blade) with ball finials
    tube(bm, (0, 0, guard - 0.02), (0, 0, guard + 0.025), 0.06, 0.05, 6, GOLD, frame @ Matrix.Diagonal((1.3, 0.7, 1, 1)))
    for s in (1, -1):
        # straight quillons that tip up slightly toward the blade
        pts = [(s * 0.05, 0, guard), (s * 0.13, 0, guard + 0.005), (s * 0.19, 0, guard + 0.025)]
        for (a, b), r0, r1 in zip(zip(pts, pts[1:]), (0.02, 0.017), (0.017, 0.014)):
            tube(bm, a, b, r0, r1, 6, GOLD, frame)
        gem(bm, (s * 0.2, 0, guard + 0.03), 0.022, GOLD, frame)
    for y in (1, -1):
        gem(bm, (0, y * 0.03, guard), 0.022, GEM, frame, (1, 0.6, 1.2))
    # grip: dark leather with gold wire bands; flared collar under the guard
    tube(bm, (0, 0, guard - 0.02), (0, 0, -0.2), 0.024, 0.026, 8, GRIP, frame)
    for z in (-0.03, -0.075, -0.12, -0.165):
        tube(bm, (0, 0, z - 0.006), (0, 0, z + 0.006), 0.029, 0.029, 8, GOLD, frame)
    tube(bm, (0, 0, guard - 0.045), (0, 0, guard - 0.018), 0.026, 0.036, 8, GOLD, frame)
    # faceted pommel with sapphires
    gem(bm, (0, 0, -0.245), 0.048, GOLD, frame, (1, 0.8, 1.1))
    for y in (1, -1):
        gem(bm, (0, y * 0.036, -0.245), 0.02, GEM, frame, (1, 0.5, 1))
    tube(bm, (0, 0, -0.29), (0, 0, -0.33), 0.022, 0.0, 6, GOLD, frame)
    bm.verts.index_update()
    n = len(bm.verts)
    sword = skinned('Longsword', bm, mats, {f'Wrist.{side}': [(i, 1.0) for i in range(n)]})
    print(f'sword: {n} verts on Wrist.{side}, blade axis {tuple(round(c, 2) for c in up)}')
    return sword


# ---------------------------------------------------------------- great helm

def build_helm():
    """Closed great helm fitted around the grafted head: hides the archer's face entirely."""
    head_obj = bpy.data.objects['Hero_Head']
    pts = [head_obj.matrix_world @ v.co for v in head_obj.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    c = (lo + hi) / 2
    r = (hi - lo) / 2
    steel = material('Helm_Steel', (0.6, 0.62, 0.68), metal=0.95, rough=0.18)
    gold = material('Helm_Gold', (0.62, 0.42, 0.1), metal=0.95, rough=0.25)
    visor = material('Helm_Visor', (0.05, 0.1, 0.4), emit=(0.3, 0.6, 1.0), strength=6.0)
    plume = material('Helm_Plume', (0.02, 0.05, 0.3), rough=0.8)
    STEEL, GOLD, VISOR, PLUME = 0, 1, 2, 3
    frame = Matrix.Identity(4)
    bm = bmesh.new()
    # dome
    dome = bmesh.ops.create_icosphere(bm, subdivisions=2, radius=1.0, matrix=Matrix.Translation(c + Vector((0, 0, r.z * 0.02))) @ Matrix.Diagonal((r.x * 1.2, r.y * 1.16, r.z * 1.0, 1)))
    for f in {f for v in dome['verts'] for f in v.link_faces}:
        f.material_index = STEEL
    front = c.y - r.y * 1.14
    # thin gold ridge down the face plate, a narrow visor slit glowing blue
    tube(bm, (c.x, front + 0.004, c.z - r.z * 0.6), (c.x, front + 0.004, c.z + r.z * 0.95), 0.012, 0.009, 4, GOLD, frame)
    tube(bm, (c.x - r.x * 0.7, front + r.y * 0.1, c.z + r.z * 0.12), (c.x + r.x * 0.7, front + r.y * 0.1, c.z + r.z * 0.12), 0.009, 0.009, 4, VISOR, frame)
    # small swept wings on both sides
    for s in (1, -1):
        base = Vector((c.x + s * r.x * 1.12, c.y + r.y * 0.15, c.z + r.z * 0.1))
        for k, (dy, dz, ln) in enumerate(((0.05, 0.07, 0.11), (0.07, 0.03, 0.09), (0.08, -0.01, 0.07))):
            tube(bm, base + Vector((0, 0, -k * 0.022)), base + Vector((s * 0.02, dy + ln * 0.4, dz + ln * 0.5)), 0.016 - k * 0.003, 0.001, 4, GOLD, frame)
    # plume along the crest, sweeping back
    crest = [c + Vector((0, -r.y * 0.6, r.z * 1.1)), c + Vector((0, 0, r.z * 1.3)), c + Vector((0, r.y * 0.7, r.z * 1.25)), c + Vector((0, r.y * 1.35, r.z * 0.85)), c + Vector((0, r.y * 1.6, r.z * 0.2))]
    for (a, b), rad in zip(zip(crest, crest[1:]), (0.035, 0.045, 0.04, 0.03)):
        tube(bm, a, b, rad, rad * 0.85, 6, PLUME, Matrix.Identity(4) @ Matrix.Translation((0, 0, 0)))
    tube(bm, c + Vector((0, -r.y * 0.7, r.z * 1.02)), c + Vector((0, r.y * 0.6, r.z * 1.18)), 0.022, 0.022, 4, GOLD, frame)
    bm.verts.index_update()
    n = len(bm.verts)
    helm = skinned('GreatHelm', bm, [steel, gold, visor, plume], {'Head': [(i, 1.0) for i in range(n)]})
    head_obj.hide_render = True
    bpy.data.objects.remove(head_obj, do_unlink=True)  # the helm replaces the face entirely
    print(f'helm: {n} verts')
    return helm


# ---------------------------------------------------------------- royal cape

def build_cape():
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('_Body'))
    chest, hips = head('Chest'), head('Hips')
    top_z = chest.z + 0.16
    back_y = max((body.matrix_world @ v.co).y for v in body.data.vertices if abs((body.matrix_world @ v.co).z - top_z) < 0.08)
    rows = [  # z, half width, y offset behind the back, bone weights
        (top_z, 0.2, 0.01, {'Chest': 1.0}),
        (chest.z - 0.1, 0.25, 0.05, {'Chest': 0.6, 'Hips': 0.4}),
        (hips.z - 0.05, 0.28, 0.1, {'Hips': 1.0}),
        (hips.z - 0.45, 0.31, 0.16, {'Hips': 1.0}),
        (hips.z - 0.72, 0.33, 0.2, {'Hips': 1.0}),
    ]
    cols = 6
    bm = bmesh.new()
    grid = []
    groups = {}
    for r, (z, hw, dy, weights) in enumerate(rows):
        row = []
        for c in range(cols):
            u = c / (cols - 1) * 2 - 1
            zz = z - (0.06 if r == len(rows) - 1 and c % 2 else 0)  # ragged hem
            v = bm.verts.new((u * hw, back_y + dy + (1 - u * u) * 0.04, zz))
            row.append(v)
        grid.append(row)
    for r in range(len(rows) - 1):
        for c in range(cols - 1):
            bm.faces.new((grid[r][c], grid[r][c + 1], grid[r + 1][c + 1], grid[r + 1][c]))
    bm.verts.index_update()
    for r, (_, _, _, weights) in enumerate(rows):
        for bone, w in weights.items():
            groups.setdefault(bone, []).extend((v.index, w) for v in grid[r])
    cloth = material('Cape', (0.012, 0.035, 0.22), rough=0.85)
    lining = material('Cape_Trim', (0.62, 0.42, 0.1), metal=0.9, rough=0.3)
    bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.012)
    cape = skinned('Cape', bm, [cloth, lining], groups)
    # The solidified copy has no weights yet: weight every vertex by its nearest original row.
    for v in cape.data.vertices:
        if v.groups:
            continue
        z = (cape.matrix_world @ v.co).z
        r = min(range(len(rows)), key=lambda i: abs(rows[i][0] - z))
        for bone, w in rows[r][3].items():
            cape.vertex_groups[bone].add([v.index], w, 'REPLACE')
    print(f'cape: {len(cape.data.vertices)} verts')
    return cape


build_sword()
build_helm()
build_cape()

# ---------------------------------------------------------------- clips

KEEP = {'CharacterArmature|Idle_Sword': 'Idle', 'CharacterArmature|Run': 'Run', 'CharacterArmature|Sword_Slash': 'Slash',
        'CharacterArmature|HitRecieve': 'HitRecieve', 'CharacterArmature|Death': 'Death'}
for act in list(bpy.data.actions):
    if act.name in KEEP:
        act.name = KEEP[act.name]
        act.use_fake_user = True
    else:
        bpy.data.actions.remove(act)


def fcurves_of(action):
    try:
        from bpy_extras import anim_utils
        cb = anim_utils.action_get_channelbag_for_slot(action, action.slots[0])
        return cb.fcurves
    except Exception:
        return action.fcurves


# Backhand: the forehand slash played in reverse.
back = bpy.data.actions['Slash'].copy()
back.name = 'Slash_Back'
back.use_fake_user = True
start, end = back.frame_range
for fc in fcurves_of(back):
    for kp in fc.keyframe_points:
        kp.co.x = start + end - kp.co.x
        kp.handle_left.x, kp.handle_right.x = start + end - kp.handle_right.x, start + end - kp.handle_left.x
    fc.update()
print('clips:', sorted(a.name for a in bpy.data.actions))

# ---------------------------------------------------------------- previews

if RENDER_DIR:
    os.makedirs(RENDER_DIR, exist_ok=True)
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    scene.render.resolution_x = scene.render.resolution_y = 420
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 0.95))
    for clip, frame in (('Idle', 0), ('Run', 6), ('Slash', 6), ('Slash', 10), ('Slash_Back', 10), ('Death', 24)):
        arm.animation_data_create()
        arm.animation_data.action = bpy.data.actions[clip]
        scene.frame_set(frame)
        for view, yaw, elev in (('front', 25, 10), ('back', 160, 15)):
            a, e = math.radians(yaw), math.radians(elev)
            cam.location = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * 4.6
            cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
            scene.render.filepath = os.path.join(RENDER_DIR, f'sword_{clip}_{frame:02d}_{view}.png')
            bpy.ops.render.render(write_still=True)
    arm.animation_data.action = None
    bpy.data.objects.remove(cam, do_unlink=True)

# ---------------------------------------------------------------- export (same layout as the archer)

for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)
for o in bpy.data.objects:
    if o.type == 'MESH' and o.parent == arm:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
for o in list(bpy.data.objects):
    if o.type == 'EMPTY' and o.name.endswith('_end'):
        bpy.data.objects.remove(o, do_unlink=True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
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
