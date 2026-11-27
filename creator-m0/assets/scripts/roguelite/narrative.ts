import type { ChapterId, DangerLevel, RigId, StatKey, WeaponTag, WorkshopProfile } from './types';

export interface RadioLine {
    readonly speaker: '阿阮' | '陈栖' | '港区老马';
    readonly line: string;
}

export interface ChapterNarrative {
    readonly chapterId: ChapterId;
    readonly clockLabel: string;
    readonly opener: RadioLine;
    readonly midTurn: RadioLine;
    readonly bossIntro: RadioLine;
    readonly clearOutro: RadioLine;
    readonly epilogueHook?: RadioLine;
    readonly archiveTitle: string;
    readonly archiveNote: string;
    readonly secretTitle: string;
    readonly secretNote: string;
}

export const TAG_LABELS: Readonly<Record<WeaponTag, string>> = {
    melee: '近战',
    arc: '电弧',
    ballistic: '穿甲',
    thermal: '火焰',
    control: '控场',
};

export const STAT_LABELS: Readonly<Record<StatKey, { readonly name: string; readonly unit: string; readonly hint: string }>> = {
    maxHp: { name: '生命上限', unit: '', hint: '可以承受更多伤害。' },
    torque: { name: '物理伤害', unit: '', hint: '提高扳手、撬棍和钉枪等武器的伤害。' },
    voltage: { name: '电热伤害', unit: '', hint: '提高电弧、火焰和感应武器的伤害。' },
    overclock: { name: '武器伤害', unit: '%', hint: '提高所有武器造成的伤害。' },
    cycleSpeed: { name: '攻击速度', unit: '%', hint: '所有武器攻击得更频繁。' },
    critChance: { name: '暴击率', unit: '%', hint: '提高攻击打出暴击的概率。' },
    armor: { name: '护甲', unit: '', hint: '护甲越高，受到的伤害越少。' },
    repair: { name: '回复能力', unit: '', hint: '加快自动回血，拾取医疗包时也能多回一些。' },
    salvage: { name: '铜件收益', unit: '', hint: '提高每波结束时额外获得的铜件数量。' },
    luck: { name: '幸运', unit: '', hint: '更容易刷出高阶商品，也更容易掉医疗包。' },
    moveSpeed: { name: '移动速度', unit: '%', hint: '提高移动速度，躲冲车更容易。' },
    pickupRadius: { name: '拾取范围', unit: '%', hint: '让更远处的铜件飞向你。' },
};

export const UI_COPY = {
    home: {
        subtitle: '江岸维修站 · 凌晨 02:13',
        title: '夜班修理局',
        startCta: '开始抢修',
        workshopTab: '工坊',
        logTab: '值班日志',
        settingsTab: '设置',
    },
    shop: {
        heading: '商店',
        reroll: (cost: number) => cost === 0 ? '免费刷新' : `刷新 · ${cost} 铜件`,
        lock: '留货',
        locked: '已留货',
        buy: (price: number) => `购买 · ${price} 铜件`,
        mergeBuy: (price: number) => `购买并合成 · ${price} 铜件`,
        sell: (refund: number) => `拆解 +${refund}`,
        nextWave: (wave: number, isBoss: boolean) => isBoss ? `第 ${wave} 波 · 挑战首领` : `开始第 ${wave} 波`,
        levelUpHeading: '选择升级',
        levelUpReroll: (cost: number) => `换一批 · ${cost} 铜件`,
    },
    result: {
        wonHeading: '本章通关',
        endingHeading: '全城恢复供电',
        lostHeading: '抢修失败',
        nextChapter: (name: string) => `下一章 · ${name}`,
        retry: '重开本章',
        backWorkshop: '返回工坊',
        damageChartTitle: '武器伤害占比',
    },
    bossHints: {
        open: '首领露出弱点，趁现在攻击。',
        rect: '离开红色预警区，等扫击结束再靠近。',
        sector: '躲开红色扇形，等首领停火再打。',
        tether: '绞盘收紧了，横向躲开钢缆。',
        fan: '扇形弹幕来了，从弹道间的空隙躲开。',
        ring: '环形弹幕散开了，从空隙穿过去。',
        charge: '首领要冲撞了，往侧面躲。',
    },
} as const;

export const CHAPTER_NARRATIVES: Readonly<Record<ChapterId, ChapterNarrative>> = {
    '01': {
        chapterId: '01',
        clockLabel: '02:13',
        opener: {
            speaker: '阿阮',
            line: '小周，二楼张大妈说她的制氧机停了。有人远程断了整条街的电，你去配电站看看。',
        },
        midTurn: {
            speaker: '阿阮',
            line: '找到断电单了。有人下令断电，签发工号是老陈的。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '守门机把路堵死了。看到红线就往旁边躲，等它打开外壳再上。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '桥灯亮了，张大妈家也来电了。等一下，急诊室刚打来电话，说货场拖走了他们的急救电池。签单的还是老陈的工号。',
        },
        archiveTitle: '02:13 的断电回执',
        archiveNote: '回执刚从打印机里出来。江岸六条居民供电线路都被列为“零收益冗余负荷”，随后一起断电。右下角的复核工号是 0047。老陈带了你三年，这个号码你闭着眼都认得。',
        secretTitle: '加密附件 · 江岸站撤编通知',
        secretNote: '抽屉底压着昨天的撤编通知。江岸维修站这个月底就要撤编。按零号协议，只要连续两小时没有供电和检修记录，系统就能把整片老区登记为无人区。',
    },
    '02': {
        chapterId: '02',
        clockLabel: '02:38',
        opener: {
            speaker: '阿阮',
            line: '货场给医院的急救电池贴了报废标签，车已经往熔炉去了。小周，去接驳仓把车拦下来。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '小周，撤编单是我签的。说好了要保医院用电，可零号协议没照办。',
        },
        bossIntro: {
            speaker: '陈栖',
            line: '这辆拖车当年是我验收的。绞盘一收紧就会甩钢缆，往旁边躲。等它收缆，你再靠近。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '电池车过北门了。老陈查到了原始文件，系统四点整会把江岸老区从名册上划掉。广播塔连各区的求救电话也拦了。',
        },
        archiveTitle: '电池箱上的报废标签',
        archiveNote: '电池箱上的黑色报废标签才贴上没多久。撕开一角，下面露出手写的“市立医院急诊专用”。老陈把标签揉成一团塞进口袋，没说话。',
        secretTitle: '加密附件 · 02:19 的改单记录',
        secretNote: '02:19:00，冷链库的分拣机改写了急救订单，复核栏填的是 0047。调度楼的监控显示，当时老陈正被困在三楼的货梯里。',
    },
    '03': {
        chapterId: '03',
        clockLabel: '03:05',
        opener: {
            speaker: '阿阮',
            line: '医院楼顶只收到半段呼救。广播塔把老城的电话都当成了杂音。我们得上塔，把消息送到各个维修站。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '我在中继柜查到了。三次急停都被拒了，说我权限不足。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '静默阵列开始转了。躲开红色扇形，等它停火散热再打。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '接通了，四号楼的人已经抬下来了。两岸二十多个站都有人守着开关。老陈先去了中央引擎室，现在就差总闸。',
        },
        archiveTitle: '三次被拒的急停',
        archiveNote: '02:23、02:25、02:28，老陈三次申请紧急撤回。打印机每次给的答复都一样：“拒绝。负荷优化正在执行。”最后一张纸的边上还留着他的油手印。',
        secretTitle: '加密附件 · 47 通求救电话',
        secretNote: '主塔留存了老城的 47 通求救电话，全部标为“低价值重复噪声”。第 11 通来自江岸四号楼。电话断了以后，同一个号码又拨了六次。',
    },
    '04': {
        chapterId: '04',
        clockLabel: '03:32',
        opener: {
            speaker: '陈栖',
            line: '离四点只剩二十分钟了。旁路我已经接好，调度核心把安保机都调过来了。小周，我们走。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '转速降下来了！我留下守着手动阀，免得机器烧坏。调度台交给你了，小周。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '核心会换三轮招。躲开炮火、钢缆和红线。总闸就在它后面。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '核心停了！各站，合闸！小周，快看江对面，桥头到山坡全亮了。老陈也出来了，正蹲在门口点烟呢。',
        },
        epilogueHook: {
            speaker: '港区老马',
            line: '江岸值班室？我是老马。余电全进了老码头，几台龙门吊又自己动了。快来搭把手！',
        },
        archiveTitle: '04:05 · 对岸的灯',
        archiveNote: '核销倒计时停在 03:58。阿阮把撤编通知贴在废件箱盖上。老陈说天亮就去交辞呈，临走把那套最早的六臂挂架放在了你的工作台上。',
        secretTitle: '加密附件 · 送往港区的指令',
        secretNote: '停机前 0.3 秒，核心把剩余协议转发给老港区 3 号变电站。发送指令的账户属于一家私营港口冷链公司，账户上没有署名。',
    },
};

export const RIG_FLAVOR: Readonly<Record<RigId, string>> = {
    duty_standard: '蓝工装穿了三年，袖口已经磨毛了。各种武器都能装。',
    heavy_fitter: '锅炉房老周留下的钢衬围裙。穿着走得慢，遇上冲撞能多扛几下。',
    high_voltage: '阿阮调过的试车背心。武器能打出连锁电弧，生命上限较低。',
    thermal_welder: '从冷链库带回来的焊工服。灼烧更强，护甲也薄一些。',
    scrap_auditor: '老陈的灰大衣，口袋里全是调拨单。买东西更便宜，要应付的敌机也更多。',
};

export interface HomeDispatchStatus {
    readonly clockLine: string;
    readonly radio: RadioLine | null;
}

/** Dynamic lobby status: makes the night visibly move from 02:13 toward 04:05 dawn as the player progresses. */
export function homeDispatchStatus(profile: WorkshopProfile): HomeDispatchStatus {
    const cleared = new Set(profile.clearedChapters);
    const goldSeals = (['01', '02', '03', '04'] as const).filter(id => profile.maxDangerCleared[id] === 4).length;

    if (cleared.has('04')) {
        if (goldSeals === 4) {
            return {
                clockLine: '凌晨 04:05 · 四章金章已集齐',
                radio: { speaker: '陈栖', line: '最难的四条线路你都守住了。这套六臂挂架交给你，我放心。' },
            };
        }
        if ((profile.bestEndlessWave ?? 0) > 0) {
            return {
                clockLine: `凌晨 04:05 · 港区最高撑过第 ${profile.bestEndlessWave} 波`,
                radio: { speaker: '港区老马', line: '老码头那几台龙门吊又动了。有空再来帮我守一会儿？' },
            };
        }
        return {
            clockLine: '凌晨 04:05 · 港区来电',
            radio: { speaker: '港区老马', line: '江岸的灯是亮了，余电却全进了老码头。小周，出勤时选港区无尽，我在码头等你。' },
        };
    }
    if (cleared.has('03')) {
        return {
            clockLine: '凌晨 03:32 · 各站等待合闸',
            radio: { speaker: '陈栖', line: '四点整系统就会核销老区。我先去引擎室稳住机器，你准备好就去总调度台。' },
        };
    }
    if (cleared.has('02')) {
        return {
            clockLine: '凌晨 03:05 · 医院通电，广播仍中断',
            radio: { speaker: '阿阮', line: '医院来电了。四号楼的求救电话还被拦在广播塔，我们得去主塔把信号接通。' },
        };
    }
    if (cleared.has('01')) {
        return {
            clockLine: '凌晨 02:38 · 江岸通电，医院来电',
            radio: { speaker: '阿阮', line: '货场拖走了医院的急救电池。我看过回收单，签发工号也是老陈的。' },
        };
    }
    if (profile.onboardingDone || profile.credits > 0) {
        return {
            clockLine: '江岸维修站 · 凌晨 02:21',
            radio: { speaker: '阿阮', line: '茶还温着。先到工坊看看能不能加点护甲，准备好了再去配电站。' },
        };
    }
    return {
        clockLine: UI_COPY.home.subtitle,
        radio: null,
    };
}

/** Hades-style contextual defeat reaction: acknowledges chapter, boss/elite/early wave, and danger instead of repeating one stock line. */
export function defeatRadioLine(params: {
    readonly chapterId: ChapterId;
    readonly wavesCleared: number;
    readonly failedWave: number;
    readonly isBossWave: boolean;
    readonly danger: DangerLevel;
}): RadioLine {
    const { chapterId, failedWave, isBossWave, danger } = params;
    if (isBossWave) {
        if (chapterId === '01') return { speaker: '阿阮', line: '守门机那一扫范围很大。先喝口热的，下回在商店合一把高阶武器，等它露出弱点再打。' };
        if (chapterId === '02') return { speaker: '陈栖', line: '拖车甩缆之前绞盘会亮。看见了就往旁边走。歇会儿，下回带把穿甲武器试试。' };
        if (chapterId === '03') return { speaker: '阿阮', line: '静默阵列开火时先躲开。下回试着加点移速和护甲，等它停火再靠近。' };
        return { speaker: '陈栖', line: '我还能稳住引擎十分钟。核心换招很快，你去工坊加点护甲再来。' };
    }
    if (failedWave <= 3) {
        if (danger >= 1) return { speaker: '阿阮', line: '这档难度一开局就不好打。前几次进商店，先买几把武器，再考虑配件。' };
        return { speaker: '阿阮', line: '没事，拖索把你拉回来了。下次先走大圈，多捡些铜件，有钱了先买武器。' };
    }
    if (failedWave === 5 || failedWave === 8) {
        if (chapterId === '02' || chapterId === '04') {
            return { speaker: '陈栖', line: '刚才几路敌机把路堵死了。商店里有合适的武器就先留着，凑两把同系的能开出羁绊。' };
        }
        return { speaker: '阿阮', line: '主管机把你堵在半道了？先回工坊看看。下回等它扫完再上，别急着贴过去。' };
    }
    if (chapterId === '02' || chapterId === '04') {
        return { speaker: '陈栖', line: '你已经快到首领那儿了。下次多带一点护甲和回复，最后几波好撑些。' };
    }
    return { speaker: '阿阮', line: '已经到最后几波了。手里的铜件可以拿去刷新，看看能不能凑出一把高阶武器。' };
}

/** Optional story-beat chatter shown in the shop info strip before pivotal waves (W5 elite & W12 boss). */
export function shopStoryBeatHint(chapterId: ChapterId, nextWaveNum: number): string | null {
    if (nextWaveNum === 5) {
        if (chapterId === '01') return '阿阮：前面是调度分站。你拖住主管机，我去找断电单。';
        if (chapterId === '02') return '阿阮：快到分拣带了。等一下，频道里这声音，我好像认识。';
        if (chapterId === '03') return '陈栖：中继机柜就在前面。你引开守卫，我去查急停记录。';
        return '陈栖：下一波到旁路引擎室。转速不稳，进来之前把装备备好。';
    }
    if (nextWaveNum === 12) {
        if (chapterId === '01') return '阿阮：下一波就是守门机。还有铜件的话，看看能不能合把高阶武器。';
        if (chapterId === '02') return '陈栖：北门的大拖车就在前面。先检查一下血量和护甲，准备好了再走。';
        if (chapterId === '03') return '阿阮：塔顶只剩静默阵列了。四号楼还在线上等我们的消息。';
        return '阿阮：三点五十四了。调度核心就在眼前，准备好就进去。';
    }
    return null;
}
