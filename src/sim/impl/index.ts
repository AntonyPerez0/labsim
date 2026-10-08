/**
 * The SimApi implementation — assembled from sim-core namespaces + sim-devops (Sim =
 * docs/design/40-simulation.md).
 *
 * ── Ownership split ───────────────────────────────────────────────────────────────────────────────
 *
 * sim-core  (physical lab + Orca)                       sim-devops (software side)
 * ─────────────────────────────────────────────────     ──────────────────────────────────────────
 * files: src/sim/impl/**, src/sim/core/**,              files: src/sim/devops/**, src/sim/terminal/**,
 *   src/sim/seed/* (except repos/, jenkins.ts),           src/sim/seed/repos/**, src/sim/seed/jenkins.ts
 *   src/sim/text/*, initialState.ts, builders.ts
 * SimApi: lifecycle (tick/reset/snapshot/restore/load/   SimApi: git, jenkins, runner, ollama, terminal
 *   time/flags/config), orca, rig, device, power, host,    (createDevopsApi)
 *   collis, camera, laz, ocr, printer3d, chat, faults
 * State written: time, rng*, config, flags, orca,        State written: repos, jenkins, local, ollama,
 *   rigs, devices, hosts, network, workstation (adb,       workstation.configProperties, seq.build/run/
 *   files), power, collis, callus, laz, ubi, printer3d,    ollama/commit/pr, orca.pendingSyncs (push only)
 *   chat, faults, timers, log, seq (rest), captures
 * Tick slots (Sim §3.1.1): 1–8 and 13–16                 Tick slots: 9–12 via tickDevops()
 * Faults: §4.3.1–§4.3.7 rows + the engine (§4.1)         Faults: §4.3.8–§4.3.10 rows (DEVOPS_FAULTS)
 * Setup ops: §4.4.1 "core" rows                          Setup ops: §4.4.1 "devops" rows (DEVOPS_SETUP_OPS)
 *
 * Devops reaches the physical lab through `CoreServices` (bound below) and the documented helper
 * barrel `src/sim/core/index.ts`. Both halves implement Sim §6 determinism: no Math.random /
 * Date.now / setTimeout; RNG streams only.
 */
import '../events';
import { transact, getState } from '@/core/store';
import type { TxContext } from '@/core/store';
import { bindCoreServices, createDevopsApi, DEVOPS_TIMER_PREFIXES, tickDevops } from '../devops';
import type { CoreServices } from '../devops';
import { createInitialLabState, nextHealthBoundary, registerPresetBuilder } from '../initialState';
import type { LabState, SimConfig } from '../types';
import { DEFAULT_SEED, LAB_STATE_VERSION, SIM_SUBSTEP_MS } from '../types';
import type { Result, SimApi } from '../api';
import * as C from '../core';
import type { SubStep } from '../core';
import { clone } from '../core/util';
import { createCoreApi, tx } from './coreApi';

const HOUR_MS = 3_600_000;
const MAX_JUMP_MS = 86_400_000;

/** Core fault ids (Sim §4.3.1–§4.3.7) and setup ops (§4.4.1 core rows). */
export const CORE_FAULT_IDS = C.CORE_FAULT_IDS;
export const CORE_FAULTS = C.CORE_FAULTS;
export const CORE_SETUP_OPS = C.CORE_SETUP_OPS;
export const CORE_SETUP_OP_IDS = C.CORE_SETUP_OPS.map((d) => d.info.op);

registerPresetBuilder(C.buildPresetLab);

/* ────────────────────────────── Tick: systems in Sim §3.1.1 order ────────────────────────────── */

type SystemStep = (lab: LabState, ctx: TxContext, sub: SubStep) => void;

/** 1 clock — advance both clocks (due timers are handled by the owning system's slot, §6.2). */
const clockStep: SystemStep = (lab, _ctx, sub) => {
  lab.time.nowMs += sub.dtGameMs;
  lab.time.physMs += sub.dtPhysMs;
};

/** 16 housekeeping — deliver `chat.` timers, then caps (Sim §3.1.1 #16). */
const housekeepingStep: SystemStep = (lab, ctx, sub) => {
  for (const t of C.takeDue(lab, ['chat.'])) {
    if (t.kind === 'chat.deliver') {
      const p = t.payload;
      C.postChat(lab, ctx, String(p.channel), String(p.author), String(p.text), p.ticketId == null ? undefined : String(p.ticketId));
    }
  }
  // Top-level caps every sub-step; the nested sweep (notes, journals, consoles …) once per physical
  // second and on game-clock jumps — the caps bound sizes, they are not observable state transitions.
  keepLast(lab.log, lab.config.logCap);
  keepLast(lab.chat.messages, 200);
  C.capFaults(lab);
  const phys = lab.time.physMs;
  if (sub.dtPhysMs === 0 || Math.floor(phys / 1000) !== Math.floor((phys - sub.dtPhysMs) / 1000)) applyCaps(lab);
};

const SYSTEMS_BEFORE_DEVOPS: SystemStep[] = [
  clockStep,
  C.powerStep,
  C.hostsStep,
  (lab) => C.networkStep(lab),
  C.rigsStep,
  C.devicesStep,
  C.collisStep,
  C.orcaStep,
];
const SYSTEMS_AFTER_DEVOPS: SystemStep[] = [C.lazStep, (lab, ctx) => C.printer3dStep(lab, ctx), (lab, ctx) => C.faultsStep(lab, ctx), housekeepingStep];

function runSubstep(lab: LabState, ctx: TxContext, dtGameMs: number, dtPhysMs: number): void {
  const sub: SubStep = { dtGameMs, dtPhysMs, prevNowMs: lab.time.nowMs };
  for (const step of SYSTEMS_BEFORE_DEVOPS) step(lab, ctx, sub);
  tickDevops(lab, ctx, dtGameMs, dtPhysMs);
  for (const step of SYSTEMS_AFTER_DEVOPS) step(lab, ctx, sub);
}

function keepLast<T>(arr: T[], cap: number): void {
  if (arr.length > cap) arr.splice(0, arr.length - cap);
}

const SKIPPED_RE = /^… (\d+) lines skipped …$/;
/** Console cap: keep the first 50 lines, a marker, and the newest lines (Sim §1.12). */
function elide(lines: string[], cap: number): void {
  if (lines.length <= cap) return;
  const head = 50;
  const m = SKIPPED_RE.exec(lines[head] ?? '');
  const already = m ? Number(m[1]) : 0;
  const bodyStart = m ? head + 1 : head;
  const tailCount = cap - head - 1;
  const removed = lines.length - bodyStart - tailCount;
  const tail = lines.slice(lines.length - tailCount);
  lines.splice(head, lines.length - head, `… ${already + removed} lines skipped …`, ...tail);
}

function applyCaps(lab: LabState): void {
  keepLast(lab.log, lab.config.logCap);
  keepLast(lab.chat.messages, 200);
  for (const robot of Object.values(lab.orca.robots)) {
    if (robot.notes.length > 50) {
      const ids = robot.notes.map((n) => n.id).sort((a, b) => a - b);
      const cut = ids[robot.notes.length - 50 - 1]!;
      robot.notes = robot.notes.filter((n) => n.id > cut);
    }
    keepLast(robot.statusHistory, 100);
  }
  keepLast(lab.orca.healthCheck.log, 50);
  keepLast(lab.orca.audit, 500);
  // Local IntelliJ runs: keep every running one and the newest 30 finished (run-<seq>), console cap 400.
  const finishedRuns = Object.values(lab.local.runs)
    .filter((r) => r.state === 'finished')
    .sort((a, b) => Number(a.id.slice(a.id.lastIndexOf('-') + 1)) - Number(b.id.slice(b.id.lastIndexOf('-') + 1)));
  for (const r of finishedRuns.slice(0, Math.max(0, finishedRuns.length - 30))) delete lab.local.runs[r.id];
  for (const r of Object.values(lab.local.runs)) if (r.state === 'finished') elide(r.output, 400);
  keepLast(lab.ollama.requests, 30);
  keepLast(lab.power.sparks, 10);
  for (const host of Object.values(lab.hosts)) for (const lines of Object.values(host.journal)) keepLast(lines, 50);
  for (const lines of Object.values(lab.callus.log)) keepLast(lines, 50);
  for (const device of Object.values(lab.devices)) keepLast(device.logcat, 200);
  for (const build of Object.values(lab.jenkins.builds)) elide(build.console, 400);
  for (const job of Object.values(lab.jenkins.jobs)) {
    if (job.buildIds.length <= 20) continue;
    const finished = job.buildIds.filter((id) => lab.jenkins.builds[id]?.state === 'finished');
    if (finished.length > 0) {
      const byNumber = [...finished].sort((a, b) => (lab.jenkins.builds[a]?.number ?? 0) - (lab.jenkins.builds[b]?.number ?? 0));
      const drop = new Set(byNumber.slice(0, Math.min(byNumber.length, job.buildIds.length - 20)));
      job.buildIds = job.buildIds.filter((id) => !drop.has(id));
      for (const id of drop) delete lab.jenkins.builds[id];
    }
  }
  C.capFaults(lab);
}

/* ────────────────────────────── Presets, migrations ────────────────────────────── */

function setStartHour(lab: LabState, startHour: number): void {
  lab.time.startHour = startHour;
  lab.time.nowMs = startHour * HOUR_MS;
  lab.orca.healthCheck.lastRunMs = lab.time.nowMs;
  lab.orca.healthCheck.nextRunMs = nextHealthBoundary(lab.time.nowMs, lab.time.healthAnchorMs);
}

const REQUIRED_KEYS: (keyof LabState)[] = [
  'version', 'time', 'rng', 'rngStreams', 'config', 'flags', 'orca', 'rigs', 'devices', 'hosts', 'network', 'workstation', 'power',
  'collis', 'callus', 'repos', 'jenkins', 'local', 'laz', 'ubi', 'ollama', 'printer3d', 'chat', 'faults', 'timers', 'log', 'seq',
];

/** Validate + migrate a saved lab (Sim §6.4). Exported for tests. */
export function migrateLabState(raw: unknown): Result<{ state: LabState; migratedFrom: number | null }> {
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'not a LabSim save' };
    }
  }
  if (!obj || typeof obj !== 'object' || typeof (obj as { version?: unknown }).version !== 'number') return { ok: false, error: 'not a LabSim save' };
  const v = (obj as { version: number }).version;
  if (v > LAB_STATE_VERSION) return { ok: false, error: `save is from a newer LabSim (v${v}) — update the game` };
  if (v === LAB_STATE_VERSION) {
    for (const k of REQUIRED_KEYS) if (!(k in (obj as object))) return { ok: false, error: `save is corrupted: missing ${k}` };
    return { ok: true, value: { state: clone(obj as LabState), migratedFrom: null } };
  }
  if (v === 1) {
    // v1 = the pre-release stub (empty lab): re-seed the factory, keep clock + flags (Sim §6.4).
    const old = obj as { rng?: { seed?: number }; time?: { nowMs?: number; timeScale?: number; startHour?: number }; flags?: Partial<LabState['flags']> };
    const lab = createInitialLabState(typeof old.rng?.seed === 'number' ? old.rng.seed : DEFAULT_SEED);
    if (typeof old.time?.startHour === 'number') setStartHour(lab, old.time.startHour);
    if (typeof old.time?.nowMs === 'number') lab.time.nowMs = old.time.nowMs;
    lab.orca.healthCheck.nextRunMs = nextHealthBoundary(lab.time.nowMs, lab.time.healthAnchorMs);
    if (typeof old.time?.timeScale === 'number') lab.time.timeScale = C.snapScale(old.time.timeScale);
    lab.flags = { ...lab.flags, ...(old.flags ?? {}), cfdLayoutV2Toggle: false };
    lab.time.dateLabel = 'MON, OCT 5';
    return { ok: true, value: { state: lab, migratedFrom: 1 } };
  }
  return { ok: false, error: 'not a LabSim save' };
}

function replaceLab(state: LabState, migratedFrom: number | null): void {
  transact((root, ctx) => {
    root.lab = state;
    ctx.emit('sim.restored', { version: state.version, migratedFrom });
  });
}

/** Game-clock-only jump (Sim §6.3). */
function jump(gameMs: number, reason: 'skipToNextHealthCheck' | 'fastForward'): void {
  if (!(gameMs > 0) || gameMs > MAX_JUMP_MS) {
    transact((root) => C.log(root.lab, 'sim', 'warn', `fastForward(${gameMs}) ignored (0 < ms ≤ ${MAX_JUMP_MS})`));
    return;
  }
  transact((root, ctx) => {
    const fromMs = root.lab.time.nowMs;
    runSubstep(root.lab, ctx, gameMs, 0);
    root.lab.rngStreams.core = { ...root.lab.rng };
    ctx.emit('time.jumped', { fromMs, toMs: root.lab.time.nowMs, reason });
  });
}

/* ────────────────────────────── CoreServices (bound into sim-devops) ────────────────────────────── */

const coreServices: CoreServices = {
  resolve: (lab, target) => C.resolve(lab, target),
  reach: (lab, _ctx, from, target, port) => C.reach(lab, from, target, port),
  http: (lab, ctx, req) => C.http(lab, ctx, req),
  isDeviceTypeConstant: (raw) => C.isDeviceTypeConstant(raw),
  checkout: (lab, ctx, req) => C.checkout(lab, ctx, req),
  release: (lab, ctx, robotId, buildId) => C.release(lab, ctx, robotId, buildId),
  capabilityDocument: (lab, robotId) => {
    const r = lab.orca.robots[robotId];
    return r ? C.capabilityDocument(lab, r) : null;
  },
  matchPreview: (lab, caps, env) => C.matchPreview(lab, caps, env),
  xyTouch: (lab, ctx, robot, screen, button, actor, opts) => C.xyTouch(lab, ctx, robot, screen, button, String(actor), opts ?? {}),
  cardAction: (lab, ctx, robot, entry, profile, actor) => C.cardAction(lab, ctx, robot, entry, profile, actor),
  screenCompare: (lab, ctx, name, actor) => C.screenCompare(lab, ctx, name, actor, 'runner'),
  tesseract: (lab, imageRef, bbox) => {
    const f = C.frameOf(lab, imageRef);
    return f ? C.tesseract(f.labels, bbox) : { text: '', confidence: 0 };
  },
  layout: (lab, deviceId, display) => {
    const d = lab.devices[deviceId];
    return d ? C.layoutButtons(lab, d, display) : [];
  },
  touch: (lab, ctx, deviceId, display, x, y, source) => {
    const r = C.deviceTouch(lab, ctx, deviceId, display, x, y, source);
    return { hitButton: r.ok && r.value.result === 'HIT' ? r.value.hitButton : null };
  },
  stroke: (lab, ctx, deviceId, display, points, source) => {
    const r = C.deviceStroke(lab, ctx, deviceId, display, points, source);
    return { effect: r.ok ? r.value.effect : 'ignored' };
  },
  adbConnect: (lab, ctx, target) => C.adbConnect(lab, ctx, target),
  adbShell: (lab, ctx, target, argv, by) => C.adbShell(lab, ctx, target, argv, by),
  uiDump: (lab, deviceId, display) => C.uiDump(lab, deviceId, display),
  startLaz: (lab, ctx, deviceId, toMerchantId, opts) => C.startLaz(lab, ctx, deviceId, toMerchantId, opts),
  hostService: (lab, ctx, hostId, service, action, actor) => C.hostService(lab, ctx, hostId, service, action, String(actor)),
  hostReboot: (lab, ctx, hostId) => C.hostReboot(lab, ctx, hostId),
  hostWriteFile: (lab, ctx, hostId, path, contents, actor) => C.hostWriteFile(lab, ctx, hostId, path, contents, String(actor)),
  hostDeletePath: (lab, ctx, hostId, path, actor) => C.hostDeletePath(lab, ctx, hostId, path, String(actor)),
  runSchedTask: (lab, ctx, hostId, task) => C.hostRunSchedTask(lab, ctx, hostId, task),
  postChat: (lab, ctx, channel, author, text, ticketId) => C.postChat(lab, ctx, channel, author, text, ticketId),
  addTimer: (lab, kind, clock, delayMs, payload) => C.addTimer(lab, kind, clock, delayMs, payload),
  rand: (lab, stream) => C.rand(lab, stream),
  log: (lab, source, level, text) => C.log(lab, source, level, text),
};
bindCoreServices(coreServices);

/* ────────────────────────────── The SimApi object ────────────────────────────── */

const devops = createDevopsApi();
const core = createCoreApi();

export const sim: SimApi = {
  /* lifecycle */
  tick(dtGameMs) {
    if (!(dtGameMs > 0) || !Number.isFinite(dtGameMs)) return;
    transact((root, ctx) => {
      const lab = root.lab;
      const scale = lab.time.timeScale > 0 ? lab.time.timeScale : 1;
      const dtPhys = dtGameMs / scale;
      const n = Math.max(1, Math.ceil(dtPhys / SIM_SUBSTEP_MS - 1e-9));
      for (let i = 0; i < n; i++) runSubstep(lab, ctx, dtGameMs / n, dtPhys / n);
      if (lab.rngStreams.core.state !== lab.rng.state) lab.rngStreams.core = { ...lab.rng };
    });
  },
  reset(options = {}) {
    const seed = options.seed ?? DEFAULT_SEED;
    const { lab, preset } = C.buildPresetLab(options.preset ?? 'factory', seed, options.startHour, options.timeScale);
    transact((root, ctx) => {
      root.lab = lab;
      ctx.emit('sim.reset', { preset, seed });
    });
  },
  snapshot() {
    return clone(getState().lab);
  },
  restore(state) {
    const r = migrateLabState(state);
    if (!r.ok) {
      transact((root) => C.log(root.lab, 'sim', 'error', `restore rejected: ${r.error}`));
      return;
    }
    replaceLab(r.value.state, r.value.migratedFrom);
  },
  setTimeScale(scale) {
    transact((root, ctx) => {
      const to = C.snapScale(scale);
      if (to !== scale) C.log(root.lab, 'sim', 'warn', `timeScale ${scale} snapped to ${to}`);
      const from = root.lab.time.timeScale;
      if (from === to) return;
      root.lab.time.timeScale = to;
      ctx.emit('time.scaleChanged', { from, to });
    });
  },
  skipToNextHealthCheck() {
    const t = getState().lab.time;
    jump(nextHealthBoundary(t.nowMs, t.healthAnchorMs) - t.nowMs, 'skipToNextHealthCheck');
  },
  setFlag(flag, value) {
    tx((lab, ctx) => {
      C.applyFlag(lab, ctx, flag, value);
    });
  },
  fastForward(gameMs) {
    jump(gameMs, 'fastForward');
  },
  setConfig(patch) {
    transact((root, ctx) => {
      const keys = (Object.keys(patch) as (keyof SimConfig)[]).filter((k) => k in root.lab.config && patch[k] !== undefined && patch[k] !== root.lab.config[k]);
      if (keys.length === 0) return;
      root.lab.config = { ...root.lab.config, ...Object.fromEntries(keys.map((k) => [k, patch[k]])) };
      ctx.emit('config.changed', { keys });
    });
  },
  load(json) {
    const r = migrateLabState(json);
    if (!r.ok) return r;
    replaceLab(r.value.state, r.value.migratedFrom);
    return { ok: true, value: { migratedFrom: r.value.migratedFrom } };
  },
  presets() {
    return [...C.PRESET_NAMES];
  },

  /* sim-core namespaces */
  ...core,

  /* sim-devops namespaces */
  git: devops.git,
  jenkins: devops.jenkins,
  runner: devops.runner,
  ollama: devops.ollama,
  terminal: devops.terminal,
};

/** Re-exported for sim-core systems: devops-owned timer prefixes are never handled by core steps. */
export { DEVOPS_TIMER_PREFIXES };
