import type { BlueprintId } from '../m1/Encounter';
import { isBlueprint, safeId } from './CampaignLedger';

/** Sync only durable unlocks. Credits and active runs stay on the originating device. */
export interface CampaignBackup {
    readonly schemaVersion: 1;
    readonly clearedStages: readonly string[];
    readonly unlockedWeapons: readonly string[];
    readonly blueprints: readonly BlueprintId[];
}

export interface ConfirmedBackup {
    /** Opaque account identifier returned by a trusted service. */
    readonly scope: string;
    readonly progress: CampaignBackup;
}

export interface CampaignBackupTransport {
    read(): Promise<ConfirmedBackup>;
    /** Server authenticates the caller, checks expectedScope, and merges sets atomically. */
    merge(expectedScope: string, progress: CampaignBackup): Promise<ConfirmedBackup>;
    onOnline?(callback: () => void): () => void;
}

export interface BoundCampaign {
    backup(): CampaignBackup;
    restoreBackup(backup: CampaignBackup): boolean;
}

export type SyncStatus = 'synced' | 'pending' | 'account-changed' | 'unbound';

export function validBackup(value: unknown): value is CampaignBackup {
    if (!value || typeof value !== 'object') return false;
    const row = value as CampaignBackup;
    const validList = <T>(items: unknown, valid: (entry: unknown) => entry is T): items is readonly T[] =>
        Array.isArray(items) && items.length <= 128 && items.every(valid) && new Set(items).size === items.length;
    return row.schemaVersion === 1 && validList(row.clearedStages, safeId)
        && validList(row.unlockedWeapons, safeId) && validList(row.blueprints, isBlueprint);
}

export function mergeBackups(a: CampaignBackup, b: CampaignBackup): CampaignBackup {
    return { schemaVersion: 1,
        clearedStages: Array.from(new Set([...a.clearedStages, ...b.clearedStages])),
        unlockedWeapons: Array.from(new Set([...a.unlockedWeapons, ...b.unlockedWeapons])),
        blueprints: Array.from(new Set([...a.blueprints, ...b.blueprints])),
    };
}

function containsBackup(confirmed: CampaignBackup, local: CampaignBackup): boolean {
    return local.clearedStages.every(stage => confirmed.clearedStages.includes(stage))
        && local.unlockedWeapons.every(weapon => confirmed.unlockedWeapons.includes(weapon))
        && local.blueprints.every(blueprint => confirmed.blueprints.includes(blueprint));
}

/** An explicit binding keeps a response for another account out of the local archive. */
export class CampaignBackupSync {
    private binding: { scope: string; campaign: BoundCampaign } | null = null;
    private inProgress = false;

    constructor(private readonly transport: CampaignBackupTransport) {}

    bind(scope: string, isolatedCampaign: BoundCampaign): void {
        if (!safeId(scope)) throw new Error('Invalid cloud account scope');
        this.binding = { scope, campaign: isolatedCampaign };
    }

    unbind(): void { this.binding = null; }

    async sync(): Promise<SyncStatus> {
        const binding = this.binding;
        if (!binding) return 'unbound';
        if (this.inProgress) return 'pending';
        this.inProgress = true;
        try {
            const remote = await this.transport.read();
            if (this.binding !== binding || remote.scope !== binding.scope) return 'account-changed';
            if (!validBackup(remote.progress)) return 'pending';
            const local = binding.campaign.backup();
            const confirmed = await this.transport.merge(binding.scope, local);
            if (this.binding !== binding || confirmed.scope !== binding.scope) return 'account-changed';
            if (!validBackup(confirmed.progress)) return 'pending';
            if (!binding.campaign.restoreBackup(mergeBackups(remote.progress, confirmed.progress))) return 'pending';
            return containsBackup(confirmed.progress, binding.campaign.backup()) ? 'synced' : 'pending';
        } catch {
            // The local progress is the durable outbox. Retry by calling sync again on foreground.
            return 'pending';
        } finally {
            this.inProgress = false;
        }
    }
}
