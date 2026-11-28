import { expect, test } from '@playwright/test';
import { MODULE_CATALOG, WEAPON_CATALOG } from '../../.m0-build/roguelite/catalog.js';
import { createDefaultProfile } from '../../.m0-build/roguelite/session.js';
import { checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { screen, state, tap } from './canvas.mjs';

async function visibleItems(page, shelf, catalog) {
    const keys = (await state(page)).hitAreas.map(a => a.key);
    return catalog.filter(item => keys.includes(shelf + ':' + item.id)).map(item => item.id);
}

test('装备按正向属性和特殊效果筛选，详情返回保留筛选', async ({ page }, info) => {
    await page.goto('/?patrolDebug=home');
    await tap(page, 'home:equipment');
    expect(await visibleItems(page, 'equipment', MODULE_CATALOG)).toHaveLength(12);
    await screen(page, info, 'equipment-grid');
    await tap(page, 'equipment:下一页');
    await tap(page, 'equipment:全部属性 ▾');
    await screen(page, info, 'attribute-picker');
    await tap(page, 'equipment:拾取范围');
    expect(await visibleItems(page, 'equipment', MODULE_CATALOG)).toEqual(
        MODULE_CATALOG.filter(m => m.stats.pickupRadius > 0).map(m => m.id));
    await tap(page, 'equipment:scrap_magnet');
    expect((await state(page)).labels).toContain('拾荒磁铁');
    await tap(page, 'equipment:‹ 列表');
    expect((await state(page)).labels).toContain('拾取范围+28%');
    await tap(page, 'equipment:拾取范围 ▾');
    await tap(page, 'equipment:特殊效果');
    expect(await visibleItems(page, 'equipment', MODULE_CATALOG)).toEqual(MODULE_CATALOG.filter(m => m.special).map(m => m.id));
    await tap(page, 'equipment:‹ 值班室');
    await tap(page, 'home:weapons');
    const tools = Object.values(WEAPON_CATALOG);
    expect(await visibleItems(page, 'weapons', tools)).toHaveLength(12);
    await screen(page, info, 'weapon-grid');
    await tap(page, 'weapons:全部流派 ▾');
    await tap(page, 'weapons:近战');
    expect(await visibleItems(page, 'weapons', tools)).toEqual(tools.filter(w => w.tags.includes('melee')).map(w => w.id));
    await tap(page, 'weapons:bypass_wrench');
    expect((await state(page)).labels.join(' ')).toContain('未解锁 · 通关「夺回广播塔」');
    await tap(page, 'weapons:‹ 列表');
    expect((await state(page)).labels).toContain('近战 ▾');
});

test('路线奖励可逐件查看，跨档补发、已领取和锁定预览均与进度一致', async ({ page }, info) => {
    const profile = { ...createDefaultProfile(), onboardingDone: true, clearedChapters: ['01'], maxDangerCleared: { '01': 0 } };
    await installCheckpoint(page, checkpoint(profile));
    await page.goto('/');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().labels.includes('出发'));
    await screen(page, info, 'home-dispatch');
    await tap(page, 'home:dispatch');
    await tap(page, 'prep:‹');
    const claimed = await state(page);
    expect(claimed.labels).toEqual(expect.arrayContaining(['首通奖励', '已领取', '每次通关']));
    expect(claimed.labels).not.toContain('首通加奖');
    expect(claimed.labels).not.toContain('磁力抓钩');
    expect(claimed.hitAreas.some(a => /^prep:(reward-|全部 )/.test(a.key))).toBe(false);
    await screen(page, info, 'claimed-stamp');
    await tap(page, 'prep:credit-0');
    expect((await state(page)).labels).toContain('每次通关');
    expect((await state(page)).hitAreas.some(a => a.key === 'prep:下一项' || a.key === 'prep:上一项')).toBe(false);
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:›');
    expect((await state(page)).labels).not.toContain('已领取');
    expect((await state(page)).labels).not.toContain('选择路线');
    expect((await state(page)).labels.some(label => label.includes('接驳仓 › 冷链库'))).toBe(false);
    await tap(page, 'prep:难度 1');
    await screen(page, info, 'chapter-rewards');
    await tap(page, 'prep:credit-0');
    expect((await state(page)).labels).toEqual(expect.arrayContaining(['首通加奖', '+28 凭证']));
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:reward-1');
    expect((await state(page)).labels.join(' ')).toContain('格挡后近战重击击退');
    expect((await state(page)).hitAreas.some(a => a.key === 'prep:选择工装 ›')).toBe(false);
    await screen(page, info, 'rig-reward-detail');
    await tap(page, 'prep:下一项');
    expect((await state(page)).labels.join(' ')).toContain('难度 0 · 本次一并领取');
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:reward-0');
    expect((await state(page)).labels.join(' ')).toContain(WEAPON_CATALOG.rivet_line.roleText);
    await tap(page, 'prep:‹ 路线');
    const all = (await state(page)).hitAreas.find(a => a.key.startsWith('prep:全部 '));
    await tap(page, all.key);
    expect((await state(page)).labels).toContain('全部奖励');
    await tap(page, 'prep:下一页');
    await tap(page, 'prep:reward-row-6');
    await tap(page, 'prep:‹ 奖励');
    await tap(page, 'prep:上一页');
    await tap(page, 'prep:reward-row-0');
    const details = [];
    while (true) {
        const { labels, hitAreas } = await state(page);
        details.push(labels);
        if (!hitAreas.some(a => a.key === 'prep:下一项')) break;
        await tap(page, 'prep:下一项');
    }
    expect(details).toHaveLength(Number(all.key.match(/全部 (\d+)/)[1]));
    expect(details.at(-2)).toEqual(expect.arrayContaining(['首通加奖', '+28 凭证']));
    expect(details.at(-1)).toEqual(expect.arrayContaining(['每次通关', '+46 凭证']));
    await tap(page, 'prep:‹ 奖励');
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:难度 4');
    expect((await state(page)).hitAreas.some(a => a.key === 'prep:选择工装 ›')).toBe(false);
    await tap(page, 'prep:reward-0');
    expect((await state(page)).labels).toContain('双索绊线');
    expect((await state(page)).labels.join(' ')).toContain('与上一发的落点相连');
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:难度 1');
    await tap(page, 'prep:选择工装 ›');
    expect((await state(page)).labels).toContain('工装与补给');
    const saved = await readSave(page);
    expect(saved.profile.maxDangerCleared).toEqual(profile.maxDangerCleared);
    expect(saved.profile.credits).toBe(profile.credits);
});

test('今日委托展示当日加奖，无尽只预览波次凭证', async ({ page }) => {
    const profile = { ...createDefaultProfile(), onboardingDone: true,
        clearedChapters: ['01', '02', '03', '04'], maxDangerCleared: { '01': 4, '02': 4, '03': 4, '04': 4 } };
    await installCheckpoint(page, checkpoint(profile));
    await page.goto('/');
    await tap(page, 'home:dispatch');
    await tap(page, 'prep:今日委托');
    expect((await state(page)).labels).toContain('已领取');
    await tap(page, 'prep:credit-1');
    expect((await state(page)).labels).toContain('完成今天的指定委托可额外领取一次。');
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:港区无尽');
    expect((await state(page)).labels).toContain('波次奖励');
    await tap(page, 'prep:reward-0');
    expect((await state(page)).labels).toContain('每波 2 凭证');
    expect((await state(page)).hitAreas.some(a => a.key === 'prep:下一项')).toBe(false);
    await tap(page, 'prep:‹ 路线');
    await tap(page, 'prep:选择工装 ›');
    expect((await state(page)).labels).toContain('工装与补给');
});
