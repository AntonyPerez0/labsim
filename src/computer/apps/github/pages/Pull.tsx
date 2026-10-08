/**
 * GitHub pull request view (Apps §7.4): Conversation (timeline, merge box, comment box), Commits, Checks,
 * Files changed (line comments, saved replies, Review changes).
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { emitAppAction } from '@/computer/apps';
import { sim } from '@/sim';
import type { GitRepo, PrComment, PullRequest, RepoId } from '@/sim/types';
import { Avatar, Oct } from '../icons';
import { onReviewLog, reviewEvents, simTry, useGh, noteReviewBody } from '../ctx';
import { GhHeader, NotFound, Popover, Rel } from '../Chrome';
import { CommentForm, DiffFile, StatBlocks, type PendingComment } from '../Diff';
import { Markdown } from '../highlight';
import { submitReview } from '../actions';
import { commitRoute, firstLine, isProtected, login, prCommits, prDiffStats, pullRoute, repoRoute, shortSha, SAVED_REPLIES, chain } from '../model';

type Tab = 'conversation' | 'commits' | 'checks' | 'files';

/* pending review comments survive tab switches (session-local) */
const pendingByPr = new Map<string, PendingComment[]>();
const pendingListeners = new Set<() => void>();
function setPending(key: string, list: PendingComment[]) {
  pendingByPr.set(key, list);
  for (const fn of [...pendingListeners]) fn();
}
function usePending(key: string): PendingComment[] {
  return useSyncExternalStore(
    (fn) => {
      pendingListeners.add(fn);
      return () => pendingListeners.delete(fn);
    },
    () => pendingByPr.get(key) ?? EMPTY,
  );
}
const EMPTY: PendingComment[] = [];

function useReviewLog(repo: string, n: number) {
  const [, force] = useState(0);
  useEffect(() => onReviewLog(() => force((x) => x + 1)), []);
  return reviewEvents(repo, n);
}

function StateBadge(props: { pr: PullRequest }) {
  const s = props.pr.state;
  return (
    <span className={`gh-state gh-state-${s}`}>
      <Oct name={s === 'merged' ? 'merge' : s === 'closed' ? 'prClosed' : 'pr'} color="#fff" />
      <span style={{ color: '#fff' }}>{s === 'open' ? 'Open' : s === 'merged' ? 'Merged' : 'Closed'}</span>
    </span>
  );
}

function mergeCommitSha(repo: GitRepo, pr: PullRequest): string | null {
  const main = repo.branches[repo.defaultBranch] ?? null;
  const c = chain(repo, main).find((x) => x.message.startsWith(`${pr.title} (#${pr.number})`));
  return c?.sha ?? null;
}

/* ─────────────────────────── Conversation ─────────────────────────── */

interface TlItem {
  at: number;
  order: number;
  node: ReactNode;
}

function Conversation(props: { repo: GitRepo; pr: PullRequest }) {
  const { navigate, playerInitials, readOnly } = useGh();
  const { repo, pr } = props;
  const log = useReviewLog(repo.id, pr.number);
  const commits = useMemo(() => prCommits(repo, pr), [repo, pr]);
  const [error, setError] = useState<string | null>(null);
  const items: TlItem[] = [];
  let k = 0;
  const ev = (at: number, icon: ReactNode, body: ReactNode, badge = '') =>
    items.push({
      at,
      order: k++,
      node: (
        <div className="gh-tl-event">
          <span className={`gh-tl-badge ${badge}`}>{icon}</span>
          <span>{body}</span>
        </div>
      ),
    });
  if (commits.length) {
    items.push({
      at: Math.max(pr.createdMs, commits[0]!.atMs) + 1,
      order: k++,
      node: (
        <div>
          <div className="gh-tl-event">
            <span className="gh-tl-badge">
              <Oct name="commit" />
            </span>
            <span>
              <Avatar who={commits[0]!.author} size={20} playerInitials={playerInitials} /> <b>{login(commits[0]!.author)}</b> added {commits.length} commit{commits.length === 1 ? '' : 's'} <Rel ms={commits[0]!.atMs} />
            </span>
          </div>
          {commits.map((c) => (
            <div className="gh-tl-commit" key={c.sha} style={{ marginLeft: 40 }}>
              <Avatar who={c.author} size={16} playerInitials={playerInitials} />
              <a href="#" className="gh-fg-link" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.sha)))}>
                {firstLine(c.message)}
              </a>
              <span className="gh-spacer" />
              <Oct name="check" color="#1a7f37" />
              <a href="#" className="gh-sha gh-muted" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.sha)))}>
                {shortSha(c.sha)}
              </a>
            </div>
          ))}
        </div>
      ),
    });
  }
  if (pr.reviewers.length) ev(pr.createdMs + 2, <Oct name="eye" />, <><b>{login(pr.author)}</b> requested a review from <b>{pr.reviewers.join(', ')}</b> <Rel ms={pr.createdMs} /></>);
  // Comments: general ones as cards, line comments grouped as review threads.
  const general = pr.comments.filter((c) => !c.path);
  const lineC = pr.comments.filter((c) => c.path);
  for (const c of general) {
    items.push({ at: c.atMs, order: k++, node: <CommentCard who={c.author} at={c.atMs} body={c.body} /> });
  }
  const threads = new Map<string, PrComment[]>();
  for (const c of lineC) {
    const key = `${c.author}|${Math.floor(c.atMs / 60_000)}`;
    threads.set(key, [...(threads.get(key) ?? []), c]);
  }
  for (const list of threads.values()) {
    const first = list[0]!;
    items.push({
      at: first.atMs + 0.5,
      order: k++,
      node: (
        <div className="gh-tl-comment">
          <Avatar who={first.author} size={40} playerInitials={playerInitials} />
          <div className="gh-tl-card">
            <div className="gh-tl-card-head">
              <b>{login(first.author)}</b> reviewed <Rel ms={first.atMs} />
            </div>
            <div className="gh-tl-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {list.map((c) => (
                <div key={c.id} className="gh-inline-thread">
                  <div className="gh-flex" style={{ padding: '6px 12px', background: 'var(--gh-subtle)', borderBottom: '1px solid var(--gh-border-muted)', fontFamily: 'var(--gh-mono)', fontSize: 12 }}>
                    <a href="#" onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, pr.number, 'files')))}>
                      {c.path}
                    </a>
                    <span className="gh-muted">line {c.line}</span>
                  </div>
                  <div style={{ padding: '8px 12px', whiteSpace: 'pre-wrap' }}>{c.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ),
    });
  }
  const logged = new Set<string>();
  for (const r of log) {
    logged.add(`${r.by}|${r.verdict}`);
    if (r.verdict === 'APPROVED') ev(r.atMs + 0.6, <Oct name="check" />, <><Avatar who={r.by} size={20} playerInitials={playerInitials} /> <b>{login(r.by)}</b> approved these changes <Rel ms={r.atMs} /></>, 'gh-tl-badge-green');
    else if (r.verdict === 'CHANGES_REQUESTED') ev(r.atMs + 0.6, <Oct name="fileDiff" />, <><Avatar who={r.by} size={20} playerInitials={playerInitials} /> <b>{login(r.by)}</b> requested changes <Rel ms={r.atMs} /></>, 'gh-tl-badge-red');
  }
  const lastActivity = Math.max(pr.createdMs, ...pr.comments.map((c) => c.atMs));
  for (const a of pr.approvals) {
    if (!logged.has(`${a}|APPROVED`)) ev(lastActivity + 0.7, <Oct name="check" />, <><Avatar who={a} size={20} playerInitials={playerInitials} /> <b>{login(a)}</b> approved these changes</>, 'gh-tl-badge-green');
  }
  if (pr.verdict === 'CHANGES_REQUESTED' && !log.some((r) => r.verdict === 'CHANGES_REQUESTED')) {
    const by = lineC.find((c) => c.author !== pr.author)?.author ?? pr.reviewers[0] ?? 'morgan';
    ev(lastActivity + 0.7, <Oct name="fileDiff" />, <><Avatar who={by} size={20} playerInitials={playerInitials} /> <b>{login(by)}</b> requested changes</>, 'gh-tl-badge-red');
  }
  if (pr.state === 'merged') {
    const sha = mergeCommitSha(repo, pr);
    const by = pr.mergedBy ?? repo.commits[sha ?? '']?.author ?? pr.author;
    ev(
      pr.mergedMs ?? lastActivity + 1,
      <Oct name="merge" />,
      <>
        <Avatar who={by} size={20} playerInitials={playerInitials} /> <b>{login(by)}</b> merged commit{' '}
        {sha ? (
          <a href="#" className="gh-sha" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, sha)))}>
            {shortSha(sha)}
          </a>
        ) : null}{' '}
        into <span className="gh-branch-chip">{pr.targetBranch}</span> <Rel ms={pr.mergedMs ?? pr.createdMs} />
      </>,
      'gh-tl-badge-purple',
    );
  }
  if (pr.state === 'closed') ev(lastActivity + 1, <Oct name="prClosed" />, <><b>{login(pr.reviewers[0] ?? pr.author)}</b> closed this</>, 'gh-tl-badge-red');
  items.sort((a, b) => a.at - b.at || a.order - b.order);

  const comment = (body: string, reason: string | null) => {
    const r = simTry(() => sim.git.comment(repo.id, pr.number, { path: null, line: null, body, ...(reason ? { reason } : {}) }, 'player'));
    emitAppAction('github', 'github.pr.commented', { repo: repo.id, number: pr.number, body, ok: r.ok, error: r.ok ? null : r.error });
    setError(r.ok ? null : r.error);
  };

  return (
    <div className="gh-row">
      <div className="gh-col-main">
        <div className="gh-timeline">
          <CommentCard who={pr.author} at={pr.createdMs} body={pr.body} isDescription />
          {items.map((it, i) => (
            <div key={i}>{it.node}</div>
          ))}
          {pr.state === 'open' ? <MergeBox repo={repo} pr={pr} /> : null}
          {pr.state === 'merged' ? (
            <div className="gh-mergebox">
              <span className="gh-mergebox-icon" style={{ background: '#8250df' }}>
                <Oct name="merge" size={24} />
              </span>
              <div className="gh-mergebox-card">
                <div className="gh-mb-section">
                  <div>
                    <h4>Pull request successfully merged and closed</h4>
                    <p>
                      You’re all set — the <span className="gh-branch-chip">{pr.sourceBranch}</span> branch can be safely deleted.
                    </p>
                  </div>
                  <span className="gh-spacer" />
                  <button type="button" className="gh-btn" disabled>
                    Delete branch
                  </button>
                </div>
              </div>
            </div>
          ) : null}
          {!readOnly ? (
            <div className="gh-tl-comment" style={{ marginTop: 16 }}>
              <Avatar who="player" size={40} playerInitials={playerInitials} />
              <div style={{ flex: 1 }}>
                {error ? <div className="gh-flash gh-flash-error">{error}</div> : null}
                <div style={{ fontWeight: 600, marginBottom: 8 }}>Add a comment</div>
                <CommentForm reviewMode={false} singleLabel="Comment" placeholder="Use Markdown to format your comment" onSubmit={(b, reason) => comment(b, reason)} />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <Sidebar repo={repo} pr={pr} />
    </div>
  );
}

function CommentCard(props: { who: string; at: number; body: string; isDescription?: boolean }) {
  const { playerInitials } = useGh();
  return (
    <div className="gh-tl-comment">
      <Avatar who={props.who} size={40} playerInitials={playerInitials} />
      <div className="gh-tl-card">
        <div className="gh-tl-card-head">
          <b>{login(props.who)}</b> {props.isDescription ? 'opened this pull request' : 'commented'} <Rel ms={props.at} />
          <span className="gh-spacer" />
          {props.isDescription ? <span className="gh-label">Author</span> : null}
        </div>
        <div className="gh-tl-card-body">{props.body.trim() ? <Markdown text={props.body} /> : <span className="gh-muted" style={{ fontStyle: 'italic' }}>No description provided.</span>}</div>
      </div>
    </div>
  );
}

function MergeBox(props: { repo: GitRepo; pr: PullRequest }) {
  const { readOnly } = useGh();
  const { repo, pr } = props;
  const [menu, setMenu] = useState(false);
  const [method, setMethod] = useState<'merge' | 'squash' | 'rebase'>('merge');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prot = isProtected(repo.id as RepoId);
  const approved = pr.approvals.some((a) => a !== pr.author) || pr.verdict === 'APPROVED';
  const changes = pr.verdict === 'CHANGES_REQUESTED';
  const blocked = changes || (prot && !approved);
  const checks = pr.checks;
  const merge = () => {
    const r = simTry(() => sim.git.mergePullRequest(repo.id, pr.number, 'player'));
    emitAppAction('github', 'github.pr.merged', { repo: repo.id, number: pr.number, ok: r.ok, error: r.ok ? null : r.error });
    setConfirm(false);
    setError(r.ok ? null : r.error);
  };
  const label = method === 'merge' ? 'Merge pull request' : method === 'squash' ? 'Squash and merge' : 'Rebase and merge';
  return (
    <div className="gh-mergebox">
      <span className="gh-mergebox-icon" style={{ background: blocked ? '#59636e' : '#1f883d' }}>
        <Oct name="merge" size={24} />
      </span>
      <div className="gh-mergebox-card">
        <div className="gh-mb-section">
          <span className="gh-mb-circle" style={{ background: approved ? '#1f883d' : changes ? '#d1242f' : '#9a6700' }}>
            <Oct name={approved ? 'check' : changes ? 'fileDiff' : 'eye'} />
          </span>
          <div>
            <h4>{approved ? 'Changes approved' : changes ? 'Changes requested' : prot ? 'Review required' : 'Review requested'}</h4>
            <p>
              {approved
                ? `${pr.approvals.length || 1} approving review by reviewers with write access.`
                : changes
                  ? 'A reviewer requested changes on this pull request.'
                  : prot
                    ? 'At least 1 approving review is required by reviewers with write access.'
                    : 'Review has been requested on this pull request. It is not required to merge.'}
            </p>
          </div>
        </div>
        <div className="gh-mb-section">
          <span className="gh-mb-circle" style={{ background: checks === 'success' ? '#1f883d' : checks === 'failure' ? '#d1242f' : '#9a6700' }}>
            <Oct name={checks === 'success' ? 'check' : checks === 'failure' ? 'x' : 'dot'} />
          </span>
          <div>
            <h4>{checks === 'success' ? 'All checks have passed' : checks === 'failure' ? 'All checks have failed' : 'Some checks haven’t completed yet'}</h4>
            <p>{checks === 'success' ? '1 successful check' : checks === 'failure' ? '1 failing check' : '1 pending check'} · Jenkins / pr-build</p>
          </div>
        </div>
        <div className="gh-mb-section">
          <span className="gh-mb-circle" style={{ background: blocked ? '#d1242f' : '#1f883d' }}>
            <Oct name={blocked ? 'x' : 'check'} />
          </span>
          <div>
            <h4>{blocked ? 'Merging is blocked' : 'This branch has no conflicts with the base branch'}</h4>
            <p>
              {blocked
                ? changes
                  ? 'Merging can be performed automatically once the requested changes are addressed.'
                  : 'The base branch requires all conversations on code to be resolved and at least 1 approving review.'
                : 'Merging can be performed automatically.'}
            </p>
          </div>
        </div>
        {!readOnly ? (
          <div className="gh-mb-actions">
            {error ? <div className="gh-flash gh-flash-error" style={{ margin: 0 }}>{error}</div> : null}
            {confirm ? (
              <div className="gh-flex">
                <button type="button" className="gh-btn gh-btn-primary" onClick={merge} autoFocus>
                  Confirm {method === 'merge' ? 'merge' : method === 'squash' ? 'squash and merge' : 'rebase and merge'}
                </button>
                <button type="button" className="gh-btn" onClick={() => setConfirm(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="gh-flex">
                <div className="gh-btn-group" data-hint="github.mergeButton">
                  <button type="button" className="gh-btn gh-btn-primary" disabled={blocked} onClick={() => setConfirm(true)}>
                    {label}
                  </button>
                  <Popover
                    open={menu}
                    onClose={() => setMenu(false)}
                    button={
                      <button type="button" className="gh-btn gh-btn-primary" disabled={blocked} aria-label="Select merge method" onClick={() => setMenu((m) => !m)} style={{ borderRadius: '0 6px 6px 0', marginLeft: -1 }}>
                        <Oct name="caret" />
                      </button>
                    }
                  >
                    {(
                      [
                        ['merge', 'Create a merge commit', 'All commits from this branch will be added to the base branch via a merge commit.'],
                        ['squash', 'Squash and merge', 'The 1 commit from this branch will be added to the base branch.'],
                        ['rebase', 'Rebase and merge', 'The 1 commit from this branch will be rebased and added to the base branch.'],
                      ] as const
                    ).map(([m, t, d]) => (
                      <button
                        key={m}
                        type="button"
                        className="gh-menu-item"
                        style={{ alignItems: 'flex-start' }}
                        onClick={() => {
                          setMethod(m);
                          setMenu(false);
                        }}
                      >
                        <span className="gh-menu-check">{method === m ? <Oct name="check" /> : null}</span>
                        <span>
                          <b>{t}</b>
                          <br />
                          <small className="gh-muted">{d}</small>
                        </span>
                      </button>
                    ))}
                  </Popover>
                </div>
                {prot && blocked ? (
                  <label className="gh-flex gh-muted" style={{ fontSize: 12, opacity: 0.7 }}>
                    <input type="checkbox" disabled /> Merge without waiting for requirements to be met
                  </label>
                ) : null}
              </div>
            )}
            <p className="gh-muted" style={{ margin: 0, fontSize: 12 }}>
              You can also merge this with the command line.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar(props: { repo: GitRepo; pr: PullRequest }) {
  const { pr } = props;
  const { playerInitials } = useGh();
  return (
    <div className="gh-col-side" style={{ flex: '0 0 256px' }}>
      <div className="gh-sidebar-item" style={{ paddingTop: 0 }}>
        <h4>
          Reviewers <Oct name="gear" />
        </h4>
        {pr.reviewers.length === 0 ? <span className="gh-muted">No reviews</span> : null}
        {pr.reviewers.map((r) => (
          <div className="gh-reviewer" key={r}>
            <Avatar who={r} size={20} playerInitials={playerInitials} /> {login(r)}
            <span className="gh-spacer" />
            {pr.approvals.includes(r) ? <Oct name="check" color="#1a7f37" title="Approved" /> : pr.verdict === 'CHANGES_REQUESTED' ? <Oct name="fileDiff" color="#d1242f" title="Requested changes" /> : <Oct name="dot" color="#9a6700" title="Awaiting requested review" />}
          </div>
        ))}
        {pr.approvals
          .filter((a) => !pr.reviewers.includes(a))
          .map((a) => (
            <div className="gh-reviewer" key={a}>
              <Avatar who={a} size={20} playerInitials={playerInitials} /> {login(a)}
              <span className="gh-spacer" />
              <Oct name="check" color="#1a7f37" title="Approved" />
            </div>
          ))}
      </div>
      {['Assignees', 'Labels', 'Projects', 'Milestone', 'Development'].map((t) => (
        <div className="gh-sidebar-item" key={t}>
          <h4>
            {t} <Oct name="gear" />
          </h4>
          <span className="gh-muted">{t === 'Assignees' ? 'No one assigned' : t === 'Labels' ? 'None yet' : t === 'Projects' ? 'None yet' : t === 'Milestone' ? 'No milestone' : 'Successfully merging this pull request may close these issues.'}</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────── Files changed ─────────────────────────── */

function ReviewPopover(props: { repo: GitRepo; pr: PullRequest; pending: PendingComment[]; onDone(): void }) {
  const { readOnly } = useGh();
  const { repo, pr } = props;
  const own = pr.author === 'player';
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'>('COMMENT');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (readOnly || pr.state !== 'open') return null;
  const submit = () => {
    const comments = props.pending.map((c) => ({ path: c.path, line: c.line, body: c.body, reason: c.reason }));
    const r = submitReview(repo.id as RepoId, pr.number, verdict, body, comments, reason);
    emitAppAction('github', 'github.pr.reviewSubmitted', { repo: repo.id, number: pr.number, verdict, body, comments, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) {
      setError(r.error);
      return;
    }
    noteReviewBody(repo.id, pr.number, 'player', body);
    setOpen(false);
    setBody('');
    setReason(null);
    setError(null);
    props.onDone();
  };
  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      className="gh-review-pop"
      button={
        <button type="button" className="gh-btn gh-btn-primary" data-hint="github.reviewChanges" onClick={() => setOpen((o) => !o)}>
          {props.pending.length ? `Finish your review` : 'Review changes'} {props.pending.length ? <span className="gh-counter" style={{ background: '#ffffff40', color: '#fff' }}>{props.pending.length}</span> : null} <Oct name="caret" />
        </button>
      }
    >
      <div className="gh-flex" style={{ marginBottom: 8 }}>
        <b>Finish your review</b>
        <span className="gh-spacer" />
        <Popover
          open={saved}
          onClose={() => setSaved(false)}
          align="right"
          button={
            <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" onClick={() => setSaved((s) => !s)} aria-label="Saved replies" title="Saved replies (Ctrl+.)">
              <Oct name="reply" /> <Oct name="caret" />
            </button>
          }
        >
          <div className="gh-overlay-head">Select a reply</div>
          {SAVED_REPLIES.map((r) => (
            <button
              key={r.reason}
              type="button"
              className="gh-menu-item"
              onClick={() => {
                setBody((b) => (b.trim() ? `${b.trimEnd()}\n${r.text}` : r.text));
                setReason(r.reason);
                setSaved(false);
              }}
            >
              {r.text}
            </button>
          ))}
        </Popover>
      </div>
      {error ? <div className="gh-flash gh-flash-error">{error}</div> : null}
      <textarea
        className="gh-textarea"
        placeholder="Leave a comment"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          if (!e.target.value.trim()) setReason(null);
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') (e.preventDefault(), submit());
          if ((e.ctrlKey || e.metaKey) && e.key === '.') (e.preventDefault(), setSaved(true));
        }}
      />
      {(
        [
          ['COMMENT', 'Comment', 'Submit general feedback without explicit approval.'],
          ['APPROVE', 'Approve', 'Give feedback and approve merging these changes.'],
          ['REQUEST_CHANGES', 'Request changes', 'Submit feedback that must be addressed before merging.'],
        ] as const
      ).map(([v, t, d]) => {
        const disabled = own && v !== 'COMMENT';
        return (
          <label key={v} className={disabled ? 'gh-disabled' : undefined} title={disabled ? 'Pull request authors can’t approve their own pull request' : undefined}>
            <input type="radio" name="verdict" checked={verdict === v} disabled={disabled} onChange={() => setVerdict(v)} />
            <span>
              {t}
              <small>{disabled ? 'Pull request authors can’t approve their own pull request' : d}</small>
            </span>
          </label>
        );
      })}
      <div className="gh-flex" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" className="gh-btn gh-btn-primary" onClick={submit} disabled={verdict === 'COMMENT' && !body.trim() && !props.pending.length}>
          Submit review
        </button>
      </div>
    </Popover>
  );
}

function FilesChanged(props: { repo: GitRepo; pr: PullRequest }) {
  const { readOnly } = useGh();
  const { repo, pr } = props;
  const key = `${repo.id}#${pr.number}`;
  const pending = usePending(key);
  const [view, setView] = useState<'unified' | 'split'>('unified');
  const [error, setError] = useState<string | null>(null);
  const stats = prDiffStats(pr);
  const onComment = (path: string) => (line: number, body: string, reason: string | null, mode: 'single' | 'review') => {
    if (mode === 'review') {
      setPending(key, [...pending, { path, line, body, reason }]);
      emitAppAction('github', 'github.pr.lineCommentAdded', { repo: repo.id, number: pr.number, path, line, body, reason });
      return;
    }
    const r = simTry(() => sim.git.comment(repo.id, pr.number, { path, line, body, ...(reason ? { reason } : {}) }, 'player'));
    setError(r.ok ? null : r.error);
    if (r.ok) emitAppAction('github', 'github.pr.lineCommentAdded', { repo: repo.id, number: pr.number, path, line, body, reason });
  };
  return (
    <>
      <div className="gh-flex" style={{ marginBottom: 16, position: 'sticky', top: 0, background: '#fff', zIndex: 5, padding: '8px 0', borderBottom: '1px solid var(--gh-border-muted)' }}>
        <span className="gh-muted">
          {pr.files.length} file{pr.files.length === 1 ? '' : 's'}
        </span>
        <div className="gh-seg">
          <button type="button" aria-pressed={view === 'split'} onClick={() => setView('split')}>
            Split
          </button>
          <button type="button" aria-pressed={view === 'unified'} onClick={() => setView('unified')}>
            Unified
          </button>
        </div>
        <span className="gh-spacer" />
        <span className="gh-sha">
          <span style={{ color: '#1a7f37' }}>+{stats.added}</span> <span style={{ color: '#d1242f' }}>−{stats.removed}</span> <StatBlocks {...stats} />
        </span>
        <ReviewPopover repo={repo} pr={pr} pending={pending} onDone={() => setPending(key, [])} />
      </div>
      {error ? <div className="gh-flash gh-flash-error">{error}</div> : null}
      <div className="gh-files-layout">
        <nav className="gh-file-tree" aria-label="File tree">
          {pr.files.map((f) => (
            <button key={f.path} type="button" title={f.path} onClick={() => document.getElementById(`gh-diff-${f.path}`)?.scrollIntoView({ block: 'start' })}>
              <Oct name="file" className="gh-file-icon" /> {f.path.slice(f.path.lastIndexOf('/') + 1)}
            </button>
          ))}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>
          {pr.files.map((f) => (
            <DiffFile
              key={f.path}
              anchorId={`gh-diff-${f.path}`}
              path={f.path}
              before={f.before}
              after={f.after}
              view={view}
              comments={pr.comments}
              pending={pending}
              reviewing={pending.length > 0}
              onComment={readOnly || pr.state !== 'open' ? undefined : onComment(f.path)}
            />
          ))}
          {!pr.files.length ? <div className="gh-box gh-blankslate">No changes to show.</div> : null}
        </div>
      </div>
    </>
  );
}

/* ─────────────────────────── Page ─────────────────────────── */

export function PullPage(props: { repo: GitRepo; number: number; tab: Tab }) {
  const { navigate, playerInitials } = useGh();
  const repo = props.repo;
  const pr = repo.pullRequests.find((p) => p.number === props.number) ?? null;
  const openPrs = repo.pullRequests.filter((p) => p.state === 'open').length;
  useEffect(() => {
    if (pr) emitAppAction('github', 'github.pr.viewed', { repo: repo.id, number: pr.number, tab: props.tab });
  }, [repo.id, pr?.number, props.tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const commits = useMemo(() => (pr ? prCommits(repo, pr) : []), [repo, pr]);
  if (!pr)
    return (
      <>
        <GhHeader repo={repo.id} tab="pulls" openPrs={openPrs} />
        <NotFound />
      </>
    );
  const stats = prDiffStats(pr);
  const tabs: { id: Tab; label: string; icon: Parameters<typeof Oct>[0]['name']; count: number }[] = [
    { id: 'conversation', label: 'Conversation', icon: 'comment', count: pr.comments.length },
    { id: 'commits', label: 'Commits', icon: 'commit', count: commits.length },
    { id: 'checks', label: 'Checks', icon: 'checkCircle', count: 1 },
    { id: 'files', label: 'Files changed', icon: 'fileDiff', count: pr.files.length },
  ];
  return (
    <>
      <GhHeader repo={repo.id} tab="pulls" openPrs={openPrs} />
      <div className="gh-container">
        <h1 className="gh-pr-title">
          {pr.title} <span>#{pr.number}</span>
        </h1>
        <div className="gh-pr-meta">
          <StateBadge pr={pr} />
          <span>
            <b style={{ color: 'var(--gh-fg)' }}>{login(pr.state === 'merged' ? (pr.mergedBy ?? pr.author) : pr.author)}</b> {pr.state === 'merged' ? 'merged' : 'wants to merge'} {commits.length} commit{commits.length === 1 ? '' : 's'} into <span className="gh-branch-chip">{pr.targetBranch}</span> from <span className="gh-branch-chip">{pr.sourceBranch}</span>
            {pr.state === 'merged' && pr.mergedMs != null ? (
              <>
                {' '}
                <Rel ms={pr.mergedMs} />
              </>
            ) : null}
          </span>
        </div>
        <nav className="gh-pr-tabs" aria-label="Pull request tabs">
          {tabs.map((t) => (
            <a key={t.id} href="#" className="gh-pr-tab" aria-current={props.tab === t.id ? 'page' : undefined} onClick={(e) => (e.preventDefault(), navigate(pullRoute(repo.id, pr.number, t.id)))}>
              <Oct name={t.icon} /> {t.label} <span className="gh-counter">{t.count}</span>
            </a>
          ))}
          <span className="gh-pr-tab-stat">
            <span style={{ color: '#1a7f37' }}>+{stats.added}</span>
            <span style={{ color: '#d1242f' }}>−{stats.removed}</span>
            <StatBlocks {...stats} />
          </span>
        </nav>
        {props.tab === 'conversation' ? <Conversation repo={repo} pr={pr} /> : null}
        {props.tab === 'files' ? <FilesChanged repo={repo} pr={pr} /> : null}
        {props.tab === 'commits' ? (
          <div className="gh-box">
            {commits.map((c) => (
              <div className="gh-commit-row" key={c.sha}>
                <div style={{ flex: 1 }}>
                  <a className="gh-commit-title" href="#" onClick={(e) => (e.preventDefault(), navigate(commitRoute(repo.id, c.sha)))}>
                    {firstLine(c.message)}
                  </a>
                  <div className="gh-flex gh-muted" style={{ fontSize: 12, marginTop: 4, gap: 6 }}>
                    <Avatar who={c.author} size={16} playerInitials={playerInitials} /> <b style={{ color: 'var(--gh-fg)' }}>{login(c.author)}</b> committed <Rel ms={c.atMs} />
                  </div>
                </div>
                <span className="gh-btn gh-btn-sm gh-sha">{shortSha(c.sha)}</span>
              </div>
            ))}
            {!commits.length ? <div className="gh-blankslate">No commits</div> : null}
          </div>
        ) : null}
        {props.tab === 'checks' ? (
          <div className="gh-row">
            <div className="gh-file-tree" style={{ flex: '0 0 280px', position: 'static' }}>
              <div className="gh-flex" style={{ padding: 6, fontWeight: 600 }}>
                {pr.checks === 'success' ? <Oct name="checkCircle" color="#1a7f37" /> : pr.checks === 'failure' ? <Oct name="xCircle" color="#d1242f" /> : <Oct name="dot" color="#9a6700" />}
                Jenkins
              </div>
              <div className="gh-flex" style={{ padding: '4px 6px 4px 28px', fontSize: 13 }}>
                pr-build
              </div>
            </div>
            <div className="gh-box" style={{ flex: 1 }}>
              <div className="gh-box-head">
                <b>Jenkins / pr-build</b>
                <span className="gh-spacer" />
                <span className="gh-muted">{pr.checks === 'success' ? 'succeeded' : pr.checks === 'failure' ? 'failed' : 'in progress'}</span>
              </div>
              <div style={{ padding: 16 }}>
                <p style={{ margin: 0 }}>
                  {pr.checks === 'success' ? 'This commit looks good' : pr.checks === 'failure' ? 'The build failed' : 'The build is running'} — <span className="gh-muted">Details are on the lab Jenkins (pr-build).</span>
                </p>
              </div>
            </div>
          </div>
        ) : null}
        <p className="gh-muted" style={{ fontSize: 12, marginTop: 24 }}>
          <a href="#" onClick={(e) => (e.preventDefault(), navigate(repoRoute(repo.id, 'pulls')))}>
            ← Back to pull requests
          </a>
        </p>
      </div>
    </>
  );
}
