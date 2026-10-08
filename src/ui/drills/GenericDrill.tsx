/**
 * Generic drill body for items that are curriculum quiz items (`DrillItem.questionId`, e.g. DR10 Speed
 * Quiz) or that carry a simple `{ prompt, options, answer }` payload. Keys 1–4 / A–D answer.
 */
import { useEffect, useState } from 'react';
import { useGame } from '@/core/store';
import type { DrillComponentProps } from '@/missions';
import { questionById } from '@/content';
import { EmptyState, Kbd } from '@/ui/kit';

interface SimpleData {
  prompt?: string;
  options?: string[];
  answer?: number;
}

export function GenericDrill({ item, answer }: DrillComponentProps) {
  const itemId = useGame((s) => s.session.drill?.currentItemId ?? null);
  const shownAt = useGame((s) => s.session.drill?.itemShownAtS ?? 0);
  const it = itemId ? item(itemId) : null;
  const q = it?.questionId ? questionById(it.questionId) : null;
  const data = (it?.data ?? {}) as SimpleData;
  const prompt = q?.prompt ?? data.prompt ?? null;
  const options = q?.options ?? data.options ?? null;
  const correctIdx = q ? q.answer : data.answer;
  const [picked, setPicked] = useState<number | null>(null);
  useEffect(() => setPicked(null), [itemId, shownAt]);

  const pick = (i: number) => {
    if (!itemId || picked !== null || correctIdx === undefined) return;
    setPicked(i);
    answer(itemId, { correct: i === correctIdx });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      let i = -1;
      if (/^Digit[1-9]$/.test(e.code)) i = Number(e.code.slice(5)) - 1;
      else if (/^Key[A-F]$/.test(e.code)) i = e.code.charCodeAt(3) - 65;
      if (options && i >= 0 && i < options.length) {
        e.preventDefault();
        pick(i);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!it) return <EmptyState icon="target" title="Get ready…">The next item is on its way.</EmptyState>;
  if (!prompt || !options || correctIdx === undefined) {
    return (
      <EmptyState icon="rocket" title="This drill’s board is still on the workbench">
        Its items exist, but the interactive board for this format hasn’t been installed yet.
      </EmptyState>
    );
  }
  return (
    <div className="gdrill">
      <h2 className="gdrill__prompt">{prompt}</h2>
      <div className="gdrill__options">
        {options.map((o, i) => (
          <button key={i} type="button" className={`qz-opt${picked === i ? (i === correctIdx ? ' is-right' : ' is-wrong') : ''}`} disabled={picked !== null} onClick={() => pick(i)}>
            <Kbd k={String.fromCharCode(65 + i)} size="sm" />
            <span className="qz-opt__text">{o}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
