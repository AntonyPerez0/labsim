/**
 * Progression logic contracts: rank gates (GP §4.3), XP sources (GP §4.2), achievement rules
 * (GP §4.5), certification practicals (Cur §5.3, GP §2.3.12). Re-exported from `@/missions/types`.
 *
 * Display data is content-owned and NOT duplicated here:
 *  - ranks: `RANKS` / `rankForXp` / `XP_REWARDS` in `src/content/ranks.ts` (`RankDef.id` = `CareerRankId`)
 *  - achievements: `ACHIEVEMENTS_BY_ID` in `src/content/achievements.ts` (title, description, icon, xp, hidden)
 *  - exams: `EXAMS_BY_ID` in `src/content/exams.ts` (eligibility, written blueprint, practical task texts,
 *    `DISTINCTION`, `RETAKE_RULES`, `examPool()`)
 * Missions adds the executable parts below, keyed by the same ids.
 */
import type { BusRecord } from '@/core/bus';
import type { AchievementProgress, CareerRankId, CertExamId, RootState } from '@/core/state';
import type { AnyEventMatcher, Condition, ObjectiveDef } from './conditions';
import type { SetupSpec } from './common';

/* ═════════════════════════════ Ranks & XP ═════════════════════════════ */

/**
 * Extra promotion gate (GP §4.3 "Extra gate") for a rank. Promotion = exam passed AND `RankDef.minXp`
 * AND `gate(state)` empty.
 * @example { rank: 'senior-automation-engineer', gate: (s) => countAGradeShifts(s) >= 5 ? [] : [`5 shifts ≥ 10 min graded ≥ A: ${countAGradeShifts(s)}/5`] }
 */
export interface RankGateRule {
  rank: CareerRankId;
  /** Unmet requirements as display strings (empty = met). */
  gate: (state: RootState) => string[];
}

/** GP §4.2 XP sources (`xp.gained.source`). Amounts: `XP_REWARDS` in `src/content/ranks.ts`. */
export type XpSource =
  | 'academy-step'
  | 'academy-module'
  | 'academy-stars'
  | 'certification'
  | 'shift'
  | 'shift-grade'
  | 'daily'
  | 'drill'
  | 'drill-medal'
  | 'flashcard'
  | 'freeplay'
  | 'achievement';

/* ═════════════════════════════ Achievements ═════════════════════════════ */

/** Event delivered to achievement rules. */
export type AchievementEvent = Pick<BusRecord, 'type' | 'payload' | 'at'>;

/**
 * Executable rule for a GP §4.5 achievement (texts/xp/icon/hidden from content `ACHIEVEMENTS_BY_ID[id]`).
 * The runtime calls `progress` then `check` after every event matching `triggers`, and `check` once
 * at load with `ev = null` (state-only rules such as ACH02 "Complete M01–M18").
 *
 * @example
 * export const ACH16: AchievementRule = {
 *   id: 'ACH16',
 *   triggers: [on('ticket.resolved', { incidentId: 'INC05' })],
 *   check: (s, _prog, ev) => {
 *     const t = s.session.tickets.find((x) => x.id === (ev?.payload as { ticketId: string }).ticketId);
 *     return (t?.counters.powerCycles ?? 0) === 0;
 *   },
 * };
 */
export interface AchievementRule {
  /** `ACH01`…`ACH46`. */
  id: string;
  /** Events after which the rule is evaluated. */
  triggers: readonly AnyEventMatcher[];
  /** Update the persisted accumulator (`progress.achievementProgress[id]`). */
  progress?: (prev: AchievementProgress | undefined, ev: AchievementEvent, state: RootState) => AchievementProgress;
  /** Unlock when true (after `progress`). `ev` is null for the load-time check. */
  check: (state: RootState, prog: AchievementProgress | undefined, ev: AchievementEvent | null) => boolean;
  /** Progress bar for the Profile screen: [current, target]. */
  meter?: (state: RootState, prog: AchievementProgress | undefined) => [number, number];
}

/* ═════════════════════════════ Certification practicals (Cur §5.3) ═════════════════════════════ */

/**
 * Playable form of a content `PracticalTask` (same `id`): no hints, no Force health check, time scale 1.
 * @example
 * export const P1_1: PracticalTaskDef = {
 *   id: 'P1-1', examId: 'CERT-R1',
 *   setup: { run: (sim, ctx) => { const rig = pick(ctx.rng, ['wall-e', 'eve', 'bumblebee']); sim.rig.pushHead(rig, 40, 25, 'system'); } },
 *   pass: c.all(c.forAll(['wall-e', 'eve', 'bumblebee'], (r) => c.eq(p.rig(r).banner, 'GREEN'))),
 *   failIf: c.happened(on('rig.command', { command: 'park.xy' })),
 *   timeLimitGameMin: 3,
 * };
 */
export interface PracticalTaskDef {
  /** Content `PracticalTask.id` (`P1-1`). */
  id: string;
  examId: CertExamId;
  /** Overrides of the content texts (rarely needed). */
  title?: string;
  brief?: string;
  setup: SetupSpec;
  /** Cur "Pass condition". */
  pass: Condition;
  /** Fails the task at once (wrong socket, manual status override, coworker device touched …) — counts as a strike. */
  failIf?: Condition;
  objectives?: readonly ObjectiveDef[];
  /** Typed exam-form answer (P1-3: `200`). */
  answerForm?: { prompt: string; accepted: readonly string[] };
  /** Time limit in game minutes. */
  timeLimitGameMin?: number;
}

/**
 * Executable practical of a CERT-R# exam (content `EXAMS_BY_ID[examId]` holds the rest).
 * @example { examId: 'CERT-R5', kind: 'shift', shiftConfigId: 'cert-r5', incidents: 8, gameMinutes: 30, maxStrikes: 0, simultaneousAtGameMin: 10, hudObjectives: false }
 * CERT-R4/R5 run a certification shift (GP §2.3.12): time scale 1, incidents drawn per the §3.7
 * mapping, no score/combo/Call/hints/Force health check, escalation allowed, strikes = GW events
 * with a strike flag plus any wrong fix action.
 */
export type CertPracticalDef =
  | { examId: CertExamId; kind: 'tasks'; tasks: readonly PracticalTaskDef[]; maxStrikes: number }
  | {
      examId: CertExamId;
      kind: 'shift';
      /** `cert-r4` / `cert-r5` ShiftConfig. */
      shiftConfigId: string;
      incidents: number;
      gameMinutes: number;
      maxStrikes: number;
      /** R5: two incidents arrive simultaneously at minute 10. */
      simultaneousAtGameMin?: number;
      /** R5: no HUD objective text. */
      hudObjectives: boolean;
      /** R4: ≥ 1 hardware, ≥ 1 Orca, ≥ 1 code/config incident. */
      requireCategories?: readonly ('hardware' | 'orca' | 'code-config')[];
    };
