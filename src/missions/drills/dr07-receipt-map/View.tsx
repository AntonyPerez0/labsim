/**
 * DR07 Receipt Map — step 1: which Orca map matches this receipt screen (4 / 5)? Step 2: the robot only
 * knows millimetres — tap the asked button using that map's Screen Locations (live mm crosshair). The
 * reveal overlays both maps so the 3.0 mm shift is obvious.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys } from '../common/useDrill';
import { Kbd, Legend, Prompt, Reveal, Waiting } from '../common/ui';
import { DEVICE_TYPES } from '@/sim/seed/deviceTypes';
import { gradeTap, type ReceiptData, type ReceiptMap, type TapResult } from './logic';
import './style.css';

interface Payload {
  chosen: ReceiptMap;
  tap: { x: number; y: number } | null;
  result: TapResult | 'wrong-map';
  on: string | null;
}

const C4 = '#4aa8ff';
const C5 = '#63d443';

export function View(props: DrillComponentProps) {
  const d = useDrill<ReceiptData, Payload>(props);
  const it = d.item;
  const [step, setStep] = useState<1 | 2>(1);
  const [chosen, setChosen] = useState<ReceiptMap | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setStep(1);
    setChosen(null);
    setHover(null);
  }, [d.itemKey]);

  const pickMap = (m: ReceiptMap) => {
    if (!it || step !== 1 || d.staged) return;
    setChosen(m);
    if (m !== it.data.map) {
      d.stage({ correct: false, detail: `this screen uses RECEIPT_OPTIONS_${it.data.map}, you picked _${m}` }, { chosen: m, tap: null, result: 'wrong-map', on: null });
      return;
    }
    setStep(2);
  };

  const tap = (x: number, y: number) => {
    if (!it || step !== 2 || d.staged || !chosen) return;
    const g = gradeTap(it.data, x, y);
    const detail = g.result === 'other-map' ? `you tapped where ${it.data.ask} sits on RECEIPT_OPTIONS_${it.data.map === 4 ? 5 : 4}` : g.result === 'wrong-button' ? `you tapped ${g.on}` : g.result === 'miss' ? 'you tapped the gap between buttons' : undefined;
    d.stage({ correct: g.result === 'hit', detail }, { chosen, tap: { x, y }, result: g.result, on: g.on });
  };

  useKeys(
    (e) => {
      if (step === 1 && (e.code === 'Digit4' || e.code === 'Numpad4')) pickMap(4);
      if (step === 1 && (e.code === 'Digit5' || e.code === 'Numpad5')) pickMap(5);
    },
    [d.itemKey, step, d.staged],
  );

  if (!it) return <Waiting />;
  const data = it.data;
  const info = DEVICE_TYPES[data.deviceType];
  const st = d.staged;
  const reveal = !!st;
  const table = data.maps[(chosen ?? data.map) as ReceiptMap];

  return (
    <div className="dr07">
      <Prompt eyebrow={<>Receipt Map · {info.displayName} · <span className="dr07-code">{data.deviceType}</span></>}>
        {step === 1 && !reveal ? (
          <>Which Orca screen map matches this receipt screen?</>
        ) : (
          <>
            Robot's eye: tap <b className="dr07-ask">{data.ask}</b> using <code>RECEIPT_OPTIONS_{chosen}</code>
          </>
        )}
      </Prompt>
      <div className="dr07-stage">
        <Screen data={data} blind={step === 2 && !reveal} reveal={reveal} payload={st?.payload ?? null} hover={hover} onHover={setHover} onTap={tap} />
        <div className="dr07-side">
          {st ? (
            <Reveal
              correct={st.verdict.correct}
              points={st.points}
              multiplier={st.multiplier}
              title={st.verdict.correct ? `${data.ask} — on the money` : resultTitle(st.payload, data)}
              onNext={() => d.commit()}
            >
              {it.teach.why}
              <div className="dr07-legend">
                <i style={{ background: C4 }} /> RECEIPT_OPTIONS_4 <i style={{ background: C5 }} /> RECEIPT_OPTIONS_5
              </div>
            </Reveal>
          ) : null}
          {step === 1 && !reveal ? (
            <div className="dr07-maps">
              <div className="dr07-side__title">Orca · Screens · {data.deviceType}</div>
              {([4, 5] as const).map((m) => (
                <button key={m} type="button" className={`dr07-map is-${m}${chosen === m ? ' is-chosen' : ''}`} onClick={() => pickMap(m)} disabled={!!d.staged}>
                  <Kbd k={String(m)} />
                  <span className="dr07-map__name">RECEIPT_OPTIONS_{m}</span>
                  <span className="dr07-map__sub">{m === 4 ? 'Print · Email · Text · No Receipt' : '+ Scan for receipt (QR on) · buttons 3.0 mm lower'}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="dr07-table">
              <div className="dr07-side__title">
                Screen Locations · <span style={{ color: chosen === 5 ? C5 : C4 }}>RECEIPT_OPTIONS_{chosen}</span>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Button</th>
                    <th>X mm</th>
                    <th>Y mm</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map((b) => (
                    <tr key={b.name} className={b.name === data.ask ? 'is-ask' : ''}>
                      <td>{b.name}</td>
                      <td>{b.x.toFixed(1)}</td>
                      <td>{b.y.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="dr07-readout">
                cursor <b>{hover ? `${hover.x.toFixed(1)}, ${hover.y.toFixed(1)}` : '—'}</b> mm
              </div>
            </div>
          )}
        </div>
      </div>
      {!st ? <Legend items={step === 1 ? [['4', 'four options'], ['5', 'five options (QR)']] : [['', 'click the screen where the robot should tap']]} /> : null}
    </div>
  );
}

function resultTitle(p: Payload, data: ReceiptData): string {
  switch (p.result) {
    case 'wrong-map':
      return `Wrong map — this screen is RECEIPT_OPTIONS_${data.map}`;
    case 'other-map':
      return `That's where ${data.ask} sits on RECEIPT_OPTIONS_${data.map === 4 ? 5 : 4}`;
    case 'wrong-button':
      return `You hit ${p.on}, not ${data.ask}`;
    default:
      return `Missed — that tap lands in the gap`;
  }
}

/** Device screen render (SVG in mm). */
function Screen({
  data,
  blind,
  reveal,
  payload,
  hover,
  onHover,
  onTap,
}: {
  data: ReceiptData;
  blind: boolean;
  reveal: boolean;
  payload: Payload | null;
  hover: { x: number; y: number } | null;
  onHover: (p: { x: number; y: number } | null) => void;
  onTap: (x: number, y: number) => void;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const { wMm: W, hMm: H } = data;
  const portrait = H > W;
  const mmAt = (e: React.MouseEvent): { x: number; y: number } | null => {
    const svg = ref.current;
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    if (x < 0 || y < 0 || x > W || y > H) return null;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  };
  const buttons = data.maps[data.map];
  const fs = Math.min(W, H) * 0.045;
  const ticks: number[] = [];
  for (let v = 0; v <= Math.max(W, H); v += 10) ticks.push(v);
  return (
    <div className={`dr07-device ${portrait ? 'is-portrait' : 'is-landscape'}`}>
      <svg
        ref={ref}
        className={`dr07-svg${blind ? ' is-blind' : ''}`}
        viewBox={`0 0 ${W} ${H}`}
        style={{ aspectRatio: `${W} / ${H}` }}
        onMouseMove={(e) => onHover(mmAt(e))}
        onMouseLeave={() => onHover(null)}
        onClick={(e) => {
          const p = mmAt(e);
          if (p) onTap(p.x, p.y);
        }}
      >
        <rect x={0} y={0} width={W} height={H} fill={blind ? '#0d1320' : '#f4f6f8'} />
        {!blind ? (
          <>
            <rect x={0} y={0} width={W} height={H * 0.08} fill="#2b7d19" />
            <text x={W * 0.05} y={H * 0.055} fontSize={fs * 1.1} fill="#fff" fontWeight={700}>
              Receipt
            </text>
            <text x={W / 2} y={Math.min(data.map === 5 && data.qr ? data.qr.y - data.qr.h / 2 : H, (buttons[0]?.y ?? H * 0.4) - (buttons[0]?.h ?? 6) / 2) - fs * 0.8} fontSize={fs} fill="#374151" textAnchor="middle">
              How would you like your receipt?
            </text>
            {data.map === 5 && data.qr ? <Qr q={data.qr} /> : null}
            {buttons.map((b) => (
              <g key={b.name}>
                <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} rx={Math.min(1.5, b.h / 4)} fill={b.name === 'Scan for receipt' ? '#e7f6e2' : '#ffffff'} stroke="#c3cad3" strokeWidth={0.3} />
                <text x={b.x} y={b.y + fs * 0.35} fontSize={Math.min(fs, b.h * 0.62)} fill="#111827" textAnchor="middle" fontWeight={600}>
                  {b.name}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            {ticks.map((v) => (
              <g key={v} opacity={0.5}>
                {v <= W ? <line x1={v} y1={0} x2={v} y2={H} stroke="#24324d" strokeWidth={v % 50 === 0 ? 0.4 : 0.15} /> : null}
                {v <= H ? <line x1={0} y1={v} x2={W} y2={v} stroke="#24324d" strokeWidth={v % 50 === 0 ? 0.4 : 0.15} /> : null}
                {v <= W && v > 0 && v % 20 === 0 ? (
                  <text x={v + 0.6} y={fs * 0.8} fontSize={fs * 0.6} fill="#6f86b8">
                    {v}
                  </text>
                ) : null}
                {v <= H && v > 0 && v % 20 === 0 ? (
                  <text x={0.8} y={v - 0.6} fontSize={fs * 0.6} fill="#6f86b8">
                    {v}
                  </text>
                ) : null}
              </g>
            ))}
            <text x={W / 2} y={H - fs} fontSize={fs * 0.75} fill="#6f86b8" textAnchor="middle">
              (0,0) = top-left · the robot only knows millimetres
            </text>
          </>
        )}
        {reveal ? <Overlay data={data} /> : null}
        {hover && !reveal ? (
          <g pointerEvents="none">
            <line x1={hover.x} y1={0} x2={hover.x} y2={H} stroke="#f5b301" strokeWidth={0.25} />
            <line x1={0} y1={hover.y} x2={W} y2={hover.y} stroke="#f5b301" strokeWidth={0.25} />
          </g>
        ) : null}
        {payload?.tap ? (
          <g pointerEvents="none">
            <circle cx={payload.tap.x} cy={payload.tap.y} r={Math.min(W, H) * 0.03} fill="none" stroke={payload.result === 'hit' ? '#63d443' : '#ef4b3f'} strokeWidth={0.6} />
            <circle cx={payload.tap.x} cy={payload.tap.y} r={0.7} fill={payload.result === 'hit' ? '#63d443' : '#ef4b3f'} />
          </g>
        ) : null}
      </svg>
    </div>
  );
}

function Overlay({ data }: { data: ReceiptData }) {
  return (
    <g pointerEvents="none">
      {([4, 5] as const).map((m) =>
        data.maps[m].map((b) => (
          <g key={`${m}${b.name}`}>
            <rect x={b.x - b.w / 2} y={b.y - b.h / 2} width={b.w} height={b.h} fill={m === 4 ? 'rgba(74,168,255,0.16)' : 'rgba(99,212,67,0.16)'} stroke={m === 4 ? C4 : C5} strokeWidth={b.name === data.ask ? 0.7 : 0.3} strokeDasharray={m === 4 ? '1.2 0.8' : undefined} />
            {b.name === data.ask ? <circle cx={b.x} cy={b.y} r={0.8} fill={m === 4 ? C4 : C5} /> : null}
          </g>
        )),
      )}
    </g>
  );
}

function Qr({ q }: { q: NonNullable<ReceiptData['qr']> }) {
  const n = 9;
  const s = Math.min(q.w, q.h) / n;
  const x0 = q.x - (s * n) / 2;
  const y0 = q.y - (s * n) / 2;
  const cells: ReactElement[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const finder = (i < 3 && j < 3) || (i < 3 && j > n - 4) || (i > n - 4 && j < 3);
      const on = finder ? !(i % (n - 1) === 1 || j % (n - 1) === 1) || (i === 1 && j === 1) : (i * 7 + j * 13 + i * j) % 3 === 0;
      if (on) cells.push(<rect key={`${i}-${j}`} x={x0 + j * s} y={y0 + i * s} width={s} height={s} fill="#111" />);
    }
  return <g>{cells}</g>;
}
