/**
 * Practice hub (main menu → Practice): every repeatable activity with the player's progress and a
 * button that starts it — the workstation code practice (Parrot in VS Code, UIA in IntelliJ; launched
 * straight into Free Play at the desk), flashcards, shifts, the Daily Challenge, Weak Spot and all
 * nineteen drills.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useGame } from '@/core/store';
import { Button, Card, Chip, Icon, MedalBadge, ProgressBar } from '@/ui/kit';
import { ma, mq } from '@/ui/services/missions';
import { goMenu, openOverlay } from '@/ui/services/nav';
import { startDrillRun } from '@/ui/services/actions';
import { launchCodePractice, type CodePractice } from '@/ui/services/practice';
import { drillRows, leitnerBoxes, modeUnlock, shiftRows } from '@/ui/data/views';
import { num } from '@/ui/services/format';
import { cachedExerciseLists, codePracticeSummary, drillSummary, loadExerciseLists, type ExerciseInfo, type ExerciseLists } from './practiceData';
import './guide.css';

function useExerciseLists(): ExerciseLists | null {
  const [lists, setLists] = useState<ExerciseLists | null>(cachedExerciseLists);
  useEffect(() => {
    if (lists) return;
    let alive = true;
    loadExerciseLists()
      .then((l) => alive && setLists(l))
      .catch((err) => console.warn('[practice] could not load exercise lists', err));
    return () => {
      alive = false;
    };
  }, [lists]);
  return lists;
}

export function PracticeHub() {
  const progress = useGame((s) => s.progress);
  const lists = useExerciseLists();
  const drills = drillRows(progress);
  const ds = drillSummary(drills);
  const due = mq('dueFlashcards', [], []).length;
  const cards = Object.keys(progress.leitner).length;
  const boxes = leitnerBoxes(progress);
  const shifts = shiftRows(progress);
  const shift5 = shifts.find((s) => s.id === 'shift-5') ?? shifts[0];
  const bestShift = Math.max(0, ...shifts.map((s) => s.best));
  const daily = modeUnlock(progress, 'daily');
  const weak = modeUnlock(progress, 'weak-spot');

  return (
    <div className="menu__page prac">
      <header>
        <h1 className="menu__h1">Practice</h1>
        <p className="muted menu__lead">Everything here can be repeated as often as you like. Short and often beats long and rare: a drill, a few flashcards and one code exercise a day keep it fresh.</p>
      </header>

      <section className="prac__section" aria-labelledby="prac-code">
        <div className="prac__section-head">
          <h2 id="prac-code" className="prac__h2">
            Code practice at your workstation
          </h2>
          <span className="muted">Opens Free Play at your desk with the app ready — nothing is scored.</span>
        </div>
        <div className="prac__code" data-coach="practice-grid">
          <CodeCard kind="parrot" list={lists?.parrot ?? null} records={progress.parrotPractice} />
          <CodeCard kind="uia" list={lists?.uia ?? null} records={progress.uiaPractice} />
        </div>
      </section>

      <section className="prac__section" aria-labelledby="prac-quick">
        <div className="prac__section-head">
          <h2 id="prac-quick" className="prac__h2">
            Review and shifts
          </h2>
        </div>
        <div className="prac__grid">
          <PracCard icon="cards" tone="cyan" title="Flashcards" sub="Spaced repetition (Leitner boxes 1–5)" stat={due ? `${due} due` : cards ? 'All caught up' : 'No cards yet'} detail={cards ? `${cards} cards · ${boxes[3]! + boxes[4]!} in box 4–5` : 'Each finished module unlocks its deck.'} progress={cards ? (boxes[3]! + boxes[4]!) / cards : 0}>
            <Button variant={due ? 'primary' : 'secondary'} icon="cards" onClick={() => openOverlay({ kind: 'flashcards' }, { push: true })}>
              {due ? `Review ${due} card${due === 1 ? '' : 's'}` : 'Practise cards'}
            </Button>
          </PracCard>
          <PracCard icon="ticket" title="Shift" sub="Timed incident queue, 5–20 min" stat={bestShift ? `Best ${num(bestShift)}` : '—'} detail={shift5?.unlock.unlocked ? `${progress.stats.shiftsCompleted} shift${progress.stats.shiftsCompleted === 1 ? '' : 's'} played` : (shift5?.unlock.reason ?? '')} locked={shift5?.unlock.unlocked === false}>
            <Button icon="ticket" disabled={shift5?.unlock.unlocked === false} onClick={() => goMenu('shift-setup')}>
              Shift setup
            </Button>
          </PracCard>
          <PracCard icon="calendar" title="Daily Challenge" sub="Same seeded 10-min shift for everyone" stat={daily.unlocked ? (progress.daily.lastRankedDateKey ? `Last ${progress.daily.lastRankedDateKey}` : 'Not played') : '—'} detail={daily.unlocked ? `${progress.daily.rankedCount} ranked run${progress.daily.rankedCount === 1 ? '' : 's'}` : (daily.reason ?? '')} locked={!daily.unlocked}>
            <Button icon="calendar" disabled={!daily.unlocked} onClick={() => goMenu('daily')}>
              Today’s challenge
            </Button>
          </PracCard>
          <PracCard icon="flame" tone="amber" title="Weak Spot" sub="~6 min on your three weakest topics" stat={weak.unlocked ? 'Ready' : '—'} detail={weak.unlocked ? 'Drills, then a short micro-shift.' : (weak.reason ?? '')} locked={!weak.unlocked}>
            <Button icon="flame" disabled={!weak.unlocked} onClick={() => ma('startWeakSpot')}>
              Start Weak Spot
            </Button>
          </PracCard>
        </div>
      </section>

      <section className="prac__section" aria-labelledby="prac-drills">
        <div className="prac__section-head">
          <h2 id="prac-drills" className="prac__h2">
            Drills
          </h2>
          <span className="muted tnum">
            {ds.unlocked}/{ds.total} unlocked · <MedalBadge medal="gold" size={14} /> {ds.medals.gold} <MedalBadge medal="silver" size={14} /> {ds.medals.silver} <MedalBadge medal="bronze" size={14} /> {ds.medals.bronze}
          </span>
          <span className="spacer" />
          {ds.suggestion ? (
            <Button size="sm" variant="primary" icon="play" onClick={() => startDrillRun(ds.suggestion!.id)}>
              Play {ds.suggestion.id} {ds.suggestion.name}
            </Button>
          ) : null}
        </div>
        <ul className="prac__drills">
          {drills.map((d) => {
            const locked = !d.unlock.unlocked;
            return (
              <li key={d.id} className={`prac-drill${locked ? ' is-locked' : ''}`}>
                <span className="mono prac-drill__id">{d.id}</span>
                <span className="prac-drill__name" title={d.format}>
                  {d.name}
                </span>
                <span className="prac-drill__medal">{d.medal ? <MedalBadge medal={d.medal} size={18} /> : null}</span>
                <span className="prac-drill__best tnum muted">{locked ? d.unlock.reason : d.best ? num(d.best) : '—'}</span>
                <Button size="sm" variant={locked ? 'subtle' : 'secondary'} icon={locked ? 'lock' : 'play'} disabled={locked} onClick={() => startDrillRun(d.id)} aria-label={locked ? `${d.id} ${d.name}: ${d.unlock.reason}` : `Play ${d.id} ${d.name}`}>
                  {locked ? '' : 'Play'}
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

const CODE: Record<CodePractice, { title: string; app: string; icon: string; taughtIn: string; blurb: string; button: string }> = {
  parrot: {
    title: 'Parrot Practice',
    app: 'VS Code · Parrot JSON tests',
    icon: 'terminal',
    taughtIn: 'M15',
    blurb: 'Fix and write Parrot (LSTR) JSON tests: commas and brackets, receipt maps, variables, card actions and platforms. Each start writes a fresh variant.',
    button: 'Practise in VS Code',
  },
  uia: {
    title: 'UIA Practice',
    app: 'IntelliJ IDEA · uia-relay',
    icon: 'cpu',
    taughtIn: 'M13',
    blurb: 'Page objects, waits, scrolling, tethered tests and config.properties in uia-relay. Each exercise is written into the project’s practice/ folder and checked in place.',
    button: 'Practise in IntelliJ',
  },
};

function CodeCard({ kind, list, records }: { kind: CodePractice; list: ExerciseInfo[] | null; records: Record<string, { solved: number; bestS: number; lastDay: number }> }) {
  const progress = useGame((s) => s.progress);
  const c = CODE[kind];
  const sum = list ? codePracticeSummary(progress, records, list, c.taughtIn) : null;
  return (
    <Card className="prac-code">
      <div className="prac-code__head">
        <span className="prac-code__icon">
          <Icon name={c.icon} size={20} />
        </span>
        <div className="grow">
          <div className="prac-code__title">{c.title}</div>
          <div className="muted prac-code__app">{c.app}</div>
        </div>
        {sum ? (
          <Chip size="sm" tone={sum.taught ? 'green' : 'grey'} icon={sum.taught ? 'check' : 'graduation'} title={sum.taught ? `${c.taughtIn} complete` : `Taught in ${c.taughtIn} — you can practise before that`}>
            {sum.taught ? `${c.taughtIn} done` : `Taught in ${c.taughtIn}`}
          </Chip>
        ) : null}
      </div>
      <p className="prac-code__blurb muted">{c.blurb}</p>
      <div className="prac-code__progress">
        <ProgressBar value={sum && sum.total ? sum.solved / sum.total : 0} height={5} tone="violet" />
        <span className="tnum">{sum ? `${sum.solved}/${sum.total} solved` : 'Loading…'}</span>
      </div>
      {list ? (
        <ul className="prac-code__list" aria-label={`${c.title} exercises`}>
          {list.map((e) => {
            const r = records[e.id];
            return (
              <li key={e.id} className={r?.solved ? 'is-solved' : ''}>
                <Icon name={r?.solved ? 'check' : 'target'} size={12} stroke={r?.solved ? 2.8 : 2} />
                <span className="grow">{e.title}</span>
                <span className="muted prac-code__topic">{e.topic}</span>
                {r?.solved ? <span className="tnum muted">×{r.solved}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="prac-code__actions">
        <Button variant="primary" icon="play" onClick={() => launchCodePractice(kind)}>
          {c.button}
        </Button>
      </div>
    </Card>
  );
}

function PracCard({ icon, title, sub, stat, detail, progress, tone, locked, children }: { icon: string; title: string; sub: string; stat: string; detail: string; progress?: number; tone?: 'cyan' | 'amber'; locked?: boolean; children: ReactNode }) {
  return (
    <Card className={`prac-card${tone ? ` prac-card--${tone}` : ''}${locked ? ' is-locked' : ''}`}>
      <div className="prac-card__head">
        <span className="prac-card__icon">
          <Icon name={locked ? 'lock' : icon} size={18} />
        </span>
        <div className="grow">
          <div className="prac-card__title">{title}</div>
          <div className="muted prac-card__sub">{sub}</div>
        </div>
      </div>
      <div className="prac-card__stat tnum">{stat}</div>
      <div className="muted prac-card__detail">{detail}</div>
      {progress !== undefined ? <ProgressBar value={progress} height={4} tone="cyan" /> : null}
      <div className="prac-card__actions">{children}</div>
    </Card>
  );
}
