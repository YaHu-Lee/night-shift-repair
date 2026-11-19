import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    ARENA_HEIGHT, ARENA_WIDTH, STEP_SECONDS, STRESS_COUNTS, StressWorld,
} from '../.m0-build/core/StressWorld.js';

const directions = [[1, 0], [0, 1], [-0.4, 1], [-1, 0], [0, -1], [0, 0]];
const inputAt = (tick) => directions[Math.floor(tick / 73) % directions.length];
const snapshot = ({ player, enemies, projectiles, pickups, tick }) =>
    ({ player, enemies, projectiles, pickups, tick });

test('fixed 30 Hz seeded simulation is replayable and seed zero differs from seed one', () => {
    assert.equal(STEP_SECONDS, 1 / 30);
    const a = new StressWorld(0);
    const b = new StressWorld(0);
    const c = new StressWorld(1);
    assert.notDeepEqual(a.enemies, c.enemies);
    assert.deepEqual(snapshot(a), snapshot(b));
    for (let tick = 0; tick < 1800; tick++) {
        const args = inputAt(tick);
        a.step(...args);
        b.step(...args);
        if (tick % 119 === 0) assert.deepEqual(snapshot(a), snapshot(b));
    }
    assert.equal(a.tick, 1800);
    assert.deepEqual(snapshot(a), snapshot(b));
});

test('movement honors analog magnitude, diagonal speed, clamps and invalid input', () => {
    const { x, y } = new StressWorld(3).player;
    const straight = new StressWorld(3);
    const diagonal = new StressWorld(3);
    const partial = new StressWorld(3);
    straight.step(1, 0);
    diagonal.step(3, 4);
    partial.step(0.25, 0);
    assert.ok(Math.abs(Math.hypot(diagonal.player.x - x, diagonal.player.y - y) - (straight.player.x - x)) < 1e-12);
    assert.ok(Math.abs((partial.player.x - x) * 4 - (straight.player.x - x)) < 1e-12);
    partial.step(Infinity, NaN);
    assert.equal(partial.player.y, y);
    for (let tick = 0; tick < 400; tick++) straight.step(10, -10);
    assert.deepEqual(straight.player, { x: ARENA_WIDTH - 10, y: 10 });
});

test('peak load stays constant for three minutes; positions bounded, storage reused', () => {
    const world = new StressWorld(199);
    const kinds = Object.keys(STRESS_COUNTS);
    const holders = Object.fromEntries(kinds.map((key) => [key, world[key]]));
    const slots = Object.fromEntries(kinds.map((key) => [key, [...world[key]]]));
    for (let tick = 0; tick < 5400; tick++) {
        world.step(...inputAt(tick));
        if (tick % 81 !== 0) continue;
        for (const key of kinds) {
            assert.equal(world[key], holders[key]);
            assert.equal(world[key].length, STRESS_COUNTS[key]);
            const margin = key === 'projectiles' ? 10 : 0;
            world[key].forEach((point, i) => {
                assert.equal(point, slots[key][i]);
                assert.ok(point.x >= -margin && point.x <= ARENA_WIDTH + margin);
                assert.ok(point.y >= -margin && point.y <= ARENA_HEIGHT + margin);
            });
        }
    }
    assert.equal(world.tick, 5400);
});
