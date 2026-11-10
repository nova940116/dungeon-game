"""
Hero character stage for build_archer.py: turns two CC0 Quaternius characters that share the
same 62-bone rig into one muscular, angular archer.

  body  King (plate armour: pauldrons, breastplate, greaves) — crown/head removed
  head  Adventurer (dark hair, beard)
  then  heroic proportions (broad shoulders, thick arms/neck, V-taper, smaller head),
        dark steel + crimson palette, flat shading, and a quiver on the back.

Proportions are made by scaling pose bones, baking the deformation into the meshes and applying
the pose as the new rest pose — so every existing animation keeps working on the new body.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

# Per-bone scale. 'radial' scales across the bone (thickness) and along it (length);
# 'world' scales along world X (width), Y (depth), Z (height).
PROPORTIONS = {
    'Chest': ('world', (1.3, 1.18, 1.05)),
    'Torso': ('world', (1.16, 1.12, 1.0)),
    'Abdomen': ('world', (0.93, 1.0, 1.0)),
    'Hips': ('world', (0.97, 1.0, 1.0)),
    'Shoulder.L': ('uniform', 1.42),
    'Shoulder.R': ('uniform', 1.42),
    'UpperArm.L': ('radial', (1.45, 1.05)),
    'UpperArm.R': ('radial', (1.45, 1.05)),
    'LowerArm.L': ('radial', (1.32, 1.03)),
    'LowerArm.R': ('radial', (1.32, 1.03)),
    'Wrist.L': ('uniform', 1.15),
    'Wrist.R': ('uniform', 1.15),
    'Neck': ('radial', (1.5, 0.95)),
    'Head': ('uniform', 0.86),
    'UpperLeg.L': ('radial', (1.22, 1.04)),
    'UpperLeg.R': ('radial', (1.22, 1.04)),
    'LowerLeg.L': ('radial', (1.16, 1.03)),
    'LowerLeg.R': ('radial', (1.16, 1.03)),
}

# Material name (before any ".001" suffix) → (base colour (linear), metallic, roughness)
PALETTE = {
    'Metal': ((0.15, 0.155, 0.17), 0.7, 0.36),
    'Metal_Dark': ((0.04, 0.04, 0.046), 0.55, 0.45),
    'Blue': ((0.32, 0.03, 0.035), 0.0, 0.75),      # tunic → crimson (reads from the top-down camera)
    'Beige': ((0.17, 0.095, 0.045), 0.0, 0.7),     # trims → tan leather
    'DarkBrown': ((0.045, 0.028, 0.018), 0.0, 0.75),
}


def _base(name):
    return name.split('.')[0]


def _set_color(mat, rgb, metallic, roughness):
    mat.diffuse_color = (*rgb, 1)
    bsdf = mat.node_tree.nodes.get('Principled BSDF') if mat.node_tree else None
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Metallic'].default_value = metallic
        bsdf.inputs['Roughness'].default_value = roughness


def _new_material(name, rgb, metallic=0.0, roughness=0.7):
    mat = bpy.data.materials.new(name)
    _set_color(mat, rgb, metallic, roughness)
    return mat


def _face_dir(mesh, pivot):
    """Horizontal direction from the head pivot to the eyes (where the face points)."""
    eye = [i for i, m in enumerate(mesh.data.materials) if m and m.name.split('.')[0] == 'Eye']
    ids = {v for p in mesh.data.polygons if p.material_index in eye for v in p.vertices}
    pts = [mesh.matrix_world @ mesh.data.vertices[i].co for i in ids]
    c = sum(pts, Vector()) / len(pts)
    d = c - pivot
    d.z = 0
    return d.normalized()


def graft_head(arm, head_glb, import_glb):
    """Replaces the body's head mesh with the head mesh of another character on the same rig."""
    pivot = arm.matrix_world @ arm.data.bones['Head'].head_local
    old = [o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('_Head') and o.parent == arm]
    facing = _face_dir(old[0], pivot) if old else Vector((0, -1, 0))
    for o in old:
        bpy.data.objects.remove(o, do_unlink=True)
    before_actions = set(bpy.data.actions)
    objs = import_glb(head_glb)
    src = next(o for o in objs if o.type == 'ARMATURE')
    head = next(o for o in objs if o.type == 'MESH' and o.name.endswith('_Head'))
    delta = (arm.matrix_world @ arm.data.bones['Head'].head_local) - (src.matrix_world @ src.data.bones['Head'].head_local)
    world = head.matrix_world.copy()
    head.parent = arm
    head.matrix_world = Matrix.Translation(delta) @ world
    # Source files don't all share an orientation: turn the head to face where the old one did.
    turn = _face_dir(head, pivot).to_track_quat('Y', 'Z').rotation_difference(facing.to_track_quat('Y', 'Z'))
    yaw = turn.to_euler().z
    if abs(yaw) > math.radians(5):
        head.matrix_world = Matrix.Translation(pivot) @ Matrix.Rotation(yaw, 4, 'Z') @ Matrix.Translation(-pivot) @ head.matrix_world
        print(f'hero: turned grafted head by {math.degrees(yaw):.0f}°')
    for m in head.modifiers:
        if m.type == 'ARMATURE':
            m.object = arm
    for o in objs:
        if o != head and o.name in bpy.data.objects:
            bpy.data.objects.remove(o, do_unlink=True)
    for a in set(bpy.data.actions) - before_actions:
        bpy.data.actions.remove(a)
    head.name = 'Hero_Head'
    return head


def _bone_scale(arm, name, spec):
    """Converts a PROPORTIONS entry into a pose-bone scale vector (bone-local axes)."""
    kind, f = spec
    if kind == 'uniform':
        return Vector((f, f, f))
    if kind == 'radial':
        r, length = f
        return Vector((r, length, r))
    rot = (arm.matrix_world.to_quaternion() @ arm.data.bones[name].matrix_local.to_quaternion())
    out = []
    for axis in (Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))):
        d = rot @ axis
        w = Vector((abs(d.x), abs(d.y), abs(d.z)))
        out.append(sum(w[i] * f[i] for i in range(3)) / sum(w))
    return Vector(out)


def reshape(arm):
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' and m.object == arm for m in o.modifiers)]
    # Children must not inherit the parent's scale (so a wide chest doesn't mean a giant head),
    # but their joints still move with it (wider chest → shoulders further apart).
    saved = {b.name: b.inherit_scale for b in arm.data.bones}
    for b in arm.data.bones:
        b.inherit_scale = 'NONE'
    for pb in arm.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.scale = _bone_scale(arm, pb.name, PROPORTIONS[pb.name]) if pb.name in PROPORTIONS else (1, 1, 1)
    bpy.context.view_layer.update()

    # Bake the deformation into the meshes, then make this pose the rest pose.
    for o in meshes:
        bpy.ops.object.select_all(action='DESELECT')
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        mod = next(m for m in o.modifiers if m.type == 'ARMATURE')
        bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.ops.object.select_all(action='DESELECT')
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for b in arm.data.bones:
        b.inherit_scale = saved[b.name]
    for o in meshes:
        mod = o.modifiers.new('Armature', 'ARMATURE')
        mod.object = arm


def bare_arms(arm):
    """Sleeve faces driven by the upper arms become skin: bare biceps read as 'strong' from far away."""
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('_Body'))
    mats = body.data.materials
    sleeve = {i for i, m in enumerate(mats) if m and _base(m.name) == 'Blue'}
    skin = next((i for i, m in enumerate(mats) if m and _base(m.name) == 'Skin'), None)
    if skin is None or not sleeve:
        return
    arm_groups = {body.vertex_groups[n].index for n in ('UpperArm.L', 'UpperArm.R', 'Shoulder.L', 'Shoulder.R') if n in body.vertex_groups}
    upper = {body.vertex_groups[n].index for n in ('UpperArm.L', 'UpperArm.R') if n in body.vertex_groups}

    def arm_weight(v, groups):
        return sum(g.weight for g in v.groups if g.group in groups)

    changed = 0
    for p in body.data.polygons:
        if p.material_index not in sleeve:
            continue
        vs = [body.data.vertices[i] for i in p.vertices]
        # Mostly upper-arm, and not the shoulder seam.
        if sum(arm_weight(v, upper) for v in vs) / len(vs) > 0.6 and sum(arm_weight(v, arm_groups) for v in vs) / len(vs) > 0.85:
            p.material_index = skin
            changed += 1
    print(f'hero: {changed} sleeve faces → skin')


def restyle(arm):
    bare_arms(arm)
    for mat in bpy.data.materials:
        spec = PALETTE.get(_base(mat.name))
        if spec:
            _set_color(mat, *spec)
    # Flat shading: every facet catches light separately → crisp, angular look.
    for o in bpy.data.objects:
        if o.type == 'MESH':
            for p in o.data.polygons:
                p.use_smooth = False


def add_quiver(arm, arrow_mesh, head):
    """Leather quiver on the back with fletchings over the right shoulder, rigid to the chest."""
    # Back surface at chest height (character faces -Y, so the back is +Y).
    body = next(o for o in bpy.data.objects if o.type == 'MESH' and o.name.endswith('_Body'))
    z_lo, z_hi = head('Chest').z - 0.08, head('Chest').z + 0.12
    back_y = max((body.matrix_world @ v.co).y for v in body.data.vertices if z_lo < (body.matrix_world @ v.co).z < z_hi)
    length, radius = 0.5, 0.06
    centre = Vector((-0.02, back_y + radius * 0.9, head('Chest').z - 0.02))
    # Tilt: top toward the right shoulder (-X) and slightly back.
    tilt = Matrix.Rotation(math.radians(-28), 4, 'Y') @ Matrix.Rotation(math.radians(8), 4, 'X')

    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=radius * 0.92, radius2=radius, depth=length)
    leather = _new_material('Quiver_Leather', (0.07, 0.035, 0.02), 0.0, 0.75)
    trim = _new_material('Quiver_Trim', (0.12, 0.1, 0.07), 0.8, 0.35)
    for z in (-length / 2 + 0.03, length / 2 - 0.035):
        ring = bmesh.ops.create_cone(bm, cap_ends=False, segments=7, radius1=radius * 1.08, radius2=radius * 1.08, depth=0.03, matrix=Matrix.Translation((0, 0, z)))
        ring_verts = set(ring['verts'])
        for f in bm.faces:
            if all(v in ring_verts for v in f.verts):
                f.material_index = 1
    mesh = bpy.data.meshes.new('Quiver')
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(leather)
    mesh.materials.append(trim)
    quiver = bpy.data.objects.new('Quiver', mesh)
    bpy.context.scene.collection.objects.link(quiver)
    quiver.matrix_world = Matrix.Translation(centre) @ tilt

    # A few arrows sticking out of the top.
    parts = [quiver]
    for i, (dx, dy, rise, spin) in enumerate([(0.0, 0.0, 0.17, 0), (0.025, 0.015, 0.14, 40), (-0.022, 0.012, 0.155, 85), (0.012, -0.024, 0.13, 130), (-0.01, -0.02, 0.16, 200)]):
        a = arrow_mesh.copy()
        a.data = arrow_mesh.data.copy()
        bpy.context.scene.collection.objects.link(a)
        # Arrow space: tail at origin, tip +Y. Point it down into the quiver, tail sticking out.
        flip = Matrix.Rotation(math.radians(90), 4, 'X')  # +Y → +Z
        shrink = Matrix.Diagonal((0.62, 0.62, 0.62, 1))  # shorter so the tips stay inside
        a.matrix_world = Matrix.Translation(centre) @ tilt @ Matrix.Translation((dx, dy, length / 2 + rise)) @ Matrix.Rotation(math.radians(spin), 4, 'Z') @ Matrix.Rotation(math.pi, 4, 'X') @ flip @ shrink
        parts.append(a)
    bpy.ops.object.select_all(action='DESELECT')
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = quiver
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    quiver = bpy.context.view_layer.objects.active
    quiver.name = 'Quiver'
    for p in quiver.data.polygons:
        p.use_smooth = False
    group = quiver.vertex_groups.new(name='Chest')
    group.add([v.index for v in quiver.data.vertices], 1.0, 'REPLACE')
    mod = quiver.modifiers.new('Armature', 'ARMATURE')
    mod.object = arm
    return quiver
