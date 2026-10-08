/**
 * Flashcard review (`flashcards` overlay; Cur §4.0 Leitner: boxes 1–5, box 1 every session, then 1 / 3 /
 * 7 / 14 days; "Got it" moves up a box, "Missed it" back to box 1; ≤ 20 new cards/day, ≤ 60 reviews per
 * session). Flip with Space (or Enter), grade positionally: 1 / ← Missed it, 2 / → Got it. Cards with a
 * typed answer can be typed.
 * Without the runtime it runs as an unrecorded practice session over unlocked decks.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { FLASHCARDS, flashcardById, matchesFill, MODULES_BY_ID } from '@/content';
import { Button, Chip, EmptyState, Icon, Kbd, Modal, ProgressBar, TextField } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { closeOverlay } from '@/ui/services/nav';
import { uiSound } from '@/ui/services/sound';
import { deckModule } from '@/ui/services/format';
import { isModuleComplete } from '@/ui/data/views';
import { store } from '@/core/store';
import type { FlashcardSessionInfo } from '@/missions';

function practiceQueue(deck?: string, tags?: string[]): string[] {
  const p = store.getState().progress;
  let pool = FLASHCARDS.filter((c) => (deck ? (c.deck ?? `deck.${c.moduleId}`) === deck : true) && (!tags?.length || c.tags.some((t) => tags.includes(t))));
  if (!deck && !tags?.length) {
    const unlocked = pool.filter((c) => isModuleComplete(p, c.moduleId));
    pool = unlocked.length ? unlocked : pool.filter((c) => c.moduleId === 'M01');
  }
  return pool
    .map((c) => ({ id: c.id, k: Math.random() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, 20)
    .map((x) => x.id);
}

export function FlashcardsOverlay({ deck, tags }: { deck?: string; tags?: string[] }) {
  const leitner = useGame((s) => s.progress.leitner);
  const live = hasMission('startFlashcards');
  // Starting a session writes the store, so it runs after the first render (never during it).
  const [session, setSession] = useState<{ queue: string[]; recorded: boolean } | null>(null);
  useEffect(() => {
    if (live) {
      const info = mq('startFlashcards', [{ deck, tags }], null as unknown as FlashcardSessionInfo);
      if (info?.queue) {
        setSession({ queue: info.queue, recorded: true });
        return;
      }
    }
    setSession({ queue: practiceQueue(deck, tags), recorded: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const queue = session?.queue ?? [];
  const recorded = session?.recorded ?? false;
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedResult, setTypedResult] = useState<boolean | null>(null);
  const [tally, setTally] = useState({ got: 0, missed: 0 });
  const card = queue[i] ? flashcardById(queue[i]!) : undefined;
  const done = i >= queue.length;

  const grade = (gotIt: boolean) => {
    if (!card || !flipped) return;
    if (recorded) ma('reviewFlashcard', card.id, gotIt);
    uiSound(gotIt ? 'ui-success' : 'ui-click', 0.5);
    setTally((t) => ({ got: t.got + (gotIt ? 1 : 0), missed: t.missed + (gotIt ? 0 : 1) }));
    setI((x) => x + 1);
    setFlipped(false);
    setTyped('');
    setTypedResult(null);
  };

  const close = () => {
    if (recorded) ma('endFlashcards');
    closeOverlay();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.repeat) return;
      if (e.code === 'Space' || ((e.code === 'Enter' || e.code === 'NumpadEnter') && !flipped)) {
        e.preventDefault();
        if (!flipped) setFlipped(true);
      } else if (flipped && (e.code === 'Digit2' || e.code === 'ArrowRight')) {
        e.preventDefault();
        grade(true);
      } else if (flipped && (e.code === 'Digit1' || e.code === 'ArrowLeft')) {
        e.preventDefault();
        grade(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const box = card ? (leitner[card.id]?.box ?? 1) : 1;
  const mod = card ? MODULES_BY_ID[card.moduleId] : null;
  const title = useMemo(() => (deck ? `Deck ${deckModule(deck)}` : tags?.length ? `Tags: ${tags.join(', ')}` : 'Due today'), [deck, tags]);

  return (
    <Modal width={680} onClose={close} backdrop="blur" className="fc-modal" labelledBy="fc-title">
      <div className="ov-head">
        <Icon name="cards" size={18} />
        <h2 id="fc-title">Flashcards</h2>
        <span className="muted">{title}</span>
        <span className="spacer" />
        {!recorded ? <Chip size="sm">Practice — not recorded</Chip> : null}
      </div>
      {!session ? (
        <div className="fc-loading muted">Shuffling the deck…</div>
      ) : !queue.length ? (
        <EmptyState icon="check" title="Nothing due right now" action={<Button onClick={close}>Close</Button>}>
          Cards come back on their Leitner schedule: box 2 after 1 day, box 3 after 3, box 4 after 7, box 5 after 14.
        </EmptyState>
      ) : done ? (
        <div className="fc-done">
          <div className="fc-done__big tnum">
            {tally.got} / {queue.length}
          </div>
          <div className="muted">
            {tally.got} got it · {tally.missed} missed — missed cards go back to box 1 and come up every session.
          </div>
          <Button variant="primary" onClick={close} autoFocus>
            Done
          </Button>
        </div>
      ) : card ? (
        <>
          <ProgressBar value={i / queue.length} height={3} />
          <div className="fc-meta">
            <span className="mono dim">{card.id}</span>
            {mod ? (
              <span className="muted">
                {mod.id} · {mod.title}
              </span>
            ) : null}
            <span className="spacer" />
            <span className="fc-boxes" title={`Leitner box ${box}`}>
              {[1, 2, 3, 4, 5].map((b) => (
                <span key={b} className={b <= box ? 'is-on' : ''} />
              ))}
              <span className="mono">box {box}</span>
            </span>
          </div>
          <div className={`fc-card${flipped ? ' is-flipped' : ''}`} onClick={() => setFlipped(true)} role="button" tabIndex={0}>
            <div className="fc-card__face fc-card__front">
              <div className="caps">Question</div>
              <div className="fc-card__text">{card.front}</div>
              {!flipped ? (
                <div className="fc-card__flip">
                  <Kbd k="Space" size="sm" /> flip
                </div>
              ) : null}
            </div>
            {flipped ? (
              <div className="fc-card__face fc-card__back">
                <div className="caps">Answer</div>
                <div className="fc-card__text">{card.back}</div>
              </div>
            ) : null}
          </div>
          {card.typedAnswer && !flipped ? (
            <div className="fc-typed">
              <TextField
                value={typed}
                onChange={setTyped}
                placeholder="Type the answer (optional), Enter to check"
                mono
                onEnter={() => {
                  const ok = matchesFill(typed, card.typedAnswer!, !!card.typedCaseSensitive);
                  setTypedResult(ok);
                  setFlipped(true);
                }}
              />
            </div>
          ) : null}
          {typedResult !== null ? <div className={`fc-typed-result ${typedResult ? 'ok' : 'bad'}`}>{typedResult ? 'Typed answer matches.' : `Typed “${typed}” — compare with the answer above.`}</div> : null}
          <div className="fc-actions">
            {flipped ? (
              <>
                <Button variant="danger" icon="x" kbd="1" onClick={() => grade(false)}>
                  Missed it
                </Button>
                <Button variant="primary" icon="check" kbd="2" onClick={() => grade(true)} autoFocus={typedResult === true}>
                  Got it
                </Button>
              </>
            ) : (
              <Button variant="secondary" kbd="Space" onClick={() => setFlipped(true)}>
                Show answer
              </Button>
            )}
          </div>
        </>
      ) : null}
    </Modal>
  );
}
