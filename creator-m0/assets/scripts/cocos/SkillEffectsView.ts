import { Color, Graphics } from 'cc';
import type { Attack } from '../m1/Battle';

function ink(r: number, g: number, b: number) {
    return Array.from({ length: 13 }, (_, life) => ({
        edge: new Color(r, g, b, Math.min(225, 25 + life * 30)),
        wash: new Color(r, g, b, Math.min(48, 6 + life * 7)),
    }));
}

const colors = { arc: ink(122, 218, 255), shot: ink(255, 203, 121), heat: ink(255, 139, 63),
    magnet: ink(98, 238, 197), induction: ink(205, 151, 255) };

// The graphics node's local space is battle space. Its parent clips to the playfield.
export function drawSkillEffects(g: Graphics, effects: readonly Attack[]): void {
    g.clear();
    for (const effect of effects) {
        const { x, y, life } = effect;
        const color = colors[effect.kind][life];
        g.strokeColor = color.edge;
        g.fillColor = color.wash;
        g.lineWidth = 1;
        switch (effect.shape) {
            case 'circle': {
                const { radius } = effect;
                g.circle(x, y, radius);
                g.fill();
                g.stroke();
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
                g.arc(x, y, effect.radius, angle - half, angle + half, true);
                g.lineTo(x, y);
                g.close();
                g.fill();
                g.stroke();
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
                const ox = -uy * width, oy = ux * width;
                const ex = x + ux * length, ey = y + uy * length;
                g.moveTo(x + ox, y + oy);
                g.lineTo(ex + ox, ey + oy);
                g.lineTo(ex - ox, ey - oy);
                g.lineTo(x - ox, y - oy);
                g.close();
                g.fill();
                g.stroke();
                const head = length * (1 - life / 8);
                const tail = Math.max(0, head - 22);
                g.lineWidth = 2;
                g.moveTo(x + ux * tail, y + uy * tail);
                g.lineTo(x + ux * head, y + uy * head);
                g.stroke();
                break;
            }
            case 'link': {
                const dx = x - effect.from.x, dy = y - effect.from.y;
                const offset = (life % 2 ? 1 : -1) / Math.max(11, Math.hypot(dx, dy));
                g.lineWidth = 1.7;
                g.moveTo(effect.from.x, effect.from.y);
                g.lineTo(effect.from.x + dx * 0.38 - dy * offset * 2, effect.from.y + dy * 0.38 + dx * offset * 2);
                g.lineTo(x - dx * 0.38 + dy * offset * 2, y - dy * 0.38 - dx * offset * 2);
                g.lineTo(x, y);
                g.stroke();
                // Fall through to mark the endpoint of each successful hop.
            }
            case 'impact':
                g.fillColor = color.edge;
                g.circle(x, y, 1.4 + life * 0.32);
                g.fill();
                break;
        }
    }
}
