/** Local, best-effort platform boundary. No network, credentials, or engine dependencies. */
export interface SafeInsets { top: number; right: number; bottom: number; left: number; menuBottom?: number }
type CheckpointValidator = (value: unknown) => boolean;
export type MiniGamePlatform = 'douyin' | 'wechat';
export interface Platform {
  readonly kind: MiniGamePlatform | 'browser' | 'memory';
  onShow(cb: () => void): () => void;
  onHide(cb: () => void): () => void;
  getSafeInsets(): SafeInsets;
  readCheckpoint<T>(version: number, validate?: CheckpointValidator): T | null;
  writeCheckpoint<T>(version: number, value: T, validate?: CheckpointValidator): boolean;
  clearCheckpoint(): boolean;
  checkpointPresence?(ignoreCleared?: boolean): 'empty' | 'present' | 'unreadable';
}
type NativeEvent = 'onShow' | 'onHide' | 'offShow' | 'offHide';
type NativeWindowInfo = {
  screenWidth?: number;
  screenHeight?: number;
  safeArea?: Partial<Pick<SafeInsets, 'top' | 'right' | 'bottom' | 'left'>>;
  screenTop?: number;
  windowHeight?: number;
};
type MiniGameSdk = Partial<Record<NativeEvent, (cb: () => void) => void>> & {
  getStorageSync?(key: string): unknown;
  setStorageSync?(key: string, text: string): void;
  getSystemInfoSync?(): NativeWindowInfo;
};
type TT = MiniGameSdk & {
  getMenuButtonLayout?(): { bottom?: number };
};
type WX = MiniGameSdk & {
  getWindowInfo?(): NativeWindowInfo;
  getMenuButtonBoundingClientRect?(): { bottom?: number };
};
type StorageLike = { getItem(key: string): string | null; setItem(key: string, text: string): void };
type Store = { get(key: string): unknown; put(key: string, text: string): void };
type NativeGlobals = { tt?: unknown; wx?: unknown };
type Host = { tt?: TT; wx?: WX; localStorage?: StorageLike; document?: Document };
type Entry = { format: 1; sequence: number; version: number; payload: string; check: string };
type Slot = { key: string; entry: Entry };
const DEFAULT_CHECKPOINT = 'night-shift.checkpoint';
type SlotKeys = readonly [string, string];
const MAX_TEXT_LENGTH = 64 * 1024;

export function miniGamePlatform(host: NativeGlobals = globalThis as NativeGlobals): MiniGamePlatform | undefined {
  if (host.tt && typeof host.tt === 'object') return 'douyin';
  if (host.wx && typeof host.wx === 'object') return 'wechat';
  return undefined;
}

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

function decodeSlot(raw: unknown, key: string): Slot | null {
  try {
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
function newestFirst(values: (Slot | null)[]): Slot[] {
  return values
    .filter((slot): slot is Slot => slot !== null)
    .sort((a, b) => b.entry.sequence - a.entry.sequence);
}
function slots(store: Store, keys: SlotKeys): Slot[] {
  return newestFirst(keys.map(key => {
    try { return decodeSlot(store.get(key), key); } catch { return null; }
  }));
}
function readCompatibleSlot(journal: readonly Slot[], version: number, validate?: CheckpointValidator) {
  for (const { key, entry } of journal) {
    // A tombstone or incompatible current version is intentional, not corruption.
    if (entry.version !== version) return null;
    try {
      const value: unknown = JSON.parse(entry.payload);
      if (!validate || validate(value)) return { key, value };
    } catch { /* a rejected schema can recover the previous same-version checkpoint */ }
  }
  return null;
}
function commit(store: Store, keys: SlotKeys, version: number, payload: string, validate?: CheckpointValidator): boolean {
  let journal: Slot[];
  try { journal = newestFirst(keys.map(key => decodeSlot(store.get(key), key))); }
  catch { return false; }
  const previous = journal[0];
  const sequence = (previous?.entry.sequence ?? 0) + 1;
  if (!revision(sequence) || payload.length > MAX_TEXT_LENGTH) return false;
  const entry: Entry = { format: 1, sequence, version, payload, check: fingerprint(sequence, version, payload) };
  const raw = JSON.stringify(entry);
  if (raw.length > MAX_TEXT_LENGTH) return false;
  const recovered = validate ? readCompatibleSlot(journal, version, validate) : null;
  const protectedKey = recovered?.key ?? previous?.key;
  const key = protectedKey === keys[0] ? keys[1] : keys[0];
  try {
    store.put(key, raw);
    return store.get(key) === raw;
  } catch {
    return false;
  }
}

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function nativeInsets(info: NativeWindowInfo | undefined, menuBottom: () => number | undefined,
  useWindowBounds = false): SafeInsets {
  const width = info?.screenWidth;
  const height = info?.screenHeight;
  const insets = noInsets();
  if (!positive(height)) return insets;
  let windowTop = 0;
  let windowBottom = height;
  if (useWindowBounds && info && typeof info.screenTop === 'number' && info.screenTop >= 0
    && positive(info.windowHeight) && info.screenTop + info.windowHeight <= height) {
    windowTop = info.screenTop;
    windowBottom = windowTop + info.windowHeight;
  }
  const area = info?.safeArea;
  if (area && positive(width)) {
    const { top, right, bottom, left } = area;
    if (typeof top === 'number' && typeof left === 'number' && typeof bottom === 'number' && typeof right === 'number'
      && left >= 0 && top >= 0 && right > left && bottom > top && right <= width && bottom <= height) {
      Object.assign(insets, {
        top: Math.max(0, Math.min(windowBottom, top) - windowTop), right: width - right,
        bottom: Math.max(0, windowBottom - Math.max(windowTop, bottom)), left,
      });
    }
  }
  try {
    const bottom = menuBottom();
    if (positive(bottom) && bottom > windowTop && bottom <= windowBottom) insets.menuBottom = bottom - windowTop;
  } catch { /* Older clients can still provide a safe area. */ }
  return insets;
}

function wxWindowInfo(wx: WX): NativeWindowInfo | undefined {
  try {
    const info = wx.getWindowInfo?.();
    if (positive(info?.screenWidth) && positive(info?.screenHeight)) return info;
  } catch { /* Fall back to the older geometry API if the current host cannot provide window info. */ }
  return wx.getSystemInfoSync?.();
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

export function makePlatform(host: Host = globalThis as Host, checkpoint = DEFAULT_CHECKPOINT): Platform {
  const keys = [`${checkpoint}.a`, `${checkpoint}.b`] as const;
  const nativeKind = miniGamePlatform(host);
  const tt = nativeKind === 'douyin' ? host.tt : undefined;
  const wx = nativeKind === 'wechat' ? host.wx : undefined;
  const sdk = tt ?? wx;
  const doc = sdk ? undefined : host.document;
  let storage: StorageLike | undefined;
  if (!sdk) {
    try { storage = host.localStorage; } catch { /* private/restricted context */ }
  }
  const nativeStorage = sdk && typeof sdk.getStorageSync === 'function' && typeof sdk.setStorageSync === 'function';
  const volatile = new Map<string, string>();
  const store: Store = nativeStorage
    ? { get: (key) => sdk.getStorageSync!(key), put: (key, text) => { sdk.setStorageSync!(key, text); } }
    : storage
      ? { get: (key) => storage!.getItem(key), put: (key, text) => storage!.setItem(key, text) }
      : { get: (key) => volatile.get(key), put: (key, text) => { volatile.set(key, text); } };

  function listen(show: boolean, cb: () => void): () => void {
    let active = true;
    const run = () => { if (active) cb(); };
    if (sdk) {
      const on = show ? sdk.onShow : sdk.onHide;
      const off = show ? sdk.offShow : sdk.offHide;
      try { on?.call(sdk, run); } catch { active = false; }
      return () => {
        if (!active) return;
        active = false;
        try { off?.call(sdk, run); } catch { /* guard older host APIs */ }
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
    kind: nativeKind ?? (doc || storage ? 'browser' : 'memory'),
    onShow: (cb) => listen(true, cb),
    onHide: (cb) => listen(false, cb),
    getSafeInsets() {
      try {
        if (wx) return nativeInsets(wxWindowInfo(wx), () => wx.getMenuButtonBoundingClientRect?.()?.bottom, true);
        if (tt) return nativeInsets(tt.getSystemInfoSync?.(), () => tt.getMenuButtonLayout?.()?.bottom);
        return browserInsets(doc);
      } catch { return noInsets(); }
    },
    readCheckpoint<T>(version: number, validate?: CheckpointValidator): T | null {
      if (!revision(version)) return null;
      return (readCompatibleSlot(slots(store, keys), version, validate)?.value ?? null) as T | null;
    },
    writeCheckpoint<T>(version: number, value: T, validate?: CheckpointValidator): boolean {
      if (!revision(version) || (sdk && !nativeStorage)) return false;
      try {
        const payload = JSON.stringify(value);
        return typeof payload === 'string' && (!validate || validate(JSON.parse(payload)))
          && commit(store, keys, version, payload, validate);
      } catch {
        return false;
      }
    },
    checkpointPresence(ignoreCleared = false) {
      if ((sdk && !nativeStorage) || (doc && !storage)) return 'unreadable';
      try {
        const values = keys.map((key) => store.get(key));
        if (ignoreCleared && newestFirst(values.map((raw, i) => decodeSlot(raw, keys[i])))[0]?.entry.version === 0) return 'empty';
        return values.some((value) => value !== null && value !== undefined && value !== '') ? 'present' : 'empty';
      } catch {
        return 'unreadable';
      }
    },
    clearCheckpoint() { return (!sdk || !!nativeStorage) && commit(store, keys, 0, ''); },
  };
}
