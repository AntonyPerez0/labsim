/**
 * sim-devops — the "software side" half of the simulation (Sim = docs/design/40-simulation.md).
 *
 * Owns (state): `repos`, `jenkins`, `local`, `ollama` (+ the GitHub PR / NPC-review bookkeeping
 * inside `repos`), `workstation.configProperties` (parsed view), `workstation.cwd/shellHistory/sshHostId`
 * (terminal session), `seq.build/run/ollama/commit/pr`.
 * Owns (behaviour): Jenkins scheduler + stage machine (Sim §3.18), runners — uia-remote (§3.19),
 * Pigeon LSTR (§3.20), Go SDK / vision / iOS (§3.21) — local IntelliJ runs, Ollama (§3.21.2),
 * git/GitHub + scripted reviewers (§3.22.1–§3.22.2), the terminal interpreter (apps doc §5; uses
 * CoreServices for everything physical), code facts (§3.19.6), and the devops fault rows
 * (§4.3.8–§4.3.10) + devops setup ops (§4.4.1 "devops").
 * Tick slot: steps 9–12 of Sim §3.1.1 — one call to `tickDevops` per sub-step. Timer kind prefixes
 * owned here: DEVOPS_TIMER_PREFIXES.
 *
 * Everything physical (Orca, rigs, devices, hosts, power, Callus, Laz) is sim-core; devops reaches it
 * only through `CoreServices` (bound by `src/sim/impl/index.ts` at module load) or by reading state.
 * This file is the cross-half CONTRACT plus the assembly of the implementation files next to it.
 */
import { getState, transact } from '@/core/store';
import type { TxContext } from '@/core/store';
import type {
  ActiveFault,
  CapabilityDocument,
  CardEntry,
  FaultParamValue,
  LabState,
  RepoId,
  RngStream,
  RobotStatus,
  SimTimer,
} from '../types';
import type {
  Actor,
  CardActionResult,
  CheckoutOutcome,
  CheckoutRequest,
  FaultInfo,
  LayoutButton,
  MatchPreviewRow,
  RestResponse,
  Result,
  SetupOpInfo,
  SimApi,
  XyTouchOptions,
  XyTouchResult,
} from '../api';
import { core } from './coreRef';
import { ro } from '../core/ro';
import { DEVOPS_FAULT_DEFS, DEVOPS_SETUP_OP_DEFS } from './faults';
import * as git from './git';
import * as gh from './github';
import { abortBuild, queueBuild, tickJenkins } from './jenkins/engine';
import { createJob, deleteJob, moveJob, saveJob } from './jenkins/jobs';
import { runLocal, stopLocal, tickLocal } from './local';
import { ask as ollamaAsk, complete as ollamaComplete } from './ollama';
import { createTerminal } from '../terminal';
// Side-effect imports: register runner step handlers.
import './runners/uia';
import './runners/pigeon';
import './runners/other';

export { bindCoreServices, core } from './coreRef';
export { validateConfigProperties } from './config';
export type { ConfigCheckRow } from './config';

/* ────────────────────────────── Public devops surface ────────────────────────────── */

/** The SimApi namespaces implemented by sim-devops. */
export type DevopsApi = Pick<SimApi, 'git' | 'jenkins' | 'runner' | 'ollama' | 'terminal'>;

/** Timer kind prefixes handled inside `tickDevops` (Sim §3.1.2, §6.2). Every other prefix is sim-core's. */
export const DEVOPS_TIMER_PREFIXES = ['jenkins.', 'runner.', 'local.', 'git.', 'npc.', 'ollama.'] as const;

/** Setup ops implemented by devops (Sim §4.4.1). */
export const DEVOPS_SETUP_OP_IDS = [
  'ollama.seedReceipt',
  'repo.clone',
  'repo.commitFixture',
  'repo.deleteFile',
  'github.seedPr',
  'github.reopenPr',
  'github.unmergePr',
  'config.write',
  'jenkins.setParam',
  'jenkins.startBuild',
  'jenkins.seedBuild',
  'runner.startLocal',
] as const;

/** Fault ids implemented by devops (Sim §4.3.8–§4.3.10). */
export const DEVOPS_FAULT_IDS = [
  'gort.capabilityDropped',
  'pigeon.missingComma',
  'pigeon.missingBracket',
  'pigeon.screenCompareEmpty',
  'uia.waitForScreenStub',
  'uia.scrollSwapped',
  'uia.missingScreenMethods',
  'uia.teardownMissing',
  'config.port5555',
  'config.value',
  'config.themeKernel',
  'jenkins.envCase',
  'jenkins.jobMoved',
  'jenkins.capsConflict',
  'jenkins.namedRobot',
  'rig.testRunning',
] as const;

/* ────────────────────────────── Cross-half internal contract ────────────────────────────── */

/** Reachability of `target` (ip | ip:port | hostname) from a host (Sim §1.9). */
export interface ReachResult {
  ok: boolean;
  /** 'no-route' = unknown / device off; 'timeout' = host down, cable, switch; 'refused' = nothing listening. */
  kind: 'ok' | 'no-route' | 'timeout' | 'refused';
  /** Exact error tail used by tools: "No route to host", "connect timed out", "Connection refused"; null when ok. */
  error: string | null;
  /** LAN latency (devices stream) or the timeout (10 000 ms). */
  latencyMs: number;
  hostId: string | null;
  deviceId: string | null;
}

/** Effect of an `adb shell …` / `adb exec-out …` command on a device (Sim §3.15.1). */
export interface AdbShellResult {
  ok: boolean;
  /** Output lines exactly as adb prints them (may be empty). */
  lines: string[];
  /** Workstation file written (pull / screencap redirect), if any. */
  file?: { path: string; contents: string };
}

/**
 * Functions sim-devops calls into sim-core. Implemented by sim-core and bound once at module load
 * by `src/sim/impl/index.ts` (`bindCoreServices`). Every function operates on the draft `lab` of the
 * current transaction (`ctx` from `transact()`); none of them opens its own transaction.
 */
export interface CoreServices {
  /* Network (Sim §1.9) */
  resolve(lab: LabState, target: string): { hostId: string | null; deviceId: string | null; ip: string | null };
  /** Mutates the damaged-cable attempt counter and draws LAN latency from the `devices` stream. */
  reach(lab: LabState, ctx: TxContext, fromHostId: string, target: string, port: number | null): ReachResult;
  /** HTTP to Orca (:8080 on orca-vm), Robot Pis (:8000, :8081), Callus (:9000) — Sim §3.23. Ollama and Jenkins are devops. */
  http(lab: LabState, ctx: TxContext, req: { method: string; url: string; body: string | null; fromHostId: string; actor: Actor }): RestResponse;

  /* Orca (Sim §3.2–§3.6, §3.12) */
  /** Pure `DeviceType.valueOf` check (exact, case-sensitive). */
  isDeviceTypeConstant(raw: string): boolean;
  checkout(lab: LabState, ctx: TxContext, req: CheckoutRequest): CheckoutOutcome;
  release(lab: LabState, ctx: TxContext, robotId: number, buildId: string): { lines: string[]; statusAfter: RobotStatus };
  capabilityDocument(lab: LabState, robotId: number): CapabilityDocument | null;
  matchPreview(lab: LabState, caps: Record<string, string | boolean>, environment: string): MatchPreviewRow[];
  xyTouch(lab: LabState, ctx: TxContext, robotName: string, screen: string, button: string, actor: Actor, opts?: XyTouchOptions): Result<XyTouchResult>;
  cardAction(lab: LabState, ctx: TxContext, robotName: string, entry: CardEntry, profile: string, actor: Actor): Result<CardActionResult | undefined>;
  /** Orca Screen Compare by name (runner `orca.screenCompare(name)`): result + the exact `[ocr] …` line. */
  screenCompare(lab: LabState, ctx: TxContext, name: string, actor: Actor): Result<{ text: string; expected: string; match: boolean; line: string }>;
  tesseract(lab: LabState, imageRef: string, bbox: { x: number; y: number; w: number; h: number }): { text: string; confidence: number };

  /* Devices (Sim §3.8–§3.11, §3.15) */
  layout(lab: LabState, deviceId: string, display: 'primary' | 'secondary'): LayoutButton[];
  touch(lab: LabState, ctx: TxContext, deviceId: string, display: 'primary' | 'secondary', xMm: number, yMm: number, source: 'adb' | 'probe' | 'player'): { hitButton: string | null };
  stroke(lab: LabState, ctx: TxContext, deviceId: string, display: 'primary' | 'secondary', points: { xMm: number; yMm: number }[], source: 'adb' | 'probe' | 'player'): { effect: 'signature' | 'scroll' | 'ignored' };
  /** `adb connect <target>` from the workstation: exact output line and the connection it added. */
  adbConnect(lab: LabState, ctx: TxContext, target: string): { line: string; ok: boolean };
  /** `adb -s <target> shell|exec-out …` argv after the target; drives coworker devices too (emits adb.coworkerDriven). */
  adbShell(lab: LabState, ctx: TxContext, target: string, argv: string[], by: 'terminal' | 'runner'): AdbShellResult;
  /** UI Automator hierarchy XML of a display (2.2: primary only; 2.3: displayId 1 = Duo CFD), Sim §3.11. */
  uiDump(lab: LabState, deviceId: string, display: 'primary' | 'secondary'): string;
  startLaz(lab: LabState, ctx: TxContext, deviceId: string, toMerchantId: number, opts: { buildId: string | null; actor: Actor }): Result<{ runId: string }>;

  /* Hosts (Sim §3.14) */
  hostService(lab: LabState, ctx: TxContext, hostId: string, service: string, action: 'start' | 'stop' | 'restart', actor: Actor): Result;
  hostReboot(lab: LabState, ctx: TxContext, hostId: string, actor: Actor): Result;
  hostWriteFile(lab: LabState, ctx: TxContext, hostId: string, path: string, contents: string, actor: Actor): Result;
  hostDeletePath(lab: LabState, ctx: TxContext, hostId: string, path: string, actor: Actor): Result;
  runSchedTask(lab: LabState, ctx: TxContext, hostId: string, task: 'GortCardSync', actor: Actor): Result;

  /* Shared utilities */
  postChat(lab: LabState, ctx: TxContext, channel: string, author: string, text: string, ticketId?: string): void;
  /** Adds a SimTimer; returns its id. */
  addTimer(lab: LabState, kind: string, clock: 'game' | 'phys', delayMs: number, payload: Record<string, string | number | boolean | null>): string;
  /** One float in [0,1) from a stream (Sim §6.1). */
  rand(lab: LabState, stream: RngStream): number;
  log(lab: LabState, source: string, level: 'debug' | 'info' | 'warn' | 'error', text: string): void;
}

/** Internal definition of a fault (catalogue row + behaviour). Core and devops both export arrays of these. */
export interface FaultDef {
  info: FaultInfo;
  /** Pure validation against the current state (params already defaulted and '@random'-resolved). Returns the target or an error text (Sim §4.1.3). */
  validate(lab: LabState, params: Record<string, FaultParamValue>): Result<{ target: string }>;
  /** Apply the mutation; must record every written leaf via `record` (undo patches, Sim §4.1.3 #5). */
  apply(lab: LabState, ctx: TxContext, params: Record<string, FaultParamValue>, record: (path: (string | number)[], before: unknown, after: unknown) => void): void;
  /** Pure clear predicate (Sim §4.1.6). */
  isResolved(lab: LabState, fault: ActiveFault): boolean;
  /** Optional custom revert (default: undo patches whose value still equals `after`, Sim §4.1.5). */
  revert?(lab: LabState, ctx: TxContext, fault: ActiveFault): void;
}

/** Internal definition of a setup op (Sim §4.4.1). */
export interface SetupOpDef {
  info: SetupOpInfo;
  validate(lab: LabState, params: Record<string, unknown>): Result;
  apply(lab: LabState, ctx: TxContext, params: Record<string, unknown>): void;
}

/**
 * Remove and return the due timers whose kind starts with one of `prefixes`, in (atMs, insertion)
 * order (Sim §6.2). Game timers are due at `atMs <= nowMs`, physical ones at `atMs <= physMs`.
 * Shared by both halves (each passes its own prefixes).
 */
export function takeDueTimers(lab: LabState, prefixes: readonly string[]): SimTimer[] {
  // Read-only pre-scan (no immer drafts for the common case of nothing due, see core/ro).
  const L = ro(lab);
  const time = ro(L.time);
  const timers = ro(L.timers);
  const dueIdx: number[] = [];
  for (let i = 0; i < timers.length; i++) {
    const t = ro(timers[i]!);
    if (t.atMs <= (t.clock === 'game' ? time.nowMs : time.physMs) && prefixes.some((p) => t.kind.startsWith(p))) dueIdx.push(i);
  }
  if (dueIdx.length === 0) return [];
  const due = dueIdx.map((i) => ({ t: JSON.parse(JSON.stringify(ro(timers[i]!))) as SimTimer, i }));
  const drop = new Set(dueIdx);
  lab.timers = lab.timers.filter((_, i) => !drop.has(i));
  due.sort((a, b) => a.t.atMs - b.t.atMs || a.i - b.i);
  return due.map((d) => d.t);
}

/** Devops fault rows (Sim §4.3.8–§4.3.10); ids in DEVOPS_FAULT_IDS. */
export const DEVOPS_FAULTS: FaultDef[] = DEVOPS_FAULT_DEFS;
/** Devops setup ops (Sim §4.4.1); ids in DEVOPS_SETUP_OP_IDS. */
export const DEVOPS_SETUP_OPS: SetupOpDef[] = DEVOPS_SETUP_OP_DEFS;

/* ────────────────────────────── SimApi namespaces ────────────────────────────── */

const res = <T>(r: { ok: boolean; error?: string; value?: T }): Result<T> => (r.ok ? { ok: true, value: r.value as T } : { ok: false, error: r.error ?? 'error' });
const asRepo = (repo: string): RepoId | null => (git.isRepoId(repo) ? repo : null);
const noRepo = <T>(repo: string): Result<T> => ({ ok: false, error: `ERROR: Repository not found: labsim-lab/${repo}` });
const actorKey = (a: Actor): string => String(a);

export function createDevopsApi(): DevopsApi {
  const terminal = createTerminal();
  return {
    git: {
      clone: (repo, actor) => (asRepo(repo) ? transact((r, ctx) => res(git.clone(r.lab, ctx, repo, actorKey(actor)))) : noRepo(repo)),
      checkout: (repo, branch, create) => (asRepo(repo) ? transact((r, ctx) => res(git.checkout(r.lab, ctx, repo, branch, create))) : noRepo(repo)),
      writeFile: (repo, path, contents) => (asRepo(repo) ? transact((r, ctx) => res(git.writeFile(r.lab, ctx, repo, path, contents))) : noRepo(repo)),
      stage: (repo, paths) => (asRepo(repo) ? transact((r, ctx) => res(git.stage(r.lab, ctx, repo, paths))) : noRepo(repo)),
      commit: (repo, message, actor) => (asRepo(repo) ? transact((r, ctx) => res(git.commit(r.lab, ctx, repo, message, actorKey(actor)))) : noRepo(repo)),
      push: (repo) => (asRepo(repo) ? transact((r, ctx) => res(git.push(r.lab, ctx, repo, true))) : noRepo(repo)),
      pull: (repo) => (asRepo(repo) ? transact((r, ctx) => res(git.pull(r.lab, ctx, repo))) : noRepo(repo)),
      createPullRequest: (repo, title, body, sourceBranch, actor) => (asRepo(repo) ? transact((r, ctx) => res(gh.createPullRequest(r.lab, ctx, repo, title, body, sourceBranch, actorKey(actor)))) : noRepo(repo)),
      approvePullRequest: (repo, n, actor) => (asRepo(repo) ? transact((r, ctx) => res(gh.approve(r.lab, ctx, repo, n, actorKey(actor)))) : noRepo(repo)),
      mergePullRequest: (repo, n, actor) =>
        asRepo(repo)
          ? transact((r, ctx) => {
              const x = gh.mergePr(r.lab, ctx, repo, n, actorKey(actor));
              return x.ok ? { ok: true as const, value: undefined } : { ok: false as const, error: x.error ?? 'error' };
            })
          : noRepo(repo),
      requestChanges: (repo, n, actor, reason) => (asRepo(repo) ? transact((r, ctx) => res(gh.requestChanges(r.lab, ctx, repo, n, actorKey(actor), reason))) : noRepo(repo)),
      comment: (repo, n, c, actor) => (asRepo(repo) ? transact((r, ctx) => res(gh.comment(r.lab, ctx, repo, n, c, actorKey(actor)))) : noRepo(repo)),
      closePullRequest: (repo, n, actor) => (asRepo(repo) ? transact((r, ctx) => res(gh.closePr(r.lab, ctx, repo, n, actorKey(actor)))) : noRepo(repo)),
      revert: (repo, sha, actor) => (asRepo(repo) ? transact((r, ctx) => res(git.revert(r.lab, ctx, repo, sha, actorKey(actor)))) : noRepo(repo)),
      deleteFile: (repo, path) => (asRepo(repo) ? transact((r, ctx) => res(git.deleteFile(r.lab, ctx, repo, path))) : noRepo(repo)),
      moveFile: (repo, from, to) => (asRepo(repo) ? transact((r, ctx) => res(git.moveFile(r.lab, ctx, repo, from, to))) : noRepo(repo)),
      discard: (repo, path) => (asRepo(repo) ? transact((r, ctx) => res(git.discard(r.lab, ctx, repo, path))) : noRepo(repo)),
    },
    jenkins: {
      build: (jobId, params, by) =>
        transact((r, ctx) => {
          const x = queueBuild(r.lab, ctx, jobId, params, actorKey(by));
          return x.ok ? { ok: true as const, value: { buildId: x.buildId } } : x;
        }),
      abort: (buildId, actor) => transact((r, ctx) => {
        const x = abortBuild(r.lab, ctx, buildId, actorKey(actor));
        return x.ok ? { ok: true as const, value: undefined } : x;
      }),
      recentBuilds: (jobId, n) => {
        const lab = getLab();
        const job = lab.jenkins.jobs[jobId];
        if (!job) return [];
        return job.buildIds
          .map((id) => lab.jenkins.builds[id])
          .filter((b): b is NonNullable<typeof b> => !!b)
          .sort((a, b) => b.number - a.number)
          .slice(0, n);
      },
      saveJob: (jobId, patch, actor) => transact((r, ctx) => saveJob(r.lab, ctx, jobId, patch, actorKey(actor))),
      configureScript: (jobId, script, actor) => transact((r, ctx) => saveJob(r.lab, ctx, jobId, { script }, actorKey(actor))),
      moveJob: (jobId, toFolder, actor) => transact((r, ctx) => moveJob(r.lab, ctx, jobId, toFolder, actorKey(actor))),
      createJob: (spec, actor) => transact((r, ctx) => createJob(r.lab, ctx, spec, actorKey(actor))),
      deleteJob: (jobId, actor) => transact((r, ctx) => deleteJob(r.lab, ctx, jobId, actorKey(actor))),
      job: (jobId) => getLab().jenkins.jobs[jobId] ?? null,
    },
    runner: {
      runLocal: (repo, testPath, actor, opts) => transact((r, ctx) => {
        const x = runLocal(r.lab, ctx, repo, testPath, actorKey(actor), opts?.configPath);
        return x.ok ? { ok: true as const, value: { runId: x.runId } } : x;
      }),
      stopLocal: (runId) => transact((r, ctx) => {
        const x = stopLocal(r.lab, ctx, runId);
        return x.ok ? { ok: true as const, value: undefined } : x;
      }),
      output: (runId) => {
        const run = getLab().local.runs[runId];
        if (!run) return { lines: [], done: true, passed: null };
        return { lines: run.output, done: run.state === 'finished', passed: run.passed };
      },
    },
    ollama: {
      ask: (model, prompt, image, actor) => transact((r, ctx) => {
        const x = ollamaAsk(r.lab, ctx, model, prompt, image, actorKey(actor));
        return x.ok ? { ok: true as const, value: { requestId: x.requestId } } : x;
      }),
    },
    terminal,
  };
}

const getLab = (): LabState => getState().lab;

/* ────────────────────────────── Tick (Sim §3.1.1 steps 9–12) ────────────────────────────── */

/**
 * Sim §3.1.1 steps 9–12 for one sub-step: jenkins (schedules, queue → executors, stages, runner
 * steps), local runs, ollama, git/npc. Handles due timers whose kind starts with a
 * DEVOPS_TIMER_PREFIXES entry. `dtGameMs` / `dtPhysMs` are the sub-step's advances (`dtPhysMs` = 0
 * for game-clock jumps).
 */
export function tickDevops(lab: LabState, ctx: TxContext, dtGameMs: number, dtPhysMs: number): void {
  void dtGameMs;
  void dtPhysMs;
  // 9 jenkins (+ runner timers)
  takeDueTimers(lab, ['jenkins.', 'runner.']);
  tickJenkins(lab, ctx);
  // 10 local runs
  takeDueTimers(lab, ['local.']);
  tickLocal(lab, ctx);
  // 11 ollama
  for (const t of takeDueTimers(lab, ['ollama.'])) if (t.kind === 'ollama.done') ollamaComplete(lab, ctx, String(t.payload['requestId']));
  // 12 git / npc
  for (const t of takeDueTimers(lab, ['git.', 'npc.'])) {
    const repo = String(t.payload['repo'] ?? '') as RepoId;
    if (t.kind === 'npc.review') {
      const pr = gh.findPr(lab, repo, Number(t.payload['number']));
      if (pr && pr.reviewDuePhysMs !== null && pr.reviewDuePhysMs === Number(t.payload['due'])) gh.npcReview(lab, ctx, repo, pr.number);
    } else if (t.kind === 'npc.merge') {
      const pr = gh.findPr(lab, repo, Number(t.payload['number']));
      if (pr && pr.headSha === String(t.payload['head'])) gh.npcMergeApproved(lab, ctx, repo, pr.number);
    } else if (t.kind === 'npc.reply') {
      core().postChat(lab, ctx, String(t.payload['channel']), String(t.payload['author']), String(t.payload['text']));
    }
  }
}

/* Seed (Sim §2.12–§2.14): `./seed` (kept free of store imports — `initialState` imports it, see there). */
export { seedDevops } from './seed';

