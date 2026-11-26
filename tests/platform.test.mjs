import assert from 'node:assert/strict';
import test from 'node:test';
import { makePlatform, miniGamePlatform } from '../assets/scripts/platform/platform.ts';
import { createMiniGameRuntime } from '../.m0-build/platform/miniGameRuntime.js';

function storageHost() {
  const backing = new Map();
  const storage = {
    getItem: (key) => backing.get(key) ?? null,
    setItem: (key, value) => { backing.set(key, value); },
  };
  return { backing, storage, host: { localStorage: storage } };
}

test('A/B journal returns latest, detects damage and recovers last good slot', () => {
  const { backing, host } = storageHost();
  const p = makePlatform(host);
  assert.equal(p.kind, 'browser');
  assert.equal(p.readCheckpoint(1), null);
  assert.ok(p.writeCheckpoint(1, { run: 1 }));
  assert.ok(p.writeCheckpoint(1, { run: 2 }));
  assert.deepEqual(makePlatform(host).readCheckpoint(1), { run: 2 });
  const key = 'night-shift.checkpoint.b';
  const newest = JSON.parse(backing.get(key));
  newest.payload = '{"run":200}'; // Valid JSON with a bad integrity marker.
  backing.set(key, JSON.stringify(newest));
  assert.deepEqual(p.readCheckpoint(1), { run: 1 });
  assert.ok(p.writeCheckpoint(1, { run: 3 }));
  assert.deepEqual(p.readCheckpoint(1), { run: 3 });
});

test('schema rejection recovers backup but explicit clear and version boundaries do not', () => {
  const p = makePlatform({});
  assert.equal(p.kind, 'memory');
  assert.ok(p.writeCheckpoint(1, { run: 1 }));
  assert.ok(p.writeCheckpoint(1, { obsolete: true }));
  assert.deepEqual(p.readCheckpoint(1, (x) => x && Number.isInteger(x.run)), { run: 1 });
  assert.ok(p.writeCheckpoint(2, { run: 2 }));
  assert.equal(p.readCheckpoint(1), null);
  assert.deepEqual(p.readCheckpoint(2), { run: 2 });
  assert.ok(p.clearCheckpoint());
  assert.equal(p.readCheckpoint(2), null);
  assert.ok(p.writeCheckpoint(2, { run: 3 }));
  assert.deepEqual(p.readCheckpoint(2), { run: 3 });
});

test('failed or oversized writes do not replace durable state', () => {
  const { storage, host } = storageHost();
  const p = makePlatform(host);
  assert.ok(p.writeCheckpoint(1, { run: 1 }));
  assert.equal(p.writeCheckpoint(1, 'x'.repeat(65536)), false);
  assert.equal(p.writeCheckpoint(1, undefined), false);
  const loop = {}; loop.self = loop;
  assert.equal(p.writeCheckpoint(1, loop), false);
  storage.setItem = () => {};
  assert.equal(p.writeCheckpoint(1, { run: 2 }), false);
  storage.setItem = () => { throw new Error('quota'); };
  assert.equal(p.writeCheckpoint(1, { run: 3 }), false);
  assert.deepEqual(p.readCheckpoint(1), { run: 1 });
});

test('native methods are guarded, correctly bound and unsubscribe even without offHide', () => {
  const backing = new Map();
  const tt = {
    onShow(fn) { this.show = fn; },
    offShow(fn) { assert.equal(this.show, fn); delete this.show; },
    onHide(fn) { this.hide = fn; },
    getStorageSync(key) { assert.equal(this, tt); return backing.get(key); },
    setStorageSync(key, raw) { assert.equal(this, tt); backing.set(key, raw); },
    getSystemInfoSync() {
      return { screenWidth: 500, screenHeight: 800, safeArea: { top: 24, right: 499, bottom: 790, left: 2 } };
    },
  };
  const p = makePlatform({ tt });
  assert.equal(p.kind, 'douyin');
  let seen = 0;
  const offShow = p.onShow(() => seen++);
  const offHide = p.onHide(() => seen++);
  tt.show();
  tt.hide();
  offShow();
  offHide();
  tt.hide();
  assert.equal(seen, 2);
  assert.equal(tt.show, undefined);
  assert.ok(p.writeCheckpoint(1, { run: 1 }));
  assert.deepEqual(makePlatform({ tt }).readCheckpoint(1), { run: 1 });
  assert.deepEqual(p.getSafeInsets(), { top: 24, right: 1, bottom: 10, left: 2 });
});

test('browser lifecycle de-duplicates page and visibility notifications', () => {
  const doc = new EventTarget();
  doc.defaultView = new EventTarget();
  doc.visibilityState = 'visible';
  const p = makePlatform({ document: doc });
  const received = [];
  const stopShow = p.onShow(() => received.push('show'));
  const stopHide = p.onHide(() => received.push('hide'));
  doc.visibilityState = 'hidden';
  doc.dispatchEvent(new Event('visibilitychange'));
  doc.defaultView.dispatchEvent(new Event('pagehide'));
  doc.defaultView.dispatchEvent(new Event('pageshow'));
  doc.visibilityState = 'visible';
  doc.dispatchEvent(new Event('visibilitychange'));
  stopShow(); stopHide();
  doc.defaultView.dispatchEvent(new Event('pagehide'));
  assert.deepEqual(received, ['hide', 'show']);
});

test('native capsule position supplements the safe area when the geometry is available', () => {
  const tt = {
    getSystemInfoSync() {
      return { screenWidth: 393, screenHeight: 852, safeArea: { top: 59, right: 393, bottom: 818, left: 0 } };
    },
    getMenuButtonLayout() {
      assert.equal(this, tt);
      return { bottom: 101 };
    },
  };
  const platform = makePlatform({ tt });
  const safeArea = { top: 59, right: 0, bottom: 34, left: 0 };
  assert.deepEqual(platform.getSafeInsets(), { ...safeArea, menuBottom: 101 });
  tt.getMenuButtonLayout = () => { throw new Error('unsupported'); };
  assert.deepEqual(platform.getSafeInsets(), safeArea);
  tt.getMenuButtonLayout = () => ({ bottom: 853 });
  assert.deepEqual(platform.getSafeInsets(), safeArea);
});

test('WeChat uses its own durable journal and foreground callbacks with their native receiver', () => {
  const backing = new Map();
  const callbacks = new Set();
  const { storage } = storageHost();
  const wx = {
    getStorageSync(key) { assert.equal(this, wx); return backing.get(key) ?? ''; },
    setStorageSync(key, raw) { assert.equal(this, wx); backing.set(key, raw); },
    onShow(cb) { assert.equal(this, wx); callbacks.add(cb); },
    offShow(cb) { assert.equal(this, wx); assert.equal(callbacks.delete(cb), true); },
    onHide(cb) { assert.equal(this, wx); this.hide = cb; },
  };
  const host = { wx, localStorage: storage };
  const platform = makePlatform(host, 'night-shift.campaign');
  assert.equal(platform.kind, 'wechat');
  assert.equal(platform.checkpointPresence(), 'empty');
  assert.equal(platform.writeCheckpoint(1, { wave: 2 }), true);
  assert.deepEqual(makePlatform(host, 'night-shift.campaign').readCheckpoint(1), { wave: 2 });
  assert.equal(platform.checkpointPresence(), 'present');
  assert.equal(storage.getItem('night-shift.campaign.a'), null);
  assert.equal(platform.clearCheckpoint(), true);
  assert.equal(makePlatform(host, 'night-shift.campaign').readCheckpoint(1), null);

  const events = [];
  const stopShow = platform.onShow(() => events.push('show'));
  const stopHide = platform.onHide(() => events.push('hide'));
  for (const show of callbacks) show();
  wx.hide();
  stopShow();
  stopHide();
  for (const show of callbacks) show();
  wx.hide();
  assert.deepEqual(events, ['show', 'hide']);
});

test('WeChat normalizes screen-relative safe area and capsule to the gameplay window', () => {
  const wx = {
    getWindowInfo() {
      assert.equal(this, wx);
      return { screenWidth: 393, screenHeight: 852, screenTop: 24, windowHeight: 818,
        safeArea: { top: 59, right: 392, bottom: 818, left: 2 } };
    },
    getSystemInfoSync() { assert.fail('modern window info should be preferred'); },
    getMenuButtonBoundingClientRect() { assert.equal(this, wx); return { bottom: 101 }; },
  };
  const platform = makePlatform({ wx });
  assert.deepEqual(platform.getSafeInsets(), { top: 35, right: 1, bottom: 24, left: 2, menuBottom: 77 });
  wx.getWindowInfo = () => { throw new Error('older SDK'); };
  wx.getSystemInfoSync = function () {
    assert.equal(this, wx);
    return { screenWidth: 393, screenHeight: 852, safeArea: { top: 59, right: 393, bottom: 818, left: 0 } };
  };
  assert.deepEqual(platform.getSafeInsets(), { top: 59, right: 0, bottom: 34, left: 0, menuBottom: 101 });
  wx.getWindowInfo = () => ({ screenWidth: 393, screenHeight: 852 });
  wx.getMenuButtonBoundingClientRect = () => ({ bottom: 999 });
  assert.deepEqual(platform.getSafeInsets(), { top: 0, right: 0, bottom: 0, left: 0 });
});

test('native platform selection does not cross SDKs or accept a browser storage shim', () => {
  const { storage, host } = storageHost();
  assert.equal(miniGamePlatform(host), undefined);
  const wx = { getStorageSync: storage.getItem, setStorageSync: storage.setItem };
  const tt = { getSystemInfoSync: () => ({ screenWidth: 393, screenHeight: 852 }) };
  const native = { ...host, wx, tt };
  assert.equal(miniGamePlatform(native), 'douyin');
  const platform = makePlatform(native);
  assert.equal(platform.kind, 'douyin');
  assert.equal(platform.checkpointPresence(), 'unreadable');
  assert.equal(platform.writeCheckpoint(1, { wave: 2 }), false);
  assert.equal(platform.clearCheckpoint(), false);
  assert.equal(storage.getItem('night-shift.checkpoint.a'), null);
  assert.equal(miniGamePlatform({ ...native, tt: null }), 'wechat');
  assert.equal(makePlatform({ ...host, wx: {} }).writeCheckpoint(1, { wave: 2 }), false);
});

test('miniGameRuntime detects low-end devices, wires memory warning / audio interruption, and unsubscribes safely', () => {
  let gcCalls = 0;
  let fpsHint = 0;
  let memCb = null;
  let audioBegin = null;
  let audioEnd = null;
  const wx = {
    getDeviceInfo() { return { platform: 'iOS' }; },
    getSystemInfoSync() { return { benchmarkLevel: 14, platform: 'ios' }; },
    triggerGC() { gcCalls++; },
    setPreferredFramesPerSecond(fps) { fpsHint = fps; },
    onMemoryWarning(cb) { memCb = cb; },
    offMemoryWarning(cb) { if (memCb === cb) memCb = null; },
    onAudioInterruptionBegin(cb) { audioBegin = cb; },
    offAudioInterruptionBegin(cb) { if (audioBegin === cb) audioBegin = null; },
    onAudioInterruptionEnd(cb) { audioEnd = cb; },
    offAudioInterruptionEnd(cb) { if (audioEnd === cb) audioEnd = null; },
  };
  const rt = createMiniGameRuntime({ wx });
  assert.equal(rt.isLowEndDevice, true);
  assert.equal(rt.isIOS, true);

  rt.triggerGC();
  rt.hintFrameRate(45);
  rt.hintFrameRate(5); // Out-of-range FPS ignored
  assert.equal(gcCalls, 1);
  assert.equal(fpsHint, 45);

  const events = [];
  const offMem = rt.onMemoryWarning((lvl) => events.push(`mem:${lvl}`));
  const offAudio = rt.onAudioInterruption(() => events.push('begin'), () => events.push('end'));
  memCb({ level: 15 });
  audioBegin();
  audioEnd();
  offMem();
  offAudio();
  assert.equal(memCb, null);
  assert.equal(audioBegin, null);
  assert.equal(audioEnd, null);
  assert.deepEqual(events, ['mem:15', 'begin', 'end']);

  // High-end & browser fallback should never flag as low-end
  const highEnd = createMiniGameRuntime({ wx: { getDeviceInfo: () => ({ benchmarkLevel: 38, platform: 'android' }) } });
  assert.equal(highEnd.isLowEndDevice, false);
  assert.equal(highEnd.isIOS, false);
  const browser = createMiniGameRuntime({});
  assert.equal(browser.isLowEndDevice, false);
  browser.triggerGC();
  browser.hintFrameRate(45);
});
