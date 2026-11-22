import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Battle } from '../.m0-build/m1/Battle.js';
import { ENEMIES, M2_RULES } from '../.m0-build/m1/content.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';

const fromRepo = path => new URL('../' + path, import.meta.url);
const json = async path => JSON.parse(await readFile(fromRepo(path), 'utf8'));
const workshop = 'creator-m0/assets/resources/skins/workshop/';

test('all workshop actors ship eight verified directions per pose and Creator can import the textures', async () => {
    const motion = await json('art/workshop/combat-motion.json');
    assert.deepEqual(motion.headings, ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']);
    assert.deepEqual(motion.poses, ['idle', 'step-a', 'step-b', 'windup', 'strike', 'recover', 'hit']);
    assert.match(motion.source, /bake-enemies\.cjs/);
    assert.ok(motion.licenseNotice.trim());
    const bossKinds = new Set(CAMPAIGN_CATALOG.flatMap(stage => stage.rules.encounter?.boss ?? []));
    const expected = [...Object.keys(ENEMIES), ...bossKinds, 'mechanic'].sort();
    assert.deepEqual(motion.spritesheets.flatMap(sheet => sheet.actors).sort(), expected);
    const uuids = new Set();
    for (const { id, actors, cell, width, height, alpha, sha256, technical_checks_passed } of motion.spritesheets) {
        const png = await readFile(fromRepo(workshop + id + '.png'));
        assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
        assert.equal(png.readUInt32BE(16), width);
        assert.equal(png.readUInt32BE(20), height);
        assert.equal(width, cell * motion.headings.length);
        assert.equal(height, cell * motion.poses.length * actors.length);
        assert.ok(alpha && (png[25] === 6 || png[25] === 3 && png.includes(Buffer.from('tRNS'))));
        assert.equal(technical_checks_passed, true);
        assert.equal(createHash('sha256').update(png).digest('hex'), sha256);
        const meta = await json(workshop + id + '.png.meta');
        assert.equal(meta.importer, 'image');
        assert.equal(meta.imported, true);
        assert.ok(!uuids.has(meta.uuid), id + ' Creator UUID');
        uuids.add(meta.uuid);
        const texture = Object.values(meta.subMetas).find(item => item.importer === 'texture');
        assert.equal(texture?.uuid, meta.userData.redirect);
        assert.equal(texture?.userData.imageUuidOrDatabaseUri, meta.uuid);
    }
    const view = 'assets/scripts/cocos/BattleSkinView.ts';
    assert.deepEqual(await readFile(fromRepo(view)), await readFile(fromRepo('creator-m0/' + view)));
});

test('mechanic injury timestamps follow lost HP and not shield absorption', () => {
    const battle = new Battle(0, 1, [{ id: 'wrench', mods: ['contact', 'plate'] }], M2_RULES);
    const initialHp = battle.player.hp;
    assert.equal(battle.shielded, true);
    battle.hurt('crawler');
    assert.equal(battle.player.hp, initialHp);
    assert.equal(battle.shielded, false);
    assert.equal(battle.player.hurtAt, undefined);

    battle.tick = battle.player.invulnerableUntil;
    battle.hurt('crawler');
    assert.equal(battle.player.hp, initialHp - 1);
    assert.equal(battle.player.hurtAt, battle.tick);
});

test('boss animation reports actual summoning and the direct duel exposes armor during recovery', () => {
    const tools = [{ id: 'wrench', mods: ['contact'] }];
    const patrol = new Battle(M2_RULES.waves.length - 1, 1, tools, M2_RULES);
    patrol.boss.unit.hp = Math.floor(ENEMIES.inspector.hp / 2);
    patrol.boss.next = 1;
    patrol.boss.pattern = 2;
    patrol.step(0, 0);
    assert.equal(patrol.boss.attack, 'summon');
    assert.equal(patrol.boss.phase, 'warning');
    assert.equal(patrol.boss.attackAt, undefined);
    while (patrol.boss.phase === 'warning') patrol.step(0, 0);
    assert.equal(patrol.boss.phase, 'recover');
    assert.equal(patrol.boss.attackAt, patrol.tick);
    assert.equal(patrol.enemyAttackCue, 'area');

    const stage = CAMPAIGN_CATALOG.find(stage => stage.id === '05');
    const gatekeeper = new Battle(stage.finalWave, 1, tools, stage.rules);
    Object.assign(gatekeeper.player, { x: 40, y: 210 });
    const limit = 180;
    while (gatekeeper.tick < limit && !gatekeeper.chapterBoss.recovering) gatekeeper.step(0, 0);
    assert.ok(gatekeeper.tick < limit);
    const recoveredAt = gatekeeper.tick;
    const closesAt = gatekeeper.chapterBoss.phaseEndsAt;
    assert.ok(closesAt > recoveredAt);
    assert.equal(gatekeeper.chapterBoss.vulnerable, true);
    assert.equal(gatekeeper.chapterBoss.hazard, undefined);
    assert.equal(gatekeeper.chapterBoss.station, undefined);
    while (gatekeeper.chapterBoss.recovering) gatekeeper.step(0, 0);
    assert.equal(gatekeeper.tick, closesAt);
    assert.equal(gatekeeper.chapterBoss.vulnerable, false);
});
