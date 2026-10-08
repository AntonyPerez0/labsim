/**
 * Pure editing operations of the IDE editor (Apps §4.5): indent/outdent, smart Enter, auto-closed pairs,
 * duplicate/delete line, toggle comment, move line/statement, reformat. Every op maps
 * `{ text, start, end }` → a new `{ text, start, end }` (or null when it does not apply).
 */

export interface EdState {
  text: string;
  /** Selection start/end offsets (start ≤ end); caret = end when collapsed. */
  start: number;
  end: number;
}

export interface LineInfo {
  index: number;
  start: number;
  end: number;
  text: string;
}

export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) out.push(i + 1);
  return out;
}

export function lineIndexAt(text: string, pos: number): number {
  let n = 0;
  for (let i = 0; i < pos && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

export function lineAt(text: string, pos: number): LineInfo {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  let end = text.indexOf('\n', pos);
  if (end < 0) end = text.length;
  return { index: lineIndexAt(text, start), start, end, text: text.slice(start, end) };
}

/** 1-based line and column of an offset. */
export function posToLineCol(text: string, pos: number): { line: number; col: number } {
  const l = lineAt(text, pos);
  return { line: l.index + 1, col: pos - l.start + 1 };
}

export function lineColToPos(text: string, line: number, col = 1): number {
  const starts = lineStarts(text);
  const li = Math.max(0, Math.min(starts.length - 1, line - 1));
  const s = starts[li];
  const e = li + 1 < starts.length ? starts[li + 1] - 1 : text.length;
  return Math.min(e, s + Math.max(0, col - 1));
}

function replace(st: EdState, from: number, to: number, ins: string, caret?: number, caretEnd?: number): EdState {
  const text = st.text.slice(0, from) + ins + st.text.slice(to);
  const c = caret ?? from + ins.length;
  return { text, start: c, end: caretEnd ?? c };
}

export function insert(st: EdState, s: string): EdState {
  return replace(st, st.start, st.end, s);
}

/** Lines covered by the selection (a selection ending at column 0 does not include that line). */
function coveredLines(st: EdState): { first: number; last: number; from: number; to: number } {
  const starts = lineStarts(st.text);
  const first = lineIndexAt(st.text, st.start);
  let last = lineIndexAt(st.text, st.end);
  if (last > first && starts[last] === st.end) last--;
  const from = starts[first];
  const to = last + 1 < starts.length ? starts[last + 1] - 1 : st.text.length;
  return { first, last, from, to };
}

export function leadingWs(line: string): string {
  return /^[ \t]*/.exec(line)![0];
}

export function indentLines(st: EdState, unit: string): EdState {
  if (st.start === st.end || !st.text.slice(st.start, st.end).includes('\n')) {
    // Tab inside a line: insert spaces to the next indent stop.
    const l = lineAt(st.text, st.start);
    const col = st.start - l.start;
    const pad = unit.length - (col % unit.length);
    return replace(st, st.start, st.end, ' '.repeat(pad));
  }
  const { from, to } = coveredLines(st);
  const block = st.text.slice(from, to);
  const lines = block.split('\n');
  const out = lines.map((l) => (l.trim() ? unit + l : l)).join('\n');
  const text = st.text.slice(0, from) + out + st.text.slice(to);
  return { text, start: st.start + (lines[0].trim() ? unit.length : 0), end: st.end + (out.length - block.length) };
}

export function outdentLines(st: EdState, unit: string): EdState {
  const { from, to } = coveredLines(st);
  const block = st.text.slice(from, to);
  const lines = block.split('\n');
  let firstRemoved = 0;
  const out = lines
    .map((l, i) => {
      const ws = leadingWs(l);
      const n = Math.min(ws.length, unit.length);
      if (i === 0) firstRemoved = n;
      return l.slice(n);
    })
    .join('\n');
  const text = st.text.slice(0, from) + out + st.text.slice(to);
  const start = Math.max(from, st.start - firstRemoved);
  return { text, start, end: Math.max(start, st.end - (block.length - out.length)) };
}

const OPEN_TO_CLOSE: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
const CLOSERS = new Set([')', ']', '}']);

/** Smart Enter: keep indentation, +1 level after `{`/`[`/`(`, and split `{|}` onto three lines. */
export function smartEnter(st: EdState, unit: string): EdState {
  const l = lineAt(st.text, st.start);
  const before = st.text.slice(l.start, st.start);
  const after = st.text.slice(st.end, l.end);
  const ws = leadingWs(l.text);
  const lastCh = before.trimEnd().slice(-1);
  const opens = lastCh === '{' || lastCh === '[' || lastCh === '(';
  const inner = opens ? ws + unit : ws;
  const firstAfter = after.trimStart()[0];
  if (opens && firstAfter && firstAfter === OPEN_TO_CLOSE[lastCh]) {
    const ins = `\n${inner}\n${ws}`;
    const trimmedAfter = after.trimStart();
    const text = st.text.slice(0, st.start) + ins + trimmedAfter + st.text.slice(l.end);
    const caret = st.start + 1 + inner.length;
    return { text, start: caret, end: caret };
  }
  const ins = `\n${inner}`;
  const text = st.text.slice(0, st.start) + ins + after.trimStart() + st.text.slice(l.end);
  const caret = st.start + ins.length;
  return { text, start: caret, end: caret };
}

/** Typed character with auto-closed pairs and type-through of closers. Returns null for default handling. */
export function typeChar(st: EdState, ch: string): EdState | null {
  const next = st.text[st.end] ?? '';
  if (st.start === st.end && (CLOSERS.has(ch) || ch === '"' || ch === "'") && next === ch) {
    return { text: st.text, start: st.end + 1, end: st.end + 1 };
  }
  const close = OPEN_TO_CLOSE[ch];
  if (!close) return null;
  if (st.start !== st.end) {
    // Wrap the selection.
    const sel = st.text.slice(st.start, st.end);
    return replace(st, st.start, st.end, ch + sel + close, st.start + 1, st.start + 1 + sel.length);
  }
  const prev = st.text[st.start - 1] ?? '';
  if ((ch === '"' || ch === "'") && /[\w\\]/.test(prev)) return null;
  if (next && !/[\s)\]},;:]/.test(next)) return null;
  return replace(st, st.start, st.end, ch + close, st.start + 1);
}

/** Backspace that deletes an empty auto-closed pair `(|)`. */
export function backspacePair(st: EdState): EdState | null {
  if (st.start !== st.end || st.start === 0) return null;
  const prev = st.text[st.start - 1];
  const next = st.text[st.start];
  if (OPEN_TO_CLOSE[prev] && OPEN_TO_CLOSE[prev] === next) return replace(st, st.start - 1, st.start + 1, '', st.start - 1);
  return null;
}

/** Ctrl+D: duplicate the selection, or the caret line. */
export function duplicate(st: EdState): EdState {
  if (st.start !== st.end) {
    const sel = st.text.slice(st.start, st.end);
    return replace(st, st.end, st.end, sel, st.end, st.end + sel.length);
  }
  const { from, to } = coveredLines(st);
  const block = st.text.slice(from, to);
  const caret = st.start + block.length + 1;
  return replace(st, to, to, `\n${block}`, caret);
}

/** Ctrl+Y: delete the lines covered by the selection. */
export function deleteLines(st: EdState): EdState {
  const { from, to } = coveredLines(st);
  const hasNext = to < st.text.length;
  const delFrom = hasNext ? from : Math.max(0, from - 1);
  const delTo = hasNext ? to + 1 : to;
  const text = st.text.slice(0, delFrom) + st.text.slice(delTo);
  const caret = Math.min(delFrom === from ? from : delFrom + 1, text.length);
  const l = lineAt(text, Math.min(caret, text.length));
  const col = Math.min(st.start - lineAt(st.text, st.start).start, l.text.length);
  const pos = l.start + col;
  return { text, start: pos, end: pos };
}

/** Ctrl+/: toggle a line comment on the covered lines (IntelliJ default: comment at the first column). */
export function toggleLineComment(st: EdState, prefix: string): EdState {
  const { from, to } = coveredLines(st);
  const block = st.text.slice(from, to);
  const lines = block.split('\n');
  const nonEmpty = lines.filter((l) => l.trim());
  const allCommented = nonEmpty.length > 0 && nonEmpty.every((l) => l.trimStart().startsWith(prefix));
  let firstDelta = 0;
  const out = lines
    .map((l, i) => {
      if (allCommented) {
        const idx = l.indexOf(prefix);
        if (idx < 0) return l;
        const rm = l.slice(idx + prefix.length).startsWith(' ') && prefix === '#' ? prefix.length + 1 : prefix.length;
        if (i === 0) firstDelta = -rm;
        return l.slice(0, idx) + l.slice(idx + rm);
      }
      if (!l.trim() && lines.length > 1) return l;
      if (i === 0) firstDelta = prefix.length;
      return prefix + l;
    })
    .join('\n');
  const text = st.text.slice(0, from) + out + st.text.slice(to);
  const single = st.start === st.end && lines.length === 1;
  if (single) {
    // IntelliJ moves the caret to the next line after commenting a single line.
    const nextStart = from + out.length + 1;
    const pos = nextStart <= text.length ? Math.min(nextStart + Math.max(0, st.start - from), lineAt(text, Math.min(nextStart, text.length)).end) : text.length;
    return { text, start: pos, end: pos };
  }
  return { text, start: Math.max(from, st.start + firstDelta), end: st.end + (out.length - block.length) };
}

/** Alt+Shift+↑/↓: move the covered lines one line up/down. */
export function moveLines(st: EdState, dir: -1 | 1): EdState | null {
  const lines = st.text.split('\n');
  const { first, last } = coveredLines(st);
  if ((dir < 0 && first === 0) || (dir > 0 && last >= lines.length - 1)) return null;
  return moveRange(st, lines, first, last, dir < 0 ? [first - 1, first - 1] : [last + 1, last + 1]);
}

function moveRange(st: EdState, lines: string[], first: number, last: number, other: [number, number]): EdState {
  const block = lines.slice(first, last + 1);
  const target = lines.slice(other[0], other[1] + 1);
  const before = Math.min(first, other[0]);
  const after = Math.max(last, other[1]);
  const middle = other[0] < first ? [...block, ...target] : [...target, ...block];
  const out = [...lines.slice(0, before), ...middle, ...lines.slice(after + 1)];
  const text = out.join('\n');
  const shift = other[0] < first ? -(target.join('\n').length + 1) : target.join('\n').length + 1;
  return { text, start: st.start + shift, end: st.end + shift };
}

/** Java statement range around a line: extend until a line ending in `;`, `{` or `}` (or a blank/comment line). */
function statementRange(lines: string[], idx: number): [number, number] {
  let s = idx;
  while (s > 0) {
    const prev = lines[s - 1].trim();
    if (!prev || /[;{}]\s*(\/\/.*)?$/.test(prev) || prev.startsWith('//') || prev.startsWith('@') || prev.startsWith('*')) break;
    s--;
  }
  let e = idx;
  while (e < lines.length - 1) {
    const cur = lines[e].trim();
    if (!cur || /[;{}]\s*(\/\/.*)?$/.test(cur) || cur.startsWith('//')) break;
    e++;
  }
  return [s, e];
}

/** Ctrl+Shift+↑/↓: move statement (Java: whole statement lines; never past the enclosing braces). */
export function moveStatement(st: EdState, dir: -1 | 1, java: boolean): EdState | null {
  if (!java) return moveLines(st, dir);
  const lines = st.text.split('\n');
  const cov = coveredLines(st);
  const [first, last] = cov.first === cov.last ? statementRange(lines, cov.first) : [cov.first, cov.last];
  const neighbour = dir < 0 ? first - 1 : last + 1;
  if (neighbour < 0 || neighbour >= lines.length) return null;
  const nt = lines[neighbour].trim();
  // Do not move a statement out of its block.
  if ((dir < 0 && nt.endsWith('{')) || (dir > 0 && nt.startsWith('}'))) return null;
  const other = nt ? statementRange(lines, neighbour) : ([neighbour, neighbour] as [number, number]);
  return moveRange(st, lines, first, last, other);
}

/** Ctrl+Alt+L: re-indent by braces/brackets (Java/Groovy/JSON); continuation `.call()` lines get +2 levels. */
export function reformat(text: string, unit: string, codeNoise: (t: string) => string): string {
  const clean = codeNoise(text).split('\n');
  const raw = text.split('\n');
  let depth = 0;
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i].trim();
    const c = clean[i].trim();
    if (!line) {
      out.push('');
      continue;
    }
    let d = depth;
    if (/^[}\]]/.test(c)) d = Math.max(0, d - 1);
    const cont = c.startsWith('.') ? 2 : 0;
    out.push(unit.repeat(d + cont) + line);
    for (const ch of c) {
      if (ch === '{' || ch === '[') depth++;
      else if (ch === '}' || ch === ']') depth = Math.max(0, depth - 1);
    }
  }
  return out.join('\n');
}

/** Matching bracket offset for a caret next to a bracket (in code-noise-stripped text), or null. */
export function matchBracket(clean: string, pos: number): [number, number] | null {
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const rev: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (const at of [pos - 1, pos]) {
    const ch = clean[at];
    if (!ch) continue;
    if (pairs[ch]) {
      let depth = 0;
      for (let i = at; i < clean.length; i++) {
        if (clean[i] === ch) depth++;
        else if (clean[i] === pairs[ch] && --depth === 0) return [at, i];
      }
    } else if (rev[ch]) {
      let depth = 0;
      for (let i = at; i >= 0; i--) {
        if (clean[i] === ch) depth++;
        else if (clean[i] === rev[ch] && --depth === 0) return [i, at];
      }
    }
  }
  return null;
}
