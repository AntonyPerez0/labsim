/**
 * Orca's 5-minute synchronized health check (Sim §3.3) and the Robot Pi `GET /health` endpoint it pings.
 */
import type { LabState, OrcaRobot } from '../../types';
import type { Ctx } from '../util';
import { postChat, rand, statusLabel } from '../util';
import { reach } from '../network';
import { addNote, changeStatus } from './status';
import { fmtStamp } from '../../text/time';
import { HEALTH_CHECK_INTERVAL_MS } from '../../types';
import { ro } from '../ro';

export interface PiHealth {
  /** HTTP status, null for timeout / refused. */
  http: number | null;
  /** Text after "→ " in Notes; null on 200. */
  error: string | null;
  /** 200 body. */
  body: string;
  latencyMs: number;
}

const TIMEOUT = 'connect timed out after 10000 ms';

/** Host part of the Robot ADB Service URL, or null when empty/malformed. */
export function piIpOf(url: string): string | null {
  const m = /^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?(?:\/|$)/.exec((url ?? '').trim());
  return m ? m[1]! : null;
}

/**
 * `GET http://<pi>:8000/health` evaluated from `fromHostId` against the current state (Sim §3.3.3).
 * `latency: false` skips the latency draw (callers that do not report it).
 */
export function piHealth(lab: LabState, fromHostId: string, piIp: string, latency = true): PiHealth {
  const lat = (lo: number, hi: number) => (latency ? lo + Math.floor((hi - lo + 1) * rand(lab, 'devices')) : 0);
  const r = reach(lab, fromHostId, piIp, 8000, { noLatency: true });
  if (!r.ok) {
    if (r.kind === 'refused') return { http: null, error: 'Connection refused', body: '', latencyMs: 2 };
    return { http: null, error: TIMEOUT, body: '', latencyMs: 10_000 };
  }
  const pi = lab.hosts[r.hostId!]!;
  const fiveXX = (status: string, msg: string): PiHealth => ({ http: Number(status.slice(0, 3)), error: `${status} {"error":"${msg}"}`, body: `{"error":"${msg}"}`, latencyMs: lat(30, 80) });
  if (pi.diskUsedGb >= pi.diskTotalGb - 0.001) return fiveXX('500 Internal Server Error', 'robot-controller: No space left on device');
  const cfg = pi.services['robot-controller']?.loadedConfig ?? {};
  const motion = cfg.motion ?? '';
  const nuc = /^nuc:\/\/([\d.]+):(\d+)$/.exec(motion);
  if (nuc) {
    const up = `${nuc[1]}:${nuc[2]}`;
    const mr = reach(lab, pi.id, nuc[1]!, Number(nuc[2]), { noLatency: true, sameAttempt: true });
    if (!mr.ok && mr.kind !== 'refused') return fiveXX('502 Bad Gateway', `motion upstream ${up} unreachable`);
    if (!mr.ok) return fiveXX('502 Bad Gateway', `motion upstream ${up} error: Connection refused`);
    const mh = lab.hosts[mr.hostId!];
    if (mh && mh.diskUsedGb >= mh.diskTotalGb - 0.001) return fiveXX('502 Bad Gateway', `motion upstream ${up} error: No space left on device`);
  } else if (motion === 'local') {
    for (const rig of Object.values(lab.rigs)) {
      if (rig.piHostId === pi.id && rig.hasGantry && !pi.usb.includes(`motor-pcb:${rig.id}`)) return fiveXX('503 Service Unavailable', 'motion: 25-pin controller not found on /dev/ttyACM0');
    }
  }
  const callus = /^https?:\/\/([\d.]+):(\d+)/.exec(cfg.callus ?? '');
  if (callus) {
    const up = `${callus[1]}:${callus[2]}`;
    const cr = reach(lab, pi.id, callus[1]!, Number(callus[2]), { noLatency: true, sameAttempt: true });
    if (!cr.ok && cr.kind !== 'refused') return fiveXX('502 Bad Gateway', `callus upstream ${up} unreachable`);
    if (!cr.ok) return fiveXX('502 Bad Gateway', `callus upstream ${up} error: Connection refused`);
    const box = lab.hosts[cr.hostId!];
    if (box && box.diskUsedGb >= box.diskTotalGb - 0.001) return fiveXX('502 Bad Gateway', `callus upstream ${up} error: No space left on device`);
  }
  const robots = (cfg.robots ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  const body = robots.length > 1 ? `{"status":"ok","robots":[${robots.map((r) => `"${r}"`).join(',')}]}` : `{"status":"ok","robot":"${cfg.robot ?? robots[0] ?? ''}"}`;
  return { http: 200, error: null, body, latencyMs: lat(20, 60) };
}

/** The scheduled/forced check can run: VM up, Orca up, DB connected (Sim §3.3.1). */
function healthPreconditions(lab: LabState): 'ok' | 'app-down' | 'db-down' {
  const vm = lab.hosts['orca-vm'];
  if (!vm || vm.os !== 'RUNNING' || !vm.services.orca?.running) return 'app-down';
  if (!lab.orca.app.dbConnected) return 'db-down';
  return 'ok';
}

/** One run of the synchronized health check (Sim §3.3.2). `emit=false` for the factory run built during reset. */
export function runHealthCheck(lab: LabState, ctx: Ctx, opts: { forced: boolean }): void {
  const hc = lab.orca.healthCheck;
  const T = lab.time.nowMs;
  const pre = healthPreconditions(lab);
  if (pre === 'app-down') return;
  hc.runCount += 1;
  hc.lastRunMs = T;
  const ts = fmtStamp(lab.time, T);
  if (pre === 'db-down') {
    const line = `health-check run #${hc.runCount} aborted: JDBCConnectionException: Communications link failure`;
    hc.log.push({ run: hc.runCount, atMs: T, pinged: 0, skipped: 0, failed: 0, recovered: 0, lines: [`${ts}  ${line}`] });
    if (hc.log.length > 50) hc.log.splice(0, hc.log.length - 50);
    lab.log.push({ atMs: T, source: 'orca', level: 'warn', text: line });
    ctx.emit('orca.healthCheckAborted', { run: hc.runCount, atMs: T, reason: 'db-down' });
    return;
  }
  const lines: string[] = [];
  const cache = new Map<string, { endpoint: string; res: PiHealth }>();
  let pinged = 0;
  let skipped = 0;
  const failed: number[] = [];
  const recovered: number[] = [];
  const newlyFailed: number[] = [];
  const alerts: [string, string][] = [];
  const ids = Object.keys(lab.orca.robots).map(Number).sort((a, b) => a - b);
  for (const id of ids) {
    const robot = lab.orca.robots[id]!;
    if (robot.status === 'OFFLINE') {
      lines.push(`${robot.name}  SKIPPED (Offline)`);
      skipped++;
      continue;
    }
    pinged++;
    const ip = piIpOf(robot.adbServiceUrl);
    let endpoint: string;
    let res: PiHealth;
    if (!ip) {
      endpoint = robot.adbServiceUrl;
      res = { http: null, error: `invalid Robot ADB Service URL '${robot.adbServiceUrl}'`, body: '', latencyMs: 0 };
    } else {
      endpoint = `http://${ip}:8000/health`;
      const hit = cache.get(ip);
      if (hit) res = hit.res;
      else {
        res = piHealth(lab, 'orca-vm', ip);
        cache.set(ip, { endpoint, res });
      }
    }
    if (robot.status === 'RESERVED') {
      lines.push(`${robot.name}  RESERVED — not overridden`);
      continue;
    }
    robot.lastHealthCheckMs = T;
    robot.lastHealthCheckOk = res.http === 200;
    robot.lastHealth = { atMs: T, endpoint, http: res.http, error: res.error, latencyMs: res.latencyMs };
    if (res.http === 200) {
      if (robot.status === 'CONNECTION_FAILED') {
        const to = robot.preFailureStatus ?? 'AVAILABLE';
        robot.preFailureStatus = null;
        changeStatus(lab, ctx, robot, to, 'orca-health-check', 'health check recovered', T);
        for (const n of robot.notes) if (n.kind === 'HEALTH' && !n.resolved) n.resolved = true;
        const note = addNote(lab, ctx, robot, 'HEALTH', 'orca-health-check', `${ts} GET ${endpoint} → 200 OK · status restored to ${statusLabel(to)}`, endpoint, T);
        note.resolved = true;
        lines.push(`${robot.name}  200 OK (${res.latencyMs} ms) → ${to} (recovered)`);
        recovered.push(id);
        alerts.push(['#orca-alerts', `:large_green_circle: ${robot.name} recovered → ${statusLabel(to)}`]);
      } else lines.push(`${robot.name}  200 OK (${res.latencyMs} ms)`);
      continue;
    }
    failed.push(id);
    const text = `${ts} GET ${endpoint} → ${res.error}`;
    if (robot.status === 'AVAILABLE' || robot.status === 'UNAVAILABLE') {
      robot.preFailureStatus = robot.status;
      changeStatus(lab, ctx, robot, 'CONNECTION_FAILED', 'orca-health-check', res.error ?? undefined, T);
      addNote(lab, ctx, robot, 'HEALTH', 'orca-health-check', text, endpoint, T);
      newlyFailed.push(id);
      alerts.push(['#orca-alerts', `:red_circle: ${robot.name} → Connection Failed (GET ${endpoint} → ${res.error})`]);
    } else {
      repeatOrAdd(lab, ctx, robot, endpoint, res.error ?? '', text, T);
    }
    lines.push(`${robot.name}  FAIL ${res.error} → CONNECTION_FAILED`);
  }
  const header = `${ts}  health-check run #${hc.runCount} — ${pinged} pinged, ${skipped} skipped, ${failed.length} failed, ${recovered.length} recovered`;
  hc.log.push({ run: hc.runCount, atMs: T, pinged, skipped, failed: failed.length, recovered: recovered.length, lines: [header, ...lines] });
  if (hc.log.length > 50) hc.log.splice(0, hc.log.length - 50);
  for (const [ch, text] of alerts) postChat(lab, ctx, ch, 'orca-health-check', text);
  ctx.emit('orca.healthCheckRan', { atMs: T, checked: pinged, failedRobotIds: failed, recoveredRobotIds: recovered, run: hc.runCount, pinged, skipped, newlyFailedRobotIds: newlyFailed, forced: opts.forced });
}

/** Identical consecutive failure → collapse into the newest unresolved HEALTH note. */
function repeatOrAdd(lab: LabState, ctx: Ctx, robot: OrcaRobot, endpoint: string, error: string, text: string, T: number): void {
  const newest = robot.notes.find((n) => n.kind === 'HEALTH' && !n.resolved);
  const tail = `GET ${endpoint} → ${error}`;
  if (newest && newest.text.endsWith(tail)) {
    newest.repeat += 1;
    newest.lastAtMs = T;
    ctx.emit('robot.noteRepeated', { robotId: robot.id, noteId: newest.id, repeat: newest.repeat, atMs: T });
  } else addNote(lab, ctx, robot, 'HEALTH', 'orca-health-check', text, endpoint, T);
}

/** Health checks for every boundary crossed in (prevNow, nowMs] (Sim §3.3.1, §6.2). */
export function scheduledHealthChecks(lab: LabState, ctx: Ctx, prevNowMs: number): void {
  const L = ro(lab);
  const anchor = ro(L.time).healthAnchorMs;
  const now = ro(L.time).nowMs;
  const first = Math.floor((prevNowMs - anchor) / HEALTH_CHECK_INTERVAL_MS) + 1;
  const last = Math.floor((now - anchor) / HEALTH_CHECK_INTERVAL_MS);
  if (last >= first) {
    for (let k = first; k <= last; k++) {
      lab.time.nowMs = anchor + k * HEALTH_CHECK_INTERVAL_MS;
      runHealthCheck(lab, ctx, { forced: false });
    }
    lab.time.nowMs = now;
  }
  const next = anchor + (Math.floor((now - anchor) / HEALTH_CHECK_INTERVAL_MS) + 1) * HEALTH_CHECK_INTERVAL_MS;
  if (ro(ro(L.orca).healthCheck).nextRunMs !== next) lab.orca.healthCheck.nextRunMs = next;
}
