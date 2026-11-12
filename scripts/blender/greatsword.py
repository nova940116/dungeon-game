"""
Turns the knight into a dark greatsword warrior (an original design).

Art direction, from a review of the first pass (all near-black, read as a blob at game distance):
  - value hierarchy: mid-steel plates outlined by darker under-plates and lighter bronze trim, so the
    armour reads in shapes; trousers pushed darker so the eye goes to head, shoulders and weapon
  - one signature accent: deep crimson cloth (tunic, a torn half-cloak over the left shoulder)
  - no bare skin: the hands become dark leather gauntlets
  - helm scaled up to balance the massive pauldrons
  - secondary shapes and story props: a heavy belt with buckle and pouches, a cross-body leather strap
  - the greatsword is the hero asset: lighter steel blade with a dark fuller and bright bevelled edges,
    a riveted ricasso with small bronze rivets (not noise), swept iron quillons, a round leather-wrapped
    grip with bound rings, an octagonal pommel

All added gear is skinned to the spine with smooth weight blends (like a weight transfer from the body),
so it follows twists and leans without tearing. The sword is built in the rest pose along the old
longsword's axis (so `sword_moves.py` can find its blade direction) and skinned to the right wrist.

World space (Blender): +Z up, the character faces -Y, its left is +X.
"""
import math

import bmesh
import bpy
from mathutils import Matrix, Vector

NAME = 'Greatsword'
GEAR = 'Warrior_Gear'
CLOAK = 'Warrior_Cloak'
GRIP_LENGTH = 0.46     # two hands on it
GUARD_AT = 0.12        # crossguard, from the right hand's grip point along the blade
BLADE_LENGTH = 1.62
BLADE_WIDTH = 0.27
BLADE_THICK = 0.055
POMMEL_AT = -0.38
HELM_SCALE = 1.14

# (rgb, metallic, roughness). Values are chosen as a ladder: trim > plate > under-plate > cloth.
PALETTE = {
    'Metal': ((0.16, 0.16, 0.175), 0.6, 0.6),          # main plate: mid steel
    'Metal_Dark': ((0.035, 0.035, 0.04), 0.5, 0.7),   # under-plates, gaps: near black
    'Blue': ((0.13, 0.02, 0.024), 0.0, 0.85),         # tunic → deep crimson accent (kept dark: an accent, not a mass)
    'Beige': ((0.42, 0.28, 0.11), 0.55, 0.58),        # trims → worn bronze (outlines the plates)
    'DarkBrown': ((0.06, 0.05, 0.048), 0.0, 0.9),     # trousers: pushed back
    'Skin': ((0.075, 0.055, 0.042), 0.0, 0.8),        # bare hands → leather gauntlets
    'Helm_Steel': ((0.2, 0.2, 0.215), 0.6, 0.58),     # helm a touch lighter than the body: the head reads first
    'Helm_Gold': ((0.05, 0.05, 0.055), 0.55, 0.68),   # crest / wings: dark iron, a clean helm silhouette
    'Helm_Visor': ((0.01, 0.01, 0.012), 0.0, 0.9),    # the eye slit: a dark cut, no glow
}

SPINE_LEVELS = [(0.9, 'Hips'), (1.06, 'Abdomen'), (1.22, 'Torso'), (1.38, 'Chest')]


def spine_weights(z):
    """Smoothly blended spine weights by height (what a weight transfer from the torso would give)."""
    if z <= SPINE_LEVELS[0][0]:
        return {SPINE_LEVELS[0][1]: 1.0}
    if z >= SPINE_LEVELS[-1][0]:
        return {SPINE_LEVELS[-1][1]: 1.0}
    for (z0, b0), (z1, b1) in zip(SPINE_LEVELS, SPINE_LEVELS[1:]):
        if z0 <= z <= z1:
            t = (z - z0) / (z1 - z0)
            return {b0: 1 - t, b1: t}
    return {'Chest': 1.0}


def _set(mat, rgb, metal, rough):
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Emission Strength'].default_value = 0.0
    mat.diffuse_color = (*rgb, 1)


def _material(name, rgb, metal=0.0, rough=0.7, double=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    _set(mat, rgb, metal, rough)
    mat.use_backface_culling = not double
    return mat


def _remove_faces(obj, material_name):
    me = obj.data
    idx = [i for i, m in enumerate(me.materials) if m and m.name.split('.')[0] == material_name]
    if not idx:
        return
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index in idx], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.to_mesh(me)
    bm.free()


def _scale_mesh(obj, factor, pivot):
    mw = obj.matrix_world
    inv = mw.inverted()
    for v in obj.data.vertices:
        w = mw @ v.co
        v.co = inv @ (pivot + (w - pivot) * factor)


class Builder:
    """Collects faces in world space (rest pose) with per-vertex bone weights, then makes one skinned mesh."""

    def __init__(self):
        self.bm = bmesh.new()
        self.weights = []           # per vertex: {bone: weight}
        self.materials = []

    def mat(self, m):
        if m not in self.materials:
            self.materials.append(m)
        return self.materials.index(m)

    def add(self, verts, faces, mat, weights=None):
        """weights: a bone name, a {bone: w} dict, or None for spine weights by height."""
        idx = self.mat(mat)
        vs = []
        for v in verts:
            v = Vector(v)
            vs.append(self.bm.verts.new(v))
            if weights is None:
                self.weights.append(spine_weights(v.z))
            elif isinstance(weights, str):
                self.weights.append({weights: 1.0})
            else:
                self.weights.append(dict(weights))
        for f in faces:
            face = self.bm.faces.new([vs[i] for i in f])
            face.material_index = idx

    def box(self, center, size, mat, frame=Matrix.Identity(3), taper=1.0, weights=None):
        c = Vector(center)
        hx, hy, hz = (s / 2 for s in size)
        local = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
                 (-hx * taper, -hy * taper, hz), (hx * taper, -hy * taper, hz), (hx * taper, hy * taper, hz), (-hx * taper, hy * taper, hz)]
        verts = [c + frame @ Vector(p) for p in local]
        self.add(verts, [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)], mat, weights)

    def cylinder(self, a, b, r0, r1, mat, segs=8, weights=None, ref=Vector((1, 0, 0))):
        a, b = Vector(a), Vector(b)
        axis = (b - a).normalized()
        u = (ref - axis * ref.dot(axis)).normalized()
        w = axis.cross(u)
        verts = []
        for end, r in ((a, r0), (b, r1)):
            for i in range(segs):
                t = 2 * math.pi * (i + 0.5) / segs
                verts.append(end + (u * math.cos(t) + w * math.sin(t)) * r)
        faces = [tuple(range(segs - 1, -1, -1)), tuple(range(segs, 2 * segs))]
        faces += [(i, (i + 1) % segs, segs + (i + 1) % segs, segs + i) for i in range(segs)]
        self.add(verts, faces, mat, weights)

    def strip(self, path, width, thick, mat, up=Vector((0, 0, 1)), weights=None, outward=None):
        """A flat strap (a box swept along `path`); `outward(p)` gives the surface normal at p."""
        verts = []
        n = len(path)
        for i, p in enumerate(path):
            p = Vector(p)
            d = (Vector(path[min(i + 1, n - 1)]) - Vector(path[max(i - 1, 0)])).normalized()
            out = outward(p) if outward else up
            side = d.cross(out).normalized()
            for s, o in ((-1, 0), (1, 0), (1, 1), (-1, 1)):
                verts.append(p + side * (s * width / 2) + out * (o * thick))
        faces = [(0, 1, 2, 3)[::-1], tuple(4 * (n - 1) + k for k in (0, 1, 2, 3))]
        for i in range(n - 1):
            a, b = 4 * i, 4 * (i + 1)
            for k in range(4):
                k2 = (k + 1) % 4
                faces.append((a + k, a + k2, b + k2, b + k))
        self.add(verts, faces, mat, weights)

    def make(self, name, arm, frame_to_world=Matrix.Identity(4), recalc=True):
        me = bpy.data.meshes.new(name)
        for v in self.bm.verts:
            v.co = frame_to_world @ v.co
        if recalc:
            bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces[:])
        self.bm.to_mesh(me)
        self.bm.free()
        for m in self.materials:
            me.materials.append(m)
        for p in me.polygons:
            p.use_smooth = False
        obj = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(obj)
        obj.parent = arm
        obj.matrix_parent_inverse = arm.matrix_world.inverted()
        groups = {}
        for i, wmap in enumerate(self.weights):
            for bone, w in wmap.items():
                if w <= 0:
                    continue
                g = groups.get(bone) or obj.vertex_groups.new(name=bone)
                groups[bone] = g
                g.add([i], w, 'REPLACE')
        obj.modifiers.new('Armature', 'ARMATURE').object = arm
        print(f'{name}: {len(me.vertices)} verts, {len(me.polygons)} faces')
        return obj


# ---------------------------------------------------------------- body restyle

def restyle(arm):
    for o in list(bpy.data.objects):
        if o.name.split('.')[0] == 'Cape':
            bpy.data.objects.remove(o, do_unlink=True)
    helm = bpy.data.objects.get('GreatHelm')
    if helm and not helm.get('restyled'):
        _remove_faces(helm, 'Helm_Plume')
        # Scaled from the neck so it grows up and out, not down into the gorget.
        _scale_mesh(helm, HELM_SCALE, Vector((0.0, -0.04, 1.47)))
        helm['restyled'] = True
    for mat in bpy.data.materials:
        spec = PALETTE.get(mat.name.split('.')[0])
        if spec:
            _set(mat, *spec)


# ---------------------------------------------------------------- gear: belt, pouches, strap

def _torso_outward(p):
    """Approximate outward normal of the torso at p (an ellipse around the spine, centre y ≈ -0.06)."""
    d = Vector((p.x / 0.2, (p.y + 0.06) / 0.15, 0))
    return d.normalized() if d.length > 1e-6 else Vector((0, -1, 0))


def build_gear(arm):
    if bpy.data.objects.get(GEAR):
        return bpy.data.objects[GEAR]
    leather = _material('Gear_Leather', (0.14, 0.085, 0.045), 0.0, 0.8)
    leather_dark = _material('Gear_LeatherDark', (0.07, 0.045, 0.028), 0.0, 0.85)
    bronze = _material('Gear_Bronze', (0.42, 0.28, 0.11), 0.55, 0.58)
    g = Builder()

    # Heavy belt riding on the hips: a ring hugging the waist (z ≈ 1.0), slightly lower at the front.
    ring = []
    for i in range(16):
        a = 2 * math.pi * i / 16
        x = math.sin(a) * 0.195
        y = -0.058 - math.cos(a) * 0.15
        z = 0.99 - 0.025 * max(0.0, math.cos(a))
        ring.append((x, y, z))
    ring.append(ring[0])
    g.strip(ring, 0.085, 0.022, leather, weights={'Hips': 0.7, 'Abdomen': 0.3}, outward=_torso_outward)
    # buckle (front) and studs
    g.box((0, -0.235, 0.965), (0.11, 0.03, 0.095), bronze, weights={'Hips': 0.7, 'Abdomen': 0.3})
    g.box((0, -0.245, 0.965), (0.06, 0.02, 0.05), leather_dark, weights={'Hips': 0.7, 'Abdomen': 0.3})
    for a in (0.9, 1.6, 2.4, -0.9, -1.6, -2.4):
        p = Vector((math.sin(a) * 0.205, -0.058 - math.cos(a) * 0.16, 0.99))
        g.box(p, (0.026, 0.026, 0.026), bronze, weights={'Hips': 0.7, 'Abdomen': 0.3})
    # pouches: right hip and back-left, with flaps
    for x, y, rz in ((-0.19, -0.1, -70), (0.13, 0.11, 140)):
        fr = Matrix.Rotation(math.radians(rz), 3, 'Z')
        out = fr @ Vector((0, -1, 0))
        c = Vector((x, y, 0.925)) + out * 0.03
        g.box(c, (0.1, 0.06, 0.11), leather, frame=fr, taper=0.92, weights='Hips')
        g.box(c + out * 0.008 + Vector((0, 0, 0.04)), (0.105, 0.064, 0.04), leather_dark, frame=fr, weights='Hips')
        g.box(c + out * 0.035 + Vector((0, 0, 0.02)), (0.02, 0.01, 0.025), bronze, frame=fr, weights='Hips')

    # Cross-body strap: right hip → over the chest → left shoulder → down the back.
    front = [(-0.17, -0.205, 1.03), (-0.1, -0.218, 1.16), (-0.02, -0.235, 1.3), (0.07, -0.255, 1.43),
             (0.15, -0.22, 1.56), (0.19, -0.12, 1.665), (0.19, 0.0, 1.69)]
    back = [(0.18, 0.11, 1.62), (0.11, 0.135, 1.46), (0.02, 0.12, 1.3), (-0.08, 0.1, 1.16), (-0.17, 0.09, 1.03)]

    def strap_out(p):
        if p.z > 1.64:
            return Vector((0.2, 0, 1)).normalized()
        return _torso_outward(p)
    g.strip(front + back, 0.065, 0.016, leather_dark, outward=strap_out)
    g.box((0.02, -0.25, 1.3), (0.07, 0.025, 0.07), bronze)           # strap buckle on the chest
    return g.make(GEAR, arm)


# ---------------------------------------------------------------- torn half-cloak over the left shoulder

def build_cloak(arm):
    if bpy.data.objects.get(CLOAK):
        return bpy.data.objects[CLOAK]
    cloth = _material('Cloak_Crimson', (0.15, 0.018, 0.022), 0.0, 0.9, double=True)
    g = Builder()
    cols, rows = 9, 8
    # Torn hem: how far down each column hangs (shortest over the arm, longest at the spine).
    hem = [0.72, 0.62, 0.68, 0.76, 0.66, 0.8, 0.9, 1.0, 0.86]
    verts = []
    for r in range(rows + 1):
        v = r / rows
        for c in range(cols):
            u = c / (cols - 1)
            # Top edge drapes over the left shoulder; lower rows narrow toward the back-left.
            x_top = -0.06 + 0.5 * u
            x_bot = -0.1 + 0.36 * u
            x = x_top + (x_bot - x_top) * min(1.0, v * 1.6)
            length = 0.86 * hem[c]
            z = 1.69 - 0.05 * u - v * length
            if r == 0:
                y = -0.02 - 0.12 * max(0.0, u - 0.55) / 0.45       # wraps forward over the pauldron
                z = 1.70 - 0.02 * u
            else:
                back = 0.13 if z > 1.3 else 0.12
                y = back + 0.07 * v * v + 0.015 * math.sin(c * 1.7)  # flares away from the body, small folds
                if u > 0.75 and z > 1.45:                           # hangs over the shoulder plate
                    y -= 0.12 * (u - 0.75) / 0.25
                    x += 0.04
            verts.append((x, y, z))
    faces = []
    for r in range(rows):
        for c in range(cols - 1):
            a = r * cols + c
            faces.append((a, a + 1, a + 1 + cols, a + cols))
    g.add(verts, faces, cloth)
    # Shoulder pin holding it: a bronze disc over the left collarbone.
    bronze = bpy.data.materials.get('Gear_Bronze') or _material('Gear_Bronze', (0.42, 0.28, 0.11), 0.55, 0.58)
    g.cylinder((0.13, -0.14, 1.66), (0.13, -0.17, 1.66), 0.04, 0.035, bronze, segs=8, weights='Chest', ref=Vector((0, 0, 1)))
    return g.make(CLOAK, arm)


# ---------------------------------------------------------------- the greatsword

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

    steel = _material('GS_Steel', (0.3, 0.3, 0.32), 0.6, 0.58, double=True)      # blade faces: the lightest mass
    edge = _material('GS_Edge', (0.62, 0.62, 0.64), 0.6, 0.55, double=True)     # honed bevels
    fuller = _material('GS_Fuller', (0.06, 0.06, 0.065), 0.5, 0.7, double=True)
    iron = _material('GS_Iron', (0.1, 0.1, 0.11), 0.6, 0.62)
    bronze = _material('GS_Bronze', (0.42, 0.28, 0.11), 0.55, 0.58)
    leather = _material('GS_Leather', (0.13, 0.075, 0.04), 0.0, 0.8)
    g = Builder()
    W = 'Wrist.R'

    # ---- blade: a thick slab, slightly wider at the ricasso, bevelled edges, a clipped point
    z0, z1 = GUARD_AT + 0.035, GUARD_AT + 0.035 + BLADE_LENGTH
    w, t, e = BLADE_WIDTH / 2, BLADE_THICK / 2, 0.03
    taper = 0.84
    zt = z1 - 0.22
    flat_faces = [(0, 1, 5, 4), (2, 3, 7, 6)]
    core = [(-w + e, -t, z0), (w - e, -t, z0), (w - e, t, z0), (-w + e, t, z0),
            (-w * taper + e, -t * 0.85, zt), (w * taper - e, -t * 0.85, zt), (w * taper - e, t * 0.85, zt), (-w * taper + e, t * 0.85, zt)]
    g.add(core, flat_faces + [(0, 3, 2, 1)], steel, W)
    tip = [(-w * taper + e, -t * 0.85, zt), (w * taper - e, -t * 0.85, zt), (w * taper - e, t * 0.85, zt), (-w * taper + e, t * 0.85, zt),
           (-w * 0.3, -t * 0.35, z1 - 0.03), (w * 0.08, -t * 0.35, z1), (w * 0.08, t * 0.35, z1), (-w * 0.3, t * 0.35, z1 - 0.03)]
    g.add(tip, flat_faces + [(4, 5, 6, 7)], steel, W)
    for s in (1, -1):    # bevels: two faces each side meeting at the cutting edge
        ev = [(s * (w - e), -t, z0), (s * w, 0, z0), (s * (w - e), t, z0),
              (s * (w * taper - e), -t * 0.85, zt), (s * w * taper, 0, zt), (s * (w * taper - e), t * 0.85, zt)]
        g.add(ev, [(0, 1, 4, 3), (1, 2, 5, 4)], edge, W)
    for xs, xe, ze in ((1, 0.08, z1), (-1, -0.3, z1 - 0.03)):
        pv = [(xs * (w * taper - e), -t * 0.85, zt), (xs * w * taper, 0, zt), (xs * (w * taper - e), t * 0.85, zt),
              (w * xe + xs * 0.02, 0, ze), (w * xe, -t * 0.35, ze), (w * xe, t * 0.35, ze)]
        g.add(pv, [(0, 1, 3, 4), (1, 2, 5, 3)], edge, W)
    # fuller: a dark groove inlaid on both faces, two thirds down the blade
    for sy in (-1, 1):
        fz0, fz1 = z0 + 0.22, z0 + BLADE_LENGTH * 0.66
        fv = [(-0.022, sy * (t + 0.001), fz0), (0.022, sy * (t + 0.001), fz0),
              (0.014, sy * (t * 0.88 + 0.001), fz1), (-0.014, sy * (t * 0.88 + 0.001), fz1)]
        g.add(fv, [(0, 1, 2, 3)], fuller, W)

    # ---- ricasso: riveted iron plates, small bronze rivets
    g.box((0, 0, GUARD_AT + 0.1), (BLADE_WIDTH + 0.012, BLADE_THICK + 0.016, 0.12), iron, taper=0.96, weights=W)
    for x in (-w * 0.6, 0.0, w * 0.6):
        for y in (-1, 1):
            g.cylinder((x, y * (t + 0.008), GUARD_AT + 0.1), (x, y * (t + 0.017), GUARD_AT + 0.1), 0.012, 0.008, bronze, segs=6, weights=W, ref=Vector((1, 0, 0)))
    # ---- crossguard: an iron bar with quillons swept toward the blade, bronze caps
    g.box((0, 0, GUARD_AT), (BLADE_WIDTH + 0.14, 0.085, 0.06), iron, weights=W)
    for s in (1, -1):
        a = Vector((s * (w + 0.06), 0, GUARD_AT))
        b = Vector((s * (w + 0.17), 0, GUARD_AT + 0.07))
        g.cylinder(a, b, 0.042, 0.03, iron, segs=6, weights=W, ref=Vector((0, 1, 0)))
        g.cylinder(b, b + (b - a).normalized() * 0.04, 0.036, 0.014, bronze, segs=6, weights=W, ref=Vector((0, 1, 0)))
    # ---- grip: round leather wrap with raised bindings, iron collars
    gz0, gz1 = GUARD_AT - 0.03 - GRIP_LENGTH, GUARD_AT - 0.03
    g.cylinder((0, 0, gz0), (0, 0, gz1), 0.031, 0.029, leather, segs=8, weights=W)
    for i in range(8):
        z = gz0 + 0.04 + i * (GRIP_LENGTH - 0.08) / 7
        g.cylinder((0, 0, z - 0.009), (0, 0, z + 0.009), 0.036, 0.036, leather, segs=8, weights=W)
    g.cylinder((0, 0, gz1 - 0.035), (0, 0, gz1), 0.04, 0.044, iron, segs=8, weights=W)
    g.cylinder((0, 0, gz0), (0, 0, gz0 + 0.03), 0.042, 0.038, iron, segs=8, weights=W)
    # ---- pommel: faceted octagonal block with a bronze cap
    g.cylinder((0, 0, gz0 - 0.005), (0, 0, gz0 - 0.07), 0.05, 0.068, iron, segs=8, weights=W)
    g.cylinder((0, 0, gz0 - 0.07), (0, 0, gz0 - 0.12), 0.068, 0.045, iron, segs=8, weights=W)
    g.cylinder((0, 0, gz0 - 0.12), (0, 0, gz0 - 0.135), 0.03, 0.02, bronze, segs=8, weights=W)

    obj = g.make(NAME, arm, frame_to_world=to_world)
    print(f'greatsword: {BLADE_LENGTH + GUARD_AT - (gz0 - 0.135):.2f} m long')
    return obj


def apply(arm):
    restyle(arm)
    build_gear(arm)
    build_cloak(arm)
    return build(arm)
