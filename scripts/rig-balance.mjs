// Compare the same seeds, map, budget and frame inputs using the production battle.
import { mkdir, writeFile } from 'node:fs/promises';
import { CHAPTER_CATALOG, RIG_CATALOG } from '../.m0-build/roguelite/catalog.js';
import { RogueliteBattle } from '../.m0-build/roguelite/battle.js';
import { armorDamageMultiplier } from '../.m0-build/roguelite/formulas.js';
import { steerPatrol } from '../.m0-build/roguelite/autoMovement.js';

const rigs = Object.keys(RIG_CATALOG);
const signature = {
    duty_standard: ['wrench','arc_gun','torch'], heavy_fitter: ['wrench','wrench','pulse_nozzle'],
    high_voltage: ['arc_gun','induction','arc_gun'], thermal_welder: ['torch','torch','pulse_nozzle'],
    scrap_auditor: ['riveter','riveter','traction_coil'], surveyor: ['breaker_stake','traction_coil','induction'],
};
const scenarios = ['single','crowd','travel','salvage','backline'];
const mean = xs => xs.reduce((a,b) => a+b,0)/xs.length;
const seeds = Array.from({length:30}, (_,i) => 173 + i*401);

function sample(rigId, rigRank, seed, scenario, kit) {
    const tools = kit === 'signature' ? signature[rigId] : kit === 'common' ? ['wrench','arc_gun','torch'] : ['wrench'];
    const boss = scenario === 'single';
    const waveIndex = boss ? 11 : scenario === 'crowd' ? 7 : 2;
    const b = new RogueliteBattle({chapter:CHAPTER_CATALOG[0], waveIndex, seed, rigId, rigRank, danger:0,
        weapons:tools.map((id,i)=>({id,uid:i+1,tier:2})), modules:[], startHp:1000,
        carriedBagParts:0, level:5, levelStats:{}});
    // Keep the single-target case free of reinforcements. Other cases retain the rig's spawn multiplier.
    if (boss) b.stepSpawner = () => {};
    // A fixed column behind the nearest target tests the ability to reach protected enemies.
    // All rigs receive the same high-HP training targets, positions and time budget.
    const rearTargets = [];
    if (scenario === 'backline') {
        b.player.x = b.field.left + 60;
        for (const dx of [42,110,180,248]) b.warnings.push({kind:'crawler',x:b.player.x+dx,y:b.player.y,at:0});
        b.stepSpawner();
        for (const enemy of b.enemies) {
            Object.assign(enemy,{hp:12000,maxHp:12000,speed:0});
            if (enemy.x-b.player.x >= 175) rearTargets.push(enemy);
        }
        b.stepSpawner = () => {};
    }
    const stats=b.build.stats;
    let direction=[0,0], travelled=0;
    for(let i=0;i<540 && !b.finished;i++) {
        if(i%6===0) {
            direction = steerPatrol(b);
            if(scenario==='backline') direction=[0,0];
            if(scenario==='travel') direction=[Math.cos(i/31),Math.sin(i/31)];
            if(boss && b.boss) {
                const dx=b.boss.x-b.player.x,dy=b.boss.y-b.player.y,len=Math.hypot(dx,dy);
                direction=len>49 ? [dx/len,dy/len] : [0,0];
            }
        }
        const {x,y}=b.player;
        b.step(...direction);
        travelled+=Math.hypot(x-b.player.x,y-b.player.y);
    }
    const dmg=b.runtimes.reduce((n,r)=>n+r.totalDamage,0);
    const report=b.summary();
    return {effectiveHp:stats.maxHp/armorDamageMultiplier(stats.armor),speed:stats.moveSpeed,
        rearDamage:rearTargets.reduce((total,e)=>total + 12000 - Math.max(0,e.hp),0), damage:dmg, kills:b.kills, health:b.player.hp, distance:travelled,
        purchasingPower:(report.partsCollected+report.partsBagged+stats.salvage)/b.build.shopPriceScale};
}

const measurements={};
for(const rig of rigs) for(const rank of [1,2,3,4]) {
    const key=rig+'-'+rank;
    measurements[key]={};
    for(const kit of ['bare','common','signature']) {
        for(const scenario of scenarios) {
            const samples=seeds.map(seed=>sample(rig,rank,seed,scenario,kit));
            const metrics=scenario==='single' ? ['damage','health','effectiveHp'] : scenario==='crowd' ? ['kills','damage']
                : scenario==='travel' ? ['distance','speed'] : scenario==='backline' ? ['rearDamage'] : ['purchasingPower'];
            for(const metric of metrics) measurements[key][kit+'/'+scenario+'/'+metric]=samples.map(s=>s[metric]);
        }
    }
}
const comparisons=[];
for(let i=0;i<rigs.length;i++) for(let j=i+1;j<rigs.length;j++) for(const rankA of [1,2,3,4]) for(const rankB of [1,2,3,4]) {
    const a=rigs[i]+'-'+rankA,b=rigs[j]+'-'+rankB;
    const wins=[],losses=[];
    for(const [key,x] of Object.entries(measurements[a])) {
        const paired=x.map((n,k)=>n-measurements[b][key][k]);
        const delta=mean(paired);
        const se=Math.sqrt(paired.reduce((s,v)=>s+(v-delta)**2,0)/(paired.length-1)/paired.length);
        const margin=2.045*se;
        if(delta>margin+1e-6)wins.push({key,delta,margin});
        if(delta< -margin-1e-6)losses.push({key,delta,margin});
    }
    comparisons.push({a,b,sameRank:rankA===rankB,wins,losses});
}
const empiricalKit = (metric,kit) => metric.key.startsWith(kit+'/') && !/(effectiveHp|\/speed)$/.test(metric.key);
const unresolved = comparisons.filter(pair => ['bare','common','signature'].some(kit =>
    !pair.wins.some(m=>empiricalKit(m,kit)) || !pair.losses.some(m=>empiricalKit(m,kit))));

await mkdir('log/prelaunch',{recursive:true});
await writeFile('log/prelaunch/rig-balance.json',JSON.stringify({seeds,measurements,comparisons,unresolved},null,2));
console.log(JSON.stringify({runs:seeds.length*rigs.length*4*3*scenarios.length, sameRank:comparisons.filter(c=>c.sameRank).length,
    pairs:comparisons.length,unresolved:unresolved.map(p=>[p.a,p.b])}));
if(unresolved.length)process.exitCode=1;
