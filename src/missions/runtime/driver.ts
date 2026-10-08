/**
 * Runtime driver: bus subscription (event log + per-mode dispatch), the per-step tick (session real clock,
 * activity timers) and the per-frame hook (exam clock). When the game loop does not call `missions.tick`
 * / `missions.frame` yet, a fallback derives real time from the sim's physical clock and from
 * `requestAnimationFrame` so missions still run.
 */
import { bus } from '@/core/bus';
import { getState, store, transact } from '@/core/store';
import type { TxContext } from '@/core/store';
import type { RootState } from '@/core/state';
import { setChatReplyProvider, type ChatReplyOption } from '@/computer/apps';
import type { EventName } from '@/core/bus';
import { RT, appendLog, trackRuntimeScope, type LogEntry } from './rt';
import { captureEvidence, collapseTeachCards, expireUi } from './feedback';
import { onAcademyEvent, tickAcademy } from './academy/events';
import { checkReveals } from './arcade/spawn';
import { onTicketEvent, replyTicket, tickTickets } from './arcade/tickets';
import { onPipelineEvent } from './arcade/pipelines';
import { detectWrongActions } from './arcade/penalties';
import { sampleLab } from './arcade/gwState';
import { tickShift, trackMastery } from './arcade/director';
import { TR } from './arcade/ticketRuntime';
import { tickDrill } from './drills/host';
import { onFreeplayEvent, tickFreeplay } from './freeplay';
import { frameCert, tickCert } from './cert/cert';
import { checkAchievementsAtLoad, onAchievementEvent } from './progression/achievements';
import { checkPromotion } from './progression/xp';
import { robotById } from './lookups';
import { installSimEventShims } from './shims';

/** Events never dispatched (UI chatter, internal markers). */
const SKIP = new Set<string>(['computer.windowsChanged', 'missions.runtimeScope', 'computer.hintRequested', 'computer.hintCleared', 'computer.openAppRequested']);

let playAccS = 0;

export function initRuntime(): void {
  if (RT.initialized) return;
  RT.initialized = true;
  bus.onAny((type, payload) => onBusEvent(type, payload));
  setChatReplyProvider(chatReplies);
  installSimEventShims();
  installFallbackDrivers();
  transact((d, ctx) => {
    checkAchievementsAtLoad(d, ctx);
    checkPromotion(d, ctx);
  });
}

function onBusEvent(type: EventName, payload: unknown): void {
  if (trackRuntimeScope(type, payload)) return;
  if (SKIP.has(type)) return;
  const s = getState();
  const entry = appendLog(type, payload, s.lab.time.nowMs, s.session.clockS);
  try {
    transact((d, ctx) => dispatch(d, ctx, entry));
  } catch (err) {
    console.error(`[missions] handling "${type}" failed`, err);
  }
}

export function dispatch(d: RootState, ctx: TxContext, e: LogEntry): void {
  const mode = d.session.mode;
  if (e.type === 'app.action') {
    const p = e.payload as { action: string; data?: { ticketId?: string | null; replyId?: string; messageId?: string | null } };
    if (p.action === 'chat.reply.chosen' && p.data?.replyId) {
      const tid = p.data.ticketId ?? d.session.tickets.find((t) => TR.tickets.get(t.id)?.def.replies?.options.some((o) => o.id === p.data!.replyId) && t.status !== 'resolved')?.id;
      // LabChat already posted the chosen reply (`messageId`).
      if (tid) replyTicket(d, ctx, tid, p.data.replyId, !!p.data.messageId);
    }
  }
  if (mode === 'academy') onAcademyEvent(d, ctx, e);
  if (d.session.tickets.length) onTicketEvent(d, ctx, e);
  if (TR.pending.length) checkReveals(d, ctx, e);
  if (d.session.shift?.phase === 'running') {
    onPipelineEvent(d, ctx, e);
    if (e.type === 'mastery.changed') {
      const p = e.payload as { tag: string; before: number; after: number };
      trackMastery(p.tag, p.before, p.after);
    }
  }
  if (mode === 'freeplay') onFreeplayEvent(d, ctx, e);
  if (mode !== 'menu' && mode !== 'arcade-drill') detectWrongActions(d, ctx, e);
  autoEvidence(d, ctx, e);
  onAchievementEvent(d, ctx, e);
}

/** GP §2.6 auto-captured Notebook evidence. */
function autoEvidence(d: RootState, ctx: TxContext, e: LogEntry): void {
  if (d.session.mode === 'menu') return;
  switch (e.type) {
    case 'robot.noteAdded': {
      const p = e.payload as { robotId: number; text: string; kind?: string };
      const r = robotById(d.lab, p.robotId);
      if (p.kind === 'HEALTH' || !p.kind) captureEvidence(d, ctx, 'notes', `Notes: ${p.text}${r ? ` — ${r.humanReadableName}` : ''}`, r?.name ?? null);
      break;
    }
    case 'power.measured': {
      const p = e.payload as { pointId: string; display: string };
      captureEvidence(d, ctx, 'meter', `Meter ${p.pointId}: ${p.display}`);
      break;
    }
    case 'orca.checkoutRejected': {
      const p = e.payload as { jobId: string; reason: string; robotName?: string };
      captureEvidence(d, ctx, 'jenkins', `${p.jobId}: ${p.reason}`, p.robotName ?? null);
      break;
    }
    case 'player.calloutsShown': {
      const p = e.payload as { propId: string; lines: string[] };
      if (p.lines.length) captureEvidence(d, ctx, 'world', `${p.propId}: ${p.lines.join(' · ')}`);
      break;
    }
    default:
      break;
  }
}

/* ───────────────────────────── tick / frame ───────────────────────────── */

export function tickRuntime(dtRealS: number): void {
  if (!(dtRealS > 0)) return;
  transact((d, ctx) => {
    const s = d.session;
    if (s.mode === 'menu' || s.result) return;
    s.clockS += dtRealS;
    playAccS += dtRealS;
    if (playAccS >= 10) {
      d.progress.stats.playSeconds += Math.round(playAccS);
      playAccS = 0;
    }
    if (s.mode !== 'arcade-drill') sampleLab(d);
    switch (s.mode) {
      case 'academy':
        tickAcademy(d, ctx, dtRealS);
        break;
      case 'arcade-drill':
        tickDrill(d, ctx, dtRealS);
        break;
      case 'freeplay':
        tickFreeplay(d, ctx, dtRealS);
        tickTickets(d, ctx);
        if (TR.pending.length) checkReveals(d, ctx, null);
        break;
      case 'arcade-weakspot':
        if (s.drill?.phase === 'running') tickDrill(d, ctx, dtRealS);
        else tickShift(d, ctx, dtRealS);
        break;
      case 'certification':
        if (s.shift?.phase === 'running') tickShift(d, ctx, dtRealS);
        else {
          tickCert(d, ctx, dtRealS);
          tickTickets(d, ctx);
        }
        break;
      case 'arcade-shift':
        tickShift(d, ctx, dtRealS);
        break;
      default:
        break;
    }
    expireUi(d);
    collapseTeachCards(d);
  });
}

export function frameRuntime(dtRealS: number): void {
  const s = getState();
  const c = s.session.cert;
  const quizTimed = s.session.quiz && s.session.quiz.timeLeftS !== null && !s.session.quiz.finished && s.session.quiz.context !== 'cert';
  if (!(c?.part === 'written' && !c.written.submitted) && !quizTimed) return;
  transact((d, ctx) => {
    frameCert(d, ctx, dtRealS);
    const q = d.session.quiz;
    if (q && q.context !== 'cert' && q.timeLeftS !== null && !q.finished) q.timeLeftS = Math.max(0, q.timeLeftS - dtRealS);
  });
}

/* ───────────────────────────── fallback drivers ───────────────────────────── */

let pendingRealMs = 0;
let flushQueued = false;

function installFallbackDrivers(): void {
  store.subscribe((s, prev) => {
    if (RT.externalTick) return;
    const dPhys = s.lab.time.physMs - prev.lab.time.physMs;
    if (!(dPhys > 0) || dPhys > 5_000) return;
    pendingRealMs += dPhys;
    if (flushQueued) return;
    flushQueued = true;
    queueMicrotask(() => {
      flushQueued = false;
      const ms = pendingRealMs;
      pendingRealMs = 0;
      if (!RT.externalTick && ms > 0) tickRuntime(ms / 1000);
    });
  });
  const raf = (globalThis as { requestAnimationFrame?: (cb: (t: number) => void) => number }).requestAnimationFrame;
  if (typeof raf === 'function') {
    let last: number | null = null;
    const loop = (t: number) => {
      if (RT.externalFrame) return;
      const dt = last === null ? 0 : Math.min(0.25, (t - last) / 1000);
      last = t;
      if (dt > 0) frameRuntime(dt);
      raf(loop);
    };
    raf(loop);
  }
}

/* ───────────────────────────── LabChat quick replies ───────────────────────────── */

function chatReplies(ctx: { channel: string; lastMessage: { ticketId?: string } | null }): ChatReplyOption[] {
  const s = getState();
  const out: ChatReplyOption[] = [];
  const focus = ctx.lastMessage?.ticketId ?? null;
  for (const t of s.session.tickets) {
    if (t.status === 'resolved' || t.status === 'handover' || t.status === 'failed') continue;
    if (t.reply) continue; // already answered correctly
    if (focus && t.id !== focus) continue;
    const def = TR.tickets.get(t.id)?.def;
    for (const o of def?.replies?.options ?? []) out.push({ id: o.id, label: `${t.id}: ${o.text}`, text: o.text, ticketId: t.id });
  }
  return out;
}
