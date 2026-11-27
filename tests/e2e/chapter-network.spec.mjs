import { test, expect } from '@playwright/test';
import { tap, state, screen } from './canvas.mjs';
import { checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { PatrolSession, createDefaultProfile } from '../../.m0-build/roguelite/session.js';

test('PKG-03 未缓存章节请求失败后原地重试，保留巡线进度', async ({ page }, info) => {
    const profile = {...createDefaultProfile(),clearedChapters:['01'],credits:44,onboardingDone:true};
    const run = new PatrolSession({chapterId:'02',rigId:'duty_standard',seed:42,profile});
    await installCheckpoint(page,checkpoint(profile,run));
    const chapterUrls = '**/assets/campaign-ch02/**';
    let failed = 0;
    await page.route(chapterUrls,route => { failed++; return route.abort('internetdisconnected'); });
    await page.goto('/');
    await tap(page,'home:dispatch');
    await expect.poll(() => failed).toBeGreaterThan(0);
    await expect.poll(async () => (await state(page))?.labels).toContain('战斗资源加载失败');
    expect(await state(page)).toMatchObject({battleVisible:false,tick:0});
    await expect.poll(async () => (await readSave(page))?.run?.runId).toBe(run.runId);
    await page.unroute(chapterUrls);
    const downloaded = [];
    page.on('response',r => { if (r.url().includes('/assets/campaign-ch02/') && r.ok()) downloaded.push(r.url()); });
    await tap(page,'battle:重试加载');
    await expect.poll(() => downloaded.some(u => u.includes('/native/'))).toBe(true);
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
    expect((await state(page)).credits).toBe(44);
    expect((await readSave(page)).run).toMatchObject({runId:run.runId,chapterId:'02',waveIndex:0});
    await screen(page,info,'chapter-02-restored');
});
