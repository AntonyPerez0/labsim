/**
 * sim-core shared helpers: logging, timers, RNG draws, chat, contexts. Every function works on the
 * `lab` it is given (an immer draft inside `transact()`, or a plain object while a preset is built).
 * Never import runtime values from `@/core/store` here (type-only), so seeds can run without a store.
 */
import type { TxContext } from '@/core/store';
import { nextFloat } from '@/core/rng';
import type { LabState, RngStream, SimLogEntry, SimTimer } from '../types';
import { ro } from './ro';

export type Ctx = TxContext;

/** Physical/game sub-step info passed to systems (Sim §6.2). */
export interface SubStep {
  dtGameMs: number;
  dtPhysMs: number;
  prevNowMs: number;
}

/** One float in [0,1) from a stream (Sim §6.1). `core` draws from `lab.rng`. */
export function rand(lab: LabState, stream: RngStream): number {
  return stream === 'core' ? nextFloat(lab.rng) : nextFloat(lab.rngStreams[stream]);
}

/** Uniform integer in [lo, hi] from a stream. */
export function randInt(lab: LabState, stream: RngStream, lo: number, hi: number): number {
  return lo + Math.floor(rand(lab, stream) * (hi - lo + 1));
}

export function log(lab: LabState, source: string, level: SimLogEntry['level'], text: string): void {
  lab.log.push({ atMs: lab.time.nowMs, source, level, text });
}

export function addTimer(lab: LabState, kind: string, clock: SimTimer['clock'], delayMs: number, payload: SimTimer['payload']): string {
  const id = `t${++lab.seq.timer}`;
  const base = clock === 'game' ? lab.time.nowMs : lab.time.physMs;
  lab.timers.push({ id, clock, atMs: base + Math.max(0, Math.round(delayMs)), kind, payload });
  return id;
}

/** Remove pending timers matching a predicate (e.g. cancel a superseded arm). */
export function cancelTimers(lab: LabState, pred: (t: SimTimer) => boolean): void {
  if (lab.timers.some(pred)) lab.timers = lab.timers.filter((t) => !pred(t));
}

export function postChat(lab: LabState, ctx: Ctx, channel: string, author: string, text: string, ticketId?: string): void {
  const id = `msg-${++lab.seq.chat}`;
  const msg = ticketId ? { id, channel, author, text, atMs: lab.time.nowMs, ticketId } : { id, channel, author, text, atMs: lab.time.nowMs };
  lab.chat.messages.push(msg);
  lab.chat.unread[channel] = (lab.chat.unread[channel] ?? 0) + 1;
  ctx.emit('chat.message', ticketId ? { id, channel, author, text, ticketId } : { id, channel, author, text });
}

/** A context for building a lab outside the store (reset/presets): events are discarded. */
export function detachedCtx(lab: LabState): Ctx {
  return {
    emit() {
      /* discarded */
    },
    get now() {
      return lab.time.nowMs;
    },
    random() {
      return nextFloat(lab.rng);
    },
    get rng() {
      return lab.rng;
    },
  };
}

/** Assign only when different (keeps immer from copying unchanged objects). */
export function set<T extends object, K extends keyof T>(obj: T, key: K, value: T[K]): boolean {
  if (obj[key] === value) return false;
  obj[key] = value;
  return true;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    if (a.length !== bb.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], bb[i])) return false;
    return true;
  }
  const ak = Object.keys(a as object);
  const bk = Object.keys(b as object);
  if (ak.length !== bk.length) return false;
  for (const k of ak) if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  return true;
}

/** Plain deep copy (JSON-safe state). */
export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Title-case status label used by Orca's UI and Notes (`Connection Failed`). */
export function statusLabel(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Parse `http://host[:port]/path` → { host, port, path } (default port 80). */
export function parseUrl(url: string): { host: string; port: number; path: string } | null {
  const m = /^https?:\/\/([^/:\s]+)(?::(\d+))?(\/[^\s]*)?$/.exec((url ?? '').trim());
  if (!m) return null;
  return { host: m[1]!, port: m[2] ? Number(m[2]) : 80, path: m[3] ?? '/' };
}

/**
 * `takeDueTimers` with a read-only pre-scan: most sub-steps have no due timer of a given prefix, and
 * scanning the timer array through an immer draft would draft every timer object (see `./ro`).
 */
export function takeDue(lab: LabState, prefixes: readonly string[]): SimTimer[] {
  const L = ro(lab);
  const t = ro(L.time);
  const timers = ro(L.timers);
  const dueIdx: number[] = [];
  for (let i = 0; i < timers.length; i++) {
    const tm = ro(timers[i]!);
    if (tm.atMs <= (tm.clock === 'game' ? t.nowMs : t.physMs) && prefixes.some((p) => tm.kind.startsWith(p))) dueIdx.push(i);
  }
  if (!dueIdx.length) return [];
  // Same semantics as devops' takeDueTimers (Sim §6.2): remove, then (atMs, insertion index) order.
  const due = dueIdx.map((i) => ({ t: clone(ro(timers[i]!)), i }));
  const drop = new Set(dueIdx);
  lab.timers = lab.timers.filter((_, i) => !drop.has(i));
  due.sort((a, b) => a.t.atMs - b.t.atMs || a.i - b.i);
  return due.map((d) => d.t);
}
