// Optional artist tool. Runtime and Creator builds consume the checked-in atlas.
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const source = path.join(__dirname, 'source');
const output = path.resolve(__dirname, '../../creator-m0/assets/resources/skins/workshop');
const cell = 128;
const columns = 8;
const layers = [];
const frames = {};

async function place(key, input, limit = 120) {
    const { data, info } = await sharp(input).resize(limit, limit, { fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
    const index = layers.length;
    const left = (index % columns) * cell + 4;
    const top = Math.floor(index / columns) * cell + 4;
    layers.push({ input: data, left, top });
    frames[key] = [left, top, info.width, info.height];
}

async function cut(sheet, key, left, top, width, height) {
    const data = await sharp(path.join(source, sheet)).extract({ left, top, width, height }).png().toBuffer();
    await place(key, data);
}

async function bake() {
    await fs.mkdir(output, { recursive: true });
    for (const [key, ...rect] of [
        ['mechanic', 87, 14, 387, 479], ['crawler', 551, 105, 367, 327],
        ['charger', 982, 77, 536, 341], ['turret', 15, 538, 464, 431],
        ['armored', 478, 553, 510, 388], ['inspector', 991, 468, 541, 532],
    ]) await cut('crew.png', key, ...rect);
    for (let i = 0; i < 4; i++) {
        await cut('walk.png', 'walk' + i, 66 + i * 543, 46, 430, 592);
        const left = 87 + Math.round(i * 443.5);
        await cut('walk-directions.png', 'back' + i, left, 22, 272, 402);
        await cut('walk-directions.png', 'side' + i, left, 462, 272, 402);
    }
    for (const [key, ...rect] of [
        ['wrench', 27, 31, 563, 576], ['riveter', 651, 58, 583, 550],
        ['torch', 0, 679, 599, 553], ['induction', 650, 664, 582, 575],
    ]) await cut('tools.png', key, ...rect);

    const parts = ['contact', 'splitter', 'relay', 'ring', 'coil', 'sweeper',
        'exchanger', 'valve', 'ceramic', 'bearings', 'plate', 'sorter'];
    for (const [index, key] of parts.entries()) {
        // Keep the printed ivory grounds as a family of workshop catalogue plates.
        const rect = { left: index % 4 * 362 + 3, top: Math.floor(index / 4) * 362 + 3, width: 356, height: 356 };
        const plate = await sharp(path.join(source, 'shop-parts.png')).extract(rect)
            .flatten({ background: '#eadfc8' }).png().toBuffer();
        await place(key, plate);
    }
    for (const [color, mappings] of [
        ['#83efd0', { scrap: 'bolt' }],
        ['#ff9180', { health: 'heart' }],
    ]) {
        for (const [key, file] of Object.entries(mappings)) {
            const svg = await fs.readFile(path.join(source, 'lucide', file + '.svg'), 'utf8');
            const ink = Buffer.from(svg.replace('currentColor', color));
            await place(key, await sharp(ink, { density: 288 }).png().toBuffer(), 64);
        }
    }
    for (const [key, file] of Object.entries({
        panel: 'panel', bullet: 'light_01',
    })) await place(key, path.join(source, 'kenney', file + '.png'));
    // Each strip uses one fixed crop and scale for the entire action.
    // Relative offsets keep the chassis registered while limbs and exhaust move.
    for (const [kind, origins, top, width, height] of [
        ['crawler', [50, 575, 1110, 1660], 139, 485, 400],
        ['charger', [8, 551, 1094, 1637], 193, 520, 315],
        ['turret', [43, 570, 1120, 1656], 90, 512, 507],
        ['armored', [34, 577, 1120, 1663], 134, 505, 421],
        ['inspector', [20, 563, 1106, 1649], 91, 518, 510],
    ]) {
        for (const [i, left] of origins.entries()) {
            await cut('combat/' + kind + '.png', kind + i, left, top, width, height);
        }
    }
    await cut('combat/fx.png', 'conductiveMark', 1120, 581, 324, 329);
    const height = Math.ceil(layers.length / columns) * cell;
    await sharp({ create: { width: columns * cell, height, channels: 4, background: '#00000000' } })
        .composite(layers).png({ palette: true, colours: 256, dither: 0.55 }).toFile(path.join(output, 'sheet.png'));
    await fs.writeFile(path.join(output, 'frames.json'), JSON.stringify(frames, null, 2) + '\n');
    await sharp(path.join(source, 'yard.png')).resize(660, 800, { fit: 'cover' }).jpeg({ quality: 82 })
        .toFile(path.join(output, 'yard.jpg'));
}

bake().catch(error => { console.error(error); process.exitCode = 1; });
