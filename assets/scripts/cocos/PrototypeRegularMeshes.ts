import { Color, Material, Mesh, MeshRenderer, Node, utils } from 'cc';
import type { RegularEnemyId } from '../m1/content';
import type { PrototypePoseName } from './PrototypeActorMotion';

export type PrototypeRegularKind = Exclude<RegularEnemyId, 'charger'>;

export const PROTOTYPE_REGULAR_SCALE: Readonly<Record<PrototypeRegularKind, number>> = {
    crawler: 0.86, turret: 0.97, armored: 1.0, pursuer: 0.92,
    reclaimer: 0.96, jammer: 0.95, ambusher: 0.90,
};

type Point = [number, number, number];
const steel = 0x7d8d90;
const edge = 0xaeb6ad;
const chassis = 0x414e54;
const recess = 0x28333a;
const rubber = 0x283038;
const staticKnuckle = 0x6c695e;

// Same authored axes as the project enemy sheets: X forward, Y across, Z up.
// Vertex light follows the charger palette, with warm upper surfaces and cool recesses.
class Geometry {
    private readonly positions: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    box(x: number, y: number, z: number, length: number, width: number, height: number, paint: number): void {
        const a = length / 2, b = width / 2;
        const base: Point[] = [[x + a, y - b, z], [x + a, y + b, z], [x - a, y + b, z], [x - a, y - b, z]];
        this.extrude(base, height, paint);
    }

    bevel(x: number, y: number, z: number, length: number, width: number, height: number, paint: number): void {
        const a = length / 2, b = width / 2, c = Math.min(2.4, a * 0.42, b * 0.42);
        const base = [[a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c], [-a + c, -b], [a - c, -b]]
            .map<Point>(([px, py]) => [x + px, y + py, z]);
        this.extrude(base, height, paint);
    }

    disc(x: number, y: number, z: number, rx: number, ry: number, height: number, paint: number, sides = 8): void {
        const base = Array.from({ length: sides }, (_, index): Point => {
            const angle = (index + 0.5) * 2 * Math.PI / sides;
            return [x + rx * Math.cos(angle), y + ry * Math.sin(angle), z];
        });
        this.extrude(base, height, paint);
    }

    tube(x: number, y: number, z: number, length: number, radius: number, paint: number): void {
        const ring = (offset: number) => Array.from({ length: 8 }, (_, index): Point => {
            const angle = (index + 0.5) * Math.PI / 4;
            return [x + offset, y + radius * Math.cos(angle), z + radius * Math.sin(angle)];
        });
        this.solid(ring(-length / 2), ring(length / 2), paint);
    }

    beam(from: Point, to: Point, width: number, height: number, paint: number): void {
        const dx = to[0] - from[0], dy = to[1] - from[1];
        const scale = width / (2 * Math.hypot(dx, dy));
        const offset = ([x, y, z]: Point, side: number): Point => [x + dy * scale * side, y - dx * scale * side, z];
        this.extrude([offset(from, 1), offset(to, 1), offset(to, -1), offset(from, -1)], height, paint);
    }

    mesh(): Mesh | undefined {
        if (!this.indices.length) return undefined;
        return utils.createMesh({ positions: this.positions, colors: this.colors, indices: this.indices },
            undefined, { calculateBounds: true });
    }

    private extrude(base: Point[], height: number, paint: number): void {
        this.solid(base, base.map(([x, y, z]) => [x, y, z + height]), paint);
    }

    private solid(from: Point[], to: Point[], paint: number): void {
        for (let i = 0; i < from.length; i++) {
            const next = (i + 1) % from.length;
            this.face([from[i], from[next], to[next], to[i]], paint);
        }
        this.face(to, paint);
        this.face(from.reverse(), paint);
    }

    private face(points: Point[], paint: number): void {
        const [a, b, c] = points;
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const diffuse = (-nx * 0.40 - ny * 0.30 + nz * 0.86) / Math.hypot(nx, ny, nz);
        const light = 0.64 + 0.35 * Math.max(-0.30, diffuse);
        const base = this.positions.length / 3;
        for (const [x, y, z] of points) {
            this.positions.push(x, z, -y);
            this.colors.push(((paint >>> 16) & 255) * light / 255, ((paint >>> 8) & 255) * light / 255, (paint & 255) * light / 255, 1);
        }
        for (let i = 1; i < points.length - 1; i++) this.indices.push(base, base + i, base + i + 1);
    }
}

function track(geometry: Geometry, y: number, length: number): void {
    geometry.bevel(0, y, 0, length, 4.7, 4.5, rubber);
    geometry.box(0, y, 3.65, length - 3, 4.55, 1.15, chassis);
    for (const x of [-length * 0.29, 0, length * 0.29]) {
        geometry.box(x, y, 4.8, 1.3, 4.7, 0.45, staticKnuckle);
    }
}

function foot(geometry: Geometry, x: number, y: number): void {
    geometry.bevel(x, y, 0, 6.8, 4.7, 2.3, rubber);
    geometry.bevel(x, y, 1.8, 5, 3.9, 1.6, chassis);
}

function eye(geometry: Geometry, x: number, z: number, width: number, light: number): void {
    geometry.bevel(x, 0, z, 4.5, width + 1.6, 3.45, recess);
    geometry.box(x + 2.05, 0, z + 0.7, 0.8, width, 1.75, light);
}

function grille(geometry: Geometry, x: number, z: number): void {
    geometry.box(x, 0, z, 5, 6, 0.45, chassis);
    for (const dx of [-1.55, 0, 1.55]) geometry.box(x + dx, 0, z + 0.45, 0.7, 4.9, 0.18, recess);
}

function walker(t: RigGeometry, concealed: boolean): void {
    const coat = concealed ? 0x556f82 : 0x9f4737;
    const plate = concealed ? 0x7896a7 : 0xc76845;
    const light = concealed ? 0xb5e6ff : 0xffad6c;
    t.shell.bevel(-1.5, 0, 2.8, 17, 14.8, 5, coat);
    t.shell.bevel(-3.0, 0, 7.4, 11.5, 11, 2.5, plate);
    grille(t.shell, -4, 9.95);
    if (concealed) {
        t.shell.box(-5.7, -5.35, 8.9, 5.2, 1.5, 0.85, recess);
        t.shell.box(-5.5, -5.35, 9.73, 3.5, 0.75, 0.25, light);
    }
    eye(t.tool, 7.4, 4.6, concealed ? 6.5 : 4.4, light);
    if (!concealed) t.signal.box(11.3, 0, 5.2, 1.2, 3.4, 1.65, 0xffc693);
    else t.signal.box(-5.8, -5.35, 10.0, 4.2, 0.95, 0.5, 0xbfebff);
    for (const side of [-1, 1]) {
        for (const row of [-1, 0, 1]) {
            const alternate = side * (row === 0 ? -1 : 1);
            const triplet = alternate < 0 ? t.left : t.right;
            const x = row * 5.1, outer = side * (11.9 + 0.45 * row);
            triplet.beam([x, side * 4.4, 4.4], [x, outer, 3.3], 2.65, 1.35, chassis);
            triplet.beam([x, outer, 3.05], [x + (row > 0 ? 3.5 : -2.55), outer + side * 2.0, 0.15], 2.35, 1.3, plate);
        }
    }
    // The front pair is distinguishable from the walking legs at a glance.
    for (const side of [-1, 1]) {
        t.tool.beam([8.0, side * 3.0, 2.8], [concealed ? 12.1 : 10.5, side * 5.3, 1.3], 2.15, 1.4, concealed ? steel : coat);
        if (concealed) t.tool.box(12.5, side * 4.7, 1.42, 2.4, 1.6, 1.0, edge);
    }
}

function turret(t: RigGeometry): void {
    t.base.disc(0, 0, 1.55, 10, 8.45, 3.5, chassis);
    t.base.disc(0, 0, 0.9, 7.8, 6.3, 1, recess);
    for (const side of [-1, 1]) for (const x of [-5.8, 5.8]) foot(t.base, x, side * 7.2);
    t.shell.bevel(-1.4, 0, 4.7, 14.3, 13.4, 4.2, 0x945d31);
    t.shell.bevel(-2.2, 0, 8.5, 10.8, 10.8, 2.65, 0xc6904a);
    grille(t.shell, -3.1, 11.18);
    t.shell.box(-5.8, -3.7, 10.8, 1.1, 1.05, 4.3, steel);
    t.shell.disc(-5.8, -3.7, 14.58, 1.15, 1.13, 1.1, 0xedbc70, 6);
    t.tool.tube(7.45, 0, 8.65, 9.25, 1.65, steel);
    t.tool.tube(5.15, 0, 8.65, 3.3, 2.10, chassis);
    t.tool.tube(12.28, 0, 8.65, 2.75, 2.26, chassis);
    t.tool.tube(13.44, 0, 8.65, 0.65, 1.26, recess);
    t.signal.tube(13.85, 0, 8.65, 1.1, 1.11, 0xffe09b);
}

function armored(t: RigGeometry): void {
    for (const side of [-1, 1]) track(t.base, side * 8.15, 18.6);
    t.shell.bevel(-2.75, 0, 3.65, 18.2, 13.9, 5.2, 0x536761);
    t.shell.bevel(-3.25, 0, 8.55, 12.1, 11, 2.8, 0x829a8f);
    grille(t.shell, -4.4, 11.38);
    t.shell.box(-11.88, 0, 5.38, 0.8, 7.8, 2.15, recess);
    t.shell.box(-12.1, 0, 6.62, 0.8, 4.3, 0.94, 0xd9864d);
    eye(t.shell, 4.5, 8.8, 5.5, 0xeece88);
    // The front arc uses overlapping shutters with thick ribs; the rear stays exposed.
    for (const side of [-1, 1]) {
        t.tool.bevel(8.8, side * 4.8, 2.0, 5.15, 9.9, 9.95, 0x788e84);
        t.tool.bevel(10.78, side * 4.95, 3.0, 2.4, 8.65, 7.7, steel);
        t.tool.box(12.0, side * 4.65, 5.4, 0.96, 7.65, 1.35, 0xcfb17a);
    }
    t.signal.box(12.54, 0, 5.65, 0.62, 7.72, 0.85, 0xffe1a8);
}

function pursuer(t: RigGeometry): void {
    for (const side of [-1, 1]) {
        track(t.base, side * 6.8, 21.9);
        t.shell.bevel(-9, side * 4.15, 4.5, 7, 3.55, 4.9, chassis);
        t.shell.tube(-12.35, side * 4.15, 6.9, 2, 1.42, recess);
        t.signal.tube(-14.25, side * 4.15, 6.9, 3.55, 1.15, 0xe59346);
        t.signal.tube(-15.85, side * 4.15, 6.9, 1.9, 0.5, 0xffd591);
        t.tool.beam([7.1, side * 4.4, 3.1], [14.0, side * 5.5, 2.65], 2.6, 2.6, steel);
    }
    t.shell.bevel(-1.25, 0, 3.6, 18.6, 10.8, 4.65, 0x855139);
    t.shell.bevel(-2.2, 0, 7.75, 12.85, 9.55, 2.55, 0xca8951);
    t.shell.box(-6.6, -2.8, 9.9, 0.95, 0.9, 3.7, chassis);
    t.shell.disc(-6.6, -2.8, 13.1, 0.69, 0.69, 1.1, 0x8bd3c3, 6);
    eye(t.tool, 7.1, 4.55, 5.3, 0x8bd3c3);
}

function reclaimer(t: RigGeometry): void {
    for (const side of [-1, 1]) track(t.base, side * 8.0, 21.5);
    t.shell.bevel(-2.0, 0, 4.0, 19.6, 15.2, 4.85, 0x946037);
    t.shell.bevel(-6.2, 0, 8.7, 10.6, 13.6, 3.25, 0xb9824b);
    t.shell.tube(-4.8, 0, 11.85, 5.1, 2.0, chassis);
    t.shell.tube(-4.5, 0, 11.85, 2.5, 2.1, 0x9f8667);
    eye(t.shell, 3.2, 7.55, 5.3, 0xeabb72);
    t.tool.bevel(5.1, 0, 4.2, 5.8, 8.2, 3.5, chassis);
    t.tool.tube(8.8, 0, 6.5, 5.7, 1.14, steel);
    for (const side of [-1, 1]) {
        const jaw = side < 0 ? t.left : t.right;
        jaw.beam([4.0, side * 3.6, 7.0], [9.2, side * 7.35, 6.6], 2.8, 1.5, chassis);
        jaw.beam([9.1, side * 7.35, 6.6], [15.6, side * 7.55, 4.0], 3.4, 1.9, 0xcc9556);
        jaw.beam([15.6, side * 7.55, 4.05], [17.0, side * 4.6, 3.5], 2.65, 1.55, edge);
    }
    t.signal.tube(12, 0, 6.5, 1.5, 1.37, 0xffce79);
}

function jammer(t: RigGeometry): void {
    t.base.disc(0, 0, 1.2, 9.7, 9.1, 3.65, chassis);
    for (const side of [-1, 1]) for (const x of [-5.3, 5.3]) foot(t.base, x, side * 7.6);
    t.shell.bevel(-1, 0, 4.0, 16.2, 15.8, 5.0, 0x59435e);
    t.shell.bevel(-3.7, 0, 8.45, 9.5, 12.8, 2.75, 0x806093);
    eye(t.shell, 5.8, 5.1, 4.4, 0xfbafef);
    t.tool.disc(-1.3, 0, 10.9, 5.7, 5.5, 2.7, 0x463e56);
    t.tool.disc(-1.3, 0, 13.1, 4.1, 4.1, 1.9, steel);
    t.tool.disc(-1.3, 0, 15.0, 2.7, 2.7, 1.8, 0xb97dc8);
    for (const side of [-1, 1]) {
        const antenna = side < 0 ? t.left : t.right;
        antenna.beam([-1.4, side * 2.2, 12], [1.9, side * 6.9, 16.85], 1.65, 1.55, steel);
        antenna.bevel(2.85, side * 7.85, 16.25, 4.4, 2.5, 1.9, 0xa96caa);
        antenna.box(3.15, side * 7.92, 18.1, 2.4, 1.6, 0.9, 0xd9a1ec);
    }
    t.signal.disc(-1.3, 0, 16.8, 2.1, 2.1, 1.65, 0xf6a6f5, 6);
}

class RigGeometry {
    readonly base = new Geometry();
    readonly shell = new Geometry();
    readonly tool = new Geometry();
    readonly left = new Geometry();
    readonly right = new Geometry();
    readonly signal = new Geometry();
}

const builders: Readonly<Record<PrototypeRegularKind, (rig: RigGeometry) => void>> = {
    crawler: rig => walker(rig, false), ambusher: rig => walker(rig, true),
    turret, armored, pursuer, reclaimer, jammer,
};

type Part = keyof RigGeometry;
const parts: readonly Part[] = ['base', 'shell', 'tool', 'left', 'right', 'signal'];
type RigMeshes = Readonly<Partial<Record<Part, Mesh>>>;

export interface PrototypeRegularActor {
    readonly node: Node;
    setPose(pose: PrototypePoseName, ageTicks: number, phase?: number): void;
    setImpact(strength: number): void;
}

function ease(age: number, ticks: number): number {
    return 1 - (1 - Math.min(1, Math.max(0, age / ticks))) ** 2;
}

export class PrototypeRegularMeshes {
    private readonly material = new Material();
    private readonly impactMaterial = new Material();
    private readonly meshes = new Map<PrototypeRegularKind, RigMeshes>();

    constructor() {
        const defines = { USE_VERTEX_COLOR: true, USE_INSTANCING: true };
        this.material.initialize({ effectName: 'builtin-unlit', defines });
        this.impactMaterial.initialize({ effectName: 'builtin-unlit', defines });
        this.impactMaterial.setProperty('mainColor', new Color(255, 186, 174));
    }

    create(kind: PrototypeRegularKind, parent: Node, layer: number): PrototypeRegularActor {
        const mesh = this.meshFor(kind);
        const node = this.nodeAt(kind, parent, layer);
        const impact = this.nodeAt('impact', node, layer);
        const base = this.partAt('base', mesh, node, layer);
        const shell = this.partAt('shell', mesh, impact, layer);
        const tool = this.partAt('tool', mesh, shell, layer);
        const joints = kind === 'crawler' || kind === 'ambusher' ? node : tool;
        const left = this.partAt('left', mesh, joints, layer);
        const right = this.partAt('right', mesh, joints, layer);
        const signal = this.partAt('signal', mesh, tool, layer);
        let lastPose: PrototypePoseName | undefined;
        let lastAge = -1;
        let lastImpact = -1;

        const setPose = (pose: PrototypePoseName, ageTicks: number): void => {
            const time = pose === 'idle' ? 0 : ageTicks;
            if (lastPose === pose && lastAge === time) return;
            lastPose = pose;
            lastAge = time;
            const stride = pose === 'walk' ? Math.sin(time * Math.PI / 4.5) : 0;
            const brace = pose === 'windup' ? ease(time + 1, 8) : 0;
            const attack = pose === 'strike';
            const recover = pose === 'recover' ? 1 - ease(time, 7) : 0;
            const hit = pose === 'hit' ? 1 - ease(time, 6) : 0;
            const pulse = attack ? 0.72 + 0.28 * Math.cos(time * Math.PI / 4) : brace;
            let lift = 0, pitch = 0, travel = 0, sway = 0;

            switch (kind) {
            case 'crawler':
            case 'ambusher': {
                const concealed = kind === 'ambusher' && pose === 'windup';
                lift = Math.abs(stride) * 0.43 + (attack ? 1.85 : 0) - 0.7 * brace;
                pitch = (attack ? -7 : 0) + 5 * recover;
                travel = attack ? 3.6 : -brace * 1.2;
                left.setPosition(1.5 * stride, Math.max(0, stride) * 0.95, 0);
                right.setPosition(-1.5 * stride, Math.max(0, -stride) * 0.95, 0);
                const flatten = concealed ? 0.42 : 1;
                left.setScale(1, flatten, 1);
                right.setScale(1, flatten, 1);
                shell.setScale(1, flatten, 1);
                break;
            }
            case 'turret':
                lift = Math.abs(stride) * 0.18;
                travel = 1.75 * brace - (attack ? 4.6 * (1 - ease(time, 5)) : 0) - 0.75 * recover;
                pitch = attack ? -8 * (1 - ease(time, 5)) : 3 * brace;
                break;
            case 'armored':
                lift = Math.abs(stride) * 0.34 - 0.5 * brace + (attack ? 0.55 : 0);
                travel = 1.45 * brace + (attack ? 2.7 : 0) - 0.4 * recover;
                pitch = attack ? -4 : 0;
                break;
            case 'pursuer':
                lift = 0.35 * Math.abs(stride) + (attack ? 0.8 + 0.28 * Math.cos(time * Math.PI / 2) : 0);
                travel = attack ? 1.1 : 0;
                pitch = attack ? 5 : 0;
                break;
            case 'reclaimer': {
                lift = Math.abs(stride) * 0.38;
                travel = -0.75 * brace + (attack ? 3.2 : 0) - 1.35 * recover;
                const spread = 2.35 * brace - (attack ? 0.65 + 0.55 * pulse : 0);
                left.setPosition(0, 0, spread);
                right.setPosition(0, 0, -spread);
                break;
            }
            case 'jammer': {
                lift = Math.abs(stride) * 0.24;
                const extension = 1.55 * brace + (attack ? 2.1 : 0);
                const rib = (attack ? 2.0 + 0.42 * pulse : 1.62 * brace);
                left.setPosition(0, extension, rib);
                right.setPosition(0, extension, -rib);
                sway = attack ? 5.5 * Math.sin(time * Math.PI / 6) : 0;
                break;
            }
            }
            // Impact may overlap an attack. Keep the rig engaged while its chassis recoils.
            shell.setPosition(0, lift + 0.85 * hit, 0);
            shell.setRotationFromEuler(0, 0, pitch + 8 * hit);
            tool.setPosition(travel, 0, 0);
            tool.setRotationFromEuler(0, sway, 0);
            signal.active = attack || brace > 0.55;
            if (signal.active) signal.setScale(0.75 + 0.25 * pulse, 0.7 + 0.3 * pulse, 0.75 + 0.25 * pulse);
            if (mesh.base) base.setPosition(stride * 0.22, 0, 0);
        };

        const shellRenderer = shell.getComponent(MeshRenderer)!;
        const setImpact = (strength: number): void => {
            const amount = Math.min(1, Math.max(0, strength));
            if (lastImpact === amount) return;
            if ((lastImpact > 0.45) !== (amount > 0.45)) shellRenderer.setSharedMaterial(
                amount > 0.45 ? this.impactMaterial : this.material, 0);
            lastImpact = amount;
            impact.setPosition(-0.85 * amount, 0.35 * amount, 0);
            impact.setRotationFromEuler(0, 0, 4 * amount);
        };
        setPose('idle', 0);
        return { node, setPose, setImpact };
    }

    destroy(): void {
        for (const mesh of this.meshes.values()) for (const part of parts) mesh[part]?.destroy();
        this.meshes.clear();
        this.material.destroy();
        this.impactMaterial.destroy();
    }

    private meshFor(kind: PrototypeRegularKind): RigMeshes {
        const cached = this.meshes.get(kind);
        if (cached) return cached;
        const geometry = new RigGeometry();
        builders[kind](geometry);
        const mesh = Object.fromEntries(parts.map(part => [part, geometry[part].mesh()])) as RigMeshes;
        this.meshes.set(kind, mesh);
        return mesh;
    }

    private nodeAt(name: string, parent: Node, layer: number): Node {
        const node = new Node(name);
        node.layer = layer;
        parent.addChild(node);
        return node;
    }

    private partAt(part: Part, meshes: RigMeshes, parent: Node, layer: number): Node {
        const node = this.nodeAt(part, parent, layer);
        const mesh = meshes[part];
        if (mesh) {
            const renderer = node.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(this.material, 0);
        }
        return node;
    }
}
