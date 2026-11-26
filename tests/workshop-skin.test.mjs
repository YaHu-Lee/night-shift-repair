import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { CHAPTER_CATALOG, ENEMY_ARCHETYPES, WEAPON_CATALOG } from '../.m0-build/roguelite/catalog.js';

const PIXEL_ARENAS = Object.fromEntries(
    CHAPTER_CATALOG.flatMap(ch => ch.stations.map(s => [s.arena, 'campaign-ch' + ch.id])),
);
const PIXEL_MENU_ART = {
    'night-depot': 'campaign-ch01',
    workbench: 'campaign-ch01',
    'chapter-01': 'campaign-ch01',
    'chapter-01-upper': 'campaign-ch01',
    'chapter-02': 'campaign-ch02',
    'chapter-03': 'campaign-ch03',
    'chapter-04': 'campaign-ch04',
    'city-restored': 'campaign-ch04',
    'radio-portraits': 'campaign-ch01',
};

test('the Creator pixel mechanic uses the candidate atlas and frame table without resampling', async () => {
    const candidate = new URL('../art/pixel/characters/mechanic/candidate/', import.meta.url);
    const runtime = new URL('../creator-m0/assets/campaign-content/campaign-ch01/pixel/mechanic/', import.meta.url);
    for (const name of ['mechanic-atlas.png', 'frames.json']) {
        assert.deepEqual(await readFile(new URL(name, runtime)), await readFile(new URL(name, candidate)), name);
    }
    const table = JSON.parse(await readFile(new URL('frames.json', runtime), 'utf8'));
    assert.deepEqual(table.missing, []);
    for (const heading of table.directions) {
        assert.equal(table.animations.attack[heading].frames.length, 4);
        assert.equal(table.animations['run-strike'][heading].frames.length, table.animations.walk[heading].frames.length);
    }
    const meta = JSON.parse(await readFile(new URL('mechanic-atlas.png.meta', runtime), 'utf8'));
    const texture = Object.values(meta.subMetas).find(item => item.importer === 'texture');
    assert.deepEqual([texture.userData.minfilter, texture.userData.magfilter, texture.userData.mipfilter],
        ['nearest', 'nearest', 'none']);
});

test('all ten floating tools ship one transparent side view with local rotation anchors', async () => {
    for (const id of Object.keys(WEAPON_CATALOG)) {
        const tool = id === 'wrench' ? 'arc-wrench' : id.replaceAll('_', '-');
        const file = 'weapon.png';
        const source = new URL('../art/pixel/weapons/' + tool + '/candidate/', import.meta.url);
        const runtime = new URL('../creator-m0/assets/campaign-content/campaign-ch01/pixel/' + tool + '/', import.meta.url);
        const png = await readFile(new URL(file, runtime));
        assert.deepEqual(png, await readFile(new URL(file, source)), tool);
        assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20), png[25]], [32, 32, 6]);
        const metadata = await readFile(new URL('sprite.json', runtime));
        assert.deepEqual(metadata, await readFile(new URL('sprite.json', source)));
        const { rect, grip, tip, sourceSha256 } = JSON.parse(metadata);
        const manifest = JSON.parse(await readFile(new URL('../manifest.json', source)));
        const original = await readFile(new URL('../' + manifest.source, source));
        assert.equal(sourceSha256, createHash('sha256').update(original).digest('hex'));
        assert.deepEqual(rect, [0, 0, 32, 32]);
        assert.ok(tip[0] > grip[0]);
        assert.ok([...grip, ...tip].every(value => Number.isInteger(value) && value >= 0 && value < 32));
        const meta = JSON.parse(await readFile(new URL(file + '.meta', runtime), 'utf8'));
        const texture = Object.values(meta.subMetas).find(item => item.importer === 'texture');
        assert.deepEqual([texture.userData.minfilter, texture.userData.magfilter, texture.userData.mipfilter],
            ['nearest', 'nearest', 'none']);
        assert.equal(Object.values(meta.subMetas).find(item => item.importer === 'sprite-frame').userData.packable, false);
    }
});

test('running campaign pixel art preserves eight authored or mirrored views and nearest texture sampling', async () => {
    const runtime = 'creator-m0/assets/campaign-content/';
    const shipping = 'art/pixel/combat/candidate/';
    const asset = path => readFile(new URL('../' + path, import.meta.url));
    const readJson = async path => JSON.parse(await asset(path));
    const images = [];

    for (const [arena, bundle] of Object.entries(PIXEL_ARENAS)) {
        const file = 'arenas/' + arena + '.png';
        const path = runtime + bundle + '/pixel/' + file;
        const actual = await asset(path);
        assert.deepEqual(actual, await asset(shipping + file));
        assert.deepEqual([actual.readUInt32BE(16), actual.readUInt32BE(20)], [330, 325]);
        images.push(path);
    }

    const chapter = runtime + 'campaign-ch01/pixel/';
    const spec = await readJson('art/pixel/combat/manifest.json');
    const runtimeActors = Object.entries(spec.enemies).filter(([, value]) => value.runtime);
    const { pages } = await readJson(chapter + 'enemies/frames.json');
    const candidate = await readJson(shipping + 'enemies/frames.json');
    const authored = new Set();
    for (const page of pages) {
        const path = chapter + 'enemies/' + page.texture + '.png';
        const atlas = await asset(path);
        const width = atlas.readUInt32BE(16), height = atlas.readUInt32BE(20);
        assert.ok(width <= 2048 && height <= 2048, page.texture);
        const draft = candidate.pages.find(entry => entry.texture === page.texture);
        for (const [key, rect] of Object.entries(page.frames)) {
            assert.ok(!authored.has(key), key);
            authored.add(key);
            assert.deepEqual(rect, draft.frames[key]);
            const [x, y, w, h] = rect;
            assert.ok(x >= 0 && y >= 0 && x + w <= width && y + h <= height);
        }
        images.push(path);
    }
    const mandatory = [...Object.keys(ENEMY_ARCHETYPES), 'inspector', 'supervisor', 'elite', 'gatekeeper', 'tow', 'silence', 'core'];
    for (const actor of mandatory) assert.equal(spec.enemies[actor]?.runtime, true);
    const expected = new Set();
    for (const [actor, data] of runtimeActors) {
        for (const pose of Object.keys(data.poses)) {
            for (const view of ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se']) {
                expected.add(actor + ':' + pose + ':' + view);
            }
        }
    }
    assert.deepEqual(authored, expected);

    const items = await readJson(chapter + 'items/frames.json');
    assert.ok(items.scrap && items.conductiveMark && items['ui/medal'] && items['prop/terminal']);
    assert.deepEqual(await asset(chapter + 'items/workshop.png'), await asset(shipping + 'items/workshop.png'));

    for (const [key, bundle] of Object.entries(PIXEL_MENU_ART)) {
        const file = 'ui/' + key + '.png';
        const path = runtime + bundle + '/pixel/' + file;
        assert.deepEqual(await asset(path), await asset(shipping + file));
        images.push(path);
    }
    for (const path of [...images, chapter + 'items/workshop.png']) {
        const meta = await readJson(path + '.meta');
        const texture = Object.values(meta.subMetas).find(item => item.importer === 'texture');
        assert.deepEqual([texture.userData.minfilter, texture.userData.magfilter, texture.userData.mipfilter],
            ['nearest', 'nearest', 'none']);
    }
});

test('campaign scores and combat cues match the generated Creator assets', async () => {
    const manifest = JSON.parse(await readFile(new URL('../art/workshop/campaign-audio.json', import.meta.url), 'utf8'));
    assert.deepEqual(manifest.scores.map(clip => clip.id), ['night-shift', 'live-circuit']);
    assert.deepEqual(manifest.effects.map(clip => clip.id), ['tool-arc', 'tool-shot', 'tool-heat', 'tool-magnet',
        'tool-induction', 'enemy-projectile', 'enemy-melee', 'enemy-area', 'tool-impact', 'purchase', 'unlock']);
    const all = [...manifest.clips, ...manifest.scores, ...manifest.effects];
    assert.equal(new Set(all.map(clip => clip.creatorUuid)).size, all.length);
    assert.equal(new Set(all.map(clip => clip.sha256)).size, all.length);
    const controller = await readFile(new URL('../assets/scripts/cocos/CampaignAudio.ts', import.meta.url), 'utf8');
    assert.equal(controller, await readFile(new URL('../creator-m0/assets/scripts/cocos/CampaignAudio.ts', import.meta.url), 'utf8'));
    let totalBytes = 0;
    for (const { id, file, runtimePath, creatorUuid, sha256, generator, sampleRateHz } of [...manifest.scores, ...manifest.effects]) {
        assert.equal(runtimePath, 'campaign/' + id);
        assert.ok(controller.includes("'" + runtimePath + "'"), id);
        const score = id === 'night-shift' || id === 'live-circuit';
        assert.equal(file, 'creator-m0/assets/resources/' + runtimePath + (score ? '.mp3' : '.wav'));
        assert.equal(generator, 'scripts/generate-campaign-' + (score ? 'music' : 'effects') + '.mjs');
        await readFile(new URL('../' + generator, import.meta.url));
        const url = new URL('../' + file, import.meta.url);
        const audio = await readFile(url);
        const meta = JSON.parse(await readFile(new URL(url.href + '.meta'), 'utf8'));
        assert.equal(createHash('sha256').update(audio).digest('hex'), sha256, id);
        assert.equal(meta.importer, 'audio-clip', id);
        assert.equal(meta.imported, true, id);
        assert.equal(meta.uuid, creatorUuid, id);
        if (score) assert.equal(audio.toString('ascii', 0, 3), 'ID3', id);
        else {
            assert.equal(audio.toString('ascii', 0, 4), 'RIFF', id);
            assert.equal(audio.readUInt16LE(22), 1, id);
            const sampleRate = ['tool-arc', 'tool-shot', 'tool-impact'].includes(id) ? 16_000 : 12_000;
            assert.equal(sampleRateHz, sampleRate, id);
            assert.equal(audio.readUInt32LE(24), sampleRate, id);
        }
        totalBytes += audio.length;
    }
    assert.ok(totalBytes <= 290_000);
});
