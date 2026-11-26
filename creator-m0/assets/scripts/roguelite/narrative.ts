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
    melee: '重手撬拆',
    arc: '私接高压',
    ballistic: '破壳铆打',
    thermal: '焊枪炙割',
    control: '磁力调频',
};

export const STAT_LABELS: Readonly<Record<StatKey, { readonly name: string; readonly unit: string; readonly hint: string }>> = {
    maxHp: { name: '生命上限', unit: '', hint: '护具更耐造，能多扛几下' },
    torque: { name: '撬拆力道', unit: '', hint: '扳手、撬棍和钉枪打得更重' },
    voltage: { name: '电火功率', unit: '', hint: '电弧、焊火、线圈和测针更猛' },
    overclock: { name: '全架增伤', unit: '%', hint: '六臂挂架上的工具一起加重' },
    cycleSpeed: { name: '出手频率', unit: '%', hint: '六臂挂架循环更快' },
    critChance: { name: '找缝重击', unit: '%', hint: '更容易戳进铁壳焊缝打重伤' },
    armor: { name: '护甲厚度', unit: '', hint: '同样一撞，身上掉血更少' },
    repair: { name: '应急自修', unit: '', hint: '边跑边补护具，血包回得更多' },
    salvage: { name: '拆铜手艺', unit: '', hint: '每波收工多拆出一批铜件' },
    luck: { name: '翻箱手气', unit: '', hint: '料斗更容易掉高阶改件和血包' },
    moveSpeed: { name: '脚底步速', unit: '%', hint: '走位更轻快，更好甩冲车' },
    pickupRadius: { name: '吸件半径', unit: '%', hint: '隔得更远就把地上的铜件吸走' },
};

export const UI_COPY = {
    home: {
        subtitle: '江岸维修站 · 凌晨 02:13',
        title: '夜班修理局',
        startCta: '背架出门',
        workshopTab: '工坊改架',
        logTab: '值班物证',
        settingsTab: '设置',
    },
    shop: {
        heading: '料斗翻箱',
        reroll: (cost: number) => cost === 0 ? '白翻一箱' : `再翻一箱 · ${cost}`,
        lock: '压货',
        locked: '已压 · 不涨价',
        buy: (price: number) => `${price} 铜件`,
        mergeBuy: (price: number) => `并机升阶 · ${price}`,
        sell: (refund: number) => `拆铜 +${refund}`,
        nextWave: (wave: number, isBoss: boolean) => isBoss ? '硬撬关底机' : `出勤 · 第 ${wave} 波`,
        levelUpHeading: '手艺涨了 · 挑一项',
        levelUpReroll: (cost: number) => `换一批 · ${cost}`,
    },
    result: {
        wonHeading: '这片灯亮了',
        endingHeading: '全城合闸，天快亮了',
        lostHeading: '拖索拉回来了',
        nextChapter: (name: string) => `接着修 · ${name}`,
        retry: '喝口茶，再出去一趟',
        backWorkshop: '回工坊改架',
        damageChartTitle: '这班哪把最出力',
    },
    bossHints: {
        open: '外壳敞开了，贴上去狠撬',
        rect: '闪开红道，扫完再贴上去',
        sector: '退出红扇面，停火那两秒打',
        tether: '绞盘紧了，横着迈开躲钢缆',
        fan: '扇形弹过来了，横着穿缝',
        ring: '环弹散开了，找空档挤进去',
        charge: '顶过来了，别跟铁壳拼头铁',
    },
} as const;

export const CHAPTER_NARRATIVES: Readonly<Record<ChapterId, ChapterNarrative>> = {
    '01': {
        chapterId: '01',
        clockLabel: '02:13',
        opener: {
            speaker: '阿阮',
            line: '二楼张大妈刚敲窗户，说制氧机停了。全街电表被远程掐了，背上架子去把闸掰回来。',
        },
        midTurn: {
            speaker: '阿阮',
            line: '我摸进分站打印机了……断电单不是故障触发的，签发栏印着老陈的工号。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '这台铁门板专门封死老站出路。躲开它扫出的红道，趁外壳敞开狠撬。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '桥灯亮了，张大妈窗帘也透光了。可急诊室刚来电，医院急救电池被货场拖走了，签单还是老陈的工号。',
        },
        archiveTitle: '02:13 断电回执与 0047 工号',
        archiveNote: '分站吐出来的热敏纸还没凉透。江岸六条民用线被划进“零收益冗余负荷”一刀切黑，右下角复核工号写着 0047，那是带了你三年的老陈。',
        secretTitle: '加班密件 · 红漆箱里的撤编令',
        secretNote: '抽屉底压着昨天的红头文件：江岸老站月底撤编。零号协议只要凑够两小时“零供电、零检修记录”，就能把整片老区报成无人废地。',
    },
    '02': {
        chapterId: '02',
        clockLabel: '02:38',
        opener: {
            speaker: '阿阮',
            line: '货场铁爪给医院急救电池贴了报废黑签，正往熔炉拖。杀进接驳仓，把车抢下来。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '……小周，阿阮，是我老陈。撤编单是我签的，拿老站换医院不断电，它把条款拆了。',
        },
        bossIntro: {
            speaker: '陈栖',
            line: '大拖车当年是我验的收，绞盘一紧就甩重缆。横着躲开，趁它收绳贴上去拆。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '电池车冲出北门了。老陈翻出一份底稿，四点整系统要自动核销老江岸，各区求救电话也被广播塔掐了。',
        },
        archiveTitle: '撕开一半的报废黑签',
        archiveNote: '电池箱外壳粘着机器刚打的黑色废品签，撕掉一角，底下还是手写的“市立医院急诊专用”。老陈把那张黑签攥成团塞进兜里，没再为自己辩一句。',
        secretTitle: '加班密件 · 02:19 篡改时间戳',
        secretNote: '冷链库分拣机自行覆盖急救单的时间是 02:19:00，复核栏冒用工号 0047。可电梯监控拍到，那一分钟老陈正被困在调度楼三层货梯里。',
    },
    '03': {
        chapterId: '03',
        clockLabel: '03:05',
        opener: {
            speaker: '阿阮',
            line: '医院楼顶天线截到半截呼救，老城电话全被当杂音掐了。上广播塔，喊全城老伙计起夜。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '我进了中继柜。今晚按过三次人工急停，全被批“权限不足”。这铁箱子不认活人了。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '塔顶静默阵列转起来了。退到红扇面外面，等它停火散热那两秒贴上去砸。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '喊通了，四号楼担架下去了。东岸西岸二十几个老站全蹲在闸口了，老陈先进了中央引擎室，只差总闸。',
        },
        archiveTitle: '三张盖红章的拒单',
        archiveNote: '02:23、02:25、02:28，老陈连按三次紧急撤回，打印机吐出来三张一模一样的纸：拒绝，负荷优化执行中。纸边还留着他拍机箱蹭上的机油印。',
        secretTitle: '加班密件 · 被标成杂音的 47 通电话',
        secretNote: '主塔后台封存了 47 通老城呼救，统统归类为“低价值重复噪声”。第 11 通来自江岸四号楼，断了又拨，一共重打了六回。',
    },
    '04': {
        chapterId: '04',
        clockLabel: '03:32',
        opener: {
            speaker: '陈栖',
            line: '离四点自动核销只剩二十分钟。旁路接口我全焊好了，调度核心召齐了安保机。小周，走吧。',
        },
        midTurn: {
            speaker: '陈栖',
            line: '转速掉下来了！我留在引擎室死摁手动阀防烧机。前面调度台交给你了，徒弟。',
        },
        bossIntro: {
            speaker: '阿阮',
            line: '核心把扇面、钢缆、红道全搬出来了。扛过它三段反扑，把总闸抢回活人手里。',
        },
        clearOutro: {
            speaker: '阿阮',
            line: '核心哑火了！各站，合闸！你看江对面，桥头到山坡一排排全亮了。老陈爬出引擎室，正蹲门口点烟呢。',
        },
        epilogueHook: {
            speaker: '港区老马',
            line: '喂，江岸值班室？零号协议临停把余电和疯龙门吊全甩咱老码头了！快来搭把手！',
        },
        archiveTitle: '凌晨 04:05 · 窗口透出的黄灯',
        archiveNote: '核销倒计时停在 03:58。撤编通知被阿阮随手贴在了废件箱盖上。老陈说他天亮去交辞呈，转身把那套初代六臂老架留在了你的工作台上。',
        secretTitle: '加班密件 · 零号专线背后的港口账',
        secretNote: '核心停机前 0.3 秒，把剩余协议整包转送老港区 3 号变电站。指令发件方不是市政电网，而是一个没署名的私港冷链账户。',
    },
};

export const RIG_FLAVOR: Readonly<Record<RigId, string>> = {
    duty_standard: '穿了三年的蓝工装，袖口磨毛了，挂啥工具都顺手。',
    heavy_fitter: '锅炉房老周留下的衬钢围裙，走得慢，顶车不晃。',
    high_voltage: '阿阮拔掉限流阀的试车背心，满架窜电花，身板脆。',
    thermal_welder: '冷链库扯来的加压焊工装，火头能熔铁锁，顾不上绑甲。',
    scrap_auditor: '老陈塞满调拨条的灰大衣，拆一台赚两台，招安保机眼红。',
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
                clockLine: '凌晨 04:05 · 全城金印值守',
                radio: { speaker: '陈栖', line: '四条死线夜班全压住了，这套六臂架子交到你手里我放心。' },
            };
        }
        if ((profile.bestEndlessWave ?? 0) > 0) {
            return {
                clockLine: `凌晨 04:05 · 港区撑过第 ${profile.bestEndlessWave} 波`,
                radio: { speaker: '港区老马', line: '老码头那几台龙门吊又转起来了，腾出手再来顶几波？' },
            };
        }
        return {
            clockLine: '凌晨 04:05 · 江岸亮灯，老马急电',
            radio: { speaker: '港区老马', line: '江岸亮了，余电全甩到咱码头了！去出勤页翻到港区无尽来救场！' },
        };
    }
    if (cleared.has('03')) {
        return {
            clockLine: '凌晨 03:32 · 全城守闸，只差总台',
            radio: { speaker: '陈栖', line: '离四点核销只剩二十分钟，我先去引擎室顶着，你随时进总台。' },
        };
    }
    if (cleared.has('02')) {
        return {
            clockLine: '凌晨 03:05 · 电池出库，频道被掐',
            radio: { speaker: '阿阮', line: '医院有电了，可四号楼求救电话全被静音塔拦着，咱得上主塔喊话。' },
        };
    }
    if (cleared.has('01')) {
        return {
            clockLine: '凌晨 02:38 · 江岸通电，货场告急',
            radio: { speaker: '阿阮', line: '医院急救电池被货场拖走了，而且回收单上印的竟然是老陈的工号。' },
        };
    }
    if (profile.onboardingDone || profile.credits > 0) {
        return {
            clockLine: '江岸维修站 · 凌晨 02:21',
            radio: { speaker: '阿阮', line: '茶还温着，回工坊垫厚点挂架再去把配电站的总闸抢回来。' },
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
        if (chapterId === '01') return { speaker: '阿阮', line: '那铁门板红道扫得真宽。先喝口热的，并出两三阶工具再去硬撬。' };
        if (chapterId === '02') return { speaker: '陈栖', line: '大拖车绞盘拉绳前会亮半秒，得横着迈。歇会儿，换把破壳家伙再上。' };
        if (chapterId === '03') return { speaker: '阿阮', line: '静默阵列扇面太密，别贪那两下。补点步速和护甲，抓它停火空档。' };
        return { speaker: '陈栖', line: '引擎室我还能稳十分钟。核心三段换招快，回工坊垫硬护具再进来。' };
    }
    if (failedWave <= 3) {
        if (danger >= 1) return { speaker: '阿阮', line: '这班升级令确实凶，起手别光买散件，先趁便宜把武器槽填起来。' };
        return { speaker: '阿阮', line: '没事，拖索把你拉回来了。前两波先把几把家伙凑齐，走位绕大圈就行。' };
    }
    if (failedWave === 5 || failedWave === 8) {
        if (chapterId === '02' || chapterId === '04') {
            return { speaker: '陈栖', line: '中段堵得太死，商店看见好货别忘了压货，凑亮一路手艺清场快得多。' };
        }
        return { speaker: '阿阮', line: '被主管机堵在半道了？刚才那波确实扎手，回工坊改改挂架再去。' };
    }
    if (chapterId === '02' || chapterId === '04') {
        return { speaker: '陈栖', line: '撑到这儿离关底就差两步了。多补点护甲和自修，下一趟准能砸穿。' };
    }
    return { speaker: '阿阮', line: '就差临门一脚了。铜件别全攥手里，该翻箱找并机升阶就果断翻。' };
}

/** Optional story-beat chatter shown in the shop info strip before pivotal waves (W5 elite & W12 boss). */
export function shopStoryBeatHint(chapterId: ChapterId, nextWaveNum: number): string | null {
    if (nextWaveNum === 5) {
        if (chapterId === '01') return '阿阮：前面就是调度分站，拆掉主管机我去翻断电原单。';
        if (chapterId === '02') return '阿阮：快到分拣带了，频道里刚切进个熟人声音……';
        if (chapterId === '03') return '陈栖：中继机柜就在前头，砸开守卫我就能核对撤单日志。';
        return '陈栖：下一波进旁路引擎室，转速快撑不住了，备足硬货！';
    }
    if (nextWaveNum === 12) {
        if (chapterId === '01') return '阿阮：前面是守门机，最后一次翻箱，把能并机的全合了！';
        if (chapterId === '02') return '陈栖：北门大拖车就在前面，补满护甲和血线再出门。';
        if (chapterId === '03') return '阿阮：塔顶就剩静默阵列了，四号楼还在电话上等着呢！';
        return '阿阮：三点五十四了，前面就是调度核心，全架拉满砸进去！';
    }
    return null;
}
