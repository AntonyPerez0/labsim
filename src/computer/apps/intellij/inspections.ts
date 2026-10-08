/**
 * Inspections (Apps §4.6–§4.7): Java sanity rules (Sim CF12: unbalanced brackets, missing `;`), strict JSON for
 * gort/orchestrator (IntelliJ wording), the "mandatory screen methods" inspection + intention. Pigeon JSON is
 * deliberately NOT inspected (legacy project settings, Cur §7, M15 s6).
 */
import { stripJavaNoise } from './lang';

export interface Problem {
  /** 1-based line. */
  line: number;
  /** 1-based start column. */
  col: number;
  /** Underline length in characters (≥ 1). */
  len: number;
  severity: 'error' | 'warning';
  message: string;
  /** Quick fix id offered by Alt+Enter. */
  fix?: 'implement-mandatory-screen-methods';
}

/* ───────────────────────────── Java ───────────────────────────── */

const CONTROL = /^(if|for|while|switch|catch|else|do|synchronized|try|finally|case|default)\b/;
const CONT_START = /^(\.|\+|-|\*|\/|&&|\|\||\?|:|\)|\]|\{|=|,)/;

/** Brace/semicolon checks over Java source. MUST be silent on every factory file. */
export function inspectJava(text: string): Problem[] {
  const problems: Problem[] = [];
  const clean = stripJavaNoise(text);
  const lines = clean.split('\n');
  const rawLines = text.split('\n');
  // 1) Bracket balance.
  const stack: { ch: string; line: number; col: number }[] = [];
  const close: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  const open: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  let reportedBalance = false;
  for (let li = 0; li < lines.length && !reportedBalance; li++) {
    const l = lines[li];
    for (let ci = 0; ci < l.length; ci++) {
      const ch = l[ci];
      if (open[ch]) stack.push({ ch, line: li + 1, col: ci + 1 });
      else if (close[ch]) {
        const top = stack[stack.length - 1];
        if (!top) {
          problems.push({ line: li + 1, col: ci + 1, len: 1, severity: 'error', message: `Unexpected token` });
          reportedBalance = true;
          break;
        }
        if (top.ch !== close[ch]) {
          problems.push({ line: li + 1, col: ci + 1, len: 1, severity: 'error', message: `'${open[top.ch]}' expected` });
          reportedBalance = true;
          break;
        }
        stack.pop();
      }
    }
  }
  if (!reportedBalance && stack.length) {
    const top = stack[stack.length - 1];
    const lastLine = rawLines.length;
    const lastLen = Math.max(1, rawLines[lastLine - 1].length);
    problems.push({ line: top.ch === '{' ? lastLine : top.line, col: top.ch === '{' ? lastLen : top.col, len: 1, severity: 'error', message: `'${open[top.ch]}' expected` });
  }
  // 2) Missing semicolons inside method bodies (brace depth ≥ 2, paren depth 0 at end of line).
  let depth = 0;
  let paren = 0;
  for (let li = 0; li < lines.length; li++) {
    const l = lines[li];
    const startDepth = depth;
    for (const ch of l) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
      else if (ch === '(') paren++;
      else if (ch === ')') paren = Math.max(0, paren - 1);
    }
    const t = l.trim();
    if (!t || startDepth < 2 || depth < 2 || paren > 0) continue;
    if (t.startsWith('@') || CONTROL.test(t) || t.startsWith('}') || t.startsWith('.')) continue;
    if (/[;{}:,(=+\-*/&|?!<>]$/.test(t) || t.endsWith('->')) continue;
    const endsLikeStatement = /\)$/.test(t) || /[\w$"']$/.test(t) || /\]$/.test(t);
    if (!endsLikeStatement) continue;
    if (/^(return|throw|break|continue)$/.test(t)) continue;
    // Next significant line.
    let nj = li + 1;
    while (nj < lines.length && !lines[nj].trim()) nj++;
    if (nj >= lines.length) continue;
    const next = lines[nj].trim();
    if (CONT_START.test(next) && !next.startsWith('}')) continue;
    if (/^\w+\s*$/.test(t) && !/^(return|break|continue)\b/.test(t) && !/\)$/.test(t)) {
      // A lone identifier (e.g. a type on its own line) — too ambiguous to flag.
      continue;
    }
    const raw = rawLines[li];
    const end = raw.replace(/\s*(\/\/.*)?$/, '').length;
    problems.push({ line: li + 1, col: Math.max(1, end), len: 1, severity: 'error', message: `';' expected` });
  }
  return problems;
}

/* ───────────────────────────── Strict JSON (gort, orchestrator) ───────────────────────────── */

class JsonErr extends Error {
  constructor(
    public pos: number,
    msg: string,
  ) {
    super(msg);
  }
}

/** Parse with IntelliJ's messages; returns the first problem or [] when valid. */
export function inspectJsonStrict(text: string): Problem[] {
  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n && /\s/.test(text[i])) i++;
  };
  const str = () => {
    const start = i;
    i++;
    while (i < n && text[i] !== '"') {
      if (text[i] === '\n') throw new JsonErr(start, 'Missing closing quote');
      i += text[i] === '\\' ? 2 : 1;
    }
    if (i >= n) throw new JsonErr(start, 'Missing closing quote');
    i++;
  };
  const value = (): void => {
    ws();
    const ch = text[i];
    if (ch === '{') return obj();
    if (ch === '[') return arr();
    if (ch === '"') return str();
    const m = /^(-?\d+(\.\d+)?([eE][+-]?\d+)?|true|false|null)/.exec(text.slice(i));
    if (m) {
      i += m[0].length;
      return;
    }
    throw new JsonErr(i, 'Value expected');
  };
  const obj = () => {
    i++;
    ws();
    if (text[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      ws();
      if (text[i] !== '"') throw new JsonErr(i, 'Property name expected');
      str();
      ws();
      if (text[i] !== ':') throw new JsonErr(i, "':' expected");
      i++;
      value();
      ws();
      if (text[i] === ',') {
        i++;
        ws();
        if (text[i] === '}') throw new JsonErr(i, 'Property name expected');
        continue;
      }
      if (text[i] === '}') {
        i++;
        return;
      }
      throw new JsonErr(i, "',' or '}' expected");
    }
  };
  const arr = () => {
    i++;
    ws();
    if (text[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      value();
      ws();
      if (text[i] === ',') {
        i++;
        ws();
        if (text[i] === ']') throw new JsonErr(i, 'Value expected');
        continue;
      }
      if (text[i] === ']') {
        i++;
        return;
      }
      throw new JsonErr(i, "',' or ']' expected");
    }
  };
  try {
    ws();
    if (i >= n) return [];
    value();
    ws();
    if (i < n) throw new JsonErr(i, 'Unexpected token');
    return [];
  } catch (e) {
    if (!(e instanceof JsonErr)) throw e;
    // IntelliJ reports a missing comma at the end of the previous value.
    let pos = Math.min(e.pos, n);
    if (/expected$/.test(e.message) && e.message.startsWith("','")) {
      let p = pos - 1;
      while (p >= 0 && /\s/.test(text[p])) p--;
      pos = p + 1;
    }
    const before = text.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - (before.lastIndexOf('\n') + 1) + 1;
    return [{ line, col, len: 1, severity: 'error', message: e.message }];
  }
}

/* ───────────────────────────── Screen classes ───────────────────────────── */

export interface ScreenClassInfo {
  isScreen: boolean;
  missing: ('waitForScreen' | 'isScreenPresent')[];
  /** First Zone 1 `BySelector` field. */
  selector: string | null;
  /** 1-based line of the class declaration. */
  classLine: number;
  className: string | null;
}

export function screenClassInfo(path: string, text: string): ScreenClassInfo {
  const none: ScreenClassInfo = { isScreen: false, missing: [], selector: null, classLine: 0, className: null };
  if (!/\/pageobjects\/[^/]+\.java$/.test(path)) return none;
  const lines = text.split('\n');
  const classIdx = lines.findIndex((l) => /\bclass\s+\w+\s+extends\s+BaseTest\b/.test(l));
  if (classIdx < 0) return none;
  const clean = stripJavaNoise(text);
  const missing: ScreenClassInfo['missing'] = [];
  if (!/\bvoid\s+waitForScreen\s*\(/.test(clean)) missing.push('waitForScreen');
  if (!/\bboolean\s+isScreenPresent\s*\(/.test(clean)) missing.push('isScreenPresent');
  const sel = /BySelector\s+(\w+)\s*=/.exec(clean);
  return { isScreen: true, missing, selector: sel ? sel[1] : null, classLine: classIdx + 1, className: /class\s+(\w+)/.exec(lines[classIdx])?.[1] ?? null };
}

export function screenClassProblems(path: string, text: string): Problem[] {
  const info = screenClassInfo(path, text);
  if (!info.isScreen || !info.missing.length) return [];
  const line = text.split('\n')[info.classLine - 1];
  const col = line.indexOf(info.className ?? 'class') + 1;
  return info.missing.map((m) => ({
    line: info.classLine,
    col: Math.max(1, col),
    len: (info.className ?? 'class').length,
    severity: 'warning' as const,
    message: `Screen class is missing mandatory method ${m}()`,
    fix: 'implement-mandatory-screen-methods' as const,
  }));
}

/** Insert the missing mandatory methods before the class's closing brace (Apps §4.7). */
export function implementScreenMethods(path: string, text: string): string | null {
  const info = screenClassInfo(path, text);
  if (!info.isScreen || !info.missing.length) return null;
  const x = info.selector ?? 'root';
  const blocks: string[] = [];
  if (info.missing.includes('waitForScreen')) blocks.push(`    public void waitForScreen() {\n        device.wait(Until.hasObject(${x}), TIMEOUT_MS);\n    }`);
  if (info.missing.includes('isScreenPresent')) blocks.push(`    public boolean isScreenPresent() {\n        return device.hasObject(${x});\n    }`);
  const clean = stripJavaNoise(text);
  const closeIdx = clean.lastIndexOf('}');
  if (closeIdx < 0) return null;
  let before = text.slice(0, closeIdx).replace(/\s*$/, '');
  const after = text.slice(closeIdx);
  before += `\n\n${blocks.join('\n\n')}\n`;
  let out = before + after;
  if (!/import\s+androidx\.test\.uiautomator\.Until\s*;/.test(out) && /import\s+androidx\.test\.uiautomator\.BySelector\s*;/.test(out)) {
    out = out.replace(/(import\s+androidx\.test\.uiautomator\.BySelector\s*;)/, '$1\nimport androidx.test.uiautomator.Until;');
  }
  return out;
}

/* ───────────────────────────── Dispatcher ───────────────────────────── */

export type InspectionMode = 'java' | 'json-strict' | 'none';

export function inspectionModeFor(repo: string, path: string): InspectionMode {
  if (path.endsWith('.java')) return 'java';
  if (path.endsWith('.json') && repo !== 'pigeon') return 'json-strict';
  return 'none';
}

export function inspectFile(repo: string, path: string, text: string): Problem[] {
  switch (inspectionModeFor(repo, path)) {
    case 'java':
      return [...inspectJava(text), ...screenClassProblems(path, text)];
    case 'json-strict':
      return inspectJsonStrict(text);
    default:
      return [];
  }
}
