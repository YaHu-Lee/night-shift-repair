import { makePlatform } from '../platform/platform';
import { CHAPTER_CATALOG, MODULE_BY_ID, RIG_CATALOG, WEAPON_CATALOG, WORKSHOP_TALENTS } from './catalog';
import type { ShopCheckpoint } from './shop';
import { STAT_KEYS } from './formulas';
import { DAILY_SHIFT_MODIFIERS } from './engagement';
import { PRE_RUN_SUPPLIES, unlockedRigsForProfile } from './progression';
import { createDefaultProfile, createPatrolId, PatrolSession } from './session';
import type {
    BattleWaveSummary,
    ChapterDefinition,
    DailyShiftModifierId,
    DangerLevel,
    PreRunSupplyId,
    RigId,
    ShopSlot,
    StatDelta,
    ToolId,
    WeaponInstance,
    WorkshopProfile,
    WorkshopTalentSpec,
} from './types';

export const PATROL_PROFILE_NAMESPACE = 'night-shift.patrol.profile';
export const PATROL_RUN_NAMESPACE = 'night-shift.patrol.run';
export const PATROL_SAVE_NAMESPACE = 'night-shift.patrol.save';
const STORAGE_VERSION = 4;

// Profile and run share one A/B journal generation, including the settlement receipt.
export interface PatrolLocalSave {
    readonly schemaVersion: 4;
    readonly saveId: string;
    readonly revision: number;
    readonly profile: WorkshopProfile;
    readonly run: PatrolSnapshot | null;
    readonly lastSettledRunId: string | null;
}

export interface PatrolSnapshot {
    readonly version: 3 | 4;
    readonly runId?: string;
    readonly shop?: ShopCheckpoint;
    readonly chapterId: ChapterDefinition['id'];
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly supply?: PreRunSupplyId;
    readonly starterWeapon?: ToolId;
    readonly dailyShiftKey?: string;
    readonly dailyMod?: DailyShiftModifierId;
    readonly endlessMode?: boolean;
    readonly trialRig?: boolean;
    readonly revivesUsed?: number;
    readonly levelUpAdUsed?: boolean;
    readonly shopAdUsed?: number;
    readonly seed: number;
    readonly phase: 'battle' | 'shop' | 'won' | 'lost';
    readonly waveIndex: number;
    readonly parts: number;
    readonly bagParts: number;
    readonly xp: number;
    readonly level: number;
    readonly pendingLevelUps: number;
    readonly currentHp: number;
    readonly levelStats: StatDelta;
    readonly weapons: readonly WeaponInstance[];
    readonly modules: readonly string[];
    readonly carriedLocks: readonly ShopSlot[];
    readonly nextWeaponUid: number;
    readonly reports: readonly BattleWaveSummary[];
}

const VALID_CHAPTERS = new Set<string>(CHAPTER_CATALOG.map(c => c.id));
const VALID_RIGS = new Set<string>(Object.keys(RIG_CATALOG));
const VALID_TALENTS = new Set<string>(WORKSHOP_TALENTS.map(t => t.id));

export function validWorkshopProfile(value: unknown): value is WorkshopProfile {
    if (!value || typeof value !== 'object') return false;
    const p = value as WorkshopProfile;
    if (p.schemaVersion !== 3) return false;
    if (typeof p.credits !== 'number' || !Number.isSafeInteger(p.credits) || p.credits < 0) return false;
    if (!Array.isArray(p.clearedChapters) || !p.clearedChapters.every(id => VALID_CHAPTERS.has(id))) return false;
    if (!Array.isArray(p.unlockedRigs) || !p.unlockedRigs.every(id => VALID_RIGS.has(id))) return false;
    if (!Array.isArray(p.bannedModules) || !p.bannedModules.every(id => typeof id === 'string' && owns(MODULE_BY_ID, id))) return false;
    if (!p.maxDangerCleared || typeof p.maxDangerCleared !== 'object' || Array.isArray(p.maxDangerCleared)
        || !Object.entries(p.maxDangerCleared).every(([id, danger]) => VALID_CHAPTERS.has(id) && [0, 1, 2, 3, 4].includes(danger))) return false;
    if (p.maxDangerByRig !== undefined && (!p.maxDangerByRig || typeof p.maxDangerByRig !== 'object' || Array.isArray(p.maxDangerByRig)
        || !Object.entries(p.maxDangerByRig).every(([id, danger]) => VALID_RIGS.has(id) && [0, 1, 2, 3, 4].includes(danger)))) return false;
    if (Array.isArray(p.talents)) return false;
    if (!p.talents || typeof p.talents !== 'object') return false;
    for (const [k, v] of Object.entries(p.talents)) {
        const spec = WORKSHOP_TALENTS.find(t => t.id === (k as WorkshopTalentSpec['id']));
        if (!VALID_TALENTS.has(k) || !spec || typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > spec.maxRank) {
            return false;
        }
    }
    if (p.onboardingDone !== undefined && typeof p.onboardingDone !== 'boolean') return false;
    if (p.adFreePass !== undefined && typeof p.adFreePass !== 'boolean') return false;
    if (p.bestEndlessWave !== undefined && !natural(p.bestEndlessWave)) return false;
    if (p.daily !== undefined) {
        const d = p.daily;
        if (!d || typeof d !== 'object' || Array.isArray(d) || typeof d.dateKey !== 'string' || d.dateKey.length < 8) return false;
        if (d.checkInClaimed !== undefined && typeof d.checkInClaimed !== 'boolean') return false;
        if (d.dailyShiftCleared !== undefined && typeof d.dailyShiftCleared !== 'boolean') return false;
        if (d.freeSupplyCharges !== undefined && !natural(d.freeSupplyCharges)) return false;
        if (d.adDoubleUsed !== undefined && !natural(d.adDoubleUsed)) return false;
        if (d.adPrepUsed !== undefined && !natural(d.adPrepUsed)) return false;
    }
    return true;
}

function owns(table: object, key: string): boolean {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key);
}

function natural(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
}

function validSlot(slot: ShopSlot): boolean {
    return !!slot && natural(slot.slotIndex) && slot.slotIndex < 4 && natural(slot.price)
        && [1, 2, 3, 4].includes(slot.tier) && typeof slot.locked === 'boolean' && typeof slot.sold === 'boolean'
        && (slot.kind === 'weapon' ? owns(WEAPON_CATALOG, slot.itemId)
            : slot.kind === 'module' && owns(MODULE_BY_ID, slot.itemId));
}

function validShop(shop: ShopCheckpoint, pending: number): boolean {
    return !!shop && Array.isArray(shop.slots) && shop.slots.length === 4
        && shop.slots.every((slot, i) => validSlot(slot) && slot.slotIndex === i)
        && Array.isArray(shop.levelUpOptions) && shop.levelUpOptions.length === (pending ? 4 : 0)
        && shop.levelUpOptions.every(o => o && STAT_KEYS.includes(o.stat) && natural(o.amount)
            && [1, 2, 3, 4].includes(o.tier) && [o.id, o.label, o.detail].every(v => typeof v === 'string'))
        && [shop.rollSerial, shop.levelUpRerolls, shop.freeRerollsLeft, shop.paidRerolls].every(natural)
        && typeof shop.buyoutBonusUsed === 'boolean';
}

export function validPatrolSnapshot(value: unknown): value is PatrolSnapshot {
    if (!value || typeof value !== 'object') return false;
    const s = value as PatrolSnapshot;
    if ((s.version !== 3 && s.version !== 4) || !VALID_CHAPTERS.has(s.chapterId) || !VALID_RIGS.has(s.rigId)) return false;
    if (![0, 1, 2, 3, 4].includes(s.danger)) return false;
    if (s.supply !== undefined && !owns(PRE_RUN_SUPPLIES, s.supply)) return false;
    if (s.starterWeapon !== undefined && !owns(WEAPON_CATALOG, s.starterWeapon)) return false;
    if (s.dailyShiftKey !== undefined && typeof s.dailyShiftKey !== 'string') return false;
    if (s.dailyMod !== undefined && !owns(DAILY_SHIFT_MODIFIERS, s.dailyMod)) return false;
    if (s.endlessMode !== undefined && typeof s.endlessMode !== 'boolean') return false;
    if (s.trialRig !== undefined && typeof s.trialRig !== 'boolean') return false;
    if (s.revivesUsed !== undefined && !natural(s.revivesUsed)) return false;
    if (s.levelUpAdUsed !== undefined && typeof s.levelUpAdUsed !== 'boolean') return false;
    if (s.shopAdUsed !== undefined && !natural(s.shopAdUsed)) return false;
    if (!['battle', 'shop', 'won', 'lost'].includes(s.phase)) return false;
    const maxWaves = s.endlessMode ? 200 : 12;
    if (!Number.isSafeInteger(s.waveIndex) || s.waveIndex < 0 || s.waveIndex >= maxWaves) return false;
    if (!Number.isSafeInteger(s.parts) || s.parts < 0) return false;
    if (!Array.isArray(s.weapons) || s.weapons.length < 1 || s.weapons.length > 6) return false;
    if (s.version === 4 && (typeof s.runId !== 'string' || !s.runId.length
        || (s.phase === 'shop' ? !s.shop || !validShop(s.shop, s.pendingLevelUps) : s.shop !== undefined))) return false;
    if (![s.seed, s.bagParts, s.xp, s.level, s.pendingLevelUps, s.currentHp, s.nextWeaponUid].every(natural)) return false;
    if (!s.levelStats || typeof s.levelStats !== 'object' || Array.isArray(s.levelStats)
        || !Object.entries(s.levelStats).every(([key, v]) => STAT_KEYS.some(k => k === key) && Number.isFinite(v))) return false;
    if (!s.weapons.every(w => w && owns(WEAPON_CATALOG, w.id) && [1, 2, 3, 4].includes(w.tier)
        && natural(w.uid) && w.uid > 0 && (s.version === 3 || w.uid < s.nextWeaponUid))
        || new Set(s.weapons.map(w => w.uid)).size !== s.weapons.length) return false;
    if (!Array.isArray(s.modules) || !s.modules.every(id => owns(MODULE_BY_ID, id))
        || !Array.isArray(s.carriedLocks) || !s.carriedLocks.every(validSlot)) return false;
    return Array.isArray(s.reports) && s.reports.length <= maxWaves && s.reports.every(r => r
        && typeof r.cleared === 'boolean' && natural(r.kills) && Number.isFinite(r.elapsedSeconds)
        && Array.isArray(r.damageByWeapon) && r.damageByWeapon.every((w: BattleWaveSummary['damageByWeapon'][number]) => w && owns(WEAPON_CATALOG, w.id)
            && [1, 2, 3, 4].includes(w.tier) && [w.slot, w.totalDamage, w.crits, w.kills].every(natural)));
}

/**
 * Migrate credits & cleared chapters from legacy Campaign v2 profile if a player upgrades cleanly.
 */
export function migrateLegacyCampaignProfile(legacy?: { clearedStages?: readonly string[]; credits?: number } | null): WorkshopProfile {
    const base = createDefaultProfile();
    if (!legacy) return base;
    const cleared = new Set(legacy.clearedStages ?? []);
    const chapters: ChapterDefinition['id'][] = [];
    if (cleared.has('05')) chapters.push('01');
    if (cleared.has('10')) chapters.push('02');
    if (cleared.has('15')) chapters.push('03');
    if (cleared.has('20')) chapters.push('04');
    const credits = Math.max(0, Math.floor(legacy.credits ?? 0));
    return {
        ...base,
        credits,
        clearedChapters: chapters,
        maxDangerCleared: Object.fromEntries(chapters.map(id => [id, 0 as DangerLevel])),
        unlockedRigs: unlockedRigsForProfile({ clearedChapters: chapters, unlockedRigs: base.unlockedRigs }),
    };
}

export function validPatrolLocalSave(value: unknown): value is PatrolLocalSave {
    if (!value || typeof value !== 'object') return false;
    const save = value as PatrolLocalSave;
    return save.schemaVersion === STORAGE_VERSION && typeof save.saveId === 'string' && save.saveId.length > 0
        && natural(save.revision) && validWorkshopProfile(save.profile)
        && (save.lastSettledRunId === null || typeof save.lastSettledRunId === 'string')
        && (save.run === null || (validPatrolSnapshot(save.run) && save.run.version === 4));
}

export class PatrolStorage {
    private current?: PatrolLocalSave;
    private stored: PatrolLocalSave | null = null;
    needsReload = false;

    constructor(
        private readonly profilePlatform = makePlatform(undefined, PATROL_PROFILE_NAMESPACE),
        private readonly runPlatform = makePlatform(undefined, PATROL_RUN_NAMESPACE),
        private readonly local = makePlatform(undefined, PATROL_SAVE_NAMESPACE),
    ) {}

    loadProfile(legacyFallback?: { clearedStages?: readonly string[]; credits?: number } | null): WorkshopProfile {
        this.needsReload = false;
        this.current = undefined;
        this.stored = this.local.readCheckpoint(STORAGE_VERSION, validPatrolLocalSave);
        if (this.stored) {
            this.current = this.stored;
            return this.current.profile;
        }
        const profile = this.profilePlatform.readCheckpoint<WorkshopProfile>(3, validWorkshopProfile);
        const snap = this.runPlatform.readCheckpoint<PatrolSnapshot>(3, validPatrolSnapshot);
        const initial = profile ?? migrateLegacyCampaignProfile(legacyFallback);
        if (this.local.checkpointPresence?.() !== 'empty'
            || (!profile && this.profilePlatform.checkpointPresence?.(true) !== 'empty')
            || (!snap && this.runPlatform.checkpointPresence?.(true) !== 'empty')) {
            this.needsReload = true;
            return initial;
        }
        const run = snap ? PatrolSession.fromSnapshot(snap, initial).snapshot() : null;
        this.current = { schemaVersion: 4, saveId: createPatrolId(), revision: 0, profile: initial, run, lastSettledRunId: null };
        return initial;
    }

    private commit(next: PatrolLocalSave): boolean {
        if (!this.current || this.needsReload || this.local.checkpointPresence?.() === 'unreadable') return false;
        const disk = this.local.readCheckpoint<PatrolLocalSave>(STORAGE_VERSION, validPatrolLocalSave);
        // A write can reach disk even if its read-back failed. Accept that same generation on retry.
        if (disk && JSON.stringify(disk) === JSON.stringify(next)) {
            this.stored = this.current = disk;
            return true;
        }
        if (JSON.stringify(disk) !== JSON.stringify(this.stored)
            || (!disk && this.local.checkpointPresence?.() !== 'empty')) {
            this.needsReload = true;
            return false;
        }
        if (!this.local.writeCheckpoint(STORAGE_VERSION, next, validPatrolLocalSave)) return false;
        this.stored = this.current = next;
        return true;
    }

    saveProfile(profile: WorkshopProfile): boolean {
        return !!this.current && this.commit({ ...this.current, profile, revision: this.current.revision + 1 });
    }

    loadActiveRun(profile: WorkshopProfile): PatrolSession | null {
        return this.current?.run ? PatrolSession.fromSnapshot(this.current.run, profile) : null;
    }

    saveActiveRun(session: PatrolSession): boolean {
        if (!this.current || this.current.lastSettledRunId === session.runId) return false;
        return this.commit({ ...this.current, run: session.snapshot(), revision: this.current.revision + 1 });
    }

    /** Atomically commits profile (e.g. pre-run supply payment) together with the new run snapshot. */
    startRun(profile: WorkshopProfile, session: PatrolSession): boolean {
        if (!this.current || this.current.lastSettledRunId === session.runId) return false;
        return this.commit({ ...this.current, profile, run: session.snapshot(), revision: this.current.revision + 1 });
    }

    settleRun(session: PatrolSession): WorkshopProfile | null {
        if (!this.current || (session.phase !== 'lost' && session.phase !== 'won')) return null;
        if (this.current.lastSettledRunId === session.runId) return this.current.profile;
        const run = this.current.run;
        if (!run || run.runId !== session.runId) return null;
        // Persist the outcome before crediting it so a cold launch can finish an interrupted settlement.
        if (run.phase !== session.phase && !this.saveActiveRun(session)) return null;
        const profile = session.applySettlementToProfile(this.current.profile);
        return this.commit({ ...this.current, revision: this.current.revision + 1, profile,
            run: null, lastSettledRunId: session.runId }) ? profile : null;
    }
}
