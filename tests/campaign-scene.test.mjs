import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const dir = 'creator-m0/';

test('campaign portrait build has its own scene UUID and preserves M2 settings', () => {
    const build = json(dir + 'build-campaign.json');
    const scene = json(dir + 'assets/scenes/Campaign.scene');
    const m2 = json(dir + 'assets/scenes/M2.scene');
    const meta = json(dir + 'assets/scenes/Campaign.scene.meta');
    const m2Meta = json(dir + 'assets/scenes/M2.scene.meta');
    assert.notEqual(meta.uuid, m2Meta.uuid);
    assert.equal(build.startScene, meta.uuid);
    assert.deepEqual(build.scenes, [{ url: 'db://assets/scenes/Campaign.scene', uuid: meta.uuid }]);
    assert.equal(build.platform, 'bytedance-mini-game');
    assert.equal(build.packages['bytedance-mini-game'].orientation, 'portrait');
    assert.equal(scene.find(item => item?.campaignMode === true)?.fullRun, true);
    assert.equal(m2.some(item => item?.campaignMode === true), false);
});

test('Creator copies and logic test copies match for the campaign', () => {
    for (const path of ['campaign/Campaign.ts', 'cocos/M1Bootstrap.ts', 'm1/Battle.ts',
        'm1/Run.ts', 'm1/content.ts', 'platform/platform.ts']) {
        assert.equal(read('assets/scripts/' + path), read(dir + 'assets/scripts/' + path), path);
    }
});
