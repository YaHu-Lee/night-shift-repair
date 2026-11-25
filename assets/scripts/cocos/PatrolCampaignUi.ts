import { Color, Graphics, Label, Node, UITransform, Vec2 } from 'cc';
import type { Battle } from '../m1/Battle';
import { FIELD, combatViewport } from '../m1/content';
import type { CombatBounds, ToolId } from '../m1/content';
import {
    CHAPTER_CATALOG,
    MODULE_BY_ID,
    MODULE_CATALOG,
    RIG_CATALOG,
    WEAPON_CATALOG,
    WORKSHOP_TALENTS,
} from '../roguelite/catalog';
import { DANGER_MULTIPLIERS, armorDamageMultiplier, workshopTalentCost, xpRequiredForLevel } from '../roguelite/formulas';
import { CHAPTER_NARRATIVES, RIG_FLAVOR, STAT_LABELS, TAG_LABELS, UI_COPY } from '../roguelite/narrative';
import { PatrolStorage } from '../roguelite/persistence';
import { PatrolSession, buyWorkshopTalent, toggleModuleBan } from '../roguelite/session';
import type { PatrolResult } from '../roguelite/session';
import type { ChapterDefinition, DangerLevel, ModuleSpec, RigId, StatKey, Tier, WorkshopProfile } from '../roguelite/types';
import { BENCH, benchLock, benchPlate, benchScrew } from './WorkshopBench';
import { drawCreditTicket, drawDispatchHandle, drawLobbyScrim } from './CampaignLobbyView';
import { drawBossVolleyCue, drawCampaignEncounter, drawPixelEnemyAim, drawPixelEnemyShells, drawPixelSpawn, drawPlayerHit } from './CampaignCombatView';
import { drawSkillEffects } from './SkillEffectsView';
import { FLOATING_WEAPON_ART } from './FloatingWeaponArt';
import { PixelJuiceEngine, pxLine, pxRing } from './PixelVfxEngine';
import type { BattleSkinView } from './BattleSkinView';
import type { Sound } from './CampaignAudio';
import type { CampaignPreferences } from '../campaign/CampaignSettings';

const WIDTH = 360;
const HEIGHT = 640;
const VIEW_CENTER_X = (FIELD.left + FIELD.right) / 2;
const VIEW_CENTER_Y = (FIELD.bottom + FIELD.top) / 2;

const TIER_FILL: Record<Tier, Color> = {
    1: new Color(34, 50, 61),
    2: new Color(28, 56, 74),
    3: new Color(48, 38, 70),
    4: new Color(66, 50, 30),
};
const TIER_EDGE: Record<Tier, Color> = {
    1: new Color(132, 162, 173),
    2: new Color(103, 198, 243),
    3: new Color(193, 143, 249),
    4: new Color(251, 199, 108),
};
const TIER_NAME: Record<Tier, string> = { 1: 'Ⅰ 常规', 2: 'Ⅱ 精良', 3: 'Ⅲ 稀有', 4: 'Ⅳ 传奇' };
const TIER_ROMAN: Record<Tier, string> = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ' };

const GREEN = new Color(115, 224, 174);
const RED = new Color(241, 110, 96);
const CYAN = new Color(103, 198, 243);
const PURPLE = new Color(193, 143, 249);
const GOLD = new Color(251, 199, 108);
const DARK_SCRIM = new Color(8, 13, 17, 214);
const HEAL_GREEN = new Color(98, 232, 152);
const JAM_PURPLE = new Color(190, 128, 255, 110);

export interface PatrolHitArea {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
    readonly action: () => void;
}

export interface PatrolTextOptions {
    size?: number;
    color?: Color;
    width?: number;
    height?: number;
    left?: boolean;
    bold?: boolean;
}

export interface PatrolHost {
    readonly ui: Graphics;
    readonly art: Graphics;
    readonly skillEffects: Graphics;
    readonly threats?: Graphics;
    readonly puddles?: Graphics;
    readonly flatFloor?: Graphics;
    readonly skin?: BattleSkinView;
    readonly top: number;
    readonly footer: number;
    readonly capsuleCeiling: number;
    readonly backdropScale: number;
    readonly joystickMode: boolean;
    readonly settings: Readonly<CampaignPreferences>;
    readonly updateSettings: (patch: Partial<CampaignPreferences>) => void;
    readonly play: (sound: Sound) => void;
    readonly setScenery: (key: string | null) => void;
    readonly setBattleOffset: (x: number, y: number) => void;
    readonly clearWorldLayers: () => void;
    readonly addTouch: (x: number, y: number, w: number, h: number, action: () => void) => boolean;
    readonly text: (value: string, x: number, y: number, opts?: PatrolTextOptions) => void;
    readonly block: (x: number, y: number, w: number, h: number, color: Color) => void;
    readonly syncMusic: (battle: boolean) => void;
    readonly onBattleStopped: () => void;
}

type PatrolPage = 'home' | 'prep' | 'workshop' | 'log' | 'settings' | 'battle' | 'shop' | 'result';
const RIG_ORDER: readonly RigId[] = ['duty_standard', 'high_voltage', 'heavy_fitter', 'thermal_welder', 'scrap_auditor'];

// Plain, self-explanatory Chinese stat names (NO cryptic 1-character jargon!)
const CARD_STAT: Readonly<Record<StatKey, string>> = {
    maxHp: '生命',
    torque: '物理伤',
    voltage: '电火伤',
    overclock: '总伤',
    cycleSpeed: '攻速',
    critChance: '暴击',
    armor: '护甲',
    repair: '回血',
    salvage: '每波零件',
    luck: '幸运',
    moveSpeed: '移速',
    pickupRadius: '拾取',
};

const SPECIAL_DESC: Readonly<Record<string, string>> = {
    shop_discount: '特效：商店全品打 9 折',
    free_reroll: '特效：每店免费翻箱 +1',
    double_parts: '特效：20% 概率双倍零件',
    crit_heal: '特效：暴击概率回 2 血',
    arc_shock: '特效：感电击杀炸电花',
    burn_spread: '特效：燃烧死亡传染周围',
    armor_thorns: '特效：受伤反震周围敌机',
    extra_enemies: '特效：怪多 18%（掉更多钱）',
};

const SPECIAL_SHORT: Readonly<Record<string, string>> = {
    shop_discount: '商店9折',
    free_reroll: '免费翻箱+1',
    double_parts: '20%双倍零件',
    crit_heal: '暴击回2血',
    arc_shock: '感电炸电花',
    burn_spread: '燃烧死亡传染',
    armor_thorns: '受伤反震',
    extra_enemies: '刷怪+18%',
};

const SHORT_WEAPON: Readonly<Record<ToolId, string>> = {
    wrench: '扳手', bypass_wrench: '旁路', arc_gun: '电弧', riveter: '铆钉',
    hydraulic_nailer: '钉枪', torch: '喷火', pulse_nozzle: '喷管',
    induction: '感应', traction_coil: '牵引', split_probe: '探针',
};

// Distinct 1-to-1 pixel workshop icons for all 32 modules (no duplicate icons on adjacent shop cards!)
const MODULE_ICON: Readonly<Record<string, string>> = {
    copper_knuckle: 'bypass_wrench/handling',
    spare_coil: 'arc_gun/handling',
    light_bearing: 'gear/runner',
    scrap_magnet: 'gear/pickup',
    steel_apron: 'gear/padding',
    caffeine_thermos: 'prop/valve',
    optic_loupe: 'split_probe/handling',
    overtime_voucher: 'gear/sorter',
    stripped_motor: 'wrench/handling',
    insulating_boots: 'wrench/alternate',
    flint_nozzle: 'torch/handling',
    lucky_fuse: 'arc_gun/alternate',
    heavy_flywheel: 'wrench/flywheel',
    step_up_cap: 'induction/alternate',
    tungsten_pin: 'riveter/finisher',
    propane_booster: 'torch/alternate',
    composite_plate: 'gear/guard',
    auto_solder: 'torch/finisher',
    coupon_pass: 'ui/receipt',
    spare_crate_key: 'ui/tier',
    vampire_clamp: 'traction_coil/handling',
    scrap_sieve: 'magnetic_pickup_arm',
    overclock_core: 'quick_release_heatsink',
    hydraulic_exoskeleton: 'gear/harness',
    tesla_manifold: 'arc_gun/signature',
    thermite_valve: 'torch/signature',
    ballistic_computer: 'split_probe/signature',
    reactive_shield: 'prop/barrier',
    bait_beacon: 'ui/radio',
    zero_line_tap: 'narrow_beam_clamp',
    master_wrench_rig: 'wrench/signature',
    emergency_generator: 'prop/battery',
};

function collectStatTokens(stats: Partial<Record<StatKey, number>>): { readonly pos: string[]; readonly neg: string[] } {
    const pos: string[] = [];
    const neg: string[] = [];
    for (const [k, v] of Object.entries(stats) as [StatKey, number][]) {
        if (!v) continue;
        const unit = STAT_LABELS[k].unit;
        const token = `${CARD_STAT[k]}${v > 0 ? '+' : '−'}${Math.abs(v)}${unit}`;
        if (v > 0) pos.push(token); else neg.push(token);
    }
    return { pos, neg };
}

function formatModuleCardLines(mod: ModuleSpec): {
    readonly line1: string;
    readonly line1Color: Color;
    readonly line2: string;
    readonly line2Color: Color;
} {
    const { pos, neg } = collectStatTokens(mod.stats);
    const specialFull = mod.special ? SPECIAL_DESC[mod.special] : '';
    const specialShort = mod.special ? SPECIAL_SHORT[mod.special] : '';
    if (pos.length >= 4) {
        return {
            line1: pos.slice(0, 2).join('  '),
            line1Color: GREEN,
            line2: pos.slice(2, 4).join('  '),
            line2Color: GREEN,
        };
    }
    const line1 = pos.length >= 3 ? pos.join(' ') : pos.join('  ');
    if (specialFull && neg.length) {
        return {
            line1,
            line1Color: GREEN,
            line2: `${specialShort} · 代价:${neg.join(' ')}`,
            line2Color: GOLD,
        };
    }
    if (specialFull) {
        return {
            line1: line1 || specialFull,
            line1Color: line1 ? GREEN : GOLD,
            line2: line1 ? specialFull : (mod.flavor.split(/[，。！]/)[0] || ''),
            line2Color: line1 ? GOLD : BENCH.muted,
        };
    }
    if (neg.length) {
        return {
            line1,
            line1Color: GREEN,
            line2: `代价：${neg.join('  ')}`,
            line2Color: RED,
        };
    }
    return {
        line1,
        line1Color: GREEN,
        line2: mod.flavor.split(/[，。！]/)[0] || '',
        line2Color: BENCH.muted,
    };
}

function formatStatPreview(stats: Partial<Record<StatKey, number>>, limit = 3, special?: string): string {
    const { pos, neg } = collectStatTokens(stats);
    const items = [...pos, ...neg];
    if (special && SPECIAL_SHORT[special]) items.push(`特效:${SPECIAL_SHORT[special]}`);
    return items.slice(0, limit).join(' · ');
}

export class PatrolCampaignUi {
    private readonly storage: PatrolStorage;
    profile: WorkshopProfile;
    session: PatrolSession | null = null;
    result: PatrolResult | null = null;

    page: PatrolPage = 'home';
    paused = false;
    private chapterIdx = 0;
    private rigIdx = 0;
    private danger: DangerLevel = 0;
    private workshopTab: 'talents' | 'bans' = 'talents';
    private logTab: 'archive' | 'records' = 'archive';
    private archiveIdx = 0;
    private banScroll = 0;
    private inspectWeaponSlot: number | null = null;
    private showStatsDrawer = false;
    private shopFeedback = '';
    private settledRun = false;
    private lastArena = '';

    // Audio & VFX juice serial tracking for RogueliteBattle
    private readonly juice = new PixelJuiceEngine();
    private lastWeaponAttack = 0;
    private lastWeaponImpact = 0;
    private lastWarning = 0;
    private lastEnemyAttack = 0;
    private lastDamage = 0;
    private lastHealed = 0;
    private lastKills = 0;
    private lastElitesKilled = 0;
    private lastCastTick = -1;
    private lastImpactCount = 0;
    private lastFloatersCount = 0;

    constructor(
        private readonly host: PatrolHost,
        legacyProfile?: { clearedStages?: readonly string[]; credits?: number } | null,
        storage?: PatrolStorage,
    ) {
        this.storage = storage ?? new PatrolStorage();
        this.profile = this.storage.loadProfile(legacyProfile);
        this.session = this.storage.loadActiveRun(this.profile);
        if (this.session) {
            this.chapterIdx = this.session.chapter.index;
            this.rigIdx = Math.max(0, RIG_ORDER.indexOf(this.session.rigId));
            this.danger = this.session.danger;
        } else {
            const firstUncleared = CHAPTER_CATALOG.findIndex(c => !this.profile.clearedChapters.includes(c.id));
            this.chapterIdx = firstUncleared >= 0 ? firstUncleared : CHAPTER_CATALOG.length - 1;
        }
    }

    get inBattle(): boolean {
        return this.page === 'battle' && !!this.session?.battle && !this.paused;
    }

    get battleField(): CombatBounds | null {
        return this.session?.battle?.field ?? null;
    }

    setBattleDestination(worldX: number, worldY: number): void {
        this.session?.battle?.moveTo(worldX, worldY);
    }

    suspend(): void {
        if (this.page === 'battle') {
            this.paused = true;
            if (this.session?.battle) this.session.battle.destination = null;
        }
    }

    update(dt: number, axisX: number, axisY: number): void {
        if (this.page !== 'battle' || this.paused || !this.session?.battle) return;
        const b = this.session.battle;
        const simDt = this.juice.step(dt);
        const completed = simDt > 0 ? this.session.advance(simDt, axisX, axisY) : false;

        // Emit authentic combat audio + pixel juice cues (shell casings, sparks, hitstop, micro-shake, decals!)
        if (b.weaponAttackSerial !== this.lastWeaponAttack) {
            this.lastWeaponAttack = b.weaponAttackSerial;
            this.host.play(b.weaponAttackCue);
            for (let i = b.weaponCasts.length - 1; i >= 0; i--) {
                const c = b.weaponCasts[i];
                if (c.tick <= this.lastCastTick) break;
                this.juice.ejectShell(c.x, c.y, c.ux, c.uy, c.tool);
            }
            if (b.weaponCasts.length) this.lastCastTick = b.weaponCasts[b.weaponCasts.length - 1].tick;
        }
        if (b.weaponImpactSerial !== this.lastWeaponImpact) {
            this.lastWeaponImpact = b.weaponImpactSerial;
            this.host.play('impact');
            const latest = b.weaponImpacts[b.weaponImpacts.length - 1];
            if (latest) {
                const isCrit = b.floaters.length > this.lastFloatersCount
                    && b.floaters[b.floaters.length - 1]?.kind === 'crit';
                this.juice.spawnHitSparks(latest.x, latest.y, latest.cast.ux, latest.cast.uy,
                    FLOATING_WEAPON_ART[latest.cast.tool].tint, isCrit || latest.weight === 'boss-break');
            }
        }
        this.lastFloatersCount = b.floaters.length;
        if (b.kills !== this.lastKills) {
            const eliteDrop = b.elitesKilled > this.lastElitesKilled;
            this.lastElitesKilled = b.elitesKilled;
            const gained = b.kills - this.lastKills;
            this.lastKills = b.kills;
            const recent = b.defeatedEnemies.slice(-Math.min(gained, 3));
            for (const dead of recent) {
                const fiery = b.weaponAttackCue === 'heat';
                this.juice.spawnEnemyBreak(dead.x, dead.y, eliteDrop || dead.kind === 'inspector', fiery);
            }
        }
        if (b.warningSerial !== this.lastWarning) {
            this.lastWarning = b.warningSerial;
            this.host.play(b.warningKind);
        }
        if (b.enemyAttackSerial !== this.lastEnemyAttack) {
            this.lastEnemyAttack = b.enemyAttackSerial;
            this.host.play(b.enemyAttackCue);
        }
        if (b.damageTaken !== this.lastDamage) {
            this.lastDamage = b.damageTaken;
            this.host.play('hit');
            this.juice.spawnPlayerHit(b.player.x, b.player.y);
        }
        if (b.healed > this.lastHealed) {
            this.lastHealed = b.healed;
            this.juice.spawnHealBurst(b.player.x, b.player.y);
        }

        if (!completed) return;
        this.host.onBattleStopped();
        if (this.session.phase === 'shop') {
            this.storage.saveActiveRun(this.session);
            this.inspectWeaponSlot = null;
            this.showStatsDrawer = false;
            this.shopFeedback = '';
            this.page = 'shop';
            this.host.syncMusic(false);
        } else if (this.session.phase === 'won' || this.session.phase === 'lost') {
            this.finalizeRun();
        }
    }

    private finalizeRun(): void {
        if (!this.session) return;
        this.result = this.session.settle();
        if (!this.settledRun) {
            this.settledRun = true;
            this.profile = this.session.applySettlementToProfile(this.profile);
            this.storage.saveProfile(this.profile);
            this.storage.clearActiveRun();
            this.host.play(this.result.won ? 'unlock' : 'hit');
        }
        this.page = 'result';
        this.host.syncMusic(false);
    }

    private startNewPatrol(chapterId: ChapterDefinition['id'], rigId: RigId, danger: DangerLevel): void {
        const seed = (Date.now() ^ Math.imul(this.profile.credits + 17, 2654435761)) >>> 0;
        this.session = new PatrolSession({ chapterId, rigId, danger, seed, profile: this.profile });
        this.result = null;
        this.settledRun = false;
        this.paused = false;
        this.inspectWeaponSlot = null;
        this.showStatsDrawer = false;
        this.syncAudioSerials();
        this.storage.saveActiveRun(this.session);
        this.page = 'battle';
        this.host.syncMusic(true);
    }

    private resumeSavedPatrol(): void {
        if (!this.session) return;
        this.settledRun = false;
        this.paused = false;
        this.syncAudioSerials();
        this.page = this.session.phase === 'shop' ? 'shop' : 'battle';
        this.host.syncMusic(this.page === 'battle');
    }

    private syncAudioSerials(): void {
        const b = this.session?.battle;
        this.juice.reset();
        this.lastWeaponAttack = b?.weaponAttackSerial ?? 0;
        this.lastWeaponImpact = b?.weaponImpactSerial ?? 0;
        this.lastWarning = b?.warningSerial ?? 0;
        this.lastEnemyAttack = b?.enemyAttackSerial ?? 0;
        this.lastDamage = b?.damageTaken ?? 0;
        this.lastHealed = b?.healed ?? 0;
        this.lastKills = b?.kills ?? 0;
        this.lastElitesKilled = b?.elitesKilled ?? 0;
        this.lastCastTick = -1;
        this.lastImpactCount = 0;
        this.lastFloatersCount = b?.floaters.length ?? 0;
    }

    draw(): void {
        const isBattle = this.page === 'battle' && !!this.session?.battle;
        if (!isBattle) {
            this.host.clearWorldLayers();
            this.host.skin?.drawWorld(null, false);
        }
        this.host.setScenery(this.page === 'home' ? 'night-depot' : null);

        if (isBattle) {
            this.drawBattleWorld();
        }
        this.host.skin?.beginUi();
        switch (this.page) {
            case 'home': this.drawHome(); break;
            case 'prep': this.drawPrep(); break;
            case 'workshop': this.drawWorkshop(); break;
            case 'log': this.drawLog(); break;
            case 'settings': this.drawSettings(); break;
            case 'battle': this.drawBattleHud(); break;
            case 'shop': this.drawShop(); break;
            case 'result': this.drawResult(); break;
        }
        this.host.skin?.endUi();
    }

    // ─────────────────────────── BATTLE WORLD ───────────────────────────

    private drawBattleWorld(): void {
        const battle = this.session!.battle!;
        const skin = this.host.skin;
        if (skin) {
            skin.prepare();
            if (this.lastArena !== battle.arena) {
                this.lastArena = battle.arena;
                skin.setStage(battle.chapter.stations[battle.waveDef.stationIndex].id, battle.arena);
            }
            skin.drawPixelFloor(battle.field);
        }

        const view = combatViewport(battle.field, battle.player.x, battle.player.y);
        const shake = this.juice.getShakeOffset();
        const offsetX = view.left + (view.right - view.left) / 2 - VIEW_CENTER_X + shake.x;
        const offsetY = view.bottom + (view.top - view.bottom) / 2 - VIEW_CENTER_Y + shake.y;
        this.host.setBattleOffset(offsetX, offsetY);

        const bridge = battle.toRenderBridge() as Battle;
        const floatingTick = battle.tick + (this.session?.frameFraction ?? 0);

        if (this.host.puddles) {
            this.host.puddles.clear();
            this.host.threats?.clear();
            // Persistent low-contrast floor decals (oil, scorch, scrap, spent brass shells) sit below actors & bullets!
            this.juice.drawGroundDecals(this.host.puddles);
            skin?.drawEncounter(this.host.puddles, bridge, battle.chapter.stations[battle.waveDef.stationIndex].id, false, this.host.threats);
        }

        skin?.drawWorld(bridge, false, floatingTick);

        this.host.skillEffects.clear();
        drawSkillEffects(
            this.host.skillEffects,
            battle.effects,
            false,
            skin?.floatingWeaponOrigin,
            floatingTick,
            battle.weaponCasts,
            battle.weaponImpacts,
        );
        this.juice.drawParticles(this.host.skillEffects);

        // Draw combat telegraphs, pure-pixel jammer/ambusher zones, repair kits, bullets & floating text
        const art = this.host.art;
        art.clear();
        for (const cue of battle.warnings) {
            drawPixelSpawn(art, cue.x, cue.y, cue.at - battle.tick, cue.kind === 'armored' ? PURPLE : GOLD);
        }
        for (const e of battle.enemies) {
            if ((e.kind === 'charger' || e.kind === 'turret') && e.state === 'warn') {
                drawPixelEnemyAim(art, e.x, e.y, e.vx, e.vy, 64, e.kind, e.next - battle.tick);
            } else if (e.kind === 'jammer' && (e.state === 'warn' || e.state === 'dash')) {
                const active = e.state === 'dash';
                art.fillColor = active ? new Color(192, 128, 255, 220) : new Color(251, 199, 108, 175);
                pxRing(art, e.x, e.y, 68, active ? 4 : 2, battle.tick * 0.04, Math.PI * 2, active ? 7 : 10, active ? 4 : 2);
                art.fill();
            } else if (e.kind === 'ambusher' && e.state === 'warn') {
                art.fillColor = RED;
                pxLine(art, e.x, e.y, e.x + e.vx * 78, e.y + e.vy * 78, 2, 5);
                art.fill();
            } else if (e.kind === 'boss' && e.bossVolley && e.state === 'warn') {
                drawBossVolleyCue(art, e.x, e.y, Math.atan2(e.facingY, e.facingX), e.bossVolley === 'ring', e.next - battle.tick);
            }
            if (e.kind !== 'boss' && e.hp < e.maxHp && e.maxHp >= 45) {
                const bw = 20;
                const ex = Math.round(e.x), ey = Math.round(e.y + e.radius + 5);
                art.fillColor = BENCH.ink;
                art.rect(ex - bw / 2, ey, bw, 3);
                art.fill();
                art.fillColor = e.burnStacks > 0 ? GOLD : RED;
                art.rect(ex - bw / 2, ey, Math.max(2, Math.round(bw * (e.hp / e.maxHp))), 3);
                art.fill();
            }
        }
        // Repair kits on ground (bright green pixel cross box)
        for (const d of battle.drops) {
            if (d.kind !== 'heal') continue;
            const x = Math.round(d.x), y = Math.round(d.y);
            art.fillColor = BENCH.ink;
            art.rect(x - 6, y - 6, 12, 12);
            art.fill();
            art.fillColor = HEAL_GREEN;
            art.rect(x - 5, y - 5, 10, 10);
            art.fill();
            art.fillColor = BENCH.paper;
            art.rect(x - 1, y - 3, 2, 6);
            art.rect(x - 3, y - 1, 6, 2);
            art.fill();
        }
        // High-contrast 9x9 pulsing crimson/magenta + pure white core enemy bullets on TOP layer!
        drawPixelEnemyShells(art, battle.bullets, 0, 0, battle.tick);
        if (battle.player.hurtAt !== undefined) {
            drawPlayerHit(art, battle.player.x, battle.player.y, battle.tick - battle.player.hurtAt);
        }
        // Floating crit / heal / jam text mapped to screen overlay coordinates (skip while paused or overlapping top boss bar)
        const floaterTop = battle.bossView ? FIELD.top - 54 : FIELD.top - 6;
        if (!this.paused) for (const f of battle.floaters) {
            const age = battle.tick - f.bornTick;
            const sx = f.x - offsetX;
            const sy = f.y - offsetY + age * 0.7;
            if (sx < FIELD.left || sx > FIELD.right || sy < FIELD.bottom || sy > floaterTop) continue;
            const color = f.kind === 'crit' ? GOLD : f.kind === 'heal' ? HEAL_GREEN : f.kind === 'jam' ? PURPLE : RED;
            this.host.text(f.text, sx, sy, { size: f.kind === 'crit' ? 13 : 11, bold: true, color, width: 72 });
        }
    }

    // ─────────────────────────── PAGE 1: HOME (FIXED) ───────────────────────────

    private drawHome(): void {
        const g = this.host.ui;
        const pad = HEIGHT * (this.host.backdropScale - 1) / 2;
        drawLobbyScrim(g, WIDTH, HEIGHT, pad);

        const topY = Math.min(this.host.top - 10, this.host.capsuleCeiling - 16);
        this.host.text(UI_COPY.home.subtitle, 130, topY + 6, { left: true, width: 224, size: 12, bold: true, color: GOLD });
        this.host.text(UI_COPY.home.title, 140, topY - 26, { left: true, width: 244, height: 46, size: 34, bold: true, color: BENCH.paper });

        drawCreditTicket(g, 43, topY - 68);
        this.host.text('维修凭证', 78, topY - 68, { left: true, width: 52, size: 11, color: BENCH.paper });
        this.host.text(String(this.profile.credits), 124, topY - 68, { left: true, width: 42, size: 15, bold: true, color: GOLD });

        // FIXED: Settings button now sits on an opaque pixel dark plate so it never bleeds into the pixel roof art.
        this.pixelBtn(UI_COPY.home.settingsTab, 314, Math.min(topY - 24, this.host.capsuleCeiling - 24), 60, 34, () => {
            this.page = 'settings';
        });

        // FIXED: Unified hard-edge pixel bottom bar (no thin vector circles).
        const bottom = Math.max(this.host.footer + 28, 56);
        const canUpgrade = WORKSHOP_TALENTS.some(t => {
            const rank = this.profile.talents[t.id] ?? 0;
            return rank < t.maxRank && this.profile.credits >= workshopTalentCost(t, rank);
        });
        this.pixelBtn('工坊', 52, bottom, 68, 48, () => { this.page = 'workshop'; }, false, true, canUpgrade);
        this.pixelBtn('日志', 126, bottom, 68, 48, () => { this.page = 'log'; });

        const hasActive = !!this.session && (this.session.phase === 'battle' || this.session.phase === 'shop');
        const held = this.host.addTouch(256, bottom, 174, 52, () => {
            if (hasActive) this.resumeSavedPatrol();
            else this.page = 'prep';
        });
        drawDispatchHandle(g, 256, bottom, held);
        const cta = hasActive ? `继续 · 第${this.session!.waveIndex + 1}波` : UI_COPY.home.startCta;
        this.host.text(cta, 236, bottom - (held ? 3 : 0), { size: hasActive ? 19 : 23, bold: true, color: BENCH.ink, width: 132 });
    }

    // ─────────────────────────── PAGE 2: PREP / CHAPTER & RIG (FIXED) ───────────────────────────

    private drawPrep(): void {
        this.backdrop();
        const top = this.header('出勤准备', '‹ 值班室', () => { this.page = 'home'; }, '工坊改装', () => { this.page = 'workshop'; });
        const chapter = CHAPTER_CATALOG[this.chapterIdx];
        const rig = RIG_CATALOG[RIG_ORDER[this.rigIdx]];
        const narrative = CHAPTER_NARRATIVES[chapter.id];
        const g = this.host.ui;

        // Section A: Chapter patrol banner + 5 stations progress
        const chTop = top - 10;
        const chH = 128;
        const chBot = chTop - chH;
        benchPlate(g, 16, chBot, 328, chH, BENCH.steel, BENCH.edge, 8);
        this.host.block(17, chTop - 3, 326, 3, GOLD);

        const prevCh = this.chapterIdx > 0;
        const nextCh = this.chapterIdx < CHAPTER_CATALOG.length - 1;
        this.pixelBtn('‹', 38, chTop - 30, 32, 34, () => { if (prevCh) this.chapterIdx--; }, false, prevCh);
        this.pixelBtn('›', 322, chTop - 30, 32, 34, () => { if (nextCh) this.chapterIdx++; }, false, nextCh);

        const cleared = this.profile.clearedChapters.includes(chapter.id);
        this.host.text(`第${'一二三四'[this.chapterIdx]}章 · ${chapter.routeName}${cleared ? ' ✓' : ''}`, 180, chTop - 18,
            { width: 244, size: 12, bold: true, color: cleared ? GREEN : GOLD });
        this.host.text(chapter.title, 180, chTop - 42, { width: 244, size: 22, bold: true, color: BENCH.paper });

        // 5-station progress strip
        const stationNames = chapter.stations.map(s => s.name).join(' › ');
        this.host.text(stationNames, 180, chTop - 68, { width: 304, size: 11, color: CYAN });
        const openerShort = narrative.opener.line.split('！').slice(0, 2).join('！') + '！';
        this.host.text(`${narrative.opener.speaker}：${openerShort}`, 180, chTop - 101,
            { width: 304, height: 38, left: true, size: 11, color: BENCH.muted });

        // Section B: Danger level selector (D0-D4) with clean 12px spacing
        const dTop = chBot - 12;
        const dH = 42;
        const dBot = dTop - dH;
        benchPlate(g, 16, dBot, 328, dH, BENCH.recess, BENCH.edge, 6);
        const dm = DANGER_MULTIPLIERS[this.danger];
        this.pixelBtn('‹', 38, dBot + 21, 32, 32, () => { if (this.danger > 0) this.danger = (this.danger - 1) as DangerLevel; }, false, this.danger > 0);
        this.pixelBtn('›', 322, dBot + 21, 32, 32, () => { if (this.danger < 4) this.danger = (this.danger + 1) as DangerLevel; }, false, this.danger < 4);
        this.host.text(`${dm.label}${dm.creditBonus ? `  ·  通关凭证 +${dm.creditBonus}` : ''}`, 180, dBot + 21,
            { width: 242, size: 13, bold: true, color: this.danger >= 3 ? RED : this.danger >= 1 ? GOLD : BENCH.paper });

        // Section C: 5 Mechanic Rigs selector (replaces legacy 2-card route/start collision!)
        const rTop = dBot - 12;
        const tabY = rTop - 18;
        const tabW = 62;
        RIG_ORDER.forEach((id, idx) => {
            const tx = 16 + idx * 66.5 + tabW / 2;
            const active = idx === this.rigIdx;
            this.pixelBtn(RIG_CATALOG[id].name.slice(0, 2), tx, tabY, tabW, 34, () => { this.rigIdx = idx; }, active);
        });

        const cardTop = tabY - 22;
        const cardH = 148;
        const cardBot = cardTop - cardH;
        benchPlate(g, 16, cardBot, 328, cardH, BENCH.steel, GOLD, 8);
        benchPlate(g, 26, cardTop - 68, 56, 56, BENCH.recess, BENCH.edge, 6);
        this.host.skin?.uiIcon(rig.starterWeapon, 54, cardTop - 40, 42);
        this.host.text(`${rig.name} · ${rig.title}`, 212, cardTop - 22, { left: true, width: 236, size: 17, bold: true, color: BENCH.paper });
        this.host.text(`起手武器：${WEAPON_CATALOG[rig.starterWeapon].name}`, 212, cardTop - 44, { left: true, width: 236, size: 12, color: CYAN });
        this.host.text(formatStatPreview(rig.stats, 4) || '全属性均衡', 212, cardTop - 62, { left: true, width: 236, size: 11, color: GOLD });
        this.host.text(`优势：${rig.summary}`, 180, cardTop - 94, { left: true, width: 304, height: 30, size: 12, color: GREEN });
        this.host.text(`代价：${rig.tradeoff}`, 180, cardTop - 126, { left: true, width: 304, height: 28, size: 12, color: BENCH.muted });

        // Dedicated full-width bottom CTA with >= 14px breathing room!
        const ctaY = Math.max(this.host.footer + 28, 52);
        this.pixelBtn(`出发抢修 · ${chapter.title} ›`, 180, ctaY, 328, 50, () => {
            this.startNewPatrol(chapter.id, rig.id, this.danger);
        }, true);
    }

    // ─────────────────────────── PAGE 3: BATTLE HUD (BOSS ON TOP!) ───────────────────────────

    private drawBattleHud(): void {
        const session = this.session;
        const battle = session?.battle;
        if (!session || !battle) {
            if (session?.phase === 'shop' && session.intermission) { this.page = 'shop'; this.drawShop(); }
            else if (session && (session.phase === 'won' || session.phase === 'lost')) { this.finalizeRun(); this.drawResult(); }
            else { this.page = 'home'; this.drawHome(); }
            return;
        }
        if (this.paused) {
            this.drawPause();
            return;
        }
        const g = this.host.ui;
        const top = Math.min(this.host.top, this.host.capsuleCeiling - 24);

        // Top-left: Solid HP bar + numeric HP + Armor badge + XP Level strip
        benchPlate(g, 16, top - 34, 144, 58, BENCH.recess, BENCH.edge, 6);
        const hpRatio = Math.max(0, Math.min(1, battle.player.hp / Math.max(1, battle.player.maxHp)));
        const lowHp = hpRatio <= 0.3;
        this.host.text(`HP ${battle.player.hp}/${battle.player.maxHp}`, 64, top + 12,
            { left: true, width: 88, size: 13, bold: true, color: lowHp ? RED : BENCH.paper });
        this.host.text(`甲 ${battle.build.stats.armor}`, 136, top + 12,
            { width: 42, size: 12, bold: true, color: CYAN });
        this.host.block(22, top - 4, 132, 7, BENCH.steel);
        this.host.block(22, top - 4, Math.round(132 * hpRatio), 7, lowHp ? RED : GREEN);

        // XP bar directly below HP bar
        const nextXp = xpRequiredForLevel(session.level + 1);
        const xpRatio = Math.min(1, (session.xp + battle.xpGained) / Math.max(1, nextXp));
        this.host.block(22, top - 16, 94, 4, BENCH.steel);
        this.host.block(22, top - 16, Math.round(94 * xpRatio), 4, CYAN);
        this.host.text(`Lv.${session.level}`, 138, top - 16, { width: 38, size: 11, bold: true, color: CYAN });
        if (battle.isJammed) {
            this.host.text('受扰 −35%速', 88, top - 28, { width: 132, size: 10, bold: true, color: PURPLE });
        } else {
            this.host.text(battle.stationName, 88, top - 28, { width: 132, size: 11, color: BENCH.muted });
        }

        // Top-center: Wave & Countdown timer
        benchPlate(g, 166, top - 34, 108, 58, BENCH.recess, BENCH.edge, 6);
        this.host.text(`第 ${battle.waveDef.wave}/12 波`, 220, top + 12, { width: 100, size: 12, bold: true, color: BENCH.paper });
        const secs = battle.remainingSeconds;
        const clock = `${Math.floor(secs / 60)}:${('0' + (secs % 60)).slice(-2)}`;
        this.host.text(clock, 220, top - 10, { width: 100, size: 20, bold: true, color: secs <= 8 ? RED : GOLD });
        this.host.text(`击倒 ${battle.kills}`, 220, top - 27, { width: 100, size: 10, color: BENCH.muted });

        // Top-right: Pause button
        this.pixelBtn('暂停', 312, top - 5, 64, 46, () => { this.suspend(); });

        // FIXED: Boss HP bar & human warning banner anchored at TOP of playfield (never covered by bottom thumb!)
        const boss = battle.bossView;
        if (boss) {
            const by = FIELD.top - 48;
            benchPlate(g, 24, by, 312, 44, new Color(14, 22, 29, 224), boss.vulnerable ? GOLD : RED, 6);
            this.host.text(`${boss.title} · 阶段 ${boss.stage}${boss.vulnerable ? ' · 破防 1.5×!' : ''}`, 180, by + 32,
                { width: 296, size: 12, bold: true, color: boss.vulnerable ? GOLD : BENCH.paper });
            this.host.block(34, by + 18, 292, 6, BENCH.steel);
            this.host.block(34, by + 18, Math.round(292 * Math.max(0, boss.hp / boss.maxHp)), 6, boss.vulnerable ? GOLD : RED);
            if (boss.instruction) {
                this.host.text(boss.instruction, 180, by + 8, { width: 296, size: 11, bold: true, color: boss.vulnerable ? GREEN : GOLD });
            }
        } else if (battle.tick < 150) {
            // Brief station arrival radio line at top of arena
            const radio = battle.chapter.stations[battle.waveDef.stationIndex].arriveRadio;
            if (radio) {
                const ry = FIELD.top - 42;
                benchPlate(g, 20, ry, 320, 36, new Color(14, 22, 29, 224), BENCH.edge, 6);
                const portrait = radio.startsWith('陈栖') ? 'radio-chenqi' : 'radio-aruan';
                this.host.skin?.uiIcon(portrait, 40, ry + 18, 28);
                this.host.text(radio, 196, ry + 18, { left: true, width: 274, height: 32, size: 11, color: BENCH.paper });
            }
        }

        // Bottom-right compact tray (bottom-left stays completely clear for thumb joystick!)
        const botY = Math.max(this.host.footer + 18, 52);
        benchPlate(g, 194, botY - 14, 150, 32, BENCH.recess, BENCH.edge, 5);
        this.host.skin?.uiIcon('scrap', 210, botY + 2, 16);
        const totalParts = session.parts + battle.partsCollected;
        const bagTxt = battle.bagRemaining > 0 ? ` (+${battle.bagRemaining}袋)` : '';
        this.host.text(`零件 ${totalParts}${bagTxt}`, 280, botY + 2, { width: 122, size: 12, bold: true, color: GOLD });

        const activeSyns = battle.build.synergies.filter(s => s.activeTier > 0).slice(0, 3);
        if (activeSyns.length) {
            const label = activeSyns.map(s => `${s.name.slice(0, 2)}${s.activeTier}`).join(' · ');
            benchPlate(g, 194, botY + 22, 150, 22, BENCH.recess, BENCH.edge, 4);
            this.host.text(label, 269, botY + 33, { width: 142, size: 11, bold: true, color: GREEN });
        }
    }

    private drawPause(): void {
        const g = this.host.ui;
        this.host.block(0, -HEIGHT, WIDTH, HEIGHT * 3, DARK_SCRIM);
        const cy = 320;
        benchPlate(g, 28, cy - 140, 304, 280, BENCH.steel, BENCH.edge, 10);
        this.host.text('歇口气 · 已暂停', 180, cy + 102, { size: 24, bold: true, color: BENCH.paper });
        const b = this.session!.battle!;
        this.host.text(`${b.chapter.title} · 第 ${b.waveDef.wave}/12 波 · ${b.stationName}`, 180, cy + 68, { width: 276, size: 12, color: BENCH.muted });
        this.pixelBtn('接着干', 180, cy + 18, 250, 48, () => { this.paused = false; }, true);
        this.pixelBtn(this.host.settings.sound ? '音效 · 开' : '音效 · 关', 180, cy - 42, 250, 44, () => {
            this.host.updateSettings({ sound: !this.host.settings.sound });
        });
        this.pixelBtn('回值班室（保留进度）', 180, cy - 100, 250, 44, () => {
            if (this.session) this.storage.saveActiveRun(this.session);
            this.paused = false;
            this.page = 'home';
            this.host.syncMusic(false);
        });
    }

    // ─────────────────────────── PAGE 4: LEVEL-UP & 2x2 FOUR-SLOT SHOP ───────────────────────────

    private drawShop(): void {
        const session = this.session!;
        const view = session.shopView;
        if (!view) return;

        // First resolve any queued level-up 4-pick-1 cards
        if (view.pendingLevelUps > 0) {
            this.drawLevelUpOverlay(view);
            return;
        }
        // Dedicated full-screen Stats & Synergies subpage (prevents underlying shop icons/labels from bleeding through!)
        if (this.showStatsDrawer) {
            this.drawStatsDrawer(view);
            return;
        }

        this.backdrop();
        const top = this.header(
            `${UI_COPY.shop.heading} · W${view.wave}`,
            '‹ 首页',
            () => { this.storage.saveActiveRun(session); this.page = 'home'; },
            '属性/羁绊',
            () => { this.showStatsDrawer = true; this.inspectWeaponSlot = null; },
        );
        const g = this.host.ui;

        // Wallet + HP + Bag bar
        const barY = top - 22;
        benchPlate(g, 16, barY - 14, 158, 30, BENCH.recess, BENCH.edge, 5);
        this.host.skin?.uiIcon('scrap', 32, barY + 1, 17);
        this.host.text(`零件 ${view.parts}${session.bagParts ? ` · 袋${session.bagParts}` : ''}`, 106, barY + 1,
            { left: true, width: 132, size: 13, bold: true, color: GOLD });

        benchPlate(g, 182, barY - 14, 162, 30, BENCH.recess, BENCH.edge, 5);
        this.host.text(`HP ${session.currentHp}/${view.build.stats.maxHp} · Lv.${view.level}`, 263, barY + 1,
            { width: 152, size: 12, bold: true, color: GREEN });

        // 2x2 Wide Shop Grid (158x112 cards, zero cramped text wrapping!)
        const gridTop = barY - 22;
        const cardW = 158;
        const cardH = 112;
        view.slots.forEach((slot, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 16 + col * (cardW + 12);
            const y = gridTop - (row + 1) * cardH - row * 10;

            if (slot.sold) {
                benchPlate(g, x, y, cardW, cardH, BENCH.recess, BENCH.steel, 6);
                this.host.text('已装上', x + cardW / 2, y + cardH / 2, { size: 13, color: BENCH.muted });
                return;
            }
            const isWeapon = slot.kind === 'weapon';
            const weapon = isWeapon ? WEAPON_CATALOG[slot.itemId as ToolId] : undefined;
            const mod = !isWeapon ? MODULE_BY_ID[slot.itemId] : undefined;
            const name = weapon?.name ?? mod?.name ?? slot.itemId;
            const modLines = mod ? formatModuleCardLines(mod) : null;
            const line1 = weapon
                ? weapon.tags.map(t => TAG_LABELS[t].slice(0, 2)).join('/') + ` · 基础伤害 ${weapon.tiers[slot.tier - 1].damage}`
                : (modLines?.line1 ?? '');
            const line1Color = weapon ? CYAN : (modLines?.line1Color ?? GREEN);
            const line2 = weapon
                ? (slot.tier >= 3 ? (weapon.tiers[slot.tier - 1].perkText ?? weapon.roleText) : weapon.roleText).split(/[，。！]/)[0]
                : (modLines?.line2 ?? '');
            const line2Color = weapon ? (slot.tier >= 3 ? GOLD : BENCH.muted) : (modLines?.line2Color ?? BENCH.muted);

            benchPlate(g, x, y, cardW, cardH, TIER_FILL[slot.tier], slot.locked ? GOLD : TIER_EDGE[slot.tier], 6);

            // Top strip: tier badge + Lock toggle button
            this.host.text(isWeapon ? `武器 ${TIER_ROMAN[slot.tier]}` : TIER_NAME[slot.tier], x + 44, y + cardH - 13,
                { left: true, width: 78, size: 11, bold: true, color: TIER_EDGE[slot.tier] });
            this.pixelBtn(slot.locked ? '已锁' : '锁', x + cardW - 22, y + cardH - 14, 36, 22, () => {
                if (session.toggleLock(idx)) {
                    this.shopFeedback = slot.locked ? '已解锁该货位' : '已锁住 · 下波不涨价';
                    this.storage.saveActiveRun(session);
                } else {
                    this.shopFeedback = `最多同时锁 ${view.maxLocks} 件（去工坊扩充）`;
                }
            }, slot.locked);

            // Row 1: Icon + Item Name; Row 2 & 3: Full-width (148px) plain-Chinese Gain & Special/Cost lines!
            const iconKey = isWeapon ? slot.itemId : (MODULE_ICON[slot.itemId] ?? 'gear/pulse');
            this.host.skin?.uiIcon(iconKey, x + 22, y + 75, 26);
            this.host.text(name, x + 96, y + 75, { left: true, width: 114, size: 13, bold: true, color: BENCH.paper });
            this.host.text(line1, x + cardW / 2, y + 54, { width: cardW - 10, height: 15, size: line1.length > 14 ? 9 : 10, bold: !weapon, color: line1Color });
            this.host.text(line2, x + cardW / 2, y + 38, { width: cardW - 10, height: 15, size: line2.length > 14 ? 9 : 10, color: line2Color });

            // Bottom one-tap Buy / Auto-merge button!
            const affordable = view.parts >= slot.price;
            const buyLabel = slot.canAutoMerge ? UI_COPY.shop.mergeBuy(slot.price) : UI_COPY.shop.buy(slot.price);
            this.pixelBtn(buyLabel, x + cardW / 2, y + 17, cardW - 10, 26, () => {
                const res = session.buySlot(idx);
                if (res.ok) {
                    this.host.play('purchase');
                    this.shopFeedback = res.merged
                        ? `2合1 升阶成功！${name} → ${TIER_ROMAN[(slot.tier + 1) as Tier]}阶`
                        : res.freeBuyoutReroll ? `买空整排！赠送一次免费翻箱` : `已装上 ${name}`;
                    this.storage.saveActiveRun(session);
                } else if (res.reason) {
                    this.shopFeedback = res.reason;
                }
            }, slot.canAutoMerge && affordable, affordable);
        });

        // 6 Weapon Slots Row with Tier Badges & Quick Merge/Sell Tray
        const rowY = gridTop - cardH * 2 - 48;
        const slotW = 50;
        for (let i = 0; i < 6; i++) {
            const w = view.weapons[i];
            const sx = 16 + i * 55.6 + slotW / 2;
            const focused = this.inspectWeaponSlot === i;
            benchPlate(g, sx - slotW / 2, rowY - 24, slotW, 48,
                w ? TIER_FILL[w.tier] : BENCH.recess,
                focused ? GOLD : w ? TIER_EDGE[w.tier] : BENCH.edge, 5);
            if (w) {
                this.host.skin?.uiIcon(w.id, sx, rowY + 4, 28);
                this.host.text(TIER_ROMAN[w.tier], sx + 14, rowY + 14, { width: 16, size: 10, bold: true, color: TIER_EDGE[w.tier] });
                this.host.text(SHORT_WEAPON[w.id], sx, rowY - 14, { width: slotW - 4, size: 10, color: BENCH.paper });
                if (w.canMergeWith !== null) {
                    this.host.block(sx - 20, rowY + 14, 6, 6, GREEN);
                }
                this.host.addTouch(sx, rowY, slotW, 48, () => {
                    this.inspectWeaponSlot = focused ? null : i;
                });
            } else {
                this.host.text('+', sx, rowY, { width: slotW, size: 18, color: BENCH.muted });
            }
        }

        // Active Synergies Strip OR Selected Weapon Quick Action Bar
        const infoY = rowY - 48;
        if (this.inspectWeaponSlot !== null && view.weapons[this.inspectWeaponSlot]) {
            const w = view.weapons[this.inspectWeaponSlot];
            const spec = WEAPON_CATALOG[w.id];
            benchPlate(g, 16, infoY - 16, 328, 42, BENCH.steel, TIER_EDGE[w.tier], 6);
            this.host.text(`${w.name} ${TIER_ROMAN[w.tier]} · 伤${spec.tiers[w.tier - 1].damage}`, 96, infoY + 12,
                { left: true, width: 148, size: 12, bold: true, color: BENCH.paper });
            this.host.text(spec.tags.map(t => TAG_LABELS[t].slice(0, 2)).join('+'), 96, infoY - 5,
                { left: true, width: 148, size: 10, color: CYAN });
            if (w.canMergeWith !== null) {
                this.pixelBtn('2合1升阶', 216, infoY + 5, 72, 30, () => {
                    if (session.mergeWeapons(this.inspectWeaponSlot!, w.canMergeWith!)) {
                        this.host.play('unlock');
                        this.shopFeedback = `${w.name} 升至 ${TIER_ROMAN[(w.tier + 1) as Tier]} 阶！`;
                        this.inspectWeaponSlot = null;
                        this.storage.saveActiveRun(session);
                    }
                }, true);
            }
            const canSell = view.weapons.length > 1;
            this.pixelBtn(UI_COPY.shop.sell(w.sellRefund), 298, infoY + 5, 76, 30, () => {
                const refund = session.sellWeapon(this.inspectWeaponSlot!);
                if (refund > 0) {
                    this.shopFeedback = `拆解 ${w.name}，换回 ${refund} 零件`;
                    this.inspectWeaponSlot = null;
                    this.storage.saveActiveRun(session);
                }
            }, false, canSell);
        } else {
            const synText = view.build.synergies
                .filter(s => s.count > 0)
                .map(s => `${s.name.slice(0, 2)} ${s.count}${s.activeTier ? '★' : ''}`)
                .join('  ·  ');
            benchPlate(g, 16, infoY - 12, 328, 36, BENCH.recess, BENCH.edge, 5);
            this.host.text(synText || '凑齐 2 把同系武器激活羁绊', 180, infoY + 11, { width: 312, size: 11, bold: true, color: GREEN });
            const hasManualMerge = view.weapons.some(w => w.canMergeWith !== null);
            const nextHint = this.shopFeedback
                || (hasManualMerge ? '点下方带绿点的同名武器，可手动 2合1 升阶！' : session.chapter.waves[session.waveIndex + 1]?.hint || '');
            this.host.text(nextHint, 180, infoY - 4, { width: 312, size: 10, color: this.shopFeedback || hasManualMerge ? GOLD : BENCH.muted });
        }

        // Bottom Actions: Reroll (escalating/free) + Next Wave primary CTA
        const botY = Math.max(this.host.footer + 24, 48);
        const rerollLabel = UI_COPY.shop.reroll(view.nextRerollCost);
        const canReroll = view.freeRerollsLeft > 0 || view.parts >= view.nextRerollCost;
        this.pixelBtn(rerollLabel, 88, botY, 144, 48, () => {
            if (session.reroll()) {
                this.shopFeedback = '又翻了一箱新货';
                this.storage.saveActiveRun(session);
            }
        }, view.freeRerollsLeft > 0, canReroll);

        const nextWaveNum = view.wave + 1;
        const isBossNext = nextWaveNum === 12;
        this.pixelBtn(UI_COPY.shop.nextWave(nextWaveNum, isBossNext), 255, botY, 178, 48, () => {
            if (session.startNextWave()) {
                this.syncAudioSerials();
                this.storage.saveActiveRun(session);
                this.page = 'battle';
                this.host.syncMusic(true);
            }
        }, true);
    }

    private drawLevelUpOverlay(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header(`手艺涨了 · Lv.${view.level}`, '', undefined, `零件 ${view.parts}`, undefined);
        const g = this.host.ui;
        this.host.text(`剩余待选：${view.pendingLevelUps} 项 · 升满 5/10 级必出高阶`, 180, top - 16,
            { width: 320, size: 12, color: CYAN });

        view.levelUpOptions.forEach((opt, idx) => {
            const cardTop = top - 36 - idx * 88;
            const h = 76;
            const y = cardTop - h;
            benchPlate(g, 16, y, 328, h, TIER_FILL[opt.tier], TIER_EDGE[opt.tier], 8);
            this.host.text(TIER_NAME[opt.tier], 74, y + h - 18, { left: true, width: 100, size: 11, bold: true, color: TIER_EDGE[opt.tier] });
            this.host.text(opt.detail, 130, y + 36, { left: true, width: 210, size: 18, bold: true, color: BENCH.paper });
            this.host.text(STAT_LABELS[opt.stat].hint, 130, y + 16, { left: true, width: 210, size: 11, color: BENCH.muted });
            this.pixelBtn('选它', 292, y + h / 2, 76, 44, () => {
                if (this.session!.chooseLevelUp(idx)) {
                    this.host.play('purchase');
                    this.storage.saveActiveRun(this.session!);
                }
            }, true);
        });

        const botY = Math.max(this.host.footer + 26, 52);
        const canRoll = view.parts >= view.levelUpRerollCost;
        this.pixelBtn(UI_COPY.shop.levelUpReroll(view.levelUpRerollCost), 180, botY, 220, 46, () => {
            if (this.session!.rerollLevelUpOptions()) this.storage.saveActiveRun(this.session!);
        }, false, canRoll);
    }

    private drawStatsDrawer(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header('面板与羁绊', '‹ 回商店', () => { this.showStatsDrawer = false; }, `Lv.${view.level}`, undefined);
        const g = this.host.ui;

        const s = view.build.stats;
        const dr = Math.round((1 - armorDamageMultiplier(s.armor)) * 100);
        const rows: [string, string][] = [
            ['生命上限', `${s.maxHp}`], ['护甲减伤', `${s.armor} (减${dr}%)`],
            ['物理伤害', `${s.torque}`], ['电火伤害', `${s.voltage}`],
            ['全队增伤', `${s.overclock >= 0 ? '+' : ''}${s.overclock}%`], ['攻击速度', `${s.cycleSpeed >= 0 ? '+' : ''}${s.cycleSpeed}%`],
            ['暴击率', `${s.critChance}%`], ['自动回血', `${(s.repair * 0.25).toFixed(1)}/秒`],
            ['每波零件', `+${s.salvage}零件`], ['幸运/移速', `${s.luck} / ${s.moveSpeed >= 0 ? '+' : ''}${s.moveSpeed}%`],
        ];
        rows.forEach(([k, v], i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const rx = 16 + col * 168;
            const ry = top - 28 - row * 34;
            benchPlate(g, rx, ry - 14, 160, 28, BENCH.steel, BENCH.edge, 5);
            this.host.text(k, rx + 42, ry, { left: true, width: 72, size: 11, color: BENCH.muted });
            this.host.text(v, rx + 116, ry, { width: 78, size: 11, bold: true, color: BENCH.paper });
        });

        const synTop = top - 208;
        this.host.text('五大体系羁绊（2 / 4 / 6 把递进激活）', 180, synTop, { width: 328, size: 12, bold: true, color: GOLD });
        view.build.synergies.forEach((syn, idx) => {
            const cardH = 44;
            const y = synTop - 16 - (idx + 1) * cardH - idx * 6;
            const active = syn.activeTier > 0;
            benchPlate(g, 16, y, 328, cardH, active ? BENCH.weapon.fill : BENCH.recess, active ? GREEN : BENCH.edge, 5);
            this.host.text(`${syn.name} · ${syn.count}把${active ? `（${syn.activeTier}件已激活）` : ''}`, 180, y + 31,
                { left: true, width: 308, size: 12, bold: true, color: active ? GOLD : BENCH.paper });
            this.host.text(syn.summary, 180, y + 13,
                { left: true, width: 308, height: 18, size: 11, color: active ? GREEN : BENCH.muted });
        });

        const botY = Math.max(this.host.footer + 24, 48);
        this.pixelBtn('返回整备台', 180, botY, 328, 46, () => { this.showStatsDrawer = false; }, true);
    }

    // ─────────────────────────── PAGE 5: WORKSHOP (FLAT, ZERO COLLISION!) ───────────────────────────

    private drawWorkshop(): void {
        this.backdrop();
        const top = this.header('工坊改装', '‹ 返回', () => { this.page = 'home'; }, `凭证 ${this.profile.credits}`, undefined);
        const g = this.host.ui;

        const tabY = top - 22;
        this.pixelBtn('全局天赋（全6槽生效）', 102, tabY, 168, 34, () => { this.workshopTab = 'talents'; }, this.workshopTab === 'talents');
        this.pixelBtn('废件黑名单', 262, tabY, 144, 34, () => { this.workshopTab = 'bans'; }, this.workshopTab === 'bans');

        if (this.workshopTab === 'talents') {
            WORKSHOP_TALENTS.forEach((talent, idx) => {
                const cardH = 68;
                const y = tabY - 26 - (idx + 1) * cardH - idx * 8;
                const rank = this.profile.talents[talent.id] ?? 0;
                const maxed = rank >= talent.maxRank;
                const cost = maxed ? 0 : workshopTalentCost(talent, rank);
                const canBuy = !maxed && this.profile.credits >= cost;

                // STRICT 2-COLUMN CARD: left text fixed width 196px, right centered button 96x40 -> ZERO OVERLAP!
                benchPlate(g, 16, y, 328, cardH, BENCH.steel, maxed ? GREEN : BENCH.edge, 6);
                this.host.text(`${talent.name}  ${rank}/${talent.maxRank}`, 124, y + 48,
                    { left: true, width: 196, size: 14, bold: true, color: BENCH.paper });
                this.host.text(talent.detail(Math.max(1, rank)), 124, y + 22,
                    { left: true, width: 196, height: 30, size: 11, color: BENCH.muted });
                this.pixelBtn(maxed ? '已满级' : `升级 · ${cost}`, 286, y + cardH / 2, 92, 40, () => {
                    const next = buyWorkshopTalent(this.profile, talent.id);
                    if (next) {
                        this.profile = next;
                        this.storage.saveProfile(next);
                        this.host.play('purchase');
                    }
                }, canBuy, canBuy);
            });
        } else {
            const limit = (this.profile.talents.ban_permit ?? 0) * 2;
            this.host.text(`黑名单槽位：${this.profile.bannedModules.length} / ${limit}（升级「废件黑名单」解锁）`, 180, tabY - 34,
                { width: 320, size: 12, color: limit ? CYAN : GOLD });
            const pageSize = 6;
            const slice = MODULE_CATALOG.slice(this.banScroll, this.banScroll + pageSize);
            slice.forEach((mod, idx) => {
                const cardH = 60;
                const y = tabY - 50 - (idx + 1) * cardH - idx * 8;
                const banned = this.profile.bannedModules.includes(mod.id);
                benchPlate(g, 16, y, 328, cardH, banned ? BENCH.recess : TIER_FILL[mod.tier], banned ? RED : TIER_EDGE[mod.tier], 6);
                this.host.text(`${mod.name} (${TIER_ROMAN[mod.tier]})`, 124, y + 42,
                    { left: true, width: 196, size: 13, bold: true, color: banned ? BENCH.muted : BENCH.paper });
                this.host.text(formatStatPreview(mod.stats, 3, mod.special) || mod.flavor.slice(0, 18), 124, y + 18,
                    { left: true, width: 196, size: 10, color: BENCH.muted });
                this.pixelBtn(banned ? '已禁用' : '禁用', 290, y + cardH / 2, 82, 36, () => {
                    const next = toggleModuleBan(this.profile, mod.id);
                    if (next) { this.profile = next; this.storage.saveProfile(next); }
                }, banned, banned || this.profile.bannedModules.length < limit);
            });
            const botY = Math.max(this.host.footer + 20, 44);
            this.pixelBtn('上一页', 92, botY, 120, 38, () => { this.banScroll = Math.max(0, this.banScroll - pageSize); }, false, this.banScroll > 0);
            this.pixelBtn('下一页', 268, botY, 120, 38, () => {
                if (this.banScroll + pageSize < MODULE_CATALOG.length) this.banScroll += pageSize;
            }, false, this.banScroll + pageSize < MODULE_CATALOG.length);
        }
    }

    // ─────────────────────────── PAGE 6: LOG / ARCHIVE ───────────────────────────

    private drawLog(): void {
        this.backdrop();
        const top = this.header('值班记录', '‹ 返回', () => { this.page = 'home'; });
        const g = this.host.ui;
        const tabY = top - 22;
        this.pixelBtn('巡线档案', 100, tabY, 152, 34, () => { this.logTab = 'archive'; }, this.logTab === 'archive');
        this.pixelBtn('通班战绩', 260, tabY, 152, 34, () => { this.logTab = 'records'; }, this.logTab === 'records');

        if (this.logTab === 'archive') {
            const chapter = CHAPTER_CATALOG[this.archiveIdx];
            const narr = CHAPTER_NARRATIVES[chapter.id];
            const unlocked = this.profile.clearedChapters.includes(chapter.id);
            const cardTop = tabY - 30;
            benchPlate(g, 16, cardTop - 360, 328, 360, BENCH.steel, BENCH.edge, 8);
            this.host.text(`第${'一二三四'[this.archiveIdx]}章 · ${chapter.title}`, 180, cardTop - 24,
                { width: 300, size: 17, bold: true, color: GOLD });
            this.host.text(narr.archiveTitle, 180, cardTop - 52, { width: 300, size: 14, bold: true, color: CYAN });
            const body = unlocked
                ? `${narr.archiveNote}\n\n${narr.clearOutro.speaker}：${narr.clearOutro.line}${narr.epilogueHook ? `\n\n${narr.epilogueHook.speaker}：${narr.epilogueHook.line}` : ''}`
                : '打通本章后解锁完整夜班现场记录。';
            this.host.text(body, 180, cardTop - 196, { left: true, width: 296, height: 240, size: 13, color: BENCH.paper });

            const botY = Math.max(this.host.footer + 24, 52);
            this.pixelBtn('上一章', 92, botY, 130, 42, () => { if (this.archiveIdx > 0) this.archiveIdx--; }, false, this.archiveIdx > 0);
            this.pixelBtn('下一章', 268, botY, 130, 42, () => { if (this.archiveIdx < 3) this.archiveIdx++; }, false, this.archiveIdx < 3);
        } else {
            CHAPTER_CATALOG.forEach((ch, idx) => {
                const y = tabY - 32 - (idx + 1) * 86;
                const cleared = this.profile.clearedChapters.includes(ch.id);
                const maxD = this.profile.maxDangerCleared[ch.id];
                benchPlate(g, 16, y, 328, 76, BENCH.steel, cleared ? GREEN : BENCH.edge, 6);
                this.host.text(`第${'一二三四'[idx]}章 · ${ch.title}`, 130, y + 52, { left: true, width: 210, size: 15, bold: true, color: BENCH.paper });
                this.host.text(`路线：${ch.routeName} · 关底：${ch.bossName}`, 130, y + 26, { left: true, width: 210, size: 11, color: BENCH.muted });
                this.host.text(cleared ? `已通 · D${maxD ?? 0}` : '未通关', 292, y + 38,
                    { width: 82, size: 13, bold: true, color: cleared ? GREEN : BENCH.muted });
            });
        }
    }

    // ─────────────────────────── PAGE 7: SETTINGS ───────────────────────────

    private drawSettings(): void {
        this.backdrop();
        const top = this.header('设置', '‹ 返回', () => { this.page = 'home'; });
        const s = this.host.settings;
        const g = this.host.ui;
        const row = (label: string, on: boolean, y: number, toggle: () => void) => {
            benchPlate(g, 16, y - 24, 328, 48, BENCH.steel, BENCH.edge, 6);
            this.host.text(label, 110, y, { left: true, width: 160, size: 16, bold: true, color: BENCH.paper });
            this.pixelBtn(on ? '开' : '关', 292, y, 78, 36, toggle, on);
        };
        row('背景音乐', s.music, top - 56, () => this.host.updateSettings({ music: !s.music }));
        row('战斗音效', s.sound, top - 118, () => this.host.updateSettings({ sound: !s.sound }));
        this.host.text('移动方式', 80, top - 180, { left: true, width: 120, size: 15, bold: true, color: GOLD });
        this.pixelBtn('浮动摇杆', 96, top - 224, 152, 48, () => this.host.updateSettings({ movement: 'joystick' }), s.movement === 'joystick');
        this.pixelBtn('触屏点按', 264, top - 224, 152, 48, () => this.host.updateSettings({ movement: 'touch' }), s.movement === 'touch');
    }

    // ─────────────────────────── PAGE 8: RESULT WITH WEAPON DPS CHART ───────────────────────────

    private drawResult(): void {
        const res = this.result;
        if (!res) return;
        this.backdrop();
        const ending = res.won && res.chapterId === '04';
        const top = this.header(
            ending ? UI_COPY.result.endingHeading : res.won ? UI_COPY.result.wonHeading : UI_COPY.result.lostHeading,
            '工坊改装',
            () => { this.page = 'workshop'; },
            `凭证 ${this.profile.credits}`,
            undefined,
        );
        const g = this.host.ui;

        // Top summary card
        const sumTop = top - 10;
        benchPlate(g, 16, sumTop - 68, 328, 68, BENCH.recess, res.won ? GREEN : RED, 6);
        const mins = Math.floor(res.totalDurationSeconds / 60);
        const secs = Math.round(res.totalDurationSeconds % 60);
        const cols: [string, string][] = [
            ['推进波次', `${res.wavesCleared}/12`],
            ['总击倒', `${res.totalKills}`],
            ['用时', `${mins}分${secs}秒`],
            ['维修凭证', `+${res.creditsEarned}`],
        ];
        cols.forEach(([k, v], i) => {
            const cx = 16 + (i + 0.5) * 82;
            this.host.text(k, cx, sumTop - 52, { width: 78, size: 11, color: BENCH.muted });
            this.host.text(v, cx, sumTop - 26, { width: 78, size: 16, bold: true, color: i === 3 ? GOLD : BENCH.paper });
        });

        // Weapon Damage Breakdown Chart ("这班谁最出力")
        const chartTop = sumTop - 80;
        const chartH = 196;
        benchPlate(g, 16, chartTop - chartH, 328, chartH, BENCH.steel, BENCH.edge, 8);
        this.host.text(UI_COPY.result.damageChartTitle, 96, chartTop - 18, { left: true, width: 150, size: 13, bold: true, color: GOLD });
        const totalDmg = Math.max(1, res.damageByWeapon.reduce((s, w) => s + w.totalDamage, 0));
        res.damageByWeapon.slice(0, 6).forEach((w, idx) => {
            const wy = chartTop - 44 - idx * 27;
            const share = w.totalDamage / totalDmg;
            this.host.skin?.uiIcon(w.id, 34, wy, 20);
            this.host.text(`${WEAPON_CATALOG[w.id].name}${TIER_ROMAN[w.tier]}`, 88, wy,
                { left: true, width: 82, size: 11, color: BENCH.paper });
            this.host.block(136, wy - 5, 134, 10, BENCH.recess);
            this.host.block(136, wy - 5, Math.max(3, Math.round(134 * share)), 10, TIER_EDGE[w.tier]);
            this.host.text(`${Math.round(share * 100)}%`, 306, wy, { width: 58, size: 11, bold: true, color: TIER_EDGE[w.tier] });
        });

        // Human Outro Radio (with Harbor Epilogue on Chapter 4 clear!)
        const radioTop = chartTop - chartH - 10;
        const radioH = res.epilogueHook ? 124 : 78;
        benchPlate(g, 16, radioTop - radioH, 328, radioH, BENCH.recess, BENCH.edge, 6);
        const portrait = res.outroRadio.speaker === '陈栖' ? 'radio-chenqi' : 'radio-aruan';
        this.host.skin?.uiIcon(portrait, 40, radioTop - 28, 32);
        this.host.text(`${res.outroRadio.speaker}：${res.outroRadio.line}`, 196, radioTop - 36,
            { left: true, width: 266, height: 64, size: 11, color: BENCH.paper });
        if (res.epilogueHook) {
            this.host.block(28, radioTop - 74, 304, 1, BENCH.edge);
            this.host.text(`${res.epilogueHook.speaker}：${res.epilogueHook.line}`, 180, radioTop - 99,
                { left: true, width: 300, height: 42, size: 11, color: GOLD });
        }

        // Bottom CTA: Seamless push to Next Chapter or instant Retry!
        const botY = Math.max(this.host.footer + 24, 48);
        const nextIdx = CHAPTER_CATALOG.findIndex(c => c.id === res.chapterId) + 1;
        const nextChapter = res.won && nextIdx < CHAPTER_CATALOG.length ? CHAPTER_CATALOG[nextIdx] : undefined;
        if (nextChapter) {
            this.pixelBtn(UI_COPY.result.nextChapter(nextChapter.title) + ' ›', 180, botY + 52, 328, 48, () => {
                this.chapterIdx = nextIdx;
                this.page = 'prep';
            }, true);
        } else {
            this.pixelBtn(UI_COPY.result.retry, 180, botY + 52, 328, 48, () => {
                this.startNewPatrol(res.chapterId, res.rigId, res.danger);
            }, true);
        }
        this.pixelBtn('回值班室', 96, botY, 156, 42, () => { this.page = 'home'; });
        this.pixelBtn(UI_COPY.result.backWorkshop, 264, botY, 156, 42, () => { this.page = 'workshop'; });
    }

    // ─────────────────────────── SHARED PIXEL PRIMITIVES ───────────────────────────

    private backdrop(): void {
        const pad = HEIGHT * (this.host.backdropScale - 1) / 2;
        this.host.block(0, -pad, WIDTH, HEIGHT + 2 * pad, BENCH.ink);
    }

    private header(title: string, leftLabel: string, onLeft?: () => void, rightLabel?: string, onRight?: () => void): number {
        const y = Math.min(this.host.top - 4, this.host.capsuleCeiling - 24);
        if (leftLabel && onLeft) this.pixelBtn(leftLabel, 58, y, 84, 34, onLeft);
        this.host.text(title, 180, y, { width: 164, size: 18, bold: true, color: BENCH.paper });
        if (rightLabel) {
            if (onRight) this.pixelBtn(rightLabel, 302, y, 84, 34, onRight);
            else {
                benchPlate(this.host.ui, 256, y - 16, 88, 32, BENCH.recess, BENCH.edge, 5);
                this.host.text(rightLabel, 300, y, { width: 82, size: 12, bold: true, color: GOLD });
            }
        }
        benchScrew(this.host.ui, 20, y - 24);
        benchScrew(this.host.ui, 340, y - 24);
        this.host.block(16, y - 24, 328, 1, BENCH.edge);
        return y - 26;
    }

    private pixelBtn(
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        action: () => void,
        primary = false,
        enabled = true,
        badge = false,
    ): void {
        const held = enabled && this.host.addTouch(x, y, w, h, action);
        const fill = !enabled ? BENCH.recess : primary ? (held ? BENCH.paper : GOLD) : (held ? BENCH.edge : BENCH.steel);
        const edge = !enabled ? BENCH.steel : primary ? undefined : BENCH.edge;
        benchPlate(this.host.ui, x - w / 2, y - h / 2, w, h, fill, edge, 5);
        this.host.text(label, x, y, {
            width: w - 8,
            size: h >= 46 ? 16 : h >= 34 ? 13 : 11,
            bold: primary || h >= 42,
            color: !enabled ? BENCH.muted : primary ? BENCH.ink : BENCH.paper,
        });
        if (badge) {
            this.host.ui.fillColor = RED;
            this.host.ui.rect(x + w / 2 - 9, y + h / 2 - 9, 7, 7);
            this.host.ui.fill();
        }
    }

    inspect(): object {
        return {
            mode: 'patrol-v3',
            page: this.page,
            paused: this.paused,
            credits: this.profile.credits,
            clearedChapters: this.profile.clearedChapters,
            chapter: CHAPTER_CATALOG[this.chapterIdx].id,
            rig: RIG_ORDER[this.rigIdx],
            danger: this.danger,
            wave: this.session ? this.session.waveIndex + 1 : null,
            level: this.session?.level ?? null,
            parts: this.session?.intermission?.parts ?? this.session?.parts ?? null,
            hp: this.session?.battle?.player.hp ?? this.session?.currentHp ?? null,
            maxHp: this.session?.battle?.player.maxHp ?? null,
            boss: this.session?.battle?.bossView ?? null,
            shopOffers: this.session?.shopView?.slots.map(s => ({ id: s.itemId, tier: s.tier, price: s.price, locked: s.locked, sold: s.sold })) ?? null,
            pendingLevelUps: this.session?.shopView?.pendingLevelUps ?? 0,
        };
    }

    // Debug helper for QA screenshot automation to jump cleanly across every redesigned screen.
    jumpDebugState(target: string): void {
        if (target === 'prep') { this.page = 'prep'; return; }
        if (target === 'workshop') { this.profile = { ...this.profile, credits: Math.max(this.profile.credits, 80) }; this.page = 'workshop'; return; }
        if (target === 'log') { this.profile = { ...this.profile, clearedChapters: ['01', '02', '03', '04'] }; this.page = 'log'; return; }
        if (target === 'battle' || target === 'boss' || target === 'levelup' || target === 'shop' || target === 'result') {
            this.startNewPatrol('01', 'duty_standard', 0);
            if (!this.session) return;
            if (target === 'battle') {
                for (let i = 0; i < 65; i++) this.session.stepBattle(0.5, 0.2);
                return;
            }
            if (target === 'levelup' || target === 'shop') {
                this.session.xp = xpRequiredForLevel(1) + 5;
                this.session.parts = 95;
                this.session.weapons = [
                    { uid: 1, id: 'wrench', tier: 2 },
                    { uid: 2, id: 'arc_gun', tier: 1 },
                    { uid: 3, id: 'wrench', tier: 2 },
                    { uid: 4, id: 'torch', tier: 1 },
                ];
                while (this.session.phase === 'battle') this.session.stepBattle(Math.cos(this.session.battle!.tick / 25), Math.sin(this.session.battle!.tick / 25));
                if (target === 'shop') {
                    while (this.session.shopView && this.session.shopView.pendingLevelUps > 0) this.session.chooseLevelUp(0);
                }
                this.page = 'shop';
                return;
            }
            if (target === 'boss') {
                this.session.waveIndex = 11;
                this.session.level = 11;
                this.session.weapons = [
                    { uid: 1, id: 'wrench', tier: 3 },
                    { uid: 2, id: 'arc_gun', tier: 3 },
                    { uid: 3, id: 'hydraulic_nailer', tier: 2 },
                    { uid: 4, id: 'torch', tier: 2 },
                    { uid: 5, id: 'induction', tier: 2 },
                    { uid: 6, id: 'split_probe', tier: 2 },
                ];
                const snap = { ...this.session.snapshot(), phase: 'battle' as const, waveIndex: 11 };
                this.session = PatrolSession.fromSnapshot(snap, this.profile);
                for (let i = 0; i < 60; i++) this.session.stepBattle(0.3, -0.2);
                this.page = 'battle';
                return;
            }
            if (target === 'result') {
                this.session.weapons = [
                    { uid: 1, id: 'wrench', tier: 3 },
                    { uid: 2, id: 'arc_gun', tier: 3 },
                    { uid: 3, id: 'hydraulic_nailer', tier: 3 },
                    { uid: 4, id: 'torch', tier: 2 },
                    { uid: 5, id: 'induction', tier: 2 },
                    { uid: 6, id: 'split_probe', tier: 2 },
                ];
                this.session.reports.push({
                    wave: 12, stationName: '中央调度台', cleared: true, elapsedSeconds: 34, kills: 1082, elitesKilled: 2,
                    partsCollected: 310, partsBagged: 0, bagRedeemed: 45, xpGained: 1200, damageTaken: 68, hitsTaken: 7,
                    healed: 38, endHp: 46, maxHp: 96, defeatedBy: null, hitSources: {}, emptySeconds: 0,
                    damageByWeapon: [
                        { slot: 0, id: 'wrench', tier: 3, totalDamage: 18420, kills: 290, crits: 42 },
                        { slot: 1, id: 'arc_gun', tier: 3, totalDamage: 15810, kills: 248, crits: 29 },
                        { slot: 2, id: 'hydraulic_nailer', tier: 3, totalDamage: 14190, kills: 185, crits: 51 },
                        { slot: 3, id: 'torch', tier: 2, totalDamage: 11300, kills: 174, crits: 14 },
                        { slot: 4, id: 'induction', tier: 2, totalDamage: 7940, kills: 110, crits: 11 },
                        { slot: 5, id: 'split_probe', tier: 2, totalDamage: 6520, kills: 75, crits: 19 },
                    ],
                });
                this.session.phase = 'won';
                this.finalizeRun();
            }
        }
    }
}
