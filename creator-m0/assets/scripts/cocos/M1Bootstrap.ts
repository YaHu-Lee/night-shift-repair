import {
    _decorator, Color, Component, EventTouch, Game, game, Graphics, Label, Mask, Node,
    MeshRenderer, Sprite, SpriteFrame, Texture2D, UITransform, Vec2, Vec3, primitives, profiler, screen, sys, view,
} from 'cc';
import { DEBUG } from 'cc/env';
import { Run } from '../m1/Run';
import type { Checkpoint } from '../m1/Run';
import { Campaign } from '../campaign/Campaign';
import type { TrainingTrack } from '../campaign/Campaign';
import { CampaignSettings } from '../campaign/CampaignSettings';
import type { CampaignPreferences } from '../campaign/CampaignSettings';
import { CampaignCloudSession } from '../campaign/CampaignCloudSession';
import { createCampaignCloud } from '../platform/campaignCloud';
import { BLUEPRINTS, COMMISSIONS, WORKSHOP_TIERS } from '../campaign/CampaignLedger';
import type { BlueprintId, ChallengeMode } from '../m1/Encounter';
import { clipTerrainReach, clipWarningReach } from '../m1/Encounter';
import { CAMPAIGN_CATALOG, CAMPAIGN_CHAPTERS, CAMPAIGN_MAP_HEIGHT, rulesForCampaign } from '../campaign/CampaignCatalog';
import type { CampaignStage } from '../campaign/CampaignCatalog';
import { campaignPressureRules, campaignWaveHint } from '../campaign/CampaignPressure';
import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';
import { createRewardedRevive } from '../platform/rewardedRevive';
import type { RewardedRevive } from '../platform/rewardedRevive';
import { FIELD, M2_RULES, MODS, REFRESH_COST, RUN_SEED, STARTER, TICK_RATE, TOOLS, TUNING_OPTIONS, attackReach, combatViewport, hasPair, isTool, offer } from '../m1/content';
import type { CombatBounds, EquippedTool, ModId, OfferId, Route, ToolId } from '../m1/content';
import { createEquipment, getEquipmentOffer, resolveEquipment, weaponAttachmentCapacity } from '../m1/Equipment';
import type { EquipmentOffer, EquipmentOfferId, EquipmentShop, EquipmentSlot, EquipmentStart, EquipmentTarget } from '../m1/Equipment';
import { equipmentDetail } from '../m1/EquipmentDetails';
import { BOSS_CHARGE_SPEED, BOSS_CHARGE_TICKS, CHARGER_DASH_TRAVEL, ENEMY_FIELD_MARGIN, type Battle } from '../m1/Battle';
import { drawSkillEffects } from './SkillEffectsView';
import { BattleSkinView } from './BattleSkinView';
import { PrototypeActorView } from './PrototypeActorView';
import { PrototypeDepotView } from './PrototypeDepotView';
import { PrototypeRouteView } from './PrototypeRouteView';
import { drawBossVolleyCue, drawCampaignEncounter, drawModeledTerrainSignals, drawPixelEnemyAim, drawPixelEnemyShells, drawPixelSpawn, drawPlayerHit } from './CampaignCombatView';
import { PIXEL_MENU_ART } from '../campaign/CampaignArt';
import { loadCampaignPixelTexture, loadCampaignTexture } from './CampaignAssetLoader';
import { drawDistrictProgress, drawRouteCable, drawRouteTerminal, ROUTE_STATION_EXTENT } from './CampaignMapView';
import type { RouteStationState } from './CampaignMapView';
import { drawCreditTicket, drawDispatchHandle, drawLobbyDial, drawLobbyScrim } from './CampaignLobbyView';
import type { LobbyShortcut } from './CampaignLobbyView';
import { CampaignAudio } from './CampaignAudio';
import type { Sound } from './CampaignAudio';
import { BENCH, benchLock, benchPlate, benchScrew } from './WorkshopBench';

const { ccclass, property, requireComponent } = _decorator;
const WIDTH = 360;
const HEIGHT = 640;
const STICK_RADIUS = 32;
const STICK_KNOB_RADIUS = 12;
const STICK_DEAD_ZONE = 5;
const STICK_ENTRY_DEPTH = 108;
const INK = new Color(12, 19, 27);
const FIELD_COLOR = new Color(18, 30, 42);
const GRID = new Color(29, 45, 58);
const PANEL = new Color(33, 49, 63);
const SELECTED = new Color(35, 87, 91);
const MASK = new Color(12, 19, 27, 243);
const PAPER = new Color(226, 237, 241);
const DIM = new Color(153, 180, 191);
const MINT = new Color(103, 224, 188);
const BLUE = new Color(103, 198, 243);
const AMBER = new Color(251, 199, 108);
const RED = new Color(241, 110, 96);
const PURPLE = new Color(193, 143, 249);
const ARMOR = new Color(159, 190, 196);
const BOSS = new Color(242, 132, 172);
const STOCK = new Color(232, 220, 190);
const STAMP = new Color(121, 70, 37);
const CABINET = new Color(20, 41, 44);
const RULE = new Color(63, 87, 88);
const PLATE = new Color(39, 64, 65);
const ENEMY_COLOR = { crawler: RED, charger: AMBER, turret: PURPLE, armored: ARMOR, inspector: BOSS,
    pursuer: AMBER, reclaimer: AMBER, jammer: PURPLE, ambusher: BLUE };
const MODE_LABEL = { normal: '普通出勤', overtime_1: '加班 I', overtime_2: '加班 II' };
const HIT_LABEL: Readonly<Record<string, string>> = {
    crawler: '慢爬虫', charger: '冲车撞击', turret: '炮台', armored: '护甲机',
    inspector: '巡检机', projectile: '炮台射击', 'boss-sweep': '巡检机扫线', 'boss-charge': '巡检机冲撞',
    'live-puddle': '带电积水', pursuer: '追击机', reclaimer: '回收爪', jammer: '干扰机', ambusher: '埋伏机',
    'chapter-hazard': '工单危险区',
};
const INSPECTOR_WARNING = { sweep: '绕到它身侧', charge: '往旁边躲', summon: '增援快到了',
    fan: '往旁边躲开炮弹', ring: '从弹缝穿过去' };
const PAIR_LABEL = { arc: '电弧连锁', magnet: '拾取震击', heat: '过热增伤' };
function visibleReach(bounds: CombatBounds, x: number, y: number, dx: number, dy: number, reach: number, margin = 0): number {
    const edgeX = dx > 0 ? bounds.right - margin : bounds.left + margin;
    const edgeY = dy > 0 ? bounds.top - margin : bounds.bottom + margin;
    return Math.max(0, Math.min(reach, dx ? (edgeX - x) / dx : Infinity, dy ? (edgeY - y) / dy : Infinity));
}
const VIEW_CENTER_X = (FIELD.left + FIELD.right) / 2;
const VIEW_CENTER_Y = (FIELD.bottom + FIELD.top) / 2;
const BOUNDARY_OVERSCAN = 18;
const qaHost = globalThis as typeof globalThis & {
    __nightShiftM1State?: () => object;
    __nightShiftM2State?: () => object;
    __nightShiftCampaignState?: () => object;
};
const FIRST_STAGE = CAMPAIGN_CATALOG[0];

const showcaseLoadouts = {
    bench: Object.keys(TOOLS).filter(isTool),
    floating: ['wrench', 'arc_gun'],
    held: ['wrench', 'arc_gun'],
    armory: ['wrench', 'bypass_wrench', 'arc_gun', 'riveter', 'torch', 'induction'],
    utility: ['wrench', 'arc_gun', 'hydraulic_nailer', 'pulse_nozzle', 'traction_coil', 'split_probe'],
} as const satisfies Record<string, readonly ToolId[]>;

function showcasePlatform(): Platform {
    const data = new Map<string, string>();
    return makePlatform({ document: globalThis.document, localStorage: {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => { data.set(key, value); },
    } });
}
const MAP_HEIGHT = CAMPAIGN_MAP_HEIGHT;
const STATION_EDGE_GAP = 6;
const HANDOFF_SECONDS = 0.64;
const CHAPTER_LINKS: Readonly<Record<string, string>> = {
    '02': '货运支线', '03': '医院广播', '04': '本地旁路',
};
const PUDDLE_WARNING = new Color(251, 199, 108, 60);
const PUDDLE_ACTIVE = new Color(241, 110, 96, 130);
type CampaignStart = { stage: CampaignStage; route: Route; starter: ToolId; runId: string; seed: number; blueprint: BlueprintId | null; mode: ChallengeMode; supplies: number; loadout: EquipmentStart };
type WeaponUnlock = { runId: string; tool: ToolId; elapsed: number; announced: boolean };
type CampaignError = 'read' | 'register' | 'start' | 'reward' | 'receipt';
type ChapterHandoff = { next: CampaignStage; leg: 'depart' | 'arrive' | 'ready'; elapsed: number; from: number; to: number };
const GUEST_CAMPAIGN_RUN_PREFIX = 'night-shift.campaign.run.';

interface HitArea {
    left: number;
    right: number;
    bottom: number;
    top: number;
    action: () => void;
}
interface TextOptions { size?: number; color?: Color; width?: number; height?: number; left?: boolean; bold?: boolean }

@ccclass('M1Bootstrap')
@requireComponent(UITransform)
export class M1Bootstrap extends Component {
    @property
    fullRun = false;

    @property
    campaignMode = false;

    @property
    prototypeArt = false;

    @property
    skinRoot = 'skins/workshop';

    @property
    reviveAdUnitId = '';

    @property
    wechatReviveAdUnitId = '';

    @property
    cloudEnvId = '';

    @property
    cloudServiceId = '';

    private cloud?: CampaignCloudSession;
    private stopCloudOnline?: () => void;
    private retryCloudVerification = false;
    private cloudBusy = false;
    private cloudMessage = '';
    private confirmedCloudScope?: string;
    private campaignRunPrefix = GUEST_CAMPAIGN_RUN_PREFIX;

    private reviveAd: RewardedRevive | null = null;
    private loggedReviveOffer?: string;
    private watchingRevive = false;
    private reviveFeedback?: 'unavailable' | 'incomplete';
    private reviveDecision?: { run: Run; runId: string; revision: number; rewarded: boolean; attempted: boolean };
    private run!: Run;
    private skin?: BattleSkinView;
    private prototypeLayer?: Node;
    private prototypeGround?: Node;
    private prototypeDepot?: PrototypeDepotView;
    private prototypeRoute?: PrototypeRouteView;
    private prototypeActors?: PrototypeActorView;
    private readonly battleOffset = new Vec2();
    private flatFloor?: Graphics;
    private flatBounds?: CombatBounds;
    private skinFloor!: Node;
    private actorSprites!: Node;
    private backdrop?: Sprite;
    private upperMap?: Sprite;
    private readonly scenery: Partial<Record<string, SpriteFrame>> = {};
    private readonly pendingScenery = new Set<string>();
    private readonly missingScenery = new Set<string>();
    private mapChapter = 0;
    private mapOffset = MAP_HEIGHT - HEIGHT;
    private mapPositions: (number | null)[] = [];
    private mapPlatform?: ReturnType<typeof makePlatform>;
    private mapGesture?: { id: number; x: number; y: number; offset: number; dragged: boolean };
    private mapPadding = 0;
    private mapBounds: readonly [number, number] = [0, HEIGHT];
    private mapCleared = 0;
    private freight?: { cleared: number; startedAt: number };
    private chapterHandoff?: ChapterHandoff;
    private backdropScale = 1;
    private embers?: Graphics;
    private emberTime = 0;
    private beacon?: { x: number; y: number };
    private campaign?: Campaign;
    private campaignPage: 'home' | 'settings' | 'map' | 'brief' | 'switch' | 'workshop' | 'equipment' | 'role' | 'difficulty' | 'cloud' | null = null;
    private selectedStage = FIRST_STAGE;
    private switchRoute: Route = 'arc';
    private loadoutMode: ChallengeMode = 'normal';
    private runMode: ChallengeMode = 'normal';
    private workshopTab: 'station' | 'archive' | 'commissions' = 'station';
    private weaponUnlock?: WeaponUnlock;
    private tuningPage = false;
    private workshopFromResult = false;
    private equipmentTab: 'weapon' | 'blueprints' | 'station' = 'weapon';
    private growthBack: 'home' | 'workshop' = 'home';
    private trainingWeapon: ToolId = 'wrench';
    private archiveIndex = 0;
    private archiveKind: 'receipt' | 'radio' | 'clue' = 'receipt';
    private stage = FIRST_STAGE;
    private startWeapon: CampaignStart['starter'] = 'wrench';
    private queuedStart?: CampaignStart;
    private campaignError?: CampaignError;
    private readonly reconciledRuns = new Set<string>();
    private puddles?: Graphics;
    private threats?: Graphics;
    private base!: Graphics;
    private surface!: UITransform;
    private art!: Graphics;
    private skillEffects!: Graphics;
    private ui!: Graphics;
    private labelLayer!: Node;
    private readonly labels: Label[] = [];
    private readonly actions: HitArea[] = [];
    private readonly location = new Vec2();
    private readonly worldPoint = new Vec3();
    private readonly localPoint = new Vec3();
    private movementTouch: number | null = null;
    private lastAim?: Vec2;
    private stickOrigin?: Vec2;
    private readonly stickAxis = new Vec2();
    private stickView?: Graphics;
    private press: { id: number; area: HitArea; inside: boolean } | null = null;
    private learnedMove = false;
    private receipt = '';
    private selection: OfferId | null = null;
    private slot = 0;
    private replacement: ModId | undefined;
    private equipmentSelection: EquipmentOfferId | null = null;
    private equipmentTarget?: EquipmentTarget;
    private equipmentFocus = 0;
    private equipmentDetails?: { kind: 'offer' } | { kind: 'equipped'; id: EquipmentOfferId; weapon?: number };
    private equipmentOverlay?: { graphics: Graphics; labels: Label[]; icon: Sprite };
    private chooseRoute = false;
    private visibleUi = '';
    private labelIndex = 0;
    private top = 607;
    private capsuleCeiling = HEIGHT;
    private footer = 34;
    private layout = '';
    private audio?: CampaignAudio;
    private soundEnabled = true;
    private settings?: CampaignSettings;
    private settingsError = false;
    private musicSuspended = false;
    private weaponShowcase?: keyof typeof showcaseLoadouts;
    private benchTool: ToolId = 'wrench';
    private benchModified = false;
    private previewBattle?: Battle;
    private weaponTick = 0;

    onLoad(): void {
        this.surface = this.node.getComponent(UITransform)!;
        this.surface.setContentSize(WIDTH, HEIGHT);
        this.base = this.node.addComponent(Graphics);
        this.drawBackground();
        const previewQuery = DEBUG && sys.isBrowser ? new URLSearchParams(globalThis.location.search) : undefined;
        const showcase = previewQuery?.get('weaponShowcase');
        if (this.campaignMode && (showcase === 'bench' || showcase === 'floating' || showcase === 'held' || showcase === 'armory' || showcase === 'utility')) {
            this.weaponShowcase = showcase;
            const selected = previewQuery?.get('tool') ?? '';
            if (isTool(selected)) this.benchTool = selected;
            this.benchModified = previewQuery?.get('special') === '1';
        }
        const prototypeSetting = previewQuery?.get('prototype3d');
        const modelArt = !this.weaponShowcase && typeof MeshRenderer === 'function' && !!primitives?.sphere && prototypeSetting !== '0'
            && (!this.campaignMode || this.prototypeArt || prototypeSetting === '1');
        const world = this.campaignMode ? this.battleViewport() : this.node;
        const floor = this.skinFloor = this.layer('Ground', world);
        if (this.campaignMode) this.flatFloor = this.layer('Open arena floor', world).addComponent(Graphics);
        if (modelArt) this.prototypeGround = this.layer('Arena backdrop', world);
        if (this.campaignMode) {
            this.puddles = this.layer('EncounterSignals', world).addComponent(Graphics);
        }
        const actors = this.layer('Actors', world);
        this.actorSprites = new Node('Actor sprites and shadows');
        this.actorSprites.layer = actors.layer;
        actors.addChild(this.actorSprites);
        const clip = this.layer('SkillBounds', world);
        let effects = clip;
        if (!this.campaignMode) {
            clip.setPosition(FIELD.left - WIDTH / 2, FIELD.bottom - HEIGHT / 2, 0);
            const bounds = clip.addComponent(UITransform);
            bounds.setAnchorPoint(0, 0);
            bounds.setContentSize(FIELD.right - FIELD.left, FIELD.top - FIELD.bottom);
            clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
            effects = new Node('SkillEffects');
            effects.layer = clip.layer;
            clip.addChild(effects);
            effects.setPosition(-FIELD.left, -FIELD.bottom, 0);
        }
        this.skillEffects = effects.addComponent(Graphics);
        if (this.campaignMode && !modelArt) {
            this.threats = this.layer('ThreatEdges', world).addComponent(Graphics);
        }
        this.art = this.layer('CombatSignals', world).addComponent(Graphics);
        this.art.node.setPosition(0, 0, 0);
        if (this.campaignMode) {
            const node = this.layer('CampaignScenery');
            node.setPosition(0, 0, 0);
            this.backdrop = node.addComponent(Sprite);
            this.backdrop.sizeMode = Sprite.SizeMode.CUSTOM;
            const upper = this.layer('ChapterUpperMap');
            upper.setPosition(0, 0, 0);
            this.upperMap = upper.addComponent(Sprite);
            this.upperMap.sizeMode = Sprite.SizeMode.CUSTOM;
            this.embers = this.layer('SceneryEffects').addComponent(Graphics);
        }
        this.ui = this.layer('Overlay').addComponent(Graphics);
        if (this.campaignMode) this.stickView = this.layer('MovementControl').addComponent(Graphics);
        const uiSprites = this.layer('InterfaceArt');
        this.labelLayer = this.layer('Labels');
        if ((this.fullRun || modelArt) && this.skinRoot) {
            this.skin = new BattleSkinView(this.skinRoot, floor, this.actorSprites, uiSprites, () => { this.visibleUi = ''; }, this.campaignMode, modelArt);
        }
        if (modelArt) this.prototypeLayer = actors;
        if (this.campaignMode) {
            if (!modelArt) this.loadScenery('night-depot');
            this.settings = new CampaignSettings(this.weaponShowcase ? showcasePlatform() : undefined);
            this.soundEnabled = this.settings.current.sound;
            this.reviveAd = createRewardedRevive({ douyin: this.reviveAdUnitId, wechat: this.wechatReviveAdUnitId });
            this.loadCampaign();
            const cloud = this.run.platform.kind === 'douyin' ? createCampaignCloud(this.cloudEnvId, this.cloudServiceId) : null;
            if (cloud) {
                this.cloud = new CampaignCloudSession(cloud);
                void this.restoreCloud();
            }
        }
        else {
            this.run = new Run(undefined, this.fullRun ? M2_RULES : undefined);
            this.chooseRoute = !this.run.data;
        }
        if (this.fullRun || this.campaignMode) this.audio = new CampaignAudio(this.node, this.campaignMode, sys.isBrowser,
            retry => this.scheduleOnce(retry, 1));
        if (this.weaponShowcase) this.beginCampaignRun('arc');
        if (DEBUG) {
            profiler?.hideStats();
            qaHost[this.campaignMode ? '__nightShiftCampaignState' : this.fullRun ? '__nightShiftM2State' : '__nightShiftM1State'] = this.inspect;
            this.trace('ready');
        }
        this.draw();
    }

    onEnable(): void {
        this.musicSuspended = false;
        this.syncMusic();
        this.node.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        game.on(Game.EVENT_HIDE, this.onGameHide, this);
        game.on(Game.EVENT_SHOW, this.onGameShow, this);
        this.stopCloudOnline = this.cloud?.onOnline(() => this.onCloudOnline());
    }

    onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
        this.stopCloudOnline?.();
        this.stopCloudOnline = undefined;
        this.musicSuspended = true;
        this.syncMusic();
        this.suspend();
    }

    onDestroy(): void {
        this.cloud?.invalidate();
        this.reviveAd?.dispose();
        this.audio?.dispose();
        this.prototypeActors?.dispose();
        this.prototypeDepot?.destroy();
        this.prototypeRoute?.destroy();
        this.skin?.dispose();
        for (const asset of Object.keys(this.scenery)) this.releaseScenery(asset);
        if (qaHost.__nightShiftM1State === this.inspect) delete qaHost.__nightShiftM1State;
        if (qaHost.__nightShiftM2State === this.inspect) delete qaHost.__nightShiftM2State;
        if (qaHost.__nightShiftCampaignState === this.inspect) delete qaHost.__nightShiftCampaignState;
        this.run.dispose();
    }

    update(dt: number): void {
        if (this.reviveDecision && !this.reviveDecision.attempted && !this.run.background) this.finishRevive();
        this.advanceChapterHandoff(dt);
        const unlock = this.activeWeaponUnlock;
        if (unlock && !this.run.background) {
            unlock.elapsed = Math.min(1.2, unlock.elapsed + dt);
            if (!unlock.announced) {
                unlock.announced = true;
                this.play('unlock');
            }
        }
        if ((this.campaignPage === 'home' || this.campaignPage === 'settings' || this.campaignPage === 'map') && this.embers && !this.campaignError) {
            const previous = Math.floor(this.emberTime * 15);
            this.emberTime += dt;
            if (Math.floor(this.emberTime * 15) !== previous) this.drawMotes(this.embers);
        }
        if ((this.run.paused || this.run.background) && this.movementTouch !== null) this.cancelMovement();
        const before = this.run.data;
        const battle = this.run.battle;
        const warnings = battle?.warningSerial;
        const damage = battle?.damageTaken;
        const missionCue = battle?.missionCue;
        const cuts = battle?.cutSerial;
        const weaponAttacks = battle?.weaponAttackSerial;
        const enemyAttacks = battle?.enemyAttackSerial;
        const weaponImpacts = battle?.weaponImpactSerial;
        const triggers = this.fullRun ? battle && { ...battle.triggers } : null;
        if (!this.campaign || (!this.campaignPage && !this.chooseRoute && !this.campaignError && this.currentCampaignRun())) {
            this.run.advance(dt, this.stickAxis.x, this.stickAxis.y);
        }
        if (battle && (!this.run.battle || this.run.waitingForSave) && this.movementTouch !== null) this.cancelMovement();
        if (this.fullRun && battle) {
            if (battle.warningSerial !== warnings) this.play(battle.warningKind);
            if (battle.damageTaken !== damage) this.play('hit');
            const cue = battle.missionCue;
            if (cue && cue !== missionCue) this.play(cue.kind);
            if (battle.cutSerial !== cuts) this.play('cut');
            if (this.campaignMode) {
                if (battle.weaponAttackSerial !== weaponAttacks) this.play(battle.weaponAttackCue);
                if (battle.enemyAttackSerial !== enemyAttacks) this.play(battle.enemyAttackCue);
                if (battle.weaponImpactSerial !== weaponImpacts) this.play('impact');
            }
            if (triggers) {
                for (const tag of ['arc', 'magnet', 'heat'] as const) {
                    if (battle.triggers[tag] !== triggers[tag]) this.trace('build_trigger', { tag, count: battle.triggers[tag] });
                }
            }
        }
        if (this.run.data !== before) {
            this.clearInput();
            this.selection = null;
            this.traceOutcome();
            this.reconcileCampaignResult();
        }
        this.syncMusic();
        this.draw();
    }

    private loadCampaign(): void {
        const campaign = this.campaign = this.cloud?.binding?.campaign ?? new Campaign(this.weaponShowcase ? showcasePlatform() : undefined);
        const prefix = this.cloud?.binding?.runPrefix ?? GUEST_CAMPAIGN_RUN_PREFIX;
        this.reconciledRuns.clear();
        this.chapterHandoff = undefined;
        this.weaponUnlock = undefined;
        this.tuningPage = false;
        this.campaignRunPrefix = prefix;
        this.mapPlatform = this.weaponShowcase ? showcasePlatform() : makePlatform(undefined, prefix + 'map-view');
        this.mapPositions = this.mapPlatform.readCheckpoint<(number | null)[]>(1, value =>
            Array.isArray(value) && value.length <= CAMPAIGN_CHAPTERS.length && value.every(offset => offset === null
                || (typeof offset === 'number' && Number.isFinite(offset)))) ?? [];
        const pending = campaign.profile.pendingAttempt;
        if (pending) {
            const stage = CAMPAIGN_CATALOG.find(candidate => candidate.id === pending.stageId);
            if (stage && campaign.isUnlocked(stage.id)) {
                this.loadCampaignStage(stage, pending.mode);
                if (this.run.data?.runId === pending.runId) {
                    if (!campaign.commitAttempt(this.run.data)) {
                        this.campaignError = 'register';
                        return;
                    }
                } else if (!campaign.abortAttempt()) {
                    this.campaignError = 'register';
                    return;
                }
            } else if (!campaign.abortAttempt()) {
                this.loadCampaignStage(FIRST_STAGE);
                this.campaignError = 'register';
                return;
            }
        }
        const active = campaign.profile.activeAttempt;
        const activeStage = CAMPAIGN_CATALOG.find(stage => stage.id === active?.stageId);
        const availableStage = this.nextMapStage(campaign);
        this.loadCampaignStage(activeStage && campaign.isUnlocked(activeStage.id) ? activeStage : availableStage, active?.mode);
        this.campaignPage = 'home';
        if (campaign.profileState === 'unreadable') this.campaignError = 'read';
        else if (this.currentCampaignRun()) {
            this.chooseRoute = false;
            if (!campaign.enableWorkshopForActive(this.run.data)) {
                this.campaignError = 'register';
                return;
            }
            this.reconcileCampaignResult();
        }
        this.focusMap(activeStage && this.unfinishedRun ? activeStage : this.nextMapStage(campaign));
    }

    private loadCampaignStage(stage: CampaignStage, mode: ChallengeMode = 'normal', platform?: Platform): void {
        if (this.watchingRevive) this.reviveAd?.cancel();
        this.watchingRevive = false;
        this.reviveFeedback = undefined;
        this.reviveDecision = undefined;
        this.run?.dispose();
        this.stage = stage;
        this.selectedStage = stage;
        this.runMode = mode;
        this.skin?.setStage(stage.id, stage.arena);
        const namespace = this.campaignRunPrefix + stage.id + (mode === 'normal' ? '' : '.' + mode);
        const base = rulesForCampaign(stage, stage.id === FIRST_STAGE.id ? mode : 'normal');
        const added = this.weaponShowcase ? showcaseLoadouts[this.weaponShowcase].filter(tool => !base.tools.includes(tool)) : [];
        const rules = added.length ? { ...base, tools: [...base.tools, ...added] } : base;
        this.run = new Run(platform ?? (this.weaponShowcase ? showcasePlatform() : makePlatform(undefined, namespace)), rules, {
            offerRevive: !!this.reviveAd,
            clearByKills: true,
            rulesForEquipment: (selectedMode, clearByKills) => campaignPressureRules(stage.id, rules, selectedMode, clearByKills),
            shopWeapons: () => this.campaign!.availableShopWeapons(stage.id),
        });
        this.clearEquipmentSelection();
        this.equipmentFocus = 0;
        this.chooseRoute = true;
        this.startWeapon = this.defaultStarter(stage);
        this.campaignError = undefined;
        this.queuedStart = undefined;
        this.learnedMove = false;
        this.receipt = '';
        this.clearInput();
        this.selection = null;
        this.visibleUi = '';
    }

    private currentCampaignRun(): boolean {
        const active = this.campaign?.profile.activeAttempt;
        return !!active && active.stageId === this.stage.id && active.runId === this.run.data?.runId;
    }

    private defaultStarter(stage: CampaignStage): ToolId {
        const reward = CAMPAIGN_CATALOG.find(candidate => candidate.id === stage.prerequisite)?.firstClearWeapon;
        return reward && this.campaign?.canUseStarter(stage.id, reward) ? reward : 'wrench';
    }

    private get unfinishedRun(): boolean {
        return this.currentCampaignRun() && (this.run.data?.phase === 'battle' || this.run.data?.phase === 'shop' || this.run.canRevive);
    }

    private openStage(stage: CampaignStage): void {
        if (!this.campaign?.isUnlocked(stage.id)) return;
        if (stage.id === this.stage.id && this.unfinishedRun) {
            this.campaignPage = null;
            this.chooseRoute = false;
            this.startWeapon = this.run.data?.tools[0].id ?? 'wrench';
            if (this.run.data?.phase === 'battle') this.run.resume();
            return;
        }
        this.selectedStage = stage;
        this.startWeapon = this.defaultStarter(stage);
        this.loadoutMode = 'normal';
        this.campaignPage = 'brief';
    }

    private beginCampaignRun(route: Route): void {
        const seed = this.weaponShowcase ? RUN_SEED : Math.floor(Math.random() * 0x100000000);
        const stage = this.selectedStage;
        const campaign = this.campaign!;
        this.queuedStart = { stage, route, starter: this.startWeapon, runId: campaign.newAttemptId(stage.id, seed), seed,
            mode: this.loadoutMode, blueprint: campaign.profile.selectedBlueprint,
            supplies: WORKSHOP_TIERS[campaign.workshopTier].supplies, loadout: campaign.trainingLoadout(this.startWeapon, route) };
        this.commitCampaignStart();
    }

    private commitCampaignStart(): void {
        const pending = this.queuedStart;
        if (!this.campaign || !pending) return;
        const campaign = this.campaign;
        if (!campaign.canUseStarter(pending.stage.id, pending.starter)
            || !campaign.prepareAttempt(pending.stage.id, pending.runId, { blueprint: pending.blueprint, mode: pending.mode })) {
            this.campaignError = 'register';
            return;
        }
        if (pending.stage.id !== this.stage.id || pending.mode !== this.runMode) {
            this.loadCampaignStage(pending.stage, pending.mode);
            this.queuedStart = pending;
        }
        this.startWeapon = pending.starter;
        if (this.run.data?.runId !== pending.runId) {
            this.run.start(pending.route, pending.seed, pending.starter, pending.runId, pending.blueprint ?? undefined,
                pending.mode, pending.supplies, pending.loadout);
            if (this.weaponShowcase) this.equipShowcaseTools(pending.stage, pending.mode);
        }
        if (this.run.storageFailed || this.run.data?.runId !== pending.runId) {
            this.run.pause();
            this.campaignError = 'start';
            return;
        }
        if (!campaign.commitAttempt(this.run.data)) {
            this.run.pause();
            this.campaignError = 'register';
            return;
        }
        this.run.resume();
        this.campaignError = undefined;
        this.queuedStart = undefined;
        this.campaignPage = null;
        this.chooseRoute = false;
        this.clearInput();
        this.selection = null;
        this.tuningPage = false;
        this.clearEquipmentSelection();
        this.equipmentFocus = 0;
        this.receipt = '';
        this.trace('run_start');
        this.campaignTrace('stage_start');
        this.campaignTrace('weapon_equip', { slot: 0, weapon: pending.starter });
    }

    private equipShowcaseTools(stage: CampaignStage, mode: ChallengeMode): void {
        const { data, platform } = this.run;
        if (!data?.equipment || this.run.storageFailed || !this.weaponShowcase) return;
        if (this.weaponShowcase === 'bench') {
            const weapon = this.benchTool;
            const kit = createEquipment(weapon, this.benchModified ? {
                starterAttachment: `${weapon}/signature`, unlockedAttachments: [`${weapon}/signature`],
            } : {});
            if (!kit || !platform.writeCheckpoint(data.schemaVersion, { ...data, ...kit, wave: 2 })) return;
            this.loadCampaignStage(stage, mode, platform);
            return;
        }
        const tools = showcaseLoadouts[this.weaponShowcase].map((id): EquippedTool => ({
            id, mods: [], attachments: Array(weaponAttachmentCapacity(data.equipment!, id)).fill(null),
        }));
        // Wave three is the first point with the extra slots unlocked.
        if (!platform.writeCheckpoint(data.schemaVersion, { ...data, wave: 2, tools })) return;
        // The preview uses the normal checkpoint loader on a page-local store.
        this.loadCampaignStage(stage, mode, platform);
    }

    private reconcileCampaignResult(): void {
        const data = this.run.data;
        if (!this.campaign || !data || (data.phase !== 'won' && data.phase !== 'lost') || !this.currentCampaignRun()
            || this.run.waitingForSave || this.run.storageFailed || this.reconciledRuns.has(data.runId)) return;
        const outcome = this.campaign.replayResult(this.stage.id, data);
        if (outcome === 'storage-failed') this.campaignError = 'reward';
        else if (outcome === 'not-eligible') this.campaignError = 'receipt';
        else {
            this.reconciledRuns.add(data.runId);
            this.campaignError = undefined;
            this.trace('receipt_reconciled', { outcome });
            this.campaignTrace('stage_end', { reason: data.finishReason, revived: data.revived === true });
            const receipt = this.campaign.receipt(data.runId);
            if (outcome === 'committed' && receipt?.firstClear) {
                this.campaignTrace('first_clear', { reward: receipt.weapon });
                if (receipt.weapon && isTool(receipt.weapon)) {
                    this.weaponUnlock = { runId: data.runId, tool: receipt.weapon, elapsed: 0, announced: false };
                } else if (this.stage.chapterEnd) this.play('restored');
            }
            if (this.cloud?.binding) void this.syncCloud();
        }
    }

    private get activeWeaponUnlock(): WeaponUnlock | undefined {
        const unlock = this.weaponUnlock;
        return unlock && !this.campaignPage && !this.campaignError && !this.cloudBusy && this.run.data?.phase === 'won'
            && this.run.data.runId === unlock.runId && this.currentCampaignRun() ? unlock : undefined;
    }

    private suspend(): void {
        this.clearInput();
        this.run?.pause();
    }

    private onGameHide(): void {
        this.musicSuspended = true;
        this.syncMusic();
        this.suspend();
        if (this.cloud) {
            this.cloud.invalidate();
            this.confirmedCloudScope = undefined;
            this.cloudBusy = true;
        }
    }

    private onGameShow(): void {
        this.suspend();
        this.musicSuspended = false;
        this.scheduleOnce(() => this.syncMusic(), 0);
        this.layout = '';
        if (this.cloud) void this.restoreCloud();
    }

    private async restoreCloud(): Promise<void> {
        const cloud = this.cloud;
        if (!cloud) return;
        this.retryCloudVerification = false;
        this.cloudBusy = true;
        const result = await cloud.restore();
        if (!this.isValid || result.status === 'stale') return;
        this.cloudBusy = false;
        if (result.status === 'bound') {
            if (this.campaign !== result.binding.campaign) this.loadCampaign();
            void this.syncCloud();
        } else {
            this.retryCloudVerification = result.status === 'unavailable';
            if (result.status !== 'guest') this.cloudMessage = '已打开游客档。云档需要重新验证账号。';
            // Full-screen platform ads can trigger hide/show during an ordinary guest run.
            if (this.campaignRunPrefix !== GUEST_CAMPAIGN_RUN_PREFIX) this.loadCampaign();
        }
    }

    private onCloudOnline(): void {
        if (!this.cloud || this.cloudBusy || this.run.background) return;
        if (this.cloud.binding) void this.syncCloud();
        else if (this.retryCloudVerification && this.campaignPage === 'home') void this.restoreCloud();
    }

    private readonly continueCloudOffline = (): void => {
        this.cloud?.invalidate();
        this.retryCloudVerification = false;
        this.confirmedCloudScope = undefined;
        this.cloudBusy = false;
        this.cloudMessage = '已打开本机游客档。可到维修站重新验证账号。';
        if (this.campaignRunPrefix !== GUEST_CAMPAIGN_RUN_PREFIX) this.loadCampaign();
        else if (this.campaignPage === 'cloud') this.campaignPage = 'workshop';
    };

    private async syncCloud(): Promise<void> {
        const outcome = await this.cloud?.sync();
        if (!this.isValid || this.cloudBusy) return;
        if (outcome === 'account-changed') {
            this.cloudMessage = '抖音账号换了，先用游客档。';
            this.loadCampaign();
        } else if (outcome === 'synced' || outcome === 'pending') {
            this.cloudMessage = outcome === 'synced' ? '备份完成。' : '进度已存本机，同步还没完成。';
        }
    }

    private play(sound: Sound): void {
        if (this.soundEnabled && !this.musicSuspended && !this.run.background) this.audio?.play(sound);
    }

    private syncMusic(gesture = false): void {
        const wanted = this.settings?.current.music && !this.musicSuspended && !this.run?.background;
        const inCombat = !this.campaignPage && !this.campaignError && !this.cloudBusy && !!this.run?.battle;
        this.audio?.syncMusic(wanted ? (inCombat ? 'combat' : 'workshop') : undefined, gesture);
    }

    private updateSettings(patch: Partial<CampaignPreferences>): boolean {
        if (!this.settings) return false;
        this.settingsError = !this.settings.update(patch);
        this.visibleUi = '';
        if (!this.settingsError) {
            this.soundEnabled = this.settings.current.sound;
            if (patch.movement) this.cancelMovement();
            this.syncMusic();
        }
        return !this.settingsError;
    }

    private traceOutcome(): void {
        const data = this.run.data;
        if (!this.fullRun || !data) {
            this.trace('phase');
            return;
        }
        this.trace('wave_end');
        if (data.phase === 'lost' && data.finishReason === 'defeated') this.trace('death');
        if (data.phase === 'lost' || data.phase === 'won') this.trace('run_end');
        const firstChapterClear = data.phase === 'won' && this.stage.chapterEnd && this.campaign
            && !this.campaign.profile.clearedStages.includes(this.stage.id);
        if (data.phase === 'shop' || (data.phase === 'won' && !firstChapterClear)) this.play('clear');
    }

    private clearInput(): void {
        if (this.press) this.visibleUi = '';
        this.mapGesture = undefined;
        this.cancelMovement();
        this.press = null;
    }

    private cancelMovement(): void {
        this.movementTouch = null;
        this.lastAim = undefined;
        this.stickOrigin = undefined;
        this.stickAxis.set(0, 0);
        if (this.run?.battle) this.run.battle.destination = null;
    }

    private get joystickMode(): boolean { return this.settings?.current.movement === 'joystick'; }
    private get stickX(): number {
        const x = this.stickOrigin?.x ?? WIDTH / 2;
        return Math.min(WIDTH - STICK_RADIUS - 4, Math.max(STICK_RADIUS + 4, x));
    }

    private get stickY(): number {
        return Math.max(this.footer + 16, this.stickOrigin?.y ?? this.footer + 16);
    }

    private steerStick(point: Vec3): void {
        if (!this.stickOrigin) return;
        const dx = point.x - this.stickOrigin.x, dy = point.y - this.stickOrigin.y;
        const distance = Math.hypot(dx, dy);
        const magnitude = Math.max(0, Math.min(1, (distance - STICK_DEAD_ZONE) / (STICK_RADIUS - STICK_DEAD_ZONE)));
        const step = magnitude / (distance || 1);
        this.stickAxis.set(dx * step, dy * step);
        if (magnitude) this.learnedMove = true;
    }

    private point(event: EventTouch): Vec3 {
        event.getUILocation(this.location);
        this.worldPoint.set(this.location.x, this.location.y, 0);
        const point = this.surface.convertToNodeSpaceAR(this.worldPoint, this.localPoint);
        point.x += WIDTH / 2;
        point.y += HEIGHT / 2;
        return point;
    }

    private contains(area: HitArea, x: number, y: number): boolean {
        return x >= area.left && x <= area.right && y >= area.bottom && y <= area.top;
    }

    private touchStart(event: EventTouch): void {
        if (this.run.background) return;
        const point = this.point(event);
        if (!this.cloudBusy && this.campaignPage === 'map'
            && !this.mapGesture && point.y >= this.mapBounds[0] && point.y <= this.mapBounds[1]) {
            this.mapGesture = { id: event.getID(), x: point.x, y: point.y, offset: this.mapOffset, dragged: false };
        }
        const area = this.actions.find(candidate => (!this.cloudBusy || candidate.action === this.continueCloudOffline)
            && this.contains(candidate, point.x, point.y));
        if (area && !this.press) {
            this.press = { id: event.getID(), area, inside: true };
            this.visibleUi = '';
            return;
        }
        if (this.cloudBusy || this.campaignPage || this.chooseRoute || this.campaignError || this.run.paused || !this.run.battle
            || this.run.waitingForSave || this.movementTouch !== null) return;
        if (this.joystickMode) {
            if (point.y < Math.max(8, this.footer - 16) || point.y > FIELD.bottom + STICK_ENTRY_DEPTH) return;
            this.run.battle.destination = null;
            this.stickOrigin = new Vec2(point.x, point.y);
            this.movementTouch = event.getID();
            this.stickAxis.set(0, 0);
            return;
        }
        if (point.x < FIELD.left || point.x > FIELD.right || point.y < FIELD.bottom || point.y > FIELD.top) return;
        this.movementTouch = event.getID();
        this.aimAt(point);
        this.learnedMove = true;
    }

    private aimAt(point: Vec3): void {
        const x = Math.min(FIELD.right, Math.max(FIELD.left, point.x));
        const y = Math.min(FIELD.top, Math.max(FIELD.bottom, point.y));
        if (this.lastAim && Math.hypot(x - this.lastAim.x, y - this.lastAim.y) < 0.5) return;
        (this.lastAim ??= new Vec2()).set(x, y);
        this.run.battle?.moveTo(x + this.battleOffset.x, y + this.battleOffset.y);
    }

    private dragMap(event: EventTouch): boolean {
        const gesture = this.mapGesture;
        if (!gesture || gesture.id !== event.getID()) return false;
        const point = this.point(event);
        const delta = point.y - gesture.y;
        if (!gesture.dragged && Math.hypot(point.x - gesture.x, delta) <= 8) return false;
        gesture.dragged = true;
        this.chapterHandoff = undefined;
        this.press = null;
        this.mapOffset = this.clampMap(gesture.offset + delta);
        this.visibleUi = '';
        return true;
    }

    private touchMove(event: EventTouch): void {
        if (this.dragMap(event)) return;
        if (this.press?.id === event.getID()) {
            const point = this.point(event);
            const inside = this.contains(this.press.area, point.x, point.y);
            if (inside !== this.press.inside) this.visibleUi = '';
            this.press.inside = inside;
            return;
        }
        if (event.getID() !== this.movementTouch || this.run.paused || this.run.background) return;
        const point = this.point(event);
        if (this.joystickMode) this.steerStick(point);
        else this.aimAt(point);
    }

    private touchEnd(event: EventTouch): void {
        if (!this.run.background) this.syncMusic(true);
        if (this.mapGesture?.id === event.getID()) {
            if (this.dragMap(event)) this.rememberMap();
            this.mapGesture = undefined;
        }
        if (event.getID() === this.movementTouch) {
            if (this.joystickMode) {
                this.cancelMovement();
                return;
            }
            this.movementTouch = null;
            if (!this.run.paused && !this.run.background) this.aimAt(this.point(event));
            this.lastAim = undefined;
            return;
        }
        if (this.press?.id !== event.getID()) return;
        const area = this.press.area;
        this.press = null;
        this.visibleUi = '';
        const point = this.point(event);
        // A verification may finish or begin between pressing and releasing.
        if (!this.run.background && this.cloudBusy === (area.action === this.continueCloudOffline)
            && this.contains(area, point.x, point.y)) {
            if (this.campaignPage === 'map') this.chapterHandoff = undefined;
            area.action();
            this.syncMusic();
            if (this.campaign) this.draw();
        }
    }

    private touchCancel(event: EventTouch): void {
        if (this.mapGesture?.id === event.getID()) {
            if (this.mapGesture.dragged) this.rememberMap();
            this.mapGesture = undefined;
        }
        if (event.getID() === this.movementTouch) this.cancelMovement();
        if (this.press?.id === event.getID()) {
            this.press = null;
            this.visibleUi = '';
        }
    }

    private battleViewport(): Node {
        const mask = new Node('Battle viewport');
        mask.layer = this.node.layer;
        this.node.addChild(mask);
        mask.setPosition(VIEW_CENTER_X - WIDTH / 2, VIEW_CENTER_Y - HEIGHT / 2, 0);
        mask.addComponent(UITransform).setContentSize(FIELD.right - FIELD.left, FIELD.top - FIELD.bottom);
        mask.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const content = new Node('Battle layers');
        content.layer = this.node.layer;
        mask.addChild(content);
        content.setPosition(WIDTH / 2 - VIEW_CENTER_X, HEIGHT / 2 - VIEW_CENTER_Y, 0);
        return content;
    }

    private layer(name: string, parent = this.node): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        parent.addChild(node);
        node.setPosition(-WIDTH / 2, -HEIGHT / 2, 0);
        return node;
    }

    private text(value: string, x: number, y: number, options: TextOptions = {},
        layer = this.labelLayer, labels = this.labels, index = this.labelIndex++): void {
        let label = labels[index];
        if (!label) {
            const node = new Node('Text');
            node.layer = this.node.layer;
            layer.addChild(node);
            label = node.addComponent(Label);
            if (this.campaignMode) label.fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif';
            labels.push(label);
        }
        label.node.active = true;
        label.node.setPosition(x, y, 0);
        const size = options.size ?? 14;
        label.fontSize = size;
        label.lineHeight = size + 5;
        label.color = options.color ?? PAPER;
        label.isBold = !!options.bold;
        label.horizontalAlign = options.left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
        label.overflow = options.width ? Label.Overflow.SHRINK : Label.Overflow.NONE;
        if (options.width) label.node.getComponent(UITransform)!.setContentSize(options.width, options.height ?? 29);
        label.string = value;
    }

    private block(left: number, bottom: number, width: number, height: number, color: Color, graphics = this.ui): void {
        graphics.fillColor = color;
        graphics.rect(left, bottom, width, height);
        graphics.fill();
    }

    private control(x: number, y: number, width: number, height: number,
        action: () => void, active = true, accent = false, primary = false, flat = false): void {
        const left = x - width / 2;
        const bottom = y - height / 2;
        const held = !!this.press?.inside && this.press.area.left === left && this.press.area.bottom === bottom;
        if (this.campaignMode) {
            const fill = active && primary ? (held ? STOCK : AMBER) : held || (active && accent) ? SELECTED : flat ? CABINET : PLATE;
            this.block(left, bottom, width, height, held || accent ? MINT : primary && active ? STAMP : RULE);
            this.block(left + 1, bottom + 1, width - 2, height - 2, fill);
            if (accent && active && !primary) this.block(left, bottom, 3, height, MINT);
        } else if (flat || !this.skin?.panel(x, y, width, height, active, accent, held, primary)) {
            this.ui.fillColor = active && primary ? AMBER : held ? GRID : accent && active ? SELECTED : PANEL;
            this.ui.roundRect(left, bottom, width, height, 7);
            this.ui.fill();
        }
        if (active) this.actions.push({ left, right: left + width, bottom, top: bottom + height, action });
    }

    private button(value: string, x: number, y: number, width: number, height: number,
        action: () => void, active = true, accent = false, primary = false): void {
        this.control(x, y, width, height, action, active, accent, primary);
        this.text(value, x, y, { color: !active ? DIM : primary ? INK : PAPER, width: width - 12, height: height - 4,
            bold: this.campaignMode && primary });
    }

    private draw(): void {
        const battle = this.run.battle;
        const data = this.run.data;
        const page = this.campaignError || this.cloudBusy ? null : this.campaignPage;
        const sceneryPage = page === 'home' || page === 'settings' || page === 'map';
        if (!sceneryPage) {
            // Home and the route map use their own art; prepare the controls and battle assets on a dispatch page.
            if (this.campaignMode && !this.cloudBusy && !this.campaignError) {
                this.audio?.prepareCombat();
                this.skin?.prepare();
            }
            this.drawField();
        } else if (this.prototypeActors) {
            this.prototypeActors.dispose();
            this.prototypeActors = undefined;
        }
        const frame = screen.windowSize;
        const scale = Math.max(1e-6, view.getScaleY());
        const layout = `${frame.width}:${frame.height}:${scale}:${page === 'map'}`;
        if (layout !== this.layout) {
            this.layout = layout;
            const insets = this.run.platform.getSafeInsets();
            const letterbox = Math.max(0, (frame.height / scale - HEIGHT) / 2);
            const backdropHeight = HEIGHT + 2 * letterbox;
            this.backdropScale = backdropHeight / HEIGHT;
            this.mapPadding = page === 'map' ? letterbox : 0;
            this.surface.setContentSize(WIDTH, HEIGHT + 2 * this.mapPadding);
            this.visibleUi = '';
            const pixelRatio = screen.devicePixelRatio;
            const unusedMargin = letterbox - this.mapPadding;
            const visibleTop = HEIGHT + this.mapPadding;
            this.top = Math.floor(Math.min((this.fullRun ? 589 : 607) + this.mapPadding,
                visibleTop - Math.max(0, insets.top * pixelRatio / scale - unusedMargin) - 27));
            this.capsuleCeiling = insets.menuBottom === undefined ? visibleTop
                : Math.floor(visibleTop - Math.max(0, insets.menuBottom * pixelRatio / scale - unusedMargin) - 8);
            this.footer = Math.ceil(Math.max(34, insets.bottom * pixelRatio / scale - unusedMargin + 16) - this.mapPadding);
            if (page === 'map') this.mapOffset = this.clampMap(this.mapOffset);
        }
        if (this.embers) this.embers.node.active = sceneryPage;
        const workshopPage = page === 'equipment' || page === 'role';
        const worksheetPhase = !page && !this.chooseRoute && !this.run.waitingForSave && this.currentCampaignRun()
            && (data?.phase === 'won' || data?.phase === 'lost' || data?.phase === 'revive' || (data?.phase === 'shop' && !!data.equipment));
        const workbench = this.campaignMode && !this.campaignError && !this.cloudBusy && (workshopPage || worksheetPhase);
        this.drawScenery(page === 'settings' ? 'home' : page === 'home' || page === 'map' ? page : workbench ? 'bench' : null);
        this.drawStick(this.joystickMode && !!battle && !this.campaignPage && !this.cloudBusy && !this.campaignError
            && !this.chooseRoute && !this.run.paused && !this.run.background && !this.run.waitingForSave);
        const clearProgress = battle?.clearProgress;
        const seconds = battle && !clearProgress ? Math.ceil((battle.duration - battle.tick) / TICK_RATE) : 0;
        let waveCue: string | undefined;
        if (battle?.counterattackStarting) waveCue = '另一队赶来了';
        else if (battle && clearProgress && !battle.enemies.length) {
            if (battle.warnings.length) waveCue = '敌机快到了';
            else if (!battle.mission && clearProgress.kills > 0 && clearProgress.kills < clearProgress.total) waveCue = '还有增援';
        }
        const radio = battle ? this.battleRadio(battle.wave, battle.tick) : undefined;
        const unlock = this.activeWeaponUnlock;
        const signature = JSON.stringify([
            data?.runId, data?.revision, battle?.player.hp, seconds, clearProgress, waveCue, battle?.collected, battle?.magnetCharge,
            battle?.triggers.arc, battle?.triggers.magnet, battle?.triggers.heat, this.run.paused,
            this.run.waitingForSave, this.run.storageFailed, this.selection, this.slot, this.replacement, this.chooseRoute,
            this.tuningPage, this.equipmentSelection, this.equipmentTarget, this.equipmentFocus, this.equipmentDetails,
            unlock ? Math.floor(unlock.elapsed * 24) : null,
            this.campaign ? [this.campaignPage, this.selectedStage.id, this.stage.id, this.campaignError, this.startWeapon, this.currentCampaignRun(), this.campaign.profile.revision, this.mapChapter, this.mapOffset, this.loadoutMode,
                this.workshopTab, this.workshopFromResult, this.archiveIndex, this.archiveKind, this.equipmentTab, this.growthBack, this.trainingWeapon] : null,
            this.top, this.footer, battle?.boss?.unit.hp, battle?.boss?.phase, battle?.boss?.attack,
            battle?.shielded, this.soundEnabled, this.settings?.current, this.settingsError, this.learnedMove, this.receipt, this.watchingRevive,
            this.reviveDecision?.attempted, this.reviveDecision?.rewarded, this.reviveFeedback,
            this.cloudBusy, this.cloudMessage, this.confirmedCloudScope,
            battle?.mission?.label, battle?.mission?.status, battle?.mission?.integrity?.hp, battle?.mission?.escort?.hp,
            battle?.chapterBoss?.hp, battle?.chapterBoss?.instruction, !!battle?.practiceWarning, radio,
        ]);
        if (signature === this.visibleUi) return;
        this.visibleUi = signature;
        this.actions.length = 0;
        this.labelIndex = 0;
        this.ui.clear();
        if (this.equipmentOverlay) this.equipmentOverlay.graphics.node.active = false;
        this.embers?.clear();
        this.skin?.beginUi();
        if (this.cloudBusy) {
            this.cover();
            this.text('正在验证抖音账号', 180, 366, { size: 21, bold: true });
            this.button('用游客档继续', 180, 290, 226, 48, this.continueCloudOffline);
        } else if (this.campaignError) this.drawCampaignError();
        else if (this.campaignPage === 'home') this.drawHome();
        else if (this.campaignPage === 'settings') this.drawSettings();
        else if (this.campaignPage === 'map') this.drawRoadmap();
        else if (this.campaignPage === 'switch') this.drawSwitchStage();
        else if (this.campaignPage === 'workshop') this.drawWorkshop();
        else if (this.campaignPage === 'equipment') this.drawEquipment();
        else if (this.campaignPage === 'role') this.drawRoleTraining();
        else if (this.campaignPage === 'difficulty') this.drawDifficulty();
        else if (this.campaignPage === 'cloud') this.drawCloud();
        else if (this.campaignPage === 'brief') this.drawCampaignBrief();
        else if (this.campaign && (this.chooseRoute || !this.currentCampaignRun())) this.drawCampaignBrief();
        else if (this.chooseRoute || !data) this.drawRoutes();
        else if (this.run.waitingForSave) this.drawStorageError();
        else if (data.phase === 'revive') this.drawRevive();
        else if (data.phase === 'shop') {
            const equipment = this.run.equipmentShop;
            const tuning = this.run.tuning;
            if (equipment) this.drawEquipmentShop(equipment);
            else if (this.tuningPage && tuning) this.drawTuning(tuning);
            else this.drawShop();
        }
        else if (data.phase === 'won' || data.phase === 'lost') {
            if (unlock) this.drawWeaponUnlock(unlock);
            else if (this.campaign) this.drawCampaignResult(data.phase === 'won');
            else this.drawResult(data.phase === 'won');
        } else this.drawBattleHud(seconds, clearProgress, waveCue);
        if (sceneryPage && this.embers) this.drawMotes(this.embers);
        if (this.run.storageFailed && !this.run.waitingForSave && !this.campaignError) {
            this.text('本次进度未保存', 180, Math.max(this.footer, 24), { color: AMBER, size: 13 });
        }
        for (let index = this.labelIndex; index < this.labels.length; index++) this.labels[index].node.active = false;
        this.skin?.endUi();
    }

    private drawBackground(): void {
        const art = this.base;
        art.fillColor = INK;
        art.rect(-180, -320, WIDTH, HEIGHT);
        art.fill();
        art.fillColor = FIELD_COLOR;
        art.roundRect(FIELD.left - 180, FIELD.bottom - 320, FIELD.right - FIELD.left, FIELD.top - FIELD.bottom, 8);
        art.fill();
        if (this.campaignMode) return;
        art.fillColor = GRID;
        for (let x = 30; x < FIELD.right - 8; x += 24) art.rect(x - 180, FIELD.bottom - 319, 1, 398);
        for (let y = 169; y < FIELD.top - 8; y += 24) art.rect(FIELD.left - 178, y - 320, 326, 1);
        art.fill();
    }

    private followBattle(battle: Readonly<Battle> | null, models: boolean): void {
        const field = battle?.field ?? FIELD;
        const scrolling = this.campaignMode && !!battle && field !== FIELD;
        const view = scrolling ? combatViewport(field, battle.player.x, battle.player.y, BOUNDARY_OVERSCAN) : FIELD;
        const x = view.left - FIELD.left, y = view.bottom - FIELD.bottom;
        this.battleOffset.set(x, y);
        this.actorSprites.setPosition(-x, -y, 0);
        this.art.node.setPosition(-x, -y, 0);
        const pixelFloor = this.campaignMode && battle && !models && this.skin?.drawPixelFloor(field);
        this.skinFloor.active = !scrolling || !!pixelFloor;
        this.skinFloor.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        if (!this.flatFloor || !this.puddles) return;
        this.puddles.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        this.skillEffects.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        this.threats?.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        this.flatFloor.node.active = scrolling && !models && !pixelFloor;
        if (!this.flatFloor.node.active) return;
        this.flatFloor.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
        if (this.flatBounds === field) return;
        this.flatBounds = field;
        const floor = this.flatFloor;
        const { left, right, bottom, top } = field;
        const width = right - left, height = top - bottom;
        floor.clear();
        floor.fillColor = FIELD_COLOR;
        floor.rect(left, bottom, width, height);
        floor.fill();
        floor.fillColor = GRID;
        for (let xx = left + 24; xx < right; xx += 24) floor.rect(xx, bottom, 1, height);
        for (let yy = bottom + 24; yy < top; yy += 24) floor.rect(left, yy, width, 1);
        floor.fill();
        floor.strokeColor = RULE;
        floor.lineWidth = 3;
        floor.rect(left, bottom, width, height);
        floor.stroke();
    }

    private drawField(): void {
        const art = this.art;
        art.clear();
        const battle = this.run.battle;
        const modelBattle = this.prototypeLayer && !this.campaignPage
            && (!this.campaignMode || this.currentCampaignRun()) ? battle : null;
        this.followBattle(this.campaignPage ? null : battle, !!modelBattle);
        this.drawPuddles(battle, !!modelBattle);
        if (modelBattle && this.prototypeLayer) {
            if (this.prototypeDepot || this.prototypeRoute) {
                if (this.backdrop) this.backdrop.spriteFrame = null;
                this.prototypeDepot?.destroy();
                this.prototypeRoute?.destroy();
                this.prototypeDepot = undefined;
                this.prototypeRoute = undefined;
            }
            this.prototypeActors ??= new PrototypeActorView(this.prototypeLayer, this.prototypeGround);
        }
        this.prototypeActors?.draw(modelBattle, this.stage.id, this.battleOffset);
        if (battle && (this.previewBattle !== battle || (!this.run.paused && !this.run.background))) {
            this.weaponTick = battle.tick + this.run.frameFraction;
        }
        this.previewBattle = battle ?? undefined;
        const floatingTick = this.campaignMode && battle && !modelBattle && this.weaponShowcase !== 'held'
            ? this.weaponTick : undefined;
        this.skin?.drawWorld(battle, !!modelBattle, floatingTick);
        const origin = floatingTick === undefined ? this.skin?.weaponOrigin : this.skin?.floatingWeaponOrigin;
        drawSkillEffects(this.skillEffects, battle?.effects ?? [], !!modelBattle, origin, floatingTick, battle?.weaponCasts);
        if (modelBattle) drawModeledTerrainSignals(this.skillEffects, modelBattle);
        if (!battle) return;
        const boss = battle.boss;
        if (boss && !battle.chapterBoss && boss.unit.hp > 0 && (boss.phase === 'warning' || boss.phase === 'sweep' || boss.phase === 'charge')) {
            const unit = boss.unit;
            const x = unit.x - 180;
            const y = unit.y - 320;
            const reach = boss.attack === 'sweep' ? battle.inspectorSweepReach : BOSS_CHARGE_SPEED * BOSS_CHARGE_TICKS;
            const pixelBoss = this.campaignMode && !modelBattle;
            const warning = boss.phase === 'warning';
            art.strokeColor = warning && pixelBoss ? new Color(255, 163, 108, 138) : warning ? BOSS : PAPER;
            art.lineWidth = pixelBoss ? warning ? 1.5 : 3 : boss.attack === 'sweep' && !warning ? 10 : 2;
            if (boss.attack === 'fan' || boss.attack === 'ring' || boss.attack === 'summon' && pixelBoss) {
                drawBossVolleyCue(art, x, y, Math.atan2(unit.vy, unit.vx), boss.attack !== 'fan', boss.next - battle.tick);
            } else if (boss.attack === 'summon') {
                art.circle(x, y, 38 + (boss.next - battle.tick) * 0.6);
                art.circle(x, y, 50 + (boss.next - battle.tick) * 0.6);
            } else {
                const edge = warning && pixelBoss ? 9 : boss.attack === 'charge' ? 28 : 18;
                for (const side of [-1, 1]) {
                    const offsetX = side * edge * unit.vy;
                    const offsetY = side * edge * -unit.vx;
                    const remaining = warning && pixelBoss ? Math.min(30, reach)
                        : boss.phase === 'charge' ? (boss.next - battle.tick) * BOSS_CHARGE_SPEED : reach;
                    const length = visibleReach(battle.field, unit.x + offsetX, unit.y + offsetY, unit.vx, unit.vy, remaining);
                    art.moveTo(x + offsetX, y + offsetY);
                    art.lineTo(x + unit.vx * length + offsetX, y + unit.vy * length + offsetY);
                }
            }
            art.stroke();
        }
        art.lineWidth = 1.5;
        for (const point of battle.warnings) {
            if (this.campaignMode && !modelBattle) {
                drawPixelSpawn(art, point.x - 180, point.y - 320, point.at - battle.tick, ENEMY_COLOR[point.kind]);
                continue;
            }
            art.strokeColor = ENEMY_COLOR[point.kind];
            art.circle(point.x - 180, point.y - 320, 8 + (point.at - battle.tick) / 3);
            art.stroke();
        }
        for (const enemy of battle.enemies) {
            if (enemy.state !== 'warn' || (enemy.kind !== 'charger' && enemy.kind !== 'turret')) continue;
            art.strokeColor = ENEMY_COLOR[enemy.kind];
            const x = enemy.x - 180;
            const y = enemy.y - 320;
            const pixelAim = this.campaignMode && !modelBattle;
            const reach = enemy.kind === 'turret' ? 190 : pixelAim ? CHARGER_DASH_TRAVEL : 122;
            const bodyMargin = pixelAim && enemy.kind === 'charger' ? ENEMY_FIELD_MARGIN : 0;
            const fieldReach = visibleReach(battle.field, enemy.x, enemy.y, enemy.vx, enemy.vy, reach, bodyMargin);
            const length = enemy.kind === 'turret'
                ? clipWarningReach(enemy, enemy.vx, enemy.vy, fieldReach, battle.terrainRects)
                : bodyMargin ? clipTerrainReach(enemy, enemy.vx, enemy.vy, fieldReach, battle.terrainRects, bodyMargin) : fieldReach;
            if (length <= 0) continue;
            if (pixelAim) {
                drawPixelEnemyAim(art, x, y, enemy.vx, enemy.vy, length, enemy.kind, enemy.next - battle.tick);
                continue;
            }
            const endX = x + enemy.vx * length;
            const endY = y + enemy.vy * length;
            art.moveTo(x, y);
            art.lineTo(endX, endY);
            if (length > 15) {
                art.lineTo(endX - enemy.vx * 7 - enemy.vy * 4, endY - enemy.vy * 7 + enemy.vx * 4);
                art.moveTo(endX, endY);
                art.lineTo(endX - enemy.vx * 7 + enemy.vy * 4, endY - enemy.vy * 7 - enemy.vx * 4);
            }
            art.stroke();
        }
        if (!modelBattle && !this.skin?.has('scrap')) {
            art.fillColor = MINT;
            for (const part of battle.parts) art.rect(part.x - 183, part.y - 323, 6, 6);
            art.fill();
        }
        if (this.campaignMode && !modelBattle) drawPixelEnemyShells(art, battle.bullets, WIDTH / 2, HEIGHT / 2);
        else if (!modelBattle && !this.skin?.has('bullet')) {
            art.fillColor = AMBER;
            for (const bullet of battle.bullets) art.circle(bullet.x - 180, bullet.y - 320, 4);
            art.fill();
        }
        for (const enemy of battle.enemies) {
            if (!modelBattle && !this.skin?.has(enemy.kind) && !this.skin?.has('machine-' + enemy.kind)) {
                art.fillColor = ENEMY_COLOR[enemy.kind];
                if (enemy.kind === 'inspector') art.roundRect(enemy.x - 201, enemy.y - 338, 42, 36, 8);
                else if (enemy.kind === 'turret' || enemy.kind === 'armored') art.roundRect(enemy.x - 189, enemy.y - 329, 18, 18, 3);
                else art.circle(enemy.x - 180, enemy.y - 320, enemy.kind === 'charger' ? 10 : 7);
                art.fill();
            }
            if (enemy.kind === 'armored') {
                const facingX = enemy.facingX!;
                const facingY = enemy.facingY!;
                art.strokeColor = PAPER;
                art.lineWidth = 3;
                art.moveTo(enemy.x - 180 + facingX * 12 - facingY * 8, enemy.y - 320 + facingY * 12 + facingX * 8);
                art.lineTo(enemy.x - 180 + facingX * 12 + facingY * 8, enemy.y - 320 + facingY * 12 - facingX * 8);
                art.stroke();
            }
            if (enemy.marked && !this.skin?.has('conductiveMark')) {
                art.strokeColor = BLUE;
                art.circle(enemy.x - 180, enemy.y - 320, 12);
                art.stroke();
            }
        }
        if (!modelBattle && !this.skin?.has('mechanic')) {
            art.fillColor = battle.tick < battle.player.invulnerableUntil && battle.tick % 6 < 3 ? PAPER : BLUE;
            art.circle(battle.player.x - 180, battle.player.y - 320, 9);
            art.fill();
        }
        if (battle.destination) {
            const x = battle.destination.x - WIDTH / 2;
            const y = battle.destination.y - HEIGHT / 2;
            art.strokeColor = MINT;
            art.lineWidth = 2;
            art.ellipse(x, y, 8, 5);
            art.stroke();
            art.fillColor = MINT;
            art.circle(x, y, 1.5);
            art.fill();
        }
        if (this.campaignMode) this.drawOffscreenEnemies(battle);
        if (this.campaignMode && !modelBattle && battle.player.hurtAt !== undefined) {
            drawPlayerHit(art, battle.player.x - WIDTH / 2, battle.player.y - HEIGHT / 2, this.weaponTick - battle.player.hurtAt);
        }
    }

    private drawOffscreenEnemies(battle: Readonly<Battle>): void {
        const boss = battle.boss?.unit;
        const clear = battle.clearProgress;
        const remaining = clear !== undefined && clear.total - clear.kills <= 3;
        const cx = VIEW_CENTER_X + this.battleOffset.x;
        const cy = VIEW_CENTER_Y + this.battleOffset.y;
        const halfW = (FIELD.right - FIELD.left) / 2;
        const halfH = (FIELD.top - FIELD.bottom) / 2;
        let nearest: Battle['enemies'][number] | undefined;
        if (!remaining && !boss) {
            let distance = Infinity;
            for (const enemy of battle.enemies) {
                const dx = enemy.x - cx, dy = enemy.y - cy;
                if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return;
                const square = dx * dx + dy * dy;
                if (square < distance) { nearest = enemy; distance = square; }
            }
        }
        for (const enemy of battle.enemies) {
            if (!remaining && enemy !== boss && enemy !== nearest) continue;
            const dx = enemy.x - cx, dy = enemy.y - cy;
            if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) continue;
            const t = Math.min((halfW - 10) / Math.abs(dx), (halfH - 10) / Math.abs(dy));
            const len = Math.hypot(dx, dy);
            const ux = dx / len, uy = dy / len;
            const x = cx + dx * t - WIDTH / 2, y = cy + dy * t - HEIGHT / 2;
            this.art.fillColor = ENEMY_COLOR[enemy.kind];
            this.art.moveTo(x + ux * 6, y + uy * 6);
            this.art.lineTo(x - ux * 4 - uy * 4, y - uy * 4 + ux * 4);
            this.art.lineTo(x - ux * 4 + uy * 4, y - uy * 4 - ux * 4);
            this.art.close();
            this.art.fill();
        }
    }

    private drawPuddles(battle: Run['battle'], modelProps: boolean): void {
        const art = this.puddles;
        if (!art) return;
        art.clear();
        this.threats?.clear();
        if (this.skin) this.skin.drawEncounter(art, battle, this.stage.id, modelProps, this.threats);
        else if (battle) drawCampaignEncounter(art, battle, this.stage.id, modelProps, undefined, this.threats);
        for (const zone of battle?.livePuddles ?? []) {
            const { x, y, radius, phase } = zone;
            const active = phase === 'active';
            art.fillColor = active ? PUDDLE_ACTIVE : PUDDLE_WARNING;
            art.circle(x, y, radius);
            art.fill();
            art.lineWidth = 3;
            art.strokeColor = INK;
            art.circle(x, y, radius - 1.5);
            art.stroke();
            art.lineWidth = active ? 2.5 : 1.5;
            art.strokeColor = active ? RED : AMBER;
            art.circle(x, y, radius - 1);
            art.stroke();
            if (active) {
                art.lineWidth = 1;
                art.circle(x, y, radius - 5);
                art.stroke();
            }
            art.fillColor = INK;
            art.moveTo(x, y + 13);
            art.lineTo(x + 13, y);
            art.lineTo(x, y - 13);
            art.lineTo(x - 13, y);
            art.close();
            art.fill();
            art.lineWidth = 2.5;
            if (active) {
                art.moveTo(x + 3, y + 8);
                art.lineTo(x - 4, y);
                art.lineTo(x + 3, y);
                art.lineTo(x - 3, y - 8);
            } else {
                art.moveTo(x, y + 7);
                art.lineTo(x, y - 2);
                art.moveTo(x, y - 5);
                art.lineTo(x, y - 8);
            }
            art.stroke();
        }
    }

    private cover(): void {
        this.skin?.beginUi();
        this.ui.fillColor = this.campaignMode ? INK : MASK;
        this.ui.rect(0, 0, WIDTH, HEIGHT);
        this.ui.fill();
    }

    private drawRoutes(): void {
        this.cover();
        if (this.prototypeLayer) this.skin?.dispatchArt(180, this.top - 83, FIRST_STAGE.id, FIRST_STAGE.arena, 110);
        else this.skin?.shopfront(180, this.top - 83);
        this.skin?.uiIcon('mechanic', 76, this.top - 83, 89);
        this.text('夜班修理局', 219, this.top - 67, { size: 30 });
        this.text(this.fullRun ? '前五波守住，最后打巡检机。' : '守住修理铺三波。', 219, this.top - 109, { color: DIM });
        this.text('选配件出勤', 180, 412, { size: 16, color: AMBER });
        for (const route of ['arc', 'magnet'] as const) {
            const arc = route === 'arc';
            const y = arc ? 350 : 259;
            this.control(180, y, 306, 76, () => {
                this.run.start(route);
                this.chooseRoute = false;
                this.receipt = '';
                this.trace(this.fullRun ? 'run_start' : 'start');
            });
            this.skin?.uiIcon(arc ? 'contact' : 'ring', 59, y, 32);
            this.text(arc ? '导电触点' : '大拾取圈', 185, y + 12, { size: 19, left: true, width: 196 });
            this.text(arc ? '标记近处的敌机，可搭配分流接头连跳' : '隔远捡零件，可搭配回收线圈震击',
                204, y - 13, { size: 13, color: DIM, left: true, width: 234 });
        }
        if (this.run.data) this.button(this.run.data.phase === 'lost' || this.run.data.phase === 'won' ? '返回结算' : '返回本局', 180, 105, 185, 44, () => { this.chooseRoute = false; });
    }

    private drawMotes(g: Graphics): void {
        g.clear();
        if (this.campaignPage === 'map') {
            const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
            const modelMap = !!this.prototypeRoute?.frame(chapter.id);
            const mapReady = modelMap || !!this.scenery[chapter.map];
            if (chapter.id !== '02' || !mapReady) this.freight = undefined;
            else if (this.freight?.cleared !== this.mapCleared) {
                this.freight = { cleared: this.mapCleared, startedAt: this.emberTime };
            }
            if (mapReady) {
                drawDistrictProgress(g, chapter.id, this.mapCleared, HEIGHT + this.mapOffset, this.mapBounds,
                    this.emberTime, this.freight ? this.emberTime - this.freight.startedAt : 0,
                    modelMap || !chapter.mapUpper || !!this.scenery[chapter.mapUpper]);
            }
            const handoff = this.chapterHandoff;
            if (handoff && handoff.leg !== 'ready') {
                const [lower, upper] = this.mapBounds;
                const fade = handoff.elapsed / HANDOFF_SECONDS;
                const strength = handoff.leg === 'depart' ? fade ** 3 : (1 - fade) ** 3;
                g.fillColor = new Color(13, 24, 31, Math.round(176 * strength));
                g.rect(0, lower, WIDTH, upper - lower);
                g.fill();
            }
            if (this.beacon) {
                const phase = (this.emberTime * 0.65) % 1;
                g.strokeColor = new Color(255, 195, 101, Math.round(200 * (1 - phase)));
                g.lineWidth = 2;
                g.ellipse(this.beacon.x, this.beacon.y + 4, 24 + phase * 11, 19 + phase * 8);
                g.stroke();
            }
            return;
        }
        for (let i = 0; i < 8; i++) {
            const cycle = (this.emberTime * 0.11 + i * 0.381) % 1;
            const x = 257 + (i * 31) % 88 - 19 * cycle + 3 * Math.sin(6 * cycle + i);
            const y = 379 + (i * 17) % 55 - 64 * cycle;
            g.fillColor = new Color(255, 213, 142, Math.round(150 * Math.sin(cycle * Math.PI)));
            g.circle(x, y, i % 3 ? 0.8 : 1.25);
            g.fill();
        }
    }

    private touchTarget(x: number, y: number, width: number, height: number, action: () => void): boolean {
        const left = x - width / 2;
        const bottom = y - height / 2;
        this.actions.push({ left, right: left + width, bottom, top: bottom + height, action });
        return !!this.press?.inside && this.press.area.left === left && this.press.area.bottom === bottom;
    }

    private drawHome(): void {
        const y = this.top;
        const g = this.ui;
        if (!this.prototypeDepot?.frame && !this.scenery['night-depot']) this.cover();
        drawLobbyScrim(g, WIDTH, HEIGHT, HEIGHT * (this.backdropScale - 1) / 2);
        this.block(22, y - 5, 26, 2, AMBER);
        this.text('江岸值班室', 117, y + 7, { width: 190, left: true, size: 14, bold: true, color: STOCK });
        this.text('夜班修理局', 143, y - 29, { left: true, width: 242, height: 49, size: 36, bold: true, color: STOCK });

        const campaign = this.campaign!;
        drawCreditTicket(g, 37, y - 73);
        this.text('维修凭证', 76, y - 73, { width: 52, left: true, size: 11, color: STOCK });
        this.text(String(campaign.profile.credits), 115, y - 73, { width: 34, height: 26, size: 16, bold: true, color: AMBER });
        this.drawLobbyShortcut('设置', 'settings', 318, Math.min(y - 28, this.capsuleCeiling - 26), () => {
            this.settingsError = false;
            this.campaignPage = 'settings';
        });

        const bottom = this.footer + 40;
        this.drawLobbyShortcut('装备', 'equipment', 48, bottom + 6,
            () => this.openGrowth('equipment', 'home'), campaign.canUpgradeEquipment);
        this.drawLobbyShortcut('角色', 'role', 109, bottom + 6,
            () => this.openGrowth('role', 'home'), campaign.canUpgradeRole);
        const held = this.touchTarget(253, bottom, 174, 58, () => {
            this.focusMap(this.unfinishedRun ? this.stage : this.nextMapStage(campaign));
            this.campaignPage = 'map';
            this.trace('open_campaign_map');
        });
        drawDispatchHandle(g, 253, bottom, held);
        this.text('出勤', 231, bottom - (held ? 3 : 0), { size: 26, bold: true, color: INK, height: 39, width: 94 });
    }

    private drawLobbyShortcut(label: string, icon: LobbyShortcut, x: number, y: number,
        action: () => void, upgrade = false): void {
        const small = icon === 'settings';
        const held = this.touchTarget(x, y - 9, small ? 48 : 54, small ? 52 : 60, action);
        const image = icon !== 'role' && this.skin?.uiIcon(small ? 'ui/settings' : 'ui/tier', x, y - (held ? 2 : 0), small ? 24 : 30);
        drawLobbyDial(this.ui, x, y, icon, held, !image);
        if (upgrade) this.drawUpgradeDot(x + 16, y + 15);
        this.text(label, x, y - (small ? 25 : 31),
            { width: 49, height: 20, size: small ? 11 : 13, bold: !small, color: STOCK });
    }

    private drawUpgradeDot(x: number, y: number): void {
        const g = this.ui;
        g.fillColor = INK;
        g.circle(x, y, 7);
        g.fill();
        g.fillColor = RED;
        g.circle(x, y, 5);
        g.fill();
    }

    private drawSettings(): void {
        const settings = this.settings!.current;
        this.block(0, 0, WIDTH, HEIGHT, new Color(11, 22, 28, 221));
        this.dispatchHeader('返回首页', () => { this.settingsError = false; this.campaignPage = 'home'; });
        this.text('设置', 89, 500, { left: true, width: 126, size: 28, bold: true });
        const toggle = (name: string, field: 'music' | 'sound', y: number) => {
            const on = settings[field];
            this.block(22, y - 28, 316, 56, CABINET);
            this.block(22, y - 28, 316, 1, RULE);
            this.text(name, 111, y, { left: true, width: 146, size: 18, bold: true });
            this.button(on ? '开' : '关', 273, y, 92, 46, () => {
                if (this.updateSettings({ [field]: !on }) && field === 'sound' && !on) this.play('warning');
            }, true, on);
        };
        toggle('音乐', 'music', 425);
        toggle('音效', 'sound', 355);
        this.text('移动方式', 116, 272, { left: true, width: 158, size: 18, bold: true });
        this.button('摇杆控制', 102, 222, 152, 52,
            () => this.updateSettings({ movement: 'joystick' }), true, settings.movement === 'joystick');
        this.button('触屏控制', 258, 222, 152, 52,
            () => this.updateSettings({ movement: 'touch' }), true, settings.movement === 'touch');
        this.text(settings.movement === 'joystick' ? '按住屏幕下方，拖动摇杆' : '点哪儿就走到哪儿',
            180, 170, { width: 309, size: 14, color: DIM });
        if (this.settingsError) this.text('没存上，点一次重试。', 180, 128, { color: AMBER });
    }

    private drawStick(active: boolean): void {
        const g = this.stickView;
        if (!g) return;
        g.clear();
        if (!active || !this.stickOrigin) return;
        const y = this.stickY;
        const x = this.stickX;
        g.fillColor = new Color(22, 29, 27, 238);
        g.circle(x, y, STICK_RADIUS + 2); g.fill();
        g.strokeColor = BENCH.weapon.accent; g.lineWidth = 2;
        g.circle(x, y, STICK_RADIUS); g.stroke();
        const travel = STICK_RADIUS - STICK_KNOB_RADIUS - 1;
        const knobX = x + this.stickAxis.x * travel, knobY = y + this.stickAxis.y * travel;
        g.fillColor = BENCH.yellow;
        g.circle(knobX, knobY, STICK_KNOB_RADIUS); g.fill();
        g.strokeColor = BENCH.ink; g.lineWidth = 1.5;
        g.circle(knobX, knobY, 7); g.stroke();
    }

    private clampMap(offset: number): number {
        const { stages, lower, upper } = this.roadmapWindow();
        const first = stages[0];
        const last = stages[stages.length - 1];
        // Safe areas and restoration notices can cover an edge station at the edge of the artwork.
        const firstVisible = first.anchor.y * MAP_HEIGHT - HEIGHT + lower + ROUTE_STATION_EXTENT + STATION_EDGE_GAP;
        const lastVisible = last.anchor.y * MAP_HEIGHT - HEIGHT + upper - ROUTE_STATION_EXTENT - STATION_EDGE_GAP;
        const minimum = Math.min(Math.max(-40, this.top - 42 - HEIGHT), lastVisible);
        const maximum = Math.max(MAP_HEIGHT - HEIGHT + Math.min(0, this.footer + 38), firstVisible);
        return Math.max(minimum, Math.min(maximum, offset));
    }

    private nextMapStage(campaign: Campaign): CampaignStage {
        return CAMPAIGN_CATALOG.find(stage => campaign.isUnlocked(stage.id) && !campaign.profile.clearedStages.includes(stage.id))
            ?? CAMPAIGN_CATALOG[CAMPAIGN_CATALOG.length - 1];
    }

    private focusMap(stage: CampaignStage): void {
        const index = CAMPAIGN_CHAPTERS.findIndex(chapter => chapter.id === stage.chapter);
        this.mapChapter = Math.max(0, index);
        this.mapOffset = this.clampMap(stage.anchor.y * MAP_HEIGHT - HEIGHT * 0.52);
    }

    private beginChapterHandoff(next: CampaignStage): void {
        this.focusMap(this.stage);
        const to = this.mapOffset;
        this.mapOffset = this.clampMap(to + 48);
        this.chapterHandoff = { next, leg: 'depart', elapsed: 0, from: this.mapOffset, to };
        this.campaignPage = 'map';
    }

    private advanceChapterHandoff(dt: number): void {
        const handoff = this.chapterHandoff;
        if (!handoff || handoff.leg === 'ready' || this.campaignPage !== 'map' || this.run.background
            || this.cloudBusy || this.campaignError || this.press || this.mapGesture) return;

        handoff.elapsed = Math.min(HANDOFF_SECONDS, handoff.elapsed + dt);
        const progress = handoff.elapsed / HANDOFF_SECONDS;
        const eased = progress * progress * (3 - 2 * progress);
        this.mapOffset = this.clampMap(handoff.from + (handoff.to - handoff.from) * eased);
        this.visibleUi = '';
        if (progress < 1) return;

        if (handoff.leg === 'arrive') {
            handoff.leg = 'ready';
            return;
        }
        this.focusMap(handoff.next);
        handoff.to = this.mapOffset;
        handoff.from = this.clampMap(handoff.to - 64);
        handoff.leg = 'arrive';
        handoff.elapsed = 0;
        this.mapOffset = handoff.from;
    }

    private rememberMap(): void {
        while (this.mapPositions.length <= this.mapChapter) this.mapPositions.push(null);
        this.mapPositions[this.mapChapter] = this.mapOffset;
        this.mapPlatform?.writeCheckpoint(1, this.mapPositions);
    }

    private keepScenery(asset: string): boolean {
        const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
        return asset === 'night-depot' || asset === 'workbench' || asset === chapter.map || asset === chapter.mapUpper;
    }

    private releaseScenery(asset: string): void {
        const frame = this.scenery[asset];
        if (!frame) return;
        if (this.backdrop?.spriteFrame === frame) this.backdrop.spriteFrame = null;
        if (this.upperMap?.spriteFrame === frame) this.upperMap.spriteFrame = null;
        const texture = frame.texture;
        frame.destroy();
        texture.decRef();
        delete this.scenery[asset];
    }

    private loadScenery(asset: string): void {
        if (this.scenery[asset] || this.pendingScenery.has(asset) || this.missingScenery.has(asset)) return;
        this.pendingScenery.add(asset);
        const finish = (texture: Texture2D | null) => {
            this.pendingScenery.delete(asset);
            if (!this.isValid || !this.keepScenery(asset)) return;
            if (texture) {
                const frame = new SpriteFrame();
                texture.addRef();
                frame.texture = texture;
                frame.packable = false;
                this.scenery[asset] = frame;
            } else {
                this.missingScenery.add(asset);
            }
            this.visibleUi = '';
        };
        const oldRoot = this.skinRoot;
        const bundle = !this.prototypeLayer && PIXEL_MENU_ART[asset];
        if (bundle) {
            loadCampaignPixelTexture(bundle, 'ui/' + asset, texture => {
                if (texture) finish(texture);
                else if (this.isValid && this.keepScenery(asset)) loadCampaignTexture(oldRoot, asset, finish);
                else this.pendingScenery.delete(asset);
            });
        } else loadCampaignTexture(oldRoot, asset, finish);
    }

    private drawScenery(page: 'home' | 'map' | 'bench' | null): void {
        if (!this.backdrop || !this.upperMap) return;
        if (page === 'home' && this.prototypeLayer) {
            this.prototypeDepot ??= new PrototypeDepotView(this.node.scene!, () => { this.visibleUi = ''; });
        }
        this.prototypeDepot?.setVisible(page === 'home');
        if (page !== 'map') this.prototypeRoute?.setChapter();
        this.backdrop.node.active = page !== null;
        this.upperMap.node.active = false;
        if (page === 'bench') {
            this.loadScenery('workbench');
            this.backdrop.spriteFrame = this.scenery.workbench ?? null;
            this.backdrop.node.setPosition(0, 0, 0);
            this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH, HEIGHT * this.backdropScale);
        } else if (page === 'home') {
            this.backdrop.spriteFrame = this.prototypeDepot?.frame ?? this.scenery['night-depot'] ?? null;
            this.backdrop.node.setPosition(0, 0, 0);
            this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH * this.backdropScale, HEIGHT * this.backdropScale);
        } else if (page === 'map') {
            const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
            for (const asset of Object.keys(this.scenery)) {
                if (!this.keepScenery(asset)) this.releaseScenery(asset);
            }
            if (this.prototypeLayer) {
                this.prototypeRoute ??= new PrototypeRouteView(this.node.scene!, () => { this.visibleUi = ''; });
                this.prototypeRoute.setChapter(chapter.id);
                this.backdrop.spriteFrame = this.prototypeRoute.frame(chapter.id);
                this.backdrop.node.setPosition(0, HEIGHT / 2 + this.mapOffset - MAP_HEIGHT / 2, 0);
                this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH, MAP_HEIGHT);
                return;
            }
            this.loadScenery(chapter.map);
            if (chapter.mapUpper) this.loadScenery(chapter.mapUpper);
            const upperHeight = chapter.mapUpper ? MAP_HEIGHT - HEIGHT : 0;
            this.backdrop.spriteFrame = this.scenery[chapter.map] ?? null;
            this.backdrop.node.setPosition(0, HEIGHT / 2 + this.mapOffset - (MAP_HEIGHT + upperHeight) / 2, 0);
            this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH, MAP_HEIGHT - upperHeight);
            if (chapter.mapUpper && this.scenery[chapter.mapUpper]) {
                this.upperMap.node.active = true;
                this.upperMap.spriteFrame = this.scenery[chapter.mapUpper]!;
                this.upperMap.node.setPosition(0, HEIGHT / 2 + this.mapOffset - upperHeight / 2, 0);
                this.upperMap.node.getComponent(UITransform)!.setContentSize(WIDTH, upperHeight);
            }
        }
    }

    private roadmapWindow() {
        const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
        const campaign = this.campaign!;
        const stages = CAMPAIGN_CATALOG.filter(stage => stage.chapter === chapter.id);
        const done = campaign.profile.clearedStages;
        const count = stages.filter(stage => done.includes(stage.id)).length;
        const receipt = this.currentCampaignRun() && !this.unfinishedRun;
        const receiptY = Math.min(this.top, this.capsuleCeiling - 22);
        const upper = receipt ? Math.min(this.top - 42, receiptY - 24) : this.top - 42;
        const retry = !this.prototypeRoute?.frame(chapter.id)
            && (this.missingScenery.has(chapter.map) || !!chapter.mapUpper && this.missingScenery.has(chapter.mapUpper));
        const locked = !campaign.isUnlocked(stages[0].id);
        const restored = count === stages.length;
        const entering = this.chapterHandoff?.next.chapter === chapter.id ? this.chapterHandoff.next : undefined;
        const lower = this.footer + (retry || locked || restored || entering ? 80 : 38);
        return { chapter, stages, done, count, receipt, receiptY, upper, lower, retry, locked, restored, entering };
    }

    private drawRoadmap(): void {
        const { chapter, stages, done, count, receipt, receiptY, upper, lower, retry, locked, restored, entering } = this.roadmapWindow();
        this.mapCleared = count;
        if (!this.prototypeRoute?.frame(chapter.id) && !this.scenery[chapter.map]) {
            this.block(0, -this.mapPadding, WIDTH, HEIGHT + 2 * this.mapPadding, BENCH.ink);
        }
        const g = this.ui;
        const top = this.top;
        const campaign = this.campaign!;
        const mapY = (y: number) => HEIGHT + this.mapOffset - y * MAP_HEIGHT;
        const noticeY = this.footer + 54;
        this.mapBounds = [lower, upper];
        this.beacon = undefined;
        const points = chapter.routePoints;
        const states = points.slice(1).map((_, index) => {
            const next = stages.find(stage => stage.routeIndex > index) ?? stages[stages.length - 1];
            // Replaying a station changes its badge without dimming the cable already restored beyond it.
            return done.includes(next.id) ? 'cleared' : this.routeStationState(next);
        });
        drawRouteCable(g, points.map(point => [point.x * WIDTH, mapY(point.y)] as const), this.mapBounds, states);
        for (const stage of stages) {
            const y = mapY(stage.anchor.y);
            if (y - ROUTE_STATION_EXTENT < lower || y + ROUTE_STATION_EXTENT > upper) continue;
            this.drawRouteStation(stage, stage.anchor.x * WIDTH, y);
        }

        this.block(0, upper + 1, WIDTH, HEIGHT + this.mapPadding - upper, BENCH.ink);
        this.block(0, -this.mapPadding, WIDTH, lower + this.mapPadding, BENCH.ink);
        this.block(0, upper, WIDTH, 1, RULE);
        this.block(0, lower, WIDTH, 1, RULE);
        const backHeld = this.touchTarget(34, top, 54, 50, () => { this.campaignPage = 'home'; });
        g.fillColor = backHeld ? PLATE : INK;
        g.circle(34, top, 18); g.fill();
        g.strokeColor = PAPER; g.lineWidth = 2.5;
        g.moveTo(37, top + 7); g.lineTo(30, top); g.lineTo(37, top - 7); g.stroke();
        this.text('值班室', 34, top - 21, { width: 42, height: 16, size: 10, color: STOCK });
        this.text(`第${'一二三四'[this.mapChapter]}章  ·  ${chapter.route}`, 141, top + 11,
            { width: 158, left: true, size: 12, bold: true, color: AMBER });
        this.text(chapter.title, 142, top - 13,
            { width: 160, height: 37, left: true, size: 24, bold: true, color: STOCK });
        if (!receipt) {
            const meterY = Math.min(top + 1, this.capsuleCeiling - 14);
            for (let index = 0; index < stages.length; index++) {
                this.block(254 + index * 15, meterY, 12, 5, index < count ? AMBER : RULE);
            }
            this.text(`已通关 ${count}/${stages.length}`, 291, meterY - 12, { width: 82, size: 11, color: STOCK });
        }

        CAMPAIGN_CHAPTERS.forEach((tab, index) => {
            const first = CAMPAIGN_CATALOG.find(stage => stage.chapter === tab.id)!;
            const open = campaign.isUnlocked(first.id);
            const label = `第${'一二三四'[index]}章${open ? '' : ' · 锁'}`;
            const x = 54 + 84 * index;
            const y = this.footer + 6;
            const selected = index === this.mapChapter;
            const navigate = () => {
                const next = CAMPAIGN_CATALOG.find(stage => stage.chapter === tab.id && campaign.isUnlocked(stage.id) && !done.includes(stage.id));
                this.focusMap(next ?? first);
                const remembered = this.mapPositions[index];
                if (remembered != null) this.mapOffset = this.clampMap(remembered);
                this.trace('select_campaign_chapter', { chapter: tab.id });
            };
            const held = this.touchTarget(x, y, 78, 44, navigate);
            if (held) this.block(x - 37, y - 17, 74, 36, PLATE);
            this.block(x - 29, y + 17, 58, selected ? 3 : 1, selected ? AMBER : RULE);
            this.text(label, x, y - 2, { width: 72, height: 23, size: 13, bold: selected, color: selected ? STOCK : DIM });
        });
        if (retry) {
            this.benchButton('重试加载地图', 180, noticeY, 166, () => {
                this.missingScenery.delete(chapter.map);
                if (chapter.mapUpper) this.missingScenery.delete(chapter.mapUpper);
            });
        } else if (locked) {
            this.text('通关 ' + stages[0].prerequisite + ' 后开放', 180, noticeY, { size: 13, color: STOCK });
        } else if (entering) {
            this.block(11, noticeY - 14, 338, 28, CABINET);
            this.text(`${CHAPTER_LINKS[chapter.id] ?? chapter.route}已接通 · 点 ${entering.id} 出勤`, 180, noticeY,
                { width: 326, size: 13, color: MINT });
        } else if (restored) {
            this.block(11, noticeY - 14, 338, 28, CABINET);
            this.text(chapter.restored, 180, noticeY, { width: 326, size: 13, color: MINT });
        }
        if (receipt) {
            this.benchButton('结单', 311, receiptY, 62, () => {
                this.campaignPage = null;
                this.chooseRoute = false;
            });
        }
    }

    private routeStationState(stage: CampaignStage): RouteStationState {
        if (this.stage.id === stage.id && this.unfinishedRun) return 'current';
        const campaign = this.campaign!;
        if (campaign.profile.clearedStages.includes(stage.id)) return 'cleared';
        return campaign.isUnlocked(stage.id) ? 'current' : 'locked';
    }

    private drawRouteStation(stage: CampaignStage, x: number, y: number): void {
        const state = this.routeStationState(stage);
        const playing = this.stage.id === stage.id && this.unfinishedRun;
        const side = x < WIDTH / 2 ? 1 : -1;
        const labelX = x + side * 98;
        const held = state !== 'locked' && this.touchTarget(x + side * 70, y, 195, 56, () => this.openStage(stage));
        if (playing || (!this.unfinishedRun && state === 'current')) this.beacon = { x, y };
        drawRouteTerminal(this.ui, x, y, labelX, state, held);
        const status = playing ? `继续 · 第 ${this.run.data!.wave + 1} 波`
            : state === 'cleared' ? '已通关 · 可重打' : state === 'current' ? '可出勤' : `通关 ${stage.prerequisite} 后开放`;
        this.text(stage.id + '  ' + stage.title, labelX, y + 8,
            { width: 125, height: 21, bold: true, color: state === 'locked' ? DIM : STOCK, size: 16 });
        this.text(status, labelX, y - 11,
            { width: 125, height: 19, color: state === 'current' ? AMBER : state === 'cleared' ? MINT : DIM, size: 12 });
    }

    private drawSwitchStage(): void {
        this.cover();
        this.dispatchHeader('换工单');
        this.text(`改去${this.selectedStage.title}？`, 180, 412, { width: 320, size: 27, bold: true });
        this.text(`换单会结束正在打的「${this.stage.title}」。通关记录和已解锁的武器会保留。`,
            180, 342, { width: 286, height: 83, size: 16 });
        this.button('接着打这关', 180, 240, 286, 48, () => this.openStage(this.stage), true, false, true);
        this.button('换单出勤', 180, 178, 286, 48, () => this.beginCampaignRun(this.switchRoute));
    }

    private dispatchHeaderY(): number {
        return Math.min(this.top + 13, this.capsuleCeiling - 22);
    }

    private dispatchHeader(section: string, back?: () => void): void {
        const y = this.dispatchHeaderY();
        this.block(16, y - 12, 4, 23, AMBER);
        this.text('夜班修理局', 112, y, { left: true, width: 168, size: 19, bold: true });
        if (back) this.button(section, 298, y, 89, 44, back);
        else this.text(section, 279, y, { width: 132, size: 13, color: DIM });
        this.block(16, y - 21, 328, 1, RULE);
    }

    private dispatchTicket(heading: string, narrative: string, status: string, stageId = this.stage.id, extraFooterSpace = 0): number {
        const headerTop = this.dispatchHeaderY() - 13;
        // Crop the illustration first so the ticket copy and lower controls keep their spacing.
        const y = Math.max(headerTop, this.footer + 542 + extraFooterSpace);
        const artHeight = Math.max(0, 164 - (y - headerTop));
        this.block(16, y - 292, 328, 111 + artHeight, STOCK);
        const arena = CAMPAIGN_CATALOG.find(stage => stage.id === stageId)?.arena ?? this.stage.arena;
        if (artHeight >= 24) this.skin?.dispatchArt(180, y - 181 + artHeight / 2, stageId, arena, artHeight);
        if (narrative.startsWith('阿阮：')) this.skin?.uiIcon('radio-aruan', 311, y - 221, 43);
        if (narrative.startsWith('陈栖：')) this.skin?.uiIcon('radio-chenqi', 311, y - 221, 43);
        this.text(status, 180, y - 198, { left: true, width: 298, size: 13, bold: true, color: STAMP });
        this.text(heading, 180, y - 226, { left: true, width: 298, height: 39, size: 30, bold: true, color: INK });
        this.text(narrative, 180, y - 266, { left: true, width: 298, height: 41, size: 15, color: CABINET });
        for (let x = 23; x < 341; x += 11) this.block(x, y - 291, 5, 1, STAMP);
        return y;
    }

    private routeCard(x: number, y: number, route: Route): void {
        const arc = route === 'arc';
        this.control(x, y, 159, 94, () => {
            if (this.unfinishedRun && this.selectedStage.id !== this.stage.id) {
                this.switchRoute = route;
                this.campaignPage = 'switch';
            } else this.beginCampaignRun(route);
        }, true, false, false, true);
        this.block(x - 79, y + 44, 158, 3, arc ? AMBER : MINT);
        this.skin?.uiIcon(arc ? 'contact' : 'ring', x - 49, y + 12, 36);
        this.text(arc ? '导电触点' : '拾取磁环', x + 21, y + 12, { width: 87, size: 17, bold: true });
        this.text(arc ? '打中就标记敌机' : '站远也能捡零件', x - 7, y - 25, { left: true, width: 114, size: 14, color: PAPER });
        this.text('›', x + 59, y - 24, { size: 24, color: arc ? AMBER : MINT });
    }

    private drawCampaignBrief(): void {
        this.cover();
        this.dispatchHeader('返回路线图', () => { this.campaignPage = 'map'; });
        const stage = this.selectedStage;
        const y = this.dispatchTicket(stage.title, stage.brief, '工单 ' + stage.id, stage.id);
        this.text(stage.goal, 180, y - 309, { width: 326, left: true, color: PAPER, size: 15 });
        const campaign = this.campaign!;
        const starters = campaign.availableStarters(stage.id);
        const selected = starters.indexOf(this.startWeapon);
        const step = (direction: number) => { this.startWeapon = starters[(selected + starters.length + direction) % starters.length]; };
        if (starters.length > 1) {
            this.button('‹', 41, y - 348, 48, 41, () => step(-1));
            this.button('›', 319, y - 348, 48, 41, () => step(1));
        }
        this.text(TOOLS[this.startWeapon].name, 180, y - 347, { size: 19, bold: true, color: MINT });
        this.skin?.uiIcon(this.startWeapon, 104, y - 349, 36);
        this.text(TOOLS[this.startWeapon].detail, 180, y - 376, { size: 13, width: 316, color: DIM });
        const training = campaign.weaponTraining(this.startWeapon);
        const station = WORKSHOP_TIERS[campaign.workshopTier];
        const attachment = training.starterAttachment && getEquipmentOffer(training.starterAttachment)?.name;
        const interval = Math.round(training.intervalReduction * 1000 / TICK_RATE);
        const loadoutSummary = [station.supplies ? `开局有 ${station.supplies} 个零件` : '',
            training.reachBonus ? `射程 +${training.reachBonus}` : '',
            interval ? `攻击间隔 −${interval} 毫秒` : '', attachment ? `带${attachment}` : ''].filter(Boolean);
        if (loadoutSummary.length) this.text(loadoutSummary.join(' · '), 180, y - 396, { size: 12, width: 316, color: MINT });
        const base = this.footer + 62;
        const challenge = campaign.isModeUnlocked(stage.id, 'overtime_1');
        this.text('选个配件', challenge ? 62 : 115, base + 66,
            { left: true, width: challenge ? 92 : 198, size: 17, bold: true });
        if (challenge) this.button(MODE_LABEL[this.loadoutMode], 167, base + 66, 104, 38,
            () => { this.campaignPage = 'difficulty'; }, true, this.loadoutMode !== 'normal');
        this.button('维修站', 281, base + 66, 124, 38, () => {
            this.workshopFromResult = false;
            this.campaignPage = 'workshop';
        });
        this.routeCard(95.5, base, 'arc');
        this.routeCard(264.5, base, 'magnet');
    }

    private drawDifficulty(): void {
        const stage = this.selectedStage;
        const campaign = this.campaign!;
        const y = this.dispatchHeaderY();
        this.cover();
        this.dispatchHeader('返回工单', () => { this.campaignPage = 'brief'; });
        this.text('出勤难度', 180, y - 70, { size: 27, bold: true });
        const descriptions = [
            '',
            '敌机来得更密。第 3 波有护甲机。',
            '敌机来得比加班 I 更密。',
        ];
        const modes: readonly ChallengeMode[] = stage.id === FIRST_STAGE.id ? ['normal', 'overtime_1', 'overtime_2'] : ['normal', 'overtime_1'];
        modes.forEach((mode, index) => {
            const cy = y - 143 - index * 102;
            const unlocked = campaign.isModeUnlocked(stage.id, mode);
            const selected = this.loadoutMode === mode;
            this.control(180, cy, 328, 89, () => { this.loadoutMode = mode; this.campaignPage = 'brief'; }, unlocked, selected);
            this.text(MODE_LABEL[mode], 126, cy + 21, { width: 184, left: true, size: 19, bold: true });
            this.text(selected ? '已选' : unlocked ? '选择 ›' : '完成加班 I', 280, cy + 21,
                { width: 101, size: 13, color: unlocked ? MINT : DIM });
            if (descriptions[index]) this.text(descriptions[index], 180, cy - 6, { width: 295, left: true, size: 13, color: PAPER });
            if (mode !== 'normal') this.text(mode === 'overtime_1' && !campaign.hasClearedChallenge(stage.id)
                ? '首通多拿 4 凭证 · 无法复活' : '无法复活', 180, cy - 27,
            { width: 295, left: true, size: 12, color: AMBER });
        });
    }

    private drawWorkshop(): void {
        const campaign = this.campaign!;
        const profile = campaign.profile;
        const y = Math.min(this.top, this.dispatchHeaderY() + 10);
        this.cover();
        this.dispatchHeader(this.workshopFromResult ? '返回结单' : '返回工单', () => {
            this.campaignPage = this.workshopFromResult ? null : 'brief';
        });
        if (this.cloud) this.button('云档', 301, this.footer, 79, 39, () => { this.campaignPage = 'cloud'; });
        this.text('维修站', 103, y - 54, { width: 168, left: true, size: 28, bold: true });
        this.text(`维修凭证 ${profile.credits}`, 274, y - 54, { size: 16, color: MINT });
        const tabs = [['station', '整备等级'], ['archive', '线索档案'], ['commissions', '夜班委托']] as const;
        tabs.forEach(([tab, label], index) => this.button(label, 68 + 112 * index, y - 102, 104, 44,
            () => { this.workshopTab = tab; }, true, this.workshopTab === tab));
        if (this.workshopTab === 'station') this.drawWorkshopTiers(y, true);
        else if (this.workshopTab === 'archive') this.drawArchive(y);
        else this.drawCommissions(y);
    }

    private openGrowth(page: 'equipment' | 'role', back: 'home' | 'workshop'): void {
        if (page === 'equipment' && back === 'workshop') this.trainingWeapon = this.startWeapon;
        this.growthBack = back;
        this.campaignPage = page;
    }

    private growthHeader(title: string): number {
        this.benchBackdrop();
        const y = this.benchHeader('', this.growthBack === 'home' ? '返回首页' : '返回维修站',
            () => { this.campaignPage = this.growthBack; });
        this.text(title, 108, y - 61, { width: 181, left: true, size: 29, bold: true, color: BENCH.paper });
        benchPlate(this.ui, 217, y - 81, 127, 34, BENCH.recess, BENCH.edge);
        this.text(`维修凭证 ${this.campaign!.profile.credits}`, 280, y - 64,
            { width: 119, size: 15, bold: true, color: BENCH.yellow });
        return y;
    }

    private drawEquipment(): void {
        const y = this.growthHeader('装备');
        const tabs = [['weapon', '武器训练'], ['blueprints', '改装方案'], ['station', '整备等级']] as const;
        tabs.forEach(([tab, label], index) => {
            const x = 68 + 112 * index;
            const cy = y - 108;
            const active = this.equipmentTab === tab;
            const held = this.touchTarget(x, cy, 104, 44, () => { this.equipmentTab = tab; });
            if (active || held) benchPlate(this.ui, x - 52, cy - 21, 104, 42, BENCH.steel, BENCH.edge);
            this.block(x - 47, cy - 19, 94, active ? 3 : 1, active ? BENCH.yellow : BENCH.edge);
            this.text(label, x, cy, { width: 96, size: 15, bold: active, color: active ? BENCH.paper : BENCH.muted });
        });
        if (this.equipmentTab === 'weapon') this.drawWeaponTraining(y);
        else if (this.equipmentTab === 'blueprints') this.drawBlueprints(y);
        else this.drawWorkshopTiers(y);
    }

    private drawBlueprints(y: number): void {
        const campaign = this.campaign!;
        const profile = campaign.profile;
        const keys = Object.keys(BLUEPRINTS) as BlueprintId[];
        this.text('出勤前最多选一项，下一局生效', 180, y - 136,
            { width: 320, size: 12, color: BENCH.muted });
        keys.forEach((key, i) => {
            const cy = y - 200 - i * 118;
            const owned = profile.blueprints.includes(key);
            const chosen = profile.selectedBlueprint === key;
            const blueprint = BLUEPRINTS[key];
            const detail = blueprint.detail.replace(/[。，]/, '$&\n');
            const available = owned || campaign.canBuyBlueprint;
            const edge = chosen ? BENCH.attachment.accent : BENCH.edge;
            benchPlate(this.ui, 16, cy - 55, 328, 108, BENCH.shadow);
            benchPlate(this.ui, 16, cy - 52, 328, 108, chosen ? BENCH.attachment.fill : BENCH.steel, edge);
            benchPlate(this.ui, 24, cy - 44, 75, 92, BENCH.recess, edge);
            this.skin?.uiIcon(key, 61, cy + 2, 64);
            this.text(blueprint.title, 222, cy + 37, { width: 220, left: true, size: 18, bold: true, color: BENCH.paper });
            this.text(detail, 222, cy + 12,
                { width: 220, height: 36, left: true, size: 13, color: BENCH.muted });
            this.benchButton(chosen ? '取消选用' : owned ? '选用' : '兑换 ' + campaign.blueprintPrice,
                274, cy - 29, 113, () => {
                    if (owned) campaign.selectBlueprint(chosen ? null : key);
                    else if (campaign.buyBlueprint(key)) {
                        campaign.selectBlueprint(key);
                        this.play('purchase');
                    }
                }, { enabled: available, primary: available && !chosen });
        });
    }

    private drawWorkshopTiers(y: number, showGrowthShortcuts = false): void {
        const level = this.campaign!.workshopTier;
        const current = WORKSHOP_TIERS[level];
        const next = WORKSHOP_TIERS[level + 1];
        benchPlate(this.ui, 16, y - 235, 328, 95, BENCH.shadow);
        benchPlate(this.ui, 16, y - 231, 328, 95, BENCH.gear.fill, BENCH.gear.accent);
        benchScrew(this.ui, 27, y - 220);
        benchScrew(this.ui, 334, y - 147);
        this.text(`整备 ${level + 1} 级 · ${current.title}`, 180, y - 162,
            { width: 288, left: true, size: 23, bold: true, color: BENCH.paper });
        this.text(current.supplies ? `每次出勤带 ${current.supplies} 个零件` : '出勤时从 0 个零件开始', 180, y - 195,
            { width: 288, left: true, size: 16, color: BENCH.yellow });
        this.text(next ? `打完第 ${Number(next.stage)} 关就能扩建` : '维修站已升满',
            180, y - 217, { width: 288, left: true, size: 12, color: BENCH.muted });
        if (showGrowthShortcuts) {
            this.benchButton('装备 ›', 95, y - 261, 158, () => this.openGrowth('equipment', 'workshop'));
            this.benchButton('角色 ›', 265, y - 261, 158, () => this.openGrowth('role', 'workshop'));
        }
        const first = y - (showGrowthShortcuts ? 314 : 269);
        this.block(38, first - (WORKSHOP_TIERS.length - 2) * 47, 2, (WORKSHOP_TIERS.length - 2) * 47, BENCH.edge);
        WORKSHOP_TIERS.slice(1).forEach((tier, index) => {
            const cy = first - index * 47;
            const available = index < level;
            const accent = available ? BENCH.attachment.accent : BENCH.muted;
            benchPlate(this.ui, 24, cy - 14, 30, 28, BENCH.recess, available ? accent : BENCH.edge);
            this.block(65, cy - 21, 276, 1, BENCH.edge);
            this.text(available ? '✓' : tier.stage!, 39, cy, { size: 13, color: accent });
            this.text(tier.title, 147, cy, { size: 16, width: 166, left: true, bold: available, color: BENCH.paper });
            this.text(`开局 ${tier.supplies} 零件`, 277, cy, { width: 104, size: 14, color: accent });
        });
    }

    private drawRoleTraining(): void {
        const campaign = this.campaign!;
        const { credits, revision } = campaign.profile;
        const y = this.growthHeader('角色');
        benchPlate(this.ui, 16, y - 249, 328, 157, BENCH.shadow);
        benchPlate(this.ui, 16, y - 245, 328, 157, BENCH.weapon.fill, BENCH.edge);
        benchPlate(this.ui, 27, y - 234, 306, 135, BENCH.recess, BENCH.edge);
        benchScrew(this.ui, 37, y - 109);
        benchScrew(this.ui, 323, y - 224);
        this.skin?.uiIcon('mechanic', 180, y - 168, 152);
        const tracks: readonly [TrainingTrack, string, string, string][] = [
            ['vitality', '体力上限', '', 'plate'], ['mobility', '移动速度', '%', 'bearings'], ['collection', '拾取范围', '%', 'ring'],
        ];
        tracks.forEach(([track, label, unit, icon], index) => {
            const item = campaign.roleTraining(track);
            const cy = y - 299 - index * 91;
            const canTrain = !!item.next && credits >= item.next.price;
            benchPlate(this.ui, 16, cy - 44, 328, 83, BENCH.shadow);
            benchPlate(this.ui, 16, cy - 41, 328, 83, BENCH.steel, BENCH.edge);
            benchPlate(this.ui, 23, cy - 33, 52, 66, BENCH.recess, BENCH.edge);
            this.skin?.uiIcon(icon, 49, cy + 5, 34);
            for (let rank = 0; rank < 2; rank++) {
                this.block(34 + rank * 16, cy - 20, 13, 4, rank < item.rank ? BENCH.yellow : BENCH.edge);
            }
            this.text(`${item.title} · ${item.rank}/2 级`, 148, cy + 25,
                { width: 126, left: true, size: 17, bold: true, color: BENCH.paper });
            this.text(`${label} +${item.bonus}${unit}`, 148, cy + 1,
                { width: 126, left: true, size: 14, color: BENCH.attachment.accent });
            if (item.next) this.text(`下一级　${item.next.detail}`, 151, cy - 22,
                { width: 132, left: true, size: 12, color: BENCH.muted });
            this.benchButton(item.next ? `训练 · ${item.next.price} 凭证` : '已满级', 275, cy, 118, () => {
                if (campaign.trainRole(track, revision)) this.play('purchase');
            }, { enabled: canTrain, primary: canTrain });
        });
    }

    private drawWeaponTraining(y: number): void {
        const campaign = this.campaign!;
        const profile = campaign.profile;
        const tools = campaign.availableTrainingWeapons();
        const index = Math.max(0, tools.indexOf(this.trainingWeapon));
        const id = tools[index];
        const item = campaign.weaponTraining(id);
        const tool = TOOLS[id];
        const step = (offset: number) => { this.trainingWeapon = tools[(index + offset + tools.length) % tools.length]; };
        const canTrain = !!item.next && profile.credits >= item.next.price;
        benchPlate(this.ui, 16, y - 343, 328, 207, BENCH.shadow);
        benchPlate(this.ui, 16, y - 339, 328, 207, BENCH.weapon.fill, BENCH.edge);
        benchPlate(this.ui, 27, y - 263, 306, 120, BENCH.recess, BENCH.edge);
        benchScrew(this.ui, 38, y - 153);
        benchScrew(this.ui, 322, y - 252);
        this.skin?.uiIcon(id, 180, y - 207, 119);
        if (tools.length > 1) {
            this.benchButton('‹', 54, y - 205, 44, () => step(-1));
            this.benchButton('›', 306, y - 205, 44, () => step(1));
        }
        for (let rank = 0; rank < 3; rank++) {
            this.block(153 + rank * 19, y - 273, 16, 3, rank < item.rank ? BENCH.yellow : BENCH.edge);
        }
        this.text(`${tool.name} · ${item.rank}/3 级`, 180, y - 292, { size: 22, bold: true, color: BENCH.paper });
        const delay = Math.round((tool.cooldown - item.intervalReduction) * 1000 / TICK_RATE);
        const reach = attackReach(id, tool.reach + item.reachBonus, this.stage.rules.sweptMelee);
        this.text(`射程 ${reach} · 攻击间隔 ${delay} 毫秒`,
            180, y - 319, { width: 306, size: 14, color: BENCH.weapon.accent });
        if (item.next) this.text(item.next.detail, 105, y - 373,
            { width: 174, height: 40, left: true, size: 14, color: BENCH.paper });
        this.benchButton(item.next ? `训练 · ${item.next.price} 凭证` : '已满级', 266, y - 373, 146, () => {
            if (campaign.trainWeapon(id, profile.revision)) this.play('purchase');
        }, { enabled: canTrain, primary: canTrain });
        this.text('开局配件', 73, y - 422, { width: 111, left: true, size: 16, bold: true, color: BENCH.attachment.accent });
        if (!item.starterAttachments.length) {
            benchPlate(this.ui, 16, y - 491, 328, 52, BENCH.recess, BENCH.edge);
            benchLock(this.ui, 39, y - 465, BENCH.muted);
            this.text('武器练到 3 级解锁', 176, y - 465, { width: 238, left: true, size: 13, color: BENCH.muted });
            return;
        }
        const starterId = item.starterAttachments[0];
        const part = getEquipmentOffer(starterId)!;
        const equipped = item.starterAttachment === starterId;
        const held = this.touchTarget(180, y - 476, 328, 67, () => {
            if (campaign.selectStarterAttachment(id, equipped ? null : starterId, profile.revision)) this.play('purchase');
        });
        benchPlate(this.ui, 16, y - 510, 328, 69, BENCH.attachment.fill, equipped || held ? BENCH.attachment.accent : BENCH.edge);
        this.skin?.uiIcon(part.id, 43, y - 476, 36, part.icon);
        this.text(part.name, 154, y - 463, { width: 178, left: true, size: 16, bold: true, color: BENCH.paper });
        this.text(equipped ? '已装 · 卸下' : '装上', 284, y - 463,
            { width: 98, size: 13, color: equipped ? BENCH.attachment.accent : BENCH.yellow });
        this.text(part.detail, 198, y - 487, { width: 265, left: true, size: 12, color: BENCH.muted });
    }

    private archiveStages(): readonly CampaignStage[] {
        const cleared = this.campaign!.profile.clearedStages;
        return CAMPAIGN_CATALOG.filter(stage => cleared.includes(stage.id));
    }

    private openResultArchive(): void {
        const index = this.archiveStages().findIndex(stage => stage.id === this.stage.id);
        if (index < 0) return;
        this.selectedStage = this.stage;
        this.archiveIndex = index;
        this.archiveKind = this.stage.archiveClue ? 'clue' : 'receipt';
        this.workshopTab = 'archive';
        this.workshopFromResult = true;
        this.campaignPage = 'workshop';
    }

    private drawArchive(y: number): void {
        const records = this.archiveStages();
        const index = Math.min(this.archiveIndex, Math.max(0, records.length - 1));
        const record = records[index];
        const pages: { kind: 'receipt' | 'radio' | 'clue'; label: string; title: string; text: string }[] = [{
            kind: 'receipt', label: '结单', title: record?.title ?? '',
            text: record?.clear ?? '还没有结单记录。',
        }];
        if (record?.radio) pages.push({
            kind: 'radio', label: '电台', title: record.chapterEnd ? '收工时' : '开工前', text: record.radio,
        });
        if (record?.archiveClue) pages.push({ kind: 'clue', label: '附件', ...record.archiveClue });
        const selected = pages.find(page => page.kind === this.archiveKind) ?? pages[0];
        if (pages.length > 1) {
            pages.forEach((page, item) => this.button(page.label, 180 + (item - (pages.length - 1) / 2) * 104,
                y - 151, 96, 42, () => { this.archiveKind = page.kind; }, true, page.kind === selected.kind));
        }
        const top = y - (pages.length > 1 ? 181 : 137);
        this.block(16, top - 167, 328, 167, STOCK);
        this.block(29, top - 27, 3, 14, STAMP);
        this.skin?.uiIcon('ui/' + selected.kind, 315, top - 28, 26);
        if (record) this.text(`工单 ${record.id}${selected.kind === 'receipt' ? '' : ' · ' + record.title}`, 180, top - 20,
            { width: 280, left: true, size: 13, bold: true, color: STAMP });
        if (selected.title) this.text(selected.title, 180, top - 53, { width: 294, height: 36, left: true, size: 24, bold: true, color: INK });
        this.text(selected.text, 180, top - 108, { width: 294, height: 63, left: true, size: 16, color: CABINET });
        for (let x = 27; x < 335; x += 10) this.block(x, top - 155, 5, 1, STAMP);
        if (records.length > 1) {
            const change = (delta: number) => { this.archiveIndex = index + delta; this.archiveKind = 'receipt'; };
            const row = top - 205;
            this.button('上一条', 73, row, 114, 44, () => change(-1), index > 0);
            this.text(`${index + 1} / ${records.length}`, 180, row, { size: 13, color: DIM });
            this.button('下一条', 287, row, 114, 44, () => change(1), index + 1 < records.length);
        }
    }

    private drawCommissions(y: number): void {
        const badges = this.campaign!.profile.badges;
        (Object.keys(COMMISSIONS) as (keyof typeof COMMISSIONS)[]).forEach((badge, i) => {
            const done = badges.includes(badge);
            const cy = y - 155 - i * 46;
            this.block(16, cy - 19, 328, 38, CABINET);
            if (!done || !this.skin?.uiIcon('ui/medal', 34, cy, 20)) {
                this.text(done ? '✓' : '○', 34, cy, { size: 16, color: done ? MINT : DIM });
            }
            this.text(COMMISSIONS[badge], 192, cy, { width: 278, left: true, size: 14, color: done ? PAPER : DIM });
        });
    }

    private drawCloud(): void {
        this.cover();
        this.dispatchHeader('返回维修站', () => { this.campaignPage = 'workshop'; });
        this.text('抖音账号云档', 180, Math.min(484, this.dispatchHeaderY() - 44), { size: 26, bold: true });
        this.text('备份通关记录、已解锁的武器和改装方案。凭证和正在打的这一局只存本机。',
            180, 405, { width: 296, height: 79, size: 17, color: STOCK });
        if (this.cloudMessage) this.text(this.cloudMessage, 180, 338, { width: 300, size: 14, color: MINT });
        if (this.cloud?.binding) {
            this.button('立即同步', 180, 245, 278, 48, () => { void this.syncCloud(); }, true, true, true);
            this.button('返回游客档', 180, 177, 278, 47, () => {
                if (!this.cloud!.disconnect()) {
                    this.cloudMessage = '没存上账号设置，下次打开可能还是绑定状态。';
                }
                this.loadCampaign();
            });
        } else if (this.confirmedCloudScope) {
            this.button('绑定并导入本机解锁', 180, 267, 278, 48, () => { void this.connectCloud(true); }, true, true, true);
            this.button('只用账号存档', 180, 197, 278, 47, () => { void this.connectCloud(false); });
        } else {
            this.button('验证当前账号', 180, 245, 278, 48, () => { void this.discoverCloud(); }, true, true, true);
        }
    }

    private async discoverCloud(): Promise<void> {
        if (!this.cloud || this.cloudBusy) return;
        this.cloudBusy = true;
        const result = await this.cloud.discover();
        if (!this.isValid || result.status === 'stale') return;
        this.cloudBusy = false;
        this.confirmedCloudScope = result.status === 'confirmed' ? result.scope : undefined;
        this.cloudMessage = this.confirmedCloudScope ? '账号验证通过。要带上游客档的解锁记录吗？' : '账号验证失败。';
    }

    private async connectCloud(importGuest: boolean): Promise<void> {
        const scope = this.confirmedCloudScope;
        if (!this.cloud || !scope || this.cloudBusy) return;
        this.confirmedCloudScope = undefined;
        this.cloudBusy = true;
        const result = await this.cloud.connect(scope, importGuest ? this.campaign?.backup() : undefined);
        if (!this.isValid || result.status === 'stale') return;
        this.cloudBusy = false;
        if (result.status === 'bound') {
            this.cloudMessage = '已打开账号存档。';
            this.loadCampaign();
            void this.syncCloud();
        } else {
            this.cloudMessage = '绑定没成功，已打开游客档。';
        }
    }

    private campaignFailure(data: Checkpoint): { heading: string; detail: string } {
        const report = data.reports?.[data.reports.length - 1];
        const directive = this.run.rules.waves[data.wave].directive;
        if (data.finishReason === 'timeout') {
            switch (report?.failureDetail) {
                case 'objective': return { heading: '作业超时', detail: directive?.label ?? this.stage.failure };
                case 'boss': return { heading: '首领战超时', detail: campaignWaveHint(this.run.rules, data.wave, this.runMode) };
                case 'takeover': return { heading: '接管超时', detail: '去中央控制台，在圈内站到进度条填满。' };
                case 'holdout': return { heading: '未清完增援', detail: '完成作业后还要打掉最后一批敌机。' };
                default: return { heading: '出勤超时', detail: this.stage.failure };
            }
        }
        if (data.finishReason === 'objective-failed') {
            switch (report?.failureDetail ?? directive?.type) {
                case 'thermal': return { heading: '冷库失温', detail: this.stage.failure };
                case 'escort': return { heading: directive?.variant === 'lift' ? '货梯损坏' : '电池车损坏', detail: this.stage.failure };
                case 'relay': return { heading: '中继损坏', detail: this.stage.failure };
                default: return { heading: '作业中止', detail: this.stage.failure };
            }
        }
        const hit = report?.defeatedBy;
        return { heading: '体力耗尽', detail: hit && HIT_LABEL[hit] ? `最后一击　${HIT_LABEL[hit]}` : this.stage.failure };
    }

    private drawWeaponUnlock(unlock: WeaponUnlock): void {
        this.benchBackdrop();
        const top = this.benchHeader('首通奖励');
        const center = (top + this.footer + 52) / 2;
        const progress = Math.min(1, unlock.elapsed / .85);
        const ease = 1 - (1 - progress) ** 3;
        const radius = 47 + 28 * ease;
        const g = this.ui;
        const trayBottom = center - 92;
        benchPlate(g, 26, trayBottom - 5, 308, 182, BENCH.shadow, undefined, 16);
        benchPlate(g, 26, trayBottom, 308, 182, BENCH.steel, BENCH.edge, 16);
        benchPlate(g, 42, trayBottom + 13, 276, 154, BENCH.recess, BENCH.edge, 13);
        benchScrew(g, 45, trayBottom + 174);
        benchScrew(g, 314, trayBottom + 7);
        this.block(128, trayBottom + 4, 104, 3, BENCH.yellow);
        g.fillColor = BENCH.shadow;
        g.ellipse(180, center - 48, 65, 10);
        g.fill();
        g.strokeColor = BENCH.edge;
        g.lineWidth = 1;
        g.ellipse(180, center - 46, 66, 12);
        g.stroke();
        if (progress < 1) {
            g.strokeColor = new Color(BENCH.yellow.r, BENCH.yellow.g, BENCH.yellow.b, Math.round(212 * (1 - progress)));
            g.lineWidth = 2;
            g.circle(180, center, radius);
            g.stroke();
        }
        for (let i = 0; i < 12 && progress < 1; i++) {
            const angle = i * Math.PI / 6 + .24 * progress;
            const distance = radius + (i % 3) * 6;
            const x = 180 + Math.cos(angle) * distance;
            const y = center + Math.sin(angle) * distance;
            g.fillColor = new Color(251, 199, 108, Math.round(255 * (1 - progress)));
            g.rect(x - 2, y - 2, 4, 4);
            g.fill();
        }
        this.text('已解锁', 180, center + 117, { width: 328, size: 24, bold: true, color: BENCH.yellow });
        this.skin?.drawToolReward(unlock.tool, 180, center - (1 - ease) * 14, 58 + ease * 80, ease);
        const tool = TOOLS[unlock.tool];
        this.text(tool.name, 180, center - 117, { height: 42, width: 320, size: 32, bold: true, color: BENCH.paper });
        this.text(tool.detail, 180, center - 151, { width: 306, height: 36, size: 15, color: BENCH.muted });
        const upgrade = WORKSHOP_TIERS.find(tier => tier.stage === this.stage.id);
        if (upgrade) this.text(`工位升级，下次出勤带 ${upgrade.supplies} 个零件`,
            180, center - 183, { width: 316, size: 14, color: BENCH.attachment.accent });
        this.benchButton('查看结单', 180, this.footer + 36, 328, () => { this.weaponUnlock = undefined; },
            { primary: true, height: 52 });
    }

    private drawResultTicket(heading: string, narrative: string, top: number, artHeight: number, ending: boolean,
        accent: Color): number {
        const g = this.ui;
        const noteTop = top - artHeight;
        const bottom = noteTop - 98;
        benchPlate(g, 16, bottom - 4, 328, top - bottom, BENCH.shadow, undefined, 10);
        benchPlate(g, 16, bottom, 328, top - bottom, BENCH.steel, BENCH.edge, 10);
        this.block(17, noteTop - 3, 326, 3, accent);
        benchScrew(g, 325, noteTop - 18);
        if (artHeight >= 24) {
            this.skin?.dispatchArt(180, noteTop + artHeight / 2, ending ? 'ending' : this.stage.id, this.stage.arena, artHeight);
        }
        this.text(`${this.stage.id}  ${this.stage.title}`, 179, noteTop - 17,
            { left: true, width: 292, height: 22, size: 12, bold: true, color: accent });
        this.text(heading, 179, noteTop - 42,
            { left: true, width: 292, height: 34, size: 26, bold: true, color: BENCH.paper });
        this.text(narrative, 179, noteTop - 75,
            { left: true, width: 292, height: 33, size: 15, color: BENCH.paper });
        return bottom;
    }

    private drawCampaignResult(won: boolean): void {
        const data = this.run.data!;
        const campaign = this.campaign!;
        const receipt = campaign.receipt(data.runId);
        const weapon = receipt?.weapon ?? '';
        const earned = isTool(weapon) ? weapon : undefined;
        const next = CAMPAIGN_CATALOG.find(stage => stage.prerequisite === this.stage.id);
        const handoff = won && receipt?.firstClear && next && next.chapter !== this.stage.chapter;
        const ending = won && !next;
        const showBuildChoice = !!receipt && receipt.builds.length > 1 && !receipt.chosenBuild;
        const reports = data.reports ?? [];
        const ticket = won ? { heading: ending ? '街区亮灯了' : '工单完成', detail: this.stage.clear }
            : this.campaignFailure(data);
        this.benchBackdrop();
        const archiveShortcut = won && this.stage.chapterEnd && campaign.profile.clearedStages.includes(this.stage.id);
        const archiveLabel = ending ? '港区来信' : this.stage.archiveClue ? '授权记录' : '线索档案';
        const top = this.benchHeader('夜班修理局', archiveShortcut ? archiveLabel : '维修站', archiveShortcut ? () => this.openResultArchive() : () => {
            this.selectedStage = this.stage;
            this.workshopTab = 'station';
            this.workshopFromResult = true;
            this.campaignPage = 'workshop';
        });
        const bottom = this.footer + 24;
        const g = this.ui;
        const accent = ending ? BENCH.yellow : won ? BENCH.attachment.accent : RED;
        const chapter = CAMPAIGN_CHAPTERS.find(candidate => candidate.id === this.stage.chapter);
        const reward = earned ? '解锁 ' + TOOLS[earned].name
            : won && this.stage.chapterEnd ? chapter?.restored : undefined;
        const radio = won && this.stage.chapterEnd && (receipt?.firstClear || ending) ? this.stage.radio : undefined;
        const detailsHeight = 30 + (reward ? 30 : 0) + (radio ? 33 : 0);
        const minDetailsBottom = bottom + (showBuildChoice ? 136 : 86);
        const artTop = top - 48;
        // Shrink only the photo when a receipt has a new tool, a radio line, and build selection.
        const artHeight = Math.min(164, Math.max(0, artTop - minDetailsBottom - detailsHeight - 172));
        const ticketBottom = this.drawResultTicket(ticket.heading, ticket.detail, artTop, artHeight, ending, accent);
        const statsBottom = ticketBottom - 64;
        benchPlate(g, 16, statsBottom - 3, 328, 54, BENCH.shadow);
        benchPlate(g, 16, statsBottom, 328, 54, BENCH.recess, BENCH.edge);
        const kills = reports.reduce((sum, report) => sum + report.kills, 0);
        const wideSweeps = reports.reduce((sum, report) => sum + (report.wideSweeps ?? 0), 0);
        const stats = [['波次', String(data.wave + 1)], ['击倒敌机', String(kills)],
            wideSweeps ? ['扳手大回扫', wideSweeps + ' 次'] : ['剩余零件', String(data.parts)]];
        stats.forEach(([label, value], index) => {
            const x = 16 + (index + .5) * 328 / stats.length;
            if (index) this.block(x - 328 / 6, statsBottom + 11, 1, 32, BENCH.edge);
            this.text(label, x, statsBottom + 13, { width: 100, height: 18, color: BENCH.muted, size: 12 });
            this.text(value, x, statsBottom + 34, { width: 95, height: 28, size: 23, bold: true, color: BENCH.paper });
        });
        const detailsTop = statsBottom - 10;
        benchPlate(g, 16, detailsTop - detailsHeight, 328, detailsHeight, BENCH.steel, BENCH.edge);
        this.block(16, detailsTop - detailsHeight + 8, 3, detailsHeight - 16, accent);
        let lineY = detailsTop - 16;
        if (reward) {
            if (earned) this.skin?.uiIcon(earned, 42, lineY, 26);
            this.text(reward, earned ? 192 : 180, lineY, {
                width: earned ? 262 : 298, left: true, size: earned ? 16 : 14, color: accent,
            });
            this.block(32, lineY - 13, 296, 1, BENCH.edge);
            lineY -= 29;
        }
        const balance = '凭证余额 ' + campaign.profile.credits;
        const income = receipt?.aid ? '补助 +1' : receipt?.challengeBonus
            ? `凭证 +${receipt.credits}（含加班首通 ${receipt.challengeBonus}）`
            : receipt?.credits ? `凭证 +${receipt.credits}` : '';
        this.text([income, balance].filter(Boolean).join('  ·  '), 180, lineY,
            { width: 298, height: 23, left: true, size: 13, color: BENCH.paper });
        if (radio) {
            this.skin?.uiIcon(radio.startsWith('陈栖：') ? 'radio-chenqi' : 'radio-aruan', 43, lineY - 29, 23);
            this.text(radio, 193, lineY - 29, { width: 266, height: 31, left: true, size: 12, color: BENCH.muted });
        }
        if (receipt && showBuildChoice) {
            const width = 328 / receipt.builds.length;
            receipt.builds.forEach((build, i) => this.benchButton(PAIR_LABEL[build], 16 + (i + .5) * width,
                bottom + 111, width - 6, () => { campaign.chooseInspectorBuild(data.runId, build); }, { height: 40 }));
        }
        const map = () => {
            this.focusMap(won && next && !handoff ? next : this.stage);
            this.campaignPage = 'map';
        };
        const dispatch = (stage: CampaignStage, starter?: ToolId) => {
            this.focusMap(stage);
            this.openStage(stage);
            if (starter && campaign.canUseStarter(stage.id, starter)) this.startWeapon = starter;
        };
        if (won && next && earned) {
            const label = handoff ? `第${'一二三四'[Number(next.chapter) - 1]}章 · ${next.title}  ›`
                : `带${TOOLS[earned].name}去${next.title}  ›`;
            this.benchButton(label, 180, bottom + 57, 328,
                () => handoff ? this.beginChapterHandoff(next) : dispatch(next, earned), { primary: true, height: 49 });
            this.benchButton('选装备', 68, bottom, 104, () => dispatch(next, data.tools[0].id));
            this.benchButton('重打本关', 180, bottom, 104, () => dispatch(this.stage));
            this.benchButton('路线图', 292, bottom, 104, map);
        } else {
            this.benchButton('返回路线图', 180, bottom + 57, 328, map, { primary: true, height: 49 });
            const replay = ending && earned ? `带${TOOLS[earned].name}重打` : '重打本关';
            this.benchButton(replay, 180, bottom, 328, () => dispatch(this.stage, ending ? earned : undefined));
        }
    }

    private drawRevive(): void {
        const data = this.run.data!;
        if (DEBUG && this.reviveAd) {
            const adAttempt = `${data.runId}:${data.revision}`;
            if (this.loggedReviveOffer !== adAttempt) {
                this.loggedReviveOffer = adAttempt;
                this.campaignTrace('ad_eligible', { adAttempt }, data);
            }
        }
        this.benchBackdrop();
        const top = this.benchHeader(`第 ${data.wave + 1} 波`);
        const center = (top + this.footer) / 2;
        benchPlate(this.ui, 24, center - 115, 312, 235, BENCH.shadow, undefined, 12);
        benchPlate(this.ui, 24, center - 110, 312, 235, BENCH.steel, BENCH.edge, 12);
        this.block(25, center + 102, 4, 17, RED);
        this.text('体力耗尽', 180, center + 80, { width: 280, height: 46, size: 29, bold: true, color: BENCH.paper });
        const message = this.watchingRevive ? '视频播放中。'
            : this.reviveFeedback === 'unavailable' ? '视频暂时播不了。'
            : this.reviveFeedback === 'incomplete' ? '视频没看完，未复活。'
            : this.reviveAd ? '看完视频，从这波重打。' : '';
        if (message) this.text(message, 180, center + 35, { width: 280, size: 15, color: BENCH.muted });
        if (this.reviveDecision?.attempted) {
            this.benchButton('重试保存', 180, center - 30, 264, () => this.finishRevive(), { primary: true, height: 48 });
        } else {
            if (this.reviveAd) this.benchButton('看视频复活', 180, center - 22, 264, () => { void this.watchRevive(); },
                { enabled: !this.watchingRevive && !this.reviveDecision, primary: true, height: 47 });
            this.benchButton('直接结算', 180, center - (this.reviveAd ? 77 : 30), 264, () => this.settleWithoutRevive(),
                { enabled: !this.reviveDecision, primary: !this.reviveAd });
        }
    }

    private settleWithoutRevive(): void {
        const run = this.run;
        const data = run.data;
        if (!run.canRevive || !data || run.background || this.cloudBusy || this.reviveDecision) return;
        this.watchingRevive = false;
        this.reviveFeedback = undefined;
        this.reviveAd?.cancel();
        this.reviveDecision = { run, runId: data.runId, revision: data.revision, rewarded: false, attempted: false };
        this.finishRevive();
    }

    private async watchRevive(): Promise<void> {
        const run = this.run;
        const data = run.data;
        if (!this.reviveAd || !run.canRevive || !data || run.background || this.cloudBusy || this.watchingRevive || this.reviveDecision) return;
        this.watchingRevive = true;
        this.reviveFeedback = undefined;
        this.trace('revive_requested');
        const stageId = DEBUG ? this.stage.id : undefined;
        const adAttempt = `${data.runId}:${data.revision}`;
        this.campaignTrace('ad_request', { adAttempt }, data, stageId);
        const isCurrent = () => this.isValid && this.run === run && run.data === data && this.watchingRevive;
        let shown = false;
        const rewarded = await this.reviveAd.show(() => {
            if (!isCurrent()) return;
            shown = true;
            this.campaignTrace('ad_shown', { adAttempt }, data, stageId);
        });
        if (!isCurrent()) return;
        this.watchingRevive = false;
        if (!rewarded) {
            this.reviveFeedback = shown ? 'incomplete' : 'unavailable';
            return;
        }
        this.campaignTrace('ad_completed', { adAttempt }, data, stageId);
        this.reviveDecision = { run, runId: data.runId, revision: data.revision, rewarded: true, attempted: false };
    }

    private finishRevive(): void {
        const decision = this.reviveDecision;
        if (!decision || this.cloudBusy || decision.run.background) return;
        const { run, runId, revision, rewarded } = decision;
        const data = run.data;
        if (run !== this.run || data?.runId !== runId || data.revision !== revision) {
            this.reviveDecision = undefined;
            return;
        }
        if (rewarded ? run.revive(runId, revision) : run.declineRevive()) {
            this.reviveDecision = undefined;
            if (rewarded) {
                this.trace('revive_committed');
                this.campaignTrace('ad_revived', { adAttempt: `${runId}:${revision}` }, data);
            }
            else this.reconcileCampaignResult();
        } else {
            decision.attempted = true;
        }
    }

    private drawCampaignError(): void {
        this.cover();
        const error = this.campaignError;
        if (error === 'read') {
            this.text('读不到进度', 180, 410, { size: 26, color: AMBER });
            this.text('原存档还在。', 180, 351, { width: 315, size: 15, color: DIM });
            this.button('重新读取', 180, 276, 218, 48, () => this.loadCampaign(), true, true, true);
            return;
        }
        if (error === 'receipt') {
            this.text('查不到通关记录', 180, 410, { size: 26, color: AMBER });
            this.text('原进度还在。这次首通奖励尚未发放。', 180, 351, { width: 315, size: 15, color: DIM });
            this.button('返回工单', 180, 276, 218, 48, () => this.loadCampaignStage(this.stage), true, true, true);
            return;
        }
        const awarding = error === 'reward';
        this.text(awarding ? '奖励没结算' : '出勤没存上', 180, 410, { size: 26, color: AMBER });
        this.text(awarding ? '通关已保存，重试只发一次奖励。' : '存好这张工单才能开打。',
            180, 351, { width: 315, size: 15, color: DIM });
        this.button('重试保存', 180, 276, 218, 48, () => {
            if (awarding) this.reconcileCampaignResult();
            else if (this.queuedStart) this.commitCampaignStart();
            else this.loadCampaign();
        }, true, true, true);
        if (error === 'register' || error === 'start') {
            this.button('返回工单', 180, 207, 218, 45, () => {
                this.loadCampaign();
                if (!this.campaignError) this.campaignPage = 'map';
            });
        }
    }

    private drawBattleHud(seconds: number, clearProgress: Battle['clearProgress'], waveCue?: string): void {
        const battle = this.run.battle!;
        const data = this.run.data!;
        const defeated = clearProgress ? `击倒 ${clearProgress.kills} / ${clearProgress.total}` : '';
        const waveStatus = `第 ${battle.wave + 1} 波${clearProgress ? ` · ${defeated}` : `还剩 ${seconds} 秒`}`;
        if (this.campaign && this.run.paused) {
            this.drawCampaignPause(waveStatus);
            return;
        }
        const pauseTop = Math.min(this.top, this.capsuleCeiling - 22);
        const pauseBelowField = this.campaign && pauseTop - 22 < FIELD.top;
        const health = `体力 ${battle.player.hp}/${battle.maxHp}${battle.shielded ? ' 盾' : ''}`;
        const timer = `${Math.floor(seconds / 60)}:${('0' + seconds % 60).slice(-2)}`;
        const lowHealth = battle.player.hp <= 2;
        if (this.campaign) this.drawCampaignMeters(battle, health, defeated, timer, seconds, clearProgress, waveCue);
        else {
            this.text(health, 60, this.top + 7, { size: 14 });
            this.text(`第 ${battle.wave + 1} 波`, 152, this.top + 3, { size: 15 });
            if (defeated) this.text(defeated, 224, this.top + 3, { width: 83, size: 15, bold: true, color: AMBER });
            else this.text(timer, 220, this.top, { size: 19, color: seconds <= 10 ? RED : AMBER });
        }
        const pipGap = Math.min(8, 85 / battle.maxHp);
        const filledPip = lowHealth ? RED : this.campaign ? BENCH.attachment.accent : MINT;
        const emptyPip = this.campaign ? BENCH.edge : PANEL;
        for (let i = 0; i < battle.maxHp; i++) {
            this.ui.fillColor = i < battle.player.hp ? filledPip : emptyPip;
            this.ui.rect((this.campaign ? 24 : 18) + i * pipGap, this.top - 10, pipGap - 2, 4);
            this.ui.fill();
        }
        const active = (tag: keyof typeof PAIR_LABEL) => battle.equipment?.builds.includes(tag) ?? hasPair(data.tools, tag);
        const perks = [
            active('arc') ? `${battle.rules.sweptMelee ? '电弧' : '连锁'} ${battle.triggers.arc}` : '',
            active('magnet') ? `脉冲 ${battle.magnetCharge}/5` : '',
            active('heat') ? `过热 ${battle.triggers.heat}` : '',
        ].filter(Boolean);
        if (this.campaign) {
            if (this.weaponShowcase !== 'bench') {
                benchPlate(this.ui, 16, 114, 103, 29, BENCH.recess, BENCH.edge, 5);
                this.skin?.uiIcon('scrap', 33, 129, 17);
                this.text(`零件 ${data.parts + battle.collected}`, 77, 129,
                    { width: 69, size: 13, bold: true, color: BENCH.yellow });
            }
            if (this.weaponShowcase === 'bench' && !this.run.paused) {
                const switchTool = (tool: ToolId, special: boolean) => {
                    const url = new URL(globalThis.location.href);
                    url.searchParams.set('tool', tool);
                    url.searchParams.set('special', special ? '1' : '0');
                    globalThis.location.assign(url.href);
                };
                const index = showcaseLoadouts.bench.indexOf(this.benchTool);
                this.benchButton(`${TOOLS[this.benchTool].name} ›`, 85, 129, 140,
                    () => switchTool(showcaseLoadouts.bench[(index + 1) % showcaseLoadouts.bench.length], this.benchModified), { height: 34 });
                this.benchButton(this.benchModified ? '拆下专属件' : '装上专属件', 212, 129, 104,
                    () => switchTool(this.benchTool, !this.benchModified), { height: 34 });
            } else if ((this.weaponShowcase === 'floating' || this.weaponShowcase === 'held') && !this.run.paused) {
                this.benchButton(this.weaponShowcase === 'floating' ? '悬浮 · 切换手持' : '手持 · 切换悬浮', 198, 129, 137, () => {
                    this.weaponShowcase = this.weaponShowcase === 'floating' ? 'held' : 'floating';
                    this.visibleUi = '';
                }, { height: 31 });
            } else if (perks.length) {
                const width = pauseBelowField ? 135 : 218;
                benchPlate(this.ui, 126, 114, width, 29, BENCH.recess, BENCH.edge, 5);
                this.text(perks.join('   ·   '), 126 + width / 2, 129,
                    { width: width - 14, size: 12, color: BENCH.weapon.accent });
            }
        } else this.text([`零件 ${data.parts + battle.collected}`, ...perks].join('   ·   '), 180, 130, { color: MINT, size: 13 });
        if (!this.run.paused) {
            const pause = () => { this.suspend(); this.trace('pause'); };
            if (this.campaign) this.benchButton('暂停', 308, pauseBelowField ? 129 : pauseTop, 72, pause);
            else this.button('暂停', 306, pauseTop, 69, 44, pause);
        }
        const mission = battle.mission;
        const chapterBoss = battle.chapterBoss;
        const infoX = this.joystickMode ? 226 : 180;
        const infoWidth = this.joystickMode ? 230 : 324;
        const radio = this.battleRadio(battle.wave, battle.tick);
        if (radio && !this.run.paused) {
            const left = this.joystickMode ? 108 : 15;
            benchPlate(this.ui, left, this.footer - 7, 345 - left, 39, BENCH.recess, BENCH.edge);
            const portrait = radio.startsWith('陈栖：') ? 'radio-chenqi' : 'radio-aruan';
            this.skin?.uiIcon(portrait, left + 21, this.footer + 12, 31);
            this.text(radio, this.joystickMode ? 246 : 195, this.footer + 11,
                { width: this.joystickMode ? 188 : 281, height: 35, left: true, size: 13, color: BENCH.paper });
        }
        if (!this.run.paused && (mission || chapterBoss)) {
            const status = mission?.escort ?? mission?.integrity;
            const job = chapterBoss && chapterBoss.hp <= 0 && chapterBoss.kind !== 'core' ? mission?.label : null;
            const label = battle.practiceWarning ? '离开亮起的轨道' : job ?? chapterBoss?.instruction ?? mission?.label ?? '';
            const goal = status ? `${label}  ·  ${status.hp}/${status.maxHp}` : label;
            if (this.campaign && (goal || chapterBoss)) benchPlate(this.ui, infoX - infoWidth / 2, 48,
                infoWidth, 63, BENCH.recess, BENCH.edge, 6);
            if (goal) this.text(goal, infoX, 99, { width: infoWidth, size: this.joystickMode ? 14 : 16,
                bold: true, color: mission?.status === 'complete' ? MINT : AMBER });
            if (chapterBoss) {
                const active = chapterBoss.hp > 0;
                this.text(`${chapterBoss.title}  ·  ${active ? `阶段 ${chapterBoss.stage}` : '已停机'}`, infoX, 72,
                    { width: infoWidth, size: 13, color: this.campaign ? BENCH.paper : STOCK });
                if (active) {
                    const width = this.joystickMode ? 210 : 264;
                    this.block(infoX - width / 2, 56, width, 4, this.campaign ? BENCH.edge : PANEL);
                    this.block(infoX - width / 2, 56, width * chapterBoss.hp / chapterBoss.maxHp, 4,
                        chapterBoss.vulnerable ? this.campaign ? BENCH.yellow : BOSS : PURPLE);
                }
            }
        }
        if (!this.learnedMove && !battle.boss && !mission && !radio) {
            const y = Math.max(this.footer + 22, 75);
            if (this.joystickMode) {
                this.text('按住屏幕下方，拖动就能走', infoX, y + 9, { width: infoWidth, size: 15, bold: true, color: BENCH.paper });
                this.text('武器自动攻击', infoX, y - 12, { width: infoWidth, size: 13, color: BENCH.muted });
            } else if (this.campaign) {
                this.ui.strokeColor = BENCH.edge;
                this.ui.lineWidth = 2;
                this.ui.ellipse(106, y, 13, 8);
                this.ui.stroke();
                this.ui.fillColor = BENCH.weapon.accent;
                this.ui.circle(106, y, 2);
                this.ui.fill();
                this.text('点地面移动', 205, y + 9, { left: true, width: 140, size: 16, bold: true, color: BENCH.paper });
                this.text('武器自动攻击', 205, y - 12, { left: true, width: 140, size: 13, color: BENCH.muted });
            } else this.text('点地面移动，武器自动攻击', 180, y, { color: DIM });
        }
        if (battle.boss && !chapterBoss && !this.run.paused) {
            const boss = battle.boss;
            const health = Math.max(0, boss.unit.hp);
            const y = 102;
            const instruction = boss.phase === 'warning' ? INSPECTOR_WARNING[boss.attack]
                : boss.phase === 'recover' ? '趁它停下打' : '';
            const count = `${Math.ceil(health)}/${boss.maxHp}`;
            if (this.campaign) benchPlate(this.ui, infoX - infoWidth / 2, 78, infoWidth, 34, BENCH.recess, BENCH.edge, 5);
            this.text(`巡检机  ${count}${instruction ? ' · ' + instruction : ''}`, infoX, y,
                { width: infoWidth - 8, color: this.campaign ? BENCH.paper : BOSS, size: 13 });
            const width = this.joystickMode ? 210 : 236;
            this.ui.fillColor = this.campaign ? BENCH.edge : PANEL;
            this.ui.rect(infoX - width / 2, y - 17, width, 4);
            this.ui.fill();
            this.ui.fillColor = this.campaign ? BENCH.yellow : BOSS;
            this.ui.rect(infoX - width / 2, y - 17, width * health / boss.maxHp, 4);
            this.ui.fill();
        }
        if (!this.run.paused) return;
        this.cover();
        this.labelIndex = 0;
        this.text('已暂停', 180, 405, { size: 27 });
        this.text(waveStatus, 180, 370, { color: DIM });
        this.button('继续战斗', 180, 318, 218, 48, () => {
            this.run.resume();
            this.trace('resume');
        }, true, true, true);
        this.button('重新选择起手改装', 180, 246, 218, 45, () => { this.chooseRoute = true; });
        if (this.fullRun) this.button(this.soundEnabled ? '音效 · 开' : '音效 · 关', 180, 182, 130, 42,
            () => this.toggleBattleSound());
        if (this.settingsError) this.text('音效设置没存上。', 180, 136, { color: AMBER });
    }

    private drawCampaignMeters(battle: Battle, health: string, defeated: string, timer: string, seconds: number,
        clearProgress: Battle['clearProgress'], waveCue?: string): void {
        const top = this.top;
        benchPlate(this.ui, 16, top - 30, 103, 57, BENCH.recess, BENCH.edge, 6);
        this.text(health, 68, top + 11, { width: 91, size: 15, bold: true,
            color: battle.player.hp <= 2 ? RED : BENCH.paper });
        this.text(this.stage.title, 68, top - 20, { width: 92, size: 11, color: BENCH.muted });

        benchPlate(this.ui, 127, top - 30, 137, 57, BENCH.recess, BENCH.edge, 6);
        this.text(`第 ${battle.wave + 1} 波`, 158, top + 10, { width: 59, size: 13, bold: true, color: BENCH.paper });
        const fraction = clearProgress ? clearProgress.kills / Math.max(1, clearProgress.total)
            : seconds * TICK_RATE / Math.max(1, battle.duration);
        const finish = !!clearProgress && fraction >= 1;
        const accent = finish ? BENCH.attachment.accent : !clearProgress && seconds <= 10 ? RED : BENCH.yellow;
        this.text(defeated || timer, 226, top + 10, { width: 70, size: defeated ? 14 : 19, bold: true, color: accent });
        this.block(135, top - 10, 121, 3, BENCH.edge);
        if (fraction > 0) this.block(135, top - 10, 121 * Math.min(1, fraction), 3, accent);
        if (waveCue) this.text(waveCue, 195, top - 21, { width: 122, height: 15, size: 11, color: BENCH.muted });
    }

    private drawCampaignPause(waveStatus: string): void {
        const padding = HEIGHT * (this.backdropScale - 1) / 2;
        this.block(0, -padding, WIDTH, HEIGHT + 2 * padding, new Color(8, 12, 11, 204));
        this.benchHeader('工单 ' + this.stage.id + '  /  ' + this.stage.title);
        const center = Math.round((this.top + this.footer) / 2);
        const g = this.ui;
        benchPlate(g, 28, center - 154, 304, 284, BENCH.shadow, undefined, 12);
        benchPlate(g, 28, center - 148, 304, 284, BENCH.steel, BENCH.edge, 12);
        benchScrew(g, 45, center + 119);
        benchScrew(g, 315, center + 119);
        this.text('已暂停', 180, center + 95, { size: 28, bold: true, color: BENCH.paper });
        this.text(waveStatus, 180, center + 60, { width: 260, size: 14, color: BENCH.muted });
        this.benchButton('继续战斗', 180, center + 9, 258, () => {
            this.run.resume();
            this.trace('resume');
        }, { primary: true, height: 51 });
        this.benchButton('返回路线图', 180, center - 52, 258, () => { this.campaignPage = 'map'; });
        if (this.fullRun) this.benchButton(this.soundEnabled ? '音效 · 开' : '音效 · 关', 180, center - 109, 130,
            () => this.toggleBattleSound());
        if (this.settingsError) this.text('音效设置没存上。', 180, center - 172, { color: BENCH.yellow });
    }

    private toggleBattleSound(): void {
        const next = !this.soundEnabled;
        if (this.settings) this.updateSettings({ sound: next });
        else this.soundEnabled = next;
        if (this.soundEnabled) this.play('warning');
    }

    private battleRadio(wave: number, tick: number): string | undefined {
        return this.campaign && !this.stage.chapterEnd && wave === 0 && tick < 180
            && !this.campaign.profile.clearedStages.includes(this.stage.id) ? this.stage.radio : undefined;
    }

    private selectOffer(id: OfferId): void {
        if (this.selection !== id) {
            const tools = this.run.data!.tools;
            if (this.selection === null) this.slot = Math.max(0, tools.findIndex(tool => tool.mods.length < 2));
            this.selection = id;
            this.replacement = undefined;
            this.receipt = '';
        }
        this.trace('shop_focus', { item: id, weapon: this.slot, replaced: this.replacement });
    }

    private drawWeaponRow(tool: EquippedTool, index: number, y: number, part: ModId | null): void {
        const starter = STARTER[this.run.data!.route];
        const target = part !== null && this.slot === index;
        const selectWeapon = () => {
            if (this.slot !== index) this.replacement = undefined;
            this.slot = index;
            this.trace('shop_target', { weapon: index, replaced: this.replacement });
        };
        this.control(62, y, 92, 49, selectWeapon, !!part && (this.fullRun || tool.mods.length < 2), target, false, true);
        const calibration = [tool.tuning?.handling, tool.tuning?.finisher]
            .flatMap(choice => choice ? [TUNING_OPTIONS[choice].name] : []).join(' / ');
        const hasIcon = this.skin?.uiIcon(tool.id, 62, y + (calibration ? 13 : 9), calibration ? 19 : 24);
        this.text(TOOLS[tool.id].name, 62, calibration ? y - 2 : hasIcon ? y - 12 : y,
            { size: 14, width: 84, height: 19 });
        if (calibration) this.text(calibration, 62, y - 17, { size: 11, width: 90, height: 14, color: MINT });
        for (let socket = 0; socket < 2; socket++) {
            const old = tool.mods[socket];
            const append = socket === tool.mods.length;
            const replace = this.fullRun && tool.mods.length === 2 && old !== starter;
            const pending = target && (append || (old !== undefined && this.replacement === old));
            const x = 170 + socket * 117;
            this.control(x, y, 111, 49, () => {
                this.slot = index;
                this.replacement = replace ? old : undefined;
                this.trace('shop_target', { weapon: index, socket: socket + 1, replaced: this.replacement });
            }, !!part && (append || replace), pending, false, true);
            const visible = pending ? part : old;
            if (visible) this.skin?.uiIcon(visible, x - 37, y - 7, 25);
            const status = pending ? '待装入' : old === starter ? '固定' : !old ? '空' : '已装';
            this.text(`槽 ${socket + 1} · ${status}`, x, y + 12, { size: 12, color: pending ? MINT : DIM, width: 105 });
            this.text(visible ? MODS[visible].name : '空槽', x + (visible ? 14 : 0), y - 9,
                { size: 14, width: visible ? 76 : 100, color: visible ? PAPER : DIM });
        }
    }

    private drawTuning(tuning: NonNullable<Run['tuning']>): void {
        const data = this.run.data!;
        const y = this.dispatchHeaderY();
        this.cover();
        this.dispatchHeader('返回整备', () => { this.tuningPage = false; });
        this.text(tuning.step === 'handling' ? '工具校准' : '关底前校准', 118, y - 63,
            { width: 196, left: true, size: 26, bold: true });
        this.text(`${data.parts} 零件`, 290, y - 63, { width: 105, size: 17, color: MINT });
        this.text(tuning.purchased
            ? `${TOOLS[data.tools[tuning.purchased.toolIndex].id].name}已装上${TUNING_OPTIONS[tuning.purchased.choice].name}`
            : '本档只选一项，效果保留到本局结束。', 180, y - 101,
            { width: 322, size: 14, color: tuning.purchased ? MINT : STOCK });
        data.tools.forEach((tool, index) => {
            const cy = y - 195 - index * 154;
            this.block(16, cy - 61, 328, 137, CABINET);
            this.skin?.uiIcon(tool.id, 45, cy + 50, 31);
            this.text(TOOLS[tool.id].name, 162, cy + 49, { width: 185, left: true, size: 18, bold: true });
            if (tool.tuning?.handling) this.text(TUNING_OPTIONS[tool.tuning.handling].name, 282, cy + 48,
                { width: 101, height: 29, size: 13, color: MINT });
            tuning.choices.forEach((choice, column) => {
                const x = 99 + column * 162;
                const installed = tuning.purchased?.toolIndex === index && tuning.purchased.choice === choice.id;
                this.button(`${choice.name} · ${installed ? '已装' : tuning.cost}`, x, cy + 8, 145, 46, () => {
                    if (!this.run.tune(index, choice.id, data.revision)) return;
                    this.play('purchase');
                    this.trace('shop_tuning', { tool: tool.id, option: choice.id, cost: tuning.cost });
                }, !tuning.purchased && data.parts >= tuning.cost, installed);
                this.text(choice.detail, x, cy - 39,
                    { width: 145, height: 39, size: 13, color: installed ? MINT : DIM });
            });
        });
    }

    private clearEquipmentSelection(): void {
        this.equipmentSelection = null;
        this.equipmentTarget = undefined;
        this.equipmentDetails = undefined;
    }

    private selectEquipment(item: EquipmentOffer, shop: EquipmentShop): void {
        this.clearEquipmentSelection();
        this.receipt = '';
        this.equipmentSelection = item.id;
        this.equipmentDetails = { kind: 'offer' };
        if (item.kind === 'weapon') {
            this.equipmentTarget = { kind: 'weapon' };
        } else if (item.kind === 'attachment') {
            const weapon = shop.weapons.findIndex(weapon => item.id.startsWith(weapon.id + '/'));
            if (weapon === -1) return;
            this.equipmentFocus = weapon;
            const empty = shop.weapons[weapon].slots.find(slot => !slot.locked && !slot.item);
            if (empty) this.equipmentTarget = { kind: 'attachment', weapon, slot: empty.slot };
        } else {
            const empty = shop.gear.find(slot => !slot.locked && !slot.item);
            if (empty) this.equipmentTarget = { kind: 'gear', slot: empty.slot };
        }
    }

    private inspectEquipment(id: EquipmentOfferId, weapon?: number): void {
        this.clearEquipmentSelection();
        this.equipmentDetails = { kind: 'equipped', id, weapon };
    }

    private benchButton(label: string, x: number, y: number, width: number, action: () => void,
        { primary = false, enabled = true, height = 44 }: { primary?: boolean; enabled?: boolean; height?: number } = {}): void {
        const held = enabled && this.touchTarget(x, y, width, height, action);
        const fill = !enabled ? BENCH.recess : primary ? held ? BENCH.paper : BENCH.yellow : held ? BENCH.edge : BENCH.steel;
        benchPlate(this.ui, x - width / 2, y - height / 2, width, height, fill, primary && enabled ? undefined : BENCH.edge);
        this.text(label, x, y, { width: width - 12, size: primary ? 17 : 13, bold: primary,
            color: !enabled ? BENCH.muted : primary ? BENCH.ink : BENCH.paper });
    }

    private benchBackdrop(): void {
        if (this.scenery.workbench) return;
        const padding = HEIGHT * (this.backdropScale - 1) / 2;
        this.block(0, -padding, WIDTH, HEIGHT + 2 * padding, BENCH.ink);
    }

    private benchHeader(section: string, backLabel?: string, back?: () => void): number {
        const top = this.dispatchHeaderY();
        const y = top - 12;
        if (back && backLabel) this.benchButton(backLabel, 67, y, 102, back);
        else {
            this.block(16, y - 10, 3, 20, BENCH.yellow);
            this.text('夜班修理局', 106, y, { width: 162, size: 18, left: true, bold: true, color: BENCH.paper });
        }
        if (section) this.text(section, 257, y, { width: 172, size: 13, color: BENCH.muted });
        this.block(16, top - 38, 328, 1, BENCH.edge);
        return top;
    }

    private drawEquipmentShop(shop: EquipmentShop): void {
        const data = this.run.data!;
        const top = this.dispatchHeaderY();
        const footer = this.footer;
        const focus = Math.min(this.equipmentFocus, shop.weapons.length - 1);
        const weapon = shop.weapons[focus];
        const selected = shop.offers.find(item => item.id === this.equipmentSelection);
        const fitting = selected && !this.equipmentDetails ? selected : undefined;
        const gearBottom = footer + 61;
        const trayBottom = gearBottom + 96;
        const stockBottom = trayBottom + 151;
        const stockTop = top - 122;
        const g = this.ui;

        if (!this.scenery.workbench) this.block(0, 0, WIDTH, HEIGHT, BENCH.ink);
        this.benchButton('‹ 路线图', 61, top - 12, 90, () => {
            this.clearEquipmentSelection();
            this.campaignPage = 'map';
        });
        this.text(`${this.stage.id}  ${this.stage.title}`, 278, top - 12,
            { width: 136, size: 13, color: BENCH.muted });
        this.block(16, top - 38, 328, 1, BENCH.edge);
        this.text('整备台', 66, top - 61, { width: 100, size: 29, left: true, bold: true, color: BENCH.paper });
        this.text(`第 ${data.wave + 1} 波结束`, 160, top - 64, { width: 86, left: true, size: 13, color: BENCH.muted });
        benchPlate(g, 232, top - 81, 112, 34, BENCH.recess, BENCH.edge);
        this.skin?.uiIcon('scrap', 248, top - 64, 19);
        this.text('零件', 276, top - 64, { width: 32, size: 12, color: BENCH.muted });
        this.text(String(data.parts), 319, top - 64, { width: 42, size: 21, bold: true, color: BENCH.yellow });

        this.text('货架', 72, top - 105, { width: 112, size: 16, left: true, bold: true, color: BENCH.paper });
        const canRefresh = !shop.refreshed && data.parts >= REFRESH_COST && !fitting;
        const refresh = canRefresh && this.touchTarget(275, top - 104, 136, 36, () => {
            if (!this.run.refresh(data.revision)) return;
            this.clearEquipmentSelection();
            this.receipt = '';
            this.trace('refresh');
        });
        this.text(shop.refreshed ? '已换过一批' : `换一批 · ${REFRESH_COST} 零件`, 275, top - 104,
            { width: 132, size: 13, color: refresh ? BENCH.paper : canRefresh ? BENCH.yellow : BENCH.muted });
        if (!shop.offers.length) {
            benchPlate(g, 16, stockBottom, 328, stockTop - stockBottom, BENCH.steel, BENCH.edge);
            this.text('货架已空', 180, (stockBottom + stockTop) / 2, { size: 16, color: BENCH.muted });
        }
        const chooseOne = shop.offers.some(item => item.id === 'wrench/flywheel') && shop.offers.some(item => item.kind === 'weapon');
        shop.offers.forEach((item, index) => {
            const x = 68 + index * 112;
            const height = stockTop - stockBottom;
            const style = BENCH[item.kind];
            const recommended = item.id === shop.recommended;
            const label = chooseOne && (item.id === 'wrench/flywheel' || item.kind === 'weapon') ? '二选一' : recommended ? '起手搭配' : style.label;
            const detail = item.id === 'wrench/link' && this.run.rules.sweptMelee ? '再打同一台敌机，伤害 +1' : item.detail;
            const held = this.touchTarget(x, stockTop - height / 2, 104, height, () => this.selectEquipment(item, shop));
            benchPlate(g, x - 52, stockBottom - 3, 104, height, BENCH.shadow);
            benchPlate(g, x - 52, stockBottom, 104, height, style.fill, held || recommended ? style.accent : BENCH.edge);
            this.block(x - 48, stockBottom + 5, 99, 2, BENCH.recess);
            this.text(label, x - 16, stockTop - 14, { width: 62, size: 11, left: true, color: style.accent });
            benchPlate(g, x + 22, stockTop - 25, 26, 20, BENCH.recess, undefined, 4);
            this.text(String(item.price), x + 35, stockTop - 15,
                { width: 24, size: 15, bold: true, color: data.parts >= item.price ? BENCH.yellow : BENCH.muted });
            this.skin?.uiIcon(item.id, x, (stockTop + stockBottom) / 2 + 11, 61, item.icon);
            this.text(item.name, x, stockBottom + 39, { width: 96, size: 15, bold: true, color: BENCH.paper });
            this.text(detail, x, stockBottom + 19, { width: 92, height: 27, size: 11, color: BENCH.paper });
        });

        const tabY = trayBottom + 113;
        const trayAccent = BENCH.weapon.accent;
        benchPlate(g, 16, trayBottom - 4, 328, 99, BENCH.shadow);
        benchPlate(g, 16, trayBottom, 328, 99, BENCH.weapon.fill, BENCH.edge, 8);
        const slotCount = this.run.rules.weaponLimit ?? 2;
        const compact = slotCount > 2;
        const pitch = 336 / slotCount;
        const tabWidth = pitch - 8;
        for (let index = 0; index < slotCount; index++) {
            const item = shop.weapons[index];
            const x = 12 + (index + 0.5) * pitch;
            const active = index === focus;
            const held = item && this.touchTarget(x, tabY, tabWidth, 44, () => {
                if (this.equipmentFocus === index && !fitting) this.inspectEquipment(item.id, index);
                else {
                    this.clearEquipmentSelection();
                    this.equipmentFocus = index;
                }
            });
            benchPlate(g, x - tabWidth / 2, tabY - 22, tabWidth, 44,
                active || held ? BENCH.weapon.fill : item ? BENCH.steel : BENCH.recess,
                active ? trayAccent : BENCH.edge);
            if (active) {
                this.block(x - tabWidth / 2 + 4, tabY + 18, tabWidth - 8, 3, trayAccent);
                this.block(x - tabWidth / 2 + 1, tabY - 22, tabWidth - 2, 8, BENCH.weapon.fill);
            }
            if (compact) {
                if (item) this.skin?.uiIcon(item.id, x, tabY + 4, 31);
                else if (index >= shop.weaponCapacity) benchLock(g, x, tabY + 4, BENCH.muted);
                else this.text('+', x, tabY + 4, { width: tabWidth, size: 20, color: BENCH.muted });
                this.text(String(index + 1), x, tabY - 14, { width: tabWidth, size: 10, color: active ? trayAccent : BENCH.muted });
                continue;
            }
            if (item) this.skin?.uiIcon(item.id, x - 53, tabY, 36);
            else if (shop.weaponCapacity < 2) benchLock(g, x - 54, tabY, BENCH.muted);
            const canSwitch = !!item && !active;
            this.text(item?.name ?? (shop.weaponCapacity < 2 ? '第 2 波后开放' : '空武器位'), x + (canSwitch ? 2 : 15), tabY,
                { width: canSwitch ? 86 : 112, size: 15, bold: active, color: item ? BENCH.paper : BENCH.muted });
            if (canSwitch) this.text('切换', x + 58, tabY, { width: 30, size: 11, color: trayAccent });
        }
        benchScrew(g, 24, trayBottom + 70);
        benchScrew(g, 336, trayBottom + 70);
        this.text(`${weapon.name}的专属配件`, 132, trayBottom + 72,
            { width: 194, left: true, size: 14, bold: true, color: BENCH.attachment.accent });
        const inspect = !fitting && this.touchTarget(283, trayBottom + 69, 82, 38,
            () => this.inspectEquipment(weapon.id, focus));
        this.text('武器详情 ›', 283, trayBottom + 73, { width: 82, size: 12, color: inspect ? BENCH.paper : trayAccent });
        this.drawBenchSlots('attachment', trayBottom + 31, weapon.slots, focus, fitting);

        benchPlate(g, 16, gearBottom - 3, 328, 84, BENCH.shadow);
        benchPlate(g, 16, gearBottom, 328, 84, BENCH.gear.fill, BENCH.edge);
        benchScrew(g, 24, gearBottom + 68);
        benchScrew(g, 336, gearBottom + 68);
        this.text('通用装备', 86, gearBottom + 65, { width: 106, left: true, size: 15, bold: true, color: BENCH.gear.accent });
        this.drawBenchSlots('gear', gearBottom + 27, shop.gear, focus, fitting);

        if (fitting) {
            this.text('先选一个亮着的位置', 180, footer + 47,
                { width: 316, size: 13, color: BENCH.yellow });
            this.benchButton('取消', 180, footer + 13, 328, () => this.clearEquipmentSelection(), { height: 46 });
        } else {
            const note = this.receipt || campaignWaveHint(this.run.rules, data.wave + 1, this.runMode);
            this.text(note, 88, footer + 14, { width: 144, height: 45, left: true, size: 12,
                color: this.receipt ? BENCH.attachment.accent : BENCH.muted });
            this.benchButton(`开始第 ${data.wave + 2} 波 ›`, 257, footer + 14, 174, () => {
                if (!this.run.nextWave(data.revision)) return;
                this.clearEquipmentSelection();
                this.receipt = '';
                this.trace('next-wave');
            }, { primary: true, height: 49 });
        }
        if (this.equipmentDetails) this.drawEquipmentDetails(shop, selected);
    }

    private drawBenchSlots(kind: 'attachment' | 'gear', y: number, slots: EquipmentSlot[], focus: number,
        fitting?: EquipmentOffer): void {
        const style = BENCH[kind];
        const pitch = 314 / slots.length;
        slots.forEach(({ slot, locked, item }) => {
            const x = 23 + pitch * (slot + 0.5);
            const width = pitch - 7;
            const eligible = !locked && fitting?.kind === kind;
            const act = eligible ? () => {
                this.equipmentTarget = kind === 'gear' ? { kind, slot } : { kind, weapon: focus, slot };
                this.equipmentDetails = { kind: 'offer' };
            } : item ? () => this.inspectEquipment(item.id) : undefined;
            const held = act && this.touchTarget(x, y, width, 48, act);
            benchPlate(this.ui, x - width / 2, y - 23, width, 46, BENCH.recess,
                held || eligible ? BENCH.yellow : item ? style.accent : BENCH.edge, 5);
            if (item) this.skin?.uiIcon(item.id, x, y + 7, 26, item.icon);
            else if (locked) benchLock(this.ui, x, y + 7, BENCH.muted);
            else {
                this.block(x - 6, y + 7, 12, 1, style.accent);
                this.block(x, y + 2, 1, 11, style.accent);
            }
            this.text(item?.name ?? (locked ? `第 ${slot * 2} 波后` : '空位'), x, y - 13,
                { width: width - 8, height: 18, size: 12, color: item ? BENCH.paper : BENCH.muted });
        });
    }

    private drawEquipmentDetails(shop: EquipmentShop, selected?: EquipmentOffer): void {
        const details = this.equipmentDetails!;
        const forSale = details.kind === 'offer';
        const item = details.kind === 'equipped' ? getEquipmentOffer(details.id) : selected;
        if (!item) return;
        const data = this.run.data!;
        const fitted = details.kind === 'equipped' && details.weapon !== undefined && data.equipment
            ? resolveEquipment(data.tools, data.equipment, data.route, this.run.rules.maxHp, data.blueprint).weapons[details.weapon] : undefined;
        const { description, rows } = equipmentDetail(item, fitted, this.run.rules.sweptMelee);
        const target = forSale ? this.equipmentTarget : undefined;
        const preview = target ? this.run.previewEquipment(item.id, target) : undefined;
        const usable = data.parts >= item.price;
        const destination = target?.kind === 'weapon' ? `第 ${data.tools.length + 1} 个武器位` : target?.kind === 'attachment'
            ? `${shop.weapons[target.weapon].name} · 配件槽 ${target.slot + 1}`
            : target?.kind === 'gear' ? `通用装备槽 ${target.slot + 1}` : '';
        const summary = !forSale ? '' : !usable ? `还差 ${item.price - data.parts} 个零件`
            : preview?.reason || (preview?.replaced ? preview.changes.join(' · ') : '');
        const footerHeight = forSale ? 63 + (Number(!!destination) + Number(!!summary)) * 26 : 16;
        const style = BENCH[item.kind];
        const metrics = description ? 164 : 136;
        const height = metrics + rows.length * 25 + footerHeight;
        const top = Math.min(this.dispatchHeaderY() - 24, (this.dispatchHeaderY() + this.footer + height) / 2);
        const bottom = top - height;
        if (!this.equipmentOverlay) {
            const node = this.layer('Item details');
            const iconNode = new Node('Inspected item');
            iconNode.layer = node.layer;
            node.addChild(iconNode);
            const icon = iconNode.addComponent(Sprite);
            icon.sizeMode = Sprite.SizeMode.CUSTOM;
            this.equipmentOverlay = { graphics: node.addComponent(Graphics), labels: [], icon };
        }
        const { graphics, labels, icon } = this.equipmentOverlay;
        graphics.node.active = true;
        graphics.clear();
        this.actions.length = 0;
        let labelIndex = 0;
        const text = (value: string, x: number, y: number, options: TextOptions) =>
            this.text(value, x, y, options, graphics.node, labels, labelIndex++);
        const block = (x: number, y: number, w: number, h: number, color: Color) => this.block(x, y, w, h, color, graphics);
        const button = (label: string, x: number, y: number, w: number, action: () => void, primary = false, enabled = true) => {
            const pressed = enabled && this.touchTarget(x, y, w, 44, action);
            const fuel = primary && enabled ? pressed ? BENCH.paper : BENCH.yellow : pressed ? BENCH.edge : BENCH.steel;
            benchPlate(graphics, x - w / 2, y - 22, w, 44, fuel, primary && enabled ? undefined : BENCH.edge);
            text(label, x, y, { width: w - 12, size: 14, bold: primary,
                color: !enabled ? BENCH.muted : primary ? BENCH.ink : BENCH.paper });
        };
        const close = () => this.clearEquipmentSelection();
        block(0, -HEIGHT * this.backdropScale, WIDTH, HEIGHT * (1 + 2 * this.backdropScale), new Color(6, 9, 8, 184));
        benchPlate(graphics, 19, bottom - 5, 322, height, BENCH.shadow, undefined, 11);
        benchPlate(graphics, 19, bottom, 322, height, BENCH.ink, BENCH.edge, 11);
        benchPlate(graphics, 20, top - 97, 320, 96, style.fill, undefined, 8);
        this.touchTarget(180, bottom / 2, WIDTH, bottom, close);
        this.touchTarget(180, (HEIGHT + top) / 2, WIDTH, HEIGHT - top, close);
        button('关闭', 295, top - 31, 62, close);
        text(forSale ? style.label : `已装 · ${style.label}`, 132, top - 29,
            { width: 188, left: true, size: 13, color: style.accent });
        const frame = this.skin?.uiIconFrame(item.id, item.icon);
        icon.spriteFrame = frame ?? null;
        if (frame) {
            const { width, height } = frame.rect;
            const scale = 53 / Math.max(width, height);
            icon.node.setPosition(62, top - 67, 0);
            icon.node.getComponent(UITransform)!.setContentSize(width * scale, height * scale);
        }
        text(item.name, 205, top - 69, { width: 220, left: true, size: 23, bold: true, color: BENCH.paper });
        if (description) text(description, 180, top - 114, { width: 286, height: 32, left: true, size: 13, color: BENCH.muted });
        const priceY = top - metrics + 24;
        text(forSale ? '价格' : '参考价', 91, priceY, { width: 107, left: true, size: 14, color: BENCH.muted });
        text(`${item.price} 零件`, 258, priceY, { width: 145, size: 17, bold: true, color: BENCH.yellow });
        rows.forEach(({ label, value }, index) => {
            const y = top - metrics - index * 25;
            block(36, y + 11, 288, 1, BENCH.steel);
            text(label, 92, y, { width: 110, left: true, size: 13, color: BENCH.muted });
            text(value, 228, y, { width: 192, size: 13, color: BENCH.paper });
        });
        if (forSale) {
            block(36, bottom + footerHeight, 288, 1, BENCH.edge);
            if (destination) text(preview?.replaced ? `${destination}　换下 ${preview.replaced.name}` : destination,
                180, bottom + footerHeight - 17, { width: 290, size: 14, color: style.accent });
            if (summary) text(summary, 180, bottom + 72,
                { width: 286, height: 32, size: 12, color: usable ? BENCH.paper : BENCH.yellow });
            const pick = () => { this.equipmentTarget = undefined; this.equipmentDetails = undefined; };
            if (!target) button('选择槽位', 180, bottom + 31, 290, pick, true, usable);
            else {
                const split = target.kind !== 'weapon';
                if (split) button('选择槽位', 80, bottom + 31, 90, pick, false, usable);
                button(preview?.replaced ? '买下并替换' : '买下并装上', split ? 231 : 180,
                    bottom + 31, split ? 187 : 290, () => {
                        if (!this.run.buyEquipment(item.id, target, data.revision)) return;
                        if (target.kind === 'weapon') {
                            this.equipmentFocus = shop.weapons.length;
                            this.campaignTrace('weapon_equip', { slot: this.equipmentFocus, weapon: item.id });
                        }
                        this.play('purchase');
                        this.receipt = `已装上${item.name} · −${item.price} 零件`;
                        this.clearEquipmentSelection();
                        this.trace('shop_pick', { item: item.id, target, replaced: preview?.replaced?.id });
                    }, true, preview?.allowed === true);
            }
        }
        for (let index = labelIndex; index < labels.length; index++) labels[index].node.active = false;
    }

    private drawShop(): void {
        const data = this.run.data!;
        const shop = this.run.shop!;
        const selected = this.selection;
        const part = selected && !isTool(selected) ? selected : null;
        const compact = this.campaign && this.top - this.footer < 540;
        const offerPitch = compact ? 61 : 67;
        const offerHeight = compact ? 56 : 62;
        const toolPitch = compact ? 52 : 55;
        const summaryY = this.top - 39;
        const tuning = this.run.tuning;
        const balanceAlongsideSummary = this.campaign && (tuning || this.top + 11 > this.capsuleCeiling);
        const balanceY = balanceAlongsideSummary ? summaryY : this.top - 5;
        this.cover();
        if (this.campaign) {
            this.block(17, this.top - 21, 4, 31, AMBER);
            this.block(238, balanceY - 16, 105, 32, CABINET);
            this.block(16, this.top - 54, 328, 1, RULE);
            this.button('路线图', tuning ? 180 : 197, this.top - 5, 70, 44, () => { this.campaignPage = 'map'; });
            if (tuning) this.button(tuning.purchased ? '校准台 · 已校准' : '校准台', 283, this.top - 5, 120, 44,
                () => { this.tuningPage = true; }, true, true);
        }
        this.text('波间整备', this.campaign ? 106 : 94, this.top - 5, { size: 25, height: 39, width: 152, left: true, bold: this.campaignMode });
        this.skin?.uiIcon('scrap', 251, balanceY, 18);
        this.text(`${data.parts} 零件`, 299, balanceY, { size: 17, color: MINT });
        const report = data.reports?.find(entry => entry.wave === data.wave);
        const earnings = report ? `拾取 +${report.collected}　回收 +${report.salvaged}` : '';
        const credit = report?.shopCredit ? `　补给 +${report.shopCredit}` : '';
        const waveSummary = `${this.campaign ? this.stage.title + '  /  ' : ''}第 ${data.wave + 1} 波完成`;
        this.text(report ? `${waveSummary}${balanceAlongsideSummary ? '\n' : '　'}${earnings}${credit}` : waveSummary,
            balanceAlongsideSummary ? 124 : 180, summaryY, { size: 13, width: balanceAlongsideSummary ? 212 : 324,
                height: balanceAlongsideSummary ? 31 : undefined, left: true, color: DIM });

        shop.offers.forEach((id, index) => {
            const item = offer(id);
            const y = this.top - 88 - index * offerPitch;
            const chosen = id === selected;
            this.control(180, y, 328, offerHeight, () => this.selectOffer(id), true, false, false, true);
            if (this.campaign) {
                const bottom = y - offerHeight / 2;
                const held = this.press?.inside && this.press.area.bottom === bottom;
                this.block(16, bottom, 328, offerHeight, chosen || held ? AMBER : RULE);
                this.block(18, bottom + 2, 324, offerHeight - 4, held ? PAPER : STOCK);
                this.block(22, y - 25, 50, 50, PAPER);
                this.block(79, y - 20, 1, 40, STAMP);
                this.block(chosen ? 252 : 281, y + 2, chosen ? 81 : 52, 22, chosen ? SELECTED : CABINET);
                if (chosen) this.block(16, bottom, 4, offerHeight, STAMP);
            } else if (chosen) {
                this.ui.lineWidth = 2;
                this.ui.strokeColor = AMBER;
                this.ui.roundRect(17, y - 30, 326, 60, 6);
                this.ui.stroke();
            }
            this.skin?.uiIcon(id, 47, y, this.campaign ? 44 : 50);
            this.text(item.name, 167, y + 13, { size: 18, width: 157, left: true, bold: this.campaignMode,
                color: this.campaign ? INK : PAPER });
            this.text(`${this.campaign && chosen ? '已选  ' : ''}${item.price} 零件`, this.campaign && chosen ? 292 : 307, y + 13,
                { size: 13, color: data.parts < item.price ? DIM : AMBER });
            this.text(item.detail, 211, y - 13, { size: 13, height: 29, width: 245, left: true,
                color: this.campaign ? CABINET : PAPER });
        });
        if (!shop.offers.length) this.text('本轮货架已空', 180, this.top - 84, { color: DIM });
        const rack = this.top - 140 - (Math.max(1, shop.offers.length) - 1) * offerPitch;
        this.text(part ? '选择安装位置' : '当前装备', 121, rack, { size: 15, width: 210, left: true, color: MINT });
        if (part && (data.tools[this.slot].mods.length < 2 || this.replacement)) {
            const projected = data.tools.map((tool, i) => i !== this.slot ? tool : { id: tool.id,
                mods: [...tool.mods.filter(mod => mod !== this.replacement), part] });
            const changes: string[] = [];
            for (const tag of ['arc', 'magnet', 'heat'] as const) {
                const active = hasPair(projected, tag);
                if (active !== hasPair(data.tools, tag)) changes.push((active ? '激活' : '失去') + PAIR_LABEL[tag]);
            }
            if (changes.length) this.text(changes.join(' / '), 244, rack, { size: 14, width: 201, color: AMBER });
        }
        data.tools.forEach((tool, index) => this.drawWeaponRow(tool, index, rack - 39 - index * toolPitch, part));

        const infoY = Math.max(rack - data.tools.length * toolPitch - 35, this.campaign ? this.footer + 115 : 0);
        if (selected) {
            const tool = data.tools[this.slot];
            const old = this.replacement;
            const socket = old ? tool.mods.indexOf(old) : tool.mods.length;
            const price = offer(selected).price;
            const canBuy = this.run.canBuy(selected, this.slot, old);
            const destination = isTool(selected) ? `武器位 ${data.tools.length + 1} · ${TOOLS[selected].name}`
                : `${TOOLS[tool.id].name} · 槽 ${socket + 1}`;
            const ready = isTool(selected) || socket < 2;
            let preview: string;
            if (!ready) preview = this.fullRun ? '槽位已满，点选要换下的配件' : '请选择有空槽的武器';
            else if (part) preview = `${destination}　${old ? MODS[old].name : '空槽'} → ${MODS[part].name}`;
            else preview = `${destination}　配有两个空槽`;
            this.text(preview, 180, infoY, { size: 15, width: 330, color: ready ? PAPER : AMBER });
            const label = data.parts < price ? `还差 ${price - data.parts} 个零件` : !ready ? '等待选择槽位'
                : `${isTool(selected) ? '装备' : '安装'}${offer(selected).name} · ${price} 零件`;
            this.button(label, 180, infoY - 39, 328, 45, () => {
                if (!this.run.buy(selected, this.slot, data.revision, old)) return;
                if (this.campaign) this.play('purchase');
                this.receipt = `${destination} 已装${isTool(selected) ? '备' : '入' + offer(selected).name}　−${price} 零件`;
                this.selection = null;
                this.trace(this.fullRun ? 'shop_pick' : 'buy', { item: selected, slot: this.slot, socket: socket + 1, replaced: old });
                if (isTool(selected)) this.campaignTrace('weapon_equip', { slot: data.tools.length, weapon: selected });
                this.replacement = undefined;
            }, canBuy, true, true);
        } else if (this.receipt) {
            this.text(this.receipt, 180, infoY, { color: MINT, size: 15, width: 328 });
        } else if (this.campaign && !tuning && data.wave < 4) {
            this.text(data.wave < 2 ? '第 3 波后可调整射程或攻速' : '第 5 波后可调整有效打击距离',
                180, infoY, { color: DIM, size: 13, width: 328 });
        }
        this.button(shop.refreshed ? '本波已换货' : `换货 · ${REFRESH_COST} 零件`, 94, this.footer + 25, 156, 46, () => {
            if (this.run.refresh(data.revision)) {
                this.selection = null;
                this.replacement = undefined;
                this.receipt = '货架已更新';
                this.trace('refresh');
            }
        }, !shop.refreshed && data.parts >= REFRESH_COST);
        this.button(`迎战第 ${data.wave + 2} 波`, 266, this.footer + 25, 156, 46, () => {
            if (this.run.nextWave(data.revision)) {
                this.selection = null;
                this.replacement = undefined;
                this.receipt = '';
                this.trace('next-wave');
            }
        }, true, false, !selected);
    }

    private drawResult(won: boolean): void {
        const data = this.run.data!;
        this.cover();
        this.text(won ? '夜班交接完成' : '本次出勤结束', 180, this.top - 64, { size: 29, color: won ? MINT : PAPER });
        const reports = data.reports ?? [];
        const defeatedBy = reports[reports.length - 1]?.defeatedBy;
        const result = won ? (this.fullRun ? '巡检机已停机' : '守住三波')
            : data.finishReason === 'timeout' ? '时间耗尽，巡检机仍在运行'
            : `第 ${data.wave + 1} 波体力耗尽${defeatedBy ? ` · ${HIT_LABEL[defeatedBy]}` : ''}`;
        this.text(result, 180, this.top - 102, { color: won ? MINT : AMBER, width: 320 });
        const columns = ['波次', '击倒', '拾取', '受击', '连锁', '脉冲', '过热'];
        if (reports.length > 0) {
            columns.forEach((label, index) => this.text(label, 39 + index * 47, 435, { size: 13, color: DIM }));
        }
        reports.forEach((report, index) => {
            const { arc, magnet, heat } = report.triggers;
            const row = [report.wave + 1, report.kills, report.collected, report.hits, arc, magnet, heat];
            row.forEach((value, column) => this.text(String(value), 39 + column * 47,
                398 - index * (this.fullRun ? 30 : 37), { size: 15 }));
        });
        this.text(`剩余 ${data.parts} 个零件`, 180, this.fullRun ? 232 : 280, { color: DIM });
        this.button('用这套起手再来一局', 180, this.fullRun ? 179 : 234, 220, 52, () => {
            this.run.start(data.route, data.seed);
            this.selection = null;
            this.trace('restart');
        }, true, true, true);
        this.button('换一条路线', 180, this.fullRun ? 111 : 166, 220, 48, () => { this.chooseRoute = true; });
    }

    private drawStorageError(): void {
        this.cover();
        this.text('检查点写入失败', 180, 400, { size: 24, color: AMBER });
        this.text('点重试保存这波结算，再继续出勤。', 180, 348, { color: DIM });
        this.button('重试保存', 180, 274, 213, 46, () => {
            if (this.run.retry()) {
                this.traceOutcome();
                this.reconcileCampaignResult();
            }
        }, true, true);
        if (!this.campaign) this.button('重新选择起手改装', 180, 208, 213, 46, () => { this.chooseRoute = true; });
    }

    private readonly inspect = () => {
        const { data, battle, paused } = this.run;
        return {
            phase: this.campaignError ? 'storage-error' : this.campaignPage ?? (this.chooseRoute ? (this.campaign ? 'brief' : 'route') : data?.phase),
            wave: (data?.wave ?? 0) + 1,
            revision: data?.revision,
            route: data?.route,
            version: this.run.rules.contentVersion,
            finishReason: data?.finishReason,
            tick: battle?.tick,
            clearProgress: battle?.clearProgress,
            player: battle ? { ...battle.player } : null,
            parts: data?.parts,
            offers: this.run.shop?.equipmentOffers ?? this.run.shop?.offers.slice(),
            tools: data?.tools.map((tool) => ({ id: tool.id, mods: [...tool.mods], attachments: tool.attachments })),
            equipment: data?.equipment,
            effectiveEquipment: battle?.equipment,
            stick: this.stickOrigin ? { origin: this.stickOrigin, axis: this.stickAxis } : null,
            triggers: battle ? { ...battle.triggers } : null,
            reports: data?.reports,
            boss: battle?.boss ? {
                hp: battle.boss.unit.hp, phase: battle.boss.phase, attack: battle.boss.attack,
            } : null,
            platform: this.run.platform.kind,
            weaponShowcase: this.weaponShowcase,
            paused,
            storageFailed: this.run.storageFailed,
            ...(this.campaign ? {
                stageId: this.campaignPage === 'brief' ? this.selectedStage.id : this.stage.id, runId: data?.runId,
                activeAttempt: this.campaign.profile.activeAttempt, profileState: this.campaign.profileState,
                selectedStarter: this.startWeapon, mapChapter: this.mapChapter + 1, mapOffset: this.mapOffset,
                credits: this.campaign.profile.credits, blueprints: this.campaign.profile.blueprints,
                settings: this.settings?.current, musicPlaying: this.audio?.musicPlaying,
                musicTrack: this.audio?.musicTrack, musicPosition: this.audio?.musicPosition,
                field: battle?.field,
                cameraOffset: { x: this.battleOffset.x, y: this.battleOffset.y },
                selectedBlueprint: this.campaign.profile.selectedBlueprint, mode: this.runMode,
                mission: battle?.mission, chapterBoss: battle?.chapterBoss,
                clearedStages: this.campaign.profile.clearedStages,
                unlockedWeapons: this.campaign.profile.unlockedWeapons,
                campaignError: this.campaignError, livePuddles: battle?.livePuddles ?? [],
            } : {}),
        };
    };

    private trace(event: string, detail?: object): void {
        if (DEBUG) console.log(`[${this.run.rules.stage}] ` + JSON.stringify({ event, ...detail, ...this.inspect() }));
    }

    private campaignTrace(event: string, detail?: object, data = this.run.data, stageId?: string): void {
        if (!DEBUG || !this.campaign || !data) return;
        const { contentVersion, runId, revision, wave, mode } = data;
        const stage = stageId ?? this.stage.id;
        const eventId = `${stage}:${runId}:${revision}:${event}`;
        console.log('[CAMPAIGN_QA] ' + JSON.stringify({ event, eventId, stageId: stage, contentVersion,
            runId, wave: wave + 1, mode: mode ?? 'normal', ...detail }));
    }
}
