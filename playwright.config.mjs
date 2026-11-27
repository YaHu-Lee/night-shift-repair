import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    timeout: 60000,
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:4392',
        hasTouch: true,
        channel: process.env.PLAYWRIGHT_CHANNEL,
        launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] },
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'short', use: { viewport: { width: 360, height: 640 } } },
        { name: 'tall', use: { viewport: { width: 393, height: 852 } } },
    ],
    webServer: ['campaign-web-review', 'campaign-web-playtest'].map((build, index) => ({
        command: 'node scripts/serve.mjs creator-m0/build/' + build,
        url: 'http://127.0.0.1:' + (4392 + index),
        env: { PORT: String(4392 + index) },
    })),
});
