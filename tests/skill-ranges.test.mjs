import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { createEquipment } from '../.m0-build/m1/Equipment.js';
import { M1_RULES, TOOLS } from '../.m0-build/m1/content.js';
import { circleContact, createMeleeMotion, sampleMeleeHead, weaponDock } from '../.m0-build/m1/WeaponMotion.js';

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

test('every weapon reports the outcome of its actual damage at the contact point', () => {
    for (const id of Object.keys(TOOLS)) for (const lethal of [false, true]) {
        const battle = meleeBattle(id);
        const target = addTarget(battle, battle.player.x + 38, battle.player.y);
        target.hp = lethal ? 1 : 50;
        const { x, y } = target;
        for (let i = 0; i < 16 && !battle.weaponImpacts.length; i++) battle.step(0, 0);
        const hit = battle.weaponImpacts[0];
        assert.equal(hit?.cast.tool, id);
        assert.equal(hit.weight, lethal ? 'break' : 'strike', id);
        assert.deepEqual([hit.x, hit.y], [x, y], id);
        assert.equal(battle.enemies.includes(target), !lethal, id);
    }
});

test('a lethal boss hit gets its own break effect and does not count as a group kill', () => {
    for (const lethal of [false, true]) {
        const battle = new Battle(0, 42, [{ id: 'riveter', mods: [] }], { ...M1_RULES,
            waves: [{ seconds: 30, spawnEvery: 0, enemies: [], boss: true }] });
        Object.assign(battle.boss.unit, { x: battle.player.x + 40, y: battle.player.y, hp: lethal ? 1 : 50 });
        battle.step(0, 0);
        assert.equal(battle.weaponImpacts[0].weight, lethal ? 'boss-break' : 'armor');
        assert.equal(battle.bossDefeated, lethal);
        assert.equal(battle.groupBreak, undefined);
    }
});

test('two distinct hits arm one flywheel sweep, with damage only along its wider path', () => {
    const { tools, equipment } = createEquipment('wrench', {});
    tools[0].attachments[0] = 'wrench/flywheel';
    const battle = new Battle(0, 42, tools, { ...M1_RULES, sweptMelee: true,
        waves: [{ seconds: 30, spawnEvery: 0, enemies: [] }] }, { equipment });
    const { x, y } = battle.player;
    const aim = addTarget(battle, x + 44, y);
    const other = addTarget(battle, x + 44, y);
    function stepUntil(predicate) {
        for (let i = 0; i < 40 && !predicate(); i++) battle.step(0, 0);
        assert.ok(predicate());
    }
    stepUntil(() => other.hp < 20);
    assert.equal(aim.hp, 18);
    battle.enemies.splice(battle.enemies.indexOf(other), 1);
    stepUntil(() => battle.wideSweeps === 1);
    const swing = battle.weaponCasts.at(-1).melee;
    assert.equal(swing.action, '大回扫');
    const edge = swing.points[swing.first];
    assert.ok(edge.x < x, 'this sample is beyond the normal forward arc');
    const flank = addTarget(battle, edge.x, edge.y);
    stepUntil(() => flank.hp < 20);
    assert.equal(flank.hp, 16);
    battle.enemies.splice(battle.enemies.indexOf(aim), 1);
    stepUntil(() => battle.weaponAttackSerial >= 3);
    assert.equal(battle.wideSweeps, 1, 'one victim cannot renew the charge through repeated contact');
});

test('weapons keep even angular spacing and melee launches from its current ring slot', () => {
    for (const count of [2, 3, 4, 5, 6]) {
        const angles = Array.from({ length: count }, (_, slot) => {
            const { x, y } = weaponDock(slot, count);
            return Math.atan2(y - 20, x);
        }).sort((a, b) => a - b);
        angles.push(angles[0] + 2 * Math.PI);
        for (let i = 0; i < count; i++) {
            assert.ok(Math.abs(angles[i + 1] - angles[i] - 2 * Math.PI / count) < 0.035);
        }
    }
    for (const count of [1, 2, 3, 4, 5, 6]) for (const tick of [1, 98, 205, 390]) {
        const tools = Array.from({ length: count }, () => ({ id: 'wrench', mods: [] }));
        const battle = new Battle(0, 105, tools, { ...M1_RULES, sweptMelee: true,
            waves: [{ seconds: 30, spawnEvery: 0, enemies: [] }] });
        battle.tick = tick;
        battle.player.x += 10;
        addTarget(battle, battle.player.x - 36, battle.player.y);
        battle.step(0, 0);
        assert.equal(battle.weaponCasts.length, count);
        for (const cast of battle.weaponCasts) {
            const dock = weaponDock(cast.slot, count), start = cast.melee.points[0];
            assert.deepEqual([start.x - cast.x, start.y - cast.y], [dock.x, dock.y]);
        }
    }
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
    for (const [tool, names] of [['wrench', ['横扫', '反手扫']], ['bypass_wrench', ['反手钩扫', '压击']]]) {
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
        const impacts = new Set();
        for (let age = 0; age < cast.melee.last; age++) {
            battle.step(0, 0);
            for (const fx of battle.effects) if (fx.sourceCast === cast) impacts.add(fx);
        }
        assert.deepEqual([aim.hp, first.hp, second.hp, miss.hp, outside.hp], [18, 18, 18, 20, 20]);
        assert.equal(impacts.size, 3);
        while (battle.weaponAttackSerial < 2) battle.step(0, 0);
        const next = battle.weaponCasts.at(-1);
        assert.equal(next.melee.action, names[1]);
        assert.notDeepEqual(next.melee.points, cast.melee.points);
    }
});

test('the arc wrench swings in opposite directions and can hit at point-blank range', () => {
    const battle = meleeBattle();
    const dock = weaponDock(0, 1);
    for (const [sequence, sign] of [[0, 1], [1, -1]]) {
        const motion = createMeleeMotion('wrench', sequence, dock, battle.player, 1, 0, 57, battle.field, 42);
        const angles = motion.offsets.slice(motion.first).map(({ x, y }) => Math.atan2(y, x));
        assert.ok(angles.every((angle, index) => !index || (angle - angles[index - 1]) * sign > 0));
        assert.ok((angles.at(-1) - angles[0]) * sign > Math.PI / 2);
    }
    const close = addTarget(battle, battle.player.x, battle.player.y);
    for (let step = 0; step < 9; step++) battle.step(0, 0);
    assert.equal(close.hp, 18);
});

test('each weapon cast records the installed attachment count when it fires', () => {
    const tool = { id: 'wrench', mods: [], attachments: ['wrench/handling', null, 'wrench/alternate'] };
    const battle = new Battle(0, 105, [tool], { ...M1_RULES, sweptMelee: true,
        waves: [{ seconds: 20, spawnEvery: 0, enemies: [] }] });
    addTarget(battle, battle.player.x + 30, battle.player.y);
    battle.step(0, 0);
    assert.equal(battle.weaponCasts[0].effectBoost, 2);
    tool.attachments[0] = null;
    assert.equal(battle.weaponCasts[0].effectBoost, 2);
});

test('signature attacks snapshot the actual installed item and penetrating weapons acquire a populated lane', () => {
    for (const id of ['hydraulic_nailer', 'riveter']) {
        for (const part of ['handling', 'signature']) {
            const { tools, equipment } = createEquipment(id, {});
            tools[0].attachments[0] = id + '/' + part;
            const battle = new Battle(0, 23, tools, { ...M1_RULES, sweptMelee: true,
                waves: [{ seconds: 15, spawnEvery: 0, enemies: [] }] }, { equipment });
            const { x, y } = battle.player;
            addTarget(battle, x + 34, y + 25);
            const front = addTarget(battle, x + 49, y);
            const back = addTarget(battle, x + 75, y);
            battle.step(0, 0);
            const shot = battle.weaponCasts[0];
            assert.ok(front.hp < 20 && back.hp < 20);
            assert.equal(shot.uy, 0);
            assert.equal(Boolean(shot.modified), part === 'signature');
            tools[0].attachments[0] = null;
            assert.equal(Boolean(shot.modified), part === 'signature');
        }
    }
});

test('the arc wrench reports a mark when it lands and a different effect when the mark adds damage', () => {
    const { tools, equipment } = createEquipment('wrench', {});
    tools[0].attachments[0] = 'wrench/link';
    const battle = new Battle(0, 105, tools, { ...M1_RULES, sweptMelee: true,
        waves: [{ seconds: 30, spawnEvery: 0, enemies: [] }] }, { route: 'arc', equipment });
    const target = addTarget(battle, battle.player.x + 30, battle.player.y);
    while (target.hp === 20 && battle.tick < 12) battle.step(0, 0);
    assert.equal(target.hp, 18);
    assert.equal(target.marked, true);
    assert.equal(battle.effects.at(-1).mark, 'applied');
    assert.equal(battle.triggers.arc, 0);
    while (target.hp === 18 && battle.tick < 25) battle.step(0, 0);
    assert.equal(target.hp, 15);
    assert.equal(battle.effects.at(-1).mark, 'boosted');
    assert.equal(battle.triggers.arc, 1);
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
function cast(id, offsets, mods = [], hp = 20) {
    const battle = new Battle(0, 105, [{ id, mods }]);
    Object.assign(battle.player, { x: 55, y: 300 });
    offsets.forEach(([dx, dy], index) => battle.enemies.push({
        x: 55 + dx, y: 300 + dy, id: index, hp, kind: 'turret',
        state: 'walk', next: 100, vx: 0, vy: 0, marked: false,
    }));
    if (mods.includes('coil')) battle.parts.push(...Array.from({ length: 5 }, () => ({ ...battle.player })));
    battle.step(0, 0);
    return battle;
}

test('one flame can dismantle six machines while limiting the large impact drawings to four', () => {
    const targets = Array.from({ length: 6 }, (_, i) => [20 + i * 5, 0]);
    assert.equal(cast('torch', targets).groupBreak, undefined);
    const battle = cast('torch', targets, [], 1);
    assert.equal(battle.kills, 6);
    assert.deepEqual(battle.groupBreak, { count: 6, tick: battle.tick });
    assert.equal(battle.weaponImpacts.length, 4);
    assert.ok(battle.weaponImpacts.every(hit => hit.weight === 'break' && hit.cast === battle.weaponCasts[0]));
    for (let i = 0; i < 18; i++) battle.step(0, 0);
    assert.equal(battle.weaponImpacts.length, 0);
});

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
