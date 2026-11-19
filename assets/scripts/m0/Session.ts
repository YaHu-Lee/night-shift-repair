import { StressWorld } from '../core/StressWorld';
import { makePlatform } from '../platform/platform';

export class Session {
  readonly platform = makePlatform();
  readonly seed = 20261119;
  world = new StressWorld(this.seed);
  paused = false;
  background = false;
  x = 0;
  y = 0;
  checkpointOk: boolean | null = null;
  hits = 0;
  private budget = 0;
  private removers: Array<() => void>;

  constructor() {
    this.load();
    this.removers = [this.platform.onHide(() => { this.background = true; this.pause(); }), this.platform.onShow(() => { this.background = false; this.pause(); })];
  }
  dispose() { for(const fn of this.removers) fn(); }
  pause() { this.paused = true; this.resetInput(); }
  resume() { if (!this.background) {this.resetInput(); this.paused = false;} }
  resetInput() { this.budget = 0; this.x = 0; this.y = 0; }
  restart() { this.world = new StressWorld(this.seed); this.pause(); }
  save() { this.checkpointOk = this.platform.writeCheckpoint(1, {seed:this.seed}); return this.checkpointOk; }
  load() {
    const saved = this.platform.readCheckpoint<{seed:number}>(1, (value) => typeof value === 'object' && value !== null && 'seed' in value && value.seed === this.seed);
    if (!saved) return false;
    this.restart(); return true;
  }
  advance(dt: number) {
    if (this.paused || !Number.isFinite(dt) || dt <= 0) return;
    const step = 1 / 30;
    this.budget = Math.min(this.budget + dt, step * 3);
    while (this.budget + 1e-9 >= step) { this.world.step(this.x, this.y); this.budget -= step; }
  }
}
