/**
 * GitHub pull request list and Compare / "Open a pull request" (Apps §7.4).
 */
import { useMemo, useState } from 'react';
import { emitAppAction } from '@/computer/apps';
import { sim } from '@/sim';
import type { GitRepo, PullRequest, RepoId } from '@/sim/types';
import { Avatar, Oct } from '../icons';
import { simTry, useGh } from '../ctx';
import { BranchSelector, GhHeader, Rel } from '../Chrome';
import { DiffFile } from '../Diff';
import { Markdown } from '../highlight';
import { chain, firstLine, login, mergeBase, pullRoute, repoOwner, repoRoute, reviewState, shortSha, tree, commitRoute } from '../model';

export function prIcon(pr: PullRequest, size = 16) {
  if (pr.state === 'merged') return <Oct name="merge" color="#8250df" size={size} />;
  if (pr.state === 'closed') return <Oct name="prClosed" color="#d1242f" size={size} />;
  return <Oct name="pr" color="#1a7f37" size={size} />;
}

export function PullsPage(props: { repo: GitRepo; q: string }) {
  const { navigate, readOnly } = useGh();
  const repo = props.repo;
  const [q, setQ] = useState(props.q || 'is:pr is:open');
  const state: 'open' | 'closed' | 'all' = /is:closed/.test(q) ? 'closed' : /is:open/.test(q) ? 'open' : 'all';
  const text = q.replace(/is:\S+/g, '').trim().toLowerCase();
  const openCount = repo.pullRequests.filter((p) => p.state === 'open').length;
  const closedCount = repo.pullRequests.length - openCount;
  const prs = repo.pullRequests
    .filter((p) => (state === 'all' ? true : state === 'open' ? p.state === 'open' : p.state !== 'open'))
    .filter((p) => !text || p.title.toLowerCase().includes(text) || String(p.number) === text.replace('#', ''))
    .sort((a, b) => b.number - a.number);
  const setState = (s: 'open' | 'closed') => {
    const nq = `is:pr is:${s}`;
    setQ(nq);
    navigate(repoRoute(repo.id, `pulls?q=${encodeURIComponent(nq)}`), { replace: true });
  };
  return (
    <>
      <GhHeader repo={repo.id} tab="pulls" openPrs={openCount} />
      <div className="gh-container">
        <div className="gh-filter">
          <button type="button" className="gh-btn">
            Filters <Oct name="caret" />
          </button>
          <label className="gh-filter-input">
            <Oct name="search" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search all pull requests" onKeyDown={(e) => e.key === 'Enter' && navigate(repoRoute(repo.id, `pulls?q=${encodeURIComponent(q)}`), { replace: true })} />
          </label>
          <div className="gh-btn-group">
            <button type="button" className="gh-btn">
              <Oct name="tag" /> Labels
            </button>
            <button type="button" className="gh-btn">
              Milestones
            </button>
          </div>
          {!readOnly ? (
            <button type="button" className="gh-btn gh-btn-primary" data-hint="github.newPullRequest" onClick={() => navigate(repoRoute(repo.id, `compare/${repo.defaultBranch}...`))}>
              New pull request
            </button>
          ) : null}
        </div>
        <div className="gh-box">
          <div className="gh-box-head">
            <button type="button" className="gh-link gh-flex" style={{ color: state === 'open' ? 'var(--gh-fg)' : 'var(--gh-muted)', fontWeight: state === 'open' ? 600 : 400 }} onClick={() => setState('open')}>
              <Oct name="pr" /> {openCount} Open
            </button>
            <button type="button" className="gh-link gh-flex" style={{ color: state === 'closed' ? 'var(--gh-fg)' : 'var(--gh-muted)', fontWeight: state === 'closed' ? 600 : 400, marginLeft: 8 }} onClick={() => setState('closed')}>
              <Oct name="check" /> {closedCount} Closed
            </button>
            <span className="gh-spacer" />
            {['Author', 'Label', 'Projects', 'Milestones', 'Reviews', 'Assignee', 'Sort'].map((l) => (
              <span key={l} className="gh-muted" style={{ fontSize: 14, marginLeft: 12 }}>
                {l} <Oct name="caret" />
              </span>
            ))}
          </div>
          {prs.length === 0 ? (
            <div className="gh-blankslate">
              <Oct name="pr" size={24} />
              <h3>No results matched your search.</h3>
            </div>
          ) : null}
          {prs.map((p) => {
            const rs = reviewState(p);
            return (
              <div className="gh-pr-row" key={p.number}>
                <span style={{ paddingTop: 2 }}>{prIcon(p)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a className="gh-pr-row-title" href={`#${pullRoute(repo.id, p.number)}`} onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, p.number)))}>
                    {p.title}
                  </a>
                  {p.checks === 'success' ? <Oct name="check" color="#1a7f37" className="gh-ml" /> : p.checks === 'failure' ? <Oct name="x" color="#d1242f" /> : <Oct name="dot" color="#9a6700" />}
                  <div className="gh-pr-row-meta">
                    #{p.number} {p.state === 'merged' ? 'by' : 'opened'} {p.state === 'merged' ? <b>{login(p.author)}</b> : <Rel ms={p.createdMs} />} {p.state === 'merged' ? <>was merged <Rel ms={p.mergedMs ?? p.createdMs} /></> : <>by {login(p.author)}</>}
                    {rs && p.state === 'open' ? <> • {rs}</> : null}
                  </div>
                </div>
                {p.comments.length ? (
                  <span className="gh-muted gh-flex" style={{ fontSize: 12, gap: 4 }}>
                    <Oct name="comment" /> {p.comments.length}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="gh-muted" style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
          <Oct name="book" /> <b>ProTip!</b> Type <span className="gh-kbd">t</span> on a repository page to find a file.
        </p>
      </div>
    </>
  );
}

/** `/compare/<base>...<head>` — Comparing changes + Open a pull request. */
export function ComparePage(props: { repo: GitRepo; range: string }) {
  const { navigate, readOnly, playerInitials } = useGh();
  const repo = props.repo;
  const [baseRaw, headRaw] = props.range.includes('...') ? props.range.split('...') : [repo.defaultBranch, props.range];
  const base = repo.branches[baseRaw ?? ''] ? baseRaw! : repo.defaultBranch;
  const head = headRaw && repo.branches[headRaw] ? headRaw : '';
  const baseSha = repo.branches[base] ?? null;
  const headSha = head ? repo.branches[head] ?? null : null;
  const mb = baseSha && headSha ? mergeBase(repo, headSha, baseSha) : null;
  const commits = useMemo(() => (headSha ? chain(repo, headSha).filter((c) => !chain(repo, baseSha).some((x) => x.sha === c.sha)).reverse() : []), [repo, headSha, baseSha]);
  const files = useMemo(() => {
    if (!headSha) return [];
    const a = tree(repo, mb);
    const b = tree(repo, headSha);
    const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p]).sort();
    return paths.map((p) => ({ path: p, before: a[p] ?? null, after: b[p] ?? null }));
  }, [repo, mb, headSha]);
  const lastMsg = commits.length ? firstLine(commits[commits.length - 1]!.message) : '';
  const [form, setForm] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [error, setError] = useState<string | null>(null);
  const existing = repo.pullRequests.find((p) => p.sourceBranch === head && p.state === 'open');
  const owner = repoOwner(repo.id as RepoId);
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  const nav = (b: string, h: string) => navigate(repoRoute(repo.id, `compare/${b}...${h}`), { replace: true });
  const create = () => {
    const t = (title || lastMsg).trim();
    const r = simTry(() => sim.git.createPullRequest(repo.id, t, body, head, 'player'));
    emitAppAction('github', 'github.pr.created', { repo: repo.id, number: r.ok ? r.value.number : null, title: t, head, base, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    navigate(pullRoute(repo.id, r.value.number));
  };
  return (
    <>
      <GhHeader repo={repo.id} tab="pulls" openPrs={openPrs} />
      <div className="gh-container">
        <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 4 }}>{form ? 'Open a pull request' : 'Comparing changes'}</h2>
        <p className="gh-muted" style={{ margin: '0 0 16px' }}>
          {form ? 'Create a new pull request by comparing changes across two branches.' : 'Choose two branches to see what’s changed or to start a new pull request.'}
        </p>
        <div className="gh-compare-bar">
          <Oct name="branch" />
          <BranchSelector repo={repo} current={base} label="base:" onPick={(b) => nav(b, head)} />
          <span className="gh-muted">←</span>
          <BranchSelector repo={repo} current={head || 'choose…'} label="compare:" onPick={(h) => nav(base, h)} />
          {head && headSha ? (
            commits.length ? (
              <span className="gh-mergeable gh-flex">
                <Oct name="check" /> Able to merge.<span className="gh-muted" style={{ fontWeight: 400 }}> These branches can be automatically merged.</span>
              </span>
            ) : null
          ) : null}
        </div>
        {error ? <div className="gh-flash gh-flash-error">{error}</div> : null}
        {!head ? (
          <div className="gh-box gh-blankslate">
            <Oct name="branch" size={24} />
            <h3>Compare and review just about anything</h3>
            <p>Branches, tags, commit ranges, and time ranges. In the same repository and across forks.</p>
          </div>
        ) : !commits.length ? (
          <div className="gh-box gh-blankslate">
            <h3>There isn’t anything to compare.</h3>
            <p>
              <b>{base}</b> is up to date with all commits from <b>{head}</b>.
            </p>
          </div>
        ) : existing ? (
          <div className="gh-box gh-flex" style={{ padding: 16 }}>
            {prIcon(existing)}
            <a href="#" onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, existing.number)))}>
              {existing.title} #{existing.number}
            </a>
            <span className="gh-spacer" />
            <button type="button" className="gh-btn" onClick={() => navigate(pullRoute(repo.id, existing.number))}>
              View pull request
            </button>
          </div>
        ) : !form ? (
          <div className="gh-box gh-flex" style={{ padding: 16, background: 'var(--gh-subtle)' }}>
            <span>Discuss and review the changes in this comparison with others.</span>
            <span className="gh-spacer" />
            {!readOnly ? (
              <button
                type="button"
                className="gh-btn gh-btn-primary"
                data-hint="github.createPullRequest"
                onClick={() => {
                  setForm(true);
                  setTitle(lastMsg);
                }}
              >
                Create pull request
              </button>
            ) : null}
          </div>
        ) : (
          <div className="gh-row" style={{ marginBottom: 24 }}>
            <div className="gh-tl-comment" style={{ margin: 0, flex: 1 }}>
              <Avatar who="player" size={40} playerInitials={playerInitials} />
              <div className="gh-tl-card" style={{ padding: 16 }}>
                <label style={{ fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  Add a title <span style={{ color: 'var(--gh-closed)' }}>*</span>
                </label>
                <input className="gh-input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus aria-label="Title" />
                <label style={{ fontWeight: 600, display: 'block', margin: '16px 0 6px' }}>Add a description</label>
                <div className="gh-seg" style={{ marginBottom: 8 }}>
                  <button type="button" aria-pressed={tab === 'write'} onClick={() => setTab('write')}>
                    Write
                  </button>
                  <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>
                    Preview
                  </button>
                </div>
                {tab === 'write' ? (
                  <textarea
                    className="gh-textarea"
                    placeholder="Add your description here..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === 'Enter' && (e.preventDefault(), create())}
                    style={{ minHeight: 160 }}
                  />
                ) : (
                  <div style={{ minHeight: 160, border: '1px solid var(--gh-border-muted)', borderRadius: 6 }}>
                    {body.trim() ? <Markdown text={body} /> : <p className="gh-muted" style={{ padding: 16 }}>Nothing to preview</p>}
                  </div>
                )}
                <div className="gh-flex" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
                  <div className="gh-btn-group">
                    <button type="button" className="gh-btn gh-btn-primary" disabled={!(title || lastMsg).trim()} onClick={create} data-hint="github.createPullRequest">
                      Create pull request
                    </button>
                    <button type="button" className="gh-btn gh-btn-primary" aria-label="Select a type of pull request" title="Create draft pull request (unavailable)" disabled>
                      <Oct name="caret" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="gh-col-side" style={{ flex: '0 0 240px' }}>
              <div className="gh-sidebar-item" style={{ paddingTop: 0 }}>
                <h4>
                  Reviewers <Oct name="gear" />
                </h4>
                {owner !== 'player' ? (
                  <div className="gh-reviewer">
                    <Avatar who={owner} size={20} /> {owner} <span className="gh-muted" style={{ fontSize: 12 }}>(code owner)</span>
                  </div>
                ) : (
                  <span className="gh-muted">No reviews</span>
                )}
              </div>
              <div className="gh-sidebar-item">
                <h4>
                  Assignees <Oct name="gear" />
                </h4>
                <span className="gh-muted">No one—assign yourself</span>
              </div>
              <div className="gh-sidebar-item">
                <h4>
                  Labels <Oct name="gear" />
                </h4>
                <span className="gh-muted">None yet</span>
              </div>
            </div>
          </div>
        )}
        {head && commits.length ? (
          <>
            <div className="gh-box gh-flex" style={{ padding: '12px 16px', marginBottom: 16, gap: 24 }}>
              <span>
                <Oct name="commit" /> <b>{commits.length}</b> commit{commits.length === 1 ? '' : 's'}
              </span>
              <span>
                <Oct name="fileDiff" /> <b>{files.length}</b> file{files.length === 1 ? '' : 's'} changed
              </span>
              <span>
                <Oct name="people" /> <b>{new Set(commits.map((c) => c.author)).size}</b> contributor
              </span>
            </div>
            <div className="gh-box" style={{ marginBottom: 16 }}>
              {commits.map((c) => (
                <div className="gh-commit-row" key={c.sha}>
                  <Avatar who={c.author} size={16} playerInitials={playerInitials} />
                  <a className="gh-commit-title" style={{ fontWeight: 400 }} href="#" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.sha)))}>
                    {firstLine(c.message)}
                  </a>
                  <span className="gh-spacer" />
                  <span className="gh-sha gh-muted">{shortSha(c.sha)}</span>
                </div>
              ))}
            </div>
            {files.map((f) => (
              <DiffFile key={f.path} path={f.path} before={f.before} after={f.after} view="unified" />
            ))}
          </>
        ) : null}
      </div>
    </>
  );
}
