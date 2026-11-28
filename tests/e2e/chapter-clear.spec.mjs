import { test, expect } from '@playwright/test';
import {holdCombat, finishWave} from './combat-clock.mjs';
import { state, tap, screen, openReport } from './canvas.mjs';
import { chapterCheckpoints, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { legalStarterWeaponsForRig } from '../../.m0-build/roguelite/progression.js';
import { RIG_CATALOG, WEAPON_CATALOG } from '../../.m0-build/roguelite/catalog.js';
import { CHAPTER_NARRATIVES, homeDispatchStatus } from '../../.m0-build/roguelite/narrative.js';

let saves;
test.beforeAll(() => { saves = chapterCheckpoints(); });

for (const [index, chapter] of ['01', '02', '03', '04'].entries()) {
    test('RUN-0' + (3 + index) + ' 首领、真实首通入账与冷启动 ' + chapter, async ({ page }, info) => {
        test.setTimeout(240000);
        const sample = saves[index];
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await installCheckpoint(page, sample.entries);
        await page.goto('/');
        await holdCombat(page);
        await tap(page, 'home:dispatch');
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().boss);
        expect((await state(page)).wave).toBe(12);
        await screen(page, info, 'boss-' + chapter);
        await finishWave(page, sample.inputs);
        await expect.poll(async ()=>(await state(page)).page).toBe('result');
        await expect.poll(async ()=>(await state(page)).hitAreas.map(a=>a.key)).toContain('result:查看战报');
        await screen(page, info, 'first-clear-rewards');
        await openReport(page);
        const settled = await state(page);
        expect(settled.credits).toBe(sample.profileAfter.credits);
        expect(settled.clearedChapters).toEqual(sample.profileAfter.clearedChapters);
        expect(settled.labels).toEqual(expect.arrayContaining([
            chapter === '04' ? '全城恢复供电' : '本章通关', '12/12', '首通额外 +12 凭证',
        ]));
        await screen(page, info, 'clear-' + chapter);
        const unlockKey = 'result:解锁 ' + sample.result.unlocks.length + ' 项 ›';
        await expect(async () => {
            await tap(page, unlockKey);
            expect((await state(page)).labels).toContain('本局解锁');
        }).toPass({timeout: 4000});
        expect((await state(page)).labels).toEqual(expect.arrayContaining(sample.result.unlocks));
        await tap(page, 'result:‹ 回结算');
        if (chapter !== '04') {
            const key = (await state(page)).hitAreas.find(a => a.key.startsWith('result:下一章')).key;
            await tap(page, key);
            expect((await state(page)).chapter).toBe(saves[index + 1].chapterId);
        }
        await page.reload();
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().page === 'home');
        const home = await state(page);
        expect(home.wave).toBeNull();
        expect(home.credits).toBe(settled.credits);
        expect(home.labels).toContain(homeDispatchStatus(sample.profileAfter).clockLine);
        await tap(page, 'home:log');
        for (let i = 0; i < index; i++) await tap(page, 'log:下一章');
        expect((await state(page)).labels.join('\n')).toContain(CHAPTER_NARRATIVES[chapter].archiveNote);
        await screen(page, info, 'archive-' + chapter);
        if (chapter === '04') {
            await tap(page,'log:‹ 返回');
            await tap(page,'home:dispatch');
            await tap(page,'prep:选择工装 ›');
            const rig = (await state(page)).rig;
            const legal = legalStarterWeaponsForRig(rig,sample.profileAfter);
            const defaultWeapon = RIG_CATALOG[rig].starterWeapon;
            const selected = legal[(legal.indexOf(defaultWeapon) + 1) % legal.length];
            expect(selected).not.toBe(defaultWeapon);
            await tap(page,'prep:换武器');
            expect((await state(page)).labels).toContain('初始武器 · ' + WEAPON_CATALOG[selected].name);
            const launch = (await state(page)).hitAreas.find(a => a.key.startsWith('prep:开始抢修')).key;
            await tap(page,launch);
            await expect.poll(async () => (await readSave(page))?.run?.weapons[0].id).toBe(selected);
        }
        expect(errors).toEqual([]);
    });
}
