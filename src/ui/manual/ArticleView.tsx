/**
 * Field Manual article (GP §2.6 entry anatomy): title · summary · key facts (with illustrative badges) ·
 * body · practice links (incidents with personal best, drills) · flashcards for its tags · mastery bar
 * for its tags · see also. Opening an article marks it read.
 */
import { useEffect } from 'react';
import { useGame } from '@/core/store';
import { articleById, factById, FLASHCARDS, MANUAL_ARTICLES } from '@/content';
import { Button, Chip, Icon, IllustrativeBadge, ProgressBar } from '@/ui/kit';
import { hasMission, ma, maQuiet, mq } from '@/ui/services/missions';
import { openOverlay } from '@/ui/services/nav';
import { masteryViews, tagLabel } from '@/ui/data/views';
import { DRILL_CATALOG } from '@/ui/data/catalog';
import { ManualMarkdown } from './Markdown';

export function ArticleView({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const a = articleById(id);
  const progress = useGame((s) => s.progress);
  const bookmarked = progress.fieldManual.bookmarks.includes(id);
  const unlocked = progress.fieldManual.unlocked.includes(id);

  useEffect(() => {
    if (a && !progress.fieldManual.read.includes(id)) maQuiet('markManualRead', id);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return <div className="muted">Article “{id}” not found.</div>;

  const facts = a.factIds.map((f) => factById(f)).filter((f): f is NonNullable<typeof f> => !!f);
  const tagSet = new Set(a.tags);
  const mastery = masteryViews(progress, Date.now()).filter((m) => tagSet.has(m.tag) || tagSet.has(m.parent));
  const masteryAvg = mastery.length ? mastery.reduce((s, m) => s + m.mEff, 0) / mastery.length : 0;
  const cards = FLASHCARDS.filter((c) => c.tags.some((t) => tagSet.has(t)) || c.factIds.some((f) => a.factIds.includes(f)));
  const practice = a.practice ?? [];
  const related = (a.related ?? []).map((r) => articleById(r)).filter(Boolean);
  const idx = MANUAL_ARTICLES.findIndex((x) => x.id === id);
  const prev = MANUAL_ARTICLES[idx - 1];
  const next = MANUAL_ARTICLES[idx + 1];
  const illusFacts = facts.some((f) => f.illustrative);

  return (
    <article className="art">
      <header className="art__head">
        <div className="art__crumbs">
          <span>{a.category}</span>
          {unlocked ? <Chip size="sm" tone="cyan" icon="sparkle">Met in the lab</Chip> : null}
          <span className="spacer" />
          <Button
            size="sm"
            variant={bookmarked ? 'secondary' : 'ghost'}
            icon="bookmark"
            onClick={() => ma('toggleBookmark', id)}
            disabled={!hasMission('toggleBookmark')}
            title={hasMission('toggleBookmark') ? undefined : 'Bookmarks arrive with the mission runtime'}
          >
            {bookmarked ? 'Bookmarked' : 'Bookmark'}
          </Button>
        </div>
        <h1 className="art__title">{a.title}</h1>
        <p className="art__summary">{a.summary}</p>
        {a.tags.length ? (
          <div className="art__tags">
            {a.tags.map((t) => (
              <Chip key={t} size="sm" tone="grey" title={t}>
                {tagLabel(t)}
              </Chip>
            ))}
          </div>
        ) : null}
      </header>

      <div className="art__layout">
        <div className="art__main">
          <ManualMarkdown body={a.body} onLink={onOpen} />
          {facts.length ? (
            <section className="art__facts">
              <h2 className="md-h2">Key facts {illusFacts ? <IllustrativeBadge /> : null}</h2>
              <ul>
                {facts.map((f) => (
                  <li key={f.id} className={f.illustrative ? 'is-illus' : ''}>
                    <span className="mono art__fact-id">{f.id}</span>
                    <span>
                      {f.text}
                      {f.illustrative ? <IllustrativeBadge compact /> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <nav className="art__pager">
            {prev ? (
              <button type="button" onClick={() => onOpen(prev.id)}>
                <Icon name="arrow-left" size={14} />
                <span>
                  <span className="caps">Previous</span>
                  {prev.title}
                </span>
              </button>
            ) : (
              <span />
            )}
            {next ? (
              <button type="button" className="is-next" onClick={() => onOpen(next.id)}>
                <span>
                  <span className="caps">Next</span>
                  {next.title}
                </span>
                <Icon name="arrow-right" size={14} />
              </button>
            ) : null}
          </nav>
        </div>
        <aside className="art__side">
          {mastery.length ? (
            <section className="art__box">
              <div className="caps">Your mastery</div>
              <ProgressBar value={masteryAvg} tone={masteryAvg >= 0.8 ? 'green' : masteryAvg >= 0.4 ? 'amber' : 'red'} height={6} />
              <ul className="art__mastery">
                {mastery.slice(0, 6).map((m) => (
                  <li key={m.tag}>
                    <span className="grow">{tagLabel(m.tag)}</span>
                    <span className={`mastery-label mastery-label--${m.label}`}>{m.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {practice.length ? (
            <section className="art__box">
              <div className="caps">Practise it</div>
              <ul className="art__practice">
                {practice.map((p) => {
                  const drill = DRILL_CATALOG.find((d) => d.id === p);
                  const inc = progress.incidents[p];
                  return (
                    <li key={p}>
                      <span className="mono">{p}</span>
                      <span className="grow">{drill ? drill.name : (mq('incident', [p], null)?.name ?? 'Arcade incident')}</span>
                      {drill ? (
                        <Button size="sm" variant="subtle" onClick={() => ma('startDrill', p)}>
                          Play
                        </Button>
                      ) : inc?.solves ? (
                        <span className="muted tnum">best {Math.round(inc.bestMs / 1000)} s</span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {cards.length ? (
            <section className="art__box">
              <div className="caps">Flashcards</div>
              <div className="muted">{cards.length} cards cover this entry.</div>
              <Button size="sm" icon="cards" onClick={() => openOverlay({ kind: 'flashcards', tags: a.tags }, { push: true })}>
                Review these cards
              </Button>
            </section>
          ) : null}
          {related.length ? (
            <section className="art__box">
              <div className="caps">See also</div>
              <ul className="art__related">
                {related.map((r) => (
                  <li key={r!.id}>
                    <button type="button" onClick={() => onOpen(r!.id)}>
                      <Icon name="book" size={13} /> {r!.title}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
