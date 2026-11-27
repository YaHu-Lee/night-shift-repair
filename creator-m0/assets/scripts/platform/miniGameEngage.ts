import { miniGamePlatform } from './platform';
import type { MiniGamePlatform } from './platform';
import type { RewardedRevive } from './rewardedRevive';
import type { RewardedPlacement } from '../roguelite/types';

interface LaunchOptions {
    readonly scene?: string | number;
    readonly launch_from?: string;
    readonly location?: string;
}

interface MiniGameEngageSdk {
    getLaunchOptionsSync?(): LaunchOptions;
    onShow?(cb: (options?: LaunchOptions) => void): void;
    offShow?(cb: (options?: LaunchOptions) => void): void;
    checkScene?(opts: { scene: string; success?: (res: { isExist?: boolean }) => void; fail?: () => void }): void;
    navigateToScene?(opts: { scene: string; success?: () => void; fail?: () => void }): void;
    shareAppMessage?(opts: { title: string; desc?: string; query?: string }): void;
}

interface EngageHost {
    tt?: MiniGameEngageSdk;
    wx?: MiniGameEngageSdk;
}

export interface MiniGameEngage {
    readonly platform: MiniGamePlatform | 'browser';
    readonly hasRewardedAd: boolean;
    readonly isDouyinSidebarEntry: boolean;
    readonly canOpenSidebar: boolean;
    readonly canShare: boolean;
    requestReward(
        placement: RewardedPlacement,
        options?: { readonly adFreePass?: boolean; readonly onShown?: () => void },
    ): Promise<boolean>;
    openSidebar(): Promise<boolean>;
    shareResult(title: string, desc: string): boolean;
    cancel(): void;
    dispose(): void;
}

function isSidebarLaunch(opts?: LaunchOptions | null): boolean {
    if (!opts) return false;
    const scene = String(opts.scene ?? '');
    return opts.location === 'sidebar_card'
        || (opts.launch_from === 'homepage' && scene.endsWith('3030'))
        || scene === '021036'
        || scene === '101036';
}

export function createMiniGameEngage(
    rewardedAd: RewardedRevive | null,
    options: { readonly host?: EngageHost } = {},
): MiniGameEngage {
    const host = options.host ?? (globalThis as EngageHost);
    const kind = miniGamePlatform(host);
    const native = kind === 'douyin' ? host.tt : kind === 'wechat' ? host.wx : undefined;
    let sidebarEntry = false;
    let sidebarSupported: boolean | undefined;
    let busy = false;
    let disposed = false;

    if (kind === 'douyin' && native) {
        try {
            sidebarEntry = isSidebarLaunch(native.getLaunchOptionsSync?.());
        } catch {
            sidebarEntry = false;
        }
        try {
            native.checkScene?.({
                scene: 'sidebar',
                success: res => { sidebarSupported = res?.isExist === true; },
            });
        } catch {
            sidebarSupported = undefined;
        }
    }

    const onShowListener = (showOpts?: LaunchOptions) => {
        if (isSidebarLaunch(showOpts)) sidebarEntry = true;
    };
    if (kind === 'douyin' && native?.onShow) {
        try { native.onShow(onShowListener); } catch { /* ignore older runtime */ }
    }

    return {
        get platform() { return kind ?? 'browser'; },
        get hasRewardedAd() { return !!rewardedAd; },
        get isDouyinSidebarEntry() { return sidebarEntry; },
        get canOpenSidebar() {
            return kind === 'douyin' && sidebarSupported !== false && typeof native?.navigateToScene === 'function';
        },
        get canShare() { return typeof native?.shareAppMessage === 'function'; },

        async requestReward(_placement, opts = {}) {
            if (disposed || busy) return false;
            if (opts.adFreePass) return true;
            if (!rewardedAd) return false;
            busy = true;
            try {
                return await rewardedAd.show(opts.onShown);
            } finally {
                busy = false;
            }
        },

        openSidebar() {
            if (kind !== 'douyin' || sidebarSupported === false || typeof native?.navigateToScene !== 'function') {
                return Promise.resolve(false);
            }
            return new Promise<boolean>(resolve => {
                try {
                    native.navigateToScene!({
                        scene: 'sidebar',
                        success: () => resolve(true),
                        fail: () => resolve(false),
                    });
                } catch {
                    resolve(false);
                }
            });
        },

        shareResult(title, desc) {
            if (typeof native?.shareAppMessage !== 'function') return false;
            try {
                native.shareAppMessage({ title, desc });
                return true;
            } catch {
                return false;
            }
        },

        cancel() {
            rewardedAd?.cancel();
        },

        dispose() {
            disposed = true;
            rewardedAd?.cancel();
            if (kind === 'douyin' && native?.offShow) {
                try { native.offShow(onShowListener); } catch { /* ignore */ }
            }
        },
    };
}
