/** Small UI atoms shared by the drill bodies (prefix `dk-`, styled in kit.css). */
import { useEffect, useRef, type ReactNode } from 'react';
import { useKeys } from './useDrill';

export function Kbd({ k, size = 'md' }: { k: string; size?: 'sm' | 'md' }) {
  return <kbd className={`dk-kbd dk-kbd--${size}`}>{k}</kbd>;
}

export function Choice({
  k,
  label,
  sub,
  state,
  onPick,
  disabled,
  tone,
  wide,
}: {
  k: string;
  label: ReactNode;
  sub?: ReactNode;
  state?: 'right' | 'wrong' | 'missed' | null;
  onPick: (el: HTMLButtonElement) => void;
  disabled?: boolean;
  tone?: string;
  wide?: boolean;
}) {
  return (
    <button
      type="button"
      className={`dk-choice${state ? ` is-${state}` : ''}${wide ? ' is-wide' : ''}`}
      disabled={disabled}
      style={tone ? ({ '--dk-tone': tone } as React.CSSProperties) : undefined}
      onClick={(e) => onPick(e.currentTarget)}
    >
      <Kbd k={k} />
      <span className="dk-choice__label">{label}</span>
      {sub ? <span className="dk-choice__sub">{sub}</span> : null}
    </button>
  );
}

/** Header strip above an item: eyebrow + prompt. */
export function Prompt({ eyebrow, children, aside }: { eyebrow?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="dk-prompt">
      <div className="dk-prompt__main">
        {eyebrow ? <div className="dk-eyebrow">{eyebrow}</div> : null}
        <div className="dk-prompt__text">{children}</div>
      </div>
      {aside ? <div className="dk-prompt__aside">{aside}</div> : null}
    </div>
  );
}

/** Keyboard legend row at the bottom of a drill. */
export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="dk-legend">
      {items.map(([k, t]) => (
        <span key={k + t} className="dk-legend__item">
          {k ? <Kbd k={k} size="sm" /> : null} {t}
        </span>
      ))}
    </div>
  );
}

/**
 * Result panel after a staged answer: verdict, points preview, the teaching lines, and Next (Enter /
 * Space / click). Correct answers auto-advance after `autoMs`.
 */
export function Reveal({
  correct,
  points,
  multiplier,
  title,
  children,
  onNext,
  autoMs = 2200,
  nextLabel = 'Next',
}: {
  correct: boolean;
  points: number;
  multiplier?: number;
  title: ReactNode;
  children?: ReactNode;
  onNext: () => void;
  autoMs?: number | null;
  nextLabel?: string;
}) {
  const done = useRef(false);
  // Keys pressed before the panel mounted (the Enter that staged the answer) must not skip it.
  const mountedAt = useRef(typeof performance !== 'undefined' ? performance.now() : 0);
  const go = () => {
    if (done.current) return;
    done.current = true;
    onNext();
  };
  useKeys(
    (e) => {
      if (e.timeStamp && e.timeStamp <= mountedAt.current) return;
      if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        e.preventDefault();
        go();
      }
    },
    [],
    { inInputs: true },
  );
  useEffect(() => {
    if (!correct || !autoMs) return;
    const t = window.setTimeout(go, autoMs);
    return () => window.clearTimeout(t);
  }, [correct, autoMs]); // eslint-disable-line react-hooks/exhaustive-deps
  const sign = points > 0 ? '+' : points < 0 ? '−' : '±';
  return (
    <div className={`dk-reveal ${correct ? 'is-right' : 'is-wrong'}`} role="status">
      <div className="dk-reveal__head">
        <span className="dk-reveal__badge">{correct ? '✓' : '✗'}</span>
        <span className="dk-reveal__title">{title}</span>
        <span className="dk-reveal__pts">
          {sign}
          {Math.abs(points)}
          {multiplier && multiplier > 1 && correct ? <small> ×{multiplier.toFixed(1)}</small> : null}
        </span>
      </div>
      {children ? <div className="dk-reveal__body">{children}</div> : null}
      <button type="button" className="dk-btn dk-btn--primary dk-reveal__next" onClick={go}>
        {nextLabel} <Kbd k="⏎" size="sm" />
        {correct && autoMs ? <span className="dk-reveal__auto" style={{ animationDuration: `${autoMs}ms` }} /> : null}
      </button>
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled, k, title }: { children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean; k?: string; title?: string }) {
  return (
    <button type="button" title={title} className={`dk-btn${primary ? ' dk-btn--primary' : ''}`} disabled={disabled} onClick={onClick}>
      {children}
      {k ? <Kbd k={k} size="sm" /> : null}
    </button>
  );
}

export function Waiting() {
  return <div className="dk-waiting">Next item on its way…</div>;
}

/** Fact citation chip ("F198 · Ref §4.5"). */
export function Cite({ factIds, refText }: { factIds?: readonly string[]; refText?: string }) {
  if (!factIds?.length && !refText) return null;
  return (
    <span className="dk-cite">
      {refText ? <span>{refText}</span> : null}
      {factIds?.length ? <span className="dk-cite__ids">{factIds.join(' · ')}</span> : null}
    </span>
  );
}

/** Inline `code` spans from backticks. */
export function Rich({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <span key={i}>{p}</span>))}
    </>
  );
}
