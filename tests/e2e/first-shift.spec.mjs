import { test, expect } from '@playwright/test';
import { state, tap, screen } from './canvas.mjs';
import { readSave } from './campaign-fixtures.mjs';

for (const [label, image] of [
    ['最后一页敌机贴图', '**/campaign-ch01/native/**/586718d0-6f85-4d7f-a66f-07df0e5a377e*.png'],
    ['战斗界面图集', '**/resources/native/**/58fb5f6d-4f6b-4594-909f-5bcd3d7230a5*.png'],
]) {
    test('NEW-01 首访等待' + label + '，加载期间不计时', async ({ page }, info) => {
        let pending;
        await page.route(image, route => { pending = route; });
        await page.goto('/', { waitUntil:'domcontentloaded' });
        await expect.poll(() => !!pending).toBe(true);
        await expect.poll(async () => (await state(page))?.labels).toContain('正在加载战斗资源…');
        expect(await state(page)).toMatchObject({battleArtReady:false,battleVisible:false,loadingAnimation:true,tick:0});
        expect((await state(page)).hitAreas).toHaveLength(0);
        const canvas = page.locator('#GameCanvas');
        const firstFrame = await canvas.screenshot({ path: info.outputPath('waiting-for-art.png') });
        await expect.poll(async () => firstFrame.equals(await canvas.screenshot())).toBe(false);
        await screen(page, info, 'loading-pulse');
        expect((await state(page)).tick).toBe(0);

        await pending.continue();
        await page.waitForFunction(() => {
            const s = globalThis.__nightShiftCampaignState();
            return s.battleArtReady && s.battleVisible && !s.loadingAnimation && s.tick > 0;
        });
        expect((await readSave(page)).run).toMatchObject({chapterId:'01',waveIndex:0});
        await screen(page, info, 'first-battle-ready');
    });
}

test('NEW-01 至 NEW-04 新档触控、升级、首店合成和续玩', async ({ page, context }, info) => {
    test.setTimeout(150000);
    // Pick a seed with enough copper for the tutorial purchase before auto-start.
    await page.addInitScript(() => {
        if (sessionStorage.getItem('seeded-first-launch')) return;
        sessionStorage.setItem('seeded-first-launch', '1');
        window.realDateNow = Date.now;
        const target = (3787 ^ Math.imul(17, 2654435761)) >>> 0;
        const epoch = Math.floor(Date.now() / 2 ** 32) * 2 ** 32;
        Date.now = () => epoch + target;
    });
    await page.goto('/');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().battleVisible);
    await page.evaluate(() => { Date.now = window.realDateNow; });
    const start = await state(page);
    expect(start).toMatchObject({page:'battle', battleArtReady:true, wave:1});
    expect(start.hitAreas.some(area => area.key === 'home:dispatch')).toBe(false);
    expect(start.stick.x).toBeGreaterThan(180);
    expect(start.labels).toContain('拖动摇杆移动，武器会自动攻击。');
    const box = await page.locator('#GameCanvas').boundingBox();
    const scale = Math.min(box.width / 360, box.height / 640);
    const x = box.x + box.width / 2 + (start.stick.x - 180) * scale;
    const y = box.y + box.height / 2 - (start.stick.y - 320) * scale;
    const input = await context.newCDPSession(page);
    await input.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
    await input.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x + 28 * scale,y}]});
    await page.waitForFunction(tick => globalThis.__nightShiftCampaignState().tick >= tick + 30, start.tick);
    await input.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
    const after = await state(page);
    expect(after.player.x).toBeGreaterThan(start.player.x + 10);
    expect(after.labels).not.toContain('拖动摇杆移动，武器会自动攻击。');
    await page.waitForFunction(tick => globalThis.__nightShiftCampaignState().tick > tick + 5, after.tick);
    expect((await state(page)).player).toEqual(after.player);
    await tap(page, 'battle:暂停');
    await tap(page, 'battle:返回值班室 · 保存进度');
    await expect.poll(async () => (await readSave(page))?.run?.seed).toBe(3787);
    await page.reload();
    await tap(page, 'home:dispatch');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().labels.some(label => /^铜件 [1-9]/.test(label)), null, {timeout:60000});
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().pendingLevelUps > 0, null, {timeout:60000});
    for (let pending = (await state(page)).pendingLevelUps; pending > 0; pending--) {
        // While a checkpoint is being written the four cards briefly have no hit areas.
        await expect.poll(async () => (await state(page)).hitAreas.filter(a => a.key === 'shop:选择').length).toBe(4);
        await tap(page, 'shop:选择');
        await expect.poll(async () => (await state(page)).pendingLevelUps).toBe(pending - 1);
    }
    const shop = await state(page);
    const offer = shop.shopOffers[0];
    expect(offer).toMatchObject({id:'wrench',tier:1,sold:false});
    expect(shop.parts).toBeGreaterThanOrEqual(offer.price);
    await tap(page, 'shop:买:wrench:1:购买 · ' + offer.price + ' 铜件');
    await expect.poll(async () => (await state(page)).parts).toBe(shop.parts - offer.price);
    await expect.poll(async () => (await state(page)).labels).toContain('点下方带绿点的武器，查看合成。');
    await tap(page, 'shop:weapon-1');
    await tap(page, 'shop:merge-1');
    await expect.poll(async () => (await readSave(page))?.run?.weapons.map(w => [w.id,w.tier])).toEqual([['wrench',2]]);
    await screen(page, info, 'first-merge');
    await tap(page, 'shop:开始第 2 波');
    await expect.poll(async () => (await readSave(page)).run.waveIndex).toBe(1);
    await page.reload();
    await tap(page, 'home:dispatch');
    expect((await state(page)).wave).toBe(2);
    expect((await state(page)).page).toBe('battle');
});

test('RET-01 签到、免费补给和跨重启单次消费', async ({ page }) => {
    await page.goto('/?patrolDebug=home');
    await tap(page, 'home:duty');
    await tap(page, 'duty:签到 +20 凭证');
    await expect.poll(async () => (await readSave(page))?.profile.daily?.freeSupplyCharges).toBe(1);
    await page.reload();
    await tap(page, 'home:duty');
    expect((await state(page)).labels).toContain('今日已签到 ✓');
    await tap(page, 'duty:‹ 值班室');
    await tap(page, 'home:dispatch');
    await tap(page, 'prep:选择工装 ›');
    await tap(page, 'prep:›');
    await tap(page, 'prep:›');
    expect((await state(page)).supply).toBe('spare_parts');
    await tap(page, 'prep:用签到补给出发');
    await expect.poll(async () => (await readSave(page))?.run?.supply).toBe('spare_parts');
    const saved = await readSave(page);
    expect(saved.profile.credits).toBe(20);
    expect(saved.profile.daily.freeSupplyCharges).toBe(0);
    expect(saved.run.parts).toBe(35);
    await page.reload();
    await tap(page, 'home:dispatch');
    expect((await state(page)).parts).toBe(35);
    expect((await state(page)).credits).toBe(20);
});
