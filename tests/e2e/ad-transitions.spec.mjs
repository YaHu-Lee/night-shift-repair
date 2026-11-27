import {expect, test} from '@playwright/test';
import {createDefaultProfile, PatrolSession} from '../../.m0-build/roguelite/session.js';
import {checkpoint, installCheckpoint, readSave, playWave} from './campaign-fixtures.mjs';
import {point, state, tap} from './canvas.mjs';
import {finishWave, holdCombat} from './combat-clock.mjs';

const advanceWall = (page, ms) => page.evaluate(ms => { window.touchTime += ms; }, ms);

async function setup(page, profile, run) {
    await installCheckpoint(page, checkpoint(profile,run));
    await page.goto('/?mockAd=1');
    await holdCombat(page);
    await page.evaluate(() => {
        window.touchTime = Date.now();
        Date.now = () => window.touchTime;
        window.adCount = 0;
        new MutationObserver(records => {
            for (const record of records) for (const node of record.addedNodes) {
                if (node.nodeType === 1 && node.matches('dialog[aria-label="模拟激励视频"]')) window.adCount++;
            }
        }).observe(document.body,{childList:true,subtree:true});
    });
}

async function verifyEntry(page, input, key, held = false) {
    const [x,y] = await point(page,key);
    const gesture = type => input.send('Input.dispatchTouchEvent',{type,touchPoints:type === 'touchEnd' ? [] : [{x,y}]});
    if (held) {
        await gesture('touchMove');
        await gesture('touchEnd');
    }
    const dialog = page.getByRole('dialog',{name:'模拟激励视频'});
    const count = () => page.evaluate(() => window.adCount);
    const initial = await count();
    if (held) expect(initial).toBe(0);
    const save = await readSave(page);
    for (let i = 0; i < 3; i++) await page.touchscreen.tap(x,y);
    expect(await count(), '残留连点打开了模拟视频').toBe(initial);
    await advanceWall(page,100);
    await gesture('touchStart');
    await advanceWall(page,350);
    await gesture('touchEnd');
    expect(await count(),'保护期内开始的长按在松手时打开了视频').toBe(initial);
    expect(await readSave(page)).toEqual(save);

    // A fresh press after the boundary opens exactly one video. Both failure
    // branches leave the full saved checkpoint intact and allow a deliberate retry.
    for (const [i,outcome] of ['提前关闭','模拟加载失败'].entries()) {
        await page.touchscreen.tap(x,y);
        await expect(dialog).toBeVisible();
        expect(await count()).toBe(initial+i+1);
        await dialog.getByRole('button',{name:outcome}).click();
        await expect(dialog).toHaveCount(0);
        await page.waitForFunction(key => globalThis.__nightShiftCampaignState().hitAreas.some(a => a.key === key),key);
        await expect.poll(async () => (await state(page)).labels).toContain(i ? '视频暂时播不了，请稍后再试。' : '看完视频才能领取奖励。');
        expect(await readSave(page)).toEqual(save);
        await page.touchscreen.tap(x,y);
        expect(await count(),'视频关闭后的残留点击再次打开了视频').toBe(initial+i+1);
        // Advance the same component clock used by Creator for the 2.4s toast.
        await page.evaluate(()=>{
            const {boot}=window.combatQA;
            for(let frame=0;frame<26;frame++)boot.update(.1);
            boot.draw();
        });
        const labels=(await state(page)).labels;
        expect(labels).not.toContain('看完视频才能领取奖励。');
        expect(labels).not.toContain('视频暂时播不了，请稍后再试。');
        await advanceWall(page,500);
    }
}

for (const variant of ['locked','poor','affordable']) {
    test('AD-07/08 准备页防误触 ' + variant, async ({page,context}) => {
        const profile = {...createDefaultProfile(),onboardingDone:true,credits:variant === 'affordable' ? 50 : 0};
        await setup(page,profile);
        await tap(page,'home:dispatch');
        await tap(page,'prep:选择工装 ›');
        if (variant === 'locked') {
            await tap(page,(await state(page)).hitAreas.find(a=>a.key.includes('锁定')).key);
        } else {
            await tap(page,'prep:›');
            if (variant === 'poor') await tap(page,'prep:›');
        }
        const key = (await state(page)).hitAreas.find(a=>a.key.includes('看视频'))?.key;
        expect(key).toContain(variant === 'locked' ? '试用' : '补给');
        await verifyEntry(page,await context.newCDPSession(page),key);
    });
}

for (const wave of [1,2,12]) {
    test('AD-07/08 摇杆跨页、连点和长按 第 '+wave+' 波',async ({page,context}) => {
        const profile = createDefaultProfile();
        const fresh = new PatrolSession({chapterId:'01',rigId:'duty_standard',seed:5,profile});
        if (wave > 1) {
            playWave(fresh);
            expect(fresh.reports[0].cleared).toBe(true);
        }
        const run = PatrolSession.fromSnapshot({...fresh.snapshot(),waveIndex:wave-1,currentHp:wave===1 ? 70 : 4,
            phase:'battle',intermission:null,
            xp:wave===1 ? 20 : 0,weapons:[{uid:1,id:'arc_gun',tier:wave===1 ? 4 : 1}]},profile);
        await setup(page,profile,run);
        await tap(page,'home:dispatch');
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleVisible);
        const box = await page.locator('#GameCanvas').boundingBox();
        const scale = Math.min(box.width/360,box.height/640);
        const {stick} = await state(page);
        const input = await context.newCDPSession(page);
        await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{
            x:box.x+box.width/2+(stick.x-180)*scale,y:box.y+box.height/2-(stick.y-320)*scale}]});
        await finishWave(page);
        if (wave===1) {
            await verifyEntry(page,input,'shop:看视频多选一项',true);
            while ((await state(page)).pendingLevelUps) await tap(page,'shop:选择');
            await verifyEntry(page,input,'shop:看视频领 20 铜件');
        } else {
            await verifyEntry(page,input,'revive:看视频复活',true);
            await tap(page,'revive:结束本局');
            await page.waitForFunction(() => globalThis.__nightShiftCampaignState().hitAreas
                .some(area => area.key.startsWith('result:') && area.key.includes('再领')));
            const reward = (await state(page)).hitAreas.find(a=>a.key.includes('再领'));
            expect(reward).toBeDefined();
            await verifyEntry(page,input,reward.key);
        }
    });
}
