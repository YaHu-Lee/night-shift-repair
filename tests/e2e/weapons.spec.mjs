import { test, expect } from '@playwright/test';
import { createDefaultProfile, PatrolSession } from '../../.m0-build/roguelite/session.js';
import { checkpoint, installCheckpoint, readSave } from './campaign-fixtures.mjs';
import { tap, screen } from './canvas.mjs';

// Each row lists the equipped weapon, its expected damage and its own credited kills.
// Isolated loadouts let every weapon land a final hit on the same wave.
const scenarios = [
    [3,[['wrench',239,16],['bypass_wrench',257,7],['arc_gun',1171,14]]],
    [1,[['riveter',1277,16],['hydraulic_nailer',628,29],['torch',117,4]]],
    [1,[['pulse_nozzle',41,2],['induction',16,2],['traction_coil',551,26],['split_probe',1122,10]]],
    [2,[['rebound_saw',106,3],['rivet_line',619,24],['echo_horn',1108,17]]],
    [1,[['breaker_stake',263,3],['patrol_welder',323,11]],'result'],
];

for (const [seed,rows,outcome='shop'] of scenarios) {
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
        await page.waitForFunction(outcome => globalThis.__nightShiftCampaignState().page === outcome,outcome,{timeout:60000});
        if (outcome === 'result') {
            await tap(page,'result:查看武器伤害');
            const recorded = await page.evaluate(async () => {
                const cc = await System.import('cc');
                const result = cc.director.getScene().getComponentInChildren('M1Bootstrap').patrol.result;
                return {won:result.won,rows:result.damageByWeapon.map(w=>[w.id,w.totalDamage,w.kills])};
            });
            expect(recorded.won).toBe(false);
            expect(recorded.rows.sort()).toEqual([...rows].sort());
            expect((await readSave(page)).run).toBeNull();
        } else {
            await expect.poll(async () => (await readSave(page)).run.reports.at(-1)?.damageByWeapon.map(w => [w.id,w.totalDamage,w.kills])).toEqual(rows);
        }
    });
}
