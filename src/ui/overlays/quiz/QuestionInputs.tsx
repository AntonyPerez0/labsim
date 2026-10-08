/**
 * Answer inputs for every quiz type (Cur §3.0): multiple choice (single / multi-select), true-false,
 * ordering (drag or arrow buttons), matching and fill-in. Each input produces a `QuizAnswerValue` in the
 * runtime's shape: mc → authored option index (number[] for multi-select) · tf → 0|1 · order → authored
 * strings in the chosen order · match → [left, right][] · fill → text.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { QuizAnswerValue } from '@/core/state';
import type { QuizQuestion } from '@/content';
import { Button, Icon, Kbd, Select, TextField } from '@/ui/kit';

export interface InputProps {
  q: QuizQuestion;
  /** Display order of authored option indices (mc/tf) or of items (order/match right side). */
  perm: number[];
  /** Locked after answering (feedback shown). */
  locked: boolean;
  /** The submitted answer (to mark choices after feedback). */
  submitted: QuizAnswerValue | null;
  /** Correctness of the submitted answer (null = no feedback mode). */
  correct: boolean | null;
  onSubmit: (v: QuizAnswerValue) => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

export function QuestionInput(p: InputProps) {
  switch (p.q.type) {
    case 'mc':
      return p.q.answers ? <MultiChoice {...p} /> : <Choice {...p} />;
    case 'tf':
      return <Choice {...p} tf />;
    case 'order':
      return <OrderInput {...p} />;
    case 'match':
      return <MatchInput {...p} />;
    case 'fill':
      return <FillInput {...p} />;
  }
}

/** Single-answer multiple choice / true-false. Keys 1–4 or A–D pick. */
function Choice({ q, perm, locked, submitted, correct, onSubmit, tf }: InputProps & { tf?: boolean }) {
  const options = q.options ?? [];
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      let i = -1;
      // True/false: T / F first (F would otherwise read as the sixth letter option).
      if (tf && e.code === 'KeyT') i = perm.indexOf(0);
      else if (tf && e.code === 'KeyF') i = perm.indexOf(1);
      else if (/^(Digit|Numpad)[1-9]$/.test(e.code)) i = Number(e.code.slice(-1)) - 1;
      else if (!tf && /^Key[A-F]$/.test(e.code)) i = e.code.charCodeAt(3) - 65;
      if (i >= 0 && i < perm.length) {
        e.preventDefault();
        onSubmit(perm[i]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, perm, onSubmit, tf]);

  return (
    <div className={`qz-options${tf ? ' qz-options--tf' : ''}`} role="radiogroup">
      {perm.map((ai, i) => {
        const chosen = submitted === ai;
        const isAnswer = locked && correct !== null && ai === q.answer;
        const cls = ['qz-opt', chosen ? 'is-chosen' : '', locked && chosen && correct === false ? 'is-wrong' : '', isAnswer ? 'is-right' : ''].filter(Boolean).join(' ');
        return (
          <button key={ai} type="button" role="radio" aria-checked={chosen} className={cls} disabled={locked} onClick={() => onSubmit(ai)}>
            <Kbd k={tf ? String(i + 1) : LETTERS[i]!} size="sm" />
            <span className="qz-opt__text">{options[ai]}</span>
            {isAnswer ? <Icon name="check" size={16} stroke={2.6} /> : locked && chosen && correct === false ? <Icon name="x" size={16} stroke={2.6} /> : null}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select ("choose all that apply"). */
function MultiChoice({ q, perm, locked, submitted, correct, onSubmit }: InputProps) {
  const [sel, setSel] = useState<number[]>([]);
  const options = q.options ?? [];
  const answers = new Set(q.answers ?? []);
  const shown = locked && Array.isArray(submitted) ? (submitted as number[]) : sel;
  const toggle = (ai: number) => setSel((s) => (s.includes(ai) ? s.filter((x) => x !== ai) : [...s, ai]));
  useEffect(() => {
    if (locked) return;
    const onKey = (e: KeyboardEvent) => {
      let i = -1;
      if (/^Digit[1-9]$/.test(e.code)) i = Number(e.code.slice(5)) - 1;
      else if (/^Key[A-F]$/.test(e.code)) i = e.code.charCodeAt(3) - 65;
      if (i >= 0 && i < perm.length) {
        e.preventDefault();
        toggle(perm[i]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [locked, perm]);
  return (
    <>
      <div className="qz-hint">Select all that apply.</div>
      <div className="qz-options" role="group">
        {perm.map((ai, i) => {
          const on = shown.includes(ai);
          const cls = ['qz-opt', 'qz-opt--check', on ? 'is-chosen' : '', locked && correct !== null && answers.has(ai) ? 'is-right' : '', locked && correct !== null && on && !answers.has(ai) ? 'is-wrong' : ''].filter(Boolean).join(' ');
          return (
            <button key={ai} type="button" role="checkbox" aria-checked={on} className={cls} disabled={locked} onClick={() => toggle(ai)}>
              <span className="qz-check">{on ? <Icon name="check" size={12} stroke={3} /> : null}</span>
              <Kbd k={LETTERS[i]!} size="sm" />
              <span className="qz-opt__text">{options[ai]}</span>
            </button>
          );
        })}
      </div>
      {!locked ? (
        <SubmitRow disabled={!sel.length} onSubmit={() => onSubmit([...sel].sort((a, b) => a - b))} />
      ) : null}
    </>
  );
}

/** Ordering: drag rows, or use the arrow buttons / Alt+↑↓ on a focused row. */
function OrderInput({ q, perm, locked, submitted, correct, onSubmit }: InputProps) {
  const items = q.options ?? [];
  const [order, setOrder] = useState<string[]>(() => perm.map((i) => items[i]!));
  const dragFrom = useRef<number | null>(null);
  const shown = locked && Array.isArray(submitted) ? (submitted as string[]) : order;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    setOrder((o) => {
      const n = [...o];
      const [x] = n.splice(from, 1);
      n.splice(to, 0, x!);
      return n;
    });
  };
  return (
    <>
      <div className="qz-hint">Put these in the correct order — drag, or use the arrows.</div>
      <ol className="qz-order">
        {shown.map((text, i) => {
          const right = locked && correct !== null ? items[i] === text : null;
          return (
            <li
              key={text}
              className={`qz-order__item${right === true ? ' is-right' : right === false ? ' is-wrong' : ''}`}
              draggable={!locked}
              tabIndex={locked ? -1 : 0}
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) move(dragFrom.current, i);
                dragFrom.current = null;
              }}
              onKeyDown={(e) => {
                if (locked) return;
                if (e.key === 'ArrowUp' && e.altKey) (e.preventDefault(), move(i, i - 1));
                if (e.key === 'ArrowDown' && e.altKey) (e.preventDefault(), move(i, i + 1));
              }}
            >
              <span className="qz-order__num">{i + 1}</span>
              {!locked ? <Icon name="drag" size={14} className="qz-order__grip" /> : null}
              <span className="qz-order__text">{text}</span>
              {!locked ? (
                <span className="qz-order__btns">
                  <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, i - 1)}>
                    <Icon name="chevron-up" size={14} />
                  </button>
                  <button type="button" aria-label="Move down" disabled={i === shown.length - 1} onClick={() => move(i, i + 1)}>
                    <Icon name="chevron-down" size={14} />
                  </button>
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!locked ? <SubmitRow onSubmit={() => onSubmit(order)} /> : null}
    </>
  );
}

/** Matching: pick the right-hand value for each left item. */
function MatchInput({ q, perm, locked, submitted, correct, onSubmit }: InputProps) {
  const pairs = q.pairs ?? [];
  const rights = useMemo(() => perm.map((i) => pairs[i]?.[1]).filter((x): x is string => x !== undefined), [perm, pairs]);
  const [sel, setSel] = useState<Record<string, string>>({});
  const shown: Record<string, string> = locked && Array.isArray(submitted) ? Object.fromEntries(submitted as [string, string][]) : sel;
  const complete = pairs.every(([l]) => !!sel[l]);
  return (
    <>
      <div className="qz-hint">Match each item on the left with one on the right.</div>
      <div className="qz-match">
        {pairs.map(([left, right]) => {
          const v = shown[left] ?? '';
          const ok = locked && correct !== null ? v === right : null;
          return (
            <div key={left} className={`qz-match__row${ok === true ? ' is-right' : ok === false ? ' is-wrong' : ''}`}>
              <div className="qz-match__left">{left}</div>
              <Icon name="arrow-right" size={14} className="dim" />
              {locked ? (
                <div className="qz-match__value">
                  {v || '—'}
                  {ok === false ? <div className="qz-match__fix">→ {right}</div> : null}
                </div>
              ) : (
                <Select value={v} onChange={(x) => setSel((s) => ({ ...s, [left]: x }))} options={[{ value: '', label: 'Choose…' }, ...rights.map((r) => ({ value: r, label: r }))]} ariaLabel={left} />
              )}
            </div>
          );
        })}
      </div>
      {!locked ? <SubmitRow disabled={!complete} onSubmit={() => onSubmit(pairs.map(([l]) => [l, sel[l] ?? ''] as [string, string]))} /> : null}
    </>
  );
}

function FillInput({ locked, submitted, correct, onSubmit }: InputProps) {
  const [text, setText] = useState('');
  const shown = locked && typeof submitted === 'string' ? submitted : text;
  return (
    <div className={`qz-fill${locked && correct !== null ? (correct ? ' is-right' : ' is-wrong') : ''}`}>
      {locked ? (
        <div className="qz-fill__answer mono">{shown || '—'}</div>
      ) : (
        <TextField value={text} onChange={setText} placeholder="Type your answer" autoFocus mono onEnter={() => text.trim() && onSubmit(text)} ariaLabel="Answer" />
      )}
      {!locked ? <SubmitRow disabled={!text.trim()} onSubmit={() => onSubmit(text)} /> : null}
    </div>
  );
}

function SubmitRow({ onSubmit, disabled }: { onSubmit: () => void; disabled?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Enter' || disabled || e.repeat || t?.tagName === 'INPUT') return;
      // A clicked option / reorder arrow keeps focus: Enter there would toggle the option (or move the
      // row) again instead of submitting. Other buttons (Back, Submit itself) keep their native Enter.
      if (t?.tagName === 'BUTTON' && !t.closest('.qz-options, .qz-order')) return;
      e.preventDefault();
      onSubmit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSubmit, disabled]);
  return (
    <div className="qz-submit">
      <Button variant="primary" icon="check" kbd="Enter" disabled={disabled} onClick={onSubmit}>
        Submit answer
      </Button>
    </div>
  );
}
