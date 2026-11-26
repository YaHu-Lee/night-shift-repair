import { Color, Graphics, JsonAsset, Node, Rect, resources, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import type { AssetManager } from 'cc';
import type { Battle, MeleeWindup, WeaponCast } from '../m1/Battle';
import type { ChapterBossView, MissionView } from '../m1/Encounter';
import type { CombatBounds, EnemyId, ToolId } from '../m1/content';
import { FIELD, TICK_RATE } from '../m1/content';
import { MELEE_RETURN_TICKS, MELEE_WINDUP_TICKS, weaponMount, isMeleeTool, sampleMeleeHead } from '../m1/WeaponMotion';
import { FLOATING_WEAPON_ART, sampleGunPose } from './FloatingWeaponArt';
import type { WeaponMuzzle } from './FloatingWeaponArt';
import { CAMPAIGN_MACHINE_ART, CAMPAIGN_TOOL_ART, PIXEL_ARENAS, PIXEL_DISPATCH_CHAPTERS, PIXEL_MENU_ART } from '../campaign/CampaignArt';
import { CAMPAIGN_CATALOG } from '../campaign/CampaignCatalog';
import { loadCampaignBundle, loadCampaignPixelTexture, loadCampaignTexture } from './CampaignAssetLoader';
import { drawCampaignEncounter } from './CampaignCombatView';
import { PrototypeDispatchView } from './PrototypeDispatchView';
import { PrototypeItemIcons } from './PrototypeItemIcons';
import type { PrototypeToolReveal } from './PrototypeToolReveal';

// All coordinates passed to the view use the existing 360 × 640 game space.
// The skin folder supplies semantic frame names; snapshots contain only gameplay IDs.
const unitSize: Record<EnemyId, number> = {
    crawler: 23, charger: 30, turret: 28, armored: 31, inspector: 57,
    pursuer: 29, reclaimer: 36, jammer: 32, ambusher: 28,
};
const amber = new Color(255, 186, 92);
const hurt = new Color(255, 157, 140);
const buttonColor = new Color(60, 78, 87);
const selectedColor = new Color(66, 131, 129);
const disabledColor = new Color(46, 56, 64);
const pressedColor = new Color(50, 90, 90);
const brass = new Color(255, 200, 114);
const brassDown = new Color(224, 161, 87);
const outline = new Color(10, 18, 23, 110);
const shadowFeather = new Color(11, 20, 24, 30);
const shadowContact = new Color(8, 16, 20, 62);
const wake = new Color(255, 216, 151);
const grapple = new Color(255, 177, 116);
const interference = new Color(211, 166, 255);
const exposed = new Color(143, 244, 230);
const shadowMachine = new Color(167, 183, 200, 58);
const offlineCore = new Color(108, 123, 134, 223);
const recovering = new Color(169, 187, 197);
type Enemy = Battle['enemies'][number];
type Actor = Readonly<{ x: number; y: number }>;
type GunAim = { tool: ToolId; tick: number; time: number; bearing: number; desired: number; lastTarget: number };
type Pose = 'idle' | 'step-a' | 'step-b' | 'windup' | 'strike' | 'recover' | 'hit';
type ActorMotion = { x: number; y: number; dx: number; dy: number; tick: number; stride: number; heading: number };
const poses: readonly Pose[] = ['idle', 'step-a', 'step-b', 'windup', 'strike', 'recover', 'hit'];
const headings = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'] as const;
type PixelHeading = Uppercase<typeof headings[number]>;
type PixelAction = 'idle' | 'walk' | 'attack' | 'hit' | 'run-strike';
type PixelRect = [number, number, number, number];
type Grip = { dx: number; dy: number; angle: number; layer: 'back' | 'front'; visible: boolean };
type PixelClip = { fps: number; frames: PixelRect[]; mounts: Record<'R' | 'L', Grip | null>[] };
type PixelMechanicAtlas = {
    pivot: [number, number];
    atlasSize: [number, number];
    mirrors: Partial<Record<PixelHeading, PixelHeading>>;
    animations: Record<PixelAction, Record<PixelHeading, PixelClip>>;
};
type ToolMount = { grip: readonly [number, number]; tip: readonly [number, number]; size: number };
type PixelTool = { rect: PixelRect; grip: [number, number]; tip: [number, number] };

const pixelMechanicRoot = 'pixel/mechanic';
const pixelMechanicScale = 0.8;
const pixelWeaponScale = 1;
const walkFrameDistance = 19.5;
// Grip and tip are local pixels in the existing workshop tool frames.
const toolMounts: Record<ToolId, ToolMount> = {
    wrench: { grip: [90, 96], tip: [21, 25], size: 21 },
    riveter: { grip: [78, 72], tip: [9, 27], size: 21 },
    torch: { grip: [68, 39], tip: [2, 28], size: 20 }, // Cropped to the nozzle, without the icon's flame.
    induction: { grip: [96, 44], tip: [17, 63], size: 19 },
    arc_gun: { grip: [89, 78], tip: [15, 48], size: 22 },
    hydraulic_nailer: { grip: [91, 75], tip: [22, 103], size: 22 },
    pulse_nozzle: { grip: [96, 80], tip: [15, 44], size: 22 },
    traction_coil: { grip: [94, 77], tip: [17, 78], size: 18 },
    split_probe: { grip: [37, 76], tip: [112, 37], size: 22 },
    bypass_wrench: { grip: [98, 94], tip: [25, 46], size: 22 },
};
const directionalAtlases: Readonly<Record<string, readonly string[]>> = {
    'enemy-yard': ['crawler', 'charger', 'turret', 'armored', 'inspector'],
    'enemy-specialists': ['pursuer', 'reclaimer', 'jammer', 'ambusher'],
    'enemy-command': ['supervisor', 'elite', 'gatekeeper', 'tow', 'silence', 'core'],
    'mechanic-directional': ['mechanic'],
};
const SOUTH = 6;

function facing(dx: number, dy: number, previous = SOUTH): number {
    if (Math.hypot(dx, dy) < 0.02) return previous;
    return (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + headings.length) % headings.length;
}

function actorFrame(actor: string, pose: Pose, heading: number): string {
    return actor + ':' + pose + ':' + headings[heading];
}

function walkPose(motion: ActorMotion): Pose {
    if (Math.hypot(motion.dx, motion.dy) < 0.02) return 'idle';
    return motion.stride % 12 < 6 ? 'step-a' : 'step-b';
}

function age(tick: number, event?: number): number { return tick - (event ?? -Infinity); }

function pixelFrameKey(action: PixelAction, heading: PixelHeading, index: number): string {
    return `pixel-mechanic:${action}:${heading}:${index}`;
}

function pixelHeading(index: number): PixelHeading {
    return headings[index].toUpperCase() as PixelHeading;
}

function ease(t: number): number {
    const f = Math.min(1, Math.max(0, t));
    return f * f * (3 - 2 * f);
}

function toolAxis({ grip, tip }: PixelTool): number {
    return Math.atan2(grip[1] - tip[1], tip[0] - grip[0]);
}

function blendAngle(from: number, to: number, amount: number): number {
    const turn = to - from;
    return from + Math.atan2(Math.sin(turn), Math.cos(turn)) * amount;
}

function toolOffset(view: PixelTool, anchor: [number, number], angle: number, scale = pixelWeaponScale, flip = false): Actor {
    const [, , w, h] = view.rect;
    const x = (anchor[0] - w / 2) * scale * (flip ? -1 : 1), y = (h / 2 - anchor[1]) * scale;
    return { x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) };
}

// The source artwork faces right. Mirror before pitching so a left-facing gun stays upright.
function gunRotation(view: PixelTool, heading: number, flip: boolean): number {
    const axis = toolAxis(view);
    return heading - (flip ? Math.PI - axis : axis);
}

// Only close-mounted guns need extra travel to clear the torso.
function gunExtension(gripX: number, heading: number): number {
    return Math.max(0, 20 - Math.abs(gripX)) * ease(-Math.sign(gripX) * Math.cos(heading));
}

function enemyPose(battle: Readonly<Battle>, enemy: Enemy, chapterBoss: ChapterBossView | null): number {
    const step = Math.floor((battle.tick + enemy.id * 3) / 5);
    const remaining = enemy.next - battle.tick;
    switch (enemy.kind) {
        case 'charger':
            if (enemy.state === 'warn') return 1;
            if (enemy.state === 'dash') return 2;
            return remaining > 46 ? 3 : 0;
        case 'turret':
            if (enemy.state === 'warn') return remaining > 8 ? 1 : 2;
            return remaining > 64 ? 3 : 0;
        case 'inspector':
            if (chapterBoss?.kind === 'supervisor') return chapterBoss.vulnerable ? 2 : step % 2;
            if (battle.boss?.phase === 'recover') return 3;
            if (battle.boss && battle.boss.phase !== 'patrol') return 2;
            return step % 2;
        default: return step % 4;
    }
}

class SpritePool {
    private readonly items: { sprite: Sprite; transform: UITransform }[] = [];
    private used = 0;
    constructor(private readonly parent: Node) {}

    begin(): void { this.used = 0; }

    put(frame: SpriteFrame, x: number, y: number, w: number, h: number, angle: number, color: Color, sliced = false, flip = false, scaleY = 1): void {
        let item = this.items[this.used++];
        if (!item) {
            const node = new Node('SkinSprite');
            node.layer = this.parent.layer;
            this.parent.addChild(node);
            const transform = node.addComponent(UITransform);
            const sprite = node.addComponent(Sprite);
            sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            item = { sprite, transform };
            this.items.push(item);
        }
        const { sprite, transform } = item;
        sprite.type = sliced ? Sprite.Type.SLICED : Sprite.Type.SIMPLE;
        sprite.spriteFrame = frame;
        sprite.color = color;
        transform.setContentSize(w, h);
        sprite.node.setPosition(Math.round(x), Math.round(y), 0);
        sprite.node.angle = angle;
        sprite.node.setScale(flip ? -1 : 1, scaleY, 1);
        sprite.node.active = true;
    }

    finish(): void {
        for (let i = this.used; i < this.items.length && this.items[i].sprite.node.active; i++) {
            const { sprite } = this.items[i];
            sprite.node.active = false;
            sprite.spriteFrame = null;
        }
    }
}

export class BattleSkinView {
    private readonly frames = new Map<string, SpriteFrame>();
    private readonly world: SpritePool;
    private readonly machineGround: Graphics;
    private readonly ui: SpritePool;
    private readonly floor: SpritePool;
    private encounterProps?: SpritePool;
    private stageId = '';
    private arena = 'yard';
    private ticketArena?: string;
    private readonly arenas = new Map<string, { floor: SpriteFrame; ticket: SpriteFrame; texture: Texture2D }>();
    private dispatchCrop?: { source: SpriteFrame; height: number; frame: SpriteFrame };
    private readonly pendingArenas = new Set<string>();
    private readonly dispatchPacks = new Set<string>();
    private readonly pixelFloors = new Map<string, { frame: SpriteFrame; texture: Texture2D }>();
    private readonly pendingPixelFloors = new Set<string>();
    private pixelFloorBounds?: CombatBounds;
    private prepared = false;
    private disposed = false;
    private modelIcons?: PrototypeItemIcons;
    private modelDispatch?: PrototypeDispatchView;
    private dispatchVisible = false;
    private toolReveal?: PrototypeToolReveal;
    private toolRevealVisible = false;
    private readonly motion = new WeakMap<Actor, ActorMotion>();
    private pixelMechanic?: PixelMechanicAtlas;
    private readonly pixelTools = new Map<ToolId, PixelTool>();
    private readonly weaponOrigins = new WeakMap<WeaponCast, Actor>();
    private readonly gunAims = new WeakMap<Actor, GunAim[]>();
    private readonly floatingCasts = new WeakMap<WeaponCast, WeaponMuzzle>();
    readonly weaponOrigin = (cast: WeaponCast): Actor | undefined => this.weaponOrigins.get(cast);
    readonly floatingWeaponOrigin = (cast: WeaponCast): WeaponMuzzle | undefined => this.floatingCasts.get(cast);

    constructor(private readonly root: string, floor: Node, actors: Node, private readonly uiRoot: Node,
        private readonly invalidate: () => void, private readonly campaign = false, private readonly modelArt = false) {
        this.floor = new SpritePool(floor);
        const signals = new Node('MachineShadows');
        signals.layer = actors.layer;
        actors.addChild(signals);
        this.machineGround = signals.addComponent(Graphics);
        this.world = new SpritePool(actors);
        this.ui = new SpritePool(uiRoot);
        if (!campaign) this.prepare();
    }

    prepare(): void {
        if (this.prepared) return;
        this.prepared = true;
        this.setStage(this.stageId, this.arena);
        if (!this.modelArt) this.prepareSpriteArt();
        const { root, invalidate } = this;
        resources.load(root + '/frames', JsonAsset, (error, manifest) => {
            if (error || this.disposed) return;
            resources.load(root + '/sheet/texture', Texture2D, (loadError, texture) => {
                if (loadError || this.disposed) return;
                const rectangles = manifest.json as Record<string, number[]>;
                for (const key of Object.keys(rectangles)) {
                    const rect = rectangles[key];
                    if (!Array.isArray(rect) || rect.length !== 4) continue;
                    const [x, y, w, h] = rect;
                    if (!rect.every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0
                        || x + w > texture.width || y + h > texture.height) continue;
                    const frame = new SpriteFrame();
                    frame.reset({ texture, rect: new Rect(x, y, w, h) });
                    frame.packable = false;
                    if (key === 'panel') {
                        frame.insetTop = frame.insetBottom = 9;
                        frame.insetLeft = frame.insetRight = 10;
                    }
                    this.frames.set(key, frame);
                }
                const torch = this.frames.get('torch');
                if (this.campaign && !this.modelArt && torch) {
                    const { x, y, width, height } = torch.rect;
                    const flameWidth = 43;
                    const heldTorch = new SpriteFrame();
                    heldTorch.reset({ texture, rect: new Rect(x + flameWidth, y, width - flameWidth, height) });
                    heldTorch.packable = false;
                    this.frames.set('held-torch', heldTorch);
                }
                invalidate();
            });
        });
    }

    private prepareSpriteArt(): void {
        const { root, invalidate } = this;
        for (const [atlas, actors] of Object.entries(directionalAtlases)) {
            this.loadAtlas(atlas, actors.flatMap(actor => poses.flatMap(pose =>
                headings.map((_heading, index) => actorFrame(actor, pose, index)))), headings.length);
        }
        resources.load(root + '/yard/texture', Texture2D, (error, texture) => {
            if (error || this.disposed) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.frames.set('yard', frame);
            const shutter = new SpriteFrame();
            shutter.reset({ texture, rect: new Rect(0, 0, texture.width, Math.round(texture.width / 3)) });
            shutter.packable = false;
            this.frames.set('shutter', shutter);
            this.setStage(this.stageId, this.arena);
            invalidate();
        });
        if (this.campaign) {
            this.loadPixelArt();
            resources.load(root + '/pump-floor/texture', Texture2D, (error, texture) => {
                if (error || this.disposed) return;
                const frame = new SpriteFrame();
                frame.texture = texture;
                this.frames.set('pump-floor', frame);
                this.setStage(this.stageId, this.arena);
                invalidate();
            });
            this.loadAtlas('campaign-machines', CAMPAIGN_MACHINE_ART.map(key => 'machine-' + key), 4);
            this.loadAtlas('campaign-tools', CAMPAIGN_TOOL_ART, 3);
            this.loadAtlas('radio-portraits', ['radio-aruan', 'radio-chenqi'], 2);
        }
    }

    private loadPixelArt(): void {
        loadCampaignBundle('campaign-ch01', bundle => {
            if (!bundle || this.disposed) return;
            for (const key of ['dispatch-01', 'dispatch-02']) {
                bundle.load(key + '/texture', Texture2D, (error, texture) => {
                    if (error || this.disposed) return;
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    this.frames.set(key, frame);
                    this.invalidate();
                });
            }
            bundle.load(pixelMechanicRoot + '/frames', JsonAsset, (error, asset) => {
                if (error || this.disposed) return;
                const atlas = asset.json as PixelMechanicAtlas;
                bundle.load(pixelMechanicRoot + '/mechanic-atlas/texture', Texture2D, (loadError, texture) => {
                    if (loadError || this.disposed) return;
                    this.setPixelMechanic(atlas, texture);
                });
            });
            this.loadPixelAtlas(bundle, 'pixel/enemies', 'actors', 'pixel-enemy:');
            this.loadPixelAtlas(bundle, 'pixel/items', 'workshop', 'pixel-item:');
            bundle.load('pixel/ui/radio-portraits/texture', Texture2D, (error, texture) => {
                if (error || this.disposed) return;
                const side = texture.height;
                if (side * 2 !== texture.width) return;
                texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                this.addPixelFrame('pixel-item:radio-aruan', [0, 0, side, side], texture);
                this.addPixelFrame('pixel-item:radio-chenqi', [side, 0, side, side], texture);
                this.invalidate();
            });
            for (const tool of Object.keys(FLOATING_WEAPON_ART) as ToolId[]) {
                const { folder } = FLOATING_WEAPON_ART[tool];
                const root = 'pixel/' + folder;
                bundle.load(root + '/sprite', JsonAsset, (error, asset) => {
                    if (error || this.disposed) return;
                    bundle.load(root + '/weapon/texture', Texture2D, (loadError, texture) => {
                        if (loadError || this.disposed) return;
                        const view = asset.json as PixelTool;
                        texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                        this.addPixelFrame('pixel-tool:' + tool, view.rect, texture);
                        this.pixelTools.set(tool, view);
                        this.invalidate();
                    });
                });
            }
        });
    }

    private loadPixelAtlas(bundle: AssetManager.Bundle, root: string, filename: string, framePrefix: string): void {
        bundle.load(root + '/frames', JsonAsset, (error, asset) => {
            if (error || this.disposed) return;
            type Page = { texture: string; frames: Record<string, PixelRect> };
            const index = asset.json as { pages?: Page[] };
            const pages = index.pages ?? [{ texture: filename, frames: asset.json as Record<string, PixelRect> }];
            for (const page of pages) {
                bundle.load(root + '/' + page.texture + '/texture', Texture2D, (loadError, texture) => {
                    if (loadError || this.disposed) return;
                    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
                    for (const [key, rect] of Object.entries(page.frames)) this.addPixelFrame(framePrefix + key, rect, texture);
                    this.invalidate();
                });
            }
        });
    }

    private addPixelFrame(key: string, [x, y, width, height]: PixelRect, texture: Texture2D): void {
        const frame = new SpriteFrame();
        frame.reset({ texture, rect: new Rect(x, y, width, height) });
        frame.packable = false;
        this.frames.set(key, frame);
    }

    private setPixelMechanic(atlas: PixelMechanicAtlas, texture: Texture2D): void {
        if (texture.width !== atlas.atlasSize[0] || texture.height !== atlas.atlasSize[1]) return;
        texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
        for (const action of Object.keys(atlas.animations) as PixelAction[]) {
            for (const heading of Object.keys(atlas.animations[action]) as PixelHeading[]) {
                atlas.animations[action][heading].frames.forEach((rect, index) => {
                    this.addPixelFrame(pixelFrameKey(action, heading, index), rect, texture);
                });
            }
        }
        this.pixelMechanic = atlas;
        this.invalidate();
    }

    has(key: string): boolean {
        return (key === 'mechanic' && !!this.pixelMechanic) || this.frames.has(key)
            || this.frames.has('pixel-item:' + key) || this.frames.has(actorFrame(key, 'idle', SOUTH));
    }

    private loadAtlas(asset: string, keys: readonly string[], columns: number): void {
        resources.load(this.root + '/' + asset + '/texture', Texture2D, (error, texture) => {
            if (error || this.disposed) return;
            const width = Math.floor(texture.width / columns);
            const height = Math.floor(texture.height / Math.ceil(keys.length / columns));
            keys.forEach((key, i) => {
                const frame = new SpriteFrame();
                frame.reset({ texture, rect: new Rect(i % columns * width, Math.floor(i / columns) * height, width, height) });
                frame.packable = false;
                this.frames.set(key, frame);
            });
            this.invalidate();
        });
    }

    setStage(id: string, arena = id === '02' ? 'pump-floor' : 'yard'): void {
        this.stageId = id;
        this.arena = arena;
        this.pixelFloorBounds = undefined;
        this.floor.begin();
        if (!this.modelArt || !PrototypeDispatchView.supports(id)) {
            this.loadArena(arena);
            if (this.campaign && !this.modelArt) this.loadPixelFloor(arena);
            const frame = this.arenas.get(arena)?.floor ?? this.frames.get(arena) ?? this.frames.get('yard');
            if (frame) this.floor.put(frame, (FIELD.left + FIELD.right) / 2, (FIELD.top + FIELD.bottom) / 2,
                FIELD.right - FIELD.left, FIELD.top - FIELD.bottom, 0, Color.WHITE);
        }
        this.floor.finish();
    }

    drawPixelFloor(field: CombatBounds): boolean {
        const surface = this.pixelFloors.get(this.arena);
        if (!surface) return false;
        if (this.pixelFloorBounds !== field) {
            const { left, right, top, bottom } = field;
            this.floor.begin();
            this.floor.put(surface.frame, (left + right) / 2, (bottom + top) / 2, right - left, top - bottom, 0, Color.WHITE);
            this.floor.finish();
            this.pixelFloorBounds = field;
        }
        return true;
    }

    private loadPixelFloor(arena: string): void {
        const name = PIXEL_ARENAS[arena];
        if (!this.prepared || !name || this.pixelFloors.has(arena) || this.pendingPixelFloors.has(arena)) return;
        this.pendingPixelFloors.add(arena);
        loadCampaignPixelTexture(name, 'arenas/' + arena, texture => {
            this.pendingPixelFloors.delete(arena);
            if (!texture || this.disposed) return;
            texture.addRef();
            const frame = new SpriteFrame();
            frame.reset({ texture, rect: new Rect(0, 0, texture.width, texture.height) });
            frame.packable = false;
            this.pixelFloors.set(arena, { frame, texture });
            if (this.pixelFloors.size > 3) {
                const oldest = Array.from(this.pixelFloors.keys()).find(key => key !== arena && key !== this.arena);
                if (oldest) this.releasePixelFloor(oldest);
            }
            this.invalidate();
        });
    }

    private releasePixelFloor(arena: string): void {
        const surface = this.pixelFloors.get(arena);
        if (!surface) return;
        surface.frame.destroy();
        surface.texture.decRef();
        this.pixelFloors.delete(arena);
    }

    private loadArena(arena: string): void {
        if (!this.prepared || (!/^stage-\d\d$/.test(arena) && arena !== 'city-restored')
            || this.arenas.has(arena) || this.pendingArenas.has(arena)) return;
        this.pendingArenas.add(arena);
        const accept = (texture: Texture2D | null) => {
            this.pendingArenas.delete(arena);
            if (!texture || this.disposed) return;
            texture.addRef();
            const floor = new SpriteFrame();
            floor.texture = texture;
            const ticket = new SpriteFrame();
            ticket.reset({ texture, rect: new Rect(0, 0, texture.width, Math.floor(texture.width / 2)) });
            ticket.packable = false;
            this.arenas.set(arena, { floor, ticket, texture });
            if (arena === this.arena) this.setStage(this.stageId, this.arena);
            this.invalidate();
            if (this.arenas.size > 3) {
                const old = Array.from(this.arenas.keys()).find(key => key !== this.arena && key !== this.ticketArena && key !== arena);
                if (old) this.releaseArena(old);
            }
        };
        if (arena === 'city-restored' && this.campaign && !this.modelArt) {
            loadCampaignPixelTexture(PIXEL_MENU_ART[arena]!, 'ui/' + arena, texture => {
                if (texture || this.disposed) accept(texture);
                else loadCampaignTexture(this.root, arena, accept);
            });
        } else loadCampaignTexture(this.root, arena, accept);
    }

    private releaseArena(key: string): void {
        const asset = this.arenas.get(key);
        if (!asset) return;
        if (this.dispatchCrop?.source === asset.floor || this.dispatchCrop?.source === asset.ticket) {
            this.dispatchCrop.frame.destroy();
            this.dispatchCrop = undefined;
        }
        asset.floor.destroy();
        asset.ticket.destroy();
        asset.texture.decRef();
        this.arenas.delete(key);
    }

    dispatchArt(x: number, y: number, id: string, arena: string, height: number): void {
        if (this.modelArt && PrototypeDispatchView.supports(id)) {
            this.modelDispatch ??= new PrototypeDispatchView(this.uiRoot.scene!, this.invalidate);
            this.dispatchVisible = true;
            const model = this.modelDispatch.show(id);
            if (model) this.putDispatchArt(model, x, y, height);
            return;
        }
        if (this.campaign && !this.modelArt) {
            const stage = CAMPAIGN_CATALOG.find(entry => entry.id === id);
            const pixel = this.frames.get('pixel-dispatch:' + id);
            if (pixel) {
                this.putDispatchArt(pixel, x, y, height);
                return;
            }
            if (stage && PIXEL_DISPATCH_CHAPTERS.includes(stage.chapter) && !this.dispatchPacks.has(stage.chapter)) {
                const chapter = stage.chapter;
                this.dispatchPacks.add(chapter);
                loadCampaignBundle('campaign-ch' + chapter, bundle => {
                    if (bundle && !this.disposed) this.loadPixelAtlas(bundle, 'pixel/dispatch', 'scenes', 'pixel-dispatch:');
                    else this.dispatchPacks.delete(chapter);
                });
            }
        }
        const asset = id === 'ending' ? 'city-restored' : arena;
        this.ticketArena = asset;
        this.loadArena(asset);
        const picture = this.arenas.get(asset);
        const source = this.frames.get('dispatch-' + id) ?? (id === 'ending' ? picture?.floor : picture?.ticket);
        if (!source) {
            if (height >= 110) this.shopfront(x, y);
            return;
        }
        this.putDispatchArt(source, x, y, height);
    }

    private putDispatchArt(source: SpriteFrame, x: number, y: number, height: number): void {
        let frame = source;
        if (height < 164) {
            if (this.dispatchCrop?.source !== source || this.dispatchCrop.height !== height) {
                this.dispatchCrop?.frame.destroy();
                const region = source.rect;
                const cropHeight = Math.max(1, Math.floor(region.height * height / 164));
                const crop = new SpriteFrame();
                crop.reset({ texture: source.texture,
                    rect: new Rect(region.x, region.y + Math.floor((region.height - cropHeight) / 2), region.width, cropHeight) });
                crop.packable = false;
                this.dispatchCrop = { source, height, frame: crop };
            }
            frame = this.dispatchCrop.frame;
        }
        this.ui.put(frame, x, y, 328, height, 0, Color.WHITE);
    }

    private icon(pool: SpritePool, key: string, x: number, y: number, size: number,
        angle = 0, color = Color.WHITE, flip = false): boolean {
        const frame = this.frames.get(key);
        if (!frame) return false;
        const rect = frame.rect;
        const scale = size / Math.max(rect.width, rect.height);
        pool.put(frame, x, y, rect.width * scale, rect.height * scale, angle, color, false, flip);
        return true;
    }

    private sampleMotion(actor: Actor, tick: number, heading = SOUTH): ActorMotion {
        let motion = this.motion.get(actor);
        if (!motion) {
            motion = { x: actor.x, y: actor.y, dx: 0, dy: 0, tick, stride: 0, heading };
            this.motion.set(actor, motion);
        }
        if (motion.tick !== tick) {
            motion.dx = actor.x - motion.x;
            motion.dy = actor.y - motion.y;
            motion.x = actor.x;
            motion.y = actor.y;
            motion.tick = tick;
            const distance = Math.hypot(motion.dx, motion.dy);
            motion.stride = distance < 0.02 ? 0 : motion.stride + distance;
        }
        return motion;
    }

    private drawMechanic(battle: Readonly<Battle>, floatingTick?: number): void {
        const { player, tick, playerAttack } = battle;
        const motion = this.sampleMotion(player, tick);
        const attackAge = age(tick, playerAttack?.tick);
        const injuryAge = age(tick, player.hurtAt);
        const tint = injuryAge < 5 || tick < player.invulnerableUntil && tick % 6 < 3 ? hurt : Color.WHITE;
        if (floatingTick !== undefined) {
            this.drawFloatingTools(battle, floatingTick, () => {
                if (!this.pixelMechanic || !this.drawFloatingBody(this.pixelMechanic, player, motion, injuryAge, tint)) {
                    this.drawLegacyMechanic(player, motion, injuryAge, tint);
                }
            });
            return;
        }
        if (this.pixelMechanic && this.drawPixelMechanic(this.pixelMechanic, battle, motion, attackAge, injuryAge, tint)) return;
        this.drawLegacyMechanic(player, motion, injuryAge, tint, playerAttack, attackAge);
    }

    private drawLegacyMechanic(player: Actor, motion: ActorMotion, injuryAge: number, tint: Color,
        playerAttack?: Readonly<Actor>, attackAge = Infinity): void {
        motion.heading = attackAge < 8 && playerAttack ? facing(playerAttack.x, playerAttack.y, motion.heading)
            : facing(motion.dx, motion.dy, motion.heading);
        const pose = injuryAge < 6 ? 'hit' : attackAge < 5 ? 'strike'
            : attackAge < 8 ? 'recover' : walkPose(motion);
        if (this.icon(this.world, actorFrame('mechanic', pose, motion.heading), player.x, player.y, 40, 0, tint)) return;
        const horizontal = motion.heading === 0 || motion.heading === 4;
        const legacy = horizontal ? 'side' : motion.heading > 0 && motion.heading < 4 ? 'back' : 'walk';
        const index = pose === 'step-a' ? 0 : pose === 'step-b' ? 2 : 1;
        const frame = legacy === 'walk' && pose === 'idle' ? 'mechanic' : legacy + index;
        this.icon(this.world, this.has(frame) ? frame : 'mechanic', player.x, player.y, 34, 0, tint, motion.heading === 4);
    }

    private putPixelBody(atlas: PixelMechanicAtlas, frame: SpriteFrame, player: Actor, tint: Color): void {
        const { width, height } = frame.rect;
        const scale = pixelMechanicScale;
        this.world.put(frame, player.x + (width / 2 - atlas.pivot[0]) * scale,
            player.y + (atlas.pivot[1] - height / 2) * scale, width * scale, height * scale, 0, tint);
    }

    private drawFloatingBody(atlas: PixelMechanicAtlas, player: Actor, motion: ActorMotion,
        injuryAge: number, tint: Color): boolean {
        motion.heading = facing(motion.dx, motion.dy, motion.heading);
        const direction = pixelHeading(motion.heading);
        const stride = Math.floor(motion.stride / walkFrameDistance);
        const walking = Math.hypot(motion.dx, motion.dy) >= 0.02;
        const action = injuryAge < 6 ? 'hit' : walking ? 'walk' : 'idle';
        const index = action === 'walk' ? stride % atlas.animations.walk[direction].frames.length : 0;
        const frame = this.frames.get(pixelFrameKey(action, direction, index));
        if (!frame) return false;
        this.drawModelShadow(player.x, player.y, 9, 4);
        // Subtle 1px breathing bob when standing still + squash recoil on injury!
        const breathe = !walking && injuryAge >= 6 ? Math.round(Math.sin(motion.tick * 0.16) * 0.8) : 0;
        const injuredSquash = injuryAge < 4 ? (injuryAge < 2 ? 0.86 : 1.08) : 1;
        const { width, height } = frame.rect;
        const scale = pixelMechanicScale;
        const w = width * scale * (injuryAge < 2 ? 1.16 : 1);
        const h = height * scale * injuredSquash;
        this.world.put(frame, player.x + (width / 2 - atlas.pivot[0]) * scale,
            player.y + (atlas.pivot[1] - height / 2) * scale + breathe, w, h, 0, tint);
        return true;
    }

    private drawFloatingTools(battle: Readonly<Battle>, time: number, drawBody: () => void): void {
        const windups = battle.meleeWindups();
        for (const cast of battle.weaponCasts) {
            if (cast.melee) continue;
            const previous = this.floatingCasts.get(cast);
            if (previous) {
                previous.flash = undefined;
                continue;
            }
            const view = this.pixelTools.get(cast.tool);
            if (!view) continue;
            const grip = weaponMount(cast.slot, battle.tools.length).grip;
            const dx = cast.ux * cast.targetRange - grip.x, dy = cast.uy * cast.targetRange - grip.y;
            const heading = (dx || dy) ? Math.atan2(dy, dx) : Math.atan2(cast.uy, cast.ux);
            const length = Math.hypot(view.tip[0] - view.grip[0], view.tip[1] - view.grip[1]) * pixelWeaponScale;
            const reach = length + gunExtension(grip.x, heading);
            this.floatingCasts.set(cast, {
                x: cast.x + grip.x + Math.cos(heading) * reach,
                y: cast.y + grip.y + Math.sin(heading) * reach,
                heading,
            });
        }
        const drawSlot = (slot: number) => {
            const tool = battle.tools[slot]?.id;
            if (!tool) return;
            const latest = battle.weaponCasts.reduce<WeaponCast | undefined>(
                (previous, cast) => cast.slot === slot && cast.tool === tool ? cast : previous, undefined);
            const windup = windups.find(cue => cue.slot === slot && cue.tool === tool);
            this.drawFloatingTool(battle, slot, tool, time, latest, windup);
        };
        const count = battle.tools.length;
        for (let slot = 0; slot < count; slot++) {
            if (weaponMount(slot, count).behind) drawSlot(slot);
        }
        drawBody();
        for (let slot = 0; slot < count; slot++) {
            if (!weaponMount(slot, count).behind) drawSlot(slot);
        }
    }

    private gunBearing(battle: Readonly<Battle>, slot: number, time: number, rest: number, firing?: number): number {
        let aims = this.gunAims.get(battle.player);
        if (!aims) {
            aims = [];
            this.gunAims.set(battle.player, aims);
        }
        const tool = battle.tools[slot].id;
        let aim = aims[slot];
        if (!aim || aim.tool !== tool || time < aim.time) {
            aim = aims[slot] = { tool, tick: -1, time, desired: rest, bearing: rest, lastTarget: -Infinity };
        }
        if (aim.tick !== battle.tick) {
            aim.tick = battle.tick;
            const target = battle.rangedAimTarget(slot);
            if (target) {
                const grip = weaponMount(slot, battle.tools.length).grip;
                const dx = target.x - battle.player.x - grip.x, dy = target.y - battle.player.y - grip.y;
                if (dx || dy) aim.desired = Math.atan2(dy, dx);
                aim.lastTarget = time;
            }
        }
        if (firing !== undefined) {
            aim.bearing = aim.desired = firing;
            aim.lastTarget = time;
        } else {
            // Hold briefly after losing a target, then ease back into the holster pose.
            const parked = time - aim.lastTarget > 5;
            const dt = time - aim.time;
            aim.bearing = blendAngle(aim.bearing, parked ? rest : aim.desired, 1 - Math.exp(-dt * (parked ? 0.32 : 0.85)));
        }
        aim.time = time;
        return aim.bearing;
    }

    private drawFloatingTool(battle: Readonly<Battle>, slot: number, tool: ToolId, time: number,
        cast?: WeaponCast, windup?: MeleeWindup): void {
        const player = battle.player;
        const art = FLOATING_WEAPON_ART[tool];
        const view = this.pixelTools.get(tool);
        const mount = weaponMount(slot, battle.tools.length);
        const rest = Math.atan2(mount.head.y - mount.grip.y, mount.head.x - mount.grip.x);
        const elapsed = cast ? Math.max(0, time - cast.tick) : Infinity;
        if (isMeleeTool(tool)) {
            this.drawSweptTool(player, tool, mount.head, mount.grip, rest, view, elapsed, cast, windup, time - battle.tick);
            return;
        }
        const grip = mount.grip;
        const launched = cast && this.floatingCasts.get(cast);
        const aim = launched?.heading ?? rest;
        const pose = sampleGunPose(art.motion, elapsed);
        const strength = cast?.modified ? 1.22 : 1;
        const hold = art.effect === 'jet' || art.effect === 'pull' || art.effect === 'arc' ? 6 : 2;
        const bearing = this.gunBearing(battle, slot, time, rest, elapsed <= hold ? launched?.heading : undefined);
        const flip = Math.cos(bearing) < -1e-9;
        const heading = bearing + (flip ? -pose.turn : pose.turn);
        const sprite = this.frames.get('pixel-tool:' + tool);
        const extension = gunExtension(grip.x, bearing);
        const x = player.x + grip.x + Math.cos(bearing) * extension + (Math.cos(aim) * pose.travel - Math.sin(aim) * pose.side) * strength;
        const y = player.y + grip.y + Math.sin(bearing) * extension + (Math.sin(aim) * pose.travel + Math.cos(aim) * pose.side) * strength;
        if (!sprite || !view) {
            this.icon(this.world, tool, x, y, 18, 0, Color.WHITE);
            return;
        }
        const { width, height } = sprite.rect;
        const scale = pixelWeaponScale * pose.scale;
        const rotation = gunRotation(view, heading, flip);
        const pivot = toolOffset(view, view.grip, rotation, scale, flip);
        const cx = x - pivot.x, cy = y - pivot.y;
        this.world.put(sprite, cx, cy, width * scale, height * scale, rotation * 180 / Math.PI, Color.WHITE, false, flip);
        if (launched) {
            const tip = toolOffset(view, view.tip, rotation, scale, flip);
            launched.flash = { x: cx + tip.x, y: cy + tip.y, heading };
        }
    }

    private drawSweptTool(player: Actor, tool: ToolId, dock: Actor, grip: Actor, rest: number,
        view: PixelTool | undefined, elapsed: number, cast: WeaponCast | undefined, windup: MeleeWindup | undefined,
        fraction: number): void {
        const home = { x: player.x + dock.x, y: player.y + dock.y };
        const motion = cast?.melee;
        const cock = (ux: number, uy: number) => {
            const turn = blendAngle(rest, Math.atan2(uy, ux), 1) - rest;
            return rest - Math.sign(turn || dock.x) * (0.35 + 0.4 * Math.abs(turn) / Math.PI);
        };
        let head = home;
        let heading = rest;
        if (cast && motion && elapsed < motion.last + MELEE_RETURN_TICKS) {
            const sample = sampleMeleeHead(motion, Math.min(elapsed, motion.last));
            const back = ease((elapsed - motion.last) / MELEE_RETURN_TICKS);
            head = { x: sample.x + (home.x - sample.x) * back, y: sample.y + (home.y - sample.y) * back };
            const pivot = Math.atan2(sample.y - player.y - grip.y, sample.x - player.x - grip.x);
            heading = blendAngle(blendAngle(cock(cast.ux, cast.uy), pivot, ease(elapsed / motion.first)), rest, back);
        } else if (windup) {
            const ready = ease((windup.ageTicks + fraction + 1) / MELEE_WINDUP_TICKS);
            heading = blendAngle(rest, cock(windup.ux, windup.uy), ready);
            const pull = 2 * Math.sin(Math.PI * ready);
            head = { x: home.x - windup.ux * pull, y: home.y - windup.uy * pull };
        }
        const sprite = this.frames.get('pixel-tool:' + tool);
        if (!sprite || !view) {
            this.icon(this.world, tool, head.x, head.y, 18, 0, Color.WHITE);
            return;
        }
        const angle = heading - toolAxis(view);
        const tip = toolOffset(view, view.tip, angle);
        const { width, height } = sprite.rect;
        this.world.put(sprite, head.x - tip.x, head.y - tip.y, width * pixelWeaponScale, height * pixelWeaponScale,
            angle * 180 / Math.PI, Color.WHITE);
    }

    private drawPixelMechanic(atlas: PixelMechanicAtlas, battle: Readonly<Battle>, motion: ActorMotion,
        attackAge: number, injuryAge: number, tint: Color): boolean {
        const { player, playerAttack } = battle;
        const aim = playerAttack ? facing(playerAttack.x, playerAttack.y, motion.heading) : motion.heading;
        const attackFrameTicks = TICK_RATE / atlas.animations.attack[pixelHeading(aim)].fps;
        const striking = !!playerAttack && attackAge < 2 * attackFrameTicks;
        const primaryStrike = striking && battle.weaponCasts.some(cast => cast.tick === playerAttack.tick && cast.slot === 0);
        const walking = Math.hypot(motion.dx, motion.dy) >= 0.02;
        const injured = injuryAge < 6;
        const windup = !walking && !striking && !injured ? battle.meleeWindups()[0] : undefined;
        if (walking) motion.heading = facing(motion.dx, motion.dy, motion.heading);
        else if (!injured && striking) motion.heading = aim;
        else if (windup) motion.heading = facing(windup.ux, windup.uy, motion.heading);
        const direction = pixelHeading(motion.heading);
        let action: PixelAction = 'idle';
        if (injured) action = 'hit';
        else if (walking) {
            const movingStrike = atlas.animations['run-strike']?.[direction];
            action = primaryStrike && aim === motion.heading && movingStrike?.frames.length === 4 ? 'run-strike' : 'walk';
        } else if (striking || windup) action = 'attack';
        const clip = atlas.animations[action][direction];
        let index = 0;
        if (action === 'attack') {
            // The standstill off-hand cast uses the braced pose. Only the primary cast extends the right arm.
            if (windup) index = Math.min(1, windup.ageTicks);
            else if (attackAge >= attackFrameTicks) index = 3;
            else index = primaryStrike ? 2 : 0;
        }
        if (action === 'walk' || action === 'run-strike') index = Math.floor(motion.stride / walkFrameDistance) % clip.frames.length;
        const frame = this.frames.get(pixelFrameKey(action, direction, index));
        if (!frame) return false;

        this.drawModelShadow(player.x, player.y, 9, 4);
        const mirrored = !!atlas.mirrors[direction];
        const grips = clip.mounts[index];
        const castTick = !injured && attackAge < attackFrameTicks ? playerAttack?.tick : undefined;
        this.drawHeldTools(battle, grips, 'back', mirrored, tint, castTick);
        this.putPixelBody(atlas, frame, player, tint);
        this.drawHeldTools(battle, grips, 'front', mirrored, tint, castTick);
        return true;
    }

    private drawHeldTools(battle: Readonly<Battle>, grips: PixelClip['mounts'][number], layer: Grip['layer'],
        mirrored: boolean, tint: Color, castTick?: number): void {
        for (const slot of [0, 1] as const) {
            const grip = grips[slot === 0 ? 'R' : 'L'];
            const tool = battle.tools[slot]?.id;
            if (!grip?.visible || grip.layer !== layer || !tool) continue;
            const cast = castTick === undefined ? undefined
                : battle.weaponCasts.find(event => event.tick === castTick && event.slot === slot && event.tool === tool);
            const angle = cast && (cast.ux || cast.uy) ? Math.atan2(cast.uy, cast.ux) : -grip.angle * Math.PI / 180;
            const handX = battle.player.x + grip.dx * pixelMechanicScale;
            const handY = battle.player.y - grip.dy * pixelMechanicScale;
            if (this.drawPixelTool(tool, battle.player, grip, angle, tint, cast)) continue;
            const frame = this.frames.get(tool === 'torch' ? 'held-torch' : tool);
            if (!frame) continue;
            const mount = toolMounts[tool];
            const { width, height } = frame.rect;
            const flip = mirrored ? -1 : 1;
            const axis = Math.atan2(mount.grip[1] - mount.tip[1], (mount.tip[0] - mount.grip[0]) * flip);
            const rotation = angle - axis;
            const scale = mount.size / Math.max(width, height);
            const dx = (width / 2 - mount.grip[0]) * scale * flip;
            const dy = (mount.grip[1] - height / 2) * scale;
            const cos = Math.cos(rotation), sin = Math.sin(rotation);
            const x = handX + dx * cos - dy * sin;
            const y = handY + dx * sin + dy * cos;
            this.world.put(frame, x, y, width * scale, height * scale, rotation * 180 / Math.PI, tint, false, mirrored);
        }
    }

    private drawPixelTool(tool: ToolId, player: Actor, grip: Grip, angle: number, tint: Color, cast?: WeaponCast): boolean {
        const view = this.pixelTools.get(tool);
        const frame = this.frames.get('pixel-tool:' + tool);
        if (!frame || !view) return false;
        const { width, height } = frame.rect;
        const scale = pixelMechanicScale;
        const handX = grip.dx * scale, handY = -grip.dy * scale;
        const rotation = angle - toolAxis(view);
        const pivot = toolOffset(view, view.grip, rotation);
        this.world.put(frame, player.x + handX - pivot.x, player.y + handY - pivot.y,
            width * scale, height * scale, rotation * 180 / Math.PI, tint);
        // Save the visual contact at cast time even as the player continues to move.
        if (cast && !this.weaponOrigins.has(cast)) {
            const tip = toolOffset(view, view.tip, rotation);
            this.weaponOrigins.set(cast, { x: cast.x + handX - pivot.x + tip.x, y: cast.y + handY - pivot.y + tip.y });
        }
        return true;
    }

    private drawDirectionalEnemy(battle: Readonly<Battle>, enemy: Enemy, boss: ChapterBossView | null,
        mission: MissionView | null): boolean {
        const { player, tick } = battle;
        const { kind, x, y, state } = enemy;
        const key = boss?.kind ?? kind;
        const idle = actorFrame(key, 'idle', SOUTH);
        if (!this.frames.has(idle) && !this.frames.has('pixel-enemy:' + idle)) return false;
        const motion = this.sampleMotion(enemy, tick, facing(player.x - x, player.y - y));
        const legacyBoss = kind === 'inspector' && !boss ? battle.boss : null;
        const shotAge = age(tick, enemy.shotAt);
        const contactAge = age(tick, enemy.contactAt);
        const impactAge = age(tick, enemy.hitAt);
        const emergeAge = age(tick, enemy.revealedAt);
        const warning = boss ? (boss.volley ?? boss.hazard)?.state === 'warning' : legacyBoss
            ? legacyBoss.phase === 'warning' : state === 'warn';
        const striking = boss ? (boss.volley ?? boss.hazard)?.state === 'active' : legacyBoss
            ? legacyBoss.phase === 'sweep' || legacyBoss.phase === 'charge' || legacyBoss.phase === 'volley'
                || legacyBoss.phase === 'recover' && legacyBoss.attack === 'summon' && age(tick, legacyBoss.attackAt) < 5
            : state === 'dash' || shotAge < 5 || contactAge < 5 || kind === 'ambusher' && emergeAge >= 7 && emergeAge < 13;
        const recoveringPose = boss ? boss.recovering : legacyBoss ? legacyBoss.phase === 'recover'
            : shotAge < 11 || contactAge < 9 || kind === 'charger' && enemy.next - tick > 46
                || kind === 'reclaimer' && enemy.next - tick > 65 || kind === 'jammer' && enemy.next - tick > 58;
        const hazard = boss?.hazard;
        if (boss?.facing !== undefined || boss?.kind === 'supervisor') {
            // Duel headings stay locked through the attack and opening.
            const angle = boss.facing ?? -Math.PI / 2;
            motion.heading = facing(Math.cos(angle), Math.sin(angle), motion.heading);
        } else if (kind === 'armored') {
            motion.heading = facing(enemy.facingX ?? 0, enemy.facingY ?? 0, motion.heading);
        } else if (hazard?.shape === 'sector') {
            const center = hazard.from + hazard.sweep / 2;
            motion.heading = facing(Math.cos(center), Math.sin(center), motion.heading);
        } else if (hazard?.shape === 'tether') {
            motion.heading = facing(hazard.end.x - hazard.x, hazard.end.y - hazard.y, motion.heading);
        } else if (hazard?.shape === 'rect') {
            motion.heading = facing((hazard.left + hazard.right) / 2 - x, (hazard.bottom + hazard.top) / 2 - y, motion.heading);
        } else if ((legacyBoss && (warning || striking || recoveringPose)) || kind === 'charger' && state !== 'walk'
            || kind === 'turret' && (state === 'warn' || shotAge < 11) || kind === 'pursuer' && state === 'dash') {
            motion.heading = facing(enemy.vx, enemy.vy, motion.heading);
        } else if (state !== 'walk' && (kind === 'reclaimer' || kind === 'jammer')) {
            const target = (kind === 'reclaimer' ? enemy.tether ?? mission?.escort
                : mission?.points.find(point => point.state === 'active')) ?? player;
            motion.heading = facing(target.x - x, target.y - y, motion.heading);
        } else if (!boss || (!warning && !striking)) {
            if (walkPose(motion) !== 'idle') motion.heading = facing(motion.dx, motion.dy, motion.heading);
            else if (!boss && (kind === 'turret' || legacyBoss)) motion.heading = facing(player.x - x, player.y - y, motion.heading);
        }
        const hidden = kind === 'ambusher' && state === 'warn';
        const pose = hidden ? 'windup' : impactAge < 6 && !warning && !striking ? 'hit'
            : striking ? 'strike' : warning ? 'windup' : recoveringPose ? 'recover' : walkPose(motion);
        // Crisp hit-flash (bright white on frames 0-1, warm flash on 2-4) + squash-and-stretch + directional recoil jitter!
        const hitFlash = impactAge >= 0 && impactAge < 2;
        const tint = hidden ? shadowMachine : hitFlash ? new Color(255, 255, 255) : impactAge < 5 ? hurt : boss?.vulnerable ? exposed : Color.WHITE;
        const size = unitSize[kind];
        const ground = this.machineGround;
        if (!hidden) {
            ground.fillColor = outline;
            ground.ellipse(Math.round(x), Math.round(y - size * 0.16), size * 0.34, size * 0.15);
            ground.fill();
            // High-contrast pixel warning ring beneath dark/specialist enemies during windup
            if (warning && !boss) {
                ground.fillColor = new Color(255, 198, 92, 165);
                const wr = Math.round(size * 0.42);
                ground.rect(Math.round(x) - wr, Math.round(y - size * 0.16) - 1, 4, 2);
                ground.rect(Math.round(x) + wr - 4, Math.round(y - size * 0.16) - 1, 4, 2);
                ground.fill();
            }
        }
        // Squash & stretch on impact (frames 0-1 squash wide, frames 2-4 spring tall) + 2.5px knockback jitter away from player
        let sx = 1, sy = 1, jitterX = 0, jitterY = 0;
        if (impactAge >= 0 && impactAge < 5) {
            if (impactAge < 2) { sx = 1.24; sy = 0.78; }
            else { sx = 0.94; sy = 1.07; }
            const kb = impactAge < 2 ? 2.8 : 1.2;
            const dLen = Math.hypot(x - player.x, y - player.y) || 1;
            jitterX = ((x - player.x) / dLen) * kb;
            jitterY = ((y - player.y) / dLen) * kb;
        }
        const rise = impactAge < 6 ? (6 - impactAge) / 3 : striking ? 0.7 * Math.sin(tick * 0.5) : 0;
        const pixelFrame = this.frames.get('pixel-enemy:' + actorFrame(key, pose, motion.heading))
            ?? (pose === 'hit' ? this.frames.get('pixel-enemy:' + actorFrame(key, 'idle', motion.heading)) : undefined);
        if (pixelFrame) {
            const { width, height } = pixelFrame.rect;
            const kick = kind === 'turret' && shotAge < 4 ? (4 - shotAge) * 0.75 : 0;
            const drawX = x - enemy.vx * kick + jitterX;
            const drawY = y + rise - enemy.vy * kick + jitterY;
            this.world.put(pixelFrame, drawX, drawY, width * sx, height * sy, 0, tint);
            // Crisp white 4-way pixel hit-core flash on exact hit frame (solves missing white hit sprite!)
            if (hitFlash && !hidden) {
                ground.fillColor = new Color(255, 252, 232, 235);
                const cx = Math.round(drawX), cy = Math.round(drawY + size * 0.15);
                ground.rect(cx - 5, cy - 1, 10, 2);
                ground.rect(cx - 1, cy - 5, 2, 10);
                ground.fill();
            }
            return true;
        }
        return this.icon(this.world, actorFrame(key, pose, motion.heading), x + jitterX, y + rise + jitterY, size * 1.43, 0, tint);
    }

    private drawMachine(key: string, battle: Readonly<Battle>, enemy: Enemy, boss: ChapterBossView | null): void {
        const { player, tick } = battle;
        const { x, y, state, kind } = enemy;
        const remaining = enemy.next - tick;
        const step = (tick + enemy.id * 5) * 0.27;
        const drive = Math.sin(step);
        const warning = boss ? boss.hazard?.state === 'warning' : state === 'warn';
        const firing = boss ? boss.hazard?.state === 'active' : state === 'dash';
        const heading = state === 'dash' && kind === 'pursuer' ? enemy.vx : player.x - x;
        const direction = heading < 0 ? -1 : 1;
        let rise = 0;
        let tilt = 0;
        let tint = Color.WHITE;
        let lamp: Color | undefined;
        let lampHeight = 4;
        if (boss) {
            switch (boss.kind) {
                case 'gatekeeper':
                    tilt = warning || firing ? (boss.station && boss.station.x < x ? -1 : 1) * 6 : drive * 1.4;
                    rise = firing ? -2 : boss.vulnerable ? 2.1 : drive;
                    lamp = wake;
                    break;
                case 'tow': {
                    const end = boss.hazard?.shape === 'tether' ? boss.hazard.end : undefined;
                    tilt = end ? Math.max(-6, Math.min(6, (end.x - x) / 16)) : drive;
                    rise = warning ? 1.7 + drive * 0.6 : firing ? -1.8 : boss.vulnerable ? -2.3 : 0.6 * drive;
                    lamp = grapple;
                    break;
                }
                case 'silence':
                    tilt = firing ? 2.7 * drive : warning ? 2.2 : drive * 0.8;
                    rise = boss.vulnerable ? -2 : 1.2 * drive;
                    lampHeight = 12;
                    lamp = interference;
                    break;
                case 'core':
                    tilt = firing ? 2.1 * drive : warning ? 1.5 * drive : 0;
                    rise = (firing ? 2.4 : 1.3) * drive;
                    lamp = boss.stage === 3 ? exposed : boss.stage === 2 ? grapple : wake;
                    break;
            }
            tint = boss.vulnerable ? exposed : firing ? grapple : warning && tick % 8 < 4 ? wake : Color.WHITE;
            if (boss.vulnerable) lamp = exposed;
        } else {
            switch (kind) {
                case 'pursuer':
                    // A longer lean during the straight-line sprint makes the acceleration readable.
                    tilt = (firing ? 7 : 2.6) * direction + drive;
                    rise = (firing ? 1.2 : 0.6) * drive;
                    if (firing) lamp = exposed;
                    break;
                case 'reclaimer':
                    tilt = warning ? 5 * direction : remaining > 64 ? -4 * direction : 2.4 * drive;
                    rise = warning ? 1.3 + drive * 0.8 : remaining > 64 ? -1.6 : 1.1 * drive;
                    tint = warning ? wake : remaining > 64 ? recovering : Color.WHITE;
                    if (warning) lamp = grapple;
                    break;
                case 'jammer':
                    tilt = firing ? 2.5 * drive : warning ? -4 : drive;
                    rise = firing ? 2 * drive : warning ? 1 : 0.75 * drive;
                    tint = firing ? interference : warning ? wake : remaining > 51 ? recovering : Color.WHITE;
                    lamp = firing ? interference : warning ? wake : undefined;
                    lampHeight = 8;
                    break;
                case 'ambusher': {
                    const emerging = !warning && enemy.revealedAt !== undefined && tick - enemy.revealedAt < 9;
                    tint = warning ? shadowMachine : emerging ? exposed : Color.WHITE;
                    tilt = warning ? 0 : (emerging ? 5 : 3) * drive;
                    rise = warning ? -1.7 : emerging ? 1.7 : drive;
                    break;
                }
            }
        }
        const size = unitSize[kind];
        const ground = this.machineGround;
        // The ground plane and all combat telegraphs stay centered on the original simulation unit.
        if (!(kind === 'ambusher' && warning)) {
            ground.fillColor = outline;
            ground.ellipse(x, y - size * 0.16, size * 0.31, size * 0.14);
            ground.fill();
        }
        this.icon(this.world, key, x, y + rise, size, tilt, tint, !boss && direction < 0);
        if (lamp) {
            const intensity = warning ? (tick % 8 < 4 ? 4.8 : 3.1) : 3.9 + drive * 0.9;
            this.icon(this.world, 'bullet', x, y + rise + lampHeight, intensity, 0, lamp);
        }
    }

    drawWorld(battle: Readonly<Battle> | null, prototypeModels = false, floatingTick?: number): void {
        this.world.begin();
        this.machineGround.clear();
        if (battle) {
            const { player, tick } = battle;
            const mission = battle.mission;
            const core = battle.boss?.unit;
            if (core && core.hp <= 0 && battle.chapterBoss?.kind === 'core' && !prototypeModels) {
                // The housing drops below the released scrap, which remains at its pickup point.
                const heading = battle.chapterBoss.facing;
                const facingAtStop = heading === undefined ? this.sampleMotion(core, tick).heading : facing(Math.cos(heading), Math.sin(heading));
                const settled = actorFrame('core', 'recover', facingAtStop);
                if (!this.icon(this.world, 'pixel-enemy:' + settled, core.x, core.y - 14, 80, 0, offlineCore)
                    && !this.icon(this.world, settled, core.x, core.y - 14, unitSize.inspector * 1.17, 0, offlineCore)) {
                    this.icon(this.world, 'machine-core', core.x, core.y - 14, unitSize.inspector * 0.83, 0, offlineCore);
                }
            }
            if (!prototypeModels) for (const part of battle.parts) {
                if (!this.icon(this.world, 'pixel-item:scrap', part.x, part.y, 13)) {
                    this.icon(this.world, 'scrap', part.x, part.y, 9);
                }
            }
            if (floatingTick !== undefined && !prototypeModels) {
                for (const enemy of battle.defeatedEnemies) {
                    const t = (floatingTick - enemy.hitAt!) / 6;
                    if (t < 0 || t >= 1 || enemy === core) continue;
                    const dx = enemy.x - player.x, dy = enemy.y - player.y, length = Math.hypot(dx, dy) || 1;
                    const key = actorFrame(enemy.kind, 'hit', facing(-dx, -dy));
                    const frame = this.frames.get('pixel-enemy:' + key);
                    if (!frame) continue;
                    const scale = 1 - .42 * t, { width, height } = frame.rect;
                    this.world.put(frame, enemy.x + dx / length * t * 9, enemy.y + dy / length * t * 9 + 5 * Math.sin(t * Math.PI),
                        width * scale, height * scale, (dx >= 0 ? -1 : 1) * t * 38, t < .4 ? hurt : offlineCore);
                }
            }
            for (const enemy of battle.enemies) {
                if (prototypeModels) {
                    const size = unitSize[enemy.kind];
                    this.drawModelShadow(enemy.x, enemy.y, size / 2, size * 0.24);
                    continue;
                }
                const chapterBoss = enemy === battle.boss?.unit ? battle.chapterBoss : null;
                if (this.drawDirectionalEnemy(battle, enemy, chapterBoss, mission)) continue;
                const bossLocked = enemy === battle.boss?.unit && battle.boss.phase !== 'patrol';
                const locked = enemy.state !== 'walk' || bossLocked;
                const dx = enemy.kind === 'armored' ? enemy.facingX! : locked ? enemy.vx : player.x - enemy.x;
                const dy = enemy.kind === 'armored' ? enemy.facingY! : locked ? enemy.vy : player.y - enemy.y;
                const flip = dx < 0;
                const directional = enemy.kind === 'armored' || enemy.kind === 'turret' || enemy.kind === 'charger';
                const angle = directional ? Math.atan2(dy, Math.abs(dx)) * (flip ? -1 : 1) * 180 / Math.PI : 0;
                const machine = 'machine-' + (chapterBoss?.kind ?? enemy.kind);
                if (this.has(machine)) {
                    this.drawMachine(machine, battle, enemy, chapterBoss);
                    continue;
                }
                const pose = enemy.kind + enemyPose(battle, enemy, chapterBoss);
                const frame = this.has(pose) ? pose : enemy.kind;
                const hint = chapterBoss?.vulnerable || locked && enemy.state === 'warn' && tick % 8 < 4 ? amber : Color.WHITE;
                this.icon(this.world, frame, enemy.x, enemy.y, unitSize[enemy.kind], angle, hint, flip);
            }
            if (prototypeModels) this.drawModelShadow(player.x, player.y, 9, 5);
            else this.drawMechanic(battle, floatingTick);
            if (!prototypeModels && !this.campaign) {
                for (const bullet of battle.bullets) this.icon(this.world, 'bullet', bullet.x, bullet.y, 11, 0, amber);
            }
            for (const enemy of battle.enemies) {
                if (!enemy.marked) continue;
                const size = 12 + Math.cos(tick * 0.28);
                const y = enemy.y + unitSize[enemy.kind] / 2 + 4;
                if (!this.icon(this.world, 'pixel-item:conductiveMark', enemy.x, y, size + 3)) {
                    this.icon(this.world, 'conductiveMark', enemy.x, y, size);
                }
            }
        }
        this.world.finish();
    }

    drawEncounter(g: Graphics, battle: Readonly<Battle> | null, stage: string, modelProps: boolean, threat?: Graphics): void {
        const props = this.encounterProps ??= new SpritePool(g.node);
        props.begin();
        if (battle) drawCampaignEncounter(g, battle, stage, modelProps, (key, x, y, size) =>
            !modelProps && this.icon(props, 'pixel-item:prop/' + key, x, y, size), threat);
        props.finish();
    }

    private drawModelShadow(x: number, y: number, horizontal: number, vertical: number): void {
        const ground = this.machineGround;
        ground.fillColor = shadowFeather;
        ground.ellipse(x + 1, y - 1, horizontal + 4, vertical + 2);
        ground.fill();
        ground.ellipse(x + 0.5, y - 0.5, horizontal + 2, vertical + 1);
        ground.fill();
        ground.fillColor = shadowContact;
        ground.ellipse(x, y, horizontal, vertical);
        ground.fill();
    }

    beginUi(): void {
        this.ticketArena = undefined;
        this.dispatchVisible = false;
        this.toolRevealVisible = false;
        this.ui.begin();
    }
    endUi(): void {
        this.ui.finish();
        if (!this.dispatchVisible && this.modelDispatch) {
            this.dispatchCrop?.frame.destroy();
            this.dispatchCrop = undefined;
            this.modelDispatch.destroy();
            this.modelDispatch = undefined;
        }
        if (!this.toolRevealVisible && this.toolReveal) {
            this.toolReveal.destroy();
            this.toolReveal = undefined;
        }
    }

    drawToolReward(tool: ToolId, x: number, y: number, size: number, progress: number): void {
        if (this.modelArt) {
            this.toolRevealVisible = true;
            this.modelIcons ??= new PrototypeItemIcons(this.uiRoot.scene!, this.invalidate);
            if (this.toolReveal?.tool !== tool) {
                this.toolReveal?.destroy();
                this.toolReveal = this.modelIcons.createReveal(tool);
            }
            const frame = this.toolReveal.show(progress);
            if (frame) {
                this.ui.put(frame, x, y, size, size, 0, Color.WHITE);
                return;
            }
        }
        this.uiIcon(tool, x, y, size);
    }

    uiIconFrame(key: string, fallback?: string): SpriteFrame | undefined {
        if (this.modelArt && PrototypeItemIcons.supports(key)) {
            this.modelIcons ??= new PrototypeItemIcons(this.uiRoot.scene!, this.invalidate);
            const frame = this.modelIcons.frame(key);
            if (frame) return frame;
        }
        const divider = key.indexOf('/');
        const attachment = divider < 0 ? undefined : this.frames.get('pixel-item:part/' + key.slice(divider + 1));
        return this.frames.get('pixel-tool:' + key) ?? this.frames.get('pixel-item:' + key) ?? attachment ?? this.frames.get(key)
            ?? (fallback && fallback !== key ? this.uiIconFrame(fallback) : undefined);
    }

    uiIcon(key: string, x: number, y: number, size: number, fallback?: string): boolean {
        const frame = this.uiIconFrame(key, fallback);
        if (!frame) return false;
        const { width, height } = frame.rect;
        const scale = size / Math.max(width, height);
        this.ui.put(frame, x, y, width * scale, height * scale, 0, Color.WHITE);
        return true;
    }
    shopfront(x: number, y: number): void {
        const frame = this.frames.get('shutter');
        if (frame) this.ui.put(frame, x, y, 330, 110, 0, new Color(115, 144, 155));
    }
    panel(x: number, y: number, w: number, h: number, active: boolean, accent: boolean, pressed: boolean, primary: boolean): boolean {
        const frame = this.frames.get('panel');
        if (!frame) return false;
        const color = !active ? disabledColor : primary ? (pressed ? brassDown : brass)
            : pressed ? pressedColor : accent ? selectedColor : buttonColor;
        this.ui.put(frame, x, y, w, h, 0, color, true);
        return true;
    }

    dispose(): void {
        this.disposed = true;
        this.toolReveal?.destroy();
        this.modelIcons?.destroy();
        this.arenas.forEach((_value, key) => this.releaseArena(key));
        this.dispatchCrop?.frame.destroy();
        this.dispatchCrop = undefined;
        this.modelDispatch?.destroy();
        this.pixelFloors.forEach((_surface, arena) => this.releasePixelFloor(arena));
        this.frames.forEach(frame => frame.destroy());
        this.frames.clear();
    }
}
