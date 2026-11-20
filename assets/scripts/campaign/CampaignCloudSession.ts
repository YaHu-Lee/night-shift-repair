import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';
import { Campaign, CAMPAIGN_NAMESPACE } from './Campaign';
import { CampaignBackupSync, mergeBackups, validBackup } from './CampaignBackup';
import type { CampaignBackup, CampaignBackupTransport, ConfirmedBackup, SyncStatus } from './CampaignBackup';
import { safeId } from './CampaignLedger';

const BINDING_VERSION = 1;
const BINDING_NAMESPACE = CAMPAIGN_NAMESPACE + '.cloud-binding';

interface Consent { readonly scope: string }

export interface CloudCampaignBinding {
    readonly scope: string;
    readonly campaign: Campaign;
    /** Append station and optional mode to this prefix for local Run checkpoints. */
    readonly runPrefix: string;
}

type FailureStatus = 'guest' | 'account-changed' | 'unavailable' | 'storage-failed' | 'stale';
export type CloudBindingResult = { status: 'bound'; binding: CloudCampaignBinding } | { status: FailureStatus };
export type CloudDiscoveryResult = { status: 'confirmed'; scope: string } | { status: 'unavailable' | 'stale' };

function validConsent(value: unknown): value is Consent {
    return !!value && typeof value === 'object' && safeId((value as Consent).scope);
}

/** In-memory verification gates access to the isolated archive even when prior consent is durable. */
export class CampaignCloudSession {
    private generation = 0;
    private visible: CloudCampaignBinding | null = null;
    private hidden: CloudCampaignBinding | null = null;
    private disconnected = false;
    private syncing?: { generation: number; upload: Promise<SyncStatus> };
    private readonly syncEngine: CampaignBackupSync;

    constructor(private readonly transport: CampaignBackupTransport,
        private readonly preferences: Platform = makePlatform(undefined, BINDING_NAMESPACE),
        private readonly openCampaign: (scope: string) => Campaign = Campaign.forCloudScope) {
        this.syncEngine = new CampaignBackupSync(transport);
    }

    get binding(): CloudCampaignBinding | null { return this.visible; }

    onOnline(callback: () => void): (() => void) | undefined {
        let active = true;
        let waitingOn: Promise<SyncStatus> | undefined;
        const stop = this.transport.onOnline?.(() => {
            if (!active) return;
            const inFlight = this.syncing?.upload;
            if (!inFlight) {
                callback();
                return;
            }
            // A reconnect can occur just before the last offline request reports failure.
            if (waitingOn === inFlight) return;
            waitingOn = inFlight;
            const generation = this.generation;
            void inFlight.then(() => {
                if (waitingOn === inFlight) waitingOn = undefined;
                if (active && this.generation === generation) callback();
            });
        });
        return stop && (() => { active = false; stop(); });
    }

    /** Remove access synchronously when the game loses foreground or changes accounts. */
    invalidate(): void {
        this.generation++;
        this.hidden = this.visible ?? this.hidden;
        this.visible = null;
        this.syncEngine.unbind();
    }

    async discover(): Promise<CloudDiscoveryResult> {
        this.invalidate();
        const generation = this.generation;
        const confirmed = await this.readAccount();
        if (this.generation !== generation) return { status: 'stale' };
        return confirmed ? { status: 'confirmed', scope: confirmed.scope } : { status: 'unavailable' };
    }

    /** Opens only a scope previously confirmed by the player, with a fresh identity check. */
    async restore(): Promise<CloudBindingResult> {
        this.invalidate();
        let remembered: Consent | null;
        try {
            remembered = this.preferences.readCheckpoint<Consent>(BINDING_VERSION, validConsent);
        } catch {
            return { status: 'storage-failed' };
        }
        if (this.disconnected || !remembered) {
            this.hidden = null;
            return { status: 'guest' };
        }
        return this.verify(remembered.scope, this.generation);
    }

    /** The caller asks for opt-in first. A supplied archive indicates separate consent to import it. */
    async connect(expectedScope: string, guestBackup?: CampaignBackup): Promise<CloudBindingResult> {
        this.invalidate();
        if (!safeId(expectedScope) || (guestBackup !== undefined && !validBackup(guestBackup))) {
            return { status: 'unavailable' };
        }
        return this.verify(expectedScope, this.generation, { guestBackup });
    }

    disconnect(): boolean {
        this.invalidate();
        this.hidden = null;
        this.disconnected = true;
        return this.preferences.clearCheckpoint();
    }

    async sync(): Promise<SyncStatus> {
        const binding = this.visible;
        if (!binding) return 'unbound';
        const generation = this.generation;
        const inFlight = this.syncing;
        if (inFlight) {
            if (inFlight.generation === generation) return 'pending';
            // Foreground restored a new verification while an older request was winding down.
            await inFlight.upload;
            return this.generation === generation ? this.sync() : 'unbound';
        }
        const upload = this.syncEngine.sync();
        this.syncing = { generation, upload };
        const outcome = await upload;
        this.syncing = undefined;
        if (this.generation !== generation || binding !== this.visible) return 'unbound';
        if (outcome === 'account-changed') this.invalidate();
        return outcome;
    }

    private async readAccount(): Promise<ConfirmedBackup | null> {
        try {
            const confirmed = await this.transport.read();
            return safeId(confirmed.scope) && validBackup(confirmed.progress) ? confirmed : null;
        } catch {
            return null;
        }
    }

    private async verify(expectedScope: string, generation: number,
        consent?: { guestBackup: CampaignBackup | undefined }): Promise<CloudBindingResult> {
        const confirmed = await this.readAccount();
        if (this.generation !== generation) return { status: 'stale' };
        if (!confirmed) return { status: 'unavailable' };
        if (confirmed.scope !== expectedScope) {
            this.hidden = null;
            return { status: 'account-changed' };
        }
        const prior = this.hidden;
        const progress = consent?.guestBackup ? mergeBackups(confirmed.progress, consent.guestBackup) : confirmed.progress;
        let campaign: Campaign;
        try {
            campaign = prior?.scope === expectedScope ? prior.campaign : this.openCampaign(expectedScope);
            if (!campaign.restoreBackup(progress)
                || (consent && !this.preferences.writeCheckpoint<Consent>(BINDING_VERSION, { scope: expectedScope }))) {
                return { status: 'storage-failed' };
            }
        } catch {
            return { status: 'storage-failed' };
        }
        this.disconnected = false;
        const binding = prior?.scope === expectedScope ? prior
            : { scope: expectedScope, campaign, runPrefix: CAMPAIGN_NAMESPACE + '.account.' + expectedScope + '.run.' };
        this.visible = binding;
        this.hidden = null;
        this.syncEngine.bind(expectedScope, campaign);
        return { status: 'bound', binding };
    }
}
