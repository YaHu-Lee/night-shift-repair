# 夜班修理局

《夜班修理局》是一款 **2D 像素风** 竖屏斜俯视动作肉鸽小游戏，面向浏览器预览、微信小游戏与抖音小游戏。

- **核心玩法**：4 章 × 12 波巡线抢修 + 5 档危急难度（含独立机制词条）+ 5 套工装职阶 + 10 把等角圆环悬浮武器（4 阶 2 合 1 升阶 + 5 大体系羁绊）+ 33 件工坊模块 + 班前特供 + 每日夜班急单 + 港区无尽夜班。
- **架构与设计文档**：[四章巡线技术架构与商业化／留存设计](docs/PATROL-ARCHITECTURE.md)
- **项目协作约定**：[AGENTS.md](AGENTS.md)
- **像素美术流程与资产**：[像素美术 Skill](.agents/skills/night-shift-pixel-art/SKILL.md) · [像素资产说明](art/pixel/README.md) · [武器素材](art/pixel/weapons/README.md) · [免费素材与授权](docs/ASSET-SOURCES.md)
- **Cocos 构建与双端发布**：[Creator 3.8.8 构建说明](docs/COCOS-EDITOR.md) · [存档、广告与发布包校验](cloud/README.md) · [上线前人工核验清单](docs/PRE-LAUNCH-CHECKLIST.md)

## 本地试玩与自动验证

需 Node.js 22+。

```sh
npm ci
npm run typecheck
npm test
npm run sim
```

使用 **Cocos Creator 3.8.8** 打开 `creator-m0/`，导入 `creator-m0/build-campaign-web.json` 并构建后，在仓库根目录启动静态服务：

```sh
node scripts/serve.mjs creator-m0/build/campaign-web-review
```

打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/) 试玩（调试构建附加 `?mockAd=1` 可在本地体验全部 5 处激励视频点位与频控；`?patrolDebug=prep|shop|boss|result|log` 可跳转各页面复核排布）。

## 代码目录

- `assets/scripts/roguelite/`：纯 TypeScript 固定 30 Hz 战斗、商店、进度解锁、留存玩法与存档内核（零引擎依赖，可脱离 Cocos 单测与模拟）。
- `assets/scripts/platform/`：Web / 微信 / 抖音存储、A/B 双槽校验、安全区、设置、激励视频与平台留存互动适配。
- `assets/scripts/cocos/`：Cocos Creator 3.8.8 运行时宿主（`M1Bootstrap`）、竖屏像素界面（`PatrolCampaignUi`）、像素皮肤与特效层。
- `creator-m0/`：360 × 640 竖屏 Cocos Creator 工程、四章独立分包与双端发布配置（`creator-m0/assets/scripts/` 与 `assets/scripts/` 保持严格同步）。
- `tests/`：纯 TS 逻辑、存档幂等、资产校验、音频与发布包校验测试。
- `scripts/`：测试编译、本地预览服务、4 章 × 5 工装平衡模拟器、音频生成与双端发布包校验脚本。
