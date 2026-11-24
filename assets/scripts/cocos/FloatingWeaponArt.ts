import type { ToolId } from '../m1/content';

type Effect = 'contact' | 'arc' | 'rivet' | 'nail' | 'jet' | 'pulse' | 'coil' | 'pull' | 'fork';
interface WeaponArt {
    folder: string;
    effect: Effect;
    motion: readonly GunFrame[];
    tint: readonly [number, number, number];
}

// Authored in simulation ticks, pixels along/across the firing axis, degrees and sprite scale.
type GunFrame = readonly [tick: number, travel: number, side: number, turn: number, scale: number];
const rest: GunFrame = [0, 0, 0, 0, 1];

export function sampleGunPose(frames: readonly GunFrame[], age: number) {
    let a = rest;
    for (const b of frames) {
        if (age < b[0]) {
            const t = Math.max(0, (age - a[0]) / (b[0] - a[0]));
            const f = t * t * (3 - 2 * t);
            return { travel: a[1] + (b[1] - a[1]) * f, side: a[2] + (b[2] - a[2]) * f,
                turn: (a[3] + (b[3] - a[3]) * f) * Math.PI / 180, scale: a[4] + (b[4] - a[4]) * f };
        }
        a = b;
    }
    return { travel: 0, side: 0, turn: 0, scale: 1 };
}

export const FLOATING_WEAPON_ART: Readonly<Record<ToolId, WeaponArt>> = {
    wrench: { folder: 'arc-wrench', effect: 'contact', motion: [], tint: [255, 177, 89] },
    bypass_wrench: { folder: 'bypass-wrench', effect: 'contact', motion: [], tint: [255, 138, 98] },
    arc_gun: { folder: 'arc-gun', effect: 'arc', motion: [[1,-6,2,-14,1.15],[3,3,-1,9,1.04],[7,0,0,0,1]], tint: [110, 230, 251] },
    riveter: { folder: 'riveter', effect: 'rivet', motion: [[1,-10,0,10,1.12],[3,3,0,-6,1],[5,-2,0,2,1],[7,0,0,0,1]], tint: [245, 183, 98] },
    hydraulic_nailer: { folder: 'hydraulic-nailer', effect: 'nail', motion: [[1,5,0,0,1.12],[3,-16,0,-4,1.2],[6,-9,0,-2,1.06],[11,0,0,0,1]], tint: [246, 211, 157] },
    torch: { folder: 'torch', effect: 'jet', motion: [[2,-4,-2,-9,1.08],[5,-5,2,12,1.18],[8,-2,1,5,1.05],[10,0,0,0,1]], tint: [255, 137, 59] },
    pulse_nozzle: { folder: 'pulse-nozzle', effect: 'pulse', motion: [[1,5,0,0,1.18],[3,-13,0,0,0.88],[6,3,0,0,1.1],[9,0,0,0,1]], tint: [170, 218, 255] },
    induction: { folder: 'induction', effect: 'coil', motion: [[2,0,2,28,1.25],[5,0,4,90,1.15],[8,0,2,220,1.04],[12,0,0,360,1]], tint: [204, 159, 255] },
    traction_coil: { folder: 'traction-coil', effect: 'pull', motion: [[2,12,0,12,1.12],[4,9,0,18,1.18],[7,-7,0,-14,0.92],[11,0,0,0,1]], tint: [104, 241, 193] },
    split_probe: { folder: 'split-probe', effect: 'fork', motion: [[1,-3,-4,-16,1.12],[3,-3,4,18,1.12],[6,2,0,-4,1],[8,0,0,0,1]], tint: [166, 212, 255] },
};
