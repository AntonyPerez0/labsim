/**
 * Sort / match board (bolt bins, roadmap, team history). Pick a card (click or drag), drop it in a
 * bin (click, drop, or the bin's number key). Check grades the board: wrong cards turn red with a
 * one-line "why"; a fully correct board reports `minigame.completed`.
 */
import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { closeOverlay } from '@/ui/services/nav';
import { Button, Icon, Kbd } from '@/ui/kit';
import { binFull, gradeSort, type Grade, type SortBoardDef, type SortItem } from './boards';

export function SortBoard({ def, onSolved }: { def: SortBoardDef; onSolved: (g: Grade, mistakes: number) => void }) {
  const [placement, setPlacement] = useState<Record<string, string | undefined>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [grade, setGrade] = useState<Grade | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const solved = !!grade && grade.correct === grade.total;
  const loose = def.items.filter((it) => !placement[it.id]);

  const place = (itemId: string, binId: string | undefined) => {
    if (solved) return;
    if (binId && binFull(def, binId, placement, itemId)) {
      // Match boards: swap the occupant back to the tray.
      const occupant = Object.entries(placement).find(([, b]) => b === binId)?.[0];
      setPlacement((p) => ({ ...p, ...(occupant ? { [occupant]: undefined } : {}), [itemId]: binId }));
    } else setPlacement((p) => ({ ...p, [itemId]: binId }));
    setSelected(null);
    setGrade((g) => (g ? { ...g, wrong: g.wrong.filter((w) => w !== itemId) } : g));
  };

  const check = () => {
    const g = gradeSort(def, placement);
    setGrade(g);
    const m = mistakes + g.wrong.length;
    setMistakes(m);
    if (g.correct === g.total) onSolved(g, m);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!selected || solved) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= def.bins.length) {
        e.preventDefault();
        e.stopPropagation();
        place(selected, def.bins[n - 1]!.id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  const wrongSet = useMemo(() => new Set(grade?.wrong ?? []), [grade]);
  const firstWrong = def.items.find((it) => wrongSet.has(it.id));

  const card = (it: SortItem) => (
    <button
      key={it.id}
      type="button"
      draggable={!solved}
      onDragStart={(e: DragEvent) => {
        e.dataTransfer.setData('text/plain', it.id);
        setSelected(it.id);
      }}
      onClick={() => setSelected((s) => (s === it.id ? null : it.id))}
      className={`mg-card${selected === it.id ? ' is-selected' : ''}${wrongSet.has(it.id) ? ' is-wrong' : ''}${solved ? ' is-right' : ''}`}
      aria-pressed={selected === it.id}
    >
      {it.diameterMm ? <BoltArt d={it.diameterMm} len={it.lengthMm ?? 10} /> : null}
      <span className="mg-card__label">{it.label}</span>
      {it.sub ? <span className="mg-card__sub">{it.sub}</span> : null}
    </button>
  );

  return (
    <div className="mg-sort">
      <div className="mg-tray" onDragOver={(e) => e.preventDefault()} onDrop={(e) => place(e.dataTransfer.getData('text/plain'), undefined)}>
        {loose.length ? loose.map(card) : <span className="muted">All cards placed. Press Check.</span>}
      </div>
      <div className="mg-bins" style={{ gridTemplateColumns: `repeat(${Math.min(def.bins.length, 5)}, minmax(0, 1fr))` }}>
        {def.bins.map((b, i) => (
          <div
            key={b.id}
            className={`mg-bin${selected ? ' is-target' : ''}`}
            onClick={() => selected && place(selected, b.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('text/plain');
              if (id) place(id, b.id);
            }}
            role="button"
            tabIndex={0}
            aria-label={`Bin ${b.label}`}
          >
            <div className="mg-bin__head">
              <Kbd k={String(i + 1)} size="sm" />
              <span className="mg-bin__label">{b.label}</span>
            </div>
            {b.sub ? <div className="mg-bin__sub">{b.sub}</div> : null}
            <div className="mg-bin__items">{def.items.filter((it) => placement[it.id] === b.id).map(card)}</div>
          </div>
        ))}
      </div>
      <div className="mg-foot">
        <div className="mg-feedback">
          {solved ? (
            <span className="mg-ok">
              <Icon name="check" size={16} /> {grade!.total}/{grade!.total} correct{mistakes ? ` · ${mistakes} fixed along the way` : ''}
            </span>
          ) : firstWrong ? (
            <span className="mg-bad">
              <Icon name="x" size={16} /> {grade!.wrong.length} wrong. {firstWrong.label}: {firstWrong.why}
            </span>
          ) : grade?.missing.length ? (
            <span className="muted">{grade.missing.length} still to place.</span>
          ) : (
            <span className="muted">Select a card, then click a bin or press its number.</span>
          )}
        </div>
        {solved ? (
          <Button variant="primary" icon="check" onClick={() => closeOverlay({ lock: true })}>
            Done
          </Button>
        ) : (
          <Button variant="primary" onClick={check} disabled={solved || loose.length > 0}>
            Check
          </Button>
        )}
      </div>
    </div>
  );
}

/** A bolt drawn to scale (side view): thread diameter → shank height. */
function BoltArt({ d, len }: { d: number; len: number }) {
  const s = 3.2; // px per mm
  const shankH = d * s;
  const headH = d * 1.7 * s;
  const headW = d * 1.0 * s;
  const shankW = len * s;
  const h = Math.max(headH, 18);
  const cy = h / 2;
  return (
    <svg className="mg-bolt" width={headW + shankW + 4} height={h} viewBox={`0 0 ${headW + shankW + 4} ${h}`} aria-hidden="true">
      <rect x={1} y={cy - headH / 2} width={headW} height={headH} rx={1.5} fill="#9aa5a0" stroke="#5d6662" />
      <rect x={1 + headW} y={cy - shankH / 2} width={shankW} height={shankH} fill="#b9c2be" stroke="#6b7470" />
      {Array.from({ length: Math.floor(shankW / 3) }, (_, i) => (
        <line key={i} x1={headW + 3 + i * 3} y1={cy - shankH / 2} x2={headW + 1.5 + i * 3} y2={cy + shankH / 2} stroke="#7d8783" strokeWidth={0.7} />
      ))}
    </svg>
  );
}
