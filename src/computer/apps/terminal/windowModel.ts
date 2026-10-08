/**
 * Tabs of one Terminal window (Apps §5.2 "Tabs"). Module-level registry keyed by window id so sessions survive
 * the desktop unmounting (standing up) — a window's tabs are disposed when the window manager no longer
 * lists it.
 */
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { TermSession } from './session';

export interface WindowModelOptions {
  embedded: boolean;
  cwd?: string;
  command?: string;
  /** All tabs closed (`exit` in the last tab) — the host closes the window. */
  onEmpty: () => void;
}

export class TerminalWindowModel {
  tabs: TermSession[] = [];
  active = 0;
  readonly embedded: boolean;
  private nextTabNumber = 1;
  private listeners = new Set<() => void>();
  private version = 0;
  onEmpty: () => void;

  constructor(o: WindowModelOptions) {
    this.embedded = o.embedded;
    this.onEmpty = o.onEmpty;
    this.newTab({ cwd: o.cwd, command: o.command });
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  get current(): TermSession {
    return this.tabs[Math.min(this.active, this.tabs.length - 1)];
  }

  newTab(o: { cwd?: string; command?: string } = {}): TermSession {
    const tabNumber = this.nextTabNumber++;
    const s: TermSession = new TermSession({
      tabNumber,
      embedded: this.embedded,
      cwd: o.cwd,
      command: o.command,
      onExit: () => this.closeTab(this.tabs.indexOf(s)),
    });
    // The tab row shows each session's title (`user@host: cwd`): re-render the window when it changes.
    let lastTitle = s.title;
    s.subscribe(() => {
      if (s.title !== lastTitle) {
        lastTitle = s.title;
        this.changed();
      }
    });
    this.tabs = [...this.tabs, s];
    this.active = this.tabs.length - 1;
    emitAppAction('terminal', 'terminal.tab.opened', { tab: tabNumber });
    this.changed();
    return s;
  }

  closeTab(index: number): void {
    if (index < 0 || index >= this.tabs.length) return;
    const [gone] = this.tabs.splice(index, 1);
    this.tabs = [...this.tabs];
    gone.dispose();
    if (!this.tabs.length) {
      this.changed();
      this.onEmpty();
      return;
    }
    if (this.active >= this.tabs.length) this.active = this.tabs.length - 1;
    else if (index < this.active) this.active--;
    this.changed();
  }

  activate(index: number): void {
    if (index < 0 || index >= this.tabs.length || index === this.active) return;
    this.active = index;
    this.tabs[index].refreshPrompt();
    this.changed();
  }

  cycle(delta: number): void {
    if (this.tabs.length < 2) return;
    this.activate((this.active + delta + this.tabs.length) % this.tabs.length);
  }

  dispose(): void {
    for (const t of this.tabs) t.dispose();
    this.tabs = [];
    this.listeners.clear();
  }
}

const registry = new Map<string, TerminalWindowModel>();

export function getWindowModel(key: string, create: () => TerminalWindowModel): TerminalWindowModel {
  let m = registry.get(key);
  if (!m || (!m.tabs.length && !m.embedded)) {
    m = create();
    registry.set(key, m);
  }
  return m;
}

export function dropWindowModel(key: string): void {
  const m = registry.get(key);
  if (!m) return;
  m.dispose();
  registry.delete(key);
}

/**
 * Called on unmount: if the window manager is alive and no longer lists the window, the window was closed —
 * dispose its sessions. (When the whole desktop unmounts, the wm is null and sessions are kept.)
 */
export function releaseIfClosed(key: string, windowId: string): void {
  setTimeout(() => {
    const wm = getWindowManager();
    if (!wm) return;
    let open = true;
    try {
      open = wm.windows().some((w) => w.id === windowId);
    } catch {
      open = true;
    }
    if (!open) dropWindowModel(key);
  }, 0);
}
