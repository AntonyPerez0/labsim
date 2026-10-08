/**
 * IDE commands that touch the simulation (Apps §4.3–§4.10): save, open, run/stop, git, refactorings, intentions,
 * config validation. Every lab change is a `sim.*` call; every meaningful action emits its `APP_ACTIONS` event
 * after the call returns. Methods never throw: an exception (sim not implemented) becomes an error balloon.
 */
import { getState } from '@/core/store';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { sim } from '@/sim';
import type { LabState, RepoId } from '@/sim';
import { validateConfigProperties, type ConfigValidation } from './configValidator';
import { lineColToPos } from './editorOps';
import { implementScreenMethods, inspectFile } from './inspections';
import { rememberLocalBranch, type IdeModel, type RunTab } from './ideModel';
import { ancestorsOf, buildTree, javaPackageOf, runConfigsFor, type RunConfig } from './projectModel';

export type SimResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

export const WS_HOST = 'ws-17';

function call<T>(fn: () => SimResult<T>): SimResult<T> {
  try {
    const r = fn();
    if (!r || typeof r !== 'object') return { ok: false, error: 'Internal error' };
    return r;
  } catch (e) {
    console.warn('[intellij] sim call failed', e);
    return { ok: false, error: (e as Error)?.message || 'Internal error' };
  }
}

/* ───────────────────────────── Project files ───────────────────────────── */

export function cwmRoot(cwm: string, repo: string): string {
  return `~/CodeWithMe/${cwm}/${repo}`;
}

export function projectRoot(repo: string, cwm: string | null): string {
  return cwm ? cwmRoot(cwm, repo) : `~/IdeaProjects/${repo}`;
}

const cwmCache = new WeakMap<Record<string, string>, Map<string, Record<string, string>>>();

/** Repo-relative files of the project (local clone, or a Code With Me folder in workstation.files). */
export function projectFiles(lab: LabState, repo: RepoId, cwm: string | null): Record<string, string> | null {
  if (!cwm) return lab.repos[repo]?.local?.files ?? null;
  const all = lab.workstation?.files ?? {};
  let m = cwmCache.get(all);
  if (!m) {
    m = new Map();
    cwmCache.set(all, m);
  }
  const key = `${cwm}/${repo}`;
  const hit = m.get(key);
  if (hit) return hit;
  const prefix = `${cwmRoot(cwm, repo)}/`;
  const out: Record<string, string> = {};
  for (const [p, v] of Object.entries(all)) if (p.startsWith(prefix) && typeof v === 'string' && !v.startsWith('img:')) out[p.slice(prefix.length)] = v;
  m.set(key, out);
  return out;
}

/** Code With Me sessions found under ~/CodeWithMe/<person>/<repo>/ (Apps §4.3). */
export function codeWithMeSessions(lab: LabState): { person: string; repo: RepoId }[] {
  const seen = new Set<string>();
  const out: { person: string; repo: RepoId }[] = [];
  for (const p of Object.keys(lab.workstation?.files ?? {})) {
    const m = /^~\/CodeWithMe\/([^/]+)\/([^/]+)\//.exec(p);
    if (!m || seen.has(`${m[1]}/${m[2]}`)) continue;
    if (!['gort', 'uia-remote', 'pigeon', 'orchestrator'].includes(m[2])) continue;
    seen.add(`${m[1]}/${m[2]}`);
    out.push({ person: m[1], repo: m[2] as RepoId });
  }
  return out;
}

export function writeProjectFile(repo: RepoId, cwm: string | null, path: string, text: string): SimResult {
  if (cwm) return call(() => sim.host.writeFile(WS_HOST, `${cwmRoot(cwm, repo)}/${path}`, text, 'player'));
  return call(() => sim.git.writeFile(repo, path, text));
}

/* ───────────────────────────── Config validator ───────────────────────────── */

type SimValidate = (text: string, robotName: string) => { passed: number; total: number; failures: string[] } | undefined;

export function validateConfig(text: string): ConfigValidation {
  const lab = getState().lab;
  const local = validateConfigProperties(text, lab.orca);
  // D8: prefer the sim's validator for the totals when it exists (the UI keeps the local per-key rows).
  const simValidate = (sim.runner as unknown as { validateConfig?: SimValidate }).validateConfig;
  if (typeof simValidate === 'function') {
    try {
      const kv = /(^|\n)\s*robotName\s*[=:]\s*(\S*)/.exec(text);
      const r = simValidate(text, kv?.[2] ?? '');
      if (r && typeof r.passed === 'number') return { ...local, passed: r.passed, total: r.total, failures: r.failures ?? local.failures };
    } catch {
      /* fall back to the local validator */
    }
  }
  return local;
}

export function isConfigFile(repo: string, path: string): boolean {
  return repo === 'uia-remote' && path === 'config.properties';
}

export function emitValidator(repo: string, path: string, text: string): ConfigValidation {
  const v = validateConfig(text);
  emitAppAction('intellij', 'intellij.configValidator.ran', { repo, path, passed: v.passed, total: v.total, failures: v.failures });
  return v;
}

/* ───────────────────────────── Save ───────────────────────────── */

export type SaveTrigger = 'explicit' | 'auto' | 'run' | 'commit';

/** Write every changed buffer (Ctrl+S, autosave, before run/commit). Returns the number of files written. */
export function saveAll(model: IdeModel, trigger: SaveTrigger): number {
  const repo = model.repo;
  if (!repo) return 0;
  let written = 0;
  for (const b of model.buffers.values()) {
    if (b.readOnly || b.text === b.base) continue;
    const r = writeProjectFile(repo, model.cwm, b.path, b.text);
    const problems = inspectFile(repo, b.path, b.text).filter((p) => p.severity === 'error').length;
    emitAppAction('intellij', 'intellij.file.saved', { repo, path: b.path, trigger, problems, ok: r.ok, error: r.ok ? null : r.error });
    if (r.ok) {
      b.base = b.text;
      written++;
      if (isConfigFile(repo, b.path) || (model.cwm && b.path === 'config.properties')) emitValidator(repo, b.path, b.text);
    } else {
      model.balloon({ kind: 'error', title: `Cannot save ${b.path.split('/').pop()}`, body: r.error });
    }
  }
  if (written) model.changed();
  return written;
}

/* ───────────────────────────── Open ───────────────────────────── */

export function openFile(model: IdeModel, path: string, opts: { line?: number; col?: number; emit?: boolean; revealInTree?: boolean } = {}): boolean {
  const repo = model.repo;
  if (!repo) return false;
  const files = projectFiles(getState().lab, repo, model.cwm) ?? {};
  const text = files[path];
  if (text === undefined && !model.buffers.has(path)) return false;
  const b = model.openBuffer(path, model.buffers.get(path)?.text ?? text ?? '');
  if (opts.line) {
    const pos = lineColToPos(b.text, opts.line, opts.col ?? 1);
    model.requestReveal(path, pos);
    b.start = b.end = pos;
  } else model.editorFocusSeq++;
  model.pushNav(path, b.start);
  if (opts.revealInTree) {
    for (const a of ancestorsOf(path, buildTree(Object.keys(files)))) model.expanded.add(a);
    model.expanded.add('');
    model.selectedNode = path;
  }
  if (opts.emit !== false) emitAppAction('intellij', 'intellij.file.opened', { repo, path });
  if (isConfigFile(repo, path) || (model.cwm && path === 'config.properties')) emitValidator(repo, path, b.text);
  model.changed();
  return true;
}

/* ───────────────────────────── Run ───────────────────────────── */

export function configsOf(model: IdeModel): RunConfig[] {
  const repo = model.repo;
  if (!repo) return [];
  return runConfigsFor(repo, Object.keys(projectFiles(getState().lab, repo, model.cwm) ?? {}));
}

export function runStateOf(runId: string | null): { lines: string[]; done: boolean; passed: boolean | null } {
  if (!runId) return { lines: [], done: true, passed: null };
  try {
    const r = sim.runner.output(runId);
    const lab = getState().lab.local?.runs?.[runId];
    const lines = r?.lines?.length ? r.lines : (lab?.output ?? []);
    const done = r ? r.done && (lab ? lab.state === 'finished' || r.done : true) : lab?.state === 'finished';
    return { lines, done: !!done, passed: r?.passed ?? lab?.passed ?? null };
  } catch {
    const lab = getState().lab.local?.runs?.[runId];
    return { lines: lab?.output ?? [], done: lab?.state === 'finished', passed: lab?.passed ?? null };
  }
}

/** ▶ Run (or Debug) a configuration: autosave → sim.runner.runLocal → Run tool window tab. */
export function startRun(model: IdeModel, cfg: RunConfig, opts: { debug?: boolean; force?: boolean } = {}): void {
  const repo = model.repo;
  if (!repo) return;
  const existing = model.runs.find((t) => t.config.name === cfg.name);
  if (existing && !opts.force && existing.runId && !existing.stopped && !runStateOf(existing.runId).done) {
    model.openDialog({ kind: 'stopRerun', config: cfg, debug: !!opts.debug });
    return;
  }
  if (existing?.runId && !existing.stopped && !runStateOf(existing.runId).done) {
    call(() => sim.runner.stopLocal(existing.runId!));
  }
  saveAll(model, 'run');
  const runOpts = model.cwm ? { configPath: `${cwmRoot(model.cwm, repo)}/config.properties` } : undefined;
  const r = call(() => sim.runner.runLocal(cfg.repo, cfg.testPath, 'player', runOpts));
  const runId = r.ok ? r.value.runId : null;
  emitAppAction('intellij', 'intellij.run.started', { repo, config: cfg.name, testPath: cfg.testPath, runId, ok: r.ok, error: r.ok ? null : r.error });
  const tab: RunTab = { key: `${cfg.name}#${performance.now()}`, runId, config: cfg, stopped: false, debug: !!opts.debug, error: r.ok ? null : r.error, reported: !r.ok, startedReal: performance.now() };
  const idx = model.runs.findIndex((t) => t.config.name === cfg.name);
  if (idx >= 0) model.runs = model.runs.map((t, i) => (i === idx ? tab : t));
  else model.runs = [...model.runs, tab];
  model.activeRun = model.runs.indexOf(tab);
  model.runConfig = cfg.name;
  model.bottomTool = 'run';
  if (!r.ok) model.balloon({ kind: 'error', title: `Error running '${cfg.name}'`, body: r.error });
  model.changed();
}

export function stopRun(model: IdeModel, tab: RunTab | undefined): void {
  if (!tab?.runId || tab.stopped || runStateOf(tab.runId).done) return;
  const r = call(() => sim.runner.stopLocal(tab.runId!));
  tab.stopped = true;
  emitAppAction('intellij', 'intellij.run.stopped', { runId: tab.runId });
  if (!r.ok) console.warn('[intellij] stopLocal:', r.error);
  model.changed();
}

/** Called by the Run window when a run's output reports done (once per tab). */
export function reportRunFinished(model: IdeModel, tab: RunTab, passed: boolean | null, focused: boolean): void {
  if (tab.reported || !tab.runId) return;
  tab.reported = true;
  const result = tab.stopped ? null : passed;
  emitAppAction('intellij', 'intellij.run.finished', { runId: tab.runId, config: tab.config.name, passed: result });
  model.lastTestStatus = { passed: result, count: 1, atReal: performance.now() };
  if (!focused && result !== null) {
    getWindowManager()?.notify({ app: 'intellij', title: result ? 'Tests passed: 1' : 'Tests failed: 1', body: tab.config.name, kind: result ? 'success' : 'error' });
  }
  model.changed();
}

/* ───────────────────────────── Git ───────────────────────────── */

export function gitCheckout(model: IdeModel, branch: string, create: boolean): boolean {
  const repo = model.repo;
  if (!repo || model.cwm) return false;
  saveAll(model, 'auto');
  const r = call(() => sim.git.checkout(repo, branch, create));
  emitAppAction('intellij', 'intellij.git.branchCheckedOut', { repo, branch, created: create, ok: r.ok, error: r.ok ? null : r.error });
  if (r.ok) {
    rememberLocalBranch(repo, branch);
    model.balloon({ kind: 'info', title: create ? `Checked out new branch ${branch}` : `Checked out ${branch}` }, 5000);
  } else model.balloon({ kind: 'error', title: 'Checkout failed', body: r.error });
  return r.ok;
}

export function gitCommit(model: IdeModel, paths: string[], message: string): { ok: boolean; sha: string | null } {
  const repo = model.repo;
  if (!repo) return { ok: false, sha: null };
  saveAll(model, 'commit');
  const s = call(() => sim.git.stage(repo, paths));
  const c = s.ok ? call(() => sim.git.commit(repo, message, 'player')) : s;
  const sha = c.ok && c.value && typeof c.value === 'object' && 'sha' in c.value ? (c.value as { sha: string }).sha : null;
  emitAppAction('intellij', 'intellij.git.committed', { repo, message, files: paths, sha, ok: c.ok, error: c.ok ? null : c.error });
  if (c.ok) {
    model.balloon({ kind: 'success', title: `${paths.length} file${paths.length === 1 ? '' : 's'} committed: ${message.split('\n')[0]}` }, 7000);
    model.commitMessage = '';
    model.commitSelection = null;
  } else model.balloon({ kind: 'error', title: 'Commit failed', body: c.error });
  model.changed();
  return { ok: c.ok, sha };
}

export function gitPush(model: IdeModel): boolean {
  const repo = model.repo;
  if (!repo) return false;
  const lab = getState().lab;
  const local = lab.repos[repo]?.local;
  const branch = local?.branch ?? 'main';
  const isNew = !lab.repos[repo]?.branches?.[branch];
  const ahead = local?.ahead ?? 0;
  const r = call(() => sim.git.push(repo));
  emitAppAction('intellij', 'intellij.git.pushed', { repo, branch, ok: r.ok, error: r.ok ? null : r.error });
  if (r.ok) {
    const compare = `/labsim-lab/${repo}/compare/main...${branch}`;
    model.balloon(
      {
        kind: 'success',
        title: isNew ? `Pushed ${branch} to new branch origin/${branch}` : `Pushed ${ahead || 1} commit${ahead === 1 || !ahead ? '' : 's'} to origin/${branch}`,
        link: branch !== 'main' ? { label: 'Create Pull Request', action: () => getWindowManager()?.openApp('github', { route: compare }) } : undefined,
      },
      12000,
    );
  } else model.balloon({ kind: 'error', title: 'Push rejected', body: r.error }, 15000);
  model.changed();
  return r.ok;
}

export function gitPull(model: IdeModel): boolean {
  const repo = model.repo;
  if (!repo) return false;
  const before = getState().lab.repos[repo]?.local?.headSha;
  const behind = getState().lab.repos[repo]?.local?.behind ?? 0;
  const r = call(() => sim.git.pull(repo));
  emitAppAction('intellij', 'intellij.git.pulled', { repo, ok: r.ok, error: r.ok ? null : r.error });
  const after = getState().lab.repos[repo]?.local?.headSha;
  if (r.ok) model.balloon({ kind: 'info', title: before !== after || behind ? `${behind || 1} file${behind > 1 ? 's' : ''} updated in ${behind || 1} commit${behind > 1 ? 's' : ''}` : 'All files are up-to-date' }, 6000);
  else model.balloon({ kind: 'error', title: 'Update failed', body: r.error });
  model.changed();
  return r.ok;
}

export function gitRollback(model: IdeModel, paths: string[]): void {
  const repo = model.repo;
  if (!repo) return;
  for (const p of paths) {
    const r = call(() => sim.git.discard(repo, p));
    if (!r.ok) model.balloon({ kind: 'error', title: `Rollback failed: ${p}`, body: r.error });
    const b = model.buffers.get(p);
    const now = getState().lab.repos[repo]?.local?.files[p];
    if (b) {
      if (now === undefined) model.closeTab(p);
      else {
        b.text = now;
        b.base = now;
      }
    }
  }
  model.changed();
}

/* ───────────────────────────── Refactorings & files ───────────────────────────── */

export function moveFile(model: IdeModel, from: string, to: string): boolean {
  const repo = model.repo;
  if (!repo || from === to) return false;
  saveAll(model, 'auto');
  const lab = getState().lab;
  const text = projectFiles(lab, repo, model.cwm)?.[from] ?? '';
  const r = call(() => sim.git.moveFile(repo, from, to));
  emitAppAction('intellij', 'intellij.file.moved', { repo, from, to, ok: r.ok, error: r.ok ? null : r.error });
  if (!r.ok) {
    model.balloon({ kind: 'error', title: 'Move failed', body: r.error });
    return false;
  }
  model.renameBuffer(from, to);
  if (to.endsWith('.java')) {
    const pkg = javaPackageOf(to);
    const next = pkg ? (/^\s*package\s+[\w.]+\s*;/m.test(text) ? text.replace(/^(\s*)package\s+[\w.]+\s*;/m, `$1package ${pkg};`) : `package ${pkg};\n\n${text}`) : text.replace(/^\s*package\s+[\w.]+\s*;\s*\n/m, '');
    if (next !== text) {
      writeProjectFile(repo, model.cwm, to, next);
      const b = model.buffers.get(to);
      if (b) {
        b.text = next;
        b.base = next;
      }
    }
  }
  model.selectedNode = to;
  model.changed();
  return true;
}

export function deleteFile(model: IdeModel, path: string): void {
  const repo = model.repo;
  if (!repo) return;
  const r = call(() => sim.git.deleteFile(repo, path));
  if (r.ok) {
    model.buffers.delete(path);
    model.closeTab(path);
  } else model.balloon({ kind: 'error', title: 'Cannot delete', body: r.error });
  model.changed();
}

export function createFile(model: IdeModel, path: string, text: string, addToGit: boolean | null): boolean {
  const repo = model.repo;
  if (!repo) return false;
  const r = writeProjectFile(repo, model.cwm, path, text);
  if (r.ok && addToGit && !model.cwm) call(() => sim.git.stage(repo, [path]));
  emitAppAction('intellij', 'intellij.file.created', { repo, path, ok: r.ok, error: r.ok ? null : r.error });
  if (!r.ok) {
    model.balloon({ kind: 'error', title: 'Cannot create file', body: r.error });
    return false;
  }
  openFile(model, path);
  return true;
}

export function applyScreenIntention(model: IdeModel, path: string): boolean {
  const repo = model.repo;
  const b = model.buffers.get(path);
  if (!repo || !b) return false;
  const next = implementScreenMethods(path, b.text);
  if (next === null) return false;
  model.recordEdit(b, { text: next, start: b.start, end: b.start }, 'intention');
  emitAppAction('intellij', 'intellij.intention.applied', { repo, path, intention: 'implement-mandatory-screen-methods' });
  model.changed();
  return true;
}

export function buildProject(model: IdeModel): number {
  const repo = model.repo;
  if (!repo) return 0;
  saveAll(model, 'auto');
  const files = projectFiles(getState().lab, repo, model.cwm) ?? {};
  let errors = 0;
  for (const [p, t] of Object.entries(files)) if (p.endsWith('.java')) errors += inspectFile(repo, p, t).filter((x) => x.severity === 'error').length;
  emitAppAction('intellij', 'intellij.build.ran', { repo, errors });
  model.setStatus(errors ? `Build failed: ${errors} error${errors === 1 ? '' : 's'}` : 'Build completed successfully in 1 sec, 412 ms');
  if (errors) model.bottomTool = 'problems';
  model.changed();
  return errors;
}
