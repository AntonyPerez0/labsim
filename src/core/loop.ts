/**
 * Main loop: fixed-step simulation (SIM_HZ) decoupled from rendering (requestAnimationFrame).
 *
 * - `simulate(dtGameMs)` is called 0..N times per frame with a constant real-time step,
 *   scaled by the game time scale. It is skipped entirely while the game is paused.
 * - `render(dtRealSeconds, alpha)` is called once per animation frame.
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
}

export class GameLoop {
  private raf = 0;
  private last = 0;
  private acc = 0;
  private running = false;
  /** Smoothed frames-per-second, for the HUD/debug overlay and auto quality. */
  fps = 60;

  constructor(private readonly cb: LoopCallbacks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const frame = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(frame);
      let dt = now - this.last;
      this.last = now;
      if (dt > 250) dt = 250; // tab was hidden; don't spiral
      if (dt > 0) this.fps = this.fps * 0.95 + (1000 / dt) * 0.05;

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
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
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
