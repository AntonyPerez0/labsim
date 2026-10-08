/**
 * Renderer for the Field Manual markdown subset (`parseManual` in `src/content/manual/markdown.ts`):
 * h2/h3, paragraphs, bullet/numbered lists (one nested level), fenced code, tables, callouts
 * (note / tip / warning / illustrative / in-the-sim), rules; inline bold/italic/code, article links,
 * `{F123}` fact chips with hover cards, and `†` illustrative markers. Bold terms that are glossary
 * entries get a definition hover card.
 */
import { Fragment, useMemo, type ReactNode } from 'react';
import { articleById, factById, glossaryLookup, parseManual, type Block, type Inline, type ListItem } from '@/content';
import { HoverCard, IllustrativeBadge } from '@/ui/kit';

export interface MarkdownProps {
  body: string;
  /** Open another article (`[[id]]` links). */
  onLink: (articleId: string) => void;
}

export function ManualMarkdown({ body, onLink }: MarkdownProps) {
  const blocks = useMemo<Block[] | null>(() => {
    try {
      return parseManual(body);
    } catch (err) {
      console.warn('[manual] parse failed', err);
      return null;
    }
  }, [body]);
  if (!blocks) return <pre className="md-code">{body}</pre>;
  return (
    <div className="md">
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} onLink={onLink} />
      ))}
    </div>
  );
}

function BlockView({ b, onLink }: { b: Block; onLink: (id: string) => void }) {
  switch (b.t) {
    case 'h2':
      return <h2 className="md-h2" id={slug(b.text)}>{inl(b.inline, onLink)}</h2>;
    case 'h3':
      return <h3 className="md-h3" id={slug(b.text)}>{inl(b.inline, onLink)}</h3>;
    case 'p':
      return <p className="md-p">{inl(b.inline, onLink)}</p>;
    case 'ul':
      return <ul className="md-ul">{items(b.items, onLink, 'ul')}</ul>;
    case 'ol':
      return <ol className="md-ol">{items(b.items, onLink, 'ol')}</ol>;
    case 'code':
      return (
        <div className="md-codeblock">
          {b.lang && b.lang !== 'text' ? <span className="md-codeblock__lang">{b.lang}</span> : null}
          <pre className="md-code">
            <code>{b.code}</code>
          </pre>
        </div>
      );
    case 'table':
      return (
        <div className="md-tablewrap">
          <table className="md-table">
            <thead>
              <tr>
                {b.header.map((c, i) => (
                  <th key={i}>{inl(c, onLink)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j}>{inl(c, onLink)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'callout':
      return (
        <aside className={`md-callout md-callout--${b.kind}`}>
          <span className="md-callout__icon" aria-hidden>
            {b.kind === 'tip' ? '✓' : b.kind === 'warning' ? '!' : b.kind === 'illustrative' ? '†' : b.kind === 'sim' ? '◆' : 'i'}
          </span>
          <div>{inl(b.inline, onLink)}</div>
        </aside>
      );
    case 'hr':
      return <hr className="md-hr" />;
  }
}

function items(list: ListItem[], onLink: (id: string) => void, kind: 'ul' | 'ol'): ReactNode {
  return list.map((it, i) => (
    <li key={i}>
      {inl(it.inline, onLink)}
      {it.children?.length ? kind === 'ol' ? <ol>{items(it.children, onLink, kind)}</ol> : <ul>{items(it.children, onLink, kind)}</ul> : null}
    </li>
  ));
}

export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function plain(tokens: Inline[]): string {
  return tokens.map((t) => (t.t === 'text' || t.t === 'code' ? t.v : t.t === 'bold' || t.t === 'italic' ? plain(t.c) : '')).join('');
}

/** Render inline tokens. */
export function inl(tokens: Inline[], onLink: (id: string) => void): ReactNode {
  return tokens.map((t, i) => <Fragment key={i}>{inlineToken(t, onLink)}</Fragment>);
}

function inlineToken(t: Inline, onLink: (id: string) => void): ReactNode {
  switch (t.t) {
    case 'text':
      return t.v;
    case 'bold': {
      const term = glossaryLookup(plain(t.c));
      const content = <strong>{inl(t.c, onLink)}</strong>;
      return term ? (
        <HoverCard
          width={300}
          content={
            <div className="gloss-card">
              <div className="gloss-card__term">{term.term}</div>
              <div className="gloss-card__def">{term.definition}</div>
              {term.illustrative ? <IllustrativeBadge compact /> : null}
            </div>
          }
        >
          <span className="md-term">{content}</span>
        </HoverCard>
      ) : (
        content
      );
    }
    case 'italic':
      return <em>{inl(t.c, onLink)}</em>;
    case 'code':
      return <code className="md-inline-code">{t.v}</code>;
    case 'link': {
      const a = articleById(t.id);
      return (
        <a
          href={`#manual/${t.id}`}
          className={`md-link${a ? '' : ' is-broken'}`}
          onClick={(e) => {
            e.preventDefault();
            if (a) onLink(t.id);
          }}
        >
          {t.label ?? a?.title ?? t.id}
        </a>
      );
    }
    case 'fact': {
      const f = factById(t.id);
      return (
        <HoverCard
          width={340}
          content={
            <div className="fact-card">
              <div className="fact-card__head">
                <span className="mono">{t.id}</span>
                {f?.ref ? <span className="teach__ref">{f.ref}</span> : null}
                {f?.illustrative ? <IllustrativeBadge compact /> : null}
                {f ? <span className={`fact-card__tier fact-card__tier--${f.tier}`}>{f.tier}</span> : null}
              </div>
              <div>{f?.text ?? 'Unknown fact'}</div>
              {f?.section ? <div className="muted fact-card__sec">{f.section}</div> : null}
            </div>
          }
        >
          <span className={`md-fact${f?.illustrative ? ' is-illus' : ''}`}>{t.id}</span>
        </HoverCard>
      );
    }
    case 'illus':
      return (
        <span className="md-dagger" title="Illustrative (sim only): invented for the simulation; not a real-lab fact.">
          †
        </span>
      );
  }
}
