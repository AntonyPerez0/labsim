/**
 * UI bridge: wires the game's event bus and settings into the 2D layer.
 *
 *  - Kit control sounds → engine synth (`ui` bus); audio unlock on the first gesture.
 *  - Settings → `<html data-*>` (reduced motion, subtitle size, colour-blind mode).
 *  - Sim events worth a toast (fuse blown, damaged load, robot status changes that matter now).
 *  - Gameplay toasts (XP, achievements, ranks, tickets, manual entries) ONLY while the mission runtime
 *    is not live — the runtime writes its own toasts (`src/missions/runtime/feedback.ts`).
 *  - Pointer-lock loss during play pauses (GP §6.3 "any pointer-lock loss pauses").
 */
import { bus } from '@/core/bus';
import { store } from '@/core/store';
import { ACHIEVEMENTS_BY_ID, RANKS_BY_ID, articleById } from '@/content';
import { engine } from '@/engine';
import { hasMission } from '@/ui/services/missions';
import { currentOverlay, openOverlay, openPause } from '@/ui/services/nav';
import { installKitSounds, uiSound, unlockAudio } from '@/ui/services/sound';
import { pushToast } from '@/ui/services/toasts';
import { boardById, propForBoard, type MinigameId } from '@/ui/minigames/boards';

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  OFFLINE: 'Offline',
  CONNECTION_FAILED: 'Connection Failed',
  RESERVED: 'Reserved',
};

function runtimeLive(): boolean {
  return hasMission('careerRank');
}

function applyRootAttributes(): void {
  const st = store.getState().progress.settings;
  const root = document.documentElement;
  root.dataset.reducedMotion = String(!!st.reducedMotion);
  root.dataset.subtitles = st.subtitleSize;
  root.dataset.colourBlind = st.colourBlind;
}

/** Robot status changes are noise unless the player is dealing with that rig right now. */
function statusChangeMatters(rigName: string): boolean {
  const s = store.getState();
  if (s.session.mode === 'freeplay') return true;
  const name = rigName.toLowerCase();
  return s.session.tickets.some((t) => t.status !== 'resolved' && t.status !== 'handover' && t.status !== 'failed' && (t.binding.rig === name || t.binding.rigs.includes(name)));
}

export function installBridge(): () => void {
  const offs: (() => void)[] = [];
  installKitSounds();

  applyRootAttributes();
  offs.push(
    store.subscribe((s, prev) => {
      if (s.progress.settings !== prev.progress.settings) applyRootAttributes();
    }),
  );

  // Audio unlock on the first gesture anywhere (menus included).
  const gesture = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', gesture, true);
    window.removeEventListener('keydown', gesture, true);
  };
  window.addEventListener('pointerdown', gesture, true);
  window.addEventListener('keydown', gesture, true);
  offs.push(() => {
    window.removeEventListener('pointerdown', gesture, true);
    window.removeEventListener('keydown', gesture, true);
  });

  /* ── sim events ── */
  offs.push(
    bus.on('power.fuseBlown', (e) => pushToast({ kind: 'warning', title: 'Fuse blown', body: `${e.fuseId} on ${e.railId} (${e.currentA.toFixed(1)} A)`, icon: 'fuse' })),
    bus.on('power.loadDamaged', (e) => pushToast({ kind: 'error', title: 'Equipment damaged', body: `${e.loadId}: ${e.cause}`, icon: 'bolt' })),
    bus.on('power.breakerTripped', (e) => pushToast({ kind: 'warning', title: 'Strip breaker tripped', body: `${e.stripId} at ${e.currentA.toFixed(1)} A`, icon: 'bolt' })),
    bus.on('robot.statusChanged', (e) => {
      if (!statusChangeMatters(e.name)) return;
      const to = STATUS_LABEL[e.to] ?? e.to;
      const kind = e.to === 'CONNECTION_FAILED' ? 'warning' : e.to === 'AVAILABLE' ? 'success' : 'info';
      pushToast({ kind, title: `${e.name.toUpperCase()} → ${to}`, body: `was ${STATUS_LABEL[e.from] ?? e.from}${e.reason ? ` · ${e.reason}` : ''}`, icon: 'robot' });
    }),
  );

  /* ── juice: an audible tick whenever an objective is ticked off or something goes in a pocket ── */
  let lastTick = 0;
  const tick = (vol: number) => {
    const now = performance.now();
    if (now - lastTick < 250) return;
    lastTick = now;
    uiSound('ui-success', vol);
  };
  offs.push(
    bus.on('mission.objectiveCompleted', () => tick(0.55)),
    bus.on('item.pickedUp', () => tick(0.4)),
  );

  /* ── world board minigames: `minigame.open { id }` (bolt bins) → the board overlay ── */
  offs.push(
    bus.on('app.action', (e) => {
      if (e.app !== 'world' || e.action !== 'minigame.open') return;
      const id = typeof e.data?.id === 'string' ? e.data.id : '';
      if (!boardById(id)) return;
      try {
        engine.exitPointerLock();
      } catch {
        /* engine not ready */
      }
      openOverlay({ kind: 'inspect', propId: propForBoard(id as MinigameId) });
    }),
  );

  /* ── gameplay toasts while the runtime is not live ── */
  offs.push(
    bus.on('xp.gained', (e) => {
      if (!runtimeLive()) pushToast({ kind: 'xp', title: `+${e.amount} XP`, body: e.detail });
    }),
    bus.on('achievement.unlocked', (e) => {
      if (runtimeLive()) return;
      const def = ACHIEVEMENTS_BY_ID[e.achievementId];
      pushToast({ kind: 'achievement', title: e.title, body: def?.description, icon: def?.icon });
    }),
    bus.on('rank.changed', (e) => {
      if (!runtimeLive()) pushToast({ kind: 'rank', title: `Promoted: ${RANKS_BY_ID[e.to]?.title ?? e.to}` });
      const ov = currentOverlay();
      if (ov.kind === 'main-menu' && store.getState().session.mode === 'menu') openOverlay({ kind: 'rank-up', rank: e.to }, { push: true });
    }),
    bus.on('manual.entryUnlocked', (e) => {
      if (!runtimeLive()) pushToast({ kind: 'manual', title: 'New Field Manual entry', body: articleById(e.entryId)?.title ?? e.entryId, icon: 'book' });
    }),
    bus.on('ticket.opened', (e) => {
      if (!runtimeLive()) pushToast({ kind: 'ticket', title: `${e.ticketId} · ${e.severity}`, body: e.title });
    }),
  );

  /* ── leaving a camera-focus overlay (inspect / tablet / workstation) → release the camera ── */
  // The world focuses the camera when it opens these overlays; whoever closes them (the UI, the
  // desktop's own Esc, a lesson step) leaves the release to the UI (World §9.3, Apps §1.8).
  offs.push(
    store.subscribe((s, prev) => {
      const from = prev.ui.overlay.kind;
      const to = s.ui.overlay.kind;
      // Also when an overlay that replaced a focus overlay (pause over the desktop, the ticket board, a
      // Teach Card, a quiz → debrief chain started from the desk) closes to the 3D view or the main
      // menu: nothing may keep the camera parked on the monitor behind the menu or the next activity.
      if (from === to || (to !== 'none' && to !== 'main-menu')) return;
      let focused = false;
      try {
        focused = engine.isFocused();
      } catch {
        /* engine not ready */
      }
      if (!focused) return;
      try {
        void engine.releaseFocus();
        // Still inside the closing click / key press: re-capture the mouse for walking.
        if (to === 'none' && s.session.mode !== 'menu') engine.requestPointerLock();
      } catch {
        /* engine not ready */
      }
    }),
  );

  /* ── pointer-lock loss during play → pause ── */
  let lockTimer: ReturnType<typeof setTimeout> | null = null;
  offs.push(
    store.subscribe((s, prev) => {
      if (!(prev.ui.pointerLocked && !s.ui.pointerLocked)) return;
      if (lockTimer) clearTimeout(lockTimer);
      // Give the world a moment: sitting down / opening a tablet also releases the lock.
      lockTimer = setTimeout(() => {
        const now = store.getState();
        let focused = false;
        try {
          focused = engine.isFocused();
        } catch {
          /* engine not ready */
        }
        if (now.ui.overlay.kind === 'none' && now.session.mode !== 'menu' && !now.ui.pointerLocked && !focused && !now.session.dialogue) openPause();
      }, 160);
    }),
  );

  return () => {
    if (lockTimer) clearTimeout(lockTimer);
    for (const off of offs) off();
  };
}
