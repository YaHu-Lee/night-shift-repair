import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';
import { BASE_PICKUP_RADIUS, hasPair, isTool, MAGNET_PICKUP_RADIUS, TICK_RATE, TOOLS } from '../m1/content';
import type { EquippedTool, Route, RunRules, ToolId } from '../m1/content';
import { equipmentBuilds } from '../m1/Equipment';
import type { AttachmentId, EquipmentStart, EquipmentState } from '../m1/Equipment';
import type { BlueprintId, ChallengeMode } from '../m1/Encounter';
import { CAMPAIGN_CATALOG } from './CampaignCatalog';
import { validBackup } from './CampaignBackup';
import type { CampaignBackup } from './CampaignBackup';
import { BLUEPRINTS, CHALLENGE_BONUS, WORKSHOP_TIERS, freezeProfile, isBlueprint, isMode, normalizeProfile, safeId, safeNumber, validProfile } from './CampaignLedger';
import type { Badge, Build, CampaignAttempt, CampaignProfile, Settlement } from './CampaignLedger';
import { WORKSHOP_STARTER_MILESTONES, isTrainingTrack, NO_TRAINING, ROLE_TRAINING, roleTrainingView, signatureAttachment, weaponTrainingView } from './CampaignTraining';
import type { RoleTrainingView, TrainingProgress, TrainingTrack, WeaponTrainingView } from './CampaignTraining';

export { BLUEPRINTS, COMMISSIONS } from './CampaignLedger';
export type { CampaignAttempt, CampaignProfile, Settlement } from './CampaignLedger';
export type { TrainingTrack } from './CampaignTraining';

export const CAMPAIGN_NAMESPACE = 'night-shift.campaign';
// Keep the envelope version readable alongside the previous slot during schema upgrades.
const PROFILE_VERSION = 1;
const RECEIPT_LIMIT = 32;

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
    readonly rules?: RunRules;
}

export const CAMPAIGN_STAGES = CAMPAIGN_CATALOG;

export interface WonCheckpoint {
    readonly contentVersion: number;
    readonly phase: string;
    readonly finishReason?: string;
    readonly wave: number;
    readonly runId: string;
    readonly mode?: ChallengeMode;
    readonly blueprint?: BlueprintId | null;
}

interface ResultCheckpoint extends WonCheckpoint {
    readonly firstWaveMoved?: boolean;
    readonly tools?: readonly EquippedTool[];
    readonly equipment?: EquipmentState;
    readonly reports?: readonly {
        readonly wave: number;
        readonly ticks: number;
        readonly triggers?: Readonly<Record<Build, number>>;
        readonly heatRecovered?: boolean;
    }[];
}

interface AttemptOptions {
    readonly mode?: ChallengeMode;
    readonly blueprint?: BlueprintId | null;
}

export type ClearStatus = 'committed' | 'already-cleared' | 'not-eligible' | 'storage-failed';

const BUILDS = ['arc', 'magnet', 'heat'] as const;
const FIRST_WAVE_AID_TICKS = 15 * TICK_RATE;
const addUnique = <T>(items: readonly T[], item: T): readonly T[] => items.includes(item) ? items : [...items, item];

function unlockedWeapon(profile: CampaignProfile, tool: string): boolean {
    return tool === 'wrench' || profile.unlockedWeapons.includes(tool)
        || WORKSHOP_STARTER_MILESTONES.some(milestone => milestone.tool === tool
            && profile.clearedStages.includes(milestone.stage));
}

export class Campaign {
    private readonly byId = new Map<string, StageContract>();
    private data: CampaignProfile;
    private unconfirmedProfile?: string;
    readonly profileState: 'new' | 'loaded' | 'unreadable';
    storageFailed = false;

    constructor(private readonly platform: Platform = makePlatform(undefined, CAMPAIGN_NAMESPACE),
        stages: readonly StageContract[] = CAMPAIGN_STAGES) {
        const versions = new Set<number>();
        for (const stage of stages) {
            if (!safeId(stage.id) || !safeId(stage.chapter) || !stage.title || this.byId.has(stage.id)
                || !safeNumber(stage.contentVersion, 1) || versions.has(stage.contentVersion)
                || !safeNumber(stage.finalWave, 0) || !safeNumber(stage.plannedMinutes, 1)
                || (stage.firstClearWeapon !== null && !safeId(stage.firstClearWeapon))
                || (stage.rules && (stage.rules.contentVersion !== stage.contentVersion
                    || stage.rules.waves.length !== stage.finalWave + 1))
                || (stage.prerequisite !== null && !this.byId.has(stage.prerequisite))) {
                throw new Error('Invalid campaign stage: ' + stage.id);
            }
            this.byId.set(stage.id, Object.freeze({ ...stage }));
            versions.add(stage.contentVersion);
        }
        let encounteredInvalid = false;
        const saved = platform.readCheckpoint<Parameters<typeof normalizeProfile>[0]>(PROFILE_VERSION, (value) => {
            if (this.validProgress(value)) return true;
            encounteredInvalid = true;
            return false;
        });
        const presence = saved ? undefined : platform.checkpointPresence?.();
        this.profileState = saved ? 'loaded'
            : (encounteredInvalid || (presence !== undefined && presence !== 'empty')) ? 'unreadable' : 'new';
        this.storageFailed = this.profileState === 'unreadable';
        const profile = normalizeProfile(saved);
        const unlockedWeapons = new Set(profile.unlockedWeapons);
        for (const stageId of profile.clearedStages) {
            const reward = this.byId.get(stageId)?.firstClearWeapon;
            if (reward) unlockedWeapons.add(reward);
        }
        const storySeen = saved?.schemaVersion === 1
            ? profile.clearedStages.map(stageId => 'clear-' + stageId)
            : profile.storySeen;
        this.data = freezeProfile({ ...profile, unlockedWeapons: Array.from(unlockedWeapons), storySeen });
    }

    get profile(): CampaignProfile { return this.data; }

    get workshopTier(): number {
        return WORKSHOP_TIERS.reduce((latest, tier, index) => tier.stage && this.data.clearedStages.includes(tier.stage)
            ? index : latest, 0);
    }

    static forCloudScope(scope: string): Campaign {
        if (!safeId(scope)) throw new Error('Invalid cloud account scope');
        return new Campaign(makePlatform(undefined, CAMPAIGN_NAMESPACE + '.account.' + scope));
    }

    backup(): CampaignBackup {
        return { schemaVersion: 1, clearedStages: this.data.clearedStages,
            unlockedWeapons: this.data.unlockedWeapons, blueprints: this.data.blueprints };
    }

    restoreBackup(backup: CampaignBackup): boolean {
        if (this.profileState === 'unreadable' || !validBackup(backup)) return false;
        const clearedStages = new Set(this.data.clearedStages);
        const unlockedWeapons = new Set(this.data.unlockedWeapons);
        const blueprints = new Set([...this.data.blueprints, ...backup.blueprints]);
        const storySeen = new Set(this.data.storySeen);
        this.byId.forEach(stage => {
            if (!backup.clearedStages.includes(stage.id)
                || (stage.prerequisite && !clearedStages.has(stage.prerequisite))) return;
            clearedStages.add(stage.id);
            storySeen.add('clear-' + stage.id);
            if (stage.firstClearWeapon) unlockedWeapons.add(stage.firstClearWeapon);
        });
        if (clearedStages.size === this.data.clearedStages.length
            && unlockedWeapons.size === this.data.unlockedWeapons.length
            && blueprints.size === this.data.blueprints.length
            && storySeen.size === this.data.storySeen.length) return true;
        return this.save({ ...this.data, clearedStages: Array.from(clearedStages), unlockedWeapons: Array.from(unlockedWeapons),
            blueprints: Array.from(blueprints), storySeen: Array.from(storySeen) });
    }

    isUnlocked(stageId: string): boolean {
        const stage = this.byId.get(stageId);
        return this.profileState !== 'unreadable' && !!stage
            && (stage.prerequisite === null || this.data.clearedStages.includes(stage.prerequisite));
    }

    canUseStarter(stageId: string, toolId: string): boolean {
        return this.availableStarters(stageId).some(candidate => candidate === toolId);
    }

    availableStarters(stageId: string): ToolId[] {
        if (!this.isUnlocked(stageId)) return [];
        const rules = this.byId.get(stageId)?.rules;
        const candidates: readonly ToolId[] = rules?.startingTools ?? ['wrench'];
        return candidates.filter(tool => unlockedWeapon(this.data, tool)
            && (!WORKSHOP_STARTER_MILESTONES.some(milestone => milestone.tool === tool) || rules?.tools.includes(tool))
            && (tool === 'wrench' || stageId !== '01' || this.data.clearedStages.includes('01')));
    }

    availableShopWeapons(stageId: string): ToolId[] {
        if (!this.isUnlocked(stageId)) return [];
        return this.byId.get(stageId)?.rules?.tools.filter(tool => unlockedWeapon(this.data, tool)) ?? [];
    }

    availableTrainingWeapons(): ToolId[] {
        return Object.keys(TOOLS).filter(isTool).filter(tool => this.canTrainWeapon(tool));
    }

    isModeUnlocked(stageId: string, mode: ChallengeMode): boolean {
        if (!this.isUnlocked(stageId)) return false;
        if (mode === 'normal') return true;
        return this.data.clearedStages.includes(stageId)
            && (mode === 'overtime_1' || (mode === 'overtime_2' && stageId === '01' && this.data.overtimeRank >= 1));
    }

    hasClearedChallenge(stageId: string): boolean {
        return !!this.data.challengeClears?.includes(stageId) || (stageId === '01' && this.data.overtimeRank > 0);
    }

    newAttemptId(stageId: string, seed: number): string {
        return stageId + '-r' + (this.data.revision + 1).toString(36) + '-' + (seed >>> 0).toString(36);
    }

    private attempt(stageId: string, runId: string, options?: AttemptOptions): CampaignAttempt | null {
        const mode = options?.mode ?? 'normal';
        const blueprint = options?.blueprint === undefined ? this.data.selectedBlueprint : options.blueprint;
        if (!safeId(runId) || !isMode(mode) || !this.isModeUnlocked(stageId, mode) || this.receipt(runId)
            || (blueprint !== null && !this.data.blueprints.includes(blueprint))) return null;
        return { stageId, runId, mode, blueprint, earnsCredits: true };
    }

    private sameAttempt(attempt: CampaignAttempt, stageId: string, runId: string, options?: AttemptOptions): boolean {
        return attempt.stageId === stageId && attempt.runId === runId
            && (options?.mode === undefined || (attempt.mode ?? 'normal') === options.mode)
            && (options?.blueprint === undefined || (attempt.blueprint ?? null) === options.blueprint);
    }

    beginAttempt(stageId: string, runId: string, options?: AttemptOptions): boolean {
        const current = this.data.activeAttempt;
        if (current?.runId === runId) return this.isUnlocked(stageId) && this.sameAttempt(current, stageId, runId, options);
        const attempt = this.attempt(stageId, runId, options);
        return !!attempt && !this.data.pendingAttempt && this.save({ ...this.data, activeAttempt: attempt });
    }

    /** Keep the previous active attempt until the replacement's checkpoint is durable. */
    prepareAttempt(stageId: string, runId: string, options?: AttemptOptions): boolean {
        const pending = this.data.pendingAttempt;
        if (pending) return this.sameAttempt(pending, stageId, runId, options);
        if (this.data.activeAttempt?.runId === runId) return false;
        const attempt = this.attempt(stageId, runId, options);
        return !!attempt && this.save({ ...this.data, pendingAttempt: attempt });
    }

    commitAttempt(checkpoint: WonCheckpoint | null | undefined): boolean {
        const pending = this.data.pendingAttempt;
        if (!pending) return !!checkpoint && this.matches(this.data.activeAttempt, checkpoint);
        return !!checkpoint && this.matches(pending, checkpoint)
            && this.save({ ...this.data, activeAttempt: pending, pendingAttempt: null });
    }

    abortAttempt(): boolean {
        return !this.data.pendingAttempt || this.save({ ...this.data, pendingAttempt: null });
    }

    /** Existing unsettled runs can earn credits after the workshop becomes available. */
    enableWorkshopForActive(checkpoint: WonCheckpoint | null | undefined): boolean {
        const attempt = this.data.activeAttempt;
        if (!attempt || attempt.earnsCredits || !checkpoint || !this.matches(attempt, checkpoint)
            || !['battle', 'shop', 'revive'].includes(checkpoint.phase)) return true;
        return this.save({ ...this.data, activeAttempt: { ...attempt, earnsCredits: true } });
    }

    get blueprintPrice(): number { return this.data.blueprints.length ? 8 : 4; }

    get canBuyBlueprint(): boolean {
        return this.profileState !== 'unreadable' && this.data.blueprints.length < Object.keys(BLUEPRINTS).length
            && this.data.credits >= this.blueprintPrice;
    }

    get canUpgradeEquipment(): boolean {
        return this.canBuyBlueprint || this.availableTrainingWeapons().some(tool => this.canAffordTraining(this.weaponTraining(tool).next));
    }

    get canUpgradeRole(): boolean {
        return Object.keys(ROLE_TRAINING).filter(isTrainingTrack).some(track => this.canAffordTraining(this.roleTraining(track).next));
    }

    private get training(): TrainingProgress { return this.data.training ?? NO_TRAINING; }

    weaponTraining(tool: ToolId): WeaponTrainingView {
        return weaponTrainingView(this.training, tool, this.canTrainWeapon(tool));
    }

    roleTraining(track: TrainingTrack): RoleTrainingView {
        return roleTrainingView(this.training, track);
    }

    private canAffordTraining(offer: WeaponTrainingView['next']): offer is NonNullable<WeaponTrainingView['next']> {
        return offer !== null && this.profileState !== 'unreadable' && this.data.credits >= offer.price;
    }

    trainWeapon(tool: ToolId, expectedRevision: number): boolean {
        if (!this.canTrainWeapon(tool) || expectedRevision !== this.data.revision) return false;
        const { rank, next } = this.weaponTraining(tool);
        if (!this.canAffordTraining(next)) return false;
        const newRank = (rank + 1) as 1 | 2 | 3;
        return this.save({ ...this.data, credits: this.data.credits - next.price,
            training: { ...this.training, weapons: { ...this.training.weapons, [tool]: { rank: newRank } } },
        });
    }

    trainRole(track: TrainingTrack, expectedRevision: number): boolean {
        if (!isTrainingTrack(track) || expectedRevision !== this.data.revision) return false;
        const { rank, next } = this.roleTraining(track);
        if (!this.canAffordTraining(next)) return false;
        const newRank = rank === 0 ? 1 : 2;
        return this.save({ ...this.data, credits: this.data.credits - next.price,
            training: { ...this.training, roles: { ...this.training.roles, [track]: newRank } },
        });
    }

    selectStarterAttachment(tool: ToolId, attachment: AttachmentId | null, expectedRevision: number): boolean {
        if (!this.canTrainWeapon(tool) || expectedRevision !== this.data.revision) return false;
        const { rank, starterAttachment, starterAttachments } = this.weaponTraining(tool);
        if (attachment === starterAttachment) return true;
        if (rank !== 3 || (attachment !== null && !starterAttachments.includes(attachment))) return false;
        const trained = attachment === null ? { rank } : { rank, starterAttachment: attachment };
        return this.save({ ...this.data,
            training: { ...this.training, weapons: { ...this.training.weapons, [tool]: trained } },
        });
    }

    trainingLoadout(tool: ToolId, route: Route = 'arc'): EquipmentStart {
        const { reachBonus, intervalReduction, starterAttachment } = this.weaponTraining(tool);
        const unlockedAttachments = Object.keys(this.training.weapons).filter(isTool)
            .filter(id => this.canTrainWeapon(id) && this.training.weapons[id]?.rank === 3).map(signatureAttachment);
        const pickupRadius = route === 'magnet' ? MAGNET_PICKUP_RADIUS : BASE_PICKUP_RADIUS;
        return Object.freeze({
            weapon: Object.freeze({ reachBonus, intervalReduction, damageBonus: 0 }),
            role: Object.freeze({
                hpBonus: this.roleTraining('vitality').bonus,
                speedBonus: this.roleTraining('mobility').bonus / 100,
                pickupBonus: this.roleTraining('collection').bonus * pickupRadius / 100,
            }),
            unlockedAttachments: Object.freeze(unlockedAttachments),
            ...(this.data.clearedStages.includes('10') ? { unlockedGear: Object.freeze(['gear/harness']) } : {}),
            ...(starterAttachment === null ? {} : { starterAttachment }),
        });
    }

    private canTrainWeapon(tool: ToolId): boolean {
        return this.profileState !== 'unreadable' && isTool(tool) && unlockedWeapon(this.data, tool);
    }

    buyBlueprint(id: BlueprintId): boolean {
        if (!isBlueprint(id) || this.profileState === 'unreadable') return false;
        if (this.data.blueprints.includes(id)) return true;
        return this.canBuyBlueprint && this.save({
            ...this.data, credits: this.data.credits - this.blueprintPrice, blueprints: [...this.data.blueprints, id],
        });
    }

    selectBlueprint(id: BlueprintId | null): boolean {
        if (this.profileState === 'unreadable' || (id !== null && !this.data.blueprints.includes(id))) return false;
        return this.data.selectedBlueprint === id || this.save({ ...this.data, selectedBlueprint: id });
    }

    markStorySeen(id: string): boolean {
        if (!safeId(id) || this.profileState === 'unreadable') return false;
        if (id.startsWith('clear-')) {
            const stageId = id.slice('clear-'.length);
            if (this.byId.has(stageId) && !this.data.clearedStages.includes(stageId)) return false;
        }
        return this.data.storySeen.includes(id)
            || this.save({ ...this.data, storySeen: [...this.data.storySeen, id] });
    }

    receipt(runId: string): Settlement | undefined {
        return this.data.receipts.find(receipt => receipt.runId === runId);
    }

    chooseInspectorBuild(runId: string, build: Build): boolean {
        const receipt = this.receipt(runId);
        if (this.profileState === 'unreadable' || !receipt?.builds.includes(build)) return false;
        if (receipt.chosenBuild) return receipt.chosenBuild === build;
        const inspectorBuilds = addUnique(this.data.inspectorBuilds, build);
        return this.save({ ...this.data, inspectorBuilds,
            badges: inspectorBuilds.length >= 2 ? addUnique(this.data.badges, 'two_builds') : this.data.badges,
            receipts: this.data.receipts.map(row => row.runId === runId ? { ...row, chosenBuild: build } : row),
        });
    }

    /** Compatibility for terminal snapshots written before the workshop ledger existed. */
    replayWon(stageId: string, checkpoint: WonCheckpoint | null | undefined): ClearStatus {
        if (this.profileState === 'unreadable') return 'storage-failed';
        if (checkpoint?.phase !== 'won') return 'not-eligible';
        return this.settle(stageId, checkpoint, false);
    }

    /** The host supplies Run.data only after its terminal checkpoint is durable. */
    replayResult(stageId: string, checkpoint: ResultCheckpoint | null | undefined): ClearStatus {
        return this.settle(stageId, checkpoint, true);
    }

    private matches(attempt: CampaignAttempt | null, checkpoint: WonCheckpoint): boolean {
        return !!attempt && attempt.runId === checkpoint.runId
            && this.byId.get(attempt.stageId)?.contentVersion === checkpoint.contentVersion
            && (attempt.mode ?? 'normal') === (checkpoint.mode ?? 'normal')
            && (attempt.blueprint ?? null) === (checkpoint.blueprint ?? null);
    }

    private settle(stageId: string, checkpoint: ResultCheckpoint | null | undefined, workshop: boolean): ClearStatus {
        const stage = this.byId.get(stageId);
        if (this.profileState === 'unreadable') return 'storage-failed';
        if (!stage || !checkpoint || !this.isUnlocked(stageId)
            || checkpoint.contentVersion !== stage.contentVersion
            || !safeNumber(checkpoint.wave, 0) || checkpoint.wave > stage.finalWave
            || !safeId(checkpoint.runId)) return 'not-eligible';
        const won = checkpoint.phase === 'won' && checkpoint.finishReason === 'cleared'
            && checkpoint.wave === stage.finalWave;
        const lost = checkpoint.phase === 'lost' && ['defeated', 'timeout', 'objective-failed'].includes(checkpoint.finishReason ?? '');
        if (!won && (!workshop || !lost)) return 'not-eligible';
        const cleared = this.data.clearedStages.includes(stageId);
        if (!workshop && cleared) return 'already-cleared';
        const previous = this.receipt(checkpoint.runId);
        if (previous) return previous.stageId === stageId ? 'already-cleared' : 'not-eligible';
        const active = this.data.activeAttempt;
        if (!active || active.stageId !== stageId || !this.matches(active, checkpoint)) return 'not-eligible';

        const mode = active.mode ?? 'normal';
        const firstClear = won && mode === 'normal' && !cleared;
        const weapon = firstClear ? stage.firstClearWeapon : null;
        const clearedStages = firstClear ? [...this.data.clearedStages, stageId] : this.data.clearedStages;
        const unlockedWeapons = weapon ? addUnique(this.data.unlockedWeapons, weapon) : this.data.unlockedWeapons;
        const storySeen = firstClear ? addUnique(this.data.storySeen, 'clear-' + stageId) : this.data.storySeen;
        const progress = { ...this.data, clearedStages, unlockedWeapons, storySeen };
        if (!workshop || !active.earnsCredits) {
            if (!firstClear) return 'already-cleared';
            return this.save(progress) ? 'committed' : 'storage-failed';
        }
        const settled = this.recordSettlement(progress, checkpoint, stage, firstClear, weapon, mode, won);
        return this.save(settled) ? 'committed' : 'storage-failed';
    }

    private recordSettlement(profile: CampaignProfile, checkpoint: ResultCheckpoint, stage: StageContract,
        firstClear: boolean, weapon: string | null, mode: ChallengeMode, won: boolean): CampaignProfile {
        const clearedWaves = won ? stage.finalWave + 1 : checkpoint.wave;
        const firstReport = checkpoint.reports?.[0];
        const aid = mode === 'normal' && !profile.firstWaveAidClaimed && !won && clearedWaves === 0
            && checkpoint.finishReason === 'defeated' && checkpoint.firstWaveMoved === true
            && firstReport?.wave === 0 && firstReport.ticks >= FIRST_WAVE_AID_TICKS;
        const challengeBonus = won && mode === 'overtime_1' && !this.hasClearedChallenge(stage.id) ? CHALLENGE_BONUS : undefined;
        const credits = 2 * clearedWaves + Number(aid) + (challengeBonus ?? 0);
        const inspector = stage.id === '01' && won;
        const reports = checkpoint.reports ?? [];
        const fired = (build: Build) => reports.some(report => (report.triggers?.[build] ?? 0) > 0);
        const tools = checkpoint.tools ?? [];
        const equippedBuilds = inspector && checkpoint.equipment ? equipmentBuilds(tools, checkpoint.equipment) : null;
        const builds = inspector ? BUILDS.filter(build => fired(build)
            && (equippedBuilds ? equippedBuilds.includes(build) : hasPair(tools, build))) : [];
        const badges = new Set<Badge>(profile.badges);
        if (clearedWaves > 0) badges.add('first_wave');
        if (fired('arc')) badges.add('arc_chain');
        if (fired('magnet')) badges.add('magnetic_pulse');
        if (reports.some(report => report.heatRecovered)) badges.add('heat_recovery');
        if (inspector) badges.add('inspector_clear');
        const chosenBuild = builds.length === 1 ? builds[0] : null;
        const inspectorBuilds = chosenBuild ? addUnique(profile.inspectorBuilds, chosenBuild) : profile.inspectorBuilds;
        if (inspectorBuilds.length >= 2) badges.add('two_builds');
        const overtimeRank = inspector && mode === 'overtime_2' ? 2
            : inspector && mode === 'overtime_1' && profile.overtimeRank === 0 ? 1 : profile.overtimeRank;
        const receipt: Settlement = { stageId: stage.id, runId: checkpoint.runId, firstClear, weapon,
            clearedWaves, credits, aid, builds, chosenBuild, ...(challengeBonus && { challengeBonus }) };
        return { ...profile, credits: profile.credits + credits,
            firstWaveAidClaimed: profile.firstWaveAidClaimed || aid, inspectorBuilds, badges: Array.from(badges), overtimeRank,
            ...(challengeBonus && { challengeClears: [...(profile.challengeClears ?? []), stage.id] }),
            receipts: [...profile.receipts, receipt].slice(-RECEIPT_LIMIT),
        };
    }

    private validProgress(value: unknown): boolean {
        if (!validProfile(value)) return false;
        const cleared = new Set(value.clearedStages);
        const stories = value.schemaVersion === 2 ? new Set(value.storySeen) : null;
        for (const stage of this.byId.values()) {
            if (cleared.has(stage.id)) {
                if (stage.prerequisite !== null && !cleared.has(stage.prerequisite)) return false;
            } else if (stories?.has('clear-' + stage.id)) {
                return false;
            }
        }
        if (value.schemaVersion === 2) {
            const trainedWeapons = Object.keys(value.training?.weapons ?? {});
            if (trainedWeapons.some(tool => !unlockedWeapon(value, tool))) return false;
            const challengeClears = value.challengeClears ?? [];
            if (challengeClears.some(id => !this.byId.has(id) || !cleared.has(id))) return false;
            const challenges = new Set(challengeClears);
            if (challenges.has('01') && value.overtimeRank === 0) return false;
            const rewarded = new Set<string>();
            for (const receipt of value.receipts) {
                if (!receipt.challengeBonus) continue;
                const stage = this.byId.get(receipt.stageId);
                if (!stage || receipt.clearedWaves !== stage.finalWave + 1
                    || !challenges.has(stage.id) || rewarded.has(stage.id)) return false;
                rewarded.add(stage.id);
            }
        }
        return true;
    }

    private save(profile: CampaignProfile): boolean {
        if (this.profileState === 'unreadable') return false;
        const next = freezeProfile({ ...profile, revision: this.data.revision + 1 });
        const validate = (value: unknown) => this.validProgress(value);
        const saved = this.platform.readCheckpoint<{ revision: number }>(PROFILE_VERSION, validate);
        // A previous call can have written the slot before its readback failed.
        const unconfirmed = this.unconfirmedProfile;
        const confirmed = unconfirmed !== undefined && saved?.revision === next.revision
            && JSON.stringify(saved) === unconfirmed && JSON.stringify(next) === unconfirmed;
        if (!confirmed && ((saved?.revision ?? 0) !== this.data.revision || !validate(next))) {
            this.storageFailed = true;
            return false;
        }
        if (!confirmed && !this.platform.writeCheckpoint(PROFILE_VERSION, next, validate)) {
            this.unconfirmedProfile = JSON.stringify(next);
            this.storageFailed = true;
            return false;
        }
        this.unconfirmedProfile = undefined;
        this.storageFailed = false;
        this.data = next;
        return true;
    }
}
