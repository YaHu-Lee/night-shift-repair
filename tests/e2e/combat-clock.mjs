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

export async function finishWave(page) {
    await page.waitForFunction(() => window.combatQA.boot.patrol.inBattle);
    await page.evaluate(() => {
        const {boot} = window.combatQA;
        for (let frame = 0; frame < 18000 && boot.patrol.inBattle; frame++) {
            boot.patrol.update(1 / 30, boot.stickAxis.x, boot.stickAxis.y);
        }
        boot.draw();
        if (boot.patrol.inBattle) throw Error('Wave did not end');
    });
    await page.waitForFunction(() => {
        const p=window.combatQA.boot.patrol;
        return !p.saving && p.page!=='battle' && globalThis.__nightShiftCampaignState().hitAreas.length;
    });
}
