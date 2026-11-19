/** Local, best-effort platform boundary. No network, credentials, or engine dependencies. */
export interface SafeInsets { top: number; right: number; bottom: number; left: number }
export interface Platform {
  readonly kind: 'douyin' | 'browser' | 'memory';
  onShow(cb: () => void): () => void;
  onHide(cb: () => void): () => void;
  getSafeInsets(): SafeInsets;
  readCheckpoint<T>(version: number, validate?: (value: unknown) => boolean): T | null;
  writeCheckpoint<T>(version: number, value: T): boolean;
  clearCheckpoint(): boolean;
}
type NativeEvent = 'onShow' | 'onHide' | 'offShow' | 'offHide';
type TT = Partial<Record<NativeEvent, (cb: () => void) => void>> & {
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, text: string): void;
  getSystemInfoSync?(): {
    screenWidth?: number;
    screenHeight?: number;
    safeArea?: Partial<SafeInsets>;
  };
};
type StorageLike = { getItem(key: string): string | null; setItem(key: string, text: string): void };
type Store = { get(key: string): unknown; put(key: string, text: string): void };
type Host = { tt?: TT; localStorage?: StorageLike; document?: Document };
type Entry = { format: 1; sequence: number; version: number; payload: string; check: string };
type Slot = { key: string; entry: Entry };
const KEYS = ['night-shift.checkpoint.a', 'night-shift.checkpoint.b'] as const;
const MAX_TEXT_LENGTH = 64 * 1024;

function noInsets(): SafeInsets { return { top: 0, right: 0, bottom: 0, left: 0 }; }
function revision(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** Detects accidental corruption, not tampering. */
function checksum(text: string): string {
  let code = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    code = Math.imul(code ^ text.charCodeAt(i), 0x01000193);
  }
  return (code >>> 0).toString(16);
}
function fingerprint(sequence: number, version: number, payload: string): string {
  return checksum(`${sequence}:${version}:${payload}`);
}

function readSlot(store: Store, key: string): Slot | null {
  try {
    const raw = store.get(key);
    if (typeof raw !== 'string' || raw.length > MAX_TEXT_LENGTH) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const entry = value as Entry;
    if (entry.format !== 1 || !revision(entry.sequence)
      || !(entry.version === 0 || revision(entry.version))
      || typeof entry.payload !== 'string'
      || entry.check !== fingerprint(entry.sequence, entry.version, entry.payload)) return null;
    if (entry.version === 0 && entry.payload !== '') return null;
    if (entry.version !== 0) JSON.parse(entry.payload); // Validate the wire payload before using its generation.
    return { key, entry };
  } catch {
    return null;
  }
}
function slots(store: Store): Slot[] {
  return KEYS.map((key) => readSlot(store, key))
    .filter((slot): slot is Slot => slot !== null)
    .sort((a, b) => b.entry.sequence - a.entry.sequence);
}
function commit(store: Store, version: number, payload: string): boolean {
  const previous = slots(store)[0];
  const sequence = (previous?.entry.sequence ?? 0) + 1;
  if (!revision(sequence) || payload.length > MAX_TEXT_LENGTH) return false;
  const entry: Entry = { format: 1, sequence, version, payload, check: fingerprint(sequence, version, payload) };
  const raw = JSON.stringify(entry);
  if (raw.length > MAX_TEXT_LENGTH) return false;
  const key = previous?.key === KEYS[0] ? KEYS[1] : KEYS[0];
  try {
    store.put(key, raw);
    return store.get(key) === raw;
  } catch {
    return false;
  }
}

function ttInsets(tt: TT): SafeInsets {
  const info = tt.getSystemInfoSync?.();
  const width = info?.screenWidth;
  const height = info?.screenHeight;
  const area = info?.safeArea;
  if (!area || !Number.isFinite(width) || !Number.isFinite(height)) return noInsets();
  const { top, right, bottom, left } = area;
  if (!Number.isFinite(top) || !Number.isFinite(right)
    || !Number.isFinite(bottom) || !Number.isFinite(left)
    || left! < 0 || top! < 0 || right! <= left! || bottom! <= top!
    || right! > width! || bottom! > height!) return noInsets();
  return { top: top!, right: width! - right!, bottom: height! - bottom!, left: left! };
}
function browserInsets(doc?: Document): SafeInsets {
  if (!doc?.body || !doc.defaultView) return noInsets();
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;'
    + 'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) '
    + 'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  doc.body.appendChild(probe);
  try {
    const style = doc.defaultView.getComputedStyle(probe);
    const px = (value: string) => Math.max(0, Number.parseFloat(value) || 0);
    return { top: px(style.paddingTop), right: px(style.paddingRight),
      bottom: px(style.paddingBottom), left: px(style.paddingLeft) };
  } finally {
    probe.remove();
  }
}

export function makePlatform(host: Host = globalThis as Host): Platform {
  const tt = host.tt;
  const doc = host.document;
  let storage: StorageLike | undefined;
  if (!tt) {
    try { storage = host.localStorage; } catch { /* private/restricted context */ }
  }
  const volatile = new Map<string, string>();
  const store: Store = tt && typeof tt.getStorageSync === 'function' && typeof tt.setStorageSync === 'function'
    ? { get: (key) => tt.getStorageSync!(key), put: (key, text) => { tt.setStorageSync!(key, text); } }
    : storage
      ? { get: (key) => storage!.getItem(key), put: (key, text) => storage!.setItem(key, text) }
      : { get: (key) => volatile.get(key), put: (key, text) => { volatile.set(key, text); } };

  function listen(show: boolean, cb: () => void): () => void {
    let active = true;
    const run = () => { if (active) cb(); };
    if (tt) {
      const on = show ? tt.onShow : tt.onHide;
      const off = show ? tt.offShow : tt.offHide;
      try { on?.call(tt, run); } catch { active = false; }
      return () => {
        if (!active) return;
        active = false;
        try { off?.call(tt, run); } catch { /* guard older host APIs */ }
      };
    }
    if (!doc) return () => { active = false; };
    let visible = doc.visibilityState !== 'hidden';
    const update = (nextVisible: boolean) => {
      if (visible === nextVisible) return;
      visible = nextVisible;
      if (show === nextVisible) run();
    };
    const visibilityChange = () => update(doc.visibilityState !== 'hidden');
    const pageShow = () => update(true);
    const pageHide = () => update(false);
    doc.addEventListener('visibilitychange', visibilityChange);
    doc.defaultView?.addEventListener('pageshow', pageShow);
    doc.defaultView?.addEventListener('pagehide', pageHide);
    return () => {
      active = false;
      doc.removeEventListener('visibilitychange', visibilityChange);
      doc.defaultView?.removeEventListener('pageshow', pageShow);
      doc.defaultView?.removeEventListener('pagehide', pageHide);
    };
  }

  return {
    kind: tt ? 'douyin' : (doc || storage ? 'browser' : 'memory'),
    onShow: (cb) => listen(true, cb),
    onHide: (cb) => listen(false, cb),
    getSafeInsets() {
      try { return tt ? ttInsets(tt) : browserInsets(doc); } catch { return noInsets(); }
    },
    readCheckpoint<T>(version: number, validate?: (value: unknown) => boolean): T | null {
      if (!revision(version)) return null;
      for (const { entry } of slots(store)) {
        // A tombstone or incompatible current version is intentional, not corruption.
        if (entry.version !== version) return null;
        try {
          const value: unknown = JSON.parse(entry.payload);
          if (!validate || validate(value)) return value as T;
        } catch { /* a rejected schema can recover the previous same-version checkpoint */ }
      }
      return null;
    },
    writeCheckpoint<T>(version: number, value: T): boolean {
      if (!revision(version)) return false;
      try {
        const payload = JSON.stringify(value);
        return typeof payload === 'string' && commit(store, version, payload);
      } catch {
        return false;
      }
    },
    clearCheckpoint() { return commit(store, 0, ''); },
  };
}
