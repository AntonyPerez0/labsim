/**
 * DR03 Port Patrol — a terminal feed: each line slides across the scanner; Space = Lab-safe, X = Collision
 * risk. A line that slips past unflagged counts as a miss. Last 15 s: "fix it" cards — type the fix.
 */
import { useEffect, useRef, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys, useQuickAnswer } from '../common/useDrill';
import { streakMultiplier } from '../common/scoring';
import { Kbd, Legend, Waiting } from '../common/ui';
import { fixMatches, scrollSeconds, type PortData } from './logic';
import './style.css';

interface Hist {
  n: number;
  line: string;
  risk: boolean;
  ok: boolean;
}

const SRC_LABEL: Record<PortData['source'], string> = { terminal: '$', output: '›', config: 'cfg', runner: 'run' };

export function View(props: DrillComponentProps) {
  const d = useDrill<PortData>(props);
  const q = useQuickAnswer<'safe' | 'risk' | 'slip'>(d, { right: 260, wrong: 900 });
  const it = d.item;
  const [hist, setHist] = useState<Hist[]>([]);
  const [typed, setTyped] = useState('');
  const [fixState, setFixState] = useState<null | 'right' | 'wrong'>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const fixMode = it?.data.mode === 'fix';
  const secs = scrollSeconds(d.index);

  const record = (ok: boolean) => {
    if (!it) return;
    seq.current++;
    setHist((h) => [...h.slice(-4), { n: seq.current, line: it.data.line, risk: it.data.risk, ok }]);
  };

  const flag = (c: 'safe' | 'risk' | 'slip') => {
    if (!it || q.locked || fixMode) return;
    const ok = c !== 'slip' && (c === 'risk') === it.data.risk;
    record(ok);
    const detail = c === 'slip' ? 'it scrolled past unflagged' : c === 'risk' ? 'you flagged a safe line' : 'you let a collision through';
    q.answer(c, ok, c === 'slip' ? null : document.querySelector(`[data-dr03="${c}"]`), ok ? {} : { detail });
  };

  // Lines that scroll past unflagged are misses.
  useEffect(() => {
    setTyped('');
    setFixState(null);
    if (!it || fixMode) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
      return;
    }
    const t = window.setTimeout(() => flag('slip'), secs * 1000);
    return () => window.clearTimeout(t);
  }, [d.itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useKeys(
    (e) => {
      if (fixMode) return;
      if (e.code === 'Space') {
        e.preventDefault();
        flag('safe');
      } else if (e.code === 'KeyX') {
        e.preventDefault();
        flag('risk');
      }
    },
    [d.itemKey, q.locked, fixMode],
  );

  const submitFix = () => {
    if (!it || !it.data.fix || fixState) return;
    const ok = fixMatches(typed, it.data.fix.accept);
    setFixState(ok ? 'right' : 'wrong');
    record(ok);
    const streak = getState().session.drill?.streak ?? 0;
    const verdict = { correct: ok, pointsOverride: ok ? Math.round(200 * streakMultiplier(streak)) : 0, detail: ok ? undefined : `you typed “${typed.trim() || '(nothing)'}”` };
    d.juiceNow(verdict, inputRef.current);
    window.setTimeout(() => d.submit(verdict, null, true), ok ? 450 : 1300);
  };

  if (!it) return <Waiting />;
  const verdict = q.picked ? (q.picked.correct ? 'is-right' : 'is-wrong') : fixState ? `is-${fixState}` : '';
  return (
    <div className="dr03">
      <div className="dr03-term">
        <div className="dr03-term__bar">
          <span className="dr03-dot" />
          <span className="dr03-dot" />
          <span className="dr03-dot" />
          <span className="dr03-term__title">workstation 10.42.50.17 · ADB server :5037</span>
          <span className="dr03-term__rule">lab = 10.42.30.*:5444</span>
        </div>
        <div className="dr03-hist">
          {hist.map((h) => (
            <div key={h.n} className={`dr03-hist__row ${h.ok ? 'is-ok' : 'is-bad'}`}>
              <span className={`dr03-tag ${h.risk ? 'is-risk' : 'is-safe'}`}>{h.risk ? 'RISK' : 'SAFE'}</span>
              <code>{h.line}</code>
              <span className="dr03-hist__mark">{h.ok ? '✓' : '✗'}</span>
            </div>
          ))}
        </div>
        <div className={`dr03-scan ${fixMode ? 'is-fix' : ''}`}>
          <div className="dr03-scan__beam" />
          <div key={d.itemKey} className={`dr03-line ${verdict} ${q.locked ? 'is-stopped' : ''}`} style={fixMode ? undefined : { animationDuration: `${secs}s` }}>
            <span className="dr03-line__src">{SRC_LABEL[it.data.source]}</span>
            <code className="dr03-line__text">{it.data.line}</code>
          </div>
          {!fixMode ? <div key={`p${d.itemKey}`} className="dr03-scan__time" style={{ animationDuration: `${secs}s` }} /> : null}
        </div>
        {q.picked && !q.picked.correct ? <div className="dr03-why">{it.data.reason}</div> : null}
      </div>

      {fixMode && it.data.fix ? (
        <div className={`dr03-fix ${fixState ? `is-${fixState}` : ''}`}>
          <div className="dr03-fix__head">
            <span className="dr03-fix__badge">BONUS · FIX IT</span>
            <span>{it.data.fix.prompt}</span>
          </div>
          <div className="dr03-fix__row">
            <span className="dr03-fix__ps">$</span>
            <input
              ref={inputRef}
              className="dr03-fix__input"
              value={typed}
              spellCheck={false}
              autoComplete="off"
              placeholder="type the fix and press Enter"
              disabled={!!fixState}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submitFix();
                }
              }}
            />
          </div>
          {fixState === 'wrong' ? (
            <div className="dr03-fix__answer">
              Fix: <code>{it.data.fix.accept[0]}</code> — {it.data.reason}
            </div>
          ) : null}
        </div>
      ) : (
        <div className="dr03-buttons">
          <button type="button" data-dr03="safe" className={`dr03-btn is-safe ${q.picked?.key === 'safe' ? verdict : ''}`} disabled={q.locked} onClick={() => flag('safe')}>
            <Kbd k="Space" />
            <span className="dr03-btn__label">Lab-safe</span>
            <span className="dr03-btn__sub">10.42.30.* on :5444</span>
          </button>
          <button type="button" data-dr03="risk" className={`dr03-btn is-risk ${q.picked?.key === 'risk' ? verdict : ''}`} disabled={q.locked} onClick={() => flag('risk')}>
            <Kbd k="X" />
            <span className="dr03-btn__label">Collision risk</span>
            <span className="dr03-btn__sub">:5555 · no port · 10.42.60.*</span>
          </button>
        </div>
      )}
      <Legend items={fixMode ? [['⏎', 'submit the fix'], ['', 'a correct fix scores +200 × streak']] : [['Space', 'lab-safe'], ['X', 'collision risk'], ['', `lines cross in ${secs.toFixed(1)} s`]]} />
    </div>
  );
}
