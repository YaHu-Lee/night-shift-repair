# 机械朋克战斗动作与特效

## 八向战斗图集

本次为维修工、九类基础敌机和六类战役首领制作独立八向投影。绘制时保留原先的工地色调、黄安全帽、回收爪、盾和炮口等识别特征。每方向有待机、两张迈步、蓄力、攻击、回收和受击七种姿态。敌机使用本项目编写的多面体模型和关节。维修工保留右手工具和正面头灯。文件大小、源脚本、许可和哈希见[图集清单](../../combat-motion.json)。

敌机帧由 `art/workshop/bake-enemies.cjs` 装配。维修工帧由 `scripts/generate-mechanic-poses.py` 装配。先生成维修工，再运行装配工具。装配工具从最终 PNG 取出 896 格逐一查透明区、边距、方向和动作的像素重复。纹理保持统一锚点，运行时按实际位移、攻击瞄准和伤害时刻选帧。

Chrome 在 360 × 640 和 393 × 852 重放开局。主角实点向八向移动，爬虫从对应方向实际接近。扳手出击与爬虫受击发生在同一个战斗步，炮台实际产生弹丸时换到开火帧，护甲机撞掉主角体力时进入碰撞和受击帧。03 分站主管在第 65 步进入蓄力帧，第 96 步进入攻击帧，第 141 步弱点开放时切换收势帧。[浏览器帧截图](../../../../docs/review/campaign-combat-motion.webp)

补充核对首领和护盾。护盾吸收后主角仍为 10 格体力，没有播放扣血姿态。分站主管闭合时朝南，与从北侧命中全伤一致。液压钉枪的出手姿势和穿刺范围同时朝南。05 守门机在第 140 步开始收招，第 148 步回到待机，期间保持原来的弱点状态。01 巡检机实际叫出援兵时播放出手帧，5 步后收招。

## 原版动作条与特效

2026-11-20 使用内置 ImageGen 生成，工具未提供底层模型版本。五条敌机动作以项目原图 `../crew.png` 为参考，特效单独生成。每个标题对应同名 PNG。裁切位置与打包流程保存在 `../../bake.cjs`。本批用于本地 M2 试玩，真机视觉验收待完成。

## crawler

Use the provided game asset sheet as the canonical identity reference. Produce ONE clean TRANSPARENT sprite animation strip, exactly FOUR equal cells in ONE horizontal row, the SAME single machine centered in every cell on a common ground baseline at a constant camera distance. Same chunky inked and painted mobile repair-yard game style, industrial forms and scratched armor, bold silhouettes. No captions, text, borders, people, scenery, cast shadows or disconnected background. Generous empty gutters and no clipping. Only the red single-lens spider crawler (top middle). FOUR frames of ONE forward gait viewed from the same front three-quarter looking slightly right. Frame 1 left front leg reaches far forward, frame 2 legs passing beneath, frame 3 opposite legs reach, frame 4 opposite passing. Show convincing alternating articulated leg silhouettes and weight transfer.

## charger

Use the provided game asset sheet as the canonical identity reference. Produce ONE clean TRANSPARENT sprite animation strip, exactly FOUR equal cells in ONE horizontal row, the SAME single machine centered in every cell on a common ground baseline at a constant camera distance. Same chunky inked and painted mobile repair-yard game style, industrial forms and scratched armor, bold silhouettes. No captions, text, borders, people, scenery, cast shadows or disconnected background. Generous empty gutters and no clipping. Only the orange ramming car (upper right), same rightward wedge nose. Four poses: rolling with wheels turning; braking crouch with loaded suspension before a rush; thrust forward with suspension extended, twin small pale orange exhaust jets behind the rear LEFT of the car; recovery with heavy nose dipping. Same chassis width and wheelbase. Do not move the sprite across its cell.

## turret

Use the provided game asset sheet as the canonical identity reference. Produce ONE clean TRANSPARENT sprite animation strip, exactly FOUR equal cells in ONE horizontal row, the SAME single machine centered in every cell on a common ground baseline at a constant camera distance. Same chunky inked and painted mobile repair-yard game style, industrial forms and scratched armor, bold silhouettes. No captions, text, borders, people, scenery, cast shadows or disconnected background. Generous empty gutters and no clipping. Only the ochre warning-light gun turret (lower left). It faces screen RIGHT, feet planted. Four poses: idle closed breech; chambering with vent plates opening and amber lamp lit; armed with bright warning lamp and a white hot small muzzle ring; just fired with barrel visibly recoiled to the LEFT, open breech, small escaping steam. Four noticeably different mechanical barrel lengths and light states. No projectiles.

## armored

Use the provided game asset sheet as the canonical identity reference. Produce ONE clean TRANSPARENT sprite animation strip, exactly FOUR equal cells in ONE horizontal row, the SAME single machine centered in every cell on a common ground baseline at a constant camera distance. Same chunky inked and painted mobile repair-yard game style, industrial forms and scratched armor, bold silhouettes. No captions, text, borders, people, scenery, cast shadows or disconnected background. Generous empty gutters and no clipping. Only the olive armored treaded machine with right-facing silver plow shield (bottom middle). Four frames of driving cycle with tracks crawling, suspension weight shifting, plow vibrating on its hinges, exhaust alternating short puffs at rear LEFT. Keep main chassis registered, identical front shield orientation. The track cleats visibly advance across foot contact.

## inspector

Use the provided game asset sheet as the canonical identity reference. Produce ONE clean TRANSPARENT sprite animation strip, exactly FOUR equal cells in ONE horizontal row, the SAME single machine centered in every cell on a common ground baseline at a constant camera distance. Same chunky inked and painted mobile repair-yard game style, industrial forms and scratched armor, bold silhouettes. No captions, text, borders, people, scenery, cast shadows or disconnected background. Generous empty gutters and no clipping. Only the purple heavy twin-searchlight biped boss (lower right), same frontal three-quarter view. Four deliberately different key poses: left leg planted and right foot lifted in patrol stride; opposite foot advances; attack wind-up both legs braced wide and upper housing opening to expose two very bright magenta coils; post-attack venting crouch with open exhaust, both lights dimmed. Preserve identity and a stable body center with readable silhouettes for a 57 px sprite.

## fx

A single production FX sprite library for a hand-inked industrial arcade game. Transparent canvas, mathematically regular three columns by two rows, six isolated icons/sprites with equal wide empty gutters. No lettering, panels, characters, checkerboard or objects from a menu. Top left: horizontal forked electrical discharge from LEFT to RIGHT, brilliant white hot core, cyan outer strands with sharp angular steps, both ends on central horizontal axis. Top middle: horizontal single brass rivet travelling RIGHT, pointed white-gold head at right and thin tapered hot amber speed streak extending left. Top right: blowtorch plume, a narrow blue ignition point at LEFT opening into a wide RIGHT-facing wedge of orange and amber flame tongues. Bottom left: magnetic pickup pulse viewed flat from directly overhead, a hollow turquoise segmented circular magnetic field with inward-pointing teeth; transparent empty center. Bottom middle: induction shock wave viewed flat, circular purple concentric arcs and radial bright spikes, hollow center. Bottom right: a CLEAR status emblem for a marked enemy: bold lightning bolt in the center of a small black enamel diamond with cyan/white border, like an energized electrical warning sign, readable at 12 px. Mark is compact, other effects have clean transparent centers or thin tips. Match game sprites with saturated luminous inked VFX, very restrained local glow. No solid background.
