import test from 'node:test';
import assert from 'node:assert/strict';
import { Battle } from '../.m0-build/m1/Battle.js';
import { M2_RULES } from '../.m0-build/m1/content.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { PrototypeActorMotion } from '../assets/scripts/cocos/PrototypeActorMotion.ts';

const turnError = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const startBattle = () => new Battle(0, 143, [{ id: 'wrench', mods: [] }], M2_RULES);

test('prototype mechanic follows a continuous movement angle and retains it when stopped', () => {
    const battle = startBattle();
    const motion = new PrototypeActorMotion();
    motion.samplePlayer(battle);
    const target = Math.atan2(0.35, 0.91);
    for (let i = 0; i < 4; i++) {
        battle.step(0.91, 0.35);
        motion.samplePlayer(battle);
    }
    const walk = motion.samplePlayer(battle);
    assert.equal(walk.pose, 'walk');
    assert.ok(turnError(walk.yaw, target) < 1e-6);
    battle.step(0, 0);
    const idle = motion.samplePlayer(battle);
    assert.equal(idle.pose, 'idle');
    assert.equal(idle.yaw, walk.yaw);
    assert.deepEqual(motion.samplePlayer(battle), idle);
});

test('prototype charger holds its aim and both models respond to real combat events', () => {
    const battle = startBattle();
    const motion = new PrototypeActorMotion();
    const charger = { kind: 'charger', id: 900, x: battle.player.x - 43, y: battle.player.y - 18,
        hp: 100, state: 'walk', next: 1, vx: 0, vy: 0, marked: false };
    battle.enemies.push(charger);
    battle.step(0, 0);
    const warning = motion.sampleCharger(battle, charger);
    assert.equal(warning.pose, 'windup');
    assert.ok(warning.locked);
    assert.ok(turnError(warning.yaw, Math.atan2(charger.vy, charger.vx)) < 1e-6);
    assert.equal(battle.playerAttack.tick, battle.tick);
    assert.equal(motion.samplePlayer(battle).pose, 'strike');
    assert.equal(charger.hitAt, battle.tick);
    assert.equal(warning.impact, 1);

    for (let i = 0; i < 24 && charger.state === 'warn'; i++) {
        battle.step(0, 1);
        assert.ok(turnError(motion.sampleCharger(battle, charger).yaw, warning.yaw) < 1e-6);
    }
    assert.equal(motion.sampleCharger(battle, charger).pose, 'strike');
    const hp = battle.player.hp;
    battle.player.invulnerableUntil = battle.tick;
    battle.hurt('charger');
    assert.equal(battle.player.hp, hp - 1);
    const hit = motion.samplePlayer(battle);
    assert.deepEqual([hit.pose, hit.impact, hit.ageTicks], ['hit', 1, 0]);
});

test('turret reels from the actual shot tick and keeps its warning bearing through player movement', () => {
    const battle = new Battle(0, 21, [], M2_RULES);
    const visuals = new PrototypeActorMotion();
    const turret = { kind: 'turret', id: 901, x: battle.player.x - 60, y: battle.player.y - 22,
        hp: 8, state: 'walk', next: 1, vx: 0, vy: 0, marked: false };
    battle.enemies.push(turret);
    battle.step(0, 0);
    const warning = visuals.sampleRegular(battle, turret);
    assert.deepEqual([warning.pose, warning.ageTicks], ['windup', 0]);
    for (let i = 0; i < 21; i++) battle.step(0, 1);
    assert.equal(turret.shotAt, battle.tick);
    assert.equal(battle.bullets.length, 1);
    const shot = visuals.sampleRegular(battle, turret);
    assert.deepEqual([shot.pose, shot.ageTicks], ['strike', 0]);
    assert.ok(turnError(shot.yaw, warning.yaw) < 1e-6);
});

test('chapter boss motion preserves the sector bearing and starts at the actual hazard activation tick', () => {
    const stage = CAMPAIGN_CATALOG.find(candidate => candidate.rules.encounter?.boss === 'silence');
    const battle = new Battle(stage.finalWave, 35, [], stage.rules);
    const motion = new PrototypeActorMotion();
    const unit = battle.boss.unit;
    for (let i = 0; i < 65; i++) battle.step(0, 0);
    let view = battle.chapterBoss;
    assert.equal(view.hazard.shape, 'sector');
    assert.equal(view.phaseStartedAt, battle.tick);
    const warning = motion.sampleBoss(battle, unit, view);
    assert.deepEqual([warning.pose, warning.ageTicks], ['windup', 0]);
    assert.ok(turnError(warning.yaw, view.hazard.from + view.hazard.sweep / 2) < 1e-6);
    for (let i = 0; i < 36; i++) battle.step(1, 0);
    view = battle.chapterBoss;
    assert.equal(view.hazard.state, 'active');
    assert.equal(view.phaseStartedAt, battle.tick);
    assert.ok(view.phaseEndsAt > battle.tick);
    const attack = motion.sampleBoss(battle, unit, view);
    assert.deepEqual([attack.pose, attack.ageTicks], ['strike', 0]);
    assert.ok(turnError(attack.yaw, warning.yaw) < 1e-6);
});

test('weapon selection and lethal-hit presentation use battle events without leaving a live enemy', () => {
    const battle = new Battle(0, 25, [{ id: 'hydraulic_nailer', mods: [] }], M2_RULES);
    const crawler = { kind: 'crawler', id: 902, x: battle.player.x + 40, y: battle.player.y,
        hp: 1, state: 'walk', next: 30, vx: 0, vy: 0, marked: false };
    battle.enemies.push(crawler);
    battle.step(0, 0);
    assert.equal(battle.playerAttackTool, 'hydraulic_nailer');
    assert.equal(battle.playerAttack.tick, battle.tick);
    assert.ok(!battle.enemies.includes(crawler));
    assert.ok(battle.defeatedEnemies.includes(crawler));
    assert.equal(crawler.hitAt, battle.tick);
    for (let i = 0; i < 6; i++) battle.step(0, 0);
    assert.ok(!battle.defeatedEnemies.includes(crawler));
});
