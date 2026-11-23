import type { ToolId } from '../m1/content';

type Effect = 'contact' | 'arc' | 'rivet' | 'nail' | 'jet' | 'pulse' | 'coil' | 'pull' | 'fork';
interface WeaponArt {
    folder: string;
    effect: Effect;
    recoil: number;
    peak: number;
    settle: number;
    tint: readonly [number, number, number];
}

export const FLOATING_WEAPON_ART: Readonly<Record<ToolId, WeaponArt>> = {
    wrench: { folder: 'arc-wrench', effect: 'contact', recoil: 0, peak: 1, settle: 7, tint: [255, 177, 89] },
    bypass_wrench: { folder: 'bypass-wrench', effect: 'contact', recoil: 0, peak: 1, settle: 8, tint: [255, 138, 98] },
    arc_gun: { folder: 'arc-gun', effect: 'arc', recoil: 8, peak: 1.15, settle: 6, tint: [110, 230, 251] },
    riveter: { folder: 'riveter', effect: 'rivet', recoil: 9, peak: 0.9, settle: 6, tint: [245, 183, 98] },
    hydraulic_nailer: { folder: 'hydraulic-nailer', effect: 'nail', recoil: 13, peak: 1.5, settle: 9, tint: [246, 211, 157] },
    torch: { folder: 'torch', effect: 'jet', recoil: 4, peak: 2.6, settle: 7, tint: [255, 137, 59] },
    pulse_nozzle: { folder: 'pulse-nozzle', effect: 'pulse', recoil: 11, peak: 1.7, settle: 8, tint: [170, 218, 255] },
    induction: { folder: 'induction', effect: 'coil', recoil: 0, peak: 2.8, settle: 11, tint: [204, 159, 255] },
    traction_coil: { folder: 'traction-coil', effect: 'pull', recoil: -7, peak: 2.3, settle: 9, tint: [104, 241, 193] },
    split_probe: { folder: 'split-probe', effect: 'fork', recoil: 5, peak: 0.95, settle: 5, tint: [166, 212, 255] },
};
