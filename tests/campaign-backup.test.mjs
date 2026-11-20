import assert from 'node:assert/strict';
import { test } from 'node:test';
import cloud from '../cloud/campaign-progress.cjs';
import { Campaign } from '../.m0-build/campaign/Campaign.js';
import { CampaignBackupSync, mergeBackups } from '../.m0-build/campaign/CampaignBackup.js';
import { CampaignCloudSession } from '../.m0-build/campaign/CampaignCloudSession.js';
import { createCampaignCloud } from '../.m0-build/platform/campaignCloud.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

const backup = (clearedStages = [], unlockedWeapons = [], blueprints = []) =>
    ({ schemaVersion: 1, clearedStages, unlockedWeapons, blueprints });

test('two fake devices merge durable unlocks while preserving locally bought balances and active run', async () => {
    const source = new Campaign(makePlatform());
    const target = new Campaign(makePlatform());
    assert.ok(source.restoreBackup(backup(['01'], [], ['magnetic_pickup_arm'])));
    assert.ok(target.restoreBackup(backup(['01', '02'], [], ['narrow_beam_clamp'])));
    assert.ok(target.beginAttempt('03', 'local-third'));
    let remote = backup();
    let fail = false;
    const transport = {
        async read() {
            if (fail) throw new Error('offline');
            return { scope: 'tester', progress: remote };
        },
        async merge(scope, progress) {
            assert.equal(scope, 'tester');
            remote = mergeBackups(remote, progress);
            return { scope, progress: remote };
        },
    };
    const first = new CampaignBackupSync(transport), second = new CampaignBackupSync(transport);
    first.bind('tester', source);
    second.bind('tester', target);
    assert.equal(await first.sync(), 'synced');
    fail = true;
    assert.equal(await second.sync(), 'pending');
    fail = false;
    assert.equal(await second.sync(), 'synced');
    assert.equal(await first.sync(), 'synced');
    assert.deepEqual(source.profile.clearedStages, ['01', '02']);
    assert.deepEqual(source.profile.blueprints, ['magnetic_pickup_arm', 'narrow_beam_clamp']);
    assert.ok(source.canUseStarter('03', 'hydraulic_nailer'));
    assert.equal(source.profile.credits, 0);
    assert.equal(source.profile.activeAttempt, null);
    assert.equal(target.profile.activeAttempt.runId, 'local-third');
    assert.equal('activeAttempt' in remote, false);
    assert.equal('credits' in remote, false);
});

test('a delayed response cannot import progress after account switch', async () => {
    let finishRead;
    const transport = {
        read: () => new Promise(resolve => { finishRead = resolve; }),
        merge: () => { assert.fail('An old account must not be uploaded after rebinding'); },
    };
    const source = new Campaign(makePlatform()), target = new Campaign(makePlatform());
    const sync = new CampaignBackupSync(transport);
    sync.bind('prior', source);
    const pending = sync.sync();
    sync.bind('next', target);
    finishRead({ scope: 'prior', progress: backup(['01']) });
    assert.equal(await pending, 'account-changed');
    assert.deepEqual(target.profile.clearedStages, []);
    assert.deepEqual(source.profile.clearedStages, []);
});

function cloudFixture() {
    const rows = new Map();
    const updates = [];
    const queries = [];
    const db = {
        serverDate: () => new Date(),
        command: { addToSet: value => ({ addToSet: value }) },
        collection: name => {
            assert.equal(name, 'campaign_progress');
            return {
                where: ({ _id }) => ({ limit: () => ({ get: async () => {
                    queries.push(_id);
                    return { data: rows.has(_id) ? [rows.get(_id)] : [] };
                } }) }),
                add: async row => {
                    if (rows.has(row._id)) throw new Error('duplicate document');
                    rows.set(row._id, row);
                    return { id: row._id, requestId: 'test-insert' };
                },
                doc: id => ({ update: async update => {
                    updates.push(update);
                    const row = rows.get(id);
                    for (const [key, command] of Object.entries(update)) {
                        if (key === 'updatedAt') row.updatedAt = command;
                        else row[key] = Array.from(new Set([...row[key], ...command.addToSet.$each]));
                    }
                } }),
            };
        },
    };
    const sdk = { context: identity => ({ getContext: () => identity }), database: () => db };
    const invoke = (params, context) => cloud.handle(params, context, sdk);
    return { invoke, rows, updates, queries };
}

test('cloud helper accepts only an authenticated account and serializes concurrent first backup creation', async () => {
    const { invoke, rows, updates } = cloudFixture();
    const identity = { appId: 'app', openId: 'u1' };
    await assert.rejects(() => invoke({ action: 'read' }, { appId: 'app' }), /authenticated/);
    const { scope } = await invoke({ action: 'read', openId: 'caller-data-ignored' }, identity);
    const merge = progress => invoke({ action: 'merge', expectedScope: scope, progress }, identity);
    await Promise.all([
        merge(backup(['01'], ['arc_gun'], ['magnetic_pickup_arm'])),
        merge(backup(['01', '02'], ['hydraulic_nailer'], ['quick_release_heatsink'])),
    ]);
    assert.equal(rows.size, 1);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].clearedStages, { addToSet: { $each: ['02'] } });
    const archive = await invoke({ action: 'read' }, identity);
    assert.deepEqual(archive.progress.clearedStages, ['01', '02']);
    assert.deepEqual(archive.progress.blueprints, ['magnetic_pickup_arm', 'quick_release_heatsink']);
    assert.deepEqual((await invoke({ action: 'read' }, { appId: 'other', openId: 'u1' })).progress, backup());
});

test('native cloud transport calls configured service and requires a valid scoped response', async () => {
    const { invoke } = cloudFixture();
    const identity = { appId: 'app', openId: 'u1' };
    let invalid = false;
    const native = { tt: { createCloud(config) {
        assert.deepEqual(config, { envID: 'dev', serviceID: 'game' });
        return { callContainer(request) {
            assert.equal(request.path, '/campaign-progress');
            invoke(request.init.body, identity).then(data => request.success({
                statusCode: 200, data: JSON.stringify(invalid ? { data } : data),
            }), request.fail);
        } };
    } } };
    const transport = createCampaignCloud('dev', 'game', native);
    const result = await transport.read();
    assert.deepEqual(result.progress, backup());
    assert.deepEqual((await transport.merge(result.scope, backup(['01']))).progress.clearedStages, ['01']);
    invalid = true;
    await assert.rejects(() => transport.read(), /unavailable/);
});

test('an account switch between read and merge hides the prior archive without accessing the new one', async () => {
    const { invoke, rows, queries } = cloudFixture();
    const previous = { appId: 'app', openId: 'u1' };
    const current = { appId: 'app', openId: 'u2' };
    const { scope: previousScope } = await invoke({ action: 'read' }, previous);
    const { scope: currentScope } = await invoke({ action: 'read' }, current);
    await invoke({ action: 'merge', expectedScope: currentScope,
        progress: backup([], [], ['quick_release_heatsink']) }, current);
    const campaign = new Campaign(makePlatform({}));
    assert.ok(campaign.restoreBackup(backup(['01'])));
    const transport = createCampaignCloud('dev', 'game', { tt: { createCloud: () => ({
        callContainer(request) {
            const body = request.init.body;
            const identity = body.action === 'read' ? previous : current;
            return invoke(body, identity).then(data => {
                if (body.action === 'merge') assert.deepEqual(data, { scope: currentScope, progress: backup() });
                request.success({ statusCode: 200, data });
            });
        },
    }) } });
    const session = new CampaignCloudSession(transport, makePlatform({}), () => campaign);
    assert.equal((await session.connect(previousScope)).status, 'bound');
    const before = queries.length;
    assert.equal(await session.sync(), 'account-changed');
    assert.equal(session.binding, null);
    assert.deepEqual(queries.slice(before), [previousScope]);
    assert.equal(rows.has(previousScope), false);
    assert.deepEqual(rows.get(currentScope).blueprints, ['quick_release_heatsink']);
    assert.deepEqual(campaign.profile.clearedStages, ['01']);
});

test('native cloud watchdog settles silent callbacks and absorbs rejecting SDK tasks', async () => {
    let late;
    let failure;
    const transport = createCampaignCloud('dev', 'game', { tt: { createCloud: () => ({
        callContainer(request) {
            late = request.success;
            if (failure) return Promise.reject(failure);
            return {};
        },
    }) } }, 10);
    const silent = transport.read();
    await assert.rejects(silent, /timed out/);
    late({ statusCode: 200, data: { scope: 'ignored', progress: backup(['01']) } });
    await assert.rejects(silent, /timed out/);
    failure = new Error('offline promise');
    await assert.rejects(transport.merge('ignored', backup()), /offline promise/);
});

test('native network recovery retries only while its listener is subscribed', () => {
    let listener;
    let removed;
    let recoveries = 0;
    const transport = createCampaignCloud('dev', 'game', { tt: {
        createCloud: () => ({ callContainer() {} }),
        onNetworkStatusChange(callback) { listener = callback; },
        offNetworkStatusChange(callback) { removed = callback; },
    } });
    const session = new CampaignCloudSession(transport, makePlatform({}));
    const stop = session.onOnline(() => { recoveries++; });
    listener({ isConnected: false });
    listener({ isConnected: true });
    assert.equal(recoveries, 1);
    stop();
    assert.equal(removed, listener);
    listener({ isConnected: true });
    assert.equal(recoveries, 1);
});

test('a reconnect during an offline sync retries once after failure', async () => {
    let online;
    let reject;
    const transport = {
        read() {
            return Promise.resolve({ scope: 'account', progress: backup() });
        },
        merge() { return new Promise((_, fail) => { reject = fail; }); },
        onOnline(callback) {
            online = callback;
            return () => {};
        },
    };
    const session = new CampaignCloudSession(transport, makePlatform({}), () => new Campaign(makePlatform({})));
    assert.equal((await session.connect('account')).status, 'bound');
    let recoveries = 0;
    const stop = session.onOnline(() => { recoveries++; });
    const upload = session.sync();
    await Promise.resolve();
    online();
    online();
    assert.equal(recoveries, 0);
    reject(new Error('request failed while offline'));
    assert.equal(await upload, 'pending');
    assert.equal(recoveries, 1);
    stop();
});

test('foreground verifies a reused account and queues a new sync after its stale request', async () => {
    let finishOldRead;
    let reads = 0;
    let merges = 0;
    const transport = {
        read() {
            reads++;
            if (reads === 2) return new Promise(resolve => { finishOldRead = resolve; });
            return Promise.resolve({ scope: 'account', progress: backup() });
        },
        async merge(scope, progress) {
            merges++;
            return { scope, progress };
        },
    };
    const session = new CampaignCloudSession(transport, makePlatform({}), () => new Campaign(makePlatform({})));
    assert.equal((await session.connect('account')).status, 'bound');
    const originalBinding = session.binding;
    const old = session.sync();
    session.invalidate();
    assert.equal((await session.restore()).status, 'bound');
    assert.equal(session.binding, originalBinding);
    const replacement = session.sync();
    finishOldRead({ scope: 'account', progress: backup() });
    assert.equal(await old, 'unbound');
    assert.equal(await replacement, 'synced');
    assert.equal(session.binding, originalBinding);
    assert.equal(merges, 1);
});

test('cloud session restores fresh account identity before opening an isolated archive', async () => {
    const preferences = makePlatform({});
    const campaigns = new Map();
    const openCampaign = scope => {
        if (!campaigns.has(scope)) campaigns.set(scope, new Campaign(makePlatform({})));
        return campaigns.get(scope);
    };
    let account = 'accountA';
    const server = new Map([[account, backup(['01'])], ['accountB', backup()]]);
    const transport = {
        async read() { return { scope: account, progress: server.get(account) }; },
        async merge(scope, progress) {
            assert.equal(scope, account);
            server.set(scope, mergeBackups(server.get(scope), progress));
            return { scope, progress: server.get(scope) };
        },
    };
    const app = new CampaignCloudSession(transport, preferences, openCampaign);
    assert.deepEqual(await app.restore(), { status: 'guest' });
    assert.equal(campaigns.size, 0);
    assert.deepEqual(await app.discover(), { status: 'confirmed', scope: 'accountA' });
    assert.equal(app.binding, null);
    const bound = await app.connect('accountA');
    assert.equal(bound.status, 'bound');
    assert.equal(bound.binding.runPrefix, 'night-shift.campaign.account.accountA.run.');
    assert.deepEqual(bound.binding.campaign.profile.clearedStages, ['01']);
    app.invalidate();
    assert.equal(app.binding, null);
    assert.equal((await app.restore()).binding, bound.binding);

    // A persisted consent is never sufficient to show data before the next account check.
    account = 'accountB';
    const cold = new CampaignCloudSession(transport, preferences, openCampaign);
    assert.equal(cold.binding, null);
    assert.deepEqual(await cold.restore(), { status: 'account-changed' });
    assert.equal(cold.binding, null);
    assert.equal(campaigns.has('accountB'), false);
    const switched = await cold.connect(account);
    assert.equal(switched.status, 'bound');
    assert.notEqual(switched.binding.runPrefix, bound.binding.runPrefix);
    assert.deepEqual(switched.binding.campaign.profile.clearedStages, []);
    transport.read = async () => { throw new Error('offline'); };
    cold.invalidate();
    assert.deepEqual(await cold.restore(), { status: 'unavailable' });
    assert.equal(cold.binding, null);
    assert.ok(cold.disconnect());
    assert.deepEqual(await cold.restore(), { status: 'guest' });
    assert.equal(cold.binding, null);
    assert.deepEqual(bound.binding.campaign.profile.clearedStages, ['01']);
});

test('consented guest import only affects the freshly verified account', async () => {
    const preferences = makePlatform({});
    const campaign = new Campaign(makePlatform({}));
    let pendingRead;
    let uploaded = backup();
    const transport = {
        read: () => new Promise(resolve => { pendingRead = resolve; }),
        async merge(scope, progress) {
            uploaded = mergeBackups(uploaded, progress);
            return { scope, progress: uploaded };
        },
    };
    const session = new CampaignCloudSession(transport, preferences, () => campaign);
    const importSave = backup(['01'], ['arc_gun']);
    const rejected = session.connect('accountA', importSave);
    pendingRead({ scope: 'accountB', progress: backup() });
    assert.deepEqual(await rejected, { status: 'account-changed' });
    assert.deepEqual(campaign.profile.clearedStages, []);
    assert.deepEqual(await session.restore(), { status: 'guest' });
    const interrupted = session.connect('accountA', importSave);
    session.invalidate();
    pendingRead({ scope: 'accountA', progress: backup() });
    assert.deepEqual(await interrupted, { status: 'stale' });
    assert.deepEqual(campaign.profile.clearedStages, []);
    assert.equal(session.binding, null);
    const accepted = session.connect('accountA', importSave);
    pendingRead({ scope: 'accountA', progress: backup() });
    assert.equal((await accepted).status, 'bound');
    assert.deepEqual(campaign.profile.clearedStages, ['01']);
    assert.equal(campaign.profile.credits, 0);
    const syncing = session.sync();
    pendingRead({ scope: 'accountA', progress: backup() });
    assert.equal(await syncing, 'synced');
    assert.deepEqual(uploaded, importSave);
});
