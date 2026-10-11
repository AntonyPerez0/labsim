import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameLoop, SIM_STEP_MS } from './loop';

/** Drive the loop with a fake rAF at a fixed display rate. */
function harness(capMs: number) {
  const queue: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => (queue.push(cb), queue.length));
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  let renders = 0;
  let simMs = 0;
  const loop = new GameLoop({
    simulate: (dt) => (simMs += dt),
    render: () => renders++,
    timeScale: () => 1,
    paused: () => false,
    minFrameMs: () => capMs,
  });
  loop.start();
  const run = (vsyncMs: number, frames: number) => {
    for (let i = 1; i <= frames; i++) {
      const cb = queue.shift();
      cb?.(i * vsyncMs);
    }
  };
  return { run, stats: () => ({ renders, simMs }), loop };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GameLoop frame-rate cap', () => {
  it('renders every frame without a cap', () => {
    const h = harness(0);
    h.run(1000 / 60, 60);
    expect(h.stats().renders).toBe(60);
  });

  it('30 fps cap on a 60 Hz display renders every second vsync, sim time stays exact', () => {
    const h = harness(1000 / 30);
    h.run(1000 / 60, 120); // 2 s
    expect(h.stats().renders).toBeGreaterThanOrEqual(59);
    expect(h.stats().renders).toBeLessThanOrEqual(61);
    // 2 s of real time → 2 s of game time (within one sim step)
    expect(Math.abs(h.stats().simMs - 2000)).toBeLessThanOrEqual(SIM_STEP_MS);
    h.loop.stop();
  });

  it('60 fps cap on a 144 Hz display averages ~60 fps', () => {
    const h = harness(1000 / 60);
    h.run(1000 / 144, 288); // 2 s
    expect(h.stats().renders).toBeGreaterThanOrEqual(115);
    expect(h.stats().renders).toBeLessThanOrEqual(125);
    h.loop.stop();
  });
});
