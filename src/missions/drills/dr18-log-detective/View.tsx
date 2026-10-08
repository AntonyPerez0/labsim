/**
 * DR18 Log Detective — one evidence snippet, four root causes. After the call, the case file opens: the
 * incident's full symptom list and, for a wrong call, where you should have looked.
 */
import type { DrillComponentProps } from '../../types';
import { keyIndex, useDrill, useKeys } from '../common/useDrill';
import { Choice, Legend, Prompt, Reveal, Waiting } from '../common/ui';
import type { LogData } from './logic';
import './style.css';

const SOURCE_LABEL: Record<string, string> = {
  Notes: 'Orca · Notes',
  Jenkins: 'Jenkins · Console',
  Terminal: 'Terminal',
  IDE: 'IntelliJ IDEA',
  GitHub: 'GitHub · diff',
  Ollama: 'Ollama',
  GIMP: 'GIMP',
  Tablet: 'Status tablet',
  LED: 'LEDs',
  Camera: 'Camera app',
  Orca: 'Orca',
  LabChat: 'LabChat',
  World: 'In the lab',
  HUD: 'HUD',
};

export function View(props: DrillComponentProps) {
  const d = useDrill<LogData, { pick: number }>(props);
  const it = d.item;
  const staged = d.staged;

  const pick = (i: number) => {
    if (!it || staged || i < 0 || i >= it.data.options.length) return;
    const ok = i === it.data.answer;
    d.stage({ correct: ok, detail: ok ? undefined : it.data.options[i]!.hint ?? undefined }, { pick: i });
  };

  useKeys(
    (e) => {
      const { digit, letter } = keyIndex(e);
      const i = digit >= 1 ? digit - 1 : letter >= 0 && letter < 4 ? letter : -1;
      if (i >= 0) {
        e.preventDefault();
        pick(i);
      }
    },
    [it?.id, !!staged],
    { enabled: !staged },
  );

  if (!it) return <Waiting />;
  const p = staged?.payload.pick ?? null;
  return (
    <div className="dr18" key={d.itemKey}>
      <Prompt eyebrow={<>Case {it.data.incidentId} · what is the root cause?</>}>
        <div className={`dr18-ev is-${it.data.where.toLowerCase()}`}>
          <div className="dr18-ev__src">{SOURCE_LABEL[it.data.where] ?? it.data.where}</div>
          <pre className="dr18-ev__text">{it.data.evidence}</pre>
        </div>
      </Prompt>
      <div className="dr18-opts">
        {it.data.options.map((o, i) => (
          <Choice
            key={i}
            k={String.fromCharCode(65 + i)}
            label={o.text}
            disabled={!!staged}
            state={p === null ? null : i === it.data.answer ? (p === i ? 'right' : 'missed') : p === i ? 'wrong' : null}
            onPick={() => pick(i)}
          />
        ))}
      </div>
      {staged ? (
        <Reveal
          correct={staged.verdict.correct}
          points={staged.points}
          multiplier={staged.multiplier}
          autoMs={1600}
          title={staged.verdict.correct ? `Solved — ${it.data.incidentName}` : `It was: ${it.data.options[it.data.answer]!.text}`}
          onNext={() => d.commit()}
        >
          {!staged.verdict.correct && p !== null && it.data.options[p]!.hint ? <p className="dr18-hint">{it.data.options[p]!.hint}</p> : null}
          <ul className="dr18-symptoms">
            {it.data.symptoms.map((s, i) => (
              <li key={i} className={s.text === it.data.evidence ? 'is-shown' : ''}>
                <span className="dr18-tag">{s.where}</span> {s.text}
              </li>
            ))}
          </ul>
        </Reveal>
      ) : (
        <Legend items={[['A–D', 'call the root cause'], ['⏎', 'next case after the reveal']]} />
      )}
    </div>
  );
}
