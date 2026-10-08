/**
 * Safe access to the mission runtime for the UI.
 *
 * The runtime may not be implemented yet (the stub throws on most methods) or may fail on a given
 * call; the UI must never crash because of it. Two helpers:
 *
 *  - `mq(name, args, fallback)`  — query: returns the runtime's answer or `fallback` on any error.
 *  - `ma(name, ...args)`         — action: returns the runtime's result, or `undefined` after
 *                                  showing a single "coming soon" toast for that method.
 *
 * The sandbox page (and tests) can override individual methods with `setMissionsOverride()`.
 */
import { missions } from '@/missions';
import type { MissionsApi } from '@/missions';
import { pushToast } from './toasts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;
type Api = { [K in keyof MissionsApi]-?: NonNullable<MissionsApi[K]> };
export type MissionMethod = { [K in keyof Api]: Api[K] extends AnyFn ? K : never }[keyof Api];
type Args<K extends MissionMethod> = Parameters<Api[K]>;
type Ret<K extends MissionMethod> = ReturnType<Api[K]>;

let override: Partial<MissionsApi> = {};
let runtimeEnabled = true;

/** Tests / sandbox: ignore the real runtime (only overrides answer). */
export function setMissionsRuntimeEnabled(enabled: boolean): void {
  runtimeEnabled = enabled;
}
const warned = new Set<string>();

/** Replace individual runtime methods (sandbox / tests). Pass `{}` to clear. */
export function setMissionsOverride(o: Partial<MissionsApi>): void {
  override = o;
}

function resolve<K extends MissionMethod>(name: K): Api[K] | null {
  const o = override[name];
  if (typeof o === 'function') return o as Api[K];
  if (!runtimeEnabled) return null;
  try {
    const f = (missions as Api)[name];
    return typeof f === 'function' ? (f.bind(missions) as Api[K]) : null;
  } catch {
    return null;
  }
}

/** True when the runtime (or an override) provides `name` (the stub reports false for most methods). */
export function hasMission(name: MissionMethod): boolean {
  return resolve(name) !== null;
}

/** Query with a fallback. Never throws. */
export function mq<K extends MissionMethod>(name: K, args: Args<K>, fallback: Ret<K>): Ret<K> {
  const f = resolve(name);
  if (!f) return fallback;
  try {
    const r = (f as AnyFn)(...args) as Ret<K>;
    return r === undefined ? fallback : r;
  } catch (err) {
    if (!warned.has(`q:${name}`)) {
      warned.add(`q:${name}`);
      console.warn(`[ui] missions.${String(name)} unavailable — using fallback`, err);
    }
    return fallback;
  }
}

/**
 * Action. Returns the runtime's return value, or `undefined` when it is unavailable/failed (a
 * "coming soon" toast is shown, once per method per session unless `quiet`).
 */
export function ma<K extends MissionMethod>(name: K, ...args: Args<K>): Ret<K> | undefined {
  return maOpts(name, { quiet: false }, ...args);
}

/** Like `ma` but without the toast (for best-effort calls with a UI-side fallback). */
export function maQuiet<K extends MissionMethod>(name: K, ...args: Args<K>): Ret<K> | undefined {
  return maOpts(name, { quiet: true }, ...args);
}

function maOpts<K extends MissionMethod>(name: K, opts: { quiet: boolean }, ...args: Args<K>): Ret<K> | undefined {
  const f = resolve(name);
  const fail = (err: unknown, missing: boolean) => {
    if (!warned.has(`a:${name}`)) {
      warned.add(`a:${name}`);
      console.warn(`[ui] missions.${String(name)} failed`, err);
      if (!opts.quiet) {
        if (missing) pushToast({ kind: 'info', title: 'Coming soon', body: comingSoonText(name), icon: 'rocket' });
        else pushToast({ kind: 'error', title: 'That did not work', body: err instanceof Error ? err.message : String(err) });
      }
    }
    return undefined;
  };
  if (!f) return fail(new Error('not implemented'), true);
  try {
    return (f as AnyFn)(...args) as Ret<K>;
  } catch (err) {
    return fail(err, false);
  }
}

function comingSoonText(name: string): string {
  if (/Academy|Dialogue|Hint|showMe|fastForward|restart/i.test(name)) return 'The Academy lesson runtime is still being installed in the lab.';
  if (/Shift|Daily|WeakSpot|Ticket|ticket|escalate|resolve|reply|fileBug|submitTask|callRootCause/i.test(name)) return 'The Arcade shift runtime is still being wired up.';
  if (/Drill/i.test(name)) return 'This drill is still on the workbench.';
  if (/Freeplay|Fault|Sandbox|Snapshot|resetLab/i.test(name)) return 'Free Play controls are still being wired up.';
  if (/Cert|Written|Practical/i.test(name)) return 'Certification exams open once the exam runtime lands.';
  if (/Flashcard/i.test(name)) return 'Leitner reviews are being set up — practice mode only for now.';
  return 'This part of the lab is still being built.';
}
