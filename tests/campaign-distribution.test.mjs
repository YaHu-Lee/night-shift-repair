import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-campaign-distribution.mjs', import.meta.url));
const sceneId = JSON.parse(readFileSync(new URL('../creator-m0/assets/scenes/Campaign.scene.meta', import.meta.url), 'utf8')).uuid;
const scenePath = `assets/main/import/${sceneId.slice(0, 2)}/${sceneId}.json`;
const bootstrapId = '88fab2fqLNHgppW+nMRcIXb';
const sceneUrl = 'db://assets/scenes/Campaign.scene';
const imageUuid = '0c57fc78-efd5-44dd-b6dd-6b8ebf4dfef4';
const compactImageUuid = '0cV/x479VE3bbda46/Tf70';
const imagePath = 'native/0c/' + imageUuid + '.jpg';
const audioManifest = JSON.parse(readFileSync(new URL('../art/workshop/campaign-audio.json', import.meta.url), 'utf8'));
const audioClips = [...audioManifest.clips, ...audioManifest.scores, ...audioManifest.effects];
const nativeAudioPath = clip => 'assets/resources/native/' + clip.creatorUuid.slice(0, 2) + '/'
    + clip.creatorUuid + extname(clip.file);
const resources = {
    name: 'resources', nativeBase: 'native', types: ['cc.AudioClip'],
    uuids: audioClips.map(clip => clip.creatorUuid),
    paths: Object.fromEntries(audioClips.map((clip, index) => [index, [clip.runtimePath, 0, 1]])),
};

function fixture(t, platform = 'douyin') {
    const home = realpathSync(tmpdir());
    const root = mkdtempSync(join(home, 'night-shift-distribution-'));
    t.after(() => {
        assert.equal(dirname(realpathSync(root)), home);
        rmSync(root, { recursive: true, force: true });
    });
    const putText = (name, data) => {
        const file = join(root, name);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, data);
    };
    const put = (name, data) => putText(name, JSON.stringify(data));
    const scriptFiles = ['game.js', 'application.js', 'web-adapter.js', 'engine-adapter.js', 'cocos-js/cc.js',
        'src/import-map.js', 'src/polyfills.bundle.js', 'src/system.bundle.js', 'assets/main/index.js', 'assets/resources/index.js'];
    if (platform === 'wechat') scriptFiles.push('first-screen.js');
    for (const file of scriptFiles) putText(file, '/* fixture runtime */\n');
    const packages = [1, 2, 3, 4].map(n => ({ name: `campaign-ch0${n}`, root: `subpackages/campaign-ch0${n}/` }));
    for (const pack of packages) {
        put(pack.root + 'config.json', {
            name: pack.name, nativeBase: 'native', uuids: [compactImageUuid],
            types: ['cc.ImageAsset'], paths: { 0: ['chapter-cover', 0, 1] },
        });
        putText(pack.root + 'game.js', '/* fixture subpackage runtime */\n');
        putText(pack.root + imagePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
    }
    put('game.json', { deviceOrientation: 'portrait', subpackages: packages });
    put('project.config.json', { appid: platform === 'wechat' ? 'wx6ac3f5090a6b99c5' : 'testAppId' });
    put('src/settings.json', { CocosEngine: '3.8.8', engine: { platform: platform === 'wechat' ? 'wechatgame' : 'bytedance-mini-game', debug: false },
        launch: { launchScene: sceneUrl }, screen: { designResolution: { width: 360, height: 640 } } });
    put('assets/main/config.json', { importBase: 'import', scenes: { [sceneUrl]: 0 }, uuids: [sceneId] });
    put('assets/resources/config.json', resources);
    for (const clip of audioClips) putText(nativeAudioPath(clip), readFileSync(new URL('../' + clip.file, import.meta.url)));
    const scene = (values = []) => put(scenePath, [
        1, 0, 0, [[bootstrapId, ['campaignMode', 'fullRun', 'reviveAdUnitId', 'cloudEnvId', 'cloudServiceId', 'wechatReviveAdUnitId']]],
        [[0, ...Array.from({ length: 2 + values.length }, (_, n) => n), 3 + values.length]],
        [[[0, true, true, ...values]]],
    ]);
    scene();
    const run = ({ strict = false, appId = '', expectedPlatform } = {}) => spawnSync(process.execPath,
        [script, root, ...(strict ? ['--require-platform'] : []), ...(expectedPlatform ? ['--platform', expectedPlatform] : [])], {
            encoding: 'utf8',
            env: { ...process.env, NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID: platform === 'douyin' ? appId : '',
                NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID: platform === 'wechat' ? appId : '' },
        });
    return { run, put, putText, scene, remove: name => unlinkSync(join(root, name)) };
}

test('release report fingerprints the actual bytes and distinguishes emulator preview', t => {
    const { run, put } = fixture(t);
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const result = JSON.parse(first.stdout);
    assert.deepEqual(result.platformConfiguration,
        { appId: 'test-preview', rewardedAd: 'missing', cloud: 'missing', liveValidation: 'not-run' });
    assert.match(result.packageSha256, /^[0-9a-f]{64}$/);
    assert.equal(JSON.parse(run().stdout).packageSha256, result.packageSha256);
    put('assets/resources/config.json', { ...resources, changed: true });
    assert.notEqual(JSON.parse(run().stdout).packageSha256, result.packageSha256);
});

test('release validation accepts Creator omitting default values on the actual bootstrap class', t => {
    const { run, put } = fixture(t, 'wechat');
    put(scenePath, [1, 0, ['node'], [[bootstrapId, ['node'], 3, 1]], [[0, 0, 1]], [[[0, -1]]]]);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).platformConfiguration.rewardedAd, 'missing');

    put(scenePath, [1, 0, ['node'], [[bootstrapId, ['campaignMode', 'node'], 2, 1]], [[0, 0, 1, 2]], [[[0, false, -1]]]]);
    assert.match(run().stderr, /Campaign startup component is disabled/);

    put(scenePath, [1, 0, 0, [['OtherComponent', ['campaignMode', 'fullRun']]], [[0, 0, 1, 3]], [[[0, true, true]]]]);
    assert.match(run().stderr, /Expected exactly one campaign component/);
});

test('strict platform check requires the expected AppID and compiled feature fields without echoing identifiers', t => {
    const { run, put, scene } = fixture(t);
    const appId = 'ttFixtureAppId';
    assert.match(run({ strict: true, appId }).stderr, /placeholder or does not match/);
    put('project.config.json', { appid: appId });
    assert.match(run({ strict: true }).stderr, /NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID/);
    assert.match(run({ strict: true, appId }).stderr, /no rewarded ad unit/);
    scene(['', '', '', 'adunit-0123456789abcdef']);
    assert.match(run({ strict: true, appId }).stderr, /no rewarded ad unit for douyin/);
    scene(['fixture-ad-unit', 'fixture-cloud-env']);
    assert.match(run({ strict: true, appId }).stderr, /both cloud environment and service IDs/);
    scene(['fixture-ad-unit', 'fixture-cloud-env', 'fixture-cloud-service']);
    const matched = run({ strict: true, appId });
    assert.equal(matched.status, 0, matched.stderr);
    assert.match(matched.stdout, /matches-expected/);
    assert.match(matched.stdout, /not-run/);
    for (const id of [appId, 'fixture-ad-unit', 'fixture-cloud-env', 'fixture-cloud-service']) {
        assert.equal(matched.stdout.includes(id), false);
    }
    const wrong = run({ strict: true, appId: 'ttOtherFixture' });
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /does not match/);
    assert.equal(wrong.stderr.includes(appId), false);
});

test('WeChat validates its own AppID, ad unit and bootstrap independently of Douyin', t => {
    const { run, put, remove, scene } = fixture(t, 'wechat');
    const preview = run();
    assert.equal(preview.status, 0, preview.stderr);
    const report = JSON.parse(preview.stdout);
    assert.equal(report.platform, 'wechat');
    assert.deepEqual(report.platformConfiguration,
        { appId: 'test-preview', rewardedAd: 'missing', cloud: 'not-applicable', liveValidation: 'not-run' });
    assert.match(run({ expectedPlatform: 'douyin' }).stderr, /Expected the douyin Mini Game build/);
    assert.match(run({ strict: true, appId: 'wx6ac3f5090a6b99c5' }).stderr, /NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID/);
    const appId = 'wx0123456789abcdef';
    put('project.config.json', { appid: appId });
    assert.match(run({ strict: true }).stderr, /NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID/);
    scene(['douyin-ad-clock', '', '']);
    assert.match(run({ strict: true, appId }).stderr, /no rewarded ad unit for wechat/);
    scene(['douyin-ad-clock', '', '', 'adunit-0123456789abcdef']);
    const matched = run({ strict: true, appId, expectedPlatform: 'wechat' });
    assert.equal(matched.status, 0, matched.stderr);
    assert.deepEqual(JSON.parse(matched.stdout).platformConfiguration,
        { appId: 'matches-expected', rewardedAd: 'configured', cloud: 'not-applicable', liveValidation: 'not-run' });
    assert.doesNotMatch(matched.stdout, /0123456789abcdef|douyin-ad-clock/);
    remove('first-screen.js');
    assert.match(run().stderr, /Missing runtime script: first-screen\.js/);
});

test('the same subpackage bytes respect each platform total cap', t => {
    const wechat = fixture(t, 'wechat');
    const douyin = fixture(t);
    const largeChapter = Buffer.alloc(21_000_000);
    const chapterFile = 'subpackages/campaign-ch01/native/asset.bin';
    wechat.putText(chapterFile, largeChapter);
    douyin.putText(chapterFile, largeChapter);
    const accepted = wechat.run();
    assert.equal(accepted.status, 0, accepted.stderr);
    assert.match(douyin.run().stderr, /Total package is \d+ bytes/);
});

test('distribution check rejects a debug build even with correct orientation and partitions', t => {
    const { run, put } = fixture(t);
    put('src/settings.json', { CocosEngine: '3.8.8', engine: { platform: 'bytedance-mini-game', debug: true },
        launch: { launchScene: sceneUrl }, screen: { designResolution: { width: 360, height: 640 } } });
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /non-debug campaign release build/);
});

test('distribution check rejects absent or empty main and chapter runtime scripts', t => {
    const { run, putText, remove } = fixture(t);
    remove('game.js');
    let result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing runtime script: game\.js/);

    putText('game.js', '/* restored main entry */\n');
    putText('src/system.bundle.js', ' \n');
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Empty runtime script: src\/system\.bundle\.js/);

    putText('src/system.bundle.js', '/* restored Cocos runtime */\n');
    remove('subpackages/campaign-ch02/game.js');
    result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing runtime script: subpackages\/campaign-ch02\/game\.js/);
});

test('distribution check follows the startup scene index in Cocos bundle metadata', t => {
    const { run, put } = fixture(t);
    const config = 'assets/main/config.json';
    const compactSceneId = '7fNzMmOVFEsJOXup0IYmBw';
    put(config, { importBase: 'import', scenes: { [sceneUrl]: 0 }, uuids: [compactSceneId] });
    assert.equal(run().status, 0);
    put(config, { importBase: 'import', scenes: { [sceneUrl]: 1 }, uuids: [compactSceneId, imageUuid] });
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Startup scene UUID does not match Campaign/);
});

test('distribution check rejects a missing native image declared by a chapter bundle', t => {
    const { run, remove } = fixture(t);
    remove('subpackages/campaign-ch04/' + imagePath);
    const result = run();
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing chapter image: subpackages\/campaign-ch04\/native\//);
});

test('the chapter mechanic atlas uses an alpha-capable PNG', t => {
    const { run, put, putText } = fixture(t);
    const atlas = readFileSync(new URL('../art/pixel/characters/mechanic/candidate/mechanic-atlas.png', import.meta.url));
    const folder = 'subpackages/campaign-ch01/';
    const pngPath = folder + 'native/0c/' + imageUuid + '.png';
    put(folder + 'config.json', {
        name: 'campaign-ch01', nativeBase: 'native', uuids: [compactImageUuid],
        types: ['cc.ImageAsset'], paths: { 0: ['pixel/mechanic/mechanic-atlas', 0, 1] },
    });
    assert.match(run().stderr, /Missing chapter image: .*\.png/);
    putText(pngPath, 'wrong file');
    assert.match(run().stderr, /Invalid chapter PNG/);
    putText(pngPath, atlas);
    const result = run();
    assert.equal(result.status, 0, result.stderr);
});

test('distribution check rejects a missing or stale built combat score', t => {
    const { run, remove, putText } = fixture(t);
    const combatScore = audioManifest.scores.find(clip => clip.id === 'live-circuit');
    const path = nativeAudioPath(combatScore);
    remove(path);
    assert.match(run().stderr, /Missing campaign audio: assets\/resources\/native\//);
    putText(path, 'stale score');
    assert.match(run().stderr, /Mismatched campaign audio: assets\/resources\/native\//);
});
