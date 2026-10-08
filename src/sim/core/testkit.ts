/**
 * Test helpers for the sim-core vitest suites (not used by the game). Every helper goes through the
 * public SimApi and reads committed state, exactly like the world/apps would.
 */
import { getState } from '@/core/store';
import { bus } from '@/core/bus';
import type { EventMap } from '@/core/events';
import { sim } from '../impl';
import type { LabState } from '../types';

export const lab = (): LabState => getState().lab;

/** Fresh deterministic lab (Sim §6.5 `test` preset). */
export function fresh(preset = 'test', seed = 20261005): void {
  sim.reset({ preset, seed });
}

/** Advance `ms` of physical time at the current time scale (game = phys × scale). */
export function run(ms: number): void {
  const scale = lab().time.timeScale;
  let left = ms;
  while (left > 0) {
    const step = Math.min(left, 1_000);
    sim.tick(step * scale);
    left -= step;
  }
}

/** Advance until `pred` holds (checks every 50 ms physical), at most `maxMs`. Returns elapsed ms or -1. */
export function runUntil(pred: () => boolean, maxMs = 120_000): number {
  const scale = lab().time.timeScale;
  for (let t = 0; t <= maxMs; t += 50) {
    if (pred()) return t;
    sim.tick(50 * scale);
  }
  return pred() ? maxMs : -1;
}

/** Collect events of one type while `fn` runs. */
export function collect<K extends keyof EventMap>(type: K, fn: () => void): EventMap[K][] {
  const out: EventMap[K][] = [];
  const off = bus.on(type as never, ((p: EventMap[K]) => out.push(p)) as never);
  try {
    fn();
  } finally {
    off();
  }
  return out;
}

export const robot = (name: string) => Object.values(lab().orca.robots).find((r) => r.name === name)!;
export const device = (id: string) => lab().devices[id]!;
export const host = (id: string) => lab().hosts[id]!;
export const rig = (id: string) => lab().rigs[id]!;

/** Run the health check now (Sim §6.3 runHealthCheckNow) and return the newest log block. */
export function healthCheck(): string[] {
  sim.orca.runHealthCheckNow();
  const log = lab().orca.healthCheck.log;
  return log[log.length - 1]!.lines;
}

export { sim };
