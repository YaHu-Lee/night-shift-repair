import { Color, Material, Mesh, MeshRenderer, Node, Prefab, Vec3, gfx, resources, utils } from 'cc';
import type { Attack, Battle, Position, WeaponCast } from '../m1/Battle';
import { FIELD } from '../m1/content';
import type { CombatBounds, ToolId } from '../m1/content';

type Kind = Attack['kind'];
type Project = (node: Node, position: Readonly<Position>, elevation: number, heading: number) => void;
export type SkillAnchor = Readonly<Position> & { readonly height: number };
export type ResolveSkillAnchor = (cast: WeaponCast) => SkillAnchor | undefined;

type EffectPool = { mesh: Mesh; used: number; nodes: Node[] };
const modelNames = ['SwingRibbon', 'HookRibbon', 'ArcLink', 'RivetTracer', 'HeatJet', 'FluxRing', 'FluxTether', 'StrikeBurst', 'EnemyRound'] as const;
type Model = typeof modelNames[number];
type Volume = { node: Node; visual: Node; renderer: MeshRenderer };
type VolumePool = { used: number; volumes: Volume[] };
type Tint = keyof typeof tints;

const modelPath = 'prototype3d/effects/battle-effects/battle-effects';
const groundProjection = 0.8;
const radiansToDegrees = 180 / Math.PI;
const effectOpacitySteps = 8;
const meleeTrailTicks = 5;
const tints = {
    neutral: [1, 1, 1], arc: [0.62, 0.91, 1], shot: [1, 0.82, 0.53], heat: [1, 0.59, 0.31],
    magnet: [0.36, 0.96, 0.75], induction: [0.70, 0.52, 1], danger: [1, 0.36, 0.24],
} as const;
const launchTints: Record<Exclude<ToolId, 'wrench' | 'bypass_wrench'>, Tint> = {
    arc_gun: 'arc', riveter: 'shot', hydraulic_nailer: 'shot', split_probe: 'shot',
    torch: 'heat', pulse_nozzle: 'heat', induction: 'induction', traction_coil: 'magnet',
};

const paint: Record<Kind, readonly [number, number, number]> = {
    arc: [0.45, 0.83, 1], shot: [1, 0.76, 0.40], heat: [1, 0.40, 0.19],
    magnet: [0.34, 0.91, 0.69], induction: [0.73, 0.52, 1],
};

function beamMesh(kind: Kind): Mesh {
    const positions = [0.5, 0, 0, -0.5, 0, 0, 0, 0.5, 0, 0, 0, 0.5, 0, -0.5, 0, 0, 0, -0.5];
    const indices = [0, 2, 3, 0, 3, 4, 0, 4, 5, 0, 5, 2, 1, 3, 2, 1, 4, 3, 1, 5, 4, 1, 2, 5];
    const colors = [1, 0.72, 1, 0.86, 0.70, 0.9].flatMap(value => [...paint[kind].map(channel => channel * value), 1]);
    return utils.createMesh({ positions, indices, colors }, undefined, { calculateBounds: true });
}

function offset(x: number, y: number, angle: number, reach: number): Position {
    return { x: x + Math.cos(angle) * reach, y: y + Math.sin(angle) * reach };
}

/** Volumetric streaks and fragments follow battle effects while the HUD marks their exact planar ranges. */
export class PrototypeSkillView {
    private readonly material = new Material();
    private readonly pools = new Map<Kind, EffectPool>();
    private readonly volumePools = new Map<Model, VolumePool>();
    private readonly volumeMaterials = new Map<string, Material>();
    private readonly anchors = new WeakMap<WeaponCast, SkillAnchor>();
    private models?: Map<Model, Mesh>;
    private prefab?: Prefab;
    private disposed = false;
    private bounds: CombatBounds = FIELD;

    constructor(private readonly root: Node, private readonly layer: number, private readonly project: Project) {
        this.material.initialize({ effectName: 'builtin-unlit', defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: true } });
        if (!resources.getInfoWithPath(modelPath, Prefab)) return;
        resources.load(modelPath, Prefab, (error, prefab) => {
            if (this.disposed || error || !prefab) return;
            const models = new Map<Model, Mesh>();
            prefab.data.walk(node => {
                if (!modelNames.includes(node.name as Model)) return;
                const mesh = node.getComponent(MeshRenderer)?.mesh;
                if (mesh) models.set(node.name as Model, mesh);
            });
            if (models.size !== modelNames.length) return;
            this.models = models;
            prefab.addRef();
            this.prefab = prefab;
        });
    }

    get usingDetailedEffects(): boolean { return !!this.models; }

    draw(battle: Readonly<Battle>, resolveAnchor?: ResolveSkillAnchor): void {
        this.bounds = battle.field;
        if (resolveAnchor) {
            for (let i = battle.weaponCasts.length - 1; i >= 0; i--) {
                const cast = battle.weaponCasts[i];
                if (cast.tick !== battle.tick) break;
                if (this.anchors.has(cast)) continue;
                const anchor = resolveAnchor(cast);
                if (anchor) this.anchors.set(cast, { ...anchor });
            }
        }
        for (const pool of this.pools.values()) pool.used = 0;
        for (const pool of this.volumePools.values()) pool.used = 0;
        if (this.models) this.drawModeled(battle);
        else this.drawFallback(battle);
        for (const pool of this.pools.values()) {
            for (let index = pool.used; index < pool.nodes.length; index++) pool.nodes[index].active = false;
        }
        for (const pool of this.volumePools.values()) {
            for (let index = pool.used; index < pool.volumes.length; index++) pool.volumes[index].node.active = false;
        }
    }

    destroy(): void {
        this.disposed = true;
        for (const material of this.volumeMaterials.values()) material.destroy();
        this.prefab?.decRef();
        this.material.destroy();
        for (const pool of this.pools.values()) pool.mesh.destroy();
    }

    private drawModeled(battle: Readonly<Battle>): void {
        for (const cast of battle.weaponCasts) {
            const age = battle.tick - cast.tick;
            if (age < 0 || age >= meleeTrailTicks) continue;
            const anchor = this.anchors.get(cast);
            if (cast.tool === 'wrench' || cast.tool === 'bypass_wrench') this.drawSwing(cast, age, anchor);
            else if (anchor && age < 3) this.burst(anchor, launchTints[cast.tool], age, 0.47, anchor.height);
        }
        for (const effect of battle.effects) {
            const anchor = effect.sourceCast ? this.anchors.get(effect.sourceCast) : undefined;
            switch (effect.shape) {
                case 'link':
                    this.drawArcLink(effect, effect.fromWeapon ? anchor : undefined);
                    this.burst(effect, effect.melee ? 'shot' : 'arc', 6 - effect.life, effect.melee ? 1.18 : 0.85);
                    break;
                case 'impact':
                    this.burst(effect, effect.kind, 6 - effect.life, 1);
                    if (effect.pullFrom) this.volumeSegment('FluxTether', effect, effect.pullFrom,
                        8, 5, 'induction', effect.life / 6);
                    break;
                case 'circle':
                    this.drawFlux(effect);
                    break;
                case 'strip':
                    this.drawTracer(effect, anchor);
                    break;
                case 'sector':
                    this.drawHeat(effect, anchor);
                    break;
            }
        }
        for (const bullet of battle.bullets) this.volume('EnemyRound', bullet, 7,
            Math.atan2(bullet.vy, bullet.vx), 12, 3.4, 3.4, 'neutral', 1);
        for (const enemy of battle.enemies) {
            if (enemy.kind === 'reclaimer' && enemy.state === 'dash' && enemy.tether) {
                this.volumeSegment('FluxTether', enemy, enemy.tether, 8, 4, 'danger', 0.84);
            }
            if (enemy.kind === 'jammer' && enemy.state === 'dash') {
                this.volume('FluxRing', enemy, 3, battle.tick * 0.06, 52, 2.2, 52, 'induction', 0.57, true);
            }
        }
        const hazard = battle.chapterBoss?.hazard;
        if (hazard?.shape === 'tether' && hazard.state === 'active') {
            this.volumeSegment('FluxTether', hazard, hazard.end, 8, 5, 'danger', 0.91);
        }
        if (battle.playerHit && battle.player.hurtAt !== undefined) {
            const age = battle.tick - battle.player.hurtAt;
            if (age >= 0 && age < 6) this.burst(battle.playerHit, 'danger', age, 1.08, 13);
        }
    }

    private drawSwing(cast: WeaponCast, age: number, anchor?: SkillAnchor): void {
        const backhand = (cast.tool === 'bypass_wrench') !== (cast.slot === 1);
        const phase = age / meleeTrailTicks;
        const bearing = Math.atan2(cast.uy, cast.ux);
        const mirror = backhand ? -1 : 1;
        const heading = bearing + mirror * (0.10 + phase * 0.40);
        const length = Math.min(31, Math.max(18, cast.targetRange)) * (0.91 + phase * 0.13);
        // Line up the leading edge with the tool head. The cached point stays put while the player moves.
        const start = anchor ? offset(anchor.x, anchor.y, heading + mirror * 0.20, -length * 0.94)
            : offset(cast.x, cast.y, bearing, 4);
        this.volume(backhand ? 'HookRibbon' : 'SwingRibbon', start, (anchor ? anchor.height - 3 : 16) - phase * 3, heading,
            length, 11, length, 'neutral', 1 - phase * 0.86, true);
    }

    private drawArcLink(effect: Extract<Attack, { shape: 'link' }>, anchor?: SkillAnchor): void {
        const { from, x, y, life, melee } = effect;
        const heading = Math.atan2(y - from.y, x - from.x);
        const distance = Math.hypot(x - from.x, y - from.y);
        if (distance < 2 || melee && distance < 23) return;
        const origin = anchor ?? (melee ? offset(from.x, from.y, heading, Math.min(24, distance * 0.68)) : from);
        const height = melee ? 11 : 8;
        this.volumeSegment('ArcLink', origin, effect, anchor?.height ?? height, (melee ? 4.6 : 7) + life * 0.45,
            'neutral', Math.min(1, 0.19 + life * (melee ? 0.115 : 0.16)), height);
    }

    private drawTracer(effect: Extract<Attack, { shape: 'strip' }>, anchor?: SkillAnchor): void {
        const progress = (7 - effect.life) / 6;
        const bearing = Math.atan2(effect.uy, effect.ux);
        const tip = effect.length * Math.min(1, 0.23 + progress * 1.02);
        const tail = Math.max(Math.min(9, tip * 0.32), tip - 28 - progress * 15);
        this.emissionTrack('RivetTracer', effect, bearing, tail, tip, 11, Math.min(3.1, 1.7 * effect.halfWidth),
            Math.min(1, 0.24 + effect.life * 0.145), anchor);
    }

    private drawHeat(effect: Extract<Attack, { shape: 'sector' }>, anchor?: SkillAnchor): void {
        const heading = Math.atan2(effect.uy, effect.ux);
        const spread = Math.atan(effect.slope);
        const progress = (7 - effect.life) / 6;
        const front = effect.radius * (0.49 + progress * 0.49);
        for (let i = -2; i <= 2; i++) {
            const angle = heading + i * spread * 0.38;
            const tip = front * (1 - Math.abs(i) * 0.13);
            const tail = Math.min(tip * 0.53, Math.max(7, tip * (0.08 + progress * 0.34)));
            this.emissionTrack('HeatJet', effect, angle, tail, tip, 9 - Math.abs(i) * 1.2,
                (1 - progress * 0.37) * (i === 0 ? 15 : 10),
                Math.min(1, 0.24 + effect.life * 0.14) * (i === 0 ? 1 : 0.76), anchor);
        }
    }

    private emissionTrack(model: Model, origin: Position, bearing: number, tail: number, tip: number,
        height: number, width: number, alpha: number, anchor?: SkillAnchor): void {
        const end = offset(origin.x, origin.y, bearing, tip);
        if (!anchor) {
            const start = offset(origin.x, origin.y, bearing, tail);
            this.volumeSegment(model, start, end, height, width, 'neutral', alpha);
            return;
        }
        const muzzle = Math.max(0, (anchor.x - origin.x) * Math.cos(bearing) + (anchor.y - origin.y) * Math.sin(bearing));
        if (tip - muzzle < 1) return;
        const travel = Math.max(0, (tail - muzzle) / (tip - muzzle));
        const start = { x: anchor.x + (end.x - anchor.x) * travel, y: anchor.y + (end.y - anchor.y) * travel };
        this.volumeSegment(model, start, end, anchor.height + (height - anchor.height) * travel, width, 'neutral', alpha, height);
    }

    private drawFlux(effect: Extract<Attack, { shape: 'circle' }>): void {
        const progress = (12 - effect.life) / 11;
        const turn = effect.kind === 'magnet' ? -progress : progress;
        const traveling = effect.radius * (effect.kind === 'magnet' ? 1 - progress * 0.76 : 0.18 + progress * 0.80);
        const outerOpacity = Math.max(0, 0.92 - progress * 1.65);
        if (outerOpacity > 0.06) this.volume('FluxRing', effect, 2.5, turn * 0.75, effect.radius, 4.6,
            effect.radius, effect.kind, outerOpacity, true);
        this.volume('FluxRing', effect, 4, turn * 1.73 + Math.PI / 8, traveling, 7,
            traveling, effect.kind, 0.92 - progress * 0.75, true);
    }

    private burst(position: Readonly<Position>, tint: Tint, age: number, size: number, height = 16): void {
        const progress = age / 6;
        const reach = (5 + 8 * progress) * size;
        this.volume('StrikeBurst', position, height + progress * 2, (position.x + position.y) * 0.037,
            reach, reach * 0.75, reach, tint, Math.min(1, 1.12 - progress), true);
    }

    private volumeSegment(model: Model, start: Readonly<Position>, end: Readonly<Position>,
        height: number, width: number, tint: Tint, alpha: number, endHeight = height): void {
        const visible = this.visibleVector(start, end);
        if (!visible) return;
        const { dx, dy, span, portion } = visible;
        const lift = (endHeight - height) * portion;
        this.volume(model, { x: start.x + dx * 0.5, y: start.y + dy * 0.5 }, height + lift * 0.5, Math.atan2(dy, dx),
            Math.hypot(span, lift), width * 0.78, width, tint, alpha, false, Math.atan2(lift, span));
    }

    private volume(model: Model, position: Readonly<Position>, height: number, heading: number,
        sx: number, sy: number, sz: number, tint: Tint, alpha: number, planar = false, pitch = 0): void {
        let pool = this.volumePools.get(model);
        if (!pool) this.volumePools.set(model, pool = { used: 0, volumes: [] });
        let item = pool.volumes[pool.used];
        if (!item) {
            const node = new Node(`3D effect ${model}`);
            node.layer = this.layer;
            node.active = false;
            this.root.addChild(node);
            const visual = new Node(model);
            visual.layer = this.layer;
            node.addChild(visual);
            const renderer = visual.addComponent(MeshRenderer);
            renderer.mesh = this.models!.get(model)!;
            item = { node, visual, renderer };
            pool.volumes.push(item);
        }
        pool.used++;
        const { node, visual, renderer } = item;
        const material = this.volumeMaterial(tint, alpha);
        if (renderer.getSharedMaterial(0) !== material) renderer.setSharedMaterial(material, 0);
        this.project(node, position, height, planar ? 0 : heading);
        // Apply the camera's compression after planar yaw. The circular pulse then stays inside its ground overlay.
        node.setScale(1, 1, planar ? 1 / groundProjection : 1);
        visual.setRotationFromEuler(0, planar ? heading * radiansToDegrees : 0, pitch * radiansToDegrees);
        visual.setScale(sx, sy, sz);
        node.active = true;
    }

    private volumeMaterial(tint: Tint, opacity: number): Material {
        const step = Math.max(1, Math.min(effectOpacitySteps, Math.round(opacity * effectOpacitySteps)));
        const key = `${tint}-${step}`;
        let material = this.volumeMaterials.get(key);
        if (!material) {
            material = new Material();
            material.initialize({ effectName: 'builtin-unlit', technique: 3,
                defines: { USE_VERTEX_COLOR: true, USE_INSTANCING: true },
                // The actor layer is composited again. Keep its stored coverage linear.
                states: { blendState: { targets: [{ blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA, blendSrcAlpha: gfx.BlendFactor.ONE,
                    blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA }] } } });
            material.setProperty('mainColor', new Color(255, 255, 255, Math.round(255 * step / effectOpacitySteps)));
            material.setProperty('colorScale', new Vec3(...tints[tint]));
            this.volumeMaterials.set(key, material);
        }
        return material;
    }

    private drawFallback(battle: Readonly<Battle>): void {
        for (const effect of battle.effects) {
            const { x, y, life, kind } = effect;
            if (effect.shape === 'link') {
                this.drawLink(effect);
                this.drawImpact(x, y, kind, life);
            } else if (effect.shape === 'impact') this.drawImpact(x, y, kind, life);
            else if (effect.shape === 'circle') this.drawPulse(effect);
            else if (effect.shape === 'strip') {
                const progress = Math.max(0, 1 - life / 8);
                const head = effect.length * progress;
                const tail = Math.max(0, head - 23);
                this.segment(kind, { x: x + effect.ux * tail, y: y + effect.uy * tail },
                    { x: x + effect.ux * head, y: y + effect.uy * head }, 8, Math.min(2.2, effect.halfWidth));
            } else {
                const heading = Math.atan2(effect.uy, effect.ux);
                const spread = Math.atan(effect.slope);
                const front = effect.radius * (1 - life / 9);
                for (let index = -2; index <= 2; index++) {
                    const angle = heading + index * spread * 0.37;
                    const reach = front * (1 - Math.abs(index) * 0.14);
                    this.segment(kind, offset(x, y, angle, reach * 0.32), offset(x, y, angle, reach),
                        4 + Math.abs(index), 1.8 + 1.6 * Math.max(0, 1 - life / 9));
                }
            }
        }
        for (const bullet of battle.bullets) {
            const heading = Math.atan2(bullet.vy, bullet.vx);
            this.segment('shot', offset(bullet.x, bullet.y, heading, -5), offset(bullet.x, bullet.y, heading, 5), 7, 3.3);
        }
    }

    private drawLink(effect: Extract<Attack, { shape: 'link' }>): void {
        const { x, y, life, from, kind } = effect;
        const dx = x - from.x, dy = y - from.y;
        const zig = (life % 2 ? 2.1 : -2.1) / Math.max(10, Math.hypot(dx, dy));
        const elbow = { x: from.x + dx * 0.34 - dy * zig, y: from.y + dy * 0.34 + dx * zig };
        const tip = { x: from.x + dx * 0.67 + dy * zig, y: from.y + dy * 0.67 - dx * zig };
        const width = 0.6 + life * 0.23;
        this.segment(kind, from, elbow, 7, width);
        this.segment(kind, elbow, tip, 7 + life * 0.35, width);
        this.segment(kind, tip, effect, 6, width);
    }

    private drawPulse(effect: Extract<Attack, { shape: 'circle' }>): void {
        const { x, y, life, kind, radius } = effect;
        const t = life / 12;
        const reach = Math.max(0, radius * (kind === 'magnet' ? t : 1 - t));
        for (let arm = 0; arm < 4; arm++) {
            const angle = arm * Math.PI / 2 + t * 0.52;
            for (let step = 0; step < 4; step++) {
                this.segment(kind, offset(x, y, angle + step * 0.20, reach),
                    offset(x, y, angle + (step + 1) * 0.20, reach), 4.5 + 2 * t, 2.6 * t);
            }
        }
    }

    private drawImpact(x: number, y: number, kind: Kind, life: number): void {
        const travel = (8 - life) * 1.3;
        const width = 1.2 + life * 0.38;
        for (let i = 0; i < 3; i++) {
            const heading = i * Math.PI * 2 / 3 + (x + y) * 0.03;
            this.segment(kind, offset(x, y, heading, Math.max(0, travel - 2)), offset(x, y, heading, travel + 3),
                4 + travel * 0.75, width);
        }
    }

    private segment(kind: Kind, start: Readonly<Position>, end: Readonly<Position>, height: number, width: number): void {
        const visible = this.visibleVector(start, end);
        if (!visible || width < 0.2) return;
        const { dx, dy, span } = visible;
        let pool = this.pools.get(kind);
        if (!pool) this.pools.set(kind, pool = { mesh: beamMesh(kind), used: 0, nodes: [] });
        let node = pool.nodes[pool.used];
        if (!node) {
            node = new Node('3D skill spark ' + kind);
            node.layer = this.layer;
            this.root.addChild(node);
            const renderer = node.addComponent(MeshRenderer);
            renderer.mesh = pool.mesh;
            renderer.setSharedMaterial(this.material, 0);
            pool.nodes.push(node);
        }
        pool.used++;
        this.project(node, { x: start.x + dx / 2, y: start.y + dy / 2 }, height, Math.atan2(dy, dx));
        node.setScale(span, width * 0.75, width);
        node.active = true;
    }

    private visibleVector(start: Readonly<Position>, end: Readonly<Position>): { dx: number; dy: number; span: number; portion: number } | undefined {
        const { left, right, bottom, top } = this.bounds;
        if (start.x < left || start.x > right || start.y < bottom || start.y > top) return;
        const originalX = end.x - start.x, originalY = end.y - start.y;
        const tx = originalX > 0 ? (right - start.x) / originalX
            : originalX < 0 ? (left - start.x) / originalX : Infinity;
        const ty = originalY > 0 ? (top - start.y) / originalY
            : originalY < 0 ? (bottom - start.y) / originalY : Infinity;
        const portion = Math.min(1, tx, ty);
        const dx = originalX * portion, dy = originalY * portion;
        const span = Math.hypot(dx, dy / groundProjection);
        return span >= 0.2 ? { dx, dy, span, portion } : undefined;
    }
}
