import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
    CAMPAIGN_CATALOG, CAMPAIGN_CHAPTERS, campaignStage, rulesForCampaign,
} from '../.m0-build/campaign/CampaignCatalog.js';
import { CAMPAIGN_01_RULES, CAMPAIGN_02_RULES, ENEMIES, FIELD, TICK_RATE, TOOLS } from '../.m0-build/m1/content.js';
import { Battle } from '../.m0-build/m1/Battle.js';
import { Mission } from '../.m0-build/m1/Encounter.js';

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
            if (stage.rules.startingTools.includes(tool) && tool !== 'wrench') assert.ok(played.has(tool), `${stage.id}: ${tool}`);
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
    assert.deepEqual(CAMPAIGN_CATALOG[0].rules.waves, CAMPAIGN_01_RULES.waves);
    assert.deepEqual(CAMPAIGN_CATALOG[1].rules.waves, CAMPAIGN_02_RULES.waves);
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
    assert.match(campaignStage('10').archiveClue.text, /医院与泵站已签收电池/);
    assert.match(campaignStage('15').archiveClue.text, /收到求救与接管指令/);
    assert.match(campaignStage('20').archiveClue.text, /零号线路收到港区校验回传/);
});

test('dispatch goals describe the work that opens after the final boss', () => {
    for (const stage of CAMPAIGN_CATALOG) {
        const finale = stage.rules.waves[stage.finalWave].directive;
        if (!finale?.afterBoss) continue;
        const sequence = stage.id === '20' ? /核心停机后.*回执.*中央接管/ : /击败[^，。]+(?:后|，再)/;
        assert.match(stage.goal, sequence, stage.id);
    }
    const quantity = ['零', '一', '二', '三', '四', '五', '六'];
    for (const [id, task] of [['07', '处稳压'], ['11', '段信号'], ['12', '处录音端']]) {
        const stage = campaignStage(id);
        const { points } = stage.rules.waves[stage.finalWave].directive;
        assert.ok(stage.goal.includes(quantity[points.length] + task), id + ' finale objective count');
    }
});

test('the approach to the core teaches dual-signing and previews a sector turn', () => {
    const approach = campaignStage('19').rules.waves;
    const firstDual = approach.find(wave => wave.directive?.type === 'handoff' && wave.directive.points.length === 2);
    assert.equal(firstDual, approach[2]);
    assert.equal(firstDual.directive.windowTicks, 12 * TICK_RATE);
    assert.ok(!firstDual.enemies.includes('turret'), 'leave the first timed crossing free of long-range fire');
    assert.ok(approach.slice(3, 5).every(wave => wave.enemies.includes('turret')));

    const central = campaignStage('20').rules.waves;
    const sectors = new Mission(central[0].directive);
    const opening = sectors.view(1).scan.angle;
    const warning = sectors.view(151).scan.previewAngle;
    assert.ok(Number.isFinite(warning) && opening !== warning);
    assert.equal(sectors.view(181).scan.angle, warning);
    assert.equal(central[4].directive.type, 'handoff');
    assert.match(central[4].directive.label, /12 秒.*旁路/);
});

test('05 teaches both orderings at the same A/B controls used by the gatekeeper', () => {
    const stage = campaignStage('05');
    const waves = stage.rules.waves;
    const first = new Battle(stage.finalWave, 20261120, [], stage.rules);
    for (let tick = 0; tick < 65; tick++) first.step(0, 0);
    const { x, y } = first.chapterBoss.station;
    const [a] = waves[0].directive.points;
    const [b] = waves[1].directive.points;
    assert.deepEqual(a, { x, y });
    assert.equal(b.x - a.x, 120);
    assert.equal(b.y, a.y);
    assert.deepEqual(waves.map(wave => wave.directive.points), [[a], [b], [a, b], [b, a], [a, b], [a, b]]);
    assert.match(waves[0].directive.label, /A 区/);
    assert.match(waves[1].directive.label, /B 区/);
    assert.deepEqual(waves.flatMap((wave, index) => wave.directive.powerDrill ? [index + 1] : []), [5]);
    assert.match(waves[4].directive.label, /先合 A 闸.*B 区预警结束/);
});

test('08 lets the player feel the conveyor and see its first reversal before crawlers arrive', () => {
    const stage = campaignStage('08');
    const opening = new Battle(0, 20261120, [{ id: 'wrench', mods: [] }], stage.rules);
    const advance = (ticks) => {
        for (let tick = 0; tick < ticks; tick++) opening.step(0, 0);
    };
    opening.moveTo(180, 296);
    advance(30);
    assert.equal(opening.warnings.length, 0);
    assert.ok(opening.player.x > 180, 'standing on the belt moves the player');
    const [switchPort] = opening.spec.directive.points;
    opening.moveTo(switchPort.x, switchPort.y);
    advance(180);
    assert.deepEqual(opening.terrainRects.map(belt => [belt.state, belt.direction]), [['warning', 1], ['warning', -1]]);
    advance(30);
    assert.deepEqual(opening.terrainRects.map(belt => [belt.state, belt.direction]), [['open', -1], ['open', 1]]);
    assert.equal(opening.enemies.length, 0);
    assert.equal(opening.warnings.length, 0);
    assert.equal(opening.mission.status, 'complete');
    advance(30);
    assert.equal(opening.warnings[0].kind, 'crawler');
    assert.equal(stage.rules.waves[1].enemies[0], 'crawler');
    assert.equal(stage.rules.waves[1].directive.points.length, 2);
});

test('09 teaches a single lift leg before introducing progressively more bridge stops', () => {
    const waves = campaignStage('09').rules.waves;
    assert.ok(waves.every(wave => wave.directive.variant === 'lift'));
    assert.deepEqual(waves.map(wave => wave.directive.points.length - 2), [0, 1, 2, 3, 3, 3]);
    assert.equal(waves[0].enemies.length, 0);
    assert.equal(waves[0].escalation.atTick, 6 * TICK_RATE);
    assert.equal(waves[0].escalation.enemies[0], 'crawler');
    assert.deepEqual(waves.slice(1).map(wave => wave.liftGroups.map(group => group.floor)),
        [[2], [2, 3], [2, 3, 4], [2, 3, 4], [2, 3, 4]]);
    for (const wave of waves.slice(1)) {
        assert.ok(!wave.enemies.includes('reclaimer'));
        for (const { floor, enemies } of wave.liftGroups) {
            assert.equal(enemies.filter(enemy => enemy === 'reclaimer').length, floor === 3 ? 1 : 0);
        }
    }
    assert.equal(waves[5].directive.afterBoss, true);
});

test('campaign waves have playable spawn plans, objective bounds and chapter boss rules', () => {
    assert.deepEqual(CAMPAIGN_CATALOG.filter(stage => stage.chapterEnd).map(stage => stage.rules.encounter.boss),
        ['gatekeeper', 'tow', 'silence', 'core']);
    const types = new Set();
    for (const stage of CAMPAIGN_CATALOG) {
        assert.ok(stage.rules.encounter.enemyCap <= 36, stage.id);
        assert.equal(stage.rules.waves.length, 6, stage.id);
        for (const [index, wave] of stage.rules.waves.entries()) {
            assert.equal(Boolean(wave.boss), index === stage.finalWave, stage.id);
            assert.ok(wave.seconds > 0 && (wave.spawnEvery === 0 || wave.enemies.length > 0 || wave.liftGroups?.length > 0), stage.id);
            assert.ok(wave.enemies.every(kind => ENEMIES[kind] && kind !== 'inspector'), stage.id);
            if (wave.escalation) {
                const reserve = wave.escalation;
                assert.equal(index, reserve.requiredTicks === undefined ? 0 : 4, stage.id);
                assert.ok(reserve.enemies.length > 0 && reserve.enemies.some(kind => ENEMIES[kind]), stage.id);
                assert.ok(reserve.atTick + (reserve.requiredTicks ?? 0) < wave.seconds * TICK_RATE, stage.id);
            }
            if (!wave.directive) continue;
            const directive = wave.directive;
            types.add(directive.type);
            assert.ok(directive.points.length > 0 && directive.points.every(({ x, y }) =>
                x >= FIELD.left + 10 && x <= FIELD.right - 10 && y >= FIELD.bottom + 10 && y <= FIELD.top - 10),
            stage.id);
            assert.ok((directive.minTicks ?? 0) < wave.seconds * TICK_RATE, stage.id);
            if (directive.afterBoss) assert.equal(index, stage.finalWave, stage.id);
            if (directive.type === 'escort') assert.ok(directive.points.length >= 2, stage.id);
            if (directive.type === 'hybrid') assert.ok(directive.points.length >= (directive.switchCount ?? 1) + 2, stage.id);
        }
    }
    assert.deepEqual([...types].sort(), ['escort', 'handoff', 'hybrid', 'relay', 'scan', 'switch', 'thermal']);
});

test('Creator consumes the same campaign catalogue and wave plans as headless tests', () => {
    for (const name of ['CampaignCatalog', 'CampaignWaves']) {
        const path = `assets/scripts/campaign/${name}.ts`;
        assert.deepEqual(readFileSync(new URL('../' + path, import.meta.url)),
            readFileSync(new URL('../creator-m0/' + path, import.meta.url)));
        assert.ok(JSON.parse(readFileSync(new URL('../creator-m0/' + path + '.meta', import.meta.url))).uuid);
    }
});
