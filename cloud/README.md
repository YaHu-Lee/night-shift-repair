# 战役云档和广告验证

本地战役档支持独立的账号命名空间。云档只备份通关记录、首通工具和已换蓝图。当前工单、凭证、整备和复活次数留在设备本地。账号切换后会丢弃上一账号的待处理回包。

## 云档

在 `Campaign.scene` 的战役组件填写 `cloudEnvId` 与 `cloudServiceId`。抖音环境创建服务后，维修站显示「云档」入口，玩家可以选择只加载账号档案，或同时导入本机游客解锁。回到游客档会解除本机绑定。

在通过资格审核的抖音 AppID 对应开发环境创建云函数服务和 `campaign_progress` 集合。集合的客户端权限设为「所有用户不可读写」。在函数服务面板新建 `campaign-progress.js`，粘贴 [campaign-progress.cjs](campaign-progress.cjs) 的内容，使部署路径为 `/campaign-progress`，使用函数环境提供的 `@open-dy/node-server-sdk`。该入口只走小游戏的 `callContainer`，保持域名访问关闭。平台把真实 AppID 和 openId 注入函数上下文，服务端为该组合派生档案键。首次备份用唯一键插入，后续用原子集合追加。客户端只核对服务端返回的档案键。[抖音云函数指南](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/function-service/cloud-service/cloud-function-service-manage/cloud-function-guide) · [云数据库服务端 SDK](https://developer.open-douyin.com/docs/resource/zh-CN/developer/tools/cloud/api-reference/cloud-database/server/sdk)

客户端通过 `createCampaignCloud(envID, serviceID)` 获取传输实例。交给 `CampaignCloudSession` 管理本机授权和账号边界。首次绑定用 `discover()` 确认账号，再向玩家明确询问是否绑定及是否导入游客进度。只有获准导入才将游客档的 `backup()` 传给 `connect(scope, backup)`。绑定后的局内保存使用 `binding.runPrefix`，切换账号时不得复用此前的档案或检查点。结单后可调用 `sync()`。回后台时调用 `invalidate()` 收起账号档，回前台调用 `restore()` 重新核对账号。网络故障可保留待同步状态，尚未重新确认账号时使用隔离的游客档。解除绑定清除本机授权，账号档和云端备份保留。

上线验收用同一抖音账号的两台设备同时提交两个不同的解锁，并核对一个账号仅有一份云档。模拟拉取途中切换账号、关闭网络和恢复连接，再核对迟到回包、待同步重试和三类永久解锁。仓库测试用模拟存储覆盖上述合并和隔离行为，实际服务的权限、真机请求和同账号并发仍需验证。

## 激励视频

`Campaign.scene` 的战役组件使用 `reviveAdUnitId`。在获准投放的项目中填写对应的激励视频单元。空配置会直接走本地结算。实际复活仍由游戏检查波次、失败类型和本局复活次数，只接受原生广告完整播放确认。[抖音小游戏激励视频](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/open-ability/ad/incentive-ads)

发布前分别测试完成观看、提前关闭、无填充和关闭时掉线。确认广告展示不会先提交凭证，复活回到波初且不会新增第二次复活机会，直接结算会提交一次收据。模拟事件测试仅覆盖客户端行为。

Creator 调试构建会输出 `[CAMPAIGN_QA]` 本地记录。`ad_eligible`、`ad_request`、`ad_shown`、`ad_completed` 和 `ad_revived` 可用同一 `adAttempt` 核对。广告展示与完成分别从原生回调确认，只有存档提交成功才记 `ad_revived`。完整播放优先读 `count`，旧客户端缺该字段时回退到 `isEnded`。调试记录不发送网络请求，也不包含账号或广告位。发布构建关闭该输出。[展示接口](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-show) · [关闭回调](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/api/javascript-api/ads/rewarded-video-ad/rewarded-video-ad-on-close)

## 发布包身份核对

从仓库根目录执行 `node scripts/check-campaign-distribution.mjs`。脚本读取实际构建目录，核对 Creator 版本、启动场景、主包与各章入口脚本、调试开关、竖屏和分包大小，报告 AppID、广告位和云档在产物内的配置状态。也可传入其他构建目录。报告的 SHA-256 对应目录内的相对路径和文件内容，可将预览证据和后续真机证据对应到同一份包。项目文件写入 AppID 后重新计算，因为包内容已经变化。[Cocos 抖音构建说明](https://docs.cocos.com/creator/3.8/manual/zh/editor/publish/publish-bytedance-mini-game.html) · [抖音小游戏分包限制](https://developer.open-douyin.com/docs/resource/zh-CN/mini-game/develop/guide/basic-function/subpackages/introduction)

使用真实项目联调前，将 `NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID` 设置为目标项目 AppID，再执行 `node scripts/check-campaign-distribution.mjs --require-platform`。严格检查要求产物 AppID 匹配、编译后的启动场景包含广告位和两项云档配置，报告只显示配置状态。测试 AppID 可以验证资源和本地玩法。真实广告回调、同账号双端同步和设备性能仍需在对应 AppID 的正式测试位采证。
