# 夜班修理局

《夜班修理局》是竖屏斜俯视肉鸽小游戏，战役支持浏览器、微信小游戏和抖音小游戏。正式美术方向为 **2D 像素风**，战斗判定使用平面坐标。M0 是用于测试输入、生命周期、存档和画面压力的独立场景。

项目协作约定见 [AGENTS.md](AGENTS.md)，出图、切帧和验收流程见 [像素美术 Skill](.agents/skills/night-shift-pixel-art/SKILL.md)，正式接入范围见 [战役像素化进度](art/pixel/README.md)。

## 试玩像素战役

`main` 包含完整的 20 关战役。用 Cocos Creator 3.8.8 打开 `creator-m0/`，在构建面板导入 `creator-m0/build-campaign-web.json` 并构建。随后在仓库根目录运行：

```sh
node scripts/serve.mjs creator-m0/build/campaign-web-review
```

打开[战役首页](http://127.0.0.1:4173/)或[武器试打台](http://127.0.0.1:4173/?weaponShowcase=bench)。逐关数值、群怪与首领实录见[战斗评审单](docs/CAMPAIGN-COMBAT-REVIEW.md)。

## M0 压测与自动验证

需 Node.js 24。
```sh
npm ci
npm run typecheck
npm test
npm run bench
npm run preview
```

在同一台机器打开 http://127.0.0.1:4173 。拖战场下四分之一或用箭头键，测试暂停、保存、恢复与同种子重开。保存只记录测试场景种子，不保存完整世界或当前帧。页面切到后台必须暂停，恢复后需主动点继续。统计中三个数字依次为敌人、弹体、拾取物。帧间隔仅供当前浏览器参考，不能代替抖音真机。

## Cocos 与小游戏

[Creator 3.8.8 编辑器接入与 M0 预览](docs/COCOS-EDITOR.md)。`creator-m0/` 包含 360 × 640 的工程和两端战役构建配置。包体校验与广告位设置见 [微信和抖音发布说明](cloud/README.md#发布包身份核对)。

主角、8 种小怪和 7 种 Boss 均使用固定斜俯视八向图。素材和更新步骤见[像素战役资产](art/pixel/README.md)。

正式战役中，武器约每 13 秒顺时针绕行一圈。第 2 波后的整备台开放其余武器位，最多同时装备 6 把已解锁武器。电弧扳手交替正手横扫和反手挥扫，旁路扳手交替钩扫和压击。近战先按角色周围的射程筛选，再优先瞄向距离该武器最近的敌机，挥击沿途每台敌机最多受击一次。

武器组合的战力公式、20 站敌群与首领参数、数值复跑命令见[战役战力与难度校准](docs/CAMPAIGN-POWER-BALANCE.md)。

武器试打台覆盖十把武器。点武器名换下一把，点“装上专属件”用同一波敌人比较，点“打首领”切换到巡检机。

浏览器调试包用 `?weaponShowcase=armory` 或 `?weaponShowcase=utility` 跳到第 3 波的两组六武器样片，共覆盖 10 把武器。原双武器对照入口为 `?weaponShowcase=floating` 和 `?weaponShowcase=held`，3D 对照构建用 `?prototype3d=1`。样片进度仅存于当前页面内存。贴图及打包方式见[武器素材](art/pixel/weapons/README.md)。

像素战役使用独立的章节分包。旧开场和整备画面作为第一章的回退资产保留，3D 模型由以下对照配置打包。

| 目标 | 构建配置 | 本地产物目录 |
| --- | --- | --- |
| 浏览器 | `build-campaign-3d-prototype.json` | `creator-m0/build/campaign-3d-prototype` |
| 微信小游戏 | `build-campaign-wechat-3d-preview.json` | `creator-m0/build/wechatgame-campaign-3d-preview` |
| 抖音小游戏 | `build-campaign-douyin-3d-preview.json` | `creator-m0/build/bytedance-mini-game-campaign-3d-preview` |

浏览器产物使用 `node scripts/serve.mjs creator-m0/build/campaign-3d-prototype` 启动。小游戏预览共用 WebGL 1 引擎配置，供本地开发工具检查。发布配置和发行包校验另见上方说明。

[已验证与待验证清单](docs/M0-CHECKLIST.md)

[M1 灰盒试玩与构建](docs/M1-PLAYTEST.md)

[M2 完整一局与真机验收](docs/M2-PLAYTEST.md)

- `assets/scripts/core/`：纯 TypeScript 固定 30 Hz、固定种子压力模型，可脱离引擎测试。
- `assets/scripts/platform/`：浏览器、微信和抖音适配，A/B 本地检查点及两端激励视频。
- `assets/scripts/m0/`：共享控制器，暂停和每帧最多补 3 步。
- `assets/scripts/cocos/`：Creator 宿主，调试图形、摇杆与控制。
- `web/`：独立浏览器 QA 外壳。无广告、后端、账号和真实上报。

## 战役切片

- 20 关战场使用 660 × 650 的可移动区域。镜头随人物移动，摇杆、暂停和波次信息固定在屏幕上。每关前五波击倒全部敌人后整备，第六波击败关底机后结单。
- [项目宪章与素材验收准则](docs/PROJECT-CHARTER.md)
- [战役 01→02 交接与验收](docs/CAMPAIGN-SLICE-PLAYTEST.md)：Linux 自动化覆盖和 Windows／Mac 真机清单。
- [游戏策划 v0.3](docs/GDD-v0.3.md) · [MVP 剧情与关卡规划](docs/CAMPAIGN-STORY-OUTLINE.md) · [技术与制作 v0.2](docs/TECHNICAL-DESIGN-v0.2.md) · [免费素材与授权](docs/ASSET-SOURCES.md)。
