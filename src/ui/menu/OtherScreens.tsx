/**
 * Free Play start screen (GP §2.5) and the Certification hub (Cur §5, GP §4.3).
 */
import { useGame } from '@/core/store';
import { EXAMS, RANKS_BY_ID } from '@/content';
import { Button, Card, Chip, EmptyState, Icon, Kbd, Toggle } from '@/ui/kit';
import { mq } from '@/ui/services/missions';
import { openOverlay } from '@/ui/services/nav';
import { startFreeplayRun } from '@/ui/services/actions';
import { modeUnlock } from '@/ui/data/views';
import { dateLabel } from '@/ui/services/format';
import { setSetting } from '@/ui/overlays/Settings';

export function FreePlayScreen() {
  const progress = useGame((s) => s.progress);
  const unlock = modeUnlock(progress, 'freeplay');
  const st = progress.settings;
  const slots = mq('snapshotSlots', [], []);
  return (
    <div className="menu__page fp">
      <h1 className="menu__h1">Free Play</h1>
      <p className="muted menu__lead">The whole lab, live: all twelve modelled rigs, every app, all 42 rigs in Orca and pipelines PL1–PL8. Break things on purpose with the Fault Injector, then fix them by the book.</p>
      {!unlock.unlocked ? (
        <EmptyState icon="lock" title="Free Play unlocks after M04" action={<Button onClick={() => startFreeplayRun({ fresh: true })}>Walk the lab anyway</Button>}>
          {unlock.reason} (Touch Robot Mechanics) to open the sandbox and Fault Injector.
        </EmptyState>
      ) : (
        <div className="fp__grid">
          <Card className="fp__start">
            <div className="fp__icon">
              <Icon name="sandbox" size={28} />
            </div>
            <div className="fp__title">Factory-fresh lab</div>
            <div className="muted">Every rig at its factory state (GP §3.1 roster). 30 XP per injected fault you fix, up to 300 XP a day.</div>
            <Button variant="primary" size="lg" icon="play" onClick={() => startFreeplayRun({ fresh: true })}>
              Enter the lab
            </Button>
            <div className="fp__keys">
              <Kbd k="F10" size="sm" /> sandbox panel · hold <Kbd k="]" size="sm" /> fast-forward ×30
            </div>
          </Card>
          <Card className="fp__slots">
            <div className="caps">Saved labs</div>
            {([1, 2, 3] as const).map((n) => {
              const s = slots[n - 1] ?? null;
              return (
                <div key={n} className="fp__slot">
                  <span className="fp__slot-n">{n}</span>
                  <div className="grow">
                    <div>{s ? s.label : 'Empty slot'}</div>
                    <div className="muted">{s ? dateLabel(s.savedAt) : 'Save from the sandbox panel (F10).'}</div>
                  </div>
                  <Button size="sm" disabled={!s} onClick={() => startFreeplayRun({ slot: n })}>
                    Load
                  </Button>
                </div>
              );
            })}
          </Card>
          <Card className="fp__opts">
            <div className="caps">Sandbox defaults</div>
            <Toggle label="Penalties" hint="Off by default; Teach Cards still fire." checked={st.freeplayPenalties} onChange={(v) => setSetting('freeplayPenalties', v)} />
            <Toggle label="Background pipelines" checked={st.freeplayPipelines} onChange={(v) => setSetting('freeplayPipelines', v)} />
            <Toggle label="Random faults every 3 min" checked={st.freeplayRandomFaults !== 'off'} onChange={(v) => setSetting('freeplayRandomFaults', v ? '3min' : 'off')} />
          </Card>
        </div>
      )}
    </div>
  );
}

export function CertificationScreen() {
  const progress = useGame((s) => s.progress);
  const certs = mq('certifications', [], []);
  const exams = certs.length ? certs : EXAMS;
  return (
    <div className="menu__page">
      <h1 className="menu__h1">Certification</h1>
      <p className="muted menu__lead">Five exams, each a written paper plus a hands-on practical. Passing one — with the XP threshold and the rank’s extra gate — promotes you.</p>
      <div className="cert-list">
        {exams.map((e) => {
          const v = mq('certView', [e.id], null);
          const rec = progress.certs[e.id as keyof typeof progress.certs];
          const passed = rec?.passed ?? false;
          const eligible = v?.eligible ?? false;
          const rank = RANKS_BY_ID[e.careerRankId];
          return (
            <Card key={e.id} className={`cert-card${passed ? ' is-passed' : eligible ? ' is-ready' : ''}`}>
              <div className="cert-card__badge">
                <Icon name={passed ? 'award' : eligible ? 'graduation' : 'lock'} size={22} />
              </div>
              <div className="grow">
                <div className="cert-card__head">
                  <span className="mono">{e.id}</span>
                  <span className="cert-card__title">{e.title}</span>
                  {passed ? (
                    <Chip size="sm" tone="green" icon="check">
                      Passed{rec?.distinction ? ' with distinction' : ''}
                    </Chip>
                  ) : eligible ? (
                    <Chip size="sm" tone="gold">
                      Exam ready
                    </Chip>
                  ) : null}
                </div>
                <div className="muted">Promotes to {rank?.title ?? e.careerRankId} · {e.written.items} written items ({e.written.minutes} min, {e.written.passPercent} % to pass) + {e.practical.minutes}-min practical</div>
                <div className="cert-card__elig">{e.eligibility.text}</div>
                {v?.missing.length ? (
                  <div className="row wrap">
                    {v.missing.map((m) => (
                      <Chip key={m} size="sm" icon="lock">
                        {m}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {rec ? <div className="muted">Attempts {rec.attempts} · best written {Math.round(rec.bestWrittenPct)} %</div> : null}
              </div>
              <Button variant={eligible ? 'primary' : 'secondary'} onClick={() => openOverlay({ kind: 'certification', examId: e.id }, { push: true })}>
                {passed ? 'Retake' : eligible ? 'Start' : 'Details'}
              </Button>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
