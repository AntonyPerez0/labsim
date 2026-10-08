/**
 * Activity launchers used by menus, the debrief and the Field Manual. Each goes through the mission
 * runtime; when the runtime is missing, `ma` shows a "coming soon" toast — except Free Play, which
 * falls back to walking the lab (no faults, no XP) so the 3D lab is always reachable.
 */
import { mutate } from '@/core/store';
import type { ShiftStartOptions } from '@/missions';
import { hasMission, ma } from './missions';
import { goMenu, lockPointer, setExploring } from './nav';
import { pushToast } from './toasts';
import { uiSound } from './sound';

export function startModule(moduleId: string, replay = false): void {
  uiSound('ui-success', 0.5);
  ma('startAcademy', moduleId, replay ? { replay: true } : undefined);
}

export function resumeAcademy(): boolean {
  const r = ma('continueAcademy');
  return r === true;
}

export function startShiftRun(opts: string | ShiftStartOptions): void {
  uiSound('ui-success', 0.5);
  ma('startShift', opts);
}

export function startDrillRun(drillId: string, opts?: { mode?: string; daily?: boolean; tags?: string[] }): void {
  uiSound('ui-success', 0.5);
  ma('startDrill', drillId, opts);
}

export function startFreeplayRun(opts?: { slot?: 1 | 2 | 3; fresh?: boolean }): void {
  uiSound('ui-success', 0.5);
  if (hasMission('startFreeplay')) {
    ma('startFreeplay', opts);
    return;
  }
  // Fallback: explore the lab as it is (the sim runs; no faults, no XP).
  setExploring(true);
  mutate((s) => {
    s.session.mode = 'freeplay';
    s.session.activityId = 'explore';
    s.session.objectives = [{ id: 'explore', text: 'Explore the lab. Click to look around, WASD to walk, E to interact.', done: false }];
    s.ui.overlay = { kind: 'none' };
  });
  pushToast({ kind: 'info', title: 'Exploring the lab', body: 'The Free Play runtime is still being installed — the lab is live, but faults and XP are off.', icon: 'sandbox' });
  lockPointer();
}

export function backToMenu(): void {
  goMenu('home');
}
