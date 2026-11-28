"""Normalize the generated clothing layers, keeping the existing character animation intact."""
from pathlib import Path
from PIL import Image
import json
import runpy

HERE = Path(__file__).resolve().parent
helpers = runpy.run_path(str(HERE.parents[1] / "weapons/clear-rewards/pack.py"))
root = helpers["PIXEL"]
dest = root / "rigs"
dest.mkdir(exist_ok=True)
atlas = Image.new("RGBA", (128, 960))
frames = {}
rigs = ["duty_standard", "heavy_fitter", "high_voltage", "thermal_welder", "scrap_auditor", "surveyor"]
for k, view in enumerate(["front", "back", "side", "ne", "se"]):
    file = "gear-source.png" if k == 0 else f"gear-{view}.png"
    im = Image.open(HERE / file).convert("RGBA")
    for row, rig in enumerate(rigs):
        for col in range(4):
            w, h = im.size
            tile = im.crop((col*w//4,row*h//6,(col+1)*w//4,(row+1)*h//6))
            tile.putalpha(tile.getchannel("A").point(lambda a: 255 if a > 120 else 0))
            tile = tile.crop(tile.getbbox())
            tile.thumbnail((28, 28), Image.Resampling.NEAREST)
            x = col*32 + (32-tile.width)//2
            y = (6*k+row)*32 + (32-tile.height)//2
            atlas.paste(tile, (x,y))
            frames[f"{rig}:{col+1}:{view}"] = [x,y,*tile.size]
atlas.save(dest/"gear.png")
(dest/"frames.json").write_text(json.dumps(frames, indent=2)+"\n", encoding="utf8")
helpers["write_meta"](root/"riveter.meta", dest.with_suffix(".meta"))
helpers["write_meta"](root/"riveter/weapon.png.meta", dest/"gear.png.meta")
helpers["write_meta"](root/"riveter/sprite.json.meta", dest/"frames.json.meta")
