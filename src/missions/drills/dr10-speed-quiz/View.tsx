/**
 * DR10 Speed Quiz — rapid curriculum questions (A–D / 1–2 for true-false) with the module chip; every 5th
 * item is a hotspot: click the right part of a render.
 */
import { useGame } from '@/core/store';
import { questionById } from '@/content';
import type { DrillComponentProps } from '../../types';
import { useDrill, useQuickAnswer, type DrillHandle } from '../common/useDrill';
import { McqBoard } from '../common/McqBoard';
import { Legend, Prompt, Rich, Waiting } from '../common/ui';
import { displayOrder } from '../common/rng';
import { Scene } from './scenes';
import type { HotspotData, QuizData, SpeedData } from './logic';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<SpeedData>(props);
  const it = d.item;
  if (!it) return <Waiting />;
  if (it.data.kind === 'hotspot') return <Hotspot key={d.itemKey} d={d} data={it.data} />;
  const quiz = asQuiz(it.data, it.questionId);
  return quiz ? <Quiz key={d.itemKey} d={d} data={quiz} /> : <Waiting />;
}

/** Runtime quiz items (Weak Spot / generic banks) carry only `{ questionId }` — fill in the rest. */
function asQuiz(data: SpeedData | { questionId?: string }, questionId?: string): QuizData | null {
  if ((data as QuizData).kind === 'quiz') return data as QuizData;
  const q = questionById((data as { questionId?: string }).questionId ?? questionId ?? '');
  if (!q || typeof q.answer !== 'number' || !q.options) return null;
  return { kind: 'quiz', questionId: q.id, prompt: q.prompt, options: [...q.options], answer: q.answer, moduleId: q.moduleId };
}

function Quiz({ d, data }: { d: DrillHandle<SpeedData>; data: QuizData }) {
  const seed = useGame((s) => s.session.drill?.seed ?? 0);
  const tf = data.options.length === 2 && data.options[0] === 'True';
  const order = tf ? [0, 1] : displayOrder(data.options.length, `${d.itemKey}:${seed}`);
  const options = order.map((i) => ({ label: data.options[i]! }));
  return (
    <div className="dr10">
      <Prompt
        eyebrow={
          <>
            <span className="dr10-chip">{data.moduleId}</span> {data.questionId} · {tf ? 'true or false' : 'multiple choice'}
          </>
        }
      >
        <Rich text={data.prompt} />
      </Prompt>
      <McqBoard d={d as DrillHandle<unknown>} options={options} correct={order.indexOf(data.answer)} columns={tf ? 2 : 2} keys={tf ? 'digits' : 'letters'} detailFor={(i) => `you picked “${String(options[i]?.label ?? '')}”`} />
      <Legend items={[[tf ? '1–2' : 'A–D', 'answer'], ['', 'every 5th question is a hotspot']]} />
    </div>
  );
}

function Hotspot({ d, data }: { d: DrillHandle<SpeedData>; data: HotspotData }) {
  const q = useQuickAnswer<string>(d, { right: 380, wrong: 1100 });
  const marks = { right: q.picked ? data.target : null, wrong: q.picked && !q.picked.correct ? q.picked.key : null };
  return (
    <div className="dr10 is-hot">
      <Prompt eyebrow={<span className="dr10-hot">Hotspot · click it</span>}>{data.prompt}</Prompt>
      <div className="dr10-scene">
        <Scene
          scene={data.scene}
          yellow={data.target === 'park-all'}
          marks={marks}
          disabled={q.locked}
          onPick={(region, el) => q.answer(region, region === data.target, el, region === data.target ? {} : { detail: `you clicked ${region.replace(/-/g, ' ')}` })}
        />
        {q.picked ? <div className={`dr10-label ${q.picked.correct ? 'is-right' : 'is-wrong'}`}>{data.label}</div> : null}
      </div>
      <Legend items={[['', 'mouse: click the part of the render']]} />
    </div>
  );
}
