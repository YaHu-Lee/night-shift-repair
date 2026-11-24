// Compare purchase priorities in the normal campaign, with identical accounts and movement.
// Run after npm run build:web. Each stdout line includes the shelves actually visited.
import assert from 'node:assert/strict';
import { Campaign } from '../.m0-build/campaign/Campaign.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { WORKSHOP_TIERS } from '../.m0-build/campaign/CampaignLedger.js';
import { campaignPressureRules } from '../.m0-build/campaign/CampaignPressure.js';
import { Run } from '../.m0-build/m1/Run.js';
import { TICK_RATE } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';
import { chooseDestination } from './campaign-balance.mjs';

function platform() {
    const values = new Map();
    return makePlatform({ localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
    } }, 'shop-study');
}

function emptyTargets(shop, item) {
    if (item.kind === 'weapon') return [{ kind: 'weapon' }];
    if (item.kind === 'gear') return shop.gear.filter(slot => !slot.locked && !slot.item)
        .map(({ slot }) => ({ kind: 'gear', slot }));
    const weapon = shop.weapons.findIndex(row => row.id === item.weapon);
    return (shop.weapons[weapon]?.slots ?? []).filter(slot => !slot.locked && !slot.item)
        .map(({ slot }) => ({ kind: 'attachment', weapon, slot }));
}

function buyFromShelf(run, policy) {
    const shop = run.equipmentShop;
    const candidates = shop.offers.map(item => ({
        item, target: emptyTargets(shop, item).find(target => run.previewEquipment(item.id, target)?.allowed),
    }));
    function rank(item) {
        if (item.id === shop.recommended) return 0;
        if (policy === 'wrench' && item.weapon === 'wrench') return 1;
        if (item.kind === 'weapon') return 2;
        if (item.kind === 'attachment') return 3;
        return 4;
    }
    const choices = candidates.filter(row => row.target).sort((a, b) => rank(a.item) - rank(b.item));
    const row = { wave: run.data.wave + 1, refreshed: shop.refreshed, wallet: run.data.parts,
        equipped: shop.weapons.map(weapon => weapon.id),
        shelf: shop.offers.map(({ id, price }) => ({ id, price })),
        legal: candidates.filter(row => row.target).map(row => row.item.id), bought: [] };
    for (const { item } of choices) {
        const target = emptyTargets(run.equipmentShop, item).find(slot => run.previewEquipment(item.id, slot)?.allowed);
        if (!target) continue;
        assert.ok(run.buyEquipment(item.id, target, run.data.revision));
        row.bought.push(item.id);
        if (policy !== 'open') break;
    }
    return row;
}

function play(stage, campaign, seed, policy, groupEnemies) {
    const run = new Run(platform(), stage.rules, {
        clearByKills: true, shopWeapons: () => campaign.availableShopWeapons(stage.id),
        rulesForEquipment: (mode, counted) => campaignPressureRules(stage.id, stage.rules, mode, counted),
    });
    run.start('arc', seed, 'wrench', 'study-' + stage.id, undefined, 'normal',
        WORKSHOP_TIERS[campaign.workshopTier].supplies, campaign.trainingLoadout('wrench', 'arc'));
    const shops = [], waves = [];
    while (run.data.phase === 'battle') {
        const battle = run.battle;
        const limit = battle.clearProgress ? Math.max(180 * TICK_RATE, battle.duration * 4) : battle.duration;
        let emptyTicks = 0;
        for (let tick = 0; run.battle === battle && tick <= limit; tick++) {
            if (!battle.enemies.length && !battle.warnings.length && !battle.bullets.length) emptyTicks++;
            if (battle.tick % 7 === 0) chooseDestination(battle, 'wrench', battle.equipment.weapons[0].reach, groupEnemies);
            run.advance(1 / TICK_RATE);
        }
        waves.push({ seconds: battle.tick / TICK_RATE, damage: battle.damageTaken, emptySeconds: emptyTicks / TICK_RATE,
            wideSweeps: battle.wideSweeps ?? 0 });
        if (run.data.phase !== 'shop') break;
        shops.push(buyFromShelf(run, policy));
        if (policy === 'open' && run.refresh(run.data.revision)) shops.push(buyFromShelf(run, policy));
        assert.ok(run.nextWave(run.data.revision));
    }
    const result = { stage: stage.id, seed, policy, movement: groupEnemies ? 'group' : 'standard', outcome: run.data.phase, parts: run.data.parts,
        weapons: run.data.tools.map(tool => tool.id), shops, waves };
    run.dispose();
    return result;
}

const groupEnemies = process.argv.includes('--group');
const stages = new Set(groupEnemies ? ['06'] : ['02', '06', '09', '10', '15', '20']);
const seeds = [42, 53, 311, 773, 1439, 1729, 2093, 3173, 84017, 20261027, 20261120, 20261123];
const campaign = new Campaign(platform());
for (const stage of CAMPAIGN_CATALOG) {
    if (stages.has(stage.id)) {
        for (const seed of seeds) for (const policy of ['weapons', 'wrench', 'open']) {
            console.log(JSON.stringify(play(stage, campaign, seed, policy, groupEnemies)));
        }
    }
    const runId = 'clear-' + stage.id;
    assert.ok(campaign.beginAttempt(stage.id, runId));
    assert.equal(campaign.replayResult(stage.id, { phase: 'won', finishReason: 'cleared', runId,
        wave: stage.finalWave, contentVersion: stage.contentVersion }), 'committed');
}
