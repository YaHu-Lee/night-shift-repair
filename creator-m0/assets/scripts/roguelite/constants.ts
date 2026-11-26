import type { CombatBounds, Position } from './types';

export const TICK_RATE = 30;
export const IMPACT_TICKS = 18;
export const FIELD: CombatBounds = { left: 15, right: 345, bottom: 153, top: 553 };
export const START: Readonly<Position> = { x: 180, y: 353 };
export const CAMPAIGN_FIELD: CombatBounds = { left: -150, right: 510, bottom: 28, top: 678 };
export const COMBAT_VIEWPORT = { width: FIELD.right - FIELD.left, height: FIELD.top - FIELD.bottom } as const;
export const BASE_PICKUP_RADIUS = 21;

export function combatViewport(field: CombatBounds, x: number, y: number, overscan = 0): CombatBounds {
    const width = Math.min(COMBAT_VIEWPORT.width, field.right - field.left);
    const height = Math.min(COMBAT_VIEWPORT.height, field.top - field.bottom);
    const left = Math.min(field.right - width + overscan, Math.max(field.left - overscan, x - width / 2));
    const bottom = Math.min(field.top - height + overscan, Math.max(field.bottom - overscan, y - height / 2));
    return { left, right: left + width, bottom, top: bottom + height };
}

export function randomStream(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(state ^ (state >>> 15), state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function distance(a: Readonly<Position>, b: Readonly<Position>): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distanceToSegment(point: Readonly<Position>, a: Readonly<Position>, b: Readonly<Position>): number {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const projection = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
    return distance(point, { x: a.x + projection * dx, y: a.y + projection * dy });
}

export function fieldRayEnd(from: Readonly<Position>, ux: number, uy: number, range: number, field: CombatBounds): Position {
    const xLimit = ux ? ((ux > 0 ? field.right : field.left) - from.x) / ux : Infinity;
    const yLimit = uy ? ((uy > 0 ? field.top : field.bottom) - from.y) / uy : Infinity;
    const length = Math.max(0, Math.min(range, xLimit, yLimit));
    return { x: from.x + ux * length, y: from.y + uy * length };
}
