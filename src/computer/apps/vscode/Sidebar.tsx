/** Side bar views: Explorer (two workspace roots), Search, Source Control, Run and Debug. */
import { useMemo, useState } from 'react';
import { emitAppAction } from '@/computer/apps';
import { useGame } from '@/core/store';
import type { LabState } from '@/sim';
import { commit, discard, openFile, practiceFiles, PRACTICE_REPO, repoFiles, runLocal, scmState, stage, stopRun, sync, runState, type ScmChange } from './actions';
import { FileIcon, IconCheck, IconChevron, IconSync } from './icons';
import type { Root, VsModel } from './model';
import { cloneRepoPrompt, openFolderPrompt } from './Palette';

interface TreeNode {
  name: string;
  path: string;
  dir: boolean;
  children: TreeNode[];
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: '', path: '', dir: true, children: [] };
  for (const p of paths.sort()) {
    const parts = p.split('/');
    let cur = root;
    parts.forEach((part, i) => {
      const path = parts.slice(0, i + 1).join('/');
      const dir = i < parts.length - 1;
      let n = cur.children.find((c) => c.name === part && c.dir === dir);
      if (!n) {
        n = { name: part, path, dir, children: [] };
        cur.children.push(n);
      }
      cur = n;
    });
  }
  const sort = (n: TreeNode) => {
    n.children.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name)));
    n.children.forEach(sort);
  };
  sort(root);
  return root;
}

function Tree({ model, root, node, depth, dirty, scm }: { model: VsModel; root: Root; node: TreeNode; depth: number; dirty: Set<string>; scm: Map<string, ScmChange['letter']> }) {
  const repoName = root === 'repo' ? model.repo : PRACTICE_REPO;
  return (
    <>
      {node.children.map((c) => {
        const id = `${root}:${c.path}`;
        const open = model.expanded.has(id);
        const letter = c.dir ? null : scm.get(c.path);
        const dirChanged = c.dir && [...scm.keys()].some((p) => p.startsWith(`${c.path}/`));
        return (
          <div key={id}>
            <div
              className={`vsc-tree__row${model.selectedNode === id ? ' is-sel' : ''}${model.active === id ? ' is-active' : ''}${letter ? ` vsc-git-${letter}` : ''}${dirChanged ? ' vsc-git-dir' : ''}`}
              style={{ paddingLeft: 8 + depth * 10 }}
              data-hint={root === 'repo' ? `vscode.treeNode:${c.path}` : undefined}
              onClick={() => {
                model.selectedNode = id;
                emitAppAction('vscode', 'vscode.tree.nodeClicked', { repo: repoName, path: c.path, kind: c.dir ? 'dir' : 'file' });
                if (c.dir) {
                  if (open) model.expanded.delete(id);
                  else model.expanded.add(id);
                  model.changed();
                } else openFile(model, root, c.path);
              }}
            >
              {c.dir ? <IconChevron open={open} /> : <span className="vsc-tree__spacer" />}
              {c.dir ? null : <FileIcon name={c.name} />}
              <span className="vsc-tree__name">{c.name}</span>
              {!c.dir && dirty.has(id) ? <span className="vsc-tree__dot" title="Unsaved changes">●</span> : null}
              {letter ? <span className="vsc-tree__letter">{letter}</span> : dirChanged ? <span className="vsc-tree__letter">●</span> : null}
            </div>
            {c.dir && open ? <Tree model={model} root={root} node={c} depth={depth + 1} dirty={dirty} scm={scm} /> : null}
          </div>
        );
      })}
    </>
  );
}

function RootSection({ model, root, title, files, scm, children }: { model: VsModel; root: Root; title: string; files: Record<string, string> | null; scm: Map<string, ScmChange['letter']>; children?: React.ReactNode }) {
  const id = `${root}:`;
  const open = model.expanded.has(id);
  const tree = useMemo(() => buildTree(Object.keys(files ?? {})), [files]);
  const dirty = new Set([...model.buffers.values()].filter((b) => b.text !== b.base).map((b) => b.id));
  return (
    <div className="vsc-root">
      <div
        className="vsc-root__head"
        onClick={() => {
          if (open) model.expanded.delete(id);
          else model.expanded.add(id);
          model.changed();
        }}
      >
        <IconChevron open={open} />
        <span>{title}</span>
      </div>
      {open ? files ? <Tree model={model} root={root} node={tree} depth={1} dirty={dirty} scm={scm} /> : children : null}
    </div>
  );
}

export function Explorer({ model }: { model: VsModel }) {
  const files = useGame((s) => repoFiles(s.lab, model.repo));
  const wsFiles = useGame((s) => s.lab.workstation?.files);
  const practice = useMemo(() => practiceFiles({ workstation: { files: wsFiles } } as unknown as LabState), [wsFiles]);
  const scmRaw = useGame((s) => s.lab.repos[model.repo]);
  const scm = useMemo(() => {
    const st = scmState({ repos: { [model.repo]: scmRaw } } as unknown as LabState, model.repo);
    const m = new Map<string, ScmChange['letter']>();
    for (const c of [...(st?.staged ?? []), ...(st?.changes ?? [])]) m.set(c.path, c.letter);
    return m;
  }, [scmRaw, model.repo]);
  return (
    <div className="vsc-view">
      <div className="vsc-view__title">EXPLORER</div>
      <RootSection model={model} root="repo" title={model.repo.toUpperCase()} files={files} scm={scm}>
        <div className="vsc-empty">
          <p>You have not yet opened a folder.</p>
          <button type="button" className="vsc-btn vsc-btn--block" onClick={() => openFolderPrompt(model)}>
            Open Folder
          </button>
          <p>You can clone a repository locally.</p>
          <button type="button" className="vsc-btn vsc-btn--block" data-hint="vscode.cloneButton" onClick={() => cloneRepoPrompt(model)}>
            Clone Repository
          </button>
        </div>
      </RootSection>
      <RootSection model={model} root="practice" title="PARROT-PRACTICE" files={practice} scm={new Map()}>
        <div className="vsc-empty">
          <p>Exercises you start in Parrot Practice appear here.</p>
        </div>
      </RootSection>
    </div>
  );
}

export function SearchView({ model }: { model: VsModel }) {
  const files = useGame((s) => repoFiles(s.lab, model.repo));
  const [q, setQ] = useState(model.searchQuery);
  const results = useMemo(() => {
    if (!files || q.trim().length < 2) return [];
    const out: { path: string; hits: { line: number; text: string }[] }[] = [];
    const needle = q.toLowerCase();
    for (const [path, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
      const hits: { line: number; text: string }[] = [];
      text.split('\n').forEach((l, i) => {
        if (l.toLowerCase().includes(needle)) hits.push({ line: i + 1, text: l.trim() });
      });
      if (hits.length) out.push({ path, hits: hits.slice(0, 20) });
    }
    return out;
  }, [files, q]);
  const total = results.reduce((n, r) => n + r.hits.length, 0);
  return (
    <div className="vsc-view">
      <div className="vsc-view__title">SEARCH</div>
      <div className="vsc-view__pad">
        <input
          className="vsc-input"
          autoFocus
          placeholder="Search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            model.searchQuery = e.target.value;
          }}
        />
        {q.trim().length >= 2 ? <div className="vsc-dim vsc-small">{total ? `${total} result${total === 1 ? '' : 's'} in ${results.length} file${results.length === 1 ? '' : 's'}` : 'No results found.'}</div> : null}
      </div>
      <div className="vsc-search">
        {results.map((r) => (
          <div key={r.path}>
            <div className="vsc-search__file">
              <FileIcon name={r.path} /> {r.path.split('/').pop()} <span className="vsc-dim">{r.path.includes('/') ? r.path.slice(0, r.path.lastIndexOf('/')) : ''}</span>
              <span className="vsc-badge">{r.hits.length}</span>
            </div>
            {r.hits.map((h) => (
              <div key={h.line} className="vsc-search__hit" onClick={() => openFile(model, 'repo', r.path, { line: h.line })}>
                {h.text}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangeRow({ model, c, staged }: { model: VsModel; c: ScmChange; staged: boolean }) {
  const name = c.path.split('/').pop()!;
  const dir = c.path.includes('/') ? c.path.slice(0, c.path.lastIndexOf('/')) : '';
  return (
    <div
      className={`vsc-scm__row vsc-git-${c.letter}`}
      onClick={() => {
        if (c.letter === 'U' || c.letter === 'A' || c.letter === 'D') openFile(model, 'repo', c.path);
        else {
          const id = `diff:${c.path}`;
          if (!model.tabs.includes(id)) model.tabs = [...model.tabs, id];
          model.active = id;
          model.changed();
        }
      }}
    >
      <FileIcon name={name} />
      <span className="vsc-scm__name">{name}</span>
      <span className="vsc-dim vsc-scm__dir">{dir}</span>
      <span className="vsc-scm__actions">
        {!staged ? (
          <>
            <button
              type="button"
              title="Discard Changes"
              onClick={(e) => {
                e.stopPropagation();
                discard(model, c.path);
              }}
            >
              ↶
            </button>
            <button
              type="button"
              title="Stage Changes"
              onClick={(e) => {
                e.stopPropagation();
                stage(model, [c.path]);
              }}
            >
              +
            </button>
          </>
        ) : null}
      </span>
      <span className="vsc-scm__letter">{c.letter}</span>
    </div>
  );
}

export function ScmView({ model }: { model: VsModel }) {
  const repo = useGame((s) => s.lab.repos[model.repo]);
  const st = useMemo(() => scmState({ repos: { [model.repo]: repo } } as unknown as LabState, model.repo), [repo, model.repo]);
  const [, force] = useState(0);
  if (!st) {
    return (
      <div className="vsc-view">
        <div className="vsc-view__title">SOURCE CONTROL</div>
        <div className="vsc-empty">
          <p>The folder currently open doesn&apos;t have a git repository. You can clone a repository from GitHub.</p>
          <button type="button" className="vsc-btn vsc-btn--block" data-hint="vscode.cloneButton" onClick={() => cloneRepoPrompt(model)}>
            Clone Repository
          </button>
        </div>
      </div>
    );
  }
  const hasChanges = st.staged.length + st.changes.length > 0;
  const action = hasChanges || model.commitMessage.trim() ? 'commit' : !st.published ? 'publish' : st.ahead || st.behind ? 'sync' : 'commit';
  return (
    <div className="vsc-view">
      <div className="vsc-view__title">SOURCE CONTROL</div>
      <div className="vsc-view__pad">
        <textarea
          className="vsc-input vsc-scm__msg"
          rows={2}
          placeholder={`Message (Ctrl+Enter to commit on "${st.branch}")`}
          value={model.commitMessage}
          onChange={(e) => {
            model.commitMessage = e.target.value;
            force((n) => n + 1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              commit(model);
            }
          }}
        />
        {action === 'commit' ? (
          <button type="button" className="vsc-btn vsc-btn--block" data-hint="vscode.commitButton" disabled={!hasChanges} onClick={() => commit(model)}>
            <IconCheck /> Commit
          </button>
        ) : (
          <button type="button" className="vsc-btn vsc-btn--block" data-hint="vscode.syncButton" onClick={() => sync(model)}>
            <IconSync />
            {action === 'publish' ? ' Publish Branch' : ` Sync Changes ${st.behind ? `${st.behind}↓ ` : ''}${st.ahead ? `${st.ahead}↑` : ''}`}
          </button>
        )}
      </div>
      {st.staged.length ? (
        <div className="vsc-scm__group">
          <div className="vsc-scm__head">
            Staged Changes <span className="vsc-badge">{st.staged.length}</span>
          </div>
          {st.staged.map((c) => (
            <ChangeRow key={c.path} model={model} c={c} staged />
          ))}
        </div>
      ) : null}
      <div className="vsc-scm__group">
        <div className="vsc-scm__head">
          Changes <span className="vsc-badge">{st.changes.length}</span>
          {st.changes.length ? (
            <button type="button" className="vsc-scm__all" title="Stage All Changes" onClick={() => stage(model, st.changes.map((c) => c.path))}>
              +
            </button>
          ) : null}
        </div>
        {st.changes.map((c) => (
          <ChangeRow key={c.path} model={model} c={c} staged={false} />
        ))}
      </div>
      <div className="vsc-view__pad vsc-dim vsc-small">
        On branch <b>{st.branch}</b>
        {st.published ? '' : ' (not published)'} · {st.ahead}↑ {st.behind}↓
      </div>
    </div>
  );
}

export function RunView({ model }: { model: VsModel }) {
  const files = useGame((s) => repoFiles(s.lab, model.repo));
  const robot = useGame((s) => s.lab.workstation?.configProperties?.['robotName'] ?? '');
  useGame((s) => (model.runId ? s.lab.local?.runs?.[model.runId]?.state : null));
  const tests = Object.keys(files ?? {}).filter((p) => p.startsWith('tests/') && p.endsWith('.json') && !p.includes('_templates'));
  const active = model.activeBuffer();
  const current = active?.root === 'repo' && tests.includes(active.path) ? active.path : null;
  const running = !!model.runId && !runState(model.runId).done;
  return (
    <div className="vsc-view">
      <div className="vsc-view__title">RUN AND DEBUG</div>
      <div className="vsc-view__pad">
        {model.repo !== 'parrot' ? (
          <p className="vsc-dim">LSTR tests live in the parrot folder. Open it to run them.</p>
        ) : (
          <>
            <button type="button" className="vsc-btn vsc-btn--block" data-hint="vscode.runButton" disabled={!current || running} onClick={() => current && runLocal(model, current)}>
              ▶ Run LSTR Test{current ? `: ${current.split('/').pop()}` : ''}
            </button>
            {running ? (
              <button type="button" className="vsc-btn vsc-btn--block vsc-btn--secondary" onClick={() => stopRun(model)}>
                ■ Stop
              </button>
            ) : null}
            <p className="vsc-dim vsc-small">
              Runs the Android LSTR runner locally against the robot named in config.properties
              {robot ? (
                <>
                  {' '}
                  (<b>{robot}</b>)
                </>
              ) : (
                ' — none set yet'
              )}
              . To run on Jenkins instead: commit, push your branch, and set the job&apos;s BRANCH parameter.
            </p>
            <div className="vsc-scm__head">Tests</div>
            {tests.map((t) => (
              <div key={t} className={`vsc-scm__row${t === current ? ' is-sel' : ''}`} onClick={() => openFile(model, 'repo', t)}>
                <FileIcon name={t} />
                <span className="vsc-scm__name">{t.split('/').pop()}</span>
                <span className="vsc-dim vsc-scm__dir">{t.slice(6, t.lastIndexOf('/'))}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
