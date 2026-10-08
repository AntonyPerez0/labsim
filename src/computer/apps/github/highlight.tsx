/**
 * Light syntax highlighting (Primer light, Apps §7.1) for the repo languages, line by line with block-comment
 * state; and a small Markdown renderer (headings, lists, code, links, tables, bold/italic/inline code).
 */
import { Fragment, type ReactNode } from 'react';
import type { Lang } from './model';

const KEYWORDS: Partial<Record<Lang, string[]>> = {
  java: ['abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'new', 'package', 'private', 'protected', 'public', 'return', 'short', 'static', 'super', 'switch', 'this', 'throw', 'throws', 'try', 'void', 'while', 'var'],
  go: ['break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else', 'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface', 'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type', 'var'],
  groovy: ['def', 'pipeline', 'agent', 'stages', 'stage', 'steps', 'script', 'post', 'always', 'if', 'else', 'return', 'new'],
  gradle: ['plugins', 'id', 'dependencies', 'implementation', 'android', 'def', 'apply', 'repositories'],
  swift: ['import', 'class', 'struct', 'func', 'let', 'var', 'if', 'else', 'return', 'guard', 'enum', 'case', 'switch', 'private', 'public', 'final', 'init', 'self', 'throws', 'try'],
  csharp: ['using', 'namespace', 'class', 'public', 'private', 'static', 'void', 'var', 'new', 'return', 'if', 'else', 'foreach', 'in', 'string', 'int', 'bool', 'async', 'await', 'throw'],
  python: ['import', 'from', 'def', 'class', 'return', 'if', 'elif', 'else', 'for', 'in', 'while', 'with', 'as', 'try', 'except', 'raise', 'None', 'True', 'False', 'and', 'or', 'not'],
  shell: ['if', 'then', 'fi', 'else', 'for', 'do', 'done', 'case', 'esac', 'exec', 'export', 'FROM', 'RUN', 'COPY', 'CMD', 'ENV', 'WORKDIR', 'EXPOSE', 'ENTRYPOINT'],
};
const CONSTANTS = new Set(['true', 'false', 'null', 'nil', 'None', 'True', 'False']);

export interface HlState {
  inBlock: boolean;
}

function span(cls: string | null, text: string, key: number): ReactNode {
  return cls ? (
    <span key={key} className={cls}>
      {text}
    </span>
  ) : (
    <Fragment key={key}>{text}</Fragment>
  );
}

/** Highlight one line; `state` carries block comments across lines. */
export function highlightLine(line: string, lang: Lang, state: HlState): ReactNode[] {
  const out: ReactNode[] = [];
  let k = 0;
  if (lang === 'text' || lang === 'markdown') return [line];
  if (lang === 'json') {
    const re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(span(null, line.slice(last, m.index), k++));
      if (m[1]) {
        out.push(span(m[2] ? 'gh-hl-key' : 'gh-hl-str', m[1], k++));
        if (m[2]) out.push(span(null, m[2], k++));
      } else if (m[3]) out.push(span('gh-hl-num', m[3], k++));
      else out.push(span('gh-hl-const', m[4]!, k++));
      last = re.lastIndex;
    }
    if (last < line.length) out.push(span(null, line.slice(last), k++));
    return out;
  }
  if (lang === 'yaml' || lang === 'properties') {
    const cm = lang === 'yaml' ? /^(\s*)(#.*)$/ : /^(\s*)([#!].*)$/;
    const c = cm.exec(line);
    if (c) return [span(null, c[1]!, 0), span('gh-hl-com', c[2]!, 1)];
    const kv = lang === 'yaml' ? /^(\s*-?\s*)([\w.\-/ ]+?)(:)(\s*)(.*)$/ : /^(\s*)([\w.\-]+)(\s*[=:])(\s*)(.*)$/;
    const m = kv.exec(line);
    if (m) {
      const v = m[5]!;
      const vcls = /^["'].*["']$/.test(v) ? 'gh-hl-str' : /^-?\d+(\.\d+)?$/.test(v) || CONSTANTS.has(v) ? 'gh-hl-num' : lang === 'properties' ? 'gh-hl-str' : null;
      return [span(null, m[1]!, 0), span('gh-hl-key', m[2]!, 1), span(null, m[3]! + m[4]!, 2), span(vcls, v, 3)];
    }
    return [line];
  }
  if (lang === 'xml') {
    const re = /(<!--.*?-->)|(<\/?)([\w:.-]+)|([\w:-]+)(=)("[^"]*")|(\/?>)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line))) {
      if (m.index > last) out.push(span(null, line.slice(last, m.index), k++));
      if (m[1]) out.push(span('gh-hl-com', m[1], k++));
      else if (m[2]) {
        out.push(span(null, m[2], k++));
        out.push(span('gh-hl-tag', m[3]!, k++));
      } else if (m[4]) {
        out.push(span('gh-hl-entity', m[4], k++));
        out.push(span(null, m[5]!, k++));
        out.push(span('gh-hl-str', m[6]!, k++));
      } else out.push(span(null, m[7]!, k++));
      last = re.lastIndex;
    }
    if (last < line.length) out.push(span(null, line.slice(last), k++));
    return out;
  }
  const kws = new Set(KEYWORDS[lang] ?? []);
  const lineCom = lang === 'python' || lang === 'shell' ? '#' : '//';
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf('*/', i);
      if (end < 0) {
        out.push(span('gh-hl-com', line.slice(i), k++));
        return out;
      }
      out.push(span('gh-hl-com', line.slice(i, end + 2), k++));
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    const rest = line.slice(i);
    if (rest.startsWith(lineCom)) {
      out.push(span('gh-hl-com', rest, k++));
      return out;
    }
    if (lineCom === '//' && rest.startsWith('/*')) {
      state.inBlock = true;
      continue;
    }
    const ch = rest[0]!;
    if (ch === '"' || ch === "'" || (ch === '`' && lang === 'go')) {
      let j = 1;
      while (j < rest.length && rest[j] !== ch) j += rest[j] === '\\' ? 2 : 1;
      out.push(span('gh-hl-str', rest.slice(0, j + 1), k++));
      i += j + 1;
      continue;
    }
    if (ch === '@' && /^@\w+/.test(rest)) {
      const m = /^@\w+/.exec(rest)!;
      out.push(span('gh-hl-entity', m[0], k++));
      i += m[0].length;
      continue;
    }
    const w = /^[A-Za-z_$][\w$]*/.exec(rest);
    if (w) {
      const word = w[0];
      const after = rest.slice(word.length);
      let cls: string | null = null;
      if (kws.has(word)) cls = 'gh-hl-kw';
      else if (CONSTANTS.has(word)) cls = 'gh-hl-const';
      else if (/^\s*\(/.test(after)) cls = 'gh-hl-fn';
      else if (/^[A-Z][A-Za-z0-9]*$/.test(word) && word.length > 1 && /[a-z]/.test(word)) cls = 'gh-hl-type';
      out.push(span(cls, word, k++));
      i += word.length;
      continue;
    }
    const n = /^\d+(\.\d+)?[fFlLdD]?/.exec(rest);
    if (n) {
      out.push(span('gh-hl-num', n[0], k++));
      i += n[0].length;
      continue;
    }
    const p = /^[^A-Za-z_$\d"'`@/#]+/.exec(rest);
    const t = p ? p[0] : ch;
    out.push(span(null, t, k++));
    i += t.length;
  }
  return out;
}

export function highlightAll(text: string, lang: Lang): ReactNode[][] {
  const st: HlState = { inBlock: false };
  const lines = text.replace(/\n$/, '').split('\n');
  return lines.map((l) => highlightLine(l, lang, st));
}

/* ─────────────────────────── Markdown ─────────────────────────── */

function inline(text: string, key: string, onLink?: (href: string) => void): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[([^\]]+)\]\(([^)]+)\))|(@[a-z][\w-]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k}>{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(<strong key={k}>{m[2].slice(2, -2)}</strong>);
    else if (m[3]) out.push(<em key={k}>{m[3].slice(1, -1)}</em>);
    else if (m[4]) {
      const href = m[6]!;
      out.push(
        <a key={k} href={href} onClick={(e) => (e.preventDefault(), onLink?.(href))}>
          {m[5]}
        </a>,
      );
    } else if (m[7]) out.push(<strong key={k} className="gh-mention">{m[7]}</strong>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown(props: { text: string; onLink?(href: string): void }) {
  const lines = props.text.replace(/\r/g, '').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (/^```/.test(line)) {
      const lang = line.slice(3).trim();
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) body.push(lines[i++]!);
      i++;
      blocks.push(
        <pre key={key++} className="gh-md-pre" data-lang={lang || undefined}>
          <code>{body.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = h[1]!.length;
      const Tag = `h${lvl}` as 'h1';
      blocks.push(<Tag key={key++}>{inline(h[2]!, `h${key}`, props.onLink)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*+]\s+/, ''));
      blocks.push(
        <ul key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `u${key}-${j}`, props.onLink)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+\.\s+/, ''));
      blocks.push(
        <ol key={key++}>
          {items.map((t, j) => (
            <li key={j}>{inline(t, `o${key}-${j}`, props.onLink)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1]!)) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) rows.push(cells(lines[i++]!));
      blocks.push(
        <table key={key++}>
          <thead>
            <tr>
              {head.map((c, j) => (
                <th key={j}>{inline(c, `th${key}-${j}`, props.onLink)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c, `td${key}-${ri}-${j}`, props.onLink)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }
    if (/^>\s?/.test(line)) {
      const q: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!)) q.push(lines[i++]!.replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key++}>{inline(q.join(' '), `q${key}`, props.onLink)}</blockquote>);
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|```|\s*[-*+]\s|\s*\d+\.\s|\||>)/.test(lines[i]!)) para.push(lines[i++]!);
    blocks.push(<p key={key++}>{inline(para.join(' '), `p${key}`, props.onLink)}</p>);
  }
  return <div className="gh-markdown">{blocks}</div>;
}
