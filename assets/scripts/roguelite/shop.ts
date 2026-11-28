import { randomStream } from './constants';
import {
    ALL_TOOL_IDS,
    MODULE_BY_ID,
    MODULE_CATALOG,
    RIG_CATALOG,
    WEAPON_CATALOG,
} from './catalog';
import {
    computeSynergies,
    rerollPrice,
    resolveBuild,
    rollTier,
    shopOfferPrice,
    weaponSellRefund,
} from './formulas';
import type { ResolvedBuild } from './formulas';
import { STAT_LABELS } from './narrative';
import { SHOP_EMERGENCY_PARTS } from './engagement';
import { isModuleUnlocked, unlockedWeaponsForProfile } from './progression';
import type {
    DailyShiftModifierId,
    DangerLevel,
    LevelUpOption,
    ModuleSpec,
    PreRunSupplyId,
    RigId,
    ShopSlot,
    StatDelta,
    StatKey,
    Tier,
    ToolId,
    WeaponInstance,
    WeaponTag,
    WorkshopProfile,
} from './types';

export type ShopProfileSlice = Pick<WorkshopProfile, 'talents' | 'bannedModules'> & {
    readonly clearedChapters?: WorkshopProfile['clearedChapters'];
    readonly maxDangerCleared?: WorkshopProfile['maxDangerCleared'];
    readonly onboardingDone?: WorkshopProfile['onboardingDone'];
};

export const MAX_WEAPONS = 6;
export const SHOP_SLOTS = 4;

const LEVEL_UP_TABLE: Readonly<Record<StatKey, readonly [number, number, number, number]>> = {
    maxHp: [8, 14, 22, 32],
    torque: [3, 6, 10, 15],
    voltage: [3, 6, 10, 15],
    overclock: [6, 11, 17, 25],
    cycleSpeed: [6, 11, 17, 25],
    critChance: [5, 9, 14, 20],
    armor: [2, 3, 5, 7],
    repair: [2, 4, 6, 9],
    salvage: [6, 10, 15, 22],
    luck: [6, 11, 17, 24],
    moveSpeed: [4, 7, 11, 15],
    pickupRadius: [12, 20, 30, 42],
};

const LEVEL_UP_KEYS = Object.keys(LEVEL_UP_TABLE) as StatKey[];

export interface IntermissionState {
    readonly wave: number; // wave just finished (1..11+)
    readonly seed: number;
    readonly rigId: RigId;
    readonly danger?: DangerLevel;
    readonly supply?: PreRunSupplyId;
    readonly dailyMod?: DailyShiftModifierId;
    parts: number;
    level: number;
    pendingLevelUps: number;
    levelUpOptions: LevelUpOption[];
    levelUpRerolls: number;
    levelStats: StatDelta;
    weapons: WeaponInstance[];
    modules: string[];
    slots: ShopSlot[];
    paidRerolls: number;
    freeRerollsLeft: number;
    buyoutBonusUsed: boolean;
    recoveryLock: boolean;
    recoveryOrder: boolean;
    nextWeaponUid: number;
    rollSerial: number;
}

export type ShopCheckpoint = Pick<IntermissionState, 'slots' | 'levelUpOptions' | 'levelUpRerolls'
    | 'paidRerolls' | 'freeRerollsLeft' | 'buyoutBonusUsed' | 'rollSerial' | 'recoveryLock' | 'recoveryOrder'>;

export interface ShopViewModel {
    readonly wave: number;
    readonly parts: number;
    readonly level: number;
    readonly pendingLevelUps: number;
    readonly levelUpOptions: readonly LevelUpOption[];
    readonly levelUpRerollCost: number;
    readonly slots: readonly ShopSlot[];
    readonly weapons: readonly (WeaponInstance & {
        readonly name: string;
        readonly sellRefund: number;
        readonly canMergeWith: number | null;
    })[];
    readonly build: ResolvedBuild;
    readonly nextRerollCost: number;
    readonly freeRerollsLeft: number;
    readonly lockCount: number;
    readonly maxLocks: number;
}

function legalToolsForRig(rigId: RigId, profile?: ShopProfileSlice): ToolId[] {
    const rig = RIG_CATALOG[rigId];
    const banned = new Set(rig.bannedTags ?? []);
    const unlocked = profile?.clearedChapters ? unlockedWeaponsForProfile(profile) : ALL_TOOL_IDS;
    const tools = unlocked.filter(id => !WEAPON_CATALOG[id].tags.some(t => banned.has(t)));
    if (!tools.includes(rig.starterWeapon)) tools.unshift(rig.starterWeapon);
    return tools;
}

function pickWeighted<T>(items: readonly T[], rand: () => number): T | undefined {
    if (!items.length) return undefined;
    return items[Math.floor(rand() * items.length)];
}

export function canAutoMergeWeapon(weapons: readonly WeaponInstance[], toolId: ToolId, tier: Tier): number {
    if (tier >= 4) return -1;
    return weapons.findIndex(w => w.id === toolId && w.tier === tier);
}

/** True only when buying this shop weapon will IMMEDIATELY merge into a higher tier (all 6 slots full). */
export function willAutoMergeOnBuy(weapons: readonly WeaponInstance[], toolId: ToolId, tier: Tier): boolean {
    return weapons.length >= MAX_WEAPONS && canAutoMergeWeapon(weapons, toolId, tier) >= 0;
}

export function rollLevelUpOptions(
    level: number,
    luck: number,
    seed: number,
    serial: number,
    rigId: RigId,
): LevelUpOption[] {
    const rand = randomStream(seed ^ Math.imul(level + 17, 0x2c1b3c6d) ^ Math.imul(serial + 1, 0x9e3779b1));
    const guaranteed: Tier = level % 10 === 0 ? 3 : level % 5 === 0 ? 2 : 1;
    const pool = [...LEVEL_UP_KEYS];
    const rig = RIG_CATALOG[rigId];
    const picked: StatKey[] = [];
    while (picked.length < 4 && pool.length) {
        // Gentle bias toward rig's build stats without locking out defense/economy
        const idx = Math.floor(rand() * pool.length);
        const stat = pool.splice(idx, 1)[0];
        if (rig.bannedTags?.includes('ballistic') && stat === 'critChance' && rand() < 0.35 && pool.length >= 4 - picked.length) {
            continue;
        }
        picked.push(stat);
    }
    return picked.map((stat, idx) => {
        const tier = rollTier(level, luck, rand, guaranteed);
        const amount = LEVEL_UP_TABLE[stat][tier - 1];
        const meta = STAT_LABELS[stat];
        return {
            id: `lvl-${level}-${serial}-${idx}-${stat}`,
            stat,
            tier,
            amount,
            label: meta.name,
            detail: `${meta.name} +${amount}${meta.unit}`,
        };
    });
}

function rollShopSlots(
    state: IntermissionState,
    profile?: ShopProfileSlice,
    previousIds: ReadonlySet<string> = new Set(),
): ShopSlot[] {
    const rand = randomStream(
        state.seed ^ Math.imul(state.wave + 1, 0x45d9f3b) ^ Math.imul(++state.rollSerial, 0x119de1f3),
    );
    const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
    const rig = RIG_CATALOG[state.rigId];
    const bannedModules = new Set(profile?.bannedModules ?? []);
    const ownedUnique = new Set(state.modules.filter(id => MODULE_BY_ID[id]?.unique));
    const dangerSlice = profile?.maxDangerCleared ? { maxDangerCleared: profile.maxDangerCleared } : undefined;
    const legalTools = legalToolsForRig(state.rigId, profile);
    const ownedTools = Array.from(new Set(state.weapons.map(w => w.id)));
    const ownedTags = new Set<WeaponTag>(state.weapons.flatMap(w => WEAPON_CATALOG[w.id].tags));
    if (rig.allArcTag) ownedTags.add('arc');

    // Keep locked unsold slots with frozen prices!
    const result: (ShopSlot | null)[] = Array.from({ length: SHOP_SLOTS }, (_, i) => {
        const existing = state.slots[i];
        if (existing && existing.locked && !existing.sold) {
            return {
                ...existing,
                slotIndex: i,
                canAutoMerge: existing.kind === 'weapon' && willAutoMergeOnBuy(state.weapons, existing.itemId as ToolId, existing.tier),
            };
        }
        return null;
    });

    const lockedWeapons = result.filter(s => s?.kind === 'weapon').length;
    const minWeapons = state.wave <= 2 ? 2 : state.wave <= 5 ? 1 : 0;
    let weaponsNeeded = Math.max(0, minWeapons - lockedWeapons);

    const usedInShelf = new Set<string>(
        result.filter((s): s is ShopSlot => !!s).map(s => `${s.kind}:${s.itemId}:${s.tier}`),
    );
    const usedModuleIds = new Set<string>(
        result.filter((s): s is ShopSlot => !!s && s.kind === 'module').map(s => s.itemId),
    );

    // Same-class bonus fades linearly from +15% on W1 to 0% on W6+ (Brotato-style anti-dilution)
    const classBonus = state.wave <= 5 ? 0.18 - (state.wave - 1) * 0.03 : 0;

    // Lightweight onboarding guarantee: first Wave-1 shop for a brand-new player always includes
    // an affordable Tier-1 copy of their starter weapon in slot 0 so they can try buying AND 2-in-1 merging!
    const guaranteeOnboardingMerge = state.wave === 1
        && state.rollSerial === 1
        && !!profile
        && !profile.onboardingDone
        && !(profile.clearedChapters?.length)
        && !result[0]
        && state.weapons.length >= 1;
    if (guaranteeOnboardingMerge) {
        const starterId = state.weapons[0].id;
        const basePrice = WEAPON_CATALOG[starterId].tiers[0].price;
        result[0] = {
            slotIndex: 0,
            kind: 'weapon',
            itemId: starterId,
            tier: 1,
            price: shopOfferPrice(basePrice, state.wave, build.shopPriceScale),
            locked: false,
            sold: false,
            canAutoMerge: willAutoMergeOnBuy(state.weapons, starterId, 1),
        };
        usedInShelf.add(`weapon:${starterId}:1`);
        weaponsNeeded = Math.max(0, weaponsNeeded - 1);
    }

    for (let i = 0; i < SHOP_SLOTS; i++) {
        if (result[i]) continue;
        const isWeapon = weaponsNeeded > 0 || rand() < (state.weapons.length < MAX_WEAPONS ? 0.44 : 0.34);
        if (isWeapon) {
            weaponsNeeded = Math.max(0, weaponsNeeded - 1);
            const tier = rollTier(state.wave, build.stats.luck, rand, 1);
            let toolId: ToolId | undefined;
            for (let attempt = 0; attempt < 8; attempt++) {
                const roll = rand();
                let pool: ToolId[];
                if (roll < 0.25 && ownedTools.length) {
                    pool = ownedTools;
                } else if (roll < 0.25 + 0.25 + classBonus && ownedTags.size) {
                    pool = legalTools.filter(id => WEAPON_CATALOG[id].tags.some(t => ownedTags.has(t)));
                } else {
                    pool = legalTools;
                }
                const candidate = pickWeighted(pool.length ? pool : legalTools, rand);
                if (!candidate) continue;
                const key = `weapon:${candidate}:${tier}`;
                if (usedInShelf.has(key)) continue;
                if (attempt < 4 && previousIds.has(key)) continue;
                toolId = candidate;
                break;
            }
            toolId ??= pickWeighted(legalTools, rand)!;
            const key = `weapon:${toolId}:${tier}`;
            usedInShelf.add(key);
            const basePrice = WEAPON_CATALOG[toolId].tiers[tier - 1].price;
            result[i] = {
                slotIndex: i,
                kind: 'weapon',
                itemId: toolId,
                tier,
                price: shopOfferPrice(basePrice, state.wave, build.shopPriceScale),
                locked: false,
                sold: false,
                canAutoMerge: willAutoMergeOnBuy(state.weapons, toolId, tier),
            };
        } else {
            const targetTier = rollTier(state.wave, build.stats.luck, rand, 1);
            const eligible = (tier: Tier): ModuleSpec[] => MODULE_CATALOG.filter(m =>
                m.tier === tier
                && isModuleUnlocked(dangerSlice, m.id)
                && !bannedModules.has(m.id)
                && !ownedUnique.has(m.id)
                && !usedModuleIds.has(m.id),
            );
            let pool = eligible(targetTier);
            for (let fallback = targetTier - 1; !pool.length && fallback >= 1; fallback--) {
                pool = eligible(fallback as Tier);
            }
            if (!pool.length) pool = MODULE_CATALOG.filter(m => isModuleUnlocked(dangerSlice, m.id) && !usedModuleIds.has(m.id) && !ownedUnique.has(m.id));
            // Tag affinity: 22% chance to pull from owned/wanted tags to curb pool dilution
            const wanted = new Set<WeaponTag>(Array.from(ownedTags).concat(rig.wantedTags));
            const tagged = pool.filter(m => m.tags.some(t => wanted.has(t)));
            const freshPool = (pool.filter(m => !previousIds.has(`module:${m.id}`)).length ? pool.filter(m => !previousIds.has(`module:${m.id}`)) : pool);
            const chosenPool = tagged.length && rand() < 0.25 ? tagged : freshPool;
            const mod = pickWeighted(chosenPool, rand) ?? MODULE_CATALOG[0];
            usedModuleIds.add(mod.id);
            result[i] = {
                slotIndex: i,
                kind: 'module',
                itemId: mod.id,
                tier: mod.tier,
                price: shopOfferPrice(mod.price, state.wave, build.shopPriceScale),
                locked: false,
                sold: false,
            };
        }
    }
    return result as ShopSlot[];
}

export function createIntermission(
    params: {
        readonly wave: number;
        readonly seed: number;
        readonly rigId: RigId;
        readonly danger?: DangerLevel;
        readonly supply?: PreRunSupplyId;
        readonly dailyMod?: DailyShiftModifierId;
        readonly parts: number;
        readonly level: number;
        readonly pendingLevelUps: number;
        readonly levelStats: StatDelta;
        readonly weapons: readonly WeaponInstance[];
        readonly modules: readonly string[];
        readonly carryLockedSlots?: readonly ShopSlot[];
        readonly recoveryRank?: Tier;
        readonly nextWeaponUid: number;
    },
    profile?: ShopProfileSlice,
    checkpoint?: ShopCheckpoint,
): IntermissionState {
    const danger = params.danger ?? 0;
    const supply = params.supply ?? 'none';
    const build = resolveBuild(params.rigId, params.level, params.levelStats, params.weapons, params.modules, profile, danger, supply, params.dailyMod);
    const supplyFreeReroll = supply === 'extra_crate' && params.wave <= 2 ? 1 : 0;
    const state: IntermissionState = {
        wave: params.wave,
        seed: params.seed,
        rigId: params.rigId,
        danger,
        supply,
        dailyMod: params.dailyMod,
        parts: params.parts,
        level: params.level,
        pendingLevelUps: params.pendingLevelUps,
        levelUpOptions: [],
        levelUpRerolls: 0,
        levelStats: { ...params.levelStats },
        weapons: params.weapons.map(w => ({ ...w })),
        modules: [...params.modules],
        slots: (params.carryLockedSlots ?? []).map(s => ({ ...s })),
        paidRerolls: 0,
        freeRerollsLeft: build.freeRerollsPerShop + supplyFreeReroll,
        recoveryLock: (params.recoveryRank ?? 1) >= 3,
        recoveryOrder: params.recoveryRank === 4,
        buyoutBonusUsed: false,
        nextWeaponUid: params.nextWeaponUid,
        rollSerial: 0,
    };
    if (checkpoint) {
        return {
            ...state,
            slots: checkpoint.slots.map(slot => ({ ...slot })),
            levelUpOptions: checkpoint.levelUpOptions.map(option => ({ ...option })),
            levelUpRerolls: checkpoint.levelUpRerolls,
            paidRerolls: checkpoint.paidRerolls,
            freeRerollsLeft: checkpoint.freeRerollsLeft,
            buyoutBonusUsed: checkpoint.buyoutBonusUsed,
            recoveryOrder: checkpoint.recoveryOrder === true,
            recoveryLock: checkpoint.recoveryLock === true,
            rollSerial: checkpoint.rollSerial,
        };
    }
    if (state.pendingLevelUps > 0) {
        const nextLvl = state.level - state.pendingLevelUps + 1;
        state.levelUpOptions = rollLevelUpOptions(nextLvl, build.stats.luck, state.seed, 0, state.rigId);
    }
    state.slots = rollShopSlots(state, profile);
    return state;
}

export function pickLevelUp(
    state: IntermissionState,
    optionIndex: number,
    profile?: ShopProfileSlice,
): boolean {
    if (state.pendingLevelUps <= 0) return false;
    const opt = state.levelUpOptions[optionIndex];
    if (!opt) return false;
    state.levelStats[opt.stat] = (state.levelStats[opt.stat] ?? 0) + opt.amount;
    state.pendingLevelUps--;
    if (state.pendingLevelUps > 0) {
        const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
        const nextLvl = state.level - state.pendingLevelUps + 1;
        state.levelUpOptions = rollLevelUpOptions(nextLvl, build.stats.luck, state.seed, ++state.rollSerial, state.rigId);
    } else {
        state.levelUpOptions = [];
    }
    return true;
}

export function rerollLevelUp(
    state: IntermissionState,
    profile?: ShopProfileSlice,
): boolean {
    if (state.pendingLevelUps <= 0) return false;
    const cost = rerollPrice(state.wave, state.levelUpRerolls);
    if (state.parts < cost) return false;
    state.parts -= cost;
    state.levelUpRerolls++;
    const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
    const nextLvl = state.level - state.pendingLevelUps + 1;
    state.levelUpOptions = rollLevelUpOptions(nextLvl, build.stats.luck, state.seed, ++state.rollSerial, state.rigId);
    return true;
}

export function toggleLockSlot(
    state: IntermissionState,
    slotIndex: number,
    profile?: Pick<WorkshopProfile, 'talents'> & { readonly maxDangerCleared?: WorkshopProfile['maxDangerCleared'] },
): boolean {
    const slot = state.slots[slotIndex];
    if (!slot || slot.sold) return false;
    if (slot.locked) {
        state.slots[slotIndex] = { ...slot, locked: false };
        return true;
    }
    const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
    const currentLocks = state.slots.filter(s => s.locked && !s.sold).length;
    if (currentLocks >= build.maxLocks + Number(state.recoveryLock)) return false;
    state.slots[slotIndex] = { ...slot, locked: true };
    return true;
}

function refreshMergeHints(state: IntermissionState): void {
    state.slots = state.slots.map(s =>
        s.kind === 'weapon' && !s.sold
            ? { ...s, canAutoMerge: willAutoMergeOnBuy(state.weapons, s.itemId as ToolId, s.tier) }
            : s,
    );
}

export function buyShopSlot(
    state: IntermissionState,
    slotIndex: number,
    profile?: ShopProfileSlice,
): { readonly ok: boolean; readonly merged?: boolean; readonly freeBuyoutReroll?: boolean; readonly reason?: string } {
    if (state.pendingLevelUps > 0) return { ok: false, reason: '请先选完升级。' };
    const slot = state.slots[slotIndex];
    if (!slot || slot.sold) return { ok: false, reason: '这件商品已售出。' };
    if (state.parts < slot.price) return { ok: false, reason: `还差 ${slot.price - state.parts} 铜件。` };

    let merged = false;
    if (slot.kind === 'weapon') {
        const toolId = slot.itemId as ToolId;
        const mergeIdx = canAutoMergeWeapon(state.weapons, toolId, slot.tier);
        if (state.weapons.length >= MAX_WEAPONS) {
            if (mergeIdx < 0) return { ok: false, reason: '武器栏已满。先合成或拆解一把。' };
            state.weapons[mergeIdx] = { ...state.weapons[mergeIdx], tier: (slot.tier + 1) as Tier };
            merged = true;
        } else {
            state.weapons.push({ uid: state.nextWeaponUid++, id: toolId, tier: slot.tier });
        }
    } else {
        state.modules.push(slot.itemId);
    }

    state.parts -= slot.price;
    state.slots[slotIndex] = { ...slot, sold: true, locked: false };
    refreshMergeHints(state);

    // Buying out all 4 slots grants one genuine free reroll (does not advance paid reroll ladder)
    let freeBuyoutReroll = false;
    if (!state.buyoutBonusUsed && state.slots.every(s => s.sold)) {
        state.buyoutBonusUsed = true;
        freeBuyoutReroll = true;
        state.slots = rollShopSlots(state, profile);
    }
    return { ok: true, merged, freeBuyoutReroll };
}

export function mergeOwnedWeapons(state: IntermissionState, slotA: number, slotB: number): boolean {
    if (slotA === slotB) return false;
    const a = state.weapons[slotA];
    const b = state.weapons[slotB];
    if (!a || !b || a.id !== b.id || a.tier !== b.tier || a.tier >= 4) return false;
    const keep = Math.min(slotA, slotB);
    const drop = Math.max(slotA, slotB);
    state.weapons[keep] = { ...state.weapons[keep], tier: (a.tier + 1) as Tier };
    state.weapons.splice(drop, 1);
    refreshMergeHints(state);
    return true;
}

export function sellOwnedWeapon(
    state: IntermissionState,
    slotIndex: number,
    profile?: Pick<WorkshopProfile, 'talents'> & { readonly maxDangerCleared?: WorkshopProfile['maxDangerCleared'] },
): number {
    if (state.weapons.length <= 1) return 0;
    const w = state.weapons[slotIndex];
    if (!w) return 0;
    const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
    const refund = weaponSellRefund(w.id, w.tier, state.wave, build.shopPriceScale);
    state.weapons.splice(slotIndex, 1);
    state.parts += refund;
    refreshMergeHints(state);
    return refund;
}

export function orderRecoveredWeapon(state: IntermissionState, uid: number, profile: ShopProfileSlice): boolean {
    if (!state.recoveryOrder || state.pendingLevelUps > 0) return false;
    const item = state.weapons.find(w => w.uid === uid);
    const index = state.slots.findIndex(slot => !slot.locked || slot.sold);
    if (!item || index < 0 || !legalToolsForRig(state.rigId, profile).includes(item.id)) return false;
    const build = shopViewModel(state, profile).build;
    state.slots[index] = { kind: 'weapon', itemId: item.id, tier: item.tier, slotIndex: index, sold: false, locked: false,
        price: shopOfferPrice(WEAPON_CATALOG[item.id].tiers[item.tier - 1].price, state.wave, build.shopPriceScale),
        canAutoMerge: willAutoMergeOnBuy(state.weapons, item.id, item.tier) };
    state.recoveryOrder = false;
    return true;
}

export function hasRefreshableShopSlots(slots: readonly ShopSlot[]): boolean {
    return slots.some(slot => slot.sold || !slot.locked);
}

export function rerollShop(
    state: IntermissionState,
    profile?: ShopProfileSlice,
): boolean {
    if (state.pendingLevelUps > 0 || !hasRefreshableShopSlots(state.slots)) return false;
    if (state.freeRerollsLeft > 0) {
        state.freeRerollsLeft--;
    } else {
        const cost = rerollPrice(state.wave, state.paidRerolls);
        if (state.parts < cost) return false;
        state.parts -= cost;
        state.paidRerolls++;
    }
    const previous = new Set(
        state.slots.map(s => (s.kind === 'weapon' ? `weapon:${s.itemId}:${s.tier}` : `module:${s.itemId}`)),
    );
    state.slots = rollShopSlots(state, profile, previous);
    return true;
}

export function shopViewModel(
    state: IntermissionState,
    profile?: ShopProfileSlice,
): ShopViewModel {
    const build = resolveBuild(state.rigId, state.level, state.levelStats, state.weapons, state.modules, profile, state.danger ?? 0, state.supply ?? 'none', state.dailyMod);
    return {
        wave: state.wave,
        parts: state.parts,
        level: state.level,
        pendingLevelUps: state.pendingLevelUps,
        levelUpOptions: state.levelUpOptions,
        levelUpRerollCost: rerollPrice(state.wave, state.levelUpRerolls),
        slots: state.slots,
        weapons: state.weapons.map((w, idx) => {
            const partner = state.weapons.findIndex((other, j) => j !== idx && other.id === w.id && other.tier === w.tier && w.tier < 4);
            return {
                ...w,
                name: WEAPON_CATALOG[w.id].name,
                sellRefund: weaponSellRefund(w.id, w.tier, state.wave, build.shopPriceScale),
                canMergeWith: partner >= 0 ? partner : null,
            };
        }),
        build,
        nextRerollCost: state.freeRerollsLeft > 0 ? 0 : rerollPrice(state.wave, state.paidRerolls),
        freeRerollsLeft: state.freeRerollsLeft,
        lockCount: state.slots.filter(s => s.locked && !s.sold).length,
        maxLocks: build.maxLocks + Number(state.recoveryLock),
    };
}

export function grantShopEmergencyAid(state: IntermissionState): void {
    state.parts += SHOP_EMERGENCY_PARTS;
    state.freeRerollsLeft += 1;
}

export function describeSynergies(weapons: readonly WeaponInstance[], rigId: RigId): string[] {
    return computeSynergies(weapons, rigId)
        .filter(s => s.activeTier > 0)
        .map(s => `${s.name}(${s.count})：${s.summary}`);
}
