import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_NAMESPACE, CAMPAIGN_STAGES, Campaign } from '../.m0-build/campaign/Campaign.js';
import { WORKSHOP_TIERS } from '../.m0-build/campaign/CampaignLedger.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

function fixture() {
    const map = new Map();
    let rejectWrites = false;
    let interruptedWrite = false;
    let failReadback = false;
    let unreadableKey;
    const host = { localStorage: {
        getItem(key) {
            if (key === unreadableKey) {
                unreadableKey = undefined;
                throw new Error('injected readback failure');
            }
            return map.get(key) ?? null;
        },
        setItem(key, value) {
            if (interruptedWrite) {
                map.set(key, '{interrupted');
                throw new Error('injected partial write');
            }
            if (rejectWrites) throw new Error('injected write interruption');
            map.set(key, value);
            if (failReadback) {
                failReadback = false;
                unreadableKey = key;
            }
        },
    } };
    const campaign = (stages) => new Campaign(makePlatform(host, CAMPAIGN_NAMESPACE), stages);
    const run = (name) => makePlatform(host, name);
    return { campaign, run, map, reject(on) { rejectWrites = on; }, interrupt(on) { interruptedWrite = on; },
        failNextReadback() { failReadback = true; } };
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

test('each cleared station permits a new attempt and preserves later unlocks on repeat wins', () => {
    const f = fixture();
    const campaign = f.campaign();
    const clearedStages = CAMPAIGN_STAGES.map(stage => stage.id);
    const unlockedWeapons = CAMPAIGN_STAGES.map(stage => stage.firstClearWeapon).filter(Boolean);
    for (const stage of CAMPAIGN_STAGES) {
        const id = 'first-' + stage.id;
        assert.ok(campaign.beginAttempt(stage.id, id));
        assert.equal(campaign.replayWon(stage.id, won(stage, id)), 'committed');
    }
    for (const stage of CAMPAIGN_STAGES) {
        const id = 'repeat-' + stage.id;
        assert.ok(campaign.beginAttempt(stage.id, id));
        const profile = campaign.profile;
        assert.equal(campaign.replayWon(stage.id, won(stage, id)), 'already-cleared');
        assert.deepEqual(f.campaign().profile, profile);
        assert.deepEqual(profile.clearedStages, clearedStages);
        assert.deepEqual(profile.unlockedWeapons, unlockedWeapons);
    }
});

test('workshop supplies follow committed milestones through reload and backup restore', () => {
    const original = fixture();
    const campaign = original.campaign();
    const supplies = current => WORKSHOP_TIERS[current.workshopTier].supplies;
    assert.equal(supplies(campaign), 0);
    const milestones = new Map([['02', 3], ['05', 5], ['10', 7], ['15', 9], ['20', 11]]);
    let expected = 0;
    for (const stage of CAMPAIGN_STAGES) {
        const attempt = 'workshop-' + stage.id;
        assert.ok(campaign.beginAttempt(stage.id, attempt));
        assert.equal(supplies(original.campaign()), expected);
        assert.equal(campaign.replayWon(stage.id, won(stage, attempt)), 'committed');
        expected = milestones.get(stage.id) ?? expected;
        assert.equal(supplies(original.campaign()), expected);
    }
    assert.ok(campaign.beginAttempt('01', 'workshop-replay'));
    assert.equal(campaign.replayWon('01', won(CAMPAIGN_STAGES[0], 'workshop-replay')), 'already-cleared');
    const restored = fixture().campaign();
    assert.ok(restored.restoreBackup(campaign.backup()));
    assert.equal(supplies(restored), 11);
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

test('cold load falls back from a checksum-valid slot with an impossible campaign path', () => {
    const f = fixture();
    const [first, second] = CAMPAIGN_STAGES;
    const campaign = f.campaign();
    assert.ok(campaign.beginAttempt(first.id, 'earned-first'));
    assert.equal(campaign.replayResult(first.id, won(first, 'earned-first')), 'committed');
    const good = campaign.profile;
    assert.ok(f.run(CAMPAIGN_NAMESPACE).writeCheckpoint(1, {
        ...good, revision: good.revision + 1, clearedStages: ['01', '19'],
    }));

    const recovered = f.campaign();
    assert.equal(recovered.profileState, 'loaded');
    assert.deepEqual(recovered.profile, good);
    assert.equal(recovered.isUnlocked('20'), false);
    assert.ok(recovered.beginAttempt(second.id, 'recovered-second'));
    assert.equal(recovered.replayResult(second.id, won(second, 'recovered-second')), 'committed');
    assert.deepEqual(f.campaign().profile.clearedStages, ['01', '02']);
});

test('an interrupted recovery write preserves the valid late-game profile and its purchased blueprint', () => {
    const f = fixture();
    const campaign = f.campaign();
    const [penultimate, finale] = CAMPAIGN_STAGES.slice(-2);
    const clearedStages = CAMPAIGN_STAGES.slice(0, -1).map(stage => stage.id);
    assert.ok(campaign.restoreBackup({ schemaVersion: 1, clearedStages, unlockedWeapons: [], blueprints: [] }));
    assert.ok(campaign.beginAttempt(penultimate.id, 'earn-blueprint'));
    assert.equal(campaign.replayResult(penultimate.id, won(penultimate, 'earn-blueprint')), 'committed');
    assert.ok(campaign.buyBlueprint('magnetic_pickup_arm'));
    const good = campaign.profile;
    assert.ok(f.run(CAMPAIGN_NAMESPACE).writeCheckpoint(1, {
        ...good, revision: good.revision + 1, clearedStages: ['01', finale.id],
    }));
    const recovered = f.campaign();
    assert.deepEqual(recovered.profile, good);

    f.interrupt(true);
    assert.equal(recovered.beginAttempt(finale.id, 'late-final'), false);
    f.interrupt(false);
    const restarted = f.campaign();
    assert.equal(restarted.profileState, 'loaded');
    assert.deepEqual(restarted.profile, good);
    assert.ok(restarted.beginAttempt(finale.id, 'late-final'));
    assert.equal(restarted.replayResult(finale.id, won(finale, 'late-final')), 'committed');
    assert.equal(restarted.replayResult(finale.id, won(finale, 'late-final')), 'already-cleared');
    assert.deepEqual(f.campaign().profile.blueprints, ['magnetic_pickup_arm']);
});

test('retrying the same chapter receipt confirms an unacknowledged durable write without rewriting it', () => {
    const f = fixture();
    const campaign = f.campaign();
    const [, , , , chapterEnd, next] = CAMPAIGN_STAGES;
    const clearedStages = CAMPAIGN_STAGES.slice(0, 4).map(stage => stage.id);
    assert.ok(campaign.restoreBackup({ schemaVersion: 1, clearedStages, unlockedWeapons: [], blueprints: [] }));
    assert.ok(campaign.beginAttempt(chapterEnd.id, 'chapter-end-readback'));
    const checkpoint = won(chapterEnd, 'chapter-end-readback');
    f.failNextReadback();
    assert.equal(campaign.replayResult(chapterEnd.id, checkpoint), 'storage-failed');
    assert.equal(campaign.isUnlocked(next.id), false);
    assert.equal(f.campaign().isUnlocked(next.id), true);
    const durableSlots = new Map(f.map);

    assert.equal(campaign.markStorySeen('different-transaction'), false);
    assert.equal(campaign.replayResult(chapterEnd.id, checkpoint), 'committed');
    assert.equal(campaign.replayResult(chapterEnd.id, checkpoint), 'already-cleared');
    assert.deepEqual(f.map, durableSlots);
    assert.equal(campaign.profile.credits, 12);
    assert.equal(campaign.canUseStarter(next.id, chapterEnd.firstClearWeapon), true);
    assert.equal(campaign.storageFailed, false);
});

test('an unearned finale record cannot be read or be marked seen', () => {
    const f = fixture();
    const persistence = f.run(CAMPAIGN_NAMESPACE);
    const campaign = f.campaign();
    assert.equal(campaign.markStorySeen('clear-20'), false);
    assert.equal(campaign.storageFailed, false);
    assert.ok(campaign.markStorySeen('radio-dispatch'));
    assert.ok(persistence.writeCheckpoint(1, {
        ...campaign.profile, revision: campaign.profile.revision + 1,
        storySeen: ['radio-dispatch', 'clear-20'],
    }));
    assert.deepEqual(f.campaign().profile.storySeen, ['radio-dispatch']);

    const noFallback = fixture();
    assert.ok(noFallback.run(CAMPAIGN_NAMESPACE).writeCheckpoint(1, {
        schemaVersion: 1, revision: 1, clearedStages: ['20'], unlockedWeapons: ['bypass_wrench'],
        activeAttempt: null,
    }));
    const held = noFallback.campaign();
    assert.equal(held.profileState, 'unreadable');
    assert.equal(held.beginAttempt('01', 'would-overwrite'), false);
    assert.deepEqual(noFallback.run(CAMPAIGN_NAMESPACE).readCheckpoint(1).clearedStages, ['20']);
});

test('older campaign save can unlock appended stable prerequisite without replay', () => {
    const { campaign: open } = fixture();
    const [first, second] = CAMPAIGN_STAGES;
    const c = open([first, second]);
    assert.equal(c.beginAttempt(first.id, 'run-1'), true);
    assert.equal(c.replayWon(first.id, won(first)), 'committed');
    assert.equal(c.beginAttempt(second.id, 'run-2'), true);
    assert.equal(c.replayWon(second.id, won(second, 'run-2')), 'committed');
    const extended = open();
    assert.deepEqual(extended.profile, c.profile);
    assert.equal(extended.isUnlocked('03'), true);
});

test('a v1 two-clear profile recovers the nailer for 03 and migrates on the first new receipt', () => {
    const f = fixture();
    const persistence = f.run(CAMPAIGN_NAMESPACE);
    assert.ok(persistence.writeCheckpoint(1, { schemaVersion: 1, revision: 4, clearedStages: ['01', '02'],
        unlockedWeapons: ['arc_gun'], activeAttempt: { stageId: '02', runId: 'legacy-pump' } }));
    const c = f.campaign();
    const [, second, third] = CAMPAIGN_STAGES;
    assert.equal(c.profileState, 'loaded');
    assert.equal(c.profile.schemaVersion, 2);
    assert.deepEqual(c.profile.storySeen, ['clear-01', 'clear-02']);
    assert.ok(c.isUnlocked(third.id));
    assert.ok(c.canUseStarter(third.id, 'hydraulic_nailer'));
    assert.equal(c.replayResult(second.id, won(second, 'legacy-pump')), 'already-cleared');
    assert.equal(c.profile.credits, 0);
    const id = c.newAttemptId(third.id, 1234);
    assert.ok(c.beginAttempt(third.id, id));
    assert.equal(c.replayResult(third.id, won(third, id)), 'committed');
    const loaded = f.campaign().profile;
    assert.equal(loaded.credits, 12);
    assert.ok(loaded.clearedStages.includes(third.id));
    assert.equal(persistence.readCheckpoint(1).schemaVersion, 2);
});

test('an unfinished legacy run earns credits after the workshop is turned on', () => {
    const f = fixture();
    const [stage] = CAMPAIGN_STAGES;
    const id = 'legacy-running';
    assert.ok(f.run(CAMPAIGN_NAMESPACE).writeCheckpoint(1, {
        schemaVersion: 1, revision: 8, clearedStages: [], unlockedWeapons: [],
        activeAttempt: { stageId: stage.id, runId: id },
    }));
    const c = f.campaign();
    const progress = { ...won(stage, id), phase: 'shop', wave: 1 };
    assert.ok(c.enableWorkshopForActive(progress));
    assert.ok(c.enableWorkshopForActive(progress));
    assert.equal(f.campaign().profile.activeAttempt.earnsCredits, true);
    assert.equal(f.campaign().replayResult(stage.id, won(stage, id)), 'committed');
    assert.equal(f.campaign().profile.credits, 12);
});

test('a prepared replacement preserves the prior attempt until the matching gameplay checkpoint commits', () => {
    const f = fixture();
    const [stage] = CAMPAIGN_STAGES;
    const c = f.campaign();
    assert.ok(c.beginAttempt(stage.id, 'prior'));
    assert.ok(c.prepareAttempt(stage.id, 'replacement'));
    assert.equal(f.campaign().profile.activeAttempt.runId, 'prior');
    assert.equal(f.campaign().commitAttempt(won(stage, 'prior')), false);
    const persisted = { ...won(stage, 'replacement'), phase: 'battle', wave: 0 };
    f.reject(true);
    assert.equal(c.commitAttempt(persisted), false);
    assert.equal(c.profile.activeAttempt.runId, 'prior');
    assert.equal(c.profile.pendingAttempt.runId, 'replacement');
    f.reject(false);
    const cold = f.campaign();
    assert.ok(cold.commitAttempt(persisted));
    assert.equal(cold.profile.activeAttempt.runId, 'replacement');
    assert.equal(cold.profile.pendingAttempt, null);
    assert.ok(cold.prepareAttempt(stage.id, 'cancelled'));
    assert.ok(cold.abortAttempt());
    assert.equal(f.campaign().profile.activeAttempt.runId, 'replacement');
});

test('receipt, first-clear weapon, workshop credits and stage unlock are committed together once', () => {
    const f = fixture();
    const [stage, second] = CAMPAIGN_STAGES;
    const c = f.campaign();
    const id = c.newAttemptId(stage.id, 88);
    assert.ok(c.beginAttempt(stage.id, id));
    f.reject(true);
    assert.equal(c.replayResult(stage.id, won(stage, id)), 'storage-failed');
    assert.equal(c.isUnlocked(second.id), false);
    assert.equal(c.profile.credits, 0);
    assert.equal(c.receipt(id), undefined);
    f.reject(false);
    const cold = f.campaign();
    assert.equal(cold.replayResult(stage.id, won(stage, id)), 'committed');
    assert.equal(cold.replayResult(stage.id, won(stage, id)), 'already-cleared');
    assert.ok(f.campaign().isUnlocked(second.id));
    assert.equal(cold.profile.credits, 12);
    assert.equal(cold.receipt(id).weapon, 'arc_gun');
    assert.ok(cold.buyBlueprint('magnetic_pickup_arm'));
    assert.equal(c.replayResult(stage.id, won(stage, id)), 'storage-failed');
    assert.equal(f.campaign().profile.credits, 8);
    assert.ok(cold.buyBlueprint('magnetic_pickup_arm'));
    assert.equal(cold.profile.credits, 8);
    assert.ok(cold.buyBlueprint('narrow_beam_clamp'));
    assert.equal(cold.buyBlueprint('quick_release_heatsink'), false);
    assert.equal(cold.selectBlueprint('quick_release_heatsink'), false);
    assert.ok(cold.selectBlueprint('narrow_beam_clamp'));
    assert.equal(f.campaign().profile.selectedBlueprint, 'narrow_beam_clamp');
    const replay = cold.newAttemptId(stage.id, 88);
    assert.ok(cold.beginAttempt(stage.id, replay));
    assert.equal(cold.replayResult(stage.id, won(stage, replay)), 'not-eligible');
    assert.equal(cold.replayResult(stage.id, { ...won(stage, replay), blueprint: 'narrow_beam_clamp' }), 'committed');
    assert.equal(cold.profile.credits, 12);
    assert.equal(cold.receipt(replay).firstClear, false);
});

test('credit only completed waves and grant one short-run aid to active movement', () => {
    const c = fixture().campaign();
    const [stage] = CAMPAIGN_STAGES;
    const loss = (runId, modifications = {}) => ({
        contentVersion: stage.contentVersion, phase: 'lost', finishReason: 'defeated',
        wave: 0, runId, firstWaveMoved: false, reports: [{ wave: 0, ticks: 450 }], ...modifications,
    });
    for (const [id, overrides, credits] of [
        ['idle', {}, 0], ['too-fast', { firstWaveMoved: true, reports: [{ wave: 0, ticks: 449 }] }, 0],
        ['qualified', { firstWaveMoved: true }, 1], ['retest', { firstWaveMoved: true }, 0],
        ['two-waves', { wave: 2 }, 4],
    ]) {
        assert.ok(c.beginAttempt(stage.id, id));
        assert.equal(c.replayResult(stage.id, { ...loss(id, overrides), phase: 'revive' }), 'not-eligible');
        assert.equal(c.replayResult(stage.id, loss(id, overrides)), 'committed');
        assert.equal(c.receipt(id).credits, credits);
        assert.equal(c.replayResult(stage.id, loss(id, overrides)), 'already-cleared');
    }
    assert.equal(c.profile.credits, 5);
    assert.deepEqual(c.profile.clearedStages, []);
});

test('overtime and commission badges are earned by eligible distinct runs', () => {
    const c = fixture().campaign();
    const [stage] = CAMPAIGN_STAGES;
    const complete = (id, mode, mods, triggers) => {
        assert.ok(c.beginAttempt(stage.id, id, { mode }));
        return c.replayResult(stage.id, { ...won(stage, id), mode, tools: [{ id: 'wrench', mods }],
            reports: [{ wave: stage.finalWave, ticks: 600, triggers, heatRecovered: true }] });
    };
    assert.equal(c.isModeUnlocked(stage.id, 'overtime_1'), false);
    assert.equal(complete('normal', 'normal', ['contact', 'splitter'], { arc: 1 }), 'committed');
    assert.equal(c.isModeUnlocked(stage.id, 'overtime_1'), true);
    assert.equal(c.isModeUnlocked(stage.id, 'overtime_2'), false);
    assert.equal(complete('extra', 'overtime_1', ['ring', 'coil'], { magnet: 1 }), 'committed');
    assert.equal(c.profile.overtimeRank, 1);
    assert.equal(c.isModeUnlocked(stage.id, 'overtime_2'), true);
    assert.equal(complete('extra-ii', 'overtime_2', ['ring', 'coil'], { magnet: 1 }), 'committed');
    assert.equal(c.profile.overtimeRank, 2);
    assert.equal(c.profile.credits, 40);
    assert.deepEqual(c.profile.clearedStages, ['01']);
    assert.ok(c.profile.badges.includes('heat_recovery'));
    assert.ok(c.profile.badges.includes('two_builds'));
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
