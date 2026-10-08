/**
 * Academy entry points: start a module (fresh or replay with re-armed faults), resume from the autosave
 * checkpoint (GP §2.2.1), restart the module.
 */
import type { TxContext } from '@/core/store';
import { hashString } from '@/core/rng';
import type { RootState } from '@/core/state';
import type { LabState } from '@/sim/types';
import * as persistence from '@/core/persistence';
import type { LessonDef, SetupSpec } from '../../types';
import { beginActivity } from '../session';
import { applySetup, runAction } from '../scripts';
import { simRun } from '../simx';
import { getLesson } from '../registry';
import { emptyModuleProgress } from './complete';
import { fallbackLesson } from './fallback';
import { moduleState, isComplete } from './catalog';
import { runLesson, stepSnapshot } from './runner';

export function lessonFor(moduleId: string): LessonDef | null {
  return getLesson(moduleId) ?? fallbackLesson(moduleId);
}

type CheckpointPersistence = { loadAcademySnapshot?: (moduleId: string) => LabState | null };
const ext = persistence as unknown as CheckpointPersistence;

export function startAcademy(d: RootState, ctx: TxContext, moduleId: string, opts: { replay?: boolean; startIndex?: number; snapshot?: LabState | null; force?: boolean } = {}): boolean {
  const lesson = lessonFor(moduleId);
  if (!lesson) return false;
  if (!opts.force && moduleState(d.progress, moduleId) === 'locked') return false;
  const completed = isComplete(d.progress, moduleId);
  const replay = !!opts.replay || completed;
  const replays = d.progress.modules[moduleId]?.replays ?? 0;
  const setup = replay ? (lesson.replaySetup ?? lesson.setup) : lesson.setup;
  const preset = setup.preset ?? `academy:${moduleId}`;
  const seed = setup.seed ?? hashString(`${moduleId}:${replays}`);
  beginActivity(d, ctx, {
    mode: 'academy',
    activityId: moduleId,
    replay,
    seed,
    preset: opts.snapshot ? null : preset,
    timeScale: 1,
    startHour: 9,
    simConfig: { mode: 'academy', damageModel: 'academy', pipelinesEnabled: false, forceHealthCheckAllowed: d.progress.realism !== 'strict' },
  });
  if (opts.snapshot) {
    simRun('restore', (s) => s.restore(opts.snapshot!), undefined);
    // The snapshot is the lab only: re-apply the player-side parts of the setup (app gating, hotbar, spawn).
    applySetup(d, ctx, playerSide(setup), { binding: null, ownerId: moduleId });
  } else applySetup(d, ctx, setup, { binding: null, ownerId: moduleId }, { presetApplied: true, seed });
  const mp = (d.progress.modules[moduleId] ??= emptyModuleProgress());
  if (mp.status === 'not-started') mp.status = 'in-progress';
  const start = opts.startIndex ?? 0;
  // Resume: replay what the steps before the saved one gave the player — setup steps (their lab part
  // only without a snapshot), and the tools / app gating granted by onEnter / onComplete actions
  // (e.g. M03's multimeter) — so the resumed step is completable.
  for (const s of lesson.steps.slice(0, start)) {
    if (s.kind === 'setup') applySetup(d, ctx, opts.snapshot ? playerSide(s.setup) : s.setup, { binding: null, ownerId: s.id });
    for (const a of [...(s.onEnter ?? []), ...(s.onComplete ?? [])]) if (a.do === 'grant' || a.do === 'gate') runAction(d, ctx, a, { binding: null, ownerId: s.id }, false);
  }
  runLesson(d, ctx, lesson, replay, start);
  return true;
}

export function continueAcademy(d: RootState, ctx: TxContext): boolean {
  const cp = d.progress.academyCheckpoint;
  if (!cp) return false;
  const mem = stepSnapshot(cp.moduleId);
  let snap: LabState | null = mem && mem.index === cp.stepIndex ? mem.lab : null;
  if (!snap && typeof ext.loadAcademySnapshot === 'function') {
    try {
      snap = ext.loadAcademySnapshot(cp.moduleId);
    } catch {
      snap = null;
    }
  }
  return startAcademy(d, ctx, cp.moduleId, { replay: cp.replay, startIndex: cp.stepIndex, snapshot: snap ? (JSON.parse(JSON.stringify(snap)) as LabState) : null, force: true });
}


/** The parts of a setup that live outside the lab snapshot. */
function playerSide(setup: SetupSpec): SetupSpec {
  const out: { apps?: SetupSpec['apps']; inventory?: SetupSpec['inventory']; spawn?: string } = {};
  if (setup.apps) out.apps = setup.apps;
  if (setup.inventory) out.inventory = setup.inventory;
  if (setup.spawn) out.spawn = setup.spawn;
  return out;
}
