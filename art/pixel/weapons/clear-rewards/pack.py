"""Cut the generated maintenance tool sprites into the existing Cocos mount format."""
from pathlib import Path
import hashlib
import json
import shutil
import uuid

from PIL import Image

HERE = Path(__file__).resolve().parent
PIXEL = HERE.parents[3] / "creator-m0/assets/campaign-content/campaign-ch01/pixel"


def write_meta(template, destination):
    data = template.read_text(encoding="utf8")
    old = json.loads(data)["uuid"]
    key = str(destination.relative_to(PIXEL)).replace("\\", "/")
    destination.write_text(data.replace(old, str(uuid.uuid5(uuid.NAMESPACE_URL, "night-shift/pixel/" + key))), encoding="utf8")


def main():
    sheet = Image.open(HERE / "tools-source.png").convert("RGBA")
    w, h = sheet.size
    tiles = [Image.open(HERE / "saw-source.png").convert("RGBA")]
    for row in range(2):
        for col in range(2):
            tiles.append(sheet.crop((col*w//2, row*h//2, (col+1)*w//2, (row+1)*h//2)))
    models = [
        ("rebound-saw", (0.33, 0.31), (0.90, 0.66)),
        ("rivet-line", (0.32, 0.55), (0.96, 0.65)),
        ("echo-horn", (0.27, 0.69), (0.94, 0.42)),
        ("breaker-stake", (0.22, 0.43), (0.96, 0.42)),
        ("patrol-welder", (0.39, 0.56), (0.94, 0.69)),
    ]
    for tile, (name, grip, tip) in zip(tiles, models):
        tile = tile.crop(tile.getchannel("A").point(lambda a: 255 if a >= 128 else 0).getbbox())
        tile.thumbnail((28, 25), Image.Resampling.NEAREST)
        tile.putalpha(tile.getchannel("A").point(lambda a: 255 if a >= 128 else 0))
        frame = Image.new("RGBA", (32, 32))
        x, y = (32 - tile.width)//2, (32 - tile.height)//2
        frame.paste(tile, (x, y))
        dest = PIXEL / name
        dest.mkdir(exist_ok=True)
        frame.save(dest / "weapon.png")
        def anchor(p):
            return [round(x+p[0]*(tile.width-1)), round(y+p[1]*(tile.height-1))]
        model = dict(version=1, sourceSha256=hashlib.sha256((HERE / ("saw-source.png" if name == "rebound-saw" else "tools-source.png")).read_bytes()).hexdigest(), rect=[0,0,32,32], grip=anchor(grip), tip=anchor(tip))
        (dest / "sprite.json").write_text(json.dumps(model, indent=2)+"\n", encoding="utf8")
        candidate = HERE.parent / name / "candidate"
        candidate.mkdir(parents=True, exist_ok=True)
        for filename in ["weapon.png", "sprite.json"]:
            shutil.copyfile(dest / filename, candidate / filename)
        source = "saw-source.png" if name == "rebound-saw" else "tools-source.png"
        (candidate.parent / "manifest.json").write_text(json.dumps({"source": "../clear-rewards/" + source}, indent=2)+"\n", encoding="utf8")
        write_meta(PIXEL / "riveter.meta", dest.with_suffix(".meta"))
        for filename in ["weapon.png.meta", "sprite.json.meta"]:
            write_meta(PIXEL / "riveter" / filename, dest / filename)


if __name__ == "__main__":
    main()
