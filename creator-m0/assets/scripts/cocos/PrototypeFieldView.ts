import { Material, Mesh, MeshRenderer, Node, Quat, primitives, utils } from 'cc';
import type { Battle } from '../m1/Battle';
import type { MissionPoint, MissionView, Position, TerrainRect } from '../m1/Encounter';
import { liftBridgeSpan } from './CampaignCombatView';
import { createFieldScrapMesh } from './PrototypeItemMeshes';

type Box = [x: number, y: number, z: number, width: number, height: number, depth: number, paint: number];
type PlaceOnField = (node: Node, position: Readonly<Position>, height: number, yaw: number) => void;

const rubber = 0x263039;
const casing = 0x435962;
const edge = 0x749196;
const dark = 0x182831;
const brass = 0xd9a744;
const stripe = 0xf5c66c;
const mint = 0x82eacf;
const amber = 0xffbf65;
const groundProjection = 0.8;
const bridgeLoweringTicks = 7;
const terminal = (lamp: number): Box[] => [
    [0, 1.2, 0, 16, 2.4, 12, rubber], [-1.8, 5, 0, 10.5, 8, 10.5, casing],
    [0.7, 9, 0, 8.5, 2.6, 10.5, edge], [1.25, 10.45, -0.3, 4.5, 0.45, 6.3, dark],
    [1.25, 10.73, -0.8, 3, 0.25, 4.8, lamp], [2.5, 11, 3.9, 1.2, 1.6, 1.7, brass],
    [-5.1, 4.6, 0, 2.8, 6.1, 9, dark],
];

const kits = {
    battery: [[0, 2.8, 0, 30, 5.6, 17, casing], [0.5, 8.2, 0, 24, 8.7, 15.4, brass],
        [0.7, 12.8, 0, 21, 1.7, 14.4, stripe], [-8.5, 14, 0, 3, 1.7, 13, casing],
        [1, 14.1, 0, 3.3, 2, 8.7, rubber], [1, 15.2, 0, 1.5, 0.8, 5.7, mint],
        [9, 14.4, -3, 4, 2.5, 3.5, rubber], [9, 14.4, 3, 4, 2.5, 3.5, rubber],
        [-10, 2.7, -8, 5, 5.4, 3.8, rubber], [10, 2.7, -8, 5, 5.4, 3.8, rubber],
        [-10, 2.7, 8, 5, 5.4, 3.8, rubber], [10, 2.7, 8, 5, 5.4, 3.8, rubber]],
    lift: [[0, 1, 0, 48, 2, 33, dark], [0, 2, 0, 44, 1.2, 28.4, casing],
        ...[-19, -13, -7, 0, 7, 13, 19].map((x): Box => [x, 2.7, 0, 1.1, 0.6, 26.3, edge]),
        [0, 3.2, -14.8, 46, 2, 2.4, brass], [0, 3.2, 14.8, 46, 2, 2.4, brass],
        [-22, 6, -14, 2.9, 8, 2.9, casing], [22, 6, -14, 2.9, 8, 2.9, casing],
        [0, 9.5, -14, 46.2, 1.8, 2.4, edge], [-20, 4.2, 13.5, 3.4, 2, 3.5, amber],
        [20, 4.2, 13.5, 3.4, 2, 3.5, amber]],
    'terminal-active': terminal(amber),
    'terminal-complete': terminal(mint),
    'terminal-waiting': terminal(0x557b85),
    wall: [[0, 3.75, 0, 1, 7.5, 1, casing], [0, 7.65, 0, 0.96, 1.4, 0.93, edge],
        [0, 8.4, -0.29, 0.95, 0.6, 0.08, dark], [0, 8.4, 0.29, 0.95, 0.6, 0.08, dark]],
    gate: [[0, 4, 0, 1, 8, 1, dark], [0, 8.1, 0, 0.98, 1.25, 0.78, casing],
        ...[-0.43, -0.3, -0.17, -0.04, 0.09, 0.22, 0.35].map((x): Box => [x, 8.7, 0, 0.055, 0.48, 0.76, stripe]),
        [0, 8.9, -0.425, 0.99, 0.9, 0.08, edge], [0, 8.9, 0.425, 0.99, 0.9, 0.08, edge]],
    rail: [[0, 0.85, 0, 1, 1.7, 1, rubber], [0, 2, 0, 1, 0.8, 0.73, edge]],
    belt: [[0, 0.9, 0, 1, 1.8, 1, dark], [0, 1.83, 0, 0.988, 0.3, 0.87, rubber],
        [-0.486, 2.1, 0, 0.025, 1.2, 0.87, casing], [0.486, 2.1, 0, 0.025, 1.2, 0.87, casing]],
    tread: [[0, 0.37, 0, 2.1, 0.74, 1, 0x4b6267], [-0.67, 0.78, 0, 0.38, 0.21, 0.97, 0x758587]],
    bridge: [[0.5, 1, 0, 1, 2, 0.89, dark], [0.5, 2.06, 0, 0.986, 0.31, 0.75, casing],
        ...Array.from({ length: 8 }, (_, i): Box => [(i + 0.5) / 8, 2.55, 0, 0.043, 0.71, 0.77, edge]),
        [0.5, 2.62, -0.451, 0.98, 1.15, 0.098, brass], [0.5, 2.62, 0.451, 0.98, 1.15, 0.098, brass],
        [0.038, 2.65, 0, 0.074, 1.38, 0.93, casing], [0.965, 2.28, 0, 0.069, 1.05, 0.91, casing]],
} satisfies Record<string, Box[]>;
type ModelName = keyof typeof kits | 'scrap';

function makeMesh(boxes: readonly Box[]): Mesh {
    const unit = primitives.box();
    const { positions: points, normals = [], indices: baseIndices = [] } = unit;
    const positions: number[] = [];
    const indices: number[] = [];
    const colors: number[] = [];
    for (const [x, y, z, width, height, depth, paint] of boxes) {
        const offset = positions.length / 3;
        for (let i = 0; i < points.length; i += 3) {
            positions.push(x + points[i] * width, y + points[i + 1] * height, z + points[i + 2] * depth);
            const light = 0.76 + 0.23 * (normals[i] * -0.35 + normals[i + 1] * 0.88 - normals[i + 2] * 0.3);
            colors.push(((paint >> 16) & 255) * light / 255, ((paint >> 8) & 255) * light / 255, (paint & 255) * light / 255, 1);
        }
        for (const index of baseIndices) indices.push(offset + index);
    }
    return utils.createMesh({ positions, indices, colors }, undefined, { calculateBounds: true });
}

/** Physical props share the actor pass; radii, routes and warnings use the encounter's rule overlays. */
export class PrototypeFieldView {
    private readonly material = new Material();
    private readonly pools = new Map<ModelName, { mesh: Mesh; nodes: Node[]; used: number }>();
    private readonly bridgeTilt = new Quat();
    private bridgeDock?: { battle: Readonly<Battle>; floor: number; tick: number };

    constructor(private readonly root: Node, private readonly layer: number, private readonly place: PlaceOnField) {
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: true } });
    }

    draw(battle: Readonly<Battle>): void {
        for (const pool of this.pools.values()) pool.used = 0;
        for (const part of battle.parts) {
            const phase = battle.tick * 0.13 + (part.x + part.y) * 0.02;
            this.show('scrap', part, 0.7 + Math.sin(phase) * 0.65, phase);
        }
        for (const rect of battle.terrainRects) {
            if (rect.kind === 'belt') {
                this.showBelt(rect);
                continue;
            }
            const width = rect.right - rect.left;
            const height = rect.top - rect.bottom;
            const center = { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
            if (rect.state === 'closed') this.show(rect.kind, center, 0, 0, width, height / groundProjection);
        }
        const mission = battle.mission;
        const boss = battle.chapterBoss;
        const escort = mission?.escort;
        if (escort) {
            const target = escort.destination ?? escort.route[escort.route.length - 1];
            const facing = !mission.lift && target ? Math.atan2(target.y - escort.y, target.x - escort.x) : 0;
            this.show(mission.lift ? 'lift' : 'battery', escort, 0, facing);
        }
        if (escort && mission.lift?.bridge) this.showBridge(battle, escort, mission.lift);
        else this.bridgeDock = undefined;
        const points = boss?.terminals ?? (boss?.kind === 'core' && boss.hp > 0 ? [] : mission?.points ?? []);
        for (const point of points) this.showTerminal(point);
        if (boss?.station && !boss.terminals && !points.some(point => point.x === boss.station?.x && point.y === boss.station?.y)) {
            this.show('terminal-active', boss.station, 0, -Math.PI / 2);
        }
        for (const pool of this.pools.values()) {
            for (let i = pool.used; i < pool.nodes.length; i++) pool.nodes[i].active = false;
        }
    }

    destroy(): void {
        this.material.destroy();
        for (const pool of this.pools.values()) pool.mesh.destroy();
    }

    private showTerminal(point: MissionPoint): void {
        const kind = point.state === 'complete' ? 'terminal-complete'
            : point.state === 'active' ? 'terminal-active' : 'terminal-waiting';
        this.show(kind, point, 0, -Math.PI / 2);
    }

    private showBelt({ left, right, bottom, top, travel = 0 }: TerrainRect): void {
        const width = right - left, height = top - bottom;
        const center = { x: (left + right) / 2, y: (bottom + top) / 2 };
        this.show('belt', center, 0, 0, width, height / groundProjection);
        for (const y of [bottom + 1, top - 1]) this.show('rail', { x: center.x, y }, 0, 0, width, 2.2);
        const spacing = 12;
        const offset = ((travel % spacing) + spacing) % spacing;
        for (let x = left + 8 + offset; x < right - 7; x += spacing) {
            this.show('tread', { x, y: center.y }, 1.92, 0, 1, (height - 10) / groundProjection);
        }
    }

    private showBridge(battle: Readonly<Battle>, escort: Readonly<Position>, lift: NonNullable<MissionView['lift']>): void {
        const span = lift.bridge && liftBridgeSpan(escort, lift.bridge);
        if (!span) return;
        if (this.bridgeDock?.battle !== battle || this.bridgeDock.floor !== lift.floor || battle.tick < this.bridgeDock.tick) {
            this.bridgeDock = { battle, floor: lift.floor, tick: battle.tick };
        }
        const { at, dx, dy, start, end, width } = span;
        const [x, y] = at(start, 0);
        const yaw = Math.atan2(dy, dx);
        const length = (end - start) * Math.hypot(dx, dy / groundProjection) / span.span;
        const bridge = this.show('bridge', { x, y }, 0, yaw, length, width * 2 / groundProjection);
        const settle = Math.max(0, 1 - (battle.tick - this.bridgeDock.tick) / bridgeLoweringTicks);
        Quat.fromEuler(this.bridgeTilt, 0, 0, 26 * settle * settle);
        bridge.setRotation(Quat.multiply(this.bridgeTilt, bridge.rotation, this.bridgeTilt));
    }

    private show(kind: ModelName, position: Readonly<Position>, height: number, yaw: number, x = 1, z = 1): Node {
        let pool = this.pools.get(kind);
        if (!pool) {
            const mesh = kind === 'scrap' ? createFieldScrapMesh() : makeMesh(kits[kind]);
            this.pools.set(kind, pool = { mesh, nodes: [], used: 0 });
        }
        let node = pool.nodes[pool.used];
        if (!node) {
            node = new Node('Field ' + kind);
            node.layer = this.layer;
            this.root.addChild(node);
            const renderer = node.addComponent(MeshRenderer);
            renderer.mesh = pool.mesh;
            renderer.setSharedMaterial(this.material, 0);
            pool.nodes.push(node);
        }
        pool.used++;
        this.place(node, position, height, yaw);
        node.setScale(x, 1, z);
        node.active = true;
        return node;
    }
}
