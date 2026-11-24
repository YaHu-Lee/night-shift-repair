import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { Campaign } from '../.m0-build/campaign/Campaign.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { WORKSHOP_TIERS } from '../.m0-build/campaign/CampaignLedger.js';
import { campaignPressureRules } from '../.m0-build/campaign/CampaignPressure.js';
import { firstEquipmentPair } from '../.m0-build/m1/Equipment.js';
import { Run } from '../.m0-build/m1/Run.js';
import { ENEMIES, MAGNET_PULSE, TICK_RATE } from '../.m0-build/m1/content.js';
import { MELEE_RETURN_TICKS, createMeleeMotion, isMeleeTool } from '../.m0-build/m1/WeaponMotion.js';
import { makePlatform } from '../.m0-build/platform/platform.js';
import { chooseDestination, equipCampaignGear } from './campaign-balance.mjs';

const profiles = {
    lean: { limit: 1, training: 0, refresh: false },
    standard: { limit: 2, training: 1, refresh: false },
    stocked: { limit: 3, training: 3, refresh: true },
};
// Additional targets per cast in a representative pack, before parts and range.
const crowdHits = {
    wrench: .6, bypass_wrench: .5, arc_gun: .6, riveter: .7, torch: .9, induction: 1.1,
    hydraulic_nailer: .35, pulse_nozzle: .65, traction_coil: .6, split_probe: .8,
};
const enemyCost = { crawler: 1, charger: 1.15, turret: 1.22, armored: 1.35,
    pursuer: 1.1, reclaimer: 1.2, jammer: 1.25, ambusher: 1.2 };

function openingDemand(spec) {
    if (!spec.clear?.opening || !spec.enemies.length) return 0;
    const { size = 1, every = spec.spawnEvery } = spec.clear.openingGroup ?? {};
    const count = spec.clear.counterattack?.start ?? spec.clear.opening;
    const roster = Array.from({ length: count }, (_, index) => spec.enemies[index % spec.enemies.length]);
    const cost = roster.reduce((sum, enemy) => sum + ENEMIES[enemy].hp * enemyCost[enemy], 0);
    return TICK_RATE * size / every * cost / roster.length;
}

function effectiveInterval(battle, id, reach, interval) {
    if (!isMeleeTool(id)) return interval;
    const dock = { x: 0, y: 0 };
    return [0, 1].reduce((sum, sequence) => {
        const motion = createMeleeMotion(id, sequence, dock, battle.player, 1, 0, reach, battle.field);
        return sum + Math.max(interval, motion.last + MELEE_RETURN_TICKS);
    }, 0) / 2;
}

function combatPower(battle) {
    const { actor, weapons } = battle.equipment;
    let crowd = 0, boss = 0;
    for (const [index, weapon] of weapons.entries()) {
        const { id, damage, close, far, heat, arcLink, combo, pierce, targets, hops, chainReach, spread } = weapon;
        const { reach, interval } = battle.runtime[index];
        const melee = isMeleeTool(id);
        const cadence = effectiveInterval(battle, id, reach, interval);
        const cooldown = battle.blueprint === 'quick_release_heatsink' ? 36 : 48;
        const burst = battle.blueprint === 'quick_release_heatsink' ? 5 : 6;
        const attackRate = heat ? TICK_RATE * burst / ((burst - 1) * cadence + cooldown) : TICK_RATE / cadence;
        const base = damage + .25 * (close + far) + (heat ? (burst - 3) / burst : 0);
        const comboHit = id === 'bypass_wrench' ? (3 + combo) / 4 : 0;
        const mark = melee && arcLink ? 1 : 0;
        const extra = crowdHits[id] + .34 * pierce + .55 * targets + .1 * hops + .003 * chainReach
            + (id === 'riveter' || id === 'hydraulic_nailer' ? .035 : .5) * spread;
        const crowdReach = reach / (reach + 45);
        const bossReach = reach / (reach + 65);
        crowd += attackRate * crowdReach * ((base + .35 * (comboHit + mark)) * (1 + extra) + (!melee && arcLink ? .55 : 0));
        boss += attackRate * bossReach * (base + .75 * (comboHit + mark));
    }
    if (actor.pulse) crowd += MAGNET_PULSE.damage * 1.5 / MAGNET_PULSE.parts * Math.min(1.25, actor.pickupRadius / 39);
    const survival = (actor.maxHp + Number(actor.shield)) * Math.sqrt(actor.moveScale);
    return { crowd, boss, survival, score: 100 * (crowd / 3.83) ** .45 * (boss / 2) ** .35 * (survival / 10) ** .2 };
}

function visitShop(run, profile) {
    const pair = run.data.wave === 0 ? firstEquipmentPair(run.data) : null;
    const count = equipCampaignGear(run, pair, profile.limit);
    if (profile.refresh && run.data.wave > 0 && count < profile.limit && run.refresh(run.data.revision)) {
        equipCampaignGear(run, pair, profile.limit - count);
    }
    if (!run.nextWave(run.data.revision)) throw new Error('Unable to start the next wave');
}

function play(stage, campaign, starter, route, seed, profile) {
    const run = new Run(makePlatform(memory(), 'power-run'), stage.rules, {
        clearByKills: true, shopWeapons: () => campaign.availableShopWeapons(stage.id),
        rulesForEquipment: (mode, counted) => campaignPressureRules(stage.id, stage.rules, mode, counted),
    });
    const blueprint = campaign.profile.selectedBlueprint ?? undefined;
    const supplies = WORKSHOP_TIERS[campaign.workshopTier].supplies;
    run.start(route, seed, starter, 'power-'+stage.id, blueprint, 'normal', supplies, campaign.trainingLoadout(starter, route));
    const waves = [];
    while (run.data.phase === 'battle') {
        const b = run.battle;
        const power = combatPower(b);
        const bossHp = b.boss?.unit.hp ?? 0;
        let peak = 0, firstAttack = 0, attacks = 0, priorPhase, lastHit = 0;
        let visibleEnemies = 0, samples = 0, peakVisible = 0, largestKillBurst = 0, previousKills = 0;
        const hitSources = {};
        const patterns = new Set();
        const maxTicks = b.clearProgress ? Math.max(180 * TICK_RATE, b.duration * 4) : b.duration;
        for (let tick = 0; run.battle === b && tick <= maxTicks; tick++) {
            if (b.tick % 7 === 0) chooseDestination(b, starter, b.equipment.weapons[0].reach);
            run.advance(1 / TICK_RATE);
            peak = Math.max(peak, b.enemies.length);
            if (!b.boss && b.tick % 6 === 0) {
                const view = b.spawnBounds;
                const visible = b.enemies.filter(e => e.x >= view.left && e.x <= view.right && e.y >= view.bottom && e.y <= view.top).length;
                visibleEnemies += visible;
                samples++;
                peakVisible = Math.max(peakVisible, visible);
            }
            largestKillBurst = Math.max(largestKillBurst, b.kills - previousKills);
            previousKills = b.kills;
            if (b.damageTaken > lastHit) {
                hitSources[b.lastHit] = (hitSources[b.lastHit] ?? 0) + b.damageTaken - lastHit;
                lastHit = b.damageTaken;
            }
            if (!b.boss) continue;
            const chapter = b.chapterBoss;
            const active = chapter?.volley?.state === 'active' ? chapter.volley.pattern
                : chapter?.hazard?.state === 'active' ? chapter.hazard.shape : undefined;
            const inspector = !chapter && (['sweep', 'charge', 'volley'].includes(b.boss.phase)
                || priorPhase === 'warning' && b.boss.phase === 'recover') ? b.boss.attack : undefined;
            if ((active && chapter.phaseStartedAt === b.tick) || inspector && b.boss.phase !== priorPhase) {
                firstAttack ||= b.tick;
                attacks++;
                patterns.add(active ?? inspector);
            }
            priorPhase = b.boss.phase;
        }
        waves.push({ seconds: b.tick / TICK_RATE, kills: b.kills, peak, hits: b.damageTaken,
            health: b.player.hp, power, tools: b.tools.map(tool => tool.id), hitSources,
            ...(b.boss ? { attacks, firstAttack: firstAttack / TICK_RATE, patterns: [...patterns], hp: bossHp,
                actualDps: (bossHp - Math.max(b.boss.unit.hp, 0)) / (b.tick / TICK_RATE) }
                : { demand: openingDemand(b.spec), meanVisible: visibleEnemies / Math.max(1, samples), peakVisible, largestKillBurst }) });
        if (run.data.phase !== 'shop') break;
        visitShop(run, profile);
    }
    const phase = run.data.phase;
    run.dispose();
    return { stage: stage.id, route, seed, starter, phase, waves, parts: run.data.parts };
}

function memory() {
    const slots = new Map();
    return { localStorage: { getItem: key => slots.get(key) ?? null, setItem: (key, value) => slots.set(key, value) } };
}

function prepare(campaign, profile, starter) {
    for (let step = 0; step < profile.training; step++) {
        const revision = campaign.profile.revision;
        if (campaign.roleTraining('vitality').rank === 0 && campaign.trainRole('vitality', revision)) continue;
        if (campaign.trainWeapon(starter, revision) || campaign.trainRole('mobility', revision)
            || campaign.trainRole('vitality', revision) || campaign.trainRole('collection', revision)) continue;
        break;
    }
    if (profile.refresh && campaign.weaponTraining(starter).rank === 3) {
        campaign.selectStarterAttachment(starter, starter+'/signature', campaign.profile.revision);
    }
}

function unlockNext(campaign, stage) {
    // Construct the account for the next first-clear attempt through the same reward contract.
    const runId = 'power-clear-'+stage.id;
    if (!campaign.beginAttempt(stage.id, runId) || campaign.replayResult(stage.id,
        { phase: 'won', finishReason: 'cleared', runId, wave: stage.finalWave, contentVersion: stage.contentVersion }) !== 'committed') {
        throw new Error('Unable to award campaign progress for '+stage.id);
    }
}

const { values } = parseArgs({ options: { out: { type: 'string' }, seeds: { type: 'string' } } });
const seeds = (values.seeds ?? '42,1729,20261120,3173,1439,773,311,20261123').split(',').map(Number);
if (seeds.some(seed => !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff)) throw new Error('Invalid seed');
const results = [];
for (const [name, profile] of Object.entries(profiles)) for (const route of ['arc','magnet']) for (const seed of seeds) {
    const campaign = new Campaign(makePlatform(memory(), 'power-account'));
    let reward = 'wrench';
    for (const stage of CAMPAIGN_CATALOG) {
        const starter = route === 'magnet' && campaign.canUseStarter(stage.id, reward) ? reward : 'wrench';
        prepare(campaign, profile, starter);
        results.push({ profile: name, pool: campaign.availableShopWeapons(stage.id), ...play(stage, campaign, starter, route, seed, profile) });
        unlockNext(campaign, stage);
        reward = stage.firstClearWeapon ?? reward;
    }
}
function quantile(sample, p = .5) {
    const sorted = [...sample].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.round((sorted.length - 1) * p)] : null;
}
const summary = CAMPAIGN_CATALOG.flatMap(stage => Object.keys(profiles).map(profile => {
    const cases = results.filter(row => row.stage === stage.id && row.profile === profile);
    const bosses = cases.flatMap(row => row.waves.filter(wave => wave.hp));
    const median = (rows, read) => quantile(rows.map(read));
    return { stage: stage.id, profile, cases: cases.length, wins: cases.filter(row => row.phase === 'won').length,
        stock: cases[0].pool.length, kit: median(bosses, row => row.tools.length),
        power: median(bosses, row => row.power.score), bossPower: median(bosses, row => row.power.boss),
        crowdByWave: stage.rules.waves.slice(0, 5).map((_, index) => median(cases.flatMap(row => row.waves[index] ?? []), row => row.power.crowd)),
        demandByWave: stage.rules.waves.slice(0, 5).map(openingDemand),
        survivalByWave: stage.rules.waves.slice(0, 5).map((_, index) => median(cases.flatMap(row => row.waves[index] ?? []), row => row.power.survival)),
        waveTime: stage.rules.waves.slice(0, 5).map((_, index) => median(cases.flatMap(row => row.waves[index] ?? []), row => row.seconds)),
        peak: median(cases, row => Math.max(...row.waves.slice(0, 5).map(wave => wave.peak))),
        hit90: quantile(cases.map(row => Math.max(...row.waves.map(wave => wave.hits))), .9),
        boss: median(bosses, row => row.seconds), boss90: quantile(bosses.map(row => row.seconds), .9),
        actualDps: median(bosses, row => row.actualDps), patterns: median(bosses, row => row.patterns.length),
        pattern10: quantile(bosses.map(row => row.patterns.length), .1),
    };
}));
for (const {stage, profile, wins, kit, power, boss, boss90, patterns, hit90, peak} of summary) {
    console.log(stage, profile.padEnd(8), wins+'/'+(seeds.length*2), kit, power?.toFixed(0), boss?.toFixed(1), boss90?.toFixed(1), patterns, hit90, peak);
}
if (values.out) {
    mkdirSync(dirname(values.out), { recursive: true });
    writeFileSync(values.out, JSON.stringify({ seeds, summary, results }, null, 2)+'\n');
}
