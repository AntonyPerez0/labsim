/**
 * The workstation file system as every dialog shows it (Apps §1.6): the union of `lab.workstation.files`,
 * the shell's session file map (D6 fallback), read-only clones under `~/IdeaProjects/<repo>/` and the
 * standard home folders. Pure helpers over a snapshot; `~` = `/home/engineer`.
 */
import type { LabState } from '@/sim/types';

export const HOME = '/home/engineer';
export const STANDARD_DIRS = ['~/Desktop', '~/Documents', '~/Downloads', '~/Pictures', '~/IdeaProjects', '~/CodeWithMe'];

export interface FsEntry {
  /** "~/Pictures/r2d2_cfd.png" */
  path: string;
  name: string;
  dir: boolean;
  /** File contents or image ref ("img:webcam:…"); '' for dirs. */
  content: string;
  readOnly: boolean;
}

export function normPath(p: string): string {
  let s = p.trim().replace(/\\/g, '/');
  if (s.startsWith(HOME)) s = `~${s.slice(HOME.length)}`;
  if (!s.startsWith('~') && !s.startsWith('/')) s = `~/${s}`;
  s = s.replace(/\/+/g, '/');
  if (s.length > 1) s = s.replace(/\/$/, '');
  return s;
}

export function baseName(p: string): string {
  const s = normPath(p);
  const i = s.lastIndexOf('/');
  return i < 0 ? s : s.slice(i + 1);
}

export function dirName(p: string): string {
  const s = normPath(p);
  const i = s.lastIndexOf('/');
  return i <= 0 ? '~' : s.slice(0, i);
}

export const IMAGE_RE = /\.(png|jpe?g|gif|bmp|webp)$/i;

export function isImagePath(p: string): boolean {
  return IMAGE_RE.test(p);
}

/** Every file (not dir) path → content. Later sources do not override earlier ones. */
export function allFiles(lab: LabState, sessionFiles: Record<string, string>): Map<string, { content: string; readOnly: boolean }> {
  const out = new Map<string, { content: string; readOnly: boolean }>();
  for (const [p, c] of Object.entries(lab.workstation?.files ?? {})) {
    if (p.endsWith('/')) continue;
    out.set(normPath(p), { content: c, readOnly: false });
  }
  for (const [p, c] of Object.entries(sessionFiles)) {
    const k = normPath(p);
    if (!out.has(k)) out.set(k, { content: c, readOnly: false });
  }
  for (const repo of Object.values(lab.repos ?? {})) {
    if (!repo?.local) continue;
    const root = normPath(repo.local.path || `~/IdeaProjects/${repo.id}`);
    for (const [p, c] of Object.entries(repo.local.files ?? {})) out.set(`${root}/${p}`, { content: c, readOnly: true });
  }
  return out;
}

/** Children of a directory (dirs first, then files, alphabetical). */
export function listDir(lab: LabState, sessionFiles: Record<string, string>, dir: string): FsEntry[] {
  const d = normPath(dir);
  const prefix = d === '/' ? '/' : `${d}/`;
  const dirs = new Set<string>();
  const files: FsEntry[] = [];
  const consider = (path: string, content: string | null, readOnly: boolean) => {
    if (!path.startsWith(prefix)) return;
    const rest = path.slice(prefix.length);
    if (!rest) return;
    const slash = rest.indexOf('/');
    if (slash >= 0) dirs.add(rest.slice(0, slash));
    else if (content === null) dirs.add(rest);
    else files.push({ path, name: rest, dir: false, content, readOnly });
  };
  for (const sd of STANDARD_DIRS) consider(sd, null, false);
  for (const [p, f] of allFiles(lab, sessionFiles)) consider(p, f.content, f.readOnly);
  for (const p of Object.keys(lab.workstation?.files ?? {})) if (p.endsWith('/')) consider(normPath(p), null, false);
  const dirEntries: FsEntry[] = [...dirs]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ path: `${prefix}${name}`, name, dir: true, content: '', readOnly: false }));
  files.sort((a, b) => a.name.localeCompare(b.name));
  return [...dirEntries, ...files];
}

export function fileKind(name: string): string {
  if (/\.png$/i.test(name)) return 'PNG File';
  if (/\.jpe?g$/i.test(name)) return 'JPG File';
  if (/\.json$/i.test(name)) return 'JSON File';
  if (/\.java$/i.test(name)) return 'Java Source File';
  if (/\.properties$/i.test(name)) return 'PROPERTIES File';
  if (/\.xml$/i.test(name)) return 'XML Document';
  if (/\.(txt|log|md)$/i.test(name)) return 'Text Document';
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1];
  return ext ? `${ext.toUpperCase()} File` : 'File';
}

export function fileSize(content: string): string {
  if (content.startsWith('img:')) return content.startsWith('img:receipt') ? '612 KB' : content.startsWith('img:screencap') ? '1,184 KB' : '238 KB';
  const kb = Math.max(1, Math.ceil(new TextEncoder().encode(content).length / 1024));
  return `${kb.toLocaleString('en-US')} KB`;
}
