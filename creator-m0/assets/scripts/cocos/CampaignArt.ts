export const CAMPAIGN_MACHINE_ART = [
    'pursuer', 'reclaimer', 'jammer', 'ambusher', 'gatekeeper', 'tow', 'silence', 'core',
] as const;

export const CAMPAIGN_TOOL_ART = [
    'arc_gun', 'hydraulic_nailer', 'pulse_nozzle', 'traction_coil', 'split_probe', 'bypass_wrench',
] as const;

export const PIXEL_ARENAS: Readonly<Record<string, string>> = {
    yard: 'campaign-ch01',
    'pump-floor': 'campaign-ch01',
    'stage-03': 'campaign-ch01',
    'stage-04': 'campaign-ch01',
    'stage-05': 'campaign-ch01',
    'stage-06': 'campaign-ch02',
    'stage-07': 'campaign-ch02',
    'stage-08': 'campaign-ch02',
    'stage-09': 'campaign-ch02',
    'stage-10': 'campaign-ch02',
    'stage-11': 'campaign-ch03',
    'stage-12': 'campaign-ch03',
    'stage-13': 'campaign-ch03',
    'stage-14': 'campaign-ch03',
    'stage-15': 'campaign-ch03',
    'stage-16': 'campaign-ch04',
    'stage-17': 'campaign-ch04',
    'stage-18': 'campaign-ch04',
    'stage-19': 'campaign-ch04',
    'stage-20': 'campaign-ch04',
};

export const PIXEL_MENU_ART: Readonly<Record<string, string>> = {
    'night-depot': 'campaign-ch01',
    workbench: 'campaign-ch01',
    'chapter-01': 'campaign-ch01',
    'chapter-01-upper': 'campaign-ch01',
    'chapter-02': 'campaign-ch02',
    'chapter-03': 'campaign-ch03',
    'chapter-04': 'campaign-ch04',
    'city-restored': 'campaign-ch04',
};

export const PIXEL_DISPATCH_CHAPTERS: readonly string[] = ['01', '02', '03', '04'];

export function chapterForStationId(stationId: string): string | null {
    const num = Number(stationId);
    if (!Number.isInteger(num) || num < 1 || num > 20) return null;
    return '0' + Math.ceil(num / 5);
}

export function campaignArtBundle(key: string): string | null {
    if (key === 'night-depot' || key === 'workbench') return 'campaign-ch01';
    if (key === 'city-restored') return 'campaign-ch04';
    const map = /^chapter-(0[1-4])(?:-upper)?$/.exec(key);
    if (map) return 'campaign-ch' + map[1];
    const arena = /^stage-(\d\d)$/.exec(key);
    if (!arena) return null;
    const stage = Number(arena[1]);
    return stage >= 3 && stage <= 20 ? 'campaign-ch0' + Math.ceil(stage / 5) : null;
}
