import { ALL_TOOL_IDS, CHAPTER_CATALOG, MODULE_BY_ID, RIG_CATALOG, WEAPON_CATALOG } from './catalog';
import type { ChapterId, DangerLevel, PreRunSupplyId, RigId, ToolId, WorkshopProfile } from './types';

export interface ChapterUnlockGrant {
    readonly nextChapter?: ChapterId;
    readonly rig?: RigId;
    readonly weapon?: ToolId;
    readonly customStarter?: boolean;
}

export interface PreRunSupplySpec {
    readonly id: PreRunSupplyId;
    readonly name: string;
    readonly cost: number;
    readonly detail: string;
}

export const CHAPTER_ORDER: readonly ChapterId[] = ['01', '02', '03', '04'];
export const DANGER_LEVELS: readonly DangerLevel[] = [0, 1, 2, 3, 4];

// Base victory credits scale with chapter difficulty (so Chapter 4 always pays more than Chapter 1).
export const CHAPTER_CLEAR_BONUS: Readonly<Record<ChapterId, number>> = {
    '01': 8,
    '02': 16,
    '03': 26,
    '04': 38,
};

// One-time first-clear milestone bonus per (chapter, danger) cell.
// Clearing a higher danger automatically awards any unclaimed lower-danger milestones on that chapter.
export const FIRST_CLEAR_DANGER_BONUS: Readonly<Record<DangerLevel, number>> = {
    0: 12,
    1: 16,
    2: 22,
    3: 30,
    4: 40,
};

export const DANGER_SHORT_LABELS: Readonly<Record<DangerLevel, string>> = {
    0: '标',
    1: '寒',
    2: '过',
    3: '封',
    4: '极',
};

export const DANGER_RULE_TEXT: Readonly<Record<DangerLevel, string>> = {
    0: '标准巡线节奏',
    1: '波间回血减至 18%',
    2: '货价 +10%，第 4 波起出干扰机',
    3: '精英带护卫，第 8 波增派精英',
    4: '首领出招提速，敞开窗口缩短',
};

export const STARTER_RIGS: readonly RigId[] = ['duty_standard', 'heavy_fitter'];

export const STARTER_WEAPONS: readonly ToolId[] = [
    'wrench',
    'arc_gun',
    'riveter',
    'hydraulic_nailer',
    'torch',
    'induction',
    'pulse_nozzle',
];

export const CHAPTER_UNLOCKS: Readonly<Record<ChapterId, ChapterUnlockGrant>> = {
    '01': { nextChapter: '02', rig: 'high_voltage', weapon: 'traction_coil' },
    '02': { nextChapter: '03', rig: 'thermal_welder', weapon: 'split_probe' },
    '03': { nextChapter: '04', rig: 'scrap_auditor', weapon: 'bypass_wrench' },
    '04': { customStarter: true },
};

// Tier-4 unique capstone modules unlocked globally by clearing higher Danger tiers (zero junk dilution).
export const DANGER_CAPSTONE_MODULES: Readonly<Record<Exclude<DangerLevel, 0>, string>> = {
    1: 'zero_line_tap',
    2: 'emergency_generator',
    3: 'master_wrench_rig',
    4: 'main_breaker_lever',
};

const MODULE_UNLOCK_DANGER: Readonly<Record<string, DangerLevel>> = {
    zero_line_tap: 1,
    emergency_generator: 2,
    master_wrench_rig: 3,
    main_breaker_lever: 4,
};

export const PRE_RUN_SUPPLY_ORDER: readonly PreRunSupplyId[] = [
    'none',
    'extra_crate',
    'spare_parts',
    'hot_thermos',
];

export const PRE_RUN_SUPPLIES: Readonly<Record<PreRunSupplyId, PreRunSupplySpec>> = {
    none: { id: 'none', name: '不带特供', cost: 0, detail: '标准空手出勤，不花凭证' },
    extra_crate: { id: 'extra_crate', name: '备用撬棍', cost: 12, detail: '前两次翻箱，各多送一次免费翻' },
    spare_parts: { id: 'spare_parts', name: '旧零件袋', cost: 15, detail: '带 35 零件进场，首店多买一件' },
    hot_thermos: { id: 'hot_thermos', name: '热茶加料', cost: 18, detail: '本班生命 +10，波间多回 10% 血' },
};

export type ProgressionProfileSlice = Pick<WorkshopProfile, 'clearedChapters' | 'maxDangerCleared'> & {
    readonly unlockedRigs?: readonly RigId[];
    readonly talents?: WorkshopProfile['talents'];
};

export function isChapterUnlocked(profile: Pick<WorkshopProfile, 'clearedChapters'>, chapterId: ChapterId): boolean {
    const idx = CHAPTER_ORDER.indexOf(chapterId);
    if (idx <= 0) return true;
    const prev = CHAPTER_ORDER[idx - 1];
    return profile.clearedChapters.includes(prev);
}

export function chapterUnlockHint(chapterId: ChapterId): string {
    const idx = CHAPTER_ORDER.indexOf(chapterId);
    if (idx <= 0) return '';
    const prev = CHAPTER_CATALOG[idx - 1];
    return `先通第${'一二三四'[idx - 1]}章「${prev.title}」开启`;
}

export function maxGlobalDangerCleared(profile?: Pick<WorkshopProfile, 'maxDangerCleared'>): number {
    if (!profile?.maxDangerCleared) return -1;
    let best = -1;
    for (const id of CHAPTER_ORDER) {
        const d = profile.maxDangerCleared[id];
        if (d !== undefined && d > best) best = d;
    }
    return best;
}

export function maxUnlockedDanger(profile?: Pick<WorkshopProfile, 'maxDangerCleared'>): DangerLevel {
    return Math.min(4, maxGlobalDangerCleared(profile) + 1) as DangerLevel;
}

export function isDangerUnlocked(profile: Pick<WorkshopProfile, 'maxDangerCleared'>, danger: DangerLevel): boolean {
    return danger <= maxUnlockedDanger(profile);
}

export function dangerUnlockHint(danger: DangerLevel): string {
    if (danger <= 0) return '';
    return `先通任意一章「${danger === 1 ? '标准夜班' : danger === 2 ? '寒潮加班' : danger === 3 ? '电网过载' : '全面封控'}」开启`;
}

export function unlockedRigsForProfile(profile?: Pick<WorkshopProfile, 'clearedChapters' | 'unlockedRigs'>): RigId[] {
    const set = new Set<RigId>(STARTER_RIGS);
    if (profile?.unlockedRigs) {
        for (const r of profile.unlockedRigs) set.add(r);
    }
    if (profile?.clearedChapters) {
        for (const ch of profile.clearedChapters) {
            const grant = CHAPTER_UNLOCKS[ch]?.rig;
            if (grant) set.add(grant);
        }
    }
    return Array.from(set);
}

export function isRigUnlocked(profile: Pick<WorkshopProfile, 'clearedChapters' | 'unlockedRigs'>, rigId: RigId): boolean {
    return unlockedRigsForProfile(profile).includes(rigId);
}

export function rigUnlockHint(rigId: RigId): string {
    for (let i = 0; i < CHAPTER_ORDER.length; i++) {
        const id = CHAPTER_ORDER[i];
        if (CHAPTER_UNLOCKS[id].rig === rigId) {
            return `首通第${'一二三四'[i]}章「${CHAPTER_CATALOG[i].title}」解锁`;
        }
    }
    return '';
}

export function unlockedWeaponsForProfile(profile?: Pick<WorkshopProfile, 'clearedChapters'>): ToolId[] {
    if (!profile) return [...ALL_TOOL_IDS];
    const set = new Set<ToolId>(STARTER_WEAPONS);
    for (const ch of profile.clearedChapters) {
        const w = CHAPTER_UNLOCKS[ch]?.weapon;
        if (w) set.add(w);
    }
    return Array.from(set);
}

export function hasCustomStarterUnlock(profile?: Pick<WorkshopProfile, 'clearedChapters'>): boolean {
    return !!profile?.clearedChapters.includes('04');
}

export function legalStarterWeaponsForRig(
    rigId: RigId,
    profile?: Pick<WorkshopProfile, 'clearedChapters'>,
): ToolId[] {
    const rig = RIG_CATALOG[rigId];
    const banned = new Set(rig.bannedTags ?? []);
    const unlocked = unlockedWeaponsForProfile(profile);
    const list = unlocked.filter(id => !WEAPON_CATALOG[id].tags.some(t => banned.has(t)));
    if (!list.includes(rig.starterWeapon)) list.unshift(rig.starterWeapon);
    else {
        // Keep the rig's signature starter first in cycle order
        const idx = list.indexOf(rig.starterWeapon);
        if (idx > 0) {
            list.splice(idx, 1);
            list.unshift(rig.starterWeapon);
        }
    }
    return list;
}

export function moduleRequiredDanger(moduleId: string): DangerLevel | null {
    return MODULE_UNLOCK_DANGER[moduleId] ?? null;
}

export function isModuleUnlocked(profile: Pick<WorkshopProfile, 'maxDangerCleared'> | undefined, moduleId: string): boolean {
    const req = MODULE_UNLOCK_DANGER[moduleId];
    if (req === undefined) return true;
    if (!profile) return true;
    return maxGlobalDangerCleared(profile) >= req;
}

export function bonusBanSlotsForProfile(profile?: Pick<WorkshopProfile, 'maxDangerCleared'>): number {
    return maxGlobalDangerCleared(profile) >= 2 ? 2 : 0;
}

export function bonusLockSlotsForProfile(profile?: Pick<WorkshopProfile, 'maxDangerCleared'>): number {
    return maxGlobalDangerCleared(profile) >= 3 ? 1 : 0;
}

export function totalBanSlots(profile: Pick<WorkshopProfile, 'talents' | 'maxDangerCleared'>): number {
    return (profile.talents.ban_permit ?? 0) * 2 + bonusBanSlotsForProfile(profile);
}

export function isSecretArchiveUnlocked(profile: Pick<WorkshopProfile, 'maxDangerCleared'>, chapterId: ChapterId): boolean {
    return (profile.maxDangerCleared[chapterId] ?? -1) >= 2;
}

export function goldSealCount(profile: Pick<WorkshopProfile, 'maxDangerCleared'>): number {
    let count = 0;
    for (const id of CHAPTER_ORDER) {
        if (profile.maxDangerCleared[id] === 4) count++;
    }
    return count;
}

export function unclaimedFirstClearBonus(
    profile: Pick<WorkshopProfile, 'maxDangerCleared'>,
    chapterId: ChapterId,
    danger: DangerLevel,
): number {
    const prev = profile.maxDangerCleared[chapterId] ?? -1;
    if (danger <= prev) return 0;
    let sum = 0;
    for (let d = prev + 1; d <= danger; d++) {
        sum += FIRST_CLEAR_DANGER_BONUS[d as DangerLevel];
    }
    return sum;
}

export function computeRunUnlocks(
    prev: WorkshopProfile,
    next: WorkshopProfile,
    chapterId: ChapterId,
    danger: DangerLevel,
): string[] {
    const list: string[] = [];

    // 1. Chapter first-clear unlocks
    if (!prev.clearedChapters.includes(chapterId) && next.clearedChapters.includes(chapterId)) {
        const grant = CHAPTER_UNLOCKS[chapterId];
        if (grant.nextChapter) {
            const nextCh = CHAPTER_CATALOG.find(c => c.id === grant.nextChapter);
            if (nextCh) list.push(`开启第${'一二三四'[nextCh.index]}章 · ${nextCh.title}`);
        }
        if (grant.rig && !isRigUnlocked(prev, grant.rig)) {
            list.push(`新工装：${RIG_CATALOG[grant.rig].name}`);
        }
        if (grant.weapon) {
            list.push(`入库武器：${WEAPON_CATALOG[grant.weapon].name}`);
        }
        if (grant.customStarter) {
            list.push('解锁：出勤可自选起手武器');
        }
    }

    // 2. Global danger ladder unlock
    const prevMaxD = maxUnlockedDanger(prev);
    const nextMaxD = maxUnlockedDanger(next);
    if (nextMaxD > prevMaxD) {
        const names: Record<DangerLevel, string> = {
            0: '标准夜班', 1: '寒潮加班', 2: '电网过载', 3: '全面封控', 4: '极限值守',
        };
        list.push(`解锁新危急：${names[nextMaxD]}`);
    }

    // 3. Global Danger capstone module + meta perks (checks every newly crossed danger threshold!)
    const prevGlobal = maxGlobalDangerCleared(prev);
    const nextGlobal = maxGlobalDangerCleared(next);
    for (const d of [1, 2, 3, 4] as const) {
        if (prevGlobal < d && nextGlobal >= d) {
            const modId = DANGER_CAPSTONE_MODULES[d];
            const mod = MODULE_BY_ID[modId];
            if (mod) list.push(`违章件入库：${mod.name}`);
            if (d === 2) list.push('工坊黑名单位 +2');
            if (d === 3) list.push('商店锁定上限 +1');
        }
    }

    // 4. Chapter-specific secret archive (unlocked at Danger >= 2 per chapter)
    if (!isSecretArchiveUnlocked(prev, chapterId) && isSecretArchiveUnlocked(next, chapterId)) {
        list.push('解锁本章加班密件');
    }

    // 5. Chapter Gold Seal (Danger 4 clear on this chapter)
    const prevChD = prev.maxDangerCleared[chapterId] ?? -1;
    if (prevChD < 4 && danger === 4 && next.maxDangerCleared[chapterId] === 4) {
        const seals = goldSealCount(next);
        list.push(seals === 4 ? '达成：全城值守·金章！' : `本章金印达成（${seals}/4）`);
    }

    return list;
}
