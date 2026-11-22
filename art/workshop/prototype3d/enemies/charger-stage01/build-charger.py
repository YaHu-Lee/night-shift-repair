"""Author the stage 01 charger and export its shared-material game assembly."""

from collections import defaultdict
from math import cos, pi, sin
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector


TILE = 128
ATLAS = TILE * 4
UV_GUTTER = 5
PIVOTS = ('TrackHousing', 'TrackLinks', 'Chassis', 'Ram', 'RamSignal', 'Jets')

FRAME, PAINT, PAINT_EDGE, STEEL, BLADE, RUBBER, CLEAT, GUNMETAL, CAVITY, STRIPES, STENCIL, HOT, LAMP, HUB, FLAME, VENT = range(16)


def texture(name, pixels, path):
    image = bpy.data.images.new(name, width=ATLAS, height=ATLAS, alpha=False)
    image.colorspace_settings.name = 'sRGB' if name in ('Base Color', 'Emissive') else 'Non-Color'
    image.pixels.foreach_set(pixels.astype(np.float32).reshape(-1))
    image.filepath_raw = str(path / f'{name}.png')
    image.file_format = 'PNG'
    image.save()
    image.pack()
    image.filepath = f'//{name}.png'
    return image


def make_atlas(path):
    # Packed as occlusion, roughness and metallic in the glTF channel order.
    surfaces = [
        ((62, 77, 82),   0.66, 0.64, 0.008),  # dry cast suspension
        ((203, 112, 26), 0.41, 0.00, 0.002),  # safety ochre sprayed enamel
        ((154, 72, 25),  0.48, 0.00, 0.003),  # enamel at rolled edges
        ((187, 208, 212), 0.27, 0.65, 0.002),  # cut bevels and piston rods
        ((182, 204, 211), 0.45, 0.50, 0.008),  # floor-facing blade with scuffed oxide
        ((31, 38, 41),   0.90, 0.00, 0.010),  # dense rubber sidewalls
        ((46, 49, 50),   0.87, 0.00, 0.012),  # road-polished rubber treads
        ((65, 74, 76),   0.38, 0.72, 0.008),  # forged mounting hardware
        ((22, 30, 33),   0.80, 0.05, 0.003),  # bellows, vents, and shadow gaps
        ((197, 123, 39), 0.57, 0.00, 0.004),  # safety stripes
        ((186, 93, 25),  0.45, 0.00, 0.003),  # painted serial plate
        ((255, 207, 107), 0.23, 0.00, 0.000),  # warning lamp in use
        ((170, 85, 29),  0.32, 0.00, 0.001),  # dim amber lamp
        ((95, 117, 122), 0.41, 0.64, 0.004),  # wheel hubs
        ((255, 158, 58), 0.76, 0.00, 0.000),  # charge exhaust
        ((106, 119, 117), 0.47, 0.52, 0.006),  # ventilator slats
    ]
    maps = [np.ones((ATLAS, ATLAS, 4)) for _ in range(4)]
    rng = np.random.default_rng(611)
    u, v = np.meshgrid(np.linspace(0, 1, TILE), np.linspace(0, 1, TILE))
    boundary = np.minimum.reduce([u, v, 1 - u, 1 - v])
    edge_wear = np.maximum(0, 1 - np.abs(boundary - 0.056) * 30)
    low = np.sin(12 * u + 5 * v) * np.cos(16 * v - 6 * u)
    overlap = np.sin(u * 58 + np.sin(v * 13) * 4) * np.cos(v * 43)

    for index, (rgb, roughness, metallic, depth) in enumerate(surfaces):
        grain = rng.standard_normal((TILE, TILE))
        color = np.broadcast_to(np.array(rgb) / 255, (TILE, TILE, 3)).copy()
        color *= (1 + 0.030 * low + 0.021 * grain)[..., None]
        scratches = np.zeros_like(u)

        if index in (STEEL, BLADE):
            mill = np.sin(v * 275 + np.sin(u * 20) * 2)
            color *= (1 + 0.030 * mill)[..., None]
            for _ in range(14 if index == BLADE else 7):
                x, y = rng.uniform(0.07, 0.92, 2)
                reach = rng.uniform(0.04, 0.23)
                strike_score = np.maximum(0, 1 - np.abs(y - v) * 82)
                scratches = np.maximum(scratches, strike_score * np.exp(-((u - x) / reach) ** 4))
            color *= (1 - 0.25 * scratches)[..., None]

        if index in (PAINT, PAINT_EDGE, STRIPES, STENCIL):
            chips = (grain + overlap * 0.95 > 2.32) * (edge_wear * 0.70 + 0.04)
            color = color * (1 - chips[..., None]) + np.array((0.55, 0.54, 0.48)) * chips[..., None]
            scratches = chips

        if index == STRIPES:
            dark = ((u + 0.75 * v) * 2.7) % 1 > 0.49
            color[dark] *= np.array((0.24, 0.32, 0.40))

        if index == STENCIL:
            # Two hand-cut stencils sized to read from the arena camera.
            glyphs = (
                ('111', '101', '101', '101', '111'),
                ('010', '110', '010', '010', '111'),
            )
            for glyph, offset in zip(glyphs, (0.19, 0.55)):
                for row, pattern in enumerate(glyph):
                    for column, filled in enumerate(pattern):
                        if filled == '1':
                            left = offset + column * 0.082
                            bottom = 0.73 - row * 0.111
                            ink = (u >= left) & (u <= left + 0.083) & (v >= bottom) & (v <= bottom + 0.112)
                            color[ink] = [0.88, 0.84, 0.69]

        if index in (RUBBER, CLEAT):
            serration = np.power(np.maximum(0, np.cos((u + abs(v - 0.5) * 0.9) * 13 * pi)), 7)
            scratches = serration * (0.29 if index == CLEAT else 0.16)
            color *= (1 - scratches * 0.70)[..., None]

        if index in (HOT, LAMP, FLAME):
            ribs = 0.84 + 0.16 * np.cos(u * 70)
            center = 0.73 + 0.26 * np.maximum(0, 1 - abs(v - 0.5) * 2)
            color *= (ribs * center)[..., None]

        height = depth * (0.20 * grain + 0.45 * overlap - scratches)
        dy, dx = np.gradient(height * TILE)
        normal = np.dstack((-dx, -dy, np.ones_like(u)))
        normal /= np.linalg.norm(normal, axis=2)[..., None]
        ambient = 0.79 + 0.21 * np.clip(boundary * 11, 0, 1)
        if index in (STEEL, BLADE):
            ambient = 0.70 + 0.30 * ambient
        if index in (RUBBER, CAVITY):
            ambient *= 0.88
        orm = np.dstack((ambient, np.clip(roughness + scratches * 0.16 + grain * 0.016, 0, 1), np.full_like(u, metallic)))
        emission = np.zeros_like(color)
        if index in (HOT, LAMP, FLAME):
            emission = color * {HOT: 1, LAMP: 0.21, FLAME: 0.89}[index]
        row, column = divmod(index, 4)
        rows = slice(row * TILE, (row + 1) * TILE)
        columns = slice(column * TILE, (column + 1) * TILE)
        for atlas, tile in zip(maps, (color.clip(0, 1), orm, normal * 0.5 + 0.5, emission)):
            atlas[rows, columns, :3] = tile

    return [texture(name, values, path) for name, values in zip(
        ('Base Color', 'Occlusion Roughness Metallic', 'Normal', 'Emissive'), maps)]


def make_material(path):
    material = bpy.data.materials.new('Charger | enamel, impact steel, rubber')
    material.use_nodes = True
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = nodes.get('Principled BSDF')
    shader.location = (390, 60)
    nodes.get('Material Output').location = (710, 60)

    def image_node(image, y):
        node = nodes.new('ShaderNodeTexImage')
        node.image = image
        node.location = (-690, y)
        return node.outputs['Color']

    color, orm, normal, emission = [image_node(image, i * -300 + 520)
                                    for i, image in enumerate(make_atlas(path))]
    links.new(color, shader.inputs['Base Color'])
    split = nodes.new('ShaderNodeSeparateColor')
    split.location = (-330, 250)
    links.new(orm, split.inputs[0])
    links.new(split.outputs['Green'], shader.inputs['Roughness'])
    links.new(split.outputs['Blue'], shader.inputs['Metallic'])
    gltf = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    gltf.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gltf_output = nodes.new('ShaderNodeGroup')
    gltf_output.node_tree = gltf
    gltf_output.location = (-10, -350)
    links.new(split.outputs['Red'], gltf_output.inputs['Occlusion'])
    bump = nodes.new('ShaderNodeNormalMap')
    bump.inputs['Strength'].default_value = 0.56
    bump.location = (-330, -95)
    links.new(normal, bump.inputs['Color'])
    links.new(bump.outputs['Normal'], shader.inputs['Normal'])
    links.new(emission, shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = 1.0
    return material


def uv_coord(tile, u, v):
    row, column = divmod(tile, 4)
    stride = TILE - 2 * UV_GUTTER
    return ((column * TILE + UV_GUTTER + u * stride) / ATLAS,
            (row * TILE + UV_GUTTER + v * stride) / ATLAS)


def natural_uv(positions):
    spans = [max(p[i] for p in positions) - min(p[i] for p in positions) for i in range(3)]
    first, second = sorted(range(3), key=lambda i: spans[i], reverse=True)[:2]
    # Keep the lettering and the caution stripe aligned with the deck.
    a, b = sorted((first, second))
    lo_a, lo_b = min(p[a] for p in positions), min(p[b] for p in positions)
    return [((p[a] - lo_a) / max(spans[a], 0.001), (p[b] - lo_b) / max(spans[b], 0.001)) for p in positions]


class Assembly:
    def __init__(self, name, collection, material, parent=None):
        self.root = bpy.data.objects.new(name, None)
        collection.objects.link(self.root)
        self.root.parent = parent.root if parent else None
        self.root.empty_display_size = 0.55
        self.collection = collection
        self.material = material
        self.parts = []

    def add(self, name, vertices, faces, tiles, uv=None):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        uv_layer = mesh.uv_layers.new(name='Atlas')
        for polygon, tile in zip(mesh.polygons, tiles):
            coordinates = uv.get(polygon.index) if uv else None
            if coordinates is None:
                coordinates = natural_uv([vertices[i] for i in polygon.vertices])
            for loop, (u, v) in zip(polygon.loop_indices, coordinates):
                uv_layer.data[loop].uv = uv_coord(tile, u, v)
        obj = bpy.data.objects.new(name, mesh)
        self.collection.objects.link(obj)
        obj.parent = self.root
        obj.data.materials.append(self.material)
        self.parts.append(obj)
        return obj

    def loft(self, name, rings, wall, top, bottom=None, transitions=None):
        length = len(rings[0])
        polygons = [tuple(reversed(range(length)))]
        tiles = [wall if bottom is None else bottom]
        for ring in range(len(rings) - 1):
            base = ring * length
            next_base = base + length
            tile = transitions[ring] if transitions else wall
            for index in range(length):
                next_index = (index + 1) % length
                polygons.append((base + index, base + next_index, next_base + next_index, next_base + index))
                tiles.append(tile)
        polygons.append(tuple(range((len(rings) - 1) * length, len(rings) * length)))
        tiles.append(top)
        return self.add(name, [point for ring in rings for point in ring], polygons, tiles)

    def plate(self, name, x, y, z, length, width, height, tile, bevel=0.20, corner=0.43, border=None, top=None):
        bevel = min(bevel, height * 0.43, length * 0.23, width * 0.23)
        rings = [
            footprint(x - length / 2 + bevel, x + length / 2 - bevel, y, width / 2 - bevel, z, corner),
            footprint(x - length / 2, x + length / 2, y, width / 2, z + bevel, corner),
            footprint(x - length / 2, x + length / 2, y, width / 2, z + height - bevel, corner),
            footprint(x - length / 2 + bevel, x + length / 2 - bevel, y, width / 2 - bevel, z + height, corner),
        ]
        return self.loft(name, rings, tile, tile if top is None else top,
                         transitions=[tile, tile, tile if border is None else border])

    def folded_plate(self, name, x, y, z, length, width, height, tile, margin, corner, top=None):
        rings = [
            footprint(x - length / 2, x + length / 2, y, width / 2, z, corner),
            footprint(x - length / 2 + margin, x + length / 2 - margin, y, width / 2 - margin, z + height, corner),
        ]
        return self.loft(name, rings, tile, tile if top is None else top)

    def drum(self, name, x, y, z, axial, profile, tile, cap, sides=8):
        # Build a revolved stepped profile. Lateral drums point +Y, rods +X.
        rings = []
        for shift, radius in profile:
            ring = []
            for i in range(sides):
                angle = 2 * pi * i / sides
                u, v = radius * cos(angle), radius * sin(angle)
                ring.append((x + shift, y + u, z + v) if axial == 'X' else (x + u, y + shift, z - v))
            rings.append(ring)
        return self.loft(name, rings, tile, cap, bottom=cap)


def footprint(rear, front, center_y, width, height, corner, nose_width=None):
    nose = width if nose_width is None else nose_width
    corner = max(0.06, min(corner, (front - rear) * 0.42, width * 0.43, nose * 0.43))
    return [(x, y + center_y, height) for x, y in [
        (front, -nose + corner), (front, nose - corner),
        (front - corner, nose), (rear + corner, width),
        (rear, width - corner), (rear, -width + corner),
        (rear + corner, -width), (front - corner, -nose),
    ]]


def track_belt(track, y):
    profiles = []
    for lateral, radius in ((-2.05, 2.42), (-2.05, 2.94), (-1.72, 3.13), (1.72, 3.13),
                            (2.05, 2.94), (2.05, 2.42), (1.67, 2.31), (-1.67, 2.31)):
        arc = [(9.35 + radius * cos(i * pi / 4), y + lateral, 3.2 + radius * sin(i * pi / 4))
               for i in range(-2, 3)]
        arc += [(-9.35 + radius * cos(i * pi / 4), y + lateral, 3.2 + radius * sin(i * pi / 4))
                for i in range(2, 7)]
        profiles.append(arc)
    count = len(profiles[0])
    faces = []
    tiles = []
    uvs = {}
    for row in range(len(profiles)):
        other = (row + 1) % len(profiles)
        for i in range(count):
            j = (i + 1) % count
            # Sidewall and outer belt share corners, smoothing through each tread arc.
            faces.append((row * count + i, other * count + i, other * count + j, row * count + j))
            tiles.append(CLEAT if row == 2 else RUBBER)
            if i in (4, 9):
                uvs[len(faces) - 1] = [(0, 0), (0, 1), (1, 1), (1, 0)]
    track.add(f'Molded rubber belt {y:+}', [p for loop in profiles for p in loop], faces, tiles, uvs)


def build_model(collection, material):
    housing = Assembly('TrackHousing', collection, material)
    links = Assembly('TrackLinks', collection, material)
    chassis = Assembly('Chassis', collection, material)
    ram = Assembly('Ram', collection, material, chassis)
    signal = Assembly('RamSignal', collection, material, ram)
    jets = Assembly('Jets', collection, material)

    housing.plate('Undercarriage', -0.8, 0, 0.87, 22.4, 13.5, 3.54, FRAME, bevel=0.28, corner=1.38)
    for side in (-1, 1):
        y = side * 9.00
        track_belt(housing, y)
        housing.plate(f'Track frame {side:+}', -0.05, y, 2.25, 21.5, 2.7, 1.48, CAVITY, corner=0.52)
        for x in (-9.35, -3.15, 3.15, 9.35):
            radius = 2.24 if abs(x) > 9 else 1.94
            housing.drum(f'Roadwheel {x:+} {side:+}', x, y, 3.24, 'Y',
                         [(-1.99, radius * 0.93), (1.99, radius * 0.93)],
                         RUBBER, GUNMETAL, sides=8)
            center = y + side * 2.07
            hub = radius * 0.56
            housing.drum(f'Dished hub {x:+} {side:+}', x, center, 3.24, 'Y',
                         [(-0.22, hub), (0.22, hub)],
                         FRAME, HUB, sides=8)
        for x in (-7.9, -5.27, -2.63, 0, 2.63, 5.27, 7.9):
            # Alternate the tire shoe crowns while keeping one moving part per axle pair.
            links.folded_plate(f'Bonded grouser {x:+} {side:+}', x, y, 6.20, 1.89, 4.33, 0.48,
                               RUBBER, margin=0.20, corner=0.36, top=CLEAT)

    chassis.loft('Welded lower body', [
        footprint(-12.10, 9.75, 0, 6.08, 3.45, 1.3, 5.12),
        footprint(-12.78, 9.75, 0, 7.15, 6.28, 1.3, 5.81),
        footprint(-12.25, 9.42, 0, 6.85, 7.50, 1.2, 5.54),
    ], FRAME, GUNMETAL)
    chassis.loft('Folded paint shell', [
        footprint(-11.72, 7.22, 0, 6.40, 7.45, 1.5, 5.18),
        footprint(-11.01, 6.69, 0, 6.58, 8.93, 1.42, 5.21),
        footprint(-9.95, 4.79, 0, 5.42, 11.15, 1.24, 4.19),
        footprint(-9.57, 4.31, 0, 5.12, 11.43, 1.13, 3.89),
    ], PAINT, PAINT, transitions=[PAINT_EDGE, PAINT, PAINT])
    chassis.plate('Recessed radiator', -5.3, -0.18, 11.34, 6.95, 6.98, 0.29, CAVITY, corner=0.52)
    chassis.plate('Stamped serial plate', 1.14, -0.4, 11.36, 4.34, 3.85, 0.38, PAINT_EDGE,
                  bevel=0.10, corner=0.48, border=PAINT, top=STENCIL)
    for i, x in enumerate((-7.61, -6.19, -4.77, -3.35)):
        chassis.folded_plate(f'Radiator upper louver {i + 1}', x, -0.18, 11.58, 0.73, 5.84, 0.37,
                             VENT, margin=0.10, corner=0.20)

    for side in (-1, 1):
        chassis.plate(f'Rolled track fender {side:+}', -2.3, side * 6.46, 7.00, 15.14, 1.15, 1.19,
                      PAINT_EDGE, bevel=0.17, corner=0.52, border=PAINT)
        chassis.plate(f'Side hinge cover {side:+}', -6.6, side * 6.68, 8.03, 5.33, 1.43, 0.51,
                      GUNMETAL, bevel=0.13, corner=0.33)
        chassis.plate(f'Rear tow mount {side:+}', -12.37, side * 4.15, 4.46, 1.79, 2.14, 2.49,
                      GUNMETAL, bevel=0.21, corner=0.30)
        chassis.drum(f'Hollow exhaust ferrule {side:+}', -12.99, side * 3.75, 6.60, 'X',
                     [(-0.29, 0.54), (-0.73, 0.55), (-0.73, 0.82), (-0.48, 1.06),
                      (0.24, 1.06), (0.62, 0.94)], GUNMETAL, CAVITY, sides=8)
        chassis.drum(f'Ram cylinder barrel {side:+}', 7.79, side * 4.13, 7.22, 'X',
                     [(-2.57, 1.02), (-2.31, 1.29), (1.53, 1.29), (1.53, 1.44),
                      (2.06, 1.44), (2.20, 1.16)], GUNMETAL, STEEL, sides=8)
        ram.drum(f'Hard chrome rod {side:+}', 10.06, side * 4.13, 7.22, 'X',
                 [(-3.37, 0.68), (2.94, 0.68), (3.13, 1.02), (4.16, 1.02)], STEEL, HUB, sides=8)
        ram.plate(f'Thrust clevis {side:+}', 13.87, side * 4.13, 4.69, 3.43, 2.48, 2.59,
                  GUNMETAL, bevel=0.20, corner=0.48)

    ram.loft('Impact plate forging', [
        footprint(12.28, 17.62, 0, 6.80, 2.64, 1.32, 8.03),
        footprint(12.03, 18.12, 0, 6.80, 3.41, 1.45, 8.17),
        footprint(12.97, 17.95, 0, 7.18, 7.30, 1.45, 8.20),
        footprint(13.65, 17.23, 0, 6.97, 8.35, 1.08, 7.90),
        footprint(13.91, 16.85, 0, 6.70, 8.57, 1.05, 7.66),
    ], BLADE, BLADE, transitions=[STEEL, BLADE, STEEL, BLADE])
    ram.loft('Lower replaceable wear shoe', [
        footprint(14.72, 18.06, 0, 7.43, 3.00, 1.00, 7.80),
        footprint(14.63, 18.30, 0, 7.54, 3.39, 1.03, 8.04),
        footprint(14.82, 18.22, 0, 7.43, 4.49, 1.03, 8.02),
        footprint(14.98, 18.08, 0, 7.28, 4.71, 1.02, 7.91),
    ], GUNMETAL, STEEL, transitions=[GUNMETAL, BLADE, STEEL])
    ram.plate('Warning strip inset', 15.28, 0, 8.52, 2.45, 7.79, 0.26, GUNMETAL,
              bevel=0.09, corner=0.41, top=STRIPES)
    for side in (-1, 1):
        y = side * 5.77
        ram.plate(f'Warning lamp bezel {side:+}', 15.28, y, 8.42, 2.38, 2.76, 0.55,
                  GUNMETAL, bevel=0.19, corner=0.45, border=STEEL)
        ram.plate(f'Amber lens {side:+}', 15.30, y, 8.94, 1.63, 1.82, 0.24, LAMP,
                  bevel=0.08, corner=0.34)
        signal.folded_plate(f'Amber lens lit {side:+}', 15.30, y, 9.08, 1.61, 1.80, 0.16,
                            HOT, margin=0.06, corner=0.31)
        ram.drum(f'Forward blade retainer {side:+}', 17.97, side * 5.99, 5.79, 'X',
                 [(-0.24, 0.77), (0.08, 0.77), (0.23, 0.54)], GUNMETAL, STEEL, sides=6)
        jets.loft(f'Exhaust burst {side:+}', [
            footprint(-17.60, -13.25, side * 3.75, 0.72, 5.75, 0.65),
            footprint(-16.93, -13.28, side * 3.75, 0.97, 6.47, 0.65),
            footprint(-15.83, -13.36, side * 3.75, 0.42, 7.08, 0.52),
        ], FLAME, HOT)
    return (housing, links, chassis, ram, signal, jets)


def merge_game_parts():
    for name in PIVOTS:
        pivot = bpy.data.objects[name]
        parts = [part for part in pivot.children if part.type == 'MESH']
        bpy.ops.object.select_all(action='DESELECT')
        for part in parts:
            part.hide_set(False)
            part.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        bpy.ops.object.join()
        merged = bpy.context.object
        merged.name = f'{pivot.name} Mesh'
        merged.data.name = merged.name
        mesh = bmesh.new()
        mesh.from_mesh(merged.data)
        bmesh.ops.triangulate(mesh, faces=list(mesh.faces), quad_method='BEAUTY', ngon_method='BEAUTY')
        mesh.to_mesh(merged.data)
        mesh.free()


def point_at(obj, location):
    obj.rotation_euler = (Vector(location) - obj.location).to_track_quat('-Z', 'Y').to_euler()


def studio(collection, render_dir):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 20
    scene.cycles.use_denoising = True
    scene.render.image_settings.file_format = 'PNG'
    scene.render.resolution_x = 760
    scene.render.resolution_y = 600
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = 'AgX'
    scene.world = bpy.data.worlds.new('Neutral workshop fill')
    scene.world.color = (0.14, 0.16, 0.18)

    def place(name, data, location):
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        return obj

    def area(name, location, power, color, size):
        source = bpy.data.lights.new(name, 'AREA')
        source.energy, source.color, source.shape, source.size = power, color, 'DISK', size
        point_at(place(name, source, location), (0, 0, 4))

    area('Large neutral key', (18, -28, 41), 42500, (1.0, 0.94, 0.85), 34)
    area('Cool steel rim', (-25, 18, 24), 43000, (0.65, 0.80, 1.0), 23)
    area('Front face softbox', (26, 12, 20), 21000, (0.83, 0.91, 1.0), 27)
    floor = bpy.data.meshes.new('Backdrop')
    floor.from_pydata([(-100, -100, -0.07), (100, -100, -0.07), (100, 100, -0.07), (-100, 100, -0.07)],
                     [], [(0, 1, 2, 3)])
    object_floor = place('Backdrop', floor, (0, 0, 0))
    matte = bpy.data.materials.new('Backdrop')
    matte.diffuse_color = (0.043, 0.057, 0.066, 1)
    object_floor.data.materials.append(matte)
    camera_data = bpy.data.cameras.new('Arena orthographic')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 46.4
    camera = place('Arena orthographic', camera_data, (25, -28, 47))
    point_at(camera, (1.2, 0, 4.5))
    scene.camera = camera
    scene.render.filepath = str(render_dir / 'charger-front.png')
    return camera


def build_source(source, scratch):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    design = bpy.data.collections.new('Charger | editable subassemblies')
    scene.collection.children.link(design)
    stage = bpy.data.collections.new('Preview | off in exports')
    scene.collection.children.link(stage)
    material = make_material(scratch)
    assemblies = build_model(design, material)
    camera = studio(stage, scratch)

    # Keep the shipping state easy to inspect in the editable file.
    idle_inactive = (assemblies[-2].parts, assemblies[-1].parts)
    for part in (p for group in idle_inactive for p in group):
        part.hide_set(True)
        part.hide_render = True
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_rotation = camera.rotation_euler.to_quaternion()
            area.spaces.active.region_3d.view_distance = 46
            area.spaces.active.region_3d.view_location = (0, 0, 4)
            area.spaces.active.region_3d.view_perspective = 'ORTHO'
            area.spaces.active.overlay.show_floor = False
    bpy.ops.wm.save_as_mainfile(filepath=str(source))


def export_glb(destination):
    merge_game_parts()
    for obj in list(bpy.data.collections['Preview | off in exports'].objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    triangle_counts = defaultdict(int)
    for obj in bpy.data.collections['Charger | editable subassemblies'].objects:
        if obj.type == 'MESH':
            obj.data.calc_loop_triangles()
            triangle_counts[obj.parent.name] += len(obj.data.loop_triangles)
    print('Charger triangles:', dict(triangle_counts), 'total', sum(triangle_counts.values()))
    bpy.ops.export_scene.gltf(
        filepath=str(destination),
        export_format='GLB',
        export_yup=True,
        export_tangents=True,
        export_animations=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
    )


def main(output, scratch, render, export_edited):
    output.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    source = output / 'charger-stage01.blend'
    if export_edited:
        bpy.ops.wm.open_mainfile(filepath=str(source))
    else:
        build_source(source, scratch)
    export_glb(scratch / 'charger-stage01.glb')
    if render:
        bpy.ops.wm.open_mainfile(filepath=str(source))
        scene = bpy.context.scene
        scene.render.filepath = str(scratch / 'charger-front.png')
        bpy.ops.render.render(write_still=True)
        scene.camera.location = (-29, -18, 44)
        point_at(scene.camera, (0, 0, 5))
        scene.render.filepath = str(scratch / 'charger-rear.png')
        bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    arguments = sys.argv[sys.argv.index('--') + 1:]
    flags = arguments[2:]
    main(Path(arguments[0]).resolve(), Path(arguments[1]).resolve(), '--render' in flags, '--export-edited' in flags)
