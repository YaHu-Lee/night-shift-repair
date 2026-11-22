import { Color, DirectionalLight, Node, Vec3 } from 'cc';
import type { Scene } from 'cc';

/** Cocos uses one directional key per scene. Share it across the PBR render layers. */
export class PrototypeWorkshopLight {
    private static readonly scenes = new WeakMap<Scene, PrototypeWorkshopLight>();
    private readonly layers = new Map<number, number>();
    private readonly node = new Node('Workshop key');
    private readonly key: DirectionalLight;
    private readonly restoreAmbient: () => void;

    private constructor(scene: Scene) {
        this.node.active = false;
        scene.addChild(this.node);
        this.node.setPosition(-160, 330, 210);
        this.node.lookAt(Vec3.ZERO);
        this.key = this.node.addComponent(DirectionalLight);
        this.key.color = new Color(255, 242, 219);
        this.key.illuminance = 52000;

        const ambient = scene.globals.ambient;
        const sky = ambient.skyLightingColor.clone();
        const ground = ambient.groundLightingColor.clone();
        const illum = ambient.skyIllum;
        ambient.skyLightingColor = new Color(158, 191, 218);
        ambient.groundLightingColor = new Color(139, 126, 113);
        ambient.skyIllum = 13200;
        this.restoreAmbient = () => {
            ambient.skyLightingColor = sky;
            ambient.groundLightingColor = ground;
            ambient.skyIllum = illum;
        };
    }

    static acquire(scene: Scene, layer: number): () => void {
        let light = this.scenes.get(scene);
        if (!light) {
            light = new PrototypeWorkshopLight(scene);
            this.scenes.set(scene, light);
        }
        return light.acquireLayer(scene, layer);
    }

    private acquireLayer(scene: Scene, layer: number): () => void {
        this.layers.set(layer, (this.layers.get(layer) ?? 0) + 1);
        this.node.active = true;
        this.updateVisibility();
        return () => {
            const users = this.layers.get(layer)! - 1;
            if (users) this.layers.set(layer, users);
            else this.layers.delete(layer);
            if (this.layers.size) this.updateVisibility();
            else {
                this.node.active = false;
                this.node.destroy();
                this.restoreAmbient();
                PrototypeWorkshopLight.scenes.delete(scene);
            }
        };
    }

    private updateVisibility(): void {
        let visibility = 0;
        for (const layer of this.layers.keys()) visibility |= layer;
        this.key.visibility = visibility;
    }
}
