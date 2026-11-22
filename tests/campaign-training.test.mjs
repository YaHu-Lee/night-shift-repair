import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CAMPAIGN_NAMESPACE, CAMPAIGN_STAGES, Campaign } from '../.m0-build/campaign/Campaign.js';
import { validProfile } from '../.m0-build/campaign/CampaignLedger.js';
import { createEquipment, validEquipment } from '../.m0-build/m1/Equipment.js';
import { Run } from '../.m0-build/m1/Run.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

function fixture() {
    const slots = new Map();
    let failReadback = false;
    let failingSlot = null;
    const host = { localStorage: {
        getItem(key) {
            if (key === failingSlot) {
                failingSlot = null;
                throw new Error('interrupted readback');
            }
            return slots.get(key) ?? null;
        },
        setItem(key, value) {
            slots.set(key, value);
            if (failReadback) {
                failReadback = false;
                failingSlot = key;
            }
        },
    } };
    return { open: () => new Campaign(makePlatform(host, CAMPAIGN_NAMESPACE)),
        openRun: rules => new Run(makePlatform(host, `${CAMPAIGN_NAMESPACE}.training-test`), rules),
        failReadback() { failReadback = true; } };
}

function finish(campaign, stage, runId, mode = 'normal', wins = true) {
    assert.ok(campaign.beginAttempt(stage.id, runId, { mode }));
    const checkpoint = { contentVersion: stage.contentVersion, mode, runId,
        phase: wins ? 'won' : 'lost', finishReason: wins ? 'cleared' : 'defeated',
        wave: wins ? stage.finalWave : 1 };
    assert.equal(campaign.replayResult(stage.id, checkpoint), 'committed');
    assert.equal(campaign.replayResult(stage.id, checkpoint), 'already-cleared');
    return campaign.receipt(runId);
}

test('training spends the previewed price once across stale taps and ambiguous write results', () => {
    const store = fixture();
    const campaign = store.open();
    const stage = CAMPAIGN_STAGES[0];
    assert.equal(campaign.profile.training, undefined);
    assert.equal(campaign.trainWeapon('wrench', campaign.profile.revision), false);
    assert.equal(campaign.weaponTraining('arc_gun').next, null);
    finish(campaign, stage, 'funding');
    const revision = campaign.profile.revision;
    const price = campaign.weaponTraining('wrench').next.price;
    const budget = campaign.profile.credits;
    store.failReadback();
    assert.equal(campaign.trainWeapon('wrench', revision), false);
    assert.equal(campaign.profile.credits, budget);
    assert.equal(campaign.weaponTraining('wrench').rank, 0);
    assert.equal(campaign.trainWeapon('wrench', revision), true);
    assert.equal(campaign.trainWeapon('wrench', revision), false);
    assert.equal(campaign.trainRole('vitality', revision), false);
    const reopened = store.open();
    assert.equal(reopened.profile.credits, budget - price);
    assert.equal(reopened.weaponTraining('wrench').rank, 1);
    assert.equal(reopened.weaponTraining('wrench').reachBonus, 8);
});

test('upgrade indicators follow live blueprint and training costs after earnings and purchases', () => {
    const store = fixture();
    const campaign = store.open();
    const stage = CAMPAIGN_STAGES[0];
    const indicators = () => [campaign.canUpgradeEquipment, campaign.canUpgradeRole];
    const earnTwo = index => finish(campaign, stage, `upgrade-credits-${index}`, 'normal', false);

    assert.deepEqual(indicators(), [false, false]);
    earnTwo(0);
    assert.deepEqual(indicators(), [false, false]);
    earnTwo(1);
    assert.deepEqual(indicators(), [true, false]);
    assert.equal(campaign.buyBlueprint('magnetic_pickup_arm'), true);
    assert.deepEqual(indicators(), [false, false]);

    for (let i = 2; i <= 4; i++) earnTwo(i);
    assert.deepEqual(indicators(), [true, true]);
    assert.equal(campaign.canBuyBlueprint, false);
    earnTwo(5);
    assert.equal(campaign.canBuyBlueprint, true);
    assert.equal(campaign.buyBlueprint('quick_release_heatsink'), true);
    assert.deepEqual(indicators(), [false, false]);

    for (let i = 6; i <= 8; i++) earnTwo(i);
    assert.deepEqual(indicators(), [true, true]);
    assert.equal(campaign.trainRole('vitality', campaign.profile.revision), true);
    assert.deepEqual(indicators(), [false, false]);
    const reopened = store.open();
    assert.deepEqual([reopened.canUpgradeEquipment, reopened.canUpgradeRole], [false, false]);
});

test('upgrade indicators cover alternate unlocked weapons and ignore maxed or owned options', () => {
    const store = fixture();
    const campaign = store.open();
    const stage = CAMPAIGN_STAGES[0];
    for (let i = 0; i < 14; i++) finish(campaign, stage, `complete-upgrades-${i}`);
    for (const blueprint of ['magnetic_pickup_arm', 'quick_release_heatsink', 'narrow_beam_clamp']) {
        assert.equal(campaign.canBuyBlueprint, true);
        assert.equal(campaign.buyBlueprint(blueprint), true);
    }
    assert.equal(campaign.canBuyBlueprint, false);

    const trainWeapon = tool => {
        for (let i = 0; i < 3; i++) assert.equal(campaign.trainWeapon(tool, campaign.profile.revision), true);
    };
    trainWeapon('wrench');
    assert.equal(campaign.canUpgradeEquipment, true);
    trainWeapon('arc_gun');
    assert.equal(campaign.canUpgradeEquipment, false);
    assert.equal(campaign.selectStarterAttachment('wrench', 'wrench/signature', campaign.profile.revision), true);
    assert.equal(campaign.selectBlueprint('magnetic_pickup_arm'), true);
    assert.equal(campaign.canUpgradeEquipment, false);

    const trainRole = track => {
        for (let i = 0; i < 2; i++) assert.equal(campaign.trainRole(track, campaign.profile.revision), true);
    };
    trainRole('vitality');
    assert.equal(campaign.canUpgradeRole, true);
    trainRole('mobility');
    trainRole('collection');
    assert.ok(campaign.profile.credits >= 12);
    assert.equal(campaign.canUpgradeRole, false);
    const reopened = store.open();
    assert.equal(reopened.canUpgradeEquipment, false);
    assert.equal(reopened.canUpgradeRole, false);
});

test('each run-start snapshot isolates weapon upgrades and validates its selected signature', () => {
    const store = fixture();
    const campaign = store.open();
    const stage = CAMPAIGN_STAGES[0];
    const before = campaign.trainingLoadout('wrench');
    for (let i = 0; i < 7; i++) finish(campaign, stage, `funding-${i}`);
    const rev = () => campaign.profile.revision;
    assert.equal(campaign.trainWeapon('hydraulic_nailer', rev()), false);
    assert.equal(campaign.selectStarterAttachment('wrench', 'wrench/signature', rev()), false);
    for (let i = 0; i < 3; i++) assert.equal(campaign.trainWeapon('wrench', rev()), true);
    assert.equal(campaign.trainWeapon('wrench', rev()), false);
    assert.equal(campaign.trainWeapon('arc_gun', rev()), true);
    assert.equal(campaign.selectStarterAttachment('wrench', 'arc_gun/signature', rev()), false);
    assert.equal(campaign.selectStarterAttachment('wrench', 'wrench/link', rev()), false);
    assert.equal(campaign.selectStarterAttachment('wrench', 'wrench/signature', rev()), true);
    const selected = campaign.trainingLoadout('wrench');
    const run = store.openRun(stage.rules);
    run.start('arc', 5, 'wrench', 'training-loadout', undefined, 'normal', 0, selected);
    assert.equal(run.data.equipment.starterAttachment, 'wrench/signature');
    assert.equal(run.data.tools[0].attachments[0], 'wrench/signature');
    assert.equal(run.battle.maxHp, stage.rules.maxHp);
    run.dispose();
    for (const track of ['vitality', 'mobility', 'collection']) assert.equal(campaign.trainRole(track, rev()), true);
    assert.equal(campaign.trainRole('vitality', rev()), true);
    assert.equal(campaign.trainRole('vitality', rev()), false);
    const reopened = store.open();
    const wrench = reopened.trainingLoadout('wrench');
    const arc = reopened.trainingLoadout('arc_gun');
    assert.deepEqual(wrench.weapon, { reachBonus: 8, intervalReduction: 1, damageBonus: 0 });
    assert.deepEqual(arc.weapon, { reachBonus: 9, intervalReduction: 0, damageBonus: 0 });
    assert.deepEqual(wrench.role, { hpBonus: 2, speedBonus: 0.05, pickupBonus: 2.1 });
    assert.equal(reopened.trainingLoadout('wrench', 'magnet').role.pickupBonus, 3.9);
    assert.deepEqual(arc.role, wrench.role);
    assert.equal(wrench.starterAttachment, 'wrench/signature');
    assert.equal(arc.starterAttachment, undefined);
    assert.deepEqual(arc.unlockedAttachments, ['wrench/signature']);
    assert.equal(before.weapon.reachBonus, 0);
    assert.equal(selected.role.hpBonus, 0);
    const resumed = store.openRun(stage.rules);
    assert.equal(resumed.data.equipment.role.hpBonus, 0);
    assert.equal(resumed.battle.maxHp, stage.rules.maxHp);
    resumed.dispose();
    assert.ok(Object.isFrozen(wrench) && Object.isFrozen(wrench.weapon) && Object.isFrozen(wrench.role));
    assert.ok(Object.isFrozen(wrench.unlockedAttachments));
    assert.equal(reopened.selectStarterAttachment('wrench', null, reopened.profile.revision), true);
    assert.equal(reopened.trainingLoadout('wrench').starterAttachment, undefined);
    assert.equal(wrench.starterAttachment, 'wrench/signature');
    const otherDevice = fixture().open();
    assert.equal(otherDevice.restoreBackup(reopened.backup()), true);
    assert.equal(otherDevice.weaponTraining('wrench').rank, 0);
    assert.equal(otherDevice.roleTraining('vitality').rank, 0);
    assert.equal(validProfile({ ...reopened.profile, training: { roles: { mobility: 3 }, weapons: {} } }), false);
    assert.equal(validProfile({ ...reopened.profile, training: { roles: {},
        weapons: { wrench: { rank: 3, starterAttachment: 'arc_gun/signature' } } } }), false);
});

test('workshop tool milestones open training and starter slots from existing cleared stages', () => {
    const campaign = fixture().open();
    const milestones = new Map([['02', 'riveter'], ['05', 'torch'], ['10', 'induction']]);
    assert.deepEqual(campaign.availableTrainingWeapons(), ['wrench']);
    assert.equal(campaign.trainingLoadout('wrench').unlockedGear, undefined);
    for (const stage of CAMPAIGN_STAGES.slice(0, 10)) {
        const tool = milestones.get(stage.id);
        if (tool) {
            assert.equal(campaign.weaponTraining(tool).next, null);
            assert.equal(campaign.canUseStarter('01', tool), false);
        }
        finish(campaign, stage, `workshop-tools-${stage.id}`);
        if (tool) {
            assert.ok(campaign.weaponTraining(tool).next);
            assert.ok(campaign.availableTrainingWeapons().includes(tool));
            assert.equal(campaign.canUseStarter(stage.id, tool), true);
            assert.equal(campaign.canUseStarter('01', tool), true);
            assert.equal(campaign.trainWeapon(tool, campaign.profile.revision), true);
        }
    }
    assert.deepEqual(campaign.profile.unlockedWeapons, ['arc_gun', 'hydraulic_nailer', 'pulse_nozzle', 'traction_coil']);
    assert.deepEqual(campaign.trainingLoadout('wrench').unlockedGear, ['gear/harness']);
    const restored = fixture().open();
    assert.equal(restored.restoreBackup(campaign.backup()), true);
    assert.deepEqual(restored.trainingLoadout('wrench').unlockedGear, ['gear/harness']);
    for (const tool of milestones.values()) {
        assert.equal(restored.weaponTraining(tool).rank, 0);
        assert.ok(restored.weaponTraining(tool).next);
        assert.equal(restored.canUseStarter('01', tool), true);
    }
});

test('replay challenges have separate stage gates and pay the first-win bonus even after losing an attempt', () => {
    const store = fixture();
    let campaign = store.open();
    const [first, second] = CAMPAIGN_STAGES;
    assert.equal(campaign.isModeUnlocked(first.id, 'overtime_1'), false);
    finish(campaign, first, 'first-dispatch');
    assert.equal(campaign.isModeUnlocked(second.id, 'overtime_1'), false);
    assert.equal(campaign.isModeUnlocked(first.id, 'overtime_2'), false);
    finish(campaign, second, 'second-dispatch');
    assert.equal(campaign.isModeUnlocked(second.id, 'overtime_1'), true);
    assert.equal(campaign.isModeUnlocked(second.id, 'overtime_2'), false);
    assert.equal(finish(campaign, second, 'lost-challenge', 'overtime_1', false).challengeBonus, undefined);
    assert.equal(campaign.hasClearedChallenge(second.id), false);
    const receipt = finish(campaign, second, 'first-challenge', 'overtime_1');
    assert.equal(receipt.challengeBonus, 4);
    assert.equal(receipt.credits, (second.finalWave + 1) * 2 + 4);
    assert.equal(receipt.firstClear, false);
    assert.equal(campaign.profile.overtimeRank, 0);
    campaign = store.open();
    assert.equal(campaign.hasClearedChallenge(second.id), true);
    assert.equal(campaign.hasClearedChallenge(first.id), false);
    assert.equal(finish(campaign, second, 'another-challenge', 'overtime_1').challengeBonus, undefined);
    assert.equal(finish(campaign, first, 'opening-challenge', 'overtime_1').challengeBonus, 4);
    assert.equal(campaign.isModeUnlocked(first.id, 'overtime_2'), true);
    assert.equal(finish(campaign, first, 'opening-challenge-two', 'overtime_2').challengeBonus, undefined);
    assert.deepEqual(campaign.profile.challengeClears, [second.id, first.id]);
    assert.equal(validProfile({ ...campaign.profile, receipts: [{ ...receipt, challengeBonus: 3,
        credits: receipt.credits - 1 }] }), false);
});

test('the new equipment earns inspector builds only when a matching effect fired', () => {
    const campaign = fixture().open();
    const stage = CAMPAIGN_STAGES[0];
    const { equipment, tools } = createEquipment('wrench', {});
    tools[0].attachments[0] = 'wrench/link';
    equipment.gear[0] = 'gear/pulse';
    assert.equal(validEquipment(equipment, tools, stage.finalWave), true);
    assert.deepEqual(tools[0].mods, []);
    for (const build of ['arc', 'magnet']) {
        const runId = `new-equipment-${build}`;
        assert.equal(campaign.beginAttempt(stage.id, runId), true);
        const checkpoint = { contentVersion: stage.contentVersion, phase: 'won', finishReason: 'cleared',
            wave: stage.finalWave, runId, equipment, tools,
            reports: [{ wave: stage.finalWave, ticks: 30, triggers: { [build]: 1, heat: 1 } }] };
        assert.equal(campaign.replayResult(stage.id, checkpoint), 'committed');
        assert.deepEqual(campaign.receipt(runId).builds, [build]);
        assert.equal(campaign.receipt(runId).chosenBuild, build);
    }
    assert.ok(campaign.profile.badges.includes('two_builds'));
});
