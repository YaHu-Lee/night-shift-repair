import { Color, JsonAsset, Node, Rect, resources, Sprite, SpriteFrame, Texture2D, UITransform } from 'cc';
import type { Battle } from '../m1/Battle';
import type { EnemyId } from '../m1/content';
import { FIELD } from '../m1/content';

// All coordinates passed to the view use the existing 360 × 640 game space.
// The skin folder supplies semantic frame names; snapshots contain only gameplay IDs.
const unitSize: Record<EnemyId, number> = { crawler: 23, charger: 30, turret: 28, armored: 31, inspector: 57 };
const amber = new Color(255, 186, 92);
const hurt = new Color(255, 157, 140);
const buttonColor = new Color(60, 78, 87);
const selectedColor = new Color(66, 131, 129);
const disabledColor = new Color(46, 56, 64);
const pressedColor = new Color(50, 90, 90);
const brass = new Color(255, 200, 114);
const brassDown = new Color(224, 161, 87);
type Enemy = Battle['enemies'][number];

function enemyPose(battle: Readonly<Battle>, enemy: Enemy): number {
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
            this.items[i].sprite.node.active = false;
        }
    }
}

export class BattleSkinView {
    private readonly frames = new Map<string, SpriteFrame>();
    private readonly world: SpritePool;
    private readonly ui: SpritePool;
    private readonly floor: SpritePool;
    private disposed = false;
    private lastBattle: Readonly<Battle> | null = null;
    private lastTick = -1;
    private previousX = 0;
    private previousY = 0;
    private stride = 0;
    private walking = false;
    private facing: 'walk' | 'side' | 'back' = 'walk';
    private facingLeft = false;

    constructor(root: string, floor: Node, actors: Node, ui: Node, invalidate: () => void) {
        this.floor = new SpritePool(floor);
        this.world = new SpritePool(actors);
        this.ui = new SpritePool(ui);
        resources.load(root + '/yard/texture', Texture2D, (error, texture) => {
            if (error || this.disposed) return;
            const frame = new SpriteFrame();
            frame.texture = texture;
            this.frames.set('yard', frame);
            const shutter = new SpriteFrame();
            shutter.reset({ texture, rect: new Rect(0, 0, texture.width, Math.round(texture.width / 3)) });
            shutter.packable = false;
            this.frames.set('shutter', shutter);
            this.floor.put(frame, (FIELD.left + FIELD.right) / 2, (FIELD.top + FIELD.bottom) / 2,
                FIELD.right - FIELD.left, FIELD.top - FIELD.bottom, 0, Color.WHITE);
            invalidate();
        });
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

    private icon(pool: SpritePool, key: string, x: number, y: number, size: number,
        angle = 0, color = Color.WHITE, flip = false): void {
        const frame = this.frames.get(key);
        if (!frame) return;
        const rect = frame.rect;
        const scale = size / Math.max(rect.width, rect.height);
        pool.put(frame, x, y, rect.width * scale, rect.height * scale, angle, color, false, flip);
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

    drawWorld(battle: Readonly<Battle> | null): void {
        this.world.begin();
        if (battle) {
            const { player, tick } = battle;
            for (const part of battle.parts) this.icon(this.world, 'scrap', part.x, part.y, 9);
            for (const enemy of battle.enemies) {
                const bossLocked = enemy === battle.boss?.unit && battle.boss.phase !== 'patrol';
                const locked = enemy.state !== 'walk' || bossLocked;
                const dx = enemy.kind === 'armored' ? enemy.facingX! : locked ? enemy.vx : player.x - enemy.x;
                const dy = enemy.kind === 'armored' ? enemy.facingY! : locked ? enemy.vy : player.y - enemy.y;
                const flip = dx < 0;
                const directional = enemy.kind === 'armored' || enemy.kind === 'turret' || enemy.kind === 'charger';
                const angle = directional ? Math.atan2(dy, Math.abs(dx)) * (flip ? -1 : 1) * 180 / Math.PI : 0;
                const pose = enemy.kind + enemyPose(battle, enemy);
                this.icon(this.world, this.has(pose) ? pose : enemy.kind, enemy.x, enemy.y, unitSize[enemy.kind], angle,
                    locked && enemy.state === 'warn' && tick % 8 < 4 ? amber : Color.WHITE, flip);
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

    beginUi(): void { this.ui.begin(); }
    endUi(): void { this.ui.finish(); }
    uiIcon(key: string, x: number, y: number, size: number): void { this.icon(this.ui, key, x, y, size); }
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
        for (const frame of this.frames.values()) frame.destroy();
        this.frames.clear();
    }
}
