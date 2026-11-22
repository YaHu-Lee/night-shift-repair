import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRewardedRevive } from '../.m0-build/platform/rewardedRevive.js';

function video() {
    let close, error;
    let destroyed = 0;
    return {
        show: async () => {},
        onClose: cb => { close = cb; },
        offClose: cb => { assert.equal(cb, close); },
        onError: cb => { error = cb; },
        offError: cb => { assert.equal(cb, error); },
        destroy: () => destroyed++,
        close: ended => close?.({ isEnded: ended }),
        closeWith: result => close?.(result),
        fail: () => error?.(new Error('native playback failed')),
        get destroyed() { return destroyed; },
    };
}

test('completed native video permits one reward and ignores duplicate or stale closes', async () => {
    const first = video(), second = video();
    const queue = [first, second];
    const ad = createRewardedRevive('unit', { tt: { createRewardedVideoAd: () => queue.shift() } });
    const reward = ad.show();
    assert.equal(await ad.show(), false);
    first.close(true);
    first.close(true);
    assert.equal(await reward, true);
    assert.equal(first.destroyed, 1);
    const next = ad.show();
    first.close(true);
    second.close(false);
    assert.equal(await next, false);
    assert.equal(second.destroyed, 1);
});

test('unconfigured host, native rejection, timeout and disposal cannot award a revive', async () => {
    assert.equal(createRewardedRevive('', {}), null);
    assert.equal(createRewardedRevive('unit', {}), null);
    const rejected = video();
    rejected.show = async () => { throw new Error('no fill'); };
    const unused = video(), cancelled = video();
    const queue = [rejected, unused, cancelled];
    const ad = createRewardedRevive('unit', { tt: { createRewardedVideoAd: () => queue.shift() } }, 10);
    assert.equal(await ad.show(), false);
    rejected.close(true);
    assert.equal(rejected.destroyed, 1);
    assert.equal(await ad.show(), false);
    assert.equal(unused.destroyed, 1);
    const pending = ad.show();
    ad.dispose();
    cancelled.close(true);
    assert.equal(await pending, false);
    assert.equal(cancelled.destroyed, 1);
    assert.equal(await ad.show(), false);
});

test('the native instance remains leased until asynchronous destruction finishes', async () => {
    const v1 = video(), v2 = video();
    const queue = [v1, v2];
    const host = { tt: { createRewardedVideoAd: () => queue.shift() } };
    let release;
    v1.destroy = () => new Promise(resolve => { release = resolve; });
    v1.show = () => {};
    v2.destroy = async () => { throw new Error('native destroy rejected'); };
    const adapter = createRewardedRevive('unit', host);
    const otherAdapter = createRewardedRevive('same-host', host);
    const first = adapter.show();
    v1.close(true);
    assert.equal(await first, true);
    assert.equal(await otherAdapter.show(), false);
    assert.equal(queue.length, 1);
    release();
    await Promise.resolve();
    const second = otherAdapter.show();
    v1.close(true);
    v2.close(false);
    assert.equal(await second, false);
    assert.equal(queue.length, 0);
});

test('cancel a silent native show immediately and ignore all of its late callbacks', async () => {
    const silent = video(), next = video();
    const queue = [silent, next];
    const ad = createRewardedRevive('unit', { tt: { createRewardedVideoAd: () => queue.shift() } });
    let reportPresented = 0;
    let finishShow;
    silent.show = () => new Promise(resolve => { finishShow = resolve; });
    const waiting = ad.show(() => { reportPresented++; });
    ad.cancel();
    ad.cancel();
    silent.close(true);
    finishShow();
    silent.fail();
    assert.equal(await waiting, false);
    assert.equal(silent.destroyed, 1);
    assert.equal(reportPresented, 0);

    const reward = ad.show();
    silent.close(true);
    next.close(true);
    assert.equal(await reward, true);
});

test('presentation and viewing are separate, and the native count determines completion when available', async () => {
    const earlyClose = video(), completed = video(), noFill = video();
    const queue = [earlyClose, completed, noFill];
    const ad = createRewardedRevive('unit', { tt: { createRewardedVideoAd: () => queue.shift() } });
    const shown = [];
    let resolveEarlyShow;
    earlyClose.show = () => new Promise(resolve => { resolveEarlyShow = resolve; });
    const first = ad.show(() => shown.push('closed'));
    earlyClose.closeWith({ count: 0, isEnded: true });
    resolveEarlyShow();
    earlyClose.closeWith({ count: 1 });
    assert.equal(await first, false);
    assert.deepEqual(shown, ['closed']);

    const second = ad.show(() => shown.push('fulfilled'));
    await Promise.resolve();
    assert.deepEqual(shown, ['closed', 'fulfilled']);
    completed.closeWith({ count: 1, isEnded: false });
    assert.equal(await second, true);
    assert.deepEqual(shown, ['closed', 'fulfilled']);

    noFill.show = () => Promise.reject(new Error('no fill'));
    assert.equal(await ad.show(() => shown.push('not shown')), false);
    assert.deepEqual(shown, ['closed', 'fulfilled']);
});

test('a dual-platform configuration selects the active SDK and uses only its own unit', async () => {
    const wxVideo = video(), ttVideo = video();
    const calls = [];
    const wx = { createRewardedVideoAd(options) { assert.equal(this, wx); calls.push(['wx', options]); return wxVideo; } };
    const tt = { createRewardedVideoAd(options) { assert.equal(this, tt); calls.push(['tt', options]); return ttVideo; } };
    const adUnits = { wechat: ' wx-unit ', douyin: ' tt-unit ' };
    assert.equal(createRewardedRevive(adUnits, {}), null);
    assert.equal(createRewardedRevive({ douyin: 'only-douyin' }, { wx }), null);
    assert.equal(createRewardedRevive('legacy-douyin', { wx }), null);
    assert.equal(createRewardedRevive({ wechat: 'only-wechat' }, { tt, wx }), null);
    const wechat = createRewardedRevive(adUnits, { wx });
    const wechatReward = wechat.show();
    wxVideo.close(true);
    assert.equal(await wechatReward, true);
    const douyin = createRewardedRevive(adUnits, { tt, wx });
    const douyinReward = douyin.show();
    ttVideo.closeWith({ count: 1 });
    assert.equal(await douyinReward, true);
    assert.deepEqual(calls, [['wx', { adUnitId: 'wx-unit' }], ['tt', { adUnitId: 'tt-unit' }]]);
});

test('WeChat requires native isEnded evidence and disregards the Douyin count field', async () => {
    const incomplete = video(), unknown = video(), complete = video();
    const queue = [incomplete, unknown, complete];
    const adapter = createRewardedRevive({ wechat: 'wx-unit' }, { wx: { createRewardedVideoAd: () => queue.shift() } });
    const early = adapter.show();
    incomplete.closeWith({ isEnded: false, count: 1 });
    assert.equal(await early, false);
    const legacy = adapter.show();
    unknown.closeWith(undefined);
    unknown.closeWith({ isEnded: true });
    assert.equal(await legacy, false);
    complete.show = () => new Promise(() => {});
    let shown = 0;
    const finished = adapter.show(() => { shown++; });
    complete.closeWith({ isEnded: true, count: 0 });
    complete.close(true);
    assert.equal(await finished, true);
    assert.equal(shown, 1);
    assert.deepEqual([incomplete.destroyed, unknown.destroyed, complete.destroyed], [1, 1, 1]);
});

test('WeChat loads once after the first show fails, and waits for video completion after the retry', async () => {
    const ad = video();
    const calls = [];
    let shows = 0;
    ad.load = async () => { calls.push('load'); };
    ad.show = async () => {
        calls.push('show');
        if (shows++ === 0) {
            ad.fail();
            throw new Error('not ready');
        }
    };
    const revive = createRewardedRevive({ wechat: 'wx-unit' }, { wx: { createRewardedVideoAd: () => ad } });
    let resolved = false;
    const playback = revive.show(() => calls.push('presented')).then(value => { resolved = true; return value; });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['show', 'load', 'show', 'presented']);
    assert.equal(resolved, false);
    ad.close(true);
    assert.equal(await playback, true);
    assert.equal(ad.destroyed, 1);
});

test('WeChat load failure and cancellation during loading ignore late native events', async () => {
    const rejected = video(), cancelled = video();
    const queue = [rejected, cancelled];
    const revive = createRewardedRevive({ wechat: 'wx-unit' }, { wx: { createRewardedVideoAd: () => queue.shift() } });
    const calls = [];
    rejected.show = async () => { calls.push('first show'); throw new Error('not ready'); };
    rejected.load = async () => { calls.push('failed load'); throw new Error('no fill'); };
    assert.equal(await revive.show(() => calls.push('presented')), false);
    rejected.close(true);
    let resolveLoad;
    cancelled.show = async () => { calls.push('cancelled show'); throw new Error('not ready'); };
    cancelled.load = () => new Promise(resolve => { resolveLoad = resolve; });
    const retry = revive.show(() => calls.push('presented'));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(typeof resolveLoad, 'function');
    cancelled.close(true);
    revive.cancel();
    resolveLoad();
    cancelled.close(true);
    assert.equal(await retry, false);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, ['first show', 'failed load', 'cancelled show']);
    assert.deepEqual([rejected.destroyed, cancelled.destroyed], [1, 1]);
});
