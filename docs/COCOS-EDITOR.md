# M0 Cocos 预览与抖音导出

适用 **Cocos Creator 3.8.8 LTS**。本地 M0 工程位于 `creator-m0/`。用 Creator 打开该目录并打开 `assets/scenes/M0.scene`，可直接预览已挂载组件的 360 × 640 场景。修改仓库根目录的脚本后，构建前将改动同步到 `creator-m0/assets/scripts/`，保留 Creator 已生成的 `.meta` 文件。

在构建发布面板导入 `creator-m0/build-m0.json` 可复用 M0 构建配置。竖屏调试包输出到 `creator-m0/build/bytedance-mini-game/`，使用测试号。调试包在控制台输出 `[M0]` 事件，每连续运行约 60 秒报告一轮 p95 和峰值帧间隔。Windows 验证结果见 [M0 验收记录](M0-CHECKLIST.md)。以下是从模板重建工程的步骤。

1. 用 Cocos Dashboard 创建一个 **2D** 项目，使用 3.8.8；把仓库的 `assets/scripts/` 复制到该项目对应目录。保留项目由 Creator 生成的场景、`.meta` 和设置，勿手写 UUID。
2. 打开项目默认 2D 场景，保留 Canvas 及其 UI 相机。在 **项目 → 项目设置 → 项目数据** 把设计分辨率改为 **360 × 640**，让画布在预览设备上保持整块场地可见（优先 Fit Width 和 Fit Height 同时启用）。在 Canvas 下新建一个位置 `(0, 0, 0)`、图层 `UI_2D` 的子节点 `StressView`，添加脚本组件 **M0Bootstrap**。该组件初始化本节点的 `UITransform` 和 `Graphics`，运行时生成标签，不需要资源绑定。保存场景。
3. 首先运行 Creator 预览：确认画面有 120 个敌人、160 个弹体、80 个拾取物；拖动场地，确认松手或打断触摸立即停走；点 PAUSE/RESUME 并确认时间停止/继续。SAVE/LOAD 只保存和重置测试种子，不恢复模拟帧。退到后台并返回后应停在 RESUME。
4. 打开 **项目 → 构建发布**，选择 **抖音小游戏**，设置首场景和 Portrait（竖屏），填用于预览的 AppID。点击构建，用抖音开发者工具打开输出的 `bytedance-mini-game/`（应包含 `game.json`、`project.config.json`）。测试号仅用于预览调试，不能上传。
5. 在抖音开发者工具运行模拟器并扫码测试真机。至少测试 iOS 和 Android 的刘海/安全区、拖动、后台恢复、本地 checkpoint，以及完整场地和 HUD。看实际帧率和内存，不能用 Node benchmark 代替；未确认真机之前不要把 M0 标记为通过。

本组件是 Graphics 压测可视化，不代表最终 SpriteAtlas、画质或渲染上限。画面 HUD 为调试文字，非正式美术。平台适配由 `Session` 管理；如果状态栏在抖音真机上显示 MEMORY 而非 DOUYIN，不应视为平台存储或生命周期已通过。

官方参考：[Cocos 发布到抖音小游戏](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-bytedance-mini-game.html) · [抖音开发者工具](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools)。
