import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../assets/scripts/cocos/CampaignAssetLoader.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} });
const flush = () => new Promise(resolve => setImmediate(resolve));

function makeTexture(refCount = 0) {
    return {
        refCount,
        releaseAttempts: 0,
        addRef() { this.refCount++; },
        decRef() {
            assert.ok(this.refCount > 0);
            this.refCount--;
            this.releaseAttempts++;
        },
    };
}

function harness() {
    const exports = {};
    const timers = new Map();
    const bundles = new Map();
    const bundleRequests = [];
    const textureRequests = [];
    const makeBundle = () => ({
        load(path, _type, complete) { textureRequests.push({ path, complete }); },
    });
    const assetManager = {
        getBundle: name => bundles.get(name),
        loadBundle(name, options, complete) { bundleRequests.push({ name, options, complete }); },
    };
    const resources = makeBundle();
    const modules = {
        cc: { assetManager, resources, Texture2D: class { static Filter = { NEAREST: 0 }; } },
        '../campaign/CampaignArt': { campaignArtBundle: key => key === 'shared' ? null : 'campaign-ch03' },
    };
    let nextTimer = 0;
    vm.runInNewContext(outputText, {
        exports, require: path => modules[path],
        setTimeout: (complete, delay) => {
            assert.ok(delay > 0);
            const id = ++nextTimer;
            timers.set(id, complete);
            return id;
        },
        clearTimeout: id => timers.delete(id),
    });
    return {
        load: (key, done) => exports.loadCampaignTexture('scenery', key, done),
        loadPixel: (bundle, key, done) => exports.loadCampaignPixelTexture(bundle, key, done),
        expire() { for (const complete of Array.from(timers.values())) complete(); },
        bundles, bundleRequests, textureRequests, makeBundle, assetManager, resources, timers,
    };
}

test('pixel assets use the requested chapter folder, nearest sampling and a borrowed reference', async () => {
    const loader = harness();
    loader.bundles.set('campaign-ch02', loader.makeBundle());
    const calls = [];
    const texture = makeTexture();
    texture.setFilters = (...filters) => calls.push(filters);
    loader.loadPixel('campaign-ch02', 'arenas/stage-08', asset => {
        assert.equal(asset, texture);
        assert.equal(asset.refCount, 1);
    });
    assert.equal(loader.textureRequests[0].path, 'pixel/arenas/stage-08/texture');
    loader.textureRequests[0].complete(null, texture);
    await flush();
    assert.deepEqual(calls, [[0, 0]]);
    assert.equal(texture.refCount, 0);
});

test('a silent chapter download releases all callers and a retry ignores the old result', async () => {
    const loader = harness();
    const map = [];
    const arena = [];
    loader.load('chapter-03', texture => map.push(texture));
    loader.load('stage-11', texture => arena.push(texture));
    assert.equal(loader.bundleRequests.length, 1);
    assert.equal(loader.bundleRequests[0].name, 'campaign-ch03');

    loader.expire();
    await flush();
    assert.deepEqual(map, [null]);
    assert.deepEqual(arena, [null]);

    loader.load('chapter-03', texture => map.push(texture));
    assert.equal(loader.bundleRequests.length, 2);
    loader.bundleRequests[0].complete(null, loader.makeBundle());
    await flush();
    assert.equal(loader.textureRequests.length, 0);

    loader.bundleRequests[1].complete(null, loader.makeBundle());
    await flush();
    assert.equal(loader.textureRequests.length, 1);
    assert.equal(loader.textureRequests[0].path, 'chapter-03/texture');
    const texture = makeTexture();
    loader.textureRequests[0].complete(null, texture);
    await flush();
    assert.deepEqual(map, [null, texture]);
    assert.deepEqual(arena, [null]);
    assert.equal(loader.timers.size, 0);
});

test('chapter download errors and a thrown Cocos call allow a new attempt', async () => {
    const loader = harness();
    const results = [];
    const enqueue = loader.assetManager.loadBundle;
    const done = texture => results.push(texture);
    loader.assetManager.loadBundle = () => { throw new Error('Cocos load threw'); };
    loader.load('chapter-03', done);
    await flush();
    loader.assetManager.loadBundle = enqueue;
    loader.load('chapter-03', done);
    loader.bundleRequests[0].complete(new Error('native download failed'));
    await flush();

    const bundle = loader.makeBundle();
    const enqueueTexture = bundle.load;
    bundle.load = () => { throw new Error('Cocos texture load threw'); };
    loader.bundles.set('campaign-ch03', bundle);
    loader.load('chapter-03', done);
    await flush();
    bundle.load = enqueueTexture;
    loader.load('chapter-03', done);
    const texture = makeTexture();
    loader.textureRequests[0].complete(null, texture);
    await flush();
    assert.deepEqual(results, [null, null, null, texture]);
    assert.equal(loader.timers.size, 0);
});

test('silent texture requests settle for both a cached chapter and shared assets', async () => {
    const loader = harness();
    const map = [];
    const shared = [];
    loader.bundles.set('campaign-ch03', loader.makeBundle());
    loader.load('chapter-03', texture => map.push(texture));
    loader.load('shared', texture => shared.push(texture));
    assert.equal(loader.bundleRequests.length, 0);
    assert.deepEqual(loader.textureRequests.map(request => request.path), [
        'chapter-03/texture', 'scenery/shared/texture',
    ]);
    loader.expire();
    await flush();
    assert.deepEqual(map, [null]);
    assert.deepEqual(shared, [null]);

    loader.load('chapter-03', texture => map.push(texture));
    const oldTexture = makeTexture(1);
    const abandoned = makeTexture();
    loader.textureRequests[0].complete(null, oldTexture);
    loader.textureRequests[1].complete(null, abandoned);
    await flush();
    assert.deepEqual(map, [null]);
    assert.deepEqual(shared, [null]);
    assert.equal(oldTexture.refCount, 1);
    assert.equal(oldTexture.releaseAttempts, 1);
    assert.equal(abandoned.refCount, 0);
    assert.equal(abandoned.releaseAttempts, 1);

    const freshTexture = makeTexture();
    loader.textureRequests[2].complete(null, freshTexture);
    await flush();
    assert.deepEqual(map, [null, freshTexture]);
    assert.equal(loader.bundleRequests.length, 0);
    assert.equal(loader.timers.size, 0);
});

test('the loader borrows a texture for the callback and releases it after delivery', async () => {
    const loader = harness();
    const retained = makeTexture();
    loader.load('shared', texture => {
        assert.equal(texture, retained);
        assert.equal(texture.refCount, 1);
        texture.addRef();
    });
    loader.textureRequests[0].complete(null, retained);
    assert.equal(retained.refCount, 1);
    await flush();
    assert.equal(retained.refCount, 1);
    assert.equal(retained.releaseAttempts, 1);

    const ignored = makeTexture();
    loader.load('shared', texture => {
        assert.equal(texture, ignored);
        assert.equal(texture.refCount, 1);
    });
    loader.textureRequests[1].complete(null, ignored);
    await flush();
    assert.equal(ignored.refCount, 0);
    assert.equal(ignored.releaseAttempts, 1);
});
