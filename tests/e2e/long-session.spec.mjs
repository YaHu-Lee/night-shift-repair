import {test,expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {createDefaultProfile,PatrolSession} from '../../.m0-build/roguelite/session.js';
import {UI_COPY} from '../../.m0-build/roguelite/narrative.js';
import {checkpoint,installCheckpoint} from './campaign-fixtures.mjs';
import {holdCombat} from './combat-clock.mjs';
import { tap, state, openReport } from './canvas.mjs';

test('DEV-10 同页面连续两局十二波，再进无尽第十五波',async ({page,context},info)=>{
    test.setTimeout(360000);
    page.setDefaultTimeout(15000);
    const profile={...createDefaultProfile(),clearedChapters:['01','02','03','04'],onboardingDone:true};
    const sessions=['01','02','04'].map((chapterId,i)=>{
        const run=new PatrolSession({profile,chapterId,rigId:'duty_standard',seed:5,endlessMode:i===2,runId:'soak-'+i});
        const ids=['wrench','arc_gun','hydraulic_nailer','torch','split_probe','induction'];
        return PatrolSession.fromSnapshot({...run.snapshot(),level:30,currentHp:420,
            levelStats:{maxHp:350,armor:30,repair:18,voltage:70,torque:45,overclock:60},
            weapons:ids.map((id,j)=>({id,uid:j+1,tier:4})),nextWeaponUid:7},profile);
    });
    await installCheckpoint(page,checkpoint(profile,sessions[0]));
    await page.goto('/');await holdCombat(page);
    const cdp=await context.newCDPSession(page);
    const errors=[],samples=[];
    page.on('pageerror',e=>errors.push(e.message));
    for(const [i,run] of sessions.entries()){
        if(i){
            await openReport(page);
            await tap(page,'result:返回值班室');
            await page.evaluate(snap=>{
                const {boot}=window.combatQA;
                const p=boot.patrol;
                const session=window.soakSession.fromSnapshot(snap,p.profile);
                if(!p.storage.startRun(p.profile,session))throw Error('Cannot stage next run');
                p.restore();boot.draw();
            },run.snapshot());
        }
        await tap(page,'home:dispatch');
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleVisible);
        for(let wave=1;wave<=(i===2?15:12);wave++){
            expect((await state(page)).wave).toBe(wave);
            await page.waitForFunction(()=>window.combatQA.boot.patrol.inBattle);
            const sample=await page.evaluate(()=>{
                const {boot}=window.combatQA,p=boot.patrol,b=p.session.battle;
                window.soakSession=p.session.constructor;
                let maxEnemies=0,maxBullets=0,frame=0;
                while(p.inBattle && frame++<16000){
                    const pad = b.bossView?.devices.find(d => d.kind==='switch' && d.active);
                    const goal = pad ?? (b.bossView?.vulnerable ? b.boss : null);
                    const dx = goal ? goal.x-b.player.x : 0, dy = goal ? goal.y-b.player.y : 0;
                    const distance = Math.hypot(dx,dy);
                    const moving = distance > (pad ? 10 : 44);
                    p.update(1/30,moving ? dx/distance : 0,moving ? dy/distance : 0);
                    maxEnemies=Math.max(maxEnemies,b.enemies.length);maxBullets=Math.max(maxBullets,b.bullets.length);
                    if(frame%10===0)boot.draw();
                }
                boot.draw();
                if(p.inBattle)throw Error('Wave timed out');
                return {ticks:b.tick,maxEnemies,maxBullets,sprites:boot.skin.world.items.length,labels:boot.labels.length};
            });
            const {usedSize}=await cdp.send('Runtime.getHeapUsage');
            samples.push({run:i+1,wave,usedSize,...sample});
            await page.waitForFunction(()=>!window.combatQA.boot.patrol.saving && globalThis.__nightShiftCampaignState().page!=='battle');
            const mode=(await state(page)).page;
            if(wave===12 && i<2)expect(mode).toBe('result');
            else{
                expect(mode).toBe('shop');
                while((await state(page)).pendingLevelUps)await tap(page,'shop:选择');
                if(i!==2 || wave<15){
                    const next=wave+1;
                    await tap(page,'shop:'+UI_COPY.shop.nextWave(next,next===12 || next===15));
                }
            }
        }
        await cdp.send('HeapProfiler.collectGarbage');
        samples.at(-1).afterGC=(await cdp.send('Runtime.getHeapUsage')).usedSize;
    }
    expect(samples).toHaveLength(39);expect(errors).toEqual([]);
    await writeFile(info.outputPath('three-runs.json'),JSON.stringify(samples,null,2));
});
