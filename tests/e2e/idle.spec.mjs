import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { state, tap } from './canvas.mjs';

for (const stage of ['home','shop']) {
    test('DEV-09 静置三分钟后仍可操作，记录 Web 堆采样 ' + stage, async ({ page, context }, info) => {
        test.setTimeout(235000);
        const samples = [];
        try {
            const errors = [];
            page.on('pageerror',error => errors.push(error.message));
            const cdp = await context.newCDPSession(page);
            await page.goto('/?patrolDebug=' + stage);
            const button = stage === 'home' ? 'home:workshop' : 'shop:属性与羁绊';
            await page.waitForFunction(key => globalThis.__nightShiftCampaignState?.().hitAreas.some(a => a.key === key),button);
            await page.evaluate(async () => {
                const cc = await System.import('cc');
                const boot = cc.director.getScene().getComponentInChildren('M1Bootstrap');
                const draw = boot.draw.bind(boot);
                window.fullDraws = 0;
                boot.draw = () => { window.fullDraws++; draw(); };
            });
            const start = Date.now();
            for (let i = 0; i <= 6; i++) {
                // Timed observation is the feature under test. Only the endpoints force a collection.
                if (i) await new Promise(resolve => setTimeout(resolve, Math.max(0,start + i * 30000 - Date.now())));
                if (i === 0 || i === 6) await cdp.send('HeapProfiler.collectGarbage');
                const {usedSize,totalSize} = await cdp.send('Runtime.getHeapUsage');
                const fullDraws = await page.evaluate(() => window.fullDraws);
                samples.push({elapsedMs:Date.now()-start,collected:i === 0 || i === 6,usedSize,totalSize,fullDraws});
            }
            // After loading, home is event-driven. The first-shop tutorial can pulse at 4 Hz.
            expect(samples[6].fullDraws-samples[1].fullDraws).toBeLessThan(stage==='home' ? 10 : 630);
            await tap(page,button);
            await expect.poll(async () => (await state(page)).hitAreas.map(a => a.key))
                .toContain(stage === 'home' ? 'workshop:‹ 值班室' : 'shop:‹ 回商店');
            expect(errors).toEqual([]);
        } finally {
            await writeFile(info.outputPath(stage + '-heap.json'),JSON.stringify(samples,null,2));
        }
    });
}
