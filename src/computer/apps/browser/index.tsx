/**
 * Browser — the generic Chromium window (docs/design/50-computer-apps.md §12.3): New tab page (`/newtab`)
 * and raw pages for any URL the host table does not own (route = the full URL). Raw responses come from
 * `sim.net.request` (contract delta D9) when it exists; until then reachability (§0.5) decides the error.
 */
import { useEffect, useMemo, useState } from 'react';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import type { RestResponse } from '@/sim';
import { emitAppAction, getImage, peekImage, resolveUrl, type AppProps, type ImageEntry } from '../../apps';
import { BOOKMARKS, ChromiumErrorPage } from '../../shell/BrowserFrame';
import { AppIcon, Glyph } from '../../shell/icons';
import { reach, reachErrorTexts } from '../../shell/reach';
import './browser-app.css';

type NetApi = { request?: (method: string, url: string, body?: string | null) => RestResponse };

/** Hosts reachable only through the internet (the lab VLAN has none except github.com). */
function isInternetHost(host: string): boolean {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return false;
  if (/\.lab\.local$/i.test(host) || /^localhost$/i.test(host)) return false;
  if (/(^|\.)github\.com$/i.test(host)) return false;
  return host.includes('.');
}

function parseUrl(url: string): { host: string; port: number | null; path: string; scheme: string } | null {
  const m = /^(https?):\/\/([^/:?#]+)(?::(\d+))?([^#]*)/i.exec(url);
  if (!m) return null;
  return { scheme: m[1]!.toLowerCase(), host: m[2]!, port: m[3] ? Number(m[3]) : null, path: m[4] || '/' };
}

function NewTab(props: { navigate(route: string): void }) {
  const [q, setQ] = useState('');
  const submit = () => {
    const t = q.trim();
    if (!t) return;
    if (/\s/.test(t) || !/[.:/]/.test(t)) props.navigate(`https://www.google.com/search?q=${encodeURIComponent(t)}`);
    else props.navigate(/^[a-z]+:\/\//i.test(t) ? t : `http://${t}`);
  };
  return (
    <div className="br-app-newtab">
      <div className="br-app-logo" aria-hidden="true">
        <svg width="92" height="92" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" fill="#1a73e8" />
          <circle cx="12" cy="12" r="4.4" fill="#fff" />
          <circle cx="12" cy="12" r="3.3" fill="#1a73e8" />
        </svg>
      </div>
      <form
        className="br-app-search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Glyph.search size={18} />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Google or type a URL" aria-label="Search Google or type a URL" />
      </form>
      <div className="br-app-tiles">
        {BOOKMARKS.map((b) => (
          <button key={b.label} type="button" className="br-app-tile" onClick={() => props.navigate(b.url)} title={b.url}>
            <span className="br-app-tile-icon">
              <AppIcon app={b.app} size={24} />
            </span>
            <span className="br-app-tile-label">{b.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function NoInternet() {
  return (
    <div className="br-error" role="alert">
      <div className="br-error-inner">
        <div className="br-error-icon">
          <svg width="72" height="72" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2 8.5a15 15 0 0120 0M5 12a10 10 0 0114 0M8.5 15.5a5 5 0 017 0" stroke="#5f6368" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            <circle cx="12" cy="19" r="1.4" fill="#5f6368" />
            <path d="M3 3l18 18" stroke="#5f6368" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
        <h1 className="br-error-title">No internet</h1>
        <p className="br-error-try">Try:</p>
        <ul className="br-error-list">
          <li>Checking the network cables, modem, and router</li>
          <li>Reconnecting to Wi-Fi</li>
        </ul>
        <div className="br-error-code">ERR_INTERNET_DISCONNECTED</div>
      </div>
    </div>
  );
}

function JsonView(props: { body: string }) {
  const [prettyOn, setPretty] = useState(false);
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(props.body), null, 2);
    } catch {
      return null;
    }
  }, [props.body]);
  return (
    <div className="br-app-raw">
      {pretty ? (
        <label className="br-app-pretty">
          <input type="checkbox" checked={prettyOn} onChange={(e) => setPretty(e.target.checked)} /> Pretty-print
        </label>
      ) : null}
      <pre>{prettyOn && pretty ? pretty : props.body}</pre>
    </div>
  );
}

function ImageView(props: { ref_: string }) {
  const [img, setImg] = useState<ImageEntry | null>(() => peekImage(props.ref_));
  useEffect(() => {
    let alive = true;
    void getImage(props.ref_).then((e) => alive && setImg(e));
    return () => {
      alive = false;
    };
  }, [props.ref_]);
  return <div className="br-app-image">{img ? <img src={img.dataUrl} alt="" width={img.width} height={img.height} /> : null}</div>;
}

function RawPage(props: { url: string; reloadKey: number }) {
  const { url } = props;
  const u = parseUrl(url);
  // Reachability is re-evaluated on reload and every 2 s while an error is shown.
  const [tick, setTick] = useState(0);
  const internet = !!u && isInternetHost(u.host);
  const net = (sim as unknown as { net?: NetApi }).net;
  const result = useMemo(() => {
    if (!u) return { kind: 'error' as const, err: 'unknown' as const };
    if (internet) return { kind: 'nointernet' as const };
    const port = u.port ?? (u.scheme === 'https' ? 443 : 80);
    const r = reach(getState().lab, u.host, port);
    if (r !== 'ok') return { kind: 'error' as const, err: r };
    if (net?.request) {
      try {
        const res = net.request('GET', url);
        return { kind: 'ok' as const, res };
      } catch (err) {
        console.warn('[browser] net.request threw', err);
      }
    }
    return { kind: 'empty' as const };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, props.reloadKey, tick, internet]);

  useEffect(() => {
    if (result.kind !== 'error') return;
    emitAppAction('browser', 'browser.page.unreachable', { url, error: result.err });
    const t = setInterval(() => setTick((x) => x + 1), 2000);
    return () => clearInterval(t);
  }, [result.kind, url, props.reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (result.kind === 'nointernet') return <NoInternet />;
  if (result.kind === 'error') return <ChromiumErrorPage {...reachErrorTexts(u?.host ?? url, result.err)} />;
  if (result.kind === 'empty') return <ChromiumErrorPage title="This page isn’t working" sub={`${u!.host} didn’t send any data.`} code="ERR_EMPTY_RESPONSE" />;
  const res = result.res;
  const ctype = (res.headers?.['content-type'] ?? res.headers?.['Content-Type'] ?? '').toLowerCase();
  if (ctype.startsWith('image/') && res.body.startsWith('img:')) return <ImageView ref_={res.body.trim()} />;
  const looksJson = ctype.includes('json') || /^\s*[[{]/.test(res.body);
  if (looksJson) return <JsonView body={res.body} />;
  return (
    <div className="br-app-raw">
      <pre>{res.body}</pre>
    </div>
  );
}

export function BrowserApp(props: AppProps) {
  const route = props.route ?? '/newtab';
  const navigate = props.navigate ?? (() => undefined);
  const isNew = route === '/newtab' || !/^[a-z]+:\/\//i.test(route);
  const go = (url: string) => {
    const r = resolveUrl(url);
    if (r.app === 'browser') navigate(r.route);
    else props.wm?.openApp(r.app, { route: r.route });
  };
  useEffect(() => {
    props.onTitle?.(isNew ? 'New Tab' : route.replace(/^[a-z]+:\/\//i, ''));
  }, [isNew, route]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="br-app-root" data-app="browser" data-window={props.windowId}>
      {isNew ? <NewTab navigate={go} /> : <RawPage key={props.reloadKey ?? 0} url={route} reloadKey={props.reloadKey ?? 0} />}
    </div>
  );
}
