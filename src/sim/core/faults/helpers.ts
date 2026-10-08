/**
 * Helpers for writing fault definitions (Sim §4.2): parameter infos, catalogue metadata, recorded
 * writes (undo patches, §4.1.3 #5), path get/set.
 */
import type { FaultParamValue, LabState } from '../../types';
import type { FaultInfo, FaultParamInfo, Result } from '../../api';
import type { FaultDef } from '../../devops';
import { clone, deepEqual } from '../util';
import type { ActiveFault } from '../../types';

export type Record_ = (path: (string | number)[], before: unknown, after: unknown) => void;
export type Params = Record<string, FaultParamValue>;

/** A core fault definition: `FaultDef` + '@random' pools per parameter (Sim §4.1.3 #2). */
export interface CoreFaultDef extends FaultDef {
  randomPools?: Record<string, string[]>;
}

export function p(name: string, kind: FaultParamInfo['kind'], description: string, opts: { required?: boolean; target?: boolean; default?: FaultParamValue; values?: string[]; example?: string } = {}): FaultParamInfo {
  return {
    name,
    kind,
    description,
    example: opts.example ?? (opts.default !== undefined ? String(opts.default) : ''),
    ...(opts.values ? { values: opts.values } : {}),
    ...(opts.default !== undefined ? { default: opts.default } : {}),
    required: opts.required ?? false,
    target: opts.target ?? false,
  };
}

export function info(id: string, title: string, category: FaultInfo['category'], params: FaultParamInfo[], meta: { description?: string; tags: string[]; clears: string; symptoms: string[]; usedBy: string[]; holdMs?: number; apiOnly?: boolean; injectable?: boolean }): FaultInfo {
  return {
    id,
    title,
    description: meta.description ?? title,
    category,
    owner: 'core',
    params,
    tags: meta.tags,
    clears: meta.clears,
    symptoms: meta.symptoms,
    usedBy: meta.usedBy,
    injectable: meta.injectable ?? true,
    holdMs: meta.holdMs ?? 0,
    apiOnly: meta.apiOnly ?? false,
  };
}

export function getPath(root: unknown, path: (string | number)[]): unknown {
  let cur: unknown = root;
  for (const k of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}

export function setPath(root: unknown, path: (string | number)[], value: unknown): void {
  let cur = root as Record<string | number, unknown>;
  for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]!] as Record<string | number, unknown>;
  const last = path[path.length - 1]!;
  if (value === undefined) delete cur[last];
  else cur[last] = value;
}

/** Write a leaf and record the undo patch. */
export function w(lab: LabState, record: Record_, path: (string | number)[], value: unknown): void {
  const before = clone(getPath(lab, path));
  setPath(lab, path, clone(value));
  record(path, before === undefined ? null : before, value === undefined ? null : clone(value));
}

export const ok = (target: string): Result<{ target: string }> => ({ ok: true, value: { target } });
export const nothing = (id: string, reason: string): Result<{ target: string }> => ({ ok: false, error: `fault ${id}: nothing to break (${reason})` });

export const str = (v: FaultParamValue | undefined): string => (v == null ? '' : Array.isArray(v) ? v.join(',') : String(v));
export const num = (v: FaultParamValue | undefined, d = 0): number => (v == null || v === '' ? d : Number(v));
export const list = (v: FaultParamValue | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean));

/** The rig a host Pi serves (single-rig Pis). */
export function rigOfPi(lab: LabState, hostId: string): string | null {
  for (const r of Object.values(lab.rigs)) if (r.piHostId === hostId) return r.id;
  return null;
}

/** The Pis serving the 12 physical rigs (8 touch Pis + the tethered and ADB shelf Pis). */
export const PHYSICAL_RIG_PIS = ['pi-wall-e', 'pi-eve', 'pi-bumblebee', 'pi-r2-d2', 'pi-johnny-5', 'pi-baymax', 'pi-seti', 'pi-rosie', 'pi-tethered', 'pi-adb-shelf'];
export const TOUCH_RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti', 'rosie'];

/**
 * Default revert (Sim §4.1.5): walk `undo` in reverse and write `before` at each path only if the current
 * value still deep-equals `after` (player / physics changes are left alone).
 */
export function undoPatches(lab: LabState, f: ActiveFault): void {
  for (let i = f.undo.length - 1; i >= 0; i--) {
    const u = f.undo[i]!;
    const cur = getPath(lab, u.path);
    if (!deepEqual(cur === undefined ? null : cur, u.after)) continue;
    const parent = getPath(lab, u.path.slice(0, -1));
    if (parent == null || typeof parent !== 'object') continue;
    // `before: null` on a created record deletes it; on a leaf that was null it restores null.
    const last = u.path[u.path.length - 1]!;
    const createdRecord = u.before === null && u.after !== null && typeof u.after === 'object' && !Array.isArray(u.after) && !(last in LEAF_NULLABLE);
    setPath(lab, u.path, createdRecord ? undefined : clone(u.before));
  }
}

/** Leaves whose legitimate "before" is null (never treated as a created record on revert). */
const LEAF_NULLABLE: Record<string, true> = { loadedConfig: true, magneticLock: true, armed: true, lastAction: true, order: true };
