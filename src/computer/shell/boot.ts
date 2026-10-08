/**
 * Boot & exit helpers shared by `Desktop`, `TabletDashboard` and `src/computer/index.ts`.
 *  - `initComputer()` (Apps §1.1): idempotent; starts the camera recorder + image materializer (builder C,
 *    `apps/camera`), the LabChat notifier (desktop toasts for new messages, Apps §11.3) and the MagStripe Reader's
 *    `workstation.cardSwiped` listener (Apps §12.1).
 *  - `exitOverlay()` (Apps §1.8): the host's `onExit`, else overlay `none` + `engine.releaseFocus()`.
 */
import { bus } from '@/core/bus';
import { mutate, store } from '@/core/store';
import { emitAppAction } from '../apps';
import { playSound, releaseEngineFocus } from './engineBridge';
import { isAppUnlocked } from './gating';
import { closeAllExcept, closeWindow, shell } from './wmStore';

/**
 * Window hygiene that must run while the desktop is NOT mounted (the player starts a lesson from the 3D
 * world or the menu, not while seated): a new session closes every window but LabChat, and windows of
 * apps the lesson gating locks are closed — otherwise a Free Play Orca/Jenkins window stays open and
 * usable inside a lesson that has only unlocked the Terminal.
 */
function startWindowHygiene(): () => void {
  const offSession = bus.on('session.started', () => closeAllExcept(['chat']));
  const closeLocked = () => {
    const g = store.getState().session.computer;
    for (const w of shell.getState().windows) if (!isAppUnlocked(g, w.app)) closeWindow(w.id);
  };
  closeLocked();
  const offGate = store.subscribe((s, prev) => {
    if (s.session.computer?.unlockedApps !== prev.session.computer?.unlockedApps) closeLocked();
  });
  return () => {
    offSession();
    offGate();
  };
}

let disposeComputer: (() => void) | null = null;

export function initComputer(): () => void {
  if (disposeComputer) return disposeComputer;
  let disposed = false;
  const stops: (() => void)[] = [];
  const start = (fn: () => () => void, what: string) => {
    if (disposed) return;
    try {
      stops.push(fn());
    } catch (err) {
      console.warn(`[computer] ${what} failed to start`, err);
    }
  };
  start(startWindowHygiene, 'window hygiene');
  void import('../apps/camera')
    .then((m) => {
      start(m.startCameraRecorder, 'camera recorder');
      start(m.startImageMaterializer, 'image materializer');
    })
    .catch((err) => console.warn('[computer] camera services failed to load', err));
  void import('../apps/cardreader/model')
    .then((m) => start(m.startCardReaderListener, 'card reader listener'))
    .catch((err) => console.warn('[computer] card reader failed to load', err));
  void import('../apps/chat/notifier')
    .then((m) => start(m.startChatNotifier, 'chat notifier'))
    .catch((err) => console.warn('[computer] chat notifier failed to load', err));
  disposeComputer = () => {
    disposed = true;
    for (const stop of stops.splice(0)) stop();
    disposeComputer = null;
  };
  return disposeComputer;
}

/** Leave the computer/tablet overlay. `fromDesktop` emits `desktop.standUp` (Apps §1.8). */
export function exitOverlay(onExit: (() => void) | undefined, fromDesktop: boolean): void {
  if (fromDesktop) emitAppAction('desktop', 'desktop.standUp', {});
  playSound('ui-click');
  if (onExit) {
    onExit();
    return;
  }
  mutate((s) => {
    s.ui.overlay = { kind: 'none' };
  });
  releaseEngineFocus();
}
