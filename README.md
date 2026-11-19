# 夜班修理局 · M0 技术验证

抖音竖屏 2D 肉鸽的独立原型工程。M0 用几何图形测试输入、运行、生命周期、检查点与画面压力；**不是 90 秒玩法灰盒，也不是已经可发布的抖音包**。

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

## Cocos 与抖音

[Creator 3.8.8 编辑器接入、构建与扫码步骤](docs/COCOS-EDITOR.md)。`creator-m0/` 包含已挂载 M0 组件的 2D 工程、360 × 640 场景和抖音竖屏构建配置。

[已验证与待验证清单](docs/M0-CHECKLIST.md)

[M1 灰盒试玩与构建](docs/M1-PLAYTEST.md)

[M2 完整一局与真机验收](docs/M2-PLAYTEST.md)

- `assets/scripts/core/`：纯 TypeScript 固定 30 Hz、固定种子压力模型，可脱离引擎测试。
- `assets/scripts/platform/`：浏览器与抖音适配、A/B 本地检查点。
- `assets/scripts/m0/`：共享控制器，暂停和每帧最多补 3 步。
- `assets/scripts/cocos/`：Creator 宿主，调试图形、摇杆与控制。
- `web/`：独立浏览器 QA 外壳。无广告、后端、账号和真实上报。
