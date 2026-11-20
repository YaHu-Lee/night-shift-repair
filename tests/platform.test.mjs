import assert from 'node:assert/strict';
import test from 'node:test';
import { makePlatform } from '../assets/scripts/platform/platform.ts';

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
