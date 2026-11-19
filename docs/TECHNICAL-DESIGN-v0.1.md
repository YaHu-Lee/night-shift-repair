# 夜班修理局 技术方案 v0.1

**选型：Cocos Creator 3.8.8 + TypeScript，直出抖音小游戏。** 以已通过的[策划 v0.1](https://chatgpt.com/space/page_fffaf0daa76c8191b77021567ee8f4dd)为基线，不改玩法和首版范围。浏览器用于日常快跑与纯逻辑测试，抖音 Android/iOS 真机为最终运行环境。先用 1–2 个开发日跑通双端和压力场景，再开始铺内容；这是计划与准入门槛，不是已经完成的测试。

# 为什么选 Cocos

| 路线 | 已核对的发布路径 | 本项目判断 |
| --- | --- | --- |
| Cocos Creator 3.8.8 + TS | [官方安装版本](https://www.cocos.com/creator-download)；[直接构建抖音小游戏](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-bytedance-mini-game.html)，产物交给抖音 IDE | 首选。2D 场景、Prefab、图集和 UI 有编辑器；纯 TS 战斗可在 Node 独立测试。把 3.8.8 当已核对的起始版本，不追新；首次双端通过后锁定编辑器、构建配置和实际测试的基础库版本。 |
| LayaAir 3.3 + TS | [厂商抖音发布指南](https://layaair.com/3.3/doc/released/miniGame/byteDance/readme.html)，同样直出 | 唯一优先备选。若 Cocos 的构建、包体或引擎适配成为明确阻塞，用同场景实测 Laya；纯 TS 层可复用，Prefabs 和 UI 要重接。 |
| Godot 4.5 | [抖音官方接入](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/godot/godot-engine-integration-guide)，有官方 SDK，走 Compatibility/WebGL2、GDScript | 并非不支持，当前的竖屏支持也符合本作；但官方专用导出限制线程和扩展，且会引入不同语言和工具链，本项目没有现成 Godot 工程可抵消迁移成本。 |
| Unity | [抖音 WebGL 小游戏方案](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/game-engine/rd-to-SCgame/open-capacity/sc_webgl_overall) | 有正式路径，但额外的 WebGL/WASM 转换和 SDK 接入没有为轻量 2D 提供已知的收益。原生 JS/Canvas 同样可按[平台目录规范](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/develop/)接入，但不值得自己补 UI、图集和资源编辑流程。 |

# 工程结构与模拟规则

- **战斗域**（game/core）：纯 TS 状态和规则，不导入 Cocos、DOM 或抖音 API。固定 30 Hz 模拟，渲染与模拟分离；每帧最多追 3 步，恢复前台时清空积压和旧触点，不追算离线时间。每局显式种子，商店、刷怪各用独立随机流；命中顺序用稳定实体 ID，同平台同版本以种子＋逐帧输入复现问题，先不承诺跨运行时逐位一致。

- **内容层**（game/content）：武器、模组、敌人、波次用带稳定 ID 和版本的 JSON，CI 校验引用、权重、稀有池、正数和预算。工具提供攻击行为，模组响应命中/拾取/射击事件；连锁伤害限制弹跳次数并标记来源，避免再次触发自身。标签是否集齐由当前装配计算，不在多处记可漂移的计数。

- **Cocos 表现层**（assets/scenes、prefabs 与 view）：一个战斗场景，HUD、商店、暂停做覆盖层。逻辑只输出状态和事件；动画/音效不能反写命中。9:16 画布等比适配，用小游戏的安全区与胶囊位置布置 HUD；战场规则坐标不随手机屏形改变。浮动摇杆只接管首个有效触点，取消/切后台即归零。

- **平台层**（platform）：同一接口接 Web 实现和 Douyin 实现，封装生命周期、入口、存储、广告、埋点；检测能力后调用，不让浏览器 API 或第三方 Web SDK 进入战斗域。离线灰盒无后端、无账号、无广告 SDK 依赖。

# 存档、广告与平台接入

**存档。** 每波结算先计算新快照，再一次提交零件、商店候选、随机流和波次；购买、刷新也各自提交完整快照。存档含 schemaVersion、contentVersion、runId、修订号和下一阶段，写入失败继续用上一个校验通过的 A/B 槽；回读选最新有效版本，不能把未提交奖励再发一次。热恢复提示继续；冷恢复回到最近已提交检查点，本波未提交拾取/伤害不继承。连接 [小游戏 API](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/overview) 的 onHide/onShow、getLaunchOptionsSync、getSystemInfoSync、getMenuButtonLayout 与数据缓存；存储失败须有提示但可开始新局。

**IAA 后置。** 按[策划](https://chatgpt.com/space/page_fffaf0daa76c8191b77021567ee8f4dd)只试第 2–5 波一次自选复活。一次展示生成一个尝试 ID，等待 [激励视频](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ad/incentive-ads) 完整观看回调；只对当前局、当前死亡和当前尝试发一次奖励。取消/无填充/失败/超时走原结算，重复回调丢弃。完成才把复活标记与波初快照一起提交，回到本波起点且不继承失败尝试的掉落收益。测试替身仅限开发版本。

**上线能力。** [首页侧边栏复访是必接](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/essential-skills)，按[技术指引](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/Introduction-for-tech)测冷启动和热启动，从首页入口接回游戏，但不阻塞核心玩法。送审前核对主体、软著/授权、[作品备案](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/game-filing-application-works)、[ICP 核准](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/icp/icp-filings)、隐私披露和真实的实名/防沉迷流程；[有版号在运营游戏的渠道绑定](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/realnameauthentication)单列核对，不把无内购视为防沉迷豁免，不自行收集证件。能扫码预览不等于能上架或变现。

# 包体、帧率与测试门槛

| 项目 | 内部验收（不是平台标准） |
| --- | --- |
| 包体 | 按[官方默认限制](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)：无分包 20 MB，分包时主包 4 MB、整包 20 MB；内部目标主包 ≤3.5 MB、整包 ≤16 MB。只导实际用到的素材，首包只放首屏可玩资源；Boss、美术变体与长音频候选进分包。中文先测系统字体，需内嵌再裁子集。 |
| 最重战斗 | 首轮压力夹具：120 活敌、160 行进弹体、80 拾取物，测 60 秒并连跑两次。至少一台中档 Android 和一台 iPhone 实机；性能出口以目标档机 p95 帧间隔 ≤33.3 ms、无崩溃/持续掉速为准，记录机型、抖音版本、构建与模式。测量或密度不合适时用日志重估，不把这些数量当最终出怪设计。 |
| 热点 | 敌人、弹体、掉落池化；简单圆形碰撞，空间网格筛附近目标，不给每个对象挂刚体或每帧遍历全场配对。贴图合批，限制透明特效与伤害飘字，优先降表现负载而不是偷偷改出怪；用真机 Profile 定位逻辑、渲染或 GC。 |
| 体验 | 目标设备冷启动统一网络条件、从点入口到可控制测 5 次，先以中位数 ≤5 秒为内部目标；窄屏/刘海/手势区、锁屏/切后台、杀进程恢复各走一遍；无消失的方向键、无跨波重复奖励。 |

# 开发里程碑与发布链

1. **M0 技术验证（1–2 个开发日目标）**：建立独立工程；空壳直出抖音；接竖屏＋浮动摇杆＋生命周期＋本地存档；做固定种子压力场景，双端扫码，记录大小、帧耗、日志。任一端不能启动先查构建与调试配置；明确是引擎适配、或优化后仍过不了同口径门槛，才用 Laya 跑同一个对照实验。没有实机证据就不启动内容生产，也不宣布换引擎。

2. **M1 90 秒灰盒**：3 波、3 武器、6 模组、3 敌型；同一武器能做电弧和磁吸两条对照，首商店保证可负担的配对。提交确定性战斗、掉落/回收、购买/刷新、掉线恢复/奖励幂等测试；不接广告。两种构筑没有改变走位，就先改触发与敌人组合。

3. **M2 完整一局**：按策划扩到 6 波、Boss、4 武器、12 模组，跑真机回归与 8–12 人诊断试玩。最小埋点：run_start、wave_end、shop_pick、build_trigger、death、run_end、restart；报版本、波次、武器/模组 ID、死因，不报证件或文本。对外测试前再按授权与平台规则启用上报。

4. **M3 测试通道与送审准备**：接侧边栏和商业化开关；用实测 adUnitId 测完整播放、跳过、无填充、退出情况。走 IDE 上传测试通道 → 测试版本 → 控制台提审；上架和开通商业化不是这次技术方案的执行范围。

**构建分工：**普通 CI 跑纯 TS 类型检查、单测、数据校验和产物体积检查；Cocos [命令行构建仍要求 GUI](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-in-command-line.html)，不把无 GUI Linux 当正式打包机。首轮在 Mac/Windows 有界面机器用固定编辑器，提交导出的 Build JSON、资源 .meta、锁文件与验收记录，不提交缓存和凭证。用[抖音开发者工具](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/mini-app-developer-instrument)导入生成包；测试号只能预览和调试，上传需真实 AppID 与有权限的开发者账号。[真机调试](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/dev-tools/game-debug/real-machine-adjust)按文档绑定账号/设备。先手动上传测试通道，稳定后再考虑 CLI；不自动发布生产。
