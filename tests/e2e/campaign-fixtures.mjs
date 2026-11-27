import assert from 'node:assert/strict';
import { makePlatform } from '../../.m0-build/platform/platform.js';
import { steerPatrol } from '../../.m0-build/roguelite/autoMovement.js';
import { PatrolStorage, PATROL_PROFILE_NAMESPACE, PATROL_RUN_NAMESPACE, PATROL_SAVE_NAMESPACE, validPatrolLocalSave } from '../../.m0-build/roguelite/persistence.js';
import { createDefaultProfile, PatrolSession } from '../../.m0-build/roguelite/session.js';
import { playShop } from '../../scripts/sim-shop.mjs';

export async function readSave(page) {
    const entries = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
    return makePlatform({localStorage: {getItem: key => entries[key] ?? null}}, PATROL_SAVE_NAMESPACE)
        .readCheckpoint(4, validPatrolLocalSave);
}

export function checkpoint(profile, session) {
    const entries = {};
    const host = { localStorage: {
        getItem: key => entries[key] ?? null,
        setItem: (key, value) => { entries[key] = value; },
    } };
    const storage = new PatrolStorage(...[PATROL_PROFILE_NAMESPACE, PATROL_RUN_NAMESPACE, PATROL_SAVE_NAMESPACE]
        .map(namespace => makePlatform(host, namespace)));
    storage.loadProfile();
    assert.ok(session ? storage.startRun(profile, session) : storage.saveProfile(profile));
    return entries;
}

// Write once into this test's isolated origin. Reloads exercise the game's own later writes.
export async function installCheckpoint(page, entries) {
    await page.addInitScript(entries => {
        if (sessionStorage.getItem('fixture-installed')) return;
        for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
        sessionStorage.setItem('fixture-installed', '1');
    }, entries);
}

export function playWave(session, dodge = true) {
    const battle = session.battle;
    let direction = [0, 0];
    while (session.phase === 'battle' && session.battle === battle) {
        if (dodge && battle.tick % 6 === 0) direction = steerPatrol(battle);
        session.stepBattle(...direction);
    }
}

export function bossCheckpoint(profile, options) {
    const session = new PatrolSession({...options,profile});
    let entries;
    while (session.phase === 'battle') {
        if (session.waveIndex === 11) entries = checkpoint(profile,session);
        playWave(session,session.waveIndex < 11);
        if (session.phase === 'shop') {
            playShop(session);
            assert.ok(session.startNextWave());
        }
    }
    assert.equal(session.phase,'won','Boss fixture no longer clears: ' + JSON.stringify(options));
    return {...options,entries,profileBefore:profile,profileAfter:session.applySettlementToProfile(profile),result:session.settle(profile)};
}

// Build legal wave-12 checkpoints by playing each preceding wave and buying at its real shop.
// The final battle is replayed in the browser from wave start, using the same ordinary idle input.
export function chapterCheckpoints() {
    let profile = createDefaultProfile();
    const checkpoints = [];
    for (const [chapterId,seed] of [['01',1],['02',1],['03',2],['04',9]]) {
        const sample = bossCheckpoint(profile,{chapterId,rigId:'duty_standard',seed});
        checkpoints.push(sample);
        profile = sample.profileAfter;
    }
    return checkpoints;
}
