/**
 * An open project (Apps §4.2): main menu, nav bar + toolbar, tool-window stripes, Project/Commit (left),
 * editor area, Run/Terminal/Problems/Git/TODO (bottom), status bar, balloons and dialogs. Owns the keyboard map
 * (Apps §4.12) and autosave (focus loss, idle, before run/commit, project switch).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getWindowManager } from '@/computer/apps';
import { useGame } from '@/core/store';
import type { LabState, RepoId } from '@/sim';
import { TerminalApp } from '../terminal';
import { buildProject, openFile, projectFiles, projectRoot, runStateOf, saveAll, startRun, stopRun } from './actions';
import { DialogHost } from './DialogHost';
import { actionEntries, keyToCommand, loadLayout, saveLayout, startSplitterDrag, useLiveProgress } from './keymap';
import { EditorPane } from './EditorPane';
import { IcBranch, IcCommit, IcError, IcProblems, IcProjectTw, IcRun, IcTerminal, IcTodo, IcWarning, IcCheck, FileIcon, IcChevronDown, IcLock } from './icons';
import type { BottomTool, IdeModel, LeftTool } from './ideModel';
import { inspectFile, inspectionModeFor } from './inspections';
import { buildMenus, MenuBar } from './MenuBar';
import { MenuCatcher, MenuList, type MenuItem } from './Menu';
import { CommitPanel, GitLogPanel, ProblemsPanel } from './Panels';
import type { ActionEntry } from './Popups';
import { ancestorsOf, buildTree, runConfigsFor, type RunConfig } from './projectModel';
import { ProjectView } from './ProjectView';
import { rootPoint, useIdeRoot } from './rootContext';
import { RunPanel, RunTabsHeader } from './RunPanel';
import { NavToolbar } from './NavToolbar';
import { Balloons, CaretStatus, TodoPanel } from './StatusParts';
import { treeAt } from './vcs';

export interface ProjectWindowProps {
  model: IdeModel;
  windowId: string;
  repo: RepoId;
  cwm: string | null;
  cwmName: string | null;
  focused: boolean;
  theme: 'darcula' | 'light';
  fontSize: number;
  recentProjects: string[];
  onSettings(theme: 'darcula' | 'light', fontSize: number): void;
  onOpenProject(repo: RepoId, opts?: { cwm?: string | null; cloned?: boolean }): void;
  onCloseProject(): void;
  onExit(): void;
}

const EMPTY: Record<string, string> = {};

export function ProjectWindow(props: ProjectWindowProps) {
  const { model, repo, cwm, focused } = props;
  const rootEl = useIdeRoot();
  const gitRepo = useGame((s) => s.lab.repos?.[repo] ?? null);
  const wsFiles = useGame((s) => (cwm ? s.lab.workstation?.files : null));
  const runsState = useGame((s) => s.lab.local?.runs);
  const files = useMemo(
    () => (cwm ? projectFiles({ workstation: { files: wsFiles ?? {} } } as unknown as LabState, repo, cwm) : gitRepo?.local?.files) ?? EMPTY,
    [gitRepo, wsFiles, repo, cwm],
  );
  const canGit = !cwm && !!gitRepo?.local;
  const head = useMemo(() => (gitRepo?.local ? treeAt(gitRepo, gitRepo.local.headSha) : {}), [gitRepo]);
  const paths = useMemo(() => Object.keys(files), [files]);
  const configs = useMemo(() => runConfigsFor(repo, paths), [repo, paths]);
  const root = projectRoot(repo, cwm);
  const [toolbarMenu, setToolbarMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const branchBtn = useRef<HTMLButtonElement | null>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastShiftUp = useRef(0);
  const otherKeySinceShift = useRef(false);
  const progress = useLiveProgress(model);

  // Persisted splitter sizes.
  useEffect(() => {
    const l = loadLayout();
    if (l) {
      model.leftWidth = l.left;
      model.bottomHeight = l.bottom;
      model.changed();
    }
  }, [model]);

  // Selected run config: last used, else the first.
  if (!model.runConfig && configs.length)
    model.runConfig = (configs.find((c) => c.testPath === model.active) ?? configs.find((c) => c.name === 'TaxTest' || c.name === 'LSTR: swipe_sale_print.json') ?? configs[0]).name;
  const activeConfig: RunConfig | null = configs.find((c) => c.name === model.runConfig) ?? null;
  void runsState;
  const anyRunning = model.runs.some((t) => t.runId && !t.stopped && !runStateOf(t.runId).done);

  // Autosave: focus loss, unmount.
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (wasFocused.current && !focused) saveAll(model, 'auto');
    wasFocused.current = focused;
  }, [focused, model]);
  useEffect(
    () => () => {
      saveAll(model, 'auto');
      if (changeTimer.current) clearTimeout(changeTimer.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [model],
  );

  const onEdited = () => {
    if (changeTimer.current) clearTimeout(changeTimer.current);
    changeTimer.current = setTimeout(() => model.changed(), 250);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => saveAll(model, 'auto'), 15_000);
  };

  const setLeft = (t: LeftTool) => {
    model.leftTool = model.leftTool === t ? null : t;
    model.changed();
  };
  const setBottom = (t: BottomTool, toggle = true) => {
    model.bottomTool = toggle && model.bottomTool === t ? null : t;
    if (model.bottomTool === null) model.editorFocusSeq++;
    model.changed();
  };

  const runActive = (debug = false) => {
    if (activeConfig) startRun(model, activeConfig, { debug });
    else model.openDialog({ kind: 'editConfigs' });
  };

  const openLocation = (simpleClass: string, line: number) => {
    const p = paths.find((x) => x.endsWith(`/${simpleClass}.java`) || x.endsWith(`/${simpleClass}.groovy`));
    if (p) openFile(model, p, { line });
  };

  const diffWorking = (path: string) => {
    if (!gitRepo) return;
    model.openDiff({ id: `diff:HEAD:${path}`, title: `${path.split('/').pop()} (HEAD vs local)`, leftTitle: 'HEAD (Read-only)', rightTitle: 'Your version', left: head[path] ?? '', right: model.buffers.get(path)?.text ?? files[path] ?? '', path });
  };

  /* ── commands (menu, toolbar, keyboard) ── */
  const cmd = (id: string) => {
    const ed = (c: Parameters<NonNullable<IdeModel['editorCmd']>>[0]) => model.editorCmd?.(c);
    const sel = model.selectedNode;
    const selDir = sel === null ? '' : files[sel] !== undefined ? sel.split('/').slice(0, -1).join('/') : sel;
    const target = model.active && !model.diffs.has(model.active) ? model.active : sel && files[sel] !== undefined ? sel : null;
    if (id.startsWith('tw:')) {
      const t = id.slice(3);
      if (t === 'project' || t === 'commit') setLeft(t);
      else setBottom(t as BottomTool);
      return;
    }
    if (id.startsWith('openRecent:')) return props.onOpenProject(id.slice(11) as RepoId);
    switch (id) {
      case 'save':
        if (!saveAll(model, 'explicit')) model.setStatus('All files are up-to-date');
        return;
      case 'getFromVcs':
        return model.openDialog({ kind: 'getFromVcs' });
      case 'openProject':
        return model.openDialog({ kind: 'openProject' });
      case 'closeProject':
        return props.onCloseProject();
      case 'exit':
        return props.onExit();
      case 'settings':
        return model.openDialog({ kind: 'settings' });
      case 'about':
        return model.openDialog({ kind: 'about' });
      case 'codeWithMe':
        return model.openDialog({ kind: 'codeWithMe' });
      case 'newClass':
        return model.openDialog({ kind: 'newClass', dir: selDir });
      case 'newFile':
        return model.openDialog({ kind: 'newFile', dir: selDir, what: 'File' });
      case 'newDirectory':
        return model.openDialog({ kind: 'newFile', dir: selDir, what: 'Directory' });
      case 'newPackage':
        return model.openDialog({ kind: 'newFile', dir: selDir, what: 'Package' });
      case 'undo':
      case 'redo':
      case 'cut':
      case 'copy':
      case 'paste':
      case 'selectAll':
      case 'comment':
      case 'reformat':
      case 'moveLineUp':
      case 'moveLineDown':
      case 'moveStatementUp':
      case 'moveStatementDown':
        ed(id);
        return;
      case 'find':
      case 'replace': {
        const b = model.active ? model.buffers.get(model.active) : undefined;
        if (!b) return;
        const selText = b.text.slice(b.start, b.end);
        model.find = { ...model.find, open: true, replace: id === 'replace', query: selText && !selText.includes('\n') ? selText : model.find.query, focusSeq: model.find.focusSeq + 1 };
        model.changed();
        return;
      }
      case 'findNext':
      case 'findPrev':
        if (!model.find.open && model.find.query) {
          model.find = { ...model.find, open: true };
          model.changed();
        }
        model.findNav?.(id === 'findNext' ? 1 : -1);
        return;
      case 'findInFiles': {
        const b = model.active ? model.buffers.get(model.active) : undefined;
        const q = b ? b.text.slice(b.start, b.end) : '';
        return model.openDialog({ kind: 'findInFiles', query: q && !q.includes('\n') ? q : undefined });
      }
      case 'gotoLine':
        return model.active && model.buffers.has(model.active) ? model.openDialog({ kind: 'gotoLine' }) : undefined;
      case 'gotoFile':
        return model.openDialog({ kind: 'gotoFile', mode: 'files' });
      case 'searchEverywhere':
        return model.openDialog({ kind: 'gotoFile', mode: 'all' });
      case 'recentFiles':
        return model.openDialog({ kind: 'recentFiles' });
      case 'back':
      case 'forward': {
        const i = model.navIndex + (id === 'back' ? -1 : 1);
        const n = model.nav[i];
        if (!n) return;
        model.navIndex = i;
        const b = model.buffers.get(n.path) ?? null;
        if (files[n.path] !== undefined || b) {
          model.openBuffer(n.path, b?.text ?? files[n.path]);
          model.requestReveal(n.path, n.pos);
          model.changed();
        }
        return;
      }
      case 'contextActions':
        return model.active && model.buffers.has(model.active) ? model.openDialog({ kind: 'contextActions' }) : undefined;
      case 'rename':
        return target ? model.openDialog({ kind: 'rename', path: target }) : undefined;
      case 'move':
        return target ? model.openDialog({ kind: 'move', path: target }) : undefined;
      case 'build':
        buildProject(model);
        return;
      case 'run':
        return runActive(false);
      case 'debug':
        return runActive(true);
      case 'stop':
        return stopRun(model, model.runs.find((t) => t.runId && !t.stopped && !runStateOf(t.runId).done));
      case 'editConfigs':
        return model.openDialog({ kind: 'editConfigs' });
      case 'commit':
        model.leftTool = 'commit';
        model.commitFocusSeq++;
        model.changed();
        return;
      case 'push':
        return canGit ? (saveAll(model, 'auto'), model.openDialog({ kind: 'push' })) : undefined;
      case 'pull':
        return canGit ? model.openDialog({ kind: 'pull' }) : undefined;
      case 'update':
        return canGit ? model.openDialog({ kind: 'pull' }) : undefined;
      case 'branches':
        return canGit ? model.openDialog({ kind: 'branches' }) : undefined;
      case 'newBranch':
        return canGit ? model.openDialog({ kind: 'newBranch' }) : undefined;
      case 'defaultLayout':
        model.leftTool = 'project';
        model.bottomTool = null;
        model.leftWidth = 300;
        model.bottomHeight = 260;
        saveLayout(300, 260);
        model.changed();
        return;
    }
  };

  const actionsList: ActionEntry[] = actionEntries(model.runConfig, cmd);

  /* ── keyboard (Apps §4.12) ── */
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Shift') otherKeySinceShift.current = true;
    if (e.defaultPrevented || model.dialog) return;
    const k = e.key;
    const id = keyToCommand(e);
    if (id === 'closeTab') {
      if (model.active) model.closeTab(model.active);
      e.preventDefault();
      return;
    }
    if (id) {
      e.preventDefault();
      e.stopPropagation();
      cmd(id);
      return;
    }
    if (k === 'Escape') {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && ae.closest('.ij-toolwin') && model.active) {
        model.editorFocusSeq++;
        model.changed();
        e.preventDefault();
      }
    }
  };
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key !== 'Shift' || model.dialog) return;
    const now = performance.now();
    if (!otherKeySinceShift.current && now - lastShiftUp.current < 350) {
      lastShiftUp.current = 0;
      cmd('searchEverywhere');
    } else lastShiftUp.current = now;
    otherKeySinceShift.current = false;
  };

  const drag = (kind: 'left' | 'bottom', e: React.MouseEvent) => startSplitterDrag(model, kind, e);

  /* ── derived panels ── */
  const activeBuffer = model.active ? model.buffers.get(model.active) : undefined;
  const projectErrors = useMemo(() => {
    const out: { path: string; problems: ReturnType<typeof inspectFile> }[] = [];
    for (const p of paths) {
      const mode = inspectionModeFor(repo, p);
      if (mode === 'none') continue;
      const text = model.buffers.get(p)?.text ?? files[p];
      const probs = inspectFile(repo, p, text).filter((x) => x.severity === 'error');
      if (probs.length) out.push({ path: p, problems: probs });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths, files, repo, model.getVersion()]);
  const fileProblems = activeBuffer ? inspectFile(repo, activeBuffer.path, activeBuffer.text) : [];
  const menus = buildMenus(cmd, { hasProject: true, hasEditor: !!activeBuffer, canGit, runConfig: model.runConfig, running: anyRunning, recentProjects: props.recentProjects.filter((r) => r !== repo) });

  const navSegs = model.active && !model.diffs.has(model.active) ? model.active.split('/') : [];
  const local = gitRepo?.local;
  const statusMsg = progress
    ? progress
    : model.lastTestStatus && model.lastTestStatus.passed !== null
      ? `${model.lastTestStatus.passed ? 'Tests passed' : 'Tests failed'}: ${model.lastTestStatus.count} (${performance.now() - model.lastTestStatus.atReal < 60_000 ? 'moments ago' : `${Math.round((performance.now() - model.lastTestStatus.atReal) / 60_000)} minutes ago`})`
      : model.statusText;

  const runConfigMenu = (e: React.MouseEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const p = rootPoint(rootEl, r.left, r.bottom);
    setToolbarMenu({
      x: p.x,
      y: p.y,
      items: [
        ...configs.map((c) => ({
          label: c.name,
          icon: <FileIcon path={c.testPath} test={c.kind === 'junit'} />,
          onClick: () => {
            model.runConfig = c.name;
            model.changed();
          },
        })),
        ...(configs.length ? [{ separator: true }] : []),
        { label: 'Edit Configurations…', onClick: () => cmd('editConfigs') },
      ],
    });
  };

  const bottomTitle: Record<string, string> = { run: 'Run', terminal: 'Terminal', problems: 'Problems', git: 'Git', todo: 'TODO' };

  return (
    <div style={{ display: 'contents' }} onKeyDown={onKeyDown} onKeyUp={onKeyUp}>
      <MenuBar menus={menus} />
      <NavToolbar
        repo={repo}
        navSegs={navSegs}
        activeConfig={activeConfig}
        anyRunning={anyRunning}
        canGit={canGit}
        cmd={cmd}
        onRun={runActive}
        onRunConfigMenu={runConfigMenu}
        onNavSeg={(p) => {
          for (const a of ancestorsOf(p, buildTree(paths))) model.expanded.add(a);
          model.selectedNode = p;
          model.leftTool = 'project';
          model.changed();
        }}
        onShowHistory={() => setBottom('git', false)}
      />
      {cwm ? <div className="ij-guest-banner">You are a guest in {props.cwmName}&apos;s project</div> : null}
      <div className="ij-body">
        <div className="ij-stripe ij-stripe-left" role="toolbar" aria-label="Left tool windows">
          <button type="button" className={`ij-stripe-btn${model.leftTool === 'project' ? ' ij-on' : ''}`} onClick={() => setLeft('project')}>
            <IcProjectTw size={13} /> <span className="ij-un">1</span>: Project
          </button>
          <button type="button" className={`ij-stripe-btn${model.leftTool === 'commit' ? ' ij-on' : ''}`} onClick={() => setLeft('commit')}>
            <IcCommit size={13} /> <span className="ij-un">0</span>: Commit
          </button>
        </div>
        <div className="ij-center">
          <div className="ij-hsplit">
            {model.leftTool ? (
              <>
                <div className="ij-toolwin" style={{ width: model.leftWidth, flex: 'none', position: 'relative' }}>
                  <div className="ij-tw-head">
                    <span className="ij-tw-title">{model.leftTool === 'project' ? 'Project' : 'Commit'}</span>
                    {model.leftTool === 'project' ? <IcChevronDown size={12} /> : null}
                    <div className="ij-tw-actions">
                      <button type="button" className="ij-tbtn" title="Hide (Shift+Esc)" aria-label="Hide" onClick={() => setLeft(model.leftTool)}>
                        –
                      </button>
                    </div>
                  </div>
                  <div className="ij-tw-body">
                    {model.leftTool === 'project' ? (
                      <ProjectView
                        model={model}
                        repo={repo}
                        rootLabel={root}
                        files={files}
                        extraDirs={[...model.virtualDirs]}
                        gitRepo={gitRepo}
                        head={head}
                        configs={configs}
                        canGit={canGit}
                        onOpen={(p) => openFile(model, p)}
                        onRun={(c) => startRun(model, c)}
                        onOpenTerminal={() => setBottom('terminal', false)}
                      />
                    ) : (
                      <CommitPanel model={model} gitRepo={gitRepo} canGit={canGit} onDiff={diffWorking} onPushAfter={() => model.openDialog({ kind: 'push' })} />
                    )}
                  </div>
                </div>
                <div className="ij-splitter-v" onMouseDown={(e) => drag('left', e)} role="separator" aria-orientation="vertical" />
              </>
            ) : null}
            <EditorPane
              model={model}
              repo={repo}
              files={files}
              gitRepo={gitRepo}
              head={head}
              canGit={canGit}
              configs={configs}
              windowFocused={focused}
              onRun={(c) => startRun(model, c)}
              onContextActions={() => cmd('contextActions')}
              onEdited={onEdited}
            />
          </div>
          {model.bottomTool ? (
            <>
              <div className="ij-splitter-h" onMouseDown={(e) => drag('bottom', e)} role="separator" aria-orientation="horizontal" />
              <div className="ij-toolwin ij-bottomwin" style={{ height: model.bottomHeight }}>
                <div className="ij-tw-head">
                  <span className="ij-tw-title">{bottomTitle[model.bottomTool]}:</span>
                  {model.bottomTool === 'run' ? (
                    <RunTabsHeader model={model} />
                  ) : model.bottomTool === 'terminal' ? (
                    <div className="ij-tw-tabs">
                      <span className="ij-tw-tab ij-on">Local</span>
                    </div>
                  ) : model.bottomTool === 'git' ? (
                    <div className="ij-tw-tabs">
                      <span className="ij-tw-tab ij-on">Log: {local?.branch ?? gitRepo?.defaultBranch ?? 'main'}</span>
                    </div>
                  ) : null}
                  <div className="ij-tw-actions">
                    <button type="button" className="ij-tbtn" title="Hide (Shift+Esc)" aria-label="Hide" onClick={() => setBottom(model.bottomTool)}>
                      –
                    </button>
                  </div>
                </div>
                <div className="ij-tw-body">
                  {model.bottomTool === 'run' ? (
                    <RunPanel model={model} windowFocused={focused} onOpenLocation={openLocation} />
                  ) : model.bottomTool === 'terminal' ? (
                    <div style={{ flex: 1, minWidth: 0, display: 'flex' }}>
                      <TerminalApp windowId={`${props.windowId}:terminal`} params={{ embedded: true, cwd: root }} embedded focused={focused && model.bottomTool === 'terminal'} wm={getWindowManager() ?? undefined} />
                    </div>
                  ) : model.bottomTool === 'problems' ? (
                    <ProblemsPanel
                      model={model}
                      activePath={activeBuffer?.path ?? null}
                      fileProblems={fileProblems}
                      projectErrors={projectErrors}
                      inspectionsDisabled={repo === 'pigeon' && (!activeBuffer || activeBuffer.path.endsWith('.json'))}
                      onGoto={(p, line, col) => openFile(model, p, { line, col })}
                    />
                  ) : model.bottomTool === 'git' ? (
                    <GitLogPanel
                      model={model}
                      gitRepo={gitRepo}
                      onDiffCommitFile={(c, p) => {
                        if (!gitRepo) return;
                        const before = c.parent ? (treeAt(gitRepo, c.parent)[p] ?? '') : '';
                        model.openDiff({ id: `diff:${c.sha}:${p}`, title: `${p.split('/').pop()} (${c.sha.slice(0, 7)})`, leftTitle: c.parent ? c.parent.slice(0, 7) : 'Empty', rightTitle: c.sha.slice(0, 7), left: before, right: c.changes[p] ?? '', path: p });
                      }}
                    />
                  ) : (
                    <TodoPanel files={files} onOpen={(p, line) => openFile(model, p, { line })} />
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="ij-stripe ij-stripe-bottom" role="toolbar" aria-label="Bottom tool windows">
        {(
          [
            ['run', <IcRun key="r" size={13} />, '4', 'Run'],
            ['terminal', <IcTerminal key="t" size={13} />, '', 'Terminal'],
            ['problems', <IcProblems key="p" size={13} />, '6', 'Problems'],
            ['git', <IcBranch key="g" size={13} />, '9', 'Git'],
            ['todo', <IcTodo key="d" size={13} />, '', 'TODO'],
          ] as [BottomTool, React.ReactNode, string, string][]
        ).map(([t, ic, n, label]) => (
          <button key={t} type="button" className={`ij-stripe-btn${model.bottomTool === t ? ' ij-on' : ''}`} onClick={() => setBottom(t)}>
            {ic}
            {n ? (
              <>
                <span className="ij-un">{n}</span>:{' '}
              </>
            ) : null}
            {label}
            {t === 'problems' && projectErrors.length ? <span className="ij-err"> {projectErrors.reduce((a, g) => a + g.problems.length, 0)}</span> : null}
          </button>
        ))}
      </div>
      <div className="ij-statusbar">
        {model.lastTestStatus && model.lastTestStatus.passed !== null && !progress ? model.lastTestStatus.passed ? <IcCheck size={13} /> : <IcError size={13} /> : null}
        <span className="ij-statusmsg" style={{ paddingLeft: 4 }}>
          {statusMsg}
          {progress ? <span className="ij-progress" /> : null}
        </span>
        {activeBuffer ? (
          <>
            <CaretStatus model={model} />
            <span className="ij-statusitem">LF</span>
            <span className="ij-statusitem">UTF-8</span>
            <span className="ij-statusitem">{/\.(json|ya?ml)$/.test(activeBuffer.path) ? '2 spaces' : '4 spaces'}</span>
          </>
        ) : null}
        {canGit && local ? (
          <button
            type="button"
            ref={branchBtn}
            className="ij-statusitem"
            data-hint="intellij.branchWidget"
            title="Git Branch"
            onClick={() => cmd('branches')}
          >
            <IcBranch size={12} /> Git: {local.branch}
            {local.ahead ? ` ↑${local.ahead}` : ''}
            {local.behind ? ` ↓${local.behind}` : ''}
          </button>
        ) : null}
        {fileProblems.some((p) => p.severity === 'warning') ? <IcWarning size={13} /> : null}
        <span className="ij-statusitem" title={activeBuffer?.readOnly ? 'File is read-only' : 'File is writable'}>
          <IcLock locked={!!activeBuffer?.readOnly} />
        </span>
      </div>
      <Balloons model={model} />
      {toolbarMenu ? (
        <>
          <MenuCatcher onClose={() => setToolbarMenu(null)} />
          <MenuList items={toolbarMenu.items} x={toolbarMenu.x} y={toolbarMenu.y} onClose={() => setToolbarMenu(null)} />
        </>
      ) : null}
      <DialogHost
        model={model}
        repo={repo}
        files={files}
        gitRepo={gitRepo}
        configs={configs}
        root={root}
        actions={actionsList}
        theme={props.theme}
        fontSize={props.fontSize}
        branchAnchor={(() => {
          const r = branchBtn.current?.getBoundingClientRect();
          const p = r ? rootPoint(rootEl, r.right, r.top) : { x: 600, y: 400 };
          return p;
        })()}
        virtualDirs={model.virtualDirs}
        onSettings={props.onSettings}
        onOpenProject={props.onOpenProject}
      />
    </div>
  );
}

