/**
 * Field Manual pages other than articles: landing, search results, glossary (hover cards), flashcard
 * hub (Leitner boxes, decks, due), and progress (modules + tag mastery by chapter).
 */
import { useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { articleById, articlesInCategory, GLOSSARY, MANUAL_CATEGORIES, MODULES, searchManual, TAG_GROUPS, type ManualCategory } from '@/content';
import { Button, Card, Chip, EmptyState, HoverCard, Icon, IllustrativeBadge, ProgressBar, Stars, TextField } from '@/ui/kit';
import { openOverlay } from '@/ui/services/nav';
import { dayNumber } from '@/core/persistence';
import { isModuleComplete, leitnerBoxes, leitnerSummaryFor, masteryViews } from '@/ui/data/views';
import { mq } from '@/ui/services/missions';
import { deckModule, pct } from '@/ui/services/format';

const CATEGORY_ICON: Record<ManualCategory, string> = {
  'Lab Basics': 'home',
  Hardware: 'wrench',
  Power: 'bolt',
  Robots: 'robot',
  Orchestrator: 'layers',
  Pipelines: 'pipeline',
  'Test Frameworks': 'terminal',
  'Cards & Payments': 'card',
  Tools: 'screwdriver',
  Infrastructure: 'cpu',
  'Teams & History': 'user',
  Troubleshooting: 'alert',
  'About the Sim': 'info',
};

export function categoryIcon(c: ManualCategory): string {
  return CATEGORY_ICON[c] ?? 'book';
}

export function ManualHome({ onOpen, onCategory }: { onOpen: (id: string) => void; onCategory: (c: ManualCategory) => void }) {
  const fm = useGame((s) => s.progress.fieldManual);
  const recent = fm.read.slice(-4).reverse().map(articleById).filter(Boolean);
  const bookmarks = fm.bookmarks.map(articleById).filter(Boolean);
  return (
    <div className="mh">
      <div className="mh__hero">
        <h1>Field Manual</h1>
        <p className="muted">Everything the lab expects you to know — searchable. Facts marked † are illustrative details invented for the sim.</p>
      </div>
      {bookmarks.length || recent.length ? (
        <div className="mh__quick">
          {bookmarks.length ? (
            <div>
              <div className="caps">Bookmarks</div>
              {bookmarks.map((a) => (
                <button key={a!.id} type="button" className="mh__link" onClick={() => onOpen(a!.id)}>
                  <Icon name="bookmark" size={13} /> {a!.title}
                </button>
              ))}
            </div>
          ) : null}
          {recent.length ? (
            <div>
              <div className="caps">Recently read</div>
              {recent.map((a) => (
                <button key={a!.id} type="button" className="mh__link" onClick={() => onOpen(a!.id)}>
                  <Icon name="book" size={13} /> {a!.title}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mh__grid">
        {MANUAL_CATEGORIES.map((c) => {
          const list = articlesInCategory(c);
          const read = list.filter((a) => fm.read.includes(a.id)).length;
          return (
            <Card key={c} className="mh__cat" onClick={() => onCategory(c)}>
              <div className="mh__cat-icon">
                <Icon name={categoryIcon(c)} size={20} />
              </div>
              <div className="mh__cat-title">{c}</div>
              <div className="mh__cat-meta muted">
                {list.length} entries · {read} read
              </div>
              <ProgressBar value={list.length ? read / list.length : 0} height={3} />
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryPage({ category, onOpen }: { category: ManualCategory; onOpen: (id: string) => void }) {
  const fm = useGame((s) => s.progress.fieldManual);
  const list = articlesInCategory(category);
  return (
    <div className="mcat">
      <div className="mcat__head">
        <Icon name={categoryIcon(category)} size={22} />
        <h1>{category}</h1>
      </div>
      <div className="mcat__list">
        {list.map((a) => (
          <button key={a.id} type="button" className="mcat__item" onClick={() => onOpen(a.id)}>
            <div className="mcat__item-title">
              {a.title}
              {fm.unlocked.includes(a.id) && !fm.read.includes(a.id) ? <Chip size="sm" tone="cyan">New</Chip> : null}
              {fm.read.includes(a.id) ? <Icon name="check" size={13} className="ok" /> : null}
            </div>
            <div className="mcat__item-sum muted">{a.summary}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SearchResults({ query, onOpen }: { query: string; onOpen: (id: string) => void }) {
  const hits = useMemo(() => {
    try {
      return searchManual(query, 25);
    } catch {
      return [];
    }
  }, [query]);
  const terms = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return GLOSSARY.filter((g) => g.term.toLowerCase().includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q))).slice(0, 4);
  }, [query]);
  return (
    <div className="msearch">
      <div className="msearch__head">
        <span className="caps">Results for</span> <span className="mono">“{query}”</span>
        <span className="muted"> · {hits.length} entries</span>
      </div>
      {terms.length ? (
        <div className="msearch__terms">
          {terms.map((t) => (
            <div key={t.term} className="msearch__term">
              <strong>{t.term}</strong> — {t.definition}
              {t.articleId ? (
                <>
                  {' '}
                  <button type="button" className="md-link" onClick={() => onOpen(t.articleId!)}>
                    Read →
                  </button>
                </>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {hits.length ? (
        hits.map((h) => (
          <button key={h.article.id} type="button" className="msearch__hit" onClick={() => onOpen(h.article.id)}>
            <div className="msearch__hit-title">
              {h.article.title} <span className="muted">· {h.article.category}</span>
            </div>
            <div className="msearch__snippet">{highlight(h.snippet, query)}</div>
          </button>
        ))
      ) : (
        <EmptyState icon="search" title="No entries match">
          Try an exact string from the lab — a port (5444), a status (Connection Failed), a class name or a file (config.properties).
        </EmptyState>
      )}
    </div>
  );
}

function highlight(text: string, q: string) {
  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return text;
  const re = new RegExp(`(${words.join('|')})`, 'gi');
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export function GlossaryPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState('');
  const terms = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = [...GLOSSARY].sort((a, b) => a.term.localeCompare(b.term, 'en', { sensitivity: 'base' }));
    return q ? list.filter((g) => g.term.toLowerCase().includes(q) || g.aliases.some((a) => a.toLowerCase().includes(q)) || g.definition.toLowerCase().includes(q)) : list;
  }, [filter]);
  const groups = useMemo(() => {
    const m = new Map<string, typeof terms>();
    for (const t of terms) {
      const k = /[a-z]/i.test(t.term[0]!) ? t.term[0]!.toUpperCase() : '#';
      (m.get(k) ?? m.set(k, []).get(k)!).push(t);
    }
    return [...m.entries()];
  }, [terms]);
  return (
    <div className="gloss">
      <div className="gloss__head">
        <h1>Glossary</h1>
        <TextField value={filter} onChange={setFilter} placeholder={`Filter ${GLOSSARY.length} terms`} icon={<Icon name="search" size={14} />} ariaLabel="Filter glossary" style={{ width: 280 }} />
      </div>
      <div className="gloss__letters">
        {groups.map(([k, list]) => (
          <section key={k} className="gloss__group">
            <div className="gloss__letter">{k}</div>
            <div className="gloss__terms">
              {list.map((t) => (
                <HoverCard
                  key={t.term}
                  width={320}
                  content={
                    <div className="gloss-card">
                      <div className="gloss-card__term">{t.term}</div>
                      {t.aliases.length ? <div className="gloss-card__aliases">also: {t.aliases.join(' · ')}</div> : null}
                      <div className="gloss-card__def">{t.definition}</div>
                      {t.illustrative ? <IllustrativeBadge /> : null}
                    </div>
                  }
                >
                  <button type="button" className={`gloss__term${t.articleId ? '' : ' is-plain'}`} onClick={() => t.articleId && onOpen(t.articleId)}>
                    {t.term}
                    {t.illustrative ? <span className="md-dagger">†</span> : null}
                  </button>
                </HoverCard>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function CardsHub() {
  const progress = useGame((s) => s.progress);
  const today = dayNumber();
  const summary = leitnerSummaryFor(progress, today);
  const boxes = leitnerBoxes(progress);
  const due = mq('dueFlashcards', [], []);
  const maxBox = Math.max(1, ...boxes);
  const decks = MODULES.filter((m) => m.deck);
  return (
    <div className="cards-hub">
      <div className="cards-hub__head">
        <div>
          <h1>Flashcards</h1>
          <p className="muted">Leitner boxes 1–5. Box 1 comes up every session; then after 1, 3, 7 and 14 days. “Got it” moves a card up a box, “Missed it” sends it back to box 1. Max 20 new cards a day.</p>
        </div>
        <Button variant="primary" size="lg" icon="cards" onClick={() => openOverlay({ kind: 'flashcards' }, { push: true })}>
          Review {due.length ? `${due.length} due` : 'now'}
        </Button>
      </div>
      <div className="cards-hub__boxes">
        {boxes.map((n, i) => (
          <div key={i} className="cards-hub__box">
            <div className="cards-hub__bar">
              <span style={{ height: `${(n / maxBox) * 100}%` }} className={`b${i + 1}`} />
            </div>
            <div className="cards-hub__n tnum">{n}</div>
            <div className="muted">Box {i + 1}</div>
          </div>
        ))}
        <div className="cards-hub__stat">
          <div className="caps">Mastery</div>
          <div className="cards-hub__big tnum">{pct(summary.overall)}</div>
          <div className="muted">of {summary.unlocked} unlocked cards in box 4+ (CERT-R5 needs 90 %)</div>
        </div>
      </div>
      <div className="caps">Decks</div>
      <div className="cards-hub__decks">
        {decks.map((m) => {
          const unlocked = isModuleComplete(progress, m.id);
          const share = summary.perDeck[m.deck!] ?? 0;
          return (
            <button key={m.id} type="button" className={`cards-hub__deck${unlocked ? '' : ' is-locked'}`} onClick={() => openOverlay({ kind: 'flashcards', deck: m.deck }, { push: true })}>
              <span className="mono">{deckModule(m.deck!)}</span>
              <span className="grow">{m.title.split(':')[0]}</span>
              {unlocked ? <ProgressBar value={share} height={4} style={{ width: 70 }} /> : <Icon name="lock" size={13} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ProgressPage() {
  const progress = useGame((s) => s.progress);
  const mastery = masteryViews(progress, Date.now());
  return (
    <div className="mprog">
      <h1>Progress</h1>
      <div className="caps">Academy modules</div>
      <div className="mprog__modules">
        {MODULES.map((m) => {
          const rec = progress.modules[m.id];
          const done = isModuleComplete(progress, m.id);
          return (
            <div key={m.id} className={`mprog__module${done ? ' is-done' : ''}`}>
              <span className="mono">{m.id}</span>
              <span className="grow">{m.title.split(':')[0]}</span>
              <Stars value={rec?.stars ?? 0} size={12} />
            </div>
          );
        })}
      </div>
      <div className="caps">Topic mastery by chapter</div>
      <div className="mprog__groups">
        {TAG_GROUPS.map((g) => {
          const tags = mastery.filter((m) => m.group === g);
          if (!tags.length) return null;
          const avg = tags.reduce((s, t) => s + t.mEff, 0) / tags.length;
          return (
            <div key={g} className="mprog__group">
              <div className="mprog__group-head">
                <span className="grow">{g}</span>
                <span className="tnum mono">{pct(avg)}</span>
              </div>
              <ProgressBar value={avg} tone={avg >= 0.8 ? 'green' : avg >= 0.4 ? 'amber' : 'grey'} height={5} />
              <div className="mprog__tags">
                {tags.map((t) => (
                  <span key={t.tag} className={`mastery-label mastery-label--${t.label}`} title={`${t.tag} · ${pct(t.mEff)} · taught in ${t.taughtIn}`}>
                    {t.def?.label ?? t.tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
