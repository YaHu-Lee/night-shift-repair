import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';

export const CAMPAIGN_NAMESPACE = 'night-shift.campaign';
const PROFILE_VERSION = 1;
const MAX_ID_LENGTH = 80;

export interface StageContract {
    readonly id: string;
    readonly chapter: string;
    readonly title: string;
    readonly prerequisite: string | null;
    readonly contentVersion: number;
    /** Zero-based final wave as written by a durable Run checkpoint. */
    readonly finalWave: number;
    readonly firstClearWeapon: string | null;
    readonly plannedMinutes: number;
}

export const CAMPAIGN_STAGES: readonly StageContract[] = [
    { id: '01', chapter: '01', title: '配电站', prerequisite: null, contentVersion: 21,
        finalWave: 5, firstClearWeapon: 'arc_gun', plannedMinutes: 6 },
    { id: '02', chapter: '01', title: '地下泵房', prerequisite: '01', contentVersion: 22,
        finalWave: 5, firstClearWeapon: 'hydraulic_nailer', plannedMinutes: 6 },
];

export interface CampaignAttempt {
    readonly stageId: string;
    readonly runId: string;
}

export interface CampaignProfile {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly clearedStages: readonly string[];
    readonly unlockedWeapons: readonly string[];
    readonly activeAttempt: CampaignAttempt | null;
}

export interface WonCheckpoint {
    readonly contentVersion: number;
    readonly phase: string;
    readonly finishReason?: string;
    readonly wave: number;
    readonly runId: string;
}

export type ClearStatus = 'committed' | 'already-cleared' | 'not-eligible' | 'storage-failed';

function safeId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH
        && /^[a-zA-Z0-9_-]+$/.test(value);
}

function safeNumber(value: number, minimum: number): boolean {
    return Number.isSafeInteger(value) && value >= minimum;
}

function distinctIds(value: unknown): value is string[] {
    return Array.isArray(value) && value.every(safeId) && new Set(value).size === value.length;
}

function isProfile(value: unknown): value is CampaignProfile {
    if (!value || typeof value !== 'object') return false;
    const profile = value as CampaignProfile;
    return profile.schemaVersion === PROFILE_VERSION && safeNumber(profile.revision, 0)
        && distinctIds(profile.clearedStages) && distinctIds(profile.unlockedWeapons)
        && (profile.activeAttempt === null || (
            !!profile.activeAttempt && safeId(profile.activeAttempt.stageId) && safeId(profile.activeAttempt.runId)
        ));
}

function freezeProfile(profile: CampaignProfile): CampaignProfile {
    return Object.freeze({
        ...profile,
        clearedStages: Object.freeze([...profile.clearedStages]),
        unlockedWeapons: Object.freeze([...profile.unlockedWeapons]),
        activeAttempt: profile.activeAttempt ? Object.freeze({ ...profile.activeAttempt }) : null,
    });
}

export class Campaign {
    private readonly byId = new Map<string, StageContract>();
    private data: CampaignProfile;
    readonly profileState: 'new' | 'loaded' | 'unreadable';
    storageFailed = false;

    constructor(private readonly platform: Platform = makePlatform(undefined, CAMPAIGN_NAMESPACE),
        stages: readonly StageContract[] = CAMPAIGN_STAGES) {
        const versions = new Set<number>();
        // Validate in authored order so accidental missing or cyclic prerequisites cannot ship.
        for (const stage of stages) {
            if (!safeId(stage.id) || !safeId(stage.chapter) || !stage.title || this.byId.has(stage.id)
                || !safeNumber(stage.contentVersion, 1) || versions.has(stage.contentVersion)
                || !safeNumber(stage.finalWave, 0) || !safeNumber(stage.plannedMinutes, 1)
                || (stage.firstClearWeapon !== null && !safeId(stage.firstClearWeapon))
                || (stage.prerequisite !== null && !this.byId.has(stage.prerequisite))) {
                throw new Error('Invalid campaign stage: ' + stage.id);
            }
            this.byId.set(stage.id, Object.freeze({ ...stage }));
            versions.add(stage.contentVersion);
        }
        let encounteredInvalid = false;
        const saved = platform.readCheckpoint<CampaignProfile>(PROFILE_VERSION, (value) => {
            if (isProfile(value)) return true;
            encounteredInvalid = true;
            return false;
        });
        const presence = saved ? undefined : platform.checkpointPresence?.();
        this.profileState = saved ? 'loaded'
            : (encounteredInvalid || (presence !== undefined && presence !== 'empty')) ? 'unreadable' : 'new';
        this.storageFailed = this.profileState === 'unreadable';
        this.data = freezeProfile(saved
            ?? { schemaVersion: PROFILE_VERSION, revision: 0, clearedStages: [], unlockedWeapons: [], activeAttempt: null });
    }

    get profile(): CampaignProfile { return this.data; }

    isUnlocked(stageId: string): boolean {
        const stage = this.byId.get(stageId);
        return this.profileState !== 'unreadable' && !!stage && (stage.prerequisite === null || this.data.clearedStages.includes(stage.prerequisite));
    }

    canUseStarter(stageId: string, toolId: string): boolean {
        return this.isUnlocked(stageId) && (toolId === 'wrench'
            || (toolId === 'arc_gun' && stageId !== '01' && this.data.unlockedWeapons.includes(toolId)));
    }

    beginAttempt(stageId: string, runId: string): boolean {
        if (!this.isUnlocked(stageId) || !safeId(runId)) return false;
        const current = this.data.activeAttempt;
        if (current?.stageId === stageId && current.runId === runId) return true;
        return this.save({ ...this.data, activeAttempt: { stageId, runId } });
    }

    /** The host supplies Run.data only after its terminal checkpoint is durable. */
    replayWon(stageId: string, checkpoint: WonCheckpoint | null | undefined): ClearStatus {
        const stage = this.byId.get(stageId);
        if (this.profileState === 'unreadable') return 'storage-failed';
        if (!stage || !checkpoint || !this.isUnlocked(stageId)
            || checkpoint.phase !== 'won' || checkpoint.finishReason !== 'cleared'
            || checkpoint.contentVersion !== stage.contentVersion || checkpoint.wave !== stage.finalWave
            || !safeId(checkpoint.runId)) return 'not-eligible';
        if (this.data.clearedStages.includes(stageId)) return 'already-cleared';
        const active = this.data.activeAttempt;
        if (!active || active.stageId !== stageId || active.runId !== checkpoint.runId) return 'not-eligible';

        const weapon = stage.firstClearWeapon;
        const unlockedWeapons = !weapon || this.data.unlockedWeapons.includes(weapon)
            ? this.data.unlockedWeapons : [...this.data.unlockedWeapons, weapon];
        // Next-stage access derives from the same clear record; never save it separately.
        return this.save({ ...this.data, clearedStages: [...this.data.clearedStages, stageId],
            unlockedWeapons }) ? 'committed' : 'storage-failed';
    }

    private save(profile: CampaignProfile): boolean {
        const next = freezeProfile({ ...profile, revision: this.data.revision + 1 });
        if (!isProfile(next) || !this.platform.writeCheckpoint(PROFILE_VERSION, next)) {
            this.storageFailed = true;
            return false;
        }
        this.storageFailed = false;
        this.data = next;
        return true;
    }
}
