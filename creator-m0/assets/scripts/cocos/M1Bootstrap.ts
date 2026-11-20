import {
    _decorator, AudioClip, AudioSource, Color, Component, EventTouch, Game, game, Graphics, Label, Mask, Node,
    Sprite, SpriteFrame, UITransform, Vec2, Vec3, profiler, resources, screen, view,
} from 'cc';
import { DEBUG } from 'cc/env';
import { Run } from '../m1/Run';
import type { Checkpoint } from '../m1/Run';
import { Campaign } from '../campaign/Campaign';
import { CampaignCloudSession } from '../campaign/CampaignCloudSession';
import { createCampaignCloud } from '../platform/campaignCloud';
import { BLUEPRINTS, COMMISSIONS } from '../campaign/CampaignLedger';
import type { BlueprintId, ChallengeMode } from '../m1/Encounter';
import { clipWarningReach } from '../m1/Encounter';
import { CAMPAIGN_CATALOG, CAMPAIGN_CHAPTERS, CAMPAIGN_MAP_HEIGHT, rulesForCampaign } from '../campaign/CampaignCatalog';
import type { CampaignStage } from '../campaign/CampaignCatalog';
import { makePlatform } from '../platform/platform';
import { createRewardedRevive } from '../platform/rewardedRevive';
import type { RewardedRevive } from '../platform/rewardedRevive';
import { ENEMIES, FIELD, M2_RULES, MODS, REFRESH_COST, STARTER, TICK_RATE, TOOLS, hasPair, isTool, offer } from '../m1/content';
import type { EquippedTool, ModId, OfferId, Route, ToolId } from '../m1/content';
import { BOSS_CHARGE_SPEED, BOSS_CHARGE_TICKS, BOSS_SWEEP_REACH } from '../m1/Battle';
import { drawSkillEffects } from './SkillEffectsView';
import { BattleSkinView } from './BattleSkinView';
import { drawCampaignEncounter } from './CampaignCombatView';
import { loadCampaignTexture } from './CampaignAssetLoader';
import { drawDistrictProgress, drawRestoredLeg } from './CampaignMapView';

const { ccclass, property, requireComponent } = _decorator;
const WIDTH = 360;
const HEIGHT = 640;
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
const MODE_DETAIL = { normal: '常规工单', overtime_1: '装甲机提前在第三波入场', overtime_2: '第三波装甲机，第五波冲车与炮台交替' };
const HIT_LABEL: Readonly<Record<string, string>> = {
    crawler: '慢爬虫接触', charger: '冲车撞击', turret: '炮台接触', armored: '护甲机接触',
    inspector: '巡检机', projectile: '炮台弹体', 'boss-sweep': '巡检机扫线', 'boss-charge': '巡检机冲撞',
    'live-puddle': '带电积水', pursuer: '追击机', reclaimer: '回收爪', jammer: '干扰机', ambusher: '埋伏机',
    'chapter-hazard': '工单危险区',
};
const BOSS_LABEL = { sweep: '扫线', charge: '冲撞', summon: '召援' };
const PAIR_LABEL = { arc: '电弧连锁', magnet: '拾取震击', heat: '过热增伤' };
const SOUND_PATHS = {
    warning: 'm2/warning', charge: 'm2/charge', hit: 'm2/hit', clear: 'm2/clear',
    power: 'campaign/power', cut: 'campaign/cut', connect: 'campaign/connect',
    confirm: 'campaign/confirm', restored: 'campaign/restored',
};
function visibleReach(x: number, y: number, dx: number, dy: number, reach: number): number {
    const edgeX = dx > 0 ? FIELD.right : FIELD.left;
    const edgeY = dy > 0 ? FIELD.top : FIELD.bottom;
    return Math.max(0, Math.min(reach, dx ? (edgeX - x) / dx : Infinity, dy ? (edgeY - y) / dy : Infinity));
}
type Sound = keyof typeof SOUND_PATHS;
const qaHost = globalThis as typeof globalThis & {
    __nightShiftM1State?: () => object;
    __nightShiftM2State?: () => object;
    __nightShiftCampaignState?: () => object;
};
const FIRST_STAGE = CAMPAIGN_CATALOG[0];
const MAP_HEIGHT = CAMPAIGN_MAP_HEIGHT;
const STATION_TOP = 27;
const STATION_BOTTOM = 67;
const STATION_EDGE_GAP = 6;
const HANDOFF_SECONDS = 0.64;
const CHAPTER_LINKS: Readonly<Record<string, string>> = {
    '02': '货运支线', '03': '医院广播', '04': '本地旁路',
};
const PUDDLE_WARNING = new Color(251, 199, 108, 60);
const PUDDLE_ACTIVE = new Color(241, 110, 96, 130);
type CampaignStart = { stage: CampaignStage; route: Route; starter: ToolId; runId: string; seed: number; blueprint: BlueprintId | null; mode: ChallengeMode };
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
    skinRoot = 'skins/workshop';

    @property
    reviveAdUnitId = '';

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
    private reviveDecision?: { run: Run; runId: string; revision: number; rewarded: boolean; attempted: boolean };
    private run!: Run;
    private skin?: BattleSkinView;
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
    private campaignPage: 'home' | 'map' | 'brief' | 'switch' | 'workshop' | 'cloud' | null = null;
    private selectedStage = FIRST_STAGE;
    private switchRoute: Route = 'arc';
    private loadoutMode: ChallengeMode = 'normal';
    private runMode: ChallengeMode = 'normal';
    private workshopTab: 'blueprints' | 'archive' | 'commissions' = 'blueprints';
    private workshopFromResult = false;
    private archiveIndex = 0;
    private archiveKind: 'receipt' | 'radio' | 'clue' = 'receipt';
    private stage = FIRST_STAGE;
    private startWeapon: CampaignStart['starter'] = 'wrench';
    private queuedStart?: CampaignStart;
    private campaignError?: CampaignError;
    private readonly reconciledRuns = new Set<string>();
    private puddles?: Graphics;
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
    private press: { id: number; area: HitArea; inside: boolean } | null = null;
    private learnedMove = false;
    private receipt = '';
    private selection: OfferId | null = null;
    private slot = 0;
    private replacement: ModId | undefined;
    private chooseRoute = false;
    private visibleUi = '';
    private labelIndex = 0;
    private top = 607;
    private capsuleCeiling = HEIGHT;
    private footer = 34;
    private layout = '';
    private source: AudioSource | null = null;
    private audioPrepared = false;
    private readonly clips: Partial<Record<Sound, AudioClip>> = {};
    private soundEnabled = true;

    onLoad(): void {
        this.surface = this.node.getComponent(UITransform)!;
        this.surface.setContentSize(WIDTH, HEIGHT);
        this.base = this.node.addComponent(Graphics);
        this.drawBackground();
        const floor = this.layer('Ground');
        if (this.campaignMode) {
            const hazardBounds = this.layer('EncounterBounds');
            hazardBounds.setPosition(FIELD.left - WIDTH / 2, FIELD.bottom - HEIGHT / 2, 0);
            const transform = hazardBounds.addComponent(UITransform);
            transform.setAnchorPoint(0, 0);
            transform.setContentSize(FIELD.right - FIELD.left, FIELD.top - FIELD.bottom);
            hazardBounds.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
            const groundSignals = new Node('EncounterSignals');
            groundSignals.layer = hazardBounds.layer;
            hazardBounds.addChild(groundSignals);
            groundSignals.setPosition(-FIELD.left, -FIELD.bottom, 0);
            this.puddles = groundSignals.addComponent(Graphics);
        }
        const actors = this.layer('Actors');
        const clip = this.layer('SkillBounds');
        clip.setPosition(FIELD.left - WIDTH / 2, FIELD.bottom - HEIGHT / 2, 0);
        const bounds = clip.addComponent(UITransform);
        bounds.setAnchorPoint(0, 0);
        bounds.setContentSize(FIELD.right - FIELD.left, FIELD.top - FIELD.bottom);
        clip.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
        const effects = new Node('SkillEffects');
        effects.layer = clip.layer;
        clip.addChild(effects);
        effects.setPosition(-FIELD.left, -FIELD.bottom, 0);
        this.skillEffects = effects.addComponent(Graphics);
        this.art = this.layer('CombatSignals').addComponent(Graphics);
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
            this.loadScenery('night-depot');
        }
        this.ui = this.layer('Overlay').addComponent(Graphics);
        const uiSprites = this.layer('InterfaceArt');
        this.labelLayer = this.layer('Labels');
        if (this.fullRun && this.skinRoot) {
            this.skin = new BattleSkinView(this.skinRoot, floor, actors, uiSprites, () => { this.visibleUi = ''; }, this.campaignMode);
        }
        if (this.campaignMode) {
            this.reviveAd = createRewardedRevive(this.reviveAdUnitId);
            this.loadCampaign();
            const cloud = createCampaignCloud(this.cloudEnvId, this.cloudServiceId);
            if (cloud) {
                this.cloud = new CampaignCloudSession(cloud);
                void this.restoreCloud();
            }
        }
        else {
            this.run = new Run(undefined, this.fullRun ? M2_RULES : undefined);
            this.chooseRoute = !this.run.data;
        }
        if (this.fullRun) {
            this.source = this.node.addComponent(AudioSource);
            if (!this.campaignMode) this.prepareAudio();
        }
        if (DEBUG) {
            profiler?.hideStats();
            qaHost[this.campaignMode ? '__nightShiftCampaignState' : this.fullRun ? '__nightShiftM2State' : '__nightShiftM1State'] = this.inspect;
            this.trace('ready');
        }
        this.draw();
    }

    onEnable(): void {
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
        this.suspend();
    }

    onDestroy(): void {
        this.cloud?.invalidate();
        this.reviveAd?.dispose();
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
        if ((this.campaignPage === 'home' || this.campaignPage === 'map') && this.embers && !this.campaignError) {
            const previous = Math.floor(this.emberTime * 15);
            this.emberTime += dt;
            if (Math.floor(this.emberTime * 15) !== previous) this.drawMotes(this.embers);
        }
        if (this.run.paused || this.run.background) this.movementTouch = null;
        const before = this.run.data;
        const battle = this.run.battle;
        const warnings = battle?.warningSerial;
        const damage = battle?.damageTaken;
        const missionCue = battle?.missionCue;
        const cuts = battle?.cutSerial;
        const triggers = this.fullRun ? battle && { ...battle.triggers } : null;
        if (!this.campaign || (!this.campaignPage && !this.chooseRoute && !this.campaignError && this.currentCampaignRun())) {
            this.run.advance(dt);
        }
        if (this.fullRun && battle) {
            if (battle.warningSerial !== warnings) this.play(battle.warningKind);
            if (battle.damageTaken !== damage) this.play('hit');
            const cue = battle.missionCue;
            if (cue && cue !== missionCue) this.play(cue.kind);
            if (battle.cutSerial !== cuts) this.play('cut');
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
        this.draw();
    }

    private loadCampaign(): void {
        const campaign = this.campaign = this.cloud?.binding?.campaign ?? new Campaign();
        const prefix = this.cloud?.binding?.runPrefix ?? GUEST_CAMPAIGN_RUN_PREFIX;
        this.reconciledRuns.clear();
        this.chapterHandoff = undefined;
        this.campaignRunPrefix = prefix;
        this.mapPlatform = makePlatform(undefined, prefix + 'map-view');
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

    private loadCampaignStage(stage: CampaignStage, mode: ChallengeMode = 'normal'): void {
        if (this.watchingRevive) this.reviveAd?.cancel();
        this.watchingRevive = false;
        this.reviveDecision = undefined;
        this.run?.dispose();
        this.stage = stage;
        this.selectedStage = stage;
        this.runMode = mode;
        this.skin?.setStage(stage.id, stage.arena);
        const namespace = this.campaignRunPrefix + stage.id + (mode === 'normal' ? '' : '.' + mode);
        this.run = new Run(makePlatform(undefined, namespace), rulesForCampaign(stage, mode), { offerRevive: !!this.reviveAd });
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
        const seed = Math.floor(Math.random() * 0x100000000);
        const stage = this.selectedStage;
        const campaign = this.campaign!;
        this.queuedStart = { stage, route, starter: this.startWeapon, runId: campaign.newAttemptId(stage.id, seed), seed,
            mode: this.loadoutMode, blueprint: campaign.profile.selectedBlueprint };
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
            this.run.start(pending.route, pending.seed, pending.starter, pending.runId, pending.blueprint ?? undefined, pending.mode);
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
        this.receipt = '';
        this.trace('run_start');
        this.campaignTrace('stage_start');
        this.campaignTrace('weapon_equip', { slot: 0, weapon: pending.starter });
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
                if (this.stage.chapterEnd) this.play('restored');
            }
            if (this.cloud?.binding) void this.syncCloud();
        }
    }

    private suspend(): void {
        this.clearInput();
        this.run?.pause();
    }

    private onGameHide(): void {
        this.suspend();
        if (this.cloud) {
            this.cloud.invalidate();
            this.confirmedCloudScope = undefined;
            this.cloudBusy = true;
        }
    }

    private onGameShow(): void {
        this.suspend();
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
            if (result.status !== 'guest') this.cloudMessage = '当前使用游客档。云档待重新验证。';
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
        this.cloudMessage = '使用本机游客档，云档可在维修站重新验证。';
        if (this.campaignRunPrefix !== GUEST_CAMPAIGN_RUN_PREFIX) this.loadCampaign();
        else if (this.campaignPage === 'cloud') this.campaignPage = 'workshop';
    };

    private async syncCloud(): Promise<void> {
        const outcome = await this.cloud?.sync();
        if (!this.isValid || this.cloudBusy) return;
        if (outcome === 'account-changed') {
            this.cloudMessage = '抖音账号已变更，已切换到游客档。';
            this.loadCampaign();
        } else if (outcome === 'synced' || outcome === 'pending') {
            this.cloudMessage = outcome === 'synced' ? '档案已备份' : '档案保存在本机，等待同步。';
        }
    }

    private play(sound: Sound): void {
        const clip = this.clips[sound];
        if (this.soundEnabled && clip && !this.run.background) this.source?.playOneShot(clip, 0.45);
    }

    private prepareAudio(): void {
        if (!this.source || this.audioPrepared) return;
        this.audioPrepared = true;
        for (const sound of Object.keys(SOUND_PATHS) as Sound[]) {
            if (!this.campaignMode && SOUND_PATHS[sound].startsWith('campaign/')) continue;
            this.loadAudio(sound, true);
        }
    }

    private loadAudio(sound: Sound, retry: boolean): void {
        if (this.clips[sound]) return;
        resources.load(SOUND_PATHS[sound], AudioClip, (error, clip) => {
            if (!this.isValid) return;
            if (!error) this.clips[sound] = clip;
            else if (retry) this.scheduleOnce(() => this.loadAudio(sound, false), 1);
        });
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
        if (this.run?.battle) this.run.battle.destination = null;
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
            || this.movementTouch !== null || point.x < FIELD.left || point.x > FIELD.right
            || point.y < FIELD.bottom || point.y > FIELD.top) return;
        this.movementTouch = event.getID();
        this.run.battle.moveTo(point.x, point.y);
        this.learnedMove = true;
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
        this.run.battle?.moveTo(point.x, point.y);
    }

    private touchEnd(event: EventTouch): void {
        if (this.mapGesture?.id === event.getID()) {
            if (this.dragMap(event)) this.rememberMap();
            this.mapGesture = undefined;
        }
        if (event.getID() === this.movementTouch) {
            this.movementTouch = null;
            if (!this.run.paused && !this.run.background) {
                const point = this.point(event);
                this.run.battle?.moveTo(point.x, point.y);
            }
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

    private layer(name: string): Node {
        const node = new Node(name);
        node.layer = this.node.layer;
        this.node.addChild(node);
        node.setPosition(-WIDTH / 2, -HEIGHT / 2, 0);
        return node;
    }

    private text(value: string, x: number, y: number, options: TextOptions = {}): void {
        let label = this.labels[this.labelIndex++];
        if (!label) {
            const node = new Node('Text');
            node.layer = this.node.layer;
            this.labelLayer.addChild(node);
            label = node.addComponent(Label);
            if (this.campaignMode) label.fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif';
            this.labels.push(label);
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

    private block(left: number, bottom: number, width: number, height: number, color: Color): void {
        this.ui.fillColor = color;
        this.ui.rect(left, bottom, width, height);
        this.ui.fill();
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
        const sceneryPage = page === 'home' || page === 'map';
        if (!sceneryPage) {
            // Home and the route map use their own art; prepare the controls and battle assets on a dispatch page.
            if (this.campaignMode && !this.cloudBusy && !this.campaignError) {
                this.skin?.prepare();
                this.prepareAudio();
            }
            this.drawField();
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
        this.drawScenery(page === 'home' || page === 'map' ? page : null);
        const seconds = battle ? Math.ceil((battle.duration - battle.tick) / TICK_RATE) : 0;
        const radio = battle ? this.battleRadio(battle.wave, battle.tick) : undefined;
        const signature = JSON.stringify([
            data?.runId, data?.revision, battle?.player.hp, seconds, battle?.collected, battle?.magnetCharge,
            battle?.triggers.arc, battle?.triggers.magnet, battle?.triggers.heat, this.run.paused,
            this.run.waitingForSave, this.run.storageFailed, this.selection, this.slot, this.replacement, this.chooseRoute,
            this.campaign ? [this.campaignPage, this.selectedStage.id, this.stage.id, this.campaignError, this.startWeapon, this.currentCampaignRun(), this.campaign.profile.revision, this.mapChapter, this.mapOffset, this.loadoutMode,
                this.workshopTab, this.workshopFromResult, this.archiveIndex, this.archiveKind] : null,
            this.top, this.footer, battle?.boss?.unit.hp, battle?.boss?.phase, battle?.boss?.attack,
            battle?.shielded, this.soundEnabled, this.learnedMove, this.receipt, this.watchingRevive,
            this.reviveDecision?.attempted, this.reviveDecision?.rewarded,
            this.cloudBusy, this.cloudMessage, this.confirmedCloudScope,
            battle?.mission?.label, battle?.mission?.status, battle?.mission?.integrity?.hp, battle?.mission?.escort?.hp,
            battle?.chapterBoss?.hp, battle?.chapterBoss?.instruction, !!battle?.practiceWarning, radio,
        ]);
        if (signature === this.visibleUi) return;
        this.visibleUi = signature;
        this.actions.length = 0;
        this.labelIndex = 0;
        this.ui.clear();
        this.embers?.clear();
        this.skin?.beginUi();
        if (this.cloudBusy) {
            this.cover();
            this.text('正在验证抖音账号', 180, 366, { size: 21, bold: true });
            this.button('使用游客档继续', 180, 290, 226, 48, this.continueCloudOffline);
        } else if (this.campaignError) this.drawCampaignError();
        else if (this.campaignPage === 'home') this.drawHome();
        else if (this.campaignPage === 'map') this.drawRoadmap();
        else if (this.campaignPage === 'switch') this.drawSwitchStage();
        else if (this.campaignPage === 'workshop') this.drawWorkshop();
        else if (this.campaignPage === 'cloud') this.drawCloud();
        else if (this.campaignPage === 'brief') this.drawCampaignBrief();
        else if (this.campaign && (this.chooseRoute || !this.currentCampaignRun())) this.drawCampaignBrief();
        else if (this.chooseRoute || !data) this.drawRoutes();
        else if (this.run.waitingForSave) this.drawStorageError();
        else if (data.phase === 'revive') this.drawRevive();
        else if (data.phase === 'shop') this.drawShop();
        else if (data.phase === 'won' || data.phase === 'lost') {
            if (this.campaign) this.drawCampaignResult(data.phase === 'won');
            else this.drawResult(data.phase === 'won');
        } else this.drawBattleHud(seconds);
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
        art.fillColor = GRID;
        for (let x = 30; x < FIELD.right - 8; x += 24) art.rect(x - 180, FIELD.bottom - 319, 1, 398);
        for (let y = 169; y < FIELD.top - 8; y += 24) art.rect(FIELD.left - 178, y - 320, 326, 1);
        art.fill();
    }

    private drawField(): void {
        const art = this.art;
        art.clear();
        const battle = this.run.battle;
        this.drawPuddles(battle);
        this.skin?.drawWorld(battle);
        drawSkillEffects(this.skillEffects, battle?.effects ?? []);
        if (!battle) return;
        const boss = battle.boss;
        if (boss && !battle.chapterBoss && boss.unit.hp > 0 && (boss.phase === 'warning' || boss.phase === 'sweep' || boss.phase === 'charge')) {
            const unit = boss.unit;
            const x = unit.x - 180;
            const y = unit.y - 320;
            const reach = boss.attack === 'sweep' ? BOSS_SWEEP_REACH : BOSS_CHARGE_SPEED * BOSS_CHARGE_TICKS;
            art.strokeColor = boss.phase === 'warning' ? BOSS : PAPER;
            art.lineWidth = boss.attack === 'sweep' && boss.phase !== 'warning' ? 10 : 2;
            if (boss.attack === 'summon') {
                art.circle(x, y, 38 + (boss.next - battle.tick) * 0.6);
                art.circle(x, y, 50 + (boss.next - battle.tick) * 0.6);
            } else {
                const edge = boss.attack === 'charge' ? 28 : 18;
                for (const side of [-1, 1]) {
                    const offsetX = side * edge * unit.vy;
                    const offsetY = side * edge * -unit.vx;
                    const remaining = boss.phase === 'charge' ? (boss.next - battle.tick) * BOSS_CHARGE_SPEED : reach;
                    const length = visibleReach(unit.x + offsetX, unit.y + offsetY, unit.vx, unit.vy, remaining);
                    art.moveTo(x + offsetX, y + offsetY);
                    art.lineTo(x + unit.vx * length + offsetX, y + unit.vy * length + offsetY);
                }
            }
            art.stroke();
        }
        art.lineWidth = 1.5;
        for (const point of battle.warnings) {
            art.strokeColor = ENEMY_COLOR[point.kind];
            art.circle(point.x - 180, point.y - 320, 8 + (point.at - battle.tick) / 3);
            art.stroke();
        }
        for (const enemy of battle.enemies) {
            if (enemy.state !== 'warn') continue;
            art.strokeColor = ENEMY_COLOR[enemy.kind];
            const x = enemy.x - 180;
            const y = enemy.y - 320;
            const reach = enemy.kind === 'turret' ? 190 : 122;
            const fieldReach = visibleReach(enemy.x, enemy.y, enemy.vx, enemy.vy, reach);
            const length = enemy.kind === 'turret'
                ? clipWarningReach(enemy, enemy.vx, enemy.vy, fieldReach, battle.terrainRects) : fieldReach;
            if (length <= 0) continue;
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
        if (!this.skin?.has('scrap')) {
            art.fillColor = MINT;
            for (const part of battle.parts) art.rect(part.x - 183, part.y - 323, 6, 6);
            art.fill();
        }
        if (!this.skin?.has('bullet')) {
            art.fillColor = AMBER;
            for (const bullet of battle.bullets) art.circle(bullet.x - 180, bullet.y - 320, 4);
            art.fill();
        }
        for (const enemy of battle.enemies) {
            if (!this.skin?.has(enemy.kind) && !this.skin?.has('machine-' + enemy.kind)) {
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
        if (!this.skin?.has('mechanic')) {
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
    }

    private drawPuddles(battle: Run['battle']): void {
        const art = this.puddles;
        if (!art) return;
        art.clear();
        if (battle) drawCampaignEncounter(art, battle, this.stage.id);
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
        this.skin?.shopfront(180, this.top - 83);
        this.skin?.uiIcon('mechanic', 76, this.top - 83, 89);
        this.text('夜班修理局', 219, this.top - 67, { size: 30 });
        this.text(this.fullRun ? '撑过五波，拆掉巡检机。' : '撑过三波，守住修理铺。', 219, this.top - 109, { color: DIM });
        this.text('选一件起手改装', 180, 412, { size: 16, color: AMBER });
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
            this.text(arc ? '标记近敌，凑齐电弧模组可连击' : '隔远捡零件，凑齐磁吸模组可震敌',
                204, y - 13, { size: 13, color: DIM, left: true, width: 234 });
        }
        if (this.run.data) this.button(this.run.data.phase === 'lost' || this.run.data.phase === 'won' ? '返回结算' : '返回本局', 180, 105, 185, 44, () => { this.chooseRoute = false; });
    }

    private drawMotes(g: Graphics): void {
        g.clear();
        if (this.campaignPage === 'map') {
            const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
            if (chapter.id !== '02' || !this.scenery[chapter.map]) this.freight = undefined;
            else if (this.freight?.cleared !== this.mapCleared) {
                this.freight = { cleared: this.mapCleared, startedAt: this.emberTime };
            }
            if (this.scenery[chapter.map]) {
                drawDistrictProgress(g, chapter.id, this.mapCleared, HEIGHT + this.mapOffset, this.mapBounds,
                    this.emberTime, this.freight ? this.emberTime - this.freight.startedAt : 0,
                    !chapter.mapUpper || !!this.scenery[chapter.mapUpper]);
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
        if (!this.scenery['night-depot']) this.cover();
        this.block(18, y - 19, 3, 36, AMBER);
        this.text('夜班修理局', 108, y + 4, { left: true, width: 157, height: 35, size: 25, bold: true });
        this.text('江岸值班室', 91, y - 20, { width: 124, left: true, size: 13, color: STOCK });

        const bottom = this.footer + 30;
        const held = this.touchTarget(258, bottom, 169, 63, () => {
            this.focusMap(this.unfinishedRun ? this.stage : this.nextMapStage(this.campaign!));
            this.campaignPage = 'map';
            this.trace('open_campaign_map');
        });
        g.fillColor = held ? STOCK : AMBER;
        g.moveTo(183, bottom + 26); g.lineTo(343, bottom + 26); g.lineTo(333, bottom - 25);
        g.lineTo(168, bottom - 25); g.close(); g.fill();
        g.strokeColor = STAMP;
        g.lineWidth = 2;
        g.moveTo(191, bottom + 18); g.lineTo(186, bottom + 1);
        g.moveTo(196, bottom + 18); g.lineTo(191, bottom + 1);
        g.moveTo(320, bottom + 6); g.lineTo(326, bottom); g.lineTo(319, bottom - 6);
        g.stroke();
        this.text('出勤', 254, bottom, { size: 25, bold: true, color: INK, height: 36, width: 117 });
    }

    private clampMap(offset: number): number {
        const { stages, lower, upper } = this.roadmapWindow();
        const first = stages[0];
        const last = stages[stages.length - 1];
        // Safe areas and restoration notices can cover an edge station at the edge of the artwork.
        const firstVisible = first.anchor.y * MAP_HEIGHT - HEIGHT + lower + STATION_BOTTOM + STATION_EDGE_GAP;
        const lastVisible = last.anchor.y * MAP_HEIGHT - HEIGHT + upper - STATION_TOP - STATION_EDGE_GAP;
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
        return asset === 'night-depot' || asset === chapter.map || asset === chapter.mapUpper;
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
        loadCampaignTexture(this.skinRoot, asset, texture => {
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
        });
    }

    private drawScenery(page: 'home' | 'map' | null): void {
        if (!this.backdrop || !this.upperMap) return;
        this.backdrop.node.active = page !== null;
        this.upperMap.node.active = false;
        if (page === 'home') {
            this.backdrop.spriteFrame = this.scenery['night-depot'] ?? null;
            this.backdrop.node.setPosition(0, 0, 0);
            this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH * this.backdropScale, HEIGHT * this.backdropScale);
        } else if (page === 'map') {
            const chapter = CAMPAIGN_CHAPTERS[this.mapChapter];
            for (const asset of Object.keys(this.scenery)) {
                if (!this.keepScenery(asset)) this.releaseScenery(asset);
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
        const retry = this.missingScenery.has(chapter.map) || !!chapter.mapUpper && this.missingScenery.has(chapter.mapUpper);
        const locked = !campaign.isUnlocked(stages[0].id);
        const restored = count === stages.length;
        const entering = this.chapterHandoff?.next.chapter === chapter.id ? this.chapterHandoff.next : undefined;
        const lower = this.footer + (retry || locked || restored || entering ? 80 : 38);
        return { chapter, stages, done, count, receipt, receiptY, upper, lower, retry, locked, restored, entering };
    }

    private drawRoadmap(): void {
        const { chapter, stages, done, count, receipt, receiptY, upper, lower, retry, locked, restored, entering } = this.roadmapWindow();
        this.mapCleared = count;
        if (!this.scenery[chapter.map]) this.block(0, -this.mapPadding, WIDTH, HEIGHT + 2 * this.mapPadding, INK);
        const g = this.ui;
        const top = this.top;
        const campaign = this.campaign!;
        const mapY = (y: number) => HEIGHT + this.mapOffset - y * MAP_HEIGHT;
        const noticeY = this.footer + 54;
        this.mapBounds = [lower, upper];
        const points = chapter.routePoints;
        for (let i = 1; i < points.length; i++) {
            const p = points[i - 1];
            const q = points[i];
            const next = stages.find(stage => stage.routeIndex >= i) ?? stages[stages.length - 1];
            if ((chapter.id === '03' || chapter.id === '04') && done.includes(next.id)) {
                drawRestoredLeg(g, [p.x * WIDTH, mapY(p.y)], [q.x * WIDTH, mapY(q.y)], this.mapBounds, chapter.id === '03');
                continue;
            }
            const selected = campaign.isUnlocked(next.id);
            const dx = (q.x - p.x) * WIDTH;
            const dy = mapY(q.y) - mapY(p.y);
            const samples = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 12));
            for (let j = 0; j < samples; j++) {
                const x = p.x * WIDTH + dx * j / samples;
                const y = mapY(p.y) + dy * j / samples;
                if (y < lower || y > upper) continue;
                g.fillColor = INK; g.circle(x, y, 3.5); g.fill();
                g.fillColor = selected ? MINT : DIM; g.circle(x, y, 2.1); g.fill();
            }
        }
        this.beacon = undefined;
        for (const stage of stages) {
            const y = mapY(stage.anchor.y);
            if (y - STATION_BOTTOM < lower || y + STATION_TOP > upper) continue;
            this.drawMapStation(stage, stage.anchor.x * WIDTH, y);
        }

        this.block(0, upper + 1, WIDTH, HEIGHT + this.mapPadding - upper, new Color(12, 25, 31, 237));
        this.block(0, -this.mapPadding, WIDTH, lower + this.mapPadding, new Color(12, 25, 31, 239));
        const backHeld = this.touchTarget(34, top, 54, 50, () => { this.campaignPage = 'home'; });
        g.fillColor = backHeld ? PLATE : INK;
        g.circle(34, top, 18); g.fill();
        g.strokeColor = PAPER; g.lineWidth = 2.5;
        g.moveTo(37, top + 7); g.lineTo(30, top); g.lineTo(37, top - 7); g.stroke();
        this.text(`第${'一二三四'[this.mapChapter]}章  ·  已修复 ${count}/${stages.length}`, 155, top + 12,
            { width: 190, left: true, size: 13, bold: true, color: AMBER });
        this.text(chapter.title, 177, top - 12, { width: 234, height: 38, left: true, size: 24, bold: true });

        CAMPAIGN_CHAPTERS.forEach((tab, index) => {
            const first = CAMPAIGN_CATALOG.find(stage => stage.chapter === tab.id)!;
            const open = campaign.isUnlocked(first.id);
            this.button(`第${'一二三四'[index]}章${open ? '' : ' · 锁'}`, 54 + 84 * index, this.footer + 6, 76, 44, () => {
                const next = CAMPAIGN_CATALOG.find(stage => stage.chapter === tab.id && campaign.isUnlocked(stage.id) && !done.includes(stage.id));
                this.focusMap(next ?? first);
                const remembered = this.mapPositions[index];
                if (remembered != null) this.mapOffset = this.clampMap(remembered);
                this.trace('select_campaign_chapter', { chapter: tab.id });
            }, true, index === this.mapChapter);
        });
        if (retry) {
            this.button('重试载入章图', 180, noticeY, 166, 44, () => {
                this.missingScenery.delete(chapter.map);
                if (chapter.mapUpper) this.missingScenery.delete(chapter.mapUpper);
            }, true, true);
        } else if (locked) {
            this.text('通关工单 ' + stages[0].prerequisite + ' 后开放', 180, noticeY, { size: 13, color: STOCK });
        } else if (entering) {
            this.block(11, noticeY - 14, 338, 28, CABINET);
            this.text(`${CHAPTER_LINKS[chapter.id] ?? chapter.route}已接通 · 点 ${entering.id} 出勤`, 180, noticeY,
                { width: 326, size: 13, color: MINT });
        } else if (restored) {
            this.block(11, noticeY - 14, 338, 28, CABINET);
            this.text(chapter.restored, 180, noticeY, { width: 326, size: 13, color: MINT });
        }
        if (receipt) {
            this.button('结单', 311, receiptY, 62, 44, () => {
                this.campaignPage = null;
                this.chooseRoute = false;
            });
        }
    }

    private drawMapStation(stage: CampaignStage, x: number, y: number): void {
        const campaign = this.campaign!;
        const unlocked = campaign.isUnlocked(stage.id);
        const cleared = campaign.profile.clearedStages.includes(stage.id);
        const playing = this.stage.id === stage.id && this.unfinishedRun;
        const g = this.ui;
        const color = playing || (unlocked && !cleared) ? AMBER : cleared ? MINT : DIM;
        if (playing || (!this.unfinishedRun && unlocked && !cleared)) this.beacon = { x, y };
        const labelX = Math.max(70, Math.min(WIDTH - 70, x));
        const held = unlocked && this.touchTarget(labelX, y + (STATION_TOP - STATION_BOTTOM) / 2, 124,
            STATION_TOP + STATION_BOTTOM, () => this.openStage(stage));
        const pin = y + (held ? 0 : 4);
        // An enamel station marker has a colored lip above its dark mounting foot.
        g.fillColor = new Color(9, 20, 24, 199); g.ellipse(x, y - 6, 29, 14); g.fill();
        g.fillColor = INK; g.ellipse(x, pin - 3, 24, 20); g.fill();
        g.fillColor = color; g.ellipse(x, pin + 2, 24, 20); g.fill();
        if (!unlocked) {
            g.strokeColor = INK; g.lineWidth = 2.5;
            g.roundRect(x - 5, pin + 1, 10, 11, 4); g.stroke();
            g.fillColor = INK; g.roundRect(x - 8, pin - 7, 16, 12, 2); g.fill();
        } else if (cleared && !playing) {
            g.strokeColor = INK; g.lineWidth = 3.5;
            g.moveTo(x - 8, pin + 2); g.lineTo(x - 2, pin - 4); g.lineTo(x + 9, pin + 8); g.stroke();
        } else {
            g.fillColor = INK; g.moveTo(x + 4, pin + 14); g.lineTo(x - 10, pin);
            g.lineTo(x - 2, pin); g.lineTo(x - 5, pin - 10); g.lineTo(x + 10, pin + 4);
            g.lineTo(x + 2, pin + 4); g.close(); g.fill();
        }
        const status = playing ? `继续 · 第 ${this.run.data!.wave + 1} 波`
            : cleared ? '已修复 · 重刷' : unlocked ? '可出勤' : `通关 ${stage.prerequisite} 解锁`;
        g.fillColor = new Color(11, 24, 29, 235);
        g.roundRect(labelX - 58, y - 65, 116, 44, 9); g.fill();
        this.text(stage.id + '  ' + stage.title, labelX, y - 33, { size: 16, width: 111, bold: true });
        this.text(status, labelX, y - 53, { size: 12, width: 111, color });
    }

    private drawSwitchStage(): void {
        this.cover();
        this.dispatchHeader('切换工单');
        this.text('结束本次出勤？', 180, 412, { size: 27, bold: true });
        this.text(`开始「${this.selectedStage.title}」会结束「${this.stage.title}」的本局进度。已通关记录和解锁武器会保留。`,
            180, 342, { width: 286, height: 83, size: 16 });
        this.button('继续原出勤', 180, 240, 286, 48, () => this.openStage(this.stage), true, false, true);
        this.button('结束本局并出发', 180, 178, 286, 48, () => this.beginCampaignRun(this.switchRoute));
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
        this.text(arc ? '导电触点' : '大拾取圈', x + 21, y + 12, { width: 87, size: 17, bold: true });
        this.text(arc ? '标记近敌' : '扩大拾取范围', x - 7, y - 25, { left: true, width: 114, size: 14, color: PAPER });
        this.text('›', x + 59, y - 24, { size: 24, color: arc ? AMBER : MINT });
    }

    private drawCampaignBrief(): void {
        this.cover();
        this.dispatchHeader('返回路线图', () => { this.campaignPage = 'map'; });
        const stage = this.selectedStage;
        const y = this.dispatchTicket(stage.title, stage.brief, '出勤工单   /   ' + stage.id, stage.id);
        this.text(stage.goal, 180, y - 309, { width: 326, left: true, color: PAPER, size: 15 });
        const starters = this.campaign!.availableStarters(stage.id);
        const selected = starters.indexOf(this.startWeapon);
        const step = (direction: number) => { this.startWeapon = starters[(selected + starters.length + direction) % starters.length]; };
        if (starters.length > 1) {
            this.button('‹', 41, y - 348, 48, 41, () => step(-1));
            this.button('›', 319, y - 348, 48, 41, () => step(1));
        }
        this.text(TOOLS[this.startWeapon].name, 180, y - 347, { size: 19, bold: true, color: MINT });
        this.skin?.uiIcon(this.startWeapon, 104, y - 349, 36);
        this.text(TOOLS[this.startWeapon].detail, 180, y - 376, { size: 13, width: 316, color: DIM });
        const base = this.footer + 62;
        this.text('选择改装出勤', 115, base + 66, { left: true, width: 198, size: 17, bold: true });
        const mode = this.loadoutMode === 'normal' ? '' : MODE_LABEL[this.loadoutMode] + ' · ';
        this.button(mode + '维修站', 281, base + 66, 124, 38, () => {
            this.workshopFromResult = false;
            this.campaignPage = 'workshop';
        });
        this.routeCard(95.5, base, 'arc');
        this.routeCard(264.5, base, 'magnet');
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
        const tabs = [['blueprints', '开班蓝图'], ['archive', '线索档案'], ['commissions', '夜班委托']] as const;
        tabs.forEach(([tab, label], index) => this.button(label, 68 + 112 * index, y - 102, 104, 44,
            () => { this.workshopTab = tab; }, true, this.workshopTab === tab));
        if (this.workshopTab === 'archive') {
            this.drawArchive(y);
            return;
        }
        if (this.workshopTab === 'commissions') {
            this.drawCommissions(y);
            return;
        }
        const keys = Object.keys(BLUEPRINTS) as BlueprintId[];
        keys.forEach((key, i) => {
            const cy = y - 170 - i * 84;
            const owned = profile.blueprints.includes(key);
            const chosen = profile.selectedBlueprint === key;
            const blueprint = BLUEPRINTS[key];
            this.block(17, cy - 35, 326, 77, CABINET);
            this.text(blueprint.title, 125, cy + 18, { width: 190, left: true, size: 18, bold: true });
            this.text(blueprint.detail, 132, cy - 12, { width: 205, height: 40, left: true, size: 13, color: DIM });
            this.button(chosen ? '卸下' : owned ? '装备' : '兑换 ' + campaign.blueprintPrice,
                287, cy + 5, 85, 45, () => {
                    if (owned) campaign.selectBlueprint(chosen ? null : key);
                    else if (campaign.buyBlueprint(key)) campaign.selectBlueprint(key);
                }, owned || profile.credits >= campaign.blueprintPrice, chosen);
        });
        if (this.selectedStage.id === FIRST_STAGE.id && campaign.isModeUnlocked(FIRST_STAGE.id, 'overtime_1')) {
            const modes: readonly ChallengeMode[] = ['normal', 'overtime_1', 'overtime_2'];
            this.text(MODE_DETAIL[this.loadoutMode], 180, this.footer + 81, { size: 14, color: STOCK });
            modes.forEach((mode, index) => this.button(MODE_LABEL[mode], 67 + 113 * index, this.footer + 40, 105, 44,
                () => { this.loadoutMode = mode; }, campaign.isModeUnlocked(FIRST_STAGE.id, mode), mode === this.loadoutMode));
        }
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
            kind: 'receipt', label: '结单', title: record?.title ?? '线索档案',
            text: record?.clear ?? '首通工单后可回看结单线索。',
        }];
        if (record?.radio) pages.push({
            kind: 'radio', label: '电台', title: record.chapterEnd ? '结单电台' : '战前电台', text: record.radio,
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
        if (record) this.text(`工单 ${record.id}  /  ${selected.kind === 'receipt' ? '结单记录' : record.title}`, 180, top - 20,
            { width: 280, left: true, size: 13, bold: true, color: STAMP });
        this.text(selected.title, 180, top - 53, { width: 294, height: 36, left: true, size: 24, bold: true, color: INK });
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
            this.text(done ? '✓' : '○', 34, cy, { size: 16, color: done ? MINT : DIM });
            this.text(COMMISSIONS[badge], 192, cy, { width: 278, left: true, size: 14, color: done ? PAPER : DIM });
        });
    }

    private drawCloud(): void {
        this.cover();
        this.dispatchHeader('返回维修站', () => { this.campaignPage = 'workshop'; });
        this.text('抖音账号云档', 180, Math.min(484, this.dispatchHeaderY() - 44), { size: 26, bold: true });
        this.text('备份已通关工单、首通工具和已换蓝图。当前出勤和凭证保存在本机。',
            180, 405, { width: 296, height: 79, size: 17, color: STOCK });
        if (this.cloudMessage) this.text(this.cloudMessage, 180, 338, { width: 300, size: 14, color: MINT });
        if (this.cloud?.binding) {
            this.button('立即同步', 180, 245, 278, 48, () => { void this.syncCloud(); }, true, true, true);
            this.button('返回游客档', 180, 177, 278, 47, () => {
                if (!this.cloud!.disconnect()) {
                    this.cloudMessage = '本地设置写入失败，下次启动可能恢复绑定。';
                }
                this.loadCampaign();
            });
        } else if (this.confirmedCloudScope) {
            this.button('绑定并导入本机解锁', 180, 267, 278, 48, () => { void this.connectCloud(true); }, true, true, true);
            this.button('仅加载当前账号档案', 180, 197, 278, 47, () => { void this.connectCloud(false); });
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
        this.cloudMessage = this.confirmedCloudScope ? '账号已验证，请选择是否导入游客解锁。' : '暂时无法验证当前账号。';
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
            this.cloudMessage = '已使用当前账号档案';
            this.loadCampaign();
            void this.syncCloud();
        } else {
            this.cloudMessage = '绑定未完成，当前继续使用游客档。';
        }
    }

    private drawCampaignResult(won: boolean): void {
        const data = this.run.data!;
        const campaign = this.campaign!;
        const story = this.stage.clear;
        const receipt = campaign.receipt(data.runId);
        const weapon = receipt?.weapon ?? '';
        const earned = isTool(weapon) ? weapon : undefined;
        const next = CAMPAIGN_CATALOG.find(stage => stage.prerequisite === this.stage.id);
        const handoff = won && receipt?.firstClear && next && next.chapter !== this.stage.chapter;
        const ending = won && !next;
        const showBuildChoice = !!receipt && receipt.builds.length > 1 && !receipt.chosenBuild;

        const reports = data.reports ?? [];
        const hit = reports[reports.length - 1]?.defeatedBy;
        const reason = data.finishReason === 'timeout' || data.finishReason === 'objective-failed' ? this.stage.failure
            : `第 ${data.wave + 1} 波体力耗尽${hit ? ' · ' + HIT_LABEL[hit] : ''}`;
        this.cover();
        const archiveShortcut = won && this.stage.chapterEnd && campaign.profile.clearedStages.includes(this.stage.id);
        const archiveLabel = ending ? '港区来信' : this.stage.archiveClue ? '授权记录' : '线索档案';
        this.dispatchHeader(archiveShortcut ? archiveLabel : '出勤记录  /  工单 ' + this.stage.id,
            archiveShortcut ? () => this.openResultArchive() : undefined);
        const chapter = CAMPAIGN_CHAPTERS.find(candidate => candidate.id === this.stage.chapter);
        const ticketTop = this.dispatchTicket(ending ? '街区亮灯了' : won ? '工单已完成' : '出勤中止',
            won ? story : reason, this.stage.title + '   /   结单', ending ? 'ending' : this.stage.id, showBuildChoice ? 38 : 0);
        const y = ticketTop - 334;
        const kills = reports.reduce((sum, report) => sum + report.kills, 0);
        const stats = [['抵达波次', String(data.wave + 1)], ['击倒机器', String(kills)], ['剩余零件', String(data.parts)]];
        stats.forEach(([label, value], index) => {
            const x = 16 + index * 110;
            this.block(x, y - 30, 106, 61, CABINET);
            this.text(value, x + 53, y + 8, { width: 98, height: 31, size: 24, bold: true });
            this.text(label, x + 53, y - 16, { width: 100, color: DIM, size: 12 });
        });
        if (earned) {
            this.skin?.uiIcon(earned, 29, y - 57, 25);
            this.text('已解锁工具 · ' + TOOLS[earned].name, 192, y - 57, { width: 299, left: true, size: 16, color: MINT });
        } else if (won && this.stage.chapterEnd && chapter) {
            this.text(chapter.restored, 180, y - 57, { width: 328, left: true, size: 14, color: MINT });
        }
        const balance = '维修凭证 ' + campaign.profile.credits;
        const income = receipt?.aid ? '出勤补助 +1' : receipt ? `完成 ${receipt.clearedWaves} 波 +${receipt.credits}` : '';
        const blueprint = campaign.profile.blueprints.length < Object.keys(BLUEPRINTS).length
            ? '下张蓝图 ' + campaign.blueprintPrice : '蓝图已齐';
        this.text([income, balance, blueprint].filter(Boolean).join('  ·  '), 180, y - 79,
            { width: 328, left: true, size: 13, color: STOCK });
        if (won && this.stage.radio && (receipt?.firstClear || ending)) {
            this.text(this.stage.radio, 180, y - 100, { width: 328, left: true, size: 12, color: DIM });
        }
        const bottom = this.footer + 24;
        if (receipt && showBuildChoice) {
            receipt.builds.forEach((build, i) => this.button(PAIR_LABEL[build], 69 + i * 111, bottom + 111, 102, 38,
                () => { campaign.chooseInspectorBuild(data.runId, build); }));
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
            const label = handoff ? `前往第${'一二三四'[Number(next.chapter) - 1]}章 · ${next.title}  ›`
                : `带${TOOLS[earned].name}继续 · ${next.title}  ›`;
            this.button(label, 180, bottom + 59, 328, 50,
                () => handoff ? this.beginChapterHandoff(next) : dispatch(next, earned), true, false, true);
            this.button('换装备', 68, bottom, 104, 46, () => dispatch(next, data.tools[0].id));
            this.button('重刷本关', 180, bottom, 104, 46, () => dispatch(this.stage));
            this.button('路线图', 292, bottom, 104, 46, map);
        } else {
            this.button(won && next ? '下一站 · ' + next.title + '  ›' : '返回抢修路线图   ›',
                180, bottom + 59, 328, 50, map, true, false, true);
            const replay = ending && earned ? `带${TOOLS[earned].name}重刷` : won ? '再次挑战本关' : '重试当前工单';
            this.button(replay, 180, bottom, 328, 46, () => dispatch(this.stage, ending ? earned : undefined));
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
        this.cover();
        this.dispatchHeader('本波出勤中止');
        this.text(`第 ${data.wave + 1} 波体力耗尽`, 180, 413, { size: 24, bold: true });
        this.text(this.watchingRevive ? '等待视频播放结束' : '复活可从本波起点继续一次。',
            180, 366, { size: 16, color: DIM });
        if (this.reviveDecision?.attempted) {
            this.button('重试保存', 180, 261, 251, 52, () => this.finishRevive(), true, true, true);
        } else {
            if (this.reviveAd) this.button('看视频复活', 180, 261, 251, 52,
                () => { void this.watchRevive(); }, !this.watchingRevive && !this.reviveDecision, true, true);
            this.button('直接结算', 180, 190, 251, 50, () => this.settleWithoutRevive(), !this.reviveDecision);
        }
    }

    private settleWithoutRevive(): void {
        const run = this.run;
        const data = run.data;
        if (!run.canRevive || !data || run.background || this.cloudBusy || this.reviveDecision) return;
        this.watchingRevive = false;
        this.reviveAd?.cancel();
        this.reviveDecision = { run, runId: data.runId, revision: data.revision, rewarded: false, attempted: false };
        this.finishRevive();
    }

    private async watchRevive(): Promise<void> {
        const run = this.run;
        const data = run.data;
        if (!this.reviveAd || !run.canRevive || !data || this.watchingRevive || this.reviveDecision) return;
        this.watchingRevive = true;
        this.trace('revive_requested');
        const stageId = DEBUG ? this.stage.id : undefined;
        const adAttempt = `${data.runId}:${data.revision}`;
        this.campaignTrace('ad_request', { adAttempt }, data, stageId);
        const isCurrent = () => this.isValid && this.run === run && run.data === data && this.watchingRevive;
        const rewarded = await this.reviveAd.show(DEBUG ? () => {
            if (isCurrent()) this.campaignTrace('ad_shown', { adAttempt }, data, stageId);
        } : undefined);
        if (!isCurrent()) return;
        if (rewarded) this.campaignTrace('ad_completed', { adAttempt }, data, stageId);
        this.watchingRevive = false;
        this.reviveDecision = { run, runId: data.runId, revision: data.revision, rewarded, attempted: false };
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
            this.text('工单进度读取失败', 180, 410, { size: 26, color: AMBER });
            this.text('未覆盖原存档。请重新读取进度。', 180, 351, { width: 315, size: 15, color: DIM });
            this.button('重新读取', 180, 276, 218, 48, () => this.loadCampaign(), true, true, true);
            return;
        }
        if (error === 'receipt') {
            this.text('通关记录无法确认', 180, 410, { size: 26, color: AMBER });
            this.text('保留现有进度，未发放本次首通奖励。', 180, 351, { width: 315, size: 15, color: DIM });
            this.button('返回工单', 180, 276, 218, 48, () => this.loadCampaignStage(this.stage), true, true, true);
            return;
        }
        const awarding = error === 'reward';
        this.text(awarding ? '工单奖励未结算' : '出勤进度未保存', 180, 410, { size: 26, color: AMBER });
        this.text(awarding ? '本局通关已保存，重试不会重复发放。' : '保存后才能进入战斗，请重试。',
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

    private drawBattleHud(seconds: number): void {
        const battle = this.run.battle!;
        const data = this.run.data!;
        const pauseTop = Math.min(this.top, this.capsuleCeiling - 22);
        const pauseBelowField = this.campaign && pauseTop - 22 < FIELD.top;
        if (this.campaign) {
            this.block(15, this.top - 31, 330, 62, CABINET);
            this.block(15, this.top - 31, 330, 2, RULE);
            this.block(111, this.top - 16, 1, 33, RULE);
            this.block(122, this.top - 18, 126, 3, RULE);
            this.block(122, this.top - 18, 126 * (battle.wave + 1) / this.run.rules.waves.length, 3, AMBER);
        }
        this.text(`体力 ${battle.player.hp}/${this.run.rules.maxHp}${battle.shielded ? ' 盾' : ''}`, 60, this.top + 7, { size: 14 });
        for (let i = 0; i < this.run.rules.maxHp; i++) {
            this.ui.fillColor = i >= battle.player.hp ? PANEL : battle.player.hp <= 2 ? RED : MINT;
            this.ui.rect(18 + i * 8, this.top - 10, 6, 4);
            this.ui.fill();
        }
        this.text(`第 ${battle.wave + 1} 波`, 152, this.top + 3, { size: 15, bold: this.campaignMode });
        this.text(`${Math.floor(seconds / 60)}:${('0' + seconds % 60).slice(-2)}`, 220, this.top,
            { size: 19, color: seconds <= 10 ? RED : AMBER });
        const perks = [
            hasPair(data.tools, 'arc') ? `连锁 ${battle.triggers.arc}` : '',
            hasPair(data.tools, 'magnet') ? `脉冲 ${battle.magnetCharge}/5` : '',
            hasPair(data.tools, 'heat') ? `过热 ${battle.triggers.heat}` : '',
        ].filter(Boolean);
        if (this.campaign) this.text(this.stage.title, 61, this.top - 20, { size: 12, width: 100, color: DIM });
        if (this.campaign) {
            this.block(16, 113, 328, 31, CABINET);
            this.skin?.uiIcon('scrap', 31, 129, 17);
            const statsWidth = pauseBelowField ? 217 : 284;
            this.text([`零件 ${data.parts + battle.collected}`, ...perks].join('   ·   '), 45 + statsWidth / 2, 129,
                { left: true, width: statsWidth, size: 14, color: MINT });
        } else this.text([`零件 ${data.parts + battle.collected}`, ...perks].join('   ·   '), 180, 130, { color: MINT, size: 13 });
        if (!this.run.paused) this.button('暂停', 306, pauseBelowField ? 129 : pauseTop, 69, 44, () => {
            this.suspend();
            this.trace('pause');
        });
        const mission = battle.mission;
        const chapterBoss = battle.chapterBoss;
        const radio = this.battleRadio(battle.wave, battle.tick);
        if (radio && !this.run.paused) {
            this.block(15, this.footer - 7, 330, 39, CABINET);
            const portrait = radio.startsWith('陈栖：') ? 'radio-chenqi' : 'radio-aruan';
            this.skin?.uiIcon(portrait, 36, this.footer + 12, 31);
            this.text(radio, 195, this.footer + 11, { width: 281, height: 35, left: true, size: 13, color: STOCK });
        }
        if (!this.run.paused && (mission || chapterBoss)) {
            const status = mission?.escort ?? mission?.integrity;
            const job = chapterBoss && chapterBoss.hp <= 0 && chapterBoss.kind !== 'core' ? mission?.label : null;
            const label = battle.practiceWarning ? '闸刀预演 · 避开亮轨' : job ?? chapterBoss?.instruction ?? mission?.label ?? '';
            const goal = status ? `${label}  ·  ${status.hp}/${status.maxHp}` : label;
            this.text(goal, 180, 99, { width: 324, size: 16, bold: true, color: mission?.status === 'complete' ? MINT : AMBER });
            if (chapterBoss) {
                const active = chapterBoss.hp > 0;
                this.text(`${chapterBoss.title}  ·  ${active ? `阶段 ${chapterBoss.stage}` : '已停机'}`, 180, 72,
                    { width: 325, size: 13, color: STOCK });
                if (active) {
                    this.block(48, 56, 264, 4, PANEL);
                    this.block(48, 56, 264 * chapterBoss.hp / chapterBoss.maxHp, 4, chapterBoss.vulnerable ? BOSS : PURPLE);
                }
            }
        }
        if (!this.learnedMove && !battle.boss && !mission && !radio) {
            const y = Math.max(this.footer + 22, 75);
            if (this.campaign) {
                this.ui.strokeColor = RULE;
                this.ui.lineWidth = 2;
                this.ui.ellipse(106, y, 13, 8);
                this.ui.stroke();
                this.ui.fillColor = MINT;
                this.ui.circle(106, y, 2);
                this.ui.fill();
                this.text('点战场移动', 205, y + 9, { left: true, width: 140, size: 16, bold: true });
                this.text('工具会自动攻击', 205, y - 12, { left: true, width: 140, size: 13, color: DIM });
            } else this.text('点战场移动，工具会自动攻击', 180, y, { color: DIM });
        }
        if (battle.boss && !chapterBoss && !this.run.paused) {
            const boss = battle.boss;
            const health = Math.max(0, boss.unit.hp);
            const y = 102;
            const state = boss.phase === 'warning' ? `预警 · ${BOSS_LABEL[boss.attack]}`
                : boss.phase === 'recover' ? '停机空窗' : health <= ENEMIES.inspector.hp / 2 ? '阶段 2' : '阶段 1';
            this.text(`巡检机  ${Math.ceil(health)}/${ENEMIES.inspector.hp}   ·   ${state}`, 180, y, { color: BOSS, size: 13 });
            this.ui.fillColor = PANEL;
            this.ui.rect(62, y - 17, 236, 4);
            this.ui.fill();
            this.ui.fillColor = BOSS;
            this.ui.rect(62, y - 17, 236 * health / ENEMIES.inspector.hp, 4);
            this.ui.fill();
        }
        if (!this.run.paused) return;
        this.cover();
        this.labelIndex = 0;
        if (this.campaign) {
            this.dispatchHeader('工单 ' + this.stage.id + '  /  ' + this.stage.title);
            this.block(34, 277, 292, 177, CABINET);
            this.block(34, 451, 292, 3, AMBER);
        }
        this.text('已暂停', 180, 405, { size: 27, bold: this.campaignMode });
        this.text(`第 ${battle.wave + 1} 波还剩 ${seconds} 秒`, 180, 370, { color: DIM });
        this.button('继续战斗', 180, 318, 218, 48, () => {
            this.run.resume();
            this.trace('resume');
        }, true, true, true);
        if (this.campaign) this.button('返回路线图', 180, 246, 218, 45, () => { this.campaignPage = 'map'; });
        else this.button('重新选择起手改装', 180, 246, 218, 45, () => { this.chooseRoute = true; });
        if (this.fullRun) this.button(this.soundEnabled ? '音效 · 开' : '音效 · 关', 180, 182, 130, 42,
            () => { this.soundEnabled = !this.soundEnabled; if (this.soundEnabled) this.play('warning'); });
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
        const hasIcon = this.skin?.uiIcon(tool.id, 62, y + 9, 24);
        this.text(TOOLS[tool.id].name, 62, hasIcon ? y - 12 : y, { size: 14, width: 84, height: 23 });
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

    private drawShop(): void {
        const data = this.run.data!;
        const shop = data.shop!;
        const selected = this.selection;
        const part = selected && !isTool(selected) ? selected : null;
        const compact = this.campaign && this.top - this.footer < 540;
        const offerPitch = compact ? 61 : 67;
        const offerHeight = compact ? 56 : 62;
        const toolPitch = compact ? 52 : 55;
        const summaryY = this.top - 39;
        const balanceAlongsideSummary = this.campaign && this.top + 11 > this.capsuleCeiling;
        const balanceY = balanceAlongsideSummary ? summaryY : this.top - 5;
        this.cover();
        if (this.campaign) {
            this.block(17, this.top - 21, 4, 31, AMBER);
            this.block(238, balanceY - 16, 105, 32, CABINET);
            this.block(16, this.top - 54, 328, 1, RULE);
            this.button('路线图', 197, this.top - 5, 70, 44, () => { this.campaignPage = 'map'; });
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
                this.receipt = `${destination} 已装${isTool(selected) ? '备' : '入' + offer(selected).name}　−${price} 零件`;
                this.selection = null;
                this.trace(this.fullRun ? 'shop_pick' : 'buy', { item: selected, slot: this.slot, socket: socket + 1, replaced: old });
                if (isTool(selected)) this.campaignTrace('weapon_equip', { slot: data.tools.length, weapon: selected });
                this.replacement = undefined;
            }, canBuy, true, true);
        } else if (this.receipt) {
            this.text(this.receipt, 180, infoY, { color: MINT, size: 15, width: 328 });
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
            player: battle ? { ...battle.player } : null,
            parts: data?.parts,
            offers: data?.shop?.offers.slice(),
            tools: data?.tools.map((tool) => ({ id: tool.id, mods: [...tool.mods] })),
            triggers: battle ? { ...battle.triggers } : null,
            reports: data?.reports,
            boss: battle?.boss ? {
                hp: battle.boss.unit.hp, phase: battle.boss.phase, attack: battle.boss.attack,
            } : null,
            platform: this.run.platform.kind,
            paused,
            storageFailed: this.run.storageFailed,
            ...(this.campaign ? {
                stageId: this.campaignPage === 'brief' ? this.selectedStage.id : this.stage.id, runId: data?.runId,
                activeAttempt: this.campaign.profile.activeAttempt, profileState: this.campaign.profileState,
                selectedStarter: this.startWeapon, mapChapter: this.mapChapter + 1, mapOffset: this.mapOffset,
                credits: this.campaign.profile.credits, blueprints: this.campaign.profile.blueprints,
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
