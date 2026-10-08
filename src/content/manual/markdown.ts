/**
 * Reference parser for the Field Manual markdown subset documented on `ManualArticle` in ../schema.ts.
 * Pure and dependency-free: the UI renders the returned blocks; tests use it to validate every article;
 * search uses `plainText()`.
 */

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; c: Inline[] }
  | { t: 'italic'; c: Inline[] }
  | { t: 'code'; v: string }
  /** Link to another article: `[[id]]` or `[[id|label]]`. */
  | { t: 'link'; id: string; label: string | null }
  /** Fact chip: `{F123}` / `{S05}`. */
  | { t: 'fact'; id: string }
  /** `†` — the preceding word / code span is an illustrative (sim-only) detail. */
  | { t: 'illus' };

export interface ListItem {
  inline: Inline[];
  children?: ListItem[];
}

export type CalloutKind = 'note' | 'tip' | 'warning' | 'illustrative' | 'sim';

export type Block =
  | { t: 'h2' | 'h3'; text: string; inline: Inline[] }
  | { t: 'p'; inline: Inline[] }
  | { t: 'ul' | 'ol'; items: ListItem[] }
  | { t: 'code'; lang: string; code: string }
  | { t: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { t: 'callout'; kind: CalloutKind; inline: Inline[] }
  | { t: 'hr' };

const INLINE_RE = /(`[^`]+`)|(\*\*.+?\*\*)|(\*[^*\s][^*]*?\*)|(\[\[[^\]]+\]\])|(\{[FS]\d{2,3}\})|(†)/g;

/** Parse inline markup into tokens. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  INLINE_RE.lastIndex = 0;
  for (let m = INLINE_RE.exec(src); m; m = INLINE_RE.exec(src)) {
    if (m.index > last) out.push({ t: 'text', v: src.slice(last, m.index) });
    const s = m[0];
    if (m[1]) out.push({ t: 'code', v: s.slice(1, -1) });
    else if (m[2]) out.push({ t: 'bold', c: parseInline(s.slice(2, -2)) });
    else if (m[3]) out.push({ t: 'italic', c: parseInline(s.slice(1, -1)) });
    else if (m[4]) {
      const inner = s.slice(2, -2);
      const bar = inner.indexOf('|');
      out.push(bar >= 0 ? { t: 'link', id: inner.slice(0, bar).trim(), label: inner.slice(bar + 1).trim() } : { t: 'link', id: inner.trim(), label: null });
    } else if (m[5]) out.push({ t: 'fact', id: s.slice(1, -1) });
    else if (m[6]) out.push({ t: 'illus' });
    last = m.index + s.length;
    INLINE_RE.lastIndex = last;
  }
  if (last < src.length) out.push({ t: 'text', v: src.slice(last) });
  return out;
}

const CALLOUT_LABELS: [RegExp, CalloutKind][] = [
  [/^\*\*Tip:\*\*/i, 'tip'],
  [/^\*\*Warning:\*\*/i, 'warning'],
  [/^\*\*Illustrative \(sim only\):\*\*/i, 'illustrative'],
  [/^\*\*In the sim:\*\*/i, 'sim'],
];

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
const UL_RE = /^(\s*)[-*] (.*)$/;
const OL_RE = /^(\s*)\d+\. (.*)$/;

/** Parse an article body into blocks. Throws on unterminated code fences. */
export function parseManual(body: string): Block[] {
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    // fenced code
    const fence = /^```(\w*)\s*$/.exec(line.trim());
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') code.push(lines[i++]);
      if (i >= lines.length) throw new Error('Unterminated code fence');
      i++;
      blocks.push({ t: 'code', lang: fence[1] || 'text', code: code.join('\n') });
      continue;
    }
    if (/^###\s/.test(line)) {
      const text = line.replace(/^###\s+/, '').trim();
      blocks.push({ t: 'h3', text, inline: parseInline(text) });
      i++;
      continue;
    }
    if (/^##\s/.test(line)) {
      const text = line.replace(/^##\s+/, '').trim();
      blocks.push({ t: 'h2', text, inline: parseInline(text) });
      i++;
      continue;
    }
    if (/^---\s*$/.test(line)) {
      blocks.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^>/.test(line)) {
      const parts: string[] = [];
      while (i < lines.length && /^>/.test(lines[i])) parts.push(lines[i++].replace(/^>\s?/, ''));
      const text = parts.join(' ').trim();
      const kind = CALLOUT_LABELS.find(([re]) => re.test(text))?.[1] ?? 'note';
      blocks.push({ t: 'callout', kind, inline: parseInline(text) });
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      if (rows.length < 2 || !isTableSep(rows[1])) throw new Error(`Table without header separator: ${rows[0]}`);
      const header = splitRow(rows[0]).map(parseInline);
      const body2 = rows.slice(2).map((r) => splitRow(r).map(parseInline));
      blocks.push({ t: 'table', header, rows: body2 });
      continue;
    }
    if (UL_RE.test(line) || OL_RE.test(line)) {
      const ordered = !UL_RE.test(line);
      const re = ordered ? OL_RE : UL_RE;
      const items: ListItem[] = [];
      while (i < lines.length && lines[i].trim()) {
        const l = lines[i];
        const top = re.exec(l);
        const nested = UL_RE.exec(l) ?? OL_RE.exec(l);
        if (top && top[1].length === 0) {
          items.push({ inline: parseInline(top[2].trim()) });
        } else if (nested && nested[1].length > 0 && items.length) {
          const parent = items[items.length - 1];
          (parent.children ??= []).push({ inline: parseInline(nested[2].trim()) });
        } else if (/^\s{2,}\S/.test(l) && items.length) {
          // continuation line of the previous item
          const parent = items[items.length - 1];
          parent.inline.push({ t: 'text', v: ' ' }, ...parseInline(l.trim()));
        } else break;
        i++;
      }
      blocks.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    // paragraph
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,3}\s|>|```|\s*\||---\s*$)/.test(lines[i]) &&
      !UL_RE.test(lines[i]) &&
      !OL_RE.test(lines[i])
    )
      para.push(lines[i++].trim());
    blocks.push({ t: 'p', inline: parseInline(para.join(' ')) });
  }
  return blocks;
}

/** Plain text of inline tokens (links use their label or id, † becomes "(illustrative)"). */
export function inlineText(tokens: Inline[]): string {
  return tokens
    .map((t) => {
      switch (t.t) {
        case 'text':
        case 'code':
          return t.v;
        case 'bold':
        case 'italic':
          return inlineText(t.c);
        case 'link':
          return t.label ?? t.id;
        case 'fact':
          return t.id;
        case 'illus':
          return '';
      }
    })
    .join('');
}

/** Plain text of a whole body (for search and snippets). */
export function plainText(body: string): string {
  const out: string[] = [];
  const items = (list: ListItem[]) => list.forEach((it) => (out.push(inlineText(it.inline)), it.children && items(it.children)));
  for (const b of parseManual(body)) {
    switch (b.t) {
      case 'h2':
      case 'h3':
        out.push(b.text);
        break;
      case 'p':
      case 'callout':
        out.push(inlineText(b.inline));
        break;
      case 'ul':
      case 'ol':
        items(b.items);
        break;
      case 'code':
        out.push(b.code);
        break;
      case 'table':
        out.push(b.header.map(inlineText).join(' | '));
        b.rows.forEach((r) => out.push(r.map(inlineText).join(' | ')));
        break;
      case 'hr':
        break;
    }
  }
  return out.join('\n');
}

/** Every `[[link]]` target and `{F###}` chip used in a body. */
export function references(body: string): { links: string[]; facts: string[] } {
  const links: string[] = [];
  const facts: string[] = [];
  const walk = (tokens: Inline[]) =>
    tokens.forEach((t) => {
      if (t.t === 'link') links.push(t.id);
      else if (t.t === 'fact') facts.push(t.id);
      else if (t.t === 'bold' || t.t === 'italic') walk(t.c);
    });
  const items = (list: ListItem[]) => list.forEach((it) => (walk(it.inline), it.children && items(it.children)));
  for (const b of parseManual(body)) {
    if (b.t === 'p' || b.t === 'callout' || b.t === 'h2' || b.t === 'h3') walk(b.inline);
    else if (b.t === 'ul' || b.t === 'ol') items(b.items);
    else if (b.t === 'table') [b.header, ...b.rows].forEach((r) => r.forEach(walk));
  }
  return { links, facts };
}
