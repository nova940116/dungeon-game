"""
Frost spiders: the Frost Spider Queen (mid-boss, room 15) and her spiderlings. One builder, two sizes.

Queen      ice-crystal crown and back, glowing frost markings, eight eyes, big fangs.
Spiderling the same body plan without the crown, smaller and simpler.

Legs are two bones each (Leg = hip → knee, Knee = knee → foot). Gait helpers below map
"swing forward / lift / curl" onto the toolkit's character-axis rotations.
Clips: Idle, Walk (loops) · Attack (rear up + fangs) · Jump (crouch → leap) · Roar · Death
"""
from bosskit import Model

SIDES = ((1, 'L'), (-1, 'R'))
# Per leg pair, front to back: hip y, how far the leg fans forward/back, knee height.
LEGS = [(-0.34, -0.55, 1.45), (-0.12, -0.18, 1.55), (0.1, 0.2, 1.55), (0.32, 0.6, 1.4)]


def build_spider(queen):
    m = Model('SpiderQueen' if queen else 'Spiderling', seed=21 if queen else 22)
    m.material('Chitin', (0.05, 0.07, 0.12), rough=0.35, metal=0.2)
    m.material('ChitinLight', (0.18, 0.28, 0.42), rough=0.4, metal=0.2)
    m.material('Fang', (0.85, 0.92, 1.0), rough=0.25)
    m.material('Ice', (0.45, 0.8, 1.0), rough=0.1, emit=(0.35, 0.8, 1.0), strength=1.6)
    m.material('Eye', (1.0, 0.35, 0.3), rough=0.2, emit=(1.0, 0.25, 0.2), strength=6.0)

    m.bone('Root', (0, 0, 0))
    m.bone('Body', (0, 0, 0.85), 'Root')
    m.bone('Abdomen', (0, 0.42, 0.9), 'Body')
    for s, S in SIDES:
        m.bone(f'Fang.{S}', (0.1 * s, -0.68, 0.78), 'Body')
        for i, (y, fan, knee_z) in enumerate(LEGS):
            m.bone(f'Leg{i}.{S}', (0.3 * s, y, 0.85), 'Body')
            m.bone(f'Knee{i}.{S}', (1.05 * s, y + fan, knee_z), f'Leg{i}.{S}')

    # ---- body
    m.ball('Body', 'Chitin', 0.45, (0, -0.12, 0.88), scale=(1.0, 1.15, 0.62))
    m.ball('Body', 'ChitinLight', 0.3, (0, -0.15, 1.05), scale=(0.9, 1.0, 0.4))
    m.ball('Body', 'Chitin', 0.26, (0, -0.58, 0.84), scale=(1.0, 0.9, 0.85))  # head
    eyes = [(-0.07, 0.95), (0.07, 0.95), (-0.15, 0.92), (0.15, 0.92), (-0.05, 1.02), (0.05, 1.02), (-0.11, 0.86), (0.11, 0.86)]
    for x, z in eyes:
        m.ball('Body', 'Eye', 0.035 if abs(x) < 0.1 else 0.028, (x, -0.8, z))
    m.ball('Abdomen', 'Chitin', 0.7, (0, 1.0, 1.02), scale=(1.0, 1.25, 0.85))
    m.ball('Abdomen', 'ChitinLight', 0.45, (0, 0.95, 1.4), scale=(0.9, 1.25, 0.45))
    # frost markings on the back of the abdomen
    for i, y in enumerate((0.55, 0.85, 1.15, 1.45)):
        w = 0.42 - abs(i - 1.5) * 0.08
        m.box('Abdomen', 'Ice', (w, 0.08, 0.05), (0, y, 1.52 - abs(y - 1.0) * 0.25), rot=(-12 + i * 9, 0, 0))
    for s, S in SIDES:
        m.spike(f'Fang.{S}', 'Fang', (0.1 * s, -0.72, 0.78), (0.15 * s, -0.4, -1), 0.34, 0.06)
        m.ball(f'Fang.{S}', 'Chitin', 0.08, (0.1 * s, -0.72, 0.8))

    if queen:
        # Crown of ice on the head, crystal ridge along the abdomen.
        for x, y, d, ln in ((0, -0.6, (0, -0.3, 1), 0.55), (-0.17, -0.55, (-0.5, -0.1, 1), 0.4), (0.17, -0.55, (0.5, -0.1, 1), 0.4),
                            (-0.3, -0.45, (-1, 0.2, 0.7), 0.3), (0.3, -0.45, (1, 0.2, 0.7), 0.3)):
            m.crystal('Body', 'Ice', (x, y, 1.02), d, ln, 0.08)
        for y, ln, lean in ((0.65, 0.65, -0.2), (0.95, 0.9, 0.0), (1.25, 0.7, 0.25), (1.5, 0.45, 0.45)):
            m.crystal('Abdomen', 'Ice', (0, y, 1.5), (0, lean, 1), ln, 0.13)
            for s in (1, -1):
                m.crystal('Abdomen', 'Ice', (0.38 * s, y, 1.35), (0.8 * s, lean, 0.8), ln * 0.55, 0.08)

    # ---- legs
    for s, S in SIDES:
        for i, (y, fan, knee_z) in enumerate(LEGS):
            hip, knee = (0.3 * s, y, 0.85), (1.05 * s, y + fan, knee_z)
            foot = (1.75 * s, y + fan * 1.8, 0.0)
            m.limb(f'Leg{i}.{S}', 'Chitin', hip, knee, 0.085, 0.065, segs=6)
            m.ball(f'Knee{i}.{S}', 'ChitinLight', 0.085, knee)
            m.limb(f'Knee{i}.{S}', 'Chitin', knee, foot, 0.065, 0.012, segs=6)
            mid = tuple(k + (f - k) * 0.35 for k, f in zip(knee, foot))
            m.spike(f'Knee{i}.{S}', 'ChitinLight', mid, (0.5 * s, 0, 0.6), 0.16, 0.025, segs=4)
            if queen and i in (0, 3):
                m.crystal(f'Knee{i}.{S}', 'Ice', knee, (0.3 * s, 0, 1), 0.3, 0.05)

    m.build()
    animate(m)
    return m


def leg(pose, i, side, swing=0.0, lift=0.0, curl=0.0):
    """swing > 0 moves the foot forward, lift > 0 raises the leg, curl > 0 tucks the foot in."""
    s, S = side
    pose[f'Leg{i}.{S}'] = (0, -lift * s, -swing * s)
    pose[f'Knee{i}.{S}'] = (0, curl * s, 0)
    return pose


def all_legs(pose, swing=0.0, lift=0.0, curl=0.0, front_lift=None):
    for side in SIDES:
        for i in range(4):
            leg(pose, i, side, swing, front_lift if (front_lift is not None and i < 2) else lift, curl)
    return pose


GROUP_A = [(0, SIDES[0]), (1, SIDES[1]), (2, SIDES[0]), (3, SIDES[1])]
GROUP_B = [(0, SIDES[1]), (1, SIDES[0]), (2, SIDES[1]), (3, SIDES[0])]


def animate(m):
    rest = {}
    breathe = {'Body': (2, 0, 0), 'Abdomen': (-5, 0, 0), '@Body': (0, 0, -0.04), 'Fang.L': (0, 0, -8), 'Fang.R': (0, 0, 8)}
    all_legs(breathe, curl=-4)
    m.clip('Idle', [(0, rest), (24, breathe), (48, rest)], loop=True)

    def step(a_forward):
        p = {'@Body': (0, 0, 0.03 if a_forward else 0.0), 'Abdomen': (0, 0, 4 if a_forward else -4)}
        for i, side in GROUP_A:
            leg(p, i, side, swing=18 if a_forward else -18, lift=0 if a_forward else 0)
        for i, side in GROUP_B:
            leg(p, i, side, swing=-18 if a_forward else 18)
        return p

    def lift(a_moving):
        p = {'@Body': (0, 0, 0.06)}
        for i, side in GROUP_A if a_moving else GROUP_B:
            leg(p, i, side, swing=0, lift=22, curl=18)
        return p

    m.clip('Walk', [(0, step(True)), (5, lift(False)), (10, step(False)), (15, lift(True)), (20, step(True))], loop=True)

    # Attack: rear up, front legs high, fangs spread then snap shut (bite at frame 12).
    rear = {'Body': (-28, 0, 0), 'Abdomen': (18, 0, 0), '@Body': (0, 0.15, 0.2), 'Fang.L': (0, 0, -30), 'Fang.R': (0, 0, 30)}
    all_legs(rear, front_lift=45, lift=-10, curl=25)
    bite = {'Body': (12, 0, 0), 'Abdomen': (-6, 0, 0), '@Body': (0, -0.2, -0.1), 'Fang.L': (0, 0, 22), 'Fang.R': (0, 0, -22)}
    all_legs(bite, front_lift=-8, lift=5, curl=-8)
    m.clip('Attack', [(0, rest), (9, rear), (12, bite), (16, bite), (26, rest)])

    # Jump: crouch low, then everything springs out (airborne arc is moved in code).
    crouch = all_legs({'@Body': (0, 0, -0.32), 'Body': (6, 0, 0), 'Abdomen': (-8, 0, 0)}, lift=-14, curl=-20)
    spring = all_legs({'@Body': (0, 0, 0.1), 'Body': (-12, 0, 0), 'Abdomen': (10, 0, 0)}, lift=30, curl=30, swing=0)
    land = all_legs({'@Body': (0, 0, -0.2), 'Body': (8, 0, 0)}, lift=-10, curl=-14)
    m.clip('Jump', [(0, rest), (6, crouch), (10, spring), (20, spring), (24, land), (32, rest)])

    def flail(k):
        p = {'Body': (-32, 0, 0), 'Abdomen': (20, 0, 4 * k), '@Body': (0, 0.2, 0.25), 'Fang.L': (0, 0, -35), 'Fang.R': (0, 0, 35)}
        for i in range(4):
            for side in SIDES:
                front = i < 2
                leg(p, i, side, swing=(12 * k * side[0]) if front else 0, lift=(55 if front else -8) + (8 * k if front else 0), curl=30 if front else 0)
        return p

    m.clip('Roar', [(0, rest), (8, flail(1)), (14, flail(-1)), (20, flail(1)), (26, flail(-1)), (32, flail(1)), (44, rest)])

    hit = all_legs({'Body': (-18, 10, 6), '@Body': (0, 0.1, 0.05)}, lift=12, curl=10)
    curled = all_legs({'Body': (6, 0, 0), 'Abdomen': (-10, 0, 0), '@Body': (0, 0, -0.5)}, lift=50, curl=70, swing=0)
    m.clip('Death', [(0, rest), (6, hit), (18, curled), (22, all_legs({'Body': (6, 0, 0), '@Body': (0, 0, -0.55)}, lift=45, curl=75)), (30, curled)])


def build():
    return build_spider(True)


def build_spiderling():
    return build_spider(False)


PREVIEW = [(None, 0), ('Idle', 24), ('Walk', 0), ('Walk', 5), ('Walk', 10), ('Attack', 9), ('Attack', 12),
           ('Jump', 6), ('Jump', 12), ('Roar', 14), ('Death', 6), ('Death', 22)]
