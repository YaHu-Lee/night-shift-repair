# 战役实测计时与小样记录

用同一发布候选版本记录人工验收。记录留在本机，只填写测试者代号、设备型号和观察结果。工具读写指定的 JSON 文件。[开发计划验收口径](CAMPAIGN-DEVELOPMENT-PLAN.md#七验收与改数顺序)

浏览器候选使用 Creator 3.8.8 和 `creator-m0/build-campaign-web-playtest.json` 构建。该配置关闭调试并直接启动战役。构建后在仓库根目录运行 `node scripts/serve.mjs creator-m0/build/campaign-web-playtest`，用浏览器打开命令显示的本机地址。真机计时另填对应平台的包版本。

```sh
node scripts/campaign-human-acceptance.mjs init campaign-observations.json 8
node scripts/campaign-human-acceptance.mjs timing campaign-observations.json
node scripts/campaign-human-acceptance.mjs cohort campaign-observations.json
node scripts/campaign-human-acceptance.mjs check campaign-observations.json
```

`init` 生成空表，可选 8–12 人，已有文件会保留。填写 `build` 为本次构建版本。两段实测可分别校验，`check` 同时检验。输出中的 `passed` 表示所选门槛是否通过。退出码 `0` 表示通过，`1` 表示有门槛未达到，`2` 表示文件缺项或数据不一致。

## 两条完整计时路线

两名熟悉玩法的测试者各走一条。时长以秒记录，最多保留三位小数。正序记录 01–20 全部首通，标注实际设备和观察到的主要卡点。用新档、正常规则、无广告、不刷旧关，跳过可跳剧情。基础线 `basic` 全程扳手起手，解锁线 `unlocks` 使用已解锁首通武器，首关从扳手开始。两条路线都可用正常局间商店。

| 字段 | 实测记录 |
| --- | --- |
| `elapsed` | 该关从首次出发到首次胜利结单的总秒数。用总表计时或本地录像时间码核对 |
| `battle` | 成功尝试的有效战斗时间。战斗与开闸、护送等动作重合时，记到这一栏一次 |
| `objectiveOnly` | 成功尝试里独立于战斗的有效任务操作 |
| `activeShop` | 成功尝试里实际比较、选择和操作波间整备的时间 |
| `failedAttempts` | 失败尝试及重新开始所耗时长 |
| `loading`、`pausedOrBackground` | 成功尝试中加载、暂停和切后台的时长 |
| `idleWaiting`、`otherNonGameplay` | 成功尝试中脱离操作的空等及其他非玩法时长，含可跳对白和菜单停留 |
| `cleared`、`note` | 观察到首通才填 `true`。用简短文字记重复翻车的任务或不清楚的提示 |

失败尝试内的时间全部记入失败栏一次。成功尝试各项采用互斥时段，合计须等于 `elapsed`。两条路线分别报告逐章和全篇的计入、排除时长。取有效总时长较短的一条，至少 **7,200 秒**才通过。失败、重试、加载、暂停、挂机、非玩法等时间统一排除。

### 用时间码填写单关

结合本地录屏或同一计时器，记下首次出发时刻、每次活动类别切换和首通结单时刻。每条 `atMs` 是非负整数毫秒，来自同一连续时间轴，首条可大于零。每个 `bucket` 表示从本条到下一条的整段活动，使用上表的时间类别。最后一条只填 `atMs` 和 `end: true`。失败尝试整段标为 `failedAttempts`，放在计入的成功尝试开始前。看到首通结单后在关卡记录上单独确认 `cleared: true`。

下面仅演示文件结构和单位。

```json
{
  "stage": "01",
  "cleared": true,
  "markers": [
    { "atMs": 18420, "bucket": "failedAttempts" },
    { "atMs": 46115, "bucket": "loading" },
    { "atMs": 49000, "bucket": "battle" },
    { "atMs": 79018, "bucket": "activeShop" },
    { "atMs": 88607, "bucket": "battle" },
    { "atMs": 357510, "end": true }
  ]
}
```

```sh
node scripts/campaign-human-acceptance.mjs stage-row stage-01-markers.json
```

命令在标准输出预览单关记录，可复制到对应路线的 `stages`。原始文件保持原样。时间码严格递增，每段只归一类。工具按毫秒累计各桶、各关及全路线时长，再以秒显示报告。

## 8–12 人无广告小样

每人记录一次首章试玩。至少半数初接触肉鸽；先观察玩家自行操作。首店出现在屏幕后，让玩家说出想买或保留什么以及理由；01 结单后给玩家自行选择，观察他是否进入 02。布置过的「请开下一关」记为 `started02`，`started02Voluntarily` 填 `false`。用 `cohort.noAds` 确认整组使用无广告版。

| 观察字段 | 分母 | 门槛 |
| --- | --- | --- |
| `newToRoguelikes` 初接触肉鸽 | 全部志愿者 | ≥1/2 |
| `wave1Unprompted` 无提示过首波 | 全部志愿者 | ≥3/4 |
| `explainedFirstShop` 能说明首店意图 | 已看到首店的人，记录 `sawFirstShop` | ≥2/3 |
| `started02Voluntarily` 主动开 02 | 已首通 01 的人，记录 `cleared01` | ≥1/2 |
| `triedArcGunIn02` 在 02 实际使用电弧枪 | 已开始 02 的人，记录 `started02` | 报告试用率 |

每项都会输出成功人数与适用人数。适用人数为零时，`rate` 为 `null`，对应有门槛的项目无法通过。实际设备的帧率、广告和云档按项目验收记录单独记录。[战役验收记录](CAMPAIGN-SLICE-PLAYTEST.md)

## 章末剧情复述

在 05、10、15、20 的首次胜利结单后，请到达该章末的玩家用自己的话回答。先记下回答，再对照核对要点。计时路线的复述安排在结单后、下关出发前，问答及记录时间不计入有效玩法时长。

| 结单 | 问题 | 观察员核对要点 |
| --- | --- | --- |
| 05 | 城里为什么断了电？ | 中央调度主动切电，把各区电力转向零号线路。 |
| 10 | 电池交给了谁？第一份授权从哪来？ | 医院和泵站签收电池。医院现场交接终端签发第一份授权。 |
| 15 | 第二份授权从哪来？和上一份有什么区别？ | 广播发出真实求救后，东岸、西岸和北街回传联络授权。第一份来自医院交接。 |
| 20 | 核心停机后，谁掌管各区的供电？ | 各街区接管本地供电，中央的强制切电停止。 |

用测试者代号和结单关号记录回答原意、说到或遗漏的要点，以及未回答的情况。汇总每个问题时列出到达对应章末的人数、给出回答的人数和说到各要点的人数。该记录用于定位剧情理解问题，单独保留在本机的实测记录中。[战役剧情原文](../creator-m0/assets/scripts/campaign/CampaignCatalog.ts)
