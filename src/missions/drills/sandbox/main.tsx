/**
 * Drills sandbox (`sandbox-drills.html`, dev server port 5232): lists DR01–DR19 and runs each one through
 * the real mission runtime (`missions.startDrill`) inside the real UI drill overlay (`DrillHost`), with a
 * local clock driving `missions.tick`. Query: `?drill=DR05&mode=B` starts a drill directly.
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import { getState, mutate, useGame } from '@/core/store';
import { missions } from '@/missions';
import { MODULE_ORDER } from '@/content';
import { DrillHost } from '@/ui/overlays/DrillHost';
import { DRILLS } from '../index';
import '@/ui/styles/global.css';
import './sandbox.css';

const params = new URLSearchParams(location.search);

function boot(): void {
  try {
    missions.init?.();
  } catch (err) {
    console.warn('[sandbox] missions.init failed', err);
  }
  mutate((d) => {
    for (const id of MODULE_ORDER) {
      d.progress.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
    }
  });
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    try {
      const scale = getState().lab.time.timeScale || 1;
      missions.tick(dt * 1000 * scale);
      missions.frame?.(dt);
    } catch (err) {
      console.warn('[sandbox] tick failed', err);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function start(id: string, mode?: string | null): void {
  try {
    missions.startDrill(id, mode ? { mode } : undefined);
  } catch (err) {
    console.error('[sandbox] startDrill failed', err);
  }
}

function Sandbox() {
  const run = useGame((s) => s.session.drill);
  const overlay = useGame((s) => s.ui.overlay.kind);
  const result = useGame((s) => s.session.result);
  const [current, setCurrent] = useState<string | null>(params.get('drill'));

  useEffect(() => {
    if (current) start(current, params.get('mode'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (id: string, mode?: string) => {
    setCurrent(id);
    start(id, mode ?? null);
  };

  const live = run && overlay === 'drill' && run.phase !== 'finished';
  return (
    <div className="sbx">
      <aside className="sbx-side">
        <div className="sbx-brand">
          LabSim <b>Drills</b>
        </div>
        {DRILLS.map((d) => (
          <button key={d.id} type="button" className={`sbx-item${current === d.id ? ' is-on' : ''}`} onClick={() => go(d.id)}>
            <span className="sbx-item__id">{d.id}</span>
            <span className="sbx-item__name">{d.name}</span>
            <span className="sbx-item__meta">
              {d.durationS ? `${d.durationS}s` : ''}
              {d.itemCount ? ` · ${d.itemCount} items` : ''}
            </span>
            {d.modes?.length ? (
              <span className="sbx-item__modes">
                {d.modes.map((m) => (
                  <span
                    key={m.id}
                    className="sbx-mode"
                    onClick={(e) => {
                      e.stopPropagation();
                      go(d.id, m.id);
                    }}
                  >
                    {m.id}
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        ))}
      </aside>
      <main className="sbx-main">
        {live ? (
          <div className="sbx-stage">
            <DrillHost drillId={run.drillId} />
          </div>
        ) : result?.drill ? (
          <div className="sbx-result">
            <h2>
              {result.title} — {result.drill.score} pts
            </h2>
            <p>
              Accuracy {(result.drill.accuracy * 100).toFixed(0)}% · {result.drill.correct}/{result.drill.total} · best streak {result.drill.bestStreak} · medal {result.drill.medal ?? '—'}
            </p>
            {result.drill.teachCards.map((t) => (
              <div key={t.id} className="sbx-teach">
                <b>{t.whatHappened}</b>
                <div>{t.why}</div>
              </div>
            ))}
            <button type="button" className="sbx-again" onClick={() => go(result.drill!.drillId)}>
              Play again
            </button>
          </div>
        ) : (
          <div className="sbx-empty">Pick a drill on the left.</div>
        )}
      </main>
    </div>
  );
}

// Survive Vite HMR re-executing this module: reuse the root.
const w = window as unknown as { __drillsRoot?: ReturnType<typeof createRoot>; __drillsBooted?: boolean };
if (!w.__drillsBooted) {
  w.__drillsBooted = true;
  boot();
}
w.__drillsRoot ??= createRoot(document.getElementById('drills-root')!);
w.__drillsRoot.render(<Sandbox />);
