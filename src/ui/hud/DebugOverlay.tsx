/**
 * Developer overlay (backtick): renderer stats (`engine.stats()`), loop FPS, session/ui summary, the
 * recent event log (`bus.history`) and time controls (skip to the next health check, time scale).
 */
import { useEffect, useState } from 'react';
import { bus } from '@/core/bus';
import { mutate, store, useGame } from '@/core/store';
import { engine } from '@/engine';
import { sim } from '@/sim';
import { TIME_SCALES } from '@/sim/types';
import { Button, Icon, Segmented } from '@/ui/kit';
import { gameClockSeconds } from '@/ui/services/format';
import { hasMission, maQuiet } from '@/ui/services/missions';

interface Stats {
  fps: number;
  drawCalls: number;
  triangles: number;
  textures: number;
  geometries: number;
}

function readStats(): Stats | null {
  try {
    return engine.stats();
  } catch {
    return null;
  }
}

function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.warn('[debug] action failed', err);
  }
}

export function DebugOverlay() {
  const [stats, setStats] = useState<Stats | null>(readStats);
  const [events, setEvents] = useState(() => bus.history.slice(-14));
  const [filter, setFilter] = useState('');
  const session = useGame((s) => s.session);
  const overlay = useGame((s) => s.ui.overlay);
  const now = useGame((s) => s.lab.time.nowMs);
  const scale = useGame((s) => s.lab.time.timeScale);
  const pointer = useGame((s) => s.ui.pointerLocked);

  useEffect(() => {
    const t = setInterval(() => {
      setStats(readStats());
      const f = filter.trim();
      setEvents(bus.history.filter((e) => !f || e.type.includes(f)).slice(-14));
    }, 400);
    return () => clearInterval(t);
  }, [filter]);

  const rows: [string, string][] = [
    ['mode', `${session.mode}${session.activityId ? ` · ${session.activityId}` : ''}`],
    ['overlay', overlay.kind],
    ['game clock', `${gameClockSeconds(now)} ×${scale}`],
    ['session clock', `${session.clockS.toFixed(1)} s`],
    ['academy', session.academy ? `${session.academy.moduleId} step ${session.academy.stepIndex + 1} (${session.academy.stepKind}, ${session.academy.phase}) hint ${session.academy.hintTier}` : '—'],
    ['shift', session.shift ? `${session.shift.configId} H${session.shift.heat} ${Math.round(session.shift.elapsedS)}/${session.shift.durationS}s score ${session.shift.score}` : '—'],
    ['tickets', session.tickets.length ? session.tickets.map((t) => `${t.id}:${t.incidentId}:${t.status}`).join('  ') : '—'],
    ['tool', `${session.activeTool} · fuse ${session.toolModes.fuseRating} A · meter ${session.toolModes.multimeter}`],
    ['player', `${session.player.position.map((v) => v.toFixed(2)).join(', ')} · ${session.player.locationId ?? '—'} · ${session.player.lookingAt ?? '—'}`],
    ['pointer lock', pointer ? 'locked' : 'free'],
    ['runtime', hasMission('careerRank') ? 'missions runtime live' : 'missions stub'],
  ];

  return (
    <aside className="dbg" data-ui-interactive>
      <header className="dbg__head">
        <Icon name="cpu" size={14} />
        <span>Debug</span>
        <span className="spacer" />
        <span className="mono dim">` to close</span>
      </header>
      <div className="dbg__stats mono">
        <span>
          <b>{stats ? Math.round(stats.fps) : '—'}</b> fps
        </span>
        <span>
          <b>{stats?.drawCalls ?? '—'}</b> draws
        </span>
        <span>
          <b>{stats ? `${Math.round(stats.triangles / 1000)}k` : '—'}</b> tris
        </span>
        <span>
          <b>{stats?.textures ?? '—'}</b> tex
        </span>
        <span>
          <b>{stats?.geometries ?? '—'}</b> geo
        </span>
      </div>
      <dl className="dbg__kv">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd className="mono">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="dbg__actions">
        <Button size="sm" icon="refresh" onClick={() => safe(() => sim.skipToNextHealthCheck())}>
          Next health check
        </Button>
        <Button size="sm" icon="fast-forward" onClick={() => safe(() => sim.fastForward(60_000))}>
          +1 game min
        </Button>
        <Button
          size="sm"
          icon="sparkle"
          onClick={() => {
            if (hasMission('debugGrant')) maQuiet('debugGrant', 500);
            else
              mutate((s) => {
                s.progress.xp += 500;
              });
          }}
        >
          +500 XP
        </Button>
      </div>
      <div className="dbg__scale">
        <span className="caps">Time scale</span>
        <Segmented size="sm" value={scale} options={TIME_SCALES.map((v) => ({ value: v, label: `×${v}` }))} onChange={(v) => safe(() => sim.setTimeScale(v))} />
      </div>
      <div className="dbg__events">
        <div className="dbg__events-head">
          <span className="caps">Events</span>
          <input className="dbg__filter mono" value={filter} placeholder="filter…" onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
          <button type="button" className="dbg__dump" onClick={() => console.log('[labsim] state', store.getState())}>
            dump state
          </button>
        </div>
        <ol className="mono">
          {events
            .slice()
            .reverse()
            .map((e, i) => (
              <li key={`${e.at}-${i}`} title={JSON.stringify(e.payload)}>
                <span className="dim">{gameClockSeconds(e.at)}</span> {e.type} <span className="dim">{abbreviate(e.payload)}</span>
              </li>
            ))}
        </ol>
      </div>
    </aside>
  );
}

function abbreviate(p: unknown): string {
  try {
    const s = JSON.stringify(p);
    return s.length > 70 ? `${s.slice(0, 70)}…` : s;
  } catch {
    return '';
  }
}
