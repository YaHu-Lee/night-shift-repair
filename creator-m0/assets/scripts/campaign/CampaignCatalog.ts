import { CAMPAIGN_01_RULES, CAMPAIGN_02_RULES, CAMPAIGN_FIELD, TOOLS } from '../m1/content';
import type { RunRules, ToolId } from '../m1/content';
import { campaignPressureRules } from './CampaignPressure';
import { CAMPAIGN_STARTERS, CAMPAIGN_WAVE_PLANS, campaignRules } from './CampaignWaves';
import type { AuthoredStageId } from './CampaignWaves';

export const CAMPAIGN_MAP_HEIGHT = 1040;
export const CAMPAIGN_MAP_LOWER_HEIGHT = 640;

interface ChapterPoint {
    /** Normalized coordinates measured from the top left of the full chapter map. */
    readonly x: number;
    readonly y: number;
}

interface CampaignChapter {
    readonly id: string;
    readonly title: string;
    readonly route: string;
    readonly map: string;
    readonly mapUpper?: string;
    readonly routePoints: readonly ChapterPoint[];
    readonly restored: string;
}

// The quay coordinates follow the bridge and feeder ramps painted into chapter 01.
const quay = [
    [143, 1674], [50, 1682], [36, 1612], [66, 1563], [139, 1510], [192, 1443],
    [283, 1380], [390, 1343], [515, 1300], [633, 1253], [674, 1214], [623, 1184],
    [690, 1164], [680, 1112], [643, 1042], [600, 986], [522, 947], [379, 951], [248, 912],
    [399, 936], [564, 914], [487, 854], [561, 818], [660, 749], [636, 686], [558, 643],
    [437, 603], [378, 537], [259, 511], [208, 486], [325, 441], [219, 403], [181, 374], [267, 312],
].map(([x, y]) => ({ x: x / 724, y: y / 2172 }));

export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = [
    {
        id: '01', title: '全城断电', route: '江岸供电线', map: 'chapter-01', mapUpper: 'chapter-01-upper',
        routePoints: quay,
        restored: '靠江那排窗户亮了。',
    },
    {
        id: '02', title: '被抹掉的救援', route: '救援货运线', map: 'chapter-02',
        routePoints: [
            [0.66, 0.83], [0.54, 0.735], [0.43, 0.638], [0.66, 0.568], [0.70, 0.465],
            [0.56, 0.40], [0.57, 0.319], [0.57, 0.227], [0.48, 0.15],
        ].map(([x, y]) => ({ x, y })),
        restored: '医院、泵站都领到了电池。',
    },
    {
        id: '03', title: '消失的求救', route: '站台广播线', map: 'chapter-03',
        routePoints: [
            [0.36, 0.82], [0.52, 0.738], [0.67, 0.64], [0.60, 0.54], [0.48, 0.46],
            [0.42, 0.382], [0.54, 0.305], [0.60, 0.229], [0.66, 0.145],
        ].map(([x, y]) => ({ x, y })),
        restored: '东岸、西岸、北街都听见了广播。',
    },
    {
        id: '04', title: '把灯还给街区', route: '本地接管线', map: 'chapter-04',
        routePoints: [
            [0.53, 0.81], [0.56, 0.719], [0.54, 0.625], [0.43, 0.557], [0.47, 0.48],
            [0.50, 0.401], [0.49, 0.305], [0.50, 0.233], [0.53, 0.155],
        ].map(([x, y]) => ({ x, y })),
        restored: '各站已合闸。',
    },
];

interface CampaignArchiveClue {
    readonly title: string;
    readonly text: string;
}

export interface CampaignStage {
    readonly id: string;
    readonly chapter: string;
    readonly title: string;
    readonly prerequisite: string | null;
    readonly contentVersion: number;
    /** Zero-based final wave written by Run's durable checkpoint. */
    readonly finalWave: number;
    readonly firstClearWeapon: ToolId | null;
    readonly plannedMinutes: number;
    readonly rules: RunRules;
    readonly arena: string;
    readonly brief: string;
    readonly goal: string;
    readonly clear: string;
    readonly failure: string;
    readonly anchor: ChapterPoint;
    readonly routeIndex: number;
    readonly chapterEnd: boolean;
    readonly radio?: string;
    readonly archiveClue?: CampaignArchiveClue;
}

interface StageText {
    readonly title: string;
    readonly brief: string;
    readonly goal: string;
    readonly clear: string;
    readonly failure: string;
    readonly reward?: ToolId;
    readonly bossTitle?: string;
    readonly radio?: string;
    readonly archiveClue?: CampaignArchiveClue;
}

const dispatches: readonly StageText[] = [
    {
        title: '配电站', brief: '阿阮：二楼那户问我是不是跳闸。我一看，对面也黑了。',
        goal: '清完 5 波，击败巡检机。',
        clear: '配电站 02:13 收到切电指令，故障栏空着。',
        failure: '巡检机一冲过来就横着躲。等它停下再靠近。',
        reward: 'arc_gun',
    },
    {
        title: '地下泵房', brief: '阿阮：泵房值班员说先黑的灯，后停的泵。两边的钟得对一下。',
        goal: '击败泵房的巡检机。',
        clear: '02:14，泵房才报过载。先断的电。切电原单在分站。',
        failure: '冲车朝你亮灯就横移，躲开再回头打。',
        reward: 'hydraulic_nailer',
    },
    {
        title: '调度分站', brief: '阿阮：分站打印过原单。右下角应该有地址，能查出是哪儿发的。',
        goal: '击败分站主管。',
        clear: '签发端是中央调度台。单子上空着恢复时间。',
        failure: '炮线亮了就侧移。等主管停火再过去。',
    },
    {
        title: '高架馈线', brief: '阿阮：桥下早没电了，高架上那只表还在走。',
        goal: '击败馈线领队。',
        clear: '两头的表对上了。停了各区的电，全拨给零号线路。',
        failure: '追击机直跑会提速。拐个弯，让它跟着转。',
        bossTitle: '馈线领队', radio: '阿阮：我找着总表了。等领队停下来，我去对数。',
    },
    {
        title: '分区变电所', brief: '阿阮：江岸的闸能单独合。楼下的人我先劝开了。',
        goal: '击败并联守门机。',
        clear: '江岸的电表走了。医院又打来电话，问电池装车了没有。',
        failure: '离开亮起来的那条带。等守门机扫完再靠近。',
        reward: 'pulse_nozzle', radio: '阿阮：医院值班员让我先别挂。他要等车牌号。',
    },
    {
        title: '接驳仓', brief: '阿阮：车早就装好了。库管看见回收章，钥匙没敢给医院。',
        goal: '击败回收班长。',
        clear: '新货签盖住了旧签。揭开一角，下面还是医院的地址。',
        failure: '回收机拉出索线时，从旁边绕过去。',
        bossTitle: '回收班长',
    },
    {
        title: '冷链库', brief: '阿阮：医院原先排第三。库管刚从冷库拿来一张新单。',
        goal: '击败制冷护卫。',
        clear: '医院被调到了最后一行。排头的回收站还没开门。',
        failure: '炮台一瞄准就换位置，冲车起步时往侧面走。',
        bossTitle: '制冷护卫',
    },
    {
        title: '物资分拣带', brief: '阿阮：分拣带旁有人手收货。你去清路，我问问谁改的签。',
        goal: '击败分拣领班。',
        clear: '改签单附着应急单号，签字的是陈栖。阿阮拨到第三遍，他接了。',
        failure: '先绕开回收索，再换个角度打炮台。',
        bossTitle: '分拣领班',
    },
    {
        title: '货梯井', brief: '陈栖：应急单是我签的。钥匙盒底下有张图，你清完我去取。',
        goal: '击败锁梯领队。',
        clear: '图上圈着两处签字栏。医院签一处，街区从广播站回一份。',
        failure: '从侧面拆掉炮台，给自己腾出躲冲车的地方。',
        bossTitle: '锁梯领队', radio: '陈栖：我试过手动。医院那端也得有人。',
    },
    {
        title: '封锁货场', brief: '阿阮：医院的司机在北门。那台拖车刚把他又赶回去。',
        goal: '击败拖拽回收车。',
        clear: '北门开了。医院和泵站领走电池，医院值班员签了第一份授权。',
        failure: '吊索一亮就往侧边走。趁它收索再上。',
        reward: 'traction_coil', radio: '阿阮：司机出去了。医院说屋顶的天线收到了一点人声。',
        archiveClue: {
            title: '授权一 · 医院交接',
            text: '电池：医院、泵站各自签收。\n医院值班室：同意将机柜切回手动。',
        },
    },
    {
        title: '信号维护口', brief: '阿阮：医院屋顶的天线能收到人声。中央转来的那路全是杂音。',
        goal: '击败屏蔽领队。',
        clear: '六段录音都标着「重复噪声」。阿阮倒回去，听见有人在报门牌。',
        failure: '干扰机的天线亮了就退远些。追击机跟来就拐弯。',
        bossTitle: '屏蔽领队',
    },
    {
        title: '停驶站台', brief: '阿阮：有一段报到「四号楼」就断了。站台应该存着后半段。',
        goal: '击败站台守卫。',
        clear: '「四号楼，三楼转角。楼梯没灯，担架下不去。别挂啊。」',
        failure: '脚灯亮起就走开，等埋伏机现身再打。',
        bossTitle: '站台守卫',
    },
    {
        title: '中继机房', brief: '阿阮：中央那份日志少了几行。机房里还有副本，我去对时间。',
        goal: '击败中继守卫。',
        clear: '两份日志对上了。零号线一加电，断电街区的电话也断了。',
        failure: '护甲机挡住炮台时，从两边绕过去。',
        bossTitle: '中继守卫',
    },
    {
        title: '档案夹层', brief: '陈栖：签名下面有到期时间。撤单回执在下一页，一共三张。',
        goal: '击败档案守卫。',
        clear: '原单只批了十分钟。三张撤单回执，结果栏都写着「拒绝」。',
        failure: '把追击机带离炮台再打。护甲机从侧后打。',
        bossTitle: '档案守卫', radio: '陈栖：第三次是当面撤的。医院那头一直等我回话。',
    },
    {
        title: '广播主塔', brief: '阿阮：四号楼的地址我贴电话上了。塔一通，我先念那条。',
        goal: '击败静默阵列。',
        clear: '地址播出去了。东岸、西岸和北街应答，同意切回本地供电。',
        failure: '走到亮区外，等扫光过去再靠近。',
        reward: 'split_probe', radio: '阿阮：担架下去了。接电话那位一直没舍得挂。',
        archiveClue: {
            title: '授权二 · 广播联络',
            text: '东岸、西岸、北街：求救广播收到。\n准许把机柜切回手动。各站有人守闸。',
        },
    },
    {
        title: '回路入口', brief: '陈栖：两份都签了。我在入口的柜子旁等，手动开关就在这儿。',
        goal: '击败回路封锁机。',
        clear: '本地开关能扳动了。陈栖叫阿阮把备用电池车往里开。',
        failure: '先躲开冲车，再从护甲机侧面绕向炮台。',
        bossTitle: '回路封锁机',
    },
    {
        title: '交叉开关层', brief: '阿阮：备用电池到路口了。回收机还认原来的货签，跟了上来。',
        goal: '击败路口领队。',
        clear: '接上备用电池，江岸、医院和北街的表都有了读数。',
        failure: '看见索线就往侧边走。干扰机天线亮了就拉开。',
        bossTitle: '路口领队',
    },
    {
        title: '旁路引擎室', brief: '陈栖：听见没有？转速又下来了。我看着引擎，你去找破坏机。',
        goal: '击败破坏机。',
        clear: '试送完，两边电表都没跳。陈栖守引擎，阿阮挨站叫人去开关旁。',
        failure: '绕到护甲机侧后，先打它身后的炮台。',
        bossTitle: '破坏机',
    },
    {
        title: '接管前厅', brief: '阿阮：医院的签字在我兜里。广播那份也印出来了，都带着。',
        goal: '击败前厅守卫。',
        clear: '两份签字都验过了，机柜开锁。陈栖把话筒递给阿阮。',
        failure: '冲车亮灯就换边，留意另一头的炮台。',
        bossTitle: '前厅守卫', radio: '陈栖：听见阿阮点到你的站，再合闸。',
    },
    {
        title: '中央调度台', brief: '阿阮：各站都回话了，四号楼也在电话上。你动手吧，我听着。',
        goal: '击毁调度核心。',
        clear: '调度核心停机。各站逐一合闸，四号楼有人试按了两回楼道灯。',
        failure: '躲开扇面、索线和光带。趁核心停手时打。',
        reward: 'bypass_wrench', radio: '阿阮：四号楼问你还在楼下吗。他们烧了壶水。',
        archiveClue: {
            title: '港区来信',
            text: '零号线路 · 港区回信\n「码头这边有电。你们动过零号线吗？」',
        },
    },
];

const LEGACY_RULES = [CAMPAIGN_01_RULES, CAMPAIGN_02_RULES];
const QUAY_ROUTE_INDEXES = [0, 11, 18, 25, 33];
const heldWeapons: ToolId[] = [];

function stageId(index: number): string {
    return String(index + 1).padStart(2, '0');
}

export const CAMPAIGN_CATALOG: readonly CampaignStage[] = dispatches.map((dispatch, index) => {
    const id = stageId(index);
    const inChapter = index % 5;
    const chapter = CAMPAIGN_CHAPTERS[Math.floor(index / 5)];
    const routeIndex = chapter.id === '01' ? QUAY_ROUTE_INDEXES[inChapter] : inChapter * 2;
    const end = inChapter === 4;
    const authored = id as AuthoredStageId;
    const legacy = LEGACY_RULES[index];
    let rules: RunRules = legacy
        ? { ...legacy, waves: legacy.waves.map(({ livePuddles: _puddles, ...wave }) => wave),
            startingTools: CAMPAIGN_STARTERS, field: CAMPAIGN_FIELD,
            encounter: { enemyCap: 36, revive: true, overtime: index === 0, combatOnly: true } }
        : campaignRules(authored, heldWeapons);
    rules = campaignPressureRules(id, rules);
    const { title, brief, goal, clear, failure, reward, bossTitle, radio, archiveClue } = dispatch;
    if (bossTitle && rules.encounter) rules = { ...rules, encounter: { ...rules.encounter, bossTitle } };
    if (reward) heldWeapons.push(reward);
    return {
        id, chapter: chapter.id, title, prerequisite: index ? stageId(index - 1) : null,
        contentVersion: rules.contentVersion, finalWave: rules.waves.length - 1,
        firstClearWeapon: reward ?? null, plannedMinutes: legacy ? 6 : CAMPAIGN_WAVE_PLANS[authored].minutes,
        arena: index === 0 ? 'yard' : index === 1 ? 'pump-floor' : `stage-${id}`,
        brief, goal, clear, failure, rules, anchor: chapter.routePoints[routeIndex], routeIndex, chapterEnd: end,
        radio, archiveClue,
    };
});

export type CampaignMode = 'normal' | 'overtime_1' | 'overtime_2';

export function rulesForCampaign(stage: CampaignStage, mode: CampaignMode): RunRules {
    if (mode !== 'normal' && !stage.rules.encounter?.overtime) throw new Error('Overtime is only available at 配电站');
    return stage.rules;
}

export function campaignStage(id: string): CampaignStage | undefined {
    return CAMPAIGN_CATALOG.find((stage) => stage.id === id);
}

export function campaignRewardText(stage: CampaignStage): string {
    return stage.firstClearWeapon ? `已解锁工具：${TOOLS[stage.firstClearWeapon].name}` : stage.chapterEnd ? '街区已复电' : '工单已完成';
}
