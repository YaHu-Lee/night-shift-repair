# 实现方案与社区实践

## 社区实践在本项目中的用法

| 做法 | 《夜班修理局》的落地 |
| --- | --- |
| Playwright 建议从用户可见行为出发，并给每条测试隔离浏览器数据 | 用真实输入穿过被测转场，测试前各自建上下文。重载用原上下文，新档用新上下文。状态探针只为 Canvas 提供可核验的输出契约。[Playwright 最佳实践](https://playwright.dev/docs/best-practices) |
| SuperSnake 将确定性核心、浏览器路径、视觉及发布冒烟分层 | 复用仓库的纯 TS 内核和固定种子仿真。浏览器集中覆盖输入、转场、视图与持久化接线。验证发行包隔离调试能力。[SuperSnake 架构与测试](https://github.com/binterse/supersnake#architecture) |
| Canvas 示例在受控时间点取画面。Babylon.js 用 Playwright 和明确的渲染配置做图像差异测试 | 统一浏览器、分辨率、字体和渲染后端。对武器和动态场景采样指定游戏帧。用状态断言确认场景就绪再比图。[playwright-canvas 示例](https://github.com/satelllte/playwright-canvas) · [Babylon.js 视觉测试](https://github.com/BabylonJS/Babylon.js/blob/master/.github/instructions/visual-tests.instructions.md) · [Playwright 图像比较](https://playwright.dev/docs/test-snapshots) |
| Playwright Trace Viewer 汇总操作、前后快照和网络活动 | 失败留 trace、截图、控制台和请求错误。Canvas 的画面证据单独截图，报告同时附输入动作与结构化状态。[Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer) |

## 已有基础与缺口

- `npm run typecheck`、`npm test` 和 `npm run sim` 已有。`scripts/serve.mjs` 可把 Creator 输出挂到本机。构建调试包用 `creator-m0/build-campaign-web.json`，试玩包用 `build-campaign-web-playtest.json`，微信用 `build-campaign-wechat-release.json`。三种包分别记录来源。[Creator 构建说明](../../../../docs/COCOS-EDITOR.md) · [Cocos 发布到微信小游戏](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html)
- `M1Bootstrap.ts` 在调试构建暴露 `__nightShiftCampaignState()`，其 `PatrolCampaignUi.inspect()` 有页面、关卡、波次、生命、铜件、解锁、货架与待选次数。升级页和商店共享 `page: 'shop'`，用 `pendingLevelUps` 区分。探针还提供触控矩形、角色坐标、摇杆位置、连锁跳点及场景贴图就绪状态。结算账目仍需专门断言。
- `patrolDebug` 已有 `prep`、`workshop`、`log`、`battle`、`boss`、`levelup`、`shop`、`result`、`arc`。`arc` 固定种子 13，停在自然三连击的第 709 步。部分路线会写入本地测试存档，必须隔离上下文。`result` 路线会造终局报告，它能验页面呈现，真实首通发奖要从合法实战状态抵达结算。正式微信包的调试读取已限制，验收仍要测试访问不到探针。
- `mockAd=1` 在 Web 调试包打开模拟视频。点游戏里的激励入口，选择提前关闭、模拟加载失败，或等待两秒后看完并返回。用存档、余额和次数验证发奖。实际无填充、原生回调时序和微信后台中断另行取证。
- 工程内运行 `npm run test:e2e`，先用 Creator 重建 Web 调试包与非调试试玩包。首次安装浏览器用 `npx playwright install chromium`，本机已有 Chrome 时也可设 `PLAYWRIGHT_CHANNEL=chrome`。首局、章节末波、广告与非调试启动用例见 `tests/e2e/`。截图保留用于复看，失败另留 trace。

## 分批实施

### 1. 先建立浏览器冒烟

1. 锁定 Playwright Test 和 Chromium，在本地 CI 跑浏览器测试。使用受控的 Creator 3.8.8 构建机器生成可核对来源的产物。CI 消费同一 checkout 或同一源指纹构建的产物。旧包或缺包直接报告具体原因，避免把旧产物当成回归通过。
2. 若采用独立入口，将浏览器用例放在 `tests/e2e/`，配置 `webServer` 启动 `scripts/serve.mjs`。保留现有 Node 测试入口，加自己的 `test:e2e`。默认用 360 × 640 和 393 × 852 两个竖屏项目。视口模拟只覆盖浏览器触控和布局。
3. 第一条旅行用例从空档冷启动开始，经由玩家真实输入完成首战、升级、买扳手、合成、第二波和重载续玩。另用独立上下文覆盖跳过指引和非调试试玩包冷启动。画面可见且按钮能点、状态转移准确、重载后恢复、无未处理异常，是冒烟完成条件。

### 2. 扩玩法、存档与截图

1. 探针按用户可见概念定义稳定键和必要的状态，数据返回纯 JSON 快照。例如 `page`、`wave`、`playerPosition`、`savePending`、`rewards`、`renderReady`、`hitAreas`。收集 `M1Bootstrap.touchTarget()` 当帧真正可用的矩形，稳定 ID 与中文按钮名分离。把 Cocos 设计坐标换算为 Canvas 的 CSS 坐标，包含适配缩放、留边与 Y 轴翻转。每次转场重新读矩形，输入走 Playwright 点按或触摸。摇杆拖动用真实触摸事件序列和状态断言验证手势生命周期。探针不能代点击、改血量或直调结算来通过路径用例。
2. 普通路径保持实际游戏时钟。通过合法存档夹具和固定种子准备需要深进度的用例，使用项目现有 A/B 存档写入路径生成测试数据。确定性的逐帧检查可在调试专用驱动中按现有 30 Hz 模拟步推进，执行正常的更新与绘制。日切和广告防误触单独控制时钟，确认所用 API 是否影响 `Date`、定时器及动画帧。冻结墙钟后需要显式推进相应时间。[Playwright Clock](https://playwright.dev/docs/clock)
3. 长局与百种组合继续跑 Node 仿真。四章和无尽的 UI 证据用合法检查点压缩到关键转场。为 WPN 每把记录具体武器、朝向、帧和目标，冻结可重复的特效采样帧。命中及击毁从实际状态确认。画面回归对比同一环境的 Canvas 截图，动态成分优先固定采样。先审查基线、实际、差异三张图，再更新预期。可见变化和账号账目分别断言。
4. 报告按清单 ID 关联。每次失败保留 commit 与未提交变更范围、构建 ID、测试数据、输入、预期和实际状态、trace、截图和控制台。只对已知非业务噪音使用有理由的白名单。失败立即复核最短复现，重试通过记录为不稳定，原始失败仍留存。

### 3. 补微信首发证据并交付体验试玩

1. 用真实候选包跑结构校验，防止 AppID、分包、图片／音频文件或 debug 改动漏到发行。对启用的原生能力，在已授权的微信测试环境操作。用模拟器做低成本冒烟，核心平台能力仍在对应真机上采证。记录实际设备、系统、微信版本、候选包指纹和结果。测试工具的小游戏支持需用现用版本确认。
2. 原生广告关闭／完整播放、分享面板、真实 `wx` 持久化、杀进程、系统音频中断、真实分包断网重试和设备性能，根据[用例覆盖矩阵](coverage.md)测。内存/帧率取同场景、预热及回收后的多点数据，区分单次内存峰值、逐局基线抬升和工具进程占用。模拟器与真机各自记录，避免一端替另一端出结论。
3. 每个 PR 优先跑 Node 快速测试与关键入口冒烟。定时或候选版任务再跑完整视觉矩阵、种子组合、设备和异常恢复。工程报告由 Codex 维护，项目经理收到体验试玩路径与待决问题。外部刷包、上传与提审遵循本次授权范围。

## 首次可行性验证

2026-11-28 基于当前工作区，用独立的 Creator 3.8.8 调试构建和临时 Playwright 环境实跑。360 × 640 通过真实 Canvas 触摸从空档进入第 1 波，刷新回值班室后续玩同一波。360 × 640 与 393 × 852 均抓取了首页与独立结算夹具场景，未见 `pageerror`。本次证据只覆盖该短流程及截图可取得性，首店、视觉差异基线、全量用例和微信真机自动化尚未接入。
