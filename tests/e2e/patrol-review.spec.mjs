import { test, expect } from '@playwright/test';

import { state, tap, screen, openReport } from './canvas.mjs';

test('值班室入口、图鉴、暂停设置与摇杆位置', async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/?patrolDebug=home');
    await expect.poll(async () => (await state(page))?.page).toBe('home');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().homeArtReady);
    await screen(page, info, 'home');
    for (const [shelf, item] of [['weapons', 'arc_gun'], ['equipment', 'copper_knuckle']]) {
        await tap(page, 'home:' + shelf);
        await tap(page, shelf + ':' + item);
        await screen(page, info, shelf);
        await tap(page, shelf + ':‹ 列表');
        await tap(page, shelf + ':下一页');
        await tap(page, shelf + ':上一页');
        await tap(page, shelf + ':‹ 值班室');
    }
    await tap(page, 'home:workshop');
    await tap(page, 'workshop:‹ 值班室');
    await tap(page, 'home:log');
    await tap(page, 'log:‹ 返回');
    await tap(page, 'home:duty');
    await tap(page, 'duty:‹ 值班室');
    await tap(page, 'home:dispatch');
    await tap(page, 'battle:暂停');
    const frozen = (await state(page)).tick;
    await tap(page, 'battle:设置');
    const initial = await state(page);
    expect(initial.stick.visible).toBe(true);
    await tap(page, 'settings:靠左');
    const left = await state(page);
    expect(left.stick.x).toBeLessThan(initial.stick.x);
    await tap(page, 'settings:＋', 0);
    expect((await state(page)).stick.y).toBe(left.stick.y + 8);
    await tap(page, 'settings:＋', 1);
    expect((await state(page)).stick.x).toBe(left.stick.x + 8);
    await screen(page, info, 'stick');
    await tap(page, 'settings:‹ 暂停');
    expect((await state(page)).paused).toBe(true);
    expect((await state(page)).tick).toBe(frozen);
    await tap(page, 'battle:继续战斗');
    await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(frozen);
    expect((await state(page)).autoMovement).toBe(false);
    await page.reload();
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().page === 'home');
    expect((await state(page)).settings.stickPlacement).toBe('left');
    expect(errors).toEqual([]);
});

test('路线与工装分步、整备详情、结算统计', async ({ page }, info) => {
    await page.goto('/?patrolDebug=prep');
    await tap(page, 'prep:选择工装 ›');
    expect((await state(page)).labels).toContain('工装与补给');
    await screen(page, info, 'loadout');
    await tap(page, 'prep:‹ 路线');
    const chapterLabels = (await state(page)).labels;
    expect(chapterLabels).toContain('点亮江岸');
    expect(chapterLabels).not.toContain('选择路线');
    expect(chapterLabels.some(label => label.includes(' › '))).toBe(false);
    await page.goto('/?patrolDebug=shop');
    await tap(page, 'shop:属性与羁绊');
    const { labels } = await state(page);
    expect(labels).toEqual(expect.arrayContaining(['近战 2', '电弧 2', '穿甲 0', '火焰 0', '控场 0',
        '近战攻击范围 +12%', '电弧可多连锁 1 次']));
    expect(labels.filter(label => label === '未激活')).toHaveLength(3);
    expect(labels.some(label => label.includes('把效果') || label.includes('多连锁 3 次'))).toBe(false);
    await screen(page, info, 'synergies');
    await tap(page, 'shop:‹ 回商店');
    await tap(page, 'shop:detail-0');
    const shelf = (await state(page)).page;
    expect(['weapons', 'equipment']).toContain(shelf);
    await tap(page, shelf + ':‹ 整备');
    await page.goto('/?patrolDebug=result');
    await openReport(page);
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().hitAreas.some(a => a.key === 'result:查看武器伤害'));
    // Result transitions briefly guard against accidental purchases or navigation.
    await expect(async () => {
        await tap(page, 'result:查看武器伤害');
        expect((await state(page)).labels).toContain('收起伤害统计');
    }).toPass({timeout:3000});
    await tap(page, 'result:收起伤害统计');
});

test('连锁命中的真实战斗帧与内部自动移动', async ({ page }, info) => {
    await page.goto('/?patrolDebug=arc');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().tick === 709);
    const links = (await state(page)).arcs.filter(a => a.hop > 0 && a.life <= 7);
    expect(links.map(a => a.hop)).toEqual([1, 2]);
    expect(links[1].from).toEqual({ x: links[0].x, y: links[0].y });
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState()?.battleVisible);
    await screen(page, info, 'arc');
    await page.goto('/?autoMove=1');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().battleVisible);
    const start = (await state(page)).player;
    await expect.poll(async () => {
        const p = (await state(page)).player;
        return Math.hypot(p.x - start.x, p.y - start.y);
    }).toBeGreaterThan(10);
    expect((await state(page)).autoMovement).toBe(true);
});

test('微信加速度计回调驱动位移、暂停解绑与断流回退', async ({ page }) => {
    await page.addInitScript(() => {
        let listener;
        globalThis.testMotion = {
            emit(x, y) { listener?.({ x, y, z: 0.8 }); },
            subscribed() { return !!listener; },
        };
        globalThis.wx = {
            getStorageSync: key => localStorage.getItem(key) ?? '',
            setStorageSync: (key, value) => localStorage.setItem(key, value),
            onAccelerometerChange(fn) { listener = fn; },
            offAccelerometerChange(fn) { if (listener === fn) listener = undefined; },
            startAccelerometer() {},
            stopAccelerometer() {},
        };
    });
    await page.goto('/?patrolDebug=home');
    await tap(page, 'home:设置');
    await tap(page, 'settings:体感移动');
    expect((await state(page)).settings.movement).toBe('tilt');
    await tap(page, 'settings:‹ 返回');
    await tap(page, 'home:dispatch');
    await page.waitForFunction(() => testMotion.subscribed());
    const start = (await state(page)).player;
    await page.evaluate(() => {
        testMotion.emit(0.02, -0.4);
        for (let i = 0; i < 8; i++) testMotion.emit(0.5, -0.4);
    });
    await expect.poll(async () => (await state(page)).player.x - start.x).toBeGreaterThan(8);
    await tap(page, 'battle:暂停');
    await expect.poll(() => page.evaluate(() => testMotion.subscribed())).toBe(false);
    await tap(page, 'battle:继续战斗');
    await page.waitForFunction(() => testMotion.subscribed());
    const rest = (await state(page)).player;
    await page.evaluate(() => testMotion.emit(0.5, -0.4));
    await page.waitForFunction(() => !testMotion.subscribed());
    expect((await state(page)).player).toEqual(rest);
    const box = await page.locator('#GameCanvas').boundingBox();
    await page.touchscreen.tap(box.x + box.width * 0.68, box.y + box.height / 2);
    await expect.poll(async () => (await state(page)).player.x - rest.x).toBeGreaterThan(5);
});
