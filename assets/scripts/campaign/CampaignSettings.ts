import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';

export type MovementMode = 'touch' | 'joystick';

export interface CampaignPreferences {
    readonly music: boolean;
    readonly sound: boolean;
    readonly movement: MovementMode;
}

export const CAMPAIGN_SETTINGS_NAMESPACE = 'night-shift.campaign.settings';
export const DEFAULT_CAMPAIGN_PREFERENCES: CampaignPreferences = Object.freeze({
    music: true,
    sound: true,
    movement: 'joystick',
});

const VERSION = 1;

function validPreferences(value: unknown): value is CampaignPreferences {
    if (!value || typeof value !== 'object' || Object.keys(value).length !== 3) return false;
    const { music, sound, movement } = value as Partial<CampaignPreferences>;
    return typeof music === 'boolean' && typeof sound === 'boolean'
        && (movement === 'touch' || movement === 'joystick');
}

export class CampaignSettings {
    private data: CampaignPreferences;

    constructor(private readonly platform: Platform = makePlatform(undefined, CAMPAIGN_SETTINGS_NAMESPACE)) {
        const saved = platform.readCheckpoint<CampaignPreferences>(VERSION, validPreferences);
        this.data = saved ? Object.freeze(saved) : DEFAULT_CAMPAIGN_PREFERENCES;
    }

    get current(): CampaignPreferences { return this.data; }

    update(patch: Partial<CampaignPreferences>): boolean {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
        const latest = this.platform.readCheckpoint<CampaignPreferences>(VERSION, validPreferences) ?? this.data;
        const next = { ...latest, ...patch };
        if (!validPreferences(next) || !this.platform.writeCheckpoint(VERSION, next, validPreferences)) return false;
        this.data = Object.freeze(next);
        return true;
    }
}
