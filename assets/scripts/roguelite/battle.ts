import {
    BASE_PICKUP_RADIUS,
    CAMPAIGN_FIELD,
    IMPACT_TICKS,
    START,
    TICK_RATE,
    clamp,
    distance,
    distanceToSegment,
    fieldRayEnd,
    randomStream,
} from './constants';
import { MELEE_RETURN_TICKS, MELEE_WINDUP_TICKS, circleContact, createMeleeMotion, isMeleeTool, updateMeleePath, weaponDock } from './weaponMotion';
import type { MeleeMotion, MeleeTool } from './weaponMotion';
import { ENEMY_ARCHETYPES, RIG_CATALOG, WEAPON_CATALOG } from './catalog';
import {
    bossHpForWave,
    computeWeaponCooldown,
    computeWeaponHit,
    enemyStatsForWave,
    incomingDamage,
    resolveBuild,
    synergyTier,
} from './formulas';
import { UI_COPY } from './narrative';
import type { ResolvedBuild } from './formulas';
import type {
    Attack,
    BattleWaveSummary,
    ChapterBossKind,
    ChapterBossView,
    ChapterDefinition,
    CombatBounds,
    DailyShiftModifierId,
    DamageSource,
    DangerLevel,
    EnemyId,
    MeleeWindup,
    Position,
    PreRunSupplyId,
    RegularEnemyId,
    RenderBattleView,
    RigId,
    StatDelta,
    ToolId,
    WaveDefinition,
    WeaponCast,
    WeaponDamageStat,
    WeaponImpact,
    WeaponInstance,
    WorkshopProfile,
} from './types';

const PLAYER_BASE_SPEED = 162 / TICK_RATE;
const PLAYER_HIT_GRACE = 22; // 0.73s
const SPAWN_WARNING_TICKS = 20;
const MAX_BULLETS = 56;
const TAU = Math.PI * 2;
const WEAPON_CAST_HISTORY = 16;

type SkillKind = 'arc' | 'shot' | 'heat' | 'magnet' | 'induction';
const WEAPON_ATTACK_CUES: Record<ToolId, SkillKind> = {
    wrench: 'arc', arc_gun: 'arc', bypass_wrench: 'arc', riveter: 'shot', hydraulic_nailer: 'shot', split_probe: 'shot',
    torch: 'heat', pulse_nozzle: 'heat', induction: 'induction', traction_coil: 'magnet',
};

export interface FloatingText {
    readonly x: number;
    readonly y: number;
    readonly text: string;
    readonly kind: 'crit' | 'heal' | 'jam' | 'burn';
    readonly bornTick: number;
}

export interface RogueliteEnemy extends Position {
    id: number;
    kind: RegularEnemyId | 'boss';
    bossKind?: ChapterBossKind | 'inspector';
    hp: number;
    maxHp: number;
    damage: number;
    speed: number;
    radius: number;
    parts: number;
    xp: number;
    isElite?: boolean;
    state: 'walk' | 'warn' | 'dash' | 'recover' | 'stealth' | 'open';
    next: number;
    vx: number;
    vy: number;
    facingX: number;
    facingY: number;
    sprintTicks: number;
    tether?: Readonly<Position>;
    tetherHit?: boolean;
    hitAt?: number;
    shotAt?: number;
    contactAt?: number;
    revealedAt?: number;
    shockedUntil: number;
    vulnerableUntil: number;
    vulnerableBonus: number;
    burnStacks: number;
    burnDamage: number;
    burnUntil: number;
    slowUntil: number;
    nextShift: number;
    bossCycle: number;
    bossStage: number;
    bossPhaseStartedAt: number;
    bossHazard?:
        | { shape: 'rect'; left: number; right: number; bottom: number; top: number; active: boolean }
        | { shape: 'sector'; x: number; y: number; radius: number; from: number; sweep: number; active: boolean }
        | { shape: 'tether'; x: number; y: number; end: Position; width: number; active: boolean };
    bossVolley?: 'fan' | 'ring';
    bossDamagedPlayer?: boolean;
}

export interface RogueliteBullet extends Position {
    vx: number;
    vy: number;
    damage: number;
    source: 'projectile' | 'boss_bullet';
    boss?: true;
}

export interface RogueliteDrop extends Position {
    kind: 'part' | 'heal';
    value: number;
}

export interface SpawnCue extends Position {
    kind: RegularEnemyId;
    at: number;
}

interface WeaponRuntime {
    readonly slot: number;
    readonly instance: WeaponInstance;
    next: number;
    swings: number;
    combo: number;
    lastHitTick: number;
    heat: number;
    wideSweepReady: boolean;
    totalDamage: number;
    kills: number;
    crits: number;
}

interface ActiveMeleeSwing {
    readonly runtime: WeaponRuntime;
    readonly cast: WeaponCast & { readonly melee: MeleeMotion; readonly tool: MeleeTool };
    readonly startTick: number;
    readonly struck: Set<RogueliteEnemy>;
    readonly bonusMult: number;
    readonly forceCrit: boolean;
    readonly wide: boolean;
    landed: number;
}

export interface BattleInit {
    readonly chapter: ChapterDefinition;
    readonly waveIndex: number; // 0..11 (or higher in endless mode)
    readonly waveDefOverride?: WaveDefinition;
    readonly seed: number;
    readonly danger: DangerLevel;
    readonly rigId: RigId;
    readonly level: number;
    readonly levelStats: StatDelta;
    readonly weapons: readonly WeaponInstance[];
    readonly modules: readonly string[];
    readonly startHp: number;
    readonly carriedBagParts: number;
    readonly supply?: PreRunSupplyId;
    readonly dailyMod?: DailyShiftModifierId;
    readonly profile?: Pick<WorkshopProfile, 'talents'> & { readonly maxDangerCleared?: WorkshopProfile['maxDangerCleared'] };
    readonly field?: CombatBounds;
}

export class RogueliteBattle {
    readonly chapter: ChapterDefinition;
    readonly waveDef: WaveDefinition;
    readonly stationName: string;
    readonly arena: string;
    readonly field: CombatBounds;
    readonly build: ResolvedBuild;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly dailyMod?: DailyShiftModifierId;
    readonly durationTicks: number;

    readonly player: Position & { hp: number; maxHp: number; invulnerableUntil: number; hurtAt?: number };
    destination: Position | null = null;
    readonly enemies: RogueliteEnemy[] = [];
    readonly defeatedEnemies: { id: number; kind: EnemyId; x: number; y: number; hitAt: number }[] = [];
    readonly bullets: RogueliteBullet[] = [];
    readonly drops: RogueliteDrop[] = [];
    readonly warnings: SpawnCue[] = [];
    readonly runtimes: WeaponRuntime[];

    // Visual & audio event buffers consumed directly by BattleSkinView, SkillEffectsView & CampaignAudio
    readonly effects: Attack[] = [];
    readonly weaponCasts: WeaponCast[] = [];
    readonly weaponImpacts: WeaponImpact[] = [];
    readonly floaters: FloatingText[] = [];
    private readonly activeMelees: ActiveMeleeSwing[] = [];

    tick = 0;
    kills = 0;
    elitesKilled = 0;
    partsCollected = 0;
    bagRemaining: number;
    bagRedeemed = 0;
    xpGained = 0;
    damageTaken = 0;
    hitsTaken = 0;
    healed = 0;
    emptyTicks = 0;
    isJammed = false;
    lastHitSource: DamageSource | null = null;
    readonly hitSources: Partial<Record<DamageSource, number>> = {};

    // Audio cue serials
    weaponAttackSerial = 0;
    weaponAttackCue: SkillKind = 'arc';
    weaponImpactSerial = 0;
    warningSerial = 0;
    warningKind: 'warning' | 'charge' = 'warning';
    enemyAttackSerial = 0;
    enemyAttackCue: 'melee' | 'projectile' | 'area' = 'melee';
    playerAttack?: { readonly tick: number; readonly x: number; readonly y: number };
    playerHit?: Readonly<Position>;

    private readonly random: () => number;
    private nextEnemyId = 1;
    private nextSpawnTick = 1;
    private regenCarry = 0;
    private controlHits = 0;
    private bossUnit: RogueliteEnemy | null = null;
    private bossDefeated = false;

    constructor(init: BattleInit) {
        this.chapter = init.chapter;
        this.waveDef = init.waveDefOverride ?? init.chapter.waves[init.waveIndex];
        const station = init.chapter.stations[this.waveDef.stationIndex];
        this.stationName = station.name;
        this.arena = station.arena;
        this.field = init.field ?? CAMPAIGN_FIELD;
        this.rigId = init.rigId;
        this.danger = init.danger;
        this.dailyMod = init.dailyMod;
        this.build = resolveBuild(
            init.rigId,
            init.level,
            init.levelStats,
            init.weapons,
            init.modules,
            init.profile,
            init.danger,
            init.supply ?? 'none',
            init.dailyMod,
        );
        this.durationTicks = this.waveDef.durationSeconds * TICK_RATE;
        this.random = randomStream(init.seed ^ Math.imul(this.waveDef.wave + 11, 0x58a86197));
        this.bagRemaining = Math.max(0, Math.floor(init.carriedBagParts));

        const maxHp = this.build.stats.maxHp;
        this.player = {
            x: START.x,
            y: START.y,
            hp: clamp(Math.round(init.startHp), 1, maxHp),
            maxHp,
            invulnerableUntil: 0,
        };
        this.runtimes = init.weapons.map((instance, slot) => ({
            slot,
            instance,
            next: 0,
            swings: 0,
            combo: 0,
            lastHitTick: -999,
            heat: 0,
            wideSweepReady: false,
            totalDamage: 0,
            kills: 0,
            crits: 0,
        }));

        if (this.waveDef.bossWave) {
            this.spawnBoss(true);
        } else if (this.waveDef.eliteWave) {
            this.spawnBoss(false);
            if (this.danger >= 3) this.spawnDangerEscorts();
        } else if (this.danger >= 3 && this.waveDef.wave === 8) {
            this.spawnBoss(false, 0.8);
        }
    }

    get boss(): RogueliteEnemy | null {
        return this.bossUnit && this.bossUnit.hp > 0 ? this.bossUnit : null;
    }

    get remainingSeconds(): number {
        const limit = this.waveDef.bossWave ? this.durationTicks * 2 : this.durationTicks;
        return Math.max(0, Math.ceil((limit - this.tick) / TICK_RATE));
    }

    get waveCleared(): boolean {
        if (this.player.hp <= 0) return false;
        if (this.waveDef.bossWave) return this.bossDefeated;
        return this.tick >= this.durationTicks;
    }

    get finished(): boolean {
        if (this.player.hp <= 0) return true;
        if (this.waveDef.bossWave) return this.bossDefeated || this.tick >= this.durationTicks * 2;
        return this.tick >= this.durationTicks;
    }

    /** Emergency in-place rescue (Boss wave): clear bullets & regular mobs, restore 60% HP, grant 2s invulnerability. */
    reviveInPlace(): void {
        const hp = Math.max(1, Math.round(this.player.maxHp * 0.6));
        this.player.hp = hp;
        this.player.invulnerableUntil = this.tick + 60;
        this.bullets.length = 0;
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            if (this.enemies[i].kind !== 'boss') this.enemies.splice(i, 1);
        }
        this.warnings.length = 0;
        this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'induction', radius: 160, life: 16 });
        this.pushFloater(this.player.x, this.player.y + 24, '已复活', 'heal');
    }

    get bossView(): ChapterBossView | null {
        const b = this.bossUnit;
        if (!b || b.hp <= 0) return null;
        const kind: ChapterBossKind = b.bossKind && b.bossKind !== 'inspector' ? b.bossKind : 'elite';
        const hazard = b.bossHazard ? {
            ...b.bossHazard,
            state: (b.bossHazard.active ? 'active' : 'warning') as 'warning' | 'active',
        } : undefined;
        const volley = b.bossVolley && (b.state === 'warn' || b.state === 'dash') ? {
            pattern: b.bossVolley,
            state: (b.state === 'dash' ? 'active' : 'warning') as 'warning' | 'active',
        } : undefined;
        let instruction = '';
        if (b.state === 'open') instruction = UI_COPY.bossHints.open;
        else if (hazard?.shape === 'rect') instruction = UI_COPY.bossHints.rect;
        else if (hazard?.shape === 'sector') instruction = UI_COPY.bossHints.sector;
        else if (hazard?.shape === 'tether') instruction = UI_COPY.bossHints.tether;
        else if (volley) instruction = volley.pattern === 'fan' ? UI_COPY.bossHints.fan : UI_COPY.bossHints.ring;
        return {
            kind,
            title: this.waveDef.bossWave ? this.chapter.bossName : this.chapter.midBossName,
            hp: b.hp,
            maxHp: b.maxHp,
            stage: b.bossStage,
            vulnerable: b.state === 'open',
            recovering: b.state === 'open',
            phaseStartedAt: b.bossPhaseStartedAt,
            phaseEndsAt: b.next,
            instruction,
            facing: Math.atan2(b.facingY, b.facingX),
            ...(hazard ? { hazard } : {}),
            ...(volley ? { volley } : {}),
        };
    }

    meleeWindups(): readonly MeleeWindup[] {
        const windups: MeleeWindup[] = [];
        for (const rt of this.runtimes) {
            const tool = rt.instance.id;
            if (tool !== 'wrench' && tool !== 'bypass_wrench') continue;
            const remaining = rt.next - this.tick;
            if (remaining <= 0 || remaining > MELEE_WINDUP_TICKS) continue;
            const target = this.nearestFromWeapon(weaponDock(rt.slot, this.runtimes.length), this.effectiveReach(rt));
            if (!target) continue;
            const r = distance(this.player, target) || 1;
            windups.push({
                tool,
                slot: rt.slot,
                ux: (target.x - this.player.x) / r,
                uy: (target.y - this.player.y) / r,
                ageTicks: MELEE_WINDUP_TICKS - remaining,
            });
        }
        return windups;
    }

    /**
     * Lightweight read-only bridge matching the fields read by BattleSkinView & CampaignCombatView
     * so all existing 2D pixel art, 8-direction animations, and 6 floating weapons render identically.
     */
    toRenderBridge(): RenderBattleView {
        const bossView = this.bossView;
        const bossUnit = this.bossUnit;
        const mappedEnemies = this.enemies.map(e => ({
            id: e.id,
            kind: (e.kind === 'boss' ? 'inspector' : e.kind) as EnemyId,
            x: e.x,
            y: e.y,
            hp: e.hp,
            state: (e.state === 'stealth' ? 'warn' : e.state === 'open' || e.state === 'recover' ? 'walk' : e.state) as 'walk' | 'warn' | 'dash',
            next: e.next,
            vx: e.vx,
            vy: e.vy,
            marked: e.shockedUntil > this.tick || e.vulnerableUntil > this.tick,
            facingX: e.facingX,
            facingY: e.facingY,
            tether: e.tether,
            hitAt: e.hitAt,
            shotAt: e.shotAt,
            contactAt: e.contactAt,
            revealedAt: e.revealedAt,
        }));
        const bossMapped = bossUnit ? mappedEnemies.find(e => e.id === bossUnit.id) : undefined;
        return {
            field: this.field,
            player: this.player,
            tick: this.tick,
            tools: this.runtimes.map(rt => ({ id: rt.instance.id, mods: [] })),
            weaponCasts: this.weaponCasts,
            weaponImpacts: this.weaponImpacts,
            effects: this.effects,
            enemies: mappedEnemies,
            defeatedEnemies: this.defeatedEnemies,
            bullets: this.bullets,
            parts: this.drops.filter(d => d.kind === 'part'),
            warnings: this.warnings,
            chapterBoss: bossView,
            boss: bossMapped && bossUnit ? {
                unit: bossMapped,
                maxHp: bossUnit.maxHp,
                phase: bossUnit.state === 'open' ? 'recover' : bossUnit.state === 'warn' ? 'warning' : bossUnit.state === 'dash' ? 'volley' : 'patrol',
                attack: bossUnit.bossVolley ?? 'sweep',
                next: bossUnit.next,
                pattern: bossUnit.bossCycle,
                attackNumber: bossUnit.bossCycle,
                damagedPlayer: !!bossUnit.bossDamagedPlayer,
            } : null,
            playerAttack: this.playerAttack,
            playerHit: this.playerHit,
            rangedAimTarget: (slot: number) => this.nearest(this.player, this.effectiveReach(this.runtimes[slot])),
            meleeWindups: () => this.meleeWindups(),
        };
    }

    moveTo(x: number, y: number): void {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        this.destination = {
            x: clamp(x, this.field.left + 12, this.field.right - 12),
            y: clamp(y, this.field.bottom + 12, this.field.top - 12),
        };
    }

    step(inputX = 0, inputY = 0): void {
        if (this.finished) return;
        this.tick++;

        while (this.defeatedEnemies.length && this.tick - this.defeatedEnemies[0].hitAt >= 6) {
            this.defeatedEnemies.shift();
        }
        while (this.weaponCasts.length && this.tick - this.weaponCasts[0].tick >= WEAPON_CAST_HISTORY) {
            this.weaponCasts.shift();
        }
        while (this.weaponImpacts.length && this.tick - this.weaponImpacts[0].tick >= IMPACT_TICKS) {
            this.weaponImpacts.shift();
        }
        while (this.floaters.length && this.tick - this.floaters[0].bornTick >= 26) {
            this.floaters.shift();
        }

        // 1. Passive repair regen
        if (this.build.stats.repair > 0 && this.player.hp > 0 && this.player.hp < this.player.maxHp) {
            this.regenCarry += (this.build.stats.repair * 0.25) / TICK_RATE;
            if (this.regenCarry >= 1) {
                const gain = Math.floor(this.regenCarry);
                this.regenCarry -= gain;
                this.healPlayer(gain, false);
            }
        }

        // 2. Move player
        const prevPlayer = { x: this.player.x, y: this.player.y };
        this.movePlayer(inputX, inputY);

        // 3. Controlled dynamic wave spawning
        this.stepSpawner();
        if (!this.enemies.length && !this.warnings.length) this.emptyTicks++;

        // Breaker surge (D4 capstone): wave-opening shock ring + 6s attack speed burst
        if (this.tick === 1 && this.build.hasBreakerSurge) {
            this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'induction', radius: 140, life: 16 });
            this.pushFloater(this.player.x, this.player.y + 24, '开场电震', 'crit');
            const surgeDmg = Math.max(24, Math.round(45 + this.build.stats.voltage * 2.5));
            for (const e of [...this.enemies]) {
                if (this.canTarget(e) && distance(this.player, e) <= 140) {
                    this.applyDamage(e, surgeDmg, this.runtimes[0], false, false);
                }
            }
        }

        // Breaker surge (D4 capstone): wave-opening shock ring + 6s attack speed burst
        if (this.tick === 1 && this.build.hasBreakerSurge) {
            this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'induction', radius: 140, life: 16 });
            this.pushFloater(this.player.x, this.player.y + 24, '开场电震', 'crit');
            const surgeDmg = Math.max(24, Math.round(45 + this.build.stats.voltage * 2.5));
            for (const e of [...this.enemies]) {
                if (this.canTarget(e) && distance(this.player, e) <= 140) {
                    this.applyDamage(e, surgeDmg, this.runtimes[0], false, false);
                }
            }
        }

        // 4. Snapshot enemies for continuous melee collision, then move enemies & bullets
        const priorEnemies = this.activeMelees.length
            ? new Map(this.enemies.map(e => [e, { x: e.x, y: e.y }]))
            : undefined;
        this.stepEnemies();
        this.stepBullets();
        if (this.player.hp <= 0) return;

        // 5. Burn DoT ticks (every 15 ticks = 0.5s)
        if (this.tick % 15 === 0) this.stepBurnDots();

        // 6. Advance active melee sweeps & fire all 6 weapon slots
        if (priorEnemies) this.advanceMelees(priorEnemies, prevPlayer);
        for (const rt of this.runtimes) this.fireWeapon(rt);

        // 7. Collect drops
        this.stepDrops();

        // 8. Decay transient visual effects
        for (let i = this.effects.length - 1; i >= 0; i--) {
            if (--this.effects[i].life <= 0) this.effects.splice(i, 1);
        }
    }

    summary(): BattleWaveSummary {
        const leftoverOnGround = this.drops.filter(d => d.kind === 'part').reduce((s, d) => s + d.value, 0);
        const partsBagged = this.waveCleared ? Math.floor(leftoverOnGround * this.build.bagKeepRate) : 0;
        const damageByWeapon: WeaponDamageStat[] = this.runtimes.map(rt => ({
            slot: rt.slot,
            id: rt.instance.id,
            tier: rt.instance.tier,
            totalDamage: Math.round(rt.totalDamage),
            kills: rt.kills,
            crits: rt.crits,
        }));
        return {
            wave: this.waveDef.wave,
            stationName: this.stationName,
            cleared: this.waveCleared,
            elapsedSeconds: this.tick / TICK_RATE,
            kills: this.kills,
            elitesKilled: this.elitesKilled,
            partsCollected: this.partsCollected,
            partsBagged,
            bagRedeemed: this.bagRedeemed,
            xpGained: this.xpGained,
            damageTaken: this.damageTaken,
            hitsTaken: this.hitsTaken,
            healed: this.healed,
            endHp: this.player.hp,
            maxHp: this.player.maxHp,
            defeatedBy: this.player.hp <= 0 ? this.lastHitSource : null,
            hitSources: { ...this.hitSources },
            damageByWeapon,
            emptySeconds: this.emptyTicks / TICK_RATE,
        };
    }

    private pushFloater(x: number, y: number, text: string, kind: FloatingText['kind']): void {
        if (this.floaters.length >= 24) this.floaters.shift();
        this.floaters.push({ x, y, text, kind, bornTick: this.tick });
    }

    private healPlayer(amount: number, showFloater = true): void {
        if (amount <= 0 || this.player.hp <= 0) return;
        const before = this.player.hp;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
        const gained = this.player.hp - before;
        this.healed += gained;
        if (showFloater && gained > 0) this.pushFloater(this.player.x, this.player.y + 18, `+${gained}`, 'heal');
    }

    private movePlayer(inputX: number, inputY: number): void {
        const speed = PLAYER_BASE_SPEED * (1 + this.build.stats.moveSpeed / 100);
        if (this.destination) {
            const dx = this.destination.x - this.player.x;
            const dy = this.destination.y - this.player.y;
            const d = Math.hypot(dx, dy);
            if (d <= speed) {
                this.player.x = this.destination.x;
                this.player.y = this.destination.y;
                this.destination = null;
            } else {
                this.player.x += (dx / d) * speed;
                this.player.y += (dy / d) * speed;
            }
            return;
        }
        const ax = Number.isFinite(inputX) ? clamp(inputX, -1, 1) : 0;
        const ay = Number.isFinite(inputY) ? clamp(inputY, -1, 1) : 0;
        const mag = Math.max(1, Math.hypot(ax, ay));
        this.player.x = clamp(this.player.x + (speed * ax) / mag, this.field.left + 12, this.field.right - 12);
        this.player.y = clamp(this.player.y + (speed * ay) / mag, this.field.bottom + 12, this.field.top - 12);
    }

    private spawnBoss(isChapterBoss: boolean, hpScale = 1.0): void {
        const hp = Math.max(100, Math.round(bossHpForWave(this.waveDef.wave, this.chapter.enemyScale, this.danger, isChapterBoss) * hpScale));
        const dmg = Math.round((isChapterBoss ? 20 : 15) * Math.sqrt(this.chapter.enemyScale) * (1 + this.danger * 0.12));
        const unit: RogueliteEnemy = {
            id: this.nextEnemyId++,
            kind: 'boss',
            bossKind: isChapterBoss ? this.chapter.bossKind : this.chapter.midBossKind,
            x: START.x,
            y: Math.min(this.field.top - 40, this.player.y + 150),
            hp,
            maxHp: hp,
            damage: dmg,
            speed: isChapterBoss ? 58 : 52,
            radius: isChapterBoss ? 22 : 18,
            parts: isChapterBoss ? 30 : 16,
            xp: isChapterBoss ? 40 : 22,
            isElite: true,
            state: 'walk',
            next: 45,
            vx: 0,
            vy: -1,
            facingX: 0,
            facingY: -1,
            sprintTicks: 0,
            shockedUntil: 0,
            vulnerableUntil: 0,
            vulnerableBonus: 0,
            burnStacks: 0,
            burnDamage: 0,
            burnUntil: 0,
            slowUntil: 0,
            nextShift: 0,
            bossCycle: 0,
            bossStage: 1,
            bossPhaseStartedAt: 0,
        };
        this.enemies.push(unit);
        this.bossUnit = unit;
    }

    private spawnDangerEscorts(): void {
        const escorts: readonly RegularEnemyId[] = ['armored', 'pursuer'];
        escorts.forEach((kind, idx) => {
            const x = clamp(START.x + (idx === 0 ? -56 : 56), this.field.left + 16, this.field.right - 16);
            const y = Math.min(this.field.top - 48, this.player.y + 132);
            this.warnings.push({ kind, x, y, at: this.tick + SPAWN_WARNING_TICKS });
        });
    }

    private stepSpawner(): void {
        const countScale = this.build.enemyCountScale * (1 + this.danger * 0.08);
        const target = Math.round(this.waveDef.targetActive * countScale);
        const maxActive = Math.round(this.waveDef.maxActive * countScale);
        const active = this.enemies.length + this.warnings.length;

        const emptyBurst = !this.waveDef.bossWave && active < 2 && this.tick >= this.nextSpawnTick - 12;
        if (active < maxActive && (emptyBurst || this.tick >= this.nextSpawnTick)) {
            const batch = this.waveDef.bossWave ? 1
                : this.waveDef.wave === 1 ? (active < 2 ? 2 : 1)
                : active < target * 0.45 ? 2 : 1;
            for (let i = 0; i < batch && this.enemies.length + this.warnings.length < maxActive; i++) {
                this.queueRegularEnemy();
            }
            const cadence = active < target
                ? Math.max(10, Math.round(this.waveDef.spawnIntervalTicks * 0.85))
                : Math.round(this.waveDef.spawnIntervalTicks * 1.15);
            this.nextSpawnTick = this.tick + cadence;
        }

        while (this.warnings.length && this.warnings[0].at <= this.tick) {
            const cue = this.warnings.shift()!;
            const stats = enemyStatsForWave(cue.kind, this.waveDef.wave, this.chapter.enemyScale, this.danger);
            const arch = ENEMY_ARCHETYPES[cue.kind];
            this.enemies.push({
                id: this.nextEnemyId++,
                kind: cue.kind,
                x: cue.x,
                y: cue.y,
                hp: stats.hp,
                maxHp: stats.hp,
                damage: stats.damage,
                speed: stats.speed,
                radius: arch.radius,
                parts: stats.parts,
                xp: stats.xp,
                state: cue.kind === 'ambusher' ? 'stealth' : 'walk',
                next: this.tick + 30,
                vx: 0,
                vy: -1,
                facingX: 0,
                facingY: -1,
                sprintTicks: 0,
                shockedUntil: 0,
                vulnerableUntil: 0,
                vulnerableBonus: 0,
                burnStacks: 0,
                burnDamage: 0,
                burnUntil: 0,
                slowUntil: 0,
                nextShift: 0,
                bossCycle: 0,
                bossStage: 1,
                bossPhaseStartedAt: 0,
            });
        }
    }

    private queueRegularEnemy(): void {
        let kind: RegularEnemyId = this.waveDef.roster[0].kind;
        // D2+ Grid Overload or Daily Arc Overdrive introduces jammers from Wave 4 onward on non-boss waves.
        if ((this.danger >= 2 || this.dailyMod === 'arc_overdrive') && this.waveDef.wave >= 4 && !this.waveDef.bossWave && this.random() < 0.12) {
            kind = 'jammer';
        } else {
            const totalWeight = this.waveDef.roster.reduce((s, r) => s + r.weight, 0);
            let roll = this.random() * totalWeight;
            for (const entry of this.waveDef.roster) {
                roll -= entry.weight;
                if (roll <= 0) { kind = entry.kind; break; }
            }
        }
        const angle = this.random() * TAU;
        const dist = 135 + this.random() * 85;
        const x = clamp(this.player.x + Math.cos(angle) * dist, this.field.left + 16, this.field.right - 16);
        const y = clamp(this.player.y + Math.sin(angle) * dist, this.field.bottom + 16, this.field.top - 16);
        this.warnings.push({ kind, x, y, at: this.tick + SPAWN_WARNING_TICKS });
    }

    private stepEnemies(): void {
        const wasJammed = this.isJammed;
        this.isJammed = false;
        for (const enemy of this.enemies) {
            if (enemy.hp <= 0) continue;
            if (enemy.kind === 'boss') {
                this.stepBoss(enemy);
                continue;
            }
            const dx = this.player.x - enemy.x;
            const dy = this.player.y - enemy.y;
            const dist = Math.hypot(dx, dy) || 1;
            const slowMult = enemy.slowUntil > this.tick ? 0.75 : 1.0;
            const stepSpeed = (enemy.speed / TICK_RATE) * slowMult;

            switch (enemy.kind) {
                case 'charger': {
                    if (enemy.state === 'warn' && this.tick >= enemy.next) {
                        enemy.state = 'dash';
                        enemy.next = this.tick + 18;
                        this.enemyAttackCue = 'melee';
                        this.enemyAttackSerial++;
                    } else if (enemy.state === 'dash') {
                        enemy.x += enemy.vx * 7.4;
                        enemy.y += enemy.vy * 7.4;
                        if (this.tick >= enemy.next) { enemy.state = 'walk'; enemy.next = this.tick + 54; }
                    } else if (dist < 175 && this.tick >= enemy.next) {
                        enemy.state = 'warn';
                        enemy.next = this.tick + 22;
                        enemy.vx = dx / dist;
                        enemy.vy = dy / dist;
                        this.warningKind = 'charge';
                        this.warningSerial++;
                    } else {
                        enemy.x += (dx / dist) * stepSpeed;
                        enemy.y += (dy / dist) * stepSpeed;
                    }
                    break;
                }
                case 'turret': {
                    if (enemy.state === 'warn' && this.tick >= enemy.next) {
                        enemy.state = 'walk';
                        enemy.next = this.tick + 68;
                        if (this.bullets.length < MAX_BULLETS) {
                            this.bullets.push({
                                x: enemy.x, y: enemy.y,
                                vx: enemy.vx * 3.35, vy: enemy.vy * 3.35,
                                damage: enemy.damage, source: 'projectile',
                            });
                            enemy.shotAt = this.tick;
                            this.enemyAttackCue = 'projectile';
                            this.enemyAttackSerial++;
                        }
                    } else if (enemy.state === 'walk') {
                        if (dist < 195 && this.tick >= enemy.next) {
                            enemy.state = 'warn';
                            enemy.next = this.tick + 22;
                            enemy.vx = dx / dist;
                            enemy.vy = dy / dist;
                            this.warningKind = 'warning';
                            this.warningSerial++;
                        } else if (dist >= 185) {
                            enemy.x += (dx / dist) * stepSpeed;
                            enemy.y += (dy / dist) * stepSpeed;
                        }
                    }
                    break;
                }
                case 'armored': {
                    const angle = Math.atan2(enemy.facingY, enemy.facingX);
                    const target = Math.atan2(dy, dx);
                    const delta = Math.atan2(Math.sin(target - angle), Math.cos(target - angle));
                    const nextAngle = angle + clamp(delta, -0.055, 0.055);
                    enemy.facingX = Math.cos(nextAngle);
                    enemy.facingY = Math.sin(nextAngle);
                    enemy.x += enemy.facingX * stepSpeed;
                    enemy.y += enemy.facingY * stepSpeed;
                    break;
                }
                case 'pursuer': {
                    const ux = dx / dist, uy = dy / dist;
                    enemy.sprintTicks = ux * enemy.vx + uy * enemy.vy > 0.8 ? enemy.sprintTicks + 1 : 0;
                    enemy.vx = ux;
                    enemy.vy = uy;
                    enemy.state = enemy.sprintTicks >= 34 ? 'dash' : 'walk';
                    const boost = enemy.state === 'dash' ? 1.45 : 1.0;
                    enemy.x += ux * stepSpeed * boost;
                    enemy.y += uy * stepSpeed * boost;
                    break;
                }
                case 'jammer': {
                    if (enemy.state === 'warn' && this.tick >= enemy.next) {
                        enemy.state = 'dash';
                        enemy.next = this.tick + 75;
                        this.enemyAttackCue = 'area';
                        this.enemyAttackSerial++;
                    } else if (enemy.state === 'dash') {
                        if (dist <= 68) this.isJammed = true;
                        if (this.tick >= enemy.next) { enemy.state = 'walk'; enemy.next = this.tick + 55; }
                    } else if (dist <= 68 && this.tick >= enemy.next) {
                        enemy.state = 'warn';
                        enemy.next = this.tick + 24;
                        this.warningKind = 'warning';
                        this.warningSerial++;
                    } else {
                        enemy.x += (dx / dist) * stepSpeed;
                        enemy.y += (dy / dist) * stepSpeed;
                    }
                    break;
                }
                case 'ambusher': {
                    if (enemy.state === 'stealth') {
                        enemy.x += (dx / dist) * stepSpeed * 1.3;
                        enemy.y += (dy / dist) * stepSpeed * 1.3;
                        if (dist <= 95 && this.tick >= enemy.next) {
                            enemy.state = 'warn';
                            enemy.next = this.tick + 22;
                            enemy.vx = dx / dist;
                            enemy.vy = dy / dist;
                            enemy.revealedAt = this.tick;
                            this.warningKind = 'warning';
                            this.warningSerial++;
                        }
                    } else if (enemy.state === 'warn' && this.tick >= enemy.next) {
                        enemy.state = 'dash';
                        enemy.next = this.tick + 12;
                        this.enemyAttackCue = 'melee';
                        this.enemyAttackSerial++;
                    } else if (enemy.state === 'dash') {
                        enemy.x += enemy.vx * 6.8;
                        enemy.y += enemy.vy * 6.8;
                        if (this.tick >= enemy.next) {
                            enemy.state = 'recover';
                            enemy.next = this.tick + 36;
                            enemy.vulnerableUntil = Math.max(enemy.vulnerableUntil, this.tick + 36);
                            enemy.vulnerableBonus = Math.max(enemy.vulnerableBonus, 0.35);
                        }
                    } else if (enemy.state === 'recover' && this.tick >= enemy.next) {
                        enemy.state = 'stealth';
                        enemy.next = this.tick + 35;
                    }
                    break;
                }
                case 'reclaimer': {
                    if (enemy.state === 'walk') {
                        if (dist < 82 && this.tick >= enemy.next) {
                            const aim = Math.atan2(dy, dx);
                            enemy.tether = fieldRayEnd(enemy, Math.cos(aim), Math.sin(aim), 94, this.field);
                            enemy.tetherHit = false;
                            enemy.state = 'warn';
                            enemy.next = this.tick + 28;
                            this.warningKind = 'warning';
                            this.warningSerial++;
                        } else {
                            enemy.x += (dx / dist) * stepSpeed;
                            enemy.y += (dy / dist) * stepSpeed;
                        }
                    } else if (enemy.state === 'warn' && this.tick >= enemy.next) {
                        enemy.state = 'dash';
                        enemy.next = this.tick + 28;
                        this.enemyAttackCue = 'area';
                        this.enemyAttackSerial++;
                    } else if (enemy.state === 'dash') {
                        if (!enemy.tetherHit && enemy.tether && distanceToSegment(this.player, enemy, enemy.tether) < 11) {
                            enemy.tetherHit = true;
                            if (this.hurtPlayer(enemy.damage, 'reclaimer_cable', enemy)) {
                                const pull = Math.min(16, Math.max(0, dist - 22));
                                this.player.x = clamp(this.player.x - (dx / dist) * pull, this.field.left + 12, this.field.right - 12);
                                this.player.y = clamp(this.player.y - (dy / dist) * pull, this.field.bottom + 12, this.field.top - 12);
                            }
                        }
                        if (this.tick >= enemy.next) {
                            enemy.tether = undefined;
                            enemy.state = enemy.tetherHit ? 'walk' : 'recover';
                            enemy.next = this.tick + (enemy.tetherHit ? 65 : 36);
                            if (!enemy.tetherHit) {
                                enemy.vulnerableUntil = Math.max(enemy.vulnerableUntil, this.tick + 36);
                                enemy.vulnerableBonus = Math.max(enemy.vulnerableBonus, 0.25);
                            }
                        }
                    } else if (enemy.state === 'recover' && this.tick >= enemy.next) {
                        enemy.state = 'walk';
                        enemy.next = this.tick + 45;
                    }
                    break;
                }
                default: {
                    enemy.x += (dx / dist) * stepSpeed;
                    enemy.y += (dy / dist) * stepSpeed;
                    break;
                }
            }

            enemy.x = clamp(enemy.x, this.field.left + 8, this.field.right - 8);
            enemy.y = clamp(enemy.y, this.field.bottom + 8, this.field.top - 8);

            if (enemy.state !== 'stealth' && distance(enemy, this.player) < enemy.radius + 9) {
                const src: DamageSource = enemy.kind === 'reclaimer' ? 'reclaimer_body' : enemy.kind;
                if (this.hurtPlayer(enemy.damage, src, enemy)) enemy.contactAt = this.tick;
            }
        }
        if (this.isJammed && !wasJammed) {
            this.pushFloater(this.player.x, this.player.y + 22, '攻速降低', 'jam');
        }
    }

    private stepBoss(boss: RogueliteEnemy): void {
        const dx = this.player.x - boss.x;
        const dy = this.player.y - boss.y;
        const dist = Math.hypot(dx, dy) || 1;
        const ratio = boss.hp / boss.maxHp;
        boss.bossStage = boss.bossKind === 'core' ? (ratio <= 0.35 ? 3 : ratio <= 0.7 ? 2 : 1) : ratio <= 0.5 ? 2 : 1;

        if (boss.state === 'walk') {
            boss.facingX = dx / dist;
            boss.facingY = dy / dist;
            if (dist > 90) {
                const step = boss.speed / TICK_RATE;
                boss.x = clamp(boss.x + boss.facingX * step, this.field.left + 22, this.field.right - 22);
                boss.y = clamp(boss.y + boss.facingY * step, this.field.bottom + 22, this.field.top - 22);
            }
            if (this.tick >= boss.next) {
                const cycle = boss.bossCycle++;
                boss.bossDamagedPlayer = false;
                boss.state = 'warn';
                boss.bossPhaseStartedAt = this.tick;
                const fastBoss = this.danger >= 4 || this.dailyMod === 'turbo_shift';
                const warnBase = fastBoss ? 30 : 34;
                boss.next = this.tick + Math.max(fastBoss ? 20 : 24, warnBase - boss.bossStage * 3);
                this.warningKind = 'warning';
                this.warningSerial++;
                if (cycle % 2 === 1) {
                    boss.bossVolley = boss.bossStage >= 2 || boss.bossKind === 'tow' || boss.bossKind === 'silence' ? 'ring' : 'fan';
                    boss.bossHazard = undefined;
                } else {
                    boss.bossVolley = undefined;
                    boss.bossHazard = this.createBossHazard(boss, dist, cycle);
                }
            }
        } else if (boss.state === 'warn' && this.tick >= boss.next) {
            boss.state = 'dash';
            boss.bossPhaseStartedAt = this.tick;
            if (boss.bossVolley) {
                boss.next = this.tick + 18;
                this.fireBossVolley(boss, boss.bossVolley, false);
            } else if (boss.bossHazard) {
                boss.bossHazard.active = true;
                boss.next = this.tick + 22;
                this.enemyAttackCue = 'area';
                this.enemyAttackSerial++;
            }
        } else if (boss.state === 'dash') {
            if (boss.bossVolley && this.tick === boss.next - 8) {
                this.fireBossVolley(boss, boss.bossVolley, true);
            }
            if (boss.bossHazard?.active && !boss.bossDamagedPlayer && this.inBossHazard(boss.bossHazard, this.player)) {
                boss.bossDamagedPlayer = true;
                this.hurtPlayer(Math.round(boss.damage * 1.25), 'boss_skill', boss);
            }
            if (this.tick >= boss.next) {
                boss.bossHazard = undefined;
                boss.bossVolley = undefined;
                const fastBoss = this.danger >= 4 || this.dailyMod === 'turbo_shift';
                boss.state = 'open';
                boss.bossPhaseStartedAt = this.tick;
                boss.next = this.tick + (fastBoss ? 44 : 56);
            }
        } else if (boss.state === 'open' && this.tick >= boss.next) {
            const fastBoss = this.danger >= 4 || this.dailyMod === 'turbo_shift';
            boss.state = 'walk';
            boss.bossPhaseStartedAt = this.tick;
            boss.next = this.tick + (fastBoss ? 15 : 22);
        }

        if (distance(boss, this.player) < boss.radius + 10) {
            if (this.hurtPlayer(boss.damage, 'boss_contact', boss)) boss.contactAt = this.tick;
        }
    }

    private createBossHazard(boss: RogueliteEnemy, dist: number, cycle: number): NonNullable<RogueliteEnemy['bossHazard']> {
        const angle = Math.atan2(boss.facingY, boss.facingX);
        if (boss.bossKind === 'tow' || (boss.bossKind === 'core' && boss.bossStage === 2)) {
            const end = fieldRayEnd(boss, Math.cos(angle), Math.sin(angle), Math.min(260, dist + 55), this.field);
            return { shape: 'tether', x: boss.x, y: boss.y, end, width: 16, active: false };
        }
        if (boss.bossKind === 'silence' || (boss.bossKind === 'core' && boss.bossStage === 1)) {
            const sweep = (2 * TAU) / 3;
            const shift = (cycle % 2 ? -1 : 1) * (Math.PI / 6);
            return { shape: 'sector', x: boss.x, y: boss.y, radius: 220, from: angle + shift - sweep / 2, sweep, active: false };
        }
        const horizontal = Math.abs(boss.facingX) > Math.abs(boss.facingY);
        const half = boss.bossKind === 'gatekeeper' ? 42 : 28;
        return horizontal
            ? { shape: 'rect', left: this.field.left, right: this.field.right, bottom: this.player.y - half, top: this.player.y + half, active: false }
            : { shape: 'rect', left: this.player.x - half, right: this.player.x + half, bottom: this.field.bottom, top: this.field.top, active: false };
    }

    private inBossHazard(h: NonNullable<RogueliteEnemy['bossHazard']>, p: Readonly<Position>): boolean {
        if (h.shape === 'rect') return p.x > h.left && p.x < h.right && p.y > h.bottom && p.y < h.top;
        if (h.shape === 'tether') return distanceToSegment(p, h, h.end) < h.width;
        const a = Math.atan2(p.y - h.y, p.x - h.x);
        return distance(p, h) < h.radius && ((a - h.from + 2 * TAU) % TAU) < h.sweep;
    }

    private fireBossVolley(boss: RogueliteEnemy, pattern: 'fan' | 'ring', second: boolean): void {
        const fan = pattern === 'fan';
        const count = fan ? (boss.bossStage >= 2 ? 7 : 5) : (boss.bossStage >= 2 ? 12 : 8);
        const sep = fan ? 0.24 : TAU / count;
        const heading = Math.atan2(boss.facingY, boss.facingX);
        const start = heading - (fan ? (sep * (count - 1)) / 2 : 0) + (second ? sep / 2 : 0);
        const bulletDmg = Math.max(8, Math.round(boss.damage * 0.72));
        for (let i = 0; i < count && this.bullets.length < MAX_BULLETS; i++) {
            const a = start + i * sep;
            const spd = fan ? 4.1 : 3.2;
            this.bullets.push({
                x: boss.x + Math.cos(a) * 20, y: boss.y + Math.sin(a) * 20,
                vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
                damage: bulletDmg, source: 'boss_bullet', boss: true,
            });
        }
        this.enemyAttackCue = 'projectile';
        this.enemyAttackSerial++;
    }

    private stepBullets(): void {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            const hit = distance(b, this.player) < 11;
            if (hit) this.hurtPlayer(b.damage, b.source);
            if (hit || b.x < this.field.left || b.x > this.field.right || b.y < this.field.bottom || b.y > this.field.top) {
                this.bullets.splice(i, 1);
            }
        }
    }

    private hurtPlayer(rawDamage: number, source: DamageSource, attacker?: RogueliteEnemy): boolean {
        if (this.tick < this.player.invulnerableUntil || this.player.hp <= 0) return false;
        const dealt = incomingDamage(rawDamage, this.build.stats.armor);
        this.player.invulnerableUntil = this.tick + PLAYER_HIT_GRACE;
        this.player.hurtAt = this.tick;
        this.playerHit = { x: this.player.x, y: this.player.y };
        this.player.hp = Math.max(0, this.player.hp - dealt);
        this.damageTaken += dealt;
        this.hitsTaken++;
        this.lastHitSource = source;
        this.hitSources[source] = (this.hitSources[source] ?? 0) + 1;

        if (this.build.hasArmorThorns && this.build.stats.armor > 0) {
            const thornsDmg = Math.max(8, Math.round(this.build.stats.armor * 5));
            for (const e of [...this.enemies]) {
                if (e.hp > 0 && distance(this.player, e) <= 85) {
                    this.applyDamage(e, thornsDmg, this.runtimes[0], false, false);
                }
            }
        } else if (attacker && this.build.hasArmorThorns) {
            this.applyDamage(attacker, 12, this.runtimes[0], false, false);
        }
        return true;
    }

    private stepBurnDots(): void {
        const thermalTier = synergyTier(this.build.synergies, 'thermal');
        const welderMult = this.rigId === 'thermal_welder' ? 1.5 : 1.0;
        for (const e of [...this.enemies]) {
            if (e.hp <= 0 || e.burnStacks <= 0) continue;
            if (this.tick > e.burnUntil) { e.burnStacks = 0; continue; }
            const tickDmg = Math.max(2, Math.round(e.burnDamage * e.burnStacks * welderMult * (thermalTier >= 4 ? 1.25 : 1.0)));
            const thermalRt = this.runtimes.find(r => WEAPON_CATALOG[r.instance.id].tags.includes('thermal')) ?? this.runtimes[0];
            this.applyDamage(e, tickDmg, thermalRt, false, false);
        }
    }

    private canTarget(e: RogueliteEnemy): boolean {
        return e.hp > 0 && e.state !== 'stealth';
    }

    private effectiveReach(rt: WeaponRuntime): number {
        const spec = WEAPON_CATALOG[rt.instance.id];
        let reach = spec.tiers[rt.instance.tier - 1].reach;
        if (spec.tags.includes('melee')) {
            const mTier = synergyTier(this.build.synergies, 'melee');
            reach *= mTier === 6 ? 1.32 : mTier === 4 ? 1.22 : mTier === 2 ? 1.12 : 1.0;
        }
        if (spec.tags.includes('control')) {
            const cTier = synergyTier(this.build.synergies, 'control');
            reach *= cTier === 6 ? 1.42 : cTier === 4 ? 1.28 : cTier === 2 ? 1.15 : 1.0;
        }
        if (spec.tags.includes('ballistic') && synergyTier(this.build.synergies, 'ballistic') >= 4) {
            reach *= 1.15;
        }
        return reach;
    }

    private emitHitEffect(enemy: RogueliteEnemy, cast: WeaponCast, kind: SkillKind, from: Position, lethal: boolean, isPull = false): void {
        const weight = enemy === this.bossUnit ? (lethal ? 'boss-break' : 'armor') : (lethal ? 'break' : 'strike');
        const base = { x: enemy.x, y: enemy.y, life: 7, weight, sourceCast: cast } as const;
        if (kind === 'arc') {
            this.effects.push({ ...base, kind: 'arc', shape: 'link', from: { x: from.x, y: from.y }, fromWeapon: from === this.player ? true : undefined });
        } else {
            this.effects.push({ ...base, kind, shape: 'impact', ...(isPull ? { pullFrom: { x: from.x, y: from.y } } : {}) });
        }
        if (this.weaponImpacts.length >= 36) this.weaponImpacts.shift();
        this.weaponImpacts.push({ cast, x: enemy.x, y: enemy.y, tick: this.tick, weight, rank: 0 });
    }

    private fireWeapon(rt: WeaponRuntime): void {
        if (this.tick < rt.next) return;
        const { id, tier } = rt.instance;
        const spec = WEAPON_CATALOG[id];
        const tierSpec = spec.tiers[tier - 1];
        const reach = this.effectiveReach(rt);
        const dock = weaponDock(rt.slot, this.runtimes.length);

        const target = isMeleeTool(id)
            ? this.nearestFromWeapon(dock, reach)
            : this.nearest(this.player, reach);
        if (!target) {
            rt.heat = Math.max(0, rt.heat - 0.05);
            return;
        }

        const surgeSpeed = this.build.hasBreakerSurge && this.tick <= 180 ? 45 : 0;
        const cd = computeWeaponCooldown(tierSpec.cooldownTicks, this.build.stats.cycleSpeed + surgeSpeed, this.isJammed);
        rt.next = this.tick + cd;

        const targetRange = distance(this.player, target) || 1;
        const ux = (target.x - this.player.x) / targetRange;
        const uy = (target.y - this.player.y) / targetRange;
        this.playerAttack = { tick: this.tick, x: ux, y: uy };
        this.weaponAttackCue = WEAPON_ATTACK_CUES[id];
        this.weaponAttackSerial++;

        const effectBoost = tier - 1;
        const modified = tier >= 3 ? true : undefined;

        if (isMeleeTool(id)) {
            const wide = id === 'wrench' && tier >= 3 && rt.wideSweepReady;
            rt.wideSweepReady = false;
            const comboFinisher = id === 'bypass_wrench' && rt.combo === 3;
            const bonusMult = wide ? 1.35 : comboFinisher ? (tier >= 3 ? 2.2 : 1.75) : 1.0;
            const forceCrit = comboFinisher && tier >= 3;
            const motion = createMeleeMotion(id as MeleeTool, rt.swings++, dock, this.player, ux, uy, reach, this.field, targetRange, wide);
            const cast: WeaponCast & { readonly melee: MeleeMotion; readonly tool: MeleeTool } = {
                tool: id as MeleeTool,
                slot: rt.slot,
                x: this.player.x,
                y: this.player.y,
                ux,
                uy,
                targetRange,
                tick: this.tick,
                effectBoost: Math.min(3, effectBoost + (wide ? 2 : 0)),
                ...(modified ? { modified } : {}),
                ...(wide || comboFinisher ? { powered: true } : {}),
                melee: motion,
            };
            this.weaponCasts.push(cast);
            this.activeMelees.push({ runtime: rt, cast, startTick: this.tick, struck: new Set(), bonusMult, forceCrit, wide, landed: 0 });
            rt.next = Math.max(rt.next, this.tick + motion.last + MELEE_RETURN_TICKS);
            return;
        }

        const powered = id === 'torch' && tier >= 3 && rt.heat >= 3 ? true : undefined;
        const cast: WeaponCast = {
            tool: id,
            slot: rt.slot,
            x: this.player.x,
            y: this.player.y,
            ux,
            uy,
            targetRange,
            tick: this.tick,
            ...(effectBoost ? { effectBoost } : {}),
            ...(modified ? { modified } : {}),
            ...(powered ? { powered } : {}),
        };
        this.weaponCasts.push(cast);

        if (id === 'arc_gun') {
            this.strikeEnemy(target, rt, this.player, 1.0, false, cast);
            const baseHops = (tierSpec.hops ?? 2) + this.extraArcHops();
            this.chainArc(target, rt, baseHops, tier >= 3 ? 1.0 : 0.78, cast);
            if (tier >= 4) this.chainArc(target, rt, Math.max(2, baseHops - 1), 0.72, cast);
            return;
        }

        if (id === 'induction') {
            this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'induction', radius: reach, life: 12, sourceCast: cast });
            const hits = this.enemies.filter(e => this.canTarget(e) && distance(this.player, e) <= reach);
            for (const e of hits) {
                this.strikeEnemy(e, rt, this.player, 1.0, false, cast);
                if (tier >= 3) e.slowUntil = Math.max(e.slowUntil, this.tick + 45);
                this.applyControlTag(e, rt, 0.15, cast);
            }
            if (tier >= 4 && hits.length) this.chainArc(hits[0], rt, 2 + this.extraArcHops(), 0.85, cast);
            return;
        }

        if (id === 'traction_coil') {
            this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'induction', radius: reach, life: 10, sourceCast: cast });
            const count = tierSpec.extraTargets ?? 2;
            const hits = this.enemies.filter(e => this.canTarget(e) && distance(this.player, e) <= reach)
                .sort((a, b) => distance(this.player, a) - distance(this.player, b))
                .slice(0, count);
            for (const e of hits) {
                this.strikeEnemy(e, rt, this.player, 1.0, false, cast, true);
                this.displaceEnemy(e, -24 - tier * 3);
                this.applyControlTag(e, rt, tier >= 3 ? 0.25 : 0.15, cast);
            }
            return;
        }

        if (id === 'split_probe') {
            const count = tierSpec.extraTargets ?? 2;
            const hits = this.enemies.filter(e => this.canTarget(e) && distance(this.player, e) <= reach)
                .sort((a, b) => distance(this.player, a) - distance(this.player, b))
                .slice(0, count);
            for (const e of hits) {
                const len = distance(this.player, e) || 1;
                this.effects.push({
                    x: this.player.x, y: this.player.y, shape: 'strip', kind: 'shot',
                    ux: (e.x - this.player.x) / len, uy: (e.y - this.player.y) / len, length: len, halfWidth: 2, life: 7, sourceCast: cast,
                });
                this.strikeEnemy(e, rt, this.player, 1.0, false, cast);
            }
            if (tier >= 4 && hits.length === 1) this.strikeEnemy(hits[0], rt, this.player, 0.85, false, cast);
            return;
        }

        if (id === 'riveter' || id === 'hydraulic_nailer') {
            const ballisticTier = synergyTier(this.build.synergies, 'ballistic');
            const extraPierce = ballisticTier === 6 ? 2 : ballisticTier === 4 ? 1 : 0;
            const maxHits = 1 + (tierSpec.pierce ?? 1) + extraPierce;
            const halfWidth = (id === 'hydraulic_nailer' ? 11 : 13) + (tier >= 3 ? 4 : 0);
            this.effects.push({
                x: this.player.x, y: this.player.y, shape: 'strip', kind: 'shot',
                ux, uy, length: reach, halfWidth, life: 7, sourceCast: cast,
            });
            const hits = this.enemies.filter(e => {
                if (!this.canTarget(e)) return false;
                if (e === target) return true;
                const ex = e.x - this.player.x, ey = e.y - this.player.y;
                const along = ex * ux + ey * uy;
                const side = Math.abs(ex * uy - ey * ux);
                return along > 0 && along <= reach && side <= halfWidth + e.radius * 0.5;
            }).sort((a, b) => distance(this.player, a) - distance(this.player, b)).slice(0, maxHits);

            hits.forEach((e, idx) => {
                const pierceScale = id === 'riveter' && tier >= 3 ? 1 + idx * 0.12 : 1.0;
                const res = this.strikeEnemy(e, rt, this.player, pierceScale, false, cast);
                if (id === 'hydraulic_nailer' && tier >= 4 && res?.isCrit) {
                    for (const near of [...this.enemies]) {
                        if (near !== e && this.canTarget(near) && distance(e, near) <= 46) {
                            this.applyDamage(near, Math.round(res.damage * 0.25), rt, false, false);
                        }
                    }
                }
            });
            return;
        }

        // Thermal cones: torch & pulse_nozzle
        const thermalTier = synergyTier(this.build.synergies, 'thermal');
        let bonusMult = 1.0;
        if (id === 'torch') {
            rt.heat++;
            if (tier >= 3 && rt.heat >= 4) bonusMult = 1.4;
            if (rt.heat >= 8) {
                rt.heat = 0;
                if (thermalTier === 6) {
                    this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'magnet', radius: 105, life: 12, sourceCast: cast });
                    for (const e of [...this.enemies]) {
                        if (this.canTarget(e) && distance(this.player, e) <= 105) {
                            this.strikeEnemy(e, rt, this.player, 1.35, false, cast);
                        }
                    }
                }
            }
        }
        const slope = id === 'torch' ? 0.72 : 0.68;
        this.effects.push({
            x: this.player.x, y: this.player.y, shape: 'sector', kind: 'heat',
            ux, uy, radius: reach, slope, life: 7, sourceCast: cast,
        });
        const hits = this.enemies.filter(e => {
            if (!this.canTarget(e)) return false;
            if (e === target) return true;
            const ex = e.x - this.player.x, ey = e.y - this.player.y;
            const along = ex * ux + ey * uy;
            const side = Math.abs(ex * uy - ey * ux);
            return along > 0 && distance(this.player, e) <= reach && side <= along * slope + e.radius * 0.4;
        });
        for (const e of hits) {
            this.strikeEnemy(e, rt, this.player, bonusMult, false, cast);
            if (id === 'pulse_nozzle') {
                this.displaceEnemy(e, tier >= 3 ? 32 : 18);
                this.applyControlTag(e, rt, tier >= 3 ? 0.20 : 0.15, cast);
            }
        }
    }

    private advanceMelees(priorEnemies: ReadonlyMap<RogueliteEnemy, Position>, priorPlayer: Readonly<Position>): void {
        for (let i = this.activeMelees.length - 1; i >= 0; i--) {
            const active = this.activeMelees[i];
            const frame = this.tick - active.startTick;
            updateMeleePath(active.cast.melee, frame, this.player, this.field);
            if (frame >= active.cast.melee.first) {
                const from = active.cast.melee.points[Math.max(active.cast.melee.first, frame - 1)];
                const to = active.cast.melee.points[frame];
                const startPlayer = frame === active.cast.melee.first ? this.player : priorPlayer;
                const pdx = this.player.x - startPlayer.x, pdy = this.player.y - startPlayer.y;

                for (const enemy of [...this.enemies]) {
                    if (!this.canTarget(enemy) || active.struck.has(enemy)) continue;
                    const prev = frame === active.cast.melee.first ? enemy : priorEnemies.get(enemy) ?? enemy;
                    const vx = enemy.x - prev.x, vy = enemy.y - prev.y;
                    const overlap = circleContact(prev.x - from.x, prev.y - from.y, vx - (to.x - from.x), vy - (to.y - from.y), active.cast.melee.radius + enemy.radius);
                    const inside = circleContact(prev.x - startPlayer.x, prev.y - startPlayer.y, vx - pdx, vy - pdy, active.cast.melee.range + enemy.radius * 0.5);
                    if (!overlap || !inside || Math.max(overlap[0], inside[0]) > Math.min(overlap[1], inside[1])) continue;

                    active.struck.add(enemy);
                    active.landed++;
                    this.strikeEnemy(enemy, active.runtime, this.player, active.bonusMult, active.forceCrit, active.cast);

                    if (active.runtime.instance.id === 'wrench' && active.runtime.instance.tier >= 3 && active.landed === 2) {
                        active.runtime.wideSweepReady = true;
                    }
                    if (active.wide && active.runtime.instance.tier >= 4 && active.landed === 1) {
                        this.chainArc(enemy, active.runtime, 2 + this.extraArcHops(), 0.85, active.cast);
                    }
                    if (active.runtime.instance.id === 'bypass_wrench' && active.landed === 1) {
                        const wasFourth = active.runtime.combo === 3;
                        active.runtime.combo = (active.runtime.combo + 1) % 4;
                        active.runtime.lastHitTick = this.tick;
                        if (wasFourth && active.runtime.instance.tier >= 4) {
                            for (const near of [...this.enemies]) {
                                if (near !== enemy && this.canTarget(near) && distance(enemy, near) <= 68) {
                                    this.strikeEnemy(near, active.runtime, enemy, 0.8, false, active.cast);
                                }
                            }
                        }
                    }
                }
            }
            if (frame >= active.cast.melee.last) this.activeMelees.splice(i, 1);
        }
    }

    private extraArcHops(): number {
        const arcTier = synergyTier(this.build.synergies, 'arc');
        return arcTier === 6 ? 3 : arcTier === 4 ? 2 : arcTier === 2 ? 1 : 0;
    }

    private isArcWeapon(id: ToolId): boolean {
        return RIG_CATALOG[this.rigId].allArcTag === true || WEAPON_CATALOG[id].tags.includes('arc');
    }

    private strikeEnemy(
        enemy: RogueliteEnemy,
        rt: WeaponRuntime,
        origin: Readonly<Position>,
        bonusMult: number,
        forceCrit = false,
        cast?: WeaponCast,
        isPull = false,
    ): { readonly damage: number; readonly isCrit: boolean } | undefined {
        if (!this.canTarget(enemy)) return undefined;
        const { id, tier } = rt.instance;
        const spec = WEAPON_CATALOG[id];
        const ballisticTier = synergyTier(this.build.synergies, 'ballistic');
        const arcTier = synergyTier(this.build.synergies, 'arc');
        const thermalTier = synergyTier(this.build.synergies, 'thermal');

        let isArmoredFront = false;
        if (enemy.kind === 'armored') {
            const len = distance(enemy, origin);
            const dot = (origin.x - enemy.x) * enemy.facingX + (origin.y - enemy.y) * enemy.facingY;
            if (len > 0 && dot / len > 0.45) isArmoredFront = true;
        }

        let targetMod = 1.0;
        if (enemy.kind === 'boss' && enemy.state === 'open') targetMod *= 1.5;
        if (enemy.vulnerableUntil > this.tick) targetMod *= 1 + enemy.vulnerableBonus;
        if (arcTier >= 4 && enemy.shockedUntil > this.tick) targetMod *= 1.12;

        const hit = computeWeaponHit(id, tier, this.build.stats, this.random, {
            bonusMultiplier: bonusMult,
            targetMod,
            forceCrit,
            armorIgnoreOnCrit: ballisticTier === 6,
            isArmoredFront,
            ballisticFrontBonus: ballisticTier >= 2 ? 0.15 : 0,
        });

        const lethal = enemy.hp <= hit.damage;
        if (cast) this.emitHitEffect(enemy, cast, WEAPON_ATTACK_CUES[id], origin, lethal, isPull);
        this.applyDamage(enemy, hit.damage, rt, hit.isCrit, true);

        if (hit.isCrit && this.build.critHealChance > 0 && this.random() < this.build.critHealChance) {
            this.healPlayer(2, true);
        }

        if (this.isArcWeapon(id)) {
            enemy.shockedUntil = Math.max(enemy.shockedUntil, this.tick + 90);
            if (id !== 'arc_gun' && arcTier >= 2 && !this.isJammed) {
                this.chainArc(enemy, rt, this.extraArcHops(), 0.55, cast);
            }
        }

        if (spec.tags.includes('thermal') && (thermalTier >= 2 || id === 'torch' || (id === 'pulse_nozzle' && tier >= 4))) {
            const maxStacks = thermalTier >= 4 ? 3 : 1;
            enemy.burnStacks = Math.min(maxStacks, enemy.burnStacks + 1);
            enemy.burnDamage = Math.max(enemy.burnDamage, Math.round(hit.damage * (id === 'torch' && tier >= 4 ? 0.45 : 0.25)));
            enemy.burnUntil = this.tick + 60;
        }
        return hit;
    }

    private chainArc(first: RogueliteEnemy, rt: WeaponRuntime, hops: number, scale: number, cast?: WeaponCast): void {
        if (this.isJammed || hops <= 0) return;
        const arcTier = synergyTier(this.build.synergies, 'arc');
        const hopRange = arcTier >= 4 ? 105 : 85;
        const visited = new Set<RogueliteEnemy>([first]);
        let origin: Position = first;
        for (let h = 0; h < hops; h++) {
            const next = this.nearest(origin, hopRange, visited);
            if (!next) break;
            visited.add(next);
            const hit = computeWeaponHit(rt.instance.id, rt.instance.tier, this.build.stats, this.random, { bonusMultiplier: scale });
            next.shockedUntil = Math.max(next.shockedUntil, this.tick + 90);
            if (cast) this.emitHitEffect(next, cast, 'arc', origin, next.hp <= hit.damage);
            this.applyDamage(next, hit.damage, rt, hit.isCrit, false);
            origin = next;
        }
    }

    private applyControlTag(enemy: RogueliteEnemy, rt: WeaponRuntime, bonus = 0.15, cast?: WeaponCast): void {
        const cTier = synergyTier(this.build.synergies, 'control');
        const vuln = Math.max(bonus, cTier >= 4 ? 0.28 : cTier >= 2 ? 0.15 : 0);
        if (vuln > 0) {
            enemy.vulnerableUntil = Math.max(enemy.vulnerableUntil, this.tick + 75);
            enemy.vulnerableBonus = Math.max(enemy.vulnerableBonus, vuln);
        }
        if (cTier === 6 && ++this.controlHits >= 3) {
            this.controlHits = 0;
            this.effects.push({ x: this.player.x, y: this.player.y, shape: 'circle', kind: 'magnet', radius: 95, life: 12, sourceCast: cast });
            const pulseDmg = Math.max(14, Math.round(18 + this.build.stats.voltage * 1.1));
            for (const near of [...this.enemies]) {
                if (this.canTarget(near) && distance(this.player, near) <= 95) {
                    this.applyDamage(near, pulseDmg, rt, false, false);
                }
            }
        }
    }

    private displaceEnemy(enemy: RogueliteEnemy, amount: number): void {
        if (enemy.hp <= 0 || enemy.kind === 'boss' || enemy.nextShift > this.tick) return;
        const dist = distance(this.player, enemy);
        if (dist < 1e-4) return;
        const travel = amount < 0 ? Math.min(-amount, Math.max(0, dist - 30)) : amount;
        const dir = amount < 0 ? -1 / dist : 1 / dist;
        enemy.x = clamp(enemy.x + (enemy.x - this.player.x) * dir * travel, this.field.left + 8, this.field.right - 8);
        enemy.y = clamp(enemy.y + (enemy.y - this.player.y) * dir * travel, this.field.bottom + 8, this.field.top - 8);
        enemy.nextShift = this.tick + 25;
    }

    private applyDamage(enemy: RogueliteEnemy, damage: number, rt: WeaponRuntime, isCrit: boolean, allowDeathChain: boolean): void {
        if (enemy.hp <= 0 || damage <= 0) return;
        const dealt = Math.min(enemy.hp, damage);
        enemy.hp -= dealt;
        enemy.hitAt = this.tick;
        this.weaponImpactSerial++;
        rt.totalDamage += dealt;
        if (isCrit) {
            rt.crits++;
            if (enemy.kind === 'boss' || dealt >= 45) this.pushFloater(enemy.x, enemy.y + 14, `${dealt}!`, 'crit');
        }

        if (enemy.hp > 0) return;
        rt.kills++;
        this.kills++;
        if (enemy.isElite) this.elitesKilled++;
        if (enemy === this.bossUnit && this.waveDef.bossWave) this.bossDefeated = true;

        this.defeatedEnemies.push({
            id: enemy.id,
            kind: (enemy.kind === 'boss' ? 'inspector' : enemy.kind) as EnemyId,
            x: enemy.x,
            y: enemy.y,
            hitAt: this.tick,
        });

        if (allowDeathChain && (this.build.hasArcShock || synergyTier(this.build.synergies, 'arc') === 6) && enemy.shockedUntil > this.tick) {
            for (const near of [...this.enemies]) {
                if (near !== enemy && this.canTarget(near) && distance(enemy, near) <= 64) {
                    this.applyDamage(near, Math.max(8, Math.round(damage * 0.45)), rt, false, false);
                }
            }
        }
        if (allowDeathChain && this.build.hasBurnSpread && enemy.burnStacks > 0) {
            for (const near of this.enemies) {
                if (near !== enemy && this.canTarget(near) && distance(enemy, near) <= 72) {
                    near.burnStacks = Math.min(3, near.burnStacks + 1);
                    near.burnDamage = Math.max(near.burnDamage, enemy.burnDamage);
                    near.burnUntil = this.tick + 60;
                }
            }
        }

        this.drops.push({ kind: 'part', x: enemy.x, y: enemy.y, value: enemy.parts });
        this.xpGained += enemy.xp;
        const healChance = enemy.isElite ? 1.0 : Math.min(0.18, 0.03 + this.build.stats.luck * 0.0012);
        if (this.random() < healChance) {
            const healAmount = Math.round(10 + this.build.stats.repair * 1.5);
            this.drops.push({ kind: 'heal', x: enemy.x + 4, y: enemy.y, value: healAmount });
        }

        const idx = this.enemies.indexOf(enemy);
        if (idx >= 0) this.enemies.splice(idx, 1);
    }

    private stepDrops(): void {
        const radius = BASE_PICKUP_RADIUS * 1.6 * (1 + this.build.stats.pickupRadius / 100);
        for (let i = this.drops.length - 1; i >= 0; i--) {
            const drop = this.drops[i];
            if (distance(drop, this.player) > radius) continue;
            this.drops.splice(i, 1);
            if (drop.kind === 'heal') {
                this.healPlayer(drop.value, true);
            } else {
                const doubled = this.build.doublePartChance > 0 && this.random() < this.build.doublePartChance ? 2 : 1;
                const earned = drop.value * doubled;
                this.partsCollected += earned;
                if (this.bagRemaining > 0) {
                    const redeem = Math.min(this.bagRemaining, earned);
                    this.bagRemaining -= redeem;
                    this.bagRedeemed += redeem;
                    this.partsCollected += redeem;
                }
            }
        }
    }

    private nearest(origin: Readonly<Position>, reach: number, excluded?: ReadonlySet<RogueliteEnemy>): RogueliteEnemy | undefined {
        let best = reach;
        let picked: RogueliteEnemy | undefined;
        for (const e of this.enemies) {
            if (!this.canTarget(e) || excluded?.has(e)) continue;
            const d = distance(origin, e);
            if (d <= best) { best = d; picked = e; }
        }
        return picked;
    }

    private nearestFromWeapon(dock: Readonly<Position>, reach: number): RogueliteEnemy | undefined {
        const wx = this.player.x + dock.x;
        const wy = this.player.y + dock.y;
        let best = Infinity;
        let picked: RogueliteEnemy | undefined;
        for (const e of this.enemies) {
            if (!this.canTarget(e) || distance(this.player, e) > reach) continue;
            const d = Math.hypot(e.x - wx, e.y - wy);
            if (d < best) { best = d; picked = e; }
        }
        return picked;
    }
}
