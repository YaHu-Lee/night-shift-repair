import type { ArenaGeometry } from './PrototypeArenaMeshes';

type Point = [number, number, number];
type Floor = [number, number];
type RGB = [number, number, number];

const steel = 0x536568;
const blueSteel = 0x47616b;
const darkSteel = 0x283b43;
const shadow = 0x1b2b32;
const warmSteel = 0x645d4d;
const wornBrass = 0xa5834b;
const copper = 0x956443;
const ochre = 0xa47739;
const oxide = 0x7b5542;
const warmGlass = 0xe2ae62;
const paleGlass = 0xb5c5b2;
const floorDepth = 0.8;

function ground(y: number): number {
    return (350 - y) / floorDepth;
}

function block(g: ArenaGeometry, x: number, lane: number, h: number, width: number, span: number,
    height: number, paint: number, bevel = 0, yaw = 0): void {
    g.box(x, h, ground(lane), width, height, span / floorDepth, paint, bevel, yaw);
}

function beam(g: ArenaGeometry, from: Point, to: Point, radius: number, color: number): void {
    g.tube([from, to], radius, color, 4);
}

function pipe(g: ArenaGeometry, path: Point[], radius: number, color: number): void {
    g.tube(path, radius, color, 10);
}

function line(g: ArenaGeometry, from: Floor, to: Floor, width: number, color: RGB, y = -0.06): void {
    g.stroke(from, to, width, y, () => color);
}

function floorSeams(g: ArenaGeometry, crossbars: readonly number[], columns: readonly number[], tint: RGB): void {
    for (const y of crossbars) line(g, [-151, y], [151, y], 0.56, tint);
    for (const x of columns) line(g, [x, 157], [x, 513], 0.48, tint);
}

function hatch(g: ArenaGeometry, x: number, lane: number, width: number, depth: number, paint: number,
    studs = 0x273a40): void {
    block(g, x, lane, -0.17, width + 1.45, depth + 1.3, 0.28, shadow, 0.6);
    block(g, x, lane, 0.09, width, depth, 0.3, paint, 0.6);
    for (const dx of [-width / 2 + 2.1, width / 2 - 2.1]) {
        for (const dy of [-depth / 2 + 2, depth / 2 - 2]) {
            g.cylinder(x + dx, 0.37, ground(lane + dy), 0.56, 0.49, 0.19, studs);
        }
    }
}

function drain(g: ArenaGeometry, x: number, from: number, to: number, paint = darkSteel): void {
    const center = (from + to) / 2;
    block(g, x, center, -0.23, 6.2, to - from, 0.3, shadow, 0.4);
    for (const rail of [x - 3.1, x + 3.1]) block(g, rail, center, 0.07, 0.9, to - from, 0.45, paint);
    for (let y = from + 3; y < to - 1; y += 6.4) block(g, x, y, 0.10, 5.1, 1.05, 0.48, paint);
}

function lamp(g: ArenaGeometry, x: number, lane: number, height: number, paint = warmGlass): void {
    const z = ground(lane);
    g.box(x, height, z - 0.9, 11, 5.8, 4.6, shadow, 0.75);
    g.box(x, height + 0.55, z + 0.9, 8.1, 2.9, 2.4, paint, 0.5);
    g.box(x, height + 4.55, z + 0.15, 11.9, 1.35, 5.2, oxide, 0.35);
    for (const dx of [-3.1, 3.1]) g.box(x + dx, height + 0.3, z + 2, 0.49, 3.4, 0.55, warmSteel);
}

function rearWall(g: ArenaGeometry, paint: number, posts: readonly number[]): void {
    block(g, 0, 555, -0.2, 360, 13, 25, paint, 0.6);
    block(g, 0, 549, 1, 358, 4.6, 3.9, shadow, 0.45);
    for (const x of posts) {
        block(g, x, 548, 0, 5.5, 10.1, 27, darkSteel, 0.8);
        block(g, x, 545, 2, 1.25, 1.2, 21, steel, 0.3);
    }
}

function door(g: ArenaGeometry, x: number, lane: number, width: number, height: number,
    paint: number, frame: number, slats = 7): void {
    const z = ground(lane);
    g.box(x, -0.1, z - 0.35, width + 7, height + 5, 7.3, shadow, 0.9);
    g.box(x, 0.65, z + 2.8, width, height, 2.45, paint, 0.5);
    for (let i = 1; i <= slats; i++) {
        const y = height * i / (slats + 1);
        g.box(x, y, z + 4, width - 1.0, 0.56, 0.64, frame);
    }
    for (const dx of [-width / 2 - 1.6, width / 2 + 1.6]) g.box(x + dx, 0.15, z + 3.2, 3.3, height + 3, 3.8, frame, 0.55);
    g.box(x, height + 0.4, z + 3.7, width + 4.2, 2.8, 4.2, frame, 0.5);
    g.box(x, 0, z + 4.5, width + 3.8, 1.8, 6.0, darkSteel, 0.35);
}

function wheel(g: ArenaGeometry, x: number, y: number, z: number, r: number, paint = wornBrass): void {
    const ring: Point[] = [];
    for (let i = 0; i <= 18; i++) {
        const angle = i * Math.PI / 9;
        ring.push([x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.88, z + Math.sin(angle) * r * 0.33]);
    }
    g.tube(ring, r * 0.105, paint, 6);
    for (let i = 0; i < 6; i++) {
        const point = ring[i * 3];
        beam(g, [x, y, z], point, r * 0.053, paint);
    }
    beam(g, [x, y, z - 4.3], [x, y, z + 1.6], r * 0.18, warmSteel);
}

function insulator(g: ArenaGeometry, x: number, lane: number, base: number, height: number,
    paint: number, body = warmSteel): void {
    const z = ground(lane);
    g.cylinder(x, base, z, 3.6, 3.0, height, body);
    for (let i = 0; i < 5; i++) {
        g.cylinder(x, base + height * (0.11 + i * 0.18), z, 4.6, 4.0, 1.05, paint);
    }
    g.cylinder(x, base + height, z, 2.8, 2.45, 2.7, copper);
}

function pumpRoom(g: ArenaGeometry): void {
    rearWall(g, 0x344b47, [-163, -41, 75, 165]);
    drain(g, -162, 151, 528, 0x3d5954);
    drain(g, 165, 155, 526, 0x3e5650);
    floorSeams(g, [203, 326, 454], [-133, 134], [33, 54, 47]);
    hatch(g, -111, 198, 24, 16, 0x3e564d);
    hatch(g, 115, 418, 29, 14, 0x3c5449);
    const upper = ground(545), lower = ground(529);
    const shell = 0x3f7469;
    pipe(g, [[-173, 8, upper + 6], [-154, 8, upper + 6], [-146, 12, upper + 2], [-140, 18, upper],
        [-130, 19, upper], [147, 19, upper], [160, 18, upper + 4], [169, 10, upper + 6]], 8.2, shell);
    pipe(g, [[-169, 10, lower], [92, 10, lower], [103, 10, lower - 2], [111, 13, lower - 9],
        [112, 20, lower - 17], [123, 24, lower - 21], [169, 24, lower - 21]], 7.0, 0x355f56);
    for (const x of [-130, -52, 20, 102]) {
        pipe(g, [[x - 1.1, 19, upper], [x + 1.1, 19, upper]], 9.4, 0x557f71);
        block(g, x, 542, 0, 9, 21, 5.7, darkSteel, 0.9);
    }
    for (const x of [-109, -27, 45, 88]) pipe(g, [[x - 0.9, 10, lower], [x + 0.9, 10, lower]], 8.05, 0x56786b);
    wheel(g, 22, 23, upper + 11, 8.8);
    wheel(g, 99, 15, lower + 8.9, 8.4);
    lamp(g, -145, 540, 20);
}

function dispatchSubstation(g: ArenaGeometry): void {
    rearWall(g, 0x3b454a, [-165, -94, 0, 95, 165]);
    floorSeams(g, [190, 279, 368, 458], [-112, 112], [42, 54, 59]);
    hatch(g, -123, 213, 26, 18, 0x48565c);
    hatch(g, 130, 479, 22, 16, 0x465359);
    const lane = 534, z = ground(lane);
    for (let i = 0; i < 7; i++) {
        const x = -132 + 43.4 * i;
        const height = i === 3 ? 30 : 24;
        block(g, x, lane, 0, 38, 24, height, i % 2 ? 0x53626a : 0x485861, 1.3);
        g.box(x, 2, z + 15.0, 33, height - 4.0, 1.6, 0x3f5057, 0.8);
        g.box(x, height - 10.2, z + 16.15, 18, 7.1, 1.35, shadow, 0.42);
        for (const dx of [-4.5, 4.5]) g.box(x + dx, height - 7.8, z + 17.0, 3.3, 1.7, 0.48, i === 3 ? paleGlass : wornBrass);
        g.box(x + 11.4, 5.8, z + 16.35, 1.4, 7.3, 1.17, wornBrass, 0.35);
        for (let fin = -11; fin <= 11; fin += 4.4) g.box(x + fin, 1.55, z + 16.32, 2.9, 1.4, 0.55, shadow);
        pipe(g, [[x, height, z - 3], [x, height + 4, z - 3], [x, height + 5.7, z - 8], [x + 10, height + 6.4, z - 11]],
            1.4, i % 2 ? copper : steel);
    }
    for (const y of [34, 38]) pipe(g, [[-162, y, z - 9], [-151, y + 0.7, z - 6], [159, y + 0.7, z - 6]], 1.4, darkSteel);
    lamp(g, -154, 537, 16);
    lamp(g, 154, 538, 17);
}

function feederBridge(g: ArenaGeometry): void {
    floorSeams(g, [194, 271, 348, 425, 503], [-144, 145], [32, 49, 54]);
    for (const y of [233, 452]) hatch(g, -118, y, 18, 10, 0x435a60);
    const z = ground(546);
    for (const side of [-1, 1]) {
        const x = side * 115;
        block(g, x, 543, 0, 122, 15, 8.5, 0x4e5d5d, 1.4);
        g.box(x, 7.4, z + 6, 123, 2.6, 3.7, steel, 0.55);
        for (const inner of [59, 91, 126, 160]) {
            const col = inner * side;
            g.box(col, 0.1, z + 10, 4.3, 19, 5.8, darkSteel, 0.9);
            g.box(col, 1.0, z + 11.7, 7.7, 1.9, 7.8, warmSteel, 0.7);
            g.cylinder(col, 19, z + 10, 2.5, 2, 1.1, wornBrass);
        }
        const cables: Point[][] = [
            [[side * 57, 17, z + 13], [side * 84, 20, z + 9], [side * 117, 23, z + 2],
                [side * 148, 27, z - 8], [side * 175, 28, z - 11]],
            [[side * 57, 12, z + 13], [side * 84, 15, z + 9], [side * 117, 18, z + 2],
                [side * 148, 22, z - 8], [side * 175, 23, z - 11]],
        ];
        for (const cable of cables) pipe(g, cable, 1.2, steel);
        for (const lane of [536, 550]) insulator(g, side * 37, lane, 1, 15.5, 0x849498);
        beam(g, [side * 33, 20.5, z + 9], [side * 52, 16, z + 12.8], 1.22, copper);
        lamp(g, side * 98, 530, 8.5);
    }
    pipe(g, [[-38, 19, z - 6], [-18, 14, z - 4], [19, 14, z - 4], [38, 19, z - 6]], 1.08, darkSteel);
}

function switchgearYard(g: ArenaGeometry): void {
    rearWall(g, 0x394b4c, [-166, -58, 57, 167]);
    door(g, 0, 541, 93, 19, 0x394d4d, 0x506d6c);
    floorSeams(g, [208, 324, 443], [-69, 68], [36, 52, 53]);
    hatch(g, 0, 194, 23, 15, 0x42585a);
    const z = ground(536);
    for (const side of [-1, 1]) {
        const x = side * 115;
        g.box(x, -0.18, z + 1.5, 69, 2, 32, shadow, 1.0);
        g.box(x, 1, z + 1.5, 59, 12.2, 22, 0x4f6867, 1.7);
        g.box(x, 12.6, z + 1.5, 63, 2.0, 25, steel, 1.4);
        for (let fin = -22; fin <= 22; fin += 5.4) {
            g.box(x + fin, 2.4, z + 12.7, 2.1, 9.3, 3.55, darkSteel, 0.38);
        }
        for (let i = 0; i < 3; i++) {
            const dx = x + 18 * (i - 1);
            insulator(g, dx, 538, 13, i === 1 ? 13 : 10.5, i === 1 ? 0x9dad9c : 0x81988c);
            pipe(g, [[dx, 28.5, z - 2], [dx + side * 0.7, 33.0, z - 7], [dx + side * 7, 32, z - 13]], 1.44, copper);
        }
        lamp(g, side * 49, 533, 12.4);
    }
}

function pallet(g: ArenaGeometry, x: number, lane: number, width: number, paint: number): void {
    const z = ground(lane);
    for (const dz of [-5, 5]) g.box(x, 0, z + dz, width, 1.7, 3.6, darkSteel, 0.38);
    for (let dx = -width / 2 + 2; dx < width / 2 - 1; dx += 4) g.box(x + dx, 1.5, z, 3.6, 1.25, 15, paint, 0.22);
}

function crate(g: ArenaGeometry, x: number, lane: number, width: number, paint: number): void {
    pallet(g, x, lane, width + 3, warmSteel);
    block(g, x, lane, 2.65, width, 12, 10.3, paint, 0.8);
    for (const side of [-1, 1]) {
        g.box(x + side * (width / 2 - 2.1), 3, ground(lane) + 7.52, 1.55, 9, 0.77, wornBrass);
        g.box(x + side * (width / 2 - 2.1), 12.9, ground(lane), 1.55, 0.6, 14.6, wornBrass);
    }
    g.box(x, 9.1, ground(lane) + 7.73, width - 3, 0.82, 0.55, shadow);
}

function loadingDock(g: ArenaGeometry): void {
    rearWall(g, 0x39474c, [-163, -77, 2, 73, 166]);
    for (const x of [-111, -31, 50, 131]) door(g, x, 542, 58, 19, 0x344a54, 0x57717b);
    const z = ground(545);
    for (const top of [27, 31]) g.box(68, top, z + 6.2, 190, 1.85, 2.2, ochre, 0.21);
    for (const x of [-22, 23, 69, 115, 160]) {
        beam(g, [x, 27.7, z + 7], [x + 9, 31.5, z + 7], 0.73, wornBrass);
    }
    beam(g, [84, 28, z + 8], [84, 13, z + 14], 0.60, darkSteel);
    wheel(g, 84, 10, z + 14, 3.65, ochre);
    for (const [x, lane, width] of [[-142, 520, 22], [-115, 526, 18], [112, 520, 18], [145, 526, 18]]) {
        crate(g, x, lane, width, 0x655f4b);
    }
    for (const x of [-61, 49]) lamp(g, x, 536, 13.2);
    floorSeams(g, [201, 328, 449], [-120, 120], [46, 54, 55]);
    for (const x of [-126, 126]) {
        line(g, [x, 477], [x, 515], 0.95, [97, 83, 55]);
        line(g, [x, 477], [x - Math.sign(x) * 21, 477], 0.95, [97, 83, 55]);
    }
}

function coldStorage(g: ArenaGeometry): void {
    rearWall(g, 0x394c5b, [-162, -72, 15, 85, 151]);
    const lane = 538, z = ground(lane);
    const ice = 0x748796, blue = 0x46647b;
    for (const x of [-111, -22, 66]) {
        door(g, x, lane, 61, 20, 0x3c566d, ice, 2);
        g.box(x, 2, z + 4.1, 1.1, 17.3, 0.91, shadow);
        for (const dx of [-3.7, 3.7]) g.box(x + dx, 6.1, z + 5, 1.65, 3.0, 1.2, paleGlass, 0.24);
        block(g, x, 524, 0, 65, 3.1, 1.2, ice, 0.28);
        lamp(g, x, 541, 19.8, x < 0 ? warmGlass : 0xb1c3be);
    }
    block(g, 139, 540, 4.3, 48, 19, 20.6, ice, 1.05);
    g.box(139, 7.3, z + 10.4, 45, 14.7, 2.5, darkSteel, 0.78);
    for (const x of [128, 150]) {
        wheel(g, x, 14.6, z + 12.6, 7.3, blue);
        beam(g, [x, 14.6, z + 11.5], [x, 14.6, z + 13.9], 1.4, paleGlass);
    }
    pipe(g, [[-162, 25, z - 6], [150, 25, z - 6], [164, 24.3, z - 5], [168, 18, z - 4], [168, 5, z + 8]], 2.2, blueSteel);
    floorSeams(g, [216, 308, 402, 489], [-124, 124], [47, 66, 88]);
    for (const side of [-1, 1]) {
        for (let i = 0; i < 13; i++) {
            const laneOffset = 161 + i * 29.5;
            const x = side * (154 + 3 * Math.sin(i * 3));
            const localZ = ground(laneOffset);
            g.face([[x - 3.8, -0.04, localZ + 1.5], [x + 3.4, -0.04, localZ + 3.0],
                [x + 1.6, -0.04, localZ - 1.7]], i % 3 ? 0x4d657e : 0x526c85, false);
        }
    }
}

function sorter(g: ArenaGeometry): void {
    rearWall(g, 0x37494a, [-160, -98, -31, 34, 90, 166]);
    const top = ground(542), bottom = ground(512);
    for (const x of [-107, -24, 57]) {
        door(g, x, 545, 37, 13.5, darkSteel, steel, 3);
        g.box(x, 0, bottom - 5, 30, 2.2, 25, shadow, 0.55);
        g.face([[x - 14, 1.0, bottom + 7], [x + 14, 1.0, bottom + 7], [x + 10.7, 6.3, top + 4],
            [x - 10.7, 6.3, top + 4]], blueSteel);
        for (const side of [-1, 1]) {
            beam(g, [x + side * 14.1, 2.5, bottom + 7], [x + side * 11.3, 8.4, top + 4], 1.44, wornBrass);
        }
        for (let r = 0; r < 5; r++) {
            const z = bottom + 3 + (top - bottom + 4) * r / 5;
            g.box(x, 1.7 + r * 0.92, z, 24.2 - 1.0 * r, 0.64, 1.45, darkSteel);
        }
        lamp(g, x, 540, 15);
    }
    beam(g, [175, 25, top + 1], [86, 8, bottom + 8], 3.5, darkSteel);
    beam(g, [174, 28.4, top + 2], [85, 10.9, bottom + 7], 1.37, wornBrass);
    for (const x of [111, 154]) block(g, x, 537, 0.3, 5.5, 9.4, 12.9, darkSteel, 0.58);
    floorSeams(g, [226, 480], [-139, 139], [36, 55, 57]);
    hatch(g, 147, 374, 12, 18, 0x4a625f);
}

function hoist(g: ArenaGeometry): void {
    rearWall(g, 0x384649, [-166, -91, 92, 168]);
    const z = ground(542);
    g.box(0, 0, z + 5, 132, 18, 15, shadow, 0.66);
    g.box(0, 0.4, z + 13, 121, 1.4, 6, darkSteel, 0.48);
    for (const side of [-1, 1]) {
        const x = side * 74;
        g.box(x, 0, z + 10.5, 12.5, 3, 12.1, warmSteel, 1.0);
        g.box(x, 0, z + 11.2, 6.5, 30, 6.1, darkSteel, 1.12);
        beam(g, [x, 14.3, z + 12.0], [side * 97, 32.8, z + 9.8], 1.9, warmSteel);
        beam(g, [x, 8, z + 11.9], [side * 91, 19.2, z + 10.75], 0.85, steel);
        lamp(g, side * 87, 536, 13);
    }
    g.box(0, 27.5, z + 12.5, 173, 5.1, 8.1, steel, 0.66);
    g.box(0, 30.9, z + 13.8, 170, 1.1, 6, warmSteel, 0.4);
    pipe(g, [[-45, 31, z + 14], [45, 31, z + 14]], 5.5, darkSteel);
    for (const x of [-33, -21, 19, 31]) pipe(g, [[x - 0.9, 31, z + 14], [x + 0.9, 31, z + 14]], 6.2, wornBrass);
    beam(g, [-21, 29, z + 17], [-21, 7.7, z + 18], 0.79, steel);
    beam(g, [19, 29, z + 17], [19, 7.7, z + 18], 0.79, steel);
    floorSeams(g, [175, 251, 334, 446], [-142, 142], [46, 61, 63]);
    for (const x of [-115, 115]) {
        hatch(g, x, 494, 26, 10, 0x495d60);
        drain(g, x * 1.42, 169, 494, darkSteel);
    }
}

function freightYard(g: ArenaGeometry): void {
    rearWall(g, 0x4e4a41, [-161, -86, 0, 86, 161]);
    door(g, 0, 542, 128, 19, 0x4d5150, 0x5e6259, 8);
    const z = ground(540);
    for (const side of [-1, 1]) {
        const x = side * 114;
        block(g, x, 535, 0, 62, 17, 3.5, darkSteel, 1.15);
        const left = x - 27, right = x + 27;
        const upperLeft = x - 19, upperRight = x + 19;
        beam(g, [left, 0.7, z + 13], [upperLeft, 31, z + 4.2], 2.35, oxide);
        beam(g, [right, 0.7, z + 13], [upperRight, 31, z + 4.2], 2.35, oxide);
        beam(g, [left + 3, 10.5, z + 13], [upperRight + 1, 29, z + 5.6], 1.38, copper);
        beam(g, [right - 3, 10.5, z + 13], [upperLeft - 1, 29, z + 5.6], 1.38, copper);
        g.box(x, 8.7, z + 11.1, 55, 2.3, 3.2, warmSteel, 0.43);
        g.box(x, 29.9, z + 3.9, 43, 3.2, 5.5, ochre, 0.4);
        for (const dx of [-21, 21]) lamp(g, x + dx, 534, 7.3);
        for (const dx of [-17, 0, 17]) {
            const on = x + dx;
            g.box(on, 0.15, z + 16, 8, 1.2, 1.65, darkSteel, 0.36);
        }
    }
    for (const y of [178, 277, 424]) line(g, [-131, y], [132, y], 0.62, [64, 55, 43]);
    for (const x of [-126, 126]) {
        line(g, [x, 184], [x, 485], 0.65, [91, 72, 44]);
        hatch(g, x, 249, 19, 12, 0x584e42);
    }
}

/** Project-original scenery, modeled from the campaign's painted arena references. */
export const EARLY_ARENAS: Readonly<Record<string, (g: ArenaGeometry) => void>> = {
    '02': pumpRoom,
    '03': dispatchSubstation,
    '04': feederBridge,
    '05': switchgearYard,
    '06': loadingDock,
    '07': coldStorage,
    '08': sorter,
    '09': hoist,
    '10': freightYard,
};
