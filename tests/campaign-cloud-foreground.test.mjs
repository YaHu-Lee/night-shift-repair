import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { FIELD, TOOLS, isTool } from '../.m0-build/m1/content.js';

const guestPrefix = 'night-shift.campaign.run.';
const stage = { id: '01', arena: 'yard', rules: {} };

function lifecycle() {
    // Run the actual scene component methods with rendering and platform namespaces stubbed.
    const src = readFileSync(new URL('../assets/scripts/cocos/M1Bootstrap.ts', import.meta.url), 'utf8');
    const output = ts.transpileModule(src, { compilerOptions: {
        target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true,
    } }).outputText;
    const exports = {};
    const modules = {
        cc: { Color: class {}, Component: class {}, Vec2: class {}, Vec3: class {}, _decorator: {
            ccclass: () => value => value, requireComponent: () => value => value, property() {},
        } },
        '../campaign/CampaignCatalog': { CAMPAIGN_CATALOG: [stage], rulesForCampaign: entry => entry.rules },
        '../m1/content': { FIELD, TOOLS, isTool },
        '../m1/Run': { Run: class { constructor(platform) { this.platform = platform; } } },
        '../platform/platform': { makePlatform: (_host, namespace) => ({ namespace }) },
        './WorkshopBench': { BENCH: {}, benchPlate() {} },
    };
    vm.runInNewContext(output, { exports, require: path => modules[path] ?? {} });
    const view = new exports.M1Bootstrap();
    return Object.assign(view, { isValid: true, campaignRunPrefix: guestPrefix,
        clearInput() {}, trace() {}, defaultStarter: () => 'wrench' });
}

function deferred() {
    let resolve;
    const promise = new Promise(settle => { resolve = settle; });
    return { promise, resolve };
}

test('a guest keeps the pending native revive during cloud foreground verification', async () => {
    const view = lifecycle();
    const ad = deferred();
    const account = deferred();
    let revived = 0;
    const run = {
        canRevive: true,
        background: false,
        data: { runId: 'existing-run', revision: 4 },
        revive(runId, revision) {
            assert.equal(runId, 'existing-run');
            assert.equal(revision, 4);
            revived++;
            return true;
        },
        pause() {},
    };
    view.run = run;
    view.cloud = { invalidate() {}, restore: () => account.promise };
    view.reviveAd = { show: () => ad.promise };
    view.loadCampaign = () => assert.fail('same guest scope must keep the existing Run');

    const watching = view.watchRevive();
    view.onGameHide();
    const foreground = view.restoreCloud();
    ad.resolve(true);
    await watching;
    view.finishRevive();
    assert.equal(revived, 0);
    assert.equal(view.reviveDecision.run, run);
    account.resolve({ status: 'guest' });
    await foreground;
    view.finishRevive();
    assert.equal(revived, 1);
    assert.equal(view.run, run);
    assert.equal(view.watchingRevive, false);
    assert.equal(view.reviveDecision, undefined);
});

test('a real transition from a cloud scope to guest discards old native callbacks', async () => {
    const view = lifecycle();
    const ad = deferred();
    let disposed = false;
    let canceled = 0;
    const oldRun = { canRevive: true, data: { runId: 'account-run', revision: 9 },
        dispose() { disposed = true; } };
    view.run = oldRun;
    view.campaignRunPrefix = 'night-shift.campaign.account.old.run.';
    view.cloud = { restore: async () => ({ status: 'account-changed' }) };
    view.reviveAd = { show: () => ad.promise, cancel: () => { canceled++; } };
    view.loadCampaign = () => {
        view.campaignRunPrefix = guestPrefix;
        view.loadCampaignStage(stage);
    };

    const watching = view.watchRevive();
    await view.restoreCloud();
    assert.ok(disposed);
    assert.equal(canceled, 1);
    assert.equal(view.run.platform.namespace, guestPrefix + stage.id);
    assert.equal(view.watchingRevive, false);
    ad.resolve(true);
    await watching;
    assert.equal(view.reviveDecision, undefined);
});

test('direct settlement is available during a silent native show and retries the same receipt after a write failure', async () => {
    const view = lifecycle();
    const ad = deferred();
    const events = [];
    let canceled = 0;
    let writeAllowed = false;
    let written = 0;
    let credited = 0;
    view.run = {
        data: { runId: 'ad-run', revision: 17, phase: 'revive', wave: 1 },
        get canRevive() { return this.data.phase === 'revive'; },
        declineRevive() {
            if (!writeAllowed) return false;
            assert.equal(this.data.phase, 'revive');
            this.data = { ...this.data, phase: 'lost', revision: 18 };
            written++;
            return true;
        },
        revive() { assert.fail('the player declined this ad'); },
    };
    view.reviveAd = { show: () => ad.promise, cancel: () => { canceled++; } };
    view.campaignTrace = name => { events.push(name); };
    view.reconcileCampaignResult = () => { credited++; };
    view.benchBackdrop = () => {};
    view.benchHeader = () => 602;
    view.block = () => {};
    view.text = () => {};
    const buttons = new Map();
    view.benchButton = (label, _x, _y, _w, action, { enabled = true } = {}) => buttons.set(label, { action, enabled });

    const watching = view.watchRevive();
    view.drawRevive();
    const direct = buttons.get('直接结算');
    assert.equal(direct.enabled, true);
    direct.action();
    direct.action();
    assert.equal(canceled, 1);
    assert.equal(view.watchingRevive, false);
    assert.equal(written, 0);
    assert.equal(credited, 0);
    view.drawRevive();
    writeAllowed = true;
    buttons.get('重试保存').action();
    buttons.get('重试保存').action();
    assert.equal(written, 1);
    assert.equal(credited, 1);
    assert.equal(view.run.data.phase, 'lost');
    ad.resolve(true);
    await watching;
    assert.equal(view.reviveDecision, undefined);
    assert.deepEqual(events, ['ad_request']);
});

test('an unavailable or incomplete video keeps the revive checkpoint until the player chooses', async () => {
    const view = lifecycle();
    const data = { phase: 'revive', runId: 'video-retry', revision: 5 };
    let attempts = 0;
    let revives = 0;
    view.run = {
        data, canRevive: true,
        declineRevive() { assert.fail('the player has not chosen settlement'); },
        revive(runId, revision) {
            assert.equal(runId, data.runId);
            assert.equal(revision, data.revision);
            revives++;
            this.data = { ...data, phase: 'battle', revision: 6 };
            return true;
        },
    };
    view.reviveAd = { async show(onShown) {
        attempts++;
        if (attempts > 1) onShown();
        return attempts === 3;
    } };

    for (const feedback of ['unavailable', 'incomplete']) {
        await view.watchRevive();
        view.finishRevive();
        assert.equal(view.reviveFeedback, feedback);
        assert.equal(view.reviveDecision, undefined);
        assert.equal(view.watchingRevive, false);
        assert.equal(view.run.data, data);
    }
    await view.watchRevive();
    view.finishRevive();
    view.finishRevive();
    assert.equal(revives, 1);
    assert.equal(view.run.data.phase, 'battle');
});

test('verification overlay lets a guest continue and ignores the late verification', async () => {
    const view = lifecycle();
    const account = deferred();
    let invalidated = false;
    view.run = { background: false };
    view.campaign = {};
    view.campaignPage = 'home';
    view.cloud = {
        invalidate() { invalidated = true; },
        restore: async () => {
            await account.promise;
            return invalidated ? { status: 'stale' } : { status: 'bound', binding: { campaign: {} } };
        },
    };
    view.loadCampaign = () => assert.fail('guest should not switch save while continuing offline');
    const verify = view.restoreCloud();
    assert.equal(view.cloudBusy, true);
    const event = { getID: () => 1 };
    view.point = () => ({ x: 180, y: 290 });
    view.draw = () => {};
    view.actions = [
        { left: 60, right: 300, bottom: 260, top: 320, action: () => assert.fail('old action remains blocked') },
        { left: 60, right: 300, bottom: 260, top: 320, action: view.continueCloudOffline },
    ];
    view.touchStart(event);
    view.touchEnd(event);
    assert.equal(view.cloudBusy, false);
    assert.equal(view.campaignPage, 'home');
    account.resolve();
    await verify;
    assert.equal(invalidated, true);
    assert.equal(view.cloudBusy, false);
});

test('online retry syncs a bound archive without replacing the active sortie', async () => {
    const view = lifecycle();
    const run = view.run = { background: false };
    view.campaignPage = null;
    let syncs = 0;
    view.cloud = { binding: {}, async sync() { syncs++; return 'pending'; } };
    view.onCloudOnline();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(view.run, run);
    assert.equal(view.cloudBusy, false);
    assert.equal(syncs, 1);
    assert.match(view.cloudMessage, /同步还没完成/);

    view.cloud.binding = null;
    view.retryCloudVerification = true;
    let restores = 0;
    view.restoreCloud = async () => { restores++; };
    view.onCloudOnline();
    assert.equal(restores, 0);
    view.campaignPage = 'home';
    view.onCloudOnline();
    assert.equal(restores, 1);
});
