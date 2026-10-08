/**
 * GitHub page model (Apps §7): route parsing, ref resolution (branch names may contain "/"), trees per sha
 * (memoised), commit history, file stats and language detection. Pure over `LabState['repos']`.
 * Git object helpers come from the sim (`@/sim/devops/gitCore`, pure) so the web view and `git` agree.
 */
import { APP_ROUTES, matchRoute } from '@/computer/apps';
import type { GitCommit, GitRepo, PullRequest, RepoId } from '@/sim/types';
import { chain, commitChanges, diffLines, mergeBase, treeAt } from '@/sim/devops/gitCore';
import { PROTECTED_MAIN, REPO_OWNER } from '@/sim/seed/repos';

export { chain, commitChanges, diffLines, mergeBase };
export const ORG = 'labsim-lab';
export const REPO_IDS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];

export function isProtected(repo: RepoId): boolean {
  return !!PROTECTED_MAIN[repo];
}

export function repoOwner(repo: RepoId): string {
  return REPO_OWNER[repo] ?? 'morgan';
}

export type GhPage =
  | { kind: 'org'; tab: 'overview' | 'repositories' }
  | { kind: 'repo'; repo: string }
  | { kind: 'tree'; repo: string; ref: string }
  | { kind: 'blob'; repo: string; ref: string }
  | { kind: 'edit'; repo: string; ref: string }
  | { kind: 'newFile'; repo: string; ref: string }
  | { kind: 'commits'; repo: string; ref: string }
  | { kind: 'commit'; repo: string; sha: string }
  | { kind: 'branches'; repo: string }
  | { kind: 'pulls'; repo: string; q: string }
  | { kind: 'compare'; repo: string; range: string }
  | { kind: 'pull'; repo: string; number: number; tab: 'conversation' | 'commits' | 'checks' | 'files' }
  | { kind: 'issues'; repo: string }
  | { kind: 'actions'; repo: string }
  | { kind: 'empty'; repo: string; tab: 'projects' | 'security' | 'pulse' }
  | { kind: 'notFound' };

const R = APP_ROUTES.github;

export function parseRoute(route: string): GhPage {
  const path = route.split('?')[0]!.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/labsim-lab') {
    const tab = /[?&]tab=repositories/.test(route) ? 'repositories' : 'overview';
    return { kind: 'org', tab };
  }
  // `git push` prints `…/pull/new/<branch>` ("Create a pull request for '<branch>' on GitHub by visiting");
  // GitHub opens the compare view of that branch against the default branch.
  const pullNew = /^\/labsim-lab\/([^/]+)\/pull\/new\/(.+)$/.exec(path);
  if (pullNew) return { kind: 'compare', repo: pullNew[1]!, range: decodeURIComponent(pullNew[2]!) };
  const actionsSub = /^\/labsim-lab\/([^/]+)\/actions(?:\/.*)?$/.exec(path);
  if (actionsSub) return { kind: 'actions', repo: actionsSub[1]! };
  const tries: [keyof typeof R, (p: Record<string, string>, q: Record<string, string>) => GhPage][] = [
    ['pullFiles', (p) => ({ kind: 'pull', repo: p.repo!, number: Number(p.number), tab: 'files' })],
    ['pullCommits', (p) => ({ kind: 'pull', repo: p.repo!, number: Number(p.number), tab: 'commits' })],
    ['pullChecks', (p) => ({ kind: 'pull', repo: p.repo!, number: Number(p.number), tab: 'checks' })],
    ['pull', (p) => ({ kind: 'pull', repo: p.repo!, number: Number(p.number), tab: 'conversation' })],
    ['pulls', (p, q) => ({ kind: 'pulls', repo: p.repo!, q: q.q ?? 'is:pr is:open' })],
    ['compare', (p) => ({ kind: 'compare', repo: p.repo!, range: p.range! })],
    ['branches', (p) => ({ kind: 'branches', repo: p.repo! })],
    ['commit', (p) => ({ kind: 'commit', repo: p.repo!, sha: p.sha! })],
    ['commits', (p) => ({ kind: 'commits', repo: p.repo!, ref: p.ref! })],
    ['tree', (p) => ({ kind: 'tree', repo: p.repo!, ref: p.ref! })],
    ['blob', (p) => ({ kind: 'blob', repo: p.repo!, ref: p.ref! })],
    ['edit', (p) => ({ kind: 'edit', repo: p.repo!, ref: p.ref! })],
    ['newFile', (p) => ({ kind: 'newFile', repo: p.repo!, ref: p.ref! })],
    ['issues', (p) => ({ kind: 'issues', repo: p.repo! })],
    ['actions', (p) => ({ kind: 'actions', repo: p.repo! })],
    ['repo', (p) => ({ kind: 'repo', repo: p.repo! })],
  ];
  for (const [key, make] of tries) {
    const m = matchRoute(R[key], route);
    if (m) return make(m.params, m.query);
  }
  const extra = /^\/labsim-lab\/([^/]+)\/(projects|security|pulse)$/.exec(path);
  if (extra) return { kind: 'empty', repo: extra[1]!, tab: extra[2] as 'projects' | 'security' | 'pulse' };
  if (/^\/labsim-lab\/([^/]+)\/commits$/.test(path)) return { kind: 'commits', repo: path.split('/')[2]!, ref: '' };
  return { kind: 'notFound' };
}

export const repoRoute = (repo: string, rest = '') => `/labsim-lab/${repo}${rest ? `/${rest}` : ''}`;
export const treeRoute = (repo: string, branch: string, path = '') => repoRoute(repo, `tree/${branch}${path ? `/${path}` : ''}`);
export const blobRoute = (repo: string, branch: string, path: string) => repoRoute(repo, `blob/${branch}/${path}`);
export const commitRoute = (repo: string, sha: string) => repoRoute(repo, `commit/${sha}`);
export const pullRoute = (repo: string, n: number, tab: 'conversation' | 'commits' | 'checks' | 'files' = 'conversation') =>
  repoRoute(repo, `pull/${n}${tab === 'conversation' ? '' : `/${tab}`}`);

/** Split `<branch>/<path>` by the longest existing branch (or a sha). */
export function splitRef(repo: GitRepo, ref: string): { branch: string; sha: string | null; path: string } {
  const clean = ref.replace(/^\/+|\/+$/g, '');
  const names = Object.keys(repo.branches).sort((a, b) => b.length - a.length);
  for (const b of names) {
    if (clean === b || clean.startsWith(`${b}/`)) return { branch: b, sha: repo.branches[b] ?? null, path: clean.slice(b.length + 1) };
  }
  const first = clean.split('/')[0] ?? '';
  if (/^[0-9a-f]{7,40}$/.test(first)) {
    const sha = Object.keys(repo.commits).find((s) => s.startsWith(first)) ?? null;
    if (sha) return { branch: first, sha, path: clean.slice(first.length + 1) };
  }
  return { branch: first, sha: null, path: clean.slice(first.length + 1) };
}

/* ── trees (memoised per repo object + sha) ── */

const treeCache = new WeakMap<Record<string, GitCommit>, Map<string, Record<string, string>>>();

export function tree(repo: GitRepo, sha: string | null): Record<string, string> {
  if (!sha) return {};
  if (sha === repo.branches[repo.defaultBranch] && repo.files && Object.keys(repo.files).length) return repo.files;
  let m = treeCache.get(repo.commits);
  if (!m) {
    m = new Map();
    treeCache.set(repo.commits, m);
  }
  let t = m.get(sha);
  if (!t) {
    t = treeAt(repo, sha);
    m.set(sha, t);
  }
  return t;
}

export interface DirEntry {
  name: string;
  path: string;
  kind: 'dir' | 'file';
}

/** Entries of a directory inside a tree (dirs first, then files, alphabetical; GitHub order). */
export function listDir(t: Record<string, string>, dir: string): DirEntry[] | null {
  const prefix = dir ? `${dir}/` : '';
  const dirs = new Set<string>();
  const files: DirEntry[] = [];
  let found = !dir;
  for (const p of Object.keys(t)) {
    if (!p.startsWith(prefix)) continue;
    found = true;
    const rest = p.slice(prefix.length);
    const i = rest.indexOf('/');
    if (i < 0) files.push({ name: rest, path: p, kind: 'file' });
    else dirs.add(rest.slice(0, i));
  }
  if (!found) return null;
  const out: DirEntry[] = [...dirs].sort((a, b) => a.localeCompare(b)).map((d) => ({ name: d, path: prefix + d, kind: 'dir' as const }));
  return out.concat(files.sort((a, b) => a.name.localeCompare(b.name)));
}

/** Last commit (in the branch history) that touched `path` (file or directory prefix). */
export function lastCommitFor(repo: GitRepo, sha: string | null, path: string): GitCommit | null {
  const commits = chain(repo, sha);
  if (!path) return commits[0] ?? null;
  for (const c of commits) {
    for (const p of Object.keys(c.changes)) if (p === path || p.startsWith(`${path}/`)) return c;
  }
  return null;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

export function firstLine(msg: string): string {
  return msg.split('\n')[0] ?? '';
}

/** `26 lines (22 loc) · 812 Bytes` */
export function fileStats(text: string): string {
  const lines = text === '' ? 0 : text.replace(/\n$/, '').split('\n').length;
  const loc = text.split('\n').filter((l) => l.trim()).length;
  const bytes = new TextEncoder().encode(text).length;
  const size = bytes < 1024 ? `${bytes} Bytes` : `${(bytes / 1024).toFixed(bytes < 10240 ? 2 : 1)} KB`;
  return `${lines} lines (${loc} loc) · ${size}`;
}

export type Lang = 'java' | 'json' | 'go' | 'markdown' | 'yaml' | 'groovy' | 'properties' | 'xml' | 'swift' | 'csharp' | 'python' | 'gradle' | 'shell' | 'text';

export function langOf(path: string): Lang {
  const base = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
  if (base === 'jenkinsfile') return 'groovy';
  if (base === 'dockerfile' || base === 'gradlew') return 'shell';
  const ext = base.includes('.') ? base.slice(base.lastIndexOf('.') + 1) : '';
  switch (ext) {
    case 'java':
      return 'java';
    case 'json':
      return 'json';
    case 'go':
      return 'go';
    case 'md':
      return 'markdown';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'groovy':
      return 'groovy';
    case 'gradle':
      return 'gradle';
    case 'properties':
    case 'example':
      return 'properties';
    case 'xml':
      return 'xml';
    case 'swift':
      return 'swift';
    case 'cs':
      return 'csharp';
    case 'py':
      return 'python';
    case 'sh':
      return 'shell';
    default:
      return 'text';
  }
}

export const LANG_INFO: Record<string, { name: string; color: string }> = {
  java: { name: 'Java', color: '#b07219' },
  json: { name: 'JSON', color: '#292929' },
  go: { name: 'Go', color: '#00ADD8' },
  markdown: { name: 'Markdown', color: '#083fa1' },
  yaml: { name: 'YAML', color: '#cb171e' },
  swift: { name: 'Swift', color: '#F05138' },
  csharp: { name: 'C#', color: '#178600' },
  python: { name: 'Python', color: '#3572A5' },
  groovy: { name: 'Groovy', color: '#4298b8' },
  xml: { name: 'XML', color: '#0060ac' },
};

/** Main language of a repo (by bytes of known languages). */
export function repoLanguage(t: Record<string, string>): { name: string; color: string } | null {
  const bytes: Record<string, number> = {};
  for (const [p, v] of Object.entries(t)) {
    const l = langOf(p);
    if (!LANG_INFO[l] || l === 'markdown' || l === 'yaml' || l === 'xml') continue;
    bytes[l] = (bytes[l] ?? 0) + v.length;
  }
  const top = Object.entries(bytes).sort((a, b) => b[1] - a[1])[0];
  return top ? LANG_INFO[top[0]]! : null;
}

/** Display login for a sim author key. */
export function login(author: string): string {
  return author === 'player' ? 'engineer' : author;
}

/** PR review summary line. */
export function reviewState(pr: PullRequest): 'Approved' | 'Changes requested' | 'Review required' | null {
  if (pr.state !== 'open') return pr.verdict === 'APPROVED' ? 'Approved' : null;
  if (pr.verdict === 'APPROVED' || pr.approvals.length > 0) return 'Approved';
  if (pr.verdict === 'CHANGES_REQUESTED') return 'Changes requested';
  return 'Review required';
}

/** Commits of a PR: on its source branch but not on the target. */
export function prCommits(repo: GitRepo, pr: PullRequest): GitCommit[] {
  const head = repo.branches[pr.sourceBranch] ?? pr.headSha;
  const base = repo.branches[pr.targetBranch] ?? null;
  if (!head) return [];
  if (pr.state === 'merged') {
    // After a merge the commits are reachable from the target; show the head chain down to the merge base of its parent.
    const exclude = new Set(chain(repo, repo.commits[head]?.parent ? mergeBase(repo, head, base ?? head) : null).map((c) => c.sha));
    const own = chain(repo, head).filter((c) => !exclude.has(c.sha));
    return own.length ? own.slice(0, 20).reverse() : chain(repo, head).slice(0, 1);
  }
  const exclude = new Set(chain(repo, base).map((c) => c.sha));
  return chain(repo, head)
    .filter((c) => !exclude.has(c.sha))
    .reverse();
}

/** `+12 −3` totals of a PR's files. */
export function prDiffStats(pr: PullRequest): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const f of pr.files) {
    const d = diffLines(f.before ?? '', f.after ?? '');
    added += d.added;
    removed += d.removed;
  }
  return { added, removed };
}

/** Saved replies = the team's review reasons (Sim §3.22.2). */
export const SAVED_REPLIES: { reason: string; text: string }[] = [
  { reason: 'main-edit', text: 'QA never modifies main' },
  { reason: 'missing-isScreenPresent', text: 'Missing mandatory isScreenPresent()' },
  { reason: 'missing-waitForScreen', text: 'Missing waitForScreen() before the first click' },
  { reason: 'port-5555', text: 'portNumber must be 5444' },
  { reason: 'extends-BaseTest', text: 'Screen classes must extend BaseTest' },
];

/** Repo descriptions shown when the sim's are empty. */
export function repoDescription(repo: GitRepo): string {
  return repo.description || '';
}
