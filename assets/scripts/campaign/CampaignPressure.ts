import { ENEMIES, TICK_RATE } from '../m1/content';
import type { RegularEnemyId, RunRules, SpawnEdge, WaveSpec } from '../m1/content';
import type { ChallengeMode } from '../m1/Encounter';
import { CAMPAIGN_COMBAT_PLANS, CAMPAIGN_RESERVES } from './CampaignWaves';
import type { AuthoredStageId } from './CampaignWaves';

const EARLY_RESERVES = {
    '01': ['charger', 'crawler', 'turret', 'crawler'],
    '02': ['charger', 'crawler', 'armored', 'crawler'],
} as const;

// Ordinary drones fill the space between the authored specialists. Each column is one shop tier.
const ESCORTS = [
    [2, 3, 5, 6, 8], [2, 4, 6, 8, 10],
    [3, 5, 7, 9, 11], [3, 5, 8, 10, 12],
] as const;
const BOSS_HP = [
    168, 154, 168, 305, 272, 330, 355, 386, 418, 326,
    365, 402, 428, 463, 365, 430, 464, 490, 520, 472,
] as const;
// Additional attack groups for waves 2–5. Chapter entrances ease off after each boss.
const COUNTERATTACKS = [
    [0, 4, 6, 9], [5, 13, 16, 19], [7, 14, 18, 21], [7, 15, 19, 22], [9, 17, 21, 24],
    [7, 5, 23, 25], [8, 16, 21, 23], [9, 17, 22, 25], [10, 18, 23, 26], [11, 19, 25, 27],
    [8, 16, 22, 25], [10, 18, 23, 26], [11, 19, 24, 27], [12, 20, 25, 28], [12, 21, 27, 30],
    [9, 18, 23, 27], [11, 20, 25, 28], [12, 21, 26, 29], [13, 22, 27, 30], [14, 23, 29, 32],
] as const;

function escortedRoster(roster: readonly RegularEnemyId[], count: number, leaders: number, escorts: number): RegularEnemyId[] {
    const result: RegularEnemyId[] = [];
    for (let i = 0; i < count; i++) {
        result.push(roster[i % roster.length]);
        if ((i + 1) % leaders === 0 || i + 1 === count) {
            for (let j = 0; j < escorts; j++) result.push('crawler');
        }
    }
    return result;
}

export function campaignPressureRules(id: string, base: RunRules, mode: ChallengeMode = 'normal', _clearByKills = true): RunRules {
    if (mode !== 'normal') {
        const normal = campaignPressureRules(id, base);
        const rate = mode === 'overtime_2' ? 0.78 : 0.88;
        const faster = (ticks: number) => Math.max(1, Math.round(ticks * rate));
        const waves = normal.waves.map((wave, index) => {
            if (!wave.clear) return wave;
            const group = wave.clear.openingGroup!;
            const enemies = index === 2 && !wave.enemies.includes('armored')
                ? wave.enemies.map((kind, i) => i % group.size === group.size - 1 ? 'armored' as const : kind) : wave.enemies;
            return { ...wave, enemies, spawnEvery: faster(wave.spawnEvery),
                clear: { ...wave.clear, openingGroup: { ...group, every: faster(group.every) },
                    ...(wave.clear.counterattack ? { counterattack: { ...wave.clear.counterattack,
                        every: faster(wave.clear.counterattack.every) } } : {}) },
                ...(wave.escalation ? { escalation: { ...wave.escalation, spawnEvery: faster(wave.escalation.spawnEvery!) } } : {}) };
        });
        return { ...normal, waves, secondShopPart: undefined,
            ...(normal.encounter ? { encounter: { ...normal.encounter, revive: false } } : {}) };
    }
    if (base.campaignPressure) return base;
    const reserves = CAMPAIGN_RESERVES[id as AuthoredStageId] ?? EARLY_RESERVES[id as keyof typeof EARLY_RESERVES];
    const plan = CAMPAIGN_COMBAT_PLANS[id];
    const station = Number(id) - 1;
    const chapter = Math.floor(station / 5);
    const flanks: readonly SpawnEdge[] = Number(id) % 2 ? ['west', 'east'] : ['east', 'west'];
    const ends: readonly SpawnEdge[] = Number(id) % 2 ? ['north', 'south'] : ['south', 'north'];
    const twoToolWaves: WaveSpec[] = [];
    const waves = base.waves.map((wave, index): WaveSpec => {
        if (wave.boss) { twoToolWaves.push(wave); return { ...wave, bossEscorts: 4 + chapter * 2, seconds: Math.ceil(wave.seconds * 1.45) }; }
        const escalation = wave.escalation ?? (reserves && (index === 3 || index === 4) ? {
            atTick: Math.floor(wave.seconds * (index === 4 ? 0.68 : 0.55)) * TICK_RATE,
            ...(index === 4 ? { requiredTicks: 15 * TICK_RATE } : {}),
            spawnEvery: 43,
            enemies: reserves,
        } : undefined);
        const reserveCadence = escalation?.spawnEvery ?? wave.spawnEvery;
        const waveTicks = wave.seconds * TICK_RATE;
        const openingTicks = escalation?.atTick ?? waveTicks;
        const reserveTicks = escalation?.requiredTicks ?? waveTicks - openingTicks;
        const clear = wave.clear ?? {
            opening: wave.enemies.length ? killQuota(openingTicks, wave.spawnEvery) : 0,
            reserves: escalation?.enemies.length ? killQuota(reserveTicks, reserveCadence) : 0,
        };
        const arrival = plan?.arrivals[index];
        const leaders = arrival?.[0] ?? 1;
        const escorts = station === 0 ? [2, 3, 4, 4, 5][index] : ESCORTS[chapter][index];
        const openingRoster = escortedRoster(wave.enemies, clear.opening, leaders, escorts);
        const extra = index ? COUNTERATTACKS[station][index - 1] : 0;
        // Only one weapon slot is open before the second shop. Give short-range starters room to turn.
        const counter = { start: openingRoster.length, sweepGroup: extra, size: index < 2 ? 4 : 4 + index + chapter,
            every: [65, 62, 67, 69, 65][index], edges: index % 2 ? [...flanks, ...ends] : [...ends, ...flanks] };
        const specialists = (index >= 3 ? reserves : wave.enemies).filter(enemy => enemy !== 'crawler');
        // In the last push, stagger three ranks along one edge, then change sides.
        const sweepGroups = [9, 13, 17, 20, 24][index] + chapter * 2;
        const escortTarget = openingRoster.length + extra * counter.size;
        for (let squad = 0; squad < extra + sweepGroups; squad++) {
            for (let member = 0; member < counter.size; member++) {
                const sweep = squad - extra;
                const specialistBeat = sweep >= 0 ? index > 0 && sweep % 4 === 2
                    : index === 1 ? squad % 4 === 2 : squad % 3 !== 0;
                const leader = member === 0 && specialistBeat && specialists.length;
                openingRoster.push(leader ? specialists[squad % specialists.length] : 'crawler');
            }
        }
        const reserveRoster = escalation ? escortedRoster(escalation.enemies, clear.reserves, 1, 2) : [];
        const oldTotal = clear.opening + clear.reserves;
        const group = { size: leaders + escorts, every: arrival?.[1] ?? wave.spawnEvery,
            ...(arrival?.[3] ? { split: true as const } : {}), groupedLane: true as const };
        const entrances = arrival?.[2] === 'around' ? [...flanks, ...ends] : arrival?.[2] === 'ends' ? ends
            : arrival?.[2] === 'sides' ? flanks : index === 0 ? wave.spawnEdges : index === 1 ? ends : flanks;
        twoToolWaves.push({ ...wave, clear: { ...clear, openingGroup: { ...group, size: leaders } }, spawnEdges: entrances,
            ...(escalation ? { escalation: { atTick: escalation.atTick, enemies: escalation.enemies, spawnEdges: ends,
                spawnEvery: reserveCadence } } : {}) });
        return {
            ...wave, enemies: openingRoster, clear: { ...clear, opening: openingRoster.length, reserves: reserveRoster.length, openingGroup: group,
                counterattack: counter, escortTarget: escortTarget + reserveRoster.length,
                previousTarget: oldTotal,
                partBudget: Math.min(openingRoster.length + reserveRoster.length, Math.ceil(oldTotal * 1.15)),
                ...(id === '09' && index === 3 ? { reserveRestTicks: 18 } : {}) },
            spawnEdges: entrances,
            ...(escalation ? { escalation: {
                atTick: escalation.atTick, enemies: reserveRoster, spawnEdges: ends, groupSize: 3,
                spawnEvery: reserveCadence,
            } } : {}),
        };
    });
    return {
        ...base, campaignPressure: true, waves, twoToolWaves,
        secondShopPart: id === '01' ? 'wrench/dispatch' : id === '06' ? 'wrench/flywheel' : undefined,
        ...(base.encounter ? { encounter: {
            ...base.encounter, legacyBossHp: base.encounter.bossHp ?? ENEMIES.inspector.hp,
            enemyCap: station === 0 ? 20 : 24 + chapter * 4,
            bossHp: Math.round(BOSS_HP[station] * (1.47 + chapter * .08)),
            ...(plan?.duel ? { bossDuel: plan.duel } : {}),
            ...(plan?.inspectorOpener ? { inspectorOpener: plan.inspectorOpener } : {}),
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
        default: return '绕到巡检机侧面，等它停下再打';
        }
    }
    if (wave.clear?.openingGroup?.split) return '两侧都有敌机，先腾出一条退路';
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
    if (roster.has('charger')) return '冲锋机亮灯，往旁边躲';
    if ((wave.clear?.openingGroup?.size ?? 1) > 1) return '把敌机引到一侧，一起扫掉';
    return '边走边打，别让敌机围住你';
}
