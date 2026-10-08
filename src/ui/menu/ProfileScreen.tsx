/**
 * Profile (GP §4.3–§4.7): career rank ladder with XP thresholds, certificate titles and promotion
 * status; lifetime stats; shift grades; achievements (46, secret ones hidden); local leaderboards.
 */
import { useState } from 'react';
import { useGame } from '@/core/store';
import { RANKS } from '@/content';
import type { AchievementView } from '@/missions';
import { Chip, Icon, ProgressBar, Segmented, Select, Stat, Tabs } from '@/ui/kit';
import { mq } from '@/ui/services/missions';
import { achievementViews, drillRows, rankViewFor, modulesCompleted, totalStars } from '@/ui/data/views';
import { dateLabel, duration, num } from '@/ui/services/format';

type Tab = 'overview' | 'achievements' | 'leaderboards';

export function ProfileScreen({ tab: initial }: { tab: Tab }) {
  const [tab, setTab] = useState<Tab>(initial);
  return (
    <div className="menu__page profile">
      <div className="setup__head">
        <h1 className="menu__h1">Profile</h1>
        <span className="spacer" />
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: 'Career', icon: 'user' },
            { id: 'achievements', label: 'Achievements', icon: 'trophy' },
            { id: 'leaderboards', label: 'Leaderboards', icon: 'chart' },
          ]}
        />
      </div>
      {tab === 'overview' ? <Overview /> : tab === 'achievements' ? <Achievements /> : <Boards />}
    </div>
  );
}

function Overview() {
  const p = useGame((s) => s.progress);
  const rv = rankViewFor(p);
  const idx = RANKS.findIndex((r) => r.id === rv.rank.id);
  const st = p.stats;
  return (
    <div className="prof">
      <section className="prof__ladder">
        {RANKS.map((r, i) => {
          const state = i < idx ? 'past' : i === idx ? 'now' : 'future';
          return (
            <div key={r.id} className={`prof__rung prof__rung--${state}`}>
              <div className="prof__rung-dot">{state === 'past' ? <Icon name="check" size={12} stroke={3} /> : i + 1}</div>
              <div className="grow">
                <div className="prof__rung-title">{r.title}</div>
                <div className="muted">
                  {num(r.minXp)} XP{r.certExamId ? ` · ${r.certExamId} (${r.certTitle})` : ''}
                  {r.extraGate ? ` · ${r.extraGate}` : ''}
                </div>
                {r.cosmetic ? <div className="prof__cosmetic">{r.cosmetic}</div> : null}
              </div>
            </div>
          );
        })}
      </section>
      <section className="prof__main">
        <div className="prof__card">
          <div className="caps">Current rank</div>
          <div className="prof__rank">{rv.rank.title}</div>
          <ProgressBar value={rv.progress} height={6} glow />
          <div className="row">
            <span className="tnum">{num(rv.xp)} XP</span>
            <span className="spacer" />
            {rv.next ? <span className="muted tnum">{num(rv.xpToNext)} XP to {rv.next.title}</span> : <span className="muted">Top of the ladder</span>}
          </div>
          {rv.pending.length ? (
            <div className="row wrap">
              <span className="caps">Promotion pending</span>
              {rv.pending.map((x) => (
                <Chip key={x} size="sm" tone="amber">
                  {x.replace(/^xp:(\d+)$/, '$1 XP to go')}
                </Chip>
              ))}
            </div>
          ) : null}
        </div>
        <div className="prof__stats">
          <Stat label="Modules" value={`${modulesCompleted(p)}/18`} icon="graduation" />
          <Stat label="Stars" value={`${totalStars(p)}/54`} icon="star" />
          <Stat label="Incidents resolved" value={num(st.incidentsResolved)} icon="ticket" />
          <Stat label="Fast Diagnoses" value={num(st.fastDiagnoses)} icon="bolt" />
          <Stat label="Escalations" value={`${st.escalationsCorrect} ✓ · ${st.escalationsBounced} ↩`} icon="escalate" />
          <Stat label="Fuses replaced" value={num(st.fusesReplaced)} icon="fuse" />
          <Stat label="Robots parked" value={num(st.robotsParked)} icon="robot" />
          <Stat label="Flashcards" value={num(st.flashcardsReviewed)} icon="cards" />
          <Stat label="Drill rounds" value={num(st.drillRounds)} icon="target" />
          <Stat label="Shifts" value={num(st.shiftsCompleted)} icon="clock" />
          <Stat label="Streak" value={`${p.streak.current} d`} sub={`best ${p.streak.best} · ${p.streak.freezes} freeze${p.streak.freezes === 1 ? '' : 's'}`} icon="flame" />
          <Stat label="Play time" value={duration(st.playSeconds)} icon="clock" />
        </div>
        <div className="prof__grades">
          <div className="caps">Shift grades</div>
          <div className="prof__grade-row">
            {(['S', 'A', 'B', 'C', 'D'] as const).map((g) => (
              <div key={g} className="prof__grade">
                <span className={`grade-chip grade-chip--${g}`}>{g}</span>
                <span className="tnum">{p.shifts.gradeCounts[g] ?? 0}</span>
              </div>
            ))}
            <div className="muted">Best Full Shift ratio {p.shifts.bestFullShiftRatio.toFixed(2)} (CERT-R5 needs 0.80)</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Achievements() {
  const p = useGame((s) => s.progress);
  const list = achievementViews(p);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all');
  const unlocked = list.filter((a) => a.unlocked).length;
  const cats = [...new Set(list.map((a) => a.def.category ?? 'Other'))];
  const show = (a: AchievementView) => (filter === 'unlocked' ? a.unlocked : filter === 'locked' ? !a.unlocked : true);
  return (
    <div className="achs">
      <div className="row">
        <span className="tnum achs__count">
          {unlocked}/{list.length}
        </span>
        <span className="muted">unlocked</span>
        <span className="spacer" />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unlocked', label: 'Unlocked' },
            { value: 'locked', label: 'Locked' },
          ]}
        />
      </div>
      {cats.map((c) => {
        const items = list.filter((a) => (a.def.category ?? 'Other') === c && show(a));
        if (!items.length) return null;
        return (
          <section key={c} className="achs__cat">
            <div className="caps">{c}</div>
            <div className="achs__grid">
              {items.map((a) => (
                <div key={a.id} className={`ach${a.unlocked ? ' is-unlocked' : ''}${a.secret && !a.unlocked ? ' is-secret' : ''}`}>
                  <div className="ach__icon">{a.unlocked || !a.secret ? (a.icon ?? '★') : '?'}</div>
                  <div className="grow">
                    <div className="ach__title">{a.title}</div>
                    <div className="ach__desc">{a.description}</div>
                    {a.meter ? <ProgressBar value={a.meter[0] / Math.max(1, a.meter[1])} height={3} label={<span className="tnum">{a.meter[0]}/{a.meter[1]}</span>} /> : null}
                    {a.unlockedAt ? <div className="dim ach__date">{dateLabel(a.unlockedAt)}</div> : null}
                  </div>
                  {a.xp ? <span className="ach__xp mono">+{a.xp}</span> : null}
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Boards() {
  const p = useGame((s) => s.progress);
  const drills = drillRows(p);
  const options = [
    { value: 'shift:5:standard', label: '5-minute Shift · Standard' },
    { value: 'shift:5:strict', label: '5-minute Shift · Strict' },
    { value: 'shift:10:standard', label: '10-minute Shift · Standard' },
    { value: 'shift:10:strict', label: '10-minute Shift · Strict' },
    { value: 'shift:20:standard', label: 'Full Shift · Standard' },
    { value: 'shift:20:strict', label: 'Full Shift · Strict' },
    ...drills.map((d) => ({ value: `drill:${d.id}`, label: `${d.id} ${d.name}` })),
  ];
  const [board, setBoard] = useState(options[0]!.value);
  const entries = mq('leaderboard', [board], p.leaderboards[board] ?? []);
  return (
    <div className="boards">
      <div className="row">
        <Select value={board} onChange={setBoard} options={options} ariaLabel="Leaderboard" style={{ width: 340 }} />
        <span className="muted">Local boards — every profile on this browser. Top 20.</span>
      </div>
      {entries.length ? (
        <table className="boards__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Score</th>
              <th>Grade / medal</th>
              <th>Max combo</th>
              <th>Seed</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={i} className={e.profileId === p.profileId ? 'is-me' : ''}>
                <td className="tnum">{i + 1}</td>
                <td>{e.name}</td>
                <td className="tnum mono">{num(e.score)}</td>
                <td>{e.grade ? <span className={`grade-chip grade-chip--${e.grade}`}>{e.grade}</span> : e.medal ?? '—'}</td>
                <td className="tnum">×{e.maxCombo}</td>
                <td className="mono dim">{e.seed}</td>
                <td className="dim">{dateLabel(e.at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="muted boards__empty">No entries on this board yet.</div>
      )}
    </div>
  );
}
