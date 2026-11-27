import {test,expect} from '@playwright/test';
import {makePlatform} from '../../.m0-build/platform/platform.js';
import {PATROL_PROFILE_NAMESPACE,PATROL_RUN_NAMESPACE} from '../../.m0-build/roguelite/persistence.js';
import {createDefaultProfile,PatrolSession} from '../../.m0-build/roguelite/session.js';
import {checkpoint,installCheckpoint,playWave,readSave} from './campaign-fixtures.mjs';
import {finishWave,holdCombat} from './combat-clock.mjs';
import {point,state,tap,screen} from './canvas.mjs';

async function mockDevice(page) {
    await page.addInitScript(()=>{
        window.interrupt={};
        window.wx={
            getStorageSync:k=>localStorage.getItem(k)??'',
            setStorageSync:(k,v)=>localStorage.setItem(k,v),
            getWindowInfo:()=>({screenWidth:innerWidth,screenHeight:innerHeight,screenTop:0,windowHeight:innerHeight,
                safeArea:{left:0,right:innerWidth,top:36,bottom:innerHeight-32}}),
            getMenuButtonBoundingClientRect:()=>({bottom:68}),
            onAudioInterruptionBegin:fn=>{window.interrupt.begin=fn;},
            onAudioInterruptionEnd:fn=>{window.interrupt.end=fn;},
        };
    });
}

test('DEV-07/08 页面入口中心能命中对应按钮，带胶囊与手势区',async ({page},info)=>{
    test.setTimeout(120000);
    await mockDevice(page);
    async function inspect(name) {
        const s=await state(page);
        for(const area of s.hitAreas){
            const x=(area.left+area.right)/2,y=(area.top+area.bottom)/2;
            const first=s.hitAreas.find(a=>x>=a.left && x<=a.right && y>=a.bottom && y<=a.top);
            expect(first.key,name+' 的 '+area.key+' 被遮挡').toBe(area.key);
            expect(area.left).toBeGreaterThanOrEqual(0);expect(area.right).toBeLessThanOrEqual(360);
            expect(area.bottom).toBeGreaterThanOrEqual(0);expect(area.top).toBeLessThanOrEqual(640);
        }
        await screen(page,info,name);
    }
    for(const stage of ['home','prep','levelup','shop','boss','workshop','log','result']){
        await page.goto('/?mockAd=1'+('&patrolDebug='+stage));
        const expected=stage==='levelup'?'shop':stage==='boss'?'battle':stage;
        await page.waitForFunction(p=>{const s=globalThis.__nightShiftCampaignState?.();return s?.page===p && s.hitAreas.length;},expected);
        await inspect(stage);
        if(stage==='home'){
            expect((await state(page)).labels.find(l=>l.includes('抵制不良游戏'))?.split('\n')).toHaveLength(2);
            const [x,y]=await point(page,'home:设置');
            expect(y).toBeGreaterThan(68);expect(x).toBeGreaterThan(180);
            await tap(page,'home:设置');await inspect('settings');
        }
        if(stage==='prep'){await tap(page,'prep:选择工装 ›');await inspect('loadout');}
        if(stage==='shop'){await tap(page,'shop:属性与羁绊');await inspect('synergies');}
        if(stage==='result'){
            await tap(page,(await state(page)).hitAreas.find(a=>a.key.startsWith('result:解锁')).key);
            await inspect('unlocks');
        }
    }
});

test('DEV-03 v3 双槽旧档导入后可继续整备并保存到 v4',async ({page})=>{
    const entries={},host={localStorage:{getItem:k=>entries[k]??null,setItem:(k,v)=>{entries[k]=v;}}};
    const profile={...createDefaultProfile(),credits:51,clearedChapters:['01'],onboardingDone:true,talents:{chassis:1}};
    const run=new PatrolSession({profile,chapterId:'01',seed:5,rigId:'duty_standard'});
    playWave(run);expect(run.phase).toBe('shop');
    const old={...run.snapshot(),version:3};
    delete old.shop;delete old.runId;
    for(const [ns,data] of [[PATROL_PROFILE_NAMESPACE,profile],[PATROL_RUN_NAMESPACE,old]]){
        expect(makePlatform(host,ns).writeCheckpoint(3,data)).toBe(true);
    }
    await installCheckpoint(page,entries);await page.goto('/');await tap(page,'home:dispatch');
    expect((await state(page)).page).toBe('shop');
    expect((await state(page)).pendingLevelUps).toBe(old.pendingLevelUps);
    if(old.pendingLevelUps)await tap(page,'shop:选择');
    else await tap(page,'shop:留货:'+(await state(page)).shopOffers[0].id+':'+(await state(page)).shopOffers[0].tier+':false');
    await expect.poll(async ()=>(await readSave(page))?.schemaVersion).toBe(4);
    const save=await readSave(page);
    expect(save.schemaVersion).toBe(4);
    expect(save.profile).toMatchObject({credits:51,clearedChapters:['01'],talents:{chassis:1}});
    expect(save.run).toMatchObject({phase:'shop',parts:old.parts,weapons:old.weapons});
    await page.reload();await tap(page,'home:dispatch');expect((await state(page)).parts).toBe(old.parts);
});

test('DEV-06 战斗与模拟视频中断，恢复后单轨播放与额度不变',async ({page})=>{
    const profile=createDefaultProfile();
    const start=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
    const strong=PatrolSession.fromSnapshot({...start.snapshot(),weapons:[{id:'arc_gun',uid:1,tier:4}]},profile);
    await installCheckpoint(page,checkpoint(profile,strong));
    await mockDevice(page);await page.goto('/?mockAd=1');await tap(page,'home:dispatch');
    await page.evaluate(async ()=>{
        const cc=await System.import('cc');
        window.qaRuntime={cc,boot:cc.director.getScene().getComponentInChildren('M1Bootstrap')};
    });
    const playing=()=>page.evaluate(()=>Object.values(window.qaRuntime.boot.audio.tracks).filter(t=>t.source.playing && t.source.volume>0).length);
    await expect.poll(playing).toBe(1);
    await page.evaluate(()=>window.interrupt.begin());
    await expect.poll(async ()=>(await state(page)).paused).toBe(true);
    await expect.poll(playing).toBe(0);
    await page.evaluate(()=>window.interrupt.end());
    await tap(page,'battle:继续战斗');await expect.poll(playing).toBe(1);
    await page.evaluate(()=>{const {cc}=window.qaRuntime;cc.game.emit(cc.Game.EVENT_HIDE);cc.game.emit(cc.Game.EVENT_SHOW);});
    expect((await state(page)).paused).toBe(true);
    await tap(page,'battle:继续战斗');
    await holdCombat(page);await finishWave(page);
    while((await state(page)).pendingLevelUps)await tap(page,'shop:选择');
    const key='shop:看视频领 20 铜件';
    await point(page,key);
    const save=await readSave(page);
    await tap(page,key);
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.evaluate(async ()=>{const cc=await System.import('cc');cc.game.emit(cc.Game.EVENT_HIDE);cc.game.emit(cc.Game.EVENT_SHOW);});
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await readSave(page)).toEqual(save);
    await tap(page,key);await expect(page.getByRole('dialog')).toBeVisible();
});

test('DEV-04/08 安全区、摇杆边距上限下限和点按战场',async ({page},info)=>{
    await mockDevice(page);await page.goto('/?patrolDebug=home');await tap(page,'home:设置');await tap(page,'settings:居中');
    expect((await state(page)).hitAreas.filter(a=>a.key==='settings:＋')).toHaveLength(1);
    await tap(page,'settings:靠左');
    for(const [key,bottom,side] of [['−',8,8],['＋',104,80]]){
        let steps=0;
        while((await state(page)).hitAreas.some(a=>a.key==='settings:'+key)){
            await tap(page,'settings:'+key);if(++steps>30)throw Error('Margin control never disabled');
        }
        const s=await state(page);
        expect(s.settings).toMatchObject({bottomMargin:bottom,sideMargin:side});
        const box=await page.locator('#GameCanvas').boundingBox(),scale=Math.min(box.width/360,box.height/640);
        expect(box.height/2-(s.stick.y-320)*scale).toBeLessThan(box.height-32);
    }
    await tap(page,'settings:靠右');await page.reload();await tap(page,'home:设置');
    expect((await state(page)).settings).toMatchObject({bottomMargin:104,sideMargin:80,stickPlacement:'right'});
    await tap(page,'settings:点按战场');await tap(page,'settings:‹ 返回');await tap(page,'home:dispatch');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
    const initial=(await state(page)).player;
    const box=await page.locator('#GameCanvas').boundingBox();
    await page.touchscreen.tap(box.x+box.width*.75,box.y+box.height*.55);
    await expect.poll(async ()=>(await state(page)).player.x).toBeGreaterThan(initial.x+10);
    await tap(page,'battle:暂停');await screen(page,info,'safe-pause');
    await page.goto('/?patrolDebug=prep&mockAd=1');
    await tap(page,'prep:选择工装 ›');
    for(const area of (await state(page)).hitAreas){
        const [x,y]=await point(page,area.key);
        expect(x).toBeGreaterThan(0);expect(x).toBeLessThan(box.width);
        expect(y).toBeGreaterThan(36);expect(y).toBeLessThan(box.height-32);
    }
    await screen(page,info,'safe-loadout');
});
