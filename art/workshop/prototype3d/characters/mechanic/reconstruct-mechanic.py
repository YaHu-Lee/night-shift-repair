"""Reconstruct the mechanic from its first crew-sheet cell using local TripoSR."""

import argparse
import json
import math
import sys
import time
from pathlib import Path
from types import SimpleNamespace

import numpy as np
import torch
import trimesh
from PIL import Image
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes


def cpu_marching_cubes(field, threshold):
    # TripoSR reverses the torchmcubes coordinate order after calling this function.
    vertices, faces, _, _ = marching_cubes(field.detach().cpu().numpy(), threshold)
    return torch.from_numpy(vertices[:, ::-1].copy()), torch.from_numpy(faces.astype(np.int64))


def reference_image(path):
    with Image.open(path) as source:
        crew = source.convert('RGBA')
        crop = crew.crop((0, 0, crew.width // 3, crew.height // 2))
    alpha = crop.getchannel('A')
    box = alpha.point(lambda opacity: 255 if opacity > 112 else 0).getbbox()
    if box is None:
        raise ValueError('The crew-sheet mechanic cell has no opaque pixels.')
    crop = crop.crop(box)
    span = round(max(crop.size) / 0.83)
    gray = Image.new('RGB', (span, span), (128, 128, 128))
    gray.paste(crop, ((span - crop.width) // 2, (span - crop.height) // 2), crop)
    return gray


def reconstruct(args, image):
    sys.path.insert(0, str(args.triposr))
    sys.modules['torchmcubes'] = SimpleNamespace(marching_cubes=cpu_marching_cubes)
    from tsr.system import TSR

    start = time.perf_counter()
    model = TSR.from_pretrained(str(args.weights), config_name='triposr-config.yaml', weight_name='model.ckpt')
    model.renderer.set_chunk_size(8192)
    model.eval().to(args.device)
    with torch.inference_mode():
        code = model([image], device=args.device)
        mesh, = model.extract_mesh(code, True, resolution=args.resolution)
    mesh.fix_normals()
    print(f'Local TripoSR inference: {time.perf_counter() - start:.1f} s, {len(mesh.faces)} triangles.', flush=True)
    return mesh


def select_part(mesh, name, mask, limit, pivot):
    part = mesh.submesh([mask], append=True, repair=False)
    if len(part.faces) < 25:
        raise ValueError(f'{name} mask yielded insufficient triangles')
    if len(part.faces) > limit:
        smaller = part.simplify_quadric_decimation(face_count=limit)
        _, source_indices = cKDTree(part.vertices).query(smaller.vertices)
        smaller.visual.vertex_colors = part.visual.vertex_colors[source_indices]
        part = smaller
    return {
        'positions': (part.vertices - pivot).round(4).flatten().tolist(),
        'colors': (part.visual.vertex_colors / 255).round(4).flatten().tolist(),
        'indices': part.faces.flatten().tolist(),
    }


def align_mesh(mesh, pitch, yaw):
    source = mesh.vertices.copy()
    # TripoSR poses its subject facing +X with +Z up. Creator's up axis is +Y.
    aligned = source[:, [0, 2, 1]]
    aligned[:, 2] *= -1
    # Undo the high viewpoint baked into the source illustration before setting the foot pivot.
    pitch = math.radians(pitch)
    aligned[:, :2] = aligned[:, :2] @ np.array(((math.cos(pitch), math.sin(pitch)), (-math.sin(pitch), math.cos(pitch))))
    yaw = math.radians(yaw)
    aligned[:, [0, 2]] = aligned[:, [0, 2]] @ np.array(((math.cos(yaw), -math.sin(yaw)), (math.sin(yaw), math.cos(yaw))))
    ground, crown = np.quantile(aligned[:, 1], (0.002, 0.998))
    aligned[:, 1] -= ground
    body = aligned[(aligned[:, 1] > (crown - ground) * 0.38) & (aligned[:, 1] < (crown - ground) * 0.64)]
    aligned[:, [0, 2]] -= np.median(body[:, [0, 2]], axis=0)
    mesh.vertices = aligned * (1.81 / (crown - ground))
    return mesh


def write_rig_geometry(mesh, output):
    centers = mesh.triangles_center
    forward, y, side = centers.T
    head_mask = (y >= 1.18) & (np.abs(side) <= 0.42) & (np.abs(forward) < 0.55)
    torso_mask = (y >= 0.62) & (y <= 1.29) & (np.abs(side) <= 0.32) & (np.abs(forward) < 0.42)
    data = {
        'head': select_part(mesh, 'head', head_mask, 1600, [0, 1.44, 0]),
        'torso': select_part(mesh, 'torso', torso_mask, 1200, [0, 0.68, 0]),
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Rig mesh triangles:', {name: len(part['indices']) // 3 for name, part in data.items()})


def main():
    repo = Path(__file__).resolve().parents[5]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--triposr', type=Path, required=True, help='Path to the TripoSR checkout')
    parser.add_argument('--weights', type=Path, required=True, help='Directory with triposr-config.yaml and model.ckpt')
    parser.add_argument('--raw', type=Path, required=True, help='Path to save or reuse the raw vertex-coloured PLY')
    parser.add_argument('--output', type=Path, default=repo / 'creator-m0/assets/resources/prototype3d/characters/mechanic-ai.json')
    parser.add_argument('--source', type=Path, default=repo / 'art/workshop/source/crew.png')
    parser.add_argument('--resolution', type=int, default=128)
    parser.add_argument('--device', default='cuda:0')
    parser.add_argument('--pitch', type=float, default=30)
    parser.add_argument('--yaw', type=float, default=0)
    args = parser.parse_args()
    if args.raw.is_file():
        mesh = trimesh.load(args.raw, force='mesh')
    else:
        image = reference_image(args.source)
        args.raw.parent.mkdir(parents=True, exist_ok=True)
        image.save(args.raw.with_name('input.png'))
        mesh = reconstruct(args, image)
        mesh.export(args.raw)
    write_rig_geometry(align_mesh(mesh, args.pitch, args.yaw), args.output)


if __name__ == '__main__':
    main()
