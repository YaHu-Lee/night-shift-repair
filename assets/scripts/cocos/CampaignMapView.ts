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
const DARK_LINE = new Color(12, 19, 27, 191);
const FREIGHT_BODY = new Color(58, 82, 80);
const FREIGHT_CELL = new Color(247, 200, 112);
const FREIGHT_CAB = new Color(220, 233, 208);
const FEED_SHADOW = new Color(11, 16, 19, 220);
const FEED_STEEL = new Color(92, 100, 92);
const FEED_DARK = new Color(36, 44, 43);
const FEED_AMBER = new Color(244, 198, 107);
const FEED_GREEN = new Color(130, 194, 165);
const FEED_PAPER = new Color(234, 227, 207);
const FEED_DIM = new Color(177, 182, 170);

export type RouteStationState = 'locked' | 'current' | 'cleared';
export const ROUTE_STATION_EXTENT = 29;

/** Cable sections share their endpoints with the terminals on the chapter artwork. */
export function drawRouteCable(g: Graphics, points: readonly Point[], span: Span,
    states: readonly RouteStationState[]): void {
    const [lower, upper] = span;
    const segments = points.slice(1).flatMap((end, index) => {
        const [x, y] = points[index];
        const dx = end[0] - x;
        const dy = end[1] - y;
        if (!dy && !inView(y, span)) return [];
        const a = dy ? (lower - y) / dy : 0;
        const b = dy ? (upper - y) / dy : 1;
        const from = Math.max(0, Math.min(a, b));
        const to = Math.min(1, Math.max(a, b));
        if (from >= to) return [];
        return [{ startX: x + dx * from, startY: y + dy * from,
            endX: x + dx * to, endY: y + dy * to, state: states[index] }];
    });
    const line = (color: Color, width: number, predicate: (state: RouteStationState) => boolean): void => {
        g.strokeColor = color;
        g.lineWidth = width;
        let hasPath = false;
        for (const segment of segments) {
            if (!predicate(segment.state)) continue;
            g.moveTo(segment.startX, segment.startY);
            g.lineTo(segment.endX, segment.endY);
            hasPath = true;
        }
        if (hasPath) g.stroke();
    };
    const cap = g.lineCap;
    g.lineCap = Graphics.LineCap.ROUND;
    line(FEED_SHADOW, 11, () => true);
    line(FEED_STEEL, 6, () => true);
    line(FEED_DARK, 3, state => state === 'locked');
    line(FEED_GREEN, 3, state => state === 'cleared');
    line(FEED_AMBER, 3, state => state === 'current');
    g.lineCap = cap;
}

export function drawRouteTerminal(g: Graphics, x: number, y: number, tagX: number,
    state: RouteStationState, held: boolean): void {
    const active = state === 'current';
    const cleared = state === 'cleared';
    const pinY = y - (held ? 2 : 0);
    const lip = active ? FEED_AMBER : cleared ? FEED_GREEN : FEED_STEEL;
    g.strokeColor = FEED_SHADOW;
    g.lineWidth = 5;
    g.moveTo(x, y);
    g.lineTo(tagX, y);
    g.stroke();

    // The text is printed on the station's inspection plate next to the terminal.
    const left = tagX - 69;
    const right = tagX + 69;
    g.fillColor = new Color(15, 24, 25, 248);
    g.moveTo(left + 5, y + 22);
    g.lineTo(right, y + 22);
    g.lineTo(right, y - 17);
    g.lineTo(right - 5, y - 22);
    g.lineTo(left, y - 22);
    g.lineTo(left, y + 17);
    g.close();
    g.fill();
    g.strokeColor = lip;
    g.lineWidth = active ? 2 : 1;
    g.moveTo(left + 7, y + 21);
    g.lineTo(right - 3, y + 21);
    g.stroke();

    const casing = (radius: number, offset: number, color: Color): void => {
        const cy = pinY + offset;
        g.fillColor = color;
        g.moveTo(x - radius * 0.65, cy + radius * 0.83);
        g.lineTo(x + radius * 0.65, cy + radius * 0.83);
        g.lineTo(x + radius, cy);
        g.lineTo(x + radius * 0.65, cy - radius * 0.83);
        g.lineTo(x - radius * 0.65, cy - radius * 0.83);
        g.lineTo(x - radius, cy);
        g.close();
        g.fill();
    };
    casing(26, -4, FEED_SHADOW);
    casing(25, 0, lip);
    casing(20, 0, active && !held ? new Color(210, 153, 66) : FEED_DARK);
    g.lineWidth = 2.5;
    g.strokeColor = cleared ? FEED_PAPER : active ? FEED_DARK : FEED_DIM;
    if (active) {
        g.fillColor = held ? FEED_AMBER : FEED_DARK;
        g.moveTo(x + 3, pinY + 13);
        g.lineTo(x - 9, pinY + 1);
        g.lineTo(x - 2, pinY + 1);
        g.lineTo(x - 4, pinY - 12);
        g.lineTo(x + 9, pinY + 3);
        g.lineTo(x + 2, pinY + 3);
        g.close();
        g.fill();
    } else if (cleared) {
        g.moveTo(x - 8, pinY);
        g.lineTo(x - 2, pinY - 6);
        g.lineTo(x + 9, pinY + 7);
        g.stroke();
    } else {
        g.roundRect(x - 5, pinY + 1, 10, 10, 4);
        g.stroke();
        g.fillColor = FEED_DIM;
        g.roundRect(x - 8, pinY - 8, 16, 12, 2);
        g.fill();
    }
}

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
