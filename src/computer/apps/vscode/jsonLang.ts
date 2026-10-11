/**
 * VS Code's built-in JSON language support, reduced to what the Pigeon workflow needs:
 *
 *  - `diagnoseJson(text)` — syntax problems with VS Code's wording and codes (`Expected comma json(514)`),
 *    reported where VS Code reports them: at the token AFTER a missing comma, which is why the real
 *    mistake is usually at the end of the previous line. Duplicate keys are warnings. VS Code knows
 *    nothing about Pigeon / LSTR, so an unknown action or a bad `${variable}` is never flagged here.
 *  - `tokenizeLine(...)` — syntax colouring + bracket-pair colours (depth carried across lines).
 */

export type Severity = 'error' | 'warning';

export interface Diagnostic {
  /** Character offsets [from, to) in the document. */
  from: number;
  to: number;
  severity: Severity;
  message: string;
  /** vscode-json-languageservice error code (514 = CommaExpected …). */
  code: number;
}

type TokKind = '{' | '}' | '[' | ']' | ':' | ',' | 'string' | 'number' | 'literal' | 'ident' | 'badstring' | 'invalid' | 'eof';

interface Tok {
  kind: TokKind;
  from: number;
  to: number;
  text: string;
}

function scan(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i]!;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if ('{}[]:,'.includes(c)) {
      out.push({ kind: c as TokKind, from: i, to: i + 1, text: c });
      i++;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let closed = false;
      while (j < n && text[j] !== '\n') {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === '"') {
          closed = true;
          j++;
          break;
        }
        j++;
      }
      out.push({ kind: closed ? 'string' : 'badstring', from: i, to: j, text: text.slice(i, j) });
      i = j;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== "'" && text[j] !== '\n') j++;
      if (text[j] === "'") j++;
      out.push({ kind: 'invalid', from: i, to: j, text: text.slice(i, j) });
      i = j;
      continue;
    }
    const num = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 40));
    if (num) {
      out.push({ kind: 'number', from: i, to: i + num[0].length, text: num[0] });
      i += num[0].length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$-]*/.exec(text.slice(i, i + 200));
    if (word) {
      const w = word[0];
      out.push({ kind: w === 'true' || w === 'false' || w === 'null' ? 'literal' : 'ident', from: i, to: i + w.length, text: w });
      i += w.length;
      continue;
    }
    out.push({ kind: 'invalid', from: i, to: i + 1, text: c });
    i++;
  }
  out.push({ kind: 'eof', from: n, to: n, text: '' });
  return out;
}

/** Syntax diagnostics (first error per container, like VS Code's tolerant parser) + duplicate-key warnings. */
export function diagnoseJson(text: string): Diagnostic[] {
  const toks = scan(text);
  const diags: Diagnostic[] = [];
  let p = 0;
  const peek = () => toks[p]!;
  const next = () => toks[p++]!;
  const err = (t: Tok, message: string, code: number, severity: Severity = 'error') => {
    // One problem per position is enough (VS Code de-duplicates the same way).
    if (diags.some((d) => d.from === t.from && d.severity === severity)) return;
    diags.push({ from: t.from, to: Math.max(t.to, t.from + 1), severity, message, code });
  };
  const isValueStart = (t: Tok) => t.kind === '{' || t.kind === '[' || t.kind === 'string' || t.kind === 'number' || t.kind === 'literal';

  // Returns false when the error is unrecoverable (stop parsing).
  function value(): boolean {
    const t = peek();
    switch (t.kind) {
      case '{':
        return object();
      case '[':
        return array();
      case 'string':
      case 'number':
      case 'literal':
        next();
        return true;
      case 'badstring':
        next();
        err(t, 'Unexpected end of string', 0x101);
        return true;
      case 'invalid':
      case 'ident':
        next();
        err(t, 'Value expected', 0x204);
        return true;
      default:
        err(t, 'Value expected', 0x204);
        return t.kind !== 'eof';
    }
  }

  function object(): boolean {
    next(); // {
    const keys = new Map<string, Tok>();
    let first = true;
    for (;;) {
      const t = peek();
      if (t.kind === '}') {
        next();
        return true;
      }
      if (t.kind === 'eof') {
        err(t, 'Expected comma or closing brace', 0x206);
        return false;
      }
      if (!first) {
        if (t.kind === ',') {
          next();
          const after = peek();
          if (after.kind === '}') {
            err(t, 'Trailing comma', 0x207);
            next();
            return true;
          }
        } else if (t.kind === 'string' || t.kind === 'ident' || t.kind === 'invalid') {
          // A new property right after the previous value: the comma is missing — reported HERE.
          err(t, 'Expected comma', 0x202);
        } else {
          err(t, 'Expected comma or closing brace', 0x206);
          if (t.kind === ']') {
            next();
            continue;
          }
          return false;
        }
      }
      first = false;
      const k = peek();
      if (k.kind === 'string') {
        next();
        const prev = keys.get(k.text);
        if (prev) {
          err(prev, 'Duplicate object key', 0x208, 'warning');
          err(k, 'Duplicate object key', 0x208, 'warning');
        } else keys.set(k.text, k);
      } else if (k.kind === 'ident' || k.kind === 'invalid') {
        next();
        err(k, 'Property keys must be doublequoted', 0x201);
      } else if (k.kind === '}') {
        continue;
      } else {
        err(k, 'Property expected', 0x201);
        if (k.kind === 'eof') return false;
        next();
        continue;
      }
      if (peek().kind === ':') next();
      else {
        err(peek(), 'Colon expected', 0x203);
        if (!isValueStart(peek())) continue;
      }
      if (!value()) return false;
    }
  }

  function array(): boolean {
    next(); // [
    let first = true;
    for (;;) {
      const t = peek();
      if (t.kind === ']') {
        next();
        return true;
      }
      if (t.kind === 'eof') {
        err(t, 'Expected comma or closing bracket', 0x205);
        return false;
      }
      if (!first) {
        if (t.kind === ',') {
          next();
          if (peek().kind === ']') {
            err(t, 'Trailing comma', 0x207);
            next();
            return true;
          }
        } else if (isValueStart(t) || t.kind === 'invalid' || t.kind === 'ident') {
          err(t, 'Expected comma', 0x202);
        } else {
          err(t, 'Expected comma or closing bracket', 0x205);
          if (t.kind === '}') {
            next();
            continue;
          }
          return false;
        }
      }
      first = false;
      if (!value()) return false;
    }
  }

  if (peek().kind === 'eof') return diags;
  if (value()) {
    const rest = peek();
    if (rest.kind !== 'eof') err(rest, 'End of file expected', 0x209);
  }
  return diags;
}

/* ───────────────────────────── colouring ───────────────────────────── */

export type SpanKind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'bracket' | 'invalid' | 'ws' | 'var';

export interface Span {
  text: string;
  kind: SpanKind;
  /** Bracket pair colour slot (0..2), or -1 for an unmatched closing bracket. */
  depth?: number;
}

/**
 * Colour one line. `depth` is the bracket nesting depth at the start of the line; returns the spans and the
 * depth at the end. Keys are strings followed by ':'; `${VAR}` placeholders inside strings are tinted.
 */
export function tokenizeLine(line: string, depth: number): { spans: Span[]; depth: number } {
  const spans: Span[] = [];
  let i = 0;
  const push = (text: string, kind: SpanKind, d?: number) => spans.push(d === undefined ? { text, kind } : { text, kind, depth: d });
  while (i < line.length) {
    const c = line[i]!;
    if (c === ' ' || c === '\t') {
      let j = i;
      while (j < line.length && (line[j] === ' ' || line[j] === '\t')) j++;
      push(line.slice(i, j), 'ws');
      i = j;
    } else if (c === '{' || c === '[') {
      push(c, 'bracket', depth % 3);
      depth++;
      i++;
    } else if (c === '}' || c === ']') {
      depth--;
      push(c, 'bracket', depth < 0 ? -1 : depth % 3);
      if (depth < 0) depth = 0;
      i++;
    } else if (c === ':' || c === ',') {
      push(c, 'punct');
      i++;
    } else if (c === '"') {
      let j = i + 1;
      while (j < line.length) {
        if (line[j] === '\\') {
          j += 2;
          continue;
        }
        if (line[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      const s = line.slice(i, j);
      let k = j;
      while (k < line.length && (line[k] === ' ' || line[k] === '\t')) k++;
      const kind: SpanKind = line[k] === ':' ? 'key' : 'string';
      if (kind === 'string' && s.includes('${')) {
        for (const part of s.split(/(\$\{[^}]*\})/)) if (part) push(part, part.startsWith('${') ? 'var' : 'string');
      } else push(s, kind);
      i = j;
    } else {
      const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(line.slice(i));
      if (m) {
        push(m[0], /\d/.test(m[0][0] === '-' ? m[0][1]! : m[0][0]!) ? 'number' : 'literal');
        i += m[0].length;
      } else {
        let j = i + 1;
        while (j < line.length && !' \t{}[]:,"'.includes(line[j]!)) j++;
        push(line.slice(i, j), 'invalid');
        i = j;
      }
    }
  }
  return { spans, depth };
}

/** The JSON string token (without quotes) at a character column of a line, or null. */
export function stringTokenAt(line: string, col0: number): string | null {
  const re = /"((?:[^"\\]|\\.)*)"/g;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (col0 >= m.index && col0 <= m.index + m[0].length) return m[1]!;
  }
  return null;
}

/** Pretty-print valid JSON the way Format Document does (2 spaces). Returns null when the text has syntax errors. */
export function formatJson(text: string): string | null {
  if (diagnoseJson(text).some((d) => d.severity === 'error')) return null;
  try {
    return `${JSON.stringify(JSON.parse(text), null, 2)}\n`;
  } catch {
    return null;
  }
}

/** 1-based line/column of an offset. */
export function offsetToLineCol(text: string, offset: number): { line: number; col: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      last = i;
    }
  }
  return { line, col: offset - last };
}

export function lineColToOffset(text: string, line: number, col: number): number {
  let l = 1;
  let i = 0;
  while (l < line && i < text.length) {
    if (text.charCodeAt(i) === 10) l++;
    i++;
  }
  return Math.min(text.length, i + Math.max(0, col - 1));
}
