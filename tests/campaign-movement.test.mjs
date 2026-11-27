import assert from 'node:assert/strict';
import test from 'node:test';
import { TiltMovement } from '../.m0-build/platform/tiltMovement.js';
import { PatrolSession } from '../.m0-build/roguelite/session.js';

test('portrait gravity input rejects jitter, clamps diagonals and ignores a stopped listener', () => {
    let handler, failure;
    const sdk = {
        onAccelerometerChange(fn) { handler = fn; }, offAccelerometerChange() {},
        startAccelerometer({ fail }) { failure = fail; }, stopAccelerometer() {},
    };
    const tilt = new TiltMovement(sdk);
    tilt.start(() => assert.fail('unexpected failure'));
    const old = handler, oldFail = failure;
    handler({ x: 0.1, y: -0.3 });
    handler({ x: 0.11, y: -0.31 });
    assert.deepEqual(tilt.axis, { x: 0, y: -0 });
    for (let i = 0; i < 15; i++) handler({ x: -0.6, y: 0.5 });
    assert.ok(tilt.axis.x < -0.4 && tilt.axis.y > 0.4);
    assert.ok(Math.hypot(tilt.axis.x, tilt.axis.y) <= 1.000001);
    tilt.stop();
    tilt.start(() => assert.fail('stale failure reached new session'));
    old({ x: 1, y: 1 });
    oldFail();
    handler({ x: -0.6, y: 0.5 });
    assert.equal(Math.hypot(tilt.axis.x, tilt.axis.y), 0);
    tilt.stop();
});

test('real electric shot records two sequential splash segments at actual hit locations', () => {
    const s = new PatrolSession({ chapterId: '01', rigId: 'high_voltage', seed: 13 });
    for (let i = 0; i < 707; i++) s.stepBattle(0, 0);
    const b = s.battle;
    const arcs = b.effects.filter(e => e.shape === 'link').sort((a, b) => a.hop - b.hop);
    assert.deepEqual(arcs.map(e => e.hop), [0, 1, 2]);
    assert.equal(arcs[0].fromWeapon, true);
    for (let i = 1; i < arcs.length; i++) {
        const e = arcs[i];
        assert.deepEqual(e.from, { x: arcs[i-1].x, y: arcs[i-1].y });
        assert.ok(!e.fromWeapon && !e.melee);
        assert.equal(e.life, arcs[i-1].life + 1);
        assert.ok(b.weaponImpacts.some(hit => hit.tick === b.tick && hit.x === e.x && hit.y === e.y));
    }
});

test('melee splash and a marked kill both produce enemy-to-enemy links', () => {
    for (const [seed, tier, modules, tick] of [[13, 4, [], 445], [4, 3, ['tesla_manifold'], 324]]) {
        const base = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', seed });
        const session = PatrolSession.fromSnapshot({
            ...base.snapshot(), modules, nextWeaponUid: 3,
            weapons: [{ uid: 1, id: 'wrench', tier }, { uid: 2, id: 'arc_gun', tier: 1 }],
        }, base.profile);
        for (let i = 0; i < tick; i++) session.stepBattle(0, 0);
        const b = session.battle;
        const link = b.effects.find(e => e.shape === 'link' &&
            (modules.length ? !e.sourceCast : e.sourceCast?.tool === 'wrench' && e.hop === 1));
        assert.ok(link);
        assert.ok(!link.fromWeapon && !link.melee);
        assert.ok(Math.hypot(link.from.x - link.x, link.from.y - link.y) > 1);
        if (modules.length) {
            assert.ok(b.defeatedEnemies.some(e => e.hitAt === tick && e.x === link.from.x && e.y === link.from.y));
            assert.ok([...b.enemies, ...b.defeatedEnemies].some(e => e.hitAt === tick && e.x === link.x && e.y === link.y));
        }
    }
});

test('all four portrait tilt directions steer away from neutral and settle back to rest', () => {
    let emit;
    const tilt = new TiltMovement({
        onAccelerometerChange(fn) { emit = fn; }, offAccelerometerChange() {},
        startAccelerometer() {}, stopAccelerometer() {},
    });
    try {
        tilt.start(() => assert.fail('unexpected failure'));
        emit({ x: 0.1, y: -0.2 });
        for (const [x, y] of [[1,0], [-1,0], [0,1], [0,-1]]) {
            for (let i = 0; i < 10; i++) emit({ x: 0.1 + 0.4*x, y: -0.2 + 0.4*y });
            assert.ok(x * tilt.axis.x + y * tilt.axis.y > 0.9);
            for (let i = 0; i < 10; i++) emit({ x: 0.1, y: -0.2 });
            assert.equal(Math.hypot(tilt.axis.x, tilt.axis.y), 0);
        }
    } finally { tilt.stop(); }
});
