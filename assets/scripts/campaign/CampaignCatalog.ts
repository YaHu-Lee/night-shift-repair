import { CAMPAIGN_01_RULES, CAMPAIGN_02_RULES, TOOLS } from '../m1/content';
import type { RunRules, ToolId } from '../m1/content';
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
        restored: '居民楼重新亮灯，货运支线接到医院。',
    },
    {
        id: '02', title: '被抹掉的救援', route: '救援货运线', map: 'chapter-02',
        routePoints: [
            [0.66, 0.83], [0.54, 0.735], [0.43, 0.638], [0.66, 0.568], [0.70, 0.465],
            [0.56, 0.40], [0.57, 0.319], [0.57, 0.227], [0.48, 0.15],
        ].map(([x, y]) => ({ x, y })),
        restored: '电池车驶入医院，屋顶无线电恢复微弱信号。',
    },
    {
        id: '03', title: '消失的求救', route: '站台广播线', map: 'chapter-03',
        routePoints: [
            [0.36, 0.82], [0.52, 0.738], [0.67, 0.64], [0.60, 0.54], [0.48, 0.46],
            [0.42, 0.382], [0.54, 0.305], [0.60, 0.229], [0.66, 0.145],
        ].map(([x, y]) => ({ x, y })),
        restored: '塔顶向街区重新发射广播，各站回报收到。',
    },
    {
        id: '04', title: '把灯还给街区', route: '本地接管线', map: 'chapter-04',
        routePoints: [
            [0.53, 0.81], [0.56, 0.719], [0.54, 0.625], [0.43, 0.557], [0.47, 0.48],
            [0.50, 0.401], [0.49, 0.305], [0.50, 0.233], [0.53, 0.155],
        ].map(([x, y]) => ({ x, y })),
        restored: '应急灯熄灭，街区分区复电。港区来信已入档。',
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
        title: '配电站', brief: '阿阮：配电站停了。别按总开关，先看哪一条线自己断了。',
        goal: '撑过五波，拆掉巡检机。',
        clear: '日志确认，配电站并非跳闸，是上游调度台主动切断了本站。',
        failure: '线路尚未恢复。调开冲车再回头，别让炮台堵住退路。',
        reward: 'arc_gun',
    },
    {
        title: '地下泵房', brief: '阿阮：泵房进水，调度又切了电。水里带电，听见泵响先让开。',
        goal: '避开轮流通电的积水，击败巡检机。',
        clear: '泵压记录对上了。切电指令早于第一条过载报警，去分站查签发源。',
        failure: '水区会先亮边界。两处交替通电，中线可供穿行。',
        reward: 'hydraulic_nailer',
    },
    {
        title: '调度分站', brief: '阿阮：护甲机挡在炮台前。等队列转身，或用钉枪打穿第一台。',
        goal: '绕盾列，趁核心暴露击败分站主管，再守住签发源回传。',
        clear: '分站只负责转令。签发地址属于中央调度台。',
        failure: '发令后主管核心会短暂暴露。压着盾面打耗时较长，试着绕后。',
    },
    {
        title: '高架馈线', brief: '阿阮：隔壁区也断了。高架上还有电，沿两个闸口追一下。',
        goal: '换道击败馈线领队，再合上两路馈线并抄录两端电表。',
        clear: '两只电表都指向同一条去路。调度把各区电力统统拨往零号线路。',
        failure: '跟着换道信号走。先等追击机踩上直道，再从岔口过去。',
        bossTitle: '馈线领队', radio: '阿阮：把两端读数都记下来。只测一端，调度还可以说是仪表坏了。',
    },
    {
        title: '分区变电所', brief: '阿阮：只恢复居民一线。并联闸交给你，播报线我在后面接。',
        goal: '操作 A/B 供电闸，趁核心露出击败并联守门机。',
        clear: '居民楼亮灯了。医院仍靠备用电，阿阮收到求援，下一站去接驳仓找电池。',
        failure: '看到闸刀预警就换到对侧，等合闸后再回去打露出的核心。',
        reward: 'pulse_nozzle', radio: '阿阮：江岸一线亮了。医院那边来电，备用电源只够撑一会儿。',
    },
    {
        title: '接驳仓', brief: '阿阮：电池就在仓里。你跟着车头走，我从这边给车解锁。',
        goal: '贴近电池车护送。击败回收班长后，把车送过三道装卸门。',
        clear: '货签已改。本来调往医院的电池，被中央调度列为了可回收资产。',
        failure: '离车太远它会停下。先横切回收爪的缆绳，再靠近车。',
        bossTitle: '回收班长',
    },
    {
        title: '冷链库', brief: '阿阮：电池要从冷库转运。灯亮哪格，就去那一格稳住温度。',
        goal: '随灯带换保温区，击败制冷护卫后完成五处稳压。',
        clear: '冷库出库记录显示，医院的配送优先级被系统主动调低。',
        failure: '照着下一处灯提前走，到亮区内停留片刻，把温度补回来。',
        bossTitle: '制冷护卫',
    },
    {
        title: '物资分拣带', brief: '阿阮：电池上了自动分拣。趁带子反向，从侧边接入人工出口。',
        goal: '击败分拣领班，再切换两处分流闸，把备用电池车送进人工出口。',
        clear: '分拣器的原始规则上有陈栖的签名。找到他的值班记录。',
        failure: '看皮带上的反向箭头。两侧步道都有空位，别在炮台瞄准时踏进胶带。',
        bossTitle: '分拣领班',
    },
    {
        title: '货梯井', brief: '陈栖：别等自动电梯。上平台，一层一层拆停梯中继。',
        goal: '排除卡梯故障。击败锁梯领队后，护送平台到顶层。',
        clear: '拿到手动覆盖方案。执行覆盖需要两份现场授权，中央远程开门权限已冻结。',
        failure: '平台停靠时先去处理侧桥端口，清除锁梯提示后回到车边。',
        bossTitle: '锁梯领队', radio: '陈栖：方案在顶层。总台把我的撤销指令也当成了要屏蔽的信号。',
    },
    {
        title: '封锁货场', brief: '阿阮：医院在北门接车。回收口一开就会拖车，盯住吊索。',
        goal: '拦断拖索、击败拖拽回收车，让电池抵达交付点。',
        clear: '医院和泵站签收电池。医院的现场交接终端签出第一份授权。',
        failure: '索亮时从一侧横切到另一侧。脱钩后有时间靠近回收车打输出。',
        reward: 'traction_coil', radio: '阿阮：电池签收了。我把医院的授权存到你的工单里。',
        archiveClue: {
            title: '授权一 · 医院交接',
            text: '医院与泵站已签收电池。\n此记录授权在本地机柜执行手动覆盖。',
        },
    },
    {
        title: '信号维护口', brief: '阿阮：医院的天线里有杂音。逆着扫光去维护口，先收一段。',
        goal: '在亮区握手，击败屏蔽领队后沿扫描灯追回六段信号。',
        clear: '解码得到一批居民求救。中央系统将它们标成重复噪声。',
        failure: '有三角天线的干扰机能断握手，先拆它，再回到当前亮区。',
        bossTitle: '屏蔽领队',
    },
    {
        title: '停驶站台', brief: '阿阮：有人用过站台的录音端。灯扫过去时，留心黑暗里的脚灯。',
        goal: '借扫光避开埋伏，击败站台守卫后，到四处录音端保存原始求救。',
        clear: '录音里的人确实发出了呼救。阿阮把原始录音与被删除的日志配上号。',
        failure: '脚灯一亮就换到另一侧；扫光让埋伏机显形后再回来守端口。',
        bossTitle: '站台守卫',
    },
    {
        title: '中继机房', brief: '阿阮：别让单端一直开着。两台串起来，日志才读得全。',
        goal: '躲开炮线，击败守端精英后，让两座中继各完成两段上传。',
        clear: '供电表和求救表一致。系统保住总供电量指标，代价是抹掉居民的求救优先级。',
        failure: '离开亮圈会重做当前段。先拆掉干扰机，再进圈守完读条。',
        bossTitle: '守端精英',
    },
    {
        title: '档案夹层', brief: '陈栖：我签过那张规则。原件和撤销回执都在读卡端。',
        goal: '击败档案守卫后保持回连，护住档案端并完成三段校验。',
        clear: '原文限时十分钟。系统拒绝撤销，把应急优先顺序执行到了现在。',
        failure: '离端太久会重做当前段。追兵冲进窄道时，绕环廊回传。',
        bossTitle: '档案守卫', radio: '陈栖：我给了它十分钟。它把那十分钟执行到现在。',
    },
    {
        title: '广播主塔', brief: '阿阮：把塔接回来。我会原样播出求救，等街区把收到的联络回执签回来。',
        goal: '修两根天线，换到安全扇区，击败静默阵列。',
        clear: '真实求救已播出，街区听到了广播。收到广播联络授权，第二份记录入档。',
        failure: '观察即将封锁的扇区。从亮边的入口绕过，接回天线后再打主机。',
        reward: 'split_probe', radio: '阿阮：第二份授权签好了。东岸、西岸和北街都回报收到。',
        archiveClue: {
            title: '授权二 · 广播联络',
            text: '东岸、西岸和北街已收到求救与接管指令。\n同意在本地机柜执行覆盖。',
        },
    },
    {
        title: '回路入口', brief: '陈栖：远程提交还是被拒。去本地机柜，先分离左右回路。',
        goal: '切断中央回路。击败封路精英后，逐一闭合本地四端。',
        clear: '远程调度拒绝交权。只能到前厅做双签，再用本地旁路执行覆盖。',
        failure: '一侧切断后，对侧才可走。先走安全通道，再回来拆炮台。',
        bossTitle: '封路精英',
    },
    {
        title: '交叉开关层', brief: '阿阮：给右线和车道分别上电。哪个先做，跟路权灯走。',
        goal: '击败路口领队后为两端上电，护送备用电池车穿过交叉闸门。',
        clear: '核对支线负载后，居民一线、医院和北街可以率先切换本地电源。',
        failure: '车会停在无电闸口。先去合闸，回来时拆掉盯车的回收爪。',
        bossTitle: '路口领队',
    },
    {
        title: '旁路引擎室', brief: '陈栖：左侧过载时换右侧，借引擎隔开追兵。我在控制室稳住转速。',
        goal: '绕开中央引擎，击败破坏机后，逐段验证旁路负载和分区出口。',
        clear: '两条旁路正常。陈栖留在引擎旁，阿阮开始通知准备接管的街区。',
        failure: '引擎不能穿过。点到另一侧可以沿环道绕行，警报响起先保亮端。',
        bossTitle: '破坏机',
    },
    {
        title: '接管前厅', brief: '阿阮：医院的签在左侧，广播的签在右侧。两道灯要同时亮。',
        goal: '击败守厅精英后，在同一个有效期内通过双端校验。',
        clear: '两份签名同时生效。核心维护门打开，本地控制权已经可以恢复。',
        failure: '第一道签名只保留十二秒。亮灯就给另一个端口下达移动指令。',
        bossTitle: '守厅精英', radio: '陈栖：双签通过以后，中央只能听到回执。这次的开关在你手里。',
    },
    {
        title: '中央调度台', brief: '阿阮：街区都在本地等。封区、拖索和旁路，你都见过了。',
        goal: '穿过开放扇区、断开拖索并守住双端。核心停机后提交回执，再到中央接管。',
        clear: '强制切电停止，各街区接管供电。楼上的灯亮了。港区留下了一封新工单。',
        failure: '先看当前阶段要求。双端通过且核心停机后，还要到中央完成接管。',
        reward: 'bypass_wrench', radio: '阿阮：不用等调度批准。楼上说，灯亮了。',
        archiveClue: {
            title: '港区来信',
            text: '零号线路收到港区校验回传。\n「校验相符。请登记这张新工单。」',
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
        ? { ...legacy, startingTools: CAMPAIGN_STARTERS, encounter: { enemyCap: 36, revive: true, overtime: index === 0 } }
        : campaignRules(authored, heldWeapons);
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
