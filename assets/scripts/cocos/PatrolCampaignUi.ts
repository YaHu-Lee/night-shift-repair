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
import {
    CHAPTER_CLEAR_BONUS,
    DANGER_LEVELS,
    DANGER_RULE_TEXT,
    DANGER_SHORT_LABELS,
    PRE_RUN_SUPPLIES,
    PRE_RUN_SUPPLY_ORDER,
    bonusBanSlotsForProfile,
    chapterUnlockHint,
    dangerUnlockHint,
    goldSealCount,
    hasCustomStarterUnlock,
    isChapterUnlocked,
    isDangerUnlocked,
    isModuleUnlocked,
    isRigUnlocked,
    isSecretArchiveUnlocked,
    legalStarterWeaponsForRig,
    maxUnlockedDanger,
    moduleRequiredDanger,
    rigUnlockHint,
    totalBanSlots,
    unclaimedFirstClearBonus,
} from '../roguelite/progression';
import { PatrolSession, buyPreRunSupply, buyWorkshopTalent, toggleModuleBan } from '../roguelite/session';
import type { PatrolResult } from '../roguelite/session';
import {
    DAILY_CHECKIN_CREDITS,
    SHOP_EMERGENCY_PARTS,
    canClaimDailyCheckIn,
    claimDailyCheckIn,
    consumeDailyAdUse,
    consumeFreeSupplyCharge,
    freeSupplyChargesToday,
    getDailyShift,
    hasEndlessUnlocked,
    isDailyShiftClearedToday,
    isFirstTimePlayer,
    markOnboardingDone,
    needsShopOnboarding,
    remainingDailyAdUses,
    todayDateKey,
} from '../roguelite/engagement';
import type { MiniGameEngage } from '../platform/miniGameEngage';
import type {
    ChapterDefinition,
    DailyShiftModifierId,
    DangerLevel,
    ModuleSpec,
    PreRunSupplyId,
    RewardedPlacement,
    RigId,
    StatKey,
    Tier,
    WorkshopProfile,
} from '../roguelite/types';
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
const DANGER_COLOR: Record<DangerLevel, Color> = {
    0: new Color(172, 188, 198),
    1: new Color(230, 154, 92),
    2: CYAN,
    3: PURPLE,
    4: GOLD,
};

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
    readonly engage?: MiniGameEngage | null;
}

type PatrolPage = 'home' | 'prep' | 'workshop' | 'log' | 'settings' | 'battle' | 'revive' | 'shop' | 'result';
type PrepMode = 'story' | 'daily' | 'endless';
const RIG_ORDER: readonly RigId[] = ['duty_standard', 'heavy_fitter', 'high_voltage', 'thermal_welder', 'scrap_auditor'];

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
    shop_discount: '全店打九折',
    free_reroll: '每店多翻一箱',
    double_parts: '两成概率双份零件',
    crit_heal: '暴击后15%回2血',
    arc_shock: '感电打死炸电花',
    burn_spread: '烧死会烧到旁边',
    armor_thorns: '挨打反震周围',
    extra_enemies: '场上敌机多18%',
    breaker_surge: '开波电震，前6秒快出手',
};

const SPECIAL_SHORT: Readonly<Record<string, string>> = {
    shop_discount: '全店九折',
    free_reroll: '多翻一箱',
    double_parts: '两成双份',
    crit_heal: '暴击回2血',
    arc_shock: '感电炸花',
    burn_spread: '烧死蔓延',
    armor_thorns: '挨打反震',
    extra_enemies: '敌机+18%',
    breaker_surge: '开波超载',
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
    main_breaker_lever: 'prop/terminal',
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
    profile!: WorkshopProfile;
    session: PatrolSession | null = null;
    result: PatrolResult | null = null;

    page: PatrolPage = 'home';
    paused = false;
    private chapterIdx = 0;
    private rigIdx = 0;
    private danger: DangerLevel = 0;
    private supplyIdx = 0;
    private prepMode: PrepMode = 'story';
    private starterByRig: Partial<Record<RigId, ToolId>> = {};
    private workshopTab: 'talents' | 'bans' = 'talents';
    private logTab: 'archive' | 'records' = 'archive';
    private archiveIdx = 0;
    private banScroll = 0;
    private inspectWeaponSlot: number | null = null;
    private showStatsDrawer = false;
    private shopFeedback = '';
    private homeNotice = '';
    private adBusy = false;
    private resultDoubledRunId: string | null = null;
    private tutorialSkipped = false;
    private movedTicksInWave = 0;
    private uiTick = 0;
    private saving = false;
    private retrySave: (() => void) | null = null;
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
        private readonly legacyProfile?: { clearedStages?: readonly string[]; credits?: number } | null,
        storage?: PatrolStorage,
    ) {
        this.storage = storage ?? new PatrolStorage();
        this.restore();
    }

    private restore(): void {
        this.page = 'home';
        this.result = null;
        this.paused = false;
        this.retrySave = null;
        this.profile = this.storage.loadProfile(this.legacyProfile);
        if (this.storage.needsReload) {
            this.session = null;
            this.retrySave = () => this.restore();
            return;
        }
        this.session = this.storage.loadActiveRun(this.profile);
        if (this.session) {
            this.chapterIdx = this.session.chapter.index;
            this.rigIdx = Math.max(0, RIG_ORDER.indexOf(this.session.rigId));
            this.danger = this.session.danger;
            this.supplyIdx = Math.max(0, PRE_RUN_SUPPLY_ORDER.indexOf(this.session.supply));
            if (this.session.phase === 'won' || this.session.phase === 'lost') this.finalizeRun();
        } else {
            const firstUncleared = CHAPTER_CATALOG.findIndex(c =>
                isChapterUnlocked(this.profile, c.id) && !this.profile.clearedChapters.includes(c.id),
            );
            const highestUnlocked = CHAPTER_CATALOG.reduce((acc, c, idx) =>
                isChapterUnlocked(this.profile, c.id) ? idx : acc, 0);
            this.chapterIdx = firstUncleared >= 0 ? firstUncleared : highestUnlocked;
            if (!isRigUnlocked(this.profile, RIG_ORDER[this.rigIdx])) this.rigIdx = 0;
            this.danger = Math.min(this.danger, maxUnlockedDanger(this.profile)) as DangerLevel;
        }
    }

    get inBattle(): boolean {
        return !this.saving && !this.adBusy && !this.retrySave && this.page === 'battle' && !!this.session?.battle && !this.paused;
    }

    private canOfferAd(): boolean {
        return this.profile.adFreePass === true || this.host.engage?.hasRewardedAd === true;
    }

    private adVerb(action: string): string {
        return this.profile.adFreePass ? `工牌·${action}` : `视频·${action}`;
    }

    private triggerReward(placement: RewardedPlacement, onReward: () => void, onFail?: () => void): void {
        if (this.adBusy) return;
        const engage = this.host.engage;
        if (this.profile.adFreePass) {
            onReward();
            return;
        }
        if (!engage?.hasRewardedAd) {
            onFail?.();
            return;
        }
        this.adBusy = true;
        this.host.onBattleStopped();
        void engage.requestReward(placement, { adFreePass: this.profile.adFreePass }).then(ok => {
            this.adBusy = false;
            if (ok) {
                onReward();
            } else {
                this.shopFeedback = '视频未看完，暂未发放';
                onFail?.();
            }
        }, () => {
            this.adBusy = false;
            this.shopFeedback = '视频暂不可用，请稍后再试';
            onFail?.();
        });
    }

    private completeOnboarding(): void {
        if (this.profile.onboardingDone) return;
        const next = markOnboardingDone(this.profile);
        this.saveWorkshop(next);
    }

    private drawGuidePulse(x: number, y: number, w: number, h: number, color: Color): void {
        const g = this.host.ui;
        const pulse = Math.floor(this.uiTick / 16) % 2 === 0;
        const pad = pulse ? 3 : 2;
        g.strokeColor = color;
        g.lineWidth = pulse ? 3 : 2;
        g.rect(x - pad, y - pad, w + pad * 2, h + pad * 2);
        g.stroke();
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
        if (this.saving || this.adBusy || this.retrySave || this.page !== 'battle' || this.paused || !this.session?.battle) return;
        const b = this.session.battle;
        if (Math.hypot(axisX, axisY) > 0.1 || b.destination) this.movedTicksInWave++;
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
            this.saveRun(this.session);
            this.inspectWeaponSlot = null;
            this.showStatsDrawer = false;
            this.shopFeedback = '';
            this.page = 'shop';
            this.host.syncMusic(false);
        } else if (this.session.phase === 'lost' && this.session.canRevive && this.canOfferAd()) {
            this.page = 'revive';
            this.host.syncMusic(false);
        } else if (this.session.phase === 'won' || this.session.phase === 'lost') {
            this.finalizeRun();
        }
    }

    private persist(write: () => boolean): void {
        const attempt = () => this.finishWrite(write);
        const locks = typeof navigator !== 'undefined' && navigator.locks;
        if (!locks) { attempt(); return; }
        // Serialise the read/compare/write across tabs on Web origins supporting Web Locks.
        this.saving = true;
        void locks.request('night-shift.patrol.save', attempt).catch(() => {
            this.retrySave = () => this.persist(write);
        }).finally(() => { this.saving = false; });
    }

    private finishWrite(write: () => boolean): void {
        if (write()) {
            this.retrySave = null;
        } else {
            this.host.onBattleStopped();
            this.retrySave = this.storage.needsReload ? () => this.restore() : () => this.persist(write);
        }
    }

    private saveRun(session: PatrolSession): void {
        this.persist(() => this.storage.saveActiveRun(session));
    }

    private saveWorkshop(profile: WorkshopProfile): void {
        this.persist(() => {
            if (!this.storage.saveProfile(profile)) return false;
            this.profile = profile;
            return true;
        });
    }

    private finalizeRun(): void {
        const session = this.session;
        if (!session) return;
        const preProfile = this.profile;
        this.persist(() => {
            const profile = this.storage.settleRun(session);
            if (!profile) return false;
            this.profile = profile;
            this.result = session.settle(preProfile);
            this.page = 'result';
            this.host.play(this.result.won ? 'unlock' : 'hit');
            this.host.syncMusic(false);
            return true;
        });
    }

    private startNewPatrol(
        chapterId: ChapterDefinition['id'],
        rigId: RigId,
        danger: DangerLevel,
        supply: PreRunSupplyId = 'none',
        starterWeapon?: ToolId,
        opts: {
            readonly freeSupply?: boolean;
            readonly useCheckInCharge?: boolean;
            readonly consumePrepAd?: boolean;
            readonly trialRig?: boolean;
            readonly dailyShiftKey?: string;
            readonly dailyMod?: DailyShiftModifierId;
            readonly endlessMode?: boolean;
            readonly fixedSeed?: number;
        } = {},
    ): void {
        const bypassLocks = !!opts.dailyShiftKey || !!opts.endlessMode;
        if (!bypassLocks && (!isChapterUnlocked(this.profile, chapterId) || !isDangerUnlocked(this.profile, danger))) {
            return;
        }
        if (!bypassLocks && !opts.trialRig && !isRigUnlocked(this.profile, rigId)) {
            return;
        }
        if (opts.endlessMode && !hasEndlessUnlocked(this.profile)) return;

        let paidProfile: WorkshopProfile | null = this.profile;
        if (opts.consumePrepAd) {
            paidProfile = consumeDailyAdUse(paidProfile, 'prep');
            if (!paidProfile) return;
        }
        if (supply !== 'none') {
            if (opts.useCheckInCharge) {
                paidProfile = consumeFreeSupplyCharge(paidProfile);
            } else if (!opts.freeSupply) {
                paidProfile = buyPreRunSupply(paidProfile, supply);
            }
            if (!paidProfile) return;
        }

        const chosenStarter = hasCustomStarterUnlock(paidProfile) && !opts.dailyShiftKey ? starterWeapon : undefined;
        const seed = opts.fixedSeed ?? ((Date.now() ^ Math.imul(paidProfile.credits + 17, 2654435761)) >>> 0);
        const nextSession = new PatrolSession({
            chapterId,
            rigId,
            danger,
            supply,
            starterWeapon: chosenStarter,
            dailyShiftKey: opts.dailyShiftKey,
            dailyMod: opts.dailyMod,
            endlessMode: opts.endlessMode,
            trialRig: opts.trialRig,
            seed,
            profile: paidProfile,
        });
        this.session = nextSession;
        this.result = null;
        this.paused = false;
        this.inspectWeaponSlot = null;
        this.showStatsDrawer = false;
        this.movedTicksInWave = 0;
        this.syncAudioSerials();
        this.persist(() => {
            if (!this.storage.startRun(paidProfile!, nextSession)) return false;
            this.profile = paidProfile!;
            this.supplyIdx = 0;
            return true;
        });
        this.page = 'battle';
        this.host.syncMusic(true);
    }

    private resumeSavedPatrol(): void {
        if (!this.session) return;
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
        this.uiTick++;
        const isBattle = !this.retrySave && (this.page === 'battle' || this.page === 'revive') && !!this.session?.battle;
        if (!isBattle) {
            this.host.clearWorldLayers();
            this.host.skin?.drawWorld(null, false);
        }
        this.host.setScenery(this.page === 'home' ? 'night-depot' : null);

        if (isBattle) {
            this.drawBattleWorld();
        }
        this.host.skin?.beginUi();
        if (this.saving || this.adBusy) {
            this.host.text(this.adBusy ? '正在载入激励视频…' : '正在保存进度…', 180, 320, { width: 236, size: 16, color: BENCH.paper });
            this.host.skin?.endUi();
            return;
        }
        if (this.retrySave) {
            this.backdrop();
            const reload = this.storage.needsReload;
            this.host.text(reload ? '请重新读取本机存档' : '进度尚未保存', 180, 365,
                { width: 304, size: 22, bold: true, color: BENCH.paper });
            this.host.text(reload ? '存档已变化或无法读取。' : '请确认本机存储可用，再重试。', 180, 315,
                { width: 304, size: 14, color: BENCH.muted });
            this.pixelBtn(reload ? '重新读取' : '重试保存', 180, 254, 236, 50, this.retrySave, true);
            this.host.skin?.endUi();
            return;
        }
        switch (this.page) {
            case 'home': this.drawHome(); break;
            case 'prep': this.drawPrep(); break;
            case 'workshop': this.drawWorkshop(); break;
            case 'log': this.drawLog(); break;
            case 'settings': this.drawSettings(); break;
            case 'battle': this.drawBattleHud(); break;
            case 'revive': this.drawReviveOffer(); break;
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

        const seals = goldSealCount(this.profile);
        if (seals > 0) {
            benchPlate(g, 16, topY - 110, seals === 4 ? 132 : 98, 26, BENCH.recess, GOLD, 5);
            this.host.skin?.uiIcon('ui/medal', 31, topY - 97, 16);
            this.host.text(seals === 4 ? '全城值守·金章' : `金印 ${seals}/4`, seals === 4 ? 90 : 73, topY - 97,
                { left: true, width: seals === 4 ? 98 : 66, size: 11, bold: true, color: GOLD });
        }

        // FIXED: Settings button now sits on an opaque pixel dark plate so it never bleeds into the pixel roof art.
        this.pixelBtn(UI_COPY.home.settingsTab, 314, Math.min(topY - 24, this.host.capsuleCeiling - 24), 60, 34, () => {
            this.page = 'settings';
        });

        // Retention: Daily Check-In / Douyin Sidebar Revisit Gift
        const dateKey = todayDateKey();
        const canCheckIn = canClaimDailyCheckIn(this.profile, dateKey);
        const engage = this.host.engage;
        const needSidebarJump = engage?.platform === 'douyin' && engage.canOpenSidebar && !engage.isDouyinSidebarEntry;
        const checkInLabel = !canCheckIn
            ? '今日已打卡 ✓'
            : needSidebarJump ? '侧边栏领礼' : `打卡 +${DAILY_CHECKIN_CREDITS}凭证`;
        this.pixelBtn(checkInLabel, 286, topY - 68, 114, 30, () => {
            if (!canCheckIn) return;
            if (needSidebarJump) {
                void engage?.openSidebar().then(ok => {
                    this.homeNotice = ok ? '从侧边栏重进即可领取今日补给！' : '可直接在首页打卡领取今日补给';
                });
                return;
            }
            const next = claimDailyCheckIn(this.profile, dateKey);
            if (next) {
                this.saveWorkshop(next);
                this.host.play('unlock');
                this.homeNotice = `打卡到账 +${DAILY_CHECKIN_CREDITS} 凭证 · 送 1 次免费班前特供`;
            }
        }, canCheckIn, canCheckIn);

        // FIXED: Unified hard-edge pixel bottom bar (no thin vector circles).
        const bottom = Math.max(this.host.footer + 28, 56);
        const hasActive = !!this.session && (this.session.phase === 'battle' || this.session.phase === 'shop');

        if (this.homeNotice) {
            benchPlate(g, 16, bottom + 36, 328, 28, new Color(14, 22, 29, 230), GOLD, 5);
            this.host.text(this.homeNotice, 180, bottom + 50, { width: 312, size: 11, bold: true, color: GOLD });
        } else if (!hasActive && !isFirstTimePlayer(this.profile)) {
            const daily = getDailyShift(dateKey);
            const dailyDone = isDailyShiftClearedToday(this.profile, dateKey);
            benchPlate(g, 16, bottom + 36, 328, 30, new Color(14, 22, 29, 224), dailyDone ? GREEN : CYAN, 5);
            const dailyText = `今日急单 · ${daily.modifier.name}${dailyDone ? ' · 已完成 ✓' : ` · 奖+${daily.bonusCredits}凭证`}`;
            this.host.text(dailyText, 152, bottom + 51, { left: true, width: 254, size: 11, bold: true, color: dailyDone ? GREEN : CYAN });
            this.pixelBtn('去看看', 310, bottom + 51, 56, 22, () => {
                this.prepMode = 'daily';
                this.page = 'prep';
            }, !dailyDone);
        }

        const canUpgrade = WORKSHOP_TALENTS.some(t => {
            const rank = this.profile.talents[t.id] ?? 0;
            return rank < t.maxRank && this.profile.credits >= workshopTalentCost(t, rank);
        });
        this.pixelBtn('工坊', 52, bottom, 68, 48, () => { this.homeNotice = ''; this.page = 'workshop'; }, false, true, canUpgrade);
        this.pixelBtn('日志', 126, bottom, 68, 48, () => { this.homeNotice = ''; this.page = 'log'; });

        const held = this.host.addTouch(256, bottom, 174, 52, () => {
            this.homeNotice = '';
            if (hasActive) {
                this.resumeSavedPatrol();
            } else if (isFirstTimePlayer(this.profile)) {
                // Save the first-30s funnel: brand-new players drop straight into Ch1 Wave 1 on first pull!
                this.startNewPatrol('01', 'duty_standard', 0, 'none');
            } else {
                this.prepMode = 'story';
                this.page = 'prep';
            }
        });
        drawDispatchHandle(g, 256, bottom, held);
        const cta = hasActive ? `继续 · 第${this.session!.waveIndex + 1}波` : UI_COPY.home.startCta;
        this.host.text(cta, 236, bottom - (held ? 3 : 0), { size: hasActive ? 19 : 23, bold: true, color: BENCH.ink, width: 132 });
    }

    // ─────────────────────────── PAGE 2: PREP / CHAPTER & RIG (FIXED) ───────────────────────────

    private drawPrep(): void {
        this.backdrop();
        const top = this.header('出勤准备', '‹ 值班室', () => { this.page = 'home'; }, '工坊改装', () => { this.page = 'workshop'; });
        const g = this.host.ui;
        const dateKey = todayDateKey();
        const daily = getDailyShift(dateKey);
        const dailyDone = isDailyShiftClearedToday(this.profile, dateKey);
        const endlessReady = hasEndlessUnlocked(this.profile);
        if (this.prepMode === 'endless' && !endlessReady) this.prepMode = 'story';

        // Carousel indices: 0..3 = Chapters 1..4, 4 = Daily Urgent Shift, 5 = Harbor Endless (after Ch4)
        const totalCards = endlessReady ? 6 : 5;
        const cardIndex = this.prepMode === 'daily' ? 4 : this.prepMode === 'endless' ? 5 : this.chapterIdx;
        const stepCard = (delta: number) => {
            const next = Math.max(0, Math.min(totalCards - 1, cardIndex + delta));
            if (next <= 3) { this.prepMode = 'story'; this.chapterIdx = next; }
            else if (next === 4) { this.prepMode = 'daily'; }
            else { this.prepMode = 'endless'; }
        };

        const isDaily = this.prepMode === 'daily';
        const isEndless = this.prepMode === 'endless';
        const chapter = isDaily
            ? CHAPTER_CATALOG.find(c => c.id === daily.chapterId) ?? CHAPTER_CATALOG[0]
            : isEndless
                ? CHAPTER_CATALOG[3]
                : CHAPTER_CATALOG[this.chapterIdx];
        const rigId = isDaily ? daily.rigId : RIG_ORDER[this.rigIdx];
        const rig = RIG_CATALOG[rigId];
        const narrative = CHAPTER_NARRATIVES[chapter.id];
        const activeDanger: DangerLevel = isDaily ? daily.danger : this.danger;

        const chUnlocked = isDaily ? true : isEndless ? endlessReady : isChapterUnlocked(this.profile, chapter.id);
        const dangerUnlocked = isDaily ? true : isDangerUnlocked(this.profile, activeDanger);
        const rigUnlocked = isDaily ? true : isRigUnlocked(this.profile, rigId);
        const supplyId = PRE_RUN_SUPPLY_ORDER[this.supplyIdx] ?? 'none';
        const supplySpec = PRE_RUN_SUPPLIES[supplyId];
        const freeCharges = freeSupplyChargesToday(this.profile, dateKey);
        const useCheckInCharge = supplySpec.cost > 0 && freeCharges > 0;
        const canAffordSupply = useCheckInCharge || this.profile.credits >= supplySpec.cost;
        const prepAdsLeft = remainingDailyAdUses(this.profile, 'prep', dateKey);
        const maxChDanger = this.profile.maxDangerCleared[chapter.id];

        // Section A: Chapter / Daily Shift / Endless banner
        const chTop = top - 8;
        const chH = 122;
        const chBot = chTop - chH;
        const chEdge = isDaily ? CYAN : isEndless ? GOLD : (chUnlocked ? BENCH.edge : BENCH.steel);
        benchPlate(g, 16, chBot, 328, chH, chUnlocked ? BENCH.steel : BENCH.recess, chEdge, 8);
        this.host.block(17, chTop - 3, 326, 3, isDaily ? CYAN : chUnlocked ? GOLD : BENCH.edge);

        this.pixelBtn('‹', 38, chTop - 28, 32, 32, () => stepCard(-1), false, cardIndex > 0);
        this.pixelBtn('›', 322, chTop - 28, 32, 32, () => stepCard(1), false, cardIndex < totalCards - 1);

        if (isDaily) {
            this.host.text(`今日夜班急单 · ${dateKey}${dailyDone ? ' · 已领奖 ✓' : ''}`, 180, chTop - 16,
                { width: 244, size: 11, bold: true, color: dailyDone ? GREEN : CYAN });
            this.host.text(daily.modifier.name, 180, chTop - 38, { width: 244, size: 20, bold: true, color: BENCH.paper });
            this.host.text(`线路：${chapter.title} · 体验工装：${rig.name}`, 180, chTop - 60, { width: 304, size: 11, color: GOLD });
            benchPlate(g, 24, chTop - 92, 312, 22, BENCH.recess, CYAN, 4);
            this.host.text(daily.modifier.ruleText, 180, chTop - 81, { width: 300, size: 11, bold: true, color: CYAN });
            this.host.text(dailyDone ? '今日额外凭证已领，仍可重复冲分练手' : `今日首通额外奖励 +${daily.bonusCredits} 凭证（未解锁工装也能免费用）`,
                180, chTop - 107, { width: 304, size: 10, color: BENCH.muted });
        } else if (isEndless) {
            const best = this.profile.bestEndlessWave ?? 0;
            this.host.text('港区急电 · 无尽夜班', 180, chTop - 16, { width: 244, size: 11, bold: true, color: GOLD });
            this.host.text('老马码头抢修', 180, chTop - 38, { width: 244, size: 20, bold: true, color: BENCH.paper });
            this.host.text(best > 0 ? `历史最高：撑过第 ${best} 波` : '尚未留下无尽纪录 · 12 波后持续叠波',
                180, chTop - 62, { width: 304, size: 11, bold: true, color: CYAN });
            this.host.text('每 5 波首领压境，看看你的六臂构筑极限能修到第几波！', 180, chTop - 96,
                { width: 304, height: 32, size: 11, color: BENCH.muted });
        } else {
            const cleared = this.profile.clearedChapters.includes(chapter.id);
            this.host.text(
                `第${'一二三四'[this.chapterIdx]}章 · ${chapter.routeName}${cleared ? ' ✓' : chUnlocked ? '' : ' · 未解锁'}`,
                180, chTop - 16,
                { width: 244, size: 11, bold: true, color: !chUnlocked ? RED : cleared ? GREEN : GOLD },
            );
            this.host.text(chapter.title, 180, chTop - 38, { width: 244, size: 20, bold: true, color: chUnlocked ? BENCH.paper : BENCH.muted });

            if (chUnlocked) {
                const stationNames = chapter.stations.map(s => s.name).join(' › ');
                this.host.text(stationNames, 180, chTop - 59, { width: 304, size: 10, color: CYAN });
            } else {
                this.host.text(chapterUnlockHint(chapter.id), 180, chTop - 59, { width: 304, size: 11, bold: true, color: GOLD });
            }

            // 5 Danger Stamp pills (标 / 寒 / 过 / 封 / 极)
            const pillW = 56;
            const pillGap = 6;
            const pillStartX = 180 - (5 * pillW + 4 * pillGap) / 2;
            const pillY = chTop - 87;
            for (const d of DANGER_LEVELS) {
                const px = pillStartX + d * (pillW + pillGap);
                const done = maxChDanger !== undefined && d <= maxChDanger;
                const targeted = chUnlocked && dangerUnlocked && d === activeDanger;
                benchPlate(
                    g, px, pillY, pillW, 17,
                    done ? BENCH.weapon.fill : BENCH.recess,
                    done ? DANGER_COLOR[d] : targeted ? GOLD : BENCH.edge,
                    3,
                );
                this.host.text(
                    `${DANGER_SHORT_LABELS[d]}${done ? '✓' : ''}`,
                    px + pillW / 2, pillY + 9,
                    { width: pillW - 4, size: 10, bold: done || targeted, color: done ? DANGER_COLOR[d] : targeted ? GOLD : BENCH.muted },
                );
            }

            const chFootLine = chUnlocked
                ? `${narrative.opener.speaker}：${narrative.opener.line}`
                : '首通可开启下一章，并带回新工装与工具入库。';
            this.host.text(chFootLine, 180, chTop - 105, { width: 304, height: 26, left: true, size: 10, color: BENCH.muted });
        }

        // Section B: Danger level selector (D0-D4) with rule twist + first-clear bonus
        const dTop = chBot - 8;
        const dH = 52;
        const dBot = dTop - dH;
        benchPlate(g, 16, dBot, 328, dH, BENCH.recess, dangerUnlocked ? BENCH.edge : BENCH.steel, 6);
        const dm = DANGER_MULTIPLIERS[activeDanger];
        this.pixelBtn('‹', 38, dBot + 26, 30, 32, () => { if (this.danger > 0) this.danger = (this.danger - 1) as DangerLevel; }, false, !isDaily && this.danger > 0);
        this.pixelBtn('›', 322, dBot + 26, 30, 32, () => { if (this.danger < 4) this.danger = (this.danger + 1) as DangerLevel; }, false, !isDaily && this.danger < 4);
        const baseWinCredits = 24 + CHAPTER_CLEAR_BONUS[chapter.id] + dm.creditBonus;
        const firstBonus = !isDaily && !isEndless && chUnlocked && dangerUnlocked ? unclaimedFirstClearBonus(this.profile, chapter.id, activeDanger) : 0;
        const dangerHead = isDaily
            ? `急单定级：${dm.label}`
            : dangerUnlocked
                ? `${dm.label} · 通关${baseWinCredits}凭证`
                : `${dm.label} · 未解锁`;
        this.host.text(dangerHead, 180, dBot + 36, {
            width: 244, size: 12, bold: true,
            color: !dangerUnlocked ? RED : DANGER_COLOR[activeDanger],
        });
        const dangerSub = !dangerUnlocked
            ? dangerUnlockHint(activeDanger)
            : isDaily
                ? '急单固定种子，所有夜班同图竞技'
                : isEndless
                    ? `${DANGER_RULE_TEXT[activeDanger]} · 按撑过波次发凭证`
                    : `${DANGER_RULE_TEXT[activeDanger]}${firstBonus > 0 ? ` · 首通+${firstBonus}` : ' · 本格已通'}`;
        this.host.text(dangerSub, 180, dBot + 14, {
            width: 246, size: 10,
            color: !dangerUnlocked ? GOLD : firstBonus > 0 ? CYAN : GREEN,
        });

        // Section C: 5 Mechanic Rigs selector (with lock & best-danger stamp!)
        const tabY = dBot - 24;
        const tabW = 62;
        RIG_ORDER.forEach((id, idx) => {
            const tx = 16 + idx * 66.5 + tabW / 2;
            const active = isDaily ? id === daily.rigId : idx === this.rigIdx;
            const unlocked = isDaily ? id === daily.rigId : isRigUnlocked(this.profile, id);
            const label = unlocked ? RIG_CATALOG[id].name.slice(0, 2) : `${RIG_CATALOG[id].name.slice(0, 2)}锁`;
            this.pixelBtn(label, tx, tabY, tabW, 30, () => { if (!isDaily) this.rigIdx = idx; }, active, !isDaily || id === daily.rigId);
            const rigBest = this.profile.maxDangerByRig?.[id];
            if (isRigUnlocked(this.profile, id) && rigBest !== undefined) {
                this.host.block(tx + tabW / 2 - 9, tabY + 7, 6, 6, DANGER_COLOR[rigBest]);
            }
        });

        const cardTop = tabY - 21;
        const cardH = 126;
        const cardBot = cardTop - cardH;
        const legalStarters = legalStarterWeaponsForRig(rigId, this.profile);
        const savedStarter = this.starterByRig[rigId];
        const activeStarter = !isDaily && hasCustomStarterUnlock(this.profile) && savedStarter && legalStarters.includes(savedStarter)
            ? savedStarter
            : rig.starterWeapon;

        benchPlate(g, 16, cardBot, 328, cardH, rigUnlocked ? BENCH.steel : BENCH.recess, rigUnlocked ? GOLD : BENCH.edge, 8);
        benchPlate(g, 26, cardTop - 58, 50, 50, BENCH.recess, BENCH.edge, 6);
        this.host.skin?.uiIcon(activeStarter, 51, cardTop - 33, 38);
        const rigBest = this.profile.maxDangerByRig?.[rigId];
        const rigHeader = `${rig.name} · ${rig.title}${rigBest !== undefined ? ` (${DANGER_SHORT_LABELS[rigBest]})` : ''}`;
        this.host.text(rigHeader, 208, cardTop - 18, { left: true, width: 244, size: 15, bold: true, color: rigUnlocked ? BENCH.paper : BENCH.muted });
        const canSwapStarter = !isDaily && rigUnlocked && hasCustomStarterUnlock(this.profile) && legalStarters.length > 1;
        this.host.text(`起手：${WEAPON_CATALOG[activeStarter].name}`, canSwapStarter ? 168 : 208, cardTop - 37,
            { left: true, width: canSwapStarter ? 164 : 244, size: 11, color: CYAN });
        if (canSwapStarter) {
            this.pixelBtn('换起手', 298, cardTop - 37, 68, 22, () => {
                const cur = legalStarters.indexOf(activeStarter);
                this.starterByRig[rigId] = legalStarters[(cur + 1) % legalStarters.length];
            });
        }
        this.host.text(formatStatPreview(rig.stats, 4) || '全属性均衡', 208, cardTop - 55, { left: true, width: 244, size: 10, color: GOLD });
        this.host.text(RIG_FLAVOR[rig.id], 180, cardTop - 80, { left: true, width: 304, height: 22, size: 11, color: rigUnlocked ? GREEN : BENCH.muted });
        const rigBottomLine = rigUnlocked ? `代价：${rig.tradeoff}` : `解锁：${rigUnlockHint(rigId)}`;
        this.host.text(rigBottomLine, 180, cardTop - 106, { left: true, width: 304, height: 24, size: 11, color: rigUnlocked ? BENCH.muted : GOLD });

        // Section D: Pre-run Supply bar (班前特供 - credits, daily check-in free charge, or rewarded ad!)
        const sTop = cardBot - 8;
        const sH = 44;
        const sBot = sTop - sH;
        benchPlate(g, 16, sBot, 328, sH, BENCH.recess, supplyId !== 'none' ? (canAffordSupply ? GOLD : RED) : BENCH.edge, 6);
        this.pixelBtn('‹', 38, sBot + 22, 30, 28, () => {
            this.supplyIdx = (this.supplyIdx + PRE_RUN_SUPPLY_ORDER.length - 1) % PRE_RUN_SUPPLY_ORDER.length;
        });
        this.pixelBtn('›', 322, sBot + 22, 30, 28, () => {
            this.supplyIdx = (this.supplyIdx + 1) % PRE_RUN_SUPPLY_ORDER.length;
        });
        const supplyTitle = supplySpec.cost > 0
            ? (useCheckInCharge ? `班前特供：${supplySpec.name} · 打卡白送(${freeCharges})` : `班前特供：${supplySpec.name} · ${supplySpec.cost}凭证`)
            : `班前特供：${supplySpec.name}（凭证 ${this.profile.credits}）`;
        this.host.text(supplyTitle, 180, sBot + 31, {
            width: 244, size: 11, bold: true,
            color: supplySpec.cost > 0 ? (useCheckInCharge ? GREEN : canAffordSupply ? GOLD : RED) : BENCH.paper,
        });
        const canAdSupply = supplySpec.cost > 0 && !useCheckInCharge && this.canOfferAd() && prepAdsLeft > 0;
        const supplySub = canAffordSupply
            ? supplySpec.detail
            : canAdSupply
                ? `凭证不够，可看视频免凭证带走（今日剩 ${prepAdsLeft} 次）`
                : `还差 ${supplySpec.cost - this.profile.credits} 凭证，切回不带特供即可出发`;
        this.host.text(supplySub, 180, sBot + 12, { width: 246, size: 10, color: canAffordSupply ? BENCH.muted : canAdSupply ? GOLD : RED });

        // Section E: Dedicated bottom CTA (with ad-trial rig / ad-free supply options when eligible)
        const ctaY = Math.max(this.host.footer + 24, 58);
        const launchOpts = {
            useCheckInCharge,
            ...(isDaily ? { dailyShiftKey: daily.dateKey, dailyMod: daily.modifier.id, fixedSeed: daily.seed } : {}),
            ...(isEndless ? { endlessMode: true } : {}),
        };
        const canAdTrialRig = !isDaily && !rigUnlocked && chUnlocked && dangerUnlocked && canAffordSupply && this.canOfferAd() && prepAdsLeft > 0;

        if (canAdTrialRig) {
            this.pixelBtn(`${this.adVerb(`试用${rig.name}一班`)} ›`, 180, ctaY, 328, 46, () => {
                this.triggerReward('prep_supply', () => {
                    this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, {
                        ...launchOpts,
                        consumePrepAd: true,
                        trialRig: true,
                    });
                });
            }, true, true);
            return;
        }

        if (chUnlocked && dangerUnlocked && rigUnlocked && canAdSupply && !canAffordSupply) {
            this.pixelBtn(`${this.adVerb('免费带特供出发')} ›`, 180, ctaY, 328, 46, () => {
                this.triggerReward('prep_supply', () => {
                    this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, {
                        ...launchOpts,
                        freeSupply: true,
                        consumePrepAd: true,
                    });
                });
            }, true, true);
            return;
        }

        const canStart = chUnlocked && dangerUnlocked && rigUnlocked && canAffordSupply;
        if (canStart && canAdSupply) {
            this.pixelBtn(`花${supplySpec.cost}凭证出发`, 96, ctaY, 156, 46, () => {
                this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, launchOpts);
            }, false, true);
            this.pixelBtn(this.adVerb('白带特供出发'), 264, ctaY, 156, 46, () => {
                this.triggerReward('prep_supply', () => {
                    this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, {
                        ...launchOpts,
                        freeSupply: true,
                        consumePrepAd: true,
                    });
                });
            }, true, true);
            return;
        }

        const ctaLabel = !chUnlocked
            ? '先通前一章开启'
            : !dangerUnlocked
                ? '先通前一档危急'
                : !rigUnlocked
                    ? '先解锁这套工装'
                    : !canAffordSupply
                        ? '凭证不足 · 换掉特供'
                        : isDaily
                            ? `开跑今日急单 · ${daily.modifier.name} ›`
                            : isEndless
                                ? '进驻港区 · 无尽夜班 ›'
                                : `出发抢修 · ${chapter.title} ›`;
        this.pixelBtn(ctaLabel, 180, ctaY, 328, 46, () => {
            this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, launchOpts);
        }, canStart, canStart);
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
        this.host.text(`血${battle.player.hp}/${battle.player.maxHp}`, 24, top + 12,
            { left: true, width: 86, size: 11, bold: true, color: lowHp ? RED : BENCH.paper });
        this.host.text(`甲${battle.build.stats.armor}`, 132, top + 12,
            { width: 40, size: 11, bold: true, color: CYAN });
        this.host.block(22, top - 4, 132, 7, BENCH.steel);
        this.host.block(22, top - 4, Math.round(132 * hpRatio), 7, lowHp ? RED : GREEN);

        // XP bar directly below HP bar
        const nextXp = xpRequiredForLevel(session.level + 1);
        const xpRatio = Math.min(1, (session.xp + battle.xpGained) / Math.max(1, nextXp));
        this.host.block(22, top - 16, 94, 4, BENCH.steel);
        this.host.block(22, top - 16, Math.round(94 * xpRatio), 4, CYAN);
        this.host.text(`${session.level}级`, 138, top - 16, { width: 38, size: 11, bold: true, color: CYAN });
        if (battle.isJammed) {
            this.host.text('攻速减慢', 88, top - 28, { width: 132, size: 10, bold: true, color: PURPLE });
        } else {
            this.host.text(battle.stationName, 88, top - 28, { width: 132, size: 11, color: BENCH.muted });
        }

        // Top-center: Wave & Countdown timer
        benchPlate(g, 166, top - 34, 108, 58, BENCH.recess, BENCH.edge, 6);
        const waveHeader = session.endlessMode ? `无尽 · 第 ${battle.waveDef.wave} 波` : `第 ${battle.waveDef.wave}/12 波`;
        this.host.text(waveHeader, 220, top + 12, { width: 100, size: 12, bold: true, color: session.endlessMode ? GOLD : BENCH.paper });
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
            this.host.text(`${boss.title} · 第${boss.stage}段${boss.vulnerable ? ' · 外壳敞开' : ''}`, 180, by + 32,
                { width: 296, size: 12, bold: true, color: boss.vulnerable ? GOLD : BENCH.paper });
            this.host.block(34, by + 18, 292, 6, BENCH.steel);
            this.host.block(34, by + 18, Math.round(292 * Math.max(0, boss.hp / boss.maxHp)), 6, boss.vulnerable ? GOLD : RED);
            if (boss.instruction) {
                this.host.text(boss.instruction, 180, by + 8, { width: 296, size: 11, bold: true, color: boss.vulnerable ? GREEN : GOLD });
            }
        } else if (battle.tick < 150) {
            // Brief station arrival radio line at top of arena
            const station = battle.chapter.stations[battle.waveDef.stationIndex];
            const radio = station.waves[0] === battle.waveDef.wave ? station.arriveRadio : undefined;
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

        // Lightweight Wave-1 onboarding tip: disappears automatically once player starts moving!
        if (battle.waveDef.wave === 1 && needsShopOnboarding(this.profile) && this.movedTicksInWave < 20 && !boss) {
            const tipY = FIELD.bottom + 36;
            benchPlate(g, 24, tipY - 16, 312, 32, new Color(14, 22, 29, 230), GOLD, 5);
            this.host.text('拖动走位，悬浮工具自动开火 · 靠近零件自动吸', 180, tipY,
                { width: 300, size: 11, bold: true, color: GOLD });
        }
    }

    private drawReviveOffer(): void {
        const session = this.session;
        if (!session) { this.page = 'home'; return; }
        const g = this.host.ui;
        this.host.block(0, -HEIGHT, WIDTH, HEIGHT * 3, DARK_SCRIM);
        const cy = 320;
        benchPlate(g, 24, cy - 126, 312, 252, BENCH.steel, GOLD, 10);
        this.host.text('差点顶不住了', 180, cy + 90, { width: 280, size: 22, bold: true, color: GOLD });
        const waveNum = session.currentWaveDef.wave;
        this.host.text(
            `${session.chapter.title} · 第 ${waveNum} 波`,
            180, cy + 58, { width: 280, size: 12, color: CYAN },
        );
        const rescueDesc = session.isBossRevive
            ? '原地清屏、回 60% 血并护体 2 秒，\n保留首领当前剩余血量继续打！'
            : '满血回到本波开头重来，\n身上装备与零件全部保留！';
        this.host.text(rescueDesc, 180, cy + 16, { width: 280, height: 42, size: 12, color: BENCH.paper });
        this.pixelBtn(this.adVerb('急救续班'), 180, cy - 42, 256, 48, () => {
            this.triggerReward('revive', () => {
                if (session.applyRevive()) {
                    this.host.play('unlock');
                    this.syncAudioSerials();
                    this.saveRun(session);
                    this.page = 'battle';
                    this.host.syncMusic(true);
                }
            });
        }, true);
        this.pixelBtn('直接结算', 180, cy - 96, 256, 40, () => {
            this.finalizeRun();
        });
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
            if (this.session) this.saveRun(this.session);
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
            `${UI_COPY.shop.heading}·第${view.wave + 1}波`,
            '‹ 首页',
            () => { this.saveRun(session); this.page = 'home'; },
            '属性/羁绊',
            () => { this.showStatsDrawer = true; this.inspectWeaponSlot = null; },
        );
        const g = this.host.ui;

        // Wallet + HP + optional Emergency Shop Aid (rewarded ad / ad-free pass, max 2/run)
        const barY = top - 22;
        benchPlate(g, 16, barY - 14, 158, 30, BENCH.recess, BENCH.edge, 5);
        this.host.skin?.uiIcon('scrap', 32, barY + 1, 17);
        this.host.text(`零件 ${view.parts}${session.bagParts ? ` · 袋${session.bagParts}` : ''}`, 106, barY + 1,
            { left: true, width: 132, size: 13, bold: true, color: GOLD });

        const showShopAid = session.shopAidRemaining > 0 && this.canOfferAd();
        if (showShopAid) {
            benchPlate(g, 182, barY - 14, 86, 30, BENCH.recess, BENCH.edge, 5);
            this.host.text(`血${session.currentHp}/${view.build.stats.maxHp}`, 225, barY + 1,
                { width: 80, size: 11, bold: true, color: GREEN });
            this.pixelBtn(this.adVerb(`+${SHOP_EMERGENCY_PARTS}件`), 308, barY + 1, 72, 30, () => {
                this.triggerReward('shop_supply', () => {
                    if (session.grantShopAid()) {
                        this.host.play('purchase');
                        this.shopFeedback = `应急调拨到账：+${SHOP_EMERGENCY_PARTS} 零件，再送 1 次免费翻箱`;
                        this.saveRun(session);
                    }
                });
            }, true);
        } else {
            benchPlate(g, 182, barY - 14, 162, 30, BENCH.recess, BENCH.edge, 5);
            this.host.text(`血${session.currentHp}/${view.build.stats.maxHp}·${view.level}级`, 263, barY + 1,
                { width: 152, size: 12, bold: true, color: GREEN });
        }

        // Lightweight non-blocking 3-step onboarding banner (Buy weapon -> Merge 2-in-1 -> Start Wave 2!)
        const showGuide = needsShopOnboarding(this.profile) && !this.tutorialSkipped;
        const mergeableSlotIdx = view.weapons.findIndex(w => w.canMergeWith !== null);
        const matchOfferIdx = view.slots.findIndex(s =>
            !s.sold && s.kind === 'weapon' && view.parts >= s.price && view.weapons.some(w => w.id === s.itemId && w.tier === s.tier),
        );
        const anyAffordableWeaponIdx = matchOfferIdx >= 0
            ? matchOfferIdx
            : view.slots.findIndex(s => !s.sold && s.kind === 'weapon' && view.parts >= s.price);
        let guideStep: 'buy' | 'tap_slot' | 'tap_merge' | 'ready' | null = null;
        let guideText = '';
        if (showGuide) {
            if (mergeableSlotIdx >= 0) {
                const inspected = this.inspectWeaponSlot !== null ? view.weapons[this.inspectWeaponSlot] : undefined;
                if (inspected && inspected.canMergeWith !== null) {
                    guideStep = 'tap_merge';
                    guideText = '指引 2/3 · 点「合成升阶」两把合一件Ⅱ阶（或留着齐挥）';
                } else {
                    guideStep = 'tap_slot';
                    guideText = '指引 2/3 · 底部绿点是同名武器，点它试试 2合1 合成！';
                }
            } else if (view.weapons.length === 1 && anyAffordableWeaponIdx >= 0) {
                guideStep = 'buy';
                guideText = '指引 1/3 · 点亮框武器买下，可同时挥多把家伙！';
            } else {
                guideStep = 'ready';
                guideText = '指引 3/3 · 齐活！点「锁」留货，点「开干」进第 2 波';
            }
            const gy = barY - 34;
            benchPlate(g, 16, gy - 12, 328, 26, BENCH.weapon.fill, GOLD, 5);
            this.host.text(guideText, 152, gy + 1, { left: true, width: 266, size: 10, bold: true, color: GOLD });
            this.pixelBtn('跳过', 318, gy + 1, 44, 20, () => {
                this.tutorialSkipped = true;
                this.completeOnboarding();
            });
        }

        // 2x2 Wide Shop Grid (compact cardH=100 while onboarding ribbon is visible so zero overlap!)
        const gridTop = showGuide ? barY - 52 : barY - 22;
        const cardW = 158;
        const cardH = showGuide ? 100 : 112;
        const rowGap = showGuide ? 8 : 10;
        view.slots.forEach((slot, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 16 + col * (cardW + 12);
            const y = gridTop - (row + 1) * cardH - row * rowGap;

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
            this.host.text(isWeapon ? `武器 ${TIER_ROMAN[slot.tier]}` : TIER_NAME[slot.tier], x + 44, y + cardH - 12,
                { left: true, width: 78, size: 11, bold: true, color: TIER_EDGE[slot.tier] });
            this.pixelBtn(slot.locked ? '已锁' : '锁', x + cardW - 22, y + cardH - 13, 36, 20, () => {
                if (session.toggleLock(idx)) {
                    this.shopFeedback = slot.locked ? '已解锁该货位' : '已锁住 · 下波不涨价';
                    this.saveRun(session);
                } else {
                    this.shopFeedback = `最多同时锁 ${view.maxLocks} 件（去工坊扩充）`;
                }
            }, slot.locked);

            // Row 1: Icon + Item Name; Row 2 & 3: Full-width plain-Chinese Gain & Special/Cost lines!
            const iconKey = isWeapon ? slot.itemId : (MODULE_ICON[slot.itemId] ?? 'gear/pulse');
            const nameY = showGuide ? y + 68 : y + 75;
            const line1Y = showGuide ? y + 49 : y + 54;
            const line2Y = showGuide ? y + 35 : y + 38;
            this.host.skin?.uiIcon(iconKey, x + 22, nameY, showGuide ? 22 : 26);
            this.host.text(name, x + 96, nameY, { left: true, width: 114, size: 13, bold: true, color: BENCH.paper });
            this.host.text(line1, x + cardW / 2, line1Y, { width: cardW - 10, height: 14, size: line1.length > 14 ? 9 : 10, bold: !weapon, color: line1Color });
            this.host.text(line2, x + cardW / 2, line2Y, { width: cardW - 10, height: 14, size: line2.length > 14 ? 9 : 10, color: line2Color });

            // Bottom one-tap Buy / Auto-merge button!
            const affordable = view.parts >= slot.price;
            const buyLabel = slot.canAutoMerge ? UI_COPY.shop.mergeBuy(slot.price) : UI_COPY.shop.buy(slot.price);
            const guideBuyTarget = guideStep === 'buy' && idx === anyAffordableWeaponIdx;
            this.pixelBtn(buyLabel, x + cardW / 2, y + 16, cardW - 10, 24, () => {
                const res = session.buySlot(idx);
                if (res.ok) {
                    this.host.play('purchase');
                    this.shopFeedback = res.merged
                        ? `两把合成，${name}升到${TIER_ROMAN[(slot.tier + 1) as Tier]}阶`
                        : res.freeBuyoutReroll ? '这排买空了，白送一次翻箱' : `已装上 ${name}`;
                    this.saveRun(session);
                } else if (res.reason) {
                    this.shopFeedback = res.reason;
                }
            }, (slot.canAutoMerge || guideBuyTarget) && affordable, affordable);
            if (guideBuyTarget) this.drawGuidePulse(x, y, cardW, cardH, GOLD);
        });

        // 6 Weapon Slots Row with Tier Badges & Quick Merge/Sell Tray
        const rowY = gridTop - cardH * 2 - rowGap - 38;
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
                    if (guideStep === 'tap_slot') this.drawGuidePulse(sx - slotW / 2, rowY - 24, slotW, 48, GREEN);
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
                this.pixelBtn('合成升阶', 216, infoY + 5, 72, 30, () => {
                    if (session.mergeWeapons(this.inspectWeaponSlot!, w.canMergeWith!)) {
                        this.host.play('unlock');
                        this.shopFeedback = `${w.name} 升至 ${TIER_ROMAN[(w.tier + 1) as Tier]} 阶！`;
                        this.inspectWeaponSlot = null;
                        this.saveRun(session);
                    }
                }, true);
                if (guideStep === 'tap_merge') this.drawGuidePulse(180, infoY - 10, 72, 30, GOLD);
            }
            const canSell = view.weapons.length > 1;
            this.pixelBtn(UI_COPY.shop.sell(w.sellRefund), 298, infoY + 5, 76, 30, () => {
                const refund = session.sellWeapon(this.inspectWeaponSlot!);
                if (refund > 0) {
                    this.shopFeedback = `拆解 ${w.name}，换回 ${refund} 零件`;
                    this.inspectWeaponSlot = null;
                    this.saveRun(session);
                }
            }, false, canSell);
        } else {
            const synText = view.build.synergies
                .filter(s => s.count > 0)
                .map(s => `${s.name}${s.count}${s.activeTier ? '亮' : ''}`)
                .join('  ·  ');
            benchPlate(g, 16, infoY - 12, 328, 36, BENCH.recess, BENCH.edge, 5);
            this.host.text(synText || '凑两把同系武器，这一系就亮', 180, infoY + 11, { width: 312, size: 11, bold: true, color: GREEN });
            const hasManualMerge = view.weapons.some(w => w.canMergeWith !== null);
            const upcomingHint = session.endlessMode && session.waveIndex + 1 >= session.chapter.waves.length
                ? `港区无尽第 ${session.waveIndex + 2} 波即将来袭`
                : session.chapter.waves[session.waveIndex + 1]?.hint || '';
            const nextHint = this.shopFeedback
                || (hasManualMerge ? '绿点是同名武器，点它能两把合成' : upcomingHint);
            this.host.text(nextHint, 180, infoY - 4, { width: 312, size: 10, color: this.shopFeedback || hasManualMerge ? GOLD : BENCH.muted });
        }

        // Bottom Actions: Reroll (escalating/free) + Next Wave primary CTA
        const botY = Math.max(this.host.footer + 24, 48);
        const rerollLabel = UI_COPY.shop.reroll(view.nextRerollCost);
        const canReroll = view.freeRerollsLeft > 0 || view.parts >= view.nextRerollCost;
        this.pixelBtn(rerollLabel, 88, botY, 144, 48, () => {
            if (session.reroll()) {
                this.shopFeedback = '又翻了一箱新货';
                this.saveRun(session);
            }
        }, view.freeRerollsLeft > 0, canReroll);

        const nextWaveNum = view.wave + 1;
        const isBossNext = session.endlessMode ? (nextWaveNum % 5 === 0 && nextWaveNum >= 15) || nextWaveNum === 12 : nextWaveNum === 12;
        this.pixelBtn(UI_COPY.shop.nextWave(nextWaveNum, isBossNext), 255, botY, 178, 48, () => {
            if (showGuide && !this.profile.onboardingDone) {
                this.completeOnboarding();
            }
            if (session.startNextWave()) {
                this.movedTicksInWave = 0;
                this.syncAudioSerials();
                this.saveRun(session);
                this.page = 'battle';
                this.host.syncMusic(true);
            }
        }, true);
        if (guideStep === 'ready') this.drawGuidePulse(166, botY - 24, 178, 48, GOLD);
    }

    private drawLevelUpOverlay(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header(`手艺涨了 · ${view.level}级`, '', undefined, `零件 ${view.parts}`, undefined);
        const g = this.host.ui;
        const levelHint = needsShopOnboarding(this.profile)
            ? '升级白拿属性！挑一项最顺手的，选完进店买武器'
            : `还要选 ${view.pendingLevelUps} 项。5 级和 10 级选项更好`;
        this.host.text(levelHint, 180, top - 16,
            { width: 320, size: 11, color: needsShopOnboarding(this.profile) ? GOLD : CYAN });

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
                    this.saveRun(this.session!);
                }
            }, true);
        });

        const botY = Math.max(this.host.footer + 26, 52);
        const canRoll = view.parts >= view.levelUpRerollCost;
        const canBonusPick = this.session!.canUseLevelUpBonus && this.canOfferAd();
        if (canBonusPick) {
            this.pixelBtn(UI_COPY.shop.levelUpReroll(view.levelUpRerollCost), 96, botY, 156, 46, () => {
                if (this.session!.rerollLevelUpOptions()) this.saveRun(this.session!);
            }, false, canRoll);
            this.pixelBtn(this.adVerb('再多挑一项'), 264, botY, 156, 46, () => {
                this.triggerReward('levelup_extra', () => {
                    if (this.session!.grantLevelUpBonus()) {
                        this.host.play('unlock');
                        this.saveRun(this.session!);
                    }
                });
            }, true);
        } else {
            this.pixelBtn(UI_COPY.shop.levelUpReroll(view.levelUpRerollCost), 180, botY, 220, 46, () => {
                if (this.session!.rerollLevelUpOptions()) this.saveRun(this.session!);
            }, false, canRoll);
        }
    }

    private drawStatsDrawer(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header('面板与羁绊', '‹ 回商店', () => { this.showStatsDrawer = false; }, `${view.level}级`, undefined);
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
        this.host.text('同系武器两把、四把、六把会亮', 180, synTop, { width: 328, size: 12, bold: true, color: GOLD });
        view.build.synergies.forEach((syn, idx) => {
            const cardH = 44;
            const y = synTop - 16 - (idx + 1) * cardH - idx * 6;
            const active = syn.activeTier > 0;
            benchPlate(g, 16, y, 328, cardH, active ? BENCH.weapon.fill : BENCH.recess, active ? GREEN : BENCH.edge, 5);
            this.host.text(`${syn.name} · ${syn.count}把${active ? ' · 已亮' : ''}`, 180, y + 31,
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
        this.pixelBtn('工装改装', 102, tabY, 168, 34, () => { this.workshopTab = 'talents'; }, this.workshopTab === 'talents');
        this.pixelBtn('排除货品', 262, tabY, 144, 34, () => { this.workshopTab = 'bans'; }, this.workshopTab === 'bans');

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
                this.host.text(rank === 0 ? `升一级：${talent.detail(1)}` : talent.detail(rank), 124, y + 22,
                    { left: true, width: 196, height: 30, size: 11, color: BENCH.muted });
                this.pixelBtn(maxed ? '已满级' : `升级 · ${cost}`, 286, y + cardH / 2, 92, 40, () => {
                    const next = buyWorkshopTalent(this.profile, talent.id);
                    if (next) {
                        this.saveWorkshop(next);
                        this.host.play('purchase');
                    }
                }, canBuy, canBuy);
            });
        } else {
            const limit = totalBanSlots(this.profile);
            const bonusBan = bonusBanSlotsForProfile(this.profile);
            const banHead = bonusBan > 0
                ? `可排除 ${this.profile.bannedModules.length}/${limit} 件（含危急二赠+${bonusBan}）`
                : `可排除 ${this.profile.bannedModules.length}/${limit} 件。先升「废件黑名单」`;
            this.host.text(banHead, 180, tabY - 34,
                { width: 320, size: 11, color: limit ? CYAN : GOLD });
            const pageSize = 6;
            const slice = MODULE_CATALOG.slice(this.banScroll, this.banScroll + pageSize);
            slice.forEach((mod, idx) => {
                const cardH = 60;
                const y = tabY - 50 - (idx + 1) * cardH - idx * 8;
                const unlocked = isModuleUnlocked(this.profile, mod.id);
                const reqDanger = moduleRequiredDanger(mod.id);
                const banned = this.profile.bannedModules.includes(mod.id);
                benchPlate(
                    g, 16, y, 328, cardH,
                    !unlocked || banned ? BENCH.recess : TIER_FILL[mod.tier],
                    !unlocked ? BENCH.edge : banned ? RED : TIER_EDGE[mod.tier],
                    6,
                );
                this.host.text(`${mod.name} (${TIER_ROMAN[mod.tier]})`, 124, y + 42,
                    { left: true, width: 196, size: 13, bold: true, color: !unlocked || banned ? BENCH.muted : BENCH.paper });
                const sub = !unlocked && reqDanger !== null
                    ? `首通任意章危急${'零一二三四'[reqDanger]}入库`
                    : (formatStatPreview(mod.stats, 3, mod.special) || mod.flavor.slice(0, 18));
                this.host.text(sub, 124, y + 18,
                    { left: true, width: 196, size: 10, color: !unlocked ? GOLD : BENCH.muted });
                const btnLabel = !unlocked && reqDanger !== null
                    ? `危急${'零一二三四'[reqDanger]}解`
                    : banned ? '已禁用' : '禁用';
                this.pixelBtn(btnLabel, 290, y + cardH / 2, 82, 36, () => {
                    const next = toggleModuleBan(this.profile, mod.id);
                    if (next) this.saveWorkshop(next);
                }, unlocked && banned, unlocked && (banned || this.profile.bannedModules.length < limit));
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
            const secretUnlocked = isSecretArchiveUnlocked(this.profile, chapter.id);
            const cardTop = tabY - 28;
            const cardH = 382;
            benchPlate(g, 16, cardTop - cardH, 328, cardH, BENCH.steel, secretUnlocked ? GOLD : BENCH.edge, 8);
            this.host.text(`第${'一二三四'[this.archiveIdx]}章 · ${chapter.title}`, 180, cardTop - 22,
                { width: 300, size: 17, bold: true, color: GOLD });
            this.host.text(narr.archiveTitle, 180, cardTop - 46, { width: 300, size: 13, bold: true, color: CYAN });

            if (unlocked && chapter.id === '04') {
                this.host.skin?.dispatchArt(180, cardTop - 94, 'ending', 'stage-20', 68);
                const body = `${narr.archiveNote}\n${narr.clearOutro.speaker}：${narr.clearOutro.line}${narr.epilogueHook ? `\n${narr.epilogueHook.speaker}：${narr.epilogueHook.line}` : ''}`;
                this.host.text(body, 180, cardTop - 196, { left: true, width: 296, height: 122, size: 11, color: BENCH.paper });
            } else {
                const body = unlocked
                    ? `${narr.archiveNote}\n\n${narr.clearOutro.speaker}：${narr.clearOutro.line}`
                    : '打通本章后解锁完整夜班现场记录。';
                this.host.text(body, 180, cardTop - 156, { left: true, width: 296, height: 186, size: 12, color: BENCH.paper });
            }

            // Encrypted high-danger secret memo box (unlocked at Danger >= 2 per chapter)
            const secTop = cardTop - 270;
            this.host.block(28, secTop, 304, 1, BENCH.edge);
            benchPlate(g, 24, cardTop - cardH + 10, 312, 92, BENCH.recess, secretUnlocked ? GOLD : BENCH.edge, 5);
            if (secretUnlocked) {
                this.host.text(narr.secretTitle, 180, secTop - 16, { width: 292, size: 11, bold: true, color: GOLD });
                this.host.text(narr.secretNote, 180, secTop - 58, { left: true, width: 292, height: 60, size: 11, color: CYAN });
            } else {
                this.host.text('加班密件 · 未解密', 180, secTop - 26, { width: 292, size: 12, bold: true, color: BENCH.muted });
                this.host.text('通本章「电网过载（危急二）」及以上解锁加密附页', 180, secTop - 56,
                    { width: 292, height: 36, size: 11, color: GOLD });
            }

            const botY = Math.max(this.host.footer + 24, 52);
            this.pixelBtn('上一章', 92, botY, 130, 42, () => { if (this.archiveIdx > 0) this.archiveIdx--; }, false, this.archiveIdx > 0);
            this.pixelBtn('下一章', 268, botY, 130, 42, () => { if (this.archiveIdx < 3) this.archiveIdx++; }, false, this.archiveIdx < 3);
        } else {
            // 4 Chapter seal rows (each displaying all 5 Danger stamp pills)
            CHAPTER_CATALOG.forEach((ch, idx) => {
                const rowH = 66;
                const y = tabY - 26 - (idx + 1) * rowH - idx * 7;
                const cleared = this.profile.clearedChapters.includes(ch.id);
                const maxD = this.profile.maxDangerCleared[ch.id];
                benchPlate(g, 16, y, 328, rowH, BENCH.steel, maxD === 4 ? GOLD : cleared ? GREEN : BENCH.edge, 6);
                this.host.text(`第${'一二三四'[idx]}章 · ${ch.title}`, 132, y + 48, { left: true, width: 214, size: 14, bold: true, color: BENCH.paper });
                this.host.text(
                    maxD !== undefined ? `最高：${DANGER_MULTIPLIERS[maxD].label}` : isChapterUnlocked(this.profile, ch.id) ? '未通关' : '未开启',
                    290, y + 48,
                    { width: 92, size: 11, bold: true, color: maxD !== undefined ? DANGER_COLOR[maxD] : BENCH.muted },
                );
                const pillW = 54;
                const pillGap = 6;
                const startX = 28;
                for (const d of DANGER_LEVELS) {
                    const px = startX + d * (pillW + pillGap);
                    const done = maxD !== undefined && d <= maxD;
                    benchPlate(g, px, y + 10, pillW, 20, done ? BENCH.weapon.fill : BENCH.recess, done ? DANGER_COLOR[d] : BENCH.edge, 3);
                    this.host.text(`${DANGER_SHORT_LABELS[d]}${done ? '✓' : ''}`, px + pillW / 2, y + 20,
                        { width: pillW - 4, size: 10, bold: done, color: done ? DANGER_COLOR[d] : BENCH.muted });
                }
            });

            // 5 Rig mastery strip (tracks highest Danger cleared by each Rig!)
            const rigCardTop = tabY - 26 - 4 * 66 - 3 * 7 - 12;
            const rigCardH = 74;
            benchPlate(g, 16, rigCardTop - rigCardH, 328, rigCardH, BENCH.recess, BENCH.edge, 6);
            const endlessBest = this.profile.bestEndlessWave ?? 0;
            const rigTitle = endlessBest > 0 ? `工装印记 · 港区无尽最高第 ${endlessBest} 波` : '工装值守印记';
            this.host.text(rigTitle, 180, rigCardTop - 16, { width: 308, size: 11, bold: true, color: GOLD });
            RIG_ORDER.forEach((id, idx) => {
                const bw = 58;
                const bx = 22 + idx * 64;
                const by = rigCardTop - rigCardH + 10;
                const unlocked = isRigUnlocked(this.profile, id);
                const best = this.profile.maxDangerByRig?.[id];
                benchPlate(g, bx, by, bw, 36, unlocked ? BENCH.steel : BENCH.recess, best !== undefined ? DANGER_COLOR[best] : BENCH.edge, 4);
                this.host.text(RIG_CATALOG[id].name.slice(0, 2), bx + bw / 2, by + 25,
                    { width: bw - 4, size: 11, bold: true, color: unlocked ? BENCH.paper : BENCH.muted });
                this.host.text(
                    !unlocked ? '未解锁' : best !== undefined ? `${DANGER_SHORT_LABELS[best]}✓` : '未通',
                    bx + bw / 2, by + 10,
                    { width: bw - 4, size: 10, bold: best !== undefined, color: best !== undefined ? DANGER_COLOR[best] : BENCH.muted },
                );
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
        const sumTop = top - 8;
        const sumH = 62;
        benchPlate(g, 16, sumTop - sumH, 328, sumH, BENCH.recess, res.won ? GREEN : RED, 6);
        const mins = Math.floor(res.totalDurationSeconds / 60);
        const secs = Math.round(res.totalDurationSeconds % 60);
        const runKey = this.session?.runId ?? `${res.chapterId}:${res.wavesCleared}:${res.totalKills}`;
        const alreadyDoubled = this.resultDoubledRunId === runKey;
        const shownCredits = res.creditsEarned + (alreadyDoubled ? res.baseCreditsForDouble : 0);
        const cols: [string, string][] = [
            ['推进波次', res.endlessMode ? `第${res.wavesCleared}波` : `${res.wavesCleared}/12`],
            ['总击倒', `${res.totalKills}`],
            ['用时', `${mins}分${secs}秒`],
            ['维修凭证', `+${shownCredits}`],
        ];
        cols.forEach(([k, v], i) => {
            const cx = 16 + (i + 0.5) * 82;
            this.host.text(k, cx, sumTop - 48, { width: 78, size: 11, color: BENCH.muted });
            this.host.text(v, cx, sumTop - 23, { width: 78, size: 16, bold: true, color: i === 3 ? GOLD : BENCH.paper });
        });

        // First-clear rewards & unlocks callout banner
        const hasUnlockBanner = res.unlocks.length > 0 || res.firstClearBonus > 0;
        let nextTop = sumTop - sumH - 8;
        if (hasUnlockBanner) {
            const bannerH = 54;
            benchPlate(g, 16, nextTop - bannerH, 328, bannerH, BENCH.weapon.fill, GOLD, 6);
            const title = res.firstClearBonus > 0
                ? `本班首通收获 · 含里程碑 +${res.firstClearBonus} 凭证`
                : '本班新解锁';
            this.host.text(title, 180, nextTop - 15, { width: 310, size: 11, bold: true, color: GOLD });
            const items = res.unlocks.length ? res.unlocks.join(' · ') : `${DANGER_MULTIPLIERS[res.danger].label}印章已点亮`;
            this.host.text(items, 180, nextTop - 37, { width: 308, height: 28, size: 11, color: BENCH.paper });
            nextTop -= bannerH + 8;
        }

        // Weapon Damage Breakdown Chart ("这班谁最出力")
        const dateKey = todayDateKey();
        const doubleLeft = remainingDailyAdUses(this.profile, 'double', dateKey);
        const canDouble = !alreadyDoubled && res.baseCreditsForDouble > 0 && this.canOfferAd() && doubleLeft > 0;
        const chartTop = nextTop;
        const chartH = hasUnlockBanner ? 148 : 192;
        const rowStep = hasUnlockBanner ? 20 : 26;
        benchPlate(g, 16, chartTop - chartH, 328, chartH, BENCH.steel, BENCH.edge, 8);
        this.host.text(UI_COPY.result.damageChartTitle, 96, chartTop - 16, { left: true, width: 150, size: 12, bold: true, color: GOLD });
        if (canDouble) {
            this.pixelBtn(this.adVerb(`再领+${res.baseCreditsForDouble}凭证`), 274, chartTop - 16, 126, 22, () => {
                this.triggerReward('result_double', () => {
                    const consumed = consumeDailyAdUse(this.profile, 'double', dateKey);
                    if (!consumed) return;
                    const awarded: WorkshopProfile = { ...consumed, credits: consumed.credits + res.baseCreditsForDouble };
                    this.resultDoubledRunId = runKey;
                    this.saveWorkshop(awarded);
                    this.host.play('unlock');
                });
            }, true);
        } else if (alreadyDoubled) {
            this.host.text(`基础凭证已翻倍 ✓`, 276, chartTop - 16, { width: 124, size: 10, bold: true, color: GREEN });
        }
        const totalDmg = Math.max(1, res.damageByWeapon.reduce((s, w) => s + w.totalDamage, 0));
        res.damageByWeapon.slice(0, 6).forEach((w, idx) => {
            const wy = chartTop - 36 - idx * rowStep;
            const share = w.totalDamage / totalDmg;
            this.host.skin?.uiIcon(w.id, 34, wy, hasUnlockBanner ? 17 : 20);
            this.host.text(`${WEAPON_CATALOG[w.id].name}${TIER_ROMAN[w.tier]}`, 88, wy,
                { left: true, width: 82, size: 11, color: BENCH.paper });
            this.host.block(136, wy - 4, 134, 8, BENCH.recess);
            this.host.block(136, wy - 4, Math.max(3, Math.round(134 * share)), 8, TIER_EDGE[w.tier]);
            this.host.text(`${Math.round(share * 100)}%`, 306, wy, { width: 58, size: 11, bold: true, color: TIER_EDGE[w.tier] });
        });

        // Human Outro Radio (with Harbor Epilogue on Chapter 4 clear!)
        const radioTop = chartTop - chartH - 8;
        const radioH = res.epilogueHook ? 104 : 68;
        benchPlate(g, 16, radioTop - radioH, 328, radioH, BENCH.recess, BENCH.edge, 6);
        const portrait = res.outroRadio.speaker === '陈栖' ? 'radio-chenqi' : 'radio-aruan';
        this.host.skin?.uiIcon(portrait, 40, radioTop - 26, 30);
        this.host.text(`${res.outroRadio.speaker}：${res.outroRadio.line}`, 196, radioTop - 32,
            { left: true, width: 266, height: 56, size: 11, color: BENCH.paper });
        if (res.epilogueHook) {
            this.host.block(28, radioTop - 64, 304, 1, BENCH.edge);
            this.host.text(`${res.epilogueHook.speaker}：${res.epilogueHook.line}`, 180, radioTop - 84,
                { left: true, width: 300, height: 36, size: 11, color: GOLD });
        }

        // Bottom CTA: Seamless push to Next Chapter, Next Danger tier, or instant Retry!
        const botY = Math.max(this.host.footer + 22, 48);
        const nextIdx = CHAPTER_CATALOG.findIndex(c => c.id === res.chapterId) + 1;
        const nextChapter = !res.endlessMode && !res.dailyShiftKey && res.won
            && nextIdx < CHAPTER_CATALOG.length && isChapterUnlocked(this.profile, CHAPTER_CATALOG[nextIdx].id)
            ? CHAPTER_CATALOG[nextIdx]
            : undefined;
        const nextDanger = !res.endlessMode && !res.dailyShiftKey && res.won
            && res.danger < 4 && isDangerUnlocked(this.profile, (res.danger + 1) as DangerLevel)
            ? ((res.danger + 1) as DangerLevel)
            : undefined;
        if (nextChapter) {
            this.pixelBtn(UI_COPY.result.nextChapter(nextChapter.title) + ' ›', 180, botY + 48, 328, 44, () => {
                this.prepMode = 'story';
                this.chapterIdx = nextIdx;
                this.page = 'prep';
            }, true);
        } else if (nextDanger !== undefined) {
            this.pixelBtn(`挑战 · ${DANGER_MULTIPLIERS[nextDanger].label} ›`, 180, botY + 48, 328, 44, () => {
                this.prepMode = 'story';
                this.danger = nextDanger;
                this.page = 'prep';
            }, true);
        } else {
            this.pixelBtn(UI_COPY.result.retry, 180, botY + 48, 328, 44, () => {
                if (res.endlessMode) {
                    this.startNewPatrol('04', res.rigId, res.danger, 'none', undefined, { endlessMode: true });
                } else {
                    this.startNewPatrol(res.chapterId, res.rigId, res.danger);
                }
            }, true);
        }

        if (this.host.engage?.canShare) {
            const topWep = res.damageByWeapon[0] ? WEAPON_CATALOG[res.damageByWeapon[0].id].name : '电弧扳手';
            this.pixelBtn('回值班室', 68, botY, 104, 40, () => { this.page = 'home'; });
            this.pixelBtn('工坊改装', 180, botY, 104, 40, () => { this.page = 'workshop'; });
            this.pixelBtn('晒战报', 292, botY, 104, 40, () => {
                const title = res.endlessMode
                    ? `夜班修理局：港区无尽我撑过第 ${res.wavesCleared} 波！主力 ${topWep}`
                    : `夜班修理局：用 ${topWep} 带队修亮了「${res.chapterTitle}」！`;
                this.host.engage?.shareResult(title, `击倒 ${res.totalKills} 台暴走敌机 · ${DANGER_MULTIPLIERS[res.danger].label}`);
            });
        } else {
            this.pixelBtn('回值班室', 96, botY, 156, 40, () => { this.page = 'home'; });
            this.pixelBtn(UI_COPY.result.backWorkshop, 264, botY, 156, 40, () => { this.page = 'workshop'; });
        }
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
            savePending: !!this.retrySave,
            credits: this.profile.credits,
            clearedChapters: this.profile.clearedChapters,
            maxDangerCleared: this.profile.maxDangerCleared,
            maxDangerByRig: this.profile.maxDangerByRig ?? {},
            chapter: CHAPTER_CATALOG[this.chapterIdx].id,
            rig: RIG_ORDER[this.rigIdx],
            danger: this.danger,
            supply: PRE_RUN_SUPPLY_ORDER[this.supplyIdx] ?? 'none',
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
        if (this.retrySave) return;
        if (target === 'prep') { this.page = 'prep'; return; }
        if (target === 'workshop') { this.profile = { ...this.profile, credits: Math.max(this.profile.credits, 80) }; this.page = 'workshop'; return; }
        if (target === 'log') {
            this.profile = {
                ...this.profile,
                clearedChapters: ['01', '02', '03', '04'],
                maxDangerCleared: { '01': 4, '02': 3, '03': 2, '04': 0 },
                maxDangerByRig: { duty_standard: 4, heavy_fitter: 2, high_voltage: 3 },
            };
            this.page = 'log';
            return;
        }
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
                this.session.nextWeaponUid = 5;
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
                this.session.nextWeaponUid = 7;
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
                this.session.nextWeaponUid = 7;
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
