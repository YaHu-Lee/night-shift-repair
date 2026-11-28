import { test, expect } from '@playwright/test';
import { tap, state, openReport } from './canvas.mjs';
import { checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { createDefaultProfile } from '../../.m0-build/roguelite/session.js';
import { consumeDailyAdUse, getDailyShift, todayDateKey } from '../../.m0-build/roguelite/engagement.js';

test('AD-05 锁定工装用最后一次模拟视频试用，补给共用额度', async ({page}) => {
    const profile = consumeDailyAdUse({...createDefaultProfile(),onboardingDone:true},'prep',todayDateKey());
    await installCheckpoint(page,checkpoint(profile));
    await page.goto('/?mockAd=1');
    await tap(page,'home:dispatch');
    await tap(page,'prep:选择工装 ›');
    const locked = (await state(page)).hitAreas.find(a => a.key.includes('锁定')).key;
    await tap(page,locked);
    const rig = (await state(page)).rig;
    const trial = (await state(page)).hitAreas.find(a => a.key.includes('看视频试用')).key;
    await tap(page,trial);
    const dialog = page.getByRole('dialog',{name:'模拟激励视频'});
    await dialog.getByRole('button',{name:'提前关闭'}).click();
    expect((await readSave(page)).profile.daily.adPrepUsed).toBe(1);
    await tap(page,trial);
    await dialog.getByRole('button',{name:'看完并返回'}).click();
    await expect.poll(async () => (await readSave(page)).run?.trialRig).toBe(true);
    const saved = await readSave(page);
    expect(saved.run.rigId).toBe(rig);
    expect(saved.profile.unlockedRigs).not.toContain(rig);
    expect(saved.profile.daily.adPrepUsed).toBe(2);
    // Reopen preparation using the debug route; it reads the profile from that same ordinary save.
    await page.goto('/?patrolDebug=prep&mockAd=1');
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:江岸');
    await tap(page,'prep:›');
    expect((await state(page)).hitAreas.some(a => a.key.includes('看视频'))).toBe(false);
    expect((await state(page)).hitAreas.map(a => a.key)).toContain('prep:不带补给出发');
    await tap(page,locked);
    expect((await state(page)).hitAreas.some(a => a.key.includes('试用'))).toBe(false);
});

test('RUN-13 缺少凭证时可不带补给出发', async ({page}) => {
    await installCheckpoint(page,checkpoint({...createDefaultProfile(),credits:2}));
    await page.goto('/');
    await tap(page,'home:dispatch');
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:›');
    await tap(page,'prep:›');
    expect((await state(page)).labels).toContain('还差 13 凭证。');
    await tap(page,'prep:不带补给出发');
    await expect.poll(async () => (await readSave(page)).run?.phase).toBe('battle');
    expect((await readSave(page)).run.supply ?? 'none').toBe('none');
    expect((await readSave(page)).profile.credits).toBe(2);
    expect((await state(page)).parts).toBe(0);
});

test('RET-02 次日重开后重新签到，今日委托使用当日词条和工装', async ({page}) => {
    const yesterday = {...createDefaultProfile(),credits:20,onboardingDone:true,daily:{
        dateKey:'2026-11-27',checkInClaimed:true,dailyShiftCleared:true,adPrepUsed:2,adDoubleUsed:3,
    }};
    const daily = getDailyShift('2026-11-28');
    await installCheckpoint(page,checkpoint(yesterday));
    await page.clock.setFixedTime(new Date(2026,10,28,12));
    await page.goto('/');
    await tap(page,'home:duty');
    await tap(page,'duty:签到 +20 凭证');
    await expect.poll(async () => (await readSave(page)).profile.credits).toBe(40);
    const current = (await readSave(page)).profile.daily;
    expect(current.dateKey).toBe(daily.dateKey);
    expect(current.adPrepUsed ?? 0).toBe(0);
    expect(current.adDoubleUsed ?? 0).toBe(0);
    expect(current.dailyShiftCleared ?? false).toBe(false);
    await tap(page,'duty:查看');
    expect((await state(page)).labels).toContain(daily.modifier.name);
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:开始今日委托');
    await expect.poll(async () => (await readSave(page)).run?.dailyShiftKey).toBe(daily.dateKey);
    expect((await readSave(page)).run).toMatchObject({chapterId:daily.chapterId,rigId:daily.rigId,seed:daily.seed,dailyMod:daily.modifier.id});
});

test('RET-03 模拟分享面板收到实际战报文案并返回值班室', async ({page}) => {
    await page.addInitScript(() => {
        window.shareCalls = [];
        window.wx = {
            getStorageSync:key => localStorage.getItem(key) ?? '',
            setStorageSync:(key,value) => localStorage.setItem(key,value),
            shareAppMessage:payload => window.shareCalls.push(payload),
        };
    });
    await page.goto('/?patrolDebug=result');
    await openReport(page);
    await expect(async () => {
        await tap(page,'result:分享战报');
        expect(await page.evaluate(() => window.shareCalls.length)).toBe(1);
    }).toPass({timeout:5000});
    const [share] = await page.evaluate(() => window.shareCalls);
    expect(share.title).toContain('打通了「点亮江岸」');
    expect(share.title).toContain('主力武器：电弧扳手');
    expect(share.desc).toContain('击毁 1082 台敌机 · 难度 0');
    await tap(page,'result:返回值班室');
    expect((await state(page)).page).toBe('home');
});
