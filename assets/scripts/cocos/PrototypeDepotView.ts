import { Camera, Color, Director, Game, Node, RenderTexture, SpriteFrame, Vec3, director, game } from 'cc';
import { PrototypeDepotMeshes } from './PrototypeDepotMeshes';
import { PrototypeMechanicMeshes } from './PrototypeMechanicMesh';

const DEPOT_LAYER = 1 << 15;

/** Static 3D workshop seen behind the home and settings interfaces. */
export class PrototypeDepotView {
    private readonly root = new Node('3D workshop');
    private readonly texture = new RenderTexture();
    private readonly composite = new SpriteFrame();
    private readonly models = new PrototypeDepotMeshes();
    private readonly camera: Camera;
    private readonly mechanic: PrototypeMechanicMeshes;
    private ready = false;
    private pending = false;

    constructor(scene: Node, private readonly invalidate: () => void) {
        this.root.active = false;
        scene.addChild(this.root);
        const room = this.models.create(this.root, DEPOT_LAYER);
        this.texture.reset({ width: 720, height: 1280, name: 'Depot backdrop' });
        const eye = new Node('Depot camera');
        eye.layer = DEPOT_LAYER;
        this.root.addChild(eye);
        eye.setPosition(0, 400, 690);
        eye.lookAt(Vec3.ZERO);
        const camera = this.camera = eye.addComponent(Camera);
        camera.visibility = DEPOT_LAYER;
        camera.priority = -4;
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.orthoHeight = 320;
        camera.near = 1;
        camera.far = 2000;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(9, 18, 24, 255);
        camera.targetTexture = this.texture;
        this.composite.packable = false;
        this.composite.texture = this.texture;
        this.mechanic = new PrototypeMechanicMeshes(true, this.capture);
        const marker = room.getChildByName('3D Mechanic Marker') ?? room;
        const player = this.mechanic.create(marker, DEPOT_LAYER);
        player.node.setScale(75, 75, 75);
        player.node.setRotationFromEuler(0, -63, 0);
        player.setPose('idle', 0, 'wrench');
        game.on(Game.EVENT_SHOW, this.capture);
    }

    get frame(): SpriteFrame | null { return this.ready ? this.composite : null; }

    setVisible(visible: boolean): void {
        if (visible === this.root.active) return;
        this.root.active = visible;
        if (visible) this.capture();
    }

    destroy(): void {
        this.root.active = false;
        game.off(Game.EVENT_SHOW, this.capture);
        director.off(Director.EVENT_AFTER_DRAW, this.finish);
        this.root.destroy();
        this.composite.destroy();
        this.texture.destroy();
        this.mechanic.destroy();
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
        this.ready = true;
        this.invalidate();
    };
}
