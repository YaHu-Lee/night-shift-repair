import { FIELD, TICK_RATE } from './content';
import type { CombatBounds } from './content';

export interface Position { x: number; y: number }
export const BLUEPRINT_IDS = ['magnetic_pickup_arm', 'narrow_beam_clamp', 'quick_release_heatsink'] as const;
export type BlueprintId = typeof BLUEPRINT_IDS[number];
export const CHALLENGE_MODES = ['normal', 'overtime_1', 'overtime_2'] as const;
export type ChallengeMode = typeof CHALLENGE_MODES[number];
export type ChapterBossKind = 'supervisor' | 'gatekeeper' | 'tow' | 'silence' | 'core' | 'elite';
export const GATEKEEPER_PORTS = { a: { x: 120, y: 402 }, b: { x: 240, y: 402 } } as const;
export const GATEKEEPER_WARNING_TICKS = TICK_RATE;

export interface CampaignEncounter {
    readonly enemyCap: number;
    readonly terrain?: 'gates' | 'conveyor' | 'engine';
    readonly boss?: ChapterBossKind;
    readonly bossTitle?: string;
    readonly bossHp?: number;
    readonly combatOnly?: boolean;
    readonly armorLine?: boolean;
    readonly revive?: boolean;
    readonly overtime?: boolean;
}

export interface WaveDirective {
    readonly type: 'switch' | 'escort' | 'relay' | 'thermal' | 'scan' | 'handoff' | 'hybrid';
    readonly points: readonly Readonly<Position>[];
    readonly holdTicks?: number;
    readonly minTicks?: number;
    readonly radius?: number;
    readonly windowTicks?: number;
    readonly wavesCarry?: boolean;
    readonly rangedPressure?: boolean;
    readonly afterBoss?: boolean;
    readonly switchCount?: number;
    readonly powerDrill?: boolean;
    readonly label?: string;
    readonly variant?: 'lift' | 'archive' | 'bypass';
}

export interface MissionState { readonly escortHp?: number; readonly relayHp?: number }
export type MissionCue = 'power' | 'connect' | 'confirm';
export type MissionFailure = 'escort' | 'relay' | 'thermal';
export interface MissionPoint extends Position {
    readonly radius: number;
    readonly state: 'waiting' | 'active' | 'complete';
    readonly progress: number;
}
export interface MissionView {
    readonly label: string;
    readonly status: 'working' | 'complete' | 'failed';
    readonly progress: number;
    readonly points: readonly MissionPoint[];
    readonly scan?: Readonly<Position> & { readonly angle: number; readonly previewAngle?: number };
    readonly thermal?: { readonly previous?: Readonly<Position>; readonly next?: Readonly<Position>; readonly radius: number };
    readonly escort?: Readonly<Position> & { readonly hp: number; readonly maxHp: number; readonly radius: number;
        readonly route: readonly Readonly<Position>[]; readonly destination?: Readonly<Position> };
    readonly lift?: { readonly floor: number; readonly floors: number; readonly bridge?: Readonly<Position> };
    readonly integrity?: { readonly hp: number; readonly maxHp: number };
}
export interface TerrainRect {
    readonly left: number; readonly right: number; readonly bottom: number; readonly top: number;
    readonly kind: 'wall' | 'gate' | 'belt';
    readonly state: 'open' | 'warning' | 'closed';
    readonly direction?: number;
    readonly travel?: number;
}

export type ChapterHazard = (
    { readonly shape: 'rect'; readonly left: number; readonly right: number; readonly bottom: number; readonly top: number }
    | (Position & { readonly shape: 'sector'; readonly radius: number; readonly from: number; readonly sweep: number })
    | (Position & { readonly shape: 'tether'; readonly end: Readonly<Position>; readonly width: number })
) & { readonly state: 'warning' | 'active' };

export function gatekeeperLane(safe: keyof typeof GATEKEEPER_PORTS, field: CombatBounds = FIELD): Omit<Extract<ChapterHazard, { shape: 'rect' }>, 'state'> {
    const middle = (field.left + field.right) / 2;
    return { shape: 'rect', left: safe === 'a' ? middle + 1 : field.left, right: safe === 'a' ? field.right : middle - 1,
        bottom: field.bottom, top: field.top };
}

export interface ChapterBossView {
    readonly kind: ChapterBossKind;
    readonly title: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly stage: number;
    readonly vulnerable: boolean;
    readonly recovering: boolean;
    readonly phaseStartedAt: number;
    readonly phaseEndsAt: number;
    readonly facing?: number;
    readonly instruction: string;
    readonly hazard?: ChapterHazard;
    readonly station?: Readonly<Position> & { readonly radius: number; readonly progress: number };
    readonly terminals?: readonly MissionPoint[];
}

export interface MissionEnemy extends Position {
    readonly kind: string;
    readonly state: string;
    readonly next: number;
}

export const distance = (a: Readonly<Position>, b: Readonly<Position>) => Math.hypot(a.x - b.x, a.y - b.y);

export function fieldRayEnd(from: Readonly<Position>, ux: number, uy: number, range: number, field: CombatBounds): Position {
    const xLimit = ux ? ((ux > 0 ? field.right : field.left) - from.x) / ux : Infinity;
    const yLimit = uy ? ((uy > 0 ? field.top : field.bottom) - from.y) / uy : Infinity;
    const length = Math.max(0, Math.min(range, xLimit, yLimit));
    return { x: from.x + ux * length, y: from.y + uy * length };
}
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export function distanceToSegment(point: Readonly<Position>, a: Readonly<Position>, b: Readonly<Position>): number {
    const dx = b.x - a.x, dy = b.y - a.y;
    const projection = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return distance(point, { x: a.x + projection * dx, y: a.y + projection * dy });
}
export const ESCORT_HP = 6;
export const RELAY_HP = 5;
export const RECLAIMER_PULL_TICKS = 2 * TICK_RATE;
const TOW_DISTANCE = 32;
const LIFT_RADIUS = 36;
const ESCORT_RADIUS = 65;
const SCAN_WINDOW = 6 * TICK_RATE;
const THERMAL_OVERLAP = 36;
const THERMAL_RECOVERY = 2 * TICK_RATE;
const THERMAL_DECAY = 4 * TICK_RATE;
const labels: Record<WaveDirective['type'], string> = {
    switch: '切换供电区', escort: '护送电池车', relay: '维持中继上传', thermal: '稳定保温区',
    scan: '接通扫描扇区', handoff: '核验两端签名', hybrid: '供电后护送电池',
};

export class Mission {
    readonly stations: readonly Readonly<Position>[];
    readonly route: readonly Readonly<Position>[];
    readonly escort: Position | undefined;
    readonly radius: number;
    private readonly escortRadius: number;
    private readonly holdTicks: number;
    private readonly integrity: boolean;
    private index = 0;
    private hold = 0;
    private waypoint = 1;
    private completedAt = 0;
    lastActivation = -Infinity;
    private away = 0;
    private gate = 0;
    private escortHp = ESCORT_HP;
    private relayHp = RELAY_HP;
    private escortUnderPull = false;
    private temperature = 6;
    private thermalWarm = false;
    private thermalTicks = 0;
    private activatedAt = 0;
    private waitingForBoss: boolean;
    private lastObjectiveDamage = -Infinity;
    private lastRelayShot = -Infinity;

    constructor(readonly directive: WaveDirective, carry?: MissionState, private readonly field: CombatBounds = FIELD) {
        const { type, points, variant } = directive;
        this.waitingForBoss = directive.afterBoss ?? false;
        const handoff = type === 'handoff';
        this.stations = type === 'escort' ? [] : type === 'hybrid' ? points.slice(0, directive.switchCount ?? 1) : points;
        this.route = type === 'escort' ? points : type === 'hybrid' ? points.slice(this.stations.length) : [];
        this.escort = this.route.length ? { ...this.route[0] } : undefined;
        this.integrity = type === 'relay' || type === 'hybrid';
        this.radius = directive.radius ?? (variant === 'lift' ? LIFT_RADIUS : 30);
        this.escortRadius = variant === 'lift' ? LIFT_RADIUS : ESCORT_RADIUS;
        this.holdTicks = directive.holdTicks ?? (type === 'relay' ? 240 : handoff || type === 'scan' ? 120 : 60);
        if (directive.wavesCarry) {
            this.escortHp = carry?.escortHp ?? ESCORT_HP;
            this.relayHp = carry?.relayHp ?? RELAY_HP;
        }
    }

    get current(): Readonly<Position> | undefined {
        return this.waitingForBoss ? undefined : this.stations[this.index] ?? this.escort;
    }

    get ready(): boolean { return !this.waitingForBoss; }
    get liftFloor(): number | undefined {
        return this.escort && this.directive.variant === 'lift' ? this.waypoint : undefined;
    }
    get completedStations(): number { return this.index; }
    get complete(): boolean { return this.index === this.stations.length && this.waypoint >= this.route.length && this.gate === 0; }
    get failure(): MissionFailure | undefined {
        if (this.escortHp <= 0) return 'escort';
        if (this.relayHp <= 0) return 'relay';
        if (this.temperature <= 0) return 'thermal';
    }
    get failed(): boolean { return this.failure !== undefined; }

    snapshot(): MissionState {
        return {
            ...(this.escort ? { escortHp: this.escortHp } : {}),
            ...(this.integrity ? { relayHp: this.relayHp } : {}),
        };
    }

    instruction(tick: number): string {
        const { type, minTicks, label } = this.directive;
        if (!this.failed && this.complete) return tick < (minTicks ?? 0) ? '目标完成 · 坚持到交班' : '目标完成';
        if (this.gate) return '停梯 · 接通侧桥终端';
        if (this.escort && this.current === this.escort && !this.complete) {
            return this.directive.variant === 'lift' ? '靠近平台 · 前往下一层' : '跟紧电池车';
        }
        if (this.directive.powerDrill && this.index === 1) return '前往 B 区 · 合上条纹闸';
        if (type === 'handoff' && this.index > 0 && !this.complete) {
            const remaining = Math.max(0, (this.directive.windowTicks ?? 360) - (tick - this.completedAt));
            return `赶去另一端 · ${Math.ceil(remaining / TICK_RATE)} 秒`;
        }
        return this.waitingForBoss ? '关底停机后开始作业' : label ?? labels[type];
    }

    view(tick: number): MissionView {
        const liftGate = this.gate ? this.liftPort() : undefined;
        const type = this.directive.type;
        const status = this.failed ? 'failed' : this.complete ? 'complete' : 'working';
        const points: MissionPoint[] = this.stations.flatMap((point, index) => {
            // Later laps through the same terminals use the first visible occurrence only.
            if (this.stations.some((other, otherIndex) => otherIndex >= this.index && otherIndex < index && distance(point, other) < 1)
                || index < this.index && this.stations.slice(this.index).some(other => distance(point, other) < 1)) return [];
            const active = this.ready && index === this.index && this.scanOpen(tick);
            return [{ ...point, radius: this.radius, progress: index < this.index ? 1 : active ? this.hold / this.holdTicks : 0,
                state: index < this.index ? 'complete' : active ? 'active' : 'waiting' }];
        });
        if (liftGate) points.push({ ...liftGate, radius: this.radius, state: 'active', progress: this.hold / 60 });
        const scan = type === 'scan' && this.ready && status === 'working' ? this.scanView(tick) : undefined;
        const thermal = type === 'thermal' && this.ready && status === 'working'
            ? { previous: this.previousThermal(tick), next: this.stations[this.index + 1], radius: this.radius } : undefined;
        const floor = this.liftFloor;
        const lift = floor === undefined ? undefined
            : { floor, floors: this.route.length, ...(liftGate ? { bridge: liftGate } : {}) };
        return {
            label: this.instruction(tick), status, points,
            progress: clamp((this.index + Math.max(0, this.waypoint - 1)) /
                Math.max(1, this.stations.length + this.route.length - (this.route.length ? 1 : 0)), 0, 1),
            ...(scan ? { scan } : {}),
            ...(thermal ? { thermal } : {}),
            ...(this.escort ? { escort: { ...this.escort, hp: this.escortHp, maxHp: ESCORT_HP, radius: this.escortRadius,
                route: this.route, destination: this.route[this.waypoint] } } : {}),
            ...(lift ? { lift } : {}),
            ...(this.integrity ? { integrity: { hp: this.relayHp, maxHp: RELAY_HP } }
                : type === 'thermal' ? { integrity: { hp: this.temperature, maxHp: 6 } } : {}),
        };
    }

    private scanElapsed(tick: number): number { return Math.max(0, tick - this.activatedAt - 1); }

    private scanOpen(tick: number): boolean {
        return this.directive.type !== 'scan'
            || Math.floor(this.scanElapsed(tick) / SCAN_WINDOW) % this.stations.length === this.index;
    }

    private scanView(tick: number): NonNullable<MissionView['scan']> {
        const x = (this.field.left + this.field.right) / 2, y = (this.field.bottom + this.field.top) / 2;
        const elapsed = this.scanElapsed(tick);
        const index = Math.floor(elapsed / SCAN_WINDOW) % this.stations.length;
        const target = this.stations[index];
        const next = this.stations[(index + 1) % this.stations.length];
        const warning = next !== target && elapsed % SCAN_WINDOW >= SCAN_WINDOW - TICK_RATE;
        return { x, y, angle: Math.atan2(target.y - y, target.x - x),
            ...(warning ? { previewAngle: Math.atan2(next.y - y, next.x - x) } : {}) };
    }

    startWork(tick: number): void {
        if (this.ready) return;
        this.waitingForBoss = false;
        this.activatedAt = tick - 1;
    }

    private previousThermal(tick: number): Readonly<Position> | undefined {
        return tick - this.lastActivation <= THERMAL_OVERLAP ? this.stations[this.index - 1] : undefined;
    }

    private updateTemperature(tick: number, player: Readonly<Position>, near: boolean): void {
        const previous = this.previousThermal(tick);
        const warm = near || !!previous && distance(player, previous) <= this.radius;
        if (this.thermalWarm !== warm) {
            this.thermalWarm = warm;
            this.thermalTicks = 0;
        }
        if (++this.thermalTicks < (warm ? THERMAL_RECOVERY : THERMAL_DECAY)) return;
        this.thermalTicks = 0;
        this.temperature = clamp(this.temperature + (warm ? 1 : -1), 0, 6);
    }

    step(tick: number, player: Readonly<Position>, enemies: readonly MissionEnemy[]): MissionCue | undefined {
        const pulled = this.escortUnderPull;
        this.escortUnderPull = false;
        if (!this.ready || this.complete || this.failed) return;
        const { type, variant, windowTicks } = this.directive;
        if (type === 'handoff' && this.index > 0 && tick - this.completedAt > (windowTicks ?? 360)) {
            this.index = 0;
            this.hold = 0;
        }
        const target = this.stations[this.index];
        if (!target) {
            return pulled ? undefined : this.advanceEscort(player);
        }
        const gap = distance(player, target);
        const near = gap <= this.radius;
        const jammed = (this.integrity || type === 'scan') && enemies.some(enemy => enemy.kind === 'jammer'
            && enemy.state === 'dash' && distance(enemy, target) < 52);
        if (this.integrity && enemies.some(enemy => (enemy.kind === 'jammer' || enemy.kind === 'reclaimer')
            && distance(enemy, target) < 25)) this.damage(tick, 'relay');
        if (type === 'thermal') this.updateTemperature(tick, player, near);
        if (near && !jammed && this.scanOpen(tick)) {
            this.away = 0;
            if (++this.hold >= this.holdTicks) {
                this.index++;
                this.hold = 0;
                this.lastActivation = tick;
                if (this.index === 1) this.completedAt = tick;
                if (this.failed) return;
                if (type === 'switch' || type === 'hybrid') return 'power';
                return type === 'handoff' && this.index >= 2 && this.index === this.stations.length ? 'confirm' : 'connect';
            }
        } else if (variant === 'archive' ? ++this.away > 75 : type === 'relay' && variant === undefined && !near) {
            this.hold = 0;
        }
        return undefined;
    }

    tug(tick: number, boss = false): void {
        if (!this.ready || !this.escort || (!boss && this.complete) || this.failed || tick - this.lastObjectiveDamage < 45) return;
        this.damage(tick, 'escort');
        if (!this.complete) this.moveEscortBack(TOW_DISTANCE);
    }

    pullEscort(): void {
        if (!this.ready || !this.escort || this.complete || this.failed || this.escortUnderPull) return;
        this.escortUnderPull = true;
        this.moveEscortBack(TOW_DISTANCE / RECLAIMER_PULL_TICKS);
    }

    finishEscortPull(tick: number): void {
        if (this.ready && this.escort && !this.complete && !this.failed) this.damage(tick, 'escort');
    }

    private moveEscortBack(amount: number): void {
        if (!this.escort) return;
        const previous = this.route[this.waypoint - 1];
        const remaining = distance(this.escort, previous);
        if (remaining < 1) return;
        const ratio = Math.min(amount / remaining, 1);
        this.escort.x += (previous.x - this.escort.x) * ratio;
        this.escort.y += (previous.y - this.escort.y) * ratio;
    }

    interceptableTerminal(): Readonly<Position> | undefined {
        return this.directive.rangedPressure && this.ready && !this.complete && !this.failed ? this.stations[this.index] : undefined;
    }

    relayHit(tick: number, terminal: Readonly<Position>): void {
        if (terminal !== this.interceptableTerminal() || !this.integrity || tick - this.lastRelayShot < 110) return;
        this.lastRelayShot = tick;
        this.damage(tick, 'relay');
    }

    private damage(tick: number, target: 'escort' | 'relay'): void {
        if (tick - this.lastObjectiveDamage < 45) return;
        this.lastObjectiveDamage = tick;
        if (target === 'escort') this.escortHp--;
        else this.relayHp--;
    }

    private liftPort(): Readonly<Position> {
        const anchor = this.route[this.waypoint - 1];
        return { x: clamp(anchor.x + (this.waypoint % 2 ? -66 : 66), this.field.left + 30, this.field.right - 30), y: anchor.y };
    }

    private advanceEscort(player: Readonly<Position>): MissionCue | undefined {
        if (!this.escort) return;
        if (this.gate) {
            if (distance(player, this.liftPort()) <= this.radius && ++this.hold >= 60) {
                this.hold = 0;
                this.gate = 0;
                return 'connect';
            }
            return;
        }
        const next = this.route[this.waypoint];
        if (!next || distance(player, this.escort) > this.escortRadius) return;
        const remaining = distance(this.escort, next);
        const speed = 32 / TICK_RATE;
        if (remaining <= speed) {
            this.escort.x = next.x;
            this.escort.y = next.y;
            this.waypoint++;
            if (this.directive.variant === 'lift' && this.waypoint < this.route.length) this.gate = 1;
            return 'connect';
        }
        this.escort.x += (next.x - this.escort.x) * speed / remaining;
        this.escort.y += (next.y - this.escort.y) * speed / remaining;
        return undefined;
    }
}

const WALL = { kind: 'wall', state: 'closed' } as const;
const ISLAND: TerrainRect = { ...WALL, left: 147, right: 213, bottom: 268, top: 432 };
const ENGINE: TerrainRect = { ...WALL, left: 144, right: 216, bottom: 317, top: 389 };
const EMPTY: readonly TerrainRect[] = Object.freeze([]);
const ENGINE_TERRAIN: readonly TerrainRect[] = Object.freeze([ENGINE]);
export const CONVEYOR_STEP = 26 / TICK_RATE;
const CONVEYOR_REVERSAL = 8 * TICK_RATE;

export function terrainAt(terrain: CampaignEncounter['terrain'], tick: number,
    switched?: number, switching = false, field: CombatBounds = FIELD): readonly TerrainRect[] {
    if (terrain === 'engine') return ENGINE_TERRAIN;
    if (terrain === 'conveyor') {
        const direction = Math.floor(tick / CONVEYOR_REVERSAL) % 2 ? -1 : 1;
        const phase = tick % CONVEYOR_REVERSAL;
        const state = phase >= CONVEYOR_REVERSAL - TICK_RATE ? 'warning' : 'open';
        // Step zero has no travel. The first reverse displacement is applied on the reversal step.
        const cycle = 2 * CONVEYOR_REVERSAL;
        const shifted = (tick + 1) % cycle;
        const travel = (Math.min(shifted, cycle - shifted) - 1) * CONVEYOR_STEP;
        return [{ left: field.left + 14, right: field.right - 14, bottom: 278, top: 314, kind: 'belt', state, direction, travel },
            { left: field.left + 14, right: field.right - 14, bottom: 388, top: 424, kind: 'belt', state, direction: -direction, travel: -travel }];
    }
    if (terrain === 'gates') {
        const changing = switching || switched === undefined && tick % 240 >= 204;
        const rightClosed = (switched ?? Math.floor(tick / 240)) % 2 === 0;
        return [ISLAND,
            { left: field.left, right: ISLAND.left, bottom: 347, top: 359, kind: 'gate',
                state: rightClosed ? changing ? 'warning' : 'open' : 'closed' },
            { left: ISLAND.right, right: field.right, bottom: 347, top: 359, kind: 'gate',
                state: rightClosed ? 'closed' : changing ? 'warning' : 'open' }];
    }
    return EMPTY;
}

export function insideRect(point: Readonly<Position>, rect: TerrainRect, margin = 0): boolean {
    return point.x > rect.left - margin && point.x < rect.right + margin
        && point.y > rect.bottom - margin && point.y < rect.top + margin;
}

function rectEntry(origin: Readonly<Position>, dx: number, dy: number, limit: number, rect: TerrainRect, margin: number): number {
    const left = rect.left - margin, right = rect.right + margin;
    const bottom = rect.bottom - margin, top = rect.top + margin;
    // Like insideRect, clipping uses the open interior. A tangent or a ray travelling along an edge passes.
    if (!dx && (origin.x <= left || origin.x >= right)) return Infinity;
    if (!dy && (origin.y <= bottom || origin.y >= top)) return Infinity;
    const enterX = dx ? ((dx > 0 ? left : right) - origin.x) / dx : -Infinity;
    const exitX = dx ? ((dx > 0 ? right : left) - origin.x) / dx : Infinity;
    const enterY = dy ? ((dy > 0 ? bottom : top) - origin.y) / dy : -Infinity;
    const exitY = dy ? ((dy > 0 ? top : bottom) - origin.y) / dy : Infinity;
    const entry = Math.max(0, enterX, enterY);
    return entry < Math.min(limit, exitX, exitY) ? entry : Infinity;
}

export function clipWarningReach(origin: Readonly<Position>, dx: number, dy: number,
    reach: number, terrain: readonly TerrainRect[]): number {
    return clipTerrainReach(origin, dx, dy, reach, terrain, 0);
}

export function clipTerrainReach(origin: Readonly<Position>, dx: number, dy: number,
    reach: number, terrain: readonly TerrainRect[], margin: number): number {
    let available = reach;
    for (const rect of terrain) {
        if (rect.state === 'closed') available = Math.min(available, rectEntry(origin, dx, dy, available, rect, margin));
    }
    return available;
}

function clearSegment(a: Readonly<Position>, b: Readonly<Position>, blocks: readonly TerrainRect[], margin: number): boolean {
    const dx = b.x - a.x, dy = b.y - a.y;
    return blocks.every(rect => rectEntry(a, dx, dy, 1, rect, margin) === Infinity);
}

export function nearestOpen(point: Readonly<Position>, terrain: readonly TerrainRect[], margin: number, field: CombatBounds = FIELD): Position {
    const clampField = (p: Readonly<Position>) => ({
        x: clamp(p.x, field.left + margin, field.right - margin),
        y: clamp(p.y, field.bottom + margin, field.top - margin),
    });
    const blocks = terrain.filter(rect => rect.state === 'closed');
    const current = clampField(point);
    if (!blocks.some(rect => insideRect(current, rect, margin))) return current;
    const candidates = blocks.flatMap(rect => [
        { x: rect.left - margin, y: current.y }, { x: rect.right + margin, y: current.y },
        { x: current.x, y: rect.bottom - margin }, { x: current.x, y: rect.top + margin },
    ]);
    // Overlapping blockers can make every axial projection on the tapped side invalid.
    if (blocks.length > 1) {
        const xs = blocks.flatMap(rect => [rect.left - margin, rect.right + margin]);
        const ys = blocks.flatMap(rect => [rect.bottom - margin, rect.top + margin]);
        for (const x of xs) for (const y of ys) candidates.push({ x, y });
    }
    let closest: Position | undefined;
    let shortest = Infinity;
    for (const candidate of candidates) {
        const point = clampField(candidate);
        const gap = distance(point, current);
        if (gap >= shortest || blocks.some(rect => insideRect(point, rect, margin))) continue;
        shortest = gap;
        closest = point;
    }
    return closest ?? clampField({ x: 85, y: 235 });
}

export function routeAround(from: Readonly<Position>, destination: Readonly<Position>,
    terrain: readonly TerrainRect[], margin: number, field: CombatBounds = FIELD): Position[] {
    const blocks = terrain.filter(rect => rect.state === 'closed');
    if (clearSegment(from, destination, blocks, margin)) return [{ ...destination }];
    const corners = blocks.flatMap(rect => {
        const left = rect.left - margin, right = rect.right + margin;
        const bottom = rect.bottom - margin, top = rect.top + margin;
        return [{ x: left, y: bottom }, { x: left, y: top }, { x: right, y: bottom }, { x: right, y: top }];
    }).filter(p => p.x >= field.left + margin && p.x <= field.right - margin
        && p.y >= field.bottom + margin && p.y <= field.top - margin
        && blocks.every(rect => !insideRect(p, rect, margin)));
    const nodes = [from, destination, ...corners];
    const cost = nodes.map(() => Infinity);
    const previous = nodes.map(() => -1);
    const visited = nodes.map(() => false);
    cost[0] = 0;
    for (let step = 0; step < nodes.length; step++) {
        let next = -1;
        for (let node = 0; node < nodes.length; node++) {
            if (!visited[node] && (next < 0 || cost[node] < cost[next])) next = node;
        }
        if (next < 0 || !Number.isFinite(cost[next]) || next === 1) break;
        visited[next] = true;
        for (let candidate = 1; candidate < nodes.length; candidate++) {
            if (visited[candidate]) continue;
            if (!clearSegment(nodes[next], nodes[candidate], blocks, margin)) continue;
            const trial = cost[next] + distance(nodes[next], nodes[candidate]);
            if (trial >= cost[candidate]) continue;
            cost[candidate] = trial;
            previous[candidate] = next;
        }
    }
    const route: Position[] = [];
    for (let index = 1; previous[index] >= 0; index = previous[index]) route.unshift({ ...nodes[index] });
    return route;
}
