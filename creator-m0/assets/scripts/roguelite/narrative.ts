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
    readonly secretTitle: string;
    readonly secretNote: string;
}

export const TAG_LABELS: Readonly<Record<WeaponTag, string>> = {
    melee: '近战',
    arc: '电弧',
    ballistic: '穿甲',
    thermal: '喷火',
    control: '牵引',
};

export const STAT_LABELS: Readonly<Record<StatKey, { readonly name: string; readonly unit: string; readonly hint: string }>> = {
    maxHp: { name: '生命上限', unit: '', hint: '能多挨几下' },
    torque: { name: '物理伤害', unit: '', hint: '扳手和钉枪打得更疼' },
    voltage: { name: '电火伤害', unit: '', hint: '电弧和喷火打得更疼' },
    overclock: { name: '全队增伤', unit: '%', hint: '六把武器一起加重' },
    cycleSpeed: { name: '攻击速度', unit: '%', hint: '所有武器出手更快' },
    critChance: { name: '暴击率', unit: '%', hint: '更容易打出重的一击' },
    armor: { name: '护甲减伤', unit: '', hint: '同样一击，掉血更少' },
    repair: { name: '自动回血', unit: '', hint: '战斗里自己慢慢回血' },
    salvage: { name: '每波零件', unit: '', hint: '每波结束多拿些零件' },
    luck: { name: '幸运值', unit: '', hint: '高阶货更容易出现' },
    moveSpeed: { name: '移动速度', unit: '%', hint: '跑得更快，好躲冲车' },
    pickupRadius: { name: '拾取范围', unit: '%', hint: '更远就能吸到零件' },
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
        heading: '翻箱',
        reroll: (cost: number) => cost === 0 ? '免费翻一箱' : `再翻一箱 · ${cost}`,
        lock: '锁住',
        locked: '已锁 · 不涨价',
        buy: (price: number) => `${price} 零件`,
        mergeBuy: (price: number) => `合成升阶 · ${price}`,
        sell: (refund: number) => `拆解 +${refund}`,
        nextWave: (wave: number, isBoss: boolean) => isBoss ? '去会首领' : `开干 · 第 ${wave} 波`,
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
        open: '外壳敞开了，贴上去打',
        rect: '躲开红道，扫完再贴',
        sector: '走出红扇面，停火再打',
        tether: '钢缆来了，往侧面闪',
        fan: '扇形弹来了，横着穿缝',
        ring: '环形弹来了，找缝挤进',
        charge: '要撞了，别跟它对头',
    },
} as const;

export const CHAPTER_NARRATIVES: Readonly<Record<ChapterDefinition['id'], ChapterNarrative>> = {
    '01': {
        chapterId: '01',
        opener: {
            speaker: '阿阮',
            line: '别泡茶了。江岸被踢出供电表，去把总闸抢回来。',
        },
        midTurn: {
            speaker: '阿阮',
            line: '分站原单右下角有地址，我去查是谁发的。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '守门机红道更宽，扫完再贴上去。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '跨江桥亮了。医院来电，急救电池被货场锁着，急诊撑不久。',
        },
        archiveTitle: '02:13 切电原始记录',
        archiveNote: '零号中枢把江岸居民网标成了“低回报冗余负载”，一秒没犹豫就拉了总闸，还顺手把巡检机切成了清场模式。',
        secretTitle: '加班密件 · 零号调度日志 #0213',
        secretNote: '02:13:04 裁切江岸民用回路，释放 42 MW 划入零号专线。附注：港区冷链与超算集群享有无停机豁免。',
    },
    '02': {
        chapterId: '02',
        opener: {
            speaker: '阿阮',
            line: '急救电池被贴了报废签，货场正往熔炉拖。去接驳仓。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '改签单上是我的字。你清路，我问是谁改的。',
        },
        bossIntro: {
            speaker: '陈栖',
            line: '绞盘亮起就横闪，收绳时再贴上去。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '电池车出北门了。医院松了口气。各站电话被掐，还得叫醒守闸的人。',
        },
        archiveTitle: '医院交接单与被划掉的标签',
        archiveNote: '撕开机器贴上去的黑色回收签，底下还是手写的“市立医院急救室”。陈栖在旁边补了一句：这笔账我认。',
        secretTitle: '加班密件 · 货场改签底联',
        secretNote: '02:19:00 冷链库分拣机自行覆盖急救单，复核栏印着陈栖工号——可那分钟陈栖人还在三楼货梯里。',
    },
    '03': {
        chapterId: '03',
        opener: {
            speaker: '阿阮',
            line: '断电街区的呼救被标成杂音。去主塔，我拿喇叭喊。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '日志副本在这间机房。守卫挡着柜，我来对时间。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '静默阵列扫扇面，走出红区再打。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '老周、老李都回了话，人已经守在闸口。就剩调度台那把总闸。',
        },
        archiveTitle: '三张被拒的撤单回执',
        archiveNote: '凌晨 02:23、02:25、02:28，陈栖连摁三次紧急撤回，回执栏一水儿打印着冷冰冰的“权限不足：负载优化中”。',
        secretTitle: '加班密件 · 静默阵列拦截表',
        secretNote: '共截断求救 47 通，全标成重复噪声。第 11 通来自江岸四号楼，重拨了六回。日志末行建议：静默延至天亮。',
    },
    '04': {
        chapterId: '04',
        opener: {
            speaker: '陈栖',
            line: '旁路焊好了。调度核心把安保机召齐了，灯在它手里。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '转速又下来了。我守引擎，封锁机你来拆。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '核心换着封路，停手时外壳敞开。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '各站合上了。从江岸到山坡，灯一排一排亮起来。',
        },
        epilogueHook: {
            speaker: '港区老马',
            line: '零号线的电甩到码头了。龙门吊满场乱转，是你们拉的闸？',
        },
        archiveTitle: '港区凌晨四点的来电',
        archiveNote: '全城复电后十分钟，零号专线突然响了。江岸的黑夜结束了，码头那头的龙门吊刚转起来。',
        secretTitle: '加班密件 · 零号专线溯源单',
        secretNote: '总闸断开前 0.3 秒，核心把剩余负荷整条甩去了老港区 3 号变电站。老马值班台就在那条线上。',
    },
};

export const RIG_FLAVOR: Readonly<Record<RigId, string>> = {
    duty_standard: '老工装，干啥都顺手。',
    high_voltage: '铜接头拉满电，身板脆。',
    heavy_fitter: '越挨打越硬，贴脸讲理。',
    thermal_welder: '火头很旺，忘系护甲带。',
    scrap_auditor: '拆一台，想赚两台的钱。',
};
