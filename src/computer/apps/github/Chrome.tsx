/**
 * GitHub header (Apps §7.1), repository tab bar, and shared widgets: popover anchor, modal, branch selector,
 * relative time, repo-title row.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useGame } from '@/core/store';
import { fmtRelative, fmtJenkins } from '@/computer/apps';
import type { GitRepo } from '@/sim/types';
import { Avatar, Mark, Oct, OrgLogo, type OctName } from './icons';
import { useGh, useNow } from './ctx';
import { repoRoute, treeRoute } from './model';

export function GhHeader(props: { repo?: string; tab?: 'code' | 'issues' | 'pulls' | 'actions' | 'projects' | 'security' | 'pulse'; openPrs?: number }) {
  const { navigate, playerInitials, focused } = useGh();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);
  const tabs: { id: NonNullable<typeof props.tab>; label: string; icon: OctName; route: string; count?: number }[] = props.repo
    ? [
        { id: 'code', label: 'Code', icon: 'code', route: repoRoute(props.repo) },
        { id: 'issues', label: 'Issues', icon: 'issue', route: repoRoute(props.repo, 'issues'), count: 0 },
        { id: 'pulls', label: 'Pull requests', icon: 'pr', route: repoRoute(props.repo, 'pulls'), count: props.openPrs ?? 0 },
        { id: 'actions', label: 'Actions', icon: 'play', route: repoRoute(props.repo, 'actions') },
        { id: 'projects', label: 'Projects', icon: 'table', route: repoRoute(props.repo, 'projects') },
        { id: 'security', label: 'Security', icon: 'shield', route: repoRoute(props.repo, 'security') },
        { id: 'pulse', label: 'Insights', icon: 'graph', route: repoRoute(props.repo, 'pulse') },
      ]
    : [];
  return (
    <header className="gh-header">
      <div className="gh-header-top">
        <button type="button" className="gh-hbtn" aria-label="Open global navigation menu">
          <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
            <path d="M1 2.75A.75.75 0 011.75 2h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 2.75zm0 5A.75.75 0 011.75 7h12.5a.75.75 0 010 1.5H1.75A.75.75 0 011 7.75zM1.75 12h12.5a.75.75 0 010 1.5H1.75a.75.75 0 010-1.5z" />
          </svg>
        </button>
        <a href="#/labsim-lab" onClick={(e) => (e.preventDefault(), navigate('/labsim-lab'))} aria-label="Homepage">
          <Mark size={32} />
        </a>
        <nav className="gh-ctx" aria-label="Page context">
          <a href="#/labsim-lab" onClick={(e) => (e.preventDefault(), navigate('/labsim-lab'))} className={props.repo ? '' : 'gh-ctx-strong'}>
            labsim-lab
          </a>
          {props.repo ? (
            <>
              <span className="gh-ctx-sep">/</span>
              <a href={`#${repoRoute(props.repo)}`} className="gh-ctx-strong" onClick={(e) => (e.preventDefault(), navigate(repoRoute(props.repo!)))}>
                {props.repo}
              </a>
            </>
          ) : null}
        </nav>
        <label className="gh-hsearch">
          <Oct name="search" />
          <input
            ref={inputRef}
            value={q}
            placeholder="Type / to search"
            aria-label="Search"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setQ('');
                inputRef.current?.blur();
              }
              if (e.key === 'Enter' && props.repo && q.trim()) {
                navigate(repoRoute(props.repo, `pulls?q=${encodeURIComponent(`is:pr ${q.trim()}`)}`));
                setQ('');
              }
            }}
          />
          {!q ? <span className="gh-kbd">/</span> : null}
        </label>
        <button type="button" className="gh-hbtn" aria-label="Create something new">
          <Oct name="plus" />
          <Oct name="caret" />
        </button>
        <button type="button" className="gh-hbtn" aria-label="Issues">
          <Oct name="issue" />
        </button>
        <button type="button" className="gh-hbtn" aria-label="Pull requests">
          <Oct name="pr" />
        </button>
        <button type="button" className="gh-hbtn" aria-label="Notifications">
          <Oct name="bell" />
        </button>
        <Avatar who="player" size={32} playerInitials={playerInitials} />
      </div>
      {tabs.length ? (
        <nav className="gh-tabs" aria-label="Repository">
          {tabs.map((t) => (
            <a key={t.id} className="gh-tab" href={`#${t.route}`} aria-current={props.tab === t.id ? 'page' : undefined} onClick={(e) => (e.preventDefault(), navigate(t.route))}>
              <Oct name={t.icon} />
              <span>{t.label}</span>
              {t.count !== undefined ? <span className="gh-counter">{t.count}</span> : null}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}

/** Click-outside / Esc-closing popover anchor. */
export function Popover(props: { open: boolean; onClose(): void; button: ReactNode; children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { onClose, open } = props;
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key, true);
    };
  }, [open, onClose]);
  return (
    <div className="gh-anchor" ref={ref}>
      {props.button}
      {open ? <div className={`gh-overlay gh-overlay-${props.align ?? 'left'} ${props.className ?? ''}`}>{props.children}</div> : null}
    </div>
  );
}

export function Modal(props: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const { onClose } = props;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="gh-modal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gh-modal" role="dialog" aria-modal="true" aria-label={props.title} style={props.width ? { width: props.width } : undefined}>
        <div className="gh-modal-head">
          {props.title}
          <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" aria-label="Close" onClick={props.onClose}>
            <Oct name="x" />
          </button>
        </div>
        <div className="gh-modal-body">{props.children}</div>
        {props.footer ? <div className="gh-modal-foot">{props.footer}</div> : null}
      </div>
    </div>
  );
}

export function Rel(props: { ms: number }) {
  const now = useNow();
  return <span title={fmtJenkins(props.ms)}>{fmtRelative(props.ms, Math.max(now, props.ms))}</span>;
}

/** `⎇ main ▾` branch selector (Branches / Tags tabs, filter, View all branches). */
export function BranchSelector(props: { repo: GitRepo; current: string; onPick(branch: string): void; label?: string }) {
  const { navigate } = useGh();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [tab, setTab] = useState<'branches' | 'tags'>('branches');
  const names = Object.keys(props.repo.branches).sort((a, b) => (a === props.repo.defaultBranch ? -1 : b === props.repo.defaultBranch ? 1 : a.localeCompare(b)));
  const shown = tab === 'branches' ? names.filter((n) => n.toLowerCase().includes(filter.trim().toLowerCase())) : [];
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      button={
        <button type="button" className="gh-btn" data-hint="github.branchSelector" onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open}>
          <Oct name="branch" />
          {props.label ? <span className="gh-muted">{props.label}</span> : null}
          <b style={{ fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>{props.current}</b>
          <Oct name="caret" />
        </button>
      }
    >
      <div className="gh-overlay-head">
        Switch branches/tags
        <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" aria-label="Close" onClick={() => setOpen(false)}>
          <Oct name="x" />
        </button>
      </div>
      <div style={{ padding: 8 }}>
        <input className="gh-input gh-input-sm" autoFocus placeholder={tab === 'branches' ? 'Find a branch...' : 'Find a tag...'} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="gh-subtabs" role="tablist">
        <button type="button" className="gh-subtab" role="tab" aria-selected={tab === 'branches'} onClick={() => setTab('branches')}>
          Branches
        </button>
        <button type="button" className="gh-subtab" role="tab" aria-selected={tab === 'tags'} onClick={() => setTab('tags')}>
          Tags
        </button>
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto', padding: '4px 0' }} role="listbox">
        {tab === 'tags' ? <div className="gh-muted" style={{ padding: '12px 16px', fontSize: 12 }}>Nothing to show</div> : null}
        {shown.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            className="gh-menu-item"
            aria-selected={n === props.current}
            onClick={() => {
              setOpen(false);
              props.onPick(n);
            }}
          >
            <span className="gh-menu-check">{n === props.current ? <Oct name="check" /> : null}</span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis' }}>{n}</span>
            {n === props.repo.defaultBranch ? <span className="gh-label">default</span> : null}
          </button>
        ))}
      </div>
      <div style={{ borderTop: '1px solid var(--gh-border-muted)', padding: '8px 12px' }}>
        <a
          href={`#${repoRoute(props.repo.id, 'branches')}`}
          onClick={(e) => {
            e.preventDefault();
            setOpen(false);
            navigate(repoRoute(props.repo.id, 'branches'));
          }}
        >
          View all branches
        </a>
      </div>
    </Popover>
  );
}

export function RepoTitle(props: { repo: GitRepo }) {
  const { navigate } = useGh();
  return (
    <div className="gh-repo-title">
      <OrgLogo size={24} />
      <h2>
        <a href={`#${repoRoute(props.repo.id)}`} className="gh-fg-link" onClick={(e) => (e.preventDefault(), navigate(repoRoute(props.repo.id)))}>
          {props.repo.name}
        </a>
        <span className="gh-label">Private</span>
      </h2>
      <span className="gh-spacer" />
      <button type="button" className="gh-btn gh-btn-sm">
        <Oct name="eye" /> Watch <span className="gh-counter">4</span>
      </button>
      <button type="button" className="gh-btn gh-btn-sm">
        <Oct name="fork" /> Fork <span className="gh-counter">0</span>
      </button>
      <button type="button" className="gh-btn gh-btn-sm">
        <Oct name="star" /> Star <span className="gh-counter">0</span>
      </button>
    </div>
  );
}

/** Repos visible after lesson gating. */
export function useVisibleRepo(repoId: string): GitRepo | null {
  const { repos } = useGh();
  const repo = useGame((s) => (s.lab.repos as Record<string, GitRepo | undefined>)[repoId] ?? null);
  if (!repo) return null;
  if (repos && !repos.includes(repoId)) return null;
  return repo;
}

export function NotFound() {
  const { navigate } = useGh();
  return (
    <div className="gh-container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 120, fontWeight: 700, color: '#d1d9e0', lineHeight: 1 }}>404</div>
      <h2 style={{ fontSize: 24, fontWeight: 400, margin: '16px 0' }}>This is not the web page you are looking for.</h2>
      <p className="gh-muted">
        Find code, projects, and people on GitHub:{' '}
        <a href="#/labsim-lab" onClick={(e) => (e.preventDefault(), navigate('/labsim-lab'))}>
          labsim-lab
        </a>
      </p>
    </div>
  );
}

export function treeOf(repoId: string, branch: string, path = ''): string {
  return treeRoute(repoId, branch, path);
}
