import { Battle } from './Battle';
import type { HitSource } from './Battle';
import {
    FIRST_PAIR, M1_RULES, MODS, REFRESH_COST, RUN_SEED, STARTER, TICK_RATE,
    hasPair, isMod, isTool, offer, randomStream,
} from './content';
import type { EquippedTool, OfferId, Route, RunRules } from './content';
import { makePlatform } from '../platform/platform';
import type { Platform } from '../platform/platform';

const CHECKPOINT_VERSION = 1;
const STEP = 1 / TICK_RATE;
type Phase = 'battle' | 'shop' | 'won' | 'lost';
interface Shop { offers: OfferId[]; refreshed: boolean }
export type FinishReason = 'cleared' | 'defeated' | 'timeout';
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
            || [null, 'crawler', 'charger', 'turret', 'armored', 'inspector', 'projectile', 'boss-sweep', 'boss-charge']
                .indexOf(report.defeatedBy) < 0) return false;
        previous = report.wave;
    }
    return true;
}

function validCheckpoint(value: unknown, rules: RunRules): value is Checkpoint {
    if (!value || typeof value !== 'object') return false;
    const data = value as Checkpoint;
    if (data.schemaVersion !== CHECKPOINT_VERSION || data.contentVersion !== rules.contentVersion
        || typeof data.runId !== 'string' || !data.runId || data.runId.length > 80
        || !integer(data.revision, 1, Number.MAX_SAFE_INTEGER - 1)
        || !integer(data.seed, 0, 0xffffffff) || !integer(data.parts, 0, 10000)
        || !integer(data.wave, 0, rules.waves.length - 1) || (data.route !== 'arc' && data.route !== 'magnet')
        || ['battle', 'shop', 'won', 'lost'].indexOf(data.phase) < 0
        || !Array.isArray(data.tools) || data.tools.length < 1 || data.tools.length > 2
        || data.tools[0]?.id !== 'wrench') return false;
    const installed = new Set<string>();
    const slots = new Set<string>();
    for (const tool of data.tools) {
        if (!tool || typeof tool.id !== 'string' || rules.tools.indexOf(tool.id) < 0 || slots.has(tool.id)
            || !Array.isArray(tool.mods) || tool.mods.length > 2) return false;
        slots.add(tool.id);
        for (const mod of tool.mods) {
            if (typeof mod !== 'string' || rules.mods.indexOf(mod) < 0 || installed.has(mod)) return false;
            installed.add(mod);
        }
    }
    if (!installed.has(STARTER[data.route]) || !validReports(data, rules)) return false;
    const reason = data.finishReason;
    if (reason !== undefined && !(
        (data.phase === 'won' && reason === 'cleared')
        || (data.phase === 'lost' && (reason === 'defeated' || (reason === 'timeout' && rules.waves[data.wave].boss)))
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

function nextOffers(data: Checkpoint, refreshed: boolean, rules: RunRules): OfferId[] {
    const installed = new Set<OfferId>();
    for (const tool of data.tools) for (const id of tool.mods) installed.add(id);
    const mods = rules.mods.filter((id) => !installed.has(id));
    const tools = rules.tools.filter((id) =>
        data.tools.length < 2 && !data.tools.some((tool) => tool.id === id));
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

    constructor(platform?: Platform, readonly rules: RunRules = M1_RULES) {
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

    start(route: Route, seed = RUN_SEED): void {
        const data: Checkpoint = {
            schemaVersion: CHECKPOINT_VERSION, contentVersion: this.rules.contentVersion,
            runId: `${Date.now()}-${++this.nonce}`, revision: 1, seed: seed >>> 0,
            route, wave: 0, phase: 'battle', parts: 0, tools: [{ id: 'wrench', mods: [STARTER[route]] }], shop: null, reports: [],
        };
        this.pending = null;
        this.save(data);
        this.data = data;
        this.restoreBattle();
        this.resume();
    }

    pause(): void { this.elapsed = 0; this.paused = true; }
    resume(): void {
        this.elapsed = 0;
        if (!this.background && !this.pending) this.paused = false;
    }

    advance(dt: number, x: number, y: number): void {
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
        this.battle = data?.phase === 'battle' ? new Battle(data.wave, data.seed, data.tools, this.rules) : null;
        this.elapsed = 0;
    }

    private finish(battle: Battle): void {
        const data = this.data!;
        const survived = battle.player.hp > 0;
        const cleared = survived && (!battle.boss || battle.bossDefeated);
        const phase = cleared ? (data.wave === this.rules.waves.length - 1 ? 'won' : 'shop') : 'lost';
        const salvaged = cleared ? Math.floor(battle.parts.length * battle.salvageRate) : 0;
        const earned = cleared ? battle.collected + salvaged : 0;
        const finishReason = phase === 'won' ? 'cleared' : phase === 'lost' ? (survived ? 'timeout' : 'defeated') : undefined;
        const shopCredit = phase === 'shop' && data.wave === 0
            ? Math.max(0, MODS[FIRST_PAIR[data.route]].price + REFRESH_COST - data.parts - earned) : 0;
        const report: WaveReport = {
            wave: data.wave, ticks: battle.tick, kills: battle.kills, collected: battle.collected, salvaged, shopCredit,
            hits: this.rules.maxHp - battle.player.hp, triggers: { ...battle.triggers },
            defeatedBy: survived ? null : battle.lastHit,
        };
        const parts = data.parts + earned + shopCredit;
        const next: Checkpoint = { ...data, revision: data.revision + 1, phase, parts,
            reports: [...(data.reports ?? []), report],
            ...(this.rules.stage === 'M2' && finishReason ? { finishReason } : {}),
            shop: phase === 'shop' ? { offers: nextOffers(data, false, this.rules), refreshed: false } : null };
        this.pause();
        if (this.commit(next)) this.battle = null;
        else this.pending = next;
    }

    private save(next: Checkpoint): boolean {
        const saved = this.platform.writeCheckpoint(CHECKPOINT_VERSION, next);
        this.storageFailed = !saved;
        return saved;
    }

    private commit(next: Checkpoint): boolean {
        if (!this.save(next)) return false;
        this.data = next;
        return true;
    }
}
