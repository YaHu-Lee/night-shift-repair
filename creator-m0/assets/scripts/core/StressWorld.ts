/** Engine-independent 30 Hz simulation for the M0 rendering stress scene. */
export const ARENA_WIDTH = 360;
export const ARENA_HEIGHT = 640;
export const STEP_SECONDS = 1 / 30;
export const STRESS_COUNTS = { enemies: 120, projectiles: 160, pickups: 80 } as const;

export interface Point {
    x: number;
    y: number;
}

interface Enemy extends Point {
    speed: number;
}

interface Projectile extends Point {
    vx: number;
    vy: number;
    life: number;
}

const TAU = Math.PI * 2;
const PLAYER_DISTANCE = 160 * STEP_SECONDS;
const PLAYER_MARGIN = 10;
const PROJECTILE_MARGIN = 10;
const PICKUP_DISTANCE = 210 * STEP_SECONDS;
const PICKUP_RADIUS_SQUARED = 60 * 60;
const COLLECT_RADIUS_SQUARED = 6 * 6;

class SeededRandom {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    next(): number {
        // Mulberry32 accepts all uint32 seeds, including zero.
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let mixed = Math.imul(this.state ^ (this.state >>> 15), this.state | 1);
        mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
        return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
    }
}

export class StressWorld {
    readonly player: Point = { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2 };
    readonly enemies: Enemy[] = [];
    readonly projectiles: Projectile[] = [];
    readonly pickups: Point[] = [];
    private ticks = 0;
    private readonly random: SeededRandom;

    constructor(seed: number) {
        this.random = new SeededRandom(seed);
        for (let i = 0; i < STRESS_COUNTS.enemies; i++) {
            const enemy: Enemy = { x: 0, y: 0, speed: 0 };
            this.placeEnemy(enemy);
            this.enemies.push(enemy);
        }
        for (let i = 0; i < STRESS_COUNTS.projectiles; i++) {
            const projectile: Projectile = { x: 0, y: 0, vx: 0, vy: 0, life: 0 };
            this.launchProjectile(projectile);
            this.placePoint(projectile);
            projectile.life = 1 + Math.floor(this.random.next() * projectile.life);
            this.projectiles.push(projectile);
        }
        for (let i = 0; i < STRESS_COUNTS.pickups; i++) {
            const pickup: Point = { x: 0, y: 0 };
            this.placePoint(pickup);
            this.pickups.push(pickup);
        }
    }

    get tick(): number {
        return this.ticks;
    }

    /** One tick only. Axes are analog joystick values; diagonal input cannot boost speed. */
    step(x: number, y: number): void {
        x = axis(x);
        y = axis(y);
        const magnitudeSquared = x * x + y * y;
        if (magnitudeSquared > 1) {
            const magnitude = Math.sqrt(magnitudeSquared);
            x /= magnitude;
            y /= magnitude;
        }
        const player = this.player;
        player.x = clamp(player.x + x * PLAYER_DISTANCE, PLAYER_MARGIN, ARENA_WIDTH - PLAYER_MARGIN);
        player.y = clamp(player.y + y * PLAYER_DISTANCE, PLAYER_MARGIN, ARENA_HEIGHT - PLAYER_MARGIN);

        for (let i = 0; i < this.enemies.length; i++) {
            const enemy = this.enemies[i];
            const dx = player.x - enemy.x;
            const dy = player.y - enemy.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= 8) {
                // Recycle on contact so the scene remains at peak load.
                this.placeEnemy(enemy);
            } else {
                enemy.x += dx / distance * enemy.speed;
                enemy.y += dy / distance * enemy.speed;
            }
        }

        for (let i = 0; i < this.projectiles.length; i++) {
            const projectile = this.projectiles[i];
            projectile.x += projectile.vx;
            projectile.y += projectile.vy;
            projectile.life--;
            if (projectile.life <= 0
                || projectile.x < -PROJECTILE_MARGIN || projectile.x > ARENA_WIDTH + PROJECTILE_MARGIN
                || projectile.y < -PROJECTILE_MARGIN || projectile.y > ARENA_HEIGHT + PROJECTILE_MARGIN) {
                this.launchProjectile(projectile);
            }
        }

        for (let i = 0; i < this.pickups.length; i++) {
            const pickup = this.pickups[i];
            const dx = player.x - pickup.x;
            const dy = player.y - pickup.y;
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared <= COLLECT_RADIUS_SQUARED) {
                this.placePoint(pickup);
            } else if (distanceSquared <= PICKUP_RADIUS_SQUARED) {
                const fraction = PICKUP_DISTANCE / Math.sqrt(distanceSquared);
                pickup.x += dx * fraction;
                pickup.y += dy * fraction;
            }
        }

        this.ticks++;
    }

    private placePoint(point: Point): void {
        point.x = this.random.next() * ARENA_WIDTH;
        point.y = this.random.next() * ARENA_HEIGHT;
    }

    private placeEnemy(enemy: Enemy): void {
        const edge = Math.floor(this.random.next() * 4);
        const offset = this.random.next();
        enemy.x = edge < 2 ? edge * ARENA_WIDTH : offset * ARENA_WIDTH;
        enemy.y = edge < 2 ? offset * ARENA_HEIGHT : (edge - 2) * ARENA_HEIGHT;
        enemy.speed = (22 + this.random.next() * 55) * STEP_SECONDS;
    }

    private launchProjectile(projectile: Projectile): void {
        const angle = this.random.next() * TAU;
        const speed = (150 + this.random.next() * 155) * STEP_SECONDS;
        projectile.x = this.player.x;
        projectile.y = this.player.y;
        projectile.vx = Math.cos(angle) * speed;
        projectile.vy = Math.sin(angle) * speed;
        projectile.life = 23 + Math.floor(this.random.next() * 33);
    }
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function axis(value: number): number {
    return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}
