// Full simulation harness for Plan A (4 Chapters x 12 Waves x 6 Mechanic Rigs).
// Run after `npm run build:web`.
import { CHAPTER_CATALOG, RIG_CATALOG } from '../.m0-build/roguelite/catalog.js';
import { PatrolSession, buyWorkshopTalent, createDefaultProfile } from '../.m0-build/roguelite/session.js';
import { playShop } from './sim-shop.mjs';

import { PatrolAutoMovement, steerPatrol } from '../.m0-build/roguelite/autoMovement.js';

const trial = process.argv.includes('--auto-movement');

function runOne(chapterId, rigId, seed, danger, profile) {
    const session = new PatrolSession({ chapterId, rigId, seed, danger, profile });
    const shopHistory = [];
    const assistant = trial ? new PatrolAutoMovement() : null;
    while (session.phase === 'battle' || session.phase === 'shop') {
        if (session.phase === 'battle') {
            const b = session.battle;
            let dir = [0, 0];
            while (session.phase === 'battle' && session.battle === b) {
                if (assistant) dir = assistant.sample(b);
                else if (b.tick % 6 === 0) dir = steerPatrol(b);
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

const seeds = trial && process.argv.includes('--holdout') ? [199, 6271, 7135, 5189, 883, 1381, 547, 2237] : trial ? [42, 1729, 20261120, 3173, 73, 7919, 20261128, 3251] : [42, 1729, 20261120, 3173];
let clearedWaves = 0, possibleWaves = 0;
const rigs = Object.keys(RIG_CATALOG);
console.log('=== PLAN A (4 CHAPTERS x 12 WAVES x 6 RIGS) LIVE SIMULATION ===');

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
            clearedWaves += result.wavesCleared;
            possibleWaves += 12;
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

if (trial) console.log(`Auto movement: ${clearedWaves}/${possibleWaves} waves cleared (${(100 * clearedWaves / possibleWaves).toFixed(1)}%)`);
