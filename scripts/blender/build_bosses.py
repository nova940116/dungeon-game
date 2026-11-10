"""
Builds the two boss models from scratch (no source assets) and exports them as GLB.

    Blender -b --factory-startup -P scripts/blender/build_bosses.py -- <out dir> [--only golem|demon] [--preview <dir> [--closeup]]

--preview renders a contact sheet of key poses per boss; --closeup renders large rest-pose views instead.

See boss_golem.py / boss_demon.py for the designs and bosskit.py for the modelling helpers.
"""
import importlib
import os
import sys

import bpy

argv = sys.argv[sys.argv.index('--') + 1:]
OUT_DIR = argv[0]


def flag(name):
    return argv[argv.index(name) + 1] if name in argv else None


sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
BOSSES = {'golem': ('boss_golem', 'boss_golem.glb'), 'demon': ('boss_demon', 'boss_demon_lord.glb')}

for key, (module_name, file_name) in BOSSES.items():
    if flag('--only') not in (None, key):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    module = importlib.import_module(module_name)
    model = module.build()
    top = max(v.z for v in model.verts)
    print(f'{model.name}: height {top:.2f}')
    model.export(os.path.join(OUT_DIR, file_name))
    if flag('--preview'):
        if '--closeup' in argv:
            model.preview(flag('--preview'), top, [(None, 0)] * 1, views=(('close_front', 25, 10), ('close_side', 100, 10), ('close_back', 155, 25), ('close_game', 0, 52)), tile=640)
        else:
            model.preview(flag('--preview'), top, module.PREVIEW)
