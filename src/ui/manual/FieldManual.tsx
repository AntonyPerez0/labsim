/**
 * Field Manual (GP §2.6): searchable codex. Sidebar = search, chapters (categories with their entries),
 * Glossary, Flashcards (Leitner hub) and Progress; main pane = landing / category / article / search
 * results. Back/forward history inside the manual; `/` focuses search. Used by the `manual` overlay
 * (in game, pausing) and the main-menu Field Manual screen.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { articleById, articlesInCategory, MANUAL_CATEGORIES, type ManualCategory } from '@/content';
import { Button, LabWordmark, Icon, Kbd, TextField } from '@/ui/kit';
import { mq } from '@/ui/services/missions';
import { ArticleView } from './ArticleView';
import { CardsHub, CategoryPage, categoryIcon, GlossaryPage, ManualHome, ProgressPage, SearchResults } from './ManualPages';

type Page = { kind: 'home' } | { kind: 'category'; category: ManualCategory } | { kind: 'article'; id: string } | { kind: 'glossary' } | { kind: 'cards' } | { kind: 'progress' };

function samePage(a: Page, b: Page): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function FieldManual({ articleId, onClose, initial }: { articleId?: string; onClose?: () => void; initial?: 'cards' | 'glossary' | 'progress' }) {
  const start: Page = articleId && articleById(articleId) ? { kind: 'article', id: articleId } : initial ? { kind: initial } : { kind: 'home' };
  const [hist, setHist] = useState<{ stack: Page[]; i: number }>({ stack: [start], i: 0 });
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const page = hist.stack[hist.i]!;
  const fm = useGame((s) => s.progress.fieldManual);
  const due = mq('dueFlashcards', [], []).length;

  const go = (p: Page) => {
    setQuery('');
    setHist((h) => {
      if (samePage(h.stack[h.i]!, p)) return h;
      const stack = [...h.stack.slice(0, h.i + 1), p].slice(-50);
      return { stack, i: stack.length - 1 };
    });
  };
  const open = (id: string) => go({ kind: 'article', id });

  useEffect(() => {
    if (articleId && articleById(articleId)) go({ kind: 'article', id: articleId });
  }, [articleId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [hist.i, hist.stack.length, query.length === 0]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA') return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.altKey && e.key === 'ArrowLeft') setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) }));
      else if (e.altKey && e.key === 'ArrowRight') setHist((h) => ({ ...h, i: Math.min(h.stack.length - 1, h.i + 1) }));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const activeCategory = page.kind === 'category' ? page.category : page.kind === 'article' ? articleById(page.id)?.category : null;

  return (
    <div className="fm" data-ui-interactive>
      <aside className="fm__side">
        <div className="fm__brand">
          <LabWordmark size={22} />
          <div>
            <div className="fm__brand-title">Field Manual</div>
            <div className="fm__brand-sub">LabSim Automation Lab</div>
          </div>
        </div>
        <TextField
          value={query}
          onChange={setQuery}
          placeholder="Search — try 5444"
          icon={<Icon name="search" size={14} />}
          inputRef={searchRef}
          ariaLabel="Search the Field Manual"
          onKeyDown={(e) => {
            if (e.key === 'Escape' && query) {
              e.preventDefault();
              e.stopPropagation();
              setQuery('');
            }
          }}
        />
        <nav className="fm__nav">
          <button type="button" className={`fm__nav-item${page.kind === 'home' && !query ? ' is-active' : ''}`} onClick={() => go({ kind: 'home' })}>
            <Icon name="home" size={15} /> Overview
          </button>
          <button type="button" className={`fm__nav-item${page.kind === 'cards' && !query ? ' is-active' : ''}`} onClick={() => go({ kind: 'cards' })}>
            <Icon name="cards" size={15} /> Flashcards
            {due ? <span className="fm__badge">{due}</span> : null}
          </button>
          <button type="button" className={`fm__nav-item${page.kind === 'glossary' && !query ? ' is-active' : ''}`} onClick={() => go({ kind: 'glossary' })}>
            <Icon name="list" size={15} /> Glossary
          </button>
          <button type="button" className={`fm__nav-item${page.kind === 'progress' && !query ? ' is-active' : ''}`} onClick={() => go({ kind: 'progress' })}>
            <Icon name="chart" size={15} /> Progress
          </button>
          <div className="fm__nav-sep">Chapters</div>
          {MANUAL_CATEGORIES.map((c) => {
            const open_ = activeCategory === c;
            return (
              <div key={c} className="fm__chapter">
                <button type="button" className={`fm__nav-item${page.kind === 'category' && page.category === c && !query ? ' is-active' : ''}`} onClick={() => go({ kind: 'category', category: c })}>
                  <Icon name={categoryIcon(c)} size={15} /> {c}
                  <span className="fm__count">{articlesInCategory(c).length}</span>
                </button>
                {open_ ? (
                  <div className="fm__entries">
                    {articlesInCategory(c).map((a) => (
                      <button key={a.id} type="button" className={`fm__entry${page.kind === 'article' && page.id === a.id && !query ? ' is-active' : ''}${fm.read.includes(a.id) ? ' is-read' : ''}`} onClick={() => open(a.id)}>
                        {a.title}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>
      </aside>
      <section className="fm__main">
        <header className="fm__bar">
          <Button size="sm" variant="ghost" icon="arrow-left" disabled={hist.i === 0} onClick={() => setHist((h) => ({ ...h, i: h.i - 1 }))} aria-label="Back" title="Back (Alt+←)" />
          <Button size="sm" variant="ghost" icon="arrow-right" disabled={hist.i >= hist.stack.length - 1} onClick={() => setHist((h) => ({ ...h, i: h.i + 1 }))} aria-label="Forward" title="Forward (Alt+→)" />
          <span className="fm__bar-hint">
            <Kbd k="/" size="sm" /> search
          </span>
          <span className="spacer" />
          {onClose ? (
            <Button size="sm" variant="ghost" icon="x" kbd="Esc" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </header>
        <div className="fm__content" ref={mainRef}>
          {query.trim() ? (
            <SearchResults query={query} onOpen={open} />
          ) : page.kind === 'home' ? (
            <ManualHome onOpen={open} onCategory={(c) => go({ kind: 'category', category: c })} />
          ) : page.kind === 'category' ? (
            <CategoryPage category={page.category} onOpen={open} />
          ) : page.kind === 'article' ? (
            <ArticleView key={page.id} id={page.id} onOpen={open} />
          ) : page.kind === 'glossary' ? (
            <GlossaryPage onOpen={open} />
          ) : page.kind === 'cards' ? (
            <CardsHub />
          ) : (
            <ProgressPage />
          )}
        </div>
      </section>
    </div>
  );
}
