import { FIELD, START, TICK_RATE } from './content';
import type { CombatBounds } from './content';
import { GATEKEEPER_PORTS, GATEKEEPER_WARNING_TICKS, clamp, distance, distanceToSegment, fieldRayEnd, gatekeeperLane } from './Encounter';
import type { BossVolley, CampaignEncounter, ChapterBossKind, ChapterBossView, ChapterHazard, Mission, MissionCue, MissionPoint, Position } from './Encounter';

const TITLES: Record<ChapterBossKind, string> = {
    supervisor: '分站主管', gatekeeper: '并联守门机', tow: '拖拽回收车',
    silence: '静默阵列', core: '调度核心', elite: '封锁领队',
};
const HEALTH: Record<ChapterBossKind, number> = {
    supervisor: 58, gatekeeper: 92, tow: 104, silence: 110, core: 128, elite: 75,
};
const TAU = Math.PI * 2;
const CORE_TERMINALS = [{ x: 100, y: 358 }, { x: 260, y: 358 }] as const;
type Shape = ChapterHazard extends infer T ? T extends ChapterHazard ? Omit<T, 'state'> : never : never;
const DUEL = {
    supervisor: { speed: 56, standoff: 96, warning: 31, active: 18, opening: 69 },
    elite: { speed: 65, standoff: 86, warning: 31, active: 16, opening: 67 },
    gatekeeper: { speed: 46, standoff: 110, warning: 30, active: 21, opening: 72 },
    tow: { speed: 59, standoff: 104, warning: 33, active: 34, opening: 75 },
    silence: { speed: 45, standoff: 116, warning: 36, active: 26, opening: 78 },
    core: { speed: 52, standoff: 108, warning: 36, active: 27, opening: 73 },
} as const;

function angleOf(point: Readonly<Position>, origin: Readonly<Position>): number {
    return Math.atan2(point.y - origin.y, point.x - origin.x);
}

function hazardCovers(hazard: Shape, point: Readonly<Position>): boolean {
    if (hazard.shape === 'rect') return point.x > hazard.left && point.x < hazard.right
        && point.y > hazard.bottom && point.y < hazard.top;
    if (hazard.shape === 'tether') return distanceToSegment(point, hazard, hazard.end) < hazard.width;
    return distance(point, hazard) < hazard.radius
        && (angleOf(point, hazard) - hazard.from + 2 * TAU) % TAU < hazard.sweep;
}

export class ChapterBoss {
    readonly kind: ChapterBossKind;
    readonly title: string;
    readonly maxHp: number;
    readonly unit: Position & { hp: number };
    private cycle = 0;
    private next = 65;
    private phase: 'idle' | 'warning' | 'active' | 'open' = 'idle';
    private phaseStartedAt = 0;
    private hazard?: Shape;
    private volley?: BossVolley;
    private station?: Position;
    private charge = 0;
    private tick = 0;
    private recoveryUntil = 0;
    private secureTicks = 0;
    private readonly radius = 34;
    private secured = false;
    private stage = 1;
    private ports = 0;
    private damaged = false;
    private facing = -Math.PI / 2;
    private readonly combatOnly: boolean;
    private readonly duel?: CampaignEncounter['bossDuel'];

    constructor(encounter: CampaignEncounter, unit: Position & { hp: number }, private readonly mission?: Mission,
        private readonly field: CombatBounds = FIELD) {
        this.kind = encounter.boss!;
        this.title = encounter.bossTitle ?? TITLES[this.kind];
        this.maxHp = unit.hp = encounter.bossHp ?? HEALTH[this.kind];
        this.unit = unit;
        this.combatOnly = encounter.combatOnly === true;
        this.duel = encounter.bossDuel;
    }

    get complete(): boolean { return this.unit.hp <= 0 && (this.combatOnly || this.kind !== 'core' || this.secured); }
    get vulnerable(): boolean {
        return this.unit.hp > 0 && (this.phase === 'open' || this.kind === 'elite'
            || this.kind === 'core' && this.stage === 3 && this.ports >= 2);
    }

    get view(): ChapterBossView {
        if (this.combatOnly) return this.duelView();
        const offline = this.unit.hp <= 0;
        const core = this.kind === 'core';
        const canTakeOver = core && (!this.mission || this.mission.complete);
        const showingTerminals = core && !offline && this.stage === 3;
        let instruction = this.kind === 'supervisor' ? '绕到主管背后打' : '';
        if (offline) {
            if (canTakeOver) instruction = '到场中央站 3 秒';
            else if (core && this.mission) instruction = this.mission.instruction(this.tick);
            else instruction = '';
        } else if (this.vulnerable) instruction = this.kind === 'elite' ? '' : '装甲开了，趁现在打';
        else if (this.hazard?.shape === 'tether') instruction = '横穿钢缆，把它截断';
        else if (showingTerminals) {
            const action = this.ports === 1 && !this.station ? '去另一端' : '站进亮圈';
            instruction = `旁路 ${this.ports}/2，${action}`;
        } else if (this.station) instruction = '站进亮圈，等进度走完';
        const target = offline ? canTakeOver ? START : undefined : this.station;
        const terminals = showingTerminals ? CORE_TERMINALS.map((point, index): MissionPoint => {
            const state = index < this.ports ? 'complete' : point === this.station ? 'active' : 'waiting';
            return { ...point, state, radius: this.radius, progress: state === 'complete' ? 1 : state === 'active' ? this.charge / 24 : 0 };
        }) : undefined;
        return {
            kind: this.kind, title: this.title, hp: this.unit.hp, maxHp: this.maxHp, stage: this.stage, vulnerable: this.vulnerable,
            recovering: this.phase === 'open' || this.phase === 'idle' && this.tick < this.recoveryUntil,
            phaseStartedAt: this.phaseStartedAt, phaseEndsAt: this.phase === 'idle' && this.tick < this.recoveryUntil ? this.recoveryUntil : this.next,
            instruction,
            ...(!offline && this.hazard && (this.phase === 'warning' || this.phase === 'active')
                ? { hazard: { ...this.hazard, state: this.phase } } : {}),
            ...(terminals ? { terminals } : {}),
            ...(target ? { station: { ...target, radius: this.radius,
                progress: Math.min(1, offline ? this.secureTicks / 90 : this.charge / 24) } } : {}),
        };
    }

    damage(damage: number, from: Readonly<Position>, nailer: boolean): number {
        if (this.vulnerable) return nailer ? damage * 1.5 : damage;
        if (this.combatOnly) {
            if (this.kind === 'supervisor' && Math.cos(angleOf(from, this.unit) - this.facing) < -0.45) return damage;
            return damage * 0.42;
        }
        // The supervisor faces south when protected. Flanking works between openings as well.
        if (this.kind === 'supervisor' && from.y > this.unit.y + 12) return damage;
        return this.kind === 'supervisor' ? damage * 0.25 : 0;
    }

    step(tick: number, player: Readonly<Position>, hurt: () => void, warn: () => void, reinforce: () => void,
        cue?: (kind: MissionCue | 'cut') => void, attack?: () => void,
        fire?: (pattern: BossVolley, facing: number, second: boolean) => void): void {
        this.tick = tick;
        if (this.combatOnly) {
            this.stepDuel(player, hurt, warn, attack, fire);
            return;
        }
        if (this.unit.hp <= 0) {
            if (this.kind === 'core' && !this.secured && (!this.mission || this.mission.complete)) {
                if (distance(START, player) <= this.radius) this.secured = ++this.secureTicks >= 90;
                else this.secureTicks = 0;
            }
            return;
        }
        const nextStage = this.kind === 'core' ? this.unit.hp <= this.maxHp * 0.35 ? 3 : this.unit.hp <= this.maxHp * 0.7 ? 2 : 1
            : this.unit.hp <= this.maxHp / 2 ? 2 : 1;
        if (nextStage !== this.stage) {
            this.stage = nextStage;
            this.enterPhase('idle', tick);
            this.hazard = undefined;
            this.station = undefined;
            this.charge = 0;
            this.next = tick + 15;
            reinforce();
        }
        if (this.phase === 'idle' && tick >= this.next) {
            this.beginAttack(tick, player);
            warn();
        }
        if (this.kind === 'tow' && this.phase === 'warning' && this.hazard?.shape === 'tether') {
            const remaining = Math.max(1, this.next - tick);
            this.unit.x += (this.hazard.x - this.unit.x) / remaining;
            this.unit.y += (this.hazard.y - this.unit.y) / remaining;
        }
        if (this.phase === 'warning' && tick >= this.next) {
            this.enterPhase('active', tick);
            this.next = tick + (this.hazard?.shape === 'tether' ? 60 : 45);
            attack?.();
        }
        if (this.phase === 'active') {
            if (this.hazard?.shape === 'tether' && hazardCovers(this.hazard, player)) {
                cue?.('cut');
                this.open(tick);
            } else if (this.station && distance(this.station, player) <= this.radius) {
                if (++this.charge >= 24) {
                    cue?.(this.kind === 'gatekeeper' ? 'power' : 'connect');
                    if (this.kind === 'core' && this.stage === 3) {
                        this.ports++;
                        this.charge = 0;
                        this.station = undefined;
                        this.next = tick;
                    } else this.open(tick);
                }
            } else if (this.hazard && !this.damaged && hazardCovers(this.hazard, player)) {
                hurt();
                this.damaged = true;
            }
            if (this.phase === 'active' && tick >= this.next) {
                if (this.hazard?.shape === 'tether') this.mission?.tug(tick, true);
                if (this.kind === 'supervisor' || this.kind === 'elite' ||
                    this.kind === 'core' && this.stage === 3 && this.ports >= 2) this.open(tick);
                else {
                    this.enterPhase('idle', tick);
                    this.recoveryUntil = tick + 8;
                    this.station = undefined;
                    this.next = tick + 52;
                }
            }
        }
        if (this.phase === 'open' && tick >= this.next) {
            this.enterPhase('idle', tick);
            this.next = tick + 35;
        }
    }

    private open(tick: number): void {
        this.hazard = undefined;
        this.station = undefined;
        this.enterPhase('open', tick);
        this.charge = 0;
        this.next = tick + (this.kind === 'supervisor' ? 72 : this.kind === 'gatekeeper' ? 120
            : this.kind === 'tow' ? 135 : 150);
    }

    private beginAttack(tick: number, player: Readonly<Position>): void {
        const flank = (this.cycle++ % 2 === 0 ? 1 : -1) * (this.stage === 1 ? 1 : -1);
        this.enterPhase('warning', tick);
        this.charge = 0;
        this.damaged = false;
        this.station = undefined;
        if (this.kind === 'tow' || this.kind === 'core' && this.stage === 2) {
            const end = this.mission?.escort ? { ...this.mission.escort } : { x: 180 + flank * 100, y: 290 };
            const bay = this.kind === 'tow' && this.stage === 2 ? { x: 180 + flank * 72, y: 488 } : this.unit;
            this.hazard = { shape: 'tether', x: bay.x, y: bay.y, end, width: 16 };
            this.next = tick + 33;
            return;
        }
        if (this.kind === 'silence' || this.kind === 'core' && this.stage === 1) {
            // One continuous 120-degree opening makes it possible to cross between adjacent safe sectors.
            const safe = (flank > 0 ? -Math.PI / 4 : -3 * Math.PI / 4);
            this.station = { x: this.unit.x + Math.cos(safe) * 70, y: this.unit.y + Math.sin(safe) * 70 };
            this.hazard = { shape: 'sector', x: this.unit.x, y: this.unit.y, radius: 240,
                from: safe + TAU / 6, sweep: 2 * TAU / 3 };
            this.next = tick + 36;
            return;
        }
        if (this.kind === 'gatekeeper') {
            const safe = flank > 0 ? 'a' : 'b';
            this.station = GATEKEEPER_PORTS[safe];
            this.hazard = gatekeeperLane(safe, this.field);
            this.next = tick + GATEKEEPER_WARNING_TICKS;
            return;
        }
        if (this.kind === 'core' && this.stage === 3 && this.ports < 2) {
            this.station = CORE_TERMINALS[this.ports];
            const { x } = this.station;
            this.hazard = { shape: 'rect', left: x - 22, right: x + 22,
                bottom: this.field.bottom, top: this.station.y - 46 };
            this.next = tick + 36;
            return;
        }
        const horizontal = this.kind === 'core' && this.cycle % 2 === 0;
        this.hazard = horizontal
            ? { shape: 'rect', left: this.field.left, right: this.field.right, bottom: player.y - 23, top: player.y + 23 }
            : { shape: 'rect', left: player.x - 24, right: player.x + 24, bottom: this.field.bottom, top: this.field.top };
        this.next = tick + 31;
    }

    private duelView(): ChapterBossView {
        const offline = this.unit.hp <= 0;
        const phase = this.phase;
        const hazard = !offline && this.hazard && (phase === 'warning' || phase === 'active')
            ? { ...this.hazard, state: phase } : undefined;
        const volley = !offline && this.volley && (phase === 'warning' || phase === 'active')
            ? { pattern: this.volley, state: phase } : undefined;
        let instruction = '';
        if (phase === 'open' && !offline) instruction = this.kind === 'elite' ? '趁它停下打' : '装甲开了，趁现在打';
        else if (hazard?.shape === 'tether') instruction = '离开钢缆的亮线';
        else if (hazard?.shape === 'sector') instruction = '走出扇形亮区';
        else if (hazard?.shape === 'rect') instruction = hazard.left === this.field.left && hazard.right === this.field.right
            ? '往上或往下，离开亮带' : '往左或往右，离开亮带';
        else if (volley) instruction = volley.pattern === 'fan' ? '往旁边躲开炮弹' : '从弹缝穿过去';
        else if (!offline && this.kind === 'supervisor') instruction = '绕到主管背后打';
        return {
            kind: this.kind, title: this.title, hp: this.unit.hp, maxHp: this.maxHp, stage: this.stage,
            vulnerable: this.vulnerable, recovering: phase === 'open', phaseStartedAt: this.phaseStartedAt,
            phaseEndsAt: this.next, instruction, facing: this.facing, ...(hazard ? { hazard } : {}), ...(volley ? { volley } : {}),
        };
    }

    private stepDuel(player: Readonly<Position>, hurt: () => void, warn: () => void, attack?: () => void,
        fire?: (pattern: BossVolley, facing: number, second: boolean) => void): void {
        if (this.unit.hp <= 0) return;
        const timing = DUEL[this.kind];
        const health = this.unit.hp / this.maxHp;
        const stage = this.kind === 'core' ? (health <= 0.35 ? 3 : health <= 0.7 ? 2 : 1) : health <= 0.5 ? 2 : 1;
        if (this.kind !== 'core') this.stage = stage;
        const tick = this.tick;
        if (this.phase === 'idle') {
            const gap = distance(player, this.unit);
            if (gap > 0.01) this.facing = angleOf(player, this.unit);
            // Approach the player between skills, so no stationary Boss is stranded off-camera.
            const step = Math.min(timing.speed / TICK_RATE, gap - timing.standoff);
            if (step > 0) {
                this.unit.x = clamp(this.unit.x + Math.cos(this.facing) * step, this.field.left + 21, this.field.right - 21);
                this.unit.y = clamp(this.unit.y + Math.sin(this.facing) * step, this.field.bottom + 21, this.field.top - 21);
            }
            if (tick >= this.next && gap <= 218) {
                const cycle = this.cycle++;
                const newCoreStage = this.kind === 'core' && stage > this.stage;
                // A damage burst can cross both thresholds during recovery. Introduce each phase with its own attack.
                if (newCoreStage) this.stage = cycle === 0 ? stage : this.stage + 1;
                const volley = this.duel?.volley ?? (this.kind === 'tow' || this.kind === 'silence'
                    || this.kind === 'core' && this.stage > 1 ? 'ring' : 'fan');
                this.volley = cycle % 2 === 0 || newCoreStage ? undefined : volley;
                this.hazard = this.volley ? undefined : this.duelHazard(player, gap, Math.floor(cycle / 2));
                this.damaged = false;
                this.enterPhase('warning', tick);
                this.next = tick + timing.warning - 2 * (this.stage - 1);
                warn();
            }
            return;
        }
        if (this.phase === 'warning' && tick >= this.next) {
            this.enterPhase('active', tick);
            this.next = tick + (this.volley ? 19 : timing.active);
            if (this.volley) fire?.(this.volley, this.facing, false);
            else attack?.();
        }
        if (this.phase === 'active') {
            if (tick >= this.next) {
                // After a low-health volley, chain into the next signature move. Its full wind-up still plays.
                const followUp = this.duel && this.volley && this.stage > 1;
                this.hazard = undefined;
                this.volley = undefined;
                this.enterPhase('open', tick);
                this.next = tick + (followUp ? 22 : this.duel?.opening ?? timing.opening);
            } else if (this.volley && tick - this.phaseStartedAt === 10) {
                fire?.(this.volley, this.facing, true);
            } else if (this.hazard && !this.damaged && hazardCovers(this.hazard, player)) {
                this.damaged = true;
                hurt();
            }
        } else if (this.phase === 'open' && tick >= this.next) {
            this.enterPhase('idle', tick);
            this.next = tick + (this.duel?.rest ?? 21);
        }
    }

    private duelHazard(player: Readonly<Position>, gap: number, cycle: number): Shape {
        if (this.kind === 'tow' || this.kind === 'core' && this.stage === 2) {
            const end = fieldRayEnd(this.unit, Math.cos(this.facing), Math.sin(this.facing), Math.min(250, gap + 54), this.field);
            return { shape: 'tether', x: this.unit.x, y: this.unit.y, end, width: 16 };
        }
        if (this.kind === 'silence' || this.kind === 'core' && this.stage === 1) {
            this.facing += (cycle % 2 ? -1 : 1) * (Math.PI / 6);
            const sweep = 2 * TAU / 3;
            return { shape: 'sector', x: this.unit.x, y: this.unit.y, radius: 240, from: this.facing - sweep / 2, sweep };
        }
        const gate = this.kind === 'gatekeeper';
        const horizontal = this.kind === 'core' ? cycle % 2 === 0 : !gate && Math.abs(Math.cos(this.facing)) > Math.abs(Math.sin(this.facing));
        const halfWidth = gate ? 48 : this.kind === 'core' ? 31 : 24;
        const bias = gate ? (cycle % 2 === 0 ? 16 : -16) : 0;
        const { left, right, bottom, top } = this.field;
        return horizontal
            ? { shape: 'rect', left, right, bottom: Math.max(bottom, player.y - halfWidth), top: Math.min(top, player.y + halfWidth) }
            : { shape: 'rect', left: Math.max(left, player.x + bias - halfWidth), right: Math.min(right, player.x + bias + halfWidth), bottom, top };
    }

    private enterPhase(phase: ChapterBoss['phase'], tick: number): void {
        this.phase = phase;
        this.phaseStartedAt = tick;
    }
}
