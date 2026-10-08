/**
 * One desktop window (Apps §1.2/§1.3): native title bar or the browser chrome, drag to move (edge snap),
 * 8 resize zones, minimise/maximise/close, title-bar context menu, focus on mousedown.
 */
import { createContext, memo, useContext, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type RefObject } from 'react';
import { useGame } from '@/core/store';
import { APP_META, emitAppAction, resolveUrl, type AppId } from '../apps';
import { AppSlot } from './AppHost';
import { BrowserFrame, ChromiumErrorPage, displayUrl } from './BrowserFrame';
import { AppIcon, Glyph } from './icons';
import { appEndpoint, reach, reachErrorTexts, type ReachResult } from './reach';
import {
  closeWindow,
  effectiveRect,
  focusWindow,
  getWindow,
  goBack,
  goForward,
  minimizeWindow,
  navigate,
  reloadWindow,
  setBounds,
  shell,
  snapWindow,
  toggleMaximize,
  unmaximizeForDrag,
  useShell,
  wmApi,
  type Rect,
  type WindowState,
} from './wmStore';
import { FileDialog } from './FileDialog';

/** Desktop root element (pointer → desktop coordinates). */
export const DesktopRootContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

const LIGHT_TITLE: ReadonlySet<AppId> = new Set<AppId>(['orca', 'jenkins', 'github', 'files', 'cardreader']);

function useLocalPoint() {
  const root = useContext(DesktopRootContext);
  return (e: { clientX: number; clientY: number }) => {
    const r = root?.current?.getBoundingClientRect();
    return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
  };
}

/* ─────────────────────────────── Window buttons ─────────────────────────────── */

function WindowButtons(props: { win: WindowState; light: boolean }) {
  const { win } = props;
  const max = win.maximized || !!win.snapped;
  return (
    <div className={`ws-winbtns${props.light ? ' ws-winbtns-light' : ''}`} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" className="ws-winbtn" aria-label="Minimize" title="Minimize" onClick={() => minimizeWindow(win.id)}>
        <Glyph.minimize size={16} />
      </button>
      <button type="button" className="ws-winbtn" aria-label={max ? 'Restore Down' : 'Maximize'} title={max ? 'Restore Down' : 'Maximize'} onClick={() => toggleMaximize(win.id)}>
        {max ? <Glyph.restore size={16} /> : <Glyph.maximize size={16} />}
      </button>
      <button type="button" className="ws-winbtn ws-winbtn-close" aria-label="Close" title="Close" onClick={() => closeWindow(win.id)}>
        <Glyph.close size={16} />
      </button>
    </div>
  );
}

/* ─────────────────────────────── Drag & resize ─────────────────────────────── */

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
const EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

function useWindowDrag(id: string) {
  const toLocal = useLocalPoint();
  return (e: RPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    focusWindow(id);
    const w0 = getWindow(id);
    if (!w0) return;
    const area = shell.getState().workArea;
    let rect: Rect = effectiveRect(w0, area);
    const start = toLocal(e);
    let grabX = start.x - rect.x;
    const grabY = start.y - rect.y;
    let dragging = false;
    let preview: 'left' | 'right' | 'max' | null = null;
    const onMove = (ev: PointerEvent) => {
      const p = toLocal(ev);
      if (!dragging) {
        if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) < 4) return;
        dragging = true;
        const restored = unmaximizeForDrag(id);
        if (restored) {
          const ratio = grabX / Math.max(1, rect.w);
          grabX = Math.round(restored.w * ratio);
          rect = { x: p.x - grabX, y: p.y - grabY, w: restored.w, h: restored.h };
        }
      }
      setBounds(id, { x: p.x - grabX, y: p.y - grabY, w: rect.w, h: rect.h });
      const a = shell.getState().workArea;
      const next = p.x <= 2 ? 'left' : p.x >= a.w - 2 ? 'right' : p.y <= 2 ? 'max' : null;
      if (next !== preview) {
        preview = next;
        shell.setState({
          snapPreview:
            next === 'left'
              ? { x: 0, y: 0, w: Math.floor(a.w / 2), h: a.h }
              : next === 'right'
                ? { x: Math.floor(a.w / 2), y: 0, w: Math.ceil(a.w / 2), h: a.h }
                : next === 'max'
                  ? { x: 0, y: 0, w: a.w, h: a.h }
                  : null,
        });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      shell.setState({ snapPreview: null });
      if (!dragging) return;
      if (preview) snapWindow(id, preview);
      else {
        const w = getWindow(id);
        if (w) setBounds(id, { x: w.x, y: w.y, w: w.w, h: w.h }, true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
}

function useWindowResize(id: string) {
  const toLocal = useLocalPoint();
  return (edge: Edge) => (e: RPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    focusWindow(id);
    const w0 = getWindow(id);
    if (!w0) return;
    const area = shell.getState().workArea;
    const r0 = effectiveRect(w0, area);
    const min = APP_META[w0.app].minSize;
    const start = toLocal(e);
    const onMove = (ev: PointerEvent) => {
      const p = toLocal(ev);
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      let { x, y, w, h } = r0;
      if (edge.includes('e')) w = Math.max(min.w, r0.w + dx);
      if (edge.includes('s')) h = Math.max(min.h, r0.h + dy);
      if (edge.includes('w')) {
        w = Math.max(min.w, r0.w - dx);
        x = r0.x + r0.w - w;
      }
      if (edge.includes('n')) {
        h = Math.max(min.h, r0.h - dy);
        y = r0.y + r0.h - h;
      }
      setBounds(id, { x, y, w, h });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      const w = getWindow(id);
      if (w) setBounds(id, { x: w.x, y: w.y, w: w.w, h: w.h }, true);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
}

/* ─────────────────────────────── Title-bar context menu ─────────────────────────────── */

function TitleMenu(props: { win: WindowState; at: { x: number; y: number }; light: boolean; onClose(): void }) {
  const { win, onClose } = props;
  const max = win.maximized || !!win.snapped;
  useEffect(() => {
    const off = () => onClose();
    window.addEventListener('pointerdown', off);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const item = (label: string, fn: () => void, disabled = false, shortcut?: string) => (
    <button
      type="button"
      role="menuitem"
      className="ws-ctx-item"
      disabled={disabled}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => {
        onClose();
        fn();
      }}
    >
      <span>{label}</span>
      {shortcut ? <span className="ws-ctx-key">{shortcut}</span> : null}
    </button>
  );
  return (
    <div className={`ws-ctx${props.light ? ' ws-ctx-light' : ''}`} role="menu" style={{ left: props.at.x, top: props.at.y }}>
      {item('Restore', () => toggleMaximize(win.id), !max)}
      {item('Minimize', () => minimizeWindow(win.id))}
      {item('Maximize', () => toggleMaximize(win.id), max)}
      <div className="ws-ctx-sep" />
      {item('Close', () => closeWindow(win.id), false, 'Alt+F4')}
    </div>
  );
}

/* ─────────────────────────────── Reachability of browser-hosted apps ─────────────────────────────── */

function useAppReach(app: AppId): ReachResult {
  return useGame((s) => {
    const ep = appEndpoint(app, s.lab);
    if (!ep) return 'ok';
    const r = reach(s.lab, ep.host, ep.port);
    if (r === 'ok' && app === 'jenkins' && s.lab.jenkins && s.lab.jenkins.up === false && Object.keys(s.lab.jenkins.jobs ?? {}).length > 0) return 'refused';
    return r;
  });
}

function BrowserPage(props: { win: WindowState; focused: boolean }) {
  const { win, focused } = props;
  const r = useAppReach(win.app);
  const url = displayUrl(win.app, win.route);
  const host = /^[a-z]+:\/\/([^/:?#]+)/i.exec(url)?.[1] ?? url;
  const lastReported = useRef<string>('');
  useEffect(() => {
    if (r === 'ok') {
      lastReported.current = '';
      return;
    }
    const key = `${r}|${win.reloadKey}`;
    if (lastReported.current === key) return;
    lastReported.current = key;
    emitAppAction(win.app, 'browser.page.unreachable', { url, error: r });
  }, [r, url, win.app, win.reloadKey]);
  if (r !== 'ok') {
    const t = reachErrorTexts(host, r);
    return <ChromiumErrorPage {...t} onReload={() => reloadWindow(win.id)} />;
  }
  return (
    <AppSlot
      windowId={win.id}
      app={win.app}
      route={win.route}
      params={win.params}
      focused={focused}
      reloadKey={win.reloadKey}
      remountOnReload
    />
  );
}

/* ─────────────────────────────── The window ─────────────────────────────── */

export const WindowFrame = memo(function WindowFrame(props: { win: WindowState; focused: boolean; area: { w: number; h: number } }) {
  const { win, focused, area } = props;
  const meta = APP_META[win.app];
  const light = LIGHT_TITLE.has(win.app);
  const startDrag = useWindowDrag(win.id);
  const startResize = useWindowResize(win.id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const fileDialogHere = useShell((s) => s.fileDialog?.windowId === win.id);
  const r = effectiveRect(win, area);
  const max = win.maximized || !!win.snapped;
  const toLocal = useLocalPoint();

  const style = {
    left: r.x,
    top: r.y,
    width: r.w,
    height: r.h,
    zIndex: win.z,
    display: win.minimized ? 'none' : undefined,
  } as const;

  const onContext = (e: RPointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    e.preventDefault();
    const p = toLocal(e);
    setMenu({ x: p.x - r.x, y: p.y - r.y });
  };

  const isBrowser = meta.chrome === 'browser';
  return (
    <div
      className={`ws-window${focused ? ' ws-window-focused' : ''}${max ? ' ws-window-max' : ''}${light ? ' ws-window-light' : ' ws-window-dark'}`}
      style={style}
      data-window={win.id}
      data-app={win.app}
      role="dialog"
      aria-label={win.title}
      onPointerDownCapture={() => focusWindow(win.id)}
    >
      {isBrowser ? (
        <BrowserFrame
          app={win.app}
          url={displayUrl(win.app, win.route)}
          title={win.title}
          focused={focused}
          canBack={win.historyIndex > 0}
          canForward={win.historyIndex < win.history.length - 1}
          onBack={() => goBack(win.id)}
          onForward={() => goForward(win.id)}
          onReload={() => reloadWindow(win.id)}
          onSubmitUrl={(text) => submitUrl(win, text)}
          onNewTab={() => wmApi.openApp('browser', { route: '/newtab' })}
          onCloseTab={() => closeWindow(win.id)}
          loadingKey={win.navSeq}
          windowControls={<WindowButtons win={win} light />}
          onTabStripPointerDown={startDrag}
          onTabStripDoubleClick={() => toggleMaximize(win.id)}
        >
          <BrowserPage win={win} focused={focused} />
        </BrowserFrame>
      ) : (
        <>
          <div
            className="ws-titlebar"
            onPointerDown={startDrag}
            onDoubleClick={() => toggleMaximize(win.id)}
            onContextMenu={onContext}
          >
            <AppIcon app={win.app} size={16} className="ws-titleicon" />
            <span className="ws-titletext">{win.title}</span>
            <WindowButtons win={win} light={light} />
          </div>
          <div className="ws-client">
            <AppSlot
              windowId={win.id}
              app={win.app}
              route={win.route}
              params={win.params}
              focused={focused}
              reloadKey={win.reloadKey}
              remountOnReload={false}
            />
          </div>
        </>
      )}
      {fileDialogHere ? <FileDialog /> : null}
      {menu ? <TitleMenu win={win} at={menu} light={light} onClose={() => setMenu(null)} /> : null}
      {!max
        ? EDGES.map((edge) => <div key={edge} className={`ws-rz ws-rz-${edge}`} onPointerDown={startResize(edge)} />)
        : null}
    </div>
  );
});

/** Address bar submit: same app → navigate this window; other app → open/focus that app (Apps §1.4). */
export function submitUrl(win: WindowState, text: string): void {
  const t = text.trim();
  // Plain words → a web search (the lab VLAN has no internet: the Browser shows "No internet").
  if (/\s/.test(t) || !/[.:/]/.test(t)) text = `https://www.google.com/search?q=${encodeURIComponent(t)}`;
  const r = resolveUrl(text);
  if (r.app === win.app) {
    navigate(win.id, r.route);
    return;
  }
  if (win.app === 'browser' && win.route === '/newtab' && r.app === 'browser') {
    navigate(win.id, r.route);
    return;
  }
  wmApi.openApp(r.app, r.app === 'browser' ? { url: r.route } : { route: r.route });
}
