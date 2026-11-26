import type { RegularEnemyId, ToolId } from '../m1/content';
import type {
    ChapterDefinition,
    EnemyArchetype,
    ModuleSpec,
    RigId,
    RigSpec,
    SynergyTierBonus,
    WaveDefinition,
    WeaponSpec,
    WeaponTag,
    WorkshopTalentSpec,
} from './types';

// 10 floating tools: 10x numerical scale (12-65 dmg) with distinct scaling ratios & T3/T4 evolutions.
export const WEAPON_CATALOG: Readonly<Record<ToolId, WeaponSpec>> = {
    wrench: {
        id: 'wrench',
        name: '电弧扳手',
        tags: ['melee', 'arc'],
        torqueScale: 1.0,
        voltageScale: 0.4,
        baseCritChance: 8,
        roleText: '挥扫能打中好几台',
        tiers: [
            { damage: 18, cooldownTicks: 18, critMult: 1.75, reach: 64, price: 20 },
            { damage: 26, cooldownTicks: 16, critMult: 1.85, reach: 68, price: 40 },
            { damage: 37, cooldownTicks: 15, critMult: 2.0, reach: 74, price: 78, perkText: '扫中两台后回扫更重' },
            { damage: 52, cooldownTicks: 13, critMult: 2.2, reach: 82, price: 148, perkText: '大回扫会连跳电弧' },
        ],
        tier3Unlock: '回扫飞轮',
        tier4Unlock: '过载电弧回扫',
    },
    bypass_wrench: {
        id: 'bypass_wrench',
        name: '旁路扳手',
        tags: ['melee'],
        torqueScale: 1.2,
        voltageScale: 0,
        baseCritChance: 12,
        roleText: '钩扫和压击来回换',
        tiers: [
            { damage: 20, cooldownTicks: 19, critMult: 2.0, reach: 60, price: 22 },
            { damage: 29, cooldownTicks: 17, critMult: 2.15, reach: 64, price: 44 },
            { damage: 42, cooldownTicks: 16, critMult: 2.3, reach: 68, price: 84, perkText: '第四击必是重击' },
            { damage: 60, cooldownTicks: 14, critMult: 2.5, reach: 74, price: 158, perkText: '第四击震开一小圈' },
        ],
        tier3Unlock: '重型离合片',
        tier4Unlock: '震地重锤',
    },
    arc_gun: {
        id: 'arc_gun',
        name: '电弧枪',
        tags: ['arc'],
        torqueScale: 0,
        voltageScale: 1.0,
        baseCritChance: 6,
        roleText: '电弧会跳到旁边',
        tiers: [
            { damage: 14, cooldownTicks: 22, critMult: 1.75, reach: 132, price: 22, hops: 2 },
            { damage: 20, cooldownTicks: 20, critMult: 1.85, reach: 140, price: 44, hops: 3 },
            { damage: 29, cooldownTicks: 18, critMult: 2.0, reach: 150, price: 82, hops: 4, perkText: '连跳不减还带感电' },
            { damage: 41, cooldownTicks: 16, critMult: 2.15, reach: 162, price: 154, hops: 5, perkText: '两道电弧一起跳' },
        ],
        tier3Unlock: '跨弧接头',
        tier4Unlock: '双股高压弧',
    },
    riveter: {
        id: 'riveter',
        name: '铆钉枪',
        tags: ['ballistic'],
        torqueScale: 0.8,
        voltageScale: 0,
        baseCritChance: 10,
        roleText: '一发能穿过多台',
        tiers: [
            { damage: 15, cooldownTicks: 20, critMult: 1.9, reach: 185, price: 20, pierce: 2 },
            { damage: 22, cooldownTicks: 18, critMult: 2.05, reach: 195, price: 40, pierce: 3 },
            { damage: 31, cooldownTicks: 16, critMult: 2.2, reach: 205, price: 78, pierce: 4, perkText: '穿得越多这一发越疼' },
            { damage: 44, cooldownTicks: 14, critMult: 2.4, reach: 220, price: 146, pierce: 6, perkText: '钉道变宽并把人推开' },
        ],
        tier3Unlock: '贯穿钉组',
        tier4Unlock: '螺旋重钉',
    },
    hydraulic_nailer: {
        id: 'hydraulic_nailer',
        name: '液压钉枪',
        tags: ['ballistic'],
        torqueScale: 1.25,
        voltageScale: 0,
        baseCritChance: 18,
        roleText: '护甲正面也打得动',
        tiers: [
            { damage: 30, cooldownTicks: 33, critMult: 2.2, reach: 162, price: 24, pierce: 1 },
            { damage: 43, cooldownTicks: 30, critMult: 2.35, reach: 170, price: 48, pierce: 2 },
            { damage: 60, cooldownTicks: 27, critMult: 2.5, reach: 180, price: 90, pierce: 3, perkText: '护甲正面也钉得进' },
            { damage: 84, cooldownTicks: 24, critMult: 2.75, reach: 192, price: 168, pierce: 4, perkText: '暴击再补一记震' },
        ],
        tier3Unlock: '双排入钉座',
        tier4Unlock: '爆裂重钉',
    },
    torch: {
        id: 'torch',
        name: '喷火管',
        tags: ['thermal'],
        torqueScale: 0,
        voltageScale: 0.75,
        baseCritChance: 5,
        roleText: '扇面喷火持续烧',
        tiers: [
            { damage: 9, cooldownTicks: 12, critMult: 1.5, reach: 92, price: 21 },
            { damage: 13, cooldownTicks: 11, critMult: 1.6, reach: 98, price: 42 },
            { damage: 19, cooldownTicks: 10, critMult: 1.75, reach: 106, price: 80, perkText: '连喷第四下开始更烫' },
            { damage: 27, cooldownTicks: 9, critMult: 1.9, reach: 114, price: 150, perkText: '燃烧翻倍还会溅火' },
        ],
        tier3Unlock: '高温换向阀',
        tier4Unlock: '蓝白烈焰',
    },
    pulse_nozzle: {
        id: 'pulse_nozzle',
        name: '脉冲喷管',
        tags: ['thermal', 'control'],
        torqueScale: 0.4,
        voltageScale: 0.75,
        baseCritChance: 8,
        roleText: '把前面的敌人推开',
        tiers: [
            { damage: 15, cooldownTicks: 24, critMult: 1.75, reach: 88, price: 21 },
            { damage: 22, cooldownTicks: 22, critMult: 1.85, reach: 94, price: 42 },
            { damage: 31, cooldownTicks: 20, critMult: 2.0, reach: 102, price: 80, perkText: '推得更远打着更疼' },
            { damage: 44, cooldownTicks: 18, critMult: 2.15, reach: 112, price: 150, perkText: '推开时把目标点着' },
        ],
        tier3Unlock: '强排导板',
        tier4Unlock: '灼热脉冲',
    },
    induction: {
        id: 'induction',
        name: '感应线圈',
        tags: ['arc', 'control'],
        torqueScale: 0,
        voltageScale: 0.9,
        baseCritChance: 6,
        roleText: '电到身边一圈',
        tiers: [
            { damage: 18, cooldownTicks: 25, critMult: 1.75, reach: 78, price: 22 },
            { damage: 26, cooldownTicks: 23, critMult: 1.85, reach: 86, price: 44 },
            { damage: 37, cooldownTicks: 20, critMult: 2.0, reach: 96, price: 84, perkText: '电环命中会拖慢敌人' },
            { damage: 52, cooldownTicks: 18, critMult: 2.15, reach: 108, price: 156, perkText: '再向最远的拉一道弧' },
        ],
        tier3Unlock: '叠层感应盘',
        tier4Unlock: '高压磁暴环',
    },
    traction_coil: {
        id: 'traction_coil',
        name: '牵引线圈',
        tags: ['control'],
        torqueScale: 0.3,
        voltageScale: 0.85,
        baseCritChance: 8,
        roleText: '把敌人拉到身边',
        tiers: [
            { damage: 14, cooldownTicks: 26, critMult: 1.75, reach: 112, price: 20, extraTargets: 2 },
            { damage: 20, cooldownTicks: 24, critMult: 1.85, reach: 122, price: 40, extraTargets: 3 },
            { damage: 28, cooldownTicks: 21, critMult: 2.0, reach: 134, price: 78, extraTargets: 4, perkText: '拉近之后打着更疼' },
            { damage: 40, cooldownTicks: 19, critMult: 2.15, reach: 146, price: 146, extraTargets: 5, perkText: '拉完再震开一小圈' },
        ],
        tier3Unlock: '重载吸盘',
        tier4Unlock: '涡流磁吸',
    },
    split_probe: {
        id: 'split_probe',
        name: '分束探针',
        tags: ['ballistic', 'arc'],
        torqueScale: 0.45,
        voltageScale: 0.65,
        baseCritChance: 15,
        roleText: '同时打好几台',
        tiers: [
            { damage: 13, cooldownTicks: 22, critMult: 2.0, reach: 150, price: 22, extraTargets: 2 },
            { damage: 19, cooldownTicks: 20, critMult: 2.15, reach: 160, price: 44, extraTargets: 3 },
            { damage: 27, cooldownTicks: 18, critMult: 2.3, reach: 170, price: 84, extraTargets: 4, perkText: '暴击时针尖分叉' },
            { damage: 38, cooldownTicks: 16, critMult: 2.5, reach: 182, price: 158, extraTargets: 5, perkText: '只剩一台就两束齐射' },
        ],
        tier3Unlock: '四路分配器',
        tier4Unlock: '集束齐射',
    },
};

export const ALL_TOOL_IDS = Object.keys(WEAPON_CATALOG) as ToolId[];

export const SYNERGY_TABLE: Readonly<Record<WeaponTag, readonly [SynergyTierBonus, SynergyTierBonus, SynergyTierBonus]>> = {
    melee: [
        { count: 2, stats: { armor: 2, torque: 3 }, summary: '护甲+2，挥击更远' },
        { count: 4, stats: { armor: 5, torque: 7, maxHp: 8 }, summary: '护甲+5，挥击再远一些' },
        { count: 6, stats: { armor: 8, torque: 12, maxHp: 16 }, summary: '护甲计入物理伤' },
    ],
    arc: [
        { count: 2, stats: { voltage: 3, cycleSpeed: 6 }, summary: '电火+3，电弧多跳一次' },
        { count: 4, stats: { voltage: 7, cycleSpeed: 12 }, summary: '感电后再打更疼' },
        { count: 6, stats: { voltage: 13, cycleSpeed: 20 }, summary: '感电打死会炸电花' },
    ],
    ballistic: [
        { count: 2, stats: { critChance: 8, torque: 3 }, summary: '暴击+8%，正面更疼' },
        { count: 4, stats: { critChance: 16, torque: 6, overclock: 10 }, summary: '暴击+16%，能多穿一台' },
        { count: 6, stats: { critChance: 25, torque: 11, overclock: 20 }, summary: '暴击无视护甲正面' },
    ],
    thermal: [
        { count: 2, stats: { voltage: 3, overclock: 6 }, summary: '打中会持续燃烧' },
        { count: 4, stats: { voltage: 7, overclock: 14 }, summary: '燃烧能叠，爆开更猛' },
        { count: 6, stats: { voltage: 12, overclock: 24, cycleSpeed: 15 }, summary: '过载时炸开一圈热浪' },
    ],
    control: [
        { count: 2, stats: { pickupRadius: 15, repair: 2 }, summary: '拉推更远，被拉更脆' },
        { count: 4, stats: { pickupRadius: 28, repair: 4, armor: 2 }, summary: '拉推再远，被拉更脆' },
        { count: 6, stats: { pickupRadius: 42, repair: 7, armor: 4 }, summary: '控场打中三台放磁波' },
    ],
};

// 32 shared workshop modules with crisp trade-offs and tag weights (replaces 52 isolated single-weapon parts).
export const MODULE_CATALOG: readonly ModuleSpec[] = [
    // Tier I (base price 16-24)
    { id: 'copper_knuckle', name: '黄铜配重块', tier: 1, price: 18, tags: ['melee'], stats: { torque: 3, moveSpeed: -2 }, flavor: '抡起来很解气' },
    { id: 'spare_coil', name: '拆机铜线圈', tier: 1, price: 18, tags: ['arc', 'thermal'], stats: { voltage: 3, armor: -1 }, flavor: '电流窜得欢' },
    { id: 'light_bearing', name: '轻油滚珠轴承', tier: 1, price: 17, tags: ['melee', 'control'], stats: { moveSpeed: 7, cycleSpeed: 4 }, flavor: '脚底溜得飞快' },
    { id: 'scrap_magnet', name: '废料吸铁环', tier: 1, price: 16, tags: ['control'], stats: { pickupRadius: 28, salvage: 4 }, flavor: '隔街就能吸螺丝' },
    { id: 'steel_apron', name: '厚帆布护胸', tier: 1, price: 18, tags: ['melee'], stats: { maxHp: 8, armor: 1 }, flavor: '挡焊渣很稳' },
    { id: 'caffeine_thermos', name: '浓茶保温杯', tier: 1, price: 17, tags: ['control'], stats: { repair: 3, maxHp: 4 }, flavor: '喝一口就清醒' },
    { id: 'optic_loupe', name: '检修放大镜', tier: 1, price: 19, tags: ['ballistic'], stats: { critChance: 6, luck: 4 }, flavor: '专扎铁皮焊缝' },
    { id: 'overtime_voucher', name: '废铜回收袋', tier: 1, price: 18, tags: ['control'], stats: { salvage: 7, overclock: -3 }, flavor: '先把家底攒厚' },
    { id: 'stripped_motor', name: '拆壳快转电机', tier: 1, price: 20, tags: ['ballistic', 'arc'], stats: { cycleSpeed: 10, maxHp: -4 }, flavor: '转得快也更脆' },
    { id: 'insulating_boots', name: '厚底绝缘胶靴', tier: 1, price: 19, tags: ['arc', 'melee'], stats: { armor: 2, moveSpeed: 4, pickupRadius: -8 }, flavor: '水洼里不漏电' },
    { id: 'flint_nozzle', name: '压电打火嘴', tier: 1, price: 19, tags: ['thermal'], stats: { voltage: 2, overclock: 6, critChance: -2 }, flavor: '按一下就冒火星' },
    { id: 'lucky_fuse', name: '红头保险丝', tier: 1, price: 18, tags: ['arc'], stats: { luck: 10, cycleSpeed: 4 }, flavor: '老周说能少翻车' },

    // Tier II (base price 32-44)
    { id: 'heavy_flywheel', name: '重型配重飞轮', tier: 2, price: 36, tags: ['melee'], stats: { torque: 6, overclock: 8, moveSpeed: -5 }, flavor: '砸上去实打实' },
    { id: 'step_up_cap', name: '升压大电容', tier: 2, price: 36, tags: ['arc'], stats: { voltage: 6, cycleSpeed: 10, armor: -2 }, flavor: '电弧能蹿很远' },
    { id: 'tungsten_pin', name: '钨钢穿甲针', tier: 2, price: 38, tags: ['ballistic'], stats: { critChance: 11, torque: 4, repair: -1 }, flavor: '护甲机像扎纸' },
    { id: 'propane_booster', name: '增压气罐', tier: 2, price: 37, tags: ['thermal'], stats: { overclock: 14, voltage: 4, maxHp: -6 }, flavor: '火力猛得发烫' },
    { id: 'composite_plate', name: '检修防爆板', tier: 2, price: 35, tags: ['melee', 'control'], stats: { armor: 4, maxHp: 10, cycleSpeed: -4 }, flavor: '扛冲车不太晃' },
    { id: 'auto_solder', name: '自动补焊机', tier: 2, price: 34, tags: ['control', 'thermal'], stats: { repair: 5, armor: 1, moveSpeed: -3 }, flavor: '边跑边把口焊上' },
    { id: 'coupon_pass', name: '内部调拨单', tier: 2, price: 36, tags: ['control'], stats: { salvage: 5 }, special: 'shop_discount', flavor: '陈栖盖过章' },
    { id: 'spare_crate_key', name: '万能工具箱钥匙', tier: 2, price: 35, tags: ['control'], stats: { luck: 6 }, special: 'free_reroll', flavor: '每店多翻一箱' },
    { id: 'vampire_clamp', name: '回流充电夹', tier: 2, price: 38, tags: ['ballistic', 'melee'], stats: { critChance: 7 }, special: 'crit_heal', flavor: '暴击有时回血' },
    { id: 'scrap_sieve', name: '磁选双倍筛', tier: 2, price: 34, tags: ['control'], stats: { pickupRadius: 20, luck: 5 }, special: 'double_parts', flavor: '有时多抠出一块' },

    // Tier III (base price 56-72)
    { id: 'overclock_core', name: '三倍频超频盒', tier: 3, price: 62, tags: ['arc', 'ballistic'], stats: { overclock: 22, cycleSpeed: 14, armor: -3 }, flavor: '风扇啸叫别挨打' },
    { id: 'hydraulic_exoskeleton', name: '旧款助力外骨骼', tier: 3, price: 64, tags: ['melee'], stats: { torque: 11, maxHp: 16, armor: 3, moveSpeed: -6 }, flavor: '穿上像小推土机' },
    { id: 'tesla_manifold', name: '高压分流母排', tier: 3, price: 64, tags: ['arc'], stats: { voltage: 11, cycleSpeed: 10 }, special: 'arc_shock', flavor: '电弧炸开再溅一圈' },
    { id: 'thermite_valve', name: '铝热增压阀', tier: 3, price: 62, tags: ['thermal'], stats: { voltage: 8, overclock: 18, repair: -2 }, special: 'burn_spread', flavor: '点着一台烧一片' },
    { id: 'ballistic_computer', name: '老式弹道算盘', tier: 3, price: 64, tags: ['ballistic'], stats: { critChance: 16, overclock: 14, pickupRadius: -15 }, flavor: '专往接缝里钻' },
    { id: 'reactive_shield', name: '反震装甲壳', tier: 3, price: 60, tags: ['melee', 'control'], stats: { armor: 6, maxHp: 14 }, special: 'armor_thorns', flavor: '撞上来会反震' },
    { id: 'bait_beacon', name: '过载诱饵灯', tier: 3, price: 58, tags: ['control'], stats: { salvage: 14, luck: 12, overclock: 10 }, special: 'extra_enemies', flavor: '引来更多零件' },

    // Tier IV (base price 92-112, rare build-defining capstones)
    { id: 'zero_line_tap', name: '零号线盗电钳', tier: 4, price: 98, tags: ['arc', 'thermal'], stats: { overclock: 32, voltage: 16, cycleSpeed: 18, maxHp: -12 }, unique: true, flavor: '从零号线偷电' },
    { id: 'master_wrench_rig', name: '总工六臂增压架', tier: 4, price: 102, tags: ['melee', 'ballistic'], stats: { torque: 18, critChance: 18, armor: 5, cycleSpeed: 12 }, unique: true, flavor: '老师傅的压箱底' },
    { id: 'emergency_generator', name: '便携急救发电机', tier: 4, price: 94, tags: ['control'], stats: { maxHp: 28, armor: 7, repair: 10, salvage: 12 }, unique: true, flavor: '它转着就不会倒' },
    { id: 'main_breaker_lever', name: '总闸强合手柄', tier: 4, price: 104, tags: ['arc', 'melee'], stats: { overclock: 20, torque: 10, voltage: 10, critChance: 12 }, unique: true, special: 'breaker_surge', flavor: '开波先炸一圈电' },
];

export const MODULE_BY_ID: Readonly<Record<string, ModuleSpec>> = Object.fromEntries(
    MODULE_CATALOG.map(m => [m.id, m]),
);

// 5 Playable Mechanic Rigs (replaces the 3 half-broken blueprints with Brotato-grade build identities)
export const RIG_CATALOG: Readonly<Record<RigId, RigSpec>> = {
    duty_standard: {
        id: 'duty_standard',
        name: '标准值班员',
        title: '全能抢修',
        starterWeapon: 'wrench',
        stats: { maxHp: 10, armor: 2, torque: 2, voltage: 2, salvage: 5, luck: 5 },
        wantedTags: ['melee', 'arc'],
        summary: '老工装，干啥都顺手。',
        tradeoff: '不偏科，靠慢慢成型',
    },
    high_voltage: {
        id: 'high_voltage',
        name: '高压电工',
        title: '全员电网',
        starterWeapon: 'arc_gun',
        stats: { voltage: 6, cycleSpeed: 12, maxHp: -12, armor: -2 },
        wantedTags: ['arc'],
        bannedTags: ['ballistic'],
        allArcTag: true,
        summary: '铜接头拉满电，身板脆。',
        tradeoff: '不能装穿甲枪，生命少 12',
    },
    heavy_fitter: {
        id: 'heavy_fitter',
        name: '重工钳工',
        title: '护甲转伤',
        starterWeapon: 'wrench',
        stats: { maxHp: 14, armor: 4, torque: 4, moveSpeed: -6 },
        wantedTags: ['melee', 'control'],
        bannedTags: ['ballistic'],
        armorToMelee: 1.0,
        summary: '越挨打越硬，贴脸讲理。',
        tradeoff: '不能装穿甲枪，跑得更慢',
    },
    thermal_welder: {
        id: 'thermal_welder',
        name: '热能焊工',
        title: '烧灼爆燃',
        starterWeapon: 'torch',
        stats: { voltage: 5, overclock: 15, cycleSpeed: 10, armor: -3, repair: 2 },
        wantedTags: ['thermal', 'control'],
        summary: '火头很旺，忘系护甲带。',
        tradeoff: '护甲少 3，喷火时别站死',
    },
    scrap_auditor: {
        id: 'scrap_auditor',
        name: '废料精算师',
        title: '以战养战',
        starterWeapon: 'riveter',
        stats: { salvage: 10, luck: 12, pickupRadius: 25, overclock: -6 },
        wantedTags: ['ballistic', 'control'],
        shopPriceScale: 0.85,
        enemyCountScale: 1.25,
        bagKeepRate: 1.0,
        summary: '拆一台，想赚两台的钱。',
        tradeoff: '增伤低，敌人多四分之一',
    },
};

export const WORKSHOP_TALENTS: readonly WorkshopTalentSpec[] = [
    { id: 'chassis', name: '强化工装衬垫', maxRank: 5, baseCost: 10, costGrowth: 1.4, detail: r => `生命 +${r * 4}${Math.floor(r / 2) ? `，护甲 +${Math.floor(r / 2)}` : ''}` },
    { id: 'capacitor', name: '全臂并联总线', maxRank: 5, baseCost: 12, costGrowth: 1.4, detail: r => `伤害 +${r * 4}%，出手 +${r * 3}%` },
    { id: 'toolbox', name: '翻箱熟手', maxRank: 3, baseCost: 14, costGrowth: 1.5, detail: r => `每店白送 ${r} 次翻箱` },
    { id: 'magnet_bag', name: '加厚零件滞留袋', maxRank: 4, baseCost: 10, costGrowth: 1.35, detail: r => `漏捡零件留住 ${Math.min(100, 75 + r * 6)}%` },
    { id: 'shop_permit', name: '货架锁定许可', maxRank: 2, baseCost: 8, costGrowth: 1.5, detail: r => `最多锁住 ${r + 1} 件货` },
    { id: 'ban_permit', name: '废件黑名单', maxRank: 3, baseCost: 12, costGrowth: 1.45, detail: r => `出勤前可拿掉 ${r * 2} 件货` },
];

// 8 regular enemy archetypes: true wave growth + distinct roles (jammer & ambusher redesigned for open combat!)
export const ENEMY_ARCHETYPES: Readonly<Record<RegularEnemyId, EnemyArchetype>> = {
    crawler: { id: 'crawler', name: '爬行机', baseHp: 20, hpPerWave: 11, baseDamage: 6, damagePerWave: 0.55, speed: 50, partsDrop: 1, xpDrop: 2, radius: 10 },
    charger: { id: 'charger', name: '冲锋机', baseHp: 34, hpPerWave: 18, baseDamage: 10, damagePerWave: 0.85, speed: 42, partsDrop: 2, xpDrop: 3, radius: 13 },
    turret: { id: 'turret', name: '炮台机', baseHp: 30, hpPerWave: 16, baseDamage: 9, damagePerWave: 0.8, speed: 28, partsDrop: 2, xpDrop: 3, radius: 12 },
    armored: { id: 'armored', name: '护甲机', baseHp: 56, hpPerWave: 28, baseDamage: 10, damagePerWave: 0.85, speed: 35, partsDrop: 3, xpDrop: 5, radius: 15 },
    pursuer: { id: 'pursuer', name: '追击机', baseHp: 32, hpPerWave: 19, baseDamage: 9, damagePerWave: 0.8, speed: 58, partsDrop: 2, xpDrop: 4, radius: 11 },
    reclaimer: { id: 'reclaimer', name: '回收机', baseHp: 48, hpPerWave: 24, baseDamage: 10, damagePerWave: 0.85, speed: 34, partsDrop: 2, xpDrop: 4, radius: 14 },
    jammer: { id: 'jammer', name: '干扰机', baseHp: 42, hpPerWave: 22, baseDamage: 8, damagePerWave: 0.75, speed: 36, partsDrop: 2, xpDrop: 4, radius: 13 },
    ambusher: { id: 'ambusher', name: '埋伏机', baseHp: 36, hpPerWave: 20, baseDamage: 12, damagePerWave: 0.95, speed: 52, partsDrop: 2, xpDrop: 4, radius: 12 },
};

function makeChapterWaves(
    chapterIndex: number,
    rosters: readonly (readonly { readonly kind: RegularEnemyId; readonly weight: number }[])[],
    hints: readonly string[],
): readonly WaveDefinition[] {
    const durations = [25, 30, 35, 40, 45, 45, 50, 50, 55, 55, 55, 60];
    const stationMap = [0, 0, 1, 1, 2, 2, 3, 3, 3, 4, 4, 4];
    const targetActives = [4, 6, 8, 10, 11, 13, 15, 17, 19, 21, 23, 5];
    const maxActives = [7, 10, 14, 17, 19, 22, 24, 26, 28, 30, 32, 8];
    // Controlled spawn cadence keeps total wave kills in ~25..120 (eliminating infinite-money runaway while avoiding idle time).
    const intervals = [38, 33, 30, 27, 26, 24, 23, 22, 20, 19, 18, 72];
    return durations.map((durationSeconds, i) => ({
        wave: i + 1,
        stationIndex: stationMap[i],
        durationSeconds,
        targetActive: targetActives[i] + (i >= 2 ? chapterIndex : 0),
        maxActive: maxActives[i] + (i >= 2 ? chapterIndex * 2 : 0),
        spawnIntervalTicks: Math.max(14, intervals[i] - (i >= 3 ? chapterIndex : 0)),
        roster: rosters[i],
        eliteWave: i === 4, // Wave 5 mid-run elite check!
        bossWave: i === 11, // Wave 12 chapter Boss!
        hint: hints[i],
    }));
}

const r = (kind: RegularEnemyId, weight: number) => ({ kind, weight });

export const CHAPTER_CATALOG: readonly ChapterDefinition[] = [
    {
        id: '01', index: 0, title: '先把江岸点亮', routeName: '江岸供电线', enemyScale: 1.0,
        midBossKind: 'supervisor', midBossName: '分站主管',
        bossKind: 'gatekeeper', bossName: '并联守门机',
        stations: [
            { id: '01', name: '配电站', arena: 'yard', waves: [1, 2], arriveRadio: '阿阮：二楼那户问是不是跳闸。我一看，对面也黑了。' },
            { id: '02', name: '地下泵房', arena: 'pump-floor', waves: [3, 4], arriveRadio: '阿阮：泵房的人说先黑的灯，后停的泵。两边钟对不上。' },
            { id: '03', name: '调度分站', arena: 'stage-03', waves: [5, 6], arriveRadio: '阿阮：分站原单右下角有地址，我去查是谁发的。' },
            { id: '04', name: '高架馈线', arena: 'stage-04', waves: [7, 9], arriveRadio: '阿阮：桥下早没电了。高架上那只表还在走。' },
            { id: '05', name: '分区变电所', arena: 'stage-05', waves: [10, 12], arriveRadio: '阿阮：江岸的闸能单独合。楼下的人我先劝开了。' },
        ],
        waves: makeChapterWaves(0, [
            [r('crawler', 8), r('charger', 2)],
            [r('crawler', 6), r('charger', 3), r('turret', 1)],
            [r('crawler', 5), r('charger', 3), r('turret', 2)],
            [r('crawler', 4), r('charger', 2), r('turret', 2), r('armored', 2)],
            [r('crawler', 5), r('armored', 3), r('turret', 2)], // W5 Mid-Boss: Supervisor
            [r('crawler', 5), r('charger', 2), r('pursuer', 3)],
            [r('crawler', 4), r('pursuer', 3), r('turret', 2), r('armored', 1)],
            [r('crawler', 4), r('pursuer', 3), r('charger', 2), r('armored', 2)],
            [r('crawler', 3), r('pursuer', 3), r('turret', 2), r('armored', 2)],
            [r('crawler', 3), r('armored', 3), r('turret', 2), r('charger', 2)],
            [r('crawler', 3), r('armored', 3), r('pursuer', 2), r('turret', 2)],
            [r('crawler', 6), r('charger', 2)], // W12 Boss: Gatekeeper
        ], [
            '爬行机很慢。边走边把零件吸起来。',
            '冲车瞄准时会拉出直线，横着躲开。',
            '炮台拉直线瞄准，绕开它的线再打。',
            '护甲机正面硬，绕到侧面再打。',
            '主管扫一条红道，扫完再贴上去。',
            '追击机直着跑会加速，拐个弯甩开它。',
            '别和追击机比直线，拐弯它才慢。',
            '冲车和追击一起上，别退到墙边。',
            '炮台在后排。先留一条能靠近的路。',
            '护甲挡在炮台前，从侧面绕过去。',
            '守门机下一波才到。这波先把路清开。',
            '守门机红道更宽，扫完再贴上去。',
        ]),
    },
    {
        id: '02', index: 1, title: '抢出救命电', routeName: '救援货运线', enemyScale: 1.32,
        midBossKind: 'elite', midBossName: '制冷护卫',
        bossKind: 'tow', bossName: '拖拽回收车',
        stations: [
            { id: '06', name: '接驳仓', arena: 'stage-06', waves: [1, 2], arriveRadio: '阿阮：车早就装好了。库管看见回收章，钥匙没敢给。' },
            { id: '07', name: '冷链库', arena: 'stage-07', waves: [3, 4], arriveRadio: '阿阮：医院原先排第三。冷库里刚换上来一张新单。' },
            { id: '08', name: '物资分拣带', arena: 'stage-08', waves: [5, 6], arriveRadio: '陈栖：改签单上是我的字。你清路，我问是谁改的。' },
            { id: '09', name: '货梯井', arena: 'stage-09', waves: [7, 9], arriveRadio: '陈栖：强切图纸在货梯顶。你清完这层，我上去取。' },
            { id: '10', name: '封锁货场', arena: 'stage-10', waves: [10, 12], arriveRadio: '阿阮：司机在北门。拖车刚把他又赶了回去。' },
        ],
        waves: makeChapterWaves(1, [
            [r('crawler', 7), r('reclaimer', 2), r('charger', 1)],
            [r('crawler', 5), r('reclaimer', 3), r('charger', 2)],
            [r('crawler', 5), r('charger', 3), r('pursuer', 2)],
            [r('crawler', 4), r('reclaimer', 2), r('turret', 2), r('armored', 2)],
            [r('crawler', 4), r('reclaimer', 3), r('charger', 3)], // W5 Mid-Boss
            [r('crawler', 5), r('pursuer', 3), r('turret', 2)],
            [r('crawler', 4), r('reclaimer', 3), r('turret', 2), r('pursuer', 1)],
            [r('crawler', 3), r('reclaimer', 3), r('armored', 2), r('charger', 2)],
            [r('crawler', 3), r('reclaimer', 3), r('turret', 2), r('armored', 2)],
            [r('crawler', 3), r('reclaimer', 3), r('pursuer', 2), r('armored', 2)],
            [r('crawler', 2), r('reclaimer', 3), r('armored', 2), r('turret', 2), r('charger', 1)],
            [r('crawler', 5), r('reclaimer', 2)], // W12 Boss: Tow
        ], [
            '绞盘一亮就横移，别吃到钢缆。',
            '钢缆和冲车别待在同一条线上。',
            '冲车从一侧穿过来，追击机跟在后面。',
            '炮台在后排点名，换个位置再吃弹。',
            '制冷护卫扫红道，扫完那下再贴。',
            '追击机和炮台分开站，别站成一条线。',
            '两台回收机时，先躲开近的那根缆。',
            '护甲在前、回收在侧，先处理钢缆。',
            '这波更密。别站着跟它们换血。',
            '先处理盯人的炮台，再去解钢缆。',
            '北门的拖车下一波就到。',
            '绞盘亮起就横闪，收绳时再贴上去。',
        ]),
    },
    {
        id: '03', index: 2, title: '喊醒黑夜', routeName: '站台广播线', enemyScale: 1.7,
        midBossKind: 'elite', midBossName: '站台守卫',
        bossKind: 'silence', bossName: '静默阵列',
        stations: [
            { id: '11', name: '信号维护口', arena: 'stage-11', waves: [1, 2], arriveRadio: '阿阮：金圈是预警。紫圈里攻速变慢，电弧也不连跳。' },
            { id: '12', name: '停驶站台', arena: 'stage-12', waves: [3, 4], arriveRadio: '阿阮：拉出红线就是要刺了。看见就侧着走开。' },
            { id: '13', name: '中继机房', arena: 'stage-13', waves: [5, 6], arriveRadio: '陈栖：日志副本在这间机房。守卫挡着柜，我来对时间。' },
            { id: '14', name: '档案夹层', arena: 'stage-14', waves: [7, 9], arriveRadio: '陈栖：我摁过三次撤回。回执栏全是拒绝。' },
            { id: '15', name: '广播主塔', arena: 'stage-15', waves: [10, 12], arriveRadio: '阿阮：塔一通，我先念四号楼的地址。上面是静默阵列。' },
        ],
        waves: makeChapterWaves(2, [
            [r('crawler', 6), r('jammer', 3), r('pursuer', 1)],
            [r('crawler', 5), r('jammer', 3), r('ambusher', 2)],
            [r('crawler', 4), r('ambusher', 3), r('pursuer', 2), r('charger', 1)],
            [r('crawler', 4), r('jammer', 2), r('ambusher', 2), r('turret', 2)],
            [r('crawler', 4), r('jammer', 3), r('ambusher', 3)], // W5 Mid-Boss
            [r('crawler', 5), r('pursuer', 3), r('ambusher', 2)],
            [r('crawler', 3), r('jammer', 3), r('armored', 2), r('turret', 2)],
            [r('crawler', 3), r('ambusher', 3), r('pursuer', 2), r('armored', 2)],
            [r('crawler', 3), r('jammer', 2), r('ambusher', 2), r('turret', 2), r('armored', 1)],
            [r('crawler', 2), r('jammer', 3), r('ambusher', 2), r('pursuer', 2), r('armored', 1)],
            [r('crawler', 2), r('jammer', 2), r('ambusher', 2), r('armored', 2), r('turret', 2)],
            [r('crawler', 5), r('jammer', 2)], // W12 Boss: Silence Array
        ], [
            '金圈是预警。紫圈里变慢，电弧不跳。',
            '拉出红线就侧开，别吃那一刺。',
            '红线和追击会一起来，脚先别停。',
            '先离开紫圈，再去躲炮台的线。',
            '站台守卫扫红道，躲开再贴上去。',
            '追击机还在，红线出来就侧开。',
            '护甲给干扰机挡着，先离开紫圈。',
            '好几台一起拉红线，看脚边再挪。',
            '压力上来了。紫圈里电弧不会跳。',
            '先打干扰机，攻速和电弧才回来。',
            '静默阵列在下一波。这波先离开紫圈。',
            '静默阵列扫扇面，走出红区再打。',
        ]),
    },
    {
        id: '04', index: 3, title: '把灯抢回来', routeName: '本地接管线', enemyScale: 2.15,
        midBossKind: 'elite', midBossName: '回路封锁机',
        bossKind: 'core', bossName: '调度核心',
        stations: [
            { id: '16', name: '回路入口', arena: 'stage-16', waves: [1, 2], arriveRadio: '陈栖：两份都签了。手动开关在入口的柜子旁。' },
            { id: '17', name: '交叉开关层', arena: 'stage-17', waves: [3, 4], arriveRadio: '阿阮：备用电池到路口了。回收机还认原来的货签。' },
            { id: '18', name: '旁路引擎室', arena: 'stage-18', waves: [5, 6], arriveRadio: '陈栖：转速又下来了。我守引擎，封锁机你来拆。' },
            { id: '19', name: '接管前厅', arena: 'stage-19', waves: [7, 9], arriveRadio: '阿阮：两份签字都在我兜里。过了前厅就是调度台。' },
            { id: '20', name: '中央调度台', arena: 'stage-20', waves: [10, 12], arriveRadio: '阿阮：各站都回话了，四号楼也在电话上。你动手，我听着。' },
        ],
        waves: makeChapterWaves(3, [
            [r('crawler', 5), r('charger', 3), r('pursuer', 2)],
            [r('crawler', 4), r('reclaimer', 2), r('jammer', 2), r('charger', 2)],
            [r('crawler', 4), r('reclaimer', 2), r('ambusher', 2), r('turret', 2)],
            [r('crawler', 3), r('armored', 2), r('jammer', 2), r('turret', 2), r('reclaimer', 1)],
            [r('crawler', 3), r('armored', 3), r('reclaimer', 2), r('jammer', 2)], // W5 Mid-Boss
            [r('crawler', 4), r('pursuer', 3), r('ambusher', 2), r('charger', 1)],
            [r('crawler', 3), r('reclaimer', 2), r('jammer', 2), r('ambusher', 2), r('armored', 1)],
            [r('crawler', 3), r('armored', 2), r('turret', 2), r('pursuer', 2), r('reclaimer', 1)],
            [r('crawler', 2), r('armored', 2), r('jammer', 2), r('ambusher', 2), r('turret', 2)],
            [r('crawler', 2), r('reclaimer', 2), r('jammer', 2), r('armored', 2), r('pursuer', 2)],
            [r('crawler', 2), r('armored', 2), r('reclaimer', 2), r('jammer', 2), r('ambusher', 1), r('turret', 1)],
            [r('crawler', 4), r('jammer', 1), r('charger', 1)], // W12 Boss: Core
        ], [
            '冲车和追击一起上，别站成一条线。',
            '先离开紫圈，再横着躲开钢缆。',
            '红线混在弹里。看见线就侧开。',
            '护甲挡在炮台前，从另一侧绕。',
            '封锁机扫红道，扫完再靠近。',
            '追击机还在加速，拐弯再回头打。',
            '钢缆、紫圈、红线会叠在一起。',
            '炮台和冲车换着来，别贴着墙。',
            '先离开紫圈，电弧才会继续跳。',
            '干扰机还在。离开紫圈再往前厅走。',
            '调度核心下一波就到。',
            '核心换着封路，停手时外壳敞开。',
        ]),
    },
];

export function getChapter(id: ChapterDefinition['id']): ChapterDefinition {
    return CHAPTER_CATALOG.find(c => c.id === id) ?? CHAPTER_CATALOG[0];
}
