/**
 * Free Play (GP §2.5): sandbox lab with every system live, the Fault Injector (`FInn` = `INCnn`, optional
 * ticket), random faults, sandbox toggles (time scale, ×30 hold, penalties, pipelines, inspect truth,
 * build mode), reset to factory and three snapshot slots. XP: 30 per verified fix, cap 300/day.
 */
import type { TxContext } from '@/core/store';
import type { FreePlayState, InjectedFaultState, RootState } from '@/core/state';
import { hashString, pick } from '@/core/rng';
import type { LabState } from '@/sim/types';
import * as persistence from '@/core/persistence';
import { XP_REWARDS } from '@/content';
import type { FaultInjectorEntry, MissionResult, SandboxPatch } from '../api';
import { RT, onActivityReset, type LogEntry } from './rt';
import { createScope, disposeScope, feedTrigger, hasVerify, sampleScope, scopeStatus, type Scope } from './conditions/evaluate';
import { beginActivity } from './session';
import { simCall, simRun } from './simx';
import { allIncidents, getIncident } from './registry';
import { candidateRigs, eligibleVariants, variantLabel } from './arcade/binding';
import { injectIncident } from './arcade/spawn';
import { closeUnresolved } from './arcade/tickets';
import { createPipelines, tickPipelines, onPipelineEvent, type PipelineHost } from './arcade/pipelines';
import { unlockedIncident } from './arcade/plans';
import { grantXp } from './progression/xp';
import { realNowMs, today } from './clock';
import { setBanner, removeBanner, toast } from './feedback';
import { TR } from './arcade/ticketRuntime';

interface InjRt {
  scope: Scope;
}
const inj = new Map<string, InjRt>();
let injSeq = 0;
let host: PipelineHost | null = null;
const memorySlots = new Map<number, { savedAt: number; label: string; lab: LabState }>();

onActivityReset(() => {
  for (const r of inj.values()) disposeScope(r.scope.id);
  inj.clear();
  host = null;
});

function fp(d: RootState): FreePlayState | null {
  return d.session.mode === 'freeplay' ? d.session.freeplay : null;
}

export function startFreeplay(d: RootState, ctx: TxContext, o: { slot?: 1 | 2 | 3; fresh?: boolean } = {}): void {
  const s = d.progress.settings;
  const seed = hashString(`freeplay:${realNowMs()}:${d.session.runId}`);
  const snap = o.slot && !o.fresh ? loadSlotLab(o.slot) : null;
  beginActivity(d, ctx, { mode: 'freeplay', activityId: 'freeplay', seed, preset: snap ? null : 'freeplay', timeScale: snap ? undefined : clampScale(s.freeplayTimeScale), simConfig: { pipelinesEnabled: s.freeplayPipelines, forceHealthCheckAllowed: d.progress.realism !== 'strict' } });
  if (snap) simRun('restore', (sim) => sim.restore(snap), undefined);
  d.session.freeplay = {
    timeScale: clampScale(s.freeplayTimeScale),
    fastForwardHeld: false,
    penalties: s.freeplayPenalties,
    pipelines: s.freeplayPipelines,
    randomFaults: s.freeplayRandomFaults,
    nextRandomFaultInS: randomInterval(s.freeplayRandomFaults),
    inspectTruth: false,
    xpDisabled: false,
    injected: [],
    buildMode: false,
    slot: o.slot ?? null,
  };
  host = { pipelines: createPipelines(), uptime: { attempts: 0, gotRig: 0 }, heat: 5, scoring: false, pipelinePoints: 0, greenWallS: 0 };
}

function clampScale(n: number): 1 | 2 | 5 | 10 {
  return ([1, 2, 5, 10] as const).find((x) => x === n) ?? 1;
}

function randomInterval(m: FreePlayState['randomFaults']): number | null {
  return m === '3min' ? 180 : m === '90s' ? 90 : null;
}

export function faultInjectorEntries(d: RootState): FaultInjectorEntry[] {
  return allIncidents().map((inc) => ({
    fiId: inc.id.replace(/^INC/, 'FI'),
    incidentId: inc.id,
    name: inc.name,
    taught: unlockedIncident(d.progress, inc),
    variants: eligibleVariants(inc, null).map((v) => ({ id: v.id, label: variantLabel(inc, v.id) })),
    defaultRig: inc.rigs.default,
    rigs: candidateRigs(inc),
  }));
}

export function injectFault(d: RootState, ctx: TxContext, incidentId: string, o: { variantId?: string; rig?: string; createTicket?: boolean; random?: boolean } = {}): MissionResult<{ injectionId: string }> {
  const state = fp(d);
  if (!state) return { ok: false, error: 'Free Play is not running.' };
  const def = getIncident(incidentId);
  if (!def) return { ok: false, error: `Unknown incident ${incidentId}` };
  const id = `${incidentId.replace(/^INC/, 'FI')}#${++injSeq}`;
  const res = injectIncident(d, ctx, def, {
    ...(o.variantId ? { variantId: o.variantId } : {}),
    rig: o.rig ?? null,
    source: 'freeplay',
    bindMode: 'default',
    revealNow: true,
    noTicket: !o.createTicket,
    injectionId: id,
    notYetTaught: !unlockedIncident(d.progress, def),
  });
  if (!res) return { ok: false, error: 'No free rig for this fault.' };
  const b = res.pending.binding;
  const entry: InjectedFaultState = {
    id,
    incidentId,
    variantId: res.pending.variantId,
    binding: { rig: b.rig, hrn: b.hrn, rigs: [...b.rigs], vars: { ...b.vars }, seed: b.seed },
    faultInstanceIds: [...res.pending.instanceIds],
    ticketId: res.ticket?.id ?? null,
    injectedAtMs: d.lab.time.nowMs,
    fixedAtMs: null,
    xpAwarded: 0,
    random: !!o.random,
  };
  state.injected.push(entry);
  inj.set(id, { scope: createScope({ id: `fi:${id}`, kind: 'task', ownerId: id, cond: res.pending.def.success(b), state: d, binding: b }) });
  ctx.emit('freeplay.faultInjected', { injectionId: id, incidentId, variantId: entry.variantId, rig: b.rig, random: !!o.random });
  toast(d, 'info', `${entry.id} injected`, `${def.name}${b.hrn ? ` on ${b.hrn}` : ''}`);
  return { ok: true, value: { injectionId: id } };
}

export function clearFault(d: RootState, ctx: TxContext, injectionId: string): void {
  const state = fp(d);
  if (!state) return;
  const i = state.injected.findIndex((x) => x.id === injectionId);
  if (i < 0) return;
  const e = state.injected[i]!;
  for (const fid of e.faultInstanceIds) simRun('faults.clear', (s) => s.faults.clear(fid, 'system'), { ok: false, error: '' });
  const t = e.ticketId ? d.session.tickets.find((x) => x.id === e.ticketId) : null;
  if (t && t.status !== 'resolved' && t.status !== 'failed') closeUnresolved(d, ctx, t, 'failed');
  const r = inj.get(injectionId);
  if (r) disposeScope(r.scope.id);
  inj.delete(injectionId);
  state.injected.splice(i, 1);
  ctx.emit('freeplay.faultCleared', { injectionId, incidentId: e.incidentId });
}

export function clearAllFaults(d: RootState, ctx: TxContext): void {
  for (const e of [...(fp(d)?.injected ?? [])]) clearFault(d, ctx, e.id);
}

function verified(d: RootState, ctx: TxContext, e: InjectedFaultState): void {
  const state = fp(d)!;
  e.fixedAtMs = d.lab.time.nowMs;
  const r = inj.get(e.id);
  if (r) disposeScope(r.scope.id);
  inj.delete(e.id);
  const p = d.progress;
  p.freeplay.fixesTotal++;
  p.stats.freeplayFixes++;
  let xp = 0;
  if (!state.xpDisabled) {
    const t = today();
    if (p.freeplay.xpTodayDay !== t) {
      p.freeplay.xpTodayDay = t;
      p.freeplay.xpToday = 0;
    }
    xp = Math.max(0, Math.min(XP_REWARDS.freeplayFix, XP_REWARDS.freeplayDailyCap - p.freeplay.xpToday));
    if (xp > 0) {
      p.freeplay.xpToday += xp;
      xp = grantXp(d, ctx, xp, 'freeplay', `${e.id} fixed`);
    }
  }
  e.xpAwarded = xp;
  ctx.emit('freeplay.faultFixed', { injectionId: e.id, incidentId: e.incidentId, xp });
  toast(d, 'success', `${e.id} fixed`, xp ? `+${xp} XP` : state.xpDisabled ? 'XP disabled (Inspect truth was used)' : 'Daily Free Play XP cap reached');
}

export function tickFreeplay(d: RootState, ctx: TxContext, dtS: number): void {
  const state = fp(d);
  if (!state) return;
  for (const e of state.injected) {
    if (e.fixedAtMs !== null) continue;
    const r = inj.get(e.id);
    if (!r) continue;
    sampleScope(r.scope, d);
    if (scopeStatus(r.scope, d).full) verified(d, ctx, e);
  }
  if (state.pipelines && host) tickPipelines(d, ctx, dtS, host);
  if (state.nextRandomFaultInS !== null) {
    state.nextRandomFaultInS -= dtS;
    if (state.nextRandomFaultInS <= 0) {
      state.nextRandomFaultInS = randomInterval(state.randomFaults);
      const pool = allIncidents().filter((i) => unlockedIncident(d.progress, i) && !i.plannedWorkOnly && !state.injected.some((x) => x.incidentId === i.id && x.fixedAtMs === null));
      if (pool.length) injectFault(d, ctx, pick(RT.rng, pool).id, { createTicket: true, random: true });
    }
  }
}

export function onFreeplayEvent(d: RootState, ctx: TxContext, e: LogEntry): void {
  const state = fp(d);
  if (!state) return;
  for (const f of state.injected) {
    if (f.fixedAtMs !== null) continue;
    const r = inj.get(f.id);
    if (!r || !hasVerify(r.scope.cond)) continue;
    if (feedTrigger(r.scope, e, d) === 'satisfied') verified(d, ctx, f);
  }
  if (state.pipelines && host) onPipelineEvent(d, ctx, e, host);
}

export function setSandbox(d: RootState, ctx: TxContext, patch: SandboxPatch): void {
  const state = fp(d);
  if (!state) return;
  const s = d.progress.settings;
  if (patch.timeScale !== undefined) {
    state.timeScale = patch.timeScale;
    s.freeplayTimeScale = patch.timeScale;
    if (!state.fastForwardHeld) simRun('setTimeScale', (sim) => sim.setTimeScale(patch.timeScale!), undefined);
  }
  if (patch.fastForwardHeld !== undefined && patch.fastForwardHeld !== state.fastForwardHeld) {
    state.fastForwardHeld = patch.fastForwardHeld;
    const to = patch.fastForwardHeld && d.session.realism !== 'strict' ? 30 : state.timeScale;
    simRun('setTimeScale', (sim) => sim.setTimeScale(to), undefined);
  }
  if (patch.penalties !== undefined) state.penalties = s.freeplayPenalties = patch.penalties;
  if (patch.pipelines !== undefined) {
    state.pipelines = s.freeplayPipelines = patch.pipelines;
    simRun('setConfig', (sim) => sim.setConfig({ pipelinesEnabled: patch.pipelines! }), undefined);
  }
  if (patch.randomFaults !== undefined) {
    state.randomFaults = s.freeplayRandomFaults = patch.randomFaults;
    state.nextRandomFaultInS = randomInterval(patch.randomFaults);
  }
  if (patch.inspectTruth !== undefined) {
    state.inspectTruth = patch.inspectTruth;
    if (patch.inspectTruth && !state.xpDisabled) {
      state.xpDisabled = true;
      setBanner(d, 'inspect-truth', 'warning', 'Inspect truth is on — Free Play XP is disabled for this session.');
    } else if (!patch.inspectTruth) removeBanner(d, 'inspect-truth');
  }
  if (patch.buildMode !== undefined) state.buildMode = patch.buildMode;
  void ctx;
}

export function resetLab(d: RootState, ctx: TxContext): void {
  const state = fp(d);
  if (!state) return;
  for (const t of d.session.tickets) if (t.status !== 'resolved' && t.status !== 'failed' && t.status !== 'handover') closeUnresolved(d, ctx, t, 'failed');
  for (const r of inj.values()) disposeScope(r.scope.id);
  inj.clear();
  TR.pending = [];
  state.injected = [];
  simRun('reset', (sim) => sim.reset({ preset: 'freeplay', seed: RT.rng.seed }), undefined);
  simRun('setTimeScale', (sim) => sim.setTimeScale(state.timeScale), undefined);
  if (host) host.pipelines = createPipelines();
  toast(d, 'info', 'Lab reset to factory', 'GP §3.1 roster');
}

/* ───────────────────────────── snapshots ───────────────────────────── */

type SlotPersistence = {
  saveFreeplaySlot?: (slot: number, lab: LabState) => void;
  loadFreeplaySlot?: (slot: number) => LabState | null;
};
const ext = persistence as unknown as SlotPersistence;

function loadSlotLab(slot: number): LabState | null {
  const mem = memorySlots.get(slot);
  if (mem) return JSON.parse(JSON.stringify(mem.lab)) as LabState;
  try {
    if (typeof ext.loadFreeplaySlot === 'function') return ext.loadFreeplaySlot(slot);
    return slot === 1 ? persistence.loadFreeplayLab() : null;
  } catch {
    return null;
  }
}

export function saveSnapshot(d: RootState, slot: 1 | 2 | 3): MissionResult {
  if (!fp(d)) return { ok: false, error: 'Free Play is not running.' };
  const lab = simCall('snapshot', (s) => s.snapshot(), null);
  if (!lab) return { ok: false, error: 'Snapshot failed.' };
  memorySlots.set(slot, { savedAt: realNowMs(), label: `${d.lab.time.dateLabel ?? ''} ${Math.floor(d.lab.time.nowMs / 3_600_000)}h`.trim(), lab });
  try {
    if (typeof ext.saveFreeplaySlot === 'function') ext.saveFreeplaySlot(slot, lab);
    else if (slot === 1) persistence.saveFreeplayLab(lab);
  } catch (err) {
    console.warn('[missions] could not persist snapshot', err);
  }
  d.session.freeplay!.slot = slot;
  return { ok: true, value: undefined };
}

export function loadSnapshot(d: RootState, ctx: TxContext, slot: 1 | 2 | 3): MissionResult {
  if (!fp(d)) return { ok: false, error: 'Free Play is not running.' };
  const lab = loadSlotLab(slot);
  if (!lab) return { ok: false, error: `Slot ${slot} is empty.` };
  clearAllFaults(d, ctx);
  simRun('restore', (s) => s.restore(lab), undefined);
  d.session.freeplay!.slot = slot;
  return { ok: true, value: undefined };
}

export function snapshotSlots(): ({ slot: 1 | 2 | 3; savedAt: number; label: string } | null)[] {
  return ([1, 2, 3] as const).map((slot) => {
    const m = memorySlots.get(slot);
    return m ? { slot, savedAt: m.savedAt, label: m.label } : null;
  });
}
