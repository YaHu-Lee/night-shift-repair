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
