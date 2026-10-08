/**
 * Activity lifecycle shared by every mode: begin (fresh session, runtime reset, sim preset/config/time
 * scale, gating, inventory), end (ActivityResult → debrief overlay, `session.ended`), pause, and the
 * session real-time clock. Feature modules (academy, arcade, drills, free play, certification) call
 * these helpers inside their own `transact()`.
 */
import type { TxContext } from '@/core/store';
import type {
  ActivityResult,
  GameMode,
  Overlay,
  Realism,
  RootState,
  ToolId,
} from '@/core/state';
import { createDefaultComputerGating, createDefaultItems, createDefaultSession, createDefaultToolModes, HOTBAR_SLOTS } from '@/core/state';
import type { SimConfig } from '@/sim/types';
import { HEALTH_CHECK_INTERVAL_MS } from '@/sim/types';
import { resetRuntime } from './rt';
import { clearScopes } from './conditions/evaluate';
import { simRun } from './simx';
import { removeBanner, setBanner } from './feedback';

export interface BeginOptions {
  mode: GameMode;
  activityId: string;
  seed: number;
  realism?: Realism;
  /** `sim.reset({ preset })`; null keeps the current lab (Free Play snapshots, layered activities). */
  preset: string | null;
  simConfig?: Partial<SimConfig>;
  timeScale?: number;
  startHour?: number;
  overlay?: Overlay;
  /** Academy replay (re-armed faults, 25 % XP). */
  replay?: boolean;
}

/** Tools unlocked by completed modules (GP §6.4) plus the always-carried hand and flashlight. */
export function unlockedTools(s: RootState): ToolId[] {
  const tools: ToolId[] = ['hand', 'flashlight'];
  for (const slot of HOTBAR_SLOTS) {
    if (s.progress.modules[slot.unlockedBy]?.status === 'complete') tools.push(slot.tool);
  }
  if (tools.includes('test-card-visa')) tools.push('test-card-interac');
  return tools;
}

/** Start a new activity: fresh session state and runtime, sim preset applied. */
export function beginActivity(d: RootState, ctx: TxContext, o: BeginOptions): void {
  const prev = d.session;
  const realism = o.realism ?? d.progress.realism;
  const session = createDefaultSession(realism);
  session.mode = o.mode;
  session.activityId = o.activityId;
  session.runId = prev.runId + 1;
  session.player = { ...prev.player };
  session.inventory = unlockedTools(d);
  session.toolModes = createDefaultToolModes();
  session.items = createDefaultItems();
  session.items.testCards = session.inventory.includes('test-card-visa') ? ['VISA', 'INTERAC'] : [];
  session.computer = createDefaultComputerGating();
  session.computer.tabCompletion = realism !== 'strict';
  session.computer.forceHealthCheckButton = realism !== 'strict' && (o.mode === 'academy' || o.mode === 'freeplay');
  d.session = session;

  const ui = d.ui;
  ui.overlay = o.overlay ?? { kind: 'none' };
  ui.teachCards = [];
  ui.banners = [];
  ui.selectedTicketId = null;
  ui.callouts = null;
  ui.highlight = null;
  ui.marker = null;
  ui.controlHint = null;

  resetRuntime(o.seed);
  clearScopes();

  if (o.preset) {
    const opts: { preset: string; seed: number; timeScale?: number; startHour?: number } = { preset: o.preset, seed: o.seed };
    if (o.timeScale !== undefined) opts.timeScale = o.timeScale;
    if (o.startHour !== undefined) opts.startHour = o.startHour;
    simRun('reset', (s) => s.reset(opts), undefined);
  }
  if (o.simConfig) {
    const patch = o.simConfig;
    simRun('setConfig', (s) => s.setConfig(patch), undefined);
  }
  if (o.timeScale !== undefined && d.lab.time.timeScale !== o.timeScale) {
    const ts = o.timeScale;
    simRun('setTimeScale', (s) => s.setTimeScale(ts), undefined);
  }
  if (realism === 'strict') setBanner(d, 'realism', 'info', 'Strict realism: no markers, history-only terminal, XP ×1.25', session.clockS + 6);

  ctx.emit('session.started', { mode: o.mode, activityId: o.activityId });
  ctx.emit('mission.started', { mode: o.mode, activityId: o.activityId, runId: session.runId, replay: !!o.replay });
}

/** A blank ActivityResult the feature fills in (XP granted afterwards is appended by `grantXp`). */
export function newResult(d: RootState, kind: ActivityResult['kind'], title: string): ActivityResult {
  return {
    kind,
    activityId: d.session.activityId ?? '',
    title,
    passed: false,
    points: 0,
    xp: 0,
    accuracy: 0,
    durationSeconds: Math.round(d.session.clockS),
    takeaways: [],
    newAchievements: [],
    xpBreakdown: [],
    rank: { before: d.progress.rank, after: d.progress.rank, pending: [] },
    teachCards: [],
  };
}

/** Finish the activity: store the result, show the debrief, emit `session.ended`. */
export function endActivity(d: RootState, ctx: TxContext, result: ActivityResult, overlay: Overlay = { kind: 'debrief' }): void {
  result.durationSeconds = Math.round(d.session.clockS);
  result.teachCards = d.ui.teachCards.map((c) => ({ ...c }));
  d.session.result = result;
  d.session.timerSeconds = null;
  d.session.dialogue = null;
  d.ui.overlay = overlay;
  d.ui.marker = null;
  d.ui.highlight = null;
  removeBanner(d, 'verifying');
  ctx.emit('session.ended', { mode: d.session.mode, activityId: d.session.activityId, passed: result.passed });
}

/** Called once the result is final (after XP and achievements): refresh the rank line of the debrief. */
export function finaliseResultRank(d: RootState): void {
  const r = d.session.result;
  if (!r) return;
  r.rank = { before: r.rank?.before ?? d.progress.rank, after: d.progress.rank, pending: d.progress.pendingRank?.missing ?? [] };
}

/** Back to the main menu (abandon / debrief "menu"). */
export function toMenu(d: RootState, ctx: TxContext): void {
  const was = d.session.mode;
  const id = d.session.activityId;
  const runId = d.session.runId;
  const realism = d.progress.realism;
  const s = createDefaultSession(realism);
  s.runId = runId + 1;
  s.player = { ...d.session.player };
  d.session = s;
  d.ui.overlay = { kind: 'main-menu', screen: 'home' };
  d.ui.teachCards = [];
  d.ui.banners = [];
  d.ui.marker = null;
  d.ui.highlight = null;
  d.ui.callouts = null;
  d.ui.selectedTicketId = null;
  resetRuntime(1);
  clearScopes();
  if (was !== 'menu' && !d.session.result) ctx.emit('session.ended', { mode: was, activityId: id, passed: false });
}

/** Real seconds until Orca's next health check at the current time scale. */
export function healthCheckInS(s: RootState): number {
  const t = s.lab.time;
  const next = s.lab.orca?.healthCheck?.nextRunMs;
  const anchor = t.healthAnchorMs ?? 0;
  const interval = HEALTH_CHECK_INTERVAL_MS ?? 300_000;
  const target = typeof next === 'number' && next > t.nowMs ? next : t.nowMs + (interval - ((((t.nowMs - anchor) % interval) + interval) % interval || interval));
  const scale = t.timeScale > 0 ? t.timeScale : 1;
  return Math.max(0, (target - t.nowMs) / scale / 1000);
}

/** Game-clock label of the next health check ("08:20"). */
export function nextHealthCheckAtMs(s: RootState): number {
  const t = s.lab.time;
  const scale = t.timeScale > 0 ? t.timeScale : 1;
  return t.nowMs + healthCheckInS(s) * 1000 * scale;
}

/** The activity belongs to this run (async callbacks compare run ids). */
export function sameRun(s: RootState, runId: number): boolean {
  return s.session.runId === runId;
}
