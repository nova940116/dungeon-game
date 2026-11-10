"""
Mid-boss: the Ancient Golem. A hunched stone colossus with ground-dragging fists, a glowing
crystal heart and crystal growths bursting out of its back and shoulders. Built from scratch.

Materials  Stone / StoneDark / Bone, and the emissive Crystal + Eye (pulsed at runtime by MidBoss.ts).
Clips      Idle, Walk (loops) · Attack (two-fist overhead slam, impact at 0.8s) ·
           Punch (one-arm hurl, release at 0.4s) · Roar · Death
"""
from bosskit import Model

SIDES = ((1, 'L'), (-1, 'R'))


def build():
    m = Model('Golem', seed=11)
    m.material('Stone', (0.15, 0.15, 0.21), rough=0.92)
    m.material('StoneDark', (0.065, 0.065, 0.1), rough=0.95)
    m.material('Bone', (0.62, 0.58, 0.5), rough=0.6)
    m.material('Crystal', (0.16, 0.04, 0.4), rough=0.2, emit=(0.42, 0.08, 1.0), strength=1.25)
    m.material('Eye', (1.0, 0.8, 1.0), rough=0.3, emit=(0.8, 0.4, 1.0), strength=5.0)

    m.bone('Root', (0, 0, 0))
    m.bone('Hips', (0, 0.05, 1.25), 'Root')
    m.bone('Chest', (0, 0.05, 1.85), 'Hips')
    m.bone('Head', (0, -0.55, 2.85), 'Chest')
    m.bone('Jaw', (0, -0.6, 2.75), 'Head')
    for s, S in SIDES:
        m.bone(f'UpperArm.{S}', (1.45 * s, 0, 2.9), 'Chest')
        m.bone(f'LowerArm.{S}', (1.95 * s, -0.05, 1.95), f'UpperArm.{S}')
        m.bone(f'Hand.{S}', (2.05 * s, -0.25, 0.95), f'LowerArm.{S}')
        m.bone(f'UpperLeg.{S}', (0.6 * s, 0.05, 1.25), 'Hips')
        m.bone(f'LowerLeg.{S}', (0.65 * s, 0, 0.68), f'UpperLeg.{S}')

    # ---- pelvis / waist
    m.box('Hips', 'Stone', (1.75, 1.15, 0.7), (0, 0.05, 1.2), bevel=0.1, jitter=0.04)
    m.box('Hips', 'StoneDark', (1.35, 0.95, 0.55), (0, 0.05, 1.68), bevel=0.08)
    m.box('Hips', 'StoneDark', (0.7, 0.3, 0.75), (0, -0.55, 1.05), rot=(-8, 0, 0), taper=0.6, bevel=0.05)

    # ---- torso: a wide slab leaning forward, a hump behind, the crystal heart in front
    m.box('Chest', 'Stone', (2.9, 1.6, 1.5), (0, 0.05, 2.55), rot=(12, 0, 0), taper=1.12, bevel=0.14, jitter=0.05)
    m.ball('Chest', 'StoneDark', 0.95, (0, 0.5, 3.05), scale=(1.55, 0.95, 0.8), jitter=0.06)
    m.ball('Chest', 'Crystal', 0.42, (0, -0.86, 2.42), scale=(1.0, 0.55, 1.25))
    for s, _ in SIDES:
        m.box('Chest', 'StoneDark', (0.95, 0.3, 0.34), (0.78 * s, -0.86, 2.86), rot=(12, 0, -14 * s), bevel=0.05)
        m.box('Chest', 'StoneDark', (0.8, 0.3, 0.3), (0.72 * s, -0.78, 2.08), rot=(12, 0, 16 * s), bevel=0.05)
        m.box('Chest', 'Crystal', (0.5, 0.06, 0.07), (0.72 * s, -0.94, 2.47), rot=(12, 0, 0))  # glowing cracks
    # back crystals
    for base, d, length, r in (
        ((0, 0.75, 3.15), (0, 0.4, 1), 1.7, 0.36),
        ((-0.65, 0.7, 3.05), (-0.5, 0.45, 1), 1.25, 0.28),
        ((0.65, 0.7, 3.05), (0.45, 0.5, 1), 1.3, 0.28),
        ((0.3, 1.0, 2.65), (0.2, 1, 0.55), 0.95, 0.22),
        ((-0.35, 1.0, 2.55), (-0.3, 1, 0.4), 0.85, 0.2),
        ((0, 0.9, 2.1), (0, 1, 0.1), 0.6, 0.18),
    ):
        m.crystal('Chest', 'Crystal', base, d, length, r)

    # ---- head sunk between the shoulders
    m.box('Head', 'StoneDark', (0.9, 0.85, 0.72), (0, -0.6, 3.08), bevel=0.07, jitter=0.02)
    m.box('Head', 'Stone', (1.0, 0.34, 0.22), (0, -0.96, 3.3), rot=(14, 0, 0), bevel=0.04)
    m.crystal('Head', 'Crystal', (0, -0.5, 3.4), (0, -0.25, 1), 0.55, 0.14)
    for s, _ in SIDES:
        m.box('Head', 'Eye', (0.3, 0.08, 0.11), (0.24 * s, -1.03, 3.08), rot=(0, -20 * s, 0))  # angry slits
        m.spike('Jaw', 'Bone', (0.46 * s, -0.92, 2.74), (0.3 * s, -0.35, 1), 0.55, 0.1)
        m.spike('Head', 'StoneDark', (0.42 * s, -0.45, 3.35), (0.7 * s, -0.1, 1), 0.5, 0.16, segs=5)
    m.box('Jaw', 'Stone', (0.85, 0.62, 0.26), (0, -0.74, 2.7), bevel=0.05)

    for s, S in SIDES:
        ua, la, hand = f'UpperArm.{S}', f'LowerArm.{S}', f'Hand.{S}'
        # shoulder boulder + crystals
        m.ball(ua, 'Stone', 0.8, (1.5 * s, 0, 2.95), scale=(1.1, 1.0, 0.95), jitter=0.06)
        m.crystal(ua, 'Crystal', (1.6 * s, 0.15, 3.45), (0.5 * s, 0.2, 1), 1.1, 0.26)
        m.crystal(ua, 'Crystal', (1.98 * s, 0, 3.2), (1 * s, 0, 0.6), 0.7, 0.18)
        m.crystal(ua, 'Crystal', (1.25 * s, 0.4, 3.5), (0.1 * s, 0.5, 1), 0.8, 0.2)
        m.limb(ua, 'StoneDark', (1.55 * s, 0, 2.75), (1.95 * s, -0.05, 1.95), 0.44, 0.38, segs=6)
        # elbow, flared forearm with a glowing band, fist
        m.ball(la, 'Stone', 0.46, (1.95 * s, -0.05, 1.95), jitter=0.03)
        m.limb(la, 'Stone', (1.95 * s, -0.05, 1.9), (2.05 * s, -0.25, 1.0), 0.45, 0.7, segs=7, jitter=0.03)
        m.limb(la, 'Crystal', (2.0 * s, -0.16, 1.47), (2.02 * s, -0.19, 1.36), 0.62, 0.65, segs=7)
        m.crystal(la, 'Crystal', (2.4 * s, 0.1, 1.55), (1 * s, 0.35, 0.7), 0.6, 0.15)
        m.box(hand, 'StoneDark', (1.0, 1.05, 0.85), (2.07 * s, -0.3, 0.6), bevel=0.14, jitter=0.03)
        for dx in (-0.32, 0, 0.32):
            m.box(hand, 'Stone', (0.26, 0.2, 0.34), (2.07 * s + dx, -0.86, 0.55), bevel=0.04)

        ul, ll = f'UpperLeg.{S}', f'LowerLeg.{S}'
        m.limb(ul, 'StoneDark', (0.6 * s, 0.05, 1.3), (0.65 * s, 0, 0.68), 0.52, 0.42, segs=6)
        m.ball(ll, 'Stone', 0.44, (0.65 * s, -0.05, 0.7), jitter=0.03)
        m.limb(ll, 'Stone', (0.65 * s, 0, 0.72), (0.68 * s, -0.02, 0.2), 0.4, 0.6, segs=7, jitter=0.03)
        m.box(ll, 'StoneDark', (0.98, 1.3, 0.36), (0.7 * s, -0.2, 0.18), bevel=0.09)

    m.build()
    animate(m)
    return m


def both(pose, bone, rot):
    """Same rotation on both sides, mirrored (ry / rz flip sign on the right)."""
    pose[f'{bone}.L'] = rot
    pose[f'{bone}.R'] = (rot[0], -rot[1], -rot[2])
    return pose


def animate(m):
    rest = {}
    breathe = both({'Chest': (3, 0, 0), 'Head': (-4, 0, 0), 'Jaw': (5, 0, 0), '@Hips': (0, 0, -0.05)}, 'UpperArm', (0, -4, 0))
    m.clip('Idle', [(0, rest), (30, breathe), (60, rest)], loop=True)

    def stride(lead):  # lead = +1: left leg forward
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return {
            f'UpperLeg.{l}': (-30, 0, 0), f'LowerLeg.{l}': (12, 0, 0),
            f'UpperLeg.{r}': (24, 0, 0), f'LowerLeg.{r}': (14, 0, 0),
            f'UpperArm.{l}': (20, 0, 0), f'LowerArm.{l}': (-8, 0, 0),
            f'UpperArm.{r}': (-26, 0, 0), f'LowerArm.{r}': (-14, 0, 0),
            'Hips': (0, -3 * lead, 5 * lead), 'Chest': (6, 4 * lead, -11 * lead), 'Head': (-4, 0, 6 * lead),
            '@Hips': (0, 0, -0.08),
        }

    def passing(lead):  # the trailing leg swings through, bent
        l, r = ('L', 'R') if lead > 0 else ('R', 'L')
        return {
            f'UpperLeg.{r}': (-14, 0, 0), f'LowerLeg.{r}': (42, 0, 0),
            f'UpperLeg.{l}': (4, 0, 0),
            'Hips': (0, 5 * lead, 0), 'Chest': (3, -3 * lead, 0), '@Hips': (0.07 * lead, 0, 0.05),
        }

    m.clip('Walk', [(0, stride(1)), (10, passing(1)), (20, stride(-1)), (30, passing(-1)), (40, stride(1))], loop=True)

    # Two-fist overhead slam. Impact lands on frame 24 (0.8s).
    wind = both(both({'Chest': (-24, 0, 0), 'Head': (-14, 0, 0), 'Jaw': (16, 0, 0), '@Hips': (0, 0, 0.05)}, 'UpperArm', (-168, -16, 0)), 'LowerArm', (-25, 0, 0))
    slam = both(both({'Chest': (40, 0, 0), 'Head': (-18, 0, 0), 'Jaw': (22, 0, 0), '@Hips': (0, -0.1, -0.32)}, 'UpperArm', (-62, -6, 0)), 'LowerArm', (-12, 0, 0))
    both(both(slam, 'UpperLeg', (-38, 0, 0)), 'LowerLeg', (60, 0, 0))
    settle = dict(slam, **{'Chest': (36, 0, 0), '@Hips': (0, -0.1, -0.27)})
    m.clip('Attack', [(0, rest), (8, dict(wind, **{'Chest': (-12, 0, 0)})), (20, wind), (24, slam), (29, settle), (40, rest)])

    # One-arm hurl (right). Release on frame 12 (0.4s).
    cock = {'Chest': (-8, 0, -26), 'Head': (0, 0, 18), 'UpperArm.R': (70, 25, 0), 'LowerArm.R': (-70, 0, 0), 'UpperArm.L': (-25, -10, 0), 'Hips': (0, 0, -8)}
    throw = {'Chest': (20, 0, 30), 'Head': (-8, 0, -20), 'UpperArm.R': (-105, 0, -10), 'LowerArm.R': (-8, 0, 0), 'UpperArm.L': (25, -8, 0), 'Hips': (0, 0, 8), 'Jaw': (14, 0, 0), '@Hips': (0, -0.1, -0.08)}
    m.clip('Punch', [(0, rest), (8, cock), (12, throw), (16, throw), (26, rest)])

    def howl(yaw):
        p = both(both({'Chest': (-22, 0, yaw), 'Head': (-28, 0, -yaw), 'Jaw': (34, 0, 0), '@Hips': (0, 0, 0.04)}, 'UpperArm', (25, -58, 0)), 'LowerArm', (-55, 0, 0))
        return p

    crouch = both({'Chest': (18, 0, 0), 'Head': (10, 0, 0), '@Hips': (0, 0, -0.15)}, 'UpperArm', (-12, -8, 0))
    m.clip('Roar', [(0, rest), (6, crouch), (12, howl(0)), (17, howl(5)), (22, howl(-5)), (27, howl(5)), (32, howl(-4)), (44, rest)])

    stagger = both({'Chest': (-18, 6, 12), 'Head': (-25, 0, 10), 'Jaw': (28, 0, 0), '@Hips': (0, 0.12, 0)}, 'UpperArm', (10, -30, 0))
    kneel = both(both(both({'Chest': (22, 0, -6), 'Head': (20, 0, 0), '@Hips': (0, -0.05, -0.55)}, 'UpperLeg', (-72, 0, 0)), 'LowerLeg', (118, 0, 0)), 'UpperArm', (-10, -10, 0))
    fallen = both(both(both(both({'Hips': (78, 0, 0), 'Chest': (10, 0, 0), 'Head': (-20, 0, 12), '@Hips': (0, -0.45, -0.72)}, 'UpperLeg', (-55, 0, 0)), 'LowerLeg', (40, 0, 0)), 'UpperArm', (-118, -28, 0)), 'LowerArm', (-20, 0, 0))
    m.clip('Death', [(0, rest), (9, stagger), (24, kneel), (30, kneel), (38, fallen), (41, dict(fallen, **{'Hips': (74, 0, 0)})), (48, fallen)])


PREVIEW = [(None, 0), ('Idle', 30), ('Walk', 0), ('Walk', 10), ('Walk', 20),
           ('Attack', 20), ('Attack', 24), ('Punch', 8), ('Punch', 12), ('Roar', 17),
           ('Death', 9), ('Death', 24), ('Death', 38), ('Roar', 6), ('Attack', 8)]
