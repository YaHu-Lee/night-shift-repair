# Empty-handed mechanic pixel candidate

Original generated sheets go under `sources/`; `manifest.json` explicitly selects empty-handed rectangles. `candidate/` holds the reproducible atlas and previews for evaluation. The 2D campaign currently uses this candidate for gameplay review. See the manifest for any missing strips and the source heading of each mirror.

```sh
python art/pixel/characters/mechanic/assemble.py art/pixel/characters/mechanic/manifest.json art/pixel/characters/mechanic/candidate
```

Requires Pillow. Append `--require-complete` to reject missing source directions/animated strips. The script hardens alpha at 128, crops nontransparent bounds, downsamples by nearest neighbor, bottom-aligns to the foot pivot, and writes a PNG atlas, frame metadata, a contact sheet and an animated WebP when enough movement exists. Array order is playback order. Every tile is 64 × 64, pivot (32,59); north and south are distinct. W/SW/NW reflect the E/SE/NE image and grip vectors, but preserve anatomical hand IDs and their logical equipment slots.

Manifest grips are crop-relative coordinates with clockwise angle from +x. Output grips are offsets from the foot pivot with per-hand front/back layer relative to the body. `heuristic` means visibly estimated, not engine-verified; invisible grips are only optional fallbacks for occlusion. A null grip means absent. Do not use the foot pivot as a hand mount or infer grips from state names. Weapon sprites remain separate assets.

Each animation strip uses a shared fit scale; auto pivot uses the horizontal center of the bottom 10% of opaque pixels, with an optional crop-relative `pivot` override. Candidate preserves actual generated source colors without a globally enforced palette yet. Reflected hand geometry is **not** anatomically verified; preserve source logical gear IDs during mirror and plan per-heading grip/depth/occlusion overrides where actual testing requires them. The supplied validator checks reflection geometry and abstract equipment-ID swaps, not in-engine equip or visual correctness. Art-level empty hands are reviewed visually; metadata cannot prove a pixel is not part of a weapon.

```sh
python art/pixel/characters/mechanic/validate.py art/pixel/characters/mechanic/candidate
```

Reproduction verified with Python 3.12.14 / Pillow 13.0.0. Animated WebP canvases are 512 × 64 (eight headings in atlas order, native 1× screen pixels); contact sheets display each tile 2× without smoothing. Preserve original transparent generated inputs and use the manifest, not hand edits to packed outputs. The first NE walk generation with a visible pale fill was rejected; its clean regenerated replacement has native alpha. Fixed hit clips are individual recoil poses, not a full animation.

## Creator integration

After regenerating and validating the candidate, copy `candidate/mechanic-atlas.png` and `candidate/frames.json` to `creator-m0/assets/campaign-content/campaign-ch01/pixel/mechanic/`. This keeps the shared character art in an existing campaign subpackage. The workshop skin test checks that the copies match. Build `creator-m0/build-campaign-web.json` and enter a campaign battle to see the result. Creator browser preview uses the 2D campaign by default. The dedicated 3D build remains available for comparison.

The runtime uses the melee cue for the first two standing poses: load and push-off. A primary cast selects the extended pose, followed by recovery. A standalone off-hand cast uses the braced pose and recovery. A moving primary cast in the direction of travel uses the matching phase of the authored run-strike strip. Aiming elsewhere keeps the walking cycle and aims the acting tool separately.

Slot 0 mounts to the anatomical right hand and slot 1 to the left. The [arc wrench and arc gun](../../weapons/README.md) use distinct pixel frames for eight directions and a carried pose. They provide the visual origin for each weapon's first arc. Other tools retain their existing workshop art during this pass. Occluded grips hide their tools. See the [attack revision record](attack-revision.md) for the source prompts and selected strips.
