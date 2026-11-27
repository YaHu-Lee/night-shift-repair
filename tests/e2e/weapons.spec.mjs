import { test, expect } from '@playwright/test';
import { createDefaultProfile, PatrolSession } from '../../.m0-build/roguelite/session.js';
import { checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { tap, screen } from './canvas.mjs';

// Each row lists the equipped weapon, its expected damage and its own credited kills.
// Three isolated loadouts let every weapon land a final hit on the same wave.
const scenarios = [
    [3,[['wrench',239,16],['bypass_wrench',257,7],['arc_gun',1171,14]]],
    [1,[['riveter',1277,16],['hydraulic_nailer',642,29],['torch',103,4]]],
    [2,[['pulse_nozzle',97,8],['induction',15,2],['traction_coil',566,26],['split_probe',1372,14]]],
];

for (const [seed,rows] of scenarios) {
    test('WPN 逐槽伤害与击毁入账 ' + rows.map(([id]) => id).join('、'), async ({page},info) => {
        test.setTimeout(90000);
        const profile = createDefaultProfile();
        const initial = new PatrolSession({chapterId:'01',rigId:'duty_standard',seed,profile});
        const weapons = rows.map(([id],i) => ({uid:i+1,id,tier:2}));
        const session = PatrolSession.fromSnapshot({...initial.snapshot(),waveIndex:1,weapons,nextWeaponUid:weapons.length+1},profile);
        await installCheckpoint(page,checkpoint(profile,session));
        await page.goto('/');
        await tap(page,'home:dispatch');
        await page.waitForFunction(() => {
            const s = globalThis.__nightShiftCampaignState();
            return s.battleArtReady && s.tick >= 180;
        });
        await screen(page,info,'active-loadout');
        await page.waitForFunction(() => globalThis.__nightShiftCampaignState().page === 'shop',null,{timeout:60000});
        await expect.poll(async () => (await readSave(page)).run.reports.at(-1)?.damageByWeapon.map(w => [w.id,w.totalDamage,w.kills]))
            .toEqual(rows);
    });
}
