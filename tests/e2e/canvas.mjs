export const state = page => page.evaluate(() => globalThis.__nightShiftCampaignState?.());

export async function point(page, key, index = 0) {
    await page.waitForFunction(([key, index]) =>
        globalThis.__nightShiftCampaignState?.().hitAreas.filter(area => area.key === key)[index], [key, index]);
    const area = (await state(page)).hitAreas.filter(area => area.key === key)[index];
    const box = await page.locator('#GameCanvas').boundingBox();
    const scale = Math.min(box.width / 360, box.height / 640);
    return [
        box.x + box.width / 2 + ((area.left + area.right) / 2 - 180) * scale,
        box.y + box.height / 2 - ((area.top + area.bottom) / 2 - 320) * scale,
    ];
}

export async function tap(page, key, index = 0) {
    await page.waitForFunction(([key,index]) => {
        const area = globalThis.__nightShiftCampaignState?.().hitAreas.filter(a => a.key === key)[index];
        return area && Date.now() >= (area.readyAt ?? 0);
    },[key,index]);
    await page.touchscreen.tap(...await point(page, key, index));
}

export async function openReport(page) {
    await page.waitForFunction(() => globalThis.__nightShiftCampaignState?.().hitAreas.some(a => a.key === "result:查看战报" || a.key === "result:返回值班室"));
    if ((await state(page)).hitAreas.some(a => a.key === "result:查看战报")) await tap(page, "result:查看战报");
    await point(page, "result:返回值班室");
}

export async function screen(page, info, name) {
    await page.locator('#GameCanvas').screenshot({ path: info.outputPath(name + '.png') });
}
