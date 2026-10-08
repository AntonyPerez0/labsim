/**
 * Shared runner engine (Sim §3.19–§3.21): executes a compiled `RunnerState` plan step by step over
 * physical time, for Jenkins builds and local IntelliJ runs alike. Steps act on the lab only through
 * CoreServices (xy_touch, card actions, ADB, touches, layouts, OCR) and read device screens from state.
 */
import type { TxContext } from '@/core/store';
import type { TerminalDevice, LabState, OrcaRobot, RunnerState, RunnerStep, ScreenName } from '../../types';
import { core } from '../coreRef';

/** Who owns the run: a Jenkins build or a local IntelliJ run. Rebuilt every tick (holds closures). */
export interface RunnerHost {
  kind: 'build' | 'local';
  id: string;
  out(lines: string[]): void;
  /** Host the runner executes on: 'jenkins-vm' (CI) or 'ws-17' (local). */
  fromHost: string;
  robot: OrcaRobot | null;
  /** CI: injected env; local: config-derived equivalents (RUN_TYPE, DEVICE_FAMILY, …). */
  env: Record<string, string>;
  /** Repo tree the code facts are evaluated on (test repo at the run's commit / working tree). */
  tree: Record<string, string>;
  actor: string;
}

export interface RC {
  lab: LabState;
  ctx: TxContext;
  host: RunnerHost;
  rs: RunnerState;
}

export type Outcome =
  | 'done'
  | 'poll'
  | { sleep: number }
  | { fail: string; lines: string[] }
  /** Jump to a step id (e.g. a test's teardown) after recording a failure. */
  | { failJump: string; code: string; lines: string[] };

export type StepHandler = (rc: RC, step: RunnerStep) => Outcome;

const HANDLERS: Record<string, StepHandler> = {};
export function registerOps(ops: Record<string, StepHandler>): void {
  Object.assign(HANDLERS, ops);
}

export const TIMEOUT_MS = 10_000;

export function newRunner(kind: RunnerState['kind'], steps: RunnerStep[], vars: Record<string, string> = {}): RunnerState {
  return { kind, steps, pc: 0, vars, focus: null, handles: { mfd: null, cfd: null }, waitingFor: null, passedSteps: 0, totalSteps: steps.length };
}

/* ── scratch vars (per current step) ── */
export const sv = (rc: RC, k: string): string | undefined => rc.rs.vars[`_s.${k}`];
export const ssv = (rc: RC, k: string, v: string | number): void => {
  rc.rs.vars[`_s.${k}`] = String(v);
};
export const svn = (rc: RC, k: string): number | null => {
  const v = sv(rc, k);
  return v === undefined ? null : Number(v);
};
function clearScratch(rs: RunnerState): void {
  for (const k of Object.keys(rs.vars)) if (k.startsWith('_s.')) delete rs.vars[k];
}

export const now = (rc: RC): number => rc.lab.time.physMs;
export const out = (rc: RC, ...lines: string[]): void => rc.host.out(lines);

/** Runner finished? */
export const runnerDone = (rs: RunnerState): boolean => rs.vars['_result'] !== undefined;
export const runnerPassed = (rs: RunnerState): boolean => rs.vars['_result'] === 'pass';
export const runnerUnstable = (rs: RunnerState): boolean => rs.vars['_unstable'] === '1';
export const runnerFailure = (rs: RunnerState): string | null => rs.vars['_failCode'] ?? null;

function roleOf(step: RunnerStep): 'MFD' | 'CFD' | 'DEVICE' {
  return step.role === 'MFD' || step.role === 'CFD' ? step.role : 'DEVICE';
}

/**
 * Advance a runner as far as possible at the current instant. Returns true when it finished during
 * this call. Failures record `_failCode` (first failure wins) and either end the run or jump.
 */
export function advanceRunner(rc: RC, buildId: string | null): boolean {
  const rs = rc.rs;
  if (runnerDone(rs)) return false;
  for (let guard = 0; guard < 64; guard++) {
    if (rs.pc >= rs.steps.length) {
      rs.vars['_result'] = rs.vars['_failed'] ? 'fail' : 'pass';
      rs.waitingFor = null;
      return true;
    }
    const until = svn(rc, 'sleepUntil');
    if (until !== null && now(rc) < until) return false;
    // A physical xy_touch answers when its stroke completes (Sim §3.5.2 #8): wait for the rig to finish it.
    const req = sv(rc, 'xyReq');
    if (req !== undefined) {
      if (xyPending(rc, req)) return false;
      delete rs.vars['_s.xyReq'];
    }
    const step = rs.steps[rs.pc]!;
    const h = HANDLERS[step.op];
    let r: Outcome;
    if (!h) r = { fail: 'ASSERTION', lines: [`[runner] internal: unknown step op '${step.op}'`] };
    else r = h(rc, step);
    if (r === 'poll') return false;
    if (typeof r === 'object' && 'sleep' in r) {
      ssv(rc, 'sleepUntil', now(rc) + Math.max(0, r.sleep));
      if (r.sleep > 0) return false;
      continue;
    }
    const emitStep = (ok: boolean, detail?: string): void => {
      if (step.args['silent']) return;
      rc.ctx.emit('runner.step', { runId: rc.host.id, step: step.label, deviceRole: roleOf(step), ok, ...(detail ? { detail } : {}), index: rs.pc + 1, total: rs.steps.length, buildId });
    };
    if (r === 'done') {
      emitStep(true);
      if (step.args['logical']) rs.vars[`_ok.${step.args['logical']}`] = '1';
      rs.passedSteps++;
      clearScratch(rs);
      rs.waitingFor = null;
      rs.pc++;
      continue;
    }
    // failure
    const code = 'fail' in r ? r.fail : r.code;
    out(rc, ...r.lines);
    emitStep(false, r.lines[r.lines.length - 1]);
    if (!rs.vars['_failCode']) rs.vars['_failCode'] = code;
    rs.vars['_failed'] = '1';
    clearScratch(rs);
    rs.waitingFor = null;
    if ('failJump' in r) {
      const idx = rs.steps.findIndex((s, i) => i > rs.pc && s.id === r.failJump);
      if (idx >= 0) {
        rs.pc = idx;
        continue;
      }
    }
    rs.vars['_result'] = 'fail';
    return true;
  }
  return false;
}

/** Stop a runner now (abort / Stop button). */
export function stopRunner(rs: RunnerState, code: string): void {
  if (runnerDone(rs)) return;
  rs.vars['_failCode'] ??= code;
  rs.vars['_result'] = 'fail';
  rs.waitingFor = null;
}

/* ────────────────────────────── Device helpers ────────────────────────────── */

export function deviceByIp(lab: LabState, ip: string): TerminalDevice | null {
  const r = core().resolve(lab, ip);
  if (r.deviceId && lab.devices[r.deviceId]) return lab.devices[r.deviceId]!;
  return Object.values(lab.devices).find((d) => d.ip === ip) ?? null;
}

/** Device + display a role acts on (Duo: CFD = secondary display of the same device). */
export function target(rc: RC, role: string): { device: TerminalDevice; display: 'primary' | 'secondary'; handle: string } | null {
  // A standalone Station Duo has one handle: its customer display is display 1 of the same device.
  const mfd = rc.rs.handles.mfd;
  const duoCfd = role === 'CFD' && !rc.rs.handles.cfd && mfd && deviceByIp(rc.lab, mfd.split(':')[0]!)?.secondaryDisplay ? mfd : null;
  const h = role === 'CFD' ? (rc.rs.handles.cfd ?? duoCfd) : mfd;
  if (!h) return null;
  const ip = h.split(':')[0]!;
  const device = deviceByIp(rc.lab, ip);
  if (!device) return null;
  const sameAsMfd = role === 'CFD' && rc.rs.handles.mfd === h && !!device.secondaryDisplay;
  return { device, display: sameAsMfd ? 'secondary' : 'primary', handle: h };
}

export function screenOf(d: TerminalDevice, display: 'primary' | 'secondary'): ScreenName {
  return (display === 'secondary' ? d.secondaryDisplay?.screen : d.display.screen) ?? 'off';
}
export function displayOf(d: TerminalDevice, display: 'primary' | 'secondary') {
  return display === 'secondary' && d.secondaryDisplay ? d.secondaryDisplay : d.display;
}

/** Page-object names for messages (Sim §3.19.7). */
export function pageObjectName(d: TerminalDevice, display: 'primary' | 'secondary'): string {
  const s = screenOf(d, display);
  const duo = !!d.secondaryDisplay;
  switch (s) {
    case 'home':
      return 'HomeScreen';
    case 'lock':
      return 'LockScreen';
    case 'register':
      return d.order && (d.order.lines.length > 0 || d.order.status === 'paid') ? 'RegisterOrderScreen' : 'RegisterHomeScreen';
    case 'review-order':
      return 'ReviewOrderScreen';
    case 'tender-select':
      return 'PaymentScreen';
    case 'payment-prompt':
      return 'PaymentPromptScreen';
    case 'customer-cart':
      return duo ? 'CfdTotalsScreen' : 'CustomerOrderScreen';
    case 'tip':
      return 'TipScreen';
    case 'receipt-options':
      return 'ReceiptScreen';
    case 'thank-you':
      return 'ThankYouScreen';
    case 'waiting-for-merchant':
      return 'WaitingForMerchantScreen';
    default:
      return s
        .split('-')
        .map((w) => w[0]!.toUpperCase() + w.slice(1))
        .join('') + 'Screen';
  }
}

/** Orca screen name for the runtime screen (Sim §2.10.1); CFD_* on a Duo's secondary display. */
export function orcaScreenFor(d: TerminalDevice, display: 'primary' | 'secondary'): string | null {
  const disp = displayOf(d, display);
  const base: Partial<Record<ScreenName, string>> = {
    home: 'HOME',
    register: 'REGISTER_HOME',
    'review-order': 'REVIEW_ORDER',
    'tender-select': 'PAYMENT',
    'cash-discount-tender': 'TENDER_CASH_DISCOUNT',
    'payment-prompt': 'PAYMENT_PROMPT',
    'pin-entry': 'PIN_ENTRY',
    tip: 'TIP',
    signature: 'SIGNATURE',
    approved: 'APPROVED',
    'customer-cart': 'CUSTOMER_CART',
    'receipt-done': 'RECEIPT_DONE',
    'thank-you': 'THANK_YOU',
  };
  let name: string | null = disp.screen === 'receipt-options' ? `RECEIPT_OPTIONS_${disp.receiptOptions ?? 4}` : (base[disp.screen] ?? null);
  if (!name) return null;
  if (display === 'secondary') name = name === 'CUSTOMER_CART' ? 'CFD_CART' : `CFD_${name}`;
  return name;
}

/** Rendered? (Sim §3.19.5: `renderDoneMs` null = treat as rendered.) */
export function rendered(rc: RC, d: TerminalDevice, display: 'primary' | 'secondary'): boolean {
  const r = displayOf(d, display).renderDoneMs;
  return r === null || r === undefined || r <= now(rc);
}

/**
 * `adb -s <handle> …` from a runner. Local runs share the workstation's adb server (handles are its
 * connections); a CI executor has its own adb server, so a handle the workstation never connected is
 * addressed by the device serial (sim-core's `adbShell` resolves workstation connections or serials).
 */
export function runnerAdb(rc: RC, handle: string, argv: string[]): ReturnType<ReturnType<typeof core>['adbShell']> {
  const known = rc.lab.workstation.adbConnections.some((c) => c.target === handle);
  let target = handle;
  if (!known) {
    const d = deviceByIp(rc.lab, handle.slice(0, handle.lastIndexOf(':') >= 0 ? handle.lastIndexOf(':') : handle.length));
    if (d) target = d.serial;
  }
  return core().adbShell(rc.lab, rc.ctx, target, argv, 'runner');
}

/** Parse uiautomator dump XML into nodes. */
export function parseDump(xml: string): { text: string; resourceId: string; bounds: [number, number, number, number] | null }[] {
  const out: { text: string; resourceId: string; bounds: [number, number, number, number] | null }[] = [];
  const re = /<node\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs: Record<string, string> = {};
    const ar = /([\w-]+)="([^"]*)"/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[1]!))) attrs[a[1]!] = a[2]!.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const b = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(attrs['bounds'] ?? '');
    out.push({ text: attrs['text'] ?? '', resourceId: attrs['resource-id'] ?? '', bounds: b ? [Number(b[1]), Number(b[2]), Number(b[3]), Number(b[4])] : null });
  }
  return out;
}

/**
 * UI Automator click on `text` (hierarchy → tap at the element's centre, Sim §3.19.3). Primary display:
 * `adb shell input tap` through the device handle (so coworker devices are "driven", §3.15.1);
 * secondary display (UIA 2.3 displayId): injected touch on display 1.
 * Returns null on success or the UiObjectNotFoundException text.
 */
export function uiaClick(rc: RC, role: string, text: string): string | null {
  const t = target(rc, role);
  if (!t) return `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=${text}]`;
  const notFound = `androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=${text}]`;
  if (t.display === 'secondary') {
    if (rc.lab.flags.uiaVersion !== '2.3') return notFound;
    const b = core().layout(rc.lab, t.device.id, 'secondary').find((x) => x.id === text && x.visible);
    if (!b) return notFound;
    core().touch(rc.lab, rc.ctx, t.device.id, 'secondary', b.xMm, b.yMm, 'adb');
    return null;
  }
  const xml = core().uiDump(rc.lab, t.device.id, 'primary');
  const node = parseDump(xml).find((n) => n.text === text && n.bounds);
  if (node && node.bounds) {
    const [l, tp, r, bt] = node.bounds;
    const x = Math.round((l + r) / 2);
    const y = Math.round((tp + bt) / 2);
    runnerAdb(rc, t.handle, ['shell', 'input', 'tap', String(x), String(y)]);
    return null;
  }
  const b = core().layout(rc.lab, t.device.id, 'primary').find((x) => x.id === text && x.visible);
  if (!b) return notFound;
  core().touch(rc.lab, rc.ctx, t.device.id, 'primary', b.xMm, b.yMm, 'adb');
  return null;
}

/** Text labels visible on a display (layout labels, falling back to the dump). */
export function visibleTexts(rc: RC, device: TerminalDevice, display: 'primary' | 'secondary'): string[] {
  const labels = core()
    .layout(rc.lab, device.id, display)
    .filter((b) => b.visible)
    .map((b) => b.id);
  if (labels.length || display === 'secondary') return labels;
  return parseDump(core().uiDump(rc.lab, device.id, 'primary')).map((n) => n.text);
}

/** Does the rig's gantry cover this display? (physical taps through Orca xy_touch, Sim §3.19.3) */
export function probeCovers(rc: RC, display: 'primary' | 'secondary'): boolean {
  const r = rc.host.robot;
  if (!r) return false;
  const rig = rc.lab.rigs[r.name];
  return !!rig && rig.hasGantry && rig.probeDisplay === display;
}

export function fmtMm(n: number): string {
  return (Math.round(n * 10) / 10).toFixed(1);
}

/**
 * Who calls Orca on behalf of a runner. A build that holds the robot's checkout identifies itself by
 * its build id (Orca's lock check, Sim §3.5.2 #6: the holder may drive the robot); otherwise `jenkins`
 * for CI and the run's actor for local runs (Orca has no record of local runs, §3.4.4).
 */
export function orcaActor(rc: RC): string {
  const r = rc.host.robot;
  const holder = r ? rc.lab.orca.robots[r.id]?.checkout?.buildId : undefined;
  if (holder && holder === rc.host.id) return rc.host.id;
  return rc.host.kind === 'build' ? 'jenkins' : rc.host.actor;
}

/** Orca xy_touch from a runner with the console line (Sim §3.19.3). */
export function runnerXyTouch(rc: RC, screen: string, button: string, prefix = '[orca]'): { ok: true; respondsAfterMs: number } | { ok: false; line: string } {
  const r = rc.host.robot;
  if (!r) return { ok: false, line: `${prefix} xy_touch ? ${screen}/${button} → 404 Not Found: no robot` };
  const res = core().xyTouch(rc.lab, rc.ctx, r.name, screen, button, orcaActor(rc));
  if (!res.ok) return { ok: false, line: `${prefix} xy_touch ${r.name} ${screen}/${button} → ${res.error}` };
  const v = res.value;
  const offs = r.offsetXMm !== 0 || r.offsetYMm !== 0 ? ` (offsets ${r.offsetXMm >= 0 ? '+' : ''}${fmtMm(r.offsetXMm)}/${r.offsetYMm >= 0 ? '+' : ''}${fmtMm(r.offsetYMm)})` : '';
  out(rc, `${prefix} xy_touch ${r.name} ${screen}/${button} → ${v.orcaMode} (${fmtMm(v.xMm)}, ${fmtMm(v.yMm)})${offs}`);
  if (v.orcaMode === 'PHYSICAL_TAP') ssv(rc, 'xyReq', v.requestId);
  return { ok: true, respondsAfterMs: v.respondsAfterMs };
}

/** Is the physical xy_touch request still queued or running on its rig? */
export function xyPending(rc: RC, req: string): boolean {
  const name = rc.host.robot?.name;
  const rig = name ? rc.lab.rigs[name] : undefined;
  if (!rig) return false;
  const mine = (c: { ref?: string } | null | undefined): boolean => !!c?.ref && (c.ref === req || c.ref.includes(`"req":"${req}"`));
  return mine(rig.current) || rig.queue.some(mine);
}

/** Coworker device behind a handle? */
export function isCoworker(rc: RC, handle: string | null): boolean {
  if (!handle) return false;
  return rc.lab.workstation.adbConnections.some((c) => c.target === handle && c.coworker) || handle.startsWith('10.42.60.');
}
