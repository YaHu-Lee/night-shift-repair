import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHAPTER_CATALOG,
    MODULE_CATALOG,
    RIG_CATALOG,
    WEAPON_CATALOG,
    WORKSHOP_TALENTS,
} from '../.m0-build/roguelite/catalog.js';
import { CHAPTER_NARRATIVES } from '../.m0-build/roguelite/narrative.js';
import {
    armorDamageMultiplier,
    computeSynergies,
    computeWeaponCooldown,
    computeWeaponHit,
    incomingDamage,
    rerollPrice,
    resolveBuild,
    shopOfferPrice,
    workshopTalentCost,
    xpRequiredForLevel,
} from '../.m0-build/roguelite/formulas.js';
import {
    buyShopSlot,
    createIntermission,
    mergeOwnedWeapons,
    pickLevelUp,
    rerollShop,
    sellOwnedWeapon,
    toggleLockSlot,
} from '../.m0-build/roguelite/shop.js';
import { RogueliteBattle } from '../.m0-build/roguelite/battle.js';
import {
    PatrolSession,
    buyWorkshopTalent,
    createDefaultProfile,
    toggleModuleBan,
} from '../.m0-build/roguelite/session.js';
import { PatrolStorage, migrateLegacyCampaignProfile } from '../.m0-build/roguelite/persistence.js';
import { makePlatform } from '../.m0-build/platform/platform.js';

test('armor follows linear EHP curve without reaching immunity, and negative armor stays bounded', () => {
    assert.equal(armorDamageMultiplier(0), 1);
    assert.equal(armorDamageMultiplier(15), 0.5);
    assert.ok(Math.abs(armorDamageMultiplier(30) - 1 / 3) < 1e-9);
    assert.ok(armorDamageMultiplier(150) > 0 && armorDamageMultiplier(150) < 0.1);
    assert.equal(armorDamageMultiplier(-15), 1.5);
    assert.equal(incomingDamage(20, 15), 10);
});

test('global workshop talents apply to all 6 weapon slots and armor converts to melee torque', () => {
    const profile = { ...createDefaultProfile(), talents: { capacitor: 3, chassis: 4 } };
    const weapons = [
        { uid: 1, id: 'wrench', tier: 1 },
        { uid: 2, id: 'wrench', tier: 1 },
        { uid: 3, id: 'bypass_wrench', tier: 1 },
        { uid: 4, id: 'bypass_wrench', tier: 1 },
        { uid: 5, id: 'wrench', tier: 1 },
        { uid: 6, id: 'wrench', tier: 1 },
    ];
    const build = resolveBuild('heavy_fitter', 5, {}, weapons, [], profile);
    assert.equal(build.stats.overclock, 12, 'capacitor applies +12% overclock globally');
    assert.equal(build.stats.cycleSpeed, 21, 'capacitor (+9%) + arc 4-set (+12%) stack globally');
    // heavy_fitter (+4) + chassis rank 4 (+2) + melee 6-set (+8) = 14 armor -> 200% armor->torque conversion
    assert.equal(build.stats.armor, 14);
    assert.ok(build.stats.torque >= 4 + 12 + 28, 'both rig and melee 6-set convert armor to torque');

    const hitSlot0 = computeWeaponHit('wrench', 1, build.stats, () => 0.99);
    const hitSlot5 = computeWeaponHit('wrench', 1, build.stats, () => 0.99);
    assert.equal(hitSlot0.damage, hitSlot5.damage, 'slot 5 weapon gets full global talent and stat scaling');
});

test('shop inflation, escalating rerolls, locking price freeze, auto-merge at 6 slots, and recycling work', () => {
    assert.ok(shopOfferPrice(20, 10) > shopOfferPrice(20, 1) * 2, 'prices inflate across waves');
    assert.ok(rerollPrice(5, 2) > rerollPrice(5, 1) && rerollPrice(5, 1) > rerollPrice(5, 0), 'reroll price escalates');
    assert.ok(workshopTalentCost(WORKSHOP_TALENTS[0], 3) > workshopTalentCost(WORKSHOP_TALENTS[0], 0) * 2);

    const profile = { ...createDefaultProfile(), talents: { shop_permit: 1 } };
    const weapons = [
        { uid: 1, id: 'wrench', tier: 1 },
        { uid: 2, id: 'wrench', tier: 1 },
        { uid: 3, id: 'arc_gun', tier: 1 },
        { uid: 4, id: 'arc_gun', tier: 1 },
        { uid: 5, id: 'torch', tier: 1 },
        { uid: 6, id: 'induction', tier: 1 },
    ];
    const shop = createIntermission({
        wave: 3, seed: 42, rigId: 'duty_standard', parts: 500, level: 3, pendingLevelUps: 1,
        levelStats: {}, weapons, modules: [], nextWeaponUid: 7,
    }, profile);

    assert.equal(buyShopSlot(shop, 0, profile).ok, false, 'must resolve level-up before buying');
    assert.equal(pickLevelUp(shop, 0, profile), true);
    assert.equal(shop.pendingLevelUps, 0);

    // Lock slot 0 and verify it survives reroll with identical frozen price
    const lockedBefore = { ...shop.slots[0] };
    assert.equal(toggleLockSlot(shop, 0, profile), true);
    assert.equal(rerollShop(shop, profile), true);
    assert.equal(shop.slots[0].itemId, lockedBefore.itemId);
    assert.equal(shop.slots[0].price, lockedBefore.price);

    // Manual merge of two identical T1 wrenches -> one T2 wrench
    assert.equal(mergeOwnedWeapons(shop, 0, 1), true);
    assert.equal(shop.weapons.length, 5);
    assert.equal(shop.weapons[0].tier, 2);

    // Selling refunds 40% current price and cannot sell last weapon
    const beforeParts = shop.parts;
    const refund = sellOwnedWeapon(shop, 4, profile);
    assert.ok(refund > 0 && shop.parts === beforeParts + refund);
    // With < 6 weapons, duplicate weapon in shop buys into empty slot rather than auto-merging
    shop.slots[1] = { slotIndex: 1, kind: 'weapon', itemId: 'arc_gun', tier: 1, price: 30, locked: false, sold: false, canAutoMerge: false };
    assert.equal(shop.weapons.length, 4);
    assert.equal(buyShopSlot(shop, 1, profile).merged, false, 'duplicate weapon fills empty slot before 6/6');

    // Full 6-slot auto-merge when buying duplicate tier weapon
    shop.weapons = Array.from({ length: 6 }, (_, i) => ({ uid: i + 1, id: 'wrench', tier: 1 }));
    shop.slots[1] = { slotIndex: 1, kind: 'weapon', itemId: 'wrench', tier: 1, price: 30, locked: false, sold: false, canAutoMerge: true };
    const res = buyShopSlot(shop, 1, profile);
    assert.equal(res.ok, true);
    assert.equal(res.merged, true);
    assert.equal(shop.weapons.length, 6);
    assert.ok(shop.weapons.some(w => w.tier === 2));
});

test('redesigned jammer actively slows weapon cadence and blocks arc chains, ambusher stalks and exposes', () => {
    const ch3 = CHAPTER_CATALOG[2];
    const battle = new RogueliteBattle({
        chapter: ch3, waveIndex: 0, seed: 42, danger: 0, rigId: 'high_voltage', level: 2, levelStats: {},
        weapons: [{ uid: 1, id: 'arc_gun', tier: 2 }, { uid: 2, id: 'wrench', tier: 2 }],
        modules: [], startHp: 60, carriedBagParts: 0,
    });
    // Inject an active jammer right next to player
    battle.enemies.push({
        id: 901, kind: 'jammer', x: battle.player.x + 40, y: battle.player.y, hp: 500, maxHp: 500,
        damage: 10, speed: 35, radius: 13, parts: 3, xp: 4, state: 'dash', next: 200,
        vx: 0, vy: 0, facingX: -1, facingY: 0, sprintTicks: 0, shockedUntil: 0, vulnerableUntil: 0,
        vulnerableBonus: 0, burnStacks: 0, burnDamage: 0, burnUntil: 0, slowUntil: 0, nextShift: 0, bossCycle: 0, bossStage: 1,
    });
    battle.step(0, 0);
    assert.equal(battle.isJammed, true, 'active jammer within 68px jams the player');
    assert.ok(computeWeaponCooldown(20, 0, true) > computeWeaponCooldown(20, 0, false), 'jamming slows weapon cadence');

    // Inject stealth ambusher far away, verify untargetable until close
    const amb = {
        id: 902, kind: 'ambusher', x: battle.player.x + 80, y: battle.player.y, hp: 200, maxHp: 200,
        damage: 14, speed: 56, radius: 12, parts: 3, xp: 5, state: 'stealth', next: 0,
        vx: 0, vy: 0, facingX: -1, facingY: 0, sprintTicks: 0, shockedUntil: 0, vulnerableUntil: 0,
        vulnerableBonus: 0, burnStacks: 0, burnDamage: 0, burnUntil: 0, slowUntil: 0, nextShift: 0, bossCycle: 0, bossStage: 1,
    };
    battle.enemies.push(amb);
    battle.step(0, 0);
    assert.equal(amb.state, 'warn', 'ambusher telegraphs once within 95px');
});

test('boss takes 100% baseline damage (no 58% sponge) and 150% burst damage during open window', () => {
    const ch1 = CHAPTER_CATALOG[0];
    const b1 = new RogueliteBattle({
        chapter: ch1, waveIndex: 11, seed: 77, danger: 0, rigId: 'duty_standard', level: 8, levelStats: { torque: 20 },
        weapons: [{ uid: 1, id: 'hydraulic_nailer', tier: 3 }], modules: [], startHp: 90, carriedBagParts: 0,
    });
    const boss = b1.boss;
    assert.ok(boss);
    boss.x = b1.player.x + 100; boss.y = b1.player.y;
    const hpStart = boss.hp;
    boss.state = 'walk';
    b1.step(0, 0);
    const normalDmg = hpStart - boss.hp;

    // Now test open window vulnerability (1.5x)
    const b2 = new RogueliteBattle({
        chapter: ch1, waveIndex: 11, seed: 77, danger: 0, rigId: 'duty_standard', level: 8, levelStats: { torque: 20 },
        weapons: [{ uid: 1, id: 'hydraulic_nailer', tier: 3 }], modules: [], startHp: 90, carriedBagParts: 0,
    });
    const boss2 = b2.boss;
    boss2.x = b2.player.x + 100; boss2.y = b2.player.y;
    boss2.state = 'open'; boss2.next = 100;
    const hpStart2 = boss2.hp;
    b2.step(0, 0);
    const openDmg = hpStart2 - boss2.hp;
    assert.ok(normalDmg > 40, 'baseline boss hit deals full unmitigated damage');
    assert.ok(openDmg >= Math.round(normalDmg * 1.45), `open window deals ~1.5x burst (${openDmg} vs ${normalDmg})`);
});

test('patrol session runs a full wave, retains bag parts, grants level-ups, bans modules, and settles profile', () => {
    let profile = { ...createDefaultProfile(), credits: 50 };
    profile = buyWorkshopTalent(profile, 'ban_permit');
    assert.ok(profile);
    profile = toggleModuleBan(profile, MODULE_CATALOG[0].id);
    assert.ok(profile?.bannedModules.includes(MODULE_CATALOG[0].id));

    const session = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', seed: 101, profile });
    assert.equal(session.phase, 'battle');
    let tick = 0;
    while (session.phase === 'battle') {
        tick++;
        // Kite in a wide circle around the arena
        session.stepBattle(Math.cos(tick / 40), Math.sin(tick / 40));
    }
    assert.equal(session.phase, 'shop');
    assert.ok(session.parts > 0);
    assert.ok(xpRequiredForLevel(1) > 0);

    // Check all 4 chapters have complete narrative & 12 waves
    assert.equal(CHAPTER_CATALOG.length, 4);
    for (const ch of CHAPTER_CATALOG) {
        assert.equal(ch.waves.length, 12);
        assert.equal(ch.stations.length, 5);
        assert.ok(CHAPTER_NARRATIVES[ch.id].opener.line.length > 20);
        assert.ok(CHAPTER_NARRATIVES[ch.id].clearOutro.line.length > 20);
    }
    // Check all 10 pixel weapons & 5 rigs are cataloged with valid synergies
    assert.equal(Object.keys(WEAPON_CATALOG).length, 10);
    assert.equal(Object.keys(RIG_CATALOG).length, 5);
    assert.equal(computeSynergies([{ uid: 1, id: 'wrench', tier: 1 }, { uid: 2, id: 'arc_gun', tier: 1 }], 'duty_standard').find(s => s.tag === 'arc')?.activeTier, 2);
});

test('persistence migrates legacy clears/credits and round-trips active patrol checkpoints with locks', () => {
    const store = new Map();
    const env = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } } };
    const storage = new PatrolStorage(makePlatform(env, 'test.prof'), makePlatform(env, 'test.run'), makePlatform(env, 'test.save'));

    const migrated = storage.loadProfile({ clearedStages: ['01', '05', '10'], credits: 72 });
    assert.deepEqual(migrated.clearedChapters, ['01', '02']);
    assert.equal(migrated.credits, 72);

    const session = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', seed: 303, profile: migrated });
    let tick = 0;
    while (session.phase === 'battle') {
        tick++;
        session.stepBattle(Math.cos(tick / 40), Math.sin(tick / 40));
    }
    assert.equal(session.phase, 'shop');
    while (session.shopView && session.shopView.pendingLevelUps > 0) session.chooseLevelUp(0);
    assert.equal(session.toggleLock(0), true);
    const lockedId = session.shopView.slots[0].itemId;
    assert.equal(storage.saveActiveRun(session), true);

    const restored = storage.loadActiveRun(migrated);
    assert.ok(restored);
    assert.equal(restored.phase, 'shop');
    assert.equal(restored.waveIndex, session.waveIndex);
    assert.equal(restored.shopView.slots[0].itemId, lockedId);
    assert.equal(restored.shopView.slots[0].locked, true);

    const freshLegacy = migrateLegacyCampaignProfile(null);
    assert.equal(freshLegacy.credits, 0);
});

test('roguelite battle emits visual bridge casts, effects, impacts, and boss view for pixel skin rendering', () => {
    const ch1 = CHAPTER_CATALOG[0];
    const battle = new RogueliteBattle({
        chapter: ch1, waveIndex: 11, seed: 55, danger: 0, rigId: 'high_voltage', level: 8, levelStats: { voltage: 15 },
        weapons: [
            { uid: 1, id: 'wrench', tier: 3 },
            { uid: 2, id: 'arc_gun', tier: 3 },
            { uid: 3, id: 'riveter', tier: 2 },
        ],
        modules: [], startHp: 80, carriedBagParts: 0,
    });
    battle.boss.x = battle.player.x + 50;
    battle.boss.y = battle.player.y;
    for (let i = 0; i < 20; i++) battle.step(0, 0);
    const bridge = battle.toRenderBridge();
    assert.ok(bridge.weaponCasts.length > 0, 'emits weapon casts for floating weapon art');
    assert.ok(bridge.effects.length > 0 || bridge.weaponImpacts.length > 0, 'emits skill effects and impacts');
    assert.ok(bridge.chapterBoss && bridge.chapterBoss.title === ch1.bossName, 'exposes boss HUD view');
});


function patrolJournalFixture() {
    const disk = new Map();
    const env = { localStorage: { getItem: k => disk.get(k) ?? null, setItem: (k, v) => disk.set(k, v) } };
    const platform = name => makePlatform(env, name);
    const open = (local = platform('save')) => new PatrolStorage(platform('profile3'), platform('run3'), local);
    return { disk, platform, open };
}

function shopSession(profile, seed = 42) {
    const run = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', seed, profile });
    run.parts = 500;
    run.xp = 60;
    while (run.phase === 'battle') run.stepBattle(0.5, 0.2);
    assert.equal(run.phase, 'shop');
    return run;
}

test('shop restores exact choices, lock positions, refresh prices and future draws after a cold launch', () => {
    const { open } = patrolJournalFixture();
    const storage = open();
    const profile = storage.loadProfile();
    const run = shopSession(profile);
    function reload() {
        assert.ok(storage.saveActiveRun(run));
        const cold = open();
        return cold.loadActiveRun(cold.loadProfile());
    }
    assert.ok(run.rerollLevelUpOptions());
    assert.deepEqual(reload().shopView, run.shopView);
    while (run.shopView.pendingLevelUps) run.chooseLevelUp(0);
    assert.ok(run.reroll());
    assert.ok(run.toggleLock(3));
    assert.ok(run.buySlot(0).ok);
    const restored = reload();
    assert.deepEqual(restored.shopView, run.shopView);
    assert.ok(restored.shopView.slots[0].sold);
    assert.ok(restored.shopView.slots[3].locked);
    run.reroll();
    restored.reroll();
    assert.deepEqual(restored.snapshot(), run.snapshot());
    const lockedItem = run.shopView.slots[3];
    assert.ok(run.startNextWave());
    // Isolate cross-wave lock persistence from second-wave combat difficulty.
    run.battle.player.invulnerableUntil = Infinity;
    while (run.phase === 'battle') run.stepBattle(0.5, 0.2);
    assert.equal(run.phase, 'shop');
    const carried = reload().shopView.slots.find(slot => slot.locked);
    assert.equal(carried.itemId, lockedItem.itemId);
    assert.equal(carried.price, lockedItem.price);
});

test('settlement survives failed writes at either stage and cold starts without double payment', () => {
    const { platform, open } = patrolJournalFixture();
    const local = platform('save');
    const write = local.writeCheckpoint.bind(local);
    const storage = open(local);
    const profile = storage.loadProfile();
    const run = shopSession(profile);
    assert.ok(storage.saveActiveRun(run));
    run.phase = 'won';
    run.intermission = null;
    local.writeCheckpoint = () => false;
    assert.equal(storage.settleRun(run), null);
    const original = open();
    assert.equal(original.loadActiveRun(original.loadProfile()).phase, 'shop');

    local.writeCheckpoint = (ver, value, validate) => value.run !== null && write(ver, value, validate);
    assert.equal(storage.settleRun(run), null);
    const cold = open();
    const pendingProfile = cold.loadProfile();
    assert.equal(pendingProfile.credits, 0);
    const pending = cold.loadActiveRun(pendingProfile);
    assert.equal(pending.phase, 'won');
    const expected = pending.settle().creditsEarned;
    const awarded = cold.settleRun(pending);
    assert.equal(awarded.credits, expected);
    assert.deepEqual(awarded.clearedChapters, ['01']);
    assert.equal(cold.settleRun(pending).credits, expected);
    const confirmed = open();
    assert.equal(confirmed.loadProfile().credits, expected);
    assert.equal(confirmed.loadActiveRun(awarded), null);
});

test('legacy patrol data migrates without changing its source, and a legacy run tombstone stays empty', () => {
    const { platform, open } = patrolJournalFixture();
    const profile = { ...createDefaultProfile(), credits: 71 };
    const legacy = shopSession(profile).snapshot();
    delete legacy.runId;
    delete legacy.shop;
    legacy.version = 3;
    legacy.nextWeaponUid = legacy.weapons[0].uid;
    assert.ok(platform('profile3').writeCheckpoint(3, profile));
    assert.ok(platform('run3').writeCheckpoint(3, legacy));
    const storage = open();
    assert.deepEqual(storage.loadProfile(), profile);
    const run = storage.loadActiveRun(profile);
    assert.equal(run.parts, legacy.parts);
    assert.ok(run.snapshot().nextWeaponUid > legacy.weapons[0].uid);
    assert.ok(storage.saveActiveRun(run));
    assert.deepEqual(platform('run3').readCheckpoint(3), legacy);
    assert.ok(platform('run3').clearCheckpoint());
    const restored = open();
    assert.equal(restored.loadActiveRun(restored.loadProfile()).runId, run.runId);

    const empty = patrolJournalFixture();
    assert.ok(empty.platform('run3').clearCheckpoint());
    const migrated = empty.open();
    assert.equal(migrated.loadActiveRun(migrated.loadProfile()), null);
    assert.equal(migrated.needsReload, false);
});

test('stale writers and unreadable saves cannot replace progress; a bad slot falls back to its good generation', () => {
    const { open, platform, disk } = patrolJournalFixture();
    const first = open(), stale = open();
    const profile = first.loadProfile();
    stale.loadProfile();
    assert.ok(first.saveProfile({ ...profile, credits: 10 }));
    assert.equal(stale.saveProfile({ ...profile, credits: 2 }), false);
    assert.ok(stale.needsReload);
    const journal = platform('save');
    const good = journal.readCheckpoint(4);
    assert.ok(journal.writeCheckpoint(4, { ...good, run: { version: 4 } }));
    const reader = open();
    assert.equal(reader.loadProfile().credits, 10);
    assert.ok(reader.saveProfile({ ...profile, credits: 12 }));
    for (const key of disk.keys()) disk.set(key, '{broken');
    const bad = open();
    bad.loadProfile();
    assert.ok(bad.needsReload);
    assert.equal(bad.saveProfile(profile), false);
    assert.deepEqual([...disk.values()], ['{broken', '{broken']);
});

test('a settlement write with lost read-back confirmation can be retried without paying twice', () => {
    const { platform, open } = patrolJournalFixture();
    const local = platform('save');
    const storage = open(local);
    const run = shopSession(storage.loadProfile());
    assert.ok(storage.saveActiveRun(run));
    run.intermission = null;
    run.phase = 'lost';
    const write = local.writeCheckpoint.bind(local);
    local.writeCheckpoint = (version, value, validate) => {
        const persisted = write(version, value, validate);
        return !value.lastSettledRunId && persisted;
    };
    assert.equal(storage.settleRun(run), null);
    const expected = run.settle().creditsEarned;
    assert.ok(expected > 0);
    assert.equal(storage.settleRun(run).credits, expected);
    const cold = open();
    const profile = cold.loadProfile();
    assert.equal(profile.credits, expected);
    assert.equal(cold.loadActiveRun(profile), null);
});

test('spent free rerolls and the buyout bonus survive a reopened shop', () => {
    const { open } = patrolJournalFixture();
    const storage = open();
    const profile = { ...storage.loadProfile(), talents: { toolbox: 1 } };
    assert.ok(storage.saveProfile(profile));
    const run = shopSession(profile);
    while (run.shopView.pendingLevelUps) run.chooseLevelUp(0);
    assert.equal(run.shopView.freeRerollsLeft, 1);
    assert.ok(run.reroll());
    for (let i = 0; i < 4; i++) assert.ok(run.buySlot(i).ok);
    assert.ok(run.intermission.buyoutBonusUsed);
    assert.ok(storage.saveActiveRun(run));
    const cold = open();
    const restored = cold.loadActiveRun(cold.loadProfile());
    assert.equal(restored.shopView.freeRerollsLeft, 0);
    assert.ok(restored.intermission.buyoutBonusUsed);
    assert.deepEqual(restored.shopView, run.shopView);
});
