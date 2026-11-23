import type { CampaignEncounter, WaveDirective } from './Encounter';
import type { AttachmentId } from './Equipment';
import { isMeleeTool, MELEE_TOOL_STATS } from './WeaponMotion';

export const CONTENT_VERSION = 1;
export const TICK_RATE = 30;
export interface CombatBounds { readonly left: number; readonly right: number; readonly bottom: number; readonly top: number }
export const FIELD = { left: 15, right: 345, bottom: 153, top: 553 } as const;
export const START = { x: 180, y: 353 } as const;
export const CAMPAIGN_FIELD: CombatBounds = { left: -150, right: 510, bottom: 28, top: 678 };
export const COMBAT_VIEWPORT = { width: FIELD.right - FIELD.left, height: FIELD.top - FIELD.bottom } as const;

/** Clamp a view of the legacy logical size to the current combat world. */
export function combatViewport(field: CombatBounds, x: number, y: number, overscan = 0): CombatBounds {
    const width = Math.min(COMBAT_VIEWPORT.width, field.right - field.left);
    const height = Math.min(COMBAT_VIEWPORT.height, field.top - field.bottom);
    const left = Math.min(field.right - width + overscan, Math.max(field.left - overscan, x - width / 2));
    const bottom = Math.min(field.top - height + overscan, Math.max(field.bottom - overscan, y - height / 2));
    return { left, right: left + width, bottom, top: bottom + height };
}
export const MAX_HP = 8;
export const RUN_SEED = 20261120;
export const REFRESH_COST = 2;
export const BASE_PICKUP_RADIUS = 21;
export const MAGNET_PICKUP_RADIUS = 39;
export const MAGNET_PULSE = { parts: 5, radius: 79, damage: 4 } as const;
export const WAVES = [
    { seconds: 25, spawnEvery: 37, enemies: ['crawler'] },
    { seconds: 30, spawnEvery: 27, enemies: ['crawler', 'crawler', 'charger'] },
    { seconds: 35, spawnEvery: 21, enemies: ['crawler', 'charger', 'turret', 'crawler'] },
] as const;
export const TOOLS = {
    wrench: { name: '电弧扳手', reach: 104, cooldown: 14, damage: 2, price: 5, detail: '交替横扫和直刺，命中武器扫过的近处敌机' },
    arc_gun: { name: '电弧枪', reach: 123, cooldown: 20, damage: 2, price: 6, detail: '电弧最多连跳 2 次' },
    riveter: { name: '铆钉枪', reach: 185, cooldown: 19, damage: 2, price: 5, detail: '一发最多穿过 3 台敌机' },
    torch: { name: '喷火管', reach: 82, cooldown: 10, damage: 1, price: 5, detail: '向前喷火，扫过近处一片敌机' },
    induction: { name: '感应线圈', reach: 71, cooldown: 24, damage: 3, price: 5, detail: '放电击中身边所有敌机' },
    hydraulic_nailer: { name: '液压钉枪', reach: 155, cooldown: 32, damage: 4, price: 5, detail: '一发最多穿 2 台，打护甲正面更有效' },
    pulse_nozzle: { name: '脉冲喷管', reach: 78, cooldown: 23, damage: 2, price: 5, detail: '推开前方的普通敌机' },
    traction_coil: { name: '牵引线圈', reach: 98, cooldown: 28, damage: 2, price: 5, detail: '最多拉近 2 台普通敌机' },
    split_probe: { name: '分束探针', reach: 140, cooldown: 22, damage: 2, price: 5, detail: '可同时攻击 2 台敌机' },
    bypass_wrench: { name: '旁路扳手', reach: 78, cooldown: 15, damage: 2, price: 5, detail: '钩扫或压击近敌，连中第 4 次伤害 +3' },
} as const;
export const MODS = {
    contact: { name: '导电触点', tag: 'arc', price: 4, detail: '攻击时给目标上标记' },
    splitter: { name: '分流器', tag: 'arc', price: 4, detail: '装 2 种电弧配件，打标记目标可连跳 3 次' },
    ring: { name: '大拾取圈', tag: 'magnet', price: 4, detail: '能捡到更远的零件' },
    coil: { name: '回收线圈', tag: 'magnet', price: 4, detail: '装 2 种磁吸配件，每捡 5 个零件震击一次' },
    exchanger: { name: '热交换器', tag: 'heat', price: 3, detail: '这把武器的攻击间隔 −100 毫秒' },
    valve: { name: '泄压阀', tag: 'heat', price: 3, detail: '装 2 种过热配件，连发增伤，过热停火' },
    relay: { name: '稳压继电器', tag: 'arc', price: 4, detail: '装 2 种电弧配件，强化连跳距离增加' },
    sweeper: { name: '回收滚轮', tag: 'magnet', price: 4, detail: '拾取范围 +11，计入磁吸套装' },
    ceramic: { name: '陶瓷护套', tag: 'heat', price: 4, detail: '装 2 种过热配件，这把武器多打 2 次再冷却' },
    bearings: { name: '轻量轴承', tag: 'utility', price: 4, detail: '移速 +12%' },
    plate: { name: '缓冲挡板', tag: 'utility', price: 4, detail: '每波挡下第 1 次伤害' },
    sorter: { name: '零件分拣器', tag: 'utility', price: 4, detail: '每波结束，地上零件的回收率 +25 个百分点' },
} as const;
export const ENEMIES = {
    crawler: { hp: 4, speed: 47 },
    charger: { hp: 6, speed: 35 },
    turret: { hp: 5, speed: 24 },
    armored: { hp: 7, speed: 34 },
    pursuer: { hp: 5, speed: 56 },
    reclaimer: { hp: 8, speed: 30 },
    jammer: { hp: 6, speed: 32 },
    ambusher: { hp: 5, speed: 45 },
    inspector: { hp: 116, speed: 52 },
} as const;

export type ToolId = keyof typeof TOOLS;
export function attackReach(tool: ToolId, reach: number, sweptMelee = false): number {
    return sweptMelee && isMeleeTool(tool) ? Math.max(24, MELEE_TOOL_STATS[tool].reach + reach - TOOLS[tool].reach) : reach;
}
export type ModId = keyof typeof MODS;
export type EnemyId = keyof typeof ENEMIES;
export type RegularEnemyId = Exclude<EnemyId, 'inspector'>;
export type Route = 'arc' | 'magnet';
export type Tag = typeof MODS[ModId]['tag'];
export type OfferId = ToolId | ModId;
export const TUNING_OPTIONS = {
    range: { id: 'range', name: '加长导轨', detail: '射程 +20%\n攻击间隔 +15%' },
    speed: { id: 'speed', name: '快拆电机', detail: '攻击间隔 −20%\n射程 −15%' },
    close: { id: 'close', name: '贴身增压', detail: '射程 45% 以内\n直接命中伤害 +1' },
    edge: { id: 'edge', name: '远端聚焦', detail: '从射程 65% 处起\n直接命中伤害 +1' },
} as const;
export type TuningChoice = keyof typeof TUNING_OPTIONS;
export const TUNING_STEPS = {
    handling: { wave: 2, cost: 6, choices: [TUNING_OPTIONS.range, TUNING_OPTIONS.speed] },
    finisher: { wave: 4, cost: 8, choices: [TUNING_OPTIONS.close, TUNING_OPTIONS.edge] },
} as const;
export type TuningStep = keyof typeof TUNING_STEPS;
export interface EquippedTool {
    id: ToolId;
    mods: ModId[];
    tuning?: { handling?: 'range' | 'speed'; finisher?: 'close' | 'edge' };
    attachments?: (AttachmentId | null)[];
}

export function toolTuningStats(tool: EquippedTool): { reach: number; interval: number } {
    const base = TOOLS[tool.id];
    const interval = base.cooldown - (tool.mods.includes('exchanger') ? 3 : 0);
    switch (tool.tuning?.handling) {
        case 'range': return { reach: base.reach * 1.2, interval: Math.round(interval * 1.15) };
        case 'speed': return { reach: base.reach * 0.85, interval: Math.round(interval * 0.8) };
        default: return { reach: base.reach, interval };
    }
}

export const STARTER = { arc: 'contact', magnet: 'ring' } as const;
export const FIRST_PAIR = { arc: 'splitter', magnet: 'coil' } as const;

export interface PuddleSpec {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly offset: number;
}

export type SpawnEdge = 'south' | 'north' | 'west' | 'east';

export interface WaveClearSpec {
    readonly opening: number;
    readonly reserves: number;
    readonly reserveAfterTick?: number;
}

export interface WaveSpec {
    readonly seconds: number;
    readonly spawnEvery: number;
    readonly enemies: readonly RegularEnemyId[];
    readonly spawnEdges?: readonly SpawnEdge[];
    readonly boss?: boolean;
    readonly clear?: WaveClearSpec;
    readonly livePuddles?: readonly PuddleSpec[];
    readonly directive?: WaveDirective;
    readonly liftGroups?: readonly { readonly floor: number; readonly enemies: readonly RegularEnemyId[] }[];
    readonly escalation?: {
        readonly atTick: number;
        readonly requiredTicks?: number;
        readonly spawnEvery?: number;
        readonly enemies: readonly RegularEnemyId[];
        readonly spawnEdges?: readonly SpawnEdge[];
    };
}

export function waveKillTarget(wave: WaveSpec): number | undefined {
    return wave.clear && wave.clear.opening + wave.clear.reserves
        + (wave.liftGroups?.reduce((total, group) => total + group.enemies.length, 0) ?? 0);
}

export interface RunRules {
    readonly stage: 'M1' | 'M2';
    readonly contentVersion: number;
    readonly maxHp: number;
    readonly hitGrace: number;
    readonly field?: CombatBounds;
    readonly waves: readonly WaveSpec[];
    readonly startingTools?: readonly ToolId[];
    readonly tools: readonly ToolId[];
    readonly mods: readonly ModId[];
    readonly encounter?: CampaignEncounter;
    readonly campaign?: boolean;
    readonly campaignPressure?: boolean;
    readonly sweptMelee?: boolean;
    readonly weaponLimit?: number;
}

export const M1_RULES: RunRules = {
    stage: 'M1', contentVersion: CONTENT_VERSION, waves: WAVES,
    maxHp: MAX_HP, hitGrace: 34,
    tools: ['wrench', 'riveter', 'torch'],
    mods: ['contact', 'splitter', 'ring', 'coil', 'exchanger', 'valve'],
};

export const M2_RULES: RunRules = {
    stage: 'M2', contentVersion: 2,
    maxHp: 10, hitGrace: 43,
    waves: [
        { seconds: 30, spawnEvery: 37, enemies: ['crawler'] },
        { seconds: 40, spawnEvery: 32, enemies: ['crawler', 'crawler', 'charger'] },
        { seconds: 45, spawnEvery: 29, enemies: ['crawler', 'charger', 'turret', 'crawler'] },
        { seconds: 55, spawnEvery: 34, enemies: ['crawler', 'armored', 'charger', 'crawler', 'turret'] },
        { seconds: 60, spawnEvery: 31, enemies: ['armored', 'crawler', 'charger', 'turret', 'crawler', 'armored'] },
        { seconds: 75, spawnEvery: 0, enemies: [], boss: true },
    ],
    tools: ['wrench', 'riveter', 'torch', 'induction'],
    mods: ['contact', 'splitter', 'relay', 'ring', 'coil', 'sweeper', 'exchanger', 'valve', 'ceramic', 'bearings', 'plate', 'sorter'],
};

export const CAMPAIGN_01_RULES: RunRules = { ...M2_RULES, contentVersion: 21, campaign: true };
export const PUDDLE_CYCLE = 150;
export const PUDDLE_WARNING = 24;
export const PUDDLE_ACTIVE = 45;

const PUMP_EAST = { x: 260, y: 397, radius: 48, offset: 75 } as const;
const PUMP_WEST = { x: 103, y: 304, radius: 48, offset: 0 } as const;

export const CAMPAIGN_02_RULES: RunRules = {
    ...M2_RULES, contentVersion: 22, campaign: true,
    tools: [...M2_RULES.tools, 'arc_gun'],
    startingTools: ['wrench', 'arc_gun'],
    waves: [
        { seconds: 42, spawnEvery: 42, enemies: ['crawler'], livePuddles: [PUMP_WEST] },
        { seconds: 48, spawnEvery: 36, enemies: ['crawler', 'charger', 'crawler'] },
        { seconds: 50, spawnEvery: 39, enemies: ['crawler', 'charger', 'crawler'], livePuddles: [PUMP_WEST, PUMP_EAST] },
        { seconds: 55, spawnEvery: 36, enemies: ['crawler', 'turret', 'charger', 'crawler'], livePuddles: [PUMP_WEST, PUMP_EAST] },
        { seconds: 60, spawnEvery: 33, enemies: ['crawler', 'armored', 'charger', 'crawler', 'turret'], livePuddles: [PUMP_WEST, PUMP_EAST] },
        { seconds: 75, spawnEvery: 0, enemies: [], boss: true, livePuddles: [PUMP_WEST, PUMP_EAST] },
    ],
};

export function isTool(id: string): id is ToolId {
    return Object.prototype.hasOwnProperty.call(TOOLS, id);
}

export function isMod(id: string): id is ModId {
    return Object.prototype.hasOwnProperty.call(MODS, id);
}

export function offer(id: OfferId) {
    return isTool(id) ? TOOLS[id] : MODS[id];
}

export function hasPair(tools: readonly EquippedTool[], tag: Tag): boolean {
    const mods = new Set<ModId>();
    for (const tool of tools) {
        for (const id of tool.mods) {
            if (MODS[id].tag === tag) mods.add(id);
        }
    }
    return mods.size >= 2;
}

export function randomStream(seed: number) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}
