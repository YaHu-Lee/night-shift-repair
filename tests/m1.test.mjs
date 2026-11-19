import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { FIELD, FIRST_PAIR, RUN_SEED, START, WAVES, hasPair } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

function fixture() {
    const slots = new Map();
    let fail = false;
    const platform = makePlatform({
        localStorage: {
            getItem: (key) => slots.get(key) ?? null,
            setItem: (key, value) => {
                if (fail) throw new Error('storage full');
                slots.set(key, value);
            },
        },
    }, 'm1-test');
    return { platform, slots, fail: (next) => { fail = next; } };
}

function finishWave(run, collected = 0, remaining = 0) {
    run.battle.tick = run.battle.duration;
    run.battle.collected = collected;
    run.battle.kills = collected + remaining;
    run.battle.parts.push(...Array.from({ length: remaining }, () => ({ ...START })));
    run.advance(1 / 30, 0, 0);
}

function enemy(id, x, y, marked = false, hp = 4) {
    return { id, x, y, marked, hp, kind: 'crawler', state: 'walk', next: 0, vx: 0, vy: 0 };
}

test('M1 combat replays deterministically and uses the 25/30/35-second waves', () => {
    assert.deepEqual(WAVES.map((wave) => wave.seconds), [25, 30, 35]);
    const replay = () => {
        const battle = new Battle(2, RUN_SEED, [{ id: 'wrench', mods: ['contact'] }, { id: 'riveter', mods: [] }]);
        for (let tick = 0; tick < 1050; tick++) {
            const corner = Math.floor(tick / 52) % 4;
            battle.step([1, 0, -1, 0][corner], [0, 1, 0, -1][corner]);
        }
        return [battle.tick, battle.player, battle.enemies, battle.bullets, battle.parts, battle.kills];
    };
    const actual = replay();
    assert.deepEqual(actual, replay());
    assert.ok(actual[0] > 300);
    assert.ok(actual[1].x >= FIELD.left && actual[1].x <= FIELD.right);
});

test('arc needs clustered targets and magnet consumes exactly five pickups', () => {
    const arc = new Battle(0, RUN_SEED, [{ id: 'wrench', mods: ['contact', 'splitter'] }]);
    arc.enemies.push(enemy(1, START.x + 40, START.y, true), enemy(2, START.x + 95, START.y));
    arc.step(0, 0);
    assert.equal(arc.triggers.arc, 1);
    assert.equal(arc.enemies[1].hp, 2);

    const magnet = new Battle(0, RUN_SEED, [{ id: 'wrench', mods: ['ring', 'coil'] }]);
    magnet.enemies.push(enemy(1, START.x + 72, START.y, false, 6));
    magnet.parts.push(...Array.from({ length: 4 }, () => ({ ...START })));
    magnet.step(0, 0);
    assert.equal(magnet.magnetCharge, 4);
    assert.equal(magnet.triggers.magnet, 0);
    magnet.parts.push({ ...START });
    magnet.step(0, 0);
    assert.equal(magnet.triggers.magnet, 1);
    assert.equal(magnet.magnetCharge, 0);
    assert.equal(magnet.collected, 5);
    assert.equal(magnet.kills, 1);
});

test('the first pair is affordable on both routes, including after a refresh', () => {
    for (const route of ['arc', 'magnet']) {
        const run = new Run(fixture().platform);
        run.start(route);
        finishWave(run);
        const initialRevision = run.data.revision;
        assert.ok(run.canBuy(FIRST_PAIR[route], 0));
        assert.equal(run.refresh(initialRevision), true);
        assert.ok(run.canBuy(FIRST_PAIR[route], 0));
        assert.equal(run.refresh(run.data.revision), false);
        assert.equal(run.buy(FIRST_PAIR[route], 0, run.data.revision), true);
        assert.ok(hasPair(run.data.tools, route));
    }
});

test('shop and wave transactions survive restart without reissuing rewards or spending twice', () => {
    const { platform, slots } = fixture();
    const run = new Run(platform);
    run.start('arc');
    finishWave(run, 7, 5);
    assert.equal(run.data.parts, 9);
    const shop = new Run(platform);
    assert.deepEqual(shop.data, run.data);
    const revision = shop.data.revision;
    assert.equal(shop.buy('splitter', 0, revision), true);
    assert.equal(shop.buy('splitter', 0, revision), false);
    assert.equal(shop.data.parts, 5);
    assert.equal(shop.nextWave(revision), false);
    assert.equal(shop.nextWave(shop.data.revision), true);
    shop.advance(1 / 30, 1, 0);
    const cold = new Run(platform);
    assert.equal(cold.data.wave, 1);
    assert.equal(cold.data.parts, 5);
    assert.equal(cold.battle.tick, 0);
    assert.equal(cold.paused, true);

    const recent = [...slots].sort((left, right) => JSON.parse(right[1]).sequence - JSON.parse(left[1]).sequence)[0][0];
    slots.set(recent, 'damaged');
    const fallback = new Run(platform);
    assert.equal(fallback.data.phase, 'shop');
    assert.equal(fallback.data.parts, 5);
    assert.ok(hasPair(fallback.data.tools, 'arc'));
});

test('failed commits preserve the previous checkpoint and bounded tick advancement', () => {
    const storage = fixture();
    const run = new Run(storage.platform);
    run.start('arc');
    run.advance(40, 0, 0);
    assert.equal(run.battle.tick, 3);
    run.pause();
    run.advance(40, 1, 0);
    assert.equal(run.battle.tick, 3);
    run.resume();
    storage.fail(true);
    finishWave(run, 8);
    assert.equal(run.waitingForSave, true);
    assert.equal(new Run(storage.platform).data.phase, 'battle');
    storage.fail(false);
    assert.equal(run.retry(), true);
    assert.equal(run.retry(), false);
    assert.equal(run.data.parts, 8);
    const revision = run.data.revision;
    storage.fail(true);
    assert.equal(run.buy('splitter', 0, revision), false);
    assert.equal(run.data.parts, 8);
    assert.equal(new Run(storage.platform).data.revision, revision);
});

test('three completed waves win, losing ends the run, and a restart resets progress', () => {
    const run = new Run(fixture().platform);
    run.start('magnet');
    finishWave(run);
    assert.equal(run.nextWave(run.data.revision), true);
    finishWave(run);
    assert.equal(run.nextWave(run.data.revision), true);
    finishWave(run);
    assert.equal(run.data.phase, 'won');
    const oldId = run.data.runId;
    run.start('magnet');
    assert.notEqual(run.data.runId, oldId);
    assert.equal(run.data.parts, 0);
    run.battle.player.hp = 0;
    run.advance(1 / 30, 0, 0);
    assert.equal(run.data.phase, 'lost');
});

test('both routes can clear all three waves with real ticks and shop purchases', () => {
    for (const route of ['arc', 'magnet']) {
        const run = new Run(fixture().platform);
        run.start(route);
        for (let wave = 0; wave < WAVES.length; wave++) {
            const battle = run.battle;
            while (!battle.finished) {
                const angle = battle.tick / 84;
                const dx = 180 + 113 * Math.cos(angle) - battle.player.x;
                const dy = 353 + 147 * Math.sin(angle) - battle.player.y;
                const magnitude = Math.max(5.2, Math.hypot(dx, dy));
                run.advance(1 / 30, dx / magnitude, dy / magnitude);
            }
            assert.equal(battle.tick, WAVES[wave].seconds * 30, `${route} wave ${wave + 1}`);
            assert.ok(battle.player.hp > 0);
            if (wave === 1) assert.ok(battle.triggers[route] > 0);
            if (wave === 0) assert.equal(run.buy(FIRST_PAIR[route], 0, run.data.revision), true);
            if (wave === 1) assert.equal(run.buy('riveter', 0, run.data.revision), true);
            if (wave < WAVES.length - 1) assert.equal(run.nextWave(run.data.revision), true);
        }
        assert.equal(run.data.phase, 'won');
        assert.equal(run.data.reports.length, 3);
        assert.equal(run.data.reports[1].triggers[route] > 0, true);
        assert.deepEqual(new Run(run.platform).data.reports, run.data.reports);
    }
});

test('second shop can equip an overheat pair and persists the result exactly once', () => {
    const run = new Run(fixture().platform);
    run.start('arc');
    finishWave(run, 15);
    assert.equal(run.buy('splitter', 0, run.data.revision), true);
    assert.equal(run.nextWave(run.data.revision), true);
    finishWave(run, 20, 6);
    assert.deepEqual(run.data.shop.offers.slice(0, 2), ['riveter', 'torch']);
    assert.equal(run.buy('torch', 0, run.data.revision), true);
    assert.deepEqual(run.data.shop.offers.slice(0, 2), ['exchanger', 'valve']);
    assert.equal(run.buy('exchanger', 1, run.data.revision), true);
    assert.equal(run.buy('valve', 1, run.data.revision), true);
    assert.equal(run.data.parts, 23);
    assert.ok(hasPair(run.data.tools, 'heat'));
    const saved = new Run(run.platform);
    assert.deepEqual(saved.data, run.data);
    assert.equal(saved.data.reports[1].salvaged, 3);
    const battle = new Battle(2, RUN_SEED, [{ id: 'torch', mods: ['exchanger', 'valve'] }]);
    battle.enemies.push(enemy(100, START.x + 50, START.y, false, 100));
    for (let tick = 0; tick < 44; tick++) battle.step(0, 0);
    assert.equal(battle.triggers.heat, 1);
    const health = battle.enemies.find((target) => target.id === 100).hp;
    for (let tick = 0; tick < 25; tick++) battle.step(0, 0);
    assert.equal(battle.enemies.find((target) => target.id === 100).hp, health);
});

test('turret warns before firing in the telegraphed direction', () => {
    const battle = new Battle(2, RUN_SEED, []);
    battle.enemies.push({ ...enemy(20, START.x + 60, START.y), kind: 'turret' });
    battle.step(0, 0);
    assert.equal(battle.enemies[0].state, 'warn');
    for (let tick = 0; tick < 20; tick++) battle.step(0, 1);
    assert.equal(battle.bullets.length, 0);
    battle.step(0, 1);
    assert.equal(battle.bullets.length, 1);
    assert.equal(battle.bullets[0].vx, -3.25);
    assert.equal(battle.bullets[0].y, START.y);
});

test('prior M1 checkpoints remain readable and accumulate new wave reports', () => {
    const { platform } = fixture();
    const run = new Run(platform);
    run.start('magnet');
    finishWave(run, 9);
    const { reports, ...legacy } = run.data;
    assert.equal(platform.writeCheckpoint(1, legacy), true);
    const restored = new Run(platform);
    assert.deepEqual(restored.data, legacy);
    assert.equal(restored.nextWave(restored.data.revision), true);
    finishWave(restored, 8);
    assert.deepEqual(restored.data.reports.map((report) => report.wave), [1]);
    assert.deepEqual(new Run(platform).data, restored.data);
});
