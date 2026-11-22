import { Material, Mesh, MeshRenderer, Node, utils } from 'cc';
import type { ModId } from '../m1/content';
import type { BlueprintId } from '../m1/Encounter';

export const ITEM_MODEL_KEYS = [
    'contact', 'splitter', 'ring', 'coil', 'exchanger', 'valve',
    'relay', 'sweeper', 'ceramic', 'bearings', 'plate', 'sorter',
    'scrap', 'magnetic_pickup_arm', 'narrow_beam_clamp', 'quick_release_heatsink',
] as const satisfies readonly (ModId | BlueprintId | 'scrap')[];
export type ItemModelId = typeof ITEM_MODEL_KEYS[number];

export function isItemModel(key: string): key is ItemModelId {
    return Object.prototype.hasOwnProperty.call(builders, key);
}

type Point = readonly [number, number, number];
type Plane = readonly [Point, Point];
const X: Point = [1, 0, 0];
const Y: Point = [0, 1, 0];
const Z: Point = [0, 0, 1];
const TURN = 2 * Math.PI;
const paint = {
    brass: 0xcf9848, brassDark: 0x755131, gold: 0xedbb66,
    copper: 0xb8683b, copperLit: 0xe48c51, amber: 0xf1bb53,
    steel: 0xa3aeb1, steelDark: 0x4a5961, rubber: 0x222f37, seam: 0x29353a,
    teal: 0x4a8b8d, tealDark: 0x2b5c67, glass: 0x76c6d5, cyan: 0x80f4ed,
    green: 0x608f6d, greenDark: 0x345746, winding: 0x51ae70, red: 0xb94027,
    safety: 0xe5aa38, porcelain: 0xe9ddbb, warmWhite: 0xf5e7c9,
} as const;

function plus(a: Point, b: Point): Point { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function minus(a: Point, b: Point): Point { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function times(a: Point, scale: number): Point { return [a[0] * scale, a[1] * scale, a[2] * scale]; }
function cross(a: Point, b: Point): Point {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Point, b: Point): number { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function normalized(a: Point): Point { return times(a, 1 / Math.hypot(...a)); }

function plane(axis: Point): Plane {
    const ref = Math.abs(axis[0]) < 0.9 ? X : Y;
    const tangent = normalized(minus(ref, times(axis, dot(ref, axis))));
    return [tangent, cross(axis, tangent)];
}

function radial(center: Point, basis: Plane, radius: number, angle: number): Point {
    return plus(center, plus(times(basis[0], radius * Math.cos(angle)), times(basis[1], radius * Math.sin(angle))));
}

/** Original solid item models authored against the project's workshop icon subjects. */
class ItemGeometry {
    private readonly positions: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    face(points: readonly Point[], color: number): void {
        const normal = cross(minus(points[1], points[0]), minus(points[2], points[0]));
        const length = Math.hypot(...normal);
        if (length < 1e-9) return;
        const unit = times(normal, 1 / length);
        const key = Math.max(0, dot(unit, [0.45, 0.83, 0.32]));
        const fill = Math.max(0, dot(unit, [-0.78, 0.12, 0.61]));
        const light = 0.54 + 0.42 * key + 0.14 * fill;
        const red = Math.min(1, ((color >>> 16) & 255) / 255 * light);
        const green = Math.min(1, ((color >>> 8) & 255) / 255 * (light + fill * 0.025));
        const blue = Math.min(1, (color & 255) / 255 * (light + fill * 0.09));
        const start = this.positions.length / 3;
        for (const point of points) {
            this.positions.push(...point);
            this.colors.push(red, green, blue, 1);
        }
        for (let i = 1; i + 1 < points.length; i++) this.indices.push(start, start + i, start + i + 1);
    }

    box(center: Point, size: Point, color: number, bevel = 0.025, yaw = 0): void {
        const [a, h, b] = times(size, 0.5);
        const corner = Math.min(a * 0.45, b * 0.45, bevel);
        const inset = Math.min(corner * 0.65, h * 0.45);
        const profile = [
            [-a + corner, b], [a - corner, b], [a, b - corner], [a, -b + corner],
            [a - corner, -b], [-a + corner, -b], [-a, -b + corner], [-a, b - corner],
        ];
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const ring = (y: number, offset: number): Point[] => profile.map(([x, z]) => {
            const u = x * (a - offset) / a, v = z * (b - offset) / b;
            return plus(center, [cos * u - sin * v, y, sin * u + cos * v]);
        });
        const bottom = ring(-h, inset);
        const lower = ring(-h + inset, 0);
        const upper = ring(h - inset, 0);
        const top = ring(h, inset);
        this.join(bottom, lower, color);
        this.join(lower, upper, color);
        this.join(upper, top, color);
        this.face(top, color);
        this.face(bottom.reverse(), color);
    }

    cylinder(from: Point, to: Point, radius: number, color: number, sides = 12, tipRadius = radius): void {
        const basis = plane(normalized(minus(to, from)));
        const ring = (center: Point, r: number) => Array.from({ length: sides }, (_, i) => radial(center, basis, r, TURN * i / sides));
        const back = ring(from, radius), front = ring(to, tipRadius);
        this.join(back, front, color);
        this.face(front, color);
        this.face(back.reverse(), color);
    }

    ring(center: Point, axis: Point, inner: number, outer: number, depth: number,
        color: number, sides = 20, start = 0, sweep = TURN): void {
        const basis = plane(axis);
        const back = plus(center, times(axis, -depth * 0.5)), front = plus(center, times(axis, depth * 0.5));
        const closed = Math.abs(sweep - TURN) < 1e-8;
        const points = (origin: Point, radius: number) => Array.from({ length: sides + (closed ? 0 : 1) },
            (_, i) => radial(origin, basis, radius, start + sweep * i / sides));
        const a = points(back, outer), b = points(front, outer), c = points(back, inner), d = points(front, inner);
        for (let i = 0; i < sides; i++) {
            const n = (i + 1) % a.length;
            this.face([a[i], a[n], b[n], b[i]], color);
            this.face([c[n], c[i], d[i], d[n]], color);
            this.face([d[i], b[i], b[n], d[n]], color);
            this.face([c[n], a[n], a[i], c[i]], color);
        }
        if (!closed) {
            this.face([c[0], a[0], b[0], d[0]], color);
            this.face([a[sides], c[sides], d[sides], b[sides]], color);
        }
    }

    ball(center: Point, radius: number, color: number): void {
        const basis = plane(Y);
        const sides = 8, rings = 4;
        const lower = plus(center, [0, -radius, 0]), upper = plus(center, [0, radius, 0]);
        let previous: Point[] = [];
        for (let step = 1; step < rings; step++) {
            const latitude = (step / rings - 0.5) * Math.PI;
            const origin = plus(center, [0, radius * Math.sin(latitude), 0]);
            const ring = Array.from({ length: sides }, (_, i) => radial(origin, basis, radius * Math.cos(latitude), TURN * i / sides));
            if (step === 1) {
                for (let i = 0; i < sides; i++) this.face([lower, ring[(i + 1) % sides], ring[i]], color);
            } else this.join(previous, ring, color);
            previous = ring;
        }
        for (let i = 0; i < sides; i++) this.face([previous[i], previous[(i + 1) % sides], upper], color);
    }

    private join(back: readonly Point[], front: readonly Point[], color: number): void {
        for (let i = 0; i < back.length; i++) {
            const next = (i + 1) % back.length;
            this.face([back[i], back[next], front[next], front[i]], color);
        }
    }

    mesh(size = 1, ground = false): Mesh {
        const low = [Infinity, Infinity, Infinity], high = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < this.positions.length; i++) {
            const axis = i % 3, value = this.positions[i];
            low[axis] = Math.min(low[axis], value);
            high[axis] = Math.max(high[axis], value);
        }
        const center = low.map((value, axis) => (value + high[axis]) * 0.5);
        if (ground) center[1] = low[1];
        const scale = size / Math.max(...high.map((value, axis) => value - low[axis]));
        const positions = this.positions.map((value, i) => (value - center[i % 3]) * scale);
        return utils.createMesh({ positions, colors: this.colors, indices: this.indices }, undefined, { calculateBounds: true });
    }
}

function contact(g: ItemGeometry): void {
    g.box([-0.13, -0.036, 0], [0.52, 0.255, 0.67], paint.tealDark, 0.085);
    g.box([-0.14, 0.085, 0], [0.495, 0.13, 0.605], paint.teal, 0.075);
    g.ring([-0.42, 0.012, 0], Y, 0.1, 0.18, 0.117, paint.steelDark, 12);
    g.ring([-0.42, 0.075, 0], Y, 0.108, 0.146, 0.023, paint.steel, 12);
    for (const z of [-0.157, 0.157]) {
        g.box([0.15, -0.024, z], [0.24, 0.128, 0.209], paint.rubber, 0.035);
        g.box([0.34, -0.024, z], [0.38, 0.074, 0.124], paint.copperLit, 0.028);
        g.cylinder([0.414, 0.014, z], [0.414, 0.026, z], 0.03, paint.brassDark, 8);
        g.cylinder([-0.12, 0.142, z], [-0.12, 0.178, z], 0.063, paint.brass, 8);
        g.box([-0.12, 0.18, z], [0.045, 0.009, 0.009], paint.brassDark, 0.003);
    }
}

function splitter(g: ItemGeometry): void {
    g.cylinder([0, -0.44, 0], [0, -0.17, 0], 0.10, paint.brass);
    g.cylinder([0, -0.34, 0], [0, -0.215, 0], 0.163, paint.gold, 6);
    g.ball([0, -0.09, 0], 0.162, paint.brass);
    for (const side of [-1, 0, 1]) {
        const end: Point = [Math.abs(side) * 0.036, side ? 0.29 : 0.43, side * 0.365];
        const shoulder: Point = [0, side ? 0.035 : 0.247, side * 0.235];
        g.cylinder([0, -0.11, side * 0.033], shoulder, 0.093, paint.brass);
        g.cylinder(shoulder, end, 0.091, paint.gold);
        g.cylinder([end[0], end[1] - 0.062, end[2]], end, 0.114, paint.brassDark, 8);
        g.cylinder(end, plus(end, [0, 0.053, 0]), 0.073, paint.steelDark, 10);
        g.cylinder(plus(end, [0, 0.048, 0]), plus(end, [0, 0.096, 0]), 0.052, paint.cyan, 8, 0.043);
    }
}

function pickupRing(g: ItemGeometry): void {
    const start = 0.76, sweep = TURN - start * 2;
    g.ring([0, -0.025, 0], Y, 0.285, 0.496, 0.254, paint.greenDark, 22, start, sweep);
    g.ring([0, 0.111, 0], Y, 0.315, 0.481, 0.045, paint.green, 22, start, sweep);
    for (const z of [-0.284, 0.284]) {
        g.box([0.354, -0.028, z], [0.247, 0.25, 0.19], paint.steelDark, 0.042);
        g.box([0.452, -0.024, z], [0.061, 0.224, 0.164], paint.steel, 0.008);
        g.cylinder([0.344, 0.089, z], [0.344, 0.12, z], 0.039, paint.gold, 8);
    }
    g.box([-0.383, 0.095, 0], [0.25, 0.161, 0.31], paint.brassDark, 0.045);
    for (let i = -3; i <= 3; i++) {
        g.box([-0.388, 0.183, i * 0.037], [0.232, 0.054, 0.020], i % 2 ? paint.copperLit : paint.copper, 0.008);
    }
}

function coil(g: ItemGeometry): void {
    g.ring([0, 0, 0], Y, 0.103, 0.219, 0.758, paint.greenDark);
    for (const y of [-0.365, 0.365]) {
        g.ring([0, y, 0], Y, 0.105, 0.411, 0.10, paint.brass, 16);
        g.ring([0, y + 0.052, 0], Y, 0.12, 0.374, 0.029, paint.gold, 16);
        for (let i = 0; i < 4; i++) {
            const p = radial([0, y + 0.052, 0], plane(Y), 0.313, TURN * (i + 0.5) / 4);
            g.cylinder(p, plus(p, [0, 0.047, 0]), 0.061, paint.steelDark, 6);
        }
    }
    for (let i = 0; i < 9; i++) {
        const y = -0.276 + i * 0.069;
        g.ring([0, y, 0], Y, 0.201, i % 2 ? 0.313 : 0.299, 0.054, i % 3 ? paint.winding : paint.green, 18);
    }
}

function exchanger(g: ItemGeometry): void {
    g.box([-0.034, -0.015, 0], [0.296, 0.80, 0.78], paint.brassDark, 0.063);
    g.box([0.109, -0.013, 0], [0.059, 0.671, 0.659], paint.rubber, 0.028);
    for (const y of [-0.356, 0.351]) g.box([0.10, y, 0], [0.225, 0.102, 0.82], paint.copperLit, 0.032);
    for (const z of [-0.368, 0.368]) {
        g.box([0.12, 0, z], [0.163, 0.691, 0.089], paint.brass, 0.032);
        for (const y of [-0.28, 0.28]) g.cylinder([0.20, y, z], [0.229, y, z], 0.039, paint.steelDark, 8);
    }
    for (let i = -4; i <= 4; i++) {
        g.box([0.188, 0, i * 0.069], [0.125, 0.634, 0.035], i % 2 ? paint.copper : paint.copperLit, 0.011);
    }
    for (const side of [-1, 1]) {
        const y = side * 0.22;
        g.cylinder([-0.023, y, side * 0.33], [-0.023, y, side * 0.478], 0.094, paint.brassDark, 10);
        g.ring([-0.023, y, side * 0.471], Z, 0.049, 0.111, 0.080, paint.gold, 10);
    }
}

function valve(g: ItemGeometry): void {
    g.cylinder([0, -0.375, 0], [0, 0.145, 0], 0.211, paint.red);
    g.cylinder([0, -0.35, 0], [0, -0.273, 0], 0.259, paint.brassDark, 10);
    g.cylinder([0, 0.12, 0], [0, 0.247, 0], 0.126, paint.gold, 8);
    g.cylinder([0, 0.209, 0], [0, 0.39, 0], 0.064, paint.steelDark, 10);
    g.ring([0, 0.42, 0], Y, 0.225, 0.292, 0.075, paint.red, 18);
    const wheel = plane(Y);
    for (let i = 0; i < 5; i++) {
        g.cylinder([0, 0.414, 0], radial([0, 0.414, 0], wheel, 0.252, i * TURN / 5), 0.031, paint.red, 8);
    }
    g.cylinder([0, 0.385, 0], [0, 0.474, 0], 0.081, paint.gold, 8);
    for (const z of [-1, 1]) {
        g.cylinder([0, -0.137, z * 0.116], [0, -0.137, z * 0.377], 0.12, paint.red);
        g.ring([0, -0.137, z * 0.413], Z, 0.074, 0.145, 0.083, paint.brass, 12);
    }
    g.cylinder([0.04, -0.1, 0.18], [0.062, 0.107, 0.275], 0.072, paint.brass);
    g.cylinder([0.047, 0.238, 0.321], [0.166, 0.238, 0.321], 0.157, paint.brassDark, 18);
    g.cylinder([0.159, 0.238, 0.321], [0.202, 0.238, 0.321], 0.132, paint.warmWhite, 18);
    g.ring([0.202, 0.238, 0.321], X, 0.126, 0.156, 0.043, paint.gold, 18);
    g.cylinder([0.230, 0.239, 0.32], [0.230, 0.306, 0.370], 0.013, paint.red, 8);
    g.cylinder([0.215, 0.238, 0.321], [0.237, 0.238, 0.321], 0.022, paint.steelDark, 8);
}

function relay(g: ItemGeometry): void {
    g.box([0, -0.287, 0], [0.66, 0.16, 0.68], paint.tealDark, 0.055);
    g.box([-0.03, -0.169, 0], [0.573, 0.066, 0.59], paint.steelDark, 0.029);
    g.box([-0.251, 0.046, 0], [0.072, 0.458, 0.562], paint.tealDark, 0.028);
    for (const z of [-0.273, 0.273]) {
        g.box([-0.05, -0.04, z], [0.459, 0.443, 0.046], paint.teal, 0.016);
        g.box([0.235, 0.018, z], [0.056, 0.498, 0.052], paint.glass, 0.018);
        g.box([-0.025, 0.25, z], [0.563, 0.069, 0.06], paint.glass, 0.018);
        for (const x of [-0.20, 0.18]) {
            g.cylinder([x, -0.346, z * 0.78], [x, -0.529, z * 0.78], 0.042, paint.gold, 10);
        }
    }
    g.box([0.234, 0.255, 0], [0.065, 0.065, 0.57], paint.glass, 0.019);
    g.box([-0.192, 0.228, 0], [0.18, 0.058, 0.56], paint.teal, 0.017);
    g.cylinder([0.015, 0.032, -0.223], [0.015, 0.032, 0.223], 0.127, paint.brassDark);
    for (let i = -3; i <= 3; i++) {
        g.ring([0.015, 0.032, i * 0.045], Z, 0.117, 0.164, 0.033, i % 2 ? paint.copper : paint.copperLit, 14);
    }
    g.box([0.185, -0.125, 0], [0.165, 0.077, 0.149], paint.gold, 0.027);
    g.box([0.243, -0.079, 0], [0.062, 0.039, 0.103], paint.cyan, 0.019);
}

function sweeper(g: ItemGeometry): void {
    g.cylinder([-0.474, 0, 0], [0.483, 0, 0], 0.088, paint.steel);
    g.cylinder([-0.329, 0, 0], [0.329, 0, 0], 0.269, paint.greenDark, 16);
    for (const x of [-0.352, 0.352]) {
        g.ring([x, 0, 0], X, 0.083, 0.221, 0.071, paint.brass, 14);
        g.ring([x * 1.088, 0, 0], X, 0.092, 0.151, 0.035, paint.brassDark, 12);
    }
    const basis = plane(X);
    for (let band = 0; band < 5; band++) {
        const x = -0.259 + band * 0.129;
        for (let i = 0; i < 10; i++) {
            const angle = TURN * (i + (band % 2) * 0.52) / 10;
            const matrix = (u: number, a: number, radius: number) => radial([u, 0, 0], basis, radius, a);
            const lug = [
                matrix(x - 0.058, angle - 0.07, 0.265), matrix(x + 0.007, angle - 0.245, 0.265),
                matrix(x + 0.058, angle + 0.07, 0.265), matrix(x - 0.007, angle + 0.245, 0.265),
            ];
            const tread = [
                matrix(x - 0.042, angle - 0.04, 0.312), matrix(x + 0.006, angle - 0.181, 0.312),
                matrix(x + 0.042, angle + 0.04, 0.312), matrix(x - 0.006, angle + 0.181, 0.312),
            ];
            lug.reverse();
            tread.reverse();
            for (let j = 0; j < 4; j++) g.face([lug[j], lug[(j + 1) % 4], tread[(j + 1) % 4], tread[j]], paint.greenDark);
            g.face(tread, i % 3 ? paint.green : paint.winding);
        }
    }
}

function ceramic(g: ItemGeometry): void {
    g.ring([0.035, 0, 0], X, 0.185, 0.238, 0.76, paint.copper, 18);
    for (const x of [-0.225, 0, 0.225]) {
        g.ring([x, 0, 0], X, 0.222, 0.324, 0.20, paint.porcelain, 16);
        g.ring([x + 0.081, 0, 0], X, 0.233, 0.332, 0.035, paint.warmWhite, 16);
    }
    for (const x of [-0.117, 0.117]) {
        g.ring([x, 0, 0], X, 0.274, 0.337, 0.052, paint.steelDark, 16);
        const bolt = radial([x, 0, 0], plane(X), 0.319, TURN * 0.155);
        g.cylinder(bolt, plus(bolt, [0, 0.034, 0.037]), 0.026, paint.gold, 6);
    }
    g.ring([0.365, 0, 0], X, 0.178, 0.233, 0.098, paint.copperLit, 18);
    g.ring([0.403, 0, 0], X, 0.182, 0.214, 0.019, paint.amber, 18);
}

function bearings(g: ItemGeometry): void {
    g.ring([0, 0, 0], X, 0.35, 0.48, 0.235, paint.brassDark, 24);
    g.ring([0.116, 0, 0], X, 0.388, 0.468, 0.039, paint.gold, 24);
    g.ring([-0.116, 0, 0], X, 0.391, 0.468, 0.039, paint.brass, 24);
    g.ring([0, 0, 0], X, 0.158, 0.268, 0.226, paint.brassDark, 24);
    g.ring([0.11, 0, 0], X, 0.174, 0.25, 0.04, paint.gold, 24);
    g.ring([0, 0, 0], X, 0.264, 0.406, 0.10, paint.rubber, 24);
    for (let i = 0; i < 9; i++) {
        g.ball(radial([0.074, 0, 0], plane(X), 0.324, TURN * (i + 0.2) / 9), 0.062, paint.steel);
    }
}

function plate(g: ItemGeometry): void {
    const center: Point = [-0.43, 0, 0];
    g.ring(center, Z, 0.625, 0.735, 0.80, paint.steelDark, 18, -0.65, 1.3);
    g.ring(center, Z, 0.711, 0.782, 0.665, paint.safety, 18, -0.585, 1.17);
    g.ring(center, Z, 0.775, 0.813, 0.052, paint.gold, 18, -0.55, 1.1);
    const basis = plane(Z);
    for (const angle of [-0.48, 0.48]) for (const z of [-0.25, 0.26]) {
        const front = radial([-0.43, 0, z], basis, 0.774, angle);
        g.cylinder(front, radial([-0.43, 0, z], basis, 0.824, angle), 0.059, paint.steel, 10, 0.044);
    }
}

function gear(g: ItemGeometry, center: Point, radius: number, color: number): void {
    g.ring(center, Z, radius * 0.34, radius * 0.92, 0.065, color, 16);
    for (let i = 0; i < 10; i++) {
        const angle = TURN * i / 10;
        const tooth = radial(center, plane(Z), radius * 0.94, angle);
        const axis: Point = [Math.cos(angle), Math.sin(angle), 0];
        g.cylinder(tooth, plus(tooth, times(axis, radius * 0.26)), radius * 0.19, color, 4);
    }
    g.ring(plus(center, [0, 0, 0.041]), Z, radius * 0.19, radius * 0.45, 0.023, paint.steelDark, 10);
}

function sorter(g: ItemGeometry): void {
    const frame = (x: number, y: number, z: number): Point[] => [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]];
    const lower = frame(0.249, -0.29, 0.238), upper = frame(0.461, 0.324, 0.377);
    const lowerIn = frame(0.192, -0.251, 0.181), upperIn = frame(0.405, 0.324, 0.323);
    for (let i = 0; i < 4; i++) {
        const n = (i + 1) % 4;
        g.face([lower[i], lower[n], upper[n], upper[i]], paint.safety);
        g.face([lowerIn[n], lowerIn[i], upperIn[i], upperIn[n]], paint.brassDark);
        g.face([upperIn[i], upper[i], upper[n], upperIn[n]], paint.gold);
    }
    g.face(lowerIn, paint.rubber);
    g.face(lower.reverse(), paint.brassDark);
    for (const z of [-0.371, 0.371]) g.box([0, 0.32, z], [0.971, 0.061, 0.057], paint.gold, 0.021);
    for (const x of [-0.456, 0.456]) g.box([x, 0.32, 0], [0.056, 0.061, 0.694], paint.gold, 0.021);
    g.box([-0.052, -0.301, 0], [0.528, 0.102, 0.55], paint.brassDark, 0.038);
    g.face([[0.171, -0.258, 0.158], [0.495, -0.442, 0.158], [0.495, -0.442, -0.158], [0.171, -0.258, -0.158]], paint.steelDark);
    for (const z of [-0.162, 0.162]) {
        const a: Point = [0.179, -0.199, z], b: Point = [0.493, -0.384, z];
        g.cylinder(a, b, 0.041, paint.brass, 4);
    }
    gear(g, [0.075, 0.011, 0.355], 0.138, paint.steel);
    gear(g, [-0.142, -0.136, 0.311], 0.111, paint.brass);
}

function scrap(g: ItemGeometry): void {
    g.cylinder([0, -0.22, 0], [0, -0.095, 0], 0.435, paint.tealDark, 6, 0.5);
    g.cylinder([0, -0.095, 0], [0, 0.086, 0], 0.5, paint.steel, 6, 0.438);
    g.cylinder([0, 0.084, 0], [0, 0.11, 0], 0.362, paint.tealDark, 6);
    g.ring([0, 0.127, 0], Y, 0.177, 0.309, 0.065, paint.cyan, 6);
}

function pickupArm(g: ItemGeometry): void {
    g.box([-0.42, -0.02, 0], [0.28, 0.3, 0.48], paint.tealDark, 0.047);
    g.box([-0.39, 0.124, 0], [0.27, 0.088, 0.406], paint.steel, 0.04);
    const shoulder: Point = [-0.42, 0.06, 0], elbow: Point = [-0.077, 0.3, 0], wrist: Point = [0.306, 0.12, 0];
    for (const z of [-0.13, 0.13]) {
        for (const [a, b] of [[shoulder, elbow], [elbow, wrist]]) {
            g.cylinder(plus(a, [0, 0, z]), plus(b, [0, 0, z]), 0.078, paint.brass, 6, 0.06);
        }
    }
    for (const pivot of [shoulder, elbow, wrist]) {
        g.cylinder(plus(pivot, [0, 0, -0.185]), plus(pivot, [0, 0, 0.185]), 0.098, paint.steelDark, 10);
        for (const side of [-1, 1]) {
            g.cylinder(plus(pivot, [0, 0, side * 0.182]), plus(pivot, [0, 0, side * 0.206]), 0.055, paint.steel, 8);
        }
    }
    g.cylinder([-0.36, 0.011, 0], [-0.137, 0.172, 0], 0.043, paint.rubber, 8);
    g.cylinder([-0.203, 0.115, 0], [0.059, 0.24, 0], 0.027, paint.steel, 8);
    g.ring([0.335, 0.027, 0], Y, 0.116, 0.252, 0.115, paint.teal, 14, 0.68, TURN - 1.36);
    for (const z of [-0.133, 0.133]) g.box([0.47, 0.028, z], [0.153, 0.132, 0.123], paint.cyan, 0.028);
}

function beamClamp(g: ItemGeometry): void {
    g.box([-0.152, -0.041, 0], [0.552, 0.249, 0.47], paint.tealDark, 0.053);
    g.box([-0.167, 0.097, 0], [0.47, 0.097, 0.371], paint.porcelain, 0.04);
    g.cylinder([-0.423, -0.007, 0], [-0.28, -0.007, 0], 0.16, paint.steelDark, 10);
    g.cylinder([-0.5, -0.007, 0], [-0.395, -0.007, 0], 0.11, paint.steel, 8);
    for (const side of [-1, 1]) {
        const hinge: Point = [-0.013, 0.015, side * 0.197];
        const jaw: Point = [0.289, 0.062, side * 0.259];
        const tip: Point = [0.422, 0.117, side * 0.118];
        g.cylinder(hinge, jaw, 0.109, paint.copperLit, 6, 0.092);
        g.cylinder(jaw, tip, 0.092, paint.gold, 6, 0.071);
        g.box(plus(tip, [0.032, 0, 0]), [0.117, 0.102, 0.097], paint.steel, 0.023);
        g.cylinder(plus(hinge, [0, 0.085, 0]), plus(hinge, [0, 0.122, 0]), 0.069, paint.steelDark, 8);
    }
    g.box([-0.121, 0.151, 0], [0.189, 0.03, 0.082], paint.cyan, 0.015);
}

function releaseHeatsink(g: ItemGeometry): void {
    g.box([-0.005, -0.153, 0], [0.972, 0.169, 0.67], paint.steelDark, 0.068);
    g.box([-0.044, -0.047, 0], [0.845, 0.068, 0.642], paint.copper, 0.045);
    for (const x of [-0.351, -0.191, -0.031, 0.129, 0.289]) {
        g.box([x, 0.115, 0], [0.078, 0.267, 0.584], paint.steel, 0.022);
    }
    for (const z of [-0.289, 0.289]) {
        g.cylinder([-0.449, 0.105, z], [0.381, 0.105, z], 0.058, paint.copperLit, 8);
        g.cylinder([-0.467, 0.106, z], [-0.383, 0.106, z], 0.077, paint.brassDark, 8);
    }
    g.box([0.386, 0.05, 0], [0.251, 0.41, 0.288], paint.brassDark, 0.044);
    g.box([0.405, 0.224, 0], [0.235, 0.097, 0.405], paint.safety, 0.033);
    g.box([0.465, 0.269, 0], [0.095, 0.021, 0.237], paint.rubber, 0.01);
}

const builders: Record<ItemModelId, (g: ItemGeometry) => void> = {
    contact, splitter, ring: pickupRing, coil, exchanger, valve, relay, sweeper, ceramic, bearings, plate, sorter,
    scrap, magnetic_pickup_arm: pickupArm, narrow_beam_clamp: beamClamp, quick_release_heatsink: releaseHeatsink,
};

/** Keeps the spinning field pickup and the UI resource icon on the same source geometry. */
export function createFieldScrapMesh(): Mesh {
    const geometry = new ItemGeometry();
    scrap(geometry);
    return geometry.mesh(8.3, true);
}

export class PrototypeItemMeshes {
    private readonly meshes = new Map<ItemModelId, Mesh>();
    private readonly instances = new Set<Node>();
    private material?: Material;

    create(id: ItemModelId, parent: Node, layer: number): Node {
        let mesh = this.meshes.get(id);
        if (!mesh) {
            const geometry = new ItemGeometry();
            builders[id](geometry);
            mesh = geometry.mesh();
            this.meshes.set(id, mesh);
        }
        if (!this.material) {
            this.material = new Material();
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        }
        const node = new Node(id);
        node.layer = layer;
        parent.addChild(node);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(this.material, 0);
        this.instances.add(node);
        return node;
    }

    destroy(): void {
        for (const node of this.instances) if (node.isValid) node.destroy();
        this.instances.clear();
        for (const mesh of this.meshes.values()) mesh.destroy();
        this.meshes.clear();
        this.material?.destroy();
        this.material = undefined;
    }
}
