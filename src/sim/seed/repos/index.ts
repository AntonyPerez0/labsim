/**
 * Builds the factory `GitRepo` records (Sim §2.12) from the seed modules: commits on `main` (oldest first),
 * PR branches, PR records and the remote file tree at the head of `main`.
 */
import type { GitCommit, GitRepo, LabState, PullRequest, RepoId } from '../../types';
import { padSha, stampToMs } from '../../devops/util';
import { GORT } from './gort';
import { ORCHESTRATOR } from './orchestrator';
import { PIGEON } from './pigeon';
import type { RepoSeed, SeedCommit } from './types';
import { UIA_REMOTE } from './uiaRemote';

export const REPO_SEEDS: Record<RepoId, RepoSeed> = {
  gort: GORT,
  'uia-remote': UIA_REMOTE,
  pigeon: PIGEON,
  orchestrator: ORCHESTRATOR,
};

/** `main` rejects direct pushes on these repos (Sim §3.22.1). */
export const PROTECTED_MAIN: Record<RepoId, boolean> = {
  gort: GORT.protectedMain,
  'uia-remote': UIA_REMOTE.protectedMain,
  pigeon: PIGEON.protectedMain,
  orchestrator: ORCHESTRATOR.protectedMain,
};

/** PR owner reviewer (Sim §3.22.2). */
export const REPO_OWNER: Record<RepoId, string> = { gort: 'jared', 'uia-remote': 'morgan', pigeon: 'morgan', orchestrator: 'tate' };

function applyChanges(tree: Record<string, string>, changes: Record<string, string | null>): void {
  for (const [p, v] of Object.entries(changes)) {
    if (v === null) delete tree[p];
    else tree[p] = v;
  }
}

export function buildRepo(seed: RepoSeed, epochDate: string): GitRepo {
  const commits: Record<string, GitCommit> = {};
  const byShort: Record<string, string> = {};
  const tree: Record<string, string> = {};
  const treeAt: Record<string, Record<string, string>> = {};
  let parent: string | null = null;
  const mk = (c: SeedCommit, par: string | null): GitCommit => {
    const sha = padSha(c.short, `${seed.id}:${c.message}`);
    byShort[c.short] = sha;
    return { sha, message: c.message, author: c.author, atMs: stampToMs(epochDate, c.at), changes: { ...c.changes }, parent: par };
  };
  for (const c of seed.commits) {
    const gc = mk(c, parent);
    commits[gc.sha] = gc;
    applyChanges(tree, c.changes);
    treeAt[gc.sha] = { ...tree };
    parent = gc.sha;
  }
  const mainHead = parent!;
  const branches: Record<string, string> = { main: mainHead };
  const prs: PullRequest[] = [];

  for (const pr of seed.prs) {
    // Base = parent of the squash commit (merged) or the given/main head (open/closed).
    const mergeSha = pr.mergeShort ? byShort[pr.mergeShort]! : null;
    const baseSha = mergeSha ? commits[mergeSha]!.parent! : pr.baseShort ? byShort[pr.baseShort]! : mainHead;
    const baseTree = treeAt[baseSha] ?? {};
    const branchCommits: SeedCommit[] = pr.branchCommits.length
      ? pr.branchCommits
      : mergeSha
        ? [{ short: `${pr.mergeShort!.slice(0, 3)}b${String(pr.number).slice(-3)}`.slice(0, 7), message: pr.title, author: pr.author, at: pr.createdAt, changes: commits[mergeSha]!.changes }]
        : [];
    let head = baseSha;
    const after = { ...baseTree };
    const changed = new Set<string>();
    for (const bc of branchCommits) {
      const gc = mk(bc, head);
      gc.sha = padSha(bc.short, `${seed.id}:pr${pr.number}:${bc.message}`);
      commits[gc.sha] = gc;
      head = gc.sha;
      applyChanges(after, bc.changes);
      for (const p of Object.keys(bc.changes)) changed.add(p);
    }
    if (pr.state !== 'merged') branches[pr.sourceBranch] = head;
    prs.push({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      body: pr.body,
      sourceBranch: pr.sourceBranch,
      targetBranch: 'main',
      state: pr.state,
      files: [...changed].sort().map((p) => ({ path: p, before: baseTree[p] ?? null, after: after[p] ?? null })),
      reviewers: [...pr.reviewers],
      approvals: [...pr.approvals],
      checks: pr.checks,
      createdMs: stampToMs(epochDate, pr.createdAt),
      mergedMs: pr.mergedAt ? stampToMs(epochDate, pr.mergedAt) : null,
      comments: pr.comments.map(({ at, ...c }) => ({ ...c, atMs: stampToMs(epochDate, at) })),
      verdict: pr.verdict,
      reviewDuePhysMs: null,
      headSha: head,
    });
  }
  prs.sort((a, b) => b.number - a.number);
  return {
    id: seed.id,
    name: seed.id,
    remoteUrl: seed.remoteUrl,
    description: seed.description,
    defaultBranch: 'main',
    branches,
    commits,
    files: tree,
    pullRequests: prs,
    local: null,
  };
}

/** Factory repos (Sim §2.12). */
export function seedRepos(lab: Pick<LabState, 'time'>): Record<RepoId, GitRepo> {
  const out = {} as Record<RepoId, GitRepo>;
  for (const id of Object.keys(REPO_SEEDS) as RepoId[]) out[id] = buildRepo(REPO_SEEDS[id], lab.time.epochDate);
  return out;
}

/** Next PR number per repo after the factory PRs. */
export function seedPrNumbers(): Record<RepoId, number> {
  return { gort: 420, 'uia-remote': 432, pigeon: 12, orchestrator: 82 };
}
