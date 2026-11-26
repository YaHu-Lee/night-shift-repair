import type { CombatBounds, Position } from './types';

export const FLOATING_WEAPON_LIMIT = 6;
export const MELEE_WINDUP_TICKS = 4;
export const MELEE_RETURN_TICKS = 4;
export const MELEE_TOOL_STATS = {
    wrench: { reach: 57, radius: 8 },
    bypass_wrench: { reach: 54, radius: 9 },
} as const;
export type MeleeTool = keyof typeof MELEE_TOOL_STATS;
type Track = readonly (readonly [forward: number, side: number])[];

export function isMeleeTool(id: string): id is MeleeTool {
    return id === 'wrench' || id === 'bypass_wrench';
}

// Feet are the actor origin. Centre the ring on the mechanic's torso.
export const WEAPON_RING_CENTER_Y = 20;
const gripRadii = [0, 0, 20, 26, 30, 33, 36];
const mountLayouts = Array.from({ length: FLOATING_WEAPON_LIMIT + 1 }, (_, count) =>
    Array.from({ length: count }, (_, slot) => {
        if (count === 1) return { grip: { x: -10, y: 21 }, head: { x: -23, y: 15 }, behind: false };
        const step = 2 * Math.PI / count;
        const start = count === 2 ? Math.PI : Math.PI / 2 + step;
        const angle = start - slot * step;
        const atRadius = (radius: number) => ({
            x: Math.round(radius * Math.cos(angle)) || 0,
            y: WEAPON_RING_CENTER_Y + Math.round(radius * Math.sin(angle)),
        });
        const grip = atRadius(gripRadii[count]);
        return { grip, head: atRadius(gripRadii[count] + 14), behind: grip.y > WEAPON_RING_CENTER_Y };
    }),
);

export function weaponMount(slot: number, count: number) {
    return mountLayouts[count][slot];
}

export function weaponDock(slot: number, count = FLOATING_WEAPON_LIMIT): Readonly<Position> {
    return weaponMount(slot, count).head;
}

const swings = {
    bypass_wrench: [
        { action: '反手钩扫', track: [[8, 18], [18, 28], [35, 25], [46, 8], [39, -12], [25, -20], [18, -12]] },
        { action: '压击', track: [[10, 17], [14, 23], [20, 22], [33, 10], [47, -2], [48, -5], [38, -4]] },
    ],
} as const satisfies Record<'bypass_wrench', readonly { action: string; track: Track }[]>;

function wrenchSwing(reverse: boolean, targetRange: number, range: number, wide: boolean): { action: string; track: Track } {
    const radius = Math.min(range * (reverse ? 0.88 : 0.9), Math.max(12, targetRange * 0.84 + 3));
    const width = wide ? 2.05 : reverse ? 0.97 : 1.16;
    const steps = wide ? 8 : reverse ? 5 : 6;
    const track = Array.from({ length: steps + 1 }, (_, index): readonly [number, number] => {
        const t = index / steps;
        const release = t * t * (3 - 2 * t);
        const angle = (reverse ? -1 : 1) * width * (2 * release - 1);
        const reach = radius * (0.92 + 0.08 * Math.sin(Math.PI * t));
        return [reach * Math.cos(angle), reach * Math.sin(angle)];
    });
    return { action: wide ? '大回扫' : reverse ? '反手扫' : '横扫', track };
}

export interface MeleeMotion {
    readonly action: string;
    readonly offsets: readonly Readonly<Position>[];
    /** Reached locations stay in world space. Future samples follow the player. */
    readonly points: Readonly<Position>[];
    /** Inclusive first and last sample indices of the active path. */
    readonly first: number;
    readonly last: number;
    readonly radius: number;
    readonly range: number;
}

export function createMeleeMotion(tool: MeleeTool, sequence: number, dock: Readonly<Position>, origin: Position,
    ux: number, uy: number, range: number, field: CombatBounds, targetRange = range, wide = false): MeleeMotion {
    const spec = MELEE_TOOL_STATS[tool];
    const { action, track } = tool === 'wrench' ? wrenchSwing(sequence % 2 === 1, targetRange, range, wide)
        : swings.bypass_wrench[sequence % swings.bypass_wrench.length];
    const scale = tool === 'wrench' ? 1 : range / spec.reach;
    if (ux === 0 && uy === 0) ux = 1;
    const path = track.map(([x, y]) => ({ x: (ux * x - uy * y) * scale, y: (uy * x + ux * y) * scale }));
    const entry = path[0];
    const restAngle = Math.atan2(dock.y, dock.x), entryAngle = Math.atan2(entry.y, entry.x);
    const turn = Math.atan2(Math.sin(entryAngle - restAngle), Math.cos(entryAngle - restAngle)) / 2;
    const shoulder = (Math.hypot(dock.x, dock.y) + Math.hypot(entry.x, entry.y)) / 2;
    const offsets = [dock, { x: Math.cos(restAngle + turn) * shoulder, y: Math.sin(restAngle + turn) * shoulder }, ...path];
    const motion = {
        action, radius: wide ? spec.radius + 5 : spec.radius, range,
        first: 2, last: path.length + 1,
        offsets, points: new Array<Readonly<Position>>(offsets.length),
    };
    updateMeleePath(motion, 0, origin, field);
    return motion;
}

export function updateMeleePath(motion: MeleeMotion, frame: number, player: Readonly<Position>, field: CombatBounds): void {
    for (let index = frame; index <= motion.last; index++) {
        const { x, y } = motion.offsets[index];
        motion.points[index] = {
            x: Math.max(field.left, Math.min(field.right, player.x + x)),
            y: Math.max(field.bottom, Math.min(field.top, player.y + y)),
        };
    }
}

/** Time interval during which a moving point lies inside a circle centered at the origin. */
export function circleContact(x: number, y: number, dx: number, dy: number,
    radius: number): readonly [enter: number, exit: number] | undefined {
    const speed = dx * dx + dy * dy;
    const start = x * x + y * y - radius * radius;
    if (speed < 1e-8) return start <= 0 ? [0, 1] : undefined;
    const projected = x * dx + y * dy;
    const discriminant = projected * projected - speed * start;
    if (discriminant < 0) return undefined;
    const root = Math.sqrt(discriminant);
    const enter = Math.max(0, (-projected - root) / speed);
    const exit = Math.min(1, (-projected + root) / speed);
    return enter <= exit ? [enter, exit] : undefined;
}

export function sampleMeleeHead(motion: MeleeMotion, age: number): Readonly<Position> {
    const last = motion.points.length - 1;
    const t = Math.max(0, Math.min(last, age));
    const index = Math.floor(t);
    const a = motion.points[index], b = motion.points[Math.min(last, index + 1)];
    return { x: a.x + (b.x - a.x) * (t - index), y: a.y + (b.y - a.y) * (t - index) };
}
