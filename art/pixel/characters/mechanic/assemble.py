#!/usr/bin/env python3
"""Assemble approved transparent source rectangles; never synthesize missing motion."""
import argparse
import hashlib
import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

SIZE, FOOT, MAX_BODY = 64, (32, 59), 50
DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
MIRROR = {"SW": "SE", "W": "E", "NW": "NE"}
ACTIONS = {"idle": 1, "walk": 4, "attack": 4, "hit": 1}
FPS = {"idle": 1, "walk": 8, "attack": 10, "hit": 8}


def extract(source, definition):
    rect = definition if isinstance(definition, list) else definition["rect"]
    mounts = definition.get("mounts", {}) if isinstance(definition, dict) else {}
    if set(mounts) - {"L", "R"}:
        raise ValueError("mount keys must be anatomical L/R")
    if len(rect) != 4 or any(type(k) is not int for k in rect):
        raise ValueError(f"rectangle must contain four integers: {rect}")
    x, y, w, h = rect
    if min(x, y) < 0 or min(w, h) < 1 or x + w > source.width or y + h > source.height:
        raise ValueError(f"rectangle outside source: {rect}")
    crop = source.crop((x, y, x + w, y + h))
    alpha = crop.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    crop.putalpha(alpha)
    box = alpha.getbbox()
    if not box or alpha.getextrema() == (255, 255):
        raise ValueError(f"expected nonempty transparent actor cutout: {rect}")
    return crop, box, mounts, definition.get("pivot") if isinstance(definition, dict) else None


def frame(extracted, factor):
    source_crop, box, mounts, pivot = extracted
    crop = source_crop.crop(box)
    w, h = source_crop.size
    if pivot is None:
        alpha = crop.getchannel("A")
        # The lowest 10% measures boot support, not a horizontally extended arm.
        y0 = max(0, crop.height - max(1, crop.height // 10))
        support = alpha.crop((0, y0, crop.width, crop.height)).getbbox()
        pivot = [(support[0] + support[2]) / 2 + box[0], box[3]]
    if len(pivot) != 2 or not (0 <= pivot[0] <= w and 0 <= pivot[1] <= h) or pivot[1] != box[3]:
        raise ValueError(f"expected pivot on bottom of cutout: {pivot}")
    raw_width, raw_height = crop.size
    if factor < 1:
        crop = crop.resize(tuple(max(1, round(k * factor)) for k in crop.size), Image.Resampling.NEAREST)
    clean = Image.new("RGBA", crop.size)
    clean.alpha_composite(crop)
    canvas = Image.new("RGBA", (SIZE, SIZE))
    dest_x = FOOT[0] - round((pivot[0] - box[0]) * clean.width / raw_width)
    dest_y = FOOT[1] - clean.height
    if not (0 < dest_x and dest_x + clean.width < SIZE and 0 < dest_y):
        raise ValueError(f"anchored silhouette clips its cell: {pivot}")
    canvas.alpha_composite(clean, (dest_x, dest_y))
    bbox = canvas.getchannel("A").getbbox()
    if bbox is None or bbox[3] != FOOT[1] or not all(0 < v < SIZE for v in bbox):
        raise ValueError(f"misaligned normalized frame: {pivot}")
    result = {}
    for hand in ("L", "R"):
        mount = mounts.get(hand)
        if not mount:
            result[hand] = None
            continue
        px, py, angle = mount["x"], mount["y"], mount["angle"]
        if not (0 <= px <= w and 0 <= py <= h and math.isfinite(angle)):
            raise ValueError(f"invalid source crop grip: {mount}")
        if mount["layer"] not in ("front", "back") or mount["status"] not in ("reviewed", "heuristic"):
            raise ValueError(f"invalid mount layer/status: {mount}")
        point_x = dest_x + (px - box[0]) * clean.width / (box[2] - box[0])
        point_y = dest_y + (py - box[1]) * clean.height / (box[3] - box[1])
        result[hand] = {"dx": round(point_x - FOOT[0], 3), "dy": round(point_y - FOOT[1], 3),
                        "angle": angle, "layer": mount["layer"], "status": mount["status"],
                        "visible": bool(mount.get("visible", True))}
    return canvas, result


def mirror_frame(pose):
    img, grips = pose
    # Screen x reflection about the foot. Anatomical hand IDs/loadout slots stay fixed.
    return img.transpose(Image.Transpose.FLIP_LEFT_RIGHT), {
        hand: None if grip is None else {**grip, "dx": -grip["dx"], "angle": (180 - grip["angle"]) % 360}
        for hand, grip in grips.items()
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("manifest", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--require-complete", action="store_true")
    a = p.parse_args()
    data = json.loads(a.manifest.read_text(encoding="utf-8"))
    images, hashes = {}, {}
    def get_image(filename):
        if filename not in images:
            path = a.manifest.parent / filename
            images[filename] = Image.open(path).convert("RGBA")
            hashes[filename] = hashlib.sha256(path.read_bytes()).hexdigest()
        return images[filename]
    for direction in data["sources"]:
        if direction not in DIRECTIONS or direction in MIRROR:
            raise ValueError(f"unexpected source heading: {direction}")
    if set(data["frames"]) - set(ACTIONS):
        raise ValueError("unexpected action")
    strips, missing = {}, []
    for action, minimum in ACTIONS.items():
        definitions = data["frames"].get(action, {})
        if set(definitions) - (set(DIRECTIONS) - set(MIRROR)):
            raise ValueError(f"undefined or mirrored heading in {action}")
        for direction in DIRECTIONS:
            if direction in MIRROR:
                continue
            cells = definitions.get(direction, [])
            extracted = [
                extract(get_image(cell.get("source", data["sources"].get(direction)) if isinstance(cell, dict)
                                else data["sources"][direction]), cell)
                for cell in cells
            ]
            largest = max((max(box[2] - box[0], box[3] - box[1]) for _, box, _, _ in extracted), default=MAX_BODY)
            factor = min(1, (47 if action == "hit" else MAX_BODY) / largest)
            poses = [frame(item, factor) for item in extracted]
            if len(poses) < minimum:
                missing.append(f"{action}:{direction} ({len(poses)}/{minimum})")
            if action != "idle" and len({img.tobytes() for img, _ in poses}) < len(poses):
                raise ValueError(f"duplicate moving frame in {action}:{direction}")
            strips[action, direction] = poses
        for direction, source in MIRROR.items():
            strips[action, direction] = [mirror_frame(pose) for pose in strips[action, source]]
    if a.require_complete and missing:
        raise ValueError("incomplete: " + ", ".join(missing))
    count = sum(map(len, strips.values()))
    if not count:
        raise ValueError("manifest contains no poses")
    metadata = {"version": 1, "palette": "original source colors; shared palette not yet art-directed", "cell": [SIZE, SIZE], "pivot": list(FOOT), "mountSchema": {"coordinate": "offset pixels from pivot, x right y down", "angle": "clockwise degrees from +x",
                                "hands": "anatomical; no loadout swap on mirror", "layer": "relative to character body",
                                "missing": "null: not authored/verified; do not equip without a deliberate fallback"},
                "directions": DIRECTIONS, "mirrors": MIRROR, "source": hashes, "missing": missing,
                "animations": {}}
    cols = min(12, count)
    rows = math.ceil(count / cols)
    atlas = Image.new("RGBA", (cols * SIZE, rows * SIZE))
    frames = []
    for action in ACTIONS:
        metadata["animations"][action] = by_heading = {}
        for direction in DIRECTIONS:
            imgs = strips[action, direction]
            by_heading[direction] = {"fps": FPS[action], "loop": action not in ("attack", "hit"), "frames": []}
            by_heading[direction]["mounts"] = []
            for img, grips in imgs:
                index = len(frames)
                x, y = index % cols * SIZE, index // cols * SIZE
                atlas.alpha_composite(img, (x, y))
                by_heading[direction]["frames"].append([x, y, SIZE, SIZE])
                by_heading[direction]["mounts"].append(grips)
                frames.append((img, f"{action} {direction} {len(by_heading[direction]['frames'])}"))
    a.output.mkdir(parents=True, exist_ok=True)
    atlas.save(a.output / "mechanic-atlas.png", optimize=True)
    with Image.open(a.output / "mechanic-atlas.png") as written:
        assert written.mode == "RGBA" and written.size == atlas.size
        for i, (img, label) in enumerate(frames):
            x, y = i % cols * SIZE, i // cols * SIZE
            assert written.crop((x, y, x + SIZE, y + SIZE)).tobytes() == img.tobytes(), label
    metadata["frameCount"] = count
    metadata["atlasSize"] = list(atlas.size)
    metadata["atlas"] = "mechanic-atlas.png"
    (a.output / "frames.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    panel = Image.new("RGB", (cols * 132, rows * 148), "#222631")
    labels = ImageDraw.Draw(panel)
    for i, (img, label) in enumerate(frames):
        pos = (i % cols * 132, i // cols * 148)
        scaled = img.resize((128, 128), Image.Resampling.NEAREST)
        panel.paste(scaled, pos, scaled)
        labels.text((pos[0] + 4, pos[1] + 128), label, fill="#ffffff")
    panel.save(a.output / "contact.png", optimize=True)
    # Preview always has a readable fallback. Include separate animations when authored.
    headings = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
    for action in ACTIONS:
        sequence_length = max(len(strips[action, d]) for d in headings)
        if not sequence_length:
            continue
        preview = [Image.new("RGBA", (len(headings) * SIZE, SIZE), "#222631") for _ in range(sequence_length)]
        for tick, panel in enumerate(preview):
            for i, direction in enumerate(headings):
                imgs = strips[action, direction]
                if not imgs:
                    continue
                idx = min(tick, len(imgs) - 1) if action == "attack" else tick % len(imgs)
                panel.alpha_composite(imgs[idx][0], (i * SIZE, 0))
        suffix = "" if action == "idle" else f"-{action}"
        # An attack preview loops with a longer hold on the final pose for inspection.
        timing = [round(1000 / FPS[action])] * len(preview)
        if action == "attack":
            timing[-1] += 450
        preview[0].save(a.output / f"preview{suffix}.webp", save_all=True, append_images=preview[1:],
                        duration=timing, loop=0, lossless=True)
    print(f"{count} frames, {atlas.width}x{atlas.height}, {len(missing)} incomplete strips")


if __name__ == "__main__":
    main()
