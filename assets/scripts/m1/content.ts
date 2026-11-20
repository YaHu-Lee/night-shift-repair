export const CONTENT_VERSION = 1;
export const TICK_RATE = 30;
export const FIELD = { left: 15, right: 345, bottom: 153, top: 553 } as const;
export const START = { x: 180, y: 353 } as const;
export const MAX_HP = 8;
export const RUN_SEED = 20261120;
export const REFRESH_COST = 2;
export const WAVES = [
    { seconds: 25, spawnEvery: 37, enemies: ['crawler'] },
    { seconds: 30, spawnEvery: 27, enemies: ['crawler', 'crawler', 'charger'] },
    { seconds: 35, spawnEvery: 21, enemies: ['crawler', 'charger', 'turret', 'crawler'] },
] as const;
export const TOOLS = {
    wrench: { name: '电弧扳手', reach: 104, cooldown: 14, damage: 2, price: 5, detail: '短程链击，优先攻击最近的敌人' },
    arc_gun: { name: '电弧枪', reach: 123, cooldown: 20, damage: 2, price: 6, detail: '连跳范围更大，擅长打成团的敌人；单体射速较慢' },
    riveter: { name: '铆钉枪', reach: 185, cooldown: 19, damage: 2, price: 5, detail: '沿直线穿刺，最多命中三个敌人' },
    torch: { name: '喷火管', reach: 82, cooldown: 10, damage: 1, price: 5, detail: '近距离扇形喷射' },
    induction: { name: '感应线圈', reach: 71, cooldown: 24, damage: 3, price: 5, detail: '以自身为圆心，周期攻击近处所有敌人' },
} as const;
export const MODS = {
    contact: { name: '导电触点', tag: 'arc', price: 4, detail: '每次开火，标记瞄准的敌人。' },
    splitter: { name: '分流器', tag: 'arc', price: 4, detail: '凑齐两种电弧，击中标记可连跳 3 次' },
    ring: { name: '大拾取圈', tag: 'magnet', price: 4, detail: '拾取范围扩大' },
    coil: { name: '回收线圈', tag: 'magnet', price: 4, detail: '凑齐两种磁吸，每捡 5 件震击周围' },
    exchanger: { name: '热交换器', tag: 'heat', price: 3, detail: '缩短装配工具的攻击间隔' },
    valve: { name: '泄压阀', tag: 'heat', price: 3, detail: '两种过热：连发增伤，过热停火 1.6 秒' },
    relay: { name: '稳压继电器', tag: 'arc', price: 4, detail: '凑齐两种电弧，连锁可跳得更远' },
    sweeper: { name: '回收滚轮', tag: 'magnet', price: 4, detail: '扩大拾取范围，可凑磁吸震击' },
    ceramic: { name: '陶瓷护套', tag: 'heat', price: 4, detail: '凑齐两种过热，多打 2 次再冷却' },
    bearings: { name: '轻量轴承', tag: 'utility', price: 4, detail: '移动速度提高 12%' },
    plate: { name: '缓冲挡板', tag: 'utility', price: 4, detail: '每波抵挡第一次伤害' },
    sorter: { name: '零件分拣器', tag: 'utility', price: 4, detail: '波末自动回收比例提高到 75%' },
} as const;
export const ENEMIES = {
    crawler: { hp: 4, speed: 47 },
    charger: { hp: 6, speed: 35 },
    turret: { hp: 5, speed: 24 },
    armored: { hp: 7, speed: 34 },
    inspector: { hp: 116, speed: 52 },
} as const;

export type ToolId = keyof typeof TOOLS;
export type ModId = keyof typeof MODS;
export type EnemyId = keyof typeof ENEMIES;
export type RegularEnemyId = Exclude<EnemyId, 'inspector'>;
export type Route = 'arc' | 'magnet';
export type Tag = typeof MODS[ModId]['tag'];
export type OfferId = ToolId | ModId;
export interface EquippedTool { id: ToolId; mods: ModId[] }

export const STARTER = { arc: 'contact', magnet: 'ring' } as const;
export const FIRST_PAIR = { arc: 'splitter', magnet: 'coil' } as const;

export interface PuddleSpec {
    readonly x: number;
    readonly y: number;
    readonly radius: number;
    readonly offset: number;
}

export interface WaveSpec {
    readonly seconds: number;
    readonly spawnEvery: number;
    readonly enemies: readonly RegularEnemyId[];
    readonly boss?: boolean;
    readonly livePuddles?: readonly PuddleSpec[];
}

export interface RunRules {
    readonly stage: 'M1' | 'M2';
    readonly contentVersion: number;
    readonly maxHp: number;
    readonly hitGrace: number;
    readonly waves: readonly WaveSpec[];
    readonly startingTools?: readonly ToolId[];
    readonly tools: readonly ToolId[];
    readonly mods: readonly ModId[];
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

export const CAMPAIGN_01_RULES: RunRules = { ...M2_RULES, contentVersion: 21 };
export const PUDDLE_CYCLE = 150;
export const PUDDLE_WARNING = 24;
export const PUDDLE_ACTIVE = 45;

const PUMP_EAST = { x: 260, y: 397, radius: 48, offset: 75 } as const;
const PUMP_WEST = { x: 103, y: 304, radius: 48, offset: 0 } as const;

export const CAMPAIGN_02_RULES: RunRules = {
    ...M2_RULES, contentVersion: 22,
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
