/**
 * GitHub (`https://github.com/labsim-lab`) — Primer light UI over `lab.repos`
 * (docs/design/50-computer-apps.md §7). A pure function of `props.route`; writes go through `sim.git.*`
 * (and the D5 fallbacks in ./actions.ts). The shell draws the browser chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bus } from '@/core/bus';
import { getState, useGame, useGameShallow } from '@/core/store';
import { getWindowManager, type AppProps } from '@/computer/apps';
import type { GitRepo } from '@/sim/types';
import { GitHubContext, startReviewLog, type GhCtx } from './ctx';
import { NotFound, GhHeader } from './Chrome';
import { parseRoute, pullRoute, type GhPage } from './model';
import { OrgPage, EmptyTabPage } from './pages/Org';
import { CodePage } from './pages/Code';
import { BranchesPage, CommitPage, CommitsPage } from './pages/History';
import { ComparePage, PullsPage } from './pages/Pulls';
import { PullPage } from './pages/Pull';
import { EditPage } from './pages/Edit';
import './github.css';

startReviewLog();

/* NPC reviews/merges on the player's PRs → desktop notifications (Apps §1.5, §7.4). */
let notifierStarted = false;
function startGithubNotifier(): void {
  if (notifierStarted) return;
  notifierStarted = true;
  const authorOf = (repo: string, n: number) => (getState().lab.repos as Record<string, GitRepo | undefined>)[repo]?.pullRequests.find((p) => p.number === n)?.author ?? null;
  bus.on('github.prReviewed', (e) => {
    if (e.by === 'player' || authorOf(e.repo, e.number) !== 'player') return;
    getWindowManager()?.notify({
      app: 'github',
      title: `${e.by} ${e.verdict === 'APPROVED' ? 'approved' : e.verdict === 'CHANGES_REQUESTED' ? 'requested changes on' : 'reviewed'} your pull request #${e.number}`,
      body: `labsim-lab/${e.repo}`,
      route: pullRoute(e.repo, e.number),
      kind: e.verdict === 'CHANGES_REQUESTED' ? 'warning' : 'success',
    });
  });
  bus.on('github.prMerged', (e) => {
    if (e.by === 'player' || authorOf(e.repo, e.number) !== 'player') return;
    getWindowManager()?.notify({ app: 'github', title: `${e.by} merged your pull request #${e.number}`, body: `labsim-lab/${e.repo} — ${e.title}`, route: pullRoute(e.repo, e.number), kind: 'success' });
  });
}
startGithubNotifier();

function titleOf(p: GhPage, repos: Record<string, GitRepo | undefined>): string {
  const base = 'repo' in p ? `labsim-lab/${p.repo}` : 'labsim-lab';
  switch (p.kind) {
    case 'org':
      return 'labsim-lab · GitHub';
    case 'repo':
      return `${base}: ${repos[p.repo]?.description || p.repo}`;
    case 'tree':
    case 'blob': {
      const path = p.ref.split('/').slice(1).join('/');
      return `${base}/${path || ''} at ${p.ref.split('/')[0]} · ${base}`;
    }
    case 'edit':
      return `Editing ${p.repo}/${p.ref.split('/').slice(1).join('/')} at ${p.ref.split('/')[0]} · ${base}`;
    case 'newFile':
      return `New File at ${p.ref.split('/').slice(1).join('/') || '/'} · ${base}`;
    case 'commits':
      return `Commits · ${base}`;
    case 'commit':
      return `${repos[p.repo]?.commits[Object.keys(repos[p.repo]?.commits ?? {}).find((s) => s.startsWith(p.sha)) ?? '']?.message.split('\n')[0] ?? 'Commit'} · ${base}@${p.sha.slice(0, 7)}`;
    case 'branches':
      return `Branches · ${base}`;
    case 'pulls':
      return `Pull requests · ${base}`;
    case 'compare':
      return `Comparing ${p.range} · ${base}`;
    case 'pull': {
      const pr = repos[p.repo]?.pullRequests.find((x) => x.number === p.number);
      return pr ? `${pr.title} by ${pr.author === 'player' ? 'engineer' : pr.author} · Pull Request #${p.number} · ${base}` : `Pull Request #${p.number} · ${base}`;
    }
    case 'issues':
      return `Issues · ${base}`;
    case 'actions':
      return `Actions · ${base}`;
    default:
      return 'Page not found · GitHub';
  }
}

function Page(props: { page: GhPage; gate: string[] | null }) {
  const p = props.page;
  const repoId = 'repo' in p ? p.repo : null;
  const repo = useGame((s) => (repoId ? (s.lab.repos as Record<string, GitRepo | undefined>)[repoId] ?? null : null));
  if (p.kind === 'org') return <OrgPage tab={p.tab} />;
  if (p.kind === 'notFound' || !repo || (props.gate && !props.gate.includes(repo.id))) {
    return (
      <>
        <GhHeader />
        <NotFound />
      </>
    );
  }
  switch (p.kind) {
    case 'repo':
      return <CodePage repo={repo} kind="repo" refPath="" />;
    case 'tree':
      return <CodePage repo={repo} kind="tree" refPath={p.ref} />;
    case 'blob':
      return <CodePage repo={repo} kind="blob" refPath={p.ref} />;
    case 'edit':
      return <EditPage key={p.ref} repo={repo} refPath={p.ref} isNew={false} />;
    case 'newFile':
      return <EditPage key={`new:${p.ref}`} repo={repo} refPath={p.ref} isNew />;
    case 'commits':
      return <CommitsPage repo={repo} refPath={p.ref} />;
    case 'commit':
      return <CommitPage repo={repo} sha={p.sha} />;
    case 'branches':
      return <BranchesPage repo={repo} />;
    case 'pulls':
      return <PullsPage key={p.q} repo={repo} q={p.q} />;
    case 'compare':
      return <ComparePage key={p.range} repo={repo} range={p.range} />;
    case 'pull':
      return <PullPage repo={repo} number={p.number} tab={p.tab} />;
    case 'issues':
      return <EmptyTabPage repo={repo} tab="issues" />;
    case 'actions':
      return <EmptyTabPage repo={repo} tab="actions" />;
    case 'empty':
      return <EmptyTabPage repo={repo} tab={p.tab} />;
    default:
      return null;
  }
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'E';
  return (parts[0]![0]! + (parts.length > 1 ? parts[parts.length - 1]![0]! : '')).toUpperCase();
}

export function GitHubApp(props: AppProps) {
  const route = props.route ?? props.params?.route ?? '/labsim-lab';
  const page = useMemo(() => parseRoute(route), [route]);
  const gating = useGameShallow((s) => {
    const r = s.session.computer?.restrictions?.github;
    const v = r?.repos;
    return { repos: Array.isArray(v) ? (v as string[]).join(',') : null, readOnly: r?.readOnly === true };
  });
  const gate = useMemo(() => (gating.repos == null ? null : gating.repos.split(',').filter(Boolean)), [gating.repos]);
  const playerName = useGame((s) => s.progress?.playerName || 'Engineer');
  const repos = useGame((s) => s.lab.repos) as Record<string, GitRepo | undefined>;
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const { onTitle, navigate: nav, windowId } = props;
  const title = titleOf(page, repos ?? {});
  useEffect(() => onTitle?.(title), [title, onTitle]);
  // New page → scroll to top (browser behaviour).
  useEffect(() => {
    rootRef.current?.scrollTo?.(0, 0);
  }, [route]);
  const navigate = useCallback(
    (r: string, opts?: { replace?: boolean }) => {
      if (nav) nav(r, opts);
      else getWindowManager()?.navigate(windowId, r, opts);
    },
    [nav, windowId],
  );
  const showToast = useCallback((t: string) => {
    setToast(t);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);
  const ctx: GhCtx = useMemo(
    () => ({ route, navigate, wm: props.wm ?? getWindowManager(), repos: gate, readOnly: gating.readOnly, playerName, playerInitials: initialsOf(playerName), toast: showToast, focused: props.focused !== false }),
    [route, navigate, props.wm, gate, gating.readOnly, playerName, showToast, props.focused],
  );
  return (
    <div className="gh-root" data-app="github" data-window={windowId} ref={rootRef} key={props.reloadKey ?? 0}>
      <GitHubContext.Provider value={ctx}>
        <Page page={page} gate={gate} />
        {toast ? <div className="gh-toast" role="status">{toast}</div> : null}
      </GitHubContext.Provider>
    </div>
  );
}
