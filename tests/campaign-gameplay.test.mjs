import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { CAMPAIGN_01_RULES, CAMPAIGN_02_RULES, M2_RULES, FIRST_PAIR, START, PUDDLE_WARNING, isTool } from '../.m0-build/m1/content.js';
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

function play(run, route) {
    const final = run.rules.waves.length - 1;
    for (let wave = 0; wave <= final; wave++) {
        const battle = run.battle;
        while (!battle.finished) {
            let x, y;
            if (battle.boss) {
                const { unit, phase, attack } = battle.boss;
                const danger = phase === 'warning' || phase === 'charge' || phase === 'sweep';
                const angle = Math.atan2(battle.player.y - unit.y, battle.player.x - unit.x)
                    + (danger ? (attack === 'summon' ? 0 : 1.3) : 0.4);
                x = unit.x + 64 * Math.cos(angle);
                y = unit.y + 64 * Math.sin(angle);
            } else {
                const angle = battle.tick / 68;
                x = 180 + 113 * Math.cos(angle);
                y = 353 + 147 * Math.sin(angle);
            }
            const dx = x - battle.player.x, dy = y - battle.player.y;
            const norm = Math.max(5.2, Math.hypot(dx, dy));
            let moveX = dx / norm, moveY = dy / norm;
            // Turn around a telegraphed zone rather than circling through its centre.
            for (const puddle of battle.livePuddles) {
                const px = battle.player.x - puddle.x, py = battle.player.y - puddle.y;
                const radius = Math.hypot(px, py);
                if (radius >= puddle.radius + 9 || radius === 0) continue;
                const inward = (moveX * px + moveY * py) / radius;
                if (inward < 0.22) {
                    moveX += (0.55 - inward) * px / radius;
                    moveY += (0.55 - inward) * py / radius;
                }
            }
            run.advance(step, moveX, moveY);
        }
        assert.ok(battle.player.hp > 0, 'failed wave ' + (wave + 1));
        if (wave === final) {
            assert.ok(battle.bossDefeated);
        } else {
            assert.equal(run.data.phase, 'shop');
            assert.ok(!run.data.shop.offers.includes('arc_gun'));
            if (!wave) assert.ok(run.buy(FIRST_PAIR[route], 0, run.data.revision));
            if (wave === 1) {
                const secondTool = ['riveter', ...run.data.shop.offers.filter(isTool)].find(id => run.canBuy(id, 0));
                if (secondTool) assert.ok(run.buy(secondTool, 0, run.data.revision));
            }
            if (wave > 1) {
                for (const pick of run.data.shop.offers.slice()) {
                    if (run.canBuy(pick, 1)) assert.ok(run.buy(pick, 1, run.data.revision));
                }
            }
            assert.ok(run.nextWave(run.data.revision));
        }
    }
    assert.equal(run.data.phase, 'won');
}

test('actual battle ticks clear 01 and 02, boot replays a durable win interrupted before profile save', () => {
    const { platform, fail } = fixture();
    const profileStorage = platform(CAMPAIGN_NAMESPACE);
    const cp1 = platform('night-shift.campaign.run.01');
    const cp2 = platform('night-shift.campaign.run.02');
    const baseline = new Run(platform('night-shift.m2'), M2_RULES);
    baseline.start('magnet', 134);
    let campaign = new Campaign(profileStorage);
    assert.equal(campaign.isUnlocked('02'), false);
    const run1 = new Run(cp1, CAMPAIGN_01_RULES);
    assert.ok(campaign.beginAttempt('01', 'stage01-seed'));
    run1.start('arc', 20261120, 'wrench', 'stage01-seed');
    assert.equal(campaign.replayWon('01', run1.data), 'not-eligible');
    play(run1, 'arc');
    fail(CAMPAIGN_NAMESPACE);
    assert.equal(campaign.replayWon('01', run1.data), 'storage-failed');
    assert.equal(campaign.isUnlocked('02'), false);
    fail('');
    const reloaded1 = new Run(cp1, CAMPAIGN_01_RULES);
    campaign = new Campaign(profileStorage);
    assert.equal(campaign.replayWon('01', reloaded1.data), 'committed');
    assert.ok(campaign.isUnlocked('02'));
    campaign = new Campaign(profileStorage);
    assert.equal(campaign.replayWon('01', reloaded1.data), 'already-cleared');
    assert.deepEqual(campaign.profile.unlockedWeapons, ['arc_gun']);
    assert.ok(campaign.canUseStarter('02', 'arc_gun'));
    assert.ok(campaign.beginAttempt('02', 'stage02-seed'));
    const run2 = new Run(cp2, CAMPAIGN_02_RULES);
    run2.start('arc', 20261120, 'arc_gun', 'stage02-seed');
    assert.equal(run2.data.tools[0].id, 'arc_gun');
    assert.deepEqual(new Run(cp2, CAMPAIGN_02_RULES).data, run2.data);
    play(run2, 'arc');
    assert.equal(campaign.replayWon('02', new Run(cp2, CAMPAIGN_02_RULES).data), 'committed');
    assert.deepEqual(campaign.profile.clearedStages, ['01', '02']);
    assert.deepEqual(new Run(platform('night-shift.m2'), M2_RULES).data, baseline.data);
});

test('02 remains clearable with a default tool without an ad or permanent bonus', () => {
    const { platform } = fixture();
    const run = new Run(platform('baseline-route-02'), CAMPAIGN_02_RULES);
    run.start('magnet', 20261120, 'wrench', 'default-route');
    play(run, 'magnet');
});

test('puddles telegraph before damage, alternate and leave an unaffected central route', () => {
    const battle = new Battle(2, 42, [], CAMPAIGN_02_RULES);
    battle.tick = 29;
    const hp = battle.player.hp;
    const west = CAMPAIGN_02_RULES.waves[2].livePuddles[0];
    Object.assign(battle.player, { x: west.x, y: west.y });
    battle.step(0, 0);
    assert.equal(battle.livePuddles[0].phase, 'warning');
    assert.equal(battle.player.hp, hp);
    for (let tick = 1; tick < PUDDLE_WARNING; tick++) battle.step(0, 0);
    assert.equal(battle.player.hp, hp);
    battle.step(0, 0);
    assert.equal(battle.livePuddles[0].phase, 'active');
    assert.equal(battle.player.hp, hp - 1);
    assert.equal(battle.lastHit, 'live-puddle');
    for (let tick = 30; tick < 330; tick++) {
        battle.tick = tick;
        const live = battle.livePuddles.filter(puddle => puddle.phase === 'active');
        assert.ok(live.length <= 1);
        assert.ok(live.every(puddle => Math.hypot(puddle.x - START.x, puddle.y - START.y) >= puddle.radius));
    }
    assert.deepEqual(new Battle(0, 42, [], M2_RULES).livePuddles, []);
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
