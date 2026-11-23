#!/usr/bin/env python3
"""Cut, normalize and pack an authored tool turnaround."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageColor

CELL = 32
MIRRORS = {"W": "E", "SW": "SE", "NW": "NE"}


def pack_view(source, scale, palette, source_box, grip, tip):
    cutout = source.crop(source_box)
    alpha = cutout.getchannel("A").point(lambda value: 255 if value >= 225 else 0)
    cutout.putalpha(alpha)
    bounds = alpha.getbbox()
    if not bounds or alpha.getextrema() != (0, 255):
        raise ValueError(f"Expected one transparent cutout in {source_box}")
    cutout = cutout.crop(bounds)
    width, height = (round(size * scale) for size in cutout.size)
    if not (0 < width < CELL and 0 < height < CELL):
        raise ValueError(f"Tool size {width}x{height} exceeds cell bounds")
    small = cutout.resize((width, height), Image.Resampling.NEAREST)
    clean = Image.new("RGBA", (CELL, CELL))
    x, y = (CELL - width) // 2, (CELL - height) // 2
    for row in range(height):
        for col in range(width):
            r, g, b, a = small.getpixel((col, row))
            if a:
                color = min(palette, key=lambda c: (r - c[0])**2 + (g - c[1])**2 + (b - c[2])**2)
                clean.putpixel((x + col, y + row), (*color, 255))
    origin_x, origin_y = source_box[0] + bounds[0], source_box[1] + bounds[1]

    def local(point):
        return [
            round(x + (point[0] - origin_x) * width / cutout.width),
            round(y + (point[1] - origin_y) * height / cutout.height),
        ]

    return clean, local(grip), local(tip)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("manifest", type=Path)
    p.add_argument("output", type=Path)
    p.add_argument("--side-only", action="store_true", help="Export a single rotatable side view")
    args = p.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    source_path = args.manifest.parent / manifest["source"]
    source = Image.open(source_path).convert("RGBA")
    palette = tuple(map(ImageColor.getrgb, manifest["palette"]))
    args.output.mkdir(parents=True, exist_ok=True)
    source_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if args.side_only:
        raster, grip, tip = pack_view(source, manifest["scale"], palette, **manifest["views"]["E"])
        if manifest.get("flipSide"):
            raster = raster.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
            grip, tip = [CELL - grip[0], grip[1]], [CELL - tip[0], tip[1]]
        raster.save(args.output / "weapon.png", optimize=True)
        metadata = {"version": 1, "sourceSha256": source_hash,
                    "rect": [0, 0, CELL, CELL], "grip": grip, "tip": tip}
        (args.output / "sprite.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        return
    views = {key: pack_view(source, manifest["scale"], palette, **view) for key, view in manifest["views"].items()}
    for key, original in MIRRORS.items():
        raster, grip, tip = views[original]
        views[key] = (raster.transpose(Image.Transpose.FLIP_LEFT_RIGHT),
                      [CELL - grip[0], grip[1]], [CELL - tip[0], tip[1]])
    atlas = Image.new("RGBA", (3 * CELL, 3 * CELL))
    frames = {}
    for index, key in enumerate(("N", "NE", "E", "SE", "S", "SW", "W", "NW", "carry")):
        raster, grip, tip = views[key]
        assert set(raster.getchannel("A").tobytes()) == {0, 255}
        assert all(0 <= value < CELL for value in (*grip, *tip))
        x, y = index % 3 * CELL, index // 3 * CELL
        atlas.alpha_composite(raster, (x, y))
        frames[key] = {"rect": [x, y, CELL, CELL], "grip": grip, "tip": tip}
    atlas.save(args.output / manifest["atlas"], optimize=True)
    metadata = {"version": 1, "sourceSha256": source_hash,
                "frames": frames}
    (args.output / "frames.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
