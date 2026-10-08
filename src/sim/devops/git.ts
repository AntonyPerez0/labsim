/**
 * Git on the workstation (Sim §3.22.1): clone, branches, working tree edits, index, commit, push (branch
 * protection), pull, revert. Every function runs on the draft lab inside the caller's transaction and
 * returns git's own output lines (the terminal prints them; the SimApi wraps them into `Result`).
 */
import type { TxContext } from '@/core/store';
import type { GitRepo, LabState, RepoId } from '../types';
import { PROTECTED_MAIN } from '../seed/repos';
import { commitsBetween, ext, isAncestor, isIgnored, mergeBase, short, statLines, treeAt, VALID_BRANCH } from './gitCore';
import type { LocalClone } from './gitCore';
import { onBranchPushed } from './github';
import { makeSha } from './util';

export interface GitOp<T = undefined> {
  ok: boolean;
  lines: string[];
  error?: string;
  value?: T;
}
const fail = <T = undefined>(error: string, lines: string[] = [error]): GitOp<T> => ({ ok: false, error, lines });

export const REPO_IDS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];
export const isRepoId = (s: string): s is RepoId => (REPO_IDS as string[]).includes(s);

/** Repo id from a clone URL (`git@github.com:labsim-lab/x.git`, https forms). */
export function repoFromUrl(url: string): RepoId | null {
  const m = /^(?:git@github\.com:|https:\/\/github\.com\/)labsim-lab\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim());
  return m && isRepoId(m[1]!) ? m[1] : null;
}

const authorOf = (actor: string): string => (actor === 'player' ? 'player' : actor);

/** Working-tree status vs HEAD and index. */
export function status(repo: GitRepo): { staged: { path: string; kind: 'new file' | 'modified' | 'deleted' }[]; unstaged: { path: string; kind: 'modified' | 'deleted' }[]; untracked: string[] } {
  const local = repo.local!;
  const x = ext(local);
  const head = treeAt(repo, local.headSha);
  const staged = Object.entries(x.index)
    .filter(([p, v]) => (head[p] ?? null) !== v)
    .map(([p, v]) => ({ path: p, kind: v === null ? ('deleted' as const) : head[p] === undefined ? ('new file' as const) : ('modified' as const) }))
    .sort((a, b) => a.path.localeCompare(b.path, 'en-US'));
  const unstaged: { path: string; kind: 'modified' | 'deleted' }[] = [];
  const untracked: string[] = [];
  const paths = new Set([...Object.keys(head), ...Object.keys(local.files), ...Object.keys(x.index)]);
  for (const p of [...paths].sort()) {
    const idx = p in x.index ? x.index[p] : (head[p] ?? null);
    const work = local.files[p] ?? null;
    if (idx === null && work !== null) {
      if (!isIgnored(local.files, p) || x.forced.includes(p)) untracked.push(p);
      continue;
    }
    if (idx !== null && work === null) unstaged.push({ path: p, kind: 'deleted' });
    else if (idx !== null && work !== idx) unstaged.push({ path: p, kind: 'modified' });
  }
  return { staged, unstaged, untracked };
}

/** Recompute `dirty`, `staged`, `ahead`, `behind` (auto-fetch view of the remote). */
export function refreshLocal(repo: GitRepo): void {
  const local = repo.local;
  if (!local) return;
  const x = ext(local);
  const st = status(repo);
  local.staged = st.staged.map((s) => s.path);
  local.dirty = [...new Set([...st.staged.map((s) => s.path), ...st.unstaged.map((s) => s.path), ...st.untracked])].sort();
  const up = x.upstream[local.branch];
  const remote = up ? (repo.branches[up] ?? null) : null;
  if (!remote) {
    local.ahead = up ? 0 : commitsBetween(repo, repo.branches[repo.defaultBranch] ?? null, local.headSha).length;
    local.behind = 0;
  } else {
    local.ahead = commitsBetween(repo, remote, local.headSha).length;
    local.behind = commitsBetween(repo, local.headSha, remote).length;
  }
}

export function clone(lab: LabState, ctx: TxContext, repoId: RepoId, actor: string, dir?: string): GitOp {
  const repo = lab.repos[repoId];
  if (!repo) return fail(`ERROR: Repository not found.\nfatal: Could not read from remote repository.`);
  const path = dir ?? `~/IdeaProjects/${repoId}`;
  if (repo.local) return fail(`fatal: destination path '${repoId}' already exists and is not an empty directory.`);
  const head = repo.branches[repo.defaultBranch]!;
  const local: LocalClone = { path, branch: repo.defaultBranch, headSha: head, files: treeAt(repo, head), dirty: [], staged: [], ahead: 0, behind: 0 };
  repo.local = local;
  ext(local);
  const n = Object.keys(repo.commits).length * 37 + Object.keys(local.files).length * 3 + 11;
  ctx.emit('git.cloned', { repo: repoId });
  void actor;
  return {
    ok: true,
    lines: [
      `Cloning into '${repoId}'...`,
      `remote: Enumerating objects: ${n}, done.`,
      `remote: Counting objects: 100% (${n}/${n}), done.`,
      `remote: Compressing objects: 100% (${Math.floor(n * 0.6)}/${Math.floor(n * 0.6)}), done.`,
      `remote: Total ${n} (delta ${Math.floor(n * 0.3)}), reused ${n - 9} (delta ${Math.floor(n * 0.28)}), pack-reused 0`,
      `Receiving objects: 100% (${n}/${n}), ${(n * 0.57).toFixed(2)} KiB | 1.84 MiB/s, done.`,
      `Resolving deltas: 100% (${Math.floor(n * 0.3)}/${Math.floor(n * 0.3)}), done.`,
    ],
  };
}

function needClone(repo: GitRepo): GitOp | null {
  return repo.local ? null : fail('fatal: not a git repository (or any of the parent directories): .git');
}

export function checkout(lab: LabState, ctx: TxContext, repoId: RepoId, branch: string, create: boolean): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const local = repo.local!;
  const x = ext(local);
  if (create) {
    if (!VALID_BRANCH.test(branch)) return fail(`fatal: '${branch}' is not a valid branch name`);
    if (x.branches[branch]) return fail(`fatal: a branch named '${branch}' already exists`);
    x.branches[local.branch] = local.headSha;
    x.branches[branch] = local.headSha;
    x.upstream[branch] = null;
    local.branch = branch;
    refreshLocal(repo);
    ctx.emit('git.branchChanged', { repo: repoId, branch });
    return { ok: true, lines: [`Switched to a new branch '${branch}'`] };
  }
  if (branch === local.branch) return { ok: true, lines: [`Already on '${branch}'`] };
  let target = x.branches[branch];
  const lines: string[] = [];
  if (!target) {
    const remote = repo.branches[branch];
    if (!remote) return fail(`error: pathspec '${branch}' did not match any file(s) known to git`);
    target = remote;
    x.upstream[branch] = branch;
    lines.push(`branch '${branch}' set up to track 'origin/${branch}'.`);
  }
  // Carry local modifications over unless the two branches differ on a modified path.
  const st = status(repo);
  const fromTree = treeAt(repo, local.headSha);
  const toTree = treeAt(repo, target);
  const modified = [...st.unstaged.map((u) => u.path), ...st.staged.map((s) => s.path)];
  const clash = modified.filter((p) => (fromTree[p] ?? null) !== (toTree[p] ?? null));
  if (clash.length) {
    return fail('checkout blocked by local changes', [
      'error: Your local changes to the following files would be overwritten by checkout:',
      ...clash.map((p) => `\t${p}`),
      'Please commit your changes or stash them before you switch branches.',
      'Aborting',
    ]);
  }
  const files: Record<string, string> = { ...toTree };
  for (const p of modified) {
    const v = local.files[p];
    if (v === undefined) delete files[p];
    else files[p] = v;
  }
  for (const [p, v] of Object.entries(local.files)) if (fromTree[p] === undefined && toTree[p] === undefined) files[p] = v; // untracked / ignored
  x.branches[local.branch] = local.headSha;
  local.branch = branch;
  local.headSha = target;
  local.files = files;
  refreshLocal(repo);
  lines.push(lines.length ? `Switched to a new branch '${branch}'` : `Switched to branch '${branch}'`);
  if (local.behind === 0 && x.upstream[branch]) lines.push(`Your branch is up to date with 'origin/${branch}'.`);
  ctx.emit('git.branchChanged', { repo: repoId, branch });
  return { ok: true, lines };
}

export function writeFile(lab: LabState, ctx: TxContext, repoId: RepoId, path: string, contents: string): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const clean = path.replace(/^\.?\//, '');
  if (!clean || clean.endsWith('/')) return fail(`error: invalid path '${path}'`);
  repo.local!.files[clean] = contents;
  refreshLocal(repo);
  if (repoId === 'uia-remote' && clean === 'config.properties') mirrorConfig(lab);
  ctx.emit('git.fileEdited', { repo: repoId, path: clean });
  return { ok: true, lines: [] };
}

export function deleteFile(lab: LabState, ctx: TxContext, repoId: RepoId, path: string): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const files = repo.local!.files;
  const victims = Object.keys(files).filter((p) => p === path || p.startsWith(`${path.replace(/\/$/, '')}/`));
  if (!victims.length) return fail(`rm: cannot remove '${path}': No such file or directory`);
  for (const p of victims) delete files[p];
  refreshLocal(repo);
  if (repoId === 'uia-remote') mirrorConfig(lab);
  for (const p of victims) ctx.emit('git.fileEdited', { repo: repoId, path: p });
  return { ok: true, lines: [] };
}

export function moveFile(lab: LabState, ctx: TxContext, repoId: RepoId, from: string, to: string): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const files = repo.local!.files;
  const src = from.replace(/\/$/, '');
  const moves = Object.keys(files).filter((p) => p === src || p.startsWith(`${src}/`));
  if (!moves.length) return fail(`fatal: bad source, source=${from}, destination=${to}`);
  for (const p of moves) {
    const dest = p === src ? to : `${to.replace(/\/$/, '')}/${p.slice(src.length + 1)}`;
    if (files[dest] !== undefined && dest !== p) return fail(`fatal: destination exists, source=${p}, destination=${dest}`);
  }
  for (const p of moves) {
    const dest = p === src ? to : `${to.replace(/\/$/, '')}/${p.slice(src.length + 1)}`;
    files[dest] = files[p]!;
    delete files[p];
    ctx.emit('git.fileEdited', { repo: repoId, path: p });
    ctx.emit('git.fileEdited', { repo: repoId, path: dest });
  }
  refreshLocal(repo);
  return { ok: true, lines: [] };
}

/** Discard working changes (and unstage) for a path — `git restore`/`git checkout -- <path>`. */
export function discard(lab: LabState, ctx: TxContext, repoId: RepoId, path: string): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const local = repo.local!;
  const x = ext(local);
  const head = treeAt(repo, local.headSha);
  if (head[path] === undefined && local.files[path] === undefined) return fail(`error: pathspec '${path}' did not match any file(s) known to git`);
  if (head[path] === undefined) delete local.files[path];
  else local.files[path] = head[path]!;
  delete x.index[path];
  refreshLocal(repo);
  if (repoId === 'uia-remote' && path === 'config.properties') mirrorConfig(lab);
  ctx.emit('git.fileEdited', { repo: repoId, path });
  return { ok: true, lines: [] };
}

export function stage(lab: LabState, ctx: TxContext, repoId: RepoId, paths: string[], force = false): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  void ctx;
  const local = repo.local!;
  const x = ext(local);
  const head = treeAt(repo, local.headSha);
  const all = new Set([...Object.keys(head), ...Object.keys(local.files)]);
  const ignoredHit: string[] = [];
  let matched = 0;
  for (const spec of paths) {
    const s = spec.replace(/^\.\//, '');
    const sel = s === '.' || s === '-A' || s === '--all' ? [...all] : [...all].filter((p) => p === s || p.startsWith(`${s.replace(/\/$/, '')}/`));
    if (!sel.length) return fail(`fatal: pathspec '${spec}' did not match any files`);
    for (const p of sel) {
      const tracked = head[p] !== undefined;
      if (!tracked && isIgnored(local.files, p) && !x.forced.includes(p)) {
        if (s !== '.' && s !== '-A' && s !== '--all') {
          if (!force) {
            ignoredHit.push(p);
            continue;
          }
          x.forced.push(p);
        } else continue;
      }
      const work = local.files[p] ?? null;
      if (work === (head[p] ?? null)) {
        delete x.index[p];
        continue;
      }
      x.index[p] = work;
      matched++;
    }
  }
  refreshLocal(repo);
  if (ignoredHit.length && !matched) {
    return fail('paths ignored', ['The following paths are ignored by one of your .gitignore files:', ...ignoredHit, 'hint: Use -f if you really want to add them.', 'hint: Turn this message off by running', 'hint: "git config advice.addIgnoredFile false"']);
  }
  return { ok: true, lines: [] };
}

export function commit(lab: LabState, ctx: TxContext, repoId: RepoId, message: string, actor: string): GitOp<{ sha: string }> {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return { ok: false, lines: nc.lines, error: nc.error };
  const local = repo.local!;
  const x = ext(local);
  if (!message.trim()) return fail('Aborting commit due to empty commit message.');
  const head = treeAt(repo, local.headSha);
  const changes: Record<string, string | null> = {};
  for (const [p, v] of Object.entries(x.index)) if ((head[p] ?? null) !== v) changes[p] = v;
  if (!Object.keys(changes).length) {
    const st = status(repo);
    const lines = [`On branch ${local.branch}`];
    if (st.unstaged.length || st.untracked.length) {
      lines.push('Changes not staged for commit:', ...st.unstaged.map((u) => `\t${u.kind}:   ${u.path}`), '', 'no changes added to commit (use "git add" and/or "git commit -a")');
      return fail('no changes added to commit (use "git add" and/or "git commit -a")', lines);
    }
    lines.push('nothing to commit, working tree clean');
    return fail('nothing to commit, working tree clean', lines);
  }
  const seq = ++lab.seq.commit;
  const sha = makeSha(repoId, local.headSha, message, seq);
  repo.commits[sha] = { sha, message: message.trim(), author: authorOf(actor), atMs: lab.time.nowMs, changes, parent: local.headSha };
  local.headSha = sha;
  x.branches[local.branch] = sha;
  x.index = {};
  refreshLocal(repo);
  const ch = Object.keys(changes)
    .sort()
    .map((p) => ({ path: p, before: head[p] ?? null, after: changes[p] ?? null }));
  const stat = statLines(ch);
  const created = ch.filter((c) => c.before === null).map((c) => ` create mode 100644 ${c.path}`);
  const deleted = ch.filter((c) => c.after === null).map((c) => ` delete mode 100644 ${c.path}`);
  ctx.emit('git.committed', { repo: repoId, sha, message: message.trim(), files: Object.keys(changes).sort() });
  return { ok: true, value: { sha }, lines: [`[${local.branch} ${short(sha)}] ${message.trim().split('\n')[0]}`, stat[stat.length - 1] ?? '', ...created, ...deleted] };
}

/** Commit straight onto a remote branch (NPC / fault / setup edits, GitHub web edits). */
export function commitRemote(lab: LabState, repoId: RepoId, branch: string, changes: Record<string, string | null>, message: string, author: string, atMs = lab.time.nowMs): string {
  const repo = lab.repos[repoId];
  const parent = repo.branches[branch] ?? repo.branches[repo.defaultBranch] ?? null;
  const sha = makeSha(repoId, parent, message, ++lab.seq.commit);
  repo.commits[sha] = { sha, message, author, atMs, changes: { ...changes }, parent };
  repo.branches[branch] = sha;
  if (branch === repo.defaultBranch) repo.files = treeAt(repo, sha);
  refreshLocal(repo);
  return sha;
}

export function push(lab: LabState, ctx: TxContext, repoId: RepoId, setUpstream = false): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const local = repo.local!;
  const x = ext(local);
  const b = local.branch;
  const remote = repo.branches[b] ?? null;
  const toLine = `To ${repo.remoteUrl.replace(/^git@github\.com:/, 'github.com:')}`;
  if (b === repo.defaultBranch && PROTECTED_MAIN[repoId] && remote !== local.headSha) {
    const reason = 'protected branch hook declined';
    ctx.emit('git.pushRejected', { repo: repoId, branch: b, reason });
    return fail(`! [remote rejected] ${b} -> ${b} (${reason})`, [
      'Enumerating objects: 9, done.',
      'Counting objects: 100% (9/9), done.',
      'remote: error: GH006: Protected branch update failed for refs/heads/main.',
      'remote: error: Changes must be made through a pull request.',
      toLine,
      ` ! [remote rejected] ${b} -> ${b} (${reason})`,
      `error: failed to push some refs to '${repo.remoteUrl}'`,
    ]);
  }
  if (remote === local.headSha) return { ok: true, lines: ['Everything up-to-date'] };
  if (remote && !isAncestor(repo, remote, local.headSha)) {
    const reason = 'fetch first';
    ctx.emit('git.pushRejected', { repo: repoId, branch: b, reason });
    return fail(`! [rejected]        ${b} -> ${b} (${reason})`, [
      toLine,
      ` ! [rejected]        ${b} -> ${b} (${reason})`,
      `error: failed to push some refs to '${repo.remoteUrl}'`,
      "hint: Updates were rejected because the remote contains work that you do not",
      "hint: have locally. This is usually caused by another repository pushing to",
      "hint: the same ref. If you want to integrate the remote changes, use",
      "hint: 'git pull' before pushing again.",
    ]);
  }
  if (!x.upstream[b] && !setUpstream && remote === null && b !== repo.defaultBranch) {
    return fail(`fatal: The current branch ${b} has no upstream branch.`, [
      `fatal: The current branch ${b} has no upstream branch.`,
      'To push the current branch and set the remote as upstream, use',
      '',
      `    git push --set-upstream origin ${b}`,
      '',
    ]);
  }
  const old = remote;
  const n = commitsBetween(repo, old, local.headSha).length;
  repo.branches[b] = local.headSha;
  x.upstream[b] = b;
  const lines = [
    `Enumerating objects: ${n * 7 + 5}, done.`,
    `Counting objects: 100% (${n * 7 + 5}/${n * 7 + 5}), done.`,
    'Delta compression using up to 8 threads',
    `Compressing objects: 100% (${n * 3 + 2}/${n * 3 + 2}), done.`,
    `Writing objects: 100% (${n * 4 + 3}/${n * 4 + 3}), ${(n * 0.71 + 0.4).toFixed(2)} KiB | 0 bytes/s, done.`,
    `Total ${n * 4 + 3} (delta ${n + 1}), reused 0 (delta 0), pack-reused 0`,
  ];
  if (!old) {
    lines.push(
      'remote: ',
      `remote: Create a pull request for '${b}' on GitHub by visiting:`,
      `remote:      https://github.com/labsim-lab/${repoId}/pull/new/${b}`,
      'remote: ',
      toLine,
      ` * [new branch]      ${b} -> ${b}`,
    );
    if (setUpstream) lines.push(`branch '${b}' set up to track 'origin/${b}'.`);
  } else lines.push(toLine, `   ${short(old)}..${short(local.headSha)}  ${b} -> ${b}`);
  if (b === repo.defaultBranch) afterMainMoved(lab, repoId, old, local.headSha);
  refreshLocal(repo);
  ctx.emit('git.pushed', { repo: repoId, branch: b });
  onBranchPushed(lab, ctx, repoId, b);
  return { ok: true, lines };
}

/** Remote main moved: refresh the remote tree; queue the gort → Orca screen-location sync (Sim §3.22.3). */
export function afterMainMoved(lab: LabState, repoId: RepoId, oldSha: string | null, newSha: string): void {
  const repo = lab.repos[repoId];
  const before = treeAt(repo, oldSha);
  repo.files = treeAt(repo, newSha);
  if (repoId !== 'gort') return;
  const paths = [...new Set([...Object.keys(before), ...Object.keys(repo.files)])]
    .filter((p) => /^config\/screen-locations\/[A-Z0-9_]+\/[A-Z0-9_]+\.json$/.test(p) && (before[p] ?? null) !== (repo.files[p] ?? null) && repo.files[p] !== undefined)
    .sort();
  if (paths.length) lab.orca.pendingSyncs.push({ atPhysMs: lab.time.physMs + 10_000, repo: 'gort', paths, commit: newSha });
}

export function pull(lab: LabState, ctx: TxContext, repoId: RepoId): GitOp {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return nc;
  const local = repo.local!;
  const x = ext(local);
  const up = x.upstream[local.branch];
  if (!up) return fail('There is no tracking information for the current branch.', ['There is no tracking information for the current branch.', 'Please specify which branch you want to merge with.', `    git branch --set-upstream-to=origin/<branch> ${local.branch}`]);
  const remote = repo.branches[up];
  if (!remote) return fail(`fatal: couldn't find remote ref ${up}`);
  if (remote === local.headSha || isAncestor(repo, remote, local.headSha)) return { ok: true, lines: ['Already up to date.'] };
  if (!isAncestor(repo, local.headSha, remote)) {
    return fail('fatal: Need to specify how to reconcile divergent branches.', [
      'hint: You have divergent branches and need to specify how to reconcile them.',
      'hint: You can do so by running one of the following commands sometime before',
      'hint: your next pull:',
      'hint:',
      'hint:   git config pull.rebase false  # merge',
      'hint:   git config pull.rebase true   # rebase',
      'hint:   git config pull.ff only       # fast-forward only',
      'fatal: Need to specify how to reconcile divergent branches.',
    ]);
  }
  const from = treeAt(repo, local.headSha);
  const to = treeAt(repo, remote);
  const st = status(repo);
  const modified = [...st.unstaged.map((u) => u.path), ...st.staged.map((s) => s.path)];
  const clash = modified.filter((p) => (from[p] ?? null) !== (to[p] ?? null));
  if (clash.length) return fail('pull blocked', ['error: Your local changes to the following files would be overwritten by merge:', ...clash.map((p) => `\t${p}`), 'Please commit your changes or stash them before you merge.', 'Aborting', `Updating ${short(local.headSha)}..${short(remote)}`]);
  const changed = [...new Set([...Object.keys(from), ...Object.keys(to)])].filter((p) => (from[p] ?? null) !== (to[p] ?? null)).sort();
  const files: Record<string, string> = { ...to };
  for (const p of modified) {
    const v = local.files[p];
    if (v === undefined) delete files[p];
    else files[p] = v;
  }
  for (const [p, v] of Object.entries(local.files)) if (from[p] === undefined && to[p] === undefined) files[p] = v;
  const oldHead = local.headSha;
  local.files = files;
  local.headSha = remote;
  x.branches[local.branch] = remote;
  refreshLocal(repo);
  if (repoId === 'uia-remote') mirrorConfig(lab);
  ctx.emit('git.pulled', { repo: repoId, branch: local.branch });
  return {
    ok: true,
    lines: [
      `From ${repo.remoteUrl.replace(/^git@github\.com:/, 'github.com:')}`,
      `   ${short(oldHead)}..${short(remote)}  ${up}       -> origin/${up}`,
      `Updating ${short(oldHead)}..${short(remote)}`,
      'Fast-forward',
      ...statLines(changed.map((p) => ({ path: p, before: from[p] ?? null, after: to[p] ?? null }))),
    ],
  };
}

export function revert(lab: LabState, ctx: TxContext, repoId: RepoId, rev: string, actor: string): GitOp<{ sha: string }> {
  const repo = lab.repos[repoId];
  const nc = needClone(repo);
  if (nc) return { ok: false, lines: nc.lines, error: nc.error };
  const local = repo.local!;
  const target = Object.keys(repo.commits).find((s) => s.startsWith(rev)) ?? null;
  if (!target || rev.length < 4) return fail(`fatal: bad revision '${rev}'`);
  const c = repo.commits[target]!;
  const parentTree = treeAt(repo, c.parent);
  const head = treeAt(repo, local.headSha);
  const changes: Record<string, string | null> = {};
  for (const p of Object.keys(c.changes)) {
    if ((head[p] ?? null) !== (c.changes[p] ?? null)) return fail(`error: could not revert ${short(target)}... ${c.message}`, [`error: could not revert ${short(target)}... ${c.message}`, 'hint: After resolving the conflicts, mark them with', 'hint: "git add/rm <pathspec>", then run', 'hint: "git revert --continue".']);
    changes[p] = parentTree[p] ?? null;
  }
  const x = ext(local);
  for (const [p, v] of Object.entries(changes)) {
    if (v === null) delete local.files[p];
    else local.files[p] = v;
    x.index[p] = v;
  }
  const r = commit(lab, ctx, repoId, `Revert "${c.message}"\n\nThis reverts commit ${target}.`, actor);
  return r;
}

/** Workstation mirror of the local clone's config.properties (Sim §1.10). */
export function mirrorConfig(lab: LabState): void {
  const t = lab.repos['uia-remote']?.local?.files['config.properties'];
  const out: Record<string, string> = {};
  if (t !== undefined) {
    for (const raw of t.split(/\r?\n/)) {
      const m = /^\s*([^#!=:\s]+)\s*[=:]\s*(.*)$/.exec(raw);
      if (m) out[m[1]!] = m[2]!.trim();
    }
  }
  lab.workstation.configProperties = out;
}

/** Merge base helper re-export for GitHub views. */
export { mergeBase };
