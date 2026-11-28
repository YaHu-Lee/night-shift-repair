import { expect, test } from '@playwright/test';
import { MILESTONES, WEAPON_MODS, rigRank } from '../../.m0-build/roguelite/progression.js';
import { WEAPON_CATALOG } from '../../.m0-build/roguelite/catalog.js';
import { createDefaultProfile, PatrolSession } from '../../.m0-build/roguelite/session.js';
import { checkpoint, installCheckpoint, playWave, readSave } from './campaign-fixtures.mjs';
import { holdCombat, finishWave } from './combat-clock.mjs';
import { openReport, point, screen, state, tap } from './canvas.mjs';

// Each chapter keeps the profile actually settled by the preceding browser run.
// Stage only the final wave and its loadout to isolate the reward transaction.
for (const chapter of ['01','02','03','04']) {
    test('成长奖励 · 五档连续首通及演出恢复 ' + chapter, async ({page}, info) => {
        test.setTimeout(150000);
        let profile = {...createDefaultProfile(), onboardingDone:true,
            clearedChapters:['01','02','03','04'].slice(0,Number(chapter)-1)};
        for (let danger = 0; danger <= 4; danger++) {
            const initial = new PatrolSession({profile, chapterId:chapter, danger, seed:5, rigId:'duty_standard'});
            const weapons = ['arc_gun','wrench','torch','induction','riveter','hydraulic_nailer'].map((id,i)=>({id,uid:i+1,tier:4}));
            const run = PatrolSession.fromSnapshot({...initial.snapshot(), waveIndex:11, weapons, nextWeaponUid:7,
                levelStats:{maxHp:350,armor:30,repair:18,voltage:70,torque:45,overclock:60},currentHp:350},profile);
            const entries = checkpoint(profile,run);
            if (danger === 0) await installCheckpoint(page,entries);
            else await page.evaluate(entries => {
                for (const key of Object.keys(localStorage)) if (key.startsWith('night-shift.patrol.save.')) localStorage.removeItem(key);
                for (const [key,value] of Object.entries(entries)) localStorage.setItem(key,value);
            }, entries);
            await page.goto('/');
            await holdCombat(page);
            await tap(page,'home:dispatch');
            const inputs=[];
            if (chapter==='04') { playWave(run,true,inputs); expect(run.phase).toBe('won'); }
            await finishWave(page,inputs);
            const grant = MILESTONES[chapter][danger];
            const after = await readSave(page);
            expect(after.run).toBeNull();
            expect(after.pendingVictory.firstClearMilestones).toEqual([grant]);
            expect(after.profile.maxDangerCleared[chapter]).toBe(danger);
            for (const [rig,rank] of grant.rigs ?? []) expect(rigRank(after.profile,rig)).toBe(rank);
            const reward = grant.weapon ? WEAPON_CATALOG[grant.weapon].name : WEAPON_MODS[grant.mod][1];
            await page.reload();
            const tryKey = 'result:试用' + reward;
            await point(page,tryKey);
            expect((await state(page)).chapter).toBe(chapter);
            expect((await state(page)).danger).toBe(danger);
            if (danger === 0 || danger === 4) await screen(page,info,'reward-'+danger);
            await tap(page,tryKey);
            await tap(page,'result:结束试用');
            expect(await readSave(page)).toEqual(after);
            await openReport(page);
            const confirmed = await readSave(page);
            expect(confirmed.pendingVictory).toBeUndefined();
            expect(confirmed.profile).toEqual(after.profile);
            profile = confirmed.profile;
        }
    });
}

test('工装外观 · 六套四阶实装、八方向和主角动作', async ({page},info) => {
    const profile = createDefaultProfile();
    const run = new PatrolSession({profile, chapterId:'01', seed:5, rigId:'duty_standard'});
    await installCheckpoint(page,checkpoint(profile,run));
    await page.goto('/');
    await holdCombat(page);
    await tap(page,'home:dispatch');
    await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleArtReady);
    const rows = await page.evaluate(() => {
        const {cc,boot} = window.combatQA, skin = boot.skin;
        boot.draw();
        const frameKeys = new Map([...skin.frames].map(([id,frame])=>[frame,id]));
        const visible = () => skin.world.items.filter(i=>i.sprite.node.active);
        if (!visible().some(i=>frameKeys.get(i.sprite.spriteFrame)?.startsWith('rig:duty_standard:1:'))) {
            throw Error('实际开战的角色没有穿上值班服');
        }
        const bridge = boot.patrol.session.battle.toRenderBridge();
        const coilLit = hop => {
            skin.world.begin();
            skin.drawMechanic({...bridge,rigId:'high_voltage',rigRank:4,
                effects:hop===null ? [] : [{shape:'link',kind:'arc',hop,x:200,y:280,from:{x:180,y:290},life:5}]},bridge.tick);
            skin.world.finish();
            return visible().some(({sprite})=>sprite.spriteFrame===skin.frames.get('bullet') && sprite.color.r===140 && sprite.color.g===249);
        };
        if (coilLit(null) || coilLit(0) || !coilLit(1)) throw Error('IV 阶线圈亮灯与实际续跳事件未对齐');
        const samples = [];
        for (const rig of ['duty_standard','heavy_fitter','high_voltage','thermal_welder','scrap_auditor','surveyor']) {
            for (const rank of [1,2,3,4]) for (let h=0; h<8; h++) {
                const angle = h*Math.PI/4;
                for (const action of ['idle','walk','hit']) {
                    const motion = {heading:h,dx:action==='walk'?Math.cos(angle):0,dy:action==='walk'?Math.sin(angle):0,stride:12,tick:26};
                    skin.world.begin();
                    const ok = skin.drawFloatingBody(skin.pixelMechanic,{x:180,y:310},motion,action==='hit'?1:30,cc.Color.WHITE,rig,rank);
                    skin.world.finish();
                    const sprites = visible();
                    const view = ['side','ne','back','ne','side','se','front','se'][h];
                    const outfit = sprites.find(i=>frameKeys.get(i.sprite.spriteFrame)==='rig:'+rig+':'+rank+':'+view);
                    if (!ok || sprites.length!==2 || !outfit || (outfit.sprite.node.scale.x<0)!==[3,4,5].includes(h)) {
                        throw Error([rig,rank,h,action,'身体/工装层错误'].join(' '));
                    }
                    samples.push([rig,rank,h,action,view]);
                }
            }
        }
        boot.draw();
        return samples;
    });
    expect(rows).toHaveLength(576);
    await info.attach('工装动作与朝向',{body:JSON.stringify(rows),contentType:'application/json'});
});
