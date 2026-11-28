import {test,expect} from '@playwright/test';
import {PatrolSession,createDefaultProfile} from '../../.m0-build/roguelite/session.js';
import {checkpoint,installCheckpoint,readSave} from './campaign-fixtures.mjs';
import {finishWave,holdCombat} from './combat-clock.mjs';
import {state,tap} from './canvas.mjs';

for(const mock of [false,true]){
    test('AD-01/03 首领阵亡后 '+(mock?'同场复活定格':'无广告直接结算'),async ({page})=>{
        const profile=createDefaultProfile(),first=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
        const run=PatrolSession.fromSnapshot({...first.snapshot(),waveIndex:11,currentHp:4,weapons:[{id:'arc_gun',tier:1,uid:1}]},profile);
        await installCheckpoint(page,checkpoint(profile,run));
        await page.goto(mock?'/?mockAd=1':'/');
        await holdCombat(page);await tap(page,'home:dispatch');await finishWave(page);
        if(!mock){
            expect((await state(page)).page).toBe('result');
            expect((await state(page)).hitAreas.some(a=>a.key.includes('看视频'))).toBe(false);
            await tap(page,'result:返回值班室');return;
        }
        expect((await state(page)).page).toBe('revive');
        const target=await page.evaluate(()=>{
            const b=window.combatQA.boot.patrol.session.defeatedBattle;
            return {boss:b.bossUnit.hp,x:b.player.x,y:b.player.y,tick:b.tick};
        });
        await tap(page,'revive:看视频复活');
        await page.getByRole('button',{name:'看完并返回'}).click();
        await expect.poll(async ()=>(await readSave(page)).run.revivesUsed).toBe(1);
        const actual=await page.evaluate(()=>{
            const b=window.combatQA.boot.patrol.session.battle;
            return {boss:b.bossUnit.hp,x:b.player.x,y:b.player.y,tick:b.tick,grace:b.player.invulnerableUntil-b.tick,
                small:b.enemies.filter(e=>e!==b.bossUnit).length,bullets:b.bullets.length,hp:b.player.hp,max:b.player.maxHp};
        });
        expect(actual).toMatchObject({...target,grace:60,small:0,bullets:0});
        expect(actual.hp).toBe(Math.ceil(actual.max*.6));
    });
}

test('AD-05 并列的凭证和视频补给单独结算，试用工装结算后仍锁定',async ({page})=>{
    const profile={...createDefaultProfile(),onboardingDone:true,credits:50};
    await installCheckpoint(page,checkpoint(profile));
    await page.goto('/?mockAd=1');await holdCombat(page);
    await tap(page,'home:dispatch');await tap(page,'prep:选择工装 ›');await tap(page,'prep:›');
    const before=await state(page);
    expect(before.hitAreas.some(a=>a.key.includes('凭证出发'))).toBe(true);
    await tap(page,'prep:看视频领补给出发');
    await page.getByRole('button',{name:'看完并返回'}).click();
    await expect.poll(async ()=>(await readSave(page))?.profile.daily?.adPrepUsed).toBe(1);
    const paidByAd=await readSave(page);
    expect(paidByAd.profile.credits).toBe(50);expect(paidByAd.run.supply).toBe(before.supply);
    // Open the preparation fixture on the same journal. Choose an unowned rig
    // and finish the resulting trial via ordinary waves, shops and defeat.
    await page.goto('/?patrolDebug=prep&mockAd=1');await holdCombat(page);
    await tap(page,'prep:选择工装 ›');
    await tap(page,(await state(page)).hitAreas.find(a=>a.key.includes('锁定')).key);
    const rig=(await state(page)).rig;
    await tap(page,(await state(page)).hitAreas.find(a=>a.key.includes('看视频试用')).key);
    await page.getByRole('button',{name:'看完并返回'}).click();
    await expect.poll(async ()=>(await readSave(page)).run?.trialRig).toBe(true);
    for(let wave=1;wave<=12;wave++){
        await finishWave(page);
        if((await state(page)).page!=='shop')break;
        while((await state(page)).pendingLevelUps)await tap(page,'shop:选择');
        await tap(page,'shop:开始第 '+(wave+1)+' 波');
    }
    if((await state(page)).page==='revive')await tap(page,'revive:结束本局');
    await expect.poll(async ()=>(await state(page)).page).toBe('result');
    await page.reload();
    const ended=await readSave(page);
    expect(ended.run).toBeNull();expect(ended.profile.daily.adPrepUsed).toBe(2);
    expect(ended.profile.unlockedRigs).not.toContain(rig);
});
