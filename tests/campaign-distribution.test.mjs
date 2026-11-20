import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-campaign-distribution.mjs', import.meta.url));
const sceneId = JSON.parse(readFileSync(new URL('../creator-m0/assets/scenes/Campaign.scene.meta', import.meta.url), 'utf8')).uuid;
const sceneUrl = 'db://assets/scenes/Campaign.scene';
const imageUuid = '0c57fc78-efd5-44dd-b6dd-6b8ebf4dfef4';
const compactImageUuid = '0cV/x479VE3bbda46/Tf70';
const imagePath = 'native/0c/' + imageUuid + '.jpg';

function fixture(t) {
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
    put('project.config.json', { appid: 'testAppId' });
    put('src/settings.json', { CocosEngine: '3.8.8', engine: { platform: 'bytedance-mini-game', debug: false },
        launch: { launchScene: sceneUrl }, screen: { designResolution: { width: 360, height: 640 } } });
    put('assets/main/config.json', { importBase: 'import', scenes: { [sceneUrl]: 0 }, uuids: [sceneId] });
    put('assets/resources/config.json', { name: 'resources' });
    const scene = (values = []) => put(`assets/main/import/${sceneId.slice(0, 2)}/${sceneId}.json`, [
        1, 0, 0, [['TestComponent', ['campaignMode', 'fullRun', 'reviveAdUnitId', 'cloudEnvId', 'cloudServiceId']]],
        [[0, ...Array.from({ length: 2 + values.length }, (_, n) => n), 3 + values.length]],
        [[[0, true, true, ...values]]],
    ]);
    scene();
    const run = ({ strict = false, appId = '' } = {}) => spawnSync(process.execPath,
        [script, root, ...(strict ? ['--require-platform'] : [])], {
            encoding: 'utf8',
            env: { ...process.env, NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID: appId },
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
    put('assets/resources/config.json', { name: 'resources', changed: true });
    assert.notEqual(JSON.parse(run().stdout).packageSha256, result.packageSha256);
});

test('strict platform check requires the expected AppID and compiled feature fields without echoing identifiers', t => {
    const { run, put, scene } = fixture(t);
    const appId = 'ttFixtureAppId';
    assert.match(run({ strict: true, appId }).stderr, /placeholder or does not match/);
    put('project.config.json', { appid: appId });
    assert.match(run({ strict: true }).stderr, /NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID/);
    assert.match(run({ strict: true, appId }).stderr, /no rewarded ad unit/);
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
