/**
 * Shift scoring (GP §2.3.8–§2.3.10) as pure functions:
 *
 *   ticketScore = round(base × T × H × M) + diagnosisBonus + ackBonus + processBonuses − penalties
 *
 * In the runtime the ack bonus, Diagnosis Call points and penalties hit the shift score when they happen;
 * the resolve adds `round(base × T × H × M)` + process bonuses, and the ticket breakdown shows all parts.
 */
import type { ShiftGrade } from '@/core/state';

/** T(r): r ≤ 0.5·par → 1.5 · ≤ par → 1.5→1.0 · ≤ SLA → 1.0→0.5 · > SLA → 0.25. */
export function timeFactor(rS: number, parS: number, slaS: number): number {
  const half = 0.5 * parS;
  if (rS <= half) return 1.5;
  if (rS <= parS) return 1.5 - (0.5 * (rS - half)) / Math.max(1e-9, parS - half);
  if (rS <= slaS) return 1.0 - (0.5 * (rS - parS)) / Math.max(1e-9, slaS - parS);
  return 0.25;
}

/** H: 1.0 none · 0.9 Nudge · 0.75 Pointer · 0.5 Walkthrough. */
export function hintFactor(tier: number): number {
  return [1.0, 0.9, 0.75, 0.5][Math.max(0, Math.min(3, tier))]!;
}

/** M = min(3.0, 1.0 + 0.25 × combo). */
export function comboMultiplier(combo: number): number {
  return Math.min(3, 1 + 0.25 * Math.max(0, combo));
}

/** Combo +1 when: Fast Diagnosis, zero penalty events on the ticket, r ≤ par, hint tier ≤ 2. */
export function comboEligible(o: { fastDiagnosis: boolean; ticketPenalties: number; rS: number; parS: number; hintTier: number }): boolean {
  return o.fastDiagnosis && o.ticketPenalties === 0 && o.rS <= o.parS && o.hintTier <= 2;
}

export interface TicketScoreInput {
  base: number;
  rS: number;
  parS: number;
  slaS: number;
  hintTier: number;
  /** Combo value after this ticket's increment. */
  comboAfter: number;
  diagnosisBonus?: number;
  ackBonus?: number;
  processBonus?: number;
  penalties?: number;
  /** Wildcard shifts score tickets ×1.2 (GP §2.3.1). */
  wildcard?: boolean;
}

export function ticketCore(i: TicketScoreInput): number {
  const raw = i.base * timeFactor(i.rS, i.parS, i.slaS) * hintFactor(i.hintTier) * comboMultiplier(i.comboAfter);
  return Math.round(raw * (i.wildcard ? 1.2 : 1));
}

export function ticketScore(i: TicketScoreInput): number {
  return ticketCore(i) + (i.diagnosisBonus ?? 0) + (i.ackBonus ?? 0) + (i.processBonus ?? 0) - Math.abs(i.penalties ?? 0);
}

/** Diagnosis Call points: correct +0.25 × base, wrong −0.10 × base. */
export function callPoints(base: number, correct: boolean): number {
  return correct ? Math.round(0.25 * base) : -Math.round(0.1 * base);
}

/** GP §2.3.10 grade. Ending on strikes caps the grade at D. */
export function shiftGrade(ratio: number, strikes: number, breaches: number, endedOnStrikes = false): ShiftGrade {
  if (endedOnStrikes) return 'D';
  if (ratio >= 1.5 && strikes === 0 && breaches === 0) return 'S';
  if (ratio >= 1.15) return 'A';
  if (ratio >= 0.85) return 'B';
  if (ratio >= 0.55) return 'C';
  return 'D';
}

/** Pipeline uptime end bonus: ≥ 95 % → +500, ≥ 85 % → +250. */
export function uptimeBonus(uptime: number): number {
  if (uptime >= 0.95) return 500;
  if (uptime >= 0.85) return 250;
  return 0;
}

export const ACK_BONUS = 10;
export const ACK_WINDOW_S = 10;
export const BREACH_PENALTY = 150;
export const HANDOVER_DEBT = 50;
export const ESCALATION_BOUNCE_PENALTY = 100;
export const ESCALATION_BOUNCE_S = 20;
export const PIPELINE_GREEN = 20;
export const PIPELINE_RED = -20;
export const PIPELINE_BLOCKED = -10;

/** Shift XP: floor(score / 10) + grade bonus; ×1.25 in Strict; min 0 (GP §4.2). */
export function shiftXp(score: number, grade: ShiftGrade, strict: boolean, gradeBonus: Record<string, number>): number {
  const xp = Math.floor(Math.max(0, score) / 10) + (gradeBonus[grade] ?? 0);
  return Math.max(0, Math.round(xp * (strict ? 1.25 : 1)));
}
