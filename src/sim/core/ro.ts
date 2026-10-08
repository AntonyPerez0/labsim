/**
 * Read-only access to (possibly drafted) lab state for the per-sub-step systems.
 *
 * Why: immer creates a child draft — and shallow-copies the parent — the first time a nested object is
 * READ through a draft. A tick that merely inspects every rig, host and device would therefore copy
 * most of the lab each sub-step. The systems read through `ro()` (the draft's current copy, or its
 * base when untouched — identical values, no new drafts) and write through the draft only when a value
 * actually changes, so an idle lab costs almost nothing per tick (Sim §6.2 performance budget).
 *
 * Contract: NEVER write through a value obtained from `ro()` (it may be committed, frozen state).
 * Nested values may themselves be drafts — call `ro()` again when descending. Outside a transaction
 * (plain labs while presets are built) `ro()` is the identity.
 */
const DRAFT_STATE = Symbol.for('immer-state');

interface DraftState {
  copy_?: unknown;
  base_: unknown;
}

export function ro<T>(x: T): T {
  if (x === null || typeof x !== 'object') return x;
  const st = (x as unknown as Record<symbol, DraftState | undefined>)[DRAFT_STATE];
  return st ? ((st.copy_ || st.base_) as T) : x;
}

/** `ro(ro(obj)[key])` — one read-only step down a record. */
export function roAt<T>(rec: Record<string, T> | Record<number, T>, key: string | number): T | undefined {
  return ro((ro(rec) as Record<string | number, T>)[key]);
}
