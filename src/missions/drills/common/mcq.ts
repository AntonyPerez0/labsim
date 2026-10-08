/** Data shape shared by the bank-based multiple-choice drills (DR12, DR14, DR17). */
import type { DrillItem } from '../../types';
import { teach } from './teach';

export interface McqData {
  prompt: string;
  /** Options in authoring order; `answer` indexes this list. The view shuffles them per draw. */
  options: string[];
  answer: number;
  /** Optional evidence / context block shown under the prompt. */
  context?: string;
  /** Short category chip ("Card data", "Hardware"…). */
  category?: string;
}

export function mcqItem(
  id: string,
  prompt: string,
  correct: string,
  distractors: string[],
  why: string,
  o: { tags: string[]; facts: string[]; ref?: string; context?: string; category?: string; illustrative?: boolean; doInstead?: string },
): DrillItem<McqData> {
  return {
    id,
    tags: o.tags,
    factIds: o.facts,
    teach: teach(`Answer: ${correct}`, why, { ref: o.ref, factIds: o.facts, illustrative: o.illustrative, doInstead: o.doInstead ?? `Pick “${correct}”.`, tag: o.tags[0] }),
    data: { prompt, options: [correct, ...distractors], answer: 0, context: o.context, category: o.category },
  };
}
