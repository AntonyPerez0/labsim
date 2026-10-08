/**
 * Orca robot status machine and Notes (Sim §3.2, §3.3.4): status changes with history, STATUS /
 * CONFIG / MANUAL / HEALTH notes (newest first, repeats collapsed), audit rows.
 */
import type { LabState, OrcaRobot, RobotNote, RobotStatus } from '../../types';
import type { Result } from '../../api';
import type { Ctx } from '../util';
import { statusLabel } from '../util';
import { fmtClock, fmtStamp } from '../../text/time';

export const STATUSES: RobotStatus[] = ['AVAILABLE', 'UNAVAILABLE', 'OFFLINE', 'CONNECTION_FAILED', 'RESERVED'];

/** Orca precondition for any entity call (Sim §3.14.5): app down → refused/timeout, DB down → 500. */
export function orcaDown(lab: LabState): string | null {
  const vm = lab.hosts['orca-vm'];
  if (!vm || vm.os !== 'RUNNING') return 'connect timed out';
  if (!vm.services.orca?.running) return 'Connection refused';
  if (!lab.orca.app.dbConnected) return '500 Internal Server Error';
  return null;
}

export function robotByName(lab: LabState, name: string): OrcaRobot | undefined {
  for (const r of Object.values(lab.orca.robots)) if (r.name === name) return r;
  return undefined;
}

export function addNote(lab: LabState, ctx: Ctx, robot: OrcaRobot, kind: RobotNote['kind'], author: string, text: string, endpoint?: string, atMs = lab.time.nowMs): RobotNote {
  const id = lab.orca.seq.notes++;
  lab.seq.note = Math.max(lab.seq.note, id);
  const note: RobotNote = { id, atMs, author, kind, text, resolved: false, repeat: 1, lastAtMs: atMs, ...(endpoint ? { endpoint } : {}) };
  robot.notes.unshift(note);
  ctx.emit('robot.noteAdded', endpoint ? { robotId: robot.id, noteId: id, endpoint, text, kind } : { robotId: robot.id, noteId: id, text, kind });
  return note;
}

/** Display line of a note, with the repeat suffix ` (×3, last 08:25:00)` (Sim §3.3.4). */
export function noteDisplayText(lab: LabState, n: RobotNote): string {
  return n.repeat > 1 ? `${n.text} (×${n.repeat}, last ${fmtClock(lab.time, n.lastAtMs)})` : n.text;
}

export function audit(lab: LabState, who: string, action: string, entity: string, entityId: number | string, diff?: Record<string, [unknown, unknown]>, atMs = lab.time.nowMs): void {
  lab.orca.audit.push(diff ? { atMs, who, action, entity, entityId, diff } : { atMs, who, action, entity, entityId });
  if (lab.orca.audit.length > 300) lab.orca.audit.splice(0, lab.orca.audit.length - 300);
}

/** Low-level status change: history, timestamps, event. */
export function changeStatus(lab: LabState, ctx: Ctx, robot: OrcaRobot, to: RobotStatus, actor: string, reason?: string, atMs = lab.time.nowMs): void {
  const from = robot.status;
  if (from === to) return;
  robot.status = to;
  robot.statusChangedMs = atMs;
  robot.statusHistory.push(reason ? { atMs, from, to, by: actor, reason } : { atMs, from, to, by: actor });
  if (robot.statusHistory.length > 100) robot.statusHistory.splice(0, robot.statusHistory.length - 100);
  ctx.emit('robot.statusChanged', reason ? { robotId: robot.id, name: robot.name, from, to, actor, reason } : { robotId: robot.id, name: robot.name, from, to, actor });
}

/** Manual status change (Orca UI Edit → Status, `PUT /api/robots/{id}/status`), Sim §3.2.1. */
export function setRobotStatus(lab: LabState, ctx: Ctx, robotId: number, status: string, actor: string, reason?: string, atMs = lab.time.nowMs, skipOrcaCheck = false): Result {
  if (!skipOrcaCheck) {
    const down = orcaDown(lab);
    if (down) return { ok: false, error: down };
  }
  const robot = lab.orca.robots[robotId];
  if (!robot) return { ok: false, error: '404 Not Found' };
  if (!STATUSES.includes(status as RobotStatus)) return { ok: false, error: `400 Bad Request: Invalid value for status: '${status}'` };
  const to = status as RobotStatus;
  if (to === 'CONNECTION_FAILED') return { ok: false, error: '400 Bad Request: Connection Failed is set by the health check only' };
  const from = robot.status;
  if (from === to) {
    if (to === 'RESERVED' && robot.reservedBy !== actor) {
      robot.reservedBy = actor;
      robot.reservedAtMs = atMs;
    } else return { ok: true, value: undefined };
  }
  if (from === 'CONNECTION_FAILED') robot.preFailureStatus = null;
  if (to === 'RESERVED') {
    robot.reservedBy = actor;
    robot.reservedAtMs = atMs;
  } else if (from === 'RESERVED') {
    robot.reservedBy = null;
    robot.reservedAtMs = null;
  }
  changeStatus(lab, ctx, robot, to, actor, reason, atMs);
  addNote(lab, ctx, robot, 'STATUS', actor, `${fmtStamp(lab.time, atMs)} STATUS ${statusLabel(from)} → ${statusLabel(to)} (${actor})`, undefined, atMs);
  audit(lab, actor, 'UPDATE', 'robot', robot.id, { status: [from, to] }, atMs);
  return { ok: true, value: undefined };
}

/** Orca UI "Check out" button toast for a blocked rig (Sim §3.2.2), or null when it may be checked out. */
export function manualCheckoutToast(robot: OrcaRobot): string | null {
  switch (robot.status) {
    case 'CONNECTION_FAILED':
      return 'Robot is blocked from checkouts (Connection Failed)';
    case 'RESERVED':
      return 'Robot is blocked from checkouts (Reserved)';
    case 'OFFLINE':
      return 'Robot is blocked from checkouts (Offline)';
    case 'UNAVAILABLE':
      return 'Robot is Unavailable — pass its exact Name in the job to use it';
    default:
      return null;
  }
}
