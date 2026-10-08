/**
 * DR09 Pipeline Order — shuffled cards in a tray; press a card's key (or click it) to drop it into the next
 * slot. Backspace takes the last card back, click a placed card to return it. The order is checked as soon
 * as the last slot fills (or Enter); the reveal marks each slot and shows the true order.
 */
import { useEffect, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys, keyIndex } from '../common/useDrill';
import { Kbd, Legend, Reveal, Waiting } from '../common/ui';
import { sequencePoints, slotsCorrect, type SeqData } from './logic';
import './style.css';

interface Payload {
  placed: number[];
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export function View(props: DrillComponentProps) {
  const d = useDrill<SeqData, Payload>(props);
  const it = d.item;
  const [placed, setPlaced] = useState<number[]>([]);

  useEffect(() => setPlaced([]), [d.itemKey]);

  const submit = (order: number[]) => {
    if (!it || d.staged) return;
    const ms = d.elapsedMs();
    const streak = getState().session.drill?.streak ?? 0;
    const { points, perfect } = sequencePoints(order, it.data.steps.length, ms / 1000, streak);
    const k = slotsCorrect(order);
    d.stage({ correct: perfect, pointsOverride: points, elapsedMs: ms, detail: perfect ? undefined : `${k}/${it.data.steps.length} cards in the right slot` }, { placed: order });
  };

  const place = (stepIdx: number) => {
    if (!it || d.staged || placed.includes(stepIdx)) return;
    const next = [...placed, stepIdx];
    setPlaced(next);
    if (next.length === it.data.steps.length) window.setTimeout(() => submit(next), 180);
  };

  const unplace = (slot: number) => {
    if (d.staged) return;
    setPlaced((p) => p.slice(0, slot).concat(p.slice(slot + 1)));
  };

  useKeys(
    (e) => {
      if (!it || d.staged) return;
      const { digit } = keyIndex(e);
      if (digit >= 1 && digit <= it.data.tray.length) {
        e.preventDefault();
        place(it.data.tray[digit - 1]!);
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        setPlaced((p) => p.slice(0, -1));
      } else if (e.code === 'Enter' && placed.length === it.data.steps.length) {
        e.preventDefault();
        submit(placed);
      }
    },
    [d.itemKey, d.staged, placed],
  );

  if (!it) return <Waiting />;
  const n = it.data.steps.length;
  const st = d.staged;
  const shown = st ? st.payload.placed : placed;
  return (
    <div className="dr09">
      <div className="dr09-head">
        <div className="dk-eyebrow">Pipeline Order · {d.itemTarget ? `sequence ${Math.min(d.index + 1, d.itemTarget)} of ${d.itemTarget}` : ''}</div>
        <div className="dr09-title">{it.data.title}</div>
      </div>
      <div className="dr09-slots" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n }, (_, slot) => {
          const v = shown[slot];
          const state = st && v !== undefined ? (v === slot ? 'is-right' : 'is-wrong') : '';
          return (
            <div key={slot} className={`dr09-slot ${v !== undefined ? 'is-filled' : ''} ${state} ${slot === shown.length && !st ? 'is-next' : ''}`}>
              <span className="dr09-slot__n">{slot + 1}</span>
              {v !== undefined ? (
                <button type="button" className="dr09-card is-placed" onClick={() => unplace(slot)} disabled={!!st}>
                  {it.data.steps[v]}
                </button>
              ) : (
                <span className="dr09-slot__empty">{slot === shown.length ? 'next' : ''}</span>
              )}
              {slot < n - 1 ? <span className="dr09-arrow">→</span> : null}
            </div>
          );
        })}
      </div>
      {st ? (
        <Reveal correct={st.verdict.correct} points={st.points} title={st.verdict.correct ? 'Perfect order' : `${slotsCorrect(st.payload.placed)}/${n} in the right slot`} onNext={() => d.commit()} autoMs={1800}>
          {!st.verdict.correct ? (
            <ol className="dr09-truth">
              {it.data.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          ) : null}
          <div className="dr09-why">{it.teach.why}</div>
        </Reveal>
      ) : (
        <div className="dr09-tray">
          {it.data.tray.map((stepIdx, i) => {
            const used = placed.includes(stepIdx);
            return (
              <button key={stepIdx} type="button" className={`dr09-card is-tray ${used ? 'is-used' : ''}`} disabled={used} onClick={() => place(stepIdx)}>
                <Kbd k={KEYS[i]!} size="sm" />
                <span>{it.data.steps[stepIdx]}</span>
              </button>
            );
          })}
        </div>
      )}
      {!st ? (
        <Legend
          items={[
            [`1–${n}`, 'place card'],
            ['⌫', 'take back'],
            ['', 'perfect + fast = big points'],
          ]}
        />
      ) : null}
    </div>
  );
}
