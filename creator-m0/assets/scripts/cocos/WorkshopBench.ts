import { Color, Graphics } from 'cc';

export const BENCH = {
    ink: new Color(24, 30, 29), paper: new Color(234, 227, 207), muted: new Color(183, 181, 168),
    yellow: new Color(244, 198, 107), shadow: new Color(7, 11, 10, 150),
    steel: new Color(38, 44, 42), edge: new Color(91, 99, 92), recess: new Color(22, 29, 27),
    weapon: { fill: new Color(34, 53, 61), accent: new Color(164, 206, 223), label: '武器' },
    attachment: { fill: new Color(41, 60, 50), accent: new Color(169, 211, 179), label: '专属配件' },
    gear: { fill: new Color(61, 49, 39), accent: new Color(232, 183, 147), label: '通用装备' },
};

export function benchPlate(g: Graphics, x: number, y: number, width: number, height: number,
    fill: Color, edge?: Color, cut = 7): void {
    const outline = () => {
        g.moveTo(x + cut, y + height);
        g.lineTo(x + width, y + height);
        g.lineTo(x + width, y + cut);
        g.lineTo(x + width - cut, y);
        g.lineTo(x, y);
        g.lineTo(x, y + height - cut);
        g.close();
    };
    g.fillColor = fill;
    outline(); g.fill();
    if (edge) {
        g.strokeColor = edge;
        g.lineWidth = 1;
        outline(); g.stroke();
    }
}

export function benchScrew(g: Graphics, x: number, y: number): void {
    g.fillColor = BENCH.recess;
    g.circle(x, y, 2.5); g.fill();
    g.strokeColor = BENCH.edge;
    g.lineWidth = 1;
    g.moveTo(x - 1.3, y - 1.3); g.lineTo(x + 1.3, y + 1.3); g.stroke();
}

export function benchLock(g: Graphics, x: number, y: number, color: Color): void {
    g.strokeColor = color;
    g.lineWidth = 1.4;
    g.roundRect(x - 5, y - 5, 10, 8, 1);
    g.moveTo(x - 3, y + 3); g.lineTo(x - 3, y + 5);
    g.quadraticCurveTo(x, y + 10, x + 3, y + 5); g.lineTo(x + 3, y + 3);
    g.stroke();
}
