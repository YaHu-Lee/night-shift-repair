import { Color, Graphics } from 'cc';
import type { Attack, WeaponCast } from '../m1/Battle';
import { sampleMeleeHead } from '../m1/WeaponMotion';
import { FLOATING_WEAPON_ART } from './FloatingWeaponArt';

function ink(r: number, g: number, b: number) {
    return Array.from({ length: 13 }, (_, life) => ({
        edge: new Color(r, g, b, Math.min(225, 25 + life * 30)),
        wash: new Color(r, g, b, Math.min(48, 6 + life * 7)),
    }));
}

const colors = { arc: ink(122, 218, 255), shot: ink(255, 203, 121), heat: ink(255, 139, 63),
    magnet: ink(98, 238, 197), induction: ink(205, 151, 255) };
const contactCore = new Color(255, 248, 222);
type Contact = Extract<Attack, { shape: 'link' | 'impact' }>;

// The graphics node's local space is battle space. Its parent clips to the playfield.
export function drawSkillEffects(g: Graphics, effects: readonly Attack[], modelEffects = false,
    weaponOrigin?: (cast: WeaponCast) => { x: number; y: number } | undefined, floatingTick?: number,
    casts: readonly WeaponCast[] = []): void {
    g.clear();
    const fraction = floatingTick === undefined ? 0 : floatingTick % 1;
    const detail = floatingTick !== undefined && casts.filter(cast => floatingTick - cast.tick < 12).length >= 3 ? 0.72 : 1;
    const contacts = floatingTick === undefined ? undefined : new Map<string, Contact>();
    if (floatingTick !== undefined) {
        for (const cast of casts) drawSweepTrail(g, cast, floatingTick - cast.tick, detail);
    }
    for (const effect of effects) {
        const { x, y, life } = effect;
        const color = colors[effect.kind][life];
        const art = floatingTick !== undefined && effect.sourceCast ? FLOATING_WEAPON_ART[effect.sourceCast.tool] : undefined;
        if (contacts && (effect.shape === 'impact' || effect.shape === 'link')) {
            const key = Math.round(x) + ':' + Math.round(y);
            if ((contacts.get(key)?.life ?? 0) <= life) contacts.set(key, effect);
        }
        g.strokeColor = color.edge;
        g.fillColor = color.wash;
        g.lineWidth = 1;
        switch (effect.shape) {
            case 'circle': {
                const { radius } = effect;
                if (art && effect.sourceCast) {
                    drawCoilField(g, effect, effect.sourceCast, fraction, detail);
                    break;
                }
                g.circle(x, y, radius);
                g.fill();
                g.stroke();
                if (modelEffects) break;
                const t = life / 12;
                const inner = radius * (effect.kind === 'magnet' ? t : 1 - t);
                g.lineWidth = 2;
                for (let i = 0; i < 4; i++) {
                    const start = i * Math.PI / 2 + t * 0.6;
                    g.arc(x, y, Math.max(1, inner - 1), start, start + 0.9, true);
                }
                g.stroke();
                break;
            }
            case 'sector': {
                const angle = Math.atan2(effect.uy, effect.ux);
                const half = Math.atan(effect.slope);
                if (art?.effect === 'pulse' || art?.effect === 'jet') {
                    drawJet(g, effect, effect.sourceCast!, fraction, detail);
                    break;
                }
                traceSector(g, x, y, effect.radius, angle, half);
                g.fill();
                g.stroke();
                if (modelEffects) break;
                const front = effect.radius * (1 - life / 9);
                g.lineWidth = 2;
                for (let i = -1; i <= 1; i++) {
                    const heading = angle + i * half * 0.65;
                    const tip = front * (1 - Math.abs(i) * 0.18);
                    g.moveTo(x + Math.cos(heading) * tip * 0.22, y + Math.sin(heading) * tip * 0.22);
                    g.lineTo(x + Math.cos(heading + 0.12) * tip * 0.57, y + Math.sin(heading + 0.12) * tip * 0.57);
                    g.lineTo(x + Math.cos(heading) * tip, y + Math.sin(heading) * tip);
                }
                g.stroke();
                break;
            }
            case 'strip': {
                const { ux, uy, length } = effect;
                if (art?.effect === 'rivet' || art?.effect === 'nail' || art?.effect === 'fork') {
                    drawBolt(g, effect, effect.sourceCast!, fraction, detail);
                    break;
                }
                traceStrip(g, effect);
                g.fill();
                g.stroke();
                if (modelEffects) break;
                const head = length * (1 - life / 8);
                const tail = Math.max(0, head - 22);
                g.lineWidth = 2;
                g.moveTo(x + ux * tail, y + uy * tail);
                g.lineTo(x + ux * head, y + uy * head);
                g.stroke();
                break;
            }
            case 'link': {
                if (effect.mark) drawMarkFeedback(g, effect, fraction);
                if (modelEffects) {
                    g.circle(x, y, 1.6);
                    g.fill();
                    break;
                }
                if (effect.sourceCast?.melee && art) {
                    drawMeleeSparks(g, effect, art.tint, fraction, detail);
                    break;
                }
                const from = (effect.fromWeapon && effect.sourceCast && weaponOrigin?.(effect.sourceCast)) || effect.from;
                if (art?.effect === 'arc') {
                    drawFloatingArc(g, from, effect, fraction, detail);
                    break;
                }
                const dx = x - from.x, dy = y - from.y;
                const offset = (life % 2 ? 1 : -1) / Math.max(11, Math.hypot(dx, dy));
                g.lineWidth = 1.7;
                g.moveTo(from.x, from.y);
                g.lineTo(from.x + dx * 0.38 - dy * offset * 2, from.y + dy * 0.38 + dx * offset * 2);
                g.lineTo(x - dx * 0.38 + dy * offset * 2, y - dy * 0.38 - dx * offset * 2);
                g.lineTo(x, y);
                g.stroke();
                // Fall through to mark the endpoint of each successful hop.
            }
            case 'impact': {
                if (art?.effect === 'pull' && 'pullFrom' in effect && effect.pullFrom) {
                    const t = (life - fraction) / 7;
                    const { x: px, y: py } = effect.pullFrom;
                    g.strokeColor = new Color(...art.tint, Math.round(200 * t * detail));
                    const reach = Math.hypot(px - x, py - y) || 1;
                    const dx = (px - x) / reach, dy = (py - y) / reach;
                    const heavy = effect.sourceCast?.modified;
                    g.lineWidth = heavy ? 4 : 2.5;
                    for (const side of heavy ? [-1, 1] : [0]) {
                        g.moveTo(px, py);
                        g.lineTo(x - dy * side * 4 + dx * 6, y + dx * side * 4 + dy * 6);
                        g.lineTo(x - dy * side * 6, y + dx * side * 6);
                    }
                    g.stroke();
                    g.fillColor = new Color(199, 255, 213, 230 * t);
                    for (let i = 1; i <= 3; i++) {
                        const travel = ((i / 3 + (1 - t)) % 1) * reach;
                        g.rect(Math.round(x + dx * travel) - 2, Math.round(y + dy * travel) - 2, 4, 4);
                    }
                    g.fill();
                }
                if (contacts) break;
                g.fillColor = color.edge;
                g.circle(x, y, modelEffects ? 1.6 : 1.4 + life * 0.32);
                g.fill();
                break;
            }
        }
    }
    // Contact markers stay above the cast trails, even when several weapons fire on the same step.
    for (const effect of contacts?.values() ?? []) {
        drawPixelImpact(g, effect, fraction);
    }
}

function drawMarkFeedback(g: Graphics, hit: Extract<Attack, { shape: 'link' }>, fraction: number): void {
    const elapsed = 7 - hit.life + fraction;
    const fade = Math.max(0, 1 - elapsed / 7);
    const boosted = hit.mark === 'boosted';
    const x = Math.round(hit.x), y = Math.round(hit.y + 6);
    const offset = (boosted ? 6 : 3) + Math.floor(elapsed * 0.6);
    g.fillColor = boosted ? new Color(255, 222, 105, Math.round(250 * fade)) : new Color(121, 229, 255, Math.round(212 * fade));
    g.rect(x - offset - 1, y - 1, 3, 3);
    g.rect(x + offset - 1, y - 1, 3, 3);
    if (boosted) {
        g.rect(x - 1, y + offset, 3, 5);
        g.rect(x - 2, y + offset + 1, 5, 3);
    }
    g.fill();
}

type Strip = Extract<Attack, { shape: 'strip' }>;
type Sector = Extract<Attack, { shape: 'sector' }>;
type Circle = Extract<Attack, { shape: 'circle' }>;

// Positions in a firing lane are signed distances along and across the actual attack axis.
function lanePoint(g: Graphics, e: Strip | Sector, forward: number, side: number, first = false): void {
    const x = Math.round(e.x + e.ux * forward - e.uy * side), y = Math.round(e.y + e.uy * forward + e.ux * side);
    if (first) g.moveTo(x, y); else g.lineTo(x, y);
}

function drawBolt(g: Graphics, e: Strip, cast: WeaponCast, fraction: number, detail: number): void {
    const t = 1 - (e.life - fraction) / 8;
    const alpha = Math.round(255 * (1 - t * t) * detail);
    const head = e.length * Math.min(1, 0.25 + 1.45 * t);
    const nail = cast.tool === 'hydraulic_nailer', probe = cast.tool === 'split_probe';
    const accent = FLOATING_WEAPON_ART[cast.tool].tint;
    const half = Math.min(e.halfWidth, nail ? 7 : 5);
    const tail = Math.max(0, head - (nail ? 52 : probe ? 34 : 42));
    g.strokeColor = new Color(...accent, Math.round(alpha * 0.65));
    g.lineWidth = probe ? 2 : 4;
    lanePoint(g, e, 0, 0, true); lanePoint(g, e, head, 0); g.stroke();
    if (probe) {
        // One dart for each acquired target. The prismatic head opens into a hollow kite.
        const width = cast.modified ? 7 : 4;
        g.fillColor = new Color(...(cast.modified ? [100, 248, 224] as const : accent), alpha);
        lanePoint(g, e, tail, 0, true); lanePoint(g, e, head * 0.86, width);
        lanePoint(g, e, head, 0); lanePoint(g, e, head * 0.86, -width); g.close(); g.fill();
        g.strokeColor = new Color(242, 255, 255, alpha); g.lineWidth = 2;
        lanePoint(g, e, tail, 0, true); lanePoint(g, e, head, 0); g.stroke();
        if (cast.modified) {
            g.strokeColor = new Color(100, 255, 210, alpha); g.lineWidth = 2;
            for (const side of [-1, 1]) {
                lanePoint(g, e, e.length - 6, side * 5, true); lanePoint(g, e, e.length, side * 8);
                lanePoint(g, e, e.length + 3, side * 5);
            }
            g.stroke();
        }
        return;
    }
    for (const offset of nail && cast.modified ? [-half * 0.55, half * 0.55] : [0]) {
        const width = nail && cast.modified ? 2.5 : half;
        g.fillColor = new Color(...accent, alpha);
        lanePoint(g, e, tail, offset, true); lanePoint(g, e, head - 8, offset + width);
        lanePoint(g, e, head, offset); lanePoint(g, e, head - 8, offset - width); g.close(); g.fill();
        g.strokeColor = new Color(255, 253, 218, alpha); g.lineWidth = 2;
        lanePoint(g, e, tail + 2, offset, true); lanePoint(g, e, head, offset); g.stroke();
    }
    // Brass collars behind a rivet; the piercing nail group draws a twisting rifling trace.
    if (!nail) {
        g.strokeColor = new Color(...accent, alpha); g.lineWidth = 3;
        for (let i = 0; i < 4; i++) {
            const at = tail + (head - tail) * (i + 0.5) / 5;
            const side = cast.modified ? Math.sin(i * 2.3 + t * 7) * 4 : 0;
            lanePoint(g, e, at - 3, side - 3, true); lanePoint(g, e, at + 2, side + 3);
        }
        g.stroke();
        if (cast.modified) {
            g.strokeColor = new Color(255, 110, 66, alpha); g.lineWidth = 2;
            for (let i = 0; i <= 10; i++) lanePoint(g, e, head * i / 10, Math.sin(i * 1.4 - t * 9) * half, i === 0);
            g.stroke();
        }
    }
}

function drawJet(g: Graphics, e: Sector, cast: WeaponCast, fraction: number, detail: number): void {
    const t = 1 - (e.life - fraction) / 8, half = Math.atan(e.slope);
    const alpha = Math.round(255 * (1 - t * t) * detail);
    const front = e.radius * Math.min(1, 0.55 + t);
    if (cast.tool === 'torch') {
        const high = cast.modified && cast.powered;
        const outer = high ? [82, 146, 255] as const : [255, 89, 38] as const;
        const inner = high ? [132, 252, 255] as const : [255, 209, 77] as const;
        for (let tongue = -2; tongue <= 2; tongue++) {
            const slope = Math.tan(half * tongue * .36);
            const flicker = Math.sin(cast.tick + tongue * 3 + t * 8);
            const length = front * (.89 + .09 * flicker - .07 * Math.abs(tongue));
            const curl = (4 + 3 * t) * flicker;
            for (const core of [false, true]) {
                const width = core ? 3 : 7, tip = length * (core ? .73 : 1);
                g.fillColor = new Color(...(core ? inner : outer), core ? alpha : Math.round(alpha * .84));
                lanePoint(g, e, 5, 0, true);
                lanePoint(g, e, tip * .32, tip * .32 * slope - width * .55);
                lanePoint(g, e, tip * .67, tip * .67 * slope - width + curl);
                lanePoint(g, e, tip, tip * slope - curl * .5);
                lanePoint(g, e, tip * .72, tip * .72 * slope + width * .5 + curl);
                lanePoint(g, e, tip * .38, tip * .38 * slope + width);
                g.close(); g.fill();
            }
            const ember = Math.min(e.radius * .94, length * 1.04);
            g.fillColor = new Color(...inner, alpha);
            g.rect(Math.round(e.x + ember * (e.ux - slope * e.uy)), Math.round(e.y + ember * (e.uy + slope * e.ux)), 3, 3); g.fill();
        }
        return;
    }
    const count = cast.modified ? 4 : 2;
    for (let i = 0; i < count; i++) {
        const radius = front * (1 - i * 0.18);
        g.strokeColor = i % 2 ? new Color(235, 255, 255, alpha) : new Color(85, 209, 255, alpha);
        g.lineWidth = i === 0 ? 5 : 2.5;
        for (let j = 0; j <= 8; j++) {
            const angle = half * (j / 4 - 1);
            lanePoint(g, e, radius * Math.cos(angle), radius * Math.sin(angle), j === 0);
        }
        g.stroke();
    }
    if (cast.modified) {
        g.strokeColor = new Color(159, 250, 255, alpha); g.lineWidth = 3;
        for (const angle of [-half * .6, 0, half * .6]) {
            const tip = front * .78, x = tip * Math.cos(angle), y = tip * Math.sin(angle);
            lanePoint(g, e, x - 7, y - 4, true); lanePoint(g, e, x, y); lanePoint(g, e, x - 7, y + 4);
        }
        g.stroke();
    }
}

function drawCoilField(g: Graphics, e: Circle, cast: WeaponCast, fraction: number, detail: number): void {
    const t = 1 - (e.life - fraction) / 12, pull = cast.tool === 'traction_coil';
    const radius = e.radius * (pull ? 1 - t * .88 : Math.min(1, .42 + t));
    const alpha = Math.round(244 * (1 - t) * detail);
    const tint = FLOATING_WEAPON_ART[cast.tool].tint;
    if (pull) {
        g.strokeColor = new Color(...tint, alpha); g.lineWidth = cast.modified ? 4 : 2.6;
        for (let arm = 0; arm < (cast.modified ? 6 : 3); arm++) {
            const start = arm * Math.PI * 2 / (cast.modified ? 6 : 3) - t * 2;
            for (let i = 0; i < 7; i++) {
                const r = radius * (1 - i / 9), angle = start + i * 0.12;
                const x = e.x + r * Math.cos(angle), y = e.y + r * Math.sin(angle);
                if (!i) g.moveTo(x, y); else g.lineTo(x, y);
            }
        }
        g.stroke(); return;
    }
    for (let ring = 0; ring < (cast.modified ? 3 : 1); ring++) {
        const r = Math.max(3, radius - ring * 9);
        g.strokeColor = ring === 1 ? new Color(237, 248, 255, alpha) : new Color(...tint, alpha);
        g.lineWidth = ring ? 2 : 4;
        for (let i = 0; i <= 12; i++) {
            const angle = i * Math.PI / 6 + (ring % 2 ? -1 : 1) * t * .55;
            const px = Math.round(e.x + r * Math.cos(angle)), py = Math.round(e.y + r * Math.sin(angle));
            if (!i) g.moveTo(px, py); else g.lineTo(px, py);
            if (i % 2 === 0 && i < 12) { g.moveTo(px, py); g.lineTo(e.x + (px - e.x) * .86, e.y + (py - e.y) * .86); g.moveTo(px, py); }
        }
        g.stroke();
    }
}

function traceSector(g: Graphics, x: number, y: number, radius: number, angle: number, half: number): void {
    g.arc(x, y, radius, angle - half, angle + half, true);
    g.lineTo(x, y);
    g.close();
}

function traceStrip(g: Graphics, { x, y, ux, uy, length, halfWidth }: Extract<Attack, { shape: 'strip' }>): void {
    const ox = -uy * halfWidth, oy = ux * halfWidth;
    const ex = x + ux * length, ey = y + uy * length;
    g.moveTo(x + ox, y + oy);
    g.lineTo(ex + ox, ey + oy);
    g.lineTo(ex - ox, ey - oy);
    g.lineTo(x - ox, y - oy);
    g.close();
}

function drawPixelImpact(g: Graphics, effect: Contact, fraction: number): void {
    const { life, sourceCast } = effect;
    const x = Math.round(effect.x), y = Math.round(effect.y);
    const elapsed = 7 - life + fraction;
    const tint = sourceCast ? FLOATING_WEAPON_ART[sourceCast.tool].tint : undefined;
    const fallback = colors[effect.kind][life].edge;
    const boost = sourceCast?.effectBoost ?? 0;
    if (elapsed < 2) {
        const radius = 5 + boost * 2;
        g.fillColor = tint ? new Color(...tint, 205) : fallback;
        for (const dx of [-1, 1]) for (const dy of [-1, 1]) {
            g.rect(x + dx * radius - 1, y + dy * radius - 1, 2 + Math.min(boost, 1), 2);
        }
        g.fill();
        g.fillColor = new Color(23, 24, 31, 210);
        g.rect(x - 3, y - 3, 6, 6);
        g.fill();
        g.fillColor = contactCore;
        g.rect(x - 2, y - 1, 4, 2);
        g.rect(x - 1, y - 2, 2, 4);
        g.fill();
        return;
    }
    const alpha = Math.round(180 * (1 - elapsed / 7));
    g.fillColor = tint ? new Color(...tint, alpha) : new Color(fallback.r, fallback.g, fallback.b, alpha);
    const spread = Math.floor(elapsed);
    g.rect(x - spread - 1, y + spread - 1, 2, 2);
    g.rect(x + spread - 1, y - spread - 1, 2, 2);
    g.fill();
}

function drawSweepTrail(g: Graphics, cast: WeaponCast, age: number, detail: number): void {
    const { melee } = cast;
    const boost = cast.effectBoost ?? 0;
    const linger = 4.5 + boost * 0.8;
    if (!melee || age < melee.first || age > melee.last + linger) return;
    const end = Math.min(age, melee.last);
    const start = Math.max(melee.first, age - linger);
    if (start >= end) return;
    const { tint } = FLOATING_WEAPON_ART[cast.tool];
    const energized = cast.tool === 'wrench' ? [109, 229, 255] as const : [255, 203, 128] as const;
    const cap = g.lineCap;
    g.lineCap = Graphics.LineCap.ROUND;
    for (let cursor = start; cursor < end;) {
        const next = Math.min(Math.floor(cursor) + 1, end);
        const a = sampleMeleeHead(melee, cursor), b = sampleMeleeHead(melee, next);
        const strength = Math.max(0, 1 - (age - (cursor + next) * 0.5) / linger);
        g.strokeColor = new Color(...tint, Math.round((181 + boost * 18) * strength * detail));
        g.lineWidth = (melee.radius * (1.35 + boost * 0.18)) * strength + 1;
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.strokeColor = new Color(255, 241, 198, Math.round(215 * strength * detail));
        g.lineWidth = 2 + boost * 0.5;
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        const dx = b.x - a.x, dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        if (distance > 1) {
            const side = cast.tool === 'wrench' ? 1 : -1;
            const nx = -dy / distance * side, ny = dx / distance * side;
            const rim = melee.radius * strength * (cast.powered ? 1.4 : 0.9);
            g.fillColor = cast.tool === 'wrench'
                ? new Color(87, 222, 255, Math.round(225 * strength * detail))
                : new Color(255, 89, 53, Math.round(240 * strength * detail));
            g.moveTo(a.x, a.y); g.lineTo(a.x + nx * rim, a.y + ny * rim);
            g.lineTo(b.x + nx * rim * .45, b.y + ny * rim * .45); g.lineTo(b.x, b.y); g.close(); g.fill();
            if (cast.modified) {
                // Gear teeth on the flywheel; block-shaped hammer afterimages on the bypass clutch.
                g.fillColor = new Color(...energized, Math.round(238 * strength));
                if (cast.tool === 'wrench') {
                    g.moveTo(a.x + nx * rim, a.y + ny * rim);
                    g.lineTo(a.x + nx * (rim + 4) - dx * .35, a.y + ny * (rim + 4) - dy * .35);
                    g.lineTo(b.x + nx * rim * .45, b.y + ny * rim * .45); g.close();
                } else {
                    const size = cast.powered ? 8 : 4;
                    g.rect(Math.round(b.x + nx * rim) - size / 2, Math.round(b.y + ny * rim) - size / 2, size, size);
                }
                g.fill();
            }
        }
        if (boost && strength > 0.28 && distance > 1) {
            const offset = Math.min(4.5 + boost * 0.45, melee.radius - 1) * strength;
            const sx = -dy / distance * offset, sy = dx / distance * offset;
            g.strokeColor = new Color(...energized, Math.round(242 * strength));
            g.lineWidth = 1.7 + boost * 0.5;
            g.moveTo(a.x + sx * 0.4, a.y + sy * 0.4);
            g.lineTo((a.x + b.x) / 2 + sx, (a.y + b.y) / 2 + sy);
            g.lineTo(b.x + sx * 0.28, b.y + sy * 0.28);
            g.stroke();
        }
        cursor = next;
    }
    g.lineCap = cap;
}

function drawMeleeSparks(g: Graphics, hit: Extract<Attack, { shape: 'link' }>,
    tint: readonly [number, number, number], fraction: number, detail: number): void {
    const { x, y, from, life } = hit;
    const t = 1 - (life - fraction) / 7;
    const direction = Math.atan2(y - from.y, x - from.x);
    if (hit.sourceCast?.tool === 'bypass_wrench' && hit.sourceCast.powered) {
        const radius = (hit.sourceCast.modified ? 23 : 15) * (0.35 + t * 0.65);
        g.strokeColor = new Color(255, 185, 89, Math.round(245 * (1 - t) * detail));
        g.lineWidth = hit.sourceCast.modified ? 4 : 2;
        for (let i = 0; i < 4; i++) {
            const a = direction + i * Math.PI / 2;
            g.moveTo(x + Math.cos(a) * 3, y + Math.sin(a) * 3);
            g.lineTo(x + Math.cos(a + .28) * radius * .68, y + Math.sin(a + .28) * radius * .68);
            g.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        }
        g.stroke();
    }
    g.fillColor = new Color(...tint, Math.round(166 * (1 - t) * detail));
    for (let i = -1; i <= 1; i++) {
        const dir = direction + i * 0.54, travel = 3 + t * (8 - Math.abs(i));
        const dx = Math.cos(dir) * travel, dy = Math.sin(dir) * travel;
        g.rect(Math.round(from.x + dx), Math.round(from.y + dy), 2, 2);
    }
    g.fill();
}

function drawFloatingArc(g: Graphics, from: { x: number; y: number },
    hit: Extract<Attack, { shape: 'link' }>, fraction: number, detail: number): void {
    const { x, y, life, fromWeapon } = hit;
    const elapsed = 7 - life + fraction;
    const fade = Math.max(0, 1 - elapsed / 7);
    const force = fromWeapon ? 1 : 0.62;
    const dx = x - from.x, dy = y - from.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / length, ny = dx / length;
    const tint = FLOATING_WEAPON_ART.arc_gun.tint;
    // A short contact burst stays at the cast point. The remaining arc burns away toward the hit.
    const start = fromWeapon ? 0.9 * Math.max(0, elapsed - 1) / 6 : 0;
    const boost = hit.sourceCast?.effectBoost ?? 0;
    const amplitude = Math.min(length / 8, 4.4 + boost * 1.6) * force;
    const trace = (side = 1) => {
        for (let i = 0; i < 6; i++) {
            const t = start + (1 - start) * i / 6;
            const bend = side * Math.sin(t * 21 + elapsed * 0.6) * Math.sin(t * Math.PI) * amplitude;
            const px = from.x + dx * t + nx * bend, py = from.y + dy * t + ny * bend;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.lineTo(x, y);
        g.stroke();
    };
    g.strokeColor = new Color(...tint, Math.round(167 * fade * force * detail));
    g.lineWidth = (4.5 + boost * 1.8) * force;
    trace();
    if (hit.sourceCast?.modified) {
        g.strokeColor = new Color(181, 126, 255, Math.round(248 * fade * detail));
        g.lineWidth = 3.3;
        trace(-1.6);
    }
    g.strokeColor = new Color(234, 250, 246, Math.round(230 * fade * force * detail));
    g.lineWidth = (1.8 + boost * 0.5) * force;
    trace();

}
