/**
 * Visual Studio Code (Dark Modern) — the editor the team uses for Parrot's raw JSON tests.
 * Workspace = the cloned repo folder (default parrot, `~/IdeaProjects/<repo>`) + `~/parrot-practice`.
 * Saves → `sim.git.writeFile` / `sim.host.writeFile`; git → `sim.git.*`; ▶ → `sim.runner.runLocal('parrot')`.
 * VS Code's JSON support flags raw syntax only — it knows nothing about LSTR (no Parrot-aware linter).
 * Routes: `/`, `/folder/:repo`, `/folder/:repo/file/*path`, `/practice`. Export name: `VSCodeApp`.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { APP_ROUTES, emitAppAction, matchRoute, type AppProps } from '@/computer/apps';
import { useGame } from '@/core/store';
import type { RepoId } from '@/sim';
import { diffLines } from '@/sim/devops/gitCore';
import { getState } from '@/core/store';
import { formatDocument, headText, openFile, openFolder, problemCount, REPOS, saveAll, saveBuffer, scmState, sync, syncBuffers } from './actions';
import { Editor } from './Editor';
import { IconAccount, IconBranch, IconFiles, IconFlask, IconGear, IconRun, IconScm, IconSearch, IconSync, FileIcon } from './icons';
import { diagnoseJson, offsetToLineCol } from './jsonLang';
import { getVsModel, releaseVsModel, type SideView, type VsModel } from './model';
import { Palette, branchPicker, cloneRepoPrompt, commandPalette, gotoLinePrompt, openFolderPrompt, quickOpen, showPanel, toggleSidebar, togglePanel, commitPrompt, createBranchPrompt } from './Palette';
import { Panel, problemsOf } from './Panel';
import { PracticeView } from './PracticeView';
import { Explorer, RunView, ScmView, SearchView } from './Sidebar';
import './vscode.css';

function parseRoute(route: string | undefined): { repo: RepoId | null; file: string | null; practice: boolean } {
  if (!route) return { repo: null, file: null, practice: false };
  if (matchRoute(APP_ROUTES.vscode.practice, route)) return { repo: null, file: null, practice: true };
  const f = matchRoute(APP_ROUTES.vscode.file, route);
  const p = f ?? matchRoute(APP_ROUTES.vscode.folder, route);
  if (!p) return { repo: null, file: null, practice: false };
  const repo = REPOS.includes(p.params.repo as RepoId) ? (p.params.repo as RepoId) : null;
  return { repo, file: f ? decodeURIComponent(f.params.path) : null, practice: false };
}

const MENUS: { label: string; items: { label: string; hint?: string; run: (m: VsModel) => void }[] }[] = [
  {
    label: 'File',
    items: [
      { label: 'Open Folder...', run: (m) => openFolderPrompt(m) },
      { label: 'Save', hint: 'Ctrl+S', run: (m) => saveBuffer(m, m.activeBuffer()) },
      { label: 'Save All', run: (m) => void saveAll(m) },
      { label: 'Close Editor', hint: 'Ctrl+W', run: (m) => closeActive(m) },
    ],
  },
  {
    label: 'Edit',
    items: [
      { label: 'Find', hint: 'Ctrl+F', run: (m) => m.toast('info', 'Click into the editor and press Ctrl+F.') },
      { label: 'Format Document', hint: 'Shift+Alt+F', run: (m) => formatDocument(m) },
    ],
  },
  {
    label: 'Selection',
    items: [
      { label: 'Copy Line Down', hint: 'Shift+Alt+Down', run: (m) => m.toast('info', 'In the editor: Shift+Alt+Down duplicates the current line.') },
      { label: 'Move Line Up', hint: 'Alt+Up', run: (m) => m.toast('info', 'In the editor: Alt+Up / Alt+Down move the current line.') },
    ],
  },
  {
    label: 'View',
    items: [
      { label: 'Command Palette...', hint: 'Ctrl+Shift+P', run: (m) => commandPalette(m) },
      { label: 'Explorer', hint: 'Ctrl+Shift+E', run: (m) => setSide(m, 'explorer') },
      { label: 'Search', hint: 'Ctrl+Shift+F', run: (m) => setSide(m, 'search') },
      { label: 'Source Control', hint: 'Ctrl+Shift+G', run: (m) => setSide(m, 'scm') },
      { label: 'Problems', hint: 'Ctrl+Shift+M', run: (m) => showPanel(m, 'problems') },
      { label: 'Output', run: (m) => showPanel(m, 'output') },
      { label: 'Terminal', hint: 'Ctrl+`', run: (m) => togglePanel(m, 'terminal') },
    ],
  },
  {
    label: 'Go',
    items: [
      { label: 'Go to File...', hint: 'Ctrl+P', run: (m) => quickOpen(m) },
      { label: 'Go to Line/Column...', hint: 'Ctrl+G', run: (m) => gotoLinePrompt(m) },
    ],
  },
  {
    label: 'Run',
    items: [
      { label: 'Run LSTR Test', run: (m) => setSide(m, 'run') },
      { label: 'Parrot Practice', run: (m) => setSide(m, 'practice') },
    ],
  },
  {
    label: 'Terminal',
    items: [{ label: 'New Terminal', hint: 'Ctrl+Shift+`', run: (m) => showPanel(m, 'terminal') }],
  },
  {
    label: 'Help',
    items: [
      { label: 'Show All Commands', hint: 'Ctrl+Shift+P', run: (m) => commandPalette(m) },
      {
        label: 'Parrot JSON tips',
        run: (m) =>
          m.toast('info', 'VS Code checks JSON syntax only. The red squiggle sits AFTER a missing comma; unknown actions, bad ${variables} and wrong screens only fail when LSTR runs.', undefined, 14000),
      },
    ],
  },
];

function setSide(m: VsModel, v: SideView): void {
  m.side = m.side === v ? null : v;
  if (m.side) emitAppAction('vscode', 'vscode.view.opened', { view: v });
  m.changed();
}

function closeActive(m: VsModel): void {
  if (!m.active) return;
  const b = m.buffers.get(m.active);
  if (b && b.text !== b.base) saveBuffer(m, b);
  m.closeTab(m.active);
  m.changed();
}

function DiffEditor({ model, path }: { model: VsModel; path: string }) {
  const work = useGame((s) => s.lab.repos[model.repo]?.local?.files?.[path] ?? '');
  const head = useMemo(() => headText(getState().lab, model.repo, path), [model.repo, path, work]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = useMemo(() => diffLines(head, work), [head, work]);
  return (
    <div className="vsc-diff">
      <div className="vsc-diff__bar">
        {path.split('/').pop()} (Working Tree) <span className="vsc-dim">· HEAD ↔ working tree · +{d.added} −{d.removed}</span>
        <span className="vsc-spacer" />
        <button type="button" className="vsc-btn vsc-btn--secondary" onClick={() => openFile(model, 'repo', path)}>
          Open File
        </button>
      </div>
      <div className="vsc-diff__body">
        {d.hunks.length ? (
          d.hunks.map((h, i) => (
            <div key={i} className="vsc-diff__hunk">
              <div className="vsc-diff__head">
                @@ -{h.oldStart},{h.oldLines} +{h.newStart},{h.newLines} @@
              </div>
              {h.lines.map((l, j) => (
                <div key={j} className={l[0] === '+' ? 'vsc-diff__add' : l[0] === '-' ? 'vsc-diff__del' : undefined}>
                  <span className="vsc-diff__sign">{l[0]}</span>
                  {l.slice(1)}
                </div>
              ))}
            </div>
          ))
        ) : (
          <div className="vsc-panel__empty">No changes.</div>
        )}
      </div>
    </div>
  );
}

function Watermark({ model, cloned }: { model: VsModel; cloned: boolean }) {
  return (
    <div className="vsc-watermark">
      <div className="vsc-watermark__logo" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="120" height="120">
          <path d="M17.2 2.2 9.4 9.6 4.7 6 2.6 7v10l2.1 1 4.7-3.6 7.8 7.4L21.4 20V4z" fill="#ffffff10" />
        </svg>
      </div>
      <dl>
        <dt>Show All Commands</dt>
        <dd>Ctrl + Shift + P</dd>
        <dt>Go to File</dt>
        <dd>Ctrl + P</dd>
        <dt>Toggle Terminal</dt>
        <dd>Ctrl + `</dd>
        <dt>Show Problems</dt>
        <dd>Ctrl + Shift + M</dd>
      </dl>
      {!cloned ? (
        <button type="button" className="vsc-btn" data-hint="vscode.cloneButton" onClick={() => cloneRepoPrompt(model)}>
          Clone Git Repository...
        </button>
      ) : (
        <button type="button" className="vsc-btn vsc-btn--secondary" onClick={() => setSide(model, 'practice')}>
          Open Parrot Practice
        </button>
      )}
    </div>
  );
}

export function VSCodeApp(props: AppProps) {
  const { windowId, route, params, onTitle, focused = true } = props;
  const model = useMemo(() => getVsModel(windowId), [windowId]);
  useSyncExternalStore(model.subscribe, model.getVersion, model.getVersion);
  const [menu, setMenu] = useState<number | null>(null);
  const target = parseRoute(route ?? params?.route ?? (params?.repo || params?.file ? `/folder/${params?.repo ?? 'parrot'}${params?.file ? `/file/${params.file}` : ''}` : undefined));
  const cloned = useGame((s) => !!s.lab.repos?.[model.repo]?.local);
  const repoFilesRef = useGame((s) => s.lab.repos?.[model.repo]?.local?.files);
  const wsFilesRef = useGame((s) => s.lab.workstation?.files);
  const branch = useGame((s) => s.lab.repos?.[model.repo]?.local?.branch ?? null);
  const repoState = useGame((s) => s.lab.repos?.[model.repo]);

  useEffect(() => () => releaseVsModel(windowId), [windowId]);

  // Route / open params → folder, file, practice view.
  const applied = useRef<string | null>(null);
  useEffect(() => {
    const key = `${route ?? ''}|${params?.route ?? ''}|${params?.repo ?? ''}|${params?.file ?? ''}`;
    if (applied.current === key) return;
    applied.current = key;
    if (target.practice) {
      model.side = 'practice';
      model.changed();
      return;
    }
    if (target.repo && target.repo !== model.repo && getState().lab.repos[target.repo]?.local) openFolder(model, target.repo);
    if (target.file && getState().lab.repos[model.repo]?.local) openFile(model, 'repo', target.file, { line: params?.line });
  }, [route, params, target.practice, target.repo, target.file, model]);

  // Lab changes (checkout, pull, practice resets) → refresh clean buffers.
  useEffect(() => {
    if (syncBuffers(model)) model.changed();
  }, [repoFilesRef, wsFilesRef, model]);

  const active = model.active;
  const buffer = model.activeBuffer();
  const title = buffer ? `${buffer.path.split('/').pop()}${buffer.text !== buffer.base ? ' ●' : ''} - ${buffer.root === 'repo' ? model.repo : 'parrot-practice'} - Visual Studio Code` : `${cloned ? model.repo : 'Welcome'} - Visual Studio Code`;
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;
  useEffect(() => {
    onTitleRef.current?.(title);
  }, [title]);

  const diagnostics = useMemo(() => (buffer && buffer.path.endsWith('.json') ? diagnoseJson(buffer.text) : []), [buffer, buffer?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const allProblems = problemsOf(model);
  const errCount = allProblems.reduce((n, g) => n + g.diags.filter((d) => d.severity === 'error').length, 0);
  const warnCount = allProblems.reduce((n, g) => n + g.diags.filter((d) => d.severity === 'warning').length, 0);
  const scm = useMemo(() => scmState({ repos: { [model.repo]: repoState } } as never, model.repo), [repoState, model.repo]);
  const scmCount = scm ? scm.staged.length + scm.changes.length : 0;
  const cursor = buffer ? offsetToLineCol(buffer.text, buffer.selStart) : null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if ((mod && e.shiftKey && k === 'p') || e.key === 'F1') {
      e.preventDefault();
      commandPalette(model);
    } else if (mod && !e.shiftKey && k === 'p') {
      e.preventDefault();
      quickOpen(model);
    } else if (mod && !e.shiftKey && k === 'g') {
      e.preventDefault();
      gotoLinePrompt(model);
    } else if (mod && e.shiftKey && k === 'm') {
      e.preventDefault();
      if (model.panelOpen && model.panelTab === 'problems') model.panelOpen = false;
      else {
        showPanel(model, 'problems');
        emitAppAction('vscode', 'vscode.problems.opened', { count: errCount + warnCount });
      }
      model.changed();
    } else if (mod && (e.key === '`' || e.code === 'Backquote')) {
      e.preventDefault();
      togglePanel(model, 'terminal');
    } else if (mod && !e.shiftKey && k === 'b') {
      e.preventDefault();
      toggleSidebar(model);
    } else if (mod && e.shiftKey && k === 'e') {
      e.preventDefault();
      setSide(model, 'explorer');
    } else if (mod && e.shiftKey && k === 'f') {
      e.preventDefault();
      setSide(model, 'search');
    } else if (mod && e.shiftKey && k === 'g') {
      e.preventDefault();
      setSide(model, 'scm');
    } else if (mod && !e.shiftKey && k === 'w') {
      e.preventDefault();
      closeActive(model);
    } else if (mod && !e.shiftKey && k === 's' && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      saveBuffer(model, model.activeBuffer());
    }
  };

  const activities: { id: SideView; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'explorer', label: 'Explorer (Ctrl+Shift+E)', icon: <IconFiles /> },
    { id: 'search', label: 'Search (Ctrl+Shift+F)', icon: <IconSearch /> },
    { id: 'scm', label: 'Source Control (Ctrl+Shift+G)', icon: <IconScm />, badge: scmCount },
    { id: 'run', label: 'Run and Debug', icon: <IconRun /> },
    { id: 'practice', label: 'Parrot Practice', icon: <IconFlask /> },
  ];

  return (
    <div className="vsc-root" data-app="vscode" onKeyDown={onKeyDown} onMouseDown={() => menu !== null && setMenu(null)}>
      {/* Title bar */}
      <div className="vsc-title">
        <span className="vsc-title__logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="16" height="16">
            <path d="M17.2 2.2 9.4 9.6 4.7 6 2.6 7v10l2.1 1 4.7-3.6 7.8 7.4L21.4 20V4z" fill="#3ba7f5" />
          </svg>
        </span>
        {MENUS.map((mn, i) => (
          <div key={mn.label} className="vsc-menu">
            <button
              type="button"
              className={`vsc-menu__btn${menu === i ? ' is-open' : ''}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                setMenu(menu === i ? null : i);
              }}
              onMouseEnter={() => menu !== null && setMenu(i)}
            >
              {mn.label}
            </button>
            {menu === i ? (
              <div className="vsc-menu__drop" onMouseDown={(e) => e.stopPropagation()}>
                {mn.items.map((it) => (
                  <div
                    key={it.label}
                    className="vsc-menu__item"
                    onClick={() => {
                      setMenu(null);
                      it.run(model);
                    }}
                  >
                    <span>{it.label}</span>
                    {it.hint ? <span className="vsc-dim">{it.hint}</span> : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="button" className="vsc-title__search" onClick={() => quickOpen(model)}>
          🔍 {cloned ? model.repo : 'Search'}
        </button>
        <span className="vsc-spacer" />
      </div>

      <div className="vsc-main">
        {/* Activity bar */}
        <div className="vsc-activity">
          {activities.map((a) => (
            <button key={a.id} type="button" title={a.label} data-hint={`vscode.activity:${a.id}`} className={`vsc-activity__btn${model.side === a.id ? ' is-active' : ''}`} onClick={() => setSide(model, a.id)}>
              {a.icon}
              {a.badge ? <span className="vsc-activity__badge">{a.badge}</span> : null}
            </button>
          ))}
          <span className="vsc-spacer" />
          <button type="button" className="vsc-activity__btn" title="Accounts">
            <IconAccount />
          </button>
          <button type="button" className="vsc-activity__btn" title="Manage" onClick={() => commandPalette(model)}>
            <IconGear />
          </button>
        </div>

        {/* Side bar */}
        {model.side ? (
          <div className="vsc-side">
            {model.side === 'explorer' ? <Explorer model={model} /> : null}
            {model.side === 'search' ? <SearchView model={model} /> : null}
            {model.side === 'scm' ? <ScmView model={model} /> : null}
            {model.side === 'run' ? <RunView model={model} /> : null}
            {model.side === 'practice' ? <PracticeView model={model} /> : null}
          </div>
        ) : null}

        {/* Editor group + panel */}
        <div className="vsc-center">
          <div className="vsc-editors">
            {model.tabs.length ? (
              <div className="vsc-tabs">
                {model.tabs.map((id) => {
                  const b = model.buffers.get(id);
                  const isDiff = id.startsWith('diff:');
                  const name = isDiff ? `${id.slice(5).split('/').pop()} (Working Tree)` : (b?.path.split('/').pop() ?? id);
                  const dirty = !!b && b.text !== b.base;
                  const errs = b ? problemCount(b.text, b.path) : 0;
                  return (
                    <div
                      key={id}
                      className={`vsc-tab${id === active ? ' is-active' : ''}${errs ? ' has-errors' : ''}`}
                      onMouseDown={(e) => {
                        if (e.button === 1) {
                          e.preventDefault();
                          model.closeTab(id);
                          model.changed();
                        }
                      }}
                      onClick={() => {
                        model.active = id;
                        model.focusSeq++;
                        model.changed();
                      }}
                    >
                      <FileIcon name={isDiff ? id : name} />
                      <span className="vsc-tab__name">{name}</span>
                      {errs ? <span className="vsc-tab__errs">{errs}</span> : null}
                      <button
                        type="button"
                        className={`vsc-tab__close${dirty ? ' is-dirty' : ''}`}
                        title={dirty ? 'Unsaved changes — close saves' : 'Close (Ctrl+W)'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (dirty && b) saveBuffer(model, b);
                          model.closeTab(id);
                          model.changed();
                        }}
                      >
                        <span className="vsc-tab__dot">●</span>
                        <span className="vsc-tab__x">✕</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {buffer ? (
              <div className="vsc-crumbs">
                {(buffer.root === 'repo' ? [model.repo, ...buffer.path.split('/')] : ['parrot-practice', ...buffer.path.split('/')]).map((c, i, arr) => (
                  <span key={i}>
                    {c}
                    {i < arr.length - 1 ? <span className="vsc-crumbs__sep">›</span> : null}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="vsc-editor-host">
              {buffer ? (
                <Editor key={buffer.id} model={model} buffer={buffer} repoLabel={buffer.root === 'repo' ? model.repo : 'parrot-practice'} diagnostics={diagnostics} focused={focused} />
              ) : active?.startsWith('diff:') ? (
                <DiffEditor model={model} path={active.slice(5)} />
              ) : (
                <Watermark model={model} cloned={cloned} />
              )}
            </div>
          </div>
          {model.panelOpen ? <Panel model={model} windowId={windowId} focused={focused} /> : null}
        </div>
      </div>

      {/* Status bar */}
      <div className="vsc-status">
        <span className="vsc-status__remote" title="Remote">
          ⟩⟨
        </span>
        {branch ? (
          <button type="button" className="vsc-status__item" data-hint="vscode.branchWidget" title="Checkout Branch/Tag..." onClick={() => branchPicker(model)}>
            <IconBranch /> {branch}
            {scmCount ? '*' : ''}
          </button>
        ) : null}
        {scm ? (
          <button type="button" className="vsc-status__item" title={scm.published ? 'Synchronize Changes' : 'Publish Branch'} onClick={() => sync(model)}>
            <IconSync /> {scm.published ? `${scm.behind}↓ ${scm.ahead}↑` : '☁'}
          </button>
        ) : null}
        <button
          type="button"
          className="vsc-status__item"
          data-hint="vscode.problemsWidget"
          title="Problems"
          onClick={() => {
            togglePanel(model, 'problems');
            emitAppAction('vscode', 'vscode.problems.opened', { count: errCount + warnCount });
          }}
        >
          ⊗ {errCount} ⚠ {warnCount}
        </button>
        <span className="vsc-spacer" />
        {cursor ? (
          <button type="button" className="vsc-status__item" onClick={() => gotoLinePrompt(model)}>
            Ln {cursor.line}, Col {cursor.col}
          </button>
        ) : null}
        {buffer ? (
          <>
            <span className="vsc-status__item">Spaces: 2</span>
            <span className="vsc-status__item">UTF-8</span>
            <span className="vsc-status__item">LF</span>
            <span className="vsc-status__item">{buffer.path.endsWith('.json') ? 'JSON' : buffer.path.endsWith('.md') ? 'Markdown' : 'Plain Text'}</span>
          </>
        ) : null}
        <button type="button" className="vsc-status__item" title="Parrot Practice" onClick={() => setSide(model, 'practice')}>
          🧪 Practice
        </button>
      </div>

      {model.palette ? <Palette model={model} /> : null}

      {model.toasts.length ? (
        <div className="vsc-toasts">
          {model.toasts.map((t) => (
            <div key={t.id} className={`vsc-toast vsc-toast--${t.kind}`}>
              <span className="vsc-toast__icon">{t.kind === 'error' ? '⊗' : t.kind === 'warning' ? '⚠' : 'ⓘ'}</span>
              <span className="vsc-toast__text">{t.text}</span>
              {t.actions?.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="vsc-btn"
                  onClick={() => {
                    model.dismissToast(t.id);
                    a.run();
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button type="button" className="vsc-toast__x" onClick={() => model.dismissToast(t.id)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Re-exported for the command palette / tests.
export { commitPrompt, createBranchPrompt };
