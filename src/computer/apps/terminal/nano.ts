/**
 * GNU nano 7.2 buffer model (Apps §5.5). The terminal intercepts `nano <path>` / `sudo nano <path>` and
 * switches the tab into this editor; the view (`NanoView.tsx`) renders it and forwards keys here.
 * Pure TypeScript (no React) so it is unit-testable; saving goes through the `save` callback supplied by
 * the session (`sim.host.writeFile` / `sim.git.writeFile`).
 */

export interface NanoSaveResult {
  ok: boolean;
  error?: string;
}

export interface NanoOptions {
  /** Path as shown in the title bar and the Write Out prompt (`/etc/robot-controller/controller.yaml`). */
  path: string;
  /** Initial contents, or null for a file that does not exist (`[ New File ]`). */
  contents: string | null;
  save: (path: string, text: string) => NanoSaveResult;
  /** Called when the editor exits (`Ctrl+X`). */
  onExit: () => void;
}

export type NanoMode =
  | { kind: 'edit' }
  | { kind: 'writeOut'; input: string; cursor: number; exitAfter: boolean }
  | { kind: 'confirmExit' }
  | { kind: 'search'; input: string; cursor: number }
  | { kind: 'gotoLine'; input: string; cursor: number };

export interface NanoKey {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
}

export class NanoModel {
  path: string;
  lines: string[];
  row = 0;
  col = 0;
  /** Remembered column for vertical movement. */
  wantCol = 0;
  top = 0;
  modified = false;
  status: string;
  mode: NanoMode = { kind: 'edit' };
  isNew: boolean;
  private cutBuffer: string[] = [];
  private lastWasCut = false;
  private lastSearch = '';
  private readonly saveFn: NanoOptions['save'];
  private readonly exitFn: () => void;
  /** Rows of buffer currently visible (set by the view). */
  viewRows = 20;
  version = 0;

  constructor(o: NanoOptions) {
    this.path = o.path;
    this.saveFn = o.save;
    this.exitFn = o.onExit;
    this.isNew = o.contents === null;
    this.lines = splitLines(o.contents ?? '');
    const n = countLines(o.contents ?? '');
    this.status = this.isNew ? '[ New File ]' : `[ Read ${n} line${n === 1 ? '' : 's'} ]`;
  }

  get text(): string {
    return joinLines(this.lines);
  }

  private touch() {
    this.version++;
  }

  private setStatus(s: string) {
    this.status = s;
  }

  private clampCursor() {
    this.row = Math.max(0, Math.min(this.row, this.lines.length - 1));
    this.col = Math.max(0, Math.min(this.col, this.lines[this.row].length));
  }

  private ensureVisible() {
    const rows = Math.max(1, this.viewRows);
    if (this.row < this.top) this.top = this.row;
    if (this.row >= this.top + rows) this.top = this.row - rows + 1;
    this.top = Math.max(0, this.top);
  }

  private edited() {
    if (!this.modified) this.modified = true;
    this.lastWasCut = false;
  }

  /** Handle a key; returns true when consumed (nano consumes every key, including Esc). */
  handleKey(k: NanoKey): boolean {
    switch (this.mode.kind) {
      case 'edit':
        this.editKey(k);
        break;
      case 'confirmExit':
        this.confirmKey(k);
        break;
      default:
        this.promptKey(k);
    }
    this.clampCursor();
    this.ensureVisible();
    this.touch();
    return true;
  }

  /** Text pasted from the clipboard (inserted at the cursor, newlines split lines). */
  paste(text: string) {
    if (this.mode.kind !== 'edit') {
      const m = this.mode;
      if (m.kind === 'writeOut' || m.kind === 'search' || m.kind === 'gotoLine') {
        const t = text.split('\n')[0];
        m.input = m.input.slice(0, m.cursor) + t + m.input.slice(m.cursor);
        m.cursor += t.length;
      }
      this.touch();
      return;
    }
    this.insert(text.replace(/\r\n?/g, '\n'));
    this.ensureVisible();
    this.touch();
  }

  private insert(text: string) {
    const parts = text.split('\n');
    const line = this.lines[this.row];
    const head = line.slice(0, this.col);
    const tail = line.slice(this.col);
    if (parts.length === 1) {
      this.lines[this.row] = head + parts[0] + tail;
      this.col += parts[0].length;
    } else {
      const newLines = [head + parts[0], ...parts.slice(1, -1), parts[parts.length - 1] + tail];
      this.lines.splice(this.row, 1, ...newLines);
      this.row += parts.length - 1;
      this.col = parts[parts.length - 1].length;
    }
    this.wantCol = this.col;
    this.edited();
  }

  private editKey(k: NanoKey) {
    const key = k.key;
    if (k.ctrl && !k.alt) {
      switch (key.toLowerCase()) {
        case 'o':
          this.mode = { kind: 'writeOut', input: this.path, cursor: this.path.length, exitAfter: false };
          return;
        case 'x':
          if (this.modified) this.mode = { kind: 'confirmExit' };
          else this.exitFn();
          return;
        case 'w':
          this.mode = { kind: 'search', input: '', cursor: 0 };
          return;
        case 'k':
          this.cutLine();
          return;
        case 'u':
          this.uncut();
          return;
        case 'c':
          this.setStatus(this.location());
          return;
        case 'g':
          this.setStatus('[ ^O Write Out · ^X Exit · ^W Where Is · ^K Cut · ^U Paste · ^C Location · ^/ Go To Line ]');
          return;
        case '/':
        case '_':
          this.mode = { kind: 'gotoLine', input: '', cursor: 0 };
          return;
        case 'a':
          this.col = 0;
          this.wantCol = 0;
          return;
        case 'e':
          this.col = this.lines[this.row].length;
          this.wantCol = this.col;
          return;
        case 'r':
        case 't':
        case '\\':
        case 'j':
          this.setStatus('[ Restricted mode — function disabled ]');
          return;
        case 'home':
          this.row = 0;
          this.col = 0;
          return;
        case 'end':
          this.row = this.lines.length - 1;
          this.col = this.lines[this.row].length;
          return;
        default:
          return;
      }
    }
    switch (key) {
      case 'ArrowLeft':
        if (this.col > 0) this.col--;
        else if (this.row > 0) {
          this.row--;
          this.col = this.lines[this.row].length;
        }
        this.wantCol = this.col;
        return;
      case 'ArrowRight':
        if (this.col < this.lines[this.row].length) this.col++;
        else if (this.row < this.lines.length - 1) {
          this.row++;
          this.col = 0;
        }
        this.wantCol = this.col;
        return;
      case 'ArrowUp':
        if (this.row > 0) this.row--;
        this.col = Math.min(this.wantCol, this.lines[this.row].length);
        return;
      case 'ArrowDown':
        if (this.row < this.lines.length - 1) this.row++;
        this.col = Math.min(this.wantCol, this.lines[this.row].length);
        return;
      case 'PageUp':
        this.row = Math.max(0, this.row - Math.max(1, this.viewRows - 2));
        this.top = Math.max(0, this.top - Math.max(1, this.viewRows - 2));
        this.col = Math.min(this.wantCol, this.lines[this.row].length);
        return;
      case 'PageDown':
        this.row = Math.min(this.lines.length - 1, this.row + Math.max(1, this.viewRows - 2));
        this.top = Math.min(Math.max(0, this.lines.length - 1), this.top + Math.max(1, this.viewRows - 2));
        this.col = Math.min(this.wantCol, this.lines[this.row].length);
        return;
      case 'Home':
        this.col = 0;
        this.wantCol = 0;
        return;
      case 'End':
        this.col = this.lines[this.row].length;
        this.wantCol = this.col;
        return;
      case 'Enter':
        this.insert('\n');
        return;
      case 'Tab':
        this.insert('\t');
        return;
      case 'Backspace':
        if (this.col > 0) {
          const l = this.lines[this.row];
          this.lines[this.row] = l.slice(0, this.col - 1) + l.slice(this.col);
          this.col--;
          this.edited();
        } else if (this.row > 0) {
          const prev = this.lines[this.row - 1];
          this.lines.splice(this.row - 1, 2, prev + this.lines[this.row]);
          this.row--;
          this.col = prev.length;
          this.edited();
        }
        this.wantCol = this.col;
        return;
      case 'Delete':
        if (this.col < this.lines[this.row].length) {
          const l = this.lines[this.row];
          this.lines[this.row] = l.slice(0, this.col) + l.slice(this.col + 1);
          this.edited();
        } else if (this.row < this.lines.length - 1) {
          this.lines.splice(this.row, 2, this.lines[this.row] + this.lines[this.row + 1]);
          this.edited();
        }
        return;
      case 'Escape':
        return;
      default:
        if (key.length === 1 && !k.ctrl && !k.alt) this.insert(key);
    }
  }

  private cutLine() {
    if (!this.lastWasCut) this.cutBuffer = [];
    if (this.lines.length === 1) {
      this.cutBuffer.push(this.lines[0]);
      this.lines[0] = '';
    } else {
      this.cutBuffer.push(...this.lines.splice(this.row, 1));
      if (this.row >= this.lines.length) this.row = this.lines.length - 1;
    }
    this.col = 0;
    this.modified = true;
    this.lastWasCut = true;
  }

  private uncut() {
    if (!this.cutBuffer.length) {
      this.setStatus('[ Cutbuffer is empty ]');
      return;
    }
    this.lines.splice(this.row, 0, ...this.cutBuffer);
    this.row += this.cutBuffer.length;
    this.col = 0;
    this.modified = true;
    this.lastWasCut = false;
  }

  private location(): string {
    const total = this.lines.length;
    const line = this.row + 1;
    const lineLen = this.lines[this.row].length + 1;
    const col = this.col + 1;
    let charIdx = 0;
    for (let i = 0; i < this.row; i++) charIdx += this.lines[i].length + 1;
    charIdx += this.col + 1;
    const chars = this.text.length || 1;
    const pct = (a: number, b: number) => Math.round((a / Math.max(1, b)) * 100);
    return `[ line ${line}/${total} (${pct(line, total)}%), col ${col}/${lineLen} (${pct(col, lineLen)}%), char ${charIdx}/${chars} (${pct(charIdx, chars)}%) ]`;
  }

  private confirmKey(k: NanoKey) {
    const key = k.key.toLowerCase();
    if (key === 'y') {
      this.mode = { kind: 'writeOut', input: this.path, cursor: this.path.length, exitAfter: true };
    } else if (key === 'n') {
      this.mode = { kind: 'edit' };
      this.exitFn();
    } else if ((k.ctrl && key === 'c') || key === 'escape') {
      this.mode = { kind: 'edit' };
      this.setStatus('[ Cancelled ]');
    }
  }

  private promptKey(k: NanoKey) {
    const m = this.mode;
    if (m.kind !== 'writeOut' && m.kind !== 'search' && m.kind !== 'gotoLine') return;
    const key = k.key;
    if ((k.ctrl && key.toLowerCase() === 'c') || key === 'Escape') {
      this.mode = { kind: 'edit' };
      this.setStatus('[ Cancelled ]');
      return;
    }
    if (key === 'Enter') {
      this.submitPrompt(m);
      return;
    }
    if (key === 'Backspace') {
      if (m.cursor > 0) {
        m.input = m.input.slice(0, m.cursor - 1) + m.input.slice(m.cursor);
        m.cursor--;
      }
      return;
    }
    if (key === 'Delete') {
      m.input = m.input.slice(0, m.cursor) + m.input.slice(m.cursor + 1);
      return;
    }
    if (key === 'ArrowLeft') m.cursor = Math.max(0, m.cursor - 1);
    else if (key === 'ArrowRight') m.cursor = Math.min(m.input.length, m.cursor + 1);
    else if (key === 'Home' || (k.ctrl && key.toLowerCase() === 'a')) m.cursor = 0;
    else if (key === 'End' || (k.ctrl && key.toLowerCase() === 'e')) m.cursor = m.input.length;
    else if (key.length === 1 && !k.ctrl && !k.alt) {
      m.input = m.input.slice(0, m.cursor) + key + m.input.slice(m.cursor);
      m.cursor++;
    }
  }

  private submitPrompt(m: Extract<NanoMode, { kind: 'writeOut' | 'search' | 'gotoLine' }>) {
    if (m.kind === 'writeOut') {
      const target = m.input.trim();
      if (!target) {
        this.mode = { kind: 'edit' };
        this.setStatus('[ Cancelled ]');
        return;
      }
      const res = this.saveFn(target, this.text);
      this.mode = { kind: 'edit' };
      if (res.ok) {
        this.path = target;
        this.modified = false;
        this.isNew = false;
        const n = countLines(this.text);
        this.setStatus(`[ Wrote ${n} line${n === 1 ? '' : 's'} ]`);
        if (m.exitAfter) this.exitFn();
      } else {
        this.setStatus(`[ Error writing ${target}: ${res.error ?? 'Permission denied'} ]`);
      }
      return;
    }
    if (m.kind === 'search') {
      const q = m.input || this.lastSearch;
      this.mode = { kind: 'edit' };
      if (!q) {
        this.setStatus('[ Cancelled ]');
        return;
      }
      this.lastSearch = q;
      this.findNext(q);
      return;
    }
    const [lineStr, colStr] = m.input.split(/[,\s]+/);
    this.mode = { kind: 'edit' };
    const ln = Number.parseInt(lineStr, 10);
    if (!Number.isFinite(ln)) {
      this.setStatus('[ Invalid line or column number ]');
      return;
    }
    this.row = Math.max(0, Math.min(this.lines.length - 1, ln - 1));
    const cn = Number.parseInt(colStr ?? '1', 10);
    this.col = Number.isFinite(cn) ? Math.max(0, cn - 1) : 0;
    this.wantCol = this.col;
  }

  private findNext(q: string) {
    const n = this.lines.length;
    for (let i = 0; i <= n; i++) {
      const r = (this.row + i) % n;
      const from = i === 0 ? this.col + 1 : 0;
      const idx = this.lines[r].indexOf(q, from);
      if (idx >= 0) {
        if (i === n || (i > 0 && r <= this.row && this.row + i >= n)) this.setStatus('[ Search Wrapped ]');
        this.row = r;
        this.col = idx;
        this.wantCol = idx;
        return;
      }
    }
    this.setStatus(`[ "${q}" not found ]`);
  }
}

/** Split file contents into editor lines (a trailing newline yields nano's empty last line). */
export function splitLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  return lines.length ? lines : [''];
}

/** Join editor lines into file contents; nano terminates a non-empty last line with a newline. */
export function joinLines(lines: string[]): string {
  const body = lines.join('\n');
  if (!body) return '';
  return lines[lines.length - 1] === '' ? body : `${body}\n`;
}

/** Number of lines nano reports for a file (`[ Read 13 lines ]`). */
export function countLines(text: string): number {
  if (!text) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}
