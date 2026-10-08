/**
 * The fault engine (Sim §4.1): catalogue, inject (parameter resolution incl. '@random' from the `faults`
 * stream, validation, duplicate guard, recorded mutation), clear (revert that never stomps player work),
 * isResolved (pure predicate), scenarios (ordered fault specs + setup ops, all-or-nothing) and the
 * auto-clear system (tick step 15). Works on the `lab` it is given — a draft inside `transact()` or a
 * plain lab while a preset is built.
 */
import type { ActiveFault, FaultParamValue, LabState } from '../../types';
import { DEVICE_TYPE_CODES } from '../../types';
import type { FaultInfo, FaultParamInfo, FaultSpec, Result, ScenarioItem, SetupOp, SetupOpInfo } from '../../api';
import type { FaultDef, SetupOpDef } from '../../devops';
import { DEVOPS_FAULT_DEFS as DEVOPS_FAULTS, DEVOPS_SETUP_OP_DEFS as DEVOPS_SETUP_OPS } from '../../devops/faults';
import type { Ctx } from '../util';
import { clone, log, rand } from '../util';
import { ro } from '../ro';
import type { CoreFaultDef, Params } from './helpers';
import { str, undoPatches } from './helpers';
import { HOST_FAULTS } from './defsHosts';
import { POWER_FAULTS } from './defsPower';
import { RIG_FAULTS } from './defsRigs';
import { DEVICE_FAULTS } from './defsDevices';
import { DATA_FAULTS } from './defsData';
import { CORE_SETUP_OP_DEFS } from './setupOps';

/** Core fault rows (Sim §4.3.1–§4.3.7). */
export const CORE_FAULTS: CoreFaultDef[] = [...HOST_FAULTS, ...POWER_FAULTS, ...RIG_FAULTS, ...DEVICE_FAULTS, ...DATA_FAULTS];
export const CORE_FAULT_IDS: string[] = CORE_FAULTS.map((d) => d.info.id);
export const CORE_SETUP_OPS: SetupOpDef[] = CORE_SETUP_OP_DEFS;

let defsById: Map<string, FaultDef> | null = null;
let opsById: Map<string, SetupOpDef> | null = null;

/** Every fault definition (core + devops), by id. Built lazily (devops arrays are imported). */
export function faultDefs(): Map<string, FaultDef> {
  if (!defsById) {
    defsById = new Map();
    for (const d of [...CORE_FAULTS, ...DEVOPS_FAULTS]) defsById.set(d.info.id, d);
  }
  return defsById;
}
export function setupDefs(): Map<string, SetupOpDef> {
  if (!opsById) {
    opsById = new Map();
    for (const d of [...CORE_SETUP_OPS, ...DEVOPS_SETUP_OPS]) opsById.set(d.info.op, d);
  }
  return opsById;
}

/** Static catalogue sorted by id (Sim §4.1.2). */
export function faultCatalogue(): FaultInfo[] {
  return [...faultDefs().values()].map((d) => d.info).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
export function setupCatalogue(): SetupOpInfo[] {
  return [...setupDefs().values()].map((d) => d.info);
}

/* ────────────────────────────── parameters (Sim §4.1.3 #2) ────────────────────────────── */

/** Candidates of a target kind for '@random' (id order). */
function kindCandidates(lab: LabState, kind: FaultParamInfo['kind']): string[] {
  const o = lab.orca;
  const byId = <T extends { id: number; name: string }>(t: Record<number, T>) => Object.values(t).sort((a, b) => a.id - b.id).map((r) => r.name);
  switch (kind) {
    case 'host':
      return Object.keys(lab.hosts).sort();
    case 'rig':
      return Object.values(lab.rigs).sort((a, b) => a.orcaRobotId - b.orcaRobotId).map((r) => r.id);
    case 'robot':
      return byId(o.robots);
    case 'device':
      return Object.keys(lab.devices).sort();
    case 'fuse':
      return Object.keys(lab.power.fuses).sort();
    case 'outlet':
      return Object.keys(lab.power.outlets).sort();
    case 'regulator':
      return Object.keys(lab.power.regulators).sort();
    case 'probe':
      return Object.keys(lab.collis).sort();
    case 'merchant':
      return byId(o.merchants);
    case 'cardProfile':
      return byId(o.cardProfiles);
    case 'compare':
      return byId(o.screenCompareImages);
    case 'deviceType':
      return [...DEVICE_TYPE_CODES];
    case 'job':
      return Object.keys(lab.jenkins.jobs).sort();
    default:
      return [];
  }
}

const isRandom = (v: unknown): boolean => v === '@random' || (Array.isArray(v) && v.length === 1 && v[0] === '@random');

/** Fill defaults, resolve '@random', check required/number/enum (Sim §4.1.3 #2). */
export function resolveParams(lab: LabState, def: FaultDef, raw: Record<string, FaultParamValue> | undefined): Result<Params> {
  const id = def.info.id;
  const out: Params = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = Array.isArray(v) ? [...v] : v;
  for (const pi of def.info.params) {
    let v = out[pi.name];
    if (v === undefined && pi.default !== undefined) v = Array.isArray(pi.default) ? [...pi.default] : pi.default;
    if (isRandom(v)) {
      const pool = (def as CoreFaultDef).randomPools?.[pi.name] ?? pi.values ?? kindCandidates(lab, pi.kind);
      if (!pool.length) return { ok: false, error: `fault ${id}: invalid param ${pi.name}='@random' (no candidates)` };
      const pick = pool[Math.min(pool.length - 1, Math.floor(rand(lab, 'faults') * pool.length))]!;
      v = pi.kind === 'list' ? [pick] : pi.kind === 'number' ? Number(pick) : pick;
    }
    if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) {
      if (pi.required) return { ok: false, error: `fault ${id}: invalid param ${pi.name}='' (missing)` };
      if (v !== undefined) out[pi.name] = v;
      continue;
    }
    if (pi.kind === 'number' && Number.isNaN(Number(v))) return { ok: false, error: `fault ${id}: invalid param ${pi.name}='${str(v)}' (not a number)` };
    if (pi.kind === 'number') v = Number(v);
    if (pi.kind === 'boolean' && typeof v === 'string') {
      if (v !== 'true' && v !== 'false') return { ok: false, error: `fault ${id}: invalid param ${pi.name}='${v}' (not one of true, false)` };
      v = v === 'true';
    }
    if (pi.kind === 'list' && !Array.isArray(v)) v = String(v).split(',').map((x) => x.trim()).filter(Boolean);
    if (pi.values && pi.kind !== 'list' && pi.kind !== 'number' && !pi.values.includes(String(v))) return { ok: false, error: `fault ${id}: invalid param ${pi.name}='${str(v)}' (not one of ${pi.values.join(', ')})` };
    if (pi.values && pi.kind === 'number' && !pi.values.includes(String(v))) return { ok: false, error: `fault ${id}: invalid param ${pi.name}='${str(v)}' (not one of ${pi.values.join(', ')})` };
    out[pi.name] = v;
  }
  return { ok: true, value: out };
}

/** The value of the fault's target parameter (or "lab"). */
function rawTarget(def: FaultDef, params: Params): string {
  const t = def.info.params.find((x) => x.target);
  if (!t) return 'lab';
  const v = params[t.name];
  return v === undefined ? 'lab' : Array.isArray(v) ? v.join(',') : String(v);
}

/* ────────────────────────────── inject / clear / isResolved ────────────────────────────── */

/** Sim §4.1.3: validate everything, then apply with undo recording. */
export function injectFault(lab: LabState, ctx: Ctx, spec: FaultSpec): Result<{ instanceId: string }> {
  const def = faultDefs().get(spec.faultId);
  if (!def) return { ok: false, error: `unknown fault '${spec.faultId}'` };
  const pr = resolveParams(lab, def, spec.params);
  if (!pr.ok) return pr;
  const params = pr.value;
  const guard = (target: string): Result<never> | null => {
    const dup = lab.faults.find((f) => !f.cleared && f.faultId === def.info.id && f.target === target);
    return dup ? { ok: false, error: `fault ${def.info.id} already active on ${target} (#${dup.id})` } : null;
  };
  const g1 = guard(rawTarget(def, params));
  if (g1) return g1;
  const v = def.validate(lab, params);
  if (!v.ok) return v;
  const target = v.value.target;
  const g2 = target !== rawTarget(def, params) ? guard(target) : null;
  if (g2) return g2;
  const undo: ActiveFault['undo'] = [];
  def.apply(lab, ctx, params, (path, before, after) => undo.push({ path: [...path], before: clone(before) ?? null, after: clone(after) ?? null }));
  const instanceId = `f${++lab.seq.fault}`;
  const storedParams: ActiveFault['params'] = {};
  for (const [k, val] of Object.entries(params)) storedParams[k] = Array.isArray(val) ? [...val] : val;
  lab.faults.push({ id: instanceId, faultId: def.info.id, target, params: storedParams, injectedMs: lab.time.nowMs, cleared: false, clearedMs: null, clearedBy: null, clearedByActor: null, undo, holdSincePhysMs: null });
  log(lab, 'faults', 'info', `inject ${instanceId} ${def.info.id} target=${target}`);
  ctx.emit('fault.injected', { instanceId, faultId: def.info.id, params: clone(storedParams), target });
  return { ok: true, value: { instanceId } };
}

/** Sim §4.1.5: revert (custom or guarded undo) and mark cleared by the API. */
export function clearFault(lab: LabState, ctx: Ctx, instanceId: string, by: string): Result {
  const f = lab.faults.find((x) => x.id === instanceId);
  if (!f) return { ok: false, error: `no fault '${instanceId}'` };
  if (f.cleared) return { ok: false, error: `fault ${instanceId} already cleared` };
  const def = faultDefs().get(f.faultId);
  if (def?.revert) def.revert(lab, ctx, f);
  else undoPatches(lab, f);
  f.cleared = true;
  f.clearedMs = lab.time.nowMs;
  f.clearedBy = 'api';
  f.clearedByActor = by;
  f.holdSincePhysMs = null;
  log(lab, 'faults', 'info', `clear ${instanceId} ${f.faultId} by=${by}`);
  ctx.emit('fault.cleared', { instanceId, faultId: f.faultId, by });
  return { ok: true, value: undefined };
}

/** Sim §4.1.6 (pure; ignores holdMs). */
export function faultResolved(lab: LabState, instanceId: string): boolean {
  const f = lab.faults.find((x) => x.id === instanceId);
  if (!f) return false;
  if (f.cleared) return true;
  const def = faultDefs().get(f.faultId);
  return !!def && def.isResolved(lab, f);
}

/** Tick step 15 — auto-clear (Sim §4.1.7). */
export function faultsStep(lab: LabState, ctx: Ctx): void {
  const L = ro(lab);
  const phys = ro(L.time).physMs;
  const list = ro(L.faults);
  for (let i = 0; i < list.length; i++) {
    const fr = ro(list[i]!);
    if (fr.cleared) continue;
    const def = faultDefs().get(fr.faultId);
    if (!def || def.info.apiOnly) continue;
    const r = def.isResolved(lab, fr);
    if (!r) {
      if (fr.holdSincePhysMs !== null) lab.faults[i]!.holdSincePhysMs = null;
      continue;
    }
    const since = fr.holdSincePhysMs ?? phys;
    if (fr.holdSincePhysMs === null) lab.faults[i]!.holdSincePhysMs = phys;
    if (phys - since >= def.info.holdMs) {
      const f = lab.faults[i]!;
      f.cleared = true;
      f.clearedBy = 'condition';
      f.clearedMs = lab.time.nowMs;
      log(lab, 'faults', 'info', `resolved ${f.id} ${f.faultId} (condition)`);
      ctx.emit('fault.cleared', { instanceId: f.id, faultId: f.faultId, by: 'condition' });
    }
  }
}

/* ────────────────────────────── setup ops and scenarios ────────────────────────────── */

/**
 * Apply one setup op (Sim §4.4.1). `presetOnly` ops (history rewrites, seeded builds) are allowed while
 * building a preset and inside a scenario (`faults.injectAll`, which Appendix A uses for INC28/INC40/INC57),
 * but not as a lone `faults.applySetup` call (the Free Play injector).
 */
export function applySetupOp(lab: LabState, ctx: Ctx, op: SetupOp, opts: { inPreset?: boolean; inScenario?: boolean } = {}): Result {
  const def = setupDefs().get(op.op);
  if (!def) return { ok: false, error: `unknown setup op '${op.op}'` };
  if (def.info.presetOnly && !opts.inPreset && !opts.inScenario) return { ok: false, error: `setup ${op.op} is allowed only in presets and scenarios` };
  const params = { ...(op.params ?? {}) } as Record<string, unknown>;
  for (const pi of def.info.params) if (params[pi.name] === undefined && pi.default !== undefined) params[pi.name] = Array.isArray(pi.default) ? [...pi.default] : pi.default;
  const v = def.validate(lab, params);
  if (!v.ok) return v;
  def.apply(lab, ctx, params);
  ctx.emit('setup.applied', { op: op.op, params: clone(params) as Record<string, FaultParamValue> });
  return { ok: true, value: undefined };
}

const isFaultSpec = (i: ScenarioItem): i is FaultSpec => typeof (i as FaultSpec).faultId === 'string';

/**
 * Apply a scenario in order on `lab` (Sim §4.1.4). Stops at the first failing item and returns
 * `scenario item <n> (<id>): <error>`; earlier items stay applied on `lab` — callers that need
 * all-or-nothing run this on a scratch copy.
 */
export function applyScenario(lab: LabState, ctx: Ctx, items: ScenarioItem[], opts: { inPreset?: boolean } = {}): Result<{ instanceIds: string[] }> {
  const ids: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const label = isFaultSpec(item) ? item.faultId : (item as SetupOp).op;
    const r = isFaultSpec(item) ? injectFault(lab, ctx, item) : applySetupOp(lab, ctx, item as SetupOp, { ...opts, inScenario: true });
    if (!r.ok) return { ok: false, error: `scenario item ${i + 1} (${label}): ${r.error}` };
    if (isFaultSpec(item) && r.value) ids.push((r.value as { instanceId: string }).instanceId);
  }
  return { ok: true, value: { instanceIds: ids } };
}

/** Housekeeping cap (Sim §4.1.1): keep the newest 100 entries, dropping the oldest cleared ones first. */
export function capFaults(lab: LabState): void {
  if (lab.faults.length <= 100) return;
  let excess = lab.faults.length - 100;
  lab.faults = lab.faults.filter((f) => (excess > 0 && f.cleared ? (excess--, false) : true));
}
