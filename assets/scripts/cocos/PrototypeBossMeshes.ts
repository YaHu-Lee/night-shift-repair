import { Material, Mesh, MeshRenderer, Node, utils } from 'cc';
import type { ChapterBossKind } from '../m1/Encounter';

export type PrototypeBossKind = ChapterBossKind | 'inspector';
export type PrototypeBossSkill = 'sweep' | 'charge' | 'summon' | 'rect' | 'sector' | 'tether' | 'offline' | 'critical';
type Pose = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'hit' | 'skill';
type Point = [number, number, number];

export interface PrototypeBossActor {
    readonly node: Node;
    setPose(pose: Pose, ageTicks: number, skill?: PrototypeBossSkill): void;
    setImpact(strength: number): void;
}

const rubber = 0x263038;
const shadow = 0x283239;
const iron = 0x414f59;
const steel = 0x788c91;
const edge = 0xb1bdb5;
const copper = 0x895333;
const enamel = 0xbc8345;
const gold = 0xeabe6f;
const red = 0xa55749;
const jade = 0x55998c;
const mint = 0xabe2bc;
const indigo = 0x546888;
const violet = 0xcd9ce7;
const charcoal = 0x354b4f;
const gunmetal = 0x536365;
const oxide = 0x4c7370;
const ceramic = 0xa7a898;
const contact = 0x6becb0;

function mix(a: Point, b: Point, t: number): Point {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function cross(a: Point, b: Point): Point {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function subtract(a: Point, b: Point): Point {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function unit(v: Point): Point {
    const length = Math.hypot(...v);
    return [v[0] / length, v[1] / length, v[2] / length];
}

// X faces forward, Y crosses the chassis and Z points up in the workshop artwork.
// The last step converts those axes to Creator's X forward, Y up, -Z across.
class MeshArt {
    private readonly positions: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    face(points: readonly Point[], tint: number): void {
        const normal = unit(cross(subtract(points[1], points[0]), subtract(points[2], points[0])));
        const key = -0.38 * normal[0] - 0.33 * normal[1] + 0.86 * normal[2];
        const light = 0.65 + Math.max(-0.27, key) * 0.35;
        const red = (tint >> 16) * light / 255;
        const green = (tint >> 8 & 255) * light / 255;
        const blue = (tint & 255) * light / 255;
        const first = this.positions.length / 3;
        for (const [x, y, z] of points) {
            this.positions.push(x, z, -y);
            this.colors.push(red, green, blue, 1);
        }
        for (let i = 1; i + 1 < points.length; i++) this.indices.push(first, first + i, first + i + 1);
    }

    private solid(bottom: Point[], top: Point[], tint: number): void {
        for (let i = 0; i < bottom.length; i++) {
            const next = (i + 1) % bottom.length;
            this.face([bottom[i], bottom[next], top[next], top[i]], tint);
        }
        this.face(top, tint);
        this.face(bottom.slice().reverse(), tint);
    }

    plate(x: number, y: number, z: number, w: number, d: number, h: number, color: number, chamfer = 1, taper = 0): void {
        const corners = (a: number, b: number, level: number): Point[] => {
            const cut = Math.min(chamfer, a * 0.45, b * 0.45);
            return [[a, -b + cut], [a, b - cut], [a - cut, b], [-a + cut, b],
                [-a, b - cut], [-a, -b + cut], [-a + cut, -b], [a - cut, -b]]
                .map(([dx, dy]) => [x + dx, y + dy, level]);
        };
        this.solid(corners(w / 2, d / 2, z), corners(w / 2 - taper, d / 2 - taper, z + h), color);
    }

    box(x: number, y: number, z: number, w: number, d: number, h: number, color: number): void {
        const a = w / 2, b = d / 2;
        const corners: Point[] = [[x + a, y - b, z], [x + a, y + b, z], [x - a, y + b, z], [x - a, y - b, z]];
        this.solid(corners, corners.map(([px, py]) => [px, py, z + h]), color);
    }

    pipe(from: Point, to: Point, radius: number, tint: number, sides = 10, tip = radius): void {
        const axis = unit(subtract(to, from));
        const u = unit(cross(Math.abs(axis[2]) > 0.9 ? [0, 1, 0] : [0, 0, 1], axis));
        const v = cross(axis, u);
        const ring = (pos: Point, size: number): Point[] => Array.from({ length: sides }, (_value, i) => {
            const theta = i * Math.PI * 2 / sides;
            return [
                pos[0] + size * (u[0] * Math.cos(theta) + v[0] * Math.sin(theta)),
                pos[1] + size * (u[1] * Math.cos(theta) + v[1] * Math.sin(theta)),
                pos[2] + size * (u[2] * Math.cos(theta) + v[2] * Math.sin(theta)),
            ];
        });
        this.solid(ring(from, radius), ring(to, tip), tint);
    }

    annulus(x: number, y: number, z: number, inner: number, outer: number, depth: number, tint: number,
        sectors = 20): void {
        const p = (n: number, r: number, h: number): Point => {
            const theta = n * 2 * Math.PI / sectors;
            return [x + Math.cos(theta) * r, y + Math.sin(theta) * r, z + h];
        };
        for (let i = 0; i < sectors; i++) {
            const j = i + 1;
            this.face([p(i, outer, depth), p(j, outer, depth), p(j, inner, depth), p(i, inner, depth)], tint);
            this.face([p(i, outer, 0), p(j, outer, 0), p(j, outer, depth), p(i, outer, depth)], tint);
            this.face([p(j, inner, 0), p(i, inner, 0), p(i, inner, depth), p(j, inner, depth)], tint);
        }
    }

    fasteners(z: number, locations: readonly [number, number][], tint = edge): void {
        for (const [x, y] of locations) this.pipe([x, y, z], [x, y, z + 0.6], 0.68, tint, 6);
    }

    mesh(): Mesh {
        return utils.createMesh({ positions: this.positions, colors: this.colors, indices: this.indices },
            undefined, { calculateBounds: true });
    }
}

interface BossPiece {
    readonly asset: Mesh;
    readonly anchor: Point;
}
type Design = Record<string, BossPiece>;

function piece(anchor: Point, draw: (art: MeshArt) => void): BossPiece {
    const art = new MeshArt();
    draw(art);
    return { asset: art.mesh(), anchor };
}

function roadGear(a: MeshArt, lateral: number, length: number): void {
    const axle = length * 0.37;
    for (const side of [-1, 1]) {
        const y = side * lateral;
        a.plate(0, y, 0, length, 7.8, 6.7, rubber, 2);
        a.plate(0, y, 1.2, length - 3, 8.1, 3.4, iron, 1.4);
        for (const x of [-axle, -axle / 3, axle / 3, axle]) {
            a.pipe([x, y + side * 3.9, 3.4], [x, y + side * 4.55, 3.4], 2.35, steel, 10);
            a.pipe([x, y + side * 4.55, 3.4], [x, y + side * 4.84, 3.4], 1.02, iron, 8);
        }
        for (let x = -length / 2 + 3; x < length / 2; x += 3.1) {
            a.box(x, y, 6.65, 1.72, 7.85, 0.48, steel);
        }
    }
    a.plate(0, 0, 1, length - 6, lateral * 2, 3.8, shadow, 2);
}

function chassis(a: MeshArt, length: number, width: number, paint: number, accent: number): void {
    a.plate(-0.5, 0, 4.8, length, width, 6.6, iron, 2.4, 0.7);
    a.plate(-1.5, 0, 10.4, length - 6, width - 4.4, 3.8, paint, 2.1, 0.6);
    for (const side of [-1, 1]) {
        const y = side * (width / 2 - 1);
        a.plate(-0.5, y, 8.8, length - 5, 2.8, 2.2, accent, 0.6);
        a.fasteners(10.9, [[-7.6, y], [6.8, y]], edge);
        a.box(-(length - 4) / 2, y * 0.52, 7.4, 2.5, 2.1, 1.2, red);
    }
}

function ventPack(a: MeshArt, x: number, y: number, z: number, tint: number): void {
    a.plate(x, y, z, 10.4, 8.8, 1.6, iron, 1.2);
    for (let i = -2; i <= 2; i++) a.box(x + i * 1.55, y, z + 1.58, 0.78, 6.8, 0.25, tint);
    a.fasteners(z + 1.58, [[x - 4.2, y - 3.6], [x + 4.2, y + 3.6]]);
}

function bearing(a: MeshArt, at: Point, height: number, radius: number, tint: number): void {
    const [x, y, z] = at;
    a.pipe(at, [x, y, z + height], radius, tint, 16, radius - 0.35);
    a.annulus(x, y, z + height, radius * 0.75, radius - 0.1, 0.55, edge, 16);
}

function sensor(a: MeshArt, x: number, y: number, z: number, tint: number): void {
    a.pipe([x - 2.9, y, z], [x + 0.7, y, z], 2.68, iron, 12, 2.37);
    a.pipe([x + 0.7, y, z], [x + 1.1, y, z], 2.03, steel, 12);
    a.pipe([x + 1.1, y, z], [x + 1.55, y, z], 1.54, tint, 12);
    a.box(x + 1.56, y, z + 0.12, 0.23, 0.88, 0.58, edge);
}

function beacon(tint: number): BossPiece {
    return piece([0, 0, 0], a => {
        a.annulus(0, 0, -0.4, 2.65, 3.75, 0.7, tint, 16);
        a.pipe([0, 0, -1.45], [0, 0, 2.1], 1.35, tint, 10, 0.65);
    });
}

function patrolChassis(): Design {
    const bronze = 0xa18056;
    return {
        base: piece([0, 0, 0], a => {
            roadGear(a, 11.3, 30.5);
            a.plate(-0.5, 0, 4.65, 30.4, 22.3, 4.8, gunmetal, 2.4, 0.52);
            a.plate(-3.1, 0, 9.1, 24.4, 21.0, 4.36, copper, 2.0, 0.46);
            a.plate(-3.1, 0, 13.36, 23.54, 20.12, 0.87, enamel, 1.98, 0.18);
            a.plate(9.88, 0, 5.15, 10.9, 17.84, 3.91, iron, 2.05, 0.44);
            a.plate(14.27, 0, 6.42, 3.53, 16.9, 1.45, enamel, 0.83, 0.2);
            a.plate(13.94, 0, 7.82, 1.93, 12.87, 0.48, steel, 0.6);
            for (const side of [-1, 1]) {
                const y = side * 9.0;
                a.plate(-8.76, y * 0.85, 13.6, 7.4, 3.95, 1.42, iron, 0.69, 0.24);
                for (const x of [-10.95, -9.42, -7.89, -6.36]) a.box(x, y * 0.85, 15.0, 0.77, 2.75, 0.21, gunmetal);
                a.pipe([-13.33, y, 9.15], [-10.6, y * 1.22, 9.15], 0.81, steel, 8);
                a.pipe([-10.6, y * 1.22, 9.15], [4.28, y * 1.22, 9.15], 0.81, steel, 8);
                a.pipe([4.28, y * 1.22, 9.15], [6.31, y, 9.77], 0.81, steel, 8);
                a.plate(8.8, y * 0.75, 8.56, 5.59, 4.11, 1.14, gunmetal, 0.75, 0.14);
                a.plate(9.9, y * 0.76, 9.27, 2.55, 2.15, 0.57, gold, 0.45, 0.13);
                a.fasteners(13.98, [[-12.4, y * 0.82], [3.6, y * 0.82]], steel);
            }
        }),
        head: piece([-0.4, 0, 13.94], a => {
            bearing(a, [-0.65, 0, -1.15], 1.65, 6.75, shadow);
            a.plate(-0.20, 0, 0, 14.7, 13.51, 4.43, enamel, 2.44, 0.67);
            a.plate(-1.9, 0, 4.35, 10.45, 10.45, 1.41, copper, 1.77, 0.21);
            a.plate(-2.98, 0, 5.73, 4.6, 7.39, 0.54, iron, 0.77, 0.12);
            a.plate(2.92, 0, 5.03, 4.85, 7.25, 0.83, gunmetal, 0.72, 0.13);
            a.fasteners(4.11, [[-3.2, -5.1], [-3.2, 5.1]], bronze);
            a.plate(5.5, 0, 2.0, 4.13, 7.55, 2.86, shadow, 0.99, 0.27);
        }),
        optics: piece([5.95, 0, 17.68], a => {
            a.pipe([-1.15, 0, -0.2], [0.1, 0, -0.2], 3.08, gunmetal, 14, 2.82);
            a.pipe([0.1, 0, -0.2], [2.15, 0, -0.2], 2.81, iron, 14, 2.16);
            a.pipe([1.95, 0, -0.2], [2.39, 0, -0.2], 2.18, bronze, 14);
            a.pipe([2.38, 0, -0.2], [2.58, 0, -0.2], 1.77, gold, 14);
            for (const y of [-2.1, 2.1]) a.plate(0.48, y, 1.96, 2.78, 1.18, 0.45, ceramic, 0.34);
            a.plate(-0.24, 0, 2.52, 2.98, 3.28, 0.53, gunmetal, 0.58, 0.13);
        }),
        transponder: piece([-5.17, 0, 19.37], a => {
            a.pipe([0, 0, -2.3], [0, 0, 2.75], 0.97, gunmetal, 10, 0.68);
            a.pipe([0, -3.11, 2.51], [0, 3.11, 2.51], 0.83, iron, 10);
            for (const y of [-2.86, 2.86]) {
                a.pipe([0, y, 2.5], [0.91, y, 4.3], 0.83, ceramic, 10, 0.65);
                a.pipe([0.91, y, 4.3], [1.05, y, 4.69], 0.74, gold, 10, 0.57);
            }
            a.plate(0.05, 0, 3.1, 2.68, 3.86, 0.7, bronze, 0.58, 0.14);
        }),
        weapon: piece([3.75, 0, 12.32], a => {
            for (const y of [-6.65, 6.65]) {
                a.plate(-1.08, y, -2.18, 8.45, 4.56, 4.37, gunmetal, 0.86, 0.23);
                a.plate(-1.22, y, 2.15, 6.51, 3.65, 0.81, enamel, 0.58, 0.18);
                a.pipe([1.68, y, 0], [10.3, y, 0], 1.07, iron, 12);
                a.pipe([3.15, y, 0], [8.9, y, 0], 1.42, steel, 12, 1.22);
                a.pipe([9.23, y, 0], [11.03, y, 0], 1.64, gunmetal, 12, 1.54);
                a.pipe([10.99, y, 0], [11.16, y, 0], 1.14, gold, 12, 0.98);
                a.fasteners(2.88, [[-2.2, y]], bronze);
            }
        }),
        light: beacon(gold),
    };
}

function plow(a: MeshArt, middleY: number, width: number, tint: number): void {
    const bottom: Point[] = [
        [5.4, middleY - width / 2, -2.2], [5.4, middleY + width / 2, -2.2],
        [-3.8, middleY + width / 2, -2.2], [-3.8, middleY - width / 2, -2.2],
    ];
    const top: Point[] = [
        [2.65, middleY - width * 0.45, 2.05], [2.65, middleY + width * 0.45, 2.05],
        [-3.4, middleY + width * 0.45, 2.05], [-3.4, middleY - width * 0.45, 2.05],
    ];
    a.face(top, tint);
    a.face(bottom.slice().reverse(), tint);
    for (let i = 0; i < bottom.length; i++) {
        const next = (i + 1) % bottom.length;
        a.face([bottom[i], bottom[next], top[next], top[i]], tint);
    }
}

function blockadeChassis(): Design {
    const armor = 0x75443e;
    const signal = 0xffa584;
    return {
        base: piece([0, 0, 0], a => {
            roadGear(a, 12.0, 32);
            a.plate(-1.15, 0, 4.63, 31.9, 23.9, 5.5, gunmetal, 2.46, 0.77);
            a.plate(-1.85, 0, 9.99, 28.2, 22.4, 3.66, armor, 2.68, 0.98);
            a.plate(-2.3, 0, 13.42, 25.8, 20.2, 0.84, red, 2.21, 0.18);
            a.plate(10.3, 0, 5.05, 14.9, 19.8, 3.53, iron, 3.0, 0.38);
            a.plate(13.8, 0, 6.55, 5.38, 16.4, 2.77, armor, 1.13, 0.48);
            for (const side of [-1, 1]) {
                const y = side * 10.65;
                a.plate(-2.05, y, 7.15, 25.1, 3.63, 3.6, armor, 0.94, 0.35);
                a.plate(0.15, y, 10.5, 17.23, 2.59, 0.8, red, 0.58, 0.15);
                a.fasteners(11.26, [[-6.35, y], [-0.65, y], [5.55, y]], steel);
                a.plate(-9.87, y * 0.74, 13.7, 9.21, 5.38, 4.48, iron, 0.96, 0.40);
                a.plate(-10.1, y * 0.74, 18.12, 6.42, 4.25, 0.62, gunmetal, 0.62, 0.15);
                for (const x of [-11.9, -10.1, -8.3]) {
                    a.plate(x, y * 0.74, 18.68, 1.05, 3.17, 0.36, copper, 0.32);
                }
                a.pipe([-8.22, y * 0.74, 15.2], [-5.35, y * 0.70, 14.1], 0.82, steel, 8);
                a.pipe([-5.35, y * 0.70, 14.1], [2.2, y * 0.70, 14.1], 0.82, steel, 8);
            }
        }),
        head: piece([0.5, 0, 13.78], a => {
            bearing(a, [-1.3, 0, -0.88], 1.52, 7.59, shadow);
            a.plate(0.77, 0, 0.30, 16.85, 15.31, 4.85, armor, 3.02, 1.02);
            a.plate(-0.4, 0, 5.06, 13.39, 12.52, 1.96, red, 2.14, 0.52);
            a.plate(-3.65, 0, 6.94, 5.9, 8.05, 0.73, gunmetal, 0.92, 0.13);
            for (const x of [-4.96, -3.57, -2.18]) a.box(x, 0, 7.63, 0.71, 6.26, 0.26, iron);
            a.plate(5.3, 0, 3.5, 5.52, 9.32, 2.16, gunmetal, 1.05, 0.35);
            a.plate(6.65, 0, 5.37, 2.1, 6.82, 0.62, iron, 0.48, 0.12);
            a.plate(7.04, 0, 5.94, 0.94, 4.62, 0.31, signal, 0.36, 0.08);
            a.fasteners(5.0, [[1.5, -5.87], [1.5, 5.87]], steel);
        }),
        weapon: piece([3.88, 0, 12.51], a => {
            for (const y of [-7.34, 7.34]) {
                a.plate(-0.86, y, -2.62, 9.27, 5.73, 4.61, iron, 1.07, 0.29);
                a.plate(-0.57, y, 1.95, 8.1, 4.68, 1.35, armor, 0.83, 0.24);
                a.pipe([2.63, y, 0.18], [12.58, y, 0.18], 1.55, gunmetal, 12);
                a.pipe([3.58, y, 0.18], [11.58, y, 0.18], 1.86, steel, 12, 1.53);
                for (const x of [4.4, 6.92, 9.44]) {
                    a.pipe([x, y, 0.18], [x + 0.67, y, 0.18], 2.01, iron, 10);
                }
                a.pipe([11.14, y, 0.18], [14.92, y, 0.18], 2.23, iron, 12, 1.91);
                a.pipe([14.91, y, 0.18], [15.24, y, 0.18], 1.56, ceramic, 12);
                a.pipe([15.23, y, 0.18], [15.38, y, 0.18], 0.94, shadow, 12);
                a.fasteners(3.21, [[-2.1, y]], steel);
            }
        }),
        prow: piece([13.95, 0, 7.94], a => {
            a.plate(-2.1, 0, -0.53, 5.61, 18.8, 2.02, gunmetal, 1.34, 0.23);
            plow(a, 0, 9.91, armor);
            a.plate(4.52, 0, -2.22, 1.98, 10.42, 1.20, steel, 0.52);
            for (const side of [-1, 1]) {
                const y = side * 7.33;
                plow(a, y, 4.91, red);
                a.plate(4.45, y, -1.83, 1.73, 3.66, 1.36, gunmetal, 0.63);
                a.plate(1.89, y, 1.82, 1.46, 2.89, 0.53, steel, 0.43);
            }
            a.plate(1.7, 0, 1.81, 1.77, 7.46, 0.52, gunmetal, 0.59);
        }),
        light: beacon(signal),
    };
}

function commandChassis(kind: 'inspector' | 'elite'): Design {
    return kind === 'elite' ? blockadeChassis() : patrolChassis();
}

function supervisor(): Design {
    return {
        base: piece([0, 0, 0], a => {
            roadGear(a, 13.4, 34);
            a.plate(-1.2, 0, 4.65, 32.5, 25.8, 4.6, gunmetal, 2.2, 0.45);
            a.plate(-3.4, 0, 9.15, 25.3, 24.6, 3.75, charcoal, 2.7, 0.75);
            a.plate(-3.3, 0, 12.7, 23.65, 22.7, 1.3, oxide, 2.6, 0.26);
            ventPack(a, -10.0, 0, 13.82, steel);
            for (const side of [-1, 1]) {
                const y = side * 10.25;
                a.plate(10.2, y * 0.76, 5.3, 11.4, 8.25, 3.7, oxide, 1.8, 0.38);
                a.plate(13.2, y * 0.72, 8.95, 5.15, 6.6, 1.55, jade, 1.0, 0.42);
                a.plate(0.0, y * 1.27, 6.95, 21.4, 2.85, 1.55, gunmetal, 0.58);
                a.plate(0.0, y * 1.28, 8.49, 16.2, 1.5, 0.48, oxide, 0.48);
                a.plate(-7.95, y * 0.88, 13.82, 9.4, 3.8, 1.52, iron, 0.66, 0.21);
                a.pipe([-12.5, y * 0.86, 11.9], [-9.75, y * 0.86, 16.0], 0.73, copper, 8);
                a.pipe([-9.75, y * 0.86, 16.0], [-4.7, y * 0.86, 16.0], 0.77, copper, 8);
                a.pipe([-4.7, y * 0.86, 16.0], [-3.15, y * 0.72, 13.9], 0.73, copper, 8);
                for (const x of [-8.4, -6.1]) a.pipe([x - 0.48, y * 0.86, 16], [x + 0.48, y * 0.86, 16], 1.06, steel, 8);
                a.fasteners(8.52, [[-8.0, y * 1.28], [7.8, y * 1.28]], steel);
            }
            a.plate(15.1, 0, 4.95, 4.15, 11.0, 3.65, iron, 1.23, 0.24);
            a.plate(16.4, 0, 6.6, 1.8, 8.6, 1.8, steel, 0.73, 0.29);
        }),
        head: piece([0.1, 0, 13.45], a => {
            bearing(a, [-1.0, 0, -0.95], 1.42, 7.25, shadow);
            a.plate(0.75, 0, 0.36, 14.6, 15.9, 3.45, oxide, 2.85, 0.64);
            a.plate(-0.9, 0, 3.72, 11.55, 12.1, 2.91, jade, 2.1, 0.61);
            a.plate(1.35, 0, 6.49, 6.95, 9.55, 0.65, gunmetal, 1.38, 0.18);
            a.plate(1.95, 0, 7.08, 5.8, 8.7, 0.24, shadow, 1.1, 0.08);
            a.plate(2.34, 0, 7.30, 2.0, 7.85, 0.26, oxide, 0.53, 0.04);
            for (const y of [-4.7, 4.7]) {
                a.plate(4.9, y, 3.42, 5.3, 3.1, 1.33, iron, 0.65, 0.16);
                a.plate(5.65, y, 4.72, 2.8, 1.62, 0.35, mint, 0.44);
            }
            sensor(a, 6.14, 0, 2.72, mint);
            a.fasteners(5.7, [[-3.7, -5.1], [-3.7, 5.1]], steel);
        }),
        antenna: piece([-5.35, 0, 18.15], a => {
            a.pipe([0, 0, -0.5], [0, 0, 4.83], 1.12, gunmetal, 10, 0.78);
            a.pipe([0, 0, 4.42], [0, 0, 5.9], 1.04, steel, 10);
            a.pipe([0, -5.8, 5.4], [0, 5.8, 5.4], 0.62, iron, 8);
            for (const y of [-4.9, 4.9]) {
                a.pipe([-0.65, y, 4.96], [2.15, y, 7.3], 0.75, ceramic, 8);
                a.pipe([2.15, y, 7.3], [3.3, y, 8.28], 0.75, mint, 8, 0.38);
            }
            a.plate(-0.62, 0, 5.83, 3.0, 6.15, 1.05, oxide, 0.59, 0.22);
            a.plate(-0.32, 0, 6.80, 1.26, 4.55, 0.44, mint, 0.36, 0.08);
        }),
        weapon: piece([3.0, 0, 11.93], a => {
            for (const y of [-9.4, 9.4]) {
                a.plate(-1.6, y, -2.46, 8.05, 5.33, 4.97, gunmetal, 0.9, 0.34);
                a.plate(-1.2, y, 2.42, 6.6, 4.01, 0.77, oxide, 0.69, 0.16);
                a.pipe([1.2, y, 0], [11.5, y, 0], 1.44, iron, 12);
                for (const x of [4.9, 7.05, 9.2]) a.pipe([x, y, 0], [x + 0.82, y, 0], 1.84, copper, 10);
                a.pipe([10.4, y, 0], [12.7, y, 0], 1.91, gunmetal, 12);
                a.pipe([12.7, y, 0], [13.3, y, 0], 1.36, ceramic, 12);
                a.pipe([13.25, y, 0], [13.4, y, 0], 0.97, mint, 12);
                a.fasteners(3.19, [[-3.1, y]], steel);
            }
        }),
        light: beacon(mint),
    };
}

function gatekeeper(): Design {
    const shield = (side: number): BossPiece => piece([9.5, side * 8.65, 4.2], a => {
        a.plate(0.3, 0, -2.0, 6.45, 16.15, 13.9, gunmetal, 1.77, 0.42);
        a.plate(2.4, 0, -1.35, 5.0, 15.3, 13.4, copper, 1.42, 0.36);
        a.plate(3.4, 0, 0, 4.55, 13.35, 11.95, enamel, 1.1, 0.36);
        a.plate(5.25, 0, 2.1, 1.98, 11.7, 8.3, shadow, 0.73, 0.13);
        for (const z of [3.05, 6.04, 9.03]) {
            a.plate(5.95, 0, z, 2.05, 12.0, 0.87, gunmetal, 0.53, 0.11);
            a.box(6.63, 0, z + 0.45, 0.42, 9.85, 0.30, steel);
        }
        a.plate(3.68, -side * 6.92, -0.17, 3.92, 1.76, 11.55, rubber, 0.49, 0.13);
        a.plate(4.32, side * 5.1, 11.5, 2.58, 2.15, 0.92, gold, 0.36, 0.12);
        const hingeY = side * 5.65;
        a.pipe([-1.95, hingeY, -1.3], [-1.95, hingeY, 11.7], 1.84, iron, 12);
        for (const z of [0.25, 4.9, 9.55]) {
            a.pipe([-1.95, hingeY, z], [-1.95, hingeY, z + 1.22], 2.02, steel, 12);
        }
        a.pipe([-1.95, hingeY, 11.25], [-1.95, hingeY, 12.18], 1.08, copper, 10);
        a.fasteners(11.9, [[2.4, -4.45], [2.4, 4.45]], edge);
    });
    return {
        base: piece([0, 0, 0], a => {
            roadGear(a, 14.0, 30.0);
            a.plate(-1.9, 0, 4.45, 29.6, 27.25, 4.1, gunmetal, 2.25, 0.6);
            a.plate(-3.28, 0, 8.4, 25.85, 25.4, 4.38, copper, 2.3, 0.6);
            a.plate(-1.5, 0, 12.72, 23.7, 23.68, 0.9, enamel, 2.3, 0.19);
            a.plate(8.8, 0, 5.05, 13.8, 17.6, 3.95, iron, 2.25, 0.25);
            for (const side of [-1, 1]) {
                const y = side * 11.28;
                a.plate(-1.9, y, 9.4, 18.6, 4.5, 1.9, iron, 0.8, 0.12);
                a.plate(-2.5, y, 11.23, 11.48, 2.18, 0.62, gunmetal, 0.53, 0.12);
                a.plate(7.45, y, 7.0, 4.6, 5.6, 6.6, gunmetal, 1.0, 0.22);
                a.pipe([-5.75, y, 13.2], [2.35, y, 13.2], 1.2, steel, 12);
                a.pipe([2.25, y, 13.2], [8.9, y, 12.05], 0.68, edge, 12);
                a.pipe([-2.95, y, 13.2], [-1.96, y, 13.2], 1.48, iron, 10);
                a.pipe([-10.1, y * 0.75, 10.85], [-5.7, y, 13.2], 0.54, copper, 8);
                a.fasteners(10.6, [[-9.33, y], [8.35, y]]);
            }
        }),
        head: piece([-2.0, 0, 13.0], a => {
            a.plate(0, 0, 0, 15.45, 14.15, 3.62, iron, 2.15, 0.88);
            a.plate(-0.7, 0, 3.59, 12.7, 10.7, 1.28, gunmetal, 1.28, 0.18);
            ventPack(a, -1.9, 0, 4.83, shadow);
            a.plate(5.58, 0, 1.8, 4.2, 7.65, 2.0, shadow, 0.68, 0.17);
            a.fasteners(4.65, [[3.7, -3.65], [3.7, 3.65]], steel);
        }),
        lens: piece([9.9, 0, 15.3], a => {
            a.plate(-1.3, 0, -2.86, 6.43, 8.68, 3.5, iron, 1.16, 0.37);
            sensor(a, 1.4, 0, 0, gold);
            a.plate(0.3, 0, 0.48, 4.5, 6.7, 0.88, gunmetal, 0.88, 0.20);
            a.plate(1.72, 0, 1.33, 1.7, 2.78, 0.34, gold, 0.42);
        }),
        left: shield(-1),
        right: shield(1),
        light: beacon(gold),
    };
}

function towFlange(a: MeshArt, side: number): void {
    const inner = side * 6.9, outer = side * 7.84;
    a.pipe([0, inner, 0], [0, outer, 0], 5.2, copper, 20);
    const teeth = 14;
    const at = (tooth: number, part: number, radius: number, y: number): Point => {
        const angle = (tooth + part) * (2 * Math.PI / teeth) * side;
        return [radius * Math.cos(angle), y, radius * Math.sin(angle)];
    };
    for (let tooth = 0; tooth < teeth; tooth++) {
        const ring = (y: number): Point[] => [at(tooth, 0.08, 5.1, y), at(tooth, 0.21, 5.93, y),
            at(tooth, 0.69, 5.93, y), at(tooth, 0.82, 5.1, y)];
        const inside = ring(inner), outside = ring(outer);
        a.face(outside.slice().reverse(), enamel);
        for (let i = 0; i < 3; i++) a.face([outside[i], outside[i + 1], inside[i + 1], inside[i]], enamel);
    }
    a.pipe([0, outer, 0], [0, side * 8.24, 0], 3.25, shadow, 16);
    a.pipe([0, side * 8.25, 0], [0, side * 8.86, 0], 1.84, edge, 12);
    for (let stud = 0; stud < 5; stud++) {
        const theta = stud * (2 * Math.PI / 5);
        const x = 3.86 * Math.cos(theta), z = 3.86 * Math.sin(theta);
        a.pipe([x, outer, z], [x, side * 8.18, z], 0.52, steel, 6);
    }
}

function tow(): Design {
    const bronzeCable = 0xa67748;
    const elbow = (side: number): Point => [7.7, side * 4.7, 1.55];
    const tip = (side: number): Point => [16.25, side * 5.15, -1.0];
    const arm = (side: number): BossPiece => piece([4.0, side * 8.3, 11.1], a => {
        const hinge: Point = [0, 0, 0];
        const joint = elbow(side), pivot = tip(side);
        a.pipe(hinge, joint, 2.53, copper, 10, 2.12);
        a.pipe(joint, pivot, 2.05, iron, 10, 1.35);
        a.plate(joint[0] - 0.2, joint[1], 1.5, 4.7, 5.05, 1.45, enamel, 0.9, 0.24);
        const cylinderBase: Point = [0.5, -side * 1.9, 1.55];
        const cylinderTip: Point = [6.15, side * 2.8, 3.32];
        a.pipe(cylinderBase, cylinderTip, 1.21, shadow, 8);
        a.pipe(mix(cylinderBase, cylinderTip, 0.58), [8.65, side * 4.05, 3.55], 0.66, edge, 8);
        a.pipe([8.0, side * 6.32, 1.75], [13.8, side * 6.03, 0.32], 0.52, bronzeCable, 6);
        a.pipe([pivot[0], pivot[1], pivot[2] - 1.27], [pivot[0], pivot[1], pivot[2] + 1.66], 2.05, copper, 12);
        for (const [x, y, z] of [joint, pivot]) {
            a.pipe([x, y, z + 1.08], [x, y, z + 1.83], 1.55, steel, 10);
            a.pipe([x, y, z + 1.81], [x, y, z + 2.16], 0.71, shadow, 6);
        }
    });
    const jaw = (side: number): BossPiece => piece(tip(side), a => {
        const root: Point = [0, 0, 0], knuckle: Point = [4.05, -side * 1.35, -1.1];
        const hook: Point = [5.1, -side * 3.88, -3.75];
        a.pipe(root, knuckle, 1.71, steel, 10, 1.56);
        a.pipe(knuckle, hook, 1.53, enamel, 8, 0.83);
        a.pipe(hook, [4.08, -side * 4.79, -4.4], 0.82, edge, 8, 0.39);
        a.pipe([0.7, -side * 1.15, -0.62], [3.9, -side * 2.5, -1.98], 0.43, rubber, 6);
    });
    return {
        base: piece([0, 0, 0], a => {
            roadGear(a, 13.1, 36.1);
            chassis(a, 33.7, 25, copper, enamel);
            for (const side of [-1, 1]) {
                a.plate(2, side * 8.3, 12.0, 7.1, 7.6, 2.55, iron, 1.05);
                a.pipe([2, side * 8.3, 14.45], [2, side * 8.3, 15.55], 2.38, edge, 12);
                a.plate(-7, side * 9.2, 10.5, 8.5, 3.4, 5.5, iron, 1.2, 0.48);
                a.pipe([-11.4, side * 8.6, 12.2], [-9.4, side * 9.0, 15.3], 0.72, steel, 8);
                a.box(9.4, side * 10.2, 10.35, 2.35, 1.5, 0.64, gold);
            }
            a.plate(12.45, 0, 7.1, 4.8, 8.5, 4.5, steel, 0.75);
            a.plate(13.25, 0, 8.35, 3.3, 6.25, 2.22, shadow, 0.55);
            for (const side of [-1, 1]) a.box(13.8, side * 3.71, 10.44, 1.85, 1.25, 0.76, enamel);
        }),
        spool: piece([-7, 0, 16.05], a => {
            a.pipe([0, -7.0, 0], [0, 7.0, 0], 4.42, shadow, 20);
            for (const side of [-1, 1]) towFlange(a, side);
            const cable = (progress: number): Point => {
                const twist = progress * 9.5 * Math.PI;
                return [4.44 * Math.sin(twist), -6.64 + progress * 13.28, 4.44 * Math.cos(twist)];
            };
            for (let turn = 0; turn < 66; turn++) {
                a.pipe(cable(turn / 66), cable((turn + 1) / 66), 0.76, turn % 4 === 3 ? edge : steel, 6);
            }
        }),
        head: piece([4.6, 0, 13.5], a => {
            a.plate(-1.25, 0, 0, 7.7, 9.6, 3.33, gunmetal, 0.9, 0.36);
            sensor(a, 2.38, 0, 1.54, gold);
            for (const side of [-1, 1]) {
                a.plate(1.3, side * 3.76, 1.46, 4.1, 2.2, 1.76, copper, 0.54, 0.16);
                a.fasteners(3.23, [[1.2, side * 3.42]], edge);
            }
        }),
        roller: piece([11.25, 0, 12.65], a => {
            for (const side of [-1, 1]) a.pipe([0, -3.6, 1.12 * side], [0, 3.6, 1.12 * side], 0.81, steel, 10);
            a.pipe([-1.9, 0, 0.84], [0.22, 0, 0.1], 0.67, shadow, 8);
            for (const side of [-1, 1]) a.pipe([0, side * 3.43, -1.16], [0, side * 3.43, 1.17], 0.61, copper, 8);
        }),
        left: arm(-1),
        right: arm(1),
        leftJaw: jaw(-1),
        rightJaw: jaw(1),
        light: beacon(gold),
    };
}

function silence(): Design {
    const ceramicViolet = 0xafa5d4;
    const waveguide = 0x364664;
    const emitter = (offset: number): BossPiece => piece([-3.7, offset * 8.75, 12.75], a => {
        const center = offset === 0;
        const lateral = center ? 1 : offset;
        a.pipe([0, 0, 0], [3.15, 0, 6.3], 1.47, steel, 10, 1.25);
        a.pipe([-0.5, -1.35, 0.8], [3.75, -1.35, 6.55], 0.58, iron, 8);
        a.pipe([-0.5, 1.35, 0.8], [3.75, 1.35, 6.55], 0.58, iron, 8);
        a.plate(3.9, 0, 5.32, 10.9, center ? 6.7 : 6.2, 2.76, waveguide, 1.35, 0.22);
        a.plate(0.35, 0, 7.85, 4.4, 5.85, 2.69, indigo, 0.77, 0.18);
        a.plate(6.6, 0, 7.33, 5.4, 5.2, 1.45, iron, 0.7, 0.19);
        for (const y of [-1.65, 0, 1.65]) {
            a.box(8.09, y, 7.55, 2.45, 0.66, 1.73, violet);
            a.box(7.14, y, 8.74, 3.95, 0.64, 1.30, ceramicViolet);
        }
        for (const y of [-2.45, 2.45]) {
            a.box(4.7, y * 1.1, 7.97, 8.2, 0.88, 2.37, indigo);
            a.pipe([-0.18, y, 8.86], [8.87, y, 8.86], 0.36, steel, 6);
            a.pipe([8.87, y, 8.86], [9.11, y, 8.02], 0.36, steel, 6);
        }
        a.fasteners(10.15, [[0.05, -1.93], [0.05, 1.93]], edge);
        if (center) {
            a.plate(2.3, 0, 10.31, 3.78, 4.5, 0.67, ceramicViolet, 0.52);
            a.box(2.73, 0, 10.98, 2.76, 0.88, 0.27, violet);
        } else {
            const finRoot: Point = [-1.8, lateral * 2.05, 9.38];
            const finTip: Point = [2.75, lateral * 5.08, 12.2];
            const latch: Point = [6.7, lateral * 2.73, 9.75];
            const offsetHeight = (p: Point, h: number): Point => [p[0], p[1], p[2] + h];
            const top = [finRoot, finTip, latch].map(p => offsetHeight(p, 0.66));
            const base = [finRoot, finTip, latch];
            a.face(lateral > 0 ? top.slice().reverse() : top, indigo);
            for (let i = 0; i < 3; i++) {
                const next = (i + 1) % 3;
                const flank = [base[i], base[next], top[next], top[i]];
                a.face(lateral > 0 ? flank.slice().reverse() : flank, waveguide);
            }
            a.pipe(offsetHeight(finTip, 0.56), offsetHeight(latch, 0.64), 0.28, ceramicViolet, 6);
        }
    });
    const shutter = (side: number): BossPiece => piece([6.15, side * 2.63, 10.23], a => {
        a.plate(0.42, -side * 2.23, 0, 6.45, 4.82, 0.63, indigo, 0.65, 0.18);
        a.plate(0.39, -side * 2.49, 0.56, 5.43, 2.65, 0.43, ceramicViolet, 0.62, 0.14);
        a.box(0.18, -side * 2.55, 0.96, 3.82, 0.44, 0.24, violet);
        a.pipe([-2.31, 0, -0.13], [2.69, 0, -0.13], 0.42, steel, 8);
    });
    return {
        base: piece([0, 0, 0], a => {
            for (const x of [-9.7, 9.7]) for (const y of [-13.25, 13.25]) {
                a.pipe([x * 0.61, y * 0.59, 5.2], [x, y, 2.7], 2.1, steel, 8);
                a.plate(x, y, 0, 7.4, 7.0, 2.8, shadow, 1.4);
                a.plate(x, y, 2.7, 5.25, 5.15, 1.35, iron, 0.75);
                a.box(x - 0.3, y, 4.01, 2.25, 1.12, 0.4, waveguide);
                a.fasteners(4.0, [[x + 1.28, y - 1.03], [x - 1.03, y + 1.27]], steel);
            }
            a.plate(0, 0, 2.8, 27.35, 27, 6.45, waveguide, 4.7, 1.3);
            a.plate(-0.8, 0, 8.85, 24.75, 24.5, 1.3, indigo, 3.42, 0.48);
            a.annulus(0, 0, 10.04, 9.25, 11.55, 0.98, steel);
            a.annulus(0, 0, 11.03, 9.66, 10.45, 0.26, waveguide);
            for (const side of [-1, 1]) {
                a.plate(-9.54, side * 7.25, 9.17, 5.4, 3.3, 1.48, iron, 0.61);
                for (const x of [-10.65, -9.36, -8.07]) a.box(x, side * 7.25, 10.62, 0.48, 2.18, 0.31, ceramicViolet);
            }
        }),
        head: piece([1.35, 0, 11.1], a => {
            bearing(a, [0, 0, 0], 2.62, 7.22, shadow);
            a.plate(-0.3, 0, 2.45, 10.6, 10.65, 4.85, indigo, 2.1, 0.62);
            a.plate(0.8, 0, 7.21, 6.65, 7.1, 0.84, waveguide, 1.17, 0.17);
            sensor(a, 5.05, 0, 5.55, violet);
            for (const side of [-1, 1]) {
                a.pipe([1.6, side * 3.58, 5.05], [5.1, side * 3.88, 6.05], 0.62, ceramicViolet, 8, 0.43);
            }
        }),
        left: emitter(-1),
        right: emitter(1),
        center: emitter(0),
        leftShutter: shutter(-1),
        rightShutter: shutter(1),
        light: beacon(violet),
    };
}

function core(): Design {
    const panel = (side: number): BossPiece => piece([-0.75, side * 10.75, 12.2], a => {
        a.plate(0, 0, -0.68, 24, 7.35, 4.55, charcoal, 1.62, 0.45);
        a.plate(0, side * 1.0, 3.69, 21.75, 5.46, 4.45, oxide, 1.34, 0.41);
        a.plate(0, side * 1.08, 8.04, 18.7, 3.9, 0.78, gunmetal, 0.71, 0.16);
        a.plate(0, side * 1.93, 8.7, 16.32, 0.93, 0.43, jade, 0.39);
        a.plate(0, -side * 3.1, 0.88, 18.6, 1.56, 3.77, shadow, 0.56);
        for (const x of [-6.5, 0, 6.5]) {
            a.pipe([x, -side * 2.41, 1.7], [x, -side * 2.41, 4.72], 1.11, ceramic, 10);
            a.pipe([x, -side * 2.41, 4.55], [x, -side * 2.41, 5.35], 0.81, copper, 8);
        }
        a.fasteners(8.78, [[-8.3, side * 0.88], [8.3, side * 0.88]], steel);
    });
    return {
        base: piece([0, 0, 0], a => {
            for (const x of [-13, 13]) for (const y of [-14.4, 14.4]) {
                a.plate(x, y, 0.18, 11.15, 8.45, 2.6, rubber, 1.48, 0.15);
                a.plate(x, y, 2.64, 9.7, 7.40, 1.94, gunmetal, 1.14, 0.26);
                a.pipe([x * 0.56, y * 0.60, 7.15], [x, y, 4.72], 2.17, iron, 12, 1.76);
                a.pipe([x, y, 4.28], [x, y, 5.43], 2.25, steel, 12);
                a.fasteners(4.49, [[x - 2.85, y], [x + 2.85, y]], steel);
            }
            a.plate(0, 0, 4.39, 32.4, 29.7, 3.36, iron, 5.25, 0.69);
            a.pipe([0, 0, 7.3], [0, 0, 10.94], 15.35, oxide, 28, 14.08);
            a.annulus(0, 0, 10.75, 11.2, 14.13, 2.60, gunmetal, 28);
            a.annulus(0, 0, 13.27, 11.35, 13.15, 0.48, steel, 28);
            a.annulus(0, 0, 10.8, 9.4, 10.72, 1.8, shadow, 28);
            for (let i = 0; i < 8; i++) {
                const angle = (i + 0.5) * Math.PI / 4;
                const x = Math.cos(angle), y = Math.sin(angle);
                a.pipe([x * 10.9, y * 10.9, 10.06], [x * 13.93, y * 13.93, 11.48], 0.91, copper, 8);
                a.pipe([x * 13.08, y * 13.08, 11.1], [x * 14.25, y * 14.25, 11.66], 0.92, ceramic, 8);
                a.fasteners(13.7, [[x * 12.24, y * 12.24]], edge);
            }
            a.plate(12.8, 0, 7.7, 7.15, 13.8, 3.82, charcoal, 1.48, 0.38);
            sensor(a, 16.45, 0, 9.36, jade);
            for (const y of [-6.65, 6.65]) a.plate(13.5, y, 9.08, 1.68, 2.93, 1.72, steel, 0.52);
        }),
        head: piece([0, 0, 12.35], a => {
            a.pipe([0, 0, -7.4], [0, 0, -0.68], 2.22, gunmetal, 16);
            a.pipe([0, 0, -3.06], [0, 0, -1.0], 2.59, steel, 16);
            a.pipe([0, 0, -1.13], [0, 0, 2.58], 5.58, iron, 20, 5.27);
            a.annulus(0, 0, -0.68, 6.25, 9.73, 1.42, steel, 24);
            a.annulus(0, 0, 0.64, 6.78, 8.86, 0.76, copper, 24);
            a.pipe([0, 0, 2.14], [0, 0, 7.8], 4.8, shadow, 20, 4.27);
            for (const z of [2.65, 4.0, 5.35, 6.7]) {
                a.annulus(0, 0, z, 4.15, 5.07 - 0.045 * z, 0.49, copper, 20);
            }
            a.annulus(0, 0, 7.63, 3.9, 6.92, 1.30, gunmetal, 24);
            a.annulus(0, 0, 8.87, 3.64, 6.04, 0.60, jade, 24);
            a.annulus(0, 0, 9.21, 3.69, 4.38, 0.52, contact, 24);
            a.pipe([0, 0, 6.9], [0, 0, 7.8], 3.18, jade, 16, 2.56);
            for (let i = 0; i < 8; i++) {
                const angle = i * Math.PI / 4;
                const x = Math.cos(angle), y = Math.sin(angle);
                a.pipe([x * 7.78, y * 7.78, 0.29], [x * 6.27, y * 6.27, 8.43], 0.87, steel, 8);
                a.pipe([x * 6.92, y * 6.92, 4.18], [x * 6.61, y * 6.61, 5.91], 1.17, ceramic, 8);
            }
        }),
        left: panel(-1),
        right: panel(1),
        spool: piece([14.0, 0, 12.32], a => {
            a.pipe([0, -4.83, 0], [0, 4.83, 0], 1.14, iron, 12);
            a.pipe([0, -3.2, 0], [0, 3.2, 0], 1.85, copper, 12);
            for (let y = -2.55; y <= 2.55; y += 0.85) a.pipe([0, y, 0], [0, y + 0.35, 0], 1.99, steel, 12);
            for (const y of [-3.38, 3.0]) a.pipe([0, y, 0], [0, y + 0.38, 0], 2.45, gunmetal, 12);
            a.box(0, 0, 1.92, 1.03, 5.01, 0.36, mint);
        }),
        light: beacon(mint),
    };
}

function definition(kind: PrototypeBossKind): Design {
    switch (kind) {
    case 'supervisor': return supervisor();
    case 'gatekeeper': return gatekeeper();
    case 'tow': return tow();
    case 'silence': return silence();
    case 'core': return core();
    default: return commandChassis(kind);
    }
}

function eased(t: number, duration: number): number {
    const remaining = 1 - Math.min(1, Math.max(0, t / duration));
    return 1 - remaining * remaining;
}

/** One material and immutable meshes per encountered chassis; model transforms are per enemy. */
export class PrototypeBossMeshes {
    private readonly material = new Material();
    private readonly designs = new Map<PrototypeBossKind, Design>();

    constructor() {
        this.material.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: true },
        });
    }

    create(kind: PrototypeBossKind, parent: Node, layer: number): PrototypeBossActor {
        const design = this.designs.get(kind) ?? definition(kind);
        this.designs.set(kind, design);
        const child = (owner: Node, name: string): Node => {
            const n = new Node(name);
            n.layer = layer;
            owner.addChild(n);
            return n;
        };
        const node = child(parent, `Boss ${kind}`);
        const upper = child(node, 'Recoil suspension');
        const parts: Record<string, Node | undefined> = {};
        for (const [name, part] of Object.entries(design)) {
            const n = child(name === 'base' ? node : upper, name);
            const [x, y, z] = part.anchor;
            n.setPosition(x, z, -y);
            const mesh = n.addComponent(MeshRenderer);
            mesh.mesh = part.asset;
            mesh.setSharedMaterial(this.material, 0);
            parts[name] = n;
        }
        const move = (name: string, x = 0, y = 0, z = 0): void => {
            const anchor = design[name]?.anchor;
            if (anchor) parts[name]!.setPosition(anchor[0] + x, anchor[2] + y, -anchor[1] + z);
        };
        const rotate = (name: string, pitch = 0, yaw = 0, roll = 0): void => {
            parts[name]?.setRotationFromEuler(pitch, yaw, roll);
        };
        let previousPose: Pose | undefined;
        let previousSkill: PrototypeBossSkill | undefined;
        let previousTick = -1;
        let impact = 0;
        let offline = false;
        const light = parts.light!;
        const setPose = (pose: Pose, ageTicks: number, skill?: PrototypeBossSkill): void => {
            if (previousPose === pose && previousTick === ageTicks && previousSkill === skill) return;
            previousPose = pose;
            previousTick = ageTicks;
            previousSkill = skill;
            offline = skill === 'offline';
            const active = !offline && (pose === 'strike' || pose === 'skill');
            const windup = !offline && pose === 'windup';
            const recover = !offline && pose === 'recover';
            const walking = !offline && pose === 'walk';
            const brace = windup ? eased(ageTicks + 1, 12) : 0;
            const pulse = active ? 0.5 + 0.5 * Math.sin(ageTicks * 0.38) : 0;
            const settle = recover ? 1 - eased(ageTicks, 10) : 0;
            const gait = walking ? Math.sin(ageTicks * 0.42) : 0;
            const idle = offline ? 0 : Math.sin(ageTicks * 0.13);
            const recoil = offline ? 0 : Math.max(impact, pose === 'hit' ? 1 - eased(ageTicks, 6) : 0);
            upper.setPosition(-recoil * 1.09, offline ? -3.5 : Math.abs(gait) * 0.55 - brace * 0.59 + recoil * 0.88, 0);
            upper.setRotationFromEuler(0, 0, offline ? -5 : 5.8 * recoil - 2.8 * brace);
            move('head', 0, 0.20 * idle);
            rotate('head', 0, gait * 2.8);
            light.active = windup || active || (skill === 'critical' && !offline);
            light.setScale(0.75 + brace * 0.35 + pulse * 0.5, 0.92 + pulse * 0.8, 0.75 + brace * 0.35 + pulse * 0.5);
            light.setPosition(7.9, 17.4 + brace + pulse * 2.4, 0);

            switch (kind) {
            case 'supervisor': {
                const dispatch = skill === 'summon';
                const shot = active && !dispatch ? 1 - eased(ageTicks % 11, 7) : 0;
                const elevation = brace * 1.62 + pulse * (dispatch ? 3.4 : 1.45);
                rotate('antenna', 0, offline ? 0 : windup ? 4 * idle : active ? Math.sin(ageTicks * 0.21) * 26 : 8 * idle,
                    -17 * brace + 14 * pulse + 8 * recoil);
                move('antenna', -1.2 * recoil, elevation - recoil * 1.3);
                move('weapon', -brace * 1.35 - shot * 3.1, dispatch ? 0.66 + pulse * 1.5 : 0);
                rotate('weapon', 0, 0, dispatch ? 21 * (brace + pulse) : -4.8 * brace + shot * 3.5);
                rotate('head', 0, dispatch && active ? Math.sin(ageTicks * 0.19) * 7.5 : gait * 3.6);
                light.setPosition(dispatch ? -5.15 : 14.8 - shot, dispatch ? 27.1 + elevation : 15.4 + pulse * 0.8, 0);
                break;
            }
            case 'gatekeeper': {
                const split = recover ? 23 + settle * 13 : active ? 15 + pulse * 4 : 2 - brace * 4;
                const extension = active ? 2.25 - recoil * 0.9 : -brace * 0.77;
                const lift = settle * 0.83;
                rotate('left', 0, -split, -brace * 8 + pulse * 3 - recoil * 4);
                rotate('right', 0, split, -brace * 8 + pulse * 3 - recoil * 4);
                move('left', extension, lift, split * 0.105);
                move('right', extension, lift, -split * 0.105);
                move('lens', recover ? 1.32 : -recoil * 1.35, recover ? 1.55 + settle : -brace * 0.68);
                light.setPosition(13.8, 17.4 + pulse * 0.7, 0);
                break;
            }
            case 'tow': {
                const tug = active ? (skill === 'tether' ? 4.6 : 2.6) + pulse : -brace * 2.6;
                const closure = active ? 12 : recover ? -10 : -brace * 14;
                rotate('left', 0, closure, 12 * brace + settle * 6);
                rotate('right', 0, -closure, 12 * brace + settle * 6);
                move('left', tug);
                move('right', tug);
                for (const [side, armName, jawName] of [[-1, 'left', 'leftJaw'], [1, 'right', 'rightJaw']] as const) {
                    const arm = parts[armName]!, jaw = parts[jawName]!;
                    if (jaw.parent !== arm) jaw.setParent(arm, false);
                    const hook = active ? -21 - pulse * 8 : brace * 22 + settle * 15;
                    rotate(jawName, 0, side * hook, -8 * brace + pulse * 4 + recoil * 4.8);
                }
                rotate('spool', 0, 0, ageTicks * (active ? 17 : windup ? -5 : walking ? 3.4 : 0));
                move('roller', active ? pulse * 0.68 : -brace * 0.49, recoil * 0.27);
                light.setPosition(14.8 + tug, 11.6, 0);
                break;
            }
            case 'silence': {
                const array = active ? 18 + 5 * pulse : 13 * brace + 8 * settle;
                rotate('left', -array, -array * 0.7, brace * 15 + pulse * 8);
                rotate('right', array, array * 0.7, brace * 15 + pulse * 8);
                const opening = active ? 58 + pulse * 14 : 36 * brace + 19 * settle;
                for (const [side, emitterName, shutterName] of [[-1, 'left', 'leftShutter'], [1, 'right', 'rightShutter']] as const) {
                    const emitter = parts[emitterName]!, shutter = parts[shutterName]!;
                    if (shutter.parent !== emitter) shutter.setParent(emitter, false);
                    rotate(shutterName, -side * opening, 0, recoil * 5);
                }
                rotate('center', 0, 0, brace * 23 + pulse * 12);
                move('center', 0, brace * 1.3 + pulse * 2.7);
                light.setPosition(7.0, 23.8 + brace * 1.4 + pulse * 3.2, 0);
                break;
            }
            case 'core': {
                const ring = active ? 4.1 + (skill === 'sector' ? pulse * 2.15 : pulse * 0.5) : brace * 3.6;
                const yaw = offline ? 0 : ageTicks * (active ? 9.25 : windup ? 5.1 : 3.3);
                const wings = offline ? 0 : ring * (skill === 'tether' ? 0.43 : 1) + settle * 4.45;
                rotate('head', recoil * 4.8, yaw, recoil * 5);
                move('head', -recoil * 0.65, offline ? -2.25 : ring + 0.35 * idle - recoil * 1.15);
                rotate('left', 4.6 * wings - recoil * 3.4, 0);
                rotate('right', -4.6 * wings + recoil * 3.4, 0);
                move('left', 0, 0, wings * 0.67);
                move('right', 0, 0, -wings * 0.67);
                move('spool', skill === 'tether' && (active || windup) ? 2.8 + pulse * 1.8 : 0, -recoil * 0.74);
                rotate('spool', 0, 0, skill === 'tether' ? ageTicks * (active ? 15 : -6) : 0);
                light.setPosition(0, 22.4 + ring, 0);
                break;
            }
            case 'elite': {
                const ramTravel = active ? 1.8 + pulse * 0.77 : -brace * 1.16;
                const shot = active ? 1 - eased(ageTicks % 11, 7) : 0;
                move('prow', ramTravel - recoil * 1.2, -pulse * 0.45 + recoil * 0.41);
                rotate('prow', 0, 0, -brace * 11 + shot * 5.4 - recoil * 4);
                move('weapon', -shot * 3.65 - brace * 0.76, recoil * 0.68);
                rotate('weapon', 0, 0, 1.0 * settle - brace * 5.45 + shot * 3.2);
                rotate('head', 0, gait * 3.8, 2.9 * recoil);
                light.setPosition(17.1 + ramTravel, 14.0 + pulse * 0.8, 0);
                break;
            }
            case 'inspector': {
                const launch = active && skill === 'charge' ? 2.55 : 0;
                const isSummon = skill === 'summon';
                const shotRecoil = active && skill !== 'charge' && !isSummon
                    ? 3.6 * (1 - eased(ageTicks % 11, 7)) : 0;
                const mastLift = isSummon ? brace * 1.68 + pulse * 2.55 : 0;
                move('transponder', 0, mastLift - 0.61 * recoil);
                rotate('transponder', 0, isSummon && active ? Math.sin(ageTicks * 0.51) * 28 : idle * 7,
                    isSummon ? -brace * 13 + pulse * 22 : recoil * 8);
                move('optics', brace * 0.78 + launch * 0.45 - recoil * 1.1, -shotRecoil * 0.2 + pulse * 0.22);
                rotate('optics', 0, windup || active ? 0 : 11 * idle, -brace * 6.25 + recoil * 8);
                move('weapon', launch - shotRecoil - brace * 1.87, isSummon ? 0.4 + 1.15 * pulse : 0);
                rotate('weapon', 0, skill === 'sweep' && active ? Math.sin(ageTicks * 0.12) * 9.5 : 0,
                    isSummon ? 11 * (brace + pulse) : -brace * 5.2);
                if (isSummon) light.setPosition(-4.15, 24.5 + mastLift, 0);
                else light.setPosition(16.0 + launch - shotRecoil, 13.1, 0);
                break;
            }
            }
        };
        const setImpact = (strength: number): void => {
            const amount = Math.max(0, Math.min(1, strength));
            if (impact !== amount) {
                impact = amount;
                const pose = previousPose ?? 'idle';
                previousPose = undefined;
                setPose(pose, Math.max(0, previousTick), previousSkill);
            }
        };
        setPose('idle', 0);
        return { node, setPose, setImpact };
    }

    destroy(): void {
        const unique = new Set<Mesh>();
        for (const design of this.designs.values()) {
            for (const { asset } of Object.values(design)) unique.add(asset);
        }
        for (const asset of unique) asset.destroy();
        this.designs.clear();
        this.material.destroy();
    }
}
