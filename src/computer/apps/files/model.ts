/**
 * File Explorer model (Apps §12.2): route ↔ directory, listing/search over the §1.6 file union
 * (`shell/files.ts`), "open" targets (GIMP / IntelliJ / Ollama WebUI / preview) and deterministic metadata.
 */
import type { LabState, RepoId as SimRepoId } from '@/sim/types';
import type { AppId, RepoId } from '../../apps';
import { allFiles, baseName, fileKind, fileSize, isImagePath, listDir, normPath, type FsEntry } from '../../shell/files';

export const RECYCLE = 'Recycle Bin';

/** Nav pane (Apps §12.2). */
export const NAV: {
  label: string;
  path: string;
  icon: 'home' | 'desktop' | 'downloads' | 'pictures' | 'folder' | 'recycle' | 'docs';
}[] = [
  { label: 'Home', path: '~', icon: 'home' },
  { label: 'Desktop', path: '~/Desktop', icon: 'desktop' },
  { label: 'Downloads', path: '~/Downloads', icon: 'downloads' },
  { label: 'Documents', path: '~/Documents', icon: 'docs' },
  { label: 'Pictures', path: '~/Pictures', icon: 'pictures' },
  { label: 'IdeaProjects', path: '~/IdeaProjects', icon: 'folder' },
  { label: 'Recycle Bin', path: RECYCLE, icon: 'recycle' },
];

/** `/dir/~/Pictures` → `~/Pictures`; `/dir/Recycle Bin` → `Recycle Bin`. */
export function dirFromRoute(route: string | undefined): string {
  const raw = (route ?? '').replace(/^\/dir\/?/, '').split('?')[0] ?? '';
  let p = raw;
  try {
    p = decodeURIComponent(raw);
  } catch {
    /* keep raw */
  }
  if (!p) return '~';
  if (p === RECYCLE) return RECYCLE;
  return normPath(p);
}

export function routeForDir(dir: string): string {
  return `/dir/${dir}`;
}

/** Breadcrumb segments after "This PC": `~/Pictures` → Home › Pictures. */
export function crumbs(dir: string): { label: string; path: string }[] {
  if (dir === RECYCLE) return [{ label: RECYCLE, path: RECYCLE }];
  if (dir.startsWith('/')) {
    const parts = dir.split('/').filter(Boolean);
    return [
      { label: '/', path: '/' },
      ...parts.map((p, i) => ({
        label: p,
        path: `/${parts.slice(0, i + 1).join('/')}`,
      })),
    ];
  }
  const parts = dir.replace(/^~\/?/, '').split('/').filter(Boolean);
  return [
    { label: 'Home', path: '~' },
    ...parts.map((p, i) => ({
      label: p,
      path: `~/${parts.slice(0, i + 1).join('/')}`,
    })),
  ];
}

export function parentDir(dir: string): string | null {
  if (dir === '~' || dir === RECYCLE || dir === '/') return null;
  const i = dir.lastIndexOf('/');
  return i <= 0 ? (dir.startsWith('/') ? '/' : '~') : dir.slice(0, i);
}

export function listing(lab: LabState, sessionFiles: Record<string, string>, dir: string): FsEntry[] {
  if (dir === RECYCLE) return [];
  return listDir(lab, sessionFiles, dir);
}

/** Recursive name search under `dir` (Explorer's search box). */
export function search(lab: LabState, sessionFiles: Record<string, string>, dir: string, q: string): FsEntry[] {
  const needle = q.trim().toLowerCase();
  if (!needle || dir === RECYCLE) return [];
  const prefix = dir === '/' ? '/' : `${dir}/`;
  const out: FsEntry[] = [];
  for (const [path, f] of allFiles(lab, sessionFiles)) {
    if (!path.startsWith(prefix)) continue;
    const name = baseName(path);
    if (name.toLowerCase().includes(needle))
      out.push({
        path,
        name,
        dir: false,
        content: f.content,
        readOnly: f.readOnly,
      });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name)).slice(0, 500);
}

/** Clone that contains `path`, with the repo-relative file path. */
export function cloneOf(lab: LabState, path: string): { repo: RepoId; file: string } | null {
  for (const repo of Object.values(lab.repos ?? {})) {
    if (!repo?.local) continue;
    const root = normPath(repo.local.path || `~/IdeaProjects/${repo.id}`);
    if (path === root || path.startsWith(`${root}/`))
      return {
        repo: repo.id as SimRepoId as RepoId,
        file: path.slice(root.length + 1),
      };
  }
  return null;
}

export type OpenTarget = { kind: 'app'; app: AppId } | { kind: 'preview' } | { kind: 'none' };

/** Double-click: images → GIMP; files inside a clone → IntelliJ; text → preview pane. */
export function defaultOpen(lab: LabState, e: FsEntry): OpenTarget {
  if (e.dir) return { kind: 'none' };
  if (isImagePath(e.name) || e.content.startsWith('img:')) return { kind: 'app', app: 'gimp' };
  if (cloneOf(lab, e.path)) return { kind: 'app', app: 'intellij' };
  return { kind: 'preview' };
}

const DAY = 86_400_000;
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Deterministic "Date modified" (game ms): files created this session carry a phys/game stamp in their image
 * ref (`img:screencap:dev-eve:<ms>` / snapshot names); everything else is placed in the days before the game day.
 */
export function modifiedMs(e: FsEntry, nowMs: number): number {
  const m = /:(\d{6,})$/.exec(e.content);
  if (m) {
    const t = Number(m[1]);
    if (t > 0 && t <= nowMs) return t;
  }
  const h = hash(e.path);
  const daysBack = e.readOnly ? 1 + (h % 9) : h % 3;
  const minutes = 7 * 60 + (h % (10 * 60));
  const base = Math.floor(nowMs / DAY) * DAY - daysBack * DAY + minutes * 60_000;
  return Math.min(base, nowMs - 60_000);
}

export function typeOf(e: FsEntry): string {
  return e.dir ? 'File folder' : fileKind(e.name);
}

export function sizeOf(e: FsEntry): string {
  return e.dir ? '' : fileSize(e.content);
}

export function sizeBytes(e: FsEntry): number {
  if (e.dir) return -1;
  const s = fileSize(e.content).replace(/[^\d]/g, '');
  return Number(s) || 0;
}

export type SortKey = 'name' | 'modified' | 'type' | 'size';

export function sortEntries(list: FsEntry[], key: SortKey, asc: boolean, nowMs: number): FsEntry[] {
  const dirsFirst = (a: FsEntry, b: FsEntry) => (a.dir === b.dir ? 0 : a.dir ? -1 : 1);
  const cmp = (a: FsEntry, b: FsEntry): number => {
    switch (key) {
      case 'modified':
        return modifiedMs(a, nowMs) - modifiedMs(b, nowMs);
      case 'type':
        return typeOf(a).localeCompare(typeOf(b)) || a.name.localeCompare(b.name);
      case 'size':
        return sizeBytes(a) - sizeBytes(b);
      default:
        return a.name.localeCompare(b.name, undefined, {
          numeric: true,
          sensitivity: 'base',
        });
    }
  };
  return [...list].sort((a, b) => dirsFirst(a, b) || (asc ? cmp(a, b) : -cmp(a, b)));
}
