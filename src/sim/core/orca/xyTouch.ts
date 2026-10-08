/**
 * `POST /api/xy_touch` (Sim §3.5): Screen + Screen Location lookup per Device Type, legacy offsets,
 * lock check, PHYSICAL_TAP (gantry move + solenoid tap, answered when the stroke completes) vs
 * ADB_TOUCH (inject on display 0, answered after 120 ms).
 */
import type { TerminalDevice, LabState, OrcaRobot } from '../../types';
import type { Actor, Result, XyTouchOptions, XyTouchResult } from '../../api';
import type { Ctx } from '../util';
import { fmtMm, round1 } from '../../text/time';
import { DEVICE_TYPES } from '../../seed/deviceTypes';
import { reach } from '../network';
import { robotByName, orcaDown } from './status';
import { inUseLabel } from './checkout';
import { controllerReachable, enqueueRig, motionProblem, motorPowered, plannedPosition, queueRemainingMs } from '../rigs';
import { deviceTouch } from '../devices';
import { piIpOf } from './health';
import { rigOf } from './entities';

export interface XyTarget {
  device: TerminalDevice;
  orcaDeviceId: number;
  display: 'primary' | 'secondary';
  target: 'MFD' | 'CFD' | null;
}

/** Sim §3.5.2 #3: which device/display a screen name addresses on this robot. */
export function xyTarget(lab: LabState, robot: OrcaRobot, screen: string, opts: XyTouchOptions = {}): XyTarget | null {
  const isCfdScreen = screen.startsWith('CFD_');
  const devRow = (id: number | null) => (id != null ? lab.orca.devices[id] : undefined);
  const runtime = (id: number | null) => {
    const row = devRow(id);
    return row?.simDeviceId ? lab.devices[row.simDeviceId] : undefined;
  };
  if (robot.mfdDeviceId != null && robot.cfdDeviceId != null && robot.mfdDeviceId !== robot.cfdDeviceId) {
    const t = opts.target ?? (isCfdScreen ? 'CFD' : 'MFD');
    const id = t === 'CFD' ? robot.cfdDeviceId : robot.mfdDeviceId;
    const d = runtime(id);
    return d ? { device: d, orcaDeviceId: id, display: 'primary', target: t } : null;
  }
  const id = robot.deviceId ?? robot.mfdDeviceId;
  const d = runtime(id);
  if (!d || id == null) return null;
  const row = devRow(id)!;
  const duo = robot.mfdDeviceId === robot.cfdDeviceId && robot.mfdDeviceId != null ? true : DEVICE_TYPES[row.deviceType].dualScreenSingleAdb;
  if (duo) {
    const s = Object.values(lab.orca.screens).find((x) => x.deviceType === row.deviceType && x.name === screen);
    return { device: d, orcaDeviceId: id, display: s?.display ?? (isCfdScreen ? 'secondary' : 'primary'), target: null };
  }
  return { device: d, orcaDeviceId: id, display: 'primary', target: null };
}

/** Sim §3.5.2. */
export function xyTouch(lab: LabState, ctx: Ctx, robotName: string, screen: string, button: string, actor: Actor, opts: XyTouchOptions = {}): Result<XyTouchResult> {
  const fail = (error: string, status: number, extra: { target?: 'MFD' | 'CFD' } = {}): Result<XyTouchResult> => {
    ctx.emit('orca.xyTouch', { robotName, screen, button, xMm: 0, yMm: 0, mode: 'probe', ok: false, hitButton: null, error, status, actor, ...extra });
    return { ok: false, error };
  };
  const down = orcaDown(lab);
  if (down) return fail(down.startsWith('500') ? '500 Internal Server Error' : down, down.startsWith('500') ? 500 : 0);
  const robot = robotByName(lab, robotName);
  if (!robot) return fail(`404 Not Found: no robot named '${robotName}'`, 404);
  const tgt = xyTarget(lab, robot, screen, opts);
  const row = tgt ? lab.orca.devices[tgt.orcaDeviceId] : undefined;
  const deviceType = row?.deviceType ?? (robot.deviceId != null ? lab.orca.devices[robot.deviceId]?.deviceType : undefined) ?? 'UNKNOWN';
  const scr = Object.values(lab.orca.screens).find((s) => s.deviceType === deviceType && s.name === screen);
  const loc = scr ? Object.values(lab.orca.screenLocations).find((l) => l.screenId === scr.id && l.button === button) : undefined;
  if (!scr || !loc) return fail(`404 Not Found: no Screen Location for (${deviceType}, ${screen}, "${button}")`, 404);
  if (!tgt) return fail(`404 Not Found: robot ${robot.name} has no device for ${screen}`, 404);
  const x = round1(loc.xMm + robot.offsetXMm);
  const y = round1(loc.yMm + robot.offsetYMm);
  if (robot.checkout && actor !== robot.checkout.buildId) return fail(`423 Locked: robot ${robot.name} is in use by ${inUseLabel(robot)}`, 423, tgt.target ? { target: tgt.target } : {});
  const rig = rigOf(lab, robot);
  const display = scr.display;
  const physical = !!rig && rig.hasGantry && rig.probeDisplay === display && tgt.device.rigId === rig.id;
  const reqId = `req-${++lab.seq.request}`;
  const piIp = piIpOf(robot.adbServiceUrl) ?? '';
  const ctrl = `robot controller ${piIp}:8000 unreachable`;
  const extra = tgt.target ? { target: tgt.target } : {};
  if (physical) {
    const pr = reach(lab, 'orca-vm', piIp, 8000, { noLatency: true });
    if (!pr.ok || !controllerReachable(lab, rig!)) return fail(`502 Bad Gateway: ${ctrl}`, 502, extra);
    const mp = motionProblem(lab, rig!);
    if (mp) return fail(mp.status === 502 ? `502 Bad Gateway: ${mp.text}` : `503 Service Unavailable: ${mp.text}`, mp.status, extra);
    if (!motorPowered(lab, rig!)) return fail('503 Service Unavailable: MOTOR_POWER_LOST', 503, extra);
    if (!rig!.steppersEnabled) return fail('503 Service Unavailable: STEPPERS_DISABLED', 503, extra);
    if (rig!.motionFault) return fail(`409 Conflict: MOTION_FAULT (${rig!.motionFault})`, 409, extra);
    if (!rig!.magneticLock.engaged || !rig!.gantry.homed) return fail('409 Conflict: LOCK_RELEASED (park required)', 409, extra);
    const g = rig!.gantry;
    if (x < g.minXMm || x > g.maxXMm || y < g.minYMm || y > g.maxYMm) return fail(`400 Bad Request: target (${fmtMm(x)}, ${fmtMm(y)}) outside travel`, 400, extra);
    const from = plannedPosition(rig!);
    const waitMs = queueRemainingMs(lab, rig!);
    const moveMs = Math.round((Math.max(Math.abs(x - from.x), Math.abs(y - from.y)) / g.speedMmS) * 1000);
    const ref = JSON.stringify({ req: reqId, robot: robot.name, screen, button, actor, target: tgt.target ?? undefined, x, y });
    enqueueRig(lab, rig!.id, { kind: 'moveTo', xMm: x, yMm: y, source: 'orca', ref: reqId });
    enqueueRig(lab, rig!.id, { kind: 'tap', source: 'orca', ref });
    const body = `{"result":"OK","mode":"PHYSICAL_TAP","x_mm":${fmtMm(x)},"y_mm":${fmtMm(y)}}`;
    return { ok: true, value: { robotName: robot.name, screen, button, xMm: x, yMm: y, mode: 'probe', hitButton: null, requestId: reqId, orcaMode: 'PHYSICAL_TAP', status: 200, body, respondsAfterMs: waitMs + moveMs + 200, deviceId: tgt.device.id, display } };
  }
  // ADB_TOUCH: only primary displays are ADB-visible (Sim §3.11).
  if (display === 'secondary') return fail(`422 Unprocessable Entity: secondary display of ${deviceType} is not exposed to ADB and robot ${robot.name} has no probe on it`, 422, extra);
  const pr = reach(lab, 'orca-vm', piIp, 8000, { noLatency: true });
  const pi = pr.hostId ? lab.hosts[pr.hostId] : undefined;
  if (!pr.ok || !pi?.services['adb-service']?.running) return fail(`502 Bad Gateway: ${ctrl}`, 502, extra);
  const d = tgt.device;
  const viaUsb = pi.usb.includes(`adb:${d.serial}`) && d.power === 'on';
  const dr = reach(lab, pi.id, d.ip, 5444, { noLatency: true });
  if (!viaUsb && !dr.ok) return fail(`502 Bad Gateway: adb: device ${d.ip}:5444 not found`, 502, extra);
  const t = deviceTouch(lab, ctx, d.id, 'primary', x, y, 'adb');
  const hit = t.ok ? t.value.hitButton : null;
  const result = t.ok ? t.value.result : 'MISS';
  const body = `{"result":"OK","mode":"ADB_TOUCH","x_mm":${fmtMm(x)},"y_mm":${fmtMm(y)}}`;
  ctx.emit('orca.xyTouch', { robotName: robot.name, screen, button, xMm: x, yMm: y, mode: 'adb', ok: true, hitButton: result === 'HIT' ? hit : null, requestId: reqId, orcaMode: 'ADB_TOUCH', status: 200, actor, ...extra });
  return { ok: true, value: { robotName: robot.name, screen, button, xMm: x, yMm: y, mode: 'adb', hitButton: result === 'HIT' ? hit : null, requestId: reqId, orcaMode: 'ADB_TOUCH', status: 200, body, respondsAfterMs: 120, deviceId: d.id, display: 'primary' } };
}

/** Console line the runners print (Sim §3.19.3), e.g. `[orca] xy_touch wall-e REGISTER_HOME/Review Order → PHYSICAL_TAP (56.0, 124.0)`. */
export function xyTouchLine(lab: LabState, robotName: string, screen: string, button: string, r: Result<XyTouchResult>): string {
  const head = `[orca] xy_touch ${robotName} ${screen}/${button} → `;
  if (!r.ok) return head + r.error;
  const robot = robotByName(lab, robotName);
  const off = robot && (robot.offsetXMm !== 0 || robot.offsetYMm !== 0) ? ` (offsets ${robot.offsetXMm >= 0 ? '+' : ''}${fmtMm(robot.offsetXMm)}/${robot.offsetYMm >= 0 ? '+' : ''}${fmtMm(robot.offsetYMm)})` : '';
  return `${head}${r.value.orcaMode} (${fmtMm(r.value.xMm)}, ${fmtMm(r.value.yMm)})${off}`;
}
