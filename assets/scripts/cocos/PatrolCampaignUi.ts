import { Color, Graphics, Label, Node, UITransform, Vec2 } from 'cc';
import { FIELD, combatViewport } from '../roguelite/constants';
import {
    CHAPTER_CATALOG,
    MODULE_BY_ID,
    MODULE_CATALOG,
    RIG_CATALOG,
    SYNERGY_TABLE,
    WEAPON_CATALOG,
    WORKSHOP_TALENTS,
} from '../roguelite/catalog';
import { DANGER_MULTIPLIERS, armorDamageMultiplier, workshopTalentCost, xpRequiredForLevel } from '../roguelite/formulas';
import {
    CHAPTER_NARRATIVES,
    STAT_LABELS,
    TAG_LABELS,
    UI_COPY,
    homeDispatchStatus,
    shopStoryBeatHint,
} from '../roguelite/narrative';
import { PatrolStorage } from '../roguelite/persistence';
import {
    CHAPTER_CLEAR_BONUS,
    DANGER_LEVELS,
    DANGER_RULE_TEXT,
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
import { hasRefreshableShopSlots, MAX_WEAPONS } from '../roguelite/shop';
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
    CombatBounds,
    DailyShiftModifierId,
    DangerLevel,
    ModuleSpec,
    PreRunSupplyId,
    RewardedPlacement,
    RigId,
    StatKey,
    Tier,
    ToolId,
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
import { STICK_MARGIN } from '../platform/settings';
import type { CampaignPreferences } from '../platform/settings';

const WIDTH = 360;
const HEIGHT = 640;
const VIEW_CENTER_X = (FIELD.left + FIELD.right) / 2;
const VIEW_CENTER_Y = (FIELD.bottom + FIELD.top) / 2;
const LOADING_LAMP_COUNT = 8;
const LOADING_LAMP_LEFT = 105;
const LOADING_LAMP_PITCH = 19;
const LOADING_LAMP_Y = 312;
const LOADING_LAMP_TRAIL = new Color(152, 106, 56);

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
const TIER_NAME: Record<Tier, string> = { 1: 'Ⅰ 普通', 2: 'Ⅱ 精良', 3: 'Ⅲ 稀有', 4: 'Ⅳ 传奇' };
const TIER_ROMAN: Record<Tier, string> = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ', 4: 'Ⅳ' };

const GREEN = new Color(115, 224, 174);
const RED = new Color(241, 110, 96);
const CYAN = new Color(103, 198, 243);
const PURPLE = new Color(193, 143, 249);
const GOLD = new Color(251, 199, 108);
const DARK_SCRIM = new Color(8, 13, 17, 214);
const HUD_GLASS = new Color(14, 22, 29, 226);
const HEAL_GREEN = new Color(98, 232, 152);
const JAM_ACTIVE_RING = new Color(192, 128, 255, 220);
const JAM_WARN_RING = new Color(251, 199, 108, 175);
const HEALTH_TEXT = new Color(168, 184, 192, 195);
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
    readonly loadingPulse: Graphics;
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
    readonly tiltAvailable: boolean;
    readonly tiltActive: boolean;
    readonly settings: Readonly<CampaignPreferences>;
    readonly updateSettings: (patch: Partial<CampaignPreferences>) => boolean;
    readonly play: (sound: Sound) => void;
    readonly setScenery: (key: string | null) => void;
    readonly setBattleOffset: (x: number, y: number) => void;
    readonly clearWorldLayers: () => void;
    readonly addTouch: (x: number, y: number, w: number, h: number, key: string, action: () => void, reward?: boolean) => boolean;
    readonly text: (value: string, x: number, y: number, opts?: PatrolTextOptions) => void;
    readonly block: (x: number, y: number, w: number, h: number, color: Color) => void;
    readonly syncMusic: (battle: boolean) => void;
    readonly onBattleStopped: () => void;
    readonly engage?: MiniGameEngage | null;
    readonly isLowEndDevice?: boolean;
    readonly invalidateUi?: () => void;
    readonly triggerGC?: () => void;
}

type PatrolPage = 'home' | 'weapons' | 'equipment' | 'duty' | 'prep' | 'workshop' | 'log' | 'settings' | 'battle' | 'revive' | 'shop' | 'result';
type PrepMode = 'story' | 'daily' | 'endless';
const RIG_ORDER: readonly RigId[] = ['duty_standard', 'heavy_fitter', 'high_voltage', 'thermal_welder', 'scrap_auditor'];

// Plain, self-explanatory Chinese stat names (NO cryptic 1-character jargon!)
const CARD_STAT: Readonly<Record<StatKey, string>> = {
    maxHp: '生命上限',
    torque: '物理伤害',
    voltage: '电热伤害',
    overclock: '武器伤害',
    cycleSpeed: '攻击速度',
    critChance: '暴击率',
    armor: '护甲',
    repair: '回复能力',
    salvage: '铜件收益',
    luck: '幸运',
    moveSpeed: '移动速度',
    pickupRadius: '拾取范围',
};

const SPECIAL_DESC: Readonly<Record<string, string>> = {
    shop_discount: '商店价格打九折',
    free_reroll: '每次进商店多 1 次免费刷新',
    double_parts: '拾取铜件时有 20% 概率获得双份',
    crit_heal: '暴击时有 15% 概率回复 2 点生命',
    arc_shock: '感电敌机被击毁时会放电',
    burn_spread: '灼烧中的敌机被击毁时会引燃附近敌机',
    armor_thorns: '受伤时反震附近的敌机',
    extra_enemies: '敌机数量 +18%',
    breaker_surge: '每波开始时释放电震，前 6 秒提高攻速',
};

const SPECIAL_SHORT: Readonly<Record<string, string>> = {
    shop_discount: '商店九折',
    free_reroll: '多 1 次免费刷新',
    double_parts: '20% 概率双份铜件',
    crit_heal: '暴击有概率回血',
    arc_shock: '感电敌机击毁时放电',
    burn_spread: '击毁后灼烧蔓延',
    armor_thorns: '受伤反震',
    extra_enemies: '敌机数量 +18%',
    breaker_surge: '开场电震',
};

const SHORT_WEAPON: Readonly<Record<ToolId, string>> = {
    wrench: '扳手', bypass_wrench: '撬棍', arc_gun: '电弧枪', riveter: '铆枪',
    hydraulic_nailer: '钉枪', torch: '焊枪', pulse_nozzle: '吹灰枪',
    induction: '线圈', traction_coil: '抓钩', split_probe: '电击针',
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

function formatStatPreview(stats: Partial<Record<StatKey, number>>, limit = 3, special?: string): string {
    const { pos, neg } = collectStatTokens(stats);
    const items = [...pos, ...neg];
    if (special && SPECIAL_SHORT[special]) items.push(`效果：${SPECIAL_SHORT[special]}`);
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
    private workshopReturn: 'home' | 'prep' | 'result' = 'home';
    private starterByRig: Partial<Record<RigId, ToolId>> = {};
    private workshopTab: 'talents' | 'bans' = 'talents';
    private logTab: 'archive' | 'records' = 'archive';
    private shelfPage = 0;
    private shelfFromShop = false;
    private shelfItem: number | null = null;
    private prepLoadout = false;
    private rigDetails = false;
    private showDamage = false;
    private archiveIdx = 0;
    private banScroll = 0;
    private inspectWeaponSlot: number | null = null;
    private showStatsDrawer = false;
    private shopFeedback = '';
    private homeNotice = '';
    private openingSidebar = false;
    private toastText = '';
    private toastLeft = 0;
    private touchGuardUntil = 0;
    private adBusy = false;
    private resultDoubledRunId: string | null = null;
    private showResultUnlocks = false;
    private tutorialSkipped = false;
    private movedTicksInWave = 0;
    private saving = false;
    private retrySave: (() => void) | null = null;
    private renderedBattle?: NonNullable<PatrolSession['battle']>;
    private loadingTime = 0;
    private loadingStep = 0;

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
        if (this.host.isLowEndDevice) this.juice.setBudgetScale(0.5);
        this.restore();
    }

    private restore(): void {
        this.page = 'home';
        this.result = null;
        this.showResultUnlocks = false;
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
        return !this.saving && !this.adBusy && !this.retrySave && this.page === 'battle' && !this.paused
            && this.battleVisible;
    }

    get battleVisible(): boolean {
        return !!this.renderedBattle && this.renderedBattle === this.session?.battle;
    }

    startFirstPatrol(): void {
        if (this.storage.isNewPlayer && this.page === 'home' && !this.session && !this.retrySave) {
            this.startNewPatrol('01', 'duty_standard', 0);
        }
    }

    /** True when the current static UI page shows an animated onboarding highlight ring (throttled to 4 Hz). */
    get needsPulseDraw(): boolean {
        return this.page === 'shop' && !this.showStatsDrawer && needsShopOnboarding(this.profile) && !this.tutorialSkipped;
    }

    trimMemory(): void {
        this.juice.trimMemory();
    }

    showToast(text: string, durationSec = 2.4): void {
        this.toastText = text;
        this.toastLeft = durationSec;
        this.host.invalidateUi?.();
    }

    tickToast(dt: number): boolean {
        if (this.toastLeft <= 0) return false;
        this.toastLeft -= dt;
        if (this.toastLeft <= 0) {
            this.toastLeft = 0;
            this.toastText = '';
            return true;
        }
        return false;
    }

    private guardTouches(ms = 260): void {
        this.touchGuardUntil = Date.now() + ms;
    }

    private canOfferAd(): boolean {
        return this.profile.adFreePass === true || this.host.engage?.hasRewardedAd === true;
    }

    private adVerb(action: string): string {
        return this.profile.adFreePass ? `用免视频工牌${action}` : `看视频${action}`;
    }

    private triggerReward(placement: RewardedPlacement, onReward: () => void, onFail?: () => void): void {
        if (this.adBusy) return;
        const engage = this.host.engage;
        if (this.profile.adFreePass) {
            onReward();
            this.host.invalidateUi?.();
            return;
        }
        if (!engage?.hasRewardedAd) {
            this.showToast('当前无法播放奖励视频。');
            onFail?.();
            return;
        }
        this.adBusy = true;
        this.host.onBattleStopped();
        this.host.invalidateUi?.();
        void engage.requestReward(placement, { adFreePass: this.profile.adFreePass }).then(ok => {
            this.adBusy = false;
            if (ok) {
                onReward();
            } else {
                this.showToast('看完视频才能领取奖励。');
                onFail?.();
            }
            this.host.invalidateUi?.();
        }, () => {
            this.adBusy = false;
            this.showToast('视频暂时播不了，请稍后再试。');
            onFail?.();
            this.host.invalidateUi?.();
        });
    }

    private drawGuidePulse(x: number, y: number, w: number, h: number, color: Color): void {
        const g = this.host.ui;
        const pulse = Math.floor(Date.now() / 360) % 2 === 0;
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
        if (this.page === 'battle' && this.renderedBattle && this.renderedBattle === this.session?.battle) {
            this.paused = true;
            if (this.session?.battle) this.session.battle.destination = null;
        }
    }

    update(dt: number, axisX: number, axisY: number): void {
        if (!this.inBattle) return;
        const session = this.session!;
        const b = session.battle!;
        if (Math.hypot(axisX, axisY) > 0.1 || b.destination) this.movedTicksInWave++;
        const simDt = this.juice.step(dt);
        const completed = simDt > 0 ? session.advance(simDt, axisX, axisY) : false;

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
            this.guardTouches(260);
            this.host.syncMusic(false);
            this.host.invalidateUi?.();
        } else if (this.session.phase === 'lost' && this.session.canRevive && this.canOfferAd()) {
            this.page = 'revive';
            this.guardTouches(320);
            this.host.syncMusic(false);
            this.host.invalidateUi?.();
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
        this.host.invalidateUi?.();
        void locks.request('night-shift.patrol.save', attempt).catch(() => {
            this.retrySave = () => this.persist(write);
        }).finally(() => {
            this.saving = false;
            this.host.invalidateUi?.();
        });
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
            this.showResultUnlocks = false;
            this.showDamage = false;
            this.page = 'result';
            this.guardTouches(280);
            this.juice.reset();
            this.host.skin?.trimMemory();
            this.host.triggerGC?.();
            this.host.play(this.result.won ? 'unlock' : 'hit');
            this.host.syncMusic(false);
            this.host.invalidateUi?.();
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
        this.shopFeedback = '';
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

    private openWorkshop(from: 'home' | 'prep' | 'result'): void {
        this.workshopReturn = from;
        this.page = 'workshop';
    }

    private changeSettings(patch: Partial<CampaignPreferences>): void {
        if (!this.host.updateSettings(patch)) this.showToast('设置未能保存，请再试一次。');
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
        const battle = !this.retrySave && (this.page === 'battle' || this.page === 'revive') ? this.session?.battle : undefined;
        const skin = this.host.skin;
        if (battle) skin?.prepareBattle(battle.chapter.stations[battle.waveDef.stationIndex].id, battle.arena);
        const loading = !!battle && !!skin && !skin.isBattleArtReady(battle.arena);
        this.setLoadingAnimation(loading && !skin.battleArtFailed);
        const isBattle = !!battle && !loading && !this.saving;
        if (!isBattle) {
            this.renderedBattle = undefined;
            this.host.clearWorldLayers();
            skin?.drawWorld(null);
        }
        this.host.setScenery(this.page === 'home' ? 'night-depot' : null);

        if (isBattle) {
            this.drawBattleWorld();
            if (this.renderedBattle !== battle) {
                this.renderedBattle = battle;
                this.host.syncMusic(this.page === 'battle');
            }
        }
        this.host.skin?.beginUi();
        if (loading) {
            this.drawLoadingScreen(skin);
            skin.endUi();
            return;
        }
        if (this.saving || this.adBusy) {
            this.host.text(this.adBusy ? '正在载入视频…' : '正在保存进度…', 180, 320, { width: 236, size: 16, color: BENCH.paper });
            this.host.skin?.endUi();
            return;
        }
        if (this.retrySave) {
            this.backdrop();
            const reload = this.storage.needsReload;
            this.host.text(reload ? '需要重新读取存档' : '进度尚未保存', 180, 365,
                { width: 304, size: 22, bold: true, color: BENCH.paper });
            this.host.text(reload ? '存档有变化，或暂时读不到。' : '请检查设备的存储空间，再试一次。', 180, 315,
                { width: 304, size: 14, color: BENCH.muted });
            this.pixelBtn(reload ? '读取存档' : '重试保存', 180, 254, 236, 50, this.retrySave, true);
            this.host.skin?.endUi();
            return;
        }
        switch (this.page) {
            case 'home': this.drawHome(); break;
            case 'duty': this.drawDuty(); break;
            case 'weapons':
            case 'equipment': this.drawShelf(); break;
            case 'prep': this.drawPrep(); break;
            case 'workshop': this.drawWorkshop(); break;
            case 'log': this.drawLog(); break;
            case 'settings': this.drawSettings(); break;
            case 'battle': this.drawBattleHud(); break;
            case 'revive': this.drawReviveOffer(); break;
            case 'shop': this.drawShop(); break;
            case 'result': this.drawResult(); break;
        }
        if (this.toastText) {
            const ty = Math.min(this.host.top - 36, this.host.capsuleCeiling - 56);
            benchPlate(this.host.ui, 24, ty - 16, 312, 32, HUD_GLASS, GOLD, 5);
            this.host.text(this.toastText, 180, ty, { width: 298, size: 11, bold: true, color: GOLD });
        }
        this.host.skin?.endUi();
    }

    private drawLoadingScreen(skin: BattleSkinView): void {
        const g = this.host.ui;
        const failed = skin.battleArtFailed;
        const lamp = failed ? RED : GOLD;
        this.backdrop();
        benchPlate(g, 54, 244, 252, 152, BENCH.steel, BENCH.edge, 8);
        benchScrew(g, 66, 384);
        benchScrew(g, 294, 384);
        benchScrew(g, 66, 256);
        benchScrew(g, 294, 256);

        // Terminals feed a pixel lightning bolt in the center of the panel.
        g.fillColor = BENCH.edge;
        g.rect(85, 352, 68, 2);
        g.rect(207, 352, 68, 2);
        g.fill();
        g.fillColor = lamp;
        g.rect(84, 350, 6, 6);
        g.rect(270, 350, 6, 6);
        g.fill();
        benchPlate(g, 153, 331, 54, 44, BENCH.recess, BENCH.edge, 5);
        g.fillColor = lamp;
        if (failed) {
            g.rect(178, 350, 4, 12);
            g.rect(178, 344, 4, 3);
        } else {
            g.moveTo(182, 367);
            g.lineTo(190, 367);
            g.lineTo(183, 355);
            g.lineTo(192, 355);
            g.lineTo(174, 338);
            g.lineTo(179, 351);
            g.lineTo(169, 351);
            g.close();
        }
        g.fill();

        if (failed) {
            this.host.text('战斗资源加载失败', 180, 314, { width: 220, size: 16, bold: true });
            this.pixelBtn('重试加载', 180, 276, 168, 34, () => skin.retryBattleArt(), true);
            return;
        }
        g.fillColor = BENCH.recess;
        g.rect(99, LOADING_LAMP_Y - 4, 162, 13);
        g.fill();
        g.fillColor = BENCH.edge;
        for (let i = 0; i < LOADING_LAMP_COUNT; i++) {
            g.rect(LOADING_LAMP_LEFT + i * LOADING_LAMP_PITCH, LOADING_LAMP_Y, 17, 5);
        }
        g.fill();
        this.host.text('正在加载战斗资源…', 180, 280, { width: 220, size: 16, bold: true });
    }

    private setLoadingAnimation(active: boolean): void {
        const indicator = this.host.loadingPulse.node;
        if (indicator.active === active) return;
        indicator.active = active;
        if (!active) return;
        this.loadingTime = 0;
        this.loadingStep = 0;
        this.drawLoadingPulse();
    }

    tickLoadingAnimation(dt: number): void {
        if (!this.host.loadingPulse.node.active) return;
        this.loadingTime += dt;
        const step = Math.floor(this.loadingTime * 10);
        if (step === this.loadingStep) return;
        this.loadingStep = step;
        this.drawLoadingPulse();
    }

    private drawLoadingPulse(): void {
        const g = this.host.loadingPulse;
        g.clear();
        const head = this.loadingStep % LOADING_LAMP_COUNT;
        const tail = (head + LOADING_LAMP_COUNT - 1) % LOADING_LAMP_COUNT;
        g.fillColor = LOADING_LAMP_TRAIL;
        g.rect(LOADING_LAMP_LEFT + tail * LOADING_LAMP_PITCH, LOADING_LAMP_Y, 17, 5);
        g.fill();
        g.fillColor = GOLD;
        g.rect(LOADING_LAMP_LEFT + head * LOADING_LAMP_PITCH, LOADING_LAMP_Y, 17, 5);
        g.fill();
    }

    // ─────────────────────────── BATTLE WORLD ───────────────────────────

    private drawBattleWorld(): void {
        const battle = this.session!.battle!;
        const skin = this.host.skin;
        skin?.drawPixelFloor(battle.field);

        const view = combatViewport(battle.field, battle.player.x, battle.player.y);
        const shake = this.juice.getShakeOffset();
        const offsetX = view.left + (view.right - view.left) / 2 - VIEW_CENTER_X + shake.x;
        const offsetY = view.bottom + (view.top - view.bottom) / 2 - VIEW_CENTER_Y + shake.y;
        this.host.setBattleOffset(offsetX, offsetY);

        const bridge = battle.toRenderBridge();
        const floatingTick = battle.tick + (this.session?.frameFraction ?? 0);

        if (this.host.puddles) {
            this.host.puddles.clear();
            this.host.threats?.clear();
            // Persistent low-contrast floor decals (oil, scorch, scrap, spent brass shells) sit below actors & bullets!
            this.juice.drawGroundDecals(this.host.puddles);
            skin?.drawEncounter(this.host.puddles, bridge, this.host.threats);
        }

        skin?.drawWorld(bridge, floatingTick);

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
                art.fillColor = active ? JAM_ACTIVE_RING : JAM_WARN_RING;
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
        const dispatch = homeDispatchStatus(this.profile);
        this.host.text(dispatch.clockLine, 130, topY + 6, { left: true, width: 232, size: 12, bold: true, color: GOLD });
        this.host.text(UI_COPY.home.title, 140, topY - 26, { left: true, width: 244, height: 46, size: 34, bold: true, color: BENCH.paper });

        drawCreditTicket(g, 43, topY - 68);
        this.host.text('维修凭证', 78, topY - 68, { left: true, width: 52, size: 11, color: BENCH.paper });
        this.host.text(String(this.profile.credits), 124, topY - 68, { left: true, width: 42, size: 15, bold: true, color: GOLD });

        const seals = goldSealCount(this.profile);
        if (seals > 0) {
            benchPlate(g, 16, topY - 110, seals === 4 ? 132 : 98, 26, BENCH.recess, GOLD, 5);
            this.host.skin?.uiIcon('ui/medal', 31, topY - 97, 16);
            this.host.text(seals === 4 ? '四章金章已集齐' : `金章 ${seals}/4`, seals === 4 ? 90 : 73, topY - 97,
                { left: true, width: seals === 4 ? 98 : 66, size: 11, bold: true, color: GOLD });
        }

        // FIXED: Settings button now sits on an opaque pixel dark plate so it never bleeds into the pixel roof art.
        this.pixelBtn(UI_COPY.home.settingsTab, 314, Math.min(topY - 24, this.host.capsuleCeiling - 24), 60, 34, () => {
            this.page = 'settings';
        });

        const bottom = Math.max(this.host.footer + 40, 70);
        const hasActive = !!this.session && (this.session.phase === 'battle' || this.session.phase === 'shop');
        const canUpgrade = WORKSHOP_TALENTS.some(t => {
            const rank = this.profile.talents[t.id] ?? 0;
            return rank < t.maxRank && this.profile.credits >= workshopTalentCost(t, rank);
        });
        const links = [
            ['weapons', '武器', 'arc_gun/signature'], ['equipment', '装备', 'gear/guard'],
            ['workshop', '工坊', 'wrench/flywheel'], ['log', '日志', 'ui/receipt'], ['duty', '值班簿', 'ui/radio'],
        ] as const;
        benchPlate(g, 55, bottom - 21, 250, 42, HUD_GLASS, BENCH.edge, 5);
        links.forEach(([page, label, icon], i) => {
            const x = 80 + i * 50, y = bottom;
            const down = this.host.addTouch(x, y, 50, 44, page, () => {
                this.homeNotice = '';
                this.shelfItem = null;
                this.shelfFromShop = false;
                this.shelfPage = 0;
                if (page === 'workshop') this.openWorkshop('home');
                else this.page = page;
            });
            if (down) this.host.block(x - 23, y - 19, 46, 38, BENCH.steel);
            this.host.skin?.uiIcon(icon, x, y + 6, 22);
            this.host.text(label, x, y - 11, { size: 11, width: 46, color: BENCH.paper });
            if (page === 'workshop' && canUpgrade) this.host.block(x + 10, y + 10, 5, 5, GOLD);
        });
        const dispatchY = bottom + 62;
        const held = this.host.addTouch(180, dispatchY, 174, 52, 'dispatch', () => {
            this.homeNotice = '';
            if (hasActive) {
                this.resumeSavedPatrol();
            } else if (isFirstTimePlayer(this.profile)) {
                // Save the first-30s funnel: brand-new players drop straight into Ch1 Wave 1 on first pull!
                this.startNewPatrol('01', 'duty_standard', 0, 'none');
            } else {
                this.prepMode = 'story';
                this.prepLoadout = false;
                this.page = 'prep';
            }
        });
        drawDispatchHandle(g, 180, dispatchY, held);
        const activeRun = hasActive ? this.session : null;
        const cta = activeRun?.phase === 'shop'
            ? `${activeRun.intermission?.pendingLevelUps ? '继续升级' : '继续整备'}\n第 ${activeRun.waveIndex + 2} 波`
            : activeRun
                ? `继续战斗\n第 ${activeRun.waveIndex + 1} 波`
                : isFirstTimePlayer(this.profile) ? UI_COPY.home.startCta : '出发准备';
        this.host.text(cta, 160, dispatchY - (held ? 3 : 0), {
            size: hasActive ? 14 : 23, height: hasActive ? 40 : 29, bold: true, color: BENCH.ink, width: 108,
        });

        // Required WeChat / Douyin P0 Healthy Gaming Notice cleanly seated below bottom bar
        const noticeY = Math.max(this.host.footer - 12, 18);
        this.host.text(
            '抵制不良游戏，拒绝盗版游戏。注意自我保护，谨防受骗上当。\n适度游戏益脑，沉迷游戏伤身。合理安排时间，享受健康生活。',
            180, noticeY, { width: 336, height: 24, size: 8, color: HEALTH_TEXT },
        );
    }

    private drawDuty(): void {
        this.backdrop();
        const topY = this.header('值班簿', '‹ 值班室', () => { this.page = 'home'; });
        const g = this.host.ui;
        const dispatch = homeDispatchStatus(this.profile);
        this.host.text('今日签到', 90, topY - 68, { width: 144, left: true, size: 17, color: GOLD });
        // Retention: Daily Check-In / Douyin Sidebar Revisit Gift
        const dateKey = todayDateKey();
        const canCheckIn = canClaimDailyCheckIn(this.profile, dateKey);
        const engage = this.host.engage;
        const needSidebarJump = engage?.platform === 'douyin' && engage.canOpenSidebar && !engage.isDouyinSidebarEntry;
        if (!canCheckIn || this.openingSidebar) {
            benchPlate(g, 229, topY - 82, 114, 28, HUD_GLASS, BENCH.edge, 5);
            this.host.text(canCheckIn ? '正在打开侧边栏…' : '今日已签到 ✓', 286, topY - 68,
                { width: 114, size: 11, color: BENCH.paper });
        } else if (needSidebarJump) {
            this.pixelBtn('打开侧边栏', 286, topY - 68, 114, 30, () => {
                this.openingSidebar = true;
                void engage.openSidebar().then(ok => {
                    this.openingSidebar = false;
                    this.homeNotice = ok ? '从侧边栏重新进入游戏，就能签到。' : '侧边栏打开失败，请再试一次。';
                    this.host.invalidateUi?.();
                });
            }, true);
        } else {
            this.pixelBtn(`签到 +${DAILY_CHECKIN_CREDITS} 凭证`, 286, topY - 68, 114, 30, () => {
                const next = claimDailyCheckIn(this.profile, dateKey);
                if (next) {
                    this.saveWorkshop(next);
                    this.host.play('unlock');
                    this.homeNotice = `签到获得 ${DAILY_CHECKIN_CREDITS} 凭证。下次出发前可免费选 1 次补给。`;
                }
            }, true);
        }

        // FIXED: Unified hard-edge pixel bottom bar + P0 Healthy Gaming Notice cleanly inside safe area.
        const bottom = topY - 252;
        const hasActive = !!this.session && (this.session.phase === 'battle' || this.session.phase === 'shop');

        if (this.homeNotice) {
            benchPlate(g, 16, bottom - 34, 328, 28, HUD_GLASS, GOLD, 5);
            this.host.text(this.homeNotice, 180, bottom - 20, { width: 312, height: 26, size: 11, bold: true, color: GOLD });
        }
        if (!hasActive && !isFirstTimePlayer(this.profile)) {
            if (dispatch.radio) {
                const ry = bottom + 72;
                benchPlate(g, 16, ry, 328, 38, HUD_GLASS, BENCH.edge, 5);
                const portrait = dispatch.radio.speaker === '陈栖' ? 'radio-chenqi' : 'radio-aruan';
                this.host.skin?.uiIcon(portrait, 36, ry + 19, 28);
                this.host.text(`${dispatch.radio.speaker}：${dispatch.radio.line}`, 196, ry + 19,
                    { left: true, width: 278, height: 34, size: 10, color: BENCH.paper });
            }
            const daily = getDailyShift(dateKey);
            const dailyDone = isDailyShiftClearedToday(this.profile, dateKey);
            benchPlate(g, 16, bottom + 36, 328, 30, HUD_GLASS, dailyDone ? GREEN : CYAN, 5);
            const dailyText = `今日委托 · ${daily.modifier.name}${dailyDone ? ' · 已完成 ✓' : ` · +${daily.bonusCredits} 凭证`}`;
            this.host.text(dailyText, 152, bottom + 51, { left: true, width: 254, size: 11, bold: true, color: dailyDone ? GREEN : CYAN });
            this.pixelBtn('查看', 310, bottom + 51, 56, 22, () => {
                this.prepLoadout = false;
                this.prepMode = 'daily';
                this.page = 'prep';
            }, !dailyDone);
        }

    }

    private drawShelf(): void {
        this.backdrop();
        const weapons = this.page === 'weapons';
        const tools = Object.values(WEAPON_CATALOG);
        const items = weapons ? tools : MODULE_CATALOG;
        const title = weapons ? '武器架' : '装备柜';
        const top = this.header(title, this.shelfFromShop ? '‹ 整备' : this.shelfItem === null ? '‹ 值班室' : '‹ 列表', () => {
            if (this.shelfFromShop) {
                this.page = 'shop';
                this.shelfFromShop = false;
                this.shelfItem = null;
                return;
            }
            if (this.shelfItem !== null) this.shelfItem = null;
            else this.page = 'home';
        });
        const icon = (id: string) => weapons ? id : MODULE_ICON[id] ?? 'gear/guard';
        if (this.shelfItem !== null) {
            const item = items[this.shelfItem];
            this.host.skin?.uiIcon(icon(item.id), 180, top - 68, 80);
            this.host.text(item.name, 180, top - 144, { size: 23, width: 312, bold: true, color: GOLD });
            const lines = 'tiers' in item
                ? [item.roleText, ...item.tiers.map((tier, i) => TIER_ROMAN[(i + 1) as Tier] + '   伤害 ' + tier.damage + (tier.perkText ? ' · ' + tier.perkText : ''))]
                : [item.flavor, formatStatPreview(item.stats, 8), item.special ? SPECIAL_DESC[item.special] : '',
                    isModuleUnlocked(this.profile, item.id) ? '已加入商店货架' : '解锁难度 ' + moduleRequiredDanger(item.id)];
            let y = top - 203;
            for (const line of lines.filter(Boolean)) {
                this.host.text(line, 180, y, { height: 44, width: 296, size: 14, color: BENCH.paper });
                y -= 53;
            }
            return;
        }
        const size = 6;
        items.slice(this.shelfPage * size, (this.shelfPage + 1) * size).forEach((item, i) => {
            const x = 95 + 170 * (i % 2), y = top - 62 - Math.floor(i / 2) * 112;
            const down = this.host.addTouch(x, y, 154, 98, item.id, () => { this.shelfItem = this.shelfPage * size + i; });
            benchPlate(this.host.ui, x - 77, y - 49, 154, 98, down ? BENCH.edge : BENCH.steel, BENCH.edge, 8);
            this.host.skin?.uiIcon(icon(item.id), x, y + 13, 46);
            this.host.text(item.name, x, y - 26, { width: 144, size: 14, color: BENCH.paper });
        });
        const pages = Math.ceil(items.length / size), y = Math.max(54, this.host.footer + 22);
        if (this.shelfPage > 0) this.pixelBtn('上一页', 76, y, 112, 42, () => { this.shelfPage--; });
        if (this.shelfPage + 1 < pages) this.pixelBtn('下一页', 284, y, 112, 42, () => { this.shelfPage++; });
        this.host.text((this.shelfPage + 1) + ' / ' + pages, 180, y, { size: 13, color: BENCH.muted });
    }

    // ─────────────────────────── PAGE 2: PREP / CHAPTER & RIG (FIXED) ───────────────────────────

    private drawPrep(): void {
        this.backdrop();
        const top = this.header(this.prepLoadout ? '工装与补给' : '选择路线', this.prepLoadout ? '‹ 路线' : '‹ 值班室', () => {
            if (this.prepLoadout) this.prepLoadout = false;
            else this.page = 'home';
        }, '工坊', () => this.openWorkshop('prep'));
        const g = this.host.ui;
        const dateKey = todayDateKey();
        const daily = getDailyShift(dateKey);
        const dailyDone = isDailyShiftClearedToday(this.profile, dateKey);
        const endlessReady = hasEndlessUnlocked(this.profile);
        if (this.prepMode === 'endless' && !endlessReady) this.prepMode = 'story';

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

        if (!this.prepLoadout) {
            // Section A: Chapter / Daily Shift / Endless banner
            const modes: { id: PrepMode; label: string }[] = [
                { id: 'story', label: '战役' }, { id: 'daily', label: '今日委托' },
            ];
            if (endlessReady) modes.push({ id: 'endless', label: '港区无尽' });
            const modeWidth = 328 / modes.length;
            modes.forEach(({ id, label }, i) => {
                const active = id === this.prepMode;
                this.pixelBtn(label, 16 + modeWidth * (i + 0.5), top - 15, modeWidth - 5, 25,
                    active ? null : () => { this.prepMode = id; }, active);
            });

            const chTop = top - 34;
            const chH = 126;
            const chBot = chTop - chH;
            const chEdge = isDaily ? CYAN : isEndless ? GOLD : (chUnlocked ? BENCH.edge : BENCH.steel);
            benchPlate(g, 16, chBot, 328, chH, chUnlocked ? BENCH.steel : BENCH.recess, chEdge, 8);
            this.host.block(17, chTop - 3, 326, 3, isDaily ? CYAN : chUnlocked ? GOLD : BENCH.edge);

            if (!isDaily && !isEndless) {
                if (this.chapterIdx > 0) this.pixelBtn('‹', 38, chTop - 32, 32, 32, () => { this.chapterIdx--; });
                if (this.chapterIdx + 1 < CHAPTER_CATALOG.length) {
                    this.pixelBtn('›', 322, chTop - 32, 32, 32, () => { this.chapterIdx++; });
                }
            }

            if (isDaily) {
                this.host.text(`今日委托 · ${dateKey}${dailyDone ? ' · 已领奖 ✓' : ''}`, 180, chTop - 16,
                    { width: 244, size: 11, bold: true, color: dailyDone ? GREEN : CYAN });
                this.host.text(daily.modifier.name, 180, chTop - 38, { width: 244, size: 20, bold: true, color: BENCH.paper });
                this.host.text(`章节：${chapter.title}`, 180, chTop - 58, { width: 304, size: 11, color: BENCH.paper });
                this.host.text(daily.modifier.ruleText, 180, chTop - 77, { width: 304, size: 11, bold: true, color: CYAN });
                this.host.text(dailyDone ? '今天的额外奖励已领过，仍可再挑战。' : `今天首次完成额外获得 ${daily.bonusCredits} 凭证。`,
                    180, chTop - 93, { width: 304, size: 10, color: GOLD });
            } else if (isEndless) {
                const best = this.profile.bestEndlessWave ?? 0;
                this.host.text('港区无尽', 180, chTop - 16, { width: 244, size: 11, bold: true, color: GOLD });
                this.host.text('老码头抢修', 180, chTop - 38, { width: 244, size: 20, bold: true, color: BENCH.paper });
                this.host.text(best > 0 ? `最高纪录：完成 ${best} 波` : '暂无纪录。第 12 波后还会不断出现敌机。',
                    180, chTop - 62, { width: 304, size: 11, bold: true, color: CYAN });
                this.host.text('第 12 波后每 5 波有一名首领。能撑多久，就打多久。', 180, chTop - 85,
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

                if (chUnlocked) {
                    this.host.text(`${narrative.opener.speaker}：${narrative.opener.line}`,
                        180, chTop - 83, { width: 304, height: 30, left: true, size: 10, color: BENCH.muted });
                }
            }
            if (!chUnlocked) return;

            // Section B: Danger level selector (D0-D4) with rule twist + first-clear bonus
            const dTop = chBot - 8;
            const dH = 92;
            const dBot = dTop - dH;
            benchPlate(g, 16, dBot, 328, dH, BENCH.recess, dangerUnlocked ? BENCH.edge : BENCH.steel, 6);
            const dm = DANGER_MULTIPLIERS[activeDanger];
            if (!isDaily) {
                for (const d of DANGER_LEVELS) {
                    const cleared = !isEndless && maxChDanger !== undefined && d <= maxChDanger;
                    const label = `难度 ${d}${cleared ? ' ✓' : ''}`;
                    this.pixelBtn(label, 56 + d * 62, dTop - 15, 58, 21,
                        d === activeDanger ? null : () => { this.danger = d; }, d === activeDanger);
                }
            }
            const baseWinCredits = 24 + CHAPTER_CLEAR_BONUS[chapter.id] + dm.creditBonus;
            const firstBonus = !isDaily && !isEndless && dangerUnlocked ? unclaimedFirstClearBonus(this.profile, chapter.id, activeDanger) : 0;
            const dangerHead = isDaily ? `固定难度 ${activeDanger} · ${dm.label}`
                : !dangerUnlocked ? `难度 ${activeDanger} · ${dm.label} · 未解锁`
                    : isEndless ? `难度 ${activeDanger} · ${dm.label}`
                        : `${dm.label} · 通关得 ${baseWinCredits} 凭证`;
            this.host.text(dangerHead, 180, dBot + 36, {
                width: 244, size: 12, bold: true,
                color: !dangerUnlocked ? RED : DANGER_COLOR[activeDanger],
            });
            const dangerSub = !dangerUnlocked
                ? dangerUnlockHint(activeDanger)
                : isDaily
                    ? '今天的委托对所有玩家使用相同的关卡和随机配置。'
                    : isEndless
                        ? `${DANGER_RULE_TEXT[activeDanger]} 完成的波次越多，获得的凭证越多。`
                        : `${DANGER_RULE_TEXT[activeDanger]} ${firstBonus > 0 ? `首通另得 ${firstBonus} 凭证` : '此难度已通关'}`;
            this.host.text(dangerSub, 180, dBot + 13, {
                width: 310, height: 24, size: 10,
                color: !dangerUnlocked ? GOLD : firstBonus > 0 ? CYAN : GREEN,
            });

            if (dangerUnlocked) this.pixelBtn('选择工装 ›', 180, Math.max(this.host.footer + 24, 58), 328, 48,
                () => { this.prepLoadout = true; this.rigDetails = false; }, true);
            return;
        }
        // Section C: 5 Mechanic Rigs selector (with lock & best-danger stamp!)
        const tabY = top - 32;
        const tabW = 62;
        if (isDaily) this.host.text('本次委托指定工装，可免费使用', 180, tabY, { width: 328, size: 11, color: CYAN });
        else RIG_ORDER.forEach((id, idx) => {
            const tx = 16 + idx * 66.5 + tabW / 2;
            const active = idx === this.rigIdx;
            const unlocked = isRigUnlocked(this.profile, id);
            const label = unlocked ? RIG_CATALOG[id].name.slice(0, 2) : `${RIG_CATALOG[id].name.slice(0, 2)} · 锁定`;
            this.pixelBtn(label, tx, tabY, tabW, 30, active ? null : () => { this.rigIdx = idx; }, active);
            const rigBest = this.profile.maxDangerByRig?.[id];
            if (isRigUnlocked(this.profile, id) && rigBest !== undefined) {
                this.host.block(tx + tabW / 2 - 9, tabY + 7, 6, 6, DANGER_COLOR[rigBest]);
            }
        });

        const cardTop = tabY - 36;
        const cardH = 201;
        const cardBot = cardTop - cardH;
        const legalStarters = legalStarterWeaponsForRig(rigId, this.profile);
        const savedStarter = this.starterByRig[rigId];
        const activeStarter = !isDaily && hasCustomStarterUnlock(this.profile) && savedStarter && legalStarters.includes(savedStarter)
            ? savedStarter
            : rig.starterWeapon;

        benchPlate(g, 16, cardBot, 328, cardH, rigUnlocked ? BENCH.steel : BENCH.recess, rigUnlocked ? GOLD : BENCH.edge, 8);
        const canSwapStarter = !isDaily && rigUnlocked && hasCustomStarterUnlock(this.profile) && legalStarters.length > 1;
        this.host.skin?.uiIcon(activeStarter, 69, cardTop - 66, 72);
        this.host.text(rig.name, 220, cardTop - 34, { left: true, width: 200, size: 21, bold: true, color: BENCH.paper });
        this.host.text(rig.title, 220, cardTop - 63, { left: true, width: 200, size: 14, color: GOLD });
        this.host.text('初始武器 · ' + WEAPON_CATALOG[activeStarter].name, 220, cardTop - 89,
            { left: true, width: 200, size: 12, color: CYAN });
        this.host.block(32, cardTop - 111, 296, 1, BENCH.edge);
        const headline = rigUnlocked ? rig.summary : rigUnlockHint(rigId);
        const details = formatStatPreview(rig.stats, 8) + '\n' + rig.tradeoff;
        this.host.text(this.rigDetails ? details : headline, 180, cardTop - 137,
            { width: 296, height: 48, size: 12, color: rigUnlocked ? BENCH.paper : GOLD });
        this.pixelBtn(this.rigDetails ? '工装简介' : '查看属性', 86, cardTop - 177, 110, 32, () => { this.rigDetails = !this.rigDetails; });
        if (canSwapStarter) this.pixelBtn('换武器', 271, cardTop - 177, 110, 32, () => {
            const cur = legalStarters.indexOf(activeStarter);
            this.starterByRig[rigId] = legalStarters[(cur + 1) % legalStarters.length];
        });
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
            ? (useCheckInCharge ? `出发补给：${supplySpec.name} · 签到免费（剩 ${freeCharges} 次）` : `出发补给：${supplySpec.name} · ${supplySpec.cost} 凭证`)
            : `出发补给：${supplySpec.name}（持有 ${this.profile.credits} 凭证）`;
        this.host.text(supplyTitle, 180, sBot + 31, {
            width: 244, size: 11, bold: true,
            color: supplySpec.cost > 0 ? (useCheckInCharge ? GREEN : canAffordSupply ? GOLD : RED) : BENCH.paper,
        });
        const canAdSupply = supplySpec.cost > 0 && !useCheckInCharge && this.canOfferAd() && prepAdsLeft > 0;
        const supplySub = canAffordSupply
            ? supplySpec.detail
            : canAdSupply
                ? `凭证不足。看视频可领取补给（今天剩 ${prepAdsLeft} 次）。`
                : `还差 ${supplySpec.cost - this.profile.credits} 凭证。`;
        this.host.text(supplySub, 180, sBot + 12, { width: 246, size: 10, color: canAffordSupply ? BENCH.muted : canAdSupply ? GOLD : RED });

        // Section E: Dedicated bottom CTA (with ad-trial rig / ad-free supply options when eligible)
        const ctaY = Math.max(this.host.footer + 24, 58);
        const launchOpts = {
            useCheckInCharge,
            ...(isDaily ? { dailyShiftKey: daily.dateKey, dailyMod: daily.modifier.id, fixedSeed: daily.seed } : {}),
            ...(isEndless ? { endlessMode: true } : {}),
        };
        const canAdTrialRig = !isDaily && !rigUnlocked && dangerUnlocked && canAffordSupply && this.canOfferAd() && prepAdsLeft > 0;

        if (canAdTrialRig) {
            this.rewardBtn(`${this.adVerb(`试用${rig.name}`)} ›`, 180, ctaY, 328, 46, () => {
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

        if (dangerUnlocked && rigUnlocked && canAdSupply && !canAffordSupply) {
            this.rewardBtn(`${this.adVerb('领取补给并出发')} ›`, 180, ctaY, 328, 46, () => {
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

        const canStart = dangerUnlocked && rigUnlocked && canAffordSupply;
        if (canStart && canAdSupply) {
            this.pixelBtn(`花 ${supplySpec.cost} 凭证出发`, 96, ctaY, 156, 46, () => {
                this.startNewPatrol(chapter.id, rigId, activeDanger, supplyId, activeStarter, launchOpts);
            }, false, true);
            this.rewardBtn(this.adVerb('领补给出发'), 264, ctaY, 156, 46, () => {
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

        if (!dangerUnlocked || !rigUnlocked) return;
        const selectedSupply = canAffordSupply ? supplyId : 'none';
        const ctaLabel = !canAffordSupply ? '不带补给出发'
            : useCheckInCharge ? '用签到补给出发'
                : supplySpec.cost > 0 ? `花 ${supplySpec.cost} 凭证出发`
                    : isDaily ? '开始今日委托'
                        : isEndless ? '开始港区无尽' : `开始抢修 · ${chapter.title}`;
        this.pixelBtn(ctaLabel, 180, ctaY, 328, 46, () => {
            this.startNewPatrol(chapter.id, rigId, activeDanger, selectedSupply, activeStarter, launchOpts);
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

        benchPlate(g, 16, top - 34, 148, 58, BENCH.recess, BENCH.edge, 6);
        const hpRatio = Math.max(0, Math.min(1, battle.player.hp / Math.max(1, battle.player.maxHp)));
        const lowHp = hpRatio <= 0.3;
        this.host.text(`生命 ${battle.player.hp}/${battle.player.maxHp}`, 65, top + 12,
            { left: true, width: 86, size: 11, bold: true, color: lowHp ? RED : BENCH.paper });
        this.host.text(`护甲 ${battle.build.stats.armor}`, 132, top + 12,
            { width: 40, size: 11, bold: true, color: CYAN });
        this.host.block(22, top - 3, 136, 7, BENCH.steel);
        this.host.block(22, top - 3, Math.round(136 * hpRatio), 7, lowHp ? RED : GREEN);

        // XP bar directly below HP bar
        const nextXp = xpRequiredForLevel(session.level + 1);
        const xpRatio = Math.min(1, (session.xp + battle.xpGained) / Math.max(1, nextXp));
        this.host.block(22, top - 14, 100, 4, BENCH.steel);
        this.host.block(22, top - 14, Math.round(100 * xpRatio), 4, CYAN);
        this.host.text(`${session.level}级`, 140, top - 12, { width: 32, size: 10, bold: true, color: CYAN });
        const totalParts = session.parts + battle.partsCollected;
        const copperText = battle.bagRemaining > 0
            ? `铜件 ${totalParts} · 待回收 ${battle.bagRemaining}`
            : `铜件 ${totalParts}`;
        this.host.text(copperText, 90, top - 25, { left: true, width: 134, size: 10, color: GOLD });

        // Top-center: Wave & Countdown timer
        benchPlate(g, 170, top - 34, 104, 58, BENCH.recess, BENCH.edge, 6);
        const waveHeader = session.endlessMode ? `无尽 · 第 ${battle.waveDef.wave} 波` : `第 ${battle.waveDef.wave}/12 波`;
        this.host.text(waveHeader, 222, top + 12, { width: 94, size: 12, bold: true, color: session.endlessMode ? GOLD : BENCH.paper });
        const secs = battle.remainingSeconds;
        const clock = `${Math.floor(secs / 60)}:${('0' + (secs % 60)).slice(-2)}`;
        this.host.text(clock, 222, top - 7, { width: 94, size: 22, bold: true, color: secs <= 8 ? RED : GOLD });
        this.host.text(`击毁 ${battle.kills} 台`, 222, top - 25, { width: 94, size: 10, color: BENCH.muted });

        this.pixelBtn('暂停', 312, top + 3, 64, 42, () => { this.suspend(); });
        this.host.text(battle.isJammed ? '攻速降低' : battle.stationName, 312, top - 25,
            { width: 62, size: 10, bold: battle.isJammed, color: battle.isJammed ? PURPLE : BENCH.muted });

        // FIXED: Boss HP bar & live story radio anchored cleanly at TOP of playfield (never covered by bottom thumb!)
        const boss = battle.bossView;
        const chNarr = CHAPTER_NARRATIVES[battle.chapter.id];
        if (boss) {
            const by = FIELD.top - 48;
            benchPlate(g, 24, by, 312, 44, HUD_GLASS, boss.vulnerable ? GOLD : RED, 6);
            this.host.text(`${boss.title} · 阶段 ${boss.stage}`, 180, by + 33,
                { width: 296, size: 12, bold: true, color: boss.vulnerable ? GOLD : BENCH.paper });
            this.host.block(34, by + 19, 292, 5, BENCH.steel);
            this.host.block(34, by + 19, Math.round(292 * Math.max(0, boss.hp / boss.maxHp)), 5, boss.vulnerable ? GOLD : RED);
            if (boss.instruction) {
                this.host.text(boss.instruction, 180, by + 10, { width: 296, size: 11, bold: true, color: boss.vulnerable ? GREEN : GOLD });
            }
            // Show pivotal Wave-5 midTurn or Wave-12 bossIntro radio cleanly beneath Boss bar for first 4.5 seconds!
            if (battle.tick < 135 && !session.endlessMode && (battle.waveDef.wave === 5 || battle.waveDef.wave === 12)) {
                const beat = battle.waveDef.wave === 5 ? chNarr.midTurn : chNarr.bossIntro;
                const ry = by - 40;
                benchPlate(g, 20, ry, 320, 36, HUD_GLASS, GOLD, 6);
                const portrait = beat.speaker === '陈栖' ? 'radio-chenqi' : 'radio-aruan';
                this.host.skin?.uiIcon(portrait, 40, ry + 18, 28);
                this.host.text(`${beat.speaker}：${beat.line}`, 196, ry + 18, { left: true, width: 274, height: 32, size: 10, color: BENCH.paper });
            }
        } else if (battle.tick < 180 && !session.endlessMode) {
            // Station arrival story radio at top of arena
            const station = battle.chapter.stations[battle.waveDef.stationIndex];
            const radio = station.waves[0] === battle.waveDef.wave ? station.arriveRadio : undefined;
            if (radio) {
                const ry = FIELD.top - 42;
                benchPlate(g, 20, ry, 320, 36, HUD_GLASS, BENCH.edge, 6);
                const portrait = radio.startsWith('陈栖') ? 'radio-chenqi' : 'radio-aruan';
                this.host.skin?.uiIcon(portrait, 40, ry + 18, 28);
                this.host.text(radio, 196, ry + 18, { left: true, width: 274, height: 32, size: 10, color: BENCH.paper });
            }
        }

        // Lightweight Wave-1 onboarding tip in A-Ruan's voice: disappears once player starts moving!
        if (battle.waveDef.wave === 1 && needsShopOnboarding(this.profile) && this.movedTicksInWave < 20 && !boss) {
            const tipY = FIELD.bottom + 36;
            benchPlate(g, 24, tipY - 16, 312, 32, HUD_GLASS, GOLD, 5);
            const move = this.host.joystickMode ? '拖动摇杆' : this.host.tiltActive ? '轻倾手机' : '点按战场';
            this.host.text(move + '移动，武器会自动攻击。', 180, tipY,
                { width: 300, height: 30, size: 10, bold: true, color: GOLD });
        }
    }

    private drawReviveOffer(): void {
        const session = this.session;
        if (!session) { this.page = 'home'; return; }
        const g = this.host.ui;
        this.host.block(0, -HEIGHT, WIDTH, HEIGHT * 3, DARK_SCRIM);
        const cy = 320;
        benchPlate(g, 24, cy - 126, 312, 252, BENCH.steel, GOLD, 10);
        this.host.text('是否复活？', 180, cy + 90, { width: 280, size: 22, bold: true, color: GOLD });
        const waveNum = session.currentWaveDef.wave;
        this.host.text(
            `${session.chapter.title} · 第 ${waveNum} 波`,
            180, cy + 58, { width: 280, size: 12, color: CYAN },
        );
        const rescueDesc = session.isBossRevive
            ? '原地复活，回复 60% 生命并免伤 2 秒。\n清除敌弹和普通敌机，首领保留当前血量。'
            : '满血重打本波，保留已有装备和铜件。';
        this.host.text(rescueDesc, 180, cy + 16, { width: 280, height: 42, size: 12, color: BENCH.paper });
        this.rewardBtn(this.adVerb('复活'), 180, cy - 42, 256, 48, () => {
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
        this.pixelBtn('结束本局', 180, cy - 96, 256, 40, () => {
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
        const wave = this.session?.endlessMode ? `第 ${b.waveDef.wave} 波` : `第 ${b.waveDef.wave}/12 波`;
        this.host.text(`${this.session?.endlessMode ? '港区无尽' : b.chapter.title} · ${wave} · ${b.stationName}`, 180, cy + 68, { width: 276, size: 12, color: BENCH.muted });
        this.pixelBtn('继续战斗', 180, cy + 18, 250, 48, () => { this.paused = false; }, true);
        this.pixelBtn('设置', 180, cy - 42, 250, 44, () => {
            this.page = 'settings';
        });
        this.pixelBtn('返回值班室 · 保存进度', 180, cy - 100, 250, 44, () => {
            if (this.session) this.saveRun(this.session);
            this.paused = false;
            this.page = 'home';
            this.host.skin?.trimMemory();
            this.host.triggerGC?.();
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
            `${UI_COPY.shop.heading} · 第 ${view.wave + 1} 波前`,
            '‹ 值班室',
            () => { this.saveRun(session); this.page = 'home'; },
            '属性与羁绊',
            () => { this.showStatsDrawer = true; this.inspectWeaponSlot = null; },
        );
        const g = this.host.ui;

        // Wallet and health keep the same width with or without shop aid.
        const barY = top - 22;
        benchPlate(g, 16, barY - 14, 158, 30, BENCH.recess, BENCH.edge, 5);
        this.host.skin?.uiIcon('scrap', 32, barY + 1, 17);
        this.host.text(session.bagParts
            ? `可用铜件 ${view.parts}\n下波拾取时回收 ${session.bagParts}`
            : `可用铜件 ${view.parts}`, 106, barY + 1,
            { left: true, width: 116, height: 27, size: session.bagParts ? 10 : 13, bold: true, color: GOLD });

        benchPlate(g, 182, barY - 14, 162, 30, BENCH.recess, BENCH.edge, 5);
        this.host.text(`生命 ${session.currentHp}/${view.build.stats.maxHp} · ${view.level} 级`, 263, barY + 1,
            { width: 152, size: 12, bold: true, color: GREEN });

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
                    guideText = '点「合成升阶」，也可以保留两把。';
                } else {
                    guideStep = 'tap_slot';
                    guideText = '点下方带绿点的武器，查看合成。';
                }
            } else if (view.weapons.length === 1 && anyAffordableWeaponIdx >= 0) {
                guideStep = 'buy';
                guideText = '可以买高亮的武器。装备的武器会一起攻击。';
            } else {
                guideStep = 'ready';
                guideText = '买不起可以先留货，准备好就开始下一波。';
            }
            const gy = barY - 34;
            benchPlate(g, 16, gy - 12, 328, 26, BENCH.weapon.fill, GOLD, 5);
            this.host.text(guideText, 148, gy + 1, { left: true, width: 252, size: 10, bold: true, color: GOLD });
            this.pixelBtn('关闭提示', 310, gy + 1, 60, 20, () => {
                this.tutorialSkipped = true;
                this.saveWorkshop(markOnboardingDone(this.profile));
            });
        }

        const botY = Math.max(this.host.footer + 24, 48);
        const showShopAid = session.shopAidRemaining > 0 && this.canOfferAd();
        const gridTop = showGuide ? barY - 52 : barY - 22;
        const cardW = 158;
        const cardH = showGuide ? 106 : 114;
        const rowGap = showGuide ? 8 : 10;
        view.slots.forEach((slot, idx) => {
            const col = idx % 2;
            const row = Math.floor(idx / 2);
            const x = 16 + col * (cardW + 12);
            const y = gridTop - (row + 1) * cardH - row * rowGap;

            if (slot.sold) {
                benchPlate(g, x, y, cardW, cardH, BENCH.recess, BENCH.steel, 6);
                this.host.text('已购买', x + cardW / 2, y + cardH / 2, { size: 13, color: BENCH.muted });
                return;
            }
            const isWeapon = slot.kind === 'weapon';
            const weapon = isWeapon ? WEAPON_CATALOG[slot.itemId as ToolId] : undefined;
            const mod = !isWeapon ? MODULE_BY_ID[slot.itemId] : undefined;
            const name = weapon?.name ?? mod?.name ?? slot.itemId;
            const summary = weapon ? weapon.roleText : mod ? formatStatPreview(mod.stats, 4, mod.special) : '';
            benchPlate(g, x, y, cardW, cardH, TIER_FILL[slot.tier], slot.locked ? GOLD : TIER_EDGE[slot.tier], 6);

            // Top strip: tier badge + Lock toggle button
            this.host.text(isWeapon ? `武器 ${TIER_ROMAN[slot.tier]}` : TIER_NAME[slot.tier], x + 44, y + cardH - 12,
                { left: true, width: 78, size: 11, bold: true, color: TIER_EDGE[slot.tier] });
            if (slot.locked || view.lockCount < view.maxLocks) {
                this.pixelBtn(slot.locked ? '取消留货' : UI_COPY.shop.lock, x + cardW - 36, y + cardH - 13, 64, 20, () => {
                    if (session.toggleLock(idx)) {
                        this.shopFeedback = slot.locked ? '已取消留货。' : '已留货。刷新后仍保留，下波不涨价。';
                        this.saveRun(session);
                    }
                }, false, true, false, `留货:${slot.itemId}:${slot.tier}:${slot.locked}`);
            } else {
                this.host.text('留货已满', x + cardW - 36, y + cardH - 13, { width: 64, size: 10, color: BENCH.muted });
            }

            // Row 1: Icon + Item Name; Row 2 & 3: Full-width plain-Chinese Gain & Special/Cost lines!
            const iconKey = isWeapon ? slot.itemId : (MODULE_ICON[slot.itemId] ?? 'gear/pulse');
            const nameY = y + cardH - 32;
            this.host.skin?.uiIcon(iconKey, x + 22, nameY, showGuide ? 22 : 26);
            this.host.text(name + ' ›', x + 96, nameY, { left: true, width: 118, size: 13, bold: true, color: BENCH.paper });
            this.host.addTouch(x + cardW / 2, nameY - 7, cardW - 8, 33, 'detail-' + idx, () => {
                this.shelfItem = isWeapon ? Object.keys(WEAPON_CATALOG).indexOf(slot.itemId) : MODULE_CATALOG.findIndex(m => m.id === slot.itemId);
                this.shelfFromShop = true;
                this.page = isWeapon ? 'weapons' : 'equipment';
            });
            this.host.text(summary, x + cardW / 2, y + 45, { width: cardW - 12, height: 28, size: 11, color: isWeapon ? CYAN : GREEN });

            // Bottom one-tap Buy / Auto-merge button!
            const affordable = view.parts >= slot.price;
            const weaponBarFull = isWeapon && view.weapons.length >= MAX_WEAPONS && !slot.canAutoMerge;
            const canBuy = affordable && !weaponBarFull;
            const buyLabel = slot.canAutoMerge ? UI_COPY.shop.mergeBuy(slot.price) : UI_COPY.shop.buy(slot.price);
            const guideBuyTarget = guideStep === 'buy' && idx === anyAffordableWeaponIdx;
            if (canBuy) this.pixelBtn(buyLabel, x + cardW / 2, y + 16, cardW - 10, 24, () => {
                const res = session.buySlot(idx);
                if (res.ok) {
                    this.host.play('purchase');
                    this.shopFeedback = res.merged
                        ? `合成成功：${name}升到 ${TIER_ROMAN[(slot.tier + 1) as Tier]} 阶。`
                        : res.freeBuyoutReroll ? '本轮商品已买完，货架已免费补货。' : `已装备：${name}`;
                    this.saveRun(session);
                } else if (res.reason) {
                    this.shopFeedback = res.reason;
                }
            }, slot.canAutoMerge || guideBuyTarget, true, false, `买:${slot.itemId}:${slot.tier}:${buyLabel}`);
            else this.host.text(
                weaponBarFull ? `${slot.price} 铜件 · 武器栏已满` : `${slot.price} 铜件 · 还差 ${slot.price - view.parts}`,
                x + cardW / 2, y + 16, { width: cardW - 14, size: 11, color: BENCH.muted },
            );
            if (guideBuyTarget) this.drawGuidePulse(x, y, cardW, cardH, GOLD);
        });

        // 6 Weapon Slots Row with Tier Badges & Quick Merge/Sell Tray
        const rowY = gridTop - cardH * 2 - rowGap - 38;
        const slotW = 50;
        for (let i = 0; i < MAX_WEAPONS; i++) {
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
                this.host.addTouch(sx, rowY, slotW, 48, 'weapon-' + w.uid, () => {
                    this.shopFeedback = '';
                    this.inspectWeaponSlot = focused ? null : i;
                });
            } else {
                this.host.text('空槽', sx, rowY, { width: slotW, size: 10, color: BENCH.muted });
            }
        }

        // Active Synergies Strip OR Selected Weapon Quick Action Bar
        const infoY = rowY - 56;
        if (this.inspectWeaponSlot !== null && view.weapons[this.inspectWeaponSlot]) {
            const w = view.weapons[this.inspectWeaponSlot];
            const spec = WEAPON_CATALOG[w.id];
            benchPlate(g, 16, infoY - 16, 328, 42, BENCH.steel, TIER_EDGE[w.tier], 6);
            this.host.text(`${w.name} ${TIER_ROMAN[w.tier]} · 伤害 ${spec.tiers[w.tier - 1].damage}`, 96, infoY + 12,
                { left: true, width: 148, size: 12, bold: true, color: BENCH.paper });
            this.host.text(spec.tags.map(t => TAG_LABELS[t].slice(0, 2)).join('+'), 96, infoY - 5,
                { left: true, width: 148, size: 10, color: CYAN });
            if (w.canMergeWith !== null) {
                this.pixelBtn('合成升阶', 216, infoY + 5, 72, 30, () => {
                    if (session.mergeWeapons(this.inspectWeaponSlot!, w.canMergeWith!)) {
                        this.host.play('unlock');
                        this.shopFeedback = `合成成功：${w.name}升到 ${TIER_ROMAN[(w.tier + 1) as Tier]} 阶。`;
                        this.inspectWeaponSlot = null;
                        this.saveRun(session);
                    }
                }, true, true, false, 'merge-' + w.uid);
                if (guideStep === 'tap_merge') this.drawGuidePulse(180, infoY - 10, 72, 30, GOLD);
            }
            const canSell = view.weapons.length > 1;
            if (canSell) this.pixelBtn(UI_COPY.shop.sell(w.sellRefund), 298, infoY + 5, 76, 30, () => {
                const refund = session.sellWeapon(this.inspectWeaponSlot!);
                if (refund > 0) {
                    this.shopFeedback = `已拆解${w.name}，获得 ${refund} 铜件。`;
                    this.inspectWeaponSlot = null;
                    this.saveRun(session);
                }
            }, false, true, false, 'sell-' + w.uid);
            else this.host.text('须保留一把武器', 274, infoY + 5, { width: 126, size: 10, color: BENCH.muted });
            if (this.shopFeedback) {
                this.host.text(this.shopFeedback, 180, infoY - 28, { width: 308, size: 10, color: GOLD });
            }
        } else {
            const synText = view.build.synergies.map(s => s.name + ' ' + s.activeTier).join('   ');
            benchPlate(g, 16, infoY - 12, 328, 36, BENCH.recess, BENCH.edge, 5);
            this.host.text(synText, 180, infoY + 11, { width: 312, size: 12, color: BENCH.paper });
            const hasManualMerge = view.weapons.some(w => w.canMergeWith !== null);
            const storyBeat = !session.endlessMode ? shopStoryBeatHint(session.chapter.id, view.wave + 1) : null;
            const upcomingHint = session.endlessMode && session.waveIndex + 1 >= session.chapter.waves.length
                ? `下一波是港区第 ${session.waveIndex + 2} 波。`
                : storyBeat || session.chapter.waves[session.waveIndex + 1]?.hint || '';
            const hintMerge = hasManualMerge && !showGuide;
            const nextHint = this.shopFeedback || (hintMerge ? '点带绿点的武器，可以合成升阶。' : upcomingHint);
            this.host.text(nextHint, 180, infoY - 4, { width: 312, size: 10, color: this.shopFeedback || hintMerge || storyBeat ? GOLD : BENCH.muted });
        }

        if (showShopAid) {
            this.rewardBtn(this.adVerb(`领 ${SHOP_EMERGENCY_PARTS} 铜件`), 180, botY + 51, 192, 27, () => {
                this.triggerReward('shop_supply', () => {
                    if (session.grantShopAid()) {
                        this.host.play('purchase');
                        this.shopFeedback = `已领取 ${SHOP_EMERGENCY_PARTS} 铜件和 1 次免费刷新。`;
                        this.saveRun(session);
                    }
                });
            });
        }

        // Bottom Actions: Reroll (escalating/free) + Next Wave primary CTA
        const rerollLabel = UI_COPY.shop.reroll(view.nextRerollCost);
        const refreshable = hasRefreshableShopSlots(view.slots);
        const canReroll = refreshable && (view.freeRerollsLeft > 0 || view.parts >= view.nextRerollCost);
        if (canReroll) this.pixelBtn(rerollLabel, 88, botY, 144, 48, () => {
            if (session.reroll()) {
                this.shopFeedback = '商品已刷新。';
                this.saveRun(session);
            }
        }, view.freeRerollsLeft > 0);
        else this.host.text(refreshable ? `刷新还差 ${view.nextRerollCost - view.parts} 铜件` : '全已留货\n取消一件后可刷新',
            88, botY, { width: 140, height: 34, size: 11, color: BENCH.muted });

        const nextWaveNum = view.wave + 1;
        const isBossNext = session.endlessMode ? (nextWaveNum % 5 === 0 && nextWaveNum >= 15) || nextWaveNum === 12 : nextWaveNum === 12;
        this.pixelBtn(UI_COPY.shop.nextWave(nextWaveNum, isBossNext), 255, botY, 178, 48, () => {
            if (session.startNextWave()) {
                this.movedTicksInWave = 0;
                this.syncAudioSerials();
                if (showGuide && !this.profile.onboardingDone) {
                    const next = markOnboardingDone(this.profile);
                    this.persist(() => {
                        if (!this.profile.onboardingDone) {
                            if (!this.storage.saveProfile(next)) return false;
                            this.profile = next;
                        }
                        return this.storage.saveActiveRun(session);
                    });
                } else this.saveRun(session);
                this.page = 'battle';
                this.host.syncMusic(true);
            }
        }, true);
        if (guideStep === 'ready') this.drawGuidePulse(166, botY - 24, 178, 48, GOLD);
    }

    private drawLevelUpOverlay(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header(`${UI_COPY.shop.levelUpHeading} · ${view.level} 级`, '‹ 值班室', () => {
            this.saveRun(this.session!);
            this.page = 'home';
        }, `铜件 ${view.parts}`);
        const g = this.host.ui;
        const levelHint = needsShopOnboarding(this.profile)
            ? `阿阮：还可免费选 ${view.pendingLevelUps} 项，选完就能进商店。`
            : `还可选 ${view.pendingLevelUps} 项。5 级和 10 级的选项品质更高。`;
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
            this.pixelBtn('选择', 292, y + h / 2, 76, 44, () => {
                if (this.session!.chooseLevelUp(idx)) {
                    this.host.play('purchase');
                    this.saveRun(this.session!);
                }
            }, true);
        });

        const botY = Math.max(this.host.footer + 26, 52);
        const canRoll = view.parts >= view.levelUpRerollCost;
        const canBonusPick = this.session!.canUseLevelUpBonus && this.canOfferAd();
        const rerollX = canBonusPick ? 96 : 180;
        if (canRoll) {
            this.pixelBtn(UI_COPY.shop.levelUpReroll(view.levelUpRerollCost), rerollX, botY, canBonusPick ? 156 : 220, 46, () => {
                if (this.session!.rerollLevelUpOptions()) this.saveRun(this.session!);
            });
        } else {
            this.host.text(`换一批还差 ${view.levelUpRerollCost - view.parts} 铜件`,
                rerollX, botY, { width: 150, size: 11, color: BENCH.muted });
        }
        if (canBonusPick) {
            this.rewardBtn(this.adVerb('多选一项'), 264, botY, 156, 46, () => {
                this.triggerReward('levelup_extra', () => {
                    if (this.session!.grantLevelUpBonus()) {
                        this.host.play('unlock');
                        this.saveRun(this.session!);
                    }
                });
            }, true);
        }
    }

    private drawStatsDrawer(view: NonNullable<PatrolSession['shopView']>): void {
        this.backdrop();
        const top = this.header('属性与羁绊', '‹ 回商店', () => { this.showStatsDrawer = false; }, `${view.level}级`, undefined);
        const g = this.host.ui;

        this.host.text('当前羁绊', 84, top - 17, { left: true, width: 136, size: 15, bold: true, color: GOLD });
        let rowTop = top - 33;
        for (const syn of view.build.synergies) {
            const bonus = SYNERGY_TABLE[syn.tag].find(item => item.count === syn.activeTier);
            const height = bonus ? 54 : 30;
            const mid = rowTop - height / 2;
            this.host.block(16, rowTop - height, 328, height, bonus ? BENCH.weapon.fill : BENCH.recess);
            this.host.text(syn.name + ' ' + syn.activeTier, 55, mid, {
                left: true, width: 62, size: 14, bold: !!bonus, color: bonus ? GOLD : BENCH.muted,
            });
            if (bonus) {
                this.host.text(bonus.summary, 210, mid + 8, { left: true, width: 248, height: 31, size: 12, color: BENCH.paper });
                this.host.text(formatStatPreview(bonus.stats, 4), 210, mid - 15, { left: true, width: 248, size: 11, color: GREEN });
            } else {
                this.host.text('未激活', 210, mid, { left: true, width: 248, size: 12, color: BENCH.muted });
            }
            rowTop -= height + 3;
        }
        this.host.text('角色属性', 84, rowTop - 19, { left: true, width: 136, size: 15, bold: true, color: GOLD });
        const s = view.build.stats;
        const dr = Math.round((1 - armorDamageMultiplier(s.armor)) * 100);
        const rows: [string, string][] = [
            ['生命上限', `${s.maxHp}`], ['护甲', `${s.armor}（减伤 ${dr}%）`],
            ['物理伤害', `${s.torque}`], ['电热伤害', `${s.voltage}`],
            ['武器伤害', `${s.overclock >= 0 ? '+' : ''}${s.overclock}%`], ['攻击速度', `${s.cycleSpeed >= 0 ? '+' : ''}${s.cycleSpeed}%`],
            ['暴击率', `${s.critChance}%`], ['自动回血', `${(s.repair * 0.25).toFixed(1)}/秒`],
            ['铜件收益', String(s.salvage)], ['幸运', String(s.luck)],
            ['移动速度', `${s.moveSpeed >= 0 ? '+' : ''}${s.moveSpeed}%`],
            ['拾取范围', `${s.pickupRadius >= 0 ? '+' : ''}${s.pickupRadius}%`],
        ];
        rows.forEach(([k, v], i) => {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const rx = 16 + col * 168;
            const ry = rowTop - 48 - row * 26;
            benchPlate(g, rx, ry - 12, 160, 24, BENCH.steel, BENCH.edge, 5);
            this.host.text(k, rx + 42, ry, { left: true, width: 72, size: 11, color: BENCH.muted });
            this.host.text(v, rx + 116, ry, { width: 78, size: 11, bold: true, color: BENCH.paper });
        });


    }

    // ─────────────────────────── PAGE 5: WORKSHOP (FLAT, ZERO COLLISION!) ───────────────────────────

    private drawWorkshop(): void {
        this.backdrop();
        const backLabel = this.workshopReturn === 'prep' ? '‹ 出发准备'
            : this.workshopReturn === 'result' ? '‹ 战报' : '‹ 值班室';
        const top = this.header('工坊', backLabel, () => { this.page = this.workshopReturn; }, `凭证 ${this.profile.credits}`);
        const g = this.host.ui;

        const tabY = top - 22;
        const inTalents = this.workshopTab === 'talents';
        this.pixelBtn('永久升级', 102, tabY, 168, 34, inTalents ? null : () => { this.workshopTab = 'talents'; }, inTalents);
        this.pixelBtn('排除配件', 262, tabY, 144, 34, inTalents ? () => { this.workshopTab = 'bans'; } : null, !inTalents);

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
                this.host.text(maxed ? talent.detail(rank) : `升至 ${rank + 1} 级：${talent.detail(rank + 1)}`, 124, y + 22,
                    { left: true, width: 196, height: 30, size: 11, color: BENCH.muted });
                if (canBuy) this.pixelBtn(`升级 · ${cost} 凭证`, 286, y + cardH / 2, 92, 40, () => {
                    const next = buyWorkshopTalent(this.profile, talent.id);
                    if (next) {
                        this.saveWorkshop(next);
                        this.host.play('purchase');
                    }
                }, true);
                else this.host.text(maxed ? '已满级' : `还差 ${cost - this.profile.credits} 凭证`,
                    286, y + cardH / 2, { width: 92, size: 11, color: maxed ? GREEN : BENCH.muted });
            });
        } else {
            const limit = totalBanSlots(this.profile);
            const bonusBan = bonusBanSlotsForProfile(this.profile);
            const used = this.profile.bannedModules.length;
            const suffix = !limit ? ' · 在永久升级中解锁排除许可'
                : used >= limit ? ' · 取消一项后可继续排除'
                    : bonusBan > 0 ? ` · 含难度奖励 +${bonusBan}` : '';
            const banHead = `已排除 ${used}/${limit} 件${suffix}`;
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
                    ? `通关任意一章的难度 ${reqDanger} 后解锁`
                    : (formatStatPreview(mod.stats, 3, mod.special) || mod.flavor.slice(0, 18));
                this.host.text(sub, 124, y + 18,
                    { left: true, width: 196, size: 10, color: !unlocked ? GOLD : BENCH.muted });
                const canChange = unlocked && (banned || this.profile.bannedModules.length < limit);
                if (canChange) this.pixelBtn(banned ? '取消排除' : '排除', 290, y + cardH / 2, 82, 36, () => {
                    const next = toggleModuleBan(this.profile, mod.id);
                    if (next) this.saveWorkshop(next);
                });
            });
            const botY = Math.max(this.host.footer + 20, 44);
            if (this.banScroll > 0) this.pixelBtn('上一页', 82, botY, 104, 38, () => { this.banScroll -= pageSize; });
            if (this.banScroll + pageSize < MODULE_CATALOG.length) {
                this.pixelBtn('下一页', 278, botY, 104, 38, () => { this.banScroll += pageSize; });
            }
            this.host.text(`${Math.floor(this.banScroll / pageSize) + 1} / ${Math.ceil(MODULE_CATALOG.length / pageSize)} 页`,
                180, botY, { width: 76, size: 11, color: BENCH.muted });
        }
    }

    // ─────────────────────────── PAGE 6: LOG / ARCHIVE ───────────────────────────

    private drawLog(): void {
        this.backdrop();
        const top = this.header('值班日志', '‹ 返回', () => { this.page = 'home'; });
        const g = this.host.ui;
        const tabY = top - 22;
        const inArchive = this.logTab === 'archive';
        this.pixelBtn('章节档案', 100, tabY, 152, 34, inArchive ? null : () => { this.logTab = 'archive'; }, inArchive);
        this.pixelBtn('通关记录', 260, tabY, 152, 34, inArchive ? () => { this.logTab = 'records'; } : null, !inArchive);

        if (this.logTab === 'archive') {
            const chapter = CHAPTER_CATALOG[this.archiveIdx];
            const narr = CHAPTER_NARRATIVES[chapter.id];
            const unlocked = this.profile.clearedChapters.includes(chapter.id);
            const secretUnlocked = isSecretArchiveUnlocked(this.profile, chapter.id);
            const cardTop = tabY - 28;
            const hasEndingArt = unlocked && chapter.id === '04' && !!this.host.skin;
            const cardH = hasEndingArt ? 282 : unlocked ? 222 : 100;
            benchPlate(g, 16, cardTop - cardH, 328, cardH, BENCH.steel, BENCH.edge, 8);
            this.host.text(`第${'一二三四'[this.archiveIdx]}章 · ${chapter.title}`, 180, cardTop - 22,
                { width: 300, size: 17, bold: true, color: GOLD });
            this.host.text(narr.archiveTitle, 180, cardTop - 46, { width: 300, size: 13, bold: true, color: CYAN });

            if (unlocked) {
                if (hasEndingArt) this.host.skin?.dispatchArt(180, cardTop - 87, 'ending', 'stage-20', 56);
                const body = `${narr.archiveNote}\n\n${narr.clearOutro.speaker}：${narr.clearOutro.line}${narr.epilogueHook ? `\n${narr.epilogueHook.speaker}：${narr.epilogueHook.line}` : ''}`;
                this.host.text(body, 180, cardTop - (hasEndingArt ? 197 : 137),
                    { left: true, width: 296, height: 150, size: 11, color: BENCH.paper });
            } else {
                this.host.text('通关本章后可阅读完整记录。', 180, cardTop - 75,
                    { width: 296, size: 12, color: BENCH.paper });
            }

            const secTop = cardTop - cardH - 10;
            const secH = secretUnlocked ? 94 : 64;
            benchPlate(g, 16, secTop - secH, 328, secH, BENCH.recess, secretUnlocked ? GOLD : BENCH.edge, 5);
            if (secretUnlocked) {
                this.host.text(narr.secretTitle, 180, secTop - 17, { width: 296, size: 12, bold: true, color: GOLD });
                this.host.text(narr.secretNote, 180, secTop - 57, { left: true, width: 296, height: 62, size: 11, color: CYAN });
            } else {
                this.host.text('加密附件 · 未解锁', 180, secTop - 19, { width: 296, size: 12, bold: true, color: BENCH.muted });
                this.host.text('以难度 2（清退加急）或以上通关本章后解锁。', 180, secTop - 43,
                    { width: 296, height: 27, size: 11, color: GOLD });
            }

            const botY = Math.max(this.host.footer + 24, 52);
            if (this.archiveIdx > 0) this.pixelBtn('上一章', 82, botY, 112, 42, () => { this.archiveIdx--; });
            if (this.archiveIdx + 1 < CHAPTER_CATALOG.length) {
                this.pixelBtn('下一章', 278, botY, 112, 42, () => { this.archiveIdx++; });
            }
            this.host.text(`${this.archiveIdx + 1} / ${CHAPTER_CATALOG.length} 章`, 180, botY, { width: 80, size: 11, color: BENCH.muted });
        } else {
            const rowH = 59;
            const rowGap = 7;
            CHAPTER_CATALOG.forEach((ch, idx) => {
                const y = tabY - 26 - (idx + 1) * rowH - idx * rowGap;
                const cleared = this.profile.clearedChapters.includes(ch.id);
                const maxD = this.profile.maxDangerCleared[ch.id];
                benchPlate(g, 16, y, 328, rowH, BENCH.steel, maxD === 4 ? GOLD : cleared ? GREEN : BENCH.edge, 6);
                this.host.text(`第${'一二三四'[idx]}章 · ${ch.title}`, 180, y + 41,
                    { left: true, width: 308, size: 14, bold: true, color: BENCH.paper });
                this.host.text(
                    maxD !== undefined ? `最高通关 · 难度 ${maxD} · ${DANGER_MULTIPLIERS[maxD].label}`
                        : isChapterUnlocked(this.profile, ch.id) ? '未通关' : '未解锁',
                    180, y + 18,
                    { left: true, width: 308, size: 11, color: maxD !== undefined ? DANGER_COLOR[maxD] : BENCH.muted },
                );
            });

            const rigCardTop = tabY - 26 - CHAPTER_CATALOG.length * rowH - (CHAPTER_CATALOG.length - 1) * rowGap - 12;
            const rigCardH = 74;
            benchPlate(g, 16, rigCardTop - rigCardH, 328, rigCardH, BENCH.recess, BENCH.edge, 6);
            const endlessBest = this.profile.bestEndlessWave ?? 0;
            this.host.text('工装通关记录', 180, rigCardTop - 16, { width: 308, size: 12, bold: true, color: GOLD });
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
                    !unlocked ? '未解锁' : best !== undefined ? `难度 ${best} ✓` : '未通关',
                    bx + bw / 2, by + 10,
                    { width: bw - 4, size: 10, bold: best !== undefined, color: best !== undefined ? DANGER_COLOR[best] : BENCH.muted },
                );
            });
            if (endlessBest > 0) {
                const recordY = rigCardTop - rigCardH - 27;
                benchPlate(g, 16, recordY - 16, 328, 32, BENCH.recess, BENCH.edge, 6);
                this.host.text(`港区无尽 · 最高完成 ${endlessBest} 波`, 180, recordY, { width: 308, size: 12, color: GOLD });
            }
        }
    }

    // ─────────────────────────── PAGE 7: SETTINGS ───────────────────────────

    private drawSettings(): void {
        this.backdrop();
        const top = this.header('设置', this.paused ? '‹ 暂停' : '‹ 返回', () => { this.page = this.paused ? 'battle' : 'home'; });
        const s = this.host.settings;
        this.pixelBtn('音乐 ' + (s.music ? '开' : '关'), 94, top - 36, 148, 40, () => this.changeSettings({ music: !s.music }));
        this.pixelBtn('音效 ' + (s.sound ? '开' : '关'), 266, top - 36, 148, 40, () => this.changeSettings({ sound: !s.sound }));
        this.host.text('移动方式', 78, top - 90, { left: true, width: 120, size: 15, bold: true, color: GOLD });
        const modes = [['joystick', '固定摇杆'], ['touch', '点按战场'], ['tilt', '体感移动']] as const;
        modes.forEach(([movement, label], i) => {
            this.pixelBtn(label, 67 + i * 113, top - 132, 102, 42, () => {
                if (movement === 'tilt' && !this.host.tiltAvailable) this.showToast('请在支持体感的微信手机上使用。');
                else this.changeSettings({ movement });
            }, s.movement === movement);
        });
        if (s.movement === 'tilt') this.host.text('开战时自然握住手机，向想走的方向轻倾。', 180, top - 202,
            { width: 308, height: 40, size: 14, color: BENCH.paper });
        if (s.movement !== 'joystick') return;
        const placements = [['left', '靠左'], ['center', '居中'], ['right', '靠右']] as const;
        placements.forEach(([placement, label], index) => {
            this.pixelBtn(label, 67 + index * 113, top - 197, 102, 40,
                s.stickPlacement === placement ? null : () => this.changeSettings({ stickPlacement: placement }), s.stickPlacement === placement);
        });
        const marginRow = (label: string, key: 'sideMargin' | 'bottomMargin', y: number, max: number) => {
            const value = s[key];
            this.host.text(label, 66, y, { width: 96, left: true, size: 14, color: BENCH.paper });
            if (value > STICK_MARGIN.min) this.pixelBtn('−', 169, y, 50, 42,
                () => this.changeSettings({ [key]: Math.max(STICK_MARGIN.min, value - STICK_MARGIN.step) }));
            this.host.text(String(value), 236, y, { width: 60, size: 15, color: GOLD });
            if (value < max) this.pixelBtn('＋', 309, y, 50, 42,
                () => this.changeSettings({ [key]: Math.min(max, value + STICK_MARGIN.step) }));
        };
        marginRow('距底边', 'bottomMargin', top - 250, STICK_MARGIN.bottomMax);
        if (s.stickPlacement !== 'center') {
            marginRow(s.stickPlacement === 'left' ? '距左边' : '距右边', 'sideMargin', top - 301, STICK_MARGIN.sideMax);
        }
    }

    // ─────────────────────────── PAGE 8: RESULT WITH WEAPON DPS CHART ───────────────────────────

    private drawResult(): void {
        const res = this.result;
        if (!res) return;
        this.backdrop();
        if (this.showResultUnlocks) {
            const top = this.header('本局解锁', '‹ 回结算', () => { this.showResultUnlocks = false; });
            const rowH = Math.min(38, Math.floor((top - this.host.footer - 16) / Math.max(1, res.unlocks.length)));
            res.unlocks.forEach((unlock, idx) => {
                const y = top - 10 - (idx + 1) * rowH;
                benchPlate(this.host.ui, 16, y, 328, rowH - 4, BENCH.steel, BENCH.edge, 5);
                this.host.text(unlock, 180, y + (rowH - 4) / 2, {
                    left: true, width: 304, height: rowH - 6, size: 12, color: BENCH.paper,
                });
            });
            return;
        }
        const ending = res.won && !res.dailyShiftKey && res.chapterId === '04';
        const title = res.endlessMode ? '港区抢修结束'
            : ending ? UI_COPY.result.endingHeading
                : res.won ? res.dailyShiftKey ? '今日委托完成' : UI_COPY.result.wonHeading
                    : res.failure === 'timeout' ? '首领战超时' : UI_COPY.result.lostHeading;
        const top = this.header(
            title,
            '',
            undefined,
            `余额 ${this.profile.credits}`,
            undefined,
        );
        const g = this.host.ui;

        // Top summary card
        const sumTop = top - 8;
        const sumH = 62;
        benchPlate(g, 16, sumTop - sumH, 328, sumH, BENCH.recess, res.won ? GREEN : RED, 6);
        const elapsed = Math.round(res.totalDurationSeconds);
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const runKey = this.session?.runId ?? `${res.chapterId}:${res.wavesCleared}:${res.totalKills}`;
        const alreadyDoubled = this.resultDoubledRunId === runKey;
        const shownCredits = res.creditsEarned + (alreadyDoubled ? res.baseCreditsForDouble : 0);
        const cols: [string, string][] = [
            ['已完成波次', res.endlessMode ? `${res.wavesCleared} 波` : `${res.wavesCleared}/12`],
            ['击毁敌机', `${res.totalKills}`],
            ['用时', `${mins}分${secs}秒`],
            ['本局凭证', `+${shownCredits}`],
        ];
        cols.forEach(([k, v], i) => {
            const cx = 16 + (i + 0.5) * 82;
            this.host.text(k, cx, sumTop - 48, { width: 78, size: 11, color: BENCH.muted });
            this.host.text(v, cx, sumTop - 23, { width: 78, size: 16, bold: true, color: i === 3 ? GOLD : BENCH.paper });
        });

        const dateKey = todayDateKey();
        const doubleLeft = remainingDailyAdUses(this.profile, 'double', dateKey);
        const canDouble = !alreadyDoubled && res.baseCreditsForDouble > 0 && this.canOfferAd() && doubleLeft > 0;
        const hasUnlocks = res.unlocks.length > 0;
        const hasUnlockRow = hasUnlocks || res.firstClearBonus > 0;
        const hasCreditRow = canDouble || alreadyDoubled;
        const rewardRows = Number(hasUnlockRow) + Number(hasCreditRow);
        let nextTop = sumTop - sumH - 8;
        if (rewardRows > 0) {
            const rewardH = 9 + rewardRows * 28;
            benchPlate(g, 16, nextTop - rewardH, 328, rewardH, BENCH.weapon.fill, BENCH.edge, 6);
            if (hasUnlockRow) {
                const summary = res.firstClearBonus > 0 ? `首通额外 +${res.firstClearBonus} 凭证` : '本局解锁';
                this.host.text(summary, 109, nextTop - 19, { left: true, width: 166, size: 12, bold: true, color: GOLD });
                if (hasUnlocks) {
                    this.pixelBtn(`解锁 ${res.unlocks.length} 项 ›`, 272, nextTop - 19, 120, 22,
                        () => { this.showResultUnlocks = true; });
                }
            }
            const creditY = nextTop - (hasUnlockRow ? 47 : 19);
            if (canDouble) {
                this.host.text('基础奖励可翻倍', 109, creditY, { left: true, width: 166, size: 11, color: BENCH.muted });
                this.rewardBtn(this.adVerb(`再领 ${res.baseCreditsForDouble} 凭证`), 252, creditY, 160, 22, () => {
                    this.triggerReward('result_double', () => {
                        const consumed = consumeDailyAdUse(this.profile, 'double', dateKey);
                        if (!consumed) return;
                        const awarded: WorkshopProfile = { ...consumed, credits: consumed.credits + res.baseCreditsForDouble };
                        this.resultDoubledRunId = runKey;
                        this.saveWorkshop(awarded);
                        this.host.play('unlock');
                    });
                });
            } else if (alreadyDoubled) {
                this.host.text('基础奖励已翻倍', 109, creditY, { left: true, width: 166, size: 11, bold: true, color: GREEN });
            }
            nextTop -= rewardH + 8;
        }

        this.pixelBtn(this.showDamage ? '收起伤害统计' : '查看武器伤害', 180, nextTop - 23, 328, 42, () => { this.showDamage = !this.showDamage; });
        nextTop -= 54;
        if (this.showDamage) {
            const chartTop = nextTop;
            const weaponRows = res.damageByWeapon.slice(0, 6);
            const rowStep = weaponRows.length > 4 ? 19 : 24;
            const chartH = 30 + Math.max(1, weaponRows.length) * rowStep + 6;
            benchPlate(g, 16, chartTop - chartH, 328, chartH, BENCH.steel, BENCH.edge, 8);
            this.host.text(UI_COPY.result.damageChartTitle, 102, chartTop - 16, { left: true, width: 150, size: 13, bold: true, color: GOLD });
            if (!weaponRows.length) {
                this.host.text('本局暂无武器伤害记录', 180, chartTop - 41, { width: 304, size: 11, color: BENCH.muted });
            }
            const totalDmg = Math.max(1, res.damageByWeapon.reduce((s, w) => s + w.totalDamage, 0));
            weaponRows.forEach((w, idx) => {
                const wy = chartTop - 30 - rowStep * (idx + 0.5);
                const share = w.totalDamage / totalDmg;
                this.host.skin?.uiIcon(w.id, 34, wy, 17);
                this.host.text(`${WEAPON_CATALOG[w.id].name} ${TIER_ROMAN[w.tier]}`, 97, wy,
                    { left: true, width: 102, size: 11, color: BENCH.paper });
                this.host.block(154, wy - 4, 116, 8, BENCH.recess);
                if (share > 0) this.host.block(154, wy - 4, Math.max(2, Math.round(116 * share)), 8, TIER_EDGE[w.tier]);
                this.host.text(`${Math.round(share * 100)}%`, 306, wy, { width: 58, size: 11, bold: true, color: TIER_EDGE[w.tier] });
            });

        }

        // Human Outro Radio (with Harbor Epilogue on Chapter 4 clear!)
        if (!this.showDamage) {
            const radioTop = nextTop;
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

        }

        // Bottom CTA: Seamless push to Next Chapter, Next Danger tier, or instant Retry!
        const botY = Math.max(this.host.footer + 22, 48);
        const currentIdx = CHAPTER_CATALOG.findIndex(c => c.id === res.chapterId);
        const nextIdx = currentIdx + 1;
        const nextChapter = !res.endlessMode && !res.dailyShiftKey && res.won
            && nextIdx < CHAPTER_CATALOG.length && isChapterUnlocked(this.profile, CHAPTER_CATALOG[nextIdx].id)
            ? CHAPTER_CATALOG[nextIdx]
            : undefined;
        const nextDanger = !res.endlessMode && !res.dailyShiftKey && res.won
            && res.danger < 4 && isDangerUnlocked(this.profile, (res.danger + 1) as DangerLevel)
            ? ((res.danger + 1) as DangerLevel)
            : undefined;
        const selectPrep = (chapterIdx: number, danger: DangerLevel, mode: PrepMode) => {
            this.prepLoadout = false;
            this.chapterIdx = chapterIdx;
            this.danger = danger;
            this.prepMode = mode;
            this.rigIdx = RIG_ORDER.indexOf(res.rigId);
            this.supplyIdx = 0;
            if (this.session && !res.dailyShiftKey) this.starterByRig[res.rigId] = this.session.starterWeapon;
            this.page = 'prep';
        };
        if (res.dailyShiftKey) {
            this.pixelBtn('返回今日委托', 180, botY + 48, 328, 44,
                () => selectPrep(currentIdx, res.danger, 'daily'), true);
        } else if (nextChapter) {
            this.pixelBtn(UI_COPY.result.nextChapter(nextChapter.title) + ' ›', 180, botY + 48, 328, 44, () => {
                selectPrep(nextIdx, res.danger, 'story');
            }, true);
        } else if (nextDanger !== undefined) {
            this.pixelBtn(`挑战 · ${DANGER_MULTIPLIERS[nextDanger].label} ›`, 180, botY + 48, 328, 44, () => {
                selectPrep(currentIdx, nextDanger, 'story');
            }, true);
        } else if (!isRigUnlocked(this.profile, res.rigId)) {
            this.pixelBtn('重新整备', 180, botY + 48, 328, 44,
                () => selectPrep(currentIdx, res.danger, res.endlessMode ? 'endless' : 'story'), true);
        } else {
            this.pixelBtn(res.endlessMode ? '再挑战港区无尽' : UI_COPY.result.retry, 180, botY + 48, 328, 44, () => {
                this.startNewPatrol(res.chapterId, res.rigId, res.danger, 'none', this.session?.starterWeapon,
                    { endlessMode: res.endlessMode });
            }, true);
        }

        if (this.host.engage?.canShare) {
            const firstWeapon = res.damageByWeapon[0];
            const weaponLine = firstWeapon ? ` 主力武器：${WEAPON_CATALOG[firstWeapon.id].name}` : '';
            this.pixelBtn('返回值班室', 68, botY, 104, 40, () => { this.page = 'home'; });
            this.pixelBtn('工坊', 180, botY, 104, 40, () => this.openWorkshop('result'));
            this.pixelBtn('分享战报', 292, botY, 104, 40, () => {
                const title = res.endlessMode
                    ? `我在《夜班修理局》的港区无尽完成了 ${res.wavesCleared} 波。`
                    : res.won
                        ? `我在《夜班修理局》打通了「${res.chapterTitle}」。`
                        : `我在《夜班修理局》的「${res.chapterTitle}」完成了 ${res.wavesCleared} 波。`;
                const shared = this.host.engage?.shareResult(title + weaponLine,
                    `击毁 ${res.totalKills} 台敌机 · 难度 ${res.danger}`);
                if (!shared) this.showToast('暂时无法打开分享。');
            });
        } else {
            this.pixelBtn('返回值班室', 96, botY, 156, 40, () => { this.page = 'home'; });
            this.pixelBtn('工坊', 264, botY, 156, 40, () => this.openWorkshop('result'));
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

    private rewardBtn(label: string, x: number, y: number, w: number, h: number,
        action: () => void, primary = false, enabled = true): void {
        this.pixelBtn(label, x, y, w, h, action, primary, enabled, false, label, true);
    }

    get inputGuardUntil(): number { return this.touchGuardUntil; }

    private pixelBtn(
        label: string,
        x: number,
        y: number,
        w: number,
        h: number,
        action: (() => void) | null,
        primary = false,
        enabled = true,
        badge = false,
        key = label,
        reward = false,
    ): void {
        const held = enabled && action && this.host.addTouch(x, y, w, h, key, () => {
            if (Date.now() < this.touchGuardUntil) return;
            action();
        }, reward);
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
            battleVisible: this.battleVisible,
            paused: this.paused,
            tick: this.session?.battle?.tick,
            arcs: this.session?.battle?.effects.filter(e => e.shape === 'link').map(e => ({
                x: e.x, y: e.y, from: e.shape === 'link' ? e.from : null, hop: e.shape === 'link' ? e.hop : 0, life: e.life,
            })),
            player: this.session?.battle ? { x: this.session.battle.player.x, y: this.session.battle.player.y } : null,
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
        if (target === 'arc') {
            // A naturally occurring three-target shot. No live save or injected enemies.
            this.session = new PatrolSession({ chapterId: '01', rigId: 'high_voltage', seed: 13 });
            for (let i = 0; i < 709; i++) this.session.stepBattle(0, 0);
            this.page = 'battle';
            return;
        }
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
