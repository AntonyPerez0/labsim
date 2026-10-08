/**
 * Academy lesson scripts (Cur §2 module tables → `src/missions/academy/M##.ts`).
 * Re-exported from `@/missions/types`.
 *
 * One `LessonDef` per module (titles, objectives, prerequisites, facts, checkpoint ids and the
 * GP §2.2.2 unlock list live in content `MODULES_BY_ID`). Steps run in order; `branch` steps jump by step id. Every step starts
 * with an autosave checkpoint (sim snapshot + step index, GP §2.2.1) unless `checkpoint: false`.
 *
 * Runtime rules (Cur §2.0 + GP §2.2.1):
 *  - XP: 10 per step, `interact` 15, `computer-task` 25 (−50 % when "Show me" was used); module +100;
 *    `setup`/`branch`/`script`/`hint`/`fast-forward`/`wait-*` steps award 0 unless `xp` is set.
 *  - Stars: ★ complete · ★★ ≤ 2 hints · ★★★ no hints and every checkpoint 100 % first try. Every hint
 *    tier revealed (timed or requested) and every "Show me" counts as a hint.
 *  - Academy never hard-fails: wrong actions give the mentor line and let the player retry.
 *  - Time scale 1; steps that wait on the 5-minute health check offer Force health check / fast-forward ×30.
 */
import type { AnyEventMatcher, Condition, ObjectiveDef } from './conditions';
import type {
  GhostAction,
  HintDef,
  HintEffect,
  LocationId,
  MarkerTarget,
  NpcKey,
  PropId,
  ScriptAction,
  SetupSpec,
  SpokenLine,
  TeachCardContent,
  AppId,
} from './common';

export type LessonStepKind =
  | 'dialogue'
  | 'walk-to'
  | 'inspect'
  | 'interact'
  | 'computer-task'
  | 'quiz-checkpoint'
  | 'setup'
  | 'wait-for-event'
  | 'wait-for-condition'
  | 'fast-forward'
  | 'branch'
  | 'hint'
  | 'script';

/** A dialogue choice (keys 1–4). Wrong choices play `response` (e.g. Tate's correction) and let the player choose again. */
export interface DialogueChoice {
  id: string;
  text: string;
  correct: boolean;
  /** Lines played after the pick (correct: the NPC's reply; wrong: the correction). */
  response?: readonly SpokenLine[];
  /** Optional Teach Card for a wrong pick (Academy centre modal). */
  teach?: TeachCardContent;
}

/**
 * A wrong action watched during a step (Cur "Wrong action gives the mentor correction line").
 * @example { id: 'edit-name', on: on('orca.entitySaved', { entity: 'robot' }), when: c.neq(p.robot('johnny-5').name, 'johnny-5'),
 *            say: 'Name is the system identifier. Pipelines use it. Leave it.', speaker: 'tate' }
 */
export interface WrongActionDef {
  id: string;
  on: AnyEventMatcher;
  /** Only counts when this also holds right after the event. */
  when?: Condition;
  say: string;
  speaker?: NpcKey;
  teach?: TeachCardContent;
  /** Counts toward the "3 wrong → highlight" rule (default true). */
  countsAsWrong?: boolean;
  /** Also raise this global wrong action (Academy: Teach Card + mastery evidence, no points). */
  gw?: string;
}

interface StepBase {
  /** Stable id: module + Cur step number, `M06.08` (sub-steps `M06.08a`). */
  id: string;
  /** HUD objective (exact Cur text). Dialogue steps use the subtitle box instead. */
  hud?: string;
  /** HUD marker / compass target (defaults to the step target). */
  marker?: MarkerTarget;
  /** XP override (defaults per kind, see module docs). */
  xp?: number;
  /** Hint ladder override (else `ACADEMY_HINT_DEFAULTS[kind]`). */
  hints?: readonly HintDef[];
  wrongActions?: readonly WrongActionDef[];
  onEnter?: readonly ScriptAction[];
  /** Played after success, before the next step (e.g. Jared: "On it…" and the fix). */
  onComplete?: readonly ScriptAction[];
  /** Autosave checkpoint at step start (default true). */
  checkpoint?: boolean;
  /** Fact ids this step teaches/practises (debrief, lint). */
  factIds?: readonly string[];
}

/** Mentor speaks (exact text). Advances on E/click/Space after 1.5 s; with `choices`, on the correct choice. */
export interface DialogueStep extends StepBase {
  kind: 'dialogue';
  speaker: NpcKey;
  text: string;
  choices?: readonly DialogueChoice[];
}

/** Player capsule within `radiusM` (default 1.5 m) of the location marker. Hints: 45 s pulse, 90 s "Over here!" + breadcrumb. */
export interface WalkToStep extends StepBase {
  kind: 'walk-to';
  hud: string;
  location: LocationId;
  radiusM?: number;
}

/** Crosshair on the prop ≥ `dwellS` (default 1.0) within `maxDistanceM` (default 2.5). Callouts show 4 s and become Field Manual entries. */
export interface InspectStep extends StepBase {
  kind: 'inspect';
  hud: string;
  prop: PropId;
  /** Sub-part that must be targeted (e.g. `rack.a.rails.u33-left` for "find rack unit 33"). */
  part?: PropId;
  dwellS?: number;
  maxDistanceM?: number;
  /** Exact callout labels (Cur), ≤ 4 shown at a time. */
  callouts?: readonly string[];
  /** Field Manual entries unlocked by the callouts. */
  manualEntryIds?: readonly string[];
}

/**
 * Hands-on action evaluated against sim state. With `choices`, pressing E on the NPC target opens
 * the choice list (Cur M06 step 10: escalate EVE to Jared).
 */
export interface InteractStep extends StepBase {
  kind: 'interact';
  hud: string;
  target: PropId;
  success: Condition;
  choices?: readonly DialogueChoice[];
  /** Line shown above the choices. */
  prompt?: string;
  /** Highlight the correct control after N wrong actions (default 3). */
  highlightAfterWrong?: number;
  /** Optional multi-part objectives shown as a checklist (all must be done). */
  objectives?: readonly ObjectiveDef[];
}

/**
 * Seated at `loc.workstation` (auto-prompt "Sit at your workstation (E)"); the app opens focused;
 * HUD objective pinned top-right of the desktop. Hints: 60 s idle (which app/menu), 120 s (exact
 * command/field), 180 s "Show me" (−50 % step XP).
 */
export interface ComputerTaskStep extends StepBase {
  kind: 'computer-task';
  hud: string;
  app: AppId | readonly AppId[];
  route?: string;
  success: Condition;
  showMe?: readonly GhostAction[];
  /** Default true. */
  requireSeated?: boolean;
  /** Show "Force health check / fast-forward ×30" while this step waits (Cur M06 step 8). */
  offerFastForward?: boolean;
  objectives?: readonly ObjectiveDef[];
}

/** Modal quiz with the listed items in order. Pass ≥ 80 % first try; on fail re-run missed + 2 random from the module. */
export interface QuizCheckpointStep extends StepBase {
  kind: 'quiz-checkpoint';
  /** `CP-M06.1`. */
  checkpointId: string;
  title: string;
  questionIds: readonly string[];
  /** Default 0.8 (`ceil(0.8 × n)` correct). */
  passRatio?: number;
}

/** Instant: apply a setup (faults, flags, app gating, statuses). */
export interface SetupStep extends StepBase {
  kind: 'setup';
  setup: SetupSpec;
}

/** Wait until an event happens `count` times (default 1). */
export interface WaitForEventStep extends StepBase {
  kind: 'wait-for-event';
  match: AnyEventMatcher;
  count?: number;
  timeoutS?: number;
  /** On timeout: skip ahead or show the next hint (default 'hint'). */
  onTimeout?: 'continue' | 'hint';
}

/** Wait until a condition holds. */
export interface WaitForConditionStep extends StepBase {
  kind: 'wait-for-condition';
  success: Condition;
  timeoutS?: number;
  onTimeout?: 'continue' | 'hint';
}

/**
 * Advance the game clock. `auto` jumps at once; `offer` shows the HUD buttons
 * "Force health check" / "Fast-forward ×30" and completes when the target is reached.
 */
export interface FastForwardStep extends StepBase {
  kind: 'fast-forward';
  to: 'next-health-check' | { gameMinutes: number } | { until: Condition; maxGameMinutes: number };
  mode: 'auto' | 'offer';
}

/** Jump to `goto` when `if` holds (or always when `if` is omitted), else to `else` (default: next step). */
export interface BranchStep extends StepBase {
  kind: 'branch';
  if?: Condition;
  goto: string;
  else?: string;
}

/** Non-blocking hint / mentor bark, then continue. */
export interface HintStep extends StepBase {
  kind: 'hint';
  text: string;
  speaker?: NpcKey;
  effect?: HintEffect;
  target?: MarkerTarget;
}

/** Run script actions (blocking `say` lines wait for ack), then continue. */
export interface ScriptStep extends StepBase {
  kind: 'script';
  actions: readonly ScriptAction[];
}

export type LessonStep =
  | DialogueStep
  | WalkToStep
  | InspectStep
  | InteractStep
  | ComputerTaskStep
  | QuizCheckpointStep
  | SetupStep
  | WaitForEventStep
  | WaitForConditionStep
  | FastForwardStep
  | BranchStep
  | HintStep
  | ScriptStep;

/**
 * A module's lesson script. Metadata (title, objectives, prerequisites, facts, checkpoint items)
 * lives in `ModuleMeta` (`src/content`); this is the playable part.
 *
 * @example
 * export const M01: LessonDef = {
 *   moduleId: 'M01',
 *   mentor: 'morgan',
 *   setup: { preset: 'academy:M01', spawn: 'loc.entrance' }, // the preset starts build #4120 on WALL-E
 *   deck: 'deck.M01',
 *   realLabChecklist: ["Read a rig's status tablet header before touching anything.", 'Never fight a running robot — wait for the job.'],
 *   steps: [
 *     { id: 'M01.01', kind: 'dialogue', speaker: 'morgan', text: 'Welcome to the LabSim automation lab! …' },
 *     { id: 'M01.02', kind: 'walk-to', hud: 'Walk to Touch Rack A', location: 'loc.rack-a' },
 *     { id: 'M01.04', kind: 'inspect', hud: "Look at WALL-E's status tablet", prop: 'prop.walle.tablet',
 *       callouts: ['WALL-E', 'Status: OK', 'Brainbox v6', 'Robot / Robot Control / Motion Control'] },
 *     { id: 'M01.06', kind: 'interact', hud: 'Tap the Motion Control tab and press Park All', target: 'prop.walle.tablet',
 *       success: c.happened(on('rig.command', { rigId: 'wall-e', command: 'park.all', ok: false })) }, // lock overlay shown once
 *     { id: 'M01.14', kind: 'quiz-checkpoint', checkpointId: 'CP-M01.1', title: 'Lab Basics', questionIds: ['Q001', 'Q002', 'Q003', 'Q004', 'Q005'] },
 *   ],
 * };
 */
export interface LessonDef {
  moduleId: string;
  mentor: NpcKey;
  /** World state on start (Cur module "Setup"). */
  setup: SetupSpec;
  /** Re-armed faults for replays (Cur §2.0); defaults to `setup`. */
  replaySetup?: SetupSpec;
  steps: readonly LessonStep[];
  /** 3–6 "In the real lab you will…" bullets for the debrief (GP §2.2.1). */
  realLabChecklist: readonly string[];
  /** Flashcard deck unlocked on completion; defaults to `ModuleMeta.deck ?? 'deck.<moduleId>'`. */
  deck?: string;
  /** Field Manual chapters unlocked on completion ("Lab Basics"). */
  manualChapters?: readonly string[];
}

/** Cur §2.0 default hint ladders per step kind (real seconds). */
export const ACADEMY_HINT_DEFAULTS: Readonly<Partial<Record<LessonStepKind, readonly HintDef[]>>> = {
  'walk-to': [
    { afterS: 45, effect: 'pulse-marker' },
    { afterS: 90, effect: 'breadcrumb', text: 'Over here!' },
  ],
  inspect: [
    { afterS: 60, effect: 'bright-outline' },
    { afterS: 120, effect: 'auto-pan' },
  ],
  'computer-task': [
    { afterS: 60, idle: true, effect: 'text' },
    { afterS: 120, idle: true, effect: 'text' },
    { afterS: 180, idle: true, effect: 'show-me-button' },
  ],
};

/** Cur §2.0 / GP §4.2 XP per step kind. */
export const ACADEMY_STEP_XP: Readonly<Record<LessonStepKind, number>> = {
  dialogue: 10,
  'walk-to': 10,
  inspect: 10,
  interact: 15,
  'computer-task': 25,
  'quiz-checkpoint': 10,
  setup: 0,
  'wait-for-event': 0,
  'wait-for-condition': 0,
  'fast-forward': 0,
  branch: 0,
  hint: 0,
  script: 0,
};
