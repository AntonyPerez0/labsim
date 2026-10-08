/**
 * DR19 ADB Speedrun — a live workstation terminal (↑/↓ history) beside the target device's screen. Connect on
 * 5444, dump, pull, grep the bounds, tap the centre. Any `:5555` costs −100 and flashes a Teach Card.
 */
import { useEffect, useRef, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill } from '../common/useDrill';
import { useFx } from '../common/frame';
import { sfx } from '../common/sound';
import { Legend, Waiting } from '../common/ui';
import { launcher, newTerm, runCommand, targetPoints, type SpeedData, type TermOut, type TermState } from './logic';
import './style.css';

interface Line {
  n: number;
  text: string;
  tone?: TermOut['lines'][number]['tone'] | 'cmd';
}

const PS1 = 'you@ws-17:~$';

export function View(props: DrillComponentProps) {
  const d = useDrill<SpeedData>(props);
  const fx = useFx();
  const it = d.item;
  const [term, setTerm] = useState<TermState>(() => newTerm());
  const [lines, setLines] = useState<Line[]>([{ n: 0, text: 'Lab ADB devices listen on 5444. Type help for the commands.', tone: 'muted' }]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const [taps, setTaps] = useState<{ n: number; x: number; y: number; hit: string | null }[]>([]);
  const [warn, setWarn] = useState<number>(0);
  const [won, setWon] = useState(false);
  const seq = useRef(1);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // New target: keep connections and scrollback, reset the device and progress.
    setTerm((t) => newTerm(t));
    setTaps([]);
    setWon(false);
    if (it) push([{ text: `── target: tap “${it.data.target}” on ${it.data.device.hrn} (${it.data.device.ip}) ──`, tone: 'warn' }]);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [d.itemKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [lines]);

  function push(ls: Omit<Line, 'n'>[]) {
    setLines((cur) => [...cur.slice(-160), ...ls.map((l) => ({ ...l, n: seq.current++ }))]);
  }

  const exec = () => {
    if (!it || won) return;
    const cmd = input;
    setInput('');
    setHIdx(-1);
    if (cmd.trim()) setHist((h) => [...h, cmd]);
    const r = runCommand(term, cmd, it.data);
    if (r.clear) {
      setLines([]);
      return;
    }
    push([{ text: `${PS1} ${cmd}`, tone: 'cmd' }, ...r.lines]);
    sfx('ui-type', { volume: 0.25 });
    if (r.collision) {
      setWarn((w) => w + 1);
      sfx('ui-fail', { volume: 0.6 });
      fx.pop('−100', 'bad', ':5555', fx.centreOf(inputRef.current) ?? undefined);
      fx.flash('bad');
    }
    if (r.tap) setTaps((t) => [...t.slice(-3), { n: seq.current++, ...r.tap! }]);
    setTerm(r.state);
    if (r.state.done && !term.done) {
      setWon(true);
      const ms = d.elapsedMs();
      const pts = targetPoints(ms / 1000, r.state.port5555, getState().session.drill?.streak ?? 0);
      const clean = r.state.port5555 === 0;
      const verdict = { correct: clean, pointsOverride: pts, elapsedMs: ms, detail: clean ? undefined : `${r.state.port5555} × :5555` };
      d.juiceNow(verdict, document.querySelector('.dr19-device'));
      push([{ text: `✓ ${it.data.target} opened on ${it.data.device.hrn} in ${(ms / 1000).toFixed(1)} s`, tone: 'ok' }]);
      window.setTimeout(() => d.submit(verdict, null, true), 1100);
    }
  };

  const skip = () => {
    if (!it || won) return;
    setWon(true);
    push([{ text: `skipped — the centre of ${it.data.target} was ${it.data.centre[0]} ${it.data.centre[1]}`, tone: 'warn' }]);
    d.submit({ correct: false, pointsOverride: -100 * term.port5555, detail: 'skipped' });
  };

  if (!it) return <Waiting />;
  const data = it.data;
  const L = launcher(data.device.type);
  const steps: [keyof TermState['steps'], string][] = [
    ['connect', `connect :5444`],
    ['dump', 'uiautomator dump'],
    ['pull', 'pull window_dump.xml'],
    ['bounds', `grep “${data.target}” bounds`],
    ['tap', 'input tap the centre'],
  ];
  const open = term.open[data.device.ip] ?? null;
  const portrait = L.h > L.w;

  return (
    <div className="dr19">
      <div className="dr19-term" onClick={() => inputRef.current?.focus()}>
        <div className="dr19-term__bar">
          <span>Terminal — workstation 10.42.50.17</span>
          <span className="dr19-term__target">
            target <b>{data.device.hrn}</b> {data.device.ip} · <b>{data.target}</b>
          </span>
        </div>
        <div className="dr19-term__body" ref={bodyRef}>
          {lines.map((l) => (
            <div key={l.n} className={`dr19-line ${l.tone ? `is-${l.tone}` : ''}`}>
              {l.text}
            </div>
          ))}
          <div className="dr19-prompt">
            <span className="dr19-ps1">{PS1}</span>
            <input
              ref={inputRef}
              className="dr19-input"
              value={input}
              spellCheck={false}
              autoComplete="off"
              disabled={won}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  exec();
                } else if (e.key === 'ArrowUp' && hist.length) {
                  e.preventDefault();
                  const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
                  setHIdx(i);
                  setInput(hist[i]!);
                } else if (e.key === 'ArrowDown' && hIdx >= 0) {
                  e.preventDefault();
                  const i = hIdx + 1;
                  setHIdx(i >= hist.length ? -1 : i);
                  setInput(i >= hist.length ? '' : hist[i]!);
                } else if (e.key === 'F2') {
                  e.preventDefault();
                  skip();
                }
              }}
            />
          </div>
        </div>
        {warn ? (
          <div key={warn} className="dr19-warn">
            <b>:5555 — −100.</b> Standard ADB defaults to 5555; lab devices only listen on 5444, and 5555 is what reached coworkers’ desk devices. Always <code>ip:5444</code>.
          </div>
        ) : null}
      </div>

      <div className="dr19-side">
        <div className="dr19-steps">
          {steps.map(([k, label], i) => (
            <div key={k} className={`dr19-step${term.steps[k] ? ' is-done' : ''}`}>
              <span className="dr19-step__n">{term.steps[k] ? '✓' : i + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>
        <div className={`dr19-device ${portrait ? 'is-portrait' : 'is-landscape'}${won ? ' is-won' : ''}`}>
          <div className="dr19-device__label">
            {data.device.hrn} · {data.device.type} · {L.w}×{L.h}px
          </div>
          <svg viewBox={`0 0 ${L.w} ${L.h}`} className="dr19-screen">
            <rect width={L.w} height={L.h} fill="#0f1a2e" />
            {open ? (
              <>
                <rect width={L.w} height={L.h * 0.08} fill="#2b7d19" />
                <text x={L.w * 0.05} y={L.h * 0.055} fontSize={L.h * 0.035} fill="#fff" fontWeight={700}>
                  {open}
                </text>
                <text x={L.w / 2} y={L.h / 2} fontSize={L.h * 0.03} fill="#9fb3d1" textAnchor="middle">
                  {open} app
                </text>
              </>
            ) : (
              L.apps.map((a) => (
                <g key={a.text}>
                  <rect x={a.l} y={a.t} width={a.r - a.l} height={a.b - a.t} rx={(a.r - a.l) * 0.18} fill={a.text === data.target && won ? '#43b02a' : '#1d2b45'} stroke="#2f4470" strokeWidth={3} />
                  <text x={(a.l + a.r) / 2} y={(a.t + a.b) / 2 + (a.b - a.t) * 0.07} fontSize={(a.b - a.t) * 0.16} fill="#dbe6f7" textAnchor="middle" fontWeight={600}>
                    {a.text}
                  </text>
                </g>
              ))
            )}
            {taps.map((t) => (
              <g key={t.n}>
                <circle cx={t.x} cy={t.y} r={Math.min(L.w, L.h) * 0.05} className={`dr19-ripple${t.hit ? ' is-hit' : ''}`} />
                <circle cx={t.x} cy={t.y} r={Math.min(L.w, L.h) * 0.012} fill={t.hit === data.target ? '#63d443' : '#f5b301'} />
              </g>
            ))}
          </svg>
          <div className="dr19-device__note">Device px from the top-left · centre = ((l + r) / 2, (t + b) / 2)</div>
        </div>
      </div>
      <Legend items={[['⏎', 'run'], ['↑', 'history'], ['F2', 'skip target'], ['', '300 − 10/s per target · :5555 −100']]} />
    </div>
  );
}
