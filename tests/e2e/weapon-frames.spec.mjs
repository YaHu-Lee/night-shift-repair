import {test, expect} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {ALL_TOOL_IDS} from '../../.m0-build/roguelite/catalog.js';
import {createDefaultProfile, PatrolSession} from '../../.m0-build/roguelite/session.js';
import {checkpoint, installCheckpoint} from './campaign-fixtures.mjs';
import {holdCombat} from './combat-clock.mjs';
import {tap} from './canvas.mjs';

const {PNG} = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
function changedPixels(on,off,point,radius) {
    const cx=Math.round(point.x), cy=Math.round(point.y);
    let count=0;
    for(let y=Math.max(0,cy-radius); y<=Math.min(on.height-1,cy+radius); y++) {
        for(let x=Math.max(0,cx-radius); x<=Math.min(on.width-1,cx+radius); x++) {
            const i=(y*on.width+x)*4;
            if ([0,1,2].some(k=>Math.abs(on.data[i+k]-off.data[i+k])>=12)) count++;
        }
    }
    return count;
}

async function installFrameSampler(page,tool) {
    await page.evaluate(tool=>{
        const {boot,cc}=window.combatQA;
        const session=boot.patrol.session, battle=session.battle, skin=boot.skin;
        // Keep transforms fixed between the layer-on and layer-off raster reads.
        const draw=boot.draw.bind(boot);
        boot.draw=()=>{};
        const damage=[];
        const apply=battle.applyDamage.bind(battle);
        battle.applyDamage=(enemy,amount,...args)=>{
            const {id,x,y,hp}=enemy;
            const result=apply(enemy,amount,...args);
            if(enemy.hp<hp) damage.push({tick:battle.tick,id,x,y,before:hp,after:enemy.hp,enemy});
            return result;
        };
        window.frameSample=(weight,side,recoil)=>{
            const launch = weight === 'launch';
            const start=battle.tick;
            while(boot.patrol.inBattle) {
                const prior=battle.tick;
                boot.patrol.update(1/30,0,0);
                if(battle.tick===prior) continue;
                draw();
                const frame=skin.frames.get('pixel-tool:'+tool);
                const item=skin.world.items.find(i=>i.sprite.node.active && i.sprite.spriteFrame===frame);
                if(!item) throw Error('Equipped weapon sprite missing: '+tool);
                const model=skin.pixelTools.get(tool);
                const v=new cc.Vec3((model.tip[0]/frame.rect.width-.5)*item.transform.width,
                    (.5-model.tip[1]/frame.rect.height)*item.transform.height,0);
                const world=item.transform.convertToWorldSpaceAR(v);
                const tip=boot.skillEffects.node.getComponent(cc.UITransform).convertToNodeSpaceAR(world);
                const hit=battle.weaponImpacts.find(h=>h.tick===battle.tick && h.cast.tool===tool &&
                    h.weight===weight && (!side || Math.sign(h.cast.ux)===side));
                const discharge = launch && battle.weaponCasts.find(c=>c.tick===battle.tick && c.tool===tool);
                if(launch ? !discharge : !recoil && !hit) continue;
                const cast=launch ? discharge : recoil ? window.lastHit.cast : hit.cast;
                const muzzle=skin.floatingWeaponOrigin(cast)?.flash;
                const melee=cast.melee;
                const age=battle.tick-cast.tick;
                const expected=melee ? melee.points[Math.min(melee.last,age)] : muzzle;
                if(!expected) throw Error('Muzzle missing on tick '+battle.tick);
                const box=document.querySelector('#GameCanvas').getBoundingClientRect();
                const scale=Math.min(box.width/360,box.height/640);
                const project=p=>({x:box.width/2+(p.x-boot.battleOffset.x-180)*scale,
                    y:box.height/2-(p.y-boot.battleOffset.y-320)*scale});
                const coordError=Math.hypot(tip.x-expected.x,tip.y-expected.y);
                const result={tick:battle.tick,age,tip:project(tip),coordError,side:Math.sign(cast.ux),weight,
                    aim:[cast.ux,cast.uy],heading:muzzle?.heading,scale};
                if(launch) {window.lastHit={cast}; return result;}
                if(recoil) return result;
                const match=damage.find(d=>d.tick===battle.tick && d.x===hit.x && d.y===hit.y && (d.after<=0)===(weight==='break'));
                if(!match) throw Error('No independent HP change at '+JSON.stringify(hit));
                const targetPoint=project(hit);
                // A long-range weapon may hit outside the battle viewport. Sample an on-screen target.
                const fieldY=320+(box.height/2-targetPoint.y)/scale;
                if(targetPoint.x<12 || targetPoint.x>box.width-12 || fieldY<118 || fieldY>500) continue;
                window.lastHit=hit;
                const effects=battle.effects.filter(e=>e.sourceCast===cast);
                const cone=effects.find(e=>e.shape==='sector');
                const edges=cone && [-1,0,1].map(side=>{
                    const angle=Math.atan2(cone.uy,cone.ux)+side*Math.atan(cone.slope);
                    return project({x:cone.x+cone.radius*Math.cos(angle),y:cone.y+cone.radius*Math.sin(angle)});
                });
                return {...result,target:targetPoint,id:match.id,before:match.before,after:match.after,
                    pulled:Math.hypot(match.x-battle.player.x,match.y-battle.player.y)-
                        Math.hypot(match.enemy.x-battle.player.x,match.enemy.y-battle.player.y),
                    shapes:effects.map(e=>e.shape),edges};
            }
            throw Error('No visible '+tool+' '+weight+' side '+side+' after tick '+start);
        };
    },tool);
}

async function capture(page,info,name,sample,checkMuzzle=true) {
    const canvas=page.locator('#GameCanvas');
    const on=PNG.sync.read(await canvas.screenshot({path:info.outputPath(name+'.png')}));
    await page.evaluate(()=>{window.combatQA.boot.skillEffects.node.active=false;});
    const off=PNG.sync.read(await canvas.screenshot());
    await page.evaluate(()=>{window.combatQA.boot.skillEffects.node.active=true;});
    sample.tipPixels=changedPixels(on,off,sample.tip,Math.ceil(7*sample.scale));
    if(checkMuzzle) {
        expect(sample.coordError,'Sprite 贴图触点到战斗轨迹或渲染枪口的误差').toBeLessThan(1);
        expect(sample.tipPixels,'发射触点附近应有特效像素').toBeGreaterThan(1);
    }
    if(sample.target) {
        sample.hitPixels=changedPixels(on,off,sample.target,Math.ceil(8*sample.scale));
        expect(sample.hitPixels,'本帧实际扣血的目标附近应有命中特效').toBeGreaterThan(1);
    }
    if(sample.edges) {
        sample.edgePixels=sample.edges.map(p=>changedPixels(on,off,p,Math.ceil(5*sample.scale)));
        expect(Math.min(...sample.edgePixels),'即时扇面扣血时应能看清实际判定的两侧和中央远端').toBeGreaterThan(1);
    }
}

for(const tool of ALL_TOOL_IDS) {
    test('逐帧武器 '+tool,async ({page},info)=>{
        const profile=createDefaultProfile();
        const fresh=new PatrolSession({chapterId:'01',rigId:'duty_standard',seed:5,profile});
        const run=PatrolSession.fromSnapshot({...fresh.snapshot(),waveIndex:1,weapons:[{uid:1,id:tool,tier:2}]},profile);
        await installCheckpoint(page,checkpoint(profile,run));
        await page.goto('/');
        await holdCombat(page);
        await tap(page,'home:dispatch');
        await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleVisible);
        await installFrameSampler(page,tool);
        const evidence=[];
        const deployed=['rebound_saw','rivet_line','echo_horn','breaker_stake','patrol_welder'].includes(tool);
        if(deployed) {
            const launch=await page.evaluate(()=>window.frameSample('launch',0,false));
            await capture(page,info,'launch',launch);
            const recoil=await page.evaluate(()=>window.frameSample('recoil',0,true));
            await capture(page,info,'launch-recoil',recoil);
            evidence.push(launch,recoil);
        }
        let side=0;
        for(const weight of ['strike','break']) {
            const sample=await page.evaluate(([w,s])=>window.frameSample(w,s,false),[weight,side]);
            expect(sample.before).toBeGreaterThan(sample.after);
            if(weight==='strike') expect(sample.after).toBeGreaterThan(0);
            else expect(sample.after).toBeLessThanOrEqual(0);
            if(tool==='traction_coil' && weight==='strike') expect(sample.pulled).toBeGreaterThan(0);
            await capture(page,info,weight,sample,!deployed);
            evidence.push(sample);
            side=-sample.side;
            if(!deployed && !['wrench','bypass_wrench'].includes(tool)) {
                const recoil=await page.evaluate(()=>window.frameSample('recoil',0,true));
                await capture(page,info,weight+'-recoil',recoil);
                evidence.push(recoil);
            }
        }
        await writeFile(info.outputPath('frames.json'),JSON.stringify({tool,evidence},null,2));
    });
}
