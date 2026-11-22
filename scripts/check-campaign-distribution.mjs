import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
    options: { platform: { type: 'string' }, 'require-platform': { type: 'boolean' } },
    allowPositionals: true,
});
assert.ok(positionals.length <= 1, 'Supply at most one build directory');
const targets = {
    douyin: { engine: 'bytedance-mini-game', appIdEnv: 'NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID', adField: 'reviveAdUnitId', cloud: true, total: 20_000_000 },
    wechat: { engine: 'wechatgame', appIdEnv: 'NIGHT_SHIFT_EXPECTED_WECHAT_APP_ID', adField: 'wechatReviveAdUnitId', cloud: false, total: 30_000_000 },
};
const requested = values.platform ?? (positionals.length ? undefined : 'douyin');
assert.ok(requested === undefined || Object.hasOwn(targets, requested), 'Specify --platform wechat or --platform douyin');
const root = resolve(positionals[0] ?? `creator-m0/build/${targets[requested].engine}-campaign-release`);
const sceneUrl = 'db://assets/scenes/Campaign.scene';
const chapters = ['campaign-ch01', 'campaign-ch02', 'campaign-ch03', 'campaign-ch04'];
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const packageMetadata = await json(new URL('../package.json', import.meta.url));
const sceneMetadata = await json(new URL('../creator-m0/assets/scenes/Campaign.scene.meta', import.meta.url));
const audioManifest = await json(new URL('../art/workshop/campaign-audio.json', import.meta.url));
const project = await json(join(root, 'project.config.json'));
const settings = await json(join(root, 'src', 'settings.json'));
const platform = requested ?? Object.keys(targets).find(key => targets[key].engine === settings.engine.platform);
const target = targets[platform];
assert.ok(target, 'Expected a WeChat or Douyin Mini Game build');
assert.equal(settings.CocosEngine, packageMetadata.creator.version, 'Creator version mismatch');
assert.equal(settings.engine.platform, target.engine, `Expected the ${platform} Mini Game build`);
assert.equal(settings.engine.debug, false, 'Use the non-debug campaign release build');
assert.equal(settings.launch.launchScene, sceneUrl, 'Campaign must be the startup scene');
assert.equal(settings.screen.designResolution.width, 360);
assert.equal(settings.screen.designResolution.height, 640);

const game = await json(join(root, 'game.json'));
assert.equal(game.deviceOrientation, 'portrait');
assert.deepEqual(game.subpackages.map(bundle => bundle.name).sort(), chapters);

// Creator releases store the first UUID byte as hex and the remaining 15 bytes as Base64.
function decodeAssetUuid(uuid) {
    if (typeof uuid !== 'string' || !/^[a-f0-9]{2}[A-Za-z0-9+/]{20}$/.test(uuid)) return uuid;
    const hex = uuid.slice(0, 2) + Buffer.from(uuid.slice(2), 'base64').toString('hex');
    return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function versionSuffix(entries = [], index, uuid) {
    for (let i = 0; i < entries.length; i += 2) {
        const key = entries[i];
        if (key === index || key === String(index) || decodeAssetUuid(key) === uuid) {
            assert.match(entries[i + 1], /^[a-f0-9]+$/, 'Invalid Creator asset version');
            return '.' + entries[i + 1];
        }
    }
    return '';
}

// Cocos 3.8 scene files use shared class property lists, masks and instance rows.
function campaignProperties(scene) {
    if (Array.isArray(scene)) {
        const editable = scene.find(entry => entry?.campaignMode === true);
        if (editable) return editable;
    }
    const [version, , , classes, masks, instances] = scene;
    assert.ok(version === 1 && Array.isArray(classes) && Array.isArray(masks) && Array.isArray(instances),
        'Unsupported compiled campaign scene format');
    const candidates = [];
    function visit(row) {
        if (!Array.isArray(row)) return;
        const mask = masks[row[0]];
        const keys = classes[mask?.[0]]?.[1];
        if (Array.isArray(keys) && keys.includes('campaignMode') && row.length === mask.length - 1) {
            const simpleEnd = mask.at(-1);
            const properties = {};
            for (let index = 1; index < simpleEnd; index++) properties[keys[mask[index]]] = row[index];
            if (properties.campaignMode === true) candidates.push(properties);
        }
        row.forEach(visit);
    }
    visit(instances);
    assert.equal(candidates.length, 1, 'Expected exactly one campaign component in the built scene');
    return candidates[0];
}

const mainConfig = await json(join(root, 'assets', 'main', 'config.json'));
assert.deepEqual(Object.keys(mainConfig.scenes), [sceneUrl], 'Release bundle must contain only the campaign scene');
assert.equal(mainConfig.importBase, 'import', 'Unexpected campaign scene import directory');
const sceneIndex = mainConfig.scenes[sceneUrl];
const sceneId = sceneMetadata.uuid;
assert.equal(decodeAssetUuid(mainConfig.uuids?.[sceneIndex]), sceneId, 'Startup scene UUID does not match Campaign');
const sceneSuffix = versionSuffix(mainConfig.versions?.import, sceneIndex, sceneId);
const scene = await json(join(root, 'assets', 'main', 'import', sceneId.slice(0, 2), sceneId + sceneSuffix + '.json'));
const campaign = campaignProperties(scene);
assert.equal(campaign.fullRun, true, 'Campaign startup component is not enabled for a full run');
const resources = await json(join(root, 'assets', 'resources', 'config.json'));
assert.equal(resources.nativeBase, 'native', 'Unexpected campaign audio native directory');
const builtAudio = new Map(Object.entries(resources.paths ?? {})
    .filter(([, entry]) => resources.types?.[entry?.[1]] === 'cc.AudioClip')
    .map(([index, [key]]) => [key, Number(index)]));
const requiredAudio = new Map();
for (const clip of [...audioManifest.clips, ...audioManifest.scores, ...audioManifest.effects]) {
    const index = builtAudio.get(clip.runtimePath);
    const uuid = decodeAssetUuid(resources.uuids?.[index]);
    assert.equal(uuid, clip.creatorUuid, 'Missing or mismatched campaign audio import: ' + clip.runtimePath);
    const version = versionSuffix(resources.versions?.native, index, uuid);
    requiredAudio.set('assets/resources/native/' + uuid.slice(0, 2) + '/' + uuid + version + extname(clip.file), clip.sha256);
}

function configured(value) { return typeof value === 'string' && value.trim().length > 0; }
function isTestIdentity(value) {
    return !configured(value) || ['testappid', 'touristappid', 'wx6ac3f5090a6b99c5'].includes(value.trim().toLowerCase());
}
const expectedAppId = process.env[target.appIdEnv]?.trim();
const placeholder = isTestIdentity(project.appid);
const validAppId = platform === 'wechat' ? /^wx[0-9a-f]{16}$/i : /^tt[a-z0-9]+$/i;
const matched = !placeholder && validAppId.test(project.appid) && project.appid === expectedAppId;
const adUnit = campaign[target.adField];
const adConfigured = configured(adUnit) && (platform === 'douyin' || /^adunit-[a-z0-9]+$/i.test(adUnit));
const cloudCount = target.cloud ? Number(configured(campaign.cloudEnvId)) + Number(configured(campaign.cloudServiceId)) : undefined;
if (values['require-platform']) {
    assert.ok(!isTestIdentity(expectedAppId) && validAppId.test(expectedAppId), `Set ${target.appIdEnv} to the intended real AppID`);
    assert.ok(matched, 'Built AppID is a placeholder or does not match the expected AppID');
    assert.ok(adConfigured, `Built campaign scene has no rewarded ad unit for ${platform}`);
    if (target.cloud) assert.equal(cloudCount, 2, 'Built campaign scene must specify both cloud environment and service IDs');
}

async function* filesUnder(directory, prefix = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    for (const entry of entries) {
        const path = join(directory, entry.name);
        const relative = prefix + entry.name;
        if (entry.isDirectory()) {
            yield* filesUnder(path, relative + '/');
        } else {
            assert.ok(entry.isFile(), 'Build must contain regular files');
            yield { path, relative };
        }
    }
}

const subpackages = {};
const requiredImages = new Set();
// Required by the fixed Creator 3.8 campaign bootstrap.
const requiredScripts = new Set([
    'game.js', 'application.js', 'web-adapter.js', 'engine-adapter.js', 'cocos-js/cc.js',
    'src/import-map.js', 'src/polyfills.bundle.js', 'src/system.bundle.js',
    'assets/main/index.js', 'assets/resources/index.js',
]);
if (platform === 'wechat') requiredScripts.add('first-screen.js');
for (const { name, root: directory } of game.subpackages) {
    assert.equal(directory, `subpackages/${name}/`);
    const path = join(root, directory);
    const config = await json(join(path, 'config.json'));
    assert.equal(config.name, name);
    assert.equal(config.nativeBase, 'native', 'Unexpected native directory for ' + name);
    const chapterImages = Object.entries(config.paths ?? {})
        .filter(([, entry]) => config.types?.[entry?.[1]] === 'cc.ImageAsset');
    assert.ok(chapterImages.length > 0, 'Chapter config declares no images: ' + name);
    for (const [index, [key]] of chapterImages) {
        const uuid = decodeAssetUuid(config.uuids?.[index]);
        assert.match(uuid, uuidPattern, 'Invalid image UUID for ' + name + '/' + key);
        const version = versionSuffix(config.versions?.native, Number(index), uuid);
        requiredImages.add(directory + 'native/' + uuid.slice(0, 2) + '/' + uuid + version + '.jpg');
    }
    subpackages[name] = 0;
    requiredScripts.add(directory + 'game.js');
}

const fingerprint = createHash('sha256');
let main = 0;
let total = 0;
for await (const { path, relative } of filesUnder(root)) {
    const data = await readFile(path);
    if (requiredScripts.delete(relative)) {
        assert.ok(data.toString('utf8').trim(), `Empty runtime script: ${relative}`);
    }
    if (requiredImages.delete(relative)) {
        assert.ok(data[0] === 0xff && data[1] === 0xd8, `Invalid chapter JPEG: ${relative}`);
    }
    if (requiredAudio.has(relative)) {
        assert.equal(createHash('sha256').update(data).digest('hex'), requiredAudio.get(relative), `Mismatched campaign audio: ${relative}`);
        requiredAudio.delete(relative);
    }
    fingerprint.update(relative + '\0' + data.length + '\0').update(data);
    const bundle = game.subpackages.find(entry => relative.startsWith(entry.root));
    if (bundle) subpackages[bundle.name] += data.length;
    else main += data.length;
    total += data.length;
}
assert.ok(requiredScripts.size === 0, `Missing runtime script: ${Array.from(requiredScripts).join(', ')}`);
assert.ok(requiredImages.size === 0, `Missing chapter image: ${Array.from(requiredImages).join(', ')}`);
assert.ok(requiredAudio.size === 0, `Missing campaign audio: ${Array.from(requiredAudio.keys()).join(', ')}`);
assert.ok(main <= 4_000_000, `Main package is ${main} bytes`);
assert.ok(total <= target.total, `Total package is ${total} bytes`);

console.log(JSON.stringify({
    packageSha256: fingerprint.digest('hex'),
    creator: settings.CocosEngine,
    platform,
    launchScene: sceneUrl,
    main,
    total,
    subpackages,
    platformConfiguration: {
        appId: placeholder ? 'test-preview' : matched ? 'matches-expected' : 'unverified',
        rewardedAd: adConfigured ? 'configured' : 'missing',
        cloud: target.cloud ? ['missing', 'partial', 'configured'][cloudCount] : 'not-applicable',
        liveValidation: 'not-run',
    },
}, null, 2));
