/**
 * Academy runner — event handling and per-tick logic (Cur §2.0): completion of walk-to / inspect /
 * interact / computer-task / wait steps from player events, wrong-action corrections (3 wrong →
 * highlight), inspect dwell and callouts, hint ladders, wait timeouts.
 */
import type { TxContext } from '@/core/store';
import type { RootState } from '@/core/state';
import { matchesProp, resolvePropId } from '@/world/layout';
import type { LessonStep } from '../../types';
import type { LogEntry } from '../rt';
import { evaluate, matchesEvent } from '../conditions/evaluate';
import { bark, pushTeachCard, unlockManual } from '../feedback';
import { raiseGw } from '../arcade/penalties';
import { revealNextHint, stepTarget, tickHints } from './hints';
import { L, checkStep, completeStep, currentStep, mentor, openStepApp, showChoicePrompt } from './runner';

/* ───────────────────────────── events & tick ───────────────────────────── */

const ACTIVITY_EVENTS = new Set(['app.action', 'app.navigated', 'app.opened', 'terminal.command', 'player.interacted']);

export function onAcademyEvent(d: RootState, ctx: TxContext, e: LogEntry): void {
  const ac = d.session.academy;
  const step = currentStep(d);
  if (!ac || !step || ac.phase === 'done') return;
  if (ACTIVITY_EVENTS.has(e.type) && !e.suppressed) ac.idleS = 0;

  // Wrong actions (any phase but the quiz).
  if (!e.suppressed && step.wrongActions?.length && ac.phase !== 'quiz') {
    for (const w of step.wrongActions) {
      if (!matchesEvent(w.on, e.type, e.payload, d)) continue;
      if (w.when && !evaluate(w.when, d, null)) continue;
      if (w.countsAsWrong !== false) ac.wrongActions++;
      bark(d, ctx, w.speaker ?? mentor(), w.say, 'safety');
      ctx.emit('mission.wrongAction', { stepId: step.id, text: w.say, count: ac.wrongActions });
      if (w.teach) pushTeachCard(d, ctx, w.teach, { kind: 'academy', ref: `${step.id}:${w.id}` });
      if (w.gw) raiseGw(d, ctx, w.gw, { detail: w.say, ticketId: null });
      const limit = step.kind === 'interact' ? (step.highlightAfterWrong ?? 3) : 3;
      if (ac.wrongActions >= limit && !ac.highlight) {
        const t = stepTarget(step, mentor());
        if (t) {
          ac.highlight = t;
          d.ui.highlight = t;
          ctx.emit('mission.hintEffect', { stepId: step.id, effect: 'highlight', target: t });
        }
      }
    }
  }
  if (ac.phase !== 'active') return;

  switch (step.kind) {
    case 'walk-to':
      if (e.type === 'player.enteredLocation' && (e.payload as { locationId: string }).locationId === step.location) {
        completeStep(d, ctx);
        return;
      }
      break;
    case 'inspect': {
      const id =
        e.type === 'player.inspected' ? (e.payload as { interactableId: string }).interactableId : e.type === 'player.calloutsShown' ? (e.payload as { propId: string }).propId : null;
      if (id && inspectHit(step, id)) {
        showInspectCallouts(d, ctx, step);
        completeStep(d, ctx);
        return;
      }
      break;
    }
    case 'interact':
      if (step.choices?.length && e.type === 'player.interacted' && !d.session.dialogue) {
        const id = (e.payload as { interactableId: string }).interactableId;
        if (matchesProp(step.target, id) || id === step.target) {
          showChoicePrompt(d, ctx, step);
          return;
        }
      }
      break;
    case 'computer-task':
      if ((e.type === 'player.seated' && (e.payload as { seated: boolean }).seated) || (e.type === 'ui.overlayChanged' && (e.payload as { to: string }).to === 'computer')) {
        openStepApp(d, step);
      }
      break;
    case 'wait-for-event':
      if (matchesEvent(step.match, e.type, e.payload, d)) L.eventCount++;
      break;
    default:
      break;
  }
  checkStep(d, ctx);
}

/**
 * True when `id` (an interactable under the crosshair / just inspected) satisfies an inspect step. With a
 * `part` only that part counts (`rack.a.rails.u33` matches `rack.a.rails.u33-left|right` but not U32);
 * otherwise the prop or any of its sub-parts.
 */
function inspectHit(step: Extract<LessonStep, { kind: 'inspect' }>, id: string): boolean {
  if (step.part) {
    const part = resolvePropId(step.part);
    return matchesProp(part, id) || id.startsWith(`${part}-`);
  }
  return matchesProp(step.prop, id);
}

function showInspectCallouts(d: RootState, ctx: TxContext, step: Extract<LessonStep, { kind: 'inspect' }>): void {
  if (step.callouts?.length) {
    const lines = step.callouts.slice(0, 4).map(String);
    d.ui.callouts = { propId: step.prop, lines, untilS: d.session.clockS + 4 };
    ctx.emit('player.calloutsShown', { propId: step.prop, lines });
  }
  for (const id of step.manualEntryIds ?? []) unlockManual(d, ctx, id, step.id);
  d.progress.stats.inspections++;
}

export function tickAcademy(d: RootState, ctx: TxContext, dtS: number): void {
  const ac = d.session.academy;
  const step = currentStep(d);
  if (!ac || !step || ac.phase !== 'active') return;
  if (!d.session.dialogue) {
    ac.stepElapsedS += dtS;
    // Waiting for the player's own Jenkins build / local test run is not being stuck: the idle-based
    // hint ladder (computer-task 60/120/180 s, which costs stars) pauses until the run finishes.
    if (!waitingOnPlayerRun(d)) ac.idleS += dtS;
  }
  if (step.kind === 'inspect') {
    const look = d.session.player.lookingAt;
    const hit = !!look && inspectHit(step, look);
    if (hit) L.inspectSinceS ??= d.session.clockS;
    else L.inspectSinceS = null;
    if (hit && L.inspectSinceS !== null && d.session.clockS - L.inspectSinceS >= (step.dwellS ?? 1.0)) {
      showInspectCallouts(d, ctx, step);
      completeStep(d, ctx);
      return;
    }
  }
  if (step.kind === 'computer-task' && !L.appOpened && d.ui.overlay.kind === 'computer') openStepApp(d, step);
  if ((step.kind === 'wait-for-event' || step.kind === 'wait-for-condition') && step.timeoutS !== undefined && ac.stepElapsedS >= step.timeoutS) {
    if ((step.onTimeout ?? 'hint') === 'continue') {
      completeStep(d, ctx);
      return;
    }
    if (ac.hintTier === 0) revealNextHint(d, ctx, step, mentor(), false);
  }
  tickHints(d, ctx, step, mentor());
  checkStep(d, ctx);
}


/** A Jenkins build the player queued, or a local test run, is still going. */
function waitingOnPlayerRun(d: RootState): boolean {
  if (d.lab.workstation?.locallyRunningTest) return true;
  for (const b of Object.values(d.lab.jenkins?.builds ?? {})) if (b.state !== 'finished' && b.triggeredBy === 'player') return true;
  return false;
}
