import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
    options: { 'require-platform': { type: 'boolean' } },
    allowPositionals: true,
});
assert.ok(positionals.length <= 1, 'Supply at most one build directory');
const root = resolve(positionals[0] ?? 'creator-m0/build/bytedance-mini-game-campaign-release');
const sceneUrl = 'db://assets/scenes/Campaign.scene';
const chapters = ['campaign-ch01', 'campaign-ch02', 'campaign-ch03', 'campaign-ch04'];
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const packageMetadata = await json(new URL('../package.json', import.meta.url));
const sceneMetadata = await json(new URL('../creator-m0/assets/scenes/Campaign.scene.meta', import.meta.url));
const project = await json(join(root, 'project.config.json'));
const settings = await json(join(root, 'src', 'settings.json'));
assert.equal(settings.CocosEngine, packageMetadata.creator.version, 'Creator version mismatch');
assert.equal(settings.engine.platform, 'bytedance-mini-game', 'Expected a Douyin Mini Game build');
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
await readFile(join(root, 'assets', 'resources', 'config.json'));

function configured(value) { return typeof value === 'string' && value.trim().length > 0; }
function isTestIdentity(value) { return !configured(value) || value.trim().toLowerCase() === 'testappid'; }
const expectedAppId = process.env.NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID?.trim();
const placeholder = isTestIdentity(project.appid);
const matched = !placeholder && !!expectedAppId && project.appid === expectedAppId;
const adConfigured = configured(campaign.reviveAdUnitId);
const cloudCount = Number(configured(campaign.cloudEnvId)) + Number(configured(campaign.cloudServiceId));
if (values['require-platform']) {
    assert.ok(!isTestIdentity(expectedAppId), 'Set NIGHT_SHIFT_EXPECTED_DOUYIN_APP_ID to the intended real AppID');
    assert.ok(matched, 'Built AppID is a placeholder or does not match the expected AppID');
    assert.ok(adConfigured, 'Built campaign scene has no rewarded ad unit');
    assert.equal(cloudCount, 2, 'Built campaign scene must specify both cloud environment and service IDs');
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
// Required by the fixed Creator 3.8 campaign bootstrap and Douyin's declared package entrypoints.
const requiredScripts = new Set([
    'game.js', 'application.js', 'web-adapter.js', 'engine-adapter.js', 'cocos-js/cc.js',
    'src/import-map.js', 'src/polyfills.bundle.js', 'src/system.bundle.js',
    'assets/main/index.js', 'assets/resources/index.js',
]);
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
    fingerprint.update(relative + '\0' + data.length + '\0').update(data);
    const bundle = game.subpackages.find(entry => relative.startsWith(entry.root));
    if (bundle) subpackages[bundle.name] += data.length;
    else main += data.length;
    total += data.length;
}
assert.ok(requiredScripts.size === 0, `Missing runtime script: ${Array.from(requiredScripts).join(', ')}`);
assert.ok(requiredImages.size === 0, `Missing chapter image: ${Array.from(requiredImages).join(', ')}`);
assert.ok(main <= 4_000_000, `Main package is ${main} bytes`);
assert.ok(total <= 20_000_000, `Total package is ${total} bytes`);

console.log(JSON.stringify({
    packageSha256: fingerprint.digest('hex'),
    creator: settings.CocosEngine,
    launchScene: sceneUrl,
    main,
    total,
    subpackages,
    platformConfiguration: {
        appId: placeholder ? 'test-preview' : matched ? 'matches-expected' : 'unverified',
        rewardedAd: adConfigured ? 'configured' : 'missing',
        cloud: ['missing', 'partial', 'configured'][cloudCount],
        liveValidation: 'not-run',
    },
}, null, 2));
