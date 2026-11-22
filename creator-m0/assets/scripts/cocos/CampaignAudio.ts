import { AudioClip, AudioSource, resources } from 'cc';
import type { Node } from 'cc';

const CUES = {
    warning: { path: 'm2/warning', gain: 0.76, group: 'warning' },
    charge: { path: 'm2/charge', gain: 0.75, group: 'warning' },
    hit: { path: 'm2/hit', gain: 0.88, group: 'damage' },
    clear: { path: 'm2/clear', gain: 0.83, group: 'mission' },
    power: { path: 'campaign/power', gain: 0.78, group: 'mission' },
    cut: { path: 'campaign/cut', gain: 0.78, group: 'mission' },
    connect: { path: 'campaign/connect', gain: 0.78, group: 'mission' },
    confirm: { path: 'campaign/confirm', gain: 0.78, group: 'mission' },
    restored: { path: 'campaign/restored', gain: 0.86, group: 'mission' },
    arc: { path: 'campaign/tool-arc', gain: 0.53, group: 'tool' },
    shot: { path: 'campaign/tool-shot', gain: 0.63, group: 'tool' },
    heat: { path: 'campaign/tool-heat', gain: 0.56, group: 'tool' },
    magnet: { path: 'campaign/tool-magnet', gain: 0.55, group: 'tool' },
    induction: { path: 'campaign/tool-induction', gain: 0.56, group: 'tool' },
    projectile: { path: 'campaign/enemy-projectile', gain: 0.66, group: 'enemy' },
    melee: { path: 'campaign/enemy-melee', gain: 0.60, group: 'enemy' },
    area: { path: 'campaign/enemy-area', gain: 0.66, group: 'enemy' },
    impact: { path: 'campaign/tool-impact', gain: 0.35, group: 'impact' },
    purchase: { path: 'campaign/purchase', gain: 0.76, group: 'workshop' },
    unlock: { path: 'campaign/unlock', gain: 0.86, group: 'workshop' },
} as const;
export type Sound = keyof typeof CUES;

const HOME_CUES: readonly Sound[] = ['warning', 'purchase', 'unlock'];
const INTERVAL_MS = { warning: 180, damage: 100, mission: 160, tool: 72, enemy: 115, impact: 170, workshop: 100 };
const SCORES = {
    workshop: { path: 'campaign/night-shift', gain: 0.54 },
    combat: { path: 'campaign/live-circuit', gain: 0.40 },
} as const;
type Score = keyof typeof SCORES;
const TRACK_RETRY_MS = 650;

interface Track {
    source: AudioSource;
    requestedAt?: number;
}

export class CampaignAudio {
    private readonly effectSource: AudioSource;
    private readonly clips: Partial<Record<Sound, AudioClip>> = {};
    private readonly lastCue: Partial<Record<keyof typeof INTERVAL_MS, number>> = {};
    private readonly tracks: Partial<Record<Score, Track>> = {};
    private active?: Score;
    private activated: boolean;
    private combatPrepared = false;
    private disposed = false;

    constructor(node: Node, private readonly campaign: boolean, waitsForGesture: boolean,
        private readonly retry: (action: () => void) => void) {
        this.activated = !waitsForGesture;
        this.effectSource = node.addComponent(AudioSource);
        this.effectSource.playOnAwake = false;
        if (campaign) {
            for (const key of Object.keys(SCORES) as Score[]) {
                const source = node.addComponent(AudioSource);
                source.playOnAwake = false;
                source.loop = true;
                source.volume = 0;
                this.tracks[key] = { source };
            }
            this.loadScore('workshop');
            for (const key of HOME_CUES) this.loadCue(key);
        } else {
            for (const key of Object.keys(CUES) as Sound[]) {
                if (CUES[key].path.startsWith('m2/')) this.loadCue(key);
            }
        }
    }

    prepareCombat(): void {
        if (!this.campaign || this.combatPrepared || this.disposed) return;
        this.combatPrepared = true;
        this.loadScore('combat');
        for (const key of Object.keys(CUES) as Sound[]) {
            if (!HOME_CUES.includes(key)) this.loadCue(key);
        }
    }

    private loadScore(key: Score): void {
        const track = this.tracks[key]!;
        this.load(SCORES[key].path, clip => {
            track.source.clip = clip;
            this.startTrack(key);
        });
    }

    private loadCue(key: Sound): void {
        this.load(CUES[key].path, clip => { this.clips[key] = clip; });
    }

    private load(path: string, accept: (clip: AudioClip) => void, canRetry = true): void {
        resources.load(path, AudioClip, (error, clip) => {
            if (this.disposed) return;
            if (!error) accept(clip);
            else if (canRetry) this.retry(() => { if (!this.disposed) this.load(path, accept, false); });
        });
    }

    private startTrack(score: Score, gesture = false): void {
        const track = this.tracks[score];
        if (!track?.source.clip || this.active !== score || !this.activated || track.source.playing) return;
        if (track.requestedAt !== undefined && (!gesture || Date.now() - track.requestedAt < TRACK_RETRY_MS)) return;
        track.source.volume = SCORES[score].gain;
        track.requestedAt = Date.now();
        track.source.play();
    }

    syncMusic(score: Score | undefined, gesture = false): void {
        if (gesture) this.activated = true;
        if (this.active !== score) {
            const old = this.active && this.tracks[this.active];
            if (old) {
                // Mute immediately if the engine still has a pending asynchronous play operation.
                old.source.volume = 0;
                if (old.requestedAt !== undefined) old.source.pause();
                old.requestedAt = undefined;
            }
            this.active = score;
        }
        if (score === 'combat') this.prepareCombat();
        if (score) this.startTrack(score, gesture);
    }

    play(sound: Sound): void {
        const clip = this.clips[sound];
        if (!clip || !this.activated) return;
        const { gain, group } = CUES[sound];
        const now = Date.now();
        if (now - (this.lastCue[group] ?? -Infinity) < INTERVAL_MS[group]) return;
        this.lastCue[group] = now;
        this.effectSource.playOneShot(clip, this.campaign ? gain : 0.45);
    }

    get musicPlaying(): boolean {
        return !!this.active && !!this.tracks[this.active]?.source.playing;
    }

    get musicPosition(): number {
        return this.active ? this.tracks[this.active]?.source.currentTime ?? 0 : 0;
    }

    get musicTrack(): Score | undefined {
        return this.active;
    }

    dispose(): void {
        this.disposed = true;
        this.syncMusic(undefined);
    }
}
