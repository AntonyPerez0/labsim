/**
 * Jenkins chrome (Apps §3.1–§3.2): header with search (Ctrl+K), breadcrumbs with context menus, side panel
 * tasks and the Build Queue / Build Executor Status widgets, footer.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, useGameShallow } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction } from '@/computer/apps';
import { Ball, Butler, Sym, type SymbolName } from './icons';
import { useJk, useNowSec, simTry } from './ctx';
import { buildBall, buildUrl, jobDisplayName, jobUrl, search as searchModel, type SearchHit } from './model';

/* ─────────────────────────── Header + search ─────────────────────────── */

export function Header() {
  const { navigate, playerName, gate, focused } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hits = useMemo(() => (open ? searchModel(jenkins, q, gate) : []), [jenkins, q, gate, open]);

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('pointerdown', off);
    return () => window.removeEventListener('pointerdown', off);
  }, [open]);

  const pick = (h: SearchHit | null) => {
    const query = q.trim();
    if (!query) return;
    emitAppAction('jenkins', 'jenkins.search', { query, results: (h ? [h] : hits).map((x) => x.id) });
    setOpen(false);
    setQ('');
    inputRef.current?.blur();
    navigate(h ? h.route : `/search/?q=${encodeURIComponent(query)}`);
  };

  return (
    <header className="jk-header">
      <a className="jk-brand" href="#/" onClick={(e) => (e.preventDefault(), navigate('/'))}>
        <Butler size={28} />
        Jenkins
      </a>
      <div className="jk-header-spacer" />
      <div className="jk-search" ref={wrapRef}>
        <div className="jk-search-box" onClick={() => inputRef.current?.focus()}>
          <Sym name="search" size={16} />
          <input
            ref={inputRef}
            value={q}
            placeholder="Search (Ctrl+K)"
            aria-label="Search"
            role="combobox"
            aria-expanded={open && !!q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(s + 1, Math.max(0, hits.length - 1)));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                pick(hits[sel] ?? null);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                inputRef.current?.blur();
              }
            }}
          />
          <span className="jk-search-kbd">Ctrl K</span>
        </div>
        {open && q.trim() ? (
          <div className="jk-search-pop" role="listbox">
            {hits.length === 0 ? <div className="jk-search-empty">No results for “{q}”</div> : null}
            {hits.map((h, i) => (
              <button key={h.id} type="button" className="jk-search-item" role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => pick(h)}>
                <Sym name={h.kind === 'folder' ? 'folder' : h.kind === 'view' ? 'views' : h.kind === 'build' ? 'history' : 'play'} size={16} />
                {h.label}
                <small>{h.kind}</small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <button type="button" className="jk-hbtn" title="Notifications" aria-label="Notifications">
        <Sym name="bell" size={20} />
      </button>
      <button type="button" className="jk-hbtn jk-user" onClick={() => navigate('/asynchPeople/')}>
        <Sym name="user" size={20} />
        {playerName}
      </button>
      <button type="button" className="jk-hbtn" onClick={() => navigate('/', { replace: true })} title="log out">
        <Sym name="logout" size={18} />
        log out
      </button>
    </header>
  );
}

/* ─────────────────────────── Breadcrumbs ─────────────────────────── */

export interface Crumb {
  label: string;
  route?: string;
  /** Context menu entries (job/folder dropdown). */
  menu?: { label: string; icon: SymbolName; route: string }[];
}

export function Breadcrumbs(props: { crumbs: Crumb[] }) {
  const { navigate } = useJk();
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open == null) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(null);
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [open]);
  return (
    <nav className="jk-crumbs" aria-label="breadcrumb" ref={ref}>
      {props.crumbs.map((c, i) => (
        <span className="jk-crumb" key={i}>
          {i > 0 ? <span className="jk-crumb-sep">›</span> : null}
          {c.route && i < props.crumbs.length - 1 ? (
            <a href={`#${c.route}`} onClick={(e) => (e.preventDefault(), navigate(c.route!))}>
              {c.label}
            </a>
          ) : (
            <span>{c.label}</span>
          )}
          {c.menu?.length ? (
            <button type="button" className="jk-crumb-chev" aria-label={`${c.label} menu`} aria-expanded={open === i} onClick={() => setOpen((o) => (o === i ? null : i))}>
              <Sym name="chevronDown" size={14} />
            </button>
          ) : null}
          {open === i && c.menu ? (
            <div className="jk-menu" role="menu" style={{ left: 0 }}>
              {c.menu.map((m) => (
                <button
                  key={m.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(null);
                    navigate(m.route);
                  }}
                >
                  <Sym name={m.icon} size={18} />
                  {m.label}
                </button>
              ))}
            </div>
          ) : null}
        </span>
      ))}
    </nav>
  );
}

/** Job context menu (breadcrumb dropdown). */
export function jobMenu(jobId: string, parameterised: boolean): Crumb['menu'] {
  return [
    { label: 'Status', icon: 'status', route: jobUrl(jobId) },
    { label: 'Changes', icon: 'changes', route: jobUrl(jobId, 'changes') },
    { label: parameterised ? 'Build with Parameters' : 'Build Now', icon: 'play', route: jobUrl(jobId, 'build') },
    { label: 'Configure', icon: 'gear', route: jobUrl(jobId, 'configure') },
    { label: 'Full Stage View', icon: 'stage', route: jobUrl(jobId, 'workflow-stage') },
    { label: 'Move', icon: 'move', route: jobUrl(jobId, 'move') },
  ];
}

/* ─────────────────────────── Side panel ─────────────────────────── */

export interface Task {
  label: string;
  icon: SymbolName;
  route?: string;
  onClick?(): void;
  current?: boolean;
  danger?: boolean;
  hint?: string;
}

export function SidePanel(props: { tasks: Task[]; children?: ReactNode; widgets?: boolean }) {
  const { navigate } = useJk();
  return (
    <aside className="jk-side">
      <nav className="jk-tasks" aria-label="Tasks">
        {props.tasks.map((t) => (
          <button
            key={t.label}
            type="button"
            className={`jk-task${t.danger ? ' jk-task-danger' : ''}`}
            aria-current={t.current ? 'page' : undefined}
            data-hint={t.hint}
            onClick={() => (t.onClick ? t.onClick() : t.route ? navigate(t.route) : undefined)}
          >
            <Sym name={t.icon} size={20} />
            {t.label}
          </button>
        ))}
      </nav>
      {props.children}
      {props.widgets !== false ? (
        <>
          <BuildQueueWidget />
          <ExecutorsWidget />
        </>
      ) : null}
    </aside>
  );
}

function Collapsible(props: { title: string; children: ReactNode; storageKey: string }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="jk-card">
      <div className="jk-card-head" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open} tabIndex={0} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setOpen((o) => !o))}>
        <span>{props.title}</span>
        <button type="button" tabIndex={-1} aria-hidden="true">
          <Sym name="chevronDown" size={16} />
        </button>
      </div>
      {open ? <div className="jk-card-body">{props.children}</div> : null}
    </section>
  );
}

export function BuildQueueWidget() {
  const { navigate, gate } = useJk();
  const queue = useGameShallow((s) => s.lab.jenkins.queue);
  const builds = useGame((s) => s.lab.jenkins.builds);
  const items = queue.map((id) => builds[id]).filter((b): b is NonNullable<typeof b> => !!b && (!gate || gate.includes(b.jobId)));
  return (
    <Collapsible title={`Build Queue${items.length ? ` (${items.length})` : ''}`} storageKey="queue">
      {items.length === 0 ? <div className="jk-card-empty">No builds in the queue.</div> : null}
      {items.map((b) => (
        <div className="jk-exec-row" key={b.id}>
          <span />
          <div>
            <a href={`#${jobUrl(b.jobId)}`} onClick={(e) => (e.preventDefault(), navigate(jobUrl(b.jobId)))}>
              {jobDisplayName(b.jobId)}
            </a>
            <div className="jk-muted" style={{ color: '#6d6b7f', fontSize: 12 }}>
              pending—Waiting for next available executor
            </div>
          </div>
          <button type="button" className="jk-x" title="cancel this build" aria-label={`Cancel ${b.id}`} onClick={() => simTry(() => sim.jenkins.abort(b.id, 'player'))}>
            <Sym name="x" size={16} />
          </button>
        </div>
      ))}
    </Collapsible>
  );
}

export function ExecutorsWidget() {
  const { navigate, gate } = useJk();
  const builds = useGame((s) => s.lab.jenkins.builds);
  const executors = useGame((s) => s.lab.jenkins.executors);
  const jobs = useGame((s) => s.lab.jenkins.jobs);
  const now = useNowSec();
  const jenkins = useGame((s) => s.lab.jenkins);
  const running = useMemo(() => Object.values(builds).filter((b) => b.state === 'running').sort((a, b) => (a.startedMs ?? 0) - (b.startedMs ?? 0)), [builds]);
  const rows: ReactNode[] = [];
  for (let i = 0; i < Math.max(executors || 8, 1); i++) {
    const b = running[i];
    if (!b) {
      rows.push(
        <div className="jk-exec-row" key={i}>
          <span className="jk-exec-num">{i + 1}</span>
          <span className="jk-muted" style={{ color: '#6d6b7f' }}>
            Idle
          </span>
          <span />
        </div>,
      );
      continue;
    }
    const hidden = gate && !gate.includes(b.jobId);
    const job = jobs[b.jobId];
    const lastOk = job ? job.buildIds.map((id) => builds[id]).filter((x) => x && x.result === 'SUCCESS' && x.startedMs != null && x.finishedMs != null).pop() : null;
    const est = lastOk ? lastOk.finishedMs! - lastOk.startedMs! : 60_000;
    const el = Math.max(0, now - (b.startedMs ?? now));
    const pct = est > 0 ? el / est : 0;
    const ball = buildBall(jenkins, b);
    rows.push(
      <div className="jk-exec-row" key={i}>
        <span className="jk-exec-num">{i + 1}</span>
        <div>
          {hidden ? (
            <span>Busy</span>
          ) : (
            <a href={`#${buildUrl(b)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(b, 'console')))}>
              {jobDisplayName(b.jobId)} #{b.number}
            </a>
          )}
          <div className={`jk-progress${pct > 1 ? ' jk-progress-over' : ''}`} title={`Started ${Math.round(el / 1000)} sec ago`}>
            <i style={{ width: `${Math.min(100, pct * 100)}%`, background: pct > 1 ? undefined : ball.kind === 'failure' ? '#0b6aa2' : undefined }} />
          </div>
        </div>
        {hidden ? (
          <span />
        ) : (
          <button
            type="button"
            className="jk-x"
            title={`terminate this build`}
            aria-label={`Abort ${b.id}`}
            onClick={() => {
              const r = simTry(() => sim.jenkins.abort(b.id, 'player'));
              emitAppAction('jenkins', 'jenkins.build.aborted', { buildId: b.id, ok: r.ok, error: r.ok ? null : r.error });
            }}
          >
            <Sym name="x" size={16} />
          </button>
        )}
      </div>,
    );
  }
  return (
    <Collapsible title="Build Executor Status" storageKey="exec">
      <div style={{ fontWeight: 600, marginBottom: 4 }}>
        <a href="#/computer/" onClick={(e) => (e.preventDefault(), navigate('/computer/'))}>
          Built-In Node
        </a>
      </div>
      {rows}
    </Collapsible>
  );
}

/* ─────────────────────────── Footer & small bits ─────────────────────────── */

export function Footer() {
  return (
    <footer className="jk-footer">
      <span className="jk-link">REST API</span>
      <span>Jenkins 2.462.3</span>
    </footer>
  );
}

export function StatusBall(props: { buildId: string; size?: number }) {
  const jenkins = useGame((s) => s.lab.jenkins);
  const b = jenkins.builds[props.buildId];
  if (!b) return null;
  const ball = buildBall(jenkins, b);
  return <Ball kind={ball.kind} running={ball.running} size={props.size ?? 24} />;
}
