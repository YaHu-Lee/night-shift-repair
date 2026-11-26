import type { ToolId } from '../m1/content';
import { CHAPTER_CATALOG, RIG_CATALOG, WORKSHOP_TALENTS, getChapter } from './catalog';
import { DANGER_MULTIPLIERS, resolveBuild, workshopTalentCost, xpRequiredForLevel } from './formulas';
import { CHAPTER_NARRATIVES } from './narrative';
import { RogueliteBattle } from './battle';
import {
    buyShopSlot,
    createIntermission,
    mergeOwnedWeapons,
    pickLevelUp,
    rerollLevelUp,
    rerollShop,
    sellOwnedWeapon,
    shopViewModel,
    toggleLockSlot,
} from './shop';
import type { IntermissionState, ShopViewModel } from './shop';
import type {
    BattleWaveSummary,
    ChapterDefinition,
    DangerLevel,
    RigId,
    ShopSlot,
    StatDelta,
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
        unlockedRigs: ['duty_standard', 'high_voltage', 'heavy_fitter', 'thermal_welder', 'scrap_auditor'],
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
    const limit = (profile.talents.ban_permit ?? 0) * 2;
    if (profile.bannedModules.includes(moduleId)) {
        return { ...profile, bannedModules: profile.bannedModules.filter(id => id !== moduleId) };
    }
    if (profile.bannedModules.length >= limit) return null;
    return { ...profile, bannedModules: [...profile.bannedModules, moduleId] };
}

export interface PatrolResult {
    readonly chapterId: ChapterDefinition['id'];
    readonly chapterTitle: string;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly won: boolean;
    readonly wavesCleared: number;
    readonly totalKills: number;
    readonly creditsEarned: number;
    readonly totalDurationSeconds: number;
    readonly damageByWeapon: readonly WeaponDamageStat[];
    readonly outroRadio: { readonly speaker: string; readonly line: string };
    readonly epilogueHook?: { readonly speaker: string; readonly line: string };
}

export class PatrolSession {
    readonly chapter: ChapterDefinition;
    readonly rigId: RigId;
    readonly danger: DangerLevel;
    readonly seed: number;
    readonly runId: string;
    readonly profile: WorkshopProfile;

    phase: 'battle' | 'shop' | 'won' | 'lost' = 'battle';
    waveIndex = 0; // 0..11
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

    battle: RogueliteBattle | null = null;
    intermission: IntermissionState | null = null;
    readonly reports: BattleWaveSummary[] = [];
    private elapsed = 0;

    constructor(params: {
        readonly chapterId: ChapterDefinition['id'];
        readonly rigId: RigId;
        readonly danger?: DangerLevel;
        readonly seed: number;
        readonly profile?: WorkshopProfile;
        readonly runId?: string;
    }, skipStart = false) {
        this.chapter = getChapter(params.chapterId);
        this.rigId = params.rigId;
        this.danger = params.danger ?? 0;
        this.seed = params.seed >>> 0;
        this.runId = params.runId ?? createPatrolId();
        this.profile = params.profile ?? createDefaultProfile();
        const rig = RIG_CATALOG[params.rigId];
        this.weapons = [{ uid: 1, id: rig.starterWeapon, tier: 1 }];
        const initialBuild = resolveBuild(this.rigId, 0, {}, this.weapons, [], this.profile);
        this.currentHp = initialBuild.stats.maxHp;
        if (!skipStart) this.startWaveBattle();
    }

    static fromSnapshot(snap: PatrolSnapshot, profile: WorkshopProfile): PatrolSession {
        const session = new PatrolSession({
            chapterId: snap.chapterId,
            rigId: snap.rigId,
            danger: snap.danger,
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
        session.reports.push(...snap.reports);
        if (snap.phase === 'battle') {
            session.startWaveBattle();
        } else if (snap.phase === 'shop') {
            session.intermission = createIntermission({
                wave: snap.waveIndex + 1,
                seed: snap.seed,
                rigId: snap.rigId,
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
        return {
            version: 4,
            runId: this.runId,
            ...(shop ? { shop: {
                slots: shop.slots.map(slot => ({ ...slot })),
                levelUpOptions: shop.levelUpOptions.map(option => ({ ...option })),
                levelUpRerolls: shop.levelUpRerolls, paidRerolls: shop.paidRerolls,
                freeRerollsLeft: shop.freeRerollsLeft, buyoutBonusUsed: shop.buyoutBonusUsed,
                rollSerial: shop.rollSerial,
            } } : {}),
            chapterId: this.chapter.id,
            rigId: this.rigId,
            danger: this.danger,
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
        this.battle = new RogueliteBattle({
            chapter: this.chapter,
            waveIndex: this.waveIndex,
            seed: this.seed,
            danger: this.danger,
            rigId: this.rigId,
            level: this.level,
            levelStats: this.levelStats,
            weapons: this.weapons,
            modules: this.modules,
            startHp: this.currentHp,
            carriedBagParts: this.bagParts,
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
            this.currentHp = 0;
            this.phase = 'lost';
            return;
        }

        // Between-wave recovery: recover only 30% of missing HP (keeping HP a genuine resource!)
        const missing = report.maxHp - report.endHp;
        this.currentHp = Math.min(report.maxHp, report.endHp + Math.round(missing * 0.30));

        // Economy: wave kills + retained bag redemption + Salvage compounding bonus
        const build = resolveBuild(this.rigId, this.level, this.levelStats, this.weapons, this.modules, this.profile);
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

        if (this.waveIndex >= this.chapter.waves.length - 1) {
            this.phase = 'won';
            return;
        }

        this.phase = 'shop';
        this.intermission = createIntermission({
            wave: this.waveIndex + 1,
            seed: this.seed,
            rigId: this.rigId,
            parts: this.parts,
            level: this.level,
            pendingLevelUps: gainedLevels,
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
        if (!this.intermission) return { ok: false, reason: '当前不在整备台' };
        return buyShopSlot(this.intermission, slotIndex, this.profile);
    }

    toggleLock(slotIndex: number): boolean {
        return !!this.intermission && toggleLockSlot(this.intermission, slotIndex, this.profile);
    }

    reroll(): boolean {
        return !!this.intermission && rerollShop(this.intermission, this.profile);
    }

    mergeWeapons(a: number, b: number): boolean {
        return !!this.intermission && mergeOwnedWeapons(this.intermission, a, b);
    }

    sellWeapon(slot: number): number {
        return this.intermission ? sellOwnedWeapon(this.intermission, slot, this.profile) : 0;
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
        const nextBuild = resolveBuild(this.rigId, this.level, this.levelStats, this.weapons, this.modules, this.profile);
        this.currentHp = Math.min(nextBuild.stats.maxHp, Math.max(1, this.currentHp));

        this.waveIndex++;
        this.startWaveBattle();
        return true;
    }

    settle(): PatrolResult {
        const won = this.phase === 'won';
        const wavesCleared = this.reports.filter(r => r.cleared).length;
        const totalKills = this.reports.reduce((s, r) => s + r.kills, 0);
        const totalDurationSeconds = this.reports.reduce((s, r) => s + r.elapsedSeconds, 0);
        const creditsEarned = wavesCleared * 2 + (won ? 8 + DANGER_MULTIPLIERS[this.danger].creditBonus : 0);

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
        return {
            chapterId: this.chapter.id,
            chapterTitle: this.chapter.title,
            rigId: this.rigId,
            danger: this.danger,
            won,
            wavesCleared,
            totalKills,
            creditsEarned,
            totalDurationSeconds,
            damageByWeapon,
            outroRadio: won ? narrative.clearOutro : { speaker: '阿阮', line: '先撤回值班室喘口气！刚才那批家伙有点凶，咱改改配装再杀回去！' },
            ...(won && narrative.epilogueHook ? { epilogueHook: narrative.epilogueHook } : {}),
        };
    }

    applySettlementToProfile(profile: WorkshopProfile): WorkshopProfile {
        const result = this.settle();
        const cleared = result.won && !profile.clearedChapters.includes(this.chapter.id)
            ? [...profile.clearedChapters, this.chapter.id]
            : profile.clearedChapters;
        const prevDanger = profile.maxDangerCleared[this.chapter.id];
        const maxDangerCleared = result.won && (prevDanger === undefined || this.danger > prevDanger)
            ? { ...profile.maxDangerCleared, [this.chapter.id]: this.danger }
            : profile.maxDangerCleared;
        return {
            ...profile,
            credits: profile.credits + result.creditsEarned,
            clearedChapters: cleared,
            maxDangerCleared,
        };
    }
}

export { CHAPTER_CATALOG };
