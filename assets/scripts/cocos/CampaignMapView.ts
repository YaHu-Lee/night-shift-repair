import { Color, Graphics } from 'cc';

type Point = readonly [x: number, y: number];
type Span = readonly [lower: number, upper: number];

// Art anchors use the 360 × 1040 map's top-left coordinate system.
const BRIDGE_LAMPS: readonly Point[] = [[93, 671], [156, 636], [248, 616]];
const RESIDENT_WINDOWS: readonly Point[] = [[101, 73], [125, 73], [288, 92], [297, 91], [315, 91], [324, 91],
    [256, 133], [277, 133], [291, 133]];
const FREIGHT_ROADS: readonly (readonly Point[])[] = [
    [[255, 910], [305, 884], [329, 835], [342, 798], [330, 755], [305, 719], [294, 705]],
    [[294, 705], [267, 707], [200, 707], [127, 699], [68, 674], [36, 644], [28, 623], [57, 601],
        [114, 589], [168, 568], [228, 550], [276, 553], [310, 567], [337, 562], [323, 535]],
    [[323, 535], [317, 513], [284, 503], [246, 507], [211, 522], [160, 527], [103, 524], [77, 507],
        [57, 480], [83, 464], [111, 437], [116, 418], [132, 393], [169, 387], [199, 378], [242, 378], [280, 381]],
    [[280, 381], [307, 353], [323, 326], [312, 304], [272, 286], [248, 271], [217, 264], [167, 246],
        [129, 227], [126, 215], [143, 201], [174, 196]],
    [[174, 196], [200, 194], [232, 194], [271, 184], [297, 161]],
];
const FREIGHT_TRIPS = FREIGHT_ROADS.map(road => {
    const segments = road.slice(1).map(([x, y], index) => Math.hypot(x - road[index][0], y - road[index][1]));
    return { road, segments, length: segments.reduce((total, segment) => total + segment, 0) };
});
const HOSPITAL_LIGHT: Point = [310, 143];
const BROADCAST_TOWER: Point = [236, 73];
const EMERGENCY_LIGHTS: readonly Point[] = [[115, 243], [253, 241], [116, 292], [253, 295]];
const DISTRICT_WINDOWS: readonly Point[] = [[30, 82], [48, 88], [69, 99], [102, 82], [121, 57], [129, 131],
    [184, 133], [244, 134], [145, 482], [219, 485], [250, 480], [86, 884], [298, 843]];

const DARK_WINDOW = new Color(10, 23, 31, 176);
const LAMP_HALO = new Color(255, 187, 105, 90);
const LAMP_CORE = new Color(255, 232, 169);
const CAUTION_GLOW = new Color(233, 78, 47, 114);
const CAUTION_CORE = new Color(255, 142, 103);
const RADIO = new Color(124, 223, 225);
const RESTORED_LINE = new Color(114, 224, 185);
const RESTORED_GLOW = new Color(107, 218, 177, 74);
const DARK_LINE = new Color(12, 19, 27, 191);
const FREIGHT_BODY = new Color(58, 82, 80);
const FREIGHT_CELL = new Color(247, 200, 112);
const FREIGHT_CAB = new Color(220, 233, 208);

function inView(y: number, [lower, upper]: Span, margin = 0): boolean {
    return y >= lower + margin && y <= upper - margin;
}

function oval(g: Graphics, color: Color, x: number, y: number, width: number, height: number): void {
    g.fillColor = color;
    g.ellipse(x, y, width, height);
    g.fill();
}

function drawLamps(g: Graphics, points: readonly Point[], origin: number, span: Span, lit: boolean, emergency = false): void {
    for (const [x, groundY] of points) {
        const y = origin - groundY;
        if (!inView(y, span, 6)) continue;
        if (!lit) {
            oval(g, DARK_WINDOW, x, y, 4.6, 3.6);
            continue;
        }
        oval(g, emergency ? CAUTION_GLOW : LAMP_HALO, x, y, 7, 5);
        oval(g, emergency ? CAUTION_CORE : LAMP_CORE, x, y, 2.7, 1.8);
    }
}

function drawFreight(g: Graphics, { road, segments, length }: typeof FREIGHT_TRIPS[number], elapsed: number,
    origin: number, span: Span): void {
    let distance = Math.min(length, elapsed * (120 + length * 0.12));
    let segment = 0;
    while (segment < segments.length - 1 && distance > segments[segment]) {
        distance -= segments[segment];
        segment++;
    }
    const t = distance / segments[segment];
    const [x0, y0] = road[segment];
    const [x1, y1] = road[segment + 1];
    const x = x0 + (x1 - x0) * t;
    const y = origin - (y0 + (y1 - y0) * t);
    if (!inView(y, span, 13)) return;
    const dx = (x1 - x0) / segments[segment];
    const dy = (y0 - y1) / segments[segment];
    const body = (color: Color, back: number, front: number, side: number) => {
        g.fillColor = color;
        g.moveTo(x + dx * back - dy * side, y + dy * back + dx * side);
        g.lineTo(x + dx * front - dy * side, y + dy * front + dx * side);
        g.lineTo(x + dx * front + dy * side, y + dy * front - dx * side);
        g.lineTo(x + dx * back + dy * side, y + dy * back - dx * side);
        g.close();
        g.fill();
    };
    oval(g, DARK_LINE, x, y - 3, 11, 6);
    body(DARK_LINE, -11, 11, 5);
    body(FREIGHT_BODY, -10, 10, 4);
    body(FREIGHT_CELL, -8, 2, 2.7);
    body(FREIGHT_CAB, 4, 8, 2.7);
    oval(g, LAMP_HALO, x + dx * 11, y + dy * 11, 5, 3);
}

function drawBroadcast(g: Graphics, origin: number, span: Span, elapsed: number): void {
    const [x, anchorY] = BROADCAST_TOWER;
    const y = origin - anchorY;
    for (let i = 0; i < 3; i++) {
        const phase = (elapsed * 0.42 + i / 3) % 1;
        const ry = 5 + phase * 17;
        if (!inView(y, span, ry)) continue;
        g.strokeColor = new Color(RADIO.r, RADIO.g, RADIO.b, Math.round(160 * (1 - phase)));
        g.lineWidth = 1.6;
        g.ellipse(x, y, 15 + phase * 55, ry);
        g.stroke();
    }
}

export function drawDistrictProgress(g: Graphics, chapter: string, cleared: number, origin: number,
    span: Span, elapsed: number, freightElapsed: number, upperReady: boolean): void {
    switch (chapter) {
        case '01':
            drawLamps(g, BRIDGE_LAMPS, origin, span, cleared >= 1);
            if (upperReady) drawLamps(g, RESIDENT_WINDOWS, origin, span, cleared === 5);
            break;
        case '02':
            if (cleared) drawFreight(g, FREIGHT_TRIPS[cleared - 1], freightElapsed, origin, span);
            drawLamps(g, [HOSPITAL_LIGHT], origin, span, cleared === 5);
            break;
        case '03':
            if (cleared === 5) drawBroadcast(g, origin, span, elapsed);
            break;
        case '04':
            drawLamps(g, EMERGENCY_LIGHTS, origin, span, cleared < 5, true);
            drawLamps(g, DISTRICT_WINDOWS, origin, span, cleared === 5);
            break;
    }
}

export function drawRestoredLeg(g: Graphics, start: Point, end: Point, span: Span, signal: boolean): void {
    const [x0, y0] = start;
    const [x1, y1] = end;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const size = Math.hypot(dx, dy);
    if (size === 0) return;
    const steps = Math.max(1, Math.ceil(size / 6));
    const points = Array.from({ length: steps + 1 }, (_, i) => {
        const t = i / steps;
        const ripple = signal ? 5 * Math.sin(Math.PI * 2 * Math.round(size / 25) * t) : 0;
        return [x0 + dx * t - dy / size * ripple, y0 + dy * t + dx / size * ripple];
    });
    const stroke = (color: Color, width: number) => {
        g.strokeColor = color;
        g.lineWidth = width;
        let drawing = false;
        for (const [x, y] of points) {
            if (!inView(y, span, 4)) drawing = false;
            else if (drawing) g.lineTo(x, y);
            else {
                g.moveTo(x, y);
                drawing = true;
            }
        }
        g.stroke();
    };
    stroke(signal ? DARK_LINE : RESTORED_GLOW, signal ? 4 : 7);
    stroke(signal ? RADIO : RESTORED_LINE, 2);
}
