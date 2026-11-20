import { Battle, HIT_SOURCES } from './Battle';
import type { HitSource } from './Battle';
import { BLUEPRINT_IDS, CHALLENGE_MODES, ESCORT_HP, RELAY_HP } from './Encounter';
import type { BlueprintId, ChallengeMode, MissionState } from './Encounter';
import {
    FIRST_PAIR, M1_RULES, MODS, REFRESH_COST, RUN_SEED, STARTER, TICK_RATE,
    hasPair, isMod, isTool, offer, randomStream,
} from './content';
import type { EquippedTool, OfferId, Route, RunRules, ToolId } from './content';
import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';

const CHECKPOINT_VERSION = 1;
const STEP = 1 / TICK_RATE;
type Phase = 'battle' | 'shop' | 'won' | 'lost' | 'revive';
interface Shop { offers: OfferId[]; refreshed: boolean }
export type FinishReason = 'cleared' | 'defeated' | 'timeout' | 'objective-failed';
export interface WaveReport {
    wave: number;
    ticks: number;
    kills: number;
    collected: number;
    salvaged: number;
    shopCredit: number;
    hits: number;
    triggers: { arc: number; magnet: number; heat: number };
    defeatedBy: HitSource | null;
    heatRecovered?: boolean;
}
export interface Checkpoint {
    schemaVersion: 1;
    contentVersion: number;
    runId: string;
    revision: number;
    seed: number;
    route: Route;
    wave: number;
    phase: Phase;
    parts: number;
    tools: EquippedTool[];
    shop: Shop | null;
    reports?: WaveReport[];
    finishReason?: FinishReason;
    blueprint?: BlueprintId;
    mode?: ChallengeMode;
    mission?: MissionState;
    revived?: boolean;
    firstWaveMoved?: boolean;
}

function integer(value: unknown, minimum: number, maximum: number): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validReports(data: Checkpoint, rules: RunRules): boolean {
    if (data.reports === undefined) return true;
    if (!Array.isArray(data.reports) || data.reports.length > rules.waves.length) return false;
    const lastWave = data.phase === 'battle' ? data.wave - 1 : data.wave;
    let previous = -1;
    for (const report of data.reports) {
        if (!report || !integer(report.wave, previous + 1, lastWave)
            || !integer(report.ticks, 0, rules.waves[report.wave].seconds * TICK_RATE)
            || !integer(report.hits, 0, rules.maxHp)
            || !integer(report.kills, 0, 10000) || !integer(report.collected, 0, report.kills)
            || !integer(report.salvaged, 0, Math.floor((report.kills - report.collected) * (rules.stage === 'M2' ? 0.75 : 0.5)))
            || !integer(report.shopCredit, 0, 6)
            || !integer(report.triggers?.arc, 0, 10000) || !integer(report.triggers?.magnet, 0, 10000)
            || !integer(report.triggers?.heat, 0, 10000)
            || (report.heatRecovered !== undefined && typeof report.heatRecovered !== 'boolean')
            || (report.defeatedBy !== null && !HIT_SOURCES.includes(report.defeatedBy))) return false;
        previous = report.wave;
    }
    return true;
}

function validMission(value: unknown): value is MissionState {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as MissionState;
    return (state.escortHp === undefined || integer(state.escortHp, 1, ESCORT_HP))
        && (state.relayHp === undefined || integer(state.relayHp, 1, RELAY_HP));
}

function validCheckpoint(value: unknown, rules: RunRules): value is Checkpoint {
    if (!value || typeof value !== 'object') return false;
    const data = value as Checkpoint;
    if (data.schemaVersion !== CHECKPOINT_VERSION || data.contentVersion !== rules.contentVersion
        || typeof data.runId !== 'string' || !data.runId || data.runId.length > 80
        || !integer(data.revision, 1, Number.MAX_SAFE_INTEGER - 1)
        || !integer(data.seed, 0, 0xffffffff) || !integer(data.parts, 0, 10000)
        || !integer(data.wave, 0, rules.waves.length - 1) || (data.route !== 'arc' && data.route !== 'magnet')
        || ['battle', 'shop', 'won', 'lost', 'revive'].indexOf(data.phase) < 0
        || (data.blueprint !== undefined && !BLUEPRINT_IDS.includes(data.blueprint))
        || (data.mode !== undefined && (!CHALLENGE_MODES.includes(data.mode) || !rules.encounter?.overtime))
        || (data.firstWaveMoved !== undefined && typeof data.firstWaveMoved !== 'boolean')
        || (data.revived !== undefined && typeof data.revived !== 'boolean')
        || (data.mission !== undefined && !validMission(data.mission))
        || !Array.isArray(data.tools) || data.tools.length < 1 || data.tools.length > 2
        || !(rules.startingTools ?? ['wrench']).includes(data.tools[0]?.id)) return false;
    const installed = new Set<string>();
    const slots = new Set<string>();
    for (let index = 0; index < data.tools.length; index++) {
        const tool = data.tools[index];
        const allowed = index === 0 ? rules.startingTools ?? ['wrench'] : rules.tools;
        if (!tool || typeof tool.id !== 'string' || !allowed.includes(tool.id) || slots.has(tool.id)
            || !Array.isArray(tool.mods) || tool.mods.length > 2) return false;
        slots.add(tool.id);
        for (const mod of tool.mods) {
            if (typeof mod !== 'string' || rules.mods.indexOf(mod) < 0 || installed.has(mod)) return false;
            installed.add(mod);
        }
    }
    if (!installed.has(STARTER[data.route]) || !validReports(data, rules)) return false;
    const reason = data.finishReason;
    if (data.phase === 'revive' && (reason !== 'defeated' || !reviveEligible(rules, data) ||
        data.reports?.[data.reports.length - 1]?.wave !== data.wave)) return false;
    if (reason !== undefined && !(
        (data.phase === 'won' && reason === 'cleared')
        || (data.phase === 'revive' && reason === 'defeated')
        || (data.phase === 'lost' && (reason === 'defeated'
            || reason === 'objective-failed' && rules.waves[data.wave].directive
            || reason === 'timeout' && (rules.waves[data.wave].boss || rules.waves[data.wave].directive || rules.waves[data.wave].escalation)))
    )) return false;
    if (data.phase !== 'shop') return data.shop === null && (data.phase !== 'won' || data.wave === rules.waves.length - 1);
    const shop = data.shop;
    return data.wave < rules.waves.length - 1 && !!shop && typeof shop.refreshed === 'boolean'
        && Array.isArray(shop.offers) && shop.offers.length <= 3
        && new Set(shop.offers).size === shop.offers.length
        && shop.offers.every((id) => typeof id === 'string' && (isTool(id)
            ? rules.tools.indexOf(id) >= 0 && !slots.has(id) && slots.size < 2
            : isMod(id) && rules.mods.indexOf(id) >= 0 && !installed.has(id)));
}

function reviveEligible(rules: RunRules, data: Checkpoint): boolean {
    return !!rules.encounter?.revive && data.wave >= 1 && data.wave <= 4 && !rules.waves[data.wave].boss
        && !data.revived && (!data.mode || data.mode === 'normal');
}

function nextOffers(data: Checkpoint, refreshed: boolean, rules: RunRules): OfferId[] {
    const installed = new Set<OfferId>();
    for (const tool of data.tools) for (const id of tool.mods) installed.add(id);
    const mods = rules.mods.filter((id) => !installed.has(id));
    const tools = rules.tools.filter((id) =>
        data.tools.length < 2 && id !== 'arc_gun' && !data.tools.some((tool) => tool.id === id));
    const firstPair = FIRST_PAIR[data.route];
    const required: OfferId[] = [];
    if (data.wave === 0 && !installed.has(firstPair)) required.push(firstPair);
    if (data.wave > 0 && rules.stage === 'M1') {
        required.push(...tools, ...mods.filter((id) => MODS[id].tag === 'heat').slice(0, 3 - tools.length));
    }
    const random = randomStream(data.seed ^ Math.imul(data.wave + 1, 0x344b1a4f) ^ (refreshed ? 0xa14ee123 : 0));
    if (rules.stage === 'M2' && data.wave > 0) {
        const preferPair = mods.filter((id) => MODS[id].tag !== 'utility'
            && data.tools.some((tool) => tool.mods.some((mod) => MODS[mod].tag === MODS[id].tag))
            && !hasPair(data.tools, MODS[id].tag));
        if (data.wave === 1 && tools.length > 0) {
            const candidates = tools.slice();
            while (candidates.length && required.length < 2) {
                required.push(candidates.splice(Math.floor(random() * candidates.length), 1)[0]);
            }
        }
        if (preferPair.length) {
            required.push(preferPair[Math.floor(random() * preferPair.length)]);
        }
    }
    const pool = [...mods, ...tools].filter((id) => required.indexOf(id) < 0);
    if (refreshed) {
        const before = data.shop?.offers ?? [];
        const fresh = pool.filter((id) => before.indexOf(id) < 0);
        if (fresh.length >= 3 - required.length) pool.splice(0, pool.length, ...fresh);
    }
    while (required.length < 3 && pool.length) {
        const [id] = pool.splice(Math.floor(random() * pool.length), 1);
        required.push(id);
    }
    return required;
}

export class Run {
    data: Checkpoint | null;
    battle: Battle | null = null;
    paused = false;
    background = false;
    storageFailed = false;
    private pending: Checkpoint | null = null;
    private elapsed = 0;
    private nonce = 0;
    private readonly disposeEvents: (() => void)[];

    readonly platform: Platform;

    constructor(platform?: Platform, readonly rules: RunRules = M1_RULES,
        private readonly options: { readonly offerRevive?: boolean } = {}) {
        this.platform = platform ?? makePlatform(undefined, rules.stage === 'M2' ? 'night-shift.m2' : 'night-shift.m1');
        this.data = this.platform.readCheckpoint<Checkpoint>(CHECKPOINT_VERSION, (value) => validCheckpoint(value, rules));
        this.restoreBattle();
        this.paused = this.battle !== null;
        this.disposeEvents = [
            this.platform.onHide(() => { this.background = true; this.pause(); }),
            this.platform.onShow(() => { this.background = false; this.pause(); }),
        ];
    }

    dispose(): void { this.disposeEvents.forEach((unsubscribe) => unsubscribe()); }
    get waitingForSave(): boolean { return this.pending !== null; }

    start(route: Route, seed = RUN_SEED, starterTool: ToolId = 'wrench', attemptId?: string,
        blueprint?: BlueprintId, mode: ChallengeMode = 'normal'): void {
        if (!(this.rules.startingTools ?? ['wrench']).includes(starterTool) ||
            (blueprint !== undefined && !BLUEPRINT_IDS.includes(blueprint)) ||
            (mode !== 'normal' && (!this.rules.encounter?.overtime || !CHALLENGE_MODES.includes(mode))) ||
            (attemptId !== undefined && (!attemptId || attemptId.length > 80))) return;
        const data: Checkpoint = {
            schemaVersion: CHECKPOINT_VERSION, contentVersion: this.rules.contentVersion,
            runId: attemptId ?? `${Date.now()}-${++this.nonce}`, revision: 1, seed: seed >>> 0,
            route, wave: 0, phase: 'battle', parts: 0, tools: [{ id: starterTool, mods: [STARTER[route]] }], shop: null, reports: [],
            ...(blueprint ? { blueprint } : {}), ...(mode !== 'normal' ? { mode } : {}),
        };
        this.pending = null;
        if (!this.save(data) && attemptId !== undefined) return;
        this.data = data;
        this.restoreBattle();
        this.resume();
    }

    get canRevive(): boolean { return this.data?.phase === 'revive'; }

    revive(runId: string, revision: number): boolean {
        const data = this.data;
        if (!data || data.phase !== 'revive' || data.runId !== runId || data.revision !== revision ||
            this.background || !this.options.offerRevive) return false;
        const { finishReason: _reason, ...rest } = data;
        if (!this.commit({ ...rest, revision: revision + 1, phase: 'battle', revived: true,
            reports: data.reports?.slice(0, -1) })) return false;
        this.restoreBattle();
        this.resume();
        return true;
    }

    declineRevive(): boolean {
        const data = this.data;
        return !!data && data.phase === 'revive' && !this.background &&
            this.commit({ ...data, revision: data.revision + 1, phase: 'lost' });
    }

    pause(): void {
        this.elapsed = 0;
        this.paused = true;
        if (this.battle) this.battle.destination = null;
    }
    resume(): void {
        this.elapsed = 0;
        if (!this.background && !this.pending) this.paused = false;
    }

    advance(dt: number, x = 0, y = 0): void {
        const battle = this.battle;
        if (!battle || this.paused || this.pending || !Number.isFinite(dt) || dt <= 0) return;
        this.elapsed = Math.min(this.elapsed + dt, STEP * 3);
        while (this.elapsed + 1e-9 >= STEP && !battle.finished) {
            battle.step(x, y);
            this.elapsed -= STEP;
        }
        if (battle.finished) this.finish(battle);
    }

    canBuy(id: OfferId, slot: number, replace?: keyof typeof MODS): boolean {
        const data = this.data;
        if (!data?.shop || data.shop.offers.indexOf(id) < 0 || data.parts < offer(id).price) return false;
        return isTool(id) ? data.tools.length < 2 && !data.tools.some((tool) => tool.id === id)
            : !!data.tools[slot] && (replace === undefined ? data.tools[slot].mods.length < 2
                : this.rules.stage === 'M2' && replace !== STARTER[data.route] && data.tools[slot].mods.indexOf(replace) >= 0);
    }

    buy(id: OfferId, slot: number, revision: number, replace?: keyof typeof MODS): boolean {
        const data = this.data;
        if (!data?.shop || data.revision !== revision || !this.canBuy(id, slot, replace) || this.background) return false;
        const tools = data.tools.map((tool) => ({ id: tool.id, mods: [...tool.mods] }));
        if (isTool(id)) tools.push({ id, mods: [] });
        else if (replace !== undefined) tools[slot].mods[tools[slot].mods.indexOf(replace)] = id;
        else tools[slot].mods.push(id);
        let offers = data.shop.offers.filter((candidate) => candidate !== id && (!isTool(candidate) || tools.length < 2));
        if (isTool(id) && data.wave === 1 && this.rules.stage === 'M1') {
            offers = nextOffers({ ...data, tools }, data.shop.refreshed, this.rules);
        }
        return this.commit({ ...data, revision: revision + 1, parts: data.parts - offer(id).price,
            tools, shop: { ...data.shop, offers } });
    }

    refresh(revision: number): boolean {
        const data = this.data;
        if (!data?.shop || data.shop.refreshed || data.revision !== revision || data.parts < REFRESH_COST || this.background) return false;
        return this.commit({ ...data, revision: revision + 1, parts: data.parts - REFRESH_COST,
            shop: { offers: nextOffers(data, true, this.rules), refreshed: true } });
    }

    nextWave(revision: number): boolean {
        const data = this.data;
        if (!data?.shop || data.revision !== revision || this.background) return false;
        if (!this.commit({ ...data, revision: revision + 1, wave: data.wave + 1, phase: 'battle', shop: null })) return false;
        this.restoreBattle();
        this.resume();
        return true;
    }

    retry(): boolean {
        if (this.background || !this.pending || !this.commit(this.pending)) return false;
        this.pending = null;
        this.battle = null;
        return true;
    }

    private restoreBattle(): void {
        const data = this.data;
        this.battle = data?.phase === 'battle' ? new Battle(data.wave, data.seed, data.tools, this.rules,
            { blueprint: data.blueprint, mode: data.mode, mission: data.mission }) : null;
        this.elapsed = 0;
    }

    private finish(battle: Battle): void {
        const data = this.data!;
        const survived = battle.player.hp > 0;
        const cleared = battle.waveCleared;
        const offerRevive = !survived && !battle.objectiveFailed && this.options.offerRevive && reviveEligible(this.rules, data);
        const phase = cleared ? (data.wave === this.rules.waves.length - 1 ? 'won' : 'shop') : offerRevive ? 'revive' : 'lost';
        const salvaged = cleared ? Math.floor(battle.parts.length * battle.salvageRate) : 0;
        const earned = cleared ? battle.collected + salvaged : 0;
        const finishReason = phase === 'won' ? 'cleared' : phase === 'shop' ? undefined : !survived ? 'defeated'
            : battle.objectiveFailed ? 'objective-failed' : 'timeout';
        const shopCredit = phase === 'shop' && data.wave === 0
            ? Math.max(0, MODS[FIRST_PAIR[data.route]].price + REFRESH_COST - data.parts - earned) : 0;
        const report: WaveReport = {
            wave: data.wave, ticks: battle.tick, kills: battle.kills, collected: battle.collected, salvaged, shopCredit,
            hits: this.rules.maxHp - battle.player.hp, triggers: { ...battle.triggers },
            defeatedBy: survived ? null : battle.lastHit,
            ...(battle.heatRecovered ? { heatRecovered: true } : {}),
        };
        const parts = data.parts + earned + shopCredit;
        const next: Checkpoint = { ...data, revision: data.revision + 1, phase, parts,
            reports: [...(data.reports ?? []), report],
            ...(cleared && battle.missionState ? { mission: battle.missionState } : {}),
            ...(data.wave === 0 && battle.moved ? { firstWaveMoved: true } : {}),
            ...(this.rules.stage === 'M2' && finishReason ? { finishReason } : {}),
            shop: phase === 'shop' ? { offers: nextOffers(data, false, this.rules), refreshed: false } : null };
        this.pause();
        if (this.commit(next)) this.battle = null;
        else this.pending = next;
    }

    private save(next: Checkpoint): boolean {
        const saved = this.platform.writeCheckpoint(CHECKPOINT_VERSION, next, (value) => validCheckpoint(value, this.rules));
        this.storageFailed = !saved;
        return saved;
    }

    private commit(next: Checkpoint): boolean {
        if (!this.save(next)) return false;
        this.data = next;
        return true;
    }
}
