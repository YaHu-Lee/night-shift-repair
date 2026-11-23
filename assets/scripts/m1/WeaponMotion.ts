import type { CombatBounds } from './content';
import type { Position } from './Encounter';

export const FLOATING_WEAPON_LIMIT = 6;
export const WEAPON_ORBIT_HEIGHT = 19;
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

export function weaponDock(slot: number, count: number, ticks: number): Readonly<Position> {
    const turn = Math.PI + 2 * Math.PI * (slot / Math.max(1, count) - ticks / 390);
    return { x: 37 * Math.cos(turn), y: WEAPON_ORBIT_HEIGHT + 34 * Math.sin(turn) };
}

const swings = {
    wrench: [
        { action: '横扫', track: [[9, -14], [29, -27], [44, -15], [45, 5], [32, 25], [12, 13]] },
        { action: '直刺', track: [[8, -6], [23, -6], [36, -3], [46, 0], [42, 6]] },
    ],
    bypass_wrench: [
        { action: '反手钩扫', track: [[9, 15], [27, 27], [40, 16], [41, -7], [26, -27], [10, -12]] },
        { action: '压击', track: [[13, 4], [24, 5], [36, 1], [42, -5], [35, -12]] },
    ],
} as const satisfies Record<MeleeTool, readonly { action: string; track: Track }[]>;

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
    ux: number, uy: number, range: number, field: CombatBounds): MeleeMotion {
    const spec = MELEE_TOOL_STATS[tool];
    const { action, track } = swings[tool][sequence % swings[tool].length];
    const scale = range / spec.reach;
    if (ux === 0 && uy === 0) ux = 1;
    const path = track.map(([x, y]) => ({ x: (ux * x - uy * y) * scale, y: (uy * x + ux * y) * scale }));
    const entry = path[0];
    const offsets = [dock, { x: (dock.x + entry.x) / 2, y: (dock.y + entry.y) / 2 }, ...path];
    const motion = {
        action, radius: spec.radius, range,
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
