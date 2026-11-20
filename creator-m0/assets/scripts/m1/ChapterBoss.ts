import { FIELD, START } from './content';
import { GATEKEEPER_PORTS, GATEKEEPER_WARNING_TICKS, distance, distanceToSegment, gatekeeperLane } from './Encounter';
import type { CampaignEncounter, ChapterBossKind, ChapterBossView, ChapterHazard, Mission, MissionCue, MissionPoint, Position } from './Encounter';

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
    private hazard?: Shape;
    private station?: Position;
    private charge = 0;
    private tick = 0;
    private secureTicks = 0;
    private readonly radius = 34;
    private secured = false;
    private stage = 1;
    private ports = 0;
    private damaged = false;

    constructor(encounter: CampaignEncounter, unit: Position & { hp: number }, private readonly mission?: Mission) {
        this.kind = encounter.boss!;
        this.title = encounter.bossTitle ?? TITLES[this.kind];
        this.maxHp = unit.hp = encounter.bossHp ?? HEALTH[this.kind];
        this.unit = unit;
    }

    get complete(): boolean { return this.unit.hp <= 0 && (this.kind !== 'core' || this.secured); }
    get vulnerable(): boolean {
        return this.unit.hp > 0 && (this.phase === 'open' || this.kind === 'elite'
            || this.kind === 'core' && this.stage === 3 && this.ports >= 2);
    }

    get view(): ChapterBossView {
        const offline = this.unit.hp <= 0;
        const core = this.kind === 'core';
        const canTakeOver = core && (!this.mission || this.mission.complete);
        const showingTerminals = core && !offline && this.stage === 3;
        let instruction = this.kind === 'supervisor' ? '绕到侧后方 · 等发令空窗' : '让开预警 · 接近检修端';
        if (offline) {
            if (canTakeOver) instruction = '在中央接管调度 · 3 秒';
            else if (core && this.mission) instruction = this.mission.instruction(this.tick);
            else instruction = '关底已停机 · 完成作业';
        } else if (this.vulnerable) instruction = '核心暴露 · 趁现在输出';
        else if (this.hazard?.shape === 'tether') instruction = '横切牵引缆 · 拆除锁索';
        else if (showingTerminals) {
            const action = this.ports === 1 && !this.station ? '前往另一端' : '解开核心';
            instruction = `接通旁路 ${this.ports}/2 · ${action}`;
        } else if (this.station) instruction = '靠近亮灯终端 · 打开弱点';
        const target = offline ? canTakeOver ? START : undefined : this.station;
        const terminals = showingTerminals ? CORE_TERMINALS.map((point, index): MissionPoint => {
            const state = index < this.ports ? 'complete' : point === this.station ? 'active' : 'waiting';
            return { ...point, state, radius: this.radius, progress: state === 'complete' ? 1 : state === 'active' ? this.charge / 24 : 0 };
        }) : undefined;
        return {
            kind: this.kind, title: this.title, hp: this.unit.hp, maxHp: this.maxHp, stage: this.stage, vulnerable: this.vulnerable,
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
        // The supervisor faces south when protected. Flanking works between openings as well.
        if (this.kind === 'supervisor' && from.y > this.unit.y + 12) return damage;
        return this.kind === 'supervisor' ? damage * 0.25 : 0;
    }

    step(tick: number, player: Readonly<Position>, hurt: () => void, warn: () => void, reinforce: () => void,
        cue?: (kind: MissionCue | 'cut') => void): void {
        this.tick = tick;
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
            this.phase = 'idle';
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
            this.phase = 'active';
            this.next = tick + (this.hazard?.shape === 'tether' ? 60 : 45);
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
                    this.phase = 'idle';
                    this.station = undefined;
                    this.next = tick + 52;
                }
            }
        }
        if (this.phase === 'open' && tick >= this.next) {
            this.phase = 'idle';
            this.next = tick + 35;
        }
    }

    private open(tick: number): void {
        this.hazard = undefined;
        this.station = undefined;
        this.phase = 'open';
        this.charge = 0;
        this.next = tick + (this.kind === 'supervisor' ? 72 : this.kind === 'gatekeeper' ? 120
            : this.kind === 'tow' ? 135 : 150);
    }

    private beginAttack(tick: number, player: Readonly<Position>): void {
        const flank = (this.cycle++ % 2 === 0 ? 1 : -1) * (this.stage === 1 ? 1 : -1);
        this.phase = 'warning';
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
            this.hazard = gatekeeperLane(safe);
            this.next = tick + GATEKEEPER_WARNING_TICKS;
            return;
        }
        if (this.kind === 'core' && this.stage === 3 && this.ports < 2) {
            this.station = CORE_TERMINALS[this.ports];
            const { x } = this.station;
            this.hazard = { shape: 'rect', left: x - 22, right: x + 22,
                bottom: FIELD.bottom, top: this.station.y - 46 };
            this.next = tick + 36;
            return;
        }
        const horizontal = this.kind === 'core' && this.cycle % 2 === 0;
        this.hazard = horizontal
            ? { shape: 'rect', left: FIELD.left, right: FIELD.right, bottom: player.y - 23, top: player.y + 23 }
            : { shape: 'rect', left: player.x - 24, right: player.x + 24, bottom: FIELD.bottom, top: FIELD.top };
        this.next = tick + 31;
    }
}
