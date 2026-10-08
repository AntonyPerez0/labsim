/** DR01 Status Triage — scenario card + five status keys. Assist captions fade once you're on a streak. */
import type { DrillComponentProps } from '../../types';
import { useDrill, useKeys, keyIndex, useQuickAnswer } from '../common/useDrill';
import { Choice, Legend, Prompt, Rich, Waiting } from '../common/ui';
import { STATUSES, STATUS_COLOR, STATUS_HINT, type StatusName } from '../common/statuses';
import type { TriageData, TriageRender } from './logic';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<TriageData>(props);
  const q = useQuickAnswer<StatusName>(d);
  const it = d.item;
  const assist = d.streak < 4 && d.index < 10;

  const pick = (s: StatusName, el?: Element | null) => {
    if (!it || q.locked) return;
    const ok = s === it.data.answer;
    q.answer(s, ok, el ?? document.querySelector(`[data-dr01="${s}"]`), ok ? {} : { detail: `you picked ${s}` });
  };

  useKeys(
    (e) => {
      const { digit } = keyIndex(e);
      if (digit >= 1 && digit <= 5) {
        e.preventDefault();
        pick(STATUSES[digit - 1]!);
      }
    },
    [it?.id, q.locked],
  );

  if (!it) return <Waiting />;
  const level = it.data.level;
  return (
    <div className="dr01" key={d.itemKey}>
      <Prompt eyebrow={<>Triage · {level === 1 ? 'definition' : level === 2 ? 'scenario' : 'trap'}</>}>
        <Rich text={it.data.scenario} />
      </Prompt>
      {it.data.render ? <MiniRender r={it.data.render} /> : null}
      <div className="dr01-keys">
        {STATUSES.map((s, i) => {
          const st = q.picked ? (s === it.data.answer ? (q.picked.key === s ? 'right' : 'missed') : q.picked.key === s ? 'wrong' : null) : null;
          return (
            <div key={s} data-dr01={s} className="dr01-key">
              <Choice
                k={String(i + 1)}
                tone={STATUS_COLOR[s]}
                state={st}
                disabled={q.locked}
                onPick={(el) => pick(s, el)}
                label={
                  <span className="dr01-key__label">
                    <span className="dr01-chip" style={{ background: STATUS_COLOR[s] }} />
                    {s}
                  </span>
                }
                sub={<span className={`dr01-key__hint${assist ? '' : ' is-faded'}`}>{STATUS_HINT[s]}</span>}
              />
            </div>
          );
        })}
      </div>
      <Legend items={[['1–5', 'pick a status'], ['', assist ? 'captions fade at a 4-streak' : 'captions off — you know these']]} />
    </div>
  );
}

function MiniRender({ r }: { r: TriageRender }) {
  if (r.kind === 'tablet') {
    return (
      <div className="dr01-tablet">
        <div className="dr01-tablet__head">
          <span className="dr01-tablet__name">{r.lines[0]}</span>
          <span className="dr01-tablet__status">{r.lines[1]}</span>
        </div>
        <div className="dr01-tablet__body">Reconnecting to robot controller…</div>
      </div>
    );
  }
  if (r.kind === 'orca') {
    return (
      <div className="dr01-orca">
        <div className="dr01-orca__bar">Orca · Robots</div>
        <div className="dr01-orca__row">
          {r.lines.map((l, i) => (
            <span key={i} className="dr01-orca__cell">
              {l}
            </span>
          ))}
          <span className="dr01-orca__cell dr01-orca__status">status ?</span>
        </div>
      </div>
    );
  }
  const title = { notes: 'Orca · Notes', health: 'Orca · Health log', terminal: 'Terminal', jenkins: 'Jenkins · Console' }[r.kind];
  return (
    <div className={`dr01-log is-${r.kind}`}>
      <div className="dr01-log__title">{title}</div>
      <pre className="dr01-log__body">{r.lines.join('\n')}</pre>
    </div>
  );
}
