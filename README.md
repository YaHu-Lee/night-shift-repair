# 夜班修理局 · M0 技术验证

《夜班修理局》是竖屏俯视肉鸽小游戏，战役支持浏览器、微信小游戏和抖音小游戏。3D 预览使用立体角色与场景，并保留平面战斗判定。M0 是用于测试输入、生命周期、存档和画面压力的独立场景。

## 浏览器与自动验证

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

后续的美术和玩法验收使用 Creator 的浏览器构建。以下是现有的预览配置。

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
