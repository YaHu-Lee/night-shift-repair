import { safeId } from '../campaign/CampaignLedger';
import { validBackup } from '../campaign/CampaignBackup';
import type { CampaignBackup, CampaignBackupTransport, ConfirmedBackup } from '../campaign/CampaignBackup';

interface CloudResponse {
    statusCode: number;
    data: unknown;
}

interface NativeCloud {
    callContainer(request: {
        path: string;
        init: { method: 'POST'; header: Record<string, string>; body: object; timeout: number };
        success(response: CloudResponse): void;
        fail(failure: unknown): void;
    }): unknown;
}

type NetworkListener = (status: { isConnected: boolean }) => void;

interface CloudHost {
    tt?: {
        createCloud?: (options: { envID: string; serviceID: string }) => NativeCloud;
        onNetworkStatusChange?: (listener: NetworkListener) => void;
        offNetworkStatusChange?: (listener: NetworkListener) => void;
    };
}

/** Backed by an authenticated service with one monotonic archive per platform account. */
export function createCampaignCloud(envID: string, serviceID: string, host: CloudHost = globalThis as CloudHost,
    timeoutMs = 6000): CampaignBackupTransport | null {
    const native = host.tt;
    if (!envID || !serviceID || typeof native?.createCloud !== 'function') return null;
    let cloud: NativeCloud;
    try {
        cloud = native.createCloud({ envID, serviceID });
        if (typeof cloud?.callContainer !== 'function') return null;
    } catch {
        return null;
    }
    function request(body: object): Promise<ConfirmedBackup> {
        return new Promise((resolve, reject) => {
            let pending = true;
            const fail = (failure: unknown) => {
                if (!pending) return;
                pending = false;
                clearTimeout(timer);
                reject(failure);
            };
            const timer = setTimeout(() => fail(new Error('Cloud request timed out')), timeoutMs);
            try {
                const task = cloud.callContainer({
                    path: '/campaign-progress',
                    init: { method: 'POST', header: { 'content-type': 'application/json' }, body, timeout: timeoutMs },
                    success(response) {
                        if (!pending) return;
                        try {
                            const payload: unknown = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                            const data = payload as Partial<ConfirmedBackup> | null;
                            if (response.statusCode !== 200 || !data || !safeId(data.scope) || !validBackup(data.progress)) {
                                fail(new Error('Cloud campaign response unavailable'));
                                return;
                            }
                            pending = false;
                            clearTimeout(timer);
                            resolve({ scope: data.scope, progress: data.progress });
                        } catch (failure) {
                            fail(failure);
                        }
                    },
                    fail,
                });
                // Some SDK wrappers return a Promise even when the call uses callbacks.
                void Promise.resolve(task).catch(fail);
            } catch (failure) {
                fail(failure);
            }
        });
    }
    return {
        read: () => request({ action: 'read' }),
        merge: (scope: string, progress: CampaignBackup) => request({ action: 'merge', expectedScope: scope, progress }),
        onOnline(callback) {
            let active = true;
            const changed: NetworkListener = status => { if (active && status?.isConnected === true) callback(); };
            try { native.onNetworkStatusChange?.(changed); } catch { active = false; }
            return () => {
                active = false;
                try { native.offNetworkStatusChange?.(changed); } catch { /* older hosts may omit removal */ }
            };
        },
    };
}
