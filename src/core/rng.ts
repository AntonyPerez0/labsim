/**
 * Seeded, serialisable PRNG (mulberry32). The state is a single uint32 so it can live in the
 * game store and survive save/load, keeping arcade shifts and fault injection deterministic.
 */
export interface RngState {
  seed: number;
  state: number;
}

export function createRngState(seed: number): RngState {
  const s = seed >>> 0 || 0x9e3779b9;
  return { seed: s, state: s };
}

/** Advances `rng.state` in place and returns a float in [0, 1). Works on immer drafts. */
export function nextFloat(rng: RngState): number {
  let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function nextInt(rng: RngState, minInclusive: number, maxInclusive: number): number {
  return minInclusive + Math.floor(nextFloat(rng) * (maxInclusive - minInclusive + 1));
}

export function pick<T>(rng: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from empty list');
  return items[Math.floor(nextFloat(rng) * items.length)]!;
}

export function chance(rng: RngState, p: number): boolean {
  return nextFloat(rng) < p;
}

export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(nextFloat(rng) * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Stable 32-bit hash of a string (FNV-1a) — e.g. to derive a daily-challenge seed from a date. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
