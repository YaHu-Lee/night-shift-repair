# 《夜班修理局》像素肉鸽美术、动画与特效深度审计及大重构方案

> 本文结合中英文像素美术与动作肉鸽社区一手权威教程（Pedro Medeiros / Saint11、Jan Willem Nijman / Vlambeer《The Art of Screenshake》、Celeste / Enter the Gungeon / Nuclear Throne / Pixeli 视觉规范、机核与像素熊 VFX 课程），对《夜班修理局》全部运行时像素图集与渲染管线（`BattleSkinView.ts`、`SkillEffectsView.ts`、`CampaignCombatView.ts`、`FloatingWeaponArt.ts`）进行了量化实测与逐帧审查，并给出立即可落地的引擎级大重构与原画修订单。

---

## 一、社区像素肉鸽美术、动画与特效 6 条黄金铁律

1. **像素密度统一与杜绝非整数 Mixels**
   - 同屏精灵应遵循一致的像素网格密度，**严禁对像素图使用 `0.8×`、`1.3×` 等非整数最近邻缩放**，否则必然产生行/列吞像素与移动时的“像素蠕动闪烁（pixel shimmering）”。若武器必须自由旋转，应通过高一点的源密度或像素化特效掩盖锯齿，而非混用不同粗细的像素块。
   - 来源：[Pixeli: Readability and Scale](https://pixeli.pebbly.space/knowledge/rules/14-readability-and-scale)、[r/SoloDevelopment: Grid-aligned pixel art consensus](https://www.reddit.com/r/SoloDevelopment/comments/1p1bpbh/whats_the_general_consensus_on_pixel_art_that_is/)、[Glimmerfall Art & Animation Pipeline](https://github.com/ArtemChikolaev/Glimmerfall/blob/main/docs/research/notes/art_animation_pipeline.md)。

2. **明度分层（Value Hierarchy）决定一切可读性，而非色相**
   - 混乱弹幕战中，地面必须压暗降噪（明度 `15–35`，采用统一暗底），敌机居于中上明度带（`35–65`），主角占据最宽明度带（`55–90`），致命敌弹独占最高对比色道。**任意单位与脚下背景的明度差低于 10 点，高速运动下即会丢失轮廓。**
   - 来源：[Value Does the Work That Color Gets Credit For](https://blog.makko.ai/value-structure-in-game-art/)、[Celeste Art Direction & Visual Language](https://teemo.dev/game-design/celeste/systems/art-direction-and-visual-language/)。

3. **少帧高表现像素动画：第一帧出击、涂抹帧、受击白闪与挤压拉伸**
   - 玩家攻击需零/极短前摇（第一帧立刻覆盖判定，用不透明 2 色阶涂抹弧表现速度）；敌人攻击必须有 150–400 ms 可辨前摇（Anticipation）。
   - 受击必须包含 **1–2 帧纯高对比白闪 + 15%–25% 挤压拉伸（Squash & Stretch）+ 2–3 px 方向抖动击退**；待机需要微呼吸律动打破贴纸感。
   - 来源：[Pixeli: Attacks and Impacts](https://pixeli.pebbly.space/knowledge/rules/44-attacks-and-impacts)、[Saint11 像素宝典（indienova）](https://indienova.com/indie-game-development/saint11-pixel-art-tutorial-1/)、[Saint11 挤压与拉伸（indienova）](https://indienova.com/indie-game-development/saint11-making-pixel-art-3/)。

4. **纯像素 VFX 严禁混入平滑矢量渐变与圆角线条**
   - 像素游戏里画平滑半透明大三角火焰、平滑抗锯齿圆环和 `LineCap.ROUND` 粗弧线，会瞬间破坏整个像素画面的质感统一。特效必须采用**离散整数像素网格方块（2×2 px）+ 无羽化 2–3 色阶（白核 → 亮主体 → 暗碎烟）**，呈现“白核炸起 → 形状张开 → 拆成碎像素消散”的快节奏。
   - 来源：[像素熊：游戏特效基础 VFX](https://pixelsbook.com/course/28/)、[Saint11 闪电与火焰教程](https://indienova.com/indie-game-development/saint11-pixel-art-tutorial-2/)、[Thirsty Bird Retro VFX](https://bgsulz.com/2023/10/07/bird-post.html)。

5. **打击感三件套：克制式顿帧（Hitstop）+ 分级微震屏 + 战场永久痕迹（Permanence）**
   - **顿帧绝不给普通小怪普攻用**（否则怪海变成 PPT 卡顿），只用于精英/Boss 击杀（80–120 ms）与重暴击/玩家重伤（30–50 ms，带冷却防叠加）；
   - **震屏严格分级、不叠加、像素对齐衰减**；
   - **战场残留（Permanence）**：击杀后在地板层留下低对比度焦痕、机油渍、碎铁与枪械抛出的黄铜弹壳，让战斗历史肉眼可见，极大增强爽感。
   - 来源：[Vlambeer: The Art of Screenshake](https://www.youtube.com/watch?v=AJdEqssNZ-U)、[机核：震动与顿帧设计](https://www.gcores.com/articles/126493)。

6. **杜绝“不可读的爽感（Unreadable Juice）”：敌弹永远独占最高视觉层**
   - 借鉴 *Enter the Gungeon*：敌方致命弹幕必须使用高对比**深黑描边 + 猩红/洋红外环 + 脉冲纯白核心**，尺寸宁大勿小（≥ 9×9 px），永远压在全部己方特效之上；己方多武器齐射时动态压缩非致命特效透明度，严禁己方特效与敌弹撞色。
   - 来源：[Hayao Design Codex: Unreadable Juice](https://hayao.dev/docs/codex/antipattern-unreadable-juice)、[Enter the Gungeon Projectiles](https://enterthegungeon.wiki.gg/wiki/Projectiles)。

---

## 二、《夜班修理局》现状逐像素量化审计

脚本直接解码全部运行时 PNG 图集与 `frames.json` / `sprite.json`，测得以下硬核事实：

### 实测资产密度、色板与明度对照表

| 资产类别 | 源尺寸 | 运行时缩放 | 实测唯一色数 | 明度均值（0–100） | 明度区间 [P10, P90] | 审计判定 |
| --- | --- | --- | ---: | ---: | --- | --- |
| 战场地板（20 张） | `330×325` | `2.00×` (660×650) | **28** | `13.1 – 18.1` | `[11.0, 19.3]` | **优秀**：色板克制、明度安静统一 |
| 道具图标图集 | `128×576` | 图标自适应 | **34** | `35.7` | `[10.5, 71.1]` | **优秀**：硬边清晰、色数干净 |
| 敌机与 Boss 图集 1–3 | `80×80` / 格 | `1.00×` | **39 – 54** | `25.6 – 27.7` | `[9.0, 54.1]` | **中偏暗**：部分暗色敌机距地板仅差 7–9 点明度 |
| 敌机图集 4（后期暗机） | `80×80` / 格 | `1.00×` | **25** | **`23.7`** | `[9.8, 44.5]` | **偏暗警告**：埋伏机/暗甲机明度贴近地板，混战中辨识吃力 |
| 10 把悬浮武器 | `32×32` | `1.00×` + 连续旋转 | 索引像素 | — | — | **良好**：但静止时无微浮、开火无像素弹壳落地 |
| **主角 `mechanic-atlas.png`** | `64×64` / 格 | **`0.80×` (51.2px!)** | **`18,960` 色!** | `35.1` | `[9.6, 78.1]` | **双项硬伤**：① 未量化色板（混色抗锯齿）② 非整数 `0.8×` 缩放引发像素跳行！ |

### 逐项查出的 7 大核心缺陷

1. **主角图集未做索引色板量化（18,960 色 vs 其余全作 25–54 色）+ 运行时非整数 `0.8×` 缩放**：`BattleSkinView.ts:63` 硬写 `pixelMechanicScale = 0.8`，导致 64×64 精灵被非整数裁成 51.2×51.2，破坏像素锐度。
2. **全部 15 种敌机与 Boss 缺少 `hit` 受击表现与物理弹性**：`enemies/frames.json` 全员无 `hit` 帧，`BattleSkinView.ts:885` 受击仅叠暗淡粉红 `Color(255, 157, 140)`，无高亮白闪、无受击挤压拉伸（Squash & Stretch）、无沿攻击方向微位移抖动，打在怪身上像砍海绵。
3. **主角待机 1 帧死僵 + 6 把悬浮武器静止如贴纸**：`idle` 仅 1 帧无呼吸律动；武器不攻击时完全锁死在固定点，缺乏“磁浮工具架”的悬浮生命力。
4. **`SkillEffectsView.ts` 与 `PatrolCampaignUi.ts` 混用大量平滑矢量图形，与像素风严重割裂**：
   - 喷火管用 6 顶点平滑半透明橙色大三角；
   - 电弧枪用平滑斜线 + 8px 半透明柔边；
   - 近战挥扫用 `LineCap.ROUND` 平滑圆角弧带；
   - 脉冲/线圈/干扰机紫圈使用平滑抗锯齿 `g.circle()` / 曲线弧。
5. **零震屏、零顿帧、零战场残留（Permanence）**：全游戏没有任何微震屏与重击/击杀顿帧；敌机死后 6 帧蒸发、枪械开火无落地空弹壳，打完 1,000 只怪的地板像刚拖过一样干净。
6. **敌弹与己方特效撞色、敌弹偏小**：`CampaignCombatView.ts:62` 普通敌弹为 `7×7` 暖橙色、Boss 弹为淡紫色，恰好与己方喷火管（橙）和感应线圈（紫）撞色！6 把武器全开火时玩家难以一眼辨识致命弹幕。
7. **3 档像素密度混搭**：地板为 `2.0×` 粗像素，敌机与武器为 `1.0×` 细像素，主角为 `0.8×` 非整数像素。

---

## 三、分两层执行的大重构方案

### A 层：引擎、动画、纯像素 VFX 与打击感大重构（本轮直接代码落地 + 真机验收）

1. **全新纯像素 VFX 引擎（`assets/scripts/cocos/PixelVfxEngine.ts` + 重写 `SkillEffectsView.ts` 像素模式）**
   - 全部粒子、轨迹、弧光、火焰、闪电、冲击波强制对齐 **2×2 像素网格**（`snap2(v)`），彻底禁用平滑圆角粗线、平滑 `g.circle()` 和大块半透明矢量多边形：
     - **像素火焰（喷火管）**：用 3 色阶离散像素火团（白核 → 亮黄 → 焦橙 + 顶部脱落碎火星 + 暗烟块）取代平滑三角形；
     - **像素闪电（电弧枪/电弧羁绊）**：用 2px 阶梯折线（首帧纯白爆闪 → 青/紫锯齿枝杈 → 碎像素消散）；
     - **像素近战刃弧（扳手/旁路扳手）**：无羽化 2 色阶像素块扫痕 + 接触点 4 向星芒白闪 + 飞轮亮齿；
     - **像素环形波（感应线圈/脉冲喷管/牵引线圈/干扰机紫圈）**：全员改用离散 2×2 像素块排布的锯齿像素环；
     - **像素钉枪/探针弹道**：2px 阶梯直线弹道 + 亮白核心弹头 + 枪口白核闪光。
2. **打击感系统（`PixelJuiceState` in `PixelVfxEngine.ts`）**
   - **分级像素对齐微震屏**（不叠加、高优先覆盖低优先）：重暴击/大回扫 `1.5px / 70ms`、玩家受击 `3.5px / 140ms`、精英/Boss 击杀与核心破防 `5px / 220ms`；
   - **克制式短顿帧（Hitstop）**：精英/Boss 击杀 `3 帧 (100ms)`、高伤暴击/玩家重伤 `1 帧 (33ms)` 并带 `0.45s` 全局冷却，绝不让怪潮清屏产生卡顿感；
   - **战场永久痕迹层（Permanence，位于地板之上、角色与敌弹之下，环形上限 96 件）**：
     - 敌机被击毁后在地面残留低对比暗色**机油斑、焦黑烧痕与散落像素铁片**；
     - 铆钉枪/液压钉枪/电弧枪开火抛出**旋转像素黄铜弹壳/熔断保险管**，弹跳落地后留在地板上；
   - **限量像素火花粒子池（上限 90 颗）**：暴击星爆、金属火星、燃烧余烬、解体碎渣、回血绿十字微粒。
3. **动画质感升级（`BattleSkinView.ts`）**
   - **受击高亮白闪 + 挤压拉伸（Squash & Stretch）+ 方向微抖**：受击前 2 帧对精灵施加 `scaleX = 1.24, scaleY = 0.78` 压扁回弹、沿攻击向量偏移 `2–3 px` 并在中心打 1 帧纯白交叉像素闪核（`hitFlash`），让每一击都清脆有力；
   - **主角待机呼吸 + 6 悬浮武器错相磁浮**：主角待机加柔和呼吸位移，6 把悬浮武器加独立相位 `±1.5px` 像素对齐上下微浮，彻底摆脱“贴纸感”；
   - **角色与敌机渲染坐标整数对齐**：消除亚像素模糊与边缘闪烁；暗色敌机补清晰暗黑底影 + 预警脉冲轮廓。
4. **敌弹与危险信号独占最高可读层（`CampaignCombatView.ts`）**
   - 敌弹统一升级为 **`9×9` 深黑描边 + 猩红（普通）/ 亮洋红（Boss）外环 + 脉冲纯白核心**（4 帧心跳闪烁），尺寸扩大 30%、色道与己方武器完全隔离；
   - 6 武器高频齐射时自动将己方非致命拖尾透明度压降至 `0.58–0.72`（视觉降噪预算），确保玩家永远第一眼看清所有敌弹和 Boss 红道。

### B 层：原画与图集离线资产修订单（后续美术批次处理，保留 GPT 规范）

1. **主角图集重定量化与定尺**：将 `art/pixel/characters/mechanic/` 原稿通过确定性最近邻脚本重采样至 `48×48`（或 `52×52`），运行时改用 **`1.0×` 整数缩放**彻底消灭 `0.8×` Mixels，并量化至统一 **32 色工坊色板**（消除当前 `18,960` 色抗锯齿残色）。
2. **暗部敌机提亮与补纯白 `hit` 帧**：将 `enemies-4`（`ambusher`、`jammer`、`crawler` 等）主受光面明度提升 `+8~12` 点（拉离地板 15–18 明度带），并在图集打包管线中自动为全部 15 种敌机/Boss 生成纯白剪影 `hit` 闪帧。
3. **补 2 帧主角呼吸 `idle` 与 4 帧敌机行走**：升级主角 `idle` 为 4 帧呼吸循环，给高频杂兵 `crawler`/`charger` 从 2 帧步态扩充到 4 帧。
