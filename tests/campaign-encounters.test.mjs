import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { ChapterBoss } from '../.m0-build/m1/ChapterBoss.js';
import { GATEKEEPER_PORTS, Mission, clipWarningReach, insideRect, terrainAt } from '../.m0-build/m1/Encounter.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { Run } from '../.m0-build/m1/Run.js';
import { CAMPAIGN_01_RULES, CAMPAIGN_FIELD, ENEMIES, FIELD, M2_RULES, START } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

const noSpawn = { seconds: 30, spawnEvery: 0, enemies: [] };
const tools = [{ id: 'wrench', mods: ['contact'] }];
const platform = (name, slots = new Map()) => makePlatform({
    localStorage: {
        getItem: (key) => slots.get(key) ?? null,
        setItem: (key, value) => slots.set(key, value),
    },
}, name);
const tick = (n, advance) => { for (let i = 0; i < n; i++) advance(i); };

// These self-contained fixtures keep the optional legacy encounter behavior independent of campaign content.
const legacyRules = (wave, encounter) => ({ ...M2_RULES, encounter, waves: [{ ...noSpawn, ...wave }] });
const relayRoute = [{ x: 94, y: 245 }, START, { x: 269, y: 456 }];

test('open campaign reaches all four world corners while keeping the spawn view bounded', () => {
    const { rules } = CAMPAIGN_CATALOG.find(stage => stage.id === '16');
    const battle = new Battle(2, 20261120, [], rules);
    battle.player.invulnerableUntil = 10_000;
    const clampMargin = 10;
    const { left, right, bottom, top } = CAMPAIGN_FIELD;
    const width = FIELD.right - FIELD.left, height = FIELD.top - FIELD.bottom;
    for (const [x, y] of [[left, bottom], [left, top], [right, top], [right, bottom]]) {
        battle.moveTo(x, y);
        tick(220, () => battle.step(0, 0));
        const reached = { x: x === left ? left + clampMargin : right - clampMargin,
            y: y === bottom ? bottom + clampMargin : top - clampMargin };
        assert.deepEqual({ x: battle.player.x, y: battle.player.y }, reached);
        assert.equal(battle.destination, null);
        assert.deepEqual(battle.terrainRects, []);
        assert.equal(battle.mission, null);
        const spawn = battle.spawnBounds;
        assert.deepEqual(spawn, {
            left: x === left ? left : right - width,
            right: x === left ? left + width : right,
            bottom: y === bottom ? bottom : top - height,
            top: y === bottom ? bottom + height : top,
        });
    }
    assert.equal(battle.finished, false);
    assert.ok(battle.enemies.length <= rules.encounter.enemyCap);
    assert.deepEqual(new Battle(0, 19, [], M2_RULES).field, FIELD);
});

test('tap-to-move routes around the physical engine and clamps a goal inside a shut gate', () => {
    const rules = { ...M2_RULES, encounter: { enemyCap: 12, terrain: 'engine' }, waves: [noSpawn] };
    const battle = new Battle(0, 19, tools, rules);
    Object.assign(battle.player, { x: 80, y: 353 });
    battle.moveTo(280, 353);
    let detour = false;
    tick(90, () => {
        battle.step(0, 0);
        assert.ok(!battle.terrainRects.some(rect => insideRect(battle.player, rect, 10)));
        if (Math.abs(battle.player.y - 353) > 20) detour = true;
    });
    assert.ok(detour);
    assert.deepEqual({ x: battle.player.x, y: battle.player.y }, { x: 280, y: 353 });

    const gates = new Battle(0, 19, tools, { ...rules, encounter: { enemyCap: 12, terrain: 'gates' } });
    gates.moveTo(265, 352);
    assert.ok(!gates.terrainRects.some(rect => rect.state === 'closed' && insideRect(gates.destination, rect, 10)));
});

test('legacy retargeting at an island and gate seam reaches the nearest open corner', () => {
    const rules = legacyRules({ directive: { type: 'switch', points: [{ x: 278, y: 353 }] } },
        { enemyCap: 13, terrain: 'gates' });
    const battle = new Battle(0, 20261120, [], rules);
    battle.moveTo(255, 327);
    tick(40, () => battle.step(0, 0));
    battle.moveTo(284, 400);
    tick(3, () => battle.step(0, 0));
    battle.moveTo(221, 352);
    assert.deepEqual(battle.destination, { x: 223, y: 337 });
    tick(20, () => {
        battle.step(0, 0);
        assert.ok(battle.terrainRects.every(rect => rect.state !== 'closed' || !insideRect(battle.player, rect, 10)));
    });
    assert.equal(battle.destination, null);
    assert.equal(battle.player.x, 223);
    assert.equal(battle.player.y, 337);
});

test('legacy conveyor markings advance with actual drift through both reversal steps', () => {
    const rules = legacyRules({}, { enemyCap: 15, terrain: 'conveyor' });
    const battle = new Battle(0, 20261120, tools, rules);
    battle.moveTo(77, 296);
    tick(45, () => battle.step(0, 0));
    assert.equal(battle.destination, null);
    assert.equal(battle.player.y, 296);
    for (let step = 46; step <= 485; step++) {
        const oldX = battle.player.x;
        const before = battle.terrainRects;
        battle.step(0, 0);
        const [lower, upper] = battle.terrainRects;
        const direction = step >= 240 && step < 480 ? -1 : 1;
        const change = direction * 26 / 30;
        assert.equal(lower.direction, direction, step);
        assert.equal(upper.direction, -direction, step);
        assert.equal(lower.state, step % 240 >= 210 ? 'warning' : 'open', step);
        assert.ok(Math.abs(lower.travel - before[0].travel - change) < 1e-8, step);
        assert.ok(Math.abs(upper.travel - before[1].travel + change) < 1e-8, step);
        if (step <= 260) assert.ok(Math.abs(battle.player.x - oldX - change) < 1e-8, step);
    }
    assert.equal(terrainAt('conveyor', 0)[0].travel, 0);
});

test('a pursuer brakes for a real reversal in open combat and rebuilds its dash on a straight leg', () => {
    const stage = CAMPAIGN_CATALOG.find(item => item.id === '04');
    const rules = { ...stage.rules, waves: [{ ...noSpawn, seconds: 90 }] };
    const battle = new Battle(0, 20261120, [], rules);
    const pursuer = { ...unit('pursuer', START.x - 120, 1), state: 'walk' };
    battle.enemies.push(pursuer);
    const advance = n => tick(n, () => battle.step(0, 0));
    battle.player.invulnerableUntil = 1_000;
    advance(36);
    assert.equal(pursuer.state, 'walk');
    advance(1);
    assert.equal(pursuer.state, 'dash');
    assert.equal(pursuer.vx, 1);

    const x = pursuer.x;
    Object.assign(battle.player, { x: x - 130, y: START.y });
    advance(1);
    assert.equal(pursuer.vx, -1);
    assert.equal(pursuer.state, 'walk');
    assert.equal(pursuer.sprintTicks, 0);
    assert.ok(Math.abs((x - pursuer.x) * 30 - ENEMIES.pursuer.speed) < 1e-6);
    advance(35);
    assert.equal(pursuer.state, 'walk');
    advance(1);
    assert.equal(pursuer.sprintTicks, 36);
    assert.equal(pursuer.state, 'dash');
    assert.deepEqual(battle.terrainRects, []);
});

test('turret warnings stop at the first closed wall and pass open gates and boundary tangents', () => {
    const from = { x: 80, y: 350 };
    const engine = { kind: 'wall', state: 'closed', left: 144, right: 216, bottom: 317, top: 389 };
    const gate = { kind: 'gate', state: 'closed', left: 102, right: 114, bottom: 300, top: 401 };
    assert.equal(clipWarningReach(from, 1, 0, 190, [engine, gate]), 22);
    assert.equal(clipWarningReach(from, 1, 0, 190, [{ ...gate, state: 'warning' }, engine]), 64);
    assert.equal(clipWarningReach(from, 1, 0, 190, [{ ...gate, state: 'open' }]), 190);
    assert.equal(clipWarningReach(from, 1, 0, 40, [engine]), 40);
    assert.equal(clipWarningReach({ x: 280, y: 350 }, -1, 0, 190, [engine]), 64);
    assert.equal(clipWarningReach({ x: 80, y: 389 }, 1, 0, 190, [engine]), 190);
    assert.equal(clipWarningReach({ x: 80, y: 325 }, 1, 1, 190, [engine]), 190);
    assert.equal(clipWarningReach({ x: 144, y: 350 }, -1, 0, 190, [engine]), 190);
    assert.equal(clipWarningReach({ x: 180, y: 350 }, 1, 0, 190, [engine]), 0);
});

test('mission timeouts, signal disruption, return grace and vehicle carry use fixed ticks', () => {
    const relay = { x: 90, y: 240 };
    const mission = new Mission({ type: 'relay', variant: 'archive', points: [relay], holdTicks: 90 });
    tick(70, n => mission.step(n, relay, []));
    assert.ok(mission.view(70).progress < 1);
    tick(76, n => mission.step(71 + n, START, []));
    assert.equal(mission.view(146).points[0].progress, 0);
    tick(80, n => mission.step(147 + n, relay, [{ ...relay, kind: 'jammer', state: 'dash', next: 250 }]));
    assert.equal(mission.view(226).points[0].progress, 0);
    assert.equal(mission.snapshot().relayHp, 3);
    tick(90, n => mission.step(227 + n, relay, []));
    assert.ok(mission.complete);

    const points = [{ x: 170, y: 240 }, { x: 180, y: 245 }];
    const escort = new Mission({ type: 'escort', points, wavesCarry: true }, { escortHp: 3 });
    escort.tug(5);
    escort.step(6, { x: 335, y: 520 }, []);
    assert.deepEqual(escort.escort, points[0]);
    tick(20, n => escort.step(10 + n, points[0], []));
    assert.ok(escort.complete);
    assert.deepEqual(escort.snapshot(), { escortHp: 2 });

    const run = new Run(platform('deadline'), { ...M2_RULES,
        waves: [{ ...noSpawn, seconds: 1, directive: { type: 'switch', points: [relay] } }] });
    run.start('arc');
    tick(30, () => run.advance(1 / 30));
    assert.equal(run.data.phase, 'lost');
    assert.equal(run.data.finishReason, 'timeout');
    assert.equal(run.data.reports.at(-1).failureDetail, 'objective');
});

test('timeout reports retain the remaining job after reopening the checkpoint', () => {
    const terminal = { x: 90, y: 240 };
    const afterBoss = { type: 'switch', points: [terminal], afterBoss: true };
    const cases = [
        { detail: 'boss', boss: 'elite', directive: afterBoss },
        { detail: 'objective', boss: 'elite', directive: afterBoss, offline: true },
        { detail: 'takeover', boss: 'core', directive: { ...afterBoss, points: [START], holdTicks: 1 }, offline: true },
        { detail: 'holdout', directive: { type: 'switch', points: [START], holdTicks: 1 },
            escalation: { atTick: 20, spawnEvery: 10, enemies: ['charger'], requiredTicks: 15 } },
    ];
    for (const { detail, boss, directive, offline, escalation } of cases) {
        const store = platform('timeout-' + detail);
        const rules = { ...M2_RULES, encounter: { enemyCap: 12, boss },
            waves: [{ ...noSpawn, seconds: 1, boss: !!boss, directive, escalation }] };
        const run = new Run(store, rules);
        run.start('arc');
        if (offline) run.battle.boss.unit.hp = 0;
        tick(30, () => run.advance(1 / 30));
        assert.equal(run.data.finishReason, 'timeout', detail);
        assert.equal(new Run(store, rules).data.reports.at(-1).failureDetail, detail);
    }

    const store = platform('old-timeout');
    const rules = { ...M2_RULES, waves: [{ ...noSpawn, seconds: 1, directive: { type: 'switch', points: [terminal] } }] };
    const run = new Run(store, rules);
    run.start('arc');
    tick(30, () => run.advance(1 / 30));
    const { failureDetail, ...legacyReport } = run.data.reports.at(-1);
    assert.equal(failureDetail, 'objective');
    const legacy = { ...run.data, reports: [legacyReport] };
    assert.ok(store.writeCheckpoint(1, legacy));
    assert.deepEqual(new Run(store, rules).data, legacy);
    assert.ok(store.writeCheckpoint(1, { ...legacy, reports: [{ ...legacyReport, failureDetail: 'escort' }] }));
    assert.deepEqual(new Run(store, rules).data, legacy, 'incorrect failure detail falls back to the valid checkpoint');
});

test('failed work identifies heat loss and which hybrid asset ran out of integrity', () => {
    const terminal = { x: 90, y: 240 };
    const cold = { ...M2_RULES,
        waves: [{ ...noSpawn, directive: { type: 'thermal', points: [terminal] } }] };
    const coldStore = platform('thermal-failure');
    const cooling = new Run(coldStore, cold);
    cooling.start('arc');
    tick(720, () => cooling.advance(1 / 30));
    assert.equal(cooling.data.finishReason, 'objective-failed');
    assert.equal(new Run(coldStore, cold).data.reports.at(-1).failureDetail, 'thermal');

    const hybrid = { ...M2_RULES, waves: [{ ...noSpawn,
        directive: { type: 'hybrid', points: [terminal, START, { x: 180, y: 390 }],
            wavesCarry: true, rangedPressure: true } }] };
    for (const detail of ['escort', 'relay']) {
        const store = platform('hybrid-failure-' + detail);
        const checkpoint = new Run(store, hybrid);
        checkpoint.start('arc');
        const mission = detail === 'escort' ? { escortHp: 1 } : { relayHp: 1 };
        assert.ok(store.writeCheckpoint(1, { ...checkpoint.data, mission }));
        const run = new Run(store, hybrid);
        const task = run.battle.task;
        if (detail === 'escort') task.tug(0);
        else task.relayHit(0, terminal);
        run.resume();
        run.advance(1 / 30);
        assert.equal(run.data.finishReason, 'objective-failed', detail);
        assert.equal(new Run(store, hybrid).data.reports.at(-1).failureDetail, detail);
    }
});

test('ordinary relay hold resets upon exit and pauses under interference; archive retains its return window', () => {
    const terminal = { x: 100, y: 350 };
    const directive = { type: 'relay', points: [terminal], holdTicks: 20 };
    const progress = (mission, at) => mission.view(at).points[0].progress;
    const ordinary = new Mission(directive);
    tick(8, n => ordinary.step(n + 1, terminal, []));
    assert.equal(progress(ordinary, 8), 0.4);
    const jammer = { ...terminal, kind: 'jammer', state: 'dash', next: 23 };
    tick(10, n => ordinary.step(n + 9, terminal, [jammer]));
    assert.equal(progress(ordinary, 18), 0.4);
    ordinary.step(19, START, []);
    assert.equal(progress(ordinary, 19), 0);
    tick(20, n => ordinary.step(n + 20, terminal, []));
    assert.equal(ordinary.complete, true);

    const archive = new Mission({ ...directive, variant: 'archive' });
    tick(8, n => archive.step(n + 1, terminal, []));
    tick(75, n => archive.step(n + 9, START, []));
    assert.equal(progress(archive, 83), 0.4);
    archive.step(84, terminal, []);
    assert.equal(progress(archive, 84), 0.45);
    tick(76, n => archive.step(n + 85, START, []));
    assert.equal(progress(archive, 160), 0);

    const bypass = new Mission({ ...directive, variant: 'bypass' });
    tick(8, n => bypass.step(n + 1, terminal, []));
    tick(250, n => bypass.step(n + 9, START, []));
    assert.equal(progress(bypass, 258), 0.4);
});

test('a scan handshake completes on the final tick before the enabled terminal rotates', () => {
    const east = { x: 278, y: 353 }, west = { x: 82, y: 353 };
    const directive = { type: 'scan', points: [east, west], holdTicks: 90 };
    const scan = new Mission(directive);
    assert.equal(scan.view(150).scan.previewAngle, undefined);
    assert.deepEqual(scan.view(151).scan, { x: 180, y: 353, angle: 0, previewAngle: Math.PI });
    tick(90, n => scan.step(n + 91, east, []));
    assert.equal(scan.completedStations, 1);
    assert.equal(scan.view(181).points[1].state, 'active');
    assert.deepEqual(scan.view(181).scan, { x: 180, y: 353, angle: Math.PI });
    tick(90, n => scan.step(n + 181, west, []));
    assert.equal(scan.complete, true);
    assert.equal(scan.view(270).scan, undefined);

    const finale = new Mission({ ...directive, afterBoss: true });
    assert.equal(finale.view(230).scan, undefined);
    finale.startWork(231);
    tick(90, n => finale.step(n + 321, east, []));
    assert.equal(finale.completedStations, 1);
    assert.equal(finale.view(411).points[1].state, 'active');
});

test('legacy cooling uses continuous exposure and preserves the previous zone for 36 ticks', () => {
    const rules = legacyRules({ seconds: 40, directive: { type: 'thermal', holdTicks: 60, minTicks: 1110,
        points: [{ x: 271, y: 244 }, { x: 269, y: 456 }] } });
    const battle = new Battle(0, 20261120, [], rules);
    const [first, second] = battle.spec.directive.points;
    battle.player.invulnerableUntil = battle.duration;
    const advance = (count) => tick(count, () => battle.step(0, 0));
    const temperature = () => battle.mission.integrity.hp;
    const travel = Math.ceil((Math.hypot(START.x - first.x, START.y - first.y) - battle.mission.points[0].radius) / 5.2);

    assert.deepEqual(battle.mission.thermal.next, second);
    advance(119);
    assert.equal(temperature(), 6);
    advance(1);
    assert.equal(temperature(), 5);
    advance(120 - travel);
    battle.moveTo(first.x, first.y);
    advance(travel);
    assert.equal(battle.mission.points[0].progress, 1 / 60);
    assert.equal(temperature(), 5);
    battle.moveTo(START.x, START.y);
    advance(119);
    assert.equal(temperature(), 5);
    advance(1);
    assert.equal(temperature(), 4);

    battle.moveTo(first.x, first.y);
    advance(travel + 57);
    assert.equal(temperature(), 4);
    advance(1);
    assert.equal(battle.mission.points[1].state, 'active');
    assert.deepEqual(battle.mission.thermal.previous, first);
    advance(1);
    assert.equal(temperature(), 5);
    advance(35);
    assert.deepEqual(battle.mission.thermal.previous, first);
    advance(1);
    assert.equal(battle.mission.thermal.previous, undefined);
    advance(118);
    assert.equal(temperature(), 5);
    advance(1);
    assert.equal(temperature(), 4);
});

test('chapter boss weak points, tow interruption, and final manual takeover are real gates', () => {
    const unit = { x: 180, y: 510, hp: 1 };
    const gate = new ChapterBoss({ enemyCap: 14, boss: 'gatekeeper' }, unit);
    const ignore = () => {};
    assert.equal(unit.hp, 92);
    assert.equal(gate.damage(9, START, false), 0);
    gate.step(65, START, ignore, ignore, ignore);
    assert.equal(gate.view.hazard.state, 'warning');
    assert.equal(gate.view.hazard.shape, 'rect');
    const control = gate.view.station;
    tick(24, n => gate.step(95 + n, control, ignore, ignore, ignore));
    assert.equal(gate.view.vulnerable, true);
    assert.equal(gate.damage(4, control, true), 6);
    gate.step(280, START, ignore, ignore, ignore);
    gate.step(316, START, ignore, ignore, ignore);
    assert.equal(gate.view.hazard.state, 'warning');
    unit.hp = 0;
    assert.equal(gate.view.hazard, undefined);
    assert.equal(gate.view.station, undefined);

    const escort = new Mission({ type: 'escort', points: [{ x: 180, y: 290 }, START] });
    const tow = new ChapterBoss({ enemyCap: 16, boss: 'tow' }, { ...unit }, escort);
    tow.step(65, START, ignore, ignore, ignore);
    assert.equal(tow.view.hazard.shape, 'tether');
    tow.step(98, { x: 180, y: 399 }, ignore, ignore, ignore);
    assert.equal(tow.view.vulnerable, true);
    assert.equal(escort.snapshot().escortHp, 6);

    const body = { ...unit };
    const core = new ChapterBoss({ enemyCap: 20, boss: 'core' }, body);
    body.hp = 0;
    tick(89, n => core.step(n, START, ignore, ignore, ignore));
    assert.equal(core.complete, false);
    core.step(90, START, ignore, ignore, ignore);
    assert.ok(core.complete);
});

test('open-combat bosses chase, telegraph a lock, can be damaged from the front, and clear on defeat', () => {
    const duels = [
        ['03', 'supervisor', 'rect'], ['04', 'elite', 'rect'], ['05', 'gatekeeper', 'rect'],
        ['10', 'tow', 'tether'], ['15', 'silence', 'sector'], ['20', 'core', 'sector'],
    ];
    for (const [stageId, kind, shape] of duels) {
        const { rules, finalWave } = CAMPAIGN_CATALOG.find(stage => stage.id === stageId);
        const battle = new Battle(finalWave, 20261120, [], rules);
        const { unit: boss } = battle.boss;
        const spawn = { x: boss.x, y: boss.y };
        const advance = n => tick(n, () => battle.step(0, 0));
        const checkNoGates = () => {
            assert.equal(battle.mission, null, stageId);
            assert.equal(battle.chapterBoss.station, undefined, stageId);
            assert.equal(battle.chapterBoss.terminals, undefined, stageId);
            assert.deepEqual(battle.terrainRects, [], stageId);
        };
        assert.equal(battle.chapterBoss.kind, kind, stageId);
        checkNoGates();
        advance(65);
        const warning = battle.chapterBoss.hazard;
        assert.equal(warning?.state, 'warning', stageId);
        assert.equal(warning?.shape, shape, stageId);
        assert.ok(Math.hypot(boss.x - spawn.x, boss.y - spawn.y) > 25, stageId);
        const guardedHealth = boss.hp;
        assert.ok(battle.hit(boss, 2, battle.player, 'arc'), stageId);
        assert.ok(boss.hp < guardedHealth, stageId);
        assert.equal(battle.player.hp, battle.maxHp, stageId);

        const warningEnd = battle.chapterBoss.phaseEndsAt;
        const target = { x: battle.player.x, y: battle.player.y };
        Object.assign(battle.player, { x: CAMPAIGN_FIELD.left + 16, y: CAMPAIGN_FIELD.bottom + 16 });
        advance(4);
        assert.deepEqual(battle.chapterBoss.hazard, warning, 'locked warning ' + stageId);
        advance(warningEnd - battle.tick);
        assert.deepEqual(battle.chapterBoss.hazard, { ...warning, state: 'active' }, stageId);
        assert.equal(battle.enemyAttackCue, 'area', stageId);
        assert.equal(battle.player.hp, battle.maxHp, 'dodge ' + stageId);
        Object.assign(battle.player, target);
        advance(1);
        assert.equal(battle.player.hp, battle.maxHp - 1, 'inside attack ' + stageId);
        assert.equal(battle.lastHit, 'chapter-hazard', stageId);
        if (shape === 'tether') assert.ok(Math.hypot(battle.player.x - target.x, battle.player.y - target.y) > 15, stageId);

        advance(battle.chapterBoss.phaseEndsAt - battle.tick);
        assert.equal(battle.chapterBoss.recovering, true, stageId);
        assert.equal(battle.chapterBoss.vulnerable, true, stageId);
        assert.equal(battle.chapterBoss.hazard, undefined, stageId);
        checkNoGates();
        assert.ok(battle.hit(boss, 10_000, battle.player, 'arc'), stageId);
        assert.equal(battle.bossDefeated, true, stageId);
        assert.equal(battle.waveCleared, true, stageId);
        checkNoGates();
    }
});

test('the inspector alternates close attacks with locked fan bursts and uses radial bursts below half health', () => {
    const { rules, finalWave } = CAMPAIGN_CATALOG[0];
    const battle = new Battle(finalWave, 105, [], rules);
    const boss = battle.boss;
    const until = predicate => {
        for (let step = 0; step < 360 && !predicate(); step++) battle.step(0, 0);
        assert.ok(predicate(), `did not reach attack by tick ${battle.tick}`);
    };
    until(() => boss.phase === 'warning');
    assert.equal(boss.attack, 'sweep');
    until(() => boss.phase === 'warning' && boss.attack === 'fan');
    const { vx, vy } = boss.unit;
    battle.player.x += 56;
    until(() => boss.phase === 'volley');
    const first = battle.bullets.filter(shell => shell.boss);
    assert.equal(first.length, 5);
    assert.ok(Math.abs(first[2].vx / 4 - vx) < 1e-6 && Math.abs(first[2].vy / 4 - vy) < 1e-6);
    tick(10, () => battle.step(0, 0));
    assert.equal(battle.bullets.filter(shell => shell.boss && !first.includes(shell)).length, 5);

    boss.unit.hp /= 2;
    until(() => boss.phase === 'warning' && boss.attack === 'ring');
    const previous = new Set(battle.bullets);
    until(() => boss.phase === 'volley');
    const ring = battle.bullets.filter(shell => shell.boss && !previous.has(shell));
    assert.equal(ring.length, 12);
    for (let index = 0; index < 6; index++) {
        assert.ok(Math.hypot(ring[index].vx + ring[index + 6].vx, ring[index].vy + ring[index + 6].vy) < 1e-6);
    }
    const shell = ring[0], hp = battle.player.hp;
    Object.assign(battle.player, { x: shell.x + shell.vx, y: shell.y + shell.vy, invulnerableUntil: 0 });
    battle.step(0, 0);
    assert.equal(battle.player.hp, hp - 1);
    assert.equal(battle.lastHit, 'projectile');
});

test('chapter bosses alternate their skill with two staggered projectile bursts', () => {
    for (const [stageId, expected] of [['03', 'fan'], ['04', 'fan'], ['05', 'ring'], ['07', 'ring'],
        ['10', 'ring'], ['15', 'ring'], ['18', 'fan'], ['20', 'fan']]) {
        const { rules, finalWave } = CAMPAIGN_CATALOG.find(stage => stage.id === stageId);
        const battle = new Battle(finalWave, 105, [], rules);
        const count = expected === 'fan' ? 5 : 8;
        const until = predicate => {
            for (let step = 0; step < 360 && !predicate(); step++) battle.step(0, 0);
            assert.ok(predicate(), stageId);
        };
        until(() => battle.chapterBoss.hazard?.state === 'warning');
        until(() => battle.chapterBoss.volley?.state === 'warning');
        assert.equal(battle.chapterBoss.volley.pattern, expected, stageId);
        assert.equal(battle.bullets.filter(shell => shell.boss).length, 0, stageId);
        const facing = battle.chapterBoss.facing;
        battle.player.x += 55;
        until(() => battle.chapterBoss.volley?.state === 'active');
        assert.equal(battle.chapterBoss.facing, facing, stageId);
        const first = battle.bullets.filter(shell => shell.boss);
        assert.equal(first.length, count, stageId);
        tick(10, () => battle.step(0, 0));
        const second = battle.bullets.filter(shell => shell.boss && !first.includes(shell));
        assert.equal(second.length, count, stageId);
        assert.notEqual(second[0].vx, first[0].vx, stageId);
        until(() => battle.chapterBoss.recovering);
        assert.equal(battle.chapterBoss.volley, undefined, stageId);
    }
});

test('the open core changes attacks as health drops without requiring terminals', () => {
    const { rules, finalWave } = CAMPAIGN_CATALOG.at(-1);
    for (const [health, stage, shape] of [[0.71, 1, 'sector'], [0.7, 2, 'tether'], [0.35, 3, 'rect']]) {
        const battle = new Battle(finalWave, 4, [], rules);
        battle.boss.unit.hp = battle.chapterBoss.maxHp * health;
        tick(65, () => battle.step(0, 0));
        assert.equal(battle.chapterBoss.stage, stage);
        assert.equal(battle.chapterBoss.hazard?.shape, shape);
        assert.equal(battle.chapterBoss.station, undefined);
        assert.equal(battle.chapterBoss.terminals, undefined);
        if (shape === 'rect') {
            assert.equal(battle.chapterBoss.hazard.left, CAMPAIGN_FIELD.left);
            assert.equal(battle.chapterBoss.hazard.right, CAMPAIGN_FIELD.right);
        }
    }
});

test('the core still introduces the tether and lane when a burst crosses both thresholds', () => {
    const { rules, finalWave } = CAMPAIGN_CATALOG.at(-1);
    const battle = new Battle(finalWave, 42, [], rules);
    const advanceToWarning = (shape, maxTicks) => {
        for (let step = 0; step < maxTicks && !(battle.chapterBoss.hazard?.state === 'warning'
            && battle.chapterBoss.hazard.shape === shape); step++) battle.step(0, 0);
        assert.equal(battle.chapterBoss.hazard?.state, 'warning');
        assert.equal(battle.chapterBoss.hazard?.shape, shape);
    };
    advanceToWarning('sector', 100);
    battle.boss.unit.hp = battle.chapterBoss.maxHp * 0.25;
    advanceToWarning('tether', 240);
    assert.equal(battle.chapterBoss.stage, 2);
    advanceToWarning('rect', 240);
    assert.equal(battle.chapterBoss.stage, 3);
});

test('legacy gatekeeper rehearsal delays only pending turrets and previews the live warning', () => {
    const encounter = { enemyCap: 14, boss: 'gatekeeper' };
    const ports = [GATEKEEPER_PORTS.a, GATEKEEPER_PORTS.b];
    const rehearsal = { seconds: 90, spawnEvery: 32, enemies: ['armored', 'crawler', 'turret', 'pursuer', 'armored', 'crawler'],
        directive: { type: 'switch', points: ports, powerDrill: true, minTicks: 1860 } };
    const rules = { ...M2_RULES, encounter, waves: [...Array(4).fill(noSpawn), rehearsal] };
    const battle = new Battle(4, 20261120, [], rules);
    const advance = n => tick(n, () => battle.step(0, 0));
    Object.assign(battle.player, GATEKEEPER_PORTS.a);
    advance(59);
    assert.equal(battle.practiceWarning, undefined);
    assert.ok(battle.queueSpawn('turret'));
    const pendingTurret = battle.warnings.at(-1);
    assert.equal(pendingTurret.at, 81);
    assert.ok(battle.queueSpawn('crawler'));
    const pendingCrawler = battle.warnings.at(-1);
    assert.equal(pendingCrawler.at, 81);
    const activeTurret = { ...unit('turret', 190, 999), next: 61, vx: -1 };
    battle.enemies.push(activeTurret);

    const warnings = battle.warningSerial;
    advance(1);
    const practice = battle.practiceWarning;
    assert.ok(practice);
    assert.equal(practice.state, 'warning');
    assert.equal(battle.warningSerial, warnings + 1);
    assert.equal(pendingTurret.at, 120);
    assert.equal(pendingCrawler.at, 81);
    Object.assign(battle.player, GATEKEEPER_PORTS.b);
    const hp = battle.player.hp;
    advance(1);
    assert.equal(activeTurret.state, 'walk');
    assert.ok(battle.bullets.length > 0);

    advance(20);
    assert.ok(!battle.warnings.includes(pendingCrawler));
    assert.ok(battle.warnings.includes(pendingTurret));
    assert.equal(battle.enemies.filter(enemy => enemy.kind === 'turret').length, 1);
    assert.ok(battle.warnings.some(warning => warning !== pendingTurret && warning.kind === 'turret' && warning.at === 120));
    advance(8);
    assert.equal(battle.practiceWarning, practice);
    assert.equal(battle.player.hp, hp);
    advance(1);
    assert.equal(battle.practiceWarning, undefined);
    Object.assign(battle.player, GATEKEEPER_PORTS.a);
    advance(29);
    assert.ok(battle.warnings.includes(pendingTurret));
    advance(1);
    assert.ok(!battle.warnings.includes(pendingTurret));
    assert.ok(battle.enemies.filter(enemy => enemy.kind === 'turret').length > 1);
    assert.ok(battle.queueSpawn('turret'));
    assert.equal(battle.warnings.at(-1).at, 142);
    Object.assign(battle.player, GATEKEEPER_PORTS.b);
    advance(29);
    assert.equal(battle.mission.points[1].state, 'active');
    advance(1);
    assert.equal(battle.mission.points[1].state, 'complete');
    assert.equal(battle.practiceWarning, undefined);
    assert.ok(battle.queueSpawn('turret'));
    assert.equal(battle.warnings.at(-1).at, 210);

    const final = new Battle(0, 20261120, [], legacyRules({ boss: true,
        directive: { type: 'switch', points: ports } }, encounter));
    tick(65, () => final.step(0, 0));
    assert.deepEqual(final.chapterBoss.hazard, practice);
    assert.equal(final.practiceWarning, undefined);
});

test('legacy lifts require the player within 36px for boarding and return', () => {
    const rules = legacyRules({ seconds: 48, directive: { type: 'escort', variant: 'lift', points: relayRoute } });
    const lift = new Battle(0, 20261120, [], rules);
    const advance = (count) => tick(count, () => lift.step(0, 0));
    const position = () => ({ x: lift.mission.escort.x, y: lift.mission.escort.y });
    const board = position();
    const floors = lift.mission.escort.route.length;
    assert.equal(lift.mission.escort.radius, 36);
    assert.deepEqual(lift.mission.lift, { floor: 1, floors });
    assert.match(lift.mission.label, /平台/);
    lift.moveTo(board.x, board.y + 37);
    advance(32);
    assert.deepEqual(position(), board);
    lift.moveTo(board.x, board.y + 36);
    advance(1);
    assert.notDeepEqual(position(), board);

    for (let count = 0; count < 26 && !lift.mission.lift.bridge; count++) {
        const cart = position();
        lift.moveTo(cart.x, cart.y);
        advance(7);
    }
    const dock = position();
    const bridge = lift.mission.lift.bridge;
    assert.ok(bridge);
    assert.equal(lift.mission.lift.floor, 2);
    assert.equal(lift.mission.points[0].radius, 36);
    assert.match(lift.mission.label, /停梯.*侧桥/);
    lift.moveTo(bridge.x, bridge.y);
    advance(85);
    assert.deepEqual(lift.mission.lift, { floor: 2, floors });
    assert.deepEqual(position(), dock);
    lift.moveTo(dock.x + 37, dock.y);
    advance(15);
    assert.deepEqual(position(), dock);
    lift.moveTo(dock.x + 36, dock.y);
    advance(1);
    assert.notDeepEqual(position(), dock);

    const ordinary = new Mission({ type: 'escort', points: [board, dock] });
    ordinary.step(1, { x: board.x, y: board.y + 55 }, []);
    assert.equal(ordinary.view(1).escort.radius, 65);
    assert.ok(ordinary.view(1).escort.y > board.y);
});

test('legacy lift groups wait for docking and for earlier warnings and enemies to clear', () => {
    const rules = legacyRules({ seconds: 55, spawnEvery: 35,
        directive: { type: 'escort', variant: 'lift', points: [...relayRoute, { x: 95, y: 460 }] },
        liftGroups: [{ floor: 2, enemies: ['crawler', 'crawler', 'charger'] },
            { floor: 3, enemies: ['reclaimer', 'crawler', 'crawler', 'charger'] }] }, { enemyCap: 16 });
    const battle = new Battle(0, 20261120, [], rules);
    battle.player.invulnerableUntil = battle.duration;
    const advance = (n) => tick(n, () => battle.step(0, 0));
    const containsClaw = () => [...battle.warnings, ...battle.enemies].some(unit => unit.kind === 'reclaimer');
    const approach = () => {
        const { x, y } = battle.mission.lift.bridge ?? battle.mission.escort;
        battle.moveTo(x, y);
        advance(1);
    };
    while (battle.mission.lift.floor < 2 && battle.tick < 350) {
        approach();
        assert.deepEqual(battle.warnings, []);
        assert.deepEqual(battle.enemies, []);
    }
    assert.ok(battle.mission.lift.bridge);
    advance(1);
    assert.equal(battle.warnings[0].kind, 'crawler');
    while (battle.mission.lift.floor < 3 && battle.tick < 700) {
        approach();
        assert.equal(containsClaw(), false);
    }
    assert.equal(battle.mission.lift.floor, 3);
    assert.ok(battle.mission.lift.bridge);
    assert.ok(battle.enemies.length > 0);
    advance(battle.spec.spawnEvery * 2);
    assert.equal(containsClaw(), false);
    const oldSquad = [...battle.enemies];
    for (const enemy of oldSquad) battle.hit(enemy, 99, battle.player, 'magnet');
    advance(2);
    assert.equal(battle.warnings[0].kind, 'reclaimer');
});

test('the half-health tow chapter boss physically alternates reclaim mouths during wind-up', () => {
    const unit = { x: 180, y: 510, hp: 1 };
    const car = { x: 180, y: 264 };
    const escort = new Mission({ type: 'escort', points: [car, START] });
    const boss = new ChapterBoss({ enemyCap: 16, boss: 'tow' }, unit, escort);
    const advance = tick => boss.step(tick, { x: 30, y: 318 }, () => {}, () => {}, () => {});
    advance(65);
    assert.equal(boss.view.hazard.x, 180);
    unit.hp = 51;
    advance(66);
    const mouths = [];
    let lastState;
    for (let tick = 67; tick < 330; tick++) {
        advance(tick);
        const hazard = boss.view.hazard;
        if (hazard?.state === 'active' && lastState !== 'active') {
            assert.equal(unit.x, hazard.x);
            assert.equal(unit.y, hazard.y);
            assert.deepEqual(hazard.end, car);
            mouths.push(hazard.x);
        }
        lastState = hazard?.state;
    }
    assert.deepEqual(mouths, [252, 108]);
    assert.equal(escort.snapshot().escortHp, 4);
});

test('legacy reclaimers pull for two seconds and crossing the cable saves escort HP', () => {
    const rules = legacyRules({ seconds: 45, directive: { type: 'escort', points: relayRoute, wavesCarry: true, minTicks: 1260 } });
    const setup = () => {
        const battle = new Battle(0, 42, [], rules);
        const start = battle.mission.escort;
        Object.assign(battle.player, { x: start.x + 30, y: start.y + 18 });
        tick(44, () => battle.step(0, 0));
        const car = battle.mission.escort;
        Object.assign(battle.player, { x: car.x, y: car.y - 57 });
        const claw = { id: 8, kind: 'reclaimer', hp: 8, x: car.x + 43, y: car.y, state: 'walk',
            next: battle.tick + 1, vx: 0, vy: 0, marked: false };
        battle.enemies.push(claw);
        battle.step(0, 0);
        assert.equal(claw.state, 'warn');
        tick(26, () => battle.step(0, 0));
        assert.equal(claw.state, 'warn');
        const distance = ({ x, y }) => Math.hypot(x - start.x, y - start.y);
        const before = distance(battle.mission.escort);
        battle.step(0, 0);
        assert.equal(claw.state, 'dash');
        return { battle, claw, before, distance };
    };
    const { battle, claw, before, distance } = setup();
    tick(59, () => battle.step(0, 0));
    assert.equal(claw.state, 'dash');
    assert.equal(battle.mission.escort.hp, 6);
    assert.ok(Math.abs(before - distance(battle.mission.escort) - 32) < 1e-6);
    battle.step(0, 0);
    assert.equal(claw.state, 'walk');
    assert.equal(battle.mission.escort.hp, 5);
    assert.equal(battle.cutSerial, 0);

    const cut = setup();
    const car = cut.battle.mission.escort;
    cut.battle.moveTo((cut.claw.x + car.x) / 2, (cut.claw.y + car.y) / 2);
    tick(22, () => cut.battle.step(0, 0));
    assert.equal(cut.claw.state, 'walk');
    assert.equal(cut.battle.cutSerial, 1);
    tick(39, () => cut.battle.step(0, 0));
    assert.equal(cut.battle.mission.escort.hp, 6);
    assert.equal(cut.battle.cutSerial, 1);

    const destroyed = setup();
    assert.equal(destroyed.battle.cutSerial, 0);
    destroyed.battle.hit(destroyed.claw, 8, destroyed.battle.player, 'arc');
    assert.equal(destroyed.battle.cutSerial, 1);
});

test('legacy tow boss only signals a cut after the player crosses its cable', () => {
    const rules = legacyRules({ boss: true, seconds: 115,
        directive: { type: 'escort', points: [{ x: 180, y: 224 }, START, { x: 95, y: 460 }], wavesCarry: true } },
    { enemyCap: 16, boss: 'tow' });
    const setup = () => {
        const battle = new Battle(0, 20261120, [], rules);
        battle.moveTo(30, 310);
        tick(65, () => battle.step(0, 0));
        assert.equal(battle.chapterBoss.hazard.state, 'warning');
        assert.equal(battle.cutSerial, 0);
        return battle;
    };
    const missed = setup();
    tick(93, () => missed.step(0, 0));
    assert.equal(missed.cutSerial, 0);
    assert.equal(missed.mission.escort.hp, 5);

    const crossed = setup();
    const cable = crossed.chapterBoss.hazard;
    crossed.moveTo((cable.x + cable.end.x) / 2, (cable.y + cable.end.y) / 2);
    tick(33, () => crossed.step(0, 0));
    assert.equal(crossed.cutSerial, 1);
    assert.equal(crossed.mission.escort.hp, 6);
    assert.equal(crossed.chapterBoss.hazard, undefined);
    tick(20, () => crossed.step(0, 0));
    assert.equal(crossed.cutSerial, 1);
});

test('legacy core can require live bypass terminals and a timed handoff before takeover', () => {
    const rules = legacyRules({ boss: true, seconds: 145, directive: { type: 'handoff',
        points: [{ x: 82, y: 353 }, { x: 278, y: 353 }], label: '去两侧端口交回执',
        holdTicks: 180, windowTicks: 360, afterBoss: true } }, { enemyCap: 20, boss: 'core' });
    const battle = new Battle(0, 4, [], rules);
    const { unit } = battle.boss;
    const [left, right] = battle.spec.directive.points;
    const advance = (n, point) => {
        if (point) Object.assign(battle.player, point);
        tick(n, () => battle.step(0, 0));
    };
    const terminals = () => battle.chapterBoss.terminals?.map(point => point.state);
    const signatures = () => battle.mission.points.map(point => point.state);
    battle.player.invulnerableUntil = battle.duration;

    advance(65, left);
    assert.equal(battle.chapterBoss.hazard.shape, 'sector');
    assert.deepEqual(signatures(), ['waiting', 'waiting']);
    advance(59, battle.chapterBoss.station);
    assert.ok(battle.chapterBoss.vulnerable);
    assert.equal(battle.missionCue.kind, 'connect');
    assert.equal(battle.cutSerial, 0);
    unit.hp = battle.chapterBoss.maxHp * 0.7 + 0.01;
    advance(1);
    assert.equal(battle.chapterBoss.stage, 1);
    unit.hp -= 0.01;
    advance(16);
    assert.equal(battle.chapterBoss.stage, 2);
    const cable = battle.chapterBoss.hazard;
    assert.equal(cable.shape, 'tether');
    const sectorCue = battle.missionCue;
    advance(33, { x: (cable.x + cable.end.x) / 2, y: (cable.y + cable.end.y) / 2 });
    assert.ok(battle.chapterBoss.vulnerable);
    assert.equal(battle.cutSerial, 1);
    assert.equal(battle.missionCue, sectorCue);

    unit.hp = battle.chapterBoss.maxHp * 0.35 + 0.01;
    advance(1);
    assert.equal(battle.chapterBoss.stage, 2);
    unit.hp -= 0.01;
    advance(16);
    assert.deepEqual(terminals(), ['active', 'waiting']);
    advance(59, battle.chapterBoss.station);
    assert.deepEqual(terminals(), ['complete', 'waiting']);
    assert.match(battle.chapterBoss.instruction, /1\/2.*另一端/);
    advance(52);
    assert.deepEqual(terminals(), ['complete', 'active']);
    assert.equal(battle.chapterBoss.terminals[0].progress, 1);
    assert.equal(battle.chapterBoss.vulnerable, false);
    advance(59, battle.chapterBoss.station);
    assert.deepEqual(terminals(), ['complete', 'complete']);
    assert.ok(battle.chapterBoss.vulnerable);

    unit.hp = 0;
    advance(100, START);
    assert.equal(battle.chapterBoss.hazard, undefined);
    assert.equal(battle.chapterBoss.terminals, undefined);
    assert.equal(battle.chapterBoss.station, undefined);
    assert.equal(battle.chapterBoss.instruction, battle.spec.directive.label);
    assert.equal(battle.finished, false);
    advance(180, left);
    assert.deepEqual(signatures(), ['complete', 'active']);
    assert.equal(battle.missionCue.kind, 'connect');
    assert.match(battle.chapterBoss.instruction, /12 秒/);
    advance(361, START);
    assert.deepEqual(signatures(), ['active', 'waiting']);
    assert.equal(battle.chapterBoss.station, undefined);
    advance(180, left);
    advance(180, right);
    assert.deepEqual(signatures(), ['complete', 'complete']);
    assert.equal(battle.missionCue.kind, 'confirm');
    assert.equal(battle.cutSerial, 1);
    assert.equal(battle.chapterBoss.station.progress, 0);
    advance(89, START);
    assert.equal(battle.finished, false);
    advance(1);
    assert.ok(battle.waveCleared);
});

test('the shift-relief wave deploys reserve units only once work has been logged', () => {
    const terminal = { x: 100, y: 290 };
    const rule = { ...M2_RULES, waves: [{ ...noSpawn, directive: { type: 'switch', points: [terminal], holdTicks: 6, minTicks: 0 },
        escalation: { atTick: 8, spawnEvery: 10, enemies: ['charger'], requiredTicks: 15 } }] };
    const battle = new Battle(0, 12, tools, rule);
    tick(20, () => battle.step(0, 0));
    assert.equal(battle.warningSerial, 0);
    assert.equal(battle.finished, false);
    assert.equal(battle.missionCue, null);
    Object.assign(battle.player, terminal);
    tick(7, () => battle.step(0, 0));
    assert.equal(battle.warningSerial, 1);
    assert.equal(battle.warnings[0].kind, 'charger');
    const switched = battle.missionCue;
    assert.equal(switched.kind, 'power');
    tick(15, () => {
        battle.step(0, 0);
        assert.equal(battle.missionCue, switched);
    });
    assert.equal(battle.waveCleared, true);
});

function unit(kind, x, id, hp = ENEMIES[kind].hp) {
    return { id, kind, x, y: START.y, hp, next: 400, state: 'warn', vx: 0, vy: 0, marked: false,
        facingX: -1, facingY: 0 };
}

test('liquid nailer pierces shielded escort, probe splits damage, nozzle pushes, coil pulls and wrench combos', () => {
    const rules = { ...M2_RULES, waves: [noSpawn], encounter: { enemyCap: 14, armorLine: true } };
    const setup = (id) => new Battle(0, 7, [{ id, mods: [] }], rules);
    const normal = setup('riveter');
    normal.enemies.push(unit('armored', 215, 1), unit('turret', 242, 2));
    normal.step(0, 0);
    assert.equal(normal.enemies[1].hp, 5);
    const nail = setup('hydraulic_nailer');
    nail.enemies.push(unit('armored', 215, 1), unit('turret', 242, 2));
    nail.step(0, 0);
    assert.equal(nail.enemies[0].hp, 4.2);
    assert.equal(nail.enemies[1].hp, 1);

    const probe = setup('split_probe');
    probe.enemies.push(unit('turret', 215, 1), unit('turret', 90, 2), unit('turret', 278, 3));
    probe.step(0, 0);
    assert.deepEqual(probe.enemies.map(enemy => enemy.hp), [3, 3, 5]);
    assert.equal(probe.effects.filter(effect => effect.shape === 'strip').length, 2);
    const singleTarget = setup('split_probe');
    singleTarget.enemies.push(unit('turret', 215, 1));
    singleTarget.step(0, 0);
    assert.equal(singleTarget.enemies[0].hp, 3);
    assert.equal(singleTarget.effects.filter(effect => effect.shape === 'strip').length, 1);

    for (const [id, shift] of [['pulse_nozzle', 16], ['traction_coil', -20]]) {
        const battle = setup(id);
        battle.enemies.push(unit('turret', 238, 1));
        battle.step(0, 0);
        assert.equal(battle.enemies[0].x, 238 + shift);
    }
    const wrench = setup('bypass_wrench');
    wrench.enemies.push(unit('turret', 230, 1, 20));
    tick(46, () => wrench.step(0, 0));
    assert.equal(wrench.enemies[0].hp, 9);
});

test('pulse nozzle keeps off-axis enemies safe and only pushes an eligible target once per second', () => {
    const battle = new Battle(0, 7, [{ id: 'pulse_nozzle', mods: [] }], { ...M2_RULES, waves: [noSpawn] });
    const front = unit('turret', 230, 1, 20);
    const side = { ...unit('turret', 227, 2, 20), y: START.y + 55 };
    battle.enemies.push(front, side);
    battle.step(0, 0);
    assert.equal(front.x, 246);
    tick(23, () => battle.step(0, 0));
    assert.equal(front.x, 246);
    assert.equal(front.hp, 16);
    tick(23, () => battle.step(0, 0));
    assert.equal(front.x, 262);
    assert.equal(side.hp, 20);
});

test('bypass wrench keeps a combo through 59 absent ticks and clears it after 60', () => {
    for (const [absent, returnDamage] of [[59, 5], [60, 2]]) {
        const battle = new Battle(0, 20261120, [{ id: 'bypass_wrench', mods: [] }], legacyRules({}));
        const target = unit('turret', START.x + 45, 1, 40);
        battle.enemies.push(target);
        tick(31, () => battle.step(0, 0));
        assert.equal(target.hp, 34);
        target.x = START.x + 140;
        tick(absent, () => battle.step(0, 0));
        assert.equal(target.hp, 34);
        target.x = START.x + 45;
        battle.step(0, 0);
        assert.equal(target.hp, 34 - returnDamage);
    }
});

test('traction coil still damages a charger at a closed gate and cannot pull it through or shove it away', () => {
    const coil = [{ id: 'traction_coil', mods: [] }];
    const rules = legacyRules({ seconds: 35, spawnEvery: 44, enemies: ['charger', 'crawler', 'crawler', 'crawler'],
        directive: { type: 'switch', points: [{ x: 82, y: 353 }], variant: 'bypass', minTicks: 960 } },
    { enemyCap: 16, terrain: 'gates' });
    const battle = new Battle(0, 20261120, coil, rules);
    battle.moveTo(300, 395);
    tick(285, () => battle.step(0, 0));
    const charger = battle.enemies.find(enemy => enemy.id === 5 && enemy.kind === 'charger');
    const gate = battle.terrainRects[2];
    assert.ok(charger);
    assert.equal(gate.state, 'closed');
    assert.equal(charger.y, gate.bottom - 7);
    assert.equal(charger.hp, ENEMIES.charger.hp);
    battle.step(0, 0);
    assert.equal(charger.y, gate.bottom - 7);
    assert.equal(charger.hp, ENEMIES.charger.hp - 2);
    assert.equal(charger.nextShift, battle.tick + 30);

    const close = new Battle(0, 7, coil, { ...M2_RULES, waves: [noSpawn] });
    close.enemies.push(unit('turret', START.x + 8, 1));
    close.step(0, 0);
    assert.equal(close.enemies[0].x, START.x + 8);
    assert.equal(close.enemies[0].hp, ENEMIES.turret.hp - 2);
});

test('revive is durable and rolls back a failed wave exactly once; overtime does not offer ads', () => {
    const slots = new Map();
    const storage = platform('revive', slots);
    const rules = { ...CAMPAIGN_01_RULES, encounter: { enemyCap: 36, revive: true, overtime: true },
        startingTools: ['wrench', 'pulse_nozzle'] };
    const run = new Run(storage, rules, { offerRevive: true });
    run.start('arc', 19, 'pulse_nozzle', 'revive-check', 'magnetic_pickup_arm');
    run.battle.tick = run.battle.duration;
    run.advance(1 / 30);
    assert.ok(run.nextWave(run.data.revision));
    const waveStart = run.data;
    run.battle.player.hp = 0;
    run.battle.lastHit = 'charger';
    run.advance(1 / 30);
    assert.ok(run.canRevive);
    const cold = new Run(storage, rules, { offerRevive: true });
    assert.equal(cold.data.phase, 'revive');
    const rev = cold.data.revision;
    assert.equal(cold.revive('other-attempt', rev), false);
    assert.ok(cold.revive('revive-check', rev));
    assert.equal(cold.battle.tick, 0);
    assert.equal(cold.data.parts, waveStart.parts);
    assert.equal(cold.data.blueprint, 'magnetic_pickup_arm');
    assert.deepEqual(cold.data.reports, waveStart.reports);
    assert.equal(cold.revive('revive-check', rev), false);
    cold.battle.player.hp = 0;
    cold.battle.lastHit = 'charger';
    cold.advance(1 / 30);
    assert.equal(cold.data.phase, 'lost');

    const overtime = new Run(platform('overtime'), rules, { offerRevive: true });
    overtime.start('arc', 19, 'wrench', 'challenge', undefined, 'overtime_2');
    overtime.battle.tick = overtime.battle.duration;
    overtime.advance(1 / 30);
    assert.ok(overtime.nextWave(overtime.data.revision));
    overtime.battle.player.hp = 0;
    overtime.battle.lastHit = 'charger';
    overtime.advance(1 / 30);
    assert.equal(overtime.data.phase, 'lost');
    assert.equal(overtime.data.mode, 'overtime_2');
});

test('optional blueprints retain their tradeoffs and report post-cooldown firing', () => {
    const rules = { ...M2_RULES, waves: [noSpawn] };
    const magnetic = new Battle(0, 7, [{ id: 'wrench', mods: ['sorter'] }], rules, { blueprint: 'magnetic_pickup_arm' });
    magnetic.parts.push({ x: START.x + 23, y: START.y });
    magnetic.step(0, 0);
    assert.equal(magnetic.collected, 1);
    assert.equal(magnetic.salvageRate, 0.6);

    const clamps = new Battle(0, 7, [{ id: 'wrench', mods: ['contact', 'splitter'] }], rules, { blueprint: 'narrow_beam_clamp' });
    clamps.enemies.push(unit('turret', 208, 1), unit('turret', 287, 2), unit('turret', 335, 3));
    clamps.enemies[0].marked = true;
    clamps.step(0, 0);
    assert.equal(clamps.triggers.arc, 1);
    assert.deepEqual(clamps.enemies.map(enemy => enemy.hp), [3, 3, 3]);

    const heat = new Battle(0, 7, [{ id: 'torch', mods: ['exchanger', 'valve'] }], rules,
        { blueprint: 'quick_release_heatsink' });
    heat.enemies.push(unit('turret', 230, 1, 100));
    tick(29, () => heat.step(0, 0));
    assert.equal(heat.triggers.heat, 1);
    assert.equal(heat.heatRecovered, false);
    tick(36, () => heat.step(0, 0));
    assert.equal(heat.heatRecovered, true);
});
