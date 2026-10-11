/**
 * Main loop: fixed-step simulation (SIM_HZ) decoupled from rendering (requestAnimationFrame).
 *
 * - `simulate(dtGameMs)` is called 0..N times per frame with a constant real-time step,
 *   scaled by the game time scale. It is skipped entirely while the game is paused.
 * - `render(dtRealSeconds, alpha)` is called once per animation frame — or less often under a frame-rate
 *   cap (`minFrameMs`): animation frames that come too early are skipped entirely (no sim step, no
 *   render), and the skipped time is carried into the next frame, so the sim clock stays exact.
 * - While the page is hidden the loop stops (no rAF, no sim) and resumes without a catch-up spike.
 */
export const SIM_HZ = 20;
export const SIM_STEP_MS = 1000 / SIM_HZ;
const MAX_STEPS_PER_FRAME = 8;

export interface LoopCallbacks {
  /** Advance the simulation by `dtGameMs` of game time. */
  simulate(dtGameMs: number): void;
  /** Draw a frame. `alpha` is the interpolation factor between the last two sim steps. */
  render(dtRealSeconds: number, alpha: number): void;
  /** Current time scale (game ms per real ms). 0 or `paused` stops the sim. */
  timeScale(): number;
  paused(): boolean;
  /** Minimum ms between rendered frames (frame-rate cap); 0 or absent = every animation frame. */
  minFrameMs?(): number;
}

/** Tolerance so a 30 fps cap on a 60 Hz display renders every 2nd vsync even with jitter. */
const CAP_SLACK_MS = 2;

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  /** Frames per second over the last full one-second window (an honest count, not a 1/dt average). */
  fps = 60;
  private winStart = 0;
  private winFrames = 0;
  private hidden = false;
  private visOff: (() => void) | null = null;
  /** Frame-cap phase anchor (ms): the ideal time of the last rendered frame. */
  private capAnchor = 0;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.capAnchor = this.last;
    if (typeof document !== 'undefined' && !this.visOff) {
      const onVis = () => this.setHidden(document.visibilityState === 'hidden');
      document.addEventListener('visibilitychange', onVis);
      this.visOff = () => document.removeEventListener('visibilitychange', onVis);
      this.hidden = document.visibilityState === 'hidden';
    }
    if (!this.hidden) this.raf = requestAnimationFrame(this.frame);
  }

  /** Background tab: stop requesting frames (saves battery even where rAF isn't throttled). */
  private setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (!this.running) return;
    if (hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      this.last = performance.now();
      this.capAnchor = this.last;
      this.acc = 0;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  private readonly frame = (now: number): void => {
    if (!this.running || this.hidden) return;
    this.raf = requestAnimationFrame(this.frame);
    const cap = this.cb.minFrameMs?.() ?? 0;
    if (cap > 0) {
      const since = now - this.capAnchor;
      if (since < cap - CAP_SLACK_MS) return; // too early: skip this vsync (time carries over)
      // Keep the phase (no drift on 120/144 Hz displays); re-anchor after long stalls.
      this.capAnchor = since > cap * 3 ? now : this.capAnchor + cap * Math.floor((since + CAP_SLACK_MS) / cap);
    } else {
      this.capAnchor = now;
    }
    let dt = now - this.last;
    this.last = now;
    if (dt > 250) dt = 250; // tab was hidden; don't spiral
    this.winFrames++;
    if (now - this.winStart >= 1000) {
      if (this.winStart > 0) this.fps = (this.winFrames * 1000) / (now - this.winStart);
      this.winStart = now;
      this.winFrames = 0;
    }

    if (!this.cb.paused()) {
      this.acc += dt;
      let steps = 0;
      const scale = this.cb.timeScale();
      while (this.acc >= SIM_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
        this.cb.simulate(SIM_STEP_MS * scale);
        this.acc -= SIM_STEP_MS;
        steps++;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.acc = 0;
    } else {
      this.acc = 0;
    }
    this.cb.render(dt / 1000, this.acc / SIM_STEP_MS);
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.visOff?.();
    this.visOff = null;
  }

  /** Run the simulation forward synchronously (tests, "fast-forward to next health check"). */
  advance(gameMs: number): void {
    let left = gameMs;
    while (left > 0) {
      const step = Math.min(SIM_STEP_MS, left);
      this.cb.simulate(step);
      left -= step;
    }
  }
}
