/**
 * Condition evaluator (contract: `src/missions/contract/conditions.ts`).
 *
 * Conditions are evaluated against a **scope** — the owner they belong to (a lesson step, a ticket, a
 * certification task, an objective). A scope remembers where its event history starts, the state of its
 * stateful nodes (`always` / `never` / `wasTrue` / `held`, sampled every mission tick) and its deferred
 * `verify` nodes ("at the next health check" / "next build"):
 *
 *  - `immediate` evaluation treats every `verify` node as satisfied; `full` evaluation requires them.
 *  - `fixedAtMs` = game ms when the immediate part last became true (reset whenever it turns false).
 *  - A verify node is satisfied by the first matching trigger at/after `fixedAtMs`; when the trigger
 *    arrives while the immediate part is false the scope records a failed verification.
 */
import type { RootState } from '@/core/state';
import type { BusRecord } from '@/core/bus';
import type { LabState } from '@/sim/types';
import type { AnyEventMatcher, Condition, ConditionContext, DeferredTrigger, IncidentBinding, ProbeValue } from '../../types';
import { RT, entriesSince, type LogEntry } from '../rt';
import { resolveProbe, type ProbeContext } from './probes';
import { robotNameOf } from '../lookups';
import { PIPELINE_JOBS } from '../arcade/pipelineJobs';

type VerifyNode = Extract<Condition, { op: 'verify' }>;

interface NodeState {
  sampled?: boolean;
  ok?: boolean;
  latched?: boolean;
  sinceS?: number | null;
  satisfiedAtMs?: number | null;
  /** Matching builds / runs / events since fixedAtMs (deferred triggers with counts). */
  hits?: { robot: string | null; atMs: number }[];
}

export interface Scope {
  id: string;
  kind: ConditionContext['scope'];
  ownerId: string;
  cond: Condition | null;
  startSeq: number;
  startedAtMs: number;
  startedAtS: number;
  ticketId: string | null;
  binding: IncidentBinding | null;
  /** Step/task counters (tickets keep theirs in `TicketState.counters`). */
  counters: Record<string, number>;
  counterMatchers: Record<string, AnyEventMatcher>;
  node: Map<Condition, NodeState>;
  fixedAtMs: number | null;
  verifyNodes: VerifyNode[];
  /** Game ms of the latest trigger that arrived while the immediate part was false. */
  verifyFailedAtMs: number | null;
}

const scopes = new Map<string, Scope>();

export function createScope(opts: {
  id: string;
  kind: Scope['kind'];
  ownerId: string;
  cond: Condition | null;
  state: RootState;
  ticketId?: string | null;
  binding?: IncidentBinding | null;
  counterMatchers?: Record<string, AnyEventMatcher>;
  startSeq?: number;
}): Scope {
  const verifyNodes: VerifyNode[] = [];
  if (opts.cond) collectVerify(opts.cond, verifyNodes);
  const scope: Scope = {
    id: opts.id,
    kind: opts.kind,
    ownerId: opts.ownerId,
    cond: opts.cond,
    startSeq: opts.startSeq ?? RT.seq,
    startedAtMs: opts.state.lab.time.nowMs,
    startedAtS: opts.state.session.clockS,
    ticketId: opts.ticketId ?? null,
    binding: opts.binding ?? null,
    counters: {},
    counterMatchers: opts.counterMatchers ?? {},
    node: new Map(),
    fixedAtMs: null,
    verifyNodes,
    verifyFailedAtMs: null,
  };
  scopes.set(scope.id, scope);
  return scope;
}

export function getScope(id: string): Scope | undefined {
  return scopes.get(id);
}

export function disposeScope(id: string): void {
  scopes.delete(id);
}

export function clearScopes(): void {
  scopes.clear();
}

export function allScopes(): Scope[] {
  return [...scopes.values()];
}

function collectVerify(c: Condition, out: VerifyNode[]): void {
  switch (c.op) {
    case 'verify':
      out.push(c);
      if (c.then) collectVerify(c.then, out);
      return;
    case 'all':
    case 'any':
      c.of.forEach((x) => collectVerify(x, out));
      return;
    case 'not':
    case 'always':
    case 'never':
    case 'wasTrue':
    case 'held':
      collectVerify(c.of, out);
      return;
    default:
      return;
  }
}

export function hasVerify(c: Condition | null | undefined): boolean {
  if (!c) return false;
  const out: VerifyNode[] = [];
  collectVerify(c, out);
  return out.length > 0;
}

/* ───────────────────────────── contexts ───────────────────────────── */

function probeContext(scope: Scope | null, state: RootState): ProbeContext {
  const ticket = scope?.ticketId ? (state.session.tickets.find((t) => t.id === scope.ticketId) ?? null) : null;
  const binding = scope?.binding ?? null;
  return {
    ticket,
    binding,
    counter: (name) => ticket?.counters?.[name] ?? scope?.counters[name] ?? state.session.counters[name] ?? 0,
    truth: (key) => {
      const v = binding?.vars?.[`truth.${key}`];
      return v === undefined ? null : v;
    },
    activityStartMs: activityStartMs(),
    prMergedBy: (repo, pr) => {
      for (let i = RT.log.length - 1; i >= 0; i--) {
        const e = RT.log[i]!;
        if (e.type !== 'github.prMerged') continue;
        const p = e.payload as { repo: string; number: number; by: string };
        if (p.repo === repo && p.number === pr) return p.by;
      }
      return null;
    },
  };
}

function activityStartMs(): number {
  const first = RT.log.find((e) => e.seq >= RT.activityStartSeq);
  return first ? first.atMs : -Infinity;
}

export function conditionContext(scope: Scope | null, state: RootState): ConditionContext {
  const pc = probeContext(scope, state);
  const startSeq = scope?.startSeq ?? RT.activityStartSeq;
  return {
    scope: scope?.kind ?? 'objective',
    ownerId: scope?.ownerId ?? '',
    ticket: pc.ticket,
    binding: pc.binding,
    startedAtMs: scope?.startedAtMs ?? 0,
    startedAtS: scope?.startedAtS ?? 0,
    elapsedS: state.session.clockS - (scope?.startedAtS ?? 0),
    get events(): readonly BusRecord[] {
      return entriesSince(startSeq).map((e) => ({ type: e.type, payload: e.payload, at: e.atMs }));
    },
    counter: pc.counter,
    truth: pc.truth,
  };
}

/* ───────────────────────────── matching ───────────────────────────── */

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a && b && typeof a === 'object' && typeof b === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

export function matchesEvent(m: AnyEventMatcher, type: string, payload: unknown, state: RootState): boolean {
  if (m.event !== type) return false;
  if (m.where) {
    const p = (payload ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(m.where)) if (!deepEq(p[k], v)) return false;
  }
  if (m.test) {
    try {
      return (m.test as (p: unknown, s: RootState) => boolean)(payload, state);
    } catch (err) {
      console.warn('[missions] event matcher test threw', err);
      return false;
    }
  }
  return true;
}

/* ───────────────────────────── comparisons ───────────────────────────── */

function toNum(v: ProbeValue): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

export function compareValues(a: ProbeValue, cmp: string, b: ProbeValue | readonly ProbeValue[] | undefined, tolerance?: number, flags?: string): boolean {
  switch (cmp) {
    case 'eq':
      return deepEq(a, b);
    case 'neq':
      return !deepEq(a, b);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const x = toNum(a);
      const y = toNum(b as ProbeValue);
      if (x === null || y === null) return false;
      return cmp === 'lt' ? x < y : cmp === 'lte' ? x <= y : cmp === 'gt' ? x > y : x >= y;
    }
    case 'approx': {
      const x = toNum(a);
      const y = toNum(b as ProbeValue);
      if (x === null || y === null) return false;
      return Math.abs(x - y) <= (tolerance ?? 0) + 1e-9;
    }
    case 'in':
      return Array.isArray(b) && (b as readonly ProbeValue[]).some((v) => deepEq(a, v));
    case 'notIn':
      return !(Array.isArray(b) && (b as readonly ProbeValue[]).some((v) => deepEq(a, v)));
    case 'contains':
      if (typeof a === 'string') return a.includes(String(b));
      if (Array.isArray(a)) return a.includes(String(b));
      return false;
    case 'notContains':
      if (typeof a === 'string') return !a.includes(String(b));
      if (Array.isArray(a)) return !a.includes(String(b));
      return true;
    case 'matches':
      if (typeof a !== 'string') return false;
      try {
        return new RegExp(String(b), flags).test(a);
      } catch {
        return false;
      }
    case 'truthy':
      return Array.isArray(a) ? a.length > 0 : !!a;
    case 'falsy':
      return Array.isArray(a) ? a.length === 0 : !a;
  }
  return false;
}

/* ───────────────────────────── evaluation ───────────────────────────── */

export type EvalMode = 'full' | 'immediate';

interface Env {
  state: RootState;
  scope: Scope | null;
  mode: EvalMode;
  pc: ProbeContext | null;
}

function pcOf(env: Env): ProbeContext {
  env.pc ??= probeContext(env.scope, env.state);
  return env.pc;
}

function nodeState(env: Env, c: Condition): NodeState {
  if (!env.scope) return {};
  let st = env.scope.node.get(c);
  if (!st) {
    st = {};
    env.scope.node.set(c, st);
  }
  return st;
}

function since(scopeKind: 'owner' | 'activity', env: Env): LogEntry[] {
  return entriesSince(scopeKind === 'activity' || !env.scope ? RT.activityStartSeq : env.scope.startSeq);
}

function ev(c: Condition, env: Env): boolean {
  switch (c.op) {
    case 'all':
      return c.of.every((x) => ev(x, env));
    case 'any':
      return c.of.some((x) => ev(x, env));
    case 'not':
      return !ev(c.of, env);
    case 'cmp': {
      const a = resolveProbe(c.probe, env.state, pcOf(env));
      const v = c.value;
      const b = v && typeof v === 'object' && !Array.isArray(v) && 'probe' in v ? resolveProbe(v.probe, env.state, pcOf(env)) : (v as ProbeValue | readonly ProbeValue[] | undefined);
      return compareValues(a, c.cmp, b, c.tolerance, c.flags);
    }
    case 'happened': {
      let n = 0;
      for (const e of since(c.scope, env)) if (matchesEvent(c.match, e.type, e.payload, env.state) && ++n >= c.min) return true;
      return c.min <= 0;
    }
    case 'sequence': {
      let i = 0;
      for (const e of since(c.scope, env)) {
        if (i < c.steps.length && matchesEvent(c.steps[i]!, e.type, e.payload, env.state)) i++;
        if (i >= c.steps.length) return true;
      }
      return c.steps.length === 0;
    }
    case 'always':
    case 'never':
    case 'wasTrue':
    case 'held': {
      const st = nodeState(env, c);
      if (!st.sampled) sampleNode(c, env, st);
      return c.op === 'held' || c.op === 'wasTrue' ? !!st.latched : !!st.ok;
    }
    case 'verify': {
      if (env.mode === 'immediate') return true;
      const st = nodeState(env, c);
      const fixed = env.scope?.fixedAtMs;
      return st.satisfiedAtMs !== null && st.satisfiedAtMs !== undefined && fixed !== null && fixed !== undefined && st.satisfiedAtMs >= fixed;
    }
    case 'custom':
      try {
        return c.test(env.state, conditionContext(env.scope, env.state));
      } catch (err) {
        console.warn(`[missions] custom condition ${c.id} threw`, err);
        return false;
      }
  }
}

function sampleNode(c: Extract<Condition, { op: 'always' | 'never' | 'wasTrue' | 'held' }>, env: Env, st: NodeState): void {
  const inner = ev(c.of, { ...env, mode: 'full' });
  const nowS = env.state.session.clockS;
  switch (c.op) {
    case 'always':
      st.ok = (st.sampled ? !!st.ok : true) && inner;
      break;
    case 'never':
      st.ok = (st.sampled ? !!st.ok : true) && !inner;
      break;
    case 'wasTrue':
      st.latched = !!st.latched || inner;
      break;
    case 'held':
      if (inner) {
        st.sinceS ??= nowS;
        if (nowS - st.sinceS >= c.seconds) st.latched = true;
      } else st.sinceS = null;
      break;
  }
  st.sampled = true;
}

function sampleTree(c: Condition, env: Env): void {
  switch (c.op) {
    case 'all':
    case 'any':
      c.of.forEach((x) => sampleTree(x, env));
      return;
    case 'not':
      sampleTree(c.of, env);
      return;
    case 'always':
    case 'never':
    case 'wasTrue':
    case 'held':
      sampleTree(c.of, env);
      sampleNode(c, env, nodeState(env, c));
      return;
    case 'verify':
      if (c.then) sampleTree(c.then, env);
      return;
    default:
      return;
  }
}

/** Evaluate a condition (no scope = activity-wide history, no stateful memory). */
export function evaluate(cond: Condition, state: RootState, scope: Scope | null = null, mode: EvalMode = 'full'): boolean {
  return ev(cond, { state, scope, mode, pc: null });
}

export interface ScopeStatus {
  full: boolean;
  immediate: boolean;
  hasVerify: boolean;
}

export function scopeStatus(scope: Scope, state: RootState): ScopeStatus {
  if (!scope.cond) return { full: false, immediate: false, hasVerify: false };
  const immediate = evaluate(scope.cond, state, scope, 'immediate');
  const full = immediate && (scope.verifyNodes.length === 0 || evaluate(scope.cond, state, scope, 'full'));
  return { full, immediate, hasVerify: scope.verifyNodes.length > 0 };
}

/** Per-tick sampling: stateful nodes and `fixedAtMs`. */
export function sampleScope(scope: Scope, state: RootState): void {
  if (!scope.cond) return;
  const env: Env = { state, scope, mode: 'full', pc: null };
  sampleTree(scope.cond, env);
  updateFixed(scope, state);
}

function updateFixed(scope: Scope, state: RootState): boolean {
  if (!scope.cond) return false;
  const imm = evaluate(scope.cond, state, scope, 'immediate');
  if (imm) scope.fixedAtMs ??= state.lab.time.nowMs;
  else scope.fixedAtMs = null;
  return imm;
}

/** Count an event against the scope's declared counters; returns the counter names that changed. */
export function countEvent(scope: Scope, entry: LogEntry, state: RootState): string[] {
  const changed: string[] = [];
  for (const [name, m] of Object.entries(scope.counterMatchers)) {
    if (matchesEvent(m, entry.type, entry.payload, state)) changed.push(name);
  }
  return changed;
}

/* ───────────────────────────── deferred triggers ───────────────────────────── */

export type TriggerOutcome = 'satisfied' | 'progress' | 'failed';

function triggerKindOf(t: DeferredTrigger): string {
  return t.kind;
}

/** Which deferred trigger kinds an event can be. */
function eventTriggerKinds(type: string): string[] {
  switch (type) {
    case 'orca.healthCheckRan':
      return ['health-check', 'event'];
    case 'jenkins.buildFinished':
      return ['build', 'event'];
    case 'test.localRunFinished':
      return ['local-run', 'event'];
    default:
      return ['event'];
  }
}

function buildMatches(t: Extract<DeferredTrigger, { kind: 'build' }>, lab: LabState, payload: { buildId: string; jobId: string; robotId: number | null }): boolean {
  const jobs = [...(t.jobs ?? []), ...(t.pipeline ? [PIPELINE_JOBS[t.pipeline]] : [])];
  if (jobs.length && !jobs.includes(payload.jobId)) return false;
  const robot = robotNameOf(lab, payload.robotId);
  if (t.robots?.length && (!robot || !t.robots.includes(robot))) return false;
  if (t.params) {
    const params = lab.jenkins?.builds?.[payload.buildId]?.params ?? {};
    for (const [k, v] of Object.entries(t.params)) if (params[k] !== v) return false;
  }
  return true;
}

/**
 * Feed an event to the scope's verify nodes. Returns `satisfied` when the full condition became true
 * through this trigger, `failed` when a relevant trigger arrived while the condition was not met,
 * `progress` for partial counts, or null when the event is irrelevant.
 */
export function feedTrigger(scope: Scope, entry: LogEntry, state: RootState): TriggerOutcome | null {
  if (!scope.cond || !scope.verifyNodes.length) return null;
  const kinds = eventTriggerKinds(entry.type);
  const relevant = scope.verifyNodes.filter((n) => kinds.includes(triggerKindOf(n.on)));
  if (!relevant.length) return null;
  const env: Env = { state, scope, mode: 'full', pc: null };
  let outcome: TriggerOutcome | null = null;
  for (const node of relevant) {
    const t = node.on;
    let hit = false;
    let resultOk = true;
    let robot: string | null = null;
    if (t.kind === 'health-check') hit = entry.type === 'orca.healthCheckRan';
    else if (t.kind === 'build' && entry.type === 'jenkins.buildFinished') {
      const p = entry.payload as { buildId: string; jobId: string; result: string; robotId: number | null };
      hit = buildMatches(t, state.lab, p);
      resultOk = p.result === (t.result ?? 'SUCCESS');
      robot = robotNameOf(state.lab, p.robotId);
    } else if (t.kind === 'local-run' && entry.type === 'test.localRunFinished') {
      const p = entry.payload as { testName: string; passed: boolean; robotName?: string | null };
      hit = !t.tests?.length || t.tests.includes(p.testName);
      resultOk = p.passed === (t.passed ?? true);
      robot = p.robotName ?? null;
    } else if (t.kind === 'event') hit = matchesEvent(t.match, entry.type, entry.payload, state);
    if (!hit) continue;

    const imm = updateFixed(scope, state);
    const st = nodeState(env, node);
    if (!imm || scope.fixedAtMs === null || !resultOk) {
      // A relevant trigger arrived but the fix is not in place (or the confirming run failed).
      st.hits = [];
      scope.verifyFailedAtMs = entry.atMs;
      outcome ??= 'failed';
      continue;
    }
    if (st.satisfiedAtMs !== null && st.satisfiedAtMs !== undefined && st.satisfiedAtMs >= scope.fixedAtMs) continue;
    if (node.then && !evaluate(node.then, state, scope, 'full')) {
      scope.verifyFailedAtMs = entry.atMs;
      outcome ??= 'failed';
      continue;
    }
    const need = t.kind === 'build' || t.kind === 'local-run' || t.kind === 'event' ? (t.count ?? 1) : 1;
    const distinct = t.kind === 'build' ? (t.distinctRobots ?? 0) : 0;
    st.hits = [...(st.hits ?? []).filter((h) => h.atMs >= (scope.fixedAtMs ?? 0)), { robot, atMs: entry.atMs }];
    const robots = new Set(st.hits.map((h) => h.robot).filter(Boolean));
    if (st.hits.length >= need && robots.size >= distinct) {
      st.satisfiedAtMs = entry.atMs;
      outcome = 'satisfied';
    } else outcome ??= 'progress';
  }
  if (outcome === 'satisfied' && !evaluate(scope.cond, state, scope, 'full')) return 'progress';
  return outcome;
}
