/**
 * Architecture whiteboard (M06.03, Cur §2 M06 step 3): place the 8 cards into the diagram boxes,
 * then name the 6 arrows. The skeleton (boxes and arrows) follows the reference §2 diagram.
 */
import { useMemo, useState, type DragEvent } from 'react';
import { closeOverlay } from '@/ui/services/nav';
import { Button, Icon } from '@/ui/kit';
import { gradeDiagram, type DiagramBoardDef, type Grade } from './boards';

const COL_W = 200;
const ROW_H = 86;
const BOX_W = 168;
const BOX_H = 46;
const PAD_X = 16;
const PAD_Y = 12;

function boxPos(col: number, row: number): { x: number; y: number } {
  return { x: PAD_X + col * COL_W, y: PAD_Y + row * ROW_H };
}

export function DiagramBoard({ def, onSolved }: { def: DiagramBoardDef; onSolved: (g: Grade, mistakes: number) => void }) {
  const [cards, setCards] = useState<Record<string, string | undefined>>({});
  const [labels, setLabels] = useState<Record<string, string | undefined>>({});
  const [selCard, setSelCard] = useState<string | null>(null);
  const [selEdge, setSelEdge] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const solved = !!grade && grade.correct === grade.total;
  const wrong = useMemo(() => new Set(grade?.wrong ?? []), [grade]);

  const slotById = useMemo(() => new Map(def.slots.map((s) => [s.id, s])), [def]);
  const cardLabel = (id: string | undefined) => def.cards.find((c) => c.id === id)?.label ?? '';
  const placedCards = new Set(Object.values(cards).filter(Boolean));
  const usedLabels = new Set(Object.values(labels).filter(Boolean));
  const looseCards = def.cards.filter((c) => !placedCards.has(c.id));
  const namedEdges = def.edges.filter((e) => e.answer !== null);

  const dropCard = (slotId: string, cardId: string) => {
    if (solved) return;
    setCards((m) => {
      const next: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(m)) if (v !== cardId) next[k] = v;
      next[slotId] = cardId;
      return next;
    });
    setSelCard(null);
    setGrade((g) => (g ? { ...g, wrong: g.wrong.filter((w) => w !== slotId) } : g));
  };

  const setLabel = (edgeId: string, labelId: string) => {
    if (solved) return;
    setLabels((m) => {
      const next: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(m)) if (v !== labelId) next[k] = v;
      next[edgeId] = labelId;
      return next;
    });
    setSelEdge(null);
    setGrade((g) => (g ? { ...g, wrong: g.wrong.filter((w) => w !== edgeId) } : g));
  };

  const check = () => {
    const g = gradeDiagram(def, cards, labels);
    setGrade(g);
    const m = mistakes + g.wrong.length;
    setMistakes(m);
    if (g.correct === g.total) onSolved(g, m);
  };

  const cols = Math.max(...def.slots.map((s) => s.col)) + 1;
  const rows = Math.max(...def.slots.map((s) => s.row)) + 1;
  const W = PAD_X * 2 + (cols - 1) * COL_W + BOX_W;
  const H = PAD_Y * 2 + (rows - 1) * ROW_H + BOX_H;
  const firstWrongEdge = def.edges.find((e) => wrong.has(e.id));
  const firstWrongSlot = def.slots.find((s) => wrong.has(s.id));
  const ready = looseCards.length === 0 && namedEdges.every((e) => labels[e.id]);

  return (
    <div className="mg-diagram">
      <div className="mg-tray">
        {selEdge ? (
          <div className="mg-label-pick">
            <span className="caps">Name this arrow</span>
            {def.labels.map((l) => (
              <Button key={l.id} size="sm" variant={usedLabels.has(l.id) ? 'ghost' : 'secondary'} onClick={() => setLabel(selEdge, l.id)}>
                {l.text}
              </Button>
            ))}
          </div>
        ) : looseCards.length ? (
          looseCards.map((c) => (
            <button
              key={c.id}
              type="button"
              draggable={!solved}
              onDragStart={(e: DragEvent) => {
                e.dataTransfer.setData('text/plain', c.id);
                setSelCard(c.id);
              }}
              onClick={() => setSelCard((s) => (s === c.id ? null : c.id))}
              className={`mg-card${selCard === c.id ? ' is-selected' : ''}`}
            >
              <span className="mg-card__label">{c.label}</span>
            </button>
          ))
        ) : (
          <span className="muted">{solved ? 'Diagram complete: Jenkins executes, Orca controls, the Pi drives the hardware.' : "All cards placed. Click an arrow's “?” to name it."}</span>
        )}
      </div>
      <div className="mg-diagram__canvas" style={{ width: W, height: H }}>
        <svg width={W} height={H} className="mg-diagram__svg" aria-hidden="true">
          <defs>
            <marker id="mg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
            </marker>
          </defs>
          {def.edges.map((e) => {
            const a = slotById.get(e.from)!;
            const b = slotById.get(e.to)!;
            const [x1, y1, x2, y2] = edgeLine(a.col, a.row, b.col, b.row);
            return <line key={e.id} x1={x1} y1={y1} x2={x2} y2={y2} className={`mg-edge${e.answer === null ? ' is-fixed' : ''}${wrong.has(e.id) ? ' is-wrong' : ''}`} markerEnd="url(#mg-arrow)" />;
          })}
        </svg>
        {def.slots.map((s) => {
          const p = boxPos(s.col, s.row);
          const card = cards[s.id];
          return (
            <div
              key={s.id}
              className={`mg-slot${card ? ' is-filled' : ''}${wrong.has(s.id) ? ' is-wrong' : ''}${selCard ? ' is-target' : ''}${solved ? ' is-right' : ''}`}
              style={{ left: p.x, top: p.y, width: BOX_W, height: BOX_H }}
              onClick={() => {
                if (selCard) dropCard(s.id, selCard);
                else if (card && !solved) setCards((m) => ({ ...m, [s.id]: undefined }));
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                if (id && def.cards.some((c) => c.id === id)) dropCard(s.id, id);
              }}
              role="button"
              tabIndex={0}
            >
              {card ? cardLabel(card) : <span className="muted">drop a card</span>}
            </div>
          );
        })}
        {namedEdges.map((e) => {
          const a = slotById.get(e.from)!;
          const b = slotById.get(e.to)!;
          const [x1, y1, x2, y2] = edgeLine(a.col, a.row, b.col, b.row);
          const lab = def.labels.find((l) => l.id === labels[e.id]);
          return (
            <button
              key={e.id}
              type="button"
              className={`mg-edge-label${selEdge === e.id ? ' is-selected' : ''}${lab ? ' is-filled' : ''}${wrong.has(e.id) ? ' is-wrong' : ''}`}
              style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
              onClick={() => !solved && setSelEdge((s) => (s === e.id ? null : e.id))}
            >
              {lab ? lab.text : '?'}
            </button>
          );
        })}
      </div>
      <div className="mg-foot">
        <div className="mg-feedback">
          {solved ? (
            <span className="mg-ok">
              <Icon name="check" size={16} /> {grade!.total}/{grade!.total}: 8 cards and 6 arrows correct
            </span>
          ) : firstWrongSlot || firstWrongEdge ? (
            <span className="mg-bad">
              <Icon name="x" size={16} /> {grade!.wrong.length} wrong.{' '}
              {firstWrongEdge ? `Arrow: ${def.labels.find((l) => l.id === firstWrongEdge.answer)?.why ?? ''}` : `"${cardLabel(cards[firstWrongSlot!.id])}" is in the wrong box.`}
            </span>
          ) : (
            <span className="muted">Cards: select then click a box. Arrows: click the “?” label.</span>
          )}
        </div>
        {solved ? (
          <Button variant="primary" icon="check" onClick={() => closeOverlay({ lock: true })}>
            Done
          </Button>
        ) : (
          <Button variant="primary" onClick={check} disabled={solved || !ready}>
            Check
          </Button>
        )}
      </div>
    </div>
  );
}

/** Line between two box edges (centre to centre, trimmed to the box borders). */
function edgeLine(c1: number, r1: number, c2: number, r2: number): [number, number, number, number] {
  const a = boxPos(c1, r1);
  const b = boxPos(c2, r2);
  const ax = a.x + BOX_W / 2;
  const ay = a.y + BOX_H / 2;
  const bx = b.x + BOX_W / 2;
  const by = b.y + BOX_H / 2;
  const dx = bx - ax;
  const dy = by - ay;
  const trim = (x: number, y: number, sx: number, sy: number): [number, number] => {
    const tx = dx === 0 ? Infinity : BOX_W / 2 / Math.abs(dx);
    const ty = dy === 0 ? Infinity : BOX_H / 2 / Math.abs(dy);
    const t = Math.min(tx, ty);
    return [x + sx * dx * t, y + sy * dy * t];
  };
  const [x1, y1] = trim(ax, ay, 1, 1);
  const [x2, y2] = trim(bx, by, -1, -1);
  return [x1, y1, x2, y2];
}
