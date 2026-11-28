import {expect,test} from '@playwright/test';
import {createDefaultProfile,PatrolSession} from '../../.m0-build/roguelite/session.js';
import {checkpoint,installCheckpoint} from './campaign-fixtures.mjs';
import {holdCombat} from './combat-clock.mjs';
import {tap,state,screen} from './canvas.mjs';

async function enter(page,chapterId,waveIndex) {
    const profile=createDefaultProfile();
    const first=new PatrolSession({profile,chapterId,rigId:'duty_standard',seed:5});
    const run=PatrolSession.fromSnapshot({...first.snapshot(),waveIndex,levelStats:{maxHp:400},currentHp:450,
        weapons:[{id:'arc_gun',uid:1,tier:2}]},profile);
    await installCheckpoint(page,checkpoint(profile,run));await page.goto('/');
    await holdCombat(page);await tap(page,'home:dispatch');
    await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleVisible);
}

test('WPN-12 环绕首领和普通敌机时实际选用的八向帧',async ({page},info)=>{
    await enter(page,'01',11);
    const frames=await page.evaluate(()=>{
        const {boot}=window.combatQA,b=boot.patrol.session.battle,skin=boot.skin;
        while(!b.enemies.some(e=>e!==b.bossUnit))boot.patrol.update(1/30,0,0);
        const boss=b.bossUnit,mob=b.enemies.find(e=>e!==boss);
        // Place two ordinary AI actors at the same arena location. Orbit their
        // position so their independent facing logic receives all eight bearings.
        Object.assign(boss,{x:180,y:340,state:'walk',next:9999});
        Object.assign(mob,{kind:'turret',x:180,y:340,state:'walk',next:9999});
        b.enemies.splice(0,b.enemies.length,boss,mob);
        const visible=key=>{
            const candidates=new Set(skin.world.items.filter(i=>i.sprite.node.active).map(i=>i.sprite.spriteFrame));
            return [...skin.frames].find(([name,frame])=>name.startsWith('pixel-enemy:'+key+':') && candidates.has(frame))?.[0];
        };
        const directions=[];
        for(let i=0;i<8;i++){
            b.player.x=boss.x+60*Math.cos(i*Math.PI/4);
            b.player.y=boss.y+60*Math.sin(i*Math.PI/4);
            const tick=b.tick;
            while(b.tick===tick)boot.patrol.update(1/30,0,0);
            boot.draw();
            directions.push([visible('gatekeeper'),visible('turret')]);
        }
        return directions;
    });
    const names=['e','ne','n','nw','w','sw','s','se'];
    for(const [i,row] of frames.entries())for(const f of row)expect(f?.split(':').at(-1)).toBe(names[i]);
    await info.attach('actor-frames',{body:JSON.stringify(frames),contentType:'application/json'});
});

for(const chapter of ['01','02','04']){
    test('WPN-12 首领预警内外实伤与弱点 '+chapter,async ({page},info)=>{
        await enter(page,chapter,11);
        const hazard=await page.evaluate(()=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle;
            for(let f=0;f<600 && !b.bossUnit.bossHazard;f++)boot.patrol.update(1/30,0,0);
            const boss=b.bossUnit,h=boss.bossHazard;if(!h || h.active)throw Error('No advance warning');
            boot.draw();
            // Pick inside and outside points independently from the hazard description.
            const inside={x:b.player.x,y:b.player.y};
            let outside;
            if(h.shape==='rect'){
                outside=h.right-h.left<h.top-h.bottom?{x:h.left-12,y:inside.y}:{x:inside.x,y:h.bottom-12};
            }else if(h.shape==='tether'){
                const dx=h.end.x-h.x,dy=h.end.y-h.y,len=Math.hypot(dx,dy);
                inside.x=(h.x+h.end.x)/2;inside.y=(h.y+h.end.y)/2;
                outside={x:inside.x-dy/len*(h.width+12),y:inside.y+dx/len*(h.width+12)};
            }else{
                const angle=h.from+h.sweep/2;
                inside.x=h.x+80*Math.cos(angle);inside.y=h.y+80*Math.sin(angle);
                outside={x:h.x+80*Math.cos(h.from-.3),y:h.y+80*Math.sin(h.from-.3)};
            }
            window.cuePoints={inside,outside};return h.shape;
        });
        expect(hazard).toBe(({ '01':'rect','02':'tether','04':'rect'})[chapter]);
        await screen(page,info,'warning');
        const result=await page.evaluate(()=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle,boss=b.bossUnit;
            const {inside,outside}=window.cuePoints;
            const causes=[];
            const hurt=b.hurtPlayer.bind(b);
            b.hurtPlayer=(amount,reason,attacker)=>{
                const from=b.player.hp,out=hurt(amount,reason,attacker);
                if(out)causes.push({reason,actual:from-b.player.hp});
                return out;
            };
            Object.assign(b.player,outside);
            while(boss.state==='warn')boot.patrol.update(1/30,0,0);
            boot.patrol.update(1/30,0,0);
            const misses=causes.filter(c=>c.reason==='boss_skill').length;
            Object.assign(b.player,inside);
            while(boss.state==='dash')boot.patrol.update(1/30,0,0);
            Object.assign(b.player,{x:b.field.left+20,y:b.field.bottom+65});
            for(let i=0;i<320 && boss.hp>0 && boss.state!=='open';i++){
                const pad=b.bossView.devices.find(d=>d.kind==='switch' && d.active);
                if(pad) Object.assign(b.player,{x:pad.x,y:pad.y});
                boot.patrol.update(1/30,0,0);
            }
            boot.draw();
            return {misses,hits:causes.filter(c=>c.reason==='boss_skill'),open:b.bossView.vulnerable,instruction:b.bossView.instruction};
        });
        expect(result.misses).toBe(0);expect(result.hits).toHaveLength(1);
        expect(result.hits[0].actual).toBeGreaterThan(0);
        expect(result.open).toBe(true);expect((await state(page)).labels).toContain(result.instruction);
        await screen(page,info,'weak');
    });
}

test('WPN-12 静默阵列的开口可穿过，击毁发射器中断攻击',async ({page},info)=>{
    await enter(page,'03',11);
    const sample=await page.evaluate(()=>{
        const {boot}=window.combatQA,b=boot.patrol.session.battle;
        const step=()=>{const t=b.tick;while(b.tick===t)boot.patrol.update(1/30,0,0);};
        for(let i=0;i<180 && !b.bossView.pulses.length;i++)step();
        const emitter=b.bossDevices.find(d=>d.active);
        if(!emitter) throw Error('发射器未亮起');
        const ring=b.bossView.pulses[0],hp=b.player.hp;
        Object.assign(b.player,{x:ring.x+Math.cos(ring.gap)*(ring.radius+4),y:ring.y+Math.sin(ring.gap)*(ring.radius+4)});
        step();const gapDamage=hp-b.player.hp;
        const r=b.bossView.pulses[0];
        Object.assign(b.player,{x:r.x-Math.cos(r.gap)*(r.radius+4),y:r.y-Math.sin(r.gap)*(r.radius+4)});
        step();const damage=hp-b.player.hp-gapDamage;
        Object.assign(b.player,{x:emitter.x+16,y:emitter.y});
        const targets=b.runtimes.map(rt=>b.toRenderBridge().rangedAimTarget(rt.slot)?.id);
        for(let i=0;i<160 && emitter.unit.hp>0;i++)step();
        boot.draw();
        return {targets,id:emitter.unit.id,gapDamage,damage,remaining:emitter.unit.hp,devices:b.bossView.devices.length};
    });
    expect(sample.gapDamage).toBe(0);expect(sample.damage).toBeGreaterThan(0);
    expect(sample.targets).toContain(sample.id);expect(sample.remaining).toBeLessThanOrEqual(0);
    expect(sample.devices).toBeLessThan(3);
    await screen(page,info,'relay-disabled');
});

for(const kind of ['charger','ambusher','reclaimer','jammer']){
    test('WPN-12 普通敌机预警与实际攻击 '+kind,async ({page},info)=>{
        await enter(page,'01',1);
        await page.evaluate(kind=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle;
            while(!b.enemies.length)boot.patrol.update(1/30,0,0);
            const enemy=b.enemies[0];
            // Controlled encounter: use normal AI at a reproducible distance.
            Object.assign(enemy,{kind,x:b.player.x+52,y:b.player.y,speed:0,next:0,hp:1500,maxHp:1500,
                state:kind==='ambusher'?'stealth':'walk'});
            b.enemies.splice(1);
            if(kind==='jammer')b.enemies.push({...enemy,id:10000,kind:'armored',x:enemy.x+10});
            for(let i=0;i<30 && enemy.state!=='warn';i++)boot.patrol.update(1/30,0,0);
            if(enemy.state!=='warn')throw Error('Missing warning: '+kind);
            window.threatSample={enemy,initialHp:b.player.hp,originX:enemy.x};
            boot.draw();
        },kind);
        await screen(page,info,'warning');
        const result=await page.evaluate(kind=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle;
            const {enemy,initialHp,originX}=window.threatSample;
            const clean=[],jammed=[];
            const tick=()=>{
                const prev=b.tick;boot.patrol.update(1/30,0,0);
                if(prev===b.tick)return;
                const cast=b.weaponCasts.find(c=>c.tick===b.tick);
                if(cast)(b.isJammed?jammed:clean).push({cooldown:b.runtimes[0].next-b.tick,
                    hops:b.effects.filter(e=>e.sourceCast===cast && e.hop>0).length});
            };
            while(enemy.state==='warn')tick();
            for(let i=0;i<(kind==='jammer'?62:11);i++)tick();
            boot.draw();
            return {hp:b.player.hp,initialHp,deltaX:enemy.x-originX,tether:enemy.tetherHit,clean,jammed,
                jam:b.isJammed};
        },kind);
        if(kind==='jammer'){
            expect(result.jam).toBe(true);
            expect(result.jammed.length).toBeGreaterThan(0);
            expect(result.jammed.every(c=>c.hops===0)).toBe(true);
            expect(result.clean.some(c=>c.hops>0 && c.cooldown<result.jammed[0].cooldown)).toBe(true);
        }else{
            expect(result.hp).toBeLessThan(result.initialHp);
            if(kind==='reclaimer')expect(result.tether).toBe(true);
            else expect(result.deltaX).toBeLessThan(-15);
        }
        await screen(page,info,'active');
    });
}
