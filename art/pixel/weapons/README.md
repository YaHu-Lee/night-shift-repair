# 悬浮武器像素贴图

2026-11-23 至 24 用 Codex 内置 GPT ImageGen 出图。电弧扳手源图参考 [starter-wrench-concept](../experiments/2026-11-23/starter-wrench-concept.png)，电弧枪源图参考工坊装备图集左上角。工具未返回可验证的模型版本。原始图保留在每件武器的 `sources/`，文件摘要在打包后的帧表中。

每把武器接入一张朝右的 32 × 32 透明像素图。运行时连续旋转贴图，并同步旋转握点和枪口／接触端。接触端跟着实际战斗轨迹移动。枪口闪光、挥击轨迹和命中特效由游戏分别播放。素材采用二值透明和最近邻取样。原始多角度稿、旧电弧扳手与电弧枪的八方向图集保留在美术目录。

另外八件武器的参考图、提示词和处理记录见 [悬浮武器出图记录](floating-sources.md)。

```powershell
foreach ($tool in (Get-ChildItem art/pixel/weapons -Directory)) {
    python art/pixel/weapons/assemble.py "$($tool.FullName)/manifest.json" "$($tool.FullName)/candidate" --side-only
}
```

把 `candidate/weapon.png` 和 `candidate/sprite.json` 同步到 Creator 第一章分包的 `pixel/<tool>/`。测试核对像素尺寸、源图摘要、锚点和过滤方式。

## 实际提示词

### 电弧扳手

```text
Use the attached concept as design reference for an ORIGINAL night maintenance arc wrench. Create a production PIXEL ART turnaround sheet on transparent background, one 3 columns by 2 rows regular grid of isolated variants, same consistent scale and palette. Six items total (no text, panels, grid lines, shadow, effects or glow): TOP ROW left-to-right: E head points RIGHT with a long shaft in profile, SE head points down-right in slightly foreshortened front 3/4, S head points DOWN and is visibly foreshortened retaining the readable jaw. BOTTOM ROW left-to-right: NE head points up-right with the dark reverse side and visible top plane, N head points straight UP with foreshortened back view, one independent relaxed carried pose with wrench head pointing DOWN and rubber handle extending up. The same tool with clear steel open-end crescent wrench jaws, deep slate dark outline, cool steel light plane, dark graphite rubber ring-end handle and one small amber insulated collar joins handle to shaft. Reference glow removed entirely. Simple flat deliberate chunky square pixel clusters, 7-11 opaque colors, single-pixel-equivalent outline, native longest visible dimension approximately 18-23 px per item before preview enlargement. All six tools distinct, equal mass, same shape projected in different directions, 2D top-down game graphics. Design must read as a wrench at its actual very small size. No character or hands.
```

### 电弧枪

```text
Use the TOP LEFT sprite only in the attached reference sheet, the arc gun with two metal contact prongs, teal electric coil and compact graphite pistol grip. Create 6 isolated low-resolution pixel art angle cels on genuine transparent background. Same physical pistol in all, deliberately designed to read at 19-23px longest at 1x. A 3-column 2-row regular grid. TOP ROW left-to-right: E pointing RIGHT, a strict side profile with two stubby prongs and grip bottom left; SE pointing down-right and modestly foreshortened at a slight overhead angle; S pointing down, short visible body due to foreshortening, a teal upper coil square and two gray prongs at bottom. BOTTOM ROW left-to-right: NE pointing up-right rear three-quarter with back of housing visible on lower left; N pointing up, short forearm-length gun seen from the back/top with prong tips top and grip lower edge; relaxed carry with the prongs low-left and grip upper-right. No hands, grid lines, text, shadows, pale edge halos, lighting effects or electrical sparks. Use only dark slate outline, three steel shades, deep teal, restrained bright teal, small warm bronze accent. Intentional coarse square pixels, one-pixel outlines. Each sprite centered in its own cell with visibly clear margins and crisp alpha. Do not use any designs from the other five cells in the reference.
```
