import assert from 'node:assert/strict';
import { test } from 'node:test';

function makeHost(storage) {
  const frames = [];
  const handles = new EventTarget();
  const pixels = [];
  let capture = null;
  const context = {
    fillStyle: '',
    fillRect(x, y, w, h) { pixels.push([this.fillStyle, x, y, w, h]); },
    beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}, arc() {},
  };
  const canvas = Object.assign(new EventTarget(), {
    getContext(kind) { assert.equal(kind, '2d'); return context; },
    getBoundingClientRect() { return { left: 5, top: 10, width: 180, height: 320 }; },
    setPointerCapture(id) { capture = id; },
  });
  const elements = Object.fromEntries(['pause','pauseBanner','stats','status','save','load','restart'].map((id) => [id, {}]));
  const document = Object.assign(new EventTarget(), {
    visibilityState: 'visible', defaultView: handles,
    querySelector(id) { return id === '#arena' ? canvas : elements[id.slice(1)]; },
  });
  let timestamp = 0;
  function frame(count = 1) {
    for (let n = 0; n < count; n++) {
      assert.equal(frames.length, 1);
      pixels.length = 0;
      frames.shift()(timestamp += 1000 / 60);
    }
  }
  function pointer(type, x, y, pointerId = 7) {
    canvas.dispatchEvent(Object.assign(new Event(type), {
      pointerId, clientX: 5 + x / 2, clientY: 10 + y / 2,
    }));
  }
  const bindings = {
    addEventListener: handles.addEventListener.bind(handles),
    requestAnimationFrame(fn) { frames.push(fn); },
    document,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
  };
  return {
    bindings, elements, pixels, handles, frame, pointer, document,
    get capture() { return capture; },
    player() {
      const entries = pixels.filter(([color]) => color === '#eaf8ef');
      assert.equal(entries.length, 1, 'one player rectangle in the current frame');
      return entries[0];
    },
  };
}

test('actual browser entry renders peak load and supports touch, pause, background and checkpoint across fresh startup', async (t) => {
  const storage = new Map();
  const first = makeHost(storage);
  const original = new Map(Object.keys(first.bindings).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  function install(host) {
    for (const [key, value] of Object.entries(host.bindings)) {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    }
  }
  install(first);
  await import('../.m0-build/app.js?integration=first');
  first.frame(20);
  assert.equal(first.elements.pause.textContent, '暂停');
  assert.equal(first.elements.pauseBanner.hidden, true);
  assert.match(first.elements.stats.textContent, /Tick \d+ · 120\/160\/80/);
  for (const [color, count] of [['#ed806c',120],['#ffd488',160],['#74e7b0',80]]) {
    assert.equal(first.pixels.filter(([fill]) => fill === color).length, count);
  }
  const initial = first.player();
  first.elements.load.onclick();
  assert.equal(first.elements.status.textContent, '无有效检查点。');
  first.pointer('pointerdown',120,520);
  assert.equal(first.capture,7);
  first.pointer('pointermove',155,520,8); // secondary finger ignored
  first.frame(12);
  assert.deepEqual(first.player(),initial);
  first.pointer('pointermove',160,488);
  first.frame(12);
  const moved = first.player();
  assert.ok(moved[1] > initial[1], 'rightward touch moves the rendered player right');
  assert.ok(moved[2] < initial[2], 'upward touch moves the rendered player up');
  first.pointer('pointercancel',160,488);
  first.frame(18);
  assert.deepEqual(first.player(),moved);
  first.elements.pause.onclick();
  first.frame(20);
  assert.equal(first.elements.pauseBanner.hidden,false);
  assert.equal(first.elements.pause.textContent,'继续');
  const pausedTick = first.elements.stats.textContent.match(/^Tick (\d+)/)[1];
  first.frame(40);
  assert.equal(first.elements.stats.textContent.match(/^Tick (\d+)/)[1],pausedTick);
  first.elements.pause.onclick();
  first.frame(20);
  assert.equal(first.elements.pauseBanner.hidden,true);
  assert.ok(+first.elements.stats.textContent.match(/^Tick (\d+)/)[1] > +pausedTick);
  first.document.visibilityState = 'hidden';
  first.document.dispatchEvent(new Event('visibilitychange'));
  first.frame();
  assert.equal(first.elements.pauseBanner.hidden,false);
  first.document.visibilityState = 'visible';
  first.document.dispatchEvent(new Event('visibilitychange'));
  first.frame();
  assert.equal(first.elements.pause.textContent,'继续');
  first.elements.save.onclick();
  assert.match(first.elements.status.textContent,/已保存压力场景种子/);
  assert.ok(storage.size > 0);

  const second = makeHost(storage);
  install(second);
  await import('../.m0-build/app.js?integration=fresh');
  second.frame(20);
  assert.equal(second.elements.pauseBanner.hidden,false,'loaded seed requires explicit resume');
  assert.match(second.elements.stats.textContent,/^Tick 0 · 120\/160\/80/);
  assert.deepEqual(second.player(),initial);
  second.elements.load.onclick();
  assert.match(second.elements.status.textContent,/已恢复检查点/);
  second.elements.pause.onclick();
  second.frame(20);
  assert.equal(second.elements.pauseBanner.hidden,true);
  second.elements.restart.onclick();
  second.frame();
  assert.equal(second.elements.status.textContent,'已用相同种子重开。');
  assert.deepEqual(second.player(),initial);
});
