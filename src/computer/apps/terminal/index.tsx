/**
 * Terminal — Windows-Terminal-like host for the sim's bash (docs/design/50-computer-apps.md §5).
 * Tabs (one shell session each, D7), streaming, Ctrl+C, history, completion, nano, copy/paste, scrollback.
 * Route `/tab/:n` (1-based active tab). Embedded mode (IntelliJ tool window): no tab row, Darcula colours.
 * Keep the export name: `APP_META.terminal.exportName === 'TerminalApp'`.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { APP_ROUTES, buildRoute, getWindowManager, matchRoute, type AppProps } from '@/computer/apps';
import { TermView } from './TermView';
import { getWindowModel, releaseIfClosed, TerminalWindowModel } from './windowModel';
import './term.css';

const FONT_KEY = 'labsim.terminal.fontSize';

function loadFontSize(def: number): number {
  try {
    const v = Number(localStorage.getItem(FONT_KEY));
    return v >= 10 && v <= 24 ? v : def;
  } catch {
    return def;
  }
}

function saveFontSize(v: number) {
  try {
    localStorage.setItem(FONT_KEY, String(v));
  } catch {
    /* per-viewer convenience only */
  }
}

const GlyphPrompt = () => <span className="term-tab-glyph">&gt;_</span>;

const IconPlus = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);
const IconChevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.2" fill="none" />
  </svg>
);
const IconClose = () => (
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.1" />
  </svg>
);

export function TerminalApp(props: AppProps) {
  const { windowId, params, onTitle, route, navigate, focused = true } = props;
  const embedded = !!(props.embedded || params?.embedded);
  const key = embedded ? `embedded:${windowId}:${params?.cwd ?? ''}` : windowId;
  const wm = props.wm ?? getWindowManager() ?? undefined;

  // Looked up every render: a model dropped from the registry (window closed) is recreated on demand.
  const model: TerminalWindowModel = (() =>
    getWindowModel(
      key,
      () =>
        new TerminalWindowModel({
          embedded,
          cwd: params?.cwd,
          command: params?.command,
          onEmpty: () => (props.wm ?? getWindowManager())?.close(windowId),
        }),
    ))();
  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  const [menu, setMenu] = useState<null | 'main' | 'settings' | 'about'>(null);
  const [fontSize, setFontSize] = useState(() => loadFontSize(embedded ? 13 : 14));

  // Dispose sessions when the window is really closed (not when the desktop unmounts).
  // (Embedded: the host IDE window's id is the prefix before ':' — the session lives as long as that window.)
  useEffect(() => () => releaseIfClosed(key, embedded ? windowId.split(':')[0] : windowId), [key, windowId, embedded]);

  // Route → active tab.
  const routeTab = (() => {
    if (!route) return null;
    const m = matchRoute(APP_ROUTES.terminal.tab, route);
    const n = m ? Number(m.params.n) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const lastRouted = useRef<string | null>(null);
  useEffect(() => {
    if (embedded || routeTab === null || route === lastRouted.current) return;
    lastRouted.current = route ?? null;
    if (routeTab >= 1 && routeTab <= model.tabs.length) model.activate(routeTab - 1);
  }, [route, routeTab, embedded, model]);

  // Active tab → route (the shell emits app.navigated).
  const activeN = model.active + 1;
  useEffect(() => {
    if (embedded || !navigate) return;
    const want = buildRoute(APP_ROUTES.terminal.tab, { n: activeN });
    if (route !== want) {
      lastRouted.current = want;
      navigate(want, { replace: route == null });
    }
  }, [activeN, embedded, navigate, route, model.tabs.length]);

  // Re-targeted open with a command prefill (missions/hints): put it in the input line, never execute.
  const lastCommand = useRef<string | undefined>(params?.command);
  useEffect(() => {
    if (params?.command && params.command !== lastCommand.current) {
      lastCommand.current = params.command;
      model.current?.prefill(params.command);
    }
  }, [params?.command, model]);

  const current = model.current;
  const title = embedded ? 'Local' : (current?.title ?? 'Terminal');
  // Hosts may pass a fresh `onTitle` each render: report on title changes only.
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  useEffect(() => {
    if (!embedded) onTitleRef.current?.(title);
  }, [title, embedded]);

  const onWindowKey = (e: React.KeyboardEvent): boolean => {
    if (embedded) return false;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (ctrl && e.shiftKey && (k === 'T' || k === 't' || k === '!' || k === '1' || e.code === 'Digit1')) {
      model.newTab();
      return true;
    }
    if (ctrl && e.shiftKey && (k === 'W' || k === 'w')) {
      model.closeTab(model.active);
      return true;
    }
    if ((ctrl && k === 'PageUp') || (e.altKey && k === '[') || (ctrl && e.shiftKey && k === 'Tab')) {
      model.cycle(-1);
      return true;
    }
    if ((ctrl && k === 'PageDown') || (e.altKey && k === ']') || (ctrl && !e.shiftKey && k === 'Tab')) {
      model.cycle(1);
      return true;
    }
    if (ctrl && (k === '=' || k === '+')) {
      const v = Math.min(24, fontSize + 1);
      setFontSize(v);
      saveFontSize(v);
      return true;
    }
    if (ctrl && k === '-') {
      const v = Math.max(10, fontSize - 1);
      setFontSize(v);
      saveFontSize(v);
      return true;
    }
    return false;
  };

  const style = { '--term-size': `${fontSize}px` } as React.CSSProperties;

  return (
    <div
      className={`term-root${embedded ? ' term-embedded' : ''}`}
      data-app="terminal"
      data-window={windowId}
      style={style}
      onKeyDown={(e) => {
        if (menu && e.key === 'Escape') {
          setMenu(null);
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {embedded ? null : (
        <div className="term-tabrow" role="tablist" aria-label="Terminal tabs">
          {model.tabs.map((t, i) => (
            <div
              key={t.id}
              role="tab"
              tabIndex={-1}
              aria-selected={i === model.active}
              className={`term-tab${i === model.active ? ' term-tab-active' : ''}`}
              title={t.title}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  model.closeTab(i);
                } else model.activate(i);
              }}
            >
              <GlyphPrompt />
              <span className="term-tab-title">{t.title}</span>
              <span
                className="term-tab-close"
                role="button"
                aria-label="Close tab"
                onMouseDown={(e) => {
                  e.stopPropagation();
                  model.closeTab(i);
                }}
              >
                <IconClose />
              </span>
            </div>
          ))}
          <button type="button" className="term-iconbtn" aria-label="New tab (Ctrl+Shift+T)" title="New tab (Ctrl+Shift+T)" onClick={() => model.newTab()}>
            <IconPlus />
          </button>
          <button type="button" className="term-iconbtn" aria-label="Open a new tab" aria-haspopup="menu" onClick={() => setMenu(menu ? null : 'main')}>
            <IconChevron />
          </button>
        </div>
      )}
      {menu ? (
        <div className="term-menu" role="menu" style={{ left: Math.min(40 + model.tabs.length * 180, 520) }}>
          {menu === 'main' ? (
            <>
              <button
                type="button"
                role="menuitem"
                className="term-menu-item"
                autoFocus
                onClick={() => {
                  setMenu(null);
                  model.newTab();
                }}
              >
                <GlyphPrompt /> Bash (ws-17)<span className="term-menu-kbd">Ctrl+Shift+1</span>
              </button>
              <div className="term-menu-sep" />
              <button type="button" role="menuitem" className="term-menu-item" onClick={() => setMenu('settings')}>
                Settings<span className="term-menu-kbd">Ctrl+,</span>
              </button>
              <button type="button" role="menuitem" className="term-menu-item" onClick={() => setMenu('about')}>
                About
              </button>
            </>
          ) : menu === 'settings' ? (
            <div className="term-settings">
              <label htmlFor={`term-font-${windowId}`}>
                <span>Font size</span>
                <span>{fontSize}</span>
              </label>
              <input
                id={`term-font-${windowId}`}
                type="range"
                min={10}
                max={24}
                value={fontSize}
                autoFocus
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setFontSize(v);
                  saveFontSize(v);
                }}
              />
            </div>
          ) : (
            <div className="term-about">
              <b>Windows Terminal</b>
              <br />
              Version 1.21.2361.0
              <br />
              Profile: Bash (ws-17) — GNU bash, version 5.1.16
            </div>
          )}
        </div>
      ) : null}
      {current ? (
        <TermView
          key={current.id}
          session={current}
          embedded={embedded}
          focused={focused && !menu}
          wm={wm}
          onWindowKey={onWindowKey}
        />
      ) : null}
      {menu ? <div style={{ position: 'absolute', inset: 0, zIndex: 10 }} onMouseDown={() => setMenu(null)} /> : null}
    </div>
  );
}
