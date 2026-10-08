/**
 * Rank-up ceremony (GP §4.3; ≤ 20 s, skippable): new title, the certificate line and the cosmetic.
 */
import { useEffect } from 'react';
import { RANKS, RANKS_BY_ID } from '@/content';
import { Button, LabWordmark } from '@/ui/kit';
import { closeOverlay, openOverlay } from '@/ui/services/nav';
import { store } from '@/core/store';
import { uiSound } from '@/ui/services/sound';
import { useArmed } from '@/ui/kit';

/** Back to the debrief the ceremony interrupted (the runtime opens it over the debrief), else close. */
function close(): void {
  const s = store.getState();
  if (s.session.result && s.session.mode !== 'menu') openOverlay({ kind: 'debrief' });
  else closeOverlay();
}

export function RankUpOverlay({ rank }: { rank: string }) {
  const def = RANKS_BY_ID[rank];
  const armed = useArmed();
  const dismiss = () => {
    if (armed) close();
  };
  useEffect(() => {
    uiSound('ui-achievement');
    const t = setTimeout(close, 20_000);
    return () => clearTimeout(t);
  }, []);
  const idx = RANKS.findIndex((r) => r.id === rank);
  return (
    <div className="rankup" onClick={dismiss} data-ui-interactive>
      <div className="rankup__rays" />
      <div className="rankup__card" onClick={(e) => e.stopPropagation()}>
        <div className="rankup__eyebrow">Promotion</div>
        <div className="rankup__badge">
          <LabWordmark size={56} />
        </div>
        <h1 className="rankup__title">{def?.title ?? rank}</h1>
        {def?.certExamId ? (
          <div className="rankup__cert">
            {def.certExamId} passed — {def.title}
            {def.certTitle ? <span className="muted"> · curriculum title “{def.certTitle}”</span> : null}
          </div>
        ) : null}
        <div className="rankup__ladder">
          {RANKS.map((r, i) => (
            <span key={r.id} className={`rankup__step${i < idx ? ' is-past' : ''}${i === idx ? ' is-now' : ''}`} title={r.title} />
          ))}
        </div>
        {def?.cosmetic ? <div className="rankup__cosmetic">Unlocked: {def.cosmetic}</div> : null}
        {def?.shiftDifficultyCap ? <div className="muted">Shift difficulty cap is now D{def.shiftDifficultyCap}.</div> : null}
        <Button variant="primary" size="lg" onClick={dismiss} autoFocus>
          Back to work
        </Button>
      </div>
    </div>
  );
}
