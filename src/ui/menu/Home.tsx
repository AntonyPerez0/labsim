/**
 * Main-menu home: "next up" mission card (Continue / next module), mode tiles with live stats, rank &
 * streak, weak-spot chip and recent achievements.
 */
import { useGame } from '@/core/store';
import type { ProgressState } from '@/core/state';
import { MODULES, MODULES_BY_ID, personName, teamMember } from '@/content';
import { Avatar, Button, Card, Chip, Icon, MedalBadge, Stars } from '@/ui/kit';
import { mq } from '@/ui/services/missions';
import { goMenu, openOverlay } from '@/ui/services/nav';
import { resumeAcademy, startModule } from '@/ui/services/actions';
import { achievementViews, drillRows, modeUnlock, modulesCompleted, nextModule, shiftRows, tagLabel, totalStars } from '@/ui/data/views';
import { num, shortTitle, estLabel } from '@/ui/services/format';

export function continueTarget(p: ProgressState): { label: string; moduleId: string; resume: boolean } | null {
  if (p.academyCheckpoint) {
    const m = MODULES_BY_ID[p.academyCheckpoint.moduleId];
    return { label: `${p.academyCheckpoint.moduleId} · ${m ? shortTitle(m.title) : ''} — step ${p.academyCheckpoint.stepIndex + 1}`, moduleId: p.academyCheckpoint.moduleId, resume: true };
  }
  const next = nextModule(p);
  if (!next) return null;
  const m = MODULES_BY_ID[next];
  return { label: `${next} · ${m ? shortTitle(m.title) : ''}`, moduleId: next, resume: false };
}

export function continueGame(p: ProgressState): void {
  const t = continueTarget(p);
  if (!t) return;
  if (t.resume && resumeAcademy()) return;
  startModule(t.moduleId);
}

export function HomeScreen() {
  const progress = useGame((s) => s.progress);
  const target = continueTarget(progress);
  const meta = target ? MODULES_BY_ID[target.moduleId] : null;
  const mentor = meta ? teamMember(meta.mentor) : null;
  const done = modulesCompleted(progress);
  const stars = totalStars(progress);
  const shifts = shiftRows(progress);
  const bestShift = Math.max(0, ...shifts.map((s) => s.best));
  const drills = drillRows(progress);
  const medals = drills.filter((d) => d.medal).length;
  const due = mq('dueFlashcards', [], []).length;
  const weak = mq('weakestTags', [1], [])[0] ?? null;
  const daily = modeUnlock(progress, 'daily');
  const fp = modeUnlock(progress, 'freeplay');
  const recentAch = achievementViews(progress)
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
    .slice(0, 3);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="home">
      <section className="home__hero">
        <div className="home__greet">
          <div className="caps">{greeting}</div>
          <h1>{progress.playerName}</h1>
          <p className="muted">Forty-two rigs in Orca, twelve of them here in the lab. Let’s keep them green.</p>
        </div>
        {target && meta ? (
          <Card className="home__next">
            <div className="home__next-eyebrow">
              <span className="caps">{target.resume ? 'Pick up where you left off' : 'Next up in the Academy'}</span>
              <span className="mono dim">{meta.id}</span>
            </div>
            <div className="home__next-title">{meta.title}</div>
            <div className="home__next-mentor">
              <Avatar name={personName(meta.mentor)} color={mentor?.color ?? '#43b02a'} size={30} />
              <span>
                with <strong>{personName(meta.mentor)}</strong> · {estLabel(meta)}
              </span>
            </div>
            <p className="home__next-obj">{meta.summary}</p>
            <div className="row">
              <Button variant="primary" size="lg" icon="play" onClick={() => continueGame(progress)}>
                {target.resume ? 'Continue' : progress.modules[meta.id] ? 'Resume module' : 'Start module'}
              </Button>
              <Button variant="ghost" onClick={() => goMenu('academy')}>
                Module map
              </Button>
            </div>
          </Card>
        ) : (
          <Card className="home__next">
            <div className="caps">Academy complete</div>
            <div className="home__next-title">All 18 modules done — the lab is yours.</div>
            <div className="row">
              <Button variant="primary" icon="award" onClick={() => goMenu('certification')}>
                Certification
              </Button>
              <Button onClick={() => goMenu('shift-setup')}>Full Shift</Button>
            </div>
          </Card>
        )}
      </section>

      <section className="home__tiles">
        <Tile icon="graduation" title="Academy" stat={`${done}/${MODULES.length}`} sub={`${stars}/54 stars`} onClick={() => goMenu('academy')} />
        <Tile icon="ticket" title="Shift" stat={bestShift ? num(bestShift) : '—'} sub="best score" locked={shifts[0]?.unlock.unlocked === false ? shifts[0]!.unlock.reason : null} onClick={() => goMenu('shift-setup')} />
        <Tile icon="target" title="Drills" stat={`${medals}/19`} sub="medals" onClick={() => goMenu('drills')} />
        <Tile icon="calendar" title="Daily Challenge" stat={daily.unlocked ? 'Today' : '—'} sub="seeded 10-min shift" locked={daily.unlocked ? null : daily.reason} onClick={() => goMenu('daily')} />
        <Tile icon="cards" title="Flashcards" stat={String(due)} sub="cards due" onClick={() => openOverlay({ kind: 'flashcards' }, { push: true })} tone={due ? 'cyan' : undefined} />
        <Tile icon="sandbox" title="Free Play" stat="Lab" sub="sandbox + fault injector" locked={fp.unlocked ? null : fp.reason} onClick={() => goMenu('freeplay')} />
      </section>

      <section className="home__row">
        {weak ? (
          <Card className="home__weak" onClick={() => goMenu('arcade')}>
            <Icon name="target" size={18} />
            <div className="grow">
              <div className="caps">Weakest topic</div>
              <div>{tagLabel(weak.tag)}</div>
            </div>
            <Chip tone="amber">{Math.round(weak.mEff * 100)}%</Chip>
          </Card>
        ) : null}
        {recentAch.length ? (
          <Card className="home__achs" onClick={() => goMenu('achievements')}>
            <div className="caps">Recent achievements</div>
            <div className="home__ach-list">
              {recentAch.map((a) => (
                <span key={a.id} className="home__ach" title={a.description}>
                  <span className="home__ach-icon">{a.icon ?? '★'}</span>
                  {a.title}
                </span>
              ))}
            </div>
          </Card>
        ) : null}
        <Card className="home__modules">
          <div className="caps">Recent modules</div>
          <div className="home__mod-list">
            {MODULES.filter((m) => progress.modules[m.id])
              .slice(-3)
              .map((m) => (
                <div key={m.id} className="home__mod">
                  <span className="mono">{m.id}</span>
                  <span className="grow">{shortTitle(m.title)}</span>
                  <Stars value={progress.modules[m.id]?.stars ?? 0} size={11} />
                </div>
              ))}
            {!Object.keys(progress.modules).length ? <div className="muted">No modules played yet — start with M01.</div> : null}
          </div>
        </Card>
        {drills.some((d) => d.medal) ? (
          <Card className="home__medals" onClick={() => goMenu('drills')}>
            <div className="caps">Drill medals</div>
            <div className="row wrap">
              {drills
                .filter((d) => d.medal)
                .slice(0, 8)
                .map((d) => (
                  <span key={d.id} title={`${d.id} ${d.name}`}>
                    <MedalBadge medal={d.medal} size={22} />
                  </span>
                ))}
            </div>
          </Card>
        ) : null}
      </section>
    </div>
  );
}

function Tile({ icon, title, stat, sub, onClick, locked, tone }: { icon: string; title: string; stat: string; sub: string; onClick: () => void; locked?: string | null; tone?: string }) {
  return (
    <Card className={`tile${locked ? ' is-locked' : ''}${tone ? ` tile--${tone}` : ''}`} onClick={onClick}>
      <div className="tile__icon">
        <Icon name={locked ? 'lock' : icon} size={20} />
      </div>
      <div className="tile__title">{title}</div>
      <div className="tile__stat tnum">{locked ? '' : stat}</div>
      <div className="tile__sub muted">{locked ?? sub}</div>
    </Card>
  );
}
