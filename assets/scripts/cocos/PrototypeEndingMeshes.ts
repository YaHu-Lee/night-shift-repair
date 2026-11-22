import type { ArenaGeometry } from './PrototypeArenaMeshes';

type Point = [x: number, y: number, z: number];

const dark = 0x192831;
const shadow = 0x263a43;
const blueSteel = 0x49606a;
const limestone = 0x716b60;
const bronze = 0x8f7052;
const amber = 0xe8ad69;
const lamp = 0xffdfa2;

function mixed(a: number, b: number, weight: number): number {
    const channel = (shift: number) => Math.round(((a >> shift) & 255) * (1 - weight) + ((b >> shift) & 255) * weight);
    return channel(16) << 16 | channel(8) << 8 | channel(0);
}

function noise(x: number): number {
    const value = Math.sin(x * 12.9898 + 14.7) * 43758.5453;
    return value - Math.floor(value);
}

function ground(g: ArenaGeometry, west: number, east: number, back: number, front: number, y: number, paint: number): void {
    g.face([[west,y,back], [west,y,front], [east,y,front], [east,y,back]], paint, false);
}

function panes(g: ArenaGeometry, x: number, z: number, bottom: number, w: number, h: number, seed: number): void {
    g.face([[x-w/2,bottom,z], [x+w/2,bottom,z], [x+w/2,bottom+h,z], [x-w/2,bottom+h,z]], dark, false);
    for (const side of [-1, 1]) {
        const px = x + side * w * 0.24;
        const level = noise(seed + side * 0.22);
        const paint = level > 0.25 ? mixed(0x85664e, lamp, level * 0.95) : 0x435965;
        g.face([[px-w*0.19,bottom+h*0.13,z+0.04], [px+w*0.19,bottom+h*0.13,z+0.04],
            [px+w*0.19,bottom+h*0.85,z+0.04], [px-w*0.19,bottom+h*0.85,z+0.04]], paint, false);
    }
}

function house(g: ArenaGeometry, x: number, z: number, h: number, w: number, d: number, base: number, seed: number): void {
    const body = mixed(0x3d525c, limestone, 0.26 + 0.57 * noise(seed));
    const roof = mixed(0x344957, 0x654f44, noise(seed + 1));
    const front = z + d / 2;
    g.box(x, base, z, w, h, d, body, 0.42);
    g.box(x, base + 0.7, front - 0.22, w + 0.3, 0.5, 1.15, shadow);
    g.box(x, base + h - 0.15, z, w + 1.3, 0.65, d + 1.2, roof, 0.24);
    const rise = noise(seed + 2) * 3.9 + 1.4;
    const wb = x - w / 2 - 0.5, eb = x + w / 2 + 0.5;
    const y = base + h + 0.35, zr = front + 0.5, zn = z - d / 2 - 0.5;
    if (seed % 4 !== 0) {
        g.face([[wb,y,zr], [eb,y,zr], [eb,y+rise,z], [wb,y+rise,z]], roof);
        g.face([[wb,y+rise,z], [eb,y+rise,z], [eb,y,zn], [wb,y,zn]], mixed(roof, shadow, 0.4));
        g.face([[eb,y,zn], [eb,y+rise,z], [eb,y,zr]], body);
        g.face([[wb,y,zr], [wb,y+rise,z], [wb,y,zn]], body);
        g.box(x+w*0.3, y+rise*0.42, z-d*0.23, 1.05, rise*0.64+1.7, 1.18, dark);
    } else {
        g.box(x+w*0.13, y, z-1.8, w*0.34, rise*0.62, d*0.48, roof, 0.5);
        g.box(x+w*0.17, y+0.5, z+1.4, w*0.26, 1.1, 0.6, blueSteel);
    }
    const stories = Math.max(1, Math.floor(h/4.6));
    const columns = Math.max(1, Math.floor(w/4.4));
    for (let row = 0; row < stories; row++) {
        const floor = base + 1.35 + row * (h - 1.4) / stories;
        for (let col = 0; col < columns; col++) {
            const px = x + ((col + 0.5)/columns - 0.5) * (w - 1.25);
            panes(g, px, front + 0.015, floor, Math.min(w*0.48, 2.95), 1.95, seed*11 + row*10 + col);
        }
        if (row > 0) g.box(x, floor-0.4, front, w-0.5, 0.26, 0.48, roof);
    }
}

function water(g: ArenaGeometry): void {
    const start = -65;
    for (let row = 0; row < 15; row++) {
        const back = start + row * 11;
        for (let col = 0; col < 25; col++) {
            const west = -175 + col * 14;
            const glow = Math.exp(-(((west - 82) / 51) ** 2)) * Math.max(0.08, 0.48 - row * 0.025);
            const current = Math.sin(col * 0.29 + row * 0.63) * 0.037 + Math.sin(col * 0.63 - row * 0.31) * 0.026;
            const tone = mixed(0x25404b, 0x517478, glow + 0.08 + current + noise(row*81+col*3.2) * 0.028);
            ground(g, west, west+14, back, back+11, 0, tone);
        }
    }
    const sources = [[-148,-30],[-127,-26],[-106,-23],[-90,-19],[-68,-16],[-48,-17],[-24,-14],
        [-3,-13],[24,-17],[52,-18],[77,-13],[90,2],[113,20],[140,30],[155,-17]];
    for (const [index, [x,z]] of sources.entries()) {
        for (let i = 0; i < 27; i++) {
            const phase = i / 27;
            const rz = z + i * 2.4 + noise(index*100+i) * 1.6;
            const drift = (noise(index*71+i*3.1)-0.5)*(2 + phase*9);
            const w = 0.8 + noise(index*49+i*7.6)*(1.4 + 2.4*phase);
            const paint = mixed(0x345561, index % 4 === 1 ? 0xb1cfba : amber, (0.34 + 0.6 * noise(i*99+index)) * (1 - phase * 0.73));
            g.face([[x+drift-w,0.028,rz], [x+drift-w*0.7,0.028,rz+0.52], [x+drift+w,0.028,rz+0.35],
                [x+drift+w*0.8,0.028,rz-0.33]], paint, false);
        }
    }
    for (let i = 0; i < 95; i++) {
        const x = -169 + 338 * noise(i * 7.2);
        const z = -28 + 123 * noise(i * 14.1);
        ground(g, x-1.25, x+1.25+noise(i+0.9)*3.8, z, z+0.34, 0.019, mixed(0x345462, 0x708082, 0.34+noise(i)*0.31));
    }
}

function eveningSky(g: ArenaGeometry): void {
    const horizon = -115;
    for (let row = 0; row < 12; row++) {
        const h = row * 7;
        for (let col = 0; col < 24; col++) {
            const x0 = -175 + col * 350 / 24, x1 = -175 + (col+1) * 350 / 24;
            const sun = Math.exp(-(((x0 - 150) / 69) ** 2 + ((h - 22) / 25) ** 2));
            const dusk = mixed(mixed(0x657987, 0x263745, row / 11), 0xbf8b6b, sun * 0.66);
            g.face([[x0,h,horizon],[x1,h,horizon],[x1,h+7,horizon],[x0,h+7,horizon]], dusk, false);
        }
    }
}

function skyline(g: ArenaGeometry): void {
    const silhouettes = [[-175,24],[-148,31],[-118,37],[-89,36],[-61,41],[-39,38],[-13,30],
        [15,26],[41,19],[67,20],[84,22],[110,16],[136,12],[158,10],[175,14]];
    for (let i = 1; i < silhouettes.length; i++) {
        const [x0,h0] = silhouettes[i-1], [x1,h1] = silhouettes[i];
        const dusk = mixed(0x314856, 0x6d6f75, i * 0.042);
        g.face([[x0,0,-100],[x1,0,-100],[x1,h1,-100],[x0,h0,-100]], dusk, false);
        g.face([[x0,h0,-100],[x1,h1,-100],[x1,h1+7,-107],[x0,h0+9,-109]], mixed(dusk, 0x445b6a, 0.52), false);
    }
    g.box(-65, -1, -59, 220, 6.2, 39, shadow, 2);
    g.box(-77, 4.8, -68, 188, 5.1, 20, 0x45555a, 1.1);
    g.box(116, -1, -48, 118, 5.8, 29, shadow, 1.8);
    g.box(154, -1, -8, 42, 5.5, 50, shadow, 2);
    const hillWest = 9.0, hillEast = 5.45;
    g.face([[-175,hillWest,-95],[-175,hillWest,-64],[175,hillEast,-64],[175,hillEast,-95]], 0x52605f);
    g.face([[-175,-0.2,-64],[175,-0.2,-64],[175,hillEast,-64],[-175,hillWest,-64]], 0x3d535b);
    g.box(113, 0, -27, 122, 2.9, 14, 0x4c5d5f, 0.7);
    for (let i = 0; i < 16; i++) {
        const x = -159 + i * 20.5;
        const z = -81 + noise(i * 2.6) * 9;
        house(g, x, z, 9 + 13*noise(i*3.41), 9 + 7*noise(i*4.15), 9 + 5*noise(i), 8.7 - i*0.21, i+3);
    }
    const skylineRow = [[-158,-51,17,19,14],[-136,-46,20,16,11],[-115,-50,17,20,13],[-92,-43,21,21,13],
        [-68,-43,14,19,15],[-48,-55,20,16,21],[-24,-44,21,26,15],[3,-43,16,16,15],[25,-47,22,22,17],
        [49,-48,14,18,16],[70,-40,11,18,12],[91,-42,16,14,19],[111,-47,15,19,16],[136,-43,13,12,14],[158,-36,10,15,10]];
    for (const [i,[x,z,h,w,d]] of skylineRow.entries()) house(g,x,z,h,w,d,4.55,i+43);
    for (const [x,z,h] of [[-56,-64,37],[22,-66,34],[-47,-62,21]]) {
        g.cylinder(x, 5, z, 1.9, 1.31, h, 0x66564f);
        g.cylinder(x, h+4.4, z, 1.43, 1.41, 1.35, blueSteel);
        g.cylinder(x, h+5.55, z, 1.14, 0.92, 0.6, dark);
    }
    for (const [x,z,h] of [[-101,-88,44],[-42,-89,39],[15,-91,35],[105,-89,28]]) tower(g,x,z,7,h);
}

function tower(g: ArenaGeometry, x: number, z: number, y: number, h: number): void {
    const p = (t: number, sign: number): Point => [x+sign*(5.3-4.2*t),y+h*t,z];
    for (const side of [-1, 1]) {
        g.tube([p(0,side),p(1,side)], 0.36, 0x4c6067, 5);
        for (let i = 0; i < 6; i++) g.tube([p(i/6,side),p((i+1)/6,-side)],0.20,blueSteel,4);
    }
    for (const ratio of [0.68,0.82,0.94]) {
        g.box(x,y+h*ratio,z,13-ratio*4,0.72,0.82,blueSteel);
        for (const side of [-1,1]) g.box(x+side*(6.5-ratio*2),y+h*ratio-1.15,z,0.4,1.7,0.44,dark);
    }
    g.box(x,y+h,z,0.55,2.2,0.54,blueSteel);
    g.box(x,y+h+2.2,z,0.81,0.7,0.81,0xdea183);
}

function quay(g: ArenaGeometry): void {
    const bank = [[-175,-32],[-131,-27],[-91,-23],[-48,-18],[2,-15],[45,-21],[80,-27]].map(([x,z]): Point => [x,3,z]);
    for (let i = 1; i < bank.length; i++) {
        const a = bank[i-1], b = bank[i];
        g.face([[a[0],0.15,a[2]], [b[0],0.15,b[2]], b, a], 0x5c6866);
        g.face([a, b, [b[0],3,b[2]-16], [a[0],3,a[2]-16]], 0x656867);
        const length = Math.hypot(b[0]-a[0],b[2]-a[2]);
        const angle = Math.atan2(b[2]-a[2],b[0]-a[0]);
        g.box((a[0]+b[0])/2,2.8,(a[2]+b[2])/2,length,0.38,0.8,0x86908b,0,angle);
        for (let j = 0; j < 5; j++) {
            const t = (j+0.24)/5;
            const x = a[0]+(b[0]-a[0])*t, z = a[2]+(b[2]-a[2])*t;
            g.box(x,0.18,z,1,2.6,0.68,shadow,0.18);
            if (j % 2 === 0) lantern(g,x,z-0.9,3.1,4.85);
        }
    }
}

function lantern(g: ArenaGeometry, x: number, z: number, y: number, h: number): void {
    g.box(x,y,z,0.59,h,0.58,dark,0.12);
    g.box(x,y+h,z,1.12,1.15,1.12,lamp,0.16);
    g.box(x,y+h+1.03,z,1.47,0.37,1.49,bronze,0.18);
}

function bridge(g: ArenaGeometry): void {
    const yaw = 0.49, cons = Math.cos(yaw), sine = Math.sin(yaw);
    const at = (length: number, y: number, width: number): Point => [40+cons*length-sine*width,y,-34+sine*length+cons*width];
    const length = 144;
    const [cx,,cz] = at(length/2,0,0);
    g.box(cx,7.05,cz,length,2.5,11.7,0x7e7b70,0.65,yaw);
    for (const side of [-1,1]) {
        const [x,,z] = at(length/2,0,side*5.36);
        g.box(x,9.4,z,length,1.1,0.75,0x7d827a,0.20,yaw);
    }
    for (const t of [0,36,72,108,144]) {
        const [x,,z] = at(t,0,0);
        g.box(x,-0.18,z,3.8,7.75,11.35,limestone,0.7,yaw);
        g.box(x,-0.18,z,5.2,0.8,12.1,shadow,0.6,yaw);
        if (t !== 0 && t !== length) {
            for (const side of [-1,1]) {
                const [px,,pz] = at(t,0,side*4.75);
                lantern(g,px,pz,9.6,3.8);
            }
        }
    }
    for (let segment = 0; segment < 4; segment++) {
        for (const side of [-1,1]) {
            const width = side * 4.95;
            const arch: Point[] = [];
            for (let i=0; i<=12; i++) arch.push(at(segment*36+i*3,1.15+5.5*Math.sin(i*Math.PI/12),width));
            g.tube(arch,0.85,0x8b8370,5);
            for (let i=1; i<12; i++) {
                const [x,y,z] = arch[i];
                g.box(x,y,z,2.65,7.31-y,0.54,0x76756d,0,yaw);
            }
        }
    }
}

function workshop(g: ArenaGeometry): void {
    g.box(-141,-0.8,55,68,3.2,28,shadow,0.85);
    g.box(154,-0.8,59,39,3.2,41,shadow,0.85);
    g.box(-164,1.4,44,4.4,37,4.6,0x4a4842,0.55);
    g.box(-153,1.4,55,5.4,32,4.4,0x5d5345,0.62);
    g.box(-160,33,52,27,4.5,4.1,0x635440,0.54);
    g.box(155,1.5,57,4.4,32,5.0,0x4a4842,0.49);
    g.box(157,30.8,53,32,3.65,4.6,0x665642,0.76);
    g.tube([[-170,26,50],[-154,33,55],[-139,36,48]],0.75,bronze,6);
    g.tube([[167,28,52],[154,34,53],[145,34,49]],0.61,shadow,6);
    const shadeX = -125, shadeZ = 48;
    g.tube([[shadeX,48,shadeZ],[shadeX,31,shadeZ]],0.55,dark,5);
    g.cylinder(shadeX,29.5,shadeZ,2.2,2.2,0.53,lamp);
    g.cylinder(shadeX,29.88,shadeZ,3.3,1.3,1.6,bronze);
    g.box(-153,2.2,50,19,6.4,9.7,0x5d503e,0.65);
    g.box(-152,8.35,50,20,0.85,10.35,0x897055,0.48);
    g.box(-149,9.2,50,5.6,2.4,4.4,blueSteel,0.64);
    g.cylinder(-147,11.06,50,2.15,1.82,1.8,0x6d7c78);
    g.box(-155,9.15,47,2.3,0.55,1.2,bronze,0.12);
    g.box(161,2.15,52,8.5,5.6,6.5,0x6a5945,0.4);
    g.box(147,2.15,59,6.6,5.15,7.3,0x615446,0.52);
    g.tube([[151,36,51],[151,22,51],[152,18.9,52],[154,18.9,52],[155,20.6,52]],0.57,0x7a6d59,5);
    for (const [x1,x2,z] of [[-151,-82,49],[82,156,54]]) {
        for (const y of [3.5,7.7]) g.tube([[x1,y,z],[x2,y,z]],0.46,blueSteel,5);
        for (let x=x1; x<x2; x+=13) g.box(x,1.2,z,0.6,7.2,0.7,0x544d44,0.13);
    }
}

/** The restored river district as seen from the night-shift workshop. */
export function buildRestoredCity(g: ArenaGeometry): void {
    eveningSky(g);
    water(g);
    skyline(g);
    quay(g);
    bridge(g);
    workshop(g);
}
