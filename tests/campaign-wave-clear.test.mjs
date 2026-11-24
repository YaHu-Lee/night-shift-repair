import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_CATALOG, campaignStage } from '../.m0-build/campaign/CampaignCatalog.js';
import { campaignPressureRules } from '../.m0-build/campaign/CampaignPressure.js';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { CAMPAIGN_01_RULES, TICK_RATE } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

const step = 1 / TICK_RATE;
const regular = { seconds: 1, spawnEvery: 12, enemies: ['crawler'] };
const wipe = battle => {
    for (const enemy of battle.enemies.slice()) battle.hit(enemy, 100, battle.player, 'magnet');
};

function until(condition, update, limit = 4000) {
    for (let tick = 0; tick < limit && !condition(); tick++) update();
    assert.ok(condition(), `condition still false after ${limit} ticks`);
}

function waveBattle(spec, enemyCap = 5) {
    const rules = { ...CAMPAIGN_01_RULES, waves: [spec], encounter: { enemyCap } };
    const battle = new Battle(0, 42, [], rules);
    battle.player.invulnerableUntil = Number.MAX_SAFE_INTEGER;
    return battle;
}

test('lift reserves can advance after a quiet interval and keep their ordinary cadence after damage', () => {
    const wave = campaignStage('09').rules.waves[3];
    assert.equal(wave.clear.reserveRestTicks, 18);
    function secondWarning(injured) {
        const size = wave.escalation.groupSize;
        const battle = waveBattle({ ...wave, clear: { ...wave.clear, opening: 0, reserves: 2 * size } }, 2 * size);
        if (injured) battle.player.hp--;
        battle.step(0, 0);
        assert.equal(battle.reserveCursor, size);
        until(() => battle.reserveCursor === 2 * size, () => { wipe(battle); battle.step(0, 0); });
        return battle.tick;
    }
    assert.equal(secondWarning(true), 1 + wave.escalation.spawnEvery);
    assert.ok(secondWarning(false) < secondWarning(true));
});

test('a finite combat wave must defeat its last enemy even after the former time limit', () => {
    const battle = waveBattle({ ...regular, clear: { opening: 2, reserves: 0 } });
    assert.deepEqual(battle.clearProgress, { kills: 0, total: 2 });
    until(() => battle.tick > battle.duration && battle.enemies.length === 2, () => battle.step(0, 0));
    assert.equal(battle.warnings.length, 0);
    assert.equal(battle.finished, false);
    battle.hit(battle.enemies[0], 100, battle.player, 'magnet');
    assert.deepEqual(battle.clearProgress, { kills: 1, total: 2 });
    assert.equal(battle.waveCleared, false);
    wipe(battle);
    assert.deepEqual(battle.clearProgress, { kills: 2, total: 2 });
    assert.equal(battle.finished, true);
    assert.equal(battle.waveCleared, true);
});

test('standing on a mature arrival warning cannot consume an enemy from the clear budget', () => {
    const battle = waveBattle({ ...regular, clear: { opening: 1, reserves: 0 } });
    battle.step(0, 0);
    const original = battle.warnings[0];
    assert.ok(original);
    const matureAt = original.at;
    Object.assign(battle.player, { x: original.x, y: original.y });
    until(() => battle.tick === matureAt, () => battle.step(0, 0));
    assert.ok(battle.enemies.every(enemy => Math.hypot(enemy.x - battle.player.x, enemy.y - battle.player.y) >= 55));
    assert.equal(battle.waveCleared, false);
    until(() => battle.enemies.length > 0, () => battle.step(0, 0));
    wipe(battle);
    assert.equal(battle.waveCleared, true);
    assert.deepEqual(battle.clearProgress, { kills: 1, total: 1 });
});

test('a full field delays opening enemies and reserve enemies without dropping either budget', () => {
    const battle = waveBattle({ ...regular, escalation: { atTick: 10, spawnEvery: 11, enemies: ['charger'] },
        clear: { opening: 2, reserves: 2, reserveAfterTick: 10 } }, 1);
    until(() => battle.tick === 45, () => battle.step(0, 0));
    assert.equal(battle.enemies.length, 1);
    assert.equal(battle.enemies[0].kind, 'crawler');
    assert.equal(battle.finished, false);
    const killed = [];
    until(() => battle.finished, () => {
        assert.ok(battle.enemies.length + battle.warnings.length <= 1);
        for (const enemy of battle.enemies) killed.push(enemy.kind);
        wipe(battle);
        battle.step(0, 0);
    });
    assert.deepEqual(killed, ['crawler', 'crawler', 'charger', 'charger']);
    assert.deepEqual(battle.clearProgress, { kills: 4, total: 4 });
    assert.ok(battle.waveCleared);
});

test('the starting station sends groups from alternating sides and retries members delayed by the cap', () => {
    const stage = campaignStage('01');
    const regular = campaignPressureRules(stage.id, stage.rules, 'normal');
    const overtime = campaignPressureRules(stage.id, stage.rules, 'overtime_1');
    const wave = regular.waves[1];
    assert.equal(wave.clear.opening, 54);
    assert.ok(overtime.waves[1].clear.openingGroup.every < wave.clear.openingGroup.every);
    assert.equal(overtime.waves[1].clear.opening, wave.clear.opening);

    const open = waveBattle(wave, 6);
    open.step(0, 0);
    assert.deepEqual(open.warnings.map(({ y, kind }) => [y, kind]), [
        [open.spawnBounds.top - 10, 'crawler'], [open.spawnBounds.top - 10, 'crawler'], [open.spawnBounds.top - 10, 'charger'],
        ...Array(2).fill([open.spawnBounds.top - 10, 'crawler']), [open.spawnBounds.top - 25, 'crawler'],
    ]);
    until(() => open.tick === 105, () => { wipe(open); open.step(0, 0); });
    assert.equal(open.warnings.length, 6);
    assert.ok(open.warnings.every(warning => warning.y <= open.spawnBounds.bottom + 25));

    const capped = waveBattle(wave, 2);
    capped.step(0, 0);
    assert.equal(capped.warnings.length, 2);
    until(() => capped.finished, () => {
        assert.ok(capped.enemies.length + capped.warnings.length <= 2);
        wipe(capped);
        capped.step(0, 0);
    });
    assert.deepEqual(capped.clearProgress, { kills: 54, total: 54 });
    assert.equal(capped.parts.length + capped.collected, wave.clear.partBudget);
});

test('all 20 campaign entries supply five positive kill quotas and one isolated boss by default', () => {
    for (const { id, rules, finalWave } of CAMPAIGN_CATALOG) {
        assert.equal(finalWave, 5, id);
        assert.equal(rules.waves.length, 6, id);
        assert.equal(rules.encounter.combatOnly, true, id);
        assert.equal(rules.encounter.terrain, undefined, id);
        for (const spec of rules.waves) {
            for (const prop of ['directive', 'livePuddles', 'liftGroups']) assert.equal(spec[prop], undefined, id);
        }
        for (const spec of rules.waves.slice(0, finalWave)) {
            assert.ok(spec.clear.opening > 0 && spec.enemies.length > 0, id);
        }
        const finale = rules.waves[finalWave];
        assert.equal(finale.boss, true, id);
        assert.equal(finale.spawnEvery, 0, id);
        assert.deepEqual(finale.enemies, [], id);
        assert.equal(finale.clear, undefined, id);
    }
});

test('a shop saved before drone escorts keeps its purchases and starts the new full quota on the next wave', () => {
    const slots = new Map();
    const platform = makePlatform({ localStorage: { getItem: k => slots.get(k) ?? null,
        setItem: (k, v) => slots.set(k, v) } }, 'escort-migration');
    const rules = campaignStage('01').rules;
    const previous = { ...rules, waves: rules.twoToolWaves };
    const old = new Run(platform, previous, { clearByKills: true });
    old.start('arc', 42, 'wrench', 'migrate', undefined, 'normal', 0, {});
    until(() => old.data.phase === 'shop', () => { wipe(old.battle); old.advance(step); });
    const saved = structuredClone(old.data);
    old.dispose();
    const restored = new Run(platform, rules, { clearByKills: true });
    assert.deepEqual(restored.data, saved);
    assert.ok(restored.nextWave(saved.revision));
    assert.equal(restored.battle.clearProgress.total, rules.waves[1].clear.opening);
    assert.ok(restored.battle.clearProgress.total > previous.waves[1].clear.opening);
    restored.dispose();
});

test('the freight elevator sends half a group through each of the two marked entrances', () => {
    const stage = campaignStage('09');
    const battle = new Battle(3, 42, [], stage.rules);
    battle.step(0, 0);
    const edges = battle.warnings.map(warning => warning.y);
    assert.deepEqual(edges, [...Array(5).fill(battle.spawnBounds.top - 10), battle.spawnBounds.top - 25,
        ...Array(5).fill(battle.spawnBounds.bottom + 10), battle.spawnBounds.bottom + 25]);
    assert.equal(new Set(battle.warnings.map(warning => warning.at)).size, 1);
    assert.equal(battle.clearProgress.total, battle.spec.clear.opening + battle.spec.clear.reserves);
});

test('08 and 09 open immediately with enemy warnings and no map introduction delay', () => {
    for (const id of ['08', '09']) {
        const stage = campaignStage(id);
        const rules = campaignPressureRules(stage.id, stage.rules, 'normal', true);
        const battle = new Battle(0, 42, [], rules);
        assert.equal(battle.spec.clear.reserveAfterTick, undefined);
        battle.step(0, 0);
        assert.equal(battle.warnings.length, 3, id);
    }
});

test('09 spawns its converted enemy roster on the open floor and completes by defeating the reserves', () => {
    const stage = campaignStage('09');
    const rules = campaignPressureRules(stage.id, stage.rules, 'normal', true);
    const battle = new Battle(4, 20261120, [], rules);
    battle.player.invulnerableUntil = Number.MAX_SAFE_INTEGER;
    const spec = rules.waves[4];
    const { total } = battle.clearProgress;
    assert.equal(total, spec.clear.opening + spec.clear.reserves);
    assert.equal(battle.mission, null);
    const killed = [];
    until(() => battle.finished, () => {
        battle.step(0, 0);
        for (const enemy of battle.enemies) killed.push(enemy.kind);
        wipe(battle);
    });
    assert.deepEqual(killed.slice(0, spec.enemies.length), spec.enemies);
    assert.deepEqual(killed.slice(spec.clear.opening, spec.clear.opening + spec.escalation.enemies.length), spec.escalation.enemies);
    assert.ok(battle.waveCleared);
    assert.deepEqual(battle.clearProgress, { kills: total, total });

    const boss = new Battle(5, 20261120, [], rules);
    assert.equal(boss.clearProgress, undefined);
    boss.tick = boss.duration;
    assert.equal(boss.waveCleared, false);
    assert.equal(boss.finished, true);
});

test('a timed checkpoint retains old shop progress and uses kill quotas for the next wave; long kill waves survive shop and revive reloads', () => {
    const slots = new Map();
    const platform = makePlatform({ localStorage: { getItem: key => slots.get(key) ?? null,
        setItem: (key, value) => slots.set(key, value) } }, 'campaign-wave-clear-test');
    const authored = campaignStage('01').rules;
    const base = { ...authored, encounter: { ...authored.encounter, combatOnly: false },
        waves: [regular, regular, authored.waves[5]] };
    const finite = { ...authored, waves: [
        { ...regular, clear: { opening: 1, reserves: 0 } },
        { ...regular, clear: { opening: 1, reserves: 0 } },
        base.waves[2],
    ] };
    const open = () => new Run(platform, finite, { clearByKills: true, offerRevive: true });
    const old = new Run(platform, base);
    old.start('arc', 42, 'wrench', 'old-equipped', undefined, 'normal', 0, {});
    old.battle.tick = old.battle.duration;
    old.battle.kills = 3;
    old.advance(step);
    assert.equal(old.data.phase, 'shop');
    assert.equal(old.data.reports[0].kills, 3);
    old.dispose();
    let run = open();
    assert.equal(run.data.runId, 'old-equipped');
    assert.ok(run.data.equipment);
    assert.equal(run.data.clearByKills, undefined);
    assert.equal(run.data.phase, 'shop');
    assert.equal(run.data.reports[0].kills, 3);
    assert.ok(run.nextWave(run.data.revision));
    assert.deepEqual(run.battle.clearProgress, { kills: 0, total: 1 });

    run.start('arc', 42, 'wrench', 'finite-equipped', undefined, 'normal', 0, {});
    assert.equal(run.data.clearByKills, true);
    const battle = run.battle;
    until(() => battle.tick > battle.duration && battle.enemies.length > 0, () => run.advance(step));
    assert.equal(run.data.phase, 'battle');
    wipe(battle);
    run.advance(step);
    assert.equal(run.data.phase, 'shop');
    assert.ok(run.data.reports[0].ticks > battle.duration);
    assert.equal(run.data.reports[0].kills, 1);
    const afterClear = run.data;
    run.dispose();
    run = open();
    assert.deepEqual(run.data, afterClear);
    assert.ok(run.nextWave(run.data.revision));
    assert.deepEqual(run.battle.clearProgress, { kills: 0, total: 1 });
    run.battle.tick = run.battle.duration + 8;
    run.battle.player.hp = 1;
    run.battle.hurt('crawler');
    run.advance(step);
    assert.equal(run.data.phase, 'revive');
    const afterDefeat = run.data;
    run.dispose();

    run = open();
    assert.deepEqual(run.data, afterDefeat);
    assert.ok(run.revive(run.data.runId, run.data.revision));
    assert.equal(run.data.clearByKills, true);
    assert.equal(run.data.reports.length, 1);
    assert.deepEqual(run.battle.clearProgress, { kills: 0, total: 1 });
    run.battle.tick = run.battle.duration + 8;
    run.battle.player.hp = 1;
    run.battle.hurt('crawler');
    run.advance(step);
    assert.equal(run.data.phase, 'lost');
    assert.equal(run.data.finishReason, 'defeated');
    const afterReviveDefeat = run.data;
    run.dispose();
    run = open();
    assert.deepEqual(run.data, afterReviveDefeat);
    run.dispose();
});
