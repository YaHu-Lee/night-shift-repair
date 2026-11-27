import {test, expect} from '@playwright/test';
import {PatrolSession,createDefaultProfile} from '../../.m0-build/roguelite/session.js';
import {weaponMount} from '../../.m0-build/roguelite/weaponMotion.js';
import {PART_PICKUP_FLIGHT_TICKS} from '../../.m0-build/roguelite/constants.js';
import {checkpoint,installCheckpoint} from './campaign-fixtures.mjs';
import {holdCombat} from './combat-clock.mjs';
import {tap,screen} from './canvas.mjs';

async function start(page,ids,levelStats = {}) {
    const profile=createDefaultProfile();
    const first=new PatrolSession({profile,chapterId:'01',rigId:'duty_standard',seed:5});
    const weapons=ids.map((id,i)=>({id,uid:i+1,tier:2}));
    const run=PatrolSession.fromSnapshot({...first.snapshot(),waveIndex:1,weapons,nextWeaponUid:ids.length+1,levelStats},profile);
    await installCheckpoint(page,checkpoint(profile,run));
    await page.goto('/');await holdCombat(page);await tap(page,'home:dispatch');
    await page.waitForFunction(()=>globalThis.__nightShiftCampaignState().battleVisible);
}

for (const [bonus, collected] of [[0, 5], [30, 12]]) {
    test('NEW-02 铜件吸向移动中的角色，拾取范围 +' + bonus + '%', async ({ page }, info) => {
        await start(page, ['wrench'], {pickupRadius: bonus});
        const before = await page.evaluate(() => {
            const {boot} = window.combatQA;
            const battle = boot.patrol.session.battle;
            const {x, y} = battle.player;
            // The middle part is outside 33.6 units and inside the upgraded 43.68-unit radius.
            for (const [distance, value] of [[26, 5], [39, 7], [58, 11]]) {
                battle.drops.push({kind:'part', x:x-distance, y, value});
            }
            window.pickupSample = () => {
                boot.draw();
                const frame = boot.skin.frames.get('pixel-item:scrap');
                const sprites = boot.skin.world.items
                    .filter(({sprite}) => sprite.node.active && sprite.spriteFrame === frame)
                    .map(({sprite}) => ({x:sprite.node.position.x, y:sprite.node.position.y}))
                    .sort((a, b) => a.x - b.x);
                return {sprites, copper:battle.partsCollected, player:{x:battle.player.x, y:battle.player.y}};
            };
            return window.pickupSample();
        });
        expect(before.sprites).toHaveLength(3);
        await screen(page, info, 'scrap-on-floor');

        const mid = await page.evaluate(() => {
            const {patrol} = window.combatQA.boot;
            patrol.update(1/30, 0, 0);
            for (let tick = 0; tick < 3; tick++) patrol.update(1/30, 0, 1);
            return window.pickupSample();
        });
        expect(mid.copper).toBe(collected);
        expect(mid.sprites).toHaveLength(3);
        expect(mid.sprites[0]).toEqual(before.sprites[0]);
        expect(mid.sprites[2].x).toBeGreaterThan(before.sprites[2].x);
        expect(mid.sprites[2].y).toBeGreaterThan(before.sprites[2].y + 5);
        if (bonus) expect(mid.sprites[1].x).toBeGreaterThan(before.sprites[1].x);
        else expect(mid.sprites[1]).toEqual(before.sprites[1]);
        await screen(page, info, 'scrap-flying');

        const end = await page.evaluate(ticks => {
            const {patrol} = window.combatQA.boot;
            for (let tick = 0; tick < ticks; tick++) patrol.update(1/30, 0, 1);
            return window.pickupSample();
        }, PART_PICKUP_FLIGHT_TICKS);
        expect(end.sprites).toEqual(before.sprites.slice(0, bonus ? 1 : 2));
        expect(end.copper).toBe(collected);
    });
}

for(const tool of ['wrench','bypass_wrench','split_probe']){
    test('WPN 逐目标核对同次施放 '+tool,async ({page},info)=>{
        await start(page,[tool]);
        const evidence=await page.evaluate(tool=>{
            const {boot}=window.combatQA,b=boot.patrol.session.battle;
            const damage=[],swings=new Map(),directions=[];
            const apply=b.applyDamage.bind(b);
            b.applyDamage=(e,...args)=>{
                const hp=e.hp,result=apply(e,...args);
                if(hp>e.hp)damage.push({id:e.id,x:e.x,y:e.y,tick:b.tick});
                return result;
            };
            const nearest=b.nearestFromWeapon.bind(b);
            b.nearestFromWeapon=(dock,reach)=>{
                const chosen=nearest(dock,reach);
                const allowed=b.enemies.filter(e=>b.canTarget(e) && Math.hypot(e.x-b.player.x,e.y-b.player.y)<=reach);
                const closest=(x,y)=>allowed.slice().sort((a,c)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(c.x-x,c.y-y))[0];
                const player=closest(b.player.x,b.player.y),weapon=closest(b.player.x+dock.x,b.player.y+dock.y);
                if(chosen && player!==weapon)directions.push({tick:b.tick,expected:weapon.id,actual:chosen.id});
                return chosen;
            };
            let multi;
            for(let i=0;i<600 && boot.patrol.inBattle;i++){
                const tick=b.tick;boot.patrol.update(1/30,0,0);
                if(b.tick===tick)continue;
                for(const hit of b.weaponImpacts.filter(h=>h.tick===b.tick)){
                    const target=damage.find(d=>d.tick===b.tick && d.x===hit.x && d.y===hit.y);
                    if(!target)throw Error('No damage at contact');
                    const ids=swings.get(hit.cast.tick)??[];
                    if(ids.includes(target.id))throw Error('Same swing hit enemy '+target.id+' twice');
                    ids.push(target.id);swings.set(hit.cast.tick,ids);
                    if(ids.length>=2 && !multi){
                        if(tool==='split_probe'){
                            const strips=b.effects.filter(e=>e.sourceCast===hit.cast && e.shape==='strip');
                            const contacts=b.weaponImpacts.filter(h=>h.cast===hit.cast);
                            if(strips.length<2 || !strips.every(s=>contacts.some(h=>Math.hypot(s.x+s.ux*s.length-h.x,s.y+s.uy*s.length-h.y)<.01)))throw Error('Fork endpoints missed actual targets');
                        }
                        multi={tick:b.tick,cast:hit.cast.tick,targets:ids};
                    }
                }
                if(multi && b.tick>=multi.tick+15 && (tool!=='bypass_wrench'||directions.length))break;
            }
            boot.draw();
            return {multi,directions};
        },tool);
        expect(evidence.multi.targets.length).toBeGreaterThan(1);
        if(tool==='bypass_wrench'){
            expect(evidence.directions.length).toBeGreaterThan(0);
            for(const choice of evidence.directions)expect(choice.actual).toBe(choice.expected);
        }
        await info.attach('contacts',{body:JSON.stringify(evidence),contentType:'application/json'});
    });
}

for(const count of [1,2,6]){
    test('WPN-11 实际贴图槽位与八向移动 '+count,async ({page},info)=>{
        const ids=['wrench','bypass_wrench','arc_gun','riveter','torch','induction'].slice(0,count);
        await start(page,ids);
        const frames=await page.evaluate(ids=>{
            const {boot,cc}=window.combatQA,skin=boot.skin,b=boot.patrol.session.battle;
            const output=[];
            for(const [x,y] of [[0,0],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1],[0,0]]){
                boot.patrol.update(1/30,x,y);boot.draw();
                const visible=skin.world.items.filter(i=>i.sprite.node.active);
                const body=Array.from(skin.frames).find(([k,frame])=>k.startsWith('pixel-mechanic:') && visible.some(i=>i.sprite.spriteFrame===frame));
                const anchors=ids.map(id=>{
                    const item=visible.find(i=>i.sprite.spriteFrame===skin.frames.get('pixel-tool:'+id));
                    if(!item)throw Error('Missing visible '+id);
                    const model=skin.pixelTools.get(id),[,,w,h]=model.rect;
                    const [u,v]=id==='wrench'||id==='bypass_wrench'?model.tip:model.grip;
                    const loc=new cc.Vec3((u/w-.5)*item.transform.width,(.5-v/h)*item.transform.height);
                    const world=item.transform.convertToWorldSpaceAR(loc);
                    const p=boot.skillEffects.node.getComponent(cc.UITransform).convertToNodeSpaceAR(world);
                    return [p.x-b.player.x,p.y-b.player.y];
                });
                output.push({body:body?.[0],anchors});
            }
            return output;
        },ids);
        const names=['E','NE','N','NW','W','SW','S','SE'];
        for(const [i,f] of frames.entries()){
            if(i>0 && i<=8)expect(f.body).toContain('walk:'+names[i-1]+':');
            if(i===9)expect(f.body).toContain('idle:SE:');
            f.anchors.forEach(([x,y],slot)=>{
                const mount=weaponMount(slot,count);
                const expected=slot<2?mount.head:mount.grip;
                expect(Math.hypot(x-expected.x,y-expected.y)).toBeLessThan(1.1);
            });
        }
        await screen(page,info,'docks-'+count);
        const injured=await page.evaluate(ids=>{
            const {boot}=window.combatQA;
            const battle=boot.patrol.session.battle;
            const prior=battle.player.hp;
            battle.hurtPlayer(5,'boss_contact');
            boot.draw();
            const active=new Set(boot.skin.world.items.filter(i=>i.sprite.node.active).map(i=>i.sprite.spriteFrame));
            const frame=boot.skin.frames.get('pixel-mechanic:hit:SE:0');
            return {
                lost:prior-battle.player.hp,
                hurtBody:!!frame && active.has(frame),
                tools:ids.filter(id=>active.has(boot.skin.frames.get('pixel-tool:'+id))),
            };
        },ids);
        expect(injured.lost).toBeGreaterThan(0);
        expect(injured.hurtBody).toBe(true);
        expect(injured.tools).toEqual(ids);
        await screen(page,info,'injured-'+count);
    });
}
