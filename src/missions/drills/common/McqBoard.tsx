/** Shared multiple-choice board (keys 1–N or A–D) for the quick-fire drills (DR10, DR12, DR14, DR17, DR18). */
import type { ReactNode } from 'react';
import type { DrillHandle } from './useDrill';
import { keyIndex, useKeys, useQuickAnswer } from './useDrill';
import { Choice } from './ui';

export interface McqOption {
  label: ReactNode;
  sub?: ReactNode;
  tone?: string;
}

export function McqBoard({
  d,
  options,
  correct,
  columns = 2,
  keys = 'letters',
  detailFor,
  className,
}: {
  d: DrillHandle<unknown>;
  options: readonly McqOption[];
  correct: number;
  columns?: number;
  keys?: 'letters' | 'digits';
  /** Teach-card detail for a wrong pick ("you picked …"). */
  detailFor?: (i: number) => string;
  className?: string;
}) {
  const q = useQuickAnswer<number>(d);
  const pick = (i: number, el?: Element | null) => {
    if (q.locked || i < 0 || i >= options.length) return;
    const ok = i === correct;
    q.answer(i, ok, el ?? document.querySelector(`[data-mcq="${i}"]`), ok ? {} : { detail: detailFor?.(i) });
  };
  useKeys(
    (e) => {
      const { digit, letter } = keyIndex(e);
      const i = digit >= 1 ? digit - 1 : letter >= 0 && letter < 6 ? letter : -1;
      if (i >= 0 && i < options.length) {
        e.preventDefault();
        pick(i);
      }
    },
    [d.itemKey, q.locked, options.length],
  );
  return (
    <div className={`dk-mcq ${className ?? ''}`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o, i) => {
        const st = q.picked ? (i === correct ? (q.picked.key === i ? 'right' : 'missed') : q.picked.key === i ? 'wrong' : null) : null;
        return (
          <div key={i} data-mcq={i} className="dk-mcq__cell">
            <Choice k={keys === 'letters' ? String.fromCharCode(65 + i) : String(i + 1)} label={o.label} sub={o.sub} tone={o.tone} state={st} disabled={q.locked} onPick={(el) => pick(i, el)} />
          </div>
        );
      })}
    </div>
  );
}
