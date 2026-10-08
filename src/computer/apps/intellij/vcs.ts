/**
 * Read-only git views for the IDE: HEAD tree reconstruction from `repos[r].commits`, VCS file status colours,
 * branch lists, commit lists (Log / Push dialog). Pure functions over sim state (Sim §1.11, §3.22.1).
 */
import type { GitCommit, GitRepo } from '@/sim';

export type VcsStatus = 'unchanged' | 'modified' | 'added' | 'unversioned' | 'ignored' | 'deleted';

const treeCache = new WeakMap<Record<string, GitCommit>, Map<string, Record<string, string>>>();

/** File tree at `sha`, rebuilt from commit change sets (memoised per commits object). */
export function treeAt(repo: GitRepo, sha: string | null | undefined): Record<string, string> {
  if (!sha || !repo.commits[sha]) return sha === repo.branches[repo.defaultBranch] ? { ...repo.files } : {};
  let byCommits = treeCache.get(repo.commits);
  if (!byCommits) {
    byCommits = new Map();
    treeCache.set(repo.commits, byCommits);
  }
  const hit = byCommits.get(sha);
  if (hit) return hit;
  const chain: GitCommit[] = [];
  const seen = new Set<string>();
  for (let s: string | null = sha; s && repo.commits[s] && !seen.has(s); s = repo.commits[s].parent) {
    seen.add(s);
    chain.unshift(repo.commits[s]);
  }
  const out: Record<string, string> = {};
  for (const c of chain) for (const [p, v] of Object.entries(c.changes)) v === null ? delete out[p] : (out[p] = v);
  // A truncated history (root commit is not a full snapshot): fall back to the remote tree for unknown paths.
  if (chain.length && chain[0].parent && repo.commits[chain[0].parent] === undefined) {
    for (const [p, v] of Object.entries(repo.files)) if (!(p in out)) out[p] = v;
  }
  byCommits.set(sha, out);
  return out;
}

/** Simple .gitignore matching (exact names, `dir/`, `*.ext`). */
export function isIgnored(path: string, gitignore: string | undefined): boolean {
  if (!gitignore) return false;
  const name = path.split('/').pop() ?? path;
  for (const raw of gitignore.split('\n')) {
    const pat = raw.trim();
    if (!pat || pat.startsWith('#')) continue;
    if (pat.endsWith('/')) {
      const d = pat.slice(0, -1).replace(/^\//, '');
      if (path === d || path.startsWith(`${d}/`) || path.includes(`/${d}/`)) return true;
    } else if (pat.startsWith('*.')) {
      if (name.endsWith(pat.slice(1))) return true;
    } else if (pat.replace(/^\//, '') === path || (!pat.includes('/') && pat === name)) return true;
  }
  return false;
}

export function fileStatus(repo: GitRepo, path: string, head: Record<string, string>): VcsStatus {
  const l = repo.local;
  if (!l) return 'unchanged';
  if (isIgnored(path, l.files['.gitignore'])) return 'ignored';
  const inHead = path in head;
  const inTree = path in l.files;
  if (inHead && !inTree) return 'deleted';
  if (!inHead) return l.staged.includes(path) ? 'added' : 'unversioned';
  return head[path] !== l.files[path] ? 'modified' : 'unchanged';
}

/** Changed paths vs HEAD (union of the sim's `dirty` list and a direct comparison), ignored files excluded. */
export function changedPaths(repo: GitRepo, head: Record<string, string>): { path: string; status: VcsStatus }[] {
  const l = repo.local;
  if (!l) return [];
  const all = new Set<string>([...l.dirty, ...l.staged]);
  for (const p of Object.keys(l.files)) if (head[p] !== l.files[p]) all.add(p);
  for (const p of Object.keys(head)) if (!(p in l.files)) all.add(p);
  return [...all]
    .map((path) => ({ path, status: fileStatus(repo, path, head) }))
    .filter((x) => x.status !== 'unchanged' && x.status !== 'ignored')
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Commits reachable from `sha`, newest first. */
export function commitsFrom(repo: GitRepo, sha: string | null | undefined, limit = 200): GitCommit[] {
  const out: GitCommit[] = [];
  const seen = new Set<string>();
  for (let s = sha ?? null; s && repo.commits[s] && out.length < limit && !seen.has(s); s = repo.commits[s].parent) {
    seen.add(s);
    out.push(repo.commits[s]);
  }
  return out;
}

/** Local commits not on the remote branch (Push dialog). */
export function unpushedCommits(repo: GitRepo): GitCommit[] {
  const l = repo.local;
  if (!l) return [];
  const remoteHead = repo.branches[l.branch];
  const list = commitsFrom(repo, l.headSha, 50);
  if (remoteHead) {
    const idx = list.findIndex((c) => c.sha === remoteHead);
    if (idx >= 0) return list.slice(0, idx);
  }
  return list.slice(0, Math.max(0, l.ahead));
}

export const shortSha = (sha: string) => sha.slice(0, 7);

/** Git ref-format check (subset of `git check-ref-format --branch`). */
export function isValidBranchName(name: string): boolean {
  if (!name || name.startsWith('-') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false;
  if (/\.\.|\/\/|@\{|[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)) return false;
  return name !== '@' && !name.split('/').some((seg) => seg.startsWith('.'));
}
