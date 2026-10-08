/**
 * Mission runtime contract — the API the UI (menus, HUD, overlays, ticket panel, drill overlay,
 * Field Manual), the world (inventory/tool calls) and the workstation apps (LabChat replies) use.
 * Implemented in `src/missions/runtime/` (missions team) and exposed as `missions` from `@/missions`.
 *
 * Rules:
 *  - Reads that are plain state (tickets, shift clock, score, objectives, dialogue, drill state …)
 *    come straight from the store: `useGame(s => s.session.shift?.score)`. The query methods below
 *    exist for derived data (unlock checks, resolved texts, views joining defs + state).
 *  - Every mutating method runs in `transact()`, emits the events in `@/core/events`, and never
 *    throws for player mistakes (returns a result / no-op). Calls made in the wrong mode are no-ops
 *    returning a failed result.
 *  - Real time: `tick(dtGameMs)` is called by the game loop after `sim.tick` (only while unpaused);
 *    real ms = dtGameMs / lab.time.timeScale. `frame(dtRealSeconds)` is called every animation frame
 *    (also while paused) for UI-only timers (exam clock, Teach Card collapse).
 */
import type { AchievementDef, ExamBlueprint, ModuleMeta, RankDef, TagDef } from '@/content/schema';
import type {
  CareerRankId,
  CarriedItem,
  CertRecord,
  CheckpointResult,
  FuseRating,
  HotbarSlot,
  LeaderboardEntry,
  MasteryLabel,
  Medal,
  QuizAnswerValue,
  QuizContext,
  Realism,
  TeachCardContent,
  TestCardKind,
  TicketState,
  ToolId,
} from '@/core/state';
import type {
  CertPracticalDef,
  DailyChallengeInfo,
  DrillDef,
  DrillFeedback,
  DrillItem,
  DrillVerdict,
  IncidentDef,
  LessonDef,
  ShiftConfig,
  ShiftStartOptions,
} from './types';

export type { ShiftConfig, DrillDef, ShiftStartOptions };

/** Result of an action that can be refused (wrong mode, locked, invalid). */
export type MissionResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export interface UnlockState {
  unlocked: boolean;
  /** Why it is locked ("Complete M10", "Reach Lab Technician"), null when unlocked. */
  reason: string | null;
}

/* ── Academy ── */

export interface ModuleView {
  meta: ModuleMeta;
  state: 'locked' | 'available' | 'in-progress' | 'completed';
  stars: 0 | 1 | 2 | 3;
  bestCheckpoint: number;
  replays: number;
  missingPrereqs: string[];
  /** GP §2.2.2 row: what completing it unlocks outside the Academy. */
  unlocks: { incidents: string[]; drills: string[]; modes: string[]; hotbar: ToolId[] };
  /** "Continue" checkpoint exists for this module. */
  resumable: boolean;
}

/* ── Quiz & flashcards ── */

export interface QuizAnswerResult {
  correct: boolean;
  explanation: string;
  /** Correct answer rendered as text for feedback. */
  correctText: string;
  factIds: string[];
  /** Teach Card content for a wrong answer (curriculum explanation). */
  teach: TeachCardContent | null;
}

export interface QuizFinishResult {
  checkpointId: string | null;
  correct: number;
  total: number;
  passed: boolean;
  attempt: number;
  missedIds: string[];
  /** Failed checkpoint: the re-run paper (missed + 2 random from the module), else null. */
  retryQuestionIds: string[] | null;
  checkpoint: CheckpointResult | null;
}

export interface FlashcardSessionInfo {
  /** Due cards, oldest due first (≤ 60 reviews/session, ≤ 20 new/day). */
  queue: string[];
  due: number;
  newToday: number;
  reviewsLeft: number;
}

export interface LeitnerSummary {
  /** Share of unlocked cards in box ≥ 4 (Cur §4.0 mastery metric). */
  overall: number;
  perDeck: Record<string, number>;
  dueNow: number;
  unlocked: number;
}

/* ── Arcade tickets ── */

export interface HintResult {
  /** 1 Nudge · 2 Pointer · 3 Walkthrough (Academy: ladder index). */
  tier: number;
  text: string;
  maxTier: number;
  /** Tier 3 needs confirmation (`H` again / confirm button) before it is revealed. */
  needsConfirm: boolean;
}

export interface TicketView {
  ticket: TicketState;
  incidentName: string;
  /** Diagnosis Call options in the ticket's shuffled order (null when `diagnosisCall: 'none'` or hidden). */
  callOptions: { id: string; text: string }[] | null;
  /** LabChat reply options (null when the incident has none). */
  replies: { id: string; text: string }[] | null;
  task:
    | { kind: 'match'; prompt: string; left: string[]; right: string[]; statusLine: { prompt: string; options: { id: string; text: string }[] } | null }
    | { kind: 'bug'; prompt: string; fields: { id: string; label: string; unit: string | null }[] }
    | null;
  escalatable: boolean;
  /** Endpoints offered by the escalation form: the rig's latest Notes URLs + the player's terminal history. */
  endpointCandidates: string[];
  /** Next hint tier available (0 = none left / not allowed). */
  nextHintTier: number;
  hints: string[];
  verifyingLabel: string | null;
  /** SLA fraction remaining 0..1 (for the bar). */
  slaFraction: number;
}

export interface DiagnosisCallResult {
  correct: boolean;
  fast: boolean;
  points: number;
  /** Teach Card direction for a wrong call (never the answer). */
  wrongCallHint: string | null;
  teachCardId: string | null;
}

export interface EscalationRequest {
  /** Diagnosis Call option id chosen as the cause. */
  cause: string;
  /** Exact endpoint URL. */
  endpoint: string;
}

export interface EscalationResult {
  /** `queued` while Jared is at lunch; `pending` → Jared will check (bounce after 20 s if wrong). */
  outcome: 'queued' | 'pending' | 'accepted' | 'bounced' | 'not-escalatable';
  points: number;
  message: string;
}

export interface ResolveResult {
  outcome: 'resolved' | 'verifying' | 'rejected';
  points: number;
  /** Verifying label ("Verifying… waiting for 08:20 health check") or rejection reason (GW16). */
  message: string;
  teachCardId: string | null;
}

export interface ReplyResult {
  correct: boolean;
  /** No further attempts allowed / ticket closed by this reply. */
  final: boolean;
  points: number;
  teachCardId: string | null;
}

/* ── Drills, Free Play, certification ── */

export interface DrillView {
  def: DrillDef;
  unlock: UnlockState;
  best: number;
  medal: Medal | null;
  rounds: number;
  /** Daily Drill today. */
  isDaily: boolean;
}

export interface FaultInjectorEntry {
  /** `FI03`. */
  fiId: string;
  incidentId: string;
  name: string;
  /** Unlocked-by module complete (untaught entries are greyed but allowed). */
  taught: boolean;
  variants: { id: string; label: string }[];
  defaultRig: string | null;
  rigs: string[];
}

/** Item the world hands to / takes from the player's pockets. */
export type InventoryItemRef =
  | { kind: 'fuse'; rating: FuseRating }
  | { kind: 'ethernet-cable' }
  | { kind: 'usb-lead' }
  | { kind: 'test-card'; card: TestCardKind }
  | { kind: 'part'; id: string }
  | { kind: 'removed-fuse'; fuseId: string; rating: number; blown: boolean }
  | { kind: 'carried'; item: CarriedItem };

export interface SandboxPatch {
  timeScale?: 1 | 2 | 5 | 10;
  fastForwardHeld?: boolean;
  penalties?: boolean;
  pipelines?: boolean;
  randomFaults?: 'off' | '3min' | '90s';
  inspectTruth?: boolean;
  buildMode?: boolean;
}

export interface CertView {
  /** Content blueprint (eligibility, written rules, practical task texts). */
  exam: ExamBlueprint;
  /** Executable practical (null until authored). */
  practical: CertPracticalDef | null;
  eligible: boolean;
  /** Unmet eligibility items ("Complete M17", "Leitner mastery 72 % / 90 %"). */
  missing: string[];
  record: CertRecord | null;
  /** Real epoch ms when a retake opens (null = now / never failed). */
  retakeAvailableAt: number | null;
}

export interface CertWrittenResult {
  correct: number;
  total: number;
  pct: number;
  criticalMissed: string[];
  passed: boolean;
}

/* ── Profile ── */

export interface RankView {
  /** Content rank (`src/content/ranks.ts`). */
  rank: RankDef;
  next: RankDef | null;
  xp: number;
  /** XP still needed for `next` (0 when only the exam / gate is missing). */
  xpToNext: number;
  /** Promotion pending items ("xp:640", "CERT-R2", "5 A-grade shifts: 3/5"). */
  pending: string[];
  /** 0..1 progress toward `next.minXp`. */
  progress: number;
}

export interface AchievementView {
  id: string;
  /** Content definition (secret ones are returned with title "???" until unlocked). */
  def: AchievementDef;
  /** "???" for unrevealed secret achievements. */
  title: string;
  description: string;
  xp: number;
  icon: string | null;
  secret: boolean;
  unlocked: boolean;
  /** Real epoch ms. */
  unlockedAt: number | null;
  meter: [number, number] | null;
}

export interface TagMasteryView {
  tag: string;
  /** Content tag declaration (`src/content/tags.ts`), null for undeclared tags. */
  def: TagDef | null;
  /** Curriculum module tag it rolls up to (Cur §8). */
  parent: string;
  /** Radar group (Architecture, Orca, Jenkins …). */
  group: string;
  taughtIn: string;
  m: number;
  /** Effective mastery with forgetting. */
  mEff: number;
  level: number;
  label: MasteryLabel;
  lastEvidenceAt: number;
}

export type DebriefAction = 'menu' | 'next' | 'replay' | 'play-now' | 'review';

export interface MissionsApi {
  /* ═══ Lifecycle ═══ */
  /** Subscribe to the bus; call once at boot (after the world is built). */
  init(): void;
  /** Advance mission timers by one sim step (called by the loop after `sim.tick`, only while unpaused). */
  tick(dtGameMs: number): void;
  /** Per-animation-frame hook (also while paused): UI-only timers (exam clock, Teach Card collapse). */
  frame(dtRealSeconds: number): void;
  /** Restart the current activity from scratch (same seed). */
  restart(): void;
  /** Abandon the current activity and return to the main menu (shift: recorded `abandoned`; ranked Daily submits its score). */
  quit(): void;
  /** Open/close the pause overlay (the sim, shift clock, SLAs and hint timers freeze while paused). */
  setPaused(paused: boolean): void;
  /** Debrief buttons: back to menu, next module, replay, Arcade preview "Play now", Weak Spot "Review these". */
  continueFromDebrief(action: DebriefAction): void;

  /* ═══ Catalog & unlocks ═══ */
  modules(): ModuleMeta[];
  /** Locked/unlocked/completed state for the Academy menu. */
  moduleState(moduleId: string): 'locked' | 'available' | 'in-progress' | 'completed';
  moduleView(moduleId: string): ModuleView | null;
  lesson(moduleId: string): LessonDef | null;
  shifts(): ShiftConfig[];
  shiftUnlock(configId: string): UnlockState;
  drills(): DrillDef[];
  drillView(drillId: string): DrillView | null;
  incidents(): IncidentDef[];
  incident(incidentId: string): IncidentDef | null;
  /** Content exam blueprints (CERT-R1…R5). */
  certifications(): ExamBlueprint[];
  certView(examId: string): CertView | null;
  dailyInfo(): DailyChallengeInfo;
  /** Main-menu badges: cards due, weakest tag, exam ready. */
  menuBadges(): { cardsDue: number; weakestTag: string | null; examReady: string | null };

  /* ═══ Academy ═══ */
  startAcademy(moduleId: string, opts?: { replay?: boolean }): void;
  /** Resume from `progress.academyCheckpoint` (main-menu Continue). Returns false when there is none. */
  continueAcademy(): boolean;
  /** Advance the current dialogue line (E / Space / click; ignored before `skippableAfterS`). */
  acknowledgeDialogue(): void;
  /** Pick a dialogue choice (keys 1–4). */
  chooseDialogue(choiceId: string): void;
  /**
   * Reveal the next hint for what the player is doing: the Academy step ladder, or (in Arcade) the
   * selected ticket's tier (`ticketHint`). Returns the hint text or null when none is available.
   */
  requestHint(): string | null;
  /** computer-task "Show me" ghost demo (available after 180 s idle; −50 % step XP). */
  showMe(): boolean;
  /** "Force health check" / "Fast-forward ×30" offered by the current step. */
  fastForward(target: 'next-health-check'): void;
  /** Pause menu → Restart step (restores the step's checkpoint snapshot). */
  restartStep(): void;
  /** Pause menu → Restart module. */
  restartModule(): void;

  /* ═══ Quiz (checkpoints, reviews, exam papers, DR10) ═══ */
  /** Grade an answer (records stats, mastery, Leitner cross-mode demotion). `answer` shape per question type. */
  answerQuiz(questionId: string, answer: QuizAnswerValue, context: QuizContext): QuizAnswerResult;
  /** Move to the next question of `session.quiz`. */
  nextQuizQuestion(): void;
  /** Finish the quiz run (checkpoint pass/fail and re-run paper). */
  finishQuiz(): QuizFinishResult;

  /* ═══ Flashcards (Cur §4.0 Leitner) ═══ */
  /** Flashcards due today (ids). */
  dueFlashcards(): string[];
  startFlashcards(opts?: { deck?: string; tags?: string[] }): FlashcardSessionInfo;
  /** Flashcard review result (Leitner box update; 2 XP, +3 for "Got it", cap 200/day). */
  reviewFlashcard(cardId: string, knewIt: boolean): void;
  endFlashcards(): void;
  leitnerSummary(): LeitnerSummary;

  /* ═══ Arcade: Shift / Daily / Weak Spot ═══ */
  /** Start a shift (`'shift-5'` or full setup-screen options). */
  startShift(options: string | ShiftStartOptions): void;
  startDaily(opts?: { practice?: boolean }): void;
  startDailyDrill(): void;
  startWeakSpot(): void;
  /** "Call it a day": end now (open tickets → handover debt). */
  endShift(): void;
  /** Real seconds until Orca's next health check (HUD countdown). */
  nextHealthCheckInS(): number;

  /* ═══ Arcade: tickets ═══ */
  /** Ack (`T`, select, Enter): +10 within 10 s of arrival; pins the rig on the compass. */
  ackTicket(ticketId: string): void;
  /** Open the ticket panel on it (ACKED → IN_PROGRESS). */
  openTicket(ticketId: string): void;
  /** Ack + open (legacy name). */
  claimTicket(ticketId: string): void;
  /** Highlight a ticket in the HUD queue (`ui.selectedTicketId`). */
  selectTicket(ticketId: string | null): void;
  ticketView(ticketId: string): TicketView | null;
  /** Diagnosis Call (one per ticket). */
  callRootCause(ticketId: string, optionId: string): DiagnosisCallResult;
  /** Escalate to Jared with cause + endpoint (GP §2.3.7). */
  escalate(ticketId: string, request: EscalationRequest): EscalationResult;
  /** Evaluate the success condition (false → GW16; deferred → verifying). */
  resolveTicket(ticketId: string): ResolveResult;
  /** LabChat reply (`R_WAIT_PING`, `R1` …) — also called by the LabChat app. */
  replyTicket(ticketId: string, replyId: string): ReplyResult;
  /** INC57-B "File bug" form. */
  fileBug(ticketId: string, fields: Record<string, string | number>): ResolveResult;
  /** INC61-style matching task (+ status line). */
  submitTask(ticketId: string, answers: { matches: Record<string, string>; statusLineId?: string }): ResolveResult;
  /** Arcade hint (`H`): Nudge → Pointer → Walkthrough (tier 3 needs `confirm`). */
  ticketHint(ticketId: string, confirm?: boolean): HintResult | null;

  /* ═══ Drills ═══ */
  startDrill(drillId: string, opts?: { mode?: string; daily?: boolean; tags?: string[] }): void;
  drillItem(itemId: string): DrillItem | null;
  /** Grade the current item (scoring per GP §2.4.1 unless `pointsOverride`). */
  answerDrill(itemId: string, verdict: DrillVerdict): DrillFeedback;
  finishDrill(): void;

  /* ═══ Free Play ═══ */
  startFreeplay(opts?: { slot?: 1 | 2 | 3; fresh?: boolean }): void;
  faultInjectorEntries(): FaultInjectorEntry[];
  injectFault(incidentId: string, opts?: { variantId?: string; rig?: string; createTicket?: boolean }): MissionResult<{ injectionId: string }>;
  clearFault(injectionId: string): void;
  clearAllFaults(): void;
  setSandbox(patch: SandboxPatch): void;
  /** "Reset lab to factory" (GP §3.1 roster). */
  resetLab(): void;
  saveSnapshot(slot: 1 | 2 | 3): MissionResult;
  loadSnapshot(slot: 1 | 2 | 3): MissionResult;
  snapshotSlots(): ({ slot: 1 | 2 | 3; savedAt: number; label: string } | null)[];

  /* ═══ Certification ═══ */
  startCertification(examId: string): MissionResult;
  /** Grade the written paper (answers given with `answerQuiz(…, 'cert')`). */
  submitWritten(): CertWrittenResult;
  startPractical(): void;
  /** Exam-form answer for a practical task (P1-3 "200"). */
  submitPracticalAnswer(taskId: string, answer: string): MissionResult<{ passed: boolean }>;

  /* ═══ Tools & inventory (HUD keys 1–5 / wheel / R / Q; world pickups) ═══ */
  /** Hotbar slot (null = holster to `hand`). Disabled while carrying a large item or in dialogue. */
  selectHotbar(slot: HotbarSlot | null): void;
  selectTool(tool: ToolId): void;
  /** `R`: cycle the held tool's mode (multimeter V⎓/V~/Ω/continuity, fuse rating, card, screwdriver bit). */
  cycleToolMode(): void;
  /** World pickups (fuse tray, bins, Husky chest). Fails when pockets are full (3 fuses). */
  takeItem(item: InventoryItemRef, count?: number): MissionResult;
  /** World installs / uses (insert fuse, plug cable, install device). */
  useItem(item: InventoryItemRef, count?: number): MissionResult;
  /** `Q` with a large item: set it down (on `targetId` when given). */
  setDownCarried(targetId?: string): MissionResult;

  /* ═══ Teach Cards, Field Manual, Notebook ═══ */
  dismissTeachCard(teachCardId: string): void;
  /** Teach Card **Practice** → its drill filtered to the tag. */
  practiceTeachCard(teachCardId: string): void;
  unlockManualEntry(entryId: string, source: string): void;
  markManualRead(entryId: string): void;
  toggleBookmark(entryId: string): void;
  setNotes(text: string): void;
  pinEvidence(evidenceId: string, pinned: boolean): void;

  /* ═══ Profile ═══ */
  /** Rank for an XP total (XP thresholds only). */
  rankFor(xp: number): { id: string; title: string; minXp: number; nextXp: number | null };
  careerRank(): RankView;
  achievements(): AchievementView[];
  mastery(): TagMasteryView[];
  weakestTags(n: number): TagMasteryView[];
  leaderboard(boardId: string): LeaderboardEntry[];
  setRealism(realism: Realism): void;
  setPlayerName(name: string): void;
  /** Debug/dev: jump to a rank or grant XP (dev overlay only). */
  debugGrant?(xp: number, rank?: CareerRankId): void;
}
