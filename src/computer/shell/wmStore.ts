/**
 * Desktop window manager (Apps §1.3) — a computer-local zustand store, NOT part of RootState or the sim.
 * Module-level, so open windows survive standing up and sitting down again.
 *
 * Events (Apps §0.3): `app.opened` and `app.navigated` are emitted here and only here;
 * `computer.windowsChanged` (≤ 2 Hz) feeds the world's monitor mirror.
 */
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { emit, getState } from '@/core/store';
import {
  APP_META,
  APP_ROUTES,
  buildRoute,
  emitAppAction,
  resolveUrl,
  type AppEventSource,
  type AppId,
  type AppParams,
  type NotifyOptions,
  type PickFileOptions,
  type WindowInfo,
  type WindowManagerApi,
} from '../apps';
import { playSound } from './engineBridge';

/* ─────────────────────────────── Types ─────────────────────────────── */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowState extends Rect {
  id: string;
  app: AppId;
  title: string;
  route: string;
  params: AppParams;
  minimized: boolean;
  maximized: boolean;
  snapped: 'left' | 'right' | null;
  z: number;
  history: string[];
  historyIndex: number;
  reloadKey: number;
  instanceKey: string | null;
  createdAtMs: number;
  /** Bounds before maximise/snap (restored by un-maximise or dragging the title bar). */
  restore: Rect | null;
  /** Increments on every navigation (browser loading bar). */
  navSeq: number;
}

export interface ToastItem {
  id: string;
  app: AppEventSource;
  title: string;
  body?: string;
  route?: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  /** Game ms. */
  atMs: number;
}

export type ShellPopup = null | 'start' | 'calendar' | 'bell' | 'tray' | 'power' | 'network' | 'volume';

export interface RecentItem {
  app: AppId;
  route: string;
  title: string;
}

export interface FileDialogState {
  id: string;
  windowId: string | null;
  opts: PickFileOptions;
}

export interface ShellState {
  windows: WindowState[];
  focusedId: string | null;
  /** Most-recently-used window ids (first = most recent). */
  mru: string[];
  zTop: number;
  seq: number;
  workArea: { w: number; h: number };
  toasts: ToastItem[];
  /** Bell flyout (newest first, max 30). */
  log: ToastItem[];
  unseen: number;
  clipboard: string;
  popup: ShellPopup;
  recent: RecentItem[];
  fileDialog: FileDialogState | null;
  switcher: { ids: string[]; index: number } | null;
  /** Game ms the Jenkins window was last focused (taskbar FAILURE badge). */
  jenkinsSeenMs: number;
  /** Session-local workstation files (D6 fallback: host.writeFile for ws-17 not landed). */
  sessionFiles: Record<string, string>;
  /** Snap preview while dragging a window to a screen edge. */
  snapPreview: Rect | null;
}

const TASKBAR_H = 48;

function initialState(): ShellState {
  return {
    windows: [],
    focusedId: null,
    mru: [],
    zTop: 10,
    seq: 0,
    workArea: { w: 1600, h: 900 - TASKBAR_H },
    toasts: [],
    log: [],
    unseen: 0,
    clipboard: '',
    popup: null,
    recent: [],
    fileDialog: null,
    switcher: null,
    jenkinsSeenMs: 0,
    sessionFiles: {},
    snapPreview: null,
  };
}

export const shell = createStore<ShellState>()(() => initialState());

export function useShell<T>(selector: (s: ShellState) => T): T {
  return useStore(shell, selector);
}

export function useShellShallow<T>(selector: (s: ShellState) => T): T {
  return useStoreWithEqualityFn(shell, selector, shallow);
}

/** Tests: reset the shell to a pristine state. */
export function resetShell(): void {
  shell.setState(initialState(), true);
  for (const r of fileResolvers.values()) r(null);
  fileResolvers.clear();
}

/* ─────────────────────────────── Helpers ─────────────────────────────── */

const nowMs = () => getState().lab.time.nowMs;

function patchWindow(id: string, patch: Partial<WindowState> | ((w: WindowState) => Partial<WindowState>)): void {
  shell.setState((s) => ({
    windows: s.windows.map((w) => (w.id === id ? { ...w, ...(typeof patch === 'function' ? patch(w) : patch) } : w)),
  }));
}

export function getWindow(id: string): WindowState | undefined {
  return shell.getState().windows.find((w) => w.id === id);
}

function clampRect(r: Rect, area: { w: number; h: number }, minSize: { w: number; h: number }): Rect {
  const w = Math.max(Math.min(minSize.w, area.w), Math.min(r.w, area.w));
  const h = Math.max(Math.min(minSize.h, area.h), Math.min(r.h, area.h));
  const x = Math.min(Math.max(r.x, 40 - w), Math.max(0, area.w - 40));
  const y = Math.min(Math.max(r.y, 0), Math.max(0, area.h - 40));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
}

/** A newly opened window starts fully inside the work area when it fits (cascade wraps back to the corner). */
function fitInside(r: Rect, area: { w: number; h: number }): Rect {
  const x = r.x + r.w > area.w ? Math.max(0, area.w - r.w) : r.x;
  const y = r.y + r.h > area.h ? Math.max(0, area.h - r.h) : r.y;
  return { ...r, x, y };
}

/* Per-app last bounds (Apps §1.3 Persistence). */
const LAYOUT_KEY = 'labsim.desktop.layout.v1';

function readLayout(): Partial<Record<AppId, Rect>> {
  try {
    const raw = globalThis.localStorage?.getItem(LAYOUT_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<AppId, Rect>>) : {};
  } catch {
    return {};
  }
}

function saveLayout(app: AppId, r: Rect): void {
  try {
    const all = readLayout();
    all[app] = { x: r.x, y: r.y, w: r.w, h: r.h };
    globalThis.localStorage?.setItem(LAYOUT_KEY, JSON.stringify(all));
  } catch {
    /* storage blocked */
  }
}

/* ─────────────────────────────── Routes from params ─────────────────────────────── */

/**
 * Initial/re-target route for an open request: `params.route`, else derived from app-specific params
 * (chat channel, dashboard robot, gimp path, files dir, intellij repo/file, browser url, camera url/robot),
 * else null (keep / home route).
 */
export function routeFromParams(app: AppId, p: AppParams): string | null {
  if (p.route) return p.route;
  switch (app) {
    case 'chat':
      if (!p.channel) return null;
      if (p.channel.startsWith('dm:')) return buildRoute(APP_ROUTES.chat.dm, { user: p.channel.slice(3) });
      return buildRoute(APP_ROUTES.chat.channel, { name: p.channel.replace(/^#/, '') });
    case 'dashboard':
      return p.robot ? buildRoute(APP_ROUTES.dashboard.robot, { name: p.robot, tab: p.tab ?? 'motion-control' }) : null;
    case 'gimp':
      return p.path ? `/image/${p.path}` : null;
    case 'files':
      return p.dir ? `/dir/${p.dir}` : p.path ? `/dir/${p.path.replace(/\/[^/]*$/, '') || '~'}` : null;
    case 'intellij':
      if (!p.repo) return null;
      return p.file ? `/project/${p.repo}/file/${p.file}` : buildRoute(APP_ROUTES.intellij.project, { repo: p.repo });
    case 'browser':
      return p.url ?? null;
    case 'camera': {
      if (p.url) {
        const r = resolveUrl(p.url);
        if (r.app === 'camera') return r.route + (p.robot ? `?robot=${encodeURIComponent(p.robot)}` : '');
      }
      if (p.robot) {
        const robot = Object.values(getState().lab.orca.robots).find((x) => x.name === p.robot);
        const m = robot ? /^https?:\/\/([\d.]+):8081/.exec(robot.cameraStreamUrl) : null;
        if (m) return `${buildRoute(APP_ROUTES.camera.stream, { host: m[1] })}?robot=${encodeURIComponent(p.robot)}`;
      }
      return null;
    }
    default:
      return null;
  }
}

/* ─────────────────────────────── Window operations ─────────────────────────────── */

function bringToFront(id: string): void {
  shell.setState((s) => {
    const z = s.zTop + 1;
    return {
      zTop: z,
      focusedId: id,
      mru: [id, ...s.mru.filter((m) => m !== id)],
      windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)),
      jenkinsSeenMs: s.windows.find((w) => w.id === id)?.app === 'jenkins' ? nowMs() : s.jenkinsSeenMs,
    };
  });
}

function recordRecent(app: AppId, route: string, title: string): void {
  if (!title) return;
  shell.setState((s) => {
    const rest = s.recent.filter((r) => !(r.app === app && r.route === route));
    return { recent: [{ app, route, title }, ...rest].slice(0, 6) };
  });
}

/** Open (or focus / re-target) an app window. Emits `app.opened` (+ `app.navigated` when the route changes). */
export function openApp(id: AppId, params: AppParams = {}): string {
  const meta = APP_META[id];
  if (!meta) {
    console.warn(`[computer] openApp: unknown app "${String(id)}"`);
    return '';
  }
  const s = shell.getState();
  const key = meta.instanceKey ? meta.instanceKey(params) : null;
  const existing = meta.singleInstance
    ? s.windows.find((w) => w.app === id)
    : key != null
      ? s.windows.find((w) => w.app === id && w.instanceKey === key)
      : undefined;
  const target = routeFromParams(id, params);

  if (existing) {
    bringToFront(existing.id);
    const hasParams = Object.keys(params).length > 0;
    if (hasParams) patchWindow(existing.id, { params: { ...params } });
    emit('app.opened', { app: id });
    if (target && target !== existing.route) navigate(existing.id, target);
    return existing.id;
  }

  const route = target ?? meta.homeRoute;
  const area = s.workArea;
  const n = s.windows.length;
  const remembered = readLayout()[id];
  const maximized = area.w > 0 && area.w < 1280;
  const base: Rect = remembered ?? {
    x: 64 + ((28 * n) % Math.max(28, area.w - 400)),
    y: 40 + ((28 * n) % Math.max(28, area.h - 300)),
    w: meta.defaultSize.w,
    h: meta.defaultSize.h,
  };
  const rect = fitInside(clampRect(base, area, meta.minSize), area);
  const winId = `w${s.seq + 1}`;
  const z = s.zTop + 1;
  const win: WindowState = {
    id: winId,
    app: id,
    title: meta.title,
    route,
    params: { ...params },
    ...rect,
    minimized: false,
    maximized,
    snapped: null,
    z,
    history: [route],
    historyIndex: 0,
    reloadKey: 0,
    instanceKey: key,
    createdAtMs: nowMs(),
    restore: maximized ? rect : null,
    navSeq: 1,
  };
  shell.setState((st) => ({
    seq: st.seq + 1,
    zTop: z,
    windows: [...st.windows, win],
    focusedId: winId,
    mru: [winId, ...st.mru],
    popup: null,
    jenkinsSeenMs: id === 'jenkins' ? nowMs() : st.jenkinsSeenMs,
  }));
  emit('app.opened', { app: id });
  emit('app.navigated', { app: id, route });
  return winId;
}

export function closeWindow(id: string): void {
  const w = getWindow(id);
  if (!w) return;
  const fd = shell.getState().fileDialog;
  if (fd && fd.windowId === id) resolveFileDialog(null);
  shell.setState((s) => {
    const windows = s.windows.filter((x) => x.id !== id);
    const mru = s.mru.filter((m) => m !== id);
    const nextFocus = s.focusedId === id ? (mru.find((m) => !windows.find((x) => x.id === m)?.minimized) ?? null) : s.focusedId;
    return { windows, mru, focusedId: nextFocus };
  });
}

export function focusWindow(id: string): void {
  const s = shell.getState();
  const w = s.windows.find((x) => x.id === id);
  if (!w) return;
  if (s.focusedId === id && !w.minimized && w.z === s.zTop) return;
  bringToFront(id);
}

/** Desktop clicked: no window focused. */
export function focusDesktop(): void {
  if (shell.getState().focusedId !== null) shell.setState({ focusedId: null });
}

export function minimizeWindow(id: string): void {
  shell.setState((s) => {
    const windows = s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w));
    const focusedId =
      s.focusedId === id ? (s.mru.find((m) => m !== id && !windows.find((x) => x.id === m)?.minimized) ?? null) : s.focusedId;
    return { windows, focusedId };
  });
}

export function toggleMaximize(id: string): void {
  const w = getWindow(id);
  if (!w) return;
  if (w.maximized || w.snapped) {
    const r = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
    patchWindow(id, { maximized: false, snapped: null, ...r, restore: null });
  } else {
    patchWindow(id, { maximized: true, snapped: null, restore: { x: w.x, y: w.y, w: w.w, h: w.h } });
  }
  focusWindow(id);
}

export function snapWindow(id: string, side: 'left' | 'right' | 'max' | 'restore'): void {
  const w = getWindow(id);
  if (!w) return;
  if (side === 'max') {
    if (!w.maximized) toggleMaximize(id);
    return;
  }
  if (side === 'restore') {
    if (w.maximized || w.snapped) toggleMaximize(id);
    else minimizeWindow(id);
    return;
  }
  const restore = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
  patchWindow(id, { snapped: side, maximized: false, restore });
  focusWindow(id);
}

/** Effective on-screen rect (maximised / snapped windows fill the work area). */
export function effectiveRect(w: WindowState, area: { w: number; h: number }): Rect {
  if (w.maximized) return { x: 0, y: 0, w: area.w, h: area.h };
  if (w.snapped === 'left') return { x: 0, y: 0, w: Math.floor(area.w / 2), h: area.h };
  if (w.snapped === 'right') return { x: Math.floor(area.w / 2), y: 0, w: Math.ceil(area.w / 2), h: area.h };
  return { x: w.x, y: w.y, w: w.w, h: w.h };
}

/** Move/resize (drag). `commit` persists the per-app layout. */
export function setBounds(id: string, r: Rect, commit = false): void {
  const w = getWindow(id);
  if (!w) return;
  const meta = APP_META[w.app];
  const area = shell.getState().workArea;
  const next = clampRect(r, area, meta.minSize);
  patchWindow(id, { ...next, maximized: false, snapped: null });
  if (commit) saveLayout(w.app, next);
}

/** Restore a maximised/snapped window to its previous size (title-bar drag). Returns the restored rect. */
export function unmaximizeForDrag(id: string): Rect | null {
  const w = getWindow(id);
  if (!w || (!w.maximized && !w.snapped)) return null;
  const r = w.restore ?? { x: w.x, y: w.y, w: w.w, h: w.h };
  patchWindow(id, { maximized: false, snapped: null, restore: null, w: r.w, h: r.h });
  return r;
}

export function setTitle(id: string, title: string): void {
  const w = getWindow(id);
  if (!w) return;
  if (w.title !== title) patchWindow(id, { title });
  recordRecent(w.app, w.route, title);
}

/** Change a window's route (push or replace history). Emits `app.navigated`. */
export function navigate(id: string, route: string, opts?: { replace?: boolean }): void {
  const w = getWindow(id);
  if (!w) return;
  if (w.route === route) return;
  if (opts?.replace) {
    const history = w.history.slice();
    history[w.historyIndex] = route;
    patchWindow(id, { route, history });
  } else {
    const history = [...w.history.slice(0, w.historyIndex + 1), route].slice(-50);
    patchWindow(id, { route, history, historyIndex: history.length - 1, navSeq: w.navSeq + 1 });
  }
  emit('app.navigated', { app: w.app, route });
}

export function goBack(id: string): void {
  const w = getWindow(id);
  if (!w || w.historyIndex <= 0) return;
  const i = w.historyIndex - 1;
  const route = w.history[i]!;
  patchWindow(id, { historyIndex: i, route, navSeq: w.navSeq + 1 });
  emit('app.navigated', { app: w.app, route });
}

export function goForward(id: string): void {
  const w = getWindow(id);
  if (!w || w.historyIndex >= w.history.length - 1) return;
  const i = w.historyIndex + 1;
  const route = w.history[i]!;
  patchWindow(id, { historyIndex: i, route, navSeq: w.navSeq + 1 });
  emit('app.navigated', { app: w.app, route });
}

export function reloadWindow(id: string): void {
  const w = getWindow(id);
  if (!w) return;
  patchWindow(id, { reloadKey: w.reloadKey + 1, navSeq: w.navSeq + 1 });
  emit('app.navigated', { app: w.app, route: w.route });
}

export function setWorkArea(w: number, h: number): void {
  const cur = shell.getState().workArea;
  if (cur.w === w && cur.h === h) return;
  const area = { w, h };
  // Keep every window's title bar reachable after the viewport shrinks (windows can never be lost off-screen).
  shell.setState((s) => ({
    workArea: area,
    windows:
      w < 200 || h < 150
        ? s.windows
        : s.windows.map((win) => {
            const r = clampRect(win, area, APP_META[win.app].minSize);
            return r.x === win.x && r.y === win.y && r.w === win.w && r.h === win.h ? win : { ...win, ...r };
          }),
  }));
}

export function setPopup(p: ShellPopup): void {
  if (shell.getState().popup !== p) shell.setState({ popup: p });
}

export function closeAllExcept(keep: AppId[]): void {
  for (const w of shell.getState().windows) if (!keep.includes(w.app)) closeWindow(w.id);
}

/* ─────────────────────────────── Notifications (Apps §1.5) ─────────────────────────────── */

const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();
const TOAST_MS = 6000;

export function notify(n: NotifyOptions): void {
  const s = shell.getState();
  const item: ToastItem = {
    id: `n${s.seq + 1}`,
    app: n.app ?? 'desktop',
    title: n.title,
    body: n.body,
    route: n.route,
    kind: n.kind ?? 'info',
    atMs: nowMs(),
  };
  shell.setState((st) => ({
    seq: st.seq + 1,
    toasts: [...st.toasts, item].slice(-3),
    log: [item, ...st.log].slice(0, 30),
    unseen: st.unseen + 1,
  }));
  scheduleToastDismiss(item.id, TOAST_MS);
  playSound('ui-ticket', { bus: 'ui', volume: 0.5 });
}

export function scheduleToastDismiss(id: string, ms: number): void {
  clearToastTimer(id);
  toastTimers.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
}

export function clearToastTimer(id: string): void {
  const t = toastTimers.get(id);
  if (t) clearTimeout(t);
  toastTimers.delete(id);
}

export function dismissToast(id: string): void {
  clearToastTimer(id);
  shell.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function clearNotificationLog(): void {
  shell.setState({ log: [], unseen: 0 });
}

export function markNotificationsSeen(): void {
  if (shell.getState().unseen) shell.setState({ unseen: 0 });
}

/** Toast clicked: open its app at its route, dismiss, emit `desktop.notification.clicked`. */
export function activateToast(t: ToastItem): void {
  dismissToast(t.id);
  if (t.app !== 'desktop' && t.app !== 'tablet') openApp(t.app, t.route ? { route: t.route } : {});
  emitAppAction('desktop', 'desktop.notification.clicked', { app: t.app, title: t.title, route: t.route ?? null });
}

/* ─────────────────────────────── Clipboard & file dialog (Apps §1.6) ─────────────────────────────── */

export const clipboard = {
  read(): string {
    return shell.getState().clipboard;
  },
  write(text: string, sourceApp: AppEventSource = 'desktop'): void {
    shell.setState({ clipboard: text });
    try {
      void globalThis.navigator?.clipboard?.writeText(text).catch(() => undefined);
    } catch {
      /* no permission */
    }
    emitAppAction('desktop', 'desktop.clipboard.copied', { text, sourceApp });
  },
};

const fileResolvers = new Map<string, (path: string | null) => void>();

export function pickFile(opts: PickFileOptions): Promise<string | null> {
  const prev = shell.getState().fileDialog;
  if (prev) resolveFileDialog(null);
  const s = shell.getState();
  const id = `fd${s.seq + 1}`;
  shell.setState((st) => ({ seq: st.seq + 1, fileDialog: { id, windowId: st.focusedId, opts } }));
  return new Promise((resolve) => fileResolvers.set(id, resolve));
}

export function resolveFileDialog(path: string | null): void {
  const fd = shell.getState().fileDialog;
  if (!fd) return;
  const r = fileResolvers.get(fd.id);
  fileResolvers.delete(fd.id);
  shell.setState({ fileDialog: null });
  r?.(path);
}

export function writeSessionFile(path: string, contents: string): void {
  shell.setState((s) => ({ sessionFiles: { ...s.sessionFiles, [path]: contents } }));
}

/* ─────────────────────────────── Window switcher (Alt+`) ─────────────────────────────── */

export function cycleSwitcher(dir: 1 | -1): void {
  const s = shell.getState();
  if (!s.windows.length) return;
  if (!s.switcher) {
    const ids = s.mru.filter((id) => s.windows.some((w) => w.id === id));
    if (!ids.length) return;
    shell.setState({ switcher: { ids, index: ids.length > 1 ? (dir === 1 ? 1 : ids.length - 1) : 0 } });
    return;
  }
  const n = s.switcher.ids.length;
  shell.setState({ switcher: { ids: s.switcher.ids, index: (s.switcher.index + dir + n) % n } });
}

export function commitSwitcher(): void {
  const sw = shell.getState().switcher;
  if (!sw) return;
  shell.setState({ switcher: null });
  const id = sw.ids[sw.index];
  if (id) focusWindow(id);
}

export function cancelSwitcher(): void {
  if (shell.getState().switcher) shell.setState({ switcher: null });
}

/* ─────────────────────────────── The WindowManagerApi object ─────────────────────────────── */

/** Optional gate the desktop installs (lesson gating, Apps §1.11). Returns false when the open is refused. */
let openGate: ((id: AppId, params: AppParams) => boolean) | null = null;

export function setOpenGate(fn: ((id: AppId, params: AppParams) => boolean) | null): void {
  openGate = fn;
}

export function windowInfos(): WindowInfo[] {
  const s = shell.getState();
  return s.windows.map((w) => ({
    id: w.id,
    app: w.app,
    title: w.title,
    route: w.route,
    minimized: w.minimized,
    maximized: w.maximized,
    focused: s.focusedId === w.id && !w.minimized,
  }));
}

export const wmApi: WindowManagerApi = {
  openApp(id, params) {
    if (openGate && !openGate(id, params ?? {})) return '';
    return openApp(id, params);
  },
  close: closeWindow,
  focus: focusWindow,
  minimize: minimizeWindow,
  toggleMaximize,
  setTitle,
  navigate,
  notify,
  pickFile,
  clipboard,
  windows: windowInfos,
};

/* ─────────────────────────────── computer.windowsChanged (≤ 2 Hz) ─────────────────────────────── */

let lastSig = '';
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let lastEmitAt = 0;

function windowsSignature(s: ShellState): string {
  return s.windows.map((w) => `${w.id}|${w.app}|${w.title}|${w.minimized ? 1 : 0}|${s.focusedId === w.id ? 1 : 0}`).join('\n');
}

function emitWindowsChanged(): void {
  pendingTimer = null;
  lastEmitAt = Date.now();
  const s = shell.getState();
  emit('computer.windowsChanged', {
    windows: s.windows.map((w) => ({ id: w.id, app: w.app, title: w.title, minimized: w.minimized, focused: s.focusedId === w.id && !w.minimized })),
  });
}

shell.subscribe((s) => {
  const sig = windowsSignature(s);
  if (sig === lastSig) return;
  lastSig = sig;
  if (pendingTimer) return;
  const wait = Math.max(0, 500 - (Date.now() - lastEmitAt));
  pendingTimer = setTimeout(emitWindowsChanged, wait);
});
