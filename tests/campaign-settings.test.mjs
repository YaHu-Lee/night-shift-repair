import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAMPAIGN_SETTINGS_NAMESPACE, CampaignSettings, DEFAULT_CAMPAIGN_PREFERENCES } from '../.m0-build/platform/settings.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

function storageFixture() {
    const slots = new Map();
    const host = { localStorage: {
        getItem: key => slots.get(key) ?? null,
        setItem: (key, value) => slots.set(key, value),
    } };
    const platform = () => makePlatform(host, CAMPAIGN_SETTINGS_NAMESPACE);
    return { host, platform, slots };
}

test('campaign preferences default to joystick and preserve a chosen touch mode', () => {
    const { host, platform } = storageFixture();
    const progress = makePlatform(host, 'night-shift.campaign');
    assert.equal(progress.writeCheckpoint(1, { stage: '02' }), true);
    const settings = new CampaignSettings(platform());
    assert.equal(settings.current.stickPlacement, 'center');
    assert.deepEqual(settings.current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: true, sound: true, movement: 'joystick' });
    assert.equal(settings.update({ music: false, movement: 'touch' }), true);
    assert.deepEqual(new CampaignSettings(platform()).current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: false, sound: true, movement: 'touch' });
    assert.equal(settings.update({ sound: false }), true);
    assert.deepEqual(new CampaignSettings(platform()).current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: false, sound: false, movement: 'touch' });
    assert.deepEqual(progress.readCheckpoint(1), { stage: '02' });
});

test('campaign settings reject invalid updates and recover a valid slot after a bad write', () => {
    const { host, platform, slots } = storageFixture();
    const settings = new CampaignSettings(platform());
    assert.equal(settings.update({ sound: false }), true);
    assert.equal(settings.update({ movement: 'keyboard' }), false);
    assert.equal(settings.update({ music: 'false' }), false);
    assert.equal(settings.update({ unrelated: true }), false);
    assert.equal(platform().writeCheckpoint(1, { sound: false, movement: 'joystick' }), true);
    assert.deepEqual(new CampaignSettings(platform()).current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: true, sound: false, movement: 'joystick' });
    host.localStorage.setItem = () => { throw new Error('disk full'); };
    assert.equal(settings.update({ movement: 'touch' }), false);
    assert.deepEqual(settings.current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: true, sound: false, movement: 'joystick' });
    assert.equal(slots.size, 2);
});

test('campaign settings preserve a different option saved by another instance', () => {
    const { platform } = storageFixture();
    const one = new CampaignSettings(platform());
    const two = new CampaignSettings(platform());
    assert.equal(one.update({ music: false }), true);
    assert.equal(two.update({ movement: 'touch' }), true);
    assert.deepEqual(two.current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: false, sound: true, movement: 'touch' });
});

test('legacy settings acquire centered defaults and remember custom margins across placement changes', () => {
    const { platform } = storageFixture();
    assert.ok(platform().writeCheckpoint(1, { music: false, sound: false, movement: 'touch' }));
    const settings = new CampaignSettings(platform());
    assert.deepEqual(settings.current, { ...DEFAULT_CAMPAIGN_PREFERENCES, music: false, sound: false, movement: 'touch' });
    assert.ok(settings.update({ stickPlacement: 'left', sideMargin: 48, bottomMargin: 72 }));
    assert.ok(settings.update({ stickPlacement: 'center' }));
    assert.equal(settings.update({ sideMargin: -8 }), false);
    assert.equal(settings.update({ bottomMargin: 110 }), false);
    assert.equal(settings.update({ stickPlacement: 'auto' }), false);
    assert.deepEqual(new CampaignSettings(platform()).current, { music: false, sound: false, movement: 'touch',
        stickPlacement: 'center', sideMargin: 48, bottomMargin: 72 });
});

test('Creator uses the same campaign settings module', () => {
    const readRelative = path => readFileSync(new URL(path, import.meta.url));
    assert.deepEqual(readRelative('../creator-m0/assets/scripts/platform/settings.ts'),
        readRelative('../assets/scripts/platform/settings.ts'));
});
