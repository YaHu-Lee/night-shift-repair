import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ENEMIES, M2_RULES, TOOLS } from '../.m0-build/m1/content.js';
import { ATTACHMENTS, GEAR } from '../.m0-build/m1/Equipment.js';
import { BLUEPRINTS } from '../.m0-build/campaign/CampaignLedger.js';
import { CAMPAIGN_MACHINE_ART, CAMPAIGN_TOOL_ART, PIXEL_ARENAS, PIXEL_DISPATCH_CHAPTERS, PIXEL_MENU_ART, campaignArtBundle } from '../.m0-build/campaign/CampaignArt.js';
import { CAMPAIGN_CATALOG, CAMPAIGN_CHAPTERS } from '../.m0-build/campaign/CampaignCatalog.js';

const workshopPath = 'creator-m0/assets/resources/skins/workshop/';
const scenery = ['city-restored', 'radio-portraits', ...CAMPAIGN_CATALOG.map(stage => stage.arena),
    ...CAMPAIGN_CHAPTERS.flatMap(chapter => [chapter.map, ...(chapter.mapUpper ? [chapter.mapUpper] : [])])];
const atlases = [['campaign-machines', 4], ['campaign-tools', 3]];

function sceneryPath(key) {
    const bundle = campaignArtBundle(key);
    const folder = bundle ? `creator-m0/assets/campaign-content/${bundle}/` : workshopPath;
    return folder + key + '.jpg';
}

function jpegDimensions(image, id) {
    assert.equal(image.readUInt16BE(0), 0xffd8, id + ' JPEG header');
    let offset = 2;
    while (offset + 3 < image.length) {
        assert.equal(image[offset++], 0xff, id + ' JPEG marker');
        while (image[offset] === 0xff) offset++;
        const marker = image[offset++];
        if (marker === 0xda || marker === 0xd9) break;
        const length = image.readUInt16BE(offset);
        assert.ok(length >= 2 && offset + length <= image.length, id + ' JPEG segment bounds');
        // The frame markers carry dimensions. The other markers in this range define tables.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
            assert.ok(length >= 8, id + ' JPEG frame size');
            return [image.readUInt16BE(offset + 5), image.readUInt16BE(offset + 3)];
        }
        offset += length;
    }
    assert.fail(id + ' JPEG has no frame header');
}

test('workshop atlas contains a valid frame for each playable item, actor and animation pose', async () => {
    const folder = new URL('../' + workshopPath, import.meta.url);
    const frames = JSON.parse(await readFile(new URL('frames.json', folder), 'utf8'));
    const sheet = await readFile(new URL('sheet.png', folder));
    const width = sheet.readUInt32BE(16);
    const height = sheet.readUInt32BE(20);
    const legacyEnemies = Object.keys(ENEMIES).filter(key => !CAMPAIGN_MACHINE_ART.includes(key));
    const steps = ['walk', 'back', 'side', ...legacyEnemies].flatMap(key => [0, 1, 2, 3].map(i => key + i));
    const required = ['mechanic', ...steps, 'panel', 'health',
        'scrap', 'bullet', 'conductiveMark', ...legacyEnemies, ...M2_RULES.tools, ...M2_RULES.mods];
    for (const key of required) {
        assert.ok(Array.isArray(frames[key]), key);
        const [x, y, w, h] = frames[key];
        assert.ok(frames[key].every(Number.isInteger) && x >= 0 && y >= 0 && w > 0 && h > 0
            && x + w <= width && y + h <= height, key);
    }
});

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
    for (const id of Object.keys(TOOLS)) {
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

test('every campaign dispatch has an arena and the chapter backgrounds and reward art ship', async () => {
    for (const key of scenery) {
        const asset = await readFile(new URL('../' + sceneryPath(key), import.meta.url));
        assert.deepEqual([...asset.subarray(0, 3)], [255, 216, 255], key);
    }
    assert.deepEqual(CAMPAIGN_TOOL_ART, CAMPAIGN_CATALOG.flatMap(stage => stage.firstClearWeapon ?? []));
    for (const [key, columns] of atlases) {
        const atlas = await readFile(new URL('../' + workshopPath + key + '.png', import.meta.url));
        assert.equal(atlas.readUInt32BE(16) % columns, 0);
        assert.equal(atlas.readUInt32BE(20) % 2, 0);
        assert.equal(atlas[25], 6, key);
    }
});

test('running campaign pixel art preserves eight authored or mirrored views and native texture sampling', async () => {
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
    const mandatory = [...Object.keys(ENEMIES), 'supervisor', 'elite', 'gatekeeper', 'tow', 'silence', 'core'];
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
    assert.deepEqual(Object.keys(items).sort(), ['scrap', 'conductiveMark', ...Object.keys(GEAR), ...Object.keys(BLUEPRINTS),
        ...Object.values(ATTACHMENTS).filter(part => part.variant !== 'link').map(part => part.id),
        ...['link', 'handling', 'alternate', 'finisher', 'signature'].map(variant => 'part/' + variant),
        ...['receipt', 'radio', 'clue', 'medal', 'settings', 'tier'].map(icon => 'ui/' + icon),
        ...['terminal', 'battery', 'lift', 'relay', 'valve', 'barrier'].map(prop => 'prop/' + prop)].sort());
    for (const [alias, target] of Object.entries(spec.items.aliases ?? {})) assert.deepEqual(items[alias], items[target]);
    assert.deepEqual(await asset(chapter + 'items/workshop.png'), await asset(shipping + 'items/workshop.png'));
    const menu = { ...PIXEL_MENU_ART, 'radio-portraits': 'campaign-ch01' };
    for (const [key, bundle] of Object.entries(menu)) {
        const file = 'ui/' + key + '.png';
        const path = runtime + bundle + '/pixel/' + file;
        assert.deepEqual(await asset(path), await asset(shipping + file));
        images.push(path);
    }
    for (const id of PIXEL_DISPATCH_CHAPTERS) {
        const route = 'chapter-' + id;
        const folder = runtime + 'campaign-ch' + id + '/pixel/dispatch/';
        const coords = Object.fromEntries(CAMPAIGN_CATALOG.filter(stage => stage.chapter === id)
            .map(stage => [stage.id, [stage.anchor.x, stage.anchor.y]]));
        assert.deepEqual(spec.ui[route].stations, coords);
        const dispatch = await readJson(folder + 'frames.json');
        assert.deepEqual(Object.keys(dispatch).sort(), Object.keys(coords).sort());
        assert.deepEqual(await asset(folder + 'scenes.png'), await asset(shipping + 'dispatch/' + route + '/scenes.png'));
        images.push(folder + 'scenes.png');
    }
    for (const path of [...images, chapter + 'items/workshop.png']) {
        const meta = await readJson(path + '.meta');
        const texture = Object.values(meta.subMetas).find(item => item.importer === 'texture');
        assert.deepEqual([texture.userData.minfilter, texture.userData.magfilter, texture.userData.mipfilter],
            ['nearest', 'nearest', 'none']);
    }
});

test('the campaign art manifest matches the shipped bytes, dimensions, provenance and Creator imports', async () => {
    const manifest = JSON.parse(await readFile(new URL('../art/workshop/campaign-assets.json', import.meta.url), 'utf8'));
    const legacyArenas = CAMPAIGN_CATALOG.slice(0, 2).map(stage => stage.arena);
    const expected = new Map([
        ...scenery.filter(id => !legacyArenas.includes(id)).map(id => [id, sceneryPath(id)]),
        ...atlases.map(([id]) => [id, workshopPath + id + '.png']),
    ]);
    assert.deepEqual(manifest.map(asset => asset.id).sort(), [...expected.keys()].sort());
    for (const entry of manifest) {
        const { id, file, width, height } = entry;
        assert.equal(file, expected.get(id), id + ' runtime path');
        for (const field of ['source', 'sourceFile', 'process', 'licenseNotice']) {
            assert.ok(typeof entry[field] === 'string' && entry[field].trim(), id + ' ' + field);
        }
        const image = await readFile(new URL('../' + file, import.meta.url));
        assert.equal(createHash('sha256').update(image).digest('hex'), entry.sha256, id + ' SHA-256');
        const png = file.endsWith('.png');
        if (png) assert.equal(image.toString('hex', 0, 8), '89504e470d0a1a0a', id + ' PNG header');
        const dimensions = png ? [image.readUInt32BE(16), image.readUInt32BE(20)] : jpegDimensions(image, id);
        assert.deepEqual(dimensions, [width, height], id + ' file dimensions');
        assert.equal(entry.alpha, png && image[25] === 6, id + ' alpha');

        const meta = JSON.parse(await readFile(new URL('../' + file + '.meta', import.meta.url), 'utf8'));
        assert.equal(meta.importer, 'image', id + ' importer');
        assert.equal(meta.imported, true, id + ' import status');
        assert.match(meta.uuid, /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i, id + ' Creator UUID');
        const sprite = Object.values(meta.subMetas).find(item => item.importer === 'sprite-frame');
        assert.deepEqual([sprite?.userData?.rawWidth, sprite?.userData?.rawHeight], dimensions, id + ' sprite dimensions');
    }
});

test('the five campaign sound cues have matching files, hashes and Creator import UUIDs', async () => {
    const manifest = JSON.parse(await readFile(new URL('../art/workshop/campaign-audio.json', import.meta.url), 'utf8'));
    const expected = ['confirm', 'connect', 'cut', 'power', 'restored'];
    assert.deepEqual(manifest.clips.map(clip => clip.id).sort(), expected);
    assert.equal(new Set(manifest.clips.map(clip => clip.creatorUuid)).size, expected.length);
    assert.equal(new Set(manifest.clips.map(clip => clip.sha256)).size, expected.length);
    const sourceRecord = await readFile(new URL('../' + manifest.provenance.sourceRecord, import.meta.url), 'utf8');
    assert.match(sourceRecord, /项目本地合成/);
    assert.ok(manifest.provenance.generationDetails.trim());
    assert.ok(manifest.provenance.licenseNotice.trim());

    for (const { id, file, runtimePath, creatorUuid, sha256 } of manifest.clips) {
        assert.equal(runtimePath, 'campaign/' + id);
        assert.equal(file, 'creator-m0/assets/resources/' + runtimePath + '.wav');
        const url = new URL('../' + file, import.meta.url);
        const clip = await readFile(url);
        assert.equal(clip.toString('ascii', 0, 4), 'RIFF', id);
        assert.equal(clip.toString('ascii', 8, 12), 'WAVE', id);
        assert.equal(createHash('sha256').update(clip).digest('hex'), sha256, id);
        const meta = JSON.parse(await readFile(new URL(url.href + '.meta'), 'utf8'));
        assert.equal(meta.importer, 'audio-clip', id);
        assert.equal(meta.imported, true, id);
        assert.equal(meta.uuid, creatorUuid, id);
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
