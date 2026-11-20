export const CAMPAIGN_MACHINE_ART = [
    'pursuer', 'reclaimer', 'jammer', 'ambusher', 'gatekeeper', 'tow', 'silence', 'core',
] as const;

export const CAMPAIGN_TOOL_ART = [
    'arc_gun', 'hydraulic_nailer', 'pulse_nozzle', 'traction_coil', 'split_probe', 'bypass_wrench',
] as const;

export function campaignArtBundle(key: string): string | null {
    if (key === 'city-restored') return 'campaign-ch04';
    const map = /^chapter-(0[1-4])(?:-upper)?$/.exec(key);
    if (map) return 'campaign-ch' + map[1];
    const arena = /^stage-(\d\d)$/.exec(key);
    if (!arena) return null;
    const stage = Number(arena[1]);
    return stage >= 3 && stage <= 20 ? 'campaign-ch0' + Math.ceil(stage / 5) : null;
}
