/**
 * Overlay navigation for the UI.
 *
 * `ui.overlay` is a single value; the UI keeps a small return stack so panels opened on top of
 * something (Field Manual from the pause menu, Settings from the pause menu, tickets from the
 * workstation) go back to where they came from. If something else (missions, the world) changes
 * the overlay, the stack is reset.
 */
import { emit, mutate, store } from '@/core/store';
import type { MenuScreen, Overlay } from '@/core/state';
import { engine } from '@/engine';
import { maQuiet } from './missions';

let stack: Overlay[] = [];
let lastSetByUi: Overlay | null = null;
/** True while `set` itself commits: store listeners run synchronously inside that commit. */
let settingByUi = false;

store.subscribe((s, prev) => {
  if (s.ui.overlay !== prev.ui.overlay && !settingByUi && s.ui.overlay !== lastSetByUi) stack = [];
});

function set(o: Overlay): void {
  const from = store.getState().ui.overlay;
  if (from === o) return;
  settingByUi = true;
  try {
    mutate((s) => {
      s.ui.overlay = o;
    });
  } finally {
    settingByUi = false;
  }
  lastSetByUi = store.getState().ui.overlay;
  if (from.kind !== o.kind) emit('ui.overlayChanged', { from: from.kind, to: o.kind });
}

export function currentOverlay(): Overlay {
  return store.getState().ui.overlay;
}

/** Open `o`; with `push` the current overlay becomes its return target. */
export function openOverlay(o: Overlay, opts: { push?: boolean } = {}): void {
  const cur = currentOverlay();
  if (opts.push && cur.kind !== o.kind) stack.push(cur);
  else if (!opts.push) stack = [];
  set(o);
}

/** Replace the current overlay without touching the return stack (e.g. tickets list → detail). */
export function replaceOverlay(o: Overlay): void {
  set(o);
}

/** The overlay the current one returns to (null = back to the 3D view). */
export function returnTarget(): Overlay | null {
  return stack.length ? stack[stack.length - 1]! : null;
}

/** Close the current overlay: back to its return target, or to the 3D view. */
export function closeOverlay(opts: { lock?: boolean } = {}): void {
  const prev = stack.pop();
  if (prev) {
    set(prev);
    return;
  }
  const s = store.getState();
  // Outside an activity there is nothing to return to but the menu.
  if (s.session.mode === 'menu' && !exploring) {
    set({ kind: 'main-menu' });
    return;
  }
  set({ kind: 'none' });
  if (opts.lock) lockPointer();
}

/** Main menu on a given screen. */
export function goMenu(screen?: MenuScreen): void {
  stack = [];
  set(screen ? { kind: 'main-menu', screen } : { kind: 'main-menu' });
}

/** Request pointer lock for the 3D view (must run inside a user gesture to succeed). */
export function lockPointer(): void {
  try {
    if (!engine.isFocused()) engine.requestPointerLock();
  } catch {
    /* engine not ready */
  }
}

/* ── pause ── */

export function openPause(): void {
  const cur = currentOverlay();
  if (cur.kind === 'pause') return;
  // Let the runtime know (it freezes shift timers itself); fall back to setting the overlay.
  maQuiet('setPaused', true);
  if (currentOverlay().kind !== 'pause') {
    if (cur.kind !== 'none' && cur.kind !== 'main-menu') stack.push(cur);
    set({ kind: 'pause' });
  } else if (cur.kind !== 'none' && cur.kind !== 'main-menu') {
    stack.push(cur);
    lastSetByUi = currentOverlay();
  }
}

export function resumeFromPause(): void {
  // Remember where the pause came from: the runtime's own unpause only knows the 3D view and drills.
  const target = stack.length ? stack[stack.length - 1]! : null;
  maQuiet('setPaused', false);
  const cur = currentOverlay();
  if (target && target.kind !== 'none' && (cur.kind === 'pause' || cur.kind === 'none')) {
    stack = stack.slice(0, -1);
    set(target);
    return;
  }
  if (cur.kind === 'pause') closeOverlay({ lock: true });
  else if (cur.kind === 'none') lockPointer();
}

/* ── "explore" mode: the 3D lab without an activity (used when the runtime isn't available) ── */

let exploring = false;

export function setExploring(v: boolean): void {
  exploring = v;
}

export function isExploring(): boolean {
  return exploring;
}

/* ── workstation / tablet ── */

/** Leave the computer or tablet overlay: back to the 3D view and release the camera focus. */
export function exitFocusOverlay(): void {
  const cur = currentOverlay();
  if (cur.kind !== 'computer' && cur.kind !== 'tablet') return;
  stack = [];
  set({ kind: 'none' });
  try {
    void engine.releaseFocus();
  } catch {
    /* engine not ready */
  }
}
