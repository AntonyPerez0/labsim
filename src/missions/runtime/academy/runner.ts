/**
 * Academy lesson runner (Cur §2.0, GP §2.2.1). Executes a `LessonDef` step list: blocking dialogue,
 * walk-to / inspect / interact / computer-task / quiz-checkpoint / setup / wait / fast-forward / branch /
 * hint / script steps; objectives, markers, hint ladders, wrong-action corrections, step checkpoints
 * (sim snapshot + step index), XP and stars. The store holds the visible state (`session.academy`,
 * `session.dialogue`, `session.objectives`, `ui.marker`); this module keeps the non-serialisable parts.
 */
import { current, isDraft } from 'immer';
import type { TxContext } from '@/core/store';
import type { AcademyRunState, Objective, RootState } from '@/core/state';
import type { LabState } from '@/sim/types';
import { requestOpenApp, requestHint as requestAppHint } from '@/computer/apps';
import type { DialogueChoice, LessonDef, LessonStep, ScriptAction, SpokenLine } from '../../types';
import { ACADEMY_STEP_XP } from '../../types';
import { RT, onActivityReset } from '../rt';
import { createScope, disposeScope, evaluate, sampleScope, scopeStatus, type Scope } from '../conditions/evaluate';
import { applySetup, runAction, showLine } from '../scripts';
import { bark, pushTeachCard } from '../feedback';
import { simRun } from '../simx';
import { realNowMs } from '../clock';
import { grantXp } from '../progression/xp';
import { revealNextHint, stepTarget } from './hints';
import { startCheckpointQuiz } from './checkpoint';
import { finishModule } from './complete';

/* ───────────────────────────── local (non-serialisable) state ───────────────────────────── */

interface RunnerLocal {
  lesson: LessonDef | null;
  scope: Scope | null;
  objScopes: Map<string, Scope>;
  queue: ScriptAction[];
  afterQueue: 'activate' | 'advance' | 'complete' | 'none';
  /** Step index to enter after the current step's onComplete actions. */
  nextIndex: number;
  lines: SpokenLine[];
  afterLines: 'complete' | 'rechoose' | 'none';
  /** Checkpoint snapshot of the current step (Restart step). */
  snapshot: LabState | null;
  snapshotIndex: number;
  inspectSinceS: number | null;
  eventCount: number;
  stepStartSeq: number;
  /** Choices currently shown (dialogue / interact). */
  choices: readonly DialogueChoice[] | null;
  appOpened: boolean;
  /** Re-entrancy guard (advance → enter → complete …). */
  depth: number;
  /**
   * Event seq when the previous step completed: the next step's conditions also see what the player did
   * while that step's onComplete lines were on screen (e.g. the next terminal command typed while a
   * mentor line waited for a click), instead of silently dropping it.
   */
  carrySeq: number | null;
  /** Last completed step (global wrong-action exemptions reach a moment past the step, gwExempt.ts). */
  lastCompleted: { id: string; atS: number } | null;
}

export const L: RunnerLocal = fresh();

function fresh(): RunnerLocal {
  return {
    lesson: null,
    scope: null,
    objScopes: new Map(),
    queue: [],
    afterQueue: 'none',
    nextIndex: 0,
    lines: [],
    afterLines: 'none',
    snapshot: null,
    snapshotIndex: -1,
    inspectSinceS: null,
    eventCount: 0,
    stepStartSeq: 0,
    choices: null,
    appOpened: false,
    depth: 0,
    carrySeq: null,
    lastCompleted: null,
  };
}

onActivityReset(() => {
  disposeStepScopes();
  Object.assign(L, fresh());
});

export function currentLesson(): LessonDef | null {
  return L.lesson;
}

export function currentStep(s: RootState): LessonStep | null {
  const ac = s.session.academy;
  if (!ac || !L.lesson) return null;
  return L.lesson.steps[ac.stepIndex] ?? null;
}

/** Last step checkpoint, kept across activity resets so main-menu Continue can resume it. */
let resume: { moduleId: string; index: number; lab: LabState } | null = null;

export function stepSnapshot(moduleId?: string): { index: number; lab: LabState } | null {
  if (!resume || (moduleId && resume.moduleId !== moduleId)) return null;
  return { index: resume.index, lab: resume.lab };
}

export function mentor(): string {
  return L.lesson?.mentor ?? 'morgan';
}

/* ───────────────────────────── start ───────────────────────────── */

export function newAcademyRun(moduleId: string, replay: boolean): AcademyRunState {
  return {
    moduleId,
    replay,
    stepIndex: 0,
    stepId: '',
    stepKind: '',
    phase: 'active',
    stepStartedAtMs: 0,
    stepElapsedS: 0,
    idleS: 0,
    hintTier: 0,
    hintText: null,
    wrongActions: 0,
    showMeUsed: false,
    highlight: null,
    breadcrumb: false,
    fastForwardOffered: false,
    stepsDone: [],
    hintsUsedTotal: 0,
    showMeUsedTotal: 0,
    xpEarned: 0,
    checkpoints: {},
    stars: null,
  };
}

/** Begin running a lesson (the activity and sim preset are already set up by the caller). */
export function runLesson(d: RootState, ctx: TxContext, lesson: LessonDef, replay: boolean, startIndex = 0): void {
  L.lesson = lesson;
  d.session.academy = newAcademyRun(lesson.moduleId, replay);
  enterStep(d, ctx, Math.max(0, Math.min(startIndex, lesson.steps.length - 1)));
}

/* ───────────────────────────── step lifecycle ───────────────────────────── */

function disposeStepScopes(): void {
  if (L.scope) disposeScope(L.scope.id);
  for (const sc of L.objScopes.values()) disposeScope(sc.id);
  L.scope = null;
  L.objScopes.clear();
}

function snapshotLab(d: RootState): LabState | null {
  try {
    const lab = isDraft(d.lab) ? current(d.lab) : d.lab;
    return JSON.parse(JSON.stringify(lab)) as LabState;
  } catch (err) {
    console.warn('[missions] step snapshot failed', err);
    return null;
  }
}

export function enterStep(d: RootState, ctx: TxContext, index: number): void {
  const lesson = L.lesson;
  const ac = d.session.academy;
  if (!lesson || !ac) return;
  const step = lesson.steps[index];
  if (!step) {
    finishModule(d, ctx, lesson);
    return;
  }
  disposeStepScopes();
  Object.assign(ac, {
    stepIndex: index,
    stepId: step.id,
    stepKind: step.kind,
    phase: 'active',
    stepStartedAtMs: d.lab.time.nowMs,
    stepElapsedS: 0,
    idleS: 0,
    hintTier: 0,
    hintText: null,
    wrongActions: 0,
    showMeUsed: false,
    highlight: null,
    breadcrumb: false,
    fastForwardOffered: step.kind === 'computer-task' ? !!step.offerFastForward && d.session.realism !== 'strict' : false,
  } satisfies Partial<AcademyRunState>);
  d.session.stepIndex = index;
  d.session.dialogue = null;
  d.ui.highlight = null;
  L.inspectSinceS = null;
  L.eventCount = 0;
  L.stepStartSeq = L.carrySeq !== null && L.carrySeq <= RT.seq ? L.carrySeq : RT.seq;
  L.carrySeq = null;
  L.choices = null;
  L.appOpened = false;
  L.lines = [];
  L.afterLines = 'none';

  // Autosave checkpoint (GP §2.2.1): sim snapshot + step index.
  const noCheckpoint = step.checkpoint === false || step.kind === 'branch' || step.kind === 'hint';
  if (!noCheckpoint) {
    const snap = snapshotLab(d);
    if (snap) {
      L.snapshot = snap;
      L.snapshotIndex = index;
      resume = { moduleId: lesson.moduleId, index, lab: snap };
    }
    d.progress.academyCheckpoint = { moduleId: lesson.moduleId, stepIndex: index, stepId: step.id, replay: ac.replay, savedAt: realNowMs() };
  }

  setObjectives(d, step);
  ctx.emit('mission.stepStarted', { moduleId: lesson.moduleId, stepId: step.id, index, kind: step.kind });

  L.queue = [...(step.onEnter ?? [])];
  L.afterQueue = 'activate';
  pumpQueue(d, ctx);
}

function setObjectives(d: RootState, step: LessonStep): void {
  const target = stepTarget(step, mentor());
  const markersOn = d.session.realism !== 'strict' && d.progress.settings.guidance !== 'off';
  d.ui.marker = markersOn && step.kind !== 'dialogue' ? target : null;
  const objs: Objective[] = [];
  const hud = 'hud' in step ? step.hud : undefined;
  if (hud) {
    const o: Objective = { id: step.id, text: hud, done: false };
    if (target) {
      o.marker = target;
      o.markerTarget = target.id;
    }
    objs.push(o);
  }
  if ((step.kind === 'interact' || step.kind === 'computer-task') && step.objectives) {
    for (const od of step.objectives) {
      const o: Objective = { id: od.id, text: od.text, done: false };
      if (od.hint) o.hint = od.hint;
      objs.push(o);
    }
  }
  d.session.objectives = objs;
}

/** Run queued blocking script actions until one waits for an acknowledgement. */
function pumpQueue(d: RootState, ctx: TxContext): void {
  while (L.queue.length) {
    const a = L.queue.shift()!;
    if (runAction(d, ctx, a, { binding: null, ownerId: d.session.academy?.stepId ?? '' }, true) === 'wait-ack') return;
  }
  const after = L.afterQueue;
  L.afterQueue = 'none';
  if (after === 'activate') activateStep(d, ctx);
  else if (after === 'advance') advance(d, ctx);
  else if (after === 'complete') completeStep(d, ctx);
}

function activateStep(d: RootState, ctx: TxContext): void {
  const step = currentStep(d);
  const ac = d.session.academy;
  if (!step || !ac) return;
  const lesson = L.lesson!;
  switch (step.kind) {
    case 'dialogue':
      L.choices = step.choices ?? null;
      showLine(d, ctx, step.speaker, step.text, { id: step.id, choices: step.choices?.map((c) => ({ id: c.id, text: c.text })) });
      return;
    case 'setup':
      applySetup(d, ctx, step.setup, { binding: null, ownerId: step.id });
      completeStep(d, ctx);
      return;
    case 'script':
      L.queue = [...step.actions];
      L.afterQueue = 'complete';
      pumpQueue(d, ctx);
      return;
    case 'hint': {
      ac.hintText = step.text;
      if (step.speaker) bark(d, ctx, step.speaker, step.text, 'ticket');
      if (step.effect && step.effect !== 'text') ctx.emit('mission.hintEffect', { stepId: step.id, effect: step.effect, target: step.target ?? null });
      if (step.target) d.ui.highlight = step.target;
      completeStep(d, ctx);
      return;
    }
    case 'branch': {
      const ok = step.if ? evaluate(step.if, d, null) : true;
      const targetId = ok ? step.goto : step.else;
      const idx = targetId ? lesson.steps.findIndex((s) => s.id === targetId) : -1;
      completeStep(d, ctx, idx >= 0 ? idx : undefined);
      return;
    }
    case 'quiz-checkpoint':
      ac.phase = 'quiz';
      startCheckpointQuiz(d, step);
      return;
    case 'fast-forward':
      if (step.mode === 'auto') {
        doFastForward(d, step.to);
        // Completion is evaluated once the jump's events arrive (or right away for game-minute jumps).
      } else ac.fastForwardOffered = d.session.realism !== 'strict';
      break;
    case 'interact':
      // Conversation with a person (`npc.*` target, e.g. escalate to Jared): the lab has no NPC bodies to
      // press E on, so the person "comes over" and the choice list opens right away.
      if (step.choices?.length && step.target.startsWith('npc.')) {
        createStepScopes(d, step);
        showChoicePrompt(d, ctx, step);
        return;
      }
      break;
    case 'computer-task':
      if (d.ui.overlay.kind === 'computer' || step.requireSeated === false) openStepApp(d, step);
      else d.ui.controlHint = { id: 'sit-workstation', keys: ['E'], text: 'Sit at your workstation (E)' };
      break;
    default:
      break;
  }
  createStepScopes(d, step);
  checkStep(d, ctx);
}

export function openStepApp(d: RootState, step: Extract<LessonStep, { kind: 'computer-task' }>): void {
  if (L.appOpened) return;
  L.appOpened = true;
  const app = Array.isArray(step.app) ? (step.app as readonly string[])[0]! : (step.app as string);
  d.ui.overlay = { kind: 'computer' };
  d.ui.controlHint = null;
  requestOpenApp(app as never, step.route ? { route: step.route } : undefined);
}

function createStepScopes(d: RootState, step: LessonStep): void {
  const cond = step.kind === 'interact' || step.kind === 'computer-task' || step.kind === 'wait-for-condition' ? step.success : step.kind === 'fast-forward' && typeof step.to === 'object' && 'until' in step.to ? step.to.until : null;
  if (cond) L.scope = createScope({ id: `step:${step.id}`, kind: 'step', ownerId: step.id, cond, state: d, startSeq: L.stepStartSeq });
  if ((step.kind === 'interact' || step.kind === 'computer-task') && step.objectives) {
    for (const o of step.objectives) L.objScopes.set(o.id, createScope({ id: `obj:${step.id}:${o.id}`, kind: 'objective', ownerId: o.id, cond: o.done, state: d, startSeq: L.stepStartSeq }));
  }
}

function doFastForward(d: RootState, to: Extract<LessonStep, { kind: 'fast-forward' }>['to']): void {
  if (to === 'next-health-check') simRun('skipToNextHealthCheck', (s) => s.skipToNextHealthCheck(), undefined);
  else if ('gameMinutes' in to) {
    const ms = to.gameMinutes * 60_000;
    simRun('fastForward', (s) => s.fastForward(ms), undefined);
  } else {
    // Jump in 1-minute chunks until the condition holds (bounded).
    for (let i = 0; i < to.maxGameMinutes; i++) {
      if (evaluate(to.until, d, null)) break;
      simRun('fastForward', (s) => s.fastForward(60_000), undefined);
    }
  }
}

/** Evaluate the active step's completion rule. */
export function checkStep(d: RootState, ctx: TxContext): void {
  const step = currentStep(d);
  const ac = d.session.academy;
  if (!step || !ac || ac.phase !== 'active' || L.queue.length || d.session.dialogue) return;
  let done = false;
  switch (step.kind) {
    case 'walk-to':
      done = d.session.player.locationId === step.location;
      break;
    case 'inspect': {
      const dwell = step.dwellS ?? 1.0;
      done = L.inspectSinceS !== null && d.session.clockS - L.inspectSinceS >= dwell;
      break;
    }
    case 'interact':
    case 'computer-task':
    case 'wait-for-condition':
      if (L.scope) {
        sampleScope(L.scope, d);
        // Objectives first: the checklist ticks as each part is done, not only when the whole step succeeds.
        const objsDone = objectivesDone(d, ctx, step);
        done = scopeStatus(L.scope, d).full && objsDone;
      }
      break;
    case 'wait-for-event':
      done = L.eventCount >= (step.count ?? 1);
      break;
    case 'fast-forward': {
      const to = step.to;
      if (to === 'next-health-check') done = healthCheckSinceStep();
      else if ('gameMinutes' in to) done = d.lab.time.nowMs - ac.stepStartedAtMs >= to.gameMinutes * 60_000 - 1;
      else done = !!L.scope && evaluate(to.until, d, L.scope);
      break;
    }
    default:
      break;
  }
  if (done) completeStep(d, ctx);
}

function healthCheckSinceStep(): boolean {
  for (let i = RT.log.length - 1; i >= 0; i--) {
    const e = RT.log[i]!;
    if (e.seq < L.stepStartSeq) return false;
    if (e.type === 'orca.healthCheckRan') return true;
  }
  return false;
}

function objectivesDone(d: RootState, ctx: TxContext, step: LessonStep): boolean {
  if (!(step.kind === 'interact' || step.kind === 'computer-task') || !step.objectives) return true;
  let all = true;
  for (const od of step.objectives) {
    const sc = L.objScopes.get(od.id);
    const obj = d.session.objectives.find((o) => o.id === od.id);
    if (!sc || !obj) continue;
    if (!obj.done) {
      sampleScope(sc, d);
      if (scopeStatus(sc, d).full) {
        obj.done = true;
        ctx.emit('mission.objectiveCompleted', { objectiveId: od.id, text: od.text });
      }
    }
    if (!obj.done && !od.optional) all = false;
  }
  return all;
}

/** Success: XP, `mission.stepCompleted`, then onComplete lines, then the next step (or `gotoIndex`). */
export function completeStep(d: RootState, ctx: TxContext, gotoIndex?: number): void {
  const step = currentStep(d);
  const ac = d.session.academy;
  const lesson = L.lesson;
  if (!step || !ac || !lesson || ac.phase === 'completing' || ac.phase === 'done') return;
  ac.phase = 'completing';
  for (const o of d.session.objectives) {
    if (o.done) continue;
    o.done = true;
    ctx.emit('mission.objectiveCompleted', { objectiveId: o.id, text: o.text });
  }
  d.ui.highlight = null;
  d.ui.controlHint = null;
  let xp = step.xp ?? ACADEMY_STEP_XP[step.kind];
  if (step.kind === 'computer-task' && ac.showMeUsed) xp = Math.round(xp * 0.5);
  if (ac.replay) xp = Math.round(xp * 0.25);
  const granted = xp > 0 ? grantXp(d, ctx, xp, 'academy-step', `${step.id} ${step.kind}`, { quiet: true }) : 0;
  ac.xpEarned += granted;
  ac.stepsDone.push(step.id);
  d.progress.stats.academyStepsCompleted++;
  ctx.emit('mission.stepCompleted', { moduleId: lesson.moduleId, stepId: step.id, index: ac.stepIndex, xp: granted, hintsUsed: ac.hintTier });
  disposeStepScopes();
  L.carrySeq = RT.seq;
  L.lastCompleted = { id: step.id, atS: d.session.clockS };
  L.nextIndex = gotoIndex ?? ac.stepIndex + 1;
  L.queue = [...(step.onComplete ?? [])];
  L.afterQueue = 'advance';
  pumpQueue(d, ctx);
}

function advance(d: RootState, ctx: TxContext): void {
  const lesson = L.lesson;
  if (!lesson || !d.session.academy) return;
  if (L.nextIndex >= lesson.steps.length) finishModule(d, ctx, lesson);
  else enterStep(d, ctx, L.nextIndex);
}

/* ───────────────────────────── player input ───────────────────────────── */

/** E / Space / click on the subtitle box. */
export function acknowledge(d: RootState, ctx: TxContext): boolean {
  const line = d.session.dialogue;
  if (!line || d.session.mode !== 'academy') return false;
  if (line.choices?.length) return false;
  const shownAt = line.shownAtS ?? 0;
  if (d.session.clockS - shownAt < (line.skippableAfterS ?? 0) - 1e-6) return false;
  d.session.dialogue = null;
  ctx.emit('dialogue.acknowledged', { lineId: line.id });
  // 1) response lines of a choice
  if (L.lines.length) {
    playNextLine(d, ctx);
    return true;
  }
  if (L.afterLines !== 'none') {
    const after = L.afterLines;
    L.afterLines = 'none';
    if (after === 'complete') completeStep(d, ctx);
    else reshowChoices(d, ctx);
    return true;
  }
  // 2) script queue (onEnter / onComplete / script step)
  if (L.queue.length || L.afterQueue !== 'none') {
    pumpQueue(d, ctx);
    return true;
  }
  // 3) the dialogue step itself
  const step = currentStep(d);
  if (step?.kind === 'dialogue' && line.id === step.id) completeStep(d, ctx);
  else checkStep(d, ctx);
  return true;
}

function playNextLine(d: RootState, ctx: TxContext): void {
  const l = L.lines.shift();
  if (l) showLine(d, ctx, l.speaker, l.text);
}

function reshowChoices(d: RootState, ctx: TxContext): void {
  const step = currentStep(d);
  if (!step || !L.choices) return;
  if (step.kind === 'dialogue') showLine(d, ctx, step.speaker, step.text, { id: step.id, choices: L.choices.map((c) => ({ id: c.id, text: c.text })) });
  else if (step.kind === 'interact') showChoicePrompt(d, ctx, step);
}

export function showChoicePrompt(d: RootState, ctx: TxContext, step: Extract<LessonStep, { kind: 'interact' }>): void {
  L.choices = step.choices ?? null;
  const speaker = step.target.startsWith('npc.') ? step.target.slice(4) : mentor();
  showLine(d, ctx, speaker, step.prompt ?? step.hud, { id: `${step.id}:choice`, choices: (step.choices ?? []).map((c) => ({ id: c.id, text: c.text })) });
}

/** Keys 1–4 on a dialogue with choices. */
export function choose(d: RootState, ctx: TxContext, choiceId: string): boolean {
  const line = d.session.dialogue;
  const ac = d.session.academy;
  if (!line?.choices?.length || !ac || !L.choices) return false;
  const choice = L.choices.find((c) => c.id === choiceId);
  if (!choice) return false;
  d.session.dialogue = null;
  ctx.emit('dialogue.choiceMade', { lineId: line.id, choiceId, correct: choice.correct });
  L.lines = [...(choice.response ?? [])];
  if (choice.correct) {
    L.afterLines = 'complete';
  } else {
    ac.wrongActions++;
    ctx.emit('mission.wrongAction', { stepId: ac.stepId, text: choice.text, count: ac.wrongActions });
    if (choice.teach) pushTeachCard(d, ctx, choice.teach, { kind: 'academy', ref: `${ac.stepId}:${choice.id}` });
    L.afterLines = 'rechoose';
  }
  if (L.lines.length) playNextLine(d, ctx);
  else {
    const after = L.afterLines;
    L.afterLines = 'none';
    if (after === 'complete') completeStep(d, ctx);
    else reshowChoices(d, ctx);
  }
  return true;
}

/** H: reveal the next hint tier now. */
export function requestStepHint(d: RootState, ctx: TxContext): string | null {
  const step = currentStep(d);
  if (!step) return null;
  return revealNextHint(d, ctx, step, mentor(), true);
}

/** computer-task "Show me" (after 180 s idle, −50 % step XP). */
export function showMe(d: RootState, ctx: TxContext): boolean {
  const step = currentStep(d);
  const ac = d.session.academy;
  if (!step || !ac || step.kind !== 'computer-task' || ac.phase !== 'active') return false;
  const ladderDone = ac.hintTier >= 3 || ac.idleS >= 180 || ac.stepElapsedS >= 180;
  if (!ladderDone) return false;
  if (!ac.showMeUsed) {
    ac.showMeUsed = true;
    ac.showMeUsedTotal++;
    ac.hintsUsedTotal++;
  }
  const ghost = step.showMe?.[0];
  if (ghost) {
    d.ui.overlay = { kind: 'computer' };
    requestAppHint({ app: ghost.app as never, target: ghost.target, route: ghost.route, showMe: true });
  }
  ctx.emit('mission.showMe', { stepId: step.id });
  return true;
}

export function offerFastForward(d: RootState): boolean {
  const ac = d.session.academy;
  const step = currentStep(d);
  if (!ac || !step) return false;
  return ac.fastForwardOffered || (step.kind === 'fast-forward' && step.mode === 'offer');
}

/* ───────────────────────────── restart ───────────────────────────── */

/** Pause menu → Restart step: restore the step's checkpoint snapshot and re-enter it. */
export function restartCurrentStep(d: RootState, ctx: TxContext): boolean {
  const ac = d.session.academy;
  const lesson = L.lesson;
  if (!ac || !lesson) return false;
  const snap = L.snapshot && L.snapshotIndex === ac.stepIndex ? L.snapshot : null;
  if (snap) {
    const lab = JSON.parse(JSON.stringify(snap)) as LabState;
    simRun('restore', (s) => s.restore(lab), undefined);
  }
  d.session.dialogue = null;
  L.queue = [];
  L.afterQueue = 'none';
  L.carrySeq = null;
  if (d.ui.overlay.kind === 'pause' || d.ui.overlay.kind === 'quiz') d.ui.overlay = { kind: 'none' };
  d.session.quiz = null;
  ctx.emit('mission.restarted', { moduleId: lesson.moduleId, stepId: ac.stepId, scope: 'step' });
  enterStep(d, ctx, ac.stepIndex);
  return true;
}

/** Called by the checkpoint module when the quiz passes. */
export function checkpointPassed(d: RootState, ctx: TxContext): void {
  const ac = d.session.academy;
  if (!ac) return;
  ac.phase = 'active';
  completeStep(d, ctx);
}
