/**
 * Terminal session, workstation file system view and streaming jobs.
 * The session (cwd, ssh host, remote cwd/shell) mirrors into `workstation.cwd` / `sshHostId`; remote
 * details and streaming jobs are UI-session state (not saved with the lab).
 */
import type { TxContext } from '@/core/store';
import type { Host, LabState } from '../types';
import type { TerminalLine } from '../api';
import { expandHome, HOME, tildify } from '../devops/util';

export interface RemoteSession {
  hostId: string;
  user: string;
  cwd: string;
  shell: 'bash' | 'cmd' | 'powershell';
  /** ssh target as typed (for "Connection to <x> closed."). */
  target: string;
}

export interface Session {
  remote: RemoteSession | null;
  oldpwd: string;
  lastExit: number;
  /**
   * Workstation cwd of a secondary terminal tab (Apps D7: one shell per tab). `null` = this is the
   * primary session, whose cwd lives in `lab.workstation.cwd` (saved with the lab).
   */
  wsCwd: string | null;
  /** Shell variables set with `export` / `VAR=value`. */
  vars: Record<string, string>;
}

/**
 * The session the current command runs in. `./index.ts` swaps the fields of this object in and out per
 * tab (`sessionId`) around every exec/poll, so command code can always use `session`.
 */
export const session: Session = { remote: null, oldpwd: HOME, lastExit: 0, wsCwd: null, vars: {} };

export const freshSession = (primary: boolean): Session => ({ remote: null, oldpwd: HOME, lastExit: 0, wsCwd: primary ? null : '~', vars: {} });

export interface Sh {
  lab: LabState;
  ctx: TxContext;
  env: Record<string, string>;
}

/** A terminal line; `stderr` marks the stream (pipes/redirects only carry stdout), `kind` is only styling. */
export type Line = TerminalLine & { stderr?: boolean };
export const L = (text: string, kind: TerminalLine['kind'] = 'out'): Line => ({ text, kind });
export const E = (text: string): Line => ({ text, kind: 'err', stderr: true });

export interface StreamJob {
  id: string;
  /** Called on every poll (inside a transaction) with the current physical time. */
  step(sh: Sh, physMs: number): { lines: Line[]; done: boolean; exitCode: number | null };
  /** Ctrl+C. Returns final lines (e.g. ping statistics). */
  interrupt?(sh: Sh): Line[];
  interrupted?: boolean;
  /** Session id the job belongs to. */
  sessionId?: string;
}

export interface CmdResult {
  lines: Line[];
  code: number;
  clear?: boolean;
  stream?: StreamJob;
  /** Binary stdout (an image ref, e.g. `adb exec-out screencap -p`): written by `>`; printed as noise otherwise. */
  binary?: string;
}

export const ok = (...lines: Line[]): CmdResult => ({ lines, code: 0 });
export const fail = (code: number, ...lines: Line[]): CmdResult => ({ lines, code });

export type Cmd = (sh: Sh, argv: string[], stdin: string[] | null) => CmdResult;

const jobs = new Map<string, StreamJob>();
let jobSeq = 0;
export function registerJob(job: Omit<StreamJob, 'id'>): StreamJob {
  const j = { ...job, id: `job-${++jobSeq}` } as StreamJob;
  jobs.set(j.id, j);
  return j;
}
export const getJob = (id: string): StreamJob | undefined => jobs.get(id);
export const dropJob = (id: string): void => {
  jobs.delete(id);
};

/* ────────────────────────────── workstation file system ────────────────────────────── */

const STATIC_FILES: Record<string, string> = {
  [`${HOME}/.bashrc`]: '# ~/.bashrc: executed by bash(1) for non-login shells.\nexport PATH="$HOME/bin:$PATH"\nexport ANDROID_HOME="$HOME/Android/Sdk"\nalias ll=\'ls -alF\'\n',
  [`${HOME}/.gitconfig`]: '[user]\n\tname = Engineer\n\temail = engineer@labsim-lab.example\n[pull]\n\tff = only\n',
  [`${HOME}/.ssh/id_ed25519`]: '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW\n-----END OPENSSH PRIVATE KEY-----\n',
  [`${HOME}/.ssh/id_ed25519.pub`]: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIK7q8wS0mXzXkq3dQ0m1a9Lr2pY5cJbTq0vU8fH3sQnE engineer@ws-17\n',
  [`${HOME}/.ssh/known_hosts`]: '10.42.10.11 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIB4m...\n10.42.20.1 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDk2...\norca.lab.local ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIHf7...\n',
  [`${HOME}/Desktop/README-lab.txt`]: 'LabSim automation lab — quick links\nOrca:    http://orca.lab.local:8080\nJenkins: http://jenkins.lab.local:8080\nOllama:  http://10.42.1.12:3000 (WebUI) / :11434 (API)\nADB: lab devices listen on 5444. Never 5555.\n',
};
const STATIC_DIRS = [`${HOME}/IdeaProjects`, `${HOME}/Pictures`, `${HOME}/Downloads`, `${HOME}/Desktop`, `${HOME}/.ssh`];

/** Absolute path from a path typed in `cwd`. */
export function resolvePath(cwd: string, p: string): string {
  let path = expandHome(p);
  if (!path.startsWith('/')) path = `${expandHome(cwd)}/${path}`;
  const parts: string[] = [];
  for (const seg of path.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return `/${parts.join('/')}`;
}

/** Every workstation file: abs path → contents. */
export function wsFiles(lab: LabState): Record<string, string> {
  const out: Record<string, string> = { ...STATIC_FILES };
  for (const [k, v] of Object.entries(lab.workstation.files)) out[expandHome(k)] = v;
  for (const repo of Object.values(lab.repos)) {
    if (!repo.local) continue;
    const root = expandHome(repo.local.path);
    for (const [p, v] of Object.entries(repo.local.files)) out[`${root}/${p}`] = v;
    out[`${root}/.git/HEAD`] = `ref: refs/heads/${repo.local.branch}\n`;
  }
  return out;
}

export function wsDirs(lab: LabState, files: Record<string, string>): Set<string> {
  const dirs = new Set<string>(['/', '/home', HOME, ...STATIC_DIRS]);
  for (const p of Object.keys(files)) {
    const parts = p.split('/');
    for (let i = 2; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
  }
  for (const repo of Object.values(lab.repos)) if (repo.local) dirs.add(expandHome(repo.local.path));
  return dirs;
}

/** Which repo clone a workstation path belongs to (and the repo-relative path). */
export function repoAt(lab: LabState, abs: string): { repo: keyof LabState['repos']; rel: string } | null {
  for (const repo of Object.values(lab.repos)) {
    if (!repo.local) continue;
    const root = expandHome(repo.local.path);
    if (abs === root) return { repo: repo.id, rel: '' };
    if (abs.startsWith(`${root}/`)) return { repo: repo.id, rel: abs.slice(root.length + 1) };
  }
  return null;
}

export const displayPath = (abs: string): string => tildify(abs);

/* ────────────────────────────── remote file systems ────────────────────────────── */

export function hostFiles(h: Host): Record<string, string> {
  return h.files;
}
export function remoteDirs(h: Host): Set<string> {
  const dirs = new Set<string>(['/']);
  const win = h.kind === 'minix' || h.kind === 'nuc';
  for (const p of Object.keys(h.files)) {
    const sep = win ? '\\' : '/';
    const parts = p.split(sep);
    for (let i = 1; i < parts.length; i++) {
      const d = parts.slice(0, i).join(sep);
      if (d) dirs.add(d);
    }
    if (p.endsWith(sep)) dirs.add(p.slice(0, -1));
  }
  return dirs;
}
