#!/usr/bin/env python3
"""Check atlas integrity, reflected anatomical mounts, and two abstract loadouts."""
import argparse
import json
from pathlib import Path
from PIL import Image

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("candidate", type=Path)
a = p.parse_args()
m = json.loads((a.candidate / "frames.json").read_text())
assert m["directions"] == ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
assert m["mirrors"] == {"SW": "SE", "W": "E", "NW": "NE"}
assert m["cell"] == [64, 64] and m["pivot"] == [32, 59]
atlas = Image.open(a.candidate / m["atlas"])
assert atlas.mode == "RGBA" and list(atlas.size) == m["atlasSize"]
used = set()


def tile(frame):
    x, y, w, h = frame
    assert w == h == 64 and x >= 0 and y >= 0 and x % 64 == y % 64 == 0
    assert x + w <= atlas.width and y + h <= atlas.height
    return atlas.crop((x, y, x + w, y + h))


def attach_ids(grips, loadout):
    return {hand: {"id": loadout[hand], "transform": grips[hand]} for hand in ("L", "R")}


for action, headings in m["animations"].items():
    assert list(headings) == m["directions"]
    for d, row in headings.items():
        assert len(row["frames"]) == len(row["mounts"])
        content = []
        for box, grips in zip(row["frames"], row["mounts"]):
            assert tuple(box) not in used
            used.add(tuple(box))
            img = tile(box)
            alpha = img.getchannel("A")
            assert set(alpha.tobytes()) == {0, 255}
            assert alpha.getbbox()[3] == m["pivot"][1]
            content.append(img.tobytes())
            assert list(grips) == ["L", "R"]
            for g in grips.values():
                if g is not None:
                    assert g["status"] in ("reviewed", "heuristic") and g["layer"] in ("back", "front")
                    assert abs(g["dx"]) <= 32 and -59 <= g["dy"] <= 5
        if action != "idle":
            assert len(content) == len(set(content)), (action, d)

    for d, source in m["mirrors"].items():
        left, right = headings[d], headings[source]
        assert len(left["frames"]) == len(right["frames"])
        for lbox, rbox, lg, rg in zip(left["frames"], right["frames"], left["mounts"], right["mounts"]):
            assert tile(lbox).tobytes() == tile(rbox).transpose(Image.Transpose.FLIP_LEFT_RIGHT).tobytes()
            for hand in ("L", "R"):
                if rg[hand] is None:
                    assert lg[hand] is None
                else:
                    base, mirror = rg[hand], lg[hand]
                    assert mirror == {**base, "dx": -base["dx"], "angle": (180 - base["angle"]) % 360}
            for loadout in ({"L": "tool-a", "R": "tool-b"}, {"L": "tool-b", "R": "tool-a"}):
                original = attach_ids(rg, loadout)
                reflected = attach_ids(lg, loadout)
                assert [original[k]["id"] for k in ("L", "R")] == [reflected[k]["id"] for k in ("L", "R")]
assert len(used) == m["frameCount"]
print(f'Checked {len(used)} frames, RGBA tiles and mirror mounts; {len(m["missing"])} strips incomplete')
