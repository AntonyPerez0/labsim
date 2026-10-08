/**
 * Quiz overlay (`ui.overlay.kind === 'quiz'`): Academy checkpoints (CP-M##.#, pass ≥ 80 %), reviews,
 * Arcade quiz items and practice papers. Questions with feedback, then a results card with the missed
 * items' explanations and Retry (checkpoint re-run paper) / Continue.
 */
import { useState } from 'react';
import { useGame } from '@/core/store';
import type { QuizContext } from '@/core/state';
import type { QuizFinishResult } from '@/missions';
import { correctAnswerText, MODULES, MODULES_BY_ID, questionById } from '@/content';
import { Button, Icon, Modal } from '@/ui/kit';
import { closeOverlay, currentOverlay } from '@/ui/services/nav';
import { pct } from '@/ui/services/format';
import { uiSound } from '@/ui/services/sound';
import { pushToast } from '@/ui/services/toasts';
import { QuizRunner } from './QuizRunner';

function titleFor(context: QuizContext, checkpointId: string | null, fallback: string | null, ids: string[]): string {
  if (fallback) return fallback;
  if (!checkpointId) {
    const key = [...ids].sort().join();
    const m = MODULES.find((x) => x.checkpointId && [...x.checkpointQuestionIds].sort().join() === key);
    if (m) checkpointId = m.checkpointId!;
  }
  if (checkpointId) {
    const m = /^CP-(M\d\d)/.exec(checkpointId);
    const meta = m ? MODULES_BY_ID[m[1]!] : null;
    return `Checkpoint ${checkpointId}${meta?.checkpointTitle ? ` · ${meta.checkpointTitle}` : ''}`;
  }
  return context === 'review' ? 'Review' : context === 'arcade' ? 'Quick check' : context === 'drill' ? 'Speed Quiz' : 'Quiz';
}

export function QuizOverlay({ questionIds, context }: { questionIds: string[]; context: QuizContext }) {
  const run = useGame((s) => s.session.quiz);
  const [result, setResult] = useState<QuizFinishResult | null>(null);
  const [round, setRound] = useState(0);
  const ids = run && run.questionIds.length ? run.questionIds : questionIds;
  const title = titleFor(context, run?.checkpointId ?? null, run?.title ?? null, ids);
  const passRatio = run?.passRatio ?? 0.8;

  const close = () => {
    if (currentOverlay().kind === 'quiz') closeOverlay({ lock: true });
  };

  return (
    <Modal width={820} backdrop="blur" className="qz-modal" labelledBy="quiz-title">
      {result ? (
        <div className="qz-res">
          <div className={`qz-res__badge ${result.passed ? 'is-pass' : 'is-fail'}`}>
            <Icon name={result.passed ? 'check' : 'refresh'} size={28} stroke={2.4} />
          </div>
          <h2 id="quiz-title">{result.passed ? (result.correct === result.total ? 'Perfect score' : 'Checkpoint passed') : 'Not yet — let’s review'}</h2>
          <div className="qz-res__score tnum">
            {result.correct} / {result.total} <span className="muted">· {pct(result.total ? result.correct / result.total : 0)}</span>
          </div>
          <div className="muted">
            {title} · pass mark {pct(passRatio)}
            {result.attempt > 1 ? ` · attempt ${result.attempt}` : ''}
          </div>
          {result.missedIds.length ? (
            <div className="qz-res__missed">
              <div className="caps">Review what you missed</div>
              {result.missedIds.map((id) => {
                const q = questionById(id);
                if (!q) return null;
                return (
                  <div key={id} className="qz-res__item">
                    <div className="qz-res__q">{q.prompt}</div>
                    <div className="qz-res__a">
                      <Icon name="check" size={13} /> {correctAnswerText(q)}
                    </div>
                    <div className="qz-res__e">{q.explanation}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div className="qz-res__actions">
            {!result.passed && result.retryQuestionIds?.length ? (
              <Button
                variant="primary"
                icon="refresh"
                onClick={() => {
                  setResult(null);
                  setRound((r) => r + 1);
                }}
              >
                Retry checkpoint
              </Button>
            ) : (
              <Button
                variant="primary"
                iconRight="arrow-right"
                onClick={() => {
                  uiSound('ui-click');
                  close();
                }}
                autoFocus
              >
                Continue
              </Button>
            )}
          </div>
        </div>
      ) : (
        <QuizRunner
          key={`${round}-${run?.attempt ?? 0}`}
          questionIds={ids}
          context={context}
          title={title}
          subtitle={context === 'lesson' ? 'Wrong answers show the curriculum explanation. You need 80 % to pass.' : undefined}
          onDone={(r) => {
            uiSound(r.passed ? 'ui-success' : 'ui-fail');
            // The runtime may already have moved on (closed the overlay / started the re-run paper).
            if (currentOverlay().kind === 'quiz') setResult(r);
            else if (r.total > 0)
              // No results card then: still tell the player how it went.
              pushToast({
                kind: r.passed ? 'success' : 'warning',
                title: r.passed ? (r.correct === r.total ? 'Perfect score' : `${title.startsWith('Checkpoint') ? 'Checkpoint' : 'Quiz'} passed`) : 'Not passed yet',
                body: `${r.correct} / ${r.total} correct · ${pct(r.correct / r.total)}`,
                icon: r.passed ? 'check' : 'refresh',
              });
          }}
        />
      )}
    </Modal>
  );
}
