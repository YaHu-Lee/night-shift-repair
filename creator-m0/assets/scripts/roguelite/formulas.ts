import {
    ENEMY_ARCHETYPES,
    MODULE_BY_ID,
    RIG_CATALOG,
    SYNERGY_TABLE,
    WEAPON_CATALOG,
} from './catalog';
import { TAG_LABELS } from './narrative';
import { bonusLockSlotsForProfile, DANGER_NAMES } from './progression';
import type {
    DailyShiftModifierId,
    DangerLevel,
    PlayerStats,
    PreRunSupplyId,
    RegularEnemyId,
    RigId,
    StatDelta,
    StatKey,
    SynergyState,
    Tier,
    ToolId,
    WeaponInstance,
    WeaponTag,
    WorkshopProfile,
    WorkshopTalentSpec,
} from './types';

export const BASE_PLAYER_STATS: Readonly<PlayerStats> = {
    maxHp: 60,
    torque: 0,
    voltage: 0,
    overclock: 0,
    cycleSpeed: 0,
    critChance: 5,
    armor: 0,
    repair: 0,
    salvage: 0,
    luck: 0,
    moveSpeed: 0,
    pickupRadius: 0,
};

export const DANGER_MULTIPLIERS: Readonly<Record<DangerLevel, { readonly hp: number; readonly dmg: number; readonly count: number; readonly creditBonus: number; readonly label: string }>> = {
    0: { hp: 1.0, dmg: 1.0, count: 1.0, creditBonus: 0, label: DANGER_NAMES[0] },
    1: { hp: 1.15, dmg: 1.1, count: 1.08, creditBonus: 6, label: DANGER_NAMES[1] },
    2: { hp: 1.32, dmg: 1.22, count: 1.15, creditBonus: 12, label: DANGER_NAMES[2] },
    3: { hp: 1.52, dmg: 1.35, count: 1.22, creditBonus: 20, label: DANGER_NAMES[3] },
    4: { hp: 1.75, dmg: 1.5, count: 1.3, creditBonus: 30, label: DANGER_NAMES[4] },
};

export const STAT_KEYS: readonly StatKey[] = [
    'maxHp', 'torque', 'voltage', 'overclock', 'cycleSpeed', 'critChance',
    'armor', 'repair', 'salvage', 'luck', 'moveSpeed', 'pickupRadius',
];

export const ALL_TAGS: readonly WeaponTag[] = ['melee', 'arc', 'ballistic', 'thermal', 'control'];

export function addStats(target: PlayerStats, delta?: StatDelta): void {
    if (!delta) return;
    for (const key of STAT_KEYS) {
        const value = delta[key];
        if (value) target[key] += value;
    }
}

export function computeSynergies(weapons: readonly WeaponInstance[], rigId: RigId): SynergyState[] {
    const rig = RIG_CATALOG[rigId];
    const counts: Record<WeaponTag, number> = { melee: 0, arc: 0, ballistic: 0, thermal: 0, control: 0 };
    for (const w of weapons) {
        const tags = new Set<WeaponTag>(WEAPON_CATALOG[w.id].tags);
        if (rig.allArcTag) tags.add('arc');
        tags.forEach(tag => { counts[tag]++; });
    }
    return ALL_TAGS.map(tag => {
        const count = counts[tag];
        const table = SYNERGY_TABLE[tag];
        const active = count >= 6 ? table[2] : count >= 4 ? table[1] : count >= 2 ? table[0] : undefined;
        return {
            tag,
            name: TAG_LABELS[tag],
            count,
            activeTier: active?.count ?? 0,
            summary: active?.summary ?? `装备 2 把：${table[0].summary}`,
        };
    });
}

export function synergyTier(synergies: readonly SynergyState[], tag: WeaponTag): 0 | 2 | 4 | 6 {
    return synergies.find(s => s.tag === tag)?.activeTier ?? 0;
}

export interface ResolvedBuild {
    readonly stats: PlayerStats;
    readonly synergies: readonly SynergyState[];
    readonly shopPriceScale: number;
    readonly freeRerollsPerShop: number;
    readonly doublePartChance: number;
    readonly critHealChance: number;
    readonly bagKeepRate: number;
    readonly maxLocks: number;
    readonly enemyCountScale: number;
    readonly hasArcShock: boolean;
    readonly hasBurnSpread: boolean;
    readonly hasArmorThorns: boolean;
    readonly hasBreakerSurge: boolean;
}

export function resolveBuild(
    rigId: RigId,
    level: number,
    levelStats: StatDelta,
    weapons: readonly WeaponInstance[],
    moduleIds: readonly string[],
    profile?: Pick<WorkshopProfile, 'talents'> & { readonly maxDangerCleared?: WorkshopProfile['maxDangerCleared'] },
    danger: DangerLevel = 0,
    supply: PreRunSupplyId = 'none',
    dailyMod?: DailyShiftModifierId,
): ResolvedBuild {
    const rig = RIG_CATALOG[rigId];
    const stats: PlayerStats = { ...BASE_PLAYER_STATS };
    stats.maxHp += level * 4;
    if (supply === 'hot_thermos') stats.maxHp += 10;
    if (dailyMod === 'arc_overdrive') stats.cycleSpeed += 20;
    if (dailyMod === 'turbo_shift') { stats.moveSpeed += 18; stats.overclock += 12; }
    addStats(stats, rig.stats);
    addStats(stats, levelStats);

    const talents = profile?.talents ?? {};
    const chassis = talents.chassis ?? 0;
    const capacitor = talents.capacitor ?? 0;
    const toolbox = talents.toolbox ?? 0;
    const magnetBag = talents.magnet_bag ?? 0;
    const shopPermit = talents.shop_permit ?? 0;

    // Global workshop talents apply to ALL 6 weapon slots (fixing the legacy slot-0-only bug).
    stats.maxHp += chassis * 4;
    stats.armor += Math.floor(chassis / 2);
    stats.overclock += capacitor * 4;
    stats.cycleSpeed += capacitor * 3;
    stats.pickupRadius += magnetBag * 8;

    let shopDiscount = 0;
    let freeRerolls = toolbox;
    let doublePartChance = 0;
    let critHealChance = 0;
    let extraEnemyScale = 0;
    let hasArcShock = false;
    let hasBurnSpread = false;
    let hasArmorThorns = false;
    let hasBreakerSurge = false;

    for (const id of moduleIds) {
        const mod = MODULE_BY_ID[id];
        if (!mod) continue;
        addStats(stats, mod.stats);
        switch (mod.special) {
            case 'shop_discount': shopDiscount = Math.min(0.30, shopDiscount + 0.10); break;
            case 'free_reroll': freeRerolls++; break;
            case 'double_parts': doublePartChance = Math.min(0.60, doublePartChance + 0.20); break;
            case 'crit_heal': critHealChance = Math.min(0.45, critHealChance + 0.15); break;
            case 'arc_shock': hasArcShock = true; break;
            case 'burn_spread': hasBurnSpread = true; break;
            case 'armor_thorns': hasArmorThorns = true; break;
            case 'extra_enemies': extraEnemyScale += 0.18; break;
            case 'breaker_surge': hasBreakerSurge = true; break;
        }
    }

    const synergies = computeSynergies(weapons, rigId);
    for (const syn of synergies) {
        if (!syn.activeTier) continue;
        const entry = SYNERGY_TABLE[syn.tag].find(t => t.count === syn.activeTier);
        addStats(stats, entry?.stats);
    }

    // Armor-to-torque conversion (heavy_fitter rig and/or melee 6-set)
    const armorScale = (rig.armorToMelee ?? 0) + (synergyTier(synergies, 'melee') === 6 ? 1.0 : 0);
    if (armorScale > 0 && stats.armor > 0) {
        stats.torque += Math.floor(stats.armor * armorScale);
    }

    stats.maxHp = Math.max(20, Math.round(stats.maxHp));
    stats.critChance = Math.max(0, Math.min(95, stats.critChance));
    stats.moveSpeed = Math.max(-25, Math.min(60, stats.moveSpeed));
    stats.pickupRadius = Math.max(-30, stats.pickupRadius);

    // D2+ Grid Overload adds +10% shop supply inflation; Daily Bargain Horde discounts 25% with +30% enemies.
    const dangerInflation = danger >= 2 ? 1.10 : 1.0;
    const modPriceScale = dailyMod === 'bargain_horde' ? 0.75 : 1.0;
    const shopPriceScale = Math.max(0.50, ((rig.shopPriceScale ?? 1.0) - shopDiscount) * dangerInflation * modPriceScale);
    const bagKeepRate = Math.min(1.0, Math.max(rig.bagKeepRate ?? 0, 0.75 + magnetBag * 0.06));
    const maxLocks = 1 + shopPermit + bonusLockSlotsForProfile(profile?.maxDangerCleared ? { maxDangerCleared: profile.maxDangerCleared } : undefined);
    const enemyCountScale = (rig.enemyCountScale ?? 1.0) + extraEnemyScale + (dailyMod === 'bargain_horde' ? 0.30 : 0);

    return {
        stats,
        synergies,
        shopPriceScale,
        freeRerollsPerShop: freeRerolls,
        doublePartChance,
        critHealChance,
        bagKeepRate,
        maxLocks,
        enemyCountScale,
        hasArcShock,
        hasBurnSpread,
        hasArmorThorns,
        hasBreakerSurge,
    };
}

/**
 * Brotato-proven linear-EHP armor curve:
 * - Armor >= 0: damage taken = 15 / (15 + Armor). Every +1 Armor = +6.67% EHP, never reaches 100% DR.
 * - Armor < 0: gentler penalty = (15 - 2*Armor) / (15 - Armor), so -15 Armor = 150% damage taken.
 */
export function armorDamageMultiplier(armor: number): number {
    if (armor >= 0) return 15 / (15 + armor);
    return (15 - 2 * armor) / (15 - armor);
}

export function incomingDamage(rawDamage: number, armor: number): number {
    return Math.max(1, Math.round(rawDamage * armorDamageMultiplier(armor)));
}

export function computeWeaponCooldown(baseTicks: number, cycleSpeed: number, jammed = false): number {
    const speedFactor = Math.max(0.45, 1 + cycleSpeed / 100) * (jammed ? 0.65 : 1.0);
    return Math.max(6, Math.round(baseTicks / speedFactor));
}

export interface HitResult {
    readonly damage: number;
    readonly isCrit: boolean;
}

export function computeWeaponHit(
    toolId: ToolId,
    tier: Tier,
    stats: Readonly<PlayerStats>,
    rand: () => number,
    options: {
        readonly bonusMultiplier?: number;
        readonly targetMod?: number;
        readonly forceCrit?: boolean;
        readonly armorIgnoreOnCrit?: boolean;
        readonly isArmoredFront?: boolean;
        readonly ballisticFrontBonus?: number;
    } = {},
): HitResult {
    const spec = WEAPON_CATALOG[toolId];
    const tierSpec = spec.tiers[tier - 1];
    const scaledBase = Math.max(
        1,
        tierSpec.damage + stats.torque * spec.torqueScale + stats.voltage * spec.voltageScale,
    );
    const overclockMult = Math.max(0.35, 1 + stats.overclock / 100) * (options.bonusMultiplier ?? 1);
    const critRate = Math.min(0.95, Math.max(0, (spec.baseCritChance + stats.critChance) / 100));
    const isCrit = options.forceCrit === true || rand() < critRate;
    const critMult = isCrit ? tierSpec.critMult : 1;

    let frontMod = 1;
    if (options.isArmoredFront) {
        if (isCrit && options.armorIgnoreOnCrit) frontMod = 1.0;
        else if (toolId === 'hydraulic_nailer') frontMod = tier >= 3 ? 1.0 : 0.85;
        else frontMod = Math.min(1.0, 0.52 + (options.ballisticFrontBonus ?? 0));
    }
    const targetMod = (options.targetMod ?? 1) * frontMod;
    const damage = Math.max(1, Math.round(scaledBase * overclockMult * critMult * targetMod));
    return { damage, isCrit };
}

export function xpRequiredForLevel(level: number): number {
    // Smooth quadratic progression: targets ~1 level per wave across 12 waves (~Lv11-13 by Boss)
    return Math.round(2.4 * Math.pow(level + 3, 2));
}

/**
 * Tier odds by wave or level + Luck (highest tested first).
 */
export function rollTier(index: number, luck: number, rand: () => number, guaranteedMin: Tier = 1): Tier {
    const luckMult = Math.max(0.5, 1 + luck / 100);
    const p4 = index >= 7 ? Math.min(0.18, (0.015 + (index - 7) * 0.018) * luckMult) : 0;
    const p3 = index >= 4 ? Math.min(0.38, (0.04 + (index - 4) * 0.042) * luckMult) : 0;
    const p2 = index >= 2 ? Math.min(0.62, (0.10 + (index - 2) * 0.08) * luckMult) : 0;
    let rolled: Tier = 1;
    if (rand() < p4) rolled = 4;
    else if (rand() < p3) rolled = 3;
    else if (rand() < p2) rolled = 2;
    return Math.max(guaranteedMin, rolled) as Tier;
}

export function shopOfferPrice(basePrice: number, wave: number, priceScale = 1.0): number {
    return Math.max(1, Math.floor((basePrice * (1 + 0.21 * wave) + 3.2 * wave) * priceScale));
}

export function rerollPrice(wave: number, paidRerolls: number): number {
    const step = Math.max(2, Math.floor(0.9 * wave));
    const first = Math.floor(1.8 * wave) + step;
    return first + paidRerolls * step;
}

export function weaponSellRefund(toolId: ToolId, tier: Tier, wave: number, priceScale = 1.0): number {
    const currentPrice = shopOfferPrice(WEAPON_CATALOG[toolId].tiers[tier - 1].price, wave, priceScale);
    return Math.max(1, Math.floor(currentPrice * 0.4));
}

export function enemyStatsForWave(
    kind: RegularEnemyId,
    wave: number,
    chapterScale: number,
    danger: DangerLevel,
): { readonly hp: number; readonly damage: number; readonly speed: number; readonly parts: number; readonly xp: number } {
    const arch = ENEMY_ARCHETYPES[kind];
    const dm = DANGER_MULTIPLIERS[danger];
    // Ramp chapter difficulty smoothly from W1 to full chapterScale by W12, then continue scaling in endless waves.
    const chRamp = 1 + (chapterScale - 1) * (0.15 + 0.85 * Math.min(1, (wave - 1) / 11));
    const endlessBoost = wave > 12 ? Math.pow(1.14, wave - 12) : 1;
    const waveGrowth = (1 + (wave - 1) * 0.085) * endlessBoost;
    const hp = Math.round((arch.baseHp + arch.hpPerWave * (wave - 1)) * waveGrowth * chRamp * dm.hp);
    const damage = Math.max(2, Math.round((arch.baseDamage + arch.damagePerWave * (wave - 1)) * (1 + (chRamp - 1) * 0.45) * dm.dmg * (wave > 12 ? 1 + (wave - 12) * 0.06 : 1)));
    return { hp, damage, speed: arch.speed, parts: arch.partsDrop, xp: arch.xpDrop };
}

export function bossHpForWave(
    wave: number,
    chapterScale: number,
    danger: DangerLevel,
    isChapterBoss: boolean,
): number {
    const dm = DANGER_MULTIPLIERS[danger];
    // Calibrated for ~22-36s exciting duel with 100% baseline damage + 1.5x open vulnerability.
    const base = isChapterBoss ? 48000 : 4200;
    const waveScale = isChapterBoss ? (wave > 12 ? Math.pow(1.18, wave - 12) : 1) : (wave / 5);
    return Math.round(base * waveScale * chapterScale * dm.hp);
}

export function workshopTalentCost(spec: WorkshopTalentSpec, currentRank: number): number {
    return Math.round(spec.baseCost * Math.pow(spec.costGrowth, currentRank));
}
