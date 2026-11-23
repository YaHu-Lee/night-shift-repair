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

// The graphics node's local space is battle space. Its parent clips to the playfield.
export function drawSkillEffects(g: Graphics, effects: readonly Attack[], modelEffects = false,
    weaponOrigin?: (cast: WeaponCast) => { x: number; y: number } | undefined, floatingTick?: number,
    casts: readonly WeaponCast[] = []): void {
    g.clear();
    if (floatingTick !== undefined) {
        for (const cast of casts) drawSweepTrail(g, cast, floatingTick - cast.tick);
    }
    for (const effect of effects) {
        const { x, y, life } = effect;
        const color = colors[effect.kind][life];
        const art = floatingTick !== undefined && effect.sourceCast ? FLOATING_WEAPON_ART[effect.sourceCast.tool] : undefined;
        const fraction = floatingTick === undefined ? 0 : floatingTick % 1;
        g.strokeColor = color.edge;
        g.fillColor = color.wash;
        g.lineWidth = 1;
        switch (effect.shape) {
            case 'circle': {
                const { radius } = effect;
                if (art?.effect === 'coil' || art?.effect === 'pull') {
                    const age = 1 - (life - fraction) / 12;
                    g.strokeColor = new Color(...art.tint, Math.round(130 * (1 - age)));
                    g.circle(x, y, radius);
                    g.stroke();
                    g.lineWidth = 2;
                    const sweep = art.effect === 'coil' ? age : 1 - age;
                    for (let ring = 0; ring < 2; ring++) {
                        const r = Math.max(2, radius * (sweep - ring * 0.22));
                        for (let i = 0; i < 4; i++) {
                            const start = i * Math.PI / 2 + age * (art.effect === 'pull' ? -0.8 : 0.45);
                            g.arc(x, y, r, start, start + (ring ? 0.7 : 1.12), true);
                            g.stroke();
                        }
                    }
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
                    const t = 1 - (life - fraction) / 8;
                    g.strokeColor = new Color(...art.tint, Math.round(210 * (1 - t)));
                    g.lineWidth = art.effect === 'pulse' ? 2.5 : 2;
                    if (art.effect === 'pulse') {
                        for (let ring = 0; ring < 2; ring++) {
                            const r = effect.radius * Math.max(0.1, t - ring * 0.16);
                            g.arc(x, y, r, angle - half, angle + half, true);
                            g.stroke();
                        }
                    } else {
                        for (let i = -2; i <= 2; i++) {
                            const dir = angle + i * half * 0.37;
                            const radius = effect.radius * Math.min(1, t + 0.26 - Math.abs(i) * 0.06);
                            const flare = radius * (0.12 + (i + 2) * 0.012);
                            g.moveTo(x + Math.cos(dir) * radius * 0.19, y + Math.sin(dir) * radius * 0.19);
                            g.lineTo(x + Math.cos(dir + 0.12) * radius * 0.64, y + Math.sin(dir + 0.12) * radius * 0.64);
                            g.lineTo(x + Math.cos(dir) * radius, y + Math.sin(dir) * radius);
                            g.lineWidth = Math.max(1, flare * (1 - t));
                            g.stroke();
                        }
                    }
                    break;
                }
                g.arc(x, y, effect.radius, angle - half, angle + half, true);
                g.lineTo(x, y);
                g.close();
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
                const { ux, uy, length, halfWidth: width } = effect;
                if (art?.effect === 'rivet' || art?.effect === 'nail' || art?.effect === 'fork') {
                    const t = 1 - (life - fraction) / 8;
                    const nail = art.effect === 'nail';
                    const head = length * Math.min(1, 0.24 + t * 1.7);
                    const tail = Math.max(0, head - (nail ? 48 : art.effect === 'fork' ? 32 : 22));
                    g.strokeColor = new Color(...art.tint, Math.round(240 * (1 - t)));
                    g.lineWidth = nail ? 3.8 : 1.6;
                    g.moveTo(x + ux * tail, y + uy * tail);
                    g.lineTo(x + ux * head, y + uy * head);
                    g.stroke();
                    if (nail && tail + 8 < head) {
                        g.strokeColor = new Color(253, 245, 207, Math.round(245 * (1 - t)));
                        g.lineWidth = 1;
                        g.moveTo(x + ux * (tail + 8), y + uy * (tail + 8));
                        g.lineTo(x + ux * head, y + uy * head);
                        g.stroke();
                    }
                    break;
                }
                const ox = -uy * width, oy = ux * width;
                const ex = x + ux * length, ey = y + uy * length;
                g.moveTo(x + ox, y + oy);
                g.lineTo(ex + ox, ey + oy);
                g.lineTo(ex - ox, ey - oy);
                g.lineTo(x - ox, y - oy);
                g.close();
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
                if (modelEffects) {
                    g.circle(x, y, 1.6);
                    g.fill();
                    break;
                }
                if (effect.sourceCast?.melee && art) {
                    drawMeleeSparks(g, effect, art.tint, fraction);
                    break;
                }
                const from = (effect.fromWeapon && effect.sourceCast && weaponOrigin?.(effect.sourceCast)) || effect.from;
                if (art?.effect === 'arc') {
                    drawFloatingArc(g, from, effect, fraction);
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
                    g.strokeColor = new Color(...art.tint, Math.round(200 * t));
                    g.lineWidth = 1.3;
                    g.moveTo(x, y);
                    g.lineTo(px + (x - px) * (1 - t), py + (y - py) * (1 - t));
                    g.stroke();
                }
                if (art) {
                    drawPixelImpact(g, x, y, art.tint, 1 - (life - fraction) / 7);
                    break;
                }
                g.fillColor = color.edge;
                g.circle(x, y, modelEffects ? 1.6 : 1.4 + life * 0.32);
                g.fill();
                break;
            }
        }
    }
}

function drawPixelImpact(g: Graphics, x: number, y: number, tint: readonly [number, number, number], t: number): void {
    const radius = 2 + t * 5;
    g.fillColor = new Color(...tint, Math.round(220 * (1 - t)));
    for (let i = 0; i < 4; i++) {
        const angle = (i + 0.5) * Math.PI / 2;
        g.rect(Math.round(x + Math.cos(angle) * radius), Math.round(y + Math.sin(angle) * radius), 2, 2);
    }
    g.rect(Math.round(x) - 1, Math.round(y) - 1, 3, 3);
    g.fill();
}

function drawSweepTrail(g: Graphics, cast: WeaponCast, age: number): void {
    const { melee } = cast;
    if (!melee || age < melee.first || age > melee.last + 3) return;
    const end = Math.min(age, melee.last);
    const start = Math.max(melee.first, age - 3);
    if (start >= end) return;
    const { tint } = FLOATING_WEAPON_ART[cast.tool];
    for (let cursor = start; cursor < end;) {
        const next = Math.min(Math.floor(cursor) + 1, end);
        const a = sampleMeleeHead(melee, cursor), b = sampleMeleeHead(melee, next);
        const strength = Math.max(0, 1 - (age - (cursor + next) * 0.5) / 3);
        g.strokeColor = new Color(...tint, Math.round(105 * strength));
        g.lineWidth = (melee.radius * 0.72) * strength + 0.8;
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        g.strokeColor = new Color(255, 241, 198, Math.round(215 * strength));
        g.lineWidth = 1.1;
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
        g.stroke();
        cursor = next;
    }
}

function drawMeleeSparks(g: Graphics, hit: Extract<Attack, { shape: 'link' }>,
    tint: readonly [number, number, number], fraction: number): void {
    const { x, y, from, life } = hit;
    const t = 1 - (life - fraction) / 7;
    const direction = Math.atan2(y - from.y, x - from.x);
    g.fillColor = new Color(...tint, Math.round(235 * (1 - t)));
    for (let i = -2; i <= 2; i++) {
        const dir = direction + i * 0.54, travel = 3 + t * (8 - Math.abs(i));
        const dx = Math.cos(dir) * travel, dy = Math.sin(dir) * travel;
        g.rect(Math.round(from.x + dx), Math.round(from.y + dy), 2, 2);
        g.rect(Math.round(from.x + dx * 0.5), Math.round(from.y + dy * 0.5), 1, 1);
    }
    g.fill();
}

function drawFloatingArc(g: Graphics, from: { x: number; y: number },
    hit: Extract<Attack, { shape: 'link' }>, fraction: number): void {
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
    const amplitude = Math.min(length / 8, 2.8) * force;
    const trace = () => {
        for (let i = 0; i < 6; i++) {
            const t = start + (1 - start) * i / 6;
            const bend = Math.sin(t * 21 + elapsed * 0.6) * Math.sin(t * Math.PI) * amplitude;
            const px = from.x + dx * t + nx * bend, py = from.y + dy * t + ny * bend;
            if (i === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
        }
        g.lineTo(x, y);
        g.stroke();
    };
    g.strokeColor = new Color(...tint, Math.round(105 * fade * force));
    g.lineWidth = 3 * force;
    trace();
    g.strokeColor = new Color(234, 250, 246, Math.round(230 * fade * force));
    g.lineWidth = 1.1 * force;
    trace();

    if (fromWeapon && elapsed < 4) {
        const radius = 2 + elapsed * 1.35;
        const alpha = Math.round(200 * (1 - elapsed / 4));
        g.strokeColor = new Color(...tint, alpha);
        g.lineWidth = 1;
        g.circle(x, y, radius);
        g.stroke();
    }
}
