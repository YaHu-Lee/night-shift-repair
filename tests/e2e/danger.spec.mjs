import { expect, test } from '@playwright/test';
import {holdCombat, finishWave} from './combat-clock.mjs';
import { createDefaultProfile, buyWorkshopTalent } from '../../.m0-build/roguelite/session.js';
import { bossCheckpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { tap, state, screen } from './canvas.mjs';

let progression;
test.beforeAll(() => {
    let profile = createDefaultProfile();
    progression = [];
    for (const [danger,seed] of [1,1,1,1,1].entries()) {
        for (const id of ['chassis','capacitor','toolbox','chassis','capacitor','chassis','capacitor','toolbox','chassis','capacitor']) {
            profile = buyWorkshopTalent(profile,id) ?? profile;
        }
        const sample = bossCheckpoint(profile,{danger,seed,chapterId:danger < 2 ? '01' : '02',rigId:danger < 2 ? 'duty_standard' : 'high_voltage'});
        progression.push(sample);
        profile = sample.profileAfter;
    }
});

for (const danger of [1,2,3,4]) {
    test('RUN-08～12 难度 ' + danger + ' 首通，核对加成、解锁与存档', async ({page},info) => {
        test.setTimeout(150000);
        const sample = progression[danger];
        const bonus = [0,16,50,30,40][danger];
        expect(sample.result.firstClearBonus).toBe(bonus);
        await installCheckpoint(page,sample.entries);
        await page.goto('/');
        await holdCombat(page);
        await tap(page,'home:dispatch');
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().boss);
        await finishWave(page, sample.inputs);
        await expect.poll(async ()=>(await state(page)).page).toBe('result');
        await expect.poll(async ()=>(await state(page)).hitAreas.map(a=>a.key)).toContain('result:查看战报');
        await screen(page, info, 'first-clear-rewards');
        await tap(page, 'result:查看战报');
        await expect.poll(async () => (await state(page)).labels).toContain('首通额外 +' + bonus + ' 凭证');
        await expect.poll(async () => (await readSave(page)).profile.maxDangerCleared[sample.chapterId]).toBe(danger);
        const credit = (await readSave(page)).profile.credits;
        expect(credit).toBe(sample.profileAfter.credits);
        const key = 'result:解锁 ' + sample.result.unlocks.length + ' 项 ›';
        await expect(async () => {
            await tap(page,key);
            expect((await state(page)).labels).toContain('本局解锁');
        }).toPass({timeout:6000});
        expect((await state(page)).labels).toEqual(expect.arrayContaining(sample.result.unlocks));
        await screen(page,info,'danger-' + danger + '-unlocks');
        await page.reload();
        await tap(page,'home:duty');
        expect((await state(page)).credits).toBe(credit);
        expect((await readSave(page)).run).toBeNull();
    });
}
