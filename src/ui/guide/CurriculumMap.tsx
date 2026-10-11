/**
 * Curriculum map (main menu → Curriculum map): all 18 modules in order, grouped by track, each with its
 * state (done / next / in progress / available / locked by prerequisites), estimated time, the one-line
 * "what you'll learn", what it unlocks (modes, drills, incidents) and one action. Total time remaining
 * on top. Every row's action is a real button (keyboard and touch friendly).
 */
import { useEffect, useRef, type Ref } from 'react';
import { useGame } from '@/core/store';
import { MODULES_BY_ID, personName } from '@/content';
import { Button, Chip, Icon, ProgressBar, Stars } from '@/ui/kit';
import { resumeAcademy, startModule } from '@/ui/services/actions';
import { goMenu } from '@/ui/services/nav';
import { estLabel, shortTitle } from '@/ui/services/format';
import { curriculumRows, curriculumTotals, hoursLabel, MODULE_PRACTICE, TRACKS, type CurriculumRow, type CurriculumState } from './curriculum';
import './guide.css';

const STATE_LABEL: Record<CurriculumState, string> = {
  done: 'Done',
  next: 'Next',
  'in-progress': 'In progress',
  available: 'Available',
  locked: 'Locked',
};

const STATE_ICON: Record<CurriculumState, string> = {
  done: 'check',
  next: 'play',
  'in-progress': 'clock',
  available: 'unlock',
  locked: 'lock',
};

export function CurriculumMap() {
  const progress = useGame((s) => s.progress);
  const rows = curriculumRows(progress);
  const totals = curriculumTotals(rows);
  const nextRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    // Bring the next module into view on small screens.
    nextRef.current?.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  }, []);

  return (
    <div className="menu__page curr">
      <header className="curr__head">
        <div>
          <h1 className="menu__h1">Curriculum map</h1>
          <p className="muted menu__lead">Eighteen guided modules, in order. Each has a mentor, takes 12–25 minutes and ends with a short checkpoint quiz. Finishing one unlocks the next and new Arcade content.</p>
        </div>
        <div className="curr__totals" aria-label="Progress">
          <div>
            <span className="curr__big tnum">{totals.done}</span>
            <span className="muted">/{totals.total} done</span>
          </div>
          <div>
            <Icon name="clock" size={14} /> <span className="tnum">{hoursLabel(totals.minutesLeft)}</span> <span className="muted">left of {hoursLabel(totals.minutesTotal)}</span>
          </div>
        </div>
      </header>
      <ProgressBar value={totals.done / Math.max(1, totals.total)} height={5} glow />
      <div className="curr__legend" aria-hidden>
        {(['done', 'next', 'available', 'locked'] as const).map((s) => (
          <span key={s} className={`curr__legend-item curr-st--${s}`}>
            <span className="curr__dot">
              <Icon name={STATE_ICON[s]} size={11} stroke={2.6} />
            </span>
            {STATE_LABEL[s]}
          </span>
        ))}
      </div>
      {TRACKS.map((t, ti) => {
        const trackRows = rows.filter((r) => t.ids.includes(r.meta.id));
        const mins = trackRows.reduce((a, r) => a + r.minutes, 0);
        const done = trackRows.filter((r) => r.state === 'done').length;
        return (
          <section key={t.title} className="curr__track" aria-labelledby={`curr-track-${ti}`}>
            <div className="curr__track-head">
              <span className="curr__track-title" id={`curr-track-${ti}`}>
                {t.title}
              </span>
              <span className="muted curr__track-sub">{t.sub}</span>
              <span className="spacer" />
              <span className="muted tnum">
                {done}/{trackRows.length} · {hoursLabel(mins)}
              </span>
            </div>
            <ol className="curr__list">
              {trackRows.map((r) => (
                <ModuleRow key={r.meta.id} row={r} rowRef={r.state === 'next' ? nextRef : undefined} />
              ))}
            </ol>
          </section>
        );
      })}
      <div className="curr__foot">
        <Button variant="ghost" icon="graduation" onClick={() => goMenu('academy')}>
          Module briefings (Academy)
        </Button>
        <Button variant="ghost" icon="target" onClick={() => goMenu('practice')}>
          Practice hub
        </Button>
      </div>
    </div>
  );
}

function ModuleRow({ row: r, rowRef }: { row: CurriculumRow; rowRef?: Ref<HTMLLIElement> }) {
  const resumable = useGame((s) => s.progress.academyCheckpoint?.moduleId === r.meta.id);
  const id = r.meta.id;
  const practice = MODULE_PRACTICE[id] ?? [];
  const otherUnlocks = r.unlocks.filter((u) => !r.unlockModes.includes(u));
  return (
    <li ref={rowRef} className={`curr-row curr-st--${r.state}`} data-coach={r.state === 'next' ? 'curr-next' : undefined}>
      <span className="curr__dot curr-row__dot" title={STATE_LABEL[r.state]}>
        <Icon name={STATE_ICON[r.state]} size={12} stroke={2.6} />
      </span>
      <div className="curr-row__main">
        <div className="curr-row__top">
          <span className="mono curr-row__id">{id}</span>
          <span className="curr-row__title">{shortTitle(r.meta.title)}</span>
          {r.state === 'next' ? (
            <Chip size="sm" tone="green" solid>
              Next
            </Chip>
          ) : r.state === 'in-progress' ? (
            <Chip size="sm" tone="amber">
              In progress
            </Chip>
          ) : null}
          {r.state === 'done' && r.stars ? <Stars value={r.stars} size={11} /> : null}
        </div>
        <div className="curr-row__learn">{r.learn}</div>
        <div className="curr-row__meta">
          <span className="curr-row__time">
            <Icon name="clock" size={12} /> {estLabel(r.meta)}
          </span>
          <span className="muted">with {personName(r.meta.mentor)}</span>
          {r.state === 'locked' ? (
            <span className="curr-row__needs">
              <Icon name="lock" size={12} /> Needs {r.missing.length > 4 ? `${r.missing.length} modules` : r.missing.map((m) => `${m} ${shortTitle(MODULES_BY_ID[m]?.title ?? '')}`).join(', ')}
            </span>
          ) : null}
        </div>
        {r.unlockModes.length || otherUnlocks.length || practice.length ? (
          <div className="curr-row__unlocks">
            <span className="caps">Unlocks</span>
            {r.unlockModes.map((u) => (
              <Chip key={u} size="sm" tone="gold">
                {u}
              </Chip>
            ))}
            {otherUnlocks.map((u) => (
              <Chip key={u} size="sm" tone="cyan">
                {u}
              </Chip>
            ))}
            {practice.map((p) => (
              <Chip key={p} size="sm" tone="violet" icon="target" title="Repeatable code exercises at the workstation (Practice hub)">
                {p === 'parrot' ? 'Parrot Practice' : 'UIA Practice'}
              </Chip>
            ))}
          </div>
        ) : null}
      </div>
      <div className="curr-row__action">
        {r.state === 'locked' ? (
          <Button size="sm" variant="subtle" icon="lock" disabled aria-label={`${id} locked`}>
            Locked
          </Button>
        ) : resumable ? (
          <Button size="sm" variant="primary" icon="play" onClick={() => (resumeAcademy() ? undefined : startModule(id))} aria-label={`Continue ${id}`}>
            Continue
          </Button>
        ) : r.state === 'done' ? (
          <Button size="sm" variant="ghost" icon="refresh" onClick={() => startModule(id, true)} aria-label={`Replay ${id}`}>
            Replay
          </Button>
        ) : (
          <Button size="sm" variant={r.state === 'next' ? 'primary' : 'secondary'} icon="play" onClick={() => startModule(id)} aria-label={`Start ${id}`}>
            Start
          </Button>
        )}
      </div>
    </li>
  );
}
