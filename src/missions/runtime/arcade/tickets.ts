/**
 * Ticket lifecycle (GP §2.3.4–§2.3.8): ack, open, Diagnosis Call, escalation to Jared, resolve with
 * deferred verification, LabChat replies, judgement tasks, hint tiers, SLA, scoring on resolve.
 * `NEW → ACKED → IN_PROGRESS → (ESCALATED →) VERIFYING → RESOLVED | HANDOVER | FAILED`.
 */
import type { TxContext } from '@/core/store';
import { nextInt } from '@/core/rng';
import type { RootState, TicketState } from '@/core/state';
import { requestHint as requestAppHint } from '@/computer/apps';
import type { DeferredTrigger } from '../../types';
import type { DiagnosisCallResult, EscalationResult, HintResult, ReplyResult, ResolveResult } from '../../api';
import type { BusRecord } from '@/core/bus';
import { RT, entriesSince, type LogEntry } from '../rt';
import { countEvent, feedTrigger, sampleScope, scopeStatus, disposeScope } from '../conditions/evaluate';
import { bark, barkById, postChat, pushTeachCard, removeBanner, setBanner, toast } from '../feedback';
import { runActions } from '../scripts';
import { simRun } from '../simx';
import { addEvidenceAll } from '../progression/mastery';
import { demoteFacts } from '../progression/leitner';
import { hhmm, robotByName, robotDeviceType } from '../lookups';
import { nextHealthCheckAtMs } from '../session';
import { tpl } from './binding';
import { applicableBonuses } from './pb';
import { raiseGw } from './penalties';
import { noteChatAsk } from './gwHelpers';
import { addBonus, addScore, bumpCombo, resetCombo, shiftOf } from './shiftCore';
import {
  ACK_BONUS,
  ACK_WINDOW_S,
  BREACH_PENALTY,
  ESCALATION_BOUNCE_PENALTY,
  ESCALATION_BOUNCE_S,
  callPoints,
  comboEligible,
  hintFactor,
  ticketCore,
  timeFactor,
  comboMultiplier,
} from './scoring';
import { TR, type TicketRt } from './ticketRuntime';
import { PIPELINES } from './config';
import { PIPELINE_JOBS } from './pipelineJobs';
import { pipelineCovers } from './pipelines';
import { hasVerify } from '../conditions/evaluate';
import { personText } from '@/content';

/** Free Play / director callbacks on resolution (XP for verified injector fixes, spawn holds). */
export const ticketHooks = {
  resolved: [] as ((d: RootState, ctx: TxContext, t: TicketState) => void)[],
};

function find(d: RootState, id: string): { t: TicketState; rt: TicketRt } | null {
  const t = d.session.tickets.find((x) => x.id === id);
  const rt = TR.tickets.get(id);
  return t && rt ? { t, rt } : null;
}

const closed = (t: TicketState) => t.status === 'resolved' || t.status === 'handover' || t.status === 'failed';

/* ───────────────────────────── ack / open ───────────────────────────── */

export function ackTicket(d: RootState, ctx: TxContext, id: string): void {
  const f = find(d, id);
  if (!f || f.t.status !== 'new') return;
  const t = f.t;
  t.status = 'acked';
  t.ackedAtS = d.session.clockS;
  t.pinned = true;
  const fast = t.ackedAtS - t.arrivedAtS <= ACK_WINDOW_S;
  if (fast && shiftOf(d)?.rules.scoring) addBonus(d, ctx, 'ACK', ACK_BONUS, id, 'Ack within 10 s');
  if (t.binding.rig && d.session.realism !== 'strict') d.ui.marker = { kind: 'rig', id: t.binding.rig };
  ctx.emit('ticket.acked', { ticketId: id, fast });
}

/** Open the ticket board on a ticket (explicit player action: J / a HUD ticket card / `missions.openTicket`). */
export function openTicketPanel(d: RootState, ctx: TxContext, id: string): void {
  const f = find(d, id);
  if (!f || closed(f.t)) return;
  startTicket(d, ctx, id);
  d.ui.overlay = { kind: 'tickets', ticketId: id, panel: 'detail' };
}

/**
 * Ack + IN_PROGRESS + HUD objective without touching the overlay — working a ticket from elsewhere (a
 * LabChat reply at the workstation, a call or resolve) must not pull the player out of what they are in.
 */
export function startTicket(d: RootState, ctx: TxContext, id: string): void {
  const f = find(d, id);
  if (!f || closed(f.t)) return;
  if (f.t.status === 'new') ackTicket(d, ctx, id);
  if (f.t.status === 'acked') {
    f.t.status = 'in-progress';
    f.t.startedAtS = d.session.clockS;
  }
  d.ui.selectedTicketId = id;
  const sh = shiftOf(d);
  if (sh?.rules.hudObjectives !== false) {
    d.session.objectives = [{ id, text: `${id}: ${f.t.title}`, done: false, ...(f.t.binding.rig ? { marker: { kind: 'rig' as const, id: f.t.binding.rig } } : {}) }];
  } else d.session.objectives = [{ id, text: '', done: false, hidden: true }];
  ctx.emit('ticket.focused', { ticketId: id });
}

/* ───────────────────────────── Diagnosis Call ───────────────────────────── */

export function callRootCause(d: RootState, ctx: TxContext, id: string, optionId: string): DiagnosisCallResult {
  const none: DiagnosisCallResult = { correct: false, fast: false, points: 0, wrongCallHint: null, teachCardId: null };
  const f = find(d, id);
  if (!f || closed(f.t) || !f.t.canCall || f.t.call) return none;
  const { t, rt } = f;
  const dc = rt.def.diagnosisCall;
  if (dc === 'none') return none;
  const opt = dc.options.find((o) => o.id === optionId);
  if (!opt) return none;
  if (t.status === 'new' || t.status === 'acked') startTicket(d, ctx, id);
  const now = d.session.clockS;
  const correct = !!opt.correct;
  const fast = correct && now - (t.ackedAtS ?? t.arrivedAtS) <= 0.4 * t.parS;
  t.call = { optionId, correct, atS: now - t.arrivedAtS, fast };
  const sh = shiftOf(d);
  const points = sh?.rules.scoring ? callPoints(t.basePoints, correct) : 0;
  if (sh) {
    sh.stats.calls++;
    if (!correct) sh.stats.wrongCalls++;
    if (fast) sh.stats.fastDiagnoses++;
  }
  d.progress.stats.diagnosisCalls++;
  if (fast) d.progress.stats.fastDiagnoses++;
  addScore(d, ctx, points, correct ? (fast ? 'Fast Diagnosis' : 'Diagnosis Call') : 'Wrong call', id);
  let teachCardId: string | null = null;
  let hint: string | null = null;
  if (correct) {
    if (fast) barkById(d, ctx, 'BARK_MORGAN_04', 'ticket');
  } else {
    resetCombo(d, ctx);
    hint = tpl(opt.wrongCallHint, rt.binding) || tpl(rt.def.hints[0], rt.binding);
    if (rt.def.factIds?.length) demoteFacts(d, rt.def.factIds);
    const st = d.progress.incidents[rt.def.id];
    if (st) st.wrongCalls++;
    const card = pushTeachCard(
      d,
      ctx,
      { whatHappened: `Not that: "${tpl(opt.text, rt.binding)}".`, why: hint, doInstead: tpl(rt.def.hints[0], rt.binding) || 'Follow the evidence: Notes, LEDs, tablet, terminal.', factIds: rt.def.factIds ? [...rt.def.factIds] : [], tag: rt.def.tags[0] },
      { kind: 'call', ref: `${rt.def.id}:${optionId}` },
      id,
    );
    teachCardId = card.id;
  }
  ctx.emit('ticket.callMade', { ticketId: id, optionId, correct, fast, points });
  return { correct, fast, points, wrongCallHint: hint, teachCardId };
}

/* ───────────────────────────── escalation (GP §2.3.7) ───────────────────────────── */

function normUrl(u: string): string {
  return u.trim().replace(/\/+$/, '').toLowerCase();
}

export function escalate(d: RootState, ctx: TxContext, id: string, cause: string, endpoint: string): EscalationResult {
  const f = find(d, id);
  if (!f || closed(f.t) || f.t.status === 'escalated' || f.t.status === 'verifying') return { outcome: 'not-escalatable', points: 0, message: 'Nothing to escalate.' };
  const { t, rt } = f;
  if (t.status === 'new' || t.status === 'acked') startTicket(d, ctx, id);
  const now = d.session.clockS;
  const sh = shiftOf(d);
  if (!rt.def.escalatable) {
    raiseGw(d, ctx, 'GW12', { ticketId: id, detail: `Escalated ${rt.def.id}` });
    t.status = 'escalated';
    t.escalation = { cause, endpoint, sentAtS: now, outcome: 'bounced', returnsAtS: now + ESCALATION_BOUNCE_S, jaredDoneAtS: null, message: "That's config, not hardware. Read the Notes and the Edit view." };
    t.escalationsBounced++;
    ctx.emit('ticket.escalated', { ticketId: id, cause, endpoint, outcome: 'bounced', points: -100 });
    return { outcome: 'not-escalatable', points: sh?.rules.scoring ? -100 : 0, message: t.escalation.message! };
  }
  if (sh?.jaredAwayUntilS !== null && sh?.jaredAwayUntilS !== undefined && now < sh.jaredAwayUntilS) {
    t.status = 'escalated';
    t.escalation = { cause, endpoint, sentAtS: now, outcome: 'queued', returnsAtS: null, jaredDoneAtS: null, message: personText('{{jared}} is out to lunch — your escalation is queued.') };
    if (!sh.queuedEscalations.includes(id)) sh.queuedEscalations.push(id);
    ctx.emit('ticket.escalated', { ticketId: id, cause, endpoint, outcome: 'queued', points: 0 });
    return { outcome: 'queued', points: 0, message: personText('{{jared}} is out to lunch — your escalation is queued until lunch is over.') };
  }
  return judgeEscalation(d, ctx, t, rt, cause, endpoint, now);
}

function judgeEscalation(d: RootState, ctx: TxContext, t: TicketState, rt: TicketRt, cause: string, endpoint: string, sentAtS: number): EscalationResult {
  const sh = shiftOf(d);
  const now = d.session.clockS;
  const call = rt.def.diagnosisCall === 'none' ? null : rt.def.diagnosisCall.options.find((o) => o.id === cause);
  const causeOk = !!call?.correct;
  const endpoints = (rt.def.escalation?.endpoints(rt.binding) ?? []).map(normUrl);
  const endpointOk = !endpoints.length || endpoints.includes(normUrl(endpoint));
  t.status = 'escalated';
  // The escalation's cause choice *is* the Diagnosis Call.
  if (!t.call) {
    const fast = causeOk && sentAtS - (t.ackedAtS ?? t.arrivedAtS) <= 0.4 * t.parS;
    t.call = { optionId: cause, correct: causeOk, atS: sentAtS - t.arrivedAtS, fast };
    if (causeOk && sh?.rules.scoring) addScore(d, ctx, callPoints(t.basePoints, true), fast ? 'Fast Diagnosis' : 'Diagnosis Call', t.id);
    if (sh) {
      sh.stats.calls++;
      if (fast) sh.stats.fastDiagnoses++;
      if (!causeOk) sh.stats.wrongCalls++;
    }
  }
  if (causeOk && endpointOk) {
    const doneIn = 60 + nextInt(RT.rng, 0, 30);
    t.escalation = { cause, endpoint, sentAtS, outcome: 'accepted', returnsAtS: null, jaredDoneAtS: now + doneIn, message: 'On it. Probably the Pi, or a Minix box running Callus. Same symptom.' };
    if (sh) sh.stats.escalationsCorrect++;
    d.progress.stats.escalationsCorrect++;
    const st = d.progress.incidents[rt.def.id];
    if (st) st.escalations++;
    barkById(d, ctx, 'BARK_JARED_04', 'ticket');
    ctx.emit('npc.jaredFix', { ticketId: t.id, phase: 'started' });
    ctx.emit('mission.npcAction', { npc: 'jared', action: 'walk-to', target: t.binding.rig ? `rig.${t.binding.rig}` : null });
    ctx.emit('ticket.escalated', { ticketId: t.id, cause, endpoint, outcome: 'accepted', points: 0 });
    return { outcome: 'accepted', points: 0, message: personText('{{jared}} accepted the escalation and is walking over.') };
  }
  const hint = !causeOk ? tpl(call?.wrongCallHint, rt.binding) || 'Read the Notes line again: which component answered?' : tpl(rt.def.escalation?.endpointHint, rt.binding) || 'Pick the exact endpoint from the rig\'s latest Notes line.';
  t.escalation = { cause, endpoint, sentAtS, outcome: 'pending', returnsAtS: now + ESCALATION_BOUNCE_S, jaredDoneAtS: null, message: hint };
  ctx.emit('ticket.escalated', { ticketId: t.id, cause, endpoint, outcome: 'pending', points: 0 });
  return { outcome: 'pending', points: 0, message: personText('{{jared}} will check the escalation.') };
}

function bounce(d: RootState, ctx: TxContext, t: TicketState, rt: TicketRt): void {
  const esc = t.escalation;
  if (!esc) return;
  const sh = shiftOf(d);
  const wasGw12 = esc.outcome === 'bounced';
  esc.outcome = 'bounced';
  esc.returnsAtS = null;
  t.status = 'in-progress';
  if (wasGw12) return; // GW12 already charged at send time.
  t.escalationsBounced++;
  if (sh) {
    sh.stats.escalationsBounced++;
    addScore(d, ctx, -ESCALATION_BOUNCE_PENALTY, 'Escalation bounced', t.id);
    resetCombo(d, ctx);
  }
  d.progress.stats.escalationsBounced++;
  if (rt.def.factIds?.length) demoteFacts(d, rt.def.factIds);
  bark(d, ctx, 'jared', esc.message ?? 'Check the Notes again.', 'ticket');
  pushTeachCard(
    d,
    ctx,
    { whatHappened: '{{jared}} bounced the escalation.', why: esc.message ?? '', doInstead: 'Re-read the Notes line and pick the matching cause and exact endpoint.', tag: rt.def.tags[0], factIds: rt.def.factIds ? [...rt.def.factIds] : [] },
    { kind: 'escalation', ref: rt.def.id },
    t.id,
  );
  ctx.emit('ticket.escalated', { ticketId: t.id, cause: esc.cause, endpoint: esc.endpoint, outcome: 'bounced', points: sh?.rules.scoring ? -ESCALATION_BOUNCE_PENALTY : 0 });
}

/** Jared is back from lunch: judge the queued escalations. */
export function releaseQueuedEscalations(d: RootState, ctx: TxContext): void {
  const sh = shiftOf(d);
  if (!sh) return;
  const ids = [...sh.queuedEscalations];
  sh.queuedEscalations = [];
  for (const id of ids) {
    const f = find(d, id);
    if (!f || !f.t.escalation || f.t.escalation.outcome !== 'queued') continue;
    judgeEscalation(d, ctx, f.t, f.rt, f.t.escalation.cause, f.t.escalation.endpoint, f.t.escalation.sentAtS);
  }
}

/* ───────────────────────────── resolve ───────────────────────────── */

function verifyLabel(d: RootState, rt: TicketRt): { label: string; waitingFor: NonNullable<TicketState['verifying']>['waitingFor'] } {
  const node = rt.scope.verifyNodes[0];
  const kind = node?.on.kind ?? 'health-check';
  const custom = rt.def.verifyLabel ? tpl(rt.def.verifyLabel, rt.binding) : null;
  if (custom) return { label: custom, waitingFor: kind };
  if (kind === 'health-check') return { label: `Verifying… waiting for ${hhmm(nextHealthCheckAtMs(d))} health check`, waitingFor: kind };
  if (kind === 'build') return { label: 'Verifying… waiting for the next build', waitingFor: kind };
  if (kind === 'local-run') return { label: 'Verifying… waiting for the next local run', waitingFor: kind };
  return { label: 'Verifying…', waitingFor: kind };
}

export function resolveTicket(d: RootState, ctx: TxContext, id: string): ResolveResult {
  const f = find(d, id);
  if (!f || closed(f.t)) return { outcome: 'rejected', points: 0, message: 'Ticket is closed.', teachCardId: null };
  const { t, rt } = f;
  if (t.status === 'verifying') return { outcome: 'verifying', points: 0, message: t.verifying?.label ?? 'Verifying…', teachCardId: null };
  if (t.status === 'new' || t.status === 'acked') startTicket(d, ctx, id);
  t.resolveAttempts++;
  sampleScope(rt.scope, d);
  const st = scopeStatus(rt.scope, d);
  if (st.full) return finishTicket(d, ctx, t, rt, 'resolve');
  if (st.immediate && st.hasVerify) {
    const v = verifyLabel(d, rt);
    t.status = 'verifying';
    t.verifying = { label: v.label, waitingFor: v.waitingFor, sinceS: d.session.clockS };
    t.fixedAtMs = rt.scope.fixedAtMs;
    setBanner(d, `verify-${id}`, 'info', `${id}: ${v.label}`);
    ctx.emit('ticket.verifying', { ticketId: id, label: v.label });
    return { outcome: 'verifying', points: 0, message: v.label, teachCardId: null };
  }
  const ev = raiseGw(d, ctx, 'GW16', { ticketId: id, detail: `Resolve pressed on ${id}` });
  ctx.emit('ticket.resolveRejected', { ticketId: id, reason: 'success condition false' });
  return { outcome: 'rejected', points: ev?.points ?? 0, message: 'Not fixed yet — the success condition is false (GW16).', teachCardId: ev?.teachCardId ?? null };
}

function incidentQ(t: TicketState, resolved: boolean, rS: number): number {
  if (!resolved) return 0;
  if (t.hintTier >= 3 || t.escalationsBounced > 0) return 0.25;
  if (t.hintTier === 2 || (t.call && !t.call.correct)) return 0.5;
  if (t.hintTier === 1 || rS > t.parS) return 0.75;
  if (t.penaltyIds.length) return 0.75;
  return 1;
}

const RESOLVE_BARKS: Readonly<Record<string, string>> = {
  INC27: 'BARK_RILEY_02',
  INC36: 'BARK_MORGAN_03',
  INC37: 'BARK_MORGAN_03',
  INC41: 'BARK_SAM_01',
  INC49: 'BARK_DAVID_02',
  INC51: 'BARK_DAVID_03',
};

/** Resolve now: score (GP §2.3.8), process bonuses, stats, mastery evidence, close. */
export function finishTicket(d: RootState, ctx: TxContext, t: TicketState, rt: TicketRt, how: 'resolve' | 'verified' | 'escalation'): ResolveResult {
  const sh = shiftOf(d);
  const now = d.session.clockS;
  const escalated = t.escalation?.outcome === 'accepted';
  const endS = escalated ? t.escalation!.sentAtS : t.verifying ? t.verifying.sinceS : now;
  const rS = Math.max(0, endS - t.arrivedAtS);
  const noCall = rt.def.diagnosisCall === 'none';
  const fastDiagnosis = !!t.call?.fast || (noCall && rS <= 0.5 * t.parS);
  const penaltiesOnTicket = sh ? sh.penalties.filter((p) => p.ticketId === t.id) : [];
  let comboAfter = sh?.combo ?? 0;
  if (sh && !t.breached && comboEligible({ fastDiagnosis, ticketPenalties: penaltiesOnTicket.length, rS, parS: t.parS, hintTier: t.hintTier })) comboAfter = bumpCombo(d, ctx);
  const core = sh?.rules.scoring ? ticketCore({ base: t.basePoints, rS, parS: t.parS, slaS: t.slaS, hintTier: t.hintTier, comboAfter, wildcard: sh.wildcard }) : 0;
  addScore(d, ctx, core, `Resolved ${t.id}`, t.id);

  // Process bonuses.
  let processBonus = 0;
  if (sh?.rules.scoring) {
    const events: BusRecord[] = entriesSince(rt.spawnSeq)
      .filter((e) => !e.suppressed)
      .map((e) => ({ type: e.type, payload: e.payload, at: e.atMs }));
    for (const pb of applicableBonuses(rt.def)) {
      try {
        if (pb.check({ state: d, ticket: t, binding: rt.binding, events, escalated, rank: d.progress.rank })) {
          addBonus(d, ctx, pb.id, pb.points, t.id, pb.behaviour);
          processBonus += pb.points;
          if (pb.id === 'PB07' && rt.def.tags.some((x) => x.startsWith('power.'))) barkById(d, ctx, 'BARK_JARED_03', 'ticket');
        }
      } catch (err) {
        console.warn(`[missions] ${pb.id} check threw`, err);
      }
    }
  }
  const diagnosisBonus = sh?.rules.scoring && t.call ? callPoints(t.basePoints, t.call.correct) : 0;
  const ackBonus = sh?.rules.scoring && t.ackedAtS !== null && t.ackedAtS - t.arrivedAtS <= ACK_WINDOW_S ? ACK_BONUS : 0;
  const penalties = penaltiesOnTicket.reduce((a, p) => a + Math.abs(p.points), 0) + (t.breached && sh?.rules.scoring ? BREACH_PENALTY : 0);
  const total = core + processBonus + diagnosisBonus + ackBonus - penalties;
  t.score = {
    base: t.basePoints,
    rS: Math.round(rS * 10) / 10,
    timeFactor: timeFactor(rS, t.parS, t.slaS),
    hintFactor: hintFactor(t.hintTier),
    comboFactor: comboMultiplier(comboAfter),
    diagnosisBonus,
    ackBonus,
    processBonus,
    penalties,
    total,
    fastDiagnosis,
    comboAfter,
    breached: t.breached,
  };
  t.points = total;
  t.status = 'resolved';
  t.resolvedAtS = now;
  t.verifying = null;
  removeBanner(d, `verify-${t.id}`);
  if (d.ui.selectedTicketId === t.id) d.ui.selectedTicketId = null;
  if (d.ui.marker?.kind === 'rig' && d.ui.marker.id === t.binding.rig) d.ui.marker = null;
  d.session.objectives = d.session.objectives.filter((o) => o.id !== t.id);

  if (sh) {
    sh.stats.resolved++;
    // Tickets without a Diagnosis Call count as Fast Diagnosis when resolved within 0.5 × par (GP §2.3.6);
    // calls made count when they are made (callRootCause / escalation).
    if (noCall && fastDiagnosis) sh.stats.fastDiagnoses++;
    if (sh.spawnHoldUntilS !== null || sh.nextSpawnAtS === null) sh.spawnHoldUntilS = now + 10;
  }
  d.session.score.incidentsResolved++;
  d.progress.stats.incidentsResolved++;
  const st = d.progress.incidents[rt.def.id];
  if (st) {
    st.solves++;
    const ms = Math.round(rS * 1000);
    st.bestMs = st.bestMs ? Math.min(st.bestMs, ms) : ms;
    st.bestScore = Math.max(st.bestScore, total);
    if (fastDiagnosis) st.fastDiagnoses++;
  }
  addEvidenceAll(d, ctx, rt.def.tags, incidentQ(t, true, rS), 'incident', `incident:${rt.def.id}`);
  disposeScope(rt.scope.id);
  ctx.emit('ticket.resolved', { ticketId: t.id, incidentId: rt.def.id, points: total, rS, fastDiagnosis, comboAfter, escalated });
  ctx.emit('ticket.closed', { ticketId: t.id, status: 'resolved' });
  const barkId = RESOLVE_BARKS[rt.def.id];
  if (barkId) barkById(d, ctx, barkId, 'flavour');
  if (sh?.rules.scoring) toast(d, 'success', `+${total}${comboAfter > 0 ? `  ×${comboMultiplier(comboAfter).toFixed(2)} COMBO ${comboAfter}` : ''}`, `${t.id} resolved`);
  else toast(d, 'success', `${t.id} resolved`, rt.def.name);
  for (const h of ticketHooks.resolved) h(d, ctx, t);
  return { outcome: 'resolved', points: total, message: how === 'verified' ? 'Verified and resolved.' : 'Resolved.', teachCardId: null };
}

/** Close an unresolved ticket (shift end handover, cert fail, Free Play clear). */
export function closeUnresolved(d: RootState, ctx: TxContext, t: TicketState, status: 'handover' | 'failed'): void {
  const rt = TR.tickets.get(t.id);
  t.status = status;
  t.verifying = null;
  removeBanner(d, `verify-${t.id}`);
  if (rt) {
    addEvidenceAll(d, ctx, rt.def.tags, 0, 'incident', `incident:${rt.def.id}`);
    disposeScope(rt.scope.id);
  }
  if (status === 'handover') ctx.emit('ticket.handover', { ticketId: t.id });
  ctx.emit('ticket.closed', { ticketId: t.id, status });
}

/* ───────────────────────────── replies, bug, task ───────────────────────────── */

/** `posted`: the reply already sits in LabChat (chosen there as a quick reply) — do not post it twice. */
export function replyTicket(d: RootState, ctx: TxContext, id: string, replyId: string, posted = false): ReplyResult {
  const f = find(d, id);
  const fail: ReplyResult = { correct: false, final: true, points: 0, teachCardId: null };
  if (!f || closed(f.t) || !f.rt.def.replies) return fail;
  const { t, rt } = f;
  const replies = rt.def.replies!;
  const opt = replies.options.find((o) => o.id === replyId);
  if (!opt) return fail;
  if (t.status === 'new' || t.status === 'acked') startTicket(d, ctx, id);
  t.replyAttempts++;
  if (!posted) postChat('#lab-automation', 'player', opt.text, id);
  // The coworker answers in LabChat (INC48: "Oh no, forgot — release it.").
  const response = (opt as typeof opt & { response?: { author: string; text: string; delayS?: number } }).response;
  if (response) postChat('#lab-automation', response.author, response.text, id, response.delayS ?? 0);
  // A correct reply addressed to a coworker counts as having asked them (GW20 "ask first").
  if (opt.correct) noteChatAsk(replies.to ?? t.reporter);
  ctx.emit('ticket.replied', { ticketId: id, replyId, correct: opt.correct });
  if (opt.correct) {
    t.reply = replyId;
    sampleScope(rt.scope, d);
    const st = scopeStatus(rt.scope, d);
    if (st.full || (st.immediate && st.hasVerify)) {
      const r = resolveTicket(d, ctx, id);
      if (r.outcome === 'resolved' && t.replyAttempts > 1 && replies.retryAtHalfPoints && t.score) {
        const half = -Math.round(Math.max(0, t.score.total) / 2);
        addScore(d, ctx, half, 'Second reply at half points', id);
        t.score.total += half;
        t.points = t.score.total;
      }
    }
    return { correct: true, final: true, points: t.points, teachCardId: null };
  }
  const sh = shiftOf(d);
  if (sh?.rules.scoring) addScore(d, ctx, -Math.abs(replies.wrongPenalty), 'Wrong reply', id);
  resetCombo(d, ctx);
  const card = pushTeachCard(d, ctx, opt.teach ?? { whatHappened: 'That reply was not right.', why: rt.def.teaches, doInstead: tpl(rt.def.hints[1], rt.binding) }, { kind: 'reply', ref: `${rt.def.id}:${replyId}` }, id);
  const final = replies.retryAtHalfPoints ? t.replyAttempts >= 2 : false;
  if (final) closeUnresolved(d, ctx, t, 'failed');
  return { correct: false, final, points: sh?.rules.scoring ? -Math.abs(replies.wrongPenalty) : 0, teachCardId: card.id };
}

export function fileBug(d: RootState, ctx: TxContext, id: string, fields: Record<string, string | number>): ResolveResult {
  const f = find(d, id);
  if (!f || closed(f.t)) return { outcome: 'rejected', points: 0, message: 'Ticket is closed.', teachCardId: null };
  f.t.bug = { ...fields };
  return resolveTicket(d, ctx, id);
}

export function submitTask(d: RootState, ctx: TxContext, id: string, answers: { matches: Record<string, string>; statusLineId?: string }): ResolveResult {
  const f = find(d, id);
  if (!f || closed(f.t)) return { outcome: 'rejected', points: 0, message: 'Ticket is closed.', teachCardId: null };
  const { t, rt } = f;
  const task = rt.def.task;
  t.matches = { ...answers.matches };
  if (answers.statusLineId) t.matches['__status'] = answers.statusLineId;
  if (task?.kind === 'match') {
    const wrong = task.pairs.filter((p) => answers.matches[p.left] !== p.right).length;
    const statusOk = !task.statusLine || task.statusLine.options.find((o) => o.id === answers.statusLineId)?.correct === true;
    if (wrong > 0 || !statusOk) {
      const pts = -(wrong + (statusOk ? 0 : 1)) * Math.abs(task.wrongPenalty);
      if (shiftOf(d)?.rules.scoring) addScore(d, ctx, pts, 'Wrong matches', id);
      resetCombo(d, ctx);
      const card = pushTeachCard(d, ctx, { whatHappened: `${wrong} match${wrong === 1 ? '' : 'es'} wrong${statusOk ? '' : ' and the status line is off'}.`, why: rt.def.teaches, doInstead: tpl(rt.def.hints[1], rt.binding) }, { kind: 'resolve', ref: rt.def.id }, id);
      ctx.emit('ticket.resolveRejected', { ticketId: id, reason: 'task answers wrong' });
      return { outcome: 'rejected', points: pts, message: 'Some answers are wrong.', teachCardId: card.id };
    }
  }
  return resolveTicket(d, ctx, id);
}

/* ───────────────────────────── hints (GP §2.3.8) ───────────────────────────── */

export function ticketHint(d: RootState, ctx: TxContext, id: string, confirm = false): HintResult | null {
  const f = find(d, id);
  if (!f || closed(f.t)) return null;
  const { t, rt } = f;
  const sh = shiftOf(d);
  const maxTier = sh ? sh.rules.hintsMaxTier : d.session.realism === 'strict' ? 1 : 3;
  if (t.hintTier >= maxTier) return null;
  const tier = (t.hintTier + 1) as 1 | 2 | 3;
  const text = tpl(rt.def.hints[tier - 1], rt.binding);
  if (tier === 3 && !confirm) return { tier, text: 'Walkthrough: highlights the next action (score ×0.5, no combo). Press H again to confirm.', maxTier, needsConfirm: true };
  t.hintTier = tier;
  if (sh) sh.stats.hintsUsed++;
  d.progress.stats.hintsUsed++;
  if (tier === 3) showWalkthroughCue(d, rt);
  ctx.emit('mission.hintShown', { scope: 'ticket', ref: id, tier, text });
  return { tier, text, maxTier, needsConfirm: false };
}

function showWalkthroughCue(d: RootState, rt: TicketRt): void {
  const cues = rt.def.walkthrough?.(rt.binding) ?? [];
  const cue = cues[rt.cueIndex];
  if (!cue) return;
  if (cue.marker) d.ui.highlight = cue.marker;
  if (cue.ghost) requestAppHint({ app: cue.ghost.app as never, target: cue.ghost.target, route: cue.ghost.route, showMe: true });
}

/* ───────────────────────────── per-tick & per-event ───────────────────────────── */

export function tickTickets(d: RootState, ctx: TxContext): void {
  const now = d.session.clockS;
  const sh = shiftOf(d);
  for (const t of d.session.tickets) {
    if (closed(t)) continue;
    const rt = TR.tickets.get(t.id);
    if (!rt) continue;
    sampleScope(rt.scope, d);
    t.fixedAtMs = rt.scope.fixedAtMs;
    // SLA (frozen while verifying or with Jared).
    const frozen = t.status === 'verifying' || (t.status === 'escalated' && t.escalation?.outcome === 'accepted');
    if (!frozen) {
      t.slaSecondsLeft = t.slaS - (now - t.arrivedAtS);
      const frac = t.slaSecondsLeft / t.slaS;
      t.sla = t.slaSecondsLeft <= 0 ? 'breached' : frac < 0.2 ? 'red' : frac > 0.5 ? 'green' : 'amber';
      if (t.slaSecondsLeft <= 0 && !t.breached && sh) {
        t.breached = true;
        sh.stats.breaches++;
        if (sh.rules.scoring) addScore(d, ctx, -BREACH_PENALTY, `SLA breach ${t.id}`, t.id);
        resetCombo(d, ctx);
        ctx.emit('ticket.breached', { ticketId: t.id });
        toast(d, 'warning', `${t.id} breached its SLA`, '−150 · the ticket stays open');
      }
    }
    if (t.status === 'verifying' && (t.verifying?.waitingFor === 'build' || t.verifying?.waitingFor === 'event')) kickVerificationBuild(d, t, rt, now);
    // Escalation timers.
    const esc = t.escalation;
    if (t.status === 'escalated' && esc) {
      if ((esc.outcome === 'pending' || esc.outcome === 'bounced') && esc.returnsAtS !== null && now >= esc.returnsAtS) bounce(d, ctx, t, rt);
      else if (esc.outcome === 'accepted') {
        if (!rt.jaredFixRun && esc.jaredDoneAtS !== null && now >= esc.jaredDoneAtS) {
          rt.jaredFixRun = true;
          const actions = rt.def.escalation?.jaredFix(rt.binding) ?? [];
          runActions(d, ctx, actions, { binding: rt.binding, ownerId: t.id, ticketId: t.id });
          for (const id of t.faultInstanceIds) simRun('faults.clear', (s) => s.faults.clear(id, 'jared'), { ok: false, error: '' });
          ctx.emit('npc.jaredFix', { ticketId: t.id, phase: 'finished' });
          ctx.emit('mission.npcAction', { npc: 'jared', action: 'idle', target: null });
        }
        if (rt.jaredFixRun) {
          sampleScope(rt.scope, d);
          if (scopeStatus(rt.scope, d).full) finishTicket(d, ctx, t, rt, 'escalation');
        }
      }
    }
  }
}

/** Real seconds a "next build" verification waits before Jenkins Bot re-runs a job on the rig itself. */
const VERIFY_KICK_UNCOVERED_S = 5;
const VERIFY_KICK_COVERED_S = 70;
const VERIFY_KICK_REPEAT_S = 80;
const BUILD_EVENTS: ReadonlySet<string> = new Set(['robot.checkedOut', 'jenkins.buildFinished', 'jenkins.buildStarted']);

/**
 * A ticket waiting for "the next build" on a rig that no active pipeline will check out soon (micro-shift,
 * Weak Spot and certification shifts run no pipelines; at low heat some rigs sit outside the active ones)
 * would never verify. Jenkins Bot re-runs a matching job naming the rig so the fix can be confirmed.
 */
function kickVerificationBuild(d: RootState, t: TicketState, rt: TicketRt, now: number): void {
  if (!t.verifying) return;
  // "next build" triggers, and event triggers that only a build produces ("the next checkout works").
  const node = rt.scope.verifyNodes.find((n) => n.on.kind === 'build' || (n.on.kind === 'event' && BUILD_EVENTS.has(n.on.match.event)));
  if (!node) return;
  const trig: Omit<Extract<DeferredTrigger, { kind: 'build' }>, 'kind'> = node.on.kind === 'build' ? node.on : {};
  // Exact parameters are part of the fix (INC39 "DEVICE_TYPE=FLEX_3", INC52 "CARD_PROFILE=…"): the player
  // runs that build; a re-run with the job's saved values would prove nothing.
  if (trig.params && Object.keys(trig.params).length) return;
  const robot = trig.robots?.[0] ?? rt.binding.rig ?? null;
  const covered = robot ? pipelineCovers(d, robot) : !!shiftOf(d)?.rules.pipelines || !!d.session.freeplay?.pipelines;
  if (now - t.verifying.sinceS < (covered ? VERIFY_KICK_COVERED_S : VERIFY_KICK_UNCOVERED_S)) return;
  if (rt.verifyKickAtS !== undefined && now - rt.verifyKickAtS < VERIFY_KICK_REPEAT_S) return;
  const orca = robot ? robotByName(d.lab, robot) : null;
  if (robot && (!orca || orca.checkout)) return;
  const pl = PIPELINES.find((p) => (trig.pipeline ? p.id === trig.pipeline : robot ? p.eligibleRigs.includes(robot) : p.id === 'PL3'));
  const job = trig.jobs?.[0] ?? (trig.pipeline ? PIPELINE_JOBS[trig.pipeline] : pl?.job) ?? PIPELINE_JOBS.PL3;
  const params: Record<string, string> = { ...(pl ? pl.params(0) : {}) };
  if (robot) {
    params.ROBOT_NAME = robot;
    // Named checkout: the job's DEVICE_TYPE must match the rig's device (jobs default e.g. FLEX_3).
    const type = robotDeviceType(d.lab, robot);
    if (type) params.DEVICE_TYPE = type;
  }
  rt.verifyKickAtS = now;
  const r = simRun('jenkins.build', (s) => s.jenkins.build(job, params, 'jenkins'), { ok: false as const, error: 'unavailable' });
  if (r.ok) postChat('#jenkins', 'jenkins-bot', `Re-running ${job}${robot ? ` on ${robot}` : ''} to verify ${t.id} (${r.value.buildId})`, t.id);
}

/** Per event: ticket counters, deferred verification triggers. */
export function onTicketEvent(d: RootState, ctx: TxContext, e: LogEntry): void {
  for (const t of d.session.tickets) {
    if (closed(t)) continue;
    const rt = TR.tickets.get(t.id);
    if (!rt) continue;
    if (!e.suppressed) for (const name of countEvent(rt.scope, e, d)) t.counters[name] = (t.counters[name] ?? 0) + 1;
    if (!hasVerify(rt.scope.cond)) continue;
    const outcome = feedTrigger(rt.scope, e, d);
    t.fixedAtMs = rt.scope.fixedAtMs;
    if (!outcome) continue;
    if (t.status === 'verifying') {
      if (outcome === 'satisfied') finishTicket(d, ctx, t, rt, 'verified');
      else if (outcome === 'failed') {
        t.status = 'in-progress';
        t.verifying = null;
        removeBanner(d, `verify-${t.id}`);
        raiseGw(d, ctx, 'GW16', { ticketId: t.id, detail: 'Verification failed' });
        ctx.emit('ticket.resolveRejected', { ticketId: t.id, reason: 'verification failed' });
      }
    } else if (t.status === 'escalated' && t.escalation?.outcome === 'accepted' && rt.jaredFixRun && outcome === 'satisfied') {
      finishTicket(d, ctx, t, rt, 'escalation');
    }
  }
}

