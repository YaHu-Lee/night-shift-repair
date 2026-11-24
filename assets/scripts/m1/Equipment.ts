import { BASE_PICKUP_RADIUS, MAGNET_PICKUP_RADIUS, MAGNET_PULSE, TICK_RATE, TOOLS, isTool, randomStream } from './content';
import type { EquippedTool, ModId, Route, ToolId } from './content';
import type { BlueprintId } from './Encounter';

type AttachmentKind = 'link' | 'handling' | 'alternate' | 'finisher' | 'signature' | 'dispatch' | 'flywheel';
export type AttachmentId = `${ToolId}/${AttachmentKind}`;
export type GearId = `gear/${'pulse' | 'padding' | 'runner' | 'pickup' | 'guard' | 'sorter' | 'harness'}`;
export type EquipmentOfferId = ToolId | AttachmentId | GearId;
export type EquipmentTarget = { kind: 'weapon' } | { kind: 'attachment'; weapon: number; slot: number } | { kind: 'gear'; slot: number };
const stationPart = (kind: AttachmentKind) => kind === 'dispatch' || kind === 'flywheel';

export interface EquipmentOffer {
    readonly id: EquipmentOfferId;
    readonly kind: 'weapon' | 'attachment' | 'gear';
    readonly name: string;
    readonly detail: string;
    readonly price: number;
    readonly icon: ToolId | ModId;
}

interface WeaponTraining { reachBonus: number; intervalReduction: number; damageBonus: number }
interface RoleTraining { hpBonus: number; speedBonus: number; pickupBonus: number }
export interface EquipmentStart {
    attachmentSlots?: number;
    weaponSlots?: Readonly<Partial<Record<ToolId, number>>>;
    unlockedAttachments?: readonly string[];
    unlockedGear?: readonly string[];
    weapon?: Readonly<WeaponTraining>;
    role?: Readonly<RoleTraining>;
    starterAttachment?: AttachmentId;
}
export interface EquipmentState {
    readonly version: 1;
    readonly attachmentSlots: number;
    readonly weaponSlots?: Readonly<Partial<Record<ToolId, number>>>;
    readonly unlockedAttachments: readonly AttachmentId[];
    readonly unlockedGear: readonly GearId[];
    readonly weapon: Readonly<WeaponTraining>;
    readonly role: Readonly<RoleTraining>;
    readonly starterAttachment?: AttachmentId;
    readonly gear: readonly (GearId | null)[];
}

interface WeaponChange {
    reach?: number;
    interval?: number;
    damage?: number;
    close?: number;
    far?: number;
    chainReach?: number;
    hops?: number;
    pierce?: number;
    targets?: number;
    spread?: number;
    displacement?: number;
    combo?: number;
    heat?: boolean;
    wideSweep?: boolean;
}
interface Attachment extends EquipmentOffer {
    id: AttachmentId;
    kind: 'attachment';
    weapon: ToolId;
    variant: AttachmentKind;
    firstShop: number;
    change: WeaponChange;
}
interface GearChange { hp?: number; speed?: number; pickup?: number; shield?: boolean; salvage?: number; pulse?: boolean }
interface Gear extends EquipmentOffer { id: GearId; kind: 'gear'; firstShop: number; change: GearChange }
type Part = readonly [name: string, detail: string, change: WeaponChange];
type Parts = readonly [Part, Part, Part, Part];

const weaponParts: Record<ToolId, Parts> = {
    wrench: [
        ['短柄机芯', '攻击间隔 −67 毫秒，射程 −9', { interval: -2, reach: -9 }],
        ['绝缘柄套', '射程 +15', { reach: 15 }],
        ['咬合齿轮', '近处命中伤害 +1', { close: 1 }],
        ['联动齿轮', '近处伤害 +1，攻击间隔 −67 毫秒', { close: 1, interval: -2 }],
    ],
    arc_gun: [
        ['扩弧线圈', '连跳距离 +16', { chainReach: 16 }],
        ['稳流片', '射程 +12，攻击间隔 −33 毫秒', { reach: 12, interval: -1 }],
        ['汇流条', '多跳 1 次，远处命中伤害 +1', { hops: 1, far: 1 }],
        ['跨弧接头', '连跳距离 +12，多跳 1 次', { chainReach: 12, hops: 1 }],
    ],
    hydraulic_nailer: [
        ['高压泵芯', '伤害 +1，攻击间隔 +133 毫秒', { damage: 1, interval: 4 }],
        ['轻滑导轨', '射程 +16，攻击间隔 −67 毫秒', { reach: 16, interval: -2 }],
        ['双排入钉座', '弹道加宽 4，能多穿 1 台', { pierce: 1, spread: 2 }],
        ['油压套环', '近处伤害 +2，攻击间隔 −33 毫秒', { close: 2, interval: -1 }],
    ],
    riveter: [
        ['延长弹匣', '多穿 1 台，攻击间隔 +67 毫秒', { pierce: 1, interval: 2 }],
        ['宽钉导口', '弹道加宽 6', { spread: 3 }],
        ['尖头铆钉', '远处命中伤害 +1', { far: 1 }],
        ['贯穿钉组', '一发多穿 2 台', { pierce: 2 }],
    ],
    torch: [
        ['散焰嘴', '火焰喷得更宽', { spread: 0.16 }],
        ['节流阀', '攻击间隔 −67 毫秒，射程 −6', { interval: -2, reach: -6 }],
        ['聚焰罩', '近处命中伤害 +1', { close: 1 }],
        ['高温换向阀', '连发第 4 击起伤害 +1，过热停火', { heat: true }],
    ],
    induction: [
        ['外围线匝', '感应半径 +12', { reach: 12 }],
        ['快充电容', '攻击间隔 −133 毫秒，感应半径 −6', { interval: -4, reach: -6 }],
        ['内圈磁片', '近处命中伤害 +1', { close: 1 }],
        ['叠层感应盘', '感应半径 +8，攻击间隔 −100 毫秒', { reach: 8, interval: -3 }],
    ],
    pulse_nozzle: [
        ['反冲导板', '推开距离 +6', { displacement: 6 }],
        ['延伸喷口', '射程 +12', { reach: 12 }],
        ['聚压喉管', '喷得更宽，近处伤害 +1', { spread: 0.12, close: 1 }],
        ['强排导板', '推开距离 +10，射程 +8', { displacement: 10, reach: 8 }],
    ],
    traction_coil: [
        ['牵引电容', '拉近距离 +6', { displacement: 6 }],
        ['分联吸盘', '多拉 1 台敌机', { targets: 1 }],
        ['远抛绕组', '牵引半径 +12，远处伤害 +1', { reach: 12, far: 1 }],
        ['重载吸盘', '拉近距离 +10，牵引半径 +8', { displacement: 10, reach: 8 }],
    ],
    split_probe: [
        ['三口分配器', '同时多打 1 台', { targets: 1 }],
        ['探针快座', '攻击间隔 −100 毫秒，射程 −8', { interval: -3, reach: -8 }],
        ['偏置探针', '远处命中伤害 +1', { far: 1 }],
        ['四路分配器', '同时多打 2 台', { targets: 2 }],
    ],
    bypass_wrench: [
        ['连击离合片', '连击第 4 击再加 2 点伤害', { combo: 2 }],
        ['短轴轴芯', '攻击间隔 −67 毫秒，射程 −6', { interval: -2, reach: -6 }],
        ['短程合闸片', '近处伤害 +1，第 4 击再加 1', { close: 1, combo: 1 }],
        ['重型离合片', '连击第 4 击再加 3 点伤害', { combo: 3 }],
    ],
};

const partSpecs = [
    ['handling', 1, 5, 'exchanger'],
    ['alternate', 2, 6, 'relay'],
    ['finisher', 4, 8, 'valve'],
    ['signature', 4, 8, 'ceramic'],
] as const;
const attachment = (weapon: ToolId, variant: AttachmentKind, name: string, detail: string,
    firstShop: number, price: number, icon: ModId, change: WeaponChange): Attachment => ({
    id: `${weapon}/${variant}`, kind: 'attachment', weapon, variant, name, detail, firstShop, price, icon, change,
});

const toolIds = Object.keys(TOOLS) as ToolId[];
export const ATTACHMENTS: Readonly<Record<string, Attachment>> = Object.fromEntries([
    ...toolIds.flatMap(weapon => [
        attachment(weapon, 'link', '分流接头', '给敌机上标记，强化再命中', 0, 4, 'splitter', {}),
        ...partSpecs.map(([variant, firstShop, price, icon], index) => {
            const [name, detail, change] = weaponParts[weapon][index];
            return attachment(weapon, variant, name, detail, firstShop, price, icon, change);
        }),
    ]),
    attachment('wrench', 'dispatch', '加长柄套', '扫得更远，伤害 +1', 1, 5,
        'relay', { reach: 15, damage: 1 }),
    attachment('wrench', 'flywheel', '回扫飞轮', '一挥打中两台，下次大回扫伤害 +2', 1, 5, 'sweeper', { reach: 12, wideSweep: true }),
].map(part => [part.id, part]));
export function attachmentIdsForWeapon(tool: ToolId): AttachmentId[] {
    return Object.values(ATTACHMENTS).filter(part => part.weapon === tool && !stationPart(part.variant)).map(part => part.id);
}

function gear(id: GearId, name: string, detail: string, firstShop: number, price: number, icon: ModId, change: GearChange): Gear {
    return { id, kind: 'gear', name, detail, firstShop, price, icon, change };
}
export const GEAR: Readonly<Record<string, Gear>> = Object.fromEntries([
    gear('gear/pulse', '回收线圈', `每捡 ${MAGNET_PULSE.parts} 个零件，震一下周围敌机`, 0, 4, 'coil', { pulse: true }),
    gear('gear/padding', '缓冲护甲', '体力上限 +2', 1, 5, 'plate', { hp: 2 }),
    gear('gear/runner', '轻量轴承', '移速 +12%', 0, 4, 'bearings', { speed: .12 }),
    gear('gear/pickup', '宽口拾取环', '拾取范围 +14', 0, 4, 'ring', { pickup: 14 }),
    gear('gear/guard', '保险挡板', '每波挡下第 1 次伤害', 1, 5, 'plate', { shield: true }),
    gear('gear/sorter', '零件分拣器', '波末零件回收率 +18 个百分点', 1, 4, 'sorter', { salvage: .18 }),
    gear('gear/harness', '现场救援背架', '体力上限 +1，移速 +8%', 3, 7, 'sweeper', { hp: 1, speed: .08 }),
].map(item => [item.id, item]));

function owns<T>(catalog: Readonly<Record<string, T>>, key: unknown): key is string {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(catalog, key);
}
export function getEquipmentOffer(id: string): EquipmentOffer | undefined {
    if (isTool(id)) return { id, kind: 'weapon', name: TOOLS[id].name, detail: TOOLS[id].detail, price: TOOLS[id].price, icon: id };
    return owns(ATTACHMENTS, id) ? ATTACHMENTS[id] : owns(GEAR, id) ? GEAR[id] : undefined;
}

const weaponDefaults: WeaponTraining = { reachBonus: 0, intervalReduction: 0, damageBonus: 0 };
const roleDefaults: RoleTraining = { hpBonus: 0, speedBonus: 0, pickupBonus: 0 };
const between = (value: unknown, limit: number): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= limit;
const whole = (value: unknown, limit: number): value is number => between(value, limit) && Number.isInteger(value);
const distinct = (value: unknown, validator: (item: unknown) => boolean): value is readonly string[] =>
    Array.isArray(value) && value.every(validator) && new Set(value).size === value.length;
const unlockedPart = (id: unknown) => owns(ATTACHMENTS, id) && ATTACHMENTS[id].variant === 'signature';
const unlockedGear = (id: unknown) => id === 'gear/harness';

export function openEquipmentSlots(completed: number, cap = 3): number {
    return Math.min(cap, completed >= 4 ? 3 : completed >= 2 ? 2 : 1);
}
export function weaponAttachmentCapacity(state: EquipmentState, tool: ToolId): number {
    return state.weaponSlots?.[tool] ?? state.attachmentSlots;
}
function validWeaponSlots(slots: EquipmentState['weaponSlots']): boolean {
    return slots === undefined || (!!slots && typeof slots === 'object' && !Array.isArray(slots)
        && Object.entries(slots).every(([id, count]) => isTool(id) && whole(count, 3) && count > 0));
}
function validTraining(weapon: WeaponTraining, role: RoleTraining): boolean {
    return !!weapon && !!role && between(weapon.reachBonus, 40) && whole(weapon.intervalReduction, 10)
        && whole(weapon.damageBonus, 3) && whole(role.hpBonus, 8) && between(role.speedBonus, .35)
        && between(role.pickupBonus, 40);
}

export function createEquipment(tool: ToolId, start: EquipmentStart): { equipment: EquipmentState; tools: EquippedTool[] } | null {
    const equipment: EquipmentState = {
        version: 1,
        attachmentSlots: start.attachmentSlots ?? 3,
        unlockedAttachments: [...(start.unlockedAttachments ?? [])] as AttachmentId[],
        unlockedGear: [...(start.unlockedGear ?? [])] as GearId[],
        weapon: { ...(start.weapon ?? weaponDefaults) },
        role: { ...(start.role ?? roleDefaults) },
        gear: [null, null, null],
        ...(start.weaponSlots ? { weaponSlots: { ...start.weaponSlots } } : {}),
        ...(start.starterAttachment ? { starterAttachment: start.starterAttachment } : {}),
    };
    if (!whole(equipment.attachmentSlots, 3) || !equipment.attachmentSlots || !validWeaponSlots(equipment.weaponSlots)) return null;
    const attachments = Array<AttachmentId | null>(weaponAttachmentCapacity(equipment, tool)).fill(null);
    if (equipment.starterAttachment) attachments[0] = equipment.starterAttachment;
    const tools: EquippedTool[] = [{ id: tool, mods: [], attachments }];
    return validEquipment(equipment, tools, 0) ? { equipment, tools } : null;
}

const partEligible = (part: Attachment, equipment: EquipmentState, shopWave: number, special?: AttachmentId) =>
    shopWave >= part.firstShop && (part.variant !== 'signature' || equipment.unlockedAttachments.includes(part.id))
    && (!stationPart(part.variant) || part.id === special);
const gearEligible = (item: Gear, equipment: EquipmentState, shopWave: number) =>
    shopWave >= item.firstShop && (item.id !== 'gear/harness' || equipment.unlockedGear.includes(item.id));

export function validEquipment(data: EquipmentState, tools: readonly EquippedTool[], completed: number, weaponLimit = 2,
    secondShopPart?: AttachmentId): boolean {
    if (!data || data.version !== 1 || !whole(data.attachmentSlots, 3) || !data.attachmentSlots || !validWeaponSlots(data.weaponSlots)
        || !distinct(data.unlockedAttachments, unlockedPart) || !distinct(data.unlockedGear, unlockedGear)
        || !validTraining(data.weapon, data.role) || (data.starterAttachment !== undefined
            && (!data.unlockedAttachments.includes(data.starterAttachment)
                || !owns(ATTACHMENTS, data.starterAttachment) || ATTACHMENTS[data.starterAttachment].weapon !== tools[0]?.id))
        || !Array.isArray(data.gear) || data.gear.length !== 3 || tools.length > (completed >= 2 ? weaponLimit : 1)) return false;
    const open = openEquipmentSlots(completed);
    const items = new Set<string>();
    for (let slot = 0; slot < data.gear.length; slot++) {
        const item = data.gear[slot];
        if (item === null) continue;
        if (!owns(GEAR, item) || slot >= open || items.has(item) || !gearEligible(GEAR[item], data, completed - 1)) return false;
        items.add(GEAR[item].id);
    }
    for (let weapon = 0; weapon < tools.length; weapon++) {
        const tool = tools[weapon];
        if (tool.mods.length || tool.tuning !== undefined || !Array.isArray(tool.attachments)
            || tool.attachments.length !== weaponAttachmentCapacity(data, tool.id)) return false;
        for (let slot = 0; slot < tool.attachments.length; slot++) {
            const id = tool.attachments[slot];
            if (id === null) continue;
            const activeStarter = weapon === 0 && slot === 0 && id === data.starterAttachment;
            if (!owns(ATTACHMENTS, id) || ATTACHMENTS[id].weapon !== tool.id || slot >= open || items.has(id)
                || (!activeStarter && !partEligible(ATTACHMENTS[id], data, completed - 1, secondShopPart))) return false;
            items.add(ATTACHMENTS[id].id);
        }
    }
    return true;
}

export interface WeaponEquipmentStats {
    id: ToolId;
    reach: number;
    interval: number;
    damage: number;
    close: number;
    far: number;
    chainReach: number;
    hops: number;
    pierce: number;
    targets: number;
    spread: number;
    displacement: number;
    combo: number;
    heat: boolean;
    wideSweep: boolean;
    arcLink: boolean;
    marks: boolean;
}
export interface ActorEquipmentStats {
    maxHp: number;
    moveScale: number;
    pickupRadius: number;
    salvageRate: number;
    shield: boolean;
    pulse: boolean;
}
type EquipmentBuild = 'arc' | 'magnet' | 'heat';
export interface ResolvedEquipment { weapons: WeaponEquipmentStats[]; actor: ActorEquipmentStats; builds: EquipmentBuild[] }

export const MAX_EQUIPMENT_HP_BONUS = 3;

export function resolveEquipment(tools: readonly EquippedTool[], state: EquipmentState, route: Route, baseHp: number,
    blueprint?: BlueprintId): ResolvedEquipment {
    const actor: ActorEquipmentStats = {
        maxHp: baseHp + state.role.hpBonus, moveScale: 1 + state.role.speedBonus,
        pickupRadius: (route === 'magnet' ? MAGNET_PICKUP_RADIUS : BASE_PICKUP_RADIUS) + state.role.pickupBonus,
        salvageRate: blueprint === 'magnetic_pickup_arm' ? .35 : .5, shield: false, pulse: false,
    };
    for (const id of state.gear) {
        if (!id) continue;
        const effect = GEAR[id].change;
        actor.maxHp += effect.hp ?? 0;
        actor.moveScale += effect.speed ?? 0;
        actor.pickupRadius += effect.pickup ?? 0;
        actor.salvageRate += effect.salvage ?? 0;
        actor.pulse ||= !!effect.pulse;
        actor.shield ||= !!effect.shield;
    }
    if (blueprint === 'magnetic_pickup_arm') actor.pickupRadius *= 1.25;
    const weapons = tools.map((tool, index) => {
        const base = TOOLS[tool.id];
        const training = index === 0 ? state.weapon : weaponDefaults;
        const stats: WeaponEquipmentStats = {
            id: tool.id, reach: base.reach + training.reachBonus, interval: base.cooldown - training.intervalReduction,
            damage: base.damage + training.damageBonus, close: 0, far: 0, chainReach: 0, hops: 0,
            pierce: 0, targets: 0, spread: 0, displacement: 0, combo: 0, heat: false, wideSweep: false, arcLink: false,
            marks: index === 0 && route === 'arc',
        };
        for (const id of tool.attachments ?? []) {
            if (!id) continue;
            const part = ATTACHMENTS[id], effect = part.change;
            stats.arcLink ||= part.variant === 'link';
            stats.heat ||= !!effect.heat;
            stats.wideSweep ||= !!effect.wideSweep;
            for (const key of ['reach', 'interval', 'damage', 'close', 'far', 'chainReach', 'hops',
                'pierce', 'targets', 'spread', 'displacement', 'combo'] as const) stats[key] += effect[key] ?? 0;
        }
        stats.marks ||= stats.arcLink;
        stats.interval = Math.max(4, stats.interval);
        return stats;
    });
    const builds: EquipmentBuild[] = [];
    if (weapons.some(weapon => weapon.arcLink)) builds.push('arc');
    if (actor.pulse) builds.push('magnet');
    if (weapons.some(weapon => weapon.heat)) builds.push('heat');
    return { actor, weapons, builds };
}

export function equipmentBuilds(tools: readonly EquippedTool[], state: EquipmentState, route: Route = 'arc'): EquipmentBuild[] {
    return resolveEquipment(tools, state, route, 0).builds;
}

export interface EquipmentSlot { slot: number; locked: boolean; item: EquipmentOffer | null }
export interface EquipmentShop {
    offers: EquipmentOffer[];
    weapons: { id: ToolId; name: string; slots: EquipmentSlot[] }[];
    gear: EquipmentSlot[];
    weaponCapacity: number;
    refreshed: boolean;
    recommended?: EquipmentOfferId;
}
export interface EquipmentSource {
    tools: readonly EquippedTool[];
    weaponLimit?: number;
    equipment: EquipmentState;
    route: Route;
    wave: number;
    parts: number;
    blueprint?: BlueprintId;
    secondShopPart?: AttachmentId;
    benchChoiceUsed?: true;
}

export function equipmentShopView(source: EquipmentSource, offers: readonly EquipmentOfferId[], refreshed: boolean,
    shopWeapons: readonly ToolId[]): EquipmentShop {
    const open = openEquipmentSlots(source.wave + 1);
    const weaponCapacity = source.wave >= 1
        ? Math.min(source.weaponLimit ?? 2, new Set([...shopWeapons, ...source.tools.map(tool => tool.id)]).size) : 1;
    const slots = (items: readonly (AttachmentId | GearId | null)[]): EquipmentSlot[] =>
        items.map((id, slot) => ({ slot, locked: slot >= open, item: id ? getEquipmentOffer(id)! : null }));
    return {
        offers: offers.map(id => getEquipmentOffer(id)!),
        weapons: source.tools.map(tool => ({ id: tool.id, name: TOOLS[tool.id].name, slots: slots(tool.attachments ?? []) })),
        gear: slots(source.equipment.gear), weaponCapacity, refreshed,
        recommended: source.wave === 0 ? firstEquipmentPair(source) : undefined,
    };
}

function availableEquipment(source: EquipmentSource, tools: readonly ToolId[]): EquipmentOfferId[] {
    const installed = new Set(source.tools.flatMap(tool => tool.attachments ?? []));
    return [
        ...(!source.benchChoiceUsed && source.wave >= 1 && source.tools.length < (source.weaponLimit ?? 2)
            ? tools.filter(id => !source.tools.some(tool => tool.id === id)) : []),
        ...Object.values(ATTACHMENTS).filter(part => source.tools.some(tool => tool.id === part.weapon)
            && !installed.has(part.id) && partEligible(part, source.equipment, source.wave,
                source.wave === 1 && !source.benchChoiceUsed ? source.secondShopPart : undefined)).map(part => part.id),
        ...Object.values(GEAR).filter(item => !source.equipment.gear.includes(item.id)
            && gearEligible(item, source.equipment, source.wave)).map(item => item.id),
    ];
}

export function validEquipmentOffers(offers: unknown, source: EquipmentSource, tools: readonly ToolId[]): offers is EquipmentOfferId[] {
    const available = new Set<string>(availableEquipment(source, tools));
    return distinct(offers, item => typeof item === 'string' && available.has(item))
        && offers.length <= 3;
}
export function firstEquipmentPair(source: EquipmentSource): AttachmentId | GearId {
    return source.route === 'arc' ? `${source.tools[0].id}/link` : 'gear/pulse';
}
export function rollEquipmentOffers(source: EquipmentSource, tools: readonly ToolId[], seed: number,
    refreshed: boolean, previous: readonly EquipmentOfferId[] = []): EquipmentOfferId[] {
    const available = availableEquipment(source, tools);
    const random = randomStream(seed ^ Math.imul(source.wave + 1, 0x344b1a4f) ^ (refreshed ? 0xa14ee123 : 0));
    const offers: EquipmentOfferId[] = [];
    const add = (candidates: EquipmentOfferId[]): void => {
        const pool = candidates.filter(item => !offers.includes(item));
        const fresh = refreshed ? pool.filter(item => !previous.includes(item)) : [];
        const chosen = fresh.length ? fresh : pool;
        if (chosen.length && offers.length < 3) offers.push(chosen[Math.floor(random() * chosen.length)]);
    };
    if (source.wave === 0) {
        const first = firstEquipmentPair(source);
        if (available.includes(first)) offers.push(first);
    }
    if (source.secondShopPart && available.includes(source.secondShopPart)) offers.push(source.secondShopPart);
    const expanded = (source.weaponLimit ?? 2) > 2;
    if (source.wave >= 1 && (source.wave === 1 || expanded)) {
        const weapons = available.filter(isTool);
        if (offers.includes('wrench/flywheel')) {
            add(weapons.includes('hydraulic_nailer') ? ['hydraulic_nailer'] : weapons.filter(id => id !== 'bypass_wrench' && id !== 'wrench'));
        } else {
            add(weapons);
            if (source.wave === 1 && expanded) add(weapons);
        }
    }
    if (source.wave === 2 || source.wave === 4) {
        const variants: AttachmentKind[] = source.wave === 2 ? ['handling', 'alternate'] : ['finisher', 'signature'];
        const candidates = source.tools.map(weapon => available.filter(id =>
            owns(ATTACHMENTS, id) && ATTACHMENTS[id].weapon === weapon.id && variants.includes(ATTACHMENTS[id].variant)))
            .filter(parts => parts.length);
        // When shelf space is scarce, sample weapons independently of the order they were equipped.
        if (candidates.length > 3 - offers.length) {
            candidates.sort((a, b) => a[0] < b[0] ? -1 : 1);
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = Math.floor(random() * (i + 1));
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            if (refreshed) candidates.sort((a, b) => Number(b.some(id => !previous.includes(id)))
                - Number(a.some(id => !previous.includes(id))));
        }
        for (const parts of candidates) add(parts);
        if (source.tools.length === 1) add(available.filter(id =>
            owns(ATTACHMENTS, id) && variants.includes(ATTACHMENTS[id].variant)));
    }
    add(available.filter(id => owns(GEAR, id)));
    while (offers.length < 3 && offers.length < available.length) add(available);
    return offers;
}

export interface EquipmentPreview {
    allowed: boolean;
    reason: string | null;
    price: number;
    before: ResolvedEquipment;
    after: ResolvedEquipment;
    changes: string[];
    replaced: EquipmentOffer | null;
    next?: { tools: EquippedTool[]; equipment: EquipmentState };
}

function effectSummary(before: ResolvedEquipment, after: ResolvedEquipment, target: EquipmentTarget): string[] {
    if (target.kind === 'weapon') return [`装备${TOOLS[after.weapons[after.weapons.length - 1].id].name}`];
    const changes: string[] = [];
    const describe = (name: string, prior: number, next: number, unit = '') => {
        const amount = Math.round((next - prior) * 100) / 100;
        if (amount) changes.push(`${name} ${amount > 0 ? '+' : '−'}${Math.abs(amount)}${unit}`);
    };
    const toggle = (name: string, prior: boolean, next: boolean) => {
        if (prior !== next) changes.push(name + (next ? '生效' : '失效'));
    };
    if (target.kind === 'gear') {
        const first = before.actor, second = after.actor;
        describe('体力上限', first.maxHp, second.maxHp);
        describe('移动速度', first.moveScale * 100, second.moveScale * 100, ' 个百分点');
        describe('拾取范围', first.pickupRadius, second.pickupRadius);
        describe('波末回收率', first.salvageRate * 100, second.salvageRate * 100, ' 个百分点');
        toggle('格挡', first.shield, second.shield);
        toggle('拾取震击', first.pulse, second.pulse);
        return changes;
    }
    const first = before.weapons[target.weapon], second = after.weapons[target.weapon];
    describe(first.id === 'induction' || first.id === 'traction_coil' ? '作用半径' : '射程', first.reach, second.reach);
    describe('攻击间隔', 0, Math.round((second.interval - first.interval) * 1000 / TICK_RATE), ' 毫秒');
    describe('伤害', first.damage, second.damage);
    describe('近处命中伤害', first.close, second.close);
    describe('远处命中伤害', first.far, second.far);
    describe('连跳距离', first.chainReach, second.chainReach);
    describe('连跳次数', first.hops, second.hops);
    describe('穿刺目标', first.pierce, second.pierce);
    describe(first.id === 'traction_coil' ? '牵引目标' : '同时攻击', first.targets, second.targets, ' 台');
    if (first.spread !== second.spread) changes.push(second.spread > first.spread ? '打击范围变宽' : '打击范围变窄');
    describe(first.id === 'traction_coil' ? '拉近距离' : '推开距离', first.displacement, second.displacement);
    describe('第 4 击伤害', first.combo, second.combo);
    toggle('电弧连锁', first.arcLink, second.arcLink);
    toggle('过热增伤', first.heat, second.heat);
    toggle('连中两台后的宽扫', first.wideSweep, second.wideSweep);
    return changes;
}

export function previewEquipmentChange(source: EquipmentSource, offers: readonly EquipmentOfferId[], id: string,
    target: EquipmentTarget, baseHp: number): EquipmentPreview {
    const item = getEquipmentOffer(id);
    const before = resolveEquipment(source.tools, source.equipment, source.route, baseHp, source.blueprint);
    const deny = (reason: string): EquipmentPreview => ({
        allowed: false, reason, price: item?.price ?? 0, before, after: before, changes: [], replaced: null,
    });
    if (!item || !offers.includes(item.id)) return deny('货架上没有这件物品了');
    if (item.kind !== target.kind) return deny('选一个同类槽位');
    if (source.parts < item.price) return deny(`还差 ${item.price - source.parts} 个零件`);
    const tools = source.tools.slice();
    let equipment = source.equipment, old: AttachmentId | GearId | null = null;
    if (target.kind === 'weapon') {
        if (source.wave < 1 || tools.length >= (source.weaponLimit ?? 2)) return deny('没有空的武器位');
        if (!isTool(id) || tools.some(tool => tool.id === id)) return deny('这把武器已经装上了');
        tools.push({ id, mods: [], attachments: Array<null>(weaponAttachmentCapacity(equipment, id)).fill(null) });
    } else if (target.kind === 'attachment') {
        const tool = tools[target.weapon];
        if (!tool || !tool.attachments || !whole(target.slot, tool.attachments.length - 1)
            || target.slot >= openEquipmentSlots(source.wave + 1)) return deny('配件槽还没解锁');
        const part = ATTACHMENTS[id];
        if (part.weapon !== tool.id) return deny(`这个配件只能装在${TOOLS[part.weapon].name}上`);
        const attachments = tool.attachments.slice();
        old = attachments[target.slot];
        attachments[target.slot] = part.id;
        tools[target.weapon] = { ...tool, attachments };
    } else {
        if (!whole(target.slot, equipment.gear.length - 1)
            || target.slot >= openEquipmentSlots(source.wave + 1)) return deny('装备槽还没解锁');
        const slots = equipment.gear.slice();
        old = slots[target.slot];
        slots[target.slot] = GEAR[id].id;
        equipment = { ...equipment, gear: slots };
    }
    const after = resolveEquipment(tools, equipment, source.route, baseHp, source.blueprint);
    return { allowed: true, reason: null, price: item.price, before, after, changes: effectSummary(before, after, target),
        replaced: old ? getEquipmentOffer(old)! : null, next: { tools, equipment } };
}
