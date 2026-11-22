"""Author reusable, paint-graded volume meshes for the Cocos battle actor pass."""

import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector


MATTE_AQUA = (0.058, 0.53, 0.52)
ARC_CYAN = (0.21, 0.79, 0.98)
ARC_WHITE = (0.76, 0.98, 1.0)
COAL = (0.29, 0.033, 0.008)
EMBER = (0.99, 0.28, 0.036)
GOLD = (1.0, 0.74, 0.31)
WHITE = (1.0, 0.94, 0.77)


def paint(rgb, alpha):
    return (*rgb, alpha)


def mix(start, end, weight):
    return tuple(a + (b - a) * weight for a, b in zip(start, end))


class MeshDraft:
    def __init__(self):
        self.points = []
        self.faces = []
        self.colors = []

    def grid(self, rows, closed=False):
        base = len(self.points)
        width = len(rows[0])
        for row in rows:
            for point, color in row:
                self.points.append(point)
                self.colors.append(color)
        for row in range(len(rows) - 1):
            for column in range(width if closed else width - 1):
                a = base + row * width + column
                b = base + row * width + ((column + 1) % width)
                self.faces.append((a, b, b + width, a + width))

    def tube(self, sections, sides=5):
        """Sections hold a world position, horizontal and vertical radii, and RGBA."""
        rows = []
        for index, (point, width, height, color) in enumerate(sections):
            previous = Vector(sections[max(0, index - 1)][0])
            following = Vector(sections[min(index + 1, len(sections) - 1)][0])
            tangent = (following - previous).normalized()
            lateral = tangent.cross(Vector((0, 0, 1)))
            if lateral.length < 1e-6:
                lateral = Vector((0, 1, 0))
            lateral.normalize()
            up = lateral.cross(tangent).normalized()
            rows.append([
                (Vector(point) + lateral * (width * math.cos(theta)) + up * (height * math.sin(theta)), color)
                for theta in (2 * math.pi * side / sides for side in range(sides))
            ])
        self.grid(rows, closed=True)
        base = len(self.points) - len(rows) * sides
        tip = len(self.points) - sides
        self.faces.extend((tuple(base + i for i in range(sides - 1, -1, -1)), tuple(tip + i for i in range(sides))))

    def object(self, name, origin, material):
        mesh = bpy.data.meshes.new(f"{name} surface")
        mesh.from_pydata(self.points, [], self.faces)
        mesh.update()
        color = mesh.color_attributes.new(name="Light paint", type="FLOAT_COLOR", domain="POINT")
        color.data.foreach_set("color", [component for rgba in self.colors for component in rgba])
        mesh.materials.append(material)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = origin
        return obj


def slash(reverse=False):
    mesh = MeshDraft()
    # Cross section folds toward the weapon at its leading edge, leaving a finer hot edge on top.
    profiles = ((0.0, 0.0, MATTE_AQUA, 0.0), (0.22, -0.10, MATTE_AQUA, 0.46),
                (0.59, 0.14, ARC_CYAN, 0.90), (0.85, 0.30, ARC_WHITE, 1.0), (1.0, 0.17, ARC_CYAN, 0.0))
    rows = []
    for index in range(25):
        t = index / 24
        angle = math.radians(-74 + 119 * t) * (-1 if reverse else 1)
        fullness = math.sin(math.pi * t) ** 0.62
        edge = 0.83 + 0.17 * math.sin(math.pi * t)
        width = (0.11 + 0.23 * t) * fullness
        opacity = min(1, t * 6, (1 - t) * 12) * (0.48 + 0.52 * t)
        row = []
        for across, lift, tint, alpha in profiles:
            radius = edge - width * (1 - across)
            height = 0.15 * math.cos(angle) + lift * fullness
            row.append(((radius * math.cos(angle), radius * math.sin(angle), height), paint(tint, alpha * opacity)))
        rows.append(row)
    mesh.grid(rows)
    # Two loose ion filaments under the main cut, thinner and shorter than the leading edge.
    for shift, thickness in ((0.20, 0.017), (0.31, 0.012)):
        sections = []
        for step in range(12):
            phase = step / 11
            theta = math.radians(-66 + 75 * phase) * (-1 if reverse else 1)
            radius = 0.88 - shift + 0.08 * phase
            strength = math.sin(math.pi * phase)
            sections.append(((radius * math.cos(theta), radius * math.sin(theta), 0.07 + 0.18 * phase),
                             thickness, thickness * 1.8, paint(ARC_CYAN, 0.73 * strength)))
        mesh.tube(sections, sides=4)
    return mesh


def bolt(path, tint=ARC_CYAN, strength=1.0):
    mesh = MeshDraft()
    for shade, width, height, alpha in ((tint, 0.16, 0.13, 0.43), (ARC_WHITE, 0.062, 0.071, 0.99)):
        mesh.tube([(p, width, height, paint(shade, alpha * strength)) for p in path], sides=5)
    for start, end in ((1, (0.01, 0.71, 0.28)), (3, (0.39, -0.56, 0.06))):
        mesh.tube([(path[start], .06, .055, paint(tint, .76 * strength)), (end, .012, .01, paint(tint, 0))], sides=3)
    return mesh


def tracer():
    mesh = MeshDraft()
    for shell in (1, 0.40):
        mesh.tube([
            ((-0.5, 0, 0), .025 * shell, .036 * shell, paint(EMBER, 0.0)),
            ((-0.26, 0.06, 0.02), .17 * shell, .14 * shell, paint(EMBER, .47)),
            ((0.23, -0.055, 0), .43 * shell, .28 * shell, paint(GOLD, .83)),
            ((0.42, 0, 0), .28 * shell, .27 * shell, paint(WHITE, .98)),
            ((0.5, 0, 0), .025 * shell, .04 * shell, paint(WHITE, .98)),
        ], sides=7)
    return mesh


def heat_jet():
    mesh = MeshDraft()
    stations = (
        (-.5, .0, .0, .06, .075, WHITE, .80), (-.37, -.065, .03, .22, .19, WHITE, .98),
        (-.13, .06, .11, .44, .33, GOLD, .95), (.09, -.06, .17, .52, .45, EMBER, .78),
        (.29, .17, .20, .36, .27, EMBER, .60), (.5, -.02, .31, .01, .035, COAL, .0),
    )
    mesh.tube([((x, y, z), r, h, paint(rgb, a)) for x, y, z, r, h, rgb, a in stations], sides=6)
    for offset in (-.23, .27):
        mesh.tube([((-.24, offset / 2, .05), .03, .028, paint(GOLD, 0)),
                   ((.10, offset, .26), .063, .047, paint(EMBER, .75)),
                   ((.34, offset + .04, .39), .005, .007, paint(EMBER, 0))], sides=4)
    return mesh


def flux_ring():
    mesh = MeshDraft()
    for arm in range(4):
        sections = []
        for index in range(13):
            t = index / 12
            angle = (arm * 90 + 8 + 57 * t) * math.pi / 180
            radius = .963 + .009 * math.sin(t * math.pi * 4 + arm)
            strength = math.sin(math.pi * t) ** 0.70
            color = mix((.30, .42, .49), (1.0, .98, .97), t)
            sections.append(((radius * math.cos(angle), radius * math.sin(angle), 0.14 + .32 * t),
                             .015 * strength + .001, .22 * strength + .027, paint(color, .94 * strength)))
        mesh.tube(sections, sides=5)
    return mesh


def flux_tether():
    mesh = MeshDraft()
    for spin in (0, math.pi):
        sections = []
        for index in range(30):
            t = index / 29
            twist = 5 * math.pi * t + spin
            extent = math.sin(math.pi * t) ** 0.42
            sections.append(((t - .5, math.cos(twist) * extent * .34, math.sin(twist) * extent * .31),
                             .065, .059, paint(mix((.56, .74, .76), (1, 1, 1), index % 3 / 2), .72 + .18 * extent)))
        mesh.tube(sections, sides=4)
    return mesh


def strike_burst():
    mesh = MeshDraft()
    for index in range(8):
        theta = math.radians(index * 137.50776)
        reach = (.68, 1, .85, .77)[index % 4]
        height = (.22, .72, .52)[index % 3]
        x, y = reach * math.cos(theta), reach * math.sin(theta)
        mesh.tube([((x * .10, y * .10, .065), .025, .037, paint((1, 1, 1), 1)),
                   ((x * .44, y * .44, height * .58), .116, .094, paint((.97, .91, .75), .92)),
                   ((x, y, height), .009, .009, paint((.71, .48, .24), .54))], sides=4)
    return mesh


def enemy_round():
    mesh = MeshDraft()
    mesh.tube([((-.5, 0, 0), .018, .019, paint(COAL, 0)), ((-.25, 0, 0), .35, .29, paint(EMBER, .68)),
               ((.15, 0, 0), .45, .41, paint(GOLD, .94)), ((.40, 0, 0), .34, .35, paint(WHITE, 1)),
               ((.5, 0, 0), .025, .03, paint(WHITE, .97))], sides=8)
    return mesh


def material():
    luminance = bpy.data.materials.new("Effect swatch")
    luminance.use_nodes = True
    luminance.surface_render_method = 'DITHERED'
    nodes = luminance.node_tree.nodes
    links = luminance.node_tree.links
    shader = nodes.get("Principled BSDF")
    shader.inputs["Roughness"].default_value = .60
    shader.inputs["Emission Strength"].default_value = 0.45
    colors = nodes.new("ShaderNodeVertexColor")
    colors.layer_name = "Light paint"
    for socket in ("Base Color", "Emission Color"):
        links.new(colors.outputs["Color"], shader.inputs[socket])
    links.new(colors.outputs["Alpha"], shader.inputs["Alpha"])
    return luminance


def main(source, scratch):
    source.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    light = material()
    blue_path = [(-.5, 0, 0), (-.31, .37, .24), (-.09, -.24, -.13),
                 (.12, .27, .20), (.31, -.22, -.15), (.5, 0, 0)]
    pieces = (("SwingRibbon", slash()), ("HookRibbon", slash(reverse=True)), ("ArcLink", bolt(blue_path)),
              ("RivetTracer", tracer()), ("HeatJet", heat_jet()), ("FluxRing", flux_ring()),
              ("FluxTether", flux_tether()), ("StrikeBurst", strike_burst()), ("EnemyRound", enemy_round()))
    for index, (name, draft) in enumerate(pieces):
        row, col = divmod(index, 3)
        obj = draft.object(name, ((col - 1) * 3.5, (1 - row) * 3.0, 0), light)
        obj.data.calc_loop_triangles()
        print(f"{name}: {len(obj.data.loop_triangles)} triangles")
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_distance = 16
            area.spaces.active.shading.type = 'MATERIAL'
    bpy.ops.wm.save_as_mainfile(filepath=str(source / "battle-effects.blend"))
    bpy.ops.export_scene.gltf(filepath=str(scratch / "battle-effects.glb"), export_format='GLB',
                              export_yup=True, export_animations=False, export_vertex_color='ACTIVE')


if __name__ == "__main__":
    arguments = sys.argv[sys.argv.index("--") + 1:]
    main(Path(arguments[0]).resolve(), Path(arguments[1]).resolve())
