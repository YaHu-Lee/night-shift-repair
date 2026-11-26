import { Color, Graphics } from 'cc';
import { IMPACT_TICKS } from '../roguelite/constants';
import type { Attack, CombatBounds, WeaponCast, WeaponImpact } from '../roguelite/types';
import { sampleMeleeHead } from '../roguelite/weaponMotion';
import { FLOATING_WEAPON_ART } from './FloatingWeaponArt';
import type { WeaponMuzzle } from './FloatingWeaponArt';
import { pxLine, pxRing, pxStarFlash, scratchColor, snap2 } from './PixelVfxEngine';
import type { RGB } from './PixelVfxEngine';

function ink(r: number, g: number, b: number) {
    return Array.from({ length: 13 }, (_, life) => ({
        edge: new Color(r, g, b, Math.min(230, 28 + life * 30)),
        wash: new Color(r, g, b, Math.min(46, 6 + life * 6)),
    }));
}

const colors = {
    arc: ink(122, 218, 255),
    shot: ink(255, 203, 121),
    heat: ink(255, 139, 63),
    magnet: ink(98, 238, 197),
    induction: ink(205, 151, 255),
};
const contactCore = new Color(255, 250, 224);
const whiteHot: RGB = [255, 250, 224];
const brass: RGB = [255, 192, 82];
const plasma: RGB = [98, 232, 255];
const oxide: RGB = [255, 108, 62];
const soot: RGB = [52, 50, 58];
type Contact = Extract<Attack, { shape: 'link' | 'impact' }>;
type Strip = Extract<Attack, { shape: 'strip' }>;
type Sector = Extract<Attack, { shape: 'sector' }>;
type Circle = Extract<Attack, { shape: 'circle' }>;

// Pure pixel-snapped VFX renderer (2px grid blocks, zero smooth vector triangles or anti-aliased round strokes).
export function drawSkillEffects(
    g: Graphics,
    effects: readonly Attack[],
    modelEffects = false,
    weaponOrigin?: (cast: WeaponCast) => WeaponMuzzle | undefined,
    floatingTick?: number,
    casts: readonly WeaponCast[] = [],
    impacts: readonly WeaponImpact[] = [],
): void {
    g.clear();
    const fraction = floatingTick === undefined ? 0 : floatingTick % 1;
    // Dynamic visual-noise budget: dim non-lethal friendly trails when >=3 floating weapons fire together.
    const activeCount = floatingTick === undefined ? 0 : casts.filter(cast => floatingTick - cast.tick < 12).length;
    const detail = activeCount >= 4 ? 0.58 : activeCount >= 3 ? 0.72 : 1.0;
    const contacts = floatingTick === undefined ? undefined : new Map<string, Contact>();

    if (floatingTick !== undefined) {
        for (const cast of casts) {
            const age = floatingTick - cast.tick;
            drawPixelSweepTrail(g, cast, age, detail);
            if (!cast.melee && age >= 0 && age < 4) {
                const muzzle = weaponOrigin?.(cast);
                if (muzzle?.flash && age < 3) drawPixelDischarge(g, cast, muzzle.flash, age / 3, detail);
            }
        }
    }

    for (const effect of effects) {
        const { x, y, life } = effect;
        const color = colors[effect.kind][life] ?? colors[effect.kind][12];
        const art = floatingTick !== undefined && effect.sourceCast ? FLOATING_WEAPON_ART[effect.sourceCast.tool] : undefined;
        if (contacts && (effect.shape === 'impact' || effect.shape === 'link')) {
            const key = snap2(x) + ':' + snap2(y);
            if ((contacts.get(key)?.life ?? 0) <= life) contacts.set(key, effect);
        }
        switch (effect.shape) {
            case 'circle': {
                if (art && effect.sourceCast) {
                    const muzzle = weaponOrigin?.(effect.sourceCast);
                    if (muzzle) drawPixelCoilField(g, effect, effect.sourceCast, muzzle, fraction, detail);
                    break;
                }
                const t = life / 12;
                g.fillColor = color.edge;
                pxRing(g, x, y, effect.radius, 2, 0, Math.PI * 2, 6);
                if (!modelEffects) {
                    const inner = effect.radius * (effect.kind === 'magnet' ? t : 1 - t);
                    pxRing(g, x, y, Math.max(4, inner), 2, t * 2, Math.PI * 2, 8, 3);
                }
                g.fill();
                break;
            }
            case 'sector': {
                if (art?.effect === 'pulse' || art?.effect === 'jet') {
                    const muzzle = weaponOrigin?.(effect.sourceCast!);
                    if (muzzle) {
                        drawPixelJet(g, effect, effect.sourceCast!, art.effect === 'jet' ? muzzle.flash ?? muzzle : muzzle, fraction, detail);
                    }
                    break;
                }
                const angle = Math.atan2(effect.uy, effect.ux);
                const half = Math.atan(effect.slope);
                g.fillColor = color.edge;
                pxRing(g, x, y, effect.radius, 2, angle - half, half * 2, 5);
                pxLine(g, x, y, x + Math.cos(angle - half) * effect.radius, y + Math.sin(angle - half) * effect.radius, 2, 5);
                pxLine(g, x, y, x + Math.cos(angle + half) * effect.radius, y + Math.sin(angle + half) * effect.radius, 2, 5);
                g.fill();
                break;
            }
            case 'strip': {
                if (art?.effect === 'rivet' || art?.effect === 'nail' || art?.effect === 'fork') {
                    const muzzle = weaponOrigin?.(effect.sourceCast!);
                    if (muzzle) drawPixelBolt(g, effect, effect.sourceCast!, muzzle, fraction, detail);
                    break;
                }
                g.fillColor = color.edge;
                pxLine(g, x, y, x + effect.ux * effect.length, y + effect.uy * effect.length, 2, 4);
                g.fill();
                break;
            }
            case 'link': {
                if (effect.mark) drawMarkFeedback(g, effect, fraction);
                if (modelEffects) {
                    g.fillColor = color.edge;
                    g.rect(snap2(x) - 2, snap2(y) - 2, 4, 4);
                    g.fill();
                    break;
                }
                if (effect.sourceCast?.melee && art) {
                    drawMeleeSparks(g, effect, art.tint, fraction, detail);
                    break;
                }
                const muzzle = effect.fromWeapon && effect.sourceCast ? weaponOrigin?.(effect.sourceCast) : undefined;
                if (art && effect.fromWeapon && !muzzle) break;
                const from = muzzle?.flash ?? muzzle ?? effect.from;
                drawPixelArc(g, from, effect, fraction, detail);
                break;
            }
            case 'impact': {
                if (art?.effect === 'pull' && 'pullFrom' in effect && effect.pullFrom) {
                    const t = Math.max(0, (life - fraction) / 7);
                    const muzzle = weaponOrigin?.(effect.sourceCast!);
                    if (!muzzle) break;
                    const { x: px, y: py } = muzzle.flash ?? muzzle;
                    const heavy = effect.sourceCast?.modified;
                    g.fillColor = scratchColor(...art.tint, Math.round(215 * t * detail));
                    const reach = Math.hypot(px - x, py - y) || 1;
                    const dx = (px - x) / reach, dy = (py - y) / reach;
                    for (const side of heavy ? [-3, 3] : [0]) {
                        pxLine(g, px - dy * side, py + dx * side, x - dy * side, y + dx * side, 2, 4);
                    }
                    g.fill();
                    g.fillColor = scratchColor(214, 255, 224, Math.round(235 * t));
                    for (let i = 1; i <= 3; i++) {
                        const travel = ((i / 3 + (1 - t)) % 1) * reach;
                        g.rect(snap2(x + dx * travel) - 2, snap2(y + dy * travel) - 2, 4, 4);
                    }
                    g.fill();
                }
                if (contacts) break;
                g.fillColor = color.edge;
                g.rect(snap2(x) - 2, snap2(y) - 2, 4, 4);
                g.fill();
                break;
            }
        }
    }

    if (floatingTick !== undefined) {
        for (const hit of impacts) drawPixelStrike(g, hit, floatingTick - hit.tick, detail);
    }
    if (contacts) {
        contacts.forEach(effect => drawPixelImpact(g, effect, fraction));
    }
}

function drawMarkFeedback(g: Graphics, hit: Extract<Attack, { shape: 'link' }>, fraction: number): void {
    const elapsed = 7 - hit.life + fraction;
    const fade = Math.max(0, 1 - elapsed / 7);
    const boosted = hit.mark === 'boosted';
    const x = snap2(hit.x), y = snap2(hit.y + 6);
    const offset = snap2((boosted ? 6 : 4) + elapsed * 0.6);
    g.fillColor = boosted ? scratchColor(255, 226, 108, Math.round(248 * fade)) : scratchColor(121, 229, 255, Math.round(212 * fade));
    g.rect(x - offset - 2, y - 1, 4, 2);
    g.rect(x + offset - 2, y - 1, 4, 2);
    if (boosted) {
        g.rect(x - 1, y + offset, 2, 6);
        g.rect(x - 3, y + offset + 2, 6, 2);
    }
    g.fill();
}

/** Pure 2px stepped projectile trails & solid pixel dart heads (Riveter, Hydraulic Nailer, Split Probe). */
function drawPixelBolt(g: Graphics, strip: Strip, cast: WeaponCast, muzzle: WeaponMuzzle, fraction: number, detail: number): void {
    const probe = cast.tool === 'split_probe';
    const range = probe ? strip.length : cast.targetRange;
    const dx = strip.x + strip.ux * range - muzzle.x;
    const dy = strip.y + strip.uy * range - muzzle.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1 || (!probe && muzzle.heading !== undefined && dx * Math.cos(muzzle.heading) + dy * Math.sin(muzzle.heading) <= 0)) return;
    const ux = dx / dist, uy = dy / dist;
    const totalLen = dist + Math.max(0, strip.length - range);
    const t = Math.max(0, Math.min(1, (6 - strip.life + fraction) / 6));
    const alpha = Math.round(245 * (1 - t * t) * detail);
    const head = probe ? dist * Math.min(1, 0.45 + 1.8 * t) : dist + (totalLen - dist) * Math.min(1, 1.5 * t);
    const nail = cast.tool === 'hydraulic_nailer';
    const accent: RGB = probe && cast.modified ? [104, 250, 224] : FLOATING_WEAPON_ART[cast.tool].tint;
    const tail = Math.max(0, head - (nail ? 28 : probe ? 22 : 20));
    const nx = -uy, ny = ux;

    // Quiet pixel tracer dots from barrel to tail
    g.fillColor = scratchColor(...accent, Math.round(alpha * 0.42));
    pxLine(g, muzzle.x + ux * (tail * Math.min(1, 2.5 * t)), muzzle.y + uy * (tail * Math.min(1, 2.5 * t)),
        muzzle.x + ux * head, muzzle.y + uy * head, 2, 6);
    g.fill();

    // Solid stepped bolt body (double rail for upgraded hydraulic nailer!)
    const offsets = nail && cast.modified ? [-4, 4] : [0];
    for (const off of offsets) {
        const bx = muzzle.x + nx * off, by = muzzle.y + ny * off;
        g.fillColor = scratchColor(...accent, alpha);
        pxLine(g, bx + ux * tail, by + uy * tail, bx + ux * head, by + uy * head, nail ? 4 : 2, 3);
        g.fill();
        // Bright white pixel core at head
        const hx = snap2(bx + ux * head), hy = snap2(by + uy * head);
        g.fillColor = scratchColor(...whiteHot, alpha);
        g.rect(hx - 2, hy - 2, 4, 4);
        if (probe && cast.modified) {
            g.rect(hx + snap2(nx * 4) - 1, hy + snap2(ny * 4) - 1, 2, 2);
            g.rect(hx - snap2(nx * 4) - 1, hy - snap2(ny * 4) - 1, 2, 2);
        }
        g.fill();
    }
    // Rivet rotating brass pixel bands
    if (!nail && !probe) {
        g.fillColor = scratchColor(...(cast.modified ? oxide : brass), alpha);
        for (let i = 0; i < 3; i++) {
            const at = tail + (head - tail) * ((i + 0.5) / 3);
            const side = cast.modified ? Math.sin(i * 2.5 + t * 8) * 4 : (i % 2 ? 2 : -2);
            g.rect(snap2(muzzle.x + ux * at + nx * side) - 1, snap2(muzzle.y + uy * at + ny * side) - 1, 2, 2);
        }
        g.fill();
    }
}

/** Pure 3-value pixel puffs for Torch flame & jagged pixel arcs for Pulse Nozzle (NO smooth cones!). */
function drawPixelJet(g: Graphics, e: Sector, cast: WeaponCast, muzzle: WeaponMuzzle, fraction: number, detail: number): void {
    const t = Math.max(0, (6 - e.life + fraction) / 6);
    const half = Math.atan(e.slope);
    const angle = muzzle.heading ?? Math.atan2(e.uy, e.ux);
    const ux = Math.cos(angle), uy = Math.sin(angle);
    const alpha = Math.round(248 * (1 - t * t) * detail);
    const front = cast.tool === 'torch'
        ? e.radius * Math.min(1, 0.48 + t * 0.9)
        : 6 + (e.radius - 6) * (1 - (1 - t) * (1 - t));

    if (cast.tool === 'torch') {
        const blueFlame = cast.modified && cast.powered;
        const outer: RGB = blueFlame ? [76, 152, 255] : [255, 92, 42];
        const mid: RGB = blueFlame ? [132, 248, 255] : [255, 206, 74];
        const streams = 5;
        // Pass 1: dark pixel smoke puffs at leading edge
        g.fillColor = scratchColor(...soot, Math.round(alpha * 0.65));
        for (let s = 0; s < streams; s++) {
            const a = angle + half * ((s / (streams - 1)) * 2 - 1) * 0.85;
            const d = Math.min(e.radius, front * (0.85 + 0.15 * Math.sin(cast.tick + s * 2)));
            const px = snap2(muzzle.x + Math.cos(a) * d);
            const py = snap2(muzzle.y + Math.sin(a) * d + t * 6);
            g.rect(px - 4, py - 4, 8, 8);
        }
        g.fill();

        // Pass 2: chunky outer flame pixel squares (size shrinks toward tip)
        g.fillColor = scratchColor(...outer, Math.round(alpha * 0.92));
        for (let s = 0; s < streams; s++) {
            const laneAngle = angle + half * ((s / (streams - 1)) * 2 - 1) * 0.82;
            const lx = Math.cos(laneAngle), ly = Math.sin(laneAngle);
            for (let step = 1; step <= 4; step++) {
                const u = step / 4;
                const d = front * u * (0.88 + 0.12 * Math.sin(cast.tick * 1.3 + s + step));
                const jitter = Math.sin(cast.tick + s * 3 + step * 2 + t * 9) * 3;
                const px = snap2(muzzle.x + lx * d - ly * jitter);
                const py = snap2(muzzle.y + ly * d + lx * jitter);
                const size = step === 4 ? 4 : step === 3 ? 6 : 8;
                g.rect(px - size / 2, py - size / 2, size, size);
            }
        }
        g.fill();

        // Pass 3: bright yellow/cyan inner flame blocks
        g.fillColor = scratchColor(...mid, alpha);
        for (let s = 1; s < streams - 1; s++) {
            const laneAngle = angle + half * ((s / (streams - 1)) * 2 - 1) * 0.65;
            for (let step = 1; step <= 3; step++) {
                const d = front * (step / 4.2);
                const px = snap2(muzzle.x + Math.cos(laneAngle) * d);
                const py = snap2(muzzle.y + Math.sin(laneAngle) * d);
                const size = step === 3 ? 4 : 6;
                g.rect(px - size / 2, py - size / 2, size, size);
            }
        }
        g.fill();

        // Pass 4: white-hot nozzle core + detached pixel embers
        g.fillColor = scratchColor(...whiteHot, alpha);
        g.rect(snap2(muzzle.x + ux * 6) - 3, snap2(muzzle.y + uy * 6) - 3, 6, 6);
        for (let i = -1; i <= 1; i++) {
            const a = angle + i * half * 0.55;
            const d = Math.min(e.radius * 0.96, front * 1.05);
            g.rect(snap2(muzzle.x + Math.cos(a) * d), snap2(muzzle.y + Math.sin(a) * d), 2, 2);
        }
        g.fill();
        return;
    }

    // Pulse Nozzle: discrete pixel shockwave arcs
    const count = cast.modified ? 4 : 2;
    for (let i = 0; i < count; i++) {
        const radius = Math.max(6, front * (1 - i * 0.19));
        g.fillColor = i % 2 ? scratchColor(...whiteHot, alpha) : scratchColor(...plasma, alpha);
        pxRing(g, muzzle.x, muzzle.y, radius, i === 0 ? 4 : 2, angle - half, half * 2, i === 0 ? 5 : 4);
        g.fill();
    }
    if (cast.modified) {
        g.fillColor = scratchColor(172, 250, 255, alpha);
        for (const aOff of [-half * 0.55, 0, half * 0.55]) {
            const a = angle + aOff;
            const d = front * 0.78;
            g.rect(snap2(muzzle.x + Math.cos(a) * d) - 2, snap2(muzzle.y + Math.sin(a) * d) - 2, 4, 4);
        }
        g.fill();
    }
}

/** Pure jagged pixel rings for Induction Coil & Traction Coil. */
function drawPixelCoilField(g: Graphics, field: Circle, cast: WeaponCast, muzzle: WeaponMuzzle, fraction: number, detail: number): void {
    const t = Math.max(0, (11 - field.life + fraction) / 11);
    const pull = cast.tool === 'traction_coil';
    const front = pull ? (t < 0.25 ? t / 0.25 : (1 - t) / 0.75) : Math.min(1, t * 1.45);
    const source = pull && t > 0.25 ? muzzle.flash ?? muzzle : muzzle;
    const cx = source.x + (field.x - source.x) * front;
    const cy = source.y + (field.y - source.y) * front;
    const radius = 4 + (field.radius - 4) * front;
    const alpha = Math.round(240 * (1 - t) * detail);
    const tint = FLOATING_WEAPON_ART[cast.tool].tint;

    const rings = cast.modified ? 3 : 1;
    for (let ring = 0; ring < rings; ring++) {
        const r = Math.max(4, radius - ring * 10);
        const rot = (ring % 2 ? -1 : 1) * t * 1.8;
        g.fillColor = ring === 1 ? scratchColor(...whiteHot, alpha) : scratchColor(...tint, alpha);
        pxRing(g, cx, cy, r, ring === 0 ? 4 : 2, rot, Math.PI * 2, ring === 0 ? 6 : 5, pull ? 4 : 5);
        g.fill();
    }
    // Rotating outer pixel teeth
    const teeth = cast.modified ? 8 : 5;
    g.fillColor = scratchColor(...whiteHot, Math.round(alpha * 0.9));
    for (let i = 0; i < teeth; i++) {
        const a = (i * Math.PI * 2) / teeth + (pull ? -2.2 : 1.6) * t;
        g.rect(snap2(cx + Math.cos(a) * radius) - 2, snap2(cy + Math.sin(a) * radius) - 2, 4, 4);
    }
    g.fill();
}

/** Crisp 2-tone pixel smear arc for Arc Wrench & Bypass Wrench (NO smooth round caps!). */
function drawPixelSweepTrail(g: Graphics, cast: WeaponCast, age: number, detail: number): void {
    const { melee } = cast;
    const boost = cast.effectBoost ?? 0;
    const linger = 6 + boost;
    if (!melee || age < melee.first || age > melee.last + linger) return;
    const end = Math.min(age, melee.last);
    const start = Math.max(melee.first, age - linger);
    if (start >= end) return;
    const { tint } = FLOATING_WEAPON_ART[cast.tool];
    const energized: RGB = cast.tool === 'wrench' ? plasma : brass;
    const samples = Math.max(4, Math.ceil((end - start) * 3));

    // Pass 1: outer colored pixel smear blocks
    for (let i = 0; i <= samples; i++) {
        const u = start + ((end - start) * i) / samples;
        const pt = sampleMeleeHead(melee, u);
        const strength = Math.max(0, 1 - (age - u) / linger);
        const size = strength > 0.55 ? (cast.powered ? 8 : 6) : strength > 0.25 ? 4 : 2;
        g.fillColor = scratchColor(...(i > samples * 0.55 ? energized : tint), Math.round(225 * strength * detail));
        g.rect(snap2(pt.x) - size / 2, snap2(pt.y) - size / 2, size, size);
        g.fill();
    }
    // Pass 2: crisp white-hot leading edge pixel streak (first half of arc)
    g.fillColor = scratchColor(...whiteHot, Math.round(240 * detail));
    const hotStart = Math.max(start, end - 2.2);
    for (let i = 0; i <= 6; i++) {
        const u = hotStart + ((end - hotStart) * i) / 6;
        const pt = sampleMeleeHead(melee, u);
        g.rect(snap2(pt.x) - 2, snap2(pt.y) - 2, 4, 4);
    }
    g.fill();

    // Upgraded flywheel teeth / bypass heavy hammer blocks
    if (cast.modified) {
        const head = sampleMeleeHead(melee, end);
        const force = Math.max(0, 1 - (age - end) / linger);
        pxStarFlash(g, head.x, head.y, (cast.powered ? 10 : 6) * force, energized, 240 * force * detail);
    }
}

function drawMeleeSparks(
    g: Graphics,
    hit: Extract<Attack, { shape: 'link' }>,
    tint: RGB,
    fraction: number,
    detail: number,
): void {
    const { x, y, from, life } = hit;
    const t = Math.max(0, 1 - (life - fraction) / 7);
    const alpha = Math.round(230 * (1 - t) * detail);
    if (hit.sourceCast?.tool === 'bypass_wrench' && hit.sourceCast.powered) {
        const radius = (hit.sourceCast.modified ? 24 : 16) * (0.35 + t * 0.65);
        g.fillColor = scratchColor(...brass, alpha);
        pxRing(g, x, y, radius, 4, t, Math.PI * 2, 6, 3);
        g.fill();
    }
    const dir = Math.atan2(y - from.y, x - from.x);
    g.fillColor = scratchColor(...tint, alpha);
    for (let i = -1; i <= 1; i++) {
        const a = dir + i * 0.55;
        const travel = 4 + t * 12;
        g.rect(snap2(x + Math.cos(a) * travel) - 1, snap2(y + Math.sin(a) * travel) - 1, 2, 2);
    }
    g.fill();
}

/** Pure 2px stepped lightning bolt (Saint11 style: brightest white on frame 0, then jagged cyan/violet pixels). */
function drawPixelArc(
    g: Graphics,
    from: { x: number; y: number },
    hit: Extract<Attack, { shape: 'link' }>,
    fraction: number,
    detail: number,
): void {
    const { x, y, life, fromWeapon } = hit;
    const elapsed = 7 - life + fraction;
    const fade = Math.max(0, 1 - elapsed / 7);
    const force = fromWeapon ? 1 : 0.72;
    const dx = x - from.x, dy = y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length, ny = dx / length;
    const boost = hit.sourceCast?.effectBoost ?? 0;
    const amp = Math.min(length / 7, 8 + boost * 2) * force;
    const segs = 5;

    const traceBolt = (side: number, block: number, col: Color) => {
        g.fillColor = col;
        let px = from.x, py = from.y;
        for (let i = 1; i <= segs; i++) {
            const u = i / segs;
            const bend = i === segs ? 0 : side * Math.sin(i * 4.3 + Math.floor(elapsed) * 1.9) * amp;
            const qx = from.x + dx * u + nx * bend;
            const qy = from.y + dy * u + ny * bend;
            pxLine(g, px, py, qx, qy, block, block);
            px = qx; py = qy;
        }
        g.fill();
    };

    const tint = FLOATING_WEAPON_ART.arc_gun.tint;
    // Frame 0-1: bold pure-white lightning core!
    if (elapsed < 1.6) {
        traceBolt(1, 4, scratchColor(...whiteHot, Math.round(248 * detail)));
    } else {
        traceBolt(1, 2, scratchColor(...tint, Math.round(225 * fade * detail)));
    }
    if (hit.sourceCast?.modified) {
        traceBolt(-1.3, 2, scratchColor(188, 132, 255, Math.round(230 * fade * detail)));
    }
    // Crisp impact spark at destination node
    if (elapsed < 2.2) pxStarFlash(g, x, y, 6, tint, 235 * fade * detail);
}

/** Crisp muzzle pixel starburst flash (first-frame circle/star trick from Vlambeer). */
function drawPixelDischarge(g: Graphics, cast: WeaponCast, muzzle: WeaponMuzzle, t: number, detail: number): void {
    const { effect, tint } = FLOATING_WEAPON_ART[cast.tool];
    const alpha = Math.round(245 * (1 - t * t) * detail);
    if (effect === 'pull' || effect === 'coil') {
        g.fillColor = scratchColor(...tint, alpha);
        pxRing(g, muzzle.x, muzzle.y, 4 + 10 * (1 - t), 2, t * 3, Math.PI * 2, 4);
        g.fill();
        return;
    }
    const r = (effect === 'nail' ? 10 : effect === 'rivet' ? 8 : 6) * (1 - t * 0.6) * (cast.modified ? 1.25 : 1);
    const rim: RGB = effect === 'jet' ? (cast.powered ? plasma : oxide) : tint;
    pxStarFlash(g, muzzle.x, muzzle.y, r, rim, alpha);
}

function drawPixelImpact(g: Graphics, effect: Contact, fraction: number): void {
    const { life, sourceCast } = effect;
    const x = snap2(effect.x), y = snap2(effect.y);
    const elapsed = 7 - life + fraction;
    const tint = sourceCast ? FLOATING_WEAPON_ART[sourceCast.tool].tint : undefined;
    if (elapsed < 2.2) {
        pxStarFlash(g, x, y, 6 + (sourceCast?.effectBoost ?? 0) * 2, tint ?? brass, 235);
        return;
    }
    const fade = Math.max(0, 1 - elapsed / 7);
    const spread = snap2(elapsed * 1.4);
    g.fillColor = tint ? scratchColor(...tint, Math.round(190 * fade)) : scratchColor(contactCore.r, contactCore.g, contactCore.b, Math.round(190 * fade));
    g.rect(x - spread - 2, y + spread - 2, 2, 2);
    g.rect(x + spread, y - spread, 2, 2);
    g.fill();
}

function drawPixelStrike(g: Graphics, hit: WeaponImpact, age: number, detail: number): void {
    const { cast, rank, weight, x, y } = hit;
    const broken = weight === 'break' || weight === 'boss-break';
    const dur = broken || weight === 'armor' ? IMPACT_TICKS : 8;
    const t = (age - Math.min(rank, 2) * 0.6) / dur;
    if (t < 0 || t >= 1) return;

    const k = (weight === 'boss-break' ? 1.55 : broken ? 1.05 : weight === 'armor' ? 1.2 : 0.72) * (cast.modified ? 1.15 : 1);
    const fade = Math.round(248 * (1 - t * t) * detail);
    const tint = FLOATING_WEAPON_ART[cast.tool].tint;
    const r = (4 + 22 * (1 - (1 - t) * (1 - t))) * k;

    // Initial white-hot pixel starburst
    if (t < 0.22) {
        pxStarFlash(g, x, y, 10 * (1 - t * 3.5) * k, broken ? brass : tint, fade);
    }

    if (broken) {
        // Pixel explosion ring + flying shrapnel blocks
        g.fillColor = scratchColor(...(cast.tool === 'torch' ? oxide : tint), fade);
        pxRing(g, x, y, r, 2, t * 2, Math.PI * 2, 6, 3);
        g.fill();

        const pieces = weight === 'boss-break' ? 10 : 5;
        g.fillColor = scratchColor(...brass, fade);
        for (let i = 0; i < pieces; i++) {
            const a = (i * Math.PI * 2) / pieces + (cast.tick % 7) * 0.35;
            const px = snap2(x + Math.cos(a) * r);
            const py = snap2(y + Math.sin(a) * r - t * t * 12);
            const sz = t < 0.5 ? 4 : 2;
            g.rect(px - sz / 2, py - sz / 2, sz, sz);
        }
        g.fill();
    } else if (weight === 'armor') {
        g.fillColor = scratchColor(...brass, fade);
        for (let i = 0; i < 4; i++) {
            const a = Math.atan2(cast.uy, cast.ux) + (i - 1.5) * 0.55;
            g.rect(snap2(x + Math.cos(a) * r * 0.8), snap2(y + Math.sin(a) * r * 0.8 - t * t * 8), 2, 2);
        }
        g.fill();
    }
}

export function drawBossBreak(g: Graphics, x: number, y: number, elapsed: number, final: boolean, field: CombatBounds): void {
    const pulse = Math.min(1, elapsed / 0.24);
    if (elapsed < 0.32) {
        g.fillColor = scratchColor(...whiteHot, 250);
        pxRing(g, x, y, 6 + 34 * (1 - pulse), 4, -pulse * 2, Math.PI * 2, 6);
        g.fill();
    }
    for (let i = 0; i < (final ? 5 : 3); i++) {
        const t = (elapsed - 0.12 - i * 0.09) / 0.78;
        if (t < 0 || t >= 1) continue;
        const px = snap2(x + Math.sin(i * 9) * 16);
        const py = snap2(y + Math.sin(i * 2) * 12);
        const radius = (12 + 64 * (1 - (1 - t) * (1 - t))) * (i ? 0.66 : 1);
        const alpha = Math.round(240 * (1 - t));
        g.fillColor = scratchColor(...(i % 2 ? plasma : brass), alpha);
        pxRing(g, px, py, radius, 4, t * 2 + i, Math.PI * 2, 8, 4);
        g.fill();
        if (t < 0.35) pxStarFlash(g, px, py, 14 * (1 - t * 2), oxide, alpha);
    }
    const current = Math.min(1, Math.max(0, elapsed - 0.45) / 0.75);
    if (current > 0) {
        g.fillColor = scratchColor(134, 229, 209, Math.round(24 * current));
        g.rect(field.left, field.bottom, field.right - field.left, field.top - field.bottom);
        g.fill();
        for (const side of [-1, 1]) {
            for (const row of [-1, 1]) {
                const endX = side > 0 ? field.right - 10 : field.left + 10;
                const endY = row > 0 ? field.top - 18 : field.bottom + 18;
                const bendX = snap2(x + (endX - x) * 0.58);
                const bendY = snap2(y + (endY - y) * 0.42);
                const nodes = [[x, y], [bendX, y], [bendX, bendY], [endX, bendY], [endX, endY]];
                g.fillColor = scratchColor(98, 240, 212, 185);
                for (let i = 0; i < 4; i++) {
                    const f = Math.max(0, Math.min(1, current * 4 - i));
                    if (!f) break;
                    const from = nodes[i], to = nodes[i + 1];
                    pxLine(g, from[0], from[1], from[0] + (to[0] - from[0]) * f, from[1] + (to[1] - from[1]) * f, 2, 3);
                }
                g.fill();
            }
        }
        g.fillColor = scratchColor(103, 254, 217, Math.round(220 * (1 - current)));
        pxRing(g, x, y, 16 + 170 * current, 4, 0, Math.PI * 2, 10, 5);
        g.fill();
    }
}
