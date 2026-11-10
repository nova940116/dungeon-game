"""
Stage boss: the Abyss Lord. A towering armoured demon with swept horns, digitigrade hooved legs,
bat wings, a bladed tail and a jagged greatsword with a molten core. Built from scratch.

Materials  Skin / SkinDark / Armor / Trim / Horn / Bone / Membrane, and the emissive Glow + Eye
           (pulsed at runtime by Boss.ts).
Clips      Idle, Walk, Run (loops) · Weapon (overhead chop) · Jump (stomp) · Punch (wing burst) ·
           Roar · Death
"""
from mathutils import Vector

from bosskit import Model

SIDES = ((1, 'L'), (-1, 'R'))


def build():
    m = Model('Demon', seed=5)
    m.material('Skin', (0.3, 0.035, 0.04), rough=0.55)
    m.material('SkinDark', (0.11, 0.015, 0.02), rough=0.6)
    m.material('Armor', (0.035, 0.035, 0.05), rough=0.35, metal=0.8)
    m.material('Trim', (0.5, 0.3, 0.08), rough=0.3, metal=0.9)
    m.material('Horn', (0.05, 0.04, 0.04), rough=0.4)
    m.material('Bone', (0.75, 0.7, 0.58), rough=0.5)
    m.material('Membrane', (0.16, 0.015, 0.025), rough=0.8, double=True)
    m.material('Glow', (0.3, 0.05, 0.0), rough=0.4, emit=(1.0, 0.27, 0.04), strength=3.0)
    m.material('Eye', (1.0, 0.8, 0.3), rough=0.3, emit=(1.0, 0.7, 0.15), strength=7.0)

    m.bone('Root', (0, 0, 0))
    m.bone('Hips', (0, 0.1, 2.45), 'Root')
    m.bone('Spine', (0, 0.1, 2.95), 'Hips')
    m.bone('Chest', (0, 0.05, 3.5), 'Spine')
    m.bone('Neck', (0, -0.05, 4.35), 'Chest')
    m.bone('Head', (0, -0.15, 4.6), 'Neck')
    m.bone('Jaw', (0, -0.3, 4.62), 'Head')
    m.bone('Tail1', (0, 0.5, 2.4), 'Hips')
    m.bone('Tail2', (0, 1.3, 1.9), 'Tail1')
    m.bone('Tail3', (0, 2.05, 1.75), 'Tail2')
    for s, S in SIDES:
        m.bone(f'UpperArm.{S}', (1.1 * s, 0.05, 4.15), 'Chest')
        m.bone(f'LowerArm.{S}', (1.4 * s, 0.1, 3.15), f'UpperArm.{S}')
        m.bone(f'Hand.{S}', (1.5 * s, -0.15, 2.25), f'LowerArm.{S}')
        m.bone(f'UpperLeg.{S}', (0.5 * s, 0.1, 2.4), 'Hips')
        m.bone(f'LowerLeg.{S}', (0.55 * s, -0.35, 1.45), f'UpperLeg.{S}')
        m.bone(f'Foot.{S}', (0.55 * s, 0.3, 0.7), f'LowerLeg.{S}')
        m.bone(f'Wing.{S}', (0.4 * s, 0.55, 4.05), 'Chest')
        m.bone(f'WingTip.{S}', (2.0 * s, 1.0, 5.5), f'Wing.{S}')
    m.bone('Sword', (-1.5, -0.25, 2.1), 'Hand.R')

    # ---- hips: belt, tassets, loincloth
    m.box('Hips', 'Skin', (1.35, 0.95, 0.6), (0, 0.1, 2.38), bevel=0.1)
    m.box('Hips', 'Armor', (1.5, 1.08, 0.3), (0, 0.1, 2.64), bevel=0.05)
    m.box('Hips', 'Trim', (0.42, 0.12, 0.38), (0, -0.46, 2.62), bevel=0.04)
    m.box('Hips', 'Armor', (0.62, 0.1, 1.05), (0, -0.52, 1.95), rot=(-6, 0, 0), taper=0.55)
    m.box('Hips', 'Armor', (0.6, 0.1, 0.9), (0, 0.66, 2.0), rot=(8, 0, 0), taper=0.6)
    for s, _ in SIDES:
        m.box('Hips', 'Armor', (0.14, 0.75, 0.85), (0.78 * s, 0.1, 2.08), rot=(0, -12 * s, 0), taper=0.7, bevel=0.03)
        m.box('Hips', 'Trim', (0.16, 0.5, 0.08), (0.74 * s, 0.1, 2.42), rot=(0, -12 * s, 0))

    # ---- torso
    m.box('Spine', 'Skin', (1.15, 0.85, 0.8), (0, 0.1, 3.1), taper=1.3, bevel=0.08)
    for z in (2.95, 3.2):
        m.box('Spine', 'SkinDark', (0.7, 0.1, 0.16), (0, -0.4, z), bevel=0.03)
    m.box('Chest', 'Skin', (2.25, 1.25, 1.1), (0, 0.05, 3.9), taper=0.9, bevel=0.14)
    m.box('Chest', 'Armor', (1.75, 0.3, 0.9), (0, -0.6, 3.9), rot=(-5, 0, 0), taper=0.78, bevel=0.06)
    m.ball('Chest', 'Glow', 0.27, (0, -0.8, 3.95), scale=(1.0, 0.5, 1.35))
    for s, _ in SIDES:
        m.box('Chest', 'Glow', (0.5, 0.06, 0.07), (0.52 * s, -0.79, 3.72), rot=(-5, 22 * s, 0))
        m.box('Chest', 'Glow', (0.38, 0.06, 0.06), (0.45 * s, -0.8, 3.55), rot=(-5, 22 * s, 0))
        m.box('Chest', 'Trim', (0.75, 0.1, 0.1), (0.5 * s, -0.72, 4.3), rot=(0, -14 * s, 0))
        m.spike('Chest', 'Horn', (0.55 * s, 0.1, 4.4), (0.3 * s, 0.1, 1), 0.5, 0.13)
    for z, y, length in ((4.3, 0.68, 0.55), (3.9, 0.72, 0.5), (3.5, 0.62, 0.42)):
        m.spike('Chest' if z > 3.4 else 'Spine', 'Horn', (0, y, z), (0, 1, 0.55), length, 0.13)

    # ---- neck + head
    m.limb('Neck', 'Skin', (0, 0, 4.3), (0, -0.12, 4.7), 0.36, 0.3, segs=6)
    m.box('Head', 'Skin', (0.82, 0.95, 0.72), (0, -0.25, 4.98), taper=0.82, bevel=0.1)
    m.box('Head', 'SkinDark', (0.58, 0.42, 0.42), (0, -0.76, 4.82), taper=0.75, bevel=0.05)
    m.box('Head', 'Horn', (0.98, 0.26, 0.14), (0, -0.7, 5.17), rot=(20, 0, 0), bevel=0.03)
    for y, length in ((-0.25, 0.4), (0.05, 0.5), (0.3, 0.38)):
        m.spike('Head', 'Horn', (0, y, 5.3), (0, 0.25, 1), length, 0.1, segs=5)
    for s, _ in SIDES:
        m.box('Head', 'Eye', (0.3, 0.1, 0.12), (0.24 * s, -0.8, 5.0), rot=(0, -22 * s, 0))
        m.spike('Head', 'Bone', (0.2 * s, -0.92, 4.64), (0, 0, -1), 0.24, 0.055, segs=5)
        m.spike('Head', 'Horn', (0.42 * s, -0.35, 4.72), (1 * s, -0.3, -0.35), 0.4, 0.1, segs=5)
        # great horns: out, up, then hooking forward
        a, b, c, d = (0.38 * s, -0.1, 5.2), (1.02 * s, 0.08, 5.55), (1.4 * s, 0.05, 6.15), (1.22 * s, -0.4, 6.75)
        m.limb('Head', 'Horn', a, b, 0.24, 0.19, segs=6)
        m.limb('Head', 'Horn', b, c, 0.19, 0.13, segs=6)
        m.limb('Head', 'Bone', c, d, 0.13, 0.0, segs=6)
        # lesser horns sweeping back
        e, f = (0.28 * s, 0.25, 5.25), (0.62 * s, 0.68, 5.75)
        m.limb('Head', 'Horn', e, f, 0.15, 0.09, segs=5)
        m.limb('Head', 'Horn', f, (0.66 * s, 0.9, 6.2), 0.09, 0.0, segs=5)
        m.spike('Jaw', 'Bone', (0.2 * s, -0.86, 4.56), (0, 0, 1), 0.2, 0.05, segs=5)
    m.box('Jaw', 'SkinDark', (0.55, 0.52, 0.16), (0, -0.66, 4.5), bevel=0.04)
    m.box('Jaw', 'Glow', (0.4, 0.34, 0.05), (0, -0.68, 4.6))  # furnace in the throat
    m.spike('Jaw', 'Horn', (0, -0.9, 4.45), (0, -0.4, -1), 0.35, 0.09, segs=5)

    # ---- arms
    for s, S in SIDES:
        ua, la, hand = f'UpperArm.{S}', f'LowerArm.{S}', f'Hand.{S}'
        m.ball(ua, 'Armor', 0.64, (1.22 * s, 0.05, 4.3), scale=(1.15, 1.0, 0.8))
        m.box(ua, 'Trim', (0.9, 1.0, 0.08), (1.3 * s, 0.05, 4.02), rot=(0, 14 * s, 0), bevel=0.02)
        m.spike(ua, 'Horn', (1.3 * s, 0.05, 4.65), (0.5 * s, 0, 1), 0.8, 0.15)
        m.spike(ua, 'Horn', (1.7 * s, 0.05, 4.42), (1 * s, 0, 0.5), 0.62, 0.13)
        m.spike(ua, 'Horn', (1.2 * s, 0.42, 4.58), (0.2 * s, 0.6, 1), 0.5, 0.11)
        m.limb(ua, 'Skin', (1.2 * s, 0.05, 4.05), (1.4 * s, 0.1, 3.15), 0.37, 0.3, segs=7)
        m.ball(la, 'Skin', 0.31, (1.4 * s, 0.1, 3.15))
        m.limb(la, 'Skin', (1.4 * s, 0.1, 3.15), (1.5 * s, -0.15, 2.3), 0.3, 0.25, segs=7)
        m.limb(la, 'Armor', (1.43 * s, 0.02, 2.95), (1.49 * s, -0.12, 2.42), 0.37, 0.33, segs=7)
        m.limb(la, 'Trim', (1.43 * s, 0.03, 2.98), (1.435 * s, 0.01, 2.9), 0.39, 0.39, segs=7)
        m.spike(la, 'Horn', (1.75 * s, 0.05, 2.8), (1 * s, 0.35, 0.45), 0.5, 0.09)
        m.box(hand, 'Skin', (0.44, 0.52, 0.46), (1.52 * s, -0.2, 2.05), bevel=0.08)
    for dx in (-0.14, 0.0, 0.14):  # left hand: open claws
        m.spike('Hand.L', 'Bone', (1.52 + dx, -0.42, 1.88), (dx, -0.5, -1), 0.42, 0.075, segs=5)

    # ---- greatsword in the right hand, blade forward, flat side up
    sx, sz = -1.52, 2.05
    m.limb('Sword', 'Horn', (sx, 0.3, sz), (sx, -0.55, sz), 0.085, 0.085, segs=6)
    m.ball('Sword', 'Trim', 0.15, (sx, 0.36, sz))
    m.box('Sword', 'Armor', (1.0, 0.18, 0.22), (sx, -0.62, sz), bevel=0.04)
    for d in (-1, 1):
        m.spike('Sword', 'Horn', (sx + 0.48 * d, -0.62, sz), (0.5 * d, -1, 0), 0.45, 0.1, segs=5)
    m.box('Sword', 'Armor', (0.6, 0.12, 3.1), (sx, -2.25, sz), rot=(90, 0, 0), taper=0.6, taper_y=1.0)
    m.box('Sword', 'Armor', (0.36, 0.12, 0.75), (sx, -4.17, sz), rot=(90, 0, 0), taper=0.04, taper_y=1.0)
    m.box('Sword', 'Glow', (0.17, 0.17, 3.0), (sx, -2.25, sz), rot=(90, 0, 0), taper=0.45, taper_y=1.0)
    for y in (-1.3, -2.1, -2.9, -3.6):
        for d in (-1, 1):
            w = 0.3 - (-y - 0.7) * 0.035
            m.spike('Sword', 'Armor', (sx + w * d, y, sz), (1 * d, -0.9, 0), 0.32, 0.09, segs=4, squash=0.5)

    # ---- digitigrade legs with hooves
    for s, S in SIDES:
        ul, ll, foot = f'UpperLeg.{S}', f'LowerLeg.{S}', f'Foot.{S}'
        m.limb(ul, 'Skin', (0.5 * s, 0.1, 2.5), (0.55 * s, -0.35, 1.45), 0.52, 0.36, segs=7)
        m.ball(ll, 'Armor', 0.33, (0.55 * s, -0.38, 1.45))
        m.spike(ll, 'Horn', (0.55 * s, -0.6, 1.5), (0, -1, 0.45), 0.5, 0.11)
        m.limb(ll, 'SkinDark', (0.55 * s, -0.35, 1.45), (0.55 * s, 0.3, 0.7), 0.35, 0.24, segs=7)
        m.ball(foot, 'SkinDark', 0.26, (0.55 * s, 0.3, 0.7))
        m.limb(foot, 'SkinDark', (0.55 * s, 0.3, 0.7), (0.55 * s, -0.05, 0.24), 0.23, 0.28, segs=7)
        m.limb(foot, 'Horn', (0.55 * s, -0.05, 0.28), (0.55 * s, -0.16, 0.0), 0.31, 0.46, segs=6)

    # ---- tail with a blade
    m.limb('Tail1', 'Skin', (0, 0.45, 2.42), (0, 1.3, 1.9), 0.3, 0.21, segs=6)
    m.limb('Tail2', 'Skin', (0, 1.3, 1.9), (0, 2.05, 1.75), 0.21, 0.14, segs=6)
    m.limb('Tail3', 'SkinDark', (0, 2.05, 1.75), (0, 2.8, 2.0), 0.14, 0.07, segs=6)
    m.spike('Tail3', 'Horn', (0, 2.72, 1.97), (0, 1, 0.45), 0.75, 0.26, segs=4, squash=0.3)
    m.spike('Tail1', 'Horn', (0, 0.9, 2.35), (0, 0.4, 1), 0.3, 0.08, segs=5)
    m.spike('Tail2', 'Horn', (0, 1.65, 2.0), (0, 0.2, 1), 0.25, 0.07, segs=5)

    # ---- wings: arm bone to the wrist, three fingers, scalloped membrane
    for s, S in SIDES:
        wing, tip = f'Wing.{S}', f'WingTip.{S}'
        root, wrist = Vector((0.4 * s, 0.55, 4.05)), Vector((2.0 * s, 1.0, 5.5))
        fingers = [Vector((4.4 * s, 1.25, 5.05)), Vector((4.0 * s, 1.3, 3.4)), Vector((2.95 * s, 1.2, 2.35))]
        body = Vector((0.45 * s, 0.62, 2.95))
        m.limb(wing, 'Horn', root, wrist, 0.15, 0.1, segs=6)
        m.spike(tip, 'Bone', wrist, (0.3 * s, 0, 1), 0.5, 0.09, segs=5)
        for f in fingers:
            m.limb(tip, 'Horn', wrist, f, 0.075, 0.02, segs=5)

        def scallop(a, b, pull):
            return (a + b) / 2 * (1 - pull) + wrist * pull

        m12, m23 = scallop(fingers[0], fingers[1], 0.28), scallop(fingers[1], fingers[2], 0.28)
        m3b = (fingers[2] + body) / 2 * 0.8 + root * 0.2
        m.poly(tip, 'Membrane', [wrist, fingers[0], m12, fingers[1], m23, fingers[2]], [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5)])
        m.poly([wing, tip, wing, wing, wing], 'Membrane', [wrist, fingers[2], m3b, body, root], [(0, 1, 2), (0, 2, 3), (0, 3, 4)])

    m.build()
    animate(m)
    return m


def both(pose, bone, rot):
    """Same rotation on both sides, mirrored (ry / rz flip sign on the right)."""
    pose[f'{bone}.L'] = rot
    pose[f'{bone}.R'] = (rot[0], -rot[1], -rot[2])
    return pose


def mix(base, *overrides):
    out = dict(base)
    for o in overrides:
        out.update(o)
    return out


def animate(m):
    # Fighting stance every clip starts from: glaring up, arms out, sword low and forward.
    stance = {
        'Chest': (5, 0, 0), 'Head': (-12, 0, 0), 'Jaw': (5, 0, 0),
        'UpperArm.L': (-6, -22, 0), 'LowerArm.L': (-28, 0, 0), 'Hand.L': (0, 0, 0),
        'UpperArm.R': (-12, 24, 0), 'LowerArm.R': (-30, 0, 0), 'Sword': (48, 0, -12),
        'Tail1': (0, 0, 0),
    }
    both(both(stance, 'Wing', (0, -6, 10)), 'WingTip', (0, 0, 6))

    def wings(up, sweep, tip=0.0):
        """up: degrees raised, sweep: degrees folded back."""
        return both(both({}, 'Wing', (0, -up, sweep)), 'WingTip', (0, -tip, sweep * 0.6))

    def tail(a, b=None, c=None):
        return {'Tail1': (0, 0, a), 'Tail2': (0, 0, a if b is None else b), 'Tail3': (0, 0, a if c is None else c)}

    # ---- Idle: slow breathing, wings beating lazily, tail swaying
    a = mix(stance, wings(-4, 14, -4), tail(10, 8, -6))
    b = mix(stance, {'Chest': (9, 0, 0), 'Spine': (2, 0, 0), 'Head': (-16, 0, 0), 'Jaw': (10, 0, 0), '@Hips': (0, 0, -0.07),
                     'UpperArm.L': (-6, -27, 0), 'Sword': (43, 0, -12)}, wings(14, 6, 10), tail(-10, -8, 6))
    m.clip('Idle', [(0, a), (36, b), (72, a)], loop=True)

    # ---- Walk
    def stride(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return mix(stance, {
            f'UpperLeg.{l}': (-30, 0, 0), f'LowerLeg.{l}': (10, 0, 0), f'Foot.{l}': (12, 0, 0),
            f'UpperLeg.{r}': (26, 0, 0), f'LowerLeg.{r}': (8, 0, 0), f'Foot.{r}': (-22, 0, 0),
            'Hips': (0, -3 * lead, 6 * lead), 'Spine': (4, 2 * lead, -6 * lead), 'Chest': (8, 2 * lead, -8 * lead),
            'Head': (-14, 0, 8 * lead), '@Hips': (0, 0, -0.12),
            'UpperArm.L': (-6 + 16 * lead, -22, 0),
        }, wings(2, 16, 0), tail(-9 * lead, -4 * lead, 6 * lead))

    def passing(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return mix(stance, {
            f'UpperLeg.{r}': (-22, 0, 0), f'LowerLeg.{r}': (38, 0, 0), f'Foot.{r}': (-10, 0, 0),
            f'UpperLeg.{l}': (4, 0, 0),
            'Hips': (0, 4 * lead, 0), 'Chest': (6, -2 * lead, 0), '@Hips': (0.05 * lead, 0, 0.06),
        }, wings(10, 12, 6), tail(0, -8 * lead, -10 * lead))

    m.clip('Walk', [(0, stride(1)), (8, passing(1)), (16, stride(-1)), (24, passing(-1)), (32, stride(1))], loop=True)

    # ---- Run (charge): body thrown forward, wings swept back, sword levelled like a lance
    lunge = {'Spine': (16, 0, 0), 'Chest': (18, 0, 0), 'Neck': (-12, 0, 0), 'Head': (-26, 0, 0), 'Jaw': (24, 0, 0),
             'UpperArm.R': (-58, 12, 0), 'LowerArm.R': (-25, 0, 0), 'Sword': (48, 0, -4),
             'UpperArm.L': (38, -30, 0), 'LowerArm.L': (-40, 0, 0)}

    def gallop(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return mix(stance, lunge, {
            f'UpperLeg.{l}': (-55, 0, 0), f'LowerLeg.{l}': (20, 0, 0), f'Foot.{l}': (15, 0, 0),
            f'UpperLeg.{r}': (38, 0, 0), f'LowerLeg.{r}': (25, 0, 0), f'Foot.{r}': (-35, 0, 0),
            'Hips': (8, 0, 8 * lead), '@Hips': (0, 0, -0.2),
        }, wings(-6, 50, 0), tail(-6 * lead))

    def flight(lead):
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return mix(stance, lunge, {
            f'UpperLeg.{r}': (-30, 0, 0), f'LowerLeg.{r}': (55, 0, 0),
            f'UpperLeg.{l}': (10, 0, 0), f'LowerLeg.{l}': (20, 0, 0),
            'Hips': (8, 0, 0), '@Hips': (0, 0, 0.12),
        }, wings(6, 44, 6), tail(0))

    m.clip('Run', [(0, gallop(1)), (4, flight(1)), (9, gallop(-1)), (13, flight(-1)), (18, gallop(1))], loop=True)

    # ---- Weapon: overhead chop. The blade lands on frame 11.
    raise_ = mix(stance, {'Spine': (-8, 0, 0), 'Chest': (-14, 0, -10), 'Head': (-20, 0, 8), 'Jaw': (18, 0, 0),
                          'UpperArm.R': (-172, 10, 0), 'LowerArm.R': (-45, 0, 0), 'Sword': (20, 0, 0),
                          'UpperArm.L': (10, -40, 0), '@Hips': (0, 0, 0.06)}, wings(22, 0, 12))
    chop = mix(stance, {'Spine': (14, 0, 0), 'Chest': (24, 0, 12), 'Head': (-24, 0, -8), 'Jaw': (26, 0, 0),
                        'UpperArm.R': (-62, -6, 0), 'LowerArm.R': (-4, 0, 0), 'Sword': (40, 0, 0),
                        'UpperArm.L': (30, -30, 0), '@Hips': (0, -0.1, -0.2)}, wings(-12, 26, -6))
    both(both(chop, 'UpperLeg', (-20, 0, 0)), 'LowerLeg', (22, 0, 0))
    m.clip('Weapon', [(0, stance), (7, raise_), (11, chop), (16, chop), (26, stance)])

    # ---- Jump: rear up and stomp. Lands on frame 9.
    rear = mix(stance, {'Chest': (-12, 0, 0), 'Head': (-22, 0, 0), 'Jaw': (20, 0, 0), '@Hips': (0, 0, 0.55),
                        'UpperLeg.L': (-60, 0, 0), 'LowerLeg.L': (75, 0, 0), 'UpperLeg.R': (-25, 0, 0), 'LowerLeg.R': (40, 0, 0),
                        'UpperArm.L': (-40, -50, 0), 'UpperArm.R': (-50, 45, 0)}, wings(34, -6, 16))
    land = mix(stance, {'Spine': (10, 0, 0), 'Chest': (20, 0, 0), 'Head': (-28, 0, 0), '@Hips': (0, 0, -0.32),
                        'UpperArm.L': (10, -34, 0), 'UpperArm.R': (0, 34, 0)}, wings(-22, 20, -10))
    both(both(both(land, 'UpperLeg', (-34, 0, 0)), 'LowerLeg', (40, 0, 0)), 'Foot', (-8, 0, 0))
    m.clip('Jump', [(0, stance), (5, rear), (9, land), (12, land), (18, stance)])

    # ---- Punch: skids to a halt and throws wings and arms wide (shock burst).
    brace = mix(stance, {'Spine': (14, 0, 0), 'Chest': (16, 0, 0), '@Hips': (0, 0, -0.25)}, wings(-10, 40, 0))
    both(both(brace, 'UpperLeg', (-28, 0, 0)), 'LowerLeg', (32, 0, 0))
    burst = mix(stance, {'Spine': (-6, 0, 0), 'Chest': (-16, 0, 0), 'Head': (-26, 0, 0), 'Jaw': (34, 0, 0),
                         'UpperArm.L': (10, -72, 0), 'LowerArm.L': (-30, 0, 0),
                         'UpperArm.R': (10, 72, 0), 'LowerArm.R': (-20, 0, 0), 'Sword': (10, 0, -60)}, wings(30, -16, 14))
    m.clip('Punch', [(0, brace), (4, burst), (13, burst), (25, stance)])

    # ---- Roar
    coil = mix(stance, {'Spine': (14, 0, 0), 'Chest': (20, 0, 0), 'Head': (6, 0, 0), '@Hips': (0, 0, -0.2),
                        'UpperArm.L': (-30, -10, 0), 'UpperArm.R': (-30, 12, 0)}, wings(-14, 40, -8))

    def howl(yaw):
        return mix(stance, {'Spine': (-10, 0, 0), 'Chest': (-18, 0, yaw), 'Neck': (-12, 0, 0), 'Head': (-30, 0, -yaw), 'Jaw': (42, 0, 0),
                            'UpperArm.L': (20, -62, 0), 'LowerArm.L': (-48, 0, 0),
                            'UpperArm.R': (20, 62, 0), 'LowerArm.R': (-40, 0, 0), 'Sword': (0, 0, -50),
                            '@Hips': (0, 0, 0.05)}, wings(34 + abs(yaw), -14, 16), tail(yaw * 3))

    m.clip('Roar', [(0, stance), (8, coil), (15, howl(0)), (20, howl(5)), (25, howl(-5)), (30, howl(5)), (35, howl(-4)), (48, stance)])

    # ---- Death: recoil, drop to the knees, collapse forward with the wings folding over
    recoil = mix(stance, {'Chest': (-24, 0, 12), 'Head': (-34, 0, -10), 'Jaw': (40, 0, 0), '@Hips': (0, 0.2, 0),
                          'UpperArm.L': (20, -55, 0), 'UpperArm.R': (25, 50, 0), 'Sword': (0, 0, -40)}, wings(36, -10, 18))
    kneel = mix(stance, {'Spine': (12, 0, 0), 'Chest': (26, 0, 0), 'Head': (28, 0, 0), 'Jaw': (20, 0, 0), '@Hips': (0, -0.2, -1.15),
                         'UpperArm.L': (0, -10, 0), 'LowerArm.L': (-10, 0, 0),
                         'UpperArm.R': (0, 10, 0), 'LowerArm.R': (-5, 0, 0), 'Sword': (60, 0, 0)}, wings(-34, 34, -24), tail(14))
    both(both(both(kneel, 'UpperLeg', (-62, 0, 0)), 'LowerLeg', (95, 0, 0)), 'Foot', (-30, 0, 0))
    fallen = mix(kneel, {'Hips': (82, 0, 0), 'Spine': (4, 0, 0), 'Chest': (6, 0, 0), 'Head': (-20, 0, 25), '@Hips': (0, -0.9, -1.95),
                         'UpperArm.L': (-120, -40, 0), 'UpperArm.R': (-100, 45, 0), 'Sword': (20, 0, -30)}, wings(-18, 58, -14), tail(-18))
    both(both(both(fallen, 'UpperLeg', (-70, 0, 0)), 'LowerLeg', (50, 0, 0)), 'Foot', (20, 0, 0))
    m.clip('Death', [(0, stance), (9, recoil), (26, kneel), (33, kneel), (43, fallen), (47, mix(fallen, {'Hips': (78, 0, 0)})), (58, fallen)])


PREVIEW = [(None, 0), ('Idle', 0), ('Idle', 36), ('Walk', 0), ('Walk', 8),
           ('Run', 0), ('Run', 4), ('Weapon', 7), ('Weapon', 11), ('Jump', 5),
           ('Jump', 9), ('Punch', 4), ('Roar', 20), ('Death', 26), ('Death', 43)]
