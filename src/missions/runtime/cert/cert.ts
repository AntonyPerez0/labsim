/**
 * Certification (Cur §5, GP §2.3.12, §4.3): eligibility, retake gate, written paper (timed, critical items
 * must be correct), practical (task list or certification shift), pass/distinction, records, XP and
 * promotion.
 */
import type { TxContext } from '@/core/store';
import { hashString } from '@/core/rng';
import type { CertExamId, CertRecord, CertRunState, CertTaskState, RootState } from '@/core/state';
import type { ExamBlueprint } from '@/content/schema';
import { DISTINCTION, EXAMS, EXAMS_BY_ID, RETAKE_RULES, XP_REWARDS, flashcardsForFacts, questionById, personText } from '@/content';
import type { CertView, CertWrittenResult, MissionResult } from '../../api';
import type { CertPracticalDef } from '../../types';
import { RT, onActivityReset } from '../rt';
import { createScope, disposeScope, evaluate, sampleScope, scopeStatus, type Scope } from '../conditions/evaluate';
import { beginActivity, endActivity, finaliseResultRank, newResult } from '../session';
import { applySetup } from '../scripts';
import { realNowMs } from '../clock';
import { grantXp, checkPromotion } from '../progression/xp';
import { demoteFacts, leitnerMasteryOfAll, leitnerSummary } from '../progression/leitner';
import { startQuiz } from '../progression/quiz';
import { removeBanner, setBanner, toast } from '../feedback';
import { getIncident, getPractical } from '../registry';
import { isComplete } from '../academy/catalog';
import { injectIncident } from '../arcade/spawn';
import { directorHooks, startShift } from '../arcade/director';
import { penaltyHooks } from '../arcade/penalties';
import { closeUnresolved } from '../arcade/tickets';
import { drawWrittenExam } from './draw';
import { BUILT_IN_PRACTICALS, type BuiltInTask } from './practicals';
import { TR } from '../arcade/ticketRuntime';

interface TaskRt {
  def: BuiltInTask;
  pass: Scope;
  failIf: Scope | null;
  ticketId: string | null;
}
const tasks = new Map<string, TaskRt>();
onActivityReset(() => {
  for (const t of tasks.values()) {
    disposeScope(t.pass.id);
    if (t.failIf) disposeScope(t.failIf.id);
  }
  tasks.clear();
});

export function practicalFor(examId: string): CertPracticalDef | null {
  return getPractical(examId) ?? BUILT_IN_PRACTICALS.find((p) => p.examId === examId) ?? null;
}

/* ───────────────────────────── eligibility ───────────────────────────── */

export function certMissing(d: RootState, exam: ExamBlueprint): string[] {
  const p = d.progress;
  const out: string[] = [];
  for (const m of exam.eligibility.modules) if (!isComplete(p, m)) out.push(`Complete ${m}`);
  // Each exam also needs every module of the earlier exams (eligibility is cumulative).
  if (exam.eligibility.previousExam && !p.certs[exam.eligibility.previousExam as CertExamId]?.passed) out.push(`Pass ${exam.eligibility.previousExam}`);
  if (exam.eligibility.leitnerMastery !== undefined) {
    const m = leitnerMasteryOfAll(p);
    if (m < exam.eligibility.leitnerMastery) out.push(`Leitner mastery ${Math.round(m * 100)} % / ${Math.round(exam.eligibility.leitnerMastery * 100)} %`);
  }
  if (exam.eligibility.fullShiftRatio !== undefined && p.shifts.bestFullShiftRatio < exam.eligibility.fullShiftRatio) {
    out.push(`Full Shift score ${Math.round(p.shifts.bestFullShiftRatio * 100)} % / ${Math.round(exam.eligibility.fullShiftRatio * 100)} %`);
  }
  return out;
}

function retakeOpenAt(d: RootState, rec: CertRecord | undefined): number | null {
  if (!rec || rec.passed || !rec.attempts) return null;
  const now = realNowMs();
  let at = rec.retakeAvailableAt > now ? rec.retakeAvailableAt : null;
  if (rec.retakeNeedsReviewOf.length) {
    const cards = flashcardsForFacts([...rec.retakeNeedsReviewOf]).map((c) => c.id);
    const reviewed = cards.length === 0 || d.progress.flashcards.lastSessionCardIds.some((id) => cards.includes(id));
    if (!reviewed) at = Math.max(at ?? 0, now + 1);
  }
  return at;
}

export function certView(d: RootState, examId: string): CertView | null {
  const exam = EXAMS_BY_ID[examId];
  if (!exam) return null;
  const missing = certMissing(d, exam);
  const rec = d.progress.certs[examId as CertExamId] ?? null;
  const retake = retakeOpenAt(d, rec ?? undefined);
  return { exam, practical: practicalFor(examId), eligible: missing.length === 0 && retake === null, missing, record: rec ? { ...rec } : null, retakeAvailableAt: retake };
}

export function examReady(d: RootState): string | null {
  for (const e of EXAMS) {
    if (d.progress.certs[e.id as CertExamId]?.passed) continue;
    if (certView(d, e.id)?.eligible) return e.id;
  }
  return null;
}

/* ───────────────────────────── start / written ───────────────────────────── */

function weakestModules(d: RootState): string[] {
  const s = leitnerSummary(d.progress);
  return Object.entries(s.perDeck)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 6)
    .map(([deck]) => deck.replace(/^deck\./, ''));
}

export function startCertification(d: RootState, ctx: TxContext, examId: string): MissionResult {
  const view = certView(d, examId);
  if (!view) return { ok: false, error: `Unknown exam ${examId}` };
  if (!view.eligible) return { ok: false, error: view.retakeAvailableAt ? 'Retake not open yet (10 minutes and a Leitner review of the missed cards).' : view.missing.join(' · ') };
  const exam = view.exam;
  const id = examId as CertExamId;
  const rec = (d.progress.certs[id] ??= emptyRecord());
  const seed = hashString(`${examId}:${rec.attempts}:${realNowMs()}`);
  beginActivity(d, ctx, { mode: 'certification', activityId: examId, seed, preset: 'cert', timeScale: 1, startHour: 8, overlay: { kind: 'certification', examId } });
  rec.attempts++;
  rec.lastAttemptAt = realNowMs();
  const draw = drawWrittenExam(exam, seed, { previous: rec.lastWrittenQuestionIds, weakestModules: weakestModules(d) });
  rec.lastWrittenQuestionIds = [...draw.questionIds];
  const practical = practicalFor(examId);
  const run: CertRunState = {
    examId: id,
    part: 'written',
    written: {
      questionIds: draw.questionIds,
      criticalQuestionIds: draw.criticalQuestionIds,
      answers: {},
      timeLimitS: exam.written.minutes * 60,
      timeLeftS: exam.written.minutes * 60,
      submitted: false,
      correct: 0,
      pct: 0,
      criticalMissed: [],
      passed: null,
    },
    practical: {
      kind: practical?.kind ?? 'tasks',
      tasks:
        practical?.kind === 'tasks'
          ? practical.tasks.map((t) => taskState(t.id, t.title ?? exam.practical.tasks.find((x) => x.id === t.id)?.playerMust ?? t.id, t.timeLimitGameMin))
          : [taskState(`${exam.rank.replace('R', 'P')}-shift`, exam.practical.summary, practical?.kind === 'shift' ? practical.gameMinutes : exam.practical.minutes)],
      timeLimitS: exam.practical.minutes * 60,
      timeLeftS: exam.practical.minutes * 60,
      strikes: 0,
      strikeLog: [],
      passed: null,
    },
    passed: null,
    distinction: false,
  };
  d.session.cert = run;
  startQuiz(d, { context: 'cert', checkpointId: `${examId}:written`, title: `${examId} written`, questionIds: draw.questionIds, passRatio: exam.written.passCount / exam.written.items, timeLimitS: run.written.timeLimitS, attempt: rec.attempts });
  d.session.timerSeconds = run.written.timeLeftS;
  ctx.emit('cert.started', { examId, part: 'written' });
  return { ok: true, value: undefined };
}

function taskState(taskId: string, title: string, minutes: number | undefined): CertTaskState {
  return { taskId, title: personText(title), status: 'pending', startedAtS: null, timeLimitS: minutes ? minutes * 60 : null, answer: null, failReason: null };
}

function emptyRecord(): CertRecord {
  return { attempts: 0, passed: false, passedAt: 0, distinction: false, bestWrittenPct: 0, bestPracticalMs: 0, lastAttemptAt: 0, retakeAvailableAt: 0, retakeNeedsReviewOf: [], lastWrittenQuestionIds: [] };
}

/** Record a written answer (called by `answerQuiz(…, 'cert')`). */
export function recordWrittenAnswer(d: RootState, questionId: string, correct: boolean): void {
  const c = d.session.cert;
  if (!c || c.part !== 'written' || c.written.submitted || !c.written.questionIds.includes(questionId)) return;
  c.written.answers[questionId] = correct;
}

export function submitWritten(d: RootState, ctx: TxContext): CertWrittenResult {
  const c = d.session.cert;
  if (!c || c.written.submitted) {
    const w = c?.written;
    return { correct: w?.correct ?? 0, total: w?.questionIds.length ?? 0, pct: w?.pct ?? 0, criticalMissed: w?.criticalMissed ?? [], passed: !!w?.passed };
  }
  const exam = EXAMS_BY_ID[c.examId]!;
  const w = c.written;
  w.submitted = true;
  w.correct = w.questionIds.filter((id) => w.answers[id]).length;
  w.pct = w.questionIds.length ? (100 * w.correct) / w.questionIds.length : 0;
  w.criticalMissed = w.criticalQuestionIds.filter((id) => !w.answers[id]);
  w.passed = w.correct >= exam.written.passCount && w.criticalMissed.length === 0;
  if (d.session.quiz) d.session.quiz.finished = true;
  d.session.quiz = null;
  const rec = d.progress.certs[c.examId]!;
  rec.bestWrittenPct = Math.max(rec.bestWrittenPct, Math.round(w.pct * 10) / 10);
  ctx.emit('quiz.finished', { checkpointId: `${c.examId}:written`, context: 'cert', correct: w.correct, total: w.questionIds.length, passed: w.passed, attempt: rec.attempts });
  if (!w.passed) finishCert(d, ctx);
  else {
    c.part = 'practical';
    d.session.timerSeconds = c.practical.timeLeftS;
  }
  return { correct: w.correct, total: w.questionIds.length, pct: w.pct, criticalMissed: [...w.criticalMissed], passed: w.passed };
}

/* ───────────────────────────── practical ───────────────────────────── */

export function startPractical(d: RootState, ctx: TxContext): void {
  const c = d.session.cert;
  if (!c || c.part !== 'practical' || c.practical.tasks.some((t) => t.status !== 'pending')) return;
  const practical = practicalFor(c.examId);
  d.ui.overlay = { kind: 'none' };
  ctx.emit('cert.started', { examId: c.examId, part: 'practical' });
  if (!practical) {
    // No executable practical: the written part decides (flagged in the result).
    c.practical.passed = true;
    finishCert(d, ctx);
    return;
  }
  if (practical.kind === 'shift') {
    const task = c.practical.tasks[0]!;
    task.status = 'active';
    task.startedAtS = d.session.clockS;
    startShift(d, ctx, { configId: practical.shiftConfigId, realism: 'strict' }, { mode: 'certification', keepSession: true, seed: RT.rng.seed });
    d.session.cert = c;
    return;
  }
  startTask(d, ctx, 0);
}

function startTask(d: RootState, ctx: TxContext, index: number): void {
  const c = d.session.cert!;
  const practical = practicalFor(c.examId);
  if (!practical || practical.kind !== 'tasks') return;
  const def = practical.tasks[index] as BuiltInTask | undefined;
  const st = c.practical.tasks[index];
  if (!def || !st) {
    c.practical.passed = c.practical.tasks.every((t) => t.status === 'passed') && c.practical.strikes <= practical.maxStrikes;
    finishCert(d, ctx);
    return;
  }
  st.status = 'active';
  st.startedAtS = d.session.clockS;
  applySetup(d, ctx, def.setup, { binding: null, ownerId: def.id });
  let ticketId: string | null = null;
  if (def.spawnIncident) {
    const inc = getIncident(def.spawnIncident);
    if (inc) ticketId = injectIncident(d, ctx, inc, { source: 'cert', revealNow: true, uniformVariant: true })?.ticket?.id ?? null;
  }
  const rt = TR.tickets.get(ticketId ?? '');
  const pass = createScope({ id: `cert:${def.id}`, kind: 'task', ownerId: def.id, cond: def.pass, state: d, ticketId, binding: rt?.binding ?? null });
  const failIf = def.failIf ? createScope({ id: `certfail:${def.id}`, kind: 'task', ownerId: def.id, cond: def.failIf, state: d }) : null;
  tasks.set(def.id, { def, pass, failIf, ticketId });
  d.session.objectives = (def.objectives ?? [{ id: def.id, text: st.title }]).map((o) => ({ id: o.id, text: o.text, done: false }));
  setBanner(d, 'cert-task', 'info', `${def.id}: ${st.title}`);
}

function endTask(d: RootState, ctx: TxContext, taskId: string, passed: boolean, reason: string | null): void {
  const c = d.session.cert!;
  const idx = c.practical.tasks.findIndex((t) => t.taskId === taskId);
  const st = c.practical.tasks[idx];
  const rt = tasks.get(taskId);
  if (!st || st.status !== 'active') return;
  st.status = passed ? 'passed' : 'failed';
  st.failReason = reason;
  if (rt) {
    disposeScope(rt.pass.id);
    if (rt.failIf) disposeScope(rt.failIf.id);
    if (rt.ticketId) {
      const t = d.session.tickets.find((x) => x.id === rt.ticketId);
      if (t && t.status !== 'resolved') closeUnresolved(d, ctx, t, 'failed');
    }
  }
  tasks.delete(taskId);
  ctx.emit('cert.taskFinished', { examId: c.examId, taskId, passed, reason });
  toast(d, passed ? 'success' : 'error', `${taskId} ${passed ? 'passed' : 'failed'}`, reason ?? undefined);
  if (!passed) {
    addCertStrike(d, ctx, reason ?? `${taskId} failed`, null);
    if (d.session.cert?.part !== 'practical') return;
  }
  startTask(d, ctx, idx + 1);
}

function addCertStrike(d: RootState, ctx: TxContext, reason: string, gwId: string | null): void {
  const c = d.session.cert;
  if (!c || c.part !== 'practical') return;
  c.practical.strikes++;
  c.practical.strikeLog.push({ atS: d.session.clockS, reason, gwId, ticketId: null });
  const practical = practicalFor(c.examId);
  if (practical && c.practical.strikes > practical.maxStrikes && practical.kind === 'tasks') {
    for (const t of c.practical.tasks) if (t.status === 'active' || t.status === 'pending') t.status = 'failed';
    c.practical.passed = false;
    finishCert(d, ctx);
  }
}

export function submitPracticalAnswer(d: RootState, ctx: TxContext, taskId: string, answer: string): MissionResult<{ passed: boolean }> {
  const c = d.session.cert;
  const rt = tasks.get(taskId);
  if (!c || !rt) return { ok: false, error: 'No such active task.' };
  const st = c.practical.tasks.find((t) => t.taskId === taskId)!;
  st.answer = answer.trim();
  d.session.vars[`answer:${taskId}`] = st.answer;
  const accepted = rt.def.answerForm?.accepted ?? [];
  const ok = accepted.some((a) => a.trim().toLowerCase() === st.answer!.toLowerCase());
  sampleScope(rt.pass, d);
  const passed = ok && scopeStatus(rt.pass, d).full;
  if (passed) endTask(d, ctx, taskId, true, null);
  else if (!ok) endTask(d, ctx, taskId, false, `Answer "${st.answer}" is not correct.`);
  return { ok: true, value: { passed } };
}

export function tickCert(d: RootState, ctx: TxContext, dtS: number): void {
  const c = d.session.cert;
  if (!c || c.part !== 'practical') return;
  c.practical.timeLeftS = Math.max(0, c.practical.timeLeftS - dtS);
  d.session.timerSeconds = c.practical.timeLeftS;
  for (const [id, rt] of [...tasks.entries()]) {
    const st = c.practical.tasks.find((t) => t.taskId === id);
    if (!st || st.status !== 'active') continue;
    if (rt.failIf) {
      sampleScope(rt.failIf, d);
      if (evaluate(rt.failIf.cond!, d, rt.failIf)) {
        endTask(d, ctx, id, false, 'A forbidden action ended the task.');
        continue;
      }
    }
    sampleScope(rt.pass, d);
    if (!rt.def.answerForm && scopeStatus(rt.pass, d).full) {
      endTask(d, ctx, id, true, null);
      continue;
    }
    if (st.timeLimitS !== null && st.startedAtS !== null && d.session.clockS - st.startedAtS >= st.timeLimitS) endTask(d, ctx, id, false, 'Time limit reached.');
  }
  if (c.part === 'practical' && c.practical.timeLeftS <= 0 && c.practical.kind === 'tasks') {
    for (const t of c.practical.tasks) if (t.status === 'active' || t.status === 'pending') t.status = 'failed';
    c.practical.passed = false;
    finishCert(d, ctx);
  }
}

/** Written exam clock (frame, real time — the certification overlay pauses the sim). */
export function frameCert(d: RootState, ctx: TxContext, dtRealS: number): void {
  const c = d.session.cert;
  if (!c || c.part !== 'written' || c.written.submitted) return;
  c.written.timeLeftS = Math.max(0, c.written.timeLeftS - dtRealS);
  d.session.timerSeconds = c.written.timeLeftS;
  if (d.session.quiz) d.session.quiz.timeLeftS = c.written.timeLeftS;
  if (c.written.timeLeftS <= 0) submitWritten(d, ctx);
}

/* ───────────────────────────── finish ───────────────────────────── */

export function finishCert(d: RootState, ctx: TxContext): void {
  const c = d.session.cert;
  if (!c || c.part === 'results') return;
  const exam = EXAMS_BY_ID[c.examId]!;
  const rec = d.progress.certs[c.examId]!;
  const writtenPassed = !!c.written.passed;
  const practicalPassed = writtenPassed && !!c.practical.passed;
  c.part = 'results';
  c.passed = writtenPassed && practicalPassed;
  c.distinction = c.passed && c.written.pct >= DISTINCTION.writtenPercent && c.practical.strikes <= DISTINCTION.practicalStrikes;
  d.session.timerSeconds = null;
  removeBanner(d, 'cert-task');
  const missedIds = c.written.questionIds.filter((id) => c.written.submitted && !c.written.answers[id]);
  const missedFacts = [...new Set(missedIds.flatMap((id) => questionById(id)?.factIds ?? []))];
  const now = realNowMs();
  if (c.passed) {
    if (!rec.passed) rec.passedAt = now;
    rec.passed = true;
    rec.distinction = rec.distinction || c.distinction;
    rec.retakeNeedsReviewOf = [];
    rec.retakeAvailableAt = 0;
    const started = c.practical.tasks[0]?.startedAtS;
    if (started !== null && started !== undefined) {
      const ms = Math.round((d.session.clockS - started) * 1000);
      rec.bestPracticalMs = rec.bestPracticalMs ? Math.min(rec.bestPracticalMs, ms) : ms;
    }
  } else {
    rec.retakeAvailableAt = now + RETAKE_RULES.cooldownRealMinutes * 60_000;
    rec.retakeNeedsReviewOf = missedFacts;
    demoteFacts(d, missedFacts);
  }
  const result = newResult(d, 'certification', `${c.examId} — ${exam.title}`);
  d.session.result = result;
  result.passed = c.passed;
  result.accuracy = c.written.pct / 100;
  result.cert = {
    examId: c.examId,
    writtenPct: Math.round(c.written.pct * 10) / 10,
    writtenPassed,
    criticalMissed: [...c.written.criticalMissed],
    practicalPassed,
    tasks: c.practical.tasks.map((t) => ({ ...t })),
    distinction: c.distinction,
    missed: missedIds.map((id) => ({ questionId: id, factIds: questionById(id)?.factIds ?? [] })),
    retakeAvailableAt: c.passed ? null : rec.retakeAvailableAt,
  };
  if (c.passed) {
    const base = XP_REWARDS.certification[c.examId] ?? exam.xp;
    grantXp(d, ctx, Math.round(base * (c.distinction ? 1 + XP_REWARDS.distinctionBonus : 1)), 'certification', `${c.examId} passed${c.distinction ? ' with distinction' : ''}`, { final: true });
    checkPromotion(d, ctx);
  }
  ctx.emit('cert.finished', { examId: c.examId, passed: c.passed, distinction: c.distinction, writtenPct: c.written.pct });
  endActivity(d, ctx, result);
  finaliseResultRank(d);
}

/* ───────────────────────────── hooks ───────────────────────────── */

penaltyHooks.certStrike = (d, ctx, reason, gwId) => addCertStrike(d, ctx, reason, gwId);

directorHooks.ended.push((d, ctx, reason) => {
  const c = d.session.cert;
  if (d.session.mode !== 'certification' || !c) return false;
  const practical = practicalFor(c.examId);
  const sh = d.session.shift!;
  const resolvedAll = !!sh.plan?.length && sh.plan.every((p) => !!p.ticketId && d.session.tickets.find((t) => t.id === p.ticketId)?.status === 'resolved');
  const strikesOk = practical?.kind === 'shift' ? sh.strikes <= practical.maxStrikes : true;
  c.practical.strikes = sh.strikes;
  c.practical.strikeLog = sh.strikeLog.map((s) => ({ ...s }));
  const task = c.practical.tasks[0];
  if (task) {
    task.status = resolvedAll && strikesOk ? 'passed' : 'failed';
    task.failReason = resolvedAll ? (strikesOk ? null : 'Too many strikes.') : reason === 'strikes' ? 'Too many strikes.' : 'Not every incident was resolved in time.';
  }
  c.practical.passed = resolvedAll && strikesOk;
  finishCert(d, ctx);
  return true;
});
