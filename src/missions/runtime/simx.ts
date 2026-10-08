/**
 * Guarded access to the simulation API. The mission runtime must never crash because a sim method is
 * missing (the sim is built in parallel) or throws — every call goes through `simCall`, which logs once
 * per label and returns a fallback. `simRun` additionally tags the events it causes as runtime-driven
 * (no global-wrong-action detection, see `asRuntime`).
 */
import { sim } from '@/sim';
import type { SimApi, ScenarioItem, Result } from '@/sim/api';
import { asRuntime } from './rt';

const warned = new Set<string>();

function warnOnce(label: string, err: unknown): void {
  if (warned.has(label)) return;
  warned.add(label);
  console.warn(`[missions] sim call "${label}" failed:`, err instanceof Error ? err.message : err);
}

export function simCall<T>(label: string, fn: (s: SimApi) => T, fallback: T): T {
  try {
    return fn(sim);
  } catch (err) {
    warnOnce(label, err);
    return fallback;
  }
}

/** A sim call made by the runtime on its own behalf (setup, NPC fixes): events are not attributed to the player. */
export function simRun<T>(label: string, fn: (s: SimApi) => T, fallback: T): T {
  return asRuntime(() => simCall(label, fn, fallback));
}

const FAIL: Result<never> = { ok: false, error: 'sim unavailable' };

/** Apply a scenario (faults + setup ops) atomically; falls back to item-by-item when `injectAll` is missing. */
export function injectScenario(items: readonly ScenarioItem[]): { ok: boolean; instanceIds: string[]; error: string | null } {
  if (!items.length) return { ok: true, instanceIds: [], error: null };
  return asRuntime(() => {
    try {
      if (typeof sim.faults.injectAll === 'function') {
        const r = sim.faults.injectAll([...items]);
        return r.ok ? { ok: true, instanceIds: r.value.instanceIds, error: null } : { ok: false, instanceIds: [], error: r.error };
      }
    } catch (err) {
      warnOnce('faults.injectAll', err);
    }
    const ids: string[] = [];
    for (const item of items) {
      const r: Result<unknown> = simCall(
        'faults.inject',
        (s) => ('faultId' in item ? s.faults.inject(item) : s.faults.applySetup(item)),
        FAIL,
      );
      if (!r.ok) return { ok: false, instanceIds: ids, error: r.error };
      const v = r.value as { instanceId?: string } | undefined;
      if (v?.instanceId) ids.push(v.instanceId);
    }
    return { ok: true, instanceIds: ids, error: null };
  });
}

export { sim };
