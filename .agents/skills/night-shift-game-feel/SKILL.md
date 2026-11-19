---
name: night-shift-game-feel
description: 打磨《夜班修理局》的角色动作、技能矢量特效与命中范围、战斗预警、竖屏 HUD 和整备操作时使用。适用于 Creator M2 的可玩性复核和换肤回归。
---

# 在实机场景里复核动作和决策

从现用场景、Battle、Run 和皮肤帧表核实真实状态及规则。在独立预览会话走一遍选路线、移动、暂停、整备和结算。查看 360 × 640 下的画面，长屏复核触控区和顶部胶囊。

- **朝向与节拍。** 分别向四个方向走，再斜走、松手、顶墙、暂停。取相邻模拟步的实际位移决定朝向和步幅，保留最后站姿。镜像时检查头灯、脚底和工具是否倒置，复用 Sprite 时清掉上次的变换。冲锋车、炮口和前甲的朝向要和判定一致；用锁定目标后横移检查预警。
- **界面层次。** 在怪群里仍须一眼看出血量、时间和危险方向。给图标、名称和价格留独立宽度，在模拟器实际尺寸查看。按住后移出再松手，检查按钮反馈和取消；选中、买不起、满槽和已购买都要能辨认。
- **文案。** 开局让玩家知道要做什么、从哪里移动。把“质变”“触发”等开发词换成能看到的结果。对照 Battle 的触发条件描述单件效果和成套效果，分别说明价格、余额不足、替换对象和下一波。死亡或超时要给出实际原因。
- **验证范围。** 逻辑测试验证规则；在真实 Creator 预览采样激活的帧、镜像和点击后的状态，同时查看截图。复核旧检查点和无皮肤回退。将修改同步到 Creator 工程的脚本副本。真机结论需要对应版本的设备实测。

## 让技能动效读出真实判定

- 从 [Battle.ts](../../../assets/scripts/m1/Battle.ts) 的一次实际施放追到命中。记录施放时的原点、单位方向、形状尺寸、实际命中点或连锁跳点。范围表示哪些位置可能受击，命中闪光表示哪些目标确实受击。穿刺有目标数上限，两者需要分别呈现。
- 在 [SkillEffectsView.ts](../../../assets/scripts/cocos/SkillEffectsView.ts) 里消费战斗事件，用矢量图形绘制范围。瞬时伤害在生效当步显出完整外沿；扩散、回吸、火舌和淡出留在外沿内，按战斗 tick 播放。施放后移动角色，确认残影仍锚定施放点。换肤可替换颜色、纹理和标记，半径和角度来自事件。
- 选边界用例时覆盖扇面的弧边与两条侧边、穿刺带末端与第四个目标、极近距离和完全重合的瞄准点，以及贴战场边缘施放。先用[范围测试](../../../tests/skill-ranges.test.mjs)核对受伤目标，再在 Creator 固定同一战斗步，比较有无特效的画面，查看边界内外像素与战场遮罩。留一段[实际渲染样片](../../../art/workshop/skill-ranges.webp)，注明是否做过真机验证。

## 社区方法来源

本技能按本项目的模拟时钟、存档和触控方式整理。动作基准与关键姿态参考 [ProkStudio · Sprite Animation](https://github.com/ProkStudio/skills/blob/main/skills/game/2d/sprite-animation/SKILL.md)。HUD 优先级和多种交互状态参考 [ProkStudio · Game UI and HUD](https://github.com/ProkStudio/skills/blob/main/skills/game/2d/game-ui-and-hud/SKILL.md)。购买前的决策信息和操作反馈参考 [parodyband · Game UI/UX](https://github.com/parodyband/game-ui-ux/blob/main/skills/game-ui-ux/SKILL.md)。
