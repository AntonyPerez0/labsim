/**
 * Start menu (Apps §1.2): search, Pinned grid, All apps, Recommended (last opened routes), user tile, power menu.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { APP_IDS, APP_META, type AppId } from '../apps';
import { AppIcon, Glyph } from './icons';
import { LOCKED_TEXT } from './gating';
import { setPopup, useShell, wmApi } from './wmStore';

const PINNED_ORDER: AppId[] = ['files', 'browser', 'orca', 'jenkins', 'github', 'intellij', 'terminal', 'chat', 'camera', 'dashboard', 'gimp', 'ollama', 'cardreader'];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

export function StartMenu(props: { onStandUp(): void; isUnlocked(app: AppId): boolean }) {
  const { isUnlocked } = props;
  const [q, setQ] = useState('');
  const [allApps, setAllApps] = useState(false);
  const [power, setPower] = useState(false);
  const [active, setActive] = useState(0);
  const recent = useShell((s) => s.recent);
  const playerName = useGame((s) => s.progress.playerName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    // Windows ranks prefix matches first: "ter" → Terminal before Orchestrator (alias "jhipster").
    const score = (id: AppId): number => {
      const m = APP_META[id];
      const names = [m.title.toLowerCase(), m.iconLabel.toLowerCase()];
      if (names.some((n) => n.startsWith(t))) return 0;
      if (m.aliases.some((a) => a.startsWith(t))) return 1;
      if (names.some((n) => n.split(/[\s-]+/).some((w) => w.startsWith(t)))) return 2;
      if (names.some((n) => n.includes(t)) || m.aliases.some((a) => a.includes(t))) return 3;
      return -1;
    };
    return APP_IDS.map((id) => [id, score(id)] as const)
      .filter(([, sc]) => sc >= 0)
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
  }, [q]);

  const launch = (id: AppId, route?: string) => {
    setPopup(null);
    if (!isUnlocked(id)) {
      wmApi.notify({ app: 'desktop', title: LOCKED_TEXT, body: APP_META[id].title });
      return;
    }
    wmApi.openApp(id, route ? { route } : {});
  };

  const alpha = [...APP_IDS].sort((a, b) => APP_META[a].title.localeCompare(APP_META[b].title));

  return (
    <div className="ws-flyout ws-start" role="dialog" aria-label="Start" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ws-start-search">
        <Glyph.search size={14} />
        <input
          ref={inputRef}
          value={q}
          placeholder="Type here to search"
          aria-label="Type here to search"
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, Math.max(0, results.length - 1)));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter' && results[active]) {
              e.preventDefault();
              launch(results[active]!);
            }
          }}
        />
      </div>
      <div className="ws-start-body">
        {q.trim() ? (
          <>
            <div className="ws-start-head">Best match</div>
            <div className="ws-start-list">
              {results.length ? (
                results.map((id, i) => (
                  <button key={id} type="button" className={`ws-start-row${i === active ? ' ws-start-row-active' : ''}`} onClick={() => launch(id)}>
                    <AppIcon app={id} size={24} />
                    <span>
                      {APP_META[id].title}
                      <small style={{ display: 'block', color: '#ffffff90', fontSize: 11 }}>{isUnlocked(id) ? 'App' : LOCKED_TEXT}</small>
                    </span>
                  </button>
                ))
              ) : (
                <div className="ws-start-empty">No results for “{q.trim()}”</div>
              )}
            </div>
          </>
        ) : allApps ? (
          <>
            <div className="ws-start-head">
              <span>All apps</span>
              <button type="button" className="ws-start-more" onClick={() => setAllApps(false)}>
                ‹ Back
              </button>
            </div>
            <div className="ws-start-list">
              {alpha.map((id, i) => {
                const letter = APP_META[id].title[0]!.toUpperCase();
                const prev = i > 0 ? APP_META[alpha[i - 1]!].title[0]!.toUpperCase() : '';
                return (
                  <div key={id} style={{ display: 'contents' }}>
                    {letter !== prev ? <div className="ws-start-letter">{letter}</div> : null}
                    <button type="button" className="ws-start-row" onClick={() => launch(id)} style={isUnlocked(id) ? undefined : { opacity: 0.45 }}>
                      <AppIcon app={id} size={24} />
                      {APP_META[id].title}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <div className="ws-start-head">
              <span>Pinned</span>
              <button type="button" className="ws-start-more" onClick={() => setAllApps(true)}>
                All apps ›
              </button>
            </div>
            <div className="ws-start-grid">
              {PINNED_ORDER.map((id) => (
                <button
                  key={id}
                  type="button"
                  className="ws-start-tile"
                  title={isUnlocked(id) ? APP_META[id].title : LOCKED_TEXT}
                  style={isUnlocked(id) ? undefined : { opacity: 0.45 }}
                  onClick={() => launch(id)}
                >
                  <AppIcon app={id} size={32} />
                  <span>{APP_META[id].iconLabel}</span>
                </button>
              ))}
            </div>
            <div className="ws-start-head" style={{ marginTop: 20 }}>
              <span>Recommended</span>
            </div>
            {recent.length ? (
              <div className="ws-start-rec">
                {recent.slice(0, 6).map((r) => (
                  <button key={`${r.app}${r.route}`} type="button" className="ws-start-row" onClick={() => launch(r.app, r.route)}>
                    <AppIcon app={r.app} size={24} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title}
                      <small>{APP_META[r.app].title}</small>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="ws-start-empty">The more you use the workstation, the more recent items will show up here.</div>
            )}
          </>
        )}
      </div>
      <div className="ws-start-foot">
        <div className="ws-user">
          <span className="ws-avatar">{initialsOf(playerName)}</span>
          <span>{playerName}</span>
        </div>
        <button type="button" className="ws-tray-btn" aria-label="Power" onClick={() => setPower((p) => !p)}>
          <Glyph.power size={18} />
        </button>
        {power ? (
          <div className="ws-ctx ws-powermenu" role="menu">
            <button type="button" role="menuitem" className="ws-ctx-item" onClick={props.onStandUp}>
              <span>Stand up</span>
              <span className="ws-ctx-key">Esc</span>
            </button>
            <button type="button" role="menuitem" className="ws-ctx-item" onClick={props.onStandUp}>
              <span>Sign out</span>
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
