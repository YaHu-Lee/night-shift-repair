import { ALL_TOOL_IDS, CHAPTER_CATALOG, MODULE_BY_ID, RIG_CATALOG, WEAPON_CATALOG } from './catalog';
import type { ChapterId, DangerLevel, PreRunSupplyId, RigId, Tier, ToolId, WorkshopProfile } from './types';

export interface ChapterUnlockGrant {
    readonly nextChapter?: ChapterId;
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

export const DANGER_NAMES: Readonly<Record<DangerLevel, string>> = {
    0: '02:13 断电',
    1: '寒潮来袭',
    2: '清退加急',
    3: '全区封锁',
    4: '03:55 最后期限',
};

export const DANGER_RULE_TEXT: Readonly<Record<DangerLevel, string>> = {
    0: '标准难度。',
    1: '每波结束时只回复已损失生命的 18%。',
    2: '商店涨价 10%，第 4 波起出现干扰机。',
    3: '中段精英带有护卫，第 8 波增加精英敌机。',
    4: '首领的攻击间隔更短，弱点暴露时间也更短。',
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
    '01': { nextChapter: '02' },
    '02': { nextChapter: '03' },
    '03': { nextChapter: '04' },
    '04': { customStarter: true },
};

export const WEAPON_MODS = {
    saw_fork: ['rebound_saw', '锯盘撞墙分叉', '锯盘第一次撞墙时分出一枚小锯盘，沿另一条路线切过敌群。'],
    hook_collision: ['traction_coil', '抓钩撞敌', '抓钩把目标拉近时，会撞伤拉扯路径上的其他敌机。'],
    saw_return: ['rebound_saw', '锯盘回程再切', '锯盘飞出一段距离后折返，回程可以再次切中同一台敌机。'],
    probe_net: ['split_probe', '双针电网', '电击针同时击中两台敌机时，会在它们之间拉起一段短暂的电网。'],
    rivet_pin: ['rivet_line', '铆索钉墙', '把靠近场地边缘的普通敌机钉在墙上，暂时限制它的移动。'],
    rivet_trip: ['rivet_line', '双索绊线', '铆索留在场上的时间更长。下一发会与上一发的落点相连，绊住穿过的敌机。'],
    pry_collision: ['bypass_wrench', '撬棍撞伤后排', '用撬棍击退前排时，被撞到的后排敌机也会受伤。'],
    echo_repeat: ['echo_horn', '声波延迟重响', '第一圈声波发出后，原地会再响一次。'],
    echo_twin: ['echo_horn', '双机夹击', '发出声波的同时，在目标后方也激起一圈较小的声波。'],
    stake_link: ['breaker_stake', '地桩持续通电', '新地桩与上一根地桩之间拉起电线，伤害穿线的敌机。'],
    welder_trail: ['patrol_welder', '焊机沿路径留痕', '焊机追击时沿路留下灼热焊痕，伤害踏入的敌机。'],
    stake_loop: ['breaker_stake', '地桩围成放电回路', '三根地桩围成三角时向区域内放电。'],
} as const satisfies Record<string, readonly [ToolId, string, string]>;
export type WeaponMod = keyof typeof WEAPON_MODS;

export interface Milestone {
    readonly weapon?: ToolId;
    readonly mod?: WeaponMod;
    readonly rigs?: readonly (readonly [RigId, Tier])[];
}
export const MILESTONES: Readonly<Record<ChapterId, readonly [Milestone, Milestone, Milestone, Milestone, Milestone]>> = {
    '01': [
        { weapon: 'traction_coil', rigs: [['high_voltage', 1], ['duty_standard', 2]] },
        { weapon: 'rebound_saw', rigs: [['duty_standard', 3]] },
        { mod: 'saw_fork', rigs: [['duty_standard', 4], ['high_voltage', 2]] },
        { mod: 'hook_collision', rigs: [['high_voltage', 3]] },
        { mod: 'saw_return', rigs: [['high_voltage', 4]] },
    ],
    '02': [
        { weapon: 'split_probe', rigs: [['thermal_welder', 1], ['heavy_fitter', 2]] },
        { weapon: 'rivet_line', rigs: [['heavy_fitter', 3]] },
        { mod: 'probe_net', rigs: [['heavy_fitter', 4], ['thermal_welder', 2]] },
        { mod: 'rivet_pin', rigs: [['thermal_welder', 3]] },
        { mod: 'rivet_trip', rigs: [['thermal_welder', 4]] },
    ],
    '03': [
        { weapon: 'bypass_wrench', rigs: [['scrap_auditor', 1]] },
        { weapon: 'echo_horn', rigs: [['scrap_auditor', 2]] },
        { mod: 'pry_collision', rigs: [['scrap_auditor', 3]] },
        { mod: 'echo_repeat', rigs: [['scrap_auditor', 4]] }, { mod: 'echo_twin' },
    ],
    '04': [
        { weapon: 'breaker_stake', rigs: [['surveyor', 1]] },
        { weapon: 'patrol_welder', rigs: [['surveyor', 2]] },
        { mod: 'stake_link', rigs: [['surveyor', 3]] },
        { mod: 'welder_trail', rigs: [['surveyor', 4]] }, { mod: 'stake_loop' },
    ],
};

export const RIG_RANK_EFFECTS: Record<RigId, readonly [string, string, string, string]> = {
    duty_standard: ['不同系武器交替命中会补击', '补击推开目标', '第三种系能再补一次', '接续补击传给附近另一台敌机'],
    heavy_fitter: ['护甲强化近战', '近战命中积攒正面护板', '格挡后近战重击击退', '格挡后重击穿过面前敌群'],
    high_voltage: ['电弧向邻近目标续跳', '续跳留下导电标记', '导电标记扩大下一跳距离', '连锁终点与标记接成回路'],
    thermal_welder: ['持续灼烧伤害提高', '灼烧留下热区', '烧毁敌机会点燃附近敌机', '相邻热区连成火带'],
    scrap_auditor: ['商店打折，漏捡铜件可结转', '连续回收吸来远处散件', '回收达标可多留一格货', '达标可定向调货一次'],
    surveyor: ['移动留下带电标线', '穿线首个目标减速', '转弯可续接第三枚标钉', '闭合三角放电'],
};
export const RANK_LABEL = ['未解锁', 'I', 'II', 'III', 'IV'] as const;
type Progress = Partial<Pick<WorkshopProfile, 'maxDangerCleared' | 'clearedChapters'>>;

function highestClear(profile: Progress, chapter: ChapterId): number {
    return profile.maxDangerCleared?.[chapter] ?? (profile.clearedChapters?.includes(chapter) ? 0 : -1);
}

export function rigRank(profile: Progress, rig: RigId): 0 | Tier {
    let rank: 0 | Tier = STARTER_RIGS.includes(rig) ? 1 : 0;
    for (const chapter of CHAPTER_ORDER) {
        const cleared = highestClear(profile, chapter);
        for (const danger of DANGER_LEVELS) {
            if (danger > cleared) break;
            for (const [id, next] of MILESTONES[chapter][danger].rigs ?? []) {
                if (rig === id && next > rank) rank = next;
            }
        }
    }
    return rank;
}

export function milestoneSource(match: (reward: Milestone) => boolean) {
    for (const chapter of CHAPTER_ORDER) {
        for (const danger of DANGER_LEVELS) {
            if (match(MILESTONES[chapter][danger])) {
                const title = CHAPTER_CATALOG.find(c => c.id === chapter)!.title;
                return { chapter, danger, hint: '通关「' + title + '」' + (danger ? '难度 ' + danger : '') };
            }
        }
    }
    return null;
}

export function unlockedMods(profile: Progress, tool: ToolId): WeaponMod[] {
    const mods: WeaponMod[] = [];
    for (const chapter of CHAPTER_ORDER) {
        for (const danger of DANGER_LEVELS) {
            if (danger > highestClear(profile, chapter)) break;
            const mod = MILESTONES[chapter][danger].mod;
            if (mod && WEAPON_MODS[mod][0] === tool) mods.push(mod);
        }
    }
    return mods;
}

export function milestoneLabels(m: Milestone): string[] {
    const labels: string[] = [];
    if (m.weapon) labels.push('解锁武器：' + WEAPON_CATALOG[m.weapon].name);
    if (m.mod) labels.push('解锁改装：' + WEAPON_MODS[m.mod][1]);
    for (const [rig, rank] of m.rigs ?? []) {
        labels.push(rank === 1 ? '解锁工装：' + RIG_CATALOG[rig].name : RIG_CATALOG[rig].name + '升至 ' + RANK_LABEL[rank]);
    }
    return labels;
}

// Global danger capstones.
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
    none: { id: 'none', name: '不带补给', cost: 0, detail: '直接出发，不消耗维修凭证。' },
    extra_crate: { id: 'extra_crate', name: '备用撬棍', cost: 12, detail: '前两次进商店时，各多 1 次免费刷新。' },
    spare_parts: { id: 'spare_parts', name: '备用铜件', cost: 15, detail: '开局带 35 铜件。' },
    hot_thermos: { id: 'hot_thermos', name: '热茶', cost: 18, detail: '本局生命上限 +10，波末回复比例另加 10 个百分点。' },
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
    return `通关第 ${'一二三四'[idx - 1]} 章「${prev.title}」后解锁`;
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
    const previous = (danger - 1) as DangerLevel;
    return `通关任意一章的难度 ${previous}（${DANGER_NAMES[previous]}）后解锁`;
}

export function unlockedRigsForProfile(profile?: Pick<WorkshopProfile, 'clearedChapters' | 'unlockedRigs'>): RigId[] {
    const set = new Set<RigId>(STARTER_RIGS);
    if (profile?.unlockedRigs) {
        for (const r of profile.unlockedRigs) set.add(r);
    }
    if (profile?.clearedChapters) {
        for (const ch of profile.clearedChapters) {
            for (const [rig, tier] of MILESTONES[ch][0].rigs ?? []) if (tier === 1) set.add(rig);
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
        if (MILESTONES[id][0].rigs?.some(([rig, tier]) => rig === rigId && tier === 1)) {
            return `通关第 ${'一二三四'[i]} 章「${CHAPTER_CATALOG[i].title}」后解锁`;
        }
    }
    return '';
}

export function unlockedWeaponsForProfile(profile?: Progress): ToolId[] {
    if (!profile) return [...ALL_TOOL_IDS];
    const set = new Set<ToolId>(STARTER_WEAPONS);
    for (const ch of CHAPTER_ORDER) {
        for (const danger of DANGER_LEVELS) {
            if (danger > highestClear(profile, ch)) break;
            const w = MILESTONES[ch][danger].weapon;
            if (w) set.add(w);
        }
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

    for (const d of DANGER_LEVELS) {
        if (d > highestClear(prev, chapterId) && d <= highestClear(next, chapterId)) {
            list.push(...milestoneLabels(MILESTONES[chapterId][d]));
        }
    }
    // Chapter route and loadout access
    if (!prev.clearedChapters.includes(chapterId) && next.clearedChapters.includes(chapterId)) {
        const grant = CHAPTER_UNLOCKS[chapterId];
        if (grant.nextChapter) {
            const nextCh = CHAPTER_CATALOG.find(c => c.id === grant.nextChapter);
            if (nextCh) list.push(`解锁第 ${'一二三四'[nextCh.index]} 章 · ${nextCh.title}`);
        }

        if (grant.customStarter) {
            list.push('出发前可以选择初始武器');
        }
    }

    // 2. Global danger ladder unlock
    const prevMaxD = maxUnlockedDanger(prev);
    const nextMaxD = maxUnlockedDanger(next);
    if (nextMaxD > prevMaxD) {
        list.push(`解锁难度 ${nextMaxD} · ${DANGER_NAMES[nextMaxD]}`);
    }

    // 3. Global Danger capstone module + meta perks (checks every newly crossed danger threshold!)
    const prevGlobal = maxGlobalDangerCleared(prev);
    const nextGlobal = maxGlobalDangerCleared(next);
    for (const d of [1, 2, 3, 4] as const) {
        if (prevGlobal < d && nextGlobal >= d) {
            const modId = DANGER_CAPSTONE_MODULES[d];
            const mod = MODULE_BY_ID[modId];
            if (mod) list.push(`解锁配件：${mod.name}`);
            if (d === 2) list.push('工坊可排除的配件数量 +2');
            if (d === 3) list.push('商店留货上限 +1');
        }
    }

    // 4. Chapter-specific secret archive (unlocked at Danger >= 2 per chapter)
    if (!isSecretArchiveUnlocked(prev, chapterId) && isSecretArchiveUnlocked(next, chapterId)) {
        list.push('解锁本章加密附件');
    }

    // 5. Chapter Gold Seal (Danger 4 clear on this chapter)
    const prevChD = prev.maxDangerCleared[chapterId] ?? -1;
    if (prevChD < 4 && danger === 4 && next.maxDangerCleared[chapterId] === 4) {
        const seals = goldSealCount(next);
        list.push(seals === 4 ? '集齐四章金章' : `获得本章金章（${seals}/4）`);
    }

    return list;
}
