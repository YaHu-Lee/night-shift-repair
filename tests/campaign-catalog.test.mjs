import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    CAMPAIGN_CATALOG, CAMPAIGN_CHAPTERS, campaignStage, rulesForCampaign,
} from '../.m0-build/campaign/CampaignCatalog.js';
import { WORKSHOP_STARTER_MILESTONES } from '../.m0-build/campaign/CampaignTraining.js';
import { campaignPressureRules, campaignWaveHint } from '../.m0-build/campaign/CampaignPressure.js';
import { CAMPAIGN_01_RULES, CAMPAIGN_02_RULES, CAMPAIGN_FIELD, ENEMIES, FIELD, START, TOOLS, waveKillTarget } from '../.m0-build/m1/content.js';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Run } from '../.m0-build/m1/Run.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

test('the 20 dispatches form one route through four five-station chapters', () => {
    assert.equal(CAMPAIGN_CHAPTERS.length, 4);
    assert.equal(CAMPAIGN_CATALOG.length, 20);
    assert.deepEqual(CAMPAIGN_CATALOG.map(stage => stage.id), Array.from({ length: 20 }, (_, i) => String(i + 1).padStart(2, '0')));
    const played = new Set();
    const weaponAwards = [];
    for (const [index, stage] of CAMPAIGN_CATALOG.entries()) {
        assert.equal(stage.prerequisite, CAMPAIGN_CATALOG[index - 1]?.id ?? null, stage.id);
        assert.equal(stage.finalWave, 5, stage.id);
        assert.equal(stage.rules.contentVersion, 21 + index, stage.id);
        assert.equal(stage.rules.contentVersion, stage.contentVersion, stage.id);
        assert.equal(campaignStage(stage.id), stage);
        assert.ok(stage.brief && stage.clear && stage.goal && stage.failure, stage.id);
        assert.equal(stage.chapterEnd, (index + 1) % 5 === 0, stage.id);
        for (const tool of stage.rules.tools) {
            assert.ok(TOOLS[tool], `${stage.id}: ${tool}`);
            if (stage.rules.startingTools.includes(tool) && tool !== 'wrench') {
                assert.ok(played.has(tool) || WORKSHOP_STARTER_MILESTONES.some(milestone => milestone.tool === tool), `${stage.id}: ${tool}`);
            }
        }
        if (stage.firstClearWeapon) {
            assert.ok(TOOLS[stage.firstClearWeapon], stage.id);
            assert.ok(!played.has(stage.firstClearWeapon), stage.id);
            played.add(stage.firstClearWeapon);
            weaponAwards.push([stage.id, stage.firstClearWeapon]);
        }
    }
    assert.deepEqual(weaponAwards, [
        ['01', 'arc_gun'], ['02', 'hydraulic_nailer'], ['05', 'pulse_nozzle'],
        ['10', 'traction_coil'], ['15', 'split_probe'], ['20', 'bypass_wrench'],
    ]);
    assert.deepEqual(CAMPAIGN_CHAPTERS.map(chapter => {
        const stages = CAMPAIGN_CATALOG.filter(stage => stage.chapter === chapter.id);
        assert.equal(stages.length, 5);
        for (const [index, stage] of stages.entries()) {
            assert.equal(stage.anchor, chapter.routePoints[stage.routeIndex]);
            if (index) assert.ok(stage.routeIndex > stages[index - 1].routeIndex && stage.anchor.y < stages[index - 1].anchor.y);
        }
        return stages.reduce((minutes, stage) => minutes + stage.plannedMinutes, 0);
    }), [32, 33, 34, 35]);
    const originalRoster = ({ seconds, spawnEvery, enemies, boss }) => ({ seconds, spawnEvery, enemies, boss });
    for (const [index, legacy] of [CAMPAIGN_01_RULES, CAMPAIGN_02_RULES].entries()) {
        assert.deepEqual(CAMPAIGN_CATALOG[index].rules.waves.map(originalRoster), legacy.waves.map(originalRoster));
    }
    assert.equal(rulesForCampaign(CAMPAIGN_CATALOG[0], 'overtime_2').contentVersion, 21);
    assert.throws(() => rulesForCampaign(CAMPAIGN_CATALOG[1], 'overtime_2'), /Overtime/);
});

test('chapter stories have distinct briefs and receipts, paired radios and three archive attachments', () => {
    assert.equal(new Set(CAMPAIGN_CATALOG.map(stage => stage.brief)).size, 20);
    assert.equal(new Set(CAMPAIGN_CATALOG.map(stage => stage.clear)).size, 20);
    assert.deepEqual(CAMPAIGN_CATALOG.filter(stage => stage.radio).map(stage => [stage.id, stage.chapterEnd]), [
        ['04', false], ['05', true], ['09', false], ['10', true],
        ['14', false], ['15', true], ['19', false], ['20', true],
    ]);
    assert.deepEqual(CAMPAIGN_CATALOG.filter(stage => stage.archiveClue).map(stage => [stage.id, stage.archiveClue.title]), [
        ['10', '授权一 · 医院交接'], ['15', '授权二 · 广播联络'], ['20', '港区来信'],
    ]);
    const delivery = campaignStage('10').archiveClue.text;
    assert.match(delivery, /电池.*医院、泵站各自签收/);
    assert.match(delivery, /医院值班室.*同意将机柜切回手动/);
    const broadcast = campaignStage('15').archiveClue.text;
    assert.match(broadcast, /东岸、西岸、北街.*求救广播收到/);
    assert.match(broadcast, /准许把机柜切回手动/);
    assert.match(campaignStage('20').archiveClue.text, /零号线路.*港区回信/);
});

test('all 120 campaign waves use open combat with finite rosters and no map objectives', () => {
    assert.ok(CAMPAIGN_FIELD.right - CAMPAIGN_FIELD.left > FIELD.right - FIELD.left);
    assert.ok(CAMPAIGN_FIELD.top - CAMPAIGN_FIELD.bottom > FIELD.top - FIELD.bottom);
    assert.equal((CAMPAIGN_FIELD.left + CAMPAIGN_FIELD.right) / 2, START.x);
    assert.equal((CAMPAIGN_FIELD.bottom + CAMPAIGN_FIELD.top) / 2, START.y);
    assert.deepEqual(CAMPAIGN_CATALOG.filter(stage => stage.chapterEnd).map(stage => stage.rules.encounter.boss),
        ['gatekeeper', 'tow', 'silence', 'core']);
    for (const stage of CAMPAIGN_CATALOG) {
        const { encounter, field, waves } = stage.rules;
        assert.deepEqual(field, CAMPAIGN_FIELD, stage.id);
        assert.equal(encounter.combatOnly, true, stage.id);
        assert.equal(encounter.terrain, undefined, stage.id);
        assert.ok(Number.isInteger(encounter.enemyCap) && encounter.enemyCap >= 10 && encounter.enemyCap <= 36, stage.id);
        assert.equal(waves.length, 6, stage.id);
        assert.match(stage.goal, /击败|击倒|击毁|击退|拆掉|摧毁|拆开/, stage.id);
        for (const [index, wave] of waves.entries()) {
            const label = stage.id + ' wave ' + (index + 1);
            assert.equal(wave.directive, undefined, label);
            assert.equal(wave.liftGroups, undefined, label);
            assert.equal(wave.livePuddles, undefined, label);
            assert.ok(wave.seconds > 0, label);
            assert.equal(Boolean(wave.boss), index === stage.finalWave, label);
            if (wave.boss) {
                assert.equal(wave.enemies.length, 0, label);
                assert.equal(wave.spawnEvery, 0, label);
                assert.equal(wave.clear, undefined, label);
                continue;
            }
            assert.ok(wave.spawnEvery > 0 && wave.enemies.length > 0, label);
            assert.ok(wave.enemies.every(kind => ENEMIES[kind] && kind !== 'inspector'), label);
            assert.ok(Number.isInteger(wave.clear.opening) && wave.clear.opening > 0, label);
            assert.ok(Number.isInteger(wave.clear.reserves) && wave.clear.reserves >= 0, label);
            assert.equal(waveKillTarget(wave), wave.clear.opening + wave.clear.reserves, label);
            assert.equal(Boolean(wave.escalation), wave.clear.reserves > 0, label);
            if (wave.escalation) {
                assert.ok(wave.escalation.enemies.length && wave.escalation.enemies.every(kind => ENEMIES[kind]), label);
                assert.equal(wave.escalation.requiredTicks, undefined, label);
            }
        }
    }
});

test('pressure alternates visible entrances, rejects spawns beside the player and releases reserves after kills', () => {
    const { rules } = campaignStage('01');
    const battle = new Battle(2, 42, [], rules);
    battle.step(0, 0);
    assert.equal(battle.warnings[0].x, battle.spawnBounds.left + 10);
    for (let tick = 0; tick < battle.spec.spawnEvery; tick++) battle.step(0, 0);
    assert.equal(battle.warnings.at(-1).x, battle.spawnBounds.right - 10);

    const fallback = new Battle(2, 42, [], rules);
    fallback.random = () => 0.5;
    Object.assign(fallback.player, { x: CAMPAIGN_FIELD.left + 16, y: START.y });
    fallback.step(0, 0);
    const warning = fallback.warnings[0];
    assert.equal(fallback.spawnBounds.left, CAMPAIGN_FIELD.left);
    assert.notEqual(warning.x, fallback.spawnBounds.left + 10);
    assert.ok(Math.hypot(warning.x - fallback.player.x, warning.y - fallback.player.y) >= 115);

    const reserve = new Battle(4, 42, [], rules);
    reserve.player.invulnerableUntil = 10_000;
    while (reserve.kills < reserve.spec.clear.opening && reserve.tick < 10_000) {
        reserve.step(0, 0);
        assert.equal(reserve.escalationSince, 0);
        for (const enemy of [...reserve.enemies]) reserve.hit(enemy, 100, reserve.player, 'magnet');
    }
    assert.equal(reserve.kills, reserve.spec.clear.opening);
    reserve.step(0, 0);
    assert.equal(reserve.escalationSince, reserve.tick);
    assert.equal(reserve.warnings[0].kind, 'charger');
    assert.equal(reserve.warnings[0].y, reserve.spawnBounds.top - 10);
});

test('campaign pressure preserves time windows and gives a usable hint for each next wave', () => {
    for (const stage of CAMPAIGN_CATALOG) {
        const normal = stage.rules;
        assert.equal(normal.contentVersion, stage.contentVersion);
        assert.equal(normal.encounter.revive, true);
        assert.equal(Boolean(normal.encounter.overtime), stage.id === '01');
        for (const [index] of normal.waves.entries()) {
            const hint = campaignWaveHint(normal, index);
            assert.ok(hint && hint.length <= 26, stage.id + ' wave ' + (index + 1));
        }
    }
    const { id, rules } = campaignStage('01');
    for (const mode of ['overtime_1', 'overtime_2']) {
        const challenge = campaignPressureRules(id, rules, mode);
        assert.equal(challenge.encounter.revive, false);
        assert.equal(challenge.maxHp, rules.maxHp);
        assert.deepEqual(challenge.waves.map(wave => wave.seconds), rules.waves.map(wave => wave.seconds));
        assert.deepEqual(challenge.waves.map(waveKillTarget), rules.waves.map(waveKillTarget));
        assert.ok(challenge.waves[2].spawnEvery < rules.waves[2].spawnEvery);
    }
    assert.match(campaignWaveHint(campaignStage('03').rules, 1), /护甲机.*炮台/);
    assert.match(campaignWaveHint(campaignStage('05').rules, 5), /车道.*扫击/);
    assert.match(campaignWaveHint(campaignStage('06').rules, 2), /回收机.*侧面/);
    assert.match(campaignWaveHint(campaignStage('20').rules, 5), /预警.*核心/);
});

test('a cold start preserves open combat and restores checkpoint pressure mode', () => {
    const stage = campaignStage('01');
    const slots = new Map();
    const host = { localStorage: { getItem: key => slots.get(key) ?? null, setItem: (key, value) => slots.set(key, value) } };
    const open = () => new Run(makePlatform(host, 'campaign-pressure-version'), stage.rules, {
        rulesForEquipment: mode => campaignPressureRules(stage.id, stage.rules, mode),
    });
    const run = open();
    run.start('arc', 20261120, 'wrench', 'legacy');
    assert.equal(open().rules, stage.rules);
    assert.equal(open().rules.encounter.combatOnly, true);

    run.start('arc', 20261120, 'wrench', 'challenge', undefined, 'overtime_1', 0, {});
    const cold = open();
    assert.equal(cold.data.runId, 'challenge');
    assert.equal(cold.data.mode, 'overtime_1');
    assert.equal(cold.rules.campaignPressure, true);
    assert.deepEqual(cold.battle.field, CAMPAIGN_FIELD);
    assert.equal(cold.rules.encounter.revive, false);
    assert.equal(cold.rules.contentVersion, stage.contentVersion);
});

test('Creator consumes the same campaign catalogue and wave plans as headless tests', () => {
    for (const name of ['CampaignCatalog', 'CampaignWaves', 'CampaignPressure']) {
        const path = `assets/scripts/campaign/${name}.ts`;
        assert.deepEqual(readFileSync(new URL('../' + path, import.meta.url)),
            readFileSync(new URL('../creator-m0/' + path, import.meta.url)));
        assert.ok(JSON.parse(readFileSync(new URL('../creator-m0/' + path + '.meta', import.meta.url))).uuid);
    }
});
