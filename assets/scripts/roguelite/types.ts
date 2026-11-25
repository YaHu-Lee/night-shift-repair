import type { CombatBounds, RegularEnemyId, ToolId } from '../m1/content';
import type { ChapterBossKind, Position } from '../m1/Encounter';

export type WeaponTag = 'melee' | 'arc' | 'ballistic' | 'thermal' | 'control';
export type Tier = 1 | 2 | 3 | 4;
export type DangerLevel = 0 | 1 | 2 | 3 | 4;
export type RigId = 'duty_standard' | 'high_voltage' | 'heavy_fitter' | 'thermal_welder' | 'scrap_auditor';
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
        | 'extra_enemies';
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
    readonly id: '01' | '02' | '03' | '04';
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

export interface WorkshopProfile {
    readonly schemaVersion: 3;
    readonly credits: number;
    readonly clearedChapters: readonly ('01' | '02' | '03' | '04')[];
    readonly maxDangerCleared: Readonly<Partial<Record<'01' | '02' | '03' | '04', DangerLevel>>>;
    readonly unlockedRigs: readonly RigId[];
    readonly talents: Readonly<Partial<Record<WorkshopTalentSpec['id'], number>>>;
    readonly bannedModules: readonly string[];
}

export interface PatrolFieldConfig {
    readonly bounds: CombatBounds;
    readonly spawnOrigin: Readonly<Position>;
}
