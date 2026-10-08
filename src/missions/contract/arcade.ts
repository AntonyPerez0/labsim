/**
 * Arcade definitions: shift configs, pipelines, heat, shift events (GP §2.3), drills (GP §2.4),
 * Daily Challenge (GP §4.6). Re-exported from `@/missions/types`.
 */
import type { RngState } from '@/core/rng';
import type { HeatLevel, PipelineId, Realism, RootState, ShiftEventId, ShiftKind, TeachCardContent } from '@/core/state';
import type { CareerRankId, Medal } from '@/core/state';

/* ═════════════════════════════ Shifts ═════════════════════════════ */

/**
 * A playable shift configuration (GP §2.3.2 cadence, §2.3.12 certification shifts, §4.8.5 micro-shift).
 *
 * @example
 * export const SHIFT_10: ShiftConfig = {
 *   id: 'shift-10', kind: 'standard', title: '10-minute Shift', description: 'Ten real minutes, H4 cap, shift events possible.',
 *   lengthMinutes: 10, realSeconds: 600, timeScale: 5, gameStart: '08:00', heatCap: 4, firstTicketAtS: 8,
 *   unlock: { module: 'M10' }, rankCaps: true, wildcard: 'optional', pipelines: true, plannedWork: false, shiftEvents: true,
 *   scoring: true, hints: true, diagnosisCall: true, hudObjectives: true, strikesToEnd: 3, forceHealthCheck: false,
 *   unlockXp: 0, difficulty: 3,
 * };
 */
export interface ShiftConfig {
  /** `shift-5` | `shift-10` | `shift-20` | `daily` | `weak-spot` | `micro` | `cert-r4` | `cert-r5`. */
  id: string;
  kind: ShiftKind;
  title: string;
  description: string;
  /** 5 / 10 / 20; null when computed (micro-shift = Σ par × 1.2). */
  lengthMinutes: number | null;
  realSeconds: number | null;
  /** Game ms per real ms: 5 in Arcade (health check every 60 real s), 1 in certification. */
  timeScale: number;
  /** Game clock at start, `HH:MM` (08:00). */
  gameStart: string;
  heatCap: HeatLevel;
  /** Fixed heat (Weak Spot micro-shift: H2), else from elapsed fraction. */
  fixedHeat?: HeatLevel;
  firstTicketAtS: number;
  /** Unlock gate (GP §2.1): module completion, rank, or cert eligibility. */
  unlock: { module?: string; rank?: CareerRankId };
  /** Apply the rank difficulty cap (Daily and cert ignore it). */
  rankCaps: boolean;
  /** Wildcard: setup-screen option, always on (Daily), or never. */
  wildcard: 'optional' | 'forced' | 'never';
  pipelines: boolean;
  /** Full Shift planned-work ticket at t = 30 s. */
  plannedWork: boolean;
  /** 10/20-min: at most one event, 30 % chance, f ∈ [0.30, 0.50]. */
  shiftEvents: boolean;
  scoring: boolean;
  hints: boolean;
  diagnosisCall: boolean;
  /** CERT-R5: "no HUD objective text". */
  hudObjectives: boolean;
  /** 3 strikes end a shift (GP §2.3.9); cert: per exam rules. */
  strikesToEnd: number | null;
  forceHealthCheck: boolean;
  /** Pre-drawn incidents (cert: 5 or 8; Weak Spot: 3) instead of the heat spawner. */
  incidents?: { count: number; draw: 'weighted' | 'uniform' | 'cert-mix'; simultaneousAtS?: number; requireCategories?: readonly ('hardware' | 'orca' | 'code-config')[] };
  /** @deprecated v1 field (XP gate) — use `unlock`. */
  unlockXp: number;
  /** Menu difficulty pips 1–5. */
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/** Shift setup screen (GP §2.3.1). */
export interface ShiftStartOptions {
  configId: string;
  seedMode?: 'random' | 'daily' | 'custom';
  /** Custom seed text (hashed with FNV-1a). */
  customSeed?: string;
  wildcard?: boolean;
  realism?: Realism;
  startPosition?: 'desk' | 'rack';
  /** Daily: practice attempt (no board entry, half XP). */
  practice?: boolean;
  /** Micro-shift: the incidents to play (Academy "Play now", Weak Spot). */
  incidentIds?: readonly string[];
}

/** GP §2.3.3 heat table row. */
export interface HeatRow {
  heat: HeatLevel;
  /** Mean inter-arrival real s (× U(0.75, 1.25)). */
  meanInterArrivalS: number;
  maxOpenTickets: number;
  maxDifficulty: number;
  misleadingChance: number;
  compoundChance: number;
  activePipelines: number;
}

/** GP §2.3.5 pipeline. */
export interface PipelineDef {
  id: PipelineId;
  job: string;
  /** Requirement text for the HUD tooltip. */
  requirement: string;
  /** Build parameters for run `runIndex` (PL1 alternates DEVICE_TYPE FLEX_3/FLEX_4). */
  params: (runIndex: number) => Readonly<Record<string, string>>;
  eligibleRigs: readonly string[];
  /** 1…7; PL8 is `always`. */
  activationOrder: number | 'always';
  /** Checkout attempt interval (30 s; PL8 Sam's NPC job every 180 s). */
  intervalS: number;
  /** Run duration (60 s). */
  runS: number;
  /** PL8: counts toward uptime only while its rig is broken. */
  uptimeOnlyWhenBroken?: boolean;
}

/** GP §2.3.11 shift event. */
export interface ShiftEventDef {
  id: ShiftEventId;
  title: string;
  /** HUD banner while active ("Jared: out to lunch"). */
  banner?: string;
  /** Incident forced as the next ticket (needs remaining time ≥ its par). */
  forcesIncident?: string;
  /** Next N tickets from this reporter with misleading titles. */
  misleadingTickets?: { count: number; reporter: string };
  /** Escalations queue for this long. */
  jaredAwayS?: number;
}

/** Daily Challenge (GP §4.6). */
export interface DailyChallengeInfo {
  dateKey: string;
  /** `"labsim-daily-v1:" + dateKey`. */
  seedString: string;
  seed: number;
  /** One ranked attempt per dateKey. */
  rankedAvailable: boolean;
  /** `DR[(seed mod 19) + 1]`. */
  drillId: string;
  bestToday: number | null;
  unlocked: boolean;
}

/* ═════════════════════════════ Drills ═════════════════════════════ */

/**
 * A drill item. Drill-specific payloads go in `data` (typed by each drill module). Items that are
 * curriculum quiz items set `questionId` (Leitner cross-mode demotion applies).
 */
export interface DrillItem<D = unknown> {
  id: string;
  tags: readonly string[];
  factIds?: readonly string[];
  questionId?: string;
  /** Inline 2-line Teach Card for a wrong answer: what's right + why (Ref §). */
  teach: Pick<TeachCardContent, 'whatHappened' | 'why'> & Partial<TeachCardContent>;
  data: D;
}

/** The player's answer, graded by the drill component. */
export interface DrillVerdict {
  correct: boolean;
  /** Override the standard +100/−50 (+speed bonus) scoring (DR02 per key, DR05 edge error, DR19 time-based). */
  pointsOverride?: number;
  /** Ms override when the component measures time itself. */
  elapsedMs?: number;
  /** Extra detail for the Teach Card ("Edge error 4 px"). */
  detail?: string;
}

/** Runtime feedback after an answer (GP §2.4.1). */
export interface DrillFeedback {
  points: number;
  streak: number;
  multiplier: number;
  score: number;
  /** Shown 2.5 s or until click when wrong. */
  teach: TeachCardContent | null;
  /** Next item id (null when the round ended). */
  nextItemId: string | null;
}

/** Props of a drill's React component (rendered full-screen in the `drill` overlay). */
export interface DrillComponentProps {
  drillId: string;
  mode: string | null;
  /** Resolve an item by id (drawn by the runtime from `items`/`generate`). */
  item(itemId: string): DrillItem | null;
  /** Submit the answer for the current item. */
  answer(itemId: string, verdict: DrillVerdict): DrillFeedback;
  /** End the round early (or when a fixed-count round is done). */
  finish(): void;
  /** Read the live state (`session.drill`) with `useGame(s => s.session.drill)`. */
  readonly realism: Realism;
}

/**
 * GP §2.4.2 drill catalogue entry.
 *
 * @example
 * export const DR01: DrillDef = {
 *   id: 'DR01', name: 'Status Triage', format: 'Scenario card → press 1–5', tags: ['orca.status', 'orca.healthcheck'],
 *   unlockedBy: ['M06'], durationS: 60, itemCount: null, medals: { bronze: 800, silver: 1500, gold: 2200 },
 *   items: STATUS_TRIAGE_ITEMS, scoring: 'standard',
 * };
 */
export interface DrillDef<D = unknown> {
  /** `DR01`…`DR19`. */
  id: string;
  name: string;
  /** Curriculum alias ("Comma Hunt", "POM Doctor"). */
  alias?: string;
  /** Format line from the catalogue. */
  format: string;
  tags: readonly string[];
  /** Unlocks when any listed module is complete (DR09: architecture set at M06, all sets at M14). */
  unlockedBy: readonly string[];
  /** Round length in real seconds, or null for fixed-count rounds without a clock. */
  durationS: number | null;
  /** Fixed item count (DR02 3 files, DR06 5 payloads, DR08 3 classes, DR19 3 targets), else null. */
  itemCount: number | null;
  medals: Record<Medal, number>;
  /** `standard` = +100 correct, speed +50 at ≤ 2 s → 0 at 8 s, streak ×(1+0.1·streak) max ×2, wrong −50. */
  scoring: 'standard' | 'custom';
  /** Static bank (≥ 40 for DR01). */
  items?: readonly DrillItem<D>[];
  /** Generator for procedural items (DR05 boxes, DR19 live terminal targets). */
  generate?: (rng: RngState, state: RootState, index: number) => DrillItem<D>;
  /** Modes (DR05 A/B/C, DR08 build/doctor), with unlock rules. */
  modes?: readonly { id: string; title: string; unlock: 'always' | 'first-gold' | 'module'; module?: string }[];
  /** Optional tag subsets unlocked by module (DR09 sets). */
  tagUnlocks?: Readonly<Record<string, readonly string[]>>;
  /**
   * React component for the drill (rendered by the UI drill overlay). Declared structurally so
   * `src/missions` stays React-free; drill UIs may instead register in the UI's drill registry.
   */
  component?: (props: DrillComponentProps) => unknown;
}
