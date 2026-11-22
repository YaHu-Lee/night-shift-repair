import { Color, JsonAsset, Material, Mesh, MeshRenderer, Node, Prefab, Quat, Vec3, isValid, primitives, resources, sys, utils } from 'cc';
import { DEBUG } from 'cc/env';
import { isTool, TOOLS } from '../m1/content';
import type { ToolId } from '../m1/content';
import { PrototypeWorkshopLight } from './PrototypeWorkshopLight';

type Pose = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'hit';
type Point = [number, number, number];
type Tint = [number, number, number];
type Geometry = { positions: number[]; colors: number[]; indices: number[] };
type UnpaintedGeometry = { positions: number[]; normals: number[]; indices: number[] };
type Reconstruction = { head: Geometry; torso: Geometry };
const reconstructionPath = 'prototype3d/characters/mechanic-ai';
const detailedModelPath = 'prototype3d/characters/mechanic-dcc/mechanic-dcc';
const weaponModelPath = 'prototype3d/weapons/weapons-dcc/weapons-dcc';
const rigParts = ['Head', 'Torso', 'ShoulderMinus', 'ShoulderPlus', 'ForearmMinus', 'ForearmPlus',
    'ThighMinus', 'ThighPlus', 'ShinMinus', 'ShinPlus'] as const;
const sides = ['Minus', 'Plus'] as const;
type RigPart = typeof rigParts[number];
type DetailedPart = { mesh: Mesh; material: Material };
type PendingMechanic = { node: Node; renderers: Map<RigPart, MeshRenderer> };

function detailedParts(prefab: Prefab): Map<RigPart, DetailedPart> | undefined {
    const parts = new Map<RigPart, DetailedPart>();
    prefab.data.walk(node => {
        if (!rigParts.includes(node.name as RigPart)) return;
        // Exported motion pivots keep one identity-transformed mesh child per part.
        const renderer = node.getComponent(MeshRenderer)
            ?? node.children.map(child => child.getComponent(MeshRenderer)).find(Boolean);
        const mesh = renderer?.mesh;
        const material = renderer?.getSharedMaterial(0);
        if (mesh && material) parts.set(node.name as RigPart, { mesh, material });
    });
    return parts.size === rigParts.length ? parts : undefined;
}

type Part = {
    shape: 'box' | 'round' | 'bevel' | 'cylinder' | 'helmet' | 'visor' | 'oval' | 'sleeve' | 'boot';
    center: Point;
    size: Point;
    material: MaterialName;
    angle?: number;
};

const palette = {
    canvas: '#526c69', canvasLight: '#667e73', canvasSeam: '#425753', thread: '#85918a',
    rubber: '#373e40', boot: '#444c4b', toe: '#5f665e', leather: '#6c5c48',
    skin: '#bd8b65', helmet: '#bc9c59', rim: '#947942', reflective: '#c8b078',
    lamp: '#fff0b5', steel: '#9caaa8', nickel: '#ccd5cb', oxidized: '#58696e',
    case: '#485456', glass: '#a2b7a9', lens: '#566d69', cuff: '#5d6662', band: '#77867a',
    copper: '#a26545', ceramic: '#c4ab7e', coil: '#527f81', weld: '#da8150',
    arc: '#b0e9e6', pulse: '#62a5a8', soot: '#2c363a',
};
type MaterialName = keyof typeof palette;

function materialTint(material: MaterialName): Tint {
    const color = new Color().fromHEX(palette[material]);
    return [color.r / 255, color.g / 255, color.b / 255];
}

function part(shape: Part['shape'], center: Point, size: Point, material: MaterialName, angle = 0): Part {
    return { shape, center, size, material, angle };
}

const headEquipment = [
    part('visor', [0.018, 0.064, 0], [0.834, 0.048, 0.740], 'rim'),
    part('visor', [0.020, 0.082, 0], [0.834, 0.026, 0.740], 'helmet'),
    part('helmet', [0.003, 0.091, 0], [0.735, 0.316, 0.686], 'helmet'),
    part('oval', [0.012, 0.394, 0], [0.337, 0.037, 0.086], 'rim'),
    part('oval', [0.012, 0.410, 0], [0.280, 0.022, 0.059], 'helmet'),
    part('bevel', [0.316, 0.108, 0], [0.187, 0.063, 0.232], 'rubber', 13),
    part('bevel', [0.371, 0.159, 0], [0.166, 0.124, 0.199], 'case', 10),
    part('cylinder', [0.435, 0.157, 0], [0.127, 0.059, 0.143], 'oxidized', 90),
    part('cylinder', [0.466, 0.157, 0], [0.112, 0.026, 0.126], 'steel', 90),
    part('cylinder', [0.479, 0.157, 0], [0.092, 0.010, 0.104], 'glass', 90),
    part('cylinder', [0.484, 0.157, 0], [0.076, 0.008, 0.084], 'lamp', 90),
    part('bevel', [-0.326, 0.156, 0], [0.068, 0.064, 0.212], 'rim'),
    part('bevel', [-0.367, 0.157, 0], [0.024, 0.037, 0.162], 'reflective'),
    ...[-1, 1].flatMap((side): Part[] => {
        const z = side * 0.088;
        const faceOffset = side * 0.012;
        return [
            part('oval', [-0.028, -0.049, side * 0.248], [0.372, 0.028, 0.043], 'rubber', -4),
            part('bevel', [0.118, -0.041, side * 0.223], [0.073, 0.024, 0.047], 'oxidized', -8),
            part('oval', [0.199, -0.044, side * 0.182], [0.131, 0.022, 0.076], 'rubber', 1),
            part('oval', [0.251 + faceOffset, -0.045, z], [0.087, 0.174, 0.161], 'soot', 86),
            part('oval', [0.326 + faceOffset, -0.041, z], [0.081, 0.027, 0.147], 'oxidized', 86),
            part('oval', [0.338 + faceOffset, -0.042, z], [0.060, 0.016, 0.115], 'lens', 86),
            part('oval', [0.346 + faceOffset, -0.025, z - 0.015], [0.005, 0.005, 0.044], 'glass', 86),
        ];
    }),
    part('oval', [0.319, -0.037, 0], [0.043, 0.027, 0.067], 'rubber', 17),
    part('round', [0.270, -0.108, 0.005], [0.132, 0.121, 0.124], 'skin'),
];
const torsoEquipment = [
    // Collar rises into the reconstruction; its two fitted lips hide the captured neck cut.
    part('sleeve', [0.027, 0.552, 0], [0.419, 0.182, 0.396], 'canvasSeam', -8),
    part('oval', [0.032, 0.621, 0], [0.367, 0.042, 0.355], 'canvasLight', -8),
    part('round', [0.091, 0.653, 0], [0.261, 0.153, 0.272], 'skin', -7),
    part('sleeve', [0.020, 0.007, 0], [0.683, 0.186, 0.655], 'canvas'),
    part('visor', [0.016, 0.062, 0], [0.695, 0.081, 0.610], 'canvasSeam'),
    part('bevel', [0.352, 0.069, 0.048], [0.067, 0.078, 0.142], 'case'),
    part('bevel', [0.383, 0.069, 0.048], [0.020, 0.049, 0.109], 'oxidized'),
    part('bevel', [0.394, 0.068, 0.048], [0.011, 0.020, 0.074], 'steel'),
    part('bevel', [-0.373, 0.280, 0.002], [0.232, 0.481, 0.466], 'canvasSeam', -6),
    part('bevel', [-0.474, 0.303, 0.002], [0.098, 0.367, 0.401], 'boot', -6),
    part('bevel', [-0.520, 0.288, 0.002], [0.039, 0.059, 0.276], 'rim', -6),
    part('bevel', [-0.538, 0.288, 0.002], [0.013, 0.027, 0.230], 'reflective', -6),
    part('bevel', [-0.518, 0.389, 0.002], [0.031, 0.045, 0.290], 'cuff', -6),
    part('bevel', [-0.521, 0.210, -0.144], [0.060, 0.119, 0.048], 'soot', -6),
    part('bevel', [-0.521, 0.210, 0.144], [0.060, 0.119, 0.048], 'soot', -6),
    part('bevel', [-0.470, 0.401, -0.203], [0.113, 0.157, 0.082], 'case', -6),
    part('bevel', [-0.470, 0.401, 0.203], [0.113, 0.157, 0.082], 'case', -6),
];

const head = [
    part('round', [-0.015, -0.048, 0], [0.64, 0.39, 0.596], 'rubber'),
    part('round', [0.103, -0.075, 0], [0.55, 0.317, 0.50], 'skin'),
    ...headEquipment,
];
const torso = [
    part('sleeve', [0.015, 0.236, 0], [0.659, 0.591, 0.632], 'canvas'),
    part('oval', [0.020, 0.449, 0], [0.594, 0.263, 0.643], 'canvas'),
    part('bevel', [0.295, 0.33, 0], [0.028, 0.37, 0.039], 'canvasSeam', -4),
    part('bevel', [0.282, 0.257, -0.133], [0.073, 0.103, 0.143], 'canvasLight', -4),
    part('bevel', [0.282, 0.257, 0.133], [0.073, 0.103, 0.143], 'canvasLight', -4),
    ...torsoEquipment,
];
const shoulder = [
    part('sleeve', [0.004, -0.102, 0], [0.291, 0.326, 0.288], 'canvas'),
    part('oval', [-0.012, 0.015, 0], [0.255, 0.124, 0.269], 'canvas', 7),
    part('oval', [0.011, -0.193, 0], [0.275, 0.063, 0.272], 'canvasSeam', -6),
    part('oval', [0.013, -0.194, 0], [0.280, 0.029, 0.278], 'reflective', -6),
    part('oval', [0.013, -0.231, 0], [0.243, 0.091, 0.241], 'canvas', -6),
];
const forearm = [
    part('sleeve', [0.016, -0.061, 0], [0.234, 0.245, 0.229], 'canvas', 3),
    part('oval', [0.026, -0.160, 0], [0.228, 0.064, 0.226], 'canvasSeam'),
    part('oval', [0.031, -0.176, 0], [0.213, 0.040, 0.208], 'cuff'),
    part('oval', [0.050, -0.227, 0], [0.182, 0.163, 0.194], 'boot', 11),
    part('oval', [-0.016, -0.234, 0], [0.063, 0.116, 0.175], 'boot', 9),
    part('oval', [0.114, -0.211, -0.069], [0.095, 0.117, 0.073], 'leather', 21),
    ...[-0.061, -0.020, 0.021, 0.061].map((z, index) =>
        part('oval', [0.111, -0.264 - (index === 3 ? 0.009 : 0), z], [0.104, 0.067, 0.049], 'leather', -20)),
];
const wrenchHandle = [
    part('bevel', [0.097, -0.120, 0], [0.099, 0.416, 0.088], 'oxidized', 9),
    part('bevel', [0.077, -0.029, 0], [0.108, 0.191, 0.111], 'rubber', 9),
    part('bevel', [0.064, 0.053, 0], [0.114, 0.035, 0.115], 'band', 9),
    part('bevel', [0.086, -0.103, 0], [0.107, 0.021, 0.108], 'reflective', 9),
    part('bevel', [0.124, -0.277, 0], [0.146, 0.106, 0.119], 'steel', 13),
];
const wrenchProfile = [
    ...wrenchHandle,
    part('bevel', [0.091, -0.359, 0], [0.152, 0.114, 0.135], 'steel', -11),
    part('bevel', [0.203, -0.377, 0], [0.146, 0.101, 0.125], 'oxidized', -6),
    part('bevel', [0.283, -0.413, 0], [0.083, 0.119, 0.113], 'steel', 19),
    part('bevel', [0.297, -0.469, 0], [0.092, 0.119, 0.117], 'nickel', 23),
    part('bevel', [0.055, -0.442, 0], [0.103, 0.168, 0.137], 'steel', -19),
    part('bevel', [0.035, -0.512, 0], [0.079, 0.071, 0.129], 'nickel', -11),
    part('cylinder', [0.174, -0.352, 0], [0.076, 0.083, 0.156], 'soot', 8),
    ...[-0.379, -0.352, -0.325].map(y =>
        part('cylinder', [0.174 + (y + 0.352) * 0.14, y, 0], [0.081, 0.017, 0.171], 'band', 8)),
    ...[-0.070, 0.070].map(z => part('box', [0.106, -0.372, z], [0.059, 0.019, 0.010], 'nickel', -15)),
];

const gripOffset: Point = [0.070, -0.235, 0];

function fromWrist(parts: Part[]): Part[] {
    return parts.map(piece => ({ ...piece, center: [
        piece.center[0] - gripOffset[0], piece.center[1] - gripOffset[1], piece.center[2] - gripOffset[2],
    ] }));
}

type Action = 'swing' | 'hook' | 'shot' | 'hydraulic' | 'spray' | 'burst' | 'pulse' | 'pull';
interface ToolArt {
    readonly parts: Part[];
    readonly action: Action;
    readonly indicator?: Point;
    readonly hot?: boolean;
}

const triggerGrip = [
    part('bevel', [-0.044, -0.016, 0], [0.126, 0.231, 0.135], 'rubber', 13),
    part('bevel', [0.049, -0.064, 0], [0.146, 0.064, 0.155], 'oxidized'),
];
const shortCarriage = [
    ...triggerGrip,
    part('bevel', [0.146, 0.133, 0], [0.421, 0.218, 0.192], 'case'),
    part('bevel', [0.119, 0.243, 0], [0.304, 0.057, 0.137], 'nickel'),
    part('bevel', [0.289, 0.116, 0], [0.179, 0.247, 0.226], 'oxidized'),
];
const lanceBase = [
    ...triggerGrip,
    part('bevel', [0.195, 0.119, 0], [0.544, 0.205, 0.225], 'case'),
    part('bevel', [0.295, 0.119, 0], [0.439, 0.116, 0.174], 'nickel'),
    part('cylinder', [0.489, 0.119, 0], [0.177, 0.174, 0.178], 'oxidized', 90),
];
const coilGrip = [
    part('bevel', [-0.037, -0.011, 0], [0.177, 0.260, 0.146], 'rubber', 8),
    part('bevel', [0.136, -0.063, 0], [0.407, 0.094, 0.222], 'case'),
    part('cylinder', [0.166, 0.075, 0], [0.298, 0.180, 0.290], 'oxidized'),
];

const tools: Record<ToolId, ToolArt> = {
    wrench: {
        action: 'swing',
        parts: fromWrist(wrenchProfile),
    },
    bypass_wrench: {
        action: 'hook',
        parts: fromWrist([
            ...wrenchHandle,
            part('bevel', [0.122, -0.253, 0], [0.143, 0.181, 0.149], 'copper', 8),
            part('bevel', [0.104, -0.182, 0], [0.145, 0.037, 0.153], 'ceramic', 8),
            part('bevel', [0.147, -0.355, 0], [0.247, 0.119, 0.174], 'case', -14),
            part('bevel', [0.294, -0.411, 0], [0.117, 0.130, 0.145], 'copper', 25),
            part('bevel', [0.314, -0.482, 0], [0.110, 0.089, 0.139], 'nickel', 21),
            part('bevel', [0.066, -0.456, 0], [0.125, 0.173, 0.161], 'steel', -16),
            part('bevel', [0.048, -0.514, 0], [0.109, 0.074, 0.156], 'ceramic', -11),
            ...[-0.083, 0.083].flatMap((z): Part[] => [
                part('bevel', [0.177, -0.336, z], [0.147, 0.060, 0.031], 'coil', -20),
                part('box', [0.183, -0.338, z * 1.22], [0.073, 0.020, 0.012], 'arc', -20),
            ]),
        ]),
    },
    arc_gun: {
        action: 'shot',
        parts: [
            ...triggerGrip,
            part('bevel', [-0.046, 0.128, 0], [0.202, 0.251, 0.222], 'case'),
            part('bevel', [-0.119, 0.124, 0], [0.072, 0.201, 0.197], 'coil'),
            part('bevel', [0.183, 0.070, 0], [0.375, 0.098, 0.204], 'oxidized'),
            part('cylinder', [0.200, 0.161, 0], [0.169, 0.312, 0.178], 'soot', 90),
            ...[0.120, 0.174, 0.228, 0.282].map(x =>
                part('cylinder', [x, 0.161, 0], [0.169, 0.030, 0.207], 'copper', 90)),
            part('bevel', [0.030, 0.160, 0], [0.077, 0.199, 0.222], 'ceramic'),
            part('bevel', [0.342, 0.137, 0], [0.093, 0.224, 0.234], 'ceramic'),
            part('cylinder', [-0.048, 0.266, 0], [0.138, 0.042, 0.143], 'steel'),
            part('cylinder', [-0.048, 0.289, 0], [0.107, 0.013, 0.111], 'soot'),
            part('box', [-0.040, 0.299, 0], [0.054, 0.010, 0.025], 'arc'),
            ...[-0.105, 0.105].flatMap((z): Part[] => [
                part('bevel', [0.154, 0.218, z], [0.282, 0.059, 0.055], 'steel'),
                part('bevel', [0.438, 0.140, z], [0.251, 0.093, 0.076], 'oxidized', -6),
                part('bevel', [0.541, 0.139, z * 0.97], [0.090, 0.072, 0.067], 'nickel', -6),
            ]),
            part('cylinder', [0.449, 0.140, 0], [0.116, 0.139, 0.127], 'soot', 90),
            part('cylinder', [0.525, 0.140, 0], [0.109, 0.049, 0.114], 'coil', 90),
            part('box', [0.550, 0.142, 0], [0.034, 0.053, 0.058], 'arc'),
        ],
        indicator: [0.622, 0.137, 0],
    },
    riveter: {
        action: 'shot',
        parts: [
            ...shortCarriage,
            part('bevel', [0.145, 0.135, 0], [0.302, 0.103, 0.215], 'weld'),
            part('bevel', [0.192, -0.066, 0], [0.135, 0.186, 0.159], 'nickel', 6),
            part('cylinder', [0.441, 0.132, 0], [0.118, 0.237, 0.137], 'steel', 90),
            part('cylinder', [0.563, 0.132, 0], [0.143, 0.059, 0.148], 'soot', 90),
        ],
        indicator: [0.635, 0.132, 0],
        hot: true,
    },
    hydraulic_nailer: {
        action: 'hydraulic',
        parts: [
            ...lanceBase,
            part('bevel', [0.116, 0.176, 0], [0.393, 0.168, 0.250], 'copper'),
            part('bevel', [0.206, -0.022, 0], [0.237, 0.130, 0.179], 'rubber', -7),
            part('cylinder', [0.598, 0.119, 0], [0.127, 0.259, 0.127], 'steel', 90),
            part('cylinder', [0.744, 0.119, 0], [0.131, 0.069, 0.139], 'case', 90),
        ],
        indicator: [0.793, 0.119, 0],
        hot: true,
    },
    split_probe: {
        action: 'shot',
        parts: [
            ...triggerGrip,
            part('bevel', [0.096, 0.130, 0], [0.345, 0.216, 0.215], 'case'),
            part('bevel', [0.121, 0.247, 0], [0.231, 0.059, 0.196], 'ceramic'),
            part('bevel', [0.249, 0.128, 0], [0.153, 0.191, 0.242], 'copper'),
            part('bevel', [0.315, 0.142, 0], [0.125, 0.155, 0.303], 'oxidized'),
            ...[-1, 1].flatMap((side): Part[] => [
                part('box', [0.114, 0.280, side * 0.050], [0.082, 0.012, 0.023], 'arc'),
                part('bevel', [0.408, 0.137, side * 0.135], [0.203, 0.082, 0.107], 'steel'),
                part('bevel', [0.540, 0.134, side * 0.159], [0.210, 0.061, 0.079], 'nickel'),
                part('cylinder', [0.460, 0.139, side * 0.149], [0.101, 0.049, 0.109], 'ceramic', 90),
                part('cylinder', [0.551, 0.135, side * 0.162], [0.094, 0.049, 0.106], 'ceramic', 90),
                part('bevel', [0.672, 0.140, side * 0.163], [0.143, 0.096, 0.118], 'coil'),
                part('bevel', [0.736, 0.142, side * 0.165], [0.069, 0.079, 0.099], 'nickel'),
                part('box', [0.759, 0.139, side * 0.166], [0.027, 0.045, 0.055], 'arc'),
            ]),
        ],
        indicator: [0.786, 0.143, 0],
    },
    torch: {
        action: 'spray',
        parts: [
            ...lanceBase,
            part('cylinder', [0.225, -0.077, 0], [0.186, 0.365, 0.174], 'copper', 90),
            part('cylinder', [0.468, 0.120, 0], [0.114, 0.298, 0.131], 'weld', 90),
            part('cylinder', [0.639, 0.120, 0], [0.191, 0.134, 0.189], 'ceramic', 90),
            part('cylinder', [0.701, 0.119, 0], [0.122, 0.082, 0.136], 'soot', 90),
        ],
        indicator: [0.779, 0.120, 0],
        hot: true,
    },
    pulse_nozzle: {
        action: 'burst',
        parts: [
            ...lanceBase,
            part('bevel', [0.230, 0.173, 0], [0.368, 0.147, 0.277], 'coil'),
            part('cylinder', [0.568, 0.118, 0], [0.173, 0.269, 0.178], 'ceramic', 90),
            part('cylinder', [0.699, 0.119, 0], [0.264, 0.144, 0.268], 'case', 90),
            part('cylinder', [0.771, 0.119, 0], [0.147, 0.040, 0.153], 'pulse', 90),
        ],
        indicator: [0.815, 0.119, 0],
    },
    induction: {
        action: 'pulse',
        parts: [
            ...coilGrip,
            part('cylinder', [0.166, 0.288, 0], [0.248, 0.353, 0.248], 'coil'),
            part('cylinder', [0.166, 0.457, 0], [0.274, 0.092, 0.268], 'ceramic'),
            part('cylinder', [0.166, 0.518, 0], [0.157, 0.048, 0.157], 'arc'),
            ...[0.174, 0.235, 0.296, 0.357, 0.418].map(y =>
                part('cylinder', [0.166, y, 0], [0.281, 0.029, 0.280], 'copper')),
        ],
        indicator: [0.166, 0.580, 0],
    },
    traction_coil: {
        action: 'pull',
        parts: [
            ...coilGrip,
            part('bevel', [0.200, 0.178, 0], [0.365, 0.212, 0.322], 'coil'),
            part('cylinder', [0.351, 0.166, 0], [0.279, 0.144, 0.281], 'copper', 90),
            part('bevel', [0.461, 0.176, -0.130], [0.178, 0.178, 0.098], 'nickel'),
            part('bevel', [0.461, 0.176, 0.130], [0.178, 0.178, 0.098], 'nickel'),
            part('bevel', [0.547, 0.172, -0.082], [0.060, 0.131, 0.150], 'pulse'),
            part('bevel', [0.547, 0.172, 0.082], [0.060, 0.131, 0.150], 'pulse'),
        ],
        indicator: [0.600, 0.176, 0],
    },
};

const arcIndicator = [part('bevel', [0, 0, 0], [0.155, 0.109, 0.120], 'arc')];
const heatIndicator = [part('bevel', [0, 0, 0], [0.178, 0.106, 0.119], 'lamp')];
const packIndicator = [part('bevel', [0, 0, 0], [0.061, 0.098, 0.262], 'arc', -6)];
// Measured emission points in the Blender tools' grip-local coordinates.
const weaponTips: Readonly<Record<ToolId, Point>> = {
    wrench: [0.103, -0.305, 0], bypass_wrench: [0.103, -0.305, 0],
    arc_gun: [0.592, 0.137, 0], riveter: [0.603, 0.132, 0], hydraulic_nailer: [0.775, 0.119, 0],
    split_probe: [0.770, 0.143, 0], torch: [0.754, 0.119, 0], pulse_nozzle: [0.790, 0.119, 0],
    induction: [0.158, 0.554, 0], traction_coil: [0.601, 0.162, 0],
};
const thigh = [
    part('sleeve', [0.008, -0.124, 0], [0.297, 0.422, 0.302], 'canvas'),
    part('oval', [0.131, -0.151, 0], [0.070, 0.178, 0.196], 'canvasLight', -10),
    part('oval', [0.138, -0.275, 0], [0.118, 0.157, 0.230], 'canvasSeam', 8),
    part('oval', [0.183, -0.265, 0], [0.050, 0.103, 0.160], 'leather', 8),
];
const shin = [
    part('sleeve', [0.006, -0.074, 0], [0.253, 0.294, 0.264], 'canvas'),
    part('sleeve', [0.005, -0.175, 0], [0.262, 0.070, 0.277], 'canvasSeam'),
    part('boot', [0.072, -0.228, 0], [0.395, 0.180, 0.278], 'boot'),
    part('boot', [0.072, -0.287, 0], [0.414, 0.058, 0.296], 'rubber'),
    part('boot', [0.074, -0.263, 0], [0.408, 0.026, 0.291], 'leather'),
    part('oval', [0.203, -0.222, 0], [0.144, 0.106, 0.200], 'toe', -15),
    part('oval', [0.105, -0.164, 0], [0.114, 0.021, 0.163], 'cuff', -13),
    ...[-0.036, 0.057, 0.150].map(x => part('bevel', [x, -0.304, 0], [0.044, 0.040, 0.244], 'soot')),
];

function normalsFor(positions: number[], indices: number[]): number[] {
    const normals = new Array<number>(positions.length).fill(0);
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const ab: Point = [positions[b] - positions[a], positions[b + 1] - positions[a + 1], positions[b + 2] - positions[a + 2]];
        const ac: Point = [positions[c] - positions[a], positions[c + 1] - positions[a + 1], positions[c + 2] - positions[a + 2]];
        const nx = ab[1] * ac[2] - ab[2] * ac[1];
        const ny = ab[2] * ac[0] - ab[0] * ac[2];
        const nz = ab[0] * ac[1] - ab[1] * ac[0];
        for (const vertex of [a, b, c]) {
            normals[vertex] += nx;
            normals[vertex + 1] += ny;
            normals[vertex + 2] += nz;
        }
    }
    return normals;
}

function removeCollapsedFaces(positions: number[], indices: number[]): number[] {
    const result: number[] = [];
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3;
        const b = indices[i + 1] * 3;
        const c = indices[i + 2] * 3;
        const abx = positions[b] - positions[a], aby = positions[b + 1] - positions[a + 1], abz = positions[b + 2] - positions[a + 2];
        const acx = positions[c] - positions[a], acy = positions[c + 1] - positions[a + 1], acz = positions[c + 2] - positions[a + 2];
        if (Math.hypot(aby * acz - abz * acy, abz * acx - abx * acz, abx * acy - aby * acx) > 0.00000001) {
            result.push(indices[i], indices[i + 1], indices[i + 2]);
        }
    }
    return result;
}

function ringSurface(outline: [number, number][], profile: [number, number][]): UnpaintedGeometry {
    const positions: number[] = [];
    const indices: number[] = [];
    const sides = outline.length;
    for (const [height, radius] of profile) {
        for (const [x, z] of outline) positions.push(x * radius, height, z * radius);
    }
    const last = (profile.length - 1) * sides;
    const bottom = positions.length / 3;
    const top = bottom + 1;
    positions.push(0, profile[0][0], 0, 0, profile[profile.length - 1][0], 0);
    for (let i = 0; i < sides; i++) {
        const next = (i + 1) % sides;
        indices.push(bottom, i, next, top, last + next, last + i);
        for (let ring = 0; ring < last; ring += sides) {
            indices.push(ring + i, ring + sides + i, ring + sides + next, ring + i, ring + sides + next, ring + next);
        }
    }
    return { positions, indices, normals: normalsFor(positions, indices) };
}

const roundedRectangle: [number, number][] = [
    [0.5, -0.34], [0.5, 0.34], [0.34, 0.5], [-0.34, 0.5],
    [-0.5, 0.34], [-0.5, -0.34], [-0.34, -0.5], [0.34, -0.5],
];
const ellipticalOutline: [number, number][] = Array.from({ length: 24 }, (_, side) => {
    const angle = 2 * Math.PI * side / 24;
    return [0.5 * Math.cos(angle), 0.5 * Math.sin(angle)];
});
const bootOutline: [number, number][] = [
    [0.5, -0.19], [0.5, 0.19], [0.42, 0.35], [0.23, 0.46], [0.02, 0.50],
    [-0.28, 0.44], [-0.46, 0.31], [-0.50, 0.14], [-0.50, -0.14], [-0.46, -0.31],
    [-0.28, -0.44], [0.02, -0.50], [0.23, -0.46], [0.42, -0.35],
];
const bevelGeometry = ringSurface(roundedRectangle, [[-0.5, 0.78], [-0.32, 1], [0.32, 1], [0.5, 0.78]]);
const helmetGeometry = ringSurface(ellipticalOutline, [[0, 0.92], [0.14, 1], [0.39, 0.977], [0.66, 0.83], [0.86, 0.55], [1, 0.15]]);
const visorGeometry = ringSurface(ellipticalOutline, [[-0.5, 0.82], [-0.23, 0.97], [0.17, 1], [0.43, 0.97], [0.5, 0.84]]);
const ovalGeometry = ringSurface(ellipticalOutline, [[-0.5, 0.62], [-0.30, 0.91], [0, 1], [0.30, 0.91], [0.5, 0.62]]);
const sleeveGeometry = ringSurface(ellipticalOutline, [[-0.5, 0.76], [-0.32, 0.93], [0.18, 1], [0.37, 0.93], [0.5, 0.70]]);
const bootGeometry = ringSurface(bootOutline, [[-0.5, 0.94], [-0.30, 1], [0.07, 1], [0.33, 0.94], [0.5, 0.78]]);

function shade(tint: Tint, nx: number, ny: number, nz: number): [number, number, number, number] {
    const length = Math.hypot(nx, ny, nz) || 1;
    const light = Math.max(0, (0.36 * nx + 0.87 * ny - 0.33 * nz) / length);
    return [tint[0] * (0.69 + 0.32 * light), tint[1] * (0.73 + 0.27 * light),
        tint[2] * (0.81 + 0.15 * light) + 0.022 * (1 - light), 1];
}

function sourceGeometry(shape: Part['shape']): UnpaintedGeometry {
    switch (shape) {
    case 'helmet': return helmetGeometry;
    case 'visor': return visorGeometry;
    case 'oval': return ovalGeometry;
    case 'sleeve': return sleeveGeometry;
    case 'boot': return bootGeometry;
    case 'bevel': return bevelGeometry;
    case 'round': return primitives.sphere(0.5, { segments: 12 }) as UnpaintedGeometry;
    case 'cylinder': return primitives.cylinder(0.5, 0.5, 1, { radialSegments: 16 }) as UnpaintedGeometry;
    case 'box': return primitives.box() as UnpaintedGeometry;
    }
}

function combine(parts: Part[]): Geometry {
    const positions: number[] = [];
    const vertexColors: number[] = [];
    const indices: number[] = [];
    for (const piece of parts) {
        const geometry = sourceGeometry(piece.shape);
        const offset = positions.length / 3;
        const angle = (piece.angle ?? 0) * Math.PI / 180;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const tint = materialTint(piece.material);
        const [width, height, depth] = piece.size;
        const [cx, cy, cz] = piece.center;
        for (let i = 0; i < geometry.positions.length; i += 3) {
            const x = geometry.positions[i] * width, y = geometry.positions[i + 1] * height;
            positions.push(cx + x * cos - y * sin, cy + x * sin + y * cos, cz + geometry.positions[i + 2] * depth);
            const nx = geometry.normals[i] / width, ny = geometry.normals[i + 1] / height;
            vertexColors.push(...shade(tint, nx * cos - ny * sin, nx * sin + ny * cos, geometry.normals[i + 2] / depth));
        }
        for (const index of geometry.indices) indices.push(index + offset);
    }
    return { positions, colors: vertexColors, indices: removeCollapsedFaces(positions, indices) };
}

function steppedBlend(value: number, low: number, high: number): number {
    const blend = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return blend * blend * (3 - 2 * blend);
}

function mix(a: Tint, b: Tint, amount: number): Tint {
    return [a[0] + (b[0] - a[0]) * amount, a[1] + (b[1] - a[1]) * amount, a[2] + (b[2] - a[2]) * amount];
}

function relaxReconstruction(positions: number[], indices: number[], preserveFace: boolean): number[] {
    const neighbors = Array.from({ length: positions.length / 3 }, () => new Set<number>());
    for (let i = 0; i < indices.length; i += 3) {
        const [a, b, c] = indices.slice(i, i + 3);
        neighbors[a].add(b).add(c);
        neighbors[b].add(a).add(c);
        neighbors[c].add(a).add(b);
    }
    const freedom = neighbors.map((_, index) => preserveFace ? 1 - 0.75 * steppedBlend(positions[index * 3], 0.05, 0.26) : 1);
    let current = positions;
    // Alternate relaxation and recovery to soften scanned facets without shrinking the silhouette.
    for (const amount of [0.47, -0.49, 0.38, -0.40]) {
        const next = current.slice();
        neighbors.forEach((adjacent, vertex) => {
            if (adjacent.size === 0) return;
            const weight = freedom[vertex] * amount;
            for (let axis = 0; axis < 3; axis++) {
                const index = vertex * 3 + axis;
                let average = 0;
                for (const neighbor of adjacent) average += current[neighbor * 3 + axis];
                const offset = average / adjacent.size - current[index];
                next[index] += Math.max(-0.05, Math.min(0.05, offset)) * weight;
            }
        });
        current = next;
    }
    return current;
}

// The scanned jacket is asymmetric. Its seams sit on the actual chest, including over the folds.
function chestDepth(positions: number[], indices: number[], y: number, z: number): number {
    let depth = -Infinity;
    for (let i = 0; i < indices.length; i += 3) {
        const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
        const by = positions[b + 1] - positions[a + 1], bz = positions[b + 2] - positions[a + 2];
        const cy = positions[c + 1] - positions[a + 1], cz = positions[c + 2] - positions[a + 2];
        const determinant = by * cz - bz * cy;
        if (Math.abs(determinant) < 0.0000001) continue;
        const dy = y - positions[a + 1], dz = z - positions[a + 2];
        const u = (dy * cz - dz * cy) / determinant, v = (by * dz - bz * dy) / determinant;
        if (u < 0 || v < 0 || u + v > 1) continue;
        depth = Math.max(depth, (1 - u - v) * positions[a] + u * positions[b] + v * positions[c]);
    }
    return depth;
}

function wearSeams(positions: number[], indices: number[]): Geometry {
    const trim: Geometry = { positions: [], colors: [], indices: [] };
    const ribbon = (path: readonly [number, number][], width: number, material: MaterialName, lift: number): void => {
        const { positions: vertices, colors, indices: faces } = trim;
        const vertexOffset = vertices.length / 3;
        const indexOffset = faces.length;
        const columns = Math.max(2, Math.ceil(width / 0.026) + 1);
        for (let leg = 1; leg < path.length; leg++) {
            const [y, z] = path[leg - 1];
            const dy = path[leg][0] - y, dz = path[leg][1] - z;
            const length = Math.hypot(dy, dz);
            const rows = Math.ceil(length / 0.024) + 1;
            const sample: number[][] = [];
            for (let row = 0; row < rows; row++) {
                const fraction = row / (rows - 1);
                const across: number[] = [];
                sample.push(across);
                for (let column = 0; column < columns; column++) {
                    const shift = width * (column / (columns - 1) - 0.5) / length;
                    const py = y + dy * fraction - dz * shift;
                    const pz = z + dz * fraction + dy * shift;
                    const px = chestDepth(positions, indices, py, pz);
                    across.push(Number.isFinite(px) ? vertices.length / 3 : -1);
                    if (Number.isFinite(px)) vertices.push(px + lift, py, pz);
                }
            }
            for (let row = 1; row < rows; row++) {
                for (let column = 1; column < columns; column++) {
                    const a = sample[row - 1][column - 1], b = sample[row][column - 1];
                    const c = sample[row - 1][column], d = sample[row][column];
                    if (a >= 0 && b >= 0 && c >= 0) faces.push(a, b, c);
                    if (c >= 0 && b >= 0 && d >= 0) faces.push(c, b, d);
                }
            }
        }
        const localIndices = faces.slice(indexOffset).map(index => index - vertexOffset);
        const normals = normalsFor(vertices.slice(vertexOffset * 3), localIndices);
        const tint = materialTint(material);
        for (let i = 0; i < normals.length; i += 3) colors.push(...shade(tint, normals[i], normals[i + 1], normals[i + 2]));
    };
    const zip: [number, number][] = [[0.539, 0.014], [0.425, 0.016], [0.30, 0.021], [0.121, 0.018]];
    ribbon(zip, 0.046, 'canvasSeam', 0.007);
    ribbon(zip.map(([y, z]) => [y, z + 0.014]), 0.009, 'thread', 0.011);
    ribbon([[0.390, 0.016], [0.363, 0.008]], 0.024, 'oxidized', 0.017);
    for (const side of [-1, 1]) {
        const harness: [number, number][] = [[0.528, side * 0.123], [0.467, side * 0.171],
            [0.410, side * 0.185], [0.356, side * 0.176]];
        ribbon(harness, 0.069, 'canvasSeam', 0.010);
        ribbon(harness.map(([y, z]) => [y, z + side * 0.023]), 0.008, 'thread', 0.015);
        ribbon([[0.383, side * 0.150], [0.383, side * 0.201]], 0.018, 'oxidized', 0.016);
        const center = side * 0.128;
        ribbon([[0.215, center], [0.290, center]], 0.122, 'canvasLight', 0.007);
        ribbon([[0.288, center - 0.069], [0.291, center + 0.069]], 0.027, 'canvasSeam', 0.013);
        ribbon([[0.275, center - 0.063], [0.278, center + 0.063]], 0.006, 'thread', 0.017);
        ribbon([[0.217, center - 0.054], [0.208, center], [0.219, center + 0.054]], 0.009, 'canvasSeam', 0.011);
    }
    return trim;
}

function finishReconstruction(source: Geometry, bodyPart: 'head' | 'torso', equipment: Part[]): Geometry {
    const fitted: number[] = [];
    for (let i = 0; i < source.positions.length; i += 3) {
        const [x, y, z] = source.positions.slice(i, i + 3);
        if (bodyPart === 'head') {
            // Fit the reconstructed scalp beneath the hardhat and smooth the exaggerated rear silhouette.
            const adjustedX = 0.82 * x + 0.034;
            const adjustedY = y > 0.076 ? 0.076 + (y - 0.076) * 0.14 : y;
            fitted.push(Math.max(-0.350, adjustedX), adjustedY, (z - 0.040) * 0.84);
        } else {
            fitted.push(x * 0.91, y, z * 0.97);
        }
    }
    const positions = relaxReconstruction(fitted, source.indices, bodyPart === 'head');
    const meshIndices = removeCollapsedFaces(positions, source.indices);
    const normals = normalsFor(positions, meshIndices);
    const colors: number[] = [];
    const skin = materialTint('skin'), rubber = materialTint('rubber');
    const darkCanvas = materialTint('canvasSeam'), canvas = materialTint('canvas'), lightCanvas = materialTint('canvasLight');
    for (let i = 0; i < positions.length; i += 3) {
        const [x, y] = positions.slice(i, i + 2);
        const front = steppedBlend(x, -0.06, 0.20);
        // Vertex colors from the input contain painted shadows. Use the same palette and light as the rig.
        const tint = bodyPart === 'head' ? mix(mix(rubber, skin, front), darkCanvas, 1 - steppedBlend(y, -0.223, -0.148))
            : mix(mix(darkCanvas, canvas, 0.72 + 0.20 * front), lightCanvas, steppedBlend(y, 0.15, 0.54) * 0.20);
        colors.push(...shade(tint, normals[i], normals[i + 1], normals[i + 2]));
    }
    const detail = combine(equipment);
    if (bodyPart === 'torso') {
        const stitched = wearSeams(positions, meshIndices);
        const base = detail.positions.length / 3;
        detail.positions.push(...stitched.positions);
        detail.colors.push(...stitched.colors);
        detail.indices.push(...stitched.indices.map(index => base + index));
    }
    const offset = positions.length / 3;
    return {
        positions: [...positions, ...detail.positions],
        colors: [...colors, ...detail.colors],
        indices: [...meshIndices, ...detail.indices.map(index => index + offset)],
    };
}

interface CombatStance {
    readonly yaw: number;
    readonly lean: number;
    readonly hips: number;
    readonly right: Point;
    readonly left: Point;
    readonly elbows: readonly [number, number];
    readonly wrist: number;
    readonly kick: number;
}

const stances: Record<Action, CombatStance> = {
    swing: {
        yaw: 41, lean: -12, hips: 0, right: [26, -48, 101], left: [0, 7, -12], elbows: [0, -9], wrist: 0, kick: 0,
    },
    hook: {
        yaw: -33, lean: -19, hips: -0.061, right: [-22, 11, 118], left: [-10, -6, 29], elbows: [10, 24], wrist: 24, kick: 0,
    },
    shot: {
        yaw: 13, lean: -11, hips: -0.031, right: [0, 26, 70], left: [4, 6, 30], elbows: [-5, -10], wrist: -3, kick: 16,
    },
    hydraulic: {
        yaw: 19, lean: -17, hips: -0.079, right: [-1, 22, 61], left: [19, -25, 55], elbows: [11, 2], wrist: -2, kick: 23,
    },
    spray: {
        yaw: 11, lean: -18, hips: -0.042, right: [10, 17, 56], left: [15, -18, 51], elbows: [20, 11], wrist: -11, kick: 0,
    },
    burst: {
        yaw: -9, lean: 15, hips: -0.072, right: [-7, 19, 66], left: [22, -21, 48], elbows: [21, 17], wrist: 3, kick: 27,
    },
    pulse: {
        yaw: -15, lean: -22, hips: 0.043, right: [-19, 21, 126], left: [20, -15, 83], elbows: [20, 12], wrist: 7, kick: 0,
    },
    pull: {
        yaw: 21, lean: 22, hips: -0.070, right: [6, 27, 87], left: [31, -13, 52], elbows: [8, 25], wrist: -3, kick: 13,
    },
};

export interface MechanicModel {
    readonly node: Node;
    setPose(pose: Pose, ageTicks: number, tool?: ToolId, pickupPulse?: boolean, hands?: MechanicHands): void;
    weaponTip(slot: number, tool: ToolId): Vec3 | undefined;
}

export interface MechanicHand {
    readonly tool: ToolId;
    readonly attackAge?: number;
    readonly windupAge?: number;
    readonly aimYaw?: number;
}

export type MechanicHands = readonly [MechanicHand | undefined, MechanicHand | undefined];

function castForce(age: number | undefined): number {
    if (age === undefined || age >= 8) return 0;
    return age < 5 ? 1 - age * 0.10 : 0.45 * Math.max(0, 1 - (age - 5) / 2);
}

export class PrototypeMechanicMeshes {
    private reconstruction: { head: Mesh; torso: Mesh } | null = null;
    private detailed: Map<RigPart, DetailedPart> | undefined;
    private prefab?: Prefab;
    private readonly waiting: PendingMechanic[] = [];
    private readonly releaseLights = new Map<number, () => void>();
    private readonly waitingWeapons = new Map<MeshRenderer, ToolId>();
    private readonly weaponHighlights = new Map<Material, { held: Material; attacking: Material }>();
    private weaponParts?: Map<ToolId, DetailedPart>;
    private weaponPrefab?: Prefab;
    private readonly legacy = DEBUG && sys.isBrowser && new URLSearchParams(globalThis.location.search).get('mechanic') === 'legacy';
    private weaponLoadPending = false;
    private readonly material = new Material();
    private readonly meshes = new Map<Part[], Mesh>();
    private disposed = false;

    constructor(loadModel = true, onModelReady?: () => void) {
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true } });
        if (!loadModel) return;
        if (!this.legacy) this.loadWeapons(onModelReady);
        if (this.legacy || !resources.getInfoWithPath(detailedModelPath, Prefab)) {
            this.loadReconstruction(onModelReady);
            return;
        }
        resources.load(detailedModelPath, Prefab, (error, prefab) => {
            if (this.disposed) return;
            const parts = !error && prefab ? detailedParts(prefab) : undefined;
            if (!parts) {
                this.loadReconstruction(onModelReady);
                return;
            }
            prefab.addRef();
            this.prefab = prefab;
            this.detailed = parts;
            for (const { node, renderers } of this.waiting.splice(0)) {
                if (!isValid(node, true)) continue;
                for (const [part, renderer] of renderers) {
                    const detail = parts.get(part)!;
                    renderer.mesh = detail.mesh;
                    renderer.setSharedMaterial(detail.material, 0);
                }
                this.showDetailed(node);
            }
            onModelReady?.();
        });
    }

    private loadReconstruction(onModelReady?: () => void): void {
        if (!resources.getInfoWithPath(reconstructionPath, JsonAsset)) {
            this.waiting.length = 0;
            return;
        }
        resources.load(reconstructionPath, JsonAsset, (error, asset) => {
            if (this.disposed) return;
            const waiting = this.waiting.splice(0);
            if (error || !asset) return;
            const { head: headGeometry, torso: torsoGeometry } = asset.json as Reconstruction;
            this.reconstruction = {
                head: utils.createMesh(finishReconstruction(headGeometry, 'head', headEquipment), undefined, { calculateBounds: true }),
                torso: utils.createMesh(finishReconstruction(torsoGeometry, 'torso', torsoEquipment), undefined, { calculateBounds: true }),
            };
            for (const { node, renderers } of waiting) {
                if (!isValid(node, true)) continue;
                renderers.get('Head')!.mesh = this.reconstruction.head;
                renderers.get('Torso')!.mesh = this.reconstruction.torso;
            }
            onModelReady?.();
        });
    }

    get usingReconstruction(): boolean { return !!this.reconstruction; }
    get usingDetailedModel(): boolean { return !!this.detailed; }
    get usingDetailedWeapons(): boolean { return !!this.weaponParts; }

    createToolDisplay(id: ToolId, parent: Node, layer: number): Node {
        const tool = this.joint(parent, layer, 'Tool model ' + id, [0, 0, 0]);
        this.setWeapon(this.render(tool, tools[id].parts), id);
        return tool;
    }

    private loadWeapons(onModelReady?: () => void): void {
        if (!resources.getInfoWithPath(weaponModelPath, Prefab)) return;
        this.weaponLoadPending = true;
        resources.load(weaponModelPath, Prefab, (error, prefab) => {
            if (this.disposed) return;
            this.weaponLoadPending = false;
            const parts = new Map<ToolId, DetailedPart>();
            if (!error && prefab) {
                prefab.data.walk(node => {
                    if (!isTool(node.name)) return;
                    const renderer = node.getComponent(MeshRenderer);
                    const mesh = renderer?.mesh;
                    const material = renderer?.getSharedMaterial(0);
                    if (mesh && material) parts.set(node.name, { mesh, material });
                });
            }
            if (prefab && parts.size === Object.keys(TOOLS).length) {
                prefab.addRef();
                this.weaponPrefab = prefab;
                this.weaponParts = parts;
                for (const [renderer, id] of this.waitingWeapons) {
                    if (isValid(renderer, true)) this.setWeapon(renderer, id);
                }
                onModelReady?.();
            }
            this.waitingWeapons.clear();
        });
    }

    private setWeapon(renderer: MeshRenderer, id: ToolId): void {
        const part = this.weaponParts?.get(id);
        renderer.mesh = part?.mesh ?? this.mesh(tools[id].parts);
        renderer.setSharedMaterial(part?.material ?? this.material, 0);
        if (part) this.lightLayer(renderer.node);
        else if (this.weaponLoadPending) this.waitingWeapons.set(renderer, id);
    }

    private highlightWeapon(renderer: MeshRenderer, id: ToolId, attacking: boolean): void {
        const source = this.weaponParts?.get(id)?.material;
        if (source?.effectName !== 'builtin-standard') return;
        let variants = this.weaponHighlights.get(source);
        if (!variants) {
            const held = new Material();
            held.copy(source);
            held.setProperty('albedoScale', new Vec3(1.11, 1.11, 1.13));
            const flash = new Material();
            flash.copy(source);
            flash.setProperty('albedoScale', new Vec3(1.22, 1.20, 1.19));
            flash.setProperty('emissiveScale', new Vec3(1.48, 1.48, 1.48));
            this.weaponHighlights.set(source, variants = { held, attacking: flash });
        }
        const material = attacking ? variants.attacking : variants.held;
        if (renderer.getSharedMaterial(0) !== material) renderer.setSharedMaterial(material, 0);
    }

    private tip(id: ToolId): Point {
        return this.weaponParts ? weaponTips[id] : tools[id].indicator ?? weaponTips[id];
    }

    create(parent: Node, layer: number): MechanicModel {
        const node = this.joint(parent, layer, '维修工', [0, 0, 0]);
        const hip = this.joint(node, layer, '胯', [0, 0.66, 0]);
        const body = this.joint(hip, layer, '胸', [0, 0.02, 0]);
        const headJoint = this.joint(body, layer, '头', [0, 0.76, 0]);
        const renderers = new Map<RigPart, MeshRenderer>();
        const renderPart = (part: RigPart, joint: Node, fallback: Part[], mesh?: Mesh): void => {
            const detail = this.detailed?.get(part);
            renderers.set(part, this.render(joint, fallback, detail?.mesh ?? mesh, detail?.material));
        };
        renderPart('Head', headJoint, head, this.reconstruction?.head);
        renderPart('Torso', body, torso, this.reconstruction?.torso);
        const shoulders = ([-1, 1] as const).map(side => this.joint(body, layer, `肩${side}`, [0, 0.43, side * 0.33]));
        const elbows = shoulders.map((pivot, index) => {
            renderPart(`Shoulder${sides[index]}`, pivot, shoulder);
            const elbow = this.joint(pivot, layer, '肘', [0, -0.247, 0]);
            renderPart(`Forearm${sides[index]}`, elbow, forearm);
            return elbow;
        });
        const grips = [elbows[1], elbows[0]].map(elbow => {
            const wrist = this.joint(elbow, layer, '持械手', gripOffset);
            const model = this.render(wrist, tools.wrench.parts);
            const emitter = this.joint(wrist, layer, '工具工作灯', [0, 0, 0]);
            const light = this.render(emitter, arcIndicator);
            wrist.active = false;
            emitter.active = false;
            return { wrist, model, emitter, light, tool: undefined as ToolId | undefined };
        });
        const packLight = this.joint(body, layer, '回收线圈放电', [-0.556, 0.286, 0]);
        this.render(packLight, packIndicator);
        packLight.active = false;
        const thighs = ([-1, 1] as const).map(side => this.joint(hip, layer, `髋${side}`, [0, 0, side * 0.165]));
        const knees = thighs.map((pivot, index) => {
            renderPart(`Thigh${sides[index]}`, pivot, thigh);
            const knee = this.joint(pivot, layer, '膝', [0, -0.339, 0]);
            renderPart(`Shin${sides[index]}`, knee, shin);
            return knee;
        });
        if (this.detailed) this.showDetailed(node);
        else if (!this.reconstruction) this.waiting.push({ node, renderers });
        const toolAttitude = new Quat();
        const worldAttitude = new Quat();
        return { node, weaponTip: (slot, tool) => {
            const grip = grips[slot];
            if (grip?.tool !== tool || !grip.wrist.activeInHierarchy) return undefined;
            const point = new Vec3(...this.tip(tool));
            return Vec3.transformMat4(point, point, grip.wrist.worldMatrix);
        }, setPose: (pose, ageTicks, toolId = 'wrench', pickupPulse = false, hands) => {
            const attackAge = pose === 'strike' ? ageTicks : pose === 'recover' ? ageTicks + 5 : undefined;
            const [right, left] = hands ?? [{ tool: toolId, attackAge, windupAge: pose === 'windup' ? ageTicks : undefined }, undefined];
            const rightStance = stances[tools[right?.tool ?? toolId].action];
            const leftStance = left ? stances[tools[left.tool].action] : rightStance;
            const stride = pose === 'walk' ? Math.sin(ageTicks * Math.PI / 9) : 0;
            const breath = pose === 'idle' ? Math.sin(ageTicks * Math.PI / 28) : 0;
            // The first strike tick is already the damage tick in Battle.
            const recoil = pose === 'hit' ? Math.max(0, 1 - ageTicks / 7) : 0;
            const canAttack = !pickupPulse && pose !== 'hit';
            const rightCast = canAttack ? castForce(right?.attackAge) : 0;
            const leftCast = canAttack ? castForce(left?.attackAge) : 0;
            const rightLoad = canAttack && right?.windupAge !== undefined ? Math.min(1, (right.windupAge + 1) / 4) : 0;
            const leftLoad = canAttack && left?.windupAge !== undefined ? Math.min(1, (left.windupAge + 1) / 4) : 0;
            const cast = Math.max(rightCast, leftCast);
            const leftLeads = leftCast > rightCast || (leftCast > 0 && leftCast === rightCast
                && (left?.tool === 'wrench' || left?.tool === 'bypass_wrench'));
            const stance = leftLeads ? leftStance : rightStance;
            const leanSide = leftLeads ? -1 : 1;
            const packDischarge = pickupPulse ? castForce(attackAge) : 0;
            const [rx, ry, rz] = rightStance.right;
            const [lx, ly, lz] = left ? leftStance.right : rightStance.left;
            const leftArmCast = left ? leftCast : rightCast;
            hip.setPosition(-0.060 * recoil, 0.66 + 0.011 * breath + Math.abs(stride) * 0.047
                + stance.hips * cast - recoil * 0.10 - packDischarge * 0.078, 0);
            const twist = leanSide * stance.yaw * cast - 33 * (rightLoad - leftLoad) + 16 * packDischarge;
            body.setRotationFromEuler(packDischarge * 14, twist,
                stance.lean * cast + 27 * recoil - 22 * packDischarge + 1.3 * breath);
            headJoint.setRotationFromEuler(recoil * 8, -0.58 * twist, -14 * recoil + 12 * packDischarge);
            shoulders[0].setRotationFromEuler(-8 - recoil * 20 + (left ? -lx : lx) * leftArmCast - 24 * packDischarge,
                (left ? 17 - ly * leftArmCast : ly * leftArmCast) - 36 * packDischarge,
                12 - stride * 24 + recoil * 33 + lz * leftArmCast - 36 * leftLoad + 62 * packDischarge);
            shoulders[1].setRotationFromEuler(7 + 13 * recoil + rx * rightCast, -17 + ry * rightCast,
                13 + stride * 23 + rz * rightCast - 36 * rightLoad - 49 * recoil);
            elbows[0].setRotationFromEuler(0, 0, 15 + Math.max(0, -stride) * 17
                + leftStance.elbows[left ? 1 : 0] * leftArmCast + 42 * leftLoad + 47 * packDischarge);
            elbows[1].setRotationFromEuler(0, 0, 16 + 42 * rightLoad + 14 * recoil + rightStance.elbows[1] * rightCast);
            thighs[0].setRotationFromEuler(0, 0, -27 * stride + recoil * 10);
            thighs[1].setRotationFromEuler(0, 0, 27 * stride - recoil * 16);
            knees[0].setRotationFromEuler(0, 0, -8 - Math.max(0, stride) * 38 + 240 * stance.hips * cast - packDischarge * 10);
            knees[1].setRotationFromEuler(0, 0, -8 - Math.max(0, -stride) * 38 + 200 * stance.hips * cast - packDischarge * 9);
            for (const [slot, hand] of [right, left].entries()) {
                const grip = grips[slot];
                grip.wrist.active = !!hand;
                if (!hand) continue;
                const tool = tools[hand.tool];
                if (grip.tool !== hand.tool) {
                    grip.tool = hand.tool;
                    this.setWeapon(grip.model, hand.tool);
                    grip.light.mesh = this.mesh(tool.hot ? heatIndicator : arcIndicator);
                }
                const side = slot === 0 ? 1 : -1;
                const handStance = stances[tool.action];
                const force = slot === 0 ? rightCast : leftCast;
                const loading = slot === 0 ? rightLoad : leftLoad;
                const age = hand.attackAge ?? Infinity;
                if (tool.action === 'swing' || tool.action === 'hook') {
                    const follow = age < 7 && canAttack ? Math.sin(Math.min(1, age / 7) * Math.PI) : 0;
                    const swingSide = tool.action === 'hook' ? -side : side;
                    if (hand.aimYaw !== undefined && force > 0) {
                        // Bring the wrench head forward on the damage tick, then sweep it past the target.
                        Quat.fromEuler(worldAttitude, 0, hand.aimYaw + swingSide * 44 * follow, 0);
                        Quat.fromEuler(toolAttitude, 0, 0, 78 - (1 - force) * 65 + 12 * follow);
                        Quat.multiply(worldAttitude, worldAttitude, toolAttitude);
                        grip.wrist.setWorldRotation(worldAttitude);
                    } else {
                        grip.wrist.setRotationFromEuler(side * -19 * handStance.wrist * force / 24,
                            swingSide * 46 * loading, handStance.wrist * force - 21 * loading);
                    }
                } else {
                    // Aim and recoil come from this weapon's own cast, including simultaneous attacks.
                    const kick = canAttack ? handStance.kick * Math.max(0, 1 - age / 3) : 0;
                    const pitch = -42 * (1 - force) + handStance.wrist * force + kick - 15 * recoil;
                    Quat.fromEuler(toolAttitude, 0, side * 11 * (1 - force), pitch);
                    if (hand.aimYaw !== undefined && force > 0) Quat.fromEuler(worldAttitude, 0, hand.aimYaw, 0);
                    else Quat.copy(worldAttitude, node.worldRotation);
                    Quat.multiply(worldAttitude, worldAttitude, toolAttitude);
                    grip.wrist.setWorldRotation(worldAttitude);
                }
                grip.emitter.active = canAttack && tool.indicator !== undefined && age < (tool.action === 'spray' ? 4 : 2);
                if (grip.emitter.active) {
                    grip.emitter.setPosition(...this.tip(hand.tool));
                    grip.emitter.setScale(force, force, force);
                }
                if (hands) this.highlightWeapon(grip.model, hand.tool, canAttack && age < 2);
            }
            packLight.active = packDischarge > 0.68;
        } };
    }

    destroy(): void {
        this.disposed = true;
        for (const releaseLight of this.releaseLights.values()) releaseLight();
        this.releaseLights.clear();
        this.prefab?.decRef();
        this.weaponPrefab?.decRef();
        for (const { held, attacking } of this.weaponHighlights.values()) {
            held.destroy();
            attacking.destroy();
        }
        this.weaponHighlights.clear();
        this.reconstruction?.head.destroy();
        this.reconstruction?.torso.destroy();
        for (const mesh of this.meshes.values()) mesh.destroy();
        this.waiting.length = 0;
        this.waitingWeapons.clear();
        this.material.destroy();
    }

    private showDetailed(node: Node): void {
        node.name = '维修工 · Blender';
        this.lightLayer(node);
    }

    private lightLayer(node: Node): void {
        if (!this.releaseLights.has(node.layer)) {
            this.releaseLights.set(node.layer, PrototypeWorkshopLight.acquire(node.scene!, node.layer));
        }
    }

    private joint(parent: Node, layer: number, name: string, position: Point): Node {
        const node = new Node(name);
        node.layer = layer;
        node.parent = parent;
        node.setPosition(...position);
        return node;
    }

    private mesh(parts: Part[]): Mesh {
        let mesh = this.meshes.get(parts);
        if (!mesh) {
            mesh = utils.createMesh(combine(parts), undefined, { calculateBounds: true });
            this.meshes.set(parts, mesh);
        }
        return mesh;
    }

    private render(node: Node, parts: Part[], meshOverride?: Mesh, material = this.material): MeshRenderer {
        const renderer = node.addComponent(MeshRenderer);
        renderer.mesh = meshOverride ?? this.mesh(parts);
        renderer.setSharedMaterial(material, 0);
        return renderer;
    }
}
