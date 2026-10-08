/**
 * Certification overlay (`certification`, Cur §5): exam intro (eligibility, written rules, practical
 * tasks) → written paper (timed, no feedback until graded; critical facts must be answered correctly)
 * → written result → practical (tasks in the lab; exam-form answers here) → results.
 */
import { useState } from 'react';
import { useGame } from '@/core/store';
import type { CertWrittenResult } from '@/missions';
import { EXAMS_BY_ID, factById } from '@/content';
import { Button, Chip, EmptyState, Icon, Modal, TextField } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { closeOverlay, goMenu } from '@/ui/services/nav';
import { mmss } from '@/ui/services/format';
import { pushToast } from '@/ui/services/toasts';
import { QuizRunner } from './quiz/QuizRunner';

export function CertificationOverlay({ examId }: { examId: string }) {
  const cert = useGame((s) => (s.session.cert?.examId === examId ? s.session.cert : null));
  const exam = EXAMS_BY_ID[examId];
  const [written, setWritten] = useState<CertWrittenResult | null>(null);

  if (!exam) {
    return (
      <Modal width={520} onClose={() => closeOverlay()}>
        <EmptyState icon="graduation" title={`Unknown exam ${examId}`} />
      </Modal>
    );
  }

  if (!cert) return <CertIntro examId={examId} />;

  if (cert.part === 'written' && !cert.written.submitted && !written) {
    return (
      <Modal width={860} backdrop="blur" className="qz-modal">
        <QuizRunner
          questionIds={cert.written.questionIds}
          context="cert"
          title={`${exam.id} · ${exam.title} — written`}
          subtitle={`${exam.written.items} items · pass ${exam.written.passPercent} % · critical facts must be correct`}
          feedback={false}
          headerRight={
            <span className={`qz__timer tnum${cert.written.timeLeftS < 60 ? ' is-low' : ''}`}>
              <Icon name="clock" size={14} /> {mmss(cert.written.timeLeftS)}
            </span>
          }
          onDone={() => {
            const r = mq('submitWritten', [], null as unknown as CertWrittenResult);
            if (r) setWritten(r);
          }}
        />
      </Modal>
    );
  }

  const w = written ?? (cert.written.submitted ? { correct: cert.written.correct, total: cert.written.questionIds.length, pct: cert.written.pct, criticalMissed: cert.written.criticalMissed, passed: !!cert.written.passed } : null);

  return (
    <Modal width={760} backdrop="blur" onClose={cert.part === 'results' ? () => closeOverlay() : undefined}>
      <div className="ov-head">
        <Icon name="graduation" size={18} />
        <h2>
          {exam.id} · {exam.title}
        </h2>
      </div>
      {w ? (
        <div className={`cert-written ${w.passed ? 'is-pass' : 'is-fail'}`}>
          <div className="cert-written__score tnum">{Math.round(w.pct)} %</div>
          <div>
            <div>
              Written paper: {w.correct} / {w.total} — {w.passed ? 'passed' : 'not passed'} (pass mark {exam.written.passPercent} %)
            </div>
            {w.criticalMissed.length ? (
              <div className="bad">
                Critical facts missed:{' '}
                {w.criticalMissed.map((f) => (
                  <span key={f} className="mono" title={factById(f)?.text}>
                    {f}{' '}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
      {cert.part !== 'results' && w?.passed ? (
        <div className="cert-practical">
          <div className="caps">Practical · {exam.practical.minutes} min</div>
          <p className="muted">{exam.practical.summary}</p>
          <ol className="cert-tasks">
            {(cert.practical.tasks.length ? cert.practical.tasks : exam.practical.tasks.map((t) => ({ taskId: t.id, title: t.playerMust, status: 'pending' as const, answer: null, failReason: null, startedAtS: null, timeLimitS: null }))).map((t) => (
              <PracticalTask key={t.taskId} examId={examId} taskId={t.taskId} title={t.title} status={t.status} failReason={t.failReason} />
            ))}
          </ol>
          <div className="row">
            {cert.part === 'written' ? (
              <Button variant="primary" iconRight="arrow-right" onClick={() => ma('startPractical')}>
                Start the practical
              </Button>
            ) : (
              <Button variant="primary" iconRight="arrow-right" onClick={() => closeOverlay({ lock: true })}>
                Back to the lab
              </Button>
            )}
            <span className="muted">Pass: {exam.practical.pass}</span>
          </div>
        </div>
      ) : cert.part !== 'results' && w && !w.passed ? (
        <div className="row">
          <span className="muted grow">The written paper must be passed before the practical. Review the missed facts with flashcards, then retake after the cooldown.</span>
          <Button onClick={() => (ma('quit'), goMenu('certification'))}>Back to Certification</Button>
        </div>
      ) : null}
    </Modal>
  );
}

function PracticalTask({ examId, taskId, title, status, failReason }: { examId: string; taskId: string; title: string; status: string; failReason: string | null }) {
  const [answer, setAnswer] = useState('');
  const needsAnswer = /answer|record|enter|write down|report/i.test(title);
  return (
    <li className={`cert-task cert-task--${status}`}>
      <span className="cert-task__status">{status === 'passed' ? <Icon name="check" size={13} stroke={3} /> : status === 'failed' ? <Icon name="x" size={13} stroke={3} /> : null}</span>
      <div className="grow">
        <div>
          <span className="mono dim">{taskId}</span> {title}
        </div>
        {failReason ? <div className="bad">{failReason}</div> : null}
        {needsAnswer && status === 'active' ? (
          <div className="row" style={{ marginTop: 6 }}>
            <TextField value={answer} onChange={setAnswer} mono placeholder="Exam-form answer" ariaLabel={`${taskId} answer`} />
            <Button
              size="sm"
              onClick={() => {
                const r = ma('submitPracticalAnswer', taskId, answer);
                if (r && !r.ok) pushToast({ kind: 'error', title: 'Not accepted', body: r.error });
              }}
            >
              Submit
            </Button>
          </div>
        ) : null}
      </div>
      <Chip size="sm" tone={status === 'passed' ? 'green' : status === 'failed' ? 'red' : status === 'active' ? 'amber' : 'grey'}>
        {status}
      </Chip>
      <span className="sr-only">{examId}</span>
    </li>
  );
}

function CertIntro({ examId }: { examId: string }) {
  const exam = EXAMS_BY_ID[examId]!;
  const view = mq('certView', [examId], null);
  const eligible = view?.eligible ?? false;
  return (
    <Modal width={760} backdrop="blur" onClose={() => closeOverlay()}>
      <div className="ov-head">
        <Icon name="graduation" size={18} />
        <h2>
          {exam.id} · {exam.title}
        </h2>
      </div>
      <p className="muted">{exam.eligibility.text}</p>
      <div className="cert-intro">
        <div>
          <div className="caps">Written</div>
          <ul className="debrief__list">
            <li>
              {exam.written.items} items in {exam.written.minutes} minutes
            </li>
            <li>
              Pass: {exam.written.passPercent} % ({exam.written.passCount}/{exam.written.items})
            </li>
            <li>{exam.written.criticalNotes}</li>
          </ul>
        </div>
        <div>
          <div className="caps">Practical · {exam.practical.minutes} min</div>
          <ul className="debrief__list">
            {exam.practical.tasks.map((t) => (
              <li key={t.id}>
                <span className="mono dim">{t.id}</span> {t.playerMust}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {view?.missing.length ? (
        <div className="cert-missing">
          <div className="caps">Not eligible yet</div>
          <ul className="debrief__list">
            {view.missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="row" style={{ marginTop: 14 }}>
        <span className="spacer" />
        <Button
          variant="primary"
          icon="graduation"
          disabled={!hasMission('startCertification') || !eligible}
          onClick={() => {
            const r = ma('startCertification', examId);
            if (r && !r.ok) pushToast({ kind: 'error', title: 'Cannot start', body: r.error });
          }}
        >
          Start written exam
        </Button>
      </div>
    </Modal>
  );
}
