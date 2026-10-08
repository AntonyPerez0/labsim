/**
 * Debrief (`session.result`, GP §2.2.1, §2.3.10, §2.4.1, Cur §5.4): headline (stars / grade / medal /
 * pass), score & XP breakdown, rank change, new achievements, the "In the real lab you will…" checklist,
 * Arcade preview with Play now (Academy), shift summary with penalty Teach Cards and "Review these",
 * drill medal, certification results — and the next-step buttons (`missions.continueFromDebrief`).
 */
import { useEffect, useState } from 'react';
import { useGame } from '@/core/store';
import type { ActivityResult, TeachCard } from '@/core/state';
import type { DebriefAction } from '@/missions';
import { ACHIEVEMENTS_BY_ID, MODULES_BY_ID, RANKS_BY_ID, articlesForTags } from '@/content';
import { Button, Chip, Icon, MedalBadge, Stars, Stat, useArmed } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';
import { goMenu, openOverlay } from '@/ui/services/nav';
import { duration, num, pct, shortTitle } from '@/ui/services/format';
import { uiSound } from '@/ui/services/sound';
import { tagLabel } from '@/ui/data/views';
import { TeachCardView } from '@/ui/hud/TeachCard';

const KIND_LABEL: Record<ActivityResult['kind'], string> = {
  academy: 'Academy debrief',
  shift: 'End of shift',
  drill: 'Drill complete',
  freeplay: 'Free Play',
  certification: 'Certification result',
  'weak-spot': 'Weak Spot complete',
};

function doAct(a: DebriefAction): void {
  uiSound('ui-click');
  if (hasMission('continueFromDebrief')) ma('continueFromDebrief', a);
  else goMenu('home');
}

export function Debrief() {
  const r = useGame((s) => s.session.result);
  const [cardOpen, setCardOpen] = useState<string | null>(null);
  const armed = useArmed();
  const act = (a: DebriefAction) => {
    if (armed) doAct(a);
  };
  useEffect(() => {
    if (r) uiSound(r.passed ? 'ui-success' : 'ui-fail');
  }, [r?.activityId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) {
    return (
      <div className="debrief" data-ui-interactive>
        <div className="debrief__panel">
          <h1>Debrief</h1>
          <p className="muted">No results to show.</p>
          <Button variant="primary" onClick={() => goMenu('home')}>
            Main menu
          </Button>
        </div>
      </div>
    );
  }

  const rankUp = r.rank && r.rank.before !== r.rank.after;
  const cards: TeachCard[] = r.teachCards.length ? r.teachCards : (r.drill?.teachCards ?? []);

  return (
    <div className="debrief" data-ui-interactive>
      <div className="debrief__panel">
        <header className="debrief__head">
          <div className="debrief__eyebrow">{KIND_LABEL[r.kind]}</div>
          <h1 className="debrief__title">{r.title}</h1>
          <Headline r={r} />
        </header>

        <div className="debrief__stats">
          {r.kind === 'shift' || r.kind === 'drill' || r.kind === 'weak-spot' ? <Stat label="Score" value={num(r.points)} icon="target" /> : null}
          <Stat label="XP earned" value={`+${num(r.xp)}`} tone="green" icon="sparkle" />
          {r.kind !== 'academy' ? <Stat label="Accuracy" value={pct(r.accuracy)} icon="check" /> : null}
          <Stat label="Time" value={duration(r.durationSeconds)} icon="clock" />
          {r.academy ? <Stat label="Hints used" value={r.academy.hintsUsed} icon="hint" /> : null}
          {r.shift ? <Stat label="Max combo" value={`×${r.shift.maxCombo}`} icon="flame" /> : null}
        </div>

        <div className="debrief__grid">
          <div className="debrief__col">
            {r.xpBreakdown.length ? (
              <section className="debrief__section">
                <div className="caps">XP</div>
                <ul className="debrief__xp">
                  {r.xpBreakdown.map((x, i) => (
                    <li key={i}>
                      <span>{x.label}</span>
                      <span className="mono ok">+{x.xp}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {rankUp ? (
              <section className="debrief__rankup">
                <Icon name="award" size={22} />
                <div>
                  <div className="caps">Promotion</div>
                  <div className="debrief__rankup-title">{RANKS_BY_ID[r.rank!.after]?.title ?? r.rank!.after}</div>
                  <div className="muted">was {RANKS_BY_ID[r.rank!.before]?.title ?? r.rank!.before}</div>
                </div>
              </section>
            ) : r.rank?.pending.length ? (
              <section className="debrief__section">
                <div className="caps">Promotion pending</div>
                <ul className="debrief__list">
                  {r.rank.pending.map((p) => (
                    <li key={p}>{p.replace(/^xp:(\d+)$/, '$1 XP to go')}</li>
                  ))}
                </ul>
              </section>
            ) : null}
            {r.newAchievements.length ? (
              <section className="debrief__section">
                <div className="caps">Achievements unlocked</div>
                <div className="debrief__achs">
                  {r.newAchievements.map((id) => {
                    const a = ACHIEVEMENTS_BY_ID[id];
                    return (
                      <div key={id} className="debrief__ach">
                        <span className="debrief__ach-icon">{a?.icon ?? '★'}</span>
                        <div>
                          <div className="debrief__ach-title">{a?.title ?? id}</div>
                          <div className="muted">{a?.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}
            {r.academy ? <AcademyBlock r={r} /> : null}
            {r.shift ? <ShiftBlock r={r} /> : null}
            {r.drill ? <DrillBlock r={r} /> : null}
            {r.cert ? <CertBlock r={r} /> : null}
            {r.weakSpot ? (
              <section className="debrief__section">
                <div className="caps">Mastery change</div>
                <ul className="debrief__list">
                  {r.weakSpot.tags.map((t) => (
                    <li key={t.tag}>
                      <span className="mono">{t.tag}</span> {tagLabel(t.tag)} — {t.before.toFixed(2)} → <span className={t.after >= t.before ? 'ok' : 'bad'}>{t.after.toFixed(2)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <div className="debrief__col">
            {r.takeaways.length ? (
              <section className="debrief__section debrief__takeaways">
                <div className="caps">{r.kind === 'academy' ? 'In the real lab you will…' : 'Takeaways'}</div>
                <ul>
                  {r.takeaways.map((t, i) => (
                    <li key={i}>
                      <Icon name="check" size={14} />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {cards.length ? (
              <section className="debrief__section">
                <div className="caps">What went wrong — and what to do instead</div>
                <div className="debrief__cards">
                  {cards.map((c) => (
                    <div key={c.id} className={`debrief__card${cardOpen === c.id ? ' is-open' : ''}`}>
                      <button type="button" className="debrief__card-head" onClick={() => setCardOpen(cardOpen === c.id ? null : c.id)}>
                        <Icon name="hint" size={14} />
                        <span className="grow">{c.whatHappened}</span>
                        <span className="mono dim">{c.trigger.ref}</span>
                        <Icon name={cardOpen === c.id ? 'chevron-up' : 'chevron-down'} size={14} />
                      </button>
                      {cardOpen === c.id ? <TeachCardView card={c} id={c.id} masteryChange={c.masteryChange} compact /> : null}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <footer className="debrief__actions">
          <Button variant="ghost" icon="home" onClick={() => act('menu')}>
            Main menu
          </Button>
          <span className="spacer" />
          {r.kind === 'academy' || r.kind === 'drill' || r.kind === 'shift' ? (
            <Button icon="refresh" onClick={() => act('replay')}>
              {r.kind === 'academy' ? 'Replay module' : 'Play again'}
            </Button>
          ) : null}
          {r.academy?.playNow ? (
            <Button variant="game" icon="play" onClick={() => act('play-now')}>
              Play now: {r.academy.playNow.kind === 'drill' ? r.academy.playNow.drillId : `micro-shift ${r.academy.playNow.incidentId}`}
            </Button>
          ) : null}
          {r.shift?.reviewTags.length ? (
            <Button variant="game" icon="target" onClick={() => act('review')}>
              Review these
            </Button>
          ) : null}
          {r.academy?.nextModules.length ? (
            <Button variant="primary" iconRight="arrow-right" onClick={() => act('next')} autoFocus>
              Next: {r.academy.nextModules[0]} {shortTitle(MODULES_BY_ID[r.academy.nextModules[0]!]?.title ?? '')}
            </Button>
          ) : (
            <Button variant="primary" iconRight="arrow-right" onClick={() => act(r.kind === 'academy' ? 'next' : 'menu')} autoFocus>
              Continue
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Headline({ r }: { r: ActivityResult }) {
  if (r.academy) {
    return (
      <div className="debrief__headline">
        <Stars value={r.academy.stars} size={34} className="debrief__stars" />
        <div className="muted">★ complete · ★★ ≤ 2 hints · ★★★ no hints and a perfect first-try checkpoint</div>
      </div>
    );
  }
  if (r.shift) {
    return (
      <div className="debrief__headline">
        <span className={`debrief__grade debrief__grade--${r.shift.grade}`}>{r.shift.grade}</span>
        <div>
          <div className="debrief__ratio tnum">
            Ratio {r.shift.ratio.toFixed(2)} <span className="muted">· {num(r.shift.score)} / {num(r.shift.target)} target</span>
          </div>
          <div className="muted">S ≥ 1.50 (no strikes, no breaches) · A ≥ 1.15 · B ≥ 0.85 · C ≥ 0.55{r.shift.endReason === 'strikes' ? ' · ended on 3 strikes (capped at D)' : ''}</div>
        </div>
      </div>
    );
  }
  if (r.drill) {
    return (
      <div className="debrief__headline">
        <MedalBadge medal={r.drill.medal} size={52} />
        <div>
          <div className="debrief__ratio tnum">{num(r.drill.score)} pts</div>
          <div className="muted">{r.drill.newBest ? 'New personal best!' : r.drill.medal ? `${r.drill.medal[0]!.toUpperCase()}${r.drill.medal.slice(1)} medal` : 'No medal this time'}</div>
        </div>
      </div>
    );
  }
  return <div className="debrief__headline">{r.passed ? <Chip tone="green" icon="check" solid>Passed</Chip> : <Chip tone="red" icon="x">Not passed</Chip>}</div>;
}

function AcademyBlock({ r }: { r: ActivityResult }) {
  const a = r.academy!;
  const u = a.unlocked;
  const items = [...u.drills.map((d) => `Drill ${d}`), ...u.incidents.map((i) => `Incident ${i}`), ...u.modes, ...u.hotbar.map((h) => `Hotbar: ${h}`), ...u.decks.map((d) => `Flashcards ${d.replace(/^deck\./, '')}`), ...u.manualChapters.map((c) => `Field Manual: ${c}`)];
  return (
    <>
      {a.checkpoint ? (
        <section className="debrief__section">
          <div className="caps">Checkpoint {a.checkpoint.checkpointId}</div>
          <div>
            First try {a.checkpoint.firstTryCorrect}/{a.checkpoint.total} {a.checkpoint.firstTryPerfect ? <Chip size="sm" tone="gold">Perfect</Chip> : null}
            {a.checkpoint.attempts > 1 ? <span className="muted"> · passed on attempt {a.checkpoint.attempts}</span> : null}
          </div>
        </section>
      ) : null}
      {items.length ? (
        <section className="debrief__section">
          <div className="caps">Arcade preview — now unlocked</div>
          <div className="debrief__chips">
            {items.map((x) => (
              <Chip key={x} tone="cyan" size="sm" icon="unlock">
                {x}
              </Chip>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ShiftBlock({ r }: { r: ActivityResult }) {
  const s = r.shift!;
  return (
    <>
      <section className="debrief__section">
        <div className="caps">Shift summary</div>
        <dl className="debrief__kv">
          <div>
            <dt>Tickets resolved</dt>
            <dd>
              {s.ticketsResolved} / {s.ticketsSpawned}
            </dd>
          </div>
          <div>
            <dt>SLA breaches</dt>
            <dd className={s.breaches ? 'bad' : ''}>{s.breaches}</dd>
          </div>
          <div>
            <dt>Strikes</dt>
            <dd className={s.strikes ? 'bad' : ''}>{s.strikes}</dd>
          </div>
          <div>
            <dt>Fast Diagnoses</dt>
            <dd>{s.fastDiagnoses}</dd>
          </div>
          <div>
            <dt>Escalations</dt>
            <dd>
              {s.escalations.correct} correct · {s.escalations.bounced} bounced
            </dd>
          </div>
          <div>
            <dt>Pipeline uptime</dt>
            <dd>{pct(s.uptime)}</dd>
          </div>
          <div>
            <dt>Handover tickets</dt>
            <dd>{s.handoverTickets}</dd>
          </div>
          {s.leaderboard ? (
            <div>
              <dt>Leaderboard</dt>
              <dd>{s.leaderboard.rank ? `#${s.leaderboard.rank}` : 'not placed'}</dd>
            </div>
          ) : null}
        </dl>
      </section>
      {s.penalties.length ? (
        <section className="debrief__section">
          <div className="caps">Penalty events</div>
          <ul className="debrief__list">
            {s.penalties.map((p) => (
              <li key={p.id}>
                <span className="mono bad">{p.points}</span> <span className="mono">{p.gwId}</span> {p.detail}
                {p.strike ? <Chip size="sm" tone="red">strike</Chip> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {s.reviewTags.length ? (
        <section className="debrief__section">
          <div className="caps">Review these</div>
          <div className="debrief__review">
            {s.reviewTags.map((t) => {
              const article = t.articleId ?? articlesForTags([t.tag])[0]?.id ?? null;
              return (
                <div key={t.tag} className="debrief__review-row">
                  <div className="grow">
                    <div>{tagLabel(t.tag)}</div>
                    <div className="muted mono">
                      {t.tag} {t.before.toFixed(2)} → {t.after.toFixed(2)}
                    </div>
                  </div>
                  {t.drillId ? (
                    <Button size="sm" icon="target" onClick={() => ma('startDrill', t.drillId!, { tags: [t.tag] })}>
                      Practice
                    </Button>
                  ) : null}
                  {article ? (
                    <Button size="sm" icon="book" onClick={() => openOverlay({ kind: 'manual', articleId: article }, { push: true })}>
                      Read
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

function DrillBlock({ r }: { r: ActivityResult }) {
  const d = r.drill!;
  return (
    <section className="debrief__section">
      <div className="caps">Round</div>
      <dl className="debrief__kv">
        <div>
          <dt>Correct</dt>
          <dd>
            {d.correct} / {d.total}
          </dd>
        </div>
        <div>
          <dt>Accuracy</dt>
          <dd>{pct(d.accuracy)}</dd>
        </div>
        <div>
          <dt>Best streak</dt>
          <dd>{d.bestStreak}</dd>
        </div>
      </dl>
    </section>
  );
}

function CertBlock({ r }: { r: ActivityResult }) {
  const c = r.cert!;
  return (
    <section className="debrief__section">
      <div className="caps">{c.examId}</div>
      <dl className="debrief__kv">
        <div>
          <dt>Written</dt>
          <dd className={c.writtenPassed ? 'ok' : 'bad'}>
            {Math.round(c.writtenPct)} % {c.writtenPassed ? 'passed' : 'not passed'}
          </dd>
        </div>
        <div>
          <dt>Practical</dt>
          <dd className={c.practicalPassed ? 'ok' : 'bad'}>{c.practicalPassed ? 'passed' : 'not passed'}</dd>
        </div>
        {c.distinction ? (
          <div>
            <dt>Distinction</dt>
            <dd className="ok">with distinction</dd>
          </div>
        ) : null}
      </dl>
      {c.criticalMissed.length ? <div className="bad">Critical facts missed: {c.criticalMissed.join(', ')} — these must be answered correctly to pass.</div> : null}
      {c.tasks.length ? (
        <ul className="debrief__list">
          {c.tasks.map((t) => (
            <li key={t.taskId}>
              <Icon name={t.status === 'passed' ? 'check' : 'x'} size={13} /> <span className="mono">{t.taskId}</span> {t.title}
              {t.failReason ? <span className="muted"> — {t.failReason}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
