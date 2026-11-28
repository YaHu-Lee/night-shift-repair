# Cocos Creator 3.8.8 工程与构建说明

正式工程位于 `creator-m0/`，唯一启动场景为 `creator-m0/assets/scenes/Campaign.scene`，设计分辨率 **360 × 640**（竖屏）。

## 构建配置清单

在 **Cocos Creator 3.8.8** 构建发布面板导入以下配置即可构建对应目标：

- `creator-m0/build-campaign-web.json`：Web Mobile 调试预览包（`debug: true`，输出 `creator-m0/build/campaign-web-review`），可附 `?mockAd=1` 或 `?patrolDebug=prep|shop|boss|result|log` 进行本地走查。
- `creator-m0/build-campaign-web-playtest.json`：Web Mobile 非调试试玩包（`debug: false`，输出 `creator-m0/build/campaign-web-playtest`）。
- `creator-m0/build-campaign-wechat-release.json`：微信小游戏发布包（`debug: false`，4 章分包为 `subpackage`）。
- `creator-m0/build-campaign-release.json`：抖音小游戏发布包（`debug: false`，4 章分包为 `subpackage`）。

## 本地预览与双端真机调试

1. 修改 `assets/scripts/` 后，构建前务必同步到 `creator-m0/assets/scripts/` 并保留对应的 `.meta` 文件（可通过 `npm test` 中的 `campaign-scene.test.mjs` 自动检查）。
2. Web 调试包构建完成后，在仓库根目录运行 `node scripts/serve.mjs creator-m0/build/campaign-web-review`，浏览器打开 `http://127.0.0.1:4173/`。
3. 微信／抖音发布包构建完成后，运行包体验证脚本（见 [发布包身份核对](../cloud/README.md#发布包身份核对)），再用微信开发者工具或抖音开发者工具打开对应的 `creator-m0/build/` 目录扫码真机验收。

Creator 会在打开工程或构建时自动重建 `creator-m0/library/` 和 `creator-m0/temp/`，无需提交缓存目录。

### 微信预览模拟广告

先构建当前代码的微信发布包。再运行以下命令，从发布包生成一份独立的模拟广告预览包。重复生成时，第二个参数可指定一个新的输出目录。

```powershell
node scripts/prepare-wechat-preview.mjs
```

在微信开发者工具导入 `creator-m0/build/wechatgame-campaign-preview`，点「预览」并扫新二维码。首轮清波后可在升级页点「看视频多选一项」，也可在商店点「看视频领 20 铜件」。弹窗支持模拟看完、提前关闭和加载失败。

正式提审使用 `wechatgame-campaign-release`。发布包校验会拦截含有模拟广告开关的包。审核通过后再为正式包配置真实激励视频广告位。

## 本地体验与移动回归

Web 调试包的首页可进入武器架、装备柜和工坊。用 `?patrolDebug=arc` 查看同一次电击的两个实际溅射段，用 `?autoMove=1` 从首页开局体验内部自动位移。开关仅在 Web 调试构建读取。玩家仍自行选择升级和购买装备。

运行 `npm run test:e2e` 可复查两种竖屏尺寸，产物写入 `test-results/`。微信体感使用开战时的握姿校准中立点，暂停或切后台会停止传感器，下次开战重新校准。

自动位移实验以四章普通难度、五套工装的**已清波次 / 可挑战波次**衡量覆盖。控制器每 18 个模拟步根据敌机、子弹、首领预警、掉落和边界重新选方向，按普通摇杆的 64% 幅度输入。仿真中的升级、购买和工坊进度沿用现有策略，全程没有复活。开发种子和独立种子各跑 160 局，分别覆盖 1139/1920（59.3%）和 1117/1920（58.2%）波。通过 `npm run sim -- --auto-movement` 和 `npm run sim -- --auto-movement --holdout` 可复现。真人选购、不同难度和无尽模式会改变结果。
