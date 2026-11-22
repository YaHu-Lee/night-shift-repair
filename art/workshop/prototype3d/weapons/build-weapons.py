"""Create the mechanic's handheld tools, editable assemblies and a Cocos GLB."""

import json
from math import cos, pi, sin
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector


TILE = 128
ATLAS = TILE * 4
SURFACES = {
    'steel': ((150, 168, 171), .46, .40, .021),
    'edge': ((205, 211, 204), .50, .29, .014),
    'dark': ((43, 55, 59), .43, .54, .020),
    'black': ((21, 29, 33), .10, .70, .015),
    'rubber': ((36, 43, 46), .00, .89, .055),
    'orange': ((191, 81, 31), .02, .47, .020),
    'ochre': ((181, 129, 54), .05, .51, .019),
    'teal': ((40, 107, 109), .09, .47, .023),
    'ceramic': ((210, 197, 161), .00, .57, .012),
    'copper': ((152, 91, 57), .56, .43, .023),
    'brass': ((177, 137, 75), .58, .45, .018),
    'light': ((92, 211, 195), .06, .30, .006),
    'hot': ((238, 167, 74), .06, .34, .008),
    'rust': ((129, 61, 41), .35, .55, .025),
    'char': ((53, 53, 49), .17, .67, .032),
    'ivory': ((227, 218, 187), .01, .43, .011),
}
SURFACE_INDEX = {name: index for index, name in enumerate(SURFACES)}


def atlas(folder):
    maps = np.ones((4, ATLAS, ATLAS, 4), dtype=np.float32)
    rng = np.random.default_rng(811)
    u, v = np.meshgrid(np.linspace(0, 1, TILE), np.linspace(0, 1, TILE))
    for index, (name, (rgb, metal, rough, height)) in enumerate(SURFACES.items()):
        noise = rng.normal(0, .38, u.shape)
        wave = .18 * sin(pi / 3) * np.sin(18 * v + 9 * u) * np.cos(12 * u)
        worn = np.zeros_like(u)
        for _ in range(12):
            a, b = rng.uniform(.1, .9, 2)
            length = rng.uniform(.025, .180)
            line = np.exp(-((u - a) / length) ** 4 - ((v - b - .04 * (u - a)) / .007) ** 2)
            worn = np.maximum(worn, line * rng.uniform(.0, .55))
        if name in ('orange', 'ochre', 'teal', 'rust'):
            seam = np.minimum.reduce([u, v, 1 - u, 1 - v])
            chips = np.clip((.08 - seam) * 14, 0, 1) * np.clip((wave + noise - .27) * 1.9, 0, 1)
            color = np.array(rgb) / 255 * (1 + .060 * (wave + noise)[..., None])
            color = color * (1 - worn[..., None] * .17) + worn[..., None] * np.array((.11, .10, .08))
            color = color * (1 - chips[..., None] * .37) + chips[..., None] * np.array((.28, .29, .27))
        else:
            color = np.array(rgb) / 255 * (1 + .070 * (wave + noise)[..., None] + worn[..., None] * .13)
        grain = wave + noise * .13 + worn * .22
        if name in ('steel', 'edge', 'brass', 'copper'):
            grain += .12 * np.sin(164 * v + u * 2)
        if name == 'rubber':
            grain += .15 * np.sin(u * 54) * np.sin(v * 52)
        dy, dx = np.gradient(grain * height * 21)
        normals = np.dstack((-dx, -dy, np.ones_like(u)))
        normals /= np.linalg.norm(normals, axis=2)[..., None]
        orm = np.dstack((.965 - worn * .08, np.clip(rough + noise * .011, 0, 1), np.full_like(u, metal)))
        glow = np.zeros_like(color)
        if name in ('hot', 'light'):
            glow[:] = np.array(rgb) / 255 * .40
        row, col = divmod(index, 4)
        for i, pixels in enumerate((color, normals * .5 + .5, orm, glow)):
            maps[i, row * TILE:(row + 1) * TILE, col * TILE:(col + 1) * TILE, :3] = np.clip(pixels, 0, 1)
    names = ('Weapon Base Color', 'Weapon Normal', 'Weapon ORM', 'Weapon Emissive')
    images = {}
    for name, pixels in zip(names, maps):
        image = bpy.data.images.new(name, width=ATLAS, height=ATLAS, alpha=False)
        image.colorspace_settings.name = 'sRGB' if name.endswith(('Color', 'Emissive')) else 'Non-Color'
        image.pixels.foreach_set(pixels.reshape(-1))
        image.filepath_raw = str(folder / (name + '.png'))
        image.file_format = 'PNG'
        image.save()
        image.pack()
        image.filepath = '//' + name + '.png'
        images[name] = image
    return images


def material_atlas(folder):
    mat = bpy.data.materials.new('Workshop tools | steel, enamel and insulators')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    link = mat.node_tree.links.new
    shader = nodes.get('Principled BSDF')
    images = atlas(folder)
    textures = {}
    for index, (name, image) in enumerate(images.items()):
        node = nodes.new('ShaderNodeTexImage')
        node.location = (-630, 420 - index * 250)
        node.image = image
        textures[name] = node
    normal = nodes.new('ShaderNodeNormalMap')
    normal.location = (-320, 155)
    split = nodes.new('ShaderNodeSeparateColor')
    split.location = (-320, -109)
    gltf_data = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    gltf_data.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    settings = nodes.new('ShaderNodeGroup')
    settings.node_tree = gltf_data
    settings.location = (-120, -395)
    link(textures['Weapon Base Color'].outputs['Color'], shader.inputs['Base Color'])
    link(textures['Weapon Normal'].outputs['Color'], normal.inputs['Color'])
    link(normal.outputs['Normal'], shader.inputs['Normal'])
    link(textures['Weapon ORM'].outputs['Color'], split.inputs['Color'])
    link(split.outputs['Red'], settings.inputs['Occlusion'])
    link(split.outputs['Green'], shader.inputs['Roughness'])
    link(split.outputs['Blue'], shader.inputs['Metallic'])
    link(textures['Weapon Emissive'].outputs['Color'], shader.inputs['Emission Color'])
    shader.inputs['Emission Strength'].default_value = .65
    return mat


def surface_uv(surface, u, v):
    row, col = divmod(SURFACE_INDEX[surface], 4)
    gutter = 5 / TILE
    return ((col + gutter + u * (1 - 2 * gutter)) / 4,
            (row + gutter + v * (1 - 2 * gutter)) / 4)


class Tool:
    def __init__(self, name, collection, material):
        self.node = bpy.data.objects.new(name, None)
        self.node.empty_display_size = .08
        collection.objects.link(self.node)
        self.material = material
        self.collection = collection

    def mesh(self, name, vertices, faces, surface_names, smooth=()):
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        uv = mesh.uv_layers.new(name='Atlas')
        bounds = [(min(p[i] for p in vertices), max(p[i] for p in vertices)) for i in range(3)]
        for face, surface in zip(mesh.polygons, surface_names):
            face.use_smooth = face.index in smooth
            major = max(range(3), key=lambda axis: abs(face.normal[axis]))
            axes = [i for i in range(3) if i != major]
            for loop in face.loop_indices:
                point = mesh.vertices[mesh.loops[loop].vertex_index].co
                u, v = [(point[i] - bounds[i][0]) / max(.00001, bounds[i][1] - bounds[i][0]) for i in axes]
                uv.data[loop].uv = surface_uv(surface, u, v)
        # Keep profiles readable regardless of whether their authored outline ran CW or CCW.
        shell = bmesh.new()
        shell.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(shell, faces=list(shell.faces))
        shell.to_mesh(mesh)
        shell.free()
        mesh.materials.append(self.material)
        obj = bpy.data.objects.new(name, mesh)
        obj.parent = self.node
        self.collection.objects.link(obj)
        return obj

    def profile(self, name, outline, width, surface, *, y=0, edge=None, bevel=.06):
        """Extrude a beveled outline authored in the length/height plane."""
        center = tuple(sum(point[i] for point in outline) / len(outline) for i in (0, 1))
        depth = min(.015, width * .22)
        vertices = []
        for side, inset in ((-.5, bevel), (-.5 + depth / width, 0),
                            (.5 - depth / width, 0), (.5, bevel)):
            for x, z in outline:
                vertices.append((x * (1 - inset) + center[0] * inset, y + side * width,
                                 z * (1 - inset) + center[1] * inset))
        count = len(outline)
        faces = [tuple(reversed(range(count)))]
        materials = [surface]
        for level in range(3):
            for i in range(count):
                n = (i + 1) % count
                faces.append((level * count + i, level * count + n, (level + 1) * count + n, (level + 1) * count + i))
                materials.append((edge or surface) if level != 1 else surface)
        faces.append(tuple(range(3 * count, 4 * count)))
        materials.append(surface)
        return self.mesh(name, vertices, faces, materials)

    def block(self, name, center, dims, surface, *, edge=None, angle=0):
        x, y, z = center
        w, d, h = dims
        w, h = w / 2, h / 2
        steps = ((1, .62), (.70, 1), (-.70, 1), (-1, .62),
                 (-1, -.62), (-.70, -1), (.70, -1), (1, -.62))
        outline = [(x + u * w * cos(angle) - v * h * sin(angle),
                    z + u * w * sin(angle) + v * h * cos(angle)) for u, v in steps]
        return self.profile(name, outline, d, surface, y=y, edge=edge)

    def drum(self, name, center, rings, surface, *, axis='X', sides=14, inner=False):
        """Build a round profile; closed loops make hollow collar trims."""
        x, y, z = center
        vertices = []
        for distance, radius in rings:
            for i in range(sides):
                phase = i * 2 * pi / sides
                u, v = cos(phase) * radius, sin(phase) * radius
                if axis == 'Z':
                    vertices.append((x + u, y + v, z + distance))
                elif axis == 'Y':
                    vertices.append((x + v, y + distance, z + u))
                else:
                    vertices.append((x + distance, y + u, z + v))
        faces = [] if inner else [tuple(reversed(range(sides)))]
        smooth = []
        for level in range(len(rings) - (not inner)):
            other = (level + 1) % len(rings)
            for i in range(sides):
                next_i = (i + 1) % sides
                smooth.append(len(faces))
                faces.append((level * sides + i, level * sides + next_i,
                              other * sides + next_i, other * sides + i))
        if not inner:
            faces.append(tuple(range((len(rings) - 1) * sides, len(rings) * sides)))
        return self.mesh(name, vertices, faces, [surface] * len(faces), smooth)

    def collar(self, name, center, width, radius, inside, surface, *, axis='X', sides=16):
        return self.drum(name, center, [
            (-width / 2, inside), (-width / 2, radius * .89), (-width * .29, radius),
            (width * .29, radius), (width / 2, radius * .91), (width / 2, inside)
        ], surface, axis=axis, sides=sides, inner=True)

    def fasteners(self, points, *, axis='Y', color='edge', radius=.018):
        for point in points:
            self.drum('Captive fastener', point, [(-.008, radius * .85), (-.004, radius), (.004, radius), (.008, radius * .8)],
                      color, axis=axis, sides=8)


def pistol_grip(t, accent='teal'):
    t.profile('Insulated tool grip',
              [(-.121, .117), (.039, .094), (.055, .022), (-.022, -.131),
               (-.136, -.117), (-.151, -.058), (-.071, .065)], .128, 'rubber', edge='dark')
    t.block('Color-coded heel cap', (-.075, 0, -.118), (.144, .146, .036), accent, edge='dark', angle=-.14)
    for z in (-.064, -.036, -.010):
        t.block('Grip tread', (-.130 + (z + .064) * .58, 0, z), (.036, .135, .014), 'black', angle=-.19)


def wrench(t, bypass=False):
    # Same offset and downward tool attitude as the wrist rig; gap opens along the shaft.
    t.profile('Drop-forged wrench shaft',
              [(-.082, .302), (.085, .302), (.085, .225), (.058, .093), (.088, -.019),
               (.159, -.111), (.154, -.183), (.035, -.184), (-.032, -.105),
               (-.045, -.008), (-.051, .124), (-.079, .244)], .105, 'steel', edge='edge')
    t.profile('Overmolded upper hand grip',
              [(-.075, .289), (.071, .289), (.068, .217), (.049, .163), (-.051, .158), (-.074, .206)],
              .132, 'rubber', edge='dark')
    for side in (-1, 1):
        t.profile('Stamped undergrip recess',
                  [(-.011, .144), (.033, .144), (.034, .066), (.048, -.059), (.033, -.086),
                   (.013, -.066), (-.004, .030)], .014, 'dark', y=side * .052, edge='edge')
        t.profile('Insulating inlay',
                  [(0, .123), (.021, .126), (.028, .04), (.037, -.052), (.024, -.063), (.013, -.040)],
                  .010, 'teal' if not bypass else 'orange', y=side * .060)
    t.profile('Fixed serrated jaw',
              [(-.048, -.108), (.060, -.134), (.080, -.184), (.054, -.222),
               (.040, -.312), (-.031, -.324), (-.074, -.278), (-.077, -.205)],
              .150, 'steel', edge='edge')
    t.profile('Graduated sliding jaw',
              [(.126, -.102), (.200, -.127), (.263, -.195), (.271, -.260),
               (.223, -.303), (.156, -.324), (.141, -.270), (.160, -.216), (.133, -.180)],
              .141, 'copper' if bypass else 'steel', edge='edge')
    t.block('Adjuster well', (.113, 0, -.146), (.152, .148, .082), 'black')
    t.drum('Knurled adjuster wheel', (.117, 0, -.145), [(-.044, .038), (-.027, .052), (.027, .052), (.044, .038)],
           'dark', axis='Z', sides=14)
    for z in (-.173, -.154, -.135, -.116):
        t.drum('Machined adjuster ridge', (.117, 0, z), [(-.006, .056), (.006, .056)], 'edge', axis='Z', sides=14)
    for side in (-1, 1):
        for i in range(4):
            t.block('Graduation mark', (.183 + i * .011, side * .074, -.188 - i * .009),
                    (.018, .008, .009), 'edge', angle=-.20)
        t.profile('Polished lower jaw cheek',
                  [(-.065, -.213), (-.036, -.221), (.012, -.297), (.004, -.310),
                   (-.032, -.310), (-.064, -.269)], .008, 'edge', y=side * .076)
        t.fasteners([(.112, side * .076, -.145)], color='steel', radius=.018)
    for z in (-.262, -.278, -.294):
        t.profile('Milled jaw contact step', [(0.037, z + .009), (.058, z + .012), (.053, z),
                 (.038, z - .004)], .111, 'edge')
    if bypass:
        t.block('Ceramic isolator collar', (.077, 0, -.068), (.147, .158, .054), 'ceramic', angle=-.18)
        for side in (-1, 1):
            t.profile('Bypass contact bridge',
                      [(.030, .089), (.065, .100), (.115, .075), (.135, -.016),
                       (.116, -.072), (.084, -.074), (.093, -.002), (.074, .053), (.035, .056)],
                      .025, 'copper', y=side * .053, edge='brass')
            t.block('Bridge diagnostic light', (.091, side * .077, -.007), (.029, .014, .052), 'light')
        t.block('Padded jaw insert', (.181, 0, -.269), (.051, .145, .106), 'ivory', angle=-.14)


def arc_gun(t):
    pistol_grip(t, 'orange')
    t.profile('Cast lower rail',
              [(-.157, .151), (.255, .161), (.397, .122), (.392, .079),
               (.233, .049), (.107, .056), (.067, .022), (-.136, .044)], .207, 'dark', edge='steel')
    t.profile('Orange service casing',
              [(-.172, .190), (-.126, .260), (-.028, .308), (.267, .295), (.370, .231),
               (.390, .151), (.288, .096), (.007, .093), (-.101, .124)], .260, 'orange', edge='ochre')
    t.block('Protected rear contact block', (-.147, 0, .210), (.081, .210, .107), 'dark', edge='steel')
    t.block('Coolant window', (.097, 0, .293), (.224, .131, .046), 'teal', edge='ceramic')
    t.block('Top indicator', (.052, 0, .316), (.087, .056, .025), 'light')
    t.block('Lower actuator pocket', (.083, 0, .055), (.220, .140, .096), 'black', angle=.06)
    for side in (-1, 1):
        t.profile('Recessed rib cover',
                  [(-.057, .170), (-.005, .235), (.203, .226), (.248, .184),
                   (.213, .145), (.003, .142)], .024, 'dark', y=side * .126)
        for x in (.023, .074, .125, .176):
            t.block('Ceramic bridge vent', (x, side * .139, .187), (.026, .016, .069), 'teal', angle=-.31)
        t.fasteners([(-.081, side * .126, .216), (.285, side * .124, .201), (.287, side * .120, .123)], radius=.013)
        t.profile('Lower service seal', [(-.125, .132), (-.072, .114), (.044, .111), (.191, .112),
                  (.267, .119), (.275, .113), (.197, .101), (.042, .101), (-.074, .103), (-.130, .122)],
                  .016, 'black', y=side * .127)
        t.profile('Replaceable back corner plate', [(-.153, .188), (-.121, .232), (-.096, .240),
                  (-.102, .212), (-.133, .169)], .022, 'dark', y=side * .111, edge='steel')
        t.profile('Electrode guard',
                  [(.350, .201), (.521, .207), (.576, .163), (.557, .132),
                   (.493, .150), (.408, .140), (.336, .152)],
                  .057, 'steel', y=side * .096, edge='edge')
    t.collar('Front ceramic insulator', (.377, 0, .145), .104, .118, .076, 'ceramic', sides=16)
    t.drum('Encased field generator', (.466, 0, .145),
           [(-.049, .075), (-.035, .082), (.058, .069)], 'dark')
    for x in (.426, .456, .486):
        t.collar('Copper winding brass contact', (x, 0, .145), .019, .091, .066, 'copper', sides=12)
    t.collar('Teal nozzle cover', (.544, 0, .142), .065, .090, .055, 'teal')
    t.collar('Burnished nozzle end lip', (.567, 0, .142), .014, .092, .055, 'edge', sides=24)
    t.drum('Capacitor face', (.566, 0, .137), [(-.023, .050), (.010, .054)], 'black')
    t.drum('Arc emission lens', (.583, 0, .137), [(-.014, .036), (.009, .035)], 'light')


def riveter(t):
    pistol_grip(t, 'ochre')
    t.profile('Compact riveter shell',
              [(-.148, .171), (-.115, .258), (.209, .265), (.367, .211),
               (.387, .108), (.304, .070), (-.111, .066)], .244, 'ochre', edge='edge')
    t.block('Top stamped guide', (.097, 0, .261), (.313, .147, .053), 'steel', edge='edge')
    t.block('Index channel', (.169, 0, .292), (.126, .050, .016), 'dark')
    t.profile('Short quick-load pouch',
              [(.110, .142), (.257, .127), (.247, -.077), (.195, -.146),
               (.111, -.134), (.089, -.071)], .160, 'dark', edge='steel')
    for side in (-1, 1):
        t.block('Pressed shell inset', (.108, side * .120, .168), (.228, .028, .096), 'rust', edge='dark')
        for x in (-.001, .064, .129):
            t.block('Reinforced inset bar', (x, side * .136, .164), (.024, .013, .066), 'edge', angle=-.30)
        t.fasteners([(-.090, side * .116, .170), (.265, side * .120, .177)], radius=.017)
    t.drum('Formed front shroud', (.436, 0, .132), [
        (-.098, .107), (-.050, .108), (-.039, .088), (.013, .079), (.031, .066), (.092, .065)
    ], 'steel', sides=16)
    t.collar('Riveter locator cup', (.557, 0, .132), .092, .084, .043, 'edge')
    t.drum('Dark recessed button', (.560, 0, .132), [(-.008, .045), (.005, .042)], 'black')
    t.block('Locator status LED', (.328, 0, .193), (.056, .071, .033), 'hot')


def hydraulic(t):
    pistol_grip(t, 'copper')
    t.profile('Long reinforced housing',
              [(-.141, .123), (-.128, .225), (.033, .278), (.383, .250),
               (.484, .209), (.491, .072), (.367, .038), (.140, .064), (-.118, .064)],
              .265, 'copper', edge='brass')
    t.block('Rear shock buffer', (-.138, 0, .159), (.080, .255, .152), 'dark', edge='steel')
    t.block('Equalizer bridge', (.222, 0, -.020), (.301, .189, .130), 'dark', edge='steel', angle=.12)
    t.block('Insulator top face', (.105, 0, .261), (.191, .129, .054), 'ceramic', edge='ivory')
    t.block('Amber status bar', (.122, 0, .291), (.063, .054, .013), 'hot')
    for side in (-1, 1):
        t.profile('Piston saddle', [(.136, .230), (.348, .250), (.498, .180), (.462, .121),
                                   (.224, .118), (.122, .152)], .047, 'dark', y=side * .120, edge='steel')
        t.drum('Exposed shock absorber rails', (.521, side * .117, .171),
               [(-.138, .031), (-.119, .047), (-.069, .047), (-.044, .029), (.110, .029), (.142, .021)],
               'edge', sides=12)
        t.fasteners([(.203, side * .144, .153), (.402, side * .137, .176)], radius=.015)
    t.drum('Main lance cover', (.598, 0, .119), [
        (-.140, .113), (-.103, .118), (-.072, .098), (.094, .064), (.135, .064)
    ], 'steel', sides=16)
    t.collar('Square-set wear insert', (.739, 0, .119), .071, .080, .036, 'dark', sides=8)
    t.drum('Recessed pad face', (.743, 0, .119), [(-.016, .035), (.001, .035)], 'black', sides=10)


def torch(t):
    pistol_grip(t, 'rust')
    t.profile('Heat tool frame',
              [(-.095, .110), (-.070, .219), (.184, .257), (.384, .207),
               (.456, .140), (.411, .058), (.253, .054), (.167, .075), (-.084, .035)],
              .192, 'rust', edge='copper')
    t.drum('Sealed lower canister', (.225, 0, -.085), [
        (-.167, .049), (-.136, .083), (-.099, .101), (.094, .101), (.147, .083), (.165, .049)
    ], 'copper', sides=16)
    for x in (.105, .313):
        t.collar('Canister protective band', (x, 0, -.085), .038, .110, .095, 'dark', sides=14)
    t.block('Canister lock bracket', (.271, 0, .010), (.165, .160, .074), 'steel')
    t.drum('Sooted extension', (.483, 0, .120),
           [(-.105, .073), (-.083, .098), (-.030, .098), (.091, .058), (.135, .055)], 'char', sides=16)
    for side in (-1, 1):
        t.profile('Vented protective petal',
                  [(.409, .179), (.543, .216), (.663, .203), (.707, .167),
                   (.641, .149), (.497, .126), (.416, .129)],
                  .044, 'rust', y=side * .074, edge='hot')
        t.fasteners([(.239, side * .103, .170), (.395, side * .101, .142)], radius=.015)
    t.collar('Porcelain flare shield', (.664, 0, .119), .121, .106, .066, 'ceramic')
    t.collar('Blackened lip', (.718, 0, .119), .071, .084, .046, 'char')
    t.drum('Deep red bore cap', (.709, 0, .119), [(-.028, .047), (-.014, .044)], 'rust', sides=12)


def pulse(t):
    pistol_grip(t)
    t.profile('Waveguide lower housing',
              [(-.105, .098), (-.083, .217), (.013, .280), (.384, .260), (.470, .204),
               (.458, .082), (.325, .038), (.120, .046), (-.092, .040)], .262, 'teal', edge='steel')
    t.block('Wide waveguide frequency bar', (.232, 0, .277), (.217, .124, .039), 'dark', edge='ceramic')
    t.block('Wide teal index light', (.203, 0, .306), (.119, .069, .022), 'light')
    for side in (-1, 1):
        t.block('Shock plate', (.247, side * .124, .138), (.207, .034, .115), 'dark', edge='edge')
        t.fasteners([(.170, side * .149, .139), (.319, side * .149, .139)], radius=.014)
    t.drum('Flared nozzle support', (.543, 0, .119),
           [(-.134, .097), (-.078, .096), (-.051, .107), (.065, .109), (.129, .140)], 'ceramic', sides=18)
    t.collar('Outer flared lip', (.686, 0, .119), .150, .147, .108, 'steel', sides=20)
    t.collar('Pulsing lining', (.730, 0, .119), .097, .120, .090, 'teal', sides=18)
    t.collar('Waveguide luminous rim', (.775, 0, .119), .030, .099, .072, 'light', sides=18)
    t.drum('Inset waveguide plate', (.726, 0, .119),
           [(-.016, .103), (.006, .101)], 'black', sides=18)


def split_probe(t):
    pistol_grip(t, 'ceramic')
    t.profile('Two-channel ceramic controller',
              [(-.118, .124), (-.112, .230), (.050, .279), (.262, .251),
               (.379, .203), (.384, .105), (.268, .070), (-.089, .063)],
              .258, 'ceramic', edge='ivory')
    t.block('Split controller waist', (.317, 0, .137), (.168, .319, .148), 'dark', edge='steel')
    t.block('Insulated branch yoke', (.377, 0, .145), (.116, .349, .128), 'copper', edge='brass')
    t.block('Controller selector strip', (.091, 0, .268), (.191, .165, .045), 'dark')
    for side in (-1, 1):
        t.block('Paired channel indicators', (.093, side * .043, .296), (.129, .027, .021), 'light')
        t.profile('Offset probe blade',
                  [(.393, .181), (.541, .189), (.716, .181), (.768, .160),
                   (.771, .110), (.700, .099), (.529, .103), (.390, .113)],
                  .087, 'steel', y=side * .162, edge='edge')
        for x in (.499, .568):
            t.collar('Dielectric collars', (x, side * .163, .143), .047, .071, .053,
                     'ceramic', sides=12)
        t.collar('Half split tip', (.711, side * .163, .143), .087, .061, .044, 'teal', sides=12)
        t.drum('Twin collector face', (.759, side * .163, .143),
               [(-.018, .044), (.017, .036)], 'light', sides=12)
        t.fasteners([(.194, side * .124, .167)], radius=.014)


def induction(t):
    pistol_grip(t, 'brass')
    t.profile('Induction L bracket',
              [(-.102, .036), (-.052, .128), (.051, .161), (.315, .147), (.341, .076),
               (.308, -.077), (.134, -.090), (-.049, -.071)],
              .233, 'teal', edge='steel')
    t.drum('Upright core column', (.158, 0, .265), [
        (-.160, .148), (-.129, .145), (-.106, .110), (.125, .110), (.164, .134), (.188, .139)
    ], 'dark', axis='Z', sides=18)
    for z in (.171, .230, .289, .348, .407):
        t.collar('Exposed induction winding', (.158, 0, z), .035, .141, .101,
                 'brass', axis='Z', sides=16)
    for side in (-1, 1):
        t.profile('Coil impact hoop',
                  [(.028, .131), (.019, .193), (.020, .388), (.070, .458),
                   (.083, .453), (.074, .385), (.074, .204), (.075, .141)],
                  .039, 'teal', y=side * .128, edge='edge')
    t.drum('Ceramic collector cap', (.158, 0, .474),
           [(-.049, .141), (-.030, .145), (.003, .133), (.035, .098), (.045, .085)],
           'ceramic', axis='Z', sides=16)
    t.collar('Cool indicator gasket', (.158, 0, .524), .045, .091, .063, 'steel', axis='Z')
    t.drum('Induction cap lens', (.158, 0, .544), [(-.025, .062), (.010, .046)],
           'light', axis='Z', sides=12)


def traction(t):
    pistol_grip(t)
    t.profile('Traction driver casting',
              [(-.085, .051), (-.057, .152), (.024, .261), (.294, .265),
               (.367, .195), (.364, .088), (.258, -.033), (.067, -.052), (-.088, -.046)],
              .286, 'teal', edge='steel')
    t.block('Traction status panel', (.136, 0, .261), (.165, .161, .049), 'dark', edge='edge')
    t.block('Traction meter line', (.130, 0, .292), (.101, .075, .016), 'light')
    t.collar('Copper traction pickup', (.321, 0, .172), .112, .137, .092, 'copper', sides=16)
    for side in (-1, 1):
        t.profile('Hooked magnetic pole',
                  [(.285, .233), (.378, .262), (.490, .247), (.555, .202), (.573, .165),
                   (.555, .111), (.450, .097), (.389, .121), (.305, .122)],
                  .114, 'steel', y=side * .145, edge='edge')
        t.block('U-shaped attraction face', (.552, side * .104, .161), (.064, .149, .121), 'teal', edge='ceramic')
        t.block('Inset traction stripe', (.593, side * .101, .162), (.014, .087, .041), 'light')
        t.fasteners([(.397, side * .206, .188), (.481, side * .204, .169)], radius=.015)
    t.drum('Black return pole', (.366, 0, .172),
           [(-.008, .088), (.028, .077), (.053, .074)], 'dark', sides=16)


BLUEPRINTS = {
    'wrench': wrench,
    'arc_gun': arc_gun,
    'riveter': riveter,
    'torch': torch,
    'induction': induction,
    'hydraulic_nailer': hydraulic,
    'pulse_nozzle': pulse,
    'traction_coil': traction,
    'split_probe': split_probe,
    'bypass_wrench': lambda tool: wrench(tool, bypass=True),
}


def editable_scene(source, scratch, primary):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    scene = bpy.context.scene
    design = bpy.data.collections.new('Editable handheld tool assemblies')
    scene.collection.children.link(design)
    mat = material_atlas(scratch)
    glyphs = list(BLUEPRINTS)[:2] if primary else list(BLUEPRINTS)
    for index, name in enumerate(glyphs):
        tool = Tool(name, design, mat)
        BLUEPRINTS[name](tool)
        tool.node.location = ((index % 5 - (0.5 if primary else 2)) * 1.07,
                              (index // 5 - (0 if primary else 0.5)) * 1.0, 0)
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            viewport = area.spaces.active
            viewport.region_3d.view_location = (.20, 0, .10)
            viewport.region_3d.view_distance = 5.8 if not primary else 2.7
            viewport.region_3d.view_rotation = Vector((-.3, .8, -.6)).to_track_quat('-Z', 'Y')
            viewport.region_3d.view_perspective = 'ORTHO'
            viewport.shading.type = 'MATERIAL'
            viewport.overlay.show_floor = False
            viewport.overlay.show_axis_x = False
            viewport.overlay.show_axis_y = False
            viewport.overlay.show_extras = False
    bpy.ops.wm.save_as_mainfile(filepath=str(source))


def export_runtime(scratch):
    design = bpy.data.collections['Editable handheld tool assemblies']
    runtime = bpy.data.collections.new('Workshop handheld tools')
    bpy.context.scene.collection.children.link(runtime)
    metrics = {}
    for root in [obj for obj in design.objects if not obj.parent]:
        name = root.name
        vertices, faces, face_uv, smoothing = [], [], [], []
        for obj in root.children:
            start = len(vertices)
            part = obj.data
            uvs = part.uv_layers.active.data
            vertices.extend(obj.matrix_local @ point.co for point in part.vertices)
            for face in part.polygons:
                faces.append(tuple(start + i for i in face.vertices))
                face_uv.append([uvs[loop].uv.copy() for loop in face.loop_indices])
                smoothing.append(face.use_smooth)
        root.name = 'Editable ' + name
        mesh = bpy.data.meshes.new(name + ' Mesh')
        mesh.from_pydata(vertices, [], faces)
        channel = mesh.uv_layers.new(name='Atlas')
        for face, uvs, smooth in zip(mesh.polygons, face_uv, smoothing):
            face.use_smooth = smooth
            for loop, uv in zip(face.loop_indices, uvs):
                channel.data[loop].uv = uv
        mesh.materials.append(root.children[0].data.materials[0])
        surface = bmesh.new()
        surface.from_mesh(mesh)
        bmesh.ops.triangulate(surface, faces=[face for face in surface.faces if len(face.verts) > 4])
        surface.to_mesh(mesh)
        surface.free()
        node = bpy.data.objects.new(name, mesh)
        runtime.objects.link(node)
        mesh.calc_loop_triangles()
        assert all(tri.area > 0 for tri in mesh.loop_triangles), name + ' has a degenerate face'
        metrics[name] = {
            'triangles': len(mesh.loop_triangles),
            'vertex_count': len(vertices),
            'bounds_blender_xyz': [[round(min(vertex[i] for vertex in vertices), 4),
                                    round(max(vertex[i] for vertex in vertices), 4)] for i in range(3)],
        }
    for obj in list(design.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.ops.export_scene.gltf(
        filepath=str(scratch / 'weapons-dcc.glb'), export_format='GLB',
        export_yup=True, export_tangents=True, export_animations=False,
        export_cameras=False, export_lights=False,
    )
    (scratch / 'weapon-metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    print('Weapon triangles:', {name: entry['triangles'] for name, entry in metrics.items()})


def preview(source, scratch):
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    tools = [obj for obj in scene.objects if obj.type == 'EMPTY']
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = 1480
    scene.render.resolution_y = 540 if len(tools) == 2 else 850
    scene.render.resolution_percentage = 100
    scene.world = bpy.data.worlds.new('Workshop atmosphere')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (.20, .27, .31, 1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value = .28

    def orient(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    lights = (
        ('Broad softbox', (-1.6, -3.0, 5), (1.0, .9, .78), 460, 4.8),
        ('Workshop cool rim', (2.1, 3.0, 2.6), (.62, .82, 1), 350, 3.8),
    )
    for name, position, rgb, energy, width in lights:
        light = bpy.data.lights.new(name, 'AREA')
        light.energy = energy
        light.color = rgb
        light.shape = 'DISK'
        light.size = width
        light_obj = bpy.data.objects.new(name, light)
        light_obj.location = position
        scene.collection.objects.link(light_obj)
        orient(light_obj, (0, 0, .0))
    for tool in tools:
        tool.rotation_euler[0] = -.43 if 'wrench' in tool.name else -.31
        if 'wrench' in tool.name:
            tool.rotation_euler[2] = -.20
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.44))
    floor = bpy.context.object
    backdrop = bpy.data.materials.new('Workshop blue backdrop')
    backdrop.diffuse_color = (.036, .052, .067, 1)
    floor.data.materials.append(backdrop)
    camera = bpy.data.cameras.new('Handheld parts review')
    camera.type = 'ORTHO'
    camera.ortho_scale = 2.40 if len(tools) == 2 else 5.65
    camera_obj = bpy.data.objects.new('Review camera', camera)
    camera_obj.location = (1.43, -3.7, 5.1)
    scene.collection.objects.link(camera_obj)
    orient(camera_obj, (.20, 0, .02))
    scene.camera = camera_obj
    scene.render.filepath = str(scratch / 'weapons-board.png')
    bpy.ops.render.render(write_still=True)


def main(source_dir, scratch, flags):
    source_dir.mkdir(parents=True, exist_ok=True)
    scratch.mkdir(parents=True, exist_ok=True)
    primary = '--primary' in flags
    source = (scratch if primary else source_dir) / 'weapons-dcc.blend'
    if '--export-edited' in flags:
        bpy.ops.wm.open_mainfile(filepath=str(source))
    else:
        editable_scene(source, scratch, primary)
    export_runtime(scratch)
    if '--render' in flags:
        preview(source, scratch)


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:]
    main(Path(args[0]).resolve(), Path(args[1]).resolve(), args[2:])
