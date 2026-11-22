import { miniGamePlatform } from './platform';

type CloseListener = (result?: { isEnded?: boolean; count?: number }) => void;
type ErrorListener = (failure: unknown) => void;

interface NativeVideo {
    load?(): Promise<void> | void;
    show(): Promise<void> | void;
    onClose(callback: CloseListener): void;
    offClose(callback: CloseListener): void;
    onError(callback: ErrorListener): void;
    offError(callback: ErrorListener): void;
    destroy?(): Promise<void> | void;
}

type AdSdk = { createRewardedVideoAd?: (options: { adUnitId: string }) => NativeVideo };
interface AdHost {
    tt?: AdSdk;
    wx?: AdSdk;
}

export interface RewardedAdUnits {
    readonly douyin?: string;
    readonly wechat?: string;
}

export interface RewardedRevive {
    /** True only after the native instance confirms a complete viewing. */
    show(onShown?: () => void): Promise<boolean>;
    /** Stop waiting without giving a reward. A later attempt can use the adapter. */
    cancel(): void;
    dispose(): void;
}

const busyAdHosts = new WeakSet<object>();

export function createRewardedRevive(adUnits: RewardedAdUnits | string, host: AdHost = globalThis as AdHost,
    timeoutMs = 120_000): RewardedRevive | null {
    const platform = miniGamePlatform(host);
    if (!platform) return null;
    const native = platform === 'douyin' ? host.tt : host.wx;
    const units = typeof adUnits === 'string' ? { douyin: adUnits } : adUnits;
    const unit = units[platform]?.trim();
    const create = native?.createRewardedVideoAd;
    if (!unit || !native || typeof create !== 'function') return null;
    let disposed = false;
    let cancel: (() => void) | null = null;
    return {
        show(onShown) {
            // Both SDKs expose a singleton. Keep its lease until native cleanup settles.
            if (disposed || busyAdHosts.has(native)) return Promise.resolve(false);
            busyAdHosts.add(native);
            return new Promise<boolean>(resolve => {
                let ad: NativeVideo | undefined;
                let timer: ReturnType<typeof setTimeout> | undefined;
                let settled = false;
                let shown = false;
                let showing = false;
                let retried = false;
                let reloadScheduled = false;
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
                        void Promise.resolve(ad?.destroy?.()).then(releaseHost, releaseHost);
                    } catch {
                        releaseHost();
                    }
                    resolve(rewarded);
                };
                const onClose: CloseListener = result => {
                    if (!showing) return;
                    const count = result?.count;
                    const hasCount = platform === 'douyin' && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0;
                    if (hasCount || typeof result?.isEnded === 'boolean') reportShown();
                    finish(hasCount ? count > 0 : result?.isEnded === true);
                };
                const showNative = () => {
                    if (!ad || settled) return;
                    const wasRetry = retried;
                    const current = () => wasRetry === retried;
                    showing = true;
                    try {
                        const showingAd = ad.show();
                        if (showingAd) void Promise.resolve(showingAd).then(() => {
                            if (current()) reportShown();
                        }, failure => { if (current()) onError(failure); });
                    } catch (failure) {
                        if (current()) onError(failure);
                    }
                };
                const onError: ErrorListener = () => {
                    if (settled || reloadScheduled) return;
                    if (platform !== 'wechat' || shown || retried || !ad?.load) {
                        finish(false);
                        return;
                    }
                    // WeChat recommends one load-and-show retry when the first show cannot run.
                    showing = false;
                    retried = reloadScheduled = true;
                    void Promise.resolve().then(() => {
                        reloadScheduled = false;
                        return settled ? undefined : ad?.load?.();
                    }).then(showNative, () => finish(false));
                };
                cancel = () => finish(false);
                try {
                    ad = create.call(native, { adUnitId: unit });
                    ad.onClose(onClose);
                    ad.onError(onError);
                    if (settled) return;
                    timer = setTimeout(() => finish(false), timeoutMs);
                    if (!retried) showNative();
                } catch {
                    finish(false);
                }
            });
        },
        cancel() { cancel?.(); },
        dispose() { disposed = true; cancel?.(); },
    };
}
