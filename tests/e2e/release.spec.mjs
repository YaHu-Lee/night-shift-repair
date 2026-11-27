import { expect, test } from '@playwright/test';
import { screen } from './canvas.mjs';
import { readSave } from './campaign-fixtures.mjs';

test('PKG-01 非调试试玩包首次访问直接开战，调试参数无效', async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.status() >= 400) errors.push(r.status() + ' ' + r.url()); });
    await page.goto('http://127.0.0.1:4393/?patrolDebug=result&mockAd=1&autoMove=1');
    await expect.poll(async () => (await readSave(page))?.run?.phase).toBe('battle');
    const first = (await readSave(page)).run;
    expect(first).toMatchObject({chapterId:'01',waveIndex:0});
    await page.waitForFunction(async () => {
        const cc = await globalThis.System?.import('cc');
        const boot = cc?.director.getScene()?.getComponentInChildren('M1Bootstrap');
        return boot?.patrol?.inBattle && boot.patrol.session.battle.tick > 0 && boot.skin.battleArtReady;
    });
    expect(await page.evaluate(() => typeof globalThis.__nightShiftCampaignState)).toBe('undefined');
    await screen(page, info, 'release-first-battle');
    await page.reload();
    expect((await readSave(page)).run.runId).toBe(first.runId);
    await page.waitForFunction(async () => {
        const cc = await globalThis.System?.import('cc');
        const boot = cc?.director.getScene()?.getComponentInChildren('M1Bootstrap');
        return boot?.patrol?.page === 'home';
    });
    await screen(page, info, 'release-returning-home');
    expect(errors).toEqual([]);
});
