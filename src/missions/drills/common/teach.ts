/** Teach Card helper for drill items (GP §5.5): what's right + why (citing the fact), never just "wrong". */
import type { DrillItem } from '../../types';

export type DrillTeach = DrillItem['teach'];

export function teach(
  whatHappened: string,
  why: string,
  opts: { doInstead?: string; ref?: string; factIds?: string[]; illustrative?: boolean; tag?: string; practiceDrillId?: string; manualArticleId?: string } = {},
): DrillTeach {
  return { whatHappened, why, ...opts };
}

/** `Ref §3` style label from a fact's curriculum ref (`§3.1` → `Ref §3.1`). */
export function refLabel(ref: string | undefined): string | undefined {
  if (!ref) return undefined;
  return ref.startsWith('§') ? `Ref ${ref}` : ref;
}
