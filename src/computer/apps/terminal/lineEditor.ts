/**
 * Readline-style line editing (Apps §5.2 "Input line"). Pure functions over `{ text, cursor }` so the
 * terminal view stays thin and the behaviour is unit-testable.
 */

export interface LineState {
  text: string;
  /** Caret index 0..text.length. */
  cursor: number;
}

export interface KillResult extends LineState {
  /** Text removed (goes to the kill ring for Ctrl+Y). */
  killed: string;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function insertText(s: LineState, ins: string): LineState {
  const c = clamp(s.cursor, 0, s.text.length);
  return { text: s.text.slice(0, c) + ins + s.text.slice(c), cursor: c + ins.length };
}

export function backspace(s: LineState): LineState {
  if (s.cursor <= 0) return s;
  return { text: s.text.slice(0, s.cursor - 1) + s.text.slice(s.cursor), cursor: s.cursor - 1 };
}

export function deleteForward(s: LineState): LineState {
  if (s.cursor >= s.text.length) return s;
  return { text: s.text.slice(0, s.cursor) + s.text.slice(s.cursor + 1), cursor: s.cursor };
}

export function moveLeft(s: LineState): LineState {
  return { ...s, cursor: clamp(s.cursor - 1, 0, s.text.length) };
}

export function moveRight(s: LineState): LineState {
  return { ...s, cursor: clamp(s.cursor + 1, 0, s.text.length) };
}

export function moveHome(s: LineState): LineState {
  return { ...s, cursor: 0 };
}

export function moveEnd(s: LineState): LineState {
  return { ...s, cursor: s.text.length };
}

const isWordChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);

/** Start of the word left of the cursor (bash `backward-word`). */
export function wordLeftIndex(text: string, cursor: number): number {
  let i = clamp(cursor, 0, text.length);
  while (i > 0 && !isWordChar(text[i - 1])) i--;
  while (i > 0 && isWordChar(text[i - 1])) i--;
  return i;
}

/** End of the word right of the cursor (bash `forward-word`). */
export function wordRightIndex(text: string, cursor: number): number {
  let i = clamp(cursor, 0, text.length);
  while (i < text.length && !isWordChar(text[i])) i++;
  while (i < text.length && isWordChar(text[i])) i++;
  return i;
}

export function wordLeft(s: LineState): LineState {
  return { ...s, cursor: wordLeftIndex(s.text, s.cursor) };
}

export function wordRight(s: LineState): LineState {
  return { ...s, cursor: wordRightIndex(s.text, s.cursor) };
}

/** Ctrl+U — kill from the start of the line to the cursor. */
export function killToStart(s: LineState): KillResult {
  return { text: s.text.slice(s.cursor), cursor: 0, killed: s.text.slice(0, s.cursor) };
}

/** Ctrl+K — kill from the cursor to the end of the line. */
export function killToEnd(s: LineState): KillResult {
  return { text: s.text.slice(0, s.cursor), cursor: s.cursor, killed: s.text.slice(s.cursor) };
}

/** Ctrl+W — kill the previous whitespace-delimited word (bash `unix-word-rubout`). */
export function killPrevWord(s: LineState): KillResult {
  let i = s.cursor;
  while (i > 0 && /\s/.test(s.text[i - 1])) i--;
  while (i > 0 && !/\s/.test(s.text[i - 1])) i--;
  return { text: s.text.slice(0, i) + s.text.slice(s.cursor), cursor: i, killed: s.text.slice(i, s.cursor) };
}

/** Alt+Backspace — kill the previous alphanumeric word (bash `backward-kill-word`). */
export function killPrevAlnumWord(s: LineState): KillResult {
  const i = wordLeftIndex(s.text, s.cursor);
  return { text: s.text.slice(0, i) + s.text.slice(s.cursor), cursor: i, killed: s.text.slice(i, s.cursor) };
}

/* ───────────────────────────── Completion helpers ───────────────────────────── */

/** Index where the token under completion starts (after the last unquoted, unescaped space). */
export function tokenStart(before: string): number {
  let quote: string | null = null;
  let start = 0;
  for (let i = 0; i < before.length; i++) {
    const ch = before[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ' ' || ch === '|' || ch === ';' || ch === '&' || ch === '>') start = i + 1;
  }
  return start;
}

export function commonPrefix(items: string[]): string {
  if (!items.length) return '';
  let p = items[0];
  for (const s of items.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
    if (!p) break;
  }
  return p;
}

export interface CompletionOutcome {
  /** New line state (unchanged when nothing could be completed). */
  next: LineState;
  /** Candidates to list (only when ambiguous). Display names (last path segment kept). */
  candidates: string[];
  /** True when the line changed. */
  changed: boolean;
}

/**
 * Apply sim completion candidates to the input. Candidates may be either full replacements of the token
 * under the cursor (`IdeaProjects/`) or full replacements of the whole line before the cursor
 * (`cd IdeaProjects/`) — both shapes are accepted (Apps §5.2 "Tab completion").
 */
export function applyCompletion(s: LineState, raw: string[]): CompletionOutcome {
  const before = s.text.slice(0, s.cursor);
  const after = s.text.slice(s.cursor);
  const uniq = [...new Set(raw.filter((c) => typeof c === 'string' && c.length > 0))];
  if (!uniq.length) return { next: s, candidates: [], changed: false };
  const ts = tokenStart(before);
  const token = before.slice(ts);
  // Whole-line candidates (they contain the text before the token).
  const lineShaped = ts > 0 && uniq.every((c) => c.startsWith(before.slice(0, ts)) && c.length >= ts);
  const toks = lineShaped ? uniq.map((c) => c.slice(ts)) : uniq;
  const matching = toks.filter((c) => c.startsWith(token) || token === '');
  const pool = matching.length ? matching : toks;
  if (pool.length === 1) {
    const one = pool[0];
    const suffix = one.endsWith('/') || one.endsWith('\\') || after.startsWith(' ') ? '' : ' ';
    const text = before.slice(0, ts) + one + suffix + after;
    const cursor = ts + one.length + suffix.length;
    return { next: { text, cursor }, candidates: [], changed: text !== s.text };
  }
  const prefix = commonPrefix(pool);
  if (prefix.length > token.length) {
    const text = before.slice(0, ts) + prefix + after;
    return { next: { text, cursor: ts + prefix.length }, candidates: pool, changed: true };
  }
  return { next: s, candidates: pool, changed: false };
}

/** Lay candidates out in columns like bash (`ls`-style, column-major), for a terminal `cols` wide. */
export function formatColumns(items: string[], cols = 100): string[] {
  if (!items.length) return [];
  const display = items.map((c) => {
    const trimmed = c.replace(/\/$/, '');
    const seg = trimmed.slice(trimmed.lastIndexOf('/') + 1);
    return c.endsWith('/') ? `${seg}/` : seg || c;
  });
  const width = Math.max(...display.map((d) => d.length)) + 2;
  const perRow = Math.max(1, Math.floor(cols / width));
  const rows = Math.ceil(display.length / perRow);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < perRow; c++) {
      const idx = c * rows + r;
      if (idx >= display.length) break;
      line += display[idx].padEnd(width);
    }
    out.push(line.trimEnd());
  }
  return out;
}
