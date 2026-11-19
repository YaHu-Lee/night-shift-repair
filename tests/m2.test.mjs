import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { ENEMIES, FIRST_PAIR, M1_RULES, M2_RULES, MODS, START, TOOLS, hasPair } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

const STEP = 1 / 30;
const FINAL = M2_RULES.waves.length - 1;

function makeStore() {
    const entries = new Map();
    const host = { localStorage: {
        getItem: (key) => entries.get(key) ?? null,
        setItem: (key, value) => entries.set(key, value),
    } };
    return (key) => makePlatform(host, key);
}

function advanceUntil(battle, predicate, limit = 500) {
    for (let tick = 0; tick < limit && !predicate(); tick++) battle.step(0, 0);
    assert.ok(predicate());
}

function createFinalRun(platform) {
    const run = new Run(platform, M2_RULES);
    run.start('arc');
    for (let wave = 0; wave < FINAL; wave++) {
        run.battle.tick = run.battle.duration;
        run.advance(STEP, 0, 0);
        assert.equal(run.data.phase, 'shop');
        assert.equal(run.nextWave(run.data.revision), true);
    }
    return run;
}

test('M2 content has six valid encounters, four tools, twelve mods and five shops', () => {
    assert.deepEqual(M2_RULES.waves.map((wave) => wave.seconds), [30, 40, 45, 55, 60, 75]);
    assert.equal(M2_RULES.waves.reduce((total, wave) => total + wave.seconds, 0), 305);
    assert.equal(M2_RULES.tools.length, 4);
    assert.equal(M2_RULES.mods.length, 12);
    assert.deepEqual([...new Set(M2_RULES.waves.flatMap((wave) => wave.enemies))].sort(),
        ['armored', 'charger', 'crawler', 'turret']);
    assert.deepEqual(M2_RULES.waves.map((wave) => Boolean(wave.boss)), [false, false, false, false, false, true]);
    for (const tool of M2_RULES.tools) assert.ok(TOOLS[tool].price > 0 && TOOLS[tool].cooldown > 0);
    for (const mod of M2_RULES.mods) assert.ok(MODS[mod].price > 0);
    assert.equal(M1_RULES.tools.length, 3);
    assert.equal(M1_RULES.mods.length, 6);
});

test('M2 store persists refreshes and a selectable second tool without modifying the M1 checkpoint', () => {
    const makePlatformFor = makeStore();
    const original = new Run(makePlatformFor('m1'));
    original.start('magnet');
    const platform = makePlatformFor('m2');
    const run = new Run(platform, M2_RULES);
    assert.equal(run.data, null);
    run.start('arc');
    run.battle.tick = run.battle.duration;
    run.advance(STEP, 0, 0);
    assert.equal(run.refresh(run.data.revision), true);
    assert.equal(run.refresh(run.data.revision), false);
    assert.equal(run.buy('splitter', 0, run.data.revision), true);
    assert.ok(hasPair(run.data.tools, 'arc'));
    assert.equal(run.nextWave(run.data.revision), true);
    run.battle.tick = run.battle.duration;
    run.battle.collected = 8;
    run.battle.kills = 8;
    run.advance(STEP, 0, 0);
    const tools = run.data.shop.offers.filter((id) => Object.hasOwn(TOOLS, id));
    assert.equal(tools.length, 2);
    const revision = run.data.revision;
    assert.equal(run.buy(tools[0], 0, revision), true);
    assert.equal(run.buy(tools[1], 0, revision), false);
    assert.equal(run.data.tools.length, 2);
    assert.deepEqual(new Run(platform, M2_RULES).data, run.data);
    assert.deepEqual(new Run(makePlatformFor('m1')).data, original.data);
});

test('inspector warns, locks direction, alternates attacks and summons below half health', () => {
    const battle = new Battle(FINAL, 42, [], M2_RULES);
    advanceUntil(battle, () => battle.boss.phase === 'warning');
    assert.equal(battle.boss.attack, 'sweep');
    const { vx, vy } = battle.boss.unit;
    const hp = battle.player.hp;
    for (let tick = 0; tick < 6; tick++) battle.step(1, 0);
    assert.deepEqual([battle.boss.unit.vx, battle.boss.unit.vy], [vx, vy]);
    assert.equal(battle.player.hp, hp);
    advanceUntil(battle, () => battle.boss.phase === 'warning' && battle.boss.attack === 'charge');
    battle.boss.unit.hp = ENEMIES.inspector.hp / 2;
    advanceUntil(battle, () => battle.boss.phase === 'warning' && battle.boss.attack === 'summon');
    advanceUntil(battle, () => battle.warnings.length >= 3);
    advanceUntil(battle, () => battle.enemies.some((enemy) => enemy.kind === 'crawler'));
});

test('Boss expiry is a loss and defeating it completes the run and persists the final report', () => {
    const makePlatformFor = makeStore();
    const timeout = createFinalRun(makePlatformFor('timeout'));
    timeout.battle.tick = timeout.battle.duration;
    timeout.advance(STEP, 0, 0);
    assert.equal(timeout.data.phase, 'lost');
    assert.equal(timeout.data.finishReason, 'timeout');
    assert.equal(timeout.data.shop, null);

    const platform = makePlatformFor('victory');
    const victory = createFinalRun(platform);
    const cold = new Run(platform, M2_RULES);
    assert.equal(cold.battle.tick, 0);
    assert.equal(cold.paused, true);
    assert.equal(cold.battle.boss.unit.hp, ENEMIES.inspector.hp);
    victory.battle.boss.unit.hp = 1;
    victory.battle.boss.unit.y = START.y + 55;
    victory.advance(STEP, 0, 0);
    assert.equal(victory.data.phase, 'won');
    assert.equal(victory.data.finishReason, 'cleared');
    assert.equal(victory.data.reports.length, 6);
    assert.deepEqual(new Run(platform, M2_RULES).data, victory.data);
});

test('M2 swaps a full-slot mod atomically without removing the starter', () => {
    const platform = makeStore()('replacement');
    const run = new Run(platform, M2_RULES);
    run.start('arc');
    run.battle.tick = run.battle.duration;
    run.battle.collected = 18;
    run.battle.kills = 18;
    run.advance(STEP, 0, 0);
    assert.equal(run.buy('splitter', 0, run.data.revision), true);
    const revision = run.data.revision;
    const parts = run.data.parts;
    assert.ok(run.data.shop.offers.includes('relay'));
    assert.equal(run.buy('relay', 0, revision, 'contact'), false);
    assert.equal(run.buy('relay', 0, revision, 'splitter'), true);
    assert.equal(run.buy('relay', 0, revision, 'splitter'), false);
    assert.equal(run.data.parts, parts - MODS.relay.price);
    assert.deepEqual(run.data.tools[0].mods, ['contact', 'relay']);
    assert.deepEqual(new Run(platform, M2_RULES).data, run.data);
});

function armored(facingX) {
    return {
        x: START.x + 55, y: START.y, id: 20, kind: 'armored', hp: 8, state: 'walk',
        next: 0, vx: 0, vy: 0, facingX, facingY: 0, marked: false,
    };
}

test('induction hits nearby enemies in all directions and armor blocks frontal damage', () => {
    const battle = new Battle(3, 42, [{ id: 'induction', mods: [] }], M2_RULES);
    const facing = armored(-1);
    const exposed = { ...armored(-1), id: 21, x: START.x - 55 };
    battle.enemies.push(facing, exposed);
    battle.step(0, 0);
    assert.ok(Math.abs(facing.hp - 6.8) < 1e-6);
    assert.equal(exposed.hp, 5);
});

test('utility mods affect speed, block one hit and increase salvage', () => {
    const battle = new Battle(0, 42, [
        { id: 'wrench', mods: ['bearings', 'plate'] },
        { id: 'induction', mods: ['sorter'] },
    ], M2_RULES);
    battle.step(1, 0);
    assert.ok(battle.player.x - START.x > 5.2);
    assert.equal(battle.salvageRate, 0.75);
    battle.enemies.push({ ...armored(-1), x: battle.player.x, y: battle.player.y, hp: 100 });
    battle.step(0, 0);
    assert.equal(battle.player.hp, M2_RULES.maxHp);
    assert.equal(battle.shielded, false);
    const enemy = battle.enemies[0];
    enemy.x = battle.player.x;
    enemy.y = battle.player.y;
    battle.tick = battle.player.invulnerableUntil;
    battle.step(0, 0);
    assert.equal(battle.player.hp, M2_RULES.maxHp - 1);
});

test('both M2 routes can complete all six encounters using actual ticks and shop transitions', () => {
    for (const route of ['arc', 'magnet']) {
        const platform = makeStore()(route);
        const run = new Run(platform, M2_RULES);
        run.start(route);
        for (let wave = 0; wave <= FINAL; wave++) {
            const battle = run.battle;
            while (!battle.finished) {
                let goalX;
                let goalY;
                if (battle.boss) {
                    const { unit, phase, attack } = battle.boss;
                    const attacking = phase === 'warning' || phase === 'charge' || phase === 'sweep';
                    const offset = attacking ? (attack === 'summon' ? 0 : 1.3) : 0.4;
                    const angle = Math.atan2(battle.player.y - unit.y, battle.player.x - unit.x) + offset;
                    goalX = unit.x + 64 * Math.cos(angle);
                    goalY = unit.y + 64 * Math.sin(angle);
                } else {
                    const angle = battle.tick / 68;
                    goalX = 180 + 113 * Math.cos(angle);
                    goalY = 353 + 147 * Math.sin(angle);
                }
                const dx = goalX - battle.player.x;
                const dy = goalY - battle.player.y;
                const length = Math.max(5.2, Math.hypot(dx, dy));
                run.advance(STEP, dx / length, dy / length);
            }
            assert.ok(battle.player.hp > 0, `${route} wave ${wave + 1}`);
            if (wave === FINAL) {
                assert.equal(battle.bossDefeated, true);
                assert.ok(battle.tick < battle.duration);
                break;
            }
            assert.equal(run.data.phase, 'shop');
            if (wave === 0) assert.equal(run.buy(FIRST_PAIR[route], 0, run.data.revision), true);
            if (wave === 1) assert.equal(run.buy('riveter', 0, run.data.revision), true);
            if (wave > 1) {
                for (const pick of run.data.shop.offers.slice()) {
                    if (run.canBuy(pick, 1)) assert.equal(run.buy(pick, 1, run.data.revision), true);
                }
            }
            assert.equal(run.nextWave(run.data.revision), true);
        }
        assert.equal(run.data.phase, 'won');
        assert.equal(run.data.reports.length, 6);
        assert.deepEqual(new Run(platform, M2_RULES).data, run.data);
    }
});
