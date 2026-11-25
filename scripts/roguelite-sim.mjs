// Full simulation harness for Plan A (4 Chapters x 12 Waves x 5 Mechanic Rigs).
// Run after `npm run build:web`.
import { CHAPTER_CATALOG, MODULE_BY_ID, RIG_CATALOG, WEAPON_CATALOG } from '../.m0-build/roguelite/catalog.js';
import { PatrolSession, buyWorkshopTalent, createDefaultProfile } from '../.m0-build/roguelite/session.js';
import { TICK_RATE } from '../.m0-build/m1/content.js';

function steer(battle) {
    const p = battle.player;
    const b = battle.field;
    // Dodge active boss hazards first, then kite threats while sweeping nearby parts/heals.
    let vx = 0, vy = 0;

    // 1. Repel from bullets and close enemies
    for (const bullet of battle.bullets) {
        const dx = p.x - bullet.x, dy = p.y - bullet.y;
        const d = Math.hypot(dx, dy);
        if (d < 70 && d > 0.1) {
            const w = (70 - d) / 70 * 3.2;
            vx += (dx / d) * w; vy += (dy / d) * w;
        }
    }
    for (const e of battle.enemies) {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const dangerRadius = e.kind === 'jammer' && e.state === 'dash' ? 92
            : e.kind === 'boss' ? 115 : e.state === 'warn' || e.state === 'dash' ? 105 : 68;
        if (d < dangerRadius) {
            const w = ((dangerRadius - d) / dangerRadius) * (e.kind === 'jammer' ? 3.5 : e.kind === 'boss' ? 3.2 : 2.1);
            vx += (dx / d) * w; vy += (dy / d) * w;
        }
        // Dodge Boss rect/sector/tether hazard
        if (e.kind === 'boss' && e.bossHazard) {
            const h = e.bossHazard;
            if (h.shape === 'rect') {
                const horiz = (h.right - h.left) > (h.top - h.bottom);
                if (horiz && p.y > h.bottom - 18 && p.y < h.top + 18) vy += p.y >= (h.bottom + h.top) / 2 ? 6 : -6;
                if (!horiz && p.x > h.left - 18 && p.x < h.right + 18) vx += p.x >= (h.left + h.right) / 2 ? 6 : -6;
            } else if (h.shape === 'tether') {
                const tx = h.end.x - h.x, ty = h.end.y - h.y;
                const tl = Math.hypot(tx, ty) || 1;
                vx += (-ty / tl) * 5; vy += (tx / tl) * 5;
            }
        }
    }

    // 2. Pull toward nearby heals (high priority when injured) and parts (when safe)
    const needHeal = p.hp < p.maxHp * 0.72;
    let bestDrop = null, bestScore = -Infinity;
    for (const d of battle.drops) {
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist > 170) continue;
        const score = (d.kind === 'heal' ? (needHeal ? 220 : 40) : 55) - dist;
        if (score > bestScore) { bestScore = score; bestDrop = d; }
    }
    if (bestDrop) {
        const dx = bestDrop.x - p.x, dy = bestDrop.y - p.y, d = Math.hypot(dx, dy) || 1;
        vx += (dx / d) * (bestDrop.kind === 'heal' && needHeal ? 2.6 : 1.15);
        vy += (dy / d) * (bestDrop.kind === 'heal' && needHeal ? 2.6 : 1.15);
    }

    // 3. Soft center pull to stay away from corners + slight orbit around nearest threat for melee contact
    const cx = (b.left + b.right) / 2, cy = (b.bottom + b.top) / 2;
    vx += (cx - p.x) * 0.004;
    vy += (cy - p.y) * 0.004;
    if (battle.enemies.length) {
        let nearest = battle.enemies[0], minD = Infinity;
        for (const e of battle.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < minD) { minD = d; nearest = e; }
        }
        const avgReach = battle.runtimes.reduce((s, r) => s + WEAPON_CATALOG[r.instance.id].tiers[r.instance.tier - 1].reach, 0) / battle.runtimes.length;
        const preferred = Math.min(115, Math.max(52, avgReach * 0.78));
        if (minD > preferred + 14) {
            vx += ((nearest.x - p.x) / (minD || 1)) * 1.1;
            vy += ((nearest.y - p.y) / (minD || 1)) * 1.1;
        }
    }
    const len = Math.hypot(vx, vy);
    return len > 0.05 ? [vx / len, vy / len] : [0, 0];
}

function playShop(session) {
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

function runOne(chapterId, rigId, seed, danger, profile) {
    const session = new PatrolSession({ chapterId, rigId, seed, danger, profile });
    const shopHistory = [];
    while (session.phase === 'battle' || session.phase === 'shop') {
        if (session.phase === 'battle') {
            const b = session.battle;
            let dir = [0, 0];
            while (session.phase === 'battle' && session.battle === b) {
                if (b.tick % 6 === 0) dir = steer(b);
                session.stepBattle(dir[0], dir[1]);
            }
        } else {
            shopHistory.push(playShop(session));
            session.startNextWave();
        }
    }
    const result = session.settle();
    return { session, result, shopHistory };
}

const seeds = [42, 1729, 20261120, 3173];
const rigs = Object.keys(RIG_CATALOG);
console.log('=== PLAN A (4 CHAPTERS x 12 WAVES x 5 RIGS) LIVE SIMULATION ===');

for (const chapter of CHAPTER_CATALOG) {
    // Realistic workshop progression across chapters: Ch1=0 talents, Ch2=4, Ch3=8, Ch4=13
    let profile = createDefaultProfile();
    profile = { ...profile, credits: chapter.index * 95 };
    const order = ['chassis', 'capacitor', 'toolbox', 'magnet_bag', 'shop_permit', 'chassis', 'capacitor', 'chassis', 'capacitor', 'magnet_bag', 'capacitor', 'chassis', 'capacitor'];
    for (let i = 0; i < chapter.index * 3 && i < order.length; i++) {
        const next = buyWorkshopTalent(profile, order[i]);
        if (next) profile = next;
    }

    let wins = 0, total = 0;
    const bossTimes = [], emptySecs = [], affordRatios = [], leftoverParts = [], levels = [], kills = [];
    const lossWaves = {}, rigWins = {};
    for (const rigId of rigs) {
        rigWins[rigId] = 0;
        for (const seed of seeds) {
            total++;
            const { session, result, shopHistory } = runOne(chapter.id, rigId, seed, 0, profile);
            if (result.won) {
                wins++; rigWins[rigId]++;
                bossTimes.push(session.reports[11].elapsedSeconds);
                leftoverParts.push(session.parts);
                levels.push(session.level);
                kills.push(result.totalKills);
            } else {
                const w = session.reports.length;
                lossWaves[w] = (lossWaves[w] ?? 0) + 1;
            }
            for (const r of session.reports.slice(0, 11)) emptySecs.push(r.emptySeconds);
            for (const s of shopHistory) affordRatios.push(s.affordRatio);
        }
    }
    const med = arr => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    console.log(
        `Ch${chapter.id} ${chapter.title.padEnd(7)} | Wins=${String(wins).padStart(2)}/${total}`,
        `| MedKills=${Math.round(med(kills)).toString().padStart(4)}`,
        `| MedLv=${med(levels).toFixed(0).padStart(2)}`,
        `| MedAfford=${(med(affordRatios) * 100).toFixed(0).padStart(3)}%`,
        `| MedLeftParts=${Math.round(med(leftoverParts)).toString().padStart(3)}`,
        `| AvgEmpty=${avg(emptySecs).toFixed(2)}s`,
        `| MedBoss=${med(bossTimes).toFixed(1).padStart(4)}s`,
        `| LossW=${JSON.stringify(lossWaves)}`,
        `| Rigs=${JSON.stringify(rigWins)}`
    );
}
