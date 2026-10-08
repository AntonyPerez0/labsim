/**
 * DR16 Park It! (GP §2.4.3, Cur M04): 10 rigs go yellow in sequence, some locked by a running test — do the
 * right tablet action on each; 90 s.
 *
 * - Yellow banner (`Status: LOCK RELEASED — PARK REQUIRED`, S13) → Motion Control → **Park All** (+150).
 *   Park XY / X / Y home only those axes and leave the banner yellow (S13).
 * - `TEST IN PROGRESS — CONTROLS LOCKED` → leave it / wait for the job to end; touching it = −100 (the global
 *   dashboard locks out external users while tests are active, F230).
 * - Steppers Disabled → **Enable**, then **Park All**; MOTOR switched off (MOTOR LED dark, MAIN on) → MOTOR on,
 *   then **Park All** (INC13 A/B: the position is unknown until parked).
 * - Distractors: dragging the carriage by hand (that is what breaks the magnetic lock, F231), toggling MOTOR
 *   on a running rig.
 * Facts: F230, F231, F232, F235 (Ref §6.4, tablet photo).
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { nextFloat, pick, recentKeys, type RngState } from '../common/rng';
import { teach } from '../common/teach';
import { speedBonus, streakMultiplier } from '../common/scoring';

export type ParkCase = 'yellow' | 'locked' | 'steppers' | 'motor-off';

export type ParkAction = 'park-all' | 'park-xy' | 'park-x' | 'park-y' | 'enable' | 'disable' | 'leave' | 'drag' | 'motor' | 'sol-down';

export interface ParkData {
  rig: string;
  hrn: string;
  /** Slot 0–9 in the rack scene. */
  slot: number;
  case: ParkCase;
  /** Running job name (locked case). */
  job: string | null;
}

/** Touch robots with front tablets (Sim roster). */
const RIGS = ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti', 'soundwave', 'starscream', 'ratchet', 'c-3po', 'chappie', 'case', 'atlas', 'astro', 'mazinger', 'number-5', 'gerty'];
const JOBS = ['Java/uia-remote-regression-flex', 'Java/uia-remote-regression-mini', 'Java/pigeon-android-sale-swipe', 'Java/contact-canada-pin-sale'];

export const ACTION_LABEL: Record<ParkAction, string> = {
  'park-all': 'Park → Park All',
  'park-xy': 'Park → Park XY',
  'park-x': 'Park → Park X',
  'park-y': 'Park → Park Y',
  enable: 'Steppers → Enable',
  disable: 'Steppers → Disable',
  leave: 'Leave it — wait for the job',
  drag: 'Drag the carriage by hand',
  motor: 'Toggle MOTOR',
  'sol-down': 'Solenoid → Down',
};

export type ParkOutcome = { kind: 'done'; correct: true } | { kind: 'progress' } | { kind: 'wrong'; locked: boolean; why: string };

/**
 * Apply one action. `enabled` = the steppers were re-enabled earlier on this rig (steppers case).
 */
export function applyAction(data: ParkData, a: ParkAction, enabled: boolean): ParkOutcome {
  if (data.case === 'locked') {
    if (a === 'leave') return { kind: 'done', correct: true };
    return { kind: 'wrong', locked: true, why: 'TEST IN PROGRESS — CONTROLS LOCKED: the dashboard locks out everyone else while a test runs. Leave it and let the job end.' };
  }
  if (a === 'leave') return { kind: 'wrong', locked: false, why: data.case === 'steppers' ? 'Nothing is running — the steppers are simply disabled. Enable them, then Park All.' : 'Nothing is running and the banner stays yellow until someone parks it. Park All now.' };
  if (a === 'drag') return { kind: 'wrong', locked: false, why: 'Manually moving the arm is what breaks the magnetic lock and turns the banner yellow — never the fix.' };
  if (data.case === 'motor-off') {
    if (a === 'motor' && !enabled) return { kind: 'progress' };
    if (a === 'park-all' && enabled) return { kind: 'done', correct: true };
    if (a === 'park-all') return { kind: 'wrong', locked: false, why: 'MOTOR is off (MOTOR LED dark, MAIN on), so the motion buttons do nothing. Switch MOTOR on, then Park All.' };
    if (a === 'enable') return { kind: 'wrong', locked: false, why: 'The steppers are already enabled — it is the MOTOR switch on the POWER panel that is off.' };
    return { kind: 'wrong', locked: false, why: 'POWER panel: MOTOR on, then Park → Park All.' };
  }
  if (a === 'motor') return { kind: 'wrong', locked: false, why: 'Toggling the MOTOR switch does not re-home the gantry or clear the banner — only Park All does.' };
  if (a === 'park-xy' || a === 'park-x' || a === 'park-y') return { kind: 'wrong', locked: false, why: `${ACTION_LABEL[a]} homes just those axes and leaves the banner yellow — only Park All drives back to the limit switches at (0,0) and clears the error.` };
  if (data.case === 'steppers') {
    if (a === 'enable' && !enabled) return { kind: 'progress' };
    if (a === 'park-all' && enabled) return { kind: 'done', correct: true };
    if (a === 'park-all') return { kind: 'wrong', locked: false, why: 'The steppers are disabled, so Park All cannot move anything. Steppers → Enable first, then Park All.' };
    return { kind: 'wrong', locked: false, why: 'Steppers → Enable, then Park → Park All.' };
  }
  if (a === 'park-all') return { kind: 'done', correct: true };
  if (a === 'enable') return { kind: 'wrong', locked: false, why: 'The steppers are already enabled — the magnetic lock is released. Park All clears it.' };
  return { kind: 'wrong', locked: false, why: 'Park → Park All drives the steppers back to the limit switches at (0,0) and turns the banner green.' };
}

/** Custom points: Park All +150 (+ speed, × streak); touching a locked rig −100; other mistakes −50. */
export function parkPoints(outcome: ParkOutcome, ms: number, streakBefore: number): number {
  if (outcome.kind === 'done') return Math.round((150 + speedBonus(ms)) * streakMultiplier(streakBefore));
  if (outcome.kind === 'wrong') return outcome.locked ? -100 : -50;
  return 0;
}

const CASE_TEACH: Record<ParkCase, { what: string; why: string; facts: string[]; tags: string[] }> = {
  yellow: {
    what: 'Yellow banner → Park → Park All',
    why: 'Manually moving an arm breaks its magnetic lock and turns the banner yellow; Park All drives the steppers back to the limit switches at (0,0), clearing the error and turning it green.',
    facts: ['F231', 'F232'],
    tags: ['hw.motion', 'hw.tablet'],
  },
  locked: {
    what: 'Controls locked → leave it until the job ends',
    why: 'The global LabSim control dashboard locks out external users while tests are active — touching a running rig costs the job.',
    facts: ['F230'],
    tags: ['hw.lockout', 'hw.tablet'],
  },
  'motor-off': {
    what: 'MOTOR off → MOTOR on, then Park All',
    why: 'The POWER panel has MAIN and MOTOR toggles; with MOTOR off the arm cannot move. Switch MOTOR on, then Park All drives the steppers back to the limit switches at (0,0).',
    facts: ['F236', 'F232'],
    tags: ['hw.motion', 'hw.tablet'],
  },
  steppers: {
    what: 'Steppers Disabled → Enable, then Park All',
    why: 'The Motion Control tab has Steppers Enable/Disable; disabled steppers cannot move, so enable them first, then Park All homes the gantry to (0,0).',
    facts: ['F235', 'F232'],
    tags: ['hw.motion', 'hw.tablet'],
  },
};

export function parkItem(rig: string, slot: number, c: ParkCase, job: string | null): DrillItem<ParkData> {
  const t = CASE_TEACH[c];
  return {
    id: `DR16:${slot}:${rig}:${c}`,
    tags: t.tags,
    factIds: t.facts,
    teach: teach(t.what, t.why, { ref: 'Ref §6.4', factIds: t.facts, illustrative: c !== 'locked', tag: t.tags[0] }),
    data: { rig, hrn: rig.toUpperCase(), slot, case: c, job },
  };
}

export function generatePark(rng: RngState, state: RootState | null, index: number): DrillItem<ParkData> {
  const used = new Set(recentKeys(state, 10).map((k) => k.split(':')[2]));
  const free = RIGS.filter((r) => !used.has(r));
  const rig = pick(rng, free.length ? free : RIGS);
  // First two are plain yellow banners; then ≈50 % yellow, 20 % locked, 15 % steppers off, 15 % MOTOR off.
  const r = nextFloat(rng);
  const c: ParkCase = index < 2 || r < 0.5 ? 'yellow' : r < 0.7 ? 'locked' : r < 0.85 ? 'steppers' : 'motor-off';
  return parkItem(rig, index % 10, c, c === 'locked' ? pick(rng, JOBS) : null);
}

export const DR16: DrillDef<ParkData> = {
  id: 'DR16',
  name: 'Park It!',
  format: '10 rigs go yellow in sequence, some locked by a test; right tablet action on each; 90 s',
  tags: ['hw.motion', 'hw.lockout', 'hw.tablet'],
  unlockedBy: ['M04'],
  durationS: 90,
  itemCount: 10,
  medals: { bronze: 600, silver: 1100, gold: 1700 },
  scoring: 'custom',
  generate: (rng, state, index) => generatePark(rng, state, index),
  component: lazyDrill(() => import('./View'), '#f5c518'),
};
