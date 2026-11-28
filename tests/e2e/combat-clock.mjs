// The Creator debug build exposes its scene through SystemJS. Only the test page
// holds the engine clock. Touch routing, UI updates, real damage and saves still run.
export async function holdCombat(page) {
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().hitAreas.length);
    await page.evaluate(async () => {
        const cc = await System.import('cc');
        const boot = cc.director.getScene().getComponentInChildren('M1Bootstrap');
        boot.holdReviewFrame = true;
        window.combatQA = {cc, boot};
    });
}

export async function finishWave(page, inputs = []) {
    await page.waitForFunction(() => window.combatQA.boot.patrol.inBattle);
    await page.evaluate(inputs => {
        const {boot} = window.combatQA;
        let index = 0;
        for (let frame = 0; frame < 18000 && boot.patrol.inBattle; frame++) {
            const tick = boot.patrol.session.battle.tick;
            while (index + 1 < inputs.length && inputs[index + 1][0] <= tick) index++;
            boot.patrol.update(1 / 30, inputs[index]?.[1] ?? boot.stickAxis.x, inputs[index]?.[2] ?? boot.stickAxis.y);
        }
        boot.draw();
        if (boot.patrol.inBattle) throw Error('Wave did not end');
    }, inputs);
    await page.waitForFunction(() => {
        const p=window.combatQA.boot.patrol;
        return !p.saving && p.page!=='battle' && globalThis.__nightShiftCampaignState().hitAreas.length;
    });
}
