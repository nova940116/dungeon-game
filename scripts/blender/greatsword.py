"""
Turns the knight into a dark greatsword warrior (an original design):

  - no cape, no helm plume
  - blackened plate, charcoal cloth, dull bronze trims, dark leather
  - a colossal two-handed greatsword: a thick slab of raw iron taller than its wielder, chipped bright
    edges, a squared-off point, heavy riveted ricasso plates, a simple iron crossguard, a long
    leather-wrapped two-hand grip and a heavy pommel

The sword mesh is built in the rest pose along the old longsword's axis (so `sword_moves.py` can find its
blade direction) and is skinned entirely to the right wrist; the left hand joins it on the grip in the clips.

World space (Blender): +Z up, the character faces -Y, its left is +X.
"""
import bmesh
import bpy
from mathutils import Matrix, Vector

NAME = 'Greatsword'
GRIP_LENGTH = 0.46     # two hands on it
GUARD_AT = 0.12        # crossguard, from the right hand's grip point along the blade
BLADE_LENGTH = 1.62
BLADE_WIDTH = 0.27
BLADE_THICK = 0.055
POMMEL_AT = -0.38

# Dark warrior palette: (rgb, metallic, roughness).
PALETTE = {
    'Metal': ((0.075, 0.075, 0.085), 0.6, 0.62),
    'Metal_Dark': ((0.03, 0.03, 0.035), 0.55, 0.7),
    'Blue': ((0.035, 0.032, 0.035), 0.0, 0.9),       # tunic → charcoal
    'Beige': ((0.2, 0.13, 0.06), 0.55, 0.62),         # gold trims → dull bronze
    'DarkBrown': ((0.06, 0.04, 0.03), 0.0, 0.85),
    'Helm_Steel': ((0.07, 0.07, 0.08), 0.6, 0.62),
    'Helm_Gold': ((0.035, 0.035, 0.04), 0.55, 0.7),
}


def _set(mat, rgb, metal, rough):
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Strength'].default_value = 0.0
    mat.diffuse_color = (*rgb, 1)


def _material(name, rgb, metal=0.0, rough=0.7):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    _set(mat, rgb, metal, rough)
    mat.use_backface_culling = False   # exported double-sided: the open edge strips render from both sides
    return mat


def _remove_faces(obj, material_name):
    me = obj.data
    idx = [i for i, m in enumerate(me.materials) if m and m.name.split('.')[0] == material_name]
    if not idx:
        return
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.to_mesh(me)
    bm.free()


def restyle(arm):
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] in ('Cape',):
            bpy.data.objects.remove(o, do_unlink=True)
    helm = bpy.data.objects.get('GreatHelm')
    if helm:
        _remove_faces(helm, 'Helm_Plume')
    for mat in bpy.data.materials:
        spec = PALETTE.get(mat.name.split('.')[0])
        if spec:
            _set(mat, *spec)


def _rest_axis(arm):
    """Grip point (centre of the right fist) and blade direction of the old longsword in the rest pose."""
    old = bpy.data.objects.get('Longsword')
    mw = arm.matrix_world
    palm = (mw @ arm.data.bones['Wrist.R'].head_local + mw @ arm.data.bones['Middle2.R'].head_local) / 2
    if not old:
        return palm, Vector((0.21, 0.08, 0.97)).normalized(), Vector((0, 1, 0))
    pts = [old.matrix_world @ v.co for v in old.data.vertices]
    wrist = mw @ arm.data.bones['Wrist.R'].head_local
    tip = max(pts, key=lambda p: (p - wrist).length)
    grip_mats = [i for i, m in enumerate(old.data.materials) if m and m.name.startswith('Sword_Grip')]
    grip_pts = [old.matrix_world @ old.data.vertices[v].co for p in old.data.polygons if p.material_index in grip_mats for v in p.vertices]
    base = sum(grip_pts, Vector()) / len(grip_pts) if grip_pts else palm
    blade = (tip - base).normalized()
    grip = base + blade * (palm - base).dot(blade)       # on the axis, level with the palm
    return grip, blade, Vector((0, 1, 0))


def build(arm):
    existing = bpy.data.objects.get(NAME)
    if existing:      # already converted (re-running on a built model): keep the sword as it is
        return existing
    grip, axis, ref = _rest_axis(arm)
    old = bpy.data.objects.get('Longsword')
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    flat = (ref - axis * ref.dot(axis)).normalized()     # blade faces front/back in the rest pose
    side = axis.cross(flat).normalized()                 # edges point sideways
    frame = Matrix((side, flat, axis)).transposed()      # local x = edge, y = flat normal, z = blade
    to_world = Matrix.Translation(grip) @ frame.to_4x4()

    iron = _material('GS_Iron', (0.085, 0.085, 0.095), 0.6, 0.62)
    edge = _material('GS_Edge', (0.36, 0.36, 0.38), 0.6, 0.55)
    dark = _material('GS_Dark', (0.03, 0.03, 0.035), 0.5, 0.75)
    leather = _material('GS_Leather', (0.09, 0.055, 0.03), 0.0, 0.85)
    mats = [iron, edge, dark, leather]
    bm = bmesh.new()

    def add(verts, faces, mat):
        vs = [bm.verts.new(to_world @ Vector(v)) for v in verts]
        for f in faces:
            face = bm.faces.new([vs[i] for i in f])
            face.material_index = mat

    def box(cx, cy, z0, z1, w0, t0, w1=None, t1=None, mat=0):
        w1 = w0 if w1 is None else w1
        t1 = t0 if t1 is None else t1
        v = [(cx - w0, cy - t0, z0), (cx + w0, cy - t0, z0), (cx + w0, cy + t0, z0), (cx - w0, cy + t0, z0),
             (cx - w1, cy - t1, z1), (cx + w1, cy - t1, z1), (cx + w1, cy + t1, z1), (cx - w1, cy + t1, z1)]
        add(v, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat)

    # ---- blade: a thick slab with bevelled bright edges and a squared-off, clipped point
    z0, z1 = GUARD_AT + 0.035, GUARD_AT + 0.035 + BLADE_LENGTH
    w, t, e = BLADE_WIDTH / 2, BLADE_THICK / 2, 0.028      # half width, half thickness, edge bevel width
    taper = 0.86
    zt = z1 - 0.2                                          # where the point begins
    core = [(-w + e, -t, z0), (w - e, -t, z0), (w - e, t, z0), (-w + e, t, z0),
            (-w * taper + e, -t * 0.9, zt), (w * taper - e, -t * 0.9, zt), (w * taper - e, t * 0.9, zt), (-w * taper + e, t * 0.9, zt)]
    add(core, [(0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5), (0, 3, 2, 1)], 0)
    # point: the slab narrows to a short, slanted chisel tip
    tip = [(-w * taper + e, -t * 0.9, zt), (w * taper - e, -t * 0.9, zt), (w * taper - e, t * 0.9, zt), (-w * taper + e, t * 0.9, zt),
           (-w * 0.25, -t * 0.4, z1 - 0.02), (w * 0.05, -t * 0.4, z1), (w * 0.05, t * 0.4, z1), (-w * 0.25, t * 0.4, z1 - 0.02)]
    add(tip, [(0, 1, 5, 4), (2, 3, 7, 6), (3, 0, 4, 7), (1, 2, 6, 5), (4, 5, 6, 7)], 0)
    # bevelled edges (bright, worn) along both sides of the slab and the point
    for s in (1, -1):
        edge_v = [(s * (w - e), -t, z0), (s * w, 0, z0), (s * (w - e), t, z0),
                  (s * (w * taper - e), -t * 0.9, zt), (s * w * taper, 0, zt), (s * (w * taper - e), t * 0.9, zt)]
        faces = [(0, 1, 4, 3), (1, 2, 5, 4)] if s > 0 else [(0, 3, 4, 1), (1, 4, 5, 2)]
        add(edge_v, faces, 1)
    pt = [(w * taper, 0, zt), (w * taper - e, -t * 0.9, zt), (w * taper - e, t * 0.9, zt), (w * 0.05 + 0.02, 0, z1), (w * 0.05, -t * 0.4, z1), (w * 0.05, t * 0.4, z1)]
    add(pt, [(1, 0, 3, 4), (0, 2, 5, 3)], 1)
    pt = [(-w * taper, 0, zt), (-w * taper + e, -t * 0.9, zt), (-w * taper + e, t * 0.9, zt), (-w * 0.25 - 0.02, 0, z1 - 0.02), (-w * 0.25, -t * 0.4, z1 - 0.02), (-w * 0.25, t * 0.4, z1 - 0.02)]
    add(pt, [(0, 1, 4, 3), (2, 0, 3, 5)], 1)
    # chips knocked out of the edges (dark notches), and a shallow dark groove down the middle
    for s, zc in ((1, 0.55), (-1, 0.82), (1, 1.2), (-1, 1.38), (1, 0.95)):
        zc = z0 + zc
        box(s * (w - 0.012), 0, zc - 0.025, zc + 0.025, 0.014, t + 0.003, mat=2)
    box(0, 0, z0 + 0.12, z0 + BLADE_LENGTH * 0.62, 0.018, t + 0.002, 0.012, t + 0.002, mat=2)

    # ---- ricasso plates with rivets just above the guard
    box(0, 0, GUARD_AT + 0.035, GUARD_AT + 0.2, w + 0.012, t + 0.012, mat=2)
    for x in (-w * 0.55, w * 0.55):
        for z in (GUARD_AT + 0.08, GUARD_AT + 0.16):
            box(x, 0, z - 0.016, z + 0.016, 0.016, t + 0.022, mat=1)
    # ---- crossguard: a heavy iron bar, slightly swept
    box(0, 0, GUARD_AT - 0.03, GUARD_AT + 0.035, w + 0.11, 0.05, w + 0.13, 0.045, mat=2)
    for s in (1, -1):
        box(s * (w + 0.14), 0, GUARD_AT - 0.04, GUARD_AT + 0.06, 0.025, 0.055, mat=0)
    # ---- long two-hand grip with leather wraps and iron collars, heavy pommel
    gz0, gz1 = GUARD_AT - 0.03 - GRIP_LENGTH, GUARD_AT - 0.03
    box(0, 0, gz0, gz1, 0.03, 0.03, mat=3)
    for i in range(9):
        z = gz0 + (i + 0.5) * GRIP_LENGTH / 9
        box(0, 0, z - 0.012, z + 0.012, 0.036, 0.036, mat=3)
    box(0, 0, gz1 - 0.03, gz1, 0.042, 0.042, mat=2)
    box(0, 0, gz0, gz0 + 0.03, 0.042, 0.042, mat=2)
    box(0, 0, POMMEL_AT - 0.1, POMMEL_AT - 0.01, 0.05, 0.05, 0.065, 0.065, mat=0)
    box(0, 0, POMMEL_AT - 0.16, POMMEL_AT - 0.1, 0.065, 0.065, 0.04, 0.04, mat=0)

    me = bpy.data.meshes.new(NAME)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = False
    obj = bpy.data.objects.new(NAME, me)
    bpy.context.scene.collection.objects.link(obj)
    obj.parent = arm
    obj.matrix_parent_inverse = arm.matrix_world.inverted()
    group = obj.vertex_groups.new(name='Wrist.R')
    group.add(list(range(len(me.vertices))), 1.0, 'REPLACE')
    obj.modifiers.new('Armature', 'ARMATURE').object = arm
    print(f'greatsword: {len(me.vertices)} verts, {BLADE_LENGTH + GUARD_AT - POMMEL_AT + 0.16:.2f} m long')
    return obj


def apply(arm):
    restyle(arm)
    return build(arm)
