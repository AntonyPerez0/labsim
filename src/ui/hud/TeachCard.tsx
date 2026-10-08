/**
 * Teach Cards (GP §5.5): What happened · Why (fact, Ref §, illustrative badge) · Do instead ·
 * Practice / Read / Got it · mastery chip. Right-side panel in Shift (collapses to a chip after 5 s),
 * centre modal in Academy (overlay `teach-card`), inline in drills and the debrief.
 */
import { useEffect, useState } from 'react';
import { mutate, useGame } from '@/core/store';
import type { TeachCard, TeachCardContent } from '@/core/state';
import { factById } from '@/content';
import { Button, Icon, IllustrativeBadge } from '@/ui/kit';
import { ma, hasMission } from '@/ui/services/missions';
import { openOverlay } from '@/ui/services/nav';
import { tagLabel } from '@/ui/data/views';

export function dismissTeachCard(id: string): void {
  if (hasMission('dismissTeachCard')) ma('dismissTeachCard', id);
  else
    mutate((s) => {
      s.ui.teachCards = s.ui.teachCards.filter((c) => c.id !== id);
      if (s.ui.overlay.kind === 'teach-card' && s.ui.overlay.teachCardId === id) s.ui.overlay = { kind: 'none' };
    });
}

export function TeachCardView({ card, id, masteryChange, onGotIt, compact, showActions = true }: {
  card: TeachCardContent;
  id?: string;
  masteryChange?: TeachCard['masteryChange'];
  onGotIt?: () => void;
  compact?: boolean;
  showActions?: boolean;
}) {
  const facts = (card.factIds ?? []).map((f) => factById(f)).filter(Boolean);
  return (
    <div className={`teach${compact ? ' teach--compact' : ''}`}>
      <div className="teach__row teach__what">
        <span className="teach__num">1</span>
        <div>
          <div className="teach__label">What happened</div>
          <div className="teach__text">{card.whatHappened}</div>
        </div>
      </div>
      <div className="teach__row teach__why">
        <span className="teach__num">2</span>
        <div>
          <div className="teach__label">
            Why {card.ref ? <span className="teach__ref">{card.ref}</span> : null} {card.illustrative ? <IllustrativeBadge compact={compact} /> : null}
          </div>
          <div className="teach__text">{card.ref ? card.why.replace(/\s*\((?:Ref )?§[^)]*\)\s*$/, '') : card.why}</div>
          {!compact && facts.length ? (
            <div className="teach__facts">
              {facts.map((f) => (
                <span key={f!.id} className="teach__fact" title={f!.text}>
                  {f!.id}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      <div className="teach__row teach__do">
        <span className="teach__num">3</span>
        <div>
          <div className="teach__label">Do instead</div>
          <div className="teach__text teach__text--do">{card.doInstead}</div>
        </div>
      </div>
      {showActions ? (
        <div className="teach__actions">
          {card.practiceDrillId && id ? (
            <Button size="sm" icon="target" onClick={() => ma('practiceTeachCard', id)}>
              Practice <span className="mono dim">{card.practiceDrillId}</span>
            </Button>
          ) : null}
          {card.manualArticleId ? (
            <Button size="sm" icon="book" onClick={() => openOverlay({ kind: 'manual', articleId: card.manualArticleId }, { push: true })}>
              Read
            </Button>
          ) : null}
          <span className="spacer" />
          {onGotIt ? (
            <Button size="sm" variant="primary" icon="check" onClick={onGotIt}>
              Got it
            </Button>
          ) : null}
        </div>
      ) : null}
      {masteryChange ? (
        <div className="teach__mastery">
          <span className="teach__tag mono">{masteryChange.tag}</span>
          <span className="dim">{tagLabel(masteryChange.tag) !== masteryChange.tag ? tagLabel(masteryChange.tag) : ''}</span>
          <span className="spacer" />
          <span className="tnum">
            {masteryChange.before.toFixed(2)} <Icon name="arrow-right" size={11} /> <span className={masteryChange.after < masteryChange.before ? 'bad' : 'ok'}>{masteryChange.after.toFixed(2)}</span>
          </span>
        </div>
      ) : card.tag ? (
        <div className="teach__mastery">
          <span className="teach__tag mono">{card.tag}</span>
        </div>
      ) : null}
    </div>
  );
}

/** Shift side panel: newest card expanded for 5 s, then all collapse to chips (click to expand). */
export function TeachCardPanel() {
  const cards = useGame((s) => s.ui.teachCards);
  const [expanded, setExpanded] = useState<string | null>(null);
  const newest = cards[cards.length - 1] ?? null;

  useEffect(() => {
    if (!newest) return;
    setExpanded(newest.id);
    const t = setTimeout(() => setExpanded((cur) => (cur === newest.id ? null : cur)), 5000);
    return () => clearTimeout(t);
  }, [newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cards.length) return null;
  const open = cards.find((c) => c.id === expanded);
  return (
    <aside className="hud-teach">
      {open ? (
        <div className="hud-teach__card" key={open.id}>
          <header className="hud-teach__head">
            <Icon name="hint" size={14} />
            <span>Teach Card</span>
            <span className="spacer" />
            <button type="button" className="hud-teach__collapse" onClick={() => setExpanded(null)} aria-label="Collapse">
              <Icon name="chevron-down" size={14} />
            </button>
          </header>
          <TeachCardView card={open} id={open.id} masteryChange={open.masteryChange} onGotIt={() => dismissTeachCard(open.id)} compact />
        </div>
      ) : null}
      <div className="hud-teach__chips">
        {cards
          .filter((c) => c.id !== expanded)
          .slice(-4)
          .map((c) => (
            <button key={c.id} type="button" className="hud-teach__chip" onClick={() => setExpanded(c.id)} title={c.whatHappened}>
              <Icon name="hint" size={12} />
              <span>{c.whatHappened}</span>
            </button>
          ))}
      </div>
    </aside>
  );
}
