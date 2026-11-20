import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createBlankRecord, evaluateRecord, stageRowFromMarkers } from '../scripts/campaign-human-acceptance.mjs';

// Synthetic inputs exercise gate math only. No human observations are inferred.
function syntheticRecord() {
    const record = createBlankRecord();
    record.build = 'synthetic-0';
    for (const [index, route] of record.timing.entries()) {
        Object.assign(route, {
            testerAlias: 'T' + index, device: 'test device', freshSave: true, standardRules: true,
            noAds: true, skippedOptionalDialogue: true, noReplays: true,
        });
        for (const stage of route.stages) {
            Object.assign(stage, {
                cleared: true, elapsed: 395, battle: 300, objectiveOnly: 40, activeShop: 20,
                failedAttempts: 15, loading: 5, pausedOrBackground: 5, idleWaiting: 8, otherNonGameplay: 2,
            });
        }
    }
    record.cohort.noAds = true;
    for (const [index, person] of record.cohort.volunteers.entries()) {
        Object.assign(person, {
            newToRoguelikes: index < 4, wave1Unprompted: index < 6, sawFirstShop: index < 6,
            explainedFirstShop: index < 4, cleared01: index < 4, started02: index < 3,
            started02Voluntarily: index < 2, triedArcGunIn02: index < 1,
        });
    }
    return record;
}

test('timing gate uses the shorter full route and excludes all non-gameplay categories', () => {
    const record = syntheticRecord();
    record.timing[0].stages[0].note = 'synthetic stall';
    const report = evaluateRecord(record, 'timing');
    assert.equal(report.passed, true);
    assert.equal(report.timing.shorterSeconds, 7200);
    const baseline = report.timing.routes[0];
    assert.equal(baseline.excludedSeconds, 700);
    assert.deepEqual(baseline.excluded, {
        failedAttempts: 300, loading: 100, pausedOrBackground: 100, idleWaiting: 160, otherNonGameplay: 40,
    });
    assert.deepEqual(baseline.byChapter.map(chapter => chapter.activeSeconds), [1800, 1800, 1800, 1800]);
    assert.deepEqual(baseline.notes, [{ stage: '01', note: 'synthetic stall' }]);

    const stage = record.timing[1].stages[19];
    stage.battle--;
    stage.idleWaiting++;
    assert.equal(evaluateRecord(record, 'timing').timing.shorterSeconds, 7199);
    assert.equal(evaluateRecord(record, 'timing').passed, false);
});

test('all 20 stage measurements contribute their exact milliseconds to the route threshold', () => {
    const record = syntheticRecord();
    const row = (stage, activeMs) => stageRowFromMarkers({
        stage, cleared: true,
        markers: [{ atMs: 0, bucket: 'loading' }, { atMs: 37, bucket: 'battle' }, { atMs: 37 + activeMs, end: true }],
    });
    for (const route of record.timing) {
        route.stages = route.stages.map((stage, index) => row(stage.stage, index % 2 ? 360600 : 359400));
    }
    const exact = evaluateRecord(record, 'timing');
    assert.equal(exact.timing.shorterSeconds, 7200);
    assert.equal(exact.timing.routes[0].excludedSeconds, 0.74);
    assert.equal(exact.passed, true);

    record.timing[1].stages[19] = row('20', 360599);
    const shorter = evaluateRecord(record, 'timing');
    assert.equal(shorter.timing.shorterSeconds, 7199.999);
    assert.equal(shorter.passed, false);
});

test('incomplete, misordered or unbalanced timing records cannot produce duration evidence', () => {
    const incomplete = syntheticRecord();
    incomplete.timing[0].stages.pop();
    assert.throws(() => evaluateRecord(incomplete, 'timing'), /01–20/);

    const duplicate = syntheticRecord();
    duplicate.timing[0].stages[4].stage = '04';
    assert.throws(() => evaluateRecord(duplicate, 'timing'), /顺序/);

    const unbalanced = syntheticRecord();
    unbalanced.timing[0].stages[0].activeShop += 5;
    assert.throws(() => evaluateRecord(unbalanced, 'timing'), /总和/);

    const overprecise = syntheticRecord();
    overprecise.timing[0].stages[0].activeShop = 20.0001;
    assert.throws(() => evaluateRecord(overprecise, 'timing'), /三位小数/);

    const unverified = syntheticRecord();
    unverified.timing[1].noReplays = null;
    assert.throws(() => evaluateRecord(unverified, 'timing'), /noReplays/);
    unverified.timing[1].noReplays = true;
    unverified.timing[1].testerAlias = '  t0 ';
    assert.throws(() => evaluateRecord(unverified, 'timing'), /不同测试者/);
});

test('cohort gates use their eligible denominators and do not turn missing exposure into a pass', () => {
    const record = syntheticRecord();
    const { cohort } = evaluateRecord(record, 'cohort');
    assert.equal(cohort.passed, true);
    assert.deepEqual([cohort.noviceMix.successes, cohort.noviceMix.eligible], [4, 8]);
    assert.deepEqual([cohort.unpromptedWave.successes, cohort.unpromptedWave.eligible], [6, 8]);
    assert.deepEqual([cohort.firstShop.successes, cohort.firstShop.eligible], [4, 6]);
    assert.deepEqual([cohort.voluntary02.successes, cohort.voluntary02.eligible], [2, 4]);
    assert.deepEqual([cohort.arcGunTrial.successes, cohort.arcGunTrial.eligible], [1, 3]);

    for (const person of record.cohort.volunteers) {
        Object.assign(person, { cleared01: false, started02: false, started02Voluntarily: false, triedArcGunIn02: false });
    }
    const noExposure = evaluateRecord(record, 'cohort').cohort;
    assert.equal(noExposure.voluntary02.eligible, 0);
    assert.equal(noExposure.voluntary02.rate, null);
    assert.equal(noExposure.passed, false);
    record.cohort.volunteers[0].started02Voluntarily = true;
    assert.throws(() => evaluateRecord(record, 'cohort'), /主动开 02/);
});

function syntheticMarkers() {
    return {
        stage: '03', cleared: true, note: 'synthetic only',
        markers: [
            { atMs: 100, bucket: 'failedAttempts' },
            { atMs: 1800, bucket: 'loading' },
            { atMs: 3200, bucket: 'battle' },
            { atMs: 5900, bucket: 'objectiveOnly' },
            { atMs: 7400, bucket: 'activeShop' },
            { atMs: 8800, bucket: 'idleWaiting' },
            { atMs: 9600, end: true },
        ],
    };
}

test('stage marker preview preserves fractional intervals in their original buckets', () => {
    const row = stageRowFromMarkers(syntheticMarkers());
    assert.deepEqual(row, {
        stage: '03', cleared: true, elapsed: 9.5, battle: 2.7, objectiveOnly: 1.5, activeShop: 1.4, failedAttempts: 1.7,
        loading: 1.4, pausedOrBackground: 0, idleWaiting: 0.8, otherNonGameplay: 0, note: 'synthetic only',
    });
    const record = syntheticRecord();
    record.timing[0].stages[2] = row;
    assert.equal(evaluateRecord(record, 'timing').timing.shorterSeconds, 7200 - 360 + 5.6);
});

test('markers require a separate confirmed clear, strict time order and one category per closed span', () => {
    const check = (alter, message) => {
        const record = syntheticMarkers();
        alter(record);
        assert.throws(() => stageRowFromMarkers(record), message);
    };
    check(record => { record.cleared = false; }, /单独确认/);
    check(record => { record.markers[2].atMs = 1800; }, /严格递增/);
    check(record => { record.markers[2].atMs = 1799; }, /严格递增/);
    check(record => { record.markers[2].atMs = 3.2; }, /整数毫秒/);
    check(record => { record.markers.pop(); }, /end:true/);
    check(record => { record.markers[0].end = true; }, /一个有效的 bucket/);
    check(record => { record.markers.at(-1).bucket = 'battle'; }, /end:true/);
    check(record => { record.markers[3].bucket = 'battle+objectiveOnly'; }, /一个有效的 bucket/);
    check(record => { record.markers[3].bucket = 'failedAttempts'; }, /失败尝试/);
});

test('CLI keeps blank, invalid and measured results distinct and preserves an existing record', () => {
    const path = fileURLToPath(new URL('../scripts/campaign-human-acceptance.mjs', import.meta.url));
    const folder = mkdtempSync(join(tmpdir(), 'campaign-human-test-'));
    const recordPath = join(folder, 'record.json');
    const run = (mode, ...extra) => spawnSync(process.execPath, [path, mode, recordPath, ...extra], { encoding: 'utf8' });
    try {
        assert.equal(run('init', '10').status, 0);
        const before = readFileSync(recordPath, 'utf8');
        const blank = JSON.parse(before);
        assert.equal(blank.timing[0].stages[0].elapsed, null);
        assert.equal(blank.cohort.volunteers.length, 10);
        assert.equal(run('check').status, 2);
        assert.equal(run('init').status, 2);
        assert.equal(readFileSync(recordPath, 'utf8'), before);

        const valid = syntheticRecord();
        writeFileSync(recordPath, JSON.stringify(valid));
        assert.equal(run('check').status, 0);
        valid.cohort.volunteers[0].wave1Unprompted = false;
        writeFileSync(recordPath, JSON.stringify(valid));
        const brief = run('check');
        assert.equal(brief.status, 1);
        assert.equal(JSON.parse(brief.stdout).cohort.unpromptedWave.successes, 5);

        const markers = JSON.stringify(syntheticMarkers());
        writeFileSync(recordPath, markers);
        const preview = run('stage-row');
        assert.equal(preview.status, 0);
        assert.deepEqual(JSON.parse(preview.stdout), stageRowFromMarkers(syntheticMarkers()));
        assert.equal(readFileSync(recordPath, 'utf8'), markers);
    } finally {
        unlinkSync(recordPath);
        rmdirSync(folder);
    }
});
