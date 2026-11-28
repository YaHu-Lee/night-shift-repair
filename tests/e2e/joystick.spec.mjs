import {expect,test} from '@playwright/test';
import {state} from './canvas.mjs';
import {holdCombat} from './combat-clock.mjs';

test('居中摇杆可微移、斜跑、回中；长拖能换向，取消触摸立即停步', async ({page,context},info) => {
    await page.goto('/');
    await page.waitForFunction(()=>globalThis.__nightShiftCampaignState?.().battleVisible);
    await holdCombat(page);
    const start=await state(page);
    expect(start.settings).toMatchObject({movement:'joystick',stickPlacement:'center'});
    expect(start.stick.x).toBe(180);
    const box=await page.locator('#GameCanvas').boundingBox();
    const scale=Math.min(box.width/360,box.height/640);
    const cdp=await context.newCDPSession(page);
    const touch=(type,dx=0,dy=0)=>cdp.send('Input.dispatchTouchEvent',{type,
        touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{id:1,
            x:box.x+box.width/2+dx*scale,
            y:box.y+box.height/2-(start.stick.y+dy-320)*scale}]});
    // Advance an equal number of battle ticks for each real touch gesture.
    const sample=()=>page.evaluate(()=>{
        const {boot}=window.combatQA,b=boot.patrol.session.battle;
        const x=b.player.x,y=b.player.y, tick=b.tick;
        for(let i=0;b.tick<tick+6 && i<30;i++) boot.patrol.update(1/30,boot.stickAxis.x,boot.stickAxis.y);
        return {x:b.player.x-x,y:b.player.y-y,ticks:b.tick-tick};
    });
    await touch('touchStart');
    await touch('touchMove',2);
    expect(await sample()).toEqual({x:0,y:0,ticks:6});
    await touch('touchMove',11);
    const fine=await sample();
    await touch('touchMove',26);
    const full=await sample();
    expect(fine.x/full.x).toBeGreaterThan(0.12);
    expect(fine.x/full.x).toBeLessThan(0.34);
    await touch('touchMove',24,24);
    const diagonal=await sample();
    expect(diagonal.x).toBeCloseTo(diagonal.y,0);
    expect(Math.hypot(diagonal.x,diagonal.y)/full.x).toBeCloseTo(1,2);
    await touch('touchMove',-32);
    expect((await sample()).x).toBeCloseTo(-full.x,2);
    await touch('touchMove');
    expect(await sample()).toEqual({x:0,y:0,ticks:6});
    await touch('touchEnd');
    await touch('touchStart',-90);
    expect(await sample()).toEqual({x:0,y:0,ticks:6});
    await touch('touchMove',72);
    expect((await sample()).x).toBeCloseTo(full.x,2);
    await touch('touchMove',16);
    expect((await sample()).x).toBeCloseTo(-full.x,2);
    expect((await state(page)).stick).toEqual(start.stick);
    await touch('touchCancel');
    expect(await sample()).toEqual({x:0,y:0,ticks:6});
    await info.attach('真实触控位移',{body:JSON.stringify({fine,full,diagonal}),contentType:'application/json'});
});
