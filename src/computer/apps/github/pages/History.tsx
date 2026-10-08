/**
 * GitHub commits list, single commit diff and Branches page with "New branch" (Apps §7.3).
 */
import { useEffect, useMemo, useState } from 'react';
import { emitAppAction, gameDateParts } from '@/computer/apps';
import type { GitRepo, RepoId } from '@/sim/types';
import { Avatar, Oct } from '../icons';
import { useGh } from '../ctx';
import { BranchSelector, GhHeader, Modal, NotFound, Rel } from '../Chrome';
import { DiffFile, diffStats } from '../Diff';
import { createBranch } from '../actions';
import { chain, commitChanges, commitRoute, firstLine, isProtected, login, pullRoute, repoRoute, shortSha, splitRef, treeRoute, mergeBase } from '../model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayLabel(ms: number): string {
  const p = gameDateParts(ms);
  return `${MONTHS[p.mo - 1]} ${p.d}, ${p.y}`;
}

export function CommitsPage(props: { repo: GitRepo; refPath: string }) {
  const { navigate, wm, playerInitials } = useGh();
  const repo = props.repo;
  const ref = props.refPath ? splitRef(repo, props.refPath) : { branch: repo.defaultBranch, sha: repo.branches[repo.defaultBranch] ?? null, path: '' };
  const commits = useMemo(() => chain(repo, ref.sha), [repo, ref.sha]);
  const groups = useMemo(() => {
    const out: { day: string; items: typeof commits }[] = [];
    for (const c of commits) {
      const d = dayLabel(c.atMs);
      if (!out.length || out[out.length - 1]!.day !== d) out.push({ day: d, items: [] });
      out[out.length - 1]!.items.push(c);
    }
    return out;
  }, [commits]);
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  if (!ref.sha) return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <NotFound />
    </>
  );
  return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <div className="gh-container">
        <h2 style={{ fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Commits</h2>
        <div className="gh-toolbar">
          <BranchSelector repo={repo} current={ref.branch} onPick={(b) => navigate(repoRoute(repo.id, `commits/${b}`))} />
        </div>
        {groups.map((g) => (
          <div className="gh-commit-group" key={g.day}>
            <div className="gh-commit-group-title">
              <Oct name="commit" /> Commits on {g.day}
            </div>
            <div className="gh-box">
              {g.items.map((c) => (
                <div className="gh-commit-row" key={c.sha}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a className="gh-commit-title" href={`#${commitRoute(repo.id, c.sha)}`} onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.sha)))}>
                      {firstLine(c.message)}
                    </a>
                    <div className="gh-flex gh-muted" style={{ fontSize: 12, marginTop: 4, gap: 6 }}>
                      <Avatar who={c.author} size={16} playerInitials={playerInitials} />
                      <b style={{ color: 'var(--gh-fg)' }}>{login(c.author)}</b> committed <Rel ms={c.atMs} />
                    </div>
                  </div>
                  <div className="gh-btn-group">
                    <button type="button" className="gh-btn gh-btn-sm gh-sha" onClick={() => navigate(commitRoute(repo.id, c.sha))}>
                      {shortSha(c.sha)}
                    </button>
                    <button type="button" className="gh-btn gh-btn-sm" aria-label="Copy full SHA" title="Copy full SHA" onClick={() => wm?.clipboard.write(c.sha, 'github')}>
                      <Oct name="copy" />
                    </button>
                  </div>
                  <button type="button" className="gh-btn gh-btn-sm gh-btn-invisible" aria-label="Browse repository at this point in the history" title="Browse repository at this point in the history" onClick={() => navigate(treeRoute(repo.id, c.sha))}>
                    <Oct name="code" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function CommitPage(props: { repo: GitRepo; sha: string }) {
  const { navigate, wm, playerInitials } = useGh();
  const repo = props.repo;
  const full = Object.keys(repo.commits).find((s) => s.startsWith(props.sha)) ?? null;
  const c = full ? repo.commits[full]! : null;
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const changes = useMemo(() => (c ? commitChanges(repo, c) : []), [repo, c]);
  const totals = useMemo(() => changes.reduce((t, f) => {
    const d = diffStats(f.before, f.after);
    return { a: t.a + d.added, d: t.d + d.removed };
  }, { a: 0, d: 0 }), [changes]);
  useEffect(() => {
    if (c) emitAppAction('github', 'github.commit.viewed', { repo: repo.id, sha: c.sha });
  }, [c?.sha, repo.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  if (!c) return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <NotFound />
    </>
  );
  const branchesWith = Object.entries(repo.branches).filter(([, head]) => chain(repo, head).some((x) => x.sha === c.sha)).map(([b]) => b);
  const msgLines = c.message.split('\n');
  const prMatch = /\(#(\d+)\)$/.exec(msgLines[0] ?? '');
  return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <div className="gh-container">
        <div className="gh-flex" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600 }}>Commit {shortSha(c.sha)}</h2>
          <span className="gh-spacer" />
          <button type="button" className="gh-btn gh-btn-sm" onClick={() => navigate(treeRoute(repo.id, c.sha))}>
            Browse files
          </button>
        </div>
        <div className="gh-commit-head">
          <div className="gh-commit-head-msg">
            {prMatch ? (
              <>
                {msgLines[0]!.slice(0, prMatch.index)}(
                <a href="#" onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, Number(prMatch[1]))))}>
                  #{prMatch[1]}
                </a>
                )
              </>
            ) : (
              msgLines[0]
            )}
            {msgLines.length > 1 ? <pre style={{ fontSize: 14, fontWeight: 400, margin: '8px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{msgLines.slice(1).join('\n').trim()}</pre> : null}
            <div className="gh-flex gh-muted" style={{ fontSize: 12, fontWeight: 400, marginTop: 8 }}>
              <Oct name="branch" /> {branchesWith.slice(0, 3).join(', ')}
            </div>
          </div>
          <div className="gh-commit-head-meta">
            <Avatar who={c.author} size={20} playerInitials={playerInitials} />
            <b>{login(c.author)}</b>
            <span className="gh-muted">
              committed <Rel ms={c.atMs} />
            </span>
            <span className="gh-spacer" />
            <span className="gh-muted">
              {c.parent ? (
                <>
                  1 parent{' '}
                  <a href="#" className="gh-sha" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.parent!)))}>
                    {shortSha(c.parent)}
                  </a>
                </>
              ) : (
                '0 parents'
              )}{' '}
              commit{' '}
              <b className="gh-sha" style={{ color: 'var(--gh-fg)', cursor: 'pointer' }} title="Copy full SHA" onClick={() => wm?.clipboard.write(c.sha, 'github')}>
                {shortSha(c.sha)}
              </b>
            </span>
          </div>
        </div>
        <div className="gh-flex" style={{ marginBottom: 16 }}>
          <span>
            Showing <b>{changes.length} changed file{changes.length === 1 ? '' : 's'}</b> with <b>{totals.a} addition{totals.a === 1 ? '' : 's'}</b> and <b>{totals.d} deletion{totals.d === 1 ? '' : 's'}</b>.
          </span>
          <span className="gh-spacer" />
          <div className="gh-seg">
            <button type="button" aria-pressed={view === 'split'} onClick={() => setView('split')}>
              Split
            </button>
            <button type="button" aria-pressed={view === 'unified'} onClick={() => setView('unified')}>
              Unified
            </button>
          </div>
        </div>
        {changes.slice(0, 40).map((f) => (
          <DiffFile key={f.path} path={f.path} before={f.before} after={f.after} view={view} />
        ))}
        {changes.length > 40 ? <div className="gh-flash gh-flash-info">{changes.length - 40} more files are not shown.</div> : null}
      </div>
    </>
  );
}

function NewBranchDialog(props: { repo: GitRepo; onClose(): void }) {
  const { navigate } = useGh();
  const [name, setName] = useState('');
  const [from, setFrom] = useState(props.repo.defaultBranch);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const r = createBranch(props.repo.id as RepoId, n, from);
    setBusy(false);
    emitAppAction('github', 'github.branch.created', { repo: props.repo.id, branch: n, from, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    props.onClose();
    navigate(repoRoute(props.repo.id, 'branches'), { replace: true });
  };
  return (
    <Modal
      title="Create a branch"
      onClose={props.onClose}
      footer={
        <>
          <button type="button" className="gh-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="gh-btn gh-btn-primary" disabled={!name.trim() || busy} onClick={submit}>
            Create new branch
          </button>
        </>
      }
    >
      {error ? <div className="gh-flash gh-flash-error" style={{ margin: 0 }}>{error}</div> : null}
      <label style={{ fontWeight: 600 }}>
        New branch name
        <input className="gh-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} style={{ marginTop: 6 }} />
      </label>
      <div style={{ fontWeight: 600 }}>
        Source
        <div style={{ marginTop: 6 }}>
          <BranchSelector repo={props.repo} current={from} onPick={setFrom} />
        </div>
      </div>
    </Modal>
  );
}

export function BranchesPage(props: { repo: GitRepo }) {
  const { navigate, readOnly } = useGh();
  const repo = props.repo;
  const [dialog, setDialog] = useState(false);
  const [filter, setFilter] = useState('');
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  const main = repo.branches[repo.defaultBranch] ?? null;
  const rows = useMemo(() => {
    return Object.entries(repo.branches)
      .filter(([b]) => b !== repo.defaultBranch && b.toLowerCase().includes(filter.trim().toLowerCase()))
      .map(([b, head]) => {
        const base = main ? mergeBase(repo, head, main) : null;
        const ahead = chain(repo, head).findIndex((c) => c.sha === base);
        const behind = main ? chain(repo, main).findIndex((c) => c.sha === base) : 0;
        const c = repo.commits[head];
        return { b, head, ahead: ahead < 0 ? 0 : ahead, behind: behind < 0 ? 0 : behind, atMs: c?.atMs ?? 0, author: c?.author ?? '', pr: repo.pullRequests.find((p) => p.sourceBranch === b) ?? null };
      })
      .sort((a, b) => b.atMs - a.atMs);
  }, [repo, filter, main]);
  const yours = rows.filter((r) => r.author === 'player');
  const row = (r: { b: string; head: string; ahead: number; behind: number; atMs: number; pr: (typeof rows)[number]['pr'] }, isDefault = false) => (
    <div className="gh-branch-row" key={r.b}>
      <span className="gh-flex" style={{ gap: 6, minWidth: 0 }}>
        <a className="gh-branch-name" href="#" onClick={(e) => (e.preventDefault(), navigate(isDefault ? repoRoute(repo.id) : treeRoute(repo.id, r.b)))}>
          {r.b}
        </a>
        {isDefault && isProtected(repo.id) ? (
          <span className="gh-label" title="Branch protection rule: Require a pull request before merging · Require approvals (1)">
            <Oct name="shield" size={12} /> Protected
          </span>
        ) : null}
      </span>
      <span className="gh-muted" style={{ fontSize: 12 }}>
        <Rel ms={r.atMs} />
      </span>
      <span>{r.pr && r.pr.state === 'open' ? <Oct name="checkCircle" color="#1a7f37" title="All checks have passed" /> : null}</span>
      <span>
        {isDefault ? (
          <span className="gh-label">Default</span>
        ) : (
          <span className="gh-ab" title={`${r.behind} commits behind, ${r.ahead} commits ahead of ${repo.defaultBranch}`}>
            <div>
              {r.behind}
              <i style={{ width: Math.min(60, r.behind * 6) }} />
            </div>
            <div>
              {r.ahead}
              <i style={{ width: Math.min(60, r.ahead * 6) }} />
            </div>
          </span>
        )}
      </span>
      <span>
        {r.pr ? (
          <a href="#" className="gh-flex" style={{ gap: 4, fontSize: 12 }} onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, r.pr!.number)))}>
            <Oct name={r.pr.state === 'merged' ? 'merge' : r.pr.state === 'closed' ? 'prClosed' : 'pr'} color={r.pr.state === 'merged' ? '#8250df' : r.pr.state === 'closed' ? '#d1242f' : '#1a7f37'} />#{r.pr.number}
          </a>
        ) : null}
      </span>
      <span>
        <button type="button" className="gh-btn gh-btn-sm gh-btn-invisible" aria-label="More options">
          <Oct name="kebab" />
        </button>
      </span>
    </div>
  );
  return (
    <>
      <GhHeader repo={repo.id} tab="code" openPrs={openPrs} />
      <div className="gh-container">
        <div className="gh-flex" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 24, fontWeight: 400 }}>Branches</h2>
          <span className="gh-spacer" />
          {!readOnly ? (
            <button type="button" className="gh-btn gh-btn-primary" onClick={() => setDialog(true)}>
              New branch
            </button>
          ) : null}
        </div>
        <div className="gh-filter">
          <label className="gh-filter-input">
            <Oct name="search" />
            <input placeholder="Search branches..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          </label>
        </div>
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>Default</h3>
        <div className="gh-box" style={{ marginBottom: 24 }}>
          {row({ b: repo.defaultBranch, head: main ?? '', ahead: 0, behind: 0, atMs: main ? repo.commits[main]?.atMs ?? 0 : 0, pr: null }, true)}
        </div>
        {yours.length ? (
          <>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>Your branches</h3>
            <div className="gh-box" style={{ marginBottom: 24 }}>
              {yours.map((r) => row(r))}
            </div>
          </>
        ) : null}
        <h3 style={{ fontSize: 16, fontWeight: 600, margin: '8px 0' }}>Active branches</h3>
        <div className="gh-box">
          {rows.length ? rows.map((r) => row(r)) : <div className="gh-blankslate">No other branches</div>}
        </div>
      </div>
      {dialog ? <NewBranchDialog repo={repo} onClose={() => setDialog(false)} /> : null}
    </>
  );
}
