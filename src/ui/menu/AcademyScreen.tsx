/**
 * Academy (Cur §2, GP §2.2): module map M01–M18 grouped into four tracks, each node showing lock /
 * in-progress / complete, stars and best checkpoint; the briefing panel shows the selected module's
 * mentor, objectives, estimated time, prerequisites, checkpoint, what it unlocks (GP §2.2.2), and
 * Start / Continue / Replay (replays pay 25 % XP and re-arm the module's seeded faults).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { MODULES, MODULES_BY_ID, personName, teamMember } from '@/content';
import { Avatar, Button, Chip, Icon, ProgressBar, Stars } from '@/ui/kit';
import { moduleViewFor, modulesCompleted, nextModule, totalStars } from '@/ui/data/views';
import { resumeAcademy, startModule } from '@/ui/services/actions';
import { pct, shortTitle, estLabel } from '@/ui/services/format';

const TRACKS: { title: string; sub: string; ids: string[] }[] = [
  { title: 'Foundations', sub: 'The lab, the devices, power and the robots', ids: ['M01', 'M02', 'M03', 'M04', 'M05'] },
  { title: 'Orca & Jenkins', sub: 'Statuses, entities, merchants, screens and pipelines', ids: ['M06', 'M07', 'M08', 'M09', 'M10', 'M11'] },
  { title: 'Automation code', sub: 'ADB, uia-remote, config.properties, Pigeon and OCR', ids: ['M12', 'M13', 'M14', 'M15', 'M16'] },
  { title: 'Capstone', sub: 'AI, infrastructure, teams and the capstone shift', ids: ['M17', 'M18'] },
];

/** GP §2.2.2 — what each module unlocks outside the Academy (display). */
const UNLOCKS: Record<string, string[]> = {
  M01: ['DR10 Speed Quiz', 'DR14', 'DR17', 'Field Manual: Lab Basics'],
  M03: ['INC03, INC17, INC18', 'DR04, DR13', 'Hotbar: multimeter, spare fuse'],
  M04: ['6 incidents', 'DR16 Park It!', '5-minute Shift', 'Free Play', 'Hotbar: screwdriver'],
  M05: ['INC19, INC56', 'Terminal'],
  M06: ['12 incidents', 'DR01, DR09', 'Weak Spot', 'Hotbar: Ethernet cable'],
  M07: ['9 incidents', 'DR11, DR12'],
  M08: ['INC23, INC28, INC49–51'],
  M09: ['INC20, INC21, INC52', 'DR07'],
  M10: ['INC53–55, INC58', 'Hotbar: test card', '10-minute Shift'],
  M11: ['INC26, INC39, INC44'],
  M12: ['DR03, DR19 ADB Speedrun'],
  M13: ['INC32–34', 'DR08 POM Builder, DR15'],
  M14: ['INC27, INC29, INC30, INC35, INC47', 'DR02, DR09 (all sets)', 'Daily Challenge'],
  M15: ['INC22, INC25', 'DR06 JSON Medic, DR18'],
  M16: ['INC24, INC36–38, INC64', 'DR05'],
  M17: ['INC10, INC57, INC61'],
  M18: ['Full Shift (20 min)', 'Certification exams'],
};

export function AcademyScreen() {
  const progress = useGame((s) => s.progress);
  const [sel, setSel] = useState<string>(() => nextModule(progress) ?? 'M01');
  const ids = useMemo(() => MODULES.map((m) => m.id), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const i = ids.indexOf(sel);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        setSel(ids[Math.min(ids.length - 1, i + 1)]!);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSel(ids[Math.max(0, i - 1)]!);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, ids]);

  const done = modulesCompleted(progress);
  return (
    <div className="acad">
      <div className="acad__map">
        <header className="acad__head">
          <div>
            <h1 className="menu__h1">Academy</h1>
            <p className="muted">Eighteen guided modules. Each ends with a checkpoint quiz (80 % to pass) and unlocks Arcade content.</p>
          </div>
          <div className="acad__summary">
            <div>
              <span className="tnum acad__big">{done}</span>
              <span className="muted">/18 complete</span>
            </div>
            <div>
              <Stars value={1} max={1} size={14} /> <span className="tnum">{totalStars(progress)}</span>
              <span className="muted">/54</span>
            </div>
          </div>
        </header>
        <ProgressBar value={done / 18} height={4} glow />
        {TRACKS.map((t) => (
          <section key={t.title} className="acad__track">
            <div className="acad__track-head">
              <span className="acad__track-title">{t.title}</span>
              <span className="muted">{t.sub}</span>
            </div>
            <div className="acad__nodes">
              {t.ids.map((id, i) => {
                const v = moduleViewFor(progress, id);
                if (!v) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`acad-node acad-node--${v.state}${sel === id ? ' is-selected' : ''}${v.resumable ? ' is-resumable' : ''}`}
                    onClick={() => setSel(id)}
                    onDoubleClick={() => v.state !== 'locked' && startModule(id, v.state === 'completed')}
                  >
                    {i > 0 ? <span className="acad-node__link" aria-hidden /> : null}
                    <span className="acad-node__top">
                      <span className="mono acad-node__id">{id}</span>
                      {v.state === 'locked' ? <Icon name="lock" size={12} /> : v.state === 'completed' ? <Icon name="check" size={13} stroke={2.6} /> : v.state === 'in-progress' ? <span className="acad-node__dot" /> : null}
                    </span>
                    <span className="acad-node__title">{shortTitle(v.meta.title)}</span>
                    <span className="acad-node__foot">
                      <Stars value={v.stars} size={11} />
                      {v.bestCheckpoint ? <span className="tnum muted">{pct(v.bestCheckpoint)}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
      <ModuleBriefing id={sel} />
    </div>
  );
}

function ModuleBriefing({ id }: { id: string }) {
  const progress = useGame((s) => s.progress);
  const v = moduleViewFor(progress, id);
  if (!v) return null;
  const m = v.meta;
  const mentor = teamMember(m.mentor);
  const locked = v.state === 'locked';
  const unlocks = v.unlocks.drills.length || v.unlocks.incidents.length || v.unlocks.modes.length ? [...v.unlocks.modes, ...v.unlocks.drills, ...v.unlocks.incidents] : (UNLOCKS[id] ?? []);
  return (
    <aside className="brief" key={id}>
      <div className="brief__eyebrow">
        <span className="mono">{m.id}</span>
        <Chip size="sm" tone={v.state === 'completed' ? 'green' : v.state === 'in-progress' ? 'amber' : locked ? 'grey' : 'blue'}>
          {v.state === 'completed' ? 'Complete' : v.state === 'in-progress' ? 'In progress' : locked ? 'Locked' : 'Available'}
        </Chip>
        <span className="spacer" />
        <Chip size="sm" icon="clock">
          {estLabel(m)}
        </Chip>
      </div>
      <h2 className="brief__title">{m.title}</h2>
      <div className="brief__mentor">
        <Avatar name={personName(m.mentor)} color={mentor?.color ?? '#43b02a'} size={36} ring />
        <div>
          <div className="brief__mentor-name">{personName(m.mentor)}</div>
          <div className="muted brief__mentor-role">{mentor?.role}</div>
        </div>
        {m.cameos?.length ? (
          <div className="brief__cameos" title="Also appearing">
            {m.cameos.map((c) => (
              <Avatar key={c} name={personName(c)} color={teamMember(c)?.color ?? '#555'} size={24} />
            ))}
          </div>
        ) : null}
      </div>
      <p className="brief__summary">{m.summary}</p>
      <div className="caps">Objectives</div>
      <ul className="brief__obj">
        {m.objectives.map((o, i) => (
          <li key={i}>
            <Icon name="target" size={13} />
            <span>{o}</span>
          </li>
        ))}
      </ul>
      <div className="brief__meta">
        <div>
          <div className="caps">Checkpoint</div>
          <div>
            <span className="mono">{m.checkpointId ?? '—'}</span> {m.checkpointTitle ? <span className="muted">{m.checkpointTitle}</span> : null}
          </div>
          <div className="muted">
            {m.checkpointQuestionIds.length} questions · best {v.bestCheckpoint ? pct(v.bestCheckpoint) : '—'}
          </div>
        </div>
        <div>
          <div className="caps">Your record</div>
          <Stars value={v.stars} size={15} />
          <div className="muted">{v.replays ? `${v.replays} replay${v.replays === 1 ? '' : 's'}` : 'Not replayed'}</div>
        </div>
      </div>
      {m.prerequisites.length ? (
        <div className="brief__prereq">
          <span className="caps">Needs</span>
          {m.prerequisites.length > 6 ? (
            <Chip size="sm" tone={v.missingPrereqs.length ? 'amber' : 'green'}>
              {v.missingPrereqs.length ? `${v.missingPrereqs.length} modules to go` : 'All modules'}
            </Chip>
          ) : (
            m.prerequisites.map((p) => (
              <Chip key={p} size="sm" tone={v.missingPrereqs.includes(p) ? 'amber' : 'green'} icon={v.missingPrereqs.includes(p) ? 'lock' : 'check'} title={MODULES_BY_ID[p]?.title}>
                {p}
              </Chip>
            ))
          )}
        </div>
      ) : null}
      {unlocks.length ? (
        <div className="brief__unlocks">
          <div className="caps">Unlocks</div>
          <div className="row wrap">
            {unlocks.map((u) => (
              <Chip key={u} size="sm" tone="cyan">
                {u}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
      <div className="brief__actions">
        {locked ? (
          <Button variant="secondary" size="lg" icon="lock" disabled block>
            Complete {v.missingPrereqs.join(', ')} first
          </Button>
        ) : v.resumable ? (
          <>
            <Button variant="primary" size="lg" icon="play" block onClick={() => (resumeAcademy() ? undefined : startModule(id))}>
              Continue from checkpoint
            </Button>
            <Button variant="ghost" onClick={() => startModule(id, v.state === 'completed')}>
              Start over
            </Button>
          </>
        ) : v.state === 'completed' ? (
          <>
            <Button variant="primary" size="lg" icon="refresh" block onClick={() => startModule(id, true)}>
              Replay module
            </Button>
            <div className="muted brief__note">Replays pay 25 % XP and re-arm the module’s seeded faults. First ★★ +50 XP, first ★★★ +100 XP.</div>
          </>
        ) : (
          <Button variant="primary" size="lg" icon="play" block onClick={() => startModule(id)}>
            Start module
          </Button>
        )}
      </div>
    </aside>
  );
}
