/**
 * Adaptive selection (GP §4.8.4): incident / drill-item weights toward weak and overdue tags.
 *
 *   weakness(i) = mean over t of (1 − mEff_t)
 *   overdue(i)  = max over t of clamp(daysSince / halfLife, 0, 3)
 *   w(i)        = weakness^1.5 × (1 + 0.5 × overdue) × fit × fresh
 *
 * Shift picks: 60 % weighted, 30 % uniform, 10 % never-seen (fallback uniform). Drills 70 / 30.
 */
import type { RngState } from '@/core/rng';
import { nextFloat, pick } from '@/core/rng';
import type { ProgressState } from '@/core/state';
import { effectiveMastery, overdue } from '../progression/mastery';
import { realNowMs } from '../clock';

export interface WeightedItem {
  id: string;
  tags: readonly string[];
  fit: boolean;
}

export function weakness(p: ProgressState, tags: readonly string[], now: number = realNowMs()): number {
  if (!tags.length) return 1;
  let sum = 0;
  for (const t of tags) sum += 1 - effectiveMastery(p.tagMastery[t], now);
  return sum / tags.length;
}

export function overdueOf(p: ProgressState, tags: readonly string[], now: number = realNowMs()): number {
  let m = 0;
  for (const t of tags) m = Math.max(m, overdue(p.tagMastery[t], now));
  return m;
}

export function itemWeight(p: ProgressState, item: WeightedItem, recent: readonly string[], now: number = realNowMs()): number {
  if (!item.fit) return 0;
  const fresh = recent.slice(-3).includes(item.id) ? 0.25 : 1;
  const w = Math.pow(weakness(p, item.tags, now), 1.5) * (1 + 0.5 * overdueOf(p, item.tags, now)) * fresh;
  // Fully mastered items keep a floor so they still appear occasionally.
  return Math.max(w, 0.02 * fresh);
}

export function weightedPick<T extends WeightedItem>(rng: RngState, items: readonly T[], weights: readonly number[]): T | null {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let r = nextFloat(rng) * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1] ?? null;
}

/**
 * GP §4.8.4 shift pick over eligible items. `seen(id)` = the player has met this incident before.
 * Returns null when nothing fits.
 */
export function pickIncident<T extends WeightedItem>(
  rng: RngState,
  p: ProgressState,
  items: readonly T[],
  opts: { recent: readonly string[]; seen: (id: string) => boolean; mode: 'shift' | 'drill' | 'uniform' },
): T | null {
  const fit = items.filter((i) => i.fit);
  if (!fit.length) return null;
  if (opts.mode === 'uniform') return pick(rng, fit);
  const r = nextFloat(rng);
  const weightedShare = opts.mode === 'drill' ? 0.7 : 0.6;
  if (r < weightedShare) {
    const now = realNowMs();
    const ws = fit.map((i) => itemWeight(p, i, opts.recent, now));
    return weightedPick(rng, fit, ws) ?? pick(rng, fit);
  }
  if (opts.mode === 'shift' && r >= 0.9) {
    const unseen = fit.filter((i) => !opts.seen(i.id));
    if (unseen.length) return pick(rng, unseen);
  }
  return pick(rng, fit);
}

/** Top-N items by weight (Weak Spot micro-shift: highest-w incidents for the weak tags). */
export function topByWeight<T extends WeightedItem>(p: ProgressState, items: readonly T[], n: number, focusTags: readonly string[] = []): T[] {
  const now = realNowMs();
  return items
    .filter((i) => i.fit)
    .map((i) => ({ i, w: itemWeight(p, i, [], now) * (focusTags.length && i.tags.some((t) => focusTags.includes(t)) ? 4 : 1) }))
    .sort((a, b) => b.w - a.w || a.i.id.localeCompare(b.i.id))
    .slice(0, n)
    .map((x) => x.i);
}
