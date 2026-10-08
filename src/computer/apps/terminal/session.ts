/**
 * One terminal tab = one shell session (Apps §5.2). Owns scrollback, the input line, history, reverse
 * search, completion state, streaming jobs and the nano editor. Module-level (not React state) so tabs
 * survive the desktop unmounting when the player stands up (Apps §1.3 "Persistence").
 * React subscribes with `useSyncExternalStore(session.subscribe, session.getVersion)`.
 */
import { getState } from '@/core/store';
import { emitAppAction } from '@/computer/apps';
import type { TerminalLine } from '@/sim';
import {
  applyCompletion,
  backspace,
  deleteForward,
  formatColumns,
  insertText,
  killPrevAlnumWord,
  killPrevWord,
  killToEnd,
  killToStart,
  moveEnd,
  moveHome,
  moveLeft,
  moveRight,
  wordLeft,
  wordRight,
  type LineState,
} from './lineEditor';
import { NanoModel } from './nano';
import { openNanoTarget } from './nanoFiles';
import { parsePrompt, titleFromPrompt } from './prompt';
import { termApi } from './termApi';

export type TermLineKind = 'out' | 'err' | 'info' | 'success' | 'muted' | 'prompt';

export interface TermLine {
  id: number;
  kind: TermLineKind;
  text: string;
  /** For `prompt` lines: the prompt the command was typed at. */
  prompt?: string;
}

export interface ReverseSearch {
  query: string;
  /** Index into history of the current match, or -1. */
  index: number;
  failing: boolean;
  /** Input before the search started (restored on cancel). */
  original: LineState;
}

export interface KeyLike {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export const SCROLLBACK_LIMIT = 5000;
const POLL_MS = 100;
const INTERRUPT_GRACE_MS = 1500;

let sessionSeq = 0;
let lineSeq = 0;

export function nextSessionId(): string {
  sessionSeq += 1;
  return `t${sessionSeq}`;
}

export interface SessionOptions {
  /** Tab number reported in actions (`terminal.command.submitted {tab}`), 1-based. */
  tabNumber: number;
  embedded?: boolean;
  /** Working directory to `cd` into silently before the first prompt (IntelliJ tool window). */
  cwd?: string;
  /** Text to put in the input line without executing it. */
  command?: string;
  /** Called when `exit` closes a local session. */
  onExit?: () => void;
}

export class TermSession {
  readonly id: string;
  tabNumber: number;
  readonly embedded: boolean;
  lines: TermLine[] = [];
  prompt: string;
  input: LineState = { text: '', cursor: 0 };
  history: string[];
  private histPos: number | null = null;
  private histDraft: LineState = { text: '', cursor: 0 };
  search: ReverseSearch | null = null;
  jobId: string | null = null;
  jobLine = '';
  nano: NanoModel | null = null;
  title: string;
  private killRing = '';
  private lastKeyWasTab = false;
  private pasteQueue: string[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private interruptTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();
  private version = 0;
  onExit?: () => void;
  disposed = false;

  constructor(o: SessionOptions) {
    this.id = nextSessionId();
    this.tabNumber = o.tabNumber;
    this.embedded = !!o.embedded;
    this.onExit = o.onExit;
    let seeded: string[] = [];
    try {
      seeded = [...(getState().lab.workstation?.shellHistory ?? [])];
    } catch {
      seeded = [];
    }
    this.history = seeded.filter((h) => typeof h === 'string' && h.trim());
    // MOTD (if the sim prints any for an empty line), then an optional silent cd.
    const motd = termApi.exec('', this.id);
    this.append(motd.lines);
    if (o.cwd) termApi.exec(`cd ${o.cwd}`, this.id);
    this.prompt = termApi.prompt(this.id);
    this.title = this.embedded ? 'Local' : titleFromPrompt(this.prompt);
    if (o.command) this.input = { text: o.command, cursor: o.command.length };
  }

  /* ───────────── subscription ───────────── */

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Bump the version and notify React (also used by the nano view). */
  changed(): void {
    this.version++;
    for (const fn of [...this.listeners]) fn();
  }

  /* ───────────── output ───────────── */

  append(lines: TerminalLine[] | { text: string; kind?: string }[]): void {
    if (!lines.length) return;
    for (const l of lines) {
      const kind = (l.kind ?? 'out') as TermLineKind;
      for (const text of String(l.text ?? '').split('\n')) this.lines.push({ id: ++lineSeq, kind, text });
    }
    this.trim();
  }

  private pushPromptLine(text: string, suffix = ''): void {
    this.lines.push({ id: ++lineSeq, kind: 'prompt', prompt: this.prompt, text: text + suffix });
    this.trim();
  }

  private trim(): void {
    if (this.lines.length > SCROLLBACK_LIMIT) this.lines = this.lines.slice(this.lines.length - SCROLLBACK_LIMIT);
    else this.lines = this.lines.slice();
  }

  clearScreen(): void {
    this.lines = [];
  }

  /**
   * Re-read the prompt (tab activated). Until D7 (one sim shell per tab) lands all tabs share the sim session,
   * so another tab's `cd`/`ssh` changes this tab's prompt too.
   */
  refreshPrompt(): void {
    if (this.busy || this.nano) return;
    const p = termApi.prompt(this.id);
    if (p === this.prompt) return;
    this.prompt = p;
    if (!this.embedded) this.title = titleFromPrompt(this.prompt, this.title);
    this.changed();
  }

  /* ───────────── input helpers ───────────── */

  setInput(next: LineState): void {
    this.input = next;
    this.histPos = null;
  }

  /** Put text in the input line without executing (params.command / hints). */
  prefill(command: string): void {
    this.input = { text: command, cursor: command.length };
    this.histPos = null;
    this.changed();
  }

  get busy(): boolean {
    return this.jobId !== null;
  }

  /* ───────────── submit ───────────── */

  submit(): void {
    if (this.busy) return;
    const line = this.input.text;
    this.pushPromptLine(line);
    this.input = { text: '', cursor: 0 };
    this.histPos = null;
    this.search = null;
    this.lastKeyWasTab = false;
    if (line.trim() && this.history[this.history.length - 1] !== line) this.history.push(line);
    this.run(line);
    this.changed();
  }

  private currentHost(): string | null {
    try {
      return getState().lab.workstation?.sshHostId ?? null;
    } catch {
      return null;
    }
  }

  private currentCwd(): string {
    const p = parsePrompt(this.prompt);
    if (this.currentHost() === null) {
      try {
        return getState().lab.workstation?.cwd || p.path || '~';
      } catch {
        return p.path ?? '~';
      }
    }
    return p.path ?? '~';
  }

  private run(line: string): void {
    const trimmed = line.trim();
    const host = this.currentHost();
    const cwd = this.currentCwd();
    if (trimmed) emitAppAction('terminal', 'terminal.command.submitted', { tab: this.tabNumber, line, host, cwd });
    if (!trimmed) {
      this.prompt = termApi.prompt(this.id);
      return;
    }
    // `exit` in a local (non-ssh) session closes the tab (Apps §5.2).
    if (host === null && /^(exit|logout)(\s+\d+)?$/.test(trimmed) && parsePrompt(this.prompt).shell === 'bash') {
      this.onExit?.();
      return;
    }
    const shell = parsePrompt(this.prompt).shell;
    const nanoMatch = shell === 'bash' || shell === 'unknown' ? /^(sudo\s+)?nano(\s+-\S+)*\s+(\S.*)$/.exec(trimmed) : null;
    if (nanoMatch) {
      this.openNano(nanoMatch[3].trim().replace(/^["']|["']$/g, ''), !!nanoMatch[1]);
      return;
    }
    if ((shell === 'bash' || shell === 'unknown') && /^(sudo\s+)?nano\s*$/.test(trimmed)) {
      this.openNano('', !!/^sudo/.test(trimmed));
      return;
    }
    const res = termApi.exec(line, this.id);
    if (res.clear) this.clearScreen();
    this.append(res.lines);
    this.prompt = res.prompt;
    if (!this.embedded) this.title = titleFromPrompt(this.prompt, this.title);
    if (res.streamingJobId) this.startJob(res.streamingJobId, line);
  }

  /* ───────────── streaming jobs ───────────── */

  private startJob(jobId: string, line: string): void {
    this.jobId = jobId;
    this.jobLine = line;
    this.stopPolling();
    this.pollTimer = setInterval(() => this.pollOnce(), POLL_MS);
  }

  pollOnce(): void {
    if (!this.jobId) return;
    // Streams advance only while the game is not paused (Apps §5.2).
    try {
      if ((getState().ui as { overlay?: { kind?: string } } | undefined)?.overlay?.kind === 'pause') return;
    } catch {
      /* no ui state (tests) */
    }
    const r = termApi.poll(this.jobId, this.id);
    if (r.lines.length) this.append(r.lines);
    if (r.done) this.finishJob();
    else if (r.lines.length) this.changed();
  }

  private finishJob(): void {
    this.jobId = null;
    this.jobLine = '';
    this.stopPolling();
    this.prompt = termApi.prompt(this.id);
    if (!this.embedded) this.title = titleFromPrompt(this.prompt, this.title);
    this.changed();
    this.drainPaste();
  }

  private stopPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.interruptTimer) clearTimeout(this.interruptTimer);
    this.interruptTimer = null;
  }

  /** Ctrl+C without a selection. */
  interrupt(): void {
    this.search = null;
    if (this.jobId) {
      const jobId = this.jobId;
      const line = this.jobLine;
      this.append([{ text: '^C', kind: 'out' }]);
      termApi.interrupt(jobId, this.id);
      emitAppAction('terminal', 'terminal.interrupted', { tab: this.tabNumber, line });
      this.pasteQueue = [];
      this.pollOnce();
      if (this.jobId === jobId) {
        // The sim gets a moment to print the command's own epilogue (ping statistics); then give up.
        this.interruptTimer = setTimeout(() => {
          if (this.jobId === jobId) this.finishJob();
        }, INTERRUPT_GRACE_MS);
      }
      this.changed();
      return;
    }
    const line = this.input.text;
    this.pushPromptLine(line, '^C');
    this.input = { text: '', cursor: 0 };
    this.histPos = null;
    emitAppAction('terminal', 'terminal.interrupted', { tab: this.tabNumber, line });
    this.changed();
  }

  /* ───────────── nano ───────────── */

  private openNano(path: string, sudo: boolean): void {
    const target = openNanoTarget(path, this.prompt, sudo);
    this.nano = new NanoModel({
      path: target.displayPath,
      contents: target.contents,
      save: (p, text) => target.save(p, text),
      onExit: () => {
        this.nano = null;
        this.prompt = termApi.prompt(this.id);
        this.changed();
      },
    });
  }

  /* ───────────── paste ───────────── */

  /** Insert pasted text; complete lines are executed in order (typeahead while a job runs). */
  pasteText(text: string): void {
    const norm = text.replace(/\r\n?/g, '\n');
    if (this.nano) {
      this.nano.paste(norm);
      this.changed();
      return;
    }
    const parts = norm.split('\n');
    if (parts.length === 1) {
      this.setInput(insertText(this.input, parts[0]));
      this.changed();
      return;
    }
    this.setInput(insertText(this.input, parts[0]));
    this.pasteQueue.push(...parts.slice(1));
    // Every part except the last is terminated by a newline → executed.
    this.submit();
    this.drainPaste();
  }

  private drainPaste(): void {
    while (!this.busy && !this.nano && this.pasteQueue.length) {
      const next = this.pasteQueue.shift() ?? '';
      if (this.pasteQueue.length === 0) {
        this.setInput(insertText(this.input, next));
        this.changed();
        return;
      }
      this.setInput(insertText(this.input, next));
      this.submit();
    }
  }

  /* ───────────── keys ───────────── */

  /**
   * Line-editing keys (the view handles copy/paste, scrolling and tab switching first).
   * Returns true when the key was consumed.
   */
  handleKey(k: KeyLike, opts: { tabCompletion: boolean; keyboardLocked: boolean }): boolean {
    if (this.nano) {
      const consumed = this.nano.handleKey({ key: k.key, ctrl: k.ctrl, alt: k.alt, shift: k.shift });
      this.changed();
      return consumed;
    }
    const wasTab = this.lastKeyWasTab;
    this.lastKeyWasTab = false;
    if (this.search) return this.searchKey(k);
    const key = k.key;
    const lower = key.toLowerCase();
    if (this.busy) {
      // Output is streaming: only Ctrl+C (handled by the view) and Ctrl+L act; other keys are swallowed.
      if (k.ctrl && lower === 'l') {
        this.clearScreen();
        this.changed();
      }
      return key !== 'Escape' && !(k.ctrl && k.shift);
    }
    if (k.ctrl && !k.alt && !k.meta) {
      switch (lower) {
        case 'a':
          this.setInput(moveHome(this.input));
          break;
        case 'e':
          this.setInput(moveEnd(this.input));
          break;
        case 'b':
          this.setInput(moveLeft(this.input));
          break;
        case 'f':
          this.setInput(moveRight(this.input));
          break;
        case 'u': {
          const r = killToStart(this.input);
          this.killRing = r.killed || this.killRing;
          this.setInput(r);
          break;
        }
        case 'k': {
          const r = killToEnd(this.input);
          this.killRing = r.killed || this.killRing;
          this.setInput(r);
          break;
        }
        case 'w': {
          const r = killPrevWord(this.input);
          this.killRing = r.killed || this.killRing;
          this.setInput(r);
          break;
        }
        case 'y':
          if (this.killRing) this.setInput(insertText(this.input, this.killRing));
          break;
        case 'd':
          if (!this.input.text) {
            this.input = { text: 'exit', cursor: 4 };
            this.submit();
            return true;
          }
          this.setInput(deleteForward(this.input));
          break;
        case 'l':
          termApi.exec('clear', this.id);
          this.clearScreen();
          break;
        case 'r':
          this.search = { query: '', index: -1, failing: false, original: { ...this.input } };
          break;
        case 'arrowleft':
          this.setInput(wordLeft(this.input));
          break;
        case 'arrowright':
          this.setInput(wordRight(this.input));
          break;
        case 'h':
          this.setInput(backspace(this.input));
          break;
        default:
          return false;
      }
      this.changed();
      return true;
    }
    if (k.alt && !k.ctrl) {
      if (key === 'Backspace') {
        const r = killPrevAlnumWord(this.input);
        this.killRing = r.killed || this.killRing;
        this.setInput(r);
      } else if (lower === 'b') this.setInput(wordLeft(this.input));
      else if (lower === 'f') this.setInput(wordRight(this.input));
      else return false;
      this.changed();
      return true;
    }
    switch (key) {
      case 'Enter':
        this.submit();
        return true;
      case 'Backspace':
        this.setInput(backspace(this.input));
        break;
      case 'Delete':
        this.setInput(deleteForward(this.input));
        break;
      case 'ArrowLeft':
        this.setInput(moveLeft(this.input));
        break;
      case 'ArrowRight':
        this.setInput(moveRight(this.input));
        break;
      case 'Home':
        this.setInput(moveHome(this.input));
        break;
      case 'End':
        this.setInput(moveEnd(this.input));
        break;
      case 'ArrowUp':
        this.historyUp();
        break;
      case 'ArrowDown':
        this.historyDown();
        break;
      case 'Tab':
        if (opts.tabCompletion) this.complete(wasTab);
        break;
      case 'Escape':
        return false;
      default:
        if (key.length === 1 && !k.meta) {
          this.setInput(insertText(this.input, key));
          break;
        }
        return false;
    }
    this.changed();
    return true;
  }

  private historyUp(): void {
    if (!this.history.length) return;
    if (this.histPos === null) {
      this.histDraft = { ...this.input };
      this.histPos = this.history.length - 1;
    } else if (this.histPos > 0) this.histPos--;
    const t = this.history[this.histPos];
    this.input = { text: t, cursor: t.length };
  }

  private historyDown(): void {
    if (this.histPos === null) return;
    if (this.histPos < this.history.length - 1) {
      this.histPos++;
      const t = this.history[this.histPos];
      this.input = { text: t, cursor: t.length };
    } else {
      this.histPos = null;
      this.input = { ...this.histDraft };
    }
  }

  private complete(secondTab: boolean): void {
    const before = this.input.text.slice(0, this.input.cursor);
    const candidates = termApi.complete(before, this.id);
    const out = applyCompletion(this.input, candidates);
    if (out.changed) this.setInput(out.next);
    if (out.candidates.length > 1) {
      if (secondTab && !out.changed) {
        this.pushPromptLine(this.input.text);
        this.append(formatColumns(out.candidates).map((text) => ({ text, kind: 'out' })));
      } else this.lastKeyWasTab = true;
    }
  }

  /** Text shown for reverse-i-search (`(reverse-i-search)'adb': adb connect 10.42.30.32:5444`). */
  searchMatch(): string {
    if (!this.search || this.search.index < 0) return '';
    return this.history[this.search.index] ?? '';
  }

  private findOlder(query: string, fromIndex: number): number {
    for (let i = Math.min(fromIndex, this.history.length - 1); i >= 0; i--) {
      if (this.history[i].includes(query)) return i;
    }
    return -1;
  }

  private searchKey(k: KeyLike): boolean {
    const s = this.search;
    if (!s) return false;
    const lower = k.key.toLowerCase();
    if (k.ctrl && (lower === 'c' || lower === 'g')) {
      this.input = s.original;
      this.search = null;
    } else if (k.ctrl && lower === 'r') {
      if (s.query) {
        const idx = this.findOlder(s.query, (s.index < 0 ? this.history.length : s.index) - 1);
        if (idx >= 0) s.index = idx;
        else s.failing = true;
      }
    } else if (k.key === 'Enter') {
      const m = this.searchMatch();
      this.search = null;
      this.input = { text: m || s.original.text, cursor: (m || s.original.text).length };
      this.submit();
      return true;
    } else if (k.key === 'Backspace') {
      s.query = s.query.slice(0, -1);
      s.failing = false;
      s.index = s.query ? this.findOlder(s.query, this.history.length - 1) : -1;
    } else if (k.key.length === 1 && !k.ctrl && !k.alt && !k.meta) {
      s.query += k.key;
      const idx = this.findOlder(s.query, s.index < 0 ? this.history.length - 1 : s.index);
      if (idx >= 0) {
        s.index = idx;
        s.failing = false;
      } else s.failing = true;
    } else if (['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(k.key) || (k.ctrl && (lower === 'a' || lower === 'e'))) {
      const m = this.searchMatch() || s.original.text;
      this.search = null;
      this.input = { text: m, cursor: k.key === 'Home' || (k.ctrl && lower === 'a') ? 0 : m.length };
    } else {
      return false;
    }
    this.changed();
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (this.jobId) termApi.interrupt(this.jobId, this.id);
    this.jobId = null;
    this.stopPolling();
    this.listeners.clear();
  }
}
