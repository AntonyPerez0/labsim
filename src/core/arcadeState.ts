/**
 * Arcade session state — tickets, shift, pipelines, penalty/bonus logs (GP §2.3, §3.3).
 * Part of `RootState.session` (`session.tickets`, `session.shift`); re-exported from `@/core/state`.
 * Time conventions as in `./sessionState.ts` (`…S` = session real seconds, `…Ms` = game ms).
 */
import type { Realism, ShiftGrade } from './progressState';

export type Severity = 'P1' | 'P2' | 'P3';
export type HeatLevel = 1 | 2 | 3 | 4 | 5;
export type PipelineId = 'PL1' | 'PL2' | 'PL3' | 'PL4' | 'PL5' | 'PL6' | 'PL7' | 'PL8';
export type ShiftKind = 'standard' | 'full' | 'daily' | 'weak-spot' | 'micro' | 'certification';
export type ShiftEventId = 'firmware-rollout' | 'onboarding-day' | 'corporate-scan' | 'jared-lunch';

/* ───────────────────────────── Tickets (GP §2.3.4–§2.3.8) ───────────────────────────── */

/**
 * GP states: NEW → ACKED → IN_PROGRESS → (ESCALATED →) RESOLVED | HANDOVER (open at shift end).
 * BREACHED is the `breached` flag (the ticket stays open). `verifying` = Resolve pressed and the
 * success condition waits for its deferred trigger ("Verifying… waiting for 08:20 health check").
 * `failed` = removed without a fix (cert practical failed, Free Play fault cleared by the injector).
 */
export type TicketStatus = 'new' | 'acked' | 'in-progress' | 'escalated' | 'verifying' | 'resolved' | 'handover' | 'failed';

export type SlaBand = 'green' | 'amber' | 'red' | 'breached';

/** Rig binding of an incident instance (shared shape with `IncidentBinding` in `@/missions`). */
export interface TicketBinding {
  /** Primary rig system name (`wall-e`) or null for rig-less tickets (repos, judgement). */
  rig: string | null;
  /** Human Readable Name (`WALL-E`). */
  hrn: string | null;
  /** Every rig the incident affects (rack / Callus-box incidents). */
  rigs: string[];
  /** Resolved parameters: pi host id, IPs, fuse id, box id, device ids, seeded truth … */
  vars: Record<string, string | number | boolean>;
  /** Per-ticket seed for seeded truth values (INC57 receipt numbers, INC24 boxes). */
  seed: number;
}

export interface DiagnosisCallState {
  optionId: string;
  correct: boolean;
  /** Real seconds since arrival when the call was made. */
  atS: number;
  /** Correct within diagnosis par (0.4 × par from Ack). */
  fast: boolean;
}

export interface EscalationState {
  /** Diagnosis Call option id chosen as the cause. */
  cause: string;
  /** Exact endpoint URL chosen (from Notes or terminal history). */
  endpoint: string;
  sentAtS: number;
  outcome: 'queued' | 'pending' | 'accepted' | 'bounced';
  /** Jared bounce: when the ticket returns to the player (sent + 20 s). */
  returnsAtS: number | null;
  /** Accepted: when Jared finishes the hands-on fix (60–90 s). */
  jaredDoneAtS: number | null;
  /** Jared's bounce hint / bark. */
  message: string | null;
}

export interface TicketScoreBreakdown {
  base: number;
  /** Resolve (or correct escalation) time since arrival, real seconds. */
  rS: number;
  timeFactor: number;
  hintFactor: number;
  comboFactor: number;
  diagnosisBonus: number;
  ackBonus: number;
  processBonus: number;
  penalties: number;
  total: number;
  fastDiagnosis: boolean;
  comboAfter: number;
  breached: boolean;
}

export interface TicketState {
  /** `LAB-####`. */
  id: string;
  incidentId: string;
  variantId: string;
  /** Title as reported (the misleading variant when `misleading`). */
  title: string;
  misleading: boolean;
  summary: string;
  /** ReporterKey. */
  reporter: string;
  /** Primary rig system name (= `binding.rig`), kept for HUD convenience. */
  robotId: string | null;
  binding: TicketBinding;
  severity: Severity;
  difficulty: number;
  basePoints: number;
  parS: number;
  slaS: number;
  /** Game ms at arrival. */
  openedAtMs: number;
  /** Real seconds (session clock) at arrival / ack / first action / resolution. */
  arrivedAtS: number;
  ackedAtS: number | null;
  startedAtS: number | null;
  resolvedAtS: number | null;
  /** Real seconds left on the SLA (negative after a breach). */
  slaSecondsLeft: number;
  sla: SlaBand;
  breached: boolean;
  status: TicketStatus;
  /** Final ticket score once resolved (0 before). */
  points: number;
  hintTier: 0 | 1 | 2 | 3;
  /** Diagnosis Call shown (false for `diagnosisCall: 'none'` incidents and cert practicals). */
  canCall: boolean;
  /** Shuffled Diagnosis Call option ids (UI order). */
  callOptionOrder: string[];
  call: DiagnosisCallState | null;
  escalation: EscalationState | null;
  escalationsBounced: number;
  /** LabChat reply id chosen (`R_WAIT_PING`, `R1` …). */
  reply: string | null;
  replyAttempts: number;
  /** INC57-B "File bug" form values. */
  bug: Record<string, string | number> | null;
  /** INC61-style matching task answers (left → right). */
  matches: Record<string, string> | null;
  /** Per-ticket action counters declared by the incident (e.g. `powerCycles`). */
  counters: Record<string, number>;
  /** Ids of PenaltyEvents / BonusEvents charged to this ticket. */
  penaltyIds: string[];
  bonusIds: string[];
  /** Game ms when the immediate (non-deferred) part of the success condition last became true. */
  fixedAtMs: number | null;
  verifying: { label: string; waitingFor: 'health-check' | 'build' | 'local-run' | 'event'; sinceS: number } | null;
  resolveAttempts: number;
  score: TicketScoreBreakdown | null;
  /** Compound partner ticket (two faults on one rig, GP §2.3.3). */
  compoundWith: string | null;
  /** Wildcard: incident not yet taught ("Not yet taught" ribbon). */
  notYetTaught: boolean;
  /** Full Shift planned work (doesn't count toward max open tickets). */
  plannedWork: boolean;
  /** Sim fault instance ids injected for this ticket. */
  faultInstanceIds: string[];
  source: 'shift' | 'pipeline' | 'freeplay' | 'cert' | 'weak-spot' | 'event' | 'academy';
  /** Rig pinned on the HUD compass (after Ack). */
  pinned: boolean;
}

/* ───────────────────────────── Shift (GP §2.3) ───────────────────────────── */

export interface PipelineState {
  id: PipelineId;
  /** Jenkins job path (`Java/uia-remote-regression-flex`). */
  job: string;
  active: boolean;
  activationOrder: number;
  phase: 'inactive' | 'waiting' | 'running' | 'blocked';
  /** Real seconds until the next checkout attempt (every 30 s). */
  nextAttemptInS: number;
  /** Real seconds until the current run ends (runs last 60 s). */
  runEndsInS: number | null;
  buildId: string | null;
  robot: string | null;
  params: Record<string, string>;
  lastResult: 'SUCCESS' | 'FAILURE' | 'BLOCKED' | null;
  lastRobot: string | null;
  /** Latest console line for the HUD strip tooltip (`[orca] no Available FLEX_3 robot — build waiting in queue`). */
  lastConsoleLine: string | null;
  /** Run counter (PL1 alternates DEVICE_TYPE FLEX_3 / FLEX_4 by parity). */
  runIndex: number;
  attempts: number;
  gotRig: number;
  green: number;
  red: number;
  blocked: number;
  /** Consecutive green runs per robot (GP DSL `greenStreak(path, R)`). */
  greenStreak: Record<string, number>;
}

export interface PenaltyEvent {
  id: string;
  /** `GW01`…`GW24`, or an incident-local wrong move id (`INC03:12V-FUSE`). */
  gwId: string;
  /** Session real seconds. */
  atS: number;
  /** Game ms. */
  atMs: number;
  /** Negative points applied (e.g. −500). */
  points: number;
  strike: boolean;
  ticketId: string | null;
  detail: string;
  tag: string | null;
  teachCardId: string | null;
}

export interface BonusEvent {
  id: string;
  /** `PB01`…`PB08`, or `ACK` (+10 ack within 10 s), `UPTIME`, `PIPELINE`. */
  pbId: string;
  atS: number;
  points: number;
  ticketId: string | null;
  detail: string;
}

export interface StrikeEvent {
  atS: number;
  reason: string;
  gwId: string | null;
  ticketId: string | null;
}

export interface ShiftEventState {
  id: ShiftEventId;
  /** Real seconds since shift start when it fires. */
  firesAtS: number;
  fired: boolean;
  /** Effect window end (Jared at lunch: +120 s), else null. */
  activeUntilS: number | null;
  /** Onboarding day: tickets left that come from Alex with misleading titles. */
  remaining: number;
}

/** A pre-drawn spawn (Daily Challenge GP §4.6, certification practicals, Weak Spot micro-shift). */
export interface PlannedSpawn {
  slot: number;
  incidentId: string;
  variantId: string;
  rig: string | null;
  misleading: boolean;
  /** Real seconds since shift start. */
  arrivalS: number;
  compoundWith: string | null;
  ticketId: string | null;
}

export interface ShiftStats {
  spawned: number;
  resolved: number;
  breaches: number;
  fastDiagnoses: number;
  calls: number;
  wrongCalls: number;
  escalationsCorrect: number;
  escalationsBounced: number;
  hintsUsed: number;
  penaltyEvents: number;
}

export interface ShiftState {
  /** ShiftConfig id: `shift-5` | `shift-10` | `shift-20` | `daily` | `weak-spot` | `micro` | `cert-r4` | `cert-r5`. */
  configId: string;
  kind: ShiftKind;
  lengthMinutes: number;
  /** Seed text shown in the summary / boards (8 hex chars, the daily seedString, or custom text). */
  seed: string;
  seedMode: 'random' | 'daily' | 'custom';
  /** Numeric PRNG seed (FNV-1a of `seed`). */
  rngSeed: number;
  wildcard: boolean;
  realism: Realism;
  startPosition: 'desk' | 'rack';
  /** Daily: the one ranked attempt of the day. */
  ranked: boolean;
  practice: boolean;
  phase: 'briefing' | 'running' | 'ended';
  durationS: number;
  elapsedS: number;
  heat: HeatLevel;
  heatCap: HeatLevel;
  /** min(heat max difficulty, rank cap) — ignored by daily/cert. */
  difficultyCap: number;
  /** Real seconds (since start) of the next spawn, or null while blocked at max open tickets. */
  nextSpawnAtS: number | null;
  /** When open = max: next spawn not before (close time + 10 s). */
  spawnHoldUntilS: number | null;
  score: number;
  /** Σ base of all spawned tickets (grade Ratio denominator). */
  target: number;
  combo: number;
  maxCombo: number;
  /** min(3.0, 1 + 0.25 × combo). */
  multiplier: number;
  strikes: number;
  strikeLog: StrikeEvent[];
  /** Global wrong-action log (every GW event in the shift, charged or not to a ticket). */
  penalties: PenaltyEvent[];
  bonuses: BonusEvent[];
  pipelines: PipelineState[];
  pipelinePoints: number;
  uptime: { attempts: number; gotRig: number };
  event: ShiftEventState | null;
  /** Jared at lunch until (escalations queue). */
  jaredAwayUntilS: number | null;
  /** Ticket ids whose escalations wait for Jared. */
  queuedEscalations: string[];
  plannedWorkTicketId: string | null;
  plan: PlannedSpawn[] | null;
  /** Last incident ids picked (freshness ×0.25 for the last 3, GP §4.8.4). */
  pickHistory: string[];
  stats: ShiftStats;
  /** Consecutive real seconds with every active pipeline unblocked and green at H3+ (ACH20). */
  greenWallS: number;
  /** Real seconds until Orca's next health check (HUD "Next health check 0:42"). */
  nextHealthCheckInS: number;
  /** Rules for this run (from the ShiftConfig, after realism). */
  rules: {
    scoring: boolean;
    hintsMaxTier: 0 | 1 | 3;
    diagnosisCall: boolean;
    hudObjectives: boolean;
    pipelines: boolean;
    strikesToEnd: number | null;
    forceHealthCheck: boolean;
  };
  grade: ShiftGrade | null;
  ratio: number | null;
  endReason: 'time' | 'strikes' | 'quit' | 'early' | null;
}
