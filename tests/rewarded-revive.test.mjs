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
