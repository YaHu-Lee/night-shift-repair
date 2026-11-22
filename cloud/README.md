# 战役云档和双平台广告验证

微信和抖音分别使用各自的本地存档接口。抖音支持独立的账号云档，备份通关记录、首通工具和已换蓝图。当前工单、凭证、整备和复活次数留在设备本地。账号切换后会丢弃上一账号的待处理回包。微信使用本机存档。

## 云档

在 `Campaign.scene` 的战役组件填写 `cloudEnvId` 与 `cloudServiceId`。抖音环境创建服务后，维修站显示「云档」入口，玩家可以选择只加载账号档案，或同时导入本机游客解锁。回到游客档会解除本机绑定。

在通过资格审核的抖音 AppID 对应开发环境创建云函数服务和 `campaign_progress` 集合。集合的客户端权限设为「所有用户不可读写」。在函数服务面板新建 `campaign-progress.js`，粘贴 [campaign-progress.cjs](campaign-progress.cjs) 的内容，使部署路径为 `/campaign-progress`，使用函数环境提供的 `@open-dy/node-server-sdk`。该入口只走小游戏的 `callContainer`，保持域名访问关闭。平台把真实 AppID 和 openId 注入函数上下文，服务端为该组合派生档案键。首次备份用唯一键插入，后续用原子集合追加。客户端只核对服务端返回的档案键。[抖音云函数指南](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/cloud-service/cloud-function-service-manage/cloud-function-guide) · [云数据库服务端 SDK](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/api-reference/cloud-database/server/sdk)

客户端通过 `createCampaignCloud(envID, serviceID)` 获取传输实例。交给 `CampaignCloudSession` 管理本机授权和账号边界。首次绑定用 `discover()` 确认账号，再向玩家明确询问是否绑定及是否导入游客进度。只有获准导入才将游客档的 `backup()` 传给 `connect(scope, backup)`。绑定后的局内保存使用 `binding.runPrefix`，切换账号时不得复用此前的档案或检查点。结单后可调用 `sync()`。回后台时调用 `invalidate()` 收起账号档，回前台调用 `restore()` 重新核对账号。网络故障可保留待同步状态，尚未重新确认账号时使用隔离的游客档。解除绑定清除本机授权，账号档和云端备份保留。

上线验收用同一抖音账号的两台设备同时提交两个不同的解锁，并核对一个账号仅有一份云档。模拟拉取途中切换账号、关闭网络和恢复连接，再核对迟到回包、待同步重试和三类永久解锁。仓库测试用模拟存储覆盖上述合并和隔离行为，实际服务的权限、真机请求和同账号并发仍需验证。

## 激励视频

在 `creator-m0/assets/scenes/Campaign.scene` 的战役组件填写当前项目的激励视频广告位。微信使用 `wechatReviveAdUnitId`，调用 `wx.createRewardedVideoAd`。抖音使用 `reviveAdUnitId`，调用 `tt.createRewardedVideoAd`。当前平台未填写广告位或 SDK 不支持时，结算流程照常可用。 [微信小游戏 SDK 类型](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/types/wx/lib.wx.api.d.ts#L14117) · [抖音小游戏激励视频](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ad/incentive-ads)

微信在初次展示失败时尝试加载后再展示一次，复活要求关闭回调明确返回 `isEnded: true`。抖音按原生 `count` 判定激励，缺少该字段时读取 `isEnded`。提前关闭或广告暂时不可用时，玩家可以重试或直接结算。完整奖励在本局检查点提交成功后生效。一局最多复活一次，加班挑战无广告复活。 [微信小游戏 SDK 示例](https://github.com/wechat-miniprogram/minigame-api-typings/blob/master/test/game.test.ts#L1204) · [抖音关闭回调](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-on-close)

发布前在两个正式 AppID 的真机测试中分别覆盖看完、提前关闭、无填充、观看时切后台和返回。确认成功复活回到波初，结算只提交一张收据。Creator 调试构建会输出本地 `[CAMPAIGN_QA]` 记录，可用同一 `adAttempt` 核对 `ad_eligible`、`ad_request`、`ad_shown`、`ad_completed` 和 `ad_revived`。发布构建关闭该输出。

## 发布包身份核对

Creator 3.8.8 从同一个战役场景分别构建竖屏小游戏。每端都有四个章节分包。 [Cocos 小游戏分包](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/subpackage.html)

| 平台 | Creator 构建配置 | 本地产物 | 预期 AppID 环境变量 |
| --- | --- | --- | --- |
| 微信 | `creator-m0/build-campaign-wechat-release.json` | `creator-m0/build/wechatgame-campaign-release` | `NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID` |
| 抖音 | `creator-m0/build-campaign-release.json` | `creator-m0/build/bytedance-mini-game-campaign-release` | `NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID` |

从仓库根目录分别执行 `node scripts/check-campaign-distribution.mjs --platform wechat` 和 `node scripts/check-campaign-distribution.mjs --platform douyin`。脚本读取实际产物，核对启动场景、调试开关、竖屏、主包、分包、脚本和资源，并提供目录 SHA-256。也可传入其他构建目录，方便核对手工导出的包。 [Cocos 微信构建说明](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-wechatgame.html) · [抖音小游戏分包限制](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)

正式联调时，在对应 Creator 构建任务填写正式 AppID，在场景填写对应广告位，重新构建。设置表中的环境变量并给校验命令加 `--require-platform`，核对包中 AppID 和当前平台广告位。抖音严格检查同时核对两项云档字段。报告只显示配置状态，实际投放回调由对应客户端真机验证。
