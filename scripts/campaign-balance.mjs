import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { Run } from '../.m0-build/m1/Run.js';
import { FIELD, FIRST_PAIR, TICK_RATE, TOOLS, isTool } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

// Run npm run build:web first. The bot only uses movement destinations and shop actions.
// This measures combat and objective ticks. Shops, human reaction time and device performance
// require separate playtests.
const DEFAULT_SEEDS = [20261120, 42, 1729, 1, 3173, 20261121, 173, 922, 1439, 773];
const directionSamples = Array.from({ length: 12 }, (_, index) => ({
    x: Math.cos(index * Math.PI / 6), y: Math.sin(index * Math.PI / 6),
}));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const insideField = (point) => ({
    x: clamp(point.x, FIELD.left + 12, FIELD.right - 12),
    y: clamp(point.y, FIELD.bottom + 12, FIELD.top - 12),
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

function isHazardAt(hazard, position) {
    if (!hazard || hazard.shape === 'tether') return false;
    if (hazard.shape === 'rect') {
        return position.x > hazard.left - 3 && position.x < hazard.right + 3
            && position.y > hazard.bottom - 3 && position.y < hazard.top + 3;
    }
    const angle = Math.atan2(position.y - hazard.y, position.x - hazard.x);
    return distance(position, hazard) < hazard.radius && (angle - hazard.from + 4 * Math.PI) % (2 * Math.PI) < hazard.sweep;
}

function chooseDestination(battle, tool) {
    const { player, tick, chapterBoss, boss, terrainRects, livePuddles } = battle;
    const hazard = chapterBoss?.hazard;
    const mission = battle.spec.directive?.afterBoss && chapterBoss?.hp > 0 ? null : battle.mission;
    const station = mission?.status === 'working'
        ? mission.points.find((point) => point.state === 'active') ?? mission.points.find((point) => point.state === 'waiting')
        : undefined;
    const strictRelay = station && battle.spec.directive?.type === 'relay' && !battle.spec.directive.variant;

    // Long paths around terrain are selected by the real tap-to-move pathfinder.
    const terrain = battle.rules.encounter?.terrain;
    if (station && (terrain === 'gates' || terrain === 'engine') && distance(station, player) > 65) {
        battle.moveTo(station.x, station.y);
        return;
    }

    let target = station;
    let desiredRange = station ? station.radius - 7 : 50;
    let urgency = station && boss?.unit.hp <= 0 ? 1.55 : 1;

    if (!target && mission?.status === 'working' && mission.escort) {
        const route = mission.escort.route;
        const next = route[Math.min(route.length - 1, 1 + Math.round(mission.progress * (route.length - 1)))];
        target = towards(mission.escort, next, 33);
        desiredRange = 22;
    }
    if (chapterBoss?.station && (!chapterBoss.vulnerable || chapterBoss.hp <= 0)) {
        target = chapterBoss.station;
        desiredRange = 19;
        urgency = 1.6;
    }
    if (hazard?.shape === 'tether' && !chapterBoss.vulnerable) {
        target = towards(hazard, hazard.end, 54);
        desiredRange = 3;
        urgency = 2.1;
    }
    // Screen approaching jammers before starting a hold at a badly damaged relay.
    if (station && mission.integrity && (!strictRelay || station.progress === 0 && mission.integrity.hp <= 2)) {
        const jammer = battle.enemies.find((enemy) => enemy.kind === 'jammer' && distance(enemy, station) < 45);
        if (jammer && distance(player, jammer) > 55 && distance(player, jammer) < 160) {
            target = towards(jammer, player, 39);
            desiredRange = 13;
            urgency = 1.5;
        }
    }

    const angle = tick / 65;
    const bossRange = Math.min(TOOLS[tool].reach - 8, 74);
    if (boss && !target && (chapterBoss?.hp ?? boss.unit.hp) > 0) {
        const point = { x: boss.unit.x + bossRange * Math.cos(angle), y: boss.unit.y + bossRange * Math.sin(angle) };
        if (chapterBoss?.kind === 'supervisor' && !chapterBoss.vulnerable) point.y = Math.max(boss.unit.y + 17, point.y);
        target = insideField(point);
        desiredRange = 16;
        urgency = 1.25;
    } else if (!target) {
        target = { x: 180 + 105 * Math.cos(angle), y: 353 + 146 * Math.sin(angle) };
        desiredRange = 8;
        urgency = 0.62;
    }

    const holding = strictRelay && target === station;
    const candidates = [insideField(target), player, ...directionSamples.map(({ x, y }) =>
        insideField({ x: player.x + 40 * x, y: player.y + 40 * y }))];
    if (holding) {
        for (const fraction of [0.4, 0.87]) {
            for (const { x, y } of directionSamples) {
                candidates.push(insideField({ x: station.x + x * station.radius * fraction, y: station.y + y * station.radius * fraction }));
            }
        }
    }
    const inRelay = holding && distance(player, station) <= station.radius;
    let best = -Infinity;
    let chosen = target;
    for (const [index, candidate] of candidates.entries()) {
        const point = towards(player, candidate, 39);
        if (index && terrainRects.some((rect) => rect.state === 'closed'
            && point.x > rect.left - 10 && point.x < rect.right + 10
            && point.y > rect.bottom - 10 && point.y < rect.top + 10)) continue;
        let score = -urgency * Math.max(0, distance(point, target) - desiredRange);
        if (holding) {
            const gap = distance(point, station);
            score -= 5 * Math.max(0, gap - (station.radius - 2));
            if (inRelay && gap > station.radius - 1) score -= 90 + 50 * station.progress;
        }
        if (isHazardAt(hazard, point)) score -= hazard.state === 'active' ? 110 : 55;
        for (const puddle of livePuddles) {
            if (distance(point, puddle) < puddle.radius + 5) score -= puddle.phase === 'active' ? 65 : 33;
        }
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

function equip(run, route) {
    const buy = (item, slot = 0) => Boolean(item && run.canBuy(item, slot) && run.buy(item, slot, run.data.revision));
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

export function playCampaignBattle(run) {
    const { route, tools: [starter] } = run.data;
    let battle;
    let peak = 0;
    let firstShop = null;
    while (run.data.phase === 'battle') {
        battle = run.battle;
        for (let i = 0; run.battle === battle && !run.waitingForSave && i <= battle.duration; i++) {
            if (battle.tick % 7 === 0) chooseDestination(battle, starter.id);
            peak = Math.max(peak, battle.enemies.length);
            run.advance(1 / TICK_RATE);
        }
        if (run.data.phase !== 'shop') break;
        if (run.data.wave === 0) {
            firstShop = { parts: run.data.parts, pairAffordable: run.canBuy(FIRST_PAIR[route], 0) };
        }
        equip(run, route);
        if (!run.nextWave(run.data.revision)) throw new Error(`Could not leave shop at wave ${battle.wave + 1}`);
    }
    return { battle, peak, firstShop };
}

function play(stage, route, tool, seed) {
    const storage = new Map();
    const host = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
    const run = new Run(makePlatform(host, 'campaign-balance'), stage.rules);
    run.start(route, seed, tool, 'balance');
    const { battle, peak, firstShop } = playCampaignBattle(run);
    const { data } = run;
    const result = {
        id: stage.id, chapter: stage.chapter, route, tool, seed, peak, firstShop, phase: data.phase,
        wave: battle.wave + 1, seconds: data.reports.reduce((sum, report) => sum + report.ticks / TICK_RATE, 0),
        finalSeconds: battle.tick / TICK_RATE, hp: battle.player.hp, jobProgress: battle.mission?.progress,
        bossHP: battle.boss?.unit.hp, hit: battle.lastHit, tools: data.tools.map((item) => item.id),
    };
    run.dispose();
    return result;
}

function runBenchmark([range, samples]) {
    const bounds = (range ?? '01-20').split('-').map(Number);
    const seeds = samples ? samples.split(',').map(Number) : DEFAULT_SEEDS;
    if ([...bounds, ...seeds].some((value) => !Number.isSafeInteger(value))
        || bounds[0] < 1 || (bounds[1] ?? bounds[0]) < bounds[0] || (bounds[1] ?? bounds[0]) > 20) {
        throw new Error('Usage: node scripts/campaign-balance.mjs [01-20] [seed1,seed2]');
    }
    const stageCount = (bounds[1] ?? bounds[0]) - bounds[0] + 1;
    const expectedRuns = stageCount * seeds.length * 2;
    const results = [];
    let unlocked = 'wrench';
    for (const stage of CAMPAIGN_CATALOG) {
        if (Number(stage.id) >= bounds[0] && Number(stage.id) <= (bounds[1] ?? bounds[0])) {
            for (const seed of seeds) {
                results.push(play(stage, 'arc', 'wrench', seed), play(stage, 'magnet', unlocked, seed));
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
    for (const route of ['arc', 'magnet']) {
        const firstSample = results.filter((row) => row.route === route && row.seed === seeds[0]);
        if (firstSample.length !== stageCount || firstSample.some((row) => row.phase !== 'won')) continue;
        const byChapter = Object.fromEntries(['01', '02', '03', '04'].map((chapter) => [
            chapter, firstSample.filter((row) => row.chapter === chapter).reduce((sum, row) => sum + row.seconds, 0) / 60,
        ]));
        console.log(JSON.stringify({ route, seed: seeds[0], combatMinutes: Object.values(byChapter).reduce((a, b) => a + b, 0), byChapter }));
    }
    if (results.length !== expectedRuns || failures.length || firstShop.affordablePairs !== expectedRuns) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) runBenchmark(process.argv.slice(2));
