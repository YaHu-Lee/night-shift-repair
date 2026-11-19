import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ENEMIES, M2_RULES } from '../.m0-build/m1/content.js';

test('workshop atlas contains a valid frame for each playable item, actor and animation pose', async () => {
    const folder = new URL('../creator-m0/assets/resources/skins/workshop/', import.meta.url);
    const frames = JSON.parse(await readFile(new URL('frames.json', folder), 'utf8'));
    const sheet = await readFile(new URL('sheet.png', folder));
    const width = sheet.readUInt32BE(16);
    const height = sheet.readUInt32BE(20);
    const steps = ['walk', 'back', 'side', ...Object.keys(ENEMIES)].flatMap(key => [0, 1, 2, 3].map(i => key + i));
    const required = ['mechanic', ...steps, 'panel', 'health',
        'scrap', 'bullet', 'conductiveMark', ...Object.keys(ENEMIES), ...M2_RULES.tools, ...M2_RULES.mods];
    for (const key of required) {
        assert.ok(Array.isArray(frames[key]), key);
        const [x, y, w, h] = frames[key];
        assert.ok(frames[key].every(Number.isInteger) && x >= 0 && y >= 0 && w > 0 && h > 0
            && x + w <= width && y + h <= height, key);
    }
});
