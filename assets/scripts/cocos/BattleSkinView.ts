import { Color, Graphics, JsonAsset, Node, Rect, resources, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import type { Battle } from '../m1/Battle';
import type { ChapterBossView } from '../m1/Encounter';
import type { EnemyId } from '../m1/content';
import { FIELD } from '../m1/content';
import { CAMPAIGN_MACHINE_ART, CAMPAIGN_TOOL_ART } from '../campaign/CampaignArt';
import { loadCampaignTexture } from './CampaignAssetLoader';

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
const wake = new Color(255, 216, 151);
const grapple = new Color(255, 177, 116);
const interference = new Color(211, 166, 255);
const exposed = new Color(143, 244, 230);
const shadowMachine = new Color(167, 183, 200, 58);
const offlineCore = new Color(108, 123, 134, 223);
const recovering = new Color(169, 187, 197);
type Enemy = Battle['enemies'][number];

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

    put(frame: SpriteFrame, x: number, y: number, w: number, h: number, angle: number, color: Color, sliced = false, flip = false): void {
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
        sprite.node.setPosition(x, y, 0);
        sprite.node.angle = angle;
        sprite.node.setScale(flip ? -1 : 1, 1, 1);
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
    private stageId = '';
    private arena = 'yard';
    private ticketArena?: string;
    private readonly arenas = new Map<string, { floor: SpriteFrame; ticket: SpriteFrame; texture: Texture2D }>();
    private dispatchCrop?: { source: SpriteFrame; height: number; frame: SpriteFrame };
    private readonly pendingArenas = new Set<string>();
    private prepared = false;
    private disposed = false;
    private lastBattle: Readonly<Battle> | null = null;
    private lastTick = -1;
    private previousX = 0;
    private previousY = 0;
    private stride = 0;
    private walking = false;
    private facing: 'walk' | 'side' | 'back' = 'walk';
    private facingLeft = false;

    constructor(private readonly root: string, floor: Node, actors: Node, ui: Node,
        private readonly invalidate: () => void, private readonly campaign = false) {
        this.floor = new SpritePool(floor);
        const signals = new Node('MachineShadows');
        signals.layer = actors.layer;
        actors.addChild(signals);
        this.machineGround = signals.addComponent(Graphics);
        this.world = new SpritePool(actors);
        this.ui = new SpritePool(ui);
        if (!campaign) this.prepare();
    }

    prepare(): void {
        if (this.prepared) return;
        this.prepared = true;
        this.setStage(this.stageId, this.arena);
        const { root, invalidate } = this;
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
            for (const key of ['dispatch-01', 'dispatch-02', 'pump-floor']) {
                resources.load(root + '/' + key + '/texture', Texture2D, (error, texture) => {
                    if (error || this.disposed) return;
                    const frame = new SpriteFrame();
                    frame.texture = texture;
                    this.frames.set(key, frame);
                    if (key === 'pump-floor') this.setStage(this.stageId, this.arena);
                    invalidate();
                });
            }
            this.loadAtlas('campaign-machines', CAMPAIGN_MACHINE_ART.map(key => 'machine-' + key), 4);
            this.loadAtlas('campaign-tools', CAMPAIGN_TOOL_ART, 3);
            this.loadAtlas('radio-portraits', ['radio-aruan', 'radio-chenqi'], 2);
        }
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
                invalidate();
            });
        });
    }

    has(key: string): boolean { return this.frames.has(key); }

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
        this.loadArena(arena);
        const frame = this.arenas.get(arena)?.floor ?? this.frames.get(arena) ?? this.frames.get('yard');
        this.floor.begin();
        if (frame) this.floor.put(frame, (FIELD.left + FIELD.right) / 2, (FIELD.top + FIELD.bottom) / 2,
            FIELD.right - FIELD.left, FIELD.top - FIELD.bottom, 0, Color.WHITE);
        this.floor.finish();
    }

    private loadArena(arena: string): void {
        if (!this.prepared || (!/^stage-\d\d$/.test(arena) && arena !== 'city-restored')
            || this.arenas.has(arena) || this.pendingArenas.has(arena)) return;
        this.pendingArenas.add(arena);
        loadCampaignTexture(this.root, arena, texture => {
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
        });
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
        const asset = id === 'ending' ? 'city-restored' : arena;
        this.ticketArena = asset;
        this.loadArena(asset);
        const picture = this.arenas.get(asset);
        const source = this.frames.get('dispatch-' + id) ?? (id === 'ending' ? picture?.floor : picture?.ticket);
        if (!source) {
            if (height >= 110) this.shopfront(x, y);
            return;
        }
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

    private drawMechanic(battle: Readonly<Battle>): void {
        const { player, tick } = battle;
        if (this.lastBattle !== battle) {
            this.facing = 'walk';
            this.facingLeft = false;
            this.walking = false;
            this.stride = 0;
        } else if (tick !== this.lastTick) {
            const dx = player.x - this.previousX;
            const dy = player.y - this.previousY;
            const distance = Math.hypot(dx, dy);
            this.walking = distance > 0.02;
            if (this.walking) {
                this.stride = (this.stride + distance) % 48;
                const bias = this.facing === 'side' ? 0.85 : 1.15;
                this.facing = Math.abs(dx) >= Math.abs(dy) * bias ? 'side' : dy > 0 ? 'back' : 'walk';
                this.facingLeft = this.facing === 'side' && dx < 0;
            } else this.stride = 0;
        }
        this.lastBattle = battle;
        this.lastTick = tick;
        this.previousX = player.x;
        this.previousY = player.y;
        const index = this.walking ? Math.floor(this.stride / 12) : 1;
        const pose = this.facing === 'walk' && !this.walking ? 'mechanic' : this.facing + index;
        this.icon(this.world, this.has(pose) ? pose : 'mechanic', player.x, player.y, 34, 0,
            tick < player.invulnerableUntil && tick % 6 < 3 ? hurt : Color.WHITE, this.facingLeft);
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

    drawWorld(battle: Readonly<Battle> | null): void {
        this.world.begin();
        this.machineGround.clear();
        if (battle) {
            const { player, tick } = battle;
            const core = battle.boss?.unit;
            if (core && core.hp <= 0 && battle.chapterBoss?.kind === 'core') {
                // The housing drops below the released scrap, which remains at its pickup point.
                this.icon(this.world, 'machine-core', core.x, core.y - 14, unitSize.inspector * 0.83, 0, offlineCore);
            }
            for (const part of battle.parts) this.icon(this.world, 'scrap', part.x, part.y, 9);
            for (const enemy of battle.enemies) {
                const bossLocked = enemy === battle.boss?.unit && battle.boss.phase !== 'patrol';
                const locked = enemy.state !== 'walk' || bossLocked;
                const dx = enemy.kind === 'armored' ? enemy.facingX! : locked ? enemy.vx : player.x - enemy.x;
                const dy = enemy.kind === 'armored' ? enemy.facingY! : locked ? enemy.vy : player.y - enemy.y;
                const flip = dx < 0;
                const directional = enemy.kind === 'armored' || enemy.kind === 'turret' || enemy.kind === 'charger';
                const angle = directional ? Math.atan2(dy, Math.abs(dx)) * (flip ? -1 : 1) * 180 / Math.PI : 0;
                const chapterBoss = enemy === battle.boss?.unit ? battle.chapterBoss : null;
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
            this.drawMechanic(battle);
            for (const bullet of battle.bullets) this.icon(this.world, 'bullet', bullet.x, bullet.y, 11, 0, amber);
            for (const enemy of battle.enemies) {
                if (!enemy.marked) continue;
                const size = 12 + Math.cos(tick * 0.28);
                this.icon(this.world, 'conductiveMark', enemy.x, enemy.y + unitSize[enemy.kind] / 2 + 4, size);
            }
        }
        this.world.finish();
    }

    beginUi(): void { this.ticketArena = undefined; this.ui.begin(); }
    endUi(): void { this.ui.finish(); }
    uiIcon(key: string, x: number, y: number, size: number): boolean { return this.icon(this.ui, key, x, y, size); }
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
        this.arenas.forEach((_value, key) => this.releaseArena(key));
        this.dispatchCrop?.frame.destroy();
        this.dispatchCrop = undefined;
        this.frames.forEach(frame => frame.destroy());
        this.frames.clear();
    }
}
