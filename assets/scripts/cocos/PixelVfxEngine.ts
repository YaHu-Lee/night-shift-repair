import { Color, Graphics } from 'cc';
import type { ToolId } from '../roguelite/types';

export type RGB = readonly [number, number, number];

// Snap coordinates to a clean 2px pixel grid so procedural VFX match the pixel art aesthetic.
export function snap2(v: number): number {
    return Math.round(v * 0.5) * 2;
}

export function pxRect(g: Graphics, x: number, y: number, w: number, h: number): void {
    g.rect(snap2(x), snap2(y), Math.max(2, snap2(w)), Math.max(2, snap2(h)));
}

/** Draw a pure pixel-stepped line made of discrete square blocks (zero anti-aliased diagonal strokes). */
export function pxLine(g: Graphics, x0: number, y0: number, x1: number, y1: number, block = 2, step?: number): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dist = Math.hypot(dx, dy);
    const stride = step ?? block;
    const count = Math.max(1, Math.ceil(dist / Math.max(1, stride)));
    const half = block * 0.5;
    for (let i = 0; i <= count; i++) {
        const t = i / count;
        g.rect(snap2(x0 + dx * t - half), snap2(y0 + dy * t - half), block, block);
    }
}

/** Draw a jagged pixel ring made of discrete 2x2 / 4x4 blocks (replaces smooth g.circle). */
export function pxRing(
    g: Graphics,
    cx: number,
    cy: number,
    radius: number,
    block = 2,
    fromAngle = 0,
    sweepAngle = Math.PI * 2,
    pitch = 4,
    dashSkip = 0,
): void {
    if (radius <= 1) return;
    const arcLen = Math.abs(radius * sweepAngle);
    const steps = Math.max(6, Math.ceil(arcLen / Math.max(2, pitch)));
    const half = block * 0.5;
    for (let i = 0; i <= steps; i++) {
        if (dashSkip > 0 && i % dashSkip === 0) continue;
        const a = fromAngle + (sweepAngle * i) / steps;
        g.rect(snap2(cx + Math.cos(a) * radius - half), snap2(cy + Math.sin(a) * radius - half), block, block);
    }
}

/** Classic 4-way pixel starburst flash (white core + colored outer spikes). */
export function pxStarFlash(g: Graphics, x: number, y: number, radius: number, rim: RGB, alpha: number): void {
    const cx = snap2(x);
    const cy = snap2(y);
    const r = Math.max(4, snap2(radius));
    g.fillColor = new Color(rim[0], rim[1], rim[2], Math.round(alpha));
    g.rect(cx - r, cy - 2, r * 2, 4);
    g.rect(cx - 2, cy - r, 4, r * 2);
    g.fill();
    const inner = Math.max(2, snap2(r * 0.55));
    g.fillColor = new Color(255, 252, 232, Math.round(alpha));
    g.rect(cx - inner, cy - 1, inner * 2, 2);
    g.rect(cx - 1, cy - inner, 2, inner * 2);
    g.rect(cx - 2, cy - 2, 4, 4);
    g.fill();
}

interface GroundDecal {
    readonly kind: 'oil' | 'scorch' | 'scrap' | 'shell';
    x: number;
    y: number;
    vx: number;
    vy: number;
    z: number;
    vz: number;
    size: number;
    color: RGB;
    settled: boolean;
}

interface PixelParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    gravity: number;
    age: number;
    life: number;
    size: number;
    color: RGB;
    kind: 'spark' | 'smoke' | 'heal' | 'shrapnel';
}

const MAX_DECALS = 96;
const MAX_PARTICLES = 96;

/**
 * Pixel-art Game Feel & Permanence Engine:
 * - Hierarchical non-stacking pixel-snapped micro screenshake
 * - Restrained hitstop (only on elite/boss kills & heavy crits/hits, never on routine mob hits)
 * - Persistent low-contrast floor decals (oil stains, scorch marks, debris, bouncing brass shell casings)
 * - Strictly 2px grid-snapped pixel spark / shrapnel / smoke / heal particles
 */
export class PixelJuiceEngine {
    private readonly decals: GroundDecal[] = [];
    private readonly particles: PixelParticle[] = [];
    private shakeAmp = 0;
    private shakeDuration = 0;
    private shakeElapsed = 0;
    private shakePriority = 0;
    private hitstopLeft = 0;
    private hitstopCooldown = 0;
    private rng = 0x51a7c3;
    private time = 0;

    private nextRand(): number {
        this.rng = (Math.imul(this.rng, 1664525) + 1013904223) >>> 0;
        return this.rng / 4294967296;
    }

    reset(): void {
        this.decals.length = 0;
        this.particles.length = 0;
        this.shakeAmp = 0;
        this.shakeDuration = 0;
        this.shakeElapsed = 0;
        this.shakePriority = 0;
        this.hitstopLeft = 0;
        this.hitstopCooldown = 0;
    }

    /** Trigger non-stacking tiered camera shake (priority 1=crit, 2=player hit, 3=boss/elite kill). */
    triggerShake(amplitude: number, durationSec: number, priority: 1 | 2 | 3): void {
        if (this.shakeElapsed < this.shakeDuration && priority < this.shakePriority) return;
        this.shakeAmp = amplitude;
        this.shakeDuration = durationSec;
        this.shakeElapsed = 0;
        this.shakePriority = priority;
    }

    /** Restrained hitstop with global cooldown so horde clears never stutter. */
    triggerHitstop(seconds: number, force = false): void {
        if (!force && this.hitstopCooldown > 0) return;
        this.hitstopLeft = Math.max(this.hitstopLeft, seconds);
        this.hitstopCooldown = force ? 0.35 : 0.48;
    }

    /** Returns effective dt for simulation (0 during hitstop freeze, while VFX & shake still animate). */
    step(dt: number): number {
        this.time += dt;
        if (this.hitstopCooldown > 0) this.hitstopCooldown = Math.max(0, this.hitstopCooldown - dt);
        if (this.shakeElapsed < this.shakeDuration) this.shakeElapsed += dt;

        // Advance bouncing shell casings & flying debris until they settle onto the floor
        for (let i = 0; i < this.decals.length; i++) {
            const d = this.decals[i];
            if (d.settled) continue;
            d.x += d.vx * dt;
            d.y += d.vy * dt;
            d.z += d.vz * dt;
            d.vz -= 240 * dt;
            if (d.z <= 0) {
                d.z = 0;
                if (Math.abs(d.vz) > 26) {
                    d.vz = -d.vz * 0.42;
                    d.vx *= 0.55;
                    d.vy *= 0.55;
                } else {
                    d.settled = true;
                    d.vx = d.vy = d.vz = 0;
                }
            }
        }

        // Advance pixel particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.age += dt;
            if (p.age >= p.life) {
                this.particles.splice(i, 1);
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy -= p.gravity * dt;
        }

        if (this.hitstopLeft > 0) {
            this.hitstopLeft = Math.max(0, this.hitstopLeft - dt);
            return 0;
        }
        return dt;
    }

    getShakeOffset(): { readonly x: number; readonly y: number } {
        if (this.shakeElapsed >= this.shakeDuration || this.shakeAmp <= 0) return { x: 0, y: 0 };
        const decay = 1 - this.shakeElapsed / this.shakeDuration;
        const mag = this.shakeAmp * decay * decay;
        const angle = this.time * 97.3;
        return {
            x: Math.round(Math.cos(angle) * mag),
            y: Math.round(Math.sin(angle * 1.37) * mag),
        };
    }

    /** Eject a bouncing pixel brass casing or spent fuse when ranged guns fire. */
    ejectShell(x: number, y: number, aimX: number, aimY: number, tool: ToolId): void {
        if (tool !== 'riveter' && tool !== 'hydraulic_nailer' && tool !== 'arc_gun' && tool !== 'split_probe') return;
        const side = this.nextRand() < 0.5 ? 1 : -1;
        const speed = 34 + this.nextRand() * 26;
        const color: RGB = tool === 'arc_gun' || tool === 'split_probe' ? [120, 200, 224] : [224, 174, 84];
        this.pushDecal({
            kind: 'shell',
            x,
            y,
            vx: (-aimY * side - aimX * 0.3) * speed,
            vy: (aimX * side - aimY * 0.3) * speed,
            z: 8,
            vz: 48 + this.nextRand() * 28,
            size: tool === 'hydraulic_nailer' ? 4 : 2,
            color,
            settled: false,
        });
    }

    /** Emit crisp pixel sparks on hit or crit. */
    spawnHitSparks(x: number, y: number, dirX: number, dirY: number, color: RGB, isCrit: boolean): void {
        const count = isCrit ? 7 : 3;
        for (let i = 0; i < count; i++) {
            const spread = (this.nextRand() - 0.5) * (isCrit ? 2.4 : 1.5);
            const baseAngle = Math.atan2(dirY, dirX) + spread;
            const speed = (isCrit ? 85 : 55) + this.nextRand() * 60;
            this.pushParticle({
                x,
                y,
                vx: Math.cos(baseAngle) * speed,
                vy: Math.sin(baseAngle) * speed,
                gravity: 65,
                age: 0,
                life: isCrit ? 0.28 : 0.18,
                size: isCrit && i < 2 ? 4 : 2,
                color: i === 0 ? [255, 250, 222] : color,
                kind: 'spark',
            });
        }
        if (isCrit) {
            this.triggerShake(1.6, 0.075, 1);
            this.triggerHitstop(0.032, false);
        }
    }

    /** Leave permanent low-contrast industrial oil/scorch/scrap debris on enemy destruction. */
    spawnEnemyBreak(x: number, y: number, isBossOrElite: boolean, fiery: boolean): void {
        // Low-contrast floor stain (sits quietly in background value band 10-20, never competes with bullets!)
        this.pushDecal({
            kind: fiery ? 'scorch' : 'oil',
            x: snap2(x),
            y: snap2(y),
            vx: 0,
            vy: 0,
            z: 0,
            vz: 0,
            size: isBossOrElite ? 16 : 8,
            color: fiery ? [22, 20, 24] : [18, 25, 31],
            settled: true,
        });
        // Settling scrap shrapnel
        const pieces = isBossOrElite ? 6 : 2;
        for (let i = 0; i < pieces; i++) {
            const a = this.nextRand() * Math.PI * 2;
            const spd = (isBossOrElite ? 68 : 42) + this.nextRand() * 35;
            this.pushDecal({
                kind: 'scrap',
                x,
                y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                z: 6,
                vz: 55 + this.nextRand() * 45,
                size: isBossOrElite ? 4 : 2,
                color: i % 2 ? [102, 114, 122] : [150, 110, 72],
                settled: false,
            });
        }
        // Bright explosive burst particles
        const burst = isBossOrElite ? 16 : 5;
        for (let i = 0; i < burst; i++) {
            const a = (i / burst) * Math.PI * 2 + this.nextRand() * 0.4;
            const spd = (isBossOrElite ? 115 : 65) + this.nextRand() * 55;
            this.pushParticle({
                x,
                y,
                vx: Math.cos(a) * spd,
                vy: Math.sin(a) * spd,
                gravity: 40,
                age: 0,
                life: isBossOrElite ? 0.42 : 0.24,
                size: isBossOrElite && i % 3 === 0 ? 4 : 2,
                color: i % 3 === 0 ? [255, 246, 205] : i % 3 === 1 ? [255, 164, 72] : [132, 148, 158],
                kind: i % 4 === 0 ? 'smoke' : 'shrapnel',
            });
        }
        if (isBossOrElite) {
            this.triggerShake(5.0, 0.24, 3);
            this.triggerHitstop(0.11, true);
        }
    }

    spawnPlayerHit(x: number, y: number): void {
        this.triggerShake(3.6, 0.14, 2);
        this.triggerHitstop(0.036, false);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + this.nextRand() * 0.3;
            this.pushParticle({
                x,
                y,
                vx: Math.cos(a) * 75,
                vy: Math.sin(a) * 75,
                gravity: 20,
                age: 0,
                life: 0.22,
                size: 2,
                color: i % 2 ? [255, 110, 96] : [255, 244, 214],
                kind: 'spark',
            });
        }
    }

    spawnHealBurst(x: number, y: number): void {
        for (let i = 0; i < 5; i++) {
            this.pushParticle({
                x: x + (this.nextRand() - 0.5) * 16,
                y: y + (this.nextRand() - 0.5) * 8,
                vx: (this.nextRand() - 0.5) * 18,
                vy: 26 + this.nextRand() * 24,
                gravity: -10,
                age: 0,
                life: 0.45,
                size: 2,
                color: [108, 242, 162],
                kind: 'heal',
            });
        }
    }

    /** Draw persistent low-contrast oil stains, scorch marks, scrap & shell casings on the ground layer. */
    drawGroundDecals(g: Graphics): void {
        for (let i = 0; i < this.decals.length; i++) {
            const d = this.decals[i];
            const sx = snap2(d.x);
            const sy = snap2(d.y + d.z);
            if (d.kind === 'oil' || d.kind === 'scorch') {
                g.fillColor = new Color(d.color[0], d.color[1], d.color[2], 148);
                const r = d.size;
                g.rect(sx - r, sy - Math.floor(r * 0.5), r * 2, r);
                g.rect(sx - Math.floor(r * 0.6), sy - Math.floor(r * 0.75), Math.floor(r * 1.2), Math.floor(r * 1.5));
                g.fill();
            } else if (d.kind === 'shell') {
                g.fillColor = new Color(d.color[0], d.color[1], d.color[2], d.settled ? 155 : 235);
                g.rect(sx, sy, d.size, 2);
                g.fill();
            } else {
                g.fillColor = new Color(d.color[0], d.color[1], d.color[2], d.settled ? 132 : 225);
                g.rect(sx, sy, d.size, d.size);
                g.fill();
            }
        }
    }

    /** Draw transient 2px pixel particles (sparks, shrapnel, rising heal crosses). */
    drawParticles(g: Graphics): void {
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const t = p.age / p.life;
            const alpha = Math.round(255 * (1 - t * t));
            if (alpha <= 12) continue;
            const sx = snap2(p.x);
            const sy = snap2(p.y);
            g.fillColor = new Color(p.color[0], p.color[1], p.color[2], alpha);
            if (p.kind === 'heal') {
                g.rect(sx - 2, sy, 6, 2);
                g.rect(sx, sy - 2, 2, 6);
            } else {
                g.rect(sx, sy, p.size, p.size);
            }
            g.fill();
        }
    }

    private pushDecal(d: GroundDecal): void {
        if (this.decals.length >= MAX_DECALS) this.decals.shift();
        this.decals.push(d);
    }

    private pushParticle(p: PixelParticle): void {
        if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
        this.particles.push(p);
    }
}
