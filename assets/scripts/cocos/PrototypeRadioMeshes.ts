import { Material, Mesh, MeshRenderer, Node, utils } from 'cc';

export const RADIO_MODEL_KEYS = ['radio-aruan', 'radio-chenqi'] as const;
export type RadioModelId = typeof RADIO_MODEL_KEYS[number];

type Point = readonly [number, number, number];
type RGB = readonly [number, number, number];
type Section = readonly [height: number, width: number, depth: number, center: number];
type Shade = (point: Point, normal: Point) => RGB;

const TURN = 2 * Math.PI;
const HEAD_SIDES = 48;
const oxidizedSteel = 0x72858a;
const nearlyBlack = 0x222a2d;
const coatTeal = 0x466467;
const coatSlate = 0x767b7b;
const ochre = 0xc79550;
const scale = (a: Point, m: number): Point => [a[0] * m, a[1] * m, a[2] * m];
const plus = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const minus = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Point, b: Point): Point => [
    a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0],
];
const length = (a: Point): number => Math.hypot(...a);
const norm = (a: Point): Point => scale(a, 1 / (length(a) || 1));
const gaussian = (value: number, width: number): number => Math.exp(-((value / width) ** 2));
const smooth = (v: number): number => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const rgb = (color: number): RGB => [((color >>> 16) & 255) / 255, ((color >>> 8) & 255) / 255, (color & 255) / 255];
const tint = (a: RGB, b: RGB, t: number): RGB => [
    a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

function studio(color: RGB, normal: Point, skin = false): RGB {
    const key = Math.max(0, dot(normal, [0.66, 0.72, -0.22]));
    const rim = Math.max(0, dot(normal, [-0.44, 0.14, 0.82]));
    const base = skin ? 0.73 : 0.65;
    const spread = skin ? 0.29 : 0.36;
    const light = base + spread * key;
    return [color[0] * (light + rim * 0.07), color[1] * (light + rim * 0.14), color[2] * (light + rim * 0.21)];
}

/** The portrait surfaces carry their lighting in vertex colors so the radio atlas shares one material. */
class PortraitGeometry {
    private readonly points: Point[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    private append(points: readonly Point[], indices: readonly number[], color: Shade): void {
        const normal = points.map<Point>(() => [0, 0, 0]);
        const offset = this.points.length;
        for (let i = 0; i < indices.length; i += 3) {
            const a = indices[i], b = indices[i + 1], c = indices[i + 2];
            const face = cross(minus(points[b], points[a]), minus(points[c], points[a]));
            if (length(face) < 1e-9) continue;
            normal[a] = plus(normal[a], face);
            normal[b] = plus(normal[b], face);
            normal[c] = plus(normal[c], face);
            this.indices.push(offset + a, offset + b, offset + c);
        }
        points.forEach((point, i) => {
            this.points.push(point);
            this.colors.push(...color(point, norm(normal[i])).map(value => Math.max(0, Math.min(1, value))), 1);
        });
    }

    ribbon(points: readonly Point[], indices: readonly number[], color: number, flat = false): void {
        const value = rgb(color);
        this.append(points, indices, (_point, normal) => flat ? value : studio(value, normal));
    }

    shell(sections: readonly Point[][], color: Shade, caps = true): void {
        const sides = sections[0].length;
        const points = sections.flat();
        const indices: number[] = [];
        for (let row = 1; row < sections.length; row++) {
            for (let i = 0; i < sides; i++) {
                const next = (i + 1) % sides;
                const prior = (row - 1) * sides, current = row * sides;
                indices.push(prior + i, prior + next, current + next, prior + i, current + next, current + i);
            }
        }
        if (caps) {
            const top = (sections.length - 1) * sides;
            for (let i = 1; i < sides - 1; i++) indices.push(0, i + 1, i, top, top + i, top + i + 1);
        }
        this.append(points, indices, color);
    }

    loft(sections: readonly Section[], color: number, sides = 28): void {
        const rings = sections.map(([y, width, depth, x]) => Array.from({ length: sides }, (_, i): Point => {
            const angle = TURN * i / sides;
            return [x + Math.cos(angle) * depth, y, -Math.sin(angle) * width];
        }));
        this.shell(rings, (_point, normal) => studio(rgb(color), normal));
    }

    tube(path: readonly Point[], radii: readonly number[], color: number, sides = 8): void {
        const rings = path.map((center, i): Point[] => {
            const axis = norm(minus(path[Math.min(i + 1, path.length - 1)], path[Math.max(0, i - 1)]));
            const fixed: Point = Math.abs(axis[2]) < 0.89 ? [0, 0, 1] : [0, 1, 0];
            const right = norm(minus(fixed, scale(axis, dot(axis, fixed))));
            const up = cross(axis, right);
            const radius = radii[i];
            return Array.from({ length: sides }, (_, segment) => {
                const angle = TURN * segment / sides;
                return plus(center, plus(scale(right, Math.cos(angle) * radius), scale(up, Math.sin(angle) * radius)));
            });
        });
        this.shell(rings, (_point, normal) => studio(rgb(color), normal));
    }

    mesh(): Mesh {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const point of this.points) for (let axis = 0; axis < 3; axis++) {
            min[axis] = Math.min(min[axis], point[axis]);
            max[axis] = Math.max(max[axis], point[axis]);
        }
        const center = min.map((v, i) => (v + max[i]) / 2);
        const factor = 1 / Math.max(...max.map((v, i) => v - min[i]));
        const positions = this.points.flatMap(point => point.map((v, i) => (v - center[i]) * factor));
        return utils.createMesh({ positions, colors: this.colors, indices: this.indices }, undefined, { calculateBounds: true });
    }
}

const aruanProfile: readonly Section[] = [
    [-0.018, 0.043, 0.087, 0.071], [0.006, 0.100, 0.128, 0.048],
    [0.034, 0.142, 0.154, 0.031], [0.068, 0.165, 0.164, 0.023],
    [0.087, 0.175, 0.173, 0.020], [0.113, 0.189, 0.180, 0.017],
    [0.139, 0.201, 0.192, 0.013], [0.168, 0.210, 0.193, 0.008],
    [0.201, 0.216, 0.203, 0.004], [0.232, 0.218, 0.209, 0.002],
    [0.256, 0.219, 0.216, 0], [0.286, 0.220, 0.222, 0],
    [0.323, 0.229, 0.215, -0.006], [0.374, 0.231, 0.204, -0.009],
    [0.427, 0.213, 0.183, -0.018], [0.478, 0.164, 0.146, -0.022],
    [0.508, 0.109, 0.09, -0.029], [0.526, 0.034, 0.041, -0.032],
];

const chenProfile: readonly Section[] = [
    [-0.034, 0.060, 0.089, 0.044], [-0.01, 0.112, 0.149, 0.032],
    [0.015, 0.156, 0.157, 0.023], [0.042, 0.170, 0.161, 0.028],
    [0.071, 0.181, 0.176, 0.021], [0.101, 0.191, 0.189, 0.013],
    [0.127, 0.204, 0.181, 0.012], [0.151, 0.217, 0.189, 0.014],
    [0.181, 0.222, 0.203, 0.010], [0.211, 0.229, 0.218, 0.002],
    [0.244, 0.226, 0.220, 0], [0.278, 0.232, 0.231, -0.003],
    [0.318, 0.232, 0.214, -0.008], [0.365, 0.239, 0.212, -0.010],
    [0.416, 0.229, 0.199, -0.019], [0.469, 0.179, 0.157, -0.033],
    [0.502, 0.129, 0.103, -0.034], [0.525, 0.047, 0.043, -0.038],
];

function frontRelief(y: number, z: number, elder: boolean): number {
    const t = Math.abs(z);
    const eyeY = elder ? 0.211 : 0.242;
    const eye = gaussian(y - eyeY, 0.041) * gaussian(t - 0.095, 0.056);
    const arch = gaussian(y - eyeY - 0.047, 0.023) * gaussian(t - 0.101, 0.065);
    const cheek = gaussian(y - 0.167, 0.04) * gaussian(t - 0.128, 0.060);
    const tip = gaussian(y - (elder ? 0.117 : 0.133), elder ? 0.023 : 0.024) * gaussian(z, 0.040);
    const bridge = gaussian(y - 0.190, elder ? 0.088 : 0.071) * gaussian(z, 0.049);
    const noseWing = gaussian(y - (elder ? 0.107 : 0.126), 0.022) * gaussian(t - 0.038, 0.028);
    const lips = gaussian(y - (elder ? 0.054 : 0.072), 0.032) * gaussian(z, 0.074);
    return -0.030 * eye + (elder ? 0.023 : 0.014) * arch + 0.031 * cheek
        + (elder ? 0.086 : 0.058) * tip + 0.047 * bridge + 0.029 * noseWing + 0.019 * lips;
}

function frontAt(y: number, z: number, elder: boolean): number {
    const outline = elder ? chenProfile : aruanProfile;
    const above = Math.min(outline.length - 1, Math.max(1, outline.findIndex(section => section[0] >= y)));
    const [base, w0, d0, c0] = outline[above - 1], [top, w1, d1, c1] = outline[above];
    const t = Math.max(0, Math.min(1, (y - base) / (top - base)));
    const width = w0 + (w1 - w0) * t, depth = d0 + (d1 - d0) * t;
    const shape = Math.sqrt(Math.max(0, 1 - (z / width) ** 2));
    return c0 + (c1 - c0) * t + depth * shape + frontRelief(y, z, elder);
}

function skinColor([x, y, z]: Point, elder: boolean): RGB {
    const surface = elder ? rgb(0xc59070) : rgb(0xd49b72);
    const warmer = gaussian(y - 0.166, 0.05) * gaussian(Math.abs(z) - 0.135, 0.079) * smooth((x + 0.07) / 0.19);
    const liner = gaussian(y - (elder ? 0.205 : 0.241), 0.044) * gaussian(Math.abs(z) - 0.122, 0.068)
        * smooth((x + 0.05) / 0.20);
    const base = tint(tint(surface, rgb(0xc58262), warmer * 0.44), rgb(0x936851), liner * (elder ? 0.27 : 0.15));
    const beard = (1 - smooth((y - 0.024) / 0.070)) * smooth((x - 0.04) / 0.15);
    return elder ? tint(base, rgb(0x7f7771), beard * 0.57) : base;
}

function face(g: PortraitGeometry, elder: boolean): void {
    const outline = elder ? chenProfile : aruanProfile;
    const rings = outline.map(([y, width, depth, x0]) => Array.from({ length: HEAD_SIDES }, (_, i): Point => {
        const angle = TURN * i / HEAD_SIDES, toward = Math.cos(angle), z = -Math.sin(angle) * width;
        return [x0 + toward * depth + smooth(toward * 1.65) * frontRelief(y, z, elder), y, z];
    }));
    g.shell(rings, (point, normal) => studio(skinColor(point, elder), normal, true));
    for (const side of [-1, 1]) {
        const z = side * (elder ? 0.215 : 0.211);
        g.tube([[-0.049, 0.129, z], [-0.089, 0.177, z * 1.12], [-0.074, 0.225, z * 1.11], [-0.028, 0.217, z * 1.08]],
            [0.011, 0.025, 0.023, 0.014], elder ? 0xa86e58 : 0xca946f);
    }
}

function crease(g: PortraitGeometry, elder: boolean, z0: number, z1: number, center: number,
    depth: number, height: number, color: number, arch = 0, slope = 0): void {
    const points: Point[] = [], indices: number[] = [];
    for (let i = 0; i <= 10; i++) {
        const t = i / 10, arc = Math.sin(Math.PI * t);
        const z = z0 + (z1 - z0) * t, y = center + arch * arc + slope * (t - 0.5);
        const bottom = y - height * (0.12 + arc) * 0.5, top = y + height * (0.12 + arc) * 0.5;
        points.push([frontAt(bottom, z, elder) + depth, bottom, z], [frontAt(top, z, elder) + depth, top, z]);
        if (i) {
            const start = i * 2 - 2;
            indices.push(start, start + 1, start + 3, start, start + 3, start + 2);
        }
    }
    g.ribbon(points, indices, color, true);
}

function features(g: PortraitGeometry, elder: boolean): void {
    const y = elder ? 0.218 : 0.246;
    for (const side of [-1, 1]) {
        const z = side * (elder ? 0.103 : 0.098);
        crease(g, elder, z - 0.063, z + 0.058, y, 0.009, 0.024, elder ? 0x604d46 : 0x66483f, 0.013, side * 0.010);
        crease(g, elder, z - 0.049, z + 0.049, y - 0.007, 0.013, 0.010, elder ? 0xc4aa90 : 0xd2baa2, 0.010, side * 0.008);
        crease(g, elder, z - 0.006, z + 0.019, y - 0.004, 0.016, 0.015, 0x383437, 0.007);
        crease(g, elder, z - 0.062, z + 0.065, y + 0.042, 0.011, elder ? 0.017 : 0.023,
            elder ? 0x635957 : 0x3d3330, 0.015, side * 0.013);
        crease(g, elder, side * 0.029 - 0.013, side * 0.029 + 0.013, elder ? 0.107 : 0.122,
            0.012, 0.009, 0x8e5449);
        if (elder) crease(g, true, z - 0.047, z + 0.057, y - 0.036, 0.006, 0.006, 0x9f6e5f, 0.005);
    }
    crease(g, elder, -0.063, 0.065, elder ? 0.051 : 0.070, 0.012, 0.013, elder ? 0x7f5450 : 0x915750, 0.008, elder ? 0.002 : -0.007);
    crease(g, elder, -0.049, 0.049, elder ? 0.039 : 0.059, 0.010, 0.008, elder ? 0xb3806a : 0xca8b76, 0.003);
}

function hairColor(angle: number, drape: number, elder: boolean): RGB {
    const wave = 0.5 + 0.5 * Math.cos(angle * (elder ? 18 : 13) + drape * (elder ? 5.5 : 4.5));
    const streak = Math.pow(wave, elder ? 2.1 : 1.65);
    return elder ? tint(rgb(0x485154), rgb(0xa6aaa5), 0.16 + streak * 0.40)
        : tint(rgb(0x272e31), rgb(0x5a4d44), drape * 0.11 + streak * 0.49);
}

function hair(g: PortraitGeometry, elder: boolean): void {
    // Each section follows a single skull cap, with a varied hairline around the temples and nape.
    const radius = elder ? 0.271 : 0.264, y0 = elder ? 0.319 : 0.332;
    const rings: Point[][] = [];
    const divisions = 14;
    for (let row = divisions; row >= 0; row--) {
        const drape = row / divisions;
        rings.push(Array.from({ length: HEAD_SIDES }, (_, i): Point => {
            const angle = TURN * i / HEAD_SIDES, forward = Math.cos(angle);
            const front = Math.max(0, forward);
            const line = elder
                ? 0.174 + 0.215 * Math.pow(front, 0.57) + Math.sin(angle * 3 + 0.8) * 0.009
                : 0.145 + 0.252 * Math.pow(front, 0.71) + Math.sin(angle * 6 + 1.6) * 0.026;
            const end = Math.acos(Math.max(-0.98, Math.min(0.98, (line - y0) / radius)));
            const curl = drape * drape * (elder ? 0.004 : 0.012);
            const phase = 0.005 + (end - 0.005) * drape;
            const spread = Math.sin(phase) * (1 + curl * 13 * Math.sin(5 * angle + drape * 3));
            return [-0.014 + (elder ? 0.278 : 0.297) * spread * forward,
                y0 + radius * Math.cos(phase) + curl * Math.sin(4 * angle),
                -(elder ? 0.261 : 0.278) * spread * Math.sin(angle)];
        }));
    }
    g.shell(rings, (point, normal) => {
        const angle = Math.atan2(-point[2], point[0] + 0.014);
        return studio(hairColor(angle, (point[1] - y0) / radius, elder), normal);
    }, false);

    if (!elder) {
        g.tube([[0.026, 0.537, -0.095], [0.157, 0.514, -0.118], [0.225, 0.454, -0.127],
            [0.251, 0.399, -0.161], [0.213, 0.347, -0.196]], [0.027, 0.054, 0.063, 0.055, 0.014], 0x4b4038, 10);
        g.tube([[0.041, 0.555, -0.076], [0.161, 0.537, -0.095], [0.232, 0.479, -0.099],
            [0.264, 0.419, -0.132], [0.253, 0.388, -0.147]], [0.008, 0.013, 0.017, 0.013, 0.004], 0x70604e, 7);
        g.tube([[0.108, 0.509, 0.108], [0.178, 0.491, 0.164], [0.165, 0.407, 0.207],
            [0.111, 0.329, 0.244], [0.112, 0.259, 0.234]], [0.014, 0.045, 0.055, 0.042, 0.012], 0x433e38, 9);
        g.tube([[-0.124, 0.404, 0.198], [-0.157, 0.32, 0.250], [-0.125, 0.232, 0.242],
            [-0.125, 0.175, 0.206]], [0.025, 0.043, 0.040, 0.015], 0x463b35);
    } else {
        for (let i = 0; i < 5; i++) {
            const z = -0.158 + i * 0.070;
            const factor = Math.abs(z) / 0.17;
            g.tube([[0.240 - factor * 0.042, 0.404, z], [0.177 - factor * 0.029, 0.511 - factor * 0.021, z + 0.025],
                [0.035, 0.569 - factor * 0.035, z + 0.043], [-0.132, 0.505 - factor * 0.016, z + 0.037]],
            [0.006, 0.013, 0.014, 0.004], i % 2 ? 0x808b8b : 0x929d9b, 7);
        }
    }
}

function neckAndCoat(g: PortraitGeometry, elder: boolean): void {
    const coat = elder ? coatSlate : coatTeal;
    const trim = elder ? 0xa4a5a0 : ochre;
    g.loft([
        [-0.205, 0.147, 0.124, -0.034], [-0.097, 0.134, 0.137, -0.035],
        [0.005, 0.122, 0.142, -0.026], [0.055, 0.109, 0.136, -0.029],
    ], elder ? 0xb48368 : 0xc5926f, 28);
    g.loft([
        [-0.553, 0.361, 0.173, -0.020], [-0.525, 0.405, 0.209, -0.026],
        [-0.422, 0.475, 0.245, -0.030], [-0.303, 0.442, 0.252, -0.053],
        [-0.233, 0.387, 0.235, -0.046], [-0.178, 0.288, 0.182, -0.049],
        [-0.151, 0.209, 0.157, -0.042], [-0.129, 0.149, 0.138, -0.042],
    ], coat, 36);
    if (elder) {
        g.loft([
            [-0.179, 0.204, 0.162, -0.044], [-0.127, 0.178, 0.146, -0.032],
            [-0.071, 0.150, 0.136, -0.024], [-0.047, 0.142, 0.129, -0.025],
        ], 0x666d70, 28);
    }
    const throat: Point[] = [[0.161, -0.133, -0.106], [0.173, -0.133, 0.106], [0.235, -0.424, 0.067], [0.235, -0.427, -0.064]];
    g.ribbon(throat, [0, 2, 1, 0, 3, 2], elder ? 0x464e54 : 0x373f3e);
    for (const side of [-1, 1]) {
        const z = side;
        const lapel: Point[] = [
            [0.111, elder ? -0.037 : -0.102, z * 0.127], [0.103, -0.129, z * 0.240],
            [0.188, -0.310, z * 0.234], [0.218, -0.252, z * 0.090],
            [0.221, -0.425, z * 0.041], [0.180, -0.186, z * 0.056],
        ];
        const triangles = [0, 3, 1, 1, 3, 2, 0, 5, 3, 3, 5, 4];
        g.ribbon(lapel, side > 0 ? triangles : triangles.reverse(), elder ? 0x8e908e : 0x66827d);
        g.tube([
            [0.129, elder ? -0.058 : -0.116, z * 0.141], [0.146, -0.164, z * 0.244],
            [0.204, -0.285, z * 0.220], [0.215, -0.334, z * 0.154],
        ], [0.008, 0.011, 0.012, 0.005], elder ? 0xb2b2a5 : 0x91816b, 6);
        g.tube([
            [0.055, -0.312, z * 0.409], [0.114, -0.338, z * 0.387],
            [0.173, -0.381, z * 0.337], [0.193, -0.424, z * 0.276],
        ], elder ? [0.009, 0.012, 0.011, 0.006] : [0.012, 0.019, 0.019, 0.010], trim, 6);
    }
    g.tube([[0.188, -0.261, 0], [0.218, -0.392, 0], [0.232, -0.539, 0]], [0.014, 0.018, 0.012], nearlyBlack, 6);
    g.tube([[0.224, -0.358, 0], [0.232, -0.406, 0], [0.240, -0.424, 0]], [0.014, 0.022, 0.018], oxidizedSteel, 6);
}

function radio(g: PortraitGeometry): void {
    // A slim cup and boom near the visible temple preserve the haircut silhouette.
    g.tube([[-0.061, 0.178, 0.209], [-0.063, 0.173, 0.250], [-0.063, 0.173, 0.267]], [0.062, 0.073, 0.058], nearlyBlack, 12);
    g.tube([[-0.049, 0.178, 0.270], [-0.048, 0.178, 0.284]], [0.048, 0.044], 0x6d817e, 12);
    g.tube([[0.006, 0.145, 0.257], [0.109, 0.098, 0.231], [0.202, 0.061, 0.150], [0.232, 0.057, 0.104]],
        [0.012, 0.013, 0.011, 0.014], nearlyBlack, 8);
    g.tube([[0.224, 0.059, 0.124], [0.232, 0.057, 0.093]], [0.021, 0.019], 0x536061, 8);
    g.tube([[-0.113, 0.169, 0.248], [-0.137, 0.049, 0.216], [-0.082, -0.134, 0.203], [0.143, -0.236, 0.208]],
        [0.009, 0.009, 0.011, 0.011], nearlyBlack, 6);
    g.tube([[0.158, -0.235, 0.211], [0.193, -0.235, 0.211], [0.211, -0.235, 0.211]], [0.039, 0.046, 0.036], 0x4d5d5d, 8);
    g.tube([[0.214, -0.235, 0.211], [0.223, -0.235, 0.211]], [0.019, 0.014], 0x8ce0cc, 8);
}

function glasses(g: PortraitGeometry): void {
    for (const side of [-1, 1]) {
        const center = side * 0.108;
        const border: [number, number][] = [
            [-0.054, 0.254], [0.046, 0.251], [0.065, 0.236], [0.060, 0.185],
            [0.042, 0.167], [-0.046, 0.171], [-0.067, 0.195], [-0.067, 0.237], [-0.054, 0.254],
        ];
        const wire = border.map(([z, y]): Point => [frontAt(y, center + z, true) + 0.023, y, center + z]);
        g.tube(wire, wire.map(() => 0.009), 0x303439, 8);
        g.tube(wire.slice(0, 3).map(point => plus(point, [0.006, 0.004, 0])), [0.004, 0.006, 0.003], 0xa0a39b, 6);
        const hingeZ = side * 0.171, hingeY = 0.233;
        g.tube([[frontAt(hingeY, hingeZ, true) + 0.024, hingeY, hingeZ], [0.154, 0.234, side * 0.222],
            [0.014, 0.219, side * 0.251], [-0.066, 0.198, side * 0.248]], [0.009, 0.010, 0.011, 0.008], 0x45494b);
    }
    g.tube([[0.266, 0.224, -0.040], [0.292, 0.243, 0], [0.266, 0.224, 0.040]], [0.008, 0.010, 0.008], 0x3c4044, 8);
    g.tube([[0.194, -0.393, -0.217], [0.220, -0.386, -0.215], [0.236, -0.376, -0.216]],
        [0.037, 0.040, 0.031], 0xa4987d, 8);
    g.tube([[0.239, -0.371, -0.242], [0.242, -0.367, -0.2]], [0.007, 0.006], 0x365c66, 6);
}

function buildRadio(elder: boolean): Mesh {
    const g = new PortraitGeometry();
    neckAndCoat(g, elder);
    face(g, elder);
    features(g, elder);
    hair(g, elder);
    if (elder) glasses(g);
    else radio(g);
    return g.mesh();
}

/** Original geometry based on the project's painted radio-cast guide. */
export class PrototypeRadioMeshes {
    private readonly meshes = new Map<RadioModelId, Mesh>();
    private readonly instances = new Set<Node>();
    private material?: Material;

    create(id: RadioModelId, parent: Node, layer: number): Node {
        let mesh = this.meshes.get(id);
        if (!mesh) {
            mesh = buildRadio(id === 'radio-chenqi');
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
        for (const instance of this.instances) if (instance.isValid) instance.destroy();
        this.instances.clear();
        for (const mesh of this.meshes.values()) mesh.destroy();
        this.meshes.clear();
        this.material?.destroy();
        this.material = undefined;
    }
}
