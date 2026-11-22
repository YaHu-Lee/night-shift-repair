import {
    Camera, Color, Director, Game, MeshRenderer, Node, Rect, RenderTexture, SpriteFrame, Vec3, director, game,
} from 'cc';
import { TOOLS, isTool } from '../m1/content';
import type { ToolId } from '../m1/content';
import { ITEM_MODEL_KEYS, PrototypeItemMeshes, isItemModel } from './PrototypeItemMeshes';
import { PrototypeMechanicMeshes } from './PrototypeMechanicMesh';
import { RADIO_MODEL_KEYS, PrototypeRadioMeshes } from './PrototypeRadioMeshes';
import { PrototypeToolReveal } from './PrototypeToolReveal';

const ICON_LAYER = 1 << 16;
const COLUMNS = 6;
const RESOLUTION = 256;
type RadioPortrait = typeof RADIO_MODEL_KEYS[number];
const keys = [...Object.keys(TOOLS) as ToolId[], ...ITEM_MODEL_KEYS, ...RADIO_MODEL_KEYS, 'mechanic'] as const;
const ROWS = Math.ceil(keys.length / COLUMNS);

function isRadioPortrait(key: string): key is RadioPortrait {
    return RADIO_MODEL_KEYS.includes(key as RadioPortrait);
}

/** Renders the UI item and radio views from their 3D source meshes. */
export class PrototypeItemIcons {
    private readonly root = new Node('3D item atlas');
    private readonly texture = new RenderTexture();
    private readonly camera: Camera;
    private readonly frames = new Map<string, SpriteFrame>();
    private readonly toolIcons: Node[] = [];
    private readonly tools: PrototypeMechanicMeshes;
    private readonly attachments = new PrototypeItemMeshes();
    private readonly portraits = new PrototypeRadioMeshes();
    private ready = false;
    private capturing = false;

    static supports(key: string): boolean {
        return key === 'mechanic' || isTool(key) || isItemModel(key) || isRadioPortrait(key);
    }

    constructor(scene: Node, private readonly invalidate: () => void) {
        scene.addChild(this.root);
        this.texture.reset({ width: COLUMNS * RESOLUTION, height: ROWS * RESOLUTION, name: '3D equipment icons' });
        const eye = new Node('Equipment atlas camera');
        eye.layer = ICON_LAYER;
        this.root.addChild(eye);
        eye.setPosition(0, 0, 15);
        eye.lookAt(Vec3.ZERO);
        const camera = this.camera = eye.addComponent(Camera);
        camera.visibility = ICON_LAYER;
        camera.priority = -3;
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = ROWS / 2;
        camera.near = 0.1;
        camera.far = 30;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(0, 0, 0, 0);
        camera.targetTexture = this.texture;
        this.tools = new PrototypeMechanicMeshes(true, this.refreshTools);
        keys.forEach((key, index) => this.addIcon(key, index));
        game.on(Game.EVENT_SHOW, this.capture);
        this.capture();
    }

    frame(key: string): SpriteFrame | undefined {
        return this.ready ? this.frames.get(key) : undefined;
    }

    createReveal(tool: ToolId): PrototypeToolReveal {
        return new PrototypeToolReveal(this.root.scene!, tool, this.tools, this.invalidate);
    }

    destroy(): void {
        this.root.active = false;
        game.off(Game.EVENT_SHOW, this.capture);
        director.off(Director.EVENT_AFTER_DRAW, this.finish);
        this.root.destroy();
        for (const frame of this.frames.values()) frame.destroy();
        this.texture.destroy();
        this.tools.destroy();
        this.attachments.destroy();
        this.portraits.destroy();
    }

    private addIcon(key: typeof keys[number], index: number): void {
        const column = index % COLUMNS;
        const row = Math.floor(index / COLUMNS);
        const stand = new Node('Item stand ' + key);
        stand.layer = ICON_LAYER;
        this.root.addChild(stand);
        stand.setPosition(column + 0.5 - COLUMNS / 2, ROWS / 2 - row - 0.5, 0);
        if (key === 'mechanic') {
            stand.setRotationFromEuler(8, -69, 0);
            const player = this.tools.create(stand, ICON_LAYER);
            player.node.setScale(0.38, 0.38, 0.38);
            player.node.setPosition(0, -0.34, 0);
            player.setPose('idle', 0);
        } else {
            if (isRadioPortrait(key)) stand.setRotationFromEuler(8, -72, 0);
            else stand.setRotationFromEuler(21, -34, isTool(key) && key.endsWith('wrench') ? 31 : -8);
            const item = isTool(key) ? this.tools.createToolDisplay(key, stand, ICON_LAYER)
                : isRadioPortrait(key) ? this.portraits.create(key, stand, ICON_LAYER)
                : this.attachments.create(key, stand, ICON_LAYER);
            if (isTool(key)) this.toolIcons.push(item);
            this.fitIcon(item);
        }

        const frame = new SpriteFrame();
        frame.reset({ texture: this.texture, rect: new Rect(column * RESOLUTION, row * RESOLUTION, RESOLUTION, RESOLUTION) });
        frame.packable = false;
        this.frames.set(key, frame);
    }

    private fitIcon(item: Node): void {
        const mesh = item.getComponent(MeshRenderer)?.mesh;
        const lo = mesh?.minPosition;
        const hi = mesh?.maxPosition;
        if (!lo || !hi) return;
        const size = Math.max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z, 0.01);
        const scale = 0.73 / size;
        item.setScale(scale, scale, scale);
        item.setPosition(-(hi.x + lo.x) * scale / 2, -(hi.y + lo.y) * scale / 2, -(hi.z + lo.z) * scale / 2);
    }

    private readonly refreshTools = (): void => {
        for (const item of this.toolIcons) this.fitIcon(item);
        this.capture();
    };

    private readonly capture = (): void => {
        if (this.capturing) return;
        this.capturing = true;
        this.camera.enabled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.finish);
    };

    private readonly finish = (): void => {
        this.camera.enabled = false;
        this.capturing = false;
        this.ready = true;
        this.invalidate();
    };
}
