import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const dir = 'creator-m0/';
const chapters = ['campaign-ch01', 'campaign-ch02', 'campaign-ch03', 'campaign-ch04'];

function listTs(root, prefix = '') {
    const out = [];
    for (const entry of readdirSync(join(root, prefix), { withFileTypes: true })) {
        const rel = prefix ? prefix + '/' + entry.name : entry.name;
        if (entry.isDirectory()) out.push(...listTs(root, rel));
        else if (entry.name.endsWith('.ts')) out.push(rel);
    }
    return out.sort();
}

test('Campaign.scene is the sole portrait startup scene across all active build presets', () => {
    const scene = json(dir + 'assets/scenes/Campaign.scene');
    const meta = json(dir + 'assets/scenes/Campaign.scene.meta');
    assert.equal(scene.find(item => item?.__type__ === 'cc.Scene')?._id, meta.uuid);
    assert.equal(scene.find(item => item?.campaignMode === true)?.fullRun, true);
    assert.equal(scene.some(item => item?.prototypeArt === true), false);

    const presets = [
        'build-campaign-web.json',
        'build-campaign-web-playtest.json',
        'build-campaign-release.json',
        'build-campaign-wechat-release.json',
    ];
    for (const name of presets) {
        const preset = json(dir + name);
        assert.equal(preset.startScene, meta.uuid, name);
        assert.deepEqual(preset.scenes, [{ url: 'db://assets/scenes/Campaign.scene', uuid: meta.uuid }], name);
        assert.deepEqual(preset.bundleConfigs.map(b => b.name), ['resources', ...chapters], name);
        assert.equal(preset.engineModulesConfigKey, 'nightShift2D', name);
    }
    assert.equal(json(dir + 'build-campaign-release.json').debug, false);
    assert.equal(json(dir + 'build-campaign-wechat-release.json').debug, false);
    assert.equal(json(dir + 'build-campaign-web-playtest.json').debug, false);

    const profile = json(dir + 'settings/v2/packages/builder.json').bundleConfig.custom['campaign-local-chapter'];
    assert.equal(profile.configs.miniGame.fallbackOptions.compressionType, 'subpackage');
    assert.equal(profile.configs.web.fallbackOptions.compressionType, 'merge_dep');
    for (const name of chapters) {
        const bMeta = json(dir + 'assets/campaign-content/' + name + '.meta');
        assert.equal(bMeta.userData.isBundle, true);
        assert.equal(bMeta.userData.bundleName, name);
        assert.equal(bMeta.userData.bundleConfigID, 'campaign-local-chapter');
    }
});

test('every TypeScript file in assets/scripts matches its Creator mirror and has a .meta file', () => {
    const srcRoot = fileURLToPath(new URL('../assets/scripts', import.meta.url));
    const creatorRoot = fileURLToPath(new URL('../creator-m0/assets/scripts', import.meta.url));
    const srcFiles = listTs(srcRoot);
    const creatorFiles = listTs(creatorRoot);
    assert.deepEqual(creatorFiles, srcFiles);
    for (const rel of srcFiles) {
        assert.equal(read('assets/scripts/' + rel), read(dir + 'assets/scripts/' + rel), rel);
        const meta = json(dir + 'assets/scripts/' + rel + '.meta');
        assert.equal(meta.importer, 'typescript', rel);
    }
});
