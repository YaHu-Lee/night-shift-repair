import type { MeleeMotion } from './weaponMotion';

export interface Position {
    x: number;
    y: number;
}

export interface CombatBounds {
    readonly left: number;
    readonly right: number;
    readonly bottom: number;
    readonly top: number;
}

export type ToolId =
    | 'wrench'
    | 'arc_gun'
    | 'riveter'
    | 'torch'
    | 'induction'
    | 'hydraulic_nailer'
    | 'pulse_nozzle'
    | 'traction_coil'
    | 'split_probe'
    | 'bypass_wrench';

export type RegularEnemyId =
    | 'crawler'
    | 'charger'
    | 'turret'
    | 'armored'
    | 'pursuer'
    | 'reclaimer'
    | 'jammer'
    | 'ambusher';

export type EnemyId = RegularEnemyId | 'inspector';

export type ChapterBossKind = 'supervisor' | 'gatekeeper' | 'tow' | 'silence' | 'core' | 'elite';

export type ChapterHazard = (
    { readonly shape: 'rect'; readonly left: number; readonly right: number; readonly bottom: number; readonly top: number }
    | (Position & { readonly shape: 'sector'; readonly radius: number; readonly from: number; readonly sweep: number })
    | (Position & { readonly shape: 'tether'; readonly end: Readonly<Position>; readonly width: number })
) & { readonly state: 'warning' | 'active' };

export interface ChapterBossView {
    readonly kind: ChapterBossKind;
    readonly title: string;
    readonly hp: number;
    readonly maxHp: number;
    readonly stage: number;
    readonly vulnerable: boolean;
    readonly recovering: boolean;
    readonly phaseStartedAt: number;
    readonly phaseEndsAt: number;
    readonly instruction: string;
    readonly facing: number;
    readonly hazard?: ChapterHazard;
    readonly volley?: { readonly pattern: 'fan' | 'ring'; readonly state: 'warning' | 'active' };
}

export type SkillKind = 'arc' | 'shot' | 'heat' | 'magnet' | 'induction';
export type HitWeight = 'armor' | 'boss-break' | 'break' | 'strike';

export interface WeaponCast extends Readonly<Position> {
    readonly tool: ToolId;
    readonly slot: number;
    readonly ux: number;
    readonly uy: number;
    readonly targetRange: number;
    readonly tick: number;
    readonly effectBoost?: number;
    readonly modified?: true;
    readonly powered?: true;
    readonly melee?: MeleeMotion;
}

export interface WeaponImpact extends Readonly<Position> {
    tick: number;
    cast: WeaponCast;
    weight: HitWeight;
    rank: number;
}

export type MeleeWindup = Pick<WeaponCast, 'slot' | 'ux' | 'uy'> & {
    readonly tool: 'wrench' | 'bypass_wrench';
    readonly ageTicks: number;
};

type AttackArea = Position & (
    | { shape: 'circle'; kind: 'magnet' | 'induction'; radius: number }
    | { shape: 'strip'; kind: 'shot'; ux: number; uy: number; length: number; halfWidth: number }
    | { shape: 'sector'; kind: 'heat'; ux: number; uy: number; radius: number; slope: number }
);

export type Attack = { life: number; weight?: HitWeight; sourceCast?: WeaponCast } & (
    | AttackArea
    | (Position & { shape: 'link'; kind: 'arc'; from: Position; fromWeapon?: true; melee?: true; hop?: number; mark?: 'applied' | 'boosted' })
    | (Position & { shape: 'impact'; kind: Exclude<SkillKind, 'arc'>; pullFrom?: Position })
);

export interface RenderEnemy extends Position {
    readonly id: number;
    readonly kind: EnemyId;
    readonly hp: number;
    readonly state: 'walk' | 'warn' | 'dash';
    readonly next: number;
    readonly vx: number;
    readonly vy: number;
    readonly marked: boolean;
    readonly facingX?: number;
    readonly facingY?: number;
    readonly tether?: Readonly<Position>;
    readonly hitAt?: number;
    readonly shotAt?: number;
    readonly contactAt?: number;
    readonly revealedAt?: number;
}

export interface RenderBullet extends Position {
    readonly vx: number;
    readonly vy: number;
    readonly boss?: boolean;
}

export interface RenderBattleView {
    readonly field: CombatBounds;
    readonly player: Readonly<Position> & { readonly hp: number; readonly maxHp: number; readonly invulnerableUntil: number; readonly hurtAt?: number };
    readonly tick: number;
    readonly tools: readonly { readonly id: ToolId; readonly mods: readonly string[] }[];
    readonly weaponCasts: readonly WeaponCast[];
    readonly weaponImpacts: readonly WeaponImpact[];
    readonly effects: readonly Attack[];
    readonly enemies: readonly RenderEnemy[];
    readonly defeatedEnemies: readonly { readonly id: number; readonly kind: EnemyId; readonly x: number; readonly y: number; readonly hitAt: number }[];
    readonly bullets: readonly RenderBullet[];
    readonly parts: readonly Readonly<Position>[];
    readonly partPickups: readonly (Readonly<Position> & { readonly tick: number })[];
    readonly warnings: readonly (Readonly<Position> & { readonly kind: RegularEnemyId; readonly at: number })[];
    readonly chapterBoss: ChapterBossView | null;
    readonly boss: {
        readonly unit: RenderEnemy;
        readonly maxHp: number;
        readonly phase: 'patrol' | 'warning' | 'volley' | 'recover';
        readonly attack: string;
        readonly next: number;
        readonly pattern: number;
        readonly attackNumber: number;
        readonly damagedPlayer: boolean;
    } | null;
    readonly playerAttack?: { readonly tick: number; readonly x: number; readonly y: number };
    readonly playerHit?: Readonly<Position>;
    readonly rangedAimTarget: (slot: number) => Readonly<Position> | undefined;
    readonly meleeWindups: () => readonly MeleeWindup[];
}

export type WeaponTag = 'melee' | 'arc' | 'ballistic' | 'thermal' | 'control';
export type Tier = 1 | 2 | 3 | 4;
export type ChapterId = '01' | '02' | '03' | '04';
export type DangerLevel = 0 | 1 | 2 | 3 | 4;
export type RigId = 'duty_standard' | 'high_voltage' | 'heavy_fitter' | 'thermal_welder' | 'scrap_auditor';
export type PreRunSupplyId = 'none' | 'extra_crate' | 'spare_parts' | 'hot_thermos';
export type DailyShiftModifierId = 'bargain_horde' | 'arc_overdrive' | 'cold_supply' | 'turbo_shift';
export type RewardedPlacement = 'revive' | 'levelup_extra' | 'shop_supply' | 'prep_supply' | 'result_double';
export type StatKey =
    | 'maxHp'
    | 'torque'
    | 'voltage'
    | 'overclock'
    | 'cycleSpeed'
    | 'critChance'
    | 'armor'
    | 'repair'
    | 'salvage'
    | 'luck'
    | 'moveSpeed'
    | 'pickupRadius';

export interface PlayerStats {
    maxHp: number;
    torque: number;
    voltage: number;
    overclock: number;      // additive % damage, e.g. 20 = +20%
    cycleSpeed: number;     // additive % attack speed, e.g. 15 = +15%
    critChance: number;     // additive % crit chance, capped at 95%
    armor: number;          // linear EHP via 15 / (15 + armor)
    repair: number;         // HP regen = repair * 0.25 HP/s + drop heal bonus
    salvage: number;        // end-of-wave bonus parts (compounds +5%/wave)
    luck: number;           // shifts tier odds & repair kit drop chance
    moveSpeed: number;      // additive % movement speed, clamped [-25, +60]
    pickupRadius: number;   // additive % pickup radius
}

export type StatDelta = Partial<Record<StatKey, number>>;

export interface WeaponTierSpec {
    readonly damage: number;
    readonly cooldownTicks: number;
    readonly critMult: number;
    readonly reach: number;
    readonly price: number;
    readonly extraTargets?: number;
    readonly pierce?: number;
    readonly hops?: number;
    readonly perkText?: string;
}

export interface WeaponSpec {
    readonly id: ToolId;
    readonly name: string;
    readonly tags: readonly WeaponTag[];
    readonly torqueScale: number;
    readonly voltageScale: number;
    readonly baseCritChance: number;
    readonly roleText: string;
    readonly tiers: readonly [WeaponTierSpec, WeaponTierSpec, WeaponTierSpec, WeaponTierSpec];
    readonly tier3Unlock: string;
    readonly tier4Unlock: string;
}

export interface WeaponInstance {
    readonly uid: number;
    readonly id: ToolId;
    readonly tier: Tier;
}

export interface ModuleSpec {
    readonly id: string;
    readonly name: string;
    readonly tier: Tier;
    readonly price: number;
    readonly tags: readonly WeaponTag[];
    readonly stats: StatDelta;
    readonly unique?: boolean;
    readonly special?:
        | 'free_reroll'
        | 'shop_discount'
        | 'double_parts'
        | 'crit_heal'
        | 'arc_shock'
        | 'burn_spread'
        | 'armor_thorns'
        | 'extra_enemies'
        | 'breaker_surge';
    readonly flavor: string;
}

export interface RigSpec {
    readonly id: RigId;
    readonly name: string;
    readonly title: string;
    readonly starterWeapon: ToolId;
    readonly stats: StatDelta;
    readonly wantedTags: readonly WeaponTag[];
    readonly bannedTags?: readonly WeaponTag[];
    readonly shopPriceScale?: number;
    readonly enemyCountScale?: number;
    readonly bagKeepRate?: number;
    readonly allArcTag?: boolean;
    readonly armorToMelee?: number;
    readonly summary: string;
    readonly tradeoff: string;
}

export interface SynergyTierBonus {
    readonly count: 2 | 4 | 6;
    readonly stats: StatDelta;
    readonly summary: string;
}

export interface SynergyState {
    readonly tag: WeaponTag;
    readonly name: string;
    readonly count: number;
    readonly activeTier: 0 | 2 | 4 | 6;
    readonly summary: string;
}

export interface LevelUpOption {
    readonly id: string;
    readonly stat: StatKey;
    readonly tier: Tier;
    readonly amount: number;
    readonly label: string;
    readonly detail: string;
}

export interface ShopSlot {
    readonly slotIndex: number;
    readonly kind: 'weapon' | 'module';
    readonly itemId: string;
    readonly tier: Tier;
    readonly price: number;
    readonly locked: boolean;
    readonly sold: boolean;
    readonly canAutoMerge?: boolean;
}

export interface StationSegment {
    readonly id: string;
    readonly name: string;
    readonly arena: string;
    readonly waves: readonly [number, number]; // inclusive 1-based wave numbers
    readonly arriveRadio?: string;
}

export interface WaveDefinition {
    readonly wave: number; // 1..12
    readonly stationIndex: number; // 0..4
    readonly durationSeconds: number;
    readonly targetActive: number;
    readonly maxActive: number;
    readonly spawnIntervalTicks: number;
    readonly roster: readonly { readonly kind: RegularEnemyId; readonly weight: number }[];
    readonly eliteWave?: boolean;
    readonly bossWave?: boolean;
    readonly hint: string;
}

export interface ChapterDefinition {
    readonly id: ChapterId;
    readonly index: number;
    readonly title: string;
    readonly routeName: string;
    readonly enemyScale: number;
    readonly bossKind: ChapterBossKind | 'inspector';
    readonly bossName: string;
    readonly midBossKind: ChapterBossKind | 'inspector';
    readonly midBossName: string;
    readonly stations: readonly StationSegment[];
    readonly waves: readonly WaveDefinition[];
}

export interface EnemyArchetype {
    readonly id: RegularEnemyId;
    readonly name: string;
    readonly baseHp: number;
    readonly hpPerWave: number;
    readonly baseDamage: number;
    readonly damagePerWave: number;
    readonly speed: number;
    readonly partsDrop: number;
    readonly xpDrop: number;
    readonly radius: number;
}

export type DamageSource =
    | RegularEnemyId
    | 'reclaimer_cable'
    | 'reclaimer_body'
    | 'projectile'
    | 'boss_skill'
    | 'boss_contact'
    | 'boss_bullet';

export interface WeaponDamageStat {
    readonly slot: number;
    readonly id: ToolId;
    readonly tier: Tier;
    readonly totalDamage: number;
    readonly kills: number;
    readonly crits: number;
}

export interface BattleWaveSummary {
    readonly wave: number;
    readonly stationName: string;
    readonly cleared: boolean;
    readonly elapsedSeconds: number;
    readonly kills: number;
    readonly elitesKilled: number;
    readonly partsCollected: number;
    readonly partsBagged: number;
    readonly bagRedeemed: number;
    readonly xpGained: number;
    readonly damageTaken: number;
    readonly hitsTaken: number;
    readonly healed: number;
    readonly endHp: number;
    readonly maxHp: number;
    readonly defeatedBy: DamageSource | null;
    readonly hitSources: Readonly<Partial<Record<DamageSource, number>>>;
    readonly damageByWeapon: readonly WeaponDamageStat[];
    readonly emptySeconds: number;
}

export interface WorkshopTalentSpec {
    readonly id: 'chassis' | 'capacitor' | 'toolbox' | 'magnet_bag' | 'shop_permit' | 'ban_permit';
    readonly name: string;
    readonly maxRank: number;
    readonly baseCost: number;
    readonly costGrowth: number;
    readonly detail: (rank: number) => string;
}

export interface DailyEngagementState {
    readonly dateKey: string;
    readonly checkInClaimed?: boolean;
    readonly freeSupplyCharges?: number;
    readonly dailyShiftCleared?: boolean;
    readonly adDoubleUsed?: number;
    readonly adPrepUsed?: number;
}

export interface WorkshopProfile {
    readonly schemaVersion: 3;
    readonly credits: number;
    readonly clearedChapters: readonly ChapterId[];
    readonly maxDangerCleared: Readonly<Partial<Record<ChapterId, DangerLevel>>>;
    readonly maxDangerByRig?: Readonly<Partial<Record<RigId, DangerLevel>>>;
    readonly unlockedRigs: readonly RigId[];
    readonly talents: Readonly<Partial<Record<WorkshopTalentSpec['id'], number>>>;
    readonly bannedModules: readonly string[];
    readonly onboardingDone?: boolean;
    readonly adFreePass?: boolean;
    readonly bestEndlessWave?: number;
    readonly daily?: DailyEngagementState;
}

export interface PatrolFieldConfig {
    readonly bounds: CombatBounds;
    readonly spawnOrigin: Readonly<Position>;
}
