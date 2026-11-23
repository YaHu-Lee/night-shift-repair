import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { M1_RULES, TOOLS } from '../.m0-build/m1/content.js';
import { circleContact, sampleMeleeHead, weaponDock, WEAPON_ORBIT_HEIGHT } from '../.m0-build/m1/WeaponMotion.js';

function meleeBattle(tool = 'wrench') {
    return new Battle(0, 105, [{ id: tool, mods: [] }], { ...M1_RULES, sweptMelee: true,
        waves: [{ seconds: 30, spawnEvery: 0, enemies: [] }] });
}

function addTarget(battle, x, y) {
    const unit = { x, y, id: battle.enemies.length + 1, hp: 20, kind: 'turret', state: 'walk',
        next: 100, vx: 0, vy: 0, marked: false };
    battle.enemies.push(unit);
    return unit;
}

test('six idle weapons share the orbit and move slowly clockwise', () => {
    function angle(slot, tick) {
        const dock = weaponDock(slot, 6, tick);
        return Math.atan2((dock.y - WEAPON_ORBIT_HEIGHT) / 34, dock.x / 37);
    }
    const angles = Array.from({ length: 6 }, (_, slot) => angle(slot, 0));
    for (let index = 1; index < angles.length; index++) {
        const gap = angles[index] - angles[index - 1];
        assert.ok(Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap)) - Math.PI / 3) < 1e-9);
    }
    const drift = angle(2, 30) - angle(2, 0);
    assert.ok(drift < 0 && drift > -0.6);
});

test('melee selects from the player radius using distance to the weapon', () => {
    const battle = meleeBattle();
    const { x, y } = battle.player;
    addTarget(battle, x + 21, y);
    const outside = addTarget(battle, x - 56, y + 14);
    battle.step(0, 0);
    assert.equal(battle.weaponCasts[0].ux, 1, 'out-of-range enemy beside the weapon stays ineligible');
    outside.x = x - 43;
    for (let age = 0; age < 14; age++) battle.step(0, 0);
    assert.ok(battle.weaponCasts[1].ux < 0, 'weapon prefers its side even if another enemy is closer to the player');
});

test('each melee attacks with two distinct paths, hits along the sweep once, and stops at the player radius', () => {
    for (const [tool, names] of [['wrench', ['横扫', '直刺']], ['bypass_wrench', ['反手钩扫', '压击']]]) {
        const battle = meleeBattle(tool);
        const { x, y } = battle.player;
        const aim = addTarget(battle, x - 46, y);
        battle.step(0, 0);
        const cast = battle.weaponCasts[0];
        assert.equal(cast.melee.action, names[0]);
        assert.equal(aim.hp, 20);
        const middle = sampleMeleeHead(cast.melee, cast.melee.first + 1.5);
        const late = cast.melee.points[cast.melee.last - 1];
        const first = addTarget(battle, middle.x, middle.y);
        const second = addTarget(battle, late.x, late.y);
        const miss = addTarget(battle, x + 20, y);
        const outside = addTarget(battle, x - cast.melee.range - 0.05, y);
        for (let age = 0; age < cast.melee.last; age++) battle.step(0, 0);
        assert.deepEqual([aim.hp, first.hp, second.hp, miss.hp, outside.hp], [18, 18, 18, 20, 20]);
        assert.equal(battle.effects.filter(effect => effect.sourceCast === cast).length, 3);
        while (battle.weaponAttackSerial < 2) battle.step(0, 0);
        const next = battle.weaponCasts.at(-1);
        assert.equal(next.melee.action, names[1]);
        assert.notDeepEqual(next.melee.points, cast.melee.points);
    }
});

test('continuous melee contact detects a crossing even when neither endpoint overlaps', () => {
    assert.deepEqual(circleContact(-20, 0, 40, 0, 8), [0.3, 0.7]);
    assert.equal(circleContact(-20, 9, 40, 0, 8), undefined);
});

test('a moving player carries the active sweep and its range limit', () => {
    const battle = meleeBattle();
    const { x, y } = battle.player;
    addTarget(battle, x - 44, y);
    const ahead = addTarget(battle, x - 68, y);
    battle.step(0, 0);
    const [cast] = battle.weaponCasts;
    const start = cast.melee.points[0];
    const middle = cast.melee.points[cast.melee.first + 2];
    for (let age = 0; age < cast.melee.last; age++) battle.step(-1, 0);
    assert.deepEqual(cast.melee.points[0], start);
    assert.ok(cast.melee.points[cast.melee.first + 2].x < middle.x - 15);
    assert.equal(ahead.hp, 18, 'the weapon reaches an enemy that started outside the original circle');
});

// Turrets stay still within 195 units. Use the normal simulation step so hit and
// render events are sampled after movement and expiration, as in Creator.
function cast(id, offsets, mods = []) {
    const battle = new Battle(0, 105, [{ id, mods }]);
    Object.assign(battle.player, { x: 55, y: 300 });
    offsets.forEach(([dx, dy], index) => battle.enemies.push({
        x: 55 + dx, y: 300 + dy, id: index, hp: 20, kind: 'turret',
        state: 'walk', next: 100, vx: 0, vy: 0, marked: false,
    }));
    if (mods.includes('coil')) battle.parts.push(...Array.from({ length: 5 }, () => ({ ...battle.player })));
    battle.step(0, 0);
    return battle;
}

test('riveter paints one full strip and marks only the first three eligible targets', () => {
    const b = cast('riveter', [[8, 0], [32, 11], [70, -10.9], [115, 0], [165, 0], [185, 0]]);
    const [{ sourceCast, ...strip }] = b.effects;
    assert.deepEqual(strip, { x: 55, y: 300, ux: 1, uy: 0, shape: 'strip', kind: 'shot',
        length: TOOLS.riveter.reach, halfWidth: 11, life: 6 });
    assert.equal(sourceCast, b.weaponCasts[0]);
    assert.ok(b.effects.every(effect => effect.sourceCast === sourceCast));
    assert.deepEqual(b.effects.slice(1).map(hit => [hit.shape, hit.x]), [['impact', 63], ['impact', 125], ['impact', 170]]);
    assert.deepEqual(b.enemies.map(e => e.hp), [18, 20, 18, 18, 20, 20]);
    const edge = cast('riveter', [[7, 0], [184.9, 10.9], [185, 0], [-8, 0]]);
    assert.deepEqual(edge.enemies.map(e => e.hp), [18, 18, 20, 20]);
});

test('torch sector uses both its radial cutoff and angular sides, including for vertical aim', () => {
    const b = cast('torch', [[0, 7], [-34.9, 50], [35, 50], [0, 82], [0, 81.9], [20, 80], [0, -12]]);
    const [sector] = b.effects;
    assert.deepEqual([sector.shape, sector.radius, sector.slope, sector.ux, sector.uy], ['sector', TOOLS.torch.reach, 0.7, 0, 1]);
    assert.deepEqual(b.enemies.map(e => e.hp), [19, 19, 20, 20, 19, 20, 20]);
    assert.equal(b.effects.filter(e => e.shape === 'impact').length, 3);
    b.step(1, 0);
    assert.equal(sector.x, 55);
});

test('each pulse exposes its entire radius on the damage tick and retains its cast center', () => {
    const b = cast('induction', [[70.9, 0], [71, 0], [78.9, 0], [79, 0]], ['ring', 'coil']);
    assert.deepEqual(b.effects.filter(e => e.shape === 'circle').map(e => [e.kind, e.radius, e.life]),
        [['induction', TOOLS.induction.reach, 11], ['magnet', 79, 11]]);
    assert.equal(b.effects.find(e => e.kind === 'induction').sourceCast, b.weaponCasts[0]);
    assert.ok(b.effects.filter(e => e.kind === 'magnet').every(e => e.sourceCast === undefined));
    assert.deepEqual(b.enemies.map(e => e.hp), [13, 16, 16, 20]);
    b.step(1, 0);
    assert.ok(b.effects.filter(e => e.shape === 'circle').every(e => e.x === 55 && e.y === 300));
});

test('arc snapshots each actual hop and coincident directional attacks emit only a contact', () => {
    const b = cast('wrench', [[20, 0], [58, 0], [60, 0]]);
    assert.deepEqual(b.effects.map(e => [e.shape, e.from.x, e.x]), [['link', 55, 75], ['link', 75, 113]]);
    assert.deepEqual(b.effects.map(e => e.fromWeapon), [true, undefined]);
    assert.ok(b.effects.every(e => e.sourceCast === b.weaponCasts[0]));
    for (const id of ['riveter', 'torch']) {
        const close = cast(id, [[0, 0], [12, 0]]);
        assert.deepEqual(close.effects.map(e => e.shape), ['impact']);
        assert.equal(close.enemies[1].hp, 20);
    }
    const close = cast('riveter', [[0.5, 0], [20, 20]]);
    assert.equal(close.effects[0].halfWidth, 11);
    assert.equal(close.effects[0].length, TOOLS.riveter.reach);
    assert.equal(close.enemies[1].hp, 20);
});

test('cast snapshots retain both weapon slots, their origin and aim on the same simulation step', () => {
    const battle = new Battle(0, 105, [{ id: 'wrench', mods: [] }, { id: 'arc_gun', mods: [] }]);
    Object.assign(battle.player, { x: 55, y: 300 });
    battle.enemies.push({ x: 75, y: 300, id: 1, hp: 20, kind: 'turret', state: 'walk',
        next: 100, vx: 0, vy: 0, marked: false });
    battle.step(0, 0);
    assert.deepEqual(battle.weaponCasts, [
        { tool: 'wrench', slot: 0, x: 55, y: 300, ux: 1, uy: 0, targetRange: 20, tick: 1 },
        { tool: 'arc_gun', slot: 1, x: 55, y: 300, ux: 1, uy: 0, targetRange: 20, tick: 1 },
    ]);
    assert.deepEqual(battle.effects.map(e => [e.shape, e.melee]), [['link', true], ['link', undefined]]);
    assert.ok(battle.effects.every((e, slot) => e.fromWeapon && e.sourceCast === battle.weaponCasts[slot]));
    battle.enemies.length = 0;
    for (let step = 0; step < 15; step++) battle.step(0, 1);
    assert.equal(battle.weaponCasts[0].y, 300);
    battle.step(0, 1);
    assert.deepEqual(battle.weaponCasts, []);
});

test('scheduled melee windups use the next ready tick and the actual target gate', () => {
    const battle = cast('wrench', [[20, 0]]);
    assert.deepEqual(battle.meleeWindups(), []);
    for (let step = 0; step < 10; step++) battle.step(0, 0);
    assert.deepEqual(battle.meleeWindups(), [{ tool: 'wrench', slot: 0, ux: 1, uy: 0, ageTicks: 0 }]);
    assert.equal(battle.weaponAttackSerial, 1);
    battle.enemies[0].x = 300;
    battle.step(0, 0);
    assert.deepEqual(battle.meleeWindups(), []);
    battle.enemies[0].x = 75;
    battle.enemies[0].y = 320;
    battle.step(0, 0);
    const [windup] = battle.meleeWindups();
    assert.equal(windup.ageTicks, 2);
    assert.ok(Math.abs(windup.ux - Math.SQRT1_2) < 0.00001 && Math.abs(windup.uy - Math.SQRT1_2) < 0.00001);
    assert.equal(battle.weaponAttackSerial, 1);
});

test('all ten weapons keep their generated effects bound to the correct slot when fired together', () => {
    for (const tool of Object.keys(TOOLS)) {
        const partner = tool === 'wrench' ? 'arc_gun' : 'wrench';
        for (const loadout of [[tool, partner], [partner, tool]]) {
            const battle = new Battle(0, 105, loadout.map(id => ({ id, mods: [] })));
            Object.assign(battle.player, { x: 55, y: 300 });
            battle.enemies.push({ id: 1, x: 93, y: 300, hp: 80, kind: 'turret', state: 'walk',
                next: 100, vx: 0, vy: 0, marked: false });
            battle.step(0, 0);
            assert.deepEqual(battle.weaponCasts.map(c => [c.tool, c.slot]), loadout.map((id, slot) => [id, slot]));
            const casts = new Set(battle.effects.map(e => e.sourceCast));
            assert.deepEqual(casts, new Set(battle.weaponCasts));
        }
    }
});
