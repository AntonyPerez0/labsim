/**
 * Inspect overlay (`inspect`, non-pausing panel): the close-up description of a prop — its callouts
 * (`ui.callouts` for that prop) and Field Manual entries that match its name.
 */
import { useMemo } from 'react';
import { useGame } from '@/core/store';
import { glossaryLookup, searchManual, type GlossaryTerm } from '@/content';
import { Button, Icon, Modal } from '@/ui/kit';
import { closeOverlay, openOverlay } from '@/ui/services/nav';
import { boardForProp } from '@/ui/minigames/boards';
import { MinigamePanel } from '@/ui/minigames/MinigamePanel';
import { RulerPanel, parseDeviceProp } from '@/ui/minigames/RulerPanel';

/** "rig.wall-e.tablet" → "WALL-E · tablet"; "power.fuse.5v" → "Power · fuse · 5v". */
export function propTitle(propId: string): string {
  const parts = propId.replace(/^prop\./, '').split('.');
  return parts
    .map((p, i) => (i === 1 && parts[0] === 'rig' ? p.toUpperCase() : p.replace(/-/g, ' ')))
    .filter((p, i) => !(i === 0 && (p === 'rig' || p === 'desk')))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' · ');
}

/** Best glossary entry for a prop id: longest run of id words that is a term or alias ("power.fuse.5v" → Fuse). */
export function glossaryForProp(propId: string): GlossaryTerm | null {
  const words = propId
    .replace(/^(prop|rig|desk|power|fab|lab)\./, '')
    .split(/[.\-_]+/)
    .filter(Boolean);
  for (let len = Math.min(4, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const phrase = words.slice(i, i + len).join(' ');
      if (phrase.length < 2) continue;
      const hit = glossaryLookup(phrase) ?? glossaryLookup(words.slice(i, i + len).join('-'));
      if (hit) return hit;
    }
  }
  return null;
}

export function InspectOverlay({ propId }: { propId: string }) {
  const board = boardForProp(propId);
  const ruler = useGame((s) => s.session.activeTool === 'ruler' || s.session.inventory.includes('ruler')) && parseDeviceProp(propId) !== null;
  if (board) return <MinigamePanel def={board} />;
  if (ruler) {
    return (
      <Modal width={560} onClose={() => closeOverlay({ lock: true })} backdrop="none" className="inspect-modal">
        <div className="ov-head">
          <Icon name="ruler" size={16} />
          <h2>{propTitle(propId)} · Ruler</h2>
        </div>
        <RulerPanel propId={propId} />
      </Modal>
    );
  }
  return <PropInspect propId={propId} />;
}

function PropInspect({ propId }: { propId: string }) {
  const callouts = useGame((s) => (s.ui.callouts?.propId === propId ? s.ui.callouts.lines : null));
  const related = useMemo(() => {
    const q = propId.replace(/^(prop|rig|desk|power)\./, '').replace(/[.-]/g, ' ');
    try {
      return searchManual(q, 4);
    } catch {
      return [];
    }
  }, [propId]);
  const term = useMemo(() => {
    try {
      return glossaryForProp(propId);
    } catch {
      return null;
    }
  }, [propId]);
  return (
    <Modal width={520} onClose={() => closeOverlay({ lock: true })} backdrop="none" className="inspect-modal">
      <div className="ov-head">
        <Icon name="eye" size={16} />
        <h2>{propTitle(propId)}</h2>
      </div>
      <div className="mono dim inspect__id">{propId}</div>
      {term ? (
        <div className="inspect__term">
          <div className="inspect__term-name">
            {term.term}
            {term.illustrative ? <span className="muted"> · sim-only</span> : null}
          </div>
          <p>{term.definition}</p>
        </div>
      ) : null}
      {callouts?.length ? (
        <ul className="inspect__callouts">
          {callouts.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">Hold right mouse on objects in the lab to zoom in and read their labels, LEDs and fuse windows.</p>
      )}
      {related.length ? (
        <div className="inspect__related">
          <div className="caps">In the Field Manual</div>
          {related.map((h) => (
            <Button key={h.article.id} size="sm" variant="subtle" icon="book" onClick={() => openOverlay({ kind: "manual", articleId: h.article.id }, { push: true })}>
              {h.article.title}
            </Button>
          ))}
        </div>
      ) : null}
    </Modal>
  );
}
