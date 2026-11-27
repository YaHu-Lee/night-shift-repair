import { expect, test } from '@playwright/test';
import { state, tap, screen } from './canvas.mjs';
import { readSave, checkpoint, installCheckpoint } from './campaign-fixtures.mjs';
import { PatrolSession, createDefaultProfile } from '../../.m0-build/roguelite/session.js';

async function playAd(page, key, outcome, info) {
    const dialog = page.getByRole('dialog', {name:'模拟激励视频'});
    await expect(async () => {
        if (!await dialog.isVisible()) await tap(page, key);
        await expect(dialog).toBeVisible({timeout:1200});
    }).toPass({timeout:10000});
    if (info) await dialog.screenshot({path:info.outputPath('mock-ad.png')});
    if (outcome === '看完并返回') await expect(dialog.getByText('模拟播放完成')).toBeVisible();
    await dialog.getByRole('button', {name:outcome}).click();
    await expect(dialog).toHaveCount(0);
}

test('AD-04、AD-07 模拟升级和商店视频，取消、失败、重试和局内限额', async ({ page }, info) => {
    await page.goto('/?patrolDebug=levelup&mockAd=1');
    const extra = 'shop:看视频多选一项';
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().pendingLevelUps > 0);
    const picks = (await state(page)).pendingLevelUps;
    await playAd(page, extra, '提前关闭', info);
    expect((await state(page)).pendingLevelUps).toBe(picks);
    await expect.poll(async () => (await state(page)).labels).toContain('看完视频才能领取奖励。');
    await playAd(page, extra, '模拟加载失败');
    expect((await state(page)).pendingLevelUps).toBe(picks);
    await expect.poll(async () => (await state(page)).labels).toContain('视频暂时播不了，请稍后再试。');
    await playAd(page, extra, '看完并返回');
    await expect.poll(async () => (await state(page)).pendingLevelUps).toBe(picks + 1);
    expect((await state(page)).hitAreas.map(a => a.key)).not.toContain(extra);
    for (let i = picks + 1; i > 0; i--) await tap(page, 'shop:选择');
    const copper = (await state(page)).parts;
    const aid = 'shop:看视频领 20 铜件';
    await playAd(page, aid, '提前关闭');
    expect((await state(page)).parts).toBe(copper);
    for (let i = 1; i <= 2; i++) {
        await playAd(page, aid, '看完并返回');
        await expect.poll(async () => (await readSave(page))?.run.shopAdUsed).toBe(i);
        expect((await state(page)).parts).toBe(copper + 20 * i);
        await tap(page, 'shop:免费刷新');
        expect((await state(page)).parts).toBe(copper + 20 * i);
    }
    expect((await state(page)).hitAreas.map(a => a.key)).not.toContain(aid);
    await page.goto('/?mockAd=1');
    await tap(page, 'home:dispatch');
    expect((await state(page)).parts).toBe(copper + 40);
    expect((await state(page)).hitAreas.map(a => a.key)).not.toContain(aid);
});

test('AD-05、AD-06 模拟出发补给和结算追加凭证', async ({ page }) => {
    await page.goto('/?patrolDebug=prep&mockAd=1');
    await tap(page, 'prep:选择工装 ›');
    await tap(page, 'prep:›');
    await tap(page, 'prep:›');
    const supply = 'prep:看视频领取补给并出发 ›';
    await playAd(page, supply, '提前关闭');
    expect((await state(page)).page).toBe('prep');
    await playAd(page, supply, '看完并返回');
    await expect.poll(async () => (await readSave(page))?.profile.daily.adPrepUsed).toBe(1);
    expect((await readSave(page)).run).toMatchObject({supply:'spare_parts',parts:35});
    await page.goto('/?patrolDebug=result&mockAd=1');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().hitAreas.some(a => a.key.includes('看视频再领')));
    const before = await state(page);
    const key = before.hitAreas.find(a => a.key.includes('看视频再领')).key;
    const amount = Number(key.match(/再领 (\d+) 凭证/)[1]);
    expect(amount).toBeGreaterThan(0);
    await playAd(page, key, '提前关闭');
    expect((await state(page)).credits).toBe(before.credits);
    await playAd(page, key, '看完并返回');
    await expect.poll(async () => (await readSave(page))?.profile.credits).toBe(before.credits + amount);
    await expect.poll(async () => (await state(page)).labels).toContain('基础奖励已翻倍');
    expect((await state(page)).hitAreas.map(a => a.key)).not.toContain(key);
    await page.goto('/?mockAd=1');
    await tap(page, 'home:duty');
    expect((await state(page)).credits).toBe(before.credits + amount);
});

test('AD-01 默认 Web 的准备、升级、商店和结算隐藏视频入口', async ({ page }) => {
    for (const target of ['prep','levelup','shop','result']) {
        await page.goto('/?patrolDebug=' + target);
        if (target === 'prep') {
            await tap(page, 'prep:选择工装 ›');
            await tap(page, 'prep:›');
        }
        await page.waitForFunction(stage => {
            const s = globalThis.__nightShiftCampaignState?.();
            return s?.page === (stage === 'levelup' ? 'shop' : stage) && s.hitAreas.length > 0;
        }, target);
        expect((await state(page)).hitAreas.some(a => a.key.includes('看视频'))).toBe(false);
    }
});

for (const wave of [2,12]) {
    test('AD-0' + (wave === 2 ? 2 : 3) + ' 低血量测试档自然阵亡后模拟视频复活，第 ' + wave + ' 波', async ({ page }) => {
        test.setTimeout(90000);
        const profile = createDefaultProfile();
        const initial = new PatrolSession({chapterId:'01',rigId:'duty_standard',seed:5,profile});
        const input = {...initial.snapshot(),waveIndex:wave - 1,currentHp:4,parts:37,weapons:[{uid:1,id:'arc_gun',tier:1}]};
        const session = PatrolSession.fromSnapshot(input,profile);
        await installCheckpoint(page,checkpoint(profile,session));
        const battle = session.battle;
        while (session.phase === 'battle') session.stepBattle(0,0);
        expect(session.phase).toBe('lost');
        const bossAtDefeat = battle.bossView;
        await page.goto('/?mockAd=1');
        await tap(page,'home:dispatch');
        const revive = 'revive:看视频复活';
        await playAd(page,revive,'提前关闭');
        expect((await state(page)).page).toBe('revive');
        expect((await readSave(page)).run.revivesUsed ?? 0).toBe(0);
        await playAd(page,revive,'看完并返回');
        await expect.poll(async () => (await readSave(page)).run.revivesUsed).toBe(1);
        const resumed = await state(page);
        expect(resumed.page).toBe('battle');
        expect(resumed.wave).toBe(wave);
        expect((await readSave(page)).run.weapons).toEqual(input.weapons);
        expect(resumed.parts).toBe(input.parts);
        if (wave === 12) {
            expect(bossAtDefeat.hp).toBeLessThan(bossAtDefeat.maxHp);
            expect(resumed.boss.hp).toBe(bossAtDefeat.hp);
            expect(resumed.tick).toBeGreaterThanOrEqual(battle.tick);
            expect(resumed.hp).toBe(Math.ceil(resumed.maxHp * 0.6));
        } else {
            expect(resumed.hp).toBe(resumed.maxHp);
            expect(resumed.tick).toBeLessThan(battle.tick);
        }
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().page === 'result',null,{timeout:60000});
        expect((await readSave(page)).run).toBeNull();
    });
}
