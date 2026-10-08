/**
 * Incident instantiation helpers: variant resolution, rig binding (GP §3.1 roster + role tags), seeded
 * truth and templated texts. Pure apart from the RNG draws.
 */
import type { RngState } from '@/core/rng';
import { nextFloat, pick } from '@/core/rng';
import type { HeatLevel } from '@/core/state';
import type { LabState } from '@/sim/types';
import { RIG_BY_ID } from '@/world/layout';
import type { BindContext, IncidentBinding, IncidentDef, IncidentVariant, RoleTag, Templated } from '../../types';
import { MODELLED_RIGS, ROSTER } from './config';
import { deviceRowById, hostById, robotByName, runtimeDevice } from '../lookups';

/** The incident definition with a variant's overrides applied. */
export function resolveVariant(def: IncidentDef, variantId: string): IncidentDef {
  if (variantId === 'A' || !def.variants?.length) return def;
  const v = def.variants.find((x) => x.id === variantId);
  return v ? ({ ...def, ...v.overrides } as IncidentDef) : def;
}

/** Variants eligible at a heat (A = base always). */
export function eligibleVariants(def: IncidentDef, heat: HeatLevel | null): { id: string; weight: number }[] {
  const out = [{ id: 'A', weight: 1 }];
  for (const v of def.variants ?? []) {
    if (v.id === 'A') continue;
    if (heat !== null && v.minHeat && heat < v.minHeat) continue;
    out.push({ id: v.id, weight: v.weight ?? 1 });
  }
  return out;
}

export function pickVariant(def: IncidentDef, heat: HeatLevel | null, rng: RngState, uniform: boolean): string {
  const vs = eligibleVariants(def, heat);
  if (uniform) return pick(rng, vs).id;
  const total = vs.reduce((a, v) => a + v.weight, 0);
  let r = nextFloat(rng) * total;
  for (const v of vs) {
    r -= v.weight;
    if (r <= 0) return v.id;
  }
  return vs[vs.length - 1]!.id;
}

export function variantLabel(def: IncidentDef, variantId: string): string {
  if (variantId === 'A') return 'Base';
  return def.variants?.find((v: IncidentVariant) => v.id === variantId)?.label ?? variantId;
}

/** Role tags of a rig: world layout tags ∪ GP roster tags. */
export function rigRoles(rig: string): string[] {
  const world = (RIG_BY_ID as Record<string, { roleTags?: readonly string[] } | undefined>)[rig]?.roleTags ?? [];
  const roster = ROSTER[rig]?.roles ?? [];
  return [...new Set([...world, ...roster])];
}

export function rigsWithRoles(roles: readonly string[]): string[] {
  return MODELLED_RIGS.filter((r) => roles.every((t) => rigRoles(r).includes(t)));
}

/** Conventional binding vars for a rig (live lab first, GP §3.1 roster as fallback). */
export function defaultVars(lab: Readonly<LabState>, rig: string): Record<string, string | number | boolean> {
  const ro = ROSTER[rig];
  const rs = lab.rigs?.[rig];
  const robot = robotByName(lab as LabState, rig);
  const vars: Record<string, string | number | boolean> = {};
  const pi = rs?.piHostId ?? ro?.pi;
  if (pi) {
    vars.pi = pi;
    vars.piIp = hostById(lab as LabState, pi)?.ip ?? ro?.piIp ?? '';
  }
  const devId = rs?.deviceIds?.[0] ?? (ro ? `dev-${ro.device}` : null);
  const dev = devId ? runtimeDevice(lab as LabState, devId) ?? runtimeDevice(lab as LabState, ro?.device) : null;
  if (dev) vars.dev = dev.id;
  else if (devId) vars.dev = devId;
  const row = robot ? deviceRowById(lab as LabState, robot.deviceId) : null;
  vars.device = row?.name ?? ro?.device ?? '';
  vars.deviceIp = row?.ip ?? dev?.ip ?? ro?.deviceIp ?? '';
  vars.deviceType = row?.deviceType ?? dev?.type ?? ro?.deviceType ?? '';
  const box = rs?.callusHostId ?? ro?.box;
  if (box) {
    vars.box = box;
    vars.boxIp = hostById(lab as LabState, box)?.ip ?? '';
  }
  vars.probe = rs?.collisId ?? `collis-${rig}`;
  if (ro?.rack) vars.rack = ro.rack;
  if (ro?.fuse) vars.fuse = ro.fuse;
  if (ro?.camera) vars.camera = ro.camera;
  const camUrl = robot?.cameraStreamUrl ?? ro?.cameraUrl;
  if (camUrl) vars.cameraUrl = camUrl;
  vars.hrn = robot?.humanReadableName ?? ro?.hrn ?? rig.toUpperCase();
  vars.healthUrl = vars.piIp ? `http://${vars.piIp}:8000/health` : '';
  return vars;
}

export function hrnOf(lab: Readonly<LabState>, rig: string | null): string | null {
  if (!rig) return null;
  return robotByName(lab as LabState, rig)?.humanReadableName ?? ROSTER[rig]?.hrn ?? rig.toUpperCase();
}

/** Rigs that share a rack / Callus box / Pi with `rig` (binding scopes). */
export function scopeRigs(lab: Readonly<LabState>, rig: string, scope: IncidentDef['rigs']['scope']): string[] {
  const v = defaultVars(lab, rig);
  switch (scope) {
    case 'rack':
      return MODELLED_RIGS.filter((r) => ROSTER[r]?.rack === v.rack && ROSTER[r]?.rack !== undefined);
    case 'callus-box':
      return v.box ? MODELLED_RIGS.filter((r) => defaultVars(lab, r).box === v.box) : [rig];
    case 'shared-pi':
      return MODELLED_RIGS.filter((r) => defaultVars(lab, r).pi === v.pi);
    case 'all':
      return [...MODELLED_RIGS];
    default:
      return [rig];
  }
}

export function makeBindContext(lab: Readonly<LabState>, rng: RngState, variant: string, preferRig: string | null, busyRigs: readonly string[]): BindContext {
  return {
    lab,
    rng,
    variant,
    preferRig,
    busyRigs,
    rigsWithRoles: (roles: readonly RoleTag[]) => rigsWithRoles(roles),
    defaultVars: (rig: string) => defaultVars(lab, rig),
  };
}

/** Candidate rigs for an incident (before excluding busy ones). */
export function candidateRigs(def: IncidentDef): string[] {
  if (def.rigs.scope === 'none') return [];
  if (def.rigs.candidates?.length) return [...def.rigs.candidates];
  if (def.rigs.roles?.length) return rigsWithRoles(def.rigs.roles);
  return def.rigs.default ? [def.rigs.default] : [...MODELLED_RIGS];
}

/**
 * Bind an incident: custom binder or roster pick. `mode` = `default` (Free Play pre-selects the default
 * rig), `random` (shift/daily/cert: uniform among free candidates). Returns null when no rig is free.
 */
export function bindIncident(
  def: IncidentDef,
  variant: string,
  lab: Readonly<LabState>,
  rng: RngState,
  opts: { preferRig: string | null; busyRigs: readonly string[]; mode: 'default' | 'random'; seed: number; allowBusy?: boolean },
): IncidentBinding | null {
  if (def.bind) {
    try {
      const b = def.bind(makeBindContext(lab, rng, variant, opts.preferRig, opts.busyRigs));
      if (b) return { ...b, variant, seed: b.seed || opts.seed };
      return null;
    } catch (err) {
      console.warn(`[missions] custom binder of ${def.id} threw`, err);
    }
  }
  if (def.rigs.scope === 'none') return { rig: null, hrn: null, rigs: [], vars: {}, seed: opts.seed, variant };
  const busy = new Set(opts.allowBusy ? [] : opts.busyRigs);
  const cands = candidateRigs(def);
  const free = cands.filter((r) => !busy.has(r) && !scopeRigs(lab, r, def.rigs.scope).some((x) => busy.has(x)));
  let rig: string | null = null;
  if (opts.preferRig && (cands.includes(opts.preferRig) || !cands.length) && !busy.has(opts.preferRig)) rig = opts.preferRig;
  else if (opts.mode === 'default' && def.rigs.default && free.includes(def.rigs.default)) rig = def.rigs.default;
  else if (free.length) rig = pick(rng, free);
  if (!rig) return null;
  const rigs = scopeRigs(lab, rig, def.rigs.scope);
  return { rig, hrn: hrnOf(lab, rig), rigs, vars: defaultVars(lab, rig), seed: opts.seed, variant };
}

/** Add seeded truth (`vars['truth.<key>']`). */
export function addTruth(def: IncidentDef, b: IncidentBinding, lab: Readonly<LabState>, rng: RngState): IncidentBinding {
  if (!def.truth) return b;
  try {
    const t = def.truth(b, lab, rng);
    const vars = { ...b.vars };
    for (const [k, v] of Object.entries(t)) vars[`truth.${k}`] = v;
    return { ...b, vars };
  } catch (err) {
    console.warn(`[missions] truth of ${def.id} threw`, err);
    return b;
  }
}

export function tpl(t: Templated | undefined, b: IncidentBinding): string {
  if (t === undefined) return '';
  try {
    return typeof t === 'function' ? t(b) : t;
  } catch (err) {
    console.warn('[missions] template threw', err);
    return '';
  }
}

/** GP §3.6 incident category for certification mixes. */
export function incidentCategory(def: IncidentDef): 'hardware' | 'orca' | 'code-config' {
  const tags = def.tags;
  if (tags.some((t) => t.startsWith('power.') || t.startsWith('hw.') || t === 'cards.callus' || t === 'hw.collis')) return 'hardware';
  if (tags.some((t) => t.startsWith('uia.') || t.startsWith('pigeon.') || t.startsWith('adb.') || t.startsWith('jenkins.') || t.startsWith('tools.') || t.startsWith('receipt.'))) return 'code-config';
  return 'orca';
}
