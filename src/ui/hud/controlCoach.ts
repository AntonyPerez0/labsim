/**
 * One-time control prompts (GP §6.2: "every control prompt appears once — bottom-centre, 3 s, key
 * glyph"). Watches the store for the moment a control first matters and writes `ui.controlHint`; the
 * HUD's `ControlHintBar` shows it. Each prompt is remembered in `progress.flags['prompt:<id>']`, so a
 * returning player never sees it again.
 *
 *   look      first time the mouse is captured in an activity      Mouse · W A S D
 *   fast      a few seconds later, while a walk-to objective is up  Shift
 *   inspect   first Academy `inspect` step                          (rest the crosshair)
 *   tools     first time a hotbar tool is in the inventory          1–5 · R · Q
 *   notebook  first item picked up / Field Manual entry unlocked    Tab
 *   help      after the first prompts                               F1 · Esc
 */
import { bus } from '@/core/bus';
import { mutate, store } from '@/core/store';
import type { ControlHint, RootState } from '@/core/state';
import { HOTBAR_SLOTS } from '@/core/state';

/** How long one prompt owns the bar before the next queued one may replace it (ms). */
const SLOT_MS = 3600;

type CoachId = 'look' | 'fast' | 'inspect' | 'tools' | 'notebook' | 'help';

const HINTS: Record<CoachId, ControlHint> = {
  look: { id: 'look', keys: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], text: 'Walk · move the mouse to look around' },
  fast: { id: 'fast', keys: ['ShiftLeft'], text: 'Hold Shift to walk faster' },
  inspect: { id: 'inspect', keys: ['Mouse'], text: 'Rest the crosshair on it for a moment to inspect' },
  tools: { id: 'tools', keys: ['Digit1', 'KeyR', 'KeyQ'], text: '1–5 pick a tool · R tool mode · Q holster' },
  notebook: { id: 'notebook', keys: ['Tab'], text: 'Tab opens your Notebook' },
  help: { id: 'help', keys: ['F1', 'Escape'], text: 'F1 shows every control · Esc pauses' },
};

function seen(s: RootState, id: CoachId): boolean {
  return !!s.progress.flags[`prompt:${id}`];
}

/** True while a prompt can be shown: in an activity, walking around with the mouse captured, nothing talking. */
function canShow(s: RootState): boolean {
  return s.session.mode !== 'menu' && s.ui.overlay.kind === 'none' && s.ui.pointerLocked && !s.session.dialogue;
}

export function installControlCoach(): () => void {
  const queue: CoachId[] = [];
  let busyUntil = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const want = (id: CoachId) => {
    const s = store.getState();
    if (seen(s, id) || queue.includes(id)) return;
    queue.push(id);
    pump();
  };

  const pump = () => {
    if (timer) return;
    const s = store.getState();
    if (!queue.length || !canShow(s)) return; // re-tried when the player is back in the 3D view
    const now = performance.now();
    if (now < busyUntil) {
      timer = setTimeout(() => {
        timer = null;
        pump();
      }, busyUntil - now + 50);
      return;
    }
    const id = queue.shift()!;
    if (seen(s, id)) return pump();
    busyUntil = now + SLOT_MS;
    // Deferred: pump runs from store listeners, i.e. while another commit is still notifying.
    queueMicrotask(() =>
      mutate((d) => {
        d.ui.controlHint = { ...HINTS[id], keys: [...HINTS[id].keys] };
        d.progress.flags[`prompt:${id}`] = true;
      }),
    );
    if (queue.length) pump();
  };

  const evaluate = (s: RootState, prev: RootState) => {
    // A prompt the lesson put up itself (e.g. "Sit at your workstation") keeps the bar for its slot.
    const h = s.ui.controlHint;
    if (h && h !== prev.ui.controlHint && !(h.id in HINTS)) busyUntil = performance.now() + SLOT_MS;
    if (s.session.mode === 'menu') return;
    const lockedNow = s.ui.pointerLocked && !prev.ui.pointerLocked;
    if (lockedNow) {
      want('look');
      if (s.session.objectives.some((o) => !o.done && o.marker?.kind === 'location')) want('fast');
      want('help');
    }
    if (s.session.academy?.stepKind === 'inspect') want('inspect');
    if (s.session.inventory !== prev.session.inventory && HOTBAR_SLOTS.some((h) => s.session.inventory.includes(h.tool))) want('tools');
    // Conditions changed (dialogue closed, pointer captured, overlay closed): try to show what is queued.
    if (queue.length && canShow(s) && !canShow(prev)) pump();
  };

  const offStore = store.subscribe((s, prev) => {
    if (s.ui === prev.ui && s.session === prev.session) return;
    evaluate(s, prev);
  });
  const offItem = bus.on('item.pickedUp', () => want('notebook'));
  const offManual = bus.on('manual.entryUnlocked', () => {
    if (store.getState().session.mode !== 'menu') want('notebook');
  });

  return () => {
    if (timer) clearTimeout(timer);
    offStore();
    offItem();
    offManual();
  };
}
