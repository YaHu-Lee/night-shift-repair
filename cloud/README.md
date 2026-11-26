# 存档、激励视频与双端发布包核验

## 本地存档与云档合并

默认四章巡线将工坊档案、当前出勤和最近一次结算收据一起写入 `night-shift.patrol.save` 的 A/B 双槽。Web 使用当前来源的 `localStorage`，微信和抖音使用各自的同步存储接口。读取时校验 FNV 校验和、版本与字段，优先选最新有效记录。战斗从当前波开头恢复，整备恢复到最后一次成功保存的操作。

`PatrolLocalSave` 是版本 4 的 JSON 数据结构。`saveId` 标识一份本地档案，`revision` 记录该档的本地修订号。每次出勤有独立的 `runId`。开局如携带需消耗凭证的「班前特供」，通过 `PatrolStorage.startRun()` 将扣凭证与写入新局快照合并为单次原子提交，避免写盘失败白扣凭证。结算先保存终局，再将奖励、`lastSettledRunId` 和空出勤记录一并提交。程序重启时会补办待结算出勤。跨设备云端同步时可调用 `mergeWorkshopProfiles(local, remote)`（位于 `assets/scripts/roguelite/engagement.ts`）对章节首通、危急印章、工装印记、全局天赋、无尽最高波次与免广工牌做单调无损合并。[格式与结算实现](../assets/scripts/roguelite/persistence.ts) · [四章巡线架构说明](../docs/PATROL-ARCHITECTURE.md)

### 抖音云函数参考

在通过资格审核的抖音 AppID 对应开发环境创建云函数服务和 `campaign_progress` 集合，集合的客户端权限设为「所有用户不可读写」。在函数服务面板新建 `campaign-progress.js`，参考 [campaign-progress.cjs](campaign-progress.cjs) 部署到 `/campaign-progress`，使用 `@open-dy/node-server-sdk`，仅通过小游戏 `callContainer` 调用并关闭公网域名访问。在 `Campaign.scene` 的组件属性中填写 `cloudEnvId` 与 `cloudServiceId`。

## 激励视频与平台留存能力

在 `creator-m0/assets/scenes/Campaign.scene` 的战役组件填写当前项目的激励视频广告位。微信使用 `wechatReviveAdUnitId`，调用 `wx.createRewardedVideoAd`。抖音使用 `reviveAdUnitId`，调用 `tt.createRewardedVideoAd`。所有广告均由 `assets/scripts/platform/miniGameEngage.ts` 统一封装为 5 个自愿点位（无强制插屏、无战斗 Banner）：

- `revive`：阵亡急救续班（1 次/局；普通波满血回波初，首领波原地清屏回 60% 血并护体 2 秒保留首领残血）；
- `levelup_extra`：升级 4 选 1 再多拿一项（1 次/局）；
- `shop_supply`：波间应急调拨 `+20 零件 + 1 次免费翻箱`（2 次/局）；
- `prep_supply`：出勤免费带班前特供或抢先试用未解锁工装一班（2 次/日）；
- `result_double`：结单基础凭证翻倍，不含首通里程碑与急单奖金（3 次/日、1 次/局）。

当前平台未填写广告位或 SDK 不支持时，所有广告按钮自动隐藏，主流程照常可用；浏览器调试构建可附加 `?mockAd=1` 本地验证全部点位交互与频控。`miniGameEngage.ts` 同时封装抖音侧边栏复访检测与跳转（`sidebar_card` / `navigateToScene`）以及微信／抖音结算晒战报（`shareAppMessage`）。

微信在初次展示失败时尝试加载后再展示一次，激励判定要求关闭回调明确返回 `isEnded: true`。抖音按原生 `count` 判定激励，缺少该字段时读取 `isEnded`。提前关闭或广告暂时不可用时，提示未发放且不扣次数，玩家可重试或直接继续。

## 发布包身份核对

Creator 3.8.8 从 `Campaign.scene` 分别构建竖屏小游戏，每端包含 `resources` 与四个章节分包（`campaign-ch01`～`campaign-ch04`）。

| 平台 | Creator 构建配置 | 本地产物 | 预期 AppID 环境变量 |
| --- | --- | --- | --- |
| 微信 | `creator-m0/build-campaign-wechat-release.json` | `creator-m0/build/wechatgame-campaign-release` | `NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID` |
| 抖音 | `creator-m0/build-campaign-release.json` | `creator-m0/build/bytedance-mini-game-campaign-release` | `NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID` |

从仓库根目录分别执行 `node scripts/check-campaign-distribution.mjs --platform wechat` 和 `node scripts/check-campaign-distribution.mjs --platform douyin`。正式联调时在对应 Creator 构建任务填写正式 AppID，在场景填写对应广告位，设置环境变量并加上 `--require-platform` 核对身份与广告位配置。
