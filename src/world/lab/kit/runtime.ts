/**
 * Runtime glue for lab interactions: toasts, safe sim calls (the sim may still be a stub or miss
 * a proposed §9.6 method), inventory fallbacks, and the verb picker that turns a list of verb
 * definitions into the engine's `InteractVerb[]` (one verb per key, chosen by the active tool).
 */
import { emit, mutate, store } from '@/core/store';
import type { ToolId } from '@/core/state';
import type { InteractVerb } from '@/engine/types';
import type { Result } from '@/sim/api';

let toastSeq = 0;

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export function toast(kind: ToastKind, title: string, body?: string): void {
  mutate((s) => {
    toastSeq++;
    s.ui.toasts.push({ id: `lab-${Date.now().toString(36)}-${toastSeq}`, kind, title, ...(body ? { body } : {}), createdAtMs: s.lab.time.nowMs });
    if (s.ui.toasts.length > 12) s.ui.toasts.splice(0, s.ui.toasts.length - 12);
  });
}

/** Show inspect callouts (≤ 4 lines, 4 s) like hold-RMB inspect does. */
export function showCallouts(propId: string, lines: string[]): void {
  if (!lines.length) return;
  mutate((s) => {
    s.ui.callouts = { propId, lines: lines.slice(0, 4), untilS: s.session.clockS + 4 };
  });
  emit('player.calloutsShown', { propId, lines: lines.slice(0, 4) });
}

const warnedMissing = new Set<string>();

function isNotImplemented(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not implemented|is not a function|undefined/i.test(msg);
}

/**
 * Call the sim. Returns the result, or null when the method is missing / not implemented (shown
 * once as a toast). `ok: false` results surface their error text as a toast (the real tool's
 * message) unless `quiet`.
 */
export function simCall<T = undefined>(what: string, fn: () => Result<T> | undefined | void, quiet = false): Result<T> | null {
  let r: Result<T> | undefined | void;
  try {
    r = fn();
  } catch (err) {
    if (isNotImplemented(err)) {
      if (!warnedMissing.has(what)) {
        warnedMissing.add(what);
        console.warn(`[world-lab] ${what}: sim call unavailable`, err);
      }
      if (!quiet) toast('warning', 'Not wired yet', `${what} — the simulation does not model this yet.`);
      return null;
    }
    console.error(`[world-lab] ${what} threw`, err);
    if (!quiet) toast('error', what, err instanceof Error ? err.message : String(err));
    return null;
  }
  if (r && typeof r === 'object' && 'ok' in r) {
    if (!r.ok && !quiet) toast('error', what, r.error);
    return r;
  }
  return { ok: true, value: undefined as T };
}

/** Call a sim method that may not exist yet (proposed §9.6 / sim-doc API). */
export function simOptional<T = undefined>(what: string, obj: unknown, method: string, args: unknown[], quiet = false): Result<T> | null {
  const target = obj as Record<string, unknown> | null | undefined;
  const fn = target?.[method];
  if (typeof fn !== 'function') {
    if (!quiet) toast('warning', 'Not wired yet', `${what} — the simulation does not model this yet.`);
    return null;
  }
  return simCall<T>(what, () => (fn as (...a: unknown[]) => Result<T>).apply(target, args), quiet);
}

export function activeTool(): ToolId {
  return store.getState().session.activeTool;
}

export function hasTool(t: ToolId): boolean {
  return store.getState().session.inventory.includes(t);
}

/* ───────────────────────────── verb picking ───────────────────────────── */

export interface VerbDef {
  key: 'E' | 'R' | 'G';
  label: string;
  /** Tool(s) that must be active; the verb only wins its key while one of them is held. */
  tool?: ToolId | readonly ToolId[];
  /** Return a reason string to show the verb greyed out, or null when usable. */
  blocked?: () => string | null;
  /** Hide entirely when false. */
  show?: () => boolean;
  run(): void;
}

function toolList(t: VerbDef['tool']): ToolId[] {
  if (!t) return [];
  return Array.isArray(t) ? [...t] : [t as ToolId];
}

/**
 * Resolve verb definitions into engine verbs: per key, a tool verb whose tool is active wins;
 * otherwise the plain verb; if only tool verbs exist for a key, the first is shown as "needs …".
 */
export function pickVerbs(defs: readonly VerbDef[]): InteractVerb[] {
  const tool = activeTool();
  const out: InteractVerb[] = [];
  for (const key of ['E', 'R', 'G'] as const) {
    const cands = defs.filter((d) => d.key === key && (d.show ? d.show() : true));
    if (!cands.length) continue;
    const withTool = cands.find((d) => toolList(d.tool).includes(tool));
    const plain = cands.find((d) => !d.tool);
    const chosen = withTool ?? plain ?? cands[0]!;
    const reason = chosen.blocked ? chosen.blocked() : null;
    const tools = toolList(chosen.tool);
    const v: InteractVerb = {
      key,
      label: reason ? `${chosen.label} — ${reason}` : chosen.label,
      run: chosen.run,
    };
    if (reason) v.disabled = true;
    if (tools.length) v.requiresTool = tools.includes(tool) ? tool : tools[0]!;
    out.push(v);
  }
  return out;
}

/* ───────────────────────────── inventory fallbacks ───────────────────────────── */

/** Add a hand tool to the hotbar inventory and select it. */
export function giveTool(t: ToolId, select = true): void {
  mutate((s) => {
    if (!s.session.inventory.includes(t)) s.session.inventory.push(t);
    if (select) s.session.activeTool = t;
  });
  emit('tool.selected', { tool: t, slot: null });
}
