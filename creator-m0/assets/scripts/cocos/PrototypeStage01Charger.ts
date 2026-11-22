import { Color, Material, MeshRenderer, Node, Prefab, instantiate, resources } from 'cc';
import { driveChargerRig } from './PrototypeChargerMesh';
import type { PrototypeChargerActor } from './PrototypeChargerMesh';
import { PrototypeWorkshopLight } from './PrototypeWorkshopLight';

const assetPath = 'prototype3d/enemies/charger-stage01';
const requiredParts = ['TrackHousing', 'TrackLinks', 'Chassis', 'Ram', 'Jets', 'RamSignal'] as const;
type Part = typeof requiredParts[number];

function findParts(root: Node): Map<string, Node> {
    const parts = new Map<string, Node>();
    root.walk(node => parts.set(node.name, node));
    return parts;
}

/** Loads the Blender model once and shares its meshes, textures and PBR materials across the pool. */
export class PrototypeStage01Charger {
    private readonly materials = new Map<Material, Material>();
    private readonly hitMaterials = new Map<Material, Material>();
    private prefab: Prefab | null = null;
    private requested = false;
    private disposed = false;
    private releaseLight?: () => void;

    constructor(private readonly parent: Node, private readonly layer: number) {}

    /** Returns the preferred pool variant so late assets never change gameplay or block a round. */
    use(enabled: boolean): boolean {
        if (enabled && !this.requested) {
            this.requested = true;
            // Creator registers the GLB scene as a Prefab subasset under this path.
            resources.loadDir(assetPath, Prefab, (error, prefabs) => {
                if (this.disposed) return;
                const prefab = prefabs?.[0];
                const parts = prefab && findParts(prefab.data);
                if (error || !prefab || !requiredParts.every(part => parts?.has(part))) {
                    console.warn('Stage 01 charger prefab unavailable', error ?? assetPath);
                    return;
                }
                prefab.addRef();
                this.prefab = prefab;
            });
        }

        const visible = enabled && !!this.prefab;
        if (visible) this.releaseLight ??= PrototypeWorkshopLight.acquire(this.parent.scene!, this.layer);
        else if (this.releaseLight) {
            this.releaseLight();
            this.releaseLight = undefined;
        }
        return visible;
    }

    create(): PrototypeChargerActor {
        const node = new Node('Stage 01 charger');
        node.layer = this.layer;
        const model = instantiate(this.prefab!);
        node.addChild(model);
        const parts = findParts(model);
        const part = (name: Part): Node => parts.get(name)!;
        const shell = part('Chassis');
        const ram = part('Ram');
        const signal = part('RamSignal');
        const casing: { renderer: MeshRenderer; slot: number; normal: Material; hit: Material }[] = [];
        const shellMeshes = new Set(shell.getComponentsInChildren(MeshRenderer));
        for (const renderer of ram.getComponentsInChildren(MeshRenderer)) shellMeshes.delete(renderer);

        model.walk(child => {
            child.layer = this.layer;
            for (const renderer of child.getComponents(MeshRenderer)) {
                renderer.sharedMaterials.forEach((original, slot) => {
                    if (!original) return;
                    const normal = this.getMaterial(original);
                    renderer.setSharedMaterial(normal, slot);
                    if (shellMeshes.has(renderer)) {
                        casing.push({ renderer, slot, normal, hit: this.getHitMaterial(normal) });
                    }
                });
            }
        });
        this.parent.addChild(node);
        return driveChargerRig(node, part('TrackLinks'), shell, ram, part('Jets'), pose => {
            signal.active = pose === 'windup' || pose === 'strike';
            for (const { renderer, slot, normal, hit } of casing) {
                const material = pose === 'hit' ? hit : normal;
                if (renderer.getSharedMaterial(slot) !== material) renderer.setSharedMaterial(material, slot);
            }
        });
    }

    destroy(): void {
        this.use(false);
        this.disposed = true;
        for (const material of this.materials.values()) material.destroy();
        for (const material of this.hitMaterials.values()) material.destroy();
        this.prefab?.decRef();
    }

    private getMaterial(source: Material): Material {
        let material = this.materials.get(source);
        if (!material) {
            material = new Material();
            material.copy(source, { defines: { USE_INSTANCING: true } });
            this.materials.set(source, material);
        }
        return material;
    }

    private getHitMaterial(source: Material): Material {
        let material = this.hitMaterials.get(source);
        if (!material) {
            material = new Material();
            material.copy(source, { defines: { USE_EMISSIVE_MAP: false } });
            material.setProperty('emissive', new Color(117, 33, 12));
            this.hitMaterials.set(source, material);
        }
        return material;
    }
}
