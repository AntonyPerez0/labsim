/**
 * Code facts (Sim §3.19.6): static, regex-level predicates over repo files that the runners and the
 * scripted reviewers evaluate. Evaluated on the tree a run uses (CI: branch head; local: working tree).
 */

export const PO_DIR = 'app/src/androidTest/java/com/labsim/uia/pageobjects/';
export const TA_DIR = 'app/src/androidTest/java/com/labsim/uia/testactions/';

/** Small bounded memo for pure functions of source text (the runners evaluate code facts every step). */
function memo<K, V>(cap: number): { get(k: K): V | undefined; set(k: K, v: V): V } {
  const m = new Map<K, V>();
  return {
    get: (k) => m.get(k),
    set(k, v) {
      if (m.size >= cap) m.delete(m.keys().next().value as K);
      m.set(k, v);
      return v;
    },
  };
}
const STRIPPED = memo<string, string>(256);
const BODIES = memo<string, { body: string; startLine: number } | null>(512);

/** Blank out // and block comments and string contents — same length and line structure as `src` (offsets stay valid). */
export function stripJava(src: string): string {
  const hit = STRIPPED.get(src);
  return hit !== undefined ? hit : STRIPPED.set(src, stripJavaRaw(src));
}

function stripJavaRaw(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (c === '/' && n === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      if (i < src.length) out += '  ';
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += q;
      i++;
      while (i < src.length && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') {
          out += '  ';
          i += 2;
          continue;
        }
        out += ' ';
        i++;
      }
      if (src[i] === q) {
        out += q;
        i++;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** Body (between the braces) of the first method named `name`, or null. Works on stripped source. */
export function methodBody(src: string, name: string): { body: string; startLine: number } | null {
  const key = `${name}\u0000${src}`;
  const hit = BODIES.get(key);
  if (hit !== undefined) return hit && { ...hit };
  const r = methodBodyRaw(src, name);
  BODIES.set(key, r);
  return r && { ...r };
}

function methodBodyRaw(src: string, name: string): { body: string; startLine: number } | null {
  const s = stripJava(src);
  const re = new RegExp(`(?:public|protected|private)?\\s*(?:static\\s+)?[\\w<>\\[\\]]+\\s+${name}\\s*\\([^)]*\\)\\s*(?:throws [\\w., ]+)?\\{`, 'g');
  const m = re.exec(s);
  if (!m) return null;
  let i = m.index + m[0].length;
  const start = i;
  let depth = 1;
  while (i < s.length && depth > 0) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    i++;
  }
  const startLine = s.slice(0, start).split('\n').length;
  // Return the ORIGINAL text for the same span (literals intact).
  return { body: src.slice(start, i - 1), startLine };
}

/** BySelector fields declared in the class (Zone 1). */
export function bySelectorFields(src: string): string[] {
  const out: string[] = [];
  const re = /BySelector\s+(\w+)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) out.push(m[1]!);
  return out;
}

export type ScreenSync = { kind: 'wait'; locator: string } | { kind: 'sleep'; ms: number } | { kind: 'race' };

/** CF01–CF03 for one page-object class (and, optionally, one action method of it). */
export function screenSync(src: string, actionMethod?: string): ScreenSync {
  const w = methodBody(src, 'waitForScreen');
  let base: ScreenSync = { kind: 'race' };
  if (w) {
    const body = stripJava(w.body);
    const sleep = /Thread\.sleep\(\s*(\d+)\s*\)/.exec(body);
    const wait = /device\.wait\(\s*Until\.hasObject\(\s*(\w+)\s*\)/.exec(w.body);
    if (wait && bySelectorFields(src).includes(wait[1]!)) base = { kind: 'wait', locator: wait[1]! };
    else if (sleep) base = { kind: 'sleep', ms: Number(sleep[1]) };
  }
  if (base.kind === 'race' || !actionMethod) return base;
  const a = methodBody(src, actionMethod);
  if (!a) return base;
  const body = stripJava(a.body);
  const click = body.indexOf('.click()');
  const call = body.search(/\bwaitForScreen\(\)/);
  if (click >= 0 && (call < 0 || call > click)) return { kind: 'race' };
  return base;
}

/** CF04 */
export function hasIsScreenPresent(src: string): boolean {
  const m = methodBody(src, 'isScreenPresent');
  return !!m && /\breturn\b/.test(m.body);
}
/** CF01 alone (waitForScreen waits on a Zone 1 locator). */
export function hasWaitForScreen(src: string): boolean {
  return screenSync(src).kind === 'wait';
}

/** CF05 — HomeScreen.open() scroll direction. */
export function openDirection(src: string): 'correct' | 'swapped' | 'horizontal-only' | 'vertical-only' | 'missing' {
  const m = methodBody(src, 'open');
  if (!m) return 'missing';
  const body = stripJava(m.body);
  const v = /scrollVerticallyTo/.test(body);
  const h = /scrollHorizontallyTo/.test(body);
  const ifm = /if\s*\(([^)]*)\)\s*\{([^}]*)\}\s*else\s*\{([^}]*)\}/.exec(body);
  if (ifm) {
    const cond = ifm[1]!;
    const thenB = ifm[2]!;
    const elseB = ifm[3]!;
    const flexInThen = /FLEX/.test(cond) && !/!\s*=|!=/.test(cond);
    const flexBranch = flexInThen ? thenB : elseB;
    const other = flexInThen ? elseB : thenB;
    const fv = /scrollVerticallyTo/.test(flexBranch);
    const oh = /scrollHorizontallyTo/.test(other);
    if (fv && oh) return 'correct';
    if (/scrollHorizontallyTo/.test(flexBranch) && /scrollVerticallyTo/.test(other)) return 'swapped';
    if (!v) return 'horizontal-only';
    if (!h) return 'vertical-only';
    return 'swapped';
  }
  if (v && !h) return 'vertical-only';
  if (h && !v) return 'horizontal-only';
  return v && h ? 'correct' : 'missing';
}

/** CF06 — test class has @After calling goHome on every handle it used. */
export function hasTeardown(src: string): boolean {
  const s = stripJava(src);
  const at = /@After\s+public\s+void\s+(\w+)\s*\(/.exec(s);
  if (!at) return false;
  const body = methodBody(src, at[1]!)?.body ?? '';
  const usesMfd = /\bmfd\.run\(/.test(s);
  const usesCfd = /\bcfd\.run\(/.test(s);
  if (usesMfd || usesCfd) {
    if (usesMfd && !/mfd\.run\([^;]*goHome/.test(body)) return false;
    if (usesCfd && !/cfd\.run\([^;]*goHome/.test(body)) return false;
    return true;
  }
  return /goHome/.test(body);
}

/** CF07 — `orca.screenCompare("NAME")` occurrences (code only). */
export function screenCompareNames(src: string): string[] {
  const out: string[] = [];
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const re = /orca\.screenCompare\(\s*"([^"]+)"\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(noComments))) out.push(m[1]!);
  return out;
}

/** CF08 */
export const usesDisplayId = (src: string): boolean => /displayId\(/.test(stripJava(src));

/** CF09 — page-object package/path mismatches among the classes a test imports. */
export function packageProblems(files: Record<string, string>): { path: string; cls: string; reason: string }[] {
  const out: { path: string; cls: string; reason: string }[] = [];
  for (const [p, src] of Object.entries(files)) {
    if (!p.endsWith('.java') || !p.includes('/androidTest/java/')) continue;
    const pkg = /^\s*package\s+([\w.]+)\s*;/m.exec(src)?.[1] ?? '';
    const dirPkg = p.slice(p.indexOf('/java/') + 6, p.lastIndexOf('/')).replace(/\//g, '.');
    const cls = p.slice(p.lastIndexOf('/') + 1, -5);
    if (pkg && pkg !== dirPkg) out.push({ path: p, cls, reason: `package ${pkg} does not match directory ${dirPkg}` });
    const looksPo = /extends BaseTest/.test(src) && /Zone 1/.test(src) && !/@Test/.test(src);
    if (looksPo && !p.startsWith(PO_DIR)) out.push({ path: p, cls, reason: 'page object outside pageobjects' });
  }
  return out;
}

/** CF10 */
export const touchesMain = (paths: string[]): string[] => paths.filter((p) => p.startsWith('app/src/main/'));
/** CF11 */
export function committedPort5555(files: Record<string, string>): boolean {
  const t = files['config.properties'];
  return t !== undefined && /^\s*portNumber\s*=\s*5555\s*$/m.test(t);
}

/** CF12 — Java syntax sanity. Returns the first error (1-based line) or null. */
const SYNTAX = memo<string, { line: number; message: string } | null>(256);
export function javaSyntaxError(src: string): { line: number; message: string } | null {
  const hit = SYNTAX.get(src);
  if (hit !== undefined) return hit && { ...hit };
  const r = javaSyntaxErrorRaw(src);
  SYNTAX.set(src, r);
  return r && { ...r };
}

function javaSyntaxErrorRaw(src: string): { line: number; message: string } | null {
  const s = stripJava(src);
  const lines = s.split('\n');
  const stack: { ch: string; line: number }[] = [];
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  for (let li = 0; li < lines.length; li++) {
    for (const ch of lines[li]!) {
      if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line: li + 1 });
      else if (ch in pairs) {
        const top = stack.pop();
        if (!top || top.ch !== pairs[ch]) {
          const expect = top ? (top.ch === '(' ? ')' : top.ch === '[' ? ']' : '}') : ch;
          return { line: li + 1, message: `'${expect}' expected` };
        }
      }
    }
  }
  if (stack.length) {
    const top = stack[stack.length - 1]!;
    return { line: lines.length, message: `'${top.ch === '(' ? ')' : top.ch === '[' ? ']' : '}'}' expected` };
  }
  // Missing ';' heuristic: inside a method body (depth ≥ 2), a statement line ending in ')', an identifier or a
  // literal, followed by a line that starts a new statement.
  let depth = 0;
  const startsStatement = (t: string): boolean =>
    /^(?:[A-Za-z_][\w.<>\[\]]*\s*(?:\(|=|\s+\w+\s*=|\.|;)|return\b|if\b|for\b|while\b|throw\b|\}|[\w.]+::|this\.|super\.|new\b)/.test(t);
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li]!;
    const t = raw.trim();
    const before = depth;
    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (before < 2 || !t) continue;
    if (/^(?:@|if\b|for\b|while\b|else\b|try\b|catch\b|finally\b|switch\b|do\b|case\b|default\b)/.test(t)) continue;
    if (!/[)\w"'\]]$/.test(t)) continue;
    let nj = li + 1;
    while (nj < lines.length && !lines[nj]!.trim()) nj++;
    const next = (lines[nj] ?? '').trim();
    if (!next || /^[.+\-*/&|?:)\],]/.test(next) || /^->/.test(next)) continue;
    if (startsStatement(next)) return { line: li + 1, message: "';' expected" };
  }
  return null;
}

/** Map of page-object class → runtime screen it represents (for render-race checks). */
export const PAGE_OBJECT_SCREEN: Record<string, string> = {
  HomeScreen: 'home',
  LockScreen: 'lock',
  RegisterHomeScreen: 'register',
  ReviewOrderScreen: 'review-order',
  PaymentScreen: 'tender-select',
  TipScreen: 'tip',
  ReceiptScreen: 'receipt-options',
  CfdTotalsScreen: 'customer-cart',
  CfdPaymentScreen: 'payment-prompt',
};
