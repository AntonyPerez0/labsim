/**
 * IntelliJ IDEA (Darcula, classic UI) — docs/design/50-computer-apps.md §4.
 * Routes: `/welcome`, `/project/:repo` (+ `?cwm=<person>` for Code With Me), `/project/:repo/file/*path`.
 * Projects are the local clones `lab.repos[r].local`; saves → `sim.git.writeFile`; runs → `sim.runner.runLocal`;
 * git → `sim.git.*`. Keep the export name: `APP_META.intellij.exportName === 'IntelliJApp'`.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { APP_ROUTES, emitAppAction, getWindowManager, matchRoute, type AppProps } from '@/computer/apps';
import { personName } from '@/content/team';
import { useGame, useGameShallow } from '@/core/store';
import type { RepoId } from '@/sim';
import { openFile, saveAll } from './actions';
import { getIdeModel, releaseIdeIfClosed } from './ideModel';
import { ProjectWindow } from './ProjectWindow';
import { IdeRootContext } from './rootContext';
import { Welcome } from './Welcome';
import './ij.css';
import './ij-chrome.css';
import './ij-editor.css';
import './ij-panels.css';

const REPOS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];
const SETTINGS_KEY = 'labsim.intellij.settings';

interface IdeSettings {
  theme: 'darcula' | 'light';
  fontSize: number;
}

function loadSettings(): IdeSettings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null');
    if (v && (v.theme === 'darcula' || v.theme === 'light') && typeof v.fontSize === 'number') return v;
  } catch {
    /* ignore */
  }
  return { theme: 'darcula', fontSize: 13 };
}

function parseRoute(route: string | undefined): { repo: RepoId | null; file: string | null; cwm: string | null } {
  if (!route) return { repo: null, file: null, cwm: null };
  const f = matchRoute(APP_ROUTES.intellij.file, route);
  const p = f ?? matchRoute(APP_ROUTES.intellij.project, route);
  if (!p) return { repo: null, file: null, cwm: null };
  const repo = REPOS.includes(p.params.repo as RepoId) ? (p.params.repo as RepoId) : null;
  return { repo, file: f ? decodeURIComponent(f.params.path) : null, cwm: p.query.cwm || null };
}

export function projectRoute(repo: RepoId, cwm: string | null, file?: string | null): string {
  const q = cwm ? `?cwm=${encodeURIComponent(cwm)}` : '';
  return file ? `/project/${repo}/file/${file}${q}` : `/project/${repo}${q}`;
}

export function IntelliJApp(props: AppProps) {
  const { windowId, route, navigate, onTitle, params, focused = true } = props;
  const model = useMemo(() => getIdeModel(windowId), [windowId]);
  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  const [rootEl, setRootEl] = useState<HTMLDivElement | null>(null);
  const [settings, setSettings] = useState<IdeSettings>(loadSettings);
  const target = parseRoute(route ?? params?.route ?? (params?.repo ? projectRoute(params.repo, null, params.file) : undefined));
  const cloned = useGame((s) => (target.repo ? !!s.lab.repos?.[target.repo]?.local : false));
  const cwmOk = useGame((s) => (target.repo && target.cwm ? Object.keys(s.lab.workstation?.files ?? {}).some((k) => k.startsWith(`~/CodeWithMe/${target.cwm}/${target.repo}/`)) : false));
  const recentProjects = useGameShallow((s) => REPOS.filter((r) => !!s.lab.repos?.[r]?.local));
  const openRepo = target.repo && (target.cwm ? cwmOk : cloned) ? target.repo : null;
  const justCloned = useRef<RepoId | null>(null);

  useEffect(() => () => releaseIdeIfClosed(windowId), [windowId]);

  // Route → project.
  useEffect(() => {
    const cwm = openRepo ? target.cwm : null;
    if (model.repo === openRepo && model.cwm === cwm) return;
    if (model.repo) saveAll(model, 'auto');
    model.setProject(openRepo, cwm);
    if (openRepo) {
      emitAppAction('intellij', 'intellij.project.opened', { repo: openRepo });
      if (justCloned.current === openRepo) {
        model.startProgress('Indexing…', 1500);
        if (openRepo === 'uia-remote') setTimeout(() => model.startProgress(`Maven: Importing '${openRepo}'…`, 1200), 1500);
        justCloned.current = null;
      }
    }
    model.changed();
  }, [openRepo, target.cwm, model]);

  // Route → active file (+ params.line), params.runConfig.
  // Only a *route* change (or fresh params) opens a file: when the editor switches tabs itself, the route follows
  // the editor (effect below), never the other way round.
  const lastParams = useRef<typeof params>(undefined);
  const appliedRoute = useRef<string | null>(null);
  useEffect(() => {
    if (!openRepo || model.repo !== openRepo) return;
    const fresh = lastParams.current !== params;
    lastParams.current = params;
    const routeKey = `${model.repo}|${route ?? ''}`;
    const routeChanged = appliedRoute.current !== routeKey;
    appliedRoute.current = routeKey;
    const line = fresh ? params?.line : undefined;
    if (fresh && params?.runConfig) {
      model.runConfig = params.runConfig;
      model.changed();
    }
    if (target.file && (routeChanged || line) && (model.active !== target.file || line)) openFile(model, target.file, { line, revealInTree: true });
  }, [route, openRepo, target.file, params, model]);

  // Active editor → route (the shell emits app.navigated).
  const active = model.active && !model.diffs.has(model.active) ? model.active : null;
  useEffect(() => {
    if (!navigate) return;
    const cur = model.active && !model.diffs.has(model.active) ? model.active : null;
    const want = model.repo ? projectRoute(model.repo, model.cwm, cur) : !target.repo ? APP_ROUTES.intellij.welcome.path : null;
    if (want && want !== route && model.repo === (openRepo ?? null)) navigate(want);
  }, [active, model.repo, model.cwm, navigate, route, openRepo, target.repo, model]);

  // Title.
  const cwmName = target.cwm ? personName(target.cwm) || target.cwm : null;
  const title = !model.repo ? 'Welcome to IntelliJ IDEA' : model.cwm ? `${model.repo} [${cwmName}] — Code With Me` : active ? `${model.repo} – ${active.split('/').pop()}` : model.repo;
  // Hosts may pass a fresh `onTitle` each render: report on title changes only.
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  useEffect(() => {
    onTitleRef.current?.(title);
  }, [title]);

  const openProject = (repo: RepoId, opts: { cwm?: string | null; cloned?: boolean } = {}) => {
    if (opts.cloned) justCloned.current = repo;
    const cwm = opts.cwm ?? null;
    if (model.repo && (model.repo !== repo || model.cwm !== cwm)) {
      // IntelliJ opens another project in a new window (one window per project).
      saveAll(model, 'auto');
      const wm = props.wm ?? getWindowManager();
      if (wm) {
        wm.openApp('intellij', cwm ? { repo, route: projectRoute(repo, cwm) } : { repo });
        return;
      }
    }
    if (model.repo === repo && model.cwm === cwm && opts.cloned) {
      model.startProgress('Indexing…', 1500);
    }
    navigate?.(projectRoute(repo, cwm));
  };

  const applySettings = (theme: 'darcula' | 'light', fontSize: number) => {
    const next = { theme, fontSize };
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      /* per-viewer convenience */
    }
  };

  const style = { '--ij-ed-size': `${settings.fontSize}px` } as React.CSSProperties;
  const notice = target.repo && !openRepo ? (target.cwm ? `The Code With Me session '${cwmName} — ${target.repo}' is not available.` : `Project '${target.repo}' is not cloned yet — use Get from VCS to clone it.`) : null;

  return (
    <div className={`ij-root${settings.theme === 'light' ? ' ij-light' : ''}`} data-app="intellij" data-window={windowId} ref={setRootEl} style={style}>
      <IdeRootContext.Provider value={rootEl}>
        {model.repo ? (
          <ProjectWindow
            model={model}
            windowId={windowId}
            repo={model.repo}
            cwm={model.cwm}
            cwmName={cwmName}
            focused={focused}
            theme={settings.theme}
            fontSize={settings.fontSize}
            recentProjects={recentProjects}
            onSettings={applySettings}
            onOpenProject={openProject}
            onCloseProject={() => {
              saveAll(model, 'auto');
              model.setProject(null, null);
              model.changed();
              navigate?.(APP_ROUTES.intellij.welcome.path);
            }}
            onExit={() => {
              saveAll(model, 'auto');
              (props.wm ?? getWindowManager())?.close(windowId);
            }}
          />
        ) : (
          <Welcome onOpen={(repo, wasCloned) => openProject(repo, { cloned: wasCloned })} notice={notice} />
        )}
      </IdeRootContext.Provider>
    </div>
  );
}
