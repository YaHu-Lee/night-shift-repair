import { CHAPTER_CATALOG, RIG_CATALOG, WORKSHOP_TALENTS, getChapter } from './catalog';
import {
    DAILY_SHIFT_BONUS_CREDITS,
    MAX_RUN_LEVELUP_ADS,
    MAX_RUN_REVIVES,
    MAX_RUN_SHOP_ADS,
    buildEndlessWaveDef,
    dailyForDate,
    isDailyShiftClearedToday,
} from './engagement';
import { DANGER_MULTIPLIERS, resolveBuild, workshopTalentCost, xpRequiredForLevel } from './formulas';
import { CHAPTER_NARRATIVES, defeatRadioLine } from './narrative';
import {
    CHAPTER_CLEAR_BONUS,
    PRE_RUN_SUPPLIES,
    STARTER_RIGS,
    computeRunUnlocks,
    rigRank,
    unlockedMods,
    MILESTONES,
    legalStarterWeaponsForRig,
    totalBanSlots,
    unclaimedFirstClearBonus,
    unlockedRigsForProfile,
} from './progression';
import { RogueliteBattle } from './battle';
import {
    buyShopSlot,
    createIntermission,
    grantShopEmergencyAid,
    mergeOwnedWeapons,
    pickLevelUp,
    rerollLevelUp,
    rerollShop,
    orderRecoveredWeapon,
    sellOwnedWeapon,
    shopViewModel,
    toggleLockSlot,
} from './shop';
import type { IntermissionState, ShopViewModel } from './shop';
import type {
    BattleWaveSummary,
    ChapterDefinition,
    DailyShiftModifierId,
    DangerLevel,
    PreRunSupplyId,
    RigId,
    ShopSlot,
    StatDelta,
    ToolId,
    WaveDefinition,
    WeaponDamageStat,
    WeaponInstance,
    WorkshopProfile,
    WorkshopTalentSpec,
} from './types';
import type { PatrolSnapshot } from './persistence';

export function createPatrolId(): string {
    return globalThis.crypto?.randomUUID?.()
        ?? [Date.now(), Math.random(), Math.random()].map(value => value.toString(36)).join('-');
}

export function createDefaultProfile(): WorkshopProfile {
    return {
        schemaVersion: 3,
        credits: 0,
        clearedChapters: [],
        maxDangerCleared: {},
        unlockedRigs: [...STARTER_RIGS],
        talents: {},
        bannedModules: [],
    };
}

export function buyWorkshopTalent(profile: WorkshopProfile, talentId: WorkshopTalentSpec['id']): WorkshopProfile | null {
    const spec = WORKSHOP_TALENTS.find(t => t.id === talentId);
    if (!spec) return null;
    const rank = profile.talents[talentId] ?? 0;
    if (rank >= spec.maxRank) return null;
    const cost = workshopTalentCost(spec, rank);
    if (profile.credits < cost) return null;
    return {
        ...profile,
        credits: profile.credits - cost,
        talents: { ...profile.talents, [talentId]: rank + 1 },
    };
}

export function toggleModuleBan(profile: WorkshopProfile, moduleId: string): WorkshopProfile | null {
    const limit = totalBanSlots(profile);
    if (profile.bannedModules.includes(moduleId)) {
        return { ...profile, bannedModules: profile.bannedModules.filter(id => id !== moduleId) };
    }
    if (profile.bannedModules.length >= limit) return null;
    return { ...profile, bannedModules: [...profile.bannedModules, moduleId] };
}

export function buyPreRunSupply(profile: WorkshopProfile, supply: PreRunSupplyId): WorkshopProfile | null {
    const spec = PRE_RUN_SUPPLIES[supply];
    if (!spec || spec.cost <= 0) return profile;
    if (profile.credits < spec.cost) return null;
    return { ...profile, credits: profile.credits - spec.cost };
}

export interface PatrolResult {
    readonly chapterId: ChapterDefinition['id'];
    readonly chapterTitle: string;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly won: boolean;
    readonly failure?: 'hp' | 'timeout';
    readonly wavesCleared: number;
    readonly totalKills: number;
    readonly creditsEarned: number;
    readonly baseCreditsForDouble: number;
    readonly firstClearBonus: number;
    readonly firstClearMilestones: readonly import('./progression').Milestone[];
    readonly unlocks: readonly string[];
    readonly endlessMode?: boolean;
    readonly dailyShiftKey?: string;
    readonly totalDurationSeconds: number;
    readonly damageByWeapon: readonly WeaponDamageStat[];
    readonly outroRadio: { readonly speaker: string; readonly line: string };
    readonly epilogueHook?: { readonly speaker: string; readonly line: string };
}

export class PatrolSession {
    readonly chapter: ChapterDefinition;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly supply: PreRunSupplyId;
    readonly starterWeapon: ToolId;
    readonly rigRank: import('./types').Tier;
    readonly weaponMods: NonNullable<WorkshopProfile['weaponMods']>;
    readonly dailyShiftKey?: string;
    readonly dailyMod?: DailyShiftModifierId;
    readonly endlessMode: boolean;
    readonly trialRig: boolean;
    readonly seed: number;
    readonly runId: string;
    readonly profile: WorkshopProfile;

    phase: 'battle' | 'shop' | 'won' | 'lost' = 'battle';
    waveIndex = 0; // 0..11 (or higher in endless mode)
    parts = 0;
    bagParts = 0;
    xp = 0;
    level = 0;
    currentHp: number;
    levelStats: StatDelta = {};
    weapons: WeaponInstance[];
    modules: string[] = [];
    carriedLocks: ShopSlot[] = [];
    nextWeaponUid = 2;
    revivesUsed = 0;
    levelUpAdUsed = false;
    shopAdUsed = 0;

    battle: RogueliteBattle | null = null;
    intermission: IntermissionState | null = null;
    readonly reports: BattleWaveSummary[] = [];
    private defeatedBattle: RogueliteBattle | null = null;
    private elapsed = 0;

    constructor(params: {
        readonly chapterId: ChapterDefinition['id'];
        readonly rigId: RigId;
        readonly danger?: DangerLevel;
        readonly supply?: PreRunSupplyId;
        readonly starterWeapon?: ToolId;
        readonly dailyShiftKey?: string;
        readonly dailyMod?: DailyShiftModifierId;
        readonly endlessMode?: boolean;
        readonly trialRig?: boolean;
        readonly rigRank?: import('./types').Tier;
        readonly weaponMods?: WorkshopProfile['weaponMods'];
        readonly seed: number;
        readonly profile?: WorkshopProfile;
        readonly runId?: string;
    }, skipStart = false) {
        this.chapter = getChapter(params.chapterId);
        this.rigId = params.rigId;
        this.danger = params.danger ?? 0;
        this.supply = params.supply ?? 'none';
        this.dailyShiftKey = params.dailyShiftKey;
        this.dailyMod = params.dailyMod;
        this.endlessMode = params.endlessMode === true;
        this.trialRig = params.trialRig === true;
        this.seed = params.seed >>> 0;
        this.runId = params.runId ?? createPatrolId();
        this.profile = params.profile ?? createDefaultProfile();
        this.rigRank = params.rigRank ?? (this.dailyShiftKey || this.trialRig ? 1 : rigRank(this.profile, this.rigId) || 1);
        const chosen = params.weaponMods ?? this.profile.weaponMods ?? {};
        this.weaponMods = Object.fromEntries(Object.entries(chosen).filter(([tool, mod]) =>
            unlockedMods(this.profile, tool as ToolId).includes(mod!)));
        const rig = RIG_CATALOG[params.rigId];
        const legalStarters = legalStarterWeaponsForRig(params.rigId, this.profile);
        this.starterWeapon = params.starterWeapon && legalStarters.includes(params.starterWeapon)
            ? params.starterWeapon
            : rig.starterWeapon;
        this.weapons = [{ uid: 1, id: this.starterWeapon, tier: 1 }];
        if (!skipStart) {
            if (this.supply === 'spare_parts') this.parts += 35;
            if (this.dailyMod === 'cold_supply') this.parts += 40;
        }
        const initialBuild = resolveBuild(this.rigId, 0, {}, this.weapons, [], this.profile, this.danger, this.supply, this.dailyMod);
        this.currentHp = initialBuild.stats.maxHp;
        if (!skipStart) this.startWaveBattle();
    }

    static fromSnapshot(snap: PatrolSnapshot, profile: WorkshopProfile): PatrolSession {
        const session = new PatrolSession({
            chapterId: snap.chapterId,
            rigId: snap.rigId,
            rigRank: snap.rigRank,
            weaponMods: snap.weaponMods,
            danger: snap.danger,
            supply: snap.supply ?? 'none',
            starterWeapon: snap.starterWeapon,
            dailyShiftKey: snap.dailyShiftKey,
            dailyMod: snap.dailyMod,
            endlessMode: snap.endlessMode === true,
            trialRig: snap.trialRig === true,
            seed: snap.seed,
            runId: snap.runId ?? ['v3', snap.chapterId, snap.rigId, snap.seed].join('-'),
            profile,
        }, true);
        session.phase = snap.phase;
        session.waveIndex = snap.waveIndex;
        session.parts = snap.parts;
        session.bagParts = snap.bagParts;
        session.xp = snap.xp;
        session.level = snap.level;
        session.currentHp = snap.currentHp;
        session.levelStats = { ...snap.levelStats };
        session.weapons = snap.weapons.map(w => ({ ...w }));
        session.modules = [...snap.modules];
        session.carriedLocks = snap.carriedLocks.map(s => ({ ...s }));
        session.nextWeaponUid = snap.version === 3
            ? Math.max(snap.nextWeaponUid, ...session.weapons.map(weapon => weapon.uid + 1))
            : snap.nextWeaponUid;
        session.revivesUsed = snap.revivesUsed ?? 0;
        session.levelUpAdUsed = snap.levelUpAdUsed === true;
        session.shopAdUsed = snap.shopAdUsed ?? 0;
        session.reports.push(...snap.reports);
        if (snap.phase === 'battle') {
            session.startWaveBattle();
        } else if (snap.phase === 'shop') {
            session.intermission = createIntermission({
                wave: snap.waveIndex + 1,
                seed: snap.seed,
                rigId: snap.rigId,
                danger: snap.danger,
                supply: snap.supply ?? 'none',
                dailyMod: snap.dailyMod,
                parts: snap.parts,
                level: snap.level,
                pendingLevelUps: snap.pendingLevelUps,
                levelStats: snap.levelStats,
                weapons: snap.weapons,
                modules: snap.modules,
                carryLockedSlots: snap.carriedLocks,
                nextWeaponUid: session.nextWeaponUid,
            }, profile, snap.version === 4 ? snap.shop : undefined);
        }
        return session;
    }

    snapshot(): PatrolSnapshot {
        const shop = this.intermission;
        const defaultStarter = RIG_CATALOG[this.rigId].starterWeapon;
        return {
            version: 4,
            runId: this.runId,
            rigRank: this.rigRank,
            weaponMods: this.weaponMods,
            ...(shop ? { shop: {
                slots: shop.slots.map(slot => ({ ...slot })),
                levelUpOptions: shop.levelUpOptions.map(option => ({ ...option })),
                levelUpRerolls: shop.levelUpRerolls, paidRerolls: shop.paidRerolls,
                freeRerollsLeft: shop.freeRerollsLeft, buyoutBonusUsed: shop.buyoutBonusUsed,
                rollSerial: shop.rollSerial, recoveryOrder: shop.recoveryOrder, recoveryLock: shop.recoveryLock,
            } } : {}),
            chapterId: this.chapter.id,
            rigId: this.rigId,
            danger: this.danger,
            ...(this.supply !== 'none' ? { supply: this.supply } : {}),
            ...(this.starterWeapon !== defaultStarter ? { starterWeapon: this.starterWeapon } : {}),
            ...(this.dailyShiftKey ? { dailyShiftKey: this.dailyShiftKey } : {}),
            ...(this.dailyMod ? { dailyMod: this.dailyMod } : {}),
            ...(this.endlessMode ? { endlessMode: true } : {}),
            ...(this.trialRig ? { trialRig: true } : {}),
            ...(this.revivesUsed > 0 ? { revivesUsed: this.revivesUsed } : {}),
            ...(this.levelUpAdUsed ? { levelUpAdUsed: true } : {}),
            ...(this.shopAdUsed > 0 ? { shopAdUsed: this.shopAdUsed } : {}),
            seed: this.seed,
            phase: this.phase,
            waveIndex: this.waveIndex,
            parts: shop ? shop.parts : this.parts,
            bagParts: this.bagParts,
            xp: this.xp,
            level: this.level,
            pendingLevelUps: shop ? shop.pendingLevelUps : 0,
            currentHp: this.currentHp,
            levelStats: shop ? { ...shop.levelStats } : { ...this.levelStats },
            weapons: (shop ? shop.weapons : this.weapons).map(w => ({ ...w })),
            modules: shop ? [...shop.modules] : [...this.modules],
            carriedLocks: shop ? shop.slots.filter(s => s.locked && !s.sold).map(s => ({ ...s })) : this.carriedLocks.map(s => ({ ...s })),
            nextWeaponUid: shop ? shop.nextWeaponUid : this.nextWeaponUid,
            reports: [...this.reports],
        };
    }

    get currentWaveDef(): WaveDefinition {
        if (this.endlessMode && this.waveIndex >= this.chapter.waves.length) {
            return buildEndlessWaveDef(this.waveIndex + 1);
        }
        return this.chapter.waves[Math.min(this.waveIndex, this.chapter.waves.length - 1)];
    }

    get canRevive(): boolean {
        return this.phase === 'lost' && this.revivesUsed < MAX_RUN_REVIVES;
    }

    get isBossRevive(): boolean {
        return this.currentWaveDef.bossWave === true && !!this.defeatedBattle;
    }

    applyRevive(): boolean {
        if (!this.canRevive) return false;
        this.revivesUsed++;
        if (this.reports.length && !this.reports[this.reports.length - 1].cleared) {
            this.reports.pop();
        }
        if (this.currentWaveDef.bossWave && this.defeatedBattle) {
            this.defeatedBattle.reviveInPlace();
            this.battle = this.defeatedBattle;
            this.defeatedBattle = null;
            this.currentHp = this.battle.player.hp;
            this.phase = 'battle';
            return true;
        }
        this.defeatedBattle = null;
        const build = resolveBuild(this.rigId, this.level, this.levelStats, this.weapons, this.modules, this.profile, this.danger, this.supply, this.dailyMod);
        this.currentHp = build.stats.maxHp;
        this.startWaveBattle();
        return true;
    }

    get canUseLevelUpBonus(): boolean {
        return this.phase === 'shop'
            && !!this.intermission
            && this.intermission.pendingLevelUps > 0
            && !this.levelUpAdUsed
            && MAX_RUN_LEVELUP_ADS > 0;
    }

    grantLevelUpBonus(): boolean {
        if (!this.canUseLevelUpBonus || !this.intermission) return false;
        this.levelUpAdUsed = true;
        this.intermission.pendingLevelUps++;
        return true;
    }

    get shopAidRemaining(): number {
        return Math.max(0, MAX_RUN_SHOP_ADS - this.shopAdUsed);
    }

    grantShopAid(): boolean {
        if (this.phase !== 'shop' || !this.intermission || this.intermission.pendingLevelUps > 0) return false;
        if (this.shopAidRemaining <= 0) return false;
        this.shopAdUsed++;
        grantShopEmergencyAid(this.intermission);
        this.parts = this.intermission.parts;
        return true;
    }

    get frameFraction(): number {
        return Math.max(0, this.elapsed * 30);
    }

    advance(dt: number, inputX = 0, inputY = 0): boolean {
        if (this.phase !== 'battle' || !this.battle || !Number.isFinite(dt) || dt <= 0) return false;
        const step = 1 / 30;
        this.elapsed = Math.min(this.elapsed + dt, step * 3);
        let completed = false;
        while (this.elapsed + 1e-9 >= step && this.phase === 'battle' && this.battle) {
            this.elapsed -= step;
            this.stepBattle(inputX, inputY);
            if (this.phase !== 'battle') { completed = true; this.elapsed = 0; break; }
        }
        return completed;
    }

    private startWaveBattle(): void {
        this.phase = 'battle';
        this.intermission = null;
        this.defeatedBattle = null;
        const waveDef = this.currentWaveDef;
        this.battle = new RogueliteBattle({
            chapter: this.chapter,
            waveIndex: Math.min(this.waveIndex, this.chapter.waves.length - 1),
            waveDefOverride: waveDef,
            rigRank: this.rigRank,
            weaponMods: this.weaponMods,
            seed: this.seed,
            danger: this.danger,
            rigId: this.rigId,
            level: this.level,
            levelStats: this.levelStats,
            weapons: this.weapons,
            modules: this.modules,
            startHp: this.currentHp,
            carriedBagParts: this.bagParts,
            supply: this.supply,
            dailyMod: this.dailyMod,
            profile: this.profile,
        });
    }

    stepBattle(inputX = 0, inputY = 0): void {
        if (this.phase !== 'battle' || !this.battle) return;
        this.battle.step(inputX, inputY);
        if (this.battle.finished) this.completeWave();
    }

    private completeWave(): void {
        const battle = this.battle!;
        const report = battle.summary();
        this.reports.push(report);
        this.battle = null;

        if (!report.cleared) {
            this.defeatedBattle = battle;
            this.currentHp = 0;
            this.phase = 'lost';
            return;
        }
        this.defeatedBattle = null;

        // Between-wave recovery: 30% normally, 18% under D1+ Cold Shift or Daily Cold Supply, +10% with Hot Thermos
        const coldShift = this.danger >= 1 || this.dailyMod === 'cold_supply';
        const recoveryRate = (coldShift ? 0.18 : 0.30) + (this.supply === 'hot_thermos' ? 0.10 : 0);
        const missing = report.maxHp - report.endHp;
        this.currentHp = Math.min(report.maxHp, report.endHp + Math.round(missing * recoveryRate));

        // Economy: wave kills + retained bag redemption + Salvage compounding bonus
        const build = resolveBuild(this.rigId, this.level, this.levelStats, this.weapons, this.modules, this.profile, this.danger, this.supply, this.dailyMod);
        const salvageBonus = Math.max(0, Math.round(build.stats.salvage * (1 + 0.05 * this.waveIndex) + 6 + this.waveIndex * 2));
        this.parts += report.partsCollected + salvageBonus;
        this.bagParts = report.partsBagged;

        // XP & level-ups (each level also grants +4 max HP in resolveBuild)
        this.xp += report.xpGained;
        let gainedLevels = 0;
        while (this.xp >= xpRequiredForLevel(this.level + 1)) {
            this.xp -= xpRequiredForLevel(this.level + 1);
            this.level++;
            gainedLevels++;
            this.currentHp += 4;
        }

        if (!this.endlessMode && this.waveIndex >= this.chapter.waves.length - 1) {
            this.phase = 'won';
            return;
        }

        this.phase = 'shop';
        this.intermission = createIntermission({
            wave: this.waveIndex + 1,
            seed: this.seed,
            rigId: this.rigId,
            danger: this.danger,
            supply: this.supply,
            dailyMod: this.dailyMod,
            parts: this.parts,
            level: this.level,
            pendingLevelUps: gainedLevels,
            recoveryRank: this.rigId === 'scrap_auditor' && report.partsCollected - report.bagRedeemed >= 20 ? this.rigRank : undefined,
            levelStats: this.levelStats,
            weapons: this.weapons,
            modules: this.modules,
            carryLockedSlots: this.carriedLocks,
            nextWeaponUid: this.nextWeaponUid,
        }, this.profile);
        this.carriedLocks = [];
    }

    get shopView(): ShopViewModel | null {
        return this.intermission ? shopViewModel(this.intermission, this.profile) : null;
    }

    chooseLevelUp(index: number): boolean {
        return !!this.intermission && pickLevelUp(this.intermission, index, this.profile);
    }

    rerollLevelUpOptions(): boolean {
        return !!this.intermission && rerollLevelUp(this.intermission, this.profile);
    }

    buySlot(slotIndex: number) {
        if (!this.intermission) return { ok: false, reason: '当前无法购买，请先进入商店。' };
        return buyShopSlot(this.intermission, slotIndex, this.profile);
    }

    orderWeapon(uid: number): boolean {
        return !!this.intermission && orderRecoveredWeapon(this.intermission, uid, this.profile);
    }

    toggleLock(slotIndex: number): boolean {
        return !!this.intermission && toggleLockSlot(this.intermission, slotIndex, this.profile);
    }

    reroll(): boolean {
        return !!this.intermission && rerollShop(this.intermission, this.profile);
    }

    mergeWeapons(slotA: number, slotB: number): boolean {
        return !!this.intermission && mergeOwnedWeapons(this.intermission, slotA, slotB);
    }

    sellWeapon(slotIndex: number): number {
        return this.intermission ? sellOwnedWeapon(this.intermission, slotIndex, this.profile) : 0;
    }

    startNextWave(): boolean {
        if (this.phase !== 'shop' || !this.intermission || this.intermission.pendingLevelUps > 0) return false;
        const shop = this.intermission;
        this.parts = shop.parts;
        this.levelStats = { ...shop.levelStats };
        this.weapons = shop.weapons.map(w => ({ ...w }));
        this.modules = [...shop.modules];
        this.nextWeaponUid = shop.nextWeaponUid;
        this.carriedLocks = shop.slots.filter(s => s.locked && !s.sold).map(s => ({ ...s }));

        // Clamp currentHp to new maxHp (if maxHp increased, grant the gained HP headroom)
        const nextBuild = resolveBuild(this.rigId, this.level, this.levelStats, this.weapons, this.modules, this.profile, this.danger, this.supply, this.dailyMod);
        this.currentHp = Math.min(nextBuild.stats.maxHp, Math.max(1, this.currentHp));

        this.waveIndex++;
        this.startWaveBattle();
        return true;
    }

    private projectPostRunProfile(profile: WorkshopProfile, won: boolean, wavesCleared: number): WorkshopProfile {
        let next: WorkshopProfile = profile;
        if (won || wavesCleared >= 2) {
            if (!next.onboardingDone) next = { ...next, onboardingDone: true };
        }
        if (this.endlessMode && wavesCleared > (next.bestEndlessWave ?? 0)) {
            next = { ...next, bestEndlessWave: wavesCleared };
        }
        if (!won) return next;
        const cleared = !next.clearedChapters.includes(this.chapter.id)
            ? [...next.clearedChapters, this.chapter.id]
            : next.clearedChapters;
        const prevDanger = next.maxDangerCleared[this.chapter.id];
        const maxDangerCleared = prevDanger === undefined || this.danger > prevDanger
            ? { ...next.maxDangerCleared, [this.chapter.id]: this.danger }
            : next.maxDangerCleared;
        const prevRigDanger = next.maxDangerByRig?.[this.rigId];
        const maxDangerByRig = prevRigDanger === undefined || this.danger > prevRigDanger
            ? { ...(next.maxDangerByRig ?? {}), [this.rigId]: this.danger }
            : next.maxDangerByRig;
        const unlockedRigs = unlockedRigsForProfile({ clearedChapters: cleared, unlockedRigs: next.unlockedRigs });
        let daily = next.daily;
        if (this.dailyShiftKey && !isDailyShiftClearedToday(next, this.dailyShiftKey)) {
            daily = { ...dailyForDate(next, this.dailyShiftKey), dailyShiftCleared: true };
        }
        return {
            ...next,
            clearedChapters: cleared,
            maxDangerCleared,
            ...(maxDangerByRig ? { maxDangerByRig } : {}),
            unlockedRigs,
            ...(daily ? { daily } : {}),
        };
    }

    settle(targetProfile: WorkshopProfile = this.profile): PatrolResult {
        const won = this.phase === 'won';
        const wavesCleared = this.reports.filter(r => r.cleared).length;
        const totalKills = this.reports.reduce((s, r) => s + r.kills, 0);
        const totalDurationSeconds = this.reports.reduce((s, r) => s + r.elapsedSeconds, 0);
        const chapterBonus = won ? CHAPTER_CLEAR_BONUS[this.chapter.id] : (this.endlessMode && wavesCleared >= 12 ? CHAPTER_CLEAR_BONUS['04'] : 0);
        const dangerBonus = won ? DANGER_MULTIPLIERS[this.danger].creditBonus : 0;
        const baseCreditsForDouble = wavesCleared * 2 + chapterBonus + dangerBonus;
        const firstClearBonus = won && !this.endlessMode ? unclaimedFirstClearBonus(targetProfile, this.chapter.id, this.danger) : 0;
        const dailyBonus = won && this.dailyShiftKey && !isDailyShiftClearedToday(targetProfile, this.dailyShiftKey)
            ? DAILY_SHIFT_BONUS_CREDITS
            : 0;
        const creditsEarned = baseCreditsForDouble + firstClearBonus + dailyBonus;

        const nextProfile = this.projectPostRunProfile(targetProfile, won, wavesCleared);
        const unlocks = won && !this.endlessMode ? computeRunUnlocks(targetProfile, nextProfile, this.chapter.id, this.danger) : [];
        if (dailyBonus > 0) unlocks.unshift(`完成今日委托，额外获得 ${dailyBonus} 凭证`);
        if (this.endlessMode && wavesCleared > (targetProfile.bestEndlessWave ?? 0)) {
            unlocks.unshift(`港区新纪录：完成 ${wavesCleared} 波`);
        }

        const totals = new Map<string, { id: ToolId; tier: WeaponDamageStat['tier']; dmg: number; kills: number; crits: number }>();
        for (const r of this.reports) {
            for (const w of r.damageByWeapon) {
                const key = `${w.slot}:${w.id}`;
                const prev = totals.get(key);
                if (prev) {
                    prev.tier = Math.max(prev.tier, w.tier) as WeaponDamageStat['tier'];
                    prev.dmg += w.totalDamage;
                    prev.kills += w.kills;
                    prev.crits += w.crits;
                } else {
                    totals.set(key, { id: w.id, tier: w.tier, dmg: w.totalDamage, kills: w.kills, crits: w.crits });
                }
            }
        }
        const damageByWeapon: WeaponDamageStat[] = Array.from(totals.entries()).map(([key, v]) => ({
            slot: Number(key.split(':')[0]),
            id: v.id,
            tier: v.tier,
            totalDamage: v.dmg,
            kills: v.kills,
            crits: v.crits,
        })).sort((a, b) => b.totalDamage - a.totalDamage);

        const narrative = CHAPTER_NARRATIVES[this.chapter.id];
        const endlessRadio = {
            speaker: '港区老马',
            line: wavesCleared >= 15
                ? `你撑过了 ${wavesCleared} 波啊！那几台龙门吊总算安静下来了。谢了，小周。`
                : `小周，先回来歇会儿。等你准备好了，咱们再去码头。`,
        };
        const failedReport = this.reports.length ? this.reports[this.reports.length - 1] : undefined;
        const failedWave = failedReport?.wave ?? (this.waveIndex + 1);
        const failRadio = defeatRadioLine({
            chapterId: this.chapter.id,
            wavesCleared,
            failedWave,
            isBossWave: failedWave === 12 || this.currentWaveDef.bossWave === true,
            danger: this.danger,
        });
        return {
            chapterId: this.chapter.id,
            chapterTitle: this.endlessMode ? '港区无尽' : this.chapter.title,
            rigId: this.rigId,
            danger: this.danger,
            won,
            ...(!won && failedReport && !failedReport.cleared
                ? { failure: failedReport.endHp > 0 ? 'timeout' : 'hp' } as const : {}),
            wavesCleared,
            totalKills,
            creditsEarned,
            baseCreditsForDouble,
            firstClearBonus,
            firstClearMilestones: firstClearBonus ? MILESTONES[this.chapter.id].slice((targetProfile.maxDangerCleared[this.chapter.id] ?? -1) + 1, this.danger + 1) : [],
            unlocks,
            ...(this.endlessMode ? { endlessMode: true } : {}),
            ...(this.dailyShiftKey ? { dailyShiftKey: this.dailyShiftKey } : {}),
            totalDurationSeconds,
            damageByWeapon,
            outroRadio: this.endlessMode
                ? endlessRadio
                : won ? narrative.clearOutro : failRadio,
            ...(!this.endlessMode && won && narrative.epilogueHook ? { epilogueHook: narrative.epilogueHook } : {}),
        };
    }

    applySettlementToProfile(profile: WorkshopProfile): WorkshopProfile {
        const result = this.settle(profile);
        const next = this.projectPostRunProfile(profile, result.won, result.wavesCleared);
        return {
            ...next,
            credits: profile.credits + result.creditsEarned,
        };
    }
}

export { CHAPTER_CATALOG };
