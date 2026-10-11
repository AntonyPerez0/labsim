/**
 * Main-menu "Start here" card: the one next module — mentor, time, what you'll learn — behind one big
 * button, with the Curriculum map one click away. Once the Academy is complete it points at
 * Certification and the Practice hub instead. Plus the gentle "keep coach tips?" offer once the
 * hand-holding has tapered off.
 */
import { mutate, useGame } from '@/core/store';
import { personName, teamMember } from '@/content';
import { Avatar, Button, Card, Chip, Icon, ProgressBar } from '@/ui/kit';
import { goMenu } from '@/ui/services/nav';
import { estLabel } from '@/ui/services/format';
import { continueGame } from '@/ui/services/continue';
import { isModuleComplete, modulesCompleted } from '@/ui/data/views';
import { curriculumRows, curriculumTotals, hoursLabel, startHere } from './curriculum';
import { isTapered } from './coach/tips';
import './guide.css';

export function StartHereCard() {
  const progress = useGame((s) => s.progress);
  const sh = startHere(progress);
  const totals = curriculumTotals(curriculumRows(progress));

  if (!sh) {
    return (
      <Card className="start-here is-complete">
        <div className="caps">Academy complete</div>
        <div className="start-here__title">All {totals.total} modules done — the lab is yours.</div>
        <p className="start-here__learn muted">Keep it sharp: drills, flashcards and shifts are in Practice; the certification exams turn it into rank.</p>
        <div className="start-here__actions">
          <Button variant="primary" size="lg" icon="award" onClick={() => goMenu('certification')}>
            Certification
          </Button>
          <Button size="lg" icon="target" onClick={() => goMenu('practice')}>
            Practice
          </Button>
        </div>
      </Card>
    );
  }

  const { meta } = sh;
  const mentor = teamMember(meta.mentor);
  const started = !!progress.modules[meta.id];
  const label = sh.resume ? 'Continue' : sh.firstTime ? 'Start your first day' : started ? 'Resume module' : 'Start module';
  return (
    <Card className={`start-here${sh.firstTime ? ' is-first' : ''}`}>
      <div className="start-here__eyebrow">
        <span className="start-here__badge">
          <Icon name={sh.firstTime ? 'sparkle' : 'play'} size={12} />
          {sh.firstTime ? 'Start here' : sh.resume ? 'Pick up where you left off' : 'Next up'}
        </span>
        <span className="mono dim">{meta.id}</span>
        <span className="spacer" />
        <Chip size="sm" icon="clock">
          {estLabel(meta)}
        </Chip>
      </div>
      <div className="start-here__title">{meta.title}</div>
      <div className="start-here__mentor">
        <Avatar name={personName(meta.mentor)} color={mentor?.color ?? '#43b02a'} size={30} />
        <span>
          with <strong>{personName(meta.mentor)}</strong>
          {mentor?.role ? <span className="muted"> · {mentor.role}</span> : null}
        </span>
      </div>
      <p className="start-here__learn">
        <span className="caps">You’ll learn</span> {sh.learn}
      </p>
      <div className="start-here__actions">
        <Button variant="primary" size="lg" icon="play" className="start-here__go" data-coach="start-here" onClick={() => continueGame(progress)} autoFocus={sh.firstTime}>
          {label}
        </Button>
        <Button variant="ghost" icon="map" onClick={() => goMenu('curriculum')}>
          Curriculum map
        </Button>
      </div>
      <div className="start-here__foot">
        <ProgressBar value={totals.done / Math.max(1, totals.total)} height={4} glow />
        <span className="muted tnum">
          {totals.done}/{totals.total} modules · about {hoursLabel(totals.minutesLeft)} to go
        </span>
      </div>
    </Card>
  );
}

/** "You're past the basics — keep the coach tips?" (once, after M04 / four modules). */
export function CoachTaperOffer() {
  const show = useGame((s) => s.progress.settings.coachTips && !s.progress.flags['coach:offer'] && isTapered({ modulesDone: modulesCompleted(s.progress), m04Done: isModuleComplete(s.progress, 'M04') }));
  if (!show) return null;
  const answer = (keep: boolean) =>
    mutate((s) => {
      s.progress.flags['coach:offer'] = true;
      if (!keep) s.progress.settings.coachTips = false;
    });
  return (
    <Card className="coach-offer" role="region" aria-label="Coach tips">
      <Icon name="hint" size={18} />
      <div className="grow">
        <div className="coach-offer__title">You’ve got the basics</div>
        <div className="muted">From now on, coach tips only appear the first time you open a new app or screen. Keep them, or switch them off?</div>
      </div>
      <div className="coach-offer__actions">
        <Button size="sm" onClick={() => answer(true)}>
          Keep tips
        </Button>
        <Button size="sm" variant="ghost" onClick={() => answer(false)}>
          Turn off
        </Button>
      </div>
    </Card>
  );
}
