import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { CAMPAIGN_01_RULES, CAMPAIGN_FIELD, M2_RULES, isTool } from '../.m0-build/m1/content.js';
import { Campaign, CAMPAIGN_NAMESPACE } from '../.m0-build/campaign/Campaign.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { makePlatform } from '../.m0-build/platform/platform.js';
import { playCampaignBattle } from '../scripts/campaign-balance.mjs';

const step = 1 / 30;

function fixture() {
    const storage = new Map();
    let failure = '';
    const host = { localStorage: {
        getItem: key => storage.get(key) ?? null,
        setItem(key, value) {
            if (failure && key.startsWith(failure + '.')) throw Error('simulated storage error');
            storage.set(key, value);
        },
    } };
    return { platform: key => makePlatform(host, key), fail: key => { failure = key; } };
}

function settleOrdinaryWave(run, earned = 9) {
    Object.assign(run.battle, { tick: run.battle.duration, kills: earned, collected: earned });
    run.advance(step);
    assert.equal(run.data.phase, 'shop');
}

test('campaign starting supplies add to the first repair-shop floor', () => {
    const { platform } = fixture();
    for (const earned of [0, 13]) {
        for (const supplies of [0, 3, 11]) {
            const run = new Run(platform(`supplies-${earned}-${supplies}`), CAMPAIGN_01_RULES);
            run.start('arc', 20261120, 'wrench', undefined, undefined, 'normal', supplies);
            assert.equal(run.data.parts, supplies);
            const loaded = new Run(run.platform, CAMPAIGN_01_RULES);
            loaded.resume();
            settleOrdinaryWave(loaded, earned);
            assert.equal(loaded.data.parts, Math.max(6, earned) + supplies);
            assert.equal(loaded.data.reports[0].shopCredit, Math.max(0, 6 - earned));
            run.dispose();
            loaded.dispose();
        }
    }
});

test('third and fifth shops offer one campaign calibration each and restore the selections', () => {
    const { platform, fail } = fixture();
    const storage = platform('calibration');
    let run = new Run(storage, CAMPAIGN_01_RULES);
    run.start('arc', 20261120);
    for (let wave = 0; wave <= 2; wave++) {
        settleOrdinaryWave(run);
        if (wave === 2) break;
        assert.equal(run.tuning, null);
        if (wave === 0) assert.ok(run.buy('splitter', 0, run.data.revision));
        if (wave === 1) assert.ok(run.buy(run.data.shop.offers.find(isTool), 0, run.data.revision));
        assert.ok(run.nextWave(run.data.revision));
    }
    const original = run.data;
    run.dispose();
    run = new Run(storage, CAMPAIGN_01_RULES);
    assert.deepEqual(run.data, original);
    assert.equal(run.tuning.step, 'handling');
    assert.deepEqual(run.tuning.choices.map(choice => choice.id), ['range', 'speed']);
    assert.equal(run.tune(0, 'edge', original.revision), false);
    assert.equal(run.tune(-1, 'range', original.revision), false);
    assert.equal(run.tune(0, 'range', original.revision - 1), false);
    fail('calibration');
    assert.equal(run.tune(1, 'range', original.revision), false);
    assert.deepEqual(run.data, original);
    fail('');
    assert.ok(run.tune(1, 'range', original.revision));
    assert.equal(run.data.parts, original.parts - 6);
    assert.deepEqual(run.tuning.purchased, { toolIndex: 1, choice: 'range' });
    assert.equal(run.tune(0, 'speed', run.data.revision), false);
    const mod = run.data.shop.offers.find(id => run.canBuy(id, 1));
    assert.ok(run.buy(mod, 1, run.data.revision));
    assert.deepEqual(run.data.tools[1].tuning, { handling: 'range' });

    assert.ok(run.nextWave(run.data.revision));
    settleOrdinaryWave(run);
    assert.equal(run.tuning, null);
    assert.ok(run.nextWave(run.data.revision));
    settleOrdinaryWave(run);
    assert.equal(run.tuning.step, 'finisher');
    const balance = run.data.parts;
    assert.ok(run.tune(1, 'edge', run.data.revision));
    assert.equal(run.data.parts, balance - 8);
    assert.ok(run.nextWave(run.data.revision));
    const restored = new Run(storage, CAMPAIGN_01_RULES);
    assert.deepEqual(restored.battle.tools[1].tuning, { handling: 'range', finisher: 'edge' });
    assert.equal(restored.data.tools[0].tuning, undefined);
    assert.equal(restored.tuning, null);
    run.dispose();
    restored.dispose();

    const standalone = new Run(platform('standalone-untuned'), M2_RULES);
    standalone.start('arc', 20261120);
    for (let wave = 0; wave <= 2; wave++) {
        settleOrdinaryWave(standalone);
        assert.equal(standalone.tuning, null);
        assert.ok(standalone.nextWave(standalone.data.revision));
    }
    standalone.dispose();
});

test('calibration changes actual range, attack interval, and per-target damage', () => {
    function strike(tuning, offsets, steps = 1) {
        const battle = new Battle(5, 105, [{ id: 'riveter', mods: [], tuning }], CAMPAIGN_01_RULES);
        battle.enemies.length = 0;
        Object.assign(battle.player, { x: 50, y: 300 });
        offsets.forEach((dx, id) => battle.enemies.push({ x: 50 + dx, y: 300, id, hp: 20,
            kind: 'turret', state: 'walk', next: 100, vx: 0, vy: 0, marked: false }));
        for (let mark = 0; mark < steps; mark++) battle.step(0, 0);
        return battle;
    }
    const long = strike({ handling: 'range' }, [193]);
    assert.equal(strike(undefined, [193]).enemies[0].hp, 20);
    assert.equal(long.enemies[0].hp, 18);
    assert.equal(long.effects[0].length, 222);
    assert.equal(long.weaponAttackCue, 'shot');
    assert.deepEqual(long.playerAttack, { tick: 1, x: 1, y: 0 });
    assert.equal(strike(undefined, [140], 16).enemies[0].hp, 18);
    assert.equal(strike({ handling: 'speed' }, [140], 16).enemies[0].hp, 16);
    assert.equal(strike({ handling: 'speed' }, [170]).enemies[0].hp, 20);
    assert.deepEqual(strike({ finisher: 'close' }, [50, 120, 152]).enemies.map(enemy => enemy.hp), [17, 18, 18]);
    assert.deepEqual(strike({ finisher: 'edge' }, [50, 120, 152]).enemies.map(enemy => enemy.hp), [18, 18, 17]);
});

test('actual battle ticks clear 01 and 02, boot replays a durable win interrupted before profile save', () => {
    const { platform, fail } = fixture();
    const profileStorage = platform(CAMPAIGN_NAMESPACE);
    const cp1 = platform('night-shift.campaign.run.01');
    const cp2 = platform('night-shift.campaign.run.02');
    const baseline = new Run(platform('night-shift.m2'), M2_RULES);
    baseline.start('magnet', 134);
    let campaign = new Campaign(profileStorage);
    assert.equal(campaign.isUnlocked('02'), false);
    const [stage01, stage02] = CAMPAIGN_CATALOG;
    const run1 = new Run(cp1, stage01.rules);
    assert.ok(campaign.beginAttempt('01', 'stage01-seed'));
    run1.start('arc', 20261120, 'wrench', 'stage01-seed');
    assert.equal(campaign.replayWon('01', run1.data), 'not-eligible');
    assert.equal(playCampaignBattle(run1).countedShops, 5);
    assert.equal(run1.data.phase, 'won');
    fail(CAMPAIGN_NAMESPACE);
    assert.equal(campaign.replayWon('01', run1.data), 'storage-failed');
    assert.equal(campaign.isUnlocked('02'), false);
    fail('');
    const reloaded1 = new Run(cp1, stage01.rules);
    campaign = new Campaign(profileStorage);
    assert.equal(campaign.replayWon('01', reloaded1.data), 'committed');
    assert.ok(campaign.isUnlocked('02'));
    campaign = new Campaign(profileStorage);
    assert.equal(campaign.replayWon('01', reloaded1.data), 'already-cleared');
    assert.deepEqual(campaign.profile.unlockedWeapons, ['arc_gun']);
    assert.ok(campaign.canUseStarter('02', 'arc_gun'));
    assert.ok(campaign.beginAttempt('02', 'stage02-seed'));
    const run2 = new Run(cp2, stage02.rules);
    run2.start('arc', 20261120, 'arc_gun', 'stage02-seed');
    assert.equal(run2.data.tools[0].id, 'arc_gun');
    assert.deepEqual(new Run(cp2, stage02.rules).data, run2.data);
    assert.equal(playCampaignBattle(run2).countedShops, 5);
    assert.equal(run2.data.phase, 'won');
    assert.equal(campaign.replayWon('02', new Run(cp2, stage02.rules).data), 'committed');
    assert.deepEqual(campaign.profile.clearedStages, ['01', '02']);
    assert.deepEqual(new Run(platform('night-shift.m2'), M2_RULES).data, baseline.data);
});

test('02 remains clearable with a default tool without an ad or permanent bonus', () => {
    const { platform } = fixture();
    const run = new Run(platform('baseline-route-02'), CAMPAIGN_CATALOG[1].rules);
    run.start('magnet', 20261120, 'wrench', 'default-route');
    assert.equal(playCampaignBattle(run).countedShops, 5);
    assert.equal(run.data.phase, 'won');
});

test('02 has no tile damage at the old puddle positions and can use the entire combat field', () => {
    const rules = CAMPAIGN_CATALOG[1].rules;
    const battle = new Battle(2, 42, [], rules);
    assert.deepEqual(battle.field, CAMPAIGN_FIELD);
    assert.deepEqual(battle.terrainRects, []);
    assert.equal(battle.mission, null);
    battle.spawn = () => {};
    const hp = battle.player.hp;
    for (const point of [{ x: 103, y: 304 }, { x: 260, y: 397 }]) {
        Object.assign(battle.player, point);
        for (let tick = 0; tick < 150; tick++) battle.step(0, 0);
        assert.deepEqual(battle.livePuddles, []);
        assert.equal(battle.player.hp, hp);
    }
    const x = battle.field.right - 18, y = battle.field.top - 18;
    battle.moveTo(x, y);
    for (let tick = 0; tick < 150; tick++) battle.step(0, 0);
    assert.ok(Math.hypot(battle.player.x - x, battle.player.y - y) <= 5);
});

test('all 20 played clears settle from cold checkpoints, award six tools, and allow a new replay of each stage', () => {
    const { platform, fail } = fixture();
    const journal = platform(CAMPAIGN_NAMESPACE);
    const seed = 20261120;
    const awards = [];
    let starter = 'wrench';
    let campaign = new Campaign(journal);

    function start(stage, tool) {
        assert.ok(campaign.canUseStarter(stage.id, tool), stage.id + ' ' + tool);
        const id = campaign.newAttemptId(stage.id, seed);
        const checkpoint = platform(CAMPAIGN_NAMESPACE + '.run.' + stage.id);
        assert.ok(campaign.prepareAttempt(stage.id, id));
        const run = new Run(checkpoint, stage.rules);
        run.start('magnet', seed, tool, id);
        assert.equal(run.data.runId, id);
        assert.ok(campaign.commitAttempt(run.data));
        return { run, checkpoint, id };
    }

    for (const [index, stage] of CAMPAIGN_CATALOG.entries()) {
        assert.deepEqual(CAMPAIGN_CATALOG.filter(candidate => campaign.isUnlocked(candidate.id)).map(candidate => candidate.id),
            CAMPAIGN_CATALOG.slice(0, index + 1).map(candidate => candidate.id));
        const { run, checkpoint, id } = start(stage, starter);
        const { firstShop } = playCampaignBattle(run);
        assert.equal(run.data.phase, 'won', stage.id);
        assert.ok(firstShop?.pairAffordable, stage.id + ' first shop');
        assert.equal(run.data.wave, stage.finalWave);
        run.dispose();

        const coldRun = new Run(checkpoint, stage.rules);
        const terminal = coldRun.data;
        assert.equal(terminal.runId, id);
        assert.equal(terminal.finishReason, 'cleared', stage.id);
        assert.equal(terminal.reports.length, stage.finalWave + 1, stage.id);
        coldRun.dispose();
        campaign = new Campaign(journal);
        if (stage.id === '20') {
            fail(CAMPAIGN_NAMESPACE);
            assert.equal(campaign.replayResult(stage.id, terminal), 'storage-failed');
            assert.equal(campaign.profile.clearedStages.length, 19);
            assert.equal(campaign.profile.credits, 228);
            assert.equal(campaign.profile.storySeen.includes('clear-20'), false);
            fail('');
            campaign = new Campaign(journal);
        }
        assert.equal(campaign.replayResult(stage.id, terminal), 'committed', stage.id);
        assert.equal(campaign.receipt(id).weapon, stage.firstClearWeapon);
        assert.equal(campaign.receipt(id).credits, 12);
        campaign = new Campaign(journal);
        assert.equal(campaign.replayResult(stage.id, terminal), 'already-cleared', stage.id);
        assert.equal(campaign.profile.credits, 12 * (index + 1));
        assert.deepEqual(campaign.profile.storySeen, CAMPAIGN_CATALOG.slice(0, index + 1).map(candidate => 'clear-' + candidate.id));
        if (stage.firstClearWeapon) {
            awards.push(stage.firstClearWeapon);
            starter = stage.firstClearWeapon;
        }
        assert.deepEqual(campaign.profile.unlockedWeapons, awards);
    }
    assert.equal(awards.length, 6);
    assert.equal(campaign.isUnlocked('21'), false);
    const completed = campaign.profile.clearedStages;
    const finaleId = campaign.profile.activeAttempt.runId;
    const archivedStories = campaign.profile.storySeen;
    for (const stage of CAMPAIGN_CATALOG) {
        const { run, id } = start(stage, 'bypass_wrench');
        assert.notEqual(id, finaleId);
        assert.equal(run.data.phase, 'battle');
        assert.equal(run.data.wave, 0);
        assert.equal(run.data.tools[0].id, 'bypass_wrench');
        assert.equal(campaign.profile.activeAttempt.stageId, stage.id);
        assert.equal(campaign.profile.credits, 240);
        assert.deepEqual(campaign.profile.clearedStages, completed);
        run.dispose();
    }

    const replay = start(CAMPAIGN_CATALOG[0], 'wrench');
    playCampaignBattle(replay.run);
    assert.equal(replay.run.data.phase, 'won');
    assert.equal(campaign.replayResult('01', replay.run.data), 'committed');
    replay.run.dispose();
    campaign = new Campaign(journal);
    assert.equal(campaign.receipt(replay.id).firstClear, false);
    assert.equal(campaign.profile.credits, 252);
    assert.deepEqual(campaign.profile.storySeen, archivedStories);
    assert.deepEqual(CAMPAIGN_CATALOG.filter(stage => stage.archiveClue
        && campaign.profile.clearedStages.includes(stage.id)).map(stage => stage.id), ['10', '15', '20']);
});
