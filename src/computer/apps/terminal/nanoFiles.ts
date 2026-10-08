/**
 * File resolution and saving for the terminal's nano (Apps §5.5).
 *
 *   workstation  `~/IdeaProjects/<repo>/<path>` → `lab.repos[repo].local.files` (save: `sim.git.writeFile`)
 *   workstation  other `~/…` paths            → `lab.workstation.files` (save: `sim.host.writeFile('ws-17', …)`)
 *   ssh host     `/etc/…`, `/home/pi/…`        → `lab.hosts[sshHostId].files` (save: `sim.host.writeFile`)
 *
 * Until `sim.host.writeFile` lands (contract delta D6) saves that the sim rejects as "not implemented" are kept in
 * a session-local file map so the edit is not lost and re-opening the file shows it.
 */
import { getState } from '@/core/store';
import { emitAppAction } from '@/computer/apps';
import { sim, type RepoId } from '@/sim';
import type { NanoSaveResult } from './nano';
import { parsePrompt, resolveShellPath } from './prompt';

export const WORKSTATION_HOST = 'ws-17';
const REPO_IDS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];

/** D6 fallback: `${hostId}:${path}` → contents. */
const sessionFiles = new Map<string, string>();

export interface NanoTarget {
  displayPath: string;
  contents: string | null;
  save: (path: string, text: string) => NanoSaveResult;
}

function repoPath(path: string): { repo: RepoId; rel: string } | null {
  const m = /^~\/IdeaProjects\/([^/]+)\/(.+)$/.exec(path);
  if (!m) return null;
  const repo = m[1] as RepoId;
  return REPO_IDS.includes(repo) ? { repo, rel: m[2] } : null;
}

/** Paths a non-root user may write on a Linux host. */
function userWritable(path: string, user: string | null): boolean {
  if (path.startsWith('~')) return true;
  if (user && path.startsWith(`/home/${user}/`)) return true;
  return path.startsWith('/tmp/');
}

export function readHostFile(hostId: string | null, path: string): string | null {
  const lab = getState().lab;
  const key = `${hostId ?? WORKSTATION_HOST}:${path}`;
  if (sessionFiles.has(key)) return sessionFiles.get(key) ?? null;
  if (!hostId) {
    const rp = repoPath(path);
    if (rp) {
      const local = lab.repos?.[rp.repo]?.local;
      return local ? (local.files[rp.rel] ?? null) : null;
    }
    const v = lab.workstation?.files?.[path];
    return typeof v === 'string' ? v : null;
  }
  const v = lab.hosts?.[hostId]?.files?.[path];
  if (typeof v !== 'string' || v.endsWith('/')) return null;
  return v.startsWith('<size:') ? '' : v;
}

function writeFile(hostId: string | null, path: string, text: string): NanoSaveResult {
  const host = hostId ?? WORKSTATION_HOST;
  let res: { ok: boolean; error?: string };
  try {
    const rp = !hostId ? repoPath(path) : null;
    if (rp) {
      if (!getState().lab.repos?.[rp.repo]?.local) res = { ok: false, error: 'No such file or directory' };
      else {
        const r = sim.git.writeFile(rp.repo, rp.rel, text);
        res = r.ok ? { ok: true } : { ok: false, error: r.error };
      }
    } else {
      const r = sim.host.writeFile(host, path, text, 'player');
      res = r.ok ? { ok: true } : { ok: false, error: r.error };
    }
  } catch (err) {
    console.warn('[terminal] nano save failed', err);
    res = { ok: false, error: 'not implemented' };
  }
  if (!res.ok && res.error === 'not implemented') {
    sessionFiles.set(`${host}:${path}`, text);
    res = { ok: true };
  } else if (res.ok) {
    sessionFiles.delete(`${host}:${path}`);
  }
  emitAppAction('terminal', 'terminal.nano.saved', { host, path, ok: res.ok, error: res.ok ? null : (res.error ?? 'error') });
  return res;
}

/** Resolve `nano <arg>` at the current prompt into a buffer + save function. */
export function openNanoTarget(arg: string, prompt: string, sudo: boolean): NanoTarget {
  let hostId: string | null = null;
  try {
    hostId = getState().lab.workstation?.sshHostId ?? null;
  } catch {
    hostId = null;
  }
  const user = sudo ? 'root' : parsePrompt(prompt).user;
  const displayPath = arg ? resolveShellPath(arg, prompt) : '';
  const contents = displayPath ? readHostFile(hostId, displayPath) : null;
  return {
    displayPath: arg ? displayPath.replace(/^~(?=\/|$)/, '~') : '',
    contents,
    save: (p, text) => {
      const target = resolveShellPath(p, prompt);
      if (hostId && !sudo && !userWritable(target, user)) {
        emitAppAction('terminal', 'terminal.nano.saved', { host: hostId, path: target, ok: false, error: 'Permission denied' });
        return { ok: false, error: 'Permission denied' };
      }
      return writeFile(hostId, target, text);
    },
  };
}
