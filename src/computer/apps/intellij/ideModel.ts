/**
 * Per-window IDE state (open editors, undo stacks, tool windows, run tabs, balloons, dialogs). Module-level and
 * keyed by window id so it survives the desktop unmounting (standing up). React subscribes with
 * `useSyncExternalStore(model.subscribe, model.getVersion)`. Lab truth (file contents, git, runs) is never
 * copied here except as an editor buffer's `base` (the content the buffer was loaded from / last saved).
 */
import { bus } from '@/core/bus';
import { getWindowManager } from '@/computer/apps';
import type { RepoId } from '@/sim';
import type { EdState } from './editorOps';
import type { RunConfig } from './projectModel';

export type LeftTool = 'project' | 'commit' | null;
export type BottomTool = 'run' | 'terminal' | 'problems' | 'git' | 'todo' | null;

export interface Buffer {
  path: string;
  text: string;
  base: string;
  undo: EdState[];
  redo: EdState[];
  start: number;
  end: number;
  scrollTop: number;
  scrollLeft: number;
  lastEditAt: number;
  lastEditKind: string;
  readOnly: boolean;
}

export interface DiffTab {
  /** Synthetic editor tab id: `diff:<title>`. */
  id: string;
  title: string;
  leftTitle: string;
  rightTitle: string;
  left: string;
  right: string;
  path: string;
}

export interface RunTab {
  key: string;
  runId: string | null;
  config: RunConfig;
  stopped: boolean;
  debug: boolean;
  error: string | null;
  reported: boolean;
  startedReal: number;
}

export interface Balloon {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  title: string;
  body?: string;
  link?: { label: string; action: () => void };
}

export interface FindState {
  open: boolean;
  replace: boolean;
  query: string;
  replacement: string;
  matchCase: boolean;
  words: boolean;
  regex: boolean;
  /** Bumped to ask the find field to take focus. */
  focusSeq: number;
}

export type DialogState =
  | { kind: 'getFromVcs'; url?: string }
  | { kind: 'gotoLine' }
  | { kind: 'gotoFile'; mode: 'files' | 'all' | 'classes' | 'actions' }
  | { kind: 'recentFiles' }
  | { kind: 'findInFiles'; query?: string }
  | { kind: 'contextActions' }
  | { kind: 'newClass'; dir: string }
  | { kind: 'newFile'; dir: string; what: 'File' | 'Directory' | 'Package' }
  | { kind: 'addToGit'; path: string }
  | { kind: 'move'; path: string; targetDir?: string }
  | { kind: 'rename'; path: string }
  | { kind: 'delete'; path: string }
  | { kind: 'push' }
  | { kind: 'pull' }
  | { kind: 'newBranch'; from?: string }
  | { kind: 'branches' }
  | { kind: 'rollback'; paths: string[] }
  | { kind: 'stopRerun'; config: RunConfig; debug: boolean }
  | { kind: 'editConfigs' }
  | { kind: 'settings' }
  | { kind: 'about' }
  | { kind: 'codeWithMe' }
  | { kind: 'openProject' };

export class IdeModel {
  repo: RepoId | null = null;
  /** Code With Me host key ("alex") or null for the local clone. */
  cwm: string | null = null;
  tabs: string[] = [];
  active: string | null = null;
  buffers = new Map<string, Buffer>();
  diffs = new Map<string, DiffTab>();
  expanded = new Set<string>();
  selectedNode: string | null = null;
  leftTool: LeftTool = 'project';
  bottomTool: BottomTool = null;
  leftWidth = 300;
  bottomHeight = 260;
  runConfig: string | null = null;
  runs: RunTab[] = [];
  activeRun = 0;
  balloons: Balloon[] = [];
  statusText = '';
  /** Progress line in the status bar ("Indexing…") until this real-time ms. */
  progress: { label: string; until: number } | null = null;
  find: FindState = { open: false, replace: false, query: '', replacement: '', matchCase: false, words: false, regex: false, focusSeq: 0 };
  dialog: DialogState | null = null;
  recent: string[] = [];
  nav: { path: string; pos: number }[] = [];
  navIndex = -1;
  /** Ask the editor to reveal/select this range once (set by navigation). */
  reveal: { path: string; start: number; end: number; seq: number } | null = null;
  editorFocusSeq = 0;
  /** Where caret-anchored popups (Alt+Enter) open, relative to the IDE root. */
  popupAnchor: { x: number; y: number } | null = null;
  lastTestStatus: { passed: boolean | null; count: number; atReal: number } | null = null;
  commitMessage = '';
  /** Bumped to move focus into the commit message box (Ctrl+K). */
  commitFocusSeq = 0;
  commitSelection: Set<string> | null = null;
  gitLogSelected: string | null = null;
  /** Set by the editor pane each render: find next/previous, replace one/all. */
  findNav: ((dir: 1 | -1) => void) | null = null;
  findReplace: ((all: boolean) => void) | null = null;
  /** Set by the active editor: run an Edit/Code menu command. */
  editorCmd: ((cmd: import('./Editor').EditorCmd) => boolean) | null = null;
  /** Directories/packages created in the tree but still empty (git does not track empty folders). */
  virtualDirs = new Set<string>();
  /** Caret position for the status bar (separate channel: caret moves must not re-render the IDE). */
  caret = { line: 1, col: 1 };
  private caretSubs = new Set<() => void>();
  private balloonSeq = 0;
  private listeners = new Set<() => void>();
  private version = 0;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  subscribeCaret = (fn: () => void): (() => void) => {
    this.caretSubs.add(fn);
    return () => this.caretSubs.delete(fn);
  };

  getCaret = (): { line: number; col: number } => this.caret;

  setCaret(line: number, col: number): void {
    if (this.caret.line === line && this.caret.col === col) return;
    this.caret = { line, col };
    for (const fn of [...this.caretSubs]) fn();
  }

  /** Switch the window to another project (or none): drops editors and per-project state. */
  setProject(repo: RepoId | null, cwm: string | null): void {
    if (repo === this.repo && cwm === this.cwm) return;
    this.repo = repo;
    this.cwm = cwm;
    this.tabs = [];
    this.active = null;
    this.buffers.clear();
    this.diffs.clear();
    this.expanded = new Set(['']);
    this.virtualDirs = new Set();
    this.selectedNode = null;
    this.runs = [];
    this.runConfig = null;
    this.recent = [];
    this.nav = [];
    this.navIndex = -1;
    this.find = { ...this.find, open: false };
    this.dialog = null;
    this.commitMessage = '';
    this.commitSelection = null;
  }

  balloon(b: Omit<Balloon, 'id'>, ttlMs = 9000): void {
    const id = ++this.balloonSeq;
    this.balloons = [...this.balloons.slice(-3), { ...b, id }];
    this.changed();
    if (ttlMs > 0)
      setTimeout(() => {
        this.dismissBalloon(id);
      }, ttlMs);
  }

  dismissBalloon(id: number): void {
    if (!this.balloons.some((b) => b.id === id)) return;
    this.balloons = this.balloons.filter((b) => b.id !== id);
    this.changed();
  }

  setStatus(text: string): void {
    this.statusText = text;
    this.changed();
  }

  startProgress(label: string, ms: number): void {
    this.progress = { label, until: performance.now() + ms };
    this.changed();
    setTimeout(() => {
      if (this.progress && performance.now() >= this.progress.until - 5) {
        this.progress = null;
        this.changed();
      }
    }, ms + 10);
  }

  openDialog(d: DialogState | null): void {
    this.dialog = d;
    this.changed();
  }

  /** Open (or focus) an editor tab for `path` with `text` as loaded contents. */
  openBuffer(path: string, text: string, readOnly = false): Buffer {
    let b = this.buffers.get(path);
    if (!b) {
      b = { path, text, base: text, undo: [], redo: [], start: 0, end: 0, scrollTop: 0, scrollLeft: 0, lastEditAt: 0, lastEditKind: '', readOnly };
      this.buffers.set(path, b);
    }
    if (!this.tabs.includes(path)) this.tabs = [...this.tabs, path];
    this.active = path;
    this.recent = [path, ...this.recent.filter((p) => p !== path)].slice(0, 30);
    return b;
  }

  openDiff(d: DiffTab): void {
    this.diffs.set(d.id, d);
    if (!this.tabs.includes(d.id)) this.tabs = [...this.tabs, d.id];
    this.active = d.id;
    this.changed();
  }

  closeTab(id: string): void {
    const idx = this.tabs.indexOf(id);
    if (idx < 0) return;
    this.tabs = this.tabs.filter((t) => t !== id);
    this.diffs.delete(id);
    if (this.active === id) this.active = this.tabs[Math.min(idx, this.tabs.length - 1)] ?? null;
    this.changed();
  }

  /** Re-key an open buffer after a move/rename. */
  renameBuffer(from: string, to: string): void {
    const b = this.buffers.get(from);
    if (b) {
      this.buffers.delete(from);
      b.path = to;
      this.buffers.set(to, b);
    }
    this.tabs = this.tabs.map((t) => (t === from ? to : t));
    if (this.active === from) this.active = to;
    this.recent = this.recent.map((t) => (t === from ? to : t));
  }

  pushNav(path: string, pos: number): void {
    const cur = this.nav[this.navIndex];
    if (cur && cur.path === path && Math.abs(cur.pos - pos) < 2) return;
    this.nav = [...this.nav.slice(0, this.navIndex + 1), { path, pos }].slice(-50);
    this.navIndex = this.nav.length - 1;
  }

  requestReveal(path: string, start: number, end = start, focus = true): void {
    this.reveal = { path, start, end, seq: (this.reveal?.seq ?? 0) + 1 };
    if (focus) this.editorFocusSeq++;
  }

  /** Record an edit for undo (coalescing consecutive typing). */
  recordEdit(b: Buffer, next: EdState, kind: string): void {
    const now = performance.now();
    const coalesce = kind === 'type' && b.lastEditKind === 'type' && now - b.lastEditAt < 1000 && b.start === b.end;
    if (!coalesce) {
      b.undo.push({ text: b.text, start: b.start, end: b.end });
      if (b.undo.length > 300) b.undo.shift();
    }
    b.redo = [];
    b.text = next.text;
    b.start = next.start;
    b.end = next.end;
    b.lastEditAt = now;
    b.lastEditKind = kind;
  }

  undo(b: Buffer): boolean {
    const prev = b.undo.pop();
    if (!prev) return false;
    b.redo.push({ text: b.text, start: b.start, end: b.end });
    b.text = prev.text;
    b.start = prev.start;
    b.end = prev.end;
    b.lastEditKind = '';
    return true;
  }

  redo(b: Buffer): boolean {
    const next = b.redo.pop();
    if (!next) return false;
    b.undo.push({ text: b.text, start: b.start, end: b.end });
    b.text = next.text;
    b.start = next.start;
    b.end = next.end;
    b.lastEditKind = '';
    return true;
  }
}

const registry = new Map<string, IdeModel>();

export function getIdeModel(windowId: string): IdeModel {
  let m = registry.get(windowId);
  if (!m) {
    m = new IdeModel();
    registry.set(windowId, m);
  }
  return m;
}

export function dropIdeModel(windowId: string): void {
  registry.delete(windowId);
}

/** Local branches the player has created/checked out per repo (the sim keeps only the current one). */
const localBranches = new Map<string, Set<string>>();
// A new lesson / shift / Free Play run re-seeds the repos: forget the last activity's local branches.
bus.on('session.started', () => localBranches.clear());

export function knownLocalBranches(repo: string, current: string, defaultBranch: string): string[] {
  let s = localBranches.get(repo);
  if (!s) {
    s = new Set([defaultBranch]);
    localBranches.set(repo, s);
  }
  s.add(current);
  return [...s].sort((a, b) => (a === defaultBranch ? -1 : b === defaultBranch ? 1 : a.localeCompare(b)));
}

export function rememberLocalBranch(repo: string, branch: string): void {
  let s = localBranches.get(repo);
  if (!s) {
    s = new Set();
    localBranches.set(repo, s);
  }
  s.add(branch);
}

/** On unmount: drop the model when the window manager no longer lists the window (closed, not stood up). */
export function releaseIdeIfClosed(windowId: string): void {
  setTimeout(() => {
    const wm = getWindowManager();
    if (!wm) return;
    let open = true;
    try {
      open = wm.windows().some((w) => w.id === windowId);
    } catch {
      open = true;
    }
    if (!open) dropIdeModel(windowId);
  }, 0);
}
