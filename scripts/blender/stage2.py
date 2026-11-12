"""
Regular enemies of rooms 11–19 — all built from scratch:

Troll   hulking, hunched brute: mossy green hide, big belly, long arms, tusks, a spiked log club.
Bee     giant striped wasp-bee: fuzzy thorax, banded abdomen with a glowing stinger, two pairs of wings.
Plant   carnivorous flower (식인꽃): a toothy bulb on a thick stem, red petals, leaves and roots.

See bosskit.py for the modelling helpers and axis conventions.
"""
from bosskit import Model
from undead import both, humanoid_bones, humanoid_clips, mix

SIDES = ((1, 'L'), (-1, 'R'))


# ---------------------------------------------------------------- troll

def build_troll():
    k = 1.3
    S = lambda *v: tuple(c * k for c in v)  # noqa: E731
    m = Model('Troll', seed=41)
    m.material('Hide', (0.28, 0.42, 0.22), rough=0.85)
    m.material('HideDark', (0.17, 0.28, 0.14), rough=0.9)
    m.material('Belly', (0.48, 0.55, 0.36), rough=0.85)
    m.material('Tusk', (0.92, 0.88, 0.72), rough=0.45)
    m.material('Eye', (1.0, 0.8, 0.2), rough=0.2, emit=(1.0, 0.65, 0.1), strength=5.0)
    m.material('Wood', (0.36, 0.23, 0.12), rough=0.9)
    m.material('Iron', (0.4, 0.4, 0.42), rough=0.5, metal=0.7)
    m.material('Cloth', (0.38, 0.27, 0.16), rough=0.95)
    m.material('Hair', (0.12, 0.1, 0.08), rough=1.0)
    humanoid_bones(m, k)

    # torso: broad hunched back, round belly
    m.ball('Chest', 'Hide', 0.34 * k, S(0, 0.04, 1.42), scale=(1.25, 0.95, 0.9), jitter=0.015)
    m.ball('Chest', 'HideDark', 0.2 * k, S(0, 0.16, 1.55), scale=(1.4, 0.8, 0.7))  # hump
    m.ball('Spine', 'Belly', 0.3 * k, S(0, -0.06, 1.12), scale=(1.1, 1.0, 0.95), jitter=0.01)
    m.ball('Hips', 'Hide', 0.26 * k, S(0, 0.0, 0.94), scale=(1.15, 0.9, 0.7))
    m.box('Hips', 'Cloth', S(0.5, 0.36, 0.2), S(0, 0, 0.84), taper=1.15, bevel=0.02)
    m.box('Hips', 'Cloth', S(0.22, 0.04, 0.28), S(0, -0.18, 0.66), taper=1.2)
    # back hair tufts
    for i, z in enumerate((1.5, 1.62, 1.72)):
        m.spike('Chest', 'Hair', S(0, 0.2 - i * 0.03, z), (0, 0.8, 0.6), 0.16 * k, 0.05 * k, segs=5)

    # head: low-slung, big jaw, nose, ears, tusks
    m.ball('Head', 'Hide', 0.17 * k, S(0, -0.12, 1.72), scale=(1.1, 1.0, 0.95), jitter=0.01)
    m.ball('Head', 'HideDark', 0.08 * k, S(0, -0.19, 1.79), scale=(1.9, 0.7, 0.5))  # brow ridge
    m.ball('Head', 'Hide', 0.06 * k, S(0, -0.28, 1.72), scale=(0.9, 1.0, 1.2))  # nose
    for s, _ in SIDES:
        m.ball('Head', 'Eye', 0.026 * k, S(0.07 * s, -0.25, 1.76))
        m.spike('Head', 'Hide', S(0.15 * s, -0.1, 1.76), (s, 0.4, 0.35), 0.17 * k, 0.05 * k, segs=4, squash=0.4)  # ears
    m.box('Jaw', 'Hide', S(0.26, 0.2, 0.1), S(0, -0.18, 1.6), taper=1.15, bevel=0.015)
    for s, _ in SIDES:
        m.spike('Jaw', 'Tusk', S(0.08 * s, -0.27, 1.62), (0.2 * s, -0.25, 1), 0.13 * k, 0.025 * k, segs=5)
    m.limb('Head', 'Hair', S(0, -0.06, 1.86), S(0, 0.06, 1.95), 0.05 * k, 0.0, segs=5)

    # arms: thick, long, big fists
    for s, side in SIDES:
        m.ball(f'UpperArm.{side}', 'HideDark', 0.13 * k, S(0.27 * s, 0, 1.52))
        m.limb(f'UpperArm.{side}', 'Hide', S(0.27 * s, 0, 1.5), S(0.32 * s, 0.02, 1.22), 0.1 * k, 0.085 * k, segs=7, jitter=0.01)
        m.ball(f'LowerArm.{side}', 'Hide', 0.085 * k, S(0.32 * s, 0.02, 1.22))
        m.limb(f'LowerArm.{side}', 'Hide', S(0.32 * s, 0.02, 1.22), S(0.34 * s, -0.02, 0.98), 0.09 * k, 0.075 * k, segs=7)
        m.ball(f'Hand.{side}', 'HideDark', 0.09 * k, S(0.34 * s, -0.04, 0.9), scale=(1, 1.1, 0.95))
        for dy in (-0.05, 0.0, 0.05):
            m.spike(f'Hand.{side}', 'Tusk', S(0.36 * s, -0.08 + dy, 0.86), (0.2 * s, -0.6, -1), 0.06 * k, 0.014 * k, segs=4)
        # legs: short, thick, wide feet
        m.limb(f'UpperLeg.{side}', 'Hide', S(0.14 * s, 0, 0.9), S(0.15 * s, 0, 0.52), 0.11 * k, 0.09 * k, segs=7)
        m.ball(f'LowerLeg.{side}', 'HideDark', 0.09 * k, S(0.15 * s, -0.01, 0.52))
        m.limb(f'LowerLeg.{side}', 'Hide', S(0.15 * s, 0, 0.52), S(0.15 * s, 0.02, 0.12), 0.09 * k, 0.08 * k, segs=7)
        m.box(f'Foot.{side}', 'HideDark', S(0.17, 0.28, 0.08), S(0.15 * s, -0.06, 0.05), bevel=0.02)
        for dx in (-0.05, 0.0, 0.05):
            m.spike(f'Foot.{side}', 'Tusk', S(0.15 * s + dx, -0.2, 0.05), (0, -1, 0), 0.05 * k, 0.018 * k, segs=4)

    # spiked log club in the right hand, hanging down and forward
    hand = S(-0.34, -0.06, 0.9)
    tip = S(-0.34, -0.3, 0.2)
    m.limb('Hand.R', 'Wood', hand, tip, 0.045 * k, 0.11 * k, segs=7, jitter=0.008)
    for t, (dx, dy, dz) in ((0.6, (1, 0, 0)), (0.7, (-1, -0.3, 0)), (0.8, (0, -1, 0.2)), (0.9, (0.6, 0.6, 0)), (0.95, (-0.5, 0.5, 0.3))):
        p = tuple(a + (b - a) * t for a, b in zip(hand, tip))
        m.spike('Hand.R', 'Iron', p, (dx, dy, dz), 0.1 * k, 0.025 * k, segs=4)
    m.limb('Hand.R', 'Iron', S(-0.34, -0.1, 0.82), S(-0.34, -0.12, 0.76), 0.06 * k, 0.06 * k, segs=7)  # iron band

    m.build()
    humanoid_clips(m, heavy=True)
    guard = both(both({'Chest': (6, 0, 0), 'Head': (-6, 0, 0)}, 'UpperArm', (-10, -8, 0)), 'LowerArm', (-25, 0, 0))
    m.clip('Hit', [(0, guard), (4, mix(guard, {'Chest': (-18, 0, 8), 'Head': (-14, 0, 0), '@Hips': (0, 0.08, 0)})), (12, guard)])
    return m


# ---------------------------------------------------------------- bee

def build_bee():
    m = Model('Bee', seed=42)
    m.material('Yellow', (0.95, 0.68, 0.08), rough=0.55)
    m.material('Black', (0.06, 0.05, 0.04), rough=0.6)
    m.material('Fuzz', (0.82, 0.55, 0.12), rough=1.0)
    m.material('Wing', (0.55, 0.66, 0.74), rough=0.35, double=True)
    m.material('Eye', (0.9, 0.15, 0.1), rough=0.15, emit=(1.0, 0.15, 0.05), strength=3.5)
    m.material('Sting', (1.0, 0.85, 0.5), rough=0.3, emit=(1.0, 0.55, 0.1), strength=2.5)

    z = 0.55  # body centre height (the game adds the hover height on top)
    m.bone('Root', (0, 0, 0))
    m.bone('Body', (0, 0, z), 'Root')
    m.bone('Head', (0, -0.22, z + 0.02), 'Body')
    m.bone('Abdomen', (0, 0.16, z), 'Body')
    for s, S in SIDES:
        m.bone(f'Wing.{S}', (0.1 * s, -0.02, z + 0.16), 'Body')
        m.bone(f'HindWing.{S}', (0.1 * s, 0.1, z + 0.14), 'Body')
        m.bone(f'Leg.{S}', (0.08 * s, -0.02, z - 0.12), 'Body')

    # thorax
    m.ball('Body', 'Fuzz', 0.2, (0, -0.02, z), scale=(1.0, 1.05, 0.95), jitter=0.01)
    m.ball('Body', 'Black', 0.12, (0, 0.02, z + 0.12), scale=(1.3, 1.2, 0.6))
    # head: black with big red compound eyes, antennae, mandibles
    m.ball('Head', 'Black', 0.14, (0, -0.3, z + 0.02), scale=(1.1, 0.9, 1.0))
    for s, _ in SIDES:
        m.ball('Head', 'Eye', 0.075, (0.09 * s, -0.34, z + 0.05), scale=(0.75, 0.9, 1.2))
        m.limb('Head', 'Black', (0.04 * s, -0.38, z + 0.13), (0.12 * s, -0.5, z + 0.3), 0.012, 0.01, segs=4)
        m.ball('Head', 'Black', 0.025, (0.12 * s, -0.5, z + 0.3))
        m.spike('Head', 'Black', (0.04 * s, -0.42, z - 0.06), (-0.4 * s, -1, -0.3), 0.08, 0.02, segs=4)
    # abdomen: striped, pointing back and slightly down, glowing stinger
    bands = [('Yellow', 0.17, 0.2), ('Black', 0.21, 0.32), ('Yellow', 0.22, 0.44), ('Black', 0.2, 0.56), ('Yellow', 0.16, 0.67), ('Black', 0.1, 0.76)]
    for mat, r, y in bands:
        m.ball('Abdomen', mat, r, (0, y + 0.08, z - (y - 0.2) * 0.35), scale=(1.0, 0.55, 0.95))
    m.spike('Abdomen', 'Sting', (0, 0.84, z - 0.22), (0, 0.6, -0.5), 0.2, 0.035, segs=5)
    # wings: thin flat leaves pointing out and back
    for s, S in SIDES:
        root = (0.1 * s, -0.02, z + 0.16)
        m.poly(f'Wing.{S}', 'Wing',
               [root, (0.45 * s, -0.08, z + 0.24), (0.7 * s, 0.1, z + 0.26), (0.55 * s, 0.26, z + 0.22), (0.2 * s, 0.14, z + 0.18)],
               [(0, 1, 2, 3, 4)] if s > 0 else [(4, 3, 2, 1, 0)])
        hr = (0.1 * s, 0.1, z + 0.14)
        m.poly(f'HindWing.{S}', 'Wing',
               [hr, (0.35 * s, 0.12, z + 0.2), (0.48 * s, 0.3, z + 0.2), (0.2 * s, 0.32, z + 0.16)],
               [(0, 1, 2, 3)] if s > 0 else [(3, 2, 1, 0)])
        # legs dangling
        for dy in (-0.08, 0.02, 0.12):
            m.limb(f'Leg.{S}', 'Black', (0.08 * s, dy, z - 0.12), (0.16 * s, dy + 0.05, z - 0.32), 0.018, 0.012, segs=4)

    m.build()

    def flap(up, sting=0.0, pitch=0.0):
        a = 55 if up else -30
        p = {'Body': (pitch, 0, 0), 'Abdomen': (sting, 0, 0)}
        for s, S in SIDES:
            p[f'Wing.{S}'] = (0, -a * s, 0)
            p[f'HindWing.{S}'] = (0, -(a * 0.8) * s, 0)
            p[f'Leg.{S}'] = (10, 0, 0)
        return p

    hover = [(0, mix(flap(True), {'@Body': (0, 0, 0.04)})), (2, flap(False)), (4, mix(flap(True), {'@Body': (0, 0, -0.02)})), (6, flap(False)), (8, mix(flap(True), {'@Body': (0, 0, 0.04)}))]
    m.clip('Flying', hover, loop=True)
    # Attack: pull back, then curl the abdomen forward to sting (hit at frame 9).
    m.clip('Attack', [(0, flap(True)), (3, flap(False, sting=-25, pitch=-15)), (5, flap(True, sting=-30, pitch=-20)),
                      (9, mix(flap(False, sting=70, pitch=25), {'@Body': (0, -0.15, -0.05)})), (12, flap(True, sting=70, pitch=25)), (18, flap(False))])
    m.clip('Hit', [(0, flap(True)), (3, mix(flap(False, pitch=-30), {'@Body': (0, 0.12, 0.05)})), (8, flap(True))])
    m.clip('Death', [(0, flap(True)), (4, flap(False, pitch=-30)), (12, mix(flap(False, sting=-30, pitch=-80), {'@Body': (0, 0, -0.3), 'Root': (0, 70, 0)})),
                     (20, mix(flap(False, sting=-30, pitch=-90), {'@Body': (0, 0, -0.45), 'Root': (0, 90, 0)}))])
    return m


# ---------------------------------------------------------------- carnivorous plant

def build_plant():
    m = Model('Plant', seed=43)
    m.material('Stem', (0.22, 0.48, 0.16), rough=0.7)
    m.material('StemDark', (0.13, 0.3, 0.1), rough=0.8)
    m.material('Pod', (0.55, 0.12, 0.18), rough=0.5)
    m.material('PodSpots', (0.95, 0.85, 0.4), rough=0.6)
    m.material('Petal', (0.85, 0.16, 0.22), rough=0.55, double=True)
    m.material('Mouth', (0.35, 0.02, 0.06), rough=0.4, emit=(0.6, 0.05, 0.12), strength=1.4)
    m.material('Tooth', (0.95, 0.93, 0.82), rough=0.35)
    m.material('Root', (0.35, 0.24, 0.14), rough=0.95)

    m.bone('Root', (0, 0, 0))
    m.bone('Stem', (0, 0, 0.1), 'Root')
    m.bone('Neck', (0, -0.05, 0.75), 'Stem')
    m.bone('Head', (0, -0.15, 1.3), 'Neck')
    m.bone('Jaw', (0, -0.15, 1.26), 'Head')
    for s, S in SIDES:
        m.bone(f'Leaf.{S}', (0.12 * s, 0.0, 0.18), 'Root')
        m.bone(f'BackLeaf.{S}', (0.1 * s, 0.12, 0.15), 'Root')

    # roots and base
    m.ball('Root', 'Root', 0.32, (0, 0, 0.06), scale=(1.2, 1.2, 0.35), jitter=0.02)
    for i in range(7):
        a = i / 7 * 6.283
        import math
        d = (math.sin(a), math.cos(a), -0.15)
        m.limb('Root', 'Root', (0.15 * d[0], 0.15 * d[1], 0.08), (0.62 * d[0], 0.62 * d[1], 0.0), 0.06, 0.012, segs=5)
    # thick curved stem
    m.limb('Stem', 'Stem', (0, 0, 0.08), (0, -0.02, 0.45), 0.13, 0.11, segs=8)
    m.limb('Stem', 'Stem', (0, -0.02, 0.45), (0, -0.05, 0.78), 0.11, 0.1, segs=8)
    m.limb('Neck', 'Stem', (0, -0.05, 0.76), (0, -0.12, 1.12), 0.1, 0.09, segs=8)
    for z, s in ((0.35, 1), (0.6, -1), (0.95, 1)):
        m.spike('Stem' if z < 0.75 else 'Neck', 'StemDark', (0.09 * s, -0.04, z), (s, -0.2, 0.4), 0.14, 0.03, segs=4)
    # leaves: big flat blades on the ground
    for s, S in SIDES:
        for bone, ang, ln in ((f'Leaf.{S}', -0.35, 0.95), (f'BackLeaf.{S}', 0.55, 0.8)):
            bx, by = 0.12 * s, (0.0 if 'Back' not in bone else 0.12)
            dx, dy = s * 1.0, ang
            pts = [(bx, by, 0.18), (bx + dx * ln * 0.45 + 0.08 * s, by + dy * ln * 0.45 - 0.18, 0.3),
                   (bx + dx * ln, by + dy * ln, 0.12), (bx + dx * ln * 0.45 - 0.02 * s, by + dy * ln * 0.45 + 0.18, 0.28)]
            faces = [(0, 1, 2, 3)] if s > 0 else [(3, 2, 1, 0)]
            m.poly(bone, 'Stem', pts, faces)
            m.poly(bone, 'StemDark', pts, [f[::-1] for f in faces])

    # head pod: upper skull with lid, spots, petals; lower jaw; teeth
    hz = 1.3
    m.ball('Head', 'Pod', 0.3, (0, -0.2, hz + 0.08), scale=(1.0, 1.15, 0.72), jitter=0.01)
    m.ball('Head', 'Mouth', 0.25, (0, -0.24, hz - 0.01), scale=(0.95, 1.1, 0.35))
    for x, y in ((-0.14, -0.2), (0.12, -0.32), (0.0, -0.08), (0.18, -0.12), (-0.08, -0.4)):
        m.ball('Head', 'PodSpots', 0.045, (x, y, hz + 0.27), scale=(1, 1, 0.4))
    m.box('Jaw', 'Pod', (0.52, 0.56, 0.1), (0, -0.24, hz - 0.12), taper=1.15, bevel=0.04)
    for i in range(7):
        t = i / 6
        import math
        a = math.pi * (0.15 + 0.7 * t)
        x, y = math.cos(a) * 0.24, -0.24 - math.sin(a) * 0.26
        m.spike('Head', 'Tooth', (x, y, hz - 0.01), (0, 0, -1), 0.11, 0.03, segs=4)
        m.spike('Jaw', 'Tooth', (x * 0.92, y + 0.02, hz - 0.08), (0, 0, 1), 0.09, 0.028, segs=4)
    # petal collar behind the head
    for i in range(8):
        import math
        a = i / 8 * 6.283
        c, s_ = math.cos(a), math.sin(a)
        base = (0.0, -0.08, hz)
        tip = (c * 0.55, -0.08 + 0.2, hz + s_ * 0.5)
        side = (-s_ * 0.16, 0.0, c * 0.16)
        pts = [base, (tip[0] * 0.5 + side[0], tip[1] * 0.6, base[2] + (tip[2] - base[2]) * 0.5 + side[2]), tip,
               (tip[0] * 0.5 - side[0], tip[1] * 0.6, base[2] + (tip[2] - base[2]) * 0.5 - side[2])]
        m.poly('Head', 'Petal', pts, [(0, 1, 2, 3)])

    m.build()

    def sway(k):
        return {'Stem': (k * 4, k * 5, 0), 'Neck': (k * 5, -k * 6, k * 4), 'Head': (-k * 4, 0, -k * 3), 'Jaw': (6 + k * 4, 0, 0),
                'Leaf.L': (0, -k * 4, 0), 'Leaf.R': (0, -k * 4, 0)}

    m.clip('Idle', [(0, sway(1)), (30, sway(-1)), (60, sway(1))], loop=True)
    # Attack: rear back with jaw wide, then snap forward (spit / bite at frame 12).
    rear = {'Stem': (-12, 0, 0), 'Neck': (-25, 0, 0), 'Head': (-15, 0, 0), 'Jaw': (55, 0, 0), '@Stem': (0, 0.08, 0)}
    snap = {'Stem': (14, 0, 0), 'Neck': (22, 0, 0), 'Head': (8, 0, 0), 'Jaw': (5, 0, 0), '@Stem': (0, -0.1, -0.02)}
    m.clip('Attack', [(0, sway(0)), (9, rear), (12, snap), (17, snap), (28, sway(0))])
    m.clip('Hit', [(0, sway(0)), (3, {'Stem': (-10, 6, 0), 'Neck': (-14, 0, 0), 'Head': (-10, 0, 0), 'Jaw': (25, 0, 0)}), (10, sway(0))])
    wilt = {'Stem': (35, 10, 0), 'Neck': (55, 0, 0), 'Head': (40, 0, 0), 'Jaw': (40, 0, 0), 'Leaf.L': (0, 30, 0), 'Leaf.R': (0, -30, 0),
            'BackLeaf.L': (0, 25, 0), 'BackLeaf.R': (0, -25, 0)}
    m.clip('Death', [(0, sway(0)), (5, {'Neck': (-20, 0, 0), 'Jaw': (60, 0, 0)}), (18, wilt), (24, mix(wilt, {'Stem': (40, 10, 0)})), (30, wilt)])
    return m


PREVIEW_BUILD_TROLL = [(None, 0), ('Idle', 24), ('Walk', 0), ('Walk', 8), ('Attack', 8), ('Attack', 12), ('Hit', 4), ('Death', 16), ('Death', 32)]
PREVIEW_BUILD_BEE = [(None, 0), ('Flying', 0), ('Flying', 2), ('Attack', 5), ('Attack', 9), ('Hit', 3), ('Death', 12), ('Death', 20)]
PREVIEW_BUILD_PLANT = [(None, 0), ('Idle', 30), ('Attack', 9), ('Attack', 12), ('Hit', 3), ('Death', 18)]
PREVIEW = PREVIEW_BUILD_TROLL
