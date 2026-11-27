import {test,expect} from '@playwright/test';
import {PatrolSession,createDefaultProfile} from '../../.m0-build/roguelite/session.js';
import {chapterCheckpoints,checkpoint,installCheckpoint,readSave} from './campaign-fixtures.mjs';
import {CHAPTER_NARRATIVES} from '../../.m0-build/roguelite/narrative.js';
import {legalStarterWeaponsForRig} from '../../.m0-build/roguelite/progression.js';
import {WEAPON_CATALOG} from '../../.m0-build/roguelite/catalog.js';
import {holdCombat} from './combat-clock.mjs';
import {state,tap,screen} from './canvas.mjs';

test('RUN-06/07 复电插画、起手武器轮换及从准备进入无尽',async ({page},info)=>{
    const profile={...chapterCheckpoints().at(-1).profileAfter,bestEndlessWave:14};
    await installCheckpoint(page,checkpoint(profile));await page.goto('/');
    await expect.poll(async ()=>(await state(page))?.labels.join(' ')).toContain('港区最高撑过第 14 波');
    await tap(page,'home:log');
    for(let i=0;i<3;i++)await tap(page,'log:下一章');
    await page.waitForFunction(async ()=>{
        const cc=await System.import('cc'),skin=cc.director.getScene().getComponentInChildren('M1Bootstrap').skin;
        const frame=skin.frames.get('pixel-dispatch:ending')??skin.frames.get('dispatch-ending')??skin.arenas.get('city-restored')?.floor;
        return frame && skin.ui.items.some(i=>i.sprite.node.active && i.sprite.spriteFrame===frame);
    });
    expect((await state(page)).labels.join(' ')).toContain(CHAPTER_NARRATIVES['04'].epilogueHook.line);
    await screen(page,info,'ending-art');
    await tap(page,'log:‹ 返回');await tap(page,'home:dispatch');
    await tap(page,'prep:港区无尽');
    expect((await state(page)).labels).toContain('最高纪录：完成 14 波');
    await tap(page,'prep:选择工装 ›');
    const legal=legalStarterWeaponsForRig((await state(page)).rig,profile);
    for(const id of [...legal,legal[0]]){
        expect((await state(page)).labels).toContain('初始武器 · '+WEAPON_CATALOG[id].name);
        await tap(page,'prep:换武器');
    }
    await tap(page,'prep:开始港区无尽');
    await expect.poll(async ()=>(await readSave(page)).run?.endlessMode).toBe(true);
    expect((await readSave(page)).run.weapons[0].id).toBe(legal[1]);
});

for(const wave of [3,5,12]){
    test('RUN-02 进站及战斗电台消失的实际帧 第 '+wave+' 波',async ({page})=>{
        const profile=createDefaultProfile(),base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
        const run=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:wave-1,levelStats:{maxHp:400},currentHp:450},profile);
        const station=run.chapter.stations[run.currentWaveDef.stationIndex];
        const line=wave===3?station.arriveRadio:(wave===5?CHAPTER_NARRATIVES['01'].midTurn:CHAPTER_NARRATIVES['01'].bossIntro).line;
        const limit=wave===3?180:135;
        await installCheckpoint(page,checkpoint(profile,run));await page.goto('/');await holdCombat(page);await tap(page,'home:dispatch');
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
        for(const tick of [limit-1,limit]){
            await page.evaluate(tick=>{
                const {boot}=window.combatQA,p=boot.patrol;
                while(p.inBattle && p.session.battle.tick<tick)p.update(1/30,0,0);
                boot.draw();
            },tick);
            expect((await state(page)).tick).toBe(tick);
            expect((await state(page)).labels.some(l=>l.includes(line))).toBe(tick<limit);
        }
    });
}

test('DEV-01 第二波已有战斗进度时关页，再从波初恢复',async ({page,context})=>{
    const profile=createDefaultProfile(),base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
    const run=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:1,parts:85,level:3,
        weapons:[{uid:1,id:'arc_gun',tier:2}],levelStats:{voltage:6}},profile);
    await installCheckpoint(page,checkpoint(profile,run));await page.goto('/');await tap(page,'home:dispatch');
    await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().tick>=30);
    await page.close();
    const reopened=await context.newPage();await reopened.goto('/');await holdCombat(reopened);await tap(reopened,'home:dispatch');
    await reopened.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
    expect((await state(reopened)).tick).toBe(0);
    expect((await state(reopened)).wave).toBe(2);
    const saved=await readSave(reopened);
    expect(saved.run).toMatchObject({parts:85,level:3,weapons:run.weapons,levelStats:{voltage:6},seed:5,runId:run.runId});
});
