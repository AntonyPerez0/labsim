/**
 * Capabilities (Sim §2.7), checkout / release (§3.4) and Match preview (§3.4.3).
 */
import type { CapabilityDocument, LabState, OrcaRobot, RobotStatus } from '../../types';
import { DEVICE_TYPE_CODES } from '../../types';
import type { CheckoutOutcome, CheckoutRequest, MatchPreviewRow } from '../../api';
import type { Ctx } from '../util';
import { statusLabel } from '../util';
import { DEVICE_TYPES } from '../../seed/deviceTypes';
import { addNote, audit, changeStatus, orcaDown, robotByName } from './status';
import { fmtStamp } from '../../text/time';
import { rigOf } from './entities';

export const CANONICAL_KEYS = ['deviceType', 'printer', 'physicalTouch', 'dip', 'tap', 'swipe', 'pinEntry', 'tethered', 'duo', 'adbOnly', 'testingProfile'];
const DERIVED = new Set(['deviceType', 'printer', 'physicalTouch', 'pinEntry', 'tethered', 'duo', 'adbOnly', 'testingProfile']);
const ENUM_ERR = (raw: string) => `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.${raw}`;

export function isDeviceTypeConstant(raw: string): boolean {
  return (DEVICE_TYPE_CODES as readonly string[]).includes(raw);
}

/** Robot capability document: derived keys ∪ linked rows, canonical order (Sim §1.3.4, §2.7.1). */
export function capabilityDocument(lab: LabState, robot: OrcaRobot): CapabilityDocument {
  const dev = robot.deviceId != null ? lab.orca.devices[robot.deviceId] : undefined;
  const info = dev ? DEVICE_TYPES[dev.deviceType] : undefined;
  const rig = rigOf(lab, robot);
  const physicalTouch = robot.rigKind === 'touch' || robot.rigKind === 'standalone';
  // PIN pad shows on the customer-facing display: a Duo's secondary, otherwise the primary.
  const pinDisplay = info?.dualScreenSingleAdb ? 'secondary' : 'primary';
  const probeDisplay = rig?.probeDisplay ?? (physicalTouch ? 'primary' : null);
  const doc: Record<string, string | boolean> = {};
  if (dev) doc.deviceType = dev.deviceType;
  doc.printer = info?.hasPrinter ?? false;
  doc.physicalTouch = physicalTouch;
  const linked: Record<string, string | boolean> = {};
  for (const cid of robot.capabilityIds) {
    const c = lab.orca.capabilities[cid];
    if (c) linked[c.key] = c.value;
  }
  for (const k of ['dip', 'tap', 'swipe']) if (k in linked) doc[k] = linked[k]!;
  doc.pinEntry = physicalTouch && probeDisplay === pinDisplay;
  doc.tethered = robot.mfdDeviceId != null;
  doc.duo = info?.dualScreenSingleAdb ?? false;
  doc.adbOnly = robot.rigKind === 'adb';
  if (info) doc.testingProfile = info.testingProfile;
  for (const k of Object.keys(linked).sort()) if (!(k in doc)) doc[k] = linked[k]!;
  return doc;
}

/** Keys Orca knows: derived + capability catalogue keys. */
function knownKey(lab: LabState, k: string): boolean {
  if (DERIVED.has(k)) return true;
  return Object.values(lab.orca.capabilities).some((c) => c.key === k);
}

function canonicalSort(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    const ia = CANONICAL_KEYS.indexOf(a);
    const ib = CANONICAL_KEYS.indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return a < b ? -1 : a > b ? 1 : 0;
  });
}

const fmtVal = (v: string | boolean) => String(v);
export function summary(req: Record<string, string | boolean>): string {
  return canonicalSort(Object.keys(req))
    .map((k) => `${k}=${fmtVal(req[k]!)}`)
    .join(', ');
}

/** NON_DYNAMIC map from a request (Record or legacy capability-name list). */
function nonDynamic(lab: LabState, caps: CheckoutRequest['capabilities']): Record<string, string | boolean> {
  if (!caps) return {};
  if (Array.isArray(caps)) {
    const out: Record<string, string | boolean> = {};
    for (const n of caps) {
      const c = Object.values(lab.orca.capabilities).find((x) => x.name === n);
      out[c ? c.key : n] = c ? c.value : true;
    }
    return out;
  }
  return { ...caps };
}

/** First key where the robot's document fails the requirement, as Match preview prints it. */
export function firstMismatch(doc: CapabilityDocument, req: Record<string, string | boolean>): string | null {
  for (const k of canonicalSort(Object.keys(req))) {
    const have = k in doc ? doc[k]! : false;
    if (have !== req[k]) return `${k}: required ${fmtVal(req[k]!)}, robot ${fmtVal(have)}`;
  }
  return null;
}

type Merged = { ok: true; req: Record<string, string | boolean>; sources: string } | { ok: false; code: CheckoutOutcome & { kind: 'fail' } };

/** Sim §3.4.2 steps 3–4: enum validation, merge, conflicts, unknown keys. */
function mergeRequirements(lab: LabState, req: CheckoutRequest, lines: string[]): Merged {
  const nd = nonDynamic(lab, req.capabilities);
  let dyn: Record<string, string | boolean> = {};
  if (req.dynamicCapabilitiesJson) {
    try {
      const parsed = JSON.parse(req.dynamicCapabilitiesJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) dyn[k] = typeof v === 'boolean' ? v : String(v);
      }
    } catch {
      dyn = {};
    }
  }
  const rawTypes = [req.deviceType, nd.deviceType, dyn.deviceType].filter((v): v is string => typeof v === 'string' && v !== '');
  for (const raw of rawTypes) {
    if (!isDeviceTypeConstant(raw)) {
      lines.push(ENUM_ERR(raw));
      return { ok: false, code: { kind: 'fail', code: 'ENUM_CASE', lines } };
    }
  }
  for (const k of canonicalSort(Object.keys(nd).filter((k) => k in dyn))) {
    if (nd[k] !== dyn[k]) {
      lines.push(`[orca] 409 Conflict: capability conflict (pipeline ${k}=${fmtVal(nd[k]!)}, test ${k}=${fmtVal(dyn[k]!)})`);
      return { ok: false, code: { kind: 'fail', code: 'CAPABILITY_CONFLICT', lines } };
    }
  }
  const merged: Record<string, string | boolean> = { ...nd, ...dyn };
  if (req.deviceType && !('deviceType' in merged)) merged.deviceType = req.deviceType;
  for (const k of canonicalSort(Object.keys(merged))) {
    if (!knownKey(lab, k)) {
      lines.push(`[orca] 400 Bad Request: unknown capability '${k}'`);
      return { ok: false, code: { kind: 'fail', code: 'UNKNOWN_CAPABILITY', lines } };
    }
  }
  const src = req.dynamicSource ?? 'test definition';
  const hasNd = Object.keys(nd).length > 0;
  const hasDyn = !!req.dynamicCapabilitiesJson;
  const sources = hasNd && hasDyn ? `non-dynamic + dynamic: ${src}` : hasDyn ? `dynamic: ${src}` : 'non-dynamic';
  return { ok: true, req: merged, sources };
}

const buildNumber = (buildId: string) => {
  const m = /#(\d+)$/.exec(buildId);
  return m ? m[1]! : buildId;
};
export function inUseLabel(robot: OrcaRobot): string {
  const c = robot.checkout!;
  return c.kind === 'jenkins' ? `Jenkins #${buildNumber(c.buildId)}` : `local run ${c.buildId}`;
}

function candidateSkip(robot: OrcaRobot): string | null {
  if (robot.checkout) return `in use by ${inUseLabel(robot)} — skipped`;
  switch (robot.status) {
    case 'RESERVED':
      return 'Reserved — skipped';
    case 'CONNECTION_FAILED':
      return 'Connection Failed — skipped';
    case 'OFFLINE':
      return 'Offline — skipped';
    case 'UNAVAILABLE':
      return 'Unavailable — skipped (name it to use it)';
    default:
      return null;
  }
}

function deviceTypeOf(lab: LabState, robot: OrcaRobot): string {
  const dev = robot.deviceId != null ? lab.orca.devices[robot.deviceId] : undefined;
  return dev?.deviceType ?? '?';
}

function doCheckout(lab: LabState, ctx: Ctx, robot: OrcaRobot, req: CheckoutRequest, byName: boolean, kind: 'jenkins' | 'local'): void {
  robot.checkout = { buildId: req.buildId, jobId: req.jobId, byName, startedMs: lab.time.nowMs, statusAtCheckout: robot.status, kind };
  audit(lab, req.kind === 'manual' ? 'player' : 'jenkins', 'CHECKOUT', 'robot', robot.id);
  ctx.emit('robot.checkedOut', { robotId: robot.id, name: robot.name, buildId: req.buildId, byName, jobId: req.jobId, kind: req.kind === 'manual' ? 'manual' : kind });
}

/** Orca checkout (Sim §3.4.2). Wait outcomes reprint skip lines only when the reasons change. */
export function checkout(lab: LabState, ctx: Ctx, req: CheckoutRequest): CheckoutOutcome {
  const lines: string[] = [];
  const robotName = (req.robotName ?? '').trim();
  const environment = req.environment ?? 'DEV1';
  const rawType = typeof req.deviceType === 'string' && req.deviceType !== '' ? req.deviceType : null;
  const reqLabel = rawType ? `deviceType=${rawType}` : robotName ? `name=${robotName}` : '';
  const reject = (code: CheckoutOutcome & { kind: 'fail' }): CheckoutOutcome => {
    ctx.emit('orca.checkoutRejected', robotName ? { buildId: req.buildId, jobId: req.jobId, reason: code.lines[code.lines.length - 1] ?? code.code, robotName, code: code.code } : { buildId: req.buildId, jobId: req.jobId, reason: code.lines[code.lines.length - 1] ?? code.code, code: code.code });
    return code;
  };
  const down = orcaDown(lab);
  if (down) {
    const tail = down === '500 Internal Server Error' ? '500' : down;
    lines.push(`[orca] checkout request ${reqLabel ? `${reqLabel} ` : ''}→ ${tail}`);
    return reject({ kind: 'fail', code: down.startsWith('500') ? 'ORCA_DB_DOWN' : 'ORCA_DOWN', lines });
  }
  if (rawType) lines.push(`[orca] checkout request deviceType=${rawType}`);
  const merged = mergeRequirements(lab, req, lines);
  if (!merged.ok) return reject(merged.code);
  const R = merged.req;
  if (Object.keys(R).length) lines.push(`[orca] capabilities: ${summary(R)} (${merged.sources})`);
  const kind: 'jenkins' | 'local' = req.kind === 'manual' ? 'local' : 'jenkins';

  if (robotName) {
    const robot = robotByName(lab, robotName);
    if (!robot) {
      lines.push(`[orca] 404 Not Found: no robot named '${robotName}'`);
      return reject({ kind: 'fail', code: 'ROBOT_NOT_FOUND', lines });
    }
    if (robot.status === 'RESERVED' || robot.status === 'OFFLINE' || robot.status === 'CONNECTION_FAILED') {
      lines.push(`[orca] 409 Conflict: robot ${robot.name} is ${statusLabel(robot.status)}${robot.status === 'RESERVED' ? ` (${robot.reservedBy ?? 'unknown'})` : ''}`);
      return reject({ kind: 'fail', code: 'ROBOT_BLOCKED', lines });
    }
    if (robot.checkout && robot.checkout.buildId !== req.buildId) {
      const reason = `[orca] robot ${robot.name} is in use by ${inUseLabel(robot)} — waiting`;
      const out: CheckoutOutcome = { kind: 'wait', label: robot.name, reasons: [reason], lines: changedLines(lab, req.buildId, [...lines, reason]) };
      if (out.lines.length) ctx.emit('robot.checkoutWaiting', { buildId: req.buildId, jobId: req.jobId, label: robot.name, reasons: [reason] });
      return out;
    }
    doCheckout(lab, ctx, robot, req, true, kind);
    lines.push(`Checked out robot ${robot.name} (named)`);
    return { kind: 'ok', robotId: robot.id, robotName: robot.name, byName: true, lines };
  }

  // Unnamed: environment + capability match, LRU order (Sim §3.4.2 #6).
  const candidates = Object.values(lab.orca.robots)
    .filter((r) => r.environment === environment && firstMismatch(capabilityDocument(lab, r), R) === null)
    .sort((a, b) => (a.lastReleasedMs ?? -Infinity) - (b.lastReleasedMs ?? -Infinity) || a.id - b.id);
  const label = typeof R.deviceType === 'string' ? R.deviceType : summary(R);
  if (candidates.length === 0) {
    lines.push(`[orca] No robot matches ${summary(R)}`);
    return reject({ kind: 'fail', code: 'NO_MATCH', lines });
  }
  const pick = candidates.find((r) => r.status === 'AVAILABLE' && !r.checkout);
  if (pick) {
    doCheckout(lab, ctx, pick, req, false, kind);
    lines.push(`[orca] checkout → ${pick.name} (${deviceTypeOf(lab, pick)}) OK`);
    return { kind: 'ok', robotId: pick.id, robotName: pick.name, byName: false, lines };
  }
  if (candidates.every((r) => r.status === 'UNAVAILABLE')) {
    const names = candidates.map((r) => r.name);
    lines.push(`No Available robot matches ${label} (${names.join(', ')} ${names.length > 1 ? 'are' : 'is'} Unavailable)`);
    return reject({ kind: 'fail', code: 'ONLY_UNAVAILABLE', lines });
  }
  const reasons = candidates.map((r) => `[orca] candidate ${r.name}: ${candidateSkip(r) ?? 'Available — skipped'}`);
  const waitLabel = typeof R.deviceType === 'string' ? R.deviceType : 'matching';
  const tail = `[orca] no Available ${waitLabel} robot — build waiting in queue`;
  const newLines = changedLines(lab, req.buildId, [...lines, ...reasons, tail]);
  if (newLines.length) ctx.emit('robot.checkoutWaiting', { buildId: req.buildId, jobId: req.jobId, label: waitLabel, reasons });
  return { kind: 'wait', label: waitLabel, reasons, lines: newLines };
}

/** Wait lines are reprinted only when the set of reasons changes (Sim §3.4.2 #6): compare with the build console tail. */
function changedLines(lab: LabState, buildId: string, lines: string[]): string[] {
  const consoleLines = lab.jenkins?.builds?.[buildId]?.console;
  if (!consoleLines || consoleLines.length < lines.length) return lines;
  const reasonLines = lines.filter((l) => l.startsWith('[orca] candidate') || l.includes('— waiting') || l.includes('build waiting in queue'));
  if (!reasonLines.length) return lines;
  // Find the last printed block of reason lines.
  const lastTail = consoleLines.lastIndexOf(reasonLines[reasonLines.length - 1]!);
  if (lastTail < 0) return lines;
  const prevBlock: string[] = [];
  for (let i = lastTail; i >= 0; i--) {
    const l = consoleLines[i]!;
    if (l.startsWith('[orca] candidate') || l.includes('— waiting') || l.includes('build waiting in queue')) prevBlock.unshift(l);
    else if (prevBlock.length) break;
  }
  const same = prevBlock.length === reasonLines.length && prevBlock.every((l, i) => l === reasonLines[i]);
  return same ? [] : lines;
}

/** Release (Sim §3.4.5): always; named auto-reset back to Unavailable. */
export function release(lab: LabState, ctx: Ctx, robotId: number, buildId: string): { lines: string[]; statusAfter: RobotStatus } {
  const robot = lab.orca.robots[robotId];
  if (!robot) return { lines: [], statusAfter: 'AVAILABLE' };
  const co = robot.checkout;
  if (!co || (buildId && co.buildId !== buildId)) return { lines: [], statusAfter: robot.status };
  robot.checkout = null;
  robot.lastReleasedMs = lab.time.nowMs;
  if (co.byName && co.statusAtCheckout === 'UNAVAILABLE' && robot.status !== 'UNAVAILABLE') {
    const from = robot.status;
    const jobRef = `${co.jobId}#${buildNumber(co.buildId)}`;
    if (from === 'RESERVED') {
      robot.reservedBy = null;
      robot.reservedAtMs = null;
    }
    if (from === 'CONNECTION_FAILED') robot.preFailureStatus = null;
    changeStatus(lab, ctx, robot, 'UNAVAILABLE', 'orca', `named job ${jobRef} finished`);
    addNote(lab, ctx, robot, 'STATUS', 'orca', `${fmtStamp(lab.time, lab.time.nowMs)} STATUS ${statusLabel(from)} → Unavailable (orca: named job ${jobRef} finished)`);
  }
  audit(lab, 'jenkins', 'RELEASE', 'robot', robot.id);
  ctx.emit('robot.released', { robotId: robot.id, name: robot.name, buildId: co.buildId, statusAfter: robot.status });
  return { lines: [`[orca] released ${robot.name} → ${statusLabel(robot.status)}`], statusAfter: robot.status };
}

/** Match preview (Sim §3.4.3): steps 4 + 6 without side effects. */
export function matchPreview(lab: LabState, caps: Record<string, string | boolean>, environment = 'DEV1'): MatchPreviewRow[] {
  return Object.values(lab.orca.robots)
    .sort((a, b) => a.id - b.id)
    .map((r) => {
      const doc = capabilityDocument(lab, r);
      const mismatch = r.environment !== environment ? `environment: required ${environment}, robot ${r.environment}` : firstMismatch(doc, caps);
      return { robotId: r.id, robot: r.name, status: r.status, environment: r.environment, matches: mismatch === null, firstMismatch: mismatch };
    });
}

/** Parse Match preview input (capability JSON object text). */
export function parseCapsJson(text: string): { ok: true; caps: Record<string, string | boolean> } | { ok: false; error: string } {
  try {
    const v = JSON.parse(text) as unknown;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, error: '400 Bad Request: capabilities must be a JSON object' };
    const out: Record<string, string | boolean> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = typeof x === 'boolean' ? x : String(x);
    return { ok: true, caps: out };
  } catch (e) {
    return { ok: false, error: `400 Bad Request: ${(e as Error).message}` };
  }
}
