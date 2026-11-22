import { CAMPAIGN_FIELD, M2_RULES, TICK_RATE } from '../m1/content';
import type { RegularEnemyId, RunRules, ToolId, WaveSpec } from '../m1/content';
import type { CampaignEncounter } from '../m1/Encounter';
import { WORKSHOP_STARTER_MILESTONES } from './CampaignTraining';

export const CAMPAIGN_STARTERS = [
    'wrench', 'arc_gun', 'hydraulic_nailer', 'pulse_nozzle',
    'traction_coil', 'split_probe', 'bypass_wrench', ...WORKSHOP_STARTER_MILESTONES.map(({ tool }) => tool),
] as const satisfies readonly ToolId[];

type Five<T> = readonly [T, T, T, T, T];
type Roster = readonly RegularEnemyId[];

interface WavePlan {
    readonly minutes: 6 | 7 | 8;
    readonly intervals: Five<number>;
    readonly rosters: Five<Roster>;
    readonly encounter: Omit<CampaignEncounter, 'revive' | 'combatOnly'>;
}

const SCHEDULES = {
    6: { seconds: [35, 40, 45, 52, 58], timeLimit: 100 },
    7: { seconds: [40, 48, 55, 62, 65], timeLimit: 115 },
    8: { seconds: [45, 55, 63, 70, 77], timeLimit: 145 },
} as const;

export const CAMPAIGN_WAVE_PLANS = {
    '03': {
        minutes: 6, intervals: [42, 40, 38, 36, 34],
        rosters: [
            ['armored', 'crawler', 'crawler', 'crawler'],
            ['armored', 'turret', 'crawler', 'crawler'],
            ['crawler', 'armored', 'turret', 'armored', 'crawler'],
            ['armored', 'crawler', 'turret', 'crawler', 'armored', 'turret'],
            ['armored', 'turret', 'charger', 'crawler', 'crawler', 'armored'],
        ],
        encounter: { enemyCap: 12, boss: 'supervisor', bossHp: 58, armorLine: true },
    },
    '04': {
        minutes: 7, intervals: [43, 40, 36, 34, 32],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler'],
            ['pursuer', 'crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler', 'armored'],
            ['turret', 'pursuer', 'crawler', 'armored', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 13, boss: 'elite', bossHp: 60 },
    },
    '05': {
        minutes: 7, intervals: [42, 38, 36, 33, 32],
        rosters: [
            ['crawler'], ['crawler', 'crawler', 'charger'],
            ['armored', 'crawler', 'turret', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'crawler'],
            ['armored', 'crawler', 'turret', 'pursuer', 'armored', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'gatekeeper', bossHp: 92 },
    },
    '06': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['reclaimer', 'crawler', 'crawler', 'crawler'],
            ['charger', 'reclaimer', 'crawler', 'turret', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'charger', 'crawler'],
        ],
        encounter: { enemyCap: 12, boss: 'elite', bossHp: 70 },
    },
    '07': {
        minutes: 6, intervals: [42, 40, 37, 34, 32],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'crawler', 'pursuer', 'crawler'],
            ['charger', 'turret', 'crawler', 'crawler'],
            ['charger', 'armored', 'turret', 'crawler', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 70 },
    },
    '08': {
        minutes: 7, intervals: [42, 38, 35, 33, 31],
        rosters: [
            ['crawler'], ['crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'crawler', 'pursuer'],
            ['reclaimer', 'crawler', 'turret', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'pursuer', 'crawler', 'charger'],
        ],
        encounter: { enemyCap: 15, boss: 'elite', bossHp: 70 },
    },
    '09': {
        minutes: 7, intervals: [40, 38, 35, 32, 30],
        rosters: [
            ['crawler', 'crawler', 'charger'],
            ['crawler', 'crawler', 'turret', 'crawler'],
            ['charger', 'crawler', 'reclaimer', 'crawler', 'charger'],
            ['turret', 'crawler', 'pursuer', 'armored', 'crawler', 'reclaimer'],
            ['armored', 'reclaimer', 'charger', 'crawler', 'turret', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 70 },
    },
    '10': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['reclaimer', 'crawler', 'crawler'], ['charger', 'crawler', 'reclaimer'],
            ['reclaimer', 'crawler', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'turret', 'crawler', 'charger'],
            ['reclaimer', 'crawler', 'pursuer', 'crawler', 'charger', 'crawler', 'armored', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'tow', bossHp: 104 },
    },
    '11': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'pursuer', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler'],
            ['jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 80 },
    },
    '12': {
        minutes: 7, intervals: [43, 39, 36, 33, 31],
        rosters: [
            ['ambusher', 'crawler', 'crawler', 'crawler'], ['ambusher', 'crawler', 'charger', 'crawler'],
            ['ambusher', 'crawler', 'armored', 'crawler'],
            ['ambusher', 'pursuer', 'crawler', 'ambusher', 'crawler'],
            ['ambusher', 'armored', 'crawler', 'turret', 'ambusher', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 80 },
    },
    '13': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['turret', 'crawler', 'crawler'],
            ['crawler', 'turret', 'crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 17, boss: 'elite', bossHp: 80, armorLine: true },
    },
    '14': {
        minutes: 7, intervals: [40, 37, 34, 32, 30],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'jammer', 'crawler', 'crawler'],
            ['armored', 'turret', 'pursuer', 'crawler', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 80, armorLine: true },
    },
    '15': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'charger', 'crawler'],
            ['jammer', 'charger', 'crawler', 'ambusher', 'crawler'],
            ['jammer', 'ambusher', 'armored', 'charger', 'turret', 'crawler', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'silence', bossHp: 110 },
    },
    '16': {
        minutes: 6, intervals: [44, 40, 37, 34, 32],
        rosters: [
            ['charger', 'crawler', 'crawler', 'crawler'], ['crawler', 'pursuer', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'turret', 'charger', 'crawler', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'charger', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 90, armorLine: true },
    },
    '17': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['crawler', 'reclaimer', 'crawler'],
            ['reclaimer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'pursuer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'armored', 'jammer', 'crawler', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 90 },
    },
    '18': {
        minutes: 7, intervals: [40, 37, 34, 31, 29],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 19, boss: 'elite', bossHp: 90, armorLine: true },
    },
    '19': {
        minutes: 7, intervals: [40, 36, 33, 30, 28],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['charger', 'turret', 'crawler', 'jammer', 'crawler'],
            ['armored', 'pursuer', 'turret', 'crawler', 'charger', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 20, boss: 'elite', bossHp: 90 },
    },
    '20': {
        minutes: 8, intervals: [42, 38, 34, 31, 29],
        rosters: [
            ['crawler', 'jammer', 'crawler'], ['reclaimer', 'crawler', 'charger', 'crawler'],
            ['pursuer', 'crawler', 'turret', 'crawler', 'armored'],
            ['reclaimer', 'jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'reclaimer', 'crawler', 'turret', 'crawler'],
        ],
        encounter: { enemyCap: 20, boss: 'core', bossHp: 128 },
    },
} as const satisfies Record<string, WavePlan>;

export type AuthoredStageId = keyof typeof CAMPAIGN_WAVE_PLANS;

// Later waves change the enemy composition once the opening group is cleared.
export const CAMPAIGN_RESERVES: Readonly<Record<AuthoredStageId, Roster>> = {
    '03': ['turret', 'crawler', 'crawler', 'charger'],
    '04': ['pursuer', 'crawler', 'charger', 'crawler'],
    '05': ['charger', 'crawler', 'pursuer', 'crawler'],
    '06': ['charger', 'reclaimer', 'crawler', 'crawler'],
    '07': ['pursuer', 'crawler', 'crawler', 'turret'],
    '08': ['pursuer', 'crawler', 'charger', 'crawler'],
    '09': ['reclaimer', 'crawler', 'pursuer', 'crawler'],
    '10': ['charger', 'reclaimer', 'crawler', 'crawler'],
    '11': ['pursuer', 'crawler', 'jammer', 'crawler'],
    '12': ['ambusher', 'crawler', 'charger', 'crawler'],
    '13': ['jammer', 'crawler', 'pursuer', 'crawler'],
    '14': ['pursuer', 'crawler', 'turret', 'crawler'],
    '15': ['charger', 'ambusher', 'crawler', 'crawler'],
    '16': ['charger', 'crawler', 'pursuer', 'crawler'],
    '17': ['reclaimer', 'jammer', 'crawler', 'crawler'],
    '18': ['pursuer', 'armored', 'crawler', 'crawler'],
    '19': ['charger', 'crawler', 'turret', 'crawler'],
    '20': ['turret', 'charger', 'crawler', 'jammer', 'crawler'],
};

export function campaignRules(id: AuthoredStageId, shopUnlocks: readonly ToolId[]): RunRules {
    const plan: WavePlan = CAMPAIGN_WAVE_PLANS[id];
    const timing = SCHEDULES[plan.minutes];
    const waves: WaveSpec[] = timing.seconds.map((seconds, index) => {
        const reserves = index === 4;
        return {
            seconds: seconds + (reserves ? 25 : 0),
            spawnEvery: plan.intervals[index],
            enemies: plan.rosters[index],
            ...(reserves ? { escalation: {
                atTick: (seconds - 3) * TICK_RATE, requiredTicks: 18 * TICK_RATE,
                spawnEvery: 43, enemies: CAMPAIGN_RESERVES[id],
            } } : {}),
        };
    });
    waves.push({ seconds: timing.timeLimit, spawnEvery: 0, enemies: [], boss: true });
    return {
        ...M2_RULES, contentVersion: 20 + Number(id), waves, campaign: true, field: CAMPAIGN_FIELD,
        encounter: { ...plan.encounter, revive: true, combatOnly: true },
        tools: [...M2_RULES.tools, ...shopUnlocks], startingTools: CAMPAIGN_STARTERS,
    };
}
