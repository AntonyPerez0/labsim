/**
 * Quiz runs (Academy checkpoints, Field Manual reviews, exam papers) and grading of every question type
 * (Cur §3.0). Answers are always given in the **authored** order of the content item:
 *
 *   mc / tf  option index into `QuizQuestion.options` (an index array for multi-select)
 *   order    the authored option strings in the order the player put them
 *   match    `[left, right][]` pairs chosen by the player (any order)
 *   fill     the typed text
 *
 * `session.quiz.shuffles[qid]` is the display permutation (display slot → authored index) the UI uses to
 * render and to map clicks back to authored indices.
 */
import type { TxContext } from '@/core/store';
import type { QuizAnswerValue, QuizContext, QuizRunState, RootState, TeachCardContent } from '@/core/state';
import type { QuizQuestion } from '@/content/schema';
import { correctAnswerText, gradeQuestion, questionById, questionsForModule } from '@/content';
import { createRngState, hashString, shuffle } from '@/core/rng';
import { RT } from '../rt';
import { today } from '../clock';
import { addEvidenceAll, type EvidenceKind } from './mastery';
import { demoteFacts } from './leitner';

/** Pass mark of a checkpoint with `n` items (Cur §2.0: `ceil(0.8 × n)`). */
export function passCount(n: number, ratio = 0.8): number {
  return Math.ceil(ratio * n - 1e-9);
}

/** Display permutation of a question's options for an attempt (seeded; MC/ORD/MATCH reshuffle, TF never). */
export function optionShuffle(q: QuizQuestion, attempt: number, salt: string): number[] {
  const n = q.type === 'match' ? (q.pairs?.length ?? 0) : (q.options?.length ?? 0);
  const ids = Array.from({ length: n }, (_, i) => i);
  if (q.type === 'tf' || q.type === 'fill' || n < 2) return ids;
  const rng = createRngState(hashString(`${q.id}:${attempt}:${salt}`));
  const out = shuffle(rng, ids);
  // Order items must never be displayed already solved.
  if (q.type === 'order' && out.every((v, i) => v === i)) out.push(out.shift()!);
  return out;
}

export interface StartQuizOptions {
  context: QuizContext;
  checkpointId: string | null;
  title: string;
  questionIds: readonly string[];
  passRatio?: number;
  timeLimitS?: number | null;
  attempt?: number;
  /** Extra salt for shuffles (Academy replays reshuffle). */
  salt?: string;
}

export function startQuiz(d: RootState, o: StartQuizOptions): QuizRunState {
  const attempt = o.attempt ?? 1;
  const salt = o.salt ?? String(RT.rng.seed);
  const shuffles: Record<string, number[]> = {};
  for (const id of o.questionIds) {
    const q = questionById(id);
    if (q) shuffles[id] = optionShuffle(q, attempt, salt);
  }
  const run: QuizRunState = {
    context: o.context,
    checkpointId: o.checkpointId,
    title: o.title,
    questionIds: [...o.questionIds],
    index: 0,
    attempt,
    answers: {},
    shuffles,
    passRatio: o.passRatio ?? 0.8,
    timeLimitS: o.timeLimitS ?? null,
    timeLeftS: o.timeLimitS ?? null,
    finished: false,
  };
  d.session.quiz = run;
  return run;
}

/** Convert a `QuizAnswerValue` into the shape `gradeQuestion` expects. */
export function normaliseAnswer(q: QuizQuestion, answer: QuizAnswerValue): number | number[] | string | string[] {
  if (q.type === 'match') {
    if (!Array.isArray(answer)) return [];
    const pairs = answer as unknown[];
    if (pairs.every((p) => Array.isArray(p))) {
      const map = new Map((pairs as [string, string][]).map(([l, r]) => [l, r]));
      return (q.pairs ?? []).map(([l]) => map.get(l) ?? '');
    }
    return pairs.map(String);
  }
  if (q.type === 'mc' || q.type === 'tf') {
    if (Array.isArray(answer)) return (answer as unknown[]).map(Number);
    if (typeof answer === 'string' && answer.trim() !== '' && !Number.isNaN(Number(answer))) return Number(answer);
    if (typeof answer === 'string') {
      const i = (q.options ?? []).findIndex((o) => o === answer);
      return i;
    }
    return answer as number;
  }
  if (q.type === 'order') return Array.isArray(answer) ? (answer as unknown[]).map(String) : [];
  return typeof answer === 'string' ? answer : String(answer);
}

export function gradeAnswer(q: QuizQuestion, answer: QuizAnswerValue): boolean {
  try {
    return gradeQuestion(q, normaliseAnswer(q, answer));
  } catch {
    return false;
  }
}

/** Teach Card for a wrong quiz answer: the curriculum explanation (GP §5.5). */
export function quizTeach(q: QuizQuestion): TeachCardContent {
  const card: TeachCardContent = {
    whatHappened: `Not quite. Correct answer: ${correctAnswerText(q)}`,
    why: q.explanation,
    doInstead: 'Read the linked Field Manual entry, then try the item again in Speed Quiz or Flashcards.',
    factIds: [...q.factIds],
    practiceDrillId: 'DR10',
  };
  if (q.tags[0]) card.tag = q.tags[0];
  if (q.illustrative) card.illustrative = true;
  return card;
}

function evidenceKind(context: QuizContext): EvidenceKind {
  switch (context) {
    case 'cert':
      return 'cert';
    case 'drill':
      return 'drill';
    default:
      return 'quiz';
  }
}

export interface GradeOutcome {
  correct: boolean;
  question: QuizQuestion;
}

/**
 * Grade and record an answer: quiz stats, mastery evidence, Leitner cross-mode demotion on a miss
 * (Cur §4.0), `quiz.answered`. Updates `session.quiz` when the question belongs to it.
 */
export function recordAnswer(d: RootState, ctx: TxContext, q: QuizQuestion, answer: QuizAnswerValue, context: QuizContext, opts: { slow?: boolean } = {}): boolean {
  const correct = gradeAnswer(q, answer);
  const t = today();
  const st = (d.progress.quiz[q.id] ??= { seen: 0, correct: 0, lastSeenDay: 0, lastCorrect: null });
  st.seen++;
  if (correct) st.correct++;
  st.lastSeenDay = t;
  st.lastCorrect = correct;
  addEvidenceAll(d, ctx, q.tags, correct ? (opts.slow ? 0.8 : 1) : 0, evidenceKind(context), `quiz:${q.id}`);
  if (!correct) demoteFacts(d, q.factIds);
  const run = d.session.quiz;
  if (run && !run.finished && run.questionIds.includes(q.id)) run.answers[q.id] = { correct, answer };
  ctx.emit('quiz.answered', { questionId: q.id, correct, context });
  return correct;
}

export interface QuizTally {
  correct: number;
  total: number;
  passed: boolean;
  missedIds: string[];
}

export function tallyQuiz(run: QuizRunState): QuizTally {
  let correct = 0;
  const missed: string[] = [];
  for (const id of run.questionIds) {
    if (run.answers[id]?.correct) correct++;
    else missed.push(id);
  }
  const total = run.questionIds.length;
  return { correct, total, passed: correct >= passCount(total, run.passRatio), missedIds: missed };
}

/** Failed checkpoint re-run paper: the missed items + 2 random items from the same module (Cur §2.0). */
export function retryPaper(moduleId: string, missed: readonly string[], salt: string): string[] {
  const pool = questionsForModule(moduleId)
    .map((q) => q.id)
    .filter((id) => !missed.includes(id));
  const rng = createRngState(hashString(`retry:${moduleId}:${missed.join(',')}:${salt}`));
  return [...missed, ...shuffle(rng, pool).slice(0, 2)];
}
