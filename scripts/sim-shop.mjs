import { MODULE_BY_ID, RIG_CATALOG, WEAPON_CATALOG } from '../.m0-build/roguelite/catalog.js';

export function playShop(session) {
    const rig = RIG_CATALOG[session.rigId];
    const wanted = new Set(rig.wantedTags);
    const shopMetrics = { affordRatio: 0, bought: 0, rerolls: 0, merges: 0, locked: 0 };

    // 1. Pick level-ups intelligently
    while (session.shopView && session.shopView.pendingLevelUps > 0) {
        const opts = session.shopView.levelUpOptions;
        let bestIdx = 0, bestScore = -Infinity;
        opts.forEach((o, i) => {
            let s = o.tier * 10;
            if (o.stat === 'overclock' || o.stat === 'cycleSpeed') s += 14;
            if (o.stat === 'armor' || o.stat === 'maxHp' || o.stat === 'repair') s += session.waveIndex >= 4 ? 13 : 7;
            if (o.stat === 'salvage') s += session.waveIndex <= 4 ? 15 : 2;
            if (o.stat === 'torque' && (wanted.has('melee') || wanted.has('ballistic'))) s += 13;
            if (o.stat === 'voltage' && (wanted.has('arc') || wanted.has('thermal'))) s += 13;
            if (o.stat === 'critChance' && wanted.has('ballistic')) s += 12;
            if (s > bestScore) { bestScore = s; bestIdx = i; }
        });
        session.chooseLevelUp(bestIdx);
    }

    const firstView = session.shopView;
    const shelfTotal = firstView.slots.reduce((a, s) => a + s.price, 0);
    shopMetrics.affordRatio = shelfTotal > 0 ? firstView.parts / shelfTotal : 0;

    // 2. Auto-merge identical owned weapons when holding 6 slots to make room for upgrades
    const tryMergeAll = () => {
        let merged = true;
        while (merged) {
            merged = false;
            const v = session.shopView;
            if (!v || v.weapons.length < 6) break;
            for (let i = 0; i < v.weapons.length; i++) {
                const partner = v.weapons[i].canMergeWith;
                if (partner !== null) {
                    if (session.mergeWeapons(i, partner)) { shopMetrics.merges++; merged = true; break; }
                }
            }
        }
    };

    // 3. Shop purchase + reroll + lock loop
    for (let round = 0; round < 4; round++) {
        tryMergeAll();
        let acted = true;
        while (acted) {
            acted = false;
            const v = session.shopView;
            if (!v) break;
            const scored = v.slots
                .filter(s => !s.sold && s.price <= v.parts)
                .map(s => {
                    let score = 0;
                    if (s.kind === 'weapon') {
                        const tags = WEAPON_CATALOG[s.itemId].tags;
                        const tagMatch = tags.some(t => wanted.has(t));
                        if (v.weapons.length < 6) score = 50 + (tagMatch ? 25 : 0) + s.tier * 12;
                        else if (s.canAutoMerge) score = 60 + s.tier * 18;
                        else score = -99;
                    } else {
                        const m = MODULE_BY_ID[s.itemId];
                        const tagMatch = m.tags.some(t => wanted.has(t));
                        score = 32 + s.tier * 14 + (tagMatch ? 12 : 0) + (m.special ? 10 : 0);
                    }
                    return { slot: s, score };
                })
                .filter(x => x.score > 20)
                .sort((a, b) => b.score - a.score);
            if (scored.length) {
                const res = session.buySlot(scored[0].slot.slotIndex);
                if (res.ok) {
                    shopMetrics.bought++;
                    if (res.merged) shopMetrics.merges++;
                    acted = true;
                }
            }
        }
        const v = session.shopView;
        if (!v) break;
        // Lock a great unaffordable item if we can
        const lockTarget = v.slots.find(s => !s.sold && !s.locked && s.price > v.parts && (s.tier >= 3 || s.canAutoMerge));
        if (lockTarget && v.lockCount < v.maxLocks) {
            if (session.toggleLock(lockTarget.slotIndex)) shopMetrics.locked++;
        }
        // Reroll if we still have healthy spare money or free reroll
        if (v.freeRerollsLeft > 0 || (v.parts >= v.nextRerollCost + 25 && round < 2)) {
            if (session.reroll()) shopMetrics.rerolls++;
            else break;
        } else break;
    }
    return shopMetrics;
}
