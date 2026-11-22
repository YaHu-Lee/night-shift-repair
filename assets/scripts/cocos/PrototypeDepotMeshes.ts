import { Material, Mesh, MeshRenderer, Node } from 'cc';
import { ArenaGeometry } from './PrototypeArenaMeshes';

type Point = [number, number, number];

const iron = 0x24363a;
const blackSteel = 0x17282c;
const shadowSteel = 0x354a4d;
const darkPanel = 0x405455;
const steel = 0x647574;
const patina = 0x3d6662;
const turquoise = 0x527d75;
const wood = 0x635646;
const warmSteel = 0x6a6254;
const brown = 0x493b32;
const rust = 0x8c5e43;
const brass = 0xa88051;
const brassLight = 0xc49a60;
const copper = 0xaf7447;
const lampWhite = 0xf1cc8d;
const mutedGreen = 0x76958a;
const violetGlaze = 0x414251;

function pipe(g: ArenaGeometry, points: readonly Point[], radius: number, color: number, sides = 7): void {
    g.tube(points, radius, color, sides);
}

function strut(g: ArenaGeometry, from: Point, to: Point, radius: number, paint: number): void {
    pipe(g, [from, to], radius, paint, 4);
}

function front(g: ArenaGeometry, left: number, right: number, bottom: number, top: number, z: number, paint: number): void {
    g.face([[left, bottom, z], [right, bottom, z], [right, top, z], [left, top, z]], paint, false);
}

function tile(g: ArenaGeometry, left: number, right: number, near: number, far: number, y: number, paint: number): void {
    g.face([[left, y, near], [right, y, near], [right, y, far], [left, y, far]], paint, false);
}

function shadedHex(r: number, gr: number, b: number, lift: number): number {
    const ch = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    return (ch(r + lift) << 16) | (ch(gr + lift * 0.62) << 8) | ch(b + lift * 0.37);
}

function blend(from: number, to: number, share: number): number {
    const channel = (shift: number) => Math.round(((from >> shift) & 255) * (1 - share) + ((to >> shift) & 255) * share);
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function hardware(g: ArenaGeometry, x: number, y: number, z: number, color = brass): void {
    g.cylinder(x, y, z, 1.55, 1.15, 0.8, color);
}

function distantCity(g: ArenaGeometry): void {
    const sky: readonly [number, number, number][] = [
        [-240, -37, 0x22283d], [-37, 0, 0x374252], [0, 29, violetGlaze],
        [29, 56, 0x383849], [56, 86, 0x292f42], [86, 125, 0x222b3d],
        [125, 190, 0x1c2535], [190, 410, 0x172232],
    ];
    sky.forEach(([bottom, top, tone], index) => {
        const next = sky[index + 1]?.[2] ?? tone;
        const rows = Math.ceil((top - bottom) / 5);
        for (let row = 0; row < rows; row++) {
            front(g, -200, 200, bottom + row * (top - bottom) / rows, bottom + (row + 1) * (top - bottom) / rows,
                -510, blend(tone, next, row / rows));
        }
    });

    tile(g, -198, 198, -189, -493, -116, 0x263645);
    for (let i = 0; i < 30; i++) {
        const x = ((i * 79 + 11) % 375) - 183;
        const z = -463 + (i * 41) % 251;
        const width = 5 + i % 6 * 1.2;
        tile(g, x, x + width, z + 1.4, z, -115.8, i % 7 === 1 ? 0x645450 : i % 3 ? 0x304351 : 0x3c4b56);
    }
    const blocks: readonly [number, number, number, number, number][] = [
        [-180, 29, 50, -475, 0x253544], [-149, 25, 39, -469, 0x263542], [-121, 27, 54, -480, 0x263643],
        [-97, 20, 60, -449, 0x293846], [-70, 31, 34, -471, 0x293a47], [-43, 24, 43, -452, 0x20313f],
        [-19, 17, 36, -460, 0x243544], [4, 24, 49, -470, 0x2c3a49], [29, 17, 44, -454, 0x2a3945],
        [54, 28, 52, -467, 0x263542], [88, 29, 37, -434, 0x283945], [115, 21, 58, -464, 0x233342],
        [142, 30, 47, -456, 0x24323f], [176, 29, 65, -470, 0x273643],
    ];
    blocks.forEach(([x, width, height, z, color], index) => {
        g.box(x, -114, z, width, height, 12, color, 0.55);
        g.box(x - 1.5, -114 + height, z, width + 1.8, 2, 13, 0x2c3b47);
        if (index % 3 === 0) g.box(x + 2.3, -112 + height, z + 1.5, 6, 3.4, 6, 0x364653);
        for (let y = -104; y < -119 + height; y += 8) {
            for (let cx = x - width / 2 + 5; cx < x + width / 2 - 3; cx += 6) {
                if ((index * 19 + Math.round(cx) + y) % 4 === 0) {
                    front(g, cx - 0.9, cx + 1.0, y - 0.15, y + 1.65, z + 6.04, index % 3 ? 0xa28467 : 0xac976a);
                }
            }
        }
    });

    const bridge = -381;
    g.box(-6, -108, bridge, 271, 3.4, 11.7, 0x33424e, 0.5);
    g.box(-6, -103.6, bridge + 3.5, 269, 1.9, 1.1, 0x40505b, 0.18);
    for (const x of [-127, -73, -22, 29, 83, 131]) {
        g.box(x, -117, bridge, 3.8, 14, 8.2, 0x2f3d48, 0.38);
        g.box(x, -103.5, bridge + 3, 1.3, 4.1, 1.4, 0x49505a);
    }

    for (const x of [-132, 12]) {
        const z = x < 0 ? -449 : -469;
        for (const dx of [-1, 1]) {
            strut(g, [x + dx * 8, -80, z], [x + dx * 0.6, 16, z], 0.6, 0x293845);
            for (const y of [-36, -22, -7]) strut(g, [x - 12, y, z], [x + 12, y, z], 0.57, 0x2c3c49);
        }
        for (let y = -73; y < 4; y += 15) {
            const half = (18 - y) / 13;
            strut(g, [x - half, y, z], [x + Math.max(0.6, half - 1), y + 13, z], 0.39, 0x34414d);
        }
    }
    pipe(g, [[-144, -7, -449], [-93, -23, -458], [-60, -24, -464], [0, -7, -469], [76, -24, -479], [181, -20, -470]],
        0.55, 0x293946, 5);
}

function workshopFloor(g: ArenaGeometry): void {
    for (let z = -222, row = 0; z < 663; z += 22, row++) {
        for (let x = -190, col = 0; x < 190; x += 19, col++) {
            const centerX = x + 9.5;
            const hotspot = Math.exp(-(((centerX - 124) / 92) ** 2 + ((z + 68) / 138) ** 2)) * 36;
            const monitor = Math.exp(-(((centerX + 115) / 68) ** 2 + ((z + 81) / 83) ** 2)) * 5;
            const falloff = Math.min(10, Math.max(0, (z - 182) / 39));
            const grain = Math.sin(row * 34.29 + col * 22.75) * 0.68;
            tile(g, x, x + 19, z + 22, z, -0.2, shadedHex(25, 39, 44, hotspot + monitor - falloff + grain));
        }
    }
    for (let x = -172; x < 173; x += 42) {
        for (let z = -204; z < 605; z += 51) {
            const tone = shadedHex(32, 46, 47, -Math.min(12, Math.max(0, (z - 85) / 39)));
            tile(g, x, x + 0.72, Math.min(605, z + 51), z, 0.01, tone);
        }
    }
    for (let z = -186; z < 510; z += 71) {
        const lift = Math.exp(-(((z + 58) / 141) ** 2));
        const darken = Math.min(9, Math.max(0, (z - 100) / 41));
        tile(g, -188, 188, z + 0.92, z, 0.014, shadedHex(26, 40, 41, lift * 8 - darken));
        for (const x of [-147, 144]) {
            g.cylinder(x, 0.017, z + 4, 0.96, 0.86, 0.19, 0x465454);
        }
    }
    for (let i = 0; i < 44; i++) {
        const x = (i * 73 % 365) - 176, z = (i * 37 % 648) - 195;
        tile(g, x, x + 2 + i % 7, z + 0.44 + i % 3 * 0.38, z, 0.028, i % 4 ? 0x293c3e : 0x384648);
    }
    for (const z of [58, 66]) tile(g, -35, 35, z + 1.1, z, 0.03, 0x61583d);
    g.box(0, 0.18, -217, 392, 2.3, 7.5, 0x425253, 0.75);
    for (const x of [-183, -103, -23, 56, 136, 181]) g.box(x, 2.5, -209, 3.4, 17, 3.4, iron, 0.62);
    g.box(0, 16.5, -211, 392, 3.0, 4.3, 0x405357, 0.72);
    g.box(0, 6.1, -209, 383, 1.45, 2.1, 0x33494d);
}

function shopFrame(g: ArenaGeometry): void {
    g.box(124, 0, -172, 131, 142, 11.4, 0x344c4b, 1.0);
    g.box(124, 130, -174, 132, 20, 15, 0x263c3f, 1.2);
    for (const y of [25, 78, 126]) g.box(125, y, -165, 127, 1.45, 2, blackSteel);
    for (const x of [-180, 58, 182]) {
        g.box(x, 0, -163, 7, 162, 11.7, patina, 0.95);
        g.box(x, 19, -156.7, 12.6, 8.3, 1.5, warmSteel, 0.92);
        g.box(x, 137, -155.6, 14.9, 11.3, 2.3, rust, 1.03);
        for (const dx of [-3.2, 3.2]) front(g, x + dx - 0.75, x + dx + 0.75, 142, 143.45, -153.65, brass);
    }
    g.box(117, 158, -137, 150, 4.9, 89, 0x223539, 1.3);
    g.box(117, 155, -92.5, 150, 4.7, 4.0, 0x3b5050, 0.75);
    for (let x = 46; x < 188; x += 7.9) {
        g.box(x, 162.75, -137, 5.25, 1.2, 87.4, 0x2b3e43, 0.38);
    }
    for (const x of [58, 172]) strut(g, [x, 116, -159], [x, 159, -93], 2.5, iron);
    g.box(-147, 5, -186, 60, 108, 7.5, darkPanel, 1.3);
    for (let y = 9; y < 109; y += 4) g.box(-147, y, -181, 59, 0.84, 1.73, iron, 0.12);
    g.box(-118, 4, -180, 4, 113, 3.9, steel, 0.55);
    g.box(-147, 112, -181, 65, 3.8, 4.9, patina, 0.74);
    pipe(g, [[-185, 115, -159], [-172, 114, -156], [-165, 105, -154], [-143, 98, -154],
        [-117, 97, -155], [-98, 103, -158]], 1.15, blackSteel, 7);
}

function drawer(g: ArenaGeometry, x: number, y: number, z: number, width: number, height: number,
    base: number, handle: number): void {
    g.box(x, y, z, width, height, 1.50, blackSteel, 0.76);
    g.box(x, y + 0.6, z + 0.98, width - 1.85, height - 1.2, 1.0, base, 0.61);
    g.box(x, y + height * 0.55, z + 1.73, width * 0.26, 1.46, 2.25, handle, 0.51);
}

function diagnostics(g: ArenaGeometry): void {
    const x = -119, z = -116;
    g.box(x, 40, z, 126, 5.45, 51, wood, 1.7);
    g.box(x, 39.95, z + 25.1, 126, 4.73, 2.75, rust, 0.95);
    g.box(x - 7, 44.8, z - 3, 56, 0.45, 39, 0x4d625b, 1.0);
    for (const dx of [-56, 56]) {
        for (const dz of [-21, 21]) {
            g.box(x + dx, 0, z + dz, 4.3, 40, 4.8, steel, 0.59);
            g.box(x + dx, 0.15, z + dz, 7, 2, 6, iron, 0.59);
            hardware(g, x + dx + 2.5, 44.9, z + dz + 1.1);
        }
    }
    g.box(x - 27, 0.9, z + 1.5, 47, 33, 38, iron, 0.9);
    for (const y of [2, 13, 24]) drawer(g, x - 27, y, z + 20.8, 44, 9.7, 0x5a6760, brass);
    strut(g, [x + 54, 9.6, z + 18], [x + 23, 33.0, z + 17], 1.67, iron);

    const screenX = x - 15, screenZ = z - 8;
    g.box(screenX, 45.7, screenZ - 1, 43, 38, 33, iron, 2.45);
    g.box(screenX, 48.0, screenZ + 15.0, 41, 34.8, 4.25, 0x8b826c, 2.76);
    g.box(screenX, 54.8, screenZ + 17.45, 29.1, 21.1, 2.09, 0x304347, 1.71);
    front(g, screenX - 13, screenX + 13, 56.7, 74.0, screenZ + 18.58, 0x35594f);
    for (const y of [60, 64, 68, 72]) front(g, screenX - 12.7, screenX + 12.7, y, y + 0.29, screenZ + 18.61, 0x486b60);
    for (const dx of [-10, -5, 0, 5, 10]) front(g, screenX + dx, screenX + dx + 0.29, 56.8, 74, screenZ + 18.61, 0x486b60);
    const waveform: Point[] = [[-12, 63.1], [-7, 64], [-4, 64.1], [-2.1, 70.35], [0.62, 60.8], [3.4, 64.3],
        [6.8, 64.7], [11.8, 65.7]].map(([dx, y]) => [screenX + dx, y, screenZ + 18.68]);
    pipe(g, waveform, 0.40, 0x9aba87, 5);
    for (const dx of [-15, 9, 15]) g.box(screenX + dx, 49.3, screenZ + 17.65, 2.26, 2.3, 1.1, dx > 0 ? brass : mutedGreen, 0.3);
    g.box(x + 22, 45.2, z + 0.5, 19.0, 4.1, 9.6, shadowSteel, 0.59);
    for (const dx of [-4.5, 4.5]) g.cylinder(x + 22 + dx, 49.08, z + 0.52, 1.3, 1.23, 0.83, brassLight);
    pipe(g, [[x + 22, 46.3, z + 4], [x + 34, 46.0, z + 10], [x + 42, 43.8, z + 14], [x + 38, 33, z + 24]], 0.59, copper, 6);
}

function forgeLamp(g: ArenaGeometry): void {
    const x = 137, z = -69;
    g.box(x, 136, -163.6, 13.6, 9.6, 4.3, iron, 0.93);
    pipe(g, [[x, 141.3, -165.8], [x, 148.5, -154], [x, 148, -132], [x, 144, z - 9], [x, 139.6, z]], 2.1, brass);
    g.cylinder(x, 119.1, z, 4.25, 7.15, 4.55, lampWhite);
    g.cylinder(x, 122.6, z, 7.25, 7.33, 1.65, lampWhite);
    g.cylinder(x, 124.3, z, 9.35, 8.7, 2.6, brassLight);
    g.cylinder(x, 125.1, z, 8.4, 7.1, 3.25, lampWhite);
    g.cylinder(x, 128.3, z, 13.4, 8.6, 7.3, 0x465357);
    g.cylinder(x, 135.1, z, 8.8, 4.55, 4.1, iron);
    g.cylinder(x, 139.1, z, 3.4, 2.7, 3.25, rust);
    g.cylinder(x, 127.7, z, 14.0, 13.2, 1.45, rust);
    for (let i = 0; i < 6; i++) {
        const angle = i * Math.PI / 3, dx = Math.cos(angle), dz = Math.sin(angle);
        pipe(g, [[x + dx * 11.65, 128.15, z + dz * 11.65], [x + dx * 9.4, 124.2, z + dz * 9.4],
            [x + dx * 6.8, 119.8, z + dz * 6.8]], 0.42, brassLight, 5);
    }
    const arc: Point[] = [];
    for (let i = 0; i <= 19; i++) {
        const angle = i * Math.PI * 2 / 19;
        arc.push([x + 9.4 * Math.cos(angle), 124.6, z + 9.4 * Math.sin(angle)]);
    }
    pipe(g, arc, 0.38, 0xb39358, 5);
    g.face([[64, 108, -166.05], [185, 89, -166.05], [185, 133, -166.05], [151, 128, -166.05]],
        0x5b6b59, false);
}

function hangingTools(g: ArenaGeometry): void {
    const boardZ = -153;
    g.box(128, 48.5, boardZ, 104.5, 63.8, 4.35, 0x46625c, 1.2);
    for (const y of [48.0, 110.7]) g.box(128, y, boardZ + 2.28, 106.9, 2.15, 1.7, turquoise, 0.35);
    for (let x = 80; x < 177; x += 5.8) {
        for (let y = 52; y < 111; y += 5.5) front(g, x, x + 0.72, y, y + 0.77, boardZ + 2.185, 0x34514d);
    }
    const z = boardZ + 3.7;
    for (const [x, top, length] of [[87, 102, 25], [99, 103, 29], [112, 100, 22]]) {
        g.box(x, top - length, z, 2.1, length - 3, 1.48, steel, 0.39);
        pipe(g, [[x - 3.6, top + 1, z], [x - 3.45, top - 3.7, z], [x, top - 5.3, z],
            [x + 3.45, top - 3.7, z], [x + 3.6, top + 1, z]], 0.92, brassLight, 6);
        g.box(x, top - length - 1.6, z + 0.1, 3.3, 1.7, 1.71, brass, 0.45);
    }
    for (const [x, y, grip] of [[89, 70, copper], [100, 73, rust], [111, 69, brass]]) {
        g.box(x, y - 16.4, z, 1.1, 13.65, 1.15, steel);
        g.box(x, y - 4.0, z + 0.18, 2.77, 7.4, 2.23, grip, 0.47);
    }
    g.box(129, 76, z, 2.78, 23.2, 2.26, warmSteel, 0.46);
    g.box(128.1, 99, z + 0.31, 11.8, 4.1, 4.55, steel, 0.53);
    pipe(g, [[133, 59.5, z], [135, 70.1, z], [140.4, 76, z], [142.7, 83.3, z]], 1.66, steel, 6);
    pipe(g, [[147, 59.5, z], [145, 70.2, z], [139.9, 76, z], [137.3, 83.6, z]], 1.66, steel, 6);
    for (let coil = 0; coil < 3; coil++) {
        const arc: Point[] = [];
        for (let i = 0; i <= 41; i++) {
            const angle = i * Math.PI * 2 / 41, r = 10.6 - coil * 1.4;
            arc.push([165 + r * Math.cos(angle), 81 + r * 1.47 * Math.sin(angle), z + 1.5 + coil * 0.2]);
        }
        pipe(g, arc, 0.91, coil % 2 ? rust : copper, 6);
    }
    pipe(g, [[170, 66.9, z + 2.1], [174.3, 63, z + 2.5], [174, 50.8, z + 4.1], [165.7, 46.8, z + 6]], 1.0, copper, 6);
    g.box(165.2, 46.1, z + 6.54, 3.6, 2.5, 4.1, brass, 0.68);
}

function serviceCase(g: ArenaGeometry, x: number, z: number, width: number, depth: number, height: number, paint: number): void {
    g.box(x, 0, z, width, height, depth, paint, 1.85);
    g.box(x, height - 4.5, z + depth * 0.5, width - 1.5, 1.09, 1.50, brown, 0.24);
    g.box(x, height - 3.2, z, width + 1.0, 3.13, depth + 0.8, warmSteel, 1.5);
    g.box(x, height - 0.25, z, width - 5.3, 0.67, depth - 5.4, wood, 1.0);
    for (const side of [-1, 1]) {
        const edge = x + side * width * 0.41;
        g.box(edge, height - 6.4, z + depth * 0.51, 5.25, 6.65, 1.84, brass, 0.55);
        g.box(edge, height - 6.8, z + depth * 0.52, 3.5, 2.3, 1.1, iron, 0.24);
        g.box(x + side * (width / 2 - 1), 0.6, z + depth * 0.432, 3.64, 2.4, 3.5, rust, 0.5);
    }
}

function serviceBench(g: ArenaGeometry): void {
    const x = 126, z = -97;
    g.box(x, 41, z, 117, 4.8, 53, 0x70634c, 1.75);
    g.box(x, 40.9, z + 26, 117, 4.6, 3.0, rust, 0.95);
    g.box(x, 12.8, z, 106, 2.65, 45, wood, 1.0);
    for (const dx of [-54, 54]) {
        for (const dz of [-20, 21]) {
            g.box(x + dx, 0, z + dz, 4.8, 42, 5.01, patina, 0.9);
            g.box(x + dx, 0.11, z + dz, 8, 2.2, 7.1, iron, 0.71);
            hardware(g, x + dx, 45.74, z + dz + 1.3);
        }
    }
    g.box(x - 32, 0.7, z, 34, 12.7, 27.5, iron, 0.89);
    drawer(g, x - 32, 1.5, z + 13.7, 31.6, 10.4, 0x697762, brass);
    const viseX = 109, viseZ = z + 6;
    g.box(viseX, 45.45, viseZ, 16.1, 2.55, 12, steel, 0.96);
    g.box(viseX, 48.0, viseZ, 11.55, 4.0, 9.85, patina, 0.91);
    for (const dx of [-5.2, 5.2]) g.box(viseX + dx, 51.2, viseZ, 4.28, 4.65, 9.4, steel, 0.83);
    strut(g, [viseX + 7, 50.25, viseZ], [viseX + 13, 50.25, viseZ + 2.14], 0.85, brass);
    strut(g, [viseX + 12.2, 47.0, viseZ + 3.65], [viseX + 12.2, 54.2, viseZ + 0.26], 0.8, steel);
    for (const [px, pz] of [[153, -96], [169, -94], [165, -109]]) {
        g.cylinder(px, 45.45, pz, 3.1, 2.65, 1.47, iron);
        g.cylinder(px, 46.9, pz, 1.95, 1.79, 1.39, brassLight);
    }
    g.box(158, 15.7, z - 2.9, 22, 17.5, 20, darkPanel, 1.25);
    g.box(158, 16.6, z + 8.38, 19.6, 14.4, 1.1, shadowSteel, 0.83);
    g.box(158, 20.6, z + 8.9, 5.6, 3.45, 2.15, brass, 0.63);

    serviceCase(g, 3, -1, 71, 39, 21, 0x834e3c);
    serviceCase(g, -63, 11, 39, 31, 14, 0x645a46);
    const cupX = -19, cupZ = -8;
    g.cylinder(cupX, 21.4, cupZ, 2.4, 3.6, 7.3, 0xbaa382);
    g.cylinder(cupX, 28.7, cupZ, 3.7, 3.75, 0.6, 0xdac09a);
    g.cylinder(cupX, 29.30, cupZ, 2.88, 2.9, 0.10, brown);
    pipe(g, [[cupX + 3.15, 27.7, cupZ], [cupX + 5.72, 27.9, cupZ], [cupX + 6.6, 26.0, cupZ],
        [cupX + 5.78, 23.73, cupZ], [cupX + 2.8, 23.85, cupZ]], 0.59, 0xb59c7b, 6);
}

function buildDepot(): Mesh {
    const geometry = new ArenaGeometry();
    distantCity(geometry);
    workshopFloor(geometry);
    shopFrame(geometry);
    diagnostics(geometry);
    serviceBench(geometry);
    hangingTools(geometry);
    forgeLamp(geometry);
    return geometry.mesh();
}

/** Original 3D rendition of the campaign's riverside workshop illustration. */
export class PrototypeDepotMeshes {
    private mesh?: Mesh;
    private material?: Material;
    private instance?: Node;

    create(parent: Node, layer: number): Node {
        if (this.instance?.isValid) return this.instance;
        this.mesh ??= buildDepot();
        if (!this.material) {
            this.material = new Material();
            this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        }
        const room = new Node('3D Night Depot');
        room.layer = layer;
        parent.addChild(room);
        const renderer = room.addComponent(MeshRenderer);
        renderer.mesh = this.mesh;
        renderer.setSharedMaterial(this.material, 0);
        const marker = new Node('3D Mechanic Marker');
        marker.layer = layer;
        marker.setPosition(3, 21.45, -1);
        room.addChild(marker);
        this.instance = room;
        return room;
    }

    destroy(): void {
        if (this.instance?.isValid) this.instance.destroy();
        this.instance = undefined;
        this.mesh?.destroy();
        this.mesh = undefined;
        this.material?.destroy();
        this.material = undefined;
    }
}
