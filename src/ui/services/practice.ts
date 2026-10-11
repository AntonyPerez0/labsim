/**
 * Launch the workstation code practice straight from a menu or the debrief:
 *
 *  1. start Free Play (unless it is already running) — the lab is live, nothing is scored;
 *  2. clone the practice repo for the player if the lab has no local clone yet;
 *  3. sit the player at the workstation (teleport + camera focus + `ui.overlay = computer`);
 *  4. open the app on its practice view: VS Code `/practice` (Parrot), IntelliJ `uia-relay` with the
 *     UIA Practice tool window (`AppParams.practice = 'uia'`).
 */
import { emit, mutate, store } from '@/core/store';
import { requestOpenApp } from '@/computer/apps';
import { engine } from '@/engine';
import { sim } from '@/sim';
import type { RepoId } from '@/sim';
import { SEATED_POSE } from '@/world/layout';
import { startFreeplayRun } from './actions';
import { pushToast } from './toasts';

export type CodePractice = 'parrot' | 'uia';

export const PRACTICE_REPO: Record<CodePractice, RepoId> = { parrot: 'parrot', uia: 'uia-relay' };

/** Clone `repo` for the player when the lab has no local clone. Returns false when the clone failed. */
export function ensureCloned(repo: RepoId): boolean {
  if (store.getState().lab.repos?.[repo]?.local) return true;
  try {
    const r = sim.git.clone(repo, 'player') as { ok?: boolean } | undefined;
    if (r && r.ok === false) return !!store.getState().lab.repos?.[repo]?.local;
  } catch (err) {
    console.warn('[practice] clone failed', err);
  }
  return !!store.getState().lab.repos?.[repo]?.local;
}

/** Put the player in the workstation chair with the desktop open. */
export function sitAtWorkstation(): void {
  emit('mission.teleportRequested', { locationId: 'loc.workstation' });
  try {
    engine.exitPointerLock();
    if (!engine.isFocused()) void engine.focus({ position: SEATED_POSE.position, lookAt: SEATED_POSE.lookAt, fov: SEATED_POSE.fov }, 450);
  } catch {
    /* engine not ready (sandbox / tests) */
  }
  mutate((s) => {
    s.ui.overlay = { kind: 'computer' };
    s.ui.controlHint = null;
  });
}

/** Free Play → clone → workstation → practice view. */
export function launchCodePractice(kind: CodePractice): void {
  if (store.getState().session.mode !== 'freeplay') startFreeplayRun({ fresh: true });
  if (store.getState().session.mode === 'menu') return; // the runtime refused; it already said why
  const repo = PRACTICE_REPO[kind];
  if (!ensureCloned(repo)) {
    pushToast({ kind: 'warning', title: 'Could not clone the repo', body: `Clone ${repo} yourself from the workstation (GitHub or Get from VCS), then open the practice.`, icon: 'alert' });
  }
  sitAtWorkstation();
  if (kind === 'parrot') requestOpenApp('vscode', { route: '/practice' });
  else requestOpenApp('intellij', { repo: 'uia-relay', practice: 'uia' });
}
