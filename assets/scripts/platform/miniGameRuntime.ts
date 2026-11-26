import { miniGamePlatform } from './platform';

interface RuntimeSdk {
    triggerGC?(): void;
    setPreferredFramesPerSecond?(fps: number): void;
    onMemoryWarning?(cb: (res?: { level?: number }) => void): void;
    offMemoryWarning?(cb: (res?: { level?: number }) => void): void;
    onAudioInterruptionBegin?(cb: () => void): void;
    offAudioInterruptionBegin?(cb: () => void): void;
    onAudioInterruptionEnd?(cb: () => void): void;
    offAudioInterruptionEnd?(cb: () => void): void;
    getSystemInfoSync?(): { readonly benchmarkLevel?: number; readonly platform?: string };
    getDeviceInfo?(): { readonly benchmarkLevel?: number; readonly platform?: string };
}

interface RuntimeHost {
    tt?: RuntimeSdk;
    wx?: RuntimeSdk;
}

export interface MiniGameRuntime {
    readonly isLowEndDevice: boolean;
    readonly isIOS: boolean;
    triggerGC(): void;
    hintFrameRate(fps: number): void;
    onMemoryWarning(listener: (level: number) => void): () => void;
    onAudioInterruption(onBegin: () => void, onEnd: () => void): () => void;
}

export function createMiniGameRuntime(host: RuntimeHost = globalThis as RuntimeHost): MiniGameRuntime {
    const kind = miniGamePlatform(host);
    const native = kind === 'douyin' ? host.tt : kind === 'wechat' ? host.wx : undefined;

    let benchmarkLevel = -1;
    let platformName = '';
    if (native) {
        try {
            const dev = native.getDeviceInfo?.();
            if (typeof dev?.benchmarkLevel === 'number') benchmarkLevel = dev.benchmarkLevel;
            if (typeof dev?.platform === 'string') platformName = dev.platform.toLowerCase();
            if (benchmarkLevel < 0 || !platformName) {
                const sys = native.getSystemInfoSync?.();
                if (benchmarkLevel < 0 && typeof sys?.benchmarkLevel === 'number') benchmarkLevel = sys.benchmarkLevel;
                if (!platformName && typeof sys?.platform === 'string') platformName = sys.platform.toLowerCase();
            }
        } catch {
            // Fall back safely on older runtimes
        }
    }

    const isLowEndDevice = benchmarkLevel > 0 && benchmarkLevel < 22;
    const isIOS = platformName === 'ios';

    return {
        isLowEndDevice,
        isIOS,

        triggerGC() {
            try { native?.triggerGC?.(); } catch { /* ignore unsupported runtime */ }
        },

        hintFrameRate(fps: number) {
            if (!Number.isFinite(fps) || fps < 15 || fps > 60) return;
            try { native?.setPreferredFramesPerSecond?.(Math.round(fps)); } catch { /* ignore */ }
        },

        onMemoryWarning(listener) {
            if (!native?.onMemoryWarning) return () => {};
            let active = true;
            const handler = (res?: { level?: number }) => {
                if (!active) return;
                const level = typeof res?.level === 'number' ? res.level : 10;
                listener(level);
            };
            try { native.onMemoryWarning(handler); } catch { active = false; }
            return () => {
                active = false;
                try { native.offMemoryWarning?.(handler); } catch { /* ignore */ }
            };
        },

        onAudioInterruption(onBegin, onEnd) {
            if (!native?.onAudioInterruptionBegin && !native?.onAudioInterruptionEnd) return () => {};
            let active = true;
            const begin = () => { if (active) onBegin(); };
            const end = () => { if (active) onEnd(); };
            try { native.onAudioInterruptionBegin?.(begin); } catch { /* ignore */ }
            try { native.onAudioInterruptionEnd?.(end); } catch { /* ignore */ }
            return () => {
                active = false;
                try { native.offAudioInterruptionBegin?.(begin); } catch { /* ignore */ }
                try { native.offAudioInterruptionEnd?.(end); } catch { /* ignore */ }
            };
        },
    };
}
