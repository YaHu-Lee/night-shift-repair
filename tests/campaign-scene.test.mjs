import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const json = path => JSON.parse(read(path));
const dir = 'creator-m0/';
const chapters = ['campaign-ch01', 'campaign-ch02', 'campaign-ch03', 'campaign-ch04'];

test('campaign portrait build has its own scene UUID and preserves M2 settings', () => {
    const build = json(dir + 'build-campaign.json');
    const scene = json(dir + 'assets/scenes/Campaign.scene');
    const m2 = json(dir + 'assets/scenes/M2.scene');
    const meta = json(dir + 'assets/scenes/Campaign.scene.meta');
    const m2Meta = json(dir + 'assets/scenes/M2.scene.meta');
    assert.notEqual(meta.uuid, m2Meta.uuid);
    assert.equal(scene.find(item => item?.__type__ === 'cc.Scene')?._id, meta.uuid);
    assert.equal(build.startScene, meta.uuid);
    const scenes = ['Campaign', 'M1', 'M2'].map(name => ({
        url: 'db://assets/scenes/' + name + '.scene',
        uuid: json(dir + 'assets/scenes/' + name + '.scene.meta').uuid,
    }));
    for (const preset of [build, json(dir + 'build-campaign-web.json')]) {
        assert.equal(preset.startScene, meta.uuid);
        assert.deepEqual(preset.scenes, scenes);
    }
    assert.equal(build.platform, 'bytedance-mini-game');
    assert.equal(build.packages['bytedance-mini-game'].orientation, 'portrait');
    assert.equal(scene.find(item => item?.campaignMode === true)?.fullRun, true);
    assert.equal(scene.some(item => item?.prototypeArt === true), false);
    const prototype = json(dir + 'assets/scenes/Campaign3D.scene');
    const prototypeId = json(dir + 'assets/scenes/Campaign3D.scene.meta').uuid;
    assert.notEqual(prototypeId, meta.uuid);
    assert.equal(prototype.find(item => item?.campaignMode === true)?.prototypeArt, true);
    for (const name of ['build-campaign-3d-prototype', 'build-campaign-douyin-3d-preview', 'build-campaign-wechat-3d-preview']) {
        const preview = json(dir + name + '.json');
        assert.equal(preview.startScene, prototypeId);
        assert.deepEqual(preview.scenes[0], { url: 'db://assets/scenes/Campaign3D.scene', uuid: prototypeId });
    }
    assert.equal(m2.some(item => item?.campaignMode === true), false);
});

test('chapter bundles keep startup art available and both release candidates disable debug', () => {
    const release = json(dir + 'build-campaign-release.json');
    assert.equal(release.debug, false);
    assert.deepEqual(release.scenes.map(scene => scene.uuid), [release.startScene]);
    const review = json(dir + 'build-campaign-web.json');
    const playtest = json(dir + 'build-campaign-web-playtest.json');
    assert.equal(playtest.debug, false);
    assert.deepEqual(playtest.scenes, release.scenes);
    assert.equal(playtest.startScene, release.startScene);
    assert.equal(playtest.platform, 'web-mobile');
    assert.equal(playtest.packages['web-mobile'].orientation, 'portrait');
    assert.notEqual(playtest.outputName, review.outputName);
    assert.deepEqual(playtest.bundleConfigs, review.bundleConfigs);
    const profile = json(dir + 'settings/v2/packages/builder.json').bundleConfig.custom['campaign-local-chapter'];
    assert.equal(profile.configs.miniGame.fallbackOptions.compressionType, 'subpackage');
    assert.equal(profile.configs.web.fallbackOptions.compressionType, 'merge_dep');
    for (const name of [...chapters]) {
        const meta = json(dir + 'assets/campaign-content/' + name + '.meta');
        assert.equal(meta.userData.isBundle, true);
        assert.equal(meta.userData.bundleName, name);
        assert.equal(meta.userData.bundleConfigID, 'campaign-local-chapter');
    }
    for (const name of ['build-campaign', 'build-campaign-web', 'build-campaign-web-playtest', 'build-campaign-release']) {
        const preset = json(dir + name + '.json');
        assert.deepEqual(preset.bundleConfigs.map(bundle => bundle.name), ['resources', ...chapters]);
        assert.equal(preset.engineModulesConfigKey, 'nightShift2D');
        assert.deepEqual(preset.bundleConfigs[0].bundleFilterConfig, [{ range: 'exclude', type: 'url',
            patchOption: { patchType: 'beginWith', value: 'db://assets/resources/prototype3d/' } }]);
    }
});

test('Creator copies and logic test copies match for the campaign', () => {
    for (const path of ['campaign/Campaign.ts', 'cocos/M1Bootstrap.ts', 'm1/Battle.ts',
        'm1/Run.ts', 'm1/content.ts', 'platform/platform.ts', 'campaign/CampaignArt.ts',
        'cocos/CampaignAssetLoader.ts', 'cocos/BattleSkinView.ts', 'cocos/CampaignCombatView.ts',
        'cocos/CampaignMapView.ts', 'cocos/CampaignLobbyView.ts', 'cocos/WorkshopBench.ts', 'cocos/SkillEffectsView.ts']) {
        assert.equal(read('assets/scripts/' + path), read(dir + 'assets/scripts/' + path), path);
    }
});
