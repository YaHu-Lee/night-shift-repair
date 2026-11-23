import { BASE_PICKUP_RADIUS, ENEMIES, FIELD, M1_RULES, MAGNET_PICKUP_RADIUS, MAGNET_PULSE, PUDDLE_ACTIVE, PUDDLE_CYCLE, PUDDLE_WARNING, START, TICK_RATE, TOOLS, attackReach, combatViewport, hasPair, randomStream, toolTuningStats, waveKillTarget } from './content';
import type { CombatBounds, EnemyId, EquippedTool, ModId, RegularEnemyId, Route, RunRules, SpawnEdge, ToolId, WaveClearSpec, WaveSpec } from './content';
import { resolveEquipment } from './Equipment';
import type { EquipmentState, ResolvedEquipment, WeaponEquipmentStats } from './Equipment';
import { CONVEYOR_STEP, GATEKEEPER_PORTS, GATEKEEPER_WARNING_TICKS, Mission, RECLAIMER_PULL_TICKS, clamp, clipTerrainReach, distance, distanceToSegment, fieldRayEnd, gatekeeperLane, insideRect, nearestOpen, routeAround, terrainAt } from './Encounter';
import type { BlueprintId, ChapterBossView, ChapterHazard, ChallengeMode, MissionCue, MissionFailure, MissionState, MissionView, Position, TerrainRect } from './Encounter';
import { ChapterBoss } from './ChapterBoss';
import { MELEE_RETURN_TICKS, circleContact, createMeleeMotion, isMeleeTool, updateMeleePath, weaponDock } from './WeaponMotion';
import type { MeleeMotion, MeleeTool } from './WeaponMotion';

export type { Position } from './Encounter';
interface Enemy extends Position {
    id: number;
    kind: EnemyId;
    hp: number;
    state: 'walk' | 'warn' | 'dash';
    next: number;
    vx: number;
    vy: number;
    marked: boolean;
    facingX?: number;
    facingY?: number;
    nextShift?: number;
    sprintTicks?: number;
    revealedAt?: number;
    aimPort?: Readonly<Position>;
    tether?: Readonly<Position>;
    tetherHit?: boolean;
    contactAt?: number;
    hitAt?: number;
    shotAt?: number;
}
interface Bullet extends Position { vx: number; vy: number; port?: Readonly<Position> }
interface Spawn extends Position { kind: RegularEnemyId; at: number }
type SkillKind = 'arc' | 'shot' | 'heat' | 'magnet' | 'induction';
const WEAPON_ATTACK_CUES: Record<ToolId, SkillKind> = {
    wrench: 'arc', arc_gun: 'arc', bypass_wrench: 'arc', riveter: 'shot', hydraulic_nailer: 'shot', split_probe: 'shot',
    torch: 'heat', pulse_nozzle: 'heat', induction: 'induction', traction_coil: 'magnet',
};
type Area = Position & (
    { shape: 'circle'; kind: 'magnet' | 'induction'; radius: number } |
    { shape: 'strip'; kind: 'shot'; ux: number; uy: number; length: number; halfWidth: number } |
    { shape: 'sector'; kind: 'heat'; ux: number; uy: number; radius: number; slope: number }
);
export type Attack = { life: number; sourceCast?: WeaponCast } & (Area |
    (Position & { shape: 'link'; kind: 'arc'; from: Position; fromWeapon?: true; melee?: true }) |
    (Position & { shape: 'impact'; kind: Exclude<SkillKind, 'arc'>; pullFrom?: Position }));

export interface WeaponCast extends Readonly<Position> {
    readonly tool: ToolId;
    readonly slot: number;
    readonly ux: number;
    readonly uy: number;
    readonly targetRange: number;
    readonly tick: number;
    readonly melee?: MeleeMotion;
}

export type MeleeWindup = Pick<WeaponCast, 'slot' | 'ux' | 'uy'> & {
    readonly tool: 'wrench' | 'bypass_wrench';
    readonly ageTicks: number;
};

const WEAPON_CAST_HISTORY = 16;
const MELEE_WINDUP_TICKS = 4;

function covers(area: Area, position: Position): boolean {
    const dx = position.x - area.x, dy = position.y - area.y;
    if (area.shape === 'circle') return Math.hypot(dx, dy) < area.radius;
    const forward = dx * area.ux + dy * area.uy;
    const lateral = Math.abs(dx * area.uy - dy * area.ux);
    if (forward <= 0) return false;
    return area.shape === 'strip' ? forward < area.length && lateral < area.halfWidth
        : Math.hypot(dx, dy) < area.radius && lateral < forward * area.slope;
}
interface ToolRuntime {
    next: number;
    heat: number;
    combo: number;
    lastInMelee: number;
    cooling: boolean;
    reach: number;
    interval: number;
    swings: number;
    equipment?: WeaponEquipmentStats;
}
interface ActiveMelee {
    cast: WeaponCast & { readonly melee: MeleeMotion; readonly tool: MeleeTool };
    damage: (enemy: Enemy, center: Readonly<Position>) => number;
    bonus: number;
    marks: boolean;
    arcLink: boolean;
    struck: Set<Enemy>;
    landed: boolean;
}
type BossAttack = 'sweep' | 'charge' | 'summon';
export type HitSource = EnemyId | 'projectile' | 'boss-sweep' | 'boss-charge' | 'live-puddle' | 'chapter-hazard';
export type TimeoutDetail = 'objective' | 'boss' | 'holdout' | 'takeover';
export const HIT_SOURCES: readonly HitSource[] = [...Object.keys(ENEMIES) as EnemyId[],
    'projectile', 'boss-sweep', 'boss-charge', 'live-puddle', 'chapter-hazard'];
export interface LivePuddle extends Position {
    readonly radius: number;
    readonly phase: 'warning' | 'active';
}
export interface BossState {
    unit: Enemy;
    phase: 'patrol' | 'warning' | 'sweep' | 'charge' | 'recover';
    attack: BossAttack;
    next: number;
    pattern: number;
    attackNumber: number;
    attackAt?: number;
    damagedPlayer: boolean;
}

const SPAWN_WARNING = 22;
const NO_PUDDLES: readonly LivePuddle[] = [];
const SPEED = 156 / TICK_RATE;
const CHARGER_DASH_SPEED = 7.6;
const CHARGER_DASH_TICKS = 18;
export const CHARGER_DASH_TRAVEL = CHARGER_DASH_SPEED * CHARGER_DASH_TICKS;
export const ENEMY_FIELD_MARGIN = 7;
const PLAYER_MARGIN = 10;
const MAX_ENEMIES = 36;
const MAX_BULLETS = 40;
export const ENEMY_HIT_POSE_TICKS = 6;
export const BOSS_SWEEP_REACH = 230;
export const BOSS_CHARGE_SPEED = 8;
export const BOSS_CHARGE_TICKS = 23;

export class Battle {
    readonly field: CombatBounds;
    readonly player: Position & { hp: number; invulnerableUntil: number; hurtAt?: number };
    destination: Position | null = null;
    readonly enemies: Enemy[] = [];
    readonly defeatedEnemies: Enemy[] = [];
    readonly bullets: Bullet[] = [];
    readonly parts: Position[] = [];
    readonly warnings: Spawn[] = [];
    readonly effects: Attack[] = [];
    readonly weaponCasts: WeaponCast[] = [];
    private readonly activeMelee: ActiveMelee[] = [];
    readonly triggers = { arc: 0, magnet: 0, heat: 0 };
    readonly duration: number;
    readonly boss: BossState | null;
    private readonly encounterBoss?: ChapterBoss;
    private readonly task?: Mission;
    private readonly blueprint?: BlueprintId;
    private readonly mode: ChallengeMode;
    private readonly roster: readonly RegularEnemyId[];
    private readonly enemyCap: number;
    private readonly killTarget?: number;
    private terrain: readonly TerrainRect[] = [];
    private navRoute: Position[] = [];
    private navGoal: Position | null = null;
    readonly spec: WaveSpec;
    readonly salvageRate: number;
    readonly maxHp: number;
    readonly equipment?: ResolvedEquipment;
    tick = 0;
    damageTaken = 0;
    shielded: boolean;
    collected = 0;
    magnetCharge = 0;
    kills = 0;
    lastHit: HitSource | null = null;
    warningSerial = 0;
    warningKind: 'warning' | 'charge' = 'warning';
    enemyAttackSerial = 0;
    enemyAttackCue: 'melee' | 'projectile' | 'area' = 'melee';
    weaponImpactSerial = 0;
    cutSerial = 0;
    missionCue: Readonly<{ kind: MissionCue }> | null = null;
    heatRecovered = false;
    moved = false;
    weaponAttackSerial = 0;
    weaponAttackCue: SkillKind = 'arc';
    playerAttack?: { readonly tick: number; readonly x: number; readonly y: number };
    playerAttackTool?: ToolId;
    playerHit?: Readonly<Position>;
    playerPulseAt?: number;
    private nextEnemy = 1;
    private gatekeeperPractice?: { until: number; warning: ChapterHazard };
    private turretResumeAt = 0;
    private spawnCursor = 0;
    private liftGroupIndex = 0;
    private liftSpawnCursor = 0;
    private nextLiftSpawn = 0;
    private escalationSince = 0;
    private nextEscalationSpawn = 0;
    private reserveCursor = 0;
    private readonly random: () => number;
    private readonly runtime: ToolRuntime[];
    private readonly magnet: boolean;
    private readonly arc: boolean;
    private readonly heat: boolean;
    private readonly pickupRadius: number;
    private readonly moveScale: number;
    private readonly mods = new Set<ModId>();

    constructor(readonly wave: number, seed: number, readonly tools: readonly EquippedTool[], readonly rules: RunRules = M1_RULES,
        options: { readonly blueprint?: BlueprintId; readonly mode?: ChallengeMode; readonly mission?: MissionState;
            readonly equipment?: EquipmentState; readonly route?: Route } = {}) {
        this.field = rules.field ?? FIELD;
        this.equipment = options.equipment ? resolveEquipment(tools, options.equipment, options.route ?? 'arc',
            rules.maxHp, options.blueprint) : undefined;
        const actor = this.equipment?.actor;
        this.maxHp = actor?.maxHp ?? rules.maxHp;
        this.player = { ...START, hp: this.maxHp, invulnerableUntil: 0 };
        this.spec = rules.waves[wave];
        this.duration = this.spec.seconds * TICK_RATE;
        this.killTarget = waveKillTarget(this.spec);
        this.random = randomStream(seed ^ Math.imul(wave + 1, 0x58a86197));
        this.runtime = tools.map((tool, index) => {
            const equipment = this.equipment?.weapons[index];
            const { reach, interval } = equipment ?? toolTuningStats(tool);
            return { next: 0, heat: 0, combo: 0, lastInMelee: -Infinity, cooling: false,
                reach: attackReach(tool.id, reach, rules.sweptMelee), interval, swings: 0, equipment };
        });
        this.magnet = actor?.pulse ?? hasPair(tools, 'magnet');
        this.arc = hasPair(tools, 'arc');
        this.heat = hasPair(tools, 'heat');
        for (const tool of tools) for (const mod of tool.mods) this.mods.add(mod);
        this.blueprint = options.blueprint;
        this.mode = options.mode ?? 'normal';
        this.roster = !rules.campaignPressure && this.mode !== 'normal' && wave === 2
            ? [...this.spec.enemies, 'armored'] : this.spec.enemies;
        this.enemyCap = rules.encounter?.enemyCap ?? MAX_ENEMIES;
        if (this.spec.directive) this.task = new Mission(this.spec.directive, options.mission, this.field);
        this.terrain = this.updateTerrain();
        if (this.terrain.length) Object.assign(this.player, nearestOpen(this.player, this.terrain, PLAYER_MARGIN, this.field));
        else this.keepInField(this.player, PLAYER_MARGIN);
        this.pickupRadius = actor?.pickupRadius ?? ((this.mods.has('ring') ? MAGNET_PICKUP_RADIUS : BASE_PICKUP_RADIUS)
            + (this.mods.has('sweeper') ? 11 : 0)) * (this.blueprint === 'magnetic_pickup_arm' ? 1.25 : 1);
        this.moveScale = actor?.moveScale ?? (this.mods.has('bearings') ? 1.12 : 1);
        this.shielded = actor?.shield ?? this.mods.has('plate');
        this.salvageRate = actor?.salvageRate ?? ((this.blueprint === 'magnetic_pickup_arm' ? 0.35 : 0.5) + (this.mods.has('sorter') ? 0.25 : 0));
        if (this.spec.boss) {
            const unit: Enemy = {
                x: START.x, y: this.spawnBounds.top - 43, id: this.nextEnemy++, kind: 'inspector', hp: ENEMIES.inspector.hp,
                state: 'walk', next: 0, vx: 0, vy: -1, marked: false,
            };
            if (this.terrain.length) Object.assign(unit, nearestOpen(unit, this.terrain, 21, this.field));
            else this.keepInField(unit, 21);
            this.enemies.push(unit);
            this.boss = { unit, phase: 'patrol', attack: 'sweep', next: 58, pattern: 0, attackNumber: 0, damagedPlayer: false };
            if (rules.encounter?.boss) this.encounterBoss = new ChapterBoss(rules.encounter, unit, this.task, this.field);
        } else this.boss = null;
    }

    get bossDefeated(): boolean { return this.encounterBoss?.complete ?? (this.boss !== null && this.boss.unit.hp <= 0); }
    get objectiveFailed(): boolean { return this.task?.failed === true; }
    get objectiveFailure(): MissionFailure | undefined { return this.task?.failure; }
    get clearProgress(): { kills: number; total: number } | undefined {
        return this.killTarget === undefined ? undefined : { kills: this.kills, total: this.killTarget };
    }
    get unfinishedAtTimeout(): TimeoutDetail {
        const bossAlive = (this.boss?.unit.hp ?? 0) > 0;
        if (this.task && !this.task.complete && (this.task.ready || !bossAlive)) return 'objective';
        if (bossAlive) return 'boss';
        return this.boss && !this.bossDefeated ? 'takeover' : 'holdout';
    }
    get waveCleared(): boolean {
        if (this.player.hp <= 0 || this.objectiveFailed || this.task && !this.task.complete) return false;
        if (this.boss) return this.bossDefeated;
        if (this.killTarget !== undefined) return this.kills === this.killTarget && !this.warnings.length && !this.enemies.length;
        const target = this.spec.escalation?.requiredTicks;
        if (target && (!this.escalationSince || this.tick - this.escalationSince < target)) return false;
        return this.tick >= (this.spec.directive?.minTicks ?? this.duration);
    }
    get finished() {
        return this.player.hp <= 0 || this.objectiveFailed || (this.killTarget === undefined && this.tick >= this.duration) || this.waveCleared;
    }
    get mission(): MissionView | null {
        const view = this.task?.view(this.tick);
        const target = this.spec.escalation?.requiredTicks;
        if (!target || this.task && !this.task.complete || this.finished) return view ?? null;
        const elapsed = this.escalationSince ? Math.min(target, this.tick - this.escalationSince) : 0;
        return {
            status: 'working', label: this.escalationSince ? `再撑 ${Math.ceil((target - elapsed) / TICK_RATE)} 秒`
                : '下一批敌机快到了',
            points: view?.points ?? [], progress: elapsed / target,
            ...(view?.escort ? { escort: view.escort } : {}), ...(view?.integrity ? { integrity: view.integrity } : {}),
            ...(view?.lift ? { lift: view.lift } : {}),
        };
    }
    get missionState(): MissionState | undefined { return this.task?.snapshot(); }
    get terrainRects(): readonly TerrainRect[] { return this.terrain; }
    get spawnBounds(): CombatBounds {
        return this.field === FIELD ? FIELD : combatViewport(this.field, this.player.x, this.player.y);
    }
    get chapterBoss(): ChapterBossView | null { return this.encounterBoss?.view ?? null; }

    /** Local pose cue for scheduled melee attacks with a valid target in reach. */
    meleeWindups(): readonly MeleeWindup[] {
        const windups: MeleeWindup[] = [];
        this.tools.forEach(({ id: tool }, slot) => {
            if (tool !== 'wrench' && tool !== 'bypass_wrench') return;
            const { next, reach } = this.runtime[slot];
            const remaining = next - this.tick;
            if (remaining <= 0 || remaining > MELEE_WINDUP_TICKS) return;
            const target = this.swingTarget(slot, reach);
            if (!target) return;
            const range = distance(this.player, target) || 1;
            windups.push({ tool, slot, ux: (target.x - this.player.x) / range, uy: (target.y - this.player.y) / range,
                ageTicks: MELEE_WINDUP_TICKS - remaining });
        });
        return windups;
    }
    get practiceWarning(): ChapterHazard | undefined {
        const practice = this.gatekeeperPractice;
        return practice && this.tick < practice.until ? practice.warning : undefined;
    }
    get searchlight(): (Readonly<Position> & { readonly angle: number; readonly width: number; readonly reach: number }) | null {
        if (this.rules.encounter?.combatOnly) return null;
        if (!this.roster.includes('ambusher') && !this.spec.escalation?.enemies.includes('ambusher')) return null;
        const cycle = (this.tick % 240) / 120;
        const turn = cycle <= 1 ? cycle : 2 - cycle;
        return { x: (this.field.left + this.field.right) / 2, y: this.field.top, angle: -Math.PI / 2 + (2 * turn - 1) * 1.35,
            width: 0.44, reach: this.field.top - this.field.bottom + 30 };
    }

    get livePuddles(): readonly LivePuddle[] {
        if (!this.spec.livePuddles || this.tick < 30) return NO_PUDDLES;
        const result: LivePuddle[] = [];
        for (const puddle of this.spec.livePuddles) {
            const elapsed = this.tick - 30 - puddle.offset;
            if (elapsed < 0) continue;
            const phaseTick = elapsed % PUDDLE_CYCLE;
            if (phaseTick >= PUDDLE_WARNING + PUDDLE_ACTIVE) continue;
            result.push({ x: puddle.x, y: puddle.y, radius: puddle.radius,
                phase: phaseTick < PUDDLE_WARNING ? 'warning' : 'active' });
        }
        return result;
    }

    moveTo(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.destination = nearestOpen({ x, y }, this.terrain, PLAYER_MARGIN, this.field);
        this.navGoal = null;
    }

    private movePlayer(inputX: number, inputY: number): void {
        const speed = SPEED * this.moveScale;
        const destination = this.destination;
        if (destination && this.terrain.length && destination !== this.navGoal) {
            this.navRoute = routeAround(this.player, destination, this.terrain, PLAYER_MARGIN, this.field);
            this.navGoal = destination;
        }
        const target = this.terrain.length ? destination && this.navRoute[0] : destination;
        if (target) {
            const remaining = distance(this.player, target);
            if (remaining <= speed) {
                this.player.x = target.x;
                this.player.y = target.y;
                if (this.terrain.length) this.navRoute.shift();
                if (!this.navRoute.length) this.destination = null;
            } else {
                this.player.x += (target.x - this.player.x) * speed / remaining;
                this.player.y += (target.y - this.player.y) * speed / remaining;
            }
            return;
        }
        const axisX = Number.isFinite(inputX) ? clamp(inputX, -1, 1) : 0;
        const axisY = Number.isFinite(inputY) ? clamp(inputY, -1, 1) : 0;
        const magnitude = Math.max(1, Math.hypot(axisX, axisY));
        this.player.x += speed * axisX / magnitude;
        this.player.y += speed * axisY / magnitude;
        this.keepInField(this.player, PLAYER_MARGIN);
    }

    step(inputX: number, inputY: number): void {
        if (this.finished) return;
        this.tick++;
        while (this.defeatedEnemies.length && this.tick - this.defeatedEnemies[0].hitAt! >= ENEMY_HIT_POSE_TICKS) {
            this.defeatedEnemies.shift();
        }
        while (this.weaponCasts.length && this.tick - this.weaponCasts[0].tick >= WEAPON_CAST_HISTORY) {
            this.weaponCasts.shift();
        }
        const nextTerrain = this.updateTerrain();
        if (nextTerrain.some((rect, index) => (rect.state === 'closed') !== (this.terrain[index]?.state === 'closed'))) {
            Object.assign(this.player, nearestOpen(this.player, nextTerrain, PLAYER_MARGIN, this.field));
            if (this.destination) this.destination = nearestOpen(this.destination, nextTerrain, PLAYER_MARGIN, this.field);
            this.navGoal = null;
        }
        this.terrain = nextTerrain;
        const x = this.player.x, y = this.player.y;
        const steering = this.destination !== null || Math.abs(inputX) + Math.abs(inputY) > 0;
        this.movePlayer(inputX, inputY);
        this.applyTerrain(this.player, PLAYER_MARGIN);
        if (steering && Math.hypot(this.player.x - x, this.player.y - y) > 0.02) this.moved = true;
        this.spawn();
        const priorEnemies = this.activeMelee.length
            ? new Map(this.enemies.map(enemy => [enemy, { x: enemy.x, y: enemy.y }])) : undefined;
        this.moveEnemies();
        this.moveBullets();
        if (this.livePuddles.some((puddle) => puddle.phase === 'active' && distance(puddle, this.player) < puddle.radius)) {
            this.hurt('live-puddle');
        }
        if (this.player.hp <= 0) return;
        if (priorEnemies) this.advanceMelee(priorEnemies, { x, y });
        this.tools.forEach((tool, index) => {
            const firstEffect = this.effects.length;
            const nextCast = this.weaponCasts.length;
            this.fire(tool, this.runtime[index], index);
            const cast = this.weaponCasts[nextCast];
            if (!cast) return;
            for (let effect = firstEffect; effect < this.effects.length; effect++) {
                this.effects[effect].sourceCast = cast;
            }
        });
        this.collect();
        if (!this.boss || this.boss.unit.hp <= 0) this.task?.startWork(this.tick);
        const missionCue = this.task?.step(this.tick, this.player, this.enemies);
        if (missionCue) this.emitMissionCue(missionCue);
        this.encounterBoss?.step(this.tick, this.player, () => {
            const hit = this.hurt('chapter-hazard');
            const hazard = hit && this.rules.encounter?.combatOnly ? this.chapterBoss?.hazard : undefined;
            if (hazard?.shape === 'tether') this.pullPlayer(hazard, 22);
        },
            () => this.signalWarning('warning'), () => {
                this.queueSpawn('crawler');
                this.queueSpawn(this.encounterBoss!.kind === 'silence' ? 'jammer' : 'charger');
            }, cue => {
                if (cue === 'cut') this.cutSerial++;
                else this.emitMissionCue(cue);
            }, () => this.signalEnemyAttack('area'));
        for (let index = this.effects.length - 1; index >= 0; index--) {
            if (--this.effects[index].life === 0) this.effects.splice(index, 1);
        }
    }

    private updateTerrain(): readonly TerrainRect[] {
        const terrain = this.rules.encounter?.terrain;
        const switched = terrain === 'gates' && this.spec.directive?.type === 'switch' &&
            this.spec.directive.variant === 'bypass' ? this.task : undefined;
        if (!switched) return terrainAt(terrain, this.tick, undefined, false, this.field);
        const waiting = this.tick - switched.lastActivation < 30;
        return terrainAt(terrain, this.tick, switched.completedStations - (waiting ? 1 : 0), waiting, this.field);
    }

    private applyTerrain(position: Position, margin: number): void {
        if (!this.terrain.length) return;
        for (const rect of this.terrain) {
            if (rect.kind === 'belt' && rect.direction && insideRect(position, rect)) {
                position.x += rect.direction * CONVEYOR_STEP;
            }
        }
        Object.assign(position, nearestOpen(position, this.terrain, margin, this.field));
    }

    private keepInField(position: Position, margin: number): void {
        position.x = clamp(position.x, this.field.left + margin, this.field.right - margin);
        position.y = clamp(position.y, this.field.bottom + margin, this.field.top - margin);
    }

    private spawn(): void {
        if (this.spec.clear) this.spawnClearWave(this.spec.clear);
        else this.spawnTimedWave();
        while (this.warnings.length && this.warnings[0].at <= this.tick) {
            const warning = this.warnings.shift()!;
            const { x, y, kind } = warning;
            if (distance(warning, this.player) < 55) {
                // A spawn in a finite roster keeps its quota when the player runs onto its warning.
                if (this.spec.clear && !this.queueSpawn(kind)) this.insertWarning({ ...warning, at: this.tick + SPAWN_WARNING });
                continue;
            }
            this.enemies.push({ x, y, kind, id: this.nextEnemy++, hp: ENEMIES[kind].hp,
                state: kind === 'ambusher' ? 'warn' : 'walk',
                next: this.tick + 48, vx: 0, vy: 0, marked: false,
                facingX: kind === 'armored' ? 0 : undefined, facingY: kind === 'armored' ? -1 : undefined });
        }
    }

    private spawnClearWave(clear: WaveClearSpec): void {
        const wave = this.spec;
        if (wave.liftGroups && this.task?.ready) this.spawnLiftGroup(wave.liftGroups);
        if (this.spawnCursor < clear.opening && (this.tick - 1) % wave.spawnEvery === 0) {
            if (this.queueSpawn(this.roster[this.spawnCursor % this.roster.length], this.spawnEdge(wave.spawnEdges))) this.spawnCursor++;
        }
        const reserves = wave.escalation;
        if (!reserves || this.reserveCursor >= clear.reserves) return;
        if (!this.escalationSince) {
            if (this.spawnCursor < clear.opening || this.liftGroupIndex < (wave.liftGroups?.length ?? 0)
                || this.warnings.length || this.enemies.length || this.task && !this.task.complete
                || this.tick < (clear.reserveAfterTick ?? 0)) return;
            this.escalationSince = this.tick;
            this.signalWarning('warning');
        }
        if (this.tick >= this.nextEscalationSpawn) {
            if (this.queueSpawn(reserves.enemies[this.reserveCursor % reserves.enemies.length],
                this.spawnEdge(reserves.spawnEdges, this.reserveCursor))) this.reserveCursor++;
            this.nextEscalationSpawn = this.tick + (reserves.spawnEvery ?? wave.spawnEvery);
        }
    }

    private spawnTimedWave(): void {
        const wave = this.spec;
        const escalation = wave.escalation;
        if (escalation && !this.escalationSince && this.tick >= escalation.atTick && (!this.task || this.task.complete)) {
            this.escalationSince = this.tick;
            this.nextEscalationSpawn = this.tick;
            this.spawnCursor = 0;
            this.signalWarning('warning');
        }
        if (escalation && this.escalationSince && this.tick >= this.nextEscalationSpawn) {
            if (escalation.enemies.length && this.queueSpawn(escalation.enemies[this.spawnCursor % escalation.enemies.length],
                this.spawnEdge(escalation.spawnEdges))) this.spawnCursor++;
            this.nextEscalationSpawn = this.tick + (escalation.spawnEvery ?? wave.spawnEvery);
        } else if (!this.escalationSince && wave.liftGroups && this.task?.ready) {
            this.spawnLiftGroup(wave.liftGroups);
        } else if (!this.escalationSince && wave.spawnEvery > 0 && this.roster.length && (this.tick - 1) % wave.spawnEvery === 0) {
            if (this.queueSpawn(this.roster[this.spawnCursor % this.roster.length], this.spawnEdge(wave.spawnEdges))) this.spawnCursor++;
        }
        if (!this.rules.campaignPressure && this.mode === 'overtime_2' && this.wave === 4 && this.tick % 150 === 0) {
            this.queueSpawn(this.tick % 300 ? 'charger' : 'turret');
        }
    }

    private spawnLiftGroup(groups: NonNullable<WaveSpec['liftGroups']>): void {
        const group = groups[this.liftGroupIndex];
        if (!group || (this.task?.liftFloor ?? 0) < group.floor) return;
        const allQueued = this.liftSpawnCursor >= group.enemies.length;
        if ((this.liftSpawnCursor === 0 || allQueued) &&
            (this.warnings.length || this.enemies.some(enemy => enemy !== this.boss?.unit && enemy.hp > 0))) return;
        if (allQueued) {
            this.liftGroupIndex++;
            this.liftSpawnCursor = 0;
            return;
        }
        if (this.tick >= this.nextLiftSpawn) {
            if (this.queueSpawn(group.enemies[this.liftSpawnCursor])) this.liftSpawnCursor++;
            this.nextLiftSpawn = this.tick + this.spec.spawnEvery;
        }
    }

    private spawnEdge(edges: readonly SpawnEdge[] | undefined, cursor = this.spawnCursor): SpawnEdge | undefined {
        return edges?.length ? edges[cursor % edges.length] : undefined;
    }

    private queueSpawn(kind: RegularEnemyId, preferredEdge?: SpawnEdge): boolean {
        const cap = this.encounterBoss?.kind === 'core' && this.encounterBoss.view.stage === 3 ? 8 : this.enemyCap;
        if (this.enemies.length + this.warnings.length >= cap) return false;
        if (kind === 'ambusher' && this.warnings.filter(warning => warning.kind === kind).length +
            this.enemies.filter(enemy => enemy.kind === kind && enemy.state === 'warn').length >= 2) return false;
        const roll = this.random();
        const { left, right, bottom, top } = this.spawnBounds;
        const x = left + 12 + roll * (right - left - 24);
        const y = bottom + 12 + roll * (top - bottom - 24);
        const spots = [
            { x, y: bottom + 10, edge: 'south' }, { x, y: top - 10, edge: 'north' },
            { x: left + 10, y, edge: 'west' }, { x: right - 10, y, edge: 'east' },
        ].filter((position) => distance(position, this.player) >= 115
            && !this.terrain.some(rect => rect.state === 'closed' && insideRect(position, rect, 7)));
        const randomSpot = spots[Math.floor(this.random() * spots.length)];
        const position = preferredEdge ? spots.find(spot => spot.edge === preferredEdge) ?? randomSpot : randomSpot;
        if (!position) return false;
        const at = Math.max(this.tick + SPAWN_WARNING, kind === 'turret' ? this.turretResumeAt : 0);
        this.insertWarning({ x: position.x, y: position.y, at, kind });
        return true;
    }

    private insertWarning(warning: Spawn): void {
        const last = this.warnings[this.warnings.length - 1];
        this.warnings.push(warning);
        if (last && last.at > warning.at) this.warnings.sort((a, b) => a.at - b.at);
    }

    private emitMissionCue(kind: MissionCue): void {
        this.missionCue = { kind };
        if (kind !== 'power' || this.rules.encounter?.boss !== 'gatekeeper') return;
        this.turretResumeAt = this.tick + 2 * TICK_RATE;
        for (const warning of this.warnings) {
            if (warning.kind === 'turret') warning.at = Math.max(warning.at, this.turretResumeAt);
        }
        this.warnings.sort((a, b) => a.at - b.at);
        const port = this.task?.stations[0];
        if (!this.gatekeeperPractice && this.spec.directive?.powerDrill && port && this.task?.completedStations === 1) {
            const safe = distance(port, GATEKEEPER_PORTS.a) <= distance(port, GATEKEEPER_PORTS.b) ? 'a' : 'b';
            this.gatekeeperPractice = { until: this.tick + GATEKEEPER_WARNING_TICKS,
                warning: { ...gatekeeperLane(safe, this.field), state: 'warning' } };
            this.signalWarning('warning');
        }
    }

    private signalWarning(kind: 'warning' | 'charge'): void {
        this.warningKind = kind;
        this.warningSerial++;
    }

    private signalEnemyAttack(kind: Battle['enemyAttackCue']): void {
        this.enemyAttackCue = kind;
        this.enemyAttackSerial++;
    }

    private enemyContact(enemy: Enemy): void {
        if (!this.hurt(enemy.kind)) return;
        enemy.contactAt = this.tick;
        if (enemy.state !== 'dash') this.signalEnemyAttack('melee');
    }

    private moveEnemies(): void {
        for (const enemy of this.enemies) {
            if (enemy.kind === 'inspector') {
                if (!this.encounterBoss) this.moveBoss();
                continue;
            }
            if (enemy.kind === 'pursuer' || enemy.kind === 'reclaimer' || enemy.kind === 'jammer' || enemy.kind === 'ambusher') {
                this.moveSpecialEnemy(enemy);
                const visible = enemy.kind !== 'ambusher' || enemy.state !== 'warn' && this.tick >= (enemy.revealedAt ?? this.tick) + 8;
                if (visible && distance(enemy, this.player) < 15) this.enemyContact(enemy);
                continue;
            }
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const range = Math.hypot(dx, dy);
            const length = Math.max(1, range);
            if (enemy.kind === 'charger' && enemy.state === 'warn' && this.tick >= enemy.next) {
                enemy.state = 'dash';
                enemy.next = this.tick + CHARGER_DASH_TICKS - 1;
                this.signalEnemyAttack('melee');
            }
            if (enemy.state === 'dash') {
                enemy.x += enemy.vx * CHARGER_DASH_SPEED;
                enemy.y += enemy.vy * CHARGER_DASH_SPEED;
                if (this.tick >= enemy.next) {
                    enemy.state = 'walk';
                    enemy.next = this.tick + 55;
                }
            } else if (enemy.state === 'walk') {
                if (enemy.kind === 'charger' && range < 175 && this.tick >= enemy.next) {
                    enemy.state = 'warn';
                    this.signalWarning('charge');
                    enemy.next = this.tick + 22;
                    enemy.vx = dx / length;
                    enemy.vy = dy / length;
                } else if (enemy.kind === 'turret') {
                    const terminal = this.task?.interceptableTerminal();
                    const port = terminal && distance(this.player, terminal) <= 52 ? terminal : undefined;
                    const aim = port ?? this.player;
                    const aimRange = distance(enemy, aim);
                    if (aimRange < 195 && this.tick >= enemy.next) {
                        enemy.aimPort = port;
                        enemy.state = 'warn';
                        this.signalWarning('warning');
                        enemy.next = this.tick + 21;
                        enemy.vx = (aim.x - enemy.x) / Math.max(aimRange, 1);
                        enemy.vy = (aim.y - enemy.y) / Math.max(aimRange, 1);
                    } else if (aimRange >= 195) {
                        this.walkToward(enemy, aim, ENEMIES.turret.speed / TICK_RATE);
                    }
                } else {
                    const speed = ENEMIES[enemy.kind].speed / TICK_RATE;
                    let moveX = dx / length;
                    let moveY = dy / length;
                    if (enemy.kind === 'armored' && range > 1) {
                        const angle = Math.atan2(enemy.facingY!, enemy.facingX!);
                        const target = Math.atan2(dy, dx);
                        const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
                        const next = angle + clamp(delta, -0.05, 0.05);
                        enemy.facingX = Math.cos(next);
                        enemy.facingY = Math.sin(next);
                        moveX = enemy.facingX;
                        moveY = enemy.facingY;
                    }
                    if (this.terrain.length && enemy.kind !== 'armored') this.walkToward(enemy, this.player, speed);
                    else {
                        enemy.x += moveX * speed;
                        enemy.y += moveY * speed;
                    }
                }
            }
            if (enemy.kind === 'turret' && enemy.state === 'warn' && this.tick >= enemy.next) {
                enemy.state = 'walk';
                enemy.next = this.tick + 73;
                if (this.bullets.length < MAX_BULLETS) {
                    this.bullets.push({ x: enemy.x, y: enemy.y,
                        vx: 3.25 * enemy.vx, vy: 3.25 * enemy.vy, port: enemy.aimPort });
                    enemy.shotAt = this.tick;
                    this.signalEnemyAttack('projectile');
                }
            }
            this.keepInField(enemy, ENEMY_FIELD_MARGIN);
            this.applyTerrain(enemy, ENEMY_FIELD_MARGIN);
            if (distance(enemy, this.player) < 15) this.enemyContact(enemy);
        }
    }

    private walkToward(enemy: Enemy, target: Readonly<Position>, speed: number): void {
        const next = !this.terrain.length ? target
            : routeAround(enemy, nearestOpen(target, this.terrain, 7, this.field), this.terrain, 7, this.field)[0];
        const dx = next ? next.x - enemy.x : 0, dy = next ? next.y - enemy.y : 0;
        const range = Math.hypot(dx, dy);
        if (enemy.kind === 'pursuer') {
            // The routed leg can turn sharply even when the player barely changes bearing.
            const ux = range < 1e-6 ? 0 : dx / range, uy = range < 1e-6 ? 0 : dy / range;
            enemy.sprintTicks = ux * enemy.vx + uy * enemy.vy > 0.8 ? (enemy.sprintTicks ?? 0) + 1 : 0;
            enemy.vx = ux;
            enemy.vy = uy;
            enemy.state = enemy.sprintTicks >= 36 ? 'dash' : 'walk';
            if (enemy.state === 'dash') speed = 82 / TICK_RATE;
        }
        if (range < 1e-6) return;
        const scale = Math.min(speed / range, 1);
        enemy.x += dx * scale;
        enemy.y += dy * scale;
    }

    private moveSpecialEnemy(enemy: Enemy): void {
        const escort = this.task?.ready ? this.task.escort : undefined;
        const target = enemy.kind === 'reclaimer' ? escort ?? this.player
            : enemy.kind === 'jammer' ? this.task?.current ?? this.player : this.player;
        const range = distance(enemy, target);
        switch (enemy.kind) {
            case 'reclaimer': {
                if (!escort && this.rules.encounter?.combatOnly) {
                    if (this.attackReclaimer(enemy, range)) return;
                    break;
                }
                const canTow = escort && this.task && !this.task.complete && !this.task.failed;
                if (enemy.state === 'warn' || enemy.state === 'dash') {
                    const intercepted = distanceToSegment(this.player, enemy, target) <= 12;
                    const withdrew = !canTow || enemy.state === 'warn' && this.tick >= enemy.next && range > 72;
                    if (withdrew || intercepted) {
                        if (!withdrew) this.cutSerial++;
                        enemy.state = 'walk';
                        enemy.next = this.tick + 77;
                    } else if (this.tick >= enemy.next) {
                        if (enemy.state === 'warn') {
                            enemy.state = 'dash';
                            enemy.next = this.tick + RECLAIMER_PULL_TICKS;
                            this.signalEnemyAttack('area');
                        } else {
                            this.task?.finishEscortPull(this.tick);
                            enemy.state = 'walk';
                            enemy.next = this.tick + 77;
                        }
                    }
                } else if (range < 72 && this.tick >= enemy.next && canTow) {
                    enemy.state = 'warn';
                    enemy.next = this.tick + 27;
                    this.signalWarning('warning');
                }
                if (enemy.state === 'dash') this.task?.pullEscort();
                if (enemy.state !== 'walk') return;
                break;
            }
            case 'jammer':
                if (enemy.state === 'warn' && this.tick >= enemy.next) {
                    enemy.state = 'dash';
                    enemy.next = this.tick + 58;
                    this.signalEnemyAttack('area');
                } else if (enemy.state === 'dash' && this.tick >= enemy.next) {
                    enemy.state = 'walk';
                    enemy.next = this.tick + 67;
                } else if (enemy.state === 'walk' && range <= 52 && this.tick >= enemy.next) {
                    enemy.state = 'warn';
                    enemy.next = this.tick + 27;
                    this.signalWarning('warning');
                }
                if (enemy.state !== 'walk') return;
                break;
            case 'ambusher':
                if (enemy.state === 'warn') {
                    const light = this.searchlight;
                    const angle = light ? Math.atan2(enemy.y - light.y, enemy.x - light.x) - light.angle : 0;
                    if (this.tick < enemy.next || light && Math.abs(angle) > light.width / 2 && this.tick < enemy.next + 240) return;
                    enemy.state = 'walk';
                    enemy.next = this.tick + 90;
                    enemy.revealedAt = this.tick;
                    this.signalWarning('warning');
                } else if (this.tick >= enemy.next) {
                    enemy.state = 'warn';
                    enemy.next = this.tick + 27;
                    return;
                }
                break;
        }
        this.walkToward(enemy, target, ENEMIES[enemy.kind].speed / TICK_RATE);
        this.keepInField(enemy, 7);
        this.applyTerrain(enemy, 7);
    }

    private attackReclaimer(enemy: Enemy, range: number): boolean {
        if (enemy.state === 'walk') {
            if (range >= 72 || this.tick < enemy.next) return false;
            const aim = range > 0.01 ? Math.atan2(this.player.y - enemy.y, this.player.x - enemy.x) : -Math.PI / 2;
            enemy.tether = fieldRayEnd(enemy, Math.cos(aim), Math.sin(aim), 86, this.field);
            enemy.tetherHit = false;
            enemy.state = 'warn';
            enemy.next = this.tick + 27;
            this.signalWarning('warning');
        } else if (this.tick >= enemy.next) {
            if (enemy.state === 'dash') {
                enemy.state = 'walk';
                enemy.next = this.tick + 77;
                enemy.tether = undefined;
                return false;
            }
            enemy.state = 'dash';
            enemy.next = this.tick + RECLAIMER_PULL_TICKS;
            this.signalEnemyAttack('area');
        }
        if (enemy.state === 'dash' && !enemy.tetherHit && enemy.tether && distanceToSegment(this.player, enemy, enemy.tether) < 12) {
            enemy.tetherHit = true;
            if (this.hurt('reclaimer')) this.pullPlayer(enemy, 14);
        }
        return true;
    }

    private pullPlayer(from: Readonly<Position>, maxDistance: number): void {
        const range = distance(from, this.player);
        if (range < 1e-6) return;
        const fraction = Math.min(0.4, maxDistance / range);
        this.player.x += (from.x - this.player.x) * fraction;
        this.player.y += (from.y - this.player.y) * fraction;
        this.keepInField(this.player, PLAYER_MARGIN);
        this.applyTerrain(this.player, PLAYER_MARGIN);
    }

    private moveBoss(): void {
        const boss = this.boss!;
        const unit = boss.unit;
        const dx = this.player.x - unit.x;
        const dy = this.player.y - unit.y;
        const range = Math.hypot(dx, dy);
        if (boss.phase === 'patrol') {
            if (this.tick < boss.next) {
                if (range > 46) {
                    unit.x += ENEMIES.inspector.speed / TICK_RATE * dx / range;
                    unit.y += ENEMIES.inspector.speed / TICK_RATE * dy / range;
                }
                return;
            }
            const pattern: readonly BossAttack[] = unit.hp <= ENEMIES.inspector.hp / 2
                ? ['sweep', 'charge', 'summon'] : ['sweep', 'charge'];
            boss.attack = pattern[boss.pattern++ % pattern.length];
            boss.phase = 'warning';
            boss.attackNumber++;
            this.signalWarning(boss.attack === 'charge' ? 'charge' : 'warning');
            boss.damagedPlayer = false;
            boss.next = this.tick + (boss.attack === 'sweep' ? 33 : 28);
            if (range > 0) {
                unit.vx = dx / range;
                unit.vy = dy / range;
            }
            return;
        }
        if (boss.phase === 'warning' && this.tick >= boss.next) {
            boss.attackAt = this.tick;
            this.signalEnemyAttack(boss.attack === 'charge' ? 'melee' : 'area');
            if (boss.attack === 'summon') {
                for (const add of ['crawler', 'crawler', 'charger', 'crawler'] as const) this.queueSpawn(add);
                boss.phase = 'recover';
                boss.next = this.tick + 29;
            } else {
                boss.phase = boss.attack;
                boss.next = this.tick + (boss.attack === 'sweep' ? 12 : BOSS_CHARGE_TICKS);
            }
        }
        if (boss.phase === 'sweep') {
            const forward = dx * unit.vx + dy * unit.vy;
            const lateral = Math.abs(dx * unit.vy - dy * unit.vx);
            if (forward > 0 && forward <= BOSS_SWEEP_REACH && lateral < 18) this.bossHit('boss-sweep');
        } else if (boss.phase === 'charge') {
            unit.x += unit.vx * BOSS_CHARGE_SPEED;
            unit.y += unit.vy * BOSS_CHARGE_SPEED;
            this.keepInField(unit, 21);
            if (distance(unit, this.player) < 28) this.bossHit('boss-charge');
        }
        if (this.tick < boss.next) return;
        if (boss.phase === 'sweep' || boss.phase === 'charge') {
            boss.phase = 'recover';
            boss.next = this.tick + 34;
        } else if (boss.phase === 'recover') {
            boss.phase = 'patrol';
            boss.next = this.tick + 45;
        }
    }

    private bossHit(source: HitSource): void {
        if (this.boss!.damagedPlayer) return;
        this.boss!.damagedPlayer = true;
        this.hurt(source);
    }

    private moveBullets(): void {
        for (let index = this.bullets.length - 1; index >= 0; index--) {
            const bullet = this.bullets[index];
            bullet.x += bullet.vx;
            bullet.y += bullet.vy;
            const hit = distance(bullet, this.player) < 12;
            if (hit) this.hurt('projectile');
            const portHit = !hit && bullet.port && distance(bullet, bullet.port) < 14;
            if (portHit) this.task?.relayHit(this.tick, bullet.port!);
            if (hit || portHit || this.terrain.some(rect => rect.state === 'closed' && insideRect(bullet, rect))
                || bullet.x < this.field.left || bullet.x > this.field.right
                || bullet.y < this.field.bottom || bullet.y > this.field.top) {
                this.bullets.splice(index, 1);
            }
        }
    }

    private hurt(source: HitSource): boolean {
        if (this.tick < this.player.invulnerableUntil || this.player.hp <= 0) return false;
        this.player.invulnerableUntil = this.tick + this.rules.hitGrace;
        if (this.shielded) {
            this.shielded = false;
            return false;
        }
        this.player.hp--;
        this.player.hurtAt = this.tick;
        this.playerHit = { x: this.player.x, y: this.player.y };
        this.damageTaken++;
        this.lastHit = source;
        return true;
    }

    private nearest(origin: Position, reach: number, excluded?: ReadonlySet<Enemy>): Enemy | undefined {
        let result: Enemy | undefined;
        let best = reach;
        for (const enemy of this.enemies) {
            if (excluded?.has(enemy) || !this.canTarget(enemy)) continue;
            const range = distance(origin, enemy);
            if (range < best) {
                best = range;
                result = enemy;
            }
        }
        return result;
    }

    private swingTarget(slot: number, reach: number): Enemy | undefined {
        if (!this.rules.sweptMelee) return this.nearest(this.player, reach);
        const dock = weaponDock(slot, this.tools.length, this.tick);
        const weapon = { x: this.player.x + dock.x, y: this.player.y + dock.y };
        let picked: Enemy | undefined;
        let best = Infinity;
        for (const enemy of this.enemies) {
            if (!this.canTarget(enemy) || distance(this.player, enemy) > reach) continue;
            const gap = distance(weapon, enemy);
            if (gap < best) {
                picked = enemy;
                best = gap;
            }
        }
        return picked;
    }

    private advanceMelee(priorEnemies: ReadonlyMap<Enemy, Position>, priorPlayer: Readonly<Position>): void {
        for (const active of this.activeMelee) {
            const { cast } = active;
            const { melee } = cast;
            const frame = this.tick - cast.tick;
            updateMeleePath(melee, frame, this.player, this.field);
            if (frame < melee.first) continue;
            const from = melee.points[Math.max(melee.first, frame - 1)], to = melee.points[frame];
            const startPlayer = frame === melee.first ? this.player : priorPlayer;
            const playerDx = this.player.x - startPlayer.x, playerDy = this.player.y - startPlayer.y;
            const contacts: { enemy: Enemy; time: number; center: Position }[] = [];
            for (const enemy of this.enemies) {
                if (!this.canTarget(enemy) || active.struck.has(enemy)) continue;
                const previous = frame === melee.first ? enemy : priorEnemies.get(enemy) ?? enemy;
                const vx = enemy.x - previous.x, vy = enemy.y - previous.y;
                const ax = previous.x - from.x, ay = previous.y - from.y;
                const radius = melee.radius + (enemy.kind === 'inspector' ? 13 : enemy.kind === 'crawler' ? 6 : 9);
                const overlap = circleContact(ax, ay, vx - (to.x - from.x), vy - (to.y - from.y), radius);
                const inside = circleContact(previous.x - startPlayer.x, previous.y - startPlayer.y,
                    vx - playerDx, vy - playerDy, melee.range);
                if (!overlap || !inside) continue;
                const time = Math.max(overlap[0], inside[0]);
                if (time > Math.min(overlap[1], inside[1])) continue;
                const center = { x: startPlayer.x + playerDx * time, y: startPlayer.y + playerDy * time };
                const dx = previous.x + vx * time - center.x, dy = previous.y + vy * time - center.y;
                const reach = Math.hypot(dx, dy);
                if (reach && this.terrain.length &&
                    clipTerrainReach(center, dx / reach, dy / reach, reach, this.terrain, 0) < reach) continue;
                contacts.push({ enemy, time, center });
            }
            const start = this.effects.length;
            for (const { enemy, time, center } of contacts.sort((a, b) => a.time - b.time || a.enemy.id - b.enemy.id)) {
                active.struck.add(enemy);
                const point = { x: from.x + (to.x - from.x) * time, y: from.y + (to.y - from.y) * time };
                const markedBonus = active.arcLink && enemy.marked ? 1 : 0;
                if (active.marks) enemy.marked = true;
                if (!this.hit(enemy, active.damage(enemy, center) + active.bonus + markedBonus, point, 'arc', false, 'melee')) continue;
                if (markedBonus) this.triggers.arc++;
                if (active.landed) continue;
                active.landed = true;
                if (cast.tool === 'bypass_wrench') {
                    const runtime = this.runtime[cast.slot];
                    runtime.combo = (runtime.combo + 1) % 4;
                    runtime.lastInMelee = this.tick;
                }
            }
            for (let i = start; i < this.effects.length; i++) this.effects[i].sourceCast = cast;
        }
        while (this.activeMelee.length) {
            const expired = this.activeMelee.findIndex(({ cast }) => this.tick - cast.tick >= cast.melee.last);
            if (expired < 0) break;
            this.activeMelee.splice(expired, 1);
        }
    }

    private fire(tool: EquippedTool, runtime: ToolRuntime, slot: number): void {
        const ready = this.tick >= runtime.next;
        const trackingCombo = tool.id === 'bypass_wrench' && runtime.combo > 0;
        if (!ready && !trackingCombo) return;
        const spec = TOOLS[tool.id];
        const { reach, interval, equipment } = runtime;
        const meleeTool = this.rules.sweptMelee && isMeleeTool(tool.id) ? tool.id : undefined;
        const target = meleeTool ? this.swingTarget(slot, reach) : this.nearest(this.player, reach);
        if (trackingCombo) {
            if (target) runtime.lastInMelee = this.tick;
            else if (this.tick - runtime.lastInMelee >= 2 * TICK_RATE) runtime.combo = 0;
        }
        if (!ready) return;
        if (!target) {
            runtime.heat = Math.max(0, runtime.heat - 1 / 30);
            return;
        }
        const targetRange = distance(this.player, target);
        const aim = targetRange || 1;
        const ux = (target.x - this.player.x) / aim, uy = (target.y - this.player.y) / aim;
        this.playerAttack = { tick: this.tick, x: ux, y: uy };
        this.playerAttackTool = tool.id;
        const cast = { tool: tool.id, slot, x: this.player.x, y: this.player.y, ux, uy, targetRange, tick: this.tick };
        this.weaponAttackCue = WEAPON_ATTACK_CUES[tool.id];
        this.weaponAttackSerial++;
        if (runtime.cooling) {
            this.heatRecovered = true;
            runtime.cooling = false;
        }
        const heatTool = equipment?.heat ?? (this.heat && tool.mods.some((id) => id === 'exchanger' || id === 'valve' || id === 'ceramic'));
        const damage = (equipment?.damage ?? spec.damage) + (heatTool && runtime.heat >= 3 ? 1 : 0);
        const close = equipment?.close ?? Number(tool.tuning?.finisher === 'close');
        const far = equipment?.far ?? Number(tool.tuning?.finisher === 'edge');
        const damageAt = (enemy: Enemy, center: Readonly<Position> = cast): number => {
            if (!close && !far) return damage;
            const relativeReach = distance(center, enemy) / reach;
            return damage + (relativeReach <= 0.45 ? close : relativeReach >= 0.65 ? far : 0);
        };
        runtime.next = this.tick + interval;
        const heatsink = this.blueprint === 'quick_release_heatsink';
        if (heatTool && ++runtime.heat >= (tool.mods.indexOf('ceramic') >= 0 ? 8 : 6) - (heatsink ? 1 : 0)) {
            runtime.heat = 0;
            runtime.next = this.tick + (heatsink ? 36 : 48);
            runtime.cooling = true;
            this.triggers.heat++;
        }
        const marks = equipment?.marks ?? (tool.mods.indexOf('contact') >= 0 || (this.arc && tool.mods.indexOf('relay') >= 0));
        const linked = equipment?.arcLink ?? this.arc;
        if (meleeTool) {
            const melee = createMeleeMotion(meleeTool, runtime.swings++, weaponDock(slot, this.tools.length, this.tick),
                cast, ux, uy, reach, this.field);
            const attack = { ...cast, tool: meleeTool, melee };
            this.weaponCasts.push(attack);
            this.activeMelee.push({ cast: attack, damage: damageAt, marks, arcLink: linked, landed: false, struck: new Set(),
                bonus: meleeTool === 'bypass_wrench' && runtime.combo === 3 ? 3 + (equipment?.combo ?? 0) : 0 });
            runtime.next = Math.max(runtime.next, this.tick + melee.last + MELEE_RETURN_TICKS);
            return;
        }
        this.weaponCasts.push(cast);
        const chain = linked && target.marked;
        if (marks) target.marked = true;
        if (tool.id === 'wrench' || tool.id === 'arc_gun') {
            const excluded = new Set([target]);
            this.hit(target, damageAt(target), this.player, 'arc', false, tool.id === 'wrench' ? 'melee' : 'launch');
            this.chainFrom(target, excluded, chain, tool.id === 'arc_gun', equipment);
            return;
        }
        if (tool.id === 'bypass_wrench') {
            // Shielded hits do not advance a combo. The fourth accepted hit consumes it.
            if (this.hit(target, damageAt(target) + (runtime.combo === 3 ? 3 + (equipment?.combo ?? 0) : 0), this.player, 'arc', false, 'melee')) {
                runtime.combo = (runtime.combo + 1) % 4;
                runtime.lastInMelee = this.tick;
            }
            if (chain) this.chainFrom(target, new Set([target]), true, false, equipment);
            return;
        }
        if (tool.id === 'induction') {
            const area = this.pulse('induction', reach);
            const targets = this.enemies.filter((enemy) => covers(area, enemy));
            for (const enemy of targets) this.hit(enemy, damageAt(enemy), this.player, 'induction');
            if (chain) this.chainFrom(target, new Set(targets), true, false, equipment);
            return;
        }
        if (tool.id === 'traction_coil') {
            const area = this.pulse('induction', reach);
            const targets = this.enemies.filter(enemy => (enemy === target || this.canTarget(enemy)) && covers(area, enemy))
                .sort((a, b) => distance(this.player, a) - distance(this.player, b) || a.id - b.id).slice(0, 2 + (equipment?.targets ?? 0));
            for (const enemy of targets) {
                this.hit(enemy, damageAt(enemy), this.player, 'induction', false, 'pull');
                this.displace(enemy, -20 - (equipment?.displacement ?? 0));
            }
            if (chain) this.chainFrom(target, new Set(targets), true, false, equipment);
            return;
        }
        if (tool.id === 'split_probe') {
            const targets = new Set([target]);
            const count = 2 + (equipment?.targets ?? 0);
            while (targets.size < count) {
                const next = this.nearest(this.player, reach, targets);
                if (!next) break;
                targets.add(next);
            }
            for (const enemy of Array.from(targets)) {
                this.drawArea(enemy, distance(this.player, enemy), 'shot', 2);
                this.hit(enemy, damageAt(enemy), this.player, 'shot');
            }
            if (chain) this.chainFrom(target, targets, true, false, equipment);
            return;
        }
        const shot = tool.id === 'riveter' || tool.id === 'hydraulic_nailer';
        const kind = shot ? 'shot' : 'heat';
        const spread = equipment?.spread ?? 0;
        const area = this.drawArea(target, reach, kind, (tool.id === 'hydraulic_nailer' ? 9 : 11) + (shot ? spread : 0),
            .7 + (shot ? 0 : spread));
        const targets = this.enemies.filter(enemy => enemy === target || (area && this.canTarget(enemy) && covers(area, enemy)))
            .sort((left, right) => distance(this.player, left) - distance(this.player, right) || left.id - right.id);
        const limit = tool.id === 'hydraulic_nailer' ? 2 : tool.id === 'riveter' ? 3 : targets.length;
        const hits = targets.slice(0, limit + (equipment?.pierce ?? 0));
        for (const enemy of hits) {
            this.hit(enemy, damageAt(enemy), this.player, kind, tool.id === 'hydraulic_nailer');
            if (tool.id === 'pulse_nozzle') this.displace(enemy, 16 + (equipment?.displacement ?? 0));
        }
        if (chain && hits.includes(target)) this.chainFrom(target, new Set(hits), true, false, equipment);
    }

    private drawArea(target: Enemy, reach: number, kind: 'shot' | 'heat', width: number, slope = .7): Area | undefined {
        const range = distance(this.player, target);
        if (range === 0) return undefined;
        const origin = { x: this.player.x, y: this.player.y,
            ux: (target.x - this.player.x) / range, uy: (target.y - this.player.y) / range };
        const area: Area = kind === 'shot'
            ? { ...origin, shape: 'strip', kind, length: reach, halfWidth: width }
            : { ...origin, shape: 'sector', kind, radius: reach, slope };
        this.effects.push({ ...area, life: 7 });
        return area;
    }

    private displace(enemy: Enemy, amount: number): void {
        if (enemy.hp <= 0 || enemy.kind === 'inspector' || enemy.nextShift && enemy.nextShift > this.tick) return;
        const range = distance(enemy, this.player);
        if (!range) return;
        const displacement = amount < 0 ? Math.min(-amount, Math.max(0, range - 12)) : amount;
        const direction = amount < 0 ? -1 / range : 1 / range;
        const dx = (enemy.x - this.player.x) * direction, dy = (enemy.y - this.player.y) * direction;
        const travel = clipTerrainReach(enemy, dx, dy, displacement, this.terrain, 7);
        enemy.x += dx * travel;
        enemy.y += dy * travel;
        this.keepInField(enemy, 7);
        enemy.nextShift = this.tick + 30;
    }

    private chainFrom(first: Enemy, excluded: Set<Enemy>, enhanced: boolean, gun = false, equipment?: WeaponEquipmentStats): void {
        let origin = first;
        const narrow = this.blueprint === 'narrow_beam_clamp';
        const extraReach = equipment?.chainReach ?? 0;
        const reach = (this.mods.has('relay') ? 82 : 66) + (narrow ? 20 : 0) + extraReach;
        const maximum = (enhanced ? narrow ? 2 : 3 : gun ? 2 : 1) + (equipment?.hops ?? 0);
        for (let hop = 0; hop < maximum; hop++) {
            const next = this.nearest(origin, enhanced ? reach + (gun ? 12 : 0) : (gun ? 56 : 39) + extraReach, excluded);
            if (!next) break;
            if (enhanced && hop === 0) this.triggers.arc++;
            excluded.add(next);
            this.hit(next, enhanced ? 2 : 1, origin, 'arc');
            origin = next;
        }
    }

    private canTarget(enemy: Enemy): boolean {
        return enemy.hp > 0 && !(enemy.kind === 'ambusher' && enemy.state === 'warn');
    }

    private hit(enemy: Enemy, damage: number, from: Position, kind: Attack['kind'], nailer = false,
        motion?: 'melee' | 'launch' | 'pull'): boolean {
        if (!this.canTarget(enemy)) return false;
        if (this.rules.encounter?.armorLine && !nailer && kind === 'shot' && enemy.kind !== 'armored') {
            const range = distance(enemy, from);
            const ux = (enemy.x - from.x) / Math.max(range, 1), uy = (enemy.y - from.y) / Math.max(range, 1);
            if (this.enemies.some(shield => {
                const x = shield.x - from.x, y = shield.y - from.y, forward = x * ux + y * uy;
                return shield.kind === 'armored' && forward > 0 && forward < range && Math.abs(x * uy - y * ux) < 12;
            })) return false;
        }
        if (enemy.kind === 'armored' && kind !== 'magnet') {
            const length = distance(enemy, from);
            const facing = (from.x - enemy.x) * enemy.facingX! + (from.y - enemy.y) * enemy.facingY!;
            if (length > 0 && facing / length > 0.45) damage *= nailer ? 0.7 : 0.4;
        }
        if (enemy === this.boss?.unit && this.encounterBoss) damage = this.encounterBoss.damage(damage, from, nailer);
        if (damage <= 0) return false;
        enemy.hitAt = this.tick;
        this.weaponImpactSerial++;
        const point = { x: enemy.x, y: enemy.y, life: 7 };
        if (kind === 'arc') {
            const link: Attack = { ...point, kind, shape: 'link', from: { x: from.x, y: from.y } };
            if (motion === 'melee' || motion === 'launch') link.fromWeapon = true;
            if (motion === 'melee') link.melee = true;
            this.effects.push(link);
        } else {
            const impact: Attack = { ...point, kind, shape: 'impact' };
            if (motion === 'pull') impact.pullFrom = { x: from.x, y: from.y };
            this.effects.push(impact);
        }
        enemy.hp -= damage;
        if (enemy.hp > 0) return true;
        if (enemy.kind === 'reclaimer' && enemy.state !== 'walk') this.cutSerial++;
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        if (!(enemy === this.boss?.unit && this.encounterBoss?.kind === 'core')) this.defeatedEnemies.push(enemy);
        this.parts.push({ x: enemy.x, y: enemy.y });
        this.kills++;
        return true;
    }

    private pulse(kind: 'magnet' | 'induction', radius: number): Area {
        const area = { x: this.player.x, y: this.player.y, shape: 'circle' as const, kind, radius };
        this.effects.push({ ...area, life: 12 });
        return area;
    }

    private collect(): void {
        for (let index = this.parts.length - 1; index >= 0; index--) {
            if (distance(this.parts[index], this.player) >= this.pickupRadius) continue;
            this.parts.splice(index, 1);
            this.collected++;
            if (!this.magnet || ++this.magnetCharge < MAGNET_PULSE.parts) continue;
            this.magnetCharge = 0;
            this.triggers.magnet++;
            this.playerPulseAt = this.tick;
            const area = this.pulse('magnet', MAGNET_PULSE.radius);
            for (const enemy of [...this.enemies]) {
                if (covers(area, enemy)) this.hit(enemy, MAGNET_PULSE.damage, this.player, 'magnet');
            }
        }
    }
}
