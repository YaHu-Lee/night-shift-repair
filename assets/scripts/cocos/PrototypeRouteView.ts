import { Camera, Color, Director, Game, Node, RenderTexture, SpriteFrame, Vec3, director, game } from 'cc';
import { CAMPAIGN_MAP_HEIGHT } from '../campaign/CampaignCatalog';
import { PrototypeRouteMeshes } from './PrototypeRouteMeshes';

const ROUTE_LAYER = 1 << 14;

/** The complete chapter texture scrolls with the same origin as the live route and station markers. */
export class PrototypeRouteView {
    private readonly root = new Node('3D chapter districts');
    private readonly texture = new RenderTexture();
    private readonly composite = new SpriteFrame();
    private readonly models = new PrototypeRouteMeshes();
    private readonly camera: Camera;
    private chapter?: string;
    private ready?: string;
    private pending = false;

    constructor(scene: Node, private readonly invalidate: () => void) {
        this.root.active = false;
        scene.addChild(this.root);
        this.texture.reset({ width: 540, height: CAMPAIGN_MAP_HEIGHT * 1.5, name: 'Chapter backdrop' });
        const eye = new Node('District camera');
        eye.layer = ROUTE_LAYER;
        this.root.addChild(eye);
        eye.setPosition(0, 800, 600);
        eye.lookAt(Vec3.ZERO);
        const camera = this.camera = eye.addComponent(Camera);
        camera.visibility = ROUTE_LAYER;
        camera.priority = -5;
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = CAMPAIGN_MAP_HEIGHT / 2;
        camera.near = 1;
        camera.far = 2200;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(13, 27, 32, 255);
        camera.targetTexture = this.texture;
        this.composite.packable = false;
        this.composite.texture = this.texture;
        game.on(Game.EVENT_SHOW, this.capture);
    }

    frame(chapter: string): SpriteFrame | null {
        return this.ready === chapter ? this.composite : null;
    }

    setChapter(chapter?: string): void {
        if (!chapter) {
            this.root.active = false;
            return;
        }
        const changed = chapter !== this.chapter;
        const hidden = !this.root.active;
        if (changed) {
            this.ready = undefined;
            this.chapter = this.models.create(chapter, this.root, ROUTE_LAYER) ? chapter : undefined;
        }
        this.root.active = !!this.chapter;
        if (changed || hidden) this.capture();
    }

    destroy(): void {
        this.root.active = false;
        game.off(Game.EVENT_SHOW, this.capture);
        director.off(Director.EVENT_AFTER_DRAW, this.finish);
        this.root.destroy();
        this.composite.destroy();
        this.texture.destroy();
        this.models.destroy();
    }

    private readonly capture = (): void => {
        if (!this.root.active || this.pending) return;
        this.pending = true;
        this.camera.enabled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.finish);
    };

    private readonly finish = (): void => {
        this.pending = false;
        this.camera.enabled = false;
        if (this.root.active) this.ready = this.chapter;
        this.invalidate();
    };
}
