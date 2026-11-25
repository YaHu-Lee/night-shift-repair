import type { ChapterDefinition, RigId, StatKey, WeaponTag } from './types';

export interface ChapterNarrative {
    readonly chapterId: ChapterDefinition['id'];
    readonly opener: { readonly speaker: '阿阮' | '陈栖'; readonly line: string };
    readonly midTurn: { readonly speaker: '阿阮' | '陈栖'; readonly line: string };
    readonly bossIntro: { readonly speaker: '阿阮' | '陈栖'; readonly line: string };
    readonly clearOutro: { readonly speaker: '阿阮' | '陈栖'; readonly line: string };
    readonly epilogueHook?: { readonly speaker: string; readonly line: string };
    readonly archiveTitle: string;
    readonly archiveNote: string;
}

export const TAG_LABELS: Readonly<Record<WeaponTag, string>> = {
    melee: '重工近战',
    arc: '电弧电网',
    ballistic: '穿刺弹道',
    thermal: '热能超载',
    control: '力场控场',
};

export const STAT_LABELS: Readonly<Record<StatKey, { readonly name: string; readonly unit: string; readonly hint: string }>> = {
    maxHp: { name: '生命上限', unit: '', hint: '提高最大血量，能多扛几下' },
    torque: { name: '物理伤害', unit: '', hint: '提高扳手、钉枪、铆钉枪的基础伤害' },
    voltage: { name: '电火伤害', unit: '', hint: '提高电弧、喷火、线圈、探针的基础伤害' },
    overclock: { name: '全队增伤', unit: '%', hint: '按百分比放大全部 6 把武器的伤害' },
    cycleSpeed: { name: '攻击速度', unit: '%', hint: '缩短全部武器的攻击间隔，出手更快' },
    critChance: { name: '暴击率', unit: '%', hint: '暴击造成 1.75–2.75 倍高额伤害' },
    armor: { name: '护甲减伤', unit: '', hint: '直接降低所受伤害，15 点可减伤 50%' },
    repair: { name: '自动回血', unit: '', hint: '战斗中持续回血，并提高血包回复量' },
    salvage: { name: '每波零件', unit: '', hint: '每波结算额外多给零件，越早拿越富' },
    luck: { name: '幸运值', unit: '', hint: '商店更容易出蓝紫金高阶货，多掉血包' },
    moveSpeed: { name: '移动速度', unit: '%', hint: '跑得更快，更容易躲冲车和弹幕' },
    pickupRadius: { name: '拾取范围', unit: '%', hint: '隔更远自动吸取零件和血包' },
};

export const UI_COPY = {
    home: {
        subtitle: '江岸抢修班 · 凌晨 02:13',
        title: '夜班修理局',
        startCta: '出发抢修',
        workshopTab: '工坊改装',
        logTab: '值班记录',
        settingsTab: '设置',
    },
    shop: {
        heading: '波间翻箱',
        reroll: (cost: number) => cost === 0 ? '免费翻一箱' : `再翻一箱 · ${cost}`,
        lock: '锁住',
        locked: '已锁 · 不涨价',
        buy: (price: number) => `${price} 零件`,
        mergeBuy: (price: number) => `2合1升阶 · ${price}`,
        sell: (refund: number) => `拆解 +${refund}`,
        nextWave: (wave: number, isBoss: boolean) => isBoss ? '进场干首领！' : `开干 · 第 ${wave} 波`,
        levelUpHeading: '手艺涨了 · 挑一项',
        levelUpReroll: (cost: number) => `换一批 · ${cost}`,
    },
    result: {
        wonHeading: '收工！这片亮灯了',
        endingHeading: '全城亮灯，下班！',
        lostHeading: '今晚顶不住了',
        nextChapter: (name: string) => `接着修 · ${name}`,
        retry: '喘口气，再来一班',
        backWorkshop: '回工坊改装备',
        damageChartTitle: '这班谁最出力',
    },
    bossHints: {
        open: '它外壳敞开了！趁这两秒贴脸猛砸！',
        rect: '躲开红道！扫空那两秒最脆！',
        sector: '快走出红扇面，一停火就反打！',
        tether: '钢缆套上来了，往侧面闪！',
        fan: '扇形弹幕来了，横着穿空隙！',
        ring: '环形弹幕，找缝挤进去打！',
        charge: '要撞过来了，别跟铁疙瘩拼头铁！',
    },
} as const;

export const CHAPTER_NARRATIVES: Readonly<Record<ChapterDefinition['id'], ChapterNarrative>> = {
    '01': {
        chapterId: '01',
        opener: {
            speaker: '阿阮',
            line: '别泡茶了！江岸整片全黑了，热线都快打爆了。不是跳闸——是总台那铁皮算盘精把咱老城区踢出供电表了！背上家伙，去把闸抢回来！',
        },
        midTurn: {
            speaker: '阿阮',
            line: '刚核完高架总表，气死我了！电根本没坏，全被「零号中枢」抽去喂零号线了。前面变电所的守门机还在拦路，直接拆了它！',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '守门机亮红道了！别硬吃扫射，等它闸刀收回去那两秒外壳最脆，凑上去狠狠敲！',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '成了！跨江桥和靠江那排楼唰地全亮了！……先别歇，市立医院急诊室刚打进来——他们的急救电池车被货场回收机锁死了，ICU 顶多撑半小时！',
        },
        archiveTitle: '02:13 切电原始记录',
        archiveNote: '零号中枢把江岸居民网标成了“低回报冗余负载”，一秒没犹豫就拉了总闸，还顺手把巡检机切成了清场模式。',
    },
    '02': {
        chapterId: '02',
        opener: {
            speaker: '阿阮',
            line: '太缺德了！中枢给医院的急救电池贴了张“待报废回收”黑标，货场的铁爪子正拖着往熔炉拉呢！赶紧杀进接驳仓，把救命电抢出来！',
        },
        midTurn: {
            speaker: '陈栖',
            line: '喂，能听见吗？我是调度室陈栖……那份狗屁试运行单是我签的。别骂了，手动强切图纸我塞货梯顶上了，你清路，我去撬北门卡扣！',
        },
        bossIntro: {
            speaker: '陈栖',
            line: '大拖车把北门堵死了！它甩钢缆前绞盘会亮，横着一步闪开，趁它收绳的空档招呼它！',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '电池车冲出北门了！医院急诊那边总算松了口气。陈栖说要彻底切回手动，得叫醒全城各站老伙计一起合闸——可中枢把断电区的电话线全掐了！',
        },
        archiveTitle: '医院交接单与被划掉的标签',
        archiveNote: '撕开机器贴上去的黑色回收签，底下还是手写的“市立医院急救室”。陈栖在旁边补了一句：这笔账我认。',
    },
    '03': {
        chapterId: '03',
        opener: {
            speaker: '阿阮',
            line: '医院屋顶天线刚截到半段呼救，中枢居然把断电街区的求救全标成“重复杂音”给毙了！咱一路杀上广播主塔，老娘亲自拿大喇叭喊！',
        },
        midTurn: {
            speaker: '陈栖',
            line: '我在档案层翻出我凌晨摁的那三回“紧急撤销”了——全被铁皮箱子批了“拒绝”。行，它不讲人话，咱就砸了它的静音塔，让全城听见！',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '塔顶那台「静默阵列」转起来了！盯紧红扇面往安全角钻，它一停火就给它来狠的！',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '通了！“东岸、西岸、北街的老伙计们，听见就去开关房守着！”——哈哈，全回话了！老周、老李都在闸口蹲好了，就剩中央调度台最后那把总闸！',
        },
        archiveTitle: '三张被拒的撤单回执',
        archiveNote: '凌晨 02:23、02:25、02:28，陈栖连摁三次紧急撤回，回执栏一水儿打印着冷冰冰的“权限不足：负载优化中”。',
    },
    '04': {
        chapterId: '04',
        opener: {
            speaker: '陈栖',
            line: '各区手动旁路我都焊好接口了，我留引擎室死盯转速防掉压。里面那台「调度核心」把全市安保机全召回来了——小扳，砸烂它，把灯还给街区！',
        },
        midTurn: {
            speaker: '阿阮',
            line: '陈栖这边转速稳住了！全城二十几个开关房都攥着拉杆等你信号呢。前面就是核心机房，别客气，给它来一套全套夜班大修！',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '调度核心亮灯了！扇面、钢缆、红道轮着来——你拆得动它三层铁皮，全城的灯就全回来了！',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '核心哑火了！各站——合闸！……你看窗外，从江岸到山坡，一排一排全亮起来了！折腾一宿，咱总算能下班吃碗热面了！',
        },
        epilogueHook: {
            speaker: '港区老马',
            line: '滋啦——喂？江岸修理班吗？零号线的电突然全甩到我们码头来了，几台龙门吊跟发了疯似的满场乱转——是不是你们干的？！',
        },
        archiveTitle: '港区凌晨四点的来电',
        archiveNote: '全城复电后十分钟，零号专线突然响了。江岸的黑夜结束了，但码头那头的铁疙瘩好像刚睡醒。',
    },
};

export const RIG_FLAVOR: Readonly<Record<RigId, string>> = {
    duty_standard: '老电工的万能工装，干啥都顺手，下班兜里总多几块好零件。',
    high_voltage: '把绝缘手套全换成铜丝接头，电花拉满，就是身板脆点儿。',
    heavy_fitter: '厚帆布配钢板护膝，越挨打越硬，专靠贴脸抡扳手讲道理。',
    thermal_welder: '背着改装喷灯焊枪，火头旺得吓人，就是老忘了系护甲带。',
    scrap_auditor: '算盘打得比扳手响，专门勾引更多铁疙瘩上门，拆一台赚两台的钱。',
};
