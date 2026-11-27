import { assetManager, JsonAsset, resources, Texture2D } from 'cc';
import type { AssetManager } from 'cc';
import { campaignArtBundle } from './CampaignArt';

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

// Each callback borrows the texture. Add a reference synchronously to retain it.
export function loadBundleTexture(bundle: AssetManager.Bundle, path: string, done: (texture: Texture2D | null) => void): void {
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
}

export function loadBundleJson(bundle: AssetManager.Bundle, path: string): Promise<JsonAsset | null> {
    return boundedLoad<JsonAsset>(complete => bundle.load(path, JsonAsset, complete));
}

export function loadCampaignTexture(root: string, key: string, done: (texture: Texture2D | null) => void): void {
    const name = campaignArtBundle(key);
    if (!name) {
        loadBundleTexture(resources, root + '/' + key + '/texture', done);
        return;
    }
    loadCampaignBundle(name, bundle => {
        if (!bundle) {
            done(null);
            return;
        }
        loadBundleTexture(bundle, key + '/texture', done);
    });
}

export function loadCampaignPixelTexture(name: string, key: string, done: (texture: Texture2D | null) => void): void {
    loadCampaignBundle(name, bundle => {
        if (!bundle) {
            done(null);
            return;
        }
        loadBundleTexture(bundle, 'pixel/' + key + '/texture', texture => {
            texture?.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
            done(texture);
        });
    });
}

export function loadCampaignBundle(name: string, done: (bundle: AssetManager.Bundle | null) => void): void {
    const bundle = assetManager.getBundle(name);
    if (bundle) {
        done(bundle);
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
    void pending.then(done);
}
