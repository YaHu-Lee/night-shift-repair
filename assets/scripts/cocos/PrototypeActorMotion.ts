import type { Battle } from '../m1/Battle';
import type { ChapterBossView, ChapterHazard } from '../m1/Encounter';

export type PrototypePoseName = 'idle' | 'walk' | 'windup' | 'strike' | 'recover' | 'hit';

export interface PrototypeActorPose {
    readonly x: number;
    readonly y: number;
    /** Continuous planar radians. East is zero and north is π/2. */
    readonly yaw: number;
    readonly pose: PrototypePoseName;
    readonly phase: number;
    readonly ageTicks: number;
    readonly walkingDistance: number;
    readonly impact: number;
    readonly locked: boolean;
    readonly pickupPulse?: boolean;
}

type Actor = Readonly<{ x: number; y: number }>;
type Enemy = Readonly<Battle['enemies'][number]>;

interface Motion {
    x: number;
    y: number;
    dx: number;
    dy: number;
    tick: number;
    stepTicks: number;
    yaw: number;
    targetYaw: number;
    walkingDistance: number;
    pose: PrototypePoseName;
    poseStart: number;
    contactAt?: number;
    contactYaw?: number;
}

const SOUTH = -Math.PI / 2;
const MIN_MOVEMENT = 0.02;
const MAX_TURN_PER_TICK = Math.PI / 3;
const HIT_TICKS = 6;
const CHARGER_WINDUP_TICKS = 22;
const CHARGER_DASH_TICKS = 17;
const CHARGER_COOLDOWN_TICKS = 55;
const CHARGER_RECOVER_TICKS = 9;

const deviceAction = {
    reclaimer: { warning: 27, active: 60, cooldown: 77 },
    jammer: { warning: 27, active: 58, cooldown: 67 },
} as const;

function direction(dx: number, dy: number, fallback: number): number {
    return Math.hypot(dx, dy) >= MIN_MOVEMENT ? Math.atan2(dy, dx) : fallback;
}

function age(tick: number, event?: number): number {
    return event !== undefined && tick >= event ? tick - event : Infinity;
}

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function hazardYaw(hazard: ChapterHazard, actor: Actor, fallback: number): number {
    if (hazard.shape === 'sector') return hazard.from + hazard.sweep / 2;
    if (hazard.shape === 'tether') return direction(hazard.end.x - hazard.x, hazard.end.y - hazard.y, fallback);
    return direction((hazard.left + hazard.right) / 2 - actor.x, (hazard.bottom + hazard.top) / 2 - actor.y, fallback);
}

export class PrototypeActorMotion {
    private readonly actors = new WeakMap<Actor, Motion>();

    samplePlayer(battle: Pick<Readonly<Battle>, 'player' | 'playerAttack' | 'playerPulseAt' | 'tick'>): PrototypeActorPose {
        const { player, playerAttack, playerPulseAt, tick } = battle;
        const motion = this.sample(player, tick, SOUTH);
        const hitAge = age(tick, player.hurtAt);
        const attackAge = age(tick, playerAttack?.tick);
        const pulseAge = age(tick, playerPulseAt);
        const pickupPulse = pulseAge < attackAge && pulseAge < 8;
        const aim = !pickupPulse && playerAttack && attackAge < 8
            ? direction(playerAttack.x, playerAttack.y, motion.yaw) : undefined;

        this.turn(motion, aim);

        if (hitAge < HIT_TICKS) return this.result(motion, 'hit', hitAge, HIT_TICKS, hitAge, aim !== undefined);
        if (pickupPulse) {
            const pose = pulseAge < 5 ? this.result(motion, 'strike', pulseAge, 5, hitAge, false)
                : this.result(motion, 'recover', pulseAge - 5, 3, hitAge, false);
            return { ...pose, pickupPulse: true };
        }
        if (attackAge < 5) return this.result(motion, 'strike', attackAge, 5, hitAge, true);
        if (attackAge < 8) return this.result(motion, 'recover', attackAge - 5, 3, hitAge, true);
        return this.locomotion(motion, hitAge);
    }

    sampleCharger(battle: Pick<Readonly<Battle>, 'player' | 'tick'>, enemy: Enemy): PrototypeActorPose {
        const { player, tick } = battle;
        const motion = this.sample(enemy, tick, direction(player.x - enemy.x, player.y - enemy.y, SOUTH));
        const hitAge = age(tick, enemy.hitAt);
        const contactAge = age(tick, enemy.contactAt);
        const remaining = enemy.next - tick;
        const recoverAge = CHARGER_COOLDOWN_TICKS - remaining;
        const charging = enemy.state === 'warn' || enemy.state === 'dash';
        // Newly spawned chargers have a cooldown too, but no locked charge vector yet.
        const recovering = !charging && recoverAge >= 0 && recoverAge < CHARGER_RECOVER_TICKS
            && Math.hypot(enemy.vx, enemy.vy) >= MIN_MOVEMENT;
        if (contactAge < 9 && motion.contactAt !== enemy.contactAt) {
            motion.contactAt = enemy.contactAt;
            motion.contactYaw = direction(player.x - enemy.x, player.y - enemy.y, motion.yaw);
        }
        const aim = charging || recovering ? direction(enemy.vx, enemy.vy, motion.yaw)
            : contactAge < 9 ? motion.contactYaw : undefined;
        const locked = aim !== undefined;

        this.turn(motion, aim);

        if (enemy.state === 'warn') {
            return this.result(motion, 'windup', CHARGER_WINDUP_TICKS - remaining, CHARGER_WINDUP_TICKS, hitAge, locked);
        }
        if (enemy.state === 'dash') {
            return this.result(motion, 'strike', CHARGER_DASH_TICKS - remaining, CHARGER_DASH_TICKS, hitAge, locked);
        }
        if (hitAge < HIT_TICKS) return this.result(motion, 'hit', hitAge, HIT_TICKS, hitAge, locked);
        if (contactAge < 5) return this.result(motion, 'strike', contactAge, 5, hitAge, locked);
        if (recovering) return this.result(motion, 'recover', recoverAge, CHARGER_RECOVER_TICKS, hitAge, locked);
        if (contactAge < 9) return this.result(motion, 'recover', contactAge - 5, 4, hitAge, locked);
        return this.locomotion(motion, hitAge);
    }

    sampleRegular(battle: Pick<Readonly<Battle>, 'player' | 'tick' | 'mission'>, enemy: Enemy): PrototypeActorPose {
        const { tick, player } = battle;
        const { kind, state } = enemy;
        const bearing = direction(player.x - enemy.x, player.y - enemy.y, SOUTH);
        const motion = this.sample(enemy, tick, bearing);
        const hit = age(tick, enemy.hitAt);
        const shot = age(tick, enemy.shotAt);
        const contact = age(tick, enemy.contactAt);
        const reveal = age(tick, enemy.revealedAt);
        const remaining = enemy.next - tick;
        const device = kind === 'reclaimer' || kind === 'jammer' ? deviceAction[kind] : undefined;
        let aim: number | undefined;

        if (kind === 'armored') aim = direction(enemy.facingX ?? 0, enemy.facingY ?? -1, motion.yaw);
        else if ((kind === 'turret' && (state === 'warn' || shot < 11)) || kind === 'pursuer' && state === 'dash') {
            aim = direction(enemy.vx, enemy.vy, motion.yaw);
        } else if (device && state !== 'walk') {
            const mission = battle.mission;
            const target = (kind === 'reclaimer' ? enemy.tether ?? mission?.escort : mission?.points.find(point => point.state === 'active')) ?? player;
            aim = direction(target.x - enemy.x, target.y - enemy.y, motion.yaw);
        } else if (contact < 9) {
            if (motion.contactAt !== enemy.contactAt) {
                motion.contactAt = enemy.contactAt;
                motion.contactYaw = bearing;
            }
            aim = motion.contactYaw;
        } else if (kind === 'turret' && Math.hypot(motion.dx, motion.dy) < MIN_MOVEMENT) aim = bearing;
        this.turn(motion, aim);

        const locked = aim !== undefined;
        if (state === 'warn') {
            // Ambushers may wait until illuminated, so the pose settles at the end of their windup.
            const duration = kind === 'turret' ? 21 : device?.warning ?? 27;
            return this.result(motion, 'windup', duration - remaining, duration, hit, locked);
        }
        if (state === 'dash' && device) return this.result(motion, 'strike', device.active - remaining, device.active, hit, locked);
        if (shot < 5) return this.result(motion, 'strike', shot, 5, hit, locked);
        if (kind === 'ambusher' && reveal < 13) {
            return this.result(motion, reveal < 7 ? 'windup' : 'strike', reveal < 7 ? 27 + reveal : reveal - 7,
                reveal < 7 ? 34 : 6, hit, locked);
        }
        if (hit < HIT_TICKS) return this.result(motion, 'hit', hit, HIT_TICKS, hit, locked);
        if (contact < 5) return this.result(motion, 'strike', contact, 5, hit, locked);
        if (kind === 'pursuer' && state === 'dash') {
            return this.result(motion, 'strike', Math.max(0, (enemy.sprintTicks ?? 36) - 36), 10, hit, locked);
        }
        const recover = Math.min(shot - 5, contact - 5, device && remaining <= device.cooldown
            ? device.cooldown - remaining : Infinity);
        if (recover >= 0 && recover < 6) return this.result(motion, 'recover', recover, 6, hit, locked);
        return this.locomotion(motion, hit);
    }

    sampleBoss(battle: Pick<Readonly<Battle>, 'player' | 'tick' | 'boss'>, enemy: Enemy,
        chapter: ChapterBossView | null): PrototypeActorPose {
        const { tick, player, boss } = battle;
        const motion = this.sample(enemy, tick, direction(player.x - enemy.x, player.y - enemy.y, SOUTH));
        const hit = age(tick, enemy.hitAt);
        if (chapter) {
            const { hazard, phaseStartedAt, phaseEndsAt } = chapter;
            const aim = chapter.facing ?? (chapter.kind === 'supervisor' ? SOUTH : hazard && hazardYaw(hazard, enemy, motion.yaw));
            this.turn(motion, aim);
            const elapsed = Math.max(0, tick - phaseStartedAt);
            const duration = Math.max(1, phaseEndsAt - phaseStartedAt);
            if (hazard) return this.result(motion, hazard.state === 'warning' ? 'windup' : 'strike', elapsed, duration, hit, true);
            if (hit < HIT_TICKS) return this.result(motion, 'hit', hit, HIT_TICKS, hit, false);
            if (chapter.recovering) return this.result(motion, 'recover', elapsed, duration, hit, false);
            return this.locomotion(motion, hit);
        }
        if (!boss) return this.locomotion(motion, hit);
        const locked = boss.phase !== 'patrol';
        this.turn(motion, locked ? direction(enemy.vx, enemy.vy, motion.yaw) : undefined);
        if (boss.phase === 'warning') {
            const duration = boss.attack === 'sweep' ? 33 : 28;
            return this.result(motion, 'windup', duration - (boss.next - tick), duration, hit, locked);
        }
        const attack = age(tick, boss.attackAt);
        if (boss.phase === 'charge' || boss.phase === 'sweep' || boss.attack === 'summon' && attack < 7) {
            const duration = boss.phase === 'charge' ? 23 : boss.phase === 'sweep' ? 12 : 7;
            return this.result(motion, 'strike', attack, duration, hit, locked);
        }
        if (hit < HIT_TICKS) return this.result(motion, 'hit', hit, HIT_TICKS, hit, locked);
        if (boss.phase === 'recover') {
            const duration = boss.attack === 'summon' ? 29 : 34;
            return this.result(motion, 'recover', duration - (boss.next - tick), duration, hit, locked);
        }
        return this.locomotion(motion, hit);
    }

    private sample(actor: Actor, tick: number, yaw: number): Motion {
        let motion = this.actors.get(actor);
        if (!motion || tick < motion.tick) {
            motion = { x: actor.x, y: actor.y, dx: 0, dy: 0, tick, stepTicks: 0, yaw, targetYaw: yaw,
                walkingDistance: 0, pose: 'idle', poseStart: tick };
            this.actors.set(actor, motion);
        }
        motion.stepTicks = tick - motion.tick;
        if (motion.stepTicks > 0) {
            motion.dx = actor.x - motion.x;
            motion.dy = actor.y - motion.y;
            motion.x = actor.x;
            motion.y = actor.y;
            motion.tick = tick;
            const distance = Math.hypot(motion.dx, motion.dy);
            if (distance >= MIN_MOVEMENT) motion.walkingDistance += distance;
        }
        return motion;
    }

    private turn(motion: Motion, aim?: number): void {
        motion.targetYaw = aim ?? direction(motion.dx, motion.dy, motion.targetYaw);
        const difference = motion.targetYaw - motion.yaw;
        const shortest = Math.atan2(Math.sin(difference), Math.cos(difference));
        if (Math.abs(shortest) < 1e-12) return;
        const limit = aim !== undefined ? Math.PI : MAX_TURN_PER_TICK * motion.stepTicks;
        motion.yaw += Math.max(-limit, Math.min(limit, shortest));
    }

    private locomotion(motion: Motion, hitAge: number): PrototypeActorPose {
        const walking = Math.hypot(motion.dx, motion.dy) >= MIN_MOVEMENT;
        return this.result(motion, walking ? 'walk' : 'idle', undefined, 0, hitAge, false);
    }

    private result(motion: Motion, pose: PrototypePoseName, eventAge: number | undefined,
        duration: number, hitAge: number, locked: boolean): PrototypeActorPose {
        if (pose !== motion.pose) {
            motion.pose = pose;
            motion.poseStart = motion.tick;
        }
        const ageTicks = Math.max(0, eventAge ?? motion.tick - motion.poseStart);
        const phase = duration > 0 ? clamp01(ageTicks / Math.max(1, duration - 1))
            : pose === 'walk' ? (motion.walkingDistance % 12) / 12 : 0;
        return { x: motion.x, y: motion.y, yaw: motion.yaw, pose, phase, ageTicks,
            walkingDistance: motion.walkingDistance, impact: clamp01(1 - hitAge / HIT_TICKS), locked };
    }
}
