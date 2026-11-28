import { expect, test } from '@playwright/test';
import { readSave, checkpoint, installCheckpoint } from './campaign-fixtures.mjs';
import { tap, state } from './canvas.mjs';
import { createDefaultProfile } from '../../.m0-build/roguelite/session.js';

test('RUN-03 首通前的章节、难度与四套锁定工装', async ({ page }) => {
    await page.goto('/?patrolDebug=prep');
    for (const chapter of ['02','03','04']) {
        await tap(page,'prep:›');
        const s = await state(page);
        expect(s.chapter).toBe(chapter);
        expect(s.labels.some(l => l.includes('未解锁'))).toBe(true);
        expect(s.hitAreas.map(a => a.key)).not.toContain('prep:选择工装 ›');
    }
    for (let i = 0; i < 3; i++) await tap(page,'prep:‹');
    for (let d = 1; d <= 4; d++) {
        await tap(page,'prep:难度 ' + d);
        const s = await state(page);
        expect(s.danger).toBe(d);
        expect(s.hitAreas.map(a => a.key)).not.toContain('prep:选择工装 ›');
    }
    await tap(page,'prep:难度 0');
    await tap(page,'prep:选择工装 ›');
    const locked = (await state(page)).hitAreas.filter(a => a.key.includes('锁定'));
    expect(locked).toHaveLength(4);
    for (const area of locked) {
        await tap(page,area.key);
        expect((await state(page)).hitAreas.some(a => a.key.includes('开始抢修'))).toBe(false);
    }
});

test('NEW-08、RUN-13 工坊扣费、排除配件与带补给出发存档', async ({ page }) => {
    await installCheckpoint(page,checkpoint({...createDefaultProfile(),credits:50}));
    await page.goto('/');
    await tap(page,'home:workshop');
    await tap(page,'workshop:升级 · 10 凭证');
    await expect.poll(async () => (await readSave(page)).profile.talents.chassis).toBe(1);
    await tap(page,'workshop:升级 · 12 凭证',1);
    await expect.poll(async () => (await readSave(page)).profile.talents.ban_permit).toBe(1);
    await tap(page,'workshop:排除配件');
    await tap(page,'workshop:排除');
    await expect.poll(async () => (await readSave(page)).profile.bannedModules.length).toBe(1);
    const banned = (await readSave(page)).profile.bannedModules[0];
    await page.reload();
    await tap(page,'home:dispatch');
    await tap(page,'prep:选择工装 ›');
    await tap(page,'prep:›');
    await tap(page,'prep:›');
    await tap(page,'prep:花 15 凭证出发');
    await expect.poll(async () => (await readSave(page)).profile.credits).toBe(13);
    const saved = await readSave(page);
    expect(saved.run).toMatchObject({supply:'spare_parts',parts:35,currentHp:74});
    expect(saved.profile.bannedModules).toEqual([banned]);
    await page.reload();
    await tap(page,'home:dispatch');
    expect((await state(page)).maxHp).toBe(74);
    expect((await state(page)).credits).toBe(13);
});

test('NEW-05、NEW-06、DEV-02 首店关闭指引、留货、付费刷新、拆解和重启', async ({ page }) => {
    await page.goto('/?patrolDebug=shop');
    await tap(page,'shop:关闭提示');
    await expect.poll(async () => (await readSave(page))?.profile.onboardingDone).toBe(true);
    const before = await state(page);
    const item = before.shopOffers[0];
    const lock = 'shop:留货:' + item.id + ':' + item.tier + ':';
    await tap(page,lock + 'false');
    await page.waitForFunction(key => globalThis.__nightShiftCampaignState().hitAreas.some(a => a.key === key),lock + 'true');
    const refresh = (await state(page)).hitAreas.find(a => /^shop:刷新 ·/.test(a.key));
    expect(refresh).toBeDefined();
    const cost = Number(refresh.key.match(/(\d+) 铜件/)[1]);
    await tap(page,refresh.key);
    await expect.poll(async () => (await state(page)).parts).toBe(before.parts - cost);
    const refreshed = (await state(page)).shopOffers;
    expect(refreshed).toContainEqual({...item,locked:true});
    await page.goto('/');
    await tap(page,'home:dispatch');
    expect((await state(page)).shopOffers).toEqual(refreshed);
    expect((await state(page)).hitAreas.map(a => a.key)).not.toContain('shop:关闭提示');
    await tap(page,lock + 'true');
    await tap(page,'shop:weapon-1');
    const quote = (await state(page)).labels.find(l => l.startsWith('拆解 +'));
    const refund = Number(quote.slice('拆解 +'.length));
    expect(refund).toBeGreaterThan(0);
    await tap(page,'shop:sell-1');
    await expect.poll(async () => (await readSave(page)).run.parts).toBe(before.parts - cost + refund);
    expect((await readSave(page)).run.weapons.some(w => w.uid === 1)).toBe(false);
});

test('DEV-05 音乐和音效独立保存，暂停设置与首页同步', async ({ page }) => {
    await page.goto('/?patrolDebug=home');
    await tap(page,'home:设置');
    await tap(page,'settings:音乐 开');
    expect((await state(page)).settings).toMatchObject({music:false,sound:true});
    await tap(page,'settings:‹ 返回');
    await tap(page,'home:dispatch');
    await tap(page,'battle:暂停');
    await tap(page,'battle:设置');
    await tap(page,'settings:音效 开');
    expect((await state(page)).settings).toMatchObject({music:false,sound:false});
    await tap(page,'settings:音乐 关');
    await page.reload();
    await tap(page,'home:设置');
    expect((await state(page)).settings).toMatchObject({music:true,sound:false});
});
