/**
 * MissionsApi — lifecycle, catalogue, Academy, quiz and flashcards.
 */
import { getState, transact } from '@/core/store';
import type { QuizAnswerValue, QuizContext } from '@/core/state';
import { EXAMS, MODULES, questionById } from '@/content';
import type { DebriefAction, MissionsApi, QuizAnswerResult, QuizFinishResult } from '../../api';
import { RT } from '../rt';
import { initRuntime, frameRuntime, tickRuntime } from '../driver';
import { toMenu, healthCheckInS } from '../session';
import { simRun } from '../simx';
import { allDrills, allIncidents, getDrill, getIncident } from '../registry';
import { moduleState, moduleView, nextModules } from '../academy/catalog';
import { continueAcademy, lessonFor, startAcademy } from '../academy/start';
import { acknowledge, checkpointPassed, choose, currentStep, offerFastForward, requestStepHint, restartCurrentStep, showMe } from '../academy/runner';
import { finishCheckpointAttempt, tallyQuiz } from '../academy/checkpoint';
import { quizTeach, recordAnswer } from '../progression/quiz';
import { correctAnswerText } from '@/content';
import { dueCardIds, endFlashcardSession, leitnerSummary, reviewCard, startFlashcardSession } from '../progression/leitner';
import { weakestSeenTags } from '../progression/mastery';
import { SHIFT_CONFIGS, SHIFT_BY_ID } from '../arcade/config';
import { dailyInfo } from '../arcade/plans';
import { endShift, shiftUnlock, startShift, writeShiftResult } from '../arcade/director';
import { ticketHint } from '../arcade/tickets';
import { drillUnlocked, startDrill } from '../drills/host';
import { startFreeplay } from '../freeplay';
import { certView, examReady, recordWrittenAnswer, submitWritten, startCertification } from '../cert/cert';
import { startWeakSpot } from '../weakspot';
import { practiceTarget } from '../manual';
import { openTickets } from '../arcade/shiftCore';
import { closeUnresolved } from '../arcade/tickets';

type Last =
  | { kind: 'academy'; moduleId: string; replay: boolean }
  | { kind: 'shift'; options: Parameters<MissionsApi['startShift']>[0] }
  | { kind: 'drill'; drillId: string; opts: Parameters<MissionsApi['startDrill']>[1] }
  | { kind: 'freeplay' }
  | { kind: 'weakspot' }
  | { kind: 'cert'; examId: string };

export const last: { value: Last | null; pendingPractice: { drillId: string; tags: string[] } | null; hintConfirm: { ticketId: string; atS: number } | null } = {
  value: null,
  pendingPractice: null,
  hintConfirm: null,
};

export const lifecycleApi = {
  init(): void {
    initRuntime();
  },
  tick(dtGameMs: number): void {
    RT.externalTick = true;
    const scale = getState().lab.time.timeScale || 1;
    tickRuntime(dtGameMs / scale / 1000);
  },
  frame(dtRealSeconds: number): void {
    RT.externalFrame = true;
    frameRuntime(dtRealSeconds);
  },
  restart(): void {
    const l = last.value;
    if (!l) return;
    switch (l.kind) {
      case 'academy':
        transact((d, ctx) => startAcademy(d, ctx, l.moduleId, { replay: l.replay, force: true }));
        return;
      case 'shift':
        transact((d, ctx) => startShift(d, ctx, typeof l.options === 'string' ? { configId: l.options } : l.options));
        return;
      case 'drill':
        transact((d, ctx) => startDrill(d, ctx, l.drillId, l.opts ?? {}));
        return;
      case 'freeplay':
        transact((d, ctx) => startFreeplay(d, ctx, { fresh: true }));
        return;
      case 'weakspot':
        transact((d, ctx) => startWeakSpot(d, ctx));
        return;
      case 'cert':
        transact((d, ctx) => startCertification(d, ctx, l.examId));
        return;
    }
  },
  quit(): void {
    transact((d, ctx) => {
      const sh = d.session.shift;
      if (sh && sh.phase === 'running' && (d.session.mode === 'arcade-shift' || d.session.mode === 'arcade-weakspot')) {
        // Abandoned shift: recorded; a ranked Daily submits its current score.
        for (const t of openTickets(d)) closeUnresolved(d, ctx, t, 'handover');
        sh.phase = 'ended';
        sh.endReason = 'quit';
        sh.ratio = sh.target > 0 ? sh.score / sh.target : 0;
        sh.grade = 'D';
        ctx.emit('shift.ended', { configId: sh.configId, score: sh.score, grade: 'D', ratio: sh.ratio, reason: 'quit' });
        writeShiftResult(d, ctx, sh, 'quit', { abandoned: true });
      }
      if (d.session.mode === 'certification' && d.session.cert && d.session.cert.part !== 'results') {
        const rec = d.progress.certs[d.session.cert.examId];
        if (rec) rec.retakeAvailableAt = Math.max(rec.retakeAvailableAt, 0);
      }
      toMenu(d, ctx);
    });
  },
  setPaused(paused: boolean): void {
    transact((d) => {
      const k = d.ui.overlay.kind;
      if (paused && (k === 'none' || k === 'tickets' || k === 'notebook' || k === 'sandbox' || k === 'computer' || k === 'tablet' || k === 'drill')) d.ui.overlay = { kind: 'pause' };
      else if (!paused && k === 'pause') d.ui.overlay = d.session.mode === 'arcade-drill' && d.session.drill ? { kind: 'drill', drillId: d.session.drill.drillId } : { kind: 'none' };
    });
  },
  continueFromDebrief(action: DebriefAction): void {
    const s = getState();
    const r = s.session.result;
    switch (action) {
      case 'menu': {
        const pp = last.pendingPractice;
        last.pendingPractice = null;
        if (pp) transact((d, ctx) => startDrill(d, ctx, pp.drillId, { tags: pp.tags }));
        else transact((d, ctx) => toMenu(d, ctx));
        return;
      }
      case 'next': {
        const next = r?.academy?.nextModules[0] ?? (r?.academy ? nextModules(s.progress, r.academy.moduleId)[0] : undefined);
        if (next) api.startAcademy(next);
        else transact((d, ctx) => toMenu(d, ctx));
        return;
      }
      case 'replay':
        if (r?.kind === 'academy' && r.academy) api.startAcademy(r.academy.moduleId, { replay: true });
        else api.restart();
        return;
      case 'play-now': {
        const pn = r?.academy?.playNow;
        if (pn?.kind === 'drill') api.startDrill(pn.drillId);
        else if (pn?.kind === 'micro-shift') api.startShift({ configId: 'micro', incidentIds: [pn.incidentId] });
        return;
      }
      case 'review': {
        const tags = r?.weakSpot?.tags.map((t) => t.tag) ?? r?.shift?.reviewTags.map((t) => t.tag) ?? [];
        transact((d, ctx) => toMenu(d, ctx));
        api.startFlashcards(tags.length ? { tags } : undefined);
        return;
      }
    }
  },
};

/* ───────────────────────────── catalogue ───────────────────────────── */

export const catalogApi = {
  modules: () => [...MODULES],
  moduleState: (id: string) => moduleState(getState().progress, id),
  moduleView: (id: string) => moduleView(getState().progress, id, getState().progress.academyCheckpoint?.moduleId === id),
  lesson: (id: string) => lessonFor(id),
  shifts: () => [...SHIFT_CONFIGS],
  shiftUnlock: (configId: string) => {
    const cfg = SHIFT_BY_ID[configId];
    return cfg ? shiftUnlock(getState(), cfg) : { unlocked: false, reason: 'Unknown shift' };
  },
  drills: () => allDrills(),
  drillView: (drillId: string) => {
    const def = getDrill(drillId);
    if (!def) return null;
    const s = getState();
    const st = s.progress.drills[drillId];
    const unlocked = drillUnlocked(s, def);
    return {
      def,
      unlock: { unlocked, reason: unlocked ? null : `Complete ${def.unlockedBy.join(' or ')}` },
      best: st?.best ?? 0,
      medal: st?.medal ?? null,
      rounds: st?.rounds ?? 0,
      isDaily: dailyInfo(s.progress).drillId === drillId,
    };
  },
  incidents: () => allIncidents(),
  incident: (id: string) => getIncident(id),
  certifications: () => [...EXAMS],
  certView: (examId: string) => certView(getState(), examId),
  dailyInfo: () => dailyInfo(getState().progress),
  menuBadges: () => {
    const s = getState();
    return { cardsDue: dueCardIds(s.progress).length, weakestTag: weakestSeenTags(s.progress, 1)[0] ?? null, examReady: examReady(s) };
  },
};

/* ───────────────────────────── Academy ───────────────────────────── */

export const academyApi = {
  startAcademy(moduleId: string, opts?: { replay?: boolean }): void {
    const ok = transact((d, ctx) => startAcademy(d, ctx, moduleId, { replay: !!opts?.replay }));
    if (ok) last.value = { kind: 'academy', moduleId, replay: !!opts?.replay };
  },
  continueAcademy(): boolean {
    const ok = transact((d, ctx) => continueAcademy(d, ctx));
    const cp = getState().session.academy;
    if (ok && cp) last.value = { kind: 'academy', moduleId: cp.moduleId, replay: cp.replay };
    return ok;
  },
  acknowledgeDialogue(): void {
    transact((d, ctx) => {
      acknowledge(d, ctx);
    });
  },
  chooseDialogue(choiceId: string): void {
    transact((d, ctx) => {
      choose(d, ctx, choiceId);
    });
  },
  requestHint(): string | null {
    return transact((d, ctx) => {
      if (d.session.mode === 'academy') return requestStepHint(d, ctx);
      const id = d.ui.selectedTicketId ?? openTickets(d).find((t) => t.status === 'in-progress')?.id ?? null;
      if (!id) return null;
      const hc = last.hintConfirm;
      const confirm = !!hc && hc.ticketId === id && d.session.clockS - hc.atS <= 5;
      const r = ticketHint(d, ctx, id, confirm);
      last.hintConfirm = r?.needsConfirm ? { ticketId: id, atS: d.session.clockS } : null;
      return r?.text ?? null;
    });
  },
  showMe(): boolean {
    return transact((d, ctx) => showMe(d, ctx));
  },
  fastForward(target: 'next-health-check'): void {
    transact((d) => {
      if (target !== 'next-health-check' || d.session.realism === 'strict') return;
      const allowed = (d.session.mode === 'academy' && (offerFastForward(d) || d.session.computer.forceHealthCheckButton)) || d.session.mode === 'freeplay';
      if (allowed) simRun('skipToNextHealthCheck', (s) => s.skipToNextHealthCheck(), undefined);
    });
  },
  restartStep(): void {
    transact((d, ctx) => {
      restartCurrentStep(d, ctx);
    });
  },
  restartModule(): void {
    const ac = getState().session.academy;
    if (!ac) return;
    transact((d, ctx) => {
      ctx.emit('mission.restarted', { moduleId: ac.moduleId, stepId: null, scope: 'module' });
      startAcademy(d, ctx, ac.moduleId, { replay: ac.replay, force: true });
    });
  },
};

/* ───────────────────────────── quiz & flashcards ───────────────────────────── */

export const quizApi = {
  answerQuiz(questionId: string, answer: QuizAnswerValue, context: QuizContext): QuizAnswerResult {
    const q = questionById(questionId);
    if (!q) return { correct: false, explanation: '', correctText: '', factIds: [], teach: null };
    return transact((d, ctx) => {
      const correct = recordAnswer(d, ctx, q, answer, context);
      if (context === 'cert') recordWrittenAnswer(d, questionId, correct);
      return {
        correct,
        explanation: q.explanation,
        correctText: correctAnswerText(q),
        factIds: [...q.factIds],
        // The cert paper shows no feedback until the results screen (Cur §5.4).
        teach: correct || context === 'cert' ? null : quizTeach(q),
      };
    });
  },
  nextQuizQuestion(): void {
    transact((d) => {
      const q = d.session.quiz;
      if (q && q.index < q.questionIds.length - 1) q.index++;
    });
  },
  finishQuiz(): QuizFinishResult {
    return transact((d, ctx) => {
      const run = d.session.quiz;
      const empty: QuizFinishResult = { checkpointId: null, correct: 0, total: 0, passed: false, attempt: 0, missedIds: [], retryQuestionIds: null, checkpoint: null };
      if (!run) return empty;
      if (run.context === 'cert') {
        const w = submitWritten(d, ctx);
        return { checkpointId: run.checkpointId, correct: w.correct, total: w.total, passed: w.passed, attempt: run.attempt, missedIds: [], retryQuestionIds: null, checkpoint: null };
      }
      const tally = tallyQuiz(run);
      const step = currentStep(d);
      if (run.context === 'lesson' && step?.kind === 'quiz-checkpoint' && d.session.academy) {
        const attempt = run.attempt;
        const { result, retry } = finishCheckpointAttempt(d, ctx, step, tally);
        if (!retry) checkpointPassed(d, ctx);
        return { checkpointId: step.checkpointId, correct: tally.correct, total: tally.total, passed: tally.passed, attempt, missedIds: tally.missedIds, retryQuestionIds: retry, checkpoint: { ...result, missedIds: [...result.missedIds] } };
      }
      run.finished = true;
      d.session.quiz = null;
      ctx.emit('quiz.finished', { checkpointId: run.checkpointId, context: run.context, correct: tally.correct, total: tally.total, passed: tally.passed, attempt: run.attempt });
      if (d.ui.overlay.kind === 'quiz') d.ui.overlay = run.context === 'review' ? { kind: 'manual' } : { kind: 'none' };
      return { checkpointId: run.checkpointId, correct: tally.correct, total: tally.total, passed: tally.passed, attempt: run.attempt, missedIds: tally.missedIds, retryQuestionIds: null, checkpoint: null };
    });
  },
  dueFlashcards: () => dueCardIds(getState().progress),
  startFlashcards(opts?: { deck?: string; tags?: string[] }) {
    return transact((d) => {
      const info = startFlashcardSession(d.progress, opts ?? {});
      d.ui.overlay = { kind: 'flashcards', ...(opts?.deck ? { deck: opts.deck } : {}), ...(opts?.tags ? { tags: [...opts.tags] } : {}) };
      return info;
    });
  },
  reviewFlashcard(cardId: string, knewIt: boolean): void {
    transact((d, ctx) => reviewCard(d, ctx, cardId, knewIt));
  },
  endFlashcards(): void {
    transact((d) => {
      endFlashcardSession(d);
      if (d.ui.overlay.kind === 'flashcards') d.ui.overlay = d.session.mode === 'menu' ? { kind: 'main-menu', screen: 'manual' } : { kind: 'none' };
    });
  },
  leitnerSummary: () => leitnerSummary(getState().progress),
};

/* ───────────────────────────── entry points shared by the facade ───────────────────────────── */

export const api = {
  startAcademy: academyApi.startAcademy,
  startShift(options: string | Parameters<MissionsApi['startShift']>[0]): void {
    const o = typeof options === 'string' ? { configId: options } : options;
    const ok = transact((d, ctx) => startShift(d, ctx, o));
    if (ok) last.value = { kind: 'shift', options: o };
  },
  startDrill(drillId: string, opts?: Parameters<MissionsApi['startDrill']>[1]): void {
    const ok = transact((d, ctx) => startDrill(d, ctx, drillId, opts ?? {}));
    if (ok) last.value = { kind: 'drill', drillId, opts };
  },
  startFlashcards: quizApi.startFlashcards,
  restart: lifecycleApi.restart,
};

export function practiceFromCard(teachCardId: string): void {
  const s = getState();
  const target = practiceTarget(s, teachCardId);
  if (!target) return;
  const busy = s.session.mode !== 'menu' && !s.session.result && s.session.mode !== 'academy';
  if (busy) {
    last.pendingPractice = target;
    transact((d) => {
      d.ui.toasts.push({ id: `pp-${teachCardId}`, kind: 'info', title: 'Practice queued', body: 'It starts when you leave this activity.', createdAtMs: d.lab.time.nowMs });
    });
    return;
  }
  api.startDrill(target.drillId, { tags: target.tags });
}

export function healthCheckCountdown(): number {
  return healthCheckInS(getState());
}

export { endShift };
