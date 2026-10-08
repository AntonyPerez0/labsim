/**
 * Persisted player progress — `RootState.progress` (GP §4, §7; Cur §4.0 Leitner, Cur §5.4 cert records).
 *
 * Re-exported from `@/core/state`; import from there.
 *
 * Ownership: the mission runtime writes it (inside `transact()`), `./persistence` loads/saves it,
 * the UI reads it. Everything here is plain JSON.
 *
 * Time conventions (never game time — the lab clock resets every activity):
 *  - `…Day`     = local day number (`dayNumber()` in `./persistence`, days since 1970-01-01 local).
 *  - `…DateKey` = local date `"YYYY-MM-DD"` (Daily Challenge, leaderboards).
 *  - `…At`      = real epoch ms. Mission logic must not call `Date.now()`; it reads real time only through
 *                 the clock helpers in `./persistence` at its boundary and passes the values in.
 */
import type { Settings } from './state';

/** Realism profile (GP §1.4). Strict = "Real Lab": no markers, history-only terminal, Arcade hint tier 1 only, XP ×1.25. */
export type Realism = 'standard' | 'strict';

/**
 * Career ranks (GP §4.3), 1:1 by order with the curriculum's CERT-R1…R5 after Intern.
 * Ids = `RankDef.id` in `src/content/ranks.ts` (titles, XP thresholds, caps and cosmetics live there).
 */
export type CareerRankId =
  | 'intern'
  | 'lab-technician'
  | 'automation-engineer-1'
  | 'automation-engineer-2'
  | 'senior-automation-engineer'
  | 'lab-lead';

export type CertExamId = 'CERT-R1' | 'CERT-R2' | 'CERT-R3' | 'CERT-R4' | 'CERT-R5';

/** End-of-shift grade (GP §2.3.10). */
export type ShiftGrade = 'S' | 'A' | 'B' | 'C' | 'D';

export type Medal = 'bronze' | 'silver' | 'gold';

/** Mastery label from effective mastery (GP §4.8.3). */
export type MasteryLabel = 'new' | 'weak' | 'learning' | 'mastered';

/** Where a piece of evidence was seen (GP §3.4 symptom prefixes, plus the multimeter). */
export type EvidenceSource =
  | 'orca'
  | 'notes'
  | 'jenkins'
  | 'tablet'
  | 'led'
  | 'camera'
  | 'terminal'
  | 'world'
  | 'labchat'
  | 'ide'
  | 'github'
  | 'gimp'
  | 'ollama'
  | 'meter'
  | 'hud';

/** Notebook evidence line (GP §2.6: auto-captured, e.g. "Notes: connect timed out after 10000 ms @ 08:15 — EVE"). */
export interface EvidenceEntry {
  id: string;
  source: EvidenceSource;
  text: string;
  /** Game-clock ms when captured (shown as HH:MM). */
  atGameMs: number;
  rig: string | null;
  ticketId: string | null;
}

export interface QuizStat {
  seen: number;
  correct: number;
  lastSeenDay: number;
  /** Result of the latest attempt (null = never answered). */
  lastCorrect: boolean | null;
}

/**
 * Leitner card (Cur §4.0). Boxes 1–5; intervals: box 1 every session, 2 → 1 day, 3 → 3 days,
 * 4 → 7 days, 5 → 14 days. Older saves may lack the fields after `dueDay` — default them.
 * Persistence may store this map under `labsim.leitner.v1:<profileId>` (GP §7.1) using Cur's exact
 * shape `{ box, due, lastReviewed, streak }`.
 */
export interface LeitnerCard {
  /** Box 1..5. */
  box: number;
  /** Day number when the card is next due. */
  dueDay: number;
  /** Real epoch ms of the due moment (Cur storage shape; local midnight of `dueDay`). */
  due: number;
  /** Real epoch ms of the last review (0 = never reviewed). */
  lastReviewed: number;
  /** Consecutive "Got it" answers. */
  streak: number;
  /** Day the card entered box 1 (deck unlocked). */
  introducedDay: number;
}

/** Per fine-tag mastery (GP §4.8.3). Effective mastery = m × 0.5^(daysSince(lastEvidenceAt)/halfLife[level]). */
export interface TagMastery {
  /** Raw mastery m ∈ [0,1]. */
  m: number;
  /** 0..6; half-lives [1, 2, 4, 7, 14, 30, 60] days. */
  level: number;
  /** Real epoch ms of the last evidence event (0 = never). */
  lastEvidenceAt: number;
  /** Lowest m ever observed (ACH33 "Weak No More"). */
  minSeen: number;
  /** Real epoch ms of the last level-up (level-ups need ≥ 20 h between them). */
  lastLevelUpAt: number;
  /** Number of evidence events (0 = label "New"). */
  evidence: number;
}

export interface ModuleProgress {
  /** @deprecated v1 field — use `status === 'complete'`. Kept in sync by the runtime. */
  completed: boolean;
  /** @deprecated v1 field — best checkpoint score 0..100. Use `bestCheckpoint`. */
  bestScore: number;
  /** Day the module was first completed (0 = never). */
  completedAtDay: number;
  status: 'not-started' | 'in-progress' | 'complete';
  /** Best stars earned (Cur §2.0: ★ complete · ★★ ≤ 2 hints · ★★★ no hints and checkpoint 100 % first try). */
  stars: 0 | 1 | 2 | 3;
  /** Best first-try checkpoint ratio 0..1. */
  bestCheckpoint: number;
  replays: number;
  /** One-time star bonuses already paid (GP §2.2.1: first ★★ +50 XP, first ★★★ +100 XP). */
  starBonusesPaid: { two: boolean; three: boolean };
}

/** Academy resume point (GP §2.2.1 checkpoint saves). The sim snapshot itself is stored by persistence under `labsim.checkpoint.v1:<id>`. */
export interface AcademyCheckpointRef {
  moduleId: string;
  stepIndex: number;
  stepId: string;
  replay: boolean;
  /** Real epoch ms of the save. */
  savedAt: number;
}

export interface IncidentStats {
  attempts: number;
  solves: number;
  /** Best resolve time (real ms from arrival), 0 = none. */
  bestMs: number;
  bestScore: number;
  fastDiagnoses: number;
  escalations: number;
  wrongCalls: number;
  /** Real epoch ms. */
  lastSeenAt: number;
  variantsSeen: string[];
}

export interface DrillStats {
  best: number;
  medal: Medal | null;
  rounds: number;
  bestAccuracy: number;
  /** Medals whose one-time XP bonus was paid (GP §4.2: first Bronze +50, Silver +100, Gold +200). */
  medalsPaid: Medal[];
  /** Highest mode unlocked/played (e.g. DR05 modes "A" | "B" | "C", DR08 "build" | "doctor"). */
  modesUnlocked: string[];
}

/** One finished (or abandoned) shift — GP §7.2 `shifts.history[]`. */
export interface ShiftRecord {
  /** Real epoch ms at the end. */
  at: number;
  configId: string;
  length: number;
  seed: string;
  realism: Realism;
  score: number;
  grade: ShiftGrade;
  ratio: number;
  ticketsSpawned: number;
  ticketsResolved: number;
  breaches: number;
  /** GW ids of every penalty event, in order. */
  penalties: string[];
  strikes: number;
  maxCombo: number;
  uptime: number;
  fastDiagnoses: number;
  escalations: { correct: number; bounced: number };
  abandoned: boolean;
  /** Daily Challenge date key, if this was a daily. */
  dailyDateKey: string | null;
  ranked: boolean;
  wildcard: boolean;
}

export interface DailyRecord {
  dateKey: string;
  score: number;
  grade: ShiftGrade;
  realism: Realism;
  ranked: boolean;
}

/** Certification record (Cur §5.4) — persisted under `labsim.cert.v1:<id>` by persistence. */
export interface CertRecord {
  attempts: number;
  passed: boolean;
  /** Real epoch ms of the first pass (0 = never). */
  passedAt: number;
  distinction: boolean;
  bestWrittenPct: number;
  /** Best practical completion time in real ms (0 = none). */
  bestPracticalMs: number;
  /** Real epoch ms of the last attempt start. */
  lastAttemptAt: number;
  /** Retake gate (Cur §5.4): real epoch ms after which a retake is allowed (10 real minutes after a fail). */
  retakeAvailableAt: number;
  /** A Leitner session containing these facts' cards must happen before a retake. */
  retakeNeedsReviewOf: string[];
  /** Question ids of the previous written attempt (avoided when the pool allows, Cur §5.2). */
  lastWrittenQuestionIds: string[];
}

/** Local leaderboard entry (GP §4.7). Boards hold the top 20. */
export interface LeaderboardEntry {
  profileId: string;
  name: string;
  score: number;
  grade: ShiftGrade | null;
  /** Drill boards: medal / accuracy. */
  medal: Medal | null;
  accuracy: number | null;
  /** Real epoch ms. */
  at: number;
  seed: string;
  realism: Realism;
  contentVersion: string;
  maxCombo: number;
  fastDiagnoses: number;
}

/**
 * Board ids (GP §4.7): `shift:5:standard`, `shift:10:strict`, `shift:20:standard`,
 * `daily:<dateKey>:standard|strict`, `dailyDrill:<dateKey>`, `drill:DR01` … `drill:DR19`.
 */
export type LeaderboardId = string;

/** Achievement progress accumulators (GP §7.2 `achievements.progress`), e.g. `{ inspected: ["wall-e:pi"] }`. */
export type AchievementProgress = Record<string, number | boolean | string | string[]>;

export interface StreakState {
  current: number;
  /** Longest streak (GP "longest"). */
  best: number;
  /** @deprecated v1 — last day the game was played. Use `lastCountedDay`. */
  lastPlayedDay: number;
  /** Last day that counted (≥ 300 XP earned that day, GP §4.7). 0 = never. */
  lastCountedDay: number;
  lastCountedDateKey: string | null;
  /** Streak freezes banked (+1 per 7-day milestone, max 2; auto-used on a missed day). */
  freezes: number;
  /** XP earned on `xpTodayDay`. */
  xpToday: number;
  xpTodayDay: number;
}

export interface ProfileStats {
  incidentsResolved: number;
  robotsParked: number;
  fusesReplaced: number;
  pipelinesRun: number;
  playSeconds: number;
  ticketsTotal: number;
  diagnosisCalls: number;
  fastDiagnoses: number;
  escalationsCorrect: number;
  escalationsBounced: number;
  inspections: number;
  flashcardsReviewed: number;
  drillRounds: number;
  shiftsCompleted: number;
  academyStepsCompleted: number;
  hintsUsed: number;
  freeplayFixes: number;
}

export interface ProgressState {
  /** Schema version of this blob (GP §7.5 `schemaVersion`). */
  version: number;
  /** Content version (GP §4.6/§7.5) — bump when the incident/drill catalog changes. */
  contentVersion: string;
  /** Local profile id (GP §7.1 `labsim.profile.v1:<id>`); max 3 profiles. */
  profileId: string;
  /** Profile name, ≤ 16 chars (GP §6.1). */
  playerName: string;
  /** Real epoch ms the profile was created (0 = unknown). */
  createdAt: number;
  realism: Realism;
  xp: number;
  /** Current career rank (promotion needs exam + XP + extra gate, GP §4.3). */
  rank: CareerRankId;
  /** Next rank waiting on XP / gates ("Promotion pending: 640 XP to go"), or null. */
  pendingRank: { rank: CareerRankId; missing: string[] } | null;
  cosmetics: { lanyard: string; unlocked: string[] };

  /* ── Academy ── */
  /** Academy modules by id ("M01"). */
  modules: Record<string, ModuleProgress>;
  /** Resume point for "Continue" (GP §7.1 checkpoint). */
  academyCheckpoint: AcademyCheckpointRef | null;

  /* ── Knowledge ── */
  quiz: Record<string, QuizStat>;
  /** @deprecated v1 number map (tag → 0..1). Use `tagMastery`. Ignored by the runtime. */
  mastery: Record<string, number>;
  /** Per fine tag (GP §4.8.1) mastery model. */
  tagMastery: Record<string, TagMastery>;
  leitner: Record<string, LeitnerCard>;
  flashcards: {
    /** Lifetime reviews (ACH32). */
    reviewsTotal: number;
    /** New cards introduced on `newCardsDay` (cap 20/day, Cur §4.0). */
    newCardsToday: number;
    newCardsDay: number;
    /** Review XP earned on `xpTodayDay` (cap 200/day, GP §4.2). */
    xpToday: number;
    xpTodayDay: number;
    /** Day of the last completed Leitner session (cert retake gate). */
    lastSessionDay: number;
    /** Card ids reviewed in the last completed session. */
    lastSessionCardIds: string[];
  };

  /* ── Achievements ── */
  achievements: Record<string, { unlockedAtDay: number; unlockedAt: number }>;
  achievementProgress: Record<string, AchievementProgress>;

  /* ── Arcade ── */
  incidents: Record<string, IncidentStats>;
  drills: Record<string, DrillStats>;
  /** Best score per shift config id ("shift-5", "shift-10", "shift-20", "daily"). */
  bestShiftScores: Record<string, number>;
  /** Best score per drill id ("DR01"). Mirrors `drills[id].best`. */
  bestDrillScores: Record<string, number>;
  shifts: {
    /** Newest last; keep the last 50. */
    history: ShiftRecord[];
    gradeCounts: Record<ShiftGrade, number>;
    /** Best Ratio of a 20-min Full Shift (CERT-R5 eligibility needs ≥ 0.80). */
    bestFullShiftRatio: number;
    /** Completed shifts by length in minutes ("5" | "10" | "20"). */
    byLength: Record<string, number>;
  };
  daily: {
    lastRankedDateKey: string | null;
    rankedCount: number;
    /** Newest last; keep 30. */
    history: DailyRecord[];
  };
  /** Lifetime counts of GW penalty events by id ("GW17": 3). */
  penalties: Record<string, number>;
  freeplay: {
    /** Lifetime verified fixes of injected faults (ACH42). */
    fixesTotal: number;
    /** XP from Free Play fixes on `xpTodayDay` (cap 300/day). */
    xpToday: number;
    xpTodayDay: number;
  };

  /* ── Certification ── */
  certs: Partial<Record<CertExamId, CertRecord>>;

  /* ── Field Manual & notebook ── */
  fieldManual: { unlocked: string[]; bookmarks: string[]; read: string[] };
  notebook: { notes: string; pinnedEvidence: EvidenceEntry[] };

  /* ── Leaderboards (persisted under `labsim.leaderboards.v1`, shared by local profiles) ── */
  leaderboards: Record<LeaderboardId, LeaderboardEntry[]>;

  streak: StreakState;
  stats: ProfileStats;
  /** One-shot flags: `seenIntro`, `prompt:<controlHintId>`, `quickSetupDone`, `teach:<id>` … */
  flags: Record<string, boolean>;
  settings: Settings;
}
