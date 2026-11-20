import { ENEMIES, FIELD, M1_RULES, PUDDLE_ACTIVE, PUDDLE_CYCLE, PUDDLE_WARNING, START, TICK_RATE, TOOLS, hasPair, randomStream } from './content';
import type { EnemyId, EquippedTool, ModId, RegularEnemyId, RunRules, WaveSpec } from './content';

export interface Position { x: number; y: number }
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
}
interface Bullet extends Position { vx: number; vy: number }
interface Spawn extends Position { kind: RegularEnemyId; at: number }
type SkillKind = 'arc' | 'shot' | 'heat' | 'magnet' | 'induction';
type Area = Position & (
    { shape: 'circle'; kind: 'magnet' | 'induction'; radius: number } |
    { shape: 'strip'; kind: 'shot'; ux: number; uy: number; length: number; halfWidth: number } |
    { shape: 'sector'; kind: 'heat'; ux: number; uy: number; radius: number; slope: number }
);
export type Attack = { life: number } & (Area |
    (Position & { shape: 'link'; kind: 'arc'; from: Position }) |
    (Position & { shape: 'impact'; kind: Exclude<SkillKind, 'arc'> }));

function covers(area: Area, position: Position): boolean {
    const dx = position.x - area.x, dy = position.y - area.y;
    if (area.shape === 'circle') return Math.hypot(dx, dy) < area.radius;
    const forward = dx * area.ux + dy * area.uy;
    const lateral = Math.abs(dx * area.uy - dy * area.ux);
    if (forward <= 0) return false;
    return area.shape === 'strip' ? forward < area.length && lateral < area.halfWidth
        : Math.hypot(dx, dy) < area.radius && lateral < forward * area.slope;
}
interface ToolRuntime { next: number; heat: number }
type BossAttack = 'sweep' | 'charge' | 'summon';
export type HitSource = EnemyId | 'projectile' | 'boss-sweep' | 'boss-charge' | 'live-puddle';
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
    damagedPlayer: boolean;
}

const SPAWN_WARNING = 22;
const NO_PUDDLES: readonly LivePuddle[] = [];
const SPEED = 156 / TICK_RATE;
const MAX_ENEMIES = 36;
const MAX_BULLETS = 40;
export const BOSS_SWEEP_REACH = 230;
export const BOSS_CHARGE_SPEED = 8;
export const BOSS_CHARGE_TICKS = 23;
const distance = (first: Position, second: Position) => Math.hypot(first.x - second.x, first.y - second.y);
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export class Battle {
    readonly player: Position & { hp: number; invulnerableUntil: number };
    readonly enemies: Enemy[] = [];
    readonly bullets: Bullet[] = [];
    readonly parts: Position[] = [];
    readonly warnings: Spawn[] = [];
    readonly effects: Attack[] = [];
    readonly triggers = { arc: 0, magnet: 0, heat: 0 };
    readonly duration: number;
    readonly boss: BossState | null;
    readonly spec: WaveSpec;
    readonly salvageRate: number;
    tick = 0;
    damageTaken = 0;
    shielded: boolean;
    collected = 0;
    magnetCharge = 0;
    kills = 0;
    lastHit: HitSource | null = null;
    warningSerial = 0;
    warningKind: 'warning' | 'charge' = 'warning';
    private nextEnemy = 1;
    private spawnCursor = 0;
    private readonly random: () => number;
    private readonly runtime: ToolRuntime[];
    private readonly magnet: boolean;
    private readonly arc: boolean;
    private readonly heat: boolean;
    private readonly pickupRadius: number;
    private readonly mods = new Set<ModId>();

    constructor(readonly wave: number, seed: number, readonly tools: readonly EquippedTool[], readonly rules: RunRules = M1_RULES) {
        this.player = { ...START, hp: rules.maxHp, invulnerableUntil: 0 };
        this.spec = rules.waves[wave];
        this.duration = this.spec.seconds * TICK_RATE;
        this.random = randomStream(seed ^ Math.imul(wave + 1, 0x58a86197));
        this.runtime = tools.map(() => ({ next: 0, heat: 0 }));
        this.magnet = hasPair(tools, 'magnet');
        this.arc = hasPair(tools, 'arc');
        this.heat = hasPair(tools, 'heat');
        for (const tool of tools) for (const mod of tool.mods) this.mods.add(mod);
        this.pickupRadius = (this.mods.has('ring') ? 39 : 21) + (this.mods.has('sweeper') ? 11 : 0);
        this.shielded = this.mods.has('plate');
        this.salvageRate = this.mods.has('sorter') ? 0.75 : 0.5;
        if (this.spec.boss) {
            const unit: Enemy = {
                x: START.x, y: FIELD.top - 43, id: this.nextEnemy++, kind: 'inspector', hp: ENEMIES.inspector.hp,
                state: 'walk', next: 0, vx: 0, vy: -1, marked: false,
            };
            this.enemies.push(unit);
            this.boss = { unit, phase: 'patrol', attack: 'sweep', next: 58, pattern: 0, attackNumber: 0, damagedPlayer: false };
        } else this.boss = null;
    }

    get bossDefeated(): boolean { return this.boss !== null && this.boss.unit.hp <= 0; }
    get finished() { return this.player.hp <= 0 || this.tick >= this.duration || this.bossDefeated; }

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

    step(inputX: number, inputY: number): void {
        if (this.finished) return;
        this.tick++;
        const axisX = Number.isFinite(inputX) ? clamp(inputX, -1, 1) : 0;
        const axisY = Number.isFinite(inputY) ? clamp(inputY, -1, 1) : 0;
        const magnitude = Math.max(1, Math.hypot(axisX, axisY));
        const speed = this.mods.has('bearings') ? SPEED * 1.12 : SPEED;
        this.player.x += speed * axisX / magnitude;
        this.player.y += speed * axisY / magnitude;
        this.keepInField(this.player, 10);
        this.spawn();
        this.moveEnemies();
        this.moveBullets();
        if (this.livePuddles.some((puddle) => puddle.phase === 'active' && distance(puddle, this.player) < puddle.radius)) {
            this.hurt('live-puddle');
        }
        if (this.player.hp <= 0) return;
        this.tools.forEach((tool, index) => this.fire(tool, this.runtime[index]));
        this.collect();
        for (let index = this.effects.length - 1; index >= 0; index--) {
            if (--this.effects[index].life === 0) this.effects.splice(index, 1);
        }
    }

    private keepInField(position: Position, margin: number): void {
        position.x = clamp(position.x, FIELD.left + margin, FIELD.right - margin);
        position.y = clamp(position.y, FIELD.bottom + margin, FIELD.top - margin);
    }

    private spawn(): void {
        const wave = this.spec;
        if (wave.spawnEvery > 0 && (this.tick - 1) % wave.spawnEvery === 0) {
            if (this.queueSpawn(wave.enemies[this.spawnCursor % wave.enemies.length])) this.spawnCursor++;
        }
        while (this.warnings.length && this.warnings[0].at <= this.tick) {
            const { x, y, kind } = this.warnings.shift()!;
            if (distance({x, y}, this.player) < 55) continue;
            this.enemies.push({ x, y, kind, id: this.nextEnemy++, hp: ENEMIES[kind].hp, state: 'walk',
                next: this.tick + 48, vx: 0, vy: 0, marked: false,
                facingX: kind === 'armored' ? 0 : undefined, facingY: kind === 'armored' ? -1 : undefined });
        }
    }

    private queueSpawn(kind: RegularEnemyId): boolean {
        if (this.enemies.length + this.warnings.length >= MAX_ENEMIES) return false;
        const roll = this.random();
        const x = FIELD.left + 12 + roll * (FIELD.right - FIELD.left - 24);
        const y = FIELD.bottom + 12 + roll * (FIELD.top - FIELD.bottom - 24);
        const spots = [
            { x, y: FIELD.bottom + 10 }, { x, y: FIELD.top - 10 },
            { x: FIELD.left + 10, y }, { x: FIELD.right - 10, y },
        ].filter((position) => distance(position, this.player) >= 115);
        const position = spots[Math.floor(this.random() * spots.length)];
        if (!position) return false;
        this.warnings.push({ ...position, at: this.tick + SPAWN_WARNING, kind });
        return true;
    }

    private signalWarning(kind: 'warning' | 'charge'): void {
        this.warningKind = kind;
        this.warningSerial++;
    }

    private moveEnemies(): void {
        for (const enemy of this.enemies) {
            if (enemy.kind === 'inspector') {
                this.moveBoss();
                continue;
            }
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const range = Math.hypot(dx, dy);
            const length = Math.max(1, range);
            if (enemy.kind === 'charger' && enemy.state === 'warn' && this.tick >= enemy.next) {
                enemy.state = 'dash';
                enemy.next = this.tick + 17;
            }
            if (enemy.state === 'dash') {
                enemy.x += enemy.vx * 7.6;
                enemy.y += enemy.vy * 7.6;
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
                } else if (enemy.kind === 'turret' && range < 195) {
                    if (this.tick >= enemy.next) {
                        enemy.state = 'warn';
                        this.signalWarning('warning');
                        enemy.next = this.tick + 21;
                        enemy.vx = dx / length;
                        enemy.vy = dy / length;
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
                    enemy.x += moveX * speed;
                    enemy.y += moveY * speed;
                }
            }
            if (enemy.kind === 'turret' && enemy.state === 'warn' && this.tick >= enemy.next) {
                enemy.state = 'walk';
                enemy.next = this.tick + 73;
                if (this.bullets.length < MAX_BULLETS) this.bullets.push({
                    x: enemy.x, y: enemy.y, vx: 3.25 * enemy.vx, vy: 3.25 * enemy.vy,
                });
            }
            this.keepInField(enemy, 7);
            if (distance(enemy, this.player) < 15) this.hurt(enemy.kind);
        }
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
            if (hit || bullet.x < FIELD.left || bullet.x > FIELD.right || bullet.y < FIELD.bottom || bullet.y > FIELD.top) {
                this.bullets.splice(index, 1);
            }
        }
    }

    private hurt(source: HitSource): void {
        if (this.tick < this.player.invulnerableUntil || this.player.hp <= 0) return;
        this.player.invulnerableUntil = this.tick + this.rules.hitGrace;
        if (this.shielded) {
            this.shielded = false;
            return;
        }
        this.player.hp--;
        this.damageTaken++;
        this.lastHit = source;
    }

    private nearest(origin: Position, reach: number, excluded = new Set<Enemy>()): Enemy | undefined {
        let result: Enemy | undefined;
        let best = reach;
        for (const enemy of this.enemies) {
            if (excluded.has(enemy)) continue;
            const range = distance(origin, enemy);
            if (range < best) {
                best = range;
                result = enemy;
            }
        }
        return result;
    }

    private fire(tool: EquippedTool, runtime: ToolRuntime): void {
        if (this.tick < runtime.next) return;
        const spec = TOOLS[tool.id];
        const target = this.nearest(this.player, spec.reach);
        if (!target) {
            runtime.heat = Math.max(0, runtime.heat - 1 / 30);
            return;
        }
        const heatTool = this.heat && tool.mods.some((id) => id === 'exchanger' || id === 'valve' || id === 'ceramic');
        const damage = spec.damage + (heatTool && runtime.heat >= 3 ? 1 : 0);
        runtime.next = this.tick + spec.cooldown - (tool.mods.indexOf('exchanger') >= 0 ? 3 : 0);
        if (heatTool && ++runtime.heat >= (tool.mods.indexOf('ceramic') >= 0 ? 8 : 6)) {
            runtime.heat = 0;
            runtime.next = this.tick + 48;
            this.triggers.heat++;
        }
        const chain = this.arc && target.marked;
        if (tool.mods.indexOf('contact') >= 0 || (this.arc && tool.mods.indexOf('relay') >= 0)) target.marked = true;
        if (tool.id === 'wrench' || tool.id === 'arc_gun') {
            const excluded = new Set([target]);
            this.hit(target, damage, this.player, 'arc');
            this.chainFrom(target, excluded, chain, tool.id === 'arc_gun');
            return;
        }
        if (tool.id === 'induction') {
            const area = this.pulse('induction', spec.reach);
            const targets = this.enemies.filter((enemy) => covers(area, enemy));
            for (const enemy of targets) this.hit(enemy, damage, this.player, 'induction');
            if (chain) this.chainFrom(target, new Set(targets), true);
            return;
        }
        const range = distance(this.player, target);
        let area: Area | undefined;
        if (range > 0) {
            const origin = { x: this.player.x, y: this.player.y,
                ux: (target.x - this.player.x) / range, uy: (target.y - this.player.y) / range };
            area = tool.id === 'riveter'
                ? { ...origin, shape: 'strip', kind: 'shot', length: spec.reach, halfWidth: 11 }
                : { ...origin, shape: 'sector', kind: 'heat', radius: spec.reach, slope: 0.7 };
            this.effects.push({ ...area, life: 7 });
        }
        const targets = this.enemies.filter(enemy => enemy === target || (area && covers(area, enemy)))
            .sort((left, right) => distance(this.player, left) - distance(this.player, right) || left.id - right.id);
        const hits = targets.slice(0, tool.id === 'riveter' ? 3 : targets.length);
        for (const enemy of hits) {
            this.hit(enemy, damage, this.player, tool.id === 'riveter' ? 'shot' : 'heat');
        }
        if (chain && hits.indexOf(target) >= 0) this.chainFrom(target, new Set(hits), true);
    }

    private chainFrom(first: Enemy, excluded: Set<Enemy>, enhanced: boolean, gun = false): void {
        let origin = first;
        const reach = this.mods.has('relay') ? 82 : 66;
        const maximum = enhanced ? 3 : gun ? 2 : 1;
        for (let hop = 0; hop < maximum; hop++) {
            const next = this.nearest(origin, enhanced ? reach + (gun ? 12 : 0) : gun ? 56 : 39, excluded);
            if (!next) break;
            if (enhanced && hop === 0) this.triggers.arc++;
            excluded.add(next);
            this.hit(next, enhanced ? 2 : 1, origin, 'arc');
            origin = next;
        }
    }

    private hit(enemy: Enemy, damage: number, from: Position, kind: Attack['kind']): void {
        if (enemy.kind === 'armored' && kind !== 'magnet') {
            const length = distance(enemy, from);
            const facing = (from.x - enemy.x) * enemy.facingX! + (from.y - enemy.y) * enemy.facingY!;
            if (length > 0 && facing / length > 0.45) damage *= 0.4;
        }
        const point = { x: enemy.x, y: enemy.y, life: 7 };
        this.effects.push(kind === 'arc' ? { ...point, kind, shape: 'link', from: { x: from.x, y: from.y } }
            : { ...point, kind, shape: 'impact' });
        enemy.hp -= damage;
        if (enemy.hp > 0) return;
        this.enemies.splice(this.enemies.indexOf(enemy), 1);
        this.parts.push({ x: enemy.x, y: enemy.y });
        this.kills++;
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
            if (!this.magnet || ++this.magnetCharge < 5) continue;
            this.magnetCharge = 0;
            this.triggers.magnet++;
            const area = this.pulse('magnet', 79);
            for (const enemy of [...this.enemies]) {
                if (covers(area, enemy)) this.hit(enemy, 4, this.player, 'magnet');
            }
        }
    }
}
