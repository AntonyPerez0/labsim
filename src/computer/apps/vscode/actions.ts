/**
 * VS Code commands that touch the simulation: clone, save, format, run (LSTR local run), git, Pigeon Practice.
 * Every lab change is a `sim.*` call; every meaningful action emits its `vscode.*` app action afterwards.
 * Nothing here throws: a failing sim call becomes an error notification.
 */
import { mutate, getState } from '@/core/store';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { sim } from '@/sim';
import type { LabState, RepoId } from '@/sim';
import { status as gitStatus } from '@/sim/devops/git';
import { treeView } from '@/sim/devops/gitCore';
import { diagnoseJson, formatJson } from './jsonLang';
import { localBranchesOf, PRACTICE_DIR, rememberBranch, type Buffer, type Root, type VsModel } from './model';
import { checkExercise, EXERCISES_BY_ID, practiceFile } from './practice/exercises';
import type { ProfileInfo } from './practice/lstrCheck';

export const WS_HOST = 'ws-17';
export const REPOS: RepoId[] = ['pigeon', 'gort', 'uia-remote', 'orchestrator'];
export const PRACTICE_REPO = 'pigeon-practice';

type R<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

function call<T>(fn: () => R<T>): R<T> {
  try {
    const r = fn();
    return r && typeof r === 'object' ? r : { ok: false, error: 'Internal error' };
  } catch (e) {
    console.warn('[vscode] sim call failed', e);
    return { ok: false, error: (e as Error)?.message || 'Internal error' };
  }
}

/* ───────────────────────────── files ───────────────────────────── */

export function repoFiles(lab: LabState, repo: RepoId): Record<string, string> | null {
  return lab.repos[repo]?.local?.files ?? null;
}

/** Practice files, keyed by file name (no directories). */
export function practiceFiles(lab: LabState): Record<string, string> {
  const out: Record<string, string> = {};
  const prefix = `${PRACTICE_DIR}/`;
  for (const [p, v] of Object.entries(lab.workstation?.files ?? {})) if (p.startsWith(prefix) && typeof v === 'string' && !v.startsWith('img:')) out[p.slice(prefix.length)] = v;
  return out;
}

export function diskText(lab: LabState, repo: RepoId, root: Root, path: string): string | undefined {
  return root === 'repo' ? repoFiles(lab, repo)?.[path] : lab.workstation?.files?.[`${PRACTICE_DIR}/${path}`];
}

function repoLabel(m: VsModel, root: Root): string {
  return root === 'repo' ? m.repo : PRACTICE_REPO;
}

export function openFile(m: VsModel, root: Root, path: string, opts: { emit?: boolean; line?: number } = {}): boolean {
  const lab = getState().lab;
  const existing = m.buffers.get(`${root}:${path}`);
  const text = existing?.text ?? diskText(lab, m.repo, root, path);
  if (text === undefined) return false;
  const b = m.openBuffer(root, path, text);
  if (opts.line) {
    const ls = b.text.split('\n');
    let off = 0;
    for (let i = 0; i < Math.min(opts.line - 1, ls.length); i++) off += ls[i]!.length + 1;
    b.selStart = b.selEnd = off;
    m.revealSeq++;
  }
  // Reveal in the Explorer.
  const parts = path.split('/');
  for (let i = 1; i < parts.length; i++) m.expanded.add(`${root}:${parts.slice(0, i).join('/')}`);
  m.selectedNode = `${root}:${path}`;
  if (opts.emit !== false) emitAppAction('vscode', 'vscode.file.opened', { repo: repoLabel(m, root), path });
  m.changed();
  return true;
}

function writeBuffer(m: VsModel, b: Buffer): R {
  if (b.root === 'repo') return call(() => sim.git.writeFile(m.repo, b.path, b.text));
  return call(() => sim.host.writeFile(WS_HOST, `${PRACTICE_DIR}/${b.path}`, b.text, 'player'));
}

export function problemCount(text: string, path: string): number {
  return path.endsWith('.json') ? diagnoseJson(text).filter((d) => d.severity === 'error').length : 0;
}

export function saveBuffer(m: VsModel, b: Buffer | null): boolean {
  if (!b || b.text === b.base) return true;
  const r = writeBuffer(m, b);
  emitAppAction('vscode', 'vscode.file.saved', { repo: repoLabel(m, b.root), path: b.path, problems: problemCount(b.text, b.path), ok: r.ok, error: r.ok ? null : r.error });
  if (r.ok) b.base = b.text;
  else m.toast('error', `Failed to save '${b.path.split('/').pop()}': ${r.error}`);
  m.changed();
  return r.ok;
}

export function saveAll(m: VsModel): number {
  let n = 0;
  for (const b of m.buffers.values()) if (b.text !== b.base && saveBuffer(m, b)) n++;
  return n;
}

export function formatDocument(m: VsModel): void {
  const b = m.activeBuffer();
  if (!b || !b.path.endsWith('.json')) return;
  const f = formatJson(b.text);
  emitAppAction('vscode', 'vscode.format.ran', { repo: repoLabel(m, b.root), path: b.path, ok: f !== null, error: f === null ? 'syntax errors' : null });
  if (f === null) {
    m.toast('warning', 'Cannot format: the document has syntax errors. Fix the problems first.');
    return;
  }
  if (f !== b.text) {
    b.text = f;
    b.selStart = b.selEnd = Math.min(b.selStart, f.length);
  }
  m.focusSeq++;
  m.changed();
}

/** Keep clean buffers in sync with the lab (git checkout / pull / external edits). Dirty buffers are kept. */
export function syncBuffers(m: VsModel): boolean {
  const lab = getState().lab;
  let any = false;
  for (const b of m.buffers.values()) {
    const disk = diskText(lab, m.repo, b.root, b.path);
    if (disk === undefined) continue;
    if (b.text === b.base && disk !== b.base) {
      b.text = b.base = disk;
      b.selStart = Math.min(b.selStart, disk.length);
      b.selEnd = Math.min(b.selEnd, disk.length);
      any = true;
    } else if (b.text !== b.base && disk === b.text) {
      b.base = disk;
      any = true;
    }
  }
  return any;
}

/* ───────────────────────────── clone ───────────────────────────── */

export function cloneRepo(m: VsModel, url: string): boolean {
  const t = url.trim();
  const repo = REPOS.find((r) => t.endsWith(`/${r}.git`) || t.endsWith(`:labsim-lab/${r}.git`) || t.endsWith(`/${r}`) || t === r) ?? null;
  if (!repo) {
    emitAppAction('vscode', 'vscode.repo.cloned', { repo: '', url: t, ok: false, error: 'not a labsim-lab repository' });
    m.toast('error', `Git: repository '${t}' does not exist`);
    return false;
  }
  const already = !!getState().lab.repos[repo]?.local;
  const r = already ? ({ ok: true, value: undefined } as const) : call(() => sim.git.clone(repo, 'player'));
  emitAppAction('vscode', 'vscode.repo.cloned', { repo, url: t, ok: r.ok, error: r.ok ? null : r.error });
  if (!r.ok) {
    m.toast('error', `Git: ${r.error}`);
    return false;
  }
  openFolder(m, repo);
  m.toast('info', already ? `${repo} is already cloned — opened ~/IdeaProjects/${repo}` : `Cloned ${repo} into ~/IdeaProjects/${repo}`);
  return true;
}

export function openFolder(m: VsModel, repo: RepoId): void {
  if (m.repo !== repo) {
    saveAll(m);
    for (const id of [...m.tabs]) if (id.startsWith('repo:') || id.startsWith('diff:')) m.closeTab(id);
    m.repo = repo;
  }
  m.side = 'explorer';
  m.expanded.add('repo:');
  emitAppAction('vscode', 'vscode.folder.opened', { repo });
  m.changed();
}

/* ───────────────────────────── git ───────────────────────────── */

export interface ScmChange {
  path: string;
  /** M modified, U untracked, D deleted, A added (staged new file). */
  letter: 'M' | 'U' | 'D' | 'A';
}

export function scmState(lab: LabState, repo: RepoId): { staged: ScmChange[]; changes: ScmChange[]; branch: string; ahead: number; behind: number; published: boolean } | null {
  const r = lab.repos[repo];
  if (!r?.local) return null;
  let st: ReturnType<typeof gitStatus>;
  try {
    st = gitStatus(r);
  } catch {
    return null;
  }
  return {
    staged: st.staged.map((x) => ({ path: x.path, letter: x.kind === 'new file' ? 'A' : x.kind === 'deleted' ? 'D' : 'M' })),
    changes: [...st.unstaged.map((x) => ({ path: x.path, letter: x.kind === 'deleted' ? ('D' as const) : ('M' as const) })), ...st.untracked.map((p) => ({ path: p, letter: 'U' as const }))].sort((a, b) => a.path.localeCompare(b.path)),
    branch: r.local.branch,
    ahead: r.local.ahead,
    behind: r.local.behind,
    published: !!r.branches[r.local.branch],
  };
}

/** HEAD version of a file (for the diff editor). */
export function headText(lab: LabState, repo: RepoId, path: string): string {
  const r = lab.repos[repo];
  if (!r?.local) return '';
  try {
    return treeView(r, r.local.headSha)[path] ?? '';
  } catch {
    return '';
  }
}

export function stage(m: VsModel, paths: string[]): void {
  saveAll(m);
  const r = call(() => sim.git.stage(m.repo, paths));
  if (!r.ok) m.toast('error', `Git: ${r.error}`);
  m.changed();
}

export function discard(m: VsModel, path: string): void {
  const r = call(() => sim.git.discard(m.repo, path));
  if (!r.ok) m.toast('error', `Git: ${r.error}`);
  const b = m.buffers.get(`repo:${path}`);
  if (b) {
    const disk = diskText(getState().lab, m.repo, 'repo', path);
    if (disk !== undefined) b.text = b.base = disk;
  }
  m.changed();
}

/** Commit staged changes; with nothing staged VS Code offers to stage everything (we do it, like "Always"). */
export function commit(m: VsModel): boolean {
  const message = m.commitMessage.trim();
  if (!message) {
    m.toast('warning', 'Please provide a commit message.');
    return false;
  }
  saveAll(m);
  const st = scmState(getState().lab, m.repo);
  if (!st) return false;
  let files = st.staged.map((c) => c.path);
  if (!files.length) {
    files = st.changes.map((c) => c.path);
    if (!files.length) {
      m.toast('info', 'There are no changes to commit.');
      return false;
    }
    const s = call(() => sim.git.stage(m.repo, files));
    if (!s.ok) {
      m.toast('error', `Git: ${s.error}`);
      return false;
    }
  }
  const c = call(() => sim.git.commit(m.repo, message, 'player'));
  const sha = c.ok && c.value && typeof c.value === 'object' && 'sha' in c.value ? String((c.value as { sha: string }).sha) : null;
  emitAppAction('vscode', 'vscode.git.committed', { repo: m.repo, message, files, sha, ok: c.ok, error: c.ok ? null : c.error });
  if (c.ok) m.commitMessage = '';
  else m.toast('error', `Git: ${c.error}`);
  m.changed();
  return c.ok;
}

export function push(m: VsModel): boolean {
  const lab = getState().lab;
  const branch = lab.repos[m.repo]?.local?.branch ?? 'main';
  const isNew = !lab.repos[m.repo]?.branches?.[branch];
  const r = call(() => sim.git.push(m.repo));
  emitAppAction('vscode', 'vscode.git.pushed', { repo: m.repo, branch, ok: r.ok, error: r.ok ? null : r.error });
  if (r.ok) {
    const compare = `/labsim-lab/${m.repo}/compare/main...${branch}`;
    m.toast(
      'info',
      isNew ? `Published branch '${branch}' to origin. Point the Jenkins job's BRANCH parameter at it to run your change.` : `Pushed to origin/${branch}.`,
      branch !== 'main' ? [{ label: 'Create Pull Request', run: () => getWindowManager()?.openApp('github', { route: compare }) }] : undefined,
      12000,
    );
  } else m.toast('error', `Git: ${r.error}`, undefined, 15000);
  m.changed();
  return r.ok;
}

export function pull(m: VsModel): boolean {
  const r = call(() => sim.git.pull(m.repo));
  emitAppAction('vscode', 'vscode.git.pulled', { repo: m.repo, ok: r.ok, error: r.ok ? null : r.error });
  if (!r.ok) m.toast('error', `Git: ${r.error}`);
  syncBuffers(m);
  m.changed();
  return r.ok;
}

/** Sync Changes = pull then push (VS Code's ⟳ button). */
export function sync(m: VsModel): void {
  const st = scmState(getState().lab, m.repo);
  if (st && st.behind > 0 && !pull(m)) return;
  push(m);
}

export function checkout(m: VsModel, branch: string, create: boolean): boolean {
  const name = branch.trim().replace(/\s+/g, '-');
  if (!name) return false;
  saveAll(m);
  const r = call(() => sim.git.checkout(m.repo, name, create));
  emitAppAction('vscode', 'vscode.git.branchCheckedOut', { repo: m.repo, branch: name, created: create, ok: r.ok, error: r.ok ? null : r.error });
  if (r.ok) {
    rememberBranch(m.repo, name);
    syncBuffers(m);
  } else m.toast('error', `Git: ${r.error}`);
  m.changed();
  return r.ok;
}

export function branchList(lab: LabState, repo: RepoId): string[] {
  const r = lab.repos[repo];
  if (!r) return [];
  const set = new Set<string>([r.local?.branch ?? r.defaultBranch, ...localBranchesOf(repo)]);
  return [...set].sort((a, b) => (a === r.defaultBranch ? -1 : b === r.defaultBranch ? 1 : a.localeCompare(b)));
}

export function remoteBranches(lab: LabState, repo: RepoId): string[] {
  return Object.keys(lab.repos[repo]?.branches ?? {}).sort();
}

/* ───────────────────────────── run ───────────────────────────── */

export function runLocal(m: VsModel, path: string): void {
  if (m.repo !== 'pigeon') {
    m.toast('warning', 'Run LSTR Test works in the pigeon folder. Java tests run from IntelliJ.');
    return;
  }
  saveAll(m);
  const r = call(() => sim.runner.runLocal('pigeon', path, 'player'));
  const runId = r.ok ? r.value.runId : null;
  emitAppAction('vscode', 'vscode.run.started', { repo: 'pigeon', testPath: path, runId, ok: r.ok, error: r.ok ? null : r.error });
  m.panelOpen = true;
  m.panelTab = 'output';
  const robot = getState().lab.workstation?.configProperties?.['robotName'] || '(none)';
  m.output = [`> lstr run --platform ANDROID ${path}   (robot from config.properties: ${robot})`];
  if (!r.ok) {
    m.output.push(r.error);
    m.toast('error', r.error);
  }
  m.runId = runId;
  m.runPath = path;
  m.runReported = !r.ok;
  m.changed();
}

export function stopRun(m: VsModel): void {
  if (!m.runId) return;
  call(() => sim.runner.stopLocal(m.runId!));
  m.changed();
}

export function runState(runId: string | null): { lines: string[]; done: boolean; passed: boolean | null } {
  if (!runId) return { lines: [], done: true, passed: null };
  const lab = getState().lab.local?.runs?.[runId];
  try {
    const r = sim.runner.output(runId);
    return { lines: r?.lines?.length ? r.lines : (lab?.output ?? []), done: !!(r?.done ?? lab?.state === 'finished'), passed: r?.passed ?? lab?.passed ?? null };
  } catch {
    return { lines: lab?.output ?? [], done: lab?.state === 'finished', passed: lab?.passed ?? null };
  }
}

export function reportRun(m: VsModel, passed: boolean | null): void {
  if (m.runReported || !m.runId) return;
  m.runReported = true;
  emitAppAction('vscode', 'vscode.run.finished', { runId: m.runId, testPath: m.runPath ?? '', passed });
}

/* ───────────────────────────── Pigeon Practice ───────────────────────────── */

export function cardProfiles(): ProfileInfo[] {
  return Object.values(getState().lab.orca?.cardProfiles ?? {}).map((p) => ({ name: p.name, entry: p.entry, requiresPin: p.requiresPin }));
}

export function startExercise(m: VsModel, id: string): void {
  const ex = EXERCISES_BY_ID[id];
  if (!ex) return;
  const v = ex.make();
  const file = practiceFile(id);
  const r = call(() => sim.host.writeFile(WS_HOST, `${PRACTICE_DIR}/${file}`, v.text, 'player'));
  if (!r.ok) {
    m.toast('error', `Could not create ${PRACTICE_DIR}/${file}: ${r.error}`);
    return;
  }
  // A fresh variant replaces any open buffer of the same file.
  const bid = `practice:${file}`;
  m.buffers.delete(bid);
  m.practice = { exerciseId: id, file, ctx: { ...v.ctx, brief: v.brief }, startedReal: performance.now(), checks: 0, last: null, hintsShown: 0, solved: false };
  openFile(m, 'practice', file, { emit: false });
  emitAppAction('vscode', 'vscode.practice.started', { exerciseId: id, file });
  m.changed();
}

export function checkPractice(m: VsModel): void {
  const p = m.practice;
  if (!p) return;
  const ex = EXERCISES_BY_ID[p.exerciseId];
  if (!ex) return;
  const b = m.buffers.get(`practice:${p.file}`);
  if (b) saveBuffer(m, b);
  const text = b?.text ?? diskText(getState().lab, m.repo, 'practice', p.file) ?? '';
  const res = checkExercise(ex, text, p.ctx, cardProfiles());
  p.checks++;
  p.last = { passed: res.passed, items: res.items, lines: res.lines, warnings: res.warnings };
  emitAppAction('vscode', 'vscode.practice.checked', { exerciseId: p.exerciseId, passed: res.passed, failures: res.items.filter((i) => !i.ok).map((i) => i.label) });
  m.output = [`> lstr dry-run ${PRACTICE_DIR}/${p.file}`, ...res.lines, ...res.warnings.map((w) => `warning: ${w}`)];
  if (res.passed && !p.solved) {
    p.solved = true;
    const seconds = Math.max(1, Math.round((performance.now() - p.startedReal) / 1000));
    emitAppAction('vscode', 'vscode.practice.solved', { exerciseId: p.exerciseId, seconds, checks: p.checks, hints: p.hintsShown });
    const day = Math.floor(Date.now() / 86_400_000);
    mutate((s) => {
      const rec = s.progress.pigeonPractice[p.exerciseId] ?? { solved: 0, bestS: 0, lastDay: 0 };
      s.progress.pigeonPractice[p.exerciseId] = { solved: rec.solved + 1, bestS: rec.bestS ? Math.min(rec.bestS, seconds) : seconds, lastDay: day };
    });
  }
  m.changed();
}
