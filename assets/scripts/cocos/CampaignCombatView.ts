import { Color, Graphics } from 'cc';
import type { ChapterHazard, MissionPoint, MissionView, Position, TerrainRect } from '../m1/Encounter';
import type { Battle } from '../m1/Battle';
import { START } from '../m1/content';

const GOLD = new Color(252, 201, 108);
const SEA = new Color(111, 230, 192);
const RED = new Color(247, 111, 100);
const STONE = new Color(50, 71, 78);
const INK = new Color(16, 32, 37);
const DIM = new Color(107, 145, 154);
const JAMMED = new Color(191, 146, 243);
const OFFLINE_GAUGE = new Color(26, 36, 38, 245);
const GAUGE_RIM = new Color(112, 105, 86, 233);
const FEED_FRAME = new Color(20, 38, 40, 227);
const FEED_GLOW = new Color(97, 223, 173, 92);
const SIGN_GLYPH = new Color(214, 226, 220);
const CONVEYOR_TREAD = new Color(24, 36, 39, 229);
const CONVEYOR_SLATS = new Color(95, 117, 119, 142);
const CONVEYOR_TRACK = new Color(110, 130, 126);
const CONVEYOR_ARROW = new Color(195, 213, 206);
const LIFT_GRATING = new Color(56, 73, 77);
const LIFT_RAIL = new Color(127, 146, 141);
const LIFT_BOLT = new Color(229, 176, 101);
type Escort = NonNullable<MissionView['escort']>;
type TerminalMark = 'medical' | 'broadcast' | 'dots' | 'stripes';

export function drawCampaignEncounter(g: Graphics, battle: Readonly<Battle>, stageId: string, modelProps = false): void {
    const { terrainRects: terrain, mission, chapterBoss: boss, tick, enemies, searchlight } = battle;
    if (boss?.kind === 'core' && boss.hp <= 0) drawDistrictFeeds(g, mission?.points ?? []);
    if (searchlight) {
        g.fillColor = new Color(255, 215, 149, 38);
        wedge(g, searchlight.x, searchlight.y, searchlight.reach, searchlight.angle - searchlight.width / 2, searchlight.width);
        g.fill();
    }
    if (mission?.scan) drawMissionScan(g, mission.scan);
    for (const rect of terrain) {
        const { left, right, bottom, top, state, kind } = rect;
        if (kind === 'belt') {
            if (!modelProps) drawConveyor(g, rect, tick);
            continue;
        }
        if (state === 'open') continue;
        if (modelProps && state === 'closed') continue;
        g.fillColor = kind === 'wall' ? STONE : state === 'closed' ? new Color(63, 53, 48, 236) : new Color(61, 74, 77, 153);
        g.rect(left, bottom, right - left, top - bottom); g.fill();
        g.strokeColor = state === 'warning' ? GOLD : DIM; g.lineWidth = 2;
        if (kind === 'gate' && state === 'warning') {
            drawClosingGate(g, rect);
        } else {
            g.rect(left + 1, bottom + 1, right - left - 2, top - bottom - 2); g.stroke();
        }
        if (kind === 'gate' && state === 'closed') {
            g.strokeColor = new Color(183, 187, 174, 224); g.lineWidth = 2;
            for (let x = left + 6; x + 7 <= right - 4; x += 11) {
                g.moveTo(x, bottom + 2); g.lineTo(x + 7, top - 2);
            }
            g.stroke();
        }
    }
    const practice = battle.practiceWarning;
    const hazard = boss?.hazard ?? practice;
    if (hazard) {
        drawBossHazard(g, hazard);
        if (hazard.shape === 'rect' && (boss?.kind === 'gatekeeper' || practice)) drawGatekeeperRail(g, hazard);
    }
    drawEnemyTelegraphs(g, enemies, mission, tick);
    if (mission?.thermal) drawThermalSignals(g, mission.thermal, mission.points, tick);
    const escort = mission?.escort;
    if (escort) {
        if (mission?.lift) drawLift(g, escort, mission.lift, battle.player, modelProps);
        else drawBatteryCar(g, escort, modelProps);
    }
    const terminals = boss?.terminals ?? (boss?.kind === 'core' && boss.hp > 0 ? [] : mission?.points);
    for (const point of terminals ?? []) {
        const color = point.state === 'complete' ? SEA : point.state === 'active' ? GOLD : DIM;
        station(g, point.x, point.y, point.radius, point.progress, color);
        const west = point.x < START.x;
        const mark = stageId === '05' ? west ? 'dots' : 'stripes'
            : stageId === '19' && battle.spec.directive?.type === 'handoff' ? west ? 'medical' : 'broadcast' : undefined;
        drawTerminal(g, modelProps ? { ...point, x: point.x + 12, y: point.y - 9 } : point, color, mark);
    }
    if (boss?.station && !boss.terminals) {
        const point = boss.station;
        station(g, point.x, point.y, point.radius, point.progress, SEA);
        const x = point.x + (modelProps ? 12 : 0), y = point.y - (modelProps ? 9 : 0);
        g.fillColor = INK;
        g.moveTo(x, y + 10); g.lineTo(x + 10, y); g.lineTo(x, y - 10); g.lineTo(x - 10, y); g.close(); g.fill();
        g.strokeColor = SEA; g.lineWidth = 1.8;
        g.moveTo(x, y + 6); g.lineTo(x + 6, y); g.lineTo(x, y - 6); g.lineTo(x - 6, y); g.close(); g.stroke();
        if (boss.kind === 'gatekeeper') drawTerminalMark(g, x, y, x < START.x ? 'dots' : 'stripes');
    }
}

export function drawModeledTerrainSignals(g: Graphics, battle: Readonly<Battle>): void {
    for (const rect of battle.terrainRects) {
        if (rect.kind === 'belt') drawConveyor(g, rect, battle.tick, true);
    }
    if (battle.spec.directive?.variant !== 'lift') return;
    const mission = battle.mission;
    if (!mission?.escort || !mission.lift?.bridge) return;
    const span = liftBridgeSpan(mission.escort, mission.lift.bridge);
    if (!span) return;
    const { at, start, end, width } = span;
    g.strokeColor = LIFT_BOLT; g.lineWidth = 1.5;
    for (const edge of [start, end]) {
        for (const side of [-1, 1]) {
            g.moveTo(...at(edge, width * side)); g.lineTo(...at(edge, (width - 3) * side));
        }
    }
    g.stroke();
}

function drawBatteryCar(g: Graphics, escort: Escort, model: boolean): void {
    g.strokeColor = DIM; g.lineWidth = 2;
    for (let i = 0; i < escort.route.length; i++) {
        const point = escort.route[i];
        if (i === 0) g.moveTo(point.x, point.y);
        else g.lineTo(point.x, point.y);
    }
    g.stroke();
    station(g, escort.x, escort.y, escort.radius, escort.hp / escort.maxHp, SEA);
    if (model) return;
    g.fillColor = INK;
    g.roundRect(escort.x - 17, escort.y - 10, 34, 20, 4); g.fill();
    g.fillColor = GOLD;
    g.roundRect(escort.x - 12, escort.y - 6, 24, 12, 2); g.fill();
    g.fillColor = INK;
    g.rect(escort.x - 1, escort.y - 4, 2, 8); g.rect(escort.x - 4, escort.y - 1, 8, 2); g.fill();
}

function drawLift(g: Graphics, escort: Escort, lift: NonNullable<MissionView['lift']>, player: Readonly<Position>, model: boolean): void {
    const { x, y } = escort;
    const docked = lift.bridge !== undefined;
    const boarded = Math.hypot(player.x - x, player.y - y) <= escort.radius;
    const top = lift.floor === lift.floors;
    const boarding = top || (!docked && boarded) ? SEA : docked ? DIM : GOLD;
    for (let i = 1; i < escort.route.length; i++) {
        const from = escort.route[i - 1];
        const to = escort.route[i];
        const dx = to.x - from.x, dy = to.y - from.y;
        const length = Math.hypot(dx, dy);
        if (length === 0) continue;
        g.strokeColor = LIFT_RAIL; g.lineWidth = 1.8;
        for (const side of [-6, 6]) {
            const sx = dy / length * side, sy = -dx / length * side;
            g.moveTo(from.x + sx, from.y + sy); g.lineTo(to.x + sx, to.y + sy);
        }
        g.stroke();
        g.fillColor = i < lift.floor ? SEA : INK;
        g.rect(to.x - 4, to.y - 2, 8, 4); g.fill();
    }
    if (lift.bridge && !model) drawLiftBridge(g, escort, lift.bridge);
    station(g, x, y, escort.radius, escort.hp / escort.maxHp, boarding);
    if (!model) {
        g.fillColor = INK;
        g.roundRect(x - 25, y - 18, 50, 34, 3); g.fill();
        g.fillColor = LIFT_GRATING;
        g.roundRect(x - 22, y - 13, 44, 26, 2); g.fill();
        g.strokeColor = LIFT_RAIL; g.lineWidth = 1;
        for (let offset = -18; offset <= 18; offset += 6) {
            g.moveTo(x + offset, y - 11); g.lineTo(x + offset, y + 11);
        }
        g.moveTo(x - 21, y); g.lineTo(x + 21, y);
        g.stroke();
        g.fillColor = LIFT_BOLT;
        g.rect(x - 23, y - 11, 4, 23); g.rect(x + 19, y - 11, 4, 23); g.fill();
    }
    for (let step = 0; step < lift.floors; step++) {
        g.fillColor = step < lift.floor ? boarding : LIFT_GRATING;
        g.rect(x + (step - (lift.floors - 1) / 2) * 6 - 2, y - 17, 4, 3); g.fill();
    }
}

export function liftBridgeSpan(from: Readonly<Position>, to: Readonly<Position>) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const span = Math.hypot(dx, dy);
    if (span <= 22) return undefined;
    const ux = dx / span, uy = dy / span;
    const at = (along: number, side: number) => [from.x + ux * along - uy * side, from.y + uy * along + ux * side] as const;
    return { at, dx, dy, span, start: 17, end: span - 5, width: 9 };
}

function drawLiftBridge(g: Graphics, from: Readonly<Position>, to: Readonly<Position>): void {
    const bridge = liftBridgeSpan(from, to);
    if (!bridge) return;
    const { at, start, end, width } = bridge;
    g.fillColor = INK;
    g.moveTo(...at(start, -width)); g.lineTo(...at(end, -width));
    g.lineTo(...at(end, width)); g.lineTo(...at(start, width)); g.close(); g.fill();
    g.strokeColor = LIFT_RAIL; g.lineWidth = 1.4;
    for (let tread = start + 3; tread < end; tread += 6) {
        g.moveTo(...at(tread, -width + 2)); g.lineTo(...at(tread, width - 2));
    }
    g.stroke();
    g.strokeColor = LIFT_BOLT; g.lineWidth = 2;
    for (const side of [-width, width]) {
        g.moveTo(...at(start, side)); g.lineTo(...at(end, side));
    }
    g.stroke();
}

function drawConveyor(g: Graphics, rect: TerrainRect, tick: number, model = false): void {
    const { left, right, bottom, top, direction = 1, travel = 0 } = rect;
    const warning = rect.state === 'warning' && tick % 10 < 5;
    const cy = (top + bottom) / 2;
    const firstTread = (spacing: number) => left + 8 + ((travel % spacing) + spacing) % spacing;
    if (!model) {
        g.fillColor = CONVEYOR_TREAD;
        g.roundRect(left, bottom, right - left, top - bottom, 3); g.fill();
        g.strokeColor = CONVEYOR_SLATS; g.lineWidth = 1.5;
        for (let x = firstTread(12); x < right - 7; x += 12) {
            g.moveTo(x, bottom + 5); g.lineTo(x, top - 5);
        }
        g.stroke();
    }
    if (!model || warning) {
        g.strokeColor = warning ? GOLD : CONVEYOR_TRACK; g.lineWidth = 2;
        g.roundRect(left + 1, bottom + 1, right - left - 2, top - bottom - 2, 2); g.stroke();
    }
    g.strokeColor = warning ? GOLD : CONVEYOR_ARROW; g.lineWidth = 2.2;
    for (let x = firstTread(27); x < right - 7; x += 27) {
        g.moveTo(x - 5 * direction, cy - 5); g.lineTo(x + 4 * direction, cy);
        g.lineTo(x - 5 * direction, cy + 5);
    }
    g.stroke();
}

function drawDistrictFeeds(g: Graphics, terminals: readonly MissionPoint[]): void {
    // Match the gauge glass and bay lamps painted into stage-20.jpg.
    for (const x of [122.5, 139, 157.5]) {
        g.fillColor = OFFLINE_GAUGE;
        g.circle(x, 507, 5.5); g.fill();
        g.strokeColor = GAUGE_RIM; g.lineWidth = 1;
        g.circle(x, 507, 4.4); g.stroke();
    }
    for (const point of terminals) {
        const bayX = point.x < START.x ? 73 : 285;
        const powered = point.state === 'complete';
        const run = (color: Color, width: number) => {
            g.strokeColor = color; g.lineWidth = width;
            g.moveTo(point.x, point.y + point.radius);
            g.lineTo(point.x, 444); g.lineTo(bayX, 459); g.lineTo(bayX, 485);
            g.stroke();
        };
        run(FEED_FRAME, 4);
        g.fillColor = OFFLINE_GAUGE;
        g.roundRect(bayX - 5, 486, 10, 5, 1.5); g.fill();
        if (powered) {
            run(FEED_GLOW, 7);
            run(SEA, 1.7);
            g.fillColor = FEED_GLOW;
            g.ellipse(bayX, 489, 10, 7); g.fill();
            g.fillColor = SEA;
            g.roundRect(bayX - 3, 487, 6, 3.5, 1); g.fill();
        }
    }
}

function drawThermalSignals(g: Graphics, { previous, next, radius }: NonNullable<MissionView['thermal']>,
    points: readonly MissionPoint[], tick: number): void {
    g.strokeColor = new Color(163, 230, 246, 208);
    g.lineWidth = 2;
    if (previous) {
        for (let i = 0; i < 16; i++) {
            const from = i * Math.PI / 8, to = from + Math.PI / 17;
            g.moveTo(previous.x + Math.cos(from) * (radius - 5), previous.y + Math.sin(from) * (radius - 5));
            g.lineTo(previous.x + Math.cos(to) * (radius - 5), previous.y + Math.sin(to) * (radius - 5));
        }
        g.stroke();
    }
    const active = points.find(point => point.state === 'active');
    if (!next || !active) return;
    const dx = next.x - active.x, dy = next.y - active.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const ux = dx / length, uy = dy / length;
    for (let i = radius + 8 + tick % 24 * 0.33; i < length - radius + 6; i += 23) {
        const x = active.x + ux * i, y = active.y + uy * i;
        g.moveTo(x - ux * 6 - uy * 4, y - uy * 6 + ux * 4);
        g.lineTo(x, y);
        g.lineTo(x - ux * 6 + uy * 4, y - uy * 6 - ux * 4);
    }
    g.stroke();
}

function drawBossHazard(g: Graphics, hazard: ChapterHazard): void {
    const hot = hazard.state === 'active';
    g.fillColor = hot ? new Color(247, 79, 59, 115) : new Color(255, 181, 61, 55);
    g.strokeColor = hot ? RED : GOLD; g.lineWidth = 2.5;
    switch (hazard.shape) {
        case 'rect':
            g.rect(hazard.left, hazard.bottom, hazard.right - hazard.left, hazard.top - hazard.bottom);
            g.fill();
            g.rect(hazard.left, hazard.bottom, hazard.right - hazard.left, hazard.top - hazard.bottom);
            g.stroke();
            break;
        case 'sector':
            wedge(g, hazard.x, hazard.y, hazard.radius, hazard.from, hazard.sweep); g.fill();
            wedge(g, hazard.x, hazard.y, hazard.radius, hazard.from, hazard.sweep); g.stroke();
            break;
        case 'tether': {
            // This area is a cuttable cable. A transparent round band matches the model's segment distance.
            if (hot) {
                const cap = g.lineCap;
                g.lineCap = Graphics.LineCap.ROUND;
                g.strokeColor = new Color(251, 216, 148, 98); g.lineWidth = 2 * hazard.width;
                g.moveTo(hazard.x, hazard.y); g.lineTo(hazard.end.x, hazard.end.y); g.stroke();
                g.lineCap = cap;
            }
            g.strokeColor = GOLD; g.lineWidth = hot ? 3.5 : 2.5;
            g.moveTo(hazard.x, hazard.y); g.lineTo(hazard.end.x, hazard.end.y); g.stroke();
            break;
        }
    }
}

function drawGatekeeperRail(g: Graphics, hazard: Extract<ChapterHazard, { shape: 'rect' }>): void {
    const west = hazard.right < START.x;
    const edge = west ? hazard.right : hazard.left;
    const safe = west ? 1 : -1;
    const { bottom, top } = hazard;
    g.strokeColor = INK; g.lineWidth = 6;
    g.moveTo(edge, bottom + 4); g.lineTo(edge, top - 4); g.stroke();
    g.strokeColor = hazard.state === 'warning' ? GOLD : RED; g.lineWidth = 3;
    if (hazard.state === 'active') {
        g.moveTo(edge, bottom + 4); g.lineTo(edge, top - 4); g.stroke();
        return;
    }
    for (let y = bottom + 7; y + 12 <= top - 7; y += 21) {
        g.moveTo(edge, y); g.lineTo(edge, y + 12);
    }
    for (let y = bottom + 87; y <= top - 64; y += 92) {
        g.moveTo(edge + safe * 4, y - 5); g.lineTo(edge + safe * 11, y); g.lineTo(edge + safe * 4, y + 5);
    }
    g.stroke();
}

function drawClosingGate(g: Graphics, rect: TerrainRect): void {
    const { left, right, bottom, top } = rect;
    const middle = (top + bottom) / 2;
    // An interrupted outline indicates a passable lane approaching closure.
    for (let x = left + 2; x < right - 2; x += 12) {
        const end = Math.min(x + 7, right - 2);
        g.moveTo(x, bottom + 1); g.lineTo(end, bottom + 1);
        g.moveTo(x, top - 1); g.lineTo(end, top - 1);
    }
    g.stroke();
    for (let x = left + 14; x < right - 10; x += 26) {
        g.moveTo(x - 3, middle + 2); g.lineTo(x, middle - 1); g.lineTo(x + 3, middle + 2);
    }
    g.stroke();
}

function drawTerminalMark(g: Graphics, x: number, y: number, mark: TerminalMark): void {
    g.strokeColor = SIGN_GLYPH; g.lineWidth = 1.8;
    switch (mark) {
        case 'medical':
            g.moveTo(x - 4.5, y); g.lineTo(x + 4.5, y);
            g.moveTo(x, y - 4.5); g.lineTo(x, y + 4.5);
            break;
        case 'broadcast':
            g.moveTo(x - 3, y - 4.5); g.lineTo(x + 3, y - 4.5);
            g.moveTo(x, y - 4.5); g.lineTo(x, y + 1);
            g.moveTo(x - 4, y - 0.5); g.lineTo(x - 5, y + 2); g.lineTo(x - 4, y + 4.5);
            g.moveTo(x + 4, y - 0.5); g.lineTo(x + 5, y + 2); g.lineTo(x + 4, y + 4.5);
            break;
        case 'dots':
            g.fillColor = SIGN_GLYPH;
            g.circle(x, y + 2.5, 1.25); g.circle(x - 2.7, y - 1.8, 1.25); g.circle(x + 2.7, y - 1.8, 1.25);
            g.fill();
            return;
        case 'stripes':
            for (const slide of [-3, 0, 3]) {
                g.moveTo(x + slide - 1.4, y - 2.5); g.lineTo(x + slide + 1.4, y + 2.5);
            }
            break;
    }
    g.stroke();
}

function drawTerminal(g: Graphics, point: MissionPoint, color: Color, mark?: TerminalMark): void {
    const { state } = point;
    let { x, y } = point;
    g.fillColor = INK;
    g.roundRect(x - 8, y - 8, 16, 16, 3); g.fill();
    if (mark) {
        drawTerminalMark(g, x, y, mark);
        x += 12;
        y -= 9;
        g.fillColor = INK;
        g.circle(x, y, 6.7); g.fill();
    }
    g.strokeColor = color; g.lineWidth = 1.8;
    if (state === 'complete') {
        g.moveTo(x - 4, y); g.lineTo(x - 1.2, y - 2.6); g.lineTo(x + 4.4, y + 3.2);
    } else if (state === 'active') {
        g.moveTo(x - 4.2, y - 0.2); g.lineTo(x, y + 4); g.lineTo(x + 4.2, y - 0.2);
        g.moveTo(x - 3.3, y - 3.7); g.lineTo(x, y - 0.4); g.lineTo(x + 3.3, y - 3.7);
    } else {
        g.moveTo(x - 3.8, y); g.lineTo(x + 3.8, y);
    }
    g.stroke();
}

function wedge(g: Graphics, x: number, y: number, radius: number, from: number, sweep: number): void {
    g.moveTo(x, y);
    const segments = Math.max(6, Math.ceil(sweep * 8));
    for (let i = 0; i <= segments; i++) {
        const a = from + sweep * i / segments;
        g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    g.close();
}

function drawMissionScan(g: Graphics, scan: NonNullable<MissionView['scan']>): void {
    const { x, y, angle, previewAngle } = scan;
    const reach = 175;
    const halfWidth = Math.PI / 4;
    g.fillColor = new Color(145, 230, 235, 47);
    wedge(g, x, y, reach, angle - halfWidth, 2 * halfWidth); g.fill();
    g.strokeColor = new Color(145, 230, 235, 105);
    g.lineWidth = 1.4;
    wedge(g, x, y, reach, angle - halfWidth, 2 * halfWidth); g.stroke();
    if (previewAngle === undefined) return;
    g.strokeColor = new Color(216, 238, 240, 165);
    for (const edge of [previewAngle - halfWidth, previewAngle + halfWidth]) {
        const dx = Math.cos(edge), dy = Math.sin(edge);
        for (let d = 12; d + 8 < reach; d += 17) {
            g.moveTo(x + dx * d, y + dy * d);
            g.lineTo(x + dx * (d + 8), y + dy * (d + 8));
        }
    }
    g.stroke();
}

function drawEnemyTelegraphs(g: Graphics, enemies: Battle['enemies'], mission: MissionView | null, tick: number): void {
    for (const enemy of enemies) {
        const { x, y, kind, state } = enemy;
        const tether = enemy.tether ?? mission?.escort;
        if (kind === 'pursuer' && state === 'dash') {
            const dx = enemy.vx, dy = enemy.vy;
            g.strokeColor = new Color(119, 221, 200, 195); g.lineWidth = 2;
            for (const side of [-5, 5]) {
                g.moveTo(x - dx * 8 - dy * side, y - dy * 8 + dx * side);
                g.lineTo(x - dx * 25 - dy * side, y - dy * 25 + dx * side);
            }
            g.stroke();
        } else if (kind === 'reclaimer' && state !== 'walk' && tether) {
            const target = tether;
            const pulling = state === 'dash';
            if (pulling) {
                const cap = g.lineCap;
                g.lineCap = Graphics.LineCap.ROUND;
                g.strokeColor = new Color(251, 216, 148, 90); g.lineWidth = 24;
                g.moveTo(x, y); g.lineTo(target.x, target.y); g.stroke();
                g.lineCap = cap;
            } else {
                g.strokeColor = INK; g.lineWidth = 5;
                g.moveTo(x, y); g.lineTo(target.x, target.y); g.stroke();
            }
            g.strokeColor = pulling || tick % 7 < 4 ? GOLD : DIM; g.lineWidth = pulling ? 3 : 2;
            g.moveTo(x, y); g.lineTo(target.x, target.y); g.stroke();
        } else if (kind === 'jammer' && state !== 'walk') {
            const open = state === 'dash';
            g.fillColor = new Color(169, 105, 243, open ? 38 : 14);
            g.circle(x, y, 52); g.fill();
            g.strokeColor = open ? JAMMED : GOLD; g.lineWidth = 1.5;
            g.circle(x, y, 52); g.stroke();
            g.lineWidth = 2;
            g.moveTo(x, y + 8); g.lineTo(x + 7, y - 4); g.lineTo(x - 7, y - 4); g.close(); g.stroke();
        } else if (kind === 'ambusher' && state === 'warn') {
            g.fillColor = new Color(252, 198, 112, tick % 17 < 9 ? 255 : 103);
            g.circle(x - 4, y - 5, 1.8); g.fill();
            g.circle(x + 4, y - 5, 1.8); g.fill();
        }
    }
}

function station(g: Graphics, x: number, y: number, radius: number, progress: number, color: Color): void {
    g.fillColor = new Color(color.r, color.g, color.b, 28);
    g.circle(x, y, radius); g.fill();
    g.strokeColor = color; g.lineWidth = 1.5;
    g.circle(x, y, radius); g.stroke();
    if (progress <= 0) return;
    const segments = Math.ceil(28 * progress);
    g.lineWidth = 3;
    for (let i = 0; i <= segments; i++) {
        const angle = Math.PI * 2 * i / 28 - Math.PI / 2;
        const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
}
