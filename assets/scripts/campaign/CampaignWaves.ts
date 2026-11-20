import { M2_RULES, TICK_RATE } from '../m1/content';
import type { RegularEnemyId, RunRules, ToolId, WaveSpec } from '../m1/content';
import { GATEKEEPER_PORTS } from '../m1/Encounter';
import type { CampaignEncounter, WaveDirective } from '../m1/Encounter';

export const CAMPAIGN_STARTERS = [
    'wrench', 'arc_gun', 'hydraulic_nailer', 'pulse_nozzle',
    'traction_coil', 'split_probe', 'bypass_wrench',
] as const satisfies readonly ToolId[];

type Five<T> = readonly [T, T, T, T, T];
type Roster = readonly RegularEnemyId[];
type Objective = Omit<WaveDirective, 'minTicks'>;

interface WavePlan {
    readonly minutes: 6 | 7 | 8;
    readonly intervals: Five<number>;
    readonly rosters: Five<Roster>;
    readonly directives?: Five<Objective | undefined>;
    readonly finale?: Objective;
    /** An empty finale roster gives the player an uninterrupted fight. */
    readonly finaleRoster?: Roster;
    readonly finaleInterval?: number;
    /** Earliest ordinary spawn tick in the first wave, after its opening task is complete. */
    readonly firstWaveQuietUntil?: number;
    readonly liftGroups?: readonly WaveSpec['liftGroups'][];
    readonly encounter: Omit<CampaignEncounter, 'revive'>;
    readonly flood?: boolean;
}

const SCHEDULES = {
    6: { seconds: [35, 40, 45, 52, 58], timeLimit: 100 },
    7: { seconds: [40, 48, 55, 62, 65], timeLimit: 115 },
    8: { seconds: [45, 55, 63, 70, 77], timeLimit: 145 },
} as const;

const WEST = { x: 82, y: 353 };
const EAST = { x: 278, y: 353 };
const SOUTH = { x: 180, y: 224 };
const NORTH = { x: 180, y: 473 };
const CENTER = { x: 180, y: 353 };
const NORTHWEST = { x: 95, y: 460 };
const NORTHEAST = { x: 269, y: 456 };
const SOUTHWEST = { x: 94, y: 245 };
const SOUTHEAST = { x: 271, y: 244 };
const FLOOD = [
    { x: 85, y: 414, radius: 40, offset: 0 },
    { x: 274, y: 299, radius: 42, offset: 75 },
];

function objective(type: Objective['type'], points: Objective['points'], label: string,
    options: Omit<Partial<Objective>, 'type' | 'points' | 'label'> = {}): Objective {
    return { type, points, label, ...options };
}

const switchWest = objective('switch', [WEST], '合上西侧供电闸');
const switchEast = objective('switch', [EAST], '合上东侧供电闸');
const switchBoth = objective('switch', [WEST, EAST], '依次接通西闸和东闸');
const switchNorth = objective('switch', [NORTHEAST, NORTHWEST], '把电力转入北侧馈线');
const { a: powerA, b: powerB } = GATEKEEPER_PORTS;
const switchPowerA = objective('switch', [powerA], '在左侧 A 区合闸');
const switchPowerB = objective('switch', [powerB], '在右侧 B 区合闸');
const switchPowerAB = objective('switch', [powerA, powerB], '依次接通 A 区和 B 区');
const switchPowerBA = objective('switch', [powerB, powerA], '从 B 区切回 A 区');
const rehearseGatekeeper = objective('switch', [powerA, powerB], '先合 A 闸，等 B 区预警结束再换边', {
    powerDrill: true,
});
const isolateWest = objective('switch', [WEST], '切断西侧回路，打开对侧', { variant: 'bypass' });
const isolateEast = objective('switch', [EAST], '切断东侧回路，打开对侧', { variant: 'bypass' });
const isolateBoth = objective('switch', [WEST, EAST], '依次隔离两路中央电源', { variant: 'bypass' });

const loadCar = objective('escort', [SOUTH, CENTER], '跟紧电池车，护送至黄线', { wavesCarry: true });
const warehouseCar = objective('escort', [SOUTHWEST, CENTER, NORTHEAST], '护送电池车通过装卸口', { wavesCarry: true });
const gateCar = objective('escort', [SOUTH, WEST, NORTH], '护送电池车通过三道闸', { wavesCarry: true });
const yardCar = objective('escort', [SOUTH, CENTER, NORTHWEST], '保护电池车，避开回收口', { wavesCarry: true });
const liftEntry = objective('escort', [SOUTH, CENTER], '靠近货梯，让平台升到上一层', {
    variant: 'lift', wavesCarry: true,
});
const lift = objective('escort', [SOUTHWEST, CENTER, NORTHEAST], '陪平台过站并处理卡住的中继', {
    variant: 'lift', wavesCarry: true,
});
const liftTwoStops = objective('escort', [SOUTHWEST, CENTER, NORTHEAST, NORTHWEST], '接通两座侧桥中继，护住货梯', {
    variant: 'lift', wavesCarry: true,
});
const liftThreeStops = objective('escort', [SOUTHWEST, CENTER, NORTHEAST, NORTHWEST, NORTH], '逐层开侧桥，返回货梯继续上行', {
    variant: 'lift', wavesCarry: true,
});
const thermalWest = objective('thermal', [SOUTHWEST], '稳住西侧保温室', { holdTicks: 60 });
const thermalEast = objective('thermal', [SOUTHEAST, NORTHEAST], '跟随灯带切换保温室', { holdTicks: 60 });
const thermalAll = objective('thermal', [SOUTHWEST, NORTHEAST, SOUTHEAST], '完成三次保温稳压', { holdTicks: 60 });
const sorterIntro = objective('switch', [SOUTHWEST], '留意箭头换向，沿侧步道合闸');
const sorter = objective('switch', [SOUTHWEST, NORTHEAST], '切换两处分流口');
const sorterCar = objective('hybrid', [WEST, EAST, SOUTH, NORTH], '切两处分流闸，把车送进出口', {
    switchCount: 2, wavesCarry: true,
});

const firstScan = objective('scan', [EAST], '进入亮起的扇区接收信号', { holdTicks: 90 });
const secondScan = objective('scan', [EAST, WEST], '沿灯光接通两条信号线', { holdTicks: 90 });
const fullScan = objective('scan', [EAST, NORTH, WEST], '在三个扇区完成握手', { holdTicks: 90 });
const stationTape = objective('relay', [SOUTHEAST], '守住站台录音端', { wavesCarry: true });
const relayWest = objective('relay', [WEST], '守住西侧中继', { wavesCarry: true });
const relayEast = objective('relay', [EAST], '守住东侧中继', { wavesCarry: true });
const relayBoth = objective('relay', [WEST, EAST], '依次给两座中继上电', { wavesCarry: true });
const relayUnderFire = objective('relay', [WEST, EAST], '躲开炮线，依次给两座中继上电', {
    wavesCarry: true, rangedPressure: true, holdTicks: 150,
});
const relayAlternating = objective('relay', [WEST, EAST, WEST, EAST], '两座中继各完成两段上传', {
    wavesCarry: true,
});
const archive = objective('relay', [NORTHWEST, NORTHEAST, NORTHWEST], '保住回传，完成三段校验', {
    variant: 'archive', wavesCarry: true,
});
const archiveEntry = objective('relay', [NORTHWEST], '守住档案端口，离开后及时回连', {
    variant: 'archive', wavesCarry: true,
});
const antenna = objective('relay', [NORTHWEST], '修好天线并稳住信号', { wavesCarry: true });
const antennaPair = objective('relay', [NORTHWEST, NORTHEAST], '接回两根天线', { wavesCarry: true });
const roadCrossing = objective('hybrid', [WEST, SOUTH, CENTER, NORTHEAST], '先合闸，再跟车过路口', {
    switchCount: 1, wavesCarry: true,
});
const bothCrossings = objective('hybrid', [WEST, EAST, SOUTH, CENTER, NORTH], '给两端送电，护送电池车过闸', {
    switchCount: 2, wavesCarry: true,
});
const bypassWest = objective('relay', [WEST], '维持西侧旁路', {
    variant: 'bypass', holdTicks: 180, wavesCarry: true,
});
const bypassPair = objective('relay', [WEST, EAST], '轮流稳住两条旁路', {
    variant: 'bypass', holdTicks: 180, wavesCarry: true,
});
const bypassFull = objective('relay', [WEST, EAST, WEST, EAST], '两条旁路各承受两次负载', {
    variant: 'bypass', holdTicks: 180, wavesCarry: true,
});
const hospitalSign = objective('handoff', [WEST], '校验医院签发记录', { holdTicks: 120 });
const towerSign = objective('handoff', [EAST], '校验广播签发记录', { holdTicks: 120 });
const bothSigns = objective('handoff', [WEST, EAST], '在 12 秒内完成双端校验', {
    holdTicks: 120, windowTicks: 360,
});

function afterBoss(type: Objective['type'], points: Objective['points'], label: string,
    options: Omit<Partial<Objective>, 'type' | 'points' | 'label' | 'afterBoss'> = {}): Objective {
    return objective(type, points, label, { ...options, afterBoss: true });
}

const retrieveDispatch = afterBoss('relay', [NORTHWEST, SOUTHWEST, NORTHEAST], '读取签发源，保住分站回传', {
    holdTicks: 180, variant: 'archive',
});
const traceFeeder = afterBoss('switch', [SOUTHWEST, NORTHWEST, NORTHEAST, SOUTHEAST], '复闭两路馈线后抄录两端电表', {
    holdTicks: 150,
});
const loadBattery = afterBoss('escort', [SOUTHWEST, NORTHEAST, NORTHWEST, SOUTHEAST, EAST, NORTH], '把电池随车送过三道装卸门', {
    wavesCarry: true,
});
const validateCooling = afterBoss('thermal', [SOUTHWEST, NORTHEAST, SOUTHEAST, NORTHWEST, SOUTH], '依灯带转运，完成五处交接稳压', {
    holdTicks: 150,
});
const divertBattery = afterBoss('hybrid', [SOUTHWEST, NORTHEAST, SOUTH, EAST, NORTHWEST, WEST, NORTH],
    '换备用电池车，转人工闸，从侧边步道送入出口', { switchCount: 2, holdTicks: 150 });
const liftToOffice = afterBoss('escort', [SOUTHWEST, NORTHEAST, NORTHWEST, SOUTHEAST, NORTH], '开侧桥中继，陪货梯进顶层档案室', {
    variant: 'lift', wavesCarry: true,
});
const recoverSignal = afterBoss('scan', [EAST, NORTH, WEST, SOUTH, NORTHEAST, NORTHWEST], '沿扫描灯追回六段被删信号', {
    holdTicks: 120,
});
const copyTape = afterBoss('relay', [SOUTHEAST, NORTHEAST, SOUTHWEST, NORTHWEST], '在四处录音端守住原始求救副本', {
    wavesCarry: true,
});
const certifyRelays = afterBoss('relay', [WEST, EAST, WEST, EAST], '两座中继各完成两段上传',
    { wavesCarry: true });
const closeArchive = afterBoss('relay', [NORTHWEST, NORTHEAST, NORTHWEST], '保住回传，完成三段校验', {
    holdTicks: 180, variant: 'archive', wavesCarry: true,
});
const isolateCentral = afterBoss('switch', [SOUTHWEST, NORTHWEST, SOUTHEAST, NORTHEAST], '隔离中央信号，逐一闭合本地四端回路', {
    holdTicks: 150, variant: 'bypass',
});
const authorizeRoad = afterBoss('hybrid', [WEST, EAST, SOUTHWEST, NORTHEAST, NORTHWEST, SOUTHEAST, NORTH],
    '给路口送电，引导备用电池车驶过锁闭区', { switchCount: 2, holdTicks: 150 });
const routePower = afterBoss('relay', [WEST, NORTH, EAST, SOUTH, WEST, EAST], '绕开引擎，依次验证旁路负载和分区出口', {
    wavesCarry: true, variant: 'bypass', holdTicks: 180,
});
const certifySignatures = afterBoss('handoff', [WEST, EAST], '核对医院与广播签名，保持两端同时生效', {
    holdTicks: 210, windowTicks: 360,
});
const rehearseSectorTurn = objective('scan', [EAST, WEST], '接通亮起的扇区，灯带换向时换边', { holdTicks: 90 });
const rehearseBypass = objective('handoff', [WEST, EAST], '在 12 秒内接通双端旁路', {
    holdTicks: 120, windowTicks: 360,
});
const confirmDispatch = afterBoss('handoff', [WEST, EAST], '把准备回执交给两处街区端口', {
    holdTicks: 180, windowTicks: 360,
});

export const CAMPAIGN_WAVE_PLANS = {
    '03': {
        minutes: 6, intervals: [42, 40, 38, 36, 34],
        rosters: [
            ['armored', 'crawler', 'crawler', 'crawler'],
            ['armored', 'turret', 'crawler', 'crawler'],
            ['crawler', 'armored', 'turret', 'armored', 'crawler'],
            ['armored', 'crawler', 'turret', 'crawler', 'armored', 'turret'],
            ['armored', 'turret', 'charger', 'crawler', 'crawler', 'armored'],
        ],
        finale: retrieveDispatch, finaleRoster: ['armored', 'crawler'], finaleInterval: 120,
        encounter: { enemyCap: 12, boss: 'supervisor', bossHp: 58, armorLine: true },
    },
    '04': {
        minutes: 7, intervals: [43, 40, 36, 34, 32],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler'],
            ['pursuer', 'crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler', 'armored'],
            ['turret', 'pursuer', 'crawler', 'armored', 'pursuer', 'crawler'],
        ],
        directives: [switchWest, switchEast, switchBoth, switchNorth, switchBoth],
        finale: traceFeeder, finaleRoster: ['pursuer', 'crawler'],
        encounter: { enemyCap: 13, terrain: 'gates', boss: 'elite', bossHp: 60 },
    },
    '05': {
        minutes: 7, intervals: [42, 38, 36, 33, 32],
        rosters: [
            ['crawler'], ['crawler', 'crawler', 'charger'],
            ['armored', 'crawler', 'turret', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'crawler'],
            ['armored', 'crawler', 'turret', 'pursuer', 'armored', 'crawler'],
        ],
        directives: [switchPowerA, switchPowerB, switchPowerAB, switchPowerBA, rehearseGatekeeper],
        finale: switchPowerAB,
        encounter: { enemyCap: 14, boss: 'gatekeeper', bossHp: 92 },
    },
    '06': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['reclaimer', 'crawler', 'crawler', 'crawler'],
            ['charger', 'reclaimer', 'crawler', 'turret', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'charger', 'crawler'],
        ],
        directives: [loadCar, loadCar, warehouseCar, warehouseCar, gateCar],
        finale: loadBattery, finaleRoster: ['crawler', 'reclaimer'], finaleInterval: 125,
        encounter: { enemyCap: 12, boss: 'elite', bossHp: 70 },
    },
    '07': {
        minutes: 6, intervals: [42, 40, 37, 34, 32],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'crawler', 'pursuer', 'crawler'],
            ['charger', 'turret', 'crawler', 'crawler'],
            ['charger', 'armored', 'turret', 'crawler', 'crawler'],
        ],
        directives: [thermalWest, thermalEast, thermalEast, thermalAll, thermalAll],
        finale: validateCooling, finaleRoster: ['charger', 'crawler'],
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 70 },
    },
    '08': {
        minutes: 7, intervals: [42, 38, 35, 33, 31],
        firstWaveQuietUntil: 9 * TICK_RATE,
        rosters: [
            ['crawler'], ['crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'crawler', 'pursuer'],
            ['reclaimer', 'crawler', 'turret', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'pursuer', 'crawler', 'charger'],
        ],
        directives: [sorterIntro, sorter, sorter, sorterCar, sorterCar],
        finale: divertBattery, finaleRoster: ['reclaimer', 'crawler'], finaleInterval: 125,
        encounter: { enemyCap: 15, terrain: 'conveyor', boss: 'elite', bossHp: 70 },
    },
    '09': {
        minutes: 7, intervals: [40, 38, 35, 32, 30],
        firstWaveQuietUntil: 6 * TICK_RATE,
        rosters: [['crawler', 'crawler', 'charger'], [], [], [], []],
        liftGroups: [
            undefined,
            [{ floor: 2, enemies: ['crawler', 'crawler', 'turret', 'crawler'] }],
            [
                { floor: 2, enemies: ['crawler', 'crawler', 'charger'] },
                { floor: 3, enemies: ['reclaimer', 'crawler', 'crawler', 'charger'] },
            ],
            [
                { floor: 2, enemies: ['turret', 'crawler', 'crawler', 'pursuer'] },
                { floor: 3, enemies: ['reclaimer', 'crawler', 'armored', 'crawler'] },
                { floor: 4, enemies: ['armored', 'charger', 'crawler', 'turret'] },
            ],
            [
                { floor: 2, enemies: ['armored', 'crawler', 'charger', 'crawler'] },
                { floor: 3, enemies: ['reclaimer', 'charger', 'crawler', 'crawler'] },
                { floor: 4, enemies: ['turret', 'armored', 'pursuer', 'crawler'] },
            ],
            [
                { floor: 2, enemies: ['crawler', 'crawler', 'charger'] },
                { floor: 3, enemies: ['reclaimer', 'crawler', 'crawler'] },
                { floor: 4, enemies: ['turret', 'charger', 'crawler'] },
            ],
        ],
        directives: [liftEntry, lift, liftTwoStops, liftThreeStops, liftThreeStops],
        finale: liftToOffice, finaleRoster: ['crawler'], finaleInterval: 125,
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 70 },
    },
    '10': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['reclaimer', 'crawler', 'crawler'], ['charger', 'crawler', 'reclaimer'],
            ['reclaimer', 'crawler', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'turret', 'crawler', 'charger'],
            ['reclaimer', 'crawler', 'pursuer', 'crawler', 'charger', 'crawler', 'armored', 'crawler'],
        ],
        directives: [loadCar, warehouseCar, yardCar, yardCar, gateCar],
        finale: yardCar,
        encounter: { enemyCap: 16, boss: 'tow', bossHp: 104 },
    },
    '11': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'pursuer', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler'],
            ['jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
        ],
        directives: [firstScan, firstScan, secondScan, secondScan, fullScan],
        finale: recoverSignal, finaleRoster: ['crawler', 'jammer'], finaleInterval: 120,
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 80 },
    },
    '12': {
        minutes: 7, intervals: [43, 39, 36, 33, 31],
        rosters: [
            ['ambusher', 'crawler', 'crawler', 'crawler'], ['ambusher', 'crawler', 'charger', 'crawler'],
            ['ambusher', 'crawler', 'armored', 'crawler'],
            ['ambusher', 'pursuer', 'crawler', 'ambusher', 'crawler'],
            ['ambusher', 'armored', 'crawler', 'turret', 'ambusher', 'crawler'],
        ],
        directives: [firstScan, firstScan, stationTape, stationTape, stationTape],
        finale: copyTape, finaleRoster: ['ambusher', 'ambusher', 'crawler'],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 80 },
    },
    '13': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['turret', 'crawler', 'crawler'],
            ['crawler', 'turret', 'crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'crawler'],
        ],
        directives: [relayWest, relayEast, relayUnderFire, relayBoth, relayAlternating],
        finale: certifyRelays, finaleRoster: ['jammer', 'turret', 'crawler'], finaleInterval: 135,
        encounter: { enemyCap: 17, boss: 'elite', bossHp: 80, armorLine: true },
    },
    '14': {
        minutes: 7, intervals: [40, 37, 34, 32, 30],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'jammer', 'crawler', 'crawler'],
            ['armored', 'turret', 'pursuer', 'crawler', 'jammer', 'crawler'],
        ],
        directives: [archiveEntry, archiveEntry, archive, archive, archive],
        finale: closeArchive, finaleRoster: ['armored', 'pursuer', 'crawler'], finaleInterval: 150,
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 80, armorLine: true },
    },
    '15': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'charger', 'crawler'],
            ['jammer', 'charger', 'crawler', 'ambusher', 'crawler'],
            ['jammer', 'ambusher', 'armored', 'charger', 'turret', 'crawler', 'crawler'],
        ],
        directives: [antenna, firstScan, antennaPair, antennaPair, fullScan],
        finale: antennaPair,
        encounter: { enemyCap: 18, boss: 'silence', bossHp: 110 },
    },
    '16': {
        minutes: 6, intervals: [44, 40, 37, 34, 32],
        rosters: [
            ['charger', 'crawler', 'crawler', 'crawler'], ['crawler', 'pursuer', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'turret', 'charger', 'crawler', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'charger', 'crawler'],
        ],
        directives: [isolateWest, isolateEast, isolateBoth, isolateBoth, isolateBoth],
        finale: isolateCentral, finaleRoster: ['charger', 'turret', 'crawler'],
        encounter: { enemyCap: 16, terrain: 'gates', boss: 'elite', bossHp: 90, armorLine: true },
        flood: true,
    },
    '17': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['crawler', 'reclaimer', 'crawler'],
            ['reclaimer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'pursuer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'armored', 'jammer', 'crawler', 'pursuer', 'crawler'],
        ],
        directives: [relayWest, roadCrossing, roadCrossing, bothCrossings, bothCrossings],
        finale: authorizeRoad, finaleRoster: ['reclaimer', 'jammer', 'crawler', 'crawler'], finaleInterval: 135,
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 90 },
    },
    '18': {
        minutes: 7, intervals: [40, 37, 34, 31, 29],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'jammer', 'crawler'],
        ],
        directives: [bypassWest, bypassPair, bypassPair, bypassFull, bypassFull],
        finale: routePower, finaleRoster: ['armored', 'pursuer', 'jammer', 'crawler'], finaleInterval: 120,
        encounter: { enemyCap: 19, terrain: 'engine', boss: 'elite', bossHp: 90, armorLine: true },
    },
    '19': {
        minutes: 7, intervals: [40, 36, 33, 30, 28],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['charger', 'turret', 'crawler', 'jammer', 'crawler'],
            ['armored', 'pursuer', 'turret', 'crawler', 'charger', 'jammer', 'crawler'],
        ],
        directives: [hospitalSign, towerSign, bothSigns, bothSigns, bothSigns],
        finale: certifySignatures, finaleRoster: ['charger', 'turret', 'crawler'],
        encounter: { enemyCap: 20, boss: 'elite', bossHp: 90 },
    },
    '20': {
        minutes: 8, intervals: [42, 38, 34, 31, 29],
        rosters: [
            ['crawler', 'jammer', 'crawler'], ['reclaimer', 'crawler', 'charger', 'crawler'],
            ['pursuer', 'crawler', 'turret', 'crawler', 'armored'],
            ['reclaimer', 'jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'reclaimer', 'crawler', 'turret', 'crawler'],
        ],
        directives: [rehearseSectorTurn, yardCar, switchBoth, relayBoth, rehearseBypass],
        finale: confirmDispatch,
        encounter: { enemyCap: 20, boss: 'core', bossHp: 128 },
    },
} as const satisfies Record<string, WavePlan>;

export type AuthoredStageId = keyof typeof CAMPAIGN_WAVE_PLANS;

// The first group tests the new job. The reserve group arrives at handoff and tests a different response.
const RESERVES: Readonly<Record<AuthoredStageId, Roster>> = {
    '03': ['turret', 'crawler', 'crawler', 'charger'],
    '04': ['pursuer', 'crawler', 'charger', 'crawler'],
    '05': ['charger', 'crawler', 'pursuer', 'crawler'],
    '06': ['charger', 'reclaimer', 'crawler', 'crawler'],
    '07': ['pursuer', 'crawler', 'crawler', 'turret'],
    '08': ['pursuer', 'crawler', 'charger', 'crawler'],
    '09': ['reclaimer', 'crawler', 'pursuer', 'crawler'],
    '10': ['charger', 'reclaimer', 'crawler', 'crawler'],
    '11': ['pursuer', 'crawler', 'jammer', 'crawler'],
    '12': ['ambusher', 'crawler', 'charger', 'crawler'],
    '13': ['jammer', 'crawler', 'pursuer', 'crawler'],
    '14': ['pursuer', 'crawler', 'turret', 'crawler'],
    '15': ['charger', 'ambusher', 'crawler', 'crawler'],
    '16': ['charger', 'crawler', 'pursuer', 'crawler'],
    '17': ['reclaimer', 'jammer', 'crawler', 'crawler'],
    '18': ['pursuer', 'armored', 'crawler', 'crawler'],
    '19': ['charger', 'crawler', 'turret', 'crawler'],
    '20': ['turret', 'charger', 'crawler', 'jammer', 'crawler'],
};

export function campaignRules(id: AuthoredStageId, shopUnlocks: readonly ToolId[]): RunRules {
    const plan: WavePlan = CAMPAIGN_WAVE_PLANS[id];
    const timing = SCHEDULES[plan.minutes];
    const waves: WaveSpec[] = timing.seconds.map((seconds, index) => {
        const directive = plan.directives?.[index];
        const liftGroups = plan.liftGroups?.[index];
        const quietUntil = index === 0 ? plan.firstWaveQuietUntil : undefined;
        const reserveWave = index === 4;
        const escalation: WaveSpec['escalation'] = reserveWave
            ? { atTick: (seconds - 3) * TICK_RATE, requiredTicks: 18 * TICK_RATE,
                spawnEvery: 43, enemies: RESERVES[id] }
            : quietUntil ? { atTick: quietUntil, spawnEvery: plan.intervals[index], enemies: plan.rosters[index] }
                : undefined;
        return {
            seconds: seconds + (reserveWave ? 25 : 0),
            spawnEvery: quietUntil ? 0 : plan.intervals[index], enemies: quietUntil ? [] : plan.rosters[index],
            ...(directive ? { directive: { ...directive, minTicks: (seconds - 3) * TICK_RATE } } : {}),
            ...(liftGroups ? { liftGroups } : {}),
            ...(plan.flood && index >= 2 ? { livePuddles: FLOOD } : {}),
            ...(escalation ? { escalation } : {}),
        };
    });
    const finaleRoster = plan.finaleRoster ?? [];
    const finaleLiftGroups = plan.liftGroups?.[5];
    waves.push({
        seconds: timing.timeLimit, spawnEvery: finaleRoster.length ? plan.finaleInterval ?? 90 : 0,
        enemies: finaleRoster, boss: true,
        ...(plan.finale ? { directive: plan.finale } : {}),
        ...(finaleLiftGroups ? { liftGroups: finaleLiftGroups } : {}),
        ...(plan.flood ? { livePuddles: FLOOD } : {}),
    });
    return {
        ...M2_RULES, contentVersion: 20 + Number(id), waves,
        encounter: { ...plan.encounter, revive: true },
        tools: [...M2_RULES.tools, ...shopUnlocks], startingTools: CAMPAIGN_STARTERS,
    };
}
