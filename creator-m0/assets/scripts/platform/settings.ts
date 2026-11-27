import { makePlatform } from './platform';
import type { Platform } from './platform';

export type MovementMode = 'touch' | 'joystick' | 'tilt';

export type StickPlacement = 'left' | 'center' | 'right';
export const STICK_MARGIN = { min: 8, sideMax: 80, bottomMax: 104, step: 8 } as const;

export interface CampaignPreferences {
    readonly stickPlacement: StickPlacement;
    readonly sideMargin: number;
    readonly bottomMargin: number;
    readonly music: boolean;
    readonly sound: boolean;
    readonly movement: MovementMode;
}

export const CAMPAIGN_SETTINGS_NAMESPACE = 'night-shift.campaign.settings';
export const DEFAULT_CAMPAIGN_PREFERENCES: CampaignPreferences = Object.freeze({
    stickPlacement: 'right',
    sideMargin: 32,
    bottomMargin: 56,
    music: true,
    sound: true,
    movement: 'joystick',
});

const VERSION = 1;

type LegacyPreferences = Pick<CampaignPreferences, 'music' | 'sound' | 'movement'>;

function validMargin(value: unknown, max: number): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= STICK_MARGIN.min && value <= max;
}

function validSavedPreferences(value: unknown): value is LegacyPreferences | CampaignPreferences {
    if (!value || typeof value !== 'object') return false;
    const { music, sound, movement, stickPlacement, sideMargin, bottomMargin } = value as Partial<CampaignPreferences>;
    if (typeof music !== 'boolean' || typeof sound !== 'boolean' || (movement !== 'touch' && movement !== 'joystick' && movement !== 'tilt')) return false;
    const keys = Object.keys(value).length;
    if (keys === 3) return true;
    return keys === 6 && (stickPlacement === 'right' || stickPlacement === 'left' || stickPlacement === 'center')
        && validMargin(sideMargin, STICK_MARGIN.sideMax) && validMargin(bottomMargin, STICK_MARGIN.bottomMax);
}

export class CampaignSettings {
    private data: CampaignPreferences;

    constructor(private readonly platform: Platform = makePlatform(undefined, CAMPAIGN_SETTINGS_NAMESPACE)) {
        const saved = platform.readCheckpoint<LegacyPreferences | CampaignPreferences>(VERSION, validSavedPreferences);
        this.data = Object.freeze({ ...DEFAULT_CAMPAIGN_PREFERENCES, ...saved });
    }

    get current(): CampaignPreferences { return this.data; }

    update(patch: Partial<CampaignPreferences>): boolean {
        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
        const latest = this.platform.readCheckpoint<LegacyPreferences | CampaignPreferences>(VERSION, validSavedPreferences) ?? this.data;
        const next = { ...DEFAULT_CAMPAIGN_PREFERENCES, ...latest, ...patch };
        if (!validSavedPreferences(next) || !this.platform.writeCheckpoint(VERSION, next, validSavedPreferences)) return false;
        this.data = Object.freeze(next);
        return true;
    }
}
