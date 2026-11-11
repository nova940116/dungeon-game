"""
The Necromancer's host (stage boss, room 20) — all built from scratch:

Necromancer   robed lich: hooded skull with green eyes, exposed ribcage around a soul-fire heart,
              bone pauldrons, spiked collar, tattered robe, skull-topped staff with a green flame.
Skeleton      rusty sword + round shield foot soldier.
Death Knight  the same frame, 1.6× bigger, in black plate with a horned helm, cape and rune greatsword.
Wraith        legless hooded ghost: a void face with two eyes, tattered robe, long clawed arms.

Humanoids share one bone layout (`humanoid_bones`). Glow / Eye materials are pulsed at runtime.
"""
import math

from bosskit import Model

SIDES = ((1, 'L'), (-1, 'R'))


def both(pose, bone, rot):
    pose[f'{bone}.L'] = rot
    pose[f'{bone}.R'] = (rot[0], -rot[1], -rot[2])
    return pose


def mix(*poses):
    out = {}
    for p in poses:
        out.update(p)
    return out


def undead_materials(m, eye=(0.35, 1.0, 0.45)):
    m.material('Bone', (0.78, 0.74, 0.62), rough=0.6)
    m.material('BoneDark', (0.45, 0.42, 0.35), rough=0.7)
    m.material('Eye', (0.6, 1.0, 0.65), rough=0.2, emit=eye, strength=7.0)
    m.material('Glow', (0.2, 0.7, 0.3), rough=0.3, emit=(0.3, 1.0, 0.45), strength=3.0)


# ---------------------------------------------------------------- shared humanoid skeleton

def humanoid_bones(m, k):
    """Bone layout of a 1.9-unit-tall humanoid, scaled by k."""
    S = lambda *v: tuple(c * k for c in v)  # noqa: E731
    m.bone('Root', (0, 0, 0))
    m.bone('Hips', S(0, 0, 0.95), 'Root')
    m.bone('Spine', S(0, 0, 1.15), 'Hips')
    m.bone('Chest', S(0, 0, 1.35), 'Spine')
    m.bone('Head', S(0, -0.02, 1.62), 'Chest')
    m.bone('Jaw', S(0, -0.04, 1.66), 'Head')
    for s, side in SIDES:
        m.bone(f'UpperArm.{side}', S(0.24 * s, 0, 1.52), 'Chest')
        m.bone(f'LowerArm.{side}', S(0.3 * s, 0.02, 1.22), f'UpperArm.{side}')
        m.bone(f'Hand.{side}', S(0.33 * s, -0.02, 0.96), f'LowerArm.{side}')
        m.bone(f'UpperLeg.{side}', S(0.12 * s, 0, 0.93), 'Hips')
        m.bone(f'LowerLeg.{side}', S(0.13 * s, 0, 0.52), f'UpperLeg.{side}')
        m.bone(f'Foot.{side}', S(0.13 * s, 0.02, 0.1), f'LowerLeg.{side}')
    return S


def skeleton_body(m, k, ribs=True):
    """Bare bones (skull, ribcage, spine, limbs)."""
    S = lambda *v: tuple(c * k for c in v)  # noqa: E731
    m.ball('Head', 'Bone', 0.13 * k, S(0, -0.04, 1.76), scale=(1, 1.1, 1.05))
    m.ball('Head', 'BoneDark', 0.06 * k, S(0, -0.14, 1.72), scale=(1.4, 0.6, 0.8))  # cheekbones / nasal shadow
    for s, _ in SIDES:
        m.ball('Head', 'Eye', 0.026 * k, S(0.048 * s, -0.16, 1.77))
    m.box('Jaw', 'Bone', S(0.15, 0.12, 0.05), S(0, -0.12, 1.63), bevel=0.01 * k)
    for x in (-0.05, -0.017, 0.017, 0.05):
        m.box('Jaw', 'Bone', S(0.022, 0.02, 0.035), S(x, -0.175, 1.665))
    # spine
    m.limb('Hips', 'Bone', S(0, 0.05, 0.92), S(0, 0.05, 1.15), 0.035 * k, 0.03 * k, segs=6)
    m.limb('Spine', 'Bone', S(0, 0.05, 1.15), S(0, 0.05, 1.35), 0.03 * k, 0.03 * k, segs=6)
    m.limb('Chest', 'Bone', S(0, 0.05, 1.35), S(0, 0.03, 1.62), 0.03 * k, 0.025 * k, segs=6)
    m.box('Hips', 'Bone', S(0.3, 0.14, 0.12), S(0, 0.02, 0.95), taper=1.25, bevel=0.02 * k)
    if ribs:
        for z in (1.3, 1.38, 1.46, 1.54):
            for s, _ in SIDES:
                pts = [S(0.02 * s, 0.05, z), S(0.15 * s, 0.0, z - 0.02), S(0.14 * s, -0.11, z - 0.05), S(0.03 * s, -0.14, z - 0.06)]
                for a, b in zip(pts, pts[1:]):
                    m.limb('Chest', 'Bone', a, b, 0.017 * k, 0.017 * k, segs=5)
        m.box('Chest', 'Bone', S(0.04, 0.03, 0.26), S(0, -0.14, 1.45))
    for s, side in SIDES:
        m.limb('Chest', 'Bone', S(0, 0.02, 1.53), S(0.24 * s, 0, 1.53), 0.022 * k, 0.022 * k, segs=5)  # collarbone
        m.ball(f'UpperArm.{side}', 'Bone', 0.045 * k, S(0.24 * s, 0, 1.52))
        m.limb(f'UpperArm.{side}', 'Bone', S(0.24 * s, 0, 1.5), S(0.3 * s, 0.02, 1.22), 0.03 * k, 0.025 * k, segs=6)
        m.ball(f'LowerArm.{side}', 'Bone', 0.035 * k, S(0.3 * s, 0.02, 1.22))
        m.limb(f'LowerArm.{side}', 'Bone', S(0.3 * s, 0.02, 1.22), S(0.33 * s, -0.02, 0.98), 0.025 * k, 0.022 * k, segs=6)
        m.box(f'Hand.{side}', 'Bone', S(0.06, 0.08, 0.06), S(0.33 * s, -0.03, 0.93))
        for dy in (-0.03, 0.0, 0.03):
            m.spike(f'Hand.{side}', 'Bone', S(0.33 * s, -0.04 + dy, 0.9), (0, -0.2, -1), 0.08 * k, 0.012 * k, segs=4)
        m.ball(f'UpperLeg.{side}', 'Bone', 0.045 * k, S(0.12 * s, 0, 0.92))
        m.limb(f'UpperLeg.{side}', 'Bone', S(0.12 * s, 0, 0.92), S(0.13 * s, 0, 0.53), 0.035 * k, 0.03 * k, segs=6)
        m.ball(f'LowerLeg.{side}', 'Bone', 0.045 * k, S(0.13 * s, -0.01, 0.52))
        m.limb(f'LowerLeg.{side}', 'Bone', S(0.13 * s, 0, 0.52), S(0.13 * s, 0.02, 0.1), 0.03 * k, 0.025 * k, segs=6)
        m.box(f'Foot.{side}', 'Bone', S(0.08, 0.2, 0.05), S(0.13 * s, -0.05, 0.04), bevel=0.01 * k)


def humanoid_clips(m, heavy=False):
    """Idle, Walk, Attack (overhead chop, hit at frame 12), Punch (charge pose), Roar, Death."""
    rest = {}
    guard = both(both({'Chest': (6, 0, 0), 'Head': (-6, 0, 0)}, 'UpperArm', (-10, -8, 0)), 'LowerArm', (-25, 0, 0))
    idle_b = mix(guard, {'Chest': (9, 0, 2), 'Jaw': (10, 0, 0), '@Hips': (0, 0, -0.03)})
    m.clip('Idle', [(0, guard), (24, idle_b), (48, guard)], loop=True)

    def stride(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        sw = 0.75 if heavy else 1.0
        return mix(guard, {
            f'UpperLeg.{l}': (-28 * sw, 0, 0), f'LowerLeg.{l}': (8, 0, 0),
            f'UpperLeg.{r}': (22 * sw, 0, 0), f'LowerLeg.{r}': (18, 0, 0),
            'Hips': (0, 0, 6 * lead), 'Chest': (8, 0, -8 * lead), 'Head': (-6, 0, 5 * lead), '@Hips': (0, 0, -0.04),
            f'UpperArm.{r}': (-30, -8 * (1 if r == 'L' else -1), 0),
        })

    def passing(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return mix(guard, {f'UpperLeg.{r}': (-12, 0, 0), f'LowerLeg.{r}': (40, 0, 0), '@Hips': (0, 0, 0.03), 'Chest': (6, 0, 0)})

    m.clip('Walk', [(0, stride(1)), (8, passing(1)), (16, stride(-1)), (24, passing(-1)), (32, stride(1))], loop=True)

    windup = mix(guard, {'Chest': (-14, 0, -12), 'Head': (-10, 0, 8), 'UpperArm.R': (-165, 15, 0), 'LowerArm.R': (-40, 0, 0), 'Jaw': (20, 0, 0)})
    if heavy:
        windup.update({'UpperArm.L': (-160, -15, 0), 'LowerArm.L': (-40, 0, 0)})
    chop = mix(guard, {'Chest': (24, 0, 10), 'Head': (-12, 0, 0), 'UpperArm.R': (-55, 0, 0), 'LowerArm.R': (-5, 0, 0), '@Hips': (0, -0.06, -0.12)})
    if heavy:
        chop.update({'UpperArm.L': (-55, 0, 0), 'LowerArm.L': (-5, 0, 0)})
    both(chop, 'UpperLeg', (-18, 0, 0))
    both(chop, 'LowerLeg', (20, 0, 0))
    m.clip('Attack', [(0, guard), (8, windup), (12, chop), (18, chop), (28, guard)])

    lunge = mix(guard, {'Chest': (24, 0, 0), 'Head': (-20, 0, 0), 'UpperArm.R': (-80, 10, 0), 'UpperArm.L': (30, -20, 0),
                        'UpperLeg.L': (-50, 0, 0), 'LowerLeg.L': (30, 0, 0), 'UpperLeg.R': (30, 0, 0), '@Hips': (0, 0, -0.1)})
    m.clip('Punch', [(0, guard), (6, lunge), (14, lunge), (22, guard)])

    def howl(yaw):
        return both(both(mix(guard, {'Chest': (-20, 0, yaw), 'Head': (-28, 0, -yaw), 'Jaw': (35, 0, 0)}), 'UpperArm', (10, -60, 0)), 'LowerArm', (-40, 0, 0))

    m.clip('Roar', [(0, guard), (8, howl(0)), (14, howl(6)), (20, howl(-6)), (26, howl(6)), (38, guard)])

    crumple = both(both(mix(guard, {'Chest': (30, 0, 8), 'Head': (30, 0, 0), '@Hips': (0, 0, -0.5)}), 'UpperLeg', (-80, 0, 0)), 'LowerLeg', (120, 0, 0))
    heap = mix(crumple, {'Hips': (75, 0, 0), '@Hips': (0, -0.4, -0.82), 'Head': (-10, 0, 30)})
    both(heap, 'UpperArm', (-90, -30, 0))
    m.clip('Death', [(0, rest), (6, mix(guard, {'Chest': (-20, 0, 10), '@Hips': (0, 0.08, 0)})), (16, crumple), (24, heap), (27, mix(heap, {'Hips': (72, 0, 0)})), (32, heap)])


# ---------------------------------------------------------------- skeleton warrior

def build_skeleton():
    m = Model('Skeleton', seed=31)
    undead_materials(m)
    m.material('Rust', (0.36, 0.2, 0.12), rough=0.75, metal=0.6)
    m.material('Wood', (0.3, 0.19, 0.1), rough=0.85)
    humanoid_bones(m, 1.0)
    skeleton_body(m, 1.0)
    # dented half-helm
    m.limb('Head', 'Rust', (0, -0.03, 1.79), (0, -0.02, 1.92), 0.145, 0.07, segs=8)
    m.box('Head', 'Rust', (0.03, 0.03, 0.12), (0, -0.165, 1.79))  # nose guard
    # rusty sword (right hand), blade forward
    m.limb('Hand.R', 'Wood', (-0.33, 0.06, 0.92), (-0.33, -0.08, 0.92), 0.02, 0.02, segs=6)
    m.box('Hand.R', 'Rust', (0.18, 0.03, 0.03), (-0.33, -0.1, 0.92))
    m.box('Hand.R', 'Rust', (0.022, 0.62, 0.1), (-0.33, -0.42, 0.92))  # blade on edge: readable from the side and above
    m.spike('Hand.R', 'Rust', (-0.33, -0.72, 0.92), (0, -1, 0), 0.12, 0.05, segs=4, squash=0.3)
    # round shield on the left forearm
    m.limb('LowerArm.L', 'Wood', (0.36, 0.0, 1.1), (0.42, 0.0, 1.1), 0.21, 0.21, segs=10)
    m.limb('LowerArm.L', 'Rust', (0.42, 0.0, 1.1), (0.45, 0.0, 1.1), 0.07, 0.05, segs=8)
    m.limb('LowerArm.L', 'Rust', (0.415, 0.0, 1.1), (0.425, 0.0, 1.1), 0.22, 0.22, segs=10)
    m.build()
    humanoid_clips(m)
    return m


# ---------------------------------------------------------------- death knight

def build_death_knight():
    k = 1.6
    m = Model('DeathKnight', seed=32)
    undead_materials(m, eye=(0.4, 1.0, 0.55))
    m.material('Plate', (0.05, 0.05, 0.07), rough=0.3, metal=0.9)
    m.material('PlateEdge', (0.22, 0.24, 0.26), rough=0.3, metal=0.9)
    m.material('Cape', (0.06, 0.12, 0.08), rough=0.85, double=True)
    S = humanoid_bones(m, k)
    skeleton_body(m, k, ribs=False)
    # cuirass with a glowing rune
    m.box('Chest', 'Plate', S(0.5, 0.32, 0.38), S(0, -0.02, 1.43), taper=1.15, bevel=0.03)
    for s, _ in SIDES:  # V-shaped rune
        m.box('Chest', 'Glow', S(0.035, 0.02, 0.2), S(0.045 * s, -0.19, 1.46), rot=(0, -25 * s, 0))
    m.ball('Chest', 'Glow', 0.025 * k, S(0, -0.19, 1.36))
    m.box('Hips', 'Plate', S(0.42, 0.28, 0.2), S(0, 0.0, 1.05), taper=1.1, bevel=0.02)
    for s, side in SIDES:
        m.ball(f'UpperArm.{side}', 'Plate', 0.14 * k, S(0.27 * s, 0, 1.56), scale=(1.2, 1.1, 0.85))
        m.spike(f'UpperArm.{side}', 'PlateEdge', S(0.3 * s, 0, 1.66), (0.4 * s, 0, 1), 0.22 * k, 0.04 * k, segs=5)
        m.limb(f'LowerArm.{side}', 'Plate', S(0.3 * s, 0.02, 1.18), S(0.33 * s, -0.02, 0.98), 0.055 * k, 0.06 * k, segs=7)
        m.limb(f'LowerLeg.{side}', 'Plate', S(0.13 * s, 0, 0.5), S(0.13 * s, 0.01, 0.14), 0.06 * k, 0.05 * k, segs=7)
        m.box(f'Foot.{side}', 'Plate', S(0.1, 0.22, 0.07), S(0.13 * s, -0.05, 0.05), bevel=0.01)
        m.box(f'UpperLeg.{side}', 'Plate', S(0.12, 0.14, 0.24), S(0.125 * s, -0.02, 0.8), bevel=0.01)
    # horned great helm with a glowing visor slit
    m.box('Head', 'Plate', S(0.26, 0.28, 0.3), S(0, -0.04, 1.77), taper=0.85, bevel=0.03)
    m.box('Head', 'Eye', S(0.16, 0.02, 0.025), S(0, -0.185, 1.78))
    for s, _ in SIDES:
        a, b, c = S(0.12 * s, -0.02, 1.86), S(0.26 * s, 0.0, 1.98), S(0.28 * s, -0.08, 2.16)
        m.limb('Head', 'PlateEdge', a, b, 0.045 * k, 0.035 * k, segs=6)
        m.limb('Head', 'Bone', b, c, 0.035 * k, 0.0, segs=6)
    # cape from the shoulders to the knees (top on the chest, hem on the hips → it sways)
    top = [S(x, 0.17, 1.58) for x in (-0.24, -0.08, 0.08, 0.24)]
    hem = [S(x, 0.32, 0.55) for x in (-0.32, -0.11, 0.11, 0.32)]
    pts = top + hem
    bones = ['Chest'] * 4 + ['Hips'] * 4
    m.poly(bones, 'Cape', pts, [(0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6)])
    # rune greatsword in the right hand, blade forward
    m.limb('Hand.R', 'Plate', S(-0.33, 0.12, 0.92), S(-0.33, -0.1, 0.92), 0.03 * k, 0.03 * k, segs=6)
    m.box('Hand.R', 'PlateEdge', S(0.32, 0.05, 0.05), S(-0.33, -0.12, 0.92))
    m.box('Hand.R', 'Plate', S(0.1, 1.05, 0.025), S(-0.33, -0.66, 0.92))
    m.box('Hand.R', 'Glow', S(0.025, 0.9, 0.03), S(-0.33, -0.62, 0.92))
    m.spike('Hand.R', 'Plate', S(-0.33, -1.18, 0.92), (0, -1, 0), 0.16 * k, 0.05 * k, segs=4, squash=0.25)
    m.build()
    humanoid_clips(m, heavy=True)
    return m


# ---------------------------------------------------------------- wraith

def build_wraith():
    m = Model('Wraith', seed=33)
    undead_materials(m, eye=(0.55, 1.0, 0.9))
    m.material('Robe', (0.07, 0.1, 0.14), rough=0.9, double=True)
    m.material('RobeEdge', (0.16, 0.26, 0.3), rough=0.9, double=True)
    m.material('Void', (0.0, 0.0, 0.0), rough=1.0)
    m.bone('Root', (0, 0, 0))
    m.bone('Body', (0, 0, 0.6), 'Root')
    m.bone('Tail', (0, 0.05, 0.35), 'Body')
    m.bone('Chest', (0, 0, 1.2), 'Body')
    m.bone('Head', (0, -0.02, 1.52), 'Chest')
    for s, side in SIDES:
        m.bone(f'UpperArm.{side}', (0.22 * s, 0, 1.42), 'Chest')
        m.bone(f'LowerArm.{side}', (0.4 * s, -0.05, 1.12), f'UpperArm.{side}')
        m.bone(f'Hand.{side}', (0.48 * s, -0.16, 0.86), f'LowerArm.{side}')

    m.limb('Body', 'Robe', (0, 0, 1.4), (0, 0.04, 0.42), 0.2, 0.42, segs=9)
    m.limb('Chest', 'Robe', (0, 0, 1.15), (0, 0, 1.48), 0.26, 0.2, segs=9)
    for i in range(11):  # tattered hem
        a = i / 11 * math.tau
        x, y = math.cos(a) * 0.38, math.sin(a) * 0.38 + 0.04
        m.spike('Tail', 'RobeEdge' if i % 2 else 'Robe', (x, y, 0.45), (x * 0.5, y * 0.5, -1), 0.35 + (i % 3) * 0.12, 0.1, segs=4)
    # hood around a void face
    m.limb('Head', 'Robe', (0, 0.04, 1.42), (0, 0.16, 1.92), 0.24, 0.02, segs=9)
    m.ball('Head', 'Void', 0.15, (0, -0.07, 1.6), scale=(1.0, 0.8, 1.1))
    for s, _ in SIDES:
        m.ball('Head', 'Eye', 0.03, (0.055 * s, -0.19, 1.63), scale=(1.4, 1, 0.8))
    for s, side in SIDES:
        m.limb(f'UpperArm.{side}', 'Robe', (0.2 * s, 0, 1.42), (0.4 * s, -0.05, 1.12), 0.09, 0.15, segs=7)
        m.limb(f'LowerArm.{side}', 'Bone', (0.4 * s, -0.05, 1.12), (0.48 * s, -0.16, 0.88), 0.025, 0.02, segs=5)
        m.spike(f'LowerArm.{side}', 'RobeEdge', (0.4 * s, -0.05, 1.08), (0.2 * s, 0.1, -1), 0.3, 0.13, segs=5)
        for dx in (-0.04, 0, 0.04):
            m.spike(f'Hand.{side}', 'Bone', (0.48 * s + dx, -0.17, 0.86), (dx, -0.4, -1), 0.2, 0.014, segs=4)
    m.build()

    rest = {}
    drift = both(both({'Chest': (6, 0, 0), 'Tail': (0, 0, 0)}, 'UpperArm', (-20, -15, 0)), 'LowerArm', (-30, 0, 0))
    drift_b = mix(drift, {'Chest': (10, 0, 4), 'Tail': (12, 0, 8), '@Body': (0, 0, 0.08)})
    m.clip('Idle', [(0, drift), (30, drift_b), (60, drift)], loop=True)
    glide = mix(both(drift, 'UpperArm', (20, -25, 0)), {'Chest': (22, 0, 0), 'Body': (10, 0, 0), 'Tail': (-30, 0, 0)})
    glide_b = mix(glide, {'Tail': (-38, 0, 10), '@Body': (0, 0, 0.06)})
    m.clip('Walk', [(0, glide), (16, glide_b), (32, glide)], loop=True)
    reach = both(both({'Chest': (-12, 0, 0), 'Head': (-8, 0, 0), 'Tail': (10, 0, 0)}, 'UpperArm', (-40, -40, 0)), 'LowerArm', (-60, 0, 0))
    thrust = both(both({'Chest': (20, 0, 0), 'Head': (-14, 0, 0), 'Tail': (-20, 0, 0), '@Body': (0, -0.15, 0)}, 'UpperArm', (-100, -5, 0)), 'LowerArm', (-5, 0, 0))
    m.clip('Attack', [(0, drift), (8, reach), (12, thrust), (18, thrust), (28, drift)])
    m.clip('Death', [(0, rest), (6, mix(reach, {'Head': (-30, 0, 0)})),
                     (20, both(mix({'Chest': (40, 0, 0), 'Body': (20, 0, 0), '@Body': (0, 0, -0.45), 'Head': (30, 0, 0)}), 'UpperArm', (-150, -10, 0))),
                     (28, both(mix({'Chest': (50, 0, 0), 'Body': (30, 0, 0), '@Body': (0, 0, -0.6), 'Head': (40, 0, 0)}), 'UpperArm', (-160, -10, 0)))])
    return m


# ---------------------------------------------------------------- necromancer

def build_necromancer():
    m = Model('Necromancer', seed=34)
    undead_materials(m)
    m.material('Robe', (0.07, 0.04, 0.09), rough=0.85, double=True)
    m.material('RobeTrim', (0.25, 0.3, 0.18), rough=0.6, metal=0.4)
    m.material('Iron', (0.1, 0.1, 0.11), rough=0.4, metal=0.85)
    m.material('Wood', (0.14, 0.1, 0.08), rough=0.85)

    m.bone('Root', (0, 0, 0))
    m.bone('Hips', (0, 0, 1.4), 'Root')
    m.bone('Skirt', (0, 0.05, 0.8), 'Hips')
    m.bone('Spine', (0, 0, 1.8), 'Hips')
    m.bone('Chest', (0, 0, 2.2), 'Spine')
    m.bone('Head', (0, -0.08, 2.8), 'Chest')
    m.bone('Jaw', (0, -0.12, 2.86), 'Head')
    for s, side in SIDES:
        m.bone(f'UpperArm.{side}', (0.46 * s, 0, 2.62), 'Chest')
        m.bone(f'LowerArm.{side}', (0.64 * s, 0.02, 2.1), f'UpperArm.{side}')
        m.bone(f'Hand.{side}', (0.72 * s, -0.12, 1.62), f'LowerArm.{side}')
    m.bone('Staff', (-0.74, -0.16, 1.55), 'Hand.R')

    # robe: waist to floor, tattered hem
    m.limb('Hips', 'Robe', (0, 0, 1.75), (0, 0.04, 1.0), 0.36, 0.55, segs=10)
    m.limb('Skirt', 'Robe', (0, 0.04, 1.02), (0, 0.08, 0.06), 0.55, 0.9, segs=10)
    m.limb('Skirt', 'RobeTrim', (0, 0.08, 0.12), (0, 0.08, 0.04), 0.91, 0.92, segs=10)
    for i in range(12):
        a = i / 12 * math.tau
        x, y = math.cos(a) * 0.88, math.sin(a) * 0.88 + 0.08
        m.spike('Skirt', 'Robe', (x, y, 0.15), (x * 0.3, y * 0.3, -1), 0.2 + (i % 3) * 0.06, 0.18, segs=4)
    # belt of skulls
    m.limb('Hips', 'RobeTrim', (0, 0, 1.58), (0, 0, 1.68), 0.39, 0.38, segs=10)
    for a in (-0.9, -0.3, 0.3, 0.9):
        x, y = math.sin(a) * 0.4, -math.cos(a) * 0.4
        m.ball('Hips', 'Bone', 0.085, (x, y, 1.6), scale=(1, 0.9, 1.05))
        m.ball('Hips', 'Eye', 0.016, (x * 1.12 - 0.02, y * 1.12, 1.62))
        m.ball('Hips', 'Eye', 0.016, (x * 1.12 + 0.02, y * 1.12, 1.62))

    # torso: open robe over an exposed ribcage with a soul-fire heart
    m.box('Spine', 'Robe', (0.66, 0.42, 0.5), (0, 0.05, 1.95), taper=1.15)
    m.box('Chest', 'Robe', (0.82, 0.44, 0.6), (0, 0.08, 2.45), taper=1.1)
    m.ball('Chest', 'Glow', 0.17, (0, -0.12, 2.35), scale=(1, 0.7, 1.2))
    for z in (2.22, 2.34, 2.46, 2.58):
        for s, _ in SIDES:
            pts = [(0.03 * s, 0.0, z), (0.22 * s, -0.08, z - 0.03), (0.2 * s, -0.24, z - 0.07), (0.04 * s, -0.27, z - 0.08)]
            for a, b in zip(pts, pts[1:]):
                m.limb('Chest', 'Bone', a, b, 0.025, 0.025, segs=5)
    m.box('Chest', 'Bone', (0.05, 0.04, 0.42), (0, -0.28, 2.4))
    # spiked collar behind the head
    for i, a in enumerate((-1.2, -0.7, -0.25, 0.25, 0.7, 1.2)):
        x, y = math.sin(a) * 0.32, math.cos(a) * 0.28 + 0.05
        m.spike('Chest', 'Robe', (x, y, 2.66), (x * 0.6, 0.4, 1), 0.42 + (0.14 if abs(a) < 0.5 else 0), 0.09, segs=4)
    # bone pauldrons: a skull on each shoulder
    for s, side in SIDES:
        m.ball(f'UpperArm.{side}', 'Bone', 0.2, (0.5 * s, 0.0, 2.72), scale=(1.1, 1.0, 0.9))
        m.ball(f'UpperArm.{side}', 'Eye', 0.025, (0.45 * s, -0.19, 2.72))
        m.ball(f'UpperArm.{side}', 'Eye', 0.025, (0.56 * s, -0.19, 2.72))
        for dz, ln in ((0.0, 0.32), (0.14, 0.22)):
            m.spike(f'UpperArm.{side}', 'Bone', (0.55 * s, 0.05, 2.8 + dz), (0.6 * s, 0.1, 1), ln, 0.05, segs=5)
        # flared sleeves, skeletal hands
        m.limb(f'UpperArm.{side}', 'Robe', (0.46 * s, 0, 2.6), (0.64 * s, 0.02, 2.1), 0.15, 0.17, segs=8)
        m.limb(f'LowerArm.{side}', 'Robe', (0.64 * s, 0.02, 2.12), (0.72 * s, -0.1, 1.72), 0.16, 0.27, segs=8)
        m.limb(f'LowerArm.{side}', 'RobeTrim', (0.72 * s, -0.1, 1.74), (0.725 * s, -0.11, 1.7), 0.28, 0.28, segs=8)
        m.box(f'Hand.{side}', 'Bone', (0.09, 0.1, 0.08), (0.72 * s, -0.13, 1.6))
        for dy in (-0.05, -0.015, 0.02):
            m.spike(f'Hand.{side}', 'Bone', (0.72 * s, -0.14 + dy, 1.56), (0, -0.3, -1), 0.16, 0.015, segs=4)

    # head: skull in a deep hood, iron circlet with a green gem
    m.ball('Head', 'Bone', 0.19, (0, -0.16, 3.0), scale=(1, 1.1, 1.05))
    m.ball('Head', 'BoneDark', 0.09, (0, -0.3, 2.95), scale=(1.4, 0.6, 0.8))
    for s, _ in SIDES:
        m.ball('Head', 'Eye', 0.04, (0.07 * s, -0.32, 3.02), scale=(1.2, 1, 0.9))
    m.box('Jaw', 'Bone', (0.2, 0.16, 0.06), (0, -0.28, 2.86))
    m.limb('Head', 'Robe', (0, 0.0, 2.82), (0, 0.24, 3.55), 0.34, 0.03, segs=10)
    m.limb('Head', 'Iron', (0, -0.1, 3.12), (0, -0.1, 3.16), 0.2, 0.2, segs=10)
    m.crystal('Head', 'Glow', (0, -0.3, 3.15), (0, -0.2, 1), 0.16, 0.04)

    # staff: dark wood shaft, iron ring, horned skull and a soul-fire orb
    m.limb('Staff', 'Wood', (-0.74, -0.16, 0.2), (-0.74, -0.16, 3.4), 0.045, 0.04, segs=7)
    m.limb('Staff', 'Iron', (-0.74, -0.16, 3.25), (-0.74, -0.16, 3.32), 0.08, 0.08, segs=7)
    m.ball('Staff', 'Bone', 0.13, (-0.74, -0.2, 3.48), scale=(1, 1.1, 1))
    for s in (1, -1):
        m.ball('Staff', 'Eye', 0.022, (-0.74 + 0.045 * s, -0.31, 3.5))
        m.limb('Staff', 'BoneDark', (-0.74 + 0.08 * s, -0.16, 3.56), (-0.74 + 0.24 * s, -0.12, 3.74), 0.035, 0.02, segs=5)
        m.spike('Staff', 'Bone', (-0.74 + 0.24 * s, -0.12, 3.74), (0.2 * s, 0, 1), 0.2, 0.02, segs=4)
    m.ball('Staff', 'Glow', 0.15, (-0.74, -0.16, 3.82))

    m.build()

    rest = {}
    hold = both({'Chest': (4, 0, 0), 'Head': (-8, 0, 0)}, 'LowerArm', (-25, 0, 0))
    hold.update({'UpperArm.L': (-8, -14, 0), 'UpperArm.R': (-12, 8, 0)})
    hover = mix(hold, {'@Hips': (0, 0, 0.08), 'Skirt': (6, 0, 4), 'Chest': (7, 0, 2), 'Jaw': (8, 0, 0)})
    m.clip('Idle', [(0, hold), (36, hover), (72, hold)], loop=True)
    glide = mix(hold, {'Hips': (8, 0, 0), 'Skirt': (-14, 0, 0), 'Chest': (10, 0, 0)})
    m.clip('Walk', [(0, glide), (16, mix(glide, {'Skirt': (-18, 0, 6), '@Hips': (0, 0, 0.06)})), (32, glide)], loop=True)
    # Attack: staff thrust, the bolt leaves at frame 12
    aim = mix(hold, {'Chest': (-10, 0, -15), 'UpperArm.R': (-70, 20, 0), 'LowerArm.R': (-40, 0, 0), 'UpperArm.L': (-40, -30, 0), 'Jaw': (25, 0, 0)})
    thrust = mix(hold, {'Chest': (14, 0, 10), 'UpperArm.R': (-95, 5, 0), 'LowerArm.R': (-5, 0, 0), 'UpperArm.L': (10, -35, 0), 'Skirt': (-8, 0, 0)})
    m.clip('Attack', [(0, hold), (8, aim), (12, thrust), (18, thrust), (28, hold)])
    # Punch = summoning: both arms raised, staff high, head thrown back (the dead rise at frame 16)
    raise_ = both(mix(hold, {'Chest': (-16, 0, 0), 'Head': (-22, 0, 0), 'Jaw': (35, 0, 0), '@Hips': (0, 0, 0.18), 'Skirt': (10, 0, 0)}), 'UpperArm', (-150, -25, 0))
    both(raise_, 'LowerArm', (-20, 0, 0))
    slam = both(mix(hold, {'Chest': (18, 0, 0), 'Head': (6, 0, 0), '@Hips': (0, 0, -0.05)}), 'UpperArm', (-40, -35, 0))
    m.clip('Punch', [(0, hold), (10, raise_), (14, raise_), (18, slam), (30, hold)])

    def howl(yaw):
        p = both(mix(hold, {'Chest': (-20, 0, yaw), 'Head': (-30, 0, -yaw), 'Jaw': (40, 0, 0), '@Hips': (0, 0, 0.12)}), 'UpperArm', (0, -75, 0))
        return both(p, 'LowerArm', (-30, 0, 0))

    m.clip('Roar', [(0, hold), (8, howl(0)), (14, howl(6)), (20, howl(-6)), (26, howl(6)), (40, hold)])
    stagger = mix(hold, {'Chest': (-24, 0, 14), 'Head': (-30, 0, 10), 'Jaw': (40, 0, 0), '@Hips': (0, 0.15, 0.05)})
    sink = both(mix(hold, {'Chest': (35, 0, 0), 'Head': (35, 0, 0), '@Hips': (0, 0, -0.75), 'Skirt': (0, 0, 0)}), 'UpperArm', (-30, -10, 0))
    gone = both(mix(sink, {'Hips': (60, 0, 0), '@Hips': (0, -0.5, -1.15)}), 'UpperArm', (-120, -30, 0))
    m.clip('Death', [(0, rest), (8, stagger), (24, sink), (36, gone), (40, mix(gone, {'Hips': (57, 0, 0)})), (48, gone)])
    return m


PREVIEW = [(None, 0), ('Idle', 24), ('Walk', 0), ('Walk', 8), ('Attack', 8), ('Attack', 12), ('Punch', 6), ('Roar', 14), ('Death', 16), ('Death', 24)]
PREVIEW_BUILD_WRAITH = [(None, 0), ('Idle', 30), ('Walk', 16), ('Attack', 8), ('Attack', 12), ('Death', 20)]
PREVIEW_BUILD_NECROMANCER = [(None, 0), ('Idle', 36), ('Walk', 16), ('Attack', 8), ('Attack', 12), ('Punch', 12), ('Punch', 18), ('Roar', 14), ('Death', 24), ('Death', 36)]
