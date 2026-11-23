import { Color, Graphics } from 'cc';

export const BENCH = {
    ink: new Color(20, 28, 37), paper: new Color(239, 229, 206), muted: new Color(172, 185, 192),
    yellow: new Color(250, 198, 105), shadow: new Color(6, 11, 17, 160),
    steel: new Color(34, 47, 58), edge: new Color(76, 100, 115), recess: new Color(19, 29, 39),
    weapon: { fill: new Color(35, 54, 67), accent: new Color(155, 212, 236), label: '武器' },
    attachment: { fill: new Color(32, 56, 50), accent: new Color(163, 215, 182), label: '专属配件' },
    gear: { fill: new Color(58, 46, 40), accent: new Color(236, 185, 145), label: '通用装备' },
};

export function benchPlate(g: Graphics, x: number, y: number, width: number, height: number,
    fill: Color, edge?: Color, cut = 7): void {
    const left = Math.round(x), right = Math.round(x + width);
    const bottom = Math.round(y), top = Math.round(y + height);
    const corner = Math.max(0, Math.min(Math.round(cut), Math.floor((right - left) / 2), Math.floor((top - bottom) / 2)));
    const plate = (color: Color, inset: number) => {
        const step = Math.ceil(corner / 2);
        const l = left + inset, r = right - inset, b = bottom + inset, t = top - inset;
        const inner = Math.max(0, corner - inset);
        const shortStep = Math.min(step, inner);
        g.fillColor = color;
        g.rect(l, b + inner, r - l, t - b - 2 * inner);
        if (inner > 0) {
            g.rect(l, b, r - l - inner, inner - shortStep);
            g.rect(l, b + inner - shortStep, r - l - shortStep, shortStep);
            g.rect(l + shortStep, t - inner, r - l - shortStep, shortStep);
            g.rect(l + inner, t - inner + shortStep, r - l - inner, inner - shortStep);
        }
        g.fill();
    };
    if (edge) plate(edge, 0);
    plate(fill, edge ? 1 : 0);
}

export function benchScrew(g: Graphics, x: number, y: number): void {
    g.fillColor = BENCH.recess;
    g.rect(Math.round(x) - 2, Math.round(y) - 2, 5, 5);
    g.fill();
    g.fillColor = BENCH.edge;
    g.rect(Math.round(x) - 1, Math.round(y), 3, 1);
    g.fill();
}

export function benchLock(g: Graphics, x: number, y: number, color: Color): void {
    x = Math.round(x);
    y = Math.round(y);
    g.fillColor = color;
    g.rect(x - 5, y - 5, 10, 7);
    g.rect(x - 4, y + 2, 2, 4);
    g.rect(x + 2, y + 2, 2, 4);
    g.rect(x - 2, y + 6, 4, 2);
    g.fill();
    g.fillColor = BENCH.recess;
    g.rect(x - 1, y - 3, 2, 3);
    g.fill();
}
