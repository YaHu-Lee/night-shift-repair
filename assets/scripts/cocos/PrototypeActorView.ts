import { Camera, Color, Director, Game, Node, RenderTexture, Sprite, SpriteFrame, UITransform, Vec3, director, game, sys } from 'cc';
import { DEBUG } from 'cc/env';
import type { Battle, WeaponCast } from '../m1/Battle';
import type { ChapterBossView, Position } from '../m1/Encounter';
import { FIELD } from '../m1/content';
import type { CombatBounds } from '../m1/content';
import { PrototypeActorMotion } from './PrototypeActorMotion';
import type { PrototypeActorPose } from './PrototypeActorMotion';
import { PrototypeArenaMeshes } from './PrototypeArenaMeshes';
import { PrototypeBossMeshes } from './PrototypeBossMeshes';
import type { PrototypeBossKind, PrototypeBossSkill } from './PrototypeBossMeshes';
import { PrototypeChargerMeshes } from './PrototypeChargerMesh';
import { PrototypeMechanicMeshes } from './PrototypeMechanicMesh';
import type { MechanicHand, MechanicModel } from './PrototypeMechanicMesh';
import { PROTOTYPE_REGULAR_SCALE, PrototypeRegularMeshes } from './PrototypeRegularMeshes';
import type { PrototypeRegularKind } from './PrototypeRegularMeshes';
import { PrototypeFieldView } from './PrototypeFieldView';
import { PrototypeSkillView } from './PrototypeSkillView';
import { PrototypeStage01Charger } from './PrototypeStage01Charger';

const ACTOR_LAYER = 1 << 18;
const ARENA_LAYER = 1 << 17;
const WIDTH = 360;
const HEIGHT = 460;
const SURFACE_PIXEL_SCALE = 2;
const CENTER_X = 180;
const CENTER_Y = 350;
// This tilt maps one simulation unit to one projected pixel on the ground.
const GROUND_PROJECTION = 0.8;
const RADIANS_TO_DEGREES = 180 / Math.PI;
const CHARGER_SCALE = 1.05;
const MECHANIC_SCALE = 30;

type Enemy = Readonly<Battle['enemies'][number]>;
type ModelKind = PrototypeRegularKind | PrototypeBossKind | 'charger';

interface EnemyActor {
    node: Node;
    setPose(pose: PrototypeActorPose['pose'], ageTicks: number, phase?: number, skill?: PrototypeBossSkill): void;
    setImpact?(strength: number): void;
}

function createCamera(root: Node, layer: number, texture: RenderTexture, priority: number): Camera {
    const eye = new Node(layer === ACTOR_LAYER ? 'BattlePrototypeCamera' : 'BattleArenaCamera');
    eye.layer = layer;
    root.addChild(eye);
    eye.setPosition(0, 640, 480);
    eye.lookAt(Vec3.ZERO);
    const camera = eye.addComponent(Camera);
    camera.priority = priority;
    camera.visibility = layer;
    camera.projection = Camera.ProjectionType.ORTHO;
    camera.orthoHeight = HEIGHT / 2;
    camera.near = 1;
    camera.far = 1500;
    camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new Color(0, 0, 0, 0);
    camera.targetTexture = texture;
    return camera;
}

function panCamera(camera: Camera, offset: Readonly<Position>): void {
    camera.node.setPosition(offset.x, 640, 480 - offset.y / GROUND_PROJECTION);
}

function fillSurface(node: Node, parent: Node, frame: SpriteFrame, texture: RenderTexture): void {
    node.layer = parent.layer;
    parent.addChild(node);
    node.setPosition(CENTER_X, CENTER_Y, 0);
    node.addComponent(UITransform).setContentSize(WIDTH, HEIGHT);
    const sprite = node.addComponent(Sprite);
    sprite.sizeMode = Sprite.SizeMode.CUSTOM;
    frame.packable = false;
    frame.texture = texture;
    sprite.spriteFrame = frame;
}

/** The arena camera composites below the encounter overlay, so geometry cannot cover hazard areas. */
class ArenaPass {
    private readonly root = new Node('Campaign arenas');
    private readonly surface = new Node('Arena composite');
    private readonly texture = new RenderTexture();
    private readonly frame = new SpriteFrame();
    private readonly models = new PrototypeArenaMeshes();
    private readonly camera: Camera;
    private stageId?: string;
    private bounds?: CombatBounds;
    private offsetX = 0;
    private offsetY = 0;
    private visible: Node | null = null;
    private capturePending = false;

    constructor(parent: Node) {
        parent.scene!.addChild(this.root);
        this.texture.reset({ width: WIDTH * SURFACE_PIXEL_SCALE, height: HEIGHT * SURFACE_PIXEL_SCALE, name: 'Battle arena' });
        this.camera = createCamera(this.root, ARENA_LAYER, this.texture, -2);
        fillSurface(this.surface, parent, this.frame, this.texture);
        this.setStage();
        game.on(Game.EVENT_SHOW, this.capture);
    }

    setStage(stage?: string, bounds?: CombatBounds, offset: Readonly<Position> = Vec3.ZERO): void {
        if (!stage || !PrototypeArenaMeshes.supports(stage)) {
            this.root.active = false;
            this.surface.active = false;
            return;
        }
        const changed = stage !== this.stageId || bounds !== this.bounds;
        const hidden = !this.root.active;
        if (changed) {
            this.visible = this.models.create(stage, this.root, ARENA_LAYER, bounds);
            this.stageId = stage;
            this.bounds = bounds;
        }
        const moved = this.offsetX !== offset.x || this.offsetY !== offset.y;
        if (moved) {
            this.offsetX = offset.x;
            this.offsetY = offset.y;
            panCamera(this.camera, offset);
        }
        this.root.active = !!this.visible;
        this.surface.active = !!this.visible;
        if (changed || moved || hidden) this.capture();
    }

    destroy(): void {
        this.setStage();
        game.off(Game.EVENT_SHOW, this.capture);
        director.off(Director.EVENT_AFTER_DRAW, this.finishCapture);
        this.root.destroy();
        this.surface.destroy();
        this.frame.destroy();
        this.texture.destroy();
        this.models.destroy();
    }

    private readonly capture = (): void => {
        if (!this.root.active || this.capturePending) return;
        this.capturePending = true;
        this.camera.enabled = true;
        director.once(Director.EVENT_AFTER_DRAW, this.finishCapture);
    };

    private readonly finishCapture = (): void => {
        this.capturePending = false;
        this.camera.enabled = false;
    };
}

/** Offscreen actor pass composited between the stage and the combat effects. */
export class PrototypeActorView {
    private readonly sceneRoot = new Node('BattlePrototype3D');
    private readonly surface = new Node('BattlePrototypeComposite');
    private readonly texture = new RenderTexture();
    private readonly frame = new SpriteFrame();
    private readonly camera: Camera;
    private readonly chargerMeshes = new PrototypeChargerMeshes();
    private readonly stage01Charger: PrototypeStage01Charger;
    private readonly forceLegacyCharger = DEBUG && sys.isBrowser
        && new URLSearchParams(globalThis.location.search).get('charger') === 'legacy';
    private readonly mechanicMeshes = new PrototypeMechanicMeshes();
    private readonly regularMeshes = new PrototypeRegularMeshes();
    private readonly bossMeshes = new PrototypeBossMeshes();
    private readonly field: PrototypeFieldView;
    private readonly skills: PrototypeSkillView;
    private readonly sample = new PrototypeActorMotion();
    private readonly chargers: EnemyActor[] = [];
    private readonly actors = new Map<ModelKind, EnemyActor[]>([['charger', this.chargers]]);
    private readonly used = new Map<ModelKind, number>();
    private readonly bossLastModes = new WeakMap<Enemy, PrototypeBossSkill>();
    private readonly mechanic: MechanicModel;
    private arena?: ArenaPass;
    private useStage01Charger = false;

    constructor(actors: Node, private readonly ground?: Node) {
        actors.scene!.addChild(this.sceneRoot);
        this.sceneRoot.layer = ACTOR_LAYER;

        this.texture.reset({ width: WIDTH * SURFACE_PIXEL_SCALE, height: HEIGHT * SURFACE_PIXEL_SCALE, name: 'Battle actors' });
        this.camera = createCamera(this.sceneRoot, ACTOR_LAYER, this.texture, -1);
        fillSurface(this.surface, actors, this.frame, this.texture);

        this.stage01Charger = new PrototypeStage01Charger(this.sceneRoot, ACTOR_LAYER);
        this.mechanic = this.mechanicMeshes.create(this.sceneRoot, ACTOR_LAYER);
        this.field = new PrototypeFieldView(this.sceneRoot, ACTOR_LAYER,
            (node, position, height, yaw) => this.project(node, position, height, yaw));
        this.skills = new PrototypeSkillView(this.sceneRoot, ACTOR_LAYER,
            (node, position, height, yaw) => this.project(node, position, height, yaw));
        this.draw(null);
    }

    draw(battle: Readonly<Battle> | null, stageId?: string, offset: Readonly<Position> = Vec3.ZERO): void {
        const active = battle !== null;
        this.sceneRoot.active = active;
        this.surface.active = active;
        if (active && stageId && this.ground && PrototypeArenaMeshes.supports(stageId)) this.arena ??= new ArenaPass(this.ground);
        const bounds = battle && battle.field !== FIELD ? battle.field : undefined;
        this.arena?.setStage(active ? stageId : undefined, bounds, offset);
        const useStage01 = this.stage01Charger.use(active && stageId === '01' && !this.forceLegacyCharger);
        if (useStage01 !== this.useStage01Charger && battle) {
            for (const charger of this.chargers.splice(0)) {
                charger.node.active = false;
                charger.node.destroy();
            }
            this.useStage01Charger = useStage01;
        }
        if (!battle) return;
        panCamera(this.camera, offset);
        this.field.draw(battle);

        const player = this.sample.samplePlayer(battle);
        const usingTool = !player.pickupPulse && (player.pose === 'strike' || player.pose === 'recover')
            ? battle.playerAttackTool : undefined;
        const hands: [MechanicHand | undefined, MechanicHand | undefined] = [undefined, undefined];
        for (const slot of [0, 1] as const) {
            const tool = battle.tools[slot]?.id;
            if (!tool) continue;
            hands[slot] = { tool };
            for (let i = battle.weaponCasts.length - 1; i >= 0; i--) {
                const cast = battle.weaponCasts[i];
                const attackAge = battle.tick - cast.tick;
                if (attackAge >= 8) break;
                if (cast.slot !== slot || cast.tool !== tool) continue;
                hands[slot] = { tool, attackAge, aimYaw: Math.atan2(cast.uy / GROUND_PROJECTION, cast.ux) * RADIANS_TO_DEGREES };
                break;
            }
        }
        const windups = battle.meleeWindups();
        for (const cue of windups) {
            const hand = hands[cue.slot];
            if (hand?.tool === cue.tool && hand.attackAge === undefined) {
                hands[cue.slot] = { ...hand, windupAge: cue.ageTicks };
            }
        }
        const preparing = player.pose === 'idle' || player.pose === 'walk' ? windups[0] : undefined;
        this.place(this.mechanic.node, preparing ? { ...player, yaw: Math.atan2(preparing.uy, preparing.ux) } : player, MECHANIC_SCALE);
        this.mechanic.setPose(player.pose, player.ageTicks, usingTool ?? battle.tools[0]?.id, player.pickupPulse, hands);
        this.skills.draw(battle, this.skillAnchor);
        this.used.clear();
        const bossUnit = battle.boss?.unit;
        const chapterBoss = battle.chapterBoss;
        for (const enemy of battle.enemies) this.drawEnemy(battle, enemy, enemy === bossUnit ? chapterBoss : null);
        for (const enemy of battle.defeatedEnemies) this.drawEnemy(battle, enemy, enemy === bossUnit ? chapterBoss : null, true);
        if (bossUnit && bossUnit.hp <= 0 && chapterBoss?.kind === 'core') {
            this.drawEnemy(battle, bossUnit, chapterBoss);
        }
        for (const [kind, pool] of this.actors) {
            for (let i = this.used.get(kind) ?? 0; i < pool.length; i++) pool[i].node.active = false;
        }
    }

    dispose(): void {
        this.draw(null);
        this.sceneRoot.destroy();
        this.surface.destroy();
        this.frame.destroy();
        this.texture.destroy();
        this.chargerMeshes.destroy();
        this.stage01Charger.destroy();
        this.mechanicMeshes.destroy();
        this.regularMeshes.destroy();
        this.bossMeshes.destroy();
        this.field.destroy();
        this.skills.destroy();
        this.arena?.destroy();
    }

    private drawEnemy(battle: Readonly<Battle>, enemy: Enemy, chapter: ChapterBossView | null, defeated = false): void {
        const kind = chapter?.kind ?? enemy.kind;
        let state: PrototypeActorPose;
        let skill: PrototypeBossSkill | undefined;
        if (enemy.kind === 'inspector') {
            state = this.sample.sampleBoss(battle, enemy, chapter);
            if (chapter?.hazard) this.bossLastModes.set(enemy, chapter.hazard.shape);
            const attack = battle.boss?.attack;
            skill = !chapter ? attack === 'fan' || attack === 'ring' ? 'sector' : attack
                : chapter.kind === 'core' && enemy.hp <= 0 ? 'offline'
                : (chapter.volley ? 'sector' : chapter.hazard?.shape) ?? (state.pose === 'recover' ? this.bossLastModes.get(enemy) : undefined)
                ?? (chapter.stage > 1 ? 'critical' : undefined);
        } else state = enemy.kind === 'charger' ? this.sample.sampleCharger(battle, enemy) : this.sample.sampleRegular(battle, enemy);
        if (defeated) {
            const elapsed = battle.tick - enemy.hitAt!;
            state = { ...state, pose: 'hit', ageTicks: elapsed, phase: elapsed / 6 };
        } else if (skill === 'offline') state = { ...state, y: state.y - 12 };

        let pool = this.actors.get(kind);
        if (!pool) this.actors.set(kind, pool = []);
        const index = this.used.get(kind) ?? 0;
        const actor = pool[index] ??= this.createEnemy(kind, enemy.kind);
        this.used.set(kind, index + 1);
        const scale = enemy.kind === 'inspector' ? kind === 'core' ? 1.25 : 1.12
            : enemy.kind === 'charger' ? CHARGER_SCALE : PROTOTYPE_REGULAR_SCALE[enemy.kind];
        this.place(actor.node, state, scale, defeated ? 1 - state.phase * 0.65 : 1);
        actor.setPose(state.pose, state.ageTicks, state.phase, skill);
        actor.setImpact?.(state.impact);
    }

    private createEnemy(kind: ModelKind, enemy: Enemy['kind']): EnemyActor {
        if (enemy === 'charger') return this.useStage01Charger ? this.stage01Charger.create()
            : this.chargerMeshes.create(this.sceneRoot, ACTOR_LAYER);
        if (enemy !== 'inspector') return this.regularMeshes.create(enemy, this.sceneRoot, ACTOR_LAYER);
        const boss = this.bossMeshes.create(kind as PrototypeBossKind, this.sceneRoot, ACTOR_LAYER);
        return { node: boss.node, setImpact: boss.setImpact,
            setPose: (pose, elapsed, _phase, skill) => {
                boss.setPose(pose === 'strike' && (skill === 'summon' || skill === 'rect' || skill === 'sector' || skill === 'tether')
                    ? 'skill' : pose, elapsed, skill);
            } };
    }

    private place(node: Node, state: PrototypeActorPose, scale: number, vertical = 1): void {
        this.project(node, state, 0, state.yaw);
        node.setScale(scale, scale * vertical, scale);
        node.active = true;
    }

    private readonly skillAnchor = (cast: WeaponCast) => {
        const point = this.mechanic.weaponTip(cast.slot, cast.tool);
        return point && { x: CENTER_X + point.x, y: CENTER_Y - point.z * GROUND_PROJECTION, height: point.y };
    };

    private project(node: Node, position: Readonly<Position>, height: number, yaw: number): void {
        node.setPosition(position.x - CENTER_X, height, -(position.y - CENTER_Y) / GROUND_PROJECTION);
        const worldYaw = Math.atan2(Math.sin(yaw) / GROUND_PROJECTION, Math.cos(yaw));
        node.setRotationFromEuler(0, worldYaw * RADIANS_TO_DEGREES, 0);
    }
}
