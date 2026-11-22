import { Material, Mesh, MeshRenderer, Node, utils } from 'cc';

export type ChargerPose = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'hit';

type Point = [x: number, y: number, z: number];
type ArmourSection = [rear: number, nose: number, rearWidth: number, noseWidth: number, height: number];

// Original project model from art/workshop/bake-enemies.cjs, with its parts
// split for runtime animation. Authoring axes are x forward, y across, z up.
const rubber = 0x283039;
const recessed = 0x29333b;
const castIron = 0x45525d;
const chassis = 0x35434b;
const armour = 0x65747a;
const steel = 0x7b8b8e;
const machined = 0xb0b9b5;
const primer = 0x9c542a;
const enamel = 0xc38939;
const edge = 0xe5b474;
const oxidized = 0x6e9b93;

class ChargerGeometry {
    private readonly positions: number[] = [];
    private readonly colors: number[] = [];
    private readonly indices: number[] = [];

    bevel(x: number, y: number, z: number, length: number, width: number, height: number,
        color: number, corners = 1.6, slope = 0): void {
        const outline = (a: number, b: number, pz: number): Point[] => {
            const chamfer = Math.min(corners, a / 2, b / 2);
            return [[a, -b + chamfer], [a, b - chamfer], [a - chamfer, b], [-a + chamfer, b],
                [-a, b - chamfer], [-a, -b + chamfer], [-a + chamfer, -b], [a - chamfer, -b]]
                .map(([px, py]) => [x + px, y + py, pz]);
        };
        const floor = outline(length / 2, width / 2, z);
        const roof = outline(length / 2 - slope, width / 2 - slope, z + height);
        this.solid(floor, roof, color);
    }

    armour(lower: ArmourSection, upper: ArmourSection, color: number, corner: number): void {
        const outline = ([rear, nose, rearWidth, noseWidth, z]: ArmourSection): Point[] => [
            [nose, -noseWidth + corner, z], [nose, noseWidth - corner, z],
            [nose - corner, noseWidth, z], [rear + corner, rearWidth, z],
            [rear, rearWidth - corner, z], [rear, -rearWidth + corner, z],
            [rear + corner, -rearWidth, z], [nose - corner, -noseWidth, z],
        ];
        this.solid(outline(lower), outline(upper), color);
    }

    box(x: number, y: number, z: number, length: number, width: number, height: number, color: number): void {
        const minX = x - length / 2;
        const maxX = x + length / 2;
        const minY = y - width / 2;
        const maxY = y + width / 2;
        const floor: Point[] = [[maxX, minY, z], [maxX, maxY, z], [minX, maxY, z], [minX, minY, z]];
        this.solid(floor, floor.map(([px, py]) => [px, py, z + height]), color);
    }

    cylinder(x: number, y: number, z: number, radius: number, length: number, color: number,
        axis: 'x' | 'y', sides = 8): void {
        const ring = (offset: number): Point[] => Array.from({ length: sides }, (_, index) => {
            const angle = index * 2 * Math.PI / sides;
            const horizontal = Math.cos(angle) * radius;
            const height = z + Math.sin(angle) * radius;
            return axis === 'x' ? [x + offset, y + horizontal, height] : [x - horizontal, y + offset, height];
        });
        this.solid(ring(-length / 2), ring(length / 2), color);
    }

    trackLoop(y: number): void {
        // Ten-point belt around two rollers. Model the lip on both sides to expose the running gear.
        const profile = (side: number, radius: number): Point[] => [-1, 1].flatMap(end =>
            Array.from({ length: 5 }, (_, index): Point => {
                const angle = (index - 2 + (end < 0 ? 4 : 0)) * Math.PI / 4;
                return [end * 9.5 + Math.cos(angle) * radius, side, 3.2 + Math.sin(angle) * radius];
            }));
        const outerNear = profile(y - 2.1, 3.15), outerFar = profile(y + 2.1, 3.15);
        const lipNear = profile(y - 2.34, 2.88), lipFar = profile(y + 2.34, 2.88);
        const innerNear = profile(y - 2.34, 2.32), innerFar = profile(y + 2.34, 2.32);
        for (let i = 0; i < outerNear.length; i++) {
            const next = (i + 1) % outerNear.length;
            this.face([outerNear[i], outerFar[i], outerFar[next], outerNear[next]], rubber);
            this.face([innerFar[i], innerNear[i], innerNear[next], innerFar[next]], recessed);
            this.face([outerNear[i], outerNear[next], lipNear[next], lipNear[i]], armour);
            this.face([outerFar[next], outerFar[i], lipFar[i], lipFar[next]], armour);
            this.face([lipNear[i], lipNear[next], innerNear[next], innerNear[i]], castIron);
            this.face([lipFar[next], lipFar[i], innerFar[i], innerFar[next]], castIron);
        }
    }

    trackShoe(x: number, y: number): void {
        const profile = (side: number): Point[] => [
            [x - 1.21, side, 6.21], [x - 1.21, side, 6.61], [x - 0.88, side, 6.97],
            [x + 0.88, side, 6.97], [x + 1.21, side, 6.61], [x + 1.21, side, 6.21],
        ];
        this.solid(profile(y - 2.22), profile(y + 2.22), armour);
        this.face([[x - 0.65, y - 1.26, 6.98], [x - 0.02, y - 1.26, 6.98],
            [x - 0.02, y + 1.26, 6.98], [x - 0.65, y + 1.26, 6.98]], castIron);
    }

    private solid(floor: Point[], roof: Point[], color: number): void {
        for (let i = 0; i < floor.length; i++) {
            const next = (i + 1) % floor.length;
            this.face([floor[i], floor[next], roof[next], roof[i]], color);
        }
        this.face(roof, color);
        this.face(floor.reverse(), color);
    }

    face(points: Point[], color: number): void {
        const [origin, second, third] = points;
        const ax = second[0] - origin[0];
        const ay = second[1] - origin[1];
        const az = second[2] - origin[2];
        const bx = third[0] - origin[0];
        const by = third[1] - origin[1];
        const bz = third[2] - origin[2];
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const facingLight = (-nx * 0.45 - ny * 0.31 + nz * 0.83) / Math.hypot(nx, ny, nz);
        const light = 0.64 + 0.35 * Math.max(-0.27, facingLight);
        const base = this.positions.length / 3;
        const red = ((color >> 16) & 255) * light / 255;
        const green = ((color >> 8) & 255) * light / 255;
        const blue = (color & 255) * light / 255;
        for (const [x, y, z] of points) {
            this.positions.push(x, z, -y);
            this.colors.push(red, green, blue, 1);
        }
        for (let index = 1; index + 1 < points.length; index++) {
            this.indices.push(base, base + index, base + index + 1);
        }
    }

    mesh(): Mesh {
        return utils.createMesh({ positions: this.positions, colors: this.colors, indices: this.indices },
            undefined, { calculateBounds: true });
    }
}

function tracks(): Mesh {
    const geometry = new ChargerGeometry();
    geometry.bevel(-0.4, 0, 1.2, 21, 12.6, 3.7, chassis, 1.7);
    for (const side of [-1, 1]) {
        const y = side * 9;
        geometry.trackLoop(y);
        geometry.bevel(0, y, 2.15, 20, 2.65, 1.68, recessed, 0.75);
        for (const x of [-9.5, -3.15, 3.15, 9.5]) {
            const axle = Math.abs(x) > 9;
            geometry.cylinder(x, y, 3.2, axle ? 2.3 : 1.93, 4.5, rubber, 'y');
            geometry.cylinder(x, y + side * 2.31, 3.2, axle ? 1.91 : 1.52, 0.36, steel, 'y');
            geometry.cylinder(x, y + side * 2.54, 3.2, axle ? 1.38 : 1.06, 0.18, recessed, 'y');
            geometry.cylinder(x, y + side * 2.68, 3.2, axle ? 0.87 : 0.64, 0.38, armour, 'y', 6);
            if (axle) geometry.cylinder(x, y + side * 2.91, 3.2, 0.46, 0.18, machined, 'y', 6);
        }
    }
    return geometry.mesh();
}

function treads(): Mesh {
    const geometry = new ChargerGeometry();
    for (const y of [-9, 9]) {
        for (let x = -9; x <= 9; x += 3) geometry.trackShoe(x, y);
    }
    return geometry.mesh();
}

function body(cover: number, highlight: number): Mesh {
    const geometry = new ChargerGeometry();
    geometry.armour([-12, 10.8, 5.9, 5.3, 3.3], [-12.55, 10.1, 6.78, 5.8, 6.8], chassis, 1.65);
    geometry.armour([-12, 10.1, 6.75, 5.85, 6.35], [-10.6, 6.35, 6.28, 4.8, 9.68], armour, 1.45);
    geometry.armour([-10.55, 6.35, 6.28, 4.8, 9.54], [-9.75, 5.2, 5.51, 4.14, 10.54], chassis, 1.04);
    geometry.bevel(-4.65, 0, 10.41, 8.15, 7.42, 0.49, steel, 0.65, 0.14);
    geometry.bevel(-4.65, 0, 10.86, 7.35, 6.68, 0.28, recessed, 0.56);
    for (const x of [-7.4, -5.61, -3.82, -2.03]) {
        geometry.bevel(x, 0, 11.10, 0.75, 5.32, 0.43, armour, 0.24, 0.12);
    }
    geometry.armour([-0.35, 5.15, 3.65, 3.7, 10.40], [0.1, 4.65, 3.1, 3.18, 11.25], cover, 0.62);
    geometry.bevel(2.35, 0, 11.24, 2.5, 4.28, 0.31, highlight, 0.44);
    geometry.bevel(2.35, 0, 11.53, 1.37, 1.34, 0.36, recessed, 0.2, 0.15);
    geometry.box(2.42, 0, 11.88, 0.55, 0.64, 0.13, oxidized);

    for (const side of [-1, 1]) {
        const panelY = side * 5.64, pistonY = side * 4.28;
        geometry.bevel(-4.0, panelY, 8.4, 11.98, 2.6, 1.42, recessed, 0.76, 0.2);
        geometry.bevel(-4.2, panelY, 9.64, 10.61, 2.13, 0.41, cover, 0.6, 0.12);
        geometry.box(-4.6, panelY, 10.05, 6.55, 0.61, 0.12, highlight);
        for (const x of [-8.7, 0.2]) geometry.box(x, panelY, 10.03, 0.58, 0.65, 0.23, machined);
        geometry.bevel(6.95, pistonY, 5.14, 5.2, 3.78, 1.31, castIron, 0.51, 0.2);
        geometry.cylinder(7.72, pistonY, 7.55, 1.34, 4.48, recessed, 'x');
        geometry.cylinder(8.8, pistonY, 7.55, 1.21, 2.05, steel, 'x');
        geometry.cylinder(9.9, pistonY, 7.55, 1.48, 0.82, machined, 'x');
        geometry.cylinder(10.39, pistonY, 7.55, 0.94, 0.2, castIron, 'x');
        geometry.bevel(-11.71, side * 3.6, 4.75, 2.63, 3.3, 2.13, recessed, 0.47);
        geometry.cylinder(-12.72, side * 3.6, 6.3, 1.20, 1.24, armour, 'x');
        geometry.cylinder(-13.41, side * 3.6, 6.3, 0.77, 0.25, 0xae583d, 'x');
    }
    return geometry.mesh();
}

function ram(lamp: number): Mesh {
    const geometry = new ChargerGeometry();
    for (const y of [-4.28, 4.28]) {
        geometry.cylinder(10.71, y, 7.55, 0.68, 8.0, machined, 'x');
        geometry.cylinder(12.87, y, 7.55, 0.9, 1.25, steel, 'x');
        geometry.bevel(13.59, y, 5.79, 2.92, 2.66, 2.85, castIron, 0.45);
        geometry.cylinder(13.72, y, 7.74, 0.77, 2.68, armour, 'y', 6);
    }
    geometry.armour([12.08, 17.77, 5.82, 7.79, 3.08], [13.28, 17.67, 7.11, 7.73, 7.76], armour, 1.36);
    geometry.armour([14.33, 17.9, 7.53, 8.08, 3.38], [14.78, 17.38, 7.5, 7.75, 6.24], steel, 0.87);
    geometry.armour([13.55, 17.42, 7.05, 7.49, 7.41], [14.0, 16.90, 6.79, 7.24, 8.54], machined, 0.81);
    geometry.bevel(15.35, 0, 8.52, 2.15, 6.82, 0.26, chassis, 0.39);
    geometry.bevel(15.35, 0, 8.75, 1.54, 5.97, 0.13, primer, 0.28);
    for (const [from, to] of [[-2.92, -1.63], [-0.74, 0.54], [1.43, 2.74]]) {
        geometry.face([[14.64, from, 8.90], [16.03, from + 0.62, 8.90],
            [16.03, to + 0.23, 8.90], [14.64, to, 8.90]], enamel);
    }
    for (const side of [-1, 1]) {
        const y = 5.42 * side;
        geometry.bevel(15.48, y, 8.34, 2.25, 2.77, 0.63, chassis, 0.4);
        geometry.bevel(15.65, y, 8.91, 1.21, 1.98, 0.42, lamp, 0.22);
        geometry.box(16.4, y, 8.9, 0.26, 2.13, 0.35, steel);
        geometry.cylinder(17.86, side * 6.37, 4.72, 0.58, 0.28, machined, 'x', 6);
    }
    return geometry.mesh();
}

function exhaust(): Mesh {
    const geometry = new ChargerGeometry();
    for (const y of [-3.6, 3.6]) {
        geometry.bevel(-15.3, y, 5.6, 5.8, 1.9, 1.4, 0xc87535, 0.62);
        geometry.bevel(-13.75, y, 5.9, 3.15, 1.33, 1.4, 0xffcb78, 0.48);
    }
    return geometry.mesh();
}

export interface PrototypeChargerActor {
    readonly node: Node;
    setPose(pose: ChargerPose, ageTicks: number): void;
    setImpact(strength: number): void;
}

function easeOut(ticks: number, duration: number): number {
    const remainder = 1 - Math.min(1, Math.max(0, ticks / duration));
    return 1 - remainder * remainder;
}

/** Applies the encounter poses to a charger model's mechanical parts. */
export function driveChargerRig(node: Node, tread: Node, shell: Node, bumper: Node, jets: Node,
    showPose: (pose: ChargerPose) => void): PrototypeChargerActor {
    const impactPivot = new Node('Impact suspension');
    impactPivot.layer = node.layer;
    shell.parent!.addChild(impactPivot);
    shell.setParent(impactPivot);
    const treadRest = tread.position.clone();
    const shellRest = shell.position.clone();
    const shellAngle = shell.eulerAngles.clone();
    const bumperRest = bumper.position.clone();
    const jetsRest = jets.scale.clone();
    let lastPose: ChargerPose | undefined;
    let lastAge = -1;
    let lastImpact = 0;

    const setPose = (pose: ChargerPose, ageTicks: number): void => {
        if (pose === 'idle') ageTicks = 0;
        if (lastPose === pose && lastAge === ageTicks) return;
        if (lastPose !== pose) {
            showPose(pose);
            jets.active = pose === 'strike';
        }
        lastPose = pose;
        lastAge = ageTicks;
        let rise = 0;
        let piston = 0;
        let pitch = 0;
        let gait = 0;
        switch (pose) {
        case 'walk':
            gait = Math.sin(ageTicks * Math.PI / 4);
            break;
        case 'windup': {
            const brace = easeOut(ageTicks + 1, 8);
            rise = -1.4 * brace;
            piston = -2 * brace;
            pitch = -3 * brace;
            break;
        }
        case 'strike':
            gait = Math.sin(ageTicks * Math.PI / 2);
            rise = 1.2;
            piston = 4;
            pitch = 4 * (1 - easeOut(ageTicks, 7));
            jets.setScale(jetsRest.x * (0.9 + 0.1 * Math.cos(ageTicks * Math.PI / 2)), jetsRest.y, jetsRest.z);
            break;
        case 'recover': {
            const settle = 1 - easeOut(ageTicks, 9);
            rise = -0.6 * settle;
            piston = -4 * settle;
            pitch = -3 * settle;
            break;
        }
        case 'hit': {
            const recoil = 1 - easeOut(ageTicks, 6);
            rise = 1.3 * recoil;
            piston = -recoil;
            pitch = 9 * recoil;
            break;
        }
        }
        tread.setPosition(treadRest.x + gait * 0.6, treadRest.y, treadRest.z);
        shell.setPosition(shellRest.x, shellRest.y + rise, shellRest.z);
        shell.setRotationFromEuler(shellAngle.x, shellAngle.y, shellAngle.z + pitch);
        bumper.setPosition(bumperRest.x + piston * 0.6, bumperRest.y, bumperRest.z);
    };
    const setImpact = (strength: number): void => {
        const amount = Math.min(1, Math.max(0, strength));
        if (lastImpact === amount) return;
        lastImpact = amount;
        impactPivot.setPosition(-0.8 * amount, 0.65 * amount, 0);
        impactPivot.setRotationFromEuler(0, 0, 6 * amount);
    };
    setPose('idle', 0);
    return { node, setPose, setImpact };
}

/** Owns the shared mesh and material assets for a set of pooled charger nodes. */
export class PrototypeChargerMeshes {
    private readonly material = new Material();
    private readonly trackMesh = tracks();
    private readonly treadMesh = treads();
    private readonly bodyMesh = body(enamel, edge);
    private readonly hurtBodyMesh = body(0xcf8d71, 0xffc6a3);
    private readonly ramMesh = ram(0xc4914f);
    private readonly litRamMesh = ram(0xffedba);
    private readonly exhaustMesh = exhaust();

    constructor() {
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: true } });
    }

    create(parent: Node, layer: number): PrototypeChargerActor {
        const node = new Node('Prototype charger');
        node.layer = layer;
        parent.addChild(node);
        const part = (name: string, mesh: Mesh, container = node): MeshRenderer => {
            const child = new Node(name);
            child.layer = layer;
            container.addChild(child);
            const renderer = child.addComponent(MeshRenderer);
            renderer.mesh = mesh;
            renderer.setSharedMaterial(this.material, 0);
            return renderer;
        };
        part('Track housing', this.trackMesh);
        const tread = part('Track links', this.treadMesh).node;
        const shell = part('Chassis', this.bodyMesh);
        const bumper = part('Ram', this.ramMesh, shell.node);
        const jets = part('Thrusters', this.exhaustMesh).node;
        return driveChargerRig(node, tread, shell.node, bumper.node, jets, pose => {
            const shellMesh = pose === 'hit' ? this.hurtBodyMesh : this.bodyMesh;
            const bumperMesh = pose === 'windup' || pose === 'strike' ? this.litRamMesh : this.ramMesh;
            if (shell.mesh !== shellMesh) shell.mesh = shellMesh;
            if (bumper.mesh !== bumperMesh) bumper.mesh = bumperMesh;
        });
    }

    destroy(): void {
        for (const mesh of [this.trackMesh, this.treadMesh, this.bodyMesh, this.hurtBodyMesh,
            this.ramMesh, this.litRamMesh, this.exhaustMesh]) mesh.destroy();
        this.material.destroy();
    }
}
