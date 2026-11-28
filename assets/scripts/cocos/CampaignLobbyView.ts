import { Color, Graphics } from 'cc';
import { scratchColor } from './PixelVfxEngine';

const BLACK = new Color(11, 17, 20);
const DARK_STEEL = new Color(26, 35, 35);
const STEEL_EDGE = new Color(82, 94, 88);
const GOLD_EDGE = new Color(244, 198, 110);
const GOLD = new Color(222, 161, 65);
const GOLD_DOWN = new Color(186, 125, 44);
const GOLD_SHADE = new Color(120, 74, 32);
const STEEL_TEXT = new Color(218, 220, 197);

const SCRIM_BOT = new Color(9, 17, 20, 226);
const SCRIM_TOP = new Color(11, 20, 23, 167);
const TICKET_BG = new Color(9, 16, 19, 219);

export type LobbyShortcut = 'equipment' | 'role' | 'settings';

export function drawLobbyScrim(g: Graphics, width: number, height: number, padding: number): void {
    if (padding > 0) {
        g.fillColor = SCRIM_BOT;
        g.rect(0, -padding, width, padding);
        g.fill();
        g.fillColor = SCRIM_TOP;
        g.rect(0, height, width, padding);
        g.fill();
    }
    const band = 9;
    for (let i = 0; i < 14; i++) {
        const weight = 1 - i / 14;
        g.fillColor = scratchColor(9, 17, 20, Math.round(226 * weight * weight));
        g.rect(0, i * band, width, band + 0.5);
        g.fill();
        g.fillColor = scratchColor(11, 20, 23, Math.round(167 * weight * weight));
        g.rect(0, height - (i + 1) * band, width, band + 0.5);
        g.fill();
    }
}

export function drawCreditTicket(g: Graphics, x: number, y: number): void {
    g.fillColor = TICKET_BG;
    g.roundRect(x - 15, y - 15, 116, 30, 6);
    g.fill();
    g.fillColor = GOLD_EDGE;
    g.moveTo(x - 7, y + 6);
    g.lineTo(x + 4, y + 6);
    g.lineTo(x + 8, y + 2);
    g.lineTo(x + 8, y - 6);
    g.lineTo(x - 7, y - 6);
    g.close();
    g.fill();
    g.strokeColor = GOLD_SHADE;
    g.lineWidth = 1;
    g.moveTo(x - 4, y + 1);
    g.lineTo(x + 4, y + 1);
    g.moveTo(x - 4, y - 2);
    g.lineTo(x + 1, y - 2);
    g.stroke();
}

export function drawDispatchHandle(g: Graphics, x: number, y: number, held: boolean): void {
    const left = x - 87;
    const right = x + 87;
    const plate = (inset: number, shift: number, fill: Color): void => {
        g.fillColor = fill;
        g.moveTo(left + 8 + inset, y + 27 - inset + shift);
        g.lineTo(right - inset, y + 27 - inset + shift);
        g.lineTo(right - 11 - inset, y - 15 + inset + shift);
        g.lineTo(right - 23 - inset, y - 26 + inset + shift);
        g.lineTo(left + inset, y - 26 + inset + shift);
        g.close();
        g.fill();
    };
    const depth = held ? -3 : 0;
    plate(0, -5, BLACK);
    plate(0, depth, GOLD_SHADE);
    plate(2, depth, held ? GOLD_DOWN : GOLD);
    g.strokeColor = held ? GOLD_SHADE : GOLD_EDGE;
    g.lineWidth = 1;
    g.moveTo(left + 13, y + 20 + depth);
    g.lineTo(right - 10, y + 20 + depth);
    g.moveTo(left + 9, y - 19 + depth);
    g.lineTo(right - 26, y - 19 + depth);
    g.stroke();

}

export function drawLobbyDial(g: Graphics, x: number, y: number, icon: LobbyShortcut, held: boolean, glyph = true): void {
    const radius = icon === 'settings' ? 9 : 20;
    const faceY = y - (held ? 2 : 0);
    g.fillColor = BLACK;
    g.circle(x, y - 2, radius + 3);
    g.fill();
    g.fillColor = held ? STEEL_EDGE : DARK_STEEL;
    g.circle(x, faceY, radius);
    g.fill();
    g.strokeColor = STEEL_EDGE;
    g.lineWidth = 1.2;
    g.arc(x, faceY, radius - 1.5, 0.12, Math.PI - 0.12, false);
    g.stroke();
    if (!glyph) return;
    g.strokeColor = STEEL_TEXT;
    g.lineWidth = 1.8;
    if (icon === 'equipment') {
        g.roundRect(x - 11, faceY - 7, 22, 14, 2);
        g.moveTo(x - 5, faceY + 7);
        g.lineTo(x - 5, faceY + 11);
        g.lineTo(x + 5, faceY + 11);
        g.lineTo(x + 5, faceY + 7);
        g.moveTo(x - 11, faceY + 1);
        g.lineTo(x + 11, faceY + 1);
    } else if (icon === 'role') {
        g.arc(x, faceY - 2, 9, 0, Math.PI, false);
        g.moveTo(x - 11, faceY - 2);
        g.lineTo(x + 11, faceY - 2);
        g.moveTo(x - 4, faceY - 6);
        g.quadraticCurveTo(x, faceY - 12, x + 4, faceY - 6);
    } else {
        g.moveTo(x - 7, faceY + 3);
        g.lineTo(x + 7, faceY + 3);
        g.moveTo(x - 7, faceY - 3);
        g.lineTo(x + 7, faceY - 3);
        g.moveTo(x - 2, faceY + 6);
        g.lineTo(x - 2, faceY);
        g.moveTo(x + 2, faceY);
        g.lineTo(x + 2, faceY - 6);
    }
    g.stroke();
}
