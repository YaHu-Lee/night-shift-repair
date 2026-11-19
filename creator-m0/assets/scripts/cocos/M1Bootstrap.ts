import {
    _decorator, AudioClip, AudioSource, Color, Component, EventTouch, Game, game, Graphics, Label, Mask, Node,
    UITransform, Vec2, Vec3, profiler, resources, screen, view,
} from 'cc';
import { DEBUG } from 'cc/env';
import { Run } from '../m1/Run';
import { ENEMIES, FIELD, M2_RULES, MODS, REFRESH_COST, STARTER, TICK_RATE, TOOLS, hasPair, isTool, offer } from '../m1/content';
import type { EquippedTool, ModId, OfferId } from '../m1/content';
import { BOSS_CHARGE_SPEED, BOSS_CHARGE_TICKS, BOSS_SWEEP_REACH } from '../m1/Battle';
import { drawSkillEffects } from './SkillEffectsView';
import { BattleSkinView } from './BattleSkinView';

const { ccclass, property, requireComponent } = _decorator;
const WIDTH = 360;
const HEIGHT = 640;
const JOYSTICK = 38;
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
const ENEMY_COLOR = { crawler: RED, charger: AMBER, turret: PURPLE, armored: ARMOR, inspector: BOSS };
const HIT_LABEL = {
    crawler: '慢爬虫接触', charger: '冲车撞击', turret: '炮台接触', armored: '护甲机接触',
    inspector: '巡检机', projectile: '炮台弹体', 'boss-sweep': '巡检机扫线', 'boss-charge': '巡检机冲撞',
};
const BOSS_LABEL = { sweep: '扫线', charge: '冲撞', summon: '召援' };
const PAIR_LABEL = { arc: '电弧连锁', magnet: '拾取震击', heat: '过热增伤' };
const SOUND_PATHS = { warning: 'm2/warning', charge: 'm2/charge', hit: 'm2/hit', clear: 'm2/clear' };
function visibleReach(x: number, y: number, dx: number, dy: number, reach: number): number {
    const edgeX = dx > 0 ? FIELD.right : FIELD.left;
    const edgeY = dy > 0 ? FIELD.top : FIELD.bottom;
    return Math.max(0, Math.min(reach, dx ? (edgeX - x) / dx : Infinity, dy ? (edgeY - y) / dy : Infinity));
}
type Sound = keyof typeof SOUND_PATHS;
const qaHost = globalThis as typeof globalThis & { __nightShiftM1State?: () => object; __nightShiftM2State?: () => object };

interface HitArea {
    left: number;
    right: number;
    bottom: number;
    top: number;
    action: () => void;
}
interface TextOptions { size?: number; color?: Color; width?: number; height?: number; left?: boolean }

@ccclass('M1Bootstrap')
@requireComponent(UITransform)
export class M1Bootstrap extends Component {
    @property
    fullRun = false;

    @property
    skinRoot = 'skins/workshop';

    private run!: Run;
    private skin?: BattleSkinView;
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
    private readonly axes = new Vec2();
    private readonly origin = new Vec2();
    private owner: number | null = null;
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
    private footer = 34;
    private layout = '';
    private source: AudioSource | null = null;
    private readonly clips: Partial<Record<Sound, AudioClip>> = {};
    private soundEnabled = true;

    onLoad(): void {
        this.surface = this.node.getComponent(UITransform)!;
        this.surface.setContentSize(WIDTH, HEIGHT);
        this.base = this.node.addComponent(Graphics);
        this.drawBackground();
        const floor = this.layer('Ground');
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
        this.ui = this.layer('Overlay').addComponent(Graphics);
        const uiSprites = this.layer('InterfaceArt');
        this.labelLayer = this.layer('Labels');
        if (this.fullRun && this.skinRoot) {
            this.skin = new BattleSkinView(this.skinRoot, floor, actors, uiSprites, () => { this.visibleUi = ''; });
        }
        this.run = new Run(undefined, this.fullRun ? M2_RULES : undefined);
        if (this.fullRun) {
            this.source = this.node.addComponent(AudioSource);
            for (const sound of Object.keys(SOUND_PATHS) as Sound[]) {
                resources.load(SOUND_PATHS[sound], AudioClip, (error, clip) => {
                    if (!error && this.isValid) this.clips[sound] = clip;
                });
            }
        }
        this.chooseRoute = !this.run.data;
        if (DEBUG) {
            profiler?.hideStats();
            qaHost[this.fullRun ? '__nightShiftM2State' : '__nightShiftM1State'] = this.inspect;
            this.trace('ready');
        }
        this.draw();
    }

    onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        game.on(Game.EVENT_HIDE, this.suspend, this);
        game.on(Game.EVENT_SHOW, this.suspend, this);
    }

    onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.touchCancel, this);
        game.off(Game.EVENT_HIDE, this.suspend, this);
        game.off(Game.EVENT_SHOW, this.suspend, this);
        this.suspend();
    }

    onDestroy(): void {
        this.skin?.dispose();
        if (qaHost.__nightShiftM1State === this.inspect) delete qaHost.__nightShiftM1State;
        if (qaHost.__nightShiftM2State === this.inspect) delete qaHost.__nightShiftM2State;
        this.run.dispose();
    }

    update(dt: number): void {
        if (this.run.paused || this.run.background) this.releaseStick();
        const before = this.run.data;
        const battle = this.run.battle;
        const warnings = battle?.warningSerial;
        const damage = battle?.damageTaken;
        const triggers = this.fullRun ? battle && { ...battle.triggers } : null;
        this.run.advance(dt, this.axes.x, this.axes.y);
        if (this.fullRun && battle) {
            if (battle.warningSerial !== warnings) this.play(battle.warningKind);
            if (battle.damageTaken !== damage) this.play('hit');
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
        }
        this.draw();
    }

    private suspend(): void {
        this.clearInput();
        this.run?.pause();
    }

    private play(sound: Sound): void {
        const clip = this.clips[sound];
        if (this.soundEnabled && clip && !this.run.background) this.source?.playOneShot(clip, 0.45);
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
        if (data.phase !== 'lost') this.play('clear');
    }

    private clearInput(): void {
        if (this.press) this.visibleUi = '';
        this.releaseStick();
        this.press = null;
    }

    private releaseStick(): void {
        this.owner = null;
        this.axes.set(0, 0);
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
        const area = this.actions.find((candidate) => this.contains(candidate, point.x, point.y));
        if (area && !this.press) {
            this.press = { id: event.getID(), area, inside: true };
            this.visibleUi = '';
            return;
        }
        if (this.chooseRoute || this.run.paused || !this.run.battle || this.owner !== null
            || point.y < this.footer || point.y > FIELD.bottom - 5) return;
        this.owner = event.getID();
        this.origin.set(point.x, point.y);
    }

    private touchMove(event: EventTouch): void {
        if (this.press?.id === event.getID()) {
            const point = this.point(event);
            const inside = this.contains(this.press.area, point.x, point.y);
            if (inside !== this.press.inside) this.visibleUi = '';
            this.press.inside = inside;
            return;
        }
        if (event.getID() !== this.owner || this.run.paused) return;
        const point = this.point(event);
        const dx = point.x - this.origin.x;
        const dy = point.y - this.origin.y;
        const magnitude = Math.max(JOYSTICK, Math.hypot(dx, dy));
        this.axes.set(dx / magnitude, dy / magnitude);
        if (Math.hypot(dx, dy) > 5) this.learnedMove = true;
    }

    private touchEnd(event: EventTouch): void {
        if (event.getID() === this.owner) this.releaseStick();
        if (this.press?.id !== event.getID()) return;
        const area = this.press.area;
        this.press = null;
        this.visibleUi = '';
        const point = this.point(event);
        if (!this.run.background && this.contains(area, point.x, point.y)) area.action();
    }

    private touchCancel(event: EventTouch): void {
        if (event.getID() === this.owner) this.releaseStick();
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
            this.labels.push(label);
        }
        label.node.active = true;
        label.node.setPosition(x, y, 0);
        const size = options.size ?? 14;
        label.fontSize = size;
        label.lineHeight = size + 5;
        label.color = options.color ?? PAPER;
        label.horizontalAlign = options.left ? Label.HorizontalAlign.LEFT : Label.HorizontalAlign.CENTER;
        label.overflow = options.width ? Label.Overflow.SHRINK : Label.Overflow.NONE;
        if (options.width) label.node.getComponent(UITransform)!.setContentSize(options.width, options.height ?? 29);
        label.string = value;
    }

    private control(x: number, y: number, width: number, height: number,
        action: () => void, active = true, accent = false, primary = false, flat = false): void {
        const left = x - width / 2;
        const bottom = y - height / 2;
        const held = !!this.press?.inside && this.press.area.left === left && this.press.area.bottom === bottom;
        if (flat || !this.skin?.panel(x, y, width, height, active, accent, held, primary)) {
            this.ui.fillColor = active && primary ? AMBER : held ? GRID : accent && active ? SELECTED : PANEL;
            this.ui.roundRect(left, bottom, width, height, 7);
            this.ui.fill();
        }
        if (active) this.actions.push({ left, right: left + width, bottom, top: bottom + height, action });
    }

    private button(value: string, x: number, y: number, width: number, height: number,
        action: () => void, active = true, accent = false, primary = false): void {
        this.control(x, y, width, height, action, active, accent, primary);
        this.text(value, x, y, { color: !active ? DIM : primary ? INK : PAPER, width: width - 12, height: height - 4 });
    }

    private draw(): void {
        const battle = this.run.battle;
        const data = this.run.data;
        this.drawField();
        const frame = screen.windowSize;
        const scale = Math.max(1e-6, view.getScaleY());
        const layout = `${frame.width}:${frame.height}:${scale}`;
        if (layout !== this.layout) {
            this.layout = layout;
            const insets = this.run.platform.getSafeInsets();
            const letterbox = Math.max(0, (frame.height / scale - HEIGHT) / 2);
            const pixelRatio = screen.devicePixelRatio;
            this.top = Math.floor(Math.min(this.fullRun ? 589 : 607,
                HEIGHT - Math.max(0, insets.top * pixelRatio / scale - letterbox) - 27));
            this.footer = Math.ceil(Math.max(34, insets.bottom * pixelRatio / scale - letterbox + 16));
        }
        const seconds = battle ? Math.ceil((battle.duration - battle.tick) / TICK_RATE) : 0;
        const signature = JSON.stringify([
            data?.runId, data?.revision, battle?.player.hp, seconds, battle?.collected, battle?.magnetCharge,
            battle?.triggers.arc, battle?.triggers.magnet, battle?.triggers.heat, this.run.paused,
            this.run.waitingForSave, this.run.storageFailed, this.selection, this.slot, this.replacement, this.chooseRoute,
            this.top, this.footer, battle?.boss?.unit.hp, battle?.boss?.phase, battle?.boss?.attack,
            battle?.shielded, this.soundEnabled, this.learnedMove, this.receipt,
        ]);
        if (signature === this.visibleUi) return;
        this.visibleUi = signature;
        this.actions.length = 0;
        this.labelIndex = 0;
        this.ui.clear();
        this.skin?.beginUi();
        if (this.chooseRoute || !data) this.drawRoutes();
        else if (this.run.waitingForSave) this.drawStorageError();
        else if (data.phase === 'shop') this.drawShop();
        else if (data.phase === 'won' || data.phase === 'lost') this.drawResult(data.phase === 'won');
        else this.drawBattleHud(seconds);
        if (this.run.storageFailed && !this.run.waitingForSave) {
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
        this.skin?.drawWorld(battle);
        drawSkillEffects(this.skillEffects, battle?.effects ?? []);
        if (!battle) return;
        const boss = battle.boss;
        if (boss && boss.unit.hp > 0 && (boss.phase === 'warning' || boss.phase === 'sweep' || boss.phase === 'charge')) {
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
            const length = visibleReach(enemy.x, enemy.y, enemy.vx, enemy.vy, reach);
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
            if (!this.skin?.has(enemy.kind)) {
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
        if (this.owner !== null) {
            art.strokeColor = MINT;
            art.lineWidth = 1.5;
            art.circle(this.origin.x - 180, this.origin.y - 320, JOYSTICK);
            art.stroke();
            art.fillColor = MINT;
            art.circle(this.origin.x - 180 + this.axes.x * JOYSTICK, this.origin.y - 320 + this.axes.y * JOYSTICK, 12);
            art.fill();
        }
    }

    private cover(): void {
        this.skin?.beginUi();
        this.ui.fillColor = MASK;
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

    private drawBattleHud(seconds: number): void {
        const battle = this.run.battle!;
        const data = this.run.data!;
        this.text(`体力 ${battle.player.hp}/${this.run.rules.maxHp}${battle.shielded ? ' 盾' : ''}`, 60, this.top + 7, { size: 14 });
        for (let i = 0; i < this.run.rules.maxHp; i++) {
            this.ui.fillColor = i >= battle.player.hp ? PANEL : battle.player.hp <= 2 ? RED : MINT;
            this.ui.rect(18 + i * 8, this.top - 10, 6, 4);
            this.ui.fill();
        }
        this.text(`第 ${battle.wave + 1} 波`, 153, this.top, { size: 16 });
        this.text(`${Math.floor(seconds / 60)}:${('0' + seconds % 60).slice(-2)}`, 220, this.top,
            { size: 19, color: seconds <= 10 ? RED : AMBER });
        if (!this.run.paused) this.button('暂停', 306, this.top, 69, 44, () => {
            this.suspend();
            this.trace('pause');
        });
        const perks = [
            hasPair(data.tools, 'arc') ? `连锁 ${battle.triggers.arc}` : '',
            hasPair(data.tools, 'magnet') ? `脉冲 ${battle.magnetCharge}/5` : '',
            hasPair(data.tools, 'heat') ? `过热 ${battle.triggers.heat}` : '',
        ].filter(Boolean);
        this.text([`零件 ${data.parts + battle.collected}`, ...perks].join('   ·   '), 180, 130, { color: MINT, size: 13 });
        if (!this.learnedMove && !battle.boss) {
            this.text('在这里拖动走位，工具会自动攻击', 180, Math.max(this.footer + 22, 78), { color: DIM });
        }
        if (battle.boss && !this.run.paused) {
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
        this.text('已暂停', 180, 405, { size: 27 });
        this.text(`第 ${battle.wave + 1} 波还剩 ${seconds} 秒`, 180, 370, { color: DIM });
        this.button('继续战斗', 180, 318, 218, 48, () => {
            this.run.resume();
            this.trace('resume');
        }, true, true, true);
        this.button('重新选择起手改装', 180, 246, 218, 45, () => { this.chooseRoute = true; });
        if (this.fullRun) this.button(this.soundEnabled ? '音效 · 开' : '音效 · 关', 180, 182, 130, 42,
            () => { this.soundEnabled = !this.soundEnabled; if (this.soundEnabled) this.play('warning'); });
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
        this.skin?.uiIcon(tool.id, 37, y, 35);
        this.text(TOOLS[tool.id].name, 81, y, { size: 15, width: 45, height: 43 });
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
        this.cover();
        this.text('局间整备', 94, this.top - 5, { size: 25, width: 152, left: true });
        this.skin?.uiIcon('scrap', 251, this.top - 5, 18);
        this.text(`${data.parts} 零件`, 299, this.top - 5, { size: 17, color: MINT });
        const report = data.reports?.find(entry => entry.wave === data.wave);
        const earnings = report ? `　拾取 +${report.collected}　回收 +${report.salvaged}` : '';
        const credit = report?.shopCredit ? `　补给 +${report.shopCredit}` : '';
        this.text(`第 ${data.wave + 1} 波完成${earnings}${credit}`, 180, this.top - 39,
            { size: 13, width: 324, left: true, color: DIM });

        shop.offers.forEach((id, index) => {
            const item = offer(id);
            const y = this.top - 88 - index * 67;
            const chosen = id === selected;
            this.control(180, y, 328, 62, () => this.selectOffer(id), true, false, false, true);
            if (chosen) {
                this.ui.lineWidth = 2;
                this.ui.strokeColor = AMBER;
                this.ui.roundRect(17, y - 30, 326, 60, 6);
                this.ui.stroke();
            }
            this.skin?.uiIcon(id, 48, y, 50);
            this.text(item.name, 161, y + 13, { size: 18, width: 157, left: true });
            this.text(`${item.price} 零件`, 304, y + 13, { size: 14, color: data.parts < item.price ? DIM : AMBER });
            this.text(item.detail, 209, y - 12, { size: 14, height: 30, width: 253, left: true });
        });
        if (!shop.offers.length) this.text('本轮货架已空', 180, this.top - 84, { color: DIM });
        const rack = this.top - 140 - (Math.max(1, shop.offers.length) - 1) * 67;
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
        data.tools.forEach((tool, index) => this.drawWeaponRow(tool, index, rack - 39 - index * 55, part));

        const infoY = rack - data.tools.length * 55 - 35;
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
            if (this.run.retry()) this.traceOutcome();
        }, true, true);
        this.button('重新选择起手改装', 180, 208, 213, 46, () => { this.chooseRoute = true; });
    }

    private readonly inspect = () => {
        const { data, battle, paused } = this.run;
        return {
            phase: this.chooseRoute ? 'route' : data?.phase,
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
        };
    };

    private trace(event: string, detail?: object): void {
        if (DEBUG) console.log(`[${this.run.rules.stage}] ` + JSON.stringify({ event, ...detail, ...this.inspect() }));
    }
}
