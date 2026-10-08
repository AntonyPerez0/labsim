/**
 * Small HUD widgets: game clock + time scale, sticky banners, one-time control hints (GP §6.2),
 * inspect callouts, and the "click to resume" veil when the pointer is free during play.
 */
import { useEffect, useState } from 'react';
import { emit, useGame } from '@/core/store';
import { MODULES_BY_ID } from '@/content';
import { Icon, Kbd } from '@/ui/kit';
import { gameClock } from '@/ui/services/format';

const MODE_LABEL: Record<string, string> = {
  menu: 'Lab',
  academy: 'Academy',
  'arcade-shift': 'Shift',
  'arcade-drill': 'Drill',
  freeplay: 'Free Play',
  'arcade-weakspot': 'Weak Spot',
  certification: 'Certification',
};

export function GameClock() {
  const clock = useGame((s) => gameClock(s.lab.time.nowMs));
  const dateLabel = useGame((s) => s.lab.time.dateLabel);
  const scale = useGame((s) => s.lab.time.timeScale);
  const mode = useGame((s) => s.session.mode);
  const activityId = useGame((s) => s.session.activityId);
  const realism = useGame((s) => s.session.realism);
  const meta = mode === 'academy' && activityId ? MODULES_BY_ID[activityId] : null;
  return (
    <div className="hud-clock">
      <div className="hud-clock__time tnum">{clock}</div>
      <div className="hud-clock__meta">
        <span>{dateLabel || 'MON, OCT 5'}</span>
        {scale !== 1 ? (
          <span className="hud-clock__scale" title="Game time runs faster than real time">
            <Icon name="fast-forward" size={10} /> ×{scale}
          </span>
        ) : null}
      </div>
      <div className="hud-clock__mode">
        <span className="hud-clock__dot" />
        {MODE_LABEL[mode] ?? mode}
        {meta ? <span className="mono"> · {meta.id}</span> : null}
        {realism === 'strict' ? <span className="hud-clock__strict">Strict</span> : null}
      </div>
    </div>
  );
}

export function Banners() {
  const banners = useGame((s) => s.ui.banners);
  const clockS = useGame((s) => Math.floor(s.session.clockS));
  const live = banners.filter((b) => b.untilS === null || b.untilS > clockS);
  if (!live.length) return null;
  return (
    <div className="hud-banners">
      {live.map((b) => (
        <div key={b.id} className={`hud-banner hud-banner--${b.kind}`}>
          <Icon name={b.kind === 'info' ? 'info' : 'alert'} size={14} />
          <span>{b.text}</span>
        </div>
      ))}
    </div>
  );
}

/** The hint object last shown: the HUD remounts after every overlay, and a prompt must not replay then. */
let lastShownHint: object | null = null;

export function ControlHintBar() {
  const hint = useGame((s) => s.ui.controlHint);
  const [visibleId, setVisibleId] = useState<string | null>(null);
  useEffect(() => {
    if (!hint) {
      setVisibleId(null);
      return;
    }
    if (hint === lastShownHint) return;
    lastShownHint = hint;
    setVisibleId(hint.id);
    emit('ui.controlHintShown', { hintId: hint.id });
    const t = setTimeout(() => setVisibleId(null), 3200);
    return () => clearTimeout(t);
  }, [hint]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!hint || visibleId !== hint.id) return null;
  return (
    <div className="hud-controlhint" key={hint.id}>
      {hint.keys.map((k) => (
        <Kbd key={k} k={k} tone="green" />
      ))}
      <span>{hint.text}</span>
    </div>
  );
}

export function Callouts() {
  const callouts = useGame((s) => s.ui.callouts);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const key = callouts ? `${callouts.propId}|${callouts.lines.join('|')}` : null;
  useEffect(() => {
    if (!key) return;
    setShownFor(key);
    const t = setTimeout(() => setShownFor(null), 4200);
    return () => clearTimeout(t);
  }, [key]);
  if (!callouts || shownFor !== key) return null;
  return (
    <div className="hud-callouts" key={key}>
      {callouts.lines.slice(0, 4).map((l, i) => (
        <div key={i} className="hud-callout" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="hud-callout__tick" />
          {l}
        </div>
      ))}
    </div>
  );
}

/** Shown when the 3D view is active but the mouse is free (after Esc / alt-tab / closing a menu). */
export function ClickToResume() {
  return (
    <div className="hud-resume">
      <div className="hud-resume__card">
        <Icon name="target" size={18} />
        <span>
          Click to look around · <Kbd k="Esc" size="sm" /> menu
        </span>
      </div>
    </div>
  );
}
