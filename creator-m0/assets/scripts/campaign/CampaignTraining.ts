import { isTool, TICK_RATE } from '../m1/content';
import type { ToolId } from '../m1/content';
import type { AttachmentId } from '../m1/Equipment';

type WeaponRank = 1 | 2 | 3;
type RoleRank = 1 | 2;

interface WeaponTraining {
    readonly rank: WeaponRank;
    readonly starterAttachment?: AttachmentId;
}

export const WORKSHOP_STARTER_MILESTONES = [
    { stage: '02', tool: 'riveter' },
    { stage: '05', tool: 'torch' },
    { stage: '10', tool: 'induction' },
] as const satisfies readonly { stage: string; tool: ToolId }[];

export const WEAPON_TRAINING: Readonly<Record<ToolId, { reach: number; interval: number }>> = {
    wrench: { reach: 8, interval: 1 },
    arc_gun: { reach: 9, interval: 1 },
    riveter: { reach: 10, interval: 1 },
    torch: { reach: 6, interval: 1 },
    induction: { reach: 6, interval: 2 },
    hydraulic_nailer: { reach: 10, interval: 2 },
    pulse_nozzle: { reach: 6, interval: 1 },
    traction_coil: { reach: 7, interval: 2 },
    split_probe: { reach: 9, interval: 1 },
    bypass_wrench: { reach: 6, interval: 1 },
};

const WEAPON_PRICES = [6, 12, 20] as const;
const ROLE_PRICES = [6, 12] as const;
export const ROLE_TRAINING = {
    vitality: { title: '体能', stat: '体力上限', step: 1, unit: '' },
    mobility: { title: '步法', stat: '移动速度', step: 5, unit: '%' },
    collection: { title: '回收', stat: '拾取范围', step: 10, unit: '%' },
} as const;
export type TrainingTrack = keyof typeof ROLE_TRAINING;

export interface TrainingProgress {
    readonly weapons: Readonly<Partial<Record<ToolId, WeaponTraining>>>;
    readonly roles: Readonly<Partial<Record<TrainingTrack, RoleRank>>>;
}

interface TrainingOffer {
    readonly price: number;
    readonly detail: string;
}

export interface WeaponTrainingView {
    readonly rank: 0 | WeaponRank;
    readonly reachBonus: number;
    readonly intervalReduction: number;
    readonly starterAttachment: AttachmentId | null;
    readonly starterAttachments: readonly AttachmentId[];
    readonly next: TrainingOffer | null;
}

export interface RoleTrainingView {
    readonly title: string;
    readonly rank: 0 | RoleRank;
    /** Hit points or whole percentage points, as displayed in the workshop. */
    readonly bonus: number;
    readonly next: TrainingOffer | null;
}

export const NO_TRAINING: TrainingProgress = Object.freeze({ weapons: Object.freeze({}), roles: Object.freeze({}) });

function record(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isTrainingTrack(value: unknown): value is TrainingTrack {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(ROLE_TRAINING, value);
}

export function signatureAttachment(tool: ToolId): AttachmentId { return `${tool}/signature`; }

export function validTraining(value: unknown): value is TrainingProgress {
    if (!record(value) || !record(value.weapons) || !record(value.roles)
        || Object.keys(value).length !== 2) return false;
    return Object.entries(value.roles).every(([track, rank]) => isTrainingTrack(track) && (rank === 1 || rank === 2))
        && Object.entries(value.weapons).every(([tool, weapon]) => isTool(tool) && record(weapon)
            && (weapon.rank === 1 || weapon.rank === 2 || weapon.rank === 3)
            && Object.keys(weapon).every(key => key === 'rank' || key === 'starterAttachment')
            && (weapon.starterAttachment === undefined
                || (weapon.rank === 3 && weapon.starterAttachment === signatureAttachment(tool))));
}

export function freezeTraining(training: TrainingProgress): TrainingProgress {
    const weapons = Object.fromEntries(Object.entries(training.weapons)
        .map(([tool, weapon]) => [tool, Object.freeze({ ...weapon })]));
    return Object.freeze({ weapons: Object.freeze(weapons), roles: Object.freeze({ ...training.roles }) });
}

export function weaponTrainingView(training: TrainingProgress, tool: ToolId, unlocked: boolean): WeaponTrainingView {
    const trained = unlocked ? training.weapons[tool] : undefined;
    const rank = trained?.rank ?? 0;
    const starter = WEAPON_TRAINING[tool];
    const details = [
        `射程 +${starter.reach}`,
        `攻击间隔 −${Math.round(starter.interval * 1000 / TICK_RATE)} 毫秒`,
        '解锁专属配件，可在出勤前装上',
    ];
    return {
        rank,
        reachBonus: rank >= 1 ? starter.reach : 0,
        intervalReduction: rank >= 2 ? starter.interval : 0,
        starterAttachment: trained?.starterAttachment ?? null,
        starterAttachments: rank === 3 ? [signatureAttachment(tool)] : [],
        next: unlocked && rank !== 3 ? { price: WEAPON_PRICES[rank], detail: details[rank] } : null,
    };
}

export function roleTrainingView(training: TrainingProgress, track: TrainingTrack): RoleTrainingView {
    const rank = training.roles[track] ?? 0;
    const { title, stat, step, unit } = ROLE_TRAINING[track];
    return { title, rank, bonus: rank * step,
        next: rank !== 2 ? { price: ROLE_PRICES[rank], detail: `${stat} +${(rank + 1) * step}${unit}` } : null,
    };
}
