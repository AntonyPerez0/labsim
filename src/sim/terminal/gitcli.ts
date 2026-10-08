/**
 * `git` on the workstation (Sim §3.22.1, Apps §5.4): clone, status, log, show, diff, checkout/switch,
 * branch, add, rm, restore, commit, push, pull, revert, fetch, remote. State changes go through
 * `src/sim/devops/git.ts` (which emits the git.* events); this file is the porcelain (output formats).
 */
import type { GitCommit, GitRepo, LabState, RepoId } from '../types';
import * as git from '../devops/git';
import { chain, commitChanges, ext, resolveRev, short, statLines, treeAt, unifiedDiff, VALID_BRANCH } from '../devops/gitCore';
import { fmtGitDate, tildify } from '../devops/util';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, repoAt, resolvePath } from './session';
import { cwdAbs, cwdRepo } from './ws';

const NOT_A_REPO = 'fatal: not a git repository (or any of the parent directories): .git';

const ident = (author: string): string => (author === 'player' || author === 'engineer' ? 'Engineer <engineer@labsim-lab.example>' : `${author} <${author}@labsim-lab.example>`);

/** Relative path from the cwd inside the repo (git prints paths relative to the cwd). */
function relFromCwd(cwdRel: string, path: string): string {
  if (!cwdRel) return path;
  const from = cwdRel.split('/');
  const to = path.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => '..'), ...to.slice(i)].join('/');
}

/** A pathspec typed in the cwd → repo-relative. */
function toRepoPath(lab: LabState, spec: string): string | null {
  if (spec === '.' || spec === '-A' || spec === '--all') {
    const at = cwdRepo(lab);
    return at && at.rel ? at.rel : spec === '.' ? '.' : spec;
  }
  const base = cwdAbs(lab);
  const abs = spec.startsWith('/') || spec.startsWith('~') ? spec.replace(/^~/, '/home/engineer') : `${base}/${spec}`;
  const parts: string[] = [];
  for (const seg of abs.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const at = repoAt(lab, `/${parts.join('/')}`);
  return at ? at.rel || '.' : null;
}

function decorations(repo: GitRepo, sha: string): string {
  const local = repo.local;
  const x = local ? ext(local) : null;
  const out: string[] = [];
  if (local && local.headSha === sha) out.push(`HEAD -> ${local.branch}`);
  if (x) for (const [b, s] of Object.entries(x.branches)) if (s === sha && b !== local!.branch) out.push(b);
  for (const [b, s] of Object.entries(repo.branches)) if (s === sha) out.push(`origin/${b}`);
  if (repo.branches[repo.defaultBranch] === sha) out.push('origin/HEAD');
  return out.length ? ` (${out.join(', ')})` : '';
}

function logEntry(lab: LabState, repo: GitRepo, c: GitCommit, opts: { oneline: boolean; stat: boolean; decorate: boolean }): Line[] {
  const subject = c.message.split('\n')[0]!;
  if (opts.oneline) return [L(`${short(c.sha)}${opts.decorate ? decorations(repo, c.sha) : ''} ${subject}`)];
  const lines: Line[] = [L(`commit ${c.sha}${opts.decorate ? decorations(repo, c.sha) : ''}`, 'info'), L(`Author: ${ident(c.author)}`), L(`Date:   ${fmtGitDate(lab, c.atMs)}`), L('')];
  for (const m of c.message.split('\n')) lines.push(L(m ? `    ${m}` : ''));
  if (opts.stat) {
    const st = statLines(commitChanges(repo, c));
    if (st.length) lines.push(L(''), ...st.map((s) => L(s)));
  }
  return lines;
}

function log(lab: LabState, repo: GitRepo, args: string[]): CmdResult {
  let n = Infinity;
  let oneline = false;
  let stat = false;
  let rev = 'HEAD';
  let pathFilter: string | null = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '--oneline') oneline = true;
    else if (a === '--stat') stat = true;
    else if (a === '-n') n = Number(args[++i]);
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
    else if (/^-\d+$/.test(a)) n = Number(a.slice(1));
    else if (a.startsWith('--max-count=')) n = Number(a.slice(12));
    else if (a === '--') pathFilter = args[i + 1] ?? null;
    else if (a.startsWith('--')) continue;
    else if (a.startsWith('-')) return fail(128, E(`fatal: unrecognized argument: ${a}`));
    else if (resolveRev(repo, a)) rev = a;
    else {
      const p = toRepoPath(lab, a);
      if (p && (repo.local?.files[p] !== undefined || Object.keys(repo.local?.files ?? {}).some((f) => f.startsWith(`${p}/`)))) pathFilter = p;
      else return fail(128, E(`fatal: ambiguous argument '${a}': unknown revision or path not in the working tree.`), E("Use '--' to separate paths from revisions, like this:"), E("'git <command> [<revision>...] -- [<file>...]'"));
    }
  }
  const head = resolveRev(repo, rev);
  if (!head) return fail(128, E(`fatal: your current branch '${repo.local?.branch}' does not have any commits yet`));
  let commits = chain(repo, head);
  if (pathFilter) {
    const pf = pathFilter;
    commits = commits.filter((c) => Object.keys(c.changes).some((p) => p === pf || p.startsWith(`${pf}/`)));
  }
  const out: Line[] = [];
  commits.slice(0, n).forEach((c, i) => {
    if (i > 0 && !oneline) out.push(L(''));
    out.push(...logEntry(lab, repo, c, { oneline, stat, decorate: true }));
  });
  return ok(...out);
}

function show(lab: LabState, repo: GitRepo, args: string[]): CmdResult {
  const revArg = args.find((a) => !a.startsWith('-')) ?? 'HEAD';
  const statOnly = args.includes('--stat');
  const m = /^([^:]+):(.+)$/.exec(revArg);
  if (m) {
    const sha = resolveRev(repo, m[1]!);
    if (!sha) return fail(128, E(`fatal: invalid object name '${m[1]}'.`));
    const t = treeAt(repo, sha)[m[2]!];
    if (t === undefined) return fail(128, E(`fatal: path '${m[2]}' does not exist in '${m[1]}'`));
    return ok(...t.replace(/\n$/, '').split('\n').map((l) => L(l)));
  }
  const sha = resolveRev(repo, revArg);
  if (!sha) return fail(128, E(`fatal: ambiguous argument '${revArg}': unknown revision or path not in the working tree.`));
  const c = repo.commits[sha]!;
  const out = logEntry(lab, repo, c, { oneline: false, stat: statOnly, decorate: true });
  if (!statOnly) {
    out.push(L(''));
    for (const ch of commitChanges(repo, c)) out.push(...diffLinesColored(unifiedDiff(ch.path, ch.before, ch.after, c.parent ?? '0000000', c.sha)));
  }
  return ok(...out);
}

const diffLinesColored = (lines: string[]): Line[] =>
  lines.map((l) => (l.startsWith('+') && !l.startsWith('+++') ? L(l, 'success') : l.startsWith('-') && !l.startsWith('---') ? L(l, 'err') : l.startsWith('@@') ? L(l, 'info') : L(l)));

function diff(lab: LabState, repo: GitRepo, args: string[]): CmdResult {
  const local = repo.local!;
  const x = ext(local);
  const head = treeAt(repo, local.headSha);
  const staged = args.includes('--staged') || args.includes('--cached');
  const statOnly = args.includes('--stat');
  const nameOnly = args.includes('--name-only');
  const positional = args.filter((a) => !a.startsWith('-'));
  let before: Record<string, string>;
  let after: Record<string, string>;
  let rest = positional;
  const indexTree = (): Record<string, string> => {
    const t = { ...head };
    for (const [p, v] of Object.entries(x.index)) {
      if (v === null) delete t[p];
      else t[p] = v;
    }
    return t;
  };
  const r1 = positional[0] ? resolveRev(repo, positional[0]) : null;
  const rangeM = positional[0] ? /^(.+?)\.\.(.+)$/.exec(positional[0]) : null;
  if (rangeM) {
    const a = resolveRev(repo, rangeM[1]!);
    const b = resolveRev(repo, rangeM[2]!);
    if (!a || !b) return fail(128, E(`fatal: ambiguous argument '${positional[0]}': unknown revision or path not in the working tree.`));
    before = treeAt(repo, a);
    after = treeAt(repo, b);
    rest = positional.slice(1);
  } else if (r1) {
    before = treeAt(repo, r1);
    const r2 = positional[1] ? resolveRev(repo, positional[1]) : null;
    after = r2 ? treeAt(repo, r2) : staged ? indexTree() : { ...local.files };
    rest = positional.slice(r2 ? 2 : 1);
    if (!r2 && !staged) {
      // Untracked files are not part of `git diff <rev>`.
      for (const p of Object.keys(after)) if (before[p] === undefined && head[p] === undefined && !(p in x.index)) delete after[p];
    }
  } else if (staged) {
    before = head;
    after = indexTree();
  } else {
    before = indexTree();
    after = {};
    for (const p of Object.keys(before)) if (local.files[p] !== undefined) after[p] = local.files[p]!;
  }
  const filters = rest.map((r) => toRepoPath(lab, r)).filter((p): p is string => !!p);
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((p) => (before[p] ?? null) !== (after[p] ?? null))
    .filter((p) => !filters.length || filters.some((f) => f === '.' || p === f || p.startsWith(`${f}/`)))
    .sort();
  if (nameOnly) return ok(...paths.map((p) => L(p)));
  const changes = paths.map((p) => ({ path: p, before: before[p] ?? null, after: after[p] ?? null }));
  if (statOnly) return ok(...statLines(changes).map((l) => L(l)));
  return ok(...changes.flatMap((c) => diffLinesColored(unifiedDiff(c.path, c.before, c.after, short(local.headSha), '0000000'))));
}

function statusCmd(lab: LabState, repo: GitRepo, short_: boolean): CmdResult {
  const local = repo.local!;
  const x = ext(local);
  git.refreshLocal(repo);
  const st = git.status(repo);
  const cwdRel = cwdRepo(lab)?.rel ?? '';
  const rel = (p: string): string => relFromCwd(cwdRel, p);
  // Collapse untracked files to their first untracked directory (git's default `-unormal`).
  const tracked = new Set([...Object.keys(treeAt(repo, local.headSha)), ...Object.keys(x.index)]);
  const trackedDirs = new Set<string>();
  for (const p of tracked) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) trackedDirs.add(parts.slice(0, i).join('/'));
  }
  const untracked = [
    ...new Set(
      st.untracked.map((p) => {
        const parts = p.split('/');
        for (let i = 1; i < parts.length; i++) {
          const d = parts.slice(0, i).join('/');
          if (!trackedDirs.has(d)) return `${d}/`;
        }
        return p;
      }),
    ),
  ].sort();
  if (short_) {
    const rows = new Map<string, [string, string]>();
    for (const s of st.staged) rows.set(s.path, [s.kind === 'new file' ? 'A' : s.kind === 'deleted' ? 'D' : 'M', ' ']);
    for (const u of st.unstaged) rows.set(u.path, [rows.get(u.path)?.[0] ?? ' ', u.kind === 'deleted' ? 'D' : 'M']);
    const out: Line[] = [...rows.entries()].sort().map(([p, [a, b]]) => L(`${a}${b} ${rel(p)}`));
    out.push(...untracked.map((p) => L(`?? ${rel(p)}`)));
    return ok(...out);
  }
  const out: Line[] = [L(`On branch ${local.branch}`)];
  const up = x.upstream[local.branch];
  if (up) {
    if (local.ahead && local.behind) out.push(L(`Your branch and 'origin/${up}' have diverged,`), L(`and have ${local.ahead} and ${local.behind} different commits each, respectively.`), L('  (use "git pull" to merge the remote branch into yours)'));
    else if (local.ahead) out.push(L(`Your branch is ahead of 'origin/${up}' by ${local.ahead} commit${local.ahead === 1 ? '' : 's'}.`), L('  (use "git push" to publish your local commits)'));
    else if (local.behind) out.push(L(`Your branch is behind 'origin/${up}' by ${local.behind} commit${local.behind === 1 ? '' : 's'}, and can be fast-forwarded.`), L('  (use "git pull" to update your local branch)'));
    else out.push(L(`Your branch is up to date with 'origin/${up}'.`));
  }
  const pad = (k: string): string => `${k}:`.padEnd(12);
  if (st.staged.length) {
    out.push(L(''), L('Changes to be committed:'), L('  (use "git restore --staged <file>..." to unstage)'));
    for (const s of st.staged) out.push(L(`\t${pad(s.kind)}${rel(s.path)}`, 'success'));
  }
  if (st.unstaged.length) {
    out.push(L(''), L('Changes not staged for commit:'), L('  (use "git add <file>..." to update what will be committed)'), L('  (use "git restore <file>..." to discard changes in working directory)'));
    for (const u of st.unstaged) out.push(L(`\t${pad(u.kind)}${rel(u.path)}`, 'err'));
  }
  if (untracked.length) {
    out.push(L(''), L('Untracked files:'), L('  (use "git add <file>..." to include in what will be committed)'));
    for (const u of untracked) out.push(L(`\t${rel(u)}`, 'err'));
  }
  out.push(L(''));
  if (!st.staged.length && !st.unstaged.length && !untracked.length) out.push(L('nothing to commit, working tree clean'));
  else if (!st.staged.length && st.unstaged.length) out.push(L('no changes added to commit (use "git add" and/or "git commit -a")'));
  else if (!st.staged.length) out.push(L('nothing added to commit but untracked files present (use "git add" to track)'));
  else out.pop();
  return ok(...out);
}

function branchCmd(sh: Sh, repo: GitRepo, repoId: RepoId, args: string[]): CmdResult {
  const local = repo.local!;
  const x = ext(local);
  x.branches[local.branch] = local.headSha;
  const positional = args.filter((a) => !a.startsWith('-'));
  if (args.includes('-d') || args.includes('-D')) {
    const b = positional[0];
    if (!b) return fail(128, E('fatal: branch name required'));
    if (b === local.branch) return fail(1, E(`error: Cannot delete branch '${b}' checked out at '${tildify(local.path.replace(/^~/, '/home/engineer'))}'`));
    if (!x.branches[b]) return fail(1, E(`error: branch '${b}' not found.`));
    const sha = x.branches[b]!;
    delete x.branches[b];
    delete x.upstream[b];
    return ok(L(`Deleted branch ${b} (was ${short(sha)}).`));
  }
  if (positional.length && !args.includes('-a') && !args.includes('-r')) {
    const nb = positional[0]!;
    if (!VALID_BRANCH.test(nb)) return fail(128, E(`fatal: '${nb}' is not a valid branch name`));
    if (x.branches[nb]) return fail(128, E(`fatal: a branch named '${nb}' already exists`));
    const from = positional[1] ? resolveRev(repo, positional[1]) : local.headSha;
    if (!from) return fail(128, E(`fatal: not a valid object name: '${positional[1]}'`));
    x.branches[nb] = from;
    x.upstream[nb] = null;
    void sh;
    void repoId;
    return ok();
  }
  const out: Line[] = [];
  const names = Object.keys(x.branches).sort();
  if (!args.includes('-r')) for (const b of names) out.push(b === local.branch ? L(`* ${b}`, 'success') : L(`  ${b}`));
  if (args.includes('-a') || args.includes('-r')) {
    out.push(L(`  ${args.includes('-r') ? '' : 'remotes/'}origin/HEAD -> origin/${repo.defaultBranch}`, 'err'));
    for (const b of Object.keys(repo.branches).sort()) out.push(L(`  ${args.includes('-r') ? '' : 'remotes/'}origin/${b}`, 'err'));
  }
  return ok(...out);
}

function commitCmd(sh: Sh, repoId: RepoId, args: string[]): CmdResult {
  const msgs: string[] = [];
  let all = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === '-m' || a === '--message') {
      const m = args[++i];
      if (m === undefined) return fail(129, E("error: switch `m' requires a value"));
      msgs.push(m);
    } else if (a.startsWith('--message=')) msgs.push(a.slice(10));
    else if (a === '-a' || a === '--all') all = true;
    else if (a === '-am') {
      all = true;
      const m = args[++i];
      if (m === undefined) return fail(129, E("error: switch `m' requires a value"));
      msgs.push(m);
    } else if (a === '--amend') return fail(128, E('fatal: --amend is disabled in this lab (rewriting history breaks the PR bot)'));
  }
  if (!msgs.length) return fail(1, E('Aborting commit due to empty commit message.'), L('hint: use git commit -m "<message>" (the editor is not available in this terminal)', 'muted'));
  const lab = sh.lab;
  if (all) {
    const st = git.status(lab.repos[repoId]);
    const paths = st.unstaged.map((u) => u.path);
    if (paths.length) git.stage(lab, sh.ctx, repoId, paths);
  }
  const r = git.commit(lab, sh.ctx, repoId, msgs.join('\n\n'), 'player');
  return r.ok ? ok(...r.lines.filter((l) => l !== '').map((l) => L(l))) : fail(1, ...r.lines.map((l) => L(l)));
}

/** `git …` (argv[0] === 'git'). */
export function gitCmd(sh: Sh, argv: string[]): CmdResult {
  const lab = sh.lab;
  let args = argv.slice(1);
  if (args[0] === '-C' && args[1]) args = args.slice(2);
  const sub = args[0];
  if (!sub || sub === '--help' || sub === 'help') {
    return ok(
      L('usage: git [--version] [--help] [-C <path>] <command> [<args>]'),
      L(''),
      L('These are common Git commands used in various situations:'),
      L('   clone     Clone a repository into a new directory'),
      L('   add       Add file contents to the index'),
      L('   restore   Restore working tree files'),
      L('   diff      Show changes between commits, commit and working tree, etc'),
      L('   log       Show commit logs'),
      L('   status    Show the working tree status'),
      L('   branch    List, create, or delete branches'),
      L('   commit    Record changes to the repository'),
      L('   switch    Switch branches'),
      L('   pull      Fetch from and integrate with another repository or a local branch'),
      L('   push      Update remote refs along with associated objects'),
    );
  }
  if (sub === '--version' || sub === 'version') return ok(L('git version 2.34.1'));
  if (sub === 'clone') {
    const pos = args.slice(1).filter((a) => !a.startsWith('-'));
    const url = pos[0];
    if (!url) return fail(129, E('fatal: You must specify a repository to clone.'));
    const repoId = git.repoFromUrl(url);
    if (!repoId) {
      if (/github\.com[:/]/.test(url)) return fail(128, E('ERROR: Repository not found.'), E('fatal: Could not read from remote repository.'), E(''), E('Please make sure you have the correct access rights'), E('and the repository exists.'));
      return fail(128, E(`fatal: repository '${url}' does not exist`));
    }
    const dirName = pos[1] ?? repoId;
    const target = resolvePath(cwdAbs(lab), dirName);
    if (lab.repos[repoId].local) return fail(128, E(`fatal: destination path '${dirName}' already exists and is not an empty directory.`));
    const r = git.clone(lab, sh.ctx, repoId, 'player', tildify(target));
    if (!r.ok) return fail(128, ...r.lines.map(E));
    const lines = r.lines.map((l) => L(l));
    lines[0] = L(`Cloning into '${dirName}'...`);
    return ok(...lines);
  }
  if (sub === 'config') {
    if (args.includes('--list') || args.includes('-l')) return ok(L('user.name=Engineer'), L('user.email=engineer@labsim-lab.example'), L('pull.ff=only'));
    const key = args.slice(1).find((a) => !a.startsWith('-'));
    if (key === 'user.name') return ok(L('Engineer'));
    if (key === 'user.email') return ok(L('engineer@labsim-lab.example'));
    return ok();
  }
  if (sub === 'init') return fail(1, E('hint: this lab only uses the GitHub repos — clone one with git clone git@github.com:labsim-lab/<repo>.git'));
  const at = cwdRepo(lab);
  if (!at) return fail(128, E(NOT_A_REPO));
  const repoId = at.repo;
  const repo = lab.repos[repoId];
  if (!repo.local) return fail(128, E(NOT_A_REPO));
  const rest = args.slice(1);
  const asCmd = (r: git.GitOp<unknown>, errCode = 1): CmdResult => (r.ok ? ok(...r.lines.map((l) => L(l))) : { lines: r.lines.map((l) => (/^(hint|Please|\t|To |Aborting|Updating|error|fatal| !|remote:|Enumerating|Counting)/.test(l) ? E(l) : E(l))), code: errCode });
  switch (sub) {
    case 'status':
      return statusCmd(lab, repo, rest.includes('-s') || rest.includes('--short') || rest.includes('-sb'));
    case 'log':
      return log(lab, repo, rest);
    case 'show':
      return show(lab, repo, rest);
    case 'diff':
      return diff(lab, repo, rest);
    case 'branch':
      return branchCmd(sh, repo, repoId, rest);
    case 'checkout':
    case 'switch': {
      const create = rest.includes('-b') || rest.includes('-c') || rest.includes('-B') || rest.includes('-C');
      const dashdash = rest.indexOf('--');
      if (sub === 'checkout' && dashdash >= 0) {
        const lines: Line[] = [];
        let n = 0;
        for (const spec of rest.slice(dashdash + 1)) {
          const p = toRepoPath(lab, spec);
          if (!p) return fail(1, E(`error: pathspec '${spec}' did not match any file(s) known to git`));
          const r = git.discard(lab, sh.ctx, repoId, p);
          if (!r.ok) return asCmd(r);
          n++;
        }
        lines.push(L(`Updated ${n} path${n === 1 ? '' : 's'} from the index`));
        return ok(...lines);
      }
      const name = rest.filter((a) => !a.startsWith('-'))[0];
      if (!name) return fail(128, E(sub === 'switch' ? 'fatal: missing branch or commit argument' : "error: switch `b' requires a value"));
      if (!create && sub === 'checkout') {
        const p = toRepoPath(lab, name);
        const tracked = p && p !== '.' && treeAt(repo, repo.local.headSha)[p] !== undefined && !ext(repo.local).branches[name] && !repo.branches[name];
        if (tracked) {
          const r = git.discard(lab, sh.ctx, repoId, p!);
          return r.ok ? ok(L('Updated 1 path from the index')) : asCmd(r);
        }
      }
      return asCmd(git.checkout(lab, sh.ctx, repoId, name.replace(/^origin\//, ''), create));
    }
    case 'add': {
      const force = rest.includes('-f') || rest.includes('--force');
      const specs = rest.filter((a) => !['-f', '--force', '-v'].includes(a));
      if (!specs.length) return ok(L('Nothing specified, nothing added.'), L("hint: Maybe you wanted to say 'git add .'?", 'muted'));
      const paths: string[] = [];
      for (const s of specs) {
        if (s === '-A' || s === '--all' || s === '-u') {
          paths.push('.');
          continue;
        }
        const p = toRepoPath(lab, s);
        if (!p) return fail(128, E(`fatal: ${s}: '${s}' is outside repository at '${tildify(repo.local.path.replace(/^~/, '/home/engineer'))}'`));
        paths.push(p);
      }
      const r = git.stage(lab, sh.ctx, repoId, paths, force);
      return r.ok ? ok() : { lines: r.lines.map((l) => (l.startsWith('hint') ? L(l, 'muted') : E(l))), code: r.error?.startsWith('fatal') ? 128 : 1 };
    }
    case 'rm': {
      const specs = rest.filter((a) => !a.startsWith('-'));
      const cached = rest.includes('--cached');
      const out: Line[] = [];
      for (const s of specs) {
        const p = toRepoPath(lab, s);
        if (!p) return fail(128, E(`fatal: pathspec '${s}' did not match any files`));
        if (!cached) {
          const r = git.deleteFile(lab, sh.ctx, repoId, p);
          if (!r.ok) return fail(128, E(`fatal: pathspec '${s}' did not match any files`));
        }
        const st = git.stage(lab, sh.ctx, repoId, [p], true);
        if (!st.ok && !cached) return asCmd(st);
        if (cached) ext(repo.local).index[p] = null;
        out.push(L(`rm '${p}'`));
      }
      git.refreshLocal(repo);
      return ok(...out);
    }
    case 'mv': {
      const pos = rest.filter((a) => !a.startsWith('-'));
      if (pos.length !== 2) return fail(129, E('usage: git mv [<options>] <source>... <destination>'));
      const a = toRepoPath(lab, pos[0]!);
      const b = toRepoPath(lab, pos[1]!);
      if (!a || !b) return fail(128, E(`fatal: bad source, source=${pos[0]}, destination=${pos[1]}`));
      const r = git.moveFile(lab, sh.ctx, repoId, a, b);
      if (!r.ok) return asCmd(r, 128);
      git.stage(lab, sh.ctx, repoId, [a, b], true);
      return ok();
    }
    case 'restore': {
      const stagedOnly = rest.includes('--staged') && !rest.includes('--worktree');
      const specs = rest.filter((a) => !a.startsWith('-'));
      if (!specs.length) return fail(128, E('fatal: you must specify path(s) to restore'));
      for (const s of specs) {
        const p = toRepoPath(lab, s);
        if (!p) return fail(1, E(`error: pathspec '${s}' did not match any file(s) known to git`));
        if (stagedOnly) {
          const x = ext(repo.local);
          for (const k of Object.keys(x.index)) if (k === p || p === '.' || k.startsWith(`${p}/`)) delete x.index[k];
          git.refreshLocal(repo);
          continue;
        }
        const targets = p === '.' ? git.status(repo).unstaged.map((u) => u.path) : [p];
        for (const t of targets) {
          const r = git.discard(lab, sh.ctx, repoId, t);
          if (!r.ok) return asCmd(r);
        }
      }
      return ok();
    }
    case 'commit':
      return commitCmd(sh, repoId, rest);
    case 'push': {
      const pos = rest.filter((a) => !a.startsWith('-'));
      const setUp = rest.includes('-u') || rest.includes('--set-upstream');
      if (rest.includes('-f') || rest.includes('--force')) return fail(1, E('remote: error: GH003: Sorry, force-pushing is not allowed here.'), E(`error: failed to push some refs to '${repo.remoteUrl}'`));
      if (pos[1] && pos[1] !== repo.local.branch) return fail(1, E(`error: src refspec ${pos[1]} does not match any`), E(`error: failed to push some refs to '${repo.remoteUrl}'`));
      if (pos[0] && pos[0] !== 'origin') return fail(128, E(`fatal: '${pos[0]}' does not appear to be a git repository`), E('fatal: Could not read from remote repository.'));
      return asCmd(git.push(lab, sh.ctx, repoId, setUp || !!pos[1]));
    }
    case 'pull':
      return asCmd(git.pull(lab, sh.ctx, repoId));
    case 'fetch': {
      git.refreshLocal(repo);
      return ok();
    }
    case 'revert': {
      const rev = rest.find((a) => !a.startsWith('-'));
      if (!rev) return fail(128, E('usage: git revert [<options>] <commit-ish>...'));
      const sha = resolveRev(repo, rev);
      if (!sha) return fail(128, E(`fatal: bad revision '${rev}'`));
      return asCmd(git.revert(lab, sh.ctx, repoId, sha, 'player'));
    }
    case 'remote':
      if (rest.includes('-v')) return ok(L(`origin\t${repo.remoteUrl} (fetch)`), L(`origin\t${repo.remoteUrl} (push)`));
      return ok(L('origin'));
    case 'rev-parse':
      if (rest.includes('--abbrev-ref')) return ok(L(repo.local.branch));
      if (rest.includes('--show-toplevel')) return ok(L(repo.local.path.replace(/^~/, '/home/engineer')));
      {
        const s = resolveRev(repo, rest.find((a) => !a.startsWith('-')) ?? 'HEAD');
        return s ? ok(L(rest.includes('--short') ? short(s) : s)) : fail(128, E('fatal: ambiguous argument'));
      }
    case 'stash':
      return fail(1, E('git stash is not available in this lab terminal — commit to a branch or use git restore <file>.'));
    case 'merge':
    case 'rebase':
    case 'cherry-pick':
    case 'reset':
      return fail(1, E(`git ${sub} is not supported in this lab terminal — merges happen through pull requests on GitHub.`));
    default:
      return fail(1, E(`git: '${sub}' is not a git command. See 'git --help'.`));
  }
}

export { relFromCwd };
