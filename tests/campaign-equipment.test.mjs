import test from 'node:test';
import assert from 'node:assert/strict';
import { Campaign, CAMPAIGN_STAGES } from '../.m0-build/campaign/Campaign.js';
import { CAMPAIGN_CATALOG } from '../.m0-build/campaign/CampaignCatalog.js';
import { Battle } from '../.m0-build/m1/Battle.js';
import { ATTACHMENTS, GEAR, attachmentIdsForWeapon, createEquipment, equipmentBuilds, openEquipmentSlots, resolveEquipment, rollEquipmentOffers } from '../.m0-build/m1/Equipment.js';
import { Run } from '../.m0-build/m1/Run.js';
import { CAMPAIGN_01_RULES, M2_RULES, TOOLS, isTool } from '../.m0-build/m1/content.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

const step = 1 / 30;
function storage() {
    const slots = new Map();
    let refuse = false;
    const platform = makePlatform({ localStorage: {
        getItem: key => slots.get(key) ?? null,
        setItem(key, text) {
            if (refuse) throw Error('save interrupted');
            slots.set(key, text);
        },
    } }, 'equipment-test');
    return { platform, refuse: value => { refuse = value; } };
}

function settle(run, earned = 12) {
    const battle = run.battle;
    const kills = battle.clearProgress?.total ?? earned;
    Object.assign(battle, { tick: battle.duration, kills, collected: Math.min(kills, earned) });
    if (battle.spec.clear) {
        battle.spawnCursor = battle.spec.clear.opening;
        battle.reserveCursor = battle.spec.clear.reserves;
    }
    run.advance(step);
    assert.equal(run.data.phase, 'shop');
}
function next(run) {
    assert.ok(run.nextWave(run.data.revision));
}

test('seeded finisher offers do not depend on which of six weapons was installed first', () => {
    const { equipment } = createEquipment('wrench', {});
    const ids = Object.keys(TOOLS).slice(0, 6);
    const seen = new Set();
    function shelf(order, seed) {
        const tools = order.map(id => ({ id, mods: [], attachments: [null, null, null] }));
        return rollEquipmentOffers({ tools, equipment, wave: 4, weaponLimit: 6, route: 'arc', parts: 50 }, ids, seed, false);
    }
    for (let seed = 0; seed < 80; seed++) {
        const row = shelf(ids, seed);
        assert.deepEqual(row, shelf([...ids].reverse(), seed));
        assert.equal(new Set(row).size, 3);
        row.forEach(id => seen.add(id));
    }
    assert.deepEqual([...seen].sort(), ids.map(id => id + '/finisher').sort());
});

test('depot workbench choice survives buying, refreshing and resuming, and only lasts one shop', () => {
    for (const choosePart of [false, true]) {
        const { platform } = storage();
        const stage = CAMPAIGN_CATALOG[5];
        const options = { clearByKills: true, shopWeapons: () => ['wrench', 'arc_gun', 'riveter'] };
        let run = new Run(platform, stage.rules, options);
        run.start('arc', 42, 'wrench', 'depot', undefined, 'normal', 50, {});
        settle(run); next(run); settle(run);
        const gun = run.equipmentShop.offers.find(item => item.kind === 'weapon').id;
        assert.ok(run.equipmentShop.offers.some(item => item.id === 'wrench/flywheel'));
        const partSlot = { kind: 'attachment', weapon: 0, slot: 0 };
        assert.ok(run.buyEquipment(choosePart ? 'wrench/flywheel' : gun, choosePart ? partSlot : { kind: 'weapon' }, run.data.revision));
        assert.ok(!run.buyEquipment(choosePart ? gun : 'wrench/flywheel', choosePart ? { kind: 'weapon' } : partSlot, run.data.revision));
        run.dispose();
        run = new Run(platform, stage.rules, options);
        assert.ok(run.refresh(run.data.revision));
        assert.ok(run.equipmentShop.offers.every(item => item.kind !== 'weapon' && item.id !== 'wrench/flywheel'));
        next(run);
        assert.equal(run.battle.equipment.weapons[0].wideSweep, choosePart);
        settle(run);
        assert.ok(run.equipmentShop.offers.some(item => item.kind === 'weapon'));
        run.dispose();
    }
});

test('late campaign shops sell up to six distinct weapons and reload the full loadout', () => {
    const { platform } = storage();
    const { rules } = CAMPAIGN_CATALOG.at(-1);
    const options = { clearByKills: true };
    let run = new Run(platform, rules, options);
    run.start('arc', 3, 'wrench', 'floating-loadout', undefined, 'normal', 50, {});
    settle(run);
    assert.equal(run.equipmentShop.weaponCapacity, 1);
    for (let wave = 1; wave < 5; wave++) {
        next(run);
        settle(run);
        assert.equal(run.equipmentShop.weaponCapacity, 6);
        const weapons = run.equipmentShop.offers.filter(item => item.kind === 'weapon');
        assert.ok(weapons.length >= (wave === 1 ? 2 : 1));
        for (const weapon of weapons.slice(0, wave === 1 ? 2 : 1)) {
            assert.ok(run.buyEquipment(weapon.id, { kind: 'weapon' }, run.data.revision));
        }
    }
    const checkpoint = run.data;
    assert.equal(new Set(checkpoint.tools.map(tool => tool.id)).size, 6);
    assert.ok(run.refresh(checkpoint.revision));
    assert.ok(run.equipmentShop.offers.every(item => item.kind !== 'weapon'));
    const saved = run.data;
    run.dispose();
    run = new Run(platform, rules, options);
    assert.deepEqual(run.data, saved);
    next(run);
    assert.equal(run.battle.tools.length, 6);
    run.dispose();
});

test('new shops delay the second weapon and extra sockets and keep W3/W5 weapon-specific offers', () => {
    const { platform } = storage();
    let run = new Run(platform, CAMPAIGN_01_RULES);
    run.start('arc', 3, 'wrench', 'new');
    assert.equal(run.data.equipment, undefined);
    run.start('arc', 3, 'wrench', 'new-equipped', undefined, 'normal', 0, {});
    assert.deepEqual(run.data.tools[0].attachments, [null, null, null]);
    assert.deepEqual(run.data.tools[0].mods, []);
    settle(run, 0);
    assert.equal(run.data.parts, 6);
    assert.equal(run.equipmentShop.weaponCapacity, 1);
    assert.equal(run.equipmentShop.offers[0].id, 'wrench/link');
    assert.deepEqual(run.equipmentShop.gear.map(slot => slot.locked), [false, true, true]);
    assert.deepEqual(run.equipmentShop.weapons[0].slots.map(slot => slot.locked), [false, true, true]);
    const link = { kind: 'attachment', weapon: 0, slot: 0 };
    assert.equal(run.previewEquipment('wrench/link', { ...link, slot: 1 }).allowed, false);
    assert.equal(run.previewEquipment('wrench/link', { kind: 'gear', slot: 0 }).allowed, false);
    assert.ok(run.buyEquipment('wrench/link', link, run.data.revision));
    assert.equal(run.data.parts, 2);
    assert.equal(run.equipmentShop.weapons[0].slots[0].item.name, ATTACHMENTS['wrench/link'].name);

    next(run);
    settle(run);
    assert.equal(run.equipmentShop.weaponCapacity, 2);
    assert.deepEqual(run.equipmentShop.gear.map(slot => slot.locked), [false, false, true]);
    const second = run.equipmentShop.offers.find(item => item.kind === 'weapon');
    assert.ok(second);
    assert.ok(run.buyEquipment(second.id, { kind: 'weapon' }, run.data.revision));
    assert.deepEqual(run.equipmentShop.weapons[1].slots.map(slot => slot.locked), [false, false, true]);
    next(run);
    settle(run);
    assert.equal(run.tuning, null);
    const mid = run.equipmentShop.offers.find(item => item.id.startsWith('wrench/') && item.id !== 'wrench/link');
    assert.ok(mid);
    assert.equal(run.previewEquipment(mid.id, { kind: 'attachment', weapon: 1, slot: 0 }).allowed, false);
    const preview = run.previewEquipment(mid.id, { ...link, slot: 1 });
    assert.ok(preview.allowed);
    assert.equal(preview.before.weapons[1].reach, preview.after.weapons[1].reach);
    assert.ok(preview.changes.length > 0);
    const balance = run.data.parts;
    assert.ok(run.buyEquipment(mid.id, { ...link, slot: 1 }, run.data.revision));
    assert.equal(run.data.parts, balance - mid.price);
    const current = run.data;
    run.dispose();
    run = new Run(platform, CAMPAIGN_01_RULES);
    assert.deepEqual(run.data, current);

    next(run);
    settle(run);
    assert.deepEqual(run.equipmentShop.gear.map(slot => slot.locked), [false, false, false]);
    assert.deepEqual(run.equipmentShop.weapons[0].slots.map(slot => slot.locked), [false, false, false]);
    next(run);
    settle(run);
    assert.ok(run.equipmentShop.offers.some(item => item.id === 'wrench/finisher'));
    assert.ok(run.equipmentShop.offers.some(item => item.id === second.id + '/finisher'));
    run.dispose();

    const configurable = createEquipment('wrench', { attachmentSlots: 2, weaponSlots: { wrench: 3 } });
    assert.equal(configurable.tools[0].attachments.length, 3);
    assert.equal(configurable.equipment.attachmentSlots, 2);
    assert.equal(createEquipment('wrench', { weaponSlots: { wrench: 0 } }), null);
});

test('the campaign storefront stocks only account unlocks supported by the current stage', () => {
    const campaign = new Campaign(storage().platform);
    const [first, second] = CAMPAIGN_STAGES;
    assert.deepEqual(campaign.availableShopWeapons(first.id), ['wrench']);
    assert.deepEqual(campaign.availableShopWeapons(second.id), []);
    const opening = new Run(storage().platform, first.rules, { shopWeapons: () => campaign.availableShopWeapons(first.id) });
    opening.start('arc', 3, 'wrench', 'opening', undefined, 'normal', 0, {});
    settle(opening);
    next(opening);
    settle(opening);
    assert.ok(opening.equipmentShop.offers.length > 0);
    assert.ok(opening.equipmentShop.offers.every(item => item.kind !== 'weapon'));
    assert.ok(opening.refresh(opening.data.revision));
    assert.ok(opening.equipmentShop.offers.every(item => item.kind !== 'weapon'));
    opening.dispose();

    assert.ok(campaign.beginAttempt(first.id, 'first-clear'));
    assert.equal(campaign.replayResult(first.id, { runId: 'first-clear', contentVersion: first.contentVersion,
        phase: 'won', finishReason: 'cleared', wave: first.finalWave }), 'committed');
    assert.deepEqual(campaign.availableShopWeapons(second.id), ['wrench', 'arc_gun']);
    assert.ok(!campaign.availableShopWeapons(first.id).includes('arc_gun'));
    const following = new Run(storage().platform, second.rules, { shopWeapons: () => campaign.availableShopWeapons(second.id) });
    following.start('arc', 3, 'wrench', 'following', undefined, 'normal', 0, {});
    settle(following);
    next(following);
    settle(following);
    assert.deepEqual(following.equipmentShop.offers.filter(item => item.kind === 'weapon').map(item => item.id), ['arc_gun']);
    assert.ok(following.refresh(following.data.revision));
    assert.deepEqual(following.equipmentShop.offers.filter(item => item.kind === 'weapon').map(item => item.id), ['arc_gun']);
    assert.ok(following.buyEquipment('arc_gun', { kind: 'weapon' }, following.data.revision));
    following.dispose();
});

test('the second station shop sells its sweep upgrade as an ordinary attachment', () => {
    const { platform, refuse } = storage();
    const stage = CAMPAIGN_CATALOG[0];
    const options = { clearByKills: true, shopWeapons: () => ['wrench'] };
    let run = new Run(platform, stage.rules, options);
    run.start('arc', 42, 'wrench', 'sweep', undefined, 'normal', 0, {});
    settle(run);
    assert.equal(run.equipmentShop.recommended, 'wrench/link');
    assert.ok(run.equipmentShop.offers.every(item => item.id !== 'wrench/dispatch'));
    next(run);
    settle(run);
    assert.equal(run.equipmentShop.weaponCapacity, 1);
    assert.ok(run.equipmentShop.offers.every(item => item.kind !== 'weapon'));
    const { parts, revision } = run.data;
    const target = { kind: 'attachment', weapon: 0, slot: 1 };
    const preview = run.previewEquipment('wrench/dispatch', target);
    assert.ok(preview.allowed);
    assert.equal(preview.after.weapons[0].reach - preview.before.weapons[0].reach, 15);
    assert.equal(preview.after.weapons[0].damage - preview.before.weapons[0].damage, 1);
    refuse(true);
    assert.equal(run.buyEquipment('wrench/dispatch', target, revision), false);
    assert.deepEqual([run.data.parts, run.data.revision], [parts, revision]);
    refuse(false);
    assert.ok(run.buyEquipment('wrench/dispatch', target, revision));
    assert.equal(run.data.parts, parts - 5);
    assert.ok(run.refresh(run.data.revision));
    assert.ok(run.equipmentShop.offers.every(item => item.kind !== 'weapon' && item.id !== 'wrench/dispatch'));
    run.dispose();
    run = new Run(platform, stage.rules, options);
    next(run);
    assert.deepEqual(run.battle.tools.map(tool => tool.id), ['wrench']);
    assert.equal(run.battle.tools[0].attachments[1], 'wrench/dispatch');
    run.dispose();
});

test('preview saves with the withdrawn gun recover parts and keep their campaign progress', () => {
    const { platform } = storage();
    const stage = CAMPAIGN_CATALOG[0];
    const options = { clearByKills: true, shopWeapons: () => ['wrench'] };
    const opening = new Run(platform, stage.rules, options);
    opening.start('arc', 42, 'wrench', 'preview', undefined, 'normal', 0, {});
    settle(opening);
    next(opening);
    settle(opening);
    const checkpoint = opening.data;
    opening.dispose();

    assert.ok(platform.writeCheckpoint(1, { ...checkpoint, dispatchChoice: 'open',
        shop: { ...checkpoint.shop, equipmentOffers: ['riveter', 'wrench/dispatch', 'gear/padding'] } }));
    const unbought = new Run(platform, stage.rules, options);
    assert.equal(unbought.data.runId, 'preview');
    assert.equal(unbought.data.parts, checkpoint.parts);
    assert.ok(unbought.equipmentShop.offers.every(item => item.kind !== 'weapon'));
    unbought.dispose();

    assert.ok(platform.writeCheckpoint(1, { ...checkpoint, dispatchChoice: 'rental', parts: 12,
        tools: [...checkpoint.tools, { id: 'riveter', mods: [], attachments: ['riveter/link', null, null] }],
        shop: { ...checkpoint.shop, equipmentOffers: ['riveter/handling', 'gear/padding'] } }));
    const restored = new Run(platform, stage.rules, options);
    assert.equal(restored.data.runId, 'preview');
    assert.deepEqual(restored.data.reports, checkpoint.reports);
    assert.deepEqual(restored.data.tools, checkpoint.tools);
    assert.equal(restored.data.parts, 21);
    assert.ok(restored.equipmentShop.offers.some(item => item.id === 'wrench/dispatch'));
    assert.ok(restored.equipmentShop.offers.every(item => item.kind !== 'weapon' && !item.id.startsWith('riveter/')));
    next(restored);
    restored.dispose();

    const replay = new Run(platform, stage.rules, options);
    assert.equal(replay.data.parts, 21);
    assert.equal(replay.data.dispatchChoice, undefined);
    assert.deepEqual(replay.battle.tools.map(tool => tool.id), ['wrench']);
    replay.dispose();
});

test('old store checkpoints hide and refuse locked weapon offers while keeping purchased weapons', () => {
    for (const loadout of [undefined, {}]) {
        const { platform } = storage();
        const legacy = new Run(platform, CAMPAIGN_01_RULES);
        legacy.start('arc', 3, 'wrench', 'prior-shop', undefined, 'normal', 0, loadout);
        settle(legacy);
        next(legacy);
        settle(legacy);
        const saved = legacy.data;
        const offers = loadout ? saved.shop.equipmentOffers : saved.shop.offers;
        const locked = offers.find(isTool);
        assert.ok(locked);
        legacy.dispose();

        const options = { shopWeapons: () => ['wrench'] };
        const resumed = new Run(platform, CAMPAIGN_01_RULES, options);
        assert.deepEqual(resumed.data, saved);
        const target = { kind: 'weapon' };
        if (loadout) {
            assert.ok(resumed.equipmentShop.offers.every(item => item.kind !== 'weapon'));
            assert.equal(resumed.previewEquipment(locked, target).allowed, false);
            assert.equal(resumed.buyEquipment(locked, target, saved.revision), false);
        } else {
            assert.ok(resumed.shop.offers.every(id => !isTool(id)));
            assert.equal(resumed.canBuy(locked, 0), false);
            assert.equal(resumed.buy(locked, 0, saved.revision), false);
        }
        assert.equal(resumed.data.revision, saved.revision);
        resumed.dispose();

        const previouslyPurchased = new Run(platform, CAMPAIGN_01_RULES);
        assert.ok(loadout ? previouslyPurchased.buyEquipment(locked, target, saved.revision)
            : previouslyPurchased.buy(locked, 0, saved.revision));
        previouslyPurchased.dispose();
        const reopen = new Run(platform, CAMPAIGN_01_RULES, options);
        assert.equal(reopen.data.tools[1].id, locked);
        assert.ok(reopen.refresh(reopen.data.revision));
        assert.equal(reopen.data.tools[1].id, locked);
        next(reopen);
        assert.equal(reopen.battle.tools[1].id, locked);
        reopen.dispose();
    }
});

test('role gear is independent of weapons and actual per-wave maximum HP is durable', () => {
    const fixture = storage();
    const run = new Run(fixture.platform, CAMPAIGN_01_RULES);
    run.start('arc', 3, 'wrench', 'armored', undefined, 'normal', 0,
        { role: { hpBonus: 2, speedBonus: .04, pickupBonus: 2.1 } });
    assert.equal(run.battle.maxHp, 12);
    settle(run);
    next(run);
    settle(run);
    assert.ok(run.equipmentShop.offers.some(item => item.id === 'gear/padding'));
    const target = { kind: 'gear', slot: 1 };
    const preview = run.previewEquipment('gear/padding', target);
    assert.equal(preview.before.actor.maxHp, 12);
    assert.equal(preview.after.actor.maxHp, 14);
    assert.deepEqual(preview.before.weapons, preview.after.weapons);
    const old = run.data;
    fixture.refuse(true);
    assert.equal(run.buyEquipment('gear/padding', target, old.revision), false);
    assert.deepEqual(run.data, old);
    fixture.refuse(false);
    assert.ok(run.buyEquipment('gear/padding', target, old.revision));
    assert.deepEqual(run.data.tools, old.tools);
    assert.equal(run.buyEquipment('gear/padding', target, old.revision), false);
    next(run);
    assert.equal(run.battle.player.hp, 14);
    run.battle.player.hp = 1;
    settle(run);
    assert.equal(run.data.reports[2].maxHp, 14);
    assert.equal(run.data.reports[2].hits, 13);
    const restored = new Run(fixture.platform, CAMPAIGN_01_RULES);
    assert.equal(restored.data.reports[2].hits, 13);
    run.dispose();
    restored.dispose();
});

test('profile signature is restricted to its weapon and selected rules follow the saved equipment marker', () => {
    const fixture = storage();
    const newRules = { ...CAMPAIGN_01_RULES, waves: CAMPAIGN_01_RULES.waves.map(wave => ({ ...wave, seconds: wave.seconds + 5 })) };
    const rulesForEquipment = () => newRules;
    const run = new Run(fixture.platform, CAMPAIGN_01_RULES, { rulesForEquipment });
    run.start('arc', 3, 'wrench', 'legacy');
    assert.equal(run.battle.duration, 900);
    assert.equal(run.equipmentShop, null);
    const legacy = new Run(fixture.platform, CAMPAIGN_01_RULES, { rulesForEquipment });
    assert.equal(legacy.battle.duration, 900);
    legacy.dispose();
    run.start('arc', 3, 'wrench', 'new', undefined, 'normal', 0, {
        starterAttachment: 'arc_gun/signature', unlockedAttachments: ['arc_gun/signature'],
    });
    assert.equal(run.data.runId, 'legacy');
    run.start('arc', 3, 'wrench', 'new', undefined, 'normal', 0, {
        starterAttachment: 'wrench/signature', unlockedAttachments: ['wrench/signature'], attachmentSlots: 2,
        weapon: { reachBonus: 3.4, intervalReduction: 1, damageBonus: 0 },
    });
    assert.equal(run.battle.duration, 1050);
    assert.deepEqual(run.data.tools[0].attachments, ['wrench/signature', null]);
    assert.equal(run.battle.equipment.weapons[0].reach, 107.4);
    assert.equal(run.battle.equipment.weapons[0].interval, 11);
    const restored = new Run(fixture.platform, CAMPAIGN_01_RULES, { rulesForEquipment });
    assert.equal(restored.battle.duration, 1050);
    assert.deepEqual(restored.data, run.data);
    assert.equal(openEquipmentSlots(4, 2), 2);
    const standalone = new Run(makePlatform(), M2_RULES);
    standalone.start('arc', 3, 'wrench', 'standard', undefined, 'normal', 0, {});
    assert.equal(standalone.data, null);
    run.dispose();
    restored.dispose();
    standalone.dispose();
});

test('catalog covers all weapons and dedicated effects alter real shot geometry and targets', () => {
    for (const id of Object.keys(TOOLS)) assert.equal(attachmentIdsForWeapon(id).length, 5);
    assert.ok(Object.values(GEAR).length >= 6);
    const { equipment, tools } = createEquipment('hydraulic_nailer', {});
    function fire(attach) {
        const weapon = { ...tools[0], attachments: attach ? ['hydraulic_nailer/finisher', null, null] : tools[0].attachments };
        const battle = new Battle(5, 73, [weapon], CAMPAIGN_01_RULES, { equipment });
        Object.assign(battle.player, { x: 50, y: 300 });
        const enemies = [[80, 300], [110, 300], [140, 310]].map(([x, y], id) =>
            ({ id, x, y, hp: 20, kind: 'turret', state: 'walk', next: 100, vx: 0, vy: 0, marked: false }));
        battle.enemies.splice(0, battle.enemies.length, ...enemies);
        battle.step(0, 0);
        return { hp: enemies.map(enemy => enemy.hp), width: battle.effects.find(effect => effect.shape === 'strip').halfWidth };
    }
    assert.deepEqual(fire(false), { hp: [16, 16, 20], width: 9 });
    assert.deepEqual(fire(true), { hp: [16, 16, 16], width: 11 });

    const loaded = { ...equipment, gear: ['gear/runner', 'gear/pulse', 'gear/pickup'] };
    const stats = resolveEquipment(tools, loaded, 'magnet', 10);
    assert.equal(stats.actor.pickupRadius, 53);
    assert.deepEqual(equipmentBuilds(tools, loaded, 'magnet'), ['magnet']);
    const moving = new Battle(0, 73, tools, CAMPAIGN_01_RULES, { equipment: loaded, route: 'magnet' });
    const x = moving.player.x;
    moving.step(1, 0);
    assert.ok(Math.abs(moving.player.x - x - 5.2 * 1.12) < 1e-8);
});
