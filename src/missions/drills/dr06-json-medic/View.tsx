/**
 * DR06 JSON Medic — an IntelliJ-style editor with no JSON inspections (Pigeon has no linter). Click the line
 * with the mistake (↑/↓ + Enter also work), then pick the fix (A–D). H pastes a known-good block beside the
 * file for comparison (−50). The LSTR console line, when shown, blames the line *after* a missing comma.
 */
import { useEffect, useRef, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { keyIndex, useDrill, useKeys } from '../common/useDrill';
import { Choice, Kbd, Legend, Reveal, Waiting } from '../common/ui';
import { lineClickPoints } from '../common/scoring';
import { FIX_TEXT, KNOWN_GOOD, medicPoints, type JsonErr, type MedicData } from './logic';
import './style.css';

interface Payload {
  line: number;
  fix: JsonErr;
  linePts: number;
}

/** Light syntax colouring (strings, numbers, punctuation) — never error highlighting. */
function Code({ text }: { text: string }) {
  const parts = text.split(/("(?:[^"\\]|\\.)*"|'[^']*'|-?\b\d+\b)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span key={i} className={p.startsWith('"') || p.startsWith("'") ? 'dr06-s' : 'dr06-n'}>
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function View(props: DrillComponentProps) {
  const d = useDrill<MedicData, Payload>(props);
  const it = d.item;
  const [cursor, setCursor] = useState(1);
  const [picked, setPicked] = useState<number | null>(null);
  const [hints, setHints] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCursor(1);
    setPicked(null);
    setHints(0);
    bodyRef.current?.scrollTo({ top: 0 });
  }, [d.itemKey]);

  useEffect(() => {
    bodyRef.current?.querySelector(`[data-line="${cursor}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  useEffect(() => {
    if (d.staged && it) bodyRef.current?.querySelector(`[data-line="${it.data.errLine}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [d.staged]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (fix: JsonErr) => {
    if (!it || picked === null || d.staged) return;
    const ms = d.elapsedMs();
    const streak = getState().session.drill?.streak ?? 0;
    const fixOk = fix === it.data.err;
    const r = medicPoints(picked, it.data.errLine, fixOk, hints, ms / 1000, streak);
    const lp = lineClickPoints(picked, it.data.errLine);
    const detail = r.correct ? undefined : [lp === 100 ? '' : lp === 50 ? `line ${picked} is one off` : `you picked line ${picked}`, fixOk ? '' : 'wrong fix'].filter(Boolean).join(' · ');
    d.stage({ correct: r.correct, pointsOverride: r.points, elapsedMs: ms, detail }, { line: picked, fix, linePts: lp });
  };

  useKeys(
    (e) => {
      if (!it || d.staged) return;
      const n = it.data.lines.length;
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        setCursor((c) => Math.min(n, c + 1));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setCursor((c) => Math.max(1, c - 1));
      } else if (e.code === 'Enter') {
        e.preventDefault();
        setPicked(cursor);
      } else if (e.code === 'KeyH' && !hints) {
        setHints(1);
      } else if (picked !== null) {
        const { letter } = keyIndex(e);
        if (letter >= 0 && letter < it.data.fixes.length) {
          e.preventDefault();
          choose(it.data.fixes[letter]!);
        }
      }
    },
    [d.itemKey, cursor, picked, hints, d.staged],
  );

  if (!it) return <Waiting />;
  const st = d.staged;
  const data = it.data;
  return (
    <div className="dr06">
      <div className="dr06-ide">
        <div className="dr06-tabs">
          <span className="dr06-tab is-on">{data.file.split('/').pop()}</span>
          {hints ? <span className="dr06-tab">known_good_actions.json</span> : null}
          {!hints ? <span className="dr06-path">{data.file}</span> : null}
          <span className="dr06-nolint">No JSON inspections for this project</span>
        </div>
        <div className={`dr06-split${hints ? ' has-hint' : ''}`}>
          <div className="dr06-body" ref={bodyRef}>
            {data.lines.map((l, i) => {
              const n = i + 1;
              const cls = [
                'dr06-line',
                n === cursor && !st ? 'is-cursor' : '',
                n === picked ? 'is-picked' : '',
                st && n === data.errLine ? 'is-err' : '',
                st && n === st.payload.line && n !== data.errLine ? 'is-miss' : '',
              ].join(' ');
              return (
                <div
                  key={n}
                  data-line={n}
                  className={cls}
                  onMouseEnter={() => !st && setCursor(n)}
                  onClick={() => {
                    if (st) return;
                    setCursor(n);
                    setPicked(n);
                  }}
                >
                  <span className="dr06-gutter">{n}</span>
                  <code className="dr06-code">
                    <Code text={l} />
                  </code>
                </div>
              );
            })}
          </div>
          {hints ? (
            <div className="dr06-hint">
              <div className="dr06-hint__title">tests/_templates/known_good_actions.json</div>
              {KNOWN_GOOD.map((l, i) => (
                <div key={i} className="dr06-line is-static">
                  <span className="dr06-gutter">{i + 1}</span>
                  <code className="dr06-code">
                    <Code text={l} />
                  </code>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        {data.console ? (
          <div className="dr06-console">
            <span className="dr06-console__tag">Jenkins · Java/pigeon-android-sale-swipe</span>
            <code>{data.console}</code>
            <span className="dr06-console__fail">FAILURE</span>
          </div>
        ) : null}
      </div>

      <div className="dr06-side">
        {st ? (
          <Reveal
            correct={st.verdict.correct}
            points={st.points}
            multiplier={st.multiplier}
            title={st.verdict.correct ? `Line ${data.errLine} — fixed` : `It was line ${data.errLine}: ${FIX_TEXT[data.err].toLowerCase()}`}
            onNext={() => d.commit()}
            autoMs={2200}
          >
            {st.payload.linePts === 50 ? <div className="dr06-near">Line {st.payload.line} is one off (+50). </div> : null}
            {it.teach.why}
          </Reveal>
        ) : picked === null ? (
          <div className="dr06-ask">
            <div className="dk-eyebrow">JSON Medic · {d.itemTarget ? `payload ${Math.min(d.index + 1, d.itemTarget)} of ${d.itemTarget}` : ''}</div>
            <div className="dr06-ask__text">This payload won’t parse. Click the line with the mistake.</div>
            <div className="dr06-ask__tip">{data.console ? 'The console blames a line — the culprit is often the end of the line before it.' : 'No linter, no squiggles: read the line ends.'}</div>
            <button type="button" className="dk-btn" disabled={!!hints} onClick={() => setHints(1)}>
              Paste a known-good block (−50) <Kbd k="H" size="sm" />
            </button>
          </div>
        ) : (
          <div className="dr06-fixes">
            <div className="dk-eyebrow">Line {picked} — pick the fix</div>
            {data.fixes.map((f, i) => (
              <Choice key={f} k={String.fromCharCode(65 + i)} label={FIX_TEXT[f]} onPick={() => choose(f)} />
            ))}
            <button type="button" className="dr06-back" onClick={() => setPicked(null)}>
              ← pick another line
            </button>
          </div>
        )}
      </div>
      {!st ? <Legend items={[['↑↓', 'move'], ['⏎', 'pick line'], ['A–D', 'fix'], ['H', 'known-good block −50']]} /> : null}
    </div>
  );
}
