/**
 * GitHub web editor (Apps §7.6): edit or create a file, Commit changes dialog with protected-branch rule and the
 * "Create a new branch for this commit and start a pull request" flow (D5 via `actions.commitFile`).
 */
import { useMemo, useRef, useState } from 'react';
import { emitAppAction } from '@/computer/apps';
import type { GitRepo, RepoId } from '@/sim/types';
import { Oct } from '../icons';
import { useGh } from '../ctx';
import { GhHeader, Modal, NotFound } from '../Chrome';
import { Markdown, highlightAll } from '../highlight';
import { commitFile } from '../actions';
import { blobRoute, isProtected, langOf, repoRoute, splitRef, tree, treeRoute } from '../model';

function nextPatchBranch(repo: GitRepo): string {
  for (let i = 1; i < 100; i++) if (!repo.branches[`engineer-patch-${i}`]) return `engineer-patch-${i}`;
  return 'engineer-patch-100';
}

function CodeEditor(props: { value: string; onChange(v: string): void; path: string }) {
  const lang = langOf(props.path);
  const lines = useMemo(() => highlightAll(props.value, lang), [props.value, lang]);
  const count = props.value.split('\n').length;
  const ta = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="gh-editor">
      <div className="gh-editor-gutter" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <div className="gh-editor-area">
        <pre className="gh-editor-pre" aria-hidden="true">
          {lines.map((l, i) => (
            <div key={i} style={{ minHeight: 20 }}>
              {l.length ? l : '​'}
            </div>
          ))}
          {props.value.endsWith('\n') ? <div style={{ minHeight: 20 }}>{'​'}</div> : null}
        </pre>
        <textarea
          ref={ta}
          className="gh-editor-ta"
          spellCheck={false}
          wrap="off"
          value={props.value}
          aria-label="File contents"
          onChange={(e) => props.onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const s = el.selectionStart;
              const v = props.value.slice(0, s) + '  ' + props.value.slice(el.selectionEnd);
              props.onChange(v);
              requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
            }
          }}
        />
      </div>
    </div>
  );
}

export function EditPage(props: { repo: GitRepo; refPath: string; isNew: boolean }) {
  const { navigate, readOnly } = useGh();
  const repo = props.repo;
  const ref = splitRef(repo, props.refPath);
  const t = ref.sha ? tree(repo, ref.sha) : null;
  const dir = props.isNew ? ref.path : ref.path.includes('/') ? ref.path.slice(0, ref.path.lastIndexOf('/')) : '';
  const original = !props.isNew && t ? t[ref.path] ?? null : null;
  const [name, setName] = useState(props.isNew ? '' : ref.path.slice(ref.path.lastIndexOf('/') + 1));
  const [text, setText] = useState(original ?? '');
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');
  const [dialog, setDialog] = useState(false);
  const [message, setMessage] = useState('');
  const [desc, setDesc] = useState('');
  const prot = isProtected(repo.id as RepoId) && ref.branch === repo.defaultBranch;
  const [mode, setMode] = useState<'direct' | 'branch'>(prot ? 'branch' : 'direct');
  const [branchName, setBranchName] = useState(() => nextPatchBranch(repo));
  const [error, setError] = useState<string | null>(null);
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  if (!t || (!props.isNew && original === null) || readOnly)
    return (
      <>
        <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
        <NotFound />
      </>
    );
  const path = (dir ? `${dir}/` : '') + name.trim();
  const changed = props.isNew ? name.trim() !== '' : text !== original || path !== ref.path;
  const defaultMsg = props.isNew ? `Create ${name.trim() || 'new file'}` : `Update ${name.trim()}`;
  const commit = () => {
    const msg = (message.trim() || defaultMsg) + (desc.trim() ? `\n\n${desc.trim()}` : '');
    const newBranch = mode === 'branch' ? branchName.trim() : null;
    let r = commitFile(repo.id as RepoId, ref.branch, path, text, msg, newBranch);
    if (r.ok && !props.isNew && path !== ref.path) {
      r = commitFile(repo.id as RepoId, r.value.branch, ref.path, null, msg, null);
    }
    emitAppAction('github', 'github.file.committed', { repo: repo.id, branch: newBranch ?? ref.branch, path, message: msg, newBranch: !!newBranch, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setDialog(false);
    if (newBranch) navigate(repoRoute(repo.id, `compare/${ref.branch}...${newBranch}`));
    else navigate(blobRoute(repo.id, ref.branch, path));
  };
  return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <div className="gh-container">
        <div className="gh-flex" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          <a href="#" style={{ fontWeight: 600 }} onClick={(e) => (e.preventDefault(), navigate(treeRoute(repo.id, ref.branch)))}>
            {repo.name}
          </a>
          {dir
            ? dir.split('/').map((p, i, arr) => (
                <span key={i} className="gh-flex" style={{ gap: 6 }}>
                  <span className="gh-muted">/</span>
                  <a href="#" onClick={(e) => (e.preventDefault(), navigate(treeRoute(repo.id, ref.branch, arr.slice(0, i + 1).join('/'))))}>
                    {p}
                  </a>
                </span>
              ))
            : null}
          <span className="gh-muted">/</span>
          <input className="gh-input" style={{ width: 260 }} value={name} placeholder="Name your file..." onChange={(e) => setName(e.target.value)} aria-label="File name" autoFocus={props.isNew} />
          <span className="gh-muted">in</span>
          <span className="gh-branch-chip">{ref.branch}</span>
          <span className="gh-spacer" />
          <button type="button" className="gh-btn" onClick={() => navigate(props.isNew ? treeRoute(repo.id, ref.branch, dir) : blobRoute(repo.id, ref.branch, ref.path))}>
            Cancel changes
          </button>
          <button
            type="button"
            className="gh-btn gh-btn-primary"
            disabled={!changed || !name.trim()}
            onClick={() => {
              setMessage(defaultMsg);
              setError(null);
              setDialog(true);
            }}
          >
            Commit changes...
          </button>
        </div>
        {prot ? (
          <div className="gh-flash gh-flash-warn">
            <Oct name="shield" /> You’re making changes in a project you don’t have write access to the <b>&nbsp;{repo.defaultBranch}&nbsp;</b> branch of. Submitting a change will write it to a new branch in this repository so you can send a pull request.
          </div>
        ) : null}
        <div className="gh-box">
          <div className="gh-file-head">
            <div className="gh-seg">
              <button type="button" aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>
                Edit
              </button>
              <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>
                Preview
              </button>
            </div>
            <span className="gh-spacer" />
            <span className="gh-muted">Spaces · 2 · No wrap</span>
          </div>
          {tab === 'edit' ? (
            <CodeEditor value={text} onChange={setText} path={path || 'file.txt'} />
          ) : langOf(path) === 'markdown' ? (
            <Markdown text={text} />
          ) : (
            <pre style={{ margin: 0, padding: 16, fontSize: 12, overflow: 'auto' }}>{text}</pre>
          )}
        </div>
      </div>
      {dialog ? (
        <Modal
          title="Commit changes"
          onClose={() => setDialog(false)}
          width={560}
          footer={
            <>
              <button type="button" className="gh-btn" onClick={() => setDialog(false)}>
                Cancel
              </button>
              <button type="button" className="gh-btn gh-btn-primary" onClick={commit} disabled={mode === 'branch' && !branchName.trim()}>
                {mode === 'branch' ? 'Propose changes' : 'Commit changes'}
              </button>
            </>
          }
        >
          {error ? <div className="gh-flash gh-flash-error" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</div> : null}
          <label style={{ fontWeight: 600 }}>
            Commit message
            <input className="gh-input" style={{ marginTop: 6 }} value={message} onChange={(e) => setMessage(e.target.value)} autoFocus onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && commit()} />
          </label>
          <label style={{ fontWeight: 600 }}>
            Extended description
            <textarea className="gh-textarea" style={{ marginTop: 6, minHeight: 80 }} placeholder="Add an optional extended description.." value={desc} onChange={(e) => setDesc(e.target.value)} />
          </label>
          <label className="gh-flex" style={{ alignItems: 'flex-start', color: prot ? '#818b98' : undefined, cursor: prot ? 'not-allowed' : 'pointer' }}>
            <input type="radio" name="gh-commit-mode" checked={mode === 'direct'} disabled={prot} onChange={() => setMode('direct')} />
            <span>
              Commit directly to the <span className="gh-branch-chip">{ref.branch}</span> branch
              {prot ? (
                <span style={{ display: 'block', fontSize: 12, color: 'var(--gh-closed)' }}>
                  <Oct name="lock" size={12} /> You can’t commit to {ref.branch} because it is a protected branch.
                </span>
              ) : null}
            </span>
          </label>
          <label className="gh-flex" style={{ alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="radio" name="gh-commit-mode" checked={mode === 'branch'} onChange={() => setMode('branch')} />
            <span style={{ flex: 1 }}>
              Create a <b>new branch</b> for this commit and start a pull request
              {mode === 'branch' ? (
                <span className="gh-flex" style={{ marginTop: 6 }}>
                  <Oct name="branch" />
                  <input className="gh-input gh-input-sm" value={branchName} onChange={(e) => setBranchName(e.target.value)} aria-label="New branch name" />
                </span>
              ) : null}
            </span>
          </label>
        </Modal>
      ) : null}
    </>
  );
}
