/**
 * The current play session — `RootState.session` (not persisted; GP §7.4).
 *
 * Re-exported from `@/core/state`; import from there.
 *
 * Ownership: the mission runtime (`src/missions`) writes everything here except `player`
 * (engine, ~10 Hz) and `activeTool`/`toolModes`/`items` (missions API `selectTool`, `cycleToolMode`,
 * `takeItem` … called by the HUD and world). The UI and the world read.
 *
 * Clocks: `…Ms` fields are **game** ms (`lab.time.nowMs`); `…S` fields are **real seconds of play**
 * (advance only while the sim is unpaused; derive from the loop dt: realMs = dtGameMs / timeScale).
 * Shift timers, SLAs, par times and hint delays are real seconds (GP §0).
 */
import type { ToolId, ToolModes, PartsInventory } from './state';
import type { CareerRankId, CertExamId, EvidenceEntry, Medal, Realism, ShiftGrade } from './progressState';
import type { BonusEvent, PenaltyEvent, ShiftState, StrikeEvent, TicketBinding, TicketState } from './arcadeState';

export type GameMode =
  | 'menu'
  | 'academy'
  | 'arcade-shift'
  | 'arcade-drill'
  | 'freeplay'
  /** Arcade → Weak Spot playlist (drills phase, then a micro-shift). */
  | 'arcade-weakspot'
  /** CERT-R# written + practical. */
  | 'certification';

/**
 * Speaker / NPC keys = `TeamMember.key` in `src/content/team.ts` (display names resolve there).
 * World NPC ids are `npc.<id>` (`riley` is the curriculum's `npc.coworker`).
 */
export type NpcKey = 'morgan' | 'jared' | 'tate' | 'david' | 'riley' | 'sam' | 'alex';
/** Ticket reporters (GP §2.3.4). */
export type ReporterKey = NpcKey | 'jenkins-bot';


/** Player pose, mirrored into the store at ~10 Hz for missions/HUD (the engine owns the real camera). */
export interface PlayerPose {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  /** Id of the location anchor the player is currently inside, if any. */
  locationId: string | null;
  /** Interactable currently under the crosshair (within reach), if any. */
  lookingAt: string | null;
  crouched: boolean;
}

/** HUD marker / compass target. */
export interface MarkerTarget {
  kind: 'location' | 'prop' | 'npc' | 'rig' | 'app';
  /** `loc.rack-a`, a world prop id (`rig.wall-e.tablet`) or Cur alias (`prop.walle.tablet`), `npc.jared`, rig name, app id. */
  id: string;
}

export interface Objective {
  id: string;
  text: string;
  /** Optional hint shown after a delay or on request. */
  hint?: string;
  done: boolean;
  failed?: boolean;
  /** Optional world location/prop to point the HUD marker at (legacy single id; prefer `marker`). */
  markerTarget?: string;
  marker?: MarkerTarget;
  /** Progress for multi-part objectives, e.g. [2, 4] → "2/4". */
  progress?: [number, number];
  /** Strict realism / CERT-R5: hide the text, keep the slot. */
  hidden?: boolean;
}

export interface DialogueChoiceView {
  id: string;
  /** Key 1–4 shown on the button. */
  key: number;
  text: string;
}

export interface DialogueLine {
  id: string;
  /** NPC key (`morgan`) or a display name; the UI resolves names/colours via `src/content/team.ts`. */
  speaker: string;
  text: string;
  /** If true the player must press E/Space/Enter (or click) to continue. */
  requiresAck: boolean;
  /** Choices (keys 1–4); when present, acknowledging is replaced by choosing (missions.chooseDialogue). */
  choices?: DialogueChoiceView[];
  /** Real seconds after which the line may be skipped (Cur §2.0: 1.5 s). */
  skippableAfterS?: number;
  /** Session real-second timestamp when the line appeared. */
  shownAtS?: number;
}

export interface ScoreState {
  points: number;
  combo: number;
  maxCombo: number;
  incidentsResolved: number;
  incidentsFailed: number;
  mistakes: number;
}

/* ───────────────────────────── Teach Cards (GP §5.5) ───────────────────────────── */

/** Authored content of a Teach Card (GP §5.5 table). */
export interface TeachCardContent {
  /** 1) What happened — neutral, one line. */
  whatHappened: string;
  /** 2) Why — the fact, ≤ 2 lines. */
  why: string;
  /** 3) Do instead — the exact action. */
  doInstead: string;
  /** "Ref §6" etc. */
  ref?: string;
  factIds?: string[];
  /** Show the "Illustrative (sim only)" badge. */
  illustrative?: boolean;
  /** Linked drill for **Practice** (pre-filtered to `tag`). */
  practiceDrillId?: string;
  /** Field Manual article for **Read**. */
  manualArticleId?: string;
  tag?: string;
}

export interface TeachCard extends TeachCardContent {
  id: string;
  trigger: { kind: 'gw' | 'call' | 'escalation' | 'resolve' | 'reply' | 'quiz' | 'drill' | 'academy' | 'cert'; ref: string };
  ticketId: string | null;
  /** Footer chip, e.g. power.18v 0.71 → 0.50. */
  masteryChange: { tag: string; before: number; after: number } | null;
  /** Session real seconds at creation (Shift: collapse to a chip after 5 s). */
  createdAtS: number;
  collapsed: boolean;
}

/* ───────────────────────────── Academy (Cur §2.0, GP §2.2) ───────────────────────────── */

export interface CheckpointResult {
  checkpointId: string;
  attempts: number;
  total: number;
  /** Correct answers on the first attempt. */
  firstTryCorrect: number;
  firstTryPassed: boolean;
  /** 100 % on the first try (★★★ requirement). */
  firstTryPerfect: boolean;
  passed: boolean;
  /** Question ids missed on the latest attempt. */
  missedIds: string[];
}

export type AcademyStepPhase =
  /** Running and evaluating the success condition. */
  | 'active'
  /** Success reached; playing onComplete lines / waiting for their ack. */
  | 'completing'
  /** Quiz overlay open for a checkpoint. */
  | 'quiz'
  /** "Show me" ghost demo playing (computer-task). */
  | 'show-me'
  /** Module finished; debrief shown. */
  | 'done';

export interface AcademyRunState {
  moduleId: string;
  replay: boolean;
  stepIndex: number;
  stepId: string;
  /** LessonStep kind of the current step (`dialogue`, `walk-to`, …). */
  stepKind: string;
  phase: AcademyStepPhase;
  /** Game ms when the step started. */
  stepStartedAtMs: number;
  /** Real seconds spent in the current step (drives the Cur §2.0 hint ladder). */
  stepElapsedS: number;
  /** Real seconds since the last relevant player action (computer-task hints are idle-based). */
  idleS: number;
  /** Hints revealed in this step (0 = none). Every revealed tier counts toward stars. */
  hintTier: number;
  hintText: string | null;
  /** Wrong actions in this step (interact: highlight the right control after 3). */
  wrongActions: number;
  showMeUsed: boolean;
  /** Something the HUD should highlight (interact after 3 wrong, Pointer/Walkthrough). */
  highlight: MarkerTarget | null;
  /** Walk-to 90 s breadcrumb line. */
  breadcrumb: boolean;
  /** Step offers "Force health check / fast-forward ×30". */
  fastForwardOffered: boolean;
  /** Completed step ids (this run, in order). */
  stepsDone: string[];
  hintsUsedTotal: number;
  showMeUsedTotal: number;
  xpEarned: number;
  checkpoints: Record<string, CheckpointResult>;
  /** Final stars once the module completes. */
  stars: 0 | 1 | 2 | 3 | null;
}

/* ───────────────────────────── Quiz overlay ───────────────────────────── */

/** mc: option index (or indices for multi-select) · tf: 0|1 · order: authored strings in chosen order · match: [left, right][] · fill: text. */
export type QuizAnswerValue = number | number[] | string | string[] | [string, string][];

export type QuizContext = 'lesson' | 'drill' | 'review' | 'cert' | 'arcade';

export interface QuizRunState {
  context: QuizContext;
  /** `CP-M06.1` for Academy checkpoints; `CERT-R2:written` for exams; null otherwise. */
  checkpointId: string | null;
  title: string;
  questionIds: string[];
  index: number;
  /** 1 = first try; re-runs after a failed checkpoint increment it (Cur §2.0). */
  attempt: number;
  answers: Record<string, { correct: boolean; answer: QuizAnswerValue }>;
  /** Display permutation of each question's options for this attempt (indices into the authored list). */
  shuffles: Record<string, number[]>;
  /** Pass threshold (0.8 for checkpoints). */
  passRatio: number;
  timeLimitS: number | null;
  timeLeftS: number | null;
  finished: boolean;
}

/* ───────────────────────────── Drills (GP §2.4) ───────────────────────────── */

export interface DrillAnswerRecord {
  itemId: string;
  correct: boolean;
  /** Real ms from item shown to answer. */
  ms: number;
  points: number;
}

export interface DrillRunState {
  drillId: string;
  /** Drill mode (`build`/`doctor` for DR08, `A`/`B`/`C` for DR05), or null. */
  mode: string | null;
  daily: boolean;
  seed: number;
  /** Tag filter (Teach Card **Practice**, Weak Spot), or null. */
  tags: string[] | null;
  phase: 'intro' | 'running' | 'teach' | 'finished';
  durationS: number | null;
  timeLeftS: number | null;
  /** Fixed item count rounds (DR02 3 files, DR06 5 payloads …), else null. */
  itemTarget: number | null;
  /** Drawn item ids (GP §4.8.4: 70 % weighted / 30 % uniform). More are drawn on demand. */
  queue: string[];
  index: number;
  currentItemId: string | null;
  /** Session real seconds when the current item appeared. */
  itemShownAtS: number;
  score: number;
  streak: number;
  bestStreak: number;
  /** In-drill streak multiplier ×(1 + 0.1·streak), max ×2.0. */
  multiplier: number;
  correct: number;
  wrong: number;
  answers: DrillAnswerRecord[];
  /** Inline 2-line Teach Card (2.5 s or until click). */
  teach: TeachCard | null;
  medal: Medal | null;
  newBest: boolean;
}

/* ───────────────────────────── Free Play (GP §2.5) ───────────────────────────── */

export interface InjectedFaultState {
  /** Injector instance id (`FI03#2`). */
  id: string;
  /** `INC03` (FI03 = INC03). */
  incidentId: string;
  variantId: string;
  binding: TicketBinding;
  faultInstanceIds: string[];
  ticketId: string | null;
  injectedAtMs: number;
  fixedAtMs: number | null;
  xpAwarded: number;
  random: boolean;
}

export interface FreePlayState {
  timeScale: 1 | 2 | 5 | 10;
  /** `]` held: ×30 fast-forward. */
  fastForwardHeld: boolean;
  penalties: boolean;
  pipelines: boolean;
  randomFaults: 'off' | '3min' | '90s';
  nextRandomFaultInS: number | null;
  /** "Inspect truth" overlay — disables XP for the session once used. */
  inspectTruth: boolean;
  xpDisabled: boolean;
  injected: InjectedFaultState[];
  buildMode: boolean;
  /** Snapshot slot this session was loaded from / saves to. */
  slot: 1 | 2 | 3 | null;
}

/* ───────────────────────────── Certification (Cur §5, GP §2.3.12) ───────────────────────────── */

export interface CertTaskState {
  /** `P1-1` … or `P4-shift`. */
  taskId: string;
  title: string;
  status: 'pending' | 'active' | 'passed' | 'failed';
  startedAtS: number | null;
  timeLimitS: number | null;
  /** Typed exam-form answer (P1-3 "200"). */
  answer: string | null;
  failReason: string | null;
}

export interface CertRunState {
  examId: CertExamId;
  part: 'written' | 'practical' | 'results';
  written: {
    questionIds: string[];
    /** Questions included for critical facts (must all be correct). */
    criticalQuestionIds: string[];
    answers: Record<string, boolean>;
    timeLimitS: number;
    timeLeftS: number;
    submitted: boolean;
    correct: number;
    pct: number;
    criticalMissed: string[];
    passed: boolean | null;
  };
  practical: {
    kind: 'tasks' | 'shift';
    tasks: CertTaskState[];
    timeLimitS: number;
    timeLeftS: number;
    strikes: number;
    strikeLog: StrikeEvent[];
    passed: boolean | null;
  };
  passed: boolean | null;
  distinction: boolean;
}

/* ───────────────────────────── Weak Spot (GP §4.8.5) ───────────────────────────── */

export interface WeakSpotState {
  tags: string[];
  phase: 'drills' | 'shift' | 'summary';
  /** Effective mastery before / after, per tag. */
  before: Record<string, number>;
  after: Record<string, number> | null;
  drillItemsDone: number;
}

/* ───────────────────────────── Computer gating (read by src/computer) ───────────────────────────── */

/**
 * Workstation gating written by missions, read by the desktop. Opening apps, hints and "Show me" go
 * through the apps.ts bridge (`requestOpenApp`, `requestHint`, `clearHint`); LabChat quick replies
 * through `setChatReplyProvider`. The desktop's objective pin reads `session.objectives`.
 */
export interface ComputerGating {
  /** Apps the desktop offers. `'all'` outside Academy (Cur M06: "Orca app unlocked with the Robots page"). */
  unlockedApps: 'all' | string[];
  /** Per-app restrictions, e.g. `{ jenkins: { visibleJobs: ['Java/uia-remote-regression-flex'] }, orca: { pages: ['robots'] } }`. */
  restrictions: Record<string, Record<string, string[] | string | boolean>>;
  /** Orca's tutorial **Force health check** header button (Academy & Free Play only; never Strict/cert/shift). */
  forceHealthCheckButton: boolean;
  /** Terminal tab-completion (Standard realism); history is always on. Effective realism: `session.realism`. */
  tabCompletion: boolean;
}

/* ───────────────────────────── Results (debrief) ───────────────────────────── */

export interface ShiftSummary {
  configId: string;
  score: number;
  grade: ShiftGrade;
  ratio: number;
  target: number;
  ticketsSpawned: number;
  ticketsResolved: number;
  breaches: number;
  strikes: number;
  /** Every penalty event (each opens its Teach Card). */
  penalties: PenaltyEvent[];
  bonuses: BonusEvent[];
  maxCombo: number;
  uptime: number;
  fastDiagnoses: number;
  escalations: { correct: number; bounced: number };
  handoverTickets: number;
  /** ≤ 5 tags whose mastery dropped: Practice → drill, Read → Field Manual. */
  reviewTags: { tag: string; before: number; after: number; drillId: string | null; articleId: string | null }[];
  leaderboard: { boardId: string; rank: number | null; deltaVsBest: number | null } | null;
  endReason: 'time' | 'strikes' | 'quit' | 'early';
}

export interface DrillSummary {
  drillId: string;
  score: number;
  accuracy: number;
  correct: number;
  total: number;
  bestStreak: number;
  medal: Medal | null;
  newBest: boolean;
  teachCards: TeachCard[];
}

export interface AcademySummary {
  moduleId: string;
  stars: 0 | 1 | 2 | 3;
  hintsUsed: number;
  checkpoint: CheckpointResult | null;
  replay: boolean;
  /** GP §2.2.1 "Arcade preview": content this module unlocked. */
  unlocked: { incidents: string[]; drills: string[]; modes: string[]; hotbar: ToolId[]; decks: string[]; manualChapters: string[] };
  /** "Play now" target (first unlocked drill, or a 1-incident micro-shift). */
  playNow: { kind: 'drill'; drillId: string } | { kind: 'micro-shift'; incidentId: string } | null;
  nextModules: string[];
}

export interface CertSummary {
  examId: CertExamId;
  writtenPct: number;
  writtenPassed: boolean;
  criticalMissed: string[];
  practicalPassed: boolean;
  tasks: CertTaskState[];
  distinction: boolean;
  /** Missed items with explanations (Cur §5.4). */
  missed: { questionId: string; factIds: string[] }[];
  retakeAvailableAt: number | null;
}

export interface ActivityResult {
  kind: 'academy' | 'shift' | 'drill' | 'freeplay' | 'certification' | 'weak-spot';
  activityId: string;
  title: string;
  passed: boolean;
  points: number;
  xp: number;
  accuracy: number;
  durationSeconds: number;
  /** Teaching recap lines shown on the debrief ("In the real lab you will…" for Academy). */
  takeaways: string[];
  newAchievements: string[];
  xpBreakdown: { label: string; xp: number }[];
  rank: { before: CareerRankId; after: CareerRankId; pending: string[] } | null;
  teachCards: TeachCard[];
  academy?: AcademySummary;
  shift?: ShiftSummary;
  drill?: DrillSummary;
  cert?: CertSummary;
  weakSpot?: { tags: { tag: string; before: number; after: number }[] };
}

/* ───────────────────────────── Session root ───────────────────────────── */

export interface NotebookSession {
  /** Auto-captured evidence this session (newest last, cap 200). */
  evidence: EvidenceEntry[];
  /** Current ticket / step checklist. */
  checklist: { id: string; text: string; done: boolean }[];
}

export interface SessionState {
  mode: GameMode;
  /** Academy module id (e.g. "M03"), shift config id, drill id, cert exam id, or null. */
  activityId: string | null;
  /** Increments on every activity start/restart — async callbacks compare it to detect staleness. */
  runId: number;
  /** Real seconds of unpaused play in this activity (the session clock all `…S` fields use). */
  clockS: number;
  /** Effective realism for this activity (profile default or Shift-setup override). */
  realism: Realism;
  /** Index of the current lesson step (Academy) — mirrors `academy.stepIndex`. */
  stepIndex: number;
  objectives: Objective[];
  dialogue: DialogueLine | null;
  /** Real-time seconds remaining for timed activities (shift, drill, exam), or null. */
  timerSeconds: number | null;
  score: ScoreState;
  /** Open + recently closed tickets (Shift, Weak Spot, certification practicals, Free Play "Create ticket"). */
  tickets: TicketState[];
  player: PlayerPose;
  /** Hotbar tools the player carries this activity (unlocked by modules, GP §6.4). `hand`/`flashlight` always. */
  inventory: ToolId[];
  activeTool: ToolId;
  /** Tool modes toggled with `R` (multimeter mode, fuse rating, card type, screwdriver bit). */
  toolModes: ToolModes;
  /** Spare parts in pockets and the large item carried in both hands. */
  items: PartsInventory;
  academy: AcademyRunState | null;
  quiz: QuizRunState | null;
  shift: ShiftState | null;
  drill: DrillRunState | null;
  freeplay: FreePlayState | null;
  cert: CertRunState | null;
  weakSpot: WeakSpotState | null;
  computer: ComputerGating;
  notebook: NotebookSession;
  /** Activity-wide action counters (`powerCycles:wall-e`, `inspect:wall-e:pi` …). */
  counters: Record<string, number>;
  /** Mission script variables (lesson branches, scripted state). */
  vars: Record<string, string | number | boolean>;
  /** Activity result once finished, for the debrief screen. */
  result: ActivityResult | null;
}
