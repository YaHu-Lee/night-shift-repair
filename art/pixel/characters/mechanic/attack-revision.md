# 维修工攻击动作修订记录

2026-11-23 至 24 使用 Codex 内置 GPT ImageGen 编辑参考图并生成空手动作条。原始方向图和获选的透明 PNG 均存于 [sources/](sources/)。模型版本未由工具返回。

- 原地攻击分别参考原版 `attack-e.png`、`attack-se.png`、`attack-n.png`、`attack-ne.png`、`attack-s.png`。蓄力、蹬地、伸展、回稳各取一张，保留动作前后的高度变化。新底图不包含武器。
- 行进攻击的 E／SE／N／NE 逐向参考原版 walk 动作，保留原有四拍接触和经过姿。第一版南向跑攻的两张伸腿姿由同一只脚领步，重出步行和跑攻两条南向稿。修订稿分别参考原版南向步行或新版南向攻击，以及新版北向跑攻的脚步节奏。
- [帧选择与手部标注](manifest.json) 使用原图切格、同一动作条统一尺寸、脚底对齐和透明度清理。三组西向按现有方向映射水平镜像，保留每只手的装备槽。握点按可见手估定。图集、逐帧表和循环预览位于 [candidate/](candidate/)。
- 来源记录适用范围见[原素材的来源说明](provenance.md)。

## 实际提示词

各张图的完整提示为共用段接上相应方向段。

### 原地攻击

```text
Create a single game-ready animation source strip for the same chibi night mechanic in the attached image. Actual transparent background, a wide single row with exactly FOUR isolated evenly spaced full silhouettes, read left to right, completely inside the canvas; no boxes, text, guide lines or floor. Reference is the previous four poses for identity, camera and colours only; replace the motion with a grounded full-body general-purpose forward exertion, empty hands throughout. Match existing roughly 50-pixel-high sprite art, crisp stair-stepped intentional square clusters, ivory ridged hard hat, amber brim, lamp on FRONT of hat, rusty orange coverall, reflective boot-cuff stripes, graphite work boots, small blue reel at back waist. Keep the helmet, head-to-body ratio and perspective consistent across the strip; no extra gear, sleeves remain long, no VFX. Show these four visibly different KEY POSES even at game scale: (1) anticipated load with knees clearly flexed, hips lowered, weight on back boot and right empty fist drawn back; (2) push-off, rear heel lifted and visible forward foot travels toward target, waist twists and right elbow comes forward; (3) moment of forward extension, front knee visibly bent with planted front boot, rear leg extended and heel distinctly up, hips and shoulder committed, anatomically RIGHT fist extended toward target, passive LEFT fist stays near hip; (4) recover, hips rise, elbows return, back foot settles and knees ease out of the deep stance. Place the four poses at a common ground plane; visual difference in squat height must come from joints, never scaling the character. The right fist's path should be clear throughout. Only the four character cels.
```

**attack-weight-e.png**

```text
This is a game sprite source, heavy silhouette difference below the waist is critical.
Camera E: strict right-facing profile (screen RIGHT is forward), slightly elevated, same side camera as the reference. Near arm is the character's anatomical RIGHT arm and is the arm that makes the strike. Near right boot should drive the wide step, and both boots and their stagger should each read in silhouette. Strong left-to-right motion, no camera turn.
```

**attack-weight-se.png**

```text
This is a game sprite source, heavy silhouette difference below the waist is critical.
Camera SE: facing down-right/southeast, front three-quarter, both eyes visible, same fixed slightly above camera as the reference. Anatomical RIGHT is on screen-left/near side, chart a reach diagonally toward the LOWER RIGHT from the near shoulder. Stagger the boots in both x and y for the diagonal and keep the left fist near the body.
```

**attack-weight-n.png**

```text
This is a game sprite source, heavy silhouette difference below the waist is critical.
Camera N: perfectly rear view facing upward/away from viewer, NO face or headlamp visible, as in reference. Anatomical RIGHT is screen RIGHT. Foreshorten the forward reach toward the upper edge, right elbow and fist should silhouette next to the right rim of the helmet. Stagger the boots vertically: advancing boot is visibly higher in frame, stance wider, rear boot nearer viewer and shows toe support and lifted heel. Show visible bent-knee squat then a tall recovery. Body still facing straight back.
```

**attack-weight-ne.png**

```text
This is a game sprite source, heavy silhouette difference below the waist is critical. Camera NE is back three-quarter, facing diagonally UP-RIGHT, blue reel and back straps more visible than the chest. Side of helmet has a small glimpse of amber rim, absolutely no eyes looking toward the viewer. Right fist extends up-right and stance both x and y staggered for NE. Pose 3 must have a distinctly bent forward knee and lifted rear heel.
```

**attack-weight-s.png**

```text
This is a game sprite source, heavy silhouette difference below the waist is critical. Camera S is straight front, the headlamp centered and eyes straight toward the viewer, slight overhead looking at top planes, body faces bottom of screen. On pose 3 the anatomical right fist (on screen left) foreshortens toward the bottom of screen, while the right front leg is visibly bent and planted closer to viewer, rear knee and boot go back/up in screen. No lateral side punch, no camera spin.
```

### 行进攻击

```text
Generate an independent new animation source strip for a 2D top-down game mechanic, using the attached RUN cycle as the direct reference for identity, direction and LEGS ONLY. Keep its exact four repeating foot-contact phases left to right, which will be switched with the original walking cycle at runtime. Redraw the entire sprite in each cell organically: legs continue the reference walking gait, while the anatomically right empty hand is held forward in a short loping strike pose, right elbow extends toward the target in the movement direction with torso turned a little into the action. Its other empty hand held closer to belt. Runtime picks one of these four by actual step phase during a short attack, so keep the upper body in the same generic extended strike pose across all four, but preserve the alternating boot stride, contact and pass-through in the reference. Never hold both feet static. Keep the same frank chunky pixel aesthetic, figure height, ivory helmet with amber rim, rust-orange workwear, reflective boot bands, graphite boots, small blue reel at back waist, flat hard-edged pixels, no objects/weapons/tool/FX/shadow or words. Four full intact figures evenly spaced in one single wide row, seamless genuine transparency in the four margins and around each boot.
```

**run-strike-e.png**

```text
Camera strictly right-facing E profile at the same slightly elevated angle as reference: right arm attacks toward screen right, left stays near belt.
```

**run-strike-se.png**

```text
Camera down-right SE front-three-quarter like reference, right arm is the near arm; empty fist reaches lower right. Both feet trace the reference phases.
```

**run-strike-n.png**

```text
Camera N, true rear-facing from slightly above: no face and NO front headlamp visible. Right fist seen at the right edge of the head reaching up/away. Both feet match the reference phases.
```

**run-strike-ne.png**

```text
Camera NE toward top right, from behind in back three-quarter just like reference; belt reel on rear. Right fist reaches upper right. No face toward viewer. Alternating legs and reference phases are essential.
```

### 修订南向步行和行进攻击

```text
Four isolated sprites of the SAME original night mechanic, facing straight SOUTH towards the viewer in a slightly elevated top-down game camera. First image is the style and identity reference for the front-facing mechanic: centered headlamp, ivory helmet and amber band, orange coveralls, graphite boots, reflective stripes. Second image is the rhythm reference, not the camera, for a 4-beat alternating stride. Make the left/right difference very obvious. Each frame must have BOTH boots. Pixel-art game sprite production, one horizontal row with exactly four full figures and genuine transparent margins, exact camera angle and height, no objects, no text, no effects. DRAW a four-phase cycle with this exact sequence: 1. screen RIGHT boot points down and is visibly extended 7 native pixels farther down than the other boot, with the screen LEFT leg bent back. 2. legs pass near center, screen right boot begins to move back. 3. screen LEFT boot points down and is visibly extended 7 native pixels farther down than the other boot, with the screen RIGHT leg bent back. This is the opposite leg extending from frame 1. 4. legs pass near center, screen left boot begins to move back. When looking at the two extended poses in the sheet their silhouettes swap the leg in front. Preserve hard-edged color clusters.
```

**run-strike-s.png**

```text
Across all four frames maintain a brief committed forward reach with the anatomical right empty fist on the SCREEN LEFT reaching toward the viewer. The near fist remains open/neutral with no object; passive hand stays at hip. The legs alternate fully through the exact four phases even while the upper body fires.
```

**walk-s-revised.png**

```text
The hands are empty at both sides of the body in a natural light counter-swing of a short purposeful jog. Keep the belt and body width similar to the reference.
```
