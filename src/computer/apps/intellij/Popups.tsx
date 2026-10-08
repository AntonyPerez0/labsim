/**
 * Navigation popups (Apps §4.5): Search Everywhere / Go to File, Recent Files, Find in Files, Go to Line:Column,
 * Context Actions (Alt+Enter).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { findInFiles } from './find';
import { FileIcon, IcBulb, IcSearch } from './icons';

export interface ActionEntry {
  label: string;
  kbd?: string;
  run(): void;
}

interface PopupRow {
  key: string;
  icon?: ReactNode;
  label: ReactNode;
  dim?: ReactNode;
  run(): void;
}

function PopupList({ rows, active, setActive }: { rows: PopupRow[]; active: number; setActive(i: number): void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    ref.current?.querySelectorAll('[data-prow]')[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  return (
    <div className="ij-list" ref={ref} role="listbox">
      {rows.map((r, i) => (
        <div key={r.key} data-prow role="option" aria-selected={i === active} className={`ij-list-row${i === active ? ' ij-active' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => (e.preventDefault(), r.run())}>
          {r.icon}
          <span>{r.label}</span>
          {r.dim ? <span className="ij-dim">{r.dim}</span> : null}
        </div>
      ))}
      {!rows.length ? <div className="ij-list-row ij-dim">Nothing found</div> : null}
    </div>
  );
}

function usePopupKeys(rows: PopupRow[], onClose: () => void) {
  const [active, setActive] = useState(0);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') setActive(Math.min(rows.length - 1, active + 1));
    else if (e.key === 'ArrowUp') setActive(Math.max(0, active - 1));
    else if (e.key === 'Enter') rows[active]?.run();
    else if (e.key === 'Escape') onClose();
    else {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  return { active: Math.min(active, Math.max(0, rows.length - 1)), setActive, onKeyDown };
}

function fuzzy(name: string, q: string): boolean {
  if (!q) return true;
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n.includes(query)) return true;
  // CamelHumps: "TT" → TaxTest
  let i = 0;
  for (const ch of name) if (i < q.length && ch === q[i]) i++;
  if (i === q.length && /[A-Z]/.test(q)) return true;
  let j = 0;
  for (const ch of n) if (j < query.length && ch === query[j]) j++;
  return j === query.length && query.length >= 3;
}

export function SearchEverywhere(props: { mode: 'all' | 'classes' | 'files' | 'actions'; paths: string[]; actions: ActionEntry[]; onOpen(path: string): void; onClose(): void }) {
  const [mode, setMode] = useState(props.mode);
  const [q, setQ] = useState('');
  const rows: PopupRow[] = useMemo(() => {
    const out: PopupRow[] = [];
    const term = q.trim();
    if (mode !== 'actions') {
      const files = props.paths
        .filter((p) => !p.endsWith('/'))
        .filter((p) => (mode === 'classes' ? p.endsWith('.java') : true))
        .filter((p) => fuzzy(p.split('/').pop()!.replace(mode === 'classes' ? /\.java$/ : /$^/, ''), term))
        .sort((a, b) => a.split('/').pop()!.length - b.split('/').pop()!.length || a.localeCompare(b))
        .slice(0, 60);
      for (const p of files)
        out.push({ key: p, icon: <FileIcon path={p} />, label: mode === 'classes' ? p.split('/').pop()!.replace(/\.java$/, '') : p.split('/').pop(), dim: p.split('/').slice(0, -1).join('/'), run: () => props.onOpen(p) });
    }
    if (mode === 'actions' || (mode === 'all' && term)) {
      for (const a of props.actions.filter((x) => fuzzy(x.label, term)).slice(0, 30))
        out.push({
          key: `a:${a.label}`,
          label: a.label,
          dim: a.kbd,
          run: () => {
            props.onClose();
            a.run();
          },
        });
    }
    return out;
  }, [q, mode, props]);
  const keys = usePopupKeys(rows, props.onClose);
  const tabs: [typeof mode, string][] = [
    ['all', 'All'],
    ['classes', 'Classes'],
    ['files', 'Files'],
    ['actions', 'Actions'],
  ];
  return (
    <div className="ij-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="ij-popup" role="dialog" aria-label="Search Everywhere" onKeyDown={keys.onKeyDown}>
        <div className="ij-popup-head">
          {tabs.map(([m, l]) => (
            <button key={m} type="button" className={`ij-tw-tab${mode === m ? ' ij-on' : ''}`} onMouseDown={(e) => (e.preventDefault(), setMode(m))}>
              {l}
            </button>
          ))}
        </div>
        <div className="ij-popup-search">
          <IcSearch />
          <input
            autoFocus
            value={q}
            aria-label="Search"
            onChange={(e) => {
              setQ(e.target.value);
              keys.setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const i = tabs.findIndex(([m]) => m === mode);
                setMode(tabs[(i + (e.shiftKey ? 3 : 1)) % 4][0]);
              }
            }}
          />
        </div>
        <PopupList rows={rows} active={keys.active} setActive={keys.setActive} />
      </div>
    </div>
  );
}

export function RecentFilesPopup(props: { recent: string[]; onOpen(path: string): void; onClose(): void }) {
  const rows = props.recent.map((p) => ({ key: p, icon: <FileIcon path={p} />, label: p.split('/').pop(), dim: p.split('/').slice(0, -1).join('/'), run: () => props.onOpen(p) }));
  const keys = usePopupKeys(rows, props.onClose);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="ij-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="ij-popup" style={{ width: 460 }} role="dialog" aria-label="Recent Files" tabIndex={-1} ref={ref} onKeyDown={keys.onKeyDown}>
        <div className="ij-popup-head" style={{ padding: '6px 10px' }}>
          <b>Recent Files</b>
        </div>
        <PopupList rows={rows} active={keys.active} setActive={keys.setActive} />
      </div>
    </div>
  );
}

export function FindInFilesPopup(props: { files: Record<string, string>; initial?: string; onOpen(path: string, line: number, col: number): void; onClose(): void }) {
  const [q, setQ] = useState(props.initial ?? '');
  const [mc, setMc] = useState(false);
  const [w, setW] = useState(false);
  const [re, setRe] = useState(false);
  const hits = useMemo(() => findInFiles(props.files, { query: q, matchCase: mc, words: w, regex: re }), [props.files, q, mc, w, re]);
  const rows: PopupRow[] = hits.map((h) => ({
    key: `${h.path}:${h.line}`,
    icon: <FileIcon path={h.path} />,
    label: (
      <>
        {h.path.split('/').pop()} <span className="ij-dim">{h.line}</span>
        {'  '}
        {h.text}
      </>
    ),
    run: () => props.onOpen(h.path, h.line, h.col),
  }));
  const keys = usePopupKeys(rows, props.onClose);
  return (
    <div className="ij-backdrop" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="ij-popup" style={{ width: 760 }} role="dialog" aria-label="Find in Files" onKeyDown={keys.onKeyDown}>
        <div className="ij-popup-head" style={{ padding: '6px 10px', justifyContent: 'space-between' }}>
          <b>Find in Files</b>
          <span className="ij-dim">
            {hits.length} match{hits.length === 1 ? '' : 'es'} in {new Set(hits.map((h) => h.path)).size} file{new Set(hits.map((h) => h.path)).size === 1 ? '' : 's'}
          </span>
        </div>
        <div className="ij-popup-search">
          <IcSearch />
          <input autoFocus value={q} aria-label="Text to find" onChange={(e) => (setQ(e.target.value), keys.setActive(0))} />
          <button type="button" className={`ij-toggle${mc ? ' ij-on' : ''}`} title="Match Case" aria-pressed={mc} onMouseDown={(e) => (e.preventDefault(), setMc(!mc))}>
            Cc
          </button>
          <button type="button" className={`ij-toggle${w ? ' ij-on' : ''}`} title="Words" aria-pressed={w} onMouseDown={(e) => (e.preventDefault(), setW(!w))}>
            W
          </button>
          <button type="button" className={`ij-toggle${re ? ' ij-on' : ''}`} title="Regex" aria-pressed={re} onMouseDown={(e) => (e.preventDefault(), setRe(!re))}>
            .*
          </button>
        </div>
        <PopupList rows={rows} active={keys.active} setActive={keys.setActive} />
      </div>
    </div>
  );
}

export function GotoLineDialog(props: { line: number; col: number; onGo(line: number, col: number): void; onClose(): void }) {
  const [v, setV] = useState(`${props.line}:${props.col}`);
  const go = () => {
    const m = /^\s*(\d+)?\s*(?::\s*(\d+))?\s*$/.exec(v);
    if (!m || !m[1]) return;
    props.onGo(Number(m[1]), Number(m[2] ?? 1));
  };
  return (
    <Dialog
      title="Go to Line:Column"
      onCancel={props.onClose}
      onOk={go}
      footer={
        <>
          <button type="button" className="ij-btn ij-default" onClick={go}>
            OK
          </button>
          <button type="button" className="ij-btn" onClick={props.onClose}>
            Cancel
          </button>
        </>
      }
    >
      <div className="ij-form">
        <label htmlFor="ij-gotoline">[Line] [:column]:</label>
        <input
          id="ij-gotoline"
          className="ij-field-input"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
        />
      </div>
    </Dialog>
  );
}

export interface ContextAction {
  label: string;
  run(): void;
  primary?: boolean;
}

export function ContextActionsPopup(props: { actions: ContextAction[]; anchor?: { x: number; y: number } | null; onClose(): void }) {
  const rows: PopupRow[] = props.actions.map((a) => ({
    key: a.label,
    icon: a.primary ? <IcBulb size={14} /> : <span style={{ width: 14 }} />,
    label: a.label,
    run: () => {
      props.onClose();
      a.run();
    },
  }));
  const keys = usePopupKeys(rows, props.onClose);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="ij-backdrop" style={props.anchor ? { background: 'transparent', padding: 0, display: 'block' } : { background: 'transparent' }} onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div
        className="ij-popup"
        style={props.anchor ? { width: 380, position: 'absolute', left: Math.max(4, props.anchor.x), top: Math.max(4, props.anchor.y) } : { width: 380 }}
        role="dialog"
        aria-label="Context Actions"
        tabIndex={-1}
        ref={ref}
        onKeyDown={keys.onKeyDown}
      >
        <PopupList rows={rows} active={keys.active} setActive={keys.setActive} />
      </div>
    </div>
  );
}
