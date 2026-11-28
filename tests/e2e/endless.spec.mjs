import { test, expect } from '@playwright/test';
import { PatrolSession } from '../../.m0-build/roguelite/session.js';
import { playShop } from '../../scripts/sim-shop.mjs';
import { playWave, chapterCheckpoints, checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { holdCombat, finishWave } from './combat-clock.mjs';
import { tap, state, screen } from './canvas.mjs';

let profile;
const waves = new Map();
const inputs = [];
test.beforeAll(() => {
    profile = chapterCheckpoints().at(-1).profileAfter;
    const session = new PatrolSession({chapterId:'04',rigId:'duty_standard',endlessMode:true,seed:1,profile});
    while (session.phase === 'battle' && session.waveIndex < 15) {
        const boss = [11,14].includes(session.waveIndex);
        if (boss) waves.set(session.waveIndex + 1,checkpoint(profile,session));
        playWave(session,session.waveIndex !== 14,session.waveIndex === 11 ? inputs : undefined);
        if (session.phase === 'shop') { playShop(session); session.startNextWave(); }
    }
    expect(session.phase).toBe('lost');
    expect(session.settle(profile).wavesCleared).toBe(14);
});

test('RUN-07 港区打过第十二波后实进第十三波', async ({page}) => {
    test.setTimeout(120000);
    await installCheckpoint(page,waves.get(12));
    await page.goto('/');
    await holdCombat(page);
    await tap(page,'home:dispatch');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().boss);
    await finishWave(page,inputs);
    expect((await state(page)).page).toBe('shop');
    while ((await state(page)).pendingLevelUps > 0) await tap(page,'shop:选择');
    await expect(async () => {
        if ((await state(page)).page === 'shop') await tap(page,'shop:开始第 13 波');
        expect((await state(page)).wave).toBe(13);
    }).toPass({timeout:6000});
    await expect.poll(async () => (await readSave(page)).run.waveIndex).toBe(12);
    expect((await state(page)).page).toBe('battle');
});

test('RUN-07 港区第十五波首领与最高纪录，较低成绩保留纪录', async ({page,browser,baseURL},info) => {
    test.setTimeout(150000);
    await installCheckpoint(page,waves.get(15));
    await page.goto('/');
    await tap(page,'home:dispatch');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().boss);
    expect((await state(page)).wave).toBe(15);
    await screen(page,info,'endless-15');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().page === 'result',null,{timeout:90000});
    await expect.poll(async () => (await readSave(page)).profile.bestEndlessWave).toBe(14);
    const best = (await readSave(page)).profile;
    await page.reload();
    await tap(page,'home:log');
    await tap(page,'log:通关记录');
    expect((await state(page)).labels).toContain('港区无尽 · 最高完成 14 波');
    // Reuse the actual settled profile with a low-HP wave-one fixture, then let that run lose.
    const nextContext = await browser.newContext({baseURL,hasTouch:true,viewport:info.project.use.viewport});
    const early = new PatrolSession({chapterId:'04',rigId:'duty_standard',endlessMode:true,seed:5,profile:best});
    const injured = PatrolSession.fromSnapshot({...early.snapshot(),currentHp:1},best);
    try {
        const later = await nextContext.newPage();
        await installCheckpoint(later,checkpoint(best,injured));
        await later.goto('/');
        await tap(later,'home:dispatch');
        expect((await readSave(later)).run.runId).toBe(injured.runId);
        await later.waitForFunction(() => globalThis.__nightShiftCampaignState().page === 'result',null,{timeout:40000});
        await expect.poll(async () => (await readSave(later)).run).toBeNull();
        expect((await readSave(later)).profile.bestEndlessWave).toBe(14);
    } finally {
        await nextContext.close();
    }
});
