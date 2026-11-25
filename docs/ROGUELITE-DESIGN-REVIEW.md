# 《夜班修理局》肉鸽设计走查

下一轮的逐关战力、06 两种购装的实战反馈、结单入口对照和 10／17／20 的遭遇验收，见[普通战役体验策划案](CAMPAIGN-EXPERIENCE-DESIGN.md)。

## 首轮改动与复测

下面的走查记录保留了改动前的货架和实战数据。目前可玩版本已完成三项改动。

- 第 3、5 次整备的配件候选超出货架容量时，按本局种子抽取武器。把同六把武器倒序安装，测试中每个种子看到相同的一排商品。原调查的四个中后期站点里，新版有 46 场在末店前已装满六把，各槽位的专属配件分别出现 22、27、23、24、20、22 次。旧版对应次数为 48、48、48、0、0、0。
- 06 接驳仓用扳手起手，第二次整备可花 5 个零件选回扫飞轮或液压钉枪。通用商品可照常购买。选定后换货、关掉再进入，都保留本店选择。飞轮延长扳手射程 12 像素，一挥命中两台后，下一挥扫过更宽的弧线，每个接触目标多受 2 点伤害。结单列出实际打出的大回扫次数。第三波从同侧成组入场，击倒总数仍是 25 台。
- 09 货梯井第四波的增援在满体力、场内最多余一台敌机、没有敌弹和出场预警时，连续留出 18 步喘息后可提前入场。受伤后沿用原间隔。放开购买组该波中位数从 37.6 秒降到 36.5 秒，中位受伤仍是 0；优先改扳手组从 45.0 秒到 45.0 秒，中位受伤均为 4.5。这里对比的是前后两个完整版本，含货架变化。

接驳仓用相同的 12 个种子对比两种购买选择。主动靠到敌群侧面时，飞轮在第三波有 8 个种子清得更快，中位数为 15.7 秒，受伤中位数为 0；钉枪为 16.0 秒和 1 次。按普通就近走位时，钉枪略快，分别为飞轮 16.8 秒、钉枪 16.4 秒。两套购买策略继续打到 Boss，钉枪路线中位数为 9.1 秒，飞轮路线为 13.9 秒。后面三家店的货物和购买也会随构筑变化。该样本支持两种打法各有适用场合；玩家能否自行发现聚怪机会，留给真人试玩。

全战役三档购买策略合计 1,440 场通关，20 个关卡各档的首领出招种数 P10 至少为 2。另用更节制的商店实验跑六站共 216 场，214 场通关，两次失败仍发生在 20。自动测试 219 项通过。Creator 浏览器在 360×640、393×852 各走完 20 站，分别触控买下飞轮和钉枪。跨站带装备仍是后续试玩假设。

复跑普通走位用文末命令，覆盖 02、06、09、10、15、20；用 `node scripts/campaign-shop-study.mjs --group` 单独复核 06 聚怪走位的 36 场。[购买与战斗实验](../scripts/campaign-shop-study.mjs)

## 改动前的走查

**第一件值得做的事，是让第 06 关可以用两种走位打出两种好成绩。** 一种玩法是添武器、边退边清场。另一种是把电弧扳手改好，把敌机引成一团，迎上去一挥多中，再从缺口撤走。玩家在商店按下购买时，应当能想象自己下一波会怎么走。接驳仓正好是第一次有六种武器可买的关卡，又处在章首，适合做这个实验。

## 在当前版本里发生了什么

复核范围是四章、20 张普通首通工单。每站从一把起手武器开始，有五个清敌波、五次整备和一场 Boss 战。武器池、训练和维修站进度跨站保留，局内装好的整套武器不跨站。现有设计已经让 09 的货梯夹击、10 的钢缆和 20 的核心换招各有辨识度。正式首通走纯战斗规则，早期文档中的护送、开闸或守点不能算作这版首通里的玩法。[战役入口](../assets/scripts/campaign/CampaignCatalog.ts) · [开局和波间状态](../assets/scripts/m1/Run.ts) · [逐关配置](../assets/scripts/campaign/CampaignWaves.ts)

### 同一个种子，把钱花在不同地方

本次新跑 **180 场**。在 02、06、10、15、20 各取 12 个种子，每个种子跑三种策略。全部走电弧路线、扳手起手，按首通顺序发放解锁和维修站补给，不购买训练。走位控制器相同，每七步重新选目标，会靠敌、避弹和躲开首领危险区。每个新波都用当前扳手射程，装备变化会影响实际走位。种子相同，后续商店随已装备物品改变，这是玩家选择产生的后果。[复现实验](../scripts/campaign-shop-study.mjs) · [走位控制器](../scripts/campaign-balance.mjs)

- **添武器**与**改扳手**每店都只买一件，用相同购买次数对比。两者首店都选推荐件。之后前者优先添武器，后者遇到能装进空槽的扳手件先买，缺货再添武器。两条策略都没有换货。
- **放开购买**优先添武器，能装进空槽的继续买，然后支付正常费用换一次货、继续买。三种策略都经过正式购买与碰撞接口，都不会拆掉旧配件。每店一件仅是前两组的实验条件。
- 添武器和放开购买各赢 60/60，改扳手赢 58/60。两次失败都在 20 的第 5 波。下表只比较前两策略在同一种子双双通关的场次，秒数分别取各组中位数；最后一列是添武器与改扳手进入 Boss 时的武器数中位数。

| 工单 | 同种子双通关 | 前五波总秒数，添武器 / 改扳手 | Boss 秒数，添武器 / 改扳手 | 武器数 |
| --- | ---: | ---: | ---: | ---: |
| 02 地下泵房 | 12/12 | 182.3 / 183.3 | 12.2 / 11.5 | 2 / 2 |
| 06 接驳仓 | 12/12 | 162.1 / 166.5 | 9.3 / 14.8 | 5 / 3 |
| 10 封锁货场 | 12/12 | 195.3 / 200.9 | 14.4 / 20.5 | 5 / 3 |
| 15 广播主塔 | 12/12 | 190.0 / 193.6 | 14.6 / 21.2 | 5 / 3 |
| 20 中央调度台 | 10/12 | 213.6 / 220.3 | 18.6 / 27.8 | 5 / 3 |

**多添武器在中后期样本里同时赢得清群时间和打 Boss 时间。** 第 02 关给了一个反例，两种买法最后都是两把武器，改扳手的 Boss 时间还略短。最值得查的是武器池扩大之后，配件有没有自己的优势场景。当前控制器没有“故意把几台敌机引到扳手同一侧”的策略，不能据此判定熟练玩家改扳手一定吃亏。另查全战役已有的 960 场主样本和 480 场留出样本，06–20 标准购买组 360/360 场带满六把进 Boss。该组每店最多买两件且优先添武器，这个结果能证明填满很稳定，无法说明真人偏好。[现行战力基线及命令](CAMPAIGN-POWER-BALANCE.md)

### 首次进店时，钱足以买整排

放开购买组有 300 次进店、300 次换货。**300/300 次首次进店的余额都足以支付整排标价**，其中 277 次至少有两件商品各自有空槽可装。换过货后，足以支付新一排的降至 213/300。每局购买件数中位数为 21，结余中位数为 16.5 个零件。前两组限购条件下结余超过一百，不能用它单独诊断通胀。[货架生成、槽位和价格](../assets/scripts/m1/Equipment.ts) · [换货与扣款](../assets/scripts/m1/Run.ts)

| 第几次整备 | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 首次进店余额中位数 | 20 | 33.5 | 34.5 | 37.5 | 57 |
| 当排总价中位数 | 12 | 15 | 16 | 14 | 24 |

总价只衡量购买力。满槽、同一配件位竞争、持有武器和换货仍会约束选择。设计上要测试的是，玩家看到第二件也想买的商品时，是否有值得认真思考的理由留下它。全商店统一涨价会同时打到首店教学、低拾取玩家和换货，当前证据支持先动第二次整备的一个选择。

### 后装的三把武器，要等换货才看得到配件

这里有一处可以直接从实现解释的偏向。第 3、5 次整备会依照已装武器的顺序挑专属件，货架只容三件。放开购买组在 06、10、15、20 的 48 场里，第五次进店前都已装满六把。**48/48 排货架都给了第 1、2、3 把武器各一个配件，第 4、5、6 把各出现 0 次。** 买完能装的再换货，后三把对应配件分别出现 48、47、39 次。晚装武器并非缺少配件，它们往往要玩家再换一排才有机会。只根据购买率评估价值，会把排位靠后误读成玩家不喜欢。[配件入选顺序](../assets/scripts/m1/Equipment.ts) · [按购前装备顺序复核](../scripts/campaign-shop-study.mjs)

这项修订可独立于经济实验。首店继续保证路线推荐；后期把有适配件的武器先列成候选，再按种子抽取，给尚未见过高阶配件的武器更高机会。若保留一个起手武器位供玩家深改，其余位置也应覆盖副武器。验收时固定同六把、同配件解锁、同余额，只交换副武器装备顺序；跟踪每把武器在有合格候选的商店中出现的次数，再单列能装和实际购买。这样能辨别修掉了顺序偏向，还是单纯让好件更少见。

### 多出来的输出，在不同战斗里的回报不同

06 的两种限购打法打 Boss 相差约 5.5 秒，相对较慢打法约 37%，前五波合计只相差约 4.4 秒，约 3%。敌群按进场节拍和增援条件放出。在放开购买组，06 的前五波合计有 25.5 秒、10 有 30.4 秒，场上同时没有敌机、出场警告和敌弹，均取各自 12 场的中位数。这些时段包含拾取、重新站位和喘息，不能全当成浪费。应回看其中较长的间隔，分清玩家是在抢零件，还是已经站好、只能等。[敌群与增援逻辑](../assets/scripts/m1/Battle.ts) · [逐波实测脚本](../scripts/campaign-shop-study.mjs)

另核对了两条 Creator 竖屏路线的逐波记录。累加记录的战斗时钟，全 20 站约 **63.5 和 64.1 分钟**。自动路线会立即做决定，项目已有的 **120 分钟**门槛看的是熟练真人的有效战斗、任务操作和主动整备时间，目前仍需两条真人计时路线。若缺的是几十分钟有意思的决定，延长刷怪间隔会让这个缺口更大。[原定验收口径和计时表](CAMPAIGN-HUMAN-ACCEPTANCE.md)

## 改动顺序

### 1．先做接驳仓的两种打法

用现有普通 06 作对照。实验版第二次整备放一把当前已解锁的远程武器，以及一件只装在扳手上的试验配件。举例，**一次挥中两台，下一次回扫更宽**。让玩家花这次改装机会二选一，其余补给、后续商店、敌群、Boss 血量都维持对照条件。每站只试一次这样的选择。实现先复用连续碰撞里已经去重的命中目标，把下一挥的范围改在战斗域，弧光再读同一轨迹。[近战命中](../assets/scripts/m1/Battle.ts) · [动作轨迹](../assets/scripts/m1/WeaponMotion.ts)

用两段现有敌群兑现选择。在同侧挤进来的小群里，熟练玩家应能带怪、回扫、打开撤退缺口。面对分开的炮台，远程武器应能让玩家隔开距离先处理一台。验收同时记每挥命中两台以上的占比、炮台存活时间、角色受伤、清群和首领耗时。预期是两条路各有一个占优的遭遇。若改扳手仍全面吃亏，先查敌人间距、牵引能力和扳手实际接触率；只加伤害会掩盖空间问题。另用同价且不互斥的货架单独测一次，区分配件本身有趣和强制二选一带来的效果。

对玩家只写效果，例如“这一挥打中两台，下一挥扫得更宽”。下一挥生效时让回扫残影跟着锤头走，实际碰到的敌机分别闪一下。空挥没有命中反馈。战斗里仍是六把独立悬浮武器、固定槽位待机，近战每挥每台只算一次。

### 2．让普通波也能奖赏好操作

把 09 货梯井第四波当第二个样片。保留辨认南北两侧入口的第一组。第二组给两种解法，一侧是能被扳手同时扫到的近敌，另一侧是需要先让开射线的炮台。玩家快速清掉任一侧后，让下一组在一个短喘息后到场；受压时仍有原定的喘息和同屏上限。先离线试固定种子、固定击倒总数，并专看被夹在边缘的慢打法。初期仅随机调换两侧，首见敌人、可撤路线和一个稳定教学场面都由关卡作者指定。[遭遇设计](https://book.leveldesignbook.com/process/combat/encounter) · [固定房间模块教程](https://bfnightly.bracketproductions.com/chapter_35.html)

验收看最快与最慢四分之一各自的波长、最长无威胁间隔、受伤前是否还有可走的缝，以及新增的时间究竟花在走位还是等待。相同种子能重放出同一个入口顺序。若低配玩家受伤增加而高手只得到更多等待，就撤掉提前增援。20 站已有的波次预算仍可逐关作上限。

### 3．让人看懂刚才为什么赢、为什么挨打

360 像素宽的终局截图里，核心、角色脚边、悬浮武器和亮橙色动作挤在画面中央，底部另有“走出扇形禁区”。10 的长屏截图已有“离开钢缆的亮线”。两张静帧能定位视觉竞争，读招成功率要靠动态试玩。建议敌方致命攻击保有一套稳定的起手轮廓和方向，己方夸张效果集中在挥击接触后的几帧，敌弹临近时先让脚边清楚。让玩家正常打一轮，再回放受伤前一秒，分别记他实际避开哪一招、能指出哪一招。先复用现有扇弹、钢缆、扫线和收招窗口。[首领行为](../assets/scripts/m1/ChapterBoss.ts) · [战斗 HUD 和结单](../assets/scripts/cocos/M1Bootstrap.ts)

当前结单主栏显示波次、击倒数和剩余零件，另外已有死因、奖励和部分构筑记录。建议拿一格显示本局独有的一句话，如“扳手有 7 次一挥打中两台以上”。7 是文案示例，实现时从实际碰撞累计。牵引线圈可显示拉到同一挥击中的敌机数，这比做固定伤害排行榜更能解释它的作用。用本局行为挑一条，胜利后能回想怎么买的，失败后能说出下次想试什么。[现有结算结构](../assets/scripts/campaign/CampaignLedger.ts) · [开发者谈道具辨识和熟练度](https://www.gridsagegames.com/blog/2022/09/item-variants-and-randomization-in-roguelikes/)

### 4．值得试的大改是让一次改装用过两个站点

短局独立重开适合手机，也给每个人公平的起手。代价是，玩家刚在第五家店完成组合，通常只剩一场短 Boss 可以用。若前面实验证明玩家喜欢组装，却在结单后不想从一把工具重新来，再试 **从接驳仓直接去冷链库**。出发前让玩家看见下一站敌情，可以带走一把已改好的工具，其余局内购买正常结算。07 的波次预算按新起手的清群、单体和容错重新核，不应该让重复开局拖慢一趟出勤。[开局状态](../assets/scripts/m1/Run.ts) · [结单与首通事务](../assets/scripts/campaign/Campaign.ts)

原型只覆盖 06→07，随时可在结单处收工。若玩家愿意带装备再打，才试一章三段连续遭遇，章末选择撤离或继续。届时需把跨站装备快照和出勤编号一起保存，后台中断恢复、重放结单、旧档入场都要有用例，同一站奖励只发一次。如果玩家喜欢的是三四分钟就能收工，仍可将有效的两种构筑和遭遇组合留在单站。

## 哪些结果可以决定是否铺到全战役

| 顺序 | 怎么测 | 用什么作决定 |
| --- | --- | --- |
| 首玩基线 | 按现有 8–12 人首章表，至少半数初接触肉鸽。看首店选什么、能否解释，01 结单后让玩家自己决定是否开 02 | 原门槛为无提示过首波 ≥3/4、看过首店者能解释意图 ≥2/3、完成 01 者主动开 02 ≥1/2。逐项报人数和分母 |
| 06 两种构筑 | 先用固定种子同时跑当前走位和主动聚怪走位，再由玩到 06 的玩家试玩两版，轮换先后。同一人先盲玩，之后再问原因 | 每种买法至少在一种遭遇里体现优势，且有人能在购买前预判、在战斗中主动复现。记录零件不足、无适配槽、没看到配件，分别解释“没买” |
| 09 遭遇和首领读招 | 对照普通波的连续无威胁时长，对照受击前一秒的动态画面。短屏和长屏都保留原尺寸 | 强构筑能提前结束一段有意义的交锋，弱构筑仍有退路。记录可辨的死因和误认己方特效的次数 |
| 06→07 连续出勤 | 两版都有显眼的收工入口。在已经打完 06 且看到选择的人中，比较主动开 07、完成 07、带走了哪把工具和次日是否愿意再试 | 首轮小样主要定位原因。若连打意愿提高却大量中途退出，缩短连续段；若大多数人只想收工，单站优先。扩大样本后再讨论留存增幅 |

战力总分可以继续作低配软锁和过快击杀的回归报警。构筑评估需同时看清群、单体、容错，以及实测的多目标命中、控制后追击收益和脱险次数。零件也要按“进店 → 看见 → 有槽 → 买得起 → 购买 → 下波生效”记分母。把商店曝光与购买放在一起，才能分清货架从没出过某件配件，还是玩家看了以后决定不买。[Mega Crit 数值设计复盘](https://media.gdcvault.com/gdc2019/presentations/Giovannetti_Anthony_SlayTheSpire.pdf)

## 学习资料与检索取舍

检索覆盖中英文肉鸽开发教程、可运行源码、公开课程、GDC 讲稿、中文开发者投稿、7DRL 复盘和玩家讨论。下面逐项列出能迁移到本项目的方法。同一教程的语言移植适合查实现，但不算彼此独立的设计证据。开源代码与教材文字的许可分别看，商业作品复盘只用于研究设计方法。

### 能打开源码、做实验的教材

| 教程或项目 | 最适合拿来练什么 |
| --- | --- |
| [Wolverson · 随深度改变生成权重](https://bfnightly.bracketproductions.com/chapter_13.html) · [数据驱动的生成表](https://bfnightly.bracketproductions.com/rustbook/chapter_46.html) · [房间模块](https://bfnightly.bracketproductions.com/chapter_35.html) | 先规定什么时候能遇见一种敌人，再调它出现的频率。把有设计意图的一小段遭遇放进可变化的布局。三章各解决不同问题。[代码 MIT、文字单列许可](https://bfnightly.bracketproductions.com/license.html) |
| [TCOD · 逐层难度](https://rogueliketutorials.com/tutorials/tcod/v2/part-12/) · [装备的生效路径](https://rogueliketutorials.com/tutorials/tcod/v2/part-13/) | 同时设计每层敌人与补给，两张表都能影响难度。沿一件装备从定义到生效看完整路径 |
| [Sedovic · Rust＋tcod 教程及源码](https://tomassedovic.github.io/roguelike-tutorial/) · [Red Blob · 可在网页里玩的实现](https://www.redblobgames.com/x/2025-roguelike-dev/) | 对照同一教学骨架的两种实现。做交互草模时，直接在战场里看选择后果，比先造完整菜单省事 |
| [Bozar · Godot Roguelike Tutorial](https://github.com/Bozar/GodotRoguelikeTutorial) · [课程章节](https://github.com/Bozar/GodotRoguelikeTutorial/wiki) | 读可运行的小型回合制肉鸽与配套教程。用最小敌人和单一输入验证一条规则；仓库标注 MIT |
| [GDQuest · 幸存者式 2D 教程](https://www.gdquest.com/library/first_2d_game_godot4_vampire_survivor/) · [起始与完成工程](https://github.com/gdquest-demos/getting-started-with-godot-4) | 单独练移动、自动瞄准、射弹和刷敌。适合复现“输入只有移动，打法如何体现”。[工程许可](https://raw.githubusercontent.com/gdquest-demos/getting-started-with-godot-4/main/LICENSE) |
| [Godot · Dodge the Creeps](https://docs.godotengine.org/en/stable/getting_started/first_2d_game/index.html) | 同一教学页提供可运行实例与两种语言源码。删去装备，只靠进场方向和速度，检验走位是否有意思 |
| [Godot Deck Builder 教学工程](https://github.com/guladam/deck_builder_tutorial) | 用另一种肉鸽看战斗、奖励和局内状态怎么串起来。仓库标注 MIT，适合对照跨站出勤的状态边界 |
| [PuzzleScript · Rules 101](https://www.puzzlescript.net/Documentation/rules101.html) · [MIT 引擎](https://github.com/increpare/PuzzleScript) | 把推、挡、连成一列各自写成能试验的小规则。牵引线圈与扳手能否配合，先用三个敌机验证就够 |
| [Ludo Atlas 中文肉鸽手册](https://huanmoovo.github.io/ludo-atlas/docs/genres/roguelite/) · [源码与许可](https://github.com/HuanMoovo/ludo-atlas) | 对照局内外循环、受控随机、死亡回报。文档 CC BY-SA 4.0，代码 MIT |
| [The Nature of Code · 随机分布](https://natureofcode.com/random/) · [教材工程](https://github.com/nature-of-code/noc-book-2) | 用模拟比较均匀、带权和带约束的分布，观察极端样本。可以拿来试一关有多少次完全遇不到目标配件 |
| [RogueBasin · 跨语言教程目录](https://www.roguebasin.com/index.php/Tutorials) · [十五步做出肉鸽](https://www.roguebasin.com/index.php/How_to_Write_a_Roguelike_in_15_Steps) | 查找 C++、Python、FreeBASIC 等路线，从能玩的一条规则逐步加入数据和存档。移植数量不代表一个机制好玩 |

### 设计、数值与关卡课程

| 读物 | 可迁移的方法 |
| --- | --- |
| [Ian Schreiber · Game Design Concepts](https://gamedesignconcepts.wordpress.com/) · [Game Balance Concepts](https://gamebalanceconcepts.wordpress.com/) | 把想验证的问题缩成一个原型，再用成本曲线和实际购买结果互相校准。适合先改一个商店 |
| [MIT OCW · Game Design Methods](https://ocw.mit.edu/courses/cms-301-introduction-to-game-design-methods-spring-2016/pages/syllabus/) | 将设计、快速原型、观察玩家和迭代连成一轮。请玩家先做，再问他当时想做到什么 |
| [The Level Design Book · 遭遇](https://book.leveldesignbook.com/process/combat/encounter) · [节奏](https://book.leveldesignbook.com/process/preproduction/pacing) | 每段战斗写出开始时知道什么、中间需要做什么、如何知道结束。先教一个动作，复用一次，再改变条件 |
| [PCG 教材 · 地牢与关卡](https://www.pcgbook.com/chapter03.pdf) | 选生成方法时同时看作者能控制什么、输出如何验证。把“至少有一条可撤路线”写进遭遇约束 |
| [Red Blob · 游戏伤害概率](https://www.redblobgames.com/articles/probability/damage-rolls.html) | 先决定结果分布和长尾，再选随机实现。移用到货架时应看连续若干店落空的概率 |
| [Dungeon Crawl Stone Soup · 官方设计哲学](https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/docs/crawl_manual.rst) | 按是否有取舍审查每类操作。若重复点击每件商品总是正确，就检查每次购买到底在决定什么 |

### 开发者与玩家社区里值得保留的观点

| 一手材料 | 对《夜班修理局》的启发 |
| --- | --- |
| [Brotato 作者谈幸存者战斗与自走棋商店](https://www.gamespress.com/uk-UA/Brotato-10-Release) · [Xbox 对作者的访谈](https://news.xbox.com/fr-fr/2024/02/09/entretien-exclusif-avec-thomas-gervraud-brotato-le-jeu-qui-a-de-la-patate/) | 商店本身承担构筑玩法。优先借鉴购买后能感到的组合差异，六槽的外形只是其中一部分 |
| [Brotato 玩家讨论何时换货](https://www.reddit.com/r/brotato/comments/1kwggiz/thoughts_on_rerolling/) · [新玩家询问后期成型](https://www.reddit.com/r/brotato/comments/1sbptba/some_tips_and_tricks_please/) | 有人早期追武器，有人会为下轮留钱，也有人看角色和现有装备再决定。这是玩家解释自己决策的一手例子，不当成通用概率表 |
| [RoguelikeDev · 固定内容讨论](https://www.reddit.com/r/roguelikedev/comments/bs9vid/faq_friday_81_static_content/) · [社区共学回顾与作品](https://www.reddit.com/r/roguelikedev/comments/1nd215w/roguelikedev_tutorial_tuesday_2025_a_summary/) | 熟悉物品和地点能支持提前规划；多人跟同一教程可得到不同实现。给站点固定身份，只变化组别和方向 |
| [Cogmind · 物品变体与辨识](https://www.gridsagegames.com/blog/2022/09/item-variants-and-randomization-in-roguelikes/) · [大规模重平衡](https://www.gridsagegames.com/blog/2022/03/rebalancing-cogmind/) · [分组看玩家数据](https://www.gridsagegames.com/blog/2017/12/player-metrics-stats-preferences-steam/) | 道具用途稳定有利于学习。重做装备时先比同类战术作用，再看什么人、在什么阶段实际用过 |
| [Mega Crit · Slay the Spire 平衡讲稿](https://media.gdcvault.com/gdc2019/presentations/Giovannetti_Anthony_SlayTheSpire.pdf) | 将行为数据与设计者试玩结合。这里用同种子改变购买偏好，也保留两次落败样本，避免只看胜局 |
| [Valve · Left 4 Dead AI Systems](https://cdn.cloudflare.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) | 借鉴紧张、峰值和恢复的节奏。固定作者设计的敌群也能做喘息，未必要用完整动态导演 |
| [Derek Yu 讲 Spelunky 的房间组成](https://devmag.org.za/2009/04/02/speaking-about-spelunky/) · [Into the Breach 设计复盘](https://media.gdcvault.com/gdc2019/presentations/Into%20the%20Breach%20Postmortem%20Final.pdf) | 一份教组合手工内容，一份展示可读性如何约束武器设计。两者合起来适合检验随机夹击能否提前读懂 |
| [Dead Cells · 动作控制讲稿](https://media.gdcvault.com/gdc2019/presentations/Benard-Sebastian-DeepCells.pdf) · [Boss Up · 首领设计](https://media.gdcvault.com/gdc2018/presentations/Keren_Itay_BossUp.pdf) | 在允许失败的游戏里，输入意图、可避机会和反击窗口关系密切。应用到钢缆时，看玩家是否有时间看懂并移动 |
| [Supergiant · Hades 设计问答](https://www.supergiantgames.com/blog/hades-faq/) | 永久成长与可选挑战服务于不同玩家。把装备带到下一站放在自愿继续的位置，更适合验证玩家是否真的想续玩 |
| [《元素与构筑》开发者复盘](https://game.3loumao.org/748211206) · [Click! 的 7DRL 作者复盘](https://claus.castelodelego.org/posts/2026-03-26-click) | 前者用墙同时承担奖励和引导敌人路径，后者把拍摄确立为玩家动作。对修理题材同样可以问，玩家具体做了哪个动作才像一个修理工 |

### 复跑

在仓库根目录执行下面两条命令。第二条输出 JSON Lines，每一行保存工单、种子、策略、实际胜负、装备、每次购前货架和余额、购买项以及每波战斗数据。对比时使用同关、同种子，把败局单列。全战役战力基线的独立种子与复跑命令见[逐关战力文档](CAMPAIGN-POWER-BALANCE.md)。

```powershell
npm.cmd run build:web
node scripts/campaign-shop-study.mjs | Set-Content -Encoding ascii shop-study.jsonl
```
