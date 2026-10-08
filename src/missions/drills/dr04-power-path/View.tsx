/**
 * DR04 Power Path — click an output terminal (right side of a part), then an input terminal (left side) to
 * run a lead. Click a lead to pull it. A LabSim/Collis lead on DC (or an over-voltage) sparks instantly.
 * Enter = power on: every input is checked, missing inline fuses cost −100.
 */
import { useMemo, useRef, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys } from '../common/useDrill';
import { useFx } from '../common/frame';
import { sfx } from '../common/sound';
import { Btn, Legend, Reveal, Waiting } from '../common/ui';
import { boardPoints, checkBoard, NODES, sparkFor, type BoardData, type InputCheck, type NodeId, type Wire } from './logic';
import './style.css';

interface Payload {
  checks: InputCheck[];
  sparks: number;
  wires: Wire[];
}

const W = 1000;
const NW = 168;
const NH = 54;
const COL_X = [16, 222, 428, 622, 816];

export function View(props: DrillComponentProps) {
  const d = useDrill<BoardData, Payload>(props);
  const fx = useFx();
  const it = d.item;
  const [wires, setWires] = useState<Wire[]>([]);
  const [armed, setArmed] = useState<NodeId | null>(null);
  const [mouse, setMouse] = useState<{ x: number; y: number } | null>(null);
  const [sparks, setSparks] = useState<{ n: number; node: NodeId; why: string }[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Reset the board while rendering (not in an effect): a new board must never render with the previous
  // board's leads, whose nodes may not exist in the new layout.
  const [boardKey, setBoardKey] = useState(d.itemKey);
  if (boardKey !== d.itemKey) {
    setBoardKey(d.itemKey);
    setWires([]);
    setArmed(null);
    setSparks([]);
  }

  const layout = useMemo(() => {
    if (!it) return { H: 300, pos: {} as Record<NodeId, { x: number; y: number }> };
    const maxN = Math.max(...it.data.columns.map((c) => c.length));
    const H = Math.max(300, maxN * 74 + 20);
    const pos = {} as Record<NodeId, { x: number; y: number }>;
    it.data.columns.forEach((col, ci) => {
      col.forEach((n, ri) => {
        pos[n] = { x: COL_X[ci]!, y: ((ri + 1) * H) / (col.length + 1) - NH / 2 };
      });
    });
    return { H, pos };
  }, [it]);

  const { H, pos } = layout;
  const st = d.staged;
  const outP = (n: NodeId) => ({ x: pos[n].x + NW, y: pos[n].y + NH / 2 });
  const inP = (n: NodeId) => ({ x: pos[n].x, y: pos[n].y + NH / 2 });
  const path = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = Math.max(40, Math.abs(b.x - a.x) * 0.5);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  };

  const toSvg = (e: React.MouseEvent) => {
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return null;
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H };
  };

  const connect = (to: NodeId, el: Element) => {
    if (st) return;
    if (!armed) {
      // Clicking a wired input pulls its lead.
      setWires((ws) => ws.filter((w) => w.to !== to));
      return;
    }
    if (armed === to) return;
    const why = sparkFor(armed, to, wires);
    setArmed(null);
    if (why) {
      setSparks((s) => [...s, { n: s.length + 1, node: to, why }]);
      sfx('ui-fail', { volume: 0.8, rate: 0.6 });
      fx.banner('SPARK! −300', 'bad');
      fx.pop('−300', 'bad', null, fx.centreOf(el) ?? undefined);
      fx.flash('bad');
      return;
    }
    sfx('ui-click', { volume: 0.5 });
    setWires((ws) => [...ws.filter((w) => w.to !== to), { from: armed, to }]);
  };

  const powerOn = () => {
    if (!it || st) return;
    const r = checkBoard(it.data, wires);
    const ms = d.elapsedMs();
    const streak = getState().session.drill?.streak ?? 0;
    const pts = boardPoints(r, sparks.length, ms / 1000, streak);
    const perfect = r.perfect && sparks.length === 0;
    const wrong = r.checks.filter((c) => !c.ok).length;
    d.stage(
      { correct: perfect, pointsOverride: pts, elapsedMs: ms, detail: perfect ? undefined : [wrong ? `${wrong} input${wrong > 1 ? 's' : ''} wrong` : '', r.missingFuse ? `${r.missingFuse} branch without a fuse` : '', sparks.length ? `${sparks.length} spark${sparks.length > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') },
      { checks: r.checks, sparks: sparks.length, wires },
    );
  };

  useKeys(
    (e) => {
      if (st) return;
      if (e.code === 'Enter') {
        e.preventDefault();
        powerOn();
      } else if (e.code === 'Escape') setArmed(null);
      else if (e.code === 'Backspace') {
        e.preventDefault();
        setWires((ws) => ws.slice(0, -1));
      }
    },
    [d.itemKey, wires, sparks, st],
  );

  if (!it) return <Waiting />;

  const checkFor = (n: NodeId) => st?.payload.checks.find((c) => c.node === n) ?? null;
  const live = st ? new Set(st.payload.checks.filter((c) => c.ok).map((c) => c.node)) : null;
  const lastSpark = sparks[sparks.length - 1];

  return (
    <div className="dr04">
      <div className="dr04-head">
        <div className="dk-eyebrow">Power Path · {d.itemTarget ? `board ${Math.min(d.index + 1, d.itemTarget)} of ${d.itemTarget}` : ''}</div>
        <div className="dr04-title">{it.data.title}</div>
        {!st ? (
          <Btn primary onClick={powerOn} k="⏎">
            Power on ⚡
          </Btn>
        ) : null}
      </div>
      <div className={`dr04-board${st ? ' is-on' : ''}`}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="dr04-svg" onMouseMove={(e) => setMouse(toSvg(e))} onClick={(e) => e.target === svgRef.current && setArmed(null)}>
          <defs>
            <pattern id="dr04-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.04)" />
            </pattern>
          </defs>
          <rect width={W} height={H} fill="url(#dr04-grid)" />
          {['SOURCES', 'AC / 24 V', 'STEP-DOWN', 'FUSES', 'LOADS'].map((t, i) => (
            <text key={t} x={COL_X[i]! + NW / 2} y={14} className="dr04-colhead" textAnchor="middle">
              {t}
            </text>
          ))}
          {wires.filter((w) => pos[w.from] && pos[w.to]).map((w, i) => {
            const ok = live ? live.has(w.to) && !checkFor(w.to)?.noFuse : null;
            const ac = w.from === 'wall' || w.from === 'strip';
            return (
              <path
                key={`${w.from}-${w.to}-${i}`}
                d={path(outP(w.from), inP(w.to))}
                className={`dr04-wire ${ac ? 'is-ac' : 'is-dc'}${ok === true ? ' is-live' : ok === false ? ' is-bad' : ''}`}
                onClick={() => !st && setWires((ws) => ws.filter((x) => x !== w))}
              />
            );
          })}
          {armed && mouse && pos[armed] ? <path d={path(outP(armed), mouse)} className="dr04-wire is-temp" /> : null}
          {it.data.nodes.map((n) => {
            const p = pos[n];
            const node = NODES[n];
            const c = checkFor(n);
            const cls = c ? (c.ok ? (c.noFuse ? 'is-warn' : 'is-ok') : 'is-bad') : '';
            const sparked = sparks.some((s) => s.node === n);
            return (
              <g key={n} className={`dr04-node ${cls}${sparked ? ' is-sparked' : ''}`} transform={`translate(${p.x} ${p.y})`}>
                <rect width={NW} height={NH} rx={10} className="dr04-node__box" />
                <text x={12} y={22} className="dr04-node__label">
                  {node.label}
                </text>
                <text x={12} y={40} className="dr04-node__sub">
                  {node.sub}
                </text>
                {node.hasIn ? <circle cx={0} cy={NH / 2} r={9} className={`dr04-port is-in${armed ? ' is-target' : ''}`} onClick={(e) => connect(n, e.currentTarget)} /> : null}
                {node.hasOut ? (
                  <circle
                    cx={NW}
                    cy={NH / 2}
                    r={9}
                    className={`dr04-port is-out${armed === n ? ' is-armed' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!st) setArmed(armed === n ? null : n);
                    }}
                  />
                ) : null}
                {sparked ? <text x={NW - 20} y={18} className="dr04-bolt">⚡</text> : null}
              </g>
            );
          })}
        </svg>
        {lastSpark && !st ? (
          <div key={lastSpark.n} className="dr04-spark">
            <b>SPARK — −300.</b> {lastSpark.why}
          </div>
        ) : null}
      </div>
      {st ? (
        <Reveal
          correct={st.verdict.correct}
          points={st.points}
          multiplier={st.multiplier}
          title={st.verdict.correct ? 'Everything powered — and fused' : `${st.payload.checks.filter((c) => c.ok && !c.noFuse).length}/${st.payload.checks.length} inputs right`}
          onNext={() => d.commit()}
          autoMs={2400}
        >
          {st.payload.checks
            .filter((c) => !c.ok || c.noFuse)
            .slice(0, 3)
            .map((c) => (
              <div key={c.node} className="dr04-fix">
                <b>{NODES[c.node].label}:</b> {c.noFuse ? 'works, but no inline fuse on the branch (−100).' : 'wrong or missing lead.'} Needs {c.why}.
              </div>
            ))}
          {st.payload.sparks ? <div className="dr04-fix">Sparks: {st.payload.sparks} × −300.</div> : null}
          <div className="dr04-why">{it.teach.why}</div>
        </Reveal>
      ) : (
        <Legend items={[['', 'click ● out, then ● in'], ['Esc', 'cancel lead'], ['⌫', 'pull last lead'], ['⏎', 'power on']]} />
      )}
    </div>
  );
}
