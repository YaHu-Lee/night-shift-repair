# 《夜班修理局》上线就绪评估与待办

2026-11-28 的实际构建、自动回归与待验范围已记入[本轮 Web E2E 记录](WEB-E2E-2026-11-28.md)。以下保留 11 月 27 日的核查快照。

> 核查时间：2026-11-27 23:22（Asia/Shanghai）
> 代码基线：`d85e43a`（当前 HEAD `820c7c5`，仅更新上线前人工清单）
> 配套文档：[上线前人工核验清单](PRE-LAUNCH-CHECKLIST.md)（58 条用例 + 4 个真机组合，当前全部未勾选）

## 一、结论

功能、内容与自动验证已就绪，项目处于 **发布包配置／构建 → 平台提审 → 真机人工验收** 阶段。距可提审还差五类工作：

1. 修复发布包校验脚本与真实 Creator 3.8.8 构建产物的兼容问题（当前脚本会直接失败）。
2. 补齐平台身份、广告位与云档范围配置，并用最终配置重新构建四份包。
3. 微信发布包尚未构建；Web 调试／试玩包落后于最新代码。
4. 58 条人工用例和 4 个真机组合仍是 0 完成。
5. 平台提审材料（软著、备案、隐私、类目资质、截图／视频等）尚未在仓库或流程中准备。

## 二、当前进度

### 已完成（代码与内容）

- 四章 × 12 波巡线、5 档危急、5 套工装、10 把悬浮武器、33 件工坊模块、5 个激励视频点位、每日签到／急单／港区无尽。
- Web／微信／抖音三端平台适配、A/B 双槽本地存档 v4 与旧档迁移、像素美术与音频全量接入、双端性能／内存／音频中断优化。
- 四份 Creator 构建配置、发布包校验脚本、云函数与合并逻辑样例、上线前人工核验清单。
- 核查时工作树干净（仅 `outputs/` 未跟踪）；`main` 与 `origin/main` 同步。

### 自动验证（实跑结果）

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck`（纯 TS 内核） | ✅ 通过 |
| `npm test`（72 项，含双份脚本同步、存档、音频、发布包夹具） | ✅ 72/72 通过 |
| `npm run sim`（4 章 × 5 工装 × 20 局） | ✅ 正常输出；Ch01 19/20、Ch02 18/20、Ch03 19/20、Ch04 15/20 |
| `npx tsc -p creator-m0/tsconfig.json --noEmit --skipLibCheck` | ✅ 通过（依赖本机 Creator 生成的 `temp/`） |
| 源码 `TODO`/`FIXME` 残留 | ✅ 0 |

### 构建产物现状

| 产物 | 状态 |
| --- | --- |
| 抖音发布包 `bytedance-mini-game-campaign-release` | 已构建（11-27 22:47，Creator 3.8.8）；主包 3,535,942 B（≤4 MB）、总计 10,233,196 B（≤20 MB）、四章分包齐全、音频／图片／脚本指纹均通过**临时修正场景解析后**的结构校验；包指纹 `ecd77e5f…` |
| 微信发布包 `wechatgame-campaign-release` | ❌ 未构建 |
| Web 调试包 `campaign-web-review` | 已构建（11-27 00:41，debug 构建）；早于最新代码提交 `d85e43a`（11-27 02:42） |
| Web 试玩包 `campaign-web-playtest` | ❌ 未构建 |

### 发布身份与变现配置

| 项 | 状态 |
| --- | --- |
| 微信 AppID | 构建配置仍为测试占位 `wx6ac3f5090a6b99c5`，需替换正式 AppID |
| 微信激励广告位 | 场景 `wechatReviveAdUnitId` 为空 |
| 抖音 AppID | 构建产物 `project.config.json` 为 `tt17e0615d899d771002`；仓库构建配置中无 appid 字段，来源与正式性需确认 |
| 抖音激励广告位 | 场景 `reviveAdUnitId` 为空 |
| 抖音云服务 | 场景 `cloudEnvId`／`cloudServiceId` 为空；客户端仅有字段与 `mergeWorkshopProfiles`，尚未接 `callContainer` 调用 |

## 三、上线前 TODO

### P0 · 发布阻塞

- [ ] **P0-1 修复发布包校验脚本对真实构建场景的解析**。`node scripts/check-campaign-distribution.mjs --platform douyin` 目前在非严格模式即报 `Expected exactly one campaign component in the built scene`。根因：Creator 3.8.8 构建后的场景类表只序列化与默认值不同的字段，`campaignMode`／`fullRun`（默认 `true`）和空广告位／云档字段被省略，而 [check-campaign-distribution.mjs](../scripts/check-campaign-distribution.mjs) 的 `campaignProperties()` 要求类属性表必须包含 `campaignMode`。修复：缺失字段回退类默认值，并补一条基于真实构建场景的回归用例；修复后重跑 PKG-02。
- [ ] **P0-2 确定云档上线范围**。若首发承诺跨设备恢复：接 `callContainer` → `campaign_progress` 云函数，用 `mergeWorkshopProfiles` 合并，双设备实测；若不做：同步调整严格校验（当前 `--require-platform` 对抖音强制要求两项云服务 ID）并在宣传／商店文案中不承诺跨设备。
- [ ] **P0-3 填平台身份与广告位并重建四份包**。微信正式 AppID、微信／抖音激励广告位（广告位需先开通流量主／广告能力）；确认抖音 AppID 为正式 AppID。用 Creator 3.8.8（本机 `D:\CocosEditors\3.8.8`）按 [构建说明](COCOS-EDITOR.md) 重建 Web 调试、Web 试玩、微信、抖音四份包。
- [ ] **P0-4 发布包身份核对**。设置 `NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID` / `NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID`，对两端执行 `node scripts/check-campaign-distribution.mjs --platform wechat --require-platform` 和 `--platform douyin --require-platform`；记录两端包体、分包大小、`packageSha256` 与"真机验证未执行"状态。
- [ ] **P0-5 人工验收全量执行**。按 [上线前人工核验清单](PRE-LAUNCH-CHECKLIST.md) 完成 58 条用例与微信／抖音 × iOS／Android 四个真机组合；优先 PKG-01/02/03，其次新手链路、四章与难度、十把武器表现、广告与留存、存档／竖屏／性能。真机广告、切后台／音频中断、iOS 长局内存、低端 Android 满波帧率必须用真实客户端验证。
- [ ] **P0-6 平台提审与合规材料**。准备并核对：软著（名称与游戏名一致）、微信小程序备案与抖音小游戏备案、用户隐私保护指引与首次启动隐私弹窗、实名认证／防沉迷要求、游戏类目与资质、自审报告、平台图标／封面／截图（首张含健康游戏忠告、适龄提示、游戏名称）／15–30 秒玩法视频、抖音侧边栏能力与云服务资格（如使用）。参考：[抖音小游戏资质审核](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/guide/contactus/endowments)、[抖音小游戏备案申报](https://partner.open-douyin.com/docs/resource/zh-CN/mini-game/guide/minigame/game-filing-application-works)、[微信版本审核](https://developers.weixin.qq.com/minigame/introduction/guide/bbsh)、[微信隐私合规开发指南](https://developers.weixin.qq.com/minigame/introduction/guide/privacy.html)。当前客户端不采集账号个人信息、存档仅在本地（设备信息仅用于画面适配与性能分级）；隐私指引按平台模板填写，若接入云档须申报对应字段。
- [ ] **P0-7 确认广告上线范围**。若广告位在提审前无法开通，按 AD-01 验证"未配广告位时入口全部隐藏、主流程可通关"并以此版本提审；广告位就绪后再走 AD-02～08 真机验证。

### P1 · 工程与流程

- [ ] **P1-1 修复 CI**。[m0.yml](../.github/workflows/m0.yml) 的 PR 步骤调用 `node scripts/campaign-balance.mjs`，该文件已在 `f9f594e` 删除，PR 检查必然失败；改为 `npm run sim` 或移除该步，并顺带更新 workflow 名称。
- [ ] **P1-2 把 Cocos 层类型检查纳入发布前步骤**。`npm run typecheck` 只覆盖 `platform`／`roguelite`；Cocos 层依赖 Creator 生成的 `temp/tsconfig.cocos.json`，本机补跑已通过。建议写入发布 runbook，或在 CI 中保留 Creator 工程缓存后执行。
- [ ] **P1-3 处理文案审核表**。`outputs/01a218c2-…/夜班修理局-文案审核一览表.xlsx` 共 939 条文案 + 38 条资料字段，`审核结果` 列全部为空（处理分布：保留 168／改写 751／新增 18／取消显示 2）。完成人工复核并决定归档位置；`outputs/` 目前未跟踪也未忽略，需入库或加入 `.gitignore`。
- [ ] **P1-4 文档收尾**。[art/pixel/README.md](../art/pixel/README.md) 仍写"3D 对照构建从 `Campaign3D` 场景进入"，场景已随 `f9f594e` 删除；[docs/ASSET-SOURCES.md](ASSET-SOURCES.md) 与 `art/workshop/source/combat/prompts.md` 各有 1 个失效相对链接，需修正或删除过时段落。
- [ ] **P1-5 微信发布进阶项**。确认是否开通 Cocos 引擎插件以切换 `separateEngine: true`；在微信小游戏后台确认 **iOS 高性能模式** 配置（DEV-11）。
- [ ] **P1-6 固化发布身份来源**。抖音构建配置未包含 AppID，构建产物中的 AppID 由 Creator 构建面板／缓存带入；把"构建面板填写 AppID → 构建 → 跑 PKG-02 → 记录指纹"写入发布 runbook，避免换机不可复现。
- [ ] **P1-7 清理旧构建目录**（可选）。`creator-m0/build/` 下保留多份历史 QA 包（约 160 MB），发布前只保留最终候选包。

### P2 · 上线后

- [ ] **P2-1 免广告工牌内购**：`adFreePass` 已预留，5 个广告点位可一键直领；首发不做则明确不宣传。
- [ ] **P2-2 云档跨设备恢复**（若首发不做）。
- [ ] **P2-3 平衡观察**：仿真中第 4 章胜率 15/20（其余章 18–19/20），结合上线数据再看难度曲线。
- [ ] **P2-4 数据与留存看板**：优先用双端后台数据；若自建埋点需同步补充隐私申报。

## 四、建议执行顺序

1. 修 P0-1 校验脚本并补回归用例（当天可完成）。
2. 定 P0-2 云档范围 → 填 P0-3 身份／广告位 → 重建四份包 → 跑 P0-4。
3. 重建 Web 调试包，桌面走查 + 人工用例；同时并行准备 P0-6 提审材料。
4. 四个真机组合验收 → 上传体验版 → 提审。

## 五、可复现核查命令

```sh
npm run typecheck
npm test
npm run sim
npx tsc -p creator-m0/tsconfig.json --noEmit --skipLibCheck
node scripts/check-campaign-distribution.mjs --platform douyin   # 当前会因 P0-1 失败
node scripts/check-campaign-distribution.mjs --platform wechat   # 当前无微信构建产物
```

> 本文件为自动核查快照；人工验收状态以 [PRE-LAUNCH-CHECKLIST.md](PRE-LAUNCH-CHECKLIST.md) 为准。
