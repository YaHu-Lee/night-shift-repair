import type { ArenaGeometry } from './PrototypeArenaMeshes';

type Point = [x: number, y: number, z: number];
type Tone = [r: number, g: number, b: number];

const ink = 0x172128;
const graphite = 0x303b42;
const zinc = 0x63777d;
const steel = 0x455a64;
const blue = 0x34495a;
const warmIron = 0x53443c;
const copper = 0x997052;
const copperEdge = 0xb98b66;
const bronze = 0x796948;
const brass = 0xc1a365;
const amber = 0xe2ab6a;
const mint = 0x6ca8a0;
const signalBlue = 0x6b91bb;

function ground(y: number): number {
    return (350 - y) / 0.8;
}

function rearWall(g: ArenaGeometry, y: number, paint: number, frame: number): void {
    const z = ground(y);
    g.box(0, -0.25, z - 5.5, 358, 24, 9, paint, 1.5);
    g.box(0, 21.8, z - 0.5, 356, 3.7, 7, frame, 1.1);
    g.box(0, 0.24, z + 2.5, 350, 1.7, 5.6, ink, 0.9);
}

function panelIndicator(g: ArenaGeometry, x: number, y: number, z: number, paint = amber): void {
    g.box(x, y, z, 3.6, 2.7, 1.8, ink, 0.35);
    g.box(x, y + 0.55, z + 0.7, 1.8, 1.6, 1.1, paint, 0.3);
}

function warmSconce(g: ArenaGeometry, x: number, y: number, z: number): void {
    g.box(x, y + 2.8, z - 1.7, 9.4, 6.2, 3.5, ink, 1.1);
    g.box(x, y, z, 8, 3.1, 5.8, copper, 0.8);
    g.box(x, y + 0.4, z + 2.1, 5.7, 1.8, 2.6, 0xf0bc79, 0.5);
}

function cabinet(g: ArenaGeometry, x: number, z: number, w: number, h: number, accent: number,
    paint = blue): void {
    g.box(x, 0, z, w + 4.2, 2.6, 14, ink, 0.75);
    g.box(x, 2.5, z - 0.85, w, h, 10.2, paint, 0.8);
    g.box(x, 5.0, z + 4.4, w - 2.4, h - 3.6, 1.4, graphite, 0.25);
    g.box(x, 4.8, z + 5.28, w - 4.5, h - 5.5, 0.8, ink, 0.2);
    g.box(x, h - 3.6, z + 5.78, w - 5.8, 4.7, 1.1, paint, 0.45);
    const vents = Math.min(5, Math.floor((h - 9) / 3.9));
    for (let i = 0; i < vents; i++) {
        const y = 6.0 + i * 3.55;
        g.box(x, y, z + 5.77, w - 7.4, 1.25, 0.9, i % 2 === 0 ? steel : graphite, 0.15);
        if (i % 2 === 0) panelIndicator(g, x - w * 0.24, y + 0.15, z + 6.4, accent);
    }
    g.box(x + w * 0.37, h * 0.42, z + 6.24, 0.85, 4.8, 1.65, zinc, 0.24);
    g.box(x, h + 2.25, z, w + 1.5, 2.1, 11.6, steel, 0.65);
}

function mast(g: ArenaGeometry, x: number, z: number, height: number, span: number, paint: number): void {
    const foot = span / 2;
    const more = z + foot * 0.61;
    const less = z - foot * 0.7;
    const top = height - 4;
    g.box(x, -0.1, z, span + 8, 2.6, span + 1.8, ink, 1.1);
    for (const side of [-1, 1]) {
        const from: Point = [x + side * foot, 2.4, more];
        const upper: Point = [x + side * foot * 0.19, top, z];
        g.box(from[0], 1.6, more, 4.6, 1.6, 4.4, zinc, 0.35);
        g.tube([from, upper], 1.02, paint, 6);
    }
    g.tube([[x, 2.4, less], [x, top, z]], 1.0, paint, 6);
    for (let i = 0; i < 3; i++) {
        const lower = i / 3, higher = (i + 1) / 3;
        const spoke = (side: number, fraction: number): Point => [
            x + side * foot * (1 - fraction * 0.81), 3 + (top - 3) * fraction,
            more + (z - more) * fraction,
        ];
        g.tube([spoke(i % 2 === 0 ? -1 : 1, lower), spoke(i % 2 === 0 ? 1 : -1, higher)], 0.56, zinc, 5);
        g.tube([spoke(-1, higher), spoke(1, higher)], 0.68, paint, 5);
        if (i > 0) g.tube([spoke(-1, lower), [x, 3 + (top - 3) * higher, less + (z - less) * higher]], 0.5, steel, 5);
    }
    g.cylinder(x, top - 0.8, z, 2.9, 1.6, 3.1, zinc);
    g.cylinder(x, top + 2.2, z, 0.75, 0.5, 5.5, paint);
    g.cylinder(x, top + 7.45, z, 1, 0.9, 1.05, amber);
}

function dish(g: ArenaGeometry, x: number, z: number, radius: number, tilt = 0): void {
    const base = 10.8 + radius * 0.45;
    const swingX = Math.sin(tilt) * 0.5;
    const swingZ = Math.cos(tilt) * 0.5;
    const center: Point = [x, base, z];
    const side: Point = [Math.cos(tilt), 0, -Math.sin(tilt)];
    const up: Point = [-swingX, 0.56, -swingZ];
    const normal: Point = [Math.sin(tilt) * 0.56, 0.5, Math.cos(tilt) * 0.56];
    const knots = 14;
    const ring = (size: number, offset: number): Point[] => Array.from({ length: knots }, (_, i) => {
        const angle = i * 2 * Math.PI / knots;
        const a = Math.cos(angle) * size, b = Math.sin(angle) * size;
        return [
            center[0] + a * side[0] + b * up[0] + offset * normal[0],
            center[1] + a * side[1] + b * up[1] + offset * normal[1],
            center[2] + a * side[2] + b * up[2] + offset * normal[2],
        ];
    });
    const inner = ring(radius * 0.54, -radius * 0.2);
    const rim = ring(radius, radius * 0.04);
    const back = ring(radius * 0.7, -radius * 0.36);
    const bowl: Point = [center[0] - normal[0] * radius * 0.26, center[1] - normal[1] * radius * 0.26,
        center[2] - normal[2] * radius * 0.26];
    g.box(x, 0, z - 1.8, radius * 1.28, 2.6, 15, graphite, 1.3);
    g.cylinder(x, 2.5, z - 1.8, 3.1, 2.3, base - 4.8, steel);
    for (let i = 0; i < knots; i++) {
        const next = (i + 1) % knots;
        g.face([bowl, inner[i], inner[next]], i % 2 === 0 ? 0x718890 : 0x68818a);
        g.face([inner[i], rim[i], rim[next], inner[next]], i % 2 === 0 ? 0x819398 : 0x738890);
        g.face([rim[next], rim[i], back[i], back[next]], graphite);
    }
    const focal: Point = [center[0] + normal[0] * radius * 0.56, center[1] + normal[1] * radius * 0.56,
        center[2] + normal[2] * radius * 0.56];
    for (const brace of [0, 5, 10]) g.tube([rim[brace], focal], 0.62, steel, 5);
    g.cylinder(focal[0], focal[1] - 1.3, focal[2], 1.5, 0.9, 2.8, amber);
}

function rimTrace(g: ArenaGeometry, from: [number, number], through: [number, number],
    to: [number, number], width: number, tint: Tone): void {
    g.stroke(from, through, width, -0.05, () => tint);
    g.stroke(through, to, width, -0.05, () => tint);
}

function signalAccess(g: ArenaGeometry): void {
    const z = ground(536);
    rearWall(g, 541, 0x384351, zinc);
    g.box(0, 0, z + 1.6, 117, 26, 14.7, blue, 4.6);
    g.box(0, 0.2, z + 9.7, 95, 21, 4.2, ink, 2.5);
    for (const side of [-1, 1]) {
        const x = 24 * side;
        g.box(x, 1.35, z + 12.4, 44, 18.2, 2.8, side > 0 ? graphite : steel, 1.3);
        g.box(x, 3.25, z + 14.05, 32, 11.3, 0.75, 0x394957, 0.4);
        g.box(side * 4.8, 7.2, z + 14.6, 1.4, 5.4, 2.3, copper, 0.3);
        g.box(side * 49, 0.4, z + 10.0, 8.1, 22, 7.6, graphite, 1.4);
        g.box(side * 49, 3.1, z + 14.3, 3.2, 16.5, 1.2, steel, 0.35);
        cabinet(g, side * 92, z + 1, 15.5, 17, side > 0 ? signalBlue : mint);
        rimTrace(g, [side * 51, 533], [side * 76, 504], [side * 123, 495], 1.35, [89, 94, 107]);
        rimTrace(g, [side * 54, 532], [side * 79, 508], [side * 126, 499], 0.66, [116, 112, 110]);
    }
    warmSconce(g, 0, 22.3, z + 14.7);
    mast(g, -132, z - 0.1, 25, 15, 0x64727c);
    mast(g, 128, z + 0.5, 29, 17, 0x64727c);
    g.tube([[-111, 25, z - 0.4], [-56, 21, z + 0.8], [0, 18.5, z + 3], [64, 21.4, z + 1], [111, 25, z]], 0.66, 0x343944, 5);
}

function parkedRailcar(g: ArenaGeometry): void {
    const z = ground(536);
    g.box(0, 0, z - 8, 344, 4.5, 19, graphite, 0.7);
    for (let x = -156; x <= 156; x += 12) {
        g.box(x, 0.25, z + 14.8, 6.7, 1.1, 11.5, 0x53515a, 0.3);
    }
    for (const railZ of [z + 12.4, z + 18.0]) {
        g.box(0, 1.15, railZ, 340, 1.5, 1.4, zinc, 0.3);
    }
    g.box(0, 4.0, z - 4.1, 300, 6.3, 22, ink, 3.0);
    for (const x of [-119, -99, 99, 119]) {
        g.cylinder(x, 2.1, z + 5.35, 3.2, 3.2, 3.5, graphite);
        g.cylinder(x, 4.9, z + 5.35, 1.6, 1.45, 1.1, zinc);
    }
    g.box(0, 9.4, z - 3.6, 302, 22.1, 24.4, 0x645b58, 6.0);
    g.box(0, 30.1, z - 4.7, 294, 4.5, 22, graphite, 4.0);
    g.box(0, 13.1, z + 8.05, 289, 1.65, 1.9, 0x9c7562, 0.45);
    g.box(0, 17.15, z + 8.35, 287, 1.1, 1.2, 0xa98b6b, 0.25);
    for (const x of [-124, -90, -56, 0, 56, 90, 124]) {
        g.box(x, 20.15, z + 8.45, 24.5, 8.0, 2.2, 0x303a46, 1.3);
        g.box(x, 21.0, z + 9.6, 21.1, 6.3, 1.3, x === 0 ? 0x705b4f : 0x394856, 0.8);
        g.box(x, 20.2, z + 10.1, 0.8, 7.33, 0.7, zinc, 0.14);
    }
    for (const side of [-1, 1]) {
        const x = side * 27.8;
        g.box(x, 10.1, z + 8.65, 17.5, 18.8, 2.15, graphite, 1.15);
        g.box(x, 10.9, z + 9.85, 14.7, 17.15, 1.0, 0x67544a, 0.5);
        g.box(x, 21, z + 10.38, 9.0, 5.7, 0.65, blue, 1.1);
        g.box(x + 2.65, 16, z + 10.56, 1.65, 2.9, 0.8, bronze, 0.3);
    }
    g.box(-149, 0, z + 23, 18, 3.1, 11, graphite, 0.95);
    warmSconce(g, -142, 26.4, z + 10.6);
    g.stroke([-162, 510], [162, 510], 1.5, -0.02, () => [132, 114, 77]);
}

function relayRoom(g: ArenaGeometry): void {
    const z = ground(536);
    rearWall(g, 542, 0x30454b, blue);
    for (const [i, x] of [-94, -65, -36, -7, 22].entries()) {
        cabinet(g, x, z, 22.5, 24 - i % 2 * 2, i % 3 === 0 ? signalBlue : mint, 0x3c575e);
    }
    g.box(-36, 28, z - 3.5, 142, 2.4, 4.8, graphite, 0.75);
    for (const x of [-85, -53, -20, 12]) {
        g.tube([[x, 24.1, z - 3.5], [x, 28.8, z - 3.5], [x + 7.7, 28.8, z - 3.5],
            [x + 7.7, 28.8, z - 0.5]], 0.65, 0x607470, 5);
    }
    dish(g, 109, z + 2.2, 20, -0.32);
    cabinet(g, 147, z + 0.4, 15.1, 14.5, amber);
    for (const side of [-1, 1]) {
        const x = side * 138;
        g.box(x, 0, ground(503), 15, 0.44, 21, 0x263940, 0.9);
        rimTrace(g, [x, 507], [x * 0.79, 495], [x * 0.59, 495], 0.75, [69, 102, 103]);
    }
}

function archiveRack(g: ArenaGeometry, x: number, z: number, width: number, offset: number): void {
    g.box(x, 0.1, z - 2.5, width, 25.4, 8.9, 0x3f3835, 1.1);
    for (const side of [-1, 1]) {
        g.box(x + side * (width / 2 - 1.3), 1, z + 2.25, 2.3, 24, 5.9, bronze, 0.65);
    }
    for (let row = 0; row < 3; row++) {
        const y = row * 7.32 + 1;
        g.box(x, y, z + 2.9, width - 0.4, 1.5, 5.9, copper, 0.5);
        for (let i = 0; i < 4; i++) {
            if ((i + row + offset) % 5 === 0) continue;
            const position = x + (i - 1.5) * (width / 4.75);
            const document = (i + row + offset) % 2 === 0;
            g.box(position, y + 1.6, z + 3.65, width * 0.17, document ? 4.6 : 3.65, 4.15,
                document ? 0x989079 : 0x75624d, 0.48);
            g.box(position, y + 2.25, z + 6.0, width * 0.09, 0.9, 0.55,
                document ? 0xb7a686 : 0x524a45, 0.1);
        }
    }
    g.box(x, 24.7, z + 0.6, width + 1.7, 2.05, 12.0, warmIron, 1.0);
}

function archiveMezzanine(g: ArenaGeometry): void {
    const z = ground(538);
    rearWall(g, 544, 0x48403c, 0x424b4b);
    for (const [index, x] of [-133, -84, -26, 34, 95, 144].entries()) {
        archiveRack(g, x, z + 0.45, index % 2 === 0 ? 35 : 42, index);
    }
    for (const x of [-108, 0, 116]) {
        warmSconce(g, x, 27, z + 4.0);
        g.box(x, 0, ground(512), 19, 0.6, 4.8, 0x716653, 0.3);
    }
    for (let y = 184; y <= 486; y += 52) {
        g.stroke([-151, y], [150, y], 0.55, -0.15, () => [81, 67, 60]);
    }
    for (const side of [-1, 1]) {
        g.stroke([side * 130, 178], [side * 130, 510], 0.75, -0.13, () => [93, 77, 66]);
    }
}

function broadcastRoof(g: ArenaGeometry): void {
    const z = ground(535);
    rearWall(g, 548, 0x334650, 0x748081);
    mast(g, -1, z + 2.3, 39, 30, 0x6a797e);
    dish(g, -104, z + 4.6, 18.6, 0.30);
    for (const x of [102, 130]) {
        g.box(x, 0, z, 13, 2.1, 12, ink, 1.1);
        g.cylinder(x, 2.1, z, 1.8, 1.25, 26, zinc);
        g.box(x, 17.4, z + 0.9, 5.0, 11.1, 2.15, steel, 0.5);
        g.box(x, 21.1, z + 2.18, 3.6, 6.5, 0.55, 0x9ca49b, 0.45);
    }
    cabinet(g, 151, z - 0.4, 12.6, 13.4, amber);
    for (const x of [-154, -71, 70, 155]) {
        g.box(x, 0, z - 3.2, 7, 8.5, 8, steel, 0.8);
        warmSconce(g, x, 5.6, z + 0.9);
    }
    const edgeRing = 28;
    for (let i = 0; i < edgeRing; i++) {
        const a = i * Math.PI * 2 / edgeRing;
        const b = (i + 0.9) * Math.PI * 2 / edgeRing;
        g.stroke([153 * Math.cos(a), 352 + 161 * Math.sin(a)], [153 * Math.cos(b), 352 + 161 * Math.sin(b)],
            0.8, -0.13, () => [62, 77, 85]);
    }
}

function bypassEntry(g: ArenaGeometry): void {
    const z = ground(536);
    rearWall(g, 543, 0x3a3d3e, 0x616760);
    g.box(0, 0.4, z + 1.4, 122, 16.5, 9.2, ink, 1.5);
    g.box(0, 2, z + 5.7, 99, 12.2, 1.45, graphite, 0.7);
    for (const side of [-1, 1]) {
        const x = side * 121;
        g.box(x, 0, z + 1.6, 38, 23, 15.5, steel, 2.2);
        g.box(x, 0.35, z + 10.3, 27, 18.5, 3.1, 0x363f43, 1.4);
        g.box(x, 3.6, z + 11.9, 20, 14, 1.1, 0x565b56, 0.8);
        for (const vent of [0, 3.4, 6.8]) {
            g.box(x, 6.7 + vent, z + 12.6, 13.2, 1.65, 0.7, graphite, 0.15);
        }
        const riser = side * 91;
        g.box(riser, 0.3, z + 6.7, 10, 17, 8, warmIron, 1.05);
        g.tube([[x, 17, z - 2.5], [x - side * 9, 14.7, z + 4], [riser, 10.2, z + 13.4],
            [side * 24, 10.2, z + 13.4]], 2.85, copper, 8);
        g.tube([[x, 9, z + 1], [x - side * 9, 6, z + 6.2], [riser, 5.1, z + 11.0],
            [side * 12, 5.1, z + 11.0]], 2.15, 0xb37b56, 8);
        for (const clampX of [side * 26, side * 67]) {
            g.box(clampX, 5.45, z + 13.4, 3.5, 10, 6, graphite, 0.6);
            g.box(clampX, 12.6, z + 13.8, 3.7, 2.4, 5.2, zinc, 0.42);
        }
        warmSconce(g, side * 68, 20.0, z + 5.1);
    }
    g.box(0, 0.1, z + 14.5, 29, 1.0, 14, graphite, 0.7);
    g.box(0, 1.0, z + 16.2, 18, 0.45, 0.8, bronze, 0.3);
}

function crossover(g: ArenaGeometry): void {
    const z = ground(537);
    rearWall(g, 543, 0x3f403a, 0x57544b);
    for (const x of [-126, 126]) {
        cabinet(g, x, z + 1.8, 23, 22, amber, warmIron);
        for (const sign of [-1, 1]) {
            g.tube([[x + sign * 6, 17, z - 2], [x + sign * 9, 21, z - 4.3],
                [x + sign * 9, 28.4, z - 5.1]], 1.08, copper, 6);
        }
        warmSconce(g, x * 0.71, 21.5, z + 0.6);
    }
    for (const pair of [-1, 1]) {
        const path = (s: number): [number, number] => [
            -142 + s * 284,
            503 + pair * 29 * Math.sin((s - 0.5) * Math.PI * 0.8),
        ];
        for (let i = 0; i < 19; i++) {
            const [x, y] = path(i / 18);
            g.box(x, -0.19, ground(y), 2.8, 0.27, 12.3, 0x514946, 0.2, pair * 0.23);
        }
        for (const rail of [-3.0, 3.0]) {
            const railPath: Point[] = Array.from({ length: 22 }, (_, i) => {
                const [x, y] = path(i / 21);
                return [x, 0.15 + pair * 0.05, ground(y + rail)];
            });
            g.tube(railPath, 0.65, pair > 0 ? 0x7b6b5e : 0x645d58, 5);
        }
    }
    g.box(0, -0.1, z + 11.3, 16, 0.43, 16, warmIron, 0.7);
}

function bypassTurbine(g: ArenaGeometry): void {
    const z = ground(536);
    rearWall(g, 544, 0x323d41, 0x526365);
    const arc = (r: number, count: number, depth: number): Point[] => Array.from({ length: count }, (_, i) => {
        const angle = i * Math.PI / (count - 1);
        return [Math.cos(angle) * r, 2.8 + Math.sin(angle) * r * 0.55, depth];
    });
    g.box(0, 0, z + 1.65, 112, 5.8, 20, 0x3a4648, 3.0);
    g.face(arc(51, 19, z + 12.25), 0x253437);
    g.tube(arc(50, 19, z + 13), 3.2, 0x6e7165, 8);
    g.tube(arc(41, 18, z + 14.1), 1.75, 0x778582, 7);
    g.tube(arc(29, 15, z + 16.2), 1.25, 0x4d625e, 7);
    g.face(arc(17, 13, z + 16.7), 0x62736c);
    for (let i = 0; i < 8; i++) {
        const angle = (i + 0.4) * Math.PI / 8;
        const ox = Math.cos(angle), oy = Math.sin(angle) * 0.55;
        g.tube([[22 * ox, 3.4 + 22 * oy, z + 15.8], [32 * ox, 3.4 + 32 * oy, z + 16.0],
            [37.7 * ox, 3.4 + 37.7 * oy, z + 14.9]], 1.78, i % 2 ? bronze : steel, 6);
    }
    for (const side of [-1, 1]) {
        const x = side * 88;
        g.box(x, 0, z + 6, 31, 6.0, 12.3, 0x414d4b, 1.55);
        g.tube([[side * 53, 16, z - 1], [side * 66, 16.7, z - 2], [x, 15, z + 2.5],
            [x, 8.1, z + 8.1], [x, 3.0, z + 8.8]], 3.55, copper, 8);
        g.cylinder(x, 3.7, z + 8.45, 5.7, 5.7, 2.7, bronze);
        cabinet(g, side * 137, z + 0.5, 20, 17.5, mint, 0x3c514f);
        warmSconce(g, side * 112, 20.6, z + 1.4);
    }
    g.box(0, 0, z + 16.2, 106, 2.0, 6.4, steel, 0.9);
    for (let x = -40; x < 49; x += 16) {
        g.box(x, 1.95, z + 17.5, 7.3, 0.35, 1.1, bronze, 0.15);
    }
}

function takeoverVestibule(g: ArenaGeometry): void {
    const z = ground(535);
    rearWall(g, 542, 0x393e42, 0x686059);
    g.box(0, 0, z + 2.1, 123, 28, 11.1, graphite, 3.9);
    g.box(0, 0, z + 8.9, 112, 24.4, 1.8, 0x262c2e, 2.7);
    for (const side of [-1, 1]) {
        const x = 27 * side;
        g.box(x, 0.4, z + 10.35, 51.6, 21.9, 1.8, 0x554643, 1.0);
        g.box(x, 2.7, z + 11.4, 44.4, 17.3, 0.75, 0x453e3c, 0.65);
        const frame: Point[] = [[side * 52, 0.95, z + 12.11], [side * 52, 16.1, z + 12.11],
            [side * 43.8, 21, z + 12.11], [side * 3.5, 21, z + 12.11], [side * 3.5, 0.9, z + 12.11]];
        g.tube(frame, 0.72, copperEdge, 6);
        g.tube([[side * 57.8, 0.65, z + 11.95], [side * 57.8, 17.9, z + 11.95],
            [side * 45, 26.7, z + 10.55], [0, 26.7, z + 10.55]], 1.08, copper, 6);
        g.box(side * 8.75, 6.7, z + 11.7, 2.1, 5.7, 1.8, brass, 0.4);
        const pylon = side * 112;
        g.box(pylon, 0, z + 1.3, 28.5, 3.1, 20, steel, 1.4);
        g.cylinder(pylon, 2.9, z + 1.3, 9.2, 8.4, 3.7, graphite);
        g.cylinder(pylon, 6.4, z + 1.3, 6.8, 6.8, 16.1, 0xaf7951);
        g.cylinder(pylon, 22, z + 1.3, 8.1, 6.7, 4.8, graphite);
        for (let i = 0; i < 4; i++) {
            const a = Math.PI * 0.5 * i + Math.PI * 0.25;
            const dx = Math.cos(a) * 7, dz = Math.sin(a) * 7;
            g.tube([[pylon + 1.3 * dx, 5.5, z + 1.3 + 1.3 * dz],
                [pylon + dx, 8, z + 1.3 + dz], [pylon + dx, 22, z + 1.3 + dz]], 0.88, bronze, 6);
        }
        for (const level of [25.1, 28.0, 30.8]) g.cylinder(pylon, level, z + 1.3, 4.7, 4.4, 0.95, zinc);
        g.box(pylon, 12.7, z + 7.8, 5.8, 6.3, 0.75, amber, 0.55);
    }
    g.box(0, 0, z + 16.3, 115, 1.0, 8, 0x5d504a, 1.1);
}

function centralDispatch(g: ArenaGeometry): void {
    const z = ground(536);
    rearWall(g, 543, 0x383f40, 0x68665a);
    g.box(0, 0, z + 2.4, 193, 24.6, 14.6, graphite, 2.8);
    g.box(0, 0.5, z + 9.5, 174, 20.4, 3.1, 0x4d4840, 1.1);
    for (const [i, x] of [-65, -38, -11, 18, 45, 70].entries()) {
        g.box(x, 1.1, z + 11.65, 22.2, 17.75, 1.25, i < 3 ? 0x454c48 : 0x50483c, 0.56);
        g.box(x, 4.3, z + 12.4, 16.55, 11.8, 0.95, i % 2 ? warmIron : steel, 0.35);
        g.box(x + 2.1, i < 3 ? 10.7 : 8.3, z + 13.1, 10.3, 4.6, 0.8, graphite, 0.55);
        for (const shift of [-3.2, 2]) panelIndicator(g, x + shift, i % 2 ? 14.9 : 14.5, z + 13.2,
            i < 3 ? 0xe9bc81 : 0x98a77c);
        g.box(x - 6.85, 5.2, z + 12.15, 1.05, 2.75, 0.85, brass, 0.23);
        g.box(x + 5.6, 6.1, z + 12.75, 0.95, 3.9, 1.35, zinc, 0.32);
    }
    g.box(2, 1.3, z + 12.1, 3.15, 18.8, 1.9, copper, 0.55);
    for (const side of [-1, 1]) {
        const x = side * 119;
        g.box(x, 0, z + 2.1, 29, 21.7, 15.6, warmIron, 1.9);
        g.box(x, 2.0, z + 10.4, 20, 9.6, 1.7, ink, 0.9);
        for (let band = 0; band < 3; band++) {
            const y = 26.9 + band * 2.2;
            const end = side * (8 + band * 8.15);
            g.tube([[x, 8.5 + band * 3, z + 12.0 + band * 0.7], [x, 17, z + 10.2 + band * 0.6],
                [x - side * 4.5, y - 2, z + 3.5], [x - side * 12.3, y, z + 2.3],
                [end, y, z + 2.3], [end, y - 5.4, z + 2.9]], 0.82, band % 2 ? copperEdge : copper, 6);
        }
        const rim = side * 146;
        g.cylinder(rim, 0.4, z + 2.9, 11, 10, 3.6, graphite);
        g.cylinder(rim, 3.6, z + 2.9, 8.6, 7.2, 17, steel);
        g.cylinder(rim, 20, z + 2.9, 9.4, 7.4, 3.3, 0x74807d);
        warmSconce(g, side * 97, 19.5, z + 10.4);
        rimTrace(g, [side * 84, 526], [side * 96, 483], [side * 139, 471], 1.2, [101, 85, 69]);
    }
    g.box(0, 0, z + 15.3, 192, 1.15, 10.0, graphite, 1.45);
}

export const LATE_ARENAS: Readonly<Record<string, (g: ArenaGeometry) => void>> = {
    '11': signalAccess,
    '12': parkedRailcar,
    '13': relayRoom,
    '14': archiveMezzanine,
    '15': broadcastRoof,
    '16': bypassEntry,
    '17': crossover,
    '18': bypassTurbine,
    '19': takeoverVestibule,
    '20': centralDispatch,
};
