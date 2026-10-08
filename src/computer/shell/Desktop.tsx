/**
 * The workstation desktop (Apps §1): wallpaper, icons, windows, taskbar, start menu, toasts, flyouts,
 * objective pin, hints, switcher; global keyboard (Esc stands up), gating and the mission bridge.
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { bus } from '@/core/bus';
import { getState } from '@/core/store';
import { drainOpenRequests, setWindowManager, type AppId, type AppParams } from '../apps';
import { exitOverlay, initComputer } from './boot';
import { isAppUnlocked, LOCKED_TEXT, useUnlockedApps } from './gating';
import { DesktopIcons } from './DesktopIcons';
import { HintOverlay, ObjectivePin, Switcher } from './Overlays';
import { Toasts } from './Notifications';
import { StartMenu } from './StartMenu';
import { Taskbar } from './Taskbar';
import { DesktopRootContext, WindowFrame } from './WindowFrame';
import {
  cancelSwitcher,
  closeWindow,
  commitSwitcher,
  cycleSwitcher,
  focusDesktop,
  openApp,
  setOpenGate,
  setPopup,
  setWorkArea,
  shell,
  snapWindow,
  useShell,
  wmApi,
} from './wmStore';
import './desktop.css';

const TASKBAR_H = 48;

function Wallpaper() {
  return (
    <div className="ws-wallpaper" aria-hidden="true">
      <svg className="ws-wallpaper-leaf" viewBox="0 0 100 100">
        <g fill="rgba(110, 231, 160, .10)">
          <circle cx="29" cy="29" r="21" />
          <circle cx="71" cy="29" r="21" />
          <circle cx="29" cy="71" r="21" />
          <circle cx="71" cy="71" r="21" />
        </g>
      </svg>
      <div className="ws-wallpaper-brand">
        ws-17 · 10.42.50.17
        <br />
        LabSim automation lab
      </div>
    </div>
  );
}

function Windows() {
  const windows = useShell((s) => s.windows);
  const focusedId = useShell((s) => s.focusedId);
  const area = useShell((s) => s.workArea);
  const preview = useShell((s) => s.snapPreview);
  return (
    <div className="ws-workarea">
      {windows.map((w) => (
        <WindowFrame key={w.id} win={w} focused={focusedId === w.id && !w.minimized} area={area} />
      ))}
      {preview ? <div className="ws-snap-preview" style={{ left: preview.x, top: preview.y, width: preview.w, height: preview.h }} /> : null}
    </div>
  );
}

/** Handle one open request (gating: locked apps are refused with a console warning, Apps §1.11). */
function handleOpenRequest(app: AppId, params?: AppParams): void {
  if (!isAppUnlocked(getState().session.computer, app)) {
    console.warn(`[computer] requestOpenApp("${app}") ignored: app is locked by the lesson gating`);
    return;
  }
  openApp(app, params ?? {});
}

export function Desktop(props: { onExit?: () => void }) {
  const { onExit } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const popup = useShell((s) => s.popup);
  const height = useShell((s) => s.workArea.h);
  const unlocked = useUnlockedApps();
  const isUnlocked = useCallback((app: AppId) => unlocked === 'all' || unlocked.includes(app), [unlocked]);

  const standUp = useCallback(() => {
    setPopup(null);
    exitOverlay(onExit, true);
  }, [onExit]);

  // Boot services, window manager registration, gating gate, request queue.
  useEffect(() => {
    initComputer();
    setWindowManager(wmApi);
    setOpenGate((id) => {
      if (isAppUnlocked(getState().session.computer, id)) return true;
      wmApi.notify({ app: 'desktop', title: LOCKED_TEXT, kind: 'info' });
      return false;
    });
    for (const r of drainOpenRequests()) handleOpenRequest(r.app, r.params);
    const offOpen = bus.on('computer.openAppRequested', () => {
      for (const r of drainOpenRequests()) handleOpenRequest(r.app, r.params);
    });
    // (`session.started` → close all but LabChat lives in initComputer: it must also run while seated elsewhere.)
    return () => {
      offOpen();
      setOpenGate(null);
      setWindowManager(null);
    };
  }, []);

  // Keyboard focus follows the focused window: when another window comes to the front (taskbar click,
  // Start menu, requestOpenApp, minimise), drop DOM focus left behind in the taskbar or in a background
  // window. Otherwise typing before a lazily-loaded app mounts lands in the old window — or Space
  // re-activates the still-focused taskbar button and minimises the app that was just opened.
  useEffect(
    () =>
      shell.subscribe((s, prev) => {
        if (s.focusedId === prev.focusedId) return;
        const ae = document.activeElement as HTMLElement | null;
        const root = rootRef.current;
        if (!ae || ae === document.body || !root?.contains(ae)) return;
        const host = ae.closest<HTMLElement>('[data-window]');
        if (host && host.dataset.window === s.focusedId) return;
        // Text fields in the taskbar/Start menu keep focus while they are in use (popups stay open).
        if (!host && shell.getState().popup) return;
        ae.blur();
      }),
    [],
  );

  // Native text fields share the in-game clipboard (Apps §1.6): Ctrl+C/X in any input, address bar or page
  // text lands in it, and Ctrl+V into a native field pastes it — so "copy the URL in Orca → paste in the
  // Terminal" works even where the system clipboard is unavailable. Apps that own copy/paste
  // (IntelliJ editor, Terminal) preventDefault and are left alone. Document-level bubble listeners run after
  // React's handlers, so `defaultPrevented` is final here.
  useEffect(() => {
    const inDesktop = (t: EventTarget | null): HTMLElement | null => {
      const el = t instanceof HTMLElement ? t : null;
      return el && rootRef.current?.contains(el) ? el : null;
    };
    const fieldOf = (el: HTMLElement): HTMLInputElement | HTMLTextAreaElement | null =>
      el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && /^(text|search|url|email|tel|password|number|)$/.test(el.type)) ? el : null;
    const onCopy = (e: ClipboardEvent) => {
      const el = inDesktop(e.target);
      if (!el || e.defaultPrevented) return;
      const f = fieldOf(el);
      let text = '';
      if (f) {
        if (f instanceof HTMLInputElement && f.type === 'password') return;
        text = f.value.slice(f.selectionStart ?? 0, f.selectionEnd ?? 0);
      } else text = window.getSelection()?.toString() ?? '';
      if (!text) return;
      const app = (el.closest<HTMLElement>('[data-app]')?.dataset.app ?? 'desktop') as Parameters<typeof wmApi.clipboard.write>[1];
      wmApi.clipboard.write(text, app);
    };
    const onPaste = (e: ClipboardEvent) => {
      const el = inDesktop(e.target);
      if (!el || e.defaultPrevented) return;
      const f = fieldOf(el);
      if (!f || f.readOnly || f.disabled) return;
      const text = wmApi.clipboard.read();
      if (!text) return; // in-game clipboard empty: the system clipboard pastes natively
      e.preventDefault();
      f.focus();
      if (!document.execCommand('insertText', false, f instanceof HTMLInputElement ? text.replace(/\r?\n/g, ' ') : text)) {
        const s = f.selectionStart ?? f.value.length;
        f.setRangeText(text, s, f.selectionEnd ?? s, 'end');
        f.dispatchEvent(new Event('input', { bubbles: true }));
      }
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  // Work area = viewport minus taskbar.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWorkArea(Math.round(el.clientWidth) || 1600, Math.max(200, Math.round(el.clientHeight - TASKBAR_H)) || 852);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keyboard Lock when fullscreen (Apps §1.8).
  useEffect(() => {
    const kb = (navigator as Navigator & { keyboard?: { lock?(keys: string[]): Promise<void>; unlock?(): void } }).keyboard;
    if (!document.fullscreenElement || !kb?.lock) return;
    kb.lock(['Escape', 'Tab', 'KeyW', 'KeyT', 'KeyN', 'F4', 'KeyQ']).catch(() => undefined);
    return () => kb.unlock?.();
  }, []);

  // Global shortcuts (bubble phase on window; apps consume keys with preventDefault).
  useEffect(() => {
    let winAlone = false;
    const locked = () => !!document.fullscreenElement;
    const focused = () => shell.getState().focusedId;
    const onKeyDown = (e: KeyboardEvent) => {
      const s = shell.getState();
      if (e.key === 'Meta' || e.key === 'OS') {
        winAlone = true;
        return;
      }
      winAlone = false;
      if (e.key === 'Escape') {
        if (e.ctrlKey) {
          e.preventDefault();
          setPopup(s.popup === 'start' ? null : 'start');
          return;
        }
        if (s.switcher) {
          e.preventDefault();
          cancelSwitcher();
          return;
        }
        if (s.popup) {
          e.preventDefault();
          setPopup(null);
          return;
        }
        if (s.fileDialog || e.defaultPrevented) return;
        // Let window-level app listeners registered after ours consume it first.
        setTimeout(() => {
          if (!e.defaultPrevented && !shell.getState().fileDialog) standUp();
        }, 0);
        return;
      }
      if (e.defaultPrevented) return;
      if ((e.altKey && (e.key === '`' || e.code === 'Backquote')) || (locked() && e.ctrlKey && e.key === 'Tab')) {
        e.preventDefault();
        cycleSwitcher(e.shiftKey ? -1 : 1);
        return;
      }
      const id = focused();
      if (id && ((e.ctrlKey && e.altKey) || e.metaKey) && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'max', ArrowDown: 'restore' } as const;
        snapWindow(id, map[e.key as keyof typeof map]);
        return;
      }
      if (id && locked() && ((e.altKey && e.key === 'F4') || (e.ctrlKey && (e.key === 'w' || e.key === 'W')))) {
        e.preventDefault();
        closeWindow(id);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if ((e.key === 'Meta' || e.key === 'OS') && winAlone) {
        winAlone = false;
        const s = shell.getState();
        setPopup(s.popup === 'start' ? null : 'start');
      }
      if ((e.key === 'Alt' || e.key === 'Control') && shell.getState().switcher) commitSwitcher();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [standUp]);

  return (
    <DesktopRootContext.Provider value={rootRef}>
      <div
        ref={rootRef}
        className="ws-root"
        data-app="desktop"
        onPointerDown={(e) => {
          if (shell.getState().popup) setPopup(null);
          if (e.target === e.currentTarget || (e.target as HTMLElement).classList?.contains('ws-icons') || (e.target as HTMLElement).classList?.contains('ws-workarea')) {
            focusDesktop();
          }
        }}
        onContextMenu={(e) => {
          if (!(e.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) e.preventDefault();
        }}
      >
        <Wallpaper />
        <DesktopIcons height={height} isUnlocked={isUnlocked} />
        <Windows />
        <ObjectivePin />
        <HintOverlay rootRef={rootRef} />
        <Toasts />
        <Switcher />
        {popup === 'start' ? <StartMenu onStandUp={standUp} isUnlocked={isUnlocked} /> : null}
        <Taskbar onStandUp={standUp} unlocked={unlocked} />
      </div>
    </DesktopRootContext.Provider>
  );
}
