/**
 * Strict JSON parser with the LSTR error messages of Sim §3.20.1 — it reports the FIRST unexpected
 * token, which for a missing comma is the token *after* the gap (the lesson: look at the end of the
 * previous line). Line/column are 1-based, tabs count as one column. Also used by Jenkins
 * `readJSON` (§3.18.3 #2) and Jared's review (§3.22.2).
 */

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

export type JsonParseResult = { ok: true; value: JsonValue } | { ok: false; error: string; line: number | null; column: number | null };

class JsonError extends Error {
  constructor(
    message: string,
    public line: number | null,
    public column: number | null,
  ) {
    super(message);
  }
}

export function parseStrictJson(text: string): JsonParseResult {
  const p = new Parser(text);
  try {
    p.ws();
    if (p.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
    const v = p.value();
    p.ws();
    if (!p.eof()) p.unexpected();
    return { ok: true, value: v };
  } catch (e) {
    if (e instanceof JsonError) return { ok: false, error: e.message, line: e.line, column: e.column };
    throw e;
  }
}

/** `LSTR ParseError: <message>` or null when the text parses. */
export function lstrParseError(text: string): string | null {
  const r = parseStrictJson(text);
  return r.ok ? null : `LSTR ParseError: ${r.error}`;
}

class Parser {
  i = 0;
  constructor(private s: string) {}
  eof(): boolean {
    return this.i >= this.s.length;
  }
  ws(): void {
    while (this.i < this.s.length && ' \t\r\n'.includes(this.s[this.i]!)) this.i++;
  }
  pos(at = this.i): { line: number; column: number } {
    let line = 1;
    let col = 1;
    for (let k = 0; k < at && k < this.s.length; k++) {
      if (this.s[k] === '\n') {
        line++;
        col = 1;
      } else col++;
    }
    return { line, column: col };
  }
  /** Throws the message for whatever token starts at `i`. */
  unexpected(): never {
    if (this.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
    const c = this.s[this.i]!;
    const { line, column } = this.pos();
    if (c === '"') throw new JsonError(`Unexpected string in JSON at line ${line} column ${column}`, line, column);
    if (c === '-' || (c >= '0' && c <= '9')) throw new JsonError(`Unexpected number in JSON at line ${line} column ${column}`, line, column);
    throw new JsonError(`Unexpected token ${c} in JSON at line ${line} column ${column}`, line, column);
  }
  value(): JsonValue {
    this.ws();
    if (this.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
    const c = this.s[this.i]!;
    if (c === '{') return this.object();
    if (c === '[') return this.array();
    if (c === '"') return this.string();
    if (c === '-' || (c >= '0' && c <= '9')) return this.number();
    if (this.s.startsWith('true', this.i)) {
      this.i += 4;
      return true;
    }
    if (this.s.startsWith('false', this.i)) {
      this.i += 5;
      return false;
    }
    if (this.s.startsWith('null', this.i)) {
      this.i += 4;
      return null;
    }
    return this.unexpected();
  }
  object(): { [k: string]: JsonValue } {
    this.i++; // {
    const out: { [k: string]: JsonValue } = {};
    this.ws();
    if (this.s[this.i] === '}') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
      if (this.s[this.i] !== '"') this.unexpected(); // trailing comma → `}`; unquoted key → first letter; 'x' → '
      const k = this.string();
      this.ws();
      if (this.s[this.i] !== ':') this.unexpected();
      this.i++;
      out[k] = this.value();
      this.ws();
      if (this.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === '}') {
        this.i++;
        return out;
      }
      this.unexpected();
    }
  }
  array(): JsonValue[] {
    this.i++; // [
    const out: JsonValue[] = [];
    this.ws();
    if (this.s[this.i] === ']') {
      this.i++;
      return out;
    }
    for (;;) {
      this.ws();
      if (this.s[this.i] === ']') this.unexpected(); // trailing comma
      out.push(this.value());
      this.ws();
      if (this.eof()) throw new JsonError('Unexpected end of JSON input', null, null);
      const c = this.s[this.i];
      if (c === ',') {
        this.i++;
        continue;
      }
      if (c === ']') {
        this.i++;
        return out;
      }
      this.unexpected();
    }
  }
  string(): string {
    const start = this.i;
    this.i++;
    let out = '';
    while (this.i < this.s.length) {
      const c = this.s[this.i]!;
      if (c === '"') {
        this.i++;
        return out;
      }
      if (c === '\n') {
        const { line, column } = this.pos();
        throw new JsonError(`Unexpected token \n in JSON at line ${line} column ${column}`.replace('\n', '\\n'), line, column);
      }
      if (c === '\\') {
        const n = this.s[this.i + 1];
        const map: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' };
        if (n !== undefined && n in map) {
          out += map[n];
          this.i += 2;
          continue;
        }
        if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(this.s.slice(this.i + 2, this.i + 6))) {
          out += String.fromCharCode(parseInt(this.s.slice(this.i + 2, this.i + 6), 16));
          this.i += 6;
          continue;
        }
        this.i++;
        this.unexpected();
      }
      out += c;
      this.i++;
    }
    void start;
    throw new JsonError('Unexpected end of JSON input', null, null);
  }
  number(): number {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(this.s.slice(this.i));
    if (!m || m[0] === '-') {
      this.i++;
      return this.unexpected();
    }
    this.i += m[0].length;
    return Number(m[0]);
  }
}

/** Compact JSON as JHipster/Jackson writes it (no spaces). */
export const compact = (v: unknown): string => JSON.stringify(v);
