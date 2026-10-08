/**
 * Touch-robot rigs (Sim §3.7): the motion queue (moves, taps, Park All/XY/X/Y homing, dip/tap/phone
 * actuators, solenoid strokes), magnetic lock, banner/header text, dashboard lockout, tablet HRN, and
 * the hands-on rig actions (drag, door, reseat, cradle, dip arm, motor USB, webcam aim).
 */
import type { LabState, RigMotionCommand, RigPart, RigState } from '../types';
import type { RigCommandName } from '../events';
import type { Result } from '../api';
import type { Ctx, SubStep } from './util';
import { addTimer, log } from './util';
import { deviceStroke, deviceTouch } from './devices';
import { cardEvent, customerSide } from './devices';
import { listening, reach } from './network';
import { TOAST } from '../text/devices';
import { CAMERA_BY_ID } from '../seed/cameras';
import { ro, roAt } from './ro';

const OK: Result = { ok: true, value: undefined };
const err = (e: string): Result => ({ ok: false, error: e });

export const BANNER_TEXT = {
  grey: 'Status: CONTROLLER UNREACHABLE',
  yellow: 'Status: LOCK RELEASED — PARK REQUIRED',
  green: 'Status: OK',
} as const;
export const LOCKOUT_OVERLAY = 'TEST IN PROGRESS — CONTROLS LOCKED';
export const REBUILD_FAULT = 'GANTRY INCOMPLETE (rebuild in progress)';

/* ────────────────────────────── derived conditions ────────────────────────────── */

/** Tablet ↔ controller (USB to the Pi): Pi running, robot-controller up, MAIN energised (Sim §3.7.5 #1). */
export function controllerReachable(lab: LabState, rigNode: RigState): boolean {
  const rig = ro(rigNode);
  const L = ro(lab);
  const pi = rig.piHostId ? roAt(L.hosts, rig.piHostId) : undefined;
  if (!pi || pi.os !== 'RUNNING' || !roAt(ro(pi.services), 'robot-controller')?.running) return false;
  if (!rig.mainSwitch) return false;
  const main = roAt(ro(L.power).terminals, `MAIN-${rig.id}`);
  return main ? main.energised : true;
}

/** MOTOR terminal energised (24 V drivers). Off-screen rigs: the switch alone. */
export function motorPowered(lab: LabState, rigNode: RigState): boolean {
  const rig = ro(rigNode);
  const t = roAt(ro(ro(lab).power).terminals, `MOTOR-${rig.id}`);
  return t ? t.energised && rig.motorSwitch : rig.motorSwitch;
}

/**
 * Can the controller drive the motor PCB? `motion: local` needs the PCB on this Pi's USB; the legacy
 * `nuc://ip:port` form needs that host's motion service healthy (Sim §3.3.3 rows 4–6). null = OK.
 */
export function motionProblem(lab: LabState, rigNode: RigState): { status: number; text: string } | null {
  const rig = ro(rigNode);
  const pi = rig.piHostId ? roAt(ro(lab).hosts, rig.piHostId) : undefined;
  if (!pi) return { status: 502, text: 'robot controller unreachable' };
  const cfg = ro(roAt(ro(pi.services), 'robot-controller')?.loadedConfig ?? null);
  const motion = cfg?.motion ?? 'local';
  if (motion === 'local' || motion === '') {
    if (!ro(pi.usb).includes(`motor-pcb:${rig.id}`)) return { status: 503, text: 'motion: 25-pin controller not found on /dev/ttyACM0' };
    return null;
  }
  const m = /^nuc:\/\/([\d.]+):(\d+)$/.exec(motion);
  if (!m) return { status: 503, text: `motion: invalid upstream '${motion}'` };
  const target = `${m[1]}:${m[2]}`;
  const r = reach(lab, pi.id, m[1]!, Number(m[2]), { noLatency: true });
  if (!r.ok && r.kind !== 'refused') return { status: 502, text: `motion upstream ${target} unreachable` };
  if (!r.ok) return { status: 502, text: `motion upstream ${target} error: Connection refused` };
  const host = r.hostId ? roAt(ro(lab).hosts, r.hostId) : undefined;
  if (host && host.diskUsedGb >= host.diskTotalGb - 0.001) return { status: 502, text: `motion upstream ${target} error: No space left on device` };
  if (host && !ro(host.usb).includes(`motor-pcb:${rig.id}`)) return { status: 503, text: 'motion: 25-pin controller not found on /dev/ttyACM0' };
  return null;
}

const MOTION_KINDS = new Set<RigMotionCommand['kind']>(['moveTo', 'park', 'parkXY', 'parkX', 'parkY', 'dipIn', 'dipOut', 'tapIn', 'tapOut', 'phoneForward', 'phoneBack', 'stroke']);
const SOLENOID_KINDS = new Set<RigMotionCommand['kind']>(['tap', 'solenoidDown', 'solenoidUp', 'solenoidLower', 'solenoidRaise']);

export function enqueueRig(lab: LabState, rigId: string, cmd: RigMotionCommand): void {
  const rig = lab.rigs[rigId];
  if (!rig) return;
  rig.queue.push(cmd);
}

/** Where the carriage will be once queued moves finish (xy_touch move-time estimate). */
export function plannedPosition(rig: RigState): { x: number; y: number } {
  let x = rig.current && (rig.current.kind === 'moveTo' || rig.current.kind === 'park' || rig.current.kind === 'parkXY') ? rig.gantry.targetXMm : rig.gantry.xMm;
  let y = rig.current && (rig.current.kind === 'moveTo' || rig.current.kind === 'park' || rig.current.kind === 'parkXY') ? rig.gantry.targetYMm : rig.gantry.yMm;
  for (const c of rig.queue) {
    if (c.kind === 'moveTo') {
      x = c.xMm ?? x;
      y = c.yMm ?? y;
    } else if (c.kind === 'park' || c.kind === 'parkXY') {
      x = 0;
      y = 0;
    }
  }
  return { x, y };
}

/** Physical ms still needed by the queue (current remainder + queued commands, approximate). */
export function queueRemainingMs(lab: LabState, rig: RigState): number {
  let t = rig.currentEndsPhysMs != null ? Math.max(0, rig.currentEndsPhysMs - lab.time.physMs) : 0;
  let x = rig.current?.kind === 'moveTo' ? rig.gantry.targetXMm : rig.gantry.xMm;
  let y = rig.current?.kind === 'moveTo' ? rig.gantry.targetYMm : rig.gantry.yMm;
  for (const c of rig.queue) {
    const d = durationOf(rig, c, x, y);
    t += d;
    if (c.kind === 'moveTo') {
      x = c.xMm ?? x;
      y = c.yMm ?? y;
    }
  }
  return t;
}

function clampTravel(rig: RigState, x: number, y: number): { x: number; y: number } {
  const g = rig.gantry;
  return { x: Math.min(g.maxXMm, Math.max(g.minXMm, x)), y: Math.min(g.maxYMm, Math.max(g.minYMm, y)) };
}

function anyExtended(rig: RigState): boolean {
  return rig.dipArm !== 'retracted' || rig.tapArm !== 'retracted' || rig.phonePusher !== 'retracted' || rig.solenoid.down;
}

function durationOf(rig: RigState, c: RigMotionCommand, fromX = rig.gantry.xMm, fromY = rig.gantry.yMm): number {
  const g = rig.gantry;
  switch (c.kind) {
    case 'moveTo':
      return Math.round((Math.max(Math.abs((c.xMm ?? fromX) - fromX), Math.abs((c.yMm ?? fromY) - fromY)) / g.speedMmS) * 1000);
    case 'tap':
      return 200;
    case 'park':
    case 'parkXY': {
      const ext = c.kind === 'park' && anyExtended(rig) ? 600 : 0;
      const xFail = !rig.limitSwitchOk.x;
      const yFail = !rig.limitSwitchOk.y;
      if (xFail || yFail) {
        const ax = xFail ? Math.abs(fromX - g.minXMm) : Math.abs(fromY - g.minYMm);
        return ext + Math.round((ax / g.homingSpeedMmS) * 1000) + 4_000;
      }
      return ext + Math.round((Math.max(Math.abs(fromX), Math.abs(fromY)) / g.homingSpeedMmS) * 1000) + 300;
    }
    case 'parkX':
      return Math.round((Math.abs(fromX) / g.homingSpeedMmS) * 1000) + 300 + (rig.limitSwitchOk.x ? 0 : 4_000);
    case 'parkY':
      return Math.round((Math.abs(fromY) / g.homingSpeedMmS) * 1000) + 300 + (rig.limitSwitchOk.y ? 0 : 4_000);
    case 'dipIn':
    case 'dipOut':
      return 1_200;
    case 'tapIn':
    case 'tapOut':
      return 800;
    case 'phoneForward':
    case 'phoneBack':
      return 1_500;
    case 'pushPower':
      return 500;
    case 'solenoidDown':
    case 'solenoidUp':
      return 60;
    case 'solenoidLower':
    case 'solenoidRaise':
      return 400;
    case 'stroke':
      return 120 + Math.round((Math.max(Math.abs((c.toXMm ?? fromX) - (c.xMm ?? fromX)), Math.abs((c.toYMm ?? fromY) - (c.yMm ?? fromY))) / g.speedMmS) * 1000);
    case 'wait':
      return Math.max(0, c.ms ?? 0);
  }
}

/* ────────────────────────────── the system ────────────────────────────── */

export function rigsStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const L = ro(lab);
  // Devices driven by running local IntelliJ runs (dashboard lockout, Sim §3.7.6).
  const localDriven: Record<string, string> = {};
  const runs = ro(ro(L.local)?.runs ?? {});
  for (const rid of Object.keys(runs)) {
    const run = ro(runs[rid]!);
    if (run.state !== 'running') continue;
    const handles = ro(ro(run.runner).handles);
    for (const h of [handles.mfd, handles.cfd]) {
      if (!h) continue;
      const ip = h.replace(/:\d+$/, '');
      const devices = ro(L.devices);
      for (const did of Object.keys(devices)) if (ro(devices[did]!).ip === ip) localDriven[did] = run.id;
    }
  }
  const rigs = ro(L.rigs);
  const hosts = ro(L.hosts);
  const robots = ro(ro(L.orca).robots);
  for (const id of Object.keys(rigs).sort()) {
    let rig = ro(rigs[id]!);
    const reachable = controllerReachable(lab, rig);
    if (rig.hasGantry) {
      const motor = motorPowered(lab, rig);
      const lock = ro(rig.magneticLock);
      const g = ro(rig.gantry);
      // MOTOR power loss: steppers lose holding — lock de-energised, position unknown (Sim §3.7.7).
      if (!motor && (lock.engaged || g.homed)) {
        const w = lab.rigs[id]!;
        if (lock.engaged) {
          w.magneticLock.engaged = false;
          w.magneticLock.brokenAtMs = lab.time.nowMs;
          ctx.emit('rig.lockBroken', { rigId: id, by: 'motor-power' });
        }
        if (g.homed) w.gantry.homed = false;
      }
      if (rig.assembly === 'rebuild' && rig.motionFault !== REBUILD_FAULT) lab.rigs[id]!.motionFault = REBUILD_FAULT;
      if (rig.current || ro(rig.queue).length) runQueue(lab, ctx, lab.rigs[id]!, sub, reachable, motor);
      rig = ro(ro(ro(lab).rigs)[id]!);
    }
    // Webcam mirror (USB on the camera host).
    const cam = ro(rig.webcam);
    if (cam.cameraId) {
      const camHost = ro(hosts[cameraHostOf(lab, rig)]);
      const connected = !!camHost && ro(camHost.usb).includes('webcam');
      if (cam.connected !== connected) lab.rigs[id]!.webcam.connected = connected;
    }
    // Banner (Sim §3.7.5).
    let banner: RigState['banner'];
    let text: string;
    if (!reachable) {
      banner = 'grey';
      text = BANNER_TEXT.grey;
    } else if (rig.motionFault) {
      banner = 'red';
      text = `Status: MOTION FAULT — ${rig.motionFault}`;
    } else if (rig.hasGantry && motorPowered(lab, rig) && rig.steppersEnabled && (!ro(rig.magneticLock).engaged || !ro(rig.gantry).homed)) {
      banner = 'yellow';
      text = BANNER_TEXT.yellow;
    } else {
      banner = 'green';
      text = BANNER_TEXT.green;
    }
    if (rig.bannerText !== text) {
      const w = lab.rigs[id]!;
      w.bannerText = text;
      w.tablet.statusText = text;
    }
    if (rig.banner !== banner) {
      const from = rig.banner;
      lab.rigs[id]!.banner = banner;
      ctx.emit('rig.bannerChanged', { rigId: id, from, to: banner, text });
    }
    const robot = ro(robots[rig.orcaRobotId]);
    const tablet = ro(rig.tablet);
    if (tablet.reachable !== reachable) {
      const w = lab.rigs[id]!;
      w.tablet.reachable = reachable;
      if (reachable) startupHoming(lab, w);
      // The controller pushes the current HRN when the tablet reconnects.
      if (reachable && robot && tablet.hrnShown !== robot.humanReadableName) {
        w.tablet.hrnShown = robot.humanReadableName;
        ctx.emit('rig.tabletNameChanged', { rigId: id, hrn: robot.humanReadableName });
      }
    }
    // Dashboard lockout.
    const co = robot ? ro(robot.checkout) : null;
    let lockedBy: RigState['lockedBy'] = null;
    if (co) lockedBy = { kind: co.kind, ref: co.buildId };
    else {
      const runId = ro(rig.deviceIds).map((d) => localDriven[d]).find(Boolean);
      if (runId) lockedBy = { kind: 'local', ref: runId };
    }
    const locked = lockedBy != null;
    if (rig.dashboardLocked !== locked) {
      lab.rigs[id]!.dashboardLocked = locked;
      ctx.emit('rig.lockout', { rigId: id, locked });
    }
    const cur = ro(rig.lockedBy);
    if ((cur?.ref ?? null) !== (lockedBy?.ref ?? null) || (cur?.kind ?? null) !== (lockedBy?.kind ?? null)) lab.rigs[id]!.lockedBy = lockedBy;
  }
}

/**
 * The controller restarts with the lock released (Sim §3.7.4) and, as its start-up sequence, homes the
 * gantry to the limit switches exactly like Park All — so a power-cycled Pi brings its tablet back green
 * (GP INC01 "tablet turns green", INC03-C). Homing needs MOTOR power, enabled steppers and a working motion
 * path; otherwise the rig stays un-homed (yellow once MOTOR and steppers are back, GP §3.2). Runs when the
 * tablet regains its controller.
 */
function startupHoming(lab: LabState, rig: RigState): void {
  if (!rig.hasGantry || rig.assembly === 'rebuild' || rig.motionFault) return;
  if (rig.gantry.homed && rig.magneticLock.engaged) return;
  if (!rig.steppersEnabled || !motorPowered(lab, rig) || motionProblem(lab, rig)) return;
  if (rig.current || rig.queue.some((c) => c.kind === 'park')) return;
  rig.queue.push({ kind: 'park', source: 'controller' });
}

/** Host whose USB webcam is this rig's camera (its own Pi, or the shared camera Pi) — physical, not Orca's URL. */
function cameraHostOf(lab: LabState, rig: RigState): string {
  const cam = rig.webcam.cameraId ? CAMERA_BY_ID[rig.webcam.cameraId] : undefined;
  return cam?.hostId ?? rig.piHostId ?? '';
}

function runQueue(lab: LabState, ctx: Ctx, rig: RigState, sub: SubStep, reachable: boolean, motor: boolean): void {
  const phys = lab.time.physMs;
  let guard = 0;
  while (guard++ < 32) {
    if (rig.current) {
      // Interpolate motion toward the target.
      const c = rig.current;
      if (rig.gantry.moving && sub.dtPhysMs > 0) {
        const speed = c.kind === 'moveTo' || c.kind === 'stroke' ? rig.gantry.speedMmS : rig.gantry.homingSpeedMmS;
        const step = (speed * sub.dtPhysMs) / 1000;
        const g = rig.gantry;
        const nx = moveToward(g.xMm, g.targetXMm, step);
        const ny = moveToward(g.yMm, g.targetYMm, step);
        if (nx !== g.xMm) g.xMm = nx;
        if (ny !== g.yMm) g.yMm = ny;
      }
      if (rig.currentEndsPhysMs != null && phys >= rig.currentEndsPhysMs) {
        rig.current = null;
        rig.currentEndsPhysMs = null;
        completeCommand(lab, ctx, rig, c, reachable, motor);
        continue;
      }
      return;
    }
    const next = rig.queue[0];
    if (!next) return;
    rig.queue = rig.queue.slice(1);
    startCommand(lab, ctx, rig, next, reachable, motor);
  }
}

function moveToward(v: number, target: number, step: number): number {
  if (Math.abs(target - v) <= step) return target;
  return Math.round((v + Math.sign(target - v) * step) * 1000) / 1000;
}

function startCommand(lab: LabState, ctx: Ctx, rig: RigState, c: RigMotionCommand, reachable: boolean, motor: boolean): void {
  if (!reachable) return; // controller down: queued commands are lost
  if (MOTION_KINDS.has(c.kind) && (!motor || !rig.steppersEnabled || motionProblem(lab, rig))) return; // nothing moves
  if (SOLENOID_KINDS.has(c.kind) && !motor) return;
  const g = rig.gantry;
  const dur = durationOf(rig, c);
  rig.current = c;
  rig.currentEndsPhysMs = lab.time.physMs + dur;
  switch (c.kind) {
    case 'moveTo': {
      const t = clampTravel(rig, c.xMm ?? g.xMm, c.yMm ?? g.yMm);
      g.targetXMm = t.x;
      g.targetYMm = t.y;
      g.moving = true;
      g.limitXHit = false;
      g.limitYHit = false;
      break;
    }
    case 'park':
    case 'parkXY':
    case 'parkX':
    case 'parkY': {
      const axes = c.kind === 'park' ? 'all' : c.kind === 'parkXY' ? 'xy' : c.kind === 'parkX' ? 'x' : 'y';
      if (c.kind !== 'parkY') g.targetXMm = rig.limitSwitchOk.x ? 0 : g.minXMm;
      if (c.kind !== 'parkX') g.targetYMm = rig.limitSwitchOk.y ? 0 : g.minYMm;
      if (c.kind === 'park') {
        if (rig.solenoid.down) rig.solenoid.down = false;
        for (const [arm, act] of [
          ['dipArm', 'dip'],
          ['tapArm', 'tap'],
          ['phonePusher', 'phone'],
        ] as const) {
          if (rig[arm] !== 'retracted') {
            rig[arm] = 'retracting';
            ctx.emit('rig.actuator', { rigId: rig.id, actuator: act, state: 'retracting' });
          }
        }
      }
      g.moving = true;
      ctx.emit('rig.parkStarted', { rigId: rig.id, axes });
      break;
    }
    case 'dipIn':
    case 'tapIn':
    case 'phoneForward': {
      const arm = c.kind === 'dipIn' ? 'dipArm' : c.kind === 'tapIn' ? 'tapArm' : 'phonePusher';
      rig[arm] = 'extending';
      ctx.emit('rig.actuator', { rigId: rig.id, actuator: c.kind === 'dipIn' ? 'dip' : c.kind === 'tapIn' ? 'tap' : 'phone', state: 'extending' });
      break;
    }
    case 'dipOut':
    case 'tapOut':
    case 'phoneBack': {
      const arm = c.kind === 'dipOut' ? 'dipArm' : c.kind === 'tapOut' ? 'tapArm' : 'phonePusher';
      rig[arm] = 'retracting';
      ctx.emit('rig.actuator', { rigId: rig.id, actuator: c.kind === 'dipOut' ? 'dip' : c.kind === 'tapOut' ? 'tap' : 'phone', state: 'retracting' });
      break;
    }
    case 'pushPower':
      rig.phonePowerPress = { atMs: lab.time.physMs };
      break;
    case 'solenoidDown':
    case 'solenoidLower':
      rig.solenoid.mode = c.kind === 'solenoidDown' ? 'fast' : 'slow';
      break;
    case 'stroke': {
      const t = clampTravel(rig, c.toXMm ?? g.xMm, c.toYMm ?? g.yMm);
      const s = clampTravel(rig, c.xMm ?? g.xMm, c.yMm ?? g.yMm);
      g.xMm = s.x;
      g.yMm = s.y;
      g.targetXMm = t.x;
      g.targetYMm = t.y;
      g.moving = true;
      break;
    }
    default:
      break;
  }
}

/** The display under the probe and the contact point (cracked cradle tilt, Sim §3.5.4). */
function contact(lab: LabState, rig: RigState): { deviceId: string | null; display: 'primary' | 'secondary'; x: number; y: number } {
  const display = rig.probeDisplay ?? 'primary';
  const deviceId = rig.deviceIds[0] ?? null;
  const x = rig.gantry.xMm;
  const y = rig.gantry.yMm + (rig.cradle === 'CRACKED' ? x * Math.tan((rig.cradleTiltDeg * Math.PI) / 180) : 0);
  return { deviceId, display, x, y };
}

/** A plunger contact (tap or Up after Down): hit-test on the device and report (Sim §3.5.4). */
function solenoidContact(lab: LabState, ctx: Ctx, rig: RigState, ref: string | undefined, motor: boolean): void {
  rig.solenoid.taps += 1;
  rig.solenoid.lastTapMs = lab.time.physMs;
  const c = contact(lab, rig);
  let result: 'HIT' | 'EDGE_REJECT' | 'MISS' | 'NO_CONTACT' | 'NOT_RENDERED' = 'NO_CONTACT';
  let hitButton: string | null = null;
  if (motor && rig.solenoidConnector === 'SEATED' && c.deviceId) {
    const r = deviceTouch(lab, ctx, c.deviceId, c.display, c.x, c.y, 'probe');
    if (r.ok) {
      const res = r.value.result;
      result = res === 'HIT' || res === 'DISABLED' ? 'HIT' : res === 'EDGE_REJECT' ? 'EDGE_REJECT' : res === 'NOT_RENDERED' ? 'NOT_RENDERED' : 'MISS';
      hitButton = res === 'HIT' ? r.value.hitButton : null;
    }
  }
  ctx.emit('rig.solenoidTap', { rigId: rig.id, xMm: Math.round(rig.gantry.xMm * 10) / 10, yMm: Math.round(rig.gantry.yMm * 10) / 10, ref, deviceId: c.deviceId, result, hitButton });
  // xy_touch requests are answered when the stroke completes (Sim §3.5.2 #8, §5.2).
  if (ref && ref.startsWith('{')) {
    try {
      const q = JSON.parse(ref) as { req: string; robot: string; screen: string; button: string; actor: string; target?: 'MFD' | 'CFD'; x: number; y: number };
      if (q.req) ctx.emit('orca.xyTouch', { robotName: q.robot, screen: q.screen, button: q.button, xMm: q.x, yMm: q.y, mode: 'probe', ok: true, hitButton, requestId: q.req, orcaMode: 'PHYSICAL_TAP', status: 200, actor: q.actor, ...(q.target ? { target: q.target } : {}) });
    } catch {
      /* not an xy_touch ref */
    }
  }
}

function completeCommand(lab: LabState, ctx: Ctx, rig: RigState, c: RigMotionCommand, reachable: boolean, motor: boolean): void {
  const g = rig.gantry;
  switch (c.kind) {
    case 'moveTo':
      g.xMm = g.targetXMm;
      g.yMm = g.targetYMm;
      g.moving = false;
      ctx.emit('rig.moveCompleted', { rigId: rig.id, xMm: g.xMm, yMm: g.yMm });
      return;
    case 'tap':
      solenoidContact(lab, ctx, rig, c.ref, motor);
      return;
    case 'park':
    case 'parkXY':
    case 'parkX':
    case 'parkY': {
      const axes = c.kind === 'park' ? 'all' : c.kind === 'parkXY' ? 'xy' : c.kind === 'parkX' ? 'x' : 'y';
      g.moving = false;
      const needX = c.kind !== 'parkY';
      const needY = c.kind !== 'parkX';
      const failAxis = needX && !rig.limitSwitchOk.x ? 'x' : needY && !rig.limitSwitchOk.y ? 'y' : null;
      if (needX) g.xMm = rig.limitSwitchOk.x ? 0 : g.minXMm;
      if (needY) g.yMm = rig.limitSwitchOk.y ? 0 : g.minYMm;
      g.targetXMm = g.xMm;
      g.targetYMm = g.yMm;
      if (c.kind === 'park') {
        for (const [arm, act] of [
          ['dipArm', 'dip'],
          ['tapArm', 'tap'],
          ['phonePusher', 'phone'],
        ] as const) {
          if (rig[arm] !== 'retracted') {
            rig[arm] = 'retracted';
            ctx.emit('rig.actuator', { rigId: rig.id, actuator: act, state: 'retracted' });
          }
        }
      }
      if (failAxis) {
        const fault = `HOMING FAILED (${failAxis.toUpperCase()} limit not found)`;
        rig.motionFault = rig.assembly === 'rebuild' ? REBUILD_FAULT : fault;
        g.homed = false;
        g.limitXHit = false;
        g.limitYHit = false;
        ctx.emit('rig.homingFailed', { rigId: rig.id, axis: failAxis, fault });
        ctx.emit('rig.parkCompleted', { rigId: rig.id, axes, homed: false, lockEngaged: false });
        return;
      }
      g.limitXHit = g.xMm === 0;
      g.limitYHit = g.yMm === 0;
      let lockEngaged = false;
      if (c.kind === 'park' || c.kind === 'parkXY') g.homed = true;
      if (c.kind === 'park') {
        if (rig.assembly !== 'rebuild') {
          rig.motionFault = null;
          rig.magneticLock = { engaged: true, brokenAtMs: null };
          rig.pushAccumMm = 0;
          lockEngaged = true;
          ctx.emit('rig.lockEngaged', { rigId: rig.id });
        }
      }
      ctx.emit('rig.parkCompleted', { rigId: rig.id, axes, homed: g.homed, lockEngaged });
      return;
    }
    case 'dipIn':
    case 'tapIn':
    case 'phoneForward': {
      const arm = c.kind === 'dipIn' ? 'dipArm' : c.kind === 'tapIn' ? 'tapArm' : 'phonePusher';
      rig[arm] = 'extended';
      ctx.emit('rig.actuator', { rigId: rig.id, actuator: c.kind === 'dipIn' ? 'dip' : c.kind === 'tapIn' ? 'tap' : 'phone', state: 'extended' });
      if (c.ref && c.ref.startsWith('{') && c.kind !== 'phoneForward') presentFromRef(lab, ctx, rig, c.ref);
      return;
    }
    case 'dipOut':
    case 'tapOut':
    case 'phoneBack': {
      const arm = c.kind === 'dipOut' ? 'dipArm' : c.kind === 'tapOut' ? 'tapArm' : 'phonePusher';
      rig[arm] = 'retracted';
      ctx.emit('rig.actuator', { rigId: rig.id, actuator: c.kind === 'dipOut' ? 'dip' : c.kind === 'tapOut' ? 'tap' : 'phone', state: 'retracted' });
      for (const did of rig.deviceIds) {
        const d = lab.devices[did];
        if (d && d.cardPresent) d.cardPresent = null;
      }
      return;
    }
    case 'pushPower':
      rig.phonePowerPress = null;
      return;
    case 'solenoidDown':
    case 'solenoidLower':
      rig.solenoid.down = true;
      return;
    case 'solenoidUp':
    case 'solenoidRaise':
      if (rig.solenoid.down) {
        rig.solenoid.down = false;
        solenoidContact(lab, ctx, rig, c.ref, motor);
      }
      return;
    case 'stroke': {
      const from = { xMm: c.xMm ?? g.xMm, yMm: c.yMm ?? g.yMm };
      g.xMm = g.targetXMm;
      g.yMm = g.targetYMm;
      g.moving = false;
      const ct = contact(lab, rig);
      if (motor && rig.solenoidConnector === 'SEATED' && ct.deviceId) deviceStroke(lab, ctx, ct.deviceId, ct.display, [from, { xMm: g.xMm, yMm: g.yMm }], 'probe');
      return;
    }
    default:
      void reachable;
      return;
  }
}

/** The dip arm / tap paddle reached the reader: deliver the card event (Sim §3.6 #7, #10). */
function presentFromRef(lab: LabState, ctx: Ctx, rig: RigState, ref: string): void {
  let q: { card: number; entry: 'DIP' | 'TAP'; probe: string; file?: string | null };
  try {
    q = JSON.parse(ref);
  } catch {
    return;
  }
  const prof = lab.orca.cardProfiles[q.card];
  const owner = rig.deviceIds[0] ? lab.devices[rig.deviceIds[0]] : undefined;
  if (!prof || !owner) return;
  const c = customerSide(lab, owner);
  const misaligned = q.entry === 'DIP' && rig.dipArmToothOffset !== 0;
  const e = cardEvent(lab, ctx, c.dev, c.disp, prof, q.entry, { misaligned, cardFile: q.file ?? null });
  const probe = lab.collis[q.probe];
  if (probe) {
    probe.lastAction = { entry: q.entry, atMs: lab.time.nowMs, ok: !e, error: e };
    ctx.emit('collis.action', e ? { collisId: probe.id, entry: q.entry, ok: false, error: e } : { collisId: probe.id, entry: q.entry, ok: true });
  }
}

/* ────────────────────────────── tablet commands (Sim §3.7.1) ────────────────────────────── */

const CMD_MAP: Partial<Record<RigCommandName, RigMotionCommand['kind']>> = {
  'park.all': 'park',
  'park.xy': 'parkXY',
  'park.x': 'parkX',
  'park.y': 'parkY',
  'dip.in': 'dipIn',
  'dip.out': 'dipOut',
  'tap.in': 'tapIn',
  'tap.out': 'tapOut',
  'phone.forward': 'phoneForward',
  'phone.back': 'phoneBack',
  'phone.pushPower': 'pushPower',
  'solenoid.down': 'solenoidDown',
  'solenoid.up': 'solenoidUp',
  'solenoid.lower': 'solenoidLower',
  'solenoid.raise': 'solenoidRaise',
};

export function rigCommand(lab: LabState, ctx: Ctx, rigId: string, command: RigCommandName, actor: string, args: { xMm?: number; yMm?: number } = {}): Result {
  const rig = lab.rigs[rigId];
  if (!rig) return err(`unknown rig '${rigId}'`);
  const fail = (e: string): Result => {
    ctx.emit('rig.command', { rigId, command, actor, ok: false, error: e });
    return err(e);
  };
  if (!rig.hasGantry) return fail('This rig has no motion controls');
  if (rig.dashboardLocked) return fail('LOCKED');
  if (!controllerReachable(lab, rig)) return fail('CONTROLLER UNREACHABLE');
  if (command === 'steppers.enable') {
    rig.steppersEnabled = true;
    rig.gantry.homed = false;
  } else if (command === 'steppers.disable') {
    rig.steppersEnabled = false;
    rig.gantry.homed = false;
    if (rig.magneticLock.engaged) {
      rig.magneticLock = { engaged: false, brokenAtMs: lab.time.nowMs };
      ctx.emit('rig.lockBroken', { rigId, by: 'steppers-disable' });
    }
  } else {
    const isMotion = command.startsWith('park.') || command.startsWith('dip.') || command.startsWith('tap.') || command === 'phone.forward' || command === 'phone.back' || command === 'move.to' || command === 'tap.at';
    if (isMotion && !rig.steppersEnabled) {
      const dev = rig.deviceIds[0] ? lab.devices[rig.deviceIds[0]] : undefined;
      void dev;
      return fail(TOAST.steppers);
    }
    if (command === 'move.to' || command === 'tap.at') {
      enqueueRig(lab, rigId, { kind: 'moveTo', xMm: args.xMm ?? rig.gantry.xMm, yMm: args.yMm ?? rig.gantry.yMm, source: 'tablet' });
      if (command === 'tap.at') enqueueRig(lab, rigId, { kind: 'tap', source: 'tablet' });
    } else {
      const kind = CMD_MAP[command];
      if (!kind) return fail(`unknown command '${command}'`);
      enqueueRig(lab, rigId, { kind, source: 'tablet' });
    }
  }
  ctx.emit('rig.command', { rigId, command, actor, ok: true });
  return OK;
}

/* ────────────────────────────── hands-on actions ────────────────────────────── */

export function dragCarriage(lab: LabState, ctx: Ctx, rigId: string, dxMm: number, dyMm: number, actor: string): Result<{ lockBroken: boolean; accumMm: number }> {
  const rig = lab.rigs[rigId];
  if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
  if (!rig.hasGantry) return { ok: false, error: 'This rig has no gantry' };
  if (rig.door !== 'open') return { ok: false, error: 'Open the enclosure door first' };
  const dist = Math.hypot(dxMm, dyMm);
  let broke = false;
  const holding = rig.magneticLock.engaged && rig.steppersEnabled && motorPowered(lab, rig);
  if (holding) {
    rig.pushAccumMm = Math.round((rig.pushAccumMm + dist) * 100) / 100;
    if (rig.pushAccumMm >= 20) {
      broke = true;
      rig.magneticLock = { engaged: false, brokenAtMs: lab.time.nowMs };
      rig.gantry.homed = false;
      rig.pushAccumMm = 0;
      const t = clampTravel(rig, rig.gantry.xMm + dxMm, rig.gantry.yMm + dyMm);
      Object.assign(rig.gantry, { xMm: t.x, yMm: t.y, targetXMm: t.x, targetYMm: t.y, limitXHit: false, limitYHit: false });
      ctx.emit('rig.lockBroken', { rigId, by: actor });
    }
  } else {
    if (rig.magneticLock.engaged) rig.magneticLock = { engaged: false, brokenAtMs: lab.time.nowMs };
    rig.gantry.homed = false;
    const t = clampTravel(rig, rig.gantry.xMm + dxMm, rig.gantry.yMm + dyMm);
    Object.assign(rig.gantry, { xMm: t.x, yMm: t.y, targetXMm: t.x, targetYMm: t.y, limitXHit: false, limitYHit: false });
  }
  ctx.emit('rig.carriageDragged', { rigId, dxMm, dyMm, accumMm: rig.pushAccumMm, actor });
  return { ok: true, value: { lockBroken: broke, accumMm: rig.pushAccumMm } };
}

export function setDoor(lab: LabState, ctx: Ctx, rigId: string, open: boolean): Result {
  const rig = lab.rigs[rigId];
  if (!rig) return err(`unknown rig '${rigId}'`);
  const door = open ? 'open' : 'closed';
  if (rig.door === door) return OK;
  rig.door = door;
  ctx.emit('rig.doorChanged', { rigId, open });
  return OK;
}

export function setSwitch(lab: LabState, ctx: Ctx, rigId: string, which: 'main' | 'motor', on: boolean): Result {
  const rig = lab.rigs[rigId];
  if (!rig) return err(`unknown rig '${rigId}'`);
  const key = which === 'main' ? 'mainSwitch' : 'motorSwitch';
  if (rig[key] === on) return OK;
  rig[key] = on;
  ctx.emit('rig.switch', { rigId, which, on });
  return OK;
}

export function reseat(lab: LabState, ctx: Ctx, rigId: string, part: RigPart): Result<{ seated: boolean }> {
  const rig = lab.rigs[rigId];
  if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
  let seated = true;
  switch (part) {
    case 'solenoid':
    case 'solenoidConnector':
      if (!rig.hasGantry) return { ok: false, error: 'This rig has no solenoid' };
      if (rig.door !== 'open') return { ok: false, error: 'Open the enclosure door first' };
      rig.solenoidConnector = rig.solenoidConnector === 'LOOSE' ? 'SEATED' : 'LOOSE';
      seated = rig.solenoidConnector === 'SEATED';
      break;
    case 'limitSwitchX':
    case 'limitSwitchY': {
      const ax = part === 'limitSwitchX' ? 'x' : 'y';
      rig.limitSwitchOk = { ...rig.limitSwitchOk, [ax]: !rig.limitSwitchOk[ax] };
      seated = rig.limitSwitchOk[ax];
      break;
    }
    case 'smartstripe': {
      const host = rig.piHostId ? lab.hosts[rig.piHostId] : undefined;
      if (!host || rig.kind !== 'tethered') return { ok: false, error: 'This rig has no SmartStripe probe' };
      const id = `smartstripe:${rigId}`;
      seated = !host.usb.includes(id);
      host.usb = seated ? [...host.usb, id] : host.usb.filter((u) => u !== id);
      ctx.emit('host.usbChanged', { hostId: host.id, usbId: id, attached: seated });
      break;
    }
    case 'webcam': {
      const hid = cameraHostOf(lab, rig);
      const host = lab.hosts[hid];
      if (!host || !rig.webcam.cameraId) return { ok: false, error: 'This rig has no webcam' };
      seated = !host.usb.includes('webcam');
      host.usb = seated ? [...host.usb, 'webcam'] : host.usb.filter((u) => u !== 'webcam');
      ctx.emit('host.usbChanged', { hostId: host.id, usbId: 'webcam', attached: seated });
      if (!seated && host.services['camera-stream']?.running) {
        host.services['camera-stream']!.running = false;
        host.services['camera-stream']!.failure = 'exit-code';
        ctx.emit('host.serviceChanged', { hostId: host.id, service: 'camera-stream', running: false, failure: 'exit-code' });
      }
      rig.webcam.connected = seated;
      break;
    }
  }
  ctx.emit('rig.reseated', { rigId, part, seated });
  return { ok: true, value: { seated } };
}

/** Printed cradle part for a device type (Sim §3.24). */
export function cradlePartFor(type: string): string {
  if (type.startsWith('FLEX') || type === 'COMPACT') return 'cradle_flex_gen3';
  if (type.startsWith('MINI')) return 'cradle_mini3';
  return 'cradle_station';
}

export function replaceCradle(lab: LabState, ctx: Ctx, rigId: string): Result {
  const rig = lab.rigs[rigId];
  if (!rig) return err(`unknown rig '${rigId}'`);
  if (!rig.hasGantry) return err('This rig has no printed cradle');
  const dev = rig.deviceIds[0] ? lab.devices[rig.deviceIds[0]] : undefined;
  const part = cradlePartFor(dev?.type ?? 'FLEX_3');
  const idx = lab.printer3d.output.indexOf(part);
  if (idx < 0) return err(`No printed ${part} on the printer tray — print ${part}.3mf first`);
  lab.printer3d.output.splice(idx, 1);
  rig.cradle = 'NEW';
  rig.cradleTiltDeg = 0;
  rig.gantry.homed = false;
  ctx.emit('rig.cradleReplaced', { rigId });
  return OK;
}

export function alignDipArm(lab: LabState, ctx: Ctx, rigId: string, deltaTeeth: number): Result<{ toothOffset: number }> {
  const rig = lab.rigs[rigId];
  if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
  if (!rig.hasGantry) return { ok: false, error: 'This rig has no dip arm' };
  if (rig.steppersEnabled && motorPowered(lab, rig)) return { ok: false, error: 'The arm is held by its stepper' };
  rig.dipArmToothOffset = Math.round(rig.dipArmToothOffset + deltaTeeth);
  rig.dipArmAligned = rig.dipArmToothOffset === 0;
  ctx.emit('rig.dipArmAdjusted', { rigId, toothOffset: rig.dipArmToothOffset });
  return { ok: true, value: { toothOffset: rig.dipArmToothOffset } };
}

export function moveMotorUsb(lab: LabState, ctx: Ctx, rigId: string, target: string): Result {
  const rig = lab.rigs[rigId];
  if (!rig) return err(`unknown rig '${rigId}'`);
  if (!rig.hasGantry) return err('This rig has no motor controller');
  const toHost = target === 'PI' || target === 'pi' ? rig.piHostId : target;
  if (!toHost || !lab.hosts[toHost]) return err(`unknown host '${target}'`);
  const usbId = `motor-pcb:${rigId}`;
  for (const h of Object.values(lab.hosts)) {
    if (h.id !== toHost && h.usb.includes(usbId)) {
      h.usb = h.usb.filter((u) => u !== usbId);
      ctx.emit('host.usbChanged', { hostId: h.id, usbId, attached: false });
    }
  }
  const h = lab.hosts[toHost]!;
  if (!h.usb.includes(usbId)) {
    h.usb = [...h.usb, usbId];
    ctx.emit('host.usbChanged', { hostId: h.id, usbId, attached: true });
  }
  rig.motionHost = toHost === rig.piHostId ? 'PI' : toHost;
  ctx.emit('rig.motorUsbMoved', { rigId, host: rig.motionHost });
  return OK;
}

export function aimWebcam(lab: LabState, ctx: Ctx, rigId: string, dYaw: number, dPitch: number): Result<{ aimedOk: boolean }> {
  const rig = lab.rigs[rigId];
  if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
  if (!rig.webcam.cameraId) return { ok: false, error: 'This rig has no webcam' };
  const yaw = Math.round((rig.webcam.aimOffsetDeg.yaw + dYaw) * 100) / 100;
  const pitch = Math.round((rig.webcam.aimOffsetDeg.pitch + dPitch) * 100) / 100;
  rig.webcam.aimOffsetDeg = { yaw, pitch };
  rig.webcam.aimedOk = Math.abs(yaw) <= 1.5 && Math.abs(pitch) <= 1.5;
  ctx.emit('rig.webcamAimed', { rigId, aimedOk: rig.webcam.aimedOk });
  return { ok: true, value: { aimedOk: rig.webcam.aimedOk } };
}

/** Orca pushes a new HRN to a reachable controller ≤ 2 s after save (Sim §3.7.5). */
export function scheduleHrnPush(lab: LabState, robotId: number): void {
  addTimer(lab, 'orca.hrnPush', 'phys', 1_500, { robotId });
}

export function hrnPush(lab: LabState, ctx: Ctx, robotId: number): void {
  const robot = lab.orca.robots[robotId];
  if (!robot) return;
  const rig = lab.rigs[robot.name] ?? Object.values(lab.rigs).find((r) => r.orcaRobotId === robotId);
  if (!rig || !controllerReachable(lab, rig)) return;
  if (rig.tablet.hrnShown === robot.humanReadableName) return;
  rig.tablet.hrnShown = robot.humanReadableName;
  ctx.emit('rig.tabletNameChanged', { rigId: rig.id, hrn: robot.humanReadableName });
}

export { listening, log };
