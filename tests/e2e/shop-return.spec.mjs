import {expect,test} from '@playwright/test';
import {createDefaultProfile,PatrolSession} from '../../.m0-build/roguelite/session.js';
import {MODULE_BY_ID} from '../../.m0-build/roguelite/catalog.js';
import {checkpoint,installCheckpoint,playWave,readSave} from './campaign-fixtures.mjs';
import {holdCombat,finishWave} from './combat-clock.mjs';
import {point,state,tap,screen} from './canvas.mjs';

function shopFixture(profile) {
    const first=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
    const ids=['wrench','arc_gun','riveter','hydraulic_nailer','induction','split_probe'];
    const session=PatrolSession.fromSnapshot({...first.snapshot(),parts:700,levelStats:{armor:15,maxHp:100},
        weapons:ids.map((id,i)=>({id,tier:i===0?1:3,uid:i+1})),nextWeaponUid:7},profile);
    playWave(session);
    if(!session.shopView)throw Error('Shop fixture did not clear first wave');
    return session;
}

test('NEW-05/06/08、DEV-02 指引和留货跨波，排除配件、全留货与重开',async ({page})=>{
    const banned='copper_knuckle';
    const profile={...createDefaultProfile(),talents:{shop_permit:2,ban_permit:1},
        maxDangerCleared:{'01':3},bannedModules:[banned]};
    const session=shopFixture(profile);
    await installCheckpoint(page,checkpoint(profile,session));
    await page.goto('/');
    await holdCombat(page);
    await tap(page,'home:dispatch');
    const options=(await readSave(page)).run.shop.levelUpOptions;
    const picks=(await state(page)).pendingLevelUps;
    expect(picks).toBeGreaterThan(0);
    await page.reload();
    await holdCombat(page);
    await tap(page,'home:dispatch');
    expect((await state(page)).pendingLevelUps).toBe(picks);
    expect((await readSave(page)).run.shop.levelUpOptions).toEqual(options);
    while((await state(page)).pendingLevelUps)await tap(page,'shop:选择');
    await tap(page,'shop:关闭提示');
    const lockKey=s=>'shop:留货:'+s.id+':'+s.tier+':'+s.locked;
    for(let i=0;i<4;i++){
        const slot=(await state(page)).shopOffers.find(s=>!s.locked);
        await tap(page,lockKey(slot));
    }
    const all=(await state(page)).shopOffers;
    expect(all.every(s=>s.locked)).toBe(true);
    expect((await state(page)).hitAreas.every(a=>!a.key.includes('刷新'))).toBe(true);
    await tap(page,'shop:开始第 2 波');
    await finishWave(page);
    while((await state(page)).pendingLevelUps)await tap(page,'shop:选择');
    expect((await state(page)).shopOffers).toEqual(all);
    expect((await state(page)).hitAreas.some(a=>a.key.includes('关闭提示'))).toBe(false);
    await page.reload();await tap(page,'home:dispatch');
    expect((await state(page)).shopOffers).toEqual(all);
    expect((await state(page)).hitAreas.some(a=>a.key.includes('关闭提示'))).toBe(false);
    for(let i=0;i<4;i++)await tap(page,lockKey((await state(page)).shopOffers.find(s=>s.locked)));
    const alternatives=new Set();
    for(let i=0;i<8;i++){
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().hitAreas.some(a=>/shop:(免费刷新|刷新 ·)/.test(a.key)));
        const prior=await state(page);
        const refresh=prior.hitAreas.find(a=>/shop:(免费刷新|刷新 ·)/.test(a.key));
        expect(refresh).toBeDefined();
        await tap(page,refresh.key);
        const after=await state(page);
        expect(after.parts).toBe(prior.parts-Number(refresh.key.match(/(\d+) 铜件/)?.[1]??0));
        for(const offer of after.shopOffers) {
            expect(offer.id).not.toBe(banned);
            if(MODULE_BY_ID[offer.id])alternatives.add(offer.id);
        }
    }
    expect(alternatives.size).toBeGreaterThan(1);
});

test('NEW-07 六槽购买与无效点击，羁绊抽屉往返',async ({page},info)=>{
    const profile={...createDefaultProfile(),onboardingDone:true};
    const run=shopFixture(profile);
    while(run.shopView.pendingLevelUps)run.chooseLevelUp(0);
    const snap=run.snapshot();
    const slots=snap.shop.slots.map((slot,i)=>i<2?{...slot,kind:'weapon',itemId:i?'torch':'wrench',tier:1,sold:false,locked:false}:slot);
    const fixture=PatrolSession.fromSnapshot({...snap,shop:{...snap.shop,slots}},profile);
    await installCheckpoint(page,checkpoint(profile,fixture));
    await page.goto('/');await tap(page,'home:dispatch');
    const initial=await state(page);
    const key=initial.hitAreas.find(a=>a.key.startsWith('shop:买:wrench:1:')).key;
    const before=await readSave(page);
    expect(initial.hitAreas.find(a=>a.key.startsWith('shop:买:torch:1:'))).toBeUndefined();
    // Buy buttons of cards 0 and 1 share a row. Tap the disabled card at the same row height.
    const [x,y]=await point(page,key);
    const box=await page.locator('#GameCanvas').boundingBox();
    await page.touchscreen.tap(x+168*Math.min(box.width/360,box.height/640),y);
    expect(await readSave(page)).toEqual(before);
    await tap(page,key);
    await expect.poll(async ()=>(await readSave(page)).run.weapons[0].tier).toBe(2);
    const after=await readSave(page);
    expect(after.run.weapons).toEqual(before.run.weapons.map((w,i)=>i===0?{...w,tier:2}:w));
    expect(after.run.parts).toBe(before.run.parts-initial.shopOffers[0].price);
    await tap(page,'shop:属性与羁绊');
    expect((await state(page)).labels.filter(l=>/^(近战|电弧|穿甲|火焰|控场) \d/.test(l))).toHaveLength(5);
    await screen(page,info,'six-slot-synergies');
    await tap(page,'shop:‹ 回商店');
    expect(await readSave(page)).toEqual(after);
    await screen(page,info,'six-slot-shop');
});
