import { assetManager, resources, Texture2D } from 'cc';
import type { AssetManager } from 'cc';
import { campaignArtBundle } from '../campaign/CampaignArt';

const inflight = new Map<string, Promise<AssetManager.Bundle | null>>();
const LOAD_DEADLINE_MS = 15_000;

function boundedLoad<T>(start: (complete: (error: Error | null, asset?: T | null) => boolean) => void): Promise<T | null> {
    return new Promise(resolve => {
        let pending = true;
        const finish = (asset: T | null) => {
            if (!pending) return false;
            pending = false;
            clearTimeout(deadline);
            resolve(asset);
            return true;
        };
        // One platform download may outlive this attempt. A late callback belongs to the old screen request.
        const deadline = setTimeout(() => finish(null), LOAD_DEADLINE_MS);
        try {
            start((error, asset) => finish(error ? null : asset ?? null));
        } catch {
            finish(null);
        }
    });
}

// The callback borrows the texture. Call addRef synchronously to keep it after the callback.
export function loadCampaignTexture(root: string, key: string, done: (texture: Texture2D | null) => void): void {
    const name = campaignArtBundle(key);
    const loadTexture = (bundle: AssetManager.Bundle, path: string) => {
        void boundedLoad<Texture2D>(complete => {
            bundle.load(path, Texture2D, (error, texture) => {
                if (error || !texture) {
                    complete(error);
                    return;
                }
                texture.addRef();
                if (!complete(null, texture)) texture.decRef();
            });
        }).then(texture => {
            try {
                done(texture);
            } finally {
                texture?.decRef();
            }
        });
    };
    if (!name) {
        loadTexture(resources, root + '/' + key + '/texture');
        return;
    }
    const onBundle = (bundle: AssetManager.Bundle | null) => {
        if (!bundle) {
            done(null);
            return;
        }
        loadTexture(bundle, key + '/texture');
    };
    const bundle = assetManager.getBundle(name);
    if (bundle) {
        onBundle(bundle);
        return;
    }
    let pending = inflight.get(name);
    if (!pending) {
        const attempt = boundedLoad<AssetManager.Bundle>(complete =>
            assetManager.loadBundle(name, { xhrTimeout: 8000, maxRetryCount: 0 }, complete));
        pending = attempt;
        inflight.set(name, attempt);
        void attempt.then(() => { if (inflight.get(name) === attempt) inflight.delete(name); });
    }
    void pending.then(onBundle);
}
