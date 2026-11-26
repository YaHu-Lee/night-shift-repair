import { CHAPTER_CATALOG, RIG_CATALOG } from './catalog';
import { CHAPTER_ORDER, unlockedRigsForProfile } from './progression';
import type {
    ChapterId,
    DailyEngagementState,
    DailyShiftModifierId,
    DangerLevel,
    RigId,
    WaveDefinition,
    WorkshopProfile,
    WorkshopTalentSpec,
} from './types';

export const DAILY_CHECKIN_CREDITS = 20;
export const DAILY_SHIFT_BONUS_CREDITS = 35;
export const SHOP_EMERGENCY_PARTS = 20;
export const MAX_RUN_REVIVES = 1;
export const MAX_RUN_LEVELUP_ADS = 1;
export const MAX_RUN_SHOP_ADS = 2;
export const MAX_DAILY_PREP_ADS = 2;
export const MAX_DAILY_DOUBLE_ADS = 3;

export interface DailyShiftModifierSpec {
    readonly id: DailyShiftModifierId;
    readonly name: string;
    readonly ruleText: string;
}

export const DAILY_SHIFT_MODIFIERS: Readonly<Record<DailyShiftModifierId, DailyShiftModifierSpec>> = {
    bargain_horde: {
        id: 'bargain_horde',
        name: '夜市大甩卖',
        ruleText: '商店全场 75 折，但敌机多 30%',
    },
    arc_overdrive: {
        id: 'arc_overdrive',
        name: '高压抢通',
        ruleText: '全队攻速 +20%，第 4 波起出干扰机',
    },
    cold_supply: {
        id: 'cold_supply',
        name: '寒夜急补',
        ruleText: '开局送 40 零件，波间回血减至 18%',
    },
    turbo_shift: {
        id: 'turbo_shift',
        name: '极速巡线',
        ruleText: '移速 +18% 且伤害 +12%，首领出招提速',
    },
};

export interface DailyShiftSpec {
    readonly dateKey: string;
    readonly chapterId: ChapterId;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly modifier: DailyShiftModifierSpec;
    readonly seed: number;
    readonly bonusCredits: number;
}

const MODIFIER_ORDER: readonly DailyShiftModifierId[] = [
    'bargain_horde',
    'arc_overdrive',
    'cold_supply',
    'turbo_shift',
];

const RIG_LIST: readonly RigId[] = [
    'duty_standard',
    'heavy_fitter',
    'high_voltage',
    'thermal_welder',
    'scrap_auditor',
];

export function todayDateKey(now: Date = new Date()): string {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function hashDateKey(dateKey: string): number {
    let h = 2166136261;
    for (let i = 0; i < dateKey.length; i++) {
        h ^= dateKey.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export function getDailyShift(dateKey: string = todayDateKey()): DailyShiftSpec {
    const h = hashDateKey(dateKey);
    const chapterId = CHAPTER_ORDER[h % CHAPTER_ORDER.length];
    const rigId = RIG_LIST[(h >>> 4) % RIG_LIST.length];
    const modId = MODIFIER_ORDER[(h >>> 8) % MODIFIER_ORDER.length];
    return {
        dateKey,
        chapterId,
        rigId,
        danger: 1,
        modifier: DAILY_SHIFT_MODIFIERS[modId],
        seed: (h ^ 0x5f3759df) >>> 0,
        bonusCredits: DAILY_SHIFT_BONUS_CREDITS,
    };
}

export function dailyForDate(profile: WorkshopProfile, dateKey: string = todayDateKey()): DailyEngagementState {
    if (profile.daily?.dateKey === dateKey) return profile.daily;
    return { dateKey };
}

export function canClaimDailyCheckIn(profile: WorkshopProfile, dateKey: string = todayDateKey()): boolean {
    return !dailyForDate(profile, dateKey).checkInClaimed;
}

export function claimDailyCheckIn(profile: WorkshopProfile, dateKey: string = todayDateKey()): WorkshopProfile | null {
    const d = dailyForDate(profile, dateKey);
    if (d.checkInClaimed) return null;
    return {
        ...profile,
        credits: profile.credits + DAILY_CHECKIN_CREDITS,
        daily: {
            ...d,
            checkInClaimed: true,
            freeSupplyCharges: (d.freeSupplyCharges ?? 0) + 1,
        },
    };
}

export function freeSupplyChargesToday(profile: WorkshopProfile, dateKey: string = todayDateKey()): number {
    return dailyForDate(profile, dateKey).freeSupplyCharges ?? 0;
}

export function consumeFreeSupplyCharge(profile: WorkshopProfile, dateKey: string = todayDateKey()): WorkshopProfile | null {
    const d = dailyForDate(profile, dateKey);
    const charges = d.freeSupplyCharges ?? 0;
    if (charges <= 0) return null;
    return {
        ...profile,
        daily: { ...d, freeSupplyCharges: charges - 1 },
    };
}

export function isDailyShiftClearedToday(profile: WorkshopProfile, dateKey: string = todayDateKey()): boolean {
    return dailyForDate(profile, dateKey).dailyShiftCleared === true;
}

export function remainingDailyAdUses(
    profile: WorkshopProfile,
    kind: 'prep' | 'double',
    dateKey: string = todayDateKey(),
): number {
    const d = dailyForDate(profile, dateKey);
    if (kind === 'prep') return Math.max(0, MAX_DAILY_PREP_ADS - (d.adPrepUsed ?? 0));
    return Math.max(0, MAX_DAILY_DOUBLE_ADS - (d.adDoubleUsed ?? 0));
}

export function consumeDailyAdUse(
    profile: WorkshopProfile,
    kind: 'prep' | 'double',
    dateKey: string = todayDateKey(),
): WorkshopProfile | null {
    if (remainingDailyAdUses(profile, kind, dateKey) <= 0) return null;
    const d = dailyForDate(profile, dateKey);
    return {
        ...profile,
        daily: kind === 'prep'
            ? { ...d, adPrepUsed: (d.adPrepUsed ?? 0) + 1 }
            : { ...d, adDoubleUsed: (d.adDoubleUsed ?? 0) + 1 },
    };
}

export function isFirstTimePlayer(profile: WorkshopProfile): boolean {
    if (profile.onboardingDone) return false;
    if (profile.clearedChapters.length > 0) return false;
    if (profile.credits > 0) return false;
    return Object.values(profile.talents).every(v => !v);
}

export function needsShopOnboarding(profile: WorkshopProfile): boolean {
    return !profile.onboardingDone;
}

export function markOnboardingDone(profile: WorkshopProfile): WorkshopProfile {
    return profile.onboardingDone ? profile : { ...profile, onboardingDone: true };
}

export function hasEndlessUnlocked(profile: Pick<WorkshopProfile, 'clearedChapters'>): boolean {
    return profile.clearedChapters.includes('04');
}

/**
 * Generates Wave 13, 14, 15... for Harbor Endless Shift (reusing Chapter 4 stations & full enemy roster).
 * Every 5th wave (15, 20, 25...) spawns a chapter Boss; other waves scale active density smoothly.
 */
export function buildEndlessWaveDef(waveNum: number): WaveDefinition {
    const ch4 = CHAPTER_CATALOG[3];
    if (waveNum <= ch4.waves.length) return ch4.waves[waveNum - 1];
    const extra = waveNum - 12;
    const isBoss = waveNum % 5 === 0;
    const isElite = !isBoss && waveNum % 5 === 3;
    const template = ch4.waves[(waveNum - 1) % 10 + 1]; // waves 2..11 variety
    return {
        wave: waveNum,
        stationIndex: (waveNum - 1) % ch4.stations.length,
        durationSeconds: isBoss ? 60 : 50,
        targetActive: isBoss ? Math.min(10, 6 + Math.floor(extra / 3)) : Math.min(34, 22 + extra),
        maxActive: isBoss ? Math.min(14, 9 + Math.floor(extra / 2)) : Math.min(42, 30 + extra),
        spawnIntervalTicks: isBoss ? 64 : Math.max(11, 17 - Math.floor(extra / 2)),
        roster: template.roster,
        eliteWave: isElite,
        bossWave: isBoss,
        hint: isBoss
            ? `港区无尽第 ${waveNum} 波 · 首领来袭，抓敞开窗口爆发！`
            : `港区无尽第 ${waveNum} 波 · 火力拉满，撑过就是新纪录。`,
    };
}

/**
 * Monotonic lossless merge for syncing permanent WorkshopProfile across devices / cloud backup.
 * Never loses cleared chapters, higher danger stamps, unlocked rigs, higher talent ranks, or endless records.
 */
export function mergeWorkshopProfiles(local: WorkshopProfile, remote: WorkshopProfile): WorkshopProfile {
    const clearedSet = new Set<ChapterId>([...local.clearedChapters, ...remote.clearedChapters]);
    const clearedChapters = CHAPTER_ORDER.filter(id => clearedSet.has(id));

    const maxDangerCleared: Partial<Record<ChapterId, DangerLevel>> = {};
    for (const id of CHAPTER_ORDER) {
        const a = local.maxDangerCleared[id];
        const b = remote.maxDangerCleared[id];
        if (a !== undefined || b !== undefined) {
            maxDangerCleared[id] = Math.max(a ?? -1, b ?? -1) as DangerLevel;
        }
    }

    const maxDangerByRig: Partial<Record<RigId, DangerLevel>> = {};
    for (const rig of Object.keys(RIG_CATALOG) as RigId[]) {
        const a = local.maxDangerByRig?.[rig];
        const b = remote.maxDangerByRig?.[rig];
        if (a !== undefined || b !== undefined) {
            maxDangerByRig[rig] = Math.max(a ?? -1, b ?? -1) as DangerLevel;
        }
    }

    const talents: Partial<Record<WorkshopTalentSpec['id'], number>> = { ...local.talents };
    for (const [k, v] of Object.entries(remote.talents) as [WorkshopTalentSpec['id'], number][]) {
        talents[k] = Math.max(talents[k] ?? 0, v);
    }

    const unlockedRigs = unlockedRigsForProfile({
        clearedChapters,
        unlockedRigs: [...local.unlockedRigs, ...remote.unlockedRigs],
    });
    const bestEndless = Math.max(local.bestEndlessWave ?? 0, remote.bestEndlessWave ?? 0);

    return {
        ...local,
        credits: Math.max(local.credits, remote.credits),
        clearedChapters,
        maxDangerCleared,
        ...(Object.keys(maxDangerByRig).length ? { maxDangerByRig } : {}),
        unlockedRigs,
        talents,
        ...(local.onboardingDone || remote.onboardingDone ? { onboardingDone: true } : {}),
        ...(local.adFreePass || remote.adFreePass ? { adFreePass: true } : {}),
        ...(bestEndless > 0 ? { bestEndlessWave: bestEndless } : {}),
    };
}
