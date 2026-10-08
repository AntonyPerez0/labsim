/**
 * Arcade Shift HUD (GP §2.3, §5.2): shift clock, heat, "Next health check", score with floating
 * pop-ups, combo meter (8 segments, glow at ≥ 4, shatter on break), strikes, and the pipeline strip.
 */
import { useEffect, useRef, useState } from 'react';
import { bus } from '@/core/bus';
import { store, useGame } from '@/core/store';
import { Icon, Meter } from '@/ui/kit';
import { mmss, num, signed } from '@/ui/services/format';
import { HEAT_LABELS } from '@/ui/data/catalog';

interface Pop {
  id: number;
  text: string;
  tone: 'good' | 'bad';
}

function useScorePops(): Pop[] {
  const [pops, setPops] = useState<Pop[]>([]);
  const seq = useRef(0);
  useEffect(() => {
    const add = (text: string, tone: Pop['tone']) => {
      const id = ++seq.current;
      setPops((p) => [...p.slice(-4), { id, text, tone }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1700);
    };
    const offScore = bus.on('shift.scoreChanged', (e) => {
      if (!e.delta) return;
      if (e.delta > 0) {
        const mult = e.ticketId ? currentMultiplier() : null;
        add(`${signed(e.delta)}${mult && mult > 1 ? `  ×${mult.toFixed(2)}` : ''}`, 'good');
      } else add(`${signed(e.delta)} · ${e.reason}`, 'bad');
    });
    return () => offScore();
  }, []);
  return pops;
}

function currentMultiplier(): number {
  return store.getState().session.shift?.multiplier ?? 1;
}

export function ShiftBar() {
  const shift = useGame((s) => s.session.shift);
  const pops = useScorePops();
  const [broken, setBroken] = useState(false);
  useEffect(
    () =>
      bus.on('shift.comboChanged', (e) => {
        if (e.reset) {
          setBroken(true);
          setTimeout(() => setBroken(false), 500);
        }
      }),
    [],
  );
  if (!shift) return null;
  const left = Math.max(0, shift.durationS - shift.elapsedS);
  const low = left <= 30;
  const comboFilled = Math.min(8, shift.combo);
  const strikesMax = shift.rules.strikesToEnd ?? 3;
  const hc = Math.max(0, shift.nextHealthCheckInS);

  return (
    <div className={`hud-shiftbar${shift.combo >= 4 ? ' is-hot' : ''}`}>
      <div className="hud-shiftbar__cell hud-shiftbar__time">
        <span className="hud-shiftbar__label">{shift.kind === 'daily' ? 'Daily' : shift.kind === 'full' ? 'Full Shift' : shift.kind === 'certification' ? 'Practical' : 'Shift'}</span>
        <span className={`hud-shiftbar__clock tnum${low ? ' is-low' : ''}`}>{mmss(left)}</span>
      </div>
      <div className="hud-shiftbar__cell" title={`Heat H${shift.heat} — ${HEAT_LABELS[shift.heat]} (cap H${shift.heatCap})`}>
        <span className="hud-shiftbar__label">
          <Icon name="heat" size={11} /> Heat
        </span>
        <span className="hud-heat">
          {[1, 2, 3, 4, 5].map((h) => (
            <span key={h} className={`hud-heat__pip hud-heat__pip--${h}${h <= shift.heat ? ' is-on' : ''}${h > shift.heatCap ? ' is-capped' : ''}`} />
          ))}
          <span className="hud-heat__label">H{shift.heat}</span>
        </span>
      </div>
      <div className="hud-shiftbar__cell hud-shiftbar__hc" title="Orca pings every Pi every 5 game minutes. Fixes only show in Orca after the next health check.">
        <span className="hud-shiftbar__label">Next health check</span>
        <span className={`hud-shiftbar__value tnum${hc <= 5 ? ' is-imminent' : ''}`}>
          <Icon name="refresh" size={12} /> {mmss(hc)}
        </span>
      </div>
      <div className="hud-shiftbar__cell hud-shiftbar__score">
        <span className="hud-shiftbar__label">Score</span>
        <span className="hud-shiftbar__points tnum">{shift.rules.scoring ? num(shift.score) : '—'}</span>
        <div className="hud-pops">
          {pops.map((p) => (
            <span key={p.id} className={`hud-pop hud-pop--${p.tone}`}>
              {p.text}
            </span>
          ))}
        </div>
      </div>
      {shift.rules.scoring ? (
        <div className="hud-shiftbar__cell" title="Combo: +1 per clean, fast, correctly diagnosed ticket. Max ×3.0 at combo 8.">
          <span className="hud-shiftbar__label">Combo</span>
          <span className="hud-combo">
            <Meter total={8} filled={comboFilled} tone={shift.combo >= 8 ? 'gold' : 'green'} size="sm" broken={broken} />
            <span className={`hud-combo__mult tnum${shift.combo >= 4 ? ' is-hot' : ''}`}>×{shift.multiplier.toFixed(2)}</span>
          </span>
        </div>
      ) : null}
      <div className="hud-shiftbar__cell" title={`${strikesMax} strikes end the shift`}>
        <span className="hud-shiftbar__label">Strikes</span>
        <span className="hud-strikes">
          {Array.from({ length: strikesMax }, (_, i) => (
            <span key={i} className={`hud-strike${i < shift.strikes ? ' is-on' : ''}`}>
              <Icon name="x" size={12} stroke={3} />
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

const PIPE_LABEL: Record<string, string> = {
  PL1: 'regression-flex',
  PL2: 'tethered-tax',
  PL3: 'sale-swipe',
  PL4: 'regression-mini',
  PL5: 'canada-pin',
  PL6: 'go-sdk-smoke',
  PL7: 'duo-cfd',
  PL8: 'paycore-matrix',
};

/** Bottom-left pipeline strip (GP §2.3.5). */
export function PipelineStrip() {
  const pipelines = useGame((s) => s.session.shift?.pipelines);
  const uptime = useGame((s) => s.session.shift?.uptime);
  if (!pipelines || !pipelines.length) return null;
  const active = pipelines.filter((p) => p.active);
  if (!active.length) return null;
  const up = uptime && uptime.attempts ? uptime.gotRig / uptime.attempts : 1;
  return (
    <div className="hud-pipes">
      <div className="hud-pipes__head">
        <Icon name="pipeline" size={13} />
        <span>Pipelines</span>
        <span className="spacer" />
        <span className={`hud-pipes__uptime tnum${up >= 0.95 ? ' ok' : up >= 0.85 ? '' : ' warn'}`}>Uptime {Math.round(up * 100)}%</span>
      </div>
      <div className="hud-pipes__list">
        {active.map((p) => {
          const state = p.phase === 'running' ? 'running' : p.phase === 'blocked' ? 'blocked' : p.lastResult === 'FAILURE' ? 'red' : p.lastResult === 'SUCCESS' ? 'green' : 'waiting';
          return (
            <div key={p.id} className={`hud-pipe hud-pipe--${state}`} title={`${p.job}${p.lastConsoleLine ? `\n${p.lastConsoleLine}` : ''}`}>
              <span className="hud-pipe__bubble">{state === 'running' ? <span className="hud-pipe__spin" /> : state === 'green' ? <Icon name="check" size={10} stroke={3} /> : state === 'red' ? <Icon name="x" size={10} stroke={3} /> : state === 'blocked' ? <Icon name="minus" size={10} stroke={3} /> : null}</span>
              <span className="hud-pipe__id mono">{p.id}</span>
              <span className="hud-pipe__name">{PIPE_LABEL[p.id] ?? p.job}</span>
              {p.robot || p.lastRobot ? <span className="hud-pipe__rig mono">{(p.robot ?? p.lastRobot)!.toUpperCase()}</span> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
