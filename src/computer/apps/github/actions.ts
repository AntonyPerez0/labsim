/**
 * GitHub write paths (Apps §7, contract delta D5). Feature-detects the GitHub-side sim calls
 * (`sim.github.createBranch`, `sim.github.commitFile`, `sim.git.reviewPullRequest`) and otherwise goes
 * through the workstation clone: clone if needed → checkout/branch → writeFile → stage → commit → push,
 * then restores the clone's previous branch.
 */
import { sim } from '@/sim';
import { getState } from '@/core/store';
import type { RepoId } from '@/sim/types';
import { simTry } from './ctx';

type R<T = undefined> = { ok: true; value: T } | { ok: false; error: string };
const OK: R = { ok: true, value: undefined };

interface GithubSideApi {
  createBranch?(repo: RepoId, name: string, fromSha: string, actor: string): R;
  commitFile?(repo: RepoId, branch: string, path: string, contents: string | null, message: string, actor: string): R<{ sha: string }>;
}

function ghApi(): GithubSideApi | null {
  return ((sim as unknown as { github?: GithubSideApi }).github ?? null) as GithubSideApi | null;
}

/** Run `steps` on the local clone, then put it back on the branch it was on. */
function viaClone(repo: RepoId, steps: () => R): R {
  const lab = getState().lab;
  if (!lab.repos[repo]?.local) {
    const c = simTry(() => sim.git.clone(repo, 'player'));
    if (!c.ok) return c;
  }
  const before = getState().lab.repos[repo]?.local?.branch ?? null;
  const r = steps();
  const now = getState().lab.repos[repo]?.local?.branch ?? null;
  if (before && now && now !== before) simTry(() => sim.git.checkout(repo, before, false));
  return r;
}

export function createBranch(repo: RepoId, name: string, from: string): R {
  const api = ghApi();
  const lab = getState().lab;
  const fromSha = lab.repos[repo]?.branches[from];
  if (!fromSha) return { ok: false, error: `Branch '${from}' not found` };
  if (lab.repos[repo]?.branches[name]) return { ok: false, error: `A branch named '${name}' already exists.` };
  if (api?.createBranch) return simTry(() => api.createBranch!(repo, name, fromSha, 'player'));
  return viaClone(repo, () => {
    const a = simTry(() => sim.git.checkout(repo, from, false));
    if (!a.ok) return a;
    const pull = simTry(() => sim.git.pull(repo));
    if (!pull.ok) return pull;
    const b = simTry(() => sim.git.checkout(repo, name, true));
    if (!b.ok) return b;
    const p = simTry(() => sim.git.push(repo));
    return p.ok ? OK : p;
  });
}

/**
 * Commit one file change on `branch` (creating `newBranch` from it first when given). `contents` null deletes.
 * Returns the branch the commit landed on.
 */
export function commitFile(repo: RepoId, branch: string, path: string, contents: string | null, message: string, newBranch: string | null): R<{ branch: string }> {
  const api = ghApi();
  const target = newBranch ?? branch;
  if (api?.commitFile && (!newBranch || api.createBranch)) {
    if (newBranch) {
      const b = createBranch(repo, newBranch, branch);
      if (!b.ok) return b;
    }
    const c = simTry(() => api.commitFile!(repo, target, path, contents, message, 'player'));
    return c.ok ? { ok: true, value: { branch: target } } : c;
  }
  const r = viaClone(repo, () => {
    const a = simTry(() => sim.git.checkout(repo, branch, false));
    if (!a.ok) return a;
    const pull = simTry(() => sim.git.pull(repo));
    if (!pull.ok) return pull;
    if (newBranch) {
      const b = simTry(() => sim.git.checkout(repo, newBranch, true));
      if (!b.ok) return b;
    }
    const w = contents === null ? simTry(() => sim.git.deleteFile(repo, path)) : simTry(() => sim.git.writeFile(repo, path, contents));
    if (!w.ok) return w;
    const s = simTry(() => sim.git.stage(repo, [path]));
    if (!s.ok) return s;
    const c = simTry(() => sim.git.commit(repo, message, 'player'));
    if (!c.ok) return c;
    const p = simTry(() => sim.git.push(repo));
    return p.ok ? OK : p;
  });
  return r.ok ? { ok: true, value: { branch: target } } : r;
}

export interface ReviewComment {
  path: string;
  line: number;
  body: string;
  reason: string | null;
}

interface ReviewApi {
  reviewPullRequest?(repo: RepoId, n: number, review: { verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT'; body: string; comments: ReviewComment[] }, actor: string): R;
}

/** Submit a review: pending line comments, then the verdict (D5 / D19 fallbacks). */
export function submitReview(repo: RepoId, n: number, verdict: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT', body: string, comments: ReviewComment[], bodyReason: string | null): R {
  const api = sim.git as unknown as ReviewApi;
  if (api.reviewPullRequest) return simTry(() => api.reviewPullRequest!(repo, n, { verdict, body, comments }, 'player'));
  for (const c of comments) {
    const r = simTry(() => sim.git.comment(repo, n, { path: c.path, line: c.line, body: c.body, ...(c.reason ? { reason: c.reason } : {}) }, 'player'));
    if (!r.ok) return r;
  }
  if (verdict === 'APPROVE') {
    if (body.trim()) simTry(() => sim.git.comment(repo, n, { path: null, line: null, body: body.trim() }, 'player'));
    return simTry(() => sim.git.approvePullRequest(repo, n, 'player'));
  }
  if (verdict === 'REQUEST_CHANGES') {
    const reason = bodyReason ?? comments.find((c) => c.reason)?.reason ?? undefined;
    if (body.trim() && !bodyReason) simTry(() => sim.git.comment(repo, n, { path: null, line: null, body: body.trim() }, 'player'));
    return simTry(() => sim.git.requestChanges(repo, n, 'player', reason ?? undefined));
  }
  if (body.trim()) {
    const c = simTry(() => sim.git.comment(repo, n, { path: null, line: null, body: body.trim(), ...(bodyReason ? { reason: bodyReason } : {}) }, 'player'));
    return c.ok ? OK : c;
  }
  return comments.length ? OK : { ok: false, error: 'Review body can’t be blank' };
}
