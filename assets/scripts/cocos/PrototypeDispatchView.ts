import { Camera, Color, Director, Game, Material, Mesh, MeshRenderer, Node, RenderTexture, SpriteFrame, Vec3, director, game } from 'cc';
import { ArenaGeometry, PrototypeArenaMeshes } from './PrototypeArenaMeshes';
import { buildRestoredCity } from './PrototypeEndingMeshes';

const DISPATCH_LAYER = 1 << 13;
const SIZE = { width: 656, height: 328 };

/** A single portrait camera for the illustrated part of the dispatch and ending cards. */
export class PrototypeDispatchView {
    private readonly root = new Node('3D dispatch artwork');
    private readonly texture = new RenderTexture();
    private readonly composite = new SpriteFrame();
    private readonly arenas = new PrototypeArenaMeshes();
    private readonly cityMaterial = new Material();
    private readonly camera: Camera;
    private readonly eye = new Node('Dispatch artwork camera');
    private desired?: string;
    private ready?: string;
    private capturing?: string;
    private city?: { node: Node; mesh: Mesh };

    static supports(id: string): boolean {
        return id === 'ending' || PrototypeArenaMeshes.supports(id);
    }

    constructor(scene: Node, private readonly invalidate: () => void) {
        this.root.active = false;
        scene.addChild(this.root);
        this.texture.reset({ ...SIZE, name: 'Dispatch artwork' });
        this.eye.layer = DISPATCH_LAYER;
        this.root.addChild(this.eye);
        const camera = this.camera = this.eye.addComponent(Camera);
        camera.enabled = false;
        camera.visibility = DISPATCH_LAYER;
        camera.priority = -6;
        camera.projection = Camera.ProjectionType.ORTHO;
        camera.near = 1;
        camera.far = 1900;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new Color(12, 22, 28, 255);
        camera.targetTexture = this.texture;
        this.composite.packable = false;
        this.composite.texture = this.texture;
        this.cityMaterial.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        game.on(Game.EVENT_SHOW, this.refresh);
    }

    show(id: string): SpriteFrame | undefined {
        this.desired = id;
        this.root.active = true;
        if (this.ready === id) return this.composite;
        this.capture();
        return undefined;
    }

    destroy(): void {
        this.root.active = false;
        game.off(Game.EVENT_SHOW, this.refresh);
        director.off(Director.EVENT_AFTER_DRAW, this.finish);
        this.releaseModels();
        this.root.destroy();
        this.composite.destroy();
        this.texture.destroy();
        this.cityMaterial.destroy();
    }

    private readonly refresh = (): void => {
        this.ready = undefined;
        this.capture();
    };

    private capture(): void {
        const stage = this.desired;
        if (!stage || this.capturing) return;
        this.capturing = stage;
        this.ready = undefined;
        if (stage === 'ending') this.composeEnding();
        else this.composeArena(stage);
        this.camera.enabled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.finish);
    }

    private composeArena(id: string): void {
        this.arenas.create(id, this.root, DISPATCH_LAYER);
        // Show the service structures at the north end, from a shallower angle than combat.
        this.eye.setPosition(124, 282, 450);
        this.eye.lookAt(new Vec3(0, 14, -171));
        this.camera.orthoHeight = 80;
    }

    private composeEnding(): void {
        const geometry = new ArenaGeometry();
        buildRestoredCity(geometry);
        const mesh = geometry.mesh();
        const node = new Node('Restored city');
        node.layer = DISPATCH_LAYER;
        this.root.addChild(node);
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = mesh;
        renderer.setSharedMaterial(this.cityMaterial, 0);
        this.city = { node, mesh };
        this.eye.setPosition(0, 430, 472);
        this.eye.lookAt(new Vec3(0, 12, -8));
        this.camera.orthoHeight = 83;
    }

    private readonly finish = (): void => {
        this.camera.enabled = false;
        this.ready = this.root.active ? this.capturing : undefined;
        this.capturing = undefined;
        this.releaseModels();
        this.invalidate();
    };

    private releaseModels(): void {
        this.arenas.destroy();
        if (!this.city) return;
        this.city.node.destroy();
        this.city.mesh.destroy();
        this.city = undefined;
    }
}
