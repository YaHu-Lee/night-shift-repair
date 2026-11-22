import { Camera, Color, Director, Game, MeshRenderer, Node, RenderTexture, SpriteFrame, Vec3, director, game } from 'cc';
import type { ToolId } from '../m1/content';
import type { PrototypeMechanicMeshes } from './PrototypeMechanicMesh';

const REVEAL_LAYER = 1 << 12;

/** Displays the actual tool mesh and captures only while the reward is turning. */
export class PrototypeToolReveal {
    private readonly root = new Node('3D tool reward');
    private readonly turntable = new Node('Reward turntable');
    private readonly texture = new RenderTexture();
    private readonly composite = new SpriteFrame();
    private readonly camera: Camera;
    private progress = -1;
    private ready = false;

    constructor(scene: Node, readonly tool: ToolId, tools: PrototypeMechanicMeshes, private readonly invalidate: () => void) {
        scene.addChild(this.root);
        this.root.addChild(this.turntable);
        this.turntable.layer = REVEAL_LAYER;
        const model = tools.createToolDisplay(tool, this.turntable, REVEAL_LAYER);
        const mesh = model.getComponent(MeshRenderer)?.mesh;
        const lo = mesh?.minPosition;
        const hi = mesh?.maxPosition;
        if (lo && hi) {
            // A bounding sphere keeps the stock or tool head clear of the frame throughout the turn.
            const scale = 0.89 / Math.max(0.01, Math.hypot(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z));
            model.setScale(scale, scale, scale);
            model.setPosition(-(hi.x + lo.x) * scale / 2, -(hi.y + lo.y) * scale / 2, -(hi.z + lo.z) * scale / 2);
        }
        this.texture.reset({ width: 256, height: 256, name: 'Tool reward' });
        this.composite.packable = false;
        this.composite.texture = this.texture;

        const eye = new Node('Reward camera');
        eye.layer = REVEAL_LAYER;
        this.root.addChild(eye);
        eye.setPosition(0, 0, 10);
        eye.lookAt(Vec3.ZERO);
        const camera = this.camera = eye.addComponent(Camera);
        camera.enabled = false;
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.visibility = REVEAL_LAYER;
        camera.priority = -7;
        camera.orthoHeight = 0.5;
        camera.near = 0.1;
        camera.far = 20;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(0, 0, 0, 0);
        camera.targetTexture = this.texture;
        game.on(Game.EVENT_SHOW, this.capture);
    }

    show(progress: number): SpriteFrame | undefined {
        if (progress !== this.progress) {
            this.progress = progress;
            const remaining = 1 - progress;
            this.turntable.setRotationFromEuler(19 + remaining * 11, -35 - remaining * 260,
                this.tool.endsWith('wrench') ? 31 : -8);
            this.capture();
        }
        return this.ready ? this.composite : undefined;
    }

    destroy(): void {
        this.root.active = false;
        game.off(Game.EVENT_SHOW, this.capture);
        director.off(Director.EVENT_AFTER_DRAW, this.finish);
        this.root.destroy();
        this.composite.destroy();
        this.texture.destroy();
    }

    private readonly capture = (): void => {
        if (this.camera.enabled) return;
        this.camera.enabled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.finish);
    };

    private readonly finish = (): void => {
        this.camera.enabled = false;
        if (this.ready) return;
        this.ready = true;
        this.invalidate();
    };
}
