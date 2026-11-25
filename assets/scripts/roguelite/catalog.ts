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
        roleText: '正反手宽幅挥扫，自带导电触点',
        tiers: [
            { damage: 18, cooldownTicks: 18, critMult: 1.75, reach: 64, price: 20 },
            { damage: 26, cooldownTicks: 16, critMult: 1.85, reach: 68, price: 40 },
            { damage: 37, cooldownTicks: 15, critMult: 2.0, reach: 74, price: 78, perkText: '回扫飞轮：扫中 2 台后下次大回扫 +35% 伤' },
            { damage: 52, cooldownTicks: 13, critMult: 2.2, reach: 82, price: 148, perkText: '大回扫附带跨目标强电弧链跳' },
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
        roleText: '钩扫与重压交替，第 4 击重锤爆发',
        tiers: [
            { damage: 20, cooldownTicks: 19, critMult: 2.0, reach: 60, price: 22 },
            { damage: 29, cooldownTicks: 17, critMult: 2.15, reach: 64, price: 44 },
            { damage: 42, cooldownTicks: 16, critMult: 2.3, reach: 68, price: 84, perkText: '第 4 击重锤倍率提至 ×2.2 且必暴击' },
            { damage: 60, cooldownTicks: 14, critMult: 2.5, reach: 74, price: 158, perkText: '第 4 击震裂地面，附带小范围冲击波' },
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
        roleText: '中距放电连跳，专治抱团小怪',
        tiers: [
            { damage: 14, cooldownTicks: 22, critMult: 1.75, reach: 132, price: 22, hops: 2 },
            { damage: 20, cooldownTicks: 20, critMult: 1.85, reach: 140, price: 44, hops: 3 },
            { damage: 29, cooldownTicks: 18, critMult: 2.0, reach: 150, price: 82, hops: 4, perkText: '跨弧接头：连跳不衰减且附带感电易伤' },
            { damage: 41, cooldownTicks: 16, critMult: 2.15, reach: 162, price: 154, hops: 5, perkText: '双股青紫高压闪电同步连跳' },
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
        roleText: '长射程直线贯穿，清纵列好手',
        tiers: [
            { damage: 15, cooldownTicks: 20, critMult: 1.9, reach: 185, price: 20, pierce: 2 },
            { damage: 22, cooldownTicks: 18, critMult: 2.05, reach: 195, price: 40, pierce: 3 },
            { damage: 31, cooldownTicks: 16, critMult: 2.2, reach: 205, price: 78, pierce: 4, perkText: '贯穿钉组：每多穿 1 台额外增伤 12%' },
            { damage: 44, cooldownTicks: 14, critMult: 2.4, reach: 220, price: 146, pierce: 6, perkText: '螺旋膛线：弹道加宽并附带击退' },
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
        roleText: '重击破甲，专克护甲机和首领',
        tiers: [
            { damage: 30, cooldownTicks: 33, critMult: 2.2, reach: 162, price: 24, pierce: 1 },
            { damage: 43, cooldownTicks: 30, critMult: 2.35, reach: 170, price: 48, pierce: 2 },
            { damage: 60, cooldownTicks: 27, critMult: 2.5, reach: 180, price: 90, pierce: 3, perkText: '双排入钉座：弹道加宽且无视正面护甲' },
            { damage: 84, cooldownTicks: 24, critMult: 2.75, reach: 192, price: 168, pierce: 4, perkText: '暴击引爆钉头，对目标额外造成 25% 震伤' },
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
        roleText: '高频扇面火舌，持续叠烧灼',
        tiers: [
            { damage: 9, cooldownTicks: 12, critMult: 1.5, reach: 92, price: 21 },
            { damage: 13, cooldownTicks: 11, critMult: 1.6, reach: 98, price: 42 },
            { damage: 19, cooldownTicks: 10, critMult: 1.75, reach: 106, price: 80, perkText: '高温蓝白焰：连喷第 4 击起伤害 +40%' },
            { damage: 27, cooldownTicks: 9, critMult: 1.9, reach: 114, price: 150, perkText: '烈焰过载：燃烧伤害翻倍并向周围溅火' },
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
        roleText: '扇面冲击波，推开贴脸怪潮并挂易伤',
        tiers: [
            { damage: 15, cooldownTicks: 24, critMult: 1.75, reach: 88, price: 21 },
            { damage: 22, cooldownTicks: 22, critMult: 1.85, reach: 94, price: 42 },
            { damage: 31, cooldownTicks: 20, critMult: 2.0, reach: 102, price: 80, perkText: '强排导板：推开距离翻倍，被推敌机易伤 +20%' },
            { damage: 44, cooldownTicks: 18, critMult: 2.15, reach: 112, price: 150, perkText: '四层脉冲箭脊，命中直接点燃目标' },
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
        roleText: '360° 全周放电脉冲，清近身包围网',
        tiers: [
            { damage: 18, cooldownTicks: 25, critMult: 1.75, reach: 78, price: 22 },
            { damage: 26, cooldownTicks: 23, critMult: 1.85, reach: 86, price: 44 },
            { damage: 37, cooldownTicks: 20, critMult: 2.0, reach: 96, price: 84, perkText: '叠层感应盘：三层电环，命中减速 25%' },
            { damage: 52, cooldownTicks: 18, critMult: 2.15, reach: 108, price: 156, perkText: '放电同时向最远敌机拉出一道高压弧' },
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
        roleText: '拉近敌机聚怪并上易伤，喂给近战和火枪',
        tiers: [
            { damage: 14, cooldownTicks: 26, critMult: 1.75, reach: 112, price: 20, extraTargets: 2 },
            { damage: 20, cooldownTicks: 24, critMult: 1.85, reach: 122, price: 40, extraTargets: 3 },
            { damage: 28, cooldownTicks: 21, critMult: 2.0, reach: 134, price: 78, extraTargets: 4, perkText: '重载吸盘：双索聚怪，被拉敌机易伤 +25%' },
            { damage: 40, cooldownTicks: 19, critMult: 2.15, reach: 146, price: 146, extraTargets: 5, perkText: '六臂涡纹聚怪，拉扯结束触发范围震伤' },
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
        roleText: '同时锁多台目标齐射，清散兵和远炮',
        tiers: [
            { damage: 13, cooldownTicks: 22, critMult: 2.0, reach: 150, price: 22, extraTargets: 2 },
            { damage: 19, cooldownTicks: 20, critMult: 2.15, reach: 160, price: 44, extraTargets: 3 },
            { damage: 27, cooldownTicks: 18, critMult: 2.3, reach: 170, price: 84, extraTargets: 4, perkText: '四路分配器：薄荷光束，暴击触发分叉溅射' },
            { damage: 38, cooldownTicks: 16, critMult: 2.5, reach: 182, price: 158, extraTargets: 5, perkText: '五束锁定，仅剩单目标时改为双束齐轰' },
        ],
        tier3Unlock: '四路分配器',
        tier4Unlock: '集束齐射',
    },
};

export const ALL_TOOL_IDS = Object.keys(WEAPON_CATALOG) as ToolId[];

export const SYNERGY_TABLE: Readonly<Record<WeaponTag, readonly [SynergyTierBonus, SynergyTierBonus, SynergyTierBonus]>> = {
    melee: [
        { count: 2, stats: { armor: 2, torque: 3 }, summary: '护甲 +2，物理伤害 +3，近战范围 +12%' },
        { count: 4, stats: { armor: 5, torque: 7, maxHp: 8 }, summary: '护甲 +5，物理伤害 +7，近战范围 +22%' },
        { count: 6, stats: { armor: 8, torque: 12, maxHp: 16 }, summary: '护甲 +8，100% 护甲转化为物理伤害，范围 +32%' },
    ],
    arc: [
        { count: 2, stats: { voltage: 3, cycleSpeed: 6 }, summary: '电火伤害 +3，电弧连跳 +1（含近战）' },
        { count: 4, stats: { voltage: 7, cycleSpeed: 12 }, summary: '电火伤害 +7，连跳 +2，感电敌机易伤 +12%' },
        { count: 6, stats: { voltage: 13, cycleSpeed: 20 }, summary: '电火伤害 +13，连跳 +3，感电击杀炸电花' },
    ],
    ballistic: [
        { count: 2, stats: { critChance: 8, torque: 3 }, summary: '暴击率 +8%，对护甲正面多打 15%' },
        { count: 4, stats: { critChance: 16, torque: 6, overclock: 10 }, summary: '暴击率 +16%，穿透 +1，全队增伤 +10%' },
        { count: 6, stats: { critChance: 25, torque: 11, overclock: 20 }, summary: '暴击率 +25%，穿透 +2，暴击无视正面护甲' },
    ],
    thermal: [
        { count: 2, stats: { voltage: 3, overclock: 6 }, summary: '电火伤害 +3，攻击附加灼烧持续掉血' },
        { count: 4, stats: { voltage: 7, overclock: 14 }, summary: '电火伤害 +7，灼烧叠层且热能爆发 +25%' },
        { count: 6, stats: { voltage: 12, overclock: 24, cycleSpeed: 15 }, summary: '过载引发全周热浪爆震，攻速 +15%' },
    ],
    control: [
        { count: 2, stats: { pickupRadius: 15, repair: 2 }, summary: '控场范围 +15%，被推拉敌机易伤 +15%' },
        { count: 4, stats: { pickupRadius: 28, repair: 4, armor: 2 }, summary: '控场范围 +28%，被推拉敌机易伤 +28%' },
        { count: 6, stats: { pickupRadius: 42, repair: 7, armor: 4 }, summary: '控场每中 3 台自动放一圈免费磁脉冲' },
    ],
};

// 32 shared workshop modules with crisp trade-offs and tag weights (replaces 52 isolated single-weapon parts).
export const MODULE_CATALOG: readonly ModuleSpec[] = [
    // Tier I (base price 16-24)
    { id: 'copper_knuckle', name: '黄铜配重块', tier: 1, price: 18, tags: ['melee'], stats: { torque: 3, moveSpeed: -2 }, flavor: '绑在工具臂上沉甸甸的，抡起来很解气。' },
    { id: 'spare_coil', name: '拆机铜线圈', tier: 1, price: 18, tags: ['arc', 'thermal'], stats: { voltage: 3, armor: -1 }, flavor: '从旧变压器抠出来的，电流窜得欢。' },
    { id: 'light_bearing', name: '轻油滚珠轴承', tier: 1, price: 17, tags: ['melee', 'control'], stats: { moveSpeed: 7, cycleSpeed: 4 }, flavor: '抹了二两机油，脚底和工具都溜得飞快。' },
    { id: 'scrap_magnet', name: '废料吸铁环', tier: 1, price: 16, tags: ['control'], stats: { pickupRadius: 28, salvage: 4 }, flavor: '隔半条街就能把螺丝全吸进兜。' },
    { id: 'steel_apron', name: '厚帆布护胸', tier: 1, price: 18, tags: ['melee'], stats: { maxHp: 8, armor: 1 }, flavor: '老电工传下来的，挡飞溅焊渣一绝。' },
    { id: 'caffeine_thermos', name: '浓茶保温杯', tier: 1, price: 17, tags: ['control'], stats: { repair: 3, maxHp: 4 }, flavor: '阿阮给泡的浓普洱，喝一口立马清醒。' },
    { id: 'optic_loupe', name: '检修放大镜', tier: 1, price: 19, tags: ['ballistic'], stats: { critChance: 6, luck: 4 }, flavor: '专看铁皮焊缝，一钉子扎进软肋。' },
    { id: 'overtime_voucher', name: '废铜回收袋', tier: 1, price: 18, tags: ['control'], stats: { salvage: 7, overclock: -3 }, flavor: '前期多攒点家底，后面翻箱不心疼。' },
    { id: 'stripped_motor', name: '拆壳快转电机', tier: 1, price: 20, tags: ['ballistic', 'arc'], stats: { cycleSpeed: 10, maxHp: -4 }, flavor: '把保护壳卸了散热，转得飞快就是脆点。' },
    { id: 'insulating_boots', name: '厚底绝缘胶靴', tier: 1, price: 19, tags: ['arc', 'melee'], stats: { armor: 2, moveSpeed: 4, pickupRadius: -8 }, flavor: '踩进水洼都不怕漏电，跑路也踏实。' },
    { id: 'flint_nozzle', name: '压电打火嘴', tier: 1, price: 19, tags: ['thermal'], stats: { voltage: 2, overclock: 6, critChance: -2 }, flavor: '按一下就冒火星，管它准不准先点着。' },
    { id: 'lucky_fuse', name: '红头保险丝', tier: 1, price: 18, tags: ['arc'], stats: { luck: 10, cycleSpeed: 4 }, flavor: '据老周说塞兜里能少遇翻车局。' },

    // Tier II (base price 32-44)
    { id: 'heavy_flywheel', name: '重型配重飞轮', tier: 2, price: 36, tags: ['melee'], stats: { torque: 6, overclock: 8, moveSpeed: -5 }, flavor: '转起来收不住手，但砸上去真是实打实。' },
    { id: 'step_up_cap', name: '升压大电容', tier: 2, price: 36, tags: ['arc'], stats: { voltage: 6, cycleSpeed: 10, armor: -2 }, flavor: '滋滋响得吓人，电弧直接蹿出两米远。' },
    { id: 'tungsten_pin', name: '钨钢穿甲针', tier: 2, price: 38, tags: ['ballistic'], stats: { critChance: 11, torque: 4, repair: -1 }, flavor: '打护甲机像扎纸壳，全靠手稳。' },
    { id: 'propane_booster', name: '增压气罐', tier: 2, price: 37, tags: ['thermal'], stats: { overclock: 14, voltage: 4, maxHp: -6 }, flavor: '背在后腰随时冒热气，火力猛得离谱。' },
    { id: 'composite_plate', name: '检修防爆板', tier: 2, price: 35, tags: ['melee', 'control'], stats: { armor: 4, maxHp: 10, cycleSpeed: -4 }, flavor: '拆的报废配电柜门，扛冲车不带晃的。' },
    { id: 'auto_solder', name: '自动补焊机', tier: 2, price: 34, tags: ['control', 'thermal'], stats: { repair: 5, armor: 1, moveSpeed: -3 }, flavor: '破口子边跑边焊，就是背着有点沉。' },
    { id: 'coupon_pass', name: '内部调拨单', tier: 2, price: 36, tags: ['control'], stats: { salvage: 5 }, special: 'shop_discount', flavor: '陈栖偷偷盖过章，商店全品打 9 折。' },
    { id: 'spare_crate_key', name: '万能工具箱钥匙', tier: 2, price: 35, tags: ['control'], stats: { luck: 6 }, special: 'free_reroll', flavor: '每进一次整备台，免费多翻一箱货。' },
    { id: 'vampire_clamp', name: '回流充电夹', tier: 2, price: 38, tags: ['ballistic', 'melee'], stats: { critChance: 7 }, special: 'crit_heal', flavor: '打出暴击顺手抽一格电给自己回血。' },
    { id: 'scrap_sieve', name: '磁选双倍筛', tier: 2, price: 34, tags: ['control'], stats: { pickupRadius: 20, luck: 5 }, special: 'double_parts', flavor: '捡零件有 20% 机会多抠出一块完好的。' },

    // Tier III (base price 56-72)
    { id: 'overclock_core', name: '三倍频超频盒', tier: 3, price: 62, tags: ['arc', 'ballistic'], stats: { overclock: 22, cycleSpeed: 14, armor: -3 }, flavor: '散热风扇直接啸叫，输出拉爆，别被摸到。' },
    { id: 'hydraulic_exoskeleton', name: '旧款助力外骨骼', tier: 3, price: 64, tags: ['melee'], stats: { torque: 11, maxHp: 16, armor: 3, moveSpeed: -6 }, flavor: '码头退下来的老伙计，穿上去像辆小推土机。' },
    { id: 'tesla_manifold', name: '高压分流母排', tier: 3, price: 64, tags: ['arc'], stats: { voltage: 11, cycleSpeed: 10 }, special: 'arc_shock', flavor: '电弧炸开时再崩一圈电火花，群怪最怕这个。' },
    { id: 'thermite_valve', name: '铝热增压阀', tier: 3, price: 62, tags: ['thermal'], stats: { voltage: 8, overclock: 18, repair: -2 }, special: 'burn_spread', flavor: '点着一台就烧成一片，火光能把整条街照亮。' },
    { id: 'ballistic_computer', name: '老式弹道算盘', tier: 3, price: 64, tags: ['ballistic'], stats: { critChance: 16, overclock: 14, pickupRadius: -15 }, flavor: '算得极刁钻，几乎枪枪往接缝里钻。' },
    { id: 'reactive_shield', name: '反震装甲壳', tier: 3, price: 60, tags: ['melee', 'control'], stats: { armor: 6, maxHp: 14 }, special: 'armor_thorns', flavor: '谁敢撞过来，顺手反震它一身电渣。' },
    { id: 'bait_beacon', name: '过载诱饵灯', tier: 3, price: 58, tags: ['control'], stats: { salvage: 14, luck: 12, overclock: 10 }, special: 'extra_enemies', flavor: '把整条街的铁疙瘩全引过来——怪多钱也多！' },

    // Tier IV (base price 92-112, rare build-defining capstones)
    { id: 'zero_line_tap', name: '零号线盗电钳', tier: 4, price: 98, tags: ['arc', 'thermal'], stats: { overclock: 32, voltage: 16, cycleSpeed: 18, maxHp: -12 }, unique: true, flavor: '直接从零号主干偷电，火力疯了，拿命换的。' },
    { id: 'master_wrench_rig', name: '总工六臂增压架', tier: 4, price: 102, tags: ['melee', 'ballistic'], stats: { torque: 18, critChance: 18, armor: 5, cycleSpeed: 12 }, unique: true, flavor: '老师傅退休前攒的压箱底，装上才叫完全体。' },
    { id: 'emergency_generator', name: '便携急救发电机', tier: 4, price: 94, tags: ['control'], stats: { maxHp: 28, armor: 7, repair: 10, salvage: 12 }, unique: true, flavor: '只要这台机器还嗡嗡转着，今晚就绝不倒下。' },
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
        summary: '老电工万能配置，攻防均衡、每波零件与幸运俱佳，啥流派都能平滑转。',
        tradeoff: '无极端偏科，靠稳扎稳打运营成型。',
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
        summary: '全队武器计入电弧羁绊且额外连跳，电火伤害与攻速天生拉满。',
        tradeoff: '禁用弹道枪械，身板脆 12 血，全靠走位和电网清场。',
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
        summary: '开局硬朗，每点护甲直接加 1 点物理伤害，越肉挥得越狠。',
        tradeoff: '禁用远程弹道武器且移速 −6%，必须贴身肉搏。',
    },
    thermal_welder: {
        id: 'thermal_welder',
        name: '热能焊工',
        title: '烧灼爆燃',
        starterWeapon: 'torch',
        stats: { voltage: 5, overclock: 15, cycleSpeed: 10, armor: -3, repair: 2 },
        wantedTags: ['thermal', 'control'],
        summary: '喷火开局，灼烧伤害 +50%、火势凶猛，越打越热。',
        tradeoff: '开局护甲 −3，贴脸烤怪时千万别贪走位。',
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
        summary: '商店全品 85 折，漏捡零件 100% 进滞留袋，怪多 25% 钱多赚到飞起。',
        tradeoff: '基础增伤 −6% 且怪潮更密，撑过前 3 波就是富豪局。',
    },
};

export const WORKSHOP_TALENTS: readonly WorkshopTalentSpec[] = [
    { id: 'chassis', name: '强化工装衬垫', maxRank: 5, baseCost: 10, costGrowth: 1.4, detail: r => `全员生命上限 +${r * 4}，护甲 +${Math.floor(r / 2)}` },
    { id: 'capacitor', name: '全臂并联总线', maxRank: 5, baseCost: 12, costGrowth: 1.4, detail: r => `全部 6 槽武器总伤害 +${r * 4}%，攻速 +${r * 3}%` },
    { id: 'toolbox', name: '翻箱熟手', maxRank: 3, baseCost: 14, costGrowth: 1.5, detail: r => `每次进店赠送 ${r} 次免费翻箱，不跨波累计` },
    { id: 'magnet_bag', name: '加厚零件滞留袋', maxRank: 4, baseCost: 10, costGrowth: 1.35, detail: r => `漏捡零件滞留保存率提至 ${Math.min(100, 75 + r * 6)}%，吸件 +${r * 8}%` },
    { id: 'shop_permit', name: '货架锁定许可', maxRank: 2, baseCost: 8, costGrowth: 1.5, detail: r => `同时锁定商店中最多 ${r + 1} 件商品，冻价跨波` },
    { id: 'ban_permit', name: '废件黑名单', maxRank: 3, baseCost: 12, costGrowth: 1.45, detail: r => `出勤前可禁用 ${r * 2} 件模块，防止稀释卡池` },
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
            { id: '01', name: '配电站', arena: 'yard', waves: [1, 2], arriveRadio: '阿阮：先清了配电站门口这批小爬虫，攒钱赶紧多买两把家伙！' },
            { id: '02', name: '地下泵房', arena: 'pump-floor', waves: [3, 4], arriveRadio: '阿阮：进泵房了！冲车和炮台混着来，别站在一条直线上！' },
            { id: '03', name: '调度分站', arena: 'stage-03', waves: [5, 6], arriveRadio: '阿阮：分站主管堵在门口！砸烂它就能摸到高架总表！' },
            { id: '04', name: '高架馈线', arena: 'stage-04', waves: [7, 9], arriveRadio: '阿阮：高架上追击机跑得飞快，拐急弯甩开它再反打！' },
            { id: '05', name: '分区变电所', arena: 'stage-05', waves: [10, 12], arriveRadio: '阿阮：最后一座变电所！砸碎守门机，江岸就能重新亮灯！' },
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
            '热身一波，边走边吸零件，收工就买新武器！',
            '冲车亮红灯就横着闪，别跟铁疙瘩拼头铁。',
            '后排炮台会拉直线瞄准，绕个小圈就能躲。',
            '护甲机正面很硬，要么绕背，要么上穿甲钉枪。',
            '中段硬仗！分站主管进场，躲完红线贴脸猛砸！',
            '刚打完精英，趁装备刚起飞爽快收割一波！',
            '追击机走直线会加速，一个急转弯就能甩掉它。',
            '冲车配追击，别被逼进角落，留出折返空间。',
            '火力开始加密，防装和续航该补就补！',
            '护甲带炮台压过来了，优先点杀后排或拉群清场。',
            '变电所最后防线，顶住这波就去拆守门机！',
            '并联守门机上场！躲开红道，扫空那两秒最脆！',
        ]),
    },
    {
        id: '02', index: 1, title: '抢出救命电', routeName: '救援货运线', enemyScale: 1.32,
        midBossKind: 'elite', midBossName: '制冷护卫',
        bossKind: 'tow', bossName: '拖拽回收车',
        stations: [
            { id: '06', name: '接驳仓', arena: 'stage-06', waves: [1, 2], arriveRadio: '阿阮：接驳仓里全是拉钢缆的回收机，别被钩子拖进怪堆！' },
            { id: '07', name: '冷链库', arena: 'stage-07', waves: [3, 4], arriveRadio: '阿阮：冷链库滑得很，冲车配追击，盯紧落脚点！' },
            { id: '08', name: '物资分拣带', arena: 'stage-08', waves: [5, 6], arriveRadio: '陈栖：图纸藏在货梯顶上！先砸掉挡路的制冷护卫！' },
            { id: '09', name: '货梯井', arena: 'stage-09', waves: [7, 9], arriveRadio: '陈栖：货梯口两头都在刷怪，先撕开一边缺口别被包饺子！' },
            { id: '10', name: '封锁货场', arena: 'stage-10', waves: [10, 12], arriveRadio: '阿阮：北门就在前头！拆掉那台大拖车，医院就能拿到电池！' },
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
            '回收机绞盘亮红就横移出缆，躲完它有硬直可以反打！',
            '回收机配冲车，千万别被钢缆拽进冲锋路线。',
            '冷链库高机动编队，拐弯绕圈遛着打最省血。',
            '炮台在后排压阵，注意穿插走位别吃满弹。',
            '中段硬仗！制冷护卫压境，留好血量迎接爆发期。',
            '进入爽快收割段，把武器尽量合到 2–3 阶！',
            '回收爪开始成双出现，躲缆优先于贪输出。',
            '护甲顶前排、回收在侧翼，范围清场最解气。',
            '后期张力拉满，检查一下护甲和自修够不够扛。',
            '货场重兵合围，优先拆掉盯人的远程和回收爪。',
            '顶住最后一波混编，北门大拖车马上露头！',
            '拖拽回收车进场！闪开重钢缆，趁它收绳贴脸猛轰！',
        ]),
    },
    {
        id: '03', index: 2, title: '喊醒黑夜', routeName: '站台广播线', enemyScale: 1.7,
        midBossKind: 'elite', midBossName: '站台守卫',
        bossKind: 'silence', bossName: '静默阵列',
        stations: [
            { id: '11', name: '信号维护口', arena: 'stage-11', waves: [1, 2], arriveRadio: '阿阮：干扰机亮紫圈会拖慢你的工具攻速，千万别站紫圈里硬拼！' },
            { id: '12', name: '停驶站台', arena: 'stage-12', waves: [3, 4], arriveRadio: '阿阮：站台黑漆漆的，看见地上的电弧潜行残影就准备侧闪！' },
            { id: '13', name: '中继机房', arena: 'stage-13', waves: [5, 6], arriveRadio: '陈栖：站台守卫挡住了中继机柜，砸开它我就能把日志翻出来！' },
            { id: '14', name: '档案夹层', arena: 'stage-14', waves: [7, 9], arriveRadio: '陈栖：全是被拒的撤单回执……别留手，杀上主塔把话筒抢回来！' },
            { id: '15', name: '广播主塔', arena: 'stage-15', waves: [10, 12], arriveRadio: '阿阮：静默阵列就在塔顶！拆了它，全城都能听见咱的广播！' },
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
            '干扰机展开紫圈会减 35% 攻速并断电弧，立刻拉出圈打它！',
            '埋伏机贴地潜行，闪红光就斜着走开，别吃它那一下重刺！',
            '潜行配追击，保持移动节奏千万别站桩。',
            '干扰加炮台，先脱离紫圈再找掩护角度。',
            '中段硬仗！站台守卫压阵，打出你的核心羁绊！',
            '清场爽感期，把高阶模块和升阶武器凑起来！',
            '护甲机替干扰机撑场，范围伤害或穿刺最管用。',
            '多台埋伏机同时摸近，留意脚底红闪预警！',
            '中继防线压力陡升，补护甲和回血稳住血线。',
            '全员机制怪混编，先拆干扰机恢复全队攻速！',
            '广播主塔最后台阶，撑过这波就砸静音塔！',
            '静默阵列启动！钻进扇面缺口，停火瞬间全火力倾泻！',
        ]),
    },
    {
        id: '04', index: 3, title: '把灯抢回来', routeName: '本地接管线', enemyScale: 2.15,
        midBossKind: 'elite', midBossName: '回路封锁机',
        bossKind: 'core', bossName: '调度核心',
        stations: [
            { id: '16', name: '回路入口', arena: 'stage-16', waves: [1, 2], arriveRadio: '陈栖：前面全是调度台直属安保机，一个比一个硬，打起精神！' },
            { id: '17', name: '交叉开关层', arena: 'stage-17', waves: [3, 4], arriveRadio: '阿阮：回收机和干扰机搅在一块儿了，先断紫圈再躲钢缆！' },
            { id: '18', name: '旁路引擎室', arena: 'stage-18', waves: [5, 6], arriveRadio: '陈栖：我死守引擎不让掉压！封锁机交给你，干翻它！' },
            { id: '19', name: '接管前厅', arena: 'stage-19', waves: [7, 9], arriveRadio: '阿阮：全城老伙计都在开关旁等着呢，穿过前厅就是调度核心！' },
            { id: '20', name: '中央调度台', arena: 'stage-20', waves: [10, 12], arriveRadio: '阿阮：最后一战！砸烂这台黑心铁皮脑子，把灯还给街区！' },
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
            '最终章开局就上强度，前两波赶紧把武器槽填满！',
            '回收加干扰是绝命连招，被拉进紫圈很伤，早点横移！',
            '埋伏机混在弹幕里摸近，走大圈拉扯视野。',
            '重甲护卫阵型，穿甲、电弧和燃烧都能有效撕开口子。',
            '中段硬仗！回路封锁机进场，检验你这套构筑的成色！',
            '顶过中段，趁装备成型狠狠割草攒钱合高阶武器！',
            '全图鉴精英编队来了，保持满状态冲刺终局！',
            '高密度远程加冲锋，护甲和移速此刻值千金。',
            '前厅重压，优先清掉干扰机保证全队最高输出！',
            '距离调度核心一步之遥，最后两店全力追紫金升阶！',
            '终局前最后一波全城警卫，扛过去就拆核心！',
            '调度核心全开！三阶段扇面、钢缆、红道齐发——干碎它下班！',
        ]),
    },
];

export function getChapter(id: ChapterDefinition['id']): ChapterDefinition {
    return CHAPTER_CATALOG.find(c => c.id === id) ?? CHAPTER_CATALOG[0];
}
