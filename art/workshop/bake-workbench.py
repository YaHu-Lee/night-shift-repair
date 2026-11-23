"""Bake the original shop workbench texture. Requires Pillow 10 or newer."""

import math
from pathlib import Path
from random import Random

from PIL import Image, ImageChops, ImageDraw, ImageFilter


WIDTH, HEIGHT = 360, 640
SEED = 2417
OUTPUT = Path(__file__).resolve().parents[2] / "creator-m0/assets/campaign-content/campaign-ch01/workbench.png"


def workbench():
    rng = Random(SEED)
    coarse_noise = Image.frombytes("L", (21, 35), rng.randbytes(21 * 35))
    softened = coarse_noise.resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(2))
    surface = softened.load()
    grain = rng.randbytes(WIDTH * HEIGHT)
    base = Image.new("L", (WIDTH, HEIGHT))
    pixels = base.load()
    for y in range(HEIGHT):
        for x in range(WIDTH):
            light = math.exp(-(((x - 125) / 209) ** 2 + ((y - 150) / 355) ** 2))
            edge = min(x, y, WIDTH - 1 - x, HEIGHT - 1 - y)
            shade = min(edge / 28, 1)
            rubber_grain = (grain[y * WIDTH + x] - 128) / 39
            unevenness = (surface[x, y] - 128) / 37
            pixels[x, y] = round(20 + 12 * light + 5 * shade + rubber_grain + unevenness)

    scratches = Image.new("L", base.size)
    draw = ImageDraw.Draw(scratches)
    for _ in range(100):
        x = rng.gauss(175, 99)
        y = rng.gauss(337, 129)
        length = rng.uniform(3, 24)
        slope = rng.uniform(-0.5, 0.5)
        draw.line((x, y, x + length, y + length * slope), fill=rng.randint(2, 13))
    surface_markings = scratches.filter(ImageFilter.GaussianBlur(0.62))
    image = ImageChops.add(base, surface_markings)

    # Keep the small, neutral-green value ramp in an opaque indexed PNG.
    image = image.convert("P")
    palette = []
    for value in range(256):
        palette.extend((value, min(255, value + 4), min(255, value + 2)))
    image.putpalette(palette)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT, optimize=True)


if __name__ == "__main__":
    workbench()
