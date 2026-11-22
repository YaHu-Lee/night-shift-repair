"""Assemble the editable Blender mechanic and export one GLB mesh per game pivot."""

import json
from math import pi
from pathlib import Path
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from mechanic_body import build_body


ASSET_NAME = 'mechanic-dcc'
TILE = 128
COLS = 8
ROWS = 8
UV_MARGIN = 6

# Material colors use sRGB. Metallic/roughness and normal are linear data.
SURFACE_PARAMS = {
    'CANVAS': ((43, 48, 68), .87, 0.0),
    'CANVAS_LIT': ((57, 64, 84), .83, 0.0),
    'DARK_CANVAS': ((30, 34, 50), .91, 0.0),
    'WEBBING': ((50, 47, 44), .93, 0.0),
    'SAFETY': ((240, 179, 64), .58, 0.0),
    'LEATHER': ((104, 76, 56), .75, 0.0),
    'RUBBER': ((35, 45, 49), .94, 0.0),
    'STEEL': ((87, 109, 115), .53, .56),
    'CUT_STEEL': ((151, 174, 175), .37, .60),
    'HELMET': ((209, 148, 55), .52, .08),
    'BLACK': ((24, 34, 38), .88, 0.0),
    'EDGE': ((102, 104, 114), .89, 0.0),
    'HELMET_EDGE': ((164, 105, 40), .56, .12),
    'HELMET_RIB': ((225, 171, 80), .48, .06),
    'SKIN': ((214, 153, 110), .82, 0.0),
    'FACE_TONE': ((214, 153, 110), .82, 0.0),
    'STUBBLE': ((118, 83, 60), .91, 0.0),
    'LIP': ((139, 76, 57), .84, 0.0),
    'GUNMETAL': ((76, 75, 82), .57, .39),
    'LENS': ((83, 63, 38), .27, .24),
    'LENS_GLINT': ((193, 148, 73), .29, .24),
    'LAMP': ((177, 196, 168), .30, .17),
    'EMIT': ((252, 231, 171), .23, 0.0),
    'IVORY': ((225, 212, 187), .62, .06),
    'IVORY_EDGE': ((194, 180, 153), .65, .05),
    'ORANGE': ((222, 88, 34), .66, .07),
    'ORANGE_EDGE': ((174, 77, 43), .66, .11),
    'PETROL': ((49, 171, 156), .56, .03),
    'HAIR': ((43, 32, 27), .59, 0.0),
    'HAIR_HIGHLIGHT': ((62, 46, 37), .52, 0.0),
    'BROW': ((44, 30, 23), .70, 0.0),
    'IRIS': ((131, 79, 43), .34, 0.0),
    'WARM_SKIN': ((176, 106, 74), .71, 0.0),
    'FRECKLE': ((179, 112, 81), .86, 0.0),
    'EYE_WARM': ((177, 127, 89), .71, 0.0),
    'TEETH': ((235, 218, 183), .46, 0.0),
    'MOUTH': ((88, 41, 37), .70, 0.0),
    'VISOR': ((149, 154, 153), .22, .39),
    'VISOR_GLINT': ((208, 214, 209), .28, .26),
    'STRAP': ((111, 88, 62), .88, 0.0),
    'STITCH': ((155, 127, 87), .88, 0.0),
    'KNEE': ((119, 115, 110), .66, .25),
    'BOOT': ((42, 39, 40), .86, 0.0),
    'TARNISH': ((103, 90, 78), .66, .47),
    'WORN_PAINT': ((101, 101, 112), .71, .26),
    'TOOL_BLACK': ((29, 35, 40), .69, .13),
}
SURFACES = {name: index for index, name in enumerate(SURFACE_PARAMS)}
PIVOTS = {
    'Torso': (None, (0, 0, .68)),
    'Head': ('Torso', (0, 0, .76)),
    'ShoulderMinus': ('Torso', (0, .33, .43)),
    'ShoulderPlus': ('Torso', (0, -.33, .43)),
    'ForearmMinus': ('ShoulderMinus', (0, 0, -.247)),
    'ForearmPlus': ('ShoulderPlus', (0, 0, -.247)),
    'ThighMinus': (None, (0, .165, .66)),
    'ThighPlus': (None, (0, -.165, .66)),
    'ShinMinus': ('ThighMinus', (0, 0, -.339)),
    'ShinPlus': ('ThighPlus', (0, 0, -.339)),
}


def packed_image(name, pixels, scratch, color_space):
    height, width, _ = pixels.shape
    image = bpy.data.images.new(name, width, height, alpha=False)
    image.colorspace_settings.name = color_space
    image.pixels.foreach_set(pixels.astype(np.float32).ravel())
    image.filepath_raw = str(scratch / (name + '.png'))
    image.file_format = 'PNG'
    image.save()
    image.pack()
    image.filepath = '//' + name + '.png'
    return image


def make_material(scratch):
    base, normal, orm, emissive = [np.ones((ROWS * TILE, COLS * TILE, 4), dtype=np.float32) for _ in range(4)]
    normal[:, :, :2] = .5
    emissive[:, :, :3] = 0
    u, v = np.meshgrid(np.linspace(0, 1, TILE), np.linspace(0, 1, TILE))
    rng = np.random.default_rng(821)
    edge = np.minimum.reduce([u, v, 1 - u, 1 - v])
    wear_border = np.maximum(0, 1 - np.abs(edge - .055) * 25)
    wear_patches = np.clip(np.sin(50 * u + 27 * v) * np.cos(21 * u - 72 * v) - .56, 0, 1)
    pigment = np.sin(11 * u + 9 * v) * np.cos(13 * v - 5 * u)
    for name, (rgb, roughness, metalness) in SURFACE_PARAMS.items():
        s = SURFACES[name]
        ys = slice(s // COLS * TILE, (s // COLS + 1) * TILE)
        xs = slice(s % COLS * TILE, (s % COLS + 1) * TILE)
        grain = rng.normal(0, 1, (TILE, TILE))
        variation = .035 * pigment + .014 * grain
        height = .0008 * grain
        rough = roughness + .024 * pigment
        if name in ('SKIN','FACE_TONE','EYE_WARM','LIP','FRECKLE'):
            variation = .008 * pigment
            height = np.zeros_like(pigment)
        if 'CANVAS' in name or name in ('WEBBING', 'EDGE', 'STRAP', 'STITCH'):
            weave = np.sin(34 * 2 * pi * u) * np.sin(38 * 2 * pi * v)
            variation += .034 * weave
            height += .0007 * weave
        if name in ('LEATHER','BOOT','STRAP'):
            creases = np.sin(35*u + 4*v + np.sin(v * 5)) * np.sin(31*v)
            variation += .041 * creases
            height += .0008 * creases
        if name.startswith(('HELMET', 'IVORY', 'ORANGE')):
            exposed = wear_border * wear_patches
            variation += .31 * exposed
            rough += .16 * exposed
        if name in ('IVORY', 'IVORY_EDGE', 'ORANGE', 'ORANGE_EDGE', 'GUNMETAL', 'KNEE', 'BOOT', 'LEATHER', 'CUT_STEEL'):
            scuffs = np.zeros_like(u)
            for _ in range(23):
                x, y = rng.uniform(.08, .92, 2)
                length = rng.uniform(.009, .032)
                du, dv = u - x, v - y
                dash = (du / length) ** 2 + ((dv - .36 * du) / .004) ** 2
                scuffs += np.maximum(0, 1 - dash) * rng.uniform(.21, .63)
            variation += scuffs * (.31 if name in ('IVORY', 'IVORY_EDGE', 'BOOT', 'LEATHER') else .59)
            rough += scuffs * .20
        if name in ('WORN_PAINT','TARNISH','GUNMETAL','PETROL'):
            pitting = np.clip(np.sin(79*u+53*v) * np.cos(99*v-17*u) - .57, 0, 1)
            rubbed = np.exp(-((edge-.072)/.052)**2) * (pitting+.3*wear_patches)
            variation += rubbed * (.11 if name == 'PETROL' else .65)
            rough -= rubbed * .12
            height -= pitting * .0009
        if name in ('STEEL', 'CUT_STEEL', 'GUNMETAL'):
            variation += .034 * np.sin(55 * 2 * pi * v)
        if name == 'LENS':
            variation += .55 * np.exp(-((v - .72 - .1 * u) / .15) ** 2)
        if name == 'STUBBLE':
            variation += .045 * grain
        if name == 'EMIT':
            emissive[ys, xs, :3] = (0.85, .57, .22)
        base[ys, xs, :3] = np.clip(np.array(rgb) / 255 * (1 + variation[:, :, None]), 0, 1)
        if name == 'FACE_TONE':
            blush = np.exp(-((v-.33)/.083)**2) * (
                np.exp(-((u-.258)/.11)**2) + np.exp(-((u-.742)/.11)**2))
            base[ys,xs,:3] += blush[:,:,None] * np.array([.055,-.036,-.025])
        dy, dx = np.gradient(height)
        normal[ys, xs, 0] = .5 - 5.7 * dx
        normal[ys, xs, 1] = .5 - 5.7 * dy
        orm[ys, xs, 0] = np.clip(.96 + .027 * pigment, 0, 1)
        orm[ys, xs, 1] = np.clip(rough, 0, 1)
        orm[ys, xs, 2] = metalness

    material = bpy.data.materials.new('Mechanic | canvas, enamel, goggles and fittings')
    material.use_nodes = True
    material.diffuse_color = (.07, .16, .18, 1)
    material.use_backface_culling = True
    nodes = material.node_tree.nodes
    link = material.node_tree.links.new
    shader = nodes.get('Principled BSDF')
    shader.location = (480, 300)
    shader.inputs['Emission Strength'].default_value = .65
    images = {}
    for index, (name, pixels, space) in enumerate((
        ('Mechanic Base Color', base, 'sRGB'),
        ('Mechanic Normal', normal, 'Non-Color'),
        ('Mechanic ORM', orm, 'Non-Color'),
        ('Mechanic Emissive', emissive, 'sRGB'),
    )):
        node = nodes.new('ShaderNodeTexImage')
        node.location = (-560, 460 - 325 * index)
        node.image = packed_image(name, pixels, scratch, space)
        images[name] = node
    nt = nodes.new('ShaderNodeNormalMap')
    nt.location = (124, 184)
    nt.inputs['Strength'].default_value = 0.8
    split = nodes.new('ShaderNodeSeparateColor')
    split.location = (-160, -69)
    # This is the glTF exporter's documented packed ambient-occlusion input.
    gltf_options = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    gltf_options.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    extension = nodes.new('ShaderNodeGroup')
    extension.node_tree = gltf_options
    extension.location = (134, -251)
    link(images['Mechanic Base Color'].outputs['Color'], shader.inputs['Base Color'])
    link(images['Mechanic Emissive'].outputs['Color'], shader.inputs['Emission Color'])
    link(images['Mechanic Normal'].outputs['Color'], nt.inputs['Color'])
    link(nt.outputs['Normal'], shader.inputs['Normal'])
    link(images['Mechanic ORM'].outputs['Color'], split.inputs['Color'])
    link(split.outputs['Red'], extension.inputs['Occlusion'])
    link(split.outputs['Green'], shader.inputs['Roughness'])
    link(split.outputs['Blue'], shader.inputs['Metallic'])
    return material


def atlas_uv(obj, material):
    mesh = obj.data
    # Imported leg pieces provide explicit UVs where directional detail matters.
    redraw = not obj.get('keep_uv')
    if redraw:
        face_mesh = bmesh.new()
        face_mesh.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(face_mesh, faces=list(face_mesh.faces))
        face_mesh.to_mesh(mesh)
        face_mesh.free()
        mesh.update()
    vertices = mesh.vertices
    bounds = [(min(v.co[axis] for v in vertices), max(v.co[axis] for v in vertices)) for axis in range(3)]
    layer = mesh.uv_layers.active or mesh.uv_layers.new(name='Atlas')
    material_indices = obj.get('surfaces')
    for polygon in mesh.polygons:
        tile = material_indices[polygon.material_index] if material_indices else obj['surface']
        projection_axis = max(range(3), key=lambda axis: abs(polygon.normal[axis]))
        axes = [axis for axis in range(3) if axis != projection_axis]
        for loop_index in polygon.loop_indices:
            if redraw:
                position = vertices[mesh.loops[loop_index].vertex_index].co
                u, v = [(position[k] - bounds[k][0]) / max(.0001, bounds[k][1] - bounds[k][0]) for k in axes]
            else:
                u, v = layer.data[loop_index].uv
            pad = UV_MARGIN / TILE
            layer.data[loop_index].uv = ((tile % COLS + pad + min(1, max(0, u)) * (1 - 2 * pad)) / COLS,
                                         (tile // COLS + pad + min(1, max(0, v)) * (1 - 2 * pad)) / ROWS)
        polygon.material_index = 0
    mesh.materials.clear()
    mesh.materials.append(material)


def scene_group(name):
    group = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(group)
    return group


def rig_parts(collection):
    pivots = {}
    for name, (parent, offset) in PIVOTS.items():
        joint = bpy.data.objects.new(name, None)
        joint.empty_display_size = .045
        collection.objects.link(joint)
        if parent:
            joint.parent = pivots[parent]
        joint.location = offset
        pivots[name] = joint
    return pivots


def merge_parts(design, pivots):
    counts = {}
    material = bpy.data.materials.get('Mechanic | canvas, enamel, goggles and fittings')
    for name, pivot in pivots.items():
        objects = [obj for obj in pivot.children if obj.type == 'MESH']
        coords, faces, face_uvs, smoothing = [], [], [], []
        for obj in objects:
            index = len(coords)
            coords.extend(obj.matrix_local @ vertex.co for vertex in obj.data.vertices)
            uvs = obj.data.uv_layers.active.data
            for face in obj.data.polygons:
                faces.append(tuple(index + vertex for vertex in face.vertices))
                face_uvs.append([uvs[loop].uv.copy() for loop in face.loop_indices])
                smoothing.append(face.use_smooth)
        if not coords:
            continue
        combined = bpy.data.meshes.new(name + ' Mesh')
        combined.from_pydata(coords, [], faces)
        combined.materials.append(material)
        channel = combined.uv_layers.new(name='Atlas')
        for face, loops_uv, smooth in zip(combined.polygons, face_uvs, smoothing):
            face.use_smooth = smooth
            for loop, uv in zip(face.loop_indices, loops_uv):
                channel.data[loop].uv = uv
        # The glTF exporter cannot compute tangents on the lofts' polygon caps.
        game_faces = bmesh.new()
        game_faces.from_mesh(combined)
        bmesh.ops.triangulate(game_faces, faces=list(game_faces.faces), ngon_method='EAR_CLIP')
        game_faces.to_mesh(combined)
        game_faces.free()
        combined.update()
        combined.calc_loop_triangles()
        counts[name] = len(combined.loop_triangles)
        visual = bpy.data.objects.new(name + ' Mesh', combined)
        design.objects.link(visual)
        visual.parent = pivot
        for obj in objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    return counts


def setup_stage(collection, scratch):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 760, 760
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    world = bpy.data.worlds.new('Workshop studio')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (.26, .34, .42, 1)
    world.node_tree.nodes['Background'].inputs[1].default_value = .34
    scene.world = world

    def stage_object(name, data, location):
        obj = bpy.data.objects.new(name, data)
        collection.objects.link(obj)
        obj.location = location
        return obj

    def point_at(obj, target):
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()

    for name, location, color, power, size in (
        ('Key softbox', (3.4, -3.8, 5.0), (1.0, .87, .67), 345, 3.15),
        ('Cool detail fill', (2.8, 2.6, 3.0), (.66, .81, 1.0), 260, 2.1),
        ('Pack rim', (-2.4, -1.7, 4.1), (.77, .91, 1.0), 440, 2.95),
    ):
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size, data.color = power, size, color
        point_at(stage_object(name, data, location), (0, 0, 1))
    floor = bpy.data.meshes.new('Display floor')
    floor.from_pydata([(-20, -20, -.015), (20, -20, -.015), (20, 20, -.015), (-20, 20, -.015)], [], [(0, 1, 2, 3)])
    floor_material = bpy.data.materials.new('Display floor | blue gray')
    floor_material.diffuse_color = (.036, .051, .064, 1)
    floor.materials.append(floor_material)
    stage_object('Display floor', floor, (0, 0, 0))
    camera_data = bpy.data.cameras.new('Hero orthographic')
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 2.24
    camera = stage_object('Hero orthographic', camera_data, (3.2, -2.6, 2.7))
    point_at(camera, (0, 0, .89))
    scene.camera = camera
    scene.render.filepath = str(scratch / 'mechanic-front.png')
    return camera, point_at


def shots(scratch, camera, point_at):
    scene = bpy.context.scene
    for name, position, look, scale in (
        ('front', (4.05, -1.85, 2.48), (-.04, .06, .90), 2.21),
        ('back', (-3.65, -2.45, 2.63), (-.10, .10, .89), 2.22),
        ('game', (2.91, -2.45, 5.8), (-.10, .08, .92), 2.31),
        ('detail', (3.8, 1.76, 2.24), (0, 0, 1.34), 1.26),
    ):
        camera.location = position
        point_at(camera, look)
        camera.data.ortho_scale = scale
        scene.render.filepath = str(scratch / f'mechanic-{name}.png')
        bpy.ops.render.render(write_still=True)


def export_game(design, pivots, scratch):
    triangles = merge_parts(design, pivots)
    bpy.ops.object.select_all(action='DESELECT')
    for obj in design.objects:
        obj.select_set(True)
    options = dict(
        filepath=str(scratch / (ASSET_NAME + '.glb')), export_format='GLB',
        export_yup=True, export_tangents=True, export_animations=False,
        export_cameras=False, export_lights=False, use_selection=True,
    )
    bpy.ops.export_scene.gltf(**options)
    metrics = {'parts': triangles, 'triangles': sum(triangles.values()),
               'atlases': 4, 'atlas_width': COLS * TILE, 'atlas_height': ROWS * TILE}
    (scratch / 'model-metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    print('Mechanic GLB:', metrics)


def main(source, scratch, flags):
    scratch.mkdir(parents=True, exist_ok=True)
    if '--export-edited' in flags:
        bpy.ops.wm.open_mainfile(filepath=str(source / (ASSET_NAME + '.blend')))
        design = bpy.data.collections['Mechanic | editable assembly']
        export_game(design, {name: design.objects[name] for name in PIVOTS}, scratch)
        return

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    design = scene_group('Mechanic | editable assembly')
    stage = scene_group('Preview | excluded from export')
    material = make_material(scratch)
    pivots = rig_parts(design)

    def attach(name, objects):
        for obj in objects:
            atlas_uv(obj, material)
            design.objects.link(obj)
            obj.parent = pivots[name]

    build_body(attach, SURFACES)
    if '--body-only' not in flags:
        from mechanic_limbs import build_limbs
        build_limbs(attach, SURFACES)
    camera, point_at = setup_stage(stage, scratch)
    bpy.context.view_layer.update()
    for area in bpy.context.screen.areas:
        if area.type == 'VIEW_3D':
            view = area.spaces.active.region_3d
            view.view_rotation = camera.rotation_euler.to_quaternion()
            view.view_distance = 2.72
            view.view_location = (0, 0, .88)
            view.view_perspective = 'ORTHO'
            area.spaces.active.overlay.show_floor = False
    source.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / (ASSET_NAME + '.blend')))
    export_game(design, pivots, scratch)
    if '--render' in flags:
        shots(scratch, camera, point_at)


if __name__ == '__main__':
    cli = sys.argv[sys.argv.index('--') + 1:]
    main(Path(cli[0]).resolve(), Path(cli[1]).resolve(), cli[2:])
