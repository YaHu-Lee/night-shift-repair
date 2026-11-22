import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../assets/scripts/cocos/CampaignAudio.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;

function audio(waitsForGesture = true, campaign = true) {
    const exports = {};
    const loads = new Map();
    const requests = [];
    const retries = [];
    const sources = [];
    let now = 100;
    class AudioSource {
        attempts = 0;
        pauses = 0;
        oneShots = [];
        play() { this.attempts++; }
        pause() { this.pauses++; this.playing = false; }
        playOneShot(clip, gain) { this.oneShots.push({ clip, gain }); }
    }
    const cc = { AudioSource, resources: { load(path, _type, callback) {
        requests.push(path);
        loads.set(path, callback);
    } } };
    vm.runInNewContext(output, { exports, require: () => cc, Date: { now: () => now } });
    const node = { addComponent: Type => { const source = new Type(); sources.push(source); return source; } };
    const controller = new exports.CampaignAudio(node, campaign, waitsForGesture, retry => retries.push(retry));
    return { controller, effects: sources[0], workshop: sources[1], combat: sources[2], requests, retries,
        loaded(path) { loads.get(path)(null, { path }); },
        failed(path) { loads.get(path)(new Error('offline')); }, wait(ms) { now += ms; } };
}

test('home keeps only the workshop score and local cues eager until dispatch', () => {
    const { controller, combat, requests, loaded } = audio();
    assert.deepEqual(requests, [
        'campaign/night-shift', 'm2/warning', 'campaign/purchase', 'campaign/unlock',
    ]);
    controller.syncMusic('workshop', true);
    assert.equal(requests.length, 4);
    controller.prepareCombat();
    assert.equal(requests.length, 22);
    assert.ok(requests.includes('campaign/live-circuit'));
    assert.ok(requests.includes('campaign/tool-impact'));
    controller.prepareCombat();
    controller.syncMusic('combat');
    assert.equal(requests.length, new Set(requests).size);
    loaded('campaign/live-circuit');
    assert.equal(combat.attempts, 1);
});

test('M2 still prepares its four legacy cues without requesting campaign audio', () => {
    const { controller, requests } = audio(false, false);
    controller.prepareCombat();
    assert.deepEqual(requests, ['m2/warning', 'm2/charge', 'm2/hit', 'm2/clear']);
});

test('web score is armed only by a gesture and can retry an unconfirmed start', () => {
    const { controller, workshop, loaded, wait } = audio();
    controller.syncMusic('workshop');
    loaded('campaign/night-shift');
    assert.equal(workshop.attempts, 0);
    controller.syncMusic('workshop', true);
    assert.equal(workshop.attempts, 1);
    controller.syncMusic('workshop', true);
    assert.equal(workshop.attempts, 1);
    wait(700);
    controller.syncMusic('workshop');
    assert.equal(workshop.attempts, 1);
    controller.syncMusic('workshop', true);
    assert.equal(workshop.attempts, 2);
    workshop.playing = true;
    wait(700);
    controller.syncMusic('workshop', true);
    assert.equal(workshop.attempts, 2);
    assert.equal(controller.musicPlaying, true);
});

test('pending scores are masked immediately on mute or phase change and reuse prepared clips', () => {
    const { controller, workshop, combat, loaded } = audio(false);
    controller.syncMusic('workshop');
    loaded('campaign/night-shift');
    assert.equal(workshop.attempts, 1);
    controller.syncMusic('combat');
    assert.equal(workshop.volume, 0);
    assert.equal(workshop.pauses, 1);
    assert.equal(combat.attempts, 0);
    controller.syncMusic(undefined);
    loaded('campaign/live-circuit');
    assert.equal(combat.attempts, 0);
    controller.syncMusic('combat');
    assert.equal(combat.attempts, 1);
    assert.equal(controller.musicTrack, 'combat');
    controller.dispose();
    assert.equal(combat.pauses, 1);
    assert.equal(combat.volume, 0);
});

test('sound effects can play with music muted and rate-limit overlapping tool cues', () => {
    const { controller, effects, loaded, failed, retries, wait } = audio();
    controller.prepareCombat();
    failed('campaign/tool-shot');
    assert.equal(retries.length, 1);
    retries.pop()();
    loaded('campaign/tool-shot');
    loaded('campaign/tool-arc');
    loaded('campaign/tool-impact');
    controller.play('shot');
    assert.equal(effects.oneShots.length, 0);
    controller.syncMusic(undefined, true);
    controller.play('shot');
    controller.play('arc');
    controller.play('impact');
    wait(75);
    controller.play('arc');
    assert.equal(controller.musicPlaying, false);
    assert.deepEqual(effects.oneShots.map(sound => sound.clip.path), [
        'campaign/tool-shot', 'campaign/tool-impact', 'campaign/tool-arc',
    ]);
});
