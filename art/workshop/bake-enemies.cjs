// Draw original articulated chassis from eight orthographic views. Offline only.
const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const sharp = require('sharp');

const output = path.resolve(__dirname, '../../creator-m0/assets/resources/skins/workshop');
const cell = 48;
const headings = ['e', 'ne', 'n', 'nw', 'w', 'sw', 's', 'se'];
const poses = ['idle', 'step-a', 'step-b', 'windup', 'strike', 'recover', 'hit'];
const fleets = {
    'enemy-yard': ['crawler', 'charger', 'turret', 'armored', 'inspector'],
    'enemy-specialists': ['pursuer', 'reclaimer', 'jammer', 'ambusher'],
    'enemy-command': ['supervisor', 'elite', 'gatekeeper', 'tow', 'silence', 'core'],
};
const colors = {
    crawler: { paint: '#a44130', plate: '#ca6542', lamp: '#ffb26c' },
    charger: { paint: '#b76a2e', plate: '#e5974e', lamp: '#fff0a3' },
    turret: { paint: '#9e6528', plate: '#d7a457', lamp: '#ffde8a' },
    armored: { paint: '#4b605c', plate: '#99a6a3', lamp: '#eabf84' },
    inspector: { paint: '#6d4432', plate: '#b77b49', lamp: '#f5bf72' },
    pursuer: { paint: '#895237', plate: '#c78c59', lamp: '#7ed7cf' },
    reclaimer: { paint: '#9e5726', plate: '#da9852', lamp: '#eebd6a' },
    jammer: { paint: '#493651', plate: '#825c90', lamp: '#dca7f6' },
    ambusher: { paint: '#3c505d', plate: '#637783', lamp: '#9fd6ff' },
    supervisor: { paint: '#4a6263', plate: '#7a9f94', lamp: '#a4f0c5' },
    elite: { paint: '#584950', plate: '#9e7774', lamp: '#e9a684' },
    gatekeeper: { paint: '#8a5731', plate: '#c5a25c', lamp: '#ffcf69' },
    tow: { paint: '#915632', plate: '#d17f42', lamp: '#ffab70' },
    silence: { paint: '#44556e', plate: '#6c7e98', lamp: '#d693f2' },
    core: { paint: '#455958', plate: '#738482', lamp: '#8fe2bb' },
};
const chassis = '#353c3f';
const undercarriage = '#252b30';
const steel = '#647070';
const joint = '#81705d';
const iron = '#373837';

function makeRig(kind, pose) {
    const mesh = [];
    const { paint, plate, lamp } = colors[kind];
    const wind = pose === 'windup', attack = pose === 'strike', hit = pose === 'hit', recover = pose === 'recover';
    const gait = pose === 'step-a' ? 1 : pose === 'step-b' ? -1 : 0;
    const cover = hit ? '#a17063' : plate;
    const light = wind || attack ? '#ffe9b2' : lamp;
    const rise = wind ? -1.4 : attack ? 1.2 : recover ? -0.6 : hit ? 1.3 : 0;
    const piston = wind ? -2 : attack ? 4 : recover ? -4 : hit ? -1 : 0;

    function bevel(cx, cy, z, length, width, height, color, corners = 1.6) {
        const a = length / 2, b = width / 2;
        const chamfer = Math.min(corners, a / 2, b / 2);
        const ring = [[a, -b + chamfer], [a, b - chamfer], [a - chamfer, b], [-a + chamfer, b],
            [-a, b - chamfer], [-a, -b + chamfer], [-a + chamfer, -b], [a - chamfer, -b]];
        const floor = ring.map(([x, y]) => [cx + x, cy + y, z]);
        prism(floor, height, color);
    }

    function prism(floor, height, color) {
        const roof = floor.map(([x, y, z]) => [x, y, z + height]);
        for (let i = 0; i < floor.length; i++) {
            const next = (i + 1) % floor.length;
            mesh.push({ color, points: [floor[i], floor[next], roof[next], roof[i]] });
        }
        mesh.push({ color, points: roof });
    }

    function limb(from, to, width, shade) {
        const sideX = to[1] - from[1], sideY = from[0] - to[0];
        const unit = width / 2 / (Math.hypot(sideX, sideY) || 1);
        const x = sideX * unit, y = sideY * unit;
        const point = ([ax, ay, az], sign) => [ax + x * sign, ay + y * sign, az];
        prism([point(from, 1), point(to, 1), point(to, -1), point(from, -1)], width * 0.65, shade);
    }

    function tracks(length, width, tread = 4.5) {
        for (const side of [-1, 1]) {
            const y = side * width / 2;
            bevel(0, y, 0, length, 5.5, 4.2, undercarriage);
            bevel(0, y, 3.4, length - 3, 6.1, 2.7, chassis);
            for (let x = -length / 2 + 3.0; x <= length / 2 - 2; x += tread) {
                bevel(x + gait * 0.6, y, 4.8, 1.1, 6, 0.9, joint, 0.15);
            }
        }
    }

    function vents(x, z) {
        for (const y of [-3.1, 0, 3.1]) bevel(x, y, z, 1.4, 1.5, 0.9, undercarriage, 0.2);
    }

    function head(x, z, width = 8, primary = light) {
        bevel(x, 0, z, 4.7, width + 2.6, 5, undercarriage);
        bevel(x + 2.1, 0, z + 0.8, 2.0, width, 3.4, primary, 0.4);
        bevel(x + 3, 0, z + 1.5, 0.65, width * 0.42, 1.5, '#fff1bf', 0.2);
    }

    function antenna(x, y, z, height) {
        bevel(x, y, z, 2.1, 2.1, height, steel, 0.3);
        bevel(x, y, z + height - 1.4, 3, 3, 2.4, light, 0.4);
    }

    function barrels(x, z, apart = 0) {
        for (const y of apart ? [-apart, apart] : [0]) {
            const reach = Math.max(4, 8 + piston);
            bevel(x + reach / 2, y, z, reach, 4, 3.8, steel, 0.7);
            bevel(x + reach, y, z - 0.3, 2.4, 5.1, 4.4, iron, 0.6);
            bevel(x + reach + 0.8, y, z + 0.6, 0.9, 2.9, 2.4, attack ? '#fff0bd' : undercarriage, 0.4);
        }
    }

    function body(length, width, z = 4, height = 6) {
        bevel(0, 0, z, length, width, height, paint, 3);
        bevel(-1, 0, z + height, length - 5, width - 3, 2.7, cover, 2);
        bevel(-length * 0.21, width * 0.32, z + height + 2.6, 5.1, 1.3, 0.5, '#af956c');
        vents(-length * 0.37, z + height + 2.5);
        bevel(-length / 2, -width * 0.24, z + 1.5, 1.2, 1.8, 1.4, '#923d31', 0.3);
    }

    if (kind === 'crawler' || kind === 'ambusher') {
        const reach = attack ? 7 : wind ? -3 : 0;
        for (const side of [-1, 1]) {
            for (const row of [-1, 0, 1]) {
                const sweep = gait * side * (row === 0 ? -2.8 : 2.8);
                const x = row * 5.2, y = side * 5;
                const outer = side * (13 + row * 0.3 - (wind ? 1.5 : 0));
                const knee = [x + sweep * 0.6, outer, 4.5 + rise];
                limb([x, y, 3 + rise], knee, 3.0, chassis);
                limb(knee, [x + sweep + (row > 0 ? 4 + reach : -2.2), outer + side * 2.4, 0.4], 1.9, plate);
            }
        }
        body(kind === 'ambusher' ? 18 : 16, kind === 'ambusher' ? 16 : 14, 4 + rise, kind === 'ambusher' ? 3.8 : 5.3);
        head(7.7 + piston * 0.35, 6.8 + rise, kind === 'ambusher' ? 6.6 : 4.1);
        if (kind === 'ambusher') bevel(-3, 6, 11.5 + rise, 7, 1.4, 0.9, light);
    } else if (kind === 'charger' || kind === 'pursuer') {
        tracks(25, kind === 'pursuer' ? 10.7 : 15.4);
        body(25, kind === 'pursuer' ? 12 : 17, 4 + rise, 5.1);
        const ram = kind === 'pursuer' ? 11 : 15;
        bevel(11.2 + piston * 0.6, 0, 3.5 + rise, 8, ram, 5, plate, 3.1);
        bevel(15 + piston * 0.6, 0, 4.9 + rise, 3, ram * 0.83, 3, chassis);
        for (const y of [-ram * 0.34, ram * 0.34]) bevel(15.5 + piston * 0.6, y, 5.5 + rise, 1.3, 2, 1.2, light);
        if (kind === 'pursuer') antenna(-6, -3, 11, 4);
        if (attack) for (const y of [-4, 4]) bevel(-15.4, y, 3.8, 6.1, 1.8, 2.2, '#ffc877');
    } else if (kind === 'turret' || kind === 'jammer' || kind === 'silence') {
        const big = kind === 'silence';
        for (const side of [-1, 1]) {
            const y = side * (big ? 9 : 7);
            bevel(-5 + side * gait, y, 0.2, 5.5, 5.4, 2.8, iron);
            bevel(5 - side * gait, y, 0.2, 5.5, 5.4, 2.8, iron);
        }
        body(big ? 22 : 17, big ? 21 : 16, 2.7 + rise * 0.4, 6);
        bevel(-2.3, 0, 9.8 + rise, big ? 11 : 9, big ? 12 : 10, 3.5, cover);
        if (kind === 'turret') {
            barrels(3, 10.2 + rise);
            antenna(-4, -3, 11.5 + rise, 4);
        } else {
            const flare = attack ? 5 : wind ? 2 : 0;
            for (const side of [-1, 0, 1]) {
                const y = side * (4.9 + flare);
                limb([-3, side * 3.5, 11], [1.8 + flare, y, 16.6 + rise], 2.4, steel);
                bevel(1.6 + flare, y, 16.6 + rise, 6, 2.8, 1.6, light);
            }
            head(7, 7.2, big ? 8 : 5.2);
        }
    } else if (kind === 'reclaimer' || kind === 'tow') {
        tracks(kind === 'tow' ? 27 : 23, kind === 'tow' ? 18 : 15);
        body(kind === 'tow' ? 26 : 21, 19, 4 + rise, 5.5);
        const open = attack ? 7.4 : wind ? 6.8 : 4.4;
        for (const side of [-1, 1]) {
            const tip = [18 + piston, open * side, 5.7 + rise];
            limb([4, side * 4, 9 + rise], [9.3 + piston / 2, side * 8, 10.4 + rise], 3.4, steel);
            limb([9.3 + piston / 2, side * 8, 10.4 + rise], tip, 3.5, plate);
            limb(tip, [18 + piston, (open - 3.2) * side, 5 + rise], 2.1, light);
        }
        head(4, 10.8 + rise, 6.3);
        bevel(-7, 0, 12.5 + rise, 4, 10, 2.3, chassis);
    } else {
        const core = kind === 'core', twin = kind === 'gatekeeper', armor = kind === 'armored';
        const width = core ? 25 : twin ? 24 : armor ? 21 : 22;
        if (!core) tracks(armor ? 18 : 21, width - 5.5);
        else {
            for (const side of [-1, 1]) {
                const sway = side * gait * 1.4;
                bevel(sway, side * 11, 0.5, 23, 6, 4, undercarriage);
                limb([-7, side * 6, 6], [-9 + sway, side * 13, 2.6], 3.6, steel);
                limb([7, side * 6, 6], [9 - sway, side * 13, 2.6], 3.6, steel);
            }
        }
        body(core ? 23 : 21, width, 4.2 + rise, core ? 7.1 : 6.2);
        if (armor || twin) {
            const brace = wind ? 2 : attack ? 5 : hit ? -2 : 0;
            const leaves = twin ? [-6.2, 6.2] : [0];
            for (const y of leaves) {
                const plateWidth = twin ? 9 : 19;
                bevel(10 + brace, y, 2, 5, plateWidth, 10.7, plate);
                bevel(12.2 + brace, y, 4.1, 1.8, plateWidth * 0.78, 6.8, steel);
                bevel(13.1 + brace, y, 6.3, 1.2, plateWidth * 0.76, 1.8, light);
            }
            head(3.4, 11.2 + rise, 6);
        } else if (core) {
            bevel(-1, 0, 10.8 + rise, 16, 15, 5.7 + (attack ? 2 : 0), chassis, 4);
            bevel(-1, 0, 16 + rise, attack ? 10 : 7.5, 10.5, 2.7, light, 2);
            head(10, 9 + rise, 10);
            for (const y of [-10.4, 10.4]) antenna(-4.6, y, 10, wind ? 11 : 8);
        } else {
            head(8, 10.5 + rise, kind === 'supervisor' ? 10.5 : 7.4);
            bevel(-3, 0, 13.6 + rise, 7, 10.5, 2.2, chassis);
            barrels(2, 8.5 + rise, 6.1);
            antenna(-6.7, 4.2, 13 + rise, kind === 'supervisor' ? 6.7 : 4.2);
        }
    }
    return mesh;
}

function tint(color, brightness) {
    const value = Number.parseInt(color.slice(1), 16);
    const channels = [value >> 16, (value >> 8) & 255, value & 255];
    return '#' + channels.map(c => Math.min(255, Math.max(0, Math.round(c * brightness))).toString(16).padStart(2, '0')).join('');
}

function frame(facets, heading) {
    const angle = heading * Math.PI / 4;
    const orientation = ([x, y, z]) => [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle), z];
    const project = ([x, y, z]) => [cell / 2 + x * 0.98, cell * 0.65 - y * 0.55 - z * 0.84];
    const depth = ([, y, z]) => -y * 0.84 + z * 0.55;
    const faces = [];
    for (const face of facets) {
        const points = face.points.map(orientation);
        const [origin, second, third] = points;
        const [ax, ay, az] = second.map((v, i) => v - origin[i]);
        const [bx, by, bz] = third.map((v, i) => v - origin[i]);
        const x = ay * bz - az * by, y = az * bx - ax * bz, z = ax * by - ay * bx;
        if (-y * 0.84 + z * 0.55 <= 1e-8) continue;
        const length = Math.hypot(x, y, z);
        const lighting = 0.73 + 0.25 * (-x * 0.38 - y * 0.30 + z * 0.88) / length;
        const pointList = points.map(p => project(p).map(v => v.toFixed(2)).join(',')).join(' ');
        const fill = tint(face.color, lighting);
        faces.push({
            depth: points.reduce((sum, p) => sum + depth(p), 0) / points.length,
            polygon: `<polygon points="${pointList}" fill="${fill}" stroke="${tint(fill, 0.66)}" stroke-width=".55" stroke-linejoin="round"/>`,
        });
    }
    faces.sort((first, second) => first.depth - second.depth);
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cell}" height="${cell}">${faces.map(face => face.polygon).join('')}</svg>`);
}

function verifyAtlas(pixels, width, actors, size = cell) {
    const digests = [];
    for (let row = 0; row < actors.length * poses.length; row++) {
        const rowDigests = [];
        for (let direction = 0; direction < headings.length; direction++) {
            const hash = createHash('sha256');
            let filled = 0;
            for (let y = 0; y < size; y++) {
                const start = ((row * size + y) * width + direction * size) * 4;
                const line = pixels.subarray(start, start + size * 4);
                hash.update(line);
                for (let x = 0; x < size; x++) {
                    if (line[x * 4 + 3] < 24) continue;
                    filled++;
                    if (x === 0 || x === size - 1 || y === 0 || y === size - 1) {
                        throw Error('Clipped atlas pose ' + [actors[Math.floor(row / poses.length)], poses[row % poses.length], headings[direction]]);
                    }
                }
            }
            if (filled < 30 || filled > size * size * 0.75) throw Error('Invalid alpha coverage at row ' + row);
            rowDigests.push(hash.digest('hex'));
        }
        if (new Set(rowDigests).size !== headings.length) throw Error('Repeated direction at row ' + row);
        digests.push(rowDigests);
    }
    for (const [index, actor] of actors.entries()) {
        const actorRows = digests.slice(index * poses.length, (index + 1) * poses.length);
        for (const [direction, heading] of headings.entries()) {
            if (new Set(actorRows.map(row => row[direction])).size !== poses.length) {
                throw Error('Repeated pose ' + [actor, heading]);
            }
        }
    }
}

async function bake() {
    const manifest = {
        source: 'Project-original articulated orthographic meshes, rendered by art/workshop/bake-enemies.cjs.',
        licenseNotice: 'Original project art. No external image assets used.',
        headings, poses, spritesheets: [],
    };
    for (const [id, enemies] of Object.entries(fleets)) {
        const layers = [];
        for (const [unit, enemy] of enemies.entries()) {
            for (const [row, pose] of poses.entries()) {
                const facets = makeRig(enemy, pose);
                for (let direction = 0; direction < headings.length; direction++) {
                    const input = await sharp(frame(facets, direction), { density: 144 })
                        .resize(cell, cell).ensureAlpha().png().toBuffer();
                    layers.push({ input, left: direction * cell, top: (unit * poses.length + row) * cell });
                }
            }
        }
        const width = headings.length * cell, height = enemies.length * poses.length * cell;
        const data = await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(layers)
            .png({ palette: true, colours: 256, dither: 0.28, compressionLevel: 9 }).toBuffer();
        verifyAtlas(await sharp(data).ensureAlpha().raw().toBuffer(), width, enemies);
        await fs.writeFile(path.join(output, id + '.png'), data);
        manifest.spritesheets.push({ id, actors: enemies, cell, width, height, alpha: true,
            sha256: createHash('sha256').update(data).digest('hex'), technical_checks_passed: true });
    }
    const id = 'mechanic-directional', actors = ['mechanic'];
    const data = await fs.readFile(path.join(output, id + '.png'));
    const { data: pixels, info: { width, height } } = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const mechanicCell = 56;
    if (width !== mechanicCell * headings.length || height !== mechanicCell * poses.length) {
        throw Error('Unexpected mechanic directional atlas grid');
    }
    verifyAtlas(pixels, width, actors, mechanicCell);
    manifest.spritesheets.push({ id, actors, source: 'scripts/generate-mechanic-poses.py',
        cell: mechanicCell, width, height, alpha: true, sha256: createHash('sha256').update(data).digest('hex'),
        technical_checks_passed: true });
    await fs.writeFile(path.join(__dirname, 'combat-motion.json'), JSON.stringify(manifest, null, 2) + '\n');
}

bake().catch(error => { console.error(error); process.exitCode = 1; });
