import {expect,test} from '@playwright/test';
import {createDefaultProfile,PatrolSession} from '../../.m0-build/roguelite/session.js';
import {getDailyShift,todayDateKey} from '../../.m0-build/roguelite/engagement.js';
import {chapterCheckpoints,checkpoint,installCheckpoint,playWave,readSave} from './campaign-fixtures.mjs';
import {holdCombat,finishWave} from './combat-clock.mjs';
import { state, tap, screen, openReport } from './canvas.mjs';

function finalWave(profile,chapterId,options={}) {
    const fresh=new PatrolSession({profile,chapterId,rigId:'high_voltage',danger:4,seed:5,...options});
    const weapons=['arc_gun','riveter','hydraulic_nailer','split_probe','torch','induction'].map((id,i)=>({id,uid:i+1,tier:4}));
    return PatrolSession.fromSnapshot({...fresh.snapshot(),waveIndex:11,level:18,weapons,nextWeaponUid:7,
        levelStats:{voltage:70,torque:45,overclock:60,maxHp:350,armor:30,repair:18},currentHp:350},profile);
}

async function resume(page) {
    await page.goto('/?mockAd=1');
    await holdCombat(page);
    await tap(page,'home:dispatch');
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState().battleVisible);
}

async function replaceRun(page,profile,run) {
    await page.evaluate(entries=>{
        for(const key of Object.keys(localStorage)) if(key.startsWith('night-shift.patrol.save.')) localStorage.removeItem(key);
        for(const [key,value] of Object.entries(entries)) localStorage.setItem(key,value);
    },checkpoint(profile,run));
}

async function nextRun(page,profile,run) {
    // Use a new wave-start checkpoint with the profile that the preceding
    // browser settlement actually wrote. Remain inside the isolated test origin.
    await tap(page,'result:返回值班室');
    await replaceRun(page,profile,run);
    await resume(page);
}

test('RUN-11、RUN-12 四章金章依次入账并重打同档',async ({page},info)=>{
    test.setTimeout(120000);
    let profile={...chapterCheckpoints().at(-1).profileAfter,maxDangerCleared:{'01':3,'02':3,'03':3,'04':3}};
    for (const [i,chapter] of ['01','02','03','04','04'].entries()) {
        const run=finalWave(profile,chapter,{runId:'gold-'+i});
        if(!i){ await installCheckpoint(page,checkpoint(profile,run)); await resume(page); }
        else await nextRun(page,profile,run);
        const inputs=[];
        if (chapter==='04') { playWave(run,true,inputs); expect(run.phase).toBe('won'); }
        await finishWave(page,inputs);
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().page==='result');
        const saved=await readSave(page);
        expect(saved.run).toBeNull();
        expect(saved.profile.maxDangerCleared[chapter]).toBe(4);
        await openReport(page);
        const bonus=(await state(page)).labels.filter(l=>l.includes('首通额外'));
        if(i<4) expect(bonus).toEqual(['首通额外 +40 凭证']);
        else expect(bonus).toEqual([]);
        expect(Object.values(saved.profile.maxDangerCleared).filter(d=>d===4)).toHaveLength(Math.min(4,i+1));
        profile=saved.profile;
    }
    await tap(page,'result:返回值班室');
    await page.reload();
    await expect.poll(async ()=>(await state(page))?.labels).toContain('四章金章已集齐');
    await screen(page,info,'four-gold');
});

test('RET-02、AD-06 委托首通和同日重打，三次翻倍后入口关闭',async ({page})=>{
    test.setTimeout(120000);
    let profile=chapterCheckpoints().at(-1).profileAfter;
    const date=todayDateKey(),daily=getDailyShift(date);
    for(let i=0;i<4;i++){
        const run=finalWave(profile,daily.chapterId,{rigId:daily.rigId,seed:daily.seed,danger:daily.danger,
            dailyShiftKey:date,dailyMod:daily.modifier.id,runId:'daily-'+i});
        if(!i){await installCheckpoint(page,checkpoint(profile,run));await resume(page);}
        else await nextRun(page,profile,run);
        await finishWave(page);
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().page==='result');
        const settled=await readSave(page);
        expect(settled.profile.daily.dailyShiftCleared).toBe(true);
        const award=await page.evaluate(()=>window.combatQA.boot.patrol.result);
        await openReport(page);
        expect(award.unlocks.includes('完成今日委托，额外获得 35 凭证')).toBe(i===0);
        expect(settled.profile.credits-profile.credits).toBe(award.baseCreditsForDouble+award.firstClearBonus+(i===0?35:0));
        const key=(await state(page)).hitAreas.find(a=>a.key.includes('看视频再领'))?.key;
        if(i<3){
            const base=Number(key.match(/再领 (\d+)/)[1]);
            await tap(page,key);
            await page.getByRole('button',{name:'看完并返回'}).click();
            await expect.poll(async ()=>(await readSave(page)).profile.daily.adDoubleUsed).toBe(i+1);
            expect((await readSave(page)).profile.credits).toBe(settled.profile.credits+base);
            await expect.poll(async ()=>(await state(page)).labels).toContain('基础奖励已翻倍');
        }else {expect(key).toBeUndefined();expect(settled.profile.daily.adDoubleUsed).toBe(3);}
        profile=(await readSave(page)).profile;
    }
});

test('RUN-11 同首领两档的警告节拍和弱点窗口，总闸铜手柄仅释放一次开场电震',async ({page},info)=>{
    const profile=chapterCheckpoints().at(-1).profileAfter;
    const cycles=[];
    for(const danger of [0,4]){
        const base=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',danger,seed:5});
        const run=PatrolSession.fromSnapshot({...base.snapshot(),waveIndex:11,
            weapons:[{uid:1,id:'arc_gun',tier:1}],modules:['main_breaker_lever'],levelStats:{maxHp:250},currentHp:300},profile);
        if(danger) {
            await replaceRun(page,profile,run);
        } else await installCheckpoint(page,checkpoint(profile,run));
        await resume(page);
        const result=await page.evaluate(()=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle;
            let rings,opened,end;
            const warnings=[];
            const cooldowns=[[],[]];
            let previous;
            for(let f=0;boot.patrol.inBattle && f<1500;f++){
                boot.patrol.update(1/30,0,0);
                if(b.tick===1) rings=b.effects.filter(e=>e.shape==='circle' && e.radius===140).length;
                if(b.weaponCasts.some(c=>c.tick===b.tick))cooldowns[Number(b.tick>180)].push(b.runtimes[0].next-b.tick);
                const phase=b.bossUnit.state;
                if(phase!==previous){
                    if(phase==='warn') warnings.push(b.tick);
                    if(phase==='open' && opened===undefined){opened=b.tick;boot.draw();}
                    if(previous==='open' && end===undefined)end=b.tick;
                    previous=phase;
                }
                if(warnings.length>=2 && end && cooldowns[1].length)break;
            }
            return {rings,open:end-opened,cycle:warnings[1]-warnings[0],cooldowns};
        });
        expect(result.rings).toBe(1);
        expect(result.open).toBe(danger?60:72);
        expect(result.cooldowns[0].length).toBeGreaterThan(0);
        expect(Math.max(...result.cooldowns[0])).toBeLessThan(Math.min(...result.cooldowns[1]));
        cycles.push(result.cycle);
        await info.attach('boss-D'+danger,{body:JSON.stringify(result),contentType:'application/json'});
    }
    expect(cycles[1]).toBeLessThan(cycles[0]);
});
