interface Sample { x: number; y: number }
interface Accelerometer {
    startAccelerometer(options: { interval: 'game'; fail: () => void }): void;
    stopAccelerometer(options: object): void;
    onAccelerometerChange(listener: (sample: Sample) => void): void;
    offAccelerometerChange(listener: (sample: Sample) => void): void;
}

/** Portrait gravity input in g. Capture a neutral grip each time control resumes. */
export class TiltMovement {
    private listener?: (sample: Sample) => void;
    private lastSample = 0;
    private neutral?: Sample;
    private smooth = { x: 0, y: 0 };
    private watchdog?: ReturnType<typeof setTimeout>;
    readonly axis = { x: 0, y: 0 };

    constructor(private readonly sdk = (globalThis as { wx?: Accelerometer }).wx) {}

    get available(): boolean {
        return typeof this.sdk?.startAccelerometer === 'function' && typeof this.sdk.stopAccelerometer === 'function' &&
            typeof this.sdk.onAccelerometerChange === 'function' && typeof this.sdk.offAccelerometerChange === 'function';
    }

    start(onFailure: () => void): void {
        if (this.listener) return;
        if (!this.available) { onFailure(); return; }
        const fail = () => {
            if (this.listener !== listener) return;
            this.stop();
            onFailure();
        };
        const listener = (sample: Sample) => {
            if (this.listener !== listener || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return;
            this.lastSample = Date.now();
            if (!this.neutral) this.neutral = { x: sample.x, y: sample.y };
            this.smooth.x += 0.35 * (sample.x - this.neutral.x - this.smooth.x);
            this.smooth.y += 0.35 * (sample.y - this.neutral.y - this.smooth.y);
            const length = Math.hypot(this.smooth.x, this.smooth.y);
            const scale = length > 0.055 ? Math.min(1, (length - 0.055) / 0.32) / length : 0;
            this.axis.x = this.smooth.x * scale;
            this.axis.y = this.smooth.y * scale;
        };
        this.listener = listener;
        try {
            this.lastSample = Date.now();
            const check = () => {
                if (this.listener !== listener) return;
                const remaining = 2500 - (Date.now() - this.lastSample);
                if (remaining <= 0) fail();
                else this.watchdog = setTimeout(check, remaining);
            };
            this.watchdog = setTimeout(check, 2500);
            this.sdk!.onAccelerometerChange(listener);
            this.sdk!.startAccelerometer({ interval: 'game', fail });
        } catch { fail(); }
    }

    stop(): void {
        const listener = this.listener;
        this.listener = undefined;
        if (this.watchdog !== undefined) clearTimeout(this.watchdog);
        this.watchdog = undefined;
        this.neutral = undefined;
        this.axis.x = this.axis.y = this.smooth.x = this.smooth.y = 0;
        if (!listener) return;
        try { this.sdk!.offAccelerometerChange(listener); } catch { /* SDK may already be suspended. */ }
        try { this.sdk!.stopAccelerometer({}); } catch { /* Ignore an already stopped device. */ }
    }
}
