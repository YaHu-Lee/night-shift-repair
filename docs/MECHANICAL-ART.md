# 夜班修理局 · M2 机械朋克美术清单

设计基准为 360 × 640 竖屏。战斗对象使用中心锚点，碰撞半径、实体位置、朝向、伤害和预警时长均由现有战斗域决定。所有像素尺寸、资源路径、颜色和动效由 Creator 表现层管理。

| 分类 | 本轮需求 | 使用位置 |
| --- | --- | --- |
| 维修工 | 夜班工装、头灯、手持工具；待机、移动、受击反馈 | 战场中心角色 |
| 机器 | 慢爬虫、冲车、炮台、正面装甲机、巡检机 Boss 五种轮廓 | 战斗、朝向与预警 |
| 工具 | 电弧扳手、铆钉枪、喷火管、感应线圈四枚独立图标 | 整备工具卡 |
| 模组 | 导电、磁吸、过热各三枚，通用三枚 | 十二种整备模组卡 |
| 场景、掉落 | 夜间维修场地、零件、敌方弹体 | 战场底图与动态对象 |
| UI | 卡片、选中态、按钮、禁用态、HUD 的生命与零件识别 | 开场、战斗、整备、暂停、结算 |
| 动画与特效 | 行进、受击、机体冲锋、电弧、穿刺、喷火、线圈脉冲、回收脉冲、Boss 扫线与召援 | 实体状态与已有战斗事件 |

选材优先考虑真机小尺寸下的轮廓识别度、可核实的来源及商业使用许可。程序化预警必须保留可读性。

## 已采用的资源

| 来源 | 已落地内容 | 来源与制作记录 |
| --- | --- | --- |
| 本项目生成 | 主角待机、正面／背面／侧面各四帧走路，四种普通敌机、巡检机，四把工具的卡图，夜间维修场 | 内置 ImageGen 生成五张原图。原图、选用的第三方文件和生成用描述在 [源素材目录](../art/workshop/source/) 与 [提示词](../art/workshop/prompts.md)。 |
| 局间商店配件插画 | 12 件实体配件，货架使用 50 设计像素的零件样图，装配槽复用同一张缩略图 | 内置 ImageGen 生成同一张 4×3 零件图版，构建时使用象牙色图底。源文件为 [shop-parts.png](../art/workshop/source/shop-parts.png)，图集沿用模组 ID。 |
| Lucide 0.468.0 | 拾取零件六角螺帽和生命图标 | ISC 及 Feather 派生图标 MIT 声明随资源一起打包。[许可](https://lucide.dev/license) |
| Kenney UI Pack Sci-Fi 2.0 | 带铆钉金属按钮，九宫格缩放，普通、选中、禁用三态着色 | 取灰色小顶栏面板，共用在路线、商店、暂停与结算。CC0。[原包](https://kenney.nl/assets/ui-pack-sci-fi) |
| Kenney Particle Pack | 敌方弹体 | 使用光点精灵。CC0。[原包](https://kenney.nl/assets/particle-pack) |
| 本项目生成的战斗动作和标记 | 五种敌机各四个姿态和一个导电标记 | 动作条以原机体为参考共用裁框和缩放。六张透明原图和逐条提示词见[战斗源文件](../art/workshop/source/combat/)。 |

## 战斗动作与特效

| 资源键 | 画面与触发条件 |
| --- | --- |
| `crawler0…3`、`armored0…3` | 爬虫交替迈腿，装甲机履带和排烟循环，车头跟随护甲方向。 |
| `charger0…3`、`turret0…3` | 冲车行驶、压低、喷射、回稳。炮台待机、亮灯、伸管、回缩。炮口和冲车的预警方向读取战斗锁定向量。 |
| `inspector0…3` | 巡检机两帧巡逻、蓄能和泄压。扫线、冲撞范围和召援圈沿用战斗状态绘制。 |
| 电弧、铆钉、喷火 | 电弧沿实际跳点连线。铆钉以长 185、宽 22 的矩形沿首目标方向穿刺，按与施放者的距离命中前三个合格目标。喷火半径 82，扇形半角为 atan(0.7)，约 35°。 |
| 磁吸、感应 | 磁吸第五次拾取时触发，半径 79。感应线圈触发半径为 71。施放当步显示整个圆盘，磁吸内纹向内、感应内纹向外。 |
| `conductiveMark` | 被标记敌机头顶出现带闪电的菱形徽记，随战斗时钟轻微脉动。 |

动作时间取自战斗 tick，敌机使用 23 至 57 个设计像素，头顶标记为 11 至 13 个设计像素。维修工横移采用侧面帧与左右镜像，上下移动分别用背面和正面帧。原[敌机动作样片](../art/workshop/combat-preview.webp)保留了上一版技能贴图。

技能外沿与命中点使用 [Battle](../assets/scripts/m1/Battle.ts) 在施放时记录的世界坐标，绘制由 [SkillEffectsView](../assets/scripts/cocos/SkillEffectsView.ts) 的 Cocos Graphics 完成，战场边缘使用矩形遮罩。更换配色、纹路和命中闪光时沿用事件提供的原点、方向与尺寸。[技能范围动图](../art/workshop/skill-ranges.webp)展示正常战斗步触发后的效果与贴边裁切。

制作流程采用仓库内的 [Create Game Assets](../.agents/skills/create-game-assets/SKILL.md)，上游固定在 [c6ca6c4](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/tree/c6ca6c41c839b68319ffc08430b99ab768debc32/skills/disciplines/create-game-assets)。先按实际显示尺寸列清单，记录来源和生成参考，使用同一母版生成动作条，确认透明度、对齐与裁切，再到 Creator 中按状态回放。角色一致性和 Cocos 导入可查 [Game Art Pipeline](https://github.com/cuteyuchen/game-art-pipeline)，动作节奏与前后摇可查 [Sprite Animation](https://github.com/ProkStudio/skills/blob/main/skills/game/2d/sprite-animation/SKILL.md)。

## 备选资源

| 资源 | 授权与适用场合 | 本轮取舍 |
| --- | --- | --- |
| [Mechanic Animated](https://opengameart.org/content/mechanic-animated) | CC0，持扳手角色的待机和跑步等动作 | 横版动作参考。本轮采用与场景同风格的维修工。 |
| [Bits & Bots](https://opengameart.org/content/bits-bots-art-pack) | CC0，多方向小机器人与传送动画 | 保留为多方向动作参考，像素精度与本版不同。 |
| [Top-down Tanks Remastered](https://kenney.nl/assets/top-down-tanks-remastered) | CC0，俯视车辆与履带 | 可用于测试车辆朝向，当前敌人采用独立轮廓。 |
| [Industrial Mine Tileset](https://opengameart.org/content/industrial-mine-tileset) 与 [Warped Top-Down Tech Lab 2](https://opengameart.org/content/warped-top-down-tech-lab-2) | CC0，工业地面、管线、设施拼块 | 适合扩展地图，首版选用安静的固定战场底图。 |

## 替换皮肤

M2 场景组件的 `skinRoot` 默认指向 `skins/workshop`。一套皮肤提供 `yard.jpg`、透明 `sheet.png` 和 `frames.json`。映射表以实体或物品 ID 为键，值为左上原点的像素矩形 `[x, y, width, height]`。正面走路使用 `walk0` 至 `walk3`，背面为 `back0…3`，侧面为 `side0…3`。九宫格面板使用 `panel`。新主题可以调整帧在图集中的排列与数量，并在 Creator Inspector 中切换目录。

[BattleSkinView](../assets/scripts/cocos/BattleSkinView.ts) 持有贴图、色彩、动画时钟采样和复用的 Sprite 节点，所有碰撞与命中仍由 Battle 计算。贴图缺失时实体显示原灰盒轮廓，程序化预警继续工作。选择空的皮肤路径可回到灰盒作对照。编译和运行直接读取已生成的资源；修改原图后可用 Node 和 sharp 0.34.3 执行 `node art/workshop/bake.cjs` 重新裁切、压缩并写出清单。源图位于 Creator 工程之外。
