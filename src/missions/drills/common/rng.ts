/**
 * Deterministic draw helpers for drill generators. Generators receive the round's seeded `RngState` from
 * the runtime (`DrillDef.generate(rng, state, index)`), so the same seed always yields the same round
 * (Daily Drill). Never use `Math.random()` here.
 */
import { chance, createRngState, hashString, nextFloat, nextInt, pick, shuffle, type RngState } from '@/core/rng';
import type { RootState } from '@/core/state';

export { chance, nextFloat, nextInt, pick, shuffle };
export type { RngState };

/** Weighted pick (weights ≤ 0 are skipped; falls back to uniform). */
export function weightedPick<T>(rng: RngState, items: readonly T[], weight: (t: T) => number): T {
  if (!items.length) throw new Error('weightedPick() from empty list');
  const ws = items.map((t) => Math.max(0, weight(t)));
  const total = ws.reduce((a, b) => a + b, 0);
  if (total <= 0) return pick(rng, items);
  let r = nextFloat(rng) * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Mastery m of the weakest tag (unseen tags count as 0.35, i.e. "needs practice"). */
export function weakestMastery(state: RootState | null | undefined, tags: readonly string[]): number {
  const tm = state?.progress?.tagMastery ?? {};
  let m = 1;
  for (const t of tags) m = Math.min(m, tm[t]?.m ?? 0.35);
  return tags.length ? m : 0.35;
}

/** GP §4.8.4 flavour: weak tags are drawn ~3× as often as mastered ones. */
export function masteryWeight(state: RootState | null | undefined, tags: readonly string[]): number {
  return 1 + 2 * (1 - weakestMastery(state, tags));
}

/** Modules completed in this profile. An empty profile (sandbox / tests) counts as "everything unlocked". */
export function completedModules(state: RootState | null | undefined): Set<string> | null {
  const mods = state?.progress?.modules ?? {};
  const done = Object.entries(mods)
    .filter(([, m]) => m && ((m as { status?: string }).status === 'complete' || (m as { completed?: boolean }).completed))
    .map(([id]) => id);
  return done.length ? new Set(done) : null;
}

export function moduleUnlocked(state: RootState | null | undefined, moduleId: string): boolean {
  const done = completedModules(state);
  return !done || done.has(moduleId);
}

/** Tag filter of the current round (Teach Card **Practice** / Weak Spot), or null. */
export function roundTags(state: RootState | null | undefined): readonly string[] | null {
  const t = state?.session?.drill?.tags;
  return t && t.length ? t : null;
}

/** Keep candidates matching the round's tag filter (when any match), else all. */
export function filterByRoundTags<T>(state: RootState | null | undefined, items: readonly T[], tagsOf: (t: T) => readonly string[]): readonly T[] {
  const tags = roundTags(state);
  if (!tags) return items;
  const hit = items.filter((i) => tagsOf(i).some((t) => tags.some((f) => t === f || t.startsWith(`${f}.`))));
  return hit.length ? hit : items;
}

/** Recently drawn item keys of this round (avoid immediate repeats in generated rounds). */
export function recentKeys(state: RootState | null | undefined, n: number): string[] {
  const q = state?.session?.drill?.queue ?? [];
  return q.slice(-n).map((id) => id.split('#')[0]!);
}

/** Two-digit-safe random int in [a, b] that differs from every value in `avoid` (best effort). */
export function intAvoiding(rng: RngState, a: number, b: number, avoid: readonly number[]): number {
  for (let i = 0; i < 12; i++) {
    const v = nextInt(rng, a, b);
    if (!avoid.includes(v)) return v;
  }
  return nextInt(rng, a, b);
}

/**
 * Deterministic presentation order for a bank item's options (so answers are never memorised by
 * position): a permutation of 0..n-1 seeded by the item key and the run's seed.
 */
export function displayOrder(n: number, key: string): number[] {
  const rng = createRngState(hashString(key));
  return shuffle(rng, Array.from({ length: n }, (_, i) => i));
}
