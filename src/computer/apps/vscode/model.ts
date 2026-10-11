/**
 * VS Code window state (one window, `singleInstance`). Plain mutable object + version counter, read by React
 * through `useSyncExternalStore`. Lab data (files, branches) is never copied here except as open editor
 * buffers; everything else is read from the store when rendering.
 */
import { bus } from '@/core/bus';
import type { RepoId } from '@/sim';

/** Workspace roots: the cloned repo (PIGEON) and the practice folder (~/pigeon-practice). */
export type Root = 'repo' | 'practice';

export const PRACTICE_DIR = '~/pigeon-practice';

export interface Buffer {
  /** "repo:tests/sale/swipe_sale_print.json" or "practice:comma-hunt.json". */
  id: string;
  root: Root;
  path: string;
  text: string;
  /** Text on disk (dirty = text !== base). */
  base: string;
  selStart: number;
  selEnd: number;
  scrollTop: number;
}

export type SideView = 'explorer' | 'search' | 'scm' | 'run' | 'practice';
export type PanelTab = 'problems' | 'output' | 'terminal';

export interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  /** Right-aligned hint (keybinding / description). */
  hint?: string;
  run: (input: string) => void;
}

export interface PaletteState {
  /** Shown above the list ("Select a branch or tag to checkout"). */
  placeholder: string;
  /** '>' commands, '' files (Quick Open), ':' go to line, or a free-text prompt. */
  mode: 'commands' | 'files' | 'line' | 'prompt' | 'pick';
  input: string;
  items: PaletteItem[];
  /** prompt mode: called with the typed text on Enter. */
  onAccept?: (text: string) => void;
  sel: number;
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'warning';
  text: string;
  actions?: { label: string; run: () => void }[];
}

export interface PracticeSession {
  exerciseId: string;
  file: string;
  /** Exercise-specific values (generated numbers, original action count …). */
  ctx: Record<string, unknown>;
  startedReal: number;
  checks: number;
  /** Result of the last Check. */
  last: { passed: boolean; items: { label: string; ok: boolean; detail?: string }[]; lines: string[]; warnings: string[] } | null;
  hintsShown: number;
  solved: boolean;
}

export class VsModel {
  repo: RepoId = 'pigeon';
  buffers = new Map<string, Buffer>();
  /** Open tabs: buffer ids, or "diff:<path>" for a working-tree diff. */
  tabs: string[] = [];
  active: string | null = null;
  side: SideView | null = 'explorer';
  panelOpen = false;
  panelTab: PanelTab = 'problems';
  expanded = new Set<string>(['repo:', 'practice:']);
  selectedNode: string | null = null;
  /** Output channel "LSTR". */
  output: string[] = [];
  runId: string | null = null;
  runPath: string | null = null;
  runReported = true;
  commitMessage = '';
  searchQuery = '';
  palette: PaletteState | null = null;
  toasts: Toast[] = [];
  practice: PracticeSession | null = null;
  /** Bumped to ask the editor to focus / reveal the selection. */
  focusSeq = 0;
  revealSeq = 0;
  private toastSeq = 0;
  private version = 0;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = (): number => this.version;

  changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  activeBuffer(): Buffer | null {
    return this.active ? (this.buffers.get(this.active) ?? null) : null;
  }

  openBuffer(root: Root, path: string, text: string): Buffer {
    const id = `${root}:${path}`;
    let b = this.buffers.get(id);
    if (!b) {
      b = { id, root, path, text, base: text, selStart: 0, selEnd: 0, scrollTop: 0 };
      this.buffers.set(id, b);
    }
    if (!this.tabs.includes(id)) this.tabs = [...this.tabs, id];
    this.active = id;
    this.focusSeq++;
    return b;
  }

  closeTab(id: string): void {
    const i = this.tabs.indexOf(id);
    if (i < 0) return;
    this.tabs = this.tabs.filter((t) => t !== id);
    const b = this.buffers.get(id);
    if (b && b.text === b.base) this.buffers.delete(id);
    if (this.active === id) this.active = this.tabs[Math.min(i, this.tabs.length - 1)] ?? null;
  }

  toast(kind: Toast['kind'], text: string, actions?: Toast['actions'], ms = 7000): void {
    const t: Toast = { id: ++this.toastSeq, kind, text, actions };
    this.toasts = [...this.toasts.slice(-2), t];
    if (ms > 0)
      setTimeout(() => {
        this.toasts = this.toasts.filter((x) => x !== t);
        this.changed();
      }, ms);
    this.changed();
  }

  dismissToast(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.changed();
  }

  openPalette(p: Omit<PaletteState, 'sel'>): void {
    this.palette = { ...p, sel: 0 };
    this.changed();
  }

  closePalette(): void {
    if (!this.palette) return;
    this.palette = null;
    this.focusSeq++;
    this.changed();
  }

  /** Forget everything tied to the previous activity's lab (repos are re-seeded per lesson / shift). */
  reset(): void {
    this.buffers.clear();
    this.tabs = [];
    this.active = null;
    this.output = [];
    this.runId = null;
    this.runPath = null;
    this.runReported = true;
    this.commitMessage = '';
    this.practice = null;
    this.palette = null;
    this.toasts = [];
    this.changed();
  }
}

const models = new Map<string, VsModel>();

export function getVsModel(windowId: string): VsModel {
  let m = models.get(windowId);
  if (!m) {
    m = new VsModel();
    models.set(windowId, m);
  }
  return m;
}

export function releaseVsModel(windowId: string): void {
  models.delete(windowId);
}

bus.on('session.started', () => {
  for (const m of models.values()) m.reset();
});

/* Local branches the player created (git has no list API for local-only branches). */
const localBranches = new Map<string, Set<string>>();
bus.on('session.started', () => localBranches.clear());

export function rememberBranch(repo: string, branch: string): void {
  let s = localBranches.get(repo);
  if (!s) localBranches.set(repo, (s = new Set()));
  s.add(branch);
}

export function localBranchesOf(repo: string): string[] {
  return [...(localBranches.get(repo) ?? [])];
}
