/**
 * Mission runtime singleton — the non-serialisable half of the runtime (event log, condition scopes,
 * compiled definitions with closures, script queues). Everything the UI reads lives in the store
 * (`session`, `ui`, `progress`); this module only holds what cannot (functions, matchers) or need not
 * (event history) be stored there. It is reset at every activity start (`resetRuntime`).
 */
import type { EventMap } from '@/core/events';
import type { EventName } from '@/core/bus';
import type { RngState } from '@/core/rng';
import { createRngState } from '@/core/rng';
import { emit } from '@/core/store';

declare module '@/core/events' {
  interface EventMap {
    /**
     * Internal marker pair bracketing events the mission runtime causes on its own behalf (fault injection,
     * setup ops, Jared's fixes). Events are flushed after their transaction commits, so the bracket travels
     * through the same queue and tags everything between `on: true` and `on: false` as runtime-driven.
     */
    'missions.runtimeScope': { on: boolean };
  }
}

/** One bus event as seen by the runtime. */
export interface LogEntry {
  seq: number;
  type: EventName;
  payload: unknown;
  /** Game ms. */
  atMs: number;
  /** Session real seconds. */
  atS: number;
  /** Emitted while the runtime itself was driving the sim (scripted NPC fixes, fault injection). */
  suppressed: boolean;
}

const LOG_CAP = 8000;

export const RT = {
  /** Event log of the current activity (bounded). */
  log: [] as LogEntry[],
  /** Next sequence number (monotonic across activities). */
  seq: 1,
  /** First seq of the current activity. */
  activityStartSeq: 1,
  /**
   * > 0 while the runtime drives the sim on its own behalf (fault injection, Jared's fix, setup ops):
   * events emitted meanwhile are tagged `suppressed` so global-wrong-action detection ignores them.
   */
  gwSuppress: 0,
  /** Open `missions.runtimeScope` brackets seen on the bus (events between them are runtime-driven). */
  flushSuppress: 0,
  /** Mission RNG (shift spawns, drill draws, exam draws). Seeded per activity. */
  rng: createRngState(1) as RngState,
  /** `missions.tick` was called by the game loop (disables the fallback driver). */
  externalTick: false,
  externalFrame: false,
  initialized: false,
  /** Per-activity reset hooks registered by feature modules. */
  resetHooks: [] as (() => void)[],
};

export function onActivityReset(fn: () => void): void {
  RT.resetHooks.push(fn);
}

/** Clear per-activity runtime state (called by `beginActivity`). */
export function resetRuntime(seed: number): void {
  RT.log = [];
  RT.activityStartSeq = RT.seq;
  RT.gwSuppress = 0;
  RT.flushSuppress = 0;
  RT.rng = createRngState(seed >>> 0 || 1);
  for (const fn of RT.resetHooks) {
    try {
      fn();
    } catch (err) {
      console.error('[missions] reset hook threw', err);
    }
  }
}

export function appendLog(type: EventName, payload: unknown, atMs: number, atS: number, suppressed: boolean = RT.flushSuppress > 0): LogEntry {
  const entry: LogEntry = { seq: RT.seq++, type, payload, atMs, atS, suppressed };
  RT.log.push(entry);
  if (RT.log.length > LOG_CAP) RT.log.splice(0, RT.log.length - LOG_CAP);
  return entry;
}

/** Log entries with `seq >= fromSeq`. */
export function entriesSince(fromSeq: number): LogEntry[] {
  const log = RT.log;
  if (!log.length || log[log.length - 1]!.seq < fromSeq) return [];
  // Binary search the first index with seq >= fromSeq.
  let lo = 0;
  let hi = log.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (log[mid]!.seq < fromSeq) lo = mid + 1;
    else hi = mid;
  }
  return log.slice(lo);
}

/** Run `fn` while tagging the events it causes as runtime-driven (no GW detection, no player credit). */
export function asRuntime<T>(fn: () => T): T {
  RT.gwSuppress++;
  if (RT.gwSuppress === 1) emit('missions.runtimeScope', { on: true });
  try {
    return fn();
  } finally {
    if (RT.gwSuppress === 1) emit('missions.runtimeScope', { on: false });
    RT.gwSuppress--;
  }
}

/** Bus listener hook: track the runtime-scope brackets. Returns true for the marker event itself. */
export function trackRuntimeScope(type: string, payload: unknown): boolean {
  if (type !== 'missions.runtimeScope') return false;
  RT.flushSuppress = Math.max(0, RT.flushSuppress + ((payload as { on: boolean }).on ? 1 : -1));
  return true;
}

export function payloadOf<K extends EventName>(entry: LogEntry, _type: K): EventMap[K] {
  return entry.payload as EventMap[K];
}
