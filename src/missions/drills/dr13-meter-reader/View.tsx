/** DR13 Meter Reader — the power chain with probe markers, a multimeter LCD, and four diagnoses. */
import { useGame } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, type DrillHandle } from '../common/useDrill';
import { McqBoard } from '../common/McqBoard';
import { Legend, Prompt, Waiting } from '../common/ui';
import { displayOrder } from '../common/rng';
import type { ChainNode, MeterData, MeterReading } from './logic';
import './style.css';

const NODES: Record<ChainNode, { x: number; y: number; label: string; sub: string }> = {
  wall: { x: 50, y: 92, label: 'Wall', sub: '120 V AC' },
  meanwell: { x: 170, y: 92, label: 'Mean Well', sub: '→ 24 V DC' },
  rail: { x: 290, y: 92, label: '24 V rail', sub: 'DC bus' },
  reg5: { x: 410, y: 46, label: 'Step-down', sub: '5 V 10 A' },
  fuse5: { x: 530, y: 46, label: 'Inline fuse', sub: '5 V line' },
  pi: { x: 650, y: 46, label: 'Pi', sub: 'Robot Pi' },
  reg12: { x: 410, y: 138, label: 'Step-down', sub: '12 V' },
  fuse12: { x: 530, y: 138, label: 'Inline fuse', sub: '12 V line' },
  nuc: { x: 650, y: 138, label: 'NUC', sub: 'Windows' },
  strip: { x: 170, y: 206, label: 'AC strip', sub: 'commercial' },
  lab: { x: 290, y: 206, label: 'LabSim PSU', sub: '18 V device' },
};

const EDGES: [ChainNode, ChainNode][] = [
  ['wall', 'meanwell'],
  ['meanwell', 'rail'],
  ['rail', 'reg5'],
  ['reg5', 'fuse5'],
  ['fuse5', 'pi'],
  ['rail', 'reg12'],
  ['reg12', 'fuse12'],
  ['fuse12', 'nuc'],
  ['wall', 'strip'],
  ['strip', 'lab'],
];

export function View(props: DrillComponentProps) {
  const d = useDrill<MeterData>(props);
  const seed = useGame((s) => s.session.drill?.seed ?? 0);
  const it = d.item;
  if (!it) return <Waiting />;
  const order = displayOrder(it.data.options.length, `${d.itemKey}:${seed}`);
  const options = order.map((i) => ({ label: it.data.options[i]! }));
  const probed = new Set(it.data.readings.map((r) => r.at));
  return (
    <div className="dr13" key={d.itemKey}>
      <Prompt eyebrow={<>Meter Reader · {it.data.powered ? <span className="dr13-live">circuit LIVE</span> : <span className="dr13-off">power OFF</span>}</>}>{it.data.scenario}</Prompt>
      <div className="dr13-bench">
        <svg className="dr13-chain" viewBox="0 0 700 240" role="img" aria-label="Power chain">
          {EDGES.map(([a, b]) => {
            const A = NODES[a];
            const B = NODES[b];
            const ac = a === 'wall' || b === 'strip' || b === 'lab';
            return <path key={a + b} d={`M${A.x} ${A.y} C ${(A.x + B.x) / 2} ${A.y}, ${(A.x + B.x) / 2} ${B.y}, ${B.x} ${B.y}`} className={`dr13-wire${ac ? ' is-ac' : ''}`} />;
          })}
          {(Object.keys(NODES) as ChainNode[]).map((k) => {
            const N = NODES[k];
            const on = probed.has(k);
            return (
              <g key={k} className={`dr13-node${on ? ' is-probed' : ''}`} transform={`translate(${N.x} ${N.y})`}>
                <rect x={-48} y={-20} width={96} height={40} rx={9} />
                <text y={-3} className="dr13-node__l">
                  {N.label}
                </text>
                <text y={12} className="dr13-node__s">
                  {N.sub}
                </text>
                {on ? (
                  <g className="dr13-probe">
                    <line x1={-10} y1={-20} x2={-22} y2={-40} className="is-red" />
                    <line x1={10} y1={-20} x2={22} y2={-40} className="is-black" />
                    <circle cx={-22} cy={-40} r={4} className="is-red" />
                    <circle cx={22} cy={-40} r={4} className="is-black" />
                  </g>
                ) : null}
              </g>
            );
          })}
        </svg>
        <Meter readings={it.data.readings} />
      </div>
      <McqBoard d={d as DrillHandle<unknown>} options={options} correct={order.indexOf(it.data.answer)} columns={2} detailFor={(i) => `you picked “${String(options[i]?.label)}”`} />
      <Legend items={[['A–D', 'diagnose'], ['', 'Ω only with the power off and the part removed']]} />
    </div>
  );
}

function Meter({ readings }: { readings: MeterReading[] }) {
  const mode = readings[readings.length - 1]?.mode ?? 'V⎓';
  const angle = mode === 'Ω' ? 40 : mode === 'V~' ? -40 : 0;
  return (
    <div className="dr13-meter">
      <div className="dr13-meter__lcd">
        {readings.map((r, i) => (
          <div key={i} className="dr13-meter__row">
            <span className="dr13-meter__where">{r.label}</span>
            <span className="dr13-meter__val">
              {r.value}
              <small>{r.mode}</small>
            </span>
          </div>
        ))}
      </div>
      <div className="dr13-meter__dial">
        <span className={`dr13-meter__mark${mode === 'V~' ? ' is-on' : ''}`} style={{ left: '14%' }}>
          V~
        </span>
        <span className={`dr13-meter__mark${mode === 'V⎓' ? ' is-on' : ''}`} style={{ left: '50%' }}>
          V⎓
        </span>
        <span className={`dr13-meter__mark${mode === 'Ω' ? ' is-on' : ''}`} style={{ left: '86%' }}>
          Ω
        </span>
        <div className="dr13-meter__knob" style={{ transform: `rotate(${angle}deg)` }} />
      </div>
      <div className="dr13-meter__jacks">
        <span className="is-black">COM</span>
        <span className="is-red">VΩ</span>
      </div>
    </div>
  );
}
