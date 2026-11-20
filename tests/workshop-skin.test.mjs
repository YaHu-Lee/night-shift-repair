import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ENEMIES, M2_RULES } from '../.m0-build/m1/content.js';
import { CAMPAIGN_MACHINE_ART, CAMPAIGN_TOOL_ART, campaignArtBundle } from '../.m0-build/campaign/CampaignArt.js';
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
