/** Generic body for bank MCQ drills: prompt card (+ optional context block) and a shuffled McqBoard. */
import type { ReactNode } from 'react';
import { useGame } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { useDrill, type DrillHandle } from './useDrill';
import { McqBoard } from './McqBoard';
import { Legend, Prompt, Rich, Waiting } from './ui';
import { displayOrder } from './rng';
import type { McqData } from './mcq';

export function McqView({
  props,
  eyebrow,
  className,
  columns = 2,
  renderPrompt,
  renderContext,
  optionTone,
}: {
  props: DrillComponentProps;
  eyebrow: (data: McqData) => ReactNode;
  className: string;
  columns?: number;
  renderPrompt?: (data: McqData) => ReactNode;
  renderContext?: (data: McqData) => ReactNode;
  optionTone?: (label: string) => string | undefined;
}) {
  const d = useDrill<McqData>(props);
  const seed = useGame((s) => s.session.drill?.seed ?? 0);
  const it = d.item;
  if (!it) return <Waiting />;
  const order = displayOrder(it.data.options.length, `${d.itemKey}:${seed}`);
  const options = order.map((i) => ({ label: it.data.options[i]!, tone: optionTone?.(it.data.options[i]!) }));
  const correct = order.indexOf(it.data.answer);
  return (
    <div className={className} key={d.itemKey}>
      <Prompt eyebrow={eyebrow(it.data)}>{renderPrompt ? renderPrompt(it.data) : <Rich text={it.data.prompt} />}</Prompt>
      {renderContext ? renderContext(it.data) : it.data.context ? <pre className="dk-context">{it.data.context}</pre> : null}
      <McqBoard d={d as DrillHandle<unknown>} options={options} correct={correct} columns={columns} detailFor={(i) => `you picked ${String(options[i]?.label ?? '')}`} />
      <Legend items={[[options.length <= 4 ? 'A–D' : `1–${options.length}`, 'answer'], ['', 'fast answers (≤ 2 s) earn up to +50']]} />
    </div>
  );
}
