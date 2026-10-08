/**
 * Git object helpers (Sim §1.11, §3.22.1): trees from the commit chain, ancestry, ignore rules, unified
 * diffs and `--stat` lines. Pure functions over `GitRepo`.
 */
import { ro } from '../core/ro';
import type { GitCommit, GitRepo } from '../types';

export type LocalClone = NonNullable<GitRepo['local']>;

/** Fields sim-devops keeps on a clone beyond the contract (`GitRepo.local`): local branches, upstreams, index. */
export interface LocalExt {
  /** Local branch → head sha. */
  branches: Record<string, string>;
  /** Local branch → remote branch it tracks (null = not pushed yet). */
  upstream: Record<string, string | null>;
  /** Staged content: path → contents (null = staged deletion). */
  index: Record<string, string | null>;
  /** Paths force-added despite .gitignore (git add -f). */
  forced: string[];
}

export function ext(local: LocalClone): LocalExt {
  const l = local as LocalClone & Partial<LocalExt>;
  l.branches ??= { [local.branch]: local.headSha };
  l.upstream ??= { [local.branch]: local.branch };
  l.index ??= {};
  l.forced ??= [];
  return l as LocalExt;
}

/** Commits from `sha` back to the root (newest first). */
export function chain(repo: GitRepo, sha: string | null): GitCommit[] {
  const out: GitCommit[] = [];
  const seen = new Set<string>();
  let cur = sha;
  while (cur && repo.commits[cur] && !seen.has(cur)) {
    seen.add(cur);
    const c = repo.commits[cur]!;
    out.push(c);
    cur = c.parent;
  }
  return out;
}

/**
 * Trees memoised per commit object. Commits are immutable once written (a draft's commit is read through
 * `ro()`, so the cache key is the stable committed object); the runners ask for a build's tree every
 * sub-step, and rebuilding it from the root each time dominated the Jenkins tick.
 */
const TREES = new WeakMap<object, Readonly<Record<string, string>>>();

function treeOf(repo: GitRepo, sha: string): Readonly<Record<string, string>> | null {
  const commits = ro(ro(repo).commits);
  const pending: GitCommit[] = [];
  let cur: string | null = sha;
  let base: Readonly<Record<string, string>> = {};
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const c: GitCommit | undefined = ro(commits[cur]);
    if (!c) break;
    const hit = TREES.get(c);
    if (hit) {
      base = hit;
      break;
    }
    pending.push(c);
    cur = c.parent;
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    const c = pending[i]!;
    const t: Record<string, string> = { ...base };
    for (const [p, v] of Object.entries(ro(c.changes))) {
      if (v === null) delete t[p];
      else t[p] = v;
    }
    TREES.set(c, t);
    base = t;
  }
  return pending.length || seen.size ? base : null;
}

/** Files at `sha`, shared and read-only (runners read it every step; never mutate or store it in state). */
export function treeView(repo: GitRepo, sha: string | null): Readonly<Record<string, string>> {
  if (!sha) return {};
  return treeOf(repo, sha) ?? {};
}

/** Files at `sha` (a fresh object the caller may keep or mutate). */
export function treeAt(repo: GitRepo, sha: string | null): Record<string, string> {
  if (!sha) return {};
  return { ...(treeOf(repo, sha) ?? {}) };
}

export function isAncestor(repo: GitRepo, ancestor: string, of: string): boolean {
  return chain(repo, of).some((c) => c.sha === ancestor);
}

/** Commits reachable from `a` but not from `b`. */
export function commitsBetween(repo: GitRepo, b: string | null, a: string): GitCommit[] {
  const exclude = new Set(chain(repo, b).map((c) => c.sha));
  return chain(repo, a).filter((c) => !exclude.has(c.sha));
}

export function mergeBase(repo: GitRepo, a: string, b: string): string | null {
  const inB = new Set(chain(repo, b).map((c) => c.sha));
  return chain(repo, a).find((c) => inB.has(c.sha))?.sha ?? null;
}

export const short = (sha: string): string => sha.slice(0, 7);

/** Resolve "HEAD", "HEAD~n", "main", "origin/main", a (short) sha. */
export function resolveRev(repo: GitRepo, rev: string): string | null {
  const local = repo.local ? ext(repo.local) : null;
  const m = /^(.+?)(?:~(\d+)|\^)?$/.exec(rev.trim());
  if (!m) return null;
  let base: string | null = null;
  const name = m[1]!;
  if (name === 'HEAD') base = repo.local?.headSha ?? repo.branches[repo.defaultBranch] ?? null;
  else if (name.startsWith('origin/')) base = repo.branches[name.slice(7)] ?? null;
  else if (local && local.branches[name]) base = local.branches[name]!;
  else if (repo.branches[name]) base = repo.branches[name]!;
  else if (/^[0-9a-f]{4,40}$/.test(name)) base = Object.keys(repo.commits).find((s) => s.startsWith(name)) ?? null;
  if (!base) return null;
  const steps = m[2] ? Number(m[2]) : rev.endsWith('^') ? 1 : 0;
  const c = chain(repo, base);
  return c[steps]?.sha ?? null;
}

/** .gitignore matching (exact names, dir/ prefixes, *.ext globs). */
export function isIgnored(tree: Record<string, string>, path: string): boolean {
  const gi = tree['.gitignore'];
  if (!gi) return false;
  const base = path.slice(path.lastIndexOf('/') + 1);
  for (const raw of gi.split('\n')) {
    const pat = raw.trim();
    if (!pat || pat.startsWith('#')) continue;
    if (pat.endsWith('/')) {
      const d = pat.slice(0, -1);
      if (path.startsWith(`${d}/`) || path.includes(`/${d}/`)) return true;
    } else if (pat.startsWith('*.')) {
      if (base.endsWith(pat.slice(1))) return true;
    } else if (pat.includes('/')) {
      if (path === pat || path.startsWith(`${pat}/`)) return true;
    } else if (base === pat) return true;
  }
  return false;
}

/* ── diff ── */

export interface Hunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
}

/** Line diff (LCS) → unified hunks with 3 lines of context. */
export function diffLines(a: string, b: string): { hunks: Hunk[]; added: number; removed: number } {
  const A = a === '' ? [] : a.replace(/\n$/, '').split('\n');
  const B = b === '' ? [] : b.replace(/\n$/, '').split('\n');
  const n = A.length;
  const m = B.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = A[i] === B[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  const ops: { t: ' ' | '-' | '+'; s: string; ai: number; bi: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) ops.push({ t: ' ', s: A[i]!, ai: i++, bi: j++ });
    else if (j < m && (i >= n || dp[i]![j + 1]! >= dp[i + 1]![j]!)) ops.push({ t: '+', s: B[j]!, ai: i, bi: j++ });
    else ops.push({ t: '-', s: A[i]!, ai: i++, bi: j });
  }
  const added = ops.filter((o) => o.t === '+').length;
  const removed = ops.filter((o) => o.t === '-').length;
  const hunks: Hunk[] = [];
  const C = 3;
  let k = 0;
  while (k < ops.length) {
    while (k < ops.length && ops[k]!.t === ' ') k++;
    if (k >= ops.length) break;
    let start = Math.max(0, k - C);
    let end = k;
    for (;;) {
      while (end < ops.length && ops[end]!.t !== ' ') end++;
      let nextChange = end;
      while (nextChange < ops.length && ops[nextChange]!.t === ' ') nextChange++;
      if (nextChange < ops.length && nextChange - end <= 2 * C) {
        end = nextChange;
        continue;
      }
      end = Math.min(ops.length, end + C);
      break;
    }
    const slice = ops.slice(start, end);
    const first = slice[0]!;
    hunks.push({
      oldStart: first.ai + 1,
      oldLines: slice.filter((o) => o.t !== '+').length,
      newStart: first.bi + 1,
      newLines: slice.filter((o) => o.t !== '-').length,
      lines: slice.map((o) => `${o.t}${o.s}`),
    });
    k = end;
    start = end;
  }
  return { hunks, added, removed };
}

/** `git diff`-style text for one file. */
export function unifiedDiff(path: string, before: string | null, after: string | null, shaA = '0000000', shaB = '0000000'): string[] {
  const d = diffLines(before ?? '', after ?? '');
  if (!d.hunks.length && before !== null && after !== null) return [];
  const out = [`diff --git a/${path} b/${path}`];
  if (before === null) out.push('new file mode 100644', `index 0000000..${shaB.slice(0, 7)}`, '--- /dev/null', `+++ b/${path}`);
  else if (after === null) out.push('deleted file mode 100644', `index ${shaA.slice(0, 7)}..0000000`, `--- a/${path}`, '+++ /dev/null');
  else out.push(`index ${shaA.slice(0, 7)}..${shaB.slice(0, 7)} 100644`, `--- a/${path}`, `+++ b/${path}`);
  for (const h of d.hunks) {
    out.push(`@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`);
    out.push(...h.lines);
  }
  return out;
}

/** `--stat` lines + summary for a set of changes. */
export function statLines(changes: { path: string; before: string | null; after: string | null }[]): string[] {
  if (!changes.length) return [];
  const rows = changes.map((c) => {
    const d = diffLines(c.before ?? '', c.after ?? '');
    return { path: c.path, add: d.added, del: d.removed };
  });
  const w = Math.max(...rows.map((r) => r.path.length));
  const out = rows.map((r) => {
    const total = r.add + r.del;
    const bar = '+'.repeat(Math.min(r.add, 40)) + '-'.repeat(Math.min(r.del, 40));
    return ` ${r.path.padEnd(w)} | ${String(total).padStart(3)} ${bar}`;
  });
  const ins = rows.reduce((s, r) => s + r.add, 0);
  const del = rows.reduce((s, r) => s + r.del, 0);
  const parts = [`${rows.length} file${rows.length === 1 ? '' : 's'} changed`];
  if (ins) parts.push(`${ins} insertion${ins === 1 ? '' : 's'}(+)`);
  if (del) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`);
  out.push(` ${parts.join(', ')}`);
  return out;
}

/** Changes of one commit with before/after. */
export function commitChanges(repo: GitRepo, c: GitCommit): { path: string; before: string | null; after: string | null }[] {
  const parentTree = treeAt(repo, c.parent);
  return Object.keys(c.changes)
    .sort()
    .map((p) => ({ path: p, before: parentTree[p] ?? null, after: c.changes[p] ?? null }));
}

export const VALID_BRANCH = /^(?!\/|.*\/$|.*\.\.|.*\/\.|.*\.lock$|.*@\{)[A-Za-z0-9._\/-]+$/;
