import { _decorator, Color, Component, EventTouch, Game, game, Graphics, Label, Node, UITransform, Vec2, Vec3 } from 'cc';
import { ARENA_HEIGHT, ARENA_WIDTH } from '../core/StressWorld';
import { Session } from '../m0/Session';

const { ccclass, requireComponent } = _decorator;
const HALF_W = ARENA_WIDTH / 2;
const HALF_H = ARENA_HEIGHT / 2;
const JOYSTICK_RADIUS = 42;
const BUTTON_CENTER_Y = -230;
const BUTTON_WIDTH = 74;
const BUTTON_HEIGHT = 38;
const BUTTON_CENTERS = [-126, -42, 42, 126] as const;
const BACKGROUND = new Color(16, 25, 38);
const GRID = new Color(31, 45, 62);
const ENEMY = new Color(247, 116, 104);
const PROJECTILE = new Color(255, 214, 124);
const PICKUP = new Color(95, 222, 184);
const PLAYER = new Color(80, 190, 247);
const PLAYER_EDGE = new Color(224, 249, 255);
const PANEL = new Color(35, 56, 76, 245);
const JOYSTICK = new Color(80, 190, 247, 100);

/** Add to one centered 360 × 640 UI node under a Cocos 2D Canvas. */
@ccclass('M0Bootstrap')
@requireComponent(UITransform)
export class M0Bootstrap extends Component {
    private session: Session | null = null;
    private surface: UITransform | null = null;
    private painter: Graphics | null = null;
    private status: Label | null = null;
    private pauseLabel: Label | null = null;
    private readonly screenPoint = new Vec2();
    private readonly worldPoint = new Vec3();
    private readonly localPoint = new Vec3();
    private owner: number | null = null;
    private originX = 0;
    private originY = 0;
    private lastStatus = '';
    private lastPauseLabel = '';

    onLoad(): void {
        this.surface = this.node.getComponent(UITransform)!;
        this.surface.setContentSize(ARENA_WIDTH, ARENA_HEIGHT);
        this.surface.setAnchorPoint(0.5, 0.5);
        this.painter = this.node.getComponent(Graphics) ?? this.node.addComponent(Graphics);
        this.makeLabel('Title', 'NIGHT SHIFT REPAIR | M0', 0, 256, 17);
        this.status = this.makeLabel('Status', '', 0, 230, 12);
        this.pauseLabel = this.makeLabel('Pause', 'PAUSE', BUTTON_CENTERS[0], BUTTON_CENTER_Y, 13);
        this.makeLabel('Save', 'SAVE', BUTTON_CENTERS[1], BUTTON_CENTER_Y, 13);
        this.makeLabel('Load', 'LOAD', BUTTON_CENTERS[2], BUTTON_CENTER_Y, 13);
        this.makeLabel('Reset', 'RESET', BUTTON_CENTERS[3], BUTTON_CENTER_Y, 13);
        this.makeLabel('Help', 'Drag arena to move | load restores seed, not tick', 0, -266, 11);
        this.session = new Session();
        this.draw();
    }

    onEnable(): void {
        this.node.on(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.on(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.on(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.on(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        game.on(Game.EVENT_HIDE, this.suspend, this);
        game.on(Game.EVENT_SHOW, this.suspend, this);
    }

    onDisable(): void {
        this.node.off(Node.EventType.TOUCH_START, this.touchStart, this);
        this.node.off(Node.EventType.TOUCH_MOVE, this.touchMove, this);
        this.node.off(Node.EventType.TOUCH_END, this.touchEnd, this);
        this.node.off(Node.EventType.TOUCH_CANCEL, this.touchEnd, this);
        game.off(Game.EVENT_HIDE, this.suspend, this);
        game.off(Game.EVENT_SHOW, this.suspend, this);
        this.suspend();
    }

    onDestroy(): void {
        this.session?.dispose();
        this.session = null;
    }

    update(dt: number): void {
        const session = this.session;
        if (!session) return;
        if (session.paused && this.owner !== null) this.release();
        session.advance(dt);
        this.draw();
    }

    private touchStart(event: EventTouch): void {
        const session = this.session;
        if (!session) return;
        const point = this.local(event);
        if (Math.abs(point.y - BUTTON_CENTER_Y) <= BUTTON_HEIGHT / 2) {
            const button = BUTTON_CENTERS.findIndex((x) => Math.abs(point.x - x) <= BUTTON_WIDTH / 2);
            if (button === 0) { if (session.paused) session.resume(); else this.suspend(); return; }
            if (button === 1) { session.save(); return; }
            if (button === 2) { this.release(); session.checkpointOk = session.load(); return; }
            if (button === 3) { this.release(); session.restart(); return; }
        }
        if (session.paused || this.owner !== null) return;
        this.owner = event.getID();
        this.originX = point.x;
        this.originY = point.y;
    }

    private touchMove(event: EventTouch): void {
        const session = this.session;
        if (!session || session.paused || event.getID() !== this.owner) return;
        const point = this.local(event);
        const dx = point.x - this.originX;
        const dy = point.y - this.originY;
        const scale = Math.max(JOYSTICK_RADIUS, Math.sqrt(dx * dx + dy * dy));
        session.x = dx / scale;
        session.y = dy / scale;
    }

    private touchEnd(event: EventTouch): void {
        if (event.getID() === this.owner) this.release();
    }

    private local(event: EventTouch): Vec3 {
        event.getUILocation(this.screenPoint);
        this.worldPoint.set(this.screenPoint.x, this.screenPoint.y, 0);
        return this.surface!.convertToNodeSpaceAR(this.worldPoint, this.localPoint);
    }

    private release(): void {
        this.owner = null;
        if (!this.session) return;
        this.session.x = 0;
        this.session.y = 0;
    }

    private suspend(): void {
        this.release();
        this.session?.pause();
    }

    private makeLabel(name: string, string: string, x: number, y: number, fontSize: number): Label {
        const child = new Node(name);
        child.layer = this.node.layer;
        this.node.addChild(child);
        child.setPosition(x, y, 0);
        const label = child.addComponent(Label);
        label.fontSize = fontSize;
        label.lineHeight = fontSize + 4;
        label.string = string;
        return label;
    }

    private draw(): void {
        const session = this.session;
        const g = this.painter;
        if (!session || !g) return;
        const { player, enemies, projectiles, pickups, tick } = session.world;
        g.clear();
        g.fillColor = BACKGROUND;
        g.rect(-HALF_W, -HALF_H, ARENA_WIDTH, ARENA_HEIGHT);
        g.fill();
        g.fillColor = GRID;
        for (let x = -HALF_W + 30; x < HALF_W; x += 30) g.rect(x, -HALF_H, 1, ARENA_HEIGHT);
        for (let y = -HALF_H + 32; y < HALF_H; y += 32) g.rect(-HALF_W, y, ARENA_WIDTH, 1);
        g.fill();
        g.fillColor = PICKUP;
        for (const p of pickups) g.rect(p.x - HALF_W - 2, p.y - HALF_H - 2, 4, 4);
        g.fill();
        g.fillColor = ENEMY;
        for (const e of enemies) g.circle(e.x - HALF_W, e.y - HALF_H, 5);
        g.fill();
        g.fillColor = PROJECTILE;
        for (const p of projectiles) g.rect(p.x - HALF_W - 1.5, p.y - HALF_H - 1.5, 3, 3);
        g.fill();
        g.fillColor = PLAYER_EDGE;
        g.circle(player.x - HALF_W, player.y - HALF_H, 9);
        g.fill();
        g.fillColor = PLAYER;
        g.circle(player.x - HALF_W, player.y - HALF_H, 7);
        g.fill();
        if (this.owner !== null) {
            g.fillColor = JOYSTICK;
            g.circle(this.originX, this.originY, JOYSTICK_RADIUS);
            g.circle(this.originX + session.x * JOYSTICK_RADIUS, this.originY + session.y * JOYSTICK_RADIUS, 12);
            g.fill();
        }
        g.fillColor = PANEL;
        g.rect(-HALF_W + 8, 214, ARENA_WIDTH - 16, 60);
        for (const center of BUTTON_CENTERS) g.rect(center - BUTTON_WIDTH / 2, BUTTON_CENTER_Y - BUTTON_HEIGHT / 2, BUTTON_WIDTH, BUTTON_HEIGHT);
        g.fill();

        // Don't rebuild the label texture every simulation tick.
        const seconds = Math.floor(tick / 30);
        const checkpoint = session.checkpointOk === null ? '' : (session.checkpointOk ? ' | CHECKPOINT OK' : ' | NO CHECKPOINT');
        const status = `${seconds}s | ${enemies.length}/${projectiles.length}/${pickups.length} | ${session.platform.kind.toUpperCase()}${checkpoint}`;
        if (this.status && status !== this.lastStatus) {
            this.lastStatus = status;
            this.status.string = status;
        }
        const pause = session.paused ? 'RESUME' : 'PAUSE';
        if (this.pauseLabel && pause !== this.lastPauseLabel) {
            this.lastPauseLabel = pause;
            this.pauseLabel.string = pause;
        }
    }
}
