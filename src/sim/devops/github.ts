/**
 * GitHub side (Sim §3.22.2–§3.22.3): pull requests, reviews/comments, merges, and the scripted NPC
 * reviewers — Jared (gort coordinates ±0.5 mm), Morgan (uia-remote / pigeon code facts), Tate
 * (orchestrator, never merges). NPCs act 20 s physical after a PR opens and after each push to it.
 */
import type { TxContext } from '@/core/store';
import type { LabState, PullRequest, RepoId } from '../types';
import { PROTECTED_MAIN, REPO_OWNER } from '../seed/repos';
import { truthFor } from '../seed/repos/screenTruth';
import { core } from './coreRef';
import { hasIsScreenPresent, hasWaitForScreen, javaSyntaxError, packageProblems, PO_DIR, committedPort5555, touchesMain } from './codefacts';
import { chain, mergeBase, treeAt } from './gitCore';
import { afterMainMoved, commitRemote, refreshLocal } from './git';
import type { GitOp } from './git';
import { parseStrictJson } from './json';
import type { JsonValue } from './json';
import { resolveFixture } from './fixtures';

const NPC_REVIEW_DELAY_MS = 20_000;
const NPC_MERGE_AFTER_APPROVAL_MS = 10_000;
const fail = <T = undefined>(error: string): GitOp<T> => ({ ok: false, error, lines: [error] });

export const REVIEW_REASONS: Record<string, string> = {
  'main-edit': 'QA never modifies main',
  'missing-isScreenPresent': 'Missing mandatory isScreenPresent()',
  'missing-waitForScreen': 'Missing mandatory waitForScreen()',
  'port-5555': 'portNumber must be 5444',
  'extends-BaseTest': 'Page objects must not extend BaseTest',
};

export function findPr(lab: LabState, repoId: RepoId, n: number): PullRequest | null {
  return lab.repos[repoId]?.pullRequests.find((p) => p.number === n) ?? null;
}

/** Recompute a PR's diff (merge base with main → head). */
function refreshPrFiles(lab: LabState, repoId: RepoId, pr: PullRequest): void {
  const repo = lab.repos[repoId];
  const main = repo.branches[repo.defaultBranch]!;
  const base = mergeBase(repo, main, pr.headSha);
  const before = treeAt(repo, base);
  const after = treeAt(repo, pr.headSha);
  const changed = new Set<string>();
  for (const c of chain(repo, pr.headSha)) {
    if (c.sha === base) break;
    for (const p of Object.keys(c.changes)) changed.add(p);
  }
  pr.files = [...changed]
    .filter((p) => (before[p] ?? null) !== (after[p] ?? null))
    .sort()
    .map((p) => ({ path: p, before: before[p] ?? null, after: after[p] ?? null }));
}

function scheduleReview(lab: LabState, repoId: RepoId, pr: PullRequest, delayMs = NPC_REVIEW_DELAY_MS): void {
  const owner = REPO_OWNER[repoId];
  if (!lab.config.npcAutoMerge || !pr.reviewers.includes(owner) || pr.author === owner) {
    pr.reviewDuePhysMs = null;
    return;
  }
  pr.reviewDuePhysMs = lab.time.physMs + delayMs;
  core().addTimer(lab, 'npc.review', 'phys', delayMs, { repo: repoId, number: pr.number, due: pr.reviewDuePhysMs });
}

export function createPullRequest(lab: LabState, ctx: TxContext, repoId: RepoId, title: string, body: string, sourceBranch: string, actor: string): GitOp<{ number: number }> {
  const repo = lab.repos[repoId];
  if (!repo) return fail(`Repository not found`);
  if (!title.trim()) return fail('Title can\'t be blank');
  const head = repo.branches[sourceBranch];
  if (!head) return fail(`Branch '${sourceBranch}' not found on origin — push it first`);
  if (sourceBranch === repo.defaultBranch) return fail('Choose a different branch than main to compare');
  const main = repo.branches[repo.defaultBranch]!;
  if (head === main || chain(repo, main).some((c) => c.sha === head)) return fail(`There isn't anything to compare. main and ${sourceBranch} are identical.`);
  if (repo.pullRequests.some((p) => p.sourceBranch === sourceBranch && p.state === 'open')) return fail(`A pull request already exists for labsim-lab:${sourceBranch}.`);
  const number = lab.seq.pr[repoId]++;
  const owner = REPO_OWNER[repoId];
  const pr: PullRequest = {
    number,
    title: title.trim(),
    author: actor,
    body,
    sourceBranch,
    targetBranch: repo.defaultBranch,
    state: 'open',
    files: [],
    reviewers: owner === actor ? [] : [owner],
    approvals: [],
    checks: 'success',
    createdMs: lab.time.nowMs,
    mergedMs: null,
    comments: [],
    verdict: 'NONE',
    reviewDuePhysMs: null,
    headSha: head,
  };
  refreshPrFiles(lab, repoId, pr);
  repo.pullRequests.unshift(pr);
  scheduleReview(lab, repoId, pr);
  ctx.emit('github.prCreated', { repo: repoId, number, title: pr.title });
  return { ok: true, lines: [`https://github.com/labsim-lab/${repoId}/pull/${number}`], value: { number } };
}

/** A push to a branch with an open PR updates the PR (Sim §5.7 `github.prUpdated`) and re-arms the reviewer. */
export function onBranchPushed(lab: LabState, ctx: TxContext, repoId: RepoId, branch: string): void {
  const repo = lab.repos[repoId];
  for (const pr of repo.pullRequests) {
    if (pr.state !== 'open' || pr.sourceBranch !== branch) continue;
    pr.headSha = repo.branches[branch]!;
    refreshPrFiles(lab, repoId, pr);
    if (pr.verdict === 'CHANGES_REQUESTED' && pr.author === 'player') pr.verdict = 'NONE';
    scheduleReview(lab, repoId, pr);
    ctx.emit('github.prUpdated', { repo: repoId, number: pr.number, headSha: pr.headSha });
  }
}

function addComment(lab: LabState, ctx: TxContext, repoId: RepoId, pr: PullRequest, author: string, c: { path: string | null; line: number | null; body: string; reason?: string }): number {
  const id = pr.comments.reduce((m, x) => Math.max(m, x.id), 0) + 1;
  pr.comments.push({ id, author, path: c.path, line: c.line, body: c.body, ...(c.reason ? { reason: c.reason } : {}), atMs: lab.time.nowMs });
  ctx.emit('github.prCommented', { repo: repoId, number: pr.number, by: author, commentId: id, path: c.path, line: c.line, ...(c.reason ? { reason: c.reason } : {}) });
  return id;
}

export function comment(lab: LabState, ctx: TxContext, repoId: RepoId, n: number, input: { path: string | null; line: number | null; body: string; reason?: string }, actor: string): GitOp<{ commentId: number }> {
  const pr = findPr(lab, repoId, n);
  if (!pr) return fail(`Pull request #${n} not found`);
  if (!input.body.trim() && !input.reason) return fail('Comment body can\'t be blank');
  const body = input.body.trim() || REVIEW_REASONS[input.reason ?? ''] || '';
  const id = addComment(lab, ctx, repoId, pr, actor, { ...input, body });
  return { ok: true, lines: [], value: { commentId: id } };
}

export function approve(lab: LabState, ctx: TxContext, repoId: RepoId, n: number, actor: string): GitOp {
  const pr = findPr(lab, repoId, n);
  if (!pr) return fail(`Pull request #${n} not found`);
  if (pr.state !== 'open') return fail(`Pull request #${n} is ${pr.state}`);
  if (pr.author === actor) return fail('Can not approve your own pull request');
  if (!pr.approvals.includes(actor)) pr.approvals.push(actor);
  pr.verdict = 'APPROVED';
  ctx.emit('github.prReviewed', { repo: repoId, number: n, by: actor, verdict: 'APPROVED' });
  // An approved PR from the player on someone else's change is merged by its owner NPC (Sim §3.22.2).
  if (actor === 'player' && pr.author !== 'player') {
    core().addTimer(lab, 'npc.merge', 'phys', NPC_MERGE_AFTER_APPROVAL_MS, { repo: repoId, number: n, head: pr.headSha });
  }
  return { ok: true, lines: [] };
}

export function requestChanges(lab: LabState, ctx: TxContext, repoId: RepoId, n: number, actor: string, reason?: string): GitOp {
  const pr = findPr(lab, repoId, n);
  if (!pr) return fail(`Pull request #${n} not found`);
  if (pr.state !== 'open') return fail(`Pull request #${n} is ${pr.state}`);
  if (pr.author === actor) return fail('Can not request changes on your own pull request');
  if (reason) addComment(lab, ctx, repoId, pr, actor, { path: null, line: null, body: REVIEW_REASONS[reason] ?? reason, reason });
  pr.verdict = 'CHANGES_REQUESTED';
  pr.approvals = pr.approvals.filter((a) => a !== actor);
  ctx.emit('github.prReviewed', { repo: repoId, number: n, by: actor, verdict: 'CHANGES_REQUESTED' });
  return { ok: true, lines: [] };
}

export function closePr(lab: LabState, ctx: TxContext, repoId: RepoId, n: number, actor: string): GitOp {
  const pr = findPr(lab, repoId, n);
  if (!pr) return fail(`Pull request #${n} not found`);
  if (pr.state !== 'open') return fail(`Pull request #${n} is already ${pr.state}`);
  pr.state = 'closed';
  pr.reviewDuePhysMs = null;
  ctx.emit('github.prClosed', { repo: repoId, number: n, by: actor });
  return { ok: true, lines: [] };
}

export function mergePr(lab: LabState, ctx: TxContext, repoId: RepoId, n: number, actor: string): GitOp<{ sha: string }> {
  const repo = lab.repos[repoId];
  const pr = findPr(lab, repoId, n);
  if (!pr) return fail(`Pull request #${n} not found`);
  if (pr.state !== 'open') return fail(`Pull request #${n} is ${pr.state}`);
  const npc = actor !== 'player';
  if (!npc && PROTECTED_MAIN[repoId] && !pr.approvals.some((a) => a !== pr.author)) return fail('Merging is blocked: At least 1 approving review is required by reviewers with write access.');
  if (!npc && pr.verdict === 'CHANGES_REQUESTED') return fail('Merging is blocked: Changes requested — a reviewer requested changes on this pull request.');
  const main = repo.branches[repo.defaultBranch]!;
  const base = mergeBase(repo, main, pr.headSha);
  const baseTree = treeAt(repo, base);
  const mainTree = treeAt(repo, main);
  const headTree = treeAt(repo, pr.headSha);
  refreshPrFiles(lab, repoId, pr);
  const changes: Record<string, string | null> = {};
  for (const f of pr.files) {
    const p = f.path;
    if ((mainTree[p] ?? null) !== (baseTree[p] ?? null) && (mainTree[p] ?? null) !== (headTree[p] ?? null)) return fail('This branch has conflicts that must be resolved');
    changes[p] = headTree[p] ?? null;
  }
  const sha = commitRemote(lab, repoId, repo.defaultBranch, changes, `${pr.title} (#${pr.number})`, pr.author);
  afterMainMoved(lab, repoId, main, sha);
  pr.state = 'merged';
  pr.mergedMs = lab.time.nowMs;
  pr.mergedBy = actor;
  pr.reviewDuePhysMs = null;
  refreshLocal(repo);
  ctx.emit('github.prMerged', { repo: repoId, number: n, title: pr.title, by: actor });
  return { ok: true, lines: [], value: { sha } };
}

/* ────────────────────────────── Scripted reviewers ────────────────────────────── */

interface Finding {
  path: string | null;
  line: number | null;
  body: string;
  reason?: string;
}

const lineOf = (text: string | null, needle: string): number | null => {
  if (!text) return null;
  const i = text.split('\n').findIndex((l) => l.includes(needle));
  return i >= 0 ? i + 1 : null;
};

/** Jared (gort): every changed screen-location file parses and each button is within ±0.5 mm of firmware truth. First offender only. */
export function jaredFindings(pr: PullRequest): Finding[] {
  for (const f of pr.files) {
    const m = /^config\/screen-locations\/([A-Z0-9_]+)\/([A-Z0-9_]+)\.json$/.exec(f.path);
    if (!m || f.after === null) continue;
    const [, type, screen] = m as unknown as [string, string, string];
    const file = `${screen}.json`;
    const parsed = parseStrictJson(f.after);
    if (!parsed.ok) return [{ path: f.path, line: parsed.line, body: `${file} doesn't parse: ${parsed.error}` }];
    const truth = truthFor(type, screen);
    if (!truth) continue;
    const buttons = (parsed.value as { buttons?: Record<string, { x?: JsonValue; y?: JsonValue }> }).buttons ?? {};
    for (const [b, t] of Object.entries(truth)) {
      const v = buttons[b];
      if (!v) return [{ path: f.path, line: null, body: `${b} on ${type} is missing` }];
      const dx = Number(v.x) - t.x;
      const dy = Number(v.y) - t.y;
      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return [{ path: f.path, line: lineOf(f.after, `"${b}"`), body: `${b} on ${type} has no x/y` }];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 0.5 + 1e-9) {
        const useY = Math.abs(dy) >= Math.abs(dx);
        const d = useY ? dy : dx;
        const dir = useY ? (d < 0 ? 'high' : 'low') : d < 0 ? 'left' : 'right';
        return [{ path: f.path, line: lineOf(f.after, `"${b}"`), body: `${b} on ${type} is still ${Math.abs(d).toFixed(1)} mm ${dir}` }];
      }
    }
  }
  return [];
}

/** Morgan (uia-remote, pigeon): CF09–CF12 clean, page objects with CF01 + CF04; Pigeon JSON parses. */
export function morganFindings(repoId: RepoId, pr: PullRequest, headTree: Record<string, string>): Finding[] {
  const out: Finding[] = [];
  const changed = pr.files.map((f) => f.path);
  if (repoId === 'pigeon') {
    for (const f of pr.files) {
      if (!f.path.endsWith('.json') || f.after === null) continue;
      const r = parseStrictJson(f.after);
      if (!r.ok) out.push({ path: f.path, line: r.line, body: `LSTR ParseError: ${r.error}` });
    }
    return out;
  }
  for (const p of touchesMain(changed)) {
    const f = pr.files.find((x) => x.path === p)!;
    const firstChanged = (() => {
      const a = (f.before ?? '').split('\n');
      const b = (f.after ?? '').split('\n');
      for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return i + 1;
      return 1;
    })();
    out.push({ path: p, line: firstChanged, body: REVIEW_REASONS['main-edit']!, reason: 'main-edit' });
  }
  for (const f of pr.files) {
    if (f.after === null || !f.path.endsWith('.java')) continue;
    const isPo = /extends BaseTest/.test(f.after) && /Zone 1/.test(f.after) && !/@Test/.test(f.after);
    if (isPo) {
      if (!hasIsScreenPresent(f.after)) out.push({ path: f.path, line: lineOf(f.after, 'Zone 2') ?? null, body: REVIEW_REASONS['missing-isScreenPresent']!, reason: 'missing-isScreenPresent' });
      if (!hasWaitForScreen(f.after)) out.push({ path: f.path, line: lineOf(f.after, 'waitForScreen') ?? lineOf(f.after, 'Zone 2'), body: REVIEW_REASONS['missing-waitForScreen']!, reason: 'missing-waitForScreen' });
      if (!f.path.startsWith(PO_DIR)) out.push({ path: f.path, line: 1, body: 'Page objects belong in pageobjects' });
    }
    const syn = javaSyntaxError(f.after);
    if (syn) out.push({ path: f.path, line: syn.line, body: `${f.path.slice(f.path.lastIndexOf('/') + 1)}:${syn.line}: error: ${syn.message}` });
  }
  if (changed.includes('config.properties') && committedPort5555(headTree)) {
    out.push({ path: 'config.properties', line: lineOf(headTree['config.properties'] ?? null, 'portNumber'), body: REVIEW_REASONS['port-5555']!, reason: 'port-5555' });
  }
  for (const p of packageProblems(Object.fromEntries(Object.entries(headTree).filter(([k]) => changed.includes(k))))) {
    if (!out.some((o) => o.path === p.path && o.body === 'Page objects belong in pageobjects')) out.push({ path: p.path, line: 1, body: 'Page objects belong in pageobjects' });
  }
  return out;
}

const OWNER_CHAT: Record<string, string> = { jared: '#lab-automation', morgan: '#lab-automation', tate: '#lab-automation' };

/** The owner NPC reviews an open PR (timer `npc.review`). */
export function npcReview(lab: LabState, ctx: TxContext, repoId: RepoId, n: number): void {
  const repo = lab.repos[repoId];
  const pr = findPr(lab, repoId, n);
  if (!pr || pr.state !== 'open') return;
  pr.reviewDuePhysMs = null;
  const owner = REPO_OWNER[repoId];
  refreshPrFiles(lab, repoId, pr);
  if (owner === 'tate') {
    addComment(lab, ctx, repoId, pr, 'tate', { path: null, line: null, body: "Thanks — I'll take it from here." });
    ctx.emit('github.prReviewed', { repo: repoId, number: n, by: 'tate', verdict: 'COMMENTED' });
    return;
  }
  const findings = owner === 'jared' ? jaredFindings(pr) : morganFindings(repoId, pr, treeAt(repo, pr.headSha));
  if (findings.length) {
    for (const f of findings) addComment(lab, ctx, repoId, pr, owner, f);
    pr.verdict = 'CHANGES_REQUESTED';
    ctx.emit('github.prReviewed', { repo: repoId, number: n, by: owner, verdict: 'CHANGES_REQUESTED' });
    core().addTimer(lab, 'npc.reply', 'phys', 2_000, { channel: OWNER_CHAT[owner] ?? '#lab-automation', author: owner, text: `Left comments on ${repoId}#${n}: ${findings[0]!.body}` });
    return;
  }
  if (!pr.approvals.includes(owner)) pr.approvals.push(owner);
  pr.verdict = 'APPROVED';
  ctx.emit('github.prReviewed', { repo: repoId, number: n, by: owner, verdict: 'APPROVED' });
  const r = mergePr(lab, ctx, repoId, n, owner);
  if (r.ok) {
    const sync = repoId === 'gort' && pr.files.some((f) => f.path.startsWith('config/screen-locations/')) ? ' Orca picks up the screen locations in a few seconds.' : '';
    core().addTimer(lab, 'npc.reply', 'phys', 2_000, { channel: OWNER_CHAT[owner] ?? '#lab-automation', author: owner, text: `Merged ${repoId}#${n} "${pr.title}".${sync}` });
  }
}

/** Owner NPC merges a PR the player approved (timer `npc.merge`). */
export function npcMergeApproved(lab: LabState, ctx: TxContext, repoId: RepoId, n: number): void {
  const pr = findPr(lab, repoId, n);
  if (!pr || pr.state !== 'open' || !pr.approvals.includes('player')) return;
  const owner = REPO_OWNER[repoId];
  if (owner === 'tate') {
    addComment(lab, ctx, repoId, pr, 'tate', { path: null, line: null, body: "Thanks — I'll take it from here." });
    return;
  }
  const r = mergePr(lab, ctx, repoId, n, owner);
  if (r.ok) core().addTimer(lab, 'npc.reply', 'phys', 2_000, { channel: '#lab-automation', author: owner, text: `Merged ${repoId}#${n} "${pr.title}" — thanks for the review.` });
}

/* ────────────────────────────── Setup ops (Sim §4.4.1) ────────────────────────────── */

const slug = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
    .replace(/-$/, '');

export function seedPr(lab: LabState, ctx: TxContext, p: { repo: RepoId; number: number; fixture: string; author: string; title: string; state?: string }): string | null {
  const repo = lab.repos[p.repo];
  if (!repo) return `unknown repo '${p.repo}'`;
  if (repo.pullRequests.some((x) => x.number === p.number)) return `${p.repo}#${p.number} already exists`;
  const main = repo.branches[repo.defaultBranch]!;
  const base = treeAt(repo, main);
  const files = resolveFixture(lab, p.fixture, { base });
  if (!files) return `unknown fixture '${p.fixture}'`;
  const branch = `${p.author}/${slug(p.title)}`;
  repo.branches[branch] = main;
  const head = commitRemote(lab, p.repo, branch, files, p.title, p.author);
  const pr: PullRequest = {
    number: p.number,
    title: p.title,
    author: p.author,
    body: '',
    sourceBranch: branch,
    targetBranch: repo.defaultBranch,
    state: 'open',
    files: [],
    reviewers: ['player'],
    approvals: [],
    checks: 'success',
    createdMs: lab.time.nowMs,
    mergedMs: null,
    comments: [],
    verdict: 'NONE',
    reviewDuePhysMs: null,
    headSha: head,
  };
  refreshPrFiles(lab, p.repo, pr);
  repo.pullRequests.unshift(pr);
  repo.pullRequests.sort((a, b) => b.number - a.number);
  lab.seq.pr[p.repo] = Math.max(lab.seq.pr[p.repo], p.number + 1);
  if (p.state === 'closed') pr.state = 'closed';
  ctx.emit('github.prCreated', { repo: p.repo, number: p.number, title: p.title });
  return null;
}

export function reopenPr(lab: LabState, repoId: RepoId, n: number): string | null {
  const repo = lab.repos[repoId];
  const pr = findPr(lab, repoId, n);
  if (!pr) return `${repoId}#${n} not found`;
  if (pr.state !== 'closed') return `${repoId}#${n} is ${pr.state}`;
  pr.state = 'open';
  repo.branches[pr.sourceBranch] = pr.headSha;
  if (!pr.reviewers.includes('player')) pr.reviewers.push('player');
  pr.verdict = 'NONE';
  pr.reviewDuePhysMs = null;
  refreshPrFiles(lab, repoId, pr);
  return null;
}

/** Preset-only history rewrite: the PR's squash commit leaves `main` (Sim §4.4.1 `github.unmergePr`). */
export function unmergePr(lab: LabState, repoId: RepoId, n: number): string | null {
  const repo = lab.repos[repoId];
  const pr = findPr(lab, repoId, n);
  if (!pr) return `${repoId}#${n} not found`;
  if (pr.state !== 'merged') return `${repoId}#${n} is ${pr.state}`;
  const mainChain = chain(repo, repo.branches[repo.defaultBranch]!);
  const m = mainChain.find((c) => c.message.endsWith(`(#${n})`));
  if (!m) return `merge commit of ${repoId}#${n} not found on main`;
  const oldHead = repo.branches[repo.defaultBranch]!;
  const child = mainChain.find((c) => c.parent === m.sha);
  if (child) {
    // Re-parent with fresh commit objects from the head down to the child: trees are memoised per commit
    // object (gitCore.treeAt), so every rewritten descendant must be a new object.
    for (const c of mainChain) {
      repo.commits[c.sha] = c.sha === child.sha ? { ...c, parent: m.parent } : { ...c };
      if (c.sha === child.sha) break;
    }
  } else repo.branches[repo.defaultBranch] = m.parent!;
  delete repo.commits[m.sha];
  const newHead = repo.branches[repo.defaultBranch]!;
  repo.files = treeAt(repo, newHead);
  pr.state = 'open';
  pr.mergedMs = null;
  pr.mergedBy = null;
  pr.approvals = [];
  pr.verdict = 'NONE';
  pr.reviewDuePhysMs = null;
  if (!pr.reviewers.includes('player')) pr.reviewers.push('player');
  repo.branches[pr.sourceBranch] = pr.headSha;
  refreshPrFiles(lab, repoId, pr);
  // Re-sync Orca rows from the rewritten main for the paths the PR touched.
  if (repoId === 'gort') {
    const paths = Object.keys(m.changes).filter((p) => p.startsWith('config/screen-locations/') && repo.files[p] !== undefined);
    if (paths.length) lab.orca.pendingSyncs.push({ atPhysMs: lab.time.physMs, repo: 'gort', paths, commit: newHead });
  }
  void oldHead;
  return null;
}
