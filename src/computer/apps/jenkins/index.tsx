/**
 * Jenkins (`http://jenkins.lab.local:8080`) — Jenkins 2.462 LTS stock UI with Folders, Pipeline, Stage View
 * (docs/design/50-computer-apps.md §3). A pure function of `props.route`; every write goes through
 * `sim.jenkins.*` with actor 'player'. The shell draws the browser chrome and the network error pages.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame, useGameShallow } from '@/core/store';
import { getWindowManager, type AppProps } from '@/computer/apps';
import { JenkinsContext, type JkCtx } from './ctx';
import { Header } from './Layout';
import { parseRoute, type JkPage } from './model';
import { BuildHistoryPage, DashboardPage, FolderPage, PeoplePage } from './pages/Lists';
import { BuildWithParametersPage, ChangesPage, FullStageViewPage, JobPage, NotFoundShell } from './pages/Job';
import { BuildPage, BuildParametersPage, ConsolePage } from './pages/Build';
import { ConfigurePage } from './pages/Configure';
import { AboutPage, AccessDeniedPage, ManagePage, MovePage, NodesPage, PipelineSyntaxPage, SearchPage } from './pages/Misc';
import { startJenkinsNotifier } from './notifier';
import './jenkins.css';

startJenkinsNotifier();

function pageTitle(p: JkPage): string {
  switch (p.kind) {
    case 'dashboard':
      return 'Dashboard [Jenkins]';
    case 'view':
      return `${p.view} [Jenkins]`;
    case 'folder':
      return `${p.folder} [Jenkins]`;
    case 'job':
      return `${p.folder} » ${p.job} [Jenkins]`;
    case 'buildWithParameters':
      return `${p.folder} » ${p.job} [Jenkins]`;
    case 'configure':
      return `${p.folder} » ${p.job} Config [Jenkins]`;
    case 'move':
      return `Move [Jenkins]`;
    case 'changes':
      return `${p.folder} » ${p.job} Changes [Jenkins]`;
    case 'fullStageView':
      return `${p.job} - Stage View [Jenkins]`;
    case 'pipelineSyntax':
      return 'Pipeline Syntax: Snippet Generator [Jenkins]';
    case 'build':
      return `${p.folder} » ${p.job} #${p.number} [Jenkins]`;
    case 'console':
      return `${p.folder} » ${p.job} #${p.number} Console [Jenkins]`;
    case 'buildParameters':
      return `${p.folder} » ${p.job} #${p.number} Parameters [Jenkins]`;
    case 'buildHistory':
      return 'All [Jenkins]';
    case 'people':
      return 'People [Jenkins]';
    case 'manage':
      return 'Manage Jenkins [Jenkins]';
    case 'nodes':
      return 'Nodes [Jenkins]';
    case 'about':
      return 'About Jenkins [Jenkins]';
    case 'search':
      return 'Search [Jenkins]';
    case 'denied':
      return 'Access Denied [Jenkins]';
    default:
      return 'Error 404 Not Found [Jenkins]';
  }
}

function renderPage(p: JkPage, gate: string[] | null): ReactNode {
  if ('jobId' in p && gate && !gate.includes(p.jobId)) return <NotFoundShell />;
  switch (p.kind) {
    case 'dashboard':
      return <DashboardPage view="All" />;
    case 'view':
      return <DashboardPage view={p.view} />;
    case 'folder':
      return <FolderPage folder={p.folder} />;
    case 'job':
      return <JobPage jobId={p.jobId} />;
    case 'buildWithParameters':
      return <BuildWithParametersPage jobId={p.jobId} />;
    case 'configure':
      return <ConfigurePage jobId={p.jobId} />;
    case 'move':
      return <MovePage jobId={p.jobId} />;
    case 'changes':
      return <ChangesPage jobId={p.jobId} />;
    case 'fullStageView':
      return <FullStageViewPage jobId={p.jobId} />;
    case 'pipelineSyntax':
      return <PipelineSyntaxPage jobId={p.jobId} />;
    case 'build':
      return <BuildPage jobId={p.jobId} number={p.number} />;
    case 'console':
      return <ConsolePage jobId={p.jobId} number={p.number} />;
    case 'buildParameters':
      return <BuildParametersPage jobId={p.jobId} number={p.number} />;
    case 'buildHistory':
      return <BuildHistoryPage />;
    case 'people':
      return <PeoplePage />;
    case 'manage':
      return <ManagePage />;
    case 'nodes':
      return <NodesPage />;
    case 'about':
      return <AboutPage />;
    case 'search':
      return <SearchPage q={p.q} />;
    case 'denied':
      return <AccessDeniedPage permission={p.permission} />;
    default:
      return <NotFoundShell />;
  }
}

export function JenkinsApp(props: AppProps) {
  const route = props.route ?? props.params?.route ?? '/';
  const page = useMemo(() => parseRoute(route), [route]);
  const gating = useGameShallow((s) => {
    const r = s.session.computer?.restrictions?.jenkins;
    const vis = r?.visibleJobs;
    return { visible: Array.isArray(vis) ? (vis as string[]).join('\n') : null, readOnly: r?.readOnly === true };
  });
  const gate = useMemo(() => (gating.visible == null ? null : gating.visible.split('\n').filter(Boolean)), [gating.visible]);
  const playerName = useGame((s) => s.progress?.playerName || 'Engineer');
  const [notice, setNotice] = useState<{ text: string; n: number } | null>(null);
  const timer = useRef<number | null>(null);
  const { onTitle, navigate: nav } = props;

  const title = pageTitle(page);
  useEffect(() => {
    onTitle?.(title);
  }, [title, onTitle]);

  const navigate = useCallback(
    (r: string, opts?: { replace?: boolean }) => {
      if (nav) nav(r, opts);
      else getWindowManager()?.navigate(props.windowId, r, opts);
    },
    [nav, props.windowId],
  );

  const showNotice = useCallback((text: string) => {
    setNotice((n) => ({ text, n: (n?.n ?? 0) + 1 }));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setNotice(null), 2400);
  }, []);
  useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);

  const ctx: JkCtx = useMemo(
    () => ({ route, navigate, wm: props.wm ?? getWindowManager(), gate, readOnly: gating.readOnly, playerName, notice: showNotice, focused: props.focused !== false }),
    [route, navigate, props.wm, gate, gating.readOnly, playerName, showNotice, props.focused],
  );

  return (
    <div className="jk-root" data-app="jenkins" data-window={props.windowId} key={props.reloadKey ?? 0}>
      <JenkinsContext.Provider value={ctx}>
        <Header />
        {renderPage(page, gate)}
        {notice ? (
          <div className="jk-notice" key={notice.n} role="status">
            {notice.text}
          </div>
        ) : null}
      </JenkinsContext.Provider>
    </div>
  );
}


