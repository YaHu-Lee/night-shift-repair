import { performance } from 'node:perf_hooks';
import { StressWorld, STRESS_COUNTS } from '../.m0-build/core/StressWorld.js';

const world = new StressWorld(2026);
const input = [[1, 0], [0, 1], [-1, 0], [0, -1]];
function advance(frames) {
    for (let i = 0; i < frames; i++) {
        const [x, y] = input[Math.floor(i / 120) % 4];
        world.step(x, y);
    }
}
advance(10000);
const start = performance.now();
advance(60000);
const elapsed = performance.now() - start;
console.log(JSON.stringify({
    counts: STRESS_COUNTS,
    steps: 60000,
    elapsedMs: +elapsed.toFixed(2),
    meanMsPerStep: +(elapsed / 60000).toFixed(4),
    scope: 'Node simulation only (not Cocos rendering, platform or device performance)',
}, null, 2));
