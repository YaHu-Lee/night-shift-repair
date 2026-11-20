const { createHash } = require('crypto');

const collectionName = 'campaign_progress';
const supportedWeapons = new Set(['arc_gun', 'hydraulic_nailer', 'pulse_nozzle', 'traction_coil', 'split_probe', 'bypass_wrench']);
const supportedBlueprints = new Set(['magnetic_pickup_arm', 'narrow_beam_clamp', 'quick_release_heatsink']);
const progressionFields = ['clearedStages', 'unlockedWeapons', 'blueprints'];
const blank = () => ({ schemaVersion: 1, clearedStages: [], unlockedWeapons: [], blueprints: [] });

function normalize(value) {
    if (!value || value.schemaVersion !== 1) throw new Error('Unsupported campaign archive');
    const ids = (input, valid) => {
        if (!Array.isArray(input) || input.length > 128 || !input.every(valid)) throw new Error('Invalid campaign IDs');
        return Array.from(new Set(input));
    };
    return {
        schemaVersion: 1,
        clearedStages: ids(value.clearedStages, stage => typeof stage === 'string' && /^(0[1-9]|1[0-9]|20)$/.test(stage)),
        unlockedWeapons: ids(value.unlockedWeapons, weapon => supportedWeapons.has(weapon)),
        blueprints: ids(value.blueprints, blueprint => supportedBlueprints.has(blueprint)),
    };
}

async function handle(params, context, dySDK) {
    const { appId, openId } = dySDK.context(context).getContext();
    if (typeof appId !== 'string' || !appId || typeof openId !== 'string' || !openId) {
        throw new Error('An authenticated Douyin account is required');
    }
    const scope = createHash('sha256').update(appId).update('\0').update(openId).digest('hex');
    if (params?.action !== 'read' && params?.action !== 'merge') throw new Error('Invalid campaign operation');
    if (params.action === 'merge' && params.expectedScope !== scope) {
        // Let the caller invalidate its old binding without reading or writing either archive.
        return { scope, progress: blank() };
    }
    const db = dySDK.database();
    const collection = db.collection(collectionName);
    const read = async () => {
        const result = await collection.where({ _id: scope }).limit(1).get();
        if (!Array.isArray(result?.data)) throw new Error('Campaign archive query failed');
        return result.data[0] ?? null;
    };
    let stored = await read();
    if (params.action === 'read') return { scope, progress: stored ? normalize(stored) : blank() };
    const progress = normalize(params.progress);
    if (!stored) {
        try {
            // The unique document ID also arbitrates simultaneous first backups on two devices.
            const inserted = await collection.add({ _id: scope, ...progress, updatedAt: db.serverDate() });
            if (inserted.id === scope) return { scope, progress };
            throw new Error('Campaign archive insert was not acknowledged');
        } catch (failure) {
            stored = await read();
            if (!stored) throw failure;
        }
    }
    const current = normalize(stored);
    const changes = {};
    for (const field of progressionFields) {
        const missing = progress[field].filter(item => !current[field].includes(item));
        if (missing.length) changes[field] = db.command.addToSet({ $each: missing });
    }
    if (!Object.keys(changes).length) return { scope, progress: current };
    await collection.doc(scope).update({ ...changes, updatedAt: db.serverDate() });
    const final = normalize(await read());
    for (const field of progressionFields) {
        if (progress[field].some(item => !final[field].includes(item))) throw new Error('Campaign archive update unavailable');
    }
    return { scope, progress: final };
}

module.exports = async (params, context) => handle(params, context, require('@open-dy/node-server-sdk').dySDK);
module.exports.handle = handle;
