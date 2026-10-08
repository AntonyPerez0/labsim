/**
 * Bash-like command-line parser: quoting (`'…'`, `"…"`, `\`), `~` and `$VAR` expansion, pipes `|`,
 * lists `&&` `||` `;`, redirections `>` `>>` `2>/dev/null` `2>&1`, and `VAR=value cmd` prefixes.
 */

export interface SimpleCommand {
  argv: string[];
  /** `VAR=value` prefixes. */
  assigns: Record<string, string>;
  /** stdout redirection. */
  redirect: { path: string; append: boolean } | null;
  /** stderr discarded (`2>/dev/null`) or merged (`2>&1`). */
  stderr: 'tty' | 'null' | 'stdout';
}
export interface Pipeline {
  commands: SimpleCommand[];
}
export interface CommandList {
  items: { pipeline: Pipeline; op: ';' | '&&' | '||' | null }[];
}

type Tok = { t: 'word'; v: string; quoted: boolean } | { t: 'op'; v: string };

export class ParseError extends Error {}

export function tokenize(line: string, vars: Record<string, string>): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const c = line[i]!;
    if (c === ' ' || c === '\t') {
      i++;
      continue;
    }
    if (c === '#') break;
    if (line.startsWith('2>&1', i)) {
      out.push({ t: 'op', v: '2>&1' });
      i += 4;
      continue;
    }
    if (line.startsWith('2>', i)) {
      out.push({ t: 'op', v: '2>' });
      i += 2;
      continue;
    }
    let matched: string | null = null;
    for (const op of ['&&', '||', '>>', '|', ';', '>', '&']) {
      if (line.startsWith(op, i)) {
        matched = op;
        break;
      }
    }
    if (matched) {
      out.push({ t: 'op', v: matched });
      i += matched.length;
      continue;
    }
    // word
    let w = '';
    let quoted = false;
    let first = true;
    while (i < n) {
      const ch = line[i]!;
      if (ch === ' ' || ch === '\t' || '|;&><'.includes(ch)) break;
      if (ch === "'") {
        const j = line.indexOf("'", i + 1);
        if (j < 0) throw new ParseError("unexpected EOF while looking for matching `''");
        w += line.slice(i + 1, j);
        quoted = true;
        i = j + 1;
        first = false;
        continue;
      }
      if (ch === '"') {
        let j = i + 1;
        let buf = '';
        while (j < n && line[j] !== '"') {
          if (line[j] === '\\' && j + 1 < n && '"\\$`'.includes(line[j + 1]!)) {
            buf += line[j + 1];
            j += 2;
            continue;
          }
          if (line[j] === '$') {
            const m = /^\$(\{(\w+)\}|(\w+))/.exec(line.slice(j));
            if (m) {
              buf += vars[m[2] ?? m[3]!] ?? '';
              j += m[0].length;
              continue;
            }
          }
          buf += line[j];
          j++;
        }
        if (j >= n) throw new ParseError('unexpected EOF while looking for matching `"\'');
        w += buf;
        quoted = true;
        i = j + 1;
        first = false;
        continue;
      }
      if (ch === '\\' && i + 1 < n) {
        w += line[i + 1];
        i += 2;
        first = false;
        continue;
      }
      if (ch === '$') {
        const m = /^\$(\{(\w+)\}|(\w+)|\?)/.exec(line.slice(i));
        if (m) {
          w += m[0] === '$?' ? (vars['?'] ?? '0') : (vars[m[2] ?? m[3]!] ?? '');
          i += m[0].length;
          first = false;
          continue;
        }
      }
      if (ch === '~' && first && (i + 1 >= n || line[i + 1] === '/' || line[i + 1] === ' ')) {
        w += vars['HOME'] ?? '~';
        i++;
        first = false;
        continue;
      }
      w += ch;
      i++;
      first = false;
    }
    out.push({ t: 'word', v: w, quoted });
  }
  return out;
}

export function parse(line: string, vars: Record<string, string>): CommandList {
  const toks = tokenize(line, vars);
  const list: CommandList = { items: [] };
  let cmds: SimpleCommand[] = [];
  let cur: SimpleCommand = { argv: [], assigns: {}, redirect: null, stderr: 'tty' };
  const endCmd = (): void => {
    if (!cur.argv.length && !Object.keys(cur.assigns).length) throw new ParseError('syntax error near unexpected token');
    cmds.push(cur);
    cur = { argv: [], assigns: {}, redirect: null, stderr: 'tty' };
  };
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k]!;
    if (t.t === 'word') {
      const m = !t.quoted && cur.argv.length === 0 ? /^([A-Za-z_]\w*)=(.*)$/.exec(t.v) : null;
      if (m) cur.assigns[m[1]!] = m[2]!;
      else cur.argv.push(t.v);
      continue;
    }
    if (t.v === '>' || t.v === '>>') {
      const nxt = toks[++k];
      if (!nxt || nxt.t !== 'word') throw new ParseError(`syntax error near unexpected token \`newline'`);
      cur.redirect = { path: nxt.v, append: t.v === '>>' };
      continue;
    }
    if (t.v === '2>') {
      const nxt = toks[++k];
      if (!nxt || nxt.t !== 'word') throw new ParseError(`syntax error near unexpected token \`newline'`);
      cur.stderr = nxt.v === '/dev/null' ? 'null' : 'tty';
      continue;
    }
    if (t.v === '2>&1') {
      cur.stderr = 'stdout';
      continue;
    }
    if (t.v === '|') {
      endCmd();
      continue;
    }
    if (t.v === '&') continue;
    // list operator
    endCmd();
    list.items.push({ pipeline: { commands: cmds }, op: t.v as ';' | '&&' | '||' });
    cmds = [];
  }
  if (cur.argv.length || Object.keys(cur.assigns).length) endCmd();
  if (cmds.length) list.items.push({ pipeline: { commands: cmds }, op: null });
  else if (list.items.length) list.items[list.items.length - 1]!.op = null;
  return list;
}
