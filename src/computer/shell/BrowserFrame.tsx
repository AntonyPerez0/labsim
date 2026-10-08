/**
 * Chromium-like browser chrome (Apps §1.4) — tab strip (= title bar), toolbar with back/forward/reload and the
 * address bar, bookmarks bar, loading bar, and the page slot.
 *
 * FOR APP BUILDERS (Orca, Jenkins, GitHub, Ollama, Browser): inside the desktop the SHELL draws this frame around
 * every `chrome: 'browser'` app automatically (`WindowFrame` → `BrowserFrame`). Your app renders ONLY the page:
 * a pure function of `props.route`, moving with `props.navigate(route)`; set the tab title with `props.onTitle()`.
 * Do not render your own address bar or tabs.
 *
 * Exports:
 *  - `BrowserFrame`        the presentational chrome (used by the shell's WindowFrame).
 *  - `ChromiumErrorPage`   "This site can't be reached" (Apps §0.5) — reuse it for app-level network errors.
 *  - `BrowserSandbox`      a standalone host (local history, emits `app.navigated`) to mount one browser app
 *                          outside the desktop, e.g. in a sandbox page or a unit test:
 *                          `<BrowserSandbox app="jenkins" component={JenkinsApp} initialRoute="/" />`.
 *  - `displayUrl(app, route)` the URL shown in the address bar for a route.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { emit, useGame } from '@/core/store';
import { APP_META, resolveUrl, type AppId, type AppProps } from '../apps';
import { AppIcon, Glyph } from './icons';
import { wmApi } from './wmStore';
import './browser.css';

/* ─────────────────────────────── URL helpers ─────────────────────────────── */

/** Full URL for a browser-hosted app route ("http://orca.lab.local:8080/robot?status.in=AVAILABLE"). */
export function displayUrl(app: AppId, route: string): string {
  if (app === 'browser') return route === '/newtab' ? '' : route;
  const origin = APP_META[app]?.origin;
  if (!origin) return route;
  return origin + (route.startsWith('/') ? route : `/${route}`);
}

function splitUrl(url: string): { scheme: string; host: string; rest: string } {
  const m = /^([a-z]+:\/\/)?([^/?#]*)(.*)$/i.exec(url);
  return { scheme: m?.[1] ?? '', host: m?.[2] ?? url, rest: m?.[3] ?? '' };
}

export const BOOKMARKS: { label: string; url: string; app: AppId }[] = [
  { label: 'Orchestrator', url: 'http://orca.lab.local:8080/', app: 'orca' },
  { label: 'Jenkins', url: 'http://jenkins.lab.local:8080/', app: 'jenkins' },
  { label: 'labsim-lab', url: 'https://github.com/labsim-lab', app: 'github' },
  { label: 'Vision PoC', url: 'http://10.42.1.12:3000/', app: 'ollama' },
  { label: 'Rack B cam', url: 'http://10.42.10.40:8081/stream.mjpg', app: 'camera' },
  { label: 'Ollama API', url: 'http://10.42.1.12:11434/api/tags', app: 'browser' },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

/* ─────────────────────────────── The chrome ─────────────────────────────── */

export interface BrowserFrameProps {
  app: AppId;
  /** Full URL of the page ('' for the new-tab page). */
  url: string;
  title: string;
  canBack: boolean;
  canForward: boolean;
  onBack(): void;
  onForward(): void;
  onReload(): void;
  /** Address bar / bookmark submit (raw text as typed, or a full URL). */
  onSubmitUrl(text: string): void;
  /** `+` button (opens a Browser window on the new-tab page). */
  onNewTab?(): void;
  /** Tab ✕ (closes the window). */
  onCloseTab?(): void;
  /** Changes on every navigation → the 2 px loading bar runs. */
  loadingKey?: number;
  focused?: boolean;
  /** Window buttons drawn at the right end of the tab strip. */
  windowControls?: ReactNode;
  /** Title-bar drag on the blank tab-strip area. */
  onTabStripPointerDown?(e: PointerEvent<HTMLDivElement>): void;
  onTabStripDoubleClick?(): void;
  children: ReactNode;
}

export function BrowserFrame(props: BrowserFrameProps) {
  const { app, url, title, canBack, canForward, onBack, onForward, onReload, onSubmitUrl, loadingKey } = props;
  const playerName = useGame((s) => s.progress.playerName);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(url);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setText(url);
  }, [url, editing]);

  const focusAddress = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, []);

  // Window-level shortcuts while this frame's window is focused (Ctrl+L / Alt+D, F5 / Ctrl+R, Alt+←/→).
  useEffect(() => {
    if (!props.focused) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = e.key;
      if ((e.ctrlKey && (k === 'l' || k === 'L')) || (e.altKey && (k === 'd' || k === 'D'))) {
        e.preventDefault();
        focusAddress();
      } else if (k === 'F5' || (e.ctrlKey && (k === 'r' || k === 'R'))) {
        e.preventDefault();
        onReload();
      } else if (e.altKey && k === 'ArrowLeft') {
        e.preventDefault();
        onBack();
      } else if (e.altKey && k === 'ArrowRight') {
        e.preventDefault();
        onForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.focused, focusAddress, onReload, onBack, onForward]);

  const onAddressKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = text.trim();
      setEditing(false);
      inputRef.current?.blur();
      if (v) onSubmitUrl(v);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setText(url);
      setEditing(false);
      inputRef.current?.blur();
    }
  };

  const secure = /^https:/i.test(url);
  const parts = splitUrl(url);
  const shownRest = parts.rest === '/' ? '' : parts.rest;

  return (
    <div
      ref={rootRef}
      className={`br-root${props.focused ? ' br-focused' : ''}`}
      onPointerUp={(e) => {
        if (e.button === 3) onBack();
        else if (e.button === 4) onForward();
      }}
    >
      <div className="br-tabstrip" onPointerDown={props.onTabStripPointerDown} onDoubleClick={props.onTabStripDoubleClick}>
        <div className="br-tab" title={title} onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
          <AppIcon app={app} size={16} className="br-favicon" />
          <span className="br-tab-title">{title || 'New Tab'}</span>
          <button type="button" className="br-tab-close" aria-label="Close tab" onClick={props.onCloseTab}>
            <Glyph.close size={14} />
          </button>
        </div>
        <button
          type="button"
          className="br-newtab"
          aria-label="New tab"
          title="New tab"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={props.onNewTab}
        >
          <Glyph.plus size={14} />
        </button>
        <div className="br-tabstrip-fill" />
        {props.windowControls}
      </div>
      <div className="br-toolbar">
        <button type="button" className="br-tool" aria-label="Back" title="Click to go back" disabled={!canBack} onClick={onBack}>
          <Glyph.back />
        </button>
        <button type="button" className="br-tool" aria-label="Forward" title="Click to go forward" disabled={!canForward} onClick={onForward}>
          <Glyph.forward />
        </button>
        <button type="button" className="br-tool" aria-label="Reload" title="Reload this page" onClick={onReload}>
          <Glyph.reload />
        </button>
        <div className={`br-omnibox${editing ? ' br-omnibox-editing' : ''}`} onClick={() => !editing && focusAddress()}>
          {url && !editing ? (
            secure ? (
              <span className="br-chip br-chip-secure" title="Connection is secure">
                <Glyph.lock size={12} />
              </span>
            ) : (
              <span className="br-chip br-chip-insecure" title="Your connection to this site is not secure">
                <Glyph.info size={14} />
                <span>Not secure</span>
              </span>
            )
          ) : (
            <span className="br-chip br-chip-search">
              <Glyph.search size={14} />
            </span>
          )}
          <span className="br-addrwrap">
            <input
              ref={inputRef}
              className={`br-address${editing || !url ? '' : ' br-address-blurred'}`}
              value={editing ? text : url}
              spellCheck={false}
              placeholder="Search or type a URL"
              aria-label="Address and search bar"
              onFocus={(e) => {
                setEditing(true);
                setText(url);
                const el = e.target;
                requestAnimationFrame(() => el.select());
              }}
              onBlur={() => setEditing(false)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onAddressKey}
            />
            {!editing && url ? (
              <span className="br-address-overlay" aria-hidden="true">
                <span className="br-url-host">{parts.host}</span>
                <span className="br-url-rest">{shownRest}</span>
              </span>
            ) : null}
          </span>
          <span className="br-star" aria-hidden="true">
            <Glyph.star size={15} />
          </span>
        </div>
        <span className="br-profile" title={playerName} aria-hidden="true">
          {initials(playerName)}
        </span>
      </div>
      <div className="br-bookmarks" role="toolbar" aria-label="Bookmarks">
        {BOOKMARKS.map((b) => (
          <button key={b.label} type="button" className="br-bookmark" title={b.url} onClick={() => onSubmitUrl(b.url)}>
            <AppIcon app={b.app} size={14} />
            <span>{b.label}</span>
          </button>
        ))}
      </div>
      <div className="br-loadwrap">{loadingKey ? <div key={loadingKey} className="br-loading" /> : null}</div>
      <div className="br-page">{props.children}</div>
    </div>
  );
}

/* ─────────────────────────────── Error page (Apps §0.5) ─────────────────────────────── */

export function ChromiumErrorPage(props: { title: string; sub: string; code: string; onReload?: () => void }) {
  return (
    <div className="br-error" role="alert">
      <div className="br-error-inner">
        <div className="br-error-icon">
          <svg width="72" height="72" viewBox="0 0 68 64" aria-hidden="true">
            <g stroke="#5f6368" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 6h28l12 12v40H14z" fill="#fff" />
              <path d="M42 6v12h12" />
              <circle cx="26" cy="30" r="1.6" fill="#5f6368" />
              <circle cx="40" cy="30" r="1.6" fill="#5f6368" />
              <path d="M25 44c4-5 12-5 16 0" />
            </g>
          </svg>
        </div>
        <h1 className="br-error-title">{props.title}</h1>
        <p className="br-error-sub">{props.sub}</p>
        <p className="br-error-try">Try:</p>
        <ul className="br-error-list">
          <li>Checking the connection</li>
          <li>Checking the proxy and the firewall</li>
        </ul>
        <div className="br-error-code">{props.code}</div>
        {props.onReload ? (
          <button type="button" className="br-error-reload" onClick={props.onReload}>
            Reload
          </button>
        ) : null}
      </div>
    </div>
  );
}

/* ─────────────────────────────── Standalone host for sandboxes/tests ─────────────────────────────── */

/**
 * Mount one browser-hosted app without the desktop: local history, `app.navigated` on every route change,
 * same chrome. Typed URLs for other apps are handed to the window manager when the desktop is mounted.
 */
export function BrowserSandbox(props: { app: AppId; component: ComponentType<AppProps>; initialRoute?: string; width?: number | string; height?: number | string }) {
  const { app, component: App } = props;
  const [hist, setHist] = useState(() => ({ list: [props.initialRoute ?? APP_META[app].homeRoute], i: 0, nav: 1, reload: 0 }));
  const [title, setTitle] = useState(APP_META[app].title);
  const route = hist.list[hist.i]!;

  useEffect(() => {
    emit('app.navigated', { app, route });
  }, [app, route, hist.nav]);

  const navigate = useCallback((r: string, opts?: { replace?: boolean }) => {
    setHist((h) => {
      if (h.list[h.i] === r) return h;
      if (opts?.replace) {
        const list = h.list.slice();
        list[h.i] = r;
        return { ...h, list };
      }
      const list = [...h.list.slice(0, h.i + 1), r];
      return { ...h, list, i: list.length - 1, nav: h.nav + 1 };
    });
  }, []);

  const appProps = useMemo<AppProps>(
    () => ({ windowId: `sandbox-${app}`, params: {}, onTitle: setTitle, navigate, focused: true, wm: wmApi, embedded: false }),
    [app, navigate],
  );

  return (
    <div style={{ width: props.width ?? '100%', height: props.height ?? '100%', display: 'flex' }}>
      <BrowserFrame
        app={app}
        url={displayUrl(app, route)}
        title={title}
        focused
        canBack={hist.i > 0}
        canForward={hist.i < hist.list.length - 1}
        onBack={() => setHist((h) => (h.i > 0 ? { ...h, i: h.i - 1, nav: h.nav + 1 } : h))}
        onForward={() => setHist((h) => (h.i < h.list.length - 1 ? { ...h, i: h.i + 1, nav: h.nav + 1 } : h))}
        onReload={() => setHist((h) => ({ ...h, reload: h.reload + 1, nav: h.nav + 1 }))}
        onSubmitUrl={(text) => {
          const r = resolveUrl(text);
          if (r.app === app) navigate(r.route);
          else wmApi.openApp(r.app, { route: r.route });
        }}
        loadingKey={hist.nav}
      >
        <App key={hist.reload} {...appProps} route={route} reloadKey={hist.reload} />
      </BrowserFrame>
    </div>
  );
}
