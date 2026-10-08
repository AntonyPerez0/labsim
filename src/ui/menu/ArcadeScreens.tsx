/**
 * Arcade menus: hub (Shift · Full Shift · Drills · Daily · Weak Spot), the Shift setup screen
 * (GP §2.3.1: length, seed, wildcard, realism, start position, rank difficulty cap, top-3 local scores),
 * the Drills catalogue (GP §2.4.2: format, unlock, medals, personal best) and the Daily Challenge (GP §4.6).
 */
import { useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import type { Realism } from '@/core/state';
import type { DailyChallengeInfo } from '@/missions';
import { RANKS_BY_ID } from '@/content';
import { Button, Card, Chip, EmptyState, FieldRow, Icon, MedalBadge, Segmented, TextField, Toggle } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { goMenu } from '@/ui/services/nav';
import { startDrillRun, startShiftRun } from '@/ui/services/actions';
import { drillRows, modeUnlock, shiftRows, tagLabel, type DrillRow } from '@/ui/data/views';
import { RANK_DIFFICULTY_CAP } from '@/ui/data/catalog';
import { dateLabel, num, pct } from '@/ui/services/format';

export function ArcadeHub() {
  const progress = useGame((s) => s.progress);
  const shifts = shiftRows(progress);
  const drills = drillRows(progress);
  const daily = modeUnlock(progress, 'daily');
  const weak = modeUnlock(progress, 'weak-spot');
  const weakest = mq('weakestTags', [3], []);
  const unlockedDrills = drills.filter((d) => d.unlock.unlocked).length;
  const short = shifts.find((s) => s.id === 'shift-5');
  const full = shifts.find((s) => s.id === 'shift-20');
  return (
    <div className="menu__page">
      <h1 className="menu__h1">Arcade</h1>
      <p className="muted menu__lead">Timed lab shifts with an incident queue, short drills for muscle memory, a seeded daily, and a playlist that hunts your weak spots.</p>
      <div className="arcade-grid">
        <Card className={`arcade-card arcade-card--shift${short?.unlock.unlocked ? '' : ' is-locked'}`} onClick={() => goMenu('shift-setup')}>
          <div className="arcade-card__icon">
            <Icon name="ticket" size={26} />
          </div>
          <div className="arcade-card__title">Shift</div>
          <div className="arcade-card__sub">5 or 10 real minutes. Tickets arrive, pipelines need rigs, Orca’s 5-minute health check comes round every real minute at 5×.</div>
          <div className="arcade-card__foot">
            {short?.unlock.unlocked ? <span className="tnum">Best {num(Math.max(0, ...shifts.map((s) => s.best)))}</span> : <Chip size="sm" icon="lock">{short?.unlock.reason}</Chip>}
          </div>
        </Card>
        <Card
          className={`arcade-card${full?.unlock.unlocked ? '' : ' is-locked'}`}
          onClick={() => {
            preselectShift = 'shift-20';
            goMenu('shift-setup');
          }}
        >
          <div className="arcade-card__icon">
            <Icon name="clock" size={26} />
          </div>
          <div className="arcade-card__title">Full Shift</div>
          <div className="arcade-card__sub">Twenty minutes, heat up to H5, planned work. A ratio of 0.80 counts toward CERT-R5.</div>
          <div className="arcade-card__foot">{full?.unlock.unlocked ? <span className="tnum">Best ratio {progress.shifts.bestFullShiftRatio.toFixed(2)}</span> : <Chip size="sm" icon="lock">{full?.unlock.reason ?? 'Complete M18'}</Chip>}</div>
        </Card>
        <Card className="arcade-card" onClick={() => goMenu('drills')}>
          <div className="arcade-card__icon">
            <Icon name="target" size={26} />
          </div>
          <div className="arcade-card__title">Drills</div>
          <div className="arcade-card__sub">Nineteen 45–120 s minigames: statuses, ports, power paths, JSON, coordinates, POMs.</div>
          <div className="arcade-card__foot">
            <span className="tnum">{unlockedDrills}/19 unlocked</span>
          </div>
        </Card>
        <Card className={`arcade-card${daily.unlocked ? '' : ' is-locked'}`} onClick={() => goMenu('daily')}>
          <div className="arcade-card__icon">
            <Icon name="calendar" size={26} />
          </div>
          <div className="arcade-card__title">Daily Challenge</div>
          <div className="arcade-card__sub">The same seeded 10-minute shift for everyone today. One ranked attempt.</div>
          <div className="arcade-card__foot">{daily.unlocked ? <span>{progress.daily.lastRankedDateKey ? `Last ranked ${progress.daily.lastRankedDateKey}` : 'Not played yet'}</span> : <Chip size="sm" icon="lock">{daily.reason}</Chip>}</div>
        </Card>
        <Card className={`arcade-card arcade-card--weak${weak.unlocked ? '' : ' is-locked'}`} onClick={() => (weak.unlocked ? ma('startWeakSpot') : undefined)}>
          <div className="arcade-card__icon">
            <Icon name="flame" size={26} />
          </div>
          <div className="arcade-card__title">Weak Spot</div>
          <div className="arcade-card__sub">About six minutes: drills on your three weakest topics, then a short micro-shift.</div>
          <div className="arcade-card__foot">
            {weak.unlocked ? (
              weakest.length ? (
                weakest.map((w) => (
                  <Chip key={w.tag} size="sm" tone="amber">
                    {tagLabel(w.tag)} {pct(w.mEff)}
                  </Chip>
                ))
              ) : (
                <span className="muted">Play a little first — we need evidence.</span>
              )
            ) : (
              <Chip size="sm" icon="lock">
                {weak.reason}
              </Chip>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/** Length to preselect on the next Shift setup visit (the Full Shift card opens setup on 20 min). */
let preselectShift: string | null = null;

export function ShiftSetup() {
  const progress = useGame((s) => s.progress);
  const shifts = shiftRows(progress);
  const firstOpen = shifts.find((s) => s.unlock.unlocked)?.id ?? 'shift-5';
  const [configId, setConfigId] = useState(() => {
    const want = preselectShift;
    preselectShift = null;
    return want && shifts.some((s) => s.id === want && s.unlock.unlocked) ? want : firstOpen;
  });
  const [seedMode, setSeedMode] = useState<'random' | 'daily' | 'custom'>('random');
  const [customSeed, setCustomSeed] = useState('');
  const [wildcard, setWildcard] = useState(false);
  const [realism, setRealism] = useState<Realism>(progress.realism);
  const [startPosition, setStart] = useState<'desk' | 'rack'>('desk');
  const sel = shifts.find((s) => s.id === configId) ?? shifts[0];
  const daily = mq('dailyInfo', [], null as unknown as DailyChallengeInfo);
  const board = `shift:${sel?.lengthMinutes ?? 5}:${realism}`;
  const top = mq('leaderboard', [board], []).slice(0, 3);
  const cap = RANK_DIFFICULTY_CAP[progress.rank] ?? 2;

  return (
    <div className="menu__page setup">
      <div className="setup__head">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => goMenu('arcade')}>
          Arcade
        </Button>
        <h1 className="menu__h1">Shift setup</h1>
      </div>
      <div className="setup__grid">
        <div className="setup__form">
          <div className="caps">Length</div>
          <div className="setup__lengths">
            {shifts.map((s) => (
              <button key={s.id} type="button" className={`setup__len${configId === s.id ? ' is-active' : ''}${s.unlock.unlocked ? '' : ' is-locked'}`} disabled={!s.unlock.unlocked} onClick={() => setConfigId(s.id)}>
                <span className="setup__len-min tnum">{s.lengthMinutes}</span>
                <span className="setup__len-unit">min</span>
                <span className="setup__len-title">{s.lengthMinutes === 20 ? 'Full Shift' : `Heat cap H${s.heatCap}`}</span>
                {!s.unlock.unlocked ? (
                  <span className="setup__len-lock">
                    <Icon name="lock" size={11} /> {s.unlock.reason}
                  </span>
                ) : s.best ? (
                  <span className="setup__len-best tnum">best {num(s.best)}</span>
                ) : null}
              </button>
            ))}
          </div>
          {sel ? <p className="muted">{sel.description}</p> : null}
          <FieldRow label="Seed" hint={seedMode === 'daily' ? `Today’s seed: ${daily?.seedString ?? 'labsim-daily-v1:…'} (read-only, not ranked here)` : seedMode === 'custom' ? 'Any text — share it so a friend gets the same shift.' : 'A fresh shift every time.'}>
            <Segmented
              value={seedMode}
              onChange={setSeedMode}
              options={[
                { value: 'random', label: 'Random' },
                { value: 'daily', label: 'Daily' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </FieldRow>
          {seedMode === 'custom' ? <TextField value={customSeed} onChange={setCustomSeed} placeholder="e.g. tuesday-fuses" mono ariaLabel="Custom seed" /> : null}
          <Toggle label="Wildcard" hint="Every incident eligible — even ones you haven’t been taught. Score ×1.2; such tickets carry a “Not yet taught” ribbon." checked={wildcard} onChange={setWildcard} />
          <FieldRow label="Realism" hint={realism === 'strict' ? 'Strict: no markers, history-only terminal, hint tier 1 only, XP ×1.25.' : 'Standard: markers, tab completion, full hint ladder.'}>
            <Segmented
              value={realism}
              onChange={setRealism}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'strict', label: 'Strict' },
              ]}
            />
          </FieldRow>
          <FieldRow label="Start position">
            <Segmented
              value={startPosition}
              onChange={setStart}
              options={[
                { value: 'desk', label: 'At your desk' },
                { value: 'rack', label: 'At the racks' },
              ]}
            />
          </FieldRow>
        </div>
        <aside className="setup__side">
          <div className="setup__cap">
            <div className="caps">Your difficulty cap</div>
            <div className="setup__cap-val">
              D{cap} <span className="muted">· {RANKS_BY_ID[progress.rank]?.title ?? progress.rank}</span>
            </div>
            <div className="muted">Incidents above D{cap} won’t spawn until you’re promoted (Daily ignores this).</div>
          </div>
          <div className="setup__board">
            <div className="caps">Top scores · {sel?.lengthMinutes} min · {realism}</div>
            {top.length ? (
              <ol>
                {top.map((e, i) => (
                  <li key={i}>
                    <span className="setup__rank">{i + 1}</span>
                    <span className="grow">{e.name}</span>
                    {e.grade ? <span className={`grade-chip grade-chip--${e.grade}`}>{e.grade}</span> : null}
                    <span className="tnum mono">{num(e.score)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">No scores yet on this board.</div>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            icon="play"
            block
            disabled={!sel?.unlock.unlocked || (seedMode === 'custom' && !customSeed.trim())}
            onClick={() => startShiftRun({ configId, seedMode, customSeed: seedMode === 'custom' ? customSeed.trim() : undefined, wildcard, realism, startPosition })}
          >
            Clock in
          </Button>
        </aside>
      </div>
    </div>
  );
}

export function DrillsScreen() {
  const progress = useGame((s) => s.progress);
  const rows = drillRows(progress);
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'medals'>('all');
  const list = rows.filter((r) => (filter === 'unlocked' ? r.unlock.unlocked : filter === 'medals' ? !!r.medal : true));
  const golds = rows.filter((r) => r.medal === 'gold').length;
  return (
    <div className="menu__page">
      <div className="setup__head">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => goMenu('arcade')}>
          Arcade
        </Button>
        <h1 className="menu__h1">Drills</h1>
        <span className="spacer" />
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'All 19' },
            { value: 'unlocked', label: 'Unlocked' },
            { value: 'medals', label: 'Medals' },
          ]}
        />
      </div>
      <p className="muted menu__lead">
        Correct +100, up to +50 for answering within 2 s, streak multiplier up to ×2.0, wrong −50 with a two-line Teach Card. {golds} gold medal{golds === 1 ? '' : 's'} so far.
      </p>
      <div className="drill-grid">
        {list.map((d) => (
          <DrillCard key={d.id} d={d} />
        ))}
      </div>
    </div>
  );
}

function DrillCard({ d }: { d: DrillRow }) {
  const locked = !d.unlock.unlocked;
  const next = d.medal === 'gold' ? null : d.medal === 'silver' ? d.medals.gold : d.medal === 'bronze' ? d.medals.silver : d.medals.bronze;
  return (
    <Card className={`drill-card${locked ? ' is-locked' : ''}`} onClick={locked ? undefined : () => startDrillRun(d.id)}>
      <div className="drill-card__head">
        <span className="mono drill-card__id">{d.id}</span>
        <MedalBadge medal={d.medal} size={22} />
      </div>
      <div className="drill-card__name">{d.name}</div>
      {d.alias ? <div className="drill-card__alias muted">“{d.alias}”</div> : null}
      <div className="drill-card__format muted">{d.format}</div>
      <div className="drill-card__foot">
        {locked ? (
          <Chip size="sm" icon="lock">
            {d.unlock.reason}
          </Chip>
        ) : (
          <>
            <span className="tnum">{d.best ? `Best ${num(d.best)}` : 'No score yet'}</span>
            {next ? <span className="muted tnum">next medal {num(next)}</span> : <span className="ok">Gold</span>}
          </>
        )}
      </div>
      <div className="drill-card__medals">
        <span className="tnum">
          <i className="m-b" /> {d.medals.bronze}
        </span>
        <span className="tnum">
          <i className="m-s" /> {d.medals.silver}
        </span>
        <span className="tnum">
          <i className="m-g" /> {d.medals.gold}
        </span>
        <span className="muted">{d.durationS ? `${d.durationS} s` : ''}{d.itemCount ? ` · ${d.itemCount} items` : ''}</span>
      </div>
    </Card>
  );
}

export function DailyScreen() {
  const progress = useGame((s) => s.progress);
  const unlock = modeUnlock(progress, 'daily');
  const info = mq('dailyInfo', [], null as unknown as DailyChallengeInfo);
  const history = progress.daily.history.slice(-7).reverse();
  const drill = useMemo(() => drillRows(progress).find((d) => d.id === info?.drillId), [progress, info?.drillId]);
  const board = info ? mq('leaderboard', [`daily:${info.dateKey}:${progress.realism}`], []).slice(0, 5) : [];
  return (
    <div className="menu__page">
      <div className="setup__head">
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={() => goMenu('arcade')}>
          Arcade
        </Button>
        <h1 className="menu__h1">Daily Challenge</h1>
      </div>
      {!unlock.unlocked ? (
        <EmptyState icon="lock" title="Daily Challenge is locked">
          {unlock.reason}. Everyone plays the same seeded 10-minute shift each day — one ranked attempt.
        </EmptyState>
      ) : !info || !hasMission('startDaily') ? (
        <EmptyState icon="calendar" title="Today’s challenge is being prepared">
          The daily seed is <span className="mono">labsim-daily-v1:&lt;date&gt;</span>; it opens when the Arcade runtime is installed.
        </EmptyState>
      ) : (
        <div className="daily">
          <Card className="daily__hero">
            <div className="caps">{dateLabel(Date.now())}</div>
            <div className="daily__title">Seeded 10-minute shift</div>
            <div className="mono muted">{info.seedString}</div>
            <div className="row" style={{ marginTop: 16 }}>
              <Button variant="primary" size="lg" icon="play" disabled={!info.rankedAvailable} onClick={() => ma('startDaily', { practice: false })}>
                {info.rankedAvailable ? 'Ranked attempt' : 'Ranked attempt used'}
              </Button>
              <Button size="lg" onClick={() => ma('startDaily', { practice: true })}>
                Practice (half XP)
              </Button>
            </div>
            {info.bestToday !== null ? <div className="muted">Your best today: {num(info.bestToday)}</div> : null}
          </Card>
          <Card className="daily__drill">
            <div className="caps">Daily Drill</div>
            <div className="daily__drill-name">
              <span className="mono">{info.drillId}</span> {drill?.name}
            </div>
            <div className="muted">{drill?.format}</div>
            <Button icon="target" onClick={() => ma('startDailyDrill')}>
              Play the Daily Drill
            </Button>
          </Card>
          <Card className="daily__board">
            <div className="caps">Today’s board</div>
            {board.length ? (
              <ol>
                {board.map((e, i) => (
                  <li key={i}>
                    <span className="setup__rank">{i + 1}</span>
                    <span className="grow">{e.name}</span>
                    <span className="tnum mono">{num(e.score)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="muted">Be the first on today’s board.</div>
            )}
            {history.length ? (
              <>
                <div className="caps" style={{ marginTop: 12 }}>
                  Your last week
                </div>
                <ul className="daily__hist">
                  {history.map((h) => (
                    <li key={h.dateKey}>
                      <span className="mono">{h.dateKey}</span>
                      <span className={`grade-chip grade-chip--${h.grade}`}>{h.grade}</span>
                      <span className="tnum">{num(h.score)}</span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        </div>
      )}
    </div>
  );
}
