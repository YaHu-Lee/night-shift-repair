import { Material, Mesh, MeshRenderer, Node, utils } from 'cc';
import { EARLY_ARENAS } from './PrototypeArenaEarly';
import { LATE_ARENAS } from './PrototypeArenaLate';

type Position = [x: number, y: number, z: number];
type RGB = [r: number, g: number, b: number];
type FloorPoint = readonly [x: number, screenY: number];
export type ArenaBounds = Readonly<{ left: number; right: number; bottom: number; top: number }>;

const SCREEN_CENTER_Y = 350;
const SCREEN_CENTER_X = 180;
const GROUND_PROJECTION = 0.8;
const YARD_WALL_Y = 543;
const STEEL = 0x45636a;
const DEEP_STEEL = 0x233840;
const DARK = 0x1a2a30;
const WALL = 0x565d55;
const OXIDE = 0x8a553b;
const YELLOW = 0xb18c4a;
const AMBER = 0xe29d54;

function ground(screenY: number): number {
    return (SCREEN_CENTER_Y - screenY) / GROUND_PROJECTION;
}

function rgb(paint: number): RGB {
    return [(paint >> 16) & 255, (paint >> 8) & 255, paint & 255];
}

function scaleColor(color: RGB, light: number): RGB {
    return [color[0] * light, color[1] * light, color[2] * light];
}

function difference(a: Position, b: Position): Position {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Position, b: Position): Position {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function unit(v: Position): Position {
    const length = Math.hypot(...v) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
}

function grain(x: number, y: number): number {
    const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return value - Math.floor(value) - 0.5;
}

function concrete(x: number, screenY: number): RGB {
    const north = Math.max(0, (screenY - 470) / 83);
    const side = Math.max(0, (Math.abs(x) - 96) / 65);
    const glow = Math.exp(-(((Math.abs(x) - 136) / 38) ** 2 + ((screenY - (YARD_WALL_Y - 11)) / 48) ** 2));
    const broad = Math.sin(x * 0.025 + screenY * 0.018) * 2.8;
    const aggregate = 2.1 * Math.sin(x * 0.083 - screenY * 0.055) + 4.1 * grain(x, screenY);
    const apron = Math.exp(-((x / 114) ** 2 + ((screenY - 461) / 72) ** 2));
    const shade = broad + aggregate + apron * 4 - side * 4 - north * 4;
    return [
        53 + shade + glow * 58,
        64 + shade + glow * 33,
        71 + shade + glow * 9,
    ];
}

/** Minimal static world geometry. Art is shaded into vertex colors in this atlas-free pass. */
export class ArenaGeometry {
    private readonly positions: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];
    private facade?: { readonly front: number; readonly shift: number };

    private vertex(point: Position, color: RGB): void {
        this.positions.push(point[0], point[1], point[2] + (this.facade?.shift ?? 0));
        this.colors.push(...color.map(channel => Math.min(1, Math.max(0, channel / 255))), 1);
    }

    northFacade(front: number, target: number, draw: (geometry: ArenaGeometry) => void): void {
        this.facade = { front: ground(front), shift: ground(target) - ground(front) };
        try { draw(this); } finally { this.facade = undefined; }
    }

    private fitsFacade(points: readonly Position[]): boolean {
        return !this.facade || points.every(point => point[2] <= this.facade!.front);
    }

    face(points: readonly Position[], paint: number, lighting = true): void {
        if (!this.fitsFacade(points)) return;
        const normal = unit(cross(difference(points[1], points[0]), difference(points[2], points[0])));
        const light = lighting ? 0.78 + 0.22 * (-normal[0] * 0.29 + normal[1] * 0.84 + normal[2] * 0.46) : 1;
        this.polygon(points, points.map(() => scaleColor(rgb(paint), light)));
    }

    private polygon(points: readonly Position[], colors: readonly RGB[]): void {
        const offset = this.positions.length / 3;
        points.forEach((point, index) => this.vertex(point, colors[index]));
        for (let i = 1; i < points.length - 1; i++) this.indices.push(offset, offset + i, offset + i + 1);
    }

    box(x: number, y: number, z: number, width: number, height: number, depth: number, paint: number,
        bevel = 0, yaw = 0): void {
        const a = width / 2, b = depth / 2;
        const corner = Math.min(bevel, a * 0.40, b * 0.40);
        const outline = corner > 0
            ? [[-a + corner, b], [a - corner, b], [a, b - corner], [a, -b + corner],
                [a - corner, -b], [-a + corner, -b], [-a, -b + corner], [-a, b - corner]]
            : [[-a, b], [a, b], [a, -b], [-a, -b]];
        const cos = Math.cos(yaw), sin = Math.sin(yaw);
        const ring = (level: number, inset = 0): Position[] => outline.map(([dx, dz]) => {
            const px = dx * (a - inset) / a, pz = dz * (b - inset) / b;
            return [x + cos * px - sin * pz, level, z + sin * px + cos * pz];
        });
        const lip = Math.min(height * 0.35, corner * 0.65);
        const bottom = ring(y);
        if (!this.fitsFacade(bottom)) return;
        const top = ring(y + height, lip);
        if (lip > 0) {
            const shoulder = ring(y + height - lip);
            this.join(bottom, shoulder, paint);
            this.join(shoulder, top, paint);
        } else this.join(bottom, top, paint);
        this.face(top, paint);
    }

    cylinder(x: number, y: number, z: number, lower: number, upper: number, height: number, paint: number): void {
        const circle = (radius: number, level: number): Position[] => Array.from({ length: 12 }, (_, i) => {
            const angle = -i * Math.PI / 6;
            return [x + Math.cos(angle) * radius, level, z + Math.sin(angle) * radius];
        });
        const base = circle(lower, y);
        const top = circle(upper, y + height);
        if (!this.fitsFacade(base) || !this.fitsFacade(top)) return;
        this.join(base, top, paint);
        this.face(top, paint);
    }

    private join(bottom: Position[], top: Position[], paint: number): void {
        for (let i = 0; i < bottom.length; i++) {
            const next = (i + 1) % bottom.length;
            this.face([bottom[i], bottom[next], top[next], top[i]], paint);
        }
    }

    tube(path: readonly Position[], radius: number, paint: number, sides = 7): void {
        // Skip pipes that straddle the edge of the borrowed scenery band as whole structures.
        if (this.facade && path.some(point => point[2] + radius > this.facade!.front)) return;
        let last: Position[] | undefined;
        for (let i = 0; i < path.length; i++) {
            const center = path[i];
            const tangent = unit(difference(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)]));
            const normal = unit(cross(Math.abs(tangent[2]) > 0.95 ? [0, 1, 0] : [0, 0, 1], tangent));
            const binormal = cross(tangent, normal);
            const section = Array.from({ length: sides }, (_, j): Position => {
                const angle = Math.PI * 2 * j / sides;
                const a = Math.cos(angle) * radius, b = Math.sin(angle) * radius;
                return [center[0] + normal[0] * a + binormal[0] * b, center[1] + normal[1] * a + binormal[1] * b,
                    center[2] + normal[2] * a + binormal[2] * b];
            });
            if (last) this.join(last, section, paint);
            last = section;
        }
    }

    surface(tint: (x: number, screenY: number) => RGB = concrete,
        bounds: ArenaBounds = { left: -180, right: 180, bottom: 122, top: 578 }, columns = 45, rows = 53): void {
        const offset = this.positions.length / 3;
        for (let row = 0; row <= rows; row++) {
            const screenY = bounds.bottom + (bounds.top - bounds.bottom) * row / rows;
            for (let col = 0; col <= columns; col++) {
                const x = bounds.left + (bounds.right - bounds.left) * col / columns;
                this.vertex([x, -0.25, ground(screenY)], tint(x, screenY));
                if (row && col) {
                    const north = offset + row * (columns + 1) + col;
                    const south = north - columns - 1;
                    this.indices.push(south - 1, south, north, south - 1, north, north - 1);
                }
            }
        }
    }

    stroke(from: FloorPoint, to: FloorPoint, width: number, height: number,
        tint: (x: number, y: number) => RGB): void {
        if (this.facade) return;
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const length = Math.hypot(dx, dy);
        const ox = dy * width / (2 * length), oy = -dx * width / (2 * length);
        const points: FloorPoint[] = [
            [from[0] + ox, from[1] + oy], [to[0] + ox, to[1] + oy],
            [to[0] - ox, to[1] - oy], [from[0] - ox, from[1] - oy],
        ];
        this.polygon(points.map(([x, y]) => [x, height, ground(y)]), points.map(([x, y]) => tint(x, y)));
    }

    mesh(): Mesh {
        return utils.createMesh({ positions: this.positions, colors: this.colors, indices: this.indices }, undefined, { calculateBounds: true });
    }
}

function addConcreteDetails(g: ArenaGeometry): void {
    // Saw cuts sit below the faded paint and keep the slab layout readable at battle scale.
    g.surface();
    for (const [from, to] of [
        [[-153, 201], [166, 201]], [[-153, 314], [166, 314]],
        [[-153, 438], [166, 438]], [[-153, 510], [166, 510]],
        [[-70, 148], [-70, 314]], [[80, 314], [80, 438]], [[-78, 438], [-78, 510]],
    ] as const) {
        g.stroke(from, to, 0.92, -0.22, (x, y) => scaleColor(concrete(x, y), 0.81));
        g.stroke([from[0] + 0.65, from[1] + 0.65], [to[0] + 0.65, to[1] + 0.65],
            0.48, -0.21, (x, y) => scaleColor(concrete(x, y), 1.12));
    }
    for (let i = 0; i < 29; i++) {
        const y = 283 + i * 8.25;
        const faded = 0.4 + 0.60 * Math.abs(grain(37, i) * 2);
        g.stroke([-1.2 + grain(i, 16), y], [-1.1 + grain(i + 1, 16), y + 8.05], 3.6 * faded, -0.19,
            (x, yy) => {
                const base = concrete(x, yy);
                return [base[0] + 30 * faded, base[1] + 24 * faded, base[2] + 15 * faded];
            });
    }
    const cracks: FloorPoint[][] = [
        [[-163, 481], [-148, 474], [-131, 470], [-125, 458], [-105, 454], [-92, 446]],
        [[-131, 470], [-128, 481], [-122, 488]],
        [[160, 416], [143, 412], [127, 405], [122, 393], [104, 386], [96, 374]],
        [[129, 405], [117, 409], [114, 417]],
        [[-164, 258], [-148, 268], [-131, 268], [-120, 281], [-106, 285], [-98, 294]],
        [[104, 232], [91, 228], [65, 228], [44, 217], [28, 217], [18, 210]],
        [[-50, 163], [-47, 173], [-58, 184], [-57, 196]],
    ];
    for (const points of cracks) {
        for (let i = 1; i < points.length; i++) {
            g.stroke(points[i - 1], points[i], 0.6 + i * 0.075, -0.16,
                (x, y) => scaleColor(concrete(x, y), 0.78));
        }
    }
    for (let i = 0; i < 144; i++) {
        const x = grain(i, 19) * 313, y = 354 + grain(i, 6) * 378;
        const length = 1.2 + Math.abs(grain(i, 41)) * 12;
        g.stroke([x, y], [x + length, y + grain(i, 70) * 4], 0.35 + Math.abs(grain(i, 78)), -0.13,
            (xx, yy) => scaleColor(concrete(xx, yy), 1 + 0.29 * grain(i, 83)));
    }
}

function addServiceEdges(g: ArenaGeometry): void {
    const serviceY = 348;
    const grateX = -159;
    g.box(grateX, -0.18, ground(serviceY), 8.8, 1.1, 489, DARK, 0.6);
    for (const x of [grateX - 4.6, grateX + 4.6]) {
        g.box(x, 0, ground(serviceY), 1.6, 1.8, 489, DEEP_STEEL, 0.3);
    }
    for (let i = 0; i < 64; i++) {
        const y = 158 + i * 6.05;
        g.box(grateX, 0.22, ground(y), 7.2, 0.85, 1.15, i % 8 === 7 ? STEEL : 0x3a5156);
    }
    for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
            const y = 175 + i * 50.6;
            const x = side * 171;
            g.box(x, -0.15, ground(y), 12.6, 2.8, 60, i % 3 ? WALL : 0x646557, 1.5);
            g.box(x - side * 2.5, 1.2, ground(y), 1.7, 0.75, 59.3, DARK);
            if (i % 3 === 1) continue;
            for (let stripe = -2; stripe <= 2; stripe++) {
                g.box(x, 2.67, ground(y + stripe * 7.7), 6.8, 0.23, 4.3,
                    stripe % 2 ? DARK : YELLOW, 0.1, side * 0.42);
            }
        }
    }
    for (let i = 0; i < 11; i++) {
        const x = -157 + i * 31.45;
        g.box(x, -0.1, ground(147), 30.4, 3.4, 12.8, i % 2 ? 0x575c54 : 0x677068, 1.6);
        g.box(x, 3.02, ground(151), 22.4, 0.4, 0.9, i % 3 ? YELLOW : OXIDE, 0.21);
    }
    for (const [x, y, w, d] of [[118, 396, 48, 34], [-122, 236, 29, 31], [103, 180, 45, 31]]) {
        const z = ground(y);
        g.box(x, -0.13, z, w + 2.2, 0.48, d + 2.2, DARK, 1.6);
        g.box(x, 0.14, z, w, 0.47, d, 0x586973, 1.2);
        g.box(x, 0.57, z, w - 3.2, 0.21, d - 3.4, 0x40515d, 0.9);
        for (const sign of [-1, 1]) {
            g.box(x + sign * (w / 2 - 7.3), 0.77, z, 2.4, 0.14, 7.3, DEEP_STEEL, 0.5);
        }
        for (const dx of [-w / 2 + 2.5, w / 2 - 2.5]) {
            for (const dz of [-d / 2 + 2.4, d / 2 - 2.4]) {
                g.cylinder(x + dx, 0.73, z + dz, 0.85, 0.66, 0.22, STEEL);
                g.box(x + dx, 0.94, z + dz, 0.85, 0.04, 0.28, DEEP_STEEL);
            }
        }
    }
}

function addShutter(g: ArenaGeometry): void {
    const z = ground(YARD_WALL_Y);
    g.box(0, -0.25, z - 4.4, 360, 44, 9.8, WALL, 1.3);
    g.box(0, 0, z + 2, 243, 39, 6, DARK, 1.5);
    for (let i = 0; i < 13; i++) {
        const y = 2.45 + 2.68 * i;
        g.box(0, y, z + 4.5, 232, 2.35, 3.6, i % 4 === 0 ? 0x305c61 : 0x2e4149, 0.42);
        g.box(0, y + 0.3, z + 7.8, 230, 0.42, 0.72, i % 3 ? 0x53777b : 0x5c827e);
    }
    for (const side of [-1, 1]) {
        const x = side * 119;
        g.box(x, 0, z + 4.5, 6.6, 40.5, 5.7, DEEP_STEEL, 1.1);
        g.box(x - side * 2.3, 1.7, z + 8.4, 1.24, 36.6, 0.7, STEEL, 0.15);
        g.box(side * 155, 0, z + 2.5, 20, 42, 4.4, 0x5a605a, 0.8);
    }
    g.box(0, 0, z + 8, 230, 2, 6.7, STEEL, 0.85);
    g.box(-42, 0.45, z + 14, 42, 0.55, 2, OXIDE, 0.3);
    g.box(77, 0.45, z + 12.8, 19, 0.55, 1, OXIDE, 0.3);
    for (const x of [-101, 102]) g.box(x, 3.4, z + 8.35, 6.6, 1.01, 1.3, 0x8d8161, 0.24);
    g.box(0, 35.4, z + 7.2, 235, 3.2, 2.1, 0x375057, 0.6);
}

function addWallFixtures(g: ArenaGeometry): void {
    const z = ground(YARD_WALL_Y) + 10;
    for (const side of [-1, 1]) {
        const x = side * 138;
        g.box(x, 19.2, z - 3, 11, 16, 3.6, DARK, 1.5);
        g.box(x, 28.5, z - 1, 5.1, 5.6, 8, DEEP_STEEL, 0.9);
        g.cylinder(x, 23.5, z + 7.6, 6.2, 3.2, 6.5, DEEP_STEEL);
        g.cylinder(x, 23.1, z + 7.6, 5.8, 6.1, 0.65, OXIDE);
        g.cylinder(x, 18.2, z + 7.6, 2.1, 3.8, 5.1, 0xffd080);
        for (let rib = 0; rib < 5; rib++) {
            const angle = rib * Math.PI * 0.4;
            const dx = Math.cos(angle), dz = Math.sin(angle);
            g.tube([[x + dx * 3.7, 23.3, z + 7.6 + dz * 3.7], [x + dx * 4.0, 20.3, z + 7.6 + dz * 4.0],
                [x + dx * 1.8, 17.7, z + 7.6 + dz * 1.8]], 0.35, 0x966649, 5);
        }
        g.box(x, 14.7, z - 2.4, 1.6, 4.4, 1, OXIDE, 0.18);
    }
    const cable: Position[] = [];
    for (let i = 0; i <= 76; i++) {
        const angle = i * 2 * Math.PI * 2.65 / 76;
        const radius = 11.9 - 3.65 * i / 76;
        cable.push([147 + radius * Math.cos(angle), 11.4 + radius * 0.77 * Math.sin(angle), z + 4.4 + i * 0.038]);
    }
    g.box(147, 18.8, z + 3.9, 4.5, 5.2, 5.8, OXIDE, 1.05);
    g.tube(cable, 1.46, 0x647d70);
    g.tube([[136.5, 11.6, z + 5], [132, 5.5, z + 7], [129, 1.1, z + 13], [125, 0.9, z + 15]], 1.37, DEEP_STEEL);
    g.box(123.5, 0.28, z + 16, 3.8, 1.9, 2.9, AMBER, 0.45);
    g.box(-159, 5.4, z + 2.5, 8.4, 14.8, 4.1, DEEP_STEEL, 1.04);
    g.box(-159, 9.1, z + 6.7, 6.4, 7.7, 1.26, STEEL, 0.45);
    g.box(-158, 14.6, z + 8.1, 1.8, 1.8, 0.45, 0x84b3a2, 0.21);
}

function buildYard(): Mesh {
    const geometry = new ArenaGeometry();
    addConcreteDetails(geometry);
    addServiceEdges(geometry);
    addShutter(geometry);
    addWallFixtures(geometry);
    return geometry.mesh();
}

type Deck = 'wet' | 'tiles' | 'asphalt' | 'concrete' | 'steel' | 'cold';
type Site = { readonly deck: Deck; readonly paint: number; readonly edge: number; readonly amber?: boolean };
const sites: Readonly<Record<string, Site>> = {
    '02': { deck: 'wet', paint: 0x29453e, edge: 0x60766b },
    '03': { deck: 'tiles', paint: 0x3a4850, edge: 0x71858d },
    '04': { deck: 'asphalt', paint: 0x304249, edge: 0x687b80, amber: true },
    '05': { deck: 'concrete', paint: 0x34494c, edge: 0x728687 },
    '06': { deck: 'concrete', paint: 0x39474a, edge: 0x7e7669, amber: true },
    '07': { deck: 'cold', paint: 0x3a5164, edge: 0x819ca7 },
    '08': { deck: 'steel', paint: 0x36484b, edge: 0x6d8077 },
    '09': { deck: 'steel', paint: 0x364449, edge: 0x778383, amber: true },
    '10': { deck: 'asphalt', paint: 0x51473e, edge: 0x827363, amber: true },
    '11': { deck: 'steel', paint: 0x394654, edge: 0x777d8f },
    '12': { deck: 'tiles', paint: 0x3c4452, edge: 0x7b7b89 },
    '13': { deck: 'steel', paint: 0x324951, edge: 0x65888c },
    '14': { deck: 'tiles', paint: 0x51463f, edge: 0x817465, amber: true },
    '15': { deck: 'concrete', paint: 0x354b57, edge: 0x718e96 },
    '16': { deck: 'steel', paint: 0x38464b, edge: 0x747d7b },
    '17': { deck: 'concrete', paint: 0x4f443f, edge: 0x887364, amber: true },
    '18': { deck: 'steel', paint: 0x30484c, edge: 0x7f8871 },
    '19': { deck: 'tiles', paint: 0x38464b, edge: 0x747b79, amber: true },
    '20': { deck: 'steel', paint: 0x343e44, edge: 0x8d7261, amber: true },
};
const landmarks = { ...EARLY_ARENAS, ...LATE_ARENAS };

const facadeStart: Readonly<Record<string, number>> = {
    '01': 518, '02': 515, '03': 517, '04': 520, '05': 518,
    '06': 509, '07': 518, '08': 499, '09': 517, '10': 519,
    '11': 515, '12': 508, '13': 516, '14': 514, '15': 516,
    '16': 515, '17': 515, '18': 516, '19': 516, '20': 516,
};

function deckShade(site: Site, x: number, screenY: number): RGB {
    const color = rgb(site.paint);
    const noise = grain(x, screenY) * 3 + Math.sin(x * 0.033 + screenY * 0.023) * 1.7;
    const glow = Math.exp(-(((Math.abs(x) - 117) / 54) ** 2 + ((screenY - 525) / 65) ** 2));
    const sides = Math.max(0, (Math.abs(x) - 98) / 52);
    const damp = site.deck === 'wet' ? 1.3 * Math.sin(screenY * 0.28 + 0.58 * Math.sin(x * 0.039)) : 0;
    const floor = color.map(channel => channel + noise + damp - sides * 4);
    const light = site.amber ? [28, 14, 3] : [8, 14, 17];
    return [floor[0] + light[0] * glow, floor[1] + light[1] * glow, floor[2] + light[2] * glow];
}

function addDeck(geometry: ArenaGeometry, site: Site): void {
    geometry.surface((x, y) => deckShade(site, x, y));
    const seam: RGB = scaleColor(rgb(site.paint), site.deck === 'cold' ? 0.86 : 0.77);
    const seamHighlight: RGB = scaleColor(rgb(site.paint), 1.18);
    const paint: RGB = scaleColor(rgb(site.edge), 0.83);
    if (site.deck === 'steel' || site.deck === 'tiles' || site.deck === 'cold') {
        const tall = site.deck === 'tiles' ? 41 : 62;
        const wide = site.deck === 'tiles' ? 42 : 86;
        for (let y = 170, row = 0; y < 541; y += tall, row++) {
            geometry.stroke([-166, y], [166, y], 0.7, -0.04, () => seam);
            const nextY = Math.min(y + tall, 545);
            for (let x = -159 + (row % 2) * wide / 2; x <= 159; x += wide) {
                geometry.stroke([x, y], [x, nextY], 0.67, -0.025, () => seam);
                if (site.deck === 'steel' && y + 3 < nextY) {
                    geometry.box(x + 2.2, -0.06, ground(y + 2.8), 1.2, 0.25, 1.3, site.edge, 0.25);
                }
            }
        }
        if (site.deck === 'cold') {
            for (let y = 177; y < 542; y += 21) {
                geometry.stroke([-166, y], [-116 + 13 * grain(y, 17), y + 9], 1.4, -0.01, () => seamHighlight);
                geometry.stroke([165, y + 4], [116 + 17 * grain(y, 23), y + 14], 1.2, -0.01, () => seamHighlight);
            }
        }
    } else {
        for (let y = 181; y < 540; y += 23) {
            const x = grain(y, 141) * 315;
            geometry.stroke([x, y], [x + 3 + 9 * Math.abs(grain(y, 19)), y + 2], 1.0, -0.03, () => seam);
        }
        if (site.deck === 'asphalt') {
            for (let y = 166; y < 523; y += 43) geometry.stroke([0, y], [0, y + 22], 2.8, -0.01, () => paint);
        }
    }
    for (const side of [-1, 1]) {
        geometry.stroke([side * 158, 153], [side * 158, 545], 0.88, -0.015, () => paint);
        const x = side * 173;
        for (let y = 176; y < 552; y += 47) {
            geometry.box(x, -0.16, ground(y), 12.2, 2.4, 55.5, site.edge, 1.2);
            geometry.box(x - side * 4.8, 1.96, ground(y), 1.0, 0.36, 52.6, DEEP_STEEL, 0.1);
        }
    }
    for (let x = -155; x <= 158; x += 31) geometry.box(x, -0.17, ground(147), 29.8, 2.5, 10.8, site.edge, 0.9);
}

function yardFacade(g: ArenaGeometry): void {
    addShutter(g);
    addWallFixtures(g);
}

function scrollingFloor(g: ArenaGeometry, area: ArenaBounds, site: Site): void {
    const { left, right, bottom, top } = area;
    const width = right - left, depth = top - bottom;
    const tint = rgb(site.paint);
    const accent = site.amber ? [29, 18, 5] : [6, 13, 18];
    const overscan = 34;
    g.surface((x, y) => {
        const distance = Math.min(x - left, right - x, y - bottom, top - y);
        const exterior = Math.min(1, Math.max(0, -distance / 10));
        const aggregate = 4.2 * grain(x, y) + Math.sin(x * 0.03 + y * 0.02) * 2.65;
        const wetGrain = site.deck === 'wet' ? 1.7 * Math.sin(y * 0.26 + Math.sin(x * 0.039)) : 0;
        const nearLamp = (lampX: number, lampY: number) => Math.exp(-(((x - lampX) / 62) ** 2 + ((y - lampY) / 38) ** 2));
        const glow = nearLamp(left + width * 0.28, top - 18) + nearLamp(right - width * 0.28, top - 18)
            + 0.49 * nearLamp(left + 14, bottom + depth * 0.43) + 0.49 * nearLamp(right - 14, bottom + depth * 0.61);
        return [0, 1, 2].map(i => tint[i] + aggregate + wetGrain - 7 * exterior + accent[i] * glow) as RGB;
    }, { left: left - overscan, right: right + overscan, bottom: bottom - overscan, top: top + overscan },
    Math.ceil((width + overscan * 2) / 17), Math.ceil((depth + overscan * 2) / 17));

    const seam = scaleColor(tint, 0.76), lighter = scaleColor(tint, 1.12);
    const panelWidth = site.deck === 'tiles' ? 42 : site.deck === 'steel' || site.deck === 'cold' ? 78 : 118;
    const panelDepth = site.deck === 'tiles' ? 41 : site.deck === 'steel' || site.deck === 'cold' ? 58 : 102;
    const x0 = left + 5, x1 = right - 5, y0 = bottom + 5, y1 = top - 5;
    if (site.deck !== 'asphalt') {
        for (let y = y0, row = 0; y < y1; y += panelDepth, row++) {
            const end = Math.min(y + panelDepth, y1);
            if (row > 0) g.stroke([x0, y], [x1, y], 0.78, -0.2, () => seam);
            for (let x = x0 + (row % 2 ? 0.82 : 0.38) * panelWidth; x < x1; x += panelWidth) {
                g.stroke([x, y], [x, end], 0.72, -0.2, () => seam);
                if (site.deck === 'steel' && y + 7 < end) {
                    g.stroke([x + 2.0, y + 3.0], [x + 2.0, y + 5.2], 0.92, -0.18, () => lighter);
                }
            }
        }
    } else {
        const lanePaint = scaleColor(rgb(site.edge), 0.76);
        for (const road of [left + width * 0.29, right - width * 0.29]) {
            for (let y = y0 + 20; y < y1 - 22; y += 52) {
                g.stroke([road, y], [road, y + 17], 1.6, -0.19, () => lanePaint);
            }
        }
    }

    for (let i = 0; i < Math.ceil(width * depth / 1900); i++) {
        const x = left + width * (0.5 + grain(i, 47) * 0.94), y = bottom + depth * (0.5 + grain(i, 86) * 0.94);
        const span = 1.6 + 18 * Math.abs(grain(i, 161)), turn = grain(i, 131) * 10;
        g.stroke([x, y], [x + span, y + turn], 0.45 + Math.abs(grain(i, 120)), -0.17, () => i % 5 ? seam : lighter);
        if (site.deck === 'concrete' && i % 5 === 0) {
            g.stroke([x + span, y + turn], [x + span + 5.2, y + turn + 4.2], 0.58, -0.17, () => seam);
            g.stroke([x + span * 0.7, y + turn * 0.7], [x + span * 0.55, y + turn * 0.7 - 4.7], 0.49, -0.17, () => seam);
        }
    }
}

function scrollingBoundary(g: ArenaGeometry, area: ArenaBounds, site: Site): void {
    const { left, right, bottom, top } = area;
    const centerX = (left + right) / 2, centerY = (bottom + top) / 2;
    const width = right - left, depth = top - bottom;
    const warning = rgb(site.amber ? 0xccac6a : 0xa4b1a0);
    const paint = rgb(site.amber ? 0x7e704e : 0x526665);
    // Paint the exact combat limit; all raised ironwork sits across it on the service apron.
    for (const x of [left, right]) g.stroke([x, bottom], [x, top], 0.88, -0.14, () => paint);
    for (const y of [bottom, top]) g.stroke([left, y], [right, y], 0.88, -0.14, () => paint);
    for (const side of [-1, 1]) {
        const x = side < 0 ? left : right;
        const y = side < 0 ? bottom : top;
        for (let position = bottom + 2; position < top - 11; position += 20) {
            g.stroke([x + side * 2, position + 2.3], [x + side * 2, position + 10.3], 2.5, -0.12, () => warning);
        }
        for (let position = left + 2; position < right - 11; position += 20) {
            g.stroke([position + 2.3, y + side * 2], [position + 10.3, y + side * 2], 2.5, -0.12, () => warning);
        }
        g.box(x + side * 9, -0.23, ground(centerY), 7, 0.34, depth / GROUND_PROJECTION, DARK);
        g.box(x + side * 12.8, -0.13, ground(centerY), 1.9, 1.32, depth / GROUND_PROJECTION, site.edge);
        g.box(centerX, -0.13, ground(y + side * 11), width + 20, 1.16, 2.3, site.edge);
        for (let at = bottom + 8; at < top - 5; at += 10.8) {
            const paint = Math.floor((at - bottom) / 10.8) % 5 ? DEEP_STEEL : STEEL;
            g.box(x + side * 9, 0.05, ground(at), 6.6, 0.5, 1.1, paint);
        }
        for (let at = bottom + 27; at < top - 22; at += 84) {
            const z = ground(at), rail = x + side * 15.2;
            g.box(rail, -0.05, z, 4.2, 5.2, 7.6, DEEP_STEEL, 0.45);
            g.box(rail, 4.8, z, 3.8, 0.42, 4.5, site.amber ? YELLOW : STEEL, 0.23);
        }
        for (let at = left + 46; at < right - 22; at += 79) {
            g.box(at, -0.16, ground(y + side * 6.6), 21, 0.32, 2.2, site.edge, 0.35);
        }
    }
}

function buildScrollingSite(stageId: string, bounds: ArenaBounds): Mesh {
    const g = new ArenaGeometry();
    const site = sites[stageId] ?? { deck: 'concrete', paint: 0x354047, edge: 0x66736c, amber: true };
    const area = { left: bounds.left - SCREEN_CENTER_X, right: bounds.right - SCREEN_CENTER_X,
        bottom: bounds.bottom, top: bounds.top };
    scrollingFloor(g, area, site);
    scrollingBoundary(g, area, site);
    g.northFacade(facadeStart[stageId], area.top + 1, stageId === '01' ? yardFacade : landmarks[stageId]);
    return g.mesh();
}

function buildSite(stageId: string, bounds?: ArenaBounds): Mesh {
    if (bounds) return buildScrollingSite(stageId, bounds);
    if (stageId === '01') return buildYard();
    const geometry = new ArenaGeometry();
    addDeck(geometry, sites[stageId]);
    landmarks[stageId](geometry);
    return geometry.mesh();
}

/** Shared models for arena scenery. Yard geometry was authored from the project's yard illustration. */
export class PrototypeArenaMeshes {
    private material?: Material;
    private current?: { node: Node; mesh: Mesh };

    static supports(stageId: string): boolean {
        return stageId === '01' || Object.prototype.hasOwnProperty.call(landmarks, stageId) && !!sites[stageId];
    }

    create(stageId: string, parent: Node, layer: number, bounds?: ArenaBounds): Node | null {
        if (!PrototypeArenaMeshes.supports(stageId)) return null;
        const mesh = buildSite(stageId, bounds);
        this.releaseStage();
        if (!this.material) {
            this.material = new Material();
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        }
        const node = new Node('3D Arena ' + stageId);
        if (!bounds) node.setScale(330 / 360, 1, 1);
        node.layer = layer;
        parent.addChild(node);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(this.material, 0);
        this.current = { node, mesh };
        return node;
    }

    destroy(): void {
        this.releaseStage();
        this.material?.destroy();
        this.material = undefined;
    }

    private releaseStage(): void {
        if (!this.current) return;
        this.current.node.active = false;
        this.current.node.destroy();
        this.current.mesh.destroy();
        this.current = undefined;
    }
}
