/**
 * Background pipelines PL1–PL8 (GP §2.3.5): every active pipeline attempts a checkout every 30 real s on
 * an Available, matching, idle rig (Unavailable only when named); a run lasts 60 real s. Green +20 when no
 * active fault affects the rig, red −20 otherwise (and the rig's pending incident reveals as a Jenkins Bot
 * ticket); blocked attempt −10. Uptime = attempts that got a rig ÷ attempts. When the sim's Jenkins can
 * run the job, the real build is triggered and its `jenkins.buildFinished` decides the result.
 */
import type { TxContext } from '@/core/store';
import type { HeatLevel, PipelineId, PipelineState, RootState } from '@/core/state';
import type { RobotStatus } from '@/sim/types';
import { robotById, robotByName, robotDeviceType } from '../lookups';
import { simRun } from '../simx';
import type { LogEntry } from '../rt';
import { HEAT_TABLE, PIPELINES, PIPELINE_BY_ID, ROSTER } from './config';
import { addScore, shiftOf, isOpen } from './shiftCore';
import { revealOnRig } from './spawn';
import { TR } from './ticketRuntime';
import { PIPELINE_BLOCKED, PIPELINE_GREEN, PIPELINE_RED } from './scoring';

export function createPipelines(): PipelineState[] {
  return PIPELINES.map((p) => ({
    id: p.id,
    job: p.job,
    active: false,
    activationOrder: p.activationOrder === 'always' ? 0 : p.activationOrder,
    phase: 'inactive',
    nextAttemptInS: p.activationOrder === 'always' ? 20 : 6 + (p.activationOrder as number) * 3,
    runEndsInS: null,
    buildId: null,
    robot: null,
    params: {},
    lastResult: null,
    lastRobot: null,
    lastConsoleLine: null,
    runIndex: 0,
    attempts: 0,
    gotRig: 0,
    green: 0,
    red: 0,
    blocked: 0,
    greenStreak: {},
  }));
}

/** Activate pipelines for a heat: the first N by activation order + PL8 always. */
export function setActivePipelines(pls: PipelineState[], heat: HeatLevel): void {
  const n = HEAT_TABLE[heat].activePipelines;
  for (const p of pls) {
    const def = PIPELINE_BY_ID[p.id];
    const active = def.activationOrder === 'always' || (def.activationOrder as number) <= n;
    if (active && !p.active) {
      p.active = true;
      if (p.phase === 'inactive') p.phase = 'waiting';
    } else if (!active && p.active && p.phase !== 'running') {
      p.active = false;
      p.phase = 'inactive';
    }
  }
}

function robotStatus(d: RootState, rig: string): RobotStatus {
  return robotByName(d.lab, rig)?.status ?? (ROSTER[rig]?.roles.includes('paycore') ? 'UNAVAILABLE' : 'AVAILABLE');
}

/** Rigs busy with another pipeline run or a non-pipeline checkout. */
function busy(d: RootState, rig: string, self: PipelineId): boolean {
  const sh = d.session.shift;
  if (sh?.pipelines.some((p) => p.id !== self && p.phase === 'running' && p.robot === rig)) return true;
  const r = robotByName(d.lab, rig);
  return !!r?.checkout && !sh?.pipelines.some((p) => p.buildId === r.checkout?.buildId);
}

/** An active fault (open ticket / pending spawn / injected fault) affects this rig. */
export function rigFaulted(d: RootState, rig: string): boolean {
  // A ticket waiting for verification has its fix in place (its immediate condition held).
  for (const t of d.session.tickets) if (isOpen(t) && t.status !== 'verifying' && (t.binding.rig === rig || t.binding.rigs.includes(rig))) return true;
  for (const p of TR.pending) if (p.binding.rig === rig || p.binding.rigs.includes(rig)) return true;
  for (const inj of d.session.freeplay?.injected ?? []) if (inj.fixedAtMs === null && (inj.binding.rig === rig || inj.binding.rigs.includes(rig))) return true;
  const st = robotStatus(d, rig);
  return st === 'CONNECTION_FAILED' || st === 'OFFLINE';
}

function rosieBroken(d: RootState): boolean {
  return rigFaulted(d, 'rosie');
}

function emitAttempt(ctx: TxContext, p: PipelineState, robot: string | null, blocked: boolean, line: string): void {
  p.lastConsoleLine = line;
  ctx.emit('pipeline.attempted', { pipelineId: p.id, robot, blocked, consoleLine: line });
}

/** Where pipelines live: the running shift, or Free Play's background set. */
export interface PipelineHost {
  pipelines: PipelineState[];
  uptime: { attempts: number; gotRig: number };
  heat: HeatLevel;
  scoring: boolean;
  pipelinePoints: number;
  greenWallS: number;
}

function attempt(d: RootState, ctx: TxContext, sh: PipelineHost, p: PipelineState): void {
  const def = PIPELINE_BY_ID[p.id];
  const named = def.id === 'PL8';
  const countsUptime = !def.uptimeOnlyWhenBroken || rosieBroken(d);
  p.attempts++;
  if (countsUptime) sh.uptime.attempts++;
  const params = { ...def.params(p.runIndex) };
  const candidates = def.eligibleRigs.filter((r) => {
    const st = robotStatus(d, r);
    return (st === 'AVAILABLE' || (named && st === 'UNAVAILABLE')) && !busy(d, r, p.id);
  });
  const reasons = def.eligibleRigs.map((r) => `[orca] candidate ${r}: ${statusLabel(robotStatus(d, r))}${busy(d, r, p.id) ? ' (in use)' : ''} — skipped`);
  if (!candidates.length) {
    p.blocked++;
    p.phase = 'blocked';
    p.lastResult = 'BLOCKED';
    const type = params.DEVICE_TYPE ?? '';
    emitAttempt(ctx, p, null, true, reasons.length ? `${reasons.join('\n')}\n[orca] no Available ${type ? `${type} ` : ''}robot — build waiting in queue` : `[orca] no Available robot — build waiting in queue`);
    if (sh.scoring) addScore(d, ctx, PIPELINE_BLOCKED, `${p.id} blocked`, null);
    return;
  }
  // A rig whose ticket waits for "the next build" goes first (so the fix verifies within the shift);
  // otherwise an LRU-ish deterministic choice: rotate by run index.
  const awaiting = candidates.find((r) => d.session.tickets.some((t) => t.status === 'verifying' && t.verifying?.waitingFor === 'build' && (t.binding.rig === r || t.binding.rigs.includes(r))));
  const robot = awaiting ?? candidates[p.runIndex % candidates.length]!;
  p.gotRig++;
  if (countsUptime) sh.uptime.gotRig++;
  p.phase = 'running';
  p.robot = robot;
  p.params = params;
  p.runEndsInS = def.runS;
  p.runIndex++;
  const type = params.DEVICE_TYPE ? ` (${params.DEVICE_TYPE})` : '';
  emitAttempt(ctx, p, robot, false, named ? `Checked out robot ${robot} (named)` : `[orca] checkout → ${robot}${type} OK`);
  const job = def.job;
  const buildParams: Record<string, string> = { ...params };
  // A verification run: name the rig so Orca checks out exactly the one whose fix is waiting.
  if (awaiting && !named) {
    const type = robotDeviceType(d.lab, awaiting);
    if (type) buildParams.DEVICE_TYPE = type;
    buildParams.ROBOT_NAME = awaiting;
  }
  const r = simRun('jenkins.build', (s) => s.jenkins.build(job, buildParams, 'jenkins'), { ok: false as const, error: 'unavailable' });
  p.buildId = r.ok ? r.value.buildId : null;
}

function finish(d: RootState, ctx: TxContext, sh: PipelineHost, p: PipelineState, simResult: 'SUCCESS' | 'FAILURE' | null): void {
  const robot = p.robot;
  const result: 'SUCCESS' | 'FAILURE' = simResult ?? (robot && rigFaulted(d, robot) ? 'FAILURE' : 'SUCCESS');
  const points = sh.scoring ? (result === 'SUCCESS' ? PIPELINE_GREEN : PIPELINE_RED) : 0;
  p.lastResult = result;
  p.lastRobot = robot;
  p.phase = 'waiting';
  p.runEndsInS = null;
  if (robot) p.greenStreak[robot] = result === 'SUCCESS' ? (p.greenStreak[robot] ?? 0) + 1 : 0;
  if (result === 'SUCCESS') p.green++;
  else p.red++;
  p.lastConsoleLine = `${robot ? `[orca] released ${robot} → ${statusLabel(robotStatus(d, robot))}\n` : ''}Finished: ${result}`;
  sh.pipelinePoints += points;
  d.progress.stats.pipelinesRun++;
  if (points) addScore(d, ctx, points, `${p.id} ${result === 'SUCCESS' ? 'green' : 'red'}`, null);
  ctx.emit('pipeline.finished', { pipelineId: p.id, robot, result, points, buildId: p.buildId });
  // A red run reveals the rig's pending incident as a Jenkins Bot ticket (GP §2.3.5).
  if (result === 'FAILURE' && robot) revealOnRig(d, ctx, robot);
  p.buildId = null;
  p.robot = null;
}

function statusLabel(s: RobotStatus): string {
  return { AVAILABLE: 'Available', UNAVAILABLE: 'Unavailable', OFFLINE: 'Offline', CONNECTION_FAILED: 'Connection Failed', RESERVED: 'Reserved' }[s] ?? s;
}

/** Shift host view (scoring follows the shift rules). */
export function shiftHost(d: RootState): PipelineHost | null {
  const sh = shiftOf(d);
  if (!sh || !sh.rules.pipelines) return null;
  return {
    get pipelines() {
      return sh.pipelines;
    },
    get uptime() {
      return sh.uptime;
    },
    get heat() {
      return sh.heat;
    },
    scoring: sh.rules.scoring,
    get pipelinePoints() {
      return sh.pipelinePoints;
    },
    set pipelinePoints(v: number) {
      sh.pipelinePoints = v;
    },
    get greenWallS() {
      return sh.greenWallS;
    },
    set greenWallS(v: number) {
      sh.greenWallS = v;
    },
  };
}

export function tickPipelines(d: RootState, ctx: TxContext, dtS: number, host: PipelineHost | null = shiftHost(d)): void {
  const sh = host;
  if (!sh) return;
  setActivePipelines(sh.pipelines, sh.heat);
  for (const p of sh.pipelines) {
    if (!p.active) continue;
    if (p.phase === 'running') {
      p.runEndsInS = (p.runEndsInS ?? 0) - dtS;
      // A real sim build decides; fall back to the model 15 s after the nominal end.
      if (p.runEndsInS <= (p.buildId ? -15 : 0)) finish(d, ctx, sh, p, null);
      continue;
    }
    p.nextAttemptInS -= dtS;
    if (p.nextAttemptInS <= 0) {
      p.nextAttemptInS += PIPELINE_BY_ID[p.id].intervalS;
      attempt(d, ctx, sh, p);
    }
  }
  // ACH20 green wall: every active pipeline unblocked and green (or running clean) at H3+.
  const active = sh.pipelines.filter((p) => p.active && p.id !== 'PL8');
  const allGreen = sh.heat >= 3 && active.length > 0 && active.every((p) => p.phase !== 'blocked' && p.lastResult !== 'FAILURE' && p.lastResult !== 'BLOCKED');
  sh.greenWallS = allGreen ? sh.greenWallS + dtS : 0;
}

/** Sim build finished: settle the pipeline that triggered it. */
export function onPipelineEvent(d: RootState, ctx: TxContext, e: LogEntry, host: PipelineHost | null = shiftHost(d)): void {
  const sh = host;
  if (!sh) return;
  if (e.type === 'robot.checkedOut') {
    // Orca (not the pipeline model) picks the robot of an unnamed build: follow the real checkout.
    const pl = e.payload as { buildId?: string; name?: string };
    const p = sh.pipelines.find((x) => x.buildId && x.buildId === pl.buildId && x.phase === 'running');
    if (p && pl.name && p.robot !== pl.name) p.robot = pl.name;
    return;
  }
  if (e.type !== 'jenkins.buildFinished') return;
  const pl = e.payload as { buildId: string; result: string; robotId?: number | null };
  const p = sh.pipelines.find((x) => x.buildId === pl.buildId && x.phase === 'running');
  if (!p) return;
  const actual = pl.robotId != null ? robotById(d.lab, pl.robotId)?.name : null;
  if (actual) p.robot = actual;
  finish(d, ctx, sh, p, pl.result === 'SUCCESS' ? 'SUCCESS' : 'FAILURE');
}

/** An active pipeline (shift or Free Play host) can check out this rig. */
export function pipelineCovers(d: RootState, rig: string): boolean {
  const host = shiftHost(d);
  const pls = host?.pipelines ?? (d.session.freeplay?.pipelines ? PIPELINES.map((p) => ({ id: p.id, active: true })) : []);
  return pls.some((p) => p.active && PIPELINE_BY_ID[p.id].eligibleRigs.includes(rig));
}

export function uptimeOf(d: RootState): number {
  const sh = d.session.shift;
  if (!sh || !sh.uptime.attempts) return 1;
  return sh.uptime.gotRig / sh.uptime.attempts;
}

