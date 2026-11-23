import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { campaignPressureRules } from '../.m0-build/campaign/CampaignPressure.js';
import { Run } from '../.m0-build/m1/Run.js';
import { firstEquipmentPair, resolveEquipment } from '../.m0-build/m1/Equipment.js';
import { FIRST_PAIR, TICK_RATE, TOOLS, TUNING_STEPS, attackReach, isTool, offer, toolTuningStats } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

// Run npm run build:web first. The bot only uses movement destinations and shop actions.
// This measures combat ticks. Human reaction time and device performance require separate playtests.
const DEFAULT_SEEDS = [20261120, 42, 1729, 1, 3173, 20261121, 173, 922, 1439, 773];
const directionSamples = Array.from({ length: 12 }, (_, index) => ({
    x: Math.cos(index * Math.PI / 6), y: Math.sin(index * Math.PI / 6),
}));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const insideField = (point, field) => ({
    x: clamp(point.x, field.left + 12, field.right - 12),
    y: clamp(point.y, field.bottom + 12, field.top - 12),
});

function towards(from, to, limit) {
    const ratio = Math.min(1, limit / Math.max(1, distance(from, to)));
    return { x: from.x + ratio * (to.x - from.x), y: from.y + ratio * (to.y - from.y) };
}

function distanceToSegment(point, start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const offset = (point.x - start.x) * dx + (point.y - start.y) * dy;
    const projection = clamp(offset / (dx * dx + dy * dy || 1), 0, 1);
    return distance(point, { x: start.x + projection * dx, y: start.y + projection * dy });
}

function hazardDepth(hazard, position) {
    if (!hazard) return 0;
    if (hazard.shape === 'tether') return Math.max(0, hazard.width + 3 - distanceToSegment(position, hazard, hazard.end));
    if (hazard.shape === 'rect') {
        return Math.max(0, 3 + Math.min(position.x - hazard.left, hazard.right - position.x,
            position.y - hazard.bottom, hazard.top - position.y));
    }
    const angle = (Math.atan2(position.y - hazard.y, position.x - hazard.x) - hazard.from + 4 * Math.PI) % (2 * Math.PI);
    const distanceFromOrigin = distance(position, hazard);
    if (angle >= hazard.sweep || distanceFromOrigin >= hazard.radius) return 0;
    const edgeAngle = Math.min(angle, hazard.sweep - angle, Math.PI / 2);
    return Math.min(hazard.radius - distanceFromOrigin, distanceFromOrigin * Math.sin(edgeAngle));
}

function chooseDestination(battle, tool, equippedReach) {
    const { player, tick, chapterBoss, boss, field } = battle;
    const hazard = chapterBoss?.hazard;
    let target;
    let desiredRange = 8;
    let urgency = 0.62;
    const angle = tick / 65;
    const reach = equippedReach ?? (battle.tools[0].tuning ? toolTuningStats(battle.tools[0]).reach : TOOLS[tool].reach);
    const weaponReach = attackReach(tool, reach, battle.rules.sweptMelee);
    const bossRange = Math.min(weaponReach - 8, 74);
    if (!boss && battle.enemies.length) {
        // Work toward the current pack. In a larger field the cap can be reached before
        // the last group spawns, so waiting to orbit until the full batch arrives can stall.
        target = battle.enemies.reduce((closest, enemy) =>
            distance(player, enemy) < distance(player, closest) ? enemy : closest);
        desiredRange = Math.min(70, weaponReach * 0.78);
        urgency = 1.35;
    }
    if (boss && !target && (chapterBoss?.hp ?? boss.unit.hp) > 0) {
        target = insideField({ x: boss.unit.x + bossRange * Math.cos(angle), y: boss.unit.y + bossRange * Math.sin(angle) }, field);
        desiredRange = 16;
        urgency = 1.25;
    } else if (!target) {
        target = {
            x: (field.left + field.right) / 2 + (field.right - field.left) * 0.31 * Math.cos(angle),
            y: (field.bottom + field.top) / 2 + (field.top - field.bottom) * 0.36 * Math.sin(angle),
        };
    }

    const candidates = [insideField(target, field), player, ...directionSamples.map(({ x, y }) =>
        insideField({ x: player.x + 40 * x, y: player.y + 40 * y }, field))];
    let best = -Infinity;
    let chosen = target;
    for (const candidate of candidates) {
        const point = towards(player, candidate, 39);
        let score = -urgency * Math.max(0, distance(point, target) - desiredRange);
        const exposed = hazardDepth(hazard, point);
        if (exposed > 0) score -= (hazard.state === 'active' ? 110 : 55) + 2.6 * exposed;
        for (const bullet of battle.bullets) {
            const future = { x: bullet.x + 8 * bullet.vx, y: bullet.y + 8 * bullet.vy };
            score -= Math.max(0, 22 - distanceToSegment(point, bullet, future)) * 3;
        }
        for (const enemy of battle.enemies) {
            if (enemy.hp <= 0) continue;
            const gap = distance(point, enemy);
            if (enemy === boss?.unit) {
                score -= Math.max(0, 26 - gap) * 2;
                if (!chapterBoss || chapterBoss.vulnerable) {
                    score -= Math.max(0, gap - bossRange) * (desiredRange > 20 ? 0.28 : 0.65);
                }
                if (!chapterBoss && (boss.phase === 'warning' && boss.attack === 'sweep'
                    || boss.phase === 'sweep' || boss.phase === 'charge')) {
                    const end = { x: enemy.x + 230 * enemy.vx, y: enemy.y + 230 * enemy.vy };
                    if (distanceToSegment(point, enemy, end) < 22) score -= 87;
                }
                continue;
            }
            score -= Math.max(0, 55 - gap) * (urgency > 1 ? 0.70 : 1.8) + Math.max(0, 23 - gap) * 2.5;
            if (enemy.kind === 'charger' && (enemy.state === 'warn' || enemy.state === 'dash')) {
                const end = { x: enemy.x + 132 * enemy.vx, y: enemy.y + 132 * enemy.vy };
                if (distanceToSegment(point, enemy, end) < 22) score -= 80;
            }
        }
        if (score > best) {
            best = score;
            chosen = candidate;
        }
    }
    const destination = distance(chosen, player) > 2 ? chosen : player;
    battle.moveTo(destination.x, destination.y);
}

function equip(run, route, reserve = 0) {
    const buy = (item, slot = 0) => Boolean(item && run.canBuy(item, slot)
        && run.data.parts - offer(item).price >= reserve && run.buy(item, slot, run.data.revision));
    if (run.data.wave === 0) buy(FIRST_PAIR[route]);
    if (run.data.tools.length === 1) {
        const primary = run.data.tools[0].id;
        const preferred = ['induction', 'riveter', 'torch', 'arc_gun', 'pulse_nozzle', 'split_probe'];
        const item = preferred.find((id) => id !== primary && run.canBuy(id, 0));
        buy(item ?? run.data.shop.offers.find((id) => isTool(id) && run.canBuy(id, 0)));
    }
    if (run.data.wave === 0) return;
    const mods = ['plate', 'bearings', 'sorter', 'coil', 'ring', 'exchanger', 'valve', 'relay', 'contact', 'splitter', 'sweeper', 'ceramic'];
    for (const mod of mods) {
        for (const [slot, tool] of run.data.tools.entries()) {
            if (!tool.mods.includes(mod) && buy(mod, slot)) break;
        }
    }
}

function equipmentTargets(shop, item) {
    if (item.kind === 'weapon') return [{ kind: 'weapon' }];
    if (item.kind === 'gear') return shop.gear.filter(slot => !slot.locked && !slot.item)
        .map(({ slot }) => ({ kind: 'gear', slot }));
    return shop.weapons.flatMap((weapon, index) => weapon.slots.filter(slot => !slot.locked && !slot.item)
        .map(({ slot }) => ({ kind: 'attachment', weapon: index, slot })));
}

function equipCampaignGear(run, firstPair) {
    const shop = run.equipmentShop;
    const weaponPriority = ['induction', 'riveter', 'torch', 'arc_gun', 'split_probe'];
    const gearPriority = ['gear/padding', 'gear/runner', 'gear/guard', 'gear/pulse', 'gear/pickup', 'gear/sorter'];
    const priority = item => {
        if (item.id === firstPair) return -20;
        const preferences = item.kind === 'weapon' ? weaponPriority : gearPriority;
        const index = preferences.indexOf(item.id);
        const order = index < 0 ? preferences.length : index;
        return item.kind === 'weapon' ? order - 10 : item.kind === 'gear' ? order : 0;
    };
    let purchases = 0;
    for (const item of [...shop.offers].sort((first, second) => priority(first) - priority(second))) {
        const target = equipmentTargets(run.equipmentShop, item).find(slot => run.previewEquipment(item.id, slot)?.allowed);
        if (target && run.buyEquipment(item.id, target, run.data.revision)) purchases++;
    }
    return purchases;
}

export function playCampaignBattle(run, { tuning = false } = {}) {
    const { route, tools: [starter] } = run.data;
    let battle;
    let peak = 0;
    let firstShop = null;
    let equipmentPurchases = 0;
    let countedShops = 0;
    while (run.data.phase === 'battle') {
        battle = run.battle;
        const { tools, equipment, blueprint } = run.data;
        const reach = equipment && resolveEquipment(tools, equipment, route, run.rules.maxHp, blueprint).weapons[0].reach;
        // Counted waves have no game deadline. Bound only the benchmark so a stalled run is reported.
        const stepLimit = battle.clearProgress ? Math.max(180, battle.spec.seconds * 4) * TICK_RATE : battle.duration;
        for (let i = 0; run.battle === battle && !run.waitingForSave && i <= stepLimit; i++) {
            if (battle.tick % 7 === 0) chooseDestination(battle, starter.id, reach);
            peak = Math.max(peak, battle.enemies.length);
            run.advance(1 / TICK_RATE);
        }
        if (run.data.phase !== 'shop') break;
        const progress = battle.clearProgress;
        if (progress && (progress.kills !== progress.total || battle.enemies.length || battle.warnings.length)) {
            throw new Error(`Wave ${battle.wave + 1} opened shop with ${progress.kills}/${progress.total} kills, `
                + `${battle.enemies.length} enemies and ${battle.warnings.length} queued warnings`);
        }
        if (progress) countedShops++;
        if (equipment) {
            const firstPair = run.data.wave === 0 ? firstEquipmentPair(run.data) : null;
            if (firstPair) {
                const shop = run.equipmentShop;
                const item = shop.offers.find(offer => offer.id === firstPair);
                firstShop = { parts: run.data.parts, pairAffordable: !!item && equipmentTargets(shop, item)
                    .some(target => run.previewEquipment(item.id, target)?.allowed) };
            }
            equipmentPurchases += equipCampaignGear(run, firstPair);
        } else {
            if (run.data.wave === 0) {
                firstShop = { parts: run.data.parts, pairAffordable: run.canBuy(FIRST_PAIR[route], 0) };
            }
            const calibration = tuning ? run.tuning : null;
            if (calibration) {
                const choice = calibration.choices[route === 'arc' ? 0 : 1].id;
                run.tune(0, choice, run.data.revision);
            }
            const nextCalibration = tuning && Object.values(TUNING_STEPS).find(step => step.wave === run.data.wave + 1);
            equip(run, route, nextCalibration?.cost ?? 0);
        }
        if (!run.nextWave(run.data.revision)) throw new Error(`Could not leave shop at wave ${battle.wave + 1}`);
    }
    return { battle, peak, firstShop, equipmentPurchases, countedShops };
}

function play(stage, route, tool, seed, { tuning, challenge, equipment }) {
    const storage = new Map();
    const host = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
    const mode = challenge && stage.rules.encounter?.overtime ? 'overtime_1' : 'normal';
    const run = new Run(makePlatform(host, 'campaign-balance'), stage.rules, {
        clearByKills: true,
        rulesForEquipment: (requestedMode, counted) => campaignPressureRules(stage.id, stage.rules, requestedMode, counted),
    });
    run.start(route, seed, tool, 'balance', undefined, mode, 0, equipment ? {} : undefined);
    const { battle, peak, firstShop, equipmentPurchases, countedShops } = playCampaignBattle(run, { tuning });
    const { data } = run;
    const result = {
        id: stage.id, chapter: stage.chapter, route, tool, seed, mode, peak, firstShop, phase: data.phase,
        wave: battle.wave + 1, seconds: data.reports.reduce((sum, report) => sum + report.ticks / TICK_RATE, 0),
        finalSeconds: battle.tick / TICK_RATE, hp: battle.player.hp,
        failureDetail: data.reports.at(-1)?.failureDetail,
        bossHP: battle.boss?.unit.hp, hit: battle.lastHit, tools: data.tools.map((item) => item.id),
        ...(battle.clearProgress ? { clearProgress: battle.clearProgress,
            remainingEnemies: battle.enemies.length, queuedWarnings: battle.warnings.length } : {}),
        tuning: data.tools.flatMap(item => Object.values(item.tuning ?? {})),
        ...(equipment ? { equipmentPurchases } : {}),
        countedShops, expectedCountedShops: run.rules.waves.length - 1,
    };
    run.dispose();
    return result;
}

function runBenchmark(args) {
    const tuning = args.includes('--tuning');
    const equipment = args.includes('--equipment');
    const flags = ['--tuning', '--pressure', '--challenge', '--equipment'];
    const challenge = args.includes('--challenge');
    const [range, samples] = args.filter(argument => !flags.includes(argument));
    const bounds = (range ?? '01-20').split('-').map(Number);
    const seeds = samples ? samples.split(',').map(Number) : DEFAULT_SEEDS;
    if (tuning && equipment || [...bounds, ...seeds].some((value) => !Number.isSafeInteger(value))
        || bounds[0] < 1 || (bounds[1] ?? bounds[0]) < bounds[0] || (bounds[1] ?? bounds[0]) > 20) {
        throw new Error('Usage: node scripts/campaign-balance.mjs [01-20] [seed1,seed2] [--tuning|--equipment] [--challenge]');
    }
    const stageCount = (bounds[1] ?? bounds[0]) - bounds[0] + 1;
    const expectedRuns = stageCount * seeds.length * 2;
    const results = [];
    const options = { tuning, challenge, equipment };
    let unlocked = 'wrench';
    for (const stage of CAMPAIGN_CATALOG) {
        if (Number(stage.id) >= bounds[0] && Number(stage.id) <= (bounds[1] ?? bounds[0])) {
            for (const seed of seeds) {
                results.push(play(stage, 'arc', 'wrench', seed, options), play(stage, 'magnet', unlocked, seed, options));
            }
        }
        unlocked = stage.firstClearWeapon ?? unlocked;
    }
    const failures = results.filter((row) => row.phase !== 'won');
    console.log(`${results.length - failures.length}/${expectedRuns} successful runs`);
    for (const failure of failures) console.log(JSON.stringify(failure));
    const visits = results.flatMap(row => row.firstShop ? [row.firstShop] : []);
    const firstShop = {
        visits: visits.length,
        minimumParts: visits.length ? Math.min(...visits.map(shop => shop.parts)) : null,
        affordablePairs: visits.filter(shop => shop.pairAffordable).length,
    };
    console.log(JSON.stringify({ firstShop }));
    const incorrectShopCounts = results.filter(row => row.countedShops !== row.expectedCountedShops);
    console.log(JSON.stringify({ countedShops: results.reduce((total, row) => total + row.countedShops, 0),
        expectedCountedShops: results.reduce((total, row) => total + row.expectedCountedShops, 0) }));
    if (equipment) {
        const purchases = results.map(row => row.equipmentPurchases);
        console.log(JSON.stringify({ equipment: { minimumPurchases: Math.min(...purchases),
            averagePurchases: purchases.reduce((total, count) => total + count, 0) / purchases.length } }));
    }
    const calibrationCount = results.filter(row => row.tuning.length === 2).length;
    if (tuning) {
        console.log(JSON.stringify({ calibratedBothShops: calibrationCount, expectedRuns }));
        for (const row of results.filter(row => row.tuning.length !== 2)) {
            console.log(JSON.stringify({ id: row.id, route: row.route, seed: row.seed, tuning: row.tuning }));
        }
    }
    for (const route of ['arc', 'magnet']) {
        const firstSample = results.filter((row) => row.route === route && row.seed === seeds[0]);
        if (firstSample.length !== stageCount || firstSample.some((row) => row.phase !== 'won')) continue;
        const byChapter = Object.fromEntries(['01', '02', '03', '04'].map((chapter) => [
            chapter, firstSample.filter((row) => row.chapter === chapter).reduce((sum, row) => sum + row.seconds, 0) / 60,
        ]));
        console.log(JSON.stringify({ route, seed: seeds[0], combatMinutes: Object.values(byChapter).reduce((a, b) => a + b, 0), byChapter }));
    }
    if (results.length !== expectedRuns || failures.length || incorrectShopCounts.length || firstShop.affordablePairs !== expectedRuns
        || (tuning && calibrationCount !== expectedRuns)) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) runBenchmark(process.argv.slice(2));
