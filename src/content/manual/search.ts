/**
 * Ranked full-text search over the Field Manual (GP §2.6: "typing 5444 finds the ADB entry,
 * config.properties, …"). Fields are weighted title > keywords > glossary alias > tags > summary > body >
 * fact text; multi-word queries require every word to match somewhere (falling back to any-word matching
 * when nothing matches all words). Deterministic; the index is built lazily on first use.
 */
import type { ManualArticle, GlossaryTerm, Fact } from '../schema';
import { plainText } from './markdown';

export interface ManualSearchHit {
  article: ManualArticle;
  score: number;
  /** ~160-char plain-text excerpt around the first match (or the summary). */
  snippet: string;
}

interface Indexed {
  article: ManualArticle;
  title: string;
  keywords: string;
  tags: string;
  summary: string;
  body: string;
  bodyLines: string[];
  facts: string;
  glossary: string;
}

/** Lower-case and fold typographic variants so "5V", "5 V", "xy_touch" and "xy touch" all meet. */
export function normalise(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[“”"'’`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_WORDS = new Set(
  'a an and are as at be by can do does for from how i in is it its me my of on or should the to was what when where which who why with you your'.split(' '),
);

/**
 * Query terms: alphanumeric runs, keeping inner `.`, `_`, `-`, `/`, `:` (so "config.properties", "app/src/main",
 * "10.42.1.5"). Common English stop words are dropped unless the query is nothing but stop words.
 */
export function terms(q: string): string[] {
  const out = normalise(q).match(/[a-z0-9]+(?:[._\-/:][a-z0-9]+)*/g) ?? [];
  const content = out.filter((t) => !STOP_WORDS.has(t));
  return Array.from(new Set(content.length ? content : out));
}

function count(hay: string, needle: string, cap = 5): number {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i >= 0 && n < cap) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Word-start match ("tess" matches "tesseract"); exact word match scores higher. */
function wordScore(hay: string, term: string): number {
  if (!hay.includes(term)) return 0;
  const re = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}([^a-z0-9]|$)`);
  if (re.test(hay)) return 1;
  const re2 = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}`);
  return re2.test(hay) ? 0.7 : 0.3;
}

export function createManualSearch(articles: ManualArticle[], glossary: GlossaryTerm[], facts: Fact[]) {
  let index: Indexed[] | null = null;
  const build = (): Indexed[] => {
    const factText = new Map(facts.map((f) => [f.id, f.text]));
    return articles.map((a) => {
      const body = plainText(a.body);
      const gl = glossary.filter((g) => g.articleId === a.id).flatMap((g) => [g.term, ...g.aliases]);
      return {
        article: a,
        title: normalise(a.title),
        keywords: normalise((a.keywords ?? []).join(' | ') + ' | ' + a.id.replace(/-/g, ' ')),
        tags: normalise(a.tags.join(' ')),
        summary: normalise(a.summary),
        body: normalise(body),
        bodyLines: body.split('\n').filter((l) => l.trim()),
        facts: normalise(a.factIds.map((id) => factText.get(id) ?? '').join(' ')),
        glossary: normalise(gl.join(' | ')),
      };
    });
  };

  function scoreTerm(ix: Indexed, t: string): number {
    return (
      wordScore(ix.title, t) * 12 +
      wordScore(ix.keywords, t) * 9 +
      wordScore(ix.glossary, t) * 7 +
      wordScore(ix.tags, t) * 5 +
      wordScore(ix.summary, t) * 4 +
      Math.min(count(ix.body, t, 8), 8) * 1.5 * (wordScore(ix.body, t) || 0) +
      wordScore(ix.facts, t) * 2
    );
  }

  function snippetFor(ix: Indexed, ts: string[]): string {
    const line = ix.bodyLines.find((l) => ts.some((t) => normalise(l).includes(t)));
    const src = (line ?? ix.article.summary).replace(/\s+/g, ' ').trim();
    if (src.length <= 160) return src;
    const n = normalise(src);
    const pos = Math.max(0, ts.map((t) => n.indexOf(t)).filter((p) => p >= 0).sort((a, b) => a - b)[0] ?? 0);
    const start = Math.max(0, pos - 50);
    return (start > 0 ? '…' : '') + src.slice(start, start + 157).trim() + '…';
  }

  return function search(query: string, limit = 20): ManualSearchHit[] {
    index ??= build();
    const ts = terms(query);
    if (!ts.length) return [];
    const phrase = normalise(query);
    const run = (requireAll: boolean) =>
      index!
        .map((ix) => {
          const per = ts.map((t) => scoreTerm(ix, t));
          if (requireAll && per.some((s) => s === 0)) return null;
          let score = per.reduce((a, b) => a + b, 0);
          if (ts.length > 1 || phrase.length > 2) {
            if (ix.title.includes(phrase)) score += 30;
            else if (ix.keywords.includes(phrase)) score += 20;
            else if (ix.glossary.includes(phrase)) score += 15;
            else if (ix.summary.includes(phrase)) score += 10;
            else if (ix.body.includes(phrase)) score += 6;
          }
          return score > 0 ? { article: ix.article, score: Math.round(score * 10) / 10, snippet: snippetFor(ix, ts) } : null;
        })
        .filter((h): h is ManualSearchHit => h !== null)
        .sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title))
        .slice(0, limit);
    const all = run(true);
    return all.length || ts.length === 1 ? all : run(false);
  };
}
