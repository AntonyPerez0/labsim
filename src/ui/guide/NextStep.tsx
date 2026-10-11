/**
 * "What should I do next?" — always one tap away during play: a chip under the objective tracker
 * (HUD) that opens a small card, and the same card in the pause menu. It repeats the current
 * objective and the latest hint, offers the hint ladder (H), and outside lessons suggests the next
 * Academy module or practice.
 */
import { useState } from 'react';
import { useGame } from '@/core/store';
import { Button, Icon } from '@/ui/kit';
import { requestHintFromHud } from '@/ui/hud/Objectives';
import { mq } from '@/ui/services/missions';
import { openOverlay } from '@/ui/services/nav';
import { startModule } from '@/ui/services/actions';
import { estLabel, shortTitle } from '@/ui/services/format';
import { startHere } from './curriculum';
import './guide.css';

const MODE_LABEL: Record<string, string> = {
  academy: 'Academy lesson',
  'arcade-shift': 'Shift',
  'arcade-drill': 'Drill',
  'arcade-weakspot': 'Weak Spot',
  freeplay: 'Free Play',
  certification: 'Certification',
};

function NextStepBody({ compact }: { compact?: boolean }) {
  const mode = useGame((s) => s.session.mode);
  const objective = useGame((s) => s.session.objectives.find((o) => !o.done && !o.failed && !o.hidden)?.text ?? null);
  const inAcademy = useGame((s) => !!s.session.academy);
  const hint = useGame((s) => s.session.academy?.hintText ?? null);
  const hasShift = useGame((s) => !!s.session.shift);
  const progress = useGame((s) => s.progress);
  const next = mode === 'freeplay' ? startHere(progress) : null;
  const due = mode === 'freeplay' ? mq('dueFlashcards', [], []).length : 0;

  return (
    <div className={`next-card${compact ? ' is-compact' : ''}`}>
      <div className="next-card__eyebrow">
        <Icon name="target" size={13} /> {MODE_LABEL[mode] ?? 'Now'}
      </div>
      <div className="next-card__goal">{objective ?? (mode === 'freeplay' ? 'No goal here — explore, or break something on purpose and fix it.' : 'Nothing to do right now — keep going.')}</div>
      {hint ? (
        <div className="next-card__hint">
          <Icon name="hint" size={13} /> <span>{hint}</span>
        </div>
      ) : null}
      <div className="next-card__actions">
        {inAcademy || hasShift || (objective && mode !== 'freeplay') ? (
          <Button size="sm" variant="game" icon="hint" kbd="H" onClick={requestHintFromHud}>
            {hint ? 'More specific hint' : 'Give me a hint'}
          </Button>
        ) : null}
        {hasShift ? (
          <Button size="sm" icon="ticket" kbd="T" onClick={() => openOverlay({ kind: 'tickets' })}>
            Ticket board
          </Button>
        ) : null}
        {next ? (
          <Button size="sm" variant="primary" icon="graduation" onClick={() => startModule(next.moduleId)} title={next.learn}>
            {next.resume ? 'Continue' : 'Start'} {next.moduleId} {shortTitle(next.meta.title)} · {estLabel(next.meta)}
          </Button>
        ) : null}
        {due ? (
          <Button size="sm" icon="cards" onClick={() => openOverlay({ kind: 'flashcards' }, { push: true })}>
            {due} flashcard{due === 1 ? '' : 's'} due
          </Button>
        ) : null}
        {mode === 'freeplay' ? (
          <Button size="sm" icon="sandbox" kbd="F10" onClick={() => openOverlay({ kind: 'sandbox' })}>
            Sandbox panel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** HUD chip (top-right, under the objectives). */
export function NextStepChip() {
  const [open, setOpen] = useState(false);
  const mode = useGame((s) => s.session.mode);
  if (mode === 'menu') return null;
  return (
    <div className="next-step" data-ui-interactive>
      <button type="button" className={`next-step__chip${open ? ' is-open' : ''}`} data-coach="next-step" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'x' : 'hint'} size={14} />
        <span>{open ? 'Close' : 'What next?'}</span>
      </button>
      {open ? <NextStepBody compact /> : null}
    </div>
  );
}

/** Pause-menu card. */
export function NextStepCard() {
  const mode = useGame((s) => s.session.mode);
  if (mode === 'menu') return null;
  return (
    <section className="next-step next-step--pause" aria-label="What should I do next?">
      <div className="caps">What should I do next?</div>
      <NextStepBody />
    </section>
  );
}
