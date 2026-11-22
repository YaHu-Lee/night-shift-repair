import { TICK_RATE } from '../m1/content';
import type { RegularEnemyId, RunRules, SpawnEdge, WaveSpec } from '../m1/content';
import type { ChallengeMode } from '../m1/Encounter';
import { CAMPAIGN_RESERVES } from './CampaignWaves';
import type { AuthoredStageId } from './CampaignWaves';

const EARLY_RESERVES = {
    '01': ['charger', 'crawler', 'turret', 'crawler'],
    '02': ['charger', 'crawler', 'armored', 'crawler'],
} as const;

export function campaignPressureRules(id: string, base: RunRules, mode: ChallengeMode = 'normal', _clearByKills = true): RunRules {
    const reserves = CAMPAIGN_RESERVES[id as AuthoredStageId] ?? EARLY_RESERVES[id as keyof typeof EARLY_RESERVES];
    const overtime = mode !== 'normal';
    const flanks: readonly SpawnEdge[] = Number(id) % 2 ? ['west', 'east'] : ['east', 'west'];
    const ends: readonly SpawnEdge[] = Number(id) % 2 ? ['north', 'south'] : ['south', 'north'];
    const rate = mode === 'overtime_2' ? 0.78 : 0.88;
    const faster = (cadence: number) => Math.max(21, Math.round(cadence * rate));
    const waves = base.waves.map((wave, index): WaveSpec => {
        if (wave.boss) return wave;
        const escalation = wave.escalation ?? (reserves && (index === 3 || index === 4) ? {
            atTick: Math.floor(wave.seconds * (index === 4 ? 0.68 : 0.55)) * TICK_RATE,
            ...(index === 4 ? { requiredTicks: 15 * TICK_RATE } : {}),
            spawnEvery: 43,
            enemies: reserves,
        } : undefined);
        const reserveCadence = escalation?.spawnEvery ?? wave.spawnEvery;
        const enemies: readonly RegularEnemyId[] = overtime && index === 2 && !wave.enemies.includes('armored')
            ? [...wave.enemies, 'armored'] : wave.enemies;
        const waveTicks = wave.seconds * TICK_RATE;
        const openingTicks = escalation?.atTick ?? waveTicks;
        const reserveTicks = escalation?.requiredTicks ?? waveTicks - openingTicks;
        // Changing challenge mode changes arrival spacing, while the normal kill total remains stable.
        const clear = wave.clear ?? {
            opening: wave.enemies.length ? killQuota(openingTicks, wave.spawnEvery) : 0,
            reserves: escalation?.enemies.length ? killQuota(reserveTicks, reserveCadence) : 0,
        };
        return {
            ...wave, enemies, clear,
            spawnEdges: index === 0 ? wave.spawnEdges : index === 1 ? ends : flanks,
            spawnEvery: overtime && index > 0 && wave.spawnEvery > 0 ? faster(wave.spawnEvery) : wave.spawnEvery,
            ...(escalation ? { escalation: {
                atTick: escalation.atTick, enemies: escalation.enemies, spawnEdges: ends,
                spawnEvery: overtime ? faster(reserveCadence) : reserveCadence,
            } } : {}),
        };
    });
    return {
        ...base, campaignPressure: true, waves,
        ...(base.encounter ? { encounter: {
            ...base.encounter, revive: !overtime && base.encounter.revive,
        } } : {}),
    };
}

function killQuota(ticks: number, cadence: number): number {
    return cadence > 0 ? Math.max(1, Math.round(ticks * 0.72 / cadence)) : 0;
}

export function campaignWaveHint(rules: RunRules, waveIndex: number, mode: ChallengeMode = 'normal'): string {
    const wave = rules.waves[waveIndex];
    if (!wave) return '';
    if (wave.boss) {
        switch (rules.encounter?.boss) {
        case 'supervisor': return '躲开炮线，绕到主管背后打';
        case 'elite': return '炮线一亮就走开，等领队停火再打';
        case 'gatekeeper': return '离开亮起的车道，扫击一过就打';
        case 'tow': return '钢缆一亮就往侧边躲';
        case 'silence': return '走出扇形亮区，等它停火再打';
        case 'core': return '走出预警区，等装甲打开再打核心';
        default: return '离开亮线，趁巡检机停下时打';
        }
    }
    const roster = new Set([...wave.enemies, ...(wave.escalation?.enemies ?? [])]);
    if (!rules.campaignPressure && mode !== 'normal' && waveIndex === 2) roster.add('armored');
    if (!rules.campaignPressure && mode === 'overtime_2' && waveIndex === 4) {
        roster.add('charger');
        roster.add('turret');
    }
    if (roster.has('jammer')) return '干扰机脚下亮圈，先走到圈外';
    if (roster.has('reclaimer')) return wave.directive?.type === 'escort'
        ? '回收机拉住电池车时，穿过钢缆拦住它' : '回收机亮出钢缆，往侧面躲';
    if (roster.has('ambusher')) return '脚灯在闪，等埋伏机露头再打';
    if (roster.has('armored') && roster.has('turret') && rules.encounter?.armorLine) return '护甲机挡着炮台，从侧面绕过去';
    if (roster.has('turret') && roster.has('charger')) return '炮线和冲车都走直线，从侧面绕';
    if (roster.has('armored')) return '绕到护甲机背后打';
    if (roster.has('turret')) return '炮台瞄准了，往侧面躲';
    if (roster.has('pursuer')) return '被追击机咬住就拐个急弯';
    if (roster.has('charger')) return '冲车亮灯，往侧边躲';
    return '别停，绕着爬虫打';
}
