import { Material, Mesh, MeshRenderer, Node } from 'cc';
import { CAMPAIGN_CHAPTERS, CAMPAIGN_MAP_HEIGHT } from '../campaign/CampaignCatalog';
import { ArenaGeometry } from './PrototypeArenaMeshes';

type Point = readonly [x: number, y: number];
type WorldPoint = [x: number, y: number, z: number];
type Chapter = typeof CAMPAIGN_CHAPTERS[number];

const MAP_WIDTH = 360;
const PROJECTION = 0.8;
const ink = 0x172630;
const basalt = 0x283841;
const zinc = 0x54707a;
const steel = 0x41545a;
const teal = 0x365460;
const concrete = 0x64716d;
const copper = 0x745245;
const brass = 0xa18457;
const light = 0xbc9f6b;

const palettes = {
    '01': { ground: 0x24383c, accent: 0x47645b, road: 0x3d4a47, curb: 0x495953 },
    '02': { ground: 0x303d3e, accent: 0x65665a, road: 0x424b4d, curb: 0x535a57 },
    '03': { ground: 0x31384b, accent: 0x58556a, road: 0x434958, curb: 0x525467 },
    '04': { ground: 0x303e43, accent: 0x53635f, road: 0x414f51, curb: 0x515f5c },
} as const;
type ChapterId = keyof typeof palettes;
type Palette = typeof palettes[ChapterId];

function world(x: number, y: number, height = 0): WorldPoint {
    return [x - MAP_WIDTH / 2, height, (y - CAMPAIGN_MAP_HEIGHT / 2) / PROJECTION];
}

function box(g: ArenaGeometry, x: number, y: number, h: number, w: number, d: number, height: number,
    paint: number, bevel = 0, yaw = 0): void {
    const [wx, wy, wz] = world(x, y, h);
    g.box(wx, wy, wz, w, height, d / PROJECTION, paint, bevel, yaw);
}

function cylinder(g: ArenaGeometry, x: number, y: number, h: number, radius: number, top: number,
    height: number, paint: number): void {
    const [wx, wy, wz] = world(x, y, h);
    g.cylinder(wx, wy, wz, radius, top, height, paint);
}

function tube(g: ArenaGeometry, points: readonly (readonly [x: number, y: number, height: number])[],
    radius: number, paint: number, sides = 6): void {
    g.tube(points.map(([x, y, height]) => world(x, y, height)), radius, paint, sides);
}

function clipStrip(points: Point[]): Point[] {
    for (const [axis, limit, sign] of [[0, 0, 1], [0, MAP_WIDTH, -1], [1, 0, 1], [1, CAMPAIGN_MAP_HEIGHT, -1]] as const) {
        const clipped: Point[] = [];
        for (let i = 0; i < points.length; i++) {
            const a = points[i], b = points[(i + 1) % points.length];
            const aInside = (a[axis] - limit) * sign >= 0;
            const bInside = (b[axis] - limit) * sign >= 0;
            if (aInside) clipped.push(a);
            if (aInside !== bInside) {
                const t = (limit - a[axis]) / (b[axis] - a[axis]);
                const crossing: [number, number] = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
                crossing[axis] = limit;
                clipped.push(crossing);
            }
        }
        points = clipped;
    }
    return points;
}

function strip(g: ArenaGeometry, points: readonly Point[], width: number, height: number, paint: number,
    lateralOffset = 0): void {
    const sections = points.map(([x, y], index): [Point, Point] => {
        const first = points[Math.max(0, index - 1)];
        const last = points[Math.min(points.length - 1, index + 1)];
        const dx = last[0] - first[0], dy = last[1] - first[1];
        const length = Math.hypot(dx, dy) || 1;
        const nx = -dy / length, ny = dx / length;
        const left = lateralOffset + width / 2, right = lateralOffset - width / 2;
        return [[x + nx * left, y + ny * left], [x + nx * right, y + ny * right]];
    });
    for (let i = 1; i < sections.length; i++) {
        const polygon = clipStrip([sections[i - 1][0], sections[i][0], sections[i][1], sections[i - 1][1]]);
        for (let j = 1; j < polygon.length - 1; j++) {
            const [a, b, c] = [polygon[0], polygon[j], polygon[j + 1]];
            const signedArea = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
            if (Math.abs(signedArea) < 1e-7) continue;
            const triangle = signedArea > 0 ? [a, b, c] : [a, c, b];
            g.face(triangle.map(([x, y]) => world(x, y, height)), paint, false);
        }
    }
}

function mix(a: number, b: number, t: number): number {
    const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t);
    return channel(16) << 16 | channel(8) << 8 | channel(0);
}

function terrain(g: ArenaGeometry, theme: Palette): void {
    const dx = 20, dy = CAMPAIGN_MAP_HEIGHT / 52;
    for (let row = 0; row < 52; row++) {
        const y = row * dy;
        for (let col = 0; col < MAP_WIDTH / dx; col++) {
            const x = col * dx;
            const texture = Math.sin(col * 4.98 + row * 7.78) * 0.10 + Math.cos(col * 0.54 + row * 0.31) * 0.12;
            const tone = mix(theme.ground, theme.accent, Math.max(0, texture + 0.2));
            const a = world(x, y, -0.5), b = world(x + dx, y, -0.5);
            const c = world(x + dx, y + dy, -0.5), d = world(x, y + dy, -0.5);
            g.face([a, d, c], tone, false);
            g.face([a, c, b], mix(tone, theme.ground, 0.15), false);
        }
    }
}

function routeDistance([x, y]: Point, route: readonly Point[]): number {
    let distance = Infinity;
    for (let i = 1; i < route.length; i++) {
        const [ax, ay] = route[i - 1], [bx, by] = route[i];
        const dx = bx - ax, dy = by - ay;
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
        distance = Math.min(distance, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return distance;
}

function road(g: ArenaGeometry, points: readonly Point[], width: number, theme: Palette, elevation = 0): void {
    strip(g, points, width + 4.4, elevation + 0.033, theme.curb);
    strip(g, points, width, elevation + 0.075, theme.road);
    for (const side of [-1, 1]) {
        strip(g, points, 0.8, elevation + 0.093, mix(theme.road, theme.curb, 0.42), side * (width / 2 - 2));
    }
}

function watercourse(g: ArenaGeometry, points: readonly Point[], width: number, tone: number): void {
    strip(g, points, width + 14, -0.26, 0x273e43);
    strip(g, points, width, -0.18, tone);
    for (const offset of [-0.42, -0.31, -0.12, 0.18, 0.36, 0.44]) {
        strip(g, points, 0.65 + 2.3 * Math.abs(offset), -0.13, mix(tone, 0x49787b, 0.31), width * offset);
    }
}

function roofs(g: ArenaGeometry, x: number, y: number, w: number, d: number, height: number, paint: number): void {
    const over = 1.3;
    const west = x - w / 2 - over, east = x + w / 2 + over;
    const north = y - d / 2 - over, south = y + d / 2 + over;
    const ridge = height + Math.min(5.7, w * 0.17);
    const nw = world(west, north, height), sw = world(west, south, height);
    const ne = world(east, north, height), se = world(east, south, height);
    const nr = world(x, north, ridge), sr = world(x, south, ridge);
    g.face([nw, sw, sr, nr], paint);
    g.face([nr, sr, se, ne], mix(paint, ink, 0.18));
    g.face([sw, se, sr], mix(paint, steel, 0.23));
    tube(g, [[x, north, ridge + 0.2], [x, south, ridge + 0.2]], 0.65, mix(paint, zinc, 0.37), 5);
}

function house(g: ArenaGeometry, x: number, y: number, w: number, d: number, height: number,
    body: number, roof: number, lit = false): void {
    box(g, x, y, 0, w + 2.6, d + 2.5, 1.7, basalt, 1);
    box(g, x, y, 1.2, w, d, height, body, Math.min(w * 0.1, 1.8));
    const entry = y + d / 2;
    const panes = Math.min(7, Math.max(2, Math.floor(w / 7)));
    for (let i = 0; i < panes; i++) {
        const px = x - w * 0.37 + i * w * 0.74 / Math.max(1, panes - 1);
        box(g, px, entry + 0.15, height * 0.5, Math.min(2.85, w * 0.15), 0.8,
            Math.min(4.4, height * 0.26), lit && i % 3 !== 1 ? light : ink, 0.18);
    }
    const ledge = height + 1.27;
    if (roof !== body) roofs(g, x, y, w, d, ledge, roof);
    else {
        box(g, x, y, ledge, w + 2, d + 2, 1.6, mix(roof, zinc, 0.23), 0.8);
        box(g, x + w * 0.21, y + d * 0.15, ledge + 1.65, w * 0.25, d * 0.33, 2.45, steel, 0.5);
        box(g, x + w * 0.21, y + d * 0.15, ledge + 4.09, w * 0.21, d * 0.29, 0.65, mix(steel, zinc, 0.52));
    }
}

function grove(g: ArenaGeometry, centerX: number, centerY: number, count: number, radius: number, seed: number,
    route: readonly Point[], violet = false): void {
    for (let i = 0; i < count; i++) {
        const angle = i * 2.4 + seed;
        const r = radius * Math.sqrt((i + 0.6) / count);
        const x = centerX + r * Math.cos(angle);
        const y = centerY + r * Math.sin(angle);
        if (x < 9 || x > 351 || y < 15 || y > 1025 || routeDistance([x, y], route) < 26) continue;
        const h = 3.7 + Math.sin(i * 7 + seed) * 1.15;
        const color = mix(violet ? 0x34394d : 0x2e4341, violet ? 0x55556a : 0x496155, (Math.sin(i * 3.4) + 1) * 0.5);
        cylinder(g, x, y, -0.2, h * 0.94, h * 0.68, 3.0, mix(color, ink, 0.3));
        cylinder(g, x, y, 2.6, h * 1.05, 0.9, h * 1.23, color);
    }
}

function yardCrates(g: ArenaGeometry, x: number, y: number, columns: number, rows: number, color: number): void {
    for (let i = 0; i < columns; i++) {
        for (let j = 0; j < rows; j++) {
            if ((i + j * 2) % 5 === 4) continue;
            const dx = x + i * 12.1, dy = y + j * 11.8;
            const h = (i + j) % 3 === 0 ? 5.7 : 3.6;
            box(g, dx, dy, -0.1, 9.7, 9.8, h, mix(color, zinc, (i % 3) * 0.12), 0.48);
            box(g, dx, dy, h - 0.1, 8.75, 1.0, 0.58, mix(color, brass, 0.32));
        }
    }
}

function bollard(g: ArenaGeometry, x: number, y: number, color: number, lit = false): void {
    cylinder(g, x, y, 0, 2.5, 2.5, 1.05, color);
    cylinder(g, x, y, 0.9, 0.88, 0.75, 4.2, steel);
    cylinder(g, x, y, 4.9, 1.5, 1.2, 1.3, lit ? light : zinc);
}

function pylon(g: ArenaGeometry, x: number, y: number, height: number, width: number, paint = zinc): void {
    box(g, x, y, 0, width + 4.5, 14, 2.1, graphiteColor(paint), 1);
    const span = width * 0.5;
    for (const side of [-1, 1]) {
        tube(g, [[x + side * span, y + 5.5, 2], [x + side * span * 0.15, y, height]], 0.88, paint, 5);
    }
    tube(g, [[x, y - 6.0, 2], [x, y, height]], 0.89, steel, 5);
    for (let i = 0; i < 3; i++) {
        const a = i / 3, b = (i + 1) / 3;
        const left = (offset: number, side: number): [number, number, number] => [
            x + side * span * (1 - 0.85 * offset), y + 5.5 * (1 - offset), 2 + (height - 2) * offset,
        ];
        tube(g, [left(a, -1), left(b, 1)], 0.42, paint, 5);
        tube(g, [left(a, 1), left(b, -1)], 0.42, steel, 5);
        tube(g, [left(b, -1), left(b, 1)], 0.55, paint, 5);
    }
    box(g, x, y, height - 4, width * 0.78, 1.2, 1.35, paint, 0.28);
    cylinder(g, x, y, height, 0.91, 0.65, 4.2, paint);
    cylinder(g, x, y, height + 4, 1.16, 0.82, 1.35, light);
}

function graphiteColor(material: number): number {
    return mix(material, ink, 0.77);
}

function quay(g: ArenaGeometry, route: readonly Point[], theme: Palette): void {
    watercourse(g, [[235, -8], [211, 122], [251, 260], [285, 423], [214, 585], [149, 716],
        [193, 851], [235, 1048]], 87, 0x25464e);
    road(g, [[18, 66], [136, 112], [186, 159], [272, 171], [336, 116]], 17, theme);
    road(g, [[25, 966], [74, 866], [91, 774], [106, 708], [146, 662], [308, 639], [350, 588]], 16, theme);
    for (const [cx, cy, count, radius, seed] of [[72, 188, 37, 65, 1], [282, 231, 29, 57, 2], [54, 442, 42, 60, 3],
        [294, 500, 25, 54, 4], [49, 735, 27, 52, 5], [295, 886, 29, 58, 6], [62, 956, 21, 51, 7]]) {
        grove(g, cx, cy, count, radius, seed, route);
    }
    for (const [x, y, w, d, h] of [[91, 82, 28, 21, 12], [123, 84, 25, 24, 14],
        [287, 102, 27, 20, 15], [321, 103, 25, 18, 15], [273, 143, 27, 13, 14], [312, 150, 26, 16, 13],
        [95, 875, 29, 25, 18], [62, 901, 25, 21, 14], [110, 900, 25, 18, 16], [264, 951, 27, 21, 10],
        [299, 930, 24, 24, 11], [282, 969, 27, 21, 14]]) {
        house(g, x, y, w, d, h, 0x4c554e, copper, false);
    }
    house(g, 253, 546, 61, 43, 26, 0x54645c, 0x4a5447, true);
    house(g, 292, 582, 32, 24, 14, concrete, teal, true);
    for (const x of [223, 245, 266]) {
        tube(g, [[x, 656, 1.9], [x, 621, 2.5], [x, 597, 8.2], [x, 567, 9.5]], 4.1, 0x4f7071, 7);
    }
    for (const [x, y] of [[93, 671], [156, 636], [248, 616]] as const) bollard(g, x, y + 1, steel);
    for (const [x, y] of [[141, 685], [170, 671], [204, 659]]) {
        box(g, x, y, 0.35, 8, 6.0, 4.2, concrete, 0.55);
    }
    for (const [x, y] of [[47, 275], [317, 365], [286, 742], [89, 558]]) pylon(g, x, y, 30, 10.5, 0x727565);
}

function crane(g: ArenaGeometry, x: number, y: number, width: number, height: number): void {
    box(g, x, y, 0.10, width + 9, 18, 2.1, basalt, 1.6);
    const edge = width / 2 - 2;
    for (const side of [-1, 1]) {
        box(g, x + side * edge, y, 0, 5.8, 6.1, height, brass, 0.72);
        tube(g, [[x + side * edge, y + 6.7, 3.2], [x + side * edge, y, height - 2.5]], 1.1, steel, 5);
        box(g, x + side * edge, y + 4.5, 0, 5.5, 8, 1.9, concrete, 0.35);
    }
    box(g, x, y, height - 2.1, width + 2, 5.7, 4.97, copper, 0.65);
    box(g, x - width * 0.18, y + 0.2, height - 2.2, 7.1, 4.82, 3.15, brass, 0.35);
    tube(g, [[x - width * 0.18, y, height - 1.7], [x - width * 0.18, y, 8.6]], 0.48, ink, 5);
    box(g, x - width * 0.18, y, 8.45, 3.6, 1.5, 2.8, brass, 0.38);
}

function hospital(g: ArenaGeometry, x: number, y: number): void {
    box(g, x, y, 0, 107, 54, 2.3, 0x585d53, 3.1);
    house(g, x, y - 0.5, 51, 35, 31, 0x718083, 0x718083);
    house(g, x - 37, y + 3, 27, 29, 18, 0x768184, 0x768184);
    house(g, x + 37, y + 2, 29, 28, 18, 0x798783, 0x798783);
    box(g, x, y - 1.7, 33.1, 17.2, 15.6, 0.89, 0xa8a998, 0.9);
    box(g, x, y - 1.7, 34.05, 11.8, 3.4, 0.47, 0xa26060);
    box(g, x, y - 1.7, 34.1, 3.6, 10.5, 0.52, 0xa26060);
    box(g, x, y + 18.7, 4.1, 14, 4.2, 5.35, teal, 0.57);
    for (const side of [-1, 1]) box(g, x + side * 9, y + 18.9, 4, 1.1, 1.72, 1.8, zinc, 0.2);
}

function freight(g: ArenaGeometry, route: readonly Point[], theme: Palette): void {
    watercourse(g, [[36, -6], [51, 124], [25, 257], [19, 398], [28, 542], [41, 690],
        [35, 816], [24, 1046]], 76, 0x38545a);
    road(g, [[81, 1047], [75, 958], [97, 869], [125, 804], [134, 715], [93, 641], [87, 525], [105, 478]], 13, theme);
    road(g, [[327, 953], [317, 821], [313, 704], [343, 586], [337, 458], [308, 344], [311, 228]], 13, theme);
    for (const [cx, cy, n, r, s] of [[306, 311, 27, 51, 1], [107, 414, 29, 46, 2], [281, 556, 33, 54, 3],
        [73, 714, 20, 31, 4], [308, 787, 25, 39, 5], [273, 984, 30, 35, 6]]) {
        grove(g, cx, cy, n, r, s, route);
    }
    house(g, 146, 915, 74, 43, 25, 0x6c6554, 0x8f6b48, true);
    house(g, 179, 879, 41, 22, 17, 0x6f6659, copper);
    house(g, 103, 764, 67, 52, 26, 0x718184, 0x718184);
    for (const x of [87, 106, 119]) box(g, x, 754, 27.5, 7.7, 12, 3.6, zinc, 0.8);
    house(g, 288, 676, 63, 36, 24, 0x5c6969, 0x786a5d);
    house(g, 122, 559, 52, 33, 26, 0x62666a, 0x62666a);
    house(g, 150, 522, 38, 21, 22, 0x736d66, 0x736d66);
    house(g, 111, 590, 53, 28, 15, 0x696758, 0x78634d);
    crane(g, 96, 316, 43, 37);
    crane(g, 148, 252, 48, 45);
    crane(g, 84, 104, 45, 29);
    yardCrates(g, 61, 925, 3, 3, 0x7d674d);
    yardCrates(g, 289, 712, 4, 3, 0x695a4d);
    yardCrates(g, 92, 341, 4, 3, 0x5b6e70);
    hospital(g, 276, 159);
    bollard(g, 310, 143, steel);
    for (const y of [272, 352, 826, 966]) {
        box(g, 38, y, 0, 35, 13.2, 2.15, steel, 0.65);
        box(g, 41, y, 2.2, 16, 7.3, 1.8, teal, 0.52);
    }
}

function track(g: ArenaGeometry, points: readonly Point[]): void {
    strip(g, points, 9.4, 0.054, 0x36434b);
    strip(g, points, 1.15, 0.092, zinc, -2.38);
    strip(g, points, 1.15, 0.092, zinc, 2.38);
    for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1], [bx, by] = points[i];
        const distance = Math.hypot(bx - ax, by - ay);
        const count = Math.max(1, Math.floor(distance / 8));
        const yaw = Math.atan2((by - ay) / PROJECTION, bx - ax);
        for (let j = 0; j < count; j++) {
            const t = (j + 0.5) / count;
            const x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
            if (x < 5 || x > MAP_WIDTH - 5 || y < 5 || y > CAMPAIGN_MAP_HEIGHT - 5) continue;
            box(g, x, y, 0, 1.55, 6.8, 0.51, 0x514b49, 0, yaw);
        }
    }
}

function railcar(g: ArenaGeometry, x: number, y: number, yaw: number, body: number): void {
    box(g, x, y, 0.8, 29.9, 6.6, 2.5, ink, 1.1, yaw);
    box(g, x, y, 2.6, 31.2, 7.7, 6.0, body, 1.65, yaw);
    box(g, x, y, 8.05, 29.7, 7.4, 1.25, steel, 1.3, yaw);
    for (const side of [-1, 1]) {
        for (let i = -2; i <= 2; i++) {
            const forward = i * 4.55, panel = side * 3.98;
            const px = x + Math.cos(yaw) * forward - Math.sin(yaw) * panel;
            const py = y + PROJECTION * (Math.sin(yaw) * forward + Math.cos(yaw) * panel);
            box(g, px, py, 5.75, 2.75, 0.62, 1.45, i === 1 ? 0x8d826e : teal, 0.18, yaw);
        }
    }
}

function broadcast(g: ArenaGeometry, route: readonly Point[], theme: Palette): void {
    road(g, [[307, 1048], [323, 924], [278, 831], [285, 721], [326, 643], [328, 520], [288, 449],
        [277, 353], [313, 240], [306, 121]], 15, theme);
    for (const [cx, cy, n, r, s] of [[78, 198, 42, 67, 1], [302, 253, 35, 54, 2], [80, 405, 56, 69, 3],
        [291, 504, 47, 61, 4], [72, 648, 38, 61, 5], [306, 865, 32, 46, 6], [89, 993, 30, 45, 7]]) {
        grove(g, cx, cy, n, r, s, route, true);
    }
    const rail: Point[] = [[297, 1048], [278, 889], [250, 803], [237, 728], [245, 655], [302, 598], [362, 587]];
    track(g, rail);
    track(g, rail.map(([x, y]): Point => [x - 13.4, y + 1.4]));
    const angle = Math.atan2(-75 / PROJECTION, -13);
    railcar(g, 237, 786, angle, 0x636974);
    railcar(g, 230, 749, angle, 0x6f6b64);
    railcar(g, 226, 710, angle, 0x74766c);
    house(g, 196, 724, 58, 35, 20, 0x6d625a, 0x766051, true);
    box(g, 195, 746, 0, 72, 6.2, 1.7, zinc, 0.44);
    house(g, 160, 526, 67, 45, 34, 0x666273, 0x666273);
    for (const x of [142, 166, 177]) {
        tube(g, [[x, 543, 11], [x, 521, 21], [x, 509, 33]], 1.05, brass, 5);
    }
    house(g, 263, 356, 60, 43, 28, 0x778083, 0x778083);
    house(g, 283, 339, 36, 28, 17, 0x5e6673, 0x5e6673);
    house(g, 272, 405, 31, 20, 14, zinc, copper);
    house(g, 85, 880, 56, 45, 21, 0x615957, copper, true);
    house(g, 94, 845, 31, 20, 11, 0x64636a, copper);
    box(g, 232, 111, 0, 79, 50, 2, 0x5f6068, 2.35);
    house(g, 187, 128, 35, 24, 15, 0x666875, 0x666875);
    house(g, 272, 115, 38, 23, 16, 0x626c78, 0x626c78);
    pylon(g, 236, 106, 58, 25, 0x979492);
    for (const [x, y] of [[76, 698], [314, 435], [97, 242], [340, 514]]) pylon(g, x, y, 25, 10, zinc);
}

function switchyard(g: ArenaGeometry, x: number, y: number, size: number): void {
    box(g, x, y, 0, size, size * 0.58, 1.95, 0x4b5754, 1.8);
    for (const side of [-1, 1]) {
        const u = x + side * size * 0.32;
        box(g, u, y, 1.7, 7, size * 0.43, 1.8, graphiteColor(steel), 0.36);
        for (const offset of [-0.15, 0, 0.15]) {
            const py = y + offset * size;
            cylinder(g, u, py, 3.23, 1.9, 1.27, 3.9, brass);
            cylinder(g, u, py, 6.9, 1.4, 1.4, 0.5, zinc);
        }
    }
    const ends: [number, number] = [x - size * 0.32, x + size * 0.32];
    for (const offset of [-0.15, 0, 0.15]) {
        const py = y + offset * size;
        tube(g, [[ends[0], py, 7.5], [x, py - 1.0, 5.55], [ends[1], py, 7.5]], 0.47, copper, 5);
    }
}

function takeover(g: ArenaGeometry, route: readonly Point[], theme: Palette): void {
    road(g, [[26, 1023], [61, 928], [53, 822], [59, 698], [62, 583], [53, 415], [64, 283], [56, 151], [45, 42]], 14, theme);
    road(g, [[326, 1027], [311, 929], [311, 784], [314, 653], [307, 532], [326, 407], [300, 291], [292, 133], [301, 31]], 14, theme);
    for (const [cx, cy, n, r, s] of [[29, 238, 28, 38, 1], [336, 253, 24, 33, 2], [81, 434, 21, 40, 3],
        [303, 778, 33, 49, 4], [54, 960, 33, 46, 5], [318, 981, 37, 45, 6]]) {
        grove(g, cx, cy, n, r, s, route);
    }
    const mainGate = 868;
    box(g, 178, mainGate, 0, 129, 14.5, 2.5, concrete, 1.2);
    for (const [x, y] of [[119, 871], [235, 869], [113, 264], [253, 264]]) {
        box(g, x, y, 0, 16.8, 15.2, 29, 0x7a7768, 1.9);
        box(g, x, y, 28.6, 19.5, 17.3, 3.45, zinc, 1.34);
        box(g, x, y + 7.8, 11, 3.4, 1.5, 11, brass, 0.53);
    }
    box(g, 175, mainGate, 16.35, 112.3, 3.8, 3.4, steel, 0.4);
    for (const x of [131, 152, 203, 225]) {
        box(g, x, mainGate, 0, 2.9, 3.3, 17, copper, 0.42);
    }
    track(g, [[48, 759], [117, 739], [200, 693], [281, 686], [347, 651]]);
    track(g, [[41, 667], [123, 686], [218, 727], [289, 731], [342, 758]]);
    const turbineX = 255, turbineY = 516;
    cylinder(g, turbineX, turbineY, 0, 35, 35, 4.8, basalt);
    cylinder(g, turbineX, turbineY, 4.62, 31, 29.2, 20.1, 0x726a5b);
    cylinder(g, turbineX, turbineY, 24.0, 29.5, 23.3, 3.85, zinc);
    cylinder(g, turbineX, turbineY, 27.72, 16, 14.6, 1.8, steel);
    cylinder(g, turbineX, turbineY, 29.22, 8.7, 8.2, 2.6, copper);
    for (const dx of [-25, -12, 12, 25]) {
        box(g, turbineX + dx, turbineY + 21, 1.6, 2.6, 1.62, 22, zinc, 0.25);
    }
    for (const [x, y, s] of [[88, 596, 42], [249, 440, 46], [77, 376, 35], [291, 83, 44], [91, 135, 38]]) {
        switchyard(g, x, y, s);
    }
    const opsX = 194, opsY = 121;
    box(g, opsX, opsY, 0, 113, 53, 3.55, concrete, 2.4);
    house(g, opsX, opsY - 5, 53, 42, 42, 0x72716a, 0x72716a);
    house(g, opsX - 39, opsY + 3, 32, 36, 25, 0x646f70, 0x646f70);
    house(g, opsX + 39, opsY + 3, 28, 33, 28, 0x656c6a, 0x656c6a);
    for (const x of [-15, -5, 5, 15]) {
        box(g, opsX + x, opsY + 14.4, 13, 2.4, 1.55, 23, steel, 0.24);
        box(g, opsX + x + 1.6, opsY + 14.55, 13, 0.91, 1.0, 19, brass);
    }
    pylon(g, 298, 219, 31, 13, zinc);
    pylon(g, 295, 365, 28, 15, zinc);
    for (const [x, y] of [[115, 243], [253, 241], [116, 292], [253, 295]]) bollard(g, x, y, copper);
}

const authors: Readonly<Record<ChapterId, (g: ArenaGeometry, route: readonly Point[], theme: Palette) => void>> = {
    '01': quay,
    '02': freight,
    '03': broadcast,
    '04': takeover,
};

function buildDistrict(chapter: Chapter, id: ChapterId): Mesh {
    const worldGeometry = new ArenaGeometry();
    const theme = palettes[id];
    const route: Point[] = chapter.routePoints.map(({ x, y }) => [x * MAP_WIDTH, y * CAMPAIGN_MAP_HEIGHT]);
    terrain(worldGeometry, theme);
    authors[id](worldGeometry, route, theme);
    road(worldGeometry, route, id === '01' ? 17 : 22, theme, 0.11);
    return worldGeometry.mesh();
}

/** Project-original district geometry. Roads follow the campaign catalogue in map coordinates. */
export class PrototypeRouteMeshes {
    private current?: { chapter: string; node: Node; mesh: Mesh };
    private material?: Material;

    static supports(chapterId: string): boolean {
        return Object.prototype.hasOwnProperty.call(authors, chapterId);
    }

    create(chapterId: string, parent: Node, layer: number): Node | null {
        if (!PrototypeRouteMeshes.supports(chapterId)) return null;
        if (this.current?.chapter === chapterId && this.current.node.isValid) return this.current.node;
        const chapter = CAMPAIGN_CHAPTERS.find(candidate => candidate.id === chapterId);
        if (!chapter) return null;
        const mesh = buildDistrict(chapter, chapterId as ChapterId);
        this.release();
        if (!this.material) {
            this.material = new Material();
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        }
        const node = new Node('3D District ' + chapterId);
        node.layer = layer;
        parent.addChild(node);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(this.material, 0);
        this.current = { chapter: chapterId, node, mesh };
        return node;
    }

    destroy(): void {
        this.release();
        this.material?.destroy();
        this.material = undefined;
    }

    private release(): void {
        if (!this.current) return;
        this.current.node.active = false;
        this.current.node.destroy();
        this.current.mesh.destroy();
        this.current = undefined;
    }
}
