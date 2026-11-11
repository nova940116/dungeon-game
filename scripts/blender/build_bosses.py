"""
Builds the bosses and their summons from scratch (no source assets) and exports them as GLB.

    Blender -b --factory-startup -P scripts/blender/build_bosses.py -- <out dir> [--only <key>[,<key>…]] [--preview <dir> [--closeup]]

Keys: golem, demon, spider, spiderling, necro, skeleton, wraith, knight

--preview renders a contact sheet of key poses per boss; --closeup renders large rest-pose views instead.

See boss_golem.py / boss_demon.py / spider.py / undead.py for the designs and bosskit.py for the modelling helpers.
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
# key: (module, builder function, output file)
MODELS = {
    'golem': ('boss_golem', 'build', 'boss_golem.glb'),
    'demon': ('boss_demon', 'build', 'boss_demon_lord.glb'),
    'spider': ('spider', 'build', 'boss_spider_queen.glb'),
    'spiderling': ('spider', 'build_spiderling', 'enemy_spiderling.glb'),
    'necro': ('undead', 'build_necromancer', 'boss_necromancer.glb'),
    'skeleton': ('undead', 'build_skeleton', 'enemy_skeleton.glb'),
    'wraith': ('undead', 'build_wraith', 'enemy_wraith.glb'),
    'knight': ('undead', 'build_death_knight', 'enemy_death_knight.glb'),
}
only = flag('--only')

for key, (module_name, builder, file_name) in MODELS.items():
    if only and key not in only.split(','):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    module = importlib.import_module(module_name)
    model = getattr(module, builder)()
    top = max(v.z for v in model.verts)
    print(f'{model.name}: height {top:.2f}')
    model.export(os.path.join(OUT_DIR, file_name))
    if flag('--preview'):
        if '--closeup' in argv:
            model.preview(flag('--preview'), top, [(None, 0)] * 1, views=(('close_front', 25, 10), ('close_side', 100, 10), ('close_back', 155, 25), ('close_game', 0, 52)), tile=640)
        else:
            model.preview(flag('--preview'), top, getattr(module, f'PREVIEW_{builder.upper()}', module.PREVIEW))
