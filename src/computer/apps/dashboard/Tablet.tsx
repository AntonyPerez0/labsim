/**
 * `TabletDashboard` — the zoomed status-tablet overlay (Apps §10.7): the room stays visible (dimmed),
 * a dark bezel holds the 1280 × 800 surface at ~80 % of the viewport height. `Esc` / `✕ Close (Esc)` →
 * `onExit`, else overlay `none` + `engine.releaseFocus()`. USB reachability (`host='tablet'`).
 */
import { useEffect, useState } from 'react';
import { exitOverlay } from '../../shell/boot';
import { DashboardSurface } from './Surface';
import './dashboard.css';

function useViewportScale(): number {
  const calc = () => {
    if (typeof window === 'undefined') return 0.6;
    const h = window.innerHeight * 0.8 - 48;
    const w = window.innerWidth * 0.92 - 48;
    return Math.max(0.25, Math.min(h / 800, w / 1280));
  };
  const [k, setK] = useState(calc);
  useEffect(() => {
    const on = () => setK(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return k;
}

export function TabletDashboard(props: { robotId: string; onExit?: () => void }) {
  const { robotId, onExit } = props;
  const k = useViewportScale();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setTimeout(() => {
        if (!e.defaultPrevented) exitOverlay(onExit, false);
      }, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);
  return (
    <div className="rdash-overlay" data-app="tablet" role="dialog" aria-label={`${robotId.toUpperCase()} status tablet`}>
      <button type="button" className="rdash-close" onClick={() => exitOverlay(onExit, false)}>
        ✕ Close (Esc)
      </button>
      <div className="rdash-bezel">
        <span className="rdash-camdot" aria-hidden="true" />
        <div className="rdash-glass" style={{ width: 1280 * k, height: 800 * k }}>
          <div style={{ width: 1280, height: 800, transform: `scale(${k})`, transformOrigin: '0 0' }}>
            <DashboardSurface robotId={robotId} host="tablet" keyboard />
          </div>
        </div>
      </div>
    </div>
  );
}
