/**
 * DR15 Where Does It Go? — a file card falls toward the five folders; press 1–5 (or click a folder) before
 * it lands. The fall gets faster as the round goes on; a file that hits the floor counts as a miss.
 */
import { useEffect, useRef } from 'react';
import type { DrillComponentProps } from '../../types';
import { keyIndex, useDrill, useKeys, useQuickAnswer } from '../common/useDrill';
import { Kbd, Legend, Waiting } from '../common/ui';
import { BINS, BIN_ROLE, type Bin, type FileData } from './logic';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<FileData>(props);
  const q = useQuickAnswer<Bin | 'floor'>(d, { right: 320, wrong: 900 });
  const it = d.item;
  const fallS = Math.max(3.2, 7 - 0.25 * d.index);
  const timer = useRef<number | null>(null);

  const drop = (b: Bin | 'floor') => {
    if (!it || q.locked) return;
    const ok = b === it.data.bin;
    const detail = b === 'floor' ? 'it hit the floor' : b === 'main' ? 'QA never edits main' : `you dropped it in ${b}`;
    q.answer(b, ok, b === 'floor' ? null : document.querySelector(`[data-dr15="${b}"]`), ok ? {} : { detail });
  };

  useEffect(() => {
    if (!it) return;
    timer.current = window.setTimeout(() => drop('floor'), fallS * 1000);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [d.itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeys(
    (e) => {
      const { digit } = keyIndex(e);
      if (digit >= 1 && digit <= 5) {
        e.preventDefault();
        drop(BINS[digit - 1]!);
      }
    },
    [it?.id, q.locked],
  );

  if (!it) return <Waiting />;
  const target = q.picked && q.picked.key !== 'floor' ? BINS.indexOf(q.picked.key as Bin) : -1;
  const landed = q.picked ? (q.picked.correct ? 'is-right' : 'is-wrong') : '';
  return (
    <div className="dr15" key={d.itemKey}>
      <div className="dr15-sky">
        <div
          className={`dr15-file ${landed}${q.picked ? ' is-dropped' : ''}`}
          style={{
            animationDuration: `${fallS}s`,
            ...(target >= 0 ? ({ '--dr15-x': `${(target - 2) * 20}%` } as React.CSSProperties) : {}),
          }}
        >
          <div className="dr15-file__tab">{it.data.file.endsWith('.java') ? 'JAVA' : 'FILE'}</div>
          <div className="dr15-file__name">{it.data.file}</div>
          <code className="dr15-file__peek">{it.data.peek}</code>
          {it.data.bin === 'main' ? <div className="dr15-stamp">QA never edits</div> : null}
        </div>
      </div>
      <div className="dr15-bins">
        {BINS.map((b, i) => {
          const st = q.picked ? (b === it.data.bin ? 'is-answer' : q.picked.key === b ? 'is-wrong' : '') : '';
          return (
            <button key={b} type="button" data-dr15={b} className={`dr15-bin is-${b} ${st}`} disabled={q.locked} onClick={() => drop(b)}>
              <Kbd k={String(i + 1)} />
              <span className="dr15-bin__pre">{b === 'main' || b === 'test' ? 'app/src/' : 'androidTest/'}</span>
              <span className="dr15-bin__name">{b}</span>
              <span className="dr15-bin__role">{BIN_ROLE[b]}</span>
            </button>
          );
        })}
      </div>
      <Legend items={[['1–5', 'drop into a folder'], ['', `falls in ${fallS.toFixed(1)} s`]]} />
    </div>
  );
}
