/** DR14 Who You Gonna Call — a problem card and five contact cards (keys 1–5). */
import { TEAM } from '@/content';
import type { DrillComponentProps } from '../../types';
import { useDrill, type DrillHandle } from '../common/useDrill';
import { McqBoard } from '../common/McqBoard';
import { Legend, Prompt, Rich, Waiting } from '../common/ui';
import { CALLEES, CALLEE_LABEL, CALLEE_ROLE, type CallData } from './logic';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<CallData>(props);
  const it = d.item;
  if (!it) return <Waiting />;
  const options = CALLEES.map((c) => ({
    label: (
      <span className="dr14-who">
        <span className="dr14-avatar" style={{ background: c === 'self' ? '#2b7d19' : TEAM[c]?.color ?? '#444' }}>
          {c === 'self' ? 'YOU' : CALLEE_LABEL[c].slice(0, 1)}
        </span>
        <span className="dr14-who__text">
          <b>{CALLEE_LABEL[c]}</b>
          <small>{CALLEE_ROLE[c]}</small>
        </span>
      </span>
    ),
  }));
  return (
    <div className="dr14" key={d.itemKey}>
      <Prompt eyebrow="Incoming problem">
        <Rich text={it.data.problem} />
      </Prompt>
      {it.data.evidence ? <pre className="dk-context">{it.data.evidence}</pre> : null}
      <McqBoard d={d as DrillHandle<unknown>} options={options} correct={CALLEES.indexOf(it.data.answer)} columns={5} keys="digits" detailFor={(i) => `you called ${CALLEE_LABEL[CALLEES[i]!]}`} />
      <Legend items={[['1–5', 'route the problem']]} />
    </div>
  );
}
