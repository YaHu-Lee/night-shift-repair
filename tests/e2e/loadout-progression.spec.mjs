import {expect,test} from '@playwright/test';
import {createDefaultProfile} from '../../.m0-build/roguelite/session.js';
import {mergeWorkshopProfiles} from '../../.m0-build/roguelite/engagement.js';
import {checkpoint,installCheckpoint,readSave} from './campaign-fixtures.mjs';
import {tap,state} from './canvas.mjs';

async function chooseWeapon(page, id) {
    for (let i=0;i<3;i++) {
        if ((await state(page)).hitAreas.some(a=>a.key==='weapons:'+id)) {
            await tap(page,'weapons:'+id); return;
        }
        await tap(page,'weapons:下一页');
    }
    throw Error('图鉴缺少武器 '+id);
}

test('武器架给出解锁目标，并带新玩家前往可打的前置章节',async ({page})=>{
    await page.goto('/?patrolDebug=home');
    await tap(page,'home:weapons');
    await chooseWeapon(page,'patrol_welder');
    expect((await state(page)).labels.join(' ')).toContain('未解锁 · 通关「天亮前合闸」难度 1');
    await tap(page,'weapons:前往挑战');
    expect((await state(page)).chapter).toBe('01');
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:试穿');
    await tap(page,'prep:结束试用');
    expect((await state(page)).hitAreas.some(a=>a.key.startsWith('prep:开始抢修'))).toBe(true);
});

test('两份本地夹具合并后解锁的改装可在整备选择，存入实战快照',async ({page})=>{
    const local = {...createDefaultProfile(),onboardingDone:true,clearedChapters:['01'],maxDangerCleared:{'01':2}};
    const remote = {...createDefaultProfile(),clearedChapters:['01','02'],maxDangerCleared:{'01':1,'02':3}};
    const profile = mergeWorkshopProfiles(local,remote);
    await installCheckpoint(page,checkpoint(profile));
    await page.goto('/');
    await tap(page,'home:dispatch');
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:试穿');
    const demo = await page.evaluate(async () => {
        const cc=await System.import('cc');
        const battle=cc.director.getScene().getComponentInChildren('M1Bootstrap').patrol.trial;
        return {rank:battle.rigRank,tools:battle.runtimes.map(r=>r.instance.id)};
    });
    expect(demo).toEqual({rank:4,tools:['wrench','arc_gun','torch']});
    await tap(page,'prep:结束试用');
    await tap(page,'prep:武器改装');
    await chooseWeapon(page,'rebound_saw');
    await tap(page,'weapons:改装 · 原装');
    await expect.poll(async ()=>(await readSave(page)).profile.weaponMods?.rebound_saw).toBe('saw_fork');
    await tap(page,'weapons:‹ 列表');
    await tap(page,'weapons:‹ 出发准备');
    const launch=(await state(page)).hitAreas.find(a=>a.key.startsWith('prep:开始抢修'));
    await tap(page,launch.key);
    await expect.poll(async ()=>(await readSave(page)).run?.weaponMods?.rebound_saw).toBe('saw_fork');
    expect((await readSave(page)).run.rigRank).toBe(4);
    await page.reload();
    await tap(page,'home:dispatch');
    expect((await readSave(page)).run.weaponMods.rebound_saw).toBe('saw_fork');
});
