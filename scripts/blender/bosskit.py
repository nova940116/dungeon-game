"""
Tiny toolkit for building low-poly bosses from nothing but code (used by boss_golem.py / boss_demon.py).

A character is a pile of rigid, flat-shaded pieces, each bound to exactly one bone, joined into a
single skinned mesh. Every bone points straight up in its rest pose, so they all share one local
frame: animation is written as plain Euler angles around the *character's* axes instead of
per-bone local axes.

Space (Blender): +Z up, the character faces -Y, its left is +X.
Rotations are (rx, ry, rz) in degrees, relative to the parent bone:
    rx > 0  pitches forward (a torso bows, a hanging arm swings back; use rx < 0 to raise an arm forward)
    ry > 0  rolls toward the character's left (+X); a hanging left arm lifts sideways with ry < 0
    rz > 0  yaws toward the character's left
"""
import math
import os
import random

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

FPS = 30


def euler(rot):
    return Euler([math.radians(a) for a in rot], 'XYZ')


class Model:
    def __init__(self, name, seed=7):
        self.name = name
        self.rng = random.Random(seed)
        self.materials = {}   # name -> (material, index)
        self.bones = []       # (name, head, parent)
        self.verts = []
        self.faces = []
        self.face_mats = []
        self.vert_bones = []
        self.arm = None
        self.mesh = None
        self.actions = []

    # ------------------------------------------------------------ materials / bones

    def material(self, name, color, rough=0.7, metal=0.0, emit=None, strength=0.0, double=False):
        mat = bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = next(n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
        rgba = (*color, 1.0)
        bsdf.inputs['Base Color'].default_value = rgba
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        if emit:
            bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
            bsdf.inputs['Emission Strength'].default_value = strength
        mat.use_backface_culling = not double
        # Viewport colour, used by the workbench preview renders.
        mat.diffuse_color = (*[min(1.0, c * 1.6 + 0.25) for c in emit], 1.0) if emit else rgba
        self.materials[name] = (mat, len(self.materials))
        return name

    def bone(self, name, head, parent=None):
        self.bones.append((name, Vector(head), parent))

    def bone_head(self, name):
        return next(h for n, h, _ in self.bones if n == name)

    # ------------------------------------------------------------ geometry

    def _add(self, bm, bone, mat, matrix=None, jitter=0.0):
        if jitter:
            for v in bm.verts:
                v.co += Vector([self.rng.uniform(-jitter, jitter) for _ in range(3)])
        if matrix is not None:
            bm.transform(matrix)
        bm.verts.index_update()
        base = len(self.verts)
        for v in bm.verts:
            self.verts.append(v.co.copy())
            self.vert_bones.append(bone)
        flip = matrix is not None and matrix.determinant() < 0
        for f in bm.faces:
            idx = [base + v.index for v in f.verts]
            self.faces.append(idx[::-1] if flip else idx)
            self.face_mats.append(self.materials[mat][1])
        bm.free()

    def box(self, bone, mat, size, loc, rot=(0, 0, 0), taper=1.0, taper_y=None, bevel=0.0, jitter=0.0):
        """Box centred on `loc`. `taper` scales the top face in X (and Y unless `taper_y` is given)."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        ty = taper if taper_y is None else taper_y
        for v in bm.verts:
            if v.co.z > 0:
                v.co.x *= taper
                v.co.y *= ty
            v.co.x *= size[0]
            v.co.y *= size[1]
            v.co.z *= size[2]
        if bevel:
            bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=1, affect='EDGES')
        self._add(bm, bone, mat, Matrix.Translation(loc) @ euler(rot).to_matrix().to_4x4(), jitter)

    def limb(self, bone, mat, p0, p1, r0, r1, segs=7, squash=1.0, jitter=0.0):
        """Tapered prism from p0 (radius r0) to p1 (radius r1). r1 = 0 makes a spike."""
        p0, p1 = Vector(p0), Vector(p1)
        axis = p1 - p0
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0, radius2=max(r1, 1e-4), depth=axis.length)
        if r1 <= 0:
            bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-3)
        for v in bm.verts:
            v.co.y *= squash
        m = Matrix.Translation((p0 + p1) / 2) @ axis.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        self._add(bm, bone, mat, m, jitter)

    def spike(self, bone, mat, base, direction, length, radius, segs=6, squash=1.0):
        base = Vector(base)
        self.limb(bone, mat, base, base + Vector(direction).normalized() * length, radius, 0.0, segs, squash)

    def crystal(self, bone, mat, base, direction, length, radius, segs=6):
        """Faceted shard: a short widening shaft and a long point."""
        base = Vector(base)
        d = Vector(direction).normalized()
        mid = base + d * length * 0.45
        self.limb(bone, mat, base, mid, radius * 0.6, radius, segs)
        self.limb(bone, mat, mid, base + d * length, radius, 0.0, segs)

    def ball(self, bone, mat, radius, loc, scale=(1, 1, 1), rot=(0, 0, 0), subdiv=1, jitter=0.0):
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
        m = Matrix.Translation(loc) @ euler(rot).to_matrix().to_4x4() @ Matrix.Diagonal((*scale, 1.0))
        self._add(bm, bone, mat, m, jitter)

    def poly(self, bone, mat, points, faces):
        """Raw faces (e.g. wing membranes). `bone` may be a list with one bone name per point."""
        base = len(self.verts)
        for i, p in enumerate(points):
            self.verts.append(Vector(p))
            self.vert_bones.append(bone[i] if isinstance(bone, (list, tuple)) else bone)
        for f in faces:
            self.faces.append([base + i for i in f])
            self.face_mats.append(self.materials[mat][1])

    # ------------------------------------------------------------ build

    def build(self):
        arm_data = bpy.data.armatures.new(self.name + 'Armature')
        arm = bpy.data.objects.new(self.name + 'Armature', arm_data)
        bpy.context.scene.collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode='EDIT')
        for name, head, parent in self.bones:
            eb = arm_data.edit_bones.new(name)
            eb.head = head
            eb.tail = head + Vector((0, 0, 0.3))
            eb.roll = 0
            if parent:
                eb.parent = arm_data.edit_bones[parent]
        bpy.ops.object.mode_set(mode='OBJECT')

        mesh = bpy.data.meshes.new(self.name)
        mesh.from_pydata([tuple(v) for v in self.verts], [], self.faces)
        for mat, _ in sorted(self.materials.values(), key=lambda m: m[1]):
            mesh.materials.append(mat)
        mesh.polygons.foreach_set('material_index', self.face_mats)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        groups = {name: obj.vertex_groups.new(name=name) for name, _, _ in self.bones}
        by_bone = {}
        for i, b in enumerate(self.vert_bones):
            by_bone.setdefault(b, []).append(i)
        for b, idx in by_bone.items():
            groups[b].add(idx, 1.0, 'REPLACE')
        obj.parent = arm
        obj.modifiers.new('Armature', 'ARMATURE').object = arm

        for pb in arm.pose.bones:
            pb.rotation_mode = 'QUATERNION'
        self.arm, self.mesh = arm, obj
        # Rest frame shared by every bone (they all point up): converts character axes → bone axes.
        self._m = arm.data.bones[0].matrix_local.to_3x3()
        self._mi = self._m.inverted()
        print(f'{self.name}: {len(self.verts)} verts, {len(self.faces)} faces, {len(self.bones)} bones')
        return arm

    # ------------------------------------------------------------ animation

    def clip(self, name, keys, loop=False):
        """
        keys: [(frame, pose)], pose = {bone: (rx, ry, rz)} plus optional {'@bone': (dx, dy, dz)} offsets.
        Bones missing from a pose sit at rest. For loops the first pose is repeated by the caller.
        """
        arm = self.arm
        action = bpy.data.actions.new(name)
        arm.animation_data_create()
        arm.animation_data.action = action
        for frame, pose in keys:
            for pb in arm.pose.bones:
                q = euler(pose.get(pb.name, (0, 0, 0))).to_matrix()
                pb.rotation_quaternion = (self._mi @ q @ self._m).to_quaternion()
                pb.location = self._mi @ Vector(pose.get('@' + pb.name, (0, 0, 0)))
                pb.keyframe_insert('rotation_quaternion', frame=frame)
                pb.keyframe_insert('location', frame=frame)
        action.use_fake_user = True
        action.frame_range = (keys[0][0], keys[-1][0])
        arm.animation_data.action = None
        self.actions.append((name, [k[0] for k in keys]))
        dur = (keys[-1][0] - keys[0][0]) / FPS
        print(f'clip {name}: {dur:.2f}s{" (loop)" if loop else ""}')
        return action

    def reset_pose(self):
        for pb in self.arm.pose.bones:
            pb.rotation_quaternion = (1, 0, 0, 0)
            pb.location = (0, 0, 0)

    def export(self, path):
        self.arm.animation_data.action = None
        self.reset_pose()
        bpy.ops.object.select_all(action='DESELECT')
        self.arm.select_set(True)
        self.mesh.select_set(True)
        bpy.context.view_layer.objects.active = self.arm
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format='GLB',
            use_selection=True,
            export_animations=True,
            export_animation_mode='ACTIONS',
            export_force_sampling=True,
            export_frame_step=1,
            export_def_bones=False,
            export_anim_single_armature=True,
            export_yup=True,
            export_apply=False,
        )
        print(f'exported {path} ({os.path.getsize(path) / 1024:.0f} KB)')

    # ------------------------------------------------------------ previews

    def preview(self, out_dir, height, shots, views=(('front', 28, 12), ('game', 0, 52)), tile=380, zoom=1.0):
        """
        Renders contact sheets: one PNG per view with every (clip, frame) in `shots` side by side.
        views: (name, yaw°, elevation°) of the camera around the character.
        """
        os.makedirs(out_dir, exist_ok=True)
        scene = bpy.context.scene
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'MATERIAL'
        scene.display.shading.show_cavity = True
        scene.display.shading.show_shadows = True
        scene.render.resolution_x = scene.render.resolution_y = tile
        scene.render.film_transparent = False
        scene.world = scene.world or bpy.data.worlds.new('w')
        cam_data = bpy.data.cameras.new('cam')
        cam_data.lens = 60
        cam = bpy.data.objects.new('cam', cam_data)
        scene.collection.objects.link(cam)
        scene.camera = cam
        target = Vector((0, 0, height * 0.5))
        dist = height * 2.7 / zoom

        for view, yaw, elev in views:
            a, e = math.radians(yaw), math.radians(elev)
            cam.location = target + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
            cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
            tiles = []
            for clip, frame in shots:
                self.arm.animation_data.action = bpy.data.actions[clip] if clip else None
                if not clip:
                    self.reset_pose()
                scene.frame_set(frame)
                tile = os.path.join(out_dir, '_tile.png')
                scene.render.filepath = tile
                bpy.ops.render.render(write_still=True)
                img = bpy.data.images.load(tile)
                w, h = img.size
                tiles.append(np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4))
                bpy.data.images.remove(img)
            cols = min(len(tiles), 5)
            rows = math.ceil(len(tiles) / cols)
            h, w = tiles[0].shape[:2]
            sheet = np.zeros((rows * h, cols * w, 4), dtype=np.float32)
            sheet[..., 3] = 1
            for i, t in enumerate(tiles):
                r, c = divmod(i, cols)
                y0 = (rows - 1 - r) * h  # image rows are bottom-up
                sheet[y0:y0 + h, c * w:(c + 1) * w] = t
            out = bpy.data.images.new('sheet', cols * w, rows * h)
            out.pixels[:] = sheet.ravel()
            out.filepath_raw = os.path.join(out_dir, f'{self.name}_{view}.png')
            out.file_format = 'PNG'
            out.save()
            bpy.data.images.remove(out)
            print(f'preview {out_dir}/{self.name}_{view}.png')
        self.arm.animation_data.action = None
        bpy.data.objects.remove(cam, do_unlink=True)
