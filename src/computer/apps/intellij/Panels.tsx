/**
 * Tool windows: Problems (Apps §4.6), Commit (§4.10, Alt+0) and the Git Log (§4.10, Alt+9).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtClock, fmtDate } from '@/computer/apps';
import { personName } from '@/content/team';
import type { GitCommit, GitRepo } from '@/sim';
import { gitCommit } from './actions';
import { FileIcon, IcError, IcRollback, IcWarning } from './icons';
import type { IdeModel } from './ideModel';
import type { Problem } from './inspections';
import { changedPaths, commitsFrom, shortSha, treeAt } from './vcs';

export const authorName = (a: string) => (a === 'player' ? 'engineer' : personName(a) || a);
export const commitDate = (ms: number) => `${fmtDate(ms)}, ${fmtClock(ms)}`;

/* ───────────────────────────── Problems ───────────────────────────── */

export function ProblemsPanel(props: {
  model: IdeModel;
  activePath: string | null;
  fileProblems: Problem[];
  projectErrors: { path: string; problems: Problem[] }[];
  inspectionsDisabled: boolean;
  onGoto(path: string, line: number, col: number): void;
}) {
  const [tab, setTab] = useState<'file' | 'project'>('file');
  const groups = tab === 'file' ? (props.activePath ? [{ path: props.activePath, problems: props.fileProblems }] : []) : props.projectErrors;
  return (
    <div className="ij-commit">
      <div className="ij-tw-head" style={{ borderBottom: 0 }}>
        <div className="ij-tw-tabs">
          <button type="button" className={`ij-tw-tab${tab === 'file' ? ' ij-on' : ''}`} onClick={() => setTab('file')}>
            File{props.activePath ? ` ${props.activePath.split('/').pop()}` : ''}
            {props.fileProblems.length ? ` ${props.fileProblems.length}` : ''}
          </button>
          <button type="button" className={`ij-tw-tab${tab === 'project' ? ' ij-on' : ''}`} onClick={() => setTab('project')}>
            Project Errors
          </button>
        </div>
      </div>
      <div className="ij-plist">
        {props.inspectionsDisabled ? (
          <div className="ij-prow ij-dim">Inspections are disabled for this project</div>
        ) : groups.every((g) => !g.problems.length) ? (
          <div className="ij-prow ij-dim">{tab === 'file' ? (props.activePath ? 'No problems in this file' : 'No file is open') : 'No errors found by the IDE'}</div>
        ) : (
          groups
            .filter((g) => g.problems.length)
            .map((g) => (
              <div key={g.path}>
                <div className="ij-prow">
                  <FileIcon path={g.path} /> {g.path.split('/').pop()} <span className="ij-dim">{g.path.split('/').slice(0, -1).join('/')}</span>
                  <span className="ij-dim">
                    {g.problems.length} problem{g.problems.length === 1 ? '' : 's'}
                  </span>
                </div>
                {g.problems.map((p, i) => (
                  <div key={i} className="ij-prow" style={{ paddingLeft: 30 }} role="button" tabIndex={0} onClick={() => props.onGoto(g.path, p.line, p.col)} onKeyDown={(e) => e.key === 'Enter' && props.onGoto(g.path, p.line, p.col)}>
                    {p.severity === 'error' ? <IcError size={14} /> : <IcWarning size={14} />} {p.message} <span className="ij-dim">:{p.line}</span>
                  </div>
                ))}
              </div>
            ))
        )}
      </div>
    </div>
  );
}

/* ───────────────────────────── Commit ───────────────────────────── */

export function CommitPanel(props: { model: IdeModel; gitRepo: GitRepo | null; canGit: boolean; onDiff(path: string): void; onPushAfter(): void }) {
  const { model, gitRepo } = props;
  const head = useMemo(() => (gitRepo?.local ? treeAt(gitRepo, gitRepo.local.headSha) : {}), [gitRepo]);
  const changes = useMemo(() => (gitRepo ? changedPaths(gitRepo, head) : []), [gitRepo, head]);
  const tracked = changes.filter((c) => c.status !== 'unversioned');
  const unversioned = changes.filter((c) => c.status === 'unversioned');
  const [error, setError] = useState<string | null>(null);
  const [focusRow, setFocusRow] = useState<string | null>(null);
  const sel = model.commitSelection ?? new Set(tracked.map((c) => c.path));
  const msg = model.commitMessage;
  const msgRef = useRef<HTMLTextAreaElement | null>(null);
  const focusSeq = model.commitFocusSeq;
  useEffect(() => {
    if (focusSeq) msgRef.current?.focus();
  }, [focusSeq]);

  if (!props.canGit) return <div className="ij-empty-editor">Version control is managed by the host</div>;
  if (!gitRepo?.local) return <div className="ij-empty-editor">No local repository</div>;

  const toggle = (p: string) => {
    const s = new Set(sel);
    if (s.has(p)) s.delete(p);
    else s.add(p);
    model.commitSelection = s;
    model.changed();
  };

  const doCommit = (push: boolean) => {
    const files = changes.filter((c) => sel.has(c.path)).map((c) => c.path);
    if (!files.length) return setError('Select files to commit');
    if (!msg.trim()) return setError('Specify commit message');
    setError(null);
    const r = gitCommit(model, files, msg.trim());
    if (r.ok && push) props.onPushAfter();
  };

  const row = (c: { path: string; status: string }) => (
    <div
      key={c.path}
      className={`ij-prow${focusRow === c.path ? ' ij-selected' : ''}`}
      style={{ paddingLeft: 26 }}
      onMouseDown={() => setFocusRow(c.path)}
      onDoubleClick={() => props.onDiff(c.path)}
    >
      <input type="checkbox" checked={sel.has(c.path)} onChange={() => toggle(c.path)} aria-label={`Include ${c.path}`} />
      <FileIcon path={c.path} />
      <span className={`ij-vcs-${c.status}`}>{c.path.split('/').pop()}</span>
      <span className="ij-dim">{c.path.split('/').slice(0, -1).join('/')}</span>
    </div>
  );

  return (
    <div className="ij-commit">
      <div className="ij-tw-head">
        <button type="button" className="ij-tbtn" title="Rollback…" aria-label="Rollback" disabled={!focusRow} onClick={() => focusRow && model.openDialog({ kind: 'rollback', paths: [focusRow] })}>
          <IcRollback />
        </button>
        <button type="button" className="ij-tbtn" title="Show Diff (Ctrl+D)" aria-label="Show Diff" disabled={!focusRow} onClick={() => focusRow && props.onDiff(focusRow)}>
          ⇄
        </button>
        <span className="ij-dim" style={{ marginLeft: 'auto' }}>
          ⎇ {gitRepo.local.branch}
        </span>
      </div>
      <div className="ij-commit-tree" role="tree" aria-label="Changes">
        <div className="ij-prow">
          <input
            type="checkbox"
            aria-label="Include all changes"
            checked={tracked.length > 0 && tracked.every((c) => sel.has(c.path))}
            onChange={(e) => {
              const s = new Set(sel);
              for (const c of tracked) e.target.checked ? s.add(c.path) : s.delete(c.path);
              model.commitSelection = s;
              model.changed();
            }}
          />
          <b>Changes</b> <span className="ij-dim">{tracked.length} file{tracked.length === 1 ? '' : 's'}</span>
        </div>
        {tracked.map(row)}
        {unversioned.length ? (
          <>
            <div className="ij-prow">
              <input
                type="checkbox"
                aria-label="Include unversioned files"
                checked={unversioned.every((c) => sel.has(c.path))}
                onChange={(e) => {
                  const s = new Set(sel);
                  for (const c of unversioned) e.target.checked ? s.add(c.path) : s.delete(c.path);
                  model.commitSelection = s;
                  model.changed();
                }}
              />
              <b>Unversioned Files</b> <span className="ij-dim">{unversioned.length} file{unversioned.length === 1 ? '' : 's'}</span>
            </div>
            {unversioned.map(row)}
          </>
        ) : null}
        {!changes.length ? <div className="ij-prow ij-dim">No changes</div> : null}
      </div>
      <div className="ij-commit-msg">
        <label className="ij-check ij-dim" title="Amend is not available in this lab">
          <input type="checkbox" disabled /> Amend
        </label>
        <textarea
          ref={msgRef}
          className="ij-textarea"
          placeholder="Commit Message"
          aria-label="Commit Message"
          value={msg}
          onChange={(e) => {
            model.commitMessage = e.target.value;
            setError(null);
            model.changed();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              doCommit(false);
            }
          }}
        />
        {error ? <div className="ij-inline-err">{error}</div> : null}
        <div className="ij-commit-actions">
          <button type="button" className="ij-btn ij-default" data-hint="intellij.commitButton" onClick={() => doCommit(false)}>
            Commit
          </button>
          <button type="button" className="ij-btn" data-hint="intellij.pushButton" onClick={() => doCommit(true)}>
            Commit and Push…
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Git Log ───────────────────────────── */

export function GitLogPanel(props: { model: IdeModel; gitRepo: GitRepo | null; onDiffCommitFile(commit: GitCommit, path: string): void }) {
  const { model, gitRepo } = props;
  const commits = useMemo(() => (gitRepo?.local ? commitsFrom(gitRepo, gitRepo.local.headSha) : gitRepo ? commitsFrom(gitRepo, gitRepo.branches[gitRepo.defaultBranch]) : []), [gitRepo]);
  if (!gitRepo) return <div className="ij-empty-editor">No Git repository</div>;
  const selSha = model.gitLogSelected ?? commits[0]?.sha ?? null;
  const sel = commits.find((c) => c.sha === selSha) ?? null;
  const branch = gitRepo.local?.branch ?? gitRepo.defaultBranch;
  const remoteHead = gitRepo.branches[branch];
  return (
    <div className="ij-log">
      <div className="ij-log-list" role="listbox" aria-label="Commits">
        {commits.map((c) => (
          <div
            key={c.sha}
            role="option"
            aria-selected={c.sha === selSha}
            className={`ij-log-row${c.sha === selSha ? ' ij-selected' : ''}`}
            onMouseDown={() => {
              model.gitLogSelected = c.sha;
              model.changed();
            }}
          >
            <span className="ij-log-dot" />
            <span>
              {c.sha === gitRepo.local?.headSha ? <span className="ij-log-ref">{branch}</span> : null}
              {c.sha === remoteHead ? <span className="ij-log-ref" style={{ background: '#5c4a2a' }}>origin/{branch}</span> : null}
              {c.message.split('\n')[0]}
            </span>
            <span className="ij-dim">{authorName(c.author)}</span>
            <span className="ij-dim">{commitDate(c.atMs)}</span>
          </div>
        ))}
        {!commits.length ? <div className="ij-prow ij-dim">No commits</div> : null}
      </div>
      <div className="ij-log-side">
        {sel ? (
          <>
            {Object.keys(sel.changes)
              .sort()
              .slice(0, 200)
              .map((p) => (
                <div key={p} className="ij-prow" onDoubleClick={() => props.onDiffCommitFile(sel, p)} title="Double-click to show diff">
                  <FileIcon path={p} />
                  <span className={sel.changes[p] === null ? 'ij-vcs-deleted' : sel.parent ? 'ij-vcs-modified' : 'ij-vcs-added'}>{p.split('/').pop()}</span>
                  <span className="ij-dim">{p.split('/').slice(0, -1).join('/')}</span>
                </div>
              ))}
            <div style={{ marginTop: 10, whiteSpace: 'pre-wrap' }}>{sel.message}</div>
            <div className="ij-dim" style={{ marginTop: 8 }}>
              {shortSha(sel.sha)} {authorName(sel.author)} on {commitDate(sel.atMs)}
            </div>
          </>
        ) : (
          <span className="ij-dim">Select a commit</span>
        )}
      </div>
    </div>
  );
}

