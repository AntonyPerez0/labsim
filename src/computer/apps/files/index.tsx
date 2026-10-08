/**
 * File Explorer (Apps §12.2) — Windows 11 Explorer look over the workstation file union (§1.6).
 * Route `/dir/<path>`. Double-click: images → GIMP, files inside a clone → IntelliJ, text → preview pane.
 * Context menu: Open, Open with ▸ GIMP / Ollama WebUI / IntelliJ IDEA, Copy as path. Emits `files.opened`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useGame } from '@/core/store';
import type { LabState } from '@/sim/types';
import { emitAppAction, fmtClock, fmtDate, type AppId, type AppProps } from '../../apps';
import { clipboard as shellClipboard, goBack, goForward, useShell } from '../../shell/wmStore';
import { isImagePath, type FsEntry } from '../../shell/files';
import { Glyph } from '../../shell/icons';
import { FileIcon, NavIcon, Chevron } from './icons';
import { Preview } from './Preview';
import {
  NAV,
  RECYCLE,
  cloneOf,
  crumbs,
  defaultOpen,
  dirFromRoute,
  listing,
  modifiedMs,
  parentDir,
  routeForDir,
  search,
  sizeOf,
  sortEntries,
  typeOf,
  type SortKey,
} from './model';
import './files.css';

type Menu = null | {
  x: number;
  y: number;
  entry: FsEntry | null;
  sub: boolean;
  flip: boolean;
};
type ViewMode = 'details' | 'tiles';

const COLS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Date modified' },
  { key: 'type', label: 'Type' },
  { key: 'size', label: 'Size' },
];

export function FilesApp(props: AppProps) {
  const { windowId, onTitle, navigate, wm } = props;
  const dir = dirFromRoute(props.route);
  const sessionFiles = useShell((s) => s.sessionFiles);
  const history = useShell((s) => {
    const w = s.windows.find((x) => x.id === windowId);
    return w ? `${w.historyIndex}/${w.history.length}` : '0/0';
  });
  const [hIndex, hLen] = history.split('/').map(Number) as [number, number];
  const wsFiles = useGame((s) => s.lab.workstation?.files);
  const repos = useGame((s) => s.lab.repos);
  const nowMs = useGame((s) => Math.floor(s.lab.time.nowMs / 60_000) * 60_000);
  const lab = useMemo(
    () =>
      ({
        workstation: { files: wsFiles ?? {} },
        repos: repos ?? {},
      }) as unknown as LabState,
    [wsFiles, repos],
  );

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({
    key: 'name',
    asc: true,
  });
  const [view, setView] = useState<ViewMode>('details');
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<FsEntry | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [cmd, setCmd] = useState<null | 'sort' | 'view'>(null);
  const [editingAddr, setEditingAddr] = useState(false);
  const [addr, setAddr] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const label = dir === '~' ? 'Home' : dir === RECYCLE ? RECYCLE : (crumbs(dir).at(-1)?.label ?? dir);
  useEffect(() => {
    onTitle?.(`${label} - File Explorer`);
  }, [onTitle, label]);

  useEffect(() => {
    setSelected(null);
    setQuery('');
    setMenu(null);
  }, [dir]);

  const entries = useMemo(() => {
    const list = query.trim() ? search(lab, sessionFiles, dir, query) : listing(lab, sessionFiles, dir);
    return sortEntries(list, sort.key, sort.asc, nowMs);
  }, [lab, sessionFiles, dir, query, sort, nowMs]);

  const go = useCallback((d: string) => navigate?.(routeForDir(d)), [navigate]);

  const openWith = useCallback(
    (e: FsEntry, app: AppId | 'preview') => {
      if (app === 'preview') {
        setPreview(e);
        return;
      }
      const w = wm;
      if (!w) return;
      if (app === 'gimp') w.openApp('gimp', { path: e.path });
      else if (app === 'ollama') w.openApp('ollama', { attach: e.path });
      else if (app === 'intellij') {
        const c = cloneOf(lab, e.path);
        if (!c) return;
        w.openApp('intellij', { repo: c.repo, file: c.file });
      } else w.openApp(app, { path: e.path });
      emitAppAction('files', 'files.opened', { path: e.path, with: app });
    },
    [wm, lab],
  );

  const open = useCallback(
    (e: FsEntry) => {
      if (e.dir) {
        go(e.path);
        return;
      }
      const t = defaultOpen(lab, e);
      if (t.kind === 'app') openWith(e, t.app);
      else if (t.kind === 'preview') setPreview(e);
    },
    [lab, go, openWith],
  );

  const copyPath = (e: FsEntry) => {
    (wm?.clipboard ?? shellClipboard).write(e.path, 'files');
  };

  const onContext = (ev: ReactMouseEvent, entry: FsEntry | null) => {
    ev.preventDefault();
    ev.stopPropagation();
    const r = rootRef.current?.getBoundingClientRect();
    if (entry) setSelected(entry.path);
    const w = r?.width ?? 1000;
    const h = r?.height ?? 700;
    const x = Math.max(4, Math.min(ev.clientX - (r?.left ?? 0), w - 214));
    const y = Math.max(4, Math.min(ev.clientY - (r?.top ?? 0), h - (entry ? 150 : 175)));
    setMenu({ x, y, entry, sub: false, flip: x + 420 > w });
  };

  useEffect(() => {
    if (!menu && !cmd) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest?.('.fx-menu, .fx-cmd-wrap')) return;
      setMenu(null);
      setCmd(null);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu, cmd]);

  const selIndex = entries.findIndex((e) => e.path === selected);
  const onKeyDown = (e: ReactKeyboardEvent) => {
    const t = e.target as HTMLElement;
    const inInput = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
    const consume = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.key === 'Escape') {
      if (menu || cmd) {
        setMenu(null);
        setCmd(null);
        consume();
      } else if (editingAddr) {
        setEditingAddr(false);
        consume();
      } else if (query && inInput) {
        setQuery('');
        consume();
      }
      return;
    }
    if ((e.ctrlKey && (e.key === 'f' || e.key === 'e')) || e.key === 'F3') {
      consume();
      searchRef.current?.focus();
      return;
    }
    if (e.altKey && e.key === 'ArrowLeft') return void (consume(), goBack(windowId));
    if (e.altKey && e.key === 'ArrowRight') return void (consume(), goForward(windowId));
    if (e.altKey && e.key === 'ArrowUp') {
      consume();
      const p = parentDir(dir);
      if (p) go(p);
      return;
    }
    if (inInput) return;
    if (e.key === 'Backspace') return void (consume(), goBack(windowId));
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      consume();
      if (!entries.length) return;
      const i = selIndex < 0 ? 0 : Math.max(0, Math.min(entries.length - 1, selIndex + (e.key === 'ArrowDown' ? 1 : -1)));
      setSelected(entries[i]!.path);
      rootRef.current?.querySelector(`[data-idx="${i}"]`)?.scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      consume();
      if (entries.length) setSelected(entries[e.key === 'Home' ? 0 : entries.length - 1]!.path);
      return;
    }
    if (e.key === 'Enter' && selIndex >= 0) return void (consume(), open(entries[selIndex]!));
    if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c') && selIndex >= 0) return void (consume(), copyPath(entries[selIndex]!));
  };

  const sel = selIndex >= 0 ? entries[selIndex]! : null;
  const selClone = sel ? cloneOf(lab, sel.path) : null;
  const isImg = (e: FsEntry) => isImagePath(e.name) || e.content.startsWith('img:');
  const backOk = hIndex > 0;
  const fwdOk = hIndex < hLen - 1;
  const parent = parentDir(dir);

  const menuEntry = menu?.entry ?? null;
  const contextItems: {
    label: string;
    disabled?: boolean;
    run?: () => void;
    sub?: boolean;
    sep?: boolean;
    bold?: boolean;
  }[] = menuEntry
    ? [
        { label: 'Open', bold: true, run: () => open(menuEntry) },
        ...(menuEntry.dir ? [] : [{ label: 'Open with', sub: true }]),
        { label: '', sep: true },
        { label: 'Copy as path', run: () => copyPath(menuEntry) },
        ...(menuEntry.dir ? [] : [{ label: 'Preview', run: () => setPreview(menuEntry) }]),
      ]
    : [
        { label: 'View', disabled: true },
        { label: 'Sort by', disabled: true },
        { label: '', sep: true },
        { label: 'Refresh', run: () => setSelected(null) },
        { label: 'New', disabled: true },
      ];

  return (
    <div className="fx-root" data-app="files" data-window={windowId} ref={rootRef} onKeyDown={onKeyDown} tabIndex={-1}>
      <div className="fx-navbar">
        <button type="button" className="fx-icon-btn" disabled={!backOk} onClick={() => goBack(windowId)} title="Back (Alt + Left Arrow)" aria-label="Back">
          <Glyph.back size={16} />
        </button>
        <button
          type="button"
          className="fx-icon-btn"
          disabled={!fwdOk}
          onClick={() => goForward(windowId)}
          title="Forward (Alt + Right Arrow)"
          aria-label="Forward"
        >
          <Glyph.forward size={16} />
        </button>
        <button
          type="button"
          className="fx-icon-btn"
          disabled={!parent}
          onClick={() => parent && go(parent)}
          title="Up to parent folder (Alt + Up Arrow)"
          aria-label="Up"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 13V3.5M3.5 8L8 3.5 12.5 8" />
          </svg>
        </button>
        <button type="button" className="fx-icon-btn" onClick={() => setSelected(null)} title="Refresh (F5)" aria-label="Refresh">
          <Glyph.reload size={15} />
        </button>
        <div
          className={`fx-address${editingAddr ? ' is-editing' : ''}`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('.fx-crumb')) return;
            setAddr(dir);
            setEditingAddr(true);
          }}
        >
          {editingAddr ? (
            <input
              className="fx-address-input"
              autoFocus
              value={addr}
              onChange={(e) => setAddr(e.target.value)}
              onBlur={() => setEditingAddr(false)}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  setEditingAddr(false);
                  const v = addr.trim();
                  if (v) go(v === RECYCLE ? RECYCLE : v.replace(/^\/home\/engineer/, '~'));
                }
              }}
              aria-label="Address"
            />
          ) : (
            <>
              <span className="fx-addr-icon">
                <NavIcon kind={dir === RECYCLE ? 'recycle' : 'pc'} />
              </span>
              <Chevron />
              <button type="button" className="fx-crumb" onClick={() => go('~')}>
                This PC
              </button>
              {crumbs(dir).map((c) => (
                <span key={c.path} className="fx-crumb-wrap">
                  <Chevron />
                  <button type="button" className="fx-crumb" onClick={() => go(c.path)}>
                    {c.label}
                  </button>
                </span>
              ))}
            </>
          )}
        </div>
        <label className="fx-search">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${label}`}
            aria-label={`Search ${label}`}
            spellCheck={false}
          />
          <Glyph.search size={14} />
        </label>
      </div>

      <div className="fx-cmdbar">
        <button type="button" className="fx-cmd fx-cmd-new" disabled>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="7" fill="#0f6cbd" />
            <path d="M8 4.5v7M4.5 8h7" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          New <span className="fx-caret">▾</span>
        </button>
        <span className="fx-cmd-sep" />
        <button type="button" className="fx-cmd" disabled={!sel} onClick={() => sel && copyPath(sel)} title="Copy as path (Ctrl+Shift+C)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
            <rect x="5.5" y="5.5" width="8" height="9" rx="1.2" />
            <path d="M3.5 10.5h-.3a1 1 0 01-1-1V2.8a1 1 0 011-1h6.3a1 1 0 011 1v.7" />
          </svg>
          Copy path
        </button>
        <span className="fx-cmd-sep" />
        {(['sort', 'view'] as const).map((k) => (
          <div className="fx-cmd-wrap" key={k}>
            <button
              type="button"
              className={`fx-cmd${cmd === k ? ' is-open' : ''}`}
              onClick={() => setCmd((c) => (c === k ? null : k))}
              aria-haspopup="menu"
              aria-expanded={cmd === k}
            >
              {k === 'sort' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" aria-hidden="true">
                  <path d="M4.5 2.5v11M2.5 11.5l2 2 2-2M11.5 13.5v-11M9.5 4.5l2-2 2 2" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
                  <path d="M2.5 3.5h11M2.5 6.5h11M2.5 9.5h11M2.5 12.5h11" />
                </svg>
              )}
              {k === 'sort' ? 'Sort' : 'View'} <span className="fx-caret">▾</span>
            </button>
            {cmd === k && (
              <div className="fx-menu fx-menu-drop" role="menu">
                {k === 'sort'
                  ? [
                      ...COLS.map((c) => (
                        <button
                          key={c.key}
                          type="button"
                          role="menuitemradio"
                          aria-checked={sort.key === c.key}
                          className="fx-menu-item"
                          onClick={() => (setSort((s) => ({ ...s, key: c.key })), setCmd(null))}
                        >
                          <span className="fx-check">{sort.key === c.key ? '•' : ''}</span>
                          {c.label}
                        </button>
                      )),
                      <div key="sep" className="fx-menu-sep" />,
                      ...[true, false].map((asc) => (
                        <button
                          key={String(asc)}
                          type="button"
                          role="menuitemradio"
                          aria-checked={sort.asc === asc}
                          className="fx-menu-item"
                          onClick={() => (setSort((s) => ({ ...s, asc })), setCmd(null))}
                        >
                          <span className="fx-check">{sort.asc === asc ? '•' : ''}</span>
                          {asc ? 'Ascending' : 'Descending'}
                        </button>
                      )),
                    ]
                  : (['tiles', 'details'] as ViewMode[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        role="menuitemradio"
                        aria-checked={view === v}
                        className="fx-menu-item"
                        onClick={() => (setView(v), setCmd(null))}
                      >
                        <span className="fx-check">{view === v ? '•' : ''}</span>
                        {v === 'tiles' ? 'Large icons' : 'Details'}
                      </button>
                    ))}
              </div>
            )}
          </div>
        ))}
        <span className="fx-cmd-spacer" />
        <button
          type="button"
          className={`fx-cmd${preview ? ' is-on' : ''}`}
          onClick={() => setPreview((p) => (p ? null : sel && !sel.dir ? sel : null))}
          disabled={!preview && (!sel || sel.dir)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" aria-hidden="true">
            <rect x="1.5" y="2.5" width="13" height="11" rx="1.2" />
            <path d="M9.5 2.5v11" />
          </svg>
          Preview
        </button>
      </div>

      <div className="fx-main">
        <nav className="fx-nav" aria-label="Navigation pane">
          {NAV.map((n, i) => (
            <button
              key={n.path}
              type="button"
              className={`fx-nav-item${dir === n.path ? ' is-active' : ''}${i === 1 || i === 6 ? ' fx-nav-gap' : ''}`}
              onClick={() => go(n.path)}
            >
              <NavIcon kind={n.icon} />
              <span>{n.label}</span>
            </button>
          ))}
        </nav>

        <div className="fx-content" onContextMenu={(e) => onContext(e, null)} onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          {view === 'details' ? (
            <table className="fx-table">
              <colgroup>
                <col className="fx-col-name" />
                <col className="fx-col-date" />
                <col className="fx-col-type" />
                <col className="fx-col-size" />
              </colgroup>
              <thead>
                <tr>
                  {COLS.map((c) => (
                    <th
                      key={c.key}
                      className={c.key === 'size' ? 'fx-num' : undefined}
                      onClick={() =>
                        setSort((s) => ({
                          key: c.key,
                          asc: s.key === c.key ? !s.asc : true,
                        }))
                      }
                      aria-sort={sort.key === c.key ? (sort.asc ? 'ascending' : 'descending') : 'none'}
                    >
                      {sort.key === c.key && <span className="fx-sort-ind">{sort.asc ? '⌃' : '⌄'}</span>}
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => {
                  const ms = modifiedMs(e, nowMs);
                  return (
                    <tr
                      key={e.path}
                      data-idx={i}
                      className={selected === e.path ? 'is-selected' : undefined}
                      onMouseDown={() => setSelected(e.path)}
                      onDoubleClick={() => open(e)}
                      onContextMenu={(ev) => onContext(ev, e)}
                      title={query ? e.path : undefined}
                    >
                      <td className="fx-name">
                        <FileIcon entry={e} />
                        <span>{e.name}</span>
                      </td>
                      <td className="fx-dim">{`${fmtDate(ms)} ${fmtClock(ms)}`}</td>
                      <td className="fx-dim">{typeOf(e)}</td>
                      <td className="fx-dim fx-num">{sizeOf(e)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="fx-tiles">
              {entries.map((e, i) => (
                <button
                  key={e.path}
                  type="button"
                  data-idx={i}
                  className={`fx-tile${selected === e.path ? ' is-selected' : ''}`}
                  onMouseDown={() => setSelected(e.path)}
                  onDoubleClick={() => open(e)}
                  onContextMenu={(ev) => onContext(ev, e)}
                >
                  <FileIcon entry={e} size={48} />
                  <span className="fx-tile-name">{e.name}</span>
                </button>
              ))}
            </div>
          )}
          {!entries.length && <div className="fx-empty">{query ? 'No items match your search.' : 'This folder is empty.'}</div>}
        </div>

        {preview && <Preview entry={preview} onClose={() => setPreview(null)} />}
      </div>

      <div className="fx-status">
        <span>
          {entries.length} item{entries.length === 1 ? '' : 's'}
        </span>
        {sel && (
          <span>
            1 item selected{sel.dir ? '' : `  ${sizeOf(sel)}`}
            {selClone ? `  ·  ${selClone.repo} (read-only clone — open in IntelliJ IDEA to edit)` : ''}
          </span>
        )}
      </div>

      {menu && (
        <div className="fx-menu fx-context" role="menu" style={{ left: menu.x, top: menu.y }}>
          {contextItems.map((it, i) =>
            it.sep ? (
              <div key={`s${i}`} className="fx-menu-sep" />
            ) : it.sub && menuEntry ? (
              <div key={it.label} className="fx-sub-wrap" onMouseEnter={() => setMenu((m) => (m ? { ...m, sub: true } : m))}>
                <button type="button" className="fx-menu-item" onClick={() => setMenu((m) => (m ? { ...m, sub: !m.sub } : m))}>
                  <span className="fx-check" />
                  Open with <span className="fx-sub-arrow">›</span>
                </button>
                {menu.sub && (
                  <div className={`fx-menu fx-submenu${menu.flip ? ' is-flipped' : ''}`} role="menu">
                    {(
                      [
                        ['gimp', 'GIMP', isImg(menuEntry)],
                        ['ollama', 'Ollama WebUI', isImg(menuEntry)],
                        ['intellij', 'IntelliJ IDEA', !!cloneOf(lab, menuEntry.path)],
                      ] as [AppId, string, boolean][]
                    ).map(([app, name, ok]) => (
                      <button key={app} type="button" className="fx-menu-item" disabled={!ok} onClick={() => (setMenu(null), openWith(menuEntry, app))}>
                        <span className="fx-check" />
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                key={it.label}
                type="button"
                className={`fx-menu-item${it.bold ? ' is-bold' : ''}`}
                disabled={it.disabled}
                onMouseEnter={() => setMenu((m) => (m ? { ...m, sub: false } : m))}
                onClick={() => (setMenu(null), it.run?.())}
              >
                <span className="fx-check" />
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
