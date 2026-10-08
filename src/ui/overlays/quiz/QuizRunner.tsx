/**
 * Quiz runner: one question at a time with immediate feedback (explanation, correct answer, facts and
 * the curriculum Teach Card for a wrong answer), then a results card. Drives `session.quiz` through the
 * mission runtime (`answerQuiz` / `nextQuizQuestion` / `finishQuiz`); when the runtime is missing it
 * grades locally with the content helpers (practice mode — nothing is recorded).
 *
 * `feedback: false` (exam papers) records answers without revealing correctness.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import type { QuizAnswerValue, QuizContext } from '@/core/state';
import type { QuizAnswerResult, QuizFinishResult } from '@/missions';
import { correctAnswerText, factById, gradeQuestion, questionById, type QuizQuestion } from '@/content';
import { Button, Chip, Icon, IllustrativeBadge, ProgressBar } from '@/ui/kit';
import { hasMission, mq } from '@/ui/services/missions';
import { mmss } from '@/ui/services/format';
import { uiSound } from '@/ui/services/sound';
import { TeachCardView } from '@/ui/hud/TeachCard';
import { QuestionInput } from './QuestionInputs';

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function itemCount(q: QuizQuestion): number {
  return q.type === 'match' ? (q.pairs?.length ?? 0) : (q.options?.length ?? 0);
}

/** Local grading (no runtime): converts the runtime answer shape to the content grader's shape. */
function gradeLocally(q: QuizQuestion, v: QuizAnswerValue): QuizAnswerResult {
  let graded: number | number[] | string | string[];
  if (q.type === 'match' && Array.isArray(v)) graded = (v as [string, string][]).map(([, r]) => r);
  else graded = v as number | number[] | string | string[];
  const correct = gradeQuestion(q, graded);
  return { correct, explanation: q.explanation, correctText: correctAnswerText(q), factIds: q.factIds, teach: null };
}

/** Keyboard help for the unanswered question (per input type). */
function inputHint(q: QuizQuestion): string {
  switch (q.type) {
    case 'tf':
      return 'T / F or 1–2 to answer';
    case 'order':
      return 'Drag the rows, or focus a row and use Alt+↑ / Alt+↓ · Enter submits';
    case 'match':
      return 'Pick a partner for every row · Enter submits';
    case 'fill':
      return 'Type the answer · Enter submits';
    default:
      return q.answers ? 'Keys A–F toggle options · Enter submits' : 'Keys 1–4 or A–D pick an option';
  }
}

export interface QuizRunnerProps {
  questionIds: string[];
  context: QuizContext;
  title: string;
  subtitle?: string;
  /** Reveal correctness after each answer (false for exam papers). */
  feedback?: boolean;
  /** Called after the last question (with the runtime's finish result when available). */
  onDone: (r: QuizFinishResult) => void;
  /** Extra header content (exam timer etc.). */
  headerRight?: React.ReactNode;
}

export function QuizRunner({ questionIds, context, title, subtitle, feedback = true, onDone, headerRight }: QuizRunnerProps) {
  const run = useGame((s) => s.session.quiz);
  const live = !!run && hasMission('answerQuiz') && run.questionIds.join() === questionIds.join();
  const [localIndex, setLocalIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, boolean>>({});
  const index = live ? run.index : localIndex;
  const qid = questionIds[Math.min(index, questionIds.length - 1)] ?? '';
  const q = questionById(qid);
  const perm = useMemo(() => {
    if (!q) return [];
    const fromRun = run?.shuffles[qid];
    if (live && fromRun && fromRun.length === itemCount(q)) return fromRun;
    return q.type === 'tf' ? [0, 1] : shuffle(itemCount(q));
  }, [qid, q, live]); // eslint-disable-line react-hooks/exhaustive-deps
  // The answer belongs to one question (and attempt): keyed so the first render of the next question
  // never sees the previous answer (an ordering answer fed to a matching input crashed it).
  const answerKey = `${qid}#${run?.attempt ?? 0}`;
  const [answer, setAnswer] = useState<{ key: string; value: QuizAnswerValue; result: QuizAnswerResult } | null>(null);
  const submitted = answer && answer.key === answerKey ? answer.value : null;
  const result = answer && answer.key === answerKey ? answer.result : null;

  const submit = useCallback(
    (v: QuizAnswerValue) => {
      if (!q || submitted !== null) return;
      const r: QuizAnswerResult = live ? (mq('answerQuiz', [q.id, v, context], null as unknown as QuizAnswerResult) ?? gradeLocally(q, v)) : gradeLocally(q, v);
      setAnswer({ key: answerKey, value: v, result: r });
      if (!live) setLocalAnswers((a) => ({ ...a, [q.id]: r.correct }));
      if (feedback) uiSound(r.correct ? 'ui-success' : 'ui-fail', 0.6);
      else uiSound('ui-click');
    },
    [q, submitted, live, context, feedback, answerKey],
  );

  const isLast = index >= questionIds.length - 1;
  const next = useCallback(() => {
    if (submitted === null) return;
    if (isLast) {
      const correct = live ? Object.values(run!.answers).filter((a) => a.correct).length : Object.values(localAnswers).filter(Boolean).length;
      const fallback: QuizFinishResult = {
        checkpointId: run?.checkpointId ?? null,
        correct,
        total: questionIds.length,
        passed: correct / Math.max(1, questionIds.length) >= (run?.passRatio ?? 0.8),
        attempt: run?.attempt ?? 1,
        missedIds: questionIds.filter((id) => (live ? run!.answers[id] && !run!.answers[id]!.correct : localAnswers[id] === false)),
        retryQuestionIds: null,
        checkpoint: null,
      };
      const r = live ? (mq('finishQuiz', [], fallback) ?? fallback) : fallback;
      onDone(r);
      return;
    }
    if (live) mq('nextQuizQuestion', [], undefined as unknown as void);
    else setLocalIndex((i) => i + 1);
  }, [submitted, isLast, live, run, localAnswers, questionIds, onDone]);

  // Enter / Space → next once answered.
  useEffect(() => {
    if (submitted === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || (e.key === ' ' && (e.target as HTMLElement)?.tagName !== 'BUTTON')) {
        e.preventDefault();
        next();
      }
    };
    const t = setTimeout(() => window.addEventListener('keydown', onKey), 120);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [submitted, next]);

  if (!q) {
    return (
      <div className="qz">
        <div className="qz__missing">Question {qid} is not in the bank.</div>
        <Button onClick={() => onDone({ checkpointId: null, correct: 0, total: 0, passed: true, attempt: 1, missedIds: [], retryQuestionIds: null, checkpoint: null })}>Close</Button>
      </div>
    );
  }

  const showFeedback = feedback && result !== null;
  const facts = (result?.factIds ?? q.factIds).map((f) => factById(f)).filter(Boolean);
  const timeLeft = live ? run.timeLeftS : null;

  return (
    <div className="qz">
      <header className="qz__head">
        <div className="grow">
          <div className="qz__eyebrow">
            {title}
            {run && run.attempt > 1 && live ? <Chip size="sm" tone="amber">Attempt {run.attempt}</Chip> : null}
            {!live && context !== 'cert' ? <Chip size="sm" tone="grey">Practice — not recorded</Chip> : null}
          </div>
          {subtitle ? <div className="qz__sub">{subtitle}</div> : null}
        </div>
        {timeLeft !== null && timeLeft !== undefined ? (
          <span className={`qz__timer tnum${timeLeft < 30 ? ' is-low' : ''}`}>
            <Icon name="clock" size={14} /> {mmss(timeLeft)}
          </span>
        ) : null}
        {headerRight}
        <span className="qz__count tnum">
          {index + 1} / {questionIds.length}
        </span>
      </header>
      <ProgressBar value={(index + (submitted !== null ? 1 : 0)) / questionIds.length} height={3} />
      <div className="qz__body" key={qid}>
        <div className="qz__meta">
          <span className="mono dim">{q.id}</span>
          <span className="qz__type">{q.type === 'mc' ? (q.answers ? 'Multiple select' : 'Multiple choice') : q.type === 'tf' ? 'True or false' : q.type === 'order' ? 'Ordering' : q.type === 'match' ? 'Matching' : 'Fill in'}</span>
          {q.illustrative ? <IllustrativeBadge /> : null}
          <span className="spacer" />
          <span className="qz__diff" title={`Difficulty ${q.difficulty}`}>
            {[1, 2, 3].map((d) => (
              <span key={d} className={d <= q.difficulty ? 'is-on' : ''} />
            ))}
          </span>
        </div>
        <h2 className="qz__prompt">{q.prompt}</h2>
        <QuestionInput q={q} perm={perm} locked={submitted !== null} submitted={submitted} correct={showFeedback ? result!.correct : null} onSubmit={submit} />
        {showFeedback ? (
          <div className={`qz-fb ${result!.correct ? 'is-right' : 'is-wrong'}`}>
            <div className="qz-fb__verdict">
              <Icon name={result!.correct ? 'check' : 'x'} size={18} stroke={2.6} />
              {result!.correct ? 'Correct' : 'Not quite'}
            </div>
            {!result!.correct && q.type !== 'match' && q.type !== 'order' && !(result!.teach && result!.teach.whatHappened.includes(result!.correctText)) ? (
              <div className="qz-fb__answer">
                Answer: <strong>{result!.correctText}</strong>
              </div>
            ) : null}
            {result!.teach && !result!.correct ? (
              <TeachCardView card={result!.teach} compact showActions={false} />
            ) : (
              <p className="qz-fb__expl">{result!.explanation}</p>
            )}
            {facts.length ? (
              <div className="qz-fb__facts">
                {facts.map((f) => (
                  <span key={f!.id} className="qz-fb__fact" title={f!.text}>
                    <span className="mono">{f!.id}</span> {f!.text.length > 110 ? `${f!.text.slice(0, 110)}…` : f!.text}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        ) : submitted !== null && !feedback ? (
          <div className="qz-fb qz-fb--neutral">Answer recorded.</div>
        ) : null}
      </div>
      <footer className="qz__foot">
        <span className="muted">{submitted === null ? inputHint(q) : 'Enter or Space for the next question'}</span>
        <span className="spacer" />
        {submitted !== null ? (
          <Button variant="primary" iconRight="arrow-right" kbd="Enter" onClick={next} autoFocus>
            {isLast ? 'Finish' : 'Next'}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}
