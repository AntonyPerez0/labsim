/**
 * Drill scoring (GP §2.4.1) — pure helpers shared by every drill. The runtime host (`runtime/drills/host.ts`)
 * applies the standard formula itself; drills use these to preview points in their reveal panels and to
 * compute `pointsOverride` for the custom-scored drills (DR02, DR04, DR05, DR06, DR19).
 */
import type { Medal } from '@/core/state';

export const DRILL_POINTS = {
  correct: 100,
  wrong: -50,
  speedMax: 50,
  /** Full speed bonus at ≤ 2 s … */
  speedFullS: 2,
  /** … falling linearly to 0 at 8 s. */
  speedZeroS: 8,
  streakStep: 0.1,
  maxMultiplier: 2,
} as const;

/** +50 at ≤ 2 s, linear to +0 at 8 s. */
export function speedBonus(ms: number): number {
  const s = Math.max(0, ms) / 1000;
  if (s <= DRILL_POINTS.speedFullS) return DRILL_POINTS.speedMax;
  if (s >= DRILL_POINTS.speedZeroS) return 0;
  return DRILL_POINTS.speedMax * (1 - (s - DRILL_POINTS.speedFullS) / (DRILL_POINTS.speedZeroS - DRILL_POINTS.speedFullS));
}

/** In-drill streak multiplier ×(1 + 0.1·streak), max ×2.0. */
export function streakMultiplier(streak: number): number {
  return Math.min(DRILL_POINTS.maxMultiplier, 1 + DRILL_POINTS.streakStep * Math.max(0, streak));
}

/** Standard points for one answer, given the streak *before* it (same formula as the runtime host). */
export function standardPoints(correct: boolean, ms: number, streakBefore: number): { points: number; multiplier: number } {
  if (!correct) return { points: DRILL_POINTS.wrong, multiplier: 1 };
  const multiplier = streakMultiplier(streakBefore);
  return { points: Math.round((DRILL_POINTS.correct + speedBonus(ms)) * multiplier), multiplier };
}

/** What the runtime will award for a verdict (override wins). */
export function previewPoints(v: { correct: boolean; pointsOverride?: number }, ms: number, streakBefore: number): number {
  return v.pointsOverride ?? standardPoints(v.correct, ms, streakBefore).points;
}

export function medalFor(medals: Readonly<Record<Medal, number>>, score: number): Medal | null {
  if (score >= medals.gold) return 'gold';
  if (score >= medals.silver) return 'silver';
  if (score >= medals.bronze) return 'bronze';
  return null;
}

/** The round summary a drill reports (the runtime builds the same from its answer log). */
export interface RoundSummary {
  score: number;
  accuracy: number;
  correct: number;
  total: number;
}

export function summarise(answers: readonly { correct: boolean; points: number }[]): RoundSummary {
  const correct = answers.filter((a) => a.correct).length;
  const total = answers.length;
  const score = answers.reduce((s, a) => Math.max(0, s + a.points), 0);
  return { score, accuracy: total ? correct / total : 0, correct, total };
}

/* ── custom scoring rules ── */

/** DR02: +40 per correct key; all 11 correct +100. */
export function configPoints(correctKeys: number, totalKeys = 11): number {
  return correctKeys * 40 + (correctKeys === totalKeys ? 100 : 0);
}

/** DR05: mean |px error| of the 4 edges → 150 / 100 / 50 / 0. */
export function edgeErrorPoints(e: number): number {
  if (e <= 1) return 150;
  if (e <= 3) return 100;
  if (e <= 6) return 50;
  return 0;
}

/** Mean absolute edge error between two px boxes {x, y, w, h}. */
export function edgeError(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): number {
  const l = Math.abs(a.x - b.x);
  const t = Math.abs(a.y - b.y);
  const r = Math.abs(a.x + a.w - (b.x + b.w));
  const btm = Math.abs(a.y + a.h - (b.y + b.h));
  return (l + t + r + btm) / 4;
}

/** DR06: clicked line exact 100, ±1 50, else 0; + fix pick. */
export function lineClickPoints(clicked: number, target: number): number {
  const d = Math.abs(clicked - target);
  return d === 0 ? 100 : d === 1 ? 50 : 0;
}

/** DR19: per target 300 − 10 × seconds (min 50); each `:5555` −100. */
export function speedrunPoints(seconds: number, port5555Uses: number): number {
  return Math.max(50, Math.round(300 - 10 * seconds)) - 100 * port5555Uses;
}
