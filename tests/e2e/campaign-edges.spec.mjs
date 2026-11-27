import {test,expect} from '@playwright/test';
import {PatrolSession,createDefaultProfile} from '../../.m0-build/roguelite/session.js';
import {WEAPON_CATALOG,MODULE_BY_ID} from '../../.m0-build/roguelite/catalog.js';
import {CHAPTER_NARRATIVES,defeatRadioLine,homeDispatchStatus,shopStoryBeatHint} from '../../.m0-build/roguelite/narrative.js';
import {checkpoint,installCheckpoint,readSave,playWave} from './campaign-fixtures.mjs';
import {holdCombat,finishWave} from './combat-clock.mjs';
import {tap,state,screen} from './canvas.mjs';

async function enter(page,profile,run) {
    await installCheckpoint(page,checkpoint(profile,run));await page.goto('/');
    await holdCombat(page);await tap(page,'home:dispatch');
    if (run.phase === 'battle') {
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
    }
}

for(const completed of [0,1,2,3,4]){
    test('RUN-01 夜班时钟与值班簿电台 '+completed,async ({page})=>{
        const profile={...createDefaultProfile(),onboardingDone:true,clearedChapters:['01','02','03','04'].slice(0,completed)};
        await installCheckpoint(page,checkpoint(profile));await page.goto('/');
        const dispatch=homeDispatchStatus(profile);
        await expect.poll(async ()=>(await state(page))?.labels).toContain(dispatch.clockLine);
        await tap(page,'home:duty');
        expect((await state(page)).labels.some(l=>l.includes(dispatch.radio.line))).toBe(true);
    });
}

for(const [wave,cause] of [[2,'hp'],[5,'hp'],[12,'hp'],[12,'timeout']]){
    test('RUN-02 真实结算电台 第 '+wave+' 波 '+cause,async ({page},info)=>{
        const profile=createDefaultProfile();
        const danger=cause==='timeout'?4:0;
        const base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5,danger});
        const hp=cause==='timeout'?10000:1;
        const run=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:wave-1,currentHp:hp,levelStats:{maxHp:hp}},profile);
        await enter(page,profile,run);
        if(wave!==2){
            const beat=wave===5?CHAPTER_NARRATIVES['01'].midTurn:CHAPTER_NARRATIVES['01'].bossIntro;
            expect((await state(page)).labels.join(' ')).toContain(beat.line);
        }
        await finishWave(page);
        await expect.poll(async ()=>(await state(page)).page).toBe('result');
        const failed=await page.evaluate(()=>window.combatQA.boot.patrol.result);
        expect(failed.failure).toBe(cause);
        const radio=defeatRadioLine({chapterId:'01',failedWave:wave,isBossWave:wave===12,danger,wavesCleared:wave-1});
        expect((await state(page)).labels.join(' ')).toContain(radio.line);
        if(cause==='timeout'){
            expect((await state(page)).labels).toContain('首领战超时');
            await screen(page,info,'timeout');
        }
        await tap(page,'result:返回值班室');expect((await state(page)).page).toBe('home');
    });
}

for(const wave of [4,11]){
    test('RUN-02 下一波精英或首领的商店提示 '+wave,async ({page})=>{
        const profile={...createDefaultProfile(),onboardingDone:true};
        const base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
        const sample=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:wave-1,levelStats:{maxHp:1200},currentHp:1200},profile);
        playWave(sample);
        expect(sample.phase).toBe('shop');
        while(sample.shopView.pendingLevelUps)sample.chooseLevelUp(0);
        await enter(page,profile,sample);
        expect((await state(page)).labels).toContain(shopStoryBeatHint('01',wave+1));
    });
}

for(const danger of [1,2,3]){
    test('RUN-08～10 实际清波、商店价格及精英 '+danger,async ({page})=>{
        const profile={...createDefaultProfile(),onboardingDone:true,maxDangerCleared:{'01':danger}};
        const wave=danger===1?1:danger===2?4:5;
        const base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5,danger});
        const run=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:wave-1,levelStats:{maxHp:2000,armor:15},currentHp:1000},profile);
        await enter(page,profile,run);
        if(danger===3){
            const start=await page.evaluate(()=>{const b=window.combatQA.boot.patrol.session.battle;
                return {elite:b.bossUnit?.isElite,escorts:b.warnings.map(w=>w.kind)};});
            expect(start).toEqual({elite:true,escorts:['armored','pursuer']});
        }
        if(danger===2){
            const seen=await page.evaluate(()=>{const {boot}=window.combatQA,b=boot.patrol.session.battle;
                for(let i=0;i<1500 && boot.patrol.inBattle;i++){
                    if(b.enemies.some(e=>e.kind==='jammer'))return true;
                    boot.patrol.update(1/30,0,0);
                }return false;
            });
            expect(seen).toBe(true);
        }
        await finishWave(page);
        const {run:saved}=await readSave(page);
        expect(saved.phase).toBe('shop');
        const report=saved.reports.at(-1);
        if(danger===1){
            expect(report.endHp).toBeLessThan(report.maxHp);
            expect(saved.currentHp).toBe(report.endHp+Math.round((report.maxHp-report.endHp)*.18)+4*(saved.level-run.level));
        }
        if(danger===2){
            for(const s of saved.shop.slots){
                const price=s.kind==='weapon'?WEAPON_CATALOG[s.itemId].tiers[s.tier-1].price:MODULE_BY_ID[s.itemId].price;
                expect(s.price).toBe(Math.floor((price*(1+.21*wave)+3.2*wave)*1.1));
            }
            await page.reload();await tap(page,'home:log');
            expect((await state(page)).labels).toContain(CHAPTER_NARRATIVES['01'].secretNote);
        }
    });
}

test('RUN-10 第八波额外精英',async ({page})=>{
    const profile=createDefaultProfile();
    const base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5,danger:3});
    await enter(page,profile,PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:7},profile));
    expect(await page.evaluate(()=>window.combatQA.boot.patrol.session.battle.bossUnit.isElite)).toBe(true);
});
