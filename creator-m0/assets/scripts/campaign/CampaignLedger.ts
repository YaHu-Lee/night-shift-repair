import type { BlueprintId, ChallengeMode } from '../m1/Encounter';
import { freezeTraining, validTraining } from './CampaignTraining';
import type { TrainingProgress } from './CampaignTraining';

export const CHALLENGE_BONUS = 4;

export const BLUEPRINTS: Readonly<Record<BlueprintId, { title: string; detail: string }>> = {
    magnetic_pickup_arm: { title: '磁力拾取臂', detail: '拾取半径 +25%。波末基础回收率从 50% 降到 35%。' },
    narrow_beam_clamp: { title: '窄束导电夹', detail: '强化电弧每跳多 20 像素，基础跳数由 3 减为 2。' },
    quick_release_heatsink: { title: '快拆散热罩', detail: '过热前少打一发，停火从 1.6 秒缩短到 1.2 秒。' },
};

export const WORKSHOP_TIERS: readonly { title: string; stage: string | null; supplies: number }[] = [
    { title: '值班工位', stage: null, supplies: 0 },
    { title: '备件箱', stage: '02', supplies: 3 },
    { title: '整备工作台', stage: '05', supplies: 5 },
    { title: '夜班工具库', stage: '10', supplies: 7 },
    { title: '街区维修站', stage: '15', supplies: 9 },
    { title: '区域维修站', stage: '20', supplies: 11 },
];

export const COMMISSIONS = {
    first_wave: '清完第 1 波',
    arc_chain: '用强化电弧连击敌机',
    magnetic_pulse: '拾零件时放出一次震击',
    heat_recovery: '让过热的武器冷却后再打一次',
    inspector_clear: '击败配电站巡检机',
    two_builds: '用两种改装效果各打赢一次配电站',
} as const;

export type Build = 'arc' | 'magnet' | 'heat';
export type Badge = keyof typeof COMMISSIONS;

export interface CampaignAttempt {
    readonly stageId: string;
    readonly runId: string;
    readonly mode?: ChallengeMode;
    readonly blueprint?: BlueprintId | null;
    /** Missing for an attempt that began before the workshop ledger existed. */
    readonly earnsCredits?: true;
}

export interface Settlement {
    readonly stageId: string;
    readonly runId: string;
    readonly firstClear: boolean;
    readonly weapon: string | null;
    readonly clearedWaves: number;
    readonly credits: number;
    readonly aid: boolean;
    readonly challengeBonus?: typeof CHALLENGE_BONUS;
    readonly builds: readonly Build[];
    readonly chosenBuild: Build | null;
}

export interface CampaignProfile {
    readonly schemaVersion: 2;
    readonly revision: number;
    readonly clearedStages: readonly string[];
    readonly unlockedWeapons: readonly string[];
    readonly activeAttempt: CampaignAttempt | null;
    readonly pendingAttempt: CampaignAttempt | null;
    readonly credits: number;
    readonly blueprints: readonly BlueprintId[];
    readonly selectedBlueprint: BlueprintId | null;
    readonly firstWaveAidClaimed: boolean;
    readonly storySeen: readonly string[];
    readonly overtimeRank: 0 | 1 | 2;
    readonly badges: readonly Badge[];
    readonly inspectorBuilds: readonly Build[];
    readonly receipts: readonly Settlement[];
    readonly training?: TrainingProgress;
    readonly challengeClears?: readonly string[];
}

interface LegacyProfile {
    readonly schemaVersion: 1;
    readonly revision: number;
    readonly clearedStages: readonly string[];
    readonly unlockedWeapons: readonly string[];
    readonly activeAttempt: CampaignAttempt | null;
}

export function safeId(value: unknown): value is string {
    return typeof value === 'string' && value.length > 0 && value.length <= 80
        && /^[a-zA-Z0-9_-]+$/.test(value);
}

export function safeNumber(value: unknown, minimum: number): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum;
}

function unique<T>(value: unknown, valid: (entry: unknown) => entry is T): value is T[] {
    return Array.isArray(value) && value.every(valid) && new Set(value).size === value.length;
}

function owns(object: object, key: unknown): key is string {
    return typeof key === 'string' && Object.prototype.hasOwnProperty.call(object, key);
}

export function isBlueprint(value: unknown): value is BlueprintId { return owns(BLUEPRINTS, value); }
function isBadge(value: unknown): value is Badge { return owns(COMMISSIONS, value); }
function isBuild(value: unknown): value is Build { return value === 'arc' || value === 'magnet' || value === 'heat'; }

export function isMode(value: unknown): value is ChallengeMode {
    return value === 'normal' || value === 'overtime_1' || value === 'overtime_2';
}

function isAttempt(value: unknown): value is CampaignAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as CampaignAttempt;
    return safeId(attempt.stageId) && safeId(attempt.runId)
        && (attempt.mode === undefined || isMode(attempt.mode))
        && (attempt.blueprint == null || isBlueprint(attempt.blueprint))
        && (attempt.earnsCredits === undefined || attempt.earnsCredits === true);
}

function isSettlement(value: unknown): value is Settlement {
    if (!value || typeof value !== 'object') return false;
    const row = value as Settlement;
    return safeId(row.stageId) && safeId(row.runId) && typeof row.firstClear === 'boolean'
        && (row.weapon === null || safeId(row.weapon)) && safeNumber(row.clearedWaves, 0)
        && safeNumber(row.credits, 0) && typeof row.aid === 'boolean'
        && (row.challengeBonus === undefined || (row.challengeBonus === CHALLENGE_BONUS
            && !row.firstClear && !row.aid && row.weapon === null && row.clearedWaves > 0))
        && row.credits === row.clearedWaves * 2 + Number(row.aid) + (row.challengeBonus ?? 0)
        && unique(row.builds, isBuild) && (row.chosenBuild === null || row.builds.includes(row.chosenBuild));
}

export function validProfile(value: unknown): value is CampaignProfile | LegacyProfile {
    if (!value || typeof value !== 'object') return false;
    const profile = value as CampaignProfile | LegacyProfile;
    if (!safeNumber(profile.revision, 0) || !unique(profile.clearedStages, safeId)
        || !unique(profile.unlockedWeapons, safeId)
        || !(profile.activeAttempt === null || isAttempt(profile.activeAttempt))) return false;
    if (profile.schemaVersion === 1) return true;
    return profile.schemaVersion === 2 && safeNumber(profile.credits, 0) && unique(profile.blueprints, isBlueprint)
        && (profile.pendingAttempt === null || isAttempt(profile.pendingAttempt))
        && (profile.selectedBlueprint === null || profile.blueprints.includes(profile.selectedBlueprint))
        && typeof profile.firstWaveAidClaimed === 'boolean' && unique(profile.storySeen, safeId)
        && (profile.overtimeRank === 0 || profile.overtimeRank === 1 || profile.overtimeRank === 2)
        && unique(profile.badges, isBadge) && unique(profile.inspectorBuilds, isBuild)
        && (profile.training === undefined || validTraining(profile.training))
        && (profile.challengeClears === undefined || unique(profile.challengeClears, safeId))
        && Array.isArray(profile.receipts) && profile.receipts.every(isSettlement)
        && new Set(profile.receipts.map(row => row.runId)).size === profile.receipts.length;
}

export function normalizeProfile(saved?: CampaignProfile | LegacyProfile | null): CampaignProfile {
    if (saved?.schemaVersion === 2) return saved;
    const attempt = saved?.activeAttempt;
    return {
        schemaVersion: 2,
        revision: saved?.revision ?? 0,
        clearedStages: saved?.clearedStages ?? [],
        unlockedWeapons: saved?.unlockedWeapons ?? [],
        activeAttempt: attempt ? { stageId: attempt.stageId, runId: attempt.runId } : null,
        credits: 0,
        pendingAttempt: null,
        blueprints: [],
        selectedBlueprint: null,
        firstWaveAidClaimed: false,
        storySeen: [],
        overtimeRank: 0,
        badges: [],
        inspectorBuilds: [],
        receipts: [],
    };
}

export function freezeProfile(profile: CampaignProfile): CampaignProfile {
    const freezeAttempt = (attempt: CampaignAttempt | null) => attempt ? Object.freeze({ ...attempt }) : null;
    return Object.freeze({
        ...profile,
        clearedStages: Object.freeze([...profile.clearedStages]),
        unlockedWeapons: Object.freeze([...profile.unlockedWeapons]),
        activeAttempt: freezeAttempt(profile.activeAttempt),
        pendingAttempt: freezeAttempt(profile.pendingAttempt),
        blueprints: Object.freeze([...profile.blueprints]),
        storySeen: Object.freeze([...profile.storySeen]),
        badges: Object.freeze([...profile.badges]),
        inspectorBuilds: Object.freeze([...profile.inspectorBuilds]),
        ...(profile.training && { training: freezeTraining(profile.training) }),
        ...(profile.challengeClears && { challengeClears: Object.freeze([...profile.challengeClears]) }),
        receipts: Object.freeze(profile.receipts.map(row => Object.freeze({
            ...row, builds: Object.freeze([...row.builds]),
        }))),
    });
}
