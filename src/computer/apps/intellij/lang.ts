/**
 * Small, fast syntax tokenizers for the IDE editor (Apps §4.1 colour table): Java, Groovy, JSON, .properties,
 * XML, YAML, Markdown, .gitignore. Line-oriented with a carried state for block comments, so a file of a few
 * hundred lines re-highlights in well under a millisecond per keystroke.
 */

export type Lang = 'java' | 'groovy' | 'clike' | 'script' | 'json' | 'properties' | 'xml' | 'yaml' | 'markdown' | 'gitignore' | 'text';

/** Token class → CSS class `ij-t-<c>` (null = default text colour). */
export type TokClass =
  | 'kw'
  | 'str'
  | 'num'
  | 'com'
  | 'doc'
  | 'doctag'
  | 'ann'
  | 'fn'
  | 'field'
  | 'const'
  | 'semi'
  | 'jkey'
  | 'pkey'
  | 'pval'
  | 'tag'
  | 'attr'
  | 'attrv'
  | 'prolog'
  | 'ykey'
  | 'h'
  | 'code';

export interface Tok {
  t: string;
  c: TokClass | null;
}

export interface JavaContext {
  /** Identifiers declared as fields (this class + superclass) → purple. */
  fields: Set<string>;
  /** `static final` constants → purple italic. */
  consts: Set<string>;
}

export function langFor(path: string): Lang {
  const name = path.split('/').pop() ?? path;
  if (name === '.gitignore') return 'gitignore';
  if (name === 'Jenkinsfile') return 'groovy';
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : '';
  switch (ext) {
    case 'java':
    case 'class':
      return 'java';
    case 'groovy':
    case 'gradle':
      return 'groovy';
    case 'json':
      return 'json';
    case 'properties':
    case 'example':
      return name.startsWith('config.properties') || ext === 'properties' ? 'properties' : 'text';
    case 'xml':
    case 'iml':
      return 'xml';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'md':
      return 'markdown';
    // Pigeon's other runners (Swift, C#, Python) and misc sources: generic highlighting.
    case 'swift':
    case 'cs':
    case 'kt':
    case 'kts':
    case 'js':
    case 'ts':
    case 'go':
    case 'c':
    case 'cpp':
    case 'h':
      return 'clike';
    case 'py':
    case 'sh':
    case 'bat':
    case 'ps1':
      return 'script';
    default:
      return name === 'gradlew' ? 'script' : 'text';
  }
}

/** Indent unit (Apps §4.5): 4 spaces Java/properties/XML, 2 spaces JSON/YAML. */
export function indentUnit(lang: Lang): string {
  return lang === 'json' || lang === 'yaml' || lang === 'markdown' ? '  ' : '    ';
}

export function lineCommentPrefix(lang: Lang): string | null {
  switch (lang) {
    case 'java':
    case 'groovy':
    case 'clike':
      return '//';
    case 'script':
    case 'properties':
    case 'yaml':
    case 'gitignore':
      return '#';
    default:
      return null;
  }
}

const JAVA_KW = new Set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null var record yield sealed permits'.split(' '),
);
const GROOVY_KW = new Set([...JAVA_KW, 'def', 'in', 'as', 'trait']);
const CLIKE_KW = new Set([
  ...JAVA_KW,
  ...'func let guard struct protocol extension import self Self init deinit inout internal fileprivate open override mutating async await throws rethrows typealias associatedtype where is as nil in'.split(' '),
  ...'using namespace readonly sealed partial string object bool decimal ref out params base lock foreach get set value event delegate'.split(' '),
  ...'fun val object companion data when typealias function const let export from type undefined'.split(' '),
]);
const SCRIPT_KW = new Set(
  'def class return if elif else for while in not and or is None True False import from as with try except finally raise pass break continue lambda yield global async await then fi do done case esac function local export echo exit set'.split(' '),
);
const TYPE_KW = new Set('void boolean byte char double float int long short var def'.split(' '));
const MODIFIERS = new Set('public private protected static final abstract synchronized native default'.split(' '));

const isIdStart = (ch: string) => /[A-Za-z_$]/.test(ch);
const isId = (ch: string) => /[A-Za-z0-9_$]/.test(ch);

type BlockState = null | 'com' | 'doc' | 'xmlcom';

function push(out: Tok[], t: string, c: TokClass | null) {
  if (!t) return;
  const last = out[out.length - 1];
  if (last && last.c === c) last.t += t;
  else out.push({ t, c });
}

function docText(out: Tok[], text: string) {
  const re = /@\w+/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    push(out, text.slice(last, m.index), 'doc');
    push(out, m[0], 'doctag');
    last = m.index + m[0].length;
  }
  push(out, text.slice(last), 'doc');
}

function javaLine(line: string, state: BlockState, groovy: boolean | Set<string>, ctx: JavaContext | null): { toks: Tok[]; state: BlockState } {
  const out: Tok[] = [];
  const kw = groovy instanceof Set ? groovy : groovy ? GROOVY_KW : JAVA_KW;
  let i = 0;
  let prevSig = ''; // previous significant token text
  const n = line.length;
  while (i < n) {
    if (state === 'com' || state === 'doc') {
      const end = line.indexOf('*/', i);
      const stop = end < 0 ? n : end + 2;
      if (state === 'doc') docText(out, line.slice(i, stop));
      else push(out, line.slice(i, stop), 'com');
      i = stop;
      if (end >= 0) state = null;
      continue;
    }
    const ch = line[i];
    const two = line.slice(i, i + 2);
    if (two === '//') {
      push(out, line.slice(i), 'com');
      break;
    }
    if (two === '/*') {
      state = line.slice(i, i + 3) === '/**' && line.slice(i, i + 4) !== '/**/' ? 'doc' : 'com';
      const end = line.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      if (state === 'doc') docText(out, line.slice(i, stop));
      else push(out, line.slice(i, stop), 'com');
      i = stop;
      if (end >= 0) state = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      push(out, line.slice(i, Math.min(n, j + 1)), 'str');
      i = Math.min(n, j + 1);
      prevSig = 'str';
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(line[i + 1] ?? ''))) {
      const m = /^(0[xX][0-9a-fA-F_]+|[0-9][0-9_]*(\.[0-9_]+)?([eE][+-]?[0-9]+)?|\.[0-9]+)[lLfFdD]?/.exec(line.slice(i));
      const t = m ? m[0] : ch;
      push(out, t, 'num');
      i += t.length;
      prevSig = 'num';
      continue;
    }
    if (ch === '@' && isIdStart(line[i + 1] ?? '')) {
      let j = i + 1;
      while (j < n && (isId(line[j]) || line[j] === '.')) j++;
      push(out, line.slice(i, j), 'ann');
      i = j;
      prevSig = '@';
      continue;
    }
    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < n && isId(line[j])) j++;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && line[k] === ' ') k++;
      let cls: TokClass | null = null;
      if (kw.has(word)) cls = 'kw';
      else if (line[k] === '(' && prevSig !== '.' && prevSig !== 'new' && (TYPE_KW.has(prevSig) || MODIFIERS.has(prevSig) || prevSig === '>' || prevSig === ']' || (/^[A-Za-z_$][\w$]*$/.test(prevSig) && !kw.has(prevSig))))
        cls = 'fn';
      else if (ctx?.consts.has(word) && prevSig !== 'new') cls = 'const';
      else if (ctx?.fields.has(word) && line[k] !== '(' && (prevSig !== '.' || /this\.$/.test(line.slice(0, i)))) cls = 'field';
      push(out, word, cls);
      i = j;
      prevSig = word;
      continue;
    }
    if (ch === ';' || ch === ',') {
      push(out, ch, 'semi');
      i++;
      prevSig = ch;
      continue;
    }
    push(out, ch, null);
    if (ch !== ' ' && ch !== '\t') prevSig = ch;
    i++;
  }
  return { toks: out, state };
}

function jsonLine(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '"') {
      let j = i + 1;
      while (j < n && line[j] !== '"') j += line[j] === '\\' ? 2 : 1;
      const end = Math.min(n, j + 1);
      let k = end;
      while (k < n && line[k] === ' ') k++;
      push(out, line.slice(i, end), line[k] === ':' ? 'jkey' : 'str');
      i = end;
      continue;
    }
    if (/[-0-9]/.test(ch)) {
      const m = /^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(line.slice(i));
      if (m) {
        push(out, m[0], 'num');
        i += m[0].length;
        continue;
      }
    }
    const w = /^(true|false|null)\b/.exec(line.slice(i));
    if (w) {
      push(out, w[0], 'kw');
      i += w[0].length;
      continue;
    }
    push(out, ch, ch === ',' ? 'semi' : null);
    i++;
  }
  return out;
}

function propertiesLine(line: string): Tok[] {
  const trimmed = line.trimStart();
  if (trimmed.startsWith('#') || trimmed.startsWith('!')) return [{ t: line, c: 'com' }];
  const m = /^(\s*)([^=:\s][^=:]*?)(\s*[=:]\s*)(.*)$/.exec(line);
  if (!m) return line ? [{ t: line, c: trimmed ? 'pkey' : null }] : [];
  const out: Tok[] = [];
  push(out, m[1], null);
  push(out, m[2], 'pkey');
  push(out, m[3], null);
  push(out, m[4], 'pval');
  return out;
}

function xmlLine(line: string, state: BlockState): { toks: Tok[]; state: BlockState } {
  const out: Tok[] = [];
  let i = 0;
  const n = line.length;
  let inTag = false;
  while (i < n) {
    if (state === 'xmlcom') {
      const end = line.indexOf('-->', i);
      const stop = end < 0 ? n : end + 3;
      push(out, line.slice(i, stop), 'com');
      i = stop;
      if (end >= 0) state = null;
      continue;
    }
    if (line.startsWith('<!--', i)) {
      state = 'xmlcom';
      continue;
    }
    if (line.startsWith('<?', i)) {
      const end = line.indexOf('?>', i);
      const stop = end < 0 ? n : end + 2;
      push(out, line.slice(i, stop), 'prolog');
      i = stop;
      continue;
    }
    const ch = line[i];
    if (!inTag && ch === '<') {
      const m = /^<\/?[\w:.-]*/.exec(line.slice(i));
      const t = m ? m[0] : '<';
      push(out, t, 'tag');
      i += t.length;
      inTag = true;
      continue;
    }
    if (inTag) {
      if (ch === '>' || line.startsWith('/>', i)) {
        const t = ch === '>' ? '>' : '/>';
        push(out, t, 'tag');
        i += t.length;
        inTag = false;
        continue;
      }
      if (ch === '"' || ch === "'") {
        const end = line.indexOf(ch, i + 1);
        const stop = end < 0 ? n : end + 1;
        push(out, line.slice(i, stop), 'attrv');
        i = stop;
        continue;
      }
      if (/[\w:.-]/.test(ch)) {
        const m = /^[\w:.-]+/.exec(line.slice(i))!;
        push(out, m[0], 'attr');
        i += m[0].length;
        continue;
      }
    }
    push(out, ch, null);
    i++;
  }
  return { toks: out, state };
}

function yamlLine(line: string): Tok[] {
  const out: Tok[] = [];
  const hash = line.search(/(^|\s)#/);
  const body = hash >= 0 ? line.slice(0, hash) : line;
  const comment = hash >= 0 ? line.slice(hash) : '';
  const m = /^(\s*(?:-\s+)?)([\w.$@-]+|"[^"]*"|'[^']*')(\s*:)(\s|$)(.*)$/.exec(body);
  if (m) {
    push(out, m[1], null);
    push(out, m[2], 'ykey');
    push(out, m[3], null);
    push(out, m[4], null);
    push(out, m[5], m[5].trim() ? (/^\s*-?[0-9.]+\s*$/.test(m[5]) ? 'num' : 'str') : null);
  } else {
    const li = /^(\s*-\s+)(.*)$/.exec(body);
    if (li) {
      push(out, li[1], null);
      push(out, li[2], 'str');
    } else push(out, body, body.trim() ? 'str' : null);
  }
  push(out, comment, 'com');
  return out;
}

function markdownLine(line: string): Tok[] {
  if (/^\s*#{1,6}\s/.test(line)) return [{ t: line, c: 'h' }];
  const out: Tok[] = [];
  const re = /`[^`]*`/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    push(out, line.slice(last, m.index), null);
    push(out, m[0], 'code');
    last = m.index + m[0].length;
  }
  push(out, line.slice(last), null);
  return out;
}

/** Python / shell: `#` comments, quoted strings, numbers, keywords. */
function scriptLine(line: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
      push(out, line.slice(i), 'com');
      break;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && line[j] !== ch) j += line[j] === '\\' ? 2 : 1;
      push(out, line.slice(i, Math.min(n, j + 1)), 'str');
      i = Math.min(n, j + 1);
      continue;
    }
    if (/[0-9]/.test(ch) && (i === 0 || !isId(line[i - 1]))) {
      const m = /^[0-9][0-9_.]*/.exec(line.slice(i));
      const t = m ? m[0] : ch;
      push(out, t, 'num');
      i += t.length;
      continue;
    }
    if (isIdStart(ch)) {
      let j = i + 1;
      while (j < n && isId(line[j])) j++;
      const word = line.slice(i, j);
      let k = j;
      while (k < n && line[k] === ' ') k++;
      const prev = line.slice(0, i).trimEnd();
      push(out, word, SCRIPT_KW.has(word) ? 'kw' : line[k] === '(' && /\bdef$/.test(prev) ? 'fn' : null);
      i = j;
      continue;
    }
    push(out, ch, null);
    i++;
  }
  return out;
}

/** Highlight a whole file → tokens per line. */
export function highlight(lang: Lang, text: string, ctx: JavaContext | null = null): Tok[][] {
  const lines = text.split('\n');
  const result: Tok[][] = new Array(lines.length);
  let state: BlockState = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    switch (lang) {
      case 'java':
      case 'groovy': {
        const r = javaLine(line, state, lang === 'groovy', ctx);
        result[i] = r.toks;
        state = r.state;
        break;
      }
      case 'clike': {
        const r = javaLine(line, state, CLIKE_KW, null);
        result[i] = r.toks;
        state = r.state;
        break;
      }
      case 'script':
        result[i] = scriptLine(line);
        break;
      case 'json':
        result[i] = jsonLine(line);
        break;
      case 'properties':
        result[i] = propertiesLine(line);
        break;
      case 'xml': {
        const r = xmlLine(line, state);
        result[i] = r.toks;
        state = r.state;
        break;
      }
      case 'yaml':
        result[i] = yamlLine(line);
        break;
      case 'markdown':
        result[i] = markdownLine(line);
        break;
      case 'gitignore':
        result[i] = line.trimStart().startsWith('#') ? [{ t: line, c: 'com' }] : line ? [{ t: line, c: null }] : [];
        break;
      default:
        result[i] = line ? [{ t: line, c: null }] : [];
    }
  }
  return result;
}

/** Field/constant names declared at class level (brace depth 1) of a Java source. */
export function javaDeclaredFields(text: string): JavaContext {
  const fields = new Set<string>();
  const consts = new Set<string>();
  let depth = 0;
  for (const raw of stripJavaNoise(text).split('\n')) {
    if (depth === 1) {
      const m = /^\s*((?:(?:public|private|protected|static|final|transient|volatile)\s+)*)[\w$<>[\],.?]+(?:\s*<[^>]*>)?\s+([A-Za-z_$][\w$]*)\s*(=|;)/.exec(raw);
      if (m && !/\(/.test(raw.slice(0, raw.indexOf(m[3] === '=' ? '=' : ';')))) {
        if (/\bstatic\b/.test(m[1]) && /\bfinal\b/.test(m[1])) consts.add(m[2]);
        else fields.add(m[2]);
      }
    }
    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
  }
  return { fields, consts };
}

/** Replace string/char literal contents and comments with spaces (same length, newlines kept). */
export function stripJavaNoise(text: string): string {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    const two = text.slice(i, i + 2);
    if (two === '//') {
      while (i < n && text[i] !== '\n') {
        out += ' ';
        i++;
      }
      continue;
    }
    if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < n && text[j] !== ch && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      const stop = Math.min(n, j + 1);
      out += ch + text.slice(i + 1, Math.max(i + 1, stop - 1)).replace(/[^\n]/g, ' ') + (stop - 1 > i && text[stop - 1] === ch ? ch : '');
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * The token under a caret column (0-based) for `intellij.editor.clicked`: identifier, string literal or JSON key,
 * with quotes stripped; null on whitespace/punctuation.
 */
export function tokenAt(line: string, col: number): string | null {
  if (!line) return null;
  // String literal containing the column?
  const strRe = /"((?:[^"\\]|\\.)*)"/g;
  for (let m = strRe.exec(line); m; m = strRe.exec(line)) {
    if (col >= m.index && col <= m.index + m[0].length - 1) return m[1];
  }
  const c = Math.min(col, line.length);
  let s = c;
  let e = c;
  while (s > 0 && isId(line[s - 1])) s--;
  while (e < line.length && isId(line[e])) e++;
  if (s === e) {
    if (c > 0 && isId(line[c - 1])) return tokenAt(line, c - 1);
    return null;
  }
  return line.slice(s, e);
}
