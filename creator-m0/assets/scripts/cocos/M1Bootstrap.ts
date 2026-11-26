import {
    _decorator, Color, Component, EventTouch, Game, game, Graphics, Label, Mask, Node,
    profiler, screen, Sprite, SpriteFrame, sys, Texture2D, UITransform, Vec2, Vec3, view,
} from 'cc';
import { DEBUG } from 'cc/env';
import { FIELD } from '../roguelite/constants';
import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';
import { createRewardedRevive } from '../platform/rewardedRevive';
import type { RewardedRevive } from '../platform/rewardedRevive';
import { createMiniGameEngage } from '../platform/miniGameEngage';
import type { MiniGameEngage } from '../platform/miniGameEngage';
import { createMiniGameRuntime } from '../platform/miniGameRuntime';
import type { MiniGameRuntime } from '../platform/miniGameRuntime';
import { CampaignSettings } from '../platform/settings';
import type { CampaignPreferences } from '../platform/settings';
import { PIXEL_MENU_ART } from './CampaignArt';
import { loadCampaignPixelTexture, loadCampaignTexture } from './CampaignAssetLoader';
import { BattleSkinView } from './BattleSkinView';
import { CampaignAudio } from './CampaignAudio';
import type { Sound } from './CampaignAudio';
import { PatrolCampaignUi } from './PatrolCampaignUi';
import { scratchColor } from './PixelVfxEngine';
import { BENCH } from './WorkshopBench';

const { ccclass, property, requireComponent } = _decorator;
const WIDTH = 360;
const HEIGHT = 640;
const VIEW_CENTER_X = (FIELD.left + FIELD.right) / 2;
const VIEW_CENTER_Y = (FIELD.bottom + FIELD.top) / 2;
const STICK_RADIUS = 32;
const STICK_KNOB_RADIUS = 12;
const STICK_DEAD_ZONE = 5;
const STICK_ENTRY_DEPTH = 108;
const PAPER = new Color(226, 237, 241);
const STICK_BG = new Color(22, 29, 27, 238);

const qaHost = globalThis as typeof globalThis & { __nightShiftCampaignState?: () => unknown };

interface HitArea {
    left: number;
    right: number;
    bottom: number;
    top: number;
    action: () => void;
}
interface TextOptions { size?: number; color?: Color; width?: number; height?: number; left?: boolean; bold?: boolean }

interface CachedLabelSlot {
    readonly label: Label;
    readonly transform: UITransform;
    active: boolean;
    value: string;
    x: number;
    y: number;
    size: number;
    colorKey: number;
    width: number;
    height: number;
    left: boolean;
    bold: boolean;
}

function queryParams(): URLSearchParams | null {
    const search = (globalThis as { location?: { search?: string } }).location?.search;
    return typeof search === 'string' && search.length > 1 ? new URLSearchParams(search) : null;
}

@ccclass('M1Bootstrap')
@requireComponent(UITransform)
export class M1Bootstrap extends Component {
    @property
    fullRun = true;

    @property
    campaignMode = true;

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

    private platform!: Platform;
    private runtime!: MiniGameRuntime;
    private settings!: CampaignSettings;
    private audio?: CampaignAudio;
    private reviveAd: RewardedRevive | null = null;
    private engage: MiniGameEngage | null = null;
    private patrol!: PatrolCampaignUi;
    private skin?: BattleSkinView;
    private stopMemWarning?: () => void;
    private stopAudioInterrupt?: () => void;

    private surface!: UITransform;
    private skinFloor!: Node;
    private actorSprites!: Node;
    private puddles!: Graphics;
    private threats!: Graphics;
    private art!: Graphics;
    private skillEffects!: Graphics;
    private backdrop!: Sprite;
    private embers!: Graphics;
    private ui!: Graphics;
    private stickView!: Graphics;
    private labelLayer!: Node;

    private readonly labels: CachedLabelSlot[] = [];
    private readonly actions: HitArea[] = [];
    private readonly scenery: Partial<Record<string, SpriteFrame>> = {};
    private readonly pendingScenery = new Set<string>();
    private readonly missingScenery = new Set<string>();
    private readonly location = new Vec2();
    private readonly worldPoint = new Vec3();
    private readonly localPoint = new Vec3();
    private readonly battleOffset = new Vec2();
    private readonly stickAxis = new Vec2();

    private movementTouch: number | null = null;
    private lastAim?: Vec2;
    private stickOrigin?: Vec2;
    private press: { id: number; area: HitArea; inside: boolean } | null = null;
    private labelIndex = 0;
    private top = 589;
    private capsuleCeiling = HEIGHT;
    private footer = 34;
    private backdropScale = 1;
    private layout = '';
    private emberTime = 0;
    private lastEmberStep = -1;
    private pulseAccum = 0;
    private uiDirty = true;
    private background = false;
    private musicSuspended = false;
    private soundEnabled = true;

    onLoad(): void {
        this.surface = this.getComponent(UITransform)!;
        this.surface.setContentSize(WIDTH, HEIGHT);
        this.platform = makePlatform();
        this.runtime = createMiniGameRuntime();
        if (this.runtime.isLowEndDevice) {
            // Lower render cadence slightly on low-end mini-game phones to curb heat & CPU throttling (sim stays 30Hz).
            game.frameRate = 45;
            this.runtime.hintFrameRate(45);
        }
        this.settings = new CampaignSettings();
        this.soundEnabled = this.settings.current.sound;

        const world = this.battleViewport();
        const floor = this.layer('FloorSkin', world);
        this.skinFloor = floor;
        this.puddles = this.layer('BattleGround', world).addComponent(Graphics);
        const actors = this.layer('Actors', world);
        this.actorSprites = actors;
        const effects = this.layer('SkillEffects', world);
        effects.setPosition(0, 0, 0);
        this.skillEffects = effects.addComponent(Graphics);
        this.threats = this.layer('ThreatEdges', world).addComponent(Graphics);
        this.art = this.layer('CombatSignals', world).addComponent(Graphics);
        this.art.node.setPosition(0, 0, 0);

        const bgNode = this.layer('CampaignScenery');
        bgNode.setPosition(0, 0, 0);
        this.backdrop = bgNode.addComponent(Sprite);
        this.backdrop.sizeMode = Sprite.SizeMode.CUSTOM;
        this.embers = this.layer('SceneryEffects').addComponent(Graphics);

        this.ui = this.layer('Overlay').addComponent(Graphics);
        this.stickView = this.layer('MovementControl').addComponent(Graphics);
        const uiSprites = this.layer('InterfaceArt');
        this.labelLayer = this.layer('Labels');

        if (this.skinRoot) {
            this.skin = new BattleSkinView(this.skinRoot, floor, this.actorSprites, uiSprites, () => { this.uiDirty = true; });
        }
        this.loadScenery('night-depot');

        const query = queryParams();
        this.reviveAd = createRewardedRevive({ douyin: this.reviveAdUnitId, wechat: this.wechatReviveAdUnitId });
        this.engage = createMiniGameEngage(this.reviveAd, { mockAds: DEBUG && query?.get('mockAd') === '1' });
        this.audio = new CampaignAudio(this.node, sys.isBrowser, retry => this.scheduleOnce(retry, 1));
        this.patrol = this.createPatrolUi();

        this.stopMemWarning = this.runtime.onMemoryWarning(() => {
            this.skin?.trimMemory();
            this.patrol.trimMemory();
            this.runtime.triggerGC();
            this.uiDirty = true;
        });
        this.stopAudioInterrupt = this.runtime.onAudioInterruption(
            () => {
                this.musicSuspended = true;
                this.syncMusic();
                this.suspend();
                this.uiDirty = true;
            },
            () => {
                if (this.background) return;
                this.musicSuspended = false;
                this.syncMusic();
                this.audio?.resumeAfterInterruption();
                this.uiDirty = true;
            },
        );

        const dbg = query?.get('patrolDebug');
        if (DEBUG && dbg) this.patrol.jumpDebugState(dbg);
        if (DEBUG) {
            profiler?.hideStats();
            qaHost.__nightShiftCampaignState = () => this.patrol.inspect();
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
        this.uiDirty = true;
    }

    onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        game.off(Game.EVENT_HIDE, this.onGameHide, this);
        game.off(Game.EVENT_SHOW, this.onGameShow, this);
        this.musicSuspended = true;
        this.syncMusic();
        this.suspend();
    }

    onDestroy(): void {
        this.stopMemWarning?.();
        this.stopAudioInterrupt?.();
        this.engage?.dispose();
        this.reviveAd?.dispose();
        this.audio?.dispose();
        this.skin?.dispose();
        for (const asset of Object.keys(this.scenery)) this.releaseScenery(asset);
        delete qaHost.__nightShiftCampaignState;
    }

    update(dt: number): void {
        if (this.background) return;
        const clampedDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

        if ((!this.patrol.inBattle) && this.movementTouch !== null) this.cancelMovement();
        if (this.patrol.tickToast(clampedDt)) this.uiDirty = true;

        if (this.patrol.inBattle) {
            this.patrol.update(clampedDt, this.stickAxis.x, this.stickAxis.y);
            this.draw();
            return;
        }

        const frame = screen.windowSize;
        const scale = Math.max(1e-6, view.getScaleY());
        if (`patrol:${frame.width}:${frame.height}:${scale}` !== this.layout) this.uiDirty = true;

        // Home screen: only update floating embers at 15 Hz without rebuilding UI labels 60x/s!
        if (this.patrol.page === 'home') {
            this.emberTime += clampedDt;
            const step = Math.floor(this.emberTime * 15);
            if (step !== this.lastEmberStep) {
                this.lastEmberStep = step;
                if (!this.uiDirty) {
                    this.drawMotes();
                    return;
                }
            }
        }

        // Onboarding pulse on shop: refresh at 4 Hz instead of 60 Hz to keep phone cool.
        if (this.patrol.needsPulseDraw) {
            this.pulseAccum += clampedDt;
            if (this.pulseAccum >= 0.25) {
                this.pulseAccum = 0;
                this.uiDirty = true;
            }
        }

        if (this.uiDirty) this.draw();
    }

    private onGameHide(): void {
        this.background = true;
        this.musicSuspended = true;
        this.engage?.cancel();
        this.syncMusic();
        this.suspend();
        this.uiDirty = true;
    }

    private onGameShow(): void {
        this.background = false;
        this.suspend();
        this.musicSuspended = false;
        this.syncMusic();
        this.audio?.resumeAfterInterruption();
        this.uiDirty = true;
    }

    private suspend(): void {
        this.clearInput();
        this.patrol?.suspend();
        this.uiDirty = true;
    }

    private play(sound: Sound): void {
        if (this.soundEnabled && !this.musicSuspended && !this.background) this.audio?.play(sound);
    }

    private syncMusic(gesture = false): void {
        const wanted = this.settings.current.music && !this.musicSuspended && !this.background;
        const inCombat = this.patrol?.page === 'battle';
        this.audio?.syncMusic(wanted ? (inCombat ? 'combat' : 'workshop') : undefined, gesture);
    }

    private updateSettings(patch: Partial<CampaignPreferences>): boolean {
        if (!this.settings.update(patch)) return false;
        this.soundEnabled = this.settings.current.sound;
        if (patch.movement) this.cancelMovement();
        this.syncMusic();
        this.uiDirty = true;
        return true;
    }

    private get joystickMode(): boolean { return this.settings.current.movement === 'joystick'; }
    private get stickX(): number {
        const x = this.stickOrigin?.x ?? WIDTH / 2;
        return Math.min(WIDTH - STICK_RADIUS - 4, Math.max(STICK_RADIUS + 4, x));
    }
    private get stickY(): number {
        return Math.max(this.footer + 16, this.stickOrigin?.y ?? this.footer + 16);
    }

    private clearInput(): void {
        this.cancelMovement();
        if (this.press) this.uiDirty = true;
        this.press = null;
    }

    private cancelMovement(): void {
        this.movementTouch = null;
        this.lastAim = undefined;
        this.stickOrigin = undefined;
        this.stickAxis.set(0, 0);
        if (this.patrol?.session?.battle) this.patrol.session.battle.destination = null;
    }

    private steerStick(point: Vec3): void {
        if (!this.stickOrigin) return;
        const dx = point.x - this.stickOrigin.x, dy = point.y - this.stickOrigin.y;
        const distance = Math.hypot(dx, dy);
        const magnitude = Math.max(0, Math.min(1, (distance - STICK_DEAD_ZONE) / (STICK_RADIUS - STICK_DEAD_ZONE)));
        const step = magnitude / (distance || 1);
        this.stickAxis.set(dx * step, dy * step);
    }

    private aimAt(point: Vec3): void {
        const x = Math.min(FIELD.right, Math.max(FIELD.left, point.x));
        const y = Math.min(FIELD.top, Math.max(FIELD.bottom, point.y));
        if (this.lastAim && Math.hypot(x - this.lastAim.x, y - this.lastAim.y) < 0.5) return;
        (this.lastAim ??= new Vec2()).set(x, y);
        this.patrol.setBattleDestination(x + this.battleOffset.x, y + this.battleOffset.y);
    }

    private point(event: EventTouch): Vec3 {
        event.getUILocation(this.location);
        this.worldPoint.set(this.location.x, this.location.y, 0);
        const p = this.surface.convertToNodeSpaceAR(this.worldPoint, this.localPoint);
        p.x += WIDTH / 2;
        p.y += HEIGHT / 2;
        return p;
    }

    private contains(area: HitArea, x: number, y: number): boolean {
        return x >= area.left && x <= area.right && y >= area.bottom && y <= area.top;
    }

    private touchStart(event: EventTouch): void {
        if (this.background) return;
        const p = this.point(event);
        const area = this.actions.find(candidate => this.contains(candidate, p.x, p.y));
        if (area && !this.press) {
            this.press = { id: event.getID(), area, inside: true };
            this.uiDirty = true;
            return;
        }
        if (!this.patrol.inBattle || this.movementTouch !== null) return;
        if (this.joystickMode) {
            if (p.y < Math.max(8, this.footer - 16) || p.y > FIELD.bottom + STICK_ENTRY_DEPTH) return;
            if (this.patrol.session?.battle) this.patrol.session.battle.destination = null;
            this.stickOrigin = new Vec2(p.x, p.y);
            this.movementTouch = event.getID();
            this.stickAxis.set(0, 0);
            return;
        }
        if (p.x < FIELD.left || p.x > FIELD.right || p.y < FIELD.bottom || p.y > FIELD.top) return;
        this.movementTouch = event.getID();
        this.aimAt(p);
    }

    private touchMove(event: EventTouch): void {
        if (this.press?.id === event.getID()) {
            const p = this.point(event);
            const inside = this.contains(this.press.area, p.x, p.y);
            if (inside !== this.press.inside) {
                this.press.inside = inside;
                this.uiDirty = true;
            }
            return;
        }
        if (event.getID() !== this.movementTouch || !this.patrol.inBattle || this.background) return;
        const p = this.point(event);
        if (this.joystickMode) this.steerStick(p);
        else this.aimAt(p);
    }

    private touchEnd(event: EventTouch): void {
        if (!this.background) this.syncMusic(true);
        if (event.getID() === this.movementTouch) {
            if (this.joystickMode) {
                this.cancelMovement();
                return;
            }
            this.movementTouch = null;
            if (this.patrol.inBattle && !this.background) this.aimAt(this.point(event));
            this.lastAim = undefined;
            return;
        }
        if (this.press?.id !== event.getID()) return;
        const area = this.press.area;
        this.press = null;
        this.uiDirty = true;
        const p = this.point(event);
        if (!this.background && this.contains(area, p.x, p.y)) {
            area.action();
            this.syncMusic();
            this.draw();
        }
    }

    private touchCancel(event: EventTouch): void {
        if (event.getID() === this.movementTouch) this.cancelMovement();
        if (this.press?.id === event.getID()) {
            this.press = null;
            this.uiDirty = true;
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

    /** Diff-guarded pooled Label renderer: only mutates Cocos Label when props actually change (prevents iOS Canvas texture churn). */
    private text(value: string, x: number, y: number, options: TextOptions = {}): void {
        const idx = this.labelIndex++;
        let slot = this.labels[idx];
        if (!slot) {
            const node = new Node('Text');
            node.layer = this.node.layer;
            this.labelLayer.addChild(node);
            const label = node.addComponent(Label);
            label.fontFamily = '"Microsoft YaHei", "PingFang SC", sans-serif';
            const transform = node.getComponent(UITransform)!;
            slot = {
                label,
                transform,
                active: true,
                value: '',
                x: Number.NaN,
                y: Number.NaN,
                size: -1,
                colorKey: -1,
                width: -1,
                height: -1,
                left: false,
                bold: false,
            };
            this.labels.push(slot);
        }
        if (!slot.active) {
            slot.label.node.active = true;
            slot.active = true;
        }
        const rx = Math.round(x);
        const ry = Math.round(y);
        if (slot.x !== rx || slot.y !== ry) {
            slot.label.node.setPosition(rx, ry, 0);
            slot.x = rx;
            slot.y = ry;
        }
        const size = options.size ?? 14;
        if (slot.size !== size) {
            slot.label.fontSize = size;
            slot.label.lineHeight = size + 5;
            slot.size = size;
        }
        const color = options.color ?? PAPER;
        const colorKey = ((color.r << 24) | (color.g << 16) | (color.b << 8) | color.a) >>> 0;
        if (slot.colorKey !== colorKey) {
            slot.label.color = color;
            slot.colorKey = colorKey;
        }
        const bold = !!options.bold;
        if (slot.bold !== bold) {
            slot.label.isBold = bold;
            slot.bold = bold;
        }
        const left = !!options.left;
        if (slot.left !== left) {
            slot.label.horizontalAlign = left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
            slot.left = left;
        }
        const width = options.width ?? 0;
        const height = width ? (options.height ?? 29) : 0;
        if (slot.width !== width || slot.height !== height) {
            slot.label.overflow = width ? Label.Overflow.SHRINK : Label.Overflow.NONE;
            if (width) slot.transform.setContentSize(width, height);
            slot.width = width;
            slot.height = height;
        }
        if (slot.value !== value) {
            slot.label.string = value;
            slot.value = value;
        }
    }

    private block(left: number, bottom: number, width: number, height: number, color: Color): void {
        this.ui.fillColor = color;
        this.ui.rect(left, bottom, width, height);
        this.ui.fill();
    }

    private touchTarget(x: number, y: number, width: number, height: number, action: () => void): boolean {
        const left = x - width / 2;
        const bottom = y - height / 2;
        this.actions.push({ left, right: left + width, bottom, top: bottom + height, action });
        return !!this.press?.inside && this.press.area.left === left && this.press.area.bottom === bottom;
    }

    private loadScenery(asset: string): void {
        if (this.scenery[asset] || this.pendingScenery.has(asset) || this.missingScenery.has(asset)) return;
        this.pendingScenery.add(asset);
        const finish = (texture: Texture2D | null) => {
            this.pendingScenery.delete(asset);
            if (!this.isValid) return;
            if (texture) {
                const frame = new SpriteFrame();
                texture.addRef();
                frame.texture = texture;
                frame.packable = false;
                this.scenery[asset] = frame;
            } else {
                this.missingScenery.add(asset);
            }
            this.uiDirty = true;
        };
        const bundle = PIXEL_MENU_ART[asset];
        if (bundle) {
            loadCampaignPixelTexture(bundle, 'ui/' + asset, texture => {
                if (texture) finish(texture);
                else if (this.isValid) loadCampaignTexture(this.skinRoot, asset, finish);
                else this.pendingScenery.delete(asset);
            });
        } else loadCampaignTexture(this.skinRoot, asset, finish);
    }

    private releaseScenery(asset: string): void {
        const frame = this.scenery[asset];
        if (!frame) return;
        if (this.backdrop?.spriteFrame === frame) this.backdrop.spriteFrame = null;
        const texture = frame.texture;
        frame.destroy();
        texture.decRef();
        delete this.scenery[asset];
    }

    private drawScenery(key: string | null): void {
        const visible = key === 'night-depot';
        this.backdrop.node.active = visible;
        if (!visible) return;
        this.backdrop.spriteFrame = this.scenery['night-depot'] ?? null;
        this.backdrop.node.setPosition(0, 0, 0);
        this.backdrop.node.getComponent(UITransform)!.setContentSize(WIDTH * this.backdropScale, HEIGHT * this.backdropScale);
    }

    private drawMotes(): void {
        const g = this.embers;
        g.clear();
        for (let i = 0; i < 8; i++) {
            const cycle = (this.emberTime * 0.11 + i * 0.381) % 1;
            const x = 257 + (i * 31) % 88 - 19 * cycle + 3 * Math.sin(6 * cycle + i);
            const y = 379 + (i * 17) % 55 - 64 * cycle;
            g.fillColor = scratchColor(255, 213, 142, Math.round(150 * Math.sin(cycle * Math.PI)));
            g.circle(x, y, i % 3 ? 0.8 : 1.25);
            g.fill();
        }
    }

    private drawStick(active: boolean): void {
        const g = this.stickView;
        g.clear();
        if (!active || !this.stickOrigin) return;
        const y = this.stickY;
        const x = this.stickX;
        g.fillColor = STICK_BG;
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

    private createPatrolUi(): PatrolCampaignUi {
        const self = this;
        return new PatrolCampaignUi({
            get ui() { return self.ui; },
            get art() { return self.art; },
            get skillEffects() { return self.skillEffects; },
            get threats() { return self.threats; },
            get puddles() { return self.puddles; },
            get skin() { return self.skin; },
            get top() { return self.top; },
            get footer() { return self.footer; },
            get capsuleCeiling() { return self.capsuleCeiling; },
            get backdropScale() { return self.backdropScale; },
            get joystickMode() { return self.joystickMode; },
            get settings() { return self.settings.current; },
            updateSettings: patch => { self.updateSettings(patch); },
            play: sound => self.play(sound),
            setScenery: key => self.drawScenery(key),
            setBattleOffset: (x, y) => {
                self.battleOffset.set(x, y);
                self.actorSprites.setPosition(-x, -y, 0);
                self.art.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
                self.skinFloor.active = true;
                self.skinFloor.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
                self.puddles.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
                self.skillEffects.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
                self.threats.node.setPosition(-WIDTH / 2 - x, -HEIGHT / 2 - y, 0);
            },
            clearWorldLayers: () => {
                self.art.clear();
                self.skillEffects.clear();
                self.puddles.clear();
                self.threats.clear();
                self.skinFloor.active = false;
            },
            addTouch: (x, y, w, h, action) => self.touchTarget(x, y, w, h, action),
            text: (value, x, y, opts) => self.text(value, x, y, opts),
            block: (x, y, w, h, color) => self.block(x, y, w, h, color),
            syncMusic: () => self.syncMusic(),
            onBattleStopped: () => self.clearInput(),
            get engage() { return self.engage; },
            get isLowEndDevice() { return self.runtime.isLowEndDevice; },
            invalidateUi: () => { self.uiDirty = true; },
            triggerGC: () => { self.runtime.triggerGC(); },
        });
    }

    private draw(): void {
        this.uiDirty = false;
        const frame = screen.windowSize;
        const scale = Math.max(1e-6, view.getScaleY());
        const layout = `patrol:${frame.width}:${frame.height}:${scale}`;
        if (layout !== this.layout) {
            this.layout = layout;
            const insets = this.platform.getSafeInsets();
            const letterbox = Math.max(0, (frame.height / scale - HEIGHT) / 2);
            const backdropHeight = HEIGHT + 2 * letterbox;
            this.backdropScale = backdropHeight / HEIGHT;
            this.surface.setContentSize(WIDTH, HEIGHT);
            const pixelRatio = screen.devicePixelRatio;
            this.top = Math.floor(Math.min(589, HEIGHT - Math.max(0, insets.top * pixelRatio / scale - letterbox) - 27));
            this.capsuleCeiling = insets.menuBottom === undefined ? HEIGHT
                : Math.floor(HEIGHT - Math.max(0, insets.menuBottom * pixelRatio / scale - letterbox) - 8);
            this.footer = Math.ceil(Math.max(34, insets.bottom * pixelRatio / scale - letterbox + 16));
        }
        if (this.patrol.page !== 'home') {
            this.audio?.prepareCombat();
            this.skin?.prepare();
        }
        this.embers.node.active = this.patrol.page === 'home';
        this.actions.length = 0;
        this.labelIndex = 0;
        this.ui.clear();
        this.patrol.draw();
        if (this.patrol.page === 'home') this.drawMotes();
        this.drawStick(this.joystickMode && this.patrol.inBattle && !this.background);
        for (let index = this.labelIndex; index < this.labels.length; index++) {
            const slot = this.labels[index];
            if (slot.active) {
                slot.label.node.active = false;
                slot.active = false;
            }
        }
    }
}
