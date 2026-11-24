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

type Entrance = 'ends' | 'sides' | 'around';
type Arrival = readonly [size: number, every: number, entrance: Entrance, split?: true];

interface CombatPlan {
    readonly arrivals: Five<Arrival | null>;
    readonly duel?: CampaignEncounter['bossDuel'];
    readonly inspectorOpener?: CampaignEncounter['inspectorOpener'];
}

// Each arrival describes the lead enemies in a squad; CampaignPressure adds its drone escorts.
export const CAMPAIGN_COMBAT_PLANS: Readonly<Partial<Record<string, CombatPlan>>> = {
    '01': { arrivals: [[2, 72, 'ends'], [3, 104, 'ends'], [3, 81, 'sides'], [2, 66, 'sides'], [3, 88, 'ends']] },
    '02': { arrivals: [[1, 41, 'ends'], [2, 75, 'ends'], [3, 91, 'sides'], [3, 96, 'around'], [3, 90, 'ends']], inspectorOpener: 'fan' },
    '03': { arrivals: [[2, 85, 'sides'], [2, 78, 'ends'], [3, 96, 'sides'], [3, 89, 'sides'], [4, 106, 'around']],
        duel: { opening: 69, rest: 18, volley: 'fan' } },
    '04': { arrivals: [[1, 42, 'ends'], [2, 75, 'sides'], [3, 89, 'sides'], [3, 84, 'ends'], [4, 99, 'around']],
        duel: { opening: 63, rest: 18, volley: 'fan' } },
    '05': { arrivals: [[2, 80, 'ends'], [2, 76, 'sides'], [3, 87, 'ends'], [4, 96, 'sides'], [4, 92, 'around', true]],
        duel: { opening: 69, rest: 17, volley: 'ring' } },
    '06': { arrivals: [[1, 44, 'ends'], [2, 75, 'ends'], [5, 98, 'sides'], [3, 88, 'sides'], [4, 109, 'around']],
        duel: { opening: 52, rest: 12, volley: 'fan' } },
    '07': { arrivals: [[2, 82, 'sides'], [2, 72, 'ends'], [3, 86, 'ends'], [4, 99, 'sides'], [4, 96, 'around']],
        duel: { opening: 61, rest: 18, volley: 'ring' } },
    '08': { arrivals: [[1, 41, 'sides'], [2, 72, 'ends'], [3, 84, 'sides'], [4, 100, 'ends'], [4, 93, 'around']],
        duel: { opening: 61, rest: 16, volley: 'fan' } },
    '09': { arrivals: [[1, 39, 'ends'], [2, 73, 'sides'], [3, 84, 'ends'], [4, 92, 'ends', true], [4, 91, 'around']],
        duel: { opening: 60, rest: 16, volley: 'ring' } },
    '10': { arrivals: [[2, 82, 'sides'], [2, 74, 'ends'], [3, 87, 'sides'], [3, 82, 'ends'], [4, 96, 'around']],
        duel: { opening: 72, rest: 18, volley: 'ring' } },
    '11': { arrivals: [[1, 44, 'ends'], [2, 79, 'sides'], [3, 90, 'ends'], [3, 82, 'sides'], [4, 105, 'around']],
        duel: { opening: 63, rest: 16, volley: 'fan' } },
    '12': { arrivals: [[2, 86, 'ends'], [2, 76, 'sides'], [3, 86, 'sides'], [4, 98, 'ends'], [4, 93, 'around']],
        duel: { opening: 62, rest: 16, volley: 'ring' } },
    '13': { arrivals: [[1, 40, 'sides'], [2, 74, 'ends'], [3, 83, 'sides'], [4, 98, 'sides'], [4, 91, 'ends', true]],
        duel: { opening: 60, rest: 17, volley: 'fan' } },
    '14': { arrivals: [[2, 80, 'ends'], [2, 73, 'sides'], [3, 82, 'ends'], [4, 97, 'sides', true], [4, 90, 'around']],
        duel: { opening: 61, rest: 15, volley: 'ring' } },
    '15': { arrivals: [[2, 82, 'sides'], [2, 73, 'ends'], [3, 85, 'around'], [4, 97, 'sides'], [4, 91, 'around', true]],
        duel: { opening: 73, rest: 17, volley: 'ring' } },
    '16': { arrivals: [[1, 42, 'ends'], [2, 78, 'sides'], [3, 89, 'ends'], [3, 84, 'sides'], [4, 101, 'around']],
        duel: { opening: 61, rest: 16, volley: 'fan' } },
    '17': { arrivals: [[2, 84, 'sides'], [2, 74, 'ends'], [3, 85, 'sides'], [3, 82, 'ends'], [4, 96, 'around']],
        duel: { opening: 60, rest: 16, volley: 'ring' } },
    '18': { arrivals: [[2, 82, 'ends'], [2, 72, 'sides'], [3, 83, 'ends'], [4, 96, 'sides', true], [4, 91, 'around']],
        duel: { opening: 60, rest: 15, volley: 'fan' } },
    '19': { arrivals: [[2, 80, 'sides'], [2, 70, 'ends'], [3, 82, 'around'], [4, 94, 'ends'], [4, 88, 'sides', true]],
        duel: { opening: 58, rest: 15, volley: 'ring' } },
    '20': { arrivals: [[2, 82, 'around'], [3, 104, 'ends'], [3, 83, 'sides'], [4, 96, 'around', true], [4, 89, 'around', true]],
        duel: { opening: 68, rest: 16 } },
};

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
        encounter: { enemyCap: 12, boss: 'supervisor', bossHp: 96, armorLine: true },
    },
    '04': {
        minutes: 7, intervals: [43, 40, 36, 34, 32],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler'],
            ['pursuer', 'crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler', 'armored'],
            ['turret', 'pursuer', 'crawler', 'armored', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 13, boss: 'elite', bossHp: 182 },
    },
    '05': {
        minutes: 7, intervals: [42, 38, 36, 33, 32],
        rosters: [
            ['crawler'], ['crawler', 'crawler', 'charger'],
            ['armored', 'crawler', 'turret', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'crawler'],
            ['armored', 'crawler', 'turret', 'pursuer', 'armored', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'gatekeeper', bossHp: 150 },
    },
    '06': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['reclaimer', 'crawler', 'crawler', 'crawler'],
            ['charger', 'reclaimer', 'crawler', 'turret', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'charger', 'crawler'],
        ],
        encounter: { enemyCap: 12, boss: 'elite', bossHp: 192 },
    },
    '07': {
        minutes: 6, intervals: [42, 40, 37, 34, 32],
        rosters: [
            ['crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'crawler', 'pursuer', 'crawler'],
            ['charger', 'turret', 'crawler', 'crawler'],
            ['charger', 'armored', 'turret', 'crawler', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 204 },
    },
    '08': {
        minutes: 7, intervals: [42, 38, 35, 33, 31],
        rosters: [
            ['crawler'], ['crawler', 'charger', 'crawler'],
            ['turret', 'crawler', 'crawler', 'pursuer'],
            ['reclaimer', 'crawler', 'turret', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'armored', 'pursuer', 'crawler', 'charger'],
        ],
        encounter: { enemyCap: 15, boss: 'elite', bossHp: 220 },
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
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 238 },
    },
    '10': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler', 'crawler', 'reclaimer', 'crawler'], ['charger', 'crawler', 'crawler', 'reclaimer', 'crawler'],
            ['reclaimer', 'crawler', 'charger', 'crawler'],
            ['reclaimer', 'crawler', 'turret', 'crawler', 'charger'],
            ['reclaimer', 'crawler', 'pursuer', 'crawler', 'charger', 'crawler', 'armored', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'tow', bossHp: 172 },
    },
    '11': {
        minutes: 6, intervals: [46, 42, 39, 36, 34],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'pursuer', 'crawler'],
            ['turret', 'crawler', 'pursuer', 'crawler'],
            ['jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 14, boss: 'elite', bossHp: 195 },
    },
    '12': {
        minutes: 7, intervals: [43, 39, 36, 33, 31],
        rosters: [
            ['ambusher', 'crawler', 'crawler', 'crawler'], ['ambusher', 'crawler', 'charger', 'crawler'],
            ['ambusher', 'crawler', 'armored', 'crawler'],
            ['ambusher', 'pursuer', 'crawler', 'ambusher', 'crawler'],
            ['ambusher', 'armored', 'crawler', 'turret', 'ambusher', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 218 },
    },
    '13': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['turret', 'crawler', 'crawler'],
            ['crawler', 'turret', 'crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 17, boss: 'elite', bossHp: 232, armorLine: true },
    },
    '14': {
        minutes: 7, intervals: [40, 37, 34, 32, 30],
        rosters: [
            ['crawler'], ['pursuer', 'crawler', 'crawler', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'pursuer', 'jammer', 'crawler', 'crawler'],
            ['armored', 'turret', 'pursuer', 'crawler', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 246, armorLine: true },
    },
    '15': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['jammer', 'crawler', 'crawler'],
            ['jammer', 'crawler', 'charger', 'crawler'],
            ['jammer', 'charger', 'crawler', 'ambusher', 'crawler'],
            ['jammer', 'ambusher', 'armored', 'charger', 'turret', 'crawler', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'silence', bossHp: 185 },
    },
    '16': {
        minutes: 6, intervals: [44, 40, 37, 34, 32],
        rosters: [
            ['charger', 'crawler', 'crawler', 'crawler'], ['crawler', 'pursuer', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'turret', 'charger', 'crawler', 'crawler'],
            ['armored', 'turret', 'crawler', 'pursuer', 'charger', 'crawler'],
        ],
        encounter: { enemyCap: 16, boss: 'elite', bossHp: 226, armorLine: true },
    },
    '17': {
        minutes: 7, intervals: [42, 38, 35, 32, 30],
        rosters: [
            ['crawler'], ['crawler', 'crawler', 'reclaimer', 'crawler', 'crawler'],
            ['reclaimer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'pursuer', 'crawler', 'jammer', 'crawler'],
            ['reclaimer', 'armored', 'jammer', 'crawler', 'pursuer', 'crawler'],
        ],
        encounter: { enemyCap: 18, boss: 'elite', bossHp: 242 },
    },
    '18': {
        minutes: 7, intervals: [40, 37, 34, 31, 29],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['crawler', 'pursuer', 'crawler', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'crawler', 'turret', 'crawler'],
            ['armored', 'jammer', 'turret', 'crawler', 'pursuer', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 19, boss: 'elite', bossHp: 258, armorLine: true },
    },
    '19': {
        minutes: 7, intervals: [40, 36, 33, 30, 28],
        rosters: [
            ['crawler', 'pursuer', 'crawler'], ['charger', 'crawler', 'crawler'],
            ['charger', 'pursuer', 'crawler', 'crawler'],
            ['charger', 'turret', 'crawler', 'jammer', 'crawler'],
            ['armored', 'pursuer', 'turret', 'crawler', 'charger', 'jammer', 'crawler'],
        ],
        encounter: { enemyCap: 20, boss: 'elite', bossHp: 276 },
    },
    '20': {
        minutes: 8, intervals: [42, 38, 34, 31, 29],
        rosters: [
            ['crawler', 'jammer', 'crawler'], ['crawler', 'charger', 'crawler', 'crawler', 'reclaimer'],
            ['pursuer', 'crawler', 'turret', 'crawler', 'armored'],
            ['reclaimer', 'jammer', 'crawler', 'turret', 'pursuer', 'crawler'],
            ['armored', 'jammer', 'pursuer', 'reclaimer', 'crawler', 'turret', 'crawler'],
        ],
        encounter: { enemyCap: 20, boss: 'core', bossHp: 232 },
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
