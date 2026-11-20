import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_NAMESPACE, CAMPAIGN_STAGES, Campaign } from '../.m0-build/campaign/Campaign.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

function fixture() {
    const map = new Map();
    let rejectWrites = false;
    const host = { localStorage: {
        getItem(key) { return map.get(key) ?? null; },
        setItem(key, value) {
            if (rejectWrites) throw new Error('injected write interruption');
            map.set(key, value);
        },
    } };
    const campaign = (stages) => new Campaign(makePlatform(host, CAMPAIGN_NAMESPACE), stages);
    const run = (name) => makePlatform(host, name);
    return { campaign, run, map, reject(on) { rejectWrites = on; } };
}
function won(stage, runId = 'run-1') {
    return { contentVersion: stage.contentVersion, phase: 'won', finishReason: 'cleared',
        wave: stage.finalWave, runId };
}

test('stable opening contract, locked stage 02, and old M2 data has no campaign credit', () => {
    const f = fixture();
    const [first, second] = CAMPAIGN_STAGES;
    assert.equal(first.id, '01');
    assert.equal(second.id, '02');
    assert.equal(second.prerequisite, first.id);
    f.run('night-shift.m2').writeCheckpoint(1, { ...won(first), contentVersion: 2 });
    const campaign = f.campaign();
    assert.equal(campaign.isUnlocked('01'), true);
    assert.equal(campaign.isUnlocked('02'), false);
    assert.equal(campaign.profileState, 'new');
    assert.equal(campaign.canUseStarter('01', 'wrench'), true);
    assert.equal(campaign.canUseStarter('01', 'arc_gun'), false);
    assert.equal(campaign.isUnlocked('03'), false);
    assert.equal(campaign.beginAttempt('02', 'run-2'), false);
    assert.equal(campaign.replayWon('01', won(first)), 'not-eligible');
    assert.deepEqual(campaign.profile.clearedStages, []);
    assert.throws(() => f.campaign([second, first]), /Invalid campaign stage/);
});

test('only a matched, cleared terminal checkpoint triggers atomic first-clear unlock and weapon grant', () => {
    const { campaign: open } = fixture();
    const [first] = CAMPAIGN_STAGES;
    const c = open();
    assert.equal(c.beginAttempt('01', 'run-1'), true);
    const rev = c.profile.revision;
    assert.equal(c.beginAttempt('01', 'run-1'), true);
    assert.equal(c.profile.revision, rev);
    const receipt = won(first);
    for (const bad of [
        { ...receipt, runId: 'stale' }, { ...receipt, wave: -1 }, { ...receipt, contentVersion: 2 },
        { ...receipt, phase: 'lost', finishReason: 'defeated' }, { ...receipt, finishReason: undefined },
    ]) assert.equal(c.replayWon('01', bad), 'not-eligible');
    assert.equal(c.replayWon('01', receipt), 'committed');
    assert.deepEqual(c.profile.clearedStages, ['01']);
    assert.deepEqual(c.profile.unlockedWeapons, [first.firstClearWeapon]);
    assert.equal(c.isUnlocked('02'), true);
    assert.equal(c.canUseStarter('02', 'arc_gun'), true);
    assert.equal(c.profile.activeAttempt?.runId, receipt.runId);
    assert.equal(open().profileState, 'loaded');
    assert.equal(c.replayWon('01', receipt), 'already-cleared');
    assert.equal(c.profile.revision, rev + 1);
    assert.equal(open().isUnlocked('02'), true);
});

test('boot replay after failed campaign write, after commit, and on corrupt latest A/B slot', () => {
    const f = fixture();
    const [first] = CAMPAIGN_STAGES;
    const run = f.run('night-shift.campaign.run.01');
    const c = f.campaign();
    assert.equal(c.beginAttempt('01', 'run-1'), true);
    assert.equal(c.replayWon('01', run.readCheckpoint(1)), 'not-eligible');
    const receipt = won(first);
    assert.equal(run.writeCheckpoint(1, receipt), true);
    f.reject(true);
    assert.equal(c.replayWon('01', run.readCheckpoint(1)), 'storage-failed');
    assert.equal(c.isUnlocked('02'), false);
    f.reject(false);
    const cold = f.campaign();
    assert.equal(cold.replayWon('01', run.readCheckpoint(1)), 'committed');
    assert.equal(f.campaign().replayWon('01', run.readCheckpoint(1)), 'already-cleared');
    const newestSlot = [...f.map].find(([key, val]) =>
        key.startsWith(CAMPAIGN_NAMESPACE + '.') && !key.includes('.run.') && JSON.parse(val).sequence === 2)?.[0];
    assert.ok(newestSlot);
    f.map.set(newestSlot, '{oops');
    const recovered = f.campaign();
    assert.equal(recovered.isUnlocked('02'), false);
    assert.equal(recovered.replayWon('01', run.readCheckpoint(1)), 'committed');
    assert.deepEqual(recovered.profile.unlockedWeapons, [first.firstClearWeapon]);
});

test('older campaign save can unlock appended stable prerequisite without replay', () => {
    const { campaign: open } = fixture();
    const [first, second] = CAMPAIGN_STAGES;
    const c = open();
    assert.equal(c.beginAttempt(first.id, 'run-1'), true);
    assert.equal(c.replayWon(first.id, won(first)), 'committed');
    assert.equal(c.beginAttempt(second.id, 'run-2'), true);
    assert.equal(c.replayWon(second.id, won(second, 'run-2')), 'committed');
    const extended = open([...CAMPAIGN_STAGES, { id: '03', chapter: '01', title: 'later',
        prerequisite: '02', contentVersion: 23, finalWave: 5, firstClearWeapon: null, plannedMinutes: 6 }]);
    assert.deepEqual(extended.profile, c.profile);
    assert.equal(extended.isUnlocked('03'), true);
});

test('unreadable campaign is not treated as fresh and cannot replace corrupt slots', () => {
    const f = fixture();
    const c = f.campaign();
    assert.equal(c.beginAttempt('01', 'run-1'), true);
    for (const slot of f.map.keys()) f.map.set(slot, '{broken');
    const before = [...f.map];
    const corrupt = f.campaign();
    assert.equal(corrupt.profileState, 'unreadable');
    assert.equal(corrupt.storageFailed, true);
    assert.equal(corrupt.isUnlocked('01'), false);
    assert.equal(corrupt.beginAttempt('01', 'run-2'), false);
    assert.equal(corrupt.replayWon('01', won(CAMPAIGN_STAGES[0])), 'storage-failed');
    assert.deepEqual([...f.map], before);
});
