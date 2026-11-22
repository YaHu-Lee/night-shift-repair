"""Render the mechanic's 8 headings and 7 poses from the same orthographic rig."""

import json
import math
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

from PIL import Image, ImageDraw


CELL = 56
SUPER_SAMPLE = 4
SCALE = 17.8
POSES = ('idle', 'step-a', 'step-b', 'windup', 'strike', 'recover', 'hit')
INK = (38, 33, 30)
LEATHER = (130, 75, 43)
CLOTH = (182, 117, 65)
BOOTS = (65, 64, 57)
CANVAS = (216, 158, 89)
HAT = (235, 163, 51)
SKIN = (201, 128, 81)
STEEL = (146, 156, 147)


def plus(a, b):
    return tuple(x + y for x, y in zip(a, b))


def minus(a, b):
    return tuple(x - y for x, y in zip(a, b))


def times(a, scale):
    return tuple(x * scale for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]


def unit(a):
    return times(a, 1 / math.sqrt(dot(a, a)))


class Rig:
    def __init__(self, heading):
        self.yaw = heading * math.pi / 4 + math.pi / 2
        self.faces = []

    def world(self, vertex):
        x, y, z = vertex
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        return x*c - y*s, x*s + y*c, z

    def surface(self, vertices, centre, colour):
        middle = tuple(sum(v[i] for v in vertices) / len(vertices) for i in range(3))
        normal = cross(minus(vertices[1], vertices[0]), minus(vertices[-1], vertices[0]))
        if dot(normal, normal) < 1e-9:
            return
        normal = unit(normal)
        if dot(normal, minus(middle, centre)) < 0:
            normal = times(normal, -1)
        normal = self.world(normal)
        camera = (0, -0.80, 0.60)
        if dot(normal, camera) <= 0:
            return
        light = 0.67 + 0.43 * max(0, dot(normal, (-0.34, -0.45, 0.82)))
        paint = tuple(min(255, round(channel * light)) for channel in colour)
        points = [self.world(v) for v in vertices]
        depth = sum(dot(v, camera) for v in points) / len(points)
        self.faces.append((depth, points, paint))

    def mesh(self, rings, centre, colour):
        for low, high in zip(rings, rings[1:]):
            for i in range(len(low)):
                j = (i + 1) % len(low)
                self.surface((low[i], low[j], high[j], high[i]), centre, colour)
        self.surface(rings[0], centre, colour)
        self.surface(rings[-1], centre, colour)

    def beam(self, start, end, side, thickness, colour):
        axis = unit(minus(end, start))
        seam = (1, 0, 0) if abs(axis[0]) < 0.90 else (0, 0, 1)
        across = unit(cross(axis, seam))
        normal = cross(axis, across)
        rings = [[plus(centre, plus(times(across, x*side), times(normal, y*thickness)))
                  for x, y in ((-1, -1), (1, -1), (1, 1), (-1, 1))] for centre in (start, end)]
        self.mesh(rings, times(plus(start, end), 0.5), colour)

    def shell(self, x, y, levels, colour, sides=10):
        rings = [[(x + width*math.cos(i*math.tau/sides), y + depth*math.sin(i*math.tau/sides), z)
                  for i in range(sides)] for z, width, depth in levels]
        self.mesh(rings, (x, y, (levels[0][0] + levels[-1][0])/2), colour)

    def render(self):
        image = Image.new('RGBA', (CELL * SUPER_SAMPLE,) * 2)
        pixels = ImageDraw.Draw(image)
        for _, poly, colour in sorted(self.faces, key=lambda face: face[0]):
            points = [(round((CELL/2 + x*SCALE)*SUPER_SAMPLE), round((46 - (0.60*y + 0.80*z)*SCALE)*SUPER_SAMPLE))
                      for x, y, z in poly]
            pixels.polygon(points, fill=(*colour, 255))
            border = tuple(round(channel * 0.67) for channel in colour)
            pixels.line(points + [points[0]], fill=(*border, 255), width=2)
        return image.resize((CELL, CELL), Image.Resampling.LANCZOS)


def mechanic(heading, pose):
    rig = Rig(heading)
    stride = 0.25 if pose == 'step-a' else -0.25 if pose == 'step-b' else 0
    lean, lift = {
        'idle': (0, 0), 'step-a': (-0.05, 0.04), 'step-b': (-0.05, 0.04),
        'windup': (0.13, -0.10), 'strike': (-0.16, -0.08),
        'recover': (-0.07, -0.04), 'hit': (0.22, -0.14),
    }[pose]

    for side in (-1, 1):
        foot_x, foot_y = side*0.185, side*stride + (0.14 if pose == 'hit' and side == 1 else 0)
        knee = (side*0.17, 0.55*foot_y - 0.06, 0.45 + lift/2)
        rig.beam((foot_x, foot_y - 0.19, 0.11), (foot_x, foot_y + 0.15, 0.10), 0.082, 0.12, BOOTS)
        rig.beam((foot_x, foot_y, 0.18), knee, 0.114, 0.107, LEATHER)
        rig.beam(knee, (side*0.17, lean*0.55, 0.92 + lift), 0.132, 0.125, CLOTH)

    rig.shell(0, lean*0.64, [(0.84+lift, .30, .21), (1.28+lift, .29, .23),
                              (1.56+lift, .39, .21), (1.73+lift, .30, .20)], CLOTH, 8)
    rig.shell(0, lean*0.65, [(0.97+lift, .305, .222), (1.05+lift, .306, .224)], BOOTS, 8)
    rig.beam((0, lean+0.23, 1.15+lift), (0, lean+0.23, 1.62+lift), .155, .25, BOOTS)
    rig.beam((0.06, lean+0.34, 1.30+lift), (0.06, lean+0.34, 1.56+lift), .06, .12, CANVAS)
    for x in (-0.18, 0.18):
        rig.beam((x, lean-0.198, 1.11+lift), (x, lean-0.18, 1.62+lift), .018, .036, CANVAS)

    for side in (-1, 1):
        shoulder = (side*.37, lean, 1.57+lift)
        elbow = (side*.45, lean + side*stride*0.50, 1.23+lift)
        wrist = (side*.42, lean-.12 + side*stride*.57, 0.96+lift)
        if side == 1:
            elbow, wrist = {
                'windup': ((.56, .16, 1.68), (.49, .35, 1.85)),
                'strike': ((.44, -.37, 1.53), (.4, -.71, 1.35)),
                'recover': ((.50, -.1, 1.34), (.50, -.34, 1.13)),
                'hit': ((.57, .33, 1.52), (.74, .33, 1.36)),
            }.get(pose, (elbow, wrist))
        elif pose == 'hit':
            elbow, wrist = (-.57, .21, 1.57), (-.77, .14, 1.67)
        rig.beam(shoulder, elbow, .119, .120, CLOTH)
        rig.beam(elbow, wrist, .092, .092, CANVAS)
        rig.shell(wrist[0], wrist[1], [(wrist[2]-.072, .072, .06), (wrist[2]+.072, .080, .074)], INK, 8)
        if side == 1:
            direction = {
                'windup': (.22, .14, .23), 'strike': (.10, -.40, -.08),
                'recover': (.30, -.24, -.19), 'hit': (.23, -.24, -.26),
            }.get(pose, (.17, -.28, -.34))
            head = plus(wrist, direction)
            rig.beam(wrist, head, .032, .037, STEEL)
            off = times(unit(cross(direction, (0, 0, 1))), .11)
            extension = times(unit(direction), .12)
            for jaw in (plus(head, off), minus(head, off)):
                rig.beam(head, jaw, .035, .040, STEEL)
                rig.beam(jaw, plus(jaw, extension), .025, .030, STEEL)

    rig.shell(0, lean, [(1.65+lift, .13, .14), (1.77+lift, .24, .20),
                        (2.04+lift, .24, .21), (2.15+lift, .18, .16)], SKIN)
    rig.beam((-.19, lean-.18, 1.94+lift), (.19, lean-.18, 1.94+lift), .024, .032, INK)
    rig.shell(0, lean-.042, [(2.06+lift, .345, .31), (2.13+lift, .35, .335)], HAT, 12)
    rig.shell(0, lean+.01, [(2.12+lift, .284, .256), (2.29+lift, .279, .244),
                             (2.41+lift, .178, .154), (2.44+lift, .066, .063)], HAT, 12)
    rig.beam((0, lean-.308, 2.18+lift), (0, lean-.356, 2.18+lift), .058, .077, BOOTS)
    rig.beam((0, lean-.356, 2.18+lift), (0, lean-.375, 2.18+lift), .034, .053, (252, 224, 151))
    return rig.render()


def main():
    output = Path(__file__).resolve().parents[1] / 'creator-m0/assets/resources/skins/workshop/mechanic-directional.png'
    atlas = Image.new('RGBA', (CELL*8, CELL*len(POSES)))
    for row, pose in enumerate(POSES):
        cells = [mechanic(direction, pose) for direction in range(8)]
        assert len({cell.tobytes() for cell in cells}) == 8, f'duplicate facing in {pose}'
        for direction, cell in enumerate(cells):
            bounds = cell.getchannel('A').getbbox()
            assert bounds and all(0 <= edge <= CELL for edge in bounds)
            assert min(bounds[0], bounds[1], CELL-bounds[2], CELL-bounds[3]) >= 1, (pose, direction, bounds)
            atlas.paste(cell, (CELL*direction, CELL*row))
    atlas.save(output, optimize=True)
    uuid = str(uuid5(NAMESPACE_URL, 'night-shift-repair/skins/workshop/mechanic-directional.png'))
    template = json.loads(output.with_name('campaign-machines.png.meta').read_text(encoding='utf8'))
    texture = template['subMetas']['6c48a']
    texture['uuid'] = uuid + '@6c48a'
    texture['displayName'] = output.stem
    texture['userData']['imageUuidOrDatabaseUri'] = uuid
    template.update(uuid=uuid, subMetas={'6c48a': texture}, userData={'type': 'texture', 'redirect': uuid+'@6c48a'})
    output.with_suffix('.png.meta').write_text(json.dumps(template, indent=2)+'\n', encoding='utf8')


if __name__ == '__main__':
    main()
