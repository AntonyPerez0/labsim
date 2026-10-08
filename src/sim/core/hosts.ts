/**
 * Hosts (Sim §3.14): power → OS life cycle (OFF / BOOTING / RUNNING / HUNG), service readiness,
 * restarts and start-up checks (controller.yaml, webcam, Wine prefix), corporate agent disk fill and policy
 * restore, GortCardSync, Pi under-voltage reboots, Ethernet/USB, and the host actions used by the world,
 * the terminal (via CoreServices) and faults.
 */
import type { Host, HostOs, HostPower, LabState, ServiceState } from '../types';
import type { Result } from '../api';
import type { Ctx, SubStep } from './util';
import { addTimer, cancelTimers, log, takeDue } from './util';
import { RESTART_DELAYS } from '../seed/hosts';
import { CARD_FILES_AT_9F02A1B, FACTORY_CARD_FILES } from '../seed/cards';
import { mirrorCallusFiles } from '../seed';
import { crashLines, journalLine, NO_VIDEO0, startedLine, stoppedLine, WINE_BROKEN } from '../text/hosts';
import { hostNetUp } from './network';
import { ro, roAt } from './ro';

const OK: Result = { ok: true, value: undefined };
const err = (e: string): Result => ({ ok: false, error: e });
const DAY = 86_400_000;
const GORT_SYNC_AT = 10 * 3_600_000;
const SYNC_MS = 20_000;
const POLICY_RESTORE_MS = 30_000;
export const corp_LOGS = 'C:\\ProgramData\\SecAgent\\logs\\';
const corp_CFG = 'C:\\ProgramData\\SecAgent\\agent.cfg';
export const DEBUG_LOG = '/var/log/robot-controller/debug.log';

const powerOf = (os: HostOs): HostPower => (os === 'RUNNING' ? 'on' : os === 'BOOTING' ? 'booting' : os === 'HUNG' ? 'crashed' : 'off');
const isWindows = (h: Host) => h.kind === 'nuc' || h.kind === 'minix';

/* ────────────────────────────── controller.yaml ────────────────────────────── */

export type YamlResult = { ok: true; config: Record<string, string> } | { ok: false; error: string; line: number };

/** Tiny YAML reader for `controller.yaml` (Sim §2.5.3): top-level/nested scalars + YAML's real errors. */
export function parseControllerYaml(text: string): YamlResult {
  const config: Record<string, string> = {};
  let parent: string | null = null;
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    let line = raw;
    const hash = line.search(/(^|\s)#/);
    if (hash >= 0) line = line.slice(0, hash);
    if (!line.trim()) continue;
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    if (content.startsWith('- ')) continue;
    const m = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/.exec(content);
    if (!m) return { ok: false, error: `could not find expected ':' (line ${i + 1})`, line: i + 1 };
    const value = (m[2] ?? '').trim();
    if (value && !/^['"[]/.test(value) && /:\s/.test(value)) return { ok: false, error: `mapping values are not allowed here (line ${i + 1})`, line: i + 1 };
    const v = value.replace(/^'(.*)'$/, '$1').replace(/^"(.*)"$/, '$1');
    if (indent === 0) {
      config[m[1]!] = v;
      parent = value ? null : m[1]!;
    } else if (parent) config[`${parent}.${m[1]}`] = v;
  }
  return { ok: true, config };
}

/* ────────────────────────────── life cycle ────────────────────────────── */

function setOs(lab: LabState, ctx: Ctx, h: Host, os: HostOs): void {
  if (h.os === os) return;
  const from = h.os;
  const fromP = h.power;
  h.os = os;
  h.power = powerOf(os);
  ctx.emit('host.osChanged', { hostId: h.id, from, to: os });
  if (fromP !== h.power) ctx.emit('host.powerChanged', { hostId: h.id, from: fromP, to: h.power });
  if (os === 'HUNG') ctx.emit('host.crashed', { hostId: h.id, reason: 'hung' });
}

function stopAll(lab: LabState, ctx: Ctx, h: Host): void {
  for (const name of Object.keys(h.services).sort()) {
    const s = h.services[name]!;
    if (s.running) {
      s.running = false;
      s.startedPhysMs = null;
      s.loadedConfig = null;
      ctx.emit('host.serviceChanged', { hostId: h.id, service: name, running: false, failure: s.failure });
    } else if (s.loadedConfig) s.loadedConfig = null;
  }
  for (const t of Object.values(h.schedTasks)) {
    if (t.running) {
      t.running = false;
      t.runEndsPhysMs = null;
      t.lastResult = 1;
    }
  }
  cancelTimers(lab, (t) => t.kind === 'host.serviceReady' && t.payload.host === h.id);
}

/** Controller restart releases the magnetic lock of every gantry rig the Pi serves (Sim §3.7.4). */
function releaseRigLocks(lab: LabState, ctx: Ctx, h: Host): void {
  if (h.kind !== 'pi') return;
  for (const rid of Object.keys(lab.rigs).sort()) {
    const r = lab.rigs[rid]!;
    if (r.piHostId !== h.id || !r.hasGantry) continue;
    if (r.gantry.homed) r.gantry.homed = false;
    if (r.magneticLock.engaged) {
      r.magneticLock.engaged = false;
      r.magneticLock.brokenAtMs = lab.time.nowMs;
      ctx.emit('rig.lockBroken', { rigId: r.id, by: 'pi-reboot' });
    }
  }
}

/** Power gone / hard off: OS OFF, every service down. */
export function hostDown(lab: LabState, ctx: Ctx, h: Host): void {
  if (h.os === 'OFF') return;
  stopAll(lab, ctx, h);
  h.bootProgress = 0;
  h.bootStartedPhysMs = null;
  setOs(lab, ctx, h, 'OFF');
  releaseRigLocks(lab, ctx, h);
}

/** Start a boot now (or after `delayMs`, e.g. the 5 s of a `sudo reboot` shutdown). */
export function startBoot(lab: LabState, ctx: Ctx, h: Host, delayMs = 0): void {
  stopAll(lab, ctx, h);
  const start = lab.time.physMs + delayMs;
  h.bootStartedPhysMs = start;
  h.bootProgress = 0;
  h.uptimeMs = 0;
  h.underVoltage = false;
  setOs(lab, ctx, h, 'BOOTING');
  releaseRigLocks(lab, ctx, h);
  for (const name of Object.keys(h.services).sort()) {
    const s = h.services[name]!;
    if (!s.enabled) continue;
    s.failure = null;
    addTimer(lab, 'host.serviceReady', 'phys', delayMs + s.startDelayMs, { host: h.id, service: name, boot: start, restart: false });
  }
}

/** Is the host powered at its input this sub-step? (read-only) */
function hostHasPower(lab: LabState, h: Host, loadByHost: Record<string, string>): boolean {
  const L = ro(lab);
  const lid = loadByHost[h.id];
  if (lid) {
    const l = roAt(ro(L.power).loads, lid)!;
    return l.powered && !l.damaged;
  }
  if (h.kind === 'vm') return roAt(L.hosts, 'gpu-blade')?.os === 'RUNNING';
  return ro(h.supply).kind !== 'none';
}

/** Start a service now (after its readiness delay), running the start checks. */
function startServiceNow(lab: LabState, ctx: Ctx, h: Host, name: string): void {
  const s = h.services[name];
  if (!s || s.running) return;
  let failCause: string | null = null;
  let loaded: Record<string, string> | null = null;
  if (name === 'robot-controller') {
    const yaml = h.files['/etc/robot-controller/controller.yaml'] ?? '';
    const parsed = parseControllerYaml(yaml);
    if (!parsed.ok) failCause = `python3[812]: controller.yaml: ${parsed.error}`;
    else loaded = parsed.config;
  } else if (name === 'camera-stream') {
    if (!h.usb.includes('webcam')) failCause = NO_VIDEO0;
  } else if (name === 'cardprog') {
    if (h.files['/home/pi/.wine-cardprog/'] !== 'ok') failCause = WINE_BROKEN;
  }
  if (failCause) {
    s.running = false;
    s.failure = 'exit-code';
    s.startedPhysMs = null;
    appendJournal(h, name, crashLines(lab, h, name, failCause));
    ctx.emit('host.serviceChanged', { hostId: h.id, service: name, running: false, failure: 'exit-code' });
    return;
  }
  s.running = true;
  s.failure = null;
  s.startedPhysMs = lab.time.physMs;
  s.loadedConfig = loaded;
  appendJournal(h, name, [startedLine(lab, h, name)]);
  ctx.emit('host.serviceChanged', { hostId: h.id, service: name, running: true, failure: null });
}

export function appendJournal(h: Host, service: string, lines: string[]): void {
  const j = h.journal[service] ?? [];
  j.push(...lines);
  if (j.length > 50) j.splice(0, j.length - 50);
  h.journal[service] = j;
}

/** Crash a running service (`pi.serviceDown`, webcam pulled live, …). */
export function crashService(lab: LabState, ctx: Ctx, h: Host, name: string, cause: string): void {
  const s = h.services[name];
  if (!s) return;
  s.running = false;
  s.failure = 'exit-code';
  s.startedPhysMs = null;
  s.loadedConfig = null;
  cancelTimers(lab, (t) => t.kind === 'host.serviceReady' && t.payload.host === h.id && t.payload.service === name);
  appendJournal(h, name, crashLines(lab, h, name, cause));
  ctx.emit('host.serviceChanged', { hostId: h.id, service: name, running: false, failure: 'exit-code' });
}

/* ────────────────────────────── the system ────────────────────────────── */

export function hostsStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  // Timers first (service readiness, replugs, policy restores, sync completion).
  for (const t of takeDue(lab, ['host.'])) handleTimer(lab, ctx, t.kind, t.payload);

  const L = ro(lab);
  const loadsR = ro(ro(L.power).loads);
  const loadByHost: Record<string, string> = {};
  for (const lid of Object.keys(loadsR)) {
    const hid = ro(loadsR[lid]!).hostId;
    if (hid) loadByHost[hid] = lid;
  }
  const hostsR = ro(L.hosts);
  const ids = Object.keys(hostsR).sort();
  // Blade first so VMs see its state in the same sub-step.
  ids.sort((a, b) => (a === 'gpu-blade' ? -1 : b === 'gpu-blade' ? 1 : 0));
  const tenSec = Math.floor(phys / 10_000) !== Math.floor((phys - sub.dtPhysMs) / 10_000);
  const day = Math.floor((lab.time.nowMs - GORT_SYNC_AT) / DAY);
  const syncCrossed = sub.dtGameMs > 0 && day > Math.floor((sub.prevNowMs - GORT_SYNC_AT) / DAY);
  for (const id of ids) {
    const hr = ro(hostsR[id]!);
    if (hr.kind === 'workstation' || hr.kind === 'switch') continue;
    const powered = hostHasPower(lab, hr, loadByHost);
    const edge = powered && hr.hasPower === false;
    if (hr.hasPower !== powered) lab.hosts[id]!.hasPower = powered;
    if (!powered) {
      if (hr.os !== 'OFF') hostDown(lab, ctx, lab.hosts[id]!);
      continue;
    }
    if (edge || (hr.os === 'OFF' && hr.kind === 'pi')) {
      startBoot(lab, ctx, lab.hosts[id]!);
      continue;
    }
    // Pi under-voltage reboot loop (Sim §3.13.1 #8).
    const lid = loadByHost[id];
    if (lid && hr.kind === 'pi') {
      const l = ro(loadsR[lid]!);
      if (l.lowSincePhysMs != null && phys - l.lowSincePhysMs >= 100 && (hr.os !== 'BOOTING' || (hr.bootStartedPhysMs != null && phys - hr.bootStartedPhysMs >= 5_000))) {
        const h = lab.hosts[id]!;
        startBoot(lab, ctx, h);
        h.underVoltage = true;
        ctx.emit('power.underVoltage', { hostId: id, volts: l.volts ?? 0 });
        log(lab, 'hosts', 'warn', `${id}: hwmon hwmon1: Undervoltage detected!`);
        continue;
      }
    }
    if (hr.os === 'BOOTING' && hr.bootStartedPhysMs != null) {
      const p = Math.max(0, Math.min(1, (phys - hr.bootStartedPhysMs) / hr.bootDurationMs));
      const rp = Math.round(p * 100) / 100;
      if (hr.bootProgress !== rp) lab.hosts[id]!.bootProgress = rp;
      if (phys - hr.bootStartedPhysMs >= hr.bootDurationMs) {
        const h = lab.hosts[id]!;
        h.bootProgress = 1;
        setOs(lab, ctx, h, 'RUNNING');
      }
    }
    if (hr.os === 'RUNNING' && tenSec && hr.bootStartedPhysMs != null) {
      const up = Math.max(0, phys - hr.bootStartedPhysMs);
      if (hr.uptimeMs !== up) lab.hosts[id]!.uptimeMs = up;
    }
    // corporate agent fills the disk while log rotation is off (Sim §3.14.3).
    if (isWindows(hr) && hr.os === 'RUNNING' && sub.dtPhysMs > 0 && hr.diskUsedGb < hr.diskTotalGb && roAt(ro(hr.services), 'corporate-agent')?.running && (ro(hr.files)[corp_CFG] ?? '').includes('log.rotation=off')) {
      const used = Math.min(hr.diskTotalGb, Math.round((hr.diskUsedGb + 0.011 * (sub.dtPhysMs / 1000)) * 10000) / 10000);
      const h = lab.hosts[id]!;
      h.diskUsedGb = used;
      const pct = Math.round((used / h.diskTotalGb) * 100);
      if (h.diskUsedPct !== pct) h.diskUsedPct = pct;
    }
    // GortCardSync daily at 10:00 (game clock), once per crossing; a box that is down misses it.
    if (syncCrossed && roAt(ro(hr.schedTasks), 'GortCardSync')) {
      const h = lab.hosts[id]!;
      if (h.os === 'RUNNING' && hostNetUp(lab, h)) startSync(lab, h, false);
      else log(lab, 'hosts', 'info', `${h.hostname}: GortCardSync missed (box not running at 10:00)`);
    }
  }
  // Service mirrors (compatibility fields).
  const svcUp = (hid: string, svc: string) => {
    const h = roAt(hostsR, hid);
    return h?.os === 'RUNNING' && !!roAt(ro(h.services), svc)?.running;
  };
  const orcaUp = svcUp('orca-vm', 'orca');
  if (ro(ro(L.orca).app).up !== orcaUp) lab.orca.app.up = orcaUp;
  const jUp = svcUp('jenkins-vm', 'jenkins');
  if (ro(L.jenkins).up !== jUp) lab.jenkins.up = jUp;
  const oUp = svcUp('ollama-vm', 'ollama');
  if (ro(L.ollama).up !== oUp) lab.ollama.up = oUp;
}

function handleTimer(lab: LabState, ctx: Ctx, kind: string, p: Record<string, string | number | boolean | null>): void {
  const h = lab.hosts[String(p.host)];
  if (!h) return;
  switch (kind) {
    case 'host.serviceReady':
      if ((h.os === 'BOOTING' || h.os === 'RUNNING') && h.bootStartedPhysMs === p.boot) startServiceNow(lab, ctx, h, String(p.service));
      break;
    case 'host.replug': {
      const lid = String(p.load);
      if (lab.power.loads[lid]) {
        restoreHookup(lab, ctx, lid, p);
      } else h.supply = { kind: String(p.kind) as 'dc-rail', targetId: p.target == null ? null : String(p.target) };
      break;
    }
    case 'host.powerOn':
      if (h.os === 'OFF' && h.hasPower !== false) startBoot(lab, ctx, h);
      break;
    case 'host.shutdownDone':
      if (h.os === 'RUNNING') hostDown(lab, ctx, h);
      break;
    case 'host.policyRestore':
      policyRestore(lab, ctx, h, String(p.what), Number(p.size ?? 0));
      break;
    case 'host.schedTaskDone':
      finishSync(lab, ctx, h, p.manual === true);
      break;
  }
}

function restoreHookup(lab: LabState, ctx: Ctx, loadId: string, p: Record<string, string | number | boolean | null>): void {
  const load = lab.power.loads[loadId]!;
  if (load.supply.kind !== 'none') return;
  const target = p.target == null ? null : String(p.target);
  if (p.kind === 'ac-strip' && target && lab.power.strips[target]) {
    const s = lab.power.strips[target]!;
    const idx = Number(p.socket) - 1;
    if (s.loads[idx] != null) return;
    s.loads[idx] = loadId;
    load.supply = { kind: 'ac-strip', targetId: target, socket: idx + 1 };
  } else if (p.kind === 'dc-rail' && target && lab.power.terminals[target]) {
    const t = lab.power.terminals[target]!;
    if (t.plugged) return;
    t.plugged = loadId;
    load.supply = { kind: 'dc-rail', targetId: target };
  } else return;
  if (load.hostId && lab.hosts[load.hostId]) lab.hosts[load.hostId]!.supply = { ...load.supply };
  ctx.emit('power.plugged', { loadId, hookup: { ...load.supply } });
}

function policyRestore(lab: LabState, ctx: Ctx, h: Host, what: string, size: number): void {
  if (what === 'agent') {
    const s = h.services['corporate-agent'];
    if (s && !s.running && (h.os === 'RUNNING' || h.os === 'BOOTING')) {
      s.enabled = true;
      startServiceNow(lab, ctx, h, 'corporate-agent');
    }
  } else if (what === 'logs') {
    if (!(corp_LOGS in h.files)) {
      h.files[corp_LOGS] = `<size:${size.toFixed(1)}G>`;
      h.diskUsedGb = Math.min(h.diskTotalGb, Math.round((h.diskUsedGb + size) * 10000) / 10000);
      h.diskUsedPct = Math.round((h.diskUsedGb / h.diskTotalGb) * 100);
    }
  }
  log(lab, 'hosts', 'warn', `${h.hostname}: corporate security policy restored the agent (${what})`);
}

/* ────────────────────────────── GortCardSync (Sim §3.14.6) ────────────────────────────── */

function startSync(lab: LabState, h: Host, manual: boolean): void {
  const t = h.schedTasks.GortCardSync!;
  t.running = true;
  t.lastRunMs = lab.time.nowMs;
  t.runEndsPhysMs = lab.time.physMs + SYNC_MS;
  addTimer(lab, 'host.schedTaskDone', 'phys', SYNC_MS, { host: h.id, manual });
}

/** Files under `cards/` on gort `main` now (sim-devops repo), or the factory list when gort is unseeded. */
export function gortMainCardFiles(lab: LabState): { files: string[]; commit: string } {
  const repo = lab.repos?.gort;
  const files = repo ? Object.keys(repo.files).filter((p) => p.startsWith('cards/')).sort() : [];
  const head = repo?.branches?.[repo.defaultBranch];
  return { files: files.length ? files : [...FACTORY_CARD_FILES], commit: head ? head.slice(0, 7) : 'c41d9e2' };
}

/** Files under `cards/` at a gort commit (walks the repo history; factory fallbacks for c41d9e2 / 9f02a1b). */
export function gortCardFilesAt(lab: LabState, commit: string): string[] {
  const repo = lab.repos?.gort;
  if (repo) {
    const sha = Object.keys(repo.commits).find((s) => s.startsWith(commit));
    if (sha) {
      const chain: string[] = [];
      let cur: string | null = sha;
      const guard = new Set<string>();
      while (cur && repo.commits[cur] && !guard.has(cur)) {
        guard.add(cur);
        chain.push(cur);
        cur = repo.commits[cur]!.parent;
      }
      const files = new Set<string>();
      for (const c of chain.reverse()) {
        for (const [p, v] of Object.entries(repo.commits[c]!.changes)) {
          if (!p.startsWith('cards/')) continue;
          if (v == null) files.delete(p);
          else files.add(p);
        }
      }
      if (files.size) return [...files].sort();
    }
  }
  return commit.startsWith('9f02a1b') ? [...CARD_FILES_AT_9F02A1B] : [...FACTORY_CARD_FILES];
}

function finishSync(lab: LabState, ctx: Ctx, h: Host, manual: boolean): void {
  const t = h.schedTasks.GortCardSync;
  if (!t) return;
  t.running = false;
  t.runEndsPhysMs = null;
  if (h.os !== 'RUNNING' || !hostNetUp(lab, h) || !lab.network.switchUp) {
    t.lastResult = 1;
    ctx.emit('host.schedTaskRan', { hostId: h.id, task: 'GortCardSync', result: 1, commit: null, manual });
    return;
  }
  const { files, commit } = gortMainCardFiles(lab);
  t.lastResult = 0;
  lab.callus.localCardFiles[h.id] = { syncedCommit: commit, syncedAtMs: lab.time.nowMs, files };
  const lines = lab.callus.log[h.id] ?? [];
  lines.push(`GortCardSync: pulled ${commit} (${files.length} files)`);
  lab.callus.log[h.id] = lines;
  mirrorCallusFiles(lab, h.id);
  ctx.emit('host.schedTaskRan', { hostId: h.id, task: 'GortCardSync', result: 0, commit, manual });
  ctx.emit('callus.syncCompleted', { hostId: h.id, commit, files: files.length, manual });
}

/* ────────────────────────────── actions ────────────────────────────── */

export function hostRunSchedTask(lab: LabState, ctx: Ctx, hostId: string, task: string): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  const t = h.schedTasks[task];
  if (!t) return err(`ERROR: The system cannot find the file specified.`);
  if (h.os !== 'RUNNING') return err(`ERROR: ${h.hostname} is not running.`);
  if (t.running) return err(`ERROR: The task "${task}" is already running.`);
  startSync(lab, h, true);
  void ctx;
  return OK;
}

/** systemctl / sc start|stop|restart. */
export function hostService(lab: LabState, ctx: Ctx, hostId: string, service: string, action: 'start' | 'stop' | 'restart', actor: string): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.os !== 'RUNNING') return err(`${h.hostname} is not running`);
  const key = service === 'Callus' ? 'callus' : service.replace(/\.service$/, '');
  const s = h.services[key];
  if (!s) return err(isWindows(h) ? '[SC] OpenService FAILED 1060: The specified service does not exist as an installed service.' : `Failed to ${action} ${key}.service: Unit ${key}.service not found.`);
  if (key === 'corporate-agent' && action !== 'start') {
    stopService(lab, ctx, h, s);
    ctx.emit('host.securityTamper', { hostId, action: `${action} corporate-agent`, actor });
    addTimer(lab, 'host.policyRestore', 'phys', POLICY_RESTORE_MS, { host: hostId, what: 'agent', size: 0 });
    if (action === 'stop') return OK;
  }
  if (action === 'stop') {
    if (!s.running && !lab.timers.some((t) => t.kind === 'host.serviceReady' && t.payload.host === hostId && t.payload.service === key)) return OK;
    stopService(lab, ctx, h, s);
    return OK;
  }
  if (action === 'start' && s.running) return OK;
  if (s.running) stopService(lab, ctx, h, s);
  cancelTimers(lab, (t) => t.kind === 'host.serviceReady' && t.payload.host === hostId && t.payload.service === key);
  s.enabled = s.enabled || action === 'start' || action === 'restart';
  addTimer(lab, 'host.serviceReady', 'phys', RESTART_DELAYS[key] ?? 3_000, { host: hostId, service: key, boot: h.bootStartedPhysMs, restart: true });
  log(lab, 'hosts', 'info', `${h.hostname}: ${action} ${key} (${actor})`);
  return OK;
}

function stopService(lab: LabState, ctx: Ctx, h: Host, s: ServiceState): void {
  cancelTimers(lab, (t) => t.kind === 'host.serviceReady' && t.payload.host === h.id && t.payload.service === s.name);
  if (!s.running) return;
  s.running = false;
  s.failure = null;
  s.startedPhysMs = null;
  s.loadedConfig = null;
  appendJournal(h, s.name, [stoppedLine(lab, h, s.name)]);
  ctx.emit('host.serviceChanged', { hostId: h.id, service: s.name, running: false, failure: null });
}

/** `sudo reboot` / `shutdown /r`: services stop, shutdown, then boot. */
export function hostReboot(lab: LabState, ctx: Ctx, hostId: string): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.os !== 'RUNNING') return err(`${h.hostname} is not running`);
  if (h.kind === 'workstation' || h.kind === 'switch') return err('Operation not permitted');
  startBoot(lab, ctx, h, isWindows(h) ? 20_000 : 5_000);
  return OK;
}

/** Unplug, wait 5 s, replug (Pis) / hard power cycle (boxes, blade, VMs restart). */
export function hostPowerCycle(lab: LabState, ctx: Ctx, hostId: string): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.kind === 'workstation' || h.kind === 'switch') return err(`${h.hostname} cannot be power-cycled from here`);
  if (h.kind === 'vm') {
    startBoot(lab, ctx, h);
    return OK;
  }
  const load = Object.values(lab.power.loads).find((l) => l.hostId === hostId);
  if (h.kind === 'pi' || load) {
    if (load) {
      if (load.supply.kind === 'none') return err(`${load.label} is not plugged in`);
      const prev = { ...load.supply };
      for (const s of Object.values(lab.power.strips)) {
        const i = s.loads.indexOf(load.id);
        if (i >= 0) s.loads[i] = null;
      }
      for (const t of Object.values(lab.power.terminals)) if (t.plugged === load.id) t.plugged = null;
      load.supply = { kind: 'none', targetId: null };
      h.supply = { kind: 'none', targetId: null };
      ctx.emit('power.unplugged', { loadId: load.id });
      addTimer(lab, 'host.replug', 'phys', 5_000, { host: hostId, load: load.id, kind: prev.kind, target: prev.targetId, socket: prev.socket ?? null });
    } else {
      const prev = { ...h.supply };
      h.supply = { kind: 'none', targetId: null };
      addTimer(lab, 'host.replug', 'phys', 5_000, { host: hostId, load: '', kind: prev.kind, target: prev.targetId, socket: null });
    }
    return OK;
  }
  hostDown(lab, ctx, h);
  addTimer(lab, 'host.powerOn', 'phys', 5_000, { host: hostId });
  return OK;
}

/** Front power button: off → boot; on: short = shutdown (20 s, Windows), hold = hard off. */
export function hostPowerButton(lab: LabState, ctx: Ctx, hostId: string, hold: boolean): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.kind === 'pi') return err('The Raspberry Pi has no power button — unplug and replug its lead');
  if (h.kind === 'vm' || h.kind === 'switch') return err(`${h.hostname} has no physical power button`);
  if (h.os === 'OFF') {
    if (h.hasPower === false) return err('Nothing happens — no power at the brick');
    startBoot(lab, ctx, h);
    return OK;
  }
  if (hold) {
    hostDown(lab, ctx, h);
    return OK;
  }
  if (h.os === 'RUNNING') {
    for (const s of Object.values(h.services)) if (s.running) stopService(lab, ctx, h, s);
    addTimer(lab, 'host.shutdownDone', 'phys', isWindows(h) ? 20_000 : 30_000, { host: hostId });
  }
  return OK;
}

export function hostSetEthernet(lab: LabState, ctx: Ctx, hostId: string, eth: 'LINKED' | 'UNPLUGGED' | 'DAMAGED'): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.eth === eth) return OK;
  h.eth = eth;
  h.ethernet = eth !== 'UNPLUGGED';
  ctx.emit('host.ethernetChanged', { hostId, connected: h.ethernet, eth });
  return OK;
}

export function hostPlugUsb(lab: LabState, ctx: Ctx, hostId: string, usbId: string, attached: boolean): Result {
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  const has = h.usb.includes(usbId);
  if (has === attached) return OK;
  h.usb = attached ? [...h.usb, usbId] : h.usb.filter((u) => u !== usbId);
  ctx.emit('host.usbChanged', { hostId, usbId, attached });
  if (!attached && usbId === 'webcam' && h.services['camera-stream']?.running) crashService(lab, ctx, h, 'camera-stream', 'camera-stream[640]: VIDIOC_DQBUF: No such device');
  return OK;
}

const sizeOf = (v: string | undefined): number => {
  const m = /^<size:([\d.]+)G>$/.exec(v ?? '');
  return m ? Number(m[1]) : 0;
};

export function hostWriteFile(lab: LabState, ctx: Ctx, hostId: string, path: string, contents: string, actor: string): Result {
  if (hostId === 'ws-17') {
    lab.workstation.files[path] = contents;
    ctx.emit('host.fileWritten', { hostId, path, actor });
    return OK;
  }
  const h = lab.hosts[hostId];
  if (!h) return err(`unknown host '${hostId}'`);
  if (h.os !== 'RUNNING') return err(`${h.hostname} is not running`);
  if (h.diskUsedGb >= h.diskTotalGb - 0.001 && !(path in h.files)) return err(`${path}: No space left on device`);
  h.files[path] = contents;
  ctx.emit('host.fileWritten', { hostId, path, actor });
  return OK;
}

export function hostDeletePath(lab: LabState, ctx: Ctx, hostId: string, path: string, actor: string): Result {
  const files = hostId === 'ws-17' ? lab.workstation.files : lab.hosts[hostId]?.files;
  const h = lab.hosts[hostId];
  if (!files || !h) return err(`unknown host '${hostId}'`);
  const win = isWindows(h);
  const norm = win ? path.replace(/\//g, '\\') : path;
  const asDir = win ? (norm.endsWith('\\') ? norm : `${norm}\\`) : norm.endsWith('/') ? norm : `${norm}/`;
  const keys = Object.keys(files).filter((k) => k === norm || k === asDir || k.startsWith(asDir));
  if (!keys.length) return err(win ? 'The system cannot find the file specified.' : `rm: cannot remove '${path}': No such file or directory`);
  let freed = 0;
  for (const k of keys) {
    freed += sizeOf(files[k]);
    delete files[k];
  }
  if (win && keys.includes(corp_LOGS)) {
    ctx.emit('host.securityTamper', { hostId, action: `delete ${corp_LOGS}`, actor });
    addTimer(lab, 'host.policyRestore', 'phys', POLICY_RESTORE_MS, { host: hostId, what: 'logs', size: freed });
  }
  if (freed > 0 && hostId !== 'ws-17') {
    const before = h.diskUsedPct;
    h.diskUsedGb = Math.max(0, Math.round((h.diskUsedGb - freed) * 10000) / 10000);
    h.diskUsedPct = Math.round((h.diskUsedGb / h.diskTotalGb) * 100);
    ctx.emit('host.diskCleaned', { hostId, beforePct: before, afterPct: h.diskUsedPct });
  }
  return OK;
}

/** `host.cleanDisk`: delete temp files (Windows `C:\Windows\Temp` frees 2.0 GB; Pi `/tmp` 0.1 GB). */
export function hostCleanDisk(lab: LabState, ctx: Ctx, hostId: string): Result<{ beforePct: number; afterPct: number }> {
  const h = lab.hosts[hostId];
  if (!h) return { ok: false, error: `unknown host '${hostId}'` };
  const before = h.diskUsedPct;
  const freed = isWindows(h) ? 2.0 : h.kind === 'pi' ? 0.1 : 0.5;
  h.diskUsedGb = Math.max(0, Math.round((h.diskUsedGb - freed) * 10000) / 10000);
  h.diskUsedPct = Math.round((h.diskUsedGb / h.diskTotalGb) * 100);
  ctx.emit('host.diskCleaned', { hostId, beforePct: before, afterPct: h.diskUsedPct });
  return { ok: true, value: { beforePct: before, afterPct: h.diskUsedPct } };
}

/** Free disk in GB. */
export function diskFreeGb(h: Host): number {
  return Math.max(0, Math.round((h.diskTotalGb - h.diskUsedGb) * 10) / 10);
}

/** Minix front status screen text (Sim §3.14.2). */
export function callusScreenText(lab: LabState, boxId: string): string {
  const h = lab.hosts[boxId];
  if (!h || h.os !== 'RUNNING') return '';
  if (!h.services.callus?.running) return 'Callus service · STOPPED';
  const probes = Object.values(lab.collis)
    .filter((c) => c.callusHostId === boxId)
    .sort((a, b) => (lab.rigs[a.rigId]?.orcaRobotId ?? 0) - (lab.rigs[b.rigId]?.orcaRobotId ?? 0))
    .map((c) => c.rigId.toUpperCase());
  return `Callus service · listening on :9000 · probes: ${probes.join(', ')}`;
}

export { journalLine };
