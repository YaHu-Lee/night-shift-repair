import type { RogueliteBattle } from './battle';
import { WEAPON_CATALOG } from './catalog';

export function steerPatrol(battle: RogueliteBattle): [number, number] {
    const p = battle.player;
    const b = battle.field;
    if (battle.chapter.id === '04' && battle.boss) {
        const switchPad = battle.bossView?.devices?.filter(d => d.kind === 'switch' && d.active)
            .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
        const target = switchPad ?? (battle.boss.state === 'open' ? battle.boss : undefined);
        if (target) {
            const dx = target.x - p.x, dy = target.y - p.y, distance = Math.hypot(dx, dy);
            if (distance > (switchPad ? 12 : 48)) return [dx / distance, dy / distance];
            return [0, 0];
        }
    }
    // Dodge active boss hazards first, then kite threats while sweeping nearby parts/heals.
    let vx = 0, vy = 0;

    // 1. Repel from bullets and close enemies
    for (const bullet of battle.bullets) {
        const dx = p.x - bullet.x, dy = p.y - bullet.y;
        const d = Math.hypot(dx, dy);
        if (d < 70 && d > 0.1) {
            const w = (70 - d) / 70 * 3.2;
            vx += (dx / d) * w; vy += (dy / d) * w;
        }
    }
    for (const e of battle.enemies) {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const dangerRadius = e.kind === 'jammer' && e.state === 'dash' ? 92
            : e.kind === 'boss' ? 115 : e.state === 'warn' || e.state === 'dash' ? 105 : 68;
        if (d < dangerRadius) {
            const w = ((dangerRadius - d) / dangerRadius) * (e.kind === 'jammer' ? 3.5 : e.kind === 'boss' ? 3.2 : 2.1);
            vx += (dx / d) * w; vy += (dy / d) * w;
        }
        // Dodge Boss rect/sector/tether hazard
        if (e.kind === 'boss' && e.bossHazard) {
            const h = e.bossHazard;
            if (h.shape === 'rect') {
                const horiz = (h.right - h.left) > (h.top - h.bottom);
                if (horiz && p.y > h.bottom - 18 && p.y < h.top + 18) vy += p.y >= (h.bottom + h.top) / 2 ? 6 : -6;
                if (!horiz && p.x > h.left - 18 && p.x < h.right + 18) vx += p.x >= (h.left + h.right) / 2 ? 6 : -6;
            } else if (h.shape === 'tether') {
                const tx = h.end.x - h.x, ty = h.end.y - h.y;
                const tl = Math.hypot(tx, ty) || 1;
                vx += (-ty / tl) * 5; vy += (tx / tl) * 5;
            }
        }
    }

    // 2. Pull toward nearby heals (high priority when injured) and parts (when safe)
    const needHeal = p.hp < p.maxHp * 0.72;
    let bestDrop = null, bestScore = -Infinity;
    for (const d of battle.drops) {
        const dist = Math.hypot(d.x - p.x, d.y - p.y);
        if (dist > 170) continue;
        const score = (d.kind === 'heal' ? (needHeal ? 220 : 40) : 55) - dist;
        if (score > bestScore) { bestScore = score; bestDrop = d; }
    }
    if (bestDrop) {
        const dx = bestDrop.x - p.x, dy = bestDrop.y - p.y, d = Math.hypot(dx, dy) || 1;
        vx += (dx / d) * (bestDrop.kind === 'heal' && needHeal ? 2.6 : 1.15);
        vy += (dy / d) * (bestDrop.kind === 'heal' && needHeal ? 2.6 : 1.15);
    }

    // 3. Soft center pull to stay away from corners + slight orbit around nearest threat for melee contact
    const cx = (b.left + b.right) / 2, cy = (b.bottom + b.top) / 2;
    vx += (cx - p.x) * 0.004;
    vy += (cy - p.y) * 0.004;
    if (battle.enemies.length) {
        let nearest = battle.enemies[0], minD = Infinity;
        for (const e of battle.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < minD) { minD = d; nearest = e; }
        }
        const avgReach = battle.runtimes.reduce((s, r) => s + WEAPON_CATALOG[r.instance.id].tiers[r.instance.tier - 1].reach, 0) / battle.runtimes.length;
        const preferred = Math.min(115, Math.max(52, avgReach * 0.78));
        if (minD > preferred + 14) {
            vx += ((nearest.x - p.x) / (minD || 1)) * 1.1;
            vy += ((nearest.y - p.y) / (minD || 1)) * 1.1;
        }
    }
    const len = Math.hypot(vx, vy);
    return len > 0.05 ? [vx / len, vy / len] : [0, 0];
}

/** Internal movement trial. Uses ordinary stick inputs and only reacts to the current wave. */
export class PatrolAutoMovement {
    private battle?: RogueliteBattle;
    private nextDecision = 0;
    private direction: [number, number] = [0, 0];

    sample(battle: RogueliteBattle): readonly [number, number] {
        if (battle !== this.battle || battle.tick >= this.nextDecision) {
            this.battle = battle;
            this.nextDecision = battle.tick + 18;
            const [x, y] = steerPatrol(battle);
            this.direction = [x * 0.64, y * 0.64];
        }
        return this.direction;
    }
}
