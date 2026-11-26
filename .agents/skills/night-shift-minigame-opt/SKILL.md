---
name: night-shift-minigame-opt
description: 针对微信小游戏与抖音小游戏对《夜班修理局》（Cocos Creator 3.8.8 2D 像素动作肉鸽）做性能优化、发热与卡顿治理、iOS 内存防 OOM、双端合规审核及真机适配时使用。触发场景包括：小游戏真机测试前体检、静态页/战斗页发热掉帧、Graphics/Label/Color GC 抖动、音频中断不恢复、激励视频过审防误触、首包与引擎模块裁剪。
---

# 微信 / 抖音小游戏专项优化与适配工作流

本技能将社区高频踩坑（Cocos Creator 3.8 + 微信/抖音小游戏 + 肉鸽割草高密度同屏）固化为本项目的可执行规则与验收清单。改动渲染、音频、平台层或构建配置前，对照下述 6 条硬约束核查。

---

## 1. 静态页零空转与 `Label` 属性 Diff（治发热、防显存暴涨）

小游戏（尤其 iOS JSC 无 JIT）最常见的“停在首页/商店也发烫、玩 10 分钟闪退”，根因是 60 FPS 无差别重绘 `Graphics` 与每帧重写 `Label` 触发 Canvas `fillText` + GPU `texSubImage2D`。

- **脏标记驱动重绘**：在 [M1Bootstrap.ts](../../../assets/scripts/cocos/M1Bootstrap.ts) 中，仅在 `patrol.inBattle` 为真时每帧 `draw()`。非战斗页（首页、出勤、商店、工坊、日志、结算）仅在 `uiDirty` 置位（触控、异步加载、切页、窗口尺寸变化、toast 计时到期）时重绘。
- **低频装饰独立降频**：首页火星 `drawMotes()` 以 15 Hz 仅刷新独立 `embers` 图层，严禁触发全页 UI/Label 重建；新手商店引导框脉冲降频至 4 Hz，闪烁相位使用 `Date.now()` 而非渲染计数。
- **`Label` 缓存池必须做属性 Diff**：[M1Bootstrap.ts](../../../assets/scripts/cocos/M1Bootstrap.ts) 的 `CachedLabelSlot` 缓存 `string / x / y / width / height / size / bold / left / colorR / colorG / colorB / colorA / active`，**仅当字段真正变化时才写回 `Label` 属性**；未使用的槽位仅在 `active === true` 时关闭一次。
- **新增异步回调必须补 `invalidateUi()`**：凡在非战斗页调用激励视频、侧边栏跳转、云档同步、异步纹理加载等 `.then(...)` / 回调，完成后必须调用 `host.invalidateUi?.()`，避免脏渲染模式下画面不刷新。

---

## 2. 战斗热路径零分配（治肉鸽大波次 GC 卡顿）

肉鸽后期同屏 30+ 敌机、弹幕、浮字与粒子，在微信/抖音小游戏每帧 `new Color()` / `new Vec3()` 会把年轻代迅速撑爆，造成周期性 30–80 ms GC 停顿。

- **严禁在 `draw*` / `update` 热循环内 `new Color(...)`**：
  - 静态固定色提取为模块顶层 `const`；
  - 动态透明度/渐变色统一调用 [PixelVfxEngine.ts](../../../assets/scripts/cocos/PixelVfxEngine.ts) 导出的 `scratchColor(r, g, b, a)`（复用单例 `Color`，仅赋值 `g.fillColor` / `g.strokeColor` 等立即拷贝 RGBA 的消费方）。
  - **注意**：`Sprite.color` 或持久保存颜色引用的字段不能持有 `scratchColor` 返回值本身，需使用静态 `Color` 常量或独立复用实例。
- **数组/对象池复用**：粒子、地面残痕、Sprite 池与触控命中区均采用预分配/定长数组复用，不在战斗 tick 中频繁 `filter` 重建大数组或反复 `new Node()`。

---

## 3. 低端机分级与 iOS 防 OOM 内存治理

iOS 微信/抖音小游戏物理内存红线约 1.0–1.4 GB，超线直接被系统 Jetsam 强杀（无 JS 报错日志）。

- **设备分级（[miniGameRuntime.ts](../../../assets/scripts/platform/miniGameRuntime.ts)）**：
  - 读取 `wx/tt.getDeviceBenchmarkInfo()` 或 `getSystemInfoSync().benchmarkLevel`；`benchmarkLevel > 0 && benchmarkLevel < 22` 判定为低端机（`isLowEndDevice`）。
  - 低端机在启动时调用 `runtime.hintFrameRate(45)`（微信/抖音 `setPreferredFramesPerSecond` + Cocos `game.frameRate`），并将 [PixelVfxEngine.ts](../../../assets/scripts/cocos/PixelVfxEngine.ts) 的粒子与残痕预算 `setBudgetScale(0.5)` 减半；核心模拟步长保持 30 Hz 不变，确保数值与手感一致。
- **内存告警即时瘦身**：
  - 订阅 `wx/tt.onMemoryWarning`，回调中依次执行：`skin.trimMemory()`（释放非当前活跃场地的背景/地板纹理）→ `patrol.trimMemory()`（清空粒子与地面残痕）→ `runtime.triggerGC()`。
- **安全时机主动 GC**：
  - 仅在局边界（`finalizeRun` 进结算、暂停回值班室）调用 `runtime.triggerGC()`；**禁止在战斗波次进行中调用 `triggerGC()`**，以免制造可感知的卡顿。
- **纹理策略**：
  - 像素图严格关闭抗锯齿与动态合图（`packable = false`），切章后靠 `trimMemory()` 控制常驻大背景纹理数量。

---

## 4. 音频并发、冷启与系统中断恢复

微信/抖音小游戏在来电、语音消息、闹钟、切后台后，系统音频会话常被抢占，且**未必触发 `Game.EVENT_HIDE`**。

- **双通道监听**：除 `Game.EVENT_HIDE / SHOW` 外，[M1Bootstrap.ts](../../../assets/scripts/cocos/M1Bootstrap.ts) 必须通过 `runtime.onAudioInterruption(onBegin, onEnd)` 绑定 `wx/tt.onAudioInterruptionBegin / End`。
- **中断恢复**：中断开始时静音并暂停战斗；中断结束且当前不在后台时，恢复 `syncMusic()` 并调用 [CampaignAudio.ts](../../../assets/scripts/cocos/CampaignAudio.ts) 的 `resumeAfterInterruption()`，确保 BGM 不永久失声。
- **同屏 SFX 限流**：肉鸽高频命中必须保持单帧/短窗口去重限流（[CampaignAudio.ts](../../../assets/scripts/cocos/CampaignAudio.ts) 内 `cooldown` 与通道上限），避免 Android WebAudio / InnerAudioContext 并发超限爆音或无声。

---

## 5. 双端审核合规红线（微信 / 抖音 P0–P1）

| 风险级别 | 合规要求 | 项目落点 |
|---|---|---|
| **P0** | **《健康游戏忠告》首页可见**：完整两句 48 字，清晰可读、不与底部按钮或手势条重叠 | [PatrolCampaignUi.ts](../../../assets/scripts/cocos/PatrolCampaignUi.ts) `drawHome()` 底部安全区内 |
| **P0** | **防误触保护期**：战斗结束切入 `revive` / `shop` / `result` 瞬间，摇杆松手极易误点激励视频按钮 | `PatrolCampaignUi.guardTouches(ms)`（进入结算/急救/商店锁 280–320 ms，在 `pixelBtn` 统一拦截） |
| **P1** | **全页广告取消/无填充可见反馈**：任何入口提前关闭视频或无填充时，必须在当前页有明确提示，不可静默无反应 | `PatrolCampaignUi.showToast(...)` 全局顶层绘制（覆盖急救、升级、商店、出勤、结算全 5 处点位） |
| **P1** | **无广告环境干净隐藏**：未配广告位时隐藏全部广告入口，不留空框、不报异常，主流程可独立通关 | `engage.hasRewardedAd` 门控 + `miniGameEngage.ts` |
| **P1** | **胶囊区与底部安全区零遮挡**：所有顶部标题/按钮受 `capsuleCeiling` 约束，底部受 `footer` 约束 | [M1Bootstrap.ts](../../../assets/scripts/cocos/M1Bootstrap.ts) `getSafeInsets()` |

---

## 6. 首包体积、分包与引擎模块裁剪

微信主包硬上限 **4 MB**（开启插件引擎分离后引擎不占主包），抖音首包同样要求极致精简以保首屏转化率。

- **引擎模块裁剪（[engine.json](../../../creator-m0/settings/v2/packages/engine.json)）**：
  - `nightShift2D` 仅保留实际使用的 11 个模块：`2d / affine-transform / audio / base / custom-pipeline / gfx-webgl / gfx-webgl2 / graphics / mask / profiler / ui`。
  - 严禁开启未使用的 `3d / physics* / spine / dragon-bones / tiled-map / particle* / animation / rich-text / tween / video / webview`。
- **按章分包**：4 份构建配置统一使用 `campaign-ch01`～`campaign-ch04` 的 `subpackage` 分包，首屏只加载首页底图与核心 UI。
- **微信发布进阶项**：在微信公众平台开通「Cocos 引擎插件」后，可将 `creator-m0/build-campaign-wechat-release.json` 中 `separateEngine` 切为 `true`，进一步释放 ~2 MB 主包空间；在微信小游戏后台开启 **iOS 高性能模式（WKWebView + JIT）**，可让 iOS 肉鸽大波次 JS 性能提升 3–5 倍。

---

## 7. 改动后必跑校验清单

执行命令前确认使用 Node 22（含 `stripTypeScriptTypes`）：

```bash
# 1. 热路径回归扫描：确保 cocos 渲染热循环未重新引入内联 new Color(
rg "new Color\(" assets/scripts/cocos/

# 2. 双端类型检查 + 同步检查 + 全量单元测试
npm run typecheck
npm test

# 3. 数值/战斗 headless 仿真回归
npm run sim
```

真机回归须额外按 [上线前人工核验清单](../../../docs/PRE-LAUNCH-CHECKLIST.md) 实测：首页静置 3 分钟机身温升、第 12 波同屏满怪帧率、来电/语音中断后 BGM 恢复、阵亡弹急救防误触、以及低端机 45 FPS 流畅度。
