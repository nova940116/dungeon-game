"""
Rebuilds the swordsman on an already built player_swordsman.glb: the dark greatsword restyle (greatsword.py:
no cape, blackened armour, the greatsword) and the hand-authored Idle / Run / Slash / Slash_Back /
Slash_Heavy clips (sword_moves.py). Keeps the body mesh, rig, HitRecieve and Death.

    Blender -b --factory-startup -P scripts/blender/reanimate_swordsman.py -- <in.glb> <out.glb>

`npm run assets:swordsman` does the same as part of the full build; this is for when the CC0 source models
aren't at hand (`npm run assets:swordsman -- --reanimate`).
"""
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[:2]
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import greatsword  # noqa: E402
import sword_moves  # noqa: E402

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
if arm.animation_data:
    arm.animation_data.action = None
for act in bpy.data.actions:
    act.use_fake_user = True
greatsword.apply(arm)
sword_moves.author(arm)
print('clips:', sorted(a.name for a in bpy.data.actions))

for pb in arm.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_quaternion = (1, 0, 0, 0)
    pb.scale = (1, 1, 1)
# The importer adds a helper sphere for the bone shapes; it isn't part of the character.
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere') or (o.type == 'EMPTY' and o.name.endswith('_end')):
        bpy.data.objects.remove(o, do_unlink=True)
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
