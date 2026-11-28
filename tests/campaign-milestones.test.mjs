import assert from 'node:assert/strict';
import test from 'node:test';
import { RogueliteBattle } from '../.m0-build/roguelite/battle.js';
import { CHAPTER_CATALOG } from '../.m0-build/roguelite/catalog.js';
import { MILESTONES, rigRank, WEAPON_MODS, unlockedMods, unlockedWeaponsForProfile } from '../.m0-build/roguelite/progression.js';
import { createDefaultProfile } from '../.m0-build/roguelite/session.js';
import { orderRecoveredWeapon } from '../.m0-build/roguelite/shop.js';

test('每个首通格都有永久玩法，预告、商店、改装和工装阶级一致', () => {
    const keys = new Set();
    const profile = createDefaultProfile();
    for (const [chapter,cells] of Object.entries(MILESTONES)) {
        assert.equal(cells.length,5);
        for (const [difficulty,cell] of cells.entries()) {
            const key = cell.weapon ?? cell.mod;
            assert.ok(key && !keys.has(key)); keys.add(key);
            if (cell.weapon) assert.ok(!unlockedWeaponsForProfile(profile).includes(cell.weapon));
            if (cell.mod) assert.ok(!unlockedMods(profile,WEAPON_MODS[cell.mod][0]).includes(cell.mod));
            profile.maxDangerCleared[chapter] = difficulty;
            if (cell.weapon) assert.ok(unlockedWeaponsForProfile(profile).includes(cell.weapon));
            if (cell.mod) assert.ok(unlockedMods(profile,WEAPON_MODS[cell.mod][0]).includes(cell.mod));
            for (const [rig,rank] of cell.rigs ?? []) assert.equal(rigRank(profile,rig),rank);
        }
    }
    assert.equal(keys.size,20);
    assert.equal(Object.keys(WEAPON_MODS).length,12);
    assert.equal(unlockedWeaponsForProfile(profile).length,15);
});

function encounter(mod,positions) {
    const tool = WEAPON_MODS[mod][0];
    const b = new RogueliteBattle({chapter:CHAPTER_CATALOG[0],waveIndex:0,seed:91,danger:0,rigId:'duty_standard',rigRank:1,
        weapons:[{uid:1,id:tool,tier:2}],weaponMods:{[tool]:mod},startHp:100,level:0,levelStats:{},modules:[],carriedBagParts:0});
    for (const [dx,dy] of positions) b.warnings.push({kind:'crawler', x:b.player.x+dx, y:b.player.y+dy, at:0});
    b.stepSpawner();
    for (const e of b.enemies) Object.assign(e,{hp:2000,maxHp:2000,speed:0});
    const fire = () => { b.tick = Math.max(b.tick,b.runtimes[0].next); b.fireWeapon(b.runtimes[0]); };
    const step = () => { b.tick++; b.stepFieldTools(); };
    return {b,fire,step};
}

for (const mod of ['echo_repeat','echo_twin','rivet_trip','probe_net','stake_link','welder_trail','saw_fork','saw_return']) {
    test('武器改装实际产生对应的持续判定 ' + mod, () => {
        const {b,fire,step} = encounter(mod,[[55,0],[65,16]]);
        if (mod === 'saw_fork') { b.player.x=b.field.right-65; b.enemies[0].x=b.field.right-10; }
        fire();
        const fields = k => b.fieldTools.filter(f=>f.kind===k);
        if (mod === 'echo_repeat' || mod === 'echo_twin') {
            const [a,z] = fields('echo');
            assert.ok(z);
            if (mod === 'echo_repeat') assert.equal(z.born-a.born,10);
            else assert.ok(Math.hypot(a.x-z.x,a.y-z.y)>50);
        }
        if (mod === 'probe_net') assert.equal(fields('cable').length,1);
        if (mod === 'rivet_trip' || mod === 'stake_link') {
            const anchor = {...b.enemies[0]};
            b.enemies[0].y += 32;
            fire();
            const line = fields('cable').at(-1);
            assert.ok(line && line.origin.x===anchor.x && line.origin.y===anchor.y);
        }
        if (mod === 'welder_trail') {
            for (let i=0;i<10;i++) step();
            const trail = fields('scorch').at(-1);
            assert.ok(trail && Math.hypot(trail.x-b.player.x,trail.y-b.player.y)>25);
        }
        if (mod === 'saw_fork' || mod === 'saw_return') {
            for (let i=0;i<20;i++) step();
            assert.ok(fields('disc').some(f=>mod==='saw_fork' ? f.forked : f.returning));
        }
    });
}

test('铆索在墙边钉住敌机，两秒后恢复行动', () => {
    const {b,fire} = encounter('rivet_pin',[[50,0]]);
    const e = b.enemies[0];
    b.player.x=b.field.right-65; e.x=b.field.right-20;
    fire();
    assert.equal(e.pinnedUntil,b.tick+60);
    e.speed=60;
    const before=e.x;
    b.stepEnemies();
    assert.equal(e.x,before);
    b.tick+=61; b.stepEnemies();
    assert.ok(e.x<before);
});

test('抓钩和撬棍沿位移路径撞伤其他敌机，地桩回路只伤三角内目标', () => {
    for (const [mod,force] of [['hook_collision',-35],['pry_collision',35]]) {
        const {b} = encounter(mod,[[65,0],[65+force,0],[60,65]]);
        const [first,near,far]=b.enemies;
        b.collidingDisplacement(first,force,b.runtimes[0],{slot:0,tool:WEAPON_MODS[mod][0],tick:0,ux:1,uy:0,x:b.player.x,y:b.player.y,targetRange:65},true);
        assert.ok(near.hp<2000); assert.equal(far.hp,2000);
    }
    const {b,fire} = encounter('stake_loop',[[36,0],[50,10],[108,50]]);
    const [target,inside,outside] = b.enemies;
    const origin={...b.player};
    for (const [dx,dy] of [[36,0],[63,0],[45,35]]) {
        Object.assign(target,{x:origin.x+dx,y:origin.y+dy});
        Object.assign(b.player,{x:target.x-2,y:target.y});
        fire();
    }
    assert.ok(inside.hp<2000); assert.equal(outside.hp,2000);
});

function rigEncounter(rigId,rigRank,ids) {
    const b = new RogueliteBattle({chapter:CHAPTER_CATALOG[0],waveIndex:0,danger:0,seed:91,rigId,rigRank,
        weapons:ids.map((id,i)=>({uid:i+1,id,tier:2})),startHp:100,level:0,levelStats:{},modules:[],carriedBagParts:0});
    for (const dx of [30,66,170]) b.warnings.push({kind:'crawler',x:b.player.x+dx,y:b.player.y,at:0});
    b.stepSpawner();
    for (const e of b.enemies) Object.assign(e,{hp:5000,maxHp:5000,speed:0});
    return b;
}

test('值班服三系接续、钢衬服正面格挡与贯穿各有阶级门槛', () => {
    for (const rank of [1,2,3,4]) {
        const mixed=rigEncounter('duty_standard',rank,['wrench','arc_gun','torch']);
        const [e,near] = mixed.enemies, start=e.x;
        mixed.mixedFollowup(e,mixed.runtimes[0],40);
        mixed.mixedFollowup(e,mixed.runtimes[0],40);
        assert.equal(e.hp,5000);
        mixed.mixedFollowup(e,mixed.runtimes[1],40);
        assert.equal(e.hp,4982);
        assert.equal(e.x>start,rank>=2);
        mixed.mixedFollowup(e,mixed.runtimes[2],40);
        assert.equal(e.hp,rank>=3?4964:4982);
        assert.equal(near.hp,rank===4?4982:5000);

        const heavy=rigEncounter('heavy_fitter',rank,['wrench']);
        const [target,behind] = heavy.enemies;
        heavy.facing={x:1,y:0};
        for (let i=0;i<3;i++) heavy.strikeEnemy(target,heavy.runtimes[0],heavy.player,1);
        assert.equal(heavy.guardCharge,rank>=2?3:0);
        heavy.hurtPlayer(10,'contact',target);
        assert.equal(heavy.guardCharge,0);
        assert.equal(heavy.counterReady,rank>=3);
        heavy.strikeEnemy(target,heavy.runtimes[0],heavy.player,1);
        assert.equal(behind.hp<5000,rank===4);
    }
});

test('电工标记延伸到远敌，焊工烧毁传播且满阶连接相邻热区', () => {
    for (const rank of [1,2,3,4]) {
        const arc=rigEncounter('high_voltage',rank,['arc_gun']);
        const [first,second,far]=arc.enemies;
        arc.chainArc(first,arc.runtimes[0],2,1);
        assert.equal((second.conductorUntil??0)>0,rank>=2);
        assert.equal(far.hp<5000,rank>=3);
        const thermal=rigEncounter('thermal_welder',rank,['torch']);
        const [hot,neighbour]=thermal.enemies;
        Object.assign(hot,{burnStacks:1,burnDamage:15,burnUntil:90});
        thermal.stepBurnDots(); thermal.tick+=15; thermal.stepBurnDots();
        assert.equal(thermal.fieldTools.some(f=>f.kind==='scorch'),rank>=2);
        assert.equal(thermal.fieldTools.some(f=>f.kind==='cable'),rank===4);
        hot.hp=1; thermal.tick+=15; thermal.stepBurnDots();
        assert.equal(neighbour.burnStacks>0,rank>=3);
    }
});

test('测绘标线以实际穿线与闭环生效，回收工装的额外调货只用一次', () => {
    for (const rank of [1,2,3,4]) {
        const b=rigEncounter('surveyor',rank,['breaker_stake']);
        const {x,y}=b.player;
        const crossed=b.enemies[0],inside=b.enemies[2];
        Object.assign(inside,{x:x+40,y:y+21});
        for (const [dx,dy] of [[0,0],[85,0],[45,90],[0,0]]) {
            Object.assign(b.player,{x:x+dx,y:y+dy}); b.stepSurveyPins();
        }
        assert.ok(crossed.hp<5000); assert.equal(crossed.slowUntil>0,rank>=2);
        assert.equal(inside.hp<5000,rank===4);
    }
    const b=rigEncounter('scrap_auditor',4,['riveter']);
    const shop={rigId:b.rigId,wave:3,level:1,parts:50,modules:[],levelStats:{},weapons:b.runtimes.map(r=>r.instance),
        pendingLevelUps:0,recoveryOrder:true,slots:[{slotIndex:0,kind:'module',itemId:'copper_knuckle',locked:false}]};
    assert.equal(orderRecoveredWeapon(shop,1,createDefaultProfile()),true);
    assert.equal(shop.slots[0].itemId,'riveter'); assert.ok(shop.slots[0].price>0);
    assert.equal(shop.parts,50); assert.equal(orderRecoveredWeapon(shop,1,createDefaultProfile()),false);
});

test('拖车的钩线挂住废机后会拉近车身，并打开更长的侧甲窗口', () => {
    function tow(useWreck) {
        const battle=new RogueliteBattle({chapter:CHAPTER_CATALOG[1],waveIndex:11,danger:0,seed:1,
            rigId:'heavy_fitter',rigRank:1,weapons:[{uid:1,id:'wrench',tier:1}],
            startHp:100,level:0,levelStats:{},modules:[],carriedBagParts:0});
        const boss=battle.bossUnit;
        battle.startBossAttack(boss);
        const wreck=battle.bossDevices[0];
        if (useWreck) {
            const dx=wreck.x-boss.x,dy=wreck.y-boss.y,length=Math.hypot(dx,dy);
            Object.assign(battle.player,{x:wreck.x+12*dx/length,y:wreck.y+12*dy/length});
            battle.startBossAttack(boss);
        }
        const before=Math.hypot(boss.x-wreck.x,boss.y-wreck.y);
        for(let i=0;i<150 && boss.state!=='open';i++) {
            battle.tick++; battle.stepBoss(boss);
        }
        assert.equal(boss.state,'open');
        return {duration:boss.next-battle.tick,moved:before-Math.hypot(boss.x-wreck.x,boss.y-wreck.y)};
    }
    const caught=tow(true),missed=tow(false);
    assert.ok(caught.moved>20);
    assert.ok(caught.duration>2*missed.duration);
});
