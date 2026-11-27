import test from 'node:test';
import assert from 'node:assert/strict';
import {
    CHAPTER_CATALOG,
    MODULE_CATALOG,
    RIG_CATALOG,
    WEAPON_CATALOG,
    WORKSHOP_TALENTS,
} from '../.m0-build/roguelite/catalog.js';
import {
    CHAPTER_NARRATIVES,
    RIG_FLAVOR,
    defeatRadioLine,
    homeDispatchStatus,
    shopStoryBeatHint,
} from '../.m0-build/roguelite/narrative.js';
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
    buyPreRunSupply,
    buyWorkshopTalent,
    createDefaultProfile,
    toggleModuleBan,
} from '../.m0-build/roguelite/session.js';
import {
    CHAPTER_CLEAR_BONUS,
    DANGER_CAPSTONE_MODULES,
    FIRST_CLEAR_DANGER_BONUS,
    goldSealCount,
    hasCustomStarterUnlock,
    isChapterUnlocked,
    isDangerUnlocked,
    isModuleUnlocked,
    isRigUnlocked,
    isSecretArchiveUnlocked,
    maxUnlockedDanger,
    totalBanSlots,
    unlockedWeaponsForProfile,
} from '../.m0-build/roguelite/progression.js';
import { PatrolStorage, migrateLegacyCampaignProfile } from '../.m0-build/roguelite/persistence.js';
import {
    DAILY_CHECKIN_CREDITS,
    DAILY_SHIFT_BONUS_CREDITS,
    SHOP_EMERGENCY_PARTS,
    buildEndlessWaveDef,
    canClaimDailyCheckIn,
    claimDailyCheckIn,
    consumeDailyAdUse,
    consumeFreeSupplyCharge,
    freeSupplyChargesToday,
    getDailyShift,
    isFirstTimePlayer,
    markOnboardingDone,
    mergeWorkshopProfiles,
    remainingDailyAdUses,
} from '../.m0-build/roguelite/engagement.js';
import { createMiniGameEngage } from '../.m0-build/platform/miniGameEngage.js';
import { circleContact, createMeleeMotion, weaponDock } from '../.m0-build/roguelite/weaponMotion.js';
import { CAMPAIGN_FIELD } from '../.m0-build/roguelite/constants.js';
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

test('refreshing a fully reserved shelf spends neither copper nor a free refresh', () => {
    const profile = { ...createDefaultProfile(), talents: { shop_permit: 2 }, maxDangerCleared: { '01': 3 } };
    const shop = createIntermission({
        wave: 3, seed: 42, rigId: 'duty_standard', parts: 500, level: 3, pendingLevelUps: 0,
        levelStats: {}, weapons: [{ uid: 1, id: 'wrench', tier: 1 }], modules: [], nextWeaponUid: 2,
    }, profile);
    shop.slots.forEach((_, i) => assert.equal(toggleLockSlot(shop, i, profile), true));
    for (const free of [0, 1]) {
        shop.freeRerollsLeft = free;
        const before = structuredClone(shop);
        assert.equal(rerollShop(shop, profile), false);
        assert.deepEqual(shop, before);
    }
    assert.equal(toggleLockSlot(shop, 0, profile), true);
    assert.equal(rerollShop(shop, profile), true);
    assert.equal(shop.freeRerollsLeft, 0);
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
        const narrative = CHAPTER_NARRATIVES[ch.id];
        assert.ok(narrative.opener.line.length > 20 && narrative.opener.line.length <= 52, narrative.opener.line);
        assert.ok(narrative.clearOutro.line.length > 20 && narrative.clearOutro.line.length <= 72, narrative.clearOutro.line);
        assert.ok(narrative.midTurn.line.length <= 46, narrative.midTurn.line);
        assert.equal(ch.stations[2].arriveRadio, `${narrative.midTurn.speaker}：${narrative.midTurn.line}`);
        assert.equal(ch.waves[11].hint, narrative.bossIntro.line);
        if (narrative.epilogueHook) assert.ok(narrative.epilogueHook.line.length <= 46, narrative.epilogueHook.line);
        for (const station of ch.stations) {
            assert.ok(station.arriveRadio && station.arriveRadio.length <= 50, station.arriveRadio);
        }
        for (const wave of ch.waves) assert.ok(wave.hint.length <= 42, `${ch.id} ${wave.wave} ${wave.hint}`);
    }
    // Check all 10 pixel weapons & 5 rigs are cataloged with valid synergies
    for (const mod of MODULE_CATALOG) {
        const lead = mod.flavor.split(/[，。！]/)[0];
        assert.ok(lead.length > 0 && lead.length <= 14, `${mod.id} ${lead}`);
    }
    for (const spec of Object.values(WEAPON_CATALOG)) {
        const role = spec.roleText.split(/[，。！]/)[0];
        assert.ok(role.length <= 14, spec.roleText);
        for (const tier of spec.tiers) {
            if (!tier.perkText) continue;
            const lead = tier.perkText.split(/[，。！]/)[0];
            assert.ok(lead.length <= 14, tier.perkText);
        }
    }
    for (const rig of Object.values(RIG_CATALOG)) {
        assert.ok(rig.tradeoff.length <= 16, rig.tradeoff);
    }
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
    const aim = battle.toRenderBridge().rangedAimTarget;
    battle.boss.x = battle.player.x + 1000;
    battle.boss.y = battle.player.y;
    assert.equal(aim(2), undefined);
    battle.boss.x = battle.player.x + 50;
    assert.equal(aim(2), battle.boss, 'the riveter can track before its first shot');
    assert.equal(battle.weaponCasts.length, 0, 'sampling aim cannot fire a weapon');
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

test('chapter & danger progression unlocks rigs, weapons, capstones, secret archives, and auto-claims lower milestones', () => {
    const fresh = createDefaultProfile();
    assert.equal(isChapterUnlocked(fresh, '01'), true);
    assert.equal(isChapterUnlocked(fresh, '02'), false);
    assert.equal(isDangerUnlocked(fresh, 0), true);
    assert.equal(isDangerUnlocked(fresh, 1), false);
    assert.equal(isRigUnlocked(fresh, 'duty_standard'), true);
    assert.equal(isRigUnlocked(fresh, 'heavy_fitter'), true);
    assert.equal(isRigUnlocked(fresh, 'high_voltage'), false);
    assert.equal(unlockedWeaponsForProfile(fresh).includes('traction_coil'), false);
    assert.equal(isModuleUnlocked(fresh, DANGER_CAPSTONE_MODULES[1]), false);

    // Clearing Chapter 1 D0 unlocks Chapter 2, High Voltage rig, Traction Coil, and Danger 1
    const run1 = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', danger: 0, seed: 11, profile: fresh });
    run1.reports.push(...Array.from({ length: 12 }, (_, i) => ({
        wave: i + 1, stationName: '配电站', cleared: true, elapsedSeconds: 30, kills: 10, elitesKilled: 0,
        partsCollected: 10, partsBagged: 0, bagRedeemed: 0, xpGained: 10, damageTaken: 0, hitsTaken: 0,
        healed: 0, endHp: 60, maxHp: 60, defeatedBy: null, hitSources: {}, damageByWeapon: [], emptySeconds: 0,
    })));
    run1.phase = 'won';
    const res1 = run1.settle(fresh);
    assert.equal(res1.firstClearBonus, FIRST_CLEAR_DANGER_BONUS[0]);
    assert.equal(res1.creditsEarned, 24 + CHAPTER_CLEAR_BONUS['01'] + FIRST_CLEAR_DANGER_BONUS[0]);
    assert.ok(res1.unlocks.includes(`解锁工装：${RIG_CATALOG.high_voltage.name}`));
    assert.ok(res1.unlocks.includes(`解锁武器：${WEAPON_CATALOG.traction_coil.name}`));
    assert.ok(res1.unlocks.includes('解锁难度 1 · 寒潮来袭'));

    const after1 = run1.applySettlementToProfile(fresh);
    assert.equal(isChapterUnlocked(after1, '02'), true);
    assert.equal(isRigUnlocked(after1, 'high_voltage'), true);
    assert.equal(unlockedWeaponsForProfile(after1).includes('traction_coil'), true);
    assert.equal(maxUnlockedDanger(after1), 1);
    assert.equal(after1.maxDangerByRig?.duty_standard, 0);

    // Jump directly to Chapter 2 D2 (after unlocking D2 via Ch1 D1): auto-claims D0+D1+D2 milestones & unlocks secret archive + bonus bans
    const withD2 = { ...after1, maxDangerCleared: { '01': 1 } };
    const run2 = new PatrolSession({ chapterId: '02', rigId: 'high_voltage', danger: 2, seed: 22, profile: withD2 });
    run2.reports.push(...run1.reports);
    run2.phase = 'won';
    const res2 = run2.settle(withD2);
    assert.equal(res2.firstClearBonus, FIRST_CLEAR_DANGER_BONUS[0] + FIRST_CLEAR_DANGER_BONUS[1] + FIRST_CLEAR_DANGER_BONUS[2]);
    assert.ok(res2.unlocks.includes('解锁配件：急诊稳压器'));
    assert.ok(res2.unlocks.includes('解锁本章加密附件'));
    const after2 = run2.applySettlementToProfile(withD2);
    assert.equal(isSecretArchiveUnlocked(after2, '02'), true);
    assert.equal(isModuleUnlocked(after2, 'emergency_generator'), true);
    assert.equal(totalBanSlots(after2), 2);
    assert.equal(after2.maxDangerByRig?.high_voltage, 2);

    // Re-clearing Ch2 D2 gives zero duplicate first-clear bonus
    assert.equal(run2.settle(after2).firstClearBonus, 0);

    // Chapter 4 clear pays strictly more base credits than Chapter 1 and unlocks custom starter + D4 gold seal
    const preCh4 = { ...after2, clearedChapters: ['01', '02', '03'], maxDangerCleared: { '01': 4, '02': 4, '03': 4 } };
    const run4 = new PatrolSession({ chapterId: '04', rigId: 'heavy_fitter', danger: 4, seed: 44, profile: preCh4 });
    run4.reports.push(...run1.reports);
    run4.phase = 'won';
    const res4 = run4.settle(preCh4);
    assert.ok(CHAPTER_CLEAR_BONUS['04'] > CHAPTER_CLEAR_BONUS['01']);
    const after4 = run4.applySettlementToProfile(preCh4);
    assert.equal(hasCustomStarterUnlock(after4), true);
    assert.equal(goldSealCount(after4), 4);
    assert.equal(isModuleUnlocked(after4, 'main_breaker_lever'), true);
    assert.ok(res4.unlocks.includes('集齐四章金章'));
    assert.ok(resolveBuild('duty_standard', 1, {}, [{ uid: 1, id: 'wrench', tier: 1 }], [], after4).maxLocks >= 2);
});

test('danger mechanical rules (D1-D4), D4 capstone surge, and pre-run supplies work atomically', () => {
    // D1 cold shift lowers between-wave HP recovery from 30% to 18%, while hot_thermos adds +10 maxHp and +10% recovery
    const b0 = resolveBuild('duty_standard', 0, {}, [{ uid: 1, id: 'wrench', tier: 1 }], [], undefined, 0, 'none');
    const b2 = resolveBuild('duty_standard', 0, {}, [{ uid: 1, id: 'wrench', tier: 1 }], [], undefined, 2, 'hot_thermos');
    assert.ok(b2.shopPriceScale > b0.shopPriceScale, 'D2 increases shop price scale by 10%');
    assert.equal(b2.stats.maxHp, b0.stats.maxHp + 10, 'hot_thermos adds +10 maxHp');

    // D3 spawns Wave-5 escorts AND Wave-8 patrol elite
    const ch1 = CHAPTER_CATALOG[0];
    const w5d3 = new RogueliteBattle({
        chapter: ch1, waveIndex: 4, seed: 77, danger: 3, rigId: 'duty_standard', level: 4, levelStats: {},
        weapons: [{ uid: 1, id: 'wrench', tier: 2 }], modules: [], startHp: 60, carriedBagParts: 0,
    });
    assert.ok(w5d3.boss !== null);
    assert.ok(w5d3.warnings.length >= 2, 'D3 Wave 5 spawns 2 escorts beside the mid-boss');
    const w8d3 = new RogueliteBattle({
        chapter: ch1, waveIndex: 7, seed: 77, danger: 3, rigId: 'duty_standard', level: 7, levelStats: {},
        weapons: [{ uid: 1, id: 'wrench', tier: 2 }], modules: [], startHp: 60, carriedBagParts: 0,
    });
    assert.ok(w8d3.boss !== null, 'D3 spawns an extra elite on Wave 8');

    // D4 capstone main_breaker_lever triggers wave-opening shock ring + surge
    const surgeBattle = new RogueliteBattle({
        chapter: ch1, waveIndex: 0, seed: 9, danger: 0, rigId: 'duty_standard', level: 1, levelStats: {},
        weapons: [{ uid: 1, id: 'wrench', tier: 1 }], modules: ['main_breaker_lever'], startHp: 60, carriedBagParts: 0,
    });
    assert.equal(surgeBattle.build.hasBreakerSurge, true);
    surgeBattle.step(0, 0);
    assert.equal(surgeBattle.effects.filter(e => e.shape === 'circle' && e.radius === 140).length, 1,
        'breaker surge emits exactly one shock ring on tick 1');
    assert.ok(surgeBattle.floaters.some(f => f.text === '开场电震'));

    // Pre-run supply spare_parts & atomic storage.startRun (failed write must not spend credits)
    const { platform, open } = patrolJournalFixture();
    const local = platform('save');
    const storage = open(local);
    const rich = { ...storage.loadProfile(), credits: 30 };
    assert.ok(storage.saveProfile(rich));
    const paid = buyPreRunSupply(rich, 'spare_parts');
    assert.equal(paid.credits, 15);
    const suppliedRun = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', danger: 0, supply: 'spare_parts', seed: 99, profile: paid });
    assert.equal(suppliedRun.parts, 35);

    // Simulate storage failure on startRun: credits remain intact on disk
    const origWrite = local.writeCheckpoint.bind(local);
    local.writeCheckpoint = () => false;
    assert.equal(storage.startRun(paid, suppliedRun), false);
    assert.equal(open(local).loadProfile().credits, 30);

    // Succeed startRun and verify cold reload preserves supply & parts without double-adding 35
    local.writeCheckpoint = origWrite;
    assert.equal(storage.startRun(paid, suppliedRun), true);
    const cold = open(local);
    const coldProf = cold.loadProfile();
    assert.equal(coldProf.credits, 15);
    const coldRun = cold.loadActiveRun(coldProf);
    assert.equal(coldRun.supply, 'spare_parts');
    assert.equal(coldRun.parts, 35);

    // extra_crate supply grants +1 free reroll on wave 1 shop
    const crateShop = createIntermission({
        wave: 1, seed: 12, rigId: 'duty_standard', danger: 0, supply: 'extra_crate',
        parts: 50, level: 1, pendingLevelUps: 0, levelStats: {},
        weapons: [{ uid: 1, id: 'wrench', tier: 1 }], modules: [], nextWeaponUid: 2,
    }, createDefaultProfile());
    assert.equal(crateShop.freeRerollsLeft, 1);
});

test('new-player onboarding guarantees a mergeable starter weapon in first Wave-1 shop', () => {
    const fresh = createDefaultProfile();
    assert.equal(isFirstTimePlayer(fresh), true);
    const shop = createIntermission({
        wave: 1, seed: 777, rigId: 'duty_standard', danger: 0, supply: 'none',
        parts: 60, level: 1, pendingLevelUps: 0, levelStats: {},
        weapons: [{ uid: 1, id: 'wrench', tier: 1 }], modules: [], nextWeaponUid: 2,
    }, fresh);
    assert.equal(shop.slots[0].kind, 'weapon');
    assert.equal(shop.slots[0].itemId, 'wrench');
    assert.equal(shop.slots[0].tier, 1);
    assert.ok(buyShopSlot(shop, 0, fresh).ok);
    assert.equal(shop.weapons.length, 2);
    assert.ok(mergeOwnedWeapons(shop, 0, 1), 'new player can merge two tier-1 wrenches into tier-2');
    assert.equal(shop.weapons[0].tier, 2);
    const done = markOnboardingDone(fresh);
    assert.equal(isFirstTimePlayer(done), false);
});

test('rewarded ad placements (boss rescue, level-up bonus, shop aid, double base credits, adFreePass) obey strict caps', async () => {
    let adShows = 0;
    const fakeAd = { show: async () => { adShows++; return true; }, cancel() {}, dispose() {} };
    const engage = createMiniGameEngage(fakeAd, {
        host: { tt: { getLaunchOptionsSync: () => ({ location: 'sidebar_card' }), shareAppMessage: () => {} } },
    });
    assert.equal(engage.isDouyinSidebarEntry, true);
    assert.equal(engage.canShare, true);
    assert.equal(await engage.requestReward('revive', { adFreePass: true }), true);
    assert.equal(adShows, 0, 'ad-free pass skips native video');
    assert.equal(await engage.requestReward('revive'), true);
    assert.equal(adShows, 1);

    // Boss wave in-place rescue keeps boss HP, restores 60% player HP, and clears bullets
    const session = new PatrolSession({ chapterId: '01', rigId: 'duty_standard', danger: 0, seed: 51, profile: createDefaultProfile() });
    session.waveIndex = 11;
    session.phase = 'battle';
    session.battle = new RogueliteBattle({
        chapter: CHAPTER_CATALOG[0], waveIndex: 11, seed: 51, danger: 0, rigId: 'duty_standard',
        level: 10, levelStats: {}, weapons: [{ uid: 1, id: 'wrench', tier: 3 }], modules: [], startHp: 80, carriedBagParts: 0,
    });
    const boss = session.battle.boss;
    assert.ok(boss);
    boss.hp = Math.round(boss.maxHp * 0.25);
    session.battle.bullets.push({ x: 100, y: 100, vx: 1, vy: 0, damage: 10, source: 'boss_bullet', boss: true });
    session.battle.player.hp = 0;
    session.stepBattle(0, 0);
    assert.equal(session.phase, 'lost');
    assert.equal(session.canRevive, true);
    assert.equal(session.isBossRevive, true);
    assert.equal(session.applyRevive(), true);
    assert.equal(session.phase, 'battle');
    assert.equal(session.battle.boss.hp, Math.round(boss.maxHp * 0.25), 'boss keeps damaged HP after in-place rescue');
    assert.equal(session.battle.bullets.length, 0, 'in-place rescue clears active bullets');
    assert.equal(session.battle.player.hp, Math.round(session.battle.player.maxHp * 0.6));
    // Second death in same run cannot revive again
    session.battle.player.hp = 0;
    session.stepBattle(0, 0);
    assert.equal(session.canRevive, false);

    // Level-up bonus pick (max 1/run) & shop emergency aid (max 2/run)
    const run = shopSession(createDefaultProfile(), 88);
    assert.equal(run.canUseLevelUpBonus, true);
    const beforePicks = run.shopView.pendingLevelUps;
    assert.equal(run.grantLevelUpBonus(), true);
    assert.equal(run.shopView.pendingLevelUps, beforePicks + 1);
    assert.equal(run.canUseLevelUpBonus, false);
    while (run.shopView.pendingLevelUps > 0) run.chooseLevelUp(0);
    const partsBefore = run.shopView.parts;
    assert.equal(run.grantShopAid(), true);
    assert.equal(run.grantShopAid(), true);
    assert.equal(run.grantShopAid(), false, 'shop emergency aid is capped at 2 per run');
    assert.equal(run.shopView.parts, partsBefore + SHOP_EMERGENCY_PARTS * 2);
});

test('sidebar navigation is offered only when the native action can be attempted', async () => {
    const supportsSidebar = ({ success }) => success({ isExist: true });
    const noNavigation = createMiniGameEngage(null, { host: { tt: { checkScene: supportsSidebar } } });
    assert.equal(noNavigation.canOpenSidebar, false);
    assert.equal(await noNavigation.openSidebar(), false);

    let opened = 0;
    const navigateToScene = ({ success }) => { opened++; success(); };
    const unsupported = createMiniGameEngage(null, {
        host: { tt: { checkScene: ({ success }) => success({ isExist: false }), navigateToScene } },
    });
    assert.equal(unsupported.canOpenSidebar, false);
    assert.equal(await unsupported.openSidebar(), false);
    assert.equal(opened, 0);

    const supported = createMiniGameEngage(null, { host: { tt: { checkScene: supportsSidebar, navigateToScene } } });
    assert.equal(supported.canOpenSidebar, true);
    assert.equal(await supported.openSidebar(), true);
    assert.equal(opened, 1);
});

test('daily check-in, daily urgent shift, harbor endless waves, and monotonic cloud merge work cleanly', () => {
    const day1 = '2026-11-26';
    const day2 = '2026-11-27';
    let p = createDefaultProfile();
    assert.equal(canClaimDailyCheckIn(p, day1), true);
    p = claimDailyCheckIn(p, day1);
    assert.equal(p.credits, DAILY_CHECKIN_CREDITS);
    assert.equal(freeSupplyChargesToday(p, day1), 1);
    assert.equal(claimDailyCheckIn(p, day1), null, 'cannot claim check-in twice same day');
    assert.equal(canClaimDailyCheckIn(p, day2), true, 'next day resets check-in');
    p = consumeFreeSupplyCharge(p, day1);
    assert.equal(freeSupplyChargesToday(p, day1), 0);

    // Daily double-credits ad cap = 3/day
    assert.equal(remainingDailyAdUses(p, 'double', day1), 3);
    for (let i = 0; i < 3; i++) p = consumeDailyAdUse(p, 'double', day1);
    assert.equal(remainingDailyAdUses(p, 'double', day1), 0);
    assert.equal(consumeDailyAdUse(p, 'double', day1), null);

    // Daily urgent shift awards +35 once per day and baseCreditsForDouble excludes first-clear & daily bonus
    const shift = getDailyShift(day1);
    const dailyRun = new PatrolSession({
        chapterId: shift.chapterId, rigId: shift.rigId, danger: shift.danger,
        dailyShiftKey: shift.dateKey, dailyMod: shift.modifier.id, seed: shift.seed, profile: p,
    });
    dailyRun.reports.push(...Array.from({ length: 12 }, (_, i) => ({
        wave: i + 1, stationName: '配电站', cleared: true, elapsedSeconds: 30, kills: 15, elitesKilled: 0,
        partsCollected: 15, partsBagged: 0, bagRedeemed: 0, xpGained: 15, damageTaken: 0, hitsTaken: 0,
        healed: 0, endHp: 60, maxHp: 60, defeatedBy: null, hitSources: {}, damageByWeapon: [], emptySeconds: 0,
    })));
    dailyRun.phase = 'won';
    const dailyRes = dailyRun.settle(p);
    assert.equal(dailyRes.creditsEarned, dailyRes.baseCreditsForDouble + dailyRes.firstClearBonus + DAILY_SHIFT_BONUS_CREDITS);
    assert.ok(dailyRes.unlocks.includes(`完成今日委托，额外获得 ${DAILY_SHIFT_BONUS_CREDITS} 凭证`));

    // Harbor endless mode generates Wave 13..15 (Boss at Wave 15) and updates bestEndlessWave
    const w15 = buildEndlessWaveDef(15);
    assert.equal(w15.wave, 15);
    assert.equal(w15.bossWave, true);
    const endlessRun = new PatrolSession({ chapterId: '04', rigId: 'duty_standard', danger: 0, endlessMode: true, seed: 15, profile: p });
    endlessRun.reports.push(...Array.from({ length: 14 }, (_, i) => ({
        wave: i + 1, stationName: '中央调度台', cleared: true, elapsedSeconds: 30, kills: 20, elitesKilled: 0,
        partsCollected: 20, partsBagged: 0, bagRedeemed: 0, xpGained: 20, damageTaken: 0, hitsTaken: 0,
        healed: 0, endHp: 60, maxHp: 60, defeatedBy: null, hitSources: {}, damageByWeapon: [], emptySeconds: 0,
    })));
    endlessRun.phase = 'lost';
    const afterEndless = endlessRun.applySettlementToProfile(p);
    assert.equal(afterEndless.bestEndlessWave, 14);

    // Monotonic cloud profile merge preserves highest clears, dangers, talents, and endless records from both devices
    const devA = { ...createDefaultProfile(), credits: 80, clearedChapters: ['01', '02'], maxDangerCleared: { '01': 3, '02': 1 }, talents: { chassis: 4 }, bestEndlessWave: 16 };
    const devB = { ...createDefaultProfile(), credits: 50, clearedChapters: ['01', '03'], maxDangerCleared: { '01': 1, '03': 4 }, talents: { chassis: 2, capacitor: 3 }, adFreePass: true, bestEndlessWave: 12 };
    const merged = mergeWorkshopProfiles(devA, devB);
    assert.deepEqual(merged.clearedChapters, ['01', '02', '03']);
    assert.equal(merged.maxDangerCleared['01'], 3);
    assert.equal(merged.maxDangerCleared['03'], 4);
    assert.equal(merged.talents.chassis, 4);
    assert.equal(merged.talents.capacitor, 3);
    assert.equal(merged.bestEndlessWave, 16);
    assert.equal(merged.adFreePass, true);
});

test('floating weapons keep even angular ring spacing and continuous swept melee contact', () => {
    for (const count of [2, 3, 4, 5, 6]) {
        const angles = Array.from({ length: count }, (_, slot) => {
            const { x, y } = weaponDock(slot, count);
            return Math.atan2(y - 20, x);
        }).sort((a, b) => a - b);
        const step = (2 * Math.PI) / count;
        for (let i = 0; i < count; i++) {
            const next = i + 1 < count ? angles[i + 1] : angles[0] + 2 * Math.PI;
            assert.ok(Math.abs(next - angles[i] - step) < 0.08, `ring spacing count=${count}`);
        }
    }
    const motion = createMeleeMotion('wrench', 0, weaponDock(0, 6), { x: 180, y: 353 }, 1, 0, 74, CAMPAIGN_FIELD, 50, true);
    assert.equal(motion.action, '大回扫');
    assert.ok(motion.points.length > motion.last);
    assert.ok(circleContact(-10, 0, 20, 0, 5), 'swept segment passing through origin hits target radius');
    assert.equal(circleContact(-10, 20, 20, 0, 5), undefined, 'parallel miss does not hit');
});

test('narrative progresses night clock, gives contextual defeat radios, and stays free of AI clichés', () => {
    const fresh = createDefaultProfile();
    assert.match(homeDispatchStatus(fresh).clockLine, /02:13/);
    assert.match(homeDispatchStatus({ ...fresh, clearedChapters: ['01'] }).clockLine, /02:38/);
    assert.match(homeDispatchStatus({ ...fresh, clearedChapters: ['01', '02'] }).clockLine, /03:05/);
    assert.match(homeDispatchStatus({ ...fresh, clearedChapters: ['01', '02', '03'] }).clockLine, /03:32/);
    assert.match(homeDispatchStatus({ ...fresh, clearedChapters: ['01', '02', '03', '04'] }).clockLine, /04:05/);

    const bossLoss1 = defeatRadioLine({ chapterId: '01', wavesCleared: 11, failedWave: 12, isBossWave: true, danger: 0 });
    const bossLoss2 = defeatRadioLine({ chapterId: '02', wavesCleared: 11, failedWave: 12, isBossWave: true, danger: 0 });
    const earlyLoss = defeatRadioLine({ chapterId: '01', wavesCleared: 1, failedWave: 2, isBossWave: false, danger: 0 });
    assert.notEqual(bossLoss1.line, bossLoss2.line);
    assert.notEqual(bossLoss1.line, earlyLoss.line);
    assert.equal(bossLoss2.speaker, '陈栖');

    for (const ch of CHAPTER_CATALOG) {
        assert.ok(shopStoryBeatHint(ch.id, 5));
        assert.ok(shopStoryBeatHint(ch.id, 12));
    }

    // De-AI-slop guard: reject common LLM clichés across all player-facing story & item texts
    const banned = /赋能|标志着|不仅.*而是|绝不屈服|宛如|仿佛|命运的|开启新篇章|前所未有|令人叹为观止/;
    const corpus = [
        ...Object.values(RIG_FLAVOR),
        ...MODULE_CATALOG.map(m => `${m.name} ${m.flavor}`),
        ...Object.values(WEAPON_CATALOG).map(w => `${w.name} ${w.roleText}`),
        ...Object.values(CHAPTER_NARRATIVES).flatMap(n => [
            n.opener.line, n.midTurn.line, n.bossIntro.line, n.clearOutro.line,
            n.epilogueHook?.line ?? '', n.archiveNote, n.secretNote,
        ]),
    ];
    for (const text of corpus) {
        assert.equal(banned.test(text), false, `AI cliché found in: ${text}`);
    }
});
