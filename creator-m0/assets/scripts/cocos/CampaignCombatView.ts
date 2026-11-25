import { Color, Graphics } from 'cc';
import type { ChapterBossKind, ChapterHazard, MissionPoint, MissionView, Position, TerrainRect } from '../m1/Encounter';
import type { Battle } from '../m1/Battle';
import { START } from '../m1/content';
import { pxLine, pxRing, pxStarFlash, snap2 } from './PixelVfxEngine';

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
// Enter-the-Gungeon style high-contrast lethal enemy projectile palette (distinct from orange/purple player VFX!)
const SHELL_BODY = new Color(255, 58, 76);
const SHELL_CORE = new Color(255, 254, 245);
const SHELL_WAKE = new Color(224, 48, 70, 145);
const THREAT_BORDER = new Color(18, 12, 18, 245);
const PLAYER_HIT = new Color(255, 92, 82);
const QUIET_WARNING = new Color(255, 198, 92, 165);
const BOSS_SHELL = new Color(255, 74, 196);
type Escort = NonNullable<MissionView['escort']>;
type TerminalMark = 'medical' | 'broadcast' | 'dots' | 'stripes';
type EncounterProp = 'terminal' | 'battery' | 'lift' | 'relay' | 'valve' | 'barrier';
type PropPainter = (key: EncounterProp, x: number, y: number, size: number) => boolean;

export function drawPixelEnemyAim(g: Graphics, x: number, y: number, dx: number, dy: number,
    reach: number, kind: 'charger' | 'turret', untilAttack: number): void {
    const charge = kind === 'charger';
    const alpha = untilAttack <= 6 ? 193 : 118;
    const end = Math.min(reach, charge ? 40 : 32);
    g.fillColor = charge ? new Color(255, 137, 102, alpha) : new Color(255, 197, 108, alpha);
    const block = (forward: number, side: number) => {
        g.rect(Math.round(x + dx * forward - dy * side) - 1,
            Math.round(y + dy * forward + dx * side) - 1, 2, 2);
    };
    for (let i = 13; i + 4 <= end; i += 10) {
        if (charge) {
            block(i, -3);
            block(i, 3);
            block(i + 2, -1);
            block(i + 2, 1);
        } else {
            block(i, 0);
            block(i + 2, 0);
        }
    }
    if (end >= 8) block(end, 0);
    g.fill();
}

export function drawPixelEnemyShells(g: Graphics, bullets: Readonly<Battle['bullets']>, offsetX: number, offsetY: number, tick = 0): void {
    if (!bullets.length) return;
    const pulse = (Math.floor(tick / 3) % 2) === 0;
    // Pixel trail wake
    g.fillColor = SHELL_WAKE;
    for (const shell of bullets) {
        const x = Math.round(shell.x - offsetX), y = Math.round(shell.y - offsetY);
        g.rect(Math.round(x - shell.vx * 2.2) - 1, Math.round(y - shell.vy * 2.2) - 1, 2, 2);
        g.rect(Math.round(x - shell.vx * 1.1) - 2, Math.round(y - shell.vy * 1.1) - 2, 4, 4);
    }
    g.fill();
    // 9x9 crisp dark outer silhouette (rounded pixel diamond/octagon) so bullets pop against any VFX
    g.fillColor = THREAT_BORDER;
    for (const shell of bullets) {
        const x = Math.round(shell.x - offsetX), y = Math.round(shell.y - offsetY);
        g.rect(x - 4, y - 3, 9, 7);
        g.rect(x - 3, y - 4, 7, 9);
    }
    g.fill();
    // High-contrast crimson (regular) & hot-magenta (Boss) ring
    for (const [kind, color] of [[undefined, SHELL_BODY], [true, BOSS_SHELL]] as const) {
        g.fillColor = color;
        for (const shell of bullets) {
            if (shell.boss === kind) {
                const x = Math.round(shell.x - offsetX), y = Math.round(shell.y - offsetY);
                g.rect(x - 3, y - 2, 7, 5);
                g.rect(x - 2, y - 3, 5, 7);
            }
        }
        g.fill();
    }
    // Pulsing pure-white hot core (alternates 3x3 and 5x3/3x5 cross for immediate eye tracking)
    g.fillColor = SHELL_CORE;
    for (const shell of bullets) {
        const x = Math.round(shell.x - offsetX), y = Math.round(shell.y - offsetY);
        if (pulse) {
            g.rect(x - 2, y - 1, 5, 3);
            g.rect(x - 1, y - 2, 3, 5);
        } else {
            g.rect(x - 1, y - 1, 3, 3);
        }
    }
    g.fill();
}

export function drawBossVolleyCue(g: Graphics, x: number, y: number, facing: number, ring: boolean, until: number): void {
    g.fillColor = new Color(226, 151, 218, until <= 6 ? 201 : 120);
    for (const offset of ring ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [-0.3, 0, 0.3]) {
        const angle = facing + offset;
        g.rect(Math.round(x + Math.cos(angle) * 19) - 1, Math.round(y + Math.sin(angle) * 19) - 1, 3, 3);
    }
    g.fill();
}

export function drawPlayerHit(g: Graphics, x: number, y: number, age: number): void {
    if (age < 0 || age >= 6) return;
    x = Math.round(x);
    y = Math.round(y);
    const extent = 11 + Math.floor(age);
    for (const [size, color] of [[4, THREAT_BORDER], [2, PLAYER_HIT]] as const) {
        g.fillColor = new Color(color.r, color.g, color.b, Math.round(color.a * (1 - age / 6)));
        for (const side of [-1, 1]) {
            const px = x + side * extent - size / 2;
            g.rect(px, y - 2, size, 8);
            g.rect(px - (side > 0 ? 3 : 0), y + 6, size + 3, size);
            g.rect(px - (side > 0 ? 3 : 0), y - 2, size + 3, size);
        }
        g.fill();
    }
}

export function drawPixelSpawn(g: Graphics, x: number, y: number, untilSpawn: number, color: Color): void {
    const r = Math.max(8, Math.round(8 + untilSpawn / 3));
    x = Math.round(x);
    y = Math.round(y);
    g.fillColor = new Color(color.r, color.g, color.b, untilSpawn <= 6 ? 245 : 176);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        g.rect(x + sx * r - (sx > 0 ? 6 : 0), y + sy * r - (sy > 0 ? 2 : 0), 6, 2);
        g.rect(x + sx * r - (sx > 0 ? 2 : 0), y + sy * r - (sy > 0 ? 6 : 0), 2, 6);
    }
    if (untilSpawn <= 6) g.rect(x - 1, y - 1, 2, 2);
    g.fill();
}

export function drawCampaignEncounter(g: Graphics, battle: Readonly<Battle>, stageId: string, modelProps = false,
    paint?: PropPainter, threat: Graphics = g): void {
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
            paint?.('barrier', (left + right) / 2, (bottom + top) / 2, Math.min(24, right - left, top - bottom));
        }
    }
    const practice = battle.practiceWarning;
    const hazard = boss?.hazard ?? practice;
    if (hazard) {
        drawBossHazard(g, hazard, !modelProps, threat, tick, boss?.kind, boss?.phaseStartedAt ?? 0);
        if (hazard.shape === 'rect' && (practice || boss?.kind === 'gatekeeper' && boss.facing === undefined)) {
            drawGatekeeperRail(g, hazard);
        }
    }
    if (!modelProps && boss?.volley?.state === 'warning' && battle.boss) {
        const { x, y } = battle.boss.unit;
        drawBossVolleyCue(threat, x, y, boss.facing ?? 0, boss.volley.pattern === 'ring', boss.phaseEndsAt - tick);
    }
    drawEnemyTelegraphs(g, enemies, mission, tick, !modelProps, threat);
    if (mission?.thermal) drawThermalSignals(g, mission.thermal, mission.points, tick);
    const escort = mission?.escort;
    if (escort) {
        if (mission?.lift) drawLift(g, escort, mission.lift, battle.player, modelProps, paint);
        else drawBatteryCar(g, escort, modelProps, paint);
    }
    const terminals = boss?.terminals ?? (boss?.kind === 'core' && boss.hp > 0 ? [] : mission?.points);
    for (const point of terminals ?? []) {
        const color = point.state === 'complete' ? SEA : point.state === 'active' ? GOLD : DIM;
        station(g, point.x, point.y, point.radius, point.progress, color);
        const west = point.x < START.x;
        const mark = stageId === '05' ? west ? 'dots' : 'stripes'
            : stageId === '19' && battle.spec.directive?.type === 'handoff' ? west ? 'medical' : 'broadcast' : undefined;
        paint?.(mission?.thermal ? 'valve' : 'terminal', point.x - 15, point.y + 9, 23);
        drawTerminal(g, modelProps ? { ...point, x: point.x + 12, y: point.y - 9 } : point, color, mark);
    }
    if (boss?.station && !boss.terminals) {
        const point = boss.station;
        station(g, point.x, point.y, point.radius, point.progress, SEA);
        const x = point.x + (modelProps ? 12 : 0), y = point.y - (modelProps ? 9 : 0);
        paint?.('relay', point.x + 15, point.y + 8, 22);
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

function drawBatteryCar(g: Graphics, escort: Escort, model: boolean, paint?: PropPainter): void {
    g.strokeColor = DIM; g.lineWidth = 2;
    for (let i = 0; i < escort.route.length; i++) {
        const point = escort.route[i];
        if (i === 0) g.moveTo(point.x, point.y);
        else g.lineTo(point.x, point.y);
    }
    g.stroke();
    station(g, escort.x, escort.y, escort.radius, escort.hp / escort.maxHp, SEA);
    if (model || paint?.('battery', escort.x, escort.y, 39)) return;
    g.fillColor = INK;
    g.roundRect(escort.x - 17, escort.y - 10, 34, 20, 4); g.fill();
    g.fillColor = GOLD;
    g.roundRect(escort.x - 12, escort.y - 6, 24, 12, 2); g.fill();
    g.fillColor = INK;
    g.rect(escort.x - 1, escort.y - 4, 2, 8); g.rect(escort.x - 4, escort.y - 1, 8, 2); g.fill();
}

function drawLift(g: Graphics, escort: Escort, lift: NonNullable<MissionView['lift']>, player: Readonly<Position>,
    model: boolean, paint?: PropPainter): void {
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
    if (!model && !paint?.('lift', x, y, 50)) {
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
        g.rect(left, bottom, right - left, top - bottom); g.fill();
        g.fillColor = CONVEYOR_SLATS;
        for (let x = firstTread(12); x < right - 7; x += 12) g.rect(Math.round(x), bottom + 4, 2, top - bottom - 8);
        g.fill();
    }
    if (!model || warning) {
        g.strokeColor = warning ? GOLD : CONVEYOR_TRACK; g.lineWidth = 2;
        if (model) g.roundRect(left + 1, bottom + 1, right - left - 2, top - bottom - 2, 2);
        else g.rect(left + 1, bottom + 1, right - left - 2, top - bottom - 2);
        g.stroke();
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

function drawBossHazard(
    g: Graphics,
    hazard: ChapterHazard,
    pixel: boolean,
    threat: Graphics,
    tick = 0,
    bossKind?: ChapterBossKind,
    phaseStartedAt = 0,
): void {
    const hot = hazard.state === 'active';
    const age = Math.max(0, tick - phaseStartedAt);
    g.fillColor = hot ? new Color(247, 79, 59, 115) : new Color(255, 181, 61, 55);
    g.strokeColor = hot ? RED : GOLD;
    g.lineWidth = 2.5;
    switch (hazard.shape) {
        case 'rect':
            if (!pixel) {
                g.rect(hazard.left, hazard.bottom, hazard.right - hazard.left, hazard.top - hazard.bottom);
                g.fill();
                g.rect(hazard.left, hazard.bottom, hazard.right - hazard.left, hazard.top - hazard.bottom);
                g.stroke();
                break;
            }
            if (!hot) {
                // Warning: crisp amber pixel dashed lane + subtle drifting danger chevrons
                drawPixelLaneEdges(threat, hazard, false);
                drawPixelLaneWarningChevrons(g, hazard, tick);
            } else if (bossKind === 'gatekeeper') {
                // Active Gatekeeper: roaring pixel fire sea + overloaded plasma busbar down the lane!
                drawPixelFireLane(g, threat, hazard, tick, age);
            } else {
                // Active Supervisor / Elite / Core: searing multi-layer pixel plasma beam!
                drawPixelLaserLane(g, threat, hazard, tick, age, bossKind === 'core');
            }
            break;
        case 'sector':
            if (!pixel) {
                wedge(g, hazard.x, hazard.y, hazard.radius, hazard.from, hazard.sweep);
                g.fill();
                wedge(g, hazard.x, hazard.y, hazard.radius, hazard.from, hazard.sweep);
                g.stroke();
                break;
            }
            if (!hot) {
                const { x, y, radius, from, sweep } = hazard;
                drawPixelArcEdge(threat, x, y, radius, from, sweep, QUIET_WARNING, 16);
                for (const ray of [from + 0.018, from + sweep - 0.018]) {
                    drawPixelCable(threat, x, y, x + Math.cos(ray) * (radius - 3), y + Math.sin(ray) * (radius - 3), QUIET_WARNING, false);
                }
            } else {
                drawPixelStormSector(g, threat, hazard, tick, age, bossKind === 'core');
            }
            break;
        case 'tether': {
            if (!pixel) {
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
            if (!hot) {
                drawPixelCable(threat, hazard.x, hazard.y, hazard.end.x, hazard.end.y, QUIET_WARNING, false);
            } else {
                drawPixelHeavyTether(g, threat, hazard, tick);
            }
            break;
        }
    }
}

function drawPixelLaneWarningChevrons(g: Graphics, lane: Extract<ChapterHazard, { shape: 'rect' }>, tick: number): void {
    const { left, right, bottom, top } = lane;
    const width = right - left, height = top - bottom;
    const horiz = width >= height;
    const cx = (left + right) * 0.5, cy = (bottom + top) * 0.5;
    const blink = Math.floor(tick / 4) % 2 === 0 ? 150 : 85;
    g.fillColor = new Color(255, 198, 92, blink);
    const shift = (tick * 2) % 32;
    if (horiz) {
        for (let x = left + 16 + shift; x < right - 16; x += 32) {
            const px = snap2(x), py = snap2(cy);
            g.rect(px - 2, py - 6, 4, 2);
            g.rect(px + 2, py - 4, 2, 2);
            g.rect(px + 4, py - 2, 2, 4);
            g.rect(px + 2, py + 2, 2, 2);
            g.rect(px - 2, py + 4, 4, 2);
        }
    } else {
        for (let y = bottom + 16 + shift; y < top - 16; y += 32) {
            const px = snap2(cx), py = snap2(y);
            g.rect(px - 6, py - 2, 2, 4);
            g.rect(px - 4, py + 2, 2, 2);
            g.rect(px - 2, py + 4, 4, 2);
            g.rect(px + 2, py + 2, 2, 2);
            g.rect(px + 4, py - 2, 2, 4);
        }
    }
    g.fill();
}

/** Active Gatekeeper Boss VFX: roaring multi-layer pure-pixel fire sea + central plasma surge! */
function drawPixelFireLane(
    g: Graphics,
    threat: Graphics,
    lane: Extract<ChapterHazard, { shape: 'rect' }>,
    tick: number,
    age: number,
): void {
    const { left, right, bottom, top } = lane;
    const width = right - left, height = top - bottom;
    const horiz = width >= height;
    const ramp = Math.min(1, (age + 1) / 4);
    const frame = Math.floor(tick / 2);

    // 1. Subtle dark charred scorch bed under the roaring flames (keeps exact hitbox clear without looking like a flat red box)
    g.fillColor = new Color(46, 16, 18, Math.round(135 * ramp));
    g.rect(snap2(left), snap2(bottom), snap2(width), snap2(height));
    g.fill();

    // 2. Crisp scorched pixel perimeter on threat layer so player can judge exact safe line to 1 pixel
    drawPixelLaneEdges(threat, lane, true);

    // 3. Roaring 3-tier pixel fire plumes filling the lane!
    const stepX = 16, stepY = 16;
    // Pass A: deep crimson flame base blocks
    g.fillColor = new Color(214, 42, 42, Math.round(215 * ramp));
    for (let y = bottom + 6; y < top - 4; y += stepY) {
        for (let x = left + 6; x < right - 4; x += stepX) {
            const h = Math.sin(x * 0.13 + y * 0.17 + frame * 1.4);
            const jx = snap2(x + Math.sin(y * 0.21 + frame * 1.1) * 4);
            const jy = snap2(y + Math.abs(h) * 5);
            const sz = h > 0.2 ? 10 : 8;
            g.rect(jx - sz / 2, jy - sz / 2, sz, sz);
        }
    }
    g.fill();

    // Pass B: blazing orange flame tongues jumping upward
    threat.fillColor = new Color(255, 118, 38, Math.round(235 * ramp));
    for (let y = bottom + 8; y < top - 6; y += stepY) {
        for (let x = left + 8; x < right - 6; x += stepX) {
            const phase = Math.sin(x * 0.19 - y * 0.11 + frame * 1.9);
            const px = snap2(x + phase * 5);
            const py = snap2(y + (phase * 0.5 + 0.5) * 6);
            const sz = phase > 0 ? 8 : 6;
            threat.rect(px - sz / 2, py - sz / 2, sz, sz);
        }
    }
    threat.fill();

    // Pass C: golden-yellow inner heat cores + rising pixel embers
    threat.fillColor = new Color(255, 222, 86, Math.round(245 * ramp));
    for (let y = bottom + 10; y < top - 8; y += stepY) {
        for (let x = left + 10; x < right - 8; x += stepX) {
            const phase = Math.cos(x * 0.23 + y * 0.19 + frame * 2.3);
            if (phase < -0.25) continue;
            const px = snap2(x - phase * 3);
            const py = snap2(y + phase * 4 + 2);
            threat.rect(px - 2, py - 2, 4, 4);
            // Detached ember spark rising off the fire crest
            if (phase > 0.6) threat.rect(px, snap2(py + 6), 2, 2);
        }
    }
    threat.fill();

    // Pass D: white-hot central overload plasma arc whipping across the lane!
    const cx = (left + right) * 0.5, cy = (bottom + top) * 0.5;
    threat.fillColor = new Color(255, 252, 228, Math.round(240 * ramp));
    const segs = 12;
    let prevX = horiz ? left + 4 : cx;
    let prevY = horiz ? cy : bottom + 4;
    for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const jitter = Math.sin(i * 3.7 + frame * 2.7) * (horiz ? height * 0.22 : width * 0.22);
        const nx = horiz ? left + width * u : cx + jitter;
        const ny = horiz ? cy + jitter : bottom + height * u;
        pxLine(threat, prevX, prevY, nx, ny, age < 3 ? 4 : 2, 4);
        prevX = nx; prevY = ny;
    }
    threat.fill();
}

/** Active Supervisor / Elite / Core Boss VFX: multi-layer searing pixel plasma laser beam! */
function drawPixelLaserLane(
    g: Graphics,
    threat: Graphics,
    lane: Extract<ChapterHazard, { shape: 'rect' }>,
    tick: number,
    age: number,
    isCore: boolean,
): void {
    const { left, right, bottom, top } = lane;
    const width = right - left, height = top - bottom;
    const horiz = width >= height;
    const cx = (left + right) * 0.5, cy = (bottom + top) * 0.5;
    const thickness = horiz ? height : width;
    const pulse = (Math.floor(tick / 2) % 2) === 0 ? 1 : 0.86;
    const outerCol = isCore ? new Color(238, 62, 168, 195) : new Color(255, 64, 58, 195);
    const midCol = isCore ? new Color(255, 146, 232, 235) : new Color(255, 168, 64, 235);

    // Outer scorched edge + pulsing plasma mantle
    drawPixelLaneEdges(threat, lane, true);
    const mantle = Math.max(8, snap2(thickness * 0.72 * pulse));
    g.fillColor = outerCol;
    if (horiz) g.rect(snap2(left), snap2(cy - mantle / 2), snap2(width), mantle);
    else g.rect(snap2(cx - mantle / 2), snap2(bottom), mantle, snap2(height));
    g.fill();

    // Inner bright plasma ribbon
    const ribbon = Math.max(6, snap2(thickness * 0.42 * pulse));
    threat.fillColor = midCol;
    if (horiz) threat.rect(snap2(left), snap2(cy - ribbon / 2), snap2(width), ribbon);
    else threat.rect(snap2(cx - ribbon / 2), snap2(bottom), ribbon, snap2(height));
    threat.fill();

    // Pure white-hot core beam + racing shock nodes
    const coreW = Math.max(4, snap2(thickness * (age < 3 ? 0.28 : 0.18)));
    threat.fillColor = new Color(255, 253, 238, 250);
    if (horiz) threat.rect(snap2(left), snap2(cy - coreW / 2), snap2(width), coreW);
    else threat.rect(snap2(cx - coreW / 2), snap2(bottom), coreW, snap2(height));
    const speedShift = (tick * 9) % 44;
    if (horiz) {
        for (let x = left + speedShift; x < right; x += 44) {
            const sx = snap2(x);
            threat.rect(sx - 2, snap2(cy - thickness * 0.44), 4, snap2(thickness * 0.88));
        }
    } else {
        for (let y = bottom + speedShift; y < top; y += 44) {
            const sy = snap2(y);
            threat.rect(snap2(cx - thickness * 0.44), sy - 2, snap2(thickness * 0.88), 4);
        }
    }
    threat.fill();
}

/** Active Silence Array / Core Stage 1 VFX: sweeping concentric pixel shockwave storm! */
function drawPixelStormSector(
    g: Graphics,
    threat: Graphics,
    hazard: Extract<ChapterHazard, { shape: 'sector' }>,
    tick: number,
    age: number,
    isCore: boolean,
): void {
    const { x, y, radius, from, sweep } = hazard;
    const primary = isCore ? new Color(255, 86, 178, 235) : new Color(196, 114, 255, 235);
    const accent = isCore ? new Color(255, 198, 92, 235) : new Color(255, 76, 108, 235);

    // Subtle dark purple/crimson static floor tint so exact safe wedge remains unmistakable
    g.fillColor = isCore ? new Color(68, 18, 42, 92) : new Color(46, 20, 68, 92);
    wedge(g, x, y, radius, from, sweep);
    g.fill();

    // Crisp outer boundary & side rails
    drawPixelArcEdge(threat, x, y, radius, from, sweep, RED, 4);
    for (const ray of [from + 0.018, from + sweep - 0.018]) {
        threat.fillColor = RED;
        pxLine(threat, x, y, x + Math.cos(ray) * radius, y + Math.sin(ray) * radius, 2, 4);
        threat.fill();
    }

    // 5 sweeping concentric pixel shock arcs racing outward from the Boss!
    for (let w = 0; w < 5; w++) {
        const phase = ((tick * 0.09 + w * 0.2) % 1);
        const r = Math.max(16, radius * phase);
        threat.fillColor = w % 2 === 0 ? primary : accent;
        pxRing(threat, x, y, r, phase > 0.7 ? 4 : 2, from + 0.03, sweep - 0.06, 6, 4);
        threat.fill();
    }

    // 6 crackling white-hot radial pixel lightning spokes
    const spokes = 6;
    threat.fillColor = new Color(255, 250, 232, age < 3 ? 250 : 210);
    for (let i = 0; i < spokes; i++) {
        const u = (i + 0.5) / spokes;
        const a = from + sweep * u + Math.sin(tick * 0.7 + i * 2.1) * 0.06;
        const len = radius * (0.45 + 0.5 * ((tick * 0.13 + i * 0.31) % 1));
        const midX = x + Math.cos(a + 0.08) * (len * 0.52);
        const midY = y + Math.sin(a + 0.08) * (len * 0.52);
        pxLine(threat, x, y, midX, midY, 2, 5);
        pxLine(threat, midX, midY, x + Math.cos(a) * len, y + Math.sin(a) * len, 2, 5);
    }
    threat.fill();
}

/** Active Tow / Core Stage 2 VFX: taut heavy pixel chain + crackling red-white voltage surge + claw! */
function drawPixelHeavyTether(
    g: Graphics,
    threat: Graphics,
    hazard: Extract<ChapterHazard, { shape: 'tether' }>,
    tick: number,
): void {
    const { x, y, end } = hazard;
    const dx = end.x - x, dy = end.y - y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / dist, uy = dy / dist;
    const nx = -uy, ny = ux;

    // 1. Dark steel outer chain border
    g.fillColor = THREAT_BORDER;
    pxLine(g, x, y, end.x, end.y, 8, 5);
    g.fill();

    // 2. Alternating steel & industrial yellow chain links
    const links = Math.max(3, Math.ceil(dist / 8));
    for (let i = 0; i <= links; i++) {
        const u = i / links;
        const lx = snap2(x + dx * u), ly = snap2(y + dy * u);
        threat.fillColor = i % 2 === 0 ? new Color(255, 198, 92, 245) : new Color(165, 182, 190, 245);
        threat.rect(lx - 2, ly - 2, 4, 4);
    }
    threat.fill();

    // 3. High-voltage crimson & white-hot zigzag surge racing along the taut chain
    const frame = Math.floor(tick / 2);
    threat.fillColor = new Color(255, 74, 88, 240);
    let px = x, py = y;
    for (let i = 1; i <= 7; i++) {
        const u = i / 7;
        const bend = i === 7 ? 0 : Math.sin(i * 3.1 + frame * 2.4) * 9;
        const qx = x + dx * u + nx * bend, qy = y + dy * u + ny * bend;
        pxLine(threat, px, py, qx, qy, 2, 4);
        px = qx; py = qy;
    }
    threat.fill();

    // 4. Pixel claw prongs & starburst spark at the grappling head
    pxStarFlash(threat, end.x, end.y, 8, [255, 92, 82], 245);
    threat.fillColor = GOLD;
    for (const side of [-1, 1]) {
        pxLine(threat, end.x, end.y, end.x - ux * 10 + nx * side * 9, end.y - uy * 10 + ny * side * 9, 2, 3);
    }
    threat.fill();
}

function drawPixelArcEdge(g: Graphics, x: number, y: number, radius: number, from: number, sweep: number,
    color: Color, pitch: number): void {
    const r = radius - 2.5;
    if (r <= 0) return;
    const tiles = Math.max(1, Math.ceil(r * sweep / pitch));
    g.fillColor = color;
    for (let i = 0; i < tiles; i++) {
        const angle = from + sweep * (i + 0.5) / tiles;
        g.rect(Math.round(x + r * Math.cos(angle)) - 1, Math.round(y + r * Math.sin(angle)) - 1, 2, 2);
    }
    g.fill();
}

function drawPixelCable(g: Graphics, x: number, y: number, endX: number, endY: number, color: Color, hot: boolean): void {
    const tiles = Math.max(1, Math.ceil(Math.hypot(endX - x, endY - y) / (hot ? 3 : 8)));
    g.fillColor = color;
    for (let i = 0; i < tiles; i++) {
        const t = (i + 0.5) / tiles;
        g.rect(Math.round(x + (endX - x) * t) - 1, Math.round(y + (endY - y) * t) - 1, 2, 2);
    }
    g.fill();
}

function drawPixelLaneEdges(g: Graphics, lane: Extract<ChapterHazard, { shape: 'rect' }>, hot: boolean): void {
    const { left, right, bottom, top } = lane;
    const width = right - left, height = top - bottom;
    const thickness = Math.min(hot ? 4 : 2, width / 2, height / 2);
    if (thickness <= 0) return;
    const horizontal = width >= height;
    const length = horizontal ? width : height;
    const step = hot ? length : 20;
    const strokes = hot ? [[thickness, THREAT_BORDER], [thickness / 2, RED]] as const : [[thickness, QUIET_WARNING]] as const;
    for (const [size, color] of strokes) {
        const inset = (thickness - size) / 2;
        g.fillColor = color;
        for (let i = 0; i < length; i += step) {
            const segment = Math.min(hot ? length : 8, length - i);
            if (horizontal) {
                g.rect(left + i, bottom + inset, segment, size);
                g.rect(left + i, top - inset - size, segment, size);
            } else {
                g.rect(left + inset, bottom + i, size, segment);
                g.rect(right - inset - size, bottom + i, size, segment);
            }
        }
        g.fill();
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

function drawEnemyTelegraphs(g: Graphics, enemies: Battle['enemies'], mission: MissionView | null, tick: number,
    pixel: boolean, threat: Graphics): void {
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
            if (pixel) {
                if (pulling) {
                    // Taut pixel grappling cable with voltage sparks instead of a flat translucent strip!
                    g.fillColor = THREAT_BORDER;
                    pxLine(g, x, y, target.x, target.y, 6, 4);
                    g.fill();
                    threat.fillColor = RED;
                    pxLine(threat, x, y, target.x, target.y, 2, 4);
                    threat.fill();
                    const travel = (tick * 0.14) % 1;
                    pxStarFlash(threat, x + (target.x - x) * travel, y + (target.y - y) * travel, 5, [255, 206, 98], 235);
                } else {
                    drawPixelCable(threat, x, y, target.x, target.y, QUIET_WARNING, false);
                }
            } else {
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
                const color = pulling || tick % 7 < 4 ? GOLD : DIM;
                g.strokeColor = color; g.lineWidth = pulling ? 3 : 2;
                g.moveTo(x, y); g.lineTo(target.x, target.y); g.stroke();
            }
        } else if (kind === 'jammer' && state !== 'walk') {
            const open = state === 'dash';
            g.fillColor = new Color(169, 105, 243, open ? 38 : 14);
            if (open || !pixel) { g.circle(x, y, 52); g.fill(); }
            g.strokeColor = open ? JAMMED : GOLD; g.lineWidth = 1.5;
            if (pixel) drawPixelArcEdge(threat, x, y, 52, 0, 2 * Math.PI, open ? JAMMED : QUIET_WARNING, open ? 3 : 14);
            else { g.circle(x, y, 52); g.stroke(); }
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
