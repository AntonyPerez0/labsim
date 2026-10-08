/**
 * Objective tracker (top-right): `session.objectives` with done / failed / progress states, the
 * Academy step counter, hint ladder text and the Hint (H) / Show me / Force health check buttons.
 */
import { store, useGame, useGameShallow } from '@/core/store';
import { MODULES_BY_ID } from '@/content';
import { Button, Icon, Kbd } from '@/ui/kit';
import { ma, mq } from '@/ui/services/missions';
import { pushToast } from '@/ui/services/toasts';
import { shortTitle } from '@/ui/services/format';

export function requestHintFromHud(): void {
  const text = ma('requestHint');
  if (typeof text === 'string' && text) {
    // The Academy shows the hint in the tracker; elsewhere surface it as a toast.
    if (!store.getState().session.academy) pushToast({ kind: 'info', title: 'Hint', body: text, icon: 'hint' });
  } else if (text === null) {
    pushToast({ kind: 'info', title: 'No hint right now', body: 'Keep going — hints unlock as time passes on a step.', icon: 'hint' });
  }
}

export function ObjectiveTracker() {
  const objectives = useGameShallow((s) => s.session.objectives);
  const mode = useGame((s) => s.session.mode);
  const activityId = useGame((s) => s.session.activityId);
  const academy = useGame((s) => s.session.academy);
  const hideText = useGame((s) => s.session.shift?.rules.hudObjectives === false);
  if (!objectives.length && !academy) return null;

  const moduleId = academy?.moduleId ?? (mode === 'academy' ? activityId : null);
  const meta = moduleId ? MODULES_BY_ID[moduleId] : null;
  const stepCount = moduleId ? (mq('lesson', [moduleId], null)?.steps.length ?? null) : null;
  const showMe = !!academy && academy.stepKind === 'computer-task' && !academy.showMeUsed && (academy.idleS >= 180 || academy.stepElapsedS >= 180);
  const doneCount = objectives.filter((o) => o.done).length;

  return (
    <section className="hud-objectives" aria-label="Objectives">
      <header className="hud-objectives__head">
        <span className="hud-objectives__mode">{mode === 'academy' ? 'Academy' : mode === 'freeplay' ? 'Free Play' : mode === 'certification' ? 'Certification' : 'Objectives'}</span>
        {meta ? (
          <span className="hud-objectives__module">
            <span className="mono">{meta.id}</span> {shortTitle(meta.title)}
          </span>
        ) : null}
        <span className="spacer" />
        {academy ? (
          <span className="hud-objectives__step tnum">
            Step {academy.stepIndex + 1}
            {stepCount ? ` / ${stepCount}` : ''}
          </span>
        ) : objectives.length > 1 ? (
          <span className="hud-objectives__step tnum">
            {doneCount}/{objectives.length}
          </span>
        ) : null}
      </header>
      {stepCount && academy ? (
        <div className="hud-objectives__progress">
          <span style={{ width: `${Math.min(100, (academy.stepIndex / stepCount) * 100)}%` }} />
        </div>
      ) : null}
      <ul className="hud-objectives__list">
        {objectives.map((o) => (
          <li key={o.id} className={`hud-obj${o.done ? ' is-done' : ''}${o.failed ? ' is-failed' : ''}`}>
            <span className="hud-obj__box">{o.done ? <Icon name="check" size={12} stroke={3} /> : o.failed ? <Icon name="x" size={12} stroke={3} /> : null}</span>
            <span className="hud-obj__text">{o.hidden || hideText ? <span className="hud-obj__hidden">Objective hidden</span> : o.text}</span>
            {o.progress ? (
              <span className="hud-obj__progress tnum">
                {o.progress[0]}/{o.progress[1]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {academy?.hintText ? (
        <div className="hud-objectives__hint" key={academy.hintTier}>
          <Icon name="hint" size={14} />
          <span>{academy.hintText}</span>
        </div>
      ) : null}
      {academy?.breadcrumb ? <div className="hud-objectives__crumb">Follow the breadcrumb line on the floor.</div> : null}
      {academy ? (
        <footer className="hud-objectives__actions">
          <Button size="sm" variant="game" icon="hint" kbd="H" onClick={requestHintFromHud}>
            Hint
          </Button>
          {showMe ? (
            <Button size="sm" variant="game" icon="eye" onClick={() => ma('showMe')} title="Plays a ghost-cursor demo (−50 % XP for this step)">
              Show me
            </Button>
          ) : null}
          {academy.fastForwardOffered ? (
            <Button size="sm" variant="game" icon="fast-forward" onClick={() => ma('fastForward', 'next-health-check')} title="Tutorial affordance: jump to Orca's next 5-minute health check">
              Force health check
            </Button>
          ) : null}
          {academy.hintsUsedTotal ? <span className="hud-objectives__hints-used">{academy.hintsUsedTotal} hint{academy.hintsUsedTotal === 1 ? '' : 's'} used</span> : null}
        </footer>
      ) : null}
      {!academy && objectives.length ? (
        <footer className="hud-objectives__keys">
          <Kbd k="H" size="sm" /> hint
        </footer>
      ) : null}
    </section>
  );
}
