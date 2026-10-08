/**
 * Drill overlay (`drill`, GP §2.4): header with the round clock, score, streak multiplier, medal
 * thresholds and End round; the drill body (`DrillDef.component`, else the UI drill registry, else the
 * generic quiz-item board); and the inline 2-line Teach Card after a wrong answer (2.5 s or click).
 */
import { createElement, useEffect, useMemo, useState, type ComponentType } from 'react';
import { useGame } from '@/core/store';
import type { DrillComponentProps, DrillDef, DrillFeedback, DrillVerdict } from '@/missions';
import { Button, EmptyState, Icon, MedalBadge, Modal } from '@/ui/kit';
import { hasMission, ma, mq } from '@/ui/services/missions';
import { closeOverlay, goMenu } from '@/ui/services/nav';
import { mmss, num } from '@/ui/services/format';
import { ErrorBoundary } from '@/ui/app/ErrorBoundary';
import { DRILL_CATALOG } from '@/ui/data/catalog';
import { getDrillComponent } from '@/ui/drills/registry';
import { GenericDrill } from '@/ui/drills/GenericDrill';
import { MIXED_DRILL_COMPONENT } from '@/missions/drills';

/** Weak Spot's embedded warm-up round (`runtime/drills/host.ts` `mixedDrillDef`): not in the drill catalogue. */
const WEAKSPOT = { id: 'WEAKSPOT', name: 'Weak Spot warm-up', medals: { bronze: 300, silver: 500, gold: 700 } } as const;

const EMPTY_FEEDBACK: DrillFeedback = { points: 0, streak: 0, multiplier: 1, score: 0, teach: null, nextItemId: null };

export function DrillHost({ drillId }: { drillId: string }) {
  const def = useMemo<DrillDef | null>(() => mq('drills', [], []).find((d) => d.id === drillId) ?? null, [drillId]);
  const cat = DRILL_CATALOG.find((d) => d.id === drillId);
  const run = useGame((s) => s.session.drill);
  const realism = useGame((s) => s.session.realism);
  const weakSpot = drillId === WEAKSPOT.id;
  const name = def?.name ?? cat?.name ?? (weakSpot ? WEAKSPOT.name : drillId);
  const medals = def?.medals ?? cat?.medals ?? (weakSpot ? WEAKSPOT.medals : null);

  const props = useMemo<DrillComponentProps>(
    () => ({
      drillId,
      mode: run?.mode ?? null,
      item: (id: string) => mq('drillItem', [id], null),
      answer: (id: string, v: DrillVerdict) => mq('answerDrill', [id, v], EMPTY_FEEDBACK),
      finish: () => {
        ma('finishDrill');
      },
      realism,
    }),
    [drillId, run?.mode, realism],
  );

  const Comp = (def?.component as ComponentType<DrillComponentProps> | undefined) ?? getDrillComponent(drillId) ?? (weakSpot ? (MIXED_DRILL_COMPONENT as ComponentType<DrillComponentProps>) : null) ?? GenericDrill;

  if (!hasMission('startDrill') || (!run && !def)) {
    return (
      <Modal width={560} onClose={() => closeOverlay()} backdrop="blur">
        <EmptyState icon="target" title={`${drillId} · ${name}`} action={<Button onClick={() => goMenu('drills')}>Back to Drills</Button>}>
          {cat?.format ?? 'This drill'} — the drill runtime is still being installed.
        </EmptyState>
      </Modal>
    );
  }

  const top = medals ? medals.gold * 1.15 : 1;
  const score = run?.score ?? 0;
  return (
    <div className="drill" data-ui-interactive>
      <header className="drill__head">
        <div className="drill__title">
          <span className="mono drill__id">{drillId}</span>
          <span>{name}</span>
          {def?.alias ? <span className="muted">“{def.alias}”</span> : null}
          {run?.daily ? <span className="drill__daily">Daily Drill</span> : null}
        </div>
        <div className="drill__stats">
          {run?.timeLeftS !== null && run?.timeLeftS !== undefined ? (
            <div className={`drill__clock tnum${run.timeLeftS <= 10 ? ' is-low' : ''}`}>
              <Icon name="clock" size={16} /> {mmss(run.timeLeftS)}
            </div>
          ) : run?.itemTarget ? (
            <div className="drill__clock tnum">
              {Math.min(run.index + 1, run.itemTarget)} / {run.itemTarget}
            </div>
          ) : null}
          <div className="drill__score tnum">{num(score)}</div>
          <div className={`drill__mult tnum${(run?.multiplier ?? 1) > 1 ? ' is-hot' : ''}`}>
            ×{(run?.multiplier ?? 1).toFixed(1)}
            <span className="muted"> streak {run?.streak ?? 0}</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => ma('finishDrill')}>
          End round
        </Button>
      </header>
      {medals ? (
        <div className="drill__medals">
          <div className="drill__medal-track">
            <span className="drill__medal-fill" style={{ width: `${Math.min(100, (score / top) * 100)}%` }} />
            {(['bronze', 'silver', 'gold'] as const).map((m) => (
              <span key={m} className={`drill__medal-mark${score >= medals[m] ? ' is-hit' : ''}`} style={{ left: `${(medals[m] / top) * 100}%` }} title={`${m} ${medals[m]}`}>
                <MedalBadge medal={m} size={18} />
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <main className="drill__stage">
        {run?.phase === 'intro' ? (
          <div className="drill__intro">
            <div className="caps">Get ready</div>
            <h2>{name}</h2>
            <p className="muted">{def?.format ?? cat?.format}</p>
            <p className="muted">Correct +100 · fast answers (≤ 2 s) up to +50 · streak multiplier up to ×2.0 · wrong −50</p>
          </div>
        ) : (
          <ErrorBoundary label={`drill ${drillId}`} resetKey={run?.currentItemId ?? 0}>
            {createElement(Comp, props)}
          </ErrorBoundary>
        )}
        <InlineTeach />
      </main>
    </div>
  );
}

function InlineTeach() {
  const teach = useGame((s) => s.session.drill?.teach ?? null);
  const [hidden, setHidden] = useState<string | null>(null);
  useEffect(() => {
    if (!teach) return;
    setHidden(null);
    const t = setTimeout(() => setHidden(teach.id), 2500);
    return () => clearTimeout(t);
  }, [teach?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!teach || hidden === teach.id) return null;
  return (
    <button type="button" className="drill__teach" onClick={() => setHidden(teach.id)}>
      <Icon name="hint" size={16} />
      <div>
        <div className="drill__teach-what">{teach.whatHappened}</div>
        <div className="drill__teach-why">
          {teach.why}
          {teach.ref ? <span className="teach__ref">{teach.ref}</span> : null}
        </div>
      </div>
    </button>
  );
}
