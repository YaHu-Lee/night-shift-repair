#!/usr/bin/env python3
"""Pack authored combat sprites and normalize arena textures for Creator."""
import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageColor, ImageOps

CELL = 80
ATLAS_ROWS = 2048 // CELL
DIRECTIONS = ("E", "NE", "N", "NW", "W", "SW", "S", "SE")
MIRRORS = {"W": "E", "SW": "SE", "NW": "NE"}


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def cut_cel(source, cel):
    image = source.crop(cel["crop"])
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 215 else 0)
    image.putalpha(alpha)
    bounds = alpha.getbbox()
    if not bounds:
        raise ValueError(f"Empty cel {cel['crop']}")
    return image.crop(bounds), (cel["anchor"][0] - bounds[0], cel["anchor"][1] - bounds[1])


def normalize_cel(sprite, palette, scale, cell=CELL):
    image, (cx, cy) = sprite
    w, h = (round(edge * scale) for edge in image.size)
    x, y = cell // 2 - round(cx * scale), cell // 2 - round(cy * scale)
    if not (1 <= x and x + w <= cell - 1 and 1 <= y and y + h <= cell - 1):
        raise ValueError(f"Cel runs outside its padding: {x}, {y}, {w}, {h}")
    image = image.resize((w, h), Image.Resampling.NEAREST)
    clean = Image.new("RGBA", (cell, cell))
    for row in range(h):
        for col in range(w):
            r, g, b, alpha = image.getpixel((col, row))
            if alpha:
                c = min(palette, key=lambda c: (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2)
                clean.putpixel((x + col, y + row), (*c, 255))
    return clean


def trim_specks(cel):
    remaining = {(x, y) for y in range(cel.height) for x in range(cel.width) if cel.getpixel((x, y))[3]}
    while remaining:
        component = [remaining.pop()]
        for x, y in component:
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    neighbor = (x + dx, y + dy)
                    if neighbor in remaining:
                        remaining.remove(neighbor)
                        component.append(neighbor)
        if len(component) < 5:
            for pixel in component:
                cel.putpixel(pixel, (0, 0, 0, 0))


def pack_actor_page(root, assets, out, texture):
    rows = sum(len(spec["poses"]) for _, spec in assets)
    atlas = Image.new("RGBA", (len(DIRECTIONS) * CELL, rows * CELL))
    frames = {}
    sources = {}
    row = 0
    for name, spec in assets:
        cuts = {}
        for pose, views in spec["poses"].items():
            if set(views) != set(DIRECTIONS) - set(MIRRORS):
                raise ValueError(f"{name}/{pose} needs five distinct original views")
            cuts[pose] = {}
            for direction, cel in views.items():
                path = cel["source"]
                if path not in sources:
                    sources[path] = Image.open(root / path).convert("RGBA")
                cuts[pose][direction] = cut_cel(sources[path], cel)
        scale = spec["longest"] / max(max(image.size) for image, _ in cuts["idle"].values())
        palette = tuple(map(ImageColor.getrgb, spec["palette"]))
        for pose, views in cuts.items():
            cels = {direction: normalize_cel(cut, palette, scale * spec["poses"][pose][direction].get("scale", 1))
                    for direction, cut in views.items()}
            for direction, cel in cels.items():
                if spec["poses"][pose][direction].get("trimSpecks"):
                    trim_specks(cel)
            for index, direction in enumerate(DIRECTIONS):
                cel = cels[MIRRORS[direction]].transpose(Image.Transpose.FLIP_LEFT_RIGHT) if direction in MIRRORS else cels[direction]
                x, y = index * CELL, row * CELL
                atlas.alpha_composite(cel, (x, y))
                frames[f"{name}:{pose}:{direction.lower()}"] = [x, y, CELL, CELL]
            row += 1
    atlas.save(out / (texture + ".png"), optimize=True)
    return frames, sources.keys()


def pack_enemies(root, assets, out):
    ordered = sorted(assets.items(), key=lambda item: not item[1].get("runtime"))
    pages = []
    rows = 0
    for name, spec in ordered:
        count = len(spec["poses"])
        if count > ATLAS_ROWS:
            raise ValueError(f"{name} exceeds one atlas page")
        if not pages or rows + count > ATLAS_ROWS:
            pages.append([])
            rows = 0
        pages[-1].append((name, spec))
        rows += count
    index, sources = [], []
    for number, page in enumerate(pages, 1):
        texture = "actors" if number == 1 else f"actors-{number}"
        frames, used = pack_actor_page(root, page, out, texture)
        index.append({"texture": texture, "frames": frames})
        sources.extend(used)
    write_json(out / "frames.json", {"pages": index})
    return sources


def pack_items(root, spec, out):
    cell = 32
    sources = {}
    cels = spec["items"]
    columns = spec["columns"]
    atlas = Image.new("RGBA", (columns * cell, ((len(cels) + columns - 1) // columns) * cell))
    frames = {}
    for index, (name, cel) in enumerate(cels.items()):
        source = cel.get("source", spec["source"])
        if source not in sources:
            sources[source] = Image.open(root / source).convert("RGBA")
        cut = cut_cel(sources[source], cel)
        palette = tuple(map(ImageColor.getrgb, cel.get("palette", spec["palette"])))
        sprite = normalize_cel(cut, palette, spec["longest"] / max(cut[0].size), cell)
        x, y = (index % columns) * cell, (index // columns) * cell
        atlas.alpha_composite(sprite, (x, y))
        frames[name] = [x, y, cell, cell]
    atlas.save(out / "workshop.png", optimize=True)
    write_json(out / "frames.json", frames)
    return sources.keys()


def normalize_arena(path, spec, out):
    original = Image.open(path).convert("RGB")
    image = original.resize(tuple(spec["dimensions"]), Image.Resampling.NEAREST)
    # Keep the plate behind hostile projectiles and warning overlays in every light region.
    image = Image.merge("RGB", [channel.point(lambda v, contrast=k, base=b:
        min(255, round(base + contrast * v))) for channel, k, b in
        zip(image.split(), spec["contrast"], spec["base"])])
    colors = spec["colors"]
    image.quantize(colors=colors, dither=Image.Dither.NONE).save(out, optimize=True)


def normalize_menu(path, spec):
    original = Image.open(path).convert("RGB")
    if "crop" in spec:
        original = original.crop(spec["crop"])
    target = tuple(spec["dimensions"])
    fitted = ImageOps.fit(original, target, method=Image.Resampling.NEAREST)
    return fitted.quantize(colors=spec["colors"], dither=Image.Dither.NONE)


def pack_dispatch(out, picture, stations):
    out.mkdir(parents=True, exist_ok=True)
    width, height = 164, 82
    if picture.width < width or picture.height < height:
        raise ValueError("Map is too small for its dispatch crops")
    atlas = Image.new("P", (width * 3, height * ((len(stations) + 2) // 3)))
    atlas.putpalette(picture.getpalette())
    frames = {}
    for index, (key, (ax, ay)) in enumerate(stations.items()):
        left = min(picture.width - width, max(0, round(ax * picture.width - width / 2)))
        top = min(picture.height - height, max(0, round(ay * picture.height - height / 2)))
        x, y = index % 3 * width, index // 3 * height
        atlas.paste(picture.crop((left, top, left + width, top + height)), (x, y))
        frames[key] = [x, y, width, height]
    atlas.save(out / "scenes.png", optimize=True)
    write_json(out / "frames.json", frames)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--runtime", action="store_true", help="Exclude enemy direction candidates")
    args = parser.parse_args()
    spec = json.loads(args.manifest.read_text(encoding="utf-8"))
    root = args.manifest.parent
    enemies = args.output / "enemies"
    arenas = args.output / "arenas"
    items = args.output / "items"
    ui = args.output / "ui"
    for folder in (enemies, arenas, items, ui):
        folder.mkdir(parents=True, exist_ok=True)
    actors = {name: actor for name, actor in spec["enemies"].items() if actor.get("runtime") or not args.runtime}
    sources = list(pack_enemies(root, actors, enemies)) if actors else []
    for key, arena in spec["arenas"].items():
        normalize_arena(root / arena["source"], arena, arenas / (key + ".png"))
        sources.append(arena["source"])
    if "items" in spec:
        sources.extend(pack_items(root, spec["items"], items))
    for key, config in spec.get("ui", {}).items():
        picture = normalize_menu(root / config["source"], config)
        if "slices" in config:
            for name, region in config["slices"].items():
                picture.crop(region).save(ui / (name + ".png"), optimize=True)
        else:
            picture.save(ui / (key + ".png"), optimize=True)
        if "stations" in config:
            pack_dispatch(args.output / "dispatch" / key, picture, config["stations"])
        sources.append(config["source"])
    write_json(args.output / "source-hashes.json",
               {path: hashlib.sha256((root / path).read_bytes()).hexdigest() for path in sources})


if __name__ == "__main__":
    main()
