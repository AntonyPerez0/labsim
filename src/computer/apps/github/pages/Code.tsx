/**
 * GitHub repository Code tab (Apps §7.2): repo home, tree and blob views, branch selector, `<> Code ▾` clone
 * popover, `Go to file` finder (t), line highlighting, Blame, keyboard shortcuts (t, y, l).
 */
import { useEffect, useMemo, useState } from 'react';
import { emitAppAction } from '@/computer/apps';
import type { GitRepo } from '@/sim/types';
import { Avatar, Oct } from '../icons';
import { useGh } from '../ctx';
import { BranchSelector, GhHeader, Modal, NotFound, Popover, Rel, RepoTitle } from '../Chrome';
import { Markdown, highlightAll } from '../highlight';
import { blobRoute, commitRoute, fileStats, firstLine, isProtected, langOf, lastCommitFor, listDir, login, repoDescription, repoRoute, shortSha, splitRef, tree, treeRoute, chain } from '../model';

type Proto = 'https' | 'ssh' | 'cli';

function cloneUrl(repo: GitRepo, p: Proto): string {
  if (p === 'ssh') return repo.remoteUrl || `git@github.com:labsim-lab/${repo.id}.git`;
  if (p === 'https') return `https://github.com/labsim-lab/${repo.id}.git`;
  return `gh repo clone labsim-lab/${repo.id}`;
}

function CodeButton(props: { repo: GitRepo }) {
  const { wm } = useGh();
  const [open, setOpen] = useState(false);
  const [proto, setProto] = useState<Proto>('ssh');
  const [copied, setCopied] = useState(false);
  const url = cloneUrl(props.repo, proto);
  const copy = () => {
    wm?.clipboard.write(url, 'github');
    emitAppAction('github', 'github.cloneUrl.copied', { repo: props.repo.id, protocol: proto, url });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      className="gh-clone"
      button={
        <button type="button" className="gh-btn gh-btn-primary" data-hint="github.codeButton" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <Oct name="code" /> Code <Oct name="caret" />
        </button>
      }
    >
      <div className="gh-subtabs" role="tablist" style={{ padding: '0 8px' }}>
        <button type="button" className="gh-subtab" role="tab" aria-selected>
          Local
        </button>
        <button type="button" className="gh-subtab" role="tab" disabled>
          Codespaces
        </button>
      </div>
      <div className="gh-clone-body">
        <div className="gh-flex" style={{ fontWeight: 600, marginBottom: 8 }}>
          <Oct name="terminal" /> Clone
        </div>
        <div className="gh-subtabs" role="tablist" style={{ padding: 0 }}>
          {(['https', 'ssh', 'cli'] as Proto[]).map((p) => (
            <button key={p} type="button" className="gh-subtab" role="tab" aria-selected={proto === p} onClick={() => setProto(p)}>
              {p === 'https' ? 'HTTPS' : p === 'ssh' ? 'SSH' : 'GitHub CLI'}
            </button>
          ))}
        </div>
        <div className="gh-clone-url">
          <input className="gh-input gh-input-sm" readOnly value={url} aria-label="Clone URL" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="gh-btn gh-btn-sm" data-hint={`github.cloneUrl:${proto}`} onClick={copy} aria-label="Copy url to clipboard" title="Copy url to clipboard">
            {copied ? <Oct name="check" color="#1a7f37" /> : <Oct name="copy" />}
          </button>
        </div>
        <div className="gh-clone-note">
          {copied
            ? '✓ Copied!'
            : proto === 'ssh'
              ? 'Use a password-protected SSH key.'
              : proto === 'https'
                ? 'Clone using the web URL.'
                : 'Work fast with our official CLI.'}
        </div>
      </div>
      <div style={{ borderTop: '1px solid var(--gh-border-muted)', padding: '4px 0' }}>
        <button type="button" className="gh-menu-item" disabled>
          <Oct name="desktop" /> Open with GitHub Desktop
        </button>
        <button type="button" className="gh-menu-item" disabled>
          <Oct name="download" /> Download ZIP
        </button>
      </div>
    </Popover>
  );
}

function FileFinder(props: { repo: GitRepo; branch: string; paths: string[]; onClose(): void }) {
  const { navigate } = useGh();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return props.paths.slice(0, 50);
    const score = (p: string) => {
      const l = p.toLowerCase();
      let i = 0;
      for (const ch of n) {
        i = l.indexOf(ch, i);
        if (i < 0) return -1;
        i++;
      }
      return l.includes(n) ? 2 : 1;
    };
    return props.paths
      .map((p) => ({ p, s: score(p) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || a.p.length - b.p.length)
      .slice(0, 50)
      .map((x) => x.p);
  }, [q, props.paths]);
  const open = (p: string) => {
    props.onClose();
    navigate(blobRoute(props.repo.id, props.branch, p));
  };
  return (
    <Modal title={`Go to file — ${props.repo.name}`} onClose={props.onClose} width={600}>
      <input
        className="gh-input"
        autoFocus
        placeholder="Go to file"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setSel(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') (e.preventDefault(), setSel((s) => Math.min(s + 1, hits.length - 1)));
          if (e.key === 'ArrowUp') (e.preventDefault(), setSel((s) => Math.max(0, s - 1)));
          if (e.key === 'Enter' && hits[sel]) (e.preventDefault(), open(hits[sel]!));
        }}
      />
      <div className="gh-finder-list" role="listbox">
        {hits.map((p, i) => (
          <button key={p} type="button" role="option" className="gh-menu-item" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={() => open(p)}>
            <Oct name="file" className="gh-file-icon" />
            <span style={{ fontFamily: 'var(--gh-mono)', fontSize: 12 }}>{p}</span>
          </button>
        ))}
        {!hits.length ? <div className="gh-muted" style={{ padding: 12 }}>No matching files</div> : null}
      </div>
    </Modal>
  );
}

function Toolbar(props: { repo: GitRepo; branch: string; path: string; paths: string[]; isBlob: boolean }) {
  const { navigate, focused, readOnly } = useGh();
  const [finder, setFinder] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const nBranches = Object.keys(props.repo.branches).length;
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        setFinder(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);
  return (
    <div className="gh-toolbar">
      <BranchSelector repo={props.repo} current={props.branch} onPick={(b) => navigate(props.path && !props.isBlob ? treeRoute(props.repo.id, b, props.path) : props.isBlob ? blobRoute(props.repo.id, b, props.path) : b === props.repo.defaultBranch ? repoRoute(props.repo.id) : treeRoute(props.repo.id, b))} />
      {!props.path ? (
        <>
          <a className="gh-btn gh-btn-invisible" href={`#${repoRoute(props.repo.id, 'branches')}`} onClick={(e) => (e.preventDefault(), navigate(repoRoute(props.repo.id, 'branches')))} style={{ color: 'var(--gh-fg)' }}>
            <Oct name="branch" /> <b>{nBranches}</b> <span className="gh-muted">{nBranches === 1 ? 'Branch' : 'Branches'}</span>
          </a>
          <span className="gh-btn gh-btn-invisible" style={{ color: 'var(--gh-fg)' }}>
            <Oct name="tag" /> <b>0</b> <span className="gh-muted">Tags</span>
          </span>
        </>
      ) : null}
      <span className="gh-spacer" />
      <button type="button" className="gh-btn" onClick={() => setFinder(true)}>
        Go to file <span className="gh-kbd">t</span>
      </button>
      {!readOnly ? (
        <Popover
          open={addOpen}
          onClose={() => setAddOpen(false)}
          align="right"
          button={
            <button type="button" className="gh-btn" onClick={() => setAddOpen((o) => !o)}>
              Add file <Oct name="caret" />
            </button>
          }
        >
          <button
            type="button"
            className="gh-menu-item"
            onClick={() => {
              setAddOpen(false);
              navigate(repoRoute(props.repo.id, `new/${props.branch}${props.path && !props.isBlob ? `/${props.path}` : ''}`));
            }}
          >
            <Oct name="plus" /> Create new file
          </button>
          <button type="button" className="gh-menu-item" disabled>
            <Oct name="download" /> Upload files
          </button>
        </Popover>
      ) : null}
      {!props.path ? <CodeButton repo={props.repo} /> : null}
      {finder ? <FileFinder repo={props.repo} branch={props.branch} paths={props.paths} onClose={() => setFinder(false)} /> : null}
    </div>
  );
}

function Breadcrumb(props: { repo: GitRepo; branch: string; path: string; isBlob: boolean }) {
  const { navigate, wm } = useGh();
  const parts = props.path.split('/').filter(Boolean);
  return (
    <div className="gh-breadcrumb">
      <a href={`#${treeRoute(props.repo.id, props.branch)}`} onClick={(e) => (e.preventDefault(), navigate(props.branch === props.repo.defaultBranch ? repoRoute(props.repo.id) : treeRoute(props.repo.id, props.branch)))}>
        {props.repo.name}
      </a>
      {parts.map((p, i) => {
        const sub = parts.slice(0, i + 1).join('/');
        const last = i === parts.length - 1;
        return (
          <span key={sub} className="gh-flex" style={{ gap: 4 }}>
            <span className="gh-muted">/</span>
            {last ? (
              <b>{p}</b>
            ) : (
              <a href={`#${treeRoute(props.repo.id, props.branch, sub)}`} onClick={(e) => (e.preventDefault(), navigate(treeRoute(props.repo.id, props.branch, sub)))}>
                {p}
              </a>
            )}
          </span>
        );
      })}
      <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" aria-label="Copy path" title="Copy path" onClick={() => wm?.clipboard.write(props.path, 'github')}>
        <Oct name="copy" />
      </button>
    </div>
  );
}

function LatestCommit(props: { repo: GitRepo; sha: string | null; path: string; branch: string }) {
  const { navigate, playerInitials } = useGh();
  const c = lastCommitFor(props.repo, props.sha, props.path);
  const count = useMemo(() => chain(props.repo, props.sha).length, [props.repo, props.sha]);
  if (!c) return null;
  return (
    <div className="gh-latest">
      <Avatar who={c.author} size={24} playerInitials={playerInitials} />
      <b>{login(c.author)}</b>
      <a className="gh-latest-msg gh-fg-link" href={`#${commitRoute(props.repo.id, c.sha)}`} onClick={(e) => (e.preventDefault(), navigate(commitRoute(props.repo.id, c.sha)))} style={{ color: 'var(--gh-muted)' }}>
        {firstLine(c.message)}
      </a>
      <span className="gh-spacer" />
      <span className="gh-muted gh-sha" style={{ whiteSpace: 'nowrap' }}>
        {shortSha(c.sha)} · <Rel ms={c.atMs} />
      </span>
      {!props.path ? (
        <a className="gh-btn gh-btn-invisible gh-btn-sm" style={{ color: 'var(--gh-fg)' }} href="#" onClick={(e) => (e.preventDefault(), navigate(repoRoute(props.repo.id, `commits/${props.branch}`)))}>
          <Oct name="history" /> <b>{count}</b> Commits
        </a>
      ) : (
        <a className="gh-btn gh-btn-invisible gh-btn-sm" style={{ color: 'var(--gh-fg)' }} href="#" onClick={(e) => (e.preventDefault(), navigate(repoRoute(props.repo.id, `commits/${props.branch}`)))}>
          <Oct name="history" /> History
        </a>
      )}
    </div>
  );
}

function TreeView(props: { repo: GitRepo; branch: string; sha: string | null; path: string }) {
  const { navigate } = useGh();
  const t = tree(props.repo, props.sha);
  const entries = listDir(t, props.path) ?? [];
  const parent = props.path.includes('/') ? props.path.slice(0, props.path.lastIndexOf('/')) : '';
  const readme = entries.find((e) => e.kind === 'file' && /^readme\.md$/i.test(e.name));
  return (
    <>
      <div className="gh-box">
        <LatestCommit repo={props.repo} sha={props.sha} path={props.path} branch={props.branch} />
        <table className="gh-files">
          <tbody>
            {props.path ? (
              <tr>
                <td colSpan={3}>
                  <a href="#" className="gh-fg-link" onClick={(e) => (e.preventDefault(), navigate(parent ? treeRoute(props.repo.id, props.branch, parent) : treeRoute(props.repo.id, props.branch)))}>
                    <Oct name="fileDirOpen" className="gh-dir-icon" /> ..
                  </a>
                </td>
              </tr>
            ) : null}
            {entries.map((e) => {
              const c = lastCommitFor(props.repo, props.sha, e.path);
              const route = e.kind === 'dir' ? treeRoute(props.repo.id, props.branch, e.path) : blobRoute(props.repo.id, props.branch, e.path);
              return (
                <tr key={e.path} data-hint={`github.fileRow:${e.path}`}>
                  <td className="gh-f-name">
                    <a href={`#${route}`} className="gh-fg-link" onClick={(ev) => (ev.preventDefault(), navigate(route))}>
                      {e.kind === 'dir' ? <Oct name="folder" className="gh-dir-icon" /> : <Oct name="file" className="gh-file-icon" />} {e.name}
                    </a>
                  </td>
                  <td className="gh-f-msg">
                    {c ? (
                      <a href="#" className="gh-fg-link" style={{ color: 'var(--gh-muted)' }} onClick={(ev) => (ev.preventDefault(), navigate(commitRoute(props.repo.id, c.sha)))}>
                        {firstLine(c.message)}
                      </a>
                    ) : null}
                  </td>
                  <td className="gh-f-time">{c ? <Rel ms={c.atMs} /> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {readme ? (
        <div className="gh-box gh-readme">
          <div className="gh-readme-head">
            <Oct name="book" /> README
          </div>
          <Markdown
            text={t[readme.path] ?? ''}
            onLink={(href) => {
              if (/^https?:/.test(href)) return;
              navigate(blobRoute(props.repo.id, props.branch, (props.path ? `${props.path}/` : '') + href.replace(/^\.\//, '')));
            }}
          />
        </div>
      ) : null}
    </>
  );
}

function BlobView(props: { repo: GitRepo; branch: string; sha: string | null; path: string }) {
  const { navigate, wm, focused, readOnly } = useGh();
  const t = tree(props.repo, props.sha);
  const text = t[props.path] ?? '';
  const lang = langOf(props.path);
  const [mode, setMode] = useState<'code' | 'blame' | 'preview'>(lang === 'markdown' ? 'preview' : 'code');
  const [wrap, setWrap] = useState(false);
  const [hl, setHl] = useState<[number, number] | null>(null);
  const [jump, setJump] = useState<string | null>(null);
  const lines = useMemo(() => highlightAll(text, lang), [text, lang]);
  const last = lastCommitFor(props.repo, props.sha, props.path);
  useEffect(() => setHl(null), [props.path]);
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'y' && props.sha && props.branch !== props.sha) {
        e.preventDefault();
        navigate(blobRoute(props.repo.id, props.sha, props.path), { replace: true });
      } else if (e.key === 'l') {
        e.preventDefault();
        setJump('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, navigate, props.sha, props.branch, props.repo.id, props.path]);
  if (!(props.path in t)) return <NotFound />;
  const protectedMain = isProtected(props.repo.id) && props.branch === props.repo.defaultBranch;
  const doJump = () => {
    const n = Number(jump);
    setJump(null);
    if (n > 0) {
      setHl([n, n]);
      requestAnimationFrame(() => document.querySelector(`.gh-root [data-ln="${n}"]`)?.scrollIntoView({ block: 'center' }));
    }
  };
  return (
    <>
      {jump !== null ? (
        <Modal title="Jump to line" onClose={() => setJump(null)} width={360} footer={<button type="button" className="gh-btn gh-btn-primary" onClick={doJump}>Go</button>}>
          <input className="gh-input" autoFocus inputMode="numeric" placeholder="Jump to line…" value={jump} onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && doJump()} />
        </Modal>
      ) : null}
      <div className="gh-box" style={{ marginBottom: 16 }}>
        {last ? (
          <div className="gh-latest" style={{ borderRadius: 6, borderBottom: 0, minHeight: 48 }}>
            <Avatar who={last.author} size={20} />
            <b>{login(last.author)}</b>
            <a href="#" className="gh-latest-msg" onClick={(e) => (e.preventDefault(), navigate(commitRoute(props.repo.id, last.sha)))}>
              {firstLine(last.message)}
            </a>
            <span className="gh-spacer" />
            <span className="gh-muted gh-sha">
              {shortSha(last.sha)} · <Rel ms={last.atMs} />
            </span>
          </div>
        ) : null}
      </div>
      <div className="gh-box">
        <div className="gh-file-head">
          <div className="gh-seg">
            {lang === 'markdown' ? (
              <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>
                Preview
              </button>
            ) : null}
            <button type="button" aria-pressed={mode === 'code'} onClick={() => setMode('code')}>
              Code
            </button>
            <button type="button" aria-pressed={mode === 'blame'} onClick={() => setMode('blame')}>
              Blame
            </button>
          </div>
          <span className="gh-muted">{fileStats(text)}</span>
          <span className="gh-spacer" />
          <button type="button" className="gh-btn gh-btn-sm" onClick={() => setWrap((w) => !w)} aria-pressed={wrap} title="Wrap lines">
            Wrap
          </button>
          <button type="button" className="gh-btn gh-btn-sm">
            Raw
          </button>
          <button type="button" className="gh-btn gh-btn-sm" aria-label="Copy raw file" title="Copy raw file" onClick={() => wm?.clipboard.write(text, 'github')}>
            <Oct name="copy" />
          </button>
          <button type="button" className="gh-btn gh-btn-sm" aria-label="Download raw file" disabled>
            <Oct name="download" />
          </button>
          {!readOnly ? (
            <button
              type="button"
              className="gh-btn gh-btn-sm"
              aria-label={protectedMain ? 'Edit file (fork or branch required)' : 'Edit this file'}
              title={protectedMain ? 'Edit the file in a new branch and start a pull request' : 'Edit this file'}
              onClick={() => navigate(repoRoute(props.repo.id, `edit/${props.branch}/${props.path}`))}
            >
              <Oct name="pencil" />
            </button>
          ) : null}
          <button type="button" className="gh-btn gh-btn-sm" aria-label="More file actions">
            <Oct name="kebab" />
          </button>
        </div>
        {mode === 'preview' ? (
          <Markdown text={text} />
        ) : (
          <div style={{ overflow: 'auto' }}>
            <table className={`gh-code${wrap ? ' gh-code-wrap' : ''}`}>
              <tbody>
                {lines.map((l, i) => {
                  const n = i + 1;
                  const on = hl && n >= hl[0] && n <= hl[1];
                  return (
                    <tr key={i} className={on ? 'gh-hl' : undefined}>
                      {mode === 'blame' ? (
                        <td className="gh-blame-meta">
                          {i === 0 && last ? (
                            <>
                              <Rel ms={last.atMs} /> · {firstLine(last.message)}
                            </>
                          ) : null}
                        </td>
                      ) : null}
                      <td
                        className="gh-ln"
                        data-ln={n}
                        onClick={(e) => setHl((h) => (e.shiftKey && h ? [Math.min(h[0], n), Math.max(h[0], n)] : [n, n]))}
                      >
                        {n}
                      </td>
                      <td className="gh-lc">{l.length ? l : '​'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function About(props: { repo: GitRepo }) {
  return (
    <div className="gh-about">
      <div className="gh-side-section">
        <h2>About</h2>
        <p>{repoDescription(props.repo) || <span className="gh-muted">No description, website, or topics provided.</span>}</p>
        <ul className="gh-about-list">
          <li>
            <Oct name="book" /> Readme
          </li>
          <li>
            <Oct name="pulse" /> Activity
          </li>
          <li>
            <Oct name="star" /> <b style={{ color: 'var(--gh-fg)' }}>0</b> stars
          </li>
          <li>
            <Oct name="eye" /> <b style={{ color: 'var(--gh-fg)' }}>4</b> watching
          </li>
          <li>
            <Oct name="fork" /> <b style={{ color: 'var(--gh-fg)' }}>0</b> forks
          </li>
        </ul>
      </div>
      <div className="gh-side-section">
        <h3>Releases</h3>
        <span className="gh-muted" style={{ fontSize: 14 }}>
          No releases published
        </span>
      </div>
      <div className="gh-side-section">
        <h3>Packages</h3>
        <span className="gh-muted" style={{ fontSize: 14 }}>
          No packages published
        </span>
      </div>
    </div>
  );
}

/** Repo home (`/labsim-lab/<repo>`), tree and blob routes. */
export function CodePage(props: { repo: GitRepo; kind: 'repo' | 'tree' | 'blob'; refPath: string }) {
  const repo = props.repo;
  const { branch, sha, path } = props.kind === 'repo' ? { branch: repo.defaultBranch, sha: repo.branches[repo.defaultBranch] ?? null, path: '' } : splitRef(repo, props.refPath);
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  const t = sha ? tree(repo, sha) : null;
  const paths = useMemo(() => (t ? Object.keys(t).sort() : []), [t]);
  const isBlob = props.kind === 'blob';
  const exists = !!t && (isBlob ? path in t : !path || listDir(t, path) !== null);
  useEffect(() => {
    if (!exists) return;
    if (isBlob) emitAppAction('github', 'github.file.viewed', { repo: repo.id, ref: branch, path });
    else emitAppAction('github', 'github.tree.viewed', { repo: repo.id, ref: branch, path });
  }, [exists, isBlob, repo.id, branch, path]);
  return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      {!exists ? (
        <NotFound />
      ) : (
        <div className="gh-container">
          {props.kind === 'repo' ? <RepoTitle repo={repo} /> : null}
          <div className="gh-row">
            <div className="gh-col-main">
              {path ? <Breadcrumb repo={repo} branch={branch} path={path} isBlob={isBlob} /> : null}
              <Toolbar repo={repo} branch={branch} path={path} paths={paths} isBlob={isBlob} />
              {isBlob ? <BlobView repo={repo} branch={branch} sha={sha} path={path} /> : <TreeView repo={repo} branch={branch} sha={sha} path={path} />}
            </div>
            {props.kind === 'repo' ? (
              <div className="gh-col-side">
                <About repo={repo} />
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
