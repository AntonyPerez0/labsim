/**
 * Global keyboard handling for the game UI (GP §6.3). One place decides what a key does, depending on
 * `ui.overlay` and `session.mode`:
 *
 *  - Computer / tablet overlays own the keyboard completely (the desktop handles its own Esc).
 *  - Text inputs keep their keys (only Esc is handled there).
 *  - `Esc` closes the top panel, or pauses in 3D; `Tab` notebook (in an activity) / Field Manual;
 *    `T` / `J` tickets; `H` hint; `1`–`5` hotbar (or dialogue choices 1–4); `R` tool mode and `Q`
 *    holster when the crosshair target has no R/Q verb; `Space`/`Enter`/`E` advance dialogue;
 *    `` ` `` debug; `F1` controls; `F10` sandbox (Free Play); hold `]` fast-forward ×30 (Free Play).
 *
 * The engine handles WASD/E/F/R/G/Q interaction verbs itself (only while `overlay === 'none'`).
 */
import { mutate, store } from '@/core/store';
import { DEFAULT_BINDINGS, type ControlAction, type HotbarSlot, type Overlay } from '@/core/state';
import { advanceDialogue } from '@/ui/hud/Dialogue';
import { selectHotbarSlot } from '@/ui/hud/Hotbar';
import { requestHintFromHud } from '@/ui/hud/Objectives';
import { openTicketPanel } from '@/ui/hud/TicketQueue';
import { hasMission, ma, maQuiet } from '@/ui/services/missions';
import { closeOverlay, currentOverlay, goMenu, openOverlay, openPause, resumeFromPause } from '@/ui/services/nav';
import { menuBack } from '@/ui/menu/menuNav';

const PANEL_OVERLAYS = new Set<Overlay['kind']>(['settings', 'manual', 'controls', 'tickets', 'notebook', 'flashcards', 'sandbox', 'inspect']);

function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}

function inActivity(): boolean {
  const s = store.getState();
  return s.session.mode !== 'menu';
}

function promptHasVerb(key: string): boolean {
  return !!store.getState().ui.prompt?.verbs.some((v) => v.key === key && !v.disabled);
}

/** Current key for a UI action (defaults merged with `settings.bindings`). */
function keyFor(a: ControlAction): string {
  return store.getState().progress.settings.bindings[a] ?? DEFAULT_BINDINGS[a];
}

function is(a: ControlAction, code: string): boolean {
  return keyFor(a) === code;
}

let ffHeld = false;

function setFastForward(held: boolean): void {
  if (ffHeld === held) return;
  ffHeld = held;
  maQuiet('setSandbox', { fastForwardHeld: held });
}

function onKeyDown(e: KeyboardEvent): void {
  const s = store.getState();
  const ov = s.ui.overlay;
  // The workstation desktop and the tablet own every key (Apps §1.8) — except that a mentor line shown
  // over the tablet continues on Space / Enter and takes 1–4 for choices (the tablet has no text input).
  if (ov.kind === 'computer' || ov.kind === 'tablet') {
    const line = s.session.dialogue;
    if (ov.kind === 'tablet' && line && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditable(e.target)) {
      const choices = line.choices ?? [];
      if (choices.length && /^Digit[1-4]$/.test(e.code)) {
        const c = choices.find((x) => x.key === Number(e.code.slice(5)));
        if (c) {
          e.preventDefault();
          e.stopPropagation();
          ma('chooseDialogue', c.id);
        }
      } else if (!choices.length && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) {
        e.preventDefault();
        e.stopPropagation();
        advanceDialogue();
      }
    }
    return;
  }
  const code = e.code;
  // The engine's movement handler preventDefaults Space (to stop page scroll while walking);
  // that must not swallow "Space to continue" on a mentor line.
  const dialogueAdvance = code === 'Space' && !!s.session.dialogue;
  if (e.defaultPrevented && !dialogueAdvance) return;
  const editable = isEditable(e.target);

  if (code === 'Escape') {
    if (handleEscape(ov)) e.preventDefault();
    return;
  }
  if (editable || e.ctrlKey || e.metaKey || e.altKey) return;

  // Debug & help work everywhere outside text fields.
  if (is('debug', code)) {
    e.preventDefault();
    mutate((d) => {
      d.ui.debug = !d.ui.debug;
    });
    return;
  }
  if (is('controlsOverlay', code)) {
    e.preventDefault();
    if (ov.kind === 'controls') closeOverlay({ lock: true });
    else openOverlay({ kind: 'controls' }, { push: true });
    return;
  }

  // Overlays that own their own keys (quiz, drills, debrief, menus, flashcards …).
  const play = ov.kind === 'none';
  const sidePanel = ov.kind === 'tickets' || ov.kind === 'notebook' || ov.kind === 'sandbox';
  if (!play && !sidePanel) {
    if (is('notebook', code) && ov.kind === 'manual') {
      // Tab while a manual control has focus is keyboard navigation, not "close".
      if (code === 'Tab' && document.activeElement instanceof HTMLElement && document.activeElement !== document.body && document.activeElement.closest('.fm')) return;
      e.preventDefault();
      closeOverlay({ lock: true });
    }
    return;
  }
  if (!inActivity()) return;

  // Dialogue first: Space / Enter / E continue, 1–4 choose.
  const line = s.session.dialogue;
  if (line && play) {
    const choices = line.choices ?? [];
    if (choices.length && /^Digit[1-4]$/.test(code)) {
      const c = choices.find((x) => x.key === Number(code.slice(5)));
      if (c) {
        e.preventDefault();
        ma('chooseDialogue', c.id);
      }
      return;
    }
    if (!choices.length && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter' || (code === 'KeyE' && !promptHasVerb('E')))) {
      if (e.repeat) return;
      e.preventDefault();
      advanceDialogue();
      return;
    }
  }

  if (is('notebook', code)) {
    e.preventDefault();
    if (ov.kind === 'notebook') closeOverlay({ lock: true });
    else openOverlay({ kind: 'notebook' }, { push: sidePanel });
    return;
  }
  if (is('tickets', code) || code === 'KeyJ') {
    if (!s.session.shift && !s.session.tickets.length) return;
    e.preventDefault();
    if (ov.kind === 'tickets') closeOverlay({ lock: true });
    else {
      // Re-open on the remembered ticket only while it is still open; otherwise show the queue (the
      // board then previews the oldest open ticket without acking it).
      const open = s.session.tickets.filter((t) => t.status !== 'resolved' && t.status !== 'handover' && t.status !== 'failed');
      const sel = s.ui.selectedTicketId;
      if (sel && !open.some((t) => t.id === sel)) {
        mutate((d) => {
          d.ui.selectedTicketId = null;
        });
        openTicketPanel(null);
      } else openTicketPanel(sel ?? null);
    }
    return;
  }
  if (is('hint', code)) {
    if (e.repeat) return;
    e.preventDefault();
    requestHintFromHud();
    return;
  }
  if (is('sandboxPanel', code)) {
    if (s.session.mode !== 'freeplay') return;
    e.preventDefault();
    if (ov.kind === 'sandbox') closeOverlay({ lock: true });
    else openOverlay({ kind: 'sandbox' });
    return;
  }
  if (is('fastForward', code)) {
    if (s.session.mode === 'freeplay' && !e.repeat) setFastForward(true);
    return;
  }

  if (!play) return;
  if (!line) {
    for (const n of [1, 2, 3, 4, 5] as HotbarSlot[]) {
      if (is(`hotbar${n}` as ControlAction, code)) {
        selectHotbarSlot(n);
        return;
      }
    }
  }
  if (is('toolMode', code) && !e.repeat && s.session.activeTool !== 'hand' && !promptHasVerb('R')) {
    if (hasMission('cycleToolMode')) ma('cycleToolMode');
    return;
  }
  if (is('holster', code) && !e.repeat && !promptHasVerb('Q')) {
    if (s.session.items.carried) maQuiet('setDownCarried');
    else if (s.session.activeTool !== 'hand') selectHotbarSlot(null);
    return;
  }
  if (is('flashlight', code) && !e.repeat && !promptHasVerb('F')) {
    mutate((d) => {
      d.session.toolModes.flashlightOn = !d.session.toolModes.flashlightOn;
    });
  }
}

function onKeyUp(e: KeyboardEvent): void {
  if (is('fastForward', e.code)) setFastForward(false);
}

/** Esc: close the top-most thing. Returns true when handled. */
function handleEscape(ov: Overlay): boolean {
  const s = store.getState();
  switch (ov.kind) {
    case 'none':
      if (inActivity()) {
        openPause();
        return true;
      }
      goMenu();
      return true;
    case 'pause':
      resumeFromPause();
      return true;
    case 'main-menu':
      return menuBack();
    case 'quiz':
    case 'drill':
    case 'certification':
      // Quizzes, drills and exams keep running behind the pause menu.
      openPause();
      return true;
    case 'teach-card':
      maQuiet('dismissTeachCard', ov.teachCardId);
      if (currentOverlay().kind === 'teach-card') closeOverlay({ lock: true });
      return true;
    case 'rank-up':
      if (s.session.result && s.session.mode !== 'menu') openOverlay({ kind: 'debrief' });
      else closeOverlay();
      return true;
    case 'debrief':
    case 'briefing':
      return false;
    default:
      if (PANEL_OVERLAYS.has(ov.kind)) {
        if (ov.kind === 'flashcards') maQuiet('endFlashcards');
        closeOverlay({ lock: s.session.mode !== 'menu' });
        return true;
      }
      return false;
  }
}

/** Install the global key handlers; returns a disposer. */
export function installHotkeys(): () => void {
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  const blur = () => setFastForward(false);
  window.addEventListener('blur', blur);
  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', blur);
  };
}
