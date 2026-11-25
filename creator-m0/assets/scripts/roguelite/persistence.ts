import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';
import { CHAPTER_CATALOG, MODULE_BY_ID, RIG_CATALOG, WORKSHOP_TALENTS } from './catalog';
import { createDefaultProfile, PatrolSession } from './session';
import type {
    BattleWaveSummary,
    ChapterDefinition,
    DangerLevel,
    RigId,
    ShopSlot,
    StatDelta,
    WeaponInstance,
    WorkshopProfile,
    WorkshopTalentSpec,
} from './types';

export const PATROL_PROFILE_NAMESPACE = 'night-shift.patrol.profile';
export const PATROL_RUN_NAMESPACE = 'night-shift.patrol.run';
const STORAGE_VERSION = 3;

export interface PatrolSnapshot {
    readonly version: 3;
    readonly chapterId: ChapterDefinition['id'];
    readonly rigId: RigId;
    readonly danger: DangerLevel;
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
    if (!Array.isArray(p.bannedModules) || !p.bannedModules.every(id => typeof id === 'string' && !!MODULE_BY_ID[id])) return false;
    if (!p.talents || typeof p.talents !== 'object') return false;
    for (const [k, v] of Object.entries(p.talents)) {
        const spec = WORKSHOP_TALENTS.find(t => t.id === (k as WorkshopTalentSpec['id']));
        if (!VALID_TALENTS.has(k) || !spec || typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0 || v > spec.maxRank) {
            return false;
        }
    }
    return true;
}

export function validPatrolSnapshot(value: unknown): value is PatrolSnapshot {
    if (!value || typeof value !== 'object') return false;
    const s = value as PatrolSnapshot;
    if (s.version !== 3 || !VALID_CHAPTERS.has(s.chapterId) || !VALID_RIGS.has(s.rigId)) return false;
    if (![0, 1, 2, 3, 4].includes(s.danger)) return false;
    if (!['battle', 'shop', 'won', 'lost'].includes(s.phase)) return false;
    if (!Number.isSafeInteger(s.waveIndex) || s.waveIndex < 0 || s.waveIndex >= 12) return false;
    if (!Number.isSafeInteger(s.parts) || s.parts < 0) return false;
    if (!Array.isArray(s.weapons) || s.weapons.length < 1 || s.weapons.length > 6) return false;
    if (!Array.isArray(s.modules) || !Array.isArray(s.reports)) return false;
    return true;
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
    };
}

export class PatrolStorage {
    readonly profilePlatform: Platform;
    readonly runPlatform: Platform;

    constructor(profilePlatform?: Platform, runPlatform?: Platform) {
        this.profilePlatform = profilePlatform ?? makePlatform(undefined, PATROL_PROFILE_NAMESPACE);
        this.runPlatform = runPlatform ?? makePlatform(undefined, PATROL_RUN_NAMESPACE);
    }

    loadProfile(legacyFallback?: { clearedStages?: readonly string[]; credits?: number } | null): WorkshopProfile {
        const saved = this.profilePlatform.readCheckpoint<WorkshopProfile>(STORAGE_VERSION, validWorkshopProfile);
        if (saved) return saved;
        const migrated = migrateLegacyCampaignProfile(legacyFallback);
        if (migrated.credits > 0 || migrated.clearedChapters.length > 0) {
            this.saveProfile(migrated);
        }
        return migrated;
    }

    saveProfile(profile: WorkshopProfile): boolean {
        return this.profilePlatform.writeCheckpoint(STORAGE_VERSION, profile, validWorkshopProfile);
    }

    loadActiveRun(profile: WorkshopProfile): PatrolSession | null {
        const snap = this.runPlatform.readCheckpoint<PatrolSnapshot>(STORAGE_VERSION, validPatrolSnapshot);
        if (!snap || snap.phase === 'won' || snap.phase === 'lost') return null;
        return PatrolSession.fromSnapshot(snap, profile);
    }

    saveActiveRun(session: PatrolSession): boolean {
        const snap = session.snapshot();
        return this.runPlatform.writeCheckpoint(STORAGE_VERSION, snap, validPatrolSnapshot);
    }

    clearActiveRun(): void {
        this.runPlatform.clearCheckpoint();
    }
}
