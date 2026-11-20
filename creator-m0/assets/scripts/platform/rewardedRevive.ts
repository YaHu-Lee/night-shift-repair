type CloseListener = (result?: { isEnded?: boolean; count?: number }) => void;
type ErrorListener = (failure: unknown) => void;

interface NativeVideo {
    show(): Promise<void> | void;
    onClose(callback: CloseListener): void;
    offClose(callback: CloseListener): void;
    onError(callback: ErrorListener): void;
    offError(callback: ErrorListener): void;
    destroy(): Promise<void> | void;
}

interface AdHost {
    tt?: { createRewardedVideoAd?: (options: { adUnitId: string }) => NativeVideo };
}

export interface RewardedRevive {
    /** True only after the native instance confirms a complete viewing. */
    show(onShown?: () => void): Promise<boolean>;
    /** Stop waiting without giving a reward. A later attempt can use the adapter. */
    cancel(): void;
    dispose(): void;
}

const busyAdHosts = new WeakSet<object>();

export function createRewardedRevive(adUnitId: string, host: AdHost = globalThis as AdHost,
    timeoutMs = 120_000): RewardedRevive | null {
    const native = host.tt;
    const unit = adUnitId.trim();
    if (!unit || typeof native?.createRewardedVideoAd !== 'function') return null;
    let disposed = false;
    let cancel: (() => void) | null = null;
    return {
        show(onShown) {
            // Douyin exposes one native instance. Do not recreate it until its destroy promise settles.
            if (disposed || busyAdHosts.has(native)) return Promise.resolve(false);
            busyAdHosts.add(native);
            return new Promise<boolean>(resolve => {
                let ad: NativeVideo | undefined;
                let timer: ReturnType<typeof setTimeout> | undefined;
                let settled = false;
                let shown = false;
                const reportShown = () => {
                    if (settled || shown) return;
                    shown = true;
                    try { onShown?.(); } catch { /* Diagnostics cannot decide a reward. */ }
                };
                const finish = (rewarded: boolean) => {
                    if (settled) return;
                    settled = true;
                    cancel = null;
                    clearTimeout(timer);
                    try { ad?.offClose(onClose); } catch { /* a failed native handle can already be gone */ }
                    try { ad?.offError(onError); } catch { /* a failed native handle can already be gone */ }
                    const releaseHost = () => { busyAdHosts.delete(native); };
                    try {
                        void Promise.resolve(ad?.destroy()).then(releaseHost, releaseHost);
                    } catch {
                        releaseHost();
                    }
                    resolve(rewarded);
                };
                const onClose: CloseListener = result => {
                    const count = result?.count;
                    const hasCount = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
                    if (hasCount || typeof result?.isEnded === 'boolean') reportShown();
                    finish(hasCount ? count > 0 : result?.isEnded === true);
                };
                const onError: ErrorListener = () => finish(false);
                cancel = () => finish(false);
                try {
                    ad = native.createRewardedVideoAd!({ adUnitId: unit });
                    ad.onClose(onClose);
                    ad.onError(onError);
                    if (settled) return;
                    timer = setTimeout(onError, timeoutMs);
                    const showing = ad.show();
                    if (showing) void Promise.resolve(showing).then(reportShown, onError);
                } catch {
                    finish(false);
                }
            });
        },
        cancel() { cancel?.(); },
        dispose() { disposed = true; cancel?.(); },
    };
}
