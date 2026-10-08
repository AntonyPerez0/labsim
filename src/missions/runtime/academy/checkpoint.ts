/**
 * Academy checkpoint quizzes (Cur §2.0): modal quiz with the listed items in order; pass = ≥ 80 % on the
 * first try (`ceil(0.8 × n)`); each wrong answer shows its explanation at once; on a fail the run repeats
 * with the missed items + 2 random items from the module until passed. Stars need 100 % first try.
 */
import type { TxContext } from '@/core/store';
import type { CheckpointResult, RootState } from '@/core/state';
import type { LessonStep } from '../../types';
import { retryPaper, startQuiz, tallyQuiz, type QuizTally } from '../progression/quiz';

export function startCheckpointQuiz(d: RootState, step: Extract<LessonStep, { kind: 'quiz-checkpoint' }>, attempt = 1, questionIds?: readonly string[]): void {
  const ac = d.session.academy;
  const salt = `${ac?.moduleId ?? ''}:${d.progress.modules[ac?.moduleId ?? '']?.replays ?? 0}`;
  const ids = questionIds ?? step.questionIds;
  startQuiz(d, {
    context: 'lesson',
    checkpointId: step.checkpointId,
    title: step.title,
    questionIds: ids,
    passRatio: step.passRatio ?? 0.8,
    attempt,
    salt,
  });
  d.ui.overlay = { kind: 'quiz', questionIds: [...ids], context: 'lesson' };
}

/**
 * Record the finished attempt. Returns the checkpoint result and, on a fail, the re-run paper (already
 * started). The caller completes the step on a pass.
 */
export function finishCheckpointAttempt(
  d: RootState,
  ctx: TxContext,
  step: Extract<LessonStep, { kind: 'quiz-checkpoint' }>,
  tally: QuizTally,
): { result: CheckpointResult; retry: string[] | null } {
  const ac = d.session.academy!;
  const run = d.session.quiz!;
  const prev = ac.checkpoints[step.checkpointId];
  const first = !prev;
  const result: CheckpointResult = prev
    ? { ...prev, attempts: prev.attempts + 1, passed: prev.passed || tally.passed, missedIds: tally.missedIds }
    : {
        checkpointId: step.checkpointId,
        attempts: 1,
        total: tally.total,
        firstTryCorrect: tally.correct,
        firstTryPassed: tally.passed,
        firstTryPerfect: tally.correct === tally.total && tally.total > 0,
        passed: tally.passed,
        missedIds: tally.missedIds,
      };
  ac.checkpoints[step.checkpointId] = result;
  ctx.emit('mission.checkpointResult', { checkpointId: step.checkpointId, correct: tally.correct, total: tally.total, passed: tally.passed, firstTry: first });
  ctx.emit('quiz.finished', { checkpointId: step.checkpointId, context: 'lesson', correct: tally.correct, total: tally.total, passed: tally.passed, attempt: run.attempt });

  const mp = d.progress.modules[ac.moduleId];
  if (mp && first) {
    const ratio = tally.total ? tally.correct / tally.total : 0;
    mp.bestCheckpoint = Math.max(mp.bestCheckpoint ?? 0, ratio);
    mp.bestScore = Math.max(mp.bestScore ?? 0, Math.round(ratio * 100));
  }

  if (tally.passed) {
    run.finished = true;
    d.session.quiz = null;
    if (d.ui.overlay.kind === 'quiz') d.ui.overlay = { kind: 'none' };
    return { result, retry: null };
  }
  const retry = retryPaper(ac.moduleId, tally.missedIds, `${run.attempt}`);
  startCheckpointQuiz(d, step, run.attempt + 1, retry);
  return { result, retry };
}

export { tallyQuiz };
